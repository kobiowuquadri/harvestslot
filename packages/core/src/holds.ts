import type { Tx } from '@harvestslot/db';
import { audit } from './audit.js';
import { recomputeReadiness } from './booking-facts.js';
import { bookingRecipients, farmerRecipients, notify, orgRecipients } from './notify.js';
import { BOOKING_MACHINE, OFFER_MACHINE, transition } from './state.js';
import { lockRow, lockRows } from './tx.js';

/**
 * Expiry of temporary holds. Each function locks the affected rows in the global order, re-checks the
 * state under the lock and changes it only if still due — so a hold is released exactly once, and a
 * confirmation racing an expiry produces one consistent outcome (whichever takes the lock first).
 */

export async function expireOfferIfDue(tx: Tx, offerId: string, now: Date): Promise<boolean> {
  const peek = await tx.offer.findUnique({ where: { id: offerId }, select: { harvestRequestId: true, reservation: { select: { slotId: true } } } });
  if (!peek) return false;
  await lockRow(tx, 'harvest_requests', peek.harvestRequestId);
  if (peek.reservation) await lockRow(tx, 'processing_slots', peek.reservation.slotId);
  await lockRow(tx, 'offers', offerId);
  const offer = await tx.offer.findUniqueOrThrow({
    where: { id: offerId },
    include: { reservation: true, harvestRequest: { select: { farmerProfileId: true, reference: true } } },
  });
  if (!['OPEN', 'COUNTERED'].includes(offer.status) || offer.expiresAt > now) return false;
  await tx.offer.update({
    where: { id: offerId },
    data: { status: transition(OFFER_MACHINE, offer.status, 'expire', 'offer'), decidedAt: now, version: { increment: 1 } },
  });
  if (offer.reservation && offer.reservation.status === 'HELD') {
    await tx.reservation.update({
      where: { id: offer.reservation.id },
      data: { status: 'EXPIRED', releasedAt: now, releaseReason: 'Offer expired', version: { increment: 1 } },
    });
  }
  await audit(tx, { action: 'offer.expired', entityType: 'offer', entityId: offerId, actorParty: 'SYSTEM' });
  await notify(tx, {
    userIds: [
      ...(await farmerRecipients(tx, offer.harvestRequest.farmerProfileId, undefined, now)),
      ...(await orgRecipients(tx, offer.processorOrgId, ['OWNER', 'MANAGER'])),
    ],
    type: 'offer.expired',
    category: 'offers',
    title: `Offer on ${offer.harvestRequest.reference} expired`,
    body: 'The offer was not accepted in time, so its capacity hold was released.',
    link: `/offers/${offerId}`,
    dedupeKey: `offer-expired:${offerId}`,
  });
  return true;
}

/** Expires a pre-confirmation booking whose capacity hold lapsed, releasing supply, capacity and trip holds. */
export async function expireBookingIfDue(tx: Tx, bookingId: string, now: Date): Promise<boolean> {
  const peek = await tx.booking.findUnique({
    where: { id: bookingId },
    select: { harvestRequestId: true, slotId: true, trips: { where: { status: 'HELD' }, select: { vehicleId: true, driverId: true } } },
  });
  if (!peek) return false;
  await lockRow(tx, 'harvest_requests', peek.harvestRequestId);
  await lockRow(tx, 'processing_slots', peek.slotId);
  await lockRow(tx, 'bookings', bookingId);
  await lockRows(tx, 'vehicles', peek.trips.map((t) => t.vehicleId));
  await lockRows(tx, 'drivers', peek.trips.map((t) => t.driverId).filter((d): d is string => !!d));

  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { reservation: true, harvestLot: true } });
  const r = booking.reservation;
  if (!['DRAFT', 'AWAITING_CONFIRMATIONS'].includes(booking.status) || !r || r.status !== 'HELD' || !r.expiresAt || r.expiresAt > now) {
    return false;
  }
  await tx.booking.update({
    where: { id: bookingId },
    data: { status: transition(BOOKING_MACHINE, booking.status, 'expire', 'booking'), expiredAt: now, version: { increment: 1 } },
  });
  await tx.reservation.update({
    where: { id: r.id },
    data: { status: 'EXPIRED', releasedAt: now, releaseReason: 'Confirmation deadline passed', version: { increment: 1 } },
  });
  if (booking.harvestLot && booking.harvestLot.status === 'ALLOCATED') {
    await tx.harvestLot.update({
      where: { id: booking.harvestLot.id },
      data: { status: 'RELEASED', releasedAt: now, releaseReason: 'Booking expired before confirmation', version: { increment: 1 } },
    });
  }
  await tx.tripReservation.updateMany({ where: { bookingId, status: 'HELD' }, data: { status: 'EXPIRED', version: { increment: 1 } } });
  await tx.bookingAmendment.updateMany({
    where: { bookingId, status: 'PENDING' },
    data: { status: 'WITHDRAWN', decidedAt: now, rejectionReason: 'Booking expired', version: { increment: 1 } },
  });
  await tx.transportQuote.updateMany({ where: { bookingId, status: 'SUBMITTED' }, data: { status: 'EXPIRED', version: { increment: 1 } } });
  await audit(tx, { action: 'booking.expired', entityType: 'booking', entityId: bookingId, actorParty: 'SYSTEM' });
  await notify(tx, {
    userIds: await bookingRecipients(tx, bookingId, { farmer: true, processorRoles: ['OWNER', 'MANAGER'], transporter: true }, now),
    type: 'booking.expired',
    category: 'bookings',
    title: `${booking.reference} expired`,
    body: 'Not every party confirmed before the deadline, so the held capacity and quantity were released. Nothing was harvested.',
    link: `/bookings/${bookingId}`,
    bookingId,
    dedupeKey: `booking-expired:${bookingId}`,
  });
  await recomputeReadiness(tx, bookingId, 'booking.expired', now);
  return true;
}

/** A trip hold attached to a pending transport amendment that lapsed: withdraw the amendment, free the vehicle. */
export async function expireTripHoldIfDue(tx: Tx, tripId: string, now: Date): Promise<boolean> {
  const peek = await tx.tripReservation.findUnique({ where: { id: tripId }, select: { bookingId: true, vehicleId: true, driverId: true } });
  if (!peek) return false;
  await lockRow(tx, 'bookings', peek.bookingId);
  await lockRow(tx, 'vehicles', peek.vehicleId);
  if (peek.driverId) await lockRow(tx, 'drivers', peek.driverId);
  const trip = await tx.tripReservation.findUniqueOrThrow({ where: { id: tripId } });
  if (trip.status !== 'HELD' || !trip.expiresAt || trip.expiresAt > now) return false;
  await tx.tripReservation.update({ where: { id: tripId }, data: { status: 'EXPIRED', version: { increment: 1 } } });
  const amendments = await tx.bookingAmendment.findMany({
    where: { bookingId: trip.bookingId, status: 'PENDING', termsVersion: { transportQuoteId: trip.quoteId } },
    select: { id: true },
  });
  for (const a of amendments) {
    await tx.bookingAmendment.update({
      where: { id: a.id },
      data: { status: 'WITHDRAWN', decidedAt: now, rejectionReason: 'Transport hold expired before every party confirmed', version: { increment: 1 } },
    });
  }
  await tx.transportQuote.update({ where: { id: trip.quoteId }, data: { status: 'EXPIRED', version: { increment: 1 } } });
  await audit(tx, { action: 'trip.hold-expired', entityType: 'trip', entityId: tripId, actorParty: 'SYSTEM' });
  await recomputeReadiness(tx, trip.bookingId, 'trip.hold-expired', now);
  return true;
}
