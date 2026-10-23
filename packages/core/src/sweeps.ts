import { formatNaira } from '@harvestslot/contracts';
import type { PrismaClient } from '@harvestslot/db';
import { audit } from './audit.js';
import { recomputeReadiness } from './booking-facts.js';
import { expireBookingIfDue, expireOfferIfDue, expireTripHoldIfDue } from './holds.js';
import { notifyPaymentEvent } from './invoicing.js';
import { adminUserIds, bookingRecipients, notify } from './notify.js';
import { applyVerifiedPayment, type PaymentProvider } from './payments.js';
import { DISPUTE_MACHINE, RECEIVING_MACHINE, transition } from './state.js';
import { lockRow, withTransaction } from './tx.js';

/**
 * Periodic sweeps run by the worker. They are optimisations and notifications: every read/write path
 * already honours expires_at and deadlines, so a delayed worker never produces a wrong reservation.
 */

export interface SweepCounts {
  offersExpired: number;
  bookingsExpired: number;
  tripHoldsExpired: number;
  quotesExpired: number;
}

export async function sweepExpiredHolds(prisma: PrismaClient, now = new Date(), limit = 200): Promise<SweepCounts> {
  const counts: SweepCounts = { offersExpired: 0, bookingsExpired: 0, tripHoldsExpired: 0, quotesExpired: 0 };
  const offers = await prisma.offer.findMany({ where: { status: { in: ['OPEN', 'COUNTERED'] }, expiresAt: { lte: now } }, select: { id: true }, take: limit });
  for (const o of offers) {
    if (await withTransaction(prisma, (tx) => expireOfferIfDue(tx, o.id, now))) counts.offersExpired++;
  }
  const bookings = await prisma.booking.findMany({
    where: { status: { in: ['DRAFT', 'AWAITING_CONFIRMATIONS'] }, reservation: { status: 'HELD', expiresAt: { lte: now } } },
    select: { id: true },
    take: limit,
  });
  for (const b of bookings) {
    if (await withTransaction(prisma, (tx) => expireBookingIfDue(tx, b.id, now))) counts.bookingsExpired++;
  }
  const trips = await prisma.tripReservation.findMany({ where: { status: 'HELD', expiresAt: { lte: now } }, select: { id: true }, take: limit });
  for (const t of trips) {
    if (await withTransaction(prisma, (tx) => expireTripHoldIfDue(tx, t.id, now))) counts.tripHoldsExpired++;
  }
  const quotes = await prisma.transportQuote.updateMany({ where: { status: 'SUBMITTED', validUntil: { lte: now } }, data: { status: 'EXPIRED', version: { increment: 1 } } });
  counts.quotesExpired = quotes.count;
  return counts;
}

/** Receiving decisions not reviewed by the deadline are escalated — never silently accepted. */
export async function escalateOverdueReceivingReviews(prisma: PrismaClient, now = new Date()): Promise<number> {
  const due = await prisma.receivingRecord.findMany({ where: { status: 'AWAITING_FARMER_REVIEW', reviewDeadline: { lte: now } }, select: { id: true, bookingId: true } });
  let n = 0;
  for (const r of due) {
    const changed = await withTransaction(prisma, async (tx) => {
      await lockRow(tx, 'receiving_records', r.id);
      const rec = await tx.receivingRecord.findUniqueOrThrow({ where: { id: r.id }, include: { booking: { select: { reference: true } } } });
      if (rec.status !== 'AWAITING_FARMER_REVIEW' || !rec.reviewDeadline || rec.reviewDeadline > now) return false;
      await tx.receivingRecord.update({ where: { id: r.id }, data: { status: transition(RECEIVING_MACHINE, rec.status, 'escalate'), escalatedAt: now, version: { increment: 1 } } });
      await audit(tx, { action: 'receiving.review-overdue', entityType: 'receiving_record', entityId: r.id, actorParty: 'SYSTEM' });
      await notify(tx, {
        userIds: [...(await adminUserIds(tx)), ...(await bookingRecipients(tx, r.bookingId, { farmer: 'APPROVE_SALE', processorRoles: ['OWNER', 'MANAGER'] }))],
        type: 'receiving.review-overdue',
        category: 'receiving',
        title: `Receiving review overdue for ${rec.booking.reference}`,
        body: 'The farmer has not reviewed the receiving decision. It has been escalated to HarvestSlot; it was not accepted automatically.',
        link: `/bookings/${r.bookingId}/receiving`,
        bookingId: r.bookingId,
        dedupeKey: `receiving-overdue:${r.id}`,
      });
      return true;
    });
    if (changed) n++;
  }
  return n;
}

/** Disputes whose response deadline passed move to administrator review. */
export async function escalateOverdueDisputes(prisma: PrismaClient, now = new Date()): Promise<number> {
  const due = await prisma.dispute.findMany({ where: { status: { in: ['OPEN', 'AWAITING_RESPONSE'] }, responseDeadline: { lte: now } }, select: { id: true } });
  let n = 0;
  for (const d of due) {
    const changed = await withTransaction(prisma, async (tx) => {
      await lockRow(tx, 'disputes', d.id);
      const dispute = await tx.dispute.findUniqueOrThrow({ where: { id: d.id } });
      if (!['OPEN', 'AWAITING_RESPONSE'].includes(dispute.status) || dispute.responseDeadline > now) return false;
      const to = transition(DISPUTE_MACHINE, dispute.status, 'escalate');
      await tx.dispute.update({ where: { id: d.id }, data: { status: to, version: { increment: 1 } } });
      await tx.disputeEvent.create({ data: { disputeId: d.id, fromStatus: dispute.status, toStatus: to, note: 'Response deadline passed; escalated to administrator review' } });
      await notify(tx, {
        userIds: await adminUserIds(tx),
        type: 'dispute.escalated',
        category: 'disputes',
        title: `Dispute ${dispute.reference} needs review`,
        body: 'The response deadline passed.',
        link: `/disputes/${d.id}`,
        bookingId: dispute.bookingId,
        dedupeKey: `dispute-escalated:${d.id}`,
      });
      return true;
    });
    if (changed) n++;
  }
  return n;
}

/** Time-based readiness changes (e.g. a pickup window passing) are persisted and notified. */
export async function recheckReadiness(prisma: PrismaClient, now = new Date()): Promise<number> {
  const bookings = await prisma.booking.findMany({ where: { status: { in: ['CONFIRMED', 'AWAITING_CONFIRMATIONS'] } }, select: { id: true, lastReadiness: true } });
  let changed = 0;
  for (const b of bookings) {
    const r = await withTransaction(prisma, (tx) => recomputeReadiness(tx, b.id, 'periodic-recheck', now));
    if (r && r.ready !== b.lastReadiness) changed++;
  }
  return changed;
}

/** One reminder per invoice per day while due within 2 days or overdue. */
export async function sendInvoiceReminders(prisma: PrismaClient, now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 2 * 86_400_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      dueAt: { lte: soon },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: dayAgo } }],
    },
    take: 200,
  });
  for (const inv of invoices) {
    await withTransaction(prisma, async (tx) => {
      const outstanding = inv.totalKobo - inv.confirmedPaidKobo;
      const overdue = inv.dueAt <= now;
      await notifyPaymentEvent(
        tx,
        inv.id,
        'PAYER',
        overdue ? 'invoice.overdue' : 'invoice.due-soon',
        `${inv.number} ${overdue ? 'is overdue' : 'is due soon'}: ${formatNaira(outstanding)} outstanding`,
        `Due ${inv.dueAt.toISOString().slice(0, 10)}. Record the payment in HarvestSlot once made so the recipient can confirm it.`,
        now,
      );
      await tx.invoice.update({ where: { id: inv.id }, data: { lastReminderAt: now } });
    });
  }
  return invoices.length;
}

/** Re-verifies provider payments still pending (missed webhooks / closed browser windows). */
export async function reconcilePendingPayments(prisma: PrismaClient, provider: PaymentProvider | null, now = new Date()): Promise<number> {
  if (!provider) return 0;
  const method = provider.name === 'simulated' ? 'PAYSTACK_SIMULATED' : 'PAYSTACK';
  const pending = await prisma.paymentAttempt.findMany({
    where: {
      method,
      status: 'PROVIDER_PENDING',
      createdAt: { lte: new Date(now.getTime() - 2 * 60_000), gte: new Date(now.getTime() - 7 * 86_400_000) },
      providerReference: { not: null },
    },
    take: 50,
  });
  let applied = 0;
  for (const p of pending) {
    try {
      const v = await provider.verify(p.providerReference!);
      if ((await applyVerifiedPayment(prisma, provider, v, 'reconciliation', now)) === 'applied') applied++;
    } catch (error) {
      console.error(`reconciliation failed for ${p.providerReference}`, error);
    }
  }
  return applied;
}

export async function cleanupIdempotencyRecords(prisma: PrismaClient, now = new Date()): Promise<number> {
  const r = await prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lte: now } } });
  return r.count;
}
