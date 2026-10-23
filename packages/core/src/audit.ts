import type { Db, Prisma } from '@harvestslot/db';
import type { Actor, FarmerAuthority } from './actor.js';

export interface AuditInput {
  actor?: Actor | null;
  actorParty?: string;
  farmer?: FarmerAuthority;
  organisationId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  data?: Prisma.InputJsonValue;
}

const SECRET_KEYS = /pass(word)?|secret|token|otp|code|authorization|cookie/i;

/** Removes values whose keys look secret before they are persisted in the audit log. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : redact(v)]),
    );
  }
  return value;
}

/** Append-only audit event (a DB trigger forbids UPDATE/DELETE). Always written in the business transaction. */
export async function audit(db: Db, input: AuditInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorUserId: input.actor?.userId ?? null,
      actorParty: input.actorParty ?? (input.actor?.platformRole === 'ADMIN' ? 'ADMIN' : null),
      actingForFarmerId: input.farmer && input.farmer.mode === 'DELEGATE' ? input.farmer.farmerProfileId : null,
      delegationId: input.farmer && input.farmer.mode === 'DELEGATE' ? input.farmer.delegationId : null,
      organisationId: input.organisationId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason ?? null,
      data: input.data === undefined ? undefined : (redact(input.data) as Prisma.InputJsonValue),
      requestId: input.actor?.requestId ?? null,
      ip: input.actor?.ip ?? null,
    },
  });
}
