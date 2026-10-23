import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  farmLocationInputSchema,
  grantDelegationSchema,
  lgaName,
  optionalText,
  updateFarmLocationSchema,
  updateFarmerProfileSchema,
  type DelegationDto,
  type FarmLocationDto,
  type FarmerProfileDto,
} from '@harvestslot/contracts';
import { approximate, audit, DomainError, withTransaction, type Actor, type FarmerAuthority } from '@harvestslot/core';
import type { Db, Prisma } from '@harvestslot/db';
import { AccessService } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso } from '../../common/serialize.js';

export const createOwnProfileSchema = z.object({ lga: lgaName, community: optionalText(120), displayName: z.string().trim().min(1).max(120).optional() });

type DelegationRow = Prisma.DelegationConsentGetPayload<{ include: { cooperative: { select: { name: true } }; farmerProfile: { select: { displayName: true } } } }>;

export function delegationDto(d: DelegationRow, recordedBy: string, now = new Date()): DelegationDto {
  return {
    id: d.id,
    cooperativeId: d.cooperativeId,
    cooperativeName: d.cooperative.name,
    farmerProfileId: d.farmerProfileId,
    farmerName: d.farmerProfile.displayName,
    scopes: d.scopes,
    method: d.method,
    recordedBy,
    witnessName: d.witnessName,
    hasEvidence: Boolean(d.evidenceAttachmentId),
    grantedAt: d.grantedAt.toISOString(),
    expiresAt: iso(d.expiresAt),
    revokedAt: iso(d.revokedAt),
    revokeReason: d.revokeReason,
    active: !d.revokedAt && (!d.expiresAt || d.expiresAt > now),
  };
}

/** Approximate point for discovery: rounded exact pin, or the LGA centre when no pin was given. */
export async function approxFor(db: Db, lga: string, point?: { lat: number; lng: number }): Promise<{ lat: number; lng: number } | null> {
  if (point) return approximate(point);
  const centre = await db.supportedLocation.findFirst({ where: { lga } });
  return centre ? { lat: Number(centre.centerLat), lng: Number(centre.centerLng) } : null;
}

@Injectable()
export class FarmersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  locationDto(l: Prisma.FarmLocationGetPayload<object>, showExact: boolean): FarmLocationDto {
    return {
      id: l.id,
      label: l.label,
      lga: l.lga,
      community: l.community,
      approx: l.approxLat !== null && l.approxLng !== null ? { lat: Number(l.approxLat), lng: Number(l.approxLng) } : null,
      exact: showExact && l.exactLat !== null && l.exactLng !== null ? { lat: Number(l.exactLat), lng: Number(l.exactLng), accuracyM: l.accuracyM } : null,
      source: l.source,
      directions: showExact ? l.directions : null,
      archived: Boolean(l.archivedAt),
      version: l.version,
    };
  }

  async profile(actor: Actor, farmerProfileId: string): Promise<FarmerProfileDto> {
    const authority = await this.access.farmer(actor, farmerProfileId, 'profile.view');
    const p = await this.prisma.db.farmerProfile.findUniqueOrThrow({
      where: { id: farmerProfileId },
      include: { locations: { orderBy: { createdAt: 'asc' } } },
    });
    const showExact = authority.mode !== 'ADMIN';
    return {
      id: p.id,
      displayName: p.displayName,
      phone: p.phone,
      email: p.email,
      preferredLanguage: p.preferredLanguage,
      lga: p.lga,
      community: p.community,
      claimStatus: p.claimStatus,
      hasAccount: Boolean(p.userId),
      contactConsent: Boolean(p.contactConsentAt),
      locationConsent: Boolean(p.locationConsentAt),
      isDemo: p.isDemo,
      version: p.version,
      locations: p.locations.map((l) => this.locationDto(l, showExact)),
    };
  }

  async ownProfileId(actor: Actor): Promise<string> {
    const p = await this.prisma.db.farmerProfile.findUnique({ where: { userId: actor.userId }, select: { id: true } });
    if (!p) throw new DomainError('NOT_FOUND', 'You do not have a farmer profile yet');
    return p.id;
  }

  async createOwn(actor: Actor, input: z.infer<typeof createOwnProfileSchema>): Promise<FarmerProfileDto> {
    const existing = await this.prisma.db.farmerProfile.findUnique({ where: { userId: actor.userId } });
    if (existing) throw new DomainError('DUPLICATE', 'You already have a farmer profile');
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const p = await this.prisma.db.farmerProfile.create({
      data: {
        userId: actor.userId,
        displayName: input.displayName ?? user.displayName,
        phone: user.phone,
        email: user.email,
        lga: input.lga,
        community: input.community ?? null,
        createdByUserId: actor.userId,
        isDemo: user.isDemo,
      },
    });
    await audit(this.prisma.db, { actor, action: 'farmer.profile-created', entityType: 'farmer_profile', entityId: p.id });
    return this.profile(actor, p.id);
  }

  async update(actor: Actor, farmerProfileId: string, input: z.infer<typeof updateFarmerProfileSchema>): Promise<FarmerProfileDto> {
    const authority = await this.access.farmer(actor, farmerProfileId, 'location.edit');
    if (authority.mode !== 'SELF' && (input.contactConsent !== undefined || input.locationConsent !== undefined)) {
      throw new DomainError('FORBIDDEN', 'Only the farmer can change their own consent settings');
    }
    const now = new Date();
    const data: Prisma.FarmerProfileUpdateManyMutationInput = { version: { increment: 1 } };
    if (input.displayName) data.displayName = input.displayName;
    if (input.phone) data.phone = input.phone;
    if (input.preferredLanguage) data.preferredLanguage = input.preferredLanguage;
    if (input.lga) data.lga = input.lga;
    if (input.community !== undefined) data.community = input.community ?? null;
    if (input.contactConsent !== undefined) data.contactConsentAt = input.contactConsent ? now : null;
    if (input.locationConsent !== undefined) data.locationConsentAt = input.locationConsent ? now : null;
    await withTransaction(this.prisma.db, async (tx) => {
      const r = await tx.farmerProfile.updateMany({ where: { id: farmerProfileId, version: input.expectedVersion }, data });
      if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The profile was changed elsewhere. Reload and try again.');
      if (input.locationConsent !== undefined) {
        await tx.consentRecord.create({ data: { farmerProfileId, userId: actor.userId, type: 'LOCATION', documentVersion: '2026-10-draft', granted: input.locationConsent, method: 'FARMER_IN_APP' } });
      }
      await audit(tx, { actor, farmer: authority, action: 'farmer.profile-updated', entityType: 'farmer_profile', entityId: farmerProfileId, data: { fields: Object.keys(input) } });
    });
    return this.profile(actor, farmerProfileId);
  }

  async addLocation(actor: Actor, farmerProfileId: string, input: z.infer<typeof farmLocationInputSchema>): Promise<FarmLocationDto> {
    const authority = await this.access.farmer(actor, farmerProfileId, 'location.edit');
    const profile = await this.prisma.db.farmerProfile.findUniqueOrThrow({ where: { id: farmerProfileId } });
    if (input.point && input.source === 'DEVICE_GPS' && authority.mode === 'SELF' && !profile.locationConsentAt) {
      // Recording a device GPS fix is itself the consent action; store it explicitly.
      await this.prisma.db.farmerProfile.update({ where: { id: farmerProfileId }, data: { locationConsentAt: new Date() } });
    }
    const approx = await approxFor(this.prisma.db, input.lga, input.point);
    const loc = await this.prisma.db.farmLocation.create({
      data: {
        farmerProfileId,
        label: input.label,
        lga: input.lga,
        community: input.community ?? null,
        exactLat: input.point?.lat ?? null,
        exactLng: input.point?.lng ?? null,
        approxLat: approx?.lat ?? null,
        approxLng: approx?.lng ?? null,
        accuracyM: input.accuracyM ?? null,
        source: authority.mode === 'DELEGATE' && input.source === 'SELF_REPORTED_PIN' ? 'COOPERATIVE_REPORTED' : input.source,
        directions: input.directions ?? null,
        isDemo: profile.isDemo,
      },
    });
    await audit(this.prisma.db, { actor, farmer: authority, action: 'farmer.location-added', entityType: 'farm_location', entityId: loc.id });
    return this.locationDto(loc, true);
  }

  async updateLocation(actor: Actor, farmerProfileId: string, locationId: string, input: z.infer<typeof updateFarmLocationSchema>): Promise<FarmLocationDto> {
    const authority = await this.access.farmer(actor, farmerProfileId, 'location.edit');
    const approx = await approxFor(this.prisma.db, input.lga, input.point);
    const r = await this.prisma.db.farmLocation.updateMany({
      where: { id: locationId, farmerProfileId, version: input.expectedVersion, archivedAt: null },
      data: {
        label: input.label,
        lga: input.lga,
        community: input.community ?? null,
        exactLat: input.point?.lat ?? null,
        exactLng: input.point?.lng ?? null,
        approxLat: approx?.lat ?? null,
        approxLng: approx?.lng ?? null,
        accuracyM: input.accuracyM ?? null,
        source: input.source,
        directions: input.directions ?? null,
        version: { increment: 1 },
      },
    });
    if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The location was changed elsewhere or archived. Reload and try again.');
    await audit(this.prisma.db, { actor, farmer: authority, action: 'farmer.location-updated', entityType: 'farm_location', entityId: locationId });
    return this.locationDto(await this.prisma.db.farmLocation.findUniqueOrThrow({ where: { id: locationId } }), true);
  }

  async archiveLocation(actor: Actor, farmerProfileId: string, locationId: string) {
    const authority = await this.access.farmer(actor, farmerProfileId, 'location.edit');
    const inUse = await this.prisma.db.harvestRequest.count({ where: { farmLocationId: locationId, status: { in: ['DRAFT', 'PUBLISHED'] } } });
    if (inUse > 0) throw new DomainError('INVALID_STATE_TRANSITION', 'This location is used by an open harvest request');
    const r = await this.prisma.db.farmLocation.updateMany({ where: { id: locationId, farmerProfileId, archivedAt: null }, data: { archivedAt: new Date(), version: { increment: 1 } } });
    if (r.count !== 1) throw new DomainError('NOT_FOUND', 'Location not found');
    await audit(this.prisma.db, { actor, farmer: authority, action: 'farmer.location-archived', entityType: 'farm_location', entityId: locationId });
    return { ok: true };
  }

  // ───────────── Delegations, from the farmer's side ─────────────

  async delegations(actor: Actor, farmerProfileId: string): Promise<{ delegations: DelegationDto[]; cooperatives: Array<{ id: string; name: string; memberSince: string }> }> {
    const authority = await this.access.farmer(actor, farmerProfileId, 'profile.view');
    if (authority.mode === 'DELEGATE') throw new DomainError('FORBIDDEN', 'Only the farmer can see all of their delegations');
    const rows = await this.prisma.db.delegationConsent.findMany({
      where: { farmerProfileId },
      include: { cooperative: { select: { name: true } }, farmerProfile: { select: { displayName: true } } },
      orderBy: { grantedAt: 'desc' },
    });
    const users = await this.prisma.db.user.findMany({ where: { id: { in: rows.map((r) => r.recordedByUserId) } }, select: { id: true, displayName: true } });
    const name = (id: string) => users.find((u) => u.id === id)?.displayName ?? 'Unknown';
    const coops = await this.prisma.db.cooperativeMembership.findMany({ where: { farmerProfileId, status: 'ACTIVE' }, include: { cooperative: { select: { name: true } } } });
    return {
      delegations: rows.map((r) => delegationDto(r, name(r.recordedByUserId))),
      cooperatives: coops.map((c) => ({ id: c.cooperativeId, name: c.cooperative.name, memberSince: c.joinedAt.toISOString() })),
    };
  }

  /** A farmer with an account grants (or re-grants with new scopes) a delegation to one of their cooperatives. */
  async grant(actor: Actor, farmerProfileId: string, input: z.infer<typeof grantDelegationSchema>) {
    const authority = await this.access.farmer(actor, farmerProfileId, 'profile.view');
    if (authority.mode !== 'SELF') throw new DomainError('FORBIDDEN', 'Only the farmer can grant permissions to a cooperative');
    await withTransaction(this.prisma.db, async (tx) => {
      const coopMember = await tx.cooperativeMembership.findUnique({ where: { cooperativeId_farmerProfileId: { cooperativeId: input.cooperativeId, farmerProfileId } } });
      if (!coopMember || coopMember.status !== 'ACTIVE') throw new DomainError('NOT_FOUND', 'You are not an active member of that cooperative');
      const now = new Date();
      await tx.delegationConsent.updateMany({
        where: { farmerProfileId, cooperativeId: input.cooperativeId, revokedAt: null },
        data: { revokedAt: now, revokedByUserId: actor.userId, revokeReason: 'Replaced by a new grant from the farmer' },
      });
      const d = await tx.delegationConsent.create({
        data: {
          cooperativeId: input.cooperativeId,
          farmerProfileId,
          scopes: input.scopes,
          method: 'FARMER_IN_APP',
          recordedByUserId: actor.userId,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      await audit(tx, { actor, farmer: authority, action: 'delegation.granted', entityType: 'delegation', entityId: d.id, organisationId: input.cooperativeId, data: { scopes: input.scopes } });
    });
    return this.delegations(actor, farmerProfileId);
  }

  /** Revocation stops future delegated actions; past confirmations made under it stay valid. */
  async revoke(actor: Actor, delegationId: string, reason: string) {
    const d = await this.prisma.db.delegationConsent.findUnique({ where: { id: delegationId } });
    if (!d) throw new DomainError('NOT_FOUND', 'Delegation not found');
    let allowed = false;
    const profile = await this.prisma.db.farmerProfile.findUniqueOrThrow({ where: { id: d.farmerProfileId } });
    if (profile.userId === actor.userId) allowed = true;
    if (!allowed) {
      const m = await this.prisma.db.membership.findUnique({ where: { userId_organisationId: { userId: actor.userId, organisationId: d.cooperativeId } } });
      allowed = Boolean(m && m.status === 'ACTIVE' && m.roles.some((r) => r === 'OWNER' || r === 'REPRESENTATIVE'));
    }
    if (!allowed && actor.platformRole === 'ADMIN') allowed = true;
    if (!allowed) throw new DomainError('NOT_FOUND', 'Delegation not found');
    if (d.revokedAt) return { ok: true };
    await this.prisma.db.delegationConsent.update({ where: { id: delegationId }, data: { revokedAt: new Date(), revokedByUserId: actor.userId, revokeReason: reason } });
    await audit(this.prisma.db, { actor, action: 'delegation.revoked', entityType: 'delegation', entityId: delegationId, organisationId: d.cooperativeId, reason });
    return { ok: true };
  }

  authorityLabel(a: FarmerAuthority): string {
    return a.mode === 'DELEGATE' ? `${a.cooperativeName} for ${a.farmerName}` : a.farmerName;
  }

}
