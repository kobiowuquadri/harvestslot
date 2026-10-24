import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  acceptAssignmentSchema,
  decideQuoteSchema,
  formatKg,
  formatNaira,
  gramsToKgString,
  submitQuoteSchema,
  toGrams,
  toleranceGrams,
  type BookingTermsContent,
  type QuoteDto,
} from '@harvestslot/contracts';
import {
  audit,
  bookingRecipients,
  DomainError,
  farmerRecipients,
  notify,
  orgRecipients,
  recomputeReadiness,
  TRIP_MACHINE,
  transition,
  withTransaction,
  type Actor,
} from '@harvestslot/core';
import type { Prisma } from '@harvestslot/db';
import { AccessService } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { kg, kobo } from '../../common/serialize.js';
import { BookingEngine } from '../bookings/booking-engine.service.js';
import { conflicts } from './fleet.service.js';

const quoteInclude = {
  booking: { select: { reference: true, currentTermsVersionNo: true, termsVersions: { select: { versionNo: true, content: true } } } },
  transporterOrg: { select: { name: true, status: true } },
  vehicle: true,
  driver: true,
  trip: { select: { id: true, status: true, expiresAt: true } },
} as const;
type QuoteRow = Prisma.TransportQuoteGetPayload<{ include: typeof quoteInclude }>;

function within(inner: { start: Date; end: Date }, outer: { start: string; end: string }) {
  return inner.start >= new Date(outer.start) && inner.end <= new Date(outer.end);
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly engine: BookingEngine,
  ) {}

  dto(q: QuoteRow): QuoteDto {
    const content = q.booking.termsVersions.find((v) => v.versionNo === q.booking.currentTermsVersionNo)?.content as unknown as BookingTermsContent | undefined;
    const changes = content
      ? !within({ start: q.pickupWindowStart, end: q.pickupWindowEnd }, content.pickupWindow) || !within({ start: q.deliveryWindowStart, end: q.deliveryWindowEnd }, content.deliveryWindow)
      : false;
    return {
      id: q.id,
      bookingId: q.bookingId,
      bookingReference: q.booking.reference,
      transporterOrgId: q.transporterOrgId,
      transporterName: q.transporterOrg.name,
      transporterReviewed: q.transporterOrg.status === 'APPROVED',
      vehicle: { id: q.vehicleId, plate: q.vehicle.registrationPlate, type: q.vehicle.type, capacityKg: kg(q.vehicle.capacityKg) },
      driver: q.driver ? { id: q.driver.id, name: q.driver.displayName } : null,
      status: q.status,
      pickupWindowStart: q.pickupWindowStart.toISOString(),
      pickupWindowEnd: q.pickupWindowEnd.toISOString(),
      deliveryWindowStart: q.deliveryWindowStart.toISOString(),
      deliveryWindowEnd: q.deliveryWindowEnd.toISOString(),
      priceKobo: kobo(q.priceKobo),
      freightPayer: q.freightPayer,
      includedServices: q.includedServices,
      cancellationTerms: q.cancellationTerms,
      validUntil: q.validUntil.toISOString(),
      changesAgreedWindows: changes,
      decisionReason: q.decisionReason,
      trip: q.trip ? { id: q.trip.id, status: q.trip.status, expiresAt: q.trip.expiresAt?.toISOString() ?? null } : null,
      version: q.version,
      createdAt: q.createdAt.toISOString(),
    };
  }

  async forBooking(actor: Actor, bookingId: string): Promise<QuoteDto[]> {
    const access = await this.access.booking(actor, bookingId);
    const rows = await this.prisma.db.transportQuote.findMany({
      where: { bookingId, ...(access.parties.every((p) => p === 'TRANSPORTER') && access.transporter ? { transporterOrgId: access.transporter.organisationId } : {}) },
      include: quoteInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.dto(r));
  }

  async forOrg(actor: Actor, orgId: string): Promise<QuoteDto[]> {
    await this.access.requireOrg(actor, orgId, 'transport.job.view');
    const rows = await this.prisma.db.transportQuote.findMany({ where: { transporterOrgId: orgId }, include: quoteInclude, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map((r) => this.dto(r));
  }

  async submit(actor: Actor, orgId: string, input: z.infer<typeof submitQuoteSchema>): Promise<QuoteDto> {
    await this.access.requireOrg(actor, orgId, 'transport.quote.manage', { requireApproved: true });
    const now = new Date();
    const b = await this.prisma.db.booking.findUnique({ where: { id: input.bookingId }, include: { harvestRequest: { include: { farmLocation: true } }, slot: true } });
    if (!b) throw new DomainError('NOT_FOUND', 'Booking not found');
    const area = await this.prisma.db.transportServiceArea.findUnique({ where: { organisationId_lga: { organisationId: orgId, lga: b.harvestRequest.farmLocation.lga } } });
    if (!area) throw new DomainError('NOT_FOUND', 'Booking not found');
    if (!['AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE'].includes(b.status)) throw new DomainError('INVALID_STATE_TRANSITION', 'This booking is not open for transport quotes');
    const { content } = await this.engine.currentTerms(this.prisma.db as never, b.id);
    const vehicle = await this.prisma.db.vehicle.findUnique({ where: { id: input.vehicleId } });
    if (!vehicle || vehicle.organisationId !== orgId) throw new DomainError('NOT_FOUND', 'Vehicle not found');
    if (vehicle.status !== 'ACTIVE') throw new DomainError('INVALID_STATE_TRANSITION', 'This vehicle is not active');
    const qtyG = toGrams(content.quantityKg);
    const needed = qtyG + toleranceGrams(qtyG, content.toleranceBps);
    if (toGrams(vehicle.capacityKg) < needed) {
      throw new DomainError('VEHICLE_CAPACITY_EXCEEDED', `This vehicle carries ${formatKg(vehicle.capacityKg.toString())}; the load can be up to ${formatKg(needed)} including tolerance`);
    }
    if (input.driverId) {
      const d = await this.prisma.db.driver.findUnique({ where: { id: input.driverId } });
      if (!d || d.organisationId !== orgId || d.status !== 'ACTIVE') throw new DomainError('NOT_FOUND', 'Driver not found');
    }
    const pickupStart = new Date(input.pickupWindowStart);
    const deliveryEnd = new Date(input.deliveryWindowEnd);
    if (pickupStart <= now) throw new DomainError('VALIDATION_FAILED', 'Pickup must be in the future');
    if (new Date(input.deliveryWindowStart) < b.slot.startsAt || deliveryEnd > b.slot.endsAt) {
      throw new DomainError('VALIDATION_FAILED', 'Delivery must fall inside the facility’s processing slot', [{ path: 'deliveryWindowStart', message: 'Outside the slot' }]);
    }
    const covered = await this.prisma.db.transportAvailability.count({ where: { vehicleId: vehicle.id, startsAt: { lte: pickupStart }, endsAt: { gte: deliveryEnd } } });
    if (!covered) throw new DomainError('VEHICLE_CONFLICT', 'Publish an availability window for this vehicle that covers the whole trip first');
    const policies = await this.prisma.policies();
    const block = { start: pickupStart, end: new Date(deliveryEnd.getTime() + policies.transportBufferMinutes * 60_000) };
    const c = await conflicts(this.prisma.db, block, { vehicleId: vehicle.id, driverId: input.driverId ?? null }, now);
    if (c.vehicle) throw new DomainError('VEHICLE_CONFLICT', `This vehicle is committed elsewhere at that time (including a ${policies.transportBufferMinutes}-minute turnaround buffer)`);
    if (c.driver) throw new DomainError('DRIVER_CONFLICT', 'This driver is committed elsewhere at that time');
    const org = await this.prisma.db.organisation.findUniqueOrThrow({ where: { id: orgId } });
    const quote = await withTransaction(this.prisma.db, async (tx) => {
      await tx.transportQuote.updateMany({ where: { bookingId: b.id, transporterOrgId: orgId, status: 'SUBMITTED' }, data: { status: 'SUPERSEDED', version: { increment: 1 } } });
      const q = await tx.transportQuote.create({
        data: {
          bookingId: b.id,
          transporterOrgId: orgId,
          vehicleId: vehicle.id,
          driverId: input.driverId ?? null,
          pickupWindowStart: pickupStart,
          pickupWindowEnd: new Date(input.pickupWindowEnd),
          deliveryWindowStart: new Date(input.deliveryWindowStart),
          deliveryWindowEnd: deliveryEnd,
          priceKobo: BigInt(input.priceKobo),
          freightPayer: content.freightPayer,
          includedServices: input.includedServices,
          cancellationTerms: input.cancellationTerms,
          validUntil: new Date(Math.min(now.getTime() + input.validForHours * 3_600_000, pickupStart.getTime())),
          submittedByUserId: actor.userId,
          isDemo: org.isDemo,
        },
      });
      await audit(tx, { actor, organisationId: orgId, action: 'quote.submitted', entityType: 'transport_quote', entityId: q.id, data: { bookingId: b.id, priceKobo: input.priceKobo } });
      const payerRecipients = content.freightPayer === 'FARMER' ? await farmerRecipients(tx, b.farmerProfileId, 'APPROVE_SALE', now) : await orgRecipients(tx, b.processorOrgId, ['OWNER', 'MANAGER']);
      await notify(tx, {
        userIds: payerRecipients,
        type: 'quote.received',
        category: 'transport',
        title: `Transport quote for ${b.reference}: ${formatNaira(input.priceKobo)}`,
        body: `${org.name}, ${vehicle.registrationPlate}. Accepting it reserves the vehicle and sends the full plan for confirmation.`,
        link: `/bookings/${b.id}#transport`,
        bookingId: b.id,
        dedupeKey: `quote-received:${q.id}`,
      });
      return q;
    });
    return this.dto(await this.prisma.db.transportQuote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude }));
  }

  async withdraw(actor: Actor, quoteId: string, reason?: string): Promise<QuoteDto> {
    const q = await this.prisma.db.transportQuote.findUnique({ where: { id: quoteId } });
    if (!q) throw new DomainError('NOT_FOUND', 'Quote not found');
    await this.access.requireOrg(actor, q.transporterOrgId, 'transport.quote.manage');
    const r = await this.prisma.db.transportQuote.updateMany({ where: { id: quoteId, status: 'SUBMITTED' }, data: { status: 'WITHDRAWN', decisionReason: reason ?? null, decidedAt: new Date(), version: { increment: 1 } } });
    if (r.count !== 1) throw new DomainError('INVALID_STATE_TRANSITION', 'Only an open quote can be withdrawn');
    await audit(this.prisma.db, { actor, organisationId: q.transporterOrgId, action: 'quote.withdrawn', entityType: 'transport_quote', entityId: quoteId });
    return this.dto(await this.prisma.db.transportQuote.findUniqueOrThrow({ where: { id: quoteId }, include: quoteInclude }));
  }

  private async payerAuthority(actor: Actor, q: { bookingId: string; freightPayer: string }) {
    const access = await this.access.booking(actor, q.bookingId);
    if (q.freightPayer === 'FARMER') return { access, farmer: this.access.requireFarmerAction(access, 'freight.accept'), party: 'FARMER' as const };
    this.access.requireProcessorRole(access, ['OWNER', 'MANAGER'], 'accept transport quotes');
    return { access, farmer: undefined, party: 'PROCESSOR' as const };
  }

  async decline(actor: Actor, quoteId: string, input: z.infer<typeof decideQuoteSchema>): Promise<QuoteDto> {
    const q = await this.prisma.db.transportQuote.findUnique({ where: { id: quoteId } });
    if (!q) throw new DomainError('NOT_FOUND', 'Quote not found');
    const { farmer } = await this.payerAuthority(actor, q);
    const r = await this.prisma.db.transportQuote.updateMany({ where: { id: quoteId, status: 'SUBMITTED', version: input.expectedVersion }, data: { status: 'DECLINED', decisionReason: input.reason ?? null, decidedAt: new Date(), decidedByUserId: actor.userId, version: { increment: 1 } } });
    if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The quote changed or is no longer open');
    await audit(this.prisma.db, { actor, farmer, action: 'quote.declined', entityType: 'transport_quote', entityId: quoteId, reason: input.reason ?? null });
    await notify(this.prisma.db, {
      userIds: await orgRecipients(this.prisma.db, q.transporterOrgId, ['OWNER', 'DISPATCHER']),
      type: 'quote.declined',
      category: 'transport',
      title: 'Transport quote declined',
      body: input.reason ?? 'The freight payer declined your quote.',
      link: '/transport/quotes',
      dedupeKey: `quote-declined:${quoteId}`,
    });
    return this.dto(await this.prisma.db.transportQuote.findUniqueOrThrow({ where: { id: quoteId }, include: quoteInclude }));
  }

  /**
   * Freight payer accepts a quote: reserves the vehicle (and driver if named) as a held trip and
   * proposes a terms version with this transport. The transporter must then confirm the assignment.
   */
  async accept(actor: Actor, quoteId: string, input: z.infer<typeof decideQuoteSchema>): Promise<QuoteDto> {
    const q0 = await this.prisma.db.transportQuote.findUnique({ where: { id: quoteId } });
    if (!q0) throw new DomainError('NOT_FOUND', 'Quote not found');
    const { farmer, party } = await this.payerAuthority(actor, q0);
    const now = new Date();
    const policies = await this.prisma.policies();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, q0.bookingId, { vehicleIds: [q0.vehicleId], driverIds: q0.driverId ? [q0.driverId] : [] });
      const q = await tx.transportQuote.findUniqueOrThrow({ where: { id: quoteId }, include: { vehicle: true, transporterOrg: true } });
      if (q.status !== 'SUBMITTED' || q.version !== input.expectedVersion) throw new DomainError('VERSION_CONFLICT', 'The quote changed or is no longer open');
      if (q.validUntil <= now) throw new DomainError('OFFER_EXPIRED', 'This quote has expired');
      if (q.transporterOrg.status !== 'APPROVED') throw new DomainError('ORG_NOT_APPROVED', 'This transporter is not currently approved');
      const b = await tx.booking.findUniqueOrThrow({ where: { id: q.bookingId }, include: { reservation: true } });
      if (!['AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE'].includes(b.status)) throw new DomainError('INVALID_STATE_TRANSITION', `The booking is ${b.status.toLowerCase()}`);
      const active = await tx.tripReservation.count({ where: { bookingId: b.id, status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } });
      if (active) throw new DomainError('DUPLICATE', 'Transport is already confirmed for this booking');
      const { content } = await this.engine.currentTerms(tx, b.id);
      const block = { start: q.pickupWindowStart, end: new Date(q.deliveryWindowEnd.getTime() + policies.transportBufferMinutes * 60_000) };
      const c = await conflicts(tx, block, { vehicleId: q.vehicleId, driverId: q.driverId }, now);
      if (c.vehicle) throw new DomainError('VEHICLE_CONFLICT', 'The vehicle has been committed elsewhere since this quote was made');
      if (c.driver) throw new DomainError('DRIVER_CONFLICT', 'The driver has been committed elsewhere since this quote was made');
      const holdUntil = b.status === 'AWAITING_CONFIRMATIONS' && b.reservation?.expiresAt ? b.reservation.expiresAt : new Date(now.getTime() + policies.bookingConfirmationHoldHours * 3_600_000);
      await tx.tripReservation.create({
        data: {
          bookingId: b.id,
          quoteId: q.id,
          transporterOrgId: q.transporterOrgId,
          vehicleId: q.vehicleId,
          driverId: q.driverId,
          startsAt: q.pickupWindowStart,
          endsAt: q.deliveryWindowEnd,
          bufferMinutes: policies.transportBufferMinutes,
          blockStartsAt: block.start,
          blockEndsAt: block.end,
          status: 'HELD',
          expiresAt: holdUntil,
        },
      });
      await tx.transportQuote.update({ where: { id: q.id }, data: { status: 'ACCEPTED', decidedAt: now, decidedByUserId: actor.userId, version: { increment: 1 } } });
      const next: BookingTermsContent = {
        ...content,
        transport: {
          quoteId: q.id,
          transporterOrgId: q.transporterOrgId,
          transporterName: q.transporterOrg.name,
          vehicleId: q.vehicleId,
          vehiclePlate: q.vehicle.registrationPlate,
          vehicleType: q.vehicle.type,
          vehicleCapacityKg: gramsToKgString(toGrams(q.vehicle.capacityKg)),
          pickupWindow: { start: q.pickupWindowStart.toISOString(), end: q.pickupWindowEnd.toISOString() },
          deliveryWindow: { start: q.deliveryWindowStart.toISOString(), end: q.deliveryWindowEnd.toISOString() },
          priceKobo: Number(q.priceKobo),
          freightPayer: q.freightPayer,
          includedServices: q.includedServices,
          cancellationTerms: q.cancellationTerms,
        },
      };
      const result = await this.engine.proposeVersion(tx, b.id, next, {
        reason: content.transport ? 'TRANSPORT_REPLACED' : 'TRANSPORT_ADDED',
        proposedByUserId: actor.userId,
        proposedByParty: party,
        amendmentReason: `${party === 'FARMER' ? 'Farmer' : 'Processor'} accepted transport by ${q.transporterOrg.name} (${q.vehicle.registrationPlate}) for ${formatNaira(q.priceKobo)}`,
        explicit: [party === 'FARMER' ? { party: 'FARMER', method: 'QUOTE_ACCEPTANCE', actorUserId: actor.userId, farmer } : { party: 'PROCESSOR', method: 'QUOTE_ACCEPTANCE', actorUserId: actor.userId, organisationId: b.processorOrgId }],
      });
      await audit(tx, { actor, farmer, action: 'quote.accepted', entityType: 'transport_quote', entityId: q.id, data: { bookingId: b.id, versionNo: result.version.versionNo } });
      await notify(tx, {
        userIds: await orgRecipients(tx, q.transporterOrgId, ['OWNER', 'DISPATCHER']),
        type: 'quote.accepted',
        category: 'transport',
        title: `Quote accepted for ${b.reference} — confirm the assignment`,
        body: `Assign a driver and confirm to lock in the trip. The vehicle is held until ${holdUntil.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
        link: '/transport/quotes',
        bookingId: b.id,
        dedupeKey: `quote-accepted:${q.id}`,
      });
      if (result.pendingParties.some((p) => p === 'FARMER' || p === 'PROCESSOR')) {
        await notify(tx, {
          userIds: await bookingRecipients(tx, b.id, { farmer: result.pendingParties.includes('FARMER') ? 'APPROVE_SALE' : undefined, processorRoles: result.pendingParties.includes('PROCESSOR') ? ['OWNER', 'MANAGER'] : [] }, now),
          type: 'booking.confirmation-needed',
          category: 'bookings',
          title: `${b.reference}: please review the updated plan`,
          body: 'The transport arrangement changes terms that affect you. Review and confirm.',
          link: `/bookings/${b.id}`,
          bookingId: b.id,
          dedupeKey: `confirm-needed:${result.version.id}`,
        });
      }
      await this.engine.settle(tx, b.id, now, actor, 'quote.accepted');
    });
    return this.dto(await this.prisma.db.transportQuote.findUniqueOrThrow({ where: { id: quoteId }, include: quoteInclude }));
  }

  /** Transporter confirms the assignment with a driver; this can complete the plan and confirm the booking. */
  async acceptAssignment(actor: Actor, input: z.infer<typeof acceptAssignmentSchema>): Promise<QuoteDto> {
    const q0 = await this.prisma.db.transportQuote.findUnique({ where: { id: input.quoteId } });
    if (!q0) throw new DomainError('NOT_FOUND', 'Quote not found');
    await this.access.requireOrg(actor, q0.transporterOrgId, 'transport.quote.manage', { requireApproved: true });
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, q0.bookingId, { vehicleIds: [q0.vehicleId], driverIds: [input.driverId] });
      const trip = await tx.tripReservation.findUnique({ where: { quoteId: input.quoteId } });
      if (!trip || trip.status !== 'HELD') throw new DomainError('INVALID_STATE_TRANSITION', 'There is no pending assignment for this quote');
      if (trip.expiresAt && trip.expiresAt <= now) throw new DomainError('HOLD_EXPIRED', 'The assignment hold has expired');
      const driver = await tx.driver.findUnique({ where: { id: input.driverId } });
      if (!driver || driver.organisationId !== q0.transporterOrgId || driver.status !== 'ACTIVE') throw new DomainError('NOT_FOUND', 'Driver not found');
      const c = await conflicts(tx, { start: trip.blockStartsAt, end: trip.blockEndsAt }, { vehicleId: trip.vehicleId, driverId: input.driverId }, now, trip.id);
      if (c.vehicle) throw new DomainError('VEHICLE_CONFLICT', 'The vehicle has another commitment at this time');
      if (c.driver) throw new DomainError('DRIVER_CONFLICT', `${driver.displayName} has another commitment at this time`);
      await tx.tripReservation.update({ where: { id: trip.id }, data: { driverId: input.driverId, version: { increment: 1 } } });
      const amendment = await tx.bookingAmendment.findFirst({ where: { bookingId: trip.bookingId, status: 'PENDING', termsVersion: { transportQuoteId: input.quoteId } }, include: { termsVersion: true } });
      if (!amendment) throw new DomainError('INVALID_STATE_TRANSITION', 'The transport proposal is no longer pending');
      await this.engine.recordConfirmation(tx, trip.bookingId, amendment.termsVersion, { party: 'TRANSPORTER', method: 'EXPLICIT', actorUserId: actor.userId, organisationId: q0.transporterOrgId });
      await audit(tx, { actor, organisationId: q0.transporterOrgId, action: 'assignment.accepted', entityType: 'trip', entityId: trip.id, data: { driverId: input.driverId } });
      await this.engine.settle(tx, trip.bookingId, now, actor, 'assignment.accepted');
    });
    return this.dto(await this.prisma.db.transportQuote.findUniqueOrThrow({ where: { id: input.quoteId }, include: quoteInclude }));
  }

  async declineAssignment(actor: Actor, quoteId: string, reason: string): Promise<QuoteDto> {
    const q0 = await this.prisma.db.transportQuote.findUnique({ where: { id: quoteId } });
    if (!q0) throw new DomainError('NOT_FOUND', 'Quote not found');
    await this.access.requireOrg(actor, q0.transporterOrgId, 'transport.quote.manage');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, q0.bookingId, { vehicleIds: [q0.vehicleId] });
      const trip = await tx.tripReservation.findUnique({ where: { quoteId } });
      if (!trip || trip.status !== 'HELD') throw new DomainError('INVALID_STATE_TRANSITION', 'There is no pending assignment for this quote');
      await tx.tripReservation.update({ where: { id: trip.id }, data: { status: 'RELEASED', cancelReason: reason, version: { increment: 1 } } });
      await tx.transportQuote.update({ where: { id: quoteId }, data: { status: 'WITHDRAWN', decisionReason: reason, version: { increment: 1 } } });
      await tx.bookingAmendment.updateMany({
        where: { bookingId: trip.bookingId, status: 'PENDING', termsVersion: { transportQuoteId: quoteId } },
        data: { status: 'REJECTED', decidedAt: now, decidedByUserId: actor.userId, rejectionReason: `Transporter declined: ${reason}`, version: { increment: 1 } },
      });
      await audit(tx, { actor, organisationId: q0.transporterOrgId, action: 'assignment.declined', entityType: 'trip', entityId: trip.id, reason });
      await notify(tx, {
        userIds: await bookingRecipients(tx, trip.bookingId, { farmer: true, processorRoles: ['OWNER', 'MANAGER'] }, now),
        type: 'assignment.declined',
        category: 'transport',
        title: 'Transporter declined the assignment',
        body: `${reason}. Choose another quote.`,
        link: `/bookings/${trip.bookingId}#transport`,
        bookingId: trip.bookingId,
        dedupeKey: `assignment-declined:${trip.id}`,
      });
      await recomputeReadiness(tx, trip.bookingId, 'assignment.declined', now);
    });
    return this.dto(await this.prisma.db.transportQuote.findUniqueOrThrow({ where: { id: quoteId }, include: quoteInclude }));
  }

  /**
   * Transporter cancels a confirmed trip before collection. The booking stays commercially agreed
   * but immediately loses readiness; after harvest has started an incident is opened for recovery.
   */
  async cancelTrip(actor: Actor, tripId: string, reason: string): Promise<{ ok: true }> {
    const t0 = await this.prisma.db.tripReservation.findUnique({ where: { id: tripId } });
    if (!t0) throw new DomainError('NOT_FOUND', 'Trip not found');
    await this.access.requireOrg(actor, t0.transporterOrgId, 'transport.quote.manage');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, t0.bookingId, { vehicleIds: [t0.vehicleId], driverIds: t0.driverId ? [t0.driverId] : [] });
      const trip = await tx.tripReservation.findUniqueOrThrow({ where: { id: tripId }, include: { shipment: true, booking: true } });
      transition(TRIP_MACHINE, trip.status, 'cancel', 'trip');
      if (trip.shipment && !['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP'].includes(trip.shipment.status)) {
        throw new DomainError('INVALID_STATE_TRANSITION', 'The cassava has already been collected. Report an incident instead of cancelling.');
      }
      await tx.tripReservation.update({ where: { id: tripId }, data: { status: 'CANCELLED', cancelledAt: now, cancelledByUserId: actor.userId, cancelReason: reason, version: { increment: 1 } } });
      if (trip.shipment) await tx.shipment.update({ where: { id: trip.shipment.id }, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason, version: { increment: 1 } } });
      await tx.bookingAmendment.updateMany({
        where: { bookingId: trip.bookingId, status: 'PENDING', termsVersion: { transportQuoteId: trip.quoteId } },
        data: { status: 'WITHDRAWN', decidedAt: now, rejectionReason: `Transporter cancelled: ${reason}`, version: { increment: 1 } },
      });
      if (trip.booking.status === 'ACTIVE') {
        await tx.bookingIncident.create({
          data: { bookingId: trip.bookingId, kind: 'TRANSPORT_FAILURE', blocking: true, description: `Transporter cancelled after harvest started: ${reason}`, openedByUserId: actor.userId, openedByParty: 'TRANSPORTER' },
        });
      }
      await audit(tx, { actor, organisationId: trip.transporterOrgId, action: 'trip.cancelled', entityType: 'trip', entityId: tripId, reason });
      await notify(tx, {
        userIds: await bookingRecipients(tx, trip.bookingId, { farmer: true, processorRoles: ['OWNER', 'MANAGER'], admins: trip.booking.status === 'ACTIVE' }, now),
        type: 'transport.cancelled',
        category: 'transport',
        title: `${trip.booking.reference}: transport cancelled — not ready`,
        body: `The transporter cancelled: ${reason}. ${trip.booking.status === 'ACTIVE' ? 'An incident was opened to arrange recovery.' : 'Do not harvest until replacement transport is confirmed.'}`,
        link: `/bookings/${trip.bookingId}#transport`,
        bookingId: trip.bookingId,
        dedupeKey: `transport-cancelled:${tripId}`,
      });
      await recomputeReadiness(tx, trip.bookingId, 'trip.cancelled', now);
    });
    return { ok: true };
  }
}
