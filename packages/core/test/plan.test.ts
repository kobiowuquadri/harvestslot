import { describe, expect, it } from 'vitest';
import type { BookingTermsContent } from '@harvestslot/contracts';
import { describePlan, nairaShort, planSentence, type PlanFacts } from '../src/plan.js';

const uuid = '00000000-0000-7000-8000-000000000000';
const window = { start: '2026-11-20T08:00:00.000Z', end: '2026-11-20T12:00:00.000Z' }; // 09:00–13:00 Lagos, Fri 20 Nov

function terms(overrides: Partial<BookingTermsContent> = {}): BookingTermsContent {
  return {
    schemaVersion: 1,
    bookingReference: 'HSB-001001',
    farmer: { farmerProfileId: uuid, displayName: 'Ayo Farmer' },
    processor: { organisationId: uuid, name: 'Ibadan Mills' },
    facility: { id: uuid, name: 'Ibadan Mills Plant', lga: 'Oluyole', address: null },
    line: { id: uuid, name: 'Cassava intake', product: 'OTHER' },
    slot: { id: uuid, startsAt: '2026-11-20T07:00:00.000Z', endsAt: '2026-11-20T16:00:00.000Z' },
    harvest: { harvestRequestId: uuid, reference: 'HR-001001', plannedHarvestDate: '2026-11-20', pickupLocationLabel: 'Farm at Akinyele', pickupLga: 'Akinyele' },
    quantityKg: '2000.000',
    priceKoboPerKg: 10_000,
    estimatedProduceAmountKobo: 20_000_000,
    toleranceBps: 500,
    qualityTerms: { maxHoursHarvestToDelivery: 48, soilAndStemsRemoved: true, varietiesAccepted: [] },
    pickupWindow: window,
    deliveryWindow: window,
    paymentTermsDays: 7,
    invoiceDueRule: 'Due 7 days after weighing',
    cancellationTerms: 'Either side may cancel before harvest starts.',
    rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
    freightPayer: 'PROCESSOR',
    transport: null,
    handover: { arrangement: 'COLLECT_FROM_FARM', place: { label: 'Farm at Akinyele, Akinyele', lga: 'Akinyele', detail: null }, window, farmerDeliveryCostKobo: null },
    platformFee: { enabled: true, bps: 150, payer: 'PROCESSOR', estimatedKobo: 300_000 },
    ...overrides,
  };
}

function facts(overrides: Partial<PlanFacts> = {}): PlanFacts {
  return {
    status: 'CONFIRMED',
    ready: true,
    now: new Date('2026-11-18T10:00:00Z'),
    content: terms(),
    pendingParties: [],
    blocker: null,
    receiving: null,
    invoice: null,
    openDispute: false,
    viewer: { farmer: true, processor: false },
    ...overrides,
  };
}

const weighed = { status: 'AWAITING_FARMER_REVIEW' as const, netKg: '1900.000', acceptedKg: '1900.000', reasons: [], note: null, farmerDecision: null };
const invoice = (o: Partial<NonNullable<PlanFacts['invoice']>> = {}) => ({
  id: uuid,
  totalKobo: 19_000_000,
  confirmedPaidKobo: 0,
  reportedPendingKobo: 0,
  outstandingKobo: 19_000_000,
  dueAt: new Date('2026-11-27T10:00:00Z'),
  overdue: false,
  pendingPaymentId: null,
  ...o,
});

describe('the plan sentence', () => {
  it('says who brings how much, where, when and for how much', () => {
    expect(planSentence(terms())).toBe('Ibadan Mills will collect 2,000 kg at Farm at Akinyele, Akinyele on Fri 20 Nov for ₦100 per kg.');
    const deliver = terms({ handover: { arrangement: 'FARMER_DELIVERS', place: { label: 'Ibadan Mills Plant, Oluyole', lga: 'Oluyole', detail: null }, window, farmerDeliveryCostKobo: 1_500_000 } });
    expect(planSentence(deliver)).toBe('Ayo Farmer will deliver 2,000 kg to Ibadan Mills at Ibadan Mills Plant, Oluyole on Fri 20 Nov for ₦100 per kg.');
    expect(nairaShort(10_050)).toBe('₦100.50');
  });

  it('shows the estimated ₦200,000 for 2,000 kg at ₦100/kg before weighing', () => {
    const { plan } = describePlan(facts());
    expect(plan.estimatedAmountKobo).toBe(20_000_000);
    expect(plan.weighed).toBeNull();
  });
});

describe('what happens next', () => {
  it('before the handover: the farmer prepares; the buyer will collect and weigh', () => {
    expect(describePlan(facts()).nextStep).toMatchObject({ stage: 'Ready to harvest', actor: 'FARMER', forViewer: expect.stringContaining('Have 2,000 kg ready at Farm at Akinyele') });
    expect(describePlan(facts({ viewer: { farmer: false, processor: true } })).nextStep.forViewer).toContain('Collect 2,000 kg at Farm at Akinyele');
  });

  it('once the handover time comes, the buyer records the weight even if the window has closed', () => {
    const s = describePlan(facts({ now: new Date('2026-11-21T10:00:00Z'), ready: false, viewer: { farmer: false, processor: true } })).nextStep;
    expect(s.actor).toBe('PROCESSOR');
    expect(s.forViewer).toContain('record the weight');
  });

  it('1,900 kg accepted: final amount ₦190,000, 100 kg less flagged, the farmer checks it', () => {
    const f = facts({ status: 'ACTIVE', receiving: weighed, invoice: invoice() });
    const { plan, nextStep } = describePlan(f);
    expect(plan.weighed).toMatchObject({ acceptedKg: '1900.000', shortfallKg: '100.000', finalAmountKobo: 19_000_000, farmerDecision: 'PENDING' });
    expect(nextStep.stage).toBe('Weight recorded — farmer to check');
    expect(nextStep.forViewer).toBe('Check the weight: 1,900 kg accepted (100 kg less than agreed). Agree, or report a problem.');
    // The buyer may already pay for the accepted weight.
    expect(describePlan({ ...f, viewer: { farmer: false, processor: true } }).nextStep.forViewer).toBe('Record the payment of ₦190,000 to Ayo Farmer');
  });

  it('keeps "Payment reported" and "Payment received" apart', () => {
    const agreed = { ...weighed, status: 'FINAL' as const, farmerDecision: 'ACCEPTED' as const };
    const reported = describePlan(facts({ status: 'COMPLETED', receiving: agreed, invoice: invoice({ reportedPendingKobo: 19_000_000, pendingPaymentId: uuid }) }));
    expect(reported.nextStep).toMatchObject({ stage: 'Payment reported', actor: 'FARMER', forViewer: 'Confirm you received ₦190,000' });
    const buyer = describePlan(facts({ status: 'COMPLETED', receiving: agreed, invoice: invoice({ reportedPendingKobo: 19_000_000 }), viewer: { farmer: false, processor: true } }));
    expect(buyer.nextStep.waitingFor).toBe('Waiting for Ayo Farmer to confirm receipt of ₦190,000');
    const received = describePlan(facts({ status: 'COMPLETED', receiving: agreed, invoice: invoice({ confirmedPaidKobo: 19_000_000, outstandingKobo: 0 }) }));
    expect(received.nextStep).toMatchObject({ stage: 'Paid — sale complete', actor: 'NONE' });
  });

  it('tells each side who acts next before the plan is agreed', () => {
    expect(describePlan(facts({ status: 'DRAFT', ready: false })).nextStep.actor).toBe('FARMER');
    const noHandover = describePlan(facts({ status: 'AWAITING_CONFIRMATIONS', ready: false, content: terms({ handover: undefined }), viewer: { farmer: false, processor: true } }));
    expect(noHandover.nextStep.forViewer).toContain('collect or farmer delivers');
    expect(describePlan(facts({ status: 'CANCELLED', ready: false })).nextStep.actor).toBe('NONE');
  });
});
