import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  linkExistingFarmerSchema,
  phoneNumber,
  recordDelegationSchema,
  registerMemberSchema,
  type CoopMemberDto,
} from '@harvestslot/contracts';
import { audit, DomainError, farmerRecipients, notify, withTransaction, type Actor } from '@harvestslot/core';
import { AccessService } from '../../common/access.service.js';
import { claimCode } from '../../common/crypto.js';
import { PrismaService } from '../../common/prisma.service.js';
import { MESSAGING, type Messaging } from '../../common/tokens.js';
import { OtpService } from '../auth/otp.service.js';
import { approxFor, delegationDto } from './farmers.service.js';

const CLAIM_TTL_MS = 14 * 86_400_000;

@Injectable()
export class CooperativesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly otp: OtpService,
    @Inject(MESSAGING) private readonly messaging: Messaging,
  ) {}

  async members(actor: Actor, coopId: string): Promise<CoopMemberDto[]> {
    await this.access.requireOrg(actor, coopId, 'coop.members.manage');
    const now = new Date();
    const rows = await this.prisma.db.cooperativeMembership.findMany({
      where: { cooperativeId: coopId },
      include: {
        farmerProfile: {
          include: {
            delegations: {
              where: { cooperativeId: coopId, revokedAt: null },
              include: { cooperative: { select: { name: true } }, farmerProfile: { select: { displayName: true } } },
            },
            harvestRequests: { where: { status: { in: ['DRAFT', 'PUBLISHED'] } }, select: { id: true } },
            bookings: { where: { status: { in: ['DRAFT', 'AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE'] } }, select: { id: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    const recorders = await this.prisma.db.user.findMany({
      where: { id: { in: rows.flatMap((r) => r.farmerProfile.delegations.map((d) => d.recordedByUserId)) } },
      select: { id: true, displayName: true },
    });
    return rows.map((r) => {
      const d = r.farmerProfile.delegations.find((x) => !x.expiresAt || x.expiresAt > now);
      return {
        membershipId: r.id,
        farmerProfileId: r.farmerProfileId,
        displayName: r.farmerProfile.displayName,
        lga: r.farmerProfile.lga,
        community: r.farmerProfile.community,
        memberRef: r.memberRef,
        claimStatus: r.farmerProfile.claimStatus,
        joinedAt: r.joinedAt.toISOString(),
        status: r.status,
        activeDelegation: d ? delegationDto(d, recorders.find((u) => u.id === d.recordedByUserId)?.displayName ?? 'Unknown') : null,
        openRequests: r.farmerProfile.harvestRequests.length,
        activeBookings: r.farmerProfile.bookings.length,
      };
    });
  }

  /** Registers a farmer who has no account, recording their consent (witness or signed form). */
  async register(actor: Actor, coopId: string, input: z.infer<typeof registerMemberSchema>) {
    const m = await this.access.requireOrg(actor, coopId, 'coop.members.manage', { requireApproved: true });
    if (input.phone) {
      const taken = await this.prisma.db.user.findFirst({ where: { phone: input.phone } });
      if (taken) throw new DomainError('DUPLICATE', 'A HarvestSlot account already uses this phone. Link the existing farmer instead.');
    }
    const coop = await this.prisma.db.organisation.findUniqueOrThrow({ where: { id: coopId } });
    const farmerId = await withTransaction(this.prisma.db, async (tx) => {
      const profile = await tx.farmerProfile.create({
        data: {
          displayName: input.displayName,
          phone: input.phone ?? null,
          email: input.email ?? null,
          lga: input.lga,
          community: input.community ?? null,
          preferredLanguage: input.preferredLanguage,
          claimStatus: 'REPRESENTED_UNCLAIMED',
          createdByUserId: actor.userId,
          createdViaOrgId: coopId,
          contactConsentAt: input.consent.contactConsent ? new Date() : null,
          isDemo: coop.isDemo,
        },
      });
      await tx.cooperativeMembership.create({ data: { cooperativeId: coopId, farmerProfileId: profile.id, memberRef: input.memberRef ?? null, createdByUserId: actor.userId } });
      const d = await tx.delegationConsent.create({
        data: {
          cooperativeId: coopId,
          farmerProfileId: profile.id,
          scopes: input.consent.scopes,
          method: 'RECORDED_BY_REPRESENTATIVE',
          recordedByUserId: actor.userId,
          witnessName: input.consent.witnessName ?? null,
          evidenceAttachmentId: input.consent.evidenceAttachmentId ?? null,
          note: input.consent.note ?? null,
          expiresAt: input.consent.expiresAt ? new Date(input.consent.expiresAt) : null,
        },
      });
      await tx.consentRecord.createMany({
        data: [
          { farmerProfileId: profile.id, type: 'CONTACT_SMS', documentVersion: '2026-10-draft', granted: input.consent.contactConsent, method: 'RECORDED_BY_REPRESENTATIVE', recordedByUserId: actor.userId },
        ],
      });
      const approx = await approxFor(tx, input.lga);
      await tx.farmLocation.create({
        data: {
          farmerProfileId: profile.id,
          label: input.community ? `${input.community} farm` : 'Main farm',
          lga: input.lga,
          community: input.community ?? null,
          approxLat: approx?.lat ?? null,
          approxLng: approx?.lng ?? null,
          source: 'DESCRIPTION_ONLY',
          isDemo: coop.isDemo,
        },
      });
      await audit(tx, {
        actor,
        organisationId: coopId,
        action: 'cooperative.member-registered',
        entityType: 'farmer_profile',
        entityId: profile.id,
        data: { delegationId: d.id, scopes: input.consent.scopes, witness: Boolean(input.consent.witnessName), evidence: Boolean(input.consent.evidenceAttachmentId) },
      });
      return profile.id;
    });
    return { farmerProfileId: farmerId, cooperativeName: m.organisationName };
  }

  /** Links an existing farmer account; the farmer must grant permissions themself in the app. */
  async link(actor: Actor, coopId: string, input: z.infer<typeof linkExistingFarmerSchema>) {
    const m = await this.access.requireOrg(actor, coopId, 'coop.members.manage', { requireApproved: true });
    const id = input.farmerEmailOrPhone.trim();
    const phone = phoneNumber.safeParse(id);
    const user = await this.prisma.db.user.findFirst({
      where: id.includes('@') ? { email: id.toLowerCase() } : phone.success ? { phone: phone.data } : { id: '00000000-0000-0000-0000-000000000000' },
      include: { farmerProfile: true },
    });
    if (!user?.farmerProfile) throw new DomainError('NOT_FOUND', 'No farmer account matches. Register them as a new member instead.');
    const profile = user.farmerProfile;
    await withTransaction(this.prisma.db, async (tx) => {
      await tx.cooperativeMembership.upsert({
        where: { cooperativeId_farmerProfileId: { cooperativeId: coopId, farmerProfileId: profile.id } },
        create: { cooperativeId: coopId, farmerProfileId: profile.id, memberRef: input.memberRef ?? null, createdByUserId: actor.userId },
        update: { status: 'ACTIVE', endedAt: null, endedReason: null, memberRef: input.memberRef ?? null, version: { increment: 1 } },
      });
      await audit(tx, { actor, organisationId: coopId, action: 'cooperative.member-linked', entityType: 'farmer_profile', entityId: profile.id });
      await notify(tx, {
        userIds: [user.id],
        type: 'cooperative.linked',
        category: 'account',
        title: `${m.organisationName} added you as a member`,
        body: 'They cannot act for you until you grant permissions. Review this in Settings › Cooperative permissions.',
        link: '/farmer/permissions',
        dedupeKey: `coop-linked:${coopId}:${profile.id}`,
      });
    });
    return { farmerProfileId: profile.id };
  }

  /** Representative-recorded consent is only for members without an account; account holders grant it themselves. */
  async recordDelegation(actor: Actor, coopId: string, farmerProfileId: string, input: z.infer<typeof recordDelegationSchema>) {
    await this.access.requireOrg(actor, coopId, 'coop.members.manage', { requireApproved: true });
    const profile = await this.prisma.db.farmerProfile.findUnique({ where: { id: farmerProfileId } });
    const membership = await this.prisma.db.cooperativeMembership.findUnique({ where: { cooperativeId_farmerProfileId: { cooperativeId: coopId, farmerProfileId } } });
    if (!profile || !membership || membership.status !== 'ACTIVE') throw new DomainError('NOT_FOUND', 'Member not found');
    if (profile.userId) throw new DomainError('FORBIDDEN', 'This farmer has an account and must grant permissions in the app');
    await withTransaction(this.prisma.db, async (tx) => {
      await tx.delegationConsent.updateMany({
        where: { cooperativeId: coopId, farmerProfileId, revokedAt: null },
        data: { revokedAt: new Date(), revokedByUserId: actor.userId, revokeReason: 'Replaced by newly recorded consent' },
      });
      const d = await tx.delegationConsent.create({
        data: {
          cooperativeId: coopId,
          farmerProfileId,
          scopes: input.scopes,
          method: 'RECORDED_BY_REPRESENTATIVE',
          recordedByUserId: actor.userId,
          witnessName: input.witnessName ?? null,
          evidenceAttachmentId: input.evidenceAttachmentId ?? null,
          note: input.note ?? null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      await audit(tx, { actor, organisationId: coopId, action: 'delegation.recorded', entityType: 'delegation', entityId: d.id, data: { scopes: input.scopes } });
    });
    return { ok: true };
  }

  /** Issues a claim code so the farmer can take control of their profile (verified by an SMS code to the phone on file). */
  async claimInvite(actor: Actor, coopId: string, farmerProfileId: string) {
    await this.access.requireOrg(actor, coopId, 'coop.members.manage');
    const profile = await this.prisma.db.farmerProfile.findUnique({ where: { id: farmerProfileId } });
    const membership = await this.prisma.db.cooperativeMembership.findUnique({ where: { cooperativeId_farmerProfileId: { cooperativeId: coopId, farmerProfileId } } });
    if (!profile || !membership || membership.status !== 'ACTIVE') throw new DomainError('NOT_FOUND', 'Member not found');
    if (profile.userId) throw new DomainError('INVALID_STATE_TRANSITION', 'This farmer already has an account');
    if (!profile.phone) throw new DomainError('BAD_REQUEST', 'Add the farmer’s phone number first; claiming is verified by a code sent to it');
    const code = claimCode();
    await this.otp.createLinkToken(this.prisma.db, 'ACCOUNT_CLAIM', profile.phone, CLAIM_TTL_MS, { farmerProfileId, raw: code });
    const sentVia: Array<'SMS' | 'EMAIL'> = [];
    const unavailable: string[] = [];
    if (this.messaging.sms) {
      try {
        await this.messaging.sms.send(profile.phone, `HarvestSlot: your cooperative invited you to manage your own account. Claim code ${code}. Visit HarvestSlot › Claim account.`);
        sentVia.push('SMS');
      } catch {
        unavailable.push('SMS sending failed — give the code to the farmer in person');
      }
    } else {
      unavailable.push('SMS is not configured — give the code to the farmer in person');
    }
    await audit(this.prisma.db, { actor, organisationId: coopId, action: 'cooperative.claim-invited', entityType: 'farmer_profile', entityId: farmerProfileId });
    return { claimCode: code, sentVia, unavailable, expiresAt: new Date(Date.now() + CLAIM_TTL_MS).toISOString() };
  }

  async endMembership(actor: Actor, coopId: string, farmerProfileId: string, reason: string) {
    await this.access.requireOrg(actor, coopId, 'coop.members.manage');
    await withTransaction(this.prisma.db, async (tx) => {
      const r = await tx.cooperativeMembership.updateMany({
        where: { cooperativeId: coopId, farmerProfileId, status: 'ACTIVE' },
        data: { status: 'ENDED', endedAt: new Date(), endedReason: reason, version: { increment: 1 } },
      });
      if (r.count !== 1) throw new DomainError('NOT_FOUND', 'Member not found');
      await tx.delegationConsent.updateMany({
        where: { cooperativeId: coopId, farmerProfileId, revokedAt: null },
        data: { revokedAt: new Date(), revokedByUserId: actor.userId, revokeReason: `Membership ended: ${reason}` },
      });
      await audit(tx, { actor, organisationId: coopId, action: 'cooperative.member-ended', entityType: 'farmer_profile', entityId: farmerProfileId, reason });
      await notify(tx, {
        userIds: await farmerRecipients(tx, farmerProfileId, undefined),
        type: 'cooperative.ended',
        category: 'account',
        title: 'Cooperative membership ended',
        body: `Your membership was ended: ${reason}. The cooperative can no longer act for you. Existing bookings are unaffected.`,
        link: '/farmer/permissions',
        dedupeKey: `coop-ended:${coopId}:${farmerProfileId}:${Date.now()}`,
      });
    });
    return { ok: true };
  }
}
