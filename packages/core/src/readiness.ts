import type { BookingParty, BookingStatus, Readiness, ReadinessCheck, ReadinessCheckCode } from '@harvestslot/contracts';

/** Facts gathered from the database at one instant. `evaluateReadiness` is a pure function of these. */
export interface ReadinessFacts {
  now: Date;
  bookingStatus: BookingStatus;
  currentVersionNo: number;
  hasTransportTerms: boolean;
  /** Handover terms of the current version (bookings made without a transporter). */
  handover: { arrangement: string; placeLabel: string; windowStart: Date; windowEnd: Date } | null;
  confirmedParties: BookingParty[];
  pickupWindowEnd: Date;
  deliveryWindowStart: Date;
  deliveryWindowEnd: Date;
  reservation: { status: string; expiresAt: Date | null } | null;
  lotStatus: string | null;
  trip: { status: string; hasDriver: boolean; conflict: boolean; matchesTerms: boolean } | null;
  slot: { status: string; startsAt: Date; endsAt: Date };
  processorOrgStatus: string;
  transporterOrgStatus: string | null;
  facilityStatus: string;
  farmerAccountStatus: string | null;
  pendingAmendment: boolean;
  openBlockingIncidents: number;
}

const LABELS: Record<ReadinessCheckCode, string> = {
  FARMER_ACCEPTED: 'Farmer accepted the current terms',
  PROCESSOR_ACCEPTED: 'Processor accepted the current terms',
  CAPACITY_RESERVED: 'Quantity and processing capacity reserved',
  HANDOVER_AGREED: 'How and where the produce changes hands is agreed',
  TRANSPORT_ACCEPTED: 'Transport quote and payer accepted',
  VEHICLE_DRIVER_CONFIRMED: 'Vehicle and driver confirmed',
  WINDOWS_FEASIBLE: 'Agreed dates and times still workable',
  PARTICIPANTS_ELIGIBLE: 'All participants eligible',
  NO_BLOCKING_ISSUES: 'No blocking amendment, cancellation or incident',
};

function check(
  code: ReadinessCheckCode,
  passed: boolean,
  explanation: string,
  responsible: BookingParty | null,
): ReadinessCheck {
  return { code, label: LABELS[code], passed, explanation, responsible: passed ? null : responsible };
}

export function evaluateReadiness(f: ReadinessFacts): Readiness {
  const terminal = ['CANCELLED', 'EXPIRED', 'COMPLETED'].includes(f.bookingStatus);
  const v = `version ${f.currentVersionNo}`;

  const farmer = f.confirmedParties.includes('FARMER');
  const processor = f.confirmedParties.includes('PROCESSOR');

  const reservationOk =
    f.reservation !== null &&
    (f.reservation.status === 'CONFIRMED' || f.reservation.status === 'CONSUMED') &&
    f.lotStatus !== null &&
    f.lotStatus !== 'RELEASED';
  const reservationExplanation = reservationOk
    ? 'Supply is allocated and the slot reservation is committed.'
    : f.reservation?.status === 'HELD'
      ? f.reservation.expiresAt && f.reservation.expiresAt <= f.now
        ? 'The temporary capacity hold has expired.'
        : `Capacity is temporarily held until every party confirms (hold expires ${f.reservation.expiresAt?.toISOString() ?? 'soon'}).`
      : 'No valid capacity reservation exists.';

  const transportAccepted = f.hasTransportTerms && f.confirmedParties.includes('TRANSPORTER');
  const transportExplanation = !f.hasTransportTerms
    ? 'No transport quote has been accepted for the current terms yet.'
    : transportAccepted
      ? 'The accepted quote and freight payer are part of the current terms.'
      : 'The transporter has not yet confirmed the assignment.';

  const tripOk =
    f.trip !== null && ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(f.trip.status) && f.trip.hasDriver && !f.trip.conflict && f.trip.matchesTerms;
  const tripExplanation = !f.trip
    ? 'No vehicle and driver are assigned.'
    : f.trip.status === 'CANCELLED'
      ? 'The transporter cancelled; a replacement must be arranged.'
      : !f.trip.hasDriver
        ? 'A driver has not been assigned.'
        : f.trip.conflict
          ? 'The vehicle or driver has an overlapping commitment.'
          : !f.trip.matchesTerms
            ? 'The assigned trip does not match the current transport terms.'
            : !['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(f.trip.status)
              ? 'The vehicle and driver are held but not yet confirmed.'
              : 'Vehicle and driver are confirmed with no overlapping commitments.';

  const handoverOk = Boolean(f.handover && f.handover.placeLabel.trim().length > 0 && f.handover.windowEnd > f.handover.windowStart);
  const handoverExplanation = handoverOk
    ? f.handover!.arrangement === 'COLLECT_FROM_FARM'
      ? `The buyer collects at ${f.handover!.placeLabel}.`
      : `The farmer delivers to ${f.handover!.placeLabel}.`
    : 'How the produce gets to the buyer has not been agreed yet.';

  const windowProblems: string[] = [];
  if (f.pickupWindowEnd <= f.now && !['ACTIVE', 'COMPLETED'].includes(f.bookingStatus)) {
    windowProblems.push(f.handover ? 'the agreed handover time has passed' : 'the pickup window has passed');
  }
  if (['CANCELLED', 'CLOSED'].includes(f.slot.status)) windowProblems.push(`the processing slot is ${f.slot.status.toLowerCase()}`);
  if (f.deliveryWindowStart < f.slot.startsAt || f.deliveryWindowEnd > f.slot.endsAt) windowProblems.push('the delivery window falls outside the processing slot');
  if (f.reservation?.status === 'HELD' && f.reservation.expiresAt && f.reservation.expiresAt <= f.now) windowProblems.push('the confirmation deadline has passed');

  const eligibilityProblems: string[] = [];
  if (f.processorOrgStatus !== 'APPROVED') eligibilityProblems.push(`processor is ${f.processorOrgStatus.toLowerCase().replace('_', ' ')}`);
  if (f.facilityStatus !== 'ACTIVE') eligibilityProblems.push('facility is inactive');
  if (f.transporterOrgStatus && f.transporterOrgStatus !== 'APPROVED') eligibilityProblems.push(`transporter is ${f.transporterOrgStatus.toLowerCase().replace('_', ' ')}`);
  if (f.farmerAccountStatus && f.farmerAccountStatus !== 'ACTIVE') eligibilityProblems.push('farmer account is suspended');

  const blocking: string[] = [];
  if (terminal) blocking.push(`booking is ${f.bookingStatus.toLowerCase()}`);
  else if (f.bookingStatus === 'DRAFT') blocking.push('the farmer has not approved the prepared acceptance');
  else if (f.bookingStatus === 'AWAITING_CONFIRMATIONS') blocking.push('the booking is still awaiting confirmations');
  if (f.pendingAmendment) blocking.push('a proposed change to the terms is awaiting decisions');
  if (f.openBlockingIncidents > 0) blocking.push(`${f.openBlockingIncidents} open incident(s)`);

  const checks: ReadinessCheck[] = [
    check(
      'FARMER_ACCEPTED',
      farmer,
      farmer ? `Accepted ${v}.` : `Waiting for the farmer (or an authorised representative) to accept ${v}.`,
      'FARMER',
    ),
    check('PROCESSOR_ACCEPTED', processor, processor ? `Accepted ${v}.` : `Waiting for the processor to accept ${v}.`, 'PROCESSOR'),
    check('CAPACITY_RESERVED', reservationOk, reservationExplanation, 'PROCESSOR'),
    // Bookings made with a transporter (before handover arrangements) keep their transport checks;
    // every other booking needs only an agreed handover — no vehicle or driver record.
    ...(f.hasTransportTerms
      ? [
          check('TRANSPORT_ACCEPTED', transportAccepted, transportExplanation, 'TRANSPORTER'),
          check('VEHICLE_DRIVER_CONFIRMED', tripOk, tripExplanation, 'TRANSPORTER'),
        ]
      : [check('HANDOVER_AGREED', handoverOk, handoverExplanation, 'PROCESSOR')]),
    check(
      'WINDOWS_FEASIBLE',
      windowProblems.length === 0,
      windowProblems.length === 0 ? 'The agreed dates are still ahead and inside the buying slot.' : `Not workable: ${windowProblems.join('; ')}.`,
      'PROCESSOR',
    ),
    check(
      'PARTICIPANTS_ELIGIBLE',
      eligibilityProblems.length === 0,
      eligibilityProblems.length === 0 ? 'All participants are active and eligible.' : `Not eligible: ${eligibilityProblems.join('; ')}.`,
      'ADMIN',
    ),
    check(
      'NO_BLOCKING_ISSUES',
      blocking.length === 0,
      blocking.length === 0 ? 'Nothing is blocking the plan.' : `Blocked: ${blocking.join('; ')}.`,
      null,
    ),
  ];

  return { ready: checks.every((c) => c.passed), computedAt: f.now.toISOString(), checks };
}
