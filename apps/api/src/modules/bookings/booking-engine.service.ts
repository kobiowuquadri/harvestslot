import { Injectable } from '@nestjs/common';
import {
  bookingTermsContentSchema,
  dbDateToString,
  formatKg,
  gramsToKgString,
  koboToNumber,
  produceAmountKobo,
  bpsOfKobo,
  qualityTermsSchema,
  toGrams,
  type BookingParty,
  type BookingTermsContent,
  type ConfirmationMethod,
} from '@harvestslot/contracts';
import {
  audit,
  BOOKING_MACHINE,
  bookingRecipients,
  DomainError,
  hashTerms,
  lockRow,
  lockRows,
  materialChanged,
  notify,
  recomputeReadiness,
  requestAllocation,
  requiredParties,
  slotUsage,
  transition,
  type Actor,
  type FarmerAuthority,
  type Policies,
} from '@harvestslot/core';
import type { BookingTermsVersion, Prisma, Tx } from '@harvestslot/db';

export interface ConfirmInput {
  party: BookingParty;
  method: ConfirmationMethod;
  actorUserId: string | null;
  farmer?: FarmerAuthority;
  organisationId?: string | null;
}

export interface VersionResult {
  version: BookingTermsVersion;
  amendmentId: string | null;
  pendingParties: BookingParty[];
}

type OfferForTerms = Prisma.OfferGetPayload<{
  include: {
    facility: true;
    processorOrg: true;
    harvestRequest: { include: { farmLocation: true; farmerProfile: true } };
  };
}>;
type OfferVersionForTerms = Prisma.OfferVersionGetPayload<{ include: { slot: { include: { line: true } } } }>;

/**
 * Transactional booking operations. All entry points take a transaction that already holds the
 * booking graph locks (see `lockGraph`) so state checks and writes are atomic.
 */
@Injectable()
export class BookingEngine {
  /** Locks harvest request → slot → booking → vehicles → drivers, in the global order. */
  async lockGraph(tx: Tx, bookingId: string, extra: { slotIds?: string[]; vehicleIds?: string[]; driverIds?: string[] } = {}): Promise<void> {
    const peek = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { harvestRequestId: true, slotId: true, trips: { where: { status: { in: ['HELD', 'CONFIRMED', 'IN_PROGRESS'] } }, select: { vehicleId: true, driverId: true } } },
    });
    if (!peek) throw new DomainError('NOT_FOUND', 'Booking not found');
    await lockRow(tx, 'harvest_requests', peek.harvestRequestId);
    await lockRows(tx, 'processing_slots', [peek.slotId, ...(extra.slotIds ?? [])]);
    await lockRow(tx, 'bookings', bookingId);
    await lockRows(tx, 'vehicles', [...peek.trips.map((t) => t.vehicleId), ...(extra.vehicleIds ?? [])]);
    await lockRows(tx, 'drivers', [...peek.trips.map((t) => t.driverId).filter((d): d is string => !!d), ...(extra.driverIds ?? [])]);
  }

  // ───────────── Terms snapshots ─────────────

  buildInitialTerms(reference: string, offer: OfferForTerms, v: OfferVersionForTerms, policies: Policies): BookingTermsContent {
    const qtyG = toGrams(v.quantityKg);
    const produce = produceAmountKobo(qtyG, v.priceKoboPerKg);
    const feeBps = policies.platformFeeEnabled ? policies.platformFeeBps : 0;
    const content: BookingTermsContent = {
      schemaVersion: 1,
      bookingReference: reference,
      farmer: { farmerProfileId: offer.harvestRequest.farmerProfileId, displayName: offer.harvestRequest.farmerProfile.displayName },
      processor: { organisationId: offer.processorOrgId, name: offer.processorOrg.name },
      facility: { id: offer.facilityId, name: offer.facility.name, lga: offer.facility.lga, address: offer.facility.address },
      line: { id: v.slot.lineId, name: v.slot.line.name, product: v.slot.line.product },
      slot: { id: v.slotId, startsAt: v.slot.startsAt.toISOString(), endsAt: v.slot.endsAt.toISOString() },
      harvest: {
        harvestRequestId: offer.harvestRequestId,
        reference: offer.harvestRequest.reference,
        plannedHarvestDate: dbDateToString(v.plannedHarvestDate),
        pickupLocationLabel: offer.harvestRequest.farmLocation.label,
        pickupLga: offer.harvestRequest.farmLocation.lga,
      },
      quantityKg: gramsToKgString(qtyG),
      priceKoboPerKg: koboToNumber(v.priceKoboPerKg),
      estimatedProduceAmountKobo: koboToNumber(produce),
      toleranceBps: v.toleranceBps,
      qualityTerms: qualityTermsSchema.parse(v.qualityTerms),
      pickupWindow: { start: v.pickupWindowStart.toISOString(), end: v.pickupWindowEnd.toISOString() },
      deliveryWindow: { start: v.deliveryWindowStart.toISOString(), end: v.deliveryWindowEnd.toISOString() },
      paymentTermsDays: v.paymentTermsDays,
      invoiceDueRule: `The produce invoice is issued for the accepted quantity when the receiving decision is final (or disputed for the undisputed part) and is due ${v.paymentTermsDays} day(s) later.`,
      cancellationTerms: v.cancellationTerms,
      rejectionHandling: v.rejectionHandling,
      freightPayer: v.freightPayer,
      transport: null,
      platformFee: { enabled: feeBps > 0, bps: feeBps, payer: 'PROCESSOR', estimatedKobo: koboToNumber(bpsOfKobo(produce, feeBps)) },
    };
    return bookingTermsContentSchema.parse(content);
  }

  /** Recomputes derived money fields after a change (estimated produce amount and fee). */
  recomputeDerived(content: BookingTermsContent): BookingTermsContent {
    const produce = produceAmountKobo(toGrams(content.quantityKg), BigInt(content.priceKoboPerKg));
    return bookingTermsContentSchema.parse({
      ...content,
      quantityKg: gramsToKgString(toGrams(content.quantityKg)),
      estimatedProduceAmountKobo: koboToNumber(produce),
      platformFee: { ...content.platformFee, estimatedKobo: koboToNumber(bpsOfKobo(produce, content.platformFee.bps)) },
    });
  }

  async currentTerms(tx: Tx, bookingId: string): Promise<{ version: BookingTermsVersion; content: BookingTermsContent }> {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { currentTermsVersionNo: true } });
    const version = await tx.bookingTermsVersion.findUniqueOrThrow({ where: { bookingId_versionNo: { bookingId, versionNo: b.currentTermsVersionNo } } });
    return { version, content: version.content as unknown as BookingTermsContent };
  }

  private versionColumns(content: BookingTermsContent) {
    return {
      quantityKg: content.quantityKg,
      priceKoboPerKg: BigInt(content.priceKoboPerKg),
      slotId: content.slot.id,
      freightPayer: content.freightPayer,
      freightKobo: content.transport ? BigInt(content.transport.priceKobo) : null,
      transportQuoteId: content.transport?.quoteId ?? null,
      platformFeeBps: content.platformFee.bps,
    };
  }

  async createInitialVersion(tx: Tx, bookingId: string, content: BookingTermsContent, createdByUserId: string, confirmations: ConfirmInput[]): Promise<BookingTermsVersion> {
    const version = await tx.bookingTermsVersion.create({
      data: { bookingId, versionNo: 1, reason: 'INITIAL', content, contentHash: hashTerms(content), createdByUserId, ...this.versionColumns(content) },
    });
    for (const c of confirmations) await this.recordConfirmation(tx, bookingId, version, c);
    return version;
  }

  /**
   * Proposes a new terms version as a pending amendment. Confirmations of parties whose material terms
   * are unchanged are carried forward; the proposer's explicit confirmations are recorded; everyone
   * else must confirm again. The current version stays in force until the amendment is accepted.
   */
  async proposeVersion(
    tx: Tx,
    bookingId: string,
    next: BookingTermsContent,
    opts: {
      reason: 'TRANSPORT_ADDED' | 'TRANSPORT_REPLACED' | 'AMENDMENT' | 'OVER_DELIVERY';
      proposedByUserId: string;
      proposedByParty: BookingParty;
      amendmentReason: string;
      explicit: ConfirmInput[];
      baseVersionNo?: number;
    },
  ): Promise<VersionResult> {
    const pending = await tx.bookingAmendment.findFirst({ where: { bookingId, status: 'PENDING' } });
    if (pending) throw new DomainError('DUPLICATE', 'Another change to this booking is awaiting decisions. Resolve it first.');
    const { version: current, content: currentContent } = await this.currentTerms(tx, bookingId);
    if (opts.baseVersionNo !== undefined && opts.baseVersionNo !== current.versionNo) {
      throw new DomainError('TERMS_CHANGED', `The terms changed (now version ${current.versionNo}). Review the latest terms first.`);
    }
    const content = this.recomputeDerived(next);
    const hash = hashTerms(content);
    if (hash === current.contentHash) throw new DomainError('BAD_REQUEST', 'The proposed terms are identical to the current terms');
    const max = await tx.bookingTermsVersion.aggregate({ where: { bookingId }, _max: { versionNo: true } });
    const version = await tx.bookingTermsVersion.create({
      data: {
        bookingId,
        versionNo: (max._max.versionNo ?? 0) + 1,
        reason: opts.reason,
        content,
        contentHash: hash,
        createdByUserId: opts.proposedByUserId,
        ...this.versionColumns(content),
      },
    });
    const amendment = await tx.bookingAmendment.create({
      data: {
        bookingId,
        termsVersionId: version.id,
        baseVersionNo: current.versionNo,
        proposedByUserId: opts.proposedByUserId,
        proposedByParty: opts.proposedByParty,
        reason: opts.amendmentReason,
      },
    });
    for (const c of opts.explicit) await this.recordConfirmation(tx, bookingId, version, c);
    const currentConfs = await tx.confirmation.findMany({ where: { termsVersionId: current.id } });
    const explicitParties = new Set(opts.explicit.map((e) => e.party));
    for (const conf of currentConfs) {
      if (explicitParties.has(conf.party)) continue;
      if (!requiredParties(content).includes(conf.party)) continue;
      if (!materialChanged(conf.party, currentContent, content)) {
        await tx.confirmation.create({
          data: {
            bookingId,
            termsVersionId: version.id,
            party: conf.party,
            method: 'CARRIED_FORWARD',
            actorUserId: conf.actorUserId,
            actingForFarmerId: conf.actingForFarmerId,
            delegationId: conf.delegationId,
            organisationId: conf.organisationId,
            carriedFromId: conf.id,
            contentHash: hash,
          },
        });
      }
    }
    return { version, amendmentId: amendment.id, pendingParties: await this.pendingParties(tx, version) };
  }

  async recordConfirmation(tx: Tx, bookingId: string, version: BookingTermsVersion, c: ConfirmInput): Promise<boolean> {
    const existing = await tx.confirmation.findUnique({ where: { termsVersionId_party: { termsVersionId: version.id, party: c.party } } });
    if (existing) return false;
    await tx.confirmation.create({
      data: {
        bookingId,
        termsVersionId: version.id,
        party: c.party,
        method: c.method,
        actorUserId: c.actorUserId,
        actingForFarmerId: c.farmer?.mode === 'DELEGATE' ? c.farmer.farmerProfileId : null,
        delegationId: c.farmer?.mode === 'DELEGATE' ? c.farmer.delegationId : null,
        organisationId: c.organisationId ?? null,
        contentHash: version.contentHash,
      },
    });
    return true;
  }

  async pendingParties(tx: Tx, version: BookingTermsVersion): Promise<BookingParty[]> {
    const content = version.content as unknown as BookingTermsContent;
    const confs = await tx.confirmation.findMany({ where: { termsVersionId: version.id }, select: { party: true } });
    const have = new Set(confs.map((c) => c.party));
    return requiredParties(content).filter((p) => !have.has(p));
  }

  // ───────────── Applying an accepted amendment ─────────────

  /**
   * If the pending amendment has every required confirmation, accept it: make it the current version
   * and apply its side effects (capacity/supply resize, slot move, transport switch) atomically.
   */
  async tryFinalizeAmendment(tx: Tx, bookingId: string, now: Date, actor: Actor | null): Promise<boolean> {
    const amendment = await tx.bookingAmendment.findFirst({ where: { bookingId, status: 'PENDING' }, include: { termsVersion: true } });
    if (!amendment) return false;
    if ((await this.pendingParties(tx, amendment.termsVersion)).length > 0) return false;
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { reservation: true, harvestLot: true } });
    const { content: before } = await this.currentTerms(tx, bookingId);
    const after = amendment.termsVersion.content as unknown as BookingTermsContent;

    // Quantity / slot changes re-check supply and capacity under the locks already held.
    const beforeG = toGrams(before.quantityKg);
    const afterG = toGrams(after.quantityKg);
    if (booking.reservation && (afterG !== beforeG || after.slot.id !== before.slot.id)) {
      const r = booking.reservation;
      if (after.slot.id !== before.slot.id) {
        const usage = await slotUsage(tx, after.slot.id, now);
        if (usage.availableG < afterG) throw new DomainError('CAPACITY_EXCEEDED', `The new slot has only ${formatKg(usage.availableG)} available`);
        await tx.reservation.update({ where: { id: r.id }, data: { slotId: after.slot.id, quantityKg: after.quantityKg, version: { increment: 1 } } });
        await tx.booking.update({ where: { id: bookingId }, data: { slotId: after.slot.id } });
      } else if (afterG > beforeG) {
        const usage = await slotUsage(tx, after.slot.id, now);
        if (usage.availableG < afterG - beforeG) {
          throw new DomainError('CAPACITY_EXCEEDED', `Only ${formatKg(usage.availableG)} more can be added to this slot`);
        }
        await tx.reservation.update({ where: { id: r.id }, data: { quantityKg: after.quantityKg, version: { increment: 1 } } });
      } else {
        await tx.reservation.update({ where: { id: r.id }, data: { quantityKg: after.quantityKg, version: { increment: 1 } } });
      }
      if (booking.harvestLot && afterG !== beforeG) {
        if (afterG > beforeG) {
          const request = await tx.harvestRequest.findUniqueOrThrow({ where: { id: booking.harvestRequestId } });
          const allocated = await requestAllocation(tx, booking.harvestRequestId, now);
          if (allocated - beforeG + afterG > toGrams(request.eligibleQuantityKg)) {
            throw new DomainError('SUPPLY_EXCEEDED', 'The farmer’s harvest request does not have that much unallocated quantity. Update the request quantity first.');
          }
        }
        await tx.harvestLot.update({ where: { id: booking.harvestLot.id }, data: { quantityKg: after.quantityKg, version: { increment: 1 } } });
      }
    }

    // Transport switch: confirm the new trip, release the replaced one.
    const newQuote = after.transport?.quoteId ?? null;
    const oldQuote = before.transport?.quoteId ?? null;
    if (newQuote && newQuote !== oldQuote) {
      const trip = await tx.tripReservation.findUnique({ where: { quoteId: newQuote } });
      if (!trip || trip.status !== 'HELD') throw new DomainError('INVALID_STATE_TRANSITION', 'The transport hold is no longer valid');
      if (trip.expiresAt && trip.expiresAt <= now) throw new DomainError('HOLD_EXPIRED', 'The transport hold expired before everyone confirmed');
      if (!trip.driverId) throw new DomainError('INVALID_STATE_TRANSITION', 'The transporter must assign a driver first');
      await tx.tripReservation.updateMany({
        where: { bookingId, id: { not: trip.id }, status: { in: ['HELD', 'CONFIRMED'] } },
        data: { status: 'RELEASED', cancelReason: 'Replaced by new transport', version: { increment: 1 } },
      });
      await tx.shipment.updateMany({ where: { bookingId, status: { in: ['ASSIGNED', 'EN_ROUTE_TO_PICKUP'] } }, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'Replaced by new transport', version: { increment: 1 } } });
      await tx.tripReservation.update({ where: { id: trip.id }, data: { status: 'CONFIRMED', confirmedAt: now, expiresAt: null, version: { increment: 1 } } });
      await tx.shipment.create({
        data: { bookingId, tripId: trip.id, transporterOrgId: trip.transporterOrgId, vehicleId: trip.vehicleId, driverId: trip.driverId },
      });
      await tx.transportQuote.updateMany({ where: { bookingId, status: 'SUBMITTED' }, data: { status: 'SUPERSEDED', version: { increment: 1 } } });
    }

    await tx.bookingAmendment.update({ where: { id: amendment.id }, data: { status: 'ACCEPTED', decidedAt: now, decidedByUserId: actor?.userId ?? null, version: { increment: 1 } } });
    await tx.booking.update({ where: { id: bookingId }, data: { currentTermsVersionNo: amendment.termsVersion.versionNo, version: { increment: 1 } } });
    await audit(tx, { actor, action: 'booking.terms-accepted', entityType: 'booking', entityId: bookingId, data: { versionNo: amendment.termsVersion.versionNo, reason: amendment.termsVersion.reason } });
    await notify(tx, {
      userIds: await bookingRecipients(tx, bookingId, { farmer: true, processorRoles: ['OWNER', 'MANAGER'], transporter: true }, now),
      type: 'booking.terms-accepted',
      category: 'bookings',
      title: `${booking.reference}: version ${amendment.termsVersion.versionNo} of the terms is now agreed`,
      body: amendment.reason,
      link: `/bookings/${bookingId}`,
      bookingId,
      dedupeKey: `terms-accepted:${amendment.id}`,
    });
    return true;
  }

  /** Promotes the capacity hold and confirms the booking once complete terms are agreed by everyone. */
  async tryConfirmBooking(tx: Tx, bookingId: string, now: Date, actor: Actor | null): Promise<boolean> {
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { reservation: true } });
    if (booking.status !== 'AWAITING_CONFIRMATIONS') return false;
    const { version, content } = await this.currentTerms(tx, bookingId);
    if (!content.transport) return false;
    if ((await this.pendingParties(tx, version)).length > 0) return false;
    if (await tx.bookingAmendment.findFirst({ where: { bookingId, status: 'PENDING' } })) return false;
    const r = booking.reservation;
    if (!r || r.status !== 'HELD') throw new DomainError('INVALID_STATE_TRANSITION', 'The capacity reservation is no longer held');
    if (!r.expiresAt || r.expiresAt <= now) {
      throw new DomainError('HOLD_EXPIRED', 'The capacity hold expired before every party confirmed. The booking can no longer be confirmed.');
    }
    await tx.reservation.update({ where: { id: r.id }, data: { status: 'CONFIRMED', confirmedAt: now, expiresAt: null, version: { increment: 1 } } });
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: transition(BOOKING_MACHINE, booking.status, 'confirm', 'booking'), confirmedAt: now, confirmationDeadline: null, version: { increment: 1 } },
    });
    await audit(tx, { actor, action: 'booking.confirmed', entityType: 'booking', entityId: bookingId, data: { versionNo: version.versionNo } });
    await notify(tx, {
      userIds: await bookingRecipients(tx, bookingId, { farmer: true, processorRoles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'], transporter: true }, now),
      type: 'booking.confirmed',
      category: 'bookings',
      title: `${booking.reference} is confirmed`,
      body: `Buyer, processing capacity and transport are agreed for ${formatKg(content.quantityKg)}.`,
      link: `/bookings/${bookingId}`,
      bookingId,
      dedupeKey: `booking-confirmed:${bookingId}`,
    });
    return true;
  }

  /** After any confirmation: finalise a complete amendment, confirm the booking if possible, recompute readiness. */
  async settle(tx: Tx, bookingId: string, now: Date, actor: Actor | null, trigger: string): Promise<void> {
    await this.tryFinalizeAmendment(tx, bookingId, now, actor);
    await this.tryConfirmBooking(tx, bookingId, now, actor);
    await recomputeReadiness(tx, bookingId, trigger, now);
  }

  assertNotTerminal(status: string): void {
    if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(status)) {
      throw new DomainError('INVALID_STATE_TRANSITION', `This booking is ${status.toLowerCase()}`);
    }
  }
}
