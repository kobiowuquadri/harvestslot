import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  cropCodeFromLabel,
  cropInputSchema,
  cropNameKey,
  cropRequestInputSchema,
  cropUpdateSchema,
  dismissCropRequestsSchema,
  type CropDto,
  type CropRequestDto,
} from '@harvestslot/contracts';
import { audit, DomainError, notify, withTransaction, type Actor } from '@harvestslot/core';
import type { Crop, Db } from '@harvestslot/db';
import { PrismaService } from '../../common/prisma.service.js';

export function cropDto(c: Crop): CropDto {
  return {
    code: c.code,
    label: c.label,
    noun: c.noun,
    nounIsPlural: c.nounIsPlural,
    produce: c.produce,
    why: c.why,
    maxHoursHarvestToDelivery: c.maxHoursHarvestToDelivery,
    soilAndStemsRemoved: c.soilAndStemsRemoved,
    qualityNotes: c.qualityNotes,
    products: c.products.length ? c.products : ['OTHER'],
    active: c.active,
    sortOrder: c.sortOrder,
  };
}

/** A crop that new harvests, lines and buying slots may use: it must exist and be switched on. */
export async function activeCrop(db: Db, code: string): Promise<Crop> {
  const crop = await db.crop.findUnique({ where: { code } });
  if (!crop || !crop.active) {
    throw new DomainError('VALIDATION_FAILED', crop ? `${crop.label} can’t be listed at the moment` : 'Choose one of the crops HarvestSlot supports, or ask for yours to be added', [{ path: 'crop', message: 'Choose a listed crop' }]);
  }
  return crop;
}

@Injectable()
export class CropsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<CropDto[]> {
    const rows = await this.prisma.db.crop.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] });
    return rows.map(cropDto);
  }

  async listAll(): Promise<CropDto[]> {
    const rows = await this.prisma.db.crop.findMany({ orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] });
    return rows.map(cropDto);
  }

  /** "My crop isn't listed": recorded for administrators, who are told at once. */
  async request(actor: Actor, input: z.infer<typeof cropRequestInputSchema>): Promise<CropRequestDto> {
    const nameKey = cropNameKey(input.name);
    const listed = await this.prisma.db.crop.findFirst({ where: { OR: [{ label: { equals: input.name.trim(), mode: 'insensitive' } }, { noun: { equals: input.name.trim(), mode: 'insensitive' } }] } });
    if (listed?.active) throw new DomainError('DUPLICATE', `${listed.label} is already listed: choose it from the crops.`);
    const profile = await this.prisma.db.farmerProfile.findUnique({ where: { userId: actor.userId }, select: { lga: true } });
    const open = await this.prisma.db.cropRequest.findFirst({ where: { requestedByUserId: actor.userId, nameKey, status: 'OPEN' } });
    if (open) throw new DomainError('DUPLICATE', `You already asked for ${input.name.trim()}. We’ll tell you when it can be listed.`);
    const row = await withTransaction(this.prisma.db, async (tx) => {
      const created = await tx.cropRequest.create({
        data: { name: input.name.trim(), nameKey, note: input.note ?? null, requestedByUserId: actor.userId, lga: profile?.lga ?? null, isDemo: actor.isDemo },
        include: { requestedBy: { select: { displayName: true } } },
      });
      // Demo requests go to demo administrators only, so a demonstration never emails a real admin.
      const admins = await tx.user.findMany({ where: { platformRole: 'ADMIN', status: 'ACTIVE', isDemo: actor.isDemo }, select: { id: true } });
      await notify(tx, {
        userIds: admins.map((u) => u.id),
        type: 'crop.requested',
        category: 'account',
        title: `A farmer asked for ${created.name}`,
        body: `${created.requestedBy.displayName}${created.lga ? ` (${created.lga})` : ''} wants to list ${created.name}. Add it under Crops, or dismiss the request.`,
        link: '/admin/crops',
        dedupeKey: `crop-requested:${created.id}`,
      });
      await audit(tx, { actor, action: 'crop.requested', entityType: 'crop_request', entityId: created.id, data: { name: created.name } });
      return created;
    });
    return this.requestDto(row);
  }

  private requestDto(r: { id: string; name: string; nameKey: string; note: string | null; status: CropRequestDto['status']; lga: string | null; resolvedCropCode: string | null; createdAt: Date; isDemo: boolean; requestedBy: { displayName: string } }): CropRequestDto {
    return { id: r.id, name: r.name, nameKey: r.nameKey, note: r.note, status: r.status, requestedByName: r.requestedBy.displayName, lga: r.lga, resolvedCropCode: r.resolvedCropCode, createdAt: r.createdAt.toISOString(), isDemo: r.isDemo };
  }

  async openRequests(): Promise<CropRequestDto[]> {
    const rows = await this.prisma.db.cropRequest.findMany({ where: { status: 'OPEN' }, include: { requestedBy: { select: { displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
    return rows.map((r) => this.requestDto(r));
  }

  /** Adds a crop. Farmers who asked for it are told they can now list it. */
  async create(actor: Actor, input: z.infer<typeof cropInputSchema>): Promise<CropDto> {
    const code = input.code ?? cropCodeFromLabel(input.label);
    if (await this.prisma.db.crop.findUnique({ where: { code } })) throw new DomainError('DUPLICATE', `A crop with the code ${code} already exists. Switch it on instead, or choose another name.`, [{ path: 'code', message: 'Already used' }]);
    const crop = await withTransaction(this.prisma.db, async (tx) => {
      const created = await tx.crop.create({
        data: {
          code,
          label: input.label,
          noun: input.noun,
          nounIsPlural: input.nounIsPlural,
          produce: input.produce,
          why: input.why,
          maxHoursHarvestToDelivery: input.maxHoursHarvestToDelivery,
          soilAndStemsRemoved: input.soilAndStemsRemoved,
          qualityNotes: input.qualityNotes ?? null,
          products: input.products,
          active: input.active,
          sortOrder: input.sortOrder,
        },
      });
      // Requests answered by this crop: the ones named, plus any open request with the same name.
      const keys = Array.from(new Set([cropNameKey(input.label), cropNameKey(input.noun)]));
      const answered = await tx.cropRequest.findMany({ where: { status: 'OPEN', OR: [{ id: { in: input.answersRequestIds } }, { nameKey: { in: keys } }] } });
      if (answered.length) {
        const now = new Date();
        await tx.cropRequest.updateMany({ where: { id: { in: answered.map((r) => r.id) } }, data: { status: 'ADDED', resolvedCropCode: code, resolvedAt: now } });
        if (created.active) {
          await notify(tx, {
            userIds: answered.map((r) => r.requestedByUserId),
            type: 'crop.added',
            category: 'account',
            title: `You can now list ${created.noun}`,
            body: `${created.label} ${created.nounIsPlural ? 'are' : 'is'} now on HarvestSlot. Add your harvest to find buyers when they open buying slots.`,
            link: `/farmer/harvests/new?crop=${code}`,
            dedupeKey: `crop-added:${code}`,
          });
        }
      }
      await audit(tx, { actor, actorParty: 'ADMIN', action: 'admin.crop-created', entityType: 'crop', entityId: code, data: { label: input.label, answeredRequests: answered.length } });
      return created;
    });
    return cropDto(crop);
  }

  async update(actor: Actor, code: string, input: z.infer<typeof cropUpdateSchema>): Promise<CropDto> {
    const existing = await this.prisma.db.crop.findUnique({ where: { code } });
    if (!existing) throw new DomainError('NOT_FOUND', 'Crop not found');
    const crop = await this.prisma.db.crop.update({ where: { code }, data: { ...input, qualityNotes: input.qualityNotes === undefined ? undefined : (input.qualityNotes ?? null) } });
    await audit(this.prisma.db, { actor, actorParty: 'ADMIN', action: 'admin.crop-updated', entityType: 'crop', entityId: code, data: { fields: Object.keys(input), active: input.active } });
    return cropDto(crop);
  }

  /** Dismisses every open request for one crop name, telling each farmer why. */
  async dismiss(actor: Actor, input: z.infer<typeof dismissCropRequestsSchema>): Promise<{ dismissed: number }> {
    return withTransaction(this.prisma.db, async (tx) => {
      const open = await tx.cropRequest.findMany({ where: { status: 'OPEN', nameKey: input.nameKey } });
      if (!open.length) throw new DomainError('NOT_FOUND', 'No open requests for that crop');
      await tx.cropRequest.updateMany({ where: { id: { in: open.map((r) => r.id) } }, data: { status: 'DISMISSED', resolvedAt: new Date() } });
      await notify(tx, {
        userIds: open.map((r) => r.requestedByUserId),
        type: 'crop.request-dismissed',
        category: 'account',
        title: `${open[0]!.name} can’t be added yet`,
        body: input.reason,
        dedupeKey: `crop-dismissed:${input.nameKey}:${Date.now()}`,
      });
      await audit(tx, { actor, actorParty: 'ADMIN', action: 'admin.crop-requests-dismissed', entityType: 'crop_request', entityId: input.nameKey, reason: input.reason, data: { count: open.length } });
      return { dismissed: open.length };
    });
  }
}
