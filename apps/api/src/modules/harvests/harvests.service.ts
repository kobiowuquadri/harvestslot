import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  createHarvestSchema,
  dbDateToString,
  formatKg,
  gramsToKgString,
  harvestListQuerySchema,
  kgToGrams,
  lagosDateString,
  stringToDbDate,
  toGrams,
  updateHarvestSchema,
  type HarvestDto,
  type InboxItem,
  type MatchResponse,
} from '@harvestslot/contracts';
import {
  allocationState,
  audit,
  checkEligibility,
  DomainError,
  expireBookingIfDue,
  haversineKm,
  lockRow,
  nextReference,
  notify,
  orgRecipients,
  rankMatches,
  requestAllocation,
  requestAllocationMany,
  round1,
  withTransaction,
  type Actor,
  type FarmerAuthority,
} from '@harvestslot/core';
import type { Prisma, Tx } from '@harvestslot/db';
import { AccessService } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso, kobo } from '../../common/serialize.js';
import { MatchingService, type RequestFacts } from './matching.service.js';

type HarvestRow = Prisma.HarvestRequestGetPayload<{
  include: { farmLocation: true; farmerProfile: { select: { displayName: true } }; offers: { select: { status: true } }; bookings: { select: { status: true } } };
}>;

const include = {
  farmLocation: true,
  farmerProfile: { select: { displayName: true } },
  offers: { select: { status: true } },
  bookings: { select: { status: true } },
} as const;

@Injectable()
export class HarvestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly matching: MatchingService,
  ) {}

  private async dtos(rows: HarvestRow[], now = new Date()): Promise<HarvestDto[]> {
    const alloc = await requestAllocationMany(this.prisma.db, rows.map((r) => r.id), now);
    const creators = await this.prisma.db.user.findMany({ where: { id: { in: rows.map((r) => r.createdByUserId) } }, select: { id: true, displayName: true } });
    const delegations = await this.prisma.db.delegationConsent.findMany({
      where: { id: { in: rows.map((r) => r.actingDelegationId).filter((x): x is string => !!x) } },
      include: { cooperative: { select: { name: true } } },
    });
    return rows.map((r) => {
      const eligible = toGrams(r.eligibleQuantityKg);
      const allocated = alloc.get(r.id) ?? 0n;
      const remaining = eligible > allocated ? eligible - allocated : 0n;
      return {
        id: r.id,
        reference: r.reference,
        farmerProfileId: r.farmerProfileId,
        farmerName: r.farmerProfile.displayName,
        farmLocation: { id: r.farmLocationId, label: r.farmLocation.label, lga: r.farmLocation.lga, community: r.farmLocation.community },
        status: r.status,
        estimatedQuantityKg: gramsToKgString(toGrams(r.estimatedQuantityKg)),
        eligibleQuantityKg: gramsToKgString(eligible),
        earliestHarvestDate: dbDateToString(r.earliestHarvestDate),
        latestHarvestDate: dbDateToString(r.latestHarvestDate),
        variety: r.variety,
        cropAgeMonths: r.cropAgeMonths,
        notes: r.notes,
        minPriceKoboPerKg: kobo(r.minPriceKoboPerKg),
        transportPreference: r.transportPreference,
        maxDistanceKm: r.maxDistanceKm,
        allocation: { eligibleKg: gramsToKgString(eligible), allocatedKg: gramsToKgString(allocated), remainingKg: gramsToKgString(remaining), state: allocationState(eligible, allocated) },
        openOffers: r.offers.filter((o) => o.status === 'OPEN' || o.status === 'COUNTERED').length,
        bookings: r.bookings.filter((b) => !['CANCELLED', 'EXPIRED'].includes(b.status)).length,
        createdBy: {
          userId: r.createdByUserId,
          displayName: creators.find((c) => c.id === r.createdByUserId)?.displayName ?? 'Unknown',
          viaCooperative: delegations.find((d) => d.id === r.actingDelegationId)?.cooperative.name ?? null,
        },
        publishedAt: iso(r.publishedAt),
        isDemo: r.isDemo,
        version: r.version,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  async list(actor: Actor, q: z.infer<typeof harvestListQuerySchema>): Promise<HarvestDto[]> {
    let farmerProfileId = q.farmerProfileId;
    if (!farmerProfileId) {
      const own = await this.prisma.db.farmerProfile.findUnique({ where: { userId: actor.userId }, select: { id: true } });
      if (!own) return [];
      farmerProfileId = own.id;
    }
    await this.access.farmer(actor, farmerProfileId, 'harvest.view');
    const rows = await this.prisma.db.harvestRequest.findMany({
      where: { farmerProfileId, ...(q.status ? { status: q.status } : {}) },
      include,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return this.dtos(rows);
  }

  /** Farmer side sees everything; a processor sees a published request (or one it already has an offer on). */
  async get(actor: Actor, id: string): Promise<HarvestDto> {
    const row = await this.prisma.db.harvestRequest.findUnique({ where: { id }, include });
    if (!row) throw new DomainError('NOT_FOUND', 'Harvest request not found');
    try {
      await this.access.farmer(actor, row.farmerProfileId, 'harvest.view');
    } catch {
      const orgIds = (await this.access.memberships(actor)).filter((m) => m.organisationType === 'PROCESSOR').map((m) => m.organisationId);
      const hasOffer = orgIds.length > 0 && (await this.prisma.db.offer.count({ where: { harvestRequestId: id, processorOrgId: { in: orgIds } } })) > 0;
      if (!(orgIds.length > 0 && (row.status === 'PUBLISHED' || hasOffer))) throw new DomainError('NOT_FOUND', 'Harvest request not found');
    }
    return (await this.dtos([row]))[0]!;
  }

  private async assertLocation(tx: Tx, farmerProfileId: string, locationId: string) {
    const loc = await tx.farmLocation.findUnique({ where: { id: locationId } });
    if (!loc || loc.farmerProfileId !== farmerProfileId || loc.archivedAt) {
      throw new DomainError('VALIDATION_FAILED', 'Choose one of the farmer’s pickup locations', [{ path: 'farmLocationId', message: 'Unknown location' }]);
    }
  }

  async create(actor: Actor, farmerProfileId: string, input: z.infer<typeof createHarvestSchema>): Promise<HarvestDto> {
    const authority = await this.access.farmer(actor, farmerProfileId, 'harvest.edit');
    if (input.earliestHarvestDate < lagosDateString(new Date())) {
      throw new DomainError('VALIDATION_FAILED', 'Harvest dates must be today or later', [{ path: 'earliestHarvestDate', message: 'Choose today or a later date' }]);
    }
    if (input.clientDraftId) {
      // Offline drafts may be synced more than once; the client draft id makes creation idempotent.
      const existing = await this.prisma.db.harvestRequest.findUnique({ where: { clientDraftId: input.clientDraftId }, include });
      if (existing) {
        if (existing.farmerProfileId !== farmerProfileId) throw new DomainError('DUPLICATE', 'This draft id was already used');
        return (await this.dtos([existing]))[0]!;
      }
    }
    const profile = await this.prisma.db.farmerProfile.findUniqueOrThrow({ where: { id: farmerProfileId } });
    const id = await withTransaction(this.prisma.db, async (tx) => {
      await this.assertLocation(tx, farmerProfileId, input.farmLocationId);
      const row = await tx.harvestRequest.create({
        data: {
          reference: await nextReference(tx, 'harvest'),
          farmerProfileId,
          farmLocationId: input.farmLocationId,
          createdByUserId: actor.userId,
          actingDelegationId: authority.mode === 'DELEGATE' ? authority.delegationId : null,
          status: input.publish ? 'PUBLISHED' : 'DRAFT',
          estimatedQuantityKg: input.estimatedQuantityKg,
          eligibleQuantityKg: input.eligibleQuantityKg ?? input.estimatedQuantityKg,
          earliestHarvestDate: stringToDbDate(input.earliestHarvestDate),
          latestHarvestDate: stringToDbDate(input.latestHarvestDate),
          variety: input.variety ?? null,
          cropAgeMonths: input.cropAgeMonths ?? null,
          notes: input.notes ?? null,
          minPriceKoboPerKg: input.minPriceKoboPerKg === undefined ? null : BigInt(input.minPriceKoboPerKg),
          transportPreference: input.transportPreference,
          maxDistanceKm: input.maxDistanceKm ?? null,
          clientDraftId: input.clientDraftId ?? null,
          publishedAt: input.publish ? new Date() : null,
          isDemo: profile.isDemo,
        },
      });
      await audit(tx, { actor, farmer: authority, action: input.publish ? 'harvest.created-published' : 'harvest.created', entityType: 'harvest_request', entityId: row.id });
      return row.id;
    });
    return this.get(actor, id);
  }

  async update(actor: Actor, id: string, input: z.infer<typeof updateHarvestSchema>): Promise<HarvestDto> {
    const row = await this.prisma.db.harvestRequest.findUnique({ where: { id } });
    if (!row) throw new DomainError('NOT_FOUND', 'Harvest request not found');
    const authority = await this.access.farmer(actor, row.farmerProfileId, 'harvest.edit');
    await withTransaction(this.prisma.db, async (tx) => {
      await lockRow(tx, 'harvest_requests', id);
      const current = await tx.harvestRequest.findUniqueOrThrow({ where: { id } });
      if (current.version !== input.expectedVersion) {
        throw new DomainError('VERSION_CONFLICT', 'This request was changed elsewhere. Review the latest version before saving.', { currentVersion: current.version });
      }
      if (!['DRAFT', 'PUBLISHED'].includes(current.status)) throw new DomainError('INVALID_STATE_TRANSITION', `A ${current.status.toLowerCase()} request cannot be edited`);
      if (input.farmLocationId) await this.assertLocation(tx, row.farmerProfileId, input.farmLocationId);
      const estimated = input.estimatedQuantityKg ?? current.estimatedQuantityKg.toString();
      const eligible = input.eligibleQuantityKg ?? (input.estimatedQuantityKg && toGrams(current.eligibleQuantityKg) > kgToGrams(input.estimatedQuantityKg) ? input.estimatedQuantityKg : current.eligibleQuantityKg.toString());
      if (toGrams(eligible) > toGrams(estimated)) throw new DomainError('VALIDATION_FAILED', 'Quantity for sale cannot exceed the estimated harvest');
      const allocated = await requestAllocation(tx, id, new Date());
      if (toGrams(eligible) < allocated) {
        throw new DomainError('SUPPLY_EXCEEDED', `${formatKg(allocated)} is already allocated to bookings; the quantity for sale cannot go below that.`);
      }
      const data: Prisma.HarvestRequestUpdateInput = {
        estimatedQuantityKg: estimated,
        eligibleQuantityKg: eligible,
        version: { increment: 1 },
      };
      if (input.farmLocationId) data.farmLocation = { connect: { id: input.farmLocationId } };
      if (input.earliestHarvestDate) data.earliestHarvestDate = stringToDbDate(input.earliestHarvestDate);
      if (input.latestHarvestDate) data.latestHarvestDate = stringToDbDate(input.latestHarvestDate);
      if (input.variety !== undefined) data.variety = input.variety ?? null;
      if (input.cropAgeMonths !== undefined) data.cropAgeMonths = input.cropAgeMonths;
      if (input.notes !== undefined) data.notes = input.notes ?? null;
      if (input.minPriceKoboPerKg !== undefined) data.minPriceKoboPerKg = BigInt(input.minPriceKoboPerKg);
      if (input.transportPreference) data.transportPreference = input.transportPreference;
      if (input.maxDistanceKm !== undefined) data.maxDistanceKm = input.maxDistanceKm;
      const updated = await tx.harvestRequest.update({ where: { id }, data });
      if (updated.latestHarvestDate < updated.earliestHarvestDate) throw new DomainError('VALIDATION_FAILED', 'Latest date must be on or after the earliest date');
      await audit(tx, { actor, farmer: authority, action: 'harvest.updated', entityType: 'harvest_request', entityId: id, data: { fields: Object.keys(input) } });
    });
    return this.get(actor, id);
  }

  async publish(actor: Actor, id: string, expectedVersion: number): Promise<HarvestDto> {
    const row = await this.prisma.db.harvestRequest.findUnique({ where: { id } });
    if (!row) throw new DomainError('NOT_FOUND', 'Harvest request not found');
    const authority = await this.access.farmer(actor, row.farmerProfileId, 'harvest.edit');
    if (dbDateToString(row.latestHarvestDate) < lagosDateString(new Date())) throw new DomainError('INVALID_STATE_TRANSITION', 'The harvest dates have passed. Update them before publishing.');
    const r = await this.prisma.db.harvestRequest.updateMany({
      where: { id, version: expectedVersion, status: { in: ['DRAFT', 'CLOSED'] } },
      data: { status: 'PUBLISHED', publishedAt: new Date(), closedAt: null, closeReason: null, version: { increment: 1 } },
    });
    if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The request changed or is not a draft. Reload and try again.');
    await audit(this.prisma.db, { actor, farmer: authority, action: 'harvest.published', entityType: 'harvest_request', entityId: id });
    return this.get(actor, id);
  }

  /** Close (stop new offers) or withdraw (cancel the request; only with no live allocations). Open offers lapse. */
  async end(actor: Actor, id: string, expectedVersion: number, reason: string, mode: 'CLOSE' | 'WITHDRAW'): Promise<HarvestDto> {
    const row = await this.prisma.db.harvestRequest.findUnique({ where: { id } });
    if (!row) throw new DomainError('NOT_FOUND', 'Harvest request not found');
    const authority = await this.access.farmer(actor, row.farmerProfileId, 'harvest.edit');
    await withTransaction(this.prisma.db, async (tx) => {
      await lockRow(tx, 'harvest_requests', id);
      const now = new Date();
      // Release lapsed pre-confirmation bookings first so the allocation figure is exact.
      const pending = await tx.booking.findMany({ where: { harvestRequestId: id, status: { in: ['DRAFT', 'AWAITING_CONFIRMATIONS'] } }, select: { id: true } });
      for (const b of pending) await expireBookingIfDue(tx, b.id, now);
      const current = await tx.harvestRequest.findUniqueOrThrow({ where: { id } });
      if (current.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT', 'This request was changed elsewhere. Reload and try again.');
      if (mode === 'WITHDRAW') {
        if (!['DRAFT', 'PUBLISHED', 'CLOSED'].includes(current.status)) throw new DomainError('INVALID_STATE_TRANSITION', 'This request cannot be withdrawn');
        const allocated = await requestAllocation(tx, id, now);
        if (allocated > 0n) throw new DomainError('INVALID_STATE_TRANSITION', `${formatKg(allocated)} is allocated to bookings. Cancel those bookings first, or close the request to new offers instead.`);
      } else if (current.status !== 'PUBLISHED') {
        throw new DomainError('INVALID_STATE_TRANSITION', 'Only a published request can be closed');
      }
      await tx.harvestRequest.update({
        where: { id },
        data: { status: mode === 'WITHDRAW' ? 'WITHDRAWN' : 'CLOSED', closedAt: now, closeReason: reason, version: { increment: 1 } },
      });
      const open = await tx.offer.findMany({ where: { harvestRequestId: id, status: { in: ['OPEN', 'COUNTERED'] } }, include: { reservation: true } });
      for (const o of open) {
        await tx.offer.update({ where: { id: o.id }, data: { status: 'LAPSED', decidedAt: now, decisionReason: `Request ${mode === 'WITHDRAW' ? 'withdrawn' : 'closed'} by the farmer`, version: { increment: 1 } } });
        if (o.reservation?.status === 'HELD') {
          await tx.reservation.update({ where: { id: o.reservation.id }, data: { status: 'RELEASED', releasedAt: now, releaseReason: 'Harvest request closed', version: { increment: 1 } } });
        }
        await notify(tx, {
          userIds: await orgRecipients(tx, o.processorOrgId, ['OWNER', 'MANAGER']),
          type: 'offer.lapsed',
          category: 'offers',
          title: `Offer on ${current.reference} lapsed`,
          body: `The farmer ${mode === 'WITHDRAW' ? 'withdrew' : 'closed'} the request. Your capacity hold was released.`,
          link: `/offers/${o.id}`,
          dedupeKey: `offer-lapsed:${o.id}`,
        });
      }
      await audit(tx, { actor, farmer: authority, action: mode === 'WITHDRAW' ? 'harvest.withdrawn' : 'harvest.closed', entityType: 'harvest_request', entityId: id, reason });
    });
    return this.get(actor, id);
  }

  async facts(id: string, now = new Date()): Promise<{ facts: RequestFacts; row: Prisma.HarvestRequestGetPayload<{ include: { farmLocation: true } }> }> {
    const row = await this.prisma.db.harvestRequest.findUniqueOrThrow({ where: { id }, include: { farmLocation: true } });
    const allocated = await requestAllocation(this.prisma.db, id, now);
    const eligible = toGrams(row.eligibleQuantityKg);
    const l = row.farmLocation;
    return {
      row,
      facts: {
        id,
        remainingG: eligible > allocated ? eligible - allocated : 0n,
        earliestHarvestDate: dbDateToString(row.earliestHarvestDate),
        latestHarvestDate: dbDateToString(row.latestHarvestDate),
        exact: l.exactLat !== null && l.exactLng !== null ? { lat: Number(l.exactLat), lng: Number(l.exactLng) } : null,
        approx: l.approxLat !== null && l.approxLng !== null ? { lat: Number(l.approxLat), lng: Number(l.approxLng) } : null,
        maxDistanceKm: row.maxDistanceKm,
        minPriceKoboPerKg: row.minPriceKoboPerKg,
        variety: row.variety,
        isDemo: row.isDemo,
      },
    };
  }

  async matches(actor: Actor, id: string): Promise<MatchResponse> {
    const row = await this.prisma.db.harvestRequest.findUnique({ where: { id }, select: { farmerProfileId: true, status: true } });
    if (!row) throw new DomainError('NOT_FOUND', 'Harvest request not found');
    await this.access.farmer(actor, row.farmerProfileId, 'harvest.view');
    const { facts } = await this.facts(id);
    const invited = await this.prisma.db.offerInvitation.findMany({ where: { harvestRequestId: id }, select: { facilityId: true } });
    const response = await this.matching.forFarmer(facts, await this.prisma.policies(), new Set(invited.map((i) => i.facilityId)));
    if (row.status !== 'PUBLISHED') {
      response.disclaimer = `${response.disclaimer} Publish the request so processors can make offers.`;
    }
    return response;
  }

  /** Farmer asks a matched processor for an offer. Notifies them; reserves nothing. */
  async invite(actor: Actor, id: string, facilityId: string) {
    const row = await this.prisma.db.harvestRequest.findUnique({ where: { id } });
    if (!row) throw new DomainError('NOT_FOUND', 'Harvest request not found');
    const authority = await this.access.farmer(actor, row.farmerProfileId, 'harvest.edit');
    if (row.status !== 'PUBLISHED') throw new DomainError('INVALID_STATE_TRANSITION', 'Publish the request before asking for offers');
    const facility = await this.prisma.db.facility.findUnique({ where: { id: facilityId }, include: { organisation: true } });
    if (!facility || facility.organisation.status !== 'APPROVED') throw new DomainError('NOT_FOUND', 'Facility not found');
    await withTransaction(this.prisma.db, async (tx) => {
      await tx.offerInvitation.createMany({ data: [{ harvestRequestId: id, facilityId, invitedByUserId: actor.userId }], skipDuplicates: true });
      await notify(tx, {
        userIds: await orgRecipients(tx, facility.organisationId, ['OWNER', 'MANAGER']),
        type: 'offer.invited',
        category: 'offers',
        title: `Offer requested for ${row.reference}`,
        body: `A farmer asked ${facility.name} for an offer on ${formatKg(row.eligibleQuantityKg.toString())} of cassava.`,
        link: `/processor/inbox?request=${id}`,
        dedupeKey: `offer-invited:${id}:${facilityId}`,
      });
      await audit(tx, { actor, farmer: authority, action: 'harvest.offer-invited', entityType: 'harvest_request', entityId: id, organisationId: facility.organisationId });
    });
    return { ok: true };
  }

  /** Published requests with remaining quantity that fit at least one of the organisation's slots. */
  async inbox(actor: Actor, orgId: string, now = new Date()): Promise<InboxItem[]> {
    const membership = await this.access.requireOrg(actor, orgId, 'processor.booking.view');
    const org = await this.prisma.db.organisation.findUniqueOrThrow({ where: { id: orgId } });
    const requests = await this.prisma.db.harvestRequest.findMany({
      where: { status: 'PUBLISHED', isDemo: org.isDemo, latestHarvestDate: { gte: stringToDbDate(lagosDateString(now)) } },
      include: { farmLocation: true, farmerProfile: { select: { displayName: true } } },
      orderBy: { earliestHarvestDate: 'asc' },
      take: 300,
    });
    if (!requests.length) return [];
    const alloc = await requestAllocationMany(this.prisma.db, requests.map((r) => r.id), now);
    const candidates = await this.matching.candidates(this.prisma.db, now, { orgId, from: new Date(now.getTime() - 86_400_000), to: new Date(now.getTime() + 90 * 86_400_000), isDemo: org.isDemo });
    // Treat our own org as eligible for inbox purposes even before approval, so staff can prepare.
    candidates.forEach((c) => (c.org.status = 'APPROVED'));
    const invitations = await this.prisma.db.offerInvitation.findMany({ where: { harvestRequestId: { in: requests.map((r) => r.id) }, facility: { organisationId: orgId } } });
    const offers = await this.prisma.db.offer.findMany({ where: { harvestRequestId: { in: requests.map((r) => r.id) }, processorOrgId: orgId, status: { in: ['OPEN', 'COUNTERED'] } } });
    const policies = await this.prisma.policies();
    const items: InboxItem[] = [];
    for (const r of requests) {
      const eligible = toGrams(r.eligibleQuantityKg);
      const remaining = eligible - (alloc.get(r.id) ?? 0n);
      if (remaining <= 0n) continue;
      const approx = r.farmLocation.approxLat !== null && r.farmLocation.approxLng !== null ? { lat: Number(r.farmLocation.approxLat), lng: Number(r.farmLocation.approxLng) } : null;
      const input = {
        id: r.id,
        remainingG: remaining,
        earliestHarvestDate: dbDateToString(r.earliestHarvestDate),
        latestHarvestDate: dbDateToString(r.latestHarvestDate),
        point: approx,
        pointIsApproximate: true,
        maxDistanceKm: r.maxDistanceKm,
        minPriceKoboPerKg: null, // processors may still offer above the farmer's minimum
        variety: r.variety,
      };
      const eligibleCandidates = candidates.filter((c) => checkEligibility(input, c, { now, weights: policies.matchingWeights, roadFactor: 1.4, reliabilityMinHistory: 5 }) === null);
      if (!eligibleCandidates.length) continue;
      const { matches } = rankMatches(input, eligibleCandidates, { now, weights: policies.matchingWeights, roadFactor: 1.4, reliabilityMinHistory: policies.reliabilityMinHistory });
      const best = matches[0]!;
      items.push({
        harvestRequestId: r.id,
        reference: r.reference,
        farmerName: r.farmerProfile.displayName,
        lga: r.farmLocation.lga,
        community: r.farmLocation.community,
        approx,
        remainingKg: gramsToKgString(remaining),
        earliestHarvestDate: dbDateToString(r.earliestHarvestDate),
        latestHarvestDate: dbDateToString(r.latestHarvestDate),
        minPriceKoboPerKg: kobo(r.minPriceKoboPerKg),
        transportPreference: r.transportPreference,
        variety: r.variety,
        invited: invitations.some((i) => i.harvestRequestId === r.id),
        bestFacility: {
          facilityId: best.candidate.facility.id,
          facilityName: best.candidate.facility.name,
          straightLineKm: approx ? round1(haversineKm(approx, best.candidate.facility.point)) : 0,
          score: best.score,
        },
        existingOfferId: offers.find((o) => o.harvestRequestId === r.id)?.id ?? null,
      });
    }
    void membership;
    return items.sort((a, b) => Number(b.invited) - Number(a.invited) || a.earliestHarvestDate.localeCompare(b.earliestHarvestDate));
  }

  farmerAuthorityLabel(a: FarmerAuthority): string {
    return a.mode === 'DELEGATE' ? `${a.cooperativeName} (acting for ${a.farmerName})` : a.farmerName;
  }
}
