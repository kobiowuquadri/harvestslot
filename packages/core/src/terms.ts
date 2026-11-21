import { createHash } from 'node:crypto';
import type { BookingParty, BookingTermsContent } from '@harvestslot/contracts';

/** JSON with recursively sorted keys, so equal content always hashes equally. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function hashTerms(content: BookingTermsContent): string {
  return createHash('sha256').update(canonicalJson(content)).digest('hex');
}

function within(inner: { start: string; end: string }, outer: { start: string; end: string }): boolean {
  return new Date(inner.start) >= new Date(outer.start) && new Date(inner.end) <= new Date(outer.end);
}

/**
 * The parts of the terms each party has agreed to. If a party's projection is unchanged between two
 * versions, their confirmation is carried forward (recorded as CARRIED_FORWARD); otherwise they must
 * confirm again.
 */
export function materialProjection(party: BookingParty, c: BookingTermsContent): unknown {
  switch (party) {
    case 'FARMER':
      return {
        quantityKg: c.quantityKg,
        priceKoboPerKg: c.priceKoboPerKg,
        plannedHarvestDate: c.harvest.plannedHarvestDate,
        pickupWindow: c.pickupWindow,
        qualityTerms: c.qualityTerms,
        toleranceBps: c.toleranceBps,
        paymentTermsDays: c.paymentTermsDays,
        cancellationTerms: c.cancellationTerms,
        rejectionHandling: c.rejectionHandling,
        freightPayer: c.freightPayer,
        farmerFreightKobo: c.freightPayer === 'FARMER' ? (c.transport?.priceKobo ?? null) : null,
        handover: c.handover ?? null,
        // Transport inside the agreed pickup window changes nothing for the farmer.
        transportPickup: c.transport && !within(c.transport.pickupWindow, c.pickupWindow) ? c.transport.pickupWindow : 'WITHIN_AGREED_WINDOW',
      };
    case 'PROCESSOR':
      return {
        quantityKg: c.quantityKg,
        priceKoboPerKg: c.priceKoboPerKg,
        slotId: c.slot.id,
        deliveryWindow: c.deliveryWindow,
        qualityTerms: c.qualityTerms,
        toleranceBps: c.toleranceBps,
        paymentTermsDays: c.paymentTermsDays,
        cancellationTerms: c.cancellationTerms,
        rejectionHandling: c.rejectionHandling,
        freightPayer: c.freightPayer,
        processorFreightKobo: c.freightPayer === 'PROCESSOR' ? (c.transport?.priceKobo ?? null) : null,
        handover: c.handover ? { arrangement: c.handover.arrangement, place: c.handover.place, window: c.handover.window } : null,
        platformFee: c.platformFee,
        transportDelivery: c.transport && !within(c.transport.deliveryWindow, c.deliveryWindow) ? c.transport.deliveryWindow : 'WITHIN_AGREED_WINDOW',
      };
    case 'TRANSPORTER':
      return c.transport
        ? {
            transport: c.transport,
            quantityKg: c.quantityKg,
            pickupLocation: c.harvest.pickupLocationLabel,
            facilityId: c.facility.id,
          }
        : null;
    case 'ADMIN':
      return null;
  }
}

export function materialChanged(party: BookingParty, previous: BookingTermsContent, next: BookingTermsContent): boolean {
  return canonicalJson(materialProjection(party, previous)) !== canonicalJson(materialProjection(party, next));
}

/** Parties whose confirmation the version needs. */
export function requiredParties(content: BookingTermsContent): BookingParty[] {
  return content.transport ? ['FARMER', 'PROCESSOR', 'TRANSPORTER'] : ['FARMER', 'PROCESSOR'];
}

const FIELD_LABELS: Record<string, string> = {
  quantityKg: 'Quantity',
  priceKoboPerKg: 'Price per kg',
  estimatedProduceAmountKobo: 'Estimated produce amount',
  toleranceBps: 'Quantity tolerance',
  qualityTerms: 'Quality requirements',
  pickupWindow: 'Pickup window',
  deliveryWindow: 'Delivery window',
  paymentTermsDays: 'Payment terms',
  cancellationTerms: 'Cancellation terms',
  rejectionHandling: 'Rejected produce handling',
  freightPayer: 'Who pays transport',
  transport: 'Transport',
  handover: 'How the produce gets there',
  platformFee: 'Platform fee',
  slot: 'Processing slot',
  harvest: 'Harvest date / pickup location',
};

/** Human-readable list of changed sections between two versions. */
export function changedFields(previous: BookingTermsContent | null, next: BookingTermsContent): string[] {
  if (!previous) return [];
  const keys = Object.keys(FIELD_LABELS) as Array<keyof BookingTermsContent>;
  return keys.filter((k) => canonicalJson(previous[k]) !== canonicalJson(next[k])).map((k) => FIELD_LABELS[k as string]!);
}
