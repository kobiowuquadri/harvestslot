import type { BookingParty, BookingTermsContent, Readiness } from '@harvestslot/contracts';
import type { Db } from '@harvestslot/db';
import { bookingRecipients, notify } from './notify.js';
import { evaluateReadiness, type ReadinessFacts } from './readiness.js';

const ACTIVE_TRIP = ['HELD', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] as const;

/** Loads every fact readiness depends on for one booking at `now`. */
export async function loadReadinessFacts(db: Db, bookingId: string, now: Date): Promise<ReadinessFacts | null> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      termsVersions: true,
      reservation: true,
      harvestLot: true,
      slot: true,
      facility: { select: { status: true } },
      processorOrg: { select: { status: true } },
      farmerProfile: { select: { user: { select: { status: true } } } },
      amendments: { where: { status: 'PENDING' }, select: { id: true } },
      incidents: { where: { status: 'OPEN', blocking: true }, select: { id: true } },
      trips: { orderBy: { createdAt: 'desc' }, include: { quote: { select: { transporterOrg: { select: { status: true } } } } } },
    },
  });
  if (!booking) return null;
  const current = booking.termsVersions.find((t) => t.versionNo === booking.currentTermsVersionNo);
  if (!current) return null;
  const content = current.content as unknown as BookingTermsContent;
  const confirmations = await db.confirmation.findMany({ where: { termsVersionId: current.id }, select: { party: true } });

  const transportQuoteId = content.transport?.quoteId ?? null;
  const trip =
    booking.trips.find((t) => t.quoteId === transportQuoteId && (ACTIVE_TRIP as readonly string[]).includes(t.status)) ??
    booking.trips.find((t) => t.quoteId === transportQuoteId) ??
    null;

  let conflict = false;
  if (trip && trip.status !== 'COMPLETED') {
    const overlapping = await db.tripReservation.count({
      where: {
        id: { not: trip.id },
        OR: [{ vehicleId: trip.vehicleId }, ...(trip.driverId ? [{ driverId: trip.driverId }] : [])],
        blockStartsAt: { lt: trip.blockEndsAt },
        blockEndsAt: { gt: trip.blockStartsAt },
        AND: [{ OR: [{ status: { in: ['CONFIRMED', 'IN_PROGRESS'] } }, { status: 'HELD', expiresAt: { gt: now } }] }],
      },
    });
    conflict = overlapping > 0 && trip.status === 'HELD';
  }

  return {
    now,
    bookingStatus: booking.status,
    currentVersionNo: current.versionNo,
    hasTransportTerms: content.transport !== null,
    confirmedParties: confirmations.map((c) => c.party as BookingParty),
    pickupWindowEnd: new Date(content.pickupWindow.end),
    deliveryWindowStart: new Date(content.deliveryWindow.start),
    deliveryWindowEnd: new Date(content.deliveryWindow.end),
    reservation: booking.reservation ? { status: booking.reservation.status, expiresAt: booking.reservation.expiresAt } : null,
    lotStatus: booking.harvestLot?.status ?? null,
    trip: trip
      ? { status: trip.status, hasDriver: trip.driverId !== null, conflict, matchesTerms: trip.quoteId === transportQuoteId }
      : null,
    slot: { status: booking.slot.status, startsAt: booking.slot.startsAt, endsAt: booking.slot.endsAt },
    processorOrgStatus: booking.processorOrg.status,
    transporterOrgStatus: trip?.quote.transporterOrg.status ?? null,
    facilityStatus: booking.facility.status,
    farmerAccountStatus: booking.farmerProfile.user?.status ?? null,
    pendingAmendment: booking.amendments.length > 0,
    openBlockingIncidents: booking.incidents.length,
  };
}

export async function computeReadiness(db: Db, bookingId: string, now = new Date()): Promise<Readiness | null> {
  const facts = await loadReadinessFacts(db, bookingId, now);
  return facts ? evaluateReadiness(facts) : null;
}

/**
 * Recomputes readiness and, if it changed, persists a readiness event and notifies participants.
 * Call inside the transaction that changed the underlying facts, and from the periodic sweep for
 * time-based changes (expired windows).
 */
export async function recomputeReadiness(db: Db, bookingId: string, trigger: string, now = new Date()): Promise<Readiness | null> {
  const readiness = await computeReadiness(db, bookingId, now);
  if (!readiness) return null;
  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { lastReadiness: true, reference: true, status: true } });
  if (!booking) return null;
  const changed = booking.lastReadiness !== readiness.ready;
  await db.booking.update({
    where: { id: bookingId },
    data: { lastReadiness: readiness.ready, readinessCheckedAt: now },
  });
  if (changed) {
    const failing = readiness.checks.filter((c) => !c.passed).map((c) => c.code);
    await db.readinessEvent.create({ data: { bookingId, ready: readiness.ready, failingChecks: failing, trigger } });
    const recipients = await bookingRecipients(db, bookingId, {
      farmer: true,
      processorRoles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'],
      transporter: true,
    });
    const firstProblem = readiness.checks.find((c) => !c.passed);
    await notify(db, {
      userIds: recipients,
      type: readiness.ready ? 'readiness.gained' : 'readiness.lost',
      category: 'bookings',
      title: readiness.ready ? `${booking.reference} is ready to harvest` : `${booking.reference} is no longer ready`,
      body: readiness.ready
        ? 'Buyer, capacity and transport are confirmed. You can start harvesting within the agreed window.'
        : `Do not start harvesting yet. ${firstProblem?.explanation ?? ''}`.trim(),
      link: `/bookings/${bookingId}`,
      bookingId,
      dedupeKey: `readiness:${bookingId}:${now.getTime()}:${readiness.ready}`,
    });
  }
  return readiness;
}
