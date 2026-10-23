import type { Db } from '@harvestslot/db';

const SEQUENCES = {
  harvest: { seq: 'harvest_ref_seq', prefix: 'HR' },
  booking: { seq: 'booking_ref_seq', prefix: 'HSB' },
  invoice: { seq: 'invoice_number_seq', prefix: 'INV' },
  dispute: { seq: 'dispute_ref_seq', prefix: 'DSP' },
} as const;

/** Human-friendly sequential references, e.g. HSB-001042. Sequences never roll back, so gaps are expected. */
export async function nextReference(db: Db, kind: keyof typeof SEQUENCES): Promise<string> {
  const { seq, prefix } = SEQUENCES[kind];
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT nextval('${seq}')::bigint AS n`);
  return `${prefix}-${rows[0]!.n.toString().padStart(6, '0')}`;
}
