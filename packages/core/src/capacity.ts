import { gramsToKgString, toGrams, type SlotUsage } from '@harvestslot/contracts';
import type { Db } from '@harvestslot/db';

export interface SlotUsageGrams {
  limitG: bigint;
  processingG: bigint;
  purchaseLimitG: bigint;
  heldG: bigint;
  committedG: bigint;
  consumedG: bigint;
  usedG: bigint;
  availableG: bigint;
}

interface UsageRow {
  slotId: string;
  processingCapacityKg: string;
  purchaseLimitKg: string;
  held: string;
  committed: string;
  consumed: string;
}

/**
 * Capacity usage per slot, computed from reservations at `now`:
 * used = CONFIRMED + CONSUMED + HELD with expires_at > now. Expired holds are excluded here even if
 * the expiry sweeper has not yet marked them, so correctness does not depend on the worker.
 * Effective limit = min(processing capacity, purchase limit).
 */
export async function slotUsageMany(db: Db, slotIds: readonly string[], now: Date): Promise<Map<string, SlotUsageGrams>> {
  const result = new Map<string, SlotUsageGrams>();
  if (slotIds.length === 0) return result;
  const rows = await db.$queryRaw<UsageRow[]>`
    SELECT s.id AS "slotId",
           s."processingCapacityKg"::text AS "processingCapacityKg",
           s."purchaseLimitKg"::text AS "purchaseLimitKg",
           COALESCE(SUM(r."quantityKg") FILTER (WHERE r.status = 'HELD' AND r."expiresAt" > ${now}), 0)::text AS held,
           COALESCE(SUM(r."quantityKg") FILTER (WHERE r.status = 'CONFIRMED'), 0)::text AS committed,
           COALESCE(SUM(r."quantityKg") FILTER (WHERE r.status = 'CONSUMED'), 0)::text AS consumed
      FROM processing_slots s
      LEFT JOIN reservations r ON r."slotId" = s.id
     WHERE s.id = ANY(${Array.from(new Set(slotIds))}::uuid[])
     GROUP BY s.id`;
  for (const row of rows) {
    const processingG = toGrams(row.processingCapacityKg);
    const purchaseLimitG = toGrams(row.purchaseLimitKg);
    const limitG = processingG < purchaseLimitG ? processingG : purchaseLimitG;
    const heldG = toGrams(row.held);
    const committedG = toGrams(row.committed);
    const consumedG = toGrams(row.consumed);
    const usedG = heldG + committedG + consumedG;
    result.set(row.slotId, {
      limitG,
      processingG,
      purchaseLimitG,
      heldG,
      committedG,
      consumedG,
      usedG,
      availableG: limitG > usedG ? limitG - usedG : 0n,
    });
  }
  return result;
}

export async function slotUsage(db: Db, slotId: string, now: Date): Promise<SlotUsageGrams> {
  const usage = (await slotUsageMany(db, [slotId], now)).get(slotId);
  if (!usage) throw new Error(`Slot ${slotId} not found`);
  return usage;
}

export function usageDto(u: SlotUsageGrams): SlotUsage {
  return {
    limitKg: gramsToKgString(u.limitG),
    heldKg: gramsToKgString(u.heldG),
    committedKg: gramsToKgString(u.committedG),
    consumedKg: gramsToKgString(u.consumedG),
    availableKg: gramsToKgString(u.availableG),
  };
}

/**
 * Supply allocated from harvest requests: harvest lots not released, excluding lots whose booking is
 * still pre-confirmation with an expired hold (they will be released by the sweeper or the next writer).
 */
export async function requestAllocationMany(db: Db, requestIds: readonly string[], now: Date): Promise<Map<string, bigint>> {
  const result = new Map<string, bigint>();
  if (requestIds.length === 0) return result;
  const rows = await db.$queryRaw<{ requestId: string; allocated: string }[]>`
    SELECT l."harvestRequestId" AS "requestId", COALESCE(SUM(l."quantityKg"), 0)::text AS allocated
      FROM harvest_lots l
      JOIN bookings b ON b.id = l."bookingId"
      LEFT JOIN reservations r ON r."bookingId" = b.id
     WHERE l."harvestRequestId" = ANY(${Array.from(new Set(requestIds))}::uuid[])
       AND l.status <> 'RELEASED'
       AND NOT (b.status IN ('DRAFT', 'AWAITING_CONFIRMATIONS') AND r.status = 'HELD' AND r."expiresAt" <= ${now})
     GROUP BY l."harvestRequestId"`;
  for (const id of requestIds) result.set(id, 0n);
  for (const row of rows) result.set(row.requestId, toGrams(row.allocated));
  return result;
}

export async function requestAllocation(db: Db, requestId: string, now: Date): Promise<bigint> {
  return (await requestAllocationMany(db, [requestId], now)).get(requestId) ?? 0n;
}

export function allocationState(eligibleG: bigint, allocatedG: bigint): 'UNALLOCATED' | 'PARTIAL' | 'FULL' {
  if (allocatedG <= 0n) return 'UNALLOCATED';
  return allocatedG >= eligibleG ? 'FULL' : 'PARTIAL';
}
