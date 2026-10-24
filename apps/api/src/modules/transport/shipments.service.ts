import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  confirmPickupSchema,
  formatKg,
  gpsInputSchema,
  jobMilestoneSchema,
  recordCollectionSchema,
  type BookingTermsContent,
  type JobDto,
} from '@harvestslot/contracts';
import {
  audit,
  bookingRecipients,
  DomainError,
  issueFreightInvoice,
  notify,
  orgRecipients,
  SHIPMENT_MACHINE,
  TRIP_MACHINE,
  transition,
  withTransaction,
  type Actor,
  type ShipmentAction,
} from '@harvestslot/core';
import type { Prisma, Tx } from '@harvestslot/db';
import { AccessService, type BookingAccess } from '../../common/access.service.js';
import { hmacHex, numericCode, safeEqual } from '../../common/crypto.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso, kg, kobo } from '../../common/serialize.js';
import { ENV, type Env } from '../../common/tokens.js';
import { BookingEngine } from '../bookings/booking-engine.service.js';

const jobInclude = {
  booking: {
    include: {
      farmerProfile: true,
      facility: true,
      harvestRequest: { include: { farmLocation: true } },
      harvestLot: true,
      termsVersions: true,
    },
  },
  trip: { include: { vehicle: true, quote: true } },
  pickupRecord: true,
} as const;
type JobRow = Prisma.ShipmentGetPayload<{ include: typeof jobInclude }>;

type Gps = z.infer<typeof gpsInputSchema>;

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly engine: BookingEngine,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async driverOf(row: { driverId: string }) {
    return this.prisma.db.driver.findUniqueOrThrow({ where: { id: row.driverId } });
  }

  private async dto(s: JobRow, actor: Actor): Promise<JobDto> {
    const driver = await this.driverOf(s);
    const c = s.booking.termsVersions.find((v) => v.versionNo === s.booking.currentTermsVersionNo)!.content as unknown as BookingTermsContent;
    const loc = s.booking.harvestRequest.farmLocation;
    const isDriver = driver.userId === actor.userId;
    const memberships = await this.access.memberships(actor);
    const isManager = memberships.some((m) => m.organisationId === s.transporterOrgId && m.roles.some((r) => r === 'OWNER' || r === 'DISPATCHER'));
    const can = isDriver || isManager;
    const actions: string[] = [];
    const next = (a: ShipmentAction) => SHIPMENT_MACHINE[s.status]?.[a] !== undefined;
    if (can) {
      if (next('depart')) actions.push('depart');
      if (next('arrivePickup')) actions.push('arrivePickup');
      if (next('recordCollection') && s.booking.status === 'ACTIVE') actions.push('recordCollection');
      if (s.status === 'COLLECTED') actions.push('enterPickupCode', 'pickupException');
      if (next('leavePickup')) actions.push('leavePickup');
      if (next('arriveFacility')) actions.push('arriveFacility');
      if (s.status === 'ARRIVED_AT_FACILITY') actions.push('enterDeliveryCode');
      if (isManager && next('cancel')) actions.push('cancelTrip');
    }
    return {
      shipmentId: s.id,
      tripId: s.tripId,
      bookingId: s.bookingId,
      bookingReference: s.booking.reference,
      status: s.status,
      tripStatus: s.trip.status,
      version: s.version,
      vehicle: { plate: s.trip.vehicle.registrationPlate, type: s.trip.vehicle.type },
      driver: { id: driver.id, name: driver.displayName, phone: driver.phone },
      quantityKg: c.quantityKg,
      pickupWindow: { start: s.trip.startsAt.toISOString(), end: s.trip.quote.pickupWindowEnd.toISOString() },
      deliveryWindow: { start: s.trip.quote.deliveryWindowStart.toISOString(), end: s.trip.endsAt.toISOString() },
      pickup: {
        farmerName: s.booking.farmerProfile.displayName,
        farmerPhone: s.booking.farmerProfile.phone,
        label: loc.label,
        lga: loc.lga,
        community: loc.community,
        directions: loc.directions,
        exact: loc.exactLat !== null && loc.exactLng !== null ? { lat: Number(loc.exactLat), lng: Number(loc.exactLng), accuracyM: loc.accuracyM } : null,
      },
      destination: { facilityName: s.booking.facility.name, address: s.booking.facility.address, lat: Number(s.booking.facility.lat), lng: Number(s.booking.facility.lng) },
      milestones: {
        enRouteAt: iso(s.enRouteAt),
        arrivedPickupAt: iso(s.arrivedPickupAt),
        collectedAt: iso(s.collectedAt),
        pickupConfirmedAt: iso(s.pickupConfirmedAt),
        departedAt: iso(s.departedAt),
        arrivedFacilityAt: iso(s.arrivedFacilityAt),
        deliveredAt: iso(s.deliveredAt),
      },
      pickupRecord: s.pickupRecord
        ? {
            reportedQuantityKg: kg(s.pickupRecord.reportedQuantityKg),
            confirmationMethod: s.pickupRecord.confirmationMethod,
            confirmedAt: iso(s.pickupRecord.confirmedAt),
            farmerReportedQuantityKg: kg(s.pickupRecord.farmerReportedQuantityKg),
            exceptionReason: s.pickupRecord.exceptionReason,
            locationSource: s.pickupRecord.locationSource,
            accuracyM: s.pickupRecord.accuracyM,
          }
        : null,
      harvestStatus: s.booking.harvestLot?.status ?? 'UNKNOWN',
      allowedActions: actions,
      priceKobo: kobo(s.trip.quote.priceKobo),
      freightPayer: s.trip.quote.freightPayer,
    };
  }

  async jobs(actor: Actor, orgId: string): Promise<JobDto[]> {
    const m = await this.access.requireOrg(actor, orgId, 'transport.job.view');
    const driverOnly = !m.roles.some((r) => r === 'OWNER' || r === 'DISPATCHER');
    const rows = await this.prisma.db.shipment.findMany({
      where: { transporterOrgId: orgId, ...(driverOnly ? { driverId: { in: (await this.prisma.db.driver.findMany({ where: { userId: actor.userId, organisationId: orgId } })).map((d) => d.id) } } : {}) },
      include: jobInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return Promise.all(rows.map((r) => this.dto(r, actor)));
  }

  /** Only the transporter organisation (and the assigned driver) see the job card with exact pickup details. */
  async job(actor: Actor, shipmentId: string): Promise<JobDto> {
    const s = await this.prisma.db.shipment.findUnique({ where: { id: shipmentId }, include: jobInclude });
    if (!s) throw new DomainError('NOT_FOUND', 'Job not found');
    const driver = await this.driverOf(s);
    if (driver.userId !== actor.userId) await this.access.requireOrg(actor, s.transporterOrgId, 'transport.job.view');
    return this.dto(s, actor);
  }

  private async lockShipment(tx: Tx, shipmentId: string) {
    const peek = await tx.shipment.findUnique({ where: { id: shipmentId }, select: { bookingId: true, vehicleId: true, driverId: true } });
    if (!peek) throw new DomainError('NOT_FOUND', 'Job not found');
    await this.engine.lockGraph(tx, peek.bookingId, { vehicleIds: [peek.vehicleId], driverIds: [peek.driverId] });
    await tx.$queryRawUnsafe('SELECT id FROM shipments WHERE id = $1::uuid FOR UPDATE', shipmentId);
    return tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { booking: { include: { harvestLot: true } }, trip: true, pickupRecord: true } });
  }

  private async assertTransporterSide(actor: Actor, s: { transporterOrgId: string; driverId: string }) {
    const driver = await this.prisma.db.driver.findUniqueOrThrow({ where: { id: s.driverId } });
    if (driver.userId === actor.userId) return 'DRIVER' as const;
    await this.access.requireOrg(actor, s.transporterOrgId, 'transport.quote.manage');
    return 'DISPATCHER' as const;
  }

  private gpsData(gps: Gps) {
    return gps ? { lat: gps.point.lat, lng: gps.point.lng, accuracyM: gps.accuracyM ?? null, source: gps.source } : null;
  }

  /** Simple milestones recorded by the driver (or dispatcher): depart, arrive at farm, leave farm, arrive at facility. */
  async milestone(actor: Actor, shipmentId: string, action: 'depart' | 'arrivePickup' | 'leavePickup' | 'arriveFacility', input: z.infer<typeof jobMilestoneSchema>): Promise<JobDto> {
    const s0 = await this.prisma.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s0) throw new DomainError('NOT_FOUND', 'Job not found');
    await this.assertTransporterSide(actor, s0);
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const s = await this.lockShipment(tx, shipmentId);
      if (s.version !== input.expectedVersion) throw new DomainError('VERSION_CONFLICT', 'The job changed. Reload and try again.');
      if (action === 'depart' && !['CONFIRMED', 'ACTIVE'].includes(s.booking.status)) throw new DomainError('INVALID_STATE_TRANSITION', 'The booking is not confirmed');
      const to = transition(SHIPMENT_MACHINE, s.status, action, 'job');
      const field = { depart: 'enRouteAt', arrivePickup: 'arrivedPickupAt', leavePickup: 'departedAt', arriveFacility: 'arrivedFacilityAt' }[action];
      await tx.shipment.update({ where: { id: shipmentId }, data: { status: to, [field]: now, version: { increment: 1 } } });
      await audit(tx, { actor, organisationId: s.transporterOrgId, action: `shipment.${action}`, entityType: 'shipment', entityId: shipmentId, data: { gps: this.gpsData(input.gps), note: input.note ?? null } });
      if (action === 'arriveFacility') {
        await notify(tx, {
          userIds: await orgRecipients(tx, s.booking.processorOrgId, ['OWNER', 'MANAGER', 'RECEIVING_OFFICER']),
          type: 'delivery.arrived',
          category: 'receiving',
          title: `${s.booking.reference}: truck arrived at the facility`,
          body: 'Confirm receipt and record the weighing.',
          link: `/processor/receiving/${s.bookingId}`,
          bookingId: s.bookingId,
          dedupeKey: `arrived:${shipmentId}`,
        });
      } else if (action === 'arrivePickup' || action === 'depart') {
        await notify(tx, {
          userIds: await bookingRecipients(tx, s.bookingId, { farmer: true }, now),
          type: `pickup.${action}`,
          category: 'transport',
          title: action === 'depart' ? `${s.booking.reference}: driver on the way` : `${s.booking.reference}: driver at your farm`,
          body: action === 'depart' ? 'The driver has set off for your farm. (Manual update by the driver; not live tracking.)' : 'The driver reports arriving at the pickup point.',
          link: `/bookings/${s.bookingId}`,
          bookingId: s.bookingId,
          dedupeKey: `pickup-${action}:${shipmentId}`,
        });
      }
    });
    return this.job(actor, shipmentId);
  }

  async recordCollection(actor: Actor, shipmentId: string, input: z.infer<typeof recordCollectionSchema>): Promise<JobDto> {
    const s0 = await this.prisma.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s0) throw new DomainError('NOT_FOUND', 'Job not found');
    await this.assertTransporterSide(actor, s0);
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const s = await this.lockShipment(tx, shipmentId);
      if (s.version !== input.expectedVersion) throw new DomainError('VERSION_CONFLICT', 'The job changed. Reload and try again.');
      if (s.booking.status !== 'ACTIVE' || !['HARVEST_STARTED', 'READY_FOR_PICKUP'].includes(s.booking.harvestLot?.status ?? '')) {
        throw new DomainError('INVALID_STATE_TRANSITION', 'The farmer has not started the harvest for this booking');
      }
      const to = transition(SHIPMENT_MACHINE, s.status, 'recordCollection', 'job');
      if (input.evidenceAttachmentIds.length) {
        const n = await tx.attachment.count({ where: { id: { in: input.evidenceAttachmentIds }, bookingId: s.bookingId, purpose: 'PICKUP_EVIDENCE' } });
        if (n !== input.evidenceAttachmentIds.length) throw new DomainError('VALIDATION_FAILED', 'Evidence files must be pickup evidence uploaded for this booking');
      }
      const record = await tx.pickupRecord.create({
        data: {
          shipmentId,
          bookingId: s.bookingId,
          reportedQuantityKg: input.quantityKg,
          recordedByUserId: actor.userId,
          lat: input.gps?.point.lat ?? null,
          lng: input.gps?.point.lng ?? null,
          accuracyM: input.gps?.accuracyM ?? null,
          locationSource: input.gps ? input.gps.source : null,
          note: input.note ?? null,
        },
      });
      if (input.evidenceAttachmentIds.length) await tx.attachment.updateMany({ where: { id: { in: input.evidenceAttachmentIds } }, data: { linkedEntityId: record.id } });
      await tx.shipment.update({ where: { id: shipmentId }, data: { status: to, collectedAt: now, version: { increment: 1 } } });
      await audit(tx, { actor, organisationId: s.transporterOrgId, action: 'shipment.collected', entityType: 'shipment', entityId: shipmentId, data: { quantityKg: input.quantityKg } });
      await notify(tx, {
        userIds: await bookingRecipients(tx, s.bookingId, { farmer: 'CONFIRM_HANDOVER' }, now),
        type: 'pickup.confirm-needed',
        category: 'transport',
        title: `${s.booking.reference}: confirm the pickup`,
        body: `The driver reports loading ${formatKg(input.quantityKg)}. Confirm in the app, or give the driver your handover code. Do not confirm if you disagree.`,
        link: `/bookings/${s.bookingId}#pickup`,
        bookingId: s.bookingId,
        dedupeKey: `pickup-confirm:${shipmentId}`,
      });
    });
    return this.job(actor, shipmentId);
  }

  // ───────────── Handover codes and counterparty acknowledgements ─────────────

  private codeHash(shipmentId: string, purpose: string, code: string): string {
    return hmacHex(this.env.SESSION_SECRET, `handover:${shipmentId}:${purpose}:${code}`);
  }

  /** The counterparty (farmer side for PICKUP, receiving staff for DELIVERY) shows a one-time code to the driver. */
  async issueCode(actor: Actor, shipmentId: string, purpose: 'PICKUP' | 'DELIVERY'): Promise<{ code: string; expiresAt: string }> {
    const s = await this.prisma.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s) throw new DomainError('NOT_FOUND', 'Job not found');
    const access = await this.access.booking(actor, s.bookingId);
    if (purpose === 'PICKUP') {
      this.access.requireFarmerAction(access, 'pickup.confirm');
      if (s.status !== 'COLLECTED') throw new DomainError('INVALID_STATE_TRANSITION', 'A pickup code is available once the driver records the loading');
    } else {
      this.access.requireProcessorRole(access, ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'], 'confirm deliveries');
      if (s.status !== 'ARRIVED_AT_FACILITY') throw new DomainError('INVALID_STATE_TRANSITION', 'A delivery code is available once the truck has arrived');
    }
    const code = numericCode(6);
    const policies = await this.prisma.policies();
    const expiresAt = new Date(Date.now() + policies.handoverCodeTtlMinutes * 60_000);
    await withTransaction(this.prisma.db, async (tx) => {
      await tx.handoverCode.updateMany({ where: { shipmentId, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.handoverCode.create({ data: { shipmentId, purpose, codeHash: this.codeHash(shipmentId, purpose, code), expiresAt, issuedToUserId: actor.userId } });
      await audit(tx, { actor, farmer: access.farmer, action: `handover.${purpose.toLowerCase()}-code-issued`, entityType: 'shipment', entityId: shipmentId });
    });
    return { code, expiresAt: expiresAt.toISOString() };
  }

  /** Driver enters the counterparty's code. Five wrong attempts lock the code; a new one must be issued. */
  async enterCode(actor: Actor, shipmentId: string, purpose: 'PICKUP' | 'DELIVERY', code: string): Promise<JobDto> {
    const s0 = await this.prisma.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s0) throw new DomainError('NOT_FOUND', 'Job not found');
    await this.assertTransporterSide(actor, s0);
    const now = new Date();
    const failure = await withTransaction(this.prisma.db, async (tx) => {
      await this.lockShipment(tx, shipmentId);
      const hc = await tx.handoverCode.findFirst({ where: { shipmentId, purpose, consumedAt: null }, orderBy: { createdAt: 'desc' } });
      if (!hc || hc.expiresAt <= now) return new DomainError('HANDOVER_CODE_INVALID', 'No valid code. Ask the other party to show a new code.');
      if (hc.attempts >= hc.maxAttempts) return new DomainError('HANDOVER_CODE_LOCKED', 'Too many wrong codes. Ask for a new code.', { retryAfterSeconds: 60 });
      if (!safeEqual(hc.codeHash, this.codeHash(shipmentId, purpose, code))) {
        await tx.handoverCode.update({ where: { id: hc.id }, data: { attempts: { increment: 1 } } });
        await audit(tx, { actor, action: `handover.${purpose.toLowerCase()}-code-wrong`, entityType: 'shipment', entityId: shipmentId });
        return new DomainError('HANDOVER_CODE_INVALID', `That code is not correct (${hc.maxAttempts - hc.attempts - 1} attempt(s) left)`);
      }
      await tx.handoverCode.update({ where: { id: hc.id }, data: { consumedAt: now } });
      if (purpose === 'PICKUP') await this.applyPickupConfirmation(tx, shipmentId, actor, 'HANDOVER_CODE', hc.issuedToUserId, null, null, now);
      else await this.applyDelivery(tx, shipmentId, actor, 'HANDOVER_CODE', hc.issuedToUserId, now);
      return null;
    });
    if (failure) throw failure;
    return this.job(actor, shipmentId);
  }

  /** Farmer (or a representative with CONFIRM_HANDOVER) acknowledges the pickup in their own account. */
  async confirmPickup(actor: Actor, shipmentId: string, input: z.infer<typeof confirmPickupSchema>) {
    const s0 = await this.prisma.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s0) throw new DomainError('NOT_FOUND', 'Job not found');
    const access = await this.access.booking(actor, s0.bookingId);
    const authority = this.access.requireFarmerAction(access, 'pickup.confirm');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.lockShipment(tx, shipmentId);
      await this.applyPickupConfirmation(tx, shipmentId, actor, 'COUNTERPARTY_APP', actor.userId, input.farmerReportedQuantityKg ?? null, authority, now);
    });
    return { ok: true };
  }

  private async applyPickupConfirmation(
    tx: Tx,
    shipmentId: string,
    actor: Actor,
    method: 'COUNTERPARTY_APP' | 'HANDOVER_CODE' | 'EXCEPTION_APPROVED',
    confirmedByUserId: string | null,
    farmerQty: string | null,
    authority: BookingAccess['farmer'] | null,
    now: Date,
  ) {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { booking: { include: { harvestLot: true } }, pickupRecord: true, trip: true } });
    const to = transition(SHIPMENT_MACHINE, s.status, 'confirmPickup', 'job');
    if (!s.pickupRecord) throw new DomainError('INVALID_STATE_TRANSITION', 'The driver has not recorded the collection');
    await tx.pickupRecord.update({
      where: { id: s.pickupRecord.id },
      data: {
        confirmationMethod: method,
        confirmedAt: now,
        confirmedByUserId,
        confirmedActingForFarmerId: authority?.mode === 'DELEGATE' ? authority.farmerProfileId : null,
        confirmedDelegationId: authority?.mode === 'DELEGATE' ? authority.delegationId : null,
        farmerReportedQuantityKg: farmerQty,
        ...(method === 'EXCEPTION_APPROVED' ? { exceptionApprovedByUserId: actor.userId } : {}),
        version: { increment: 1 },
      },
    });
    await tx.shipment.update({ where: { id: shipmentId }, data: { status: to, pickupConfirmedAt: now, version: { increment: 1 } } });
    await tx.tripReservation.update({ where: { id: s.tripId }, data: { status: transition(TRIP_MACHINE, s.trip.status, 'start', 'trip'), version: { increment: 1 } } });
    if (s.booking.harvestLot) await tx.harvestLot.update({ where: { id: s.booking.harvestLot.id }, data: { status: 'COLLECTED', collectedAt: now, version: { increment: 1 } } });
    await audit(tx, { actor, farmer: authority ?? undefined, action: 'shipment.pickup-confirmed', entityType: 'shipment', entityId: shipmentId, data: { method, farmerReportedQuantityKg: farmerQty } });
    await notify(tx, {
      userIds: await bookingRecipients(tx, s.bookingId, { farmer: true, processorRoles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'], transporter: true }, now),
      type: 'pickup.confirmed',
      category: 'transport',
      title: `${s.booking.reference}: pickup confirmed`,
      body: method === 'EXCEPTION_APPROVED' ? 'Pickup was confirmed through an approved exception (the farmer did not acknowledge it).' : 'Both the driver and the farmer side confirmed the handover.',
      link: `/bookings/${s.bookingId}`,
      bookingId: s.bookingId,
      dedupeKey: `pickup-confirmed:${shipmentId}`,
    });
  }

  /** Driver could not get the farmer's acknowledgement; recorded with a reason for an audited approval. */
  async requestPickupException(actor: Actor, shipmentId: string, reason: string): Promise<JobDto> {
    const s0 = await this.prisma.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s0) throw new DomainError('NOT_FOUND', 'Job not found');
    await this.assertTransporterSide(actor, s0);
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const s = await this.lockShipment(tx, shipmentId);
      if (s.status !== 'COLLECTED' || !s.pickupRecord) throw new DomainError('INVALID_STATE_TRANSITION', 'Record the collection first');
      await tx.pickupRecord.update({ where: { id: s.pickupRecord.id }, data: { exceptionReason: reason, exceptionRequestedAt: now, version: { increment: 1 } } });
      await tx.bookingIncident.create({ data: { bookingId: s.bookingId, kind: 'HANDOVER_EXCEPTION', blocking: false, description: `Pickup acknowledgement exception: ${reason}`, openedByUserId: actor.userId, openedByParty: 'TRANSPORTER' } });
      await audit(tx, { actor, action: 'shipment.pickup-exception-requested', entityType: 'shipment', entityId: shipmentId, reason });
      await notify(tx, {
        userIds: await bookingRecipients(tx, s.bookingId, { farmer: true, processorRoles: ['OWNER', 'MANAGER'], admins: true }, now),
        type: 'pickup.exception',
        category: 'transport',
        title: `${s.booking.reference}: pickup exception requested`,
        body: `The driver could not get the farmer’s confirmation: ${reason}. The processor or HarvestSlot must review it.`,
        link: `/bookings/${s.bookingId}`,
        bookingId: s.bookingId,
        dedupeKey: `pickup-exception:${shipmentId}`,
      });
    });
    return this.job(actor, shipmentId);
  }

  async approvePickupException(actor: Actor, shipmentId: string, reason: string) {
    const s0 = await this.prisma.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s0) throw new DomainError('NOT_FOUND', 'Job not found');
    const access = await this.access.booking(actor, s0.bookingId);
    if (!access.isAdmin) this.access.requireProcessorRole(access, ['OWNER', 'MANAGER'], 'approve handover exceptions');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const s = await this.lockShipment(tx, shipmentId);
      if (!s.pickupRecord?.exceptionRequestedAt) throw new DomainError('INVALID_STATE_TRANSITION', 'No exception was requested');
      await this.applyPickupConfirmation(tx, shipmentId, actor, 'EXCEPTION_APPROVED', null, null, null, now);
      await audit(tx, { actor, actorParty: access.isAdmin ? 'ADMIN' : 'PROCESSOR', action: 'shipment.pickup-exception-approved', entityType: 'shipment', entityId: shipmentId, reason });
    });
    return { ok: true };
  }

  /** Receiving staff confirm the truck's arrival and the handover in their own account. */
  async confirmDelivery(actor: Actor, shipmentId: string) {
    const s0 = await this.prisma.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s0) throw new DomainError('NOT_FOUND', 'Job not found');
    const access = await this.access.booking(actor, s0.bookingId);
    this.access.requireProcessorRole(access, ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'], 'confirm deliveries');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.lockShipment(tx, shipmentId);
      await this.applyDelivery(tx, shipmentId, actor, 'COUNTERPARTY_APP', actor.userId, now);
    });
    return { ok: true };
  }

  private async applyDelivery(tx: Tx, shipmentId: string, actor: Actor, method: 'COUNTERPARTY_APP' | 'HANDOVER_CODE', confirmedBy: string | null, now: Date) {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { booking: { include: { harvestLot: true } }, trip: true } });
    const to = transition(SHIPMENT_MACHINE, s.status, 'confirmDelivery', 'job');
    await tx.shipment.update({ where: { id: shipmentId }, data: { status: to, deliveredAt: now, deliveryConfirmedByUserId: confirmedBy, deliveryMethod: method, version: { increment: 1 } } });
    await tx.tripReservation.update({ where: { id: s.tripId }, data: { status: transition(TRIP_MACHINE, s.trip.status, 'complete', 'trip'), version: { increment: 1 } } });
    if (s.booking.harvestLot) await tx.harvestLot.update({ where: { id: s.booking.harvestLot.id }, data: { status: 'DELIVERED', deliveredAt: now, version: { increment: 1 } } });
    await issueFreightInvoice(tx, s.bookingId, now);
    await audit(tx, { actor, action: 'shipment.delivered', entityType: 'shipment', entityId: shipmentId, data: { method } });
    await notify(tx, {
      userIds: await bookingRecipients(tx, s.bookingId, { farmer: true, processorRoles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'], transporter: true }, now),
      type: 'delivery.confirmed',
      category: 'receiving',
      title: `${s.booking.reference}: delivery received`,
      body: 'The facility confirmed receipt of the load. Weighing and quality review come next.',
      link: `/bookings/${s.bookingId}`,
      bookingId: s.bookingId,
      dedupeKey: `delivered:${shipmentId}`,
    });
  }
}
