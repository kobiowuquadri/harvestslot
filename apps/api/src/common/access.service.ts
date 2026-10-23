import { Injectable } from '@nestjs/common';
import {
  FARMER_ACTION_SCOPES,
  ORG_PERMISSIONS,
  roleGrants,
  scopeAllows,
  type BookingParty,
  type DelegationScope,
  type FarmerAction,
  type MembershipRole,
  type OrgPermission,
  type OrgType,
} from '@harvestslot/contracts';
import { DomainError, type Actor, type FarmerAuthority, type MembershipFact } from '@harvestslot/core';
import type { Db } from '@harvestslot/db';
import { PrismaService } from './prisma.service.js';

export interface BookingAccess {
  bookingId: string;
  farmerProfileId: string;
  processorOrgId: string;
  parties: BookingParty[];
  farmer?: FarmerAuthority;
  processorRoles: MembershipRole[];
  transporter?: { organisationId: string; roles: MembershipRole[]; isAssignedDriver: boolean; driverId: string | null };
  isAdmin: boolean;
}

const READ_ONLY_FARMER_ACTIONS: FarmerAction[] = ['profile.view', 'harvest.view', 'booking.view', 'finance.view'];

/**
 * Server-side authorisation. Every protected operation resolves authority from the database here:
 * organisation memberships and roles, cooperative delegations and scopes, and booking participation.
 * Nothing about authority is taken from the browser. Unrelated resources answer 404, not 403.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async memberships(actor: Actor, db: Db = this.prisma.db): Promise<MembershipFact[]> {
    const rows = await db.membership.findMany({
      where: { userId: actor.userId, status: 'ACTIVE' },
      include: { organisation: { select: { id: true, type: true, status: true, name: true } } },
    });
    return rows.map((m) => ({
      organisationId: m.organisationId,
      organisationType: m.organisation.type,
      organisationStatus: m.organisation.status,
      organisationName: m.organisation.name,
      roles: m.roles,
    }));
  }

  /** Requires an active membership with a role granting `permission`. */
  async requireOrg(
    actor: Actor,
    organisationId: string,
    permission: OrgPermission,
    opts: { requireApproved?: boolean; db?: Db } = {},
  ): Promise<MembershipFact> {
    const db = opts.db ?? this.prisma.db;
    const m = await db.membership.findUnique({
      where: { userId_organisationId: { userId: actor.userId, organisationId } },
      include: { organisation: { select: { type: true, status: true, name: true } } },
    });
    if (!m || m.status !== 'ACTIVE') {
      if (actor.platformRole === 'ADMIN' && permission.endsWith('.view')) {
        const org = await db.organisation.findUnique({ where: { id: organisationId } });
        if (org) return { organisationId, organisationType: org.type, organisationStatus: org.status, organisationName: org.name, roles: [] };
      }
      throw new DomainError('NOT_FOUND', 'Organisation not found');
    }
    const rule = ORG_PERMISSIONS[permission];
    if (m.organisation.type !== rule.orgType) throw new DomainError('FORBIDDEN', `This action is for ${rule.orgType.toLowerCase()} organisations`);
    if (!roleGrants(permission, m.organisation.type as OrgType, m.roles)) {
      throw new DomainError('FORBIDDEN', `Your role cannot ${rule.description.toLowerCase()}`, { required: rule.roles });
    }
    if (opts.requireApproved && m.organisation.status !== 'APPROVED') {
      throw new DomainError('ORG_NOT_APPROVED', 'Your organisation must be reviewed and approved by HarvestSlot before it can do this');
    }
    if (m.organisation.status === 'SUSPENDED') throw new DomainError('ORG_NOT_APPROVED', 'Your organisation is suspended');
    return {
      organisationId,
      organisationType: m.organisation.type,
      organisationStatus: m.organisation.status,
      organisationName: m.organisation.name,
      roles: m.roles,
    };
  }

  /** Active delegation (not revoked, not expired, coop membership active, representative active in that coop). */
  async activeDelegation(actor: Actor, farmerProfileId: string, db: Db = this.prisma.db, now = new Date()) {
    const delegations = await db.delegationConsent.findMany({
      where: { farmerProfileId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      include: { cooperative: { select: { id: true, name: true, status: true } } },
    });
    for (const d of delegations) {
      if (d.cooperative.status === 'SUSPENDED' || d.cooperative.status === 'REJECTED') continue;
      const membership = await db.membership.findUnique({
        where: { userId_organisationId: { userId: actor.userId, organisationId: d.cooperativeId } },
      });
      if (!membership || membership.status !== 'ACTIVE' || !membership.roles.some((r) => r === 'OWNER' || r === 'REPRESENTATIVE')) continue;
      const coopMember = await db.cooperativeMembership.findUnique({
        where: { cooperativeId_farmerProfileId: { cooperativeId: d.cooperativeId, farmerProfileId } },
      });
      if (!coopMember || coopMember.status !== 'ACTIVE') continue;
      return d;
    }
    return null;
  }

  /**
   * Authority to perform a farmer-side action: the farmer themself, or a cooperative representative
   * whose delegation includes the required scope. Admins may only read.
   */
  async farmer(actor: Actor, farmerProfileId: string, action: FarmerAction, db: Db = this.prisma.db): Promise<FarmerAuthority> {
    const profile = await db.farmerProfile.findUnique({ where: { id: farmerProfileId }, select: { id: true, userId: true, displayName: true } });
    if (!profile) throw new DomainError('NOT_FOUND', 'Farmer not found');
    if (profile.userId === actor.userId) return { mode: 'SELF', farmerProfileId, farmerName: profile.displayName };
    const delegation = await this.activeDelegation(actor, farmerProfileId, db);
    if (delegation) {
      if (!scopeAllows(action, delegation.scopes as DelegationScope[])) {
        const required = FARMER_ACTION_SCOPES[action];
        throw new DomainError(
          'DELEGATION_SCOPE_MISSING',
          `${profile.displayName} has not authorised ${delegation.cooperative.name} to do this. Ask the farmer to approve, or to extend your permission.`,
          { required },
        );
      }
      return {
        mode: 'DELEGATE',
        farmerProfileId,
        farmerName: profile.displayName,
        delegationId: delegation.id,
        cooperativeId: delegation.cooperativeId,
        cooperativeName: delegation.cooperative.name,
        scopes: delegation.scopes as DelegationScope[],
      };
    }
    if (actor.platformRole === 'ADMIN' && READ_ONLY_FARMER_ACTIONS.includes(action)) {
      return { mode: 'ADMIN', farmerProfileId, farmerName: profile.displayName };
    }
    throw new DomainError('NOT_FOUND', 'Farmer not found');
  }

  /** Who the actor is with respect to a booking. Throws 404 when they have no relationship. */
  async booking(actor: Actor, bookingId: string, db: Db = this.prisma.db): Promise<BookingAccess> {
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        farmerProfileId: true,
        processorOrgId: true,
        trips: { select: { transporterOrgId: true, status: true, driver: { select: { id: true, userId: true } } } },
        quotes: { select: { transporterOrgId: true } },
      },
    });
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
    const access: BookingAccess = {
      bookingId,
      farmerProfileId: booking.farmerProfileId,
      processorOrgId: booking.processorOrgId,
      parties: [],
      processorRoles: [],
      isAdmin: actor.platformRole === 'ADMIN',
    };
    const farmerProfile = await db.farmerProfile.findUnique({ where: { id: booking.farmerProfileId }, select: { userId: true, displayName: true } });
    if (farmerProfile?.userId === actor.userId) {
      access.parties.push('FARMER');
      access.farmer = { mode: 'SELF', farmerProfileId: booking.farmerProfileId, farmerName: farmerProfile.displayName };
    } else {
      const d = await this.activeDelegation(actor, booking.farmerProfileId, db);
      if (d) {
        access.parties.push('FARMER');
        access.farmer = {
          mode: 'DELEGATE',
          farmerProfileId: booking.farmerProfileId,
          farmerName: farmerProfile?.displayName ?? 'Farmer',
          delegationId: d.id,
          cooperativeId: d.cooperativeId,
          cooperativeName: d.cooperative.name,
          scopes: d.scopes as DelegationScope[],
        };
      }
    }
    const memberships = await db.membership.findMany({ where: { userId: actor.userId, status: 'ACTIVE' } });
    const processor = memberships.find((m) => m.organisationId === booking.processorOrgId);
    if (processor) {
      access.parties.push('PROCESSOR');
      access.processorRoles = processor.roles;
    }
    const transporterOrgIds = new Set([...booking.trips.map((t) => t.transporterOrgId), ...booking.quotes.map((q) => q.transporterOrgId)]);
    const transporter = memberships.find((m) => transporterOrgIds.has(m.organisationId));
    if (transporter) {
      const assigned = booking.trips.find(
        (t) => t.transporterOrgId === transporter.organisationId && t.driver?.userId === actor.userId && ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'HELD'].includes(t.status),
      );
      const isManager = transporter.roles.some((r) => r === 'OWNER' || r === 'DISPATCHER');
      if (isManager || assigned) {
        access.parties.push('TRANSPORTER');
        access.transporter = {
          organisationId: transporter.organisationId,
          roles: transporter.roles,
          isAssignedDriver: Boolean(assigned),
          driverId: assigned?.driver?.id ?? null,
        };
      }
    }
    if (access.isAdmin) access.parties.push('ADMIN');
    if (access.parties.length === 0) throw new DomainError('NOT_FOUND', 'Booking not found');
    return access;
  }

  /** Farmer-side authority on a booking for an action, or a clear error. */
  requireFarmerAction(access: BookingAccess, action: FarmerAction): FarmerAuthority {
    if (!access.farmer) throw new DomainError('FORBIDDEN', 'Only the farmer or an authorised representative can do this');
    if (access.farmer.mode === 'DELEGATE' && !scopeAllows(action, access.farmer.scopes)) {
      throw new DomainError('DELEGATION_SCOPE_MISSING', `Your delegation from ${access.farmer.farmerName} does not include this action`, {
        required: FARMER_ACTION_SCOPES[action],
      });
    }
    return access.farmer;
  }

  requireProcessorRole(access: BookingAccess, roles: MembershipRole[], what: string): void {
    if (!access.parties.includes('PROCESSOR')) throw new DomainError('FORBIDDEN', `Only the processor can ${what}`);
    if (!access.processorRoles.some((r) => roles.includes(r))) {
      throw new DomainError('FORBIDDEN', `Your role cannot ${what}`, { required: roles });
    }
  }
}
