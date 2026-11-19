import { describe, expect, it } from 'vitest';
import type { BookingTermsContent } from '@harvestslot/contracts';
import { DomainError } from '../src/errors.js';
import {
  BOOKING_MACHINE,
  DISPUTE_MACHINE,
  OFFER_MACHINE,
  RECEIVING_MACHINE,
  SHIPMENT_MACHINE,
  allowedActions,
  canTransition,
  transition,
} from '../src/state.js';
import { canonicalJson, changedFields, hashTerms, materialChanged, requiredParties } from '../src/terms.js';

describe('booking state machine', () => {
  it('follows DRAFT → AWAITING_CONFIRMATIONS → CONFIRMED → ACTIVE → COMPLETED', () => {
    let s = transition(BOOKING_MACHINE, 'DRAFT', 'approve');
    expect(s).toBe('AWAITING_CONFIRMATIONS');
    s = transition(BOOKING_MACHINE, s, 'confirm');
    expect(s).toBe('CONFIRMED');
    s = transition(BOOKING_MACHINE, s, 'startHarvest');
    expect(s).toBe('ACTIVE');
    expect(transition(BOOKING_MACHINE, s, 'complete')).toBe('COMPLETED');
  });
  it('cancels only before harvest starts and expires only before confirmation', () => {
    expect(canTransition(BOOKING_MACHINE, 'CONFIRMED', 'cancel')).toBe(true);
    expect(canTransition(BOOKING_MACHINE, 'ACTIVE', 'cancel')).toBe(false);
    expect(canTransition(BOOKING_MACHINE, 'AWAITING_CONFIRMATIONS', 'expire')).toBe(true);
    expect(canTransition(BOOKING_MACHINE, 'CONFIRMED', 'expire')).toBe(false);
  });
  it('rejects invalid transitions with a stable error code', () => {
    try {
      transition(BOOKING_MACHINE, 'COMPLETED', 'cancel', 'booking');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe('INVALID_STATE_TRANSITION');
      expect((e as DomainError).status).toBe(409);
    }
    expect(() => transition(BOOKING_MACHINE, 'AWAITING_CONFIRMATIONS', 'startHarvest')).toThrow(DomainError);
    expect(() => transition(BOOKING_MACHINE, 'EXPIRED', 'confirm')).toThrow(DomainError);
  });
  it('terminal states allow nothing', () => {
    expect(allowedActions(BOOKING_MACHINE, 'COMPLETED')).toEqual([]);
    expect(allowedActions(BOOKING_MACHINE, 'CANCELLED')).toEqual([]);
    expect(allowedActions(BOOKING_MACHINE, 'EXPIRED')).toEqual([]);
  });
});

describe('other state machines', () => {
  it('offers: farmer accepts an open offer, processor accepts a counter', () => {
    expect(transition(OFFER_MACHINE, 'OPEN', 'accept')).toBe('ACCEPTED');
    expect(canTransition(OFFER_MACHINE, 'OPEN', 'acceptCounter')).toBe(false);
    expect(transition(OFFER_MACHINE, 'COUNTERED', 'acceptCounter')).toBe('ACCEPTED');
    expect(canTransition(OFFER_MACHINE, 'COUNTERED', 'accept')).toBe(false);
    expect(canTransition(OFFER_MACHINE, 'ACCEPTED', 'withdraw')).toBe(false);
  });
  it('shipments cannot skip pickup confirmation', () => {
    expect(canTransition(SHIPMENT_MACHINE, 'COLLECTED', 'leavePickup')).toBe(false);
    expect(transition(SHIPMENT_MACHINE, 'COLLECTED', 'confirmPickup')).toBe('PICKUP_CONFIRMED');
    expect(canTransition(SHIPMENT_MACHINE, 'IN_TRANSIT', 'cancel')).toBe(false);
    expect(canTransition(SHIPMENT_MACHINE, 'ARRIVED_AT_FACILITY', 'confirmDelivery')).toBe(true);
  });
  it('receiving reviews escalate rather than auto-accept', () => {
    expect(transition(RECEIVING_MACHINE, 'AWAITING_FARMER_REVIEW', 'escalate')).toBe('REVIEW_OVERDUE');
    expect(canTransition(RECEIVING_MACHINE, 'REVIEW_OVERDUE', 'submitNoDiscrepancy')).toBe(false);
    expect(transition(RECEIVING_MACHINE, 'DISPUTED', 'resolve')).toBe('FINAL');
  });
  it('disputes', () => {
    expect(transition(DISPUTE_MACHINE, 'OPEN', 'respond')).toBe('UNDER_REVIEW');
    expect(canTransition(DISPUTE_MACHINE, 'RESOLVED', 'withdraw')).toBe(false);
  });
});

function terms(overrides: Partial<BookingTermsContent> = {}): BookingTermsContent {
  return {
    schemaVersion: 1,
    bookingReference: 'HSB-001001',
    farmer: { farmerProfileId: '0190a000-0000-7000-8000-000000000001', displayName: 'Adunni Demo' },
    processor: { organisationId: '0190a000-0000-7000-8000-000000000002', name: 'Demo Processor' },
    facility: { id: '0190a000-0000-7000-8000-000000000003', name: 'Akinyele Garri Works', lga: 'Akinyele', address: null },
    line: { id: '0190a000-0000-7000-8000-000000000004', name: 'Line A', product: 'GARRI' },
    slot: { id: '0190a000-0000-7000-8000-000000000005', startsAt: '2026-11-03T07:00:00.000Z', endsAt: '2026-11-03T15:00:00.000Z' },
    harvest: {
      harvestRequestId: '0190a000-0000-7000-8000-000000000006',
      reference: 'HR-001001',
      plannedHarvestDate: '2026-11-02',
      pickupLocationLabel: 'Main farm',
      pickupLga: 'Akinyele',
    },
    quantityKg: '2000.000',
    priceKoboPerKg: 25_000,
    estimatedProduceAmountKobo: 50_000_000,
    toleranceBps: 500,
    qualityTerms: { maxHoursHarvestToDelivery: 48, soilAndStemsRemoved: true, varietiesAccepted: [] },
    pickupWindow: { start: '2026-11-02T13:00:00.000Z', end: '2026-11-02T17:00:00.000Z' },
    deliveryWindow: { start: '2026-11-03T07:00:00.000Z', end: '2026-11-03T12:00:00.000Z' },
    paymentTermsDays: 7,
    invoiceDueRule: 'Due 7 days after the receiving decision is final',
    cancellationTerms: 'Either party may cancel before harvest starts.',
    rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
    freightPayer: 'PROCESSOR',
    transport: null,
    platformFee: { enabled: true, bps: 150, payer: 'PROCESSOR', estimatedKobo: 750_000 },
    ...overrides,
  };
}

const transport = (overrides: Partial<NonNullable<BookingTermsContent['transport']>> = {}): NonNullable<BookingTermsContent['transport']> => ({
  quoteId: '0190a000-0000-7000-8000-000000000007',
  transporterOrgId: '0190a000-0000-7000-8000-000000000008',
  transporterName: 'Demo Haulage',
  vehicleId: '0190a000-0000-7000-8000-000000000009',
  vehiclePlate: 'OYO-123-AB',
  vehicleType: 'MEDIUM_TRUCK',
  vehicleCapacityKg: '5000.000',
  pickupWindow: { start: '2026-11-02T14:00:00.000Z', end: '2026-11-02T16:00:00.000Z' },
  deliveryWindow: { start: '2026-11-03T07:00:00.000Z', end: '2026-11-03T10:00:00.000Z' },
  priceKobo: 3_500_000,
  freightPayer: 'PROCESSOR',
  includedServices: ['LOADING'],
  cancellationTerms: 'Free cancellation up to 12 h before pickup.',
  ...overrides,
});

describe('terms versions and carried-forward confirmations', () => {
  it('hashes canonically regardless of key order', () => {
    const a = terms();
    const b = JSON.parse(JSON.stringify(a)) as BookingTermsContent;
    expect(hashTerms(a)).toBe(hashTerms(b));
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(hashTerms(terms({ priceKoboPerKg: 25_001 }))).not.toBe(hashTerms(a));
  });

  it('adding processor-paid transport inside the agreed windows keeps the farmer confirmation', () => {
    const v1 = terms();
    const v2 = terms({ transport: transport() });
    expect(materialChanged('FARMER', v1, v2)).toBe(false);
    expect(materialChanged('PROCESSOR', v1, v2)).toBe(true); // processor now owes freight
    expect(materialChanged('TRANSPORTER', v1, v2)).toBe(true);
    expect(requiredParties(v2)).toEqual(['FARMER', 'PROCESSOR', 'TRANSPORTER']);
    expect(requiredParties(v1)).toEqual(['FARMER', 'PROCESSOR']);
  });

  it('farmer-paid freight or a pickup outside the agreed window needs farmer re-confirmation', () => {
    const v1 = terms({ freightPayer: 'FARMER' });
    expect(materialChanged('FARMER', v1, terms({ freightPayer: 'FARMER', transport: transport({ freightPayer: 'FARMER' }) }))).toBe(true);
    const outside = terms({ transport: transport({ pickupWindow: { start: '2026-11-02T18:00:00.000Z', end: '2026-11-02T19:00:00.000Z' } }) });
    expect(materialChanged('FARMER', terms(), outside)).toBe(true);
  });

  it('price or quantity changes invalidate both commercial parties', () => {
    const v1 = terms({ transport: transport() });
    const v2 = terms({ transport: transport(), priceKoboPerKg: 24_000 });
    expect(materialChanged('FARMER', v1, v2)).toBe(true);
    expect(materialChanged('PROCESSOR', v1, v2)).toBe(true);
    expect(materialChanged('TRANSPORTER', v1, v2)).toBe(false);
    const v3 = terms({ transport: transport(), quantityKg: '1800.000' });
    expect(materialChanged('TRANSPORTER', v1, v3)).toBe(true);
    expect(changedFields(v1, v3)).toContain('Quantity');
  });

  it('a replacement transporter only needs the processor (payer) and new transporter', () => {
    const v1 = terms({ transport: transport() });
    const v2 = terms({ transport: transport({ quoteId: '0190a000-0000-7000-8000-00000000000a', vehiclePlate: 'OYO-999-ZZ', priceKobo: 4_000_000 }) });
    expect(materialChanged('FARMER', v1, v2)).toBe(false);
    expect(materialChanged('PROCESSOR', v1, v2)).toBe(true);
    expect(materialChanged('TRANSPORTER', v1, v2)).toBe(true);
  });
});

describe('draft offers', () => {
  it('can be revised, sent or withdrawn, but never accepted before they are sent', () => {
    expect(transition(OFFER_MACHINE, 'DRAFT', 'revise')).toBe('DRAFT');
    expect(transition(OFFER_MACHINE, 'DRAFT', 'send')).toBe('OPEN');
    expect(transition(OFFER_MACHINE, 'DRAFT', 'withdraw')).toBe('WITHDRAWN');
    expect(() => transition(OFFER_MACHINE, 'DRAFT', 'accept')).toThrow();
    expect(() => transition(OFFER_MACHINE, 'DRAFT', 'expire')).toThrow();
    expect(() => transition(OFFER_MACHINE, 'OPEN', 'send')).toThrow();
  });
});
