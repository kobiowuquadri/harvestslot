import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  counterOfferSchema,
  createOfferSchema,
  dbDateToString,
  decideOfferSchema,
  formatKg,
  formatPricePerKg,
  gramsToKgString,
  kgToGrams,
  koboToNumber,
  lagosDateString,
  produceAmountKobo,
  qualityTermsSchema,
  reviseOfferSchema,
  stringToDbDate,
  toGrams,
  type OfferDto,
} from '@harvestslot/contracts';
import {
  audit,
  DomainError,
  expireBookingIfDue,
  expireOfferIfDue,
  farmerRecipients,
  haversineKm,
  lockRow,
  lockRows,
  nextReference,
  notify,
  OFFER_MACHINE,
  orgRecipients,
  recomputeReadiness,
  requestAllocation,
  round1,
  slotUsage,
  transition,
  withTransaction,
  type Actor,
  type FarmerAuthority,
} from '@harvestslot/core';
import type { Prisma, Tx } from '@harvestslot/db';
import { AccessService } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso } from '../../common/serialize.js';
import { BookingEngine } from '../bookings/booking-engine.service.js';

const offerInclude = {
  facility: true,
  processorOrg: true,
  harvestRequest: { include: { farmLocation: true, farmerProfile: true } },
  versions: { orderBy: { versionNo: 'asc' as const }, include: { slot: { include: { line: true } } } },
  reservation: true,
  booking: { select: { id: true } },
} as const;
type OfferRow = Prisma.OfferGetPayload<{ include: typeof offerInclude }>;

type Terms = z.infer<typeof createOfferSchema>;

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly engine: BookingEngine,
  ) {}

  private async dto(o: OfferRow): Promise<OfferDto> {
    const users = await this.prisma.db.user.findMany({ where: { id: { in: o.versions.map((v) => v.proposedByUserId) } }, select: { id: true, displayName: true } });
    const versions = o.versions.map((v) => ({
      versionNo: v.versionNo,
      proposedBy: v.proposedBy,
      proposedByName: users.find((u) => u.id === v.proposedByUserId)?.displayName ?? 'Unknown',
      actingForFarmer: Boolean(v.delegationId),
      slotId: v.slotId,
      slot: { startsAt: v.slot.startsAt.toISOString(), endsAt: v.slot.endsAt.toISOString(), lineName: v.slot.line.name },
      quantityKg: gramsToKgString(toGrams(v.quantityKg)),
      priceKoboPerKg: koboToNumber(v.priceKoboPerKg),
      plannedHarvestDate: dbDateToString(v.plannedHarvestDate),
      pickupWindowStart: v.pickupWindowStart.toISOString(),
      pickupWindowEnd: v.pickupWindowEnd.toISOString(),
      deliveryWindowStart: v.deliveryWindowStart.toISOString(),
      deliveryWindowEnd: v.deliveryWindowEnd.toISOString(),
      qualityTerms: qualityTermsSchema.parse(v.qualityTerms),
      toleranceBps: v.toleranceBps,
      paymentTermsDays: v.paymentTermsDays,
      freightPayer: v.freightPayer,
      rejectionHandling: v.rejectionHandling,
      cancellationTerms: v.cancellationTerms,
      note: v.note,
      createdAt: v.createdAt.toISOString(),
      estimatedProduceAmountKobo: koboToNumber(produceAmountKobo(toGrams(v.quantityKg), v.priceKoboPerKg)),
    }));
    const current = versions[versions.length - 1]!;
    const loc = o.harvestRequest.farmLocation;
    const approx = loc.approxLat !== null && loc.approxLng !== null ? { lat: Number(loc.approxLat), lng: Number(loc.approxLng) } : null;
    return {
      id: o.id,
      harvestRequestId: o.harvestRequestId,
      harvestReference: o.harvestRequest.reference,
      farmerProfileId: o.harvestRequest.farmerProfileId,
      farmerName: o.harvestRequest.farmerProfile.displayName,
      processorOrgId: o.processorOrgId,
      processorName: o.processorOrg.name,
      processorVerified: o.processorOrg.status === 'APPROVED',
      facility: { id: o.facilityId, name: o.facility.name, lga: o.facility.lga },
      status: o.status,
      expiresAt: o.expiresAt.toISOString(),
      currentVersionNo: o.currentVersionNo,
      current,
      versions,
      awaiting: o.status === 'OPEN' ? 'FARMER' : o.status === 'COUNTERED' ? 'PROCESSOR' : 'NONE',
      hold: o.reservation ? { status: o.reservation.status, quantityKg: gramsToKgString(toGrams(o.reservation.quantityKg)), expiresAt: iso(o.reservation.expiresAt) } : null,
      straightLineKm: approx ? round1(haversineKm(approx, { lat: Number(o.facility.lat), lng: Number(o.facility.lng) })) : null,
      bookingId: o.booking?.id ?? null,
      decisionReason: o.decisionReason,
      isDemo: o.isDemo,
      version: o.version,
      createdAt: o.createdAt.toISOString(),
    };
  }

  private async load(id: string): Promise<OfferRow> {
    const o = await this.prisma.db.offer.findUnique({ where: { id }, include: offerInclude });
    if (!o) throw new DomainError('NOT_FOUND', 'Offer not found');
    return o;
  }

  /** Farmer side (via harvest access) or the issuing processor organisation. */
  private async viewerSide(actor: Actor, o: { processorOrgId: string; harvestRequest: { farmerProfileId: string } }): Promise<'FARMER' | 'PROCESSOR'> {
    const memberships = await this.access.memberships(actor);
    if (memberships.some((m) => m.organisationId === o.processorOrgId)) return 'PROCESSOR';
    await this.access.farmer(actor, o.harvestRequest.farmerProfileId, 'harvest.view');
    return 'FARMER';
  }

  async get(actor: Actor, id: string): Promise<OfferDto> {
    const o = await this.load(id);
    if (actor.platformRole !== 'ADMIN') await this.viewerSide(actor, o);
    if (['OPEN', 'COUNTERED'].includes(o.status) && o.expiresAt <= new Date()) {
      await withTransaction(this.prisma.db, (tx) => expireOfferIfDue(tx, id, new Date()));
      return this.dto(await this.load(id));
    }
    return this.dto(o);
  }

  async forHarvest(actor: Actor, harvestRequestId: string): Promise<OfferDto[]> {
    const req = await this.prisma.db.harvestRequest.findUnique({ where: { id: harvestRequestId } });
    if (!req) throw new DomainError('NOT_FOUND', 'Harvest request not found');
    await this.access.farmer(actor, req.farmerProfileId, 'harvest.view');
    await this.expireDue({ harvestRequestId });
    const rows = await this.prisma.db.offer.findMany({ where: { harvestRequestId }, include: offerInclude, orderBy: { createdAt: 'desc' } });
    return Promise.all(rows.map((r) => this.dto(r)));
  }

  async forOrg(actor: Actor, orgId: string, status?: string): Promise<OfferDto[]> {
    await this.access.requireOrg(actor, orgId, 'processor.booking.view');
    await this.expireDue({ processorOrgId: orgId });
    const rows = await this.prisma.db.offer.findMany({
      where: { processorOrgId: orgId, ...(status === 'open' ? { status: { in: ['OPEN', 'COUNTERED'] } } : {}) },
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return Promise.all(rows.map((r) => this.dto(r)));
  }

  /** Lazily expire due offers on read so lists never show a stale hold as live. */
  private async expireDue(where: Prisma.OfferWhereInput): Promise<void> {
    const now = new Date();
    const due = await this.prisma.db.offer.findMany({ where: { ...where, status: { in: ['OPEN', 'COUNTERED'] }, expiresAt: { lte: now } }, select: { id: true } });
    for (const d of due) await withTransaction(this.prisma.db, (tx) => expireOfferIfDue(tx, d.id, now));
  }

  private validateTerms(input: Omit<Terms, 'harvestRequestId' | 'validForHours'>, slot: { startsAt: Date; endsAt: Date }, request: { earliestHarvestDate: Date; latestHarvestDate: Date }, now: Date) {
    const issues: Array<{ path: string; message: string }> = [];
    const pickupStart = new Date(input.pickupWindowStart);
    const deliveryStart = new Date(input.deliveryWindowStart);
    const deliveryEnd = new Date(input.deliveryWindowEnd);
    if (pickupStart <= now) issues.push({ path: 'pickupWindowStart', message: 'Pickup must be in the future' });
    if (deliveryStart < slot.startsAt || deliveryEnd > slot.endsAt) issues.push({ path: 'deliveryWindowStart', message: 'Delivery window must fall inside the processing slot' });
    if (input.plannedHarvestDate < dbDateToString(request.earliestHarvestDate) || input.plannedHarvestDate > dbDateToString(request.latestHarvestDate)) {
      issues.push({ path: 'plannedHarvestDate', message: 'Harvest date must be within the farmer’s acceptable dates' });
    }
    const maxHours = input.qualityTerms.maxHoursHarvestToDelivery;
    if ((deliveryEnd.getTime() - new Date(`${input.plannedHarvestDate}T00:00:00+01:00`).getTime()) / 3_600_000 > maxHours + 24) {
      issues.push({ path: 'deliveryWindowEnd', message: `Delivery would be later than ${maxHours} h after harvest` });
    }
    if (issues.length) throw new DomainError('VALIDATION_FAILED', 'Some offer terms are not workable', issues);
  }

  async create(actor: Actor, input: Terms): Promise<OfferDto> {
    const facilitySlot = await this.prisma.db.processingSlot.findUnique({ where: { id: input.slotId }, include: { facility: true, line: true } });
    if (!facilitySlot) throw new DomainError('NOT_FOUND', 'Slot not found');
    const orgId = facilitySlot.facility.organisationId;
    await this.access.requireOrg(actor, orgId, 'processor.offer.manage', { requireApproved: true });
    const request = await this.prisma.db.harvestRequest.findUnique({ where: { id: input.harvestRequestId } });
    if (!request || request.status !== 'PUBLISHED') throw new DomainError('NOT_FOUND', 'Published harvest request not found');
    if (request.isDemo !== facilitySlot.isDemo) throw new DomainError('NOT_FOUND', 'Published harvest request not found');
    const now = new Date();
    this.validateTerms(input, facilitySlot, request, now);
    if (facilitySlot.status !== 'PUBLISHED' || facilitySlot.startsAt <= now) throw new DomainError('INVALID_STATE_TRANSITION', 'The slot is not open for offers');
    if (facilitySlot.facility.status !== 'ACTIVE' || facilitySlot.line.status !== 'ACTIVE') throw new DomainError('INVALID_STATE_TRANSITION', 'The facility or line is inactive');
    const qtyG = kgToGrams(input.quantityKg);
    if (qtyG < toGrams(facilitySlot.facility.minOrderKg)) throw new DomainError('VALIDATION_FAILED', `Below this facility’s minimum order of ${formatKg(facilitySlot.facility.minOrderKg.toString())}`);
    const policies = await this.prisma.policies();
    const hours = Math.min(input.validForHours ?? policies.offerHoldHours, 14 * 24);
    const expiresAt = new Date(Math.min(now.getTime() + hours * 3_600_000, new Date(input.pickupWindowStart).getTime()));

    const id = await withTransaction(this.prisma.db, async (tx) => {
      await lockRow(tx, 'harvest_requests', request.id);
      await lockRow(tx, 'processing_slots', input.slotId);
      const fresh = await tx.harvestRequest.findUniqueOrThrow({ where: { id: request.id } });
      if (fresh.status !== 'PUBLISHED') throw new DomainError('INVALID_STATE_TRANSITION', 'The request is no longer open for offers');
      const duplicate = await tx.offer.findFirst({ where: { harvestRequestId: request.id, processorOrgId: orgId, status: { in: ['OPEN', 'COUNTERED'] } } });
      if (duplicate) throw new DomainError('DUPLICATE', 'Your organisation already has an open offer on this request. Revise it instead.', { offerId: duplicate.id });
      const remaining = toGrams(fresh.eligibleQuantityKg) - (await requestAllocation(tx, request.id, now));
      if (qtyG > remaining) throw new DomainError('SUPPLY_EXCEEDED', `Only ${formatKg(remaining > 0n ? remaining : 0n)} of this request is still unallocated`);
      const usage = await slotUsage(tx, input.slotId, now);
      if (usage.availableG < qtyG) {
        throw new DomainError('CAPACITY_EXCEEDED', `Only ${formatKg(usage.availableG)} of capacity is left in this slot`, { availableKg: gramsToKgString(usage.availableG) });
      }
      const offer = await tx.offer.create({
        data: { harvestRequestId: request.id, processorOrgId: orgId, facilityId: facilitySlot.facilityId, expiresAt, createdByUserId: actor.userId, isDemo: request.isDemo },
      });
      await tx.offerVersion.create({ data: this.versionData(offer.id, 1, 'PROCESSOR', actor.userId, null, input) });
      await tx.reservation.create({ data: { slotId: input.slotId, offerId: offer.id, quantityKg: gramsToKgString(qtyG), status: 'HELD', expiresAt } });
      await audit(tx, { actor, organisationId: orgId, action: 'offer.created', entityType: 'offer', entityId: offer.id, data: { quantityKg: input.quantityKg, priceKoboPerKg: input.priceKoboPerKg } });
      await notify(tx, {
        userIds: await farmerRecipients(tx, request.farmerProfileId, undefined, now),
        type: 'offer.received',
        category: 'offers',
        title: `New offer for ${request.reference}`,
        body: `${facilitySlot.facility.name} offers ${formatPricePerKg(input.priceKoboPerKg)} for ${formatKg(input.quantityKg)}. Capacity is held until ${expiresAt.toISOString().slice(0, 16).replace('T', ' ')} UTC. Nothing is agreed until you accept.`,
        link: `/offers/${offer.id}`,
        dedupeKey: `offer-received:${offer.id}`,
      });
      return offer.id;
    });
    return this.dto(await this.load(id));
  }

  private versionData(offerId: string, versionNo: number, proposedBy: 'PROCESSOR' | 'FARMER', userId: string, farmer: FarmerAuthority | null, t: Omit<Terms, 'harvestRequestId' | 'validForHours'>): Prisma.OfferVersionUncheckedCreateInput {
    return {
      offerId,
      versionNo,
      proposedBy,
      proposedByUserId: userId,
      actingForFarmerId: farmer?.mode === 'DELEGATE' ? farmer.farmerProfileId : null,
      delegationId: farmer?.mode === 'DELEGATE' ? farmer.delegationId : null,
      slotId: t.slotId,
      quantityKg: gramsToKgString(kgToGrams(t.quantityKg)),
      priceKoboPerKg: BigInt(t.priceKoboPerKg),
      plannedHarvestDate: stringToDbDate(t.plannedHarvestDate),
      pickupWindowStart: new Date(t.pickupWindowStart),
      pickupWindowEnd: new Date(t.pickupWindowEnd),
      deliveryWindowStart: new Date(t.deliveryWindowStart),
      deliveryWindowEnd: new Date(t.deliveryWindowEnd),
      qualityTerms: t.qualityTerms,
      toleranceBps: t.toleranceBps,
      paymentTermsDays: t.paymentTermsDays,
      freightPayer: t.freightPayer,
      rejectionHandling: t.rejectionHandling,
      cancellationTerms: t.cancellationTerms,
      note: t.note ?? null,
    };
  }

  /** Locks request → slot(s) → offer and returns the fresh offer, expiring it first if due. */
  private async lockOffer(tx: Tx, offerId: string, extraSlotIds: string[] = []): Promise<OfferRow> {
    const peek = await tx.offer.findUnique({ where: { id: offerId }, select: { harvestRequestId: true, reservation: { select: { slotId: true } } } });
    if (!peek) throw new DomainError('NOT_FOUND', 'Offer not found');
    await lockRow(tx, 'harvest_requests', peek.harvestRequestId);
    await lockRows(tx, 'processing_slots', [...(peek.reservation ? [peek.reservation.slotId] : []), ...extraSlotIds]);
    await lockRow(tx, 'offers', offerId);
    return tx.offer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
  }

  private async assertLive(tx: Tx, o: OfferRow, now: Date): Promise<void> {
    if (['OPEN', 'COUNTERED'].includes(o.status) && o.expiresAt <= now) {
      await expireOfferIfDue(tx, o.id, now);
      throw new DomainError('OFFER_EXPIRED', 'This offer has expired and its capacity hold was released');
    }
  }

  async revise(actor: Actor, offerId: string, input: z.infer<typeof reviseOfferSchema>): Promise<OfferDto> {
    const before = await this.load(offerId);
    await this.access.requireOrg(actor, before.processorOrgId, 'processor.offer.manage', { requireApproved: true });
    const slot = await this.prisma.db.processingSlot.findUnique({ where: { id: input.slotId }, include: { facility: true } });
    if (!slot || slot.facilityId !== before.facilityId) throw new DomainError('VALIDATION_FAILED', 'Choose a slot at the same facility');
    const now = new Date();
    this.validateTerms(input, slot, before.harvestRequest, now);
    const outcome = await withTransaction(this.prisma.db, async (tx) => {
      const o = await this.lockOffer(tx, offerId, [input.slotId]);
      try {
        await this.assertLive(tx, o, now);
      } catch (e) {
        return e as DomainError;
      }
      transition(OFFER_MACHINE, o.status, 'revise', 'offer');
      if (o.currentVersionNo !== input.expectedVersionNo) throw new DomainError('VERSION_CONFLICT', 'The offer changed (a counter-offer may have arrived). Reload and try again.');
      const qtyG = kgToGrams(input.quantityKg);
      const r = o.reservation!;
      const heldG = toGrams(r.quantityKg);
      const remaining = toGrams(o.harvestRequest.eligibleQuantityKg) - (await requestAllocation(tx, o.harvestRequestId, now));
      if (qtyG > remaining) throw new DomainError('SUPPLY_EXCEEDED', `Only ${formatKg(remaining)} of this request is still unallocated`);
      const usage = await slotUsage(tx, input.slotId, now);
      const extraNeeded = input.slotId === r.slotId ? qtyG - heldG : qtyG;
      if (extraNeeded > usage.availableG) throw new DomainError('CAPACITY_EXCEEDED', `Only ${formatKg(usage.availableG)} more capacity is available in that slot`);
      await tx.reservation.update({ where: { id: r.id }, data: { slotId: input.slotId, quantityKg: gramsToKgString(qtyG), version: { increment: 1 } } });
      await tx.offerVersion.create({ data: this.versionData(offerId, o.currentVersionNo + 1, 'PROCESSOR', actor.userId, null, input) });
      await tx.offer.update({ where: { id: offerId }, data: { status: transition(OFFER_MACHINE, o.status, 'revise'), currentVersionNo: o.currentVersionNo + 1, version: { increment: 1 } } });
      await audit(tx, { actor, organisationId: o.processorOrgId, action: 'offer.revised', entityType: 'offer', entityId: offerId, data: { versionNo: o.currentVersionNo + 1 } });
      await notify(tx, {
        userIds: await farmerRecipients(tx, o.harvestRequest.farmerProfileId, undefined, now),
        type: 'offer.revised',
        category: 'offers',
        title: `Revised offer for ${o.harvestRequest.reference}`,
        body: `${o.facility.name} now offers ${formatPricePerKg(input.priceKoboPerKg)} for ${formatKg(input.quantityKg)}.`,
        link: `/offers/${offerId}`,
        dedupeKey: `offer-revised:${offerId}:${o.currentVersionNo + 1}`,
      });
      return null;
    });
    if (outcome) throw outcome;
    return this.dto(await this.load(offerId));
  }

  async counter(actor: Actor, offerId: string, input: z.infer<typeof counterOfferSchema>): Promise<OfferDto> {
    const before = await this.load(offerId);
    const authority = await this.access.farmer(actor, before.harvestRequest.farmerProfileId, 'offer.counter');
    const now = new Date();
    const outcome = await withTransaction(this.prisma.db, async (tx) => {
      const o = await this.lockOffer(tx, offerId);
      try {
        await this.assertLive(tx, o, now);
      } catch (e) {
        return e as DomainError;
      }
      transition(OFFER_MACHINE, o.status, 'counter', 'offer');
      if (o.currentVersionNo !== input.expectedVersionNo) throw new DomainError('VERSION_CONFLICT', 'The offer changed. Reload and review the latest terms.');
      if (input.plannedHarvestDate < dbDateToString(o.harvestRequest.earliestHarvestDate) || input.plannedHarvestDate > dbDateToString(o.harvestRequest.latestHarvestDate)) {
        throw new DomainError('VALIDATION_FAILED', 'Harvest date must be within your acceptable dates');
      }
      const remaining = toGrams(o.harvestRequest.eligibleQuantityKg) - (await requestAllocation(tx, o.harvestRequestId, now));
      if (kgToGrams(input.quantityKg) > remaining) throw new DomainError('SUPPLY_EXCEEDED', `Only ${formatKg(remaining)} is unallocated`);
      const latest = o.versions[o.versions.length - 1]!;
      await tx.offerVersion.create({
        data: {
          ...this.versionData(offerId, o.currentVersionNo + 1, 'FARMER', actor.userId, authority, {
            slotId: latest.slotId,
            quantityKg: input.quantityKg,
            priceKoboPerKg: input.priceKoboPerKg,
            plannedHarvestDate: input.plannedHarvestDate,
            pickupWindowStart: latest.pickupWindowStart.toISOString(),
            pickupWindowEnd: latest.pickupWindowEnd.toISOString(),
            deliveryWindowStart: latest.deliveryWindowStart.toISOString(),
            deliveryWindowEnd: latest.deliveryWindowEnd.toISOString(),
            qualityTerms: qualityTermsSchema.parse(latest.qualityTerms),
            toleranceBps: latest.toleranceBps,
            paymentTermsDays: latest.paymentTermsDays,
            freightPayer: latest.freightPayer,
            rejectionHandling: latest.rejectionHandling,
            cancellationTerms: latest.cancellationTerms,
            note: input.note,
          }),
        },
      });
      await tx.offer.update({ where: { id: offerId }, data: { status: transition(OFFER_MACHINE, o.status, 'counter'), currentVersionNo: o.currentVersionNo + 1, version: { increment: 1 } } });
      await audit(tx, { actor, farmer: authority, action: 'offer.countered', entityType: 'offer', entityId: offerId, data: { quantityKg: input.quantityKg, priceKoboPerKg: input.priceKoboPerKg } });
      await notify(tx, {
        userIds: await orgRecipients(tx, o.processorOrgId, ['OWNER', 'MANAGER']),
        type: 'offer.countered',
        category: 'offers',
        title: `Counter-offer on ${o.harvestRequest.reference}`,
        body: `The farmer proposes ${formatPricePerKg(input.priceKoboPerKg)} for ${formatKg(input.quantityKg)}.`,
        link: `/offers/${offerId}`,
        dedupeKey: `offer-countered:${offerId}:${o.currentVersionNo + 1}`,
      });
      return null;
    });
    if (outcome) throw outcome;
    return this.dto(await this.load(offerId));
  }

  /**
   * Turns an agreed offer version into a booking: allocates supply (harvest lot) under the request
   * lock, attaches the capacity hold with a confirmation deadline, and snapshots version 1 of the terms.
   */
  async accept(actor: Actor, offerId: string, input: z.infer<typeof decideOfferSchema>, mode: 'ACCEPT' | 'PREPARE' | 'ACCEPT_COUNTER'): Promise<{ bookingId: string; bookingReference: string; status: string }> {
    const before = await this.load(offerId);
    let farmer: FarmerAuthority | null = null;
    if (mode === 'ACCEPT_COUNTER') {
      await this.access.requireOrg(actor, before.processorOrgId, 'processor.offer.manage', { requireApproved: true });
    } else {
      farmer = await this.access.farmer(actor, before.harvestRequest.farmerProfileId, mode === 'ACCEPT' ? 'offer.accept' : 'offer.prepare');
      if (mode === 'PREPARE' && farmer.mode === 'SELF') throw new DomainError('BAD_REQUEST', 'Farmers accept offers directly');
    }
    const now = new Date();
    const policies = await this.prisma.policies();
    const result = await withTransaction(this.prisma.db, async (tx) => {
      const latestVersion = before.versions[before.versions.length - 1]!;
      const o = await this.lockOffer(tx, offerId, [latestVersion.slotId]);
      try {
        await this.assertLive(tx, o, now);
      } catch (e) {
        return e as DomainError;
      }
      transition(OFFER_MACHINE, o.status, mode === 'ACCEPT_COUNTER' ? 'acceptCounter' : 'accept', 'offer');
      if (o.currentVersionNo !== input.expectedVersionNo) throw new DomainError('VERSION_CONFLICT', 'The offer changed. Review the latest terms before accepting.');
      const v = o.versions[o.versions.length - 1]!;
      if (o.harvestRequest.status !== 'PUBLISHED') throw new DomainError('INVALID_STATE_TRANSITION', 'The harvest request is no longer open');
      // Release lapsed pre-confirmation bookings on this request so the supply figure is exact.
      const pending = await tx.booking.findMany({ where: { harvestRequestId: o.harvestRequestId, status: { in: ['DRAFT', 'AWAITING_CONFIRMATIONS'] } }, select: { id: true } });
      for (const b of pending) await expireBookingIfDue(tx, b.id, now);
      const qtyG = toGrams(v.quantityKg);
      const remaining = toGrams(o.harvestRequest.eligibleQuantityKg) - (await requestAllocation(tx, o.harvestRequestId, now));
      if (qtyG > remaining) throw new DomainError('SUPPLY_EXCEEDED', `Only ${formatKg(remaining > 0n ? remaining : 0n)} of the harvest is still unallocated`);
      const r = o.reservation!;
      if (r.status !== 'HELD') throw new DomainError('HOLD_EXPIRED', 'The capacity hold for this offer is no longer valid');
      const heldG = toGrams(r.quantityKg);
      if (qtyG !== heldG || r.slotId !== v.slotId) {
        // A counter-offer changed the quantity: re-check capacity for the difference.
        const usage = await slotUsage(tx, v.slotId, now);
        const extra = r.slotId === v.slotId ? qtyG - heldG : qtyG;
        if (extra > usage.availableG) throw new DomainError('CAPACITY_EXCEEDED', `Only ${formatKg(usage.availableG)} more capacity is available`);
      }
      const deadline = new Date(Math.min(now.getTime() + policies.bookingConfirmationHoldHours * 3_600_000, v.pickupWindowStart.getTime()));
      const reference = await nextReference(tx, 'booking');
      const booking = await tx.booking.create({
        data: {
          reference,
          harvestRequestId: o.harvestRequestId,
          farmerProfileId: o.harvestRequest.farmerProfileId,
          processorOrgId: o.processorOrgId,
          facilityId: o.facilityId,
          slotId: v.slotId,
          offerId,
          status: mode === 'PREPARE' ? 'DRAFT' : 'AWAITING_CONFIRMATIONS',
          confirmationDeadline: deadline,
          preparedByUserId: mode === 'PREPARE' ? actor.userId : null,
          preparedDelegationId: mode === 'PREPARE' && farmer?.mode === 'DELEGATE' ? farmer.delegationId : null,
          isDemo: o.isDemo,
        },
      });
      await tx.harvestLot.create({
        data: { harvestRequestId: o.harvestRequestId, bookingId: booking.id, quantityKg: gramsToKgString(qtyG), plannedHarvestDate: v.plannedHarvestDate },
      });
      await tx.reservation.update({
        where: { id: r.id },
        data: { bookingId: booking.id, slotId: v.slotId, quantityKg: gramsToKgString(qtyG), expiresAt: deadline, version: { increment: 1 } },
      });
      const content = this.engine.buildInitialTerms(reference, o, v, policies);
      const processorVersion = v.proposedBy === 'PROCESSOR' ? v : null;
      const farmerCounter = v.proposedBy === 'FARMER' ? v : null;
      const confirmations = [
        processorVersion
          ? { party: 'PROCESSOR' as const, method: 'OFFER_ISSUANCE' as const, actorUserId: processorVersion.proposedByUserId, organisationId: o.processorOrgId }
          : { party: 'PROCESSOR' as const, method: 'EXPLICIT' as const, actorUserId: actor.userId, organisationId: o.processorOrgId },
        ...(mode === 'ACCEPT' ? [{ party: 'FARMER' as const, method: 'EXPLICIT' as const, actorUserId: actor.userId, farmer: farmer! }] : []),
        ...(mode === 'ACCEPT_COUNTER' && farmerCounter
          ? [
              {
                party: 'FARMER' as const,
                method: 'EXPLICIT' as const,
                actorUserId: farmerCounter.proposedByUserId,
                farmer: farmerCounter.delegationId
                  ? ({ mode: 'DELEGATE', farmerProfileId: o.harvestRequest.farmerProfileId, farmerName: o.harvestRequest.farmerProfile.displayName, delegationId: farmerCounter.delegationId, cooperativeId: '', cooperativeName: '', scopes: [] } as FarmerAuthority)
                  : undefined,
              },
            ]
          : []),
      ];
      await this.engine.createInitialVersion(tx, booking.id, content, actor.userId, confirmations);
      await tx.offer.update({
        where: { id: offerId },
        data: { status: transition(OFFER_MACHINE, o.status, mode === 'ACCEPT_COUNTER' ? 'acceptCounter' : 'accept'), decidedAt: now, decidedByUserId: actor.userId, version: { increment: 1 } },
      });
      // Other open offers that no longer fit the remaining supply lapse and release their holds.
      const left = remaining - qtyG;
      const others = await tx.offer.findMany({ where: { harvestRequestId: o.harvestRequestId, id: { not: offerId }, status: { in: ['OPEN', 'COUNTERED'] } }, include: { reservation: true } });
      for (const other of others) {
        if (other.reservation && toGrams(other.reservation.quantityKg) > left) {
          await tx.offer.update({ where: { id: other.id }, data: { status: 'LAPSED', decidedAt: now, decisionReason: 'Not enough unallocated quantity remains', version: { increment: 1 } } });
          if (other.reservation.status === 'HELD') {
            await tx.reservation.update({ where: { id: other.reservation.id }, data: { status: 'RELEASED', releasedAt: now, releaseReason: 'Offer lapsed', version: { increment: 1 } } });
          }
          await notify(tx, {
            userIds: await orgRecipients(tx, other.processorOrgId, ['OWNER', 'MANAGER']),
            type: 'offer.lapsed',
            category: 'offers',
            title: `Offer on ${o.harvestRequest.reference} lapsed`,
            body: 'The farmer accepted another offer, so not enough quantity remains for yours. Your capacity hold was released.',
            link: `/offers/${other.id}`,
            dedupeKey: `offer-lapsed:${other.id}`,
          });
        }
      }
      await audit(tx, {
        actor,
        farmer: farmer ?? undefined,
        organisationId: o.processorOrgId,
        action: mode === 'PREPARE' ? 'offer.acceptance-prepared' : mode === 'ACCEPT_COUNTER' ? 'offer.counter-accepted' : 'offer.accepted',
        entityType: 'offer',
        entityId: offerId,
        data: { bookingId: booking.id, reference },
      });
      const farmerSide = await farmerRecipients(tx, o.harvestRequest.farmerProfileId, undefined, now);
      const processorSide = await orgRecipients(tx, o.processorOrgId, ['OWNER', 'MANAGER']);
      await notify(tx, {
        userIds: mode === 'PREPARE' ? farmerSide : [...farmerSide, ...processorSide],
        type: mode === 'PREPARE' ? 'booking.prepared' : 'booking.created',
        category: 'bookings',
        title: mode === 'PREPARE' ? `${reference} needs the farmer’s approval` : `${reference}: terms agreed, transport next`,
        body:
          mode === 'PREPARE'
            ? `A cooperative representative prepared acceptance of ${formatKg(v.quantityKg.toString())}. It is not agreed until the farmer (or an approver) approves it before ${deadline.toISOString().slice(0, 16).replace('T', ' ')} UTC.`
            : `${formatKg(v.quantityKg.toString())} at ${formatPricePerKg(v.priceKoboPerKg)}. Capacity is held until ${deadline.toISOString().slice(0, 16).replace('T', ' ')} UTC while transport is arranged.`,
        link: `/bookings/${booking.id}`,
        bookingId: booking.id,
        dedupeKey: `booking-created:${booking.id}`,
      });
      if (mode !== 'PREPARE') {
        // Transporters serving the pickup area hear about the job.
        const areas = await tx.transportServiceArea.findMany({ where: { lga: o.harvestRequest.farmLocation.lga, organisation: { status: 'APPROVED', isDemo: o.isDemo } }, select: { organisationId: true } });
        for (const a of areas) {
          await notify(tx, {
            userIds: await orgRecipients(tx, a.organisationId, ['OWNER', 'DISPATCHER']),
            type: 'transport.opportunity',
            category: 'transport',
            title: `Transport needed: ${formatKg(v.quantityKg.toString())} from ${o.harvestRequest.farmLocation.lga}`,
            body: `To ${o.facility.name}. Pickup ${v.pickupWindowStart.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
            link: `/transport/opportunities`,
            bookingId: booking.id,
            dedupeKey: `transport-opportunity:${booking.id}:${a.organisationId}`,
          });
        }
      }
      await recomputeReadiness(tx, booking.id, 'booking.created', now);
      return { bookingId: booking.id, bookingReference: reference, status: booking.status };
    });
    if (result instanceof DomainError) throw result;
    return result;
  }

  async decline(actor: Actor, offerId: string, input: z.infer<typeof decideOfferSchema>, mode: 'DECLINE' | 'WITHDRAW'): Promise<OfferDto> {
    const before = await this.load(offerId);
    let farmer: FarmerAuthority | undefined;
    if (mode === 'WITHDRAW') await this.access.requireOrg(actor, before.processorOrgId, 'processor.offer.manage');
    else farmer = await this.access.farmer(actor, before.harvestRequest.farmerProfileId, 'offer.decline');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const o = await this.lockOffer(tx, offerId);
      if (o.currentVersionNo !== input.expectedVersionNo) throw new DomainError('VERSION_CONFLICT', 'The offer changed. Reload and try again.');
      const to = transition(OFFER_MACHINE, o.status, mode === 'DECLINE' ? 'decline' : 'withdraw', 'offer');
      await tx.offer.update({ where: { id: offerId }, data: { status: to, decidedAt: now, decidedByUserId: actor.userId, decisionReason: input.reason ?? null, version: { increment: 1 } } });
      if (o.reservation?.status === 'HELD') {
        await tx.reservation.update({ where: { id: o.reservation.id }, data: { status: 'RELEASED', releasedAt: now, releaseReason: mode === 'DECLINE' ? 'Offer declined' : 'Offer withdrawn', version: { increment: 1 } } });
      }
      await audit(tx, { actor, farmer, organisationId: o.processorOrgId, action: mode === 'DECLINE' ? 'offer.declined' : 'offer.withdrawn', entityType: 'offer', entityId: offerId, reason: input.reason ?? null });
      await notify(tx, {
        userIds: mode === 'DECLINE' ? await orgRecipients(tx, o.processorOrgId, ['OWNER', 'MANAGER']) : await farmerRecipients(tx, o.harvestRequest.farmerProfileId, undefined, now),
        type: mode === 'DECLINE' ? 'offer.declined' : 'offer.withdrawn',
        category: 'offers',
        title: `Offer on ${o.harvestRequest.reference} ${mode === 'DECLINE' ? 'declined' : 'withdrawn'}`,
        body: input.reason ?? (mode === 'DECLINE' ? 'The farmer declined the offer.' : 'The processor withdrew the offer.'),
        link: `/offers/${offerId}`,
        dedupeKey: `offer-${mode.toLowerCase()}:${offerId}`,
      });
    });
    return this.dto(await this.load(offerId));
  }

  planDate(): string {
    return lagosDateString(new Date());
  }
}
