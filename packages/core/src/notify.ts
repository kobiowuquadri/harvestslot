import type { DelegationScope, MembershipRole } from '@harvestslot/contracts';
import type { Db } from '@harvestslot/db';
import { OUTBOX_TYPES } from './outbox.js';

export type NotificationCategory = 'offers' | 'bookings' | 'transport' | 'receiving' | 'payments' | 'disputes' | 'account';

export interface NotifyInput {
  userIds: Iterable<string | null | undefined>;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string;
  bookingId?: string;
  /** Per-event key; the user id is appended so each recipient gets at most one copy. */
  dedupeKey?: string;
}

/**
 * Creates in-app notifications in the caller's transaction and queues external delivery through the
 * outbox. External delivery (email/SMS) happens in the worker, after commit, with retries.
 */
export async function notify(db: Db, input: NotifyInput): Promise<number> {
  const ids = Array.from(new Set(Array.from(input.userIds).filter((x): x is string => !!x)));
  if (ids.length === 0) return 0;
  const users = await db.user.findMany({ where: { id: { in: ids }, status: { not: 'DEACTIVATED' } }, select: { id: true, isDemo: true } });
  if (users.length === 0) return 0;
  const created = await db.notification.createManyAndReturn({
    data: users.map((u) => ({
      userId: u.id,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 1000),
      link: input.link ?? null,
      bookingId: input.bookingId ?? null,
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${u.id}` : null,
      isDemo: u.isDemo,
    })),
    skipDuplicates: true,
    select: { id: true },
  });
  if (created.length > 0) {
    await db.outboxEvent.createMany({
      data: created.map((n) => ({
        type: OUTBOX_TYPES.NOTIFICATION_DELIVER,
        aggregateType: 'notification',
        aggregateId: n.id,
        payload: { notificationId: n.id, category: input.category },
        dedupeKey: `deliver:${n.id}`,
      })),
      skipDuplicates: true,
    });
  }
  return created.length;
}

export interface RecipientSpec {
  /** Farmer's own account plus cooperative representatives holding a valid delegation (optionally with a scope). */
  farmer?: boolean | DelegationScope;
  processorRoles?: MembershipRole[];
  /** Transporter dispatchers/owners and the assigned driver of the active trip. */
  transporter?: boolean;
  admins?: boolean;
}

/** Users who should hear about a booking event, resolved from current memberships and delegations. */
export async function bookingRecipients(db: Db, bookingId: string, spec: RecipientSpec, now = new Date()): Promise<string[]> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      farmerProfileId: true,
      processorOrgId: true,
      farmerProfile: { select: { userId: true } },
      trips: {
        where: { status: { in: ['HELD', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } },
        select: { transporterOrgId: true, driver: { select: { userId: true } } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!booking) return [];
  const out = new Set<string>();
  if (spec.farmer) {
    for (const id of await farmerRecipients(db, booking.farmerProfileId, spec.farmer === true ? undefined : spec.farmer, now)) out.add(id);
  }
  if (spec.processorRoles?.length) {
    const members = await db.membership.findMany({
      where: { organisationId: booking.processorOrgId, status: 'ACTIVE', roles: { hasSome: spec.processorRoles } },
      select: { userId: true },
    });
    members.forEach((m) => out.add(m.userId));
  }
  if (spec.transporter && booking.trips[0]) {
    const trip = booking.trips[0];
    const members = await db.membership.findMany({
      where: { organisationId: trip.transporterOrgId, status: 'ACTIVE', roles: { hasSome: ['OWNER', 'DISPATCHER'] } },
      select: { userId: true },
    });
    members.forEach((m) => out.add(m.userId));
    if (trip.driver?.userId) out.add(trip.driver.userId);
  }
  if (spec.admins) (await adminUserIds(db)).forEach((id) => out.add(id));
  return Array.from(out);
}

export async function farmerRecipients(db: Db, farmerProfileId: string, scope: DelegationScope | undefined, now = new Date()): Promise<string[]> {
  const out = new Set<string>();
  const profile = await db.farmerProfile.findUnique({ where: { id: farmerProfileId }, select: { userId: true } });
  if (profile?.userId) out.add(profile.userId);
  const delegations = await db.delegationConsent.findMany({
    where: {
      farmerProfileId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(scope ? { scopes: { has: scope } } : {}),
    },
    select: { cooperativeId: true },
  });
  if (delegations.length) {
    const reps = await db.membership.findMany({
      where: {
        organisationId: { in: delegations.map((d) => d.cooperativeId) },
        status: 'ACTIVE',
        roles: { hasSome: ['OWNER', 'REPRESENTATIVE'] },
      },
      select: { userId: true },
    });
    reps.forEach((r) => out.add(r.userId));
  }
  return Array.from(out);
}

export async function orgRecipients(db: Db, organisationId: string, roles: MembershipRole[]): Promise<string[]> {
  const members = await db.membership.findMany({
    where: { organisationId, status: 'ACTIVE', roles: { hasSome: roles } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

export async function adminUserIds(db: Db): Promise<string[]> {
  const admins = await db.user.findMany({ where: { platformRole: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
  return admins.map((a) => a.id);
}
