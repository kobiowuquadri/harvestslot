import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

/** Interactive-transaction client handed to `$transaction(async (tx) => …)`. */
export type Tx = Prisma.TransactionClient;
/** Either the root client or a transaction client. */
export type Db = PrismaClient | Tx;

export interface CreatePrismaClientOptions {
  url: string;
  poolMax?: number;
  applicationName?: string;
  onPoolError?: (err: Error) => void;
}

/**
 * Prisma 7 requires a driver adapter. Connection pool limits are set explicitly because node-postgres
 * defaults differ from Prisma 6 (no connection timeout by default).
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg(
    {
      connectionString: options.url,
      max: options.poolMax ?? 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      application_name: options.applicationName ?? 'harvestslot',
    },
    { onPoolError: options.onPoolError },
  );
  return new PrismaClient({
    adapter,
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });
}

const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']);

/** True for serialisation failures, deadlocks and Prisma write conflicts that are safe to retry. */
export function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034') return true;
    const meta = error.meta as Record<string, unknown> | undefined;
    const code = (meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined)?.cause?.originalCode;
    if (code && RETRYABLE_SQLSTATES.has(code)) return true;
  }
  const code = sqlState(error);
  return code !== undefined && RETRYABLE_SQLSTATES.has(code);
}

/** Best-effort extraction of the PostgreSQL SQLSTATE from Prisma/driver-adapter errors. */
export function sqlState(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const obj = current as Record<string, unknown>;
    for (const key of ['originalCode', 'code']) {
      const v = obj[key];
      if (typeof v === 'string' && /^[0-9A-Z]{5}$/.test(v)) return v;
    }
    const meta = obj.meta as Record<string, unknown> | undefined;
    if (meta?.driverAdapterError) {
      current = meta.driverAdapterError;
      continue;
    }
    current = obj.cause;
  }
  return undefined;
}

/** Name of the violated constraint, when the error carries one. */
export function violatedConstraint(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const obj = current as Record<string, unknown>;
    if (typeof obj.constraint === 'string') return obj.constraint;
    const meta = obj.meta as Record<string, unknown> | undefined;
    if (meta) {
      if (typeof meta.constraint === 'string') return meta.constraint;
      const target = meta.target;
      if (Array.isArray(target)) return target.join(',');
      if (typeof target === 'string') return target;
      if (meta.driverAdapterError) {
        current = meta.driverAdapterError;
        continue;
      }
    }
    current = obj.cause;
  }
  if (error instanceof Error) {
    const m = /constraint "([^"]+)"/.exec(error.message);
    if (m) return m[1];
  }
  return undefined;
}
