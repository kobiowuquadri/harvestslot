import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ROLES_BY_ORG_TYPE,
  createOrganisationSchema,
  inviteStaffSchema,
  updateMemberRolesSchema,
  updateOrganisationSchema,
  type MembershipRole,
  type OrgPermission,
  type OrgType,
  type OrganisationDto,
} from '@harvestslot/contracts';
import { audit, DomainError, withTransaction, type Actor } from '@harvestslot/core';
import { AccessService } from '../../common/access.service.js';
import { sha256Hex } from '../../common/crypto.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso } from '../../common/serialize.js';
import { ENV, type Env } from '../../common/tokens.js';
import { OtpService } from '../auth/otp.service.js';

const MANAGE: Record<OrgType, OrgPermission> = {
  PROCESSOR: 'processor.org.manage',
  TRANSPORTER: 'transport.org.manage',
  COOPERATIVE: 'coop.org.manage',
};
const STAFF: Record<OrgType, OrgPermission> = {
  PROCESSOR: 'processor.staff.manage',
  TRANSPORTER: 'transport.staff.manage',
  COOPERATIVE: 'coop.org.manage',
};

@Injectable()
export class OrganisationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly otp: OtpService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async orgType(orgId: string): Promise<OrgType> {
    const org = await this.prisma.db.organisation.findUnique({ where: { id: orgId }, select: { type: true } });
    if (!org) throw new DomainError('NOT_FOUND', 'Organisation not found');
    return org.type;
  }

  async get(actor: Actor, orgId: string): Promise<OrganisationDto> {
    const memberships = await this.access.memberships(actor);
    const mine = memberships.find((m) => m.organisationId === orgId);
    if (!mine && actor.platformRole !== 'ADMIN') throw new DomainError('NOT_FOUND', 'Organisation not found');
    const org = await this.prisma.db.organisation.findUniqueOrThrow({ where: { id: orgId } });
    const docs = await this.prisma.db.attachment.findMany({ where: { organisationId: orgId, purpose: 'ORG_DOCUMENT' }, orderBy: { createdAt: 'desc' } });
    return {
      id: org.id,
      type: org.type,
      name: org.name,
      status: org.status,
      statusReason: org.statusReason,
      lga: org.lga,
      state: org.state,
      address: org.address,
      registrationNumber: org.registrationNumber,
      registrationNumberNote: org.registrationNumber
        ? docs.some((d) => d.reviewStatus === 'ADMIN_APPROVED')
          ? 'Self-reported; a supporting document was reviewed by a HarvestSlot administrator (not checked with the registry).'
          : 'Self-reported; not independently verified.'
        : 'Not provided.',
      contactEmail: org.contactEmail,
      contactPhone: org.contactPhone,
      description: org.description,
      reviewedAt: iso(org.reviewedAt),
      documents: docs.map((d) => ({ id: d.id, filename: d.originalFilename, reviewStatus: d.reviewStatus, scanStatus: d.scanStatus, createdAt: d.createdAt.toISOString() })),
      myRoles: mine?.roles ?? [],
      isDemo: org.isDemo,
      version: org.version,
    };
  }

  async create(actor: Actor, input: z.infer<typeof createOrganisationSchema>): Promise<OrganisationDto> {
    const org = await withTransaction(this.prisma.db, async (tx) => {
      const created = await tx.organisation.create({
        data: {
          type: input.type,
          name: input.name,
          lga: input.lga,
          address: input.address ?? null,
          registrationNumber: input.registrationNumber ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          description: input.description ?? null,
        },
      });
      await tx.membership.create({ data: { userId: actor.userId, organisationId: created.id, roles: ['OWNER'] } });
      await audit(tx, { actor, action: 'organisation.created', entityType: 'organisation', entityId: created.id, organisationId: created.id, data: { type: input.type } });
      return created;
    });
    return this.get(actor, org.id);
  }

  async update(actor: Actor, orgId: string, input: z.infer<typeof updateOrganisationSchema>): Promise<OrganisationDto> {
    await this.access.requireOrg(actor, orgId, MANAGE[await this.orgType(orgId)]);
    const { expectedVersion, ...fields } = input;
    const r = await this.prisma.db.organisation.updateMany({
      where: { id: orgId, version: expectedVersion },
      data: { ...fields, version: { increment: 1 } },
    });
    if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The organisation was changed by someone else. Reload and try again.');
    await audit(this.prisma.db, { actor, action: 'organisation.updated', entityType: 'organisation', entityId: orgId, organisationId: orgId, data: { fields: Object.keys(fields) } });
    return this.get(actor, orgId);
  }

  async staff(actor: Actor, orgId: string) {
    const memberships = await this.access.memberships(actor);
    if (!memberships.some((m) => m.organisationId === orgId) && actor.platformRole !== 'ADMIN') throw new DomainError('NOT_FOUND', 'Organisation not found');
    const [members, invitations] = await Promise.all([
      this.prisma.db.membership.findMany({ where: { organisationId: orgId }, include: { user: { select: { displayName: true, email: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.db.staffInvitation.findMany({ where: { organisationId: orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      members: members.map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        displayName: m.user.displayName,
        email: m.user.email,
        roles: m.roles,
        status: m.status,
        version: m.version,
        isMe: m.userId === actor.userId,
      })),
      invitations: invitations.map((i) => ({ id: i.id, email: i.email, roles: i.roles, expiresAt: i.expiresAt.toISOString(), acceptedAt: iso(i.acceptedAt) })),
      allowedRoles: ROLES_BY_ORG_TYPE[await this.orgType(orgId)],
    };
  }

  private validateRoles(type: OrgType, roles: MembershipRole[]): void {
    const allowed = ROLES_BY_ORG_TYPE[type];
    const bad = roles.filter((r) => !allowed.includes(r));
    if (bad.length) throw new DomainError('VALIDATION_FAILED', `Roles not valid for this organisation: ${bad.join(', ')}`);
  }

  async invite(actor: Actor, orgId: string, input: z.infer<typeof inviteStaffSchema>) {
    const type = await this.orgType(orgId);
    const m = await this.access.requireOrg(actor, orgId, STAFF[type]);
    this.validateRoles(type, input.roles);
    const raw = await withTransaction(this.prisma.db, async (tx) => {
      const token = await this.otp.createLinkToken(tx, 'STAFF_INVITE', input.email, 7 * 86_400_000, { organisationId: orgId });
      await tx.staffInvitation.create({
        data: {
          organisationId: orgId,
          email: input.email,
          roles: input.roles,
          tokenHash: sha256Hex(`STAFF_INVITE:${token}`),
          invitedByUserId: actor.userId,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      });
      await audit(tx, { actor, action: 'membership.invited', entityType: 'organisation', entityId: orgId, organisationId: orgId, data: { email: input.email, roles: input.roles } });
      return token;
    });
    await this.otp.sendEmail(
      input.email,
      `You're invited to ${m.organisationName} on HarvestSlot`,
      `${actor.displayName} invited you to join ${m.organisationName} on HarvestSlot as ${input.roles.join(', ').toLowerCase().replace(/_/g, ' ')}.\n\nSign in (or create an account with this email address), then open: ${this.env.PUBLIC_BASE_URL}/invitations/accept?token=${raw}\n\nThe invitation expires in 7 days.`,
    );
    return { ok: true };
  }

  async revokeInvitation(actor: Actor, orgId: string, invitationId: string) {
    await this.access.requireOrg(actor, orgId, STAFF[await this.orgType(orgId)]);
    const r = await this.prisma.db.staffInvitation.updateMany({ where: { id: invitationId, organisationId: orgId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count !== 1) throw new DomainError('NOT_FOUND', 'Invitation not found');
    await audit(this.prisma.db, { actor, action: 'membership.invitation-revoked', entityType: 'organisation', entityId: orgId, organisationId: orgId });
    return { ok: true };
  }

  async setRoles(actor: Actor, orgId: string, membershipId: string, input: z.infer<typeof updateMemberRolesSchema>) {
    const type = await this.orgType(orgId);
    await this.access.requireOrg(actor, orgId, STAFF[type]);
    this.validateRoles(type, input.roles);
    await withTransaction(this.prisma.db, async (tx) => {
      const member = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!member || member.organisationId !== orgId) throw new DomainError('NOT_FOUND', 'Member not found');
      if (member.roles.includes('OWNER') && !input.roles.includes('OWNER')) await this.assertAnotherOwner(tx, orgId, membershipId);
      const r = await tx.membership.updateMany({ where: { id: membershipId, version: input.expectedVersion }, data: { roles: input.roles, version: { increment: 1 } } });
      if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'This member was changed by someone else. Reload and try again.');
      if (type === 'TRANSPORTER' && input.roles.includes('DRIVER')) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: member.userId } });
        await tx.driver.upsert({
          where: { organisationId_userId: { organisationId: orgId, userId: member.userId } },
          create: { organisationId: orgId, userId: member.userId, displayName: user.displayName, phone: user.phone },
          update: { status: 'ACTIVE' },
        });
      }
      await audit(tx, { actor, action: 'membership.roles-changed', entityType: 'membership', entityId: membershipId, organisationId: orgId, data: { from: member.roles, to: input.roles } });
    });
    return { ok: true };
  }

  async revokeMember(actor: Actor, orgId: string, membershipId: string, reason: string) {
    const type = await this.orgType(orgId);
    await this.access.requireOrg(actor, orgId, STAFF[type]);
    await withTransaction(this.prisma.db, async (tx) => {
      const member = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!member || member.organisationId !== orgId || member.status !== 'ACTIVE') throw new DomainError('NOT_FOUND', 'Member not found');
      if (member.roles.includes('OWNER')) await this.assertAnotherOwner(tx, orgId, membershipId);
      await tx.membership.update({ where: { id: membershipId }, data: { status: 'REVOKED', revokedAt: new Date(), revokedByUserId: actor.userId, version: { increment: 1 } } });
      await tx.driver.updateMany({ where: { organisationId: orgId, userId: member.userId }, data: { status: 'INACTIVE' } });
      await audit(tx, { actor, action: 'membership.revoked', entityType: 'membership', entityId: membershipId, organisationId: orgId, reason });
    });
    return { ok: true };
  }

  private async assertAnotherOwner(tx: Parameters<Parameters<typeof withTransaction>[1]>[0], orgId: string, exceptMembershipId: string) {
    const owners = await tx.membership.count({ where: { organisationId: orgId, status: 'ACTIVE', roles: { has: 'OWNER' }, id: { not: exceptMembershipId } } });
    if (owners === 0) throw new DomainError('INVALID_STATE_TRANSITION', 'An organisation must keep at least one owner');
  }
}
