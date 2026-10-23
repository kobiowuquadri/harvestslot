import { isRetryableTransactionError, Prisma, type PrismaClient, type Tx } from '@harvestslot/db';

export interface TxContext {
  /** Runs after a successful commit (never inside the transaction, never on rollback). */
  afterCommit(fn: () => void | Promise<void>): void;
}

export interface TransactionOptions {
  retries?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` in an interactive transaction (READ COMMITTED + explicit row locks by default), retrying
 * a bounded number of times on deadlocks / serialisation failures. External providers must be called
 * from `ctx.afterCommit`, never while locks are held.
 */
export async function withTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: Tx, ctx: TxContext) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    const hooks: Array<() => void | Promise<void>> = [];
    const ctx: TxContext = { afterCommit: (h) => void hooks.push(h) };
    try {
      const result = await prisma.$transaction((tx) => fn(tx, ctx), {
        isolationLevel: options.isolationLevel ?? Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: options.timeoutMs ?? 20_000,
      });
      for (const hook of hooks) {
        try {
          await hook();
        } catch (error) {
          // After-commit work is best-effort (e.g. nudging a queue); the committed state is authoritative.
          console.error('afterCommit hook failed', error);
        }
      }
      return result;
    } catch (error) {
      if (attempt < retries && isRetryableTransactionError(error)) {
        await sleep(20 * 2 ** attempt + Math.floor(Math.random() * 25));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Lockable tables in the global lock order. Every transaction that locks more than one of these must
 * acquire them in this order to rule out deadlocks between business operations.
 */
export const LOCK_ORDER = [
  'harvest_requests',
  'processing_slots',
  'offers',
  'bookings',
  'vehicles',
  'drivers',
  'shipments',
  'receiving_records',
  'invoices',
  'disputes',
  'transport_quotes',
  'farmer_profiles',
  'organisations',
  'users',
] as const;
export type LockableTable = (typeof LOCK_ORDER)[number];

/** `SELECT … FOR UPDATE` on one row. Returns false when the row does not exist. */
export async function lockRow(tx: Tx, table: LockableTable, id: string): Promise<boolean> {
  if (!LOCK_ORDER.includes(table)) throw new Error(`Table ${table} is not lockable`);
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "${table}" WHERE id = $1::uuid FOR UPDATE`, id);
  return rows.length === 1;
}

/** Locks several rows of one table in ascending id order (deterministic). */
export async function lockRows(tx: Tx, table: LockableTable, ids: readonly string[]): Promise<number> {
  if (!LOCK_ORDER.includes(table)) throw new Error(`Table ${table} is not lockable`);
  const unique = Array.from(new Set(ids)).sort();
  if (unique.length === 0) return 0;
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "${table}" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    unique,
  );
  return rows.length;
}

/** Updates a row only if its optimistic version matches, bumping the version. Returns false on mismatch. */
export function versionWhere<T extends { id: string }>(id: string, expectedVersion: number): T & { version: number } {
  return { id, version: expectedVersion } as T & { version: number };
}
