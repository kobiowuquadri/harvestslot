import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  buyingSlotSchema,
  CROPS,
  cropNoun,
  formatLagosDate,
  addDays,
  adjustCapacitySchema,
  createSlotSchema,
  createSlotSeriesSchema,
  facilityInputSchema,
  formatKg,
  kgToGrams,
  lagosDateTime,
  lineInputSchema,
  qualityTermsSchema,
  slotsQuerySchema,
  updateFacilitySchema,
  updateLineSchema,
  type FacilityDto,
  type SlotDto,
} from '@harvestslot/contracts';
import { audit, DomainError, lockRow, slotUsage, slotUsageMany, usageDto, withTransaction, type Actor } from '@harvestslot/core';
import type { Prisma } from '@harvestslot/db';
import { AccessService } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso, kg, kobo } from '../../common/serialize.js';
import { approxFor } from '../farmers/farmers.service.js';

type FacilityRow = Prisma.FacilityGetPayload<{ include: { lines: true; organisation: { select: { name: true } } } }>;
type SlotRow = Prisma.ProcessingSlotGetPayload<{ include: { line: true; facility: { select: { name: true } }; _count: { select: { bookings: true } } } }>;

@Injectable()
export class FacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  facilityDto(f: FacilityRow): FacilityDto {
    return {
      id: f.id,
      organisationId: f.organisationId,
      organisationName: f.organisation.name,
      name: f.name,
      lga: f.lga,
      address: f.address,
      lat: Number(f.lat),
      lng: Number(f.lng),
      status: f.status,
      qualityCriteria: qualityTermsSchema.parse(f.qualityCriteria),
      minOrderKg: kg(f.minOrderKg),
      maxPickupDistanceKm: f.maxPickupDistanceKm,
      indicativePriceKoboPerKg: kobo(f.indicativePriceKoboPerKg),
      defaultToleranceBps: f.defaultToleranceBps,
      defaultPaymentTermsDays: f.defaultPaymentTermsDays,
      rejectionHandling: f.rejectionHandling,
      cancellationTerms: f.cancellationTerms,
      isDemo: f.isDemo,
      version: f.version,
      lines: f.lines.map((l) => ({ id: l.id, facilityId: l.facilityId, name: l.name, crop: l.crop, product: l.product, status: l.status, version: l.version })),
    };
  }

  private include = { lines: { orderBy: { name: 'asc' as const } }, organisation: { select: { name: true } } };

  async list(actor: Actor, orgId: string): Promise<FacilityDto[]> {
    await this.access.requireOrg(actor, orgId, 'processor.booking.view');
    const rows = await this.prisma.db.facility.findMany({ where: { organisationId: orgId }, include: this.include, orderBy: { name: 'asc' } });
    return rows.map((f) => this.facilityDto(f));
  }

  async get(actor: Actor, facilityId: string): Promise<FacilityDto> {
    const f = await this.prisma.db.facility.findUnique({ where: { id: facilityId }, include: { ...this.include, organisation: { select: { name: true, status: true } } } });
    if (!f) throw new DomainError('NOT_FOUND', 'Facility not found');
    const member = (await this.access.memberships(actor)).some((m) => m.organisationId === f.organisationId);
    if (!member && f.organisation.status !== 'APPROVED' && actor.platformRole !== 'ADMIN') throw new DomainError('NOT_FOUND', 'Facility not found');
    return this.facilityDto(f);
  }

  async create(actor: Actor, orgId: string, input: z.infer<typeof facilityInputSchema>): Promise<FacilityDto> {
    await this.access.requireOrg(actor, orgId, 'processor.facility.manage');
    const org = await this.prisma.db.organisation.findUniqueOrThrow({ where: { id: orgId } });
    const f = await this.prisma.db.facility.create({
      data: {
        organisationId: orgId,
        name: input.name,
        lga: input.lga,
        address: input.address ?? null,
        lat: input.point.lat,
        lng: input.point.lng,
        qualityCriteria: input.qualityCriteria,
        minOrderKg: input.minOrderKg,
        maxPickupDistanceKm: input.maxPickupDistanceKm,
        indicativePriceKoboPerKg: input.indicativePriceKoboPerKg === undefined ? null : BigInt(input.indicativePriceKoboPerKg),
        defaultToleranceBps: input.defaultToleranceBps,
        defaultPaymentTermsDays: input.defaultPaymentTermsDays,
        rejectionHandling: input.rejectionHandling,
        cancellationTerms: input.cancellationTerms,
        isDemo: org.isDemo,
      },
      include: this.include,
    });
    await audit(this.prisma.db, { actor, organisationId: orgId, action: 'facility.created', entityType: 'facility', entityId: f.id });
    return this.facilityDto(f);
  }

  async update(actor: Actor, facilityId: string, input: z.infer<typeof updateFacilitySchema>): Promise<FacilityDto> {
    const f = await this.prisma.db.facility.findUnique({ where: { id: facilityId } });
    if (!f) throw new DomainError('NOT_FOUND', 'Facility not found');
    await this.access.requireOrg(actor, f.organisationId, 'processor.facility.manage');
    const { expectedVersion, point, indicativePriceKoboPerKg, ...rest } = input;
    const data: Prisma.FacilityUpdateManyMutationInput = { ...rest, version: { increment: 1 } };
    if (point) {
      data.lat = point.lat;
      data.lng = point.lng;
    }
    if (indicativePriceKoboPerKg !== undefined) data.indicativePriceKoboPerKg = BigInt(indicativePriceKoboPerKg);
    const r = await this.prisma.db.facility.updateMany({ where: { id: facilityId, version: expectedVersion }, data });
    if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The facility was changed elsewhere. Reload and try again.');
    await audit(this.prisma.db, { actor, organisationId: f.organisationId, action: 'facility.updated', entityType: 'facility', entityId: facilityId, data: { fields: Object.keys(input) } });
    return this.get(actor, facilityId);
  }

  async addLine(actor: Actor, facilityId: string, input: z.infer<typeof lineInputSchema>) {
    const f = await this.prisma.db.facility.findUnique({ where: { id: facilityId } });
    if (!f) throw new DomainError('NOT_FOUND', 'Facility not found');
    await this.access.requireOrg(actor, f.organisationId, 'processor.facility.manage');
    if (!CROPS[input.crop].products.includes(input.product)) {
      throw new DomainError('VALIDATION_FAILED', `A line buying ${cropNoun(input.crop)} cannot make that product`, [{ path: 'product', message: 'Choose a product made from this crop' }]);
    }
    const line = await this.prisma.db.processingLine.create({ data: { facilityId, name: input.name, crop: input.crop, product: input.product } });
    await audit(this.prisma.db, { actor, organisationId: f.organisationId, action: 'line.created', entityType: 'processing_line', entityId: line.id });
    return this.get(actor, facilityId);
  }

  async updateLine(actor: Actor, lineId: string, input: z.infer<typeof updateLineSchema>) {
    const line = await this.prisma.db.processingLine.findUnique({ where: { id: lineId }, include: { facility: true } });
    if (!line) throw new DomainError('NOT_FOUND', 'Line not found');
    await this.access.requireOrg(actor, line.facility.organisationId, 'processor.facility.manage');
    const { expectedVersion, ...rest } = input;
    if (rest.product && !CROPS[line.crop].products.includes(rest.product)) {
      throw new DomainError('VALIDATION_FAILED', `A line buying ${cropNoun(line.crop)} cannot make that product`, [{ path: 'product', message: 'Choose a product made from this crop' }]);
    }
    const r = await this.prisma.db.processingLine.updateMany({ where: { id: lineId, version: expectedVersion }, data: { ...rest, version: { increment: 1 } } });
    if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The line was changed elsewhere. Reload and try again.');
    return this.get(actor, line.facilityId);
  }

  // ───────────── Slots ─────────────

  private slotInclude = { line: true, facility: { select: { name: true } }, _count: { select: { bookings: true } } } as const;

  async slotDtos(rows: SlotRow[], now = new Date()): Promise<SlotDto[]> {
    const usage = await slotUsageMany(this.prisma.db, rows.map((r) => r.id), now);
    return rows.map((s) => ({
      id: s.id,
      lineId: s.lineId,
      lineName: s.line.name,
      crop: s.line.crop,
      product: s.line.product,
      facilityId: s.facilityId,
      facilityName: s.facility.name,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      processingCapacityKg: kg(s.processingCapacityKg),
      purchaseLimitKg: kg(s.purchaseLimitKg),
      status: s.status,
      publishedAt: iso(s.publishedAt),
      notes: s.notes,
      closedReason: s.closedReason,
      usage: usageDto(usage.get(s.id)!),
      bookingsCount: s._count.bookings,
      isDemo: s.isDemo,
      version: s.version,
      asOf: now.toISOString(),
    }));
  }

  async listSlots(actor: Actor, orgId: string, q: z.infer<typeof slotsQuerySchema>): Promise<SlotDto[]> {
    await this.access.requireOrg(actor, orgId, 'processor.booking.view');
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 7 * 86_400_000);
    const to = q.to ? new Date(q.to) : new Date(Date.now() + 60 * 86_400_000);
    const rows = await this.prisma.db.processingSlot.findMany({
      where: { facility: { organisationId: orgId }, ...(q.facilityId ? { facilityId: q.facilityId } : {}), ...(q.status ? { status: q.status } : {}), startsAt: { lt: to }, endsAt: { gt: from } },
      include: this.slotInclude,
      orderBy: [{ startsAt: 'asc' }, { line: { name: 'asc' } }],
      take: 500,
    });
    return this.slotDtos(rows);
  }

  async getSlot(actor: Actor, slotId: string): Promise<SlotDto> {
    const s = await this.prisma.db.processingSlot.findUnique({ where: { id: slotId }, include: { ...this.slotInclude, facility: { select: { name: true, organisationId: true } } } });
    if (!s) throw new DomainError('NOT_FOUND', 'Slot not found');
    await this.access.requireOrg(actor, s.facility.organisationId, 'processor.booking.view');
    return (await this.slotDtos([s]))[0]!;
  }

  private async lineForWrite(actor: Actor, lineId: string) {
    const line = await this.prisma.db.processingLine.findUnique({ where: { id: lineId }, include: { facility: true } });
    if (!line) throw new DomainError('NOT_FOUND', 'Processing line not found');
    const m = await this.access.requireOrg(actor, line.facility.organisationId, 'processor.slot.manage');
    if (line.status !== 'ACTIVE' || line.facility.status !== 'ACTIVE') throw new DomainError('INVALID_STATE_TRANSITION', 'The line or facility is inactive');
    return { line, membership: m };
  }

  async createSlot(actor: Actor, input: z.infer<typeof createSlotSchema>): Promise<SlotDto> {
    const { line, membership } = await this.lineForWrite(actor, input.lineId);
    if (new Date(input.startsAt) <= new Date()) throw new DomainError('VALIDATION_FAILED', 'Slots must start in the future', [{ path: 'startsAt', message: 'Choose a future time' }]);
    if (input.publish && membership.organisationStatus !== 'APPROVED') {
      throw new DomainError('ORG_NOT_APPROVED', 'Slots can be published once HarvestSlot has approved your organisation. Save it as a draft for now.');
    }
    const slot = await this.prisma.db.processingSlot.create({
      data: {
        lineId: line.id,
        facilityId: line.facilityId,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        processingCapacityKg: input.processingCapacityKg,
        purchaseLimitKg: input.purchaseLimitKg,
        status: input.publish ? 'PUBLISHED' : 'DRAFT',
        publishedAt: input.publish ? new Date() : null,
        notes: input.notes ?? null,
        createdByUserId: actor.userId,
        isDemo: line.facility.isDemo,
      },
    });
    await audit(this.prisma.db, { actor, organisationId: line.facility.organisationId, action: 'slot.created', entityType: 'slot', entityId: slot.id, data: { published: input.publish } });
    return this.getSlot(actor, slot.id);
  }

  /**
   * The buyer's one-form buying slot: place (existing, or created now with sensible defaults),
   * dates and quantity. Published at once when the organisation is approved, otherwise kept as a draft.
   */
  async createBuyingSlot(actor: Actor, orgId: string, input: z.infer<typeof buyingSlotSchema>): Promise<SlotDto> {
    const membership = await this.access.requireOrg(actor, orgId, 'processor.slot.manage');
    let facilityId = input.facilityId;
    if (facilityId) {
      const f = await this.prisma.db.facility.findUnique({ where: { id: facilityId } });
      if (!f || f.organisationId !== orgId) throw new DomainError('NOT_FOUND', 'Facility not found');
      if (input.priceKoboPerKg !== undefined) {
        await this.prisma.db.facility.update({ where: { id: facilityId }, data: { indicativePriceKoboPerKg: BigInt(input.priceKoboPerKg), version: { increment: 1 } } });
      }
    } else {
      const nf = input.newFacility!;
      const point = nf.point ?? (await approxFor(this.prisma.db, nf.lga));
      if (!point) throw new DomainError('VALIDATION_FAILED', 'Choose a local government area HarvestSlot supports', [{ path: 'newFacility.lga', message: 'Unsupported area' }]);
      const f = await this.create(actor, orgId, {
        name: nf.name,
        lga: nf.lga,
        address: nf.address,
        point,
        qualityCriteria: qualityTermsSchema.parse(CROPS[input.crop].defaultQuality),
        minOrderKg: '100',
        maxPickupDistanceKm: 100,
        indicativePriceKoboPerKg: input.priceKoboPerKg,
        defaultToleranceBps: 500,
        defaultPaymentTermsDays: 7,
        rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
        cancellationTerms: 'Either side may cancel without penalty before harvest starts. After that, problems are reported on the booking.',
      });
      facilityId = f.id;
      await this.prisma.db.organisation.updateMany({ where: { id: orgId, lga: null }, data: { lga: nf.lga } });
    }
    // Each crop is bought on its own line: the first buying slot for a crop at a place creates its intake line.
    let line = await this.prisma.db.processingLine.findFirst({ where: { facilityId, crop: input.crop, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    if (!line) {
      const existingNames = new Set((await this.prisma.db.processingLine.findMany({ where: { facilityId }, select: { name: true } })).map((l) => l.name));
      let name = CROPS[input.crop].intakeLineName;
      for (let n = 2; existingNames.has(name); n++) name = `${CROPS[input.crop].intakeLineName} ${n}`;
      await this.addLine(actor, facilityId, { name, crop: input.crop, product: 'OTHER' });
      line = await this.prisma.db.processingLine.findFirstOrThrow({ where: { facilityId, crop: input.crop, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    }
    const startsAt = lagosDateTime(input.fromDate, 8);
    const endsAt = lagosDateTime(input.toDate, 17);
    const clash = await this.prisma.db.processingSlot.findFirst({ where: { lineId: line.id, status: { not: 'CANCELLED' }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (clash) {
      throw new DomainError('SLOT_OVERLAP', `You already have a buying slot here from ${formatLagosDate(clash.startsAt)} to ${formatLagosDate(clash.endsAt)}. Change its quantity instead, or choose other dates.`, { slotId: clash.id });
    }
    return this.createSlot(actor, {
      lineId: line.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      processingCapacityKg: input.quantityKg,
      purchaseLimitKg: input.quantityKg,
      notes: input.notes,
      publish: membership.organisationStatus === 'APPROVED',
    });
  }

  async createSeries(actor: Actor, input: z.infer<typeof createSlotSeriesSchema>): Promise<{ created: number; skipped: Array<{ date: string; reason: string }> }> {
    const { line, membership } = await this.lineForWrite(actor, input.lineId);
    if (input.publish && membership.organisationStatus !== 'APPROVED') throw new DomainError('ORG_NOT_APPROVED', 'Your organisation must be approved before publishing');
    let created = 0;
    const skipped: Array<{ date: string; reason: string }> = [];
    for (let i = 0; i < input.days; i++) {
      const date = addDays(input.firstDate, i);
      const startsAt = lagosDateTime(date, input.startHour);
      const endsAt = new Date(startsAt.getTime() + input.durationHours * 3_600_000);
      if (startsAt <= new Date()) {
        skipped.push({ date, reason: 'in the past' });
        continue;
      }
      try {
        await this.prisma.db.processingSlot.create({
          data: {
            lineId: line.id,
            facilityId: line.facilityId,
            startsAt,
            endsAt,
            processingCapacityKg: input.processingCapacityKg,
            purchaseLimitKg: input.purchaseLimitKg,
            status: input.publish ? 'PUBLISHED' : 'DRAFT',
            publishedAt: input.publish ? new Date() : null,
            createdByUserId: actor.userId,
            isDemo: line.facility.isDemo,
          },
        });
        created++;
      } catch {
        skipped.push({ date, reason: 'overlaps an existing slot on this line' });
      }
    }
    await audit(this.prisma.db, { actor, organisationId: line.facility.organisationId, action: 'slot.series-created', entityType: 'processing_line', entityId: line.id, data: { created, skipped: skipped.length } });
    return { created, skipped };
  }

  private async slotForWrite(actor: Actor, slotId: string) {
    const s = await this.prisma.db.processingSlot.findUnique({ where: { id: slotId }, include: { facility: true } });
    if (!s) throw new DomainError('NOT_FOUND', 'Slot not found');
    const m = await this.access.requireOrg(actor, s.facility.organisationId, 'processor.slot.manage');
    return { slot: s, membership: m };
  }

  async publish(actor: Actor, slotId: string, expectedVersion: number): Promise<SlotDto> {
    const { slot, membership } = await this.slotForWrite(actor, slotId);
    if (membership.organisationStatus !== 'APPROVED') throw new DomainError('ORG_NOT_APPROVED', 'Your organisation must be approved before publishing');
    if (slot.status !== 'DRAFT' && slot.status !== 'CLOSED') throw new DomainError('INVALID_STATE_TRANSITION', `A ${slot.status.toLowerCase()} slot cannot be published`);
    if (slot.startsAt <= new Date()) throw new DomainError('INVALID_STATE_TRANSITION', 'This slot has already started');
    const r = await this.prisma.db.processingSlot.updateMany({ where: { id: slotId, version: expectedVersion }, data: { status: 'PUBLISHED', publishedAt: new Date(), closedReason: null, version: { increment: 1 } } });
    if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The slot was changed elsewhere. Reload and try again.');
    await audit(this.prisma.db, { actor, organisationId: slot.facility.organisationId, action: 'slot.published', entityType: 'slot', entityId: slotId });
    return this.getSlot(actor, slotId);
  }

  /** Closing stops new offers; existing commitments stay valid. Cancelling requires no active commitments. */
  async close(actor: Actor, slotId: string, expectedVersion: number, reason: string, mode: 'CLOSE' | 'CANCEL'): Promise<SlotDto> {
    const { slot } = await this.slotForWrite(actor, slotId);
    await withTransaction(this.prisma.db, async (tx) => {
      await lockRow(tx, 'processing_slots', slotId);
      const now = new Date();
      if (mode === 'CANCEL') {
        const usage = await slotUsage(tx, slotId, now);
        if (usage.usedG > 0n) {
          throw new DomainError('CAPACITY_BELOW_COMMITTED', `${formatKg(usage.usedG)} is held or committed in this slot. Cancel or move those bookings first, or close the slot to new offers instead.`);
        }
      }
      const r = await tx.processingSlot.updateMany({
        where: { id: slotId, version: expectedVersion, status: { in: ['DRAFT', 'PUBLISHED', 'CLOSED'] } },
        data: { status: mode === 'CANCEL' ? 'CANCELLED' : 'CLOSED', closedReason: reason, version: { increment: 1 } },
      });
      if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The slot was changed elsewhere. Reload and try again.');
      await audit(tx, { actor, organisationId: slot.facility.organisationId, action: mode === 'CANCEL' ? 'slot.cancelled' : 'slot.closed', entityType: 'slot', entityId: slotId, reason });
    });
    return this.getSlot(actor, slotId);
  }

  /** Capacity can never be reduced below what is held, committed or consumed. */
  async adjustCapacity(actor: Actor, slotId: string, input: z.infer<typeof adjustCapacitySchema>): Promise<SlotDto> {
    const { slot } = await this.slotForWrite(actor, slotId);
    await withTransaction(this.prisma.db, async (tx) => {
      await lockRow(tx, 'processing_slots', slotId);
      const current = await tx.processingSlot.findUniqueOrThrow({ where: { id: slotId } });
      if (current.version !== input.expectedVersion) throw new DomainError('VERSION_CONFLICT', 'The slot was changed elsewhere. Reload and try again.');
      if (current.status === 'CANCELLED') throw new DomainError('INVALID_STATE_TRANSITION', 'This slot is cancelled');
      const usage = await slotUsage(tx, slotId, new Date());
      const processing = kgToGrams(input.processingCapacityKg);
      const purchase = kgToGrams(input.purchaseLimitKg);
      const newLimit = processing < purchase ? processing : purchase;
      if (newLimit < usage.usedG) {
        throw new DomainError(
          'CAPACITY_BELOW_COMMITTED',
          `${formatKg(usage.usedG)} is already held, committed or used in this slot. The new limit of ${formatKg(newLimit)} would be below it; cancel or amend bookings first.`,
          { usedKg: usageDto(usage) },
        );
      }
      await tx.processingSlot.update({
        where: { id: slotId },
        data: { processingCapacityKg: input.processingCapacityKg, purchaseLimitKg: input.purchaseLimitKg, version: { increment: 1 } },
      });
      await tx.capacityAdjustment.create({
        data: {
          slotId,
          actorUserId: actor.userId,
          prevProcessingKg: current.processingCapacityKg,
          newProcessingKg: input.processingCapacityKg,
          prevPurchaseLimitKg: current.purchaseLimitKg,
          newPurchaseLimitKg: input.purchaseLimitKg,
          reason: input.reason,
        },
      });
      await audit(tx, { actor, organisationId: slot.facility.organisationId, action: 'slot.capacity-adjusted', entityType: 'slot', entityId: slotId, reason: input.reason });
    });
    return this.getSlot(actor, slotId);
  }

  async adjustments(actor: Actor, slotId: string) {
    await this.slotForWrite(actor, slotId);
    const rows = await this.prisma.db.capacityAdjustment.findMany({ where: { slotId }, orderBy: { createdAt: 'desc' } });
    const users = await this.prisma.db.user.findMany({ where: { id: { in: rows.map((r) => r.actorUserId) } }, select: { id: true, displayName: true } });
    return rows.map((r) => ({
      id: r.id,
      actor: users.find((u) => u.id === r.actorUserId)?.displayName ?? 'Unknown',
      prevProcessingKg: kg(r.prevProcessingKg),
      newProcessingKg: kg(r.newProcessingKg),
      prevPurchaseLimitKg: kg(r.prevPurchaseLimitKg),
      newPurchaseLimitKg: kg(r.newPurchaseLimitKg),
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
