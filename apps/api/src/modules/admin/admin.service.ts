import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  adminDataRequestDecisionSchema,
  adminLocationSchema,
  adminPolicyUpdateSchema,
  adminReviewDocumentSchema,
  adminReviewOrgSchema,
  adminUserStatusSchema,
  auditQuerySchema,
  exportQuerySchema,
  type BookingTermsContent,
} from '@harvestslot/contracts';
import {
  audit,
  DomainError,
  fulfilDataExport,
  notify,
  orgRecipients,
  policiesFromEnv,
  recomputeReadiness,
  requeueOutboxEvent,
  validatePolicyValue,
  withTransaction,
  type Actor,
} from '@harvestslot/core';
import type { Prisma } from '@harvestslot/db';
import { toCsv } from '../../common/csv.js';
import { PrismaService } from '../../common/prisma.service.js';
import { SessionService } from '../../common/sessions.service.js';
import { iso } from '../../common/serialize.js';
import { ENV, STORAGE, type Env, type ObjectStorage } from '../../common/tokens.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async overview() {
    const db = this.prisma.db;
    const now = new Date();
    const [pendingOrgs, openDisputes, overdueReviews, openIncidents, deadOutbox, failedDeliveries, mismatches, pendingRequests] = await Promise.all([
      db.organisation.count({ where: { status: 'PENDING_REVIEW' } }),
      db.dispute.count({ where: { status: { in: ['OPEN', 'AWAITING_RESPONSE', 'UNDER_REVIEW'] } } }),
      db.receivingRecord.count({ where: { status: 'REVIEW_OVERDUE' } }),
      db.bookingIncident.count({ where: { status: 'OPEN' } }),
      db.outboxEvent.count({ where: { status: 'DEAD' } }),
      db.deliveryAttempt.count({ where: { status: { in: ['FAILED', 'DEAD'] } } }),
      db.paymentAttempt.count({ where: { providerStatus: { startsWith: 'MISMATCH' } } }),
      db.dataRequest.count({ where: { status: { in: ['RECEIVED', 'IN_PROGRESS'] } } }),
    ]);
    const byStatus = async (isDemo: boolean) =>
      Object.fromEntries((await db.booking.groupBy({ by: ['status'], where: { isDemo }, _count: true })).map((g) => [g.status, g._count]));
    return {
      attention: { pendingOrgs, openDisputes, overdueReviews, openIncidents, deadOutbox, failedDeliveries, paymentMismatches: mismatches, pendingDataRequests: pendingRequests },
      bookings: { live: await byStatus(false), demo: await byStatus(true) },
      generatedAt: now.toISOString(),
    };
  }

  async organisations(status?: string, type?: string) {
    const rows = await this.prisma.db.organisation.findMany({
      where: { ...(status ? { status: status as never } : {}), ...(type ? { type: type as never } : {}) },
      include: { memberships: { where: { roles: { has: 'OWNER' } }, include: { user: { select: { displayName: true, email: true } } } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
    const docs = await this.prisma.db.attachment.findMany({ where: { organisationId: { in: rows.map((r) => r.id) }, purpose: 'ORG_DOCUMENT' } });
    return rows.map((o) => ({
      id: o.id,
      type: o.type,
      name: o.name,
      status: o.status,
      statusReason: o.statusReason,
      lga: o.lga,
      registrationNumber: o.registrationNumber,
      owners: o.memberships.map((m) => ({ name: m.user.displayName, email: m.user.email })),
      documents: docs.filter((d) => d.organisationId === o.id).map((d) => ({ id: d.id, filename: d.originalFilename, reviewStatus: d.reviewStatus, scanStatus: d.scanStatus })),
      isDemo: o.isDemo,
      version: o.version,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  /** Approve / reject / suspend / reinstate an organisation. Always with a reason and an audit event. */
  async reviewOrganisation(actor: Actor, id: string, input: z.infer<typeof adminReviewOrgSchema>) {
    const target = { APPROVE: 'APPROVED', REJECT: 'REJECTED', SUSPEND: 'SUSPENDED', REINSTATE: 'APPROVED' } as const;
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const org = await tx.organisation.findUnique({ where: { id } });
      if (!org) throw new DomainError('NOT_FOUND', 'Organisation not found');
      if (input.decision === 'REINSTATE' && org.status !== 'SUSPENDED') throw new DomainError('INVALID_STATE_TRANSITION', 'Only a suspended organisation can be reinstated');
      const r = await tx.organisation.updateMany({
        where: { id, version: input.expectedVersion },
        data: { status: target[input.decision], statusReason: input.reason, reviewedAt: now, reviewedByUserId: actor.userId, version: { increment: 1 } },
      });
      if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The organisation changed. Reload and try again.');
      await audit(tx, { actor, actorParty: 'ADMIN', organisationId: id, action: `admin.organisation-${input.decision.toLowerCase()}`, entityType: 'organisation', entityId: id, reason: input.reason, data: { from: org.status, to: target[input.decision] } });
      await notify(tx, {
        userIds: await orgRecipients(tx, id, ['OWNER', 'MANAGER']),
        type: 'organisation.reviewed',
        category: 'account',
        title: `${org.name}: ${target[input.decision].toLowerCase().replace('_', ' ')}`,
        body: input.reason,
        link: '/settings/organisation',
        dedupeKey: `org-review:${id}:${now.getTime()}`,
      });
      // Eligibility feeds readiness: re-evaluate the organisation's open bookings.
      const affected = await tx.booking.findMany({ where: { status: { in: ['AWAITING_CONFIRMATIONS', 'CONFIRMED'] }, OR: [{ processorOrgId: id }, { trips: { some: { transporterOrgId: id } } }] }, select: { id: true } });
      for (const b of affected) await recomputeReadiness(tx, b.id, `admin.organisation-${input.decision.toLowerCase()}`, now);
    });
    return (await this.organisations()).find((o) => o.id === id);
  }

  async reviewDocument(actor: Actor, attachmentId: string, input: z.infer<typeof adminReviewDocumentSchema>) {
    const a = await this.prisma.db.attachment.findUnique({ where: { id: attachmentId } });
    if (!a || !['ORG_DOCUMENT', 'IDENTITY_DOCUMENT', 'CONSENT_FORM', 'WEIGHT_EVIDENCE'].includes(a.purpose)) throw new DomainError('NOT_FOUND', 'Document not found');
    await this.prisma.db.attachment.update({ where: { id: attachmentId }, data: { reviewStatus: input.decision, reviewedByUserId: actor.userId, reviewNote: input.note } });
    if (a.purpose === 'WEIGHT_EVIDENCE' && input.decision === 'ADMIN_APPROVED' && a.bookingId) {
      await this.prisma.db.receivingRecord.updateMany({ where: { bookingId: a.bookingId }, data: { weightVerification: 'ADMIN_REVIEWED' } });
    }
    await audit(this.prisma.db, { actor, actorParty: 'ADMIN', action: 'admin.document-reviewed', entityType: 'attachment', entityId: attachmentId, reason: input.note, data: { decision: input.decision } });
    return { ok: true };
  }

  async users(q?: string) {
    const where: Prisma.UserWhereInput = q ? { OR: [{ email: { contains: q.toLowerCase() } }, { displayName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {};
    const rows = await this.prisma.db.user.findMany({
      where,
      include: { memberships: { include: { organisation: { select: { name: true } } } }, farmerProfile: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      phone: u.phone,
      status: u.status,
      platformRole: u.platformRole,
      memberships: u.memberships.map((m) => ({ organisationName: m.organisation.name, roles: m.roles })),
      hasFarmerProfile: Boolean(u.farmerProfile),
      mfaEnabled: Boolean(u.mfaEnabledAt),
      isDemo: u.isDemo,
      lastLoginAt: iso(u.lastLoginAt),
      createdAt: u.createdAt.toISOString(),
      version: u.version,
    }));
  }

  async setUserStatus(actor: Actor, id: string, input: z.infer<typeof adminUserStatusSchema>) {
    if (id === actor.userId) throw new DomainError('BAD_REQUEST', 'You cannot change your own account status');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const u = await tx.user.findUnique({ where: { id }, include: { farmerProfile: true } });
      if (!u) throw new DomainError('NOT_FOUND', 'User not found');
      if (u.platformRole === 'ADMIN' && input.status !== 'ACTIVE') throw new DomainError('FORBIDDEN', 'Administrators are managed with the admin CLI');
      const r = await tx.user.updateMany({ where: { id, version: input.expectedVersion }, data: { status: input.status, statusReason: input.reason, version: { increment: 1 } } });
      if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The account changed. Reload and try again.');
      if (input.status !== 'ACTIVE') await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now, revokeReason: `account ${input.status.toLowerCase()}` } });
      await audit(tx, { actor, actorParty: 'ADMIN', action: 'admin.user-status', entityType: 'user', entityId: id, reason: input.reason, data: { from: u.status, to: input.status } });
      if (u.farmerProfile) {
        const affected = await tx.booking.findMany({ where: { farmerProfileId: u.farmerProfile.id, status: { in: ['AWAITING_CONFIRMATIONS', 'CONFIRMED'] } }, select: { id: true } });
        for (const b of affected) await recomputeReadiness(tx, b.id, 'admin.user-status', now);
      }
    });
    return { ok: true };
  }

  async incidents() {
    const rows = await this.prisma.db.bookingIncident.findMany({
      where: { status: 'OPEN' },
      include: { booking: { select: { reference: true, status: true, isDemo: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const overdue = await this.prisma.db.receivingRecord.findMany({ where: { status: 'REVIEW_OVERDUE' }, include: { booking: { select: { id: true, reference: true } } } });
    return {
      incidents: rows.map((i) => ({ id: i.id, bookingId: i.bookingId, bookingReference: i.booking.reference, bookingStatus: i.booking.status, kind: i.kind, blocking: i.blocking, description: i.description, openedByParty: i.openedByParty, createdAt: i.createdAt.toISOString(), isDemo: i.booking.isDemo })),
      overdueReviews: overdue.map((r) => ({ bookingId: r.booking.id, bookingReference: r.booking.reference, reviewDeadline: iso(r.reviewDeadline), escalatedAt: iso(r.escalatedAt) })),
    };
  }

  async policies() {
    const base = policiesFromEnv(this.env);
    const rows = await this.prisma.db.platformSetting.findMany();
    const effective = await this.prisma.policies();
    return {
      effective,
      sources: Object.keys(effective).map((k) => {
        const row = rows.find((r) => r.key === k);
        return { key: k, value: (effective as unknown as Record<string, unknown>)[k], source: row ? 'override' : 'environment default', default: (base as unknown as Record<string, unknown>)[k], reason: row?.reason ?? null, updatedAt: iso(row?.updatedAt) };
      }),
      note: 'Policy changes apply to new offers and bookings. Agreed terms keep the values snapshotted when they were accepted.',
    };
  }

  async setPolicy(actor: Actor, input: z.infer<typeof adminPolicyUpdateSchema>) {
    const problem = validatePolicyValue(input.key, input.value);
    if (problem) throw new DomainError('VALIDATION_FAILED', problem);
    const before = await this.prisma.db.platformSetting.findUnique({ where: { key: input.key } });
    await this.prisma.db.platformSetting.upsert({
      where: { key: input.key },
      create: { key: input.key, value: input.value as Prisma.InputJsonValue, reason: input.reason, updatedByUserId: actor.userId },
      update: { value: input.value as Prisma.InputJsonValue, reason: input.reason, updatedByUserId: actor.userId },
    });
    await audit(this.prisma.db, { actor, actorParty: 'ADMIN', action: 'admin.policy-updated', entityType: 'platform_setting', entityId: input.key, reason: input.reason, data: { from: (before?.value ?? null) as Prisma.InputJsonValue, to: input.value as Prisma.InputJsonValue } });
    return this.policies();
  }

  async locations() {
    return this.prisma.db.supportedLocation.findMany({ orderBy: [{ state: 'asc' }, { lga: 'asc' }] });
  }

  async setLocation(actor: Actor, input: z.infer<typeof adminLocationSchema>) {
    const r = await this.prisma.db.supportedLocation.updateMany({ where: { lga: input.lga }, data: { active: input.active } });
    if (r.count === 0) throw new DomainError('NOT_FOUND', 'Location not found');
    await audit(this.prisma.db, { actor, actorParty: 'ADMIN', action: 'admin.location-updated', entityType: 'supported_location', entityId: input.lga, reason: input.reason, data: { active: input.active } });
    return this.locations();
  }

  async outbox(status?: string) {
    const rows = await this.prisma.db.outboxEvent.findMany({
      where: status ? { status: status as never } : { status: { in: ['FAILED', 'DEAD', 'PENDING', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const deliveries = await this.prisma.db.deliveryAttempt.findMany({ where: { status: { in: ['FAILED', 'DEAD', 'UNAVAILABLE'] } }, orderBy: { updatedAt: 'desc' }, take: 100 });
    return {
      events: rows.map((e) => ({ id: e.id, type: e.type, aggregateType: e.aggregateType, aggregateId: e.aggregateId, status: e.status, attempts: e.attempts, maxAttempts: e.maxAttempts, nextAttemptAt: e.nextAttemptAt.toISOString(), lastError: e.lastError, createdAt: e.createdAt.toISOString(), processedAt: iso(e.processedAt) })),
      deliveries: deliveries.map((d) => ({ id: d.id, channel: d.channel, status: d.status, destination: d.destinationMasked, error: d.error, attemptNo: d.attemptNo, updatedAt: d.updatedAt.toISOString() })),
      counts: Object.fromEntries((await this.prisma.db.outboxEvent.groupBy({ by: ['status'], _count: true })).map((g) => [g.status, g._count])),
    };
  }

  async requeue(actor: Actor, id: string, reason: string) {
    if (!(await requeueOutboxEvent(this.prisma.db, id))) throw new DomainError('INVALID_STATE_TRANSITION', 'Only failed or dead events can be re-queued');
    await audit(this.prisma.db, { actor, actorParty: 'ADMIN', action: 'admin.outbox-requeued', entityType: 'outbox_event', entityId: id, reason });
    return { ok: true };
  }

  async webhooks() {
    const rows = await this.prisma.db.integrationWebhookEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: 100 });
    return rows.map((w) => ({ id: w.id, provider: w.provider, eventType: w.eventType, environment: w.environment, status: w.status, attempts: w.attempts, processingError: w.processingError, receivedAt: w.receivedAt.toISOString(), processedAt: iso(w.processedAt) }));
  }

  async auditLog(q: z.infer<typeof auditQuerySchema>) {
    const rows = await this.prisma.db.auditEvent.findMany({
      where: { ...(q.entityType ? { entityType: q.entityType } : {}), ...(q.entityId ? { entityId: q.entityId } : {}), ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}), ...(q.action ? { action: { startsWith: q.action } } : {}) },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    const users = await this.prisma.db.user.findMany({ where: { id: { in: page.map((r) => r.actorUserId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } });
    const farmers = await this.prisma.db.farmerProfile.findMany({ where: { id: { in: page.map((r) => r.actingForFarmerId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } });
    return {
      items: page.map((e) => ({
        id: e.id,
        actor: users.find((u) => u.id === e.actorUserId)?.displayName ?? (e.actorParty === 'SYSTEM' ? 'System' : null),
        actorUserId: e.actorUserId,
        actorParty: e.actorParty,
        actingForFarmer: farmers.find((f) => f.id === e.actingForFarmerId)?.displayName ?? null,
        organisationId: e.organisationId,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        reason: e.reason,
        data: e.data,
        requestId: e.requestId,
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  /** CSV exports. Demo and live data are never mixed; every export is audited. */
  async export(actor: Actor, q: z.infer<typeof exportQuerySchema>): Promise<{ filename: string; csv: string }> {
    const isDemo = q.dataScope === 'demo';
    const from = q.from ? new Date(`${q.from}T00:00:00+01:00`) : new Date(Date.now() - 365 * 86_400_000);
    const to = q.to ? new Date(`${q.to}T23:59:59+01:00`) : new Date();
    const range = { gte: from, lte: to };
    const db = this.prisma.db;
    let header: string[];
    let rows: unknown[][];
    if (q.dataset === 'bookings') {
      const bs = await db.booking.findMany({ where: { isDemo, createdAt: range }, include: { farmerProfile: true, processorOrg: true, facility: true, termsVersions: true }, orderBy: { createdAt: 'asc' } });
      header = ['reference', 'status', 'farmer', 'processor', 'facility', 'quantity_kg', 'price_kobo_per_kg', 'freight_payer', 'freight_kobo', 'created_at', 'confirmed_at', 'completed_at', 'cancelled_at', 'cancel_reason'];
      rows = bs.map((b) => {
        const c = b.termsVersions.find((t) => t.versionNo === b.currentTermsVersionNo)!.content as unknown as BookingTermsContent;
        return [b.reference, b.status, b.farmerProfile.displayName, b.processorOrg.name, b.facility.name, c.quantityKg, c.priceKoboPerKg, c.freightPayer, c.transport?.priceKobo ?? '', b.createdAt, b.confirmedAt, b.completedAt, b.cancelledAt, b.cancelReason];
      });
    } else if (q.dataset === 'invoices') {
      const inv = await db.invoice.findMany({ where: { isDemo, issuedAt: range }, include: { booking: { select: { reference: true } } }, orderBy: { issuedAt: 'asc' } });
      header = ['number', 'kind', 'booking', 'payer_type', 'payee_type', 'total_kobo', 'confirmed_paid_kobo', 'status', 'issued_at', 'due_at'];
      rows = inv.map((i) => [i.number, i.kind, i.booking.reference, i.payerType, i.payeeType, i.totalKobo, i.confirmedPaidKobo, i.status, i.issuedAt, i.dueAt]);
    } else if (q.dataset === 'payments') {
      const ps = await db.paymentAttempt.findMany({ where: { isDemo, createdAt: range }, include: { invoice: { select: { number: true } } }, orderBy: { createdAt: 'asc' } });
      header = ['invoice', 'method', 'amount_kobo', 'status', 'verification_level', 'payer_reference', 'provider_reference', 'created_at'];
      rows = ps.map((p) => [p.invoice.number, p.method, p.amountKobo, p.status, p.verificationLevel, p.payerReference, p.providerReference, p.createdAt]);
    } else if (q.dataset === 'slots') {
      const ss = await db.processingSlot.findMany({ where: { isDemo, startsAt: range }, include: { facility: { select: { name: true } }, line: { select: { name: true } } }, orderBy: { startsAt: 'asc' } });
      header = ['facility', 'line', 'starts_at', 'ends_at', 'processing_capacity_kg', 'purchase_limit_kg', 'status'];
      rows = ss.map((s) => [s.facility.name, s.line.name, s.startsAt, s.endsAt, s.processingCapacityKg.toString(), s.purchaseLimitKg.toString(), s.status]);
    } else if (q.dataset === 'disputes') {
      const ds = await db.dispute.findMany({ where: { isDemo, createdAt: range }, include: { booking: { select: { reference: true } }, resolution: true }, orderBy: { createdAt: 'asc' } });
      header = ['reference', 'booking', 'category', 'status', 'opened_by', 'respondent', 'description', 'resolution_outcome', 'created_at'];
      rows = ds.map((d) => [d.reference, d.booking.reference, d.category, d.status, d.openedByParty, d.respondentParty, d.description, d.resolution?.outcome ?? '', d.createdAt]);
    } else {
      const as = await db.auditEvent.findMany({ where: { createdAt: range }, orderBy: { createdAt: 'asc' }, take: 50_000 });
      header = ['created_at', 'actor_user_id', 'actor_party', 'acting_for_farmer_id', 'action', 'entity_type', 'entity_id', 'reason', 'request_id'];
      rows = as.map((a) => [a.createdAt, a.actorUserId, a.actorParty, a.actingForFarmerId, a.action, a.entityType, a.entityId, a.reason, a.requestId]);
    }
    await audit(db, { actor, actorParty: 'ADMIN', action: 'admin.export', entityType: 'export', entityId: q.dataset, data: { dataScope: q.dataScope, rows: rows.length } });
    return { filename: `harvestslot-${q.dataset}-${q.dataScope}-${new Date().toISOString().slice(0, 10)}.csv`, csv: toCsv(header, rows) };
  }

  async dataRequests() {
    const rows = await this.prisma.db.dataRequest.findMany({ include: { user: { select: { displayName: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map((r) => ({ id: r.id, type: r.type, status: r.status, user: r.user.displayName, email: r.user.email, note: r.note, outcomeNote: r.outcomeNote, createdAt: r.createdAt.toISOString(), completedAt: iso(r.completedAt) }));
  }

  /**
   * Deletion requests remove or anonymise personal data that is not needed for retained
   * transaction history (contracts, invoices, disputes, audit), which is kept and pseudonymised.
   */
  async decideDataRequest(actor: Actor, id: string, input: z.infer<typeof adminDataRequestDecisionSchema>) {
    const req = await this.prisma.db.dataRequest.findUnique({ where: { id } });
    if (!req) throw new DomainError('NOT_FOUND', 'Request not found');
    if (req.status === 'COMPLETED' || req.status === 'REJECTED') throw new DomainError('INVALID_STATE_TRANSITION', 'This request is closed');
    if (input.status === 'COMPLETED' && req.type === 'EXPORT') {
      await fulfilDataExport(this.prisma.db, this.storage, id);
      await audit(this.prisma.db, { actor, actorParty: 'ADMIN', action: 'admin.data-export-completed', entityType: 'data_request', entityId: id, reason: input.outcomeNote });
      return { ok: true };
    }
    await withTransaction(this.prisma.db, async (tx) => {
      if (input.status === 'COMPLETED' && req.type === 'DELETION') {
        const user = await tx.user.findUniqueOrThrow({ where: { id: req.userId }, include: { farmerProfile: true } });
        const open = user.farmerProfile ? await tx.booking.count({ where: { farmerProfileId: user.farmerProfile.id, status: { in: ['DRAFT', 'AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE'] } } }) : 0;
        if (open) throw new DomainError('INVALID_STATE_TRANSITION', 'The user has open bookings. Complete or cancel them before deletion.');
        await tx.user.update({
          where: { id: user.id },
          data: { email: null, phone: null, passwordHash: null, displayName: 'Deleted user', status: 'DEACTIVATED', statusReason: 'Deleted on request', mfaSecretEnc: null, mfaRecoveryCodeHashes: [], notificationPrefs: {}, version: { increment: 1 } },
        });
        await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'account deleted' } });
        if (user.farmerProfile) {
          await tx.farmerProfile.update({ where: { id: user.farmerProfile.id }, data: { displayName: 'Former farmer', phone: null, email: null, community: null, contactConsentAt: null, locationConsentAt: null } });
          await tx.farmLocation.updateMany({ where: { farmerProfileId: user.farmerProfile.id }, data: { exactLat: null, exactLng: null, directions: null, archivedAt: new Date() } });
        }
        await tx.notification.deleteMany({ where: { userId: user.id } });
      }
      await tx.dataRequest.update({ where: { id }, data: { status: input.status, outcomeNote: input.outcomeNote, processedByUserId: actor.userId, completedAt: input.status === 'IN_PROGRESS' ? null : new Date() } });
      await audit(tx, { actor, actorParty: 'ADMIN', action: `admin.data-request-${input.status.toLowerCase()}`, entityType: 'data_request', entityId: id, reason: input.outcomeNote, data: { type: req.type } });
    });
    return { ok: true };
  }
}
