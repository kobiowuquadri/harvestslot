import { describe, expect, it } from 'vitest';
import { evaluateReadiness, type ReadinessFacts } from '../src/readiness.js';

const now = new Date('2026-11-01T08:00:00Z');
const later = (h: number) => new Date(now.getTime() + h * 3_600_000);

function readyFacts(overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
  return {
    now,
    bookingStatus: 'CONFIRMED',
    currentVersionNo: 2,
    hasTransportTerms: true,
    handover: null,
    confirmedParties: ['FARMER', 'PROCESSOR', 'TRANSPORTER'],
    pickupWindowEnd: later(30),
    deliveryWindowStart: later(26),
    deliveryWindowEnd: later(34),
    reservation: { status: 'CONFIRMED', expiresAt: null },
    lotStatus: 'ALLOCATED',
    trip: { status: 'CONFIRMED', hasDriver: true, conflict: false, matchesTerms: true },
    slot: { status: 'PUBLISHED', startsAt: later(24), endsAt: later(40) },
    processorOrgStatus: 'APPROVED',
    transporterOrgStatus: 'APPROVED',
    facilityStatus: 'ACTIVE',
    farmerAccountStatus: 'ACTIVE',
    pendingAmendment: false,
    openBlockingIncidents: 0,
    ...overrides,
  };
}

const failing = (f: ReadinessFacts) => evaluateReadiness(f).checks.filter((c) => !c.passed).map((c) => c.code);

describe('evaluateReadiness', () => {
  it('is ready only when every check passes', () => {
    const r = evaluateReadiness(readyFacts());
    expect(r.ready).toBe(true);
    expect(r.checks).toHaveLength(8);
    expect(r.checks.every((c) => c.passed && c.responsible === null)).toBe(true);
  });

  it('requires the farmer and processor to accept the current version', () => {
    expect(failing(readyFacts({ confirmedParties: ['PROCESSOR', 'TRANSPORTER'] }))).toEqual(['FARMER_ACCEPTED']);
    const r = evaluateReadiness(readyFacts({ confirmedParties: ['FARMER', 'TRANSPORTER'] }));
    expect(r.ready).toBe(false);
    const check = r.checks.find((c) => c.code === 'PROCESSOR_ACCEPTED')!;
    expect(check.responsible).toBe('PROCESSOR');
    expect(check.explanation).toContain('version 2');
  });

  it('treats a temporary hold as not yet reserved', () => {
    expect(failing(readyFacts({ reservation: { status: 'HELD', expiresAt: later(5) } }))).toContain('CAPACITY_RESERVED');
  });

  it('flags an expired hold in both capacity and window checks', () => {
    const codes = failing(readyFacts({ bookingStatus: 'AWAITING_CONFIRMATIONS', reservation: { status: 'HELD', expiresAt: later(-1) } }));
    expect(codes).toEqual(expect.arrayContaining(['CAPACITY_RESERVED', 'WINDOWS_FEASIBLE', 'NO_BLOCKING_ISSUES']));
  });

  it('older bookings made with a transporter still need a confirmed, conflict-free trip with a driver', () => {
    // Without transport terms and without a handover, how the produce gets there is not agreed.
    expect(failing(readyFacts({ hasTransportTerms: false, confirmedParties: ['FARMER', 'PROCESSOR'], trip: null }))).toEqual(['HANDOVER_AGREED']);
    expect(failing(readyFacts({ trip: { status: 'CONFIRMED', hasDriver: false, conflict: false, matchesTerms: true } }))).toEqual(['VEHICLE_DRIVER_CONFIRMED']);
    expect(failing(readyFacts({ trip: { status: 'CANCELLED', hasDriver: true, conflict: false, matchesTerms: true } }))).toEqual(['VEHICLE_DRIVER_CONFIRMED']);
    expect(failing(readyFacts({ trip: { status: 'HELD', hasDriver: true, conflict: true, matchesTerms: true } }))).toEqual(['VEHICLE_DRIVER_CONFIRMED']);
  });

  it('loses readiness when the pickup window passes', () => {
    const r = evaluateReadiness(readyFacts({ pickupWindowEnd: later(-1) }));
    expect(r.ready).toBe(false);
    expect(r.checks.find((c) => c.code === 'WINDOWS_FEASIBLE')!.explanation).toContain('pickup window has passed');
  });

  it('loses readiness on cancellation, pending amendment, blocking incident or suspension', () => {
    expect(failing(readyFacts({ bookingStatus: 'CANCELLED' }))).toContain('NO_BLOCKING_ISSUES');
    expect(failing(readyFacts({ pendingAmendment: true }))).toEqual(['NO_BLOCKING_ISSUES']);
    expect(failing(readyFacts({ openBlockingIncidents: 1 }))).toEqual(['NO_BLOCKING_ISSUES']);
    expect(failing(readyFacts({ processorOrgStatus: 'SUSPENDED' }))).toEqual(['PARTICIPANTS_ELIGIBLE']);
    expect(failing(readyFacts({ transporterOrgStatus: 'SUSPENDED' }))).toEqual(['PARTICIPANTS_ELIGIBLE']);
    expect(failing(readyFacts({ farmerAccountStatus: 'SUSPENDED' }))).toEqual(['PARTICIPANTS_ELIGIBLE']);
  });

  it('rejects a delivery window outside the slot or a cancelled slot', () => {
    expect(failing(readyFacts({ deliveryWindowEnd: later(41) }))).toEqual(['WINDOWS_FEASIBLE']);
    expect(failing(readyFacts({ slot: { status: 'CANCELLED', startsAt: later(24), endsAt: later(40) } }))).toEqual(['WINDOWS_FEASIBLE']);
  });

  it('a represented farmer has no account and is not blocked by account status', () => {
    expect(evaluateReadiness(readyFacts({ farmerAccountStatus: null })).ready).toBe(true);
  });
});

/** The simplified journey: the buyer collects or the farmer delivers. No transporter, vehicle or driver. */
function handoverFacts(overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
  return readyFacts({
    hasTransportTerms: false,
    confirmedParties: ['FARMER', 'PROCESSOR'],
    trip: null,
    transporterOrgStatus: null,
    handover: { arrangement: 'COLLECT_FROM_FARM', placeLabel: "Adunni's farm, Akinyele", windowStart: later(25), windowEnd: later(29) },
    pickupWindowEnd: later(29),
    deliveryWindowStart: later(25),
    deliveryWindowEnd: later(29),
    ...overrides,
  });
}

describe('evaluateReadiness with a handover arrangement', () => {
  it('is ready when both sides agreed, capacity is reserved and the handover is complete — no driver or vehicle needed', () => {
    const r = evaluateReadiness(handoverFacts());
    expect(r.ready).toBe(true);
    expect(r.checks.map((c) => c.code)).toEqual(['FARMER_ACCEPTED', 'PROCESSOR_ACCEPTED', 'CAPACITY_RESERVED', 'HANDOVER_AGREED', 'WINDOWS_FEASIBLE', 'PARTICIPANTS_ELIGIBLE', 'NO_BLOCKING_ISSUES']);
    expect(r.checks.find((c) => c.code === 'HANDOVER_AGREED')!.explanation).toContain('collects');
  });

  it('describes delivery by the farmer', () => {
    const r = evaluateReadiness(handoverFacts({ handover: { arrangement: 'FARMER_DELIVERS', placeLabel: 'Oluyole Garri Plant, Oluyole', windowStart: later(25), windowEnd: later(29) } }));
    expect(r.ready).toBe(true);
    expect(r.checks.find((c) => c.code === 'HANDOVER_AGREED')!.explanation).toBe('The farmer delivers to Oluyole Garri Plant, Oluyole.');
  });

  it('is not ready while a party has not agreed the current terms, or capacity is only held', () => {
    expect(failing(handoverFacts({ confirmedParties: ['PROCESSOR'] }))).toEqual(['FARMER_ACCEPTED']);
    expect(failing(handoverFacts({ reservation: { status: 'HELD', expiresAt: later(5) } }))).toEqual(['CAPACITY_RESERVED']);
  });

  it('is not ready when the handover details are incomplete', () => {
    expect(failing(handoverFacts({ handover: { arrangement: 'COLLECT_FROM_FARM', placeLabel: ' ', windowStart: later(25), windowEnd: later(29) } }))).toEqual(['HANDOVER_AGREED']);
    expect(failing(handoverFacts({ handover: { arrangement: 'COLLECT_FROM_FARM', placeLabel: 'Farm', windowStart: later(29), windowEnd: later(25) } }))).toEqual(['HANDOVER_AGREED']);
  });

  it('is no longer valid after cancellation, a pending change of terms, or when the handover time has passed', () => {
    expect(failing(handoverFacts({ bookingStatus: 'CANCELLED' }))).toEqual(['NO_BLOCKING_ISSUES']);
    expect(failing(handoverFacts({ pendingAmendment: true }))).toEqual(['NO_BLOCKING_ISSUES']);
    const passed = evaluateReadiness(handoverFacts({ pickupWindowEnd: later(-1) }));
    expect(passed.ready).toBe(false);
    expect(passed.checks.find((c) => c.code === 'WINDOWS_FEASIBLE')!.explanation).toContain('handover time has passed');
  });
});
