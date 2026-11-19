import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  BOOKING_STATUS_LABELS,
  HANDOVER_ARRANGEMENT_LABELS,
  LOT_STATUS_LABELS,
  REJECTION_REASON_LABELS,
  RECEIVING_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
  bookingListQuerySchema,
  cancelBookingSchema,
  confirmTermsSchema,
  dbDateToString,
  decideAmendmentSchema,
  formatKg,
  gramsToKgString,
  openIncidentSchema,
  postMessageSchema,
  proposeAmendmentSchema,
  readyForPickupSchema,
  toGrams,
  type BookingDetail,
  type BookingParty,
  type BookingStatus,
  type BookingSummary,
  type NextStep,
  type SalePlan,
  type BookingTermsContent,
  type Readiness,
  type TermsVersionDto,
  type TimelineEvent,
} from '@harvestslot/contracts';
import {
  audit,
  BOOKING_MACHINE,
  bookingRecipients,
  changedFields,
  computeReadiness,
  describePlan,
  DomainError,
  expireBookingIfDue,
  notify,
  PRE_CONFIRMATION_STATUSES,
  recomputeReadiness,
  requiredParties,
  transition,
  withTransaction,
  type Actor,
} from '@harvestslot/core';
import type { Prisma, Tx } from '@harvestslot/db';
import { AccessService, type BookingAccess } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso, kg } from '../../common/serialize.js';
import { BookingEngine, handoverFor } from './booking-engine.service.js';

const COMMERCIAL_ROLES = ['OWNER', 'MANAGER'] as const;

/** Farmer, or a representative whose delegation includes APPROVE_SALE. */
function canApprove(access: BookingAccess): boolean {
  const f = access.farmer;
  return Boolean(f && (f.mode === 'SELF' || (f.mode === 'DELEGATE' && f.scopes.includes('APPROVE_SALE'))));
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly engine: BookingEngine,
  ) {}

  // ───────────── Reads ─────────────

  /**
   * The plan sentence and "what happens next" for a page of bookings, from one batch of reads:
   * weights, the produce invoice and its payments, open disputes and outstanding confirmations.
   */
  private async plansFor(
    items: Array<{ id: string; status: BookingStatus; ready: boolean; versionId: string; content: BookingTermsContent; readiness?: Readiness }>,
    viewer: { farmer: boolean; processor: boolean },
  ): Promise<Map<string, { plan: SalePlan; nextStep: NextStep }>> {
    const db = this.prisma.db;
    const now = new Date();
    const ids = items.map((i) => i.id);
    const [records, invoices, disputes, confs] = await Promise.all([
      db.receivingRecord.findMany({ where: { bookingId: { in: ids } }, include: { qualityAssessment: true } }),
      db.invoice.findMany({ where: { bookingId: { in: ids }, kind: 'PRODUCE' }, include: { payments: { orderBy: { createdAt: 'desc' } } } }),
      db.dispute.findMany({ where: { bookingId: { in: ids }, status: { notIn: ['RESOLVED', 'WITHDRAWN'] } }, select: { bookingId: true } }),
      db.confirmation.findMany({ where: { termsVersionId: { in: items.map((i) => i.versionId) } }, select: { termsVersionId: true, party: true } }),
    ]);
    const out = new Map<string, { plan: SalePlan; nextStep: NextStep }>();
    for (const item of items) {
      const have = new Set(confs.filter((c) => c.termsVersionId === item.versionId).map((c) => c.party));
      let blocker: { responsible: BookingParty | null; explanation: string } | null = null;
      if (item.status === 'CONFIRMED' && !item.ready) {
        const readiness = item.readiness ?? (await computeReadiness(db, item.id, now));
        const failing = readiness?.checks.find((c) => !c.passed);
        if (failing) blocker = { responsible: failing.responsible, explanation: failing.explanation };
      }
      const rec = records.find((r) => r.bookingId === item.id);
      const inv = invoices.find((i) => i.bookingId === item.id);
      const pendingG = inv ? inv.payments.filter((p) => p.status === 'REPORTED' || p.status === 'PROVIDER_PENDING').reduce((s, p) => s + p.amountKobo, 0n) : 0n;
      const outstanding = inv ? inv.totalKobo - inv.confirmedPaidKobo : 0n;
      out.set(
        item.id,
        describePlan({
          status: item.status,
          ready: item.ready,
          now,
          content: item.content,
          pendingParties: requiredParties(item.content).filter((p) => !have.has(p)),
          blocker,
          receiving: rec
            ? {
                status: rec.status,
                netKg: gramsToKgString(toGrams(rec.netKg.toString())),
                acceptedKg: rec.qualityAssessment ? gramsToKgString(toGrams(rec.qualityAssessment.acceptedKg.toString())) : null,
                reasons: rec.qualityAssessment?.rejectionReasons.map((r) => REJECTION_REASON_LABELS[r]) ?? [],
                note: rec.qualityAssessment?.rejectionNote ?? rec.qualityAssessment?.note ?? null,
                farmerDecision: rec.farmerDecision,
              }
            : null,
          invoice: inv
            ? {
                id: inv.id,
                totalKobo: Number(inv.totalKobo),
                confirmedPaidKobo: Number(inv.confirmedPaidKobo),
                reportedPendingKobo: Number(pendingG),
                outstandingKobo: Number(outstanding),
                dueAt: inv.dueAt,
                overdue: outstanding > 0n && inv.dueAt < now,
                pendingPaymentId: inv.payments.find((p) => p.status === 'REPORTED')?.id ?? null,
              }
            : null,
          openDispute: disputes.some((d) => d.bookingId === item.id),
          viewer,
        }),
      );
    }
    return out;
  }

  private async expireIfDue(bookingIds: string[]): Promise<void> {
    const now = new Date();
    const due = await this.prisma.db.booking.findMany({
      where: { id: { in: bookingIds }, status: { in: ['DRAFT', 'AWAITING_CONFIRMATIONS'] }, reservation: { status: 'HELD', expiresAt: { lte: now } } },
      select: { id: true },
    });
    for (const d of due) await withTransaction(this.prisma.db, (tx) => expireBookingIfDue(tx, d.id, now));
  }

  async list(actor: Actor, q: z.infer<typeof bookingListQuerySchema>): Promise<{ items: BookingSummary[]; nextCursor: string | null }> {
    let where: Prisma.BookingWhereInput;
    const view = q.view ?? 'farmer';
    if (view === 'admin') {
      if (actor.platformRole !== 'ADMIN') throw new DomainError('NOT_FOUND', 'Not found');
      where = {};
    } else if (view === 'processor') {
      if (!q.organisationId) throw new DomainError('VALIDATION_FAILED', 'organisationId is required');
      await this.access.requireOrg(actor, q.organisationId, 'processor.booking.view');
      where = { processorOrgId: q.organisationId };
    } else if (view === 'transporter') {
      if (!q.organisationId) throw new DomainError('VALIDATION_FAILED', 'organisationId is required');
      const m = await this.access.requireOrg(actor, q.organisationId, 'transport.job.view');
      const driverOnly = !m.roles.some((r) => r === 'OWNER' || r === 'DISPATCHER');
      where = driverOnly
        ? { trips: { some: { transporterOrgId: q.organisationId, driver: { userId: actor.userId } } } }
        : { OR: [{ trips: { some: { transporterOrgId: q.organisationId } } }, { quotes: { some: { transporterOrgId: q.organisationId } } }] };
    } else if (view === 'cooperative') {
      if (!q.organisationId) throw new DomainError('VALIDATION_FAILED', 'organisationId is required');
      await this.access.requireOrg(actor, q.organisationId, 'coop.act');
      const now = new Date();
      const delegations = await this.prisma.db.delegationConsent.findMany({
        where: { cooperativeId: q.organisationId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { farmerProfileId: true },
      });
      where = { farmerProfileId: { in: delegations.map((d) => d.farmerProfileId) } };
    } else {
      let farmerProfileId = q.farmerProfileId;
      if (!farmerProfileId) {
        const own = await this.prisma.db.farmerProfile.findUnique({ where: { userId: actor.userId }, select: { id: true } });
        if (!own) return { items: [], nextCursor: null };
        farmerProfileId = own.id;
      }
      await this.access.farmer(actor, farmerProfileId, 'booking.view');
      where = { farmerProfileId };
    }
    if (q.status) where = { AND: [where, { status: q.status }] };
    if (q.farmerProfileId && view !== 'farmer') where = { AND: [where, { farmerProfileId: q.farmerProfileId }] };
    const rows = await this.prisma.db.booking.findMany({
      where,
      include: {
        farmerProfile: { select: { displayName: true } },
        processorOrg: { select: { name: true } },
        facility: { select: { name: true } },
        termsVersions: true,
        harvestLot: true,
        shipments: { orderBy: { createdAt: 'desc' }, take: 1 },
        receivingRecord: { select: { status: true } },
      },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    await this.expireIfDue(rows.filter((r) => PRE_CONFIRMATION_STATUSES.includes(r.status)).map((r) => r.id));
    const page = rows.slice(0, q.limit);
    const currentOf = (b: (typeof page)[number]) => b.termsVersions.find((v) => v.versionNo === b.currentTermsVersionNo)!;
    const plans = await this.plansFor(
      page.map((b) => ({ id: b.id, status: b.status, ready: b.lastReadiness, versionId: currentOf(b).id, content: currentOf(b).content as unknown as BookingTermsContent })),
      { farmer: view === 'farmer' || view === 'cooperative', processor: view === 'processor' },
    );
    return {
      items: page.map((b) => {
        const t = currentOf(b);
        const c = t.content as unknown as BookingTermsContent;
        const shipment = b.shipments[0];
        const described = plans.get(b.id)!;
        return {
          id: b.id,
          reference: b.reference,
          status: b.status,
          farmerName: b.farmerProfile.displayName,
          farmerProfileId: b.farmerProfileId,
          processorName: b.processorOrg.name,
          processorOrgId: b.processorOrgId,
          facilityName: b.facility.name,
          quantityKg: c.quantityKg,
          priceKoboPerKg: c.priceKoboPerKg,
          plannedHarvestDate: c.harvest.plannedHarvestDate,
          pickupWindow: c.pickupWindow,
          deliveryWindow: c.deliveryWindow,
          ready: b.lastReadiness,
          transportStatus: c.handover
            ? HANDOVER_ARRANGEMENT_LABELS[c.handover.arrangement]
            : shipment
              ? SHIPMENT_STATUS_LABELS[shipment.status]
              : c.transport
                ? 'Transport agreed'
                : 'Transport not arranged',
          receivingStatus: b.receivingRecord ? RECEIVING_STATUS_LABELS[b.receivingRecord.status] : null,
          nextAction: described.nextStep.forViewer ?? described.nextStep.waitingFor ?? this.nextActionHint(b.status, b.lastReadiness, Boolean(c.transport || c.handover), b.harvestLot?.status ?? null),
          confirmationDeadline: iso(b.confirmationDeadline),
          plan: described.plan,
          nextStep: described.nextStep,
          isDemo: b.isDemo,
          updatedAt: b.updatedAt.toISOString(),
        };
      }),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  private nextActionHint(status: string, ready: boolean, hasTransport: boolean, lot: string | null): string | null {
    switch (status) {
      case 'DRAFT':
        return 'Farmer approval needed';
      case 'AWAITING_CONFIRMATIONS':
        return hasTransport ? 'Waiting for confirmations' : 'Arrange transport';
      case 'CONFIRMED':
        return ready ? 'Ready to harvest' : 'Resolve readiness checks';
      case 'ACTIVE':
        return lot === 'HARVEST_STARTED' ? 'Harvesting — mark ready for pickup' : lot === 'READY_FOR_PICKUP' ? 'Awaiting collection' : lot === 'COLLECTED' ? 'In transit / receiving' : 'Receiving and quality review';
      default:
        return null;
    }
  }

  private async termsDto(tx: Tx, versionId: string): Promise<TermsVersionDto> {
    const v = await tx.bookingTermsVersion.findUniqueOrThrow({ where: { id: versionId } });
    const prev = v.versionNo > 1 ? await tx.bookingTermsVersion.findUnique({ where: { bookingId_versionNo: { bookingId: v.bookingId, versionNo: v.versionNo - 1 } } }) : null;
    const confs = await tx.confirmation.findMany({ where: { termsVersionId: v.id }, orderBy: { createdAt: 'asc' } });
    const users = await tx.user.findMany({ where: { id: { in: confs.map((c) => c.actorUserId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } });
    const delegations = await tx.delegationConsent.findMany({ where: { id: { in: confs.map((c) => c.delegationId).filter((x): x is string => !!x) } }, include: { cooperative: { select: { name: true } } } });
    const content = v.content as unknown as BookingTermsContent;
    return {
      id: v.id,
      versionNo: v.versionNo,
      reason: v.reason,
      content,
      contentHash: v.contentHash,
      createdAt: v.createdAt.toISOString(),
      changedFields: prev ? changedFields(prev.content as unknown as BookingTermsContent, content) : [],
      confirmations: confs.map((c) => ({
        party: c.party,
        method: c.method,
        actorName: users.find((u) => u.id === c.actorUserId)?.displayName ?? null,
        actingForFarmer: Boolean(c.delegationId),
        viaCooperative: delegations.find((d) => d.id === c.delegationId)?.cooperative.name ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
      requiredParties: requiredParties(content),
    };
  }

  async readiness(actor: Actor, id: string): Promise<Readiness> {
    await this.access.booking(actor, id);
    await this.expireIfDue([id]);
    return (await computeReadiness(this.prisma.db, id))!;
  }

  async detail(actor: Actor, id: string): Promise<BookingDetail> {
    const access = await this.access.booking(actor, id);
    await this.expireIfDue([id]);
    const db = this.prisma.db;
    const b = await db.booking.findUniqueOrThrow({
      where: { id },
      include: {
        reservation: true,
        harvestLot: true,
        harvestRequest: { include: { farmLocation: true } },
        facility: true,
        farmerProfile: true,
        processorOrg: true,
        incidents: { orderBy: { createdAt: 'desc' } },
        amendments: { where: { status: 'PENDING' }, include: { termsVersion: true } },
        trips: { where: { status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } }, include: { driver: true, quote: { include: { transporterOrg: true } } } },
      },
    });
    const { version } = await this.engine.currentTerms(db as unknown as Tx, id);
    const current = await this.termsDto(db as unknown as Tx, version.id);
    const pending = b.amendments[0];
    const pendingDto = pending ? await this.termsDto(db as unknown as Tx, pending.termsVersionId) : null;
    const readiness = (await computeReadiness(db, id))!;
    // Exact pickup coordinates only for booking participants with an operational need.
    const loc = b.harvestRequest.farmLocation;
    const exactAllowed = access.parties.some((p) => p === 'FARMER' || p === 'TRANSPORTER') || (access.parties.includes('PROCESSOR') && ['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(b.status));
    const trip = b.trips[0];
    const pendingParties = pending ? await this.engine.pendingParties(db as unknown as Tx, pending.termsVersion) : await this.engine.pendingParties(db as unknown as Tx, version);
    const shipment = await db.shipment.findFirst({ where: { bookingId: id }, orderBy: { createdAt: 'desc' }, include: { pickupRecord: true } });
    const [shipmentDriver, shipmentVehicle] = shipment
      ? await Promise.all([
          db.driver.findUnique({ where: { id: shipment.driverId }, select: { displayName: true } }),
          db.vehicle.findUnique({ where: { id: shipment.vehicleId }, select: { registrationPlate: true } }),
        ])
      : [null, null];
    const described = (
      await this.plansFor([{ id, status: b.status, ready: readiness.ready, versionId: version.id, content: current.content, readiness }], {
        farmer: access.parties.includes('FARMER'),
        processor: access.parties.includes('PROCESSOR'),
      })
    ).get(id)!;
    const contacts: BookingDetail['contacts'] = [
      { party: 'FARMER', name: b.farmerProfile.displayName, phone: ['CONFIRMED', 'ACTIVE'].includes(b.status) ? b.farmerProfile.phone : null },
      { party: 'PROCESSOR', name: b.processorOrg.name, phone: b.processorOrg.contactPhone },
      ...(trip ? [{ party: 'TRANSPORTER' as const, name: `${trip.quote.transporterOrg.name} — driver ${trip.driver?.displayName ?? 'unassigned'}`, phone: trip.driver?.phone ?? trip.quote.transporterOrg.contactPhone }] : []),
    ];
    return {
      id: b.id,
      reference: b.reference,
      status: b.status,
      version: b.version,
      viewerParties: access.parties,
      viewerActingFor: access.farmer?.mode === 'DELEGATE' ? { farmerName: access.farmer.farmerName, cooperativeName: access.farmer.cooperativeName, scopes: access.farmer.scopes } : null,
      allowedActions: this.allowedActions(access, b.status, b.harvestLot?.status ?? null, Boolean(pending), pendingParties, readiness.ready, Boolean(current.content.transport), current.content, described.plan),
      current,
      pendingAmendment: pending && pendingDto
        ? {
            id: pending.id,
            status: pending.status,
            reason: pending.reason,
            proposedByParty: pending.proposedByParty,
            baseVersionNo: pending.baseVersionNo,
            terms: pendingDto,
            pendingParties,
            createdAt: pending.createdAt.toISOString(),
            decidedAt: iso(pending.decidedAt),
            rejectionReason: pending.rejectionReason,
          }
        : null,
      readiness,
      confirmationDeadline: iso(b.confirmationDeadline),
      reservation: b.reservation ? { status: b.reservation.status, quantityKg: kg(b.reservation.quantityKg), expiresAt: iso(b.reservation.expiresAt) } : null,
      harvestLot: b.harvestLot
        ? {
            status: b.harvestLot.status,
            quantityKg: kg(b.harvestLot.quantityKg),
            plannedHarvestDate: dbDateToString(b.harvestLot.plannedHarvestDate),
            harvestStartedAt: iso(b.harvestLot.harvestStartedAt),
            readyForPickupAt: iso(b.harvestLot.readyForPickupAt),
            reportedHarvestedKg: kg(b.harvestLot.reportedHarvestedKg),
          }
        : null,
      pickupLocation: {
        label: loc.label,
        lga: loc.lga,
        community: loc.community,
        directions: exactAllowed ? loc.directions : null,
        exact: exactAllowed && loc.exactLat !== null && loc.exactLng !== null ? { lat: Number(loc.exactLat), lng: Number(loc.exactLng), accuracyM: loc.accuracyM, source: loc.source } : null,
        approx: loc.approxLat !== null && loc.approxLng !== null ? { lat: Number(loc.approxLat), lng: Number(loc.approxLng) } : null,
      },
      facilityLocation: { lat: Number(b.facility.lat), lng: Number(b.facility.lng), address: b.facility.address },
      contacts,
      shipment: shipment
        ? {
            id: shipment.id,
            tripId: shipment.tripId,
            status: shipment.status,
            vehiclePlate: shipmentVehicle?.registrationPlate ?? '',
            driverName: shipmentDriver?.displayName ?? '',
            collectedKg: shipment.pickupRecord ? kg(shipment.pickupRecord.reportedQuantityKg) : null,
            pickupConfirmedAt: iso(shipment.pickupConfirmedAt),
            pickupConfirmationMethod: shipment.pickupRecord?.confirmationMethod ?? null,
            exceptionReason: shipment.pickupRecord?.exceptionReason ?? null,
            deliveredAt: iso(shipment.deliveredAt),
          }
        : null,
      cancelled: b.cancelledAt ? { at: b.cancelledAt.toISOString(), by: b.cancelledByParty, reason: b.cancelReason } : null,
      incidents: b.incidents.map((i) => ({ id: i.id, kind: i.kind, status: i.status, blocking: i.blocking, description: i.description, recoveryAction: i.recoveryAction, createdAt: i.createdAt.toISOString() })),
      timeline: await this.timeline(id),
      plan: described.plan,
      nextStep: described.nextStep,
      isDemo: b.isDemo,
    };
  }

  private allowedActions(
    a: BookingAccess,
    status: string,
    lot: string | null,
    hasPending: boolean,
    pendingParties: BookingParty[],
    ready: boolean,
    hasTransport: boolean,
    content: BookingTermsContent,
    plan: SalePlan,
  ): string[] {
    const out: string[] = [];
    const farmerCan = (scope: string) => a.farmer && (a.farmer.mode === 'SELF' || (a.farmer.mode === 'DELEGATE' && a.farmer.scopes.includes(scope as never)));
    const processorCommercial = a.parties.includes('PROCESSOR') && a.processorRoles.some((r) => (COMMERCIAL_ROLES as readonly string[]).includes(r));
    const transporterManager = a.transporter && a.transporter.roles.some((r) => r === 'OWNER' || r === 'DISPATCHER');
    if (status === 'DRAFT') {
      if (farmerCan('APPROVE_SALE')) out.push('approveDraft');
      if (a.farmer) out.push('discardDraft');
    }
    if (['AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE'].includes(status)) {
      if (pendingParties.includes('FARMER') && farmerCan('APPROVE_SALE')) out.push('confirmTerms');
      if (pendingParties.includes('PROCESSOR') && processorCommercial) out.push('confirmTerms');
      if (pendingParties.includes('TRANSPORTER') && transporterManager) out.push('confirmTerms');
      if (hasPending && (farmerCan('APPROVE_SALE') || processorCommercial || transporterManager)) out.push('rejectAmendment');
      if (!hasPending && (farmerCan('APPROVE_SALE') || processorCommercial)) out.push('proposeAmendment');
      // Transport arrangements apply only to bookings made with a transporter.
      if (processorCommercial && !content.handover) out.push('manageTransport');
      out.push('openIncident', 'message');
    }
    if (['DRAFT', 'AWAITING_CONFIRMATIONS', 'CONFIRMED'].includes(status) && (farmerCan('APPROVE_SALE') || processorCommercial || a.isAdmin)) out.push('cancel');
    if (status === 'CONFIRMED' && ready && farmerCan('ASSIST_DATA_ENTRY')) out.push('startHarvest');
    // Transport bookings: the farmer tells the transporter the load is ready; receiving uses the workbench.
    if (status === 'ACTIVE' && lot === 'HARVEST_STARTED' && farmerCan('ASSIST_DATA_ENTRY') && !content.handover) out.push('readyForPickup');
    if (status === 'ACTIVE' && !content.handover && a.parties.includes('PROCESSOR') && a.processorRoles.some((r) => ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'].includes(r))) out.push('receiving');
    if (['ACTIVE', 'COMPLETED'].includes(status) && (farmerCan('APPROVE_SALE') || a.parties.includes('PROCESSOR') || a.parties.includes('TRANSPORTER'))) out.push('openDispute');
    if (status === 'COMPLETED') out.push('message');
    if (status === 'AWAITING_CONFIRMATIONS' && !hasTransport && !content.handover && processorCommercial) out.push('awaitingQuotes');
    // The short sale journey, all from the booking page.
    const receivingRole = a.parties.includes('PROCESSOR') && a.processorRoles.some((r) => ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'].includes(r));
    const financeRole = a.parties.includes('PROCESSOR') && a.processorRoles.some((r) => ['OWNER', 'FINANCE_OFFICER'].includes(r));
    if (content.handover && ['CONFIRMED', 'ACTIVE'].includes(status) && !plan.weighed && receivingRole) out.push('recordWeight');
    if (plan.weighed?.farmerDecision === 'PENDING' && farmerCan('APPROVE_SALE')) out.push('reviewWeight');
    if (plan.payment && financeRole && plan.payment.outstandingKobo - plan.payment.reportedPendingKobo > 0) out.push('recordPayment');
    if (plan.payment?.pendingPaymentId && farmerCan('CONFIRM_PAYMENT_RECEIPT')) out.push('confirmPayment');
    return Array.from(new Set(out));
  }

  async timeline(bookingId: string): Promise<TimelineEvent[]> {
    const db = this.prisma.db;
    const b = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        termsVersions: { include: { confirmations: true } },
        amendments: true,
        readinessEvents: true,
        shipments: { include: { pickupRecord: true } },
        receivingRecord: true,
        processingRecord: true,
        invoices: { include: { payments: true } },
        disputes: true,
        incidents: true,
        harvestLot: true,
      },
    });
    const users = new Map((await db.user.findMany({ where: { id: { in: [...b.termsVersions.flatMap((v) => v.confirmations.map((c) => c.actorUserId)), b.cancelledByUserId].filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const ev: TimelineEvent[] = [];
    const push = (at: Date | null | undefined, kind: string, title: string, detail: string | null = null, actor: string | null = null) => {
      if (at) ev.push({ at: at.toISOString(), kind, title, detail, actor });
    };
    push(b.createdAt, 'booking', b.status === 'DRAFT' || b.preparedByUserId ? 'Acceptance prepared by cooperative representative' : 'Offer accepted — booking created');
    for (const v of b.termsVersions) {
      if (v.versionNo > 1) push(v.createdAt, 'terms', `Terms version ${v.versionNo} proposed`, v.reason.replace(/_/g, ' ').toLowerCase());
      for (const c of v.confirmations) {
        if (c.method === 'CARRIED_FORWARD') continue;
        push(c.createdAt, 'confirmation', `${c.party.charAt(0)}${c.party.slice(1).toLowerCase()} confirmed version ${v.versionNo}`, c.delegationId ? 'Confirmed by an authorised cooperative representative' : null, c.actorUserId ? users.get(c.actorUserId) ?? null : null);
      }
    }
    for (const a of b.amendments) if (a.decidedAt) push(a.decidedAt, 'terms', `Change ${a.status.toLowerCase()}`, a.rejectionReason ?? a.reason);
    push(b.confirmedAt, 'booking', 'Booking confirmed — capacity committed');
    for (const r of b.readinessEvents) push(r.createdAt, 'readiness', r.ready ? 'Ready to harvest' : 'Not ready', r.ready ? null : r.failingChecks.join(', ').toLowerCase().replace(/_/g, ' '));
    if (b.harvestLot) {
      push(b.harvestLot.harvestStartedAt, 'harvest', 'Harvest started');
      push(b.harvestLot.readyForPickupAt, 'harvest', 'Ready for pickup', b.harvestLot.reportedHarvestedKg ? `${formatKg(b.harvestLot.reportedHarvestedKg.toString())} reported harvested` : null);
    }
    for (const s of b.shipments) {
      push(s.enRouteAt, 'transport', 'Driver on the way to the farm');
      push(s.arrivedPickupAt, 'transport', 'Driver arrived at the farm');
      push(s.collectedAt, 'transport', 'Cassava loaded', s.pickupRecord ? `${formatKg(s.pickupRecord.reportedQuantityKg.toString())} reported by driver` : null);
      push(s.pickupConfirmedAt, 'transport', 'Pickup confirmed', s.pickupRecord?.confirmationMethod?.replace(/_/g, ' ').toLowerCase() ?? null);
      push(s.departedAt, 'transport', 'In transit');
      push(s.arrivedFacilityAt, 'transport', 'Arrived at facility');
      push(s.deliveredAt, 'transport', 'Delivery confirmed by receiving staff');
      push(s.cancelledAt, 'transport', 'Transport cancelled', s.cancelReason);
    }
    if (b.receivingRecord) {
      push(b.receivingRecord.recordedAt, 'receiving', 'Weighed at facility', `Net ${formatKg(b.receivingRecord.netKg.toString())}`);
      push(b.receivingRecord.decisionSubmittedAt, 'receiving', 'Quality decision recorded');
      push(b.receivingRecord.farmerDecidedAt, 'receiving', `Farmer ${b.receivingRecord.farmerDecision === 'ACCEPTED' ? 'accepted' : 'disputed'} the receiving decision`);
      push(b.receivingRecord.escalatedAt, 'receiving', 'Receiving review overdue — escalated');
      push(b.receivingRecord.finalisedAt, 'receiving', 'Receiving decision final');
    }
    if (b.processingRecord) {
      push(b.processingRecord.startedAt, 'processing', 'Processing started');
      push(b.processingRecord.completedAt, 'processing', 'Processing completed');
    }
    for (const inv of b.invoices) {
      push(inv.issuedAt, 'invoice', `Invoice ${inv.number} issued`, inv.kind.replace(/_/g, ' ').toLowerCase());
      for (const p of inv.payments) push(p.createdAt, 'payment', `Payment ${p.status.replace(/_/g, ' ').toLowerCase()}`, inv.number);
    }
    for (const d of b.disputes) push(d.createdAt, 'dispute', `Dispute ${d.reference} opened`, d.category.replace(/_/g, ' ').toLowerCase());
    for (const i of b.incidents) {
      push(i.createdAt, 'incident', `Incident: ${i.kind.replace(/_/g, ' ').toLowerCase()}`, i.description);
      push(i.resolvedAt, 'incident', 'Incident resolved', i.recoveryAction);
    }
    push(b.completedAt, 'booking', 'Booking completed');
    push(b.cancelledAt, 'booking', 'Booking cancelled', b.cancelReason, b.cancelledByUserId ? users.get(b.cancelledByUserId) ?? null : null);
    push(b.expiredAt, 'booking', 'Booking expired — holds released');
    return ev.sort((x, y) => x.at.localeCompare(y.at));
  }

  // ───────────── Actions ─────────────

  /** Confirms exactly the version the client reviewed (id + content hash) for the parties the actor may represent. */
  async confirm(actor: Actor, id: string, input: z.infer<typeof confirmTermsSchema>): Promise<BookingDetail> {
    const access = await this.access.booking(actor, id);
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, id);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id } });
      this.engine.assertNotTerminal(booking.status);
      if (booking.status === 'DRAFT') throw new DomainError('INVALID_STATE_TRANSITION', 'Approve the prepared acceptance first');
      const version = await tx.bookingTermsVersion.findUnique({ where: { id: input.termsVersionId } });
      if (!version || version.bookingId !== id) throw new DomainError('NOT_FOUND', 'Terms version not found');
      if (version.contentHash !== input.contentHash) throw new DomainError('TERMS_CHANGED', 'These are not the terms you reviewed. Reload and review again.');
      const pending = await tx.bookingAmendment.findFirst({ where: { bookingId: id, status: 'PENDING' } });
      const isCurrent = version.versionNo === booking.currentTermsVersionNo;
      if (!(pending?.termsVersionId === version.id || isCurrent)) throw new DomainError('TERMS_CHANGED', 'This version is no longer open for confirmation');
      const missing = await this.engine.pendingParties(tx, version);
      let recorded = 0;
      if (missing.includes('FARMER') && access.farmer) {
        const authority = this.access.requireFarmerAction(access, 'terms.confirm');
        if (await this.engine.recordConfirmation(tx, id, version, { party: 'FARMER', method: 'EXPLICIT', actorUserId: actor.userId, farmer: authority })) recorded++;
      }
      if (missing.includes('PROCESSOR') && access.parties.includes('PROCESSOR')) {
        this.access.requireProcessorRole(access, [...COMMERCIAL_ROLES], 'confirm commercial terms');
        if (await this.engine.recordConfirmation(tx, id, version, { party: 'PROCESSOR', method: 'EXPLICIT', actorUserId: actor.userId, organisationId: booking.processorOrgId })) recorded++;
      }
      if (missing.includes('TRANSPORTER') && access.transporter?.roles.some((r) => r === 'OWNER' || r === 'DISPATCHER')) {
        const content = version.content as unknown as BookingTermsContent;
        const trip = content.transport ? await tx.tripReservation.findUnique({ where: { quoteId: content.transport.quoteId } }) : null;
        if (trip && !trip.driverId) throw new DomainError('INVALID_STATE_TRANSITION', 'Accept the assignment with a driver to confirm');
        if (await this.engine.recordConfirmation(tx, id, version, { party: 'TRANSPORTER', method: 'EXPLICIT', actorUserId: actor.userId, organisationId: access.transporter.organisationId })) recorded++;
      }
      if (recorded === 0) throw new DomainError('FORBIDDEN', missing.length ? 'Your confirmation is not needed for this version, or your role cannot give it' : 'Every party has already confirmed this version');
      await audit(tx, { actor, farmer: access.farmer, action: 'booking.terms-confirmed', entityType: 'booking', entityId: id, data: { versionNo: version.versionNo } });
      await this.engine.settle(tx, id, now, actor, 'terms.confirmed');
    });
    return this.detail(actor, id);
  }

  async decideAmendment(actor: Actor, id: string, input: z.infer<typeof decideAmendmentSchema>): Promise<BookingDetail> {
    if (input.decision === 'ACCEPT') return this.confirm(actor, id, { termsVersionId: input.termsVersionId, contentHash: input.contentHash });
    const access = await this.access.booking(actor, id);
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, id);
      const amendment = await tx.bookingAmendment.findFirst({ where: { bookingId: id, status: 'PENDING' }, include: { termsVersion: true, booking: true } });
      if (!amendment || amendment.termsVersionId !== input.termsVersionId) throw new DomainError('NOT_FOUND', 'No pending change matches');
      const isFarmer = canApprove(access);
      const isProcessor = access.parties.includes('PROCESSOR') && access.processorRoles.some((r) => (COMMERCIAL_ROLES as readonly string[]).includes(r));
      const isTransporter = access.transporter?.roles.some((r) => r === 'OWNER' || r === 'DISPATCHER');
      if (!isFarmer && !isProcessor && !isTransporter && !access.isAdmin) throw new DomainError('FORBIDDEN', 'You cannot decide on this change');
      await tx.bookingAmendment.update({ where: { id: amendment.id }, data: { status: 'REJECTED', decidedAt: now, decidedByUserId: actor.userId, rejectionReason: input.reason ?? 'Rejected', version: { increment: 1 } } });
      // Undo the transport hold proposed with this version; the previous terms stay in force.
      const quoteId = amendment.termsVersion.transportQuoteId;
      const currentContent = (await this.engine.currentTerms(tx, id)).content;
      if (quoteId && quoteId !== currentContent.transport?.quoteId) {
        await tx.tripReservation.updateMany({ where: { quoteId, status: 'HELD' }, data: { status: 'RELEASED', cancelReason: 'Transport change rejected', version: { increment: 1 } } });
        await tx.transportQuote.updateMany({ where: { id: quoteId, status: 'ACCEPTED' }, data: { status: 'DECLINED', decisionReason: input.reason ?? 'Change rejected', version: { increment: 1 } } });
      }
      await audit(tx, { actor, farmer: access.farmer, action: 'booking.change-rejected', entityType: 'booking', entityId: id, reason: input.reason ?? null, data: { versionNo: amendment.termsVersion.versionNo } });
      await notify(tx, {
        userIds: await bookingRecipients(tx, id, { farmer: true, processorRoles: ['OWNER', 'MANAGER'], transporter: true }, now),
        type: 'booking.change-rejected',
        category: 'bookings',
        title: `${amendment.booking.reference}: proposed change rejected`,
        body: `${input.reason ?? 'A party rejected the change.'} The previously agreed terms remain in force.`,
        link: `/bookings/${id}`,
        bookingId: id,
        dedupeKey: `change-rejected:${amendment.id}`,
      });
      await recomputeReadiness(tx, id, 'amendment.rejected', now);
    });
    return this.detail(actor, id);
  }

  async approveDraft(actor: Actor, id: string, expectedVersion: number): Promise<BookingDetail> {
    const access = await this.access.booking(actor, id);
    const authority = this.access.requireFarmerAction(access, 'offer.accept');
    const now = new Date();
    const outcome = await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, id);
      if (await expireBookingIfDue(tx, id, now)) return new DomainError('HOLD_EXPIRED', 'The capacity hold expired before approval, so the booking expired');
      const b = await tx.booking.findUniqueOrThrow({ where: { id } });
      if (b.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT', 'The booking changed. Reload and try again.');
      const to = transition(BOOKING_MACHINE, b.status, 'approve', 'booking');
      const { version } = await this.engine.currentTerms(tx, id);
      await this.engine.recordConfirmation(tx, id, version, { party: 'FARMER', method: 'EXPLICIT', actorUserId: actor.userId, farmer: authority });
      await tx.booking.update({ where: { id }, data: { status: to, version: { increment: 1 } } });
      await audit(tx, { actor, farmer: authority, action: 'booking.draft-approved', entityType: 'booking', entityId: id });
      await notify(tx, {
        userIds: await bookingRecipients(tx, id, { farmer: true, processorRoles: ['OWNER', 'MANAGER'] }, now),
        type: 'booking.created',
        category: 'bookings',
        title: `${b.reference}: terms agreed, transport next`,
        body: 'The farmer approved the prepared acceptance.',
        link: `/bookings/${id}`,
        bookingId: id,
        dedupeKey: `booking-approved:${id}`,
      });
      await this.engine.settle(tx, id, now, actor, 'draft.approved');
      return null;
    });
    if (outcome) throw outcome;
    return this.detail(actor, id);
  }

  /** Releases supply, capacity and transport holds exactly once. Not allowed after harvest has started. */
  async cancel(actor: Actor, id: string, input: z.infer<typeof cancelBookingSchema>, mode: 'CANCEL' | 'DISCARD'): Promise<BookingDetail> {
    const access = await this.access.booking(actor, id);
    let party: BookingParty;
    if (mode === 'DISCARD') {
      this.access.requireFarmerAction(access, 'offer.prepare');
      party = 'FARMER';
    } else if (canApprove(access)) {
      party = 'FARMER';
    } else if (access.parties.includes('PROCESSOR')) {
      this.access.requireProcessorRole(access, [...COMMERCIAL_ROLES], 'cancel bookings');
      party = 'PROCESSOR';
    } else if (access.isAdmin) {
      party = 'ADMIN';
    } else {
      throw new DomainError('FORBIDDEN', 'You cannot cancel this booking');
    }
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, id);
      const b = await tx.booking.findUniqueOrThrow({ where: { id }, include: { reservation: true, harvestLot: true } });
      if (b.version !== input.expectedVersion) throw new DomainError('VERSION_CONFLICT', 'The booking changed. Reload and try again.');
      if (b.status === 'ACTIVE') throw new DomainError('INVALID_STATE_TRANSITION', 'Harvest has started, so the booking cannot be cancelled. Open an incident to arrange recovery.');
      const to = transition(BOOKING_MACHINE, b.status, mode === 'DISCARD' ? 'discard' : 'cancel', 'booking');
      await tx.booking.update({
        where: { id },
        data: { status: to, cancelledAt: now, cancelledByUserId: actor.userId, cancelledByParty: party, cancelReason: input.reason, version: { increment: 1 } },
      });
      if (b.reservation && ['HELD', 'CONFIRMED'].includes(b.reservation.status)) {
        await tx.reservation.update({ where: { id: b.reservation.id }, data: { status: 'RELEASED', releasedAt: now, releaseReason: `Booking cancelled: ${input.reason}`, version: { increment: 1 } } });
      }
      if (b.harvestLot && b.harvestLot.status === 'ALLOCATED') {
        await tx.harvestLot.update({ where: { id: b.harvestLot.id }, data: { status: 'RELEASED', releasedAt: now, releaseReason: 'Booking cancelled before harvest', version: { increment: 1 } } });
      }
      await tx.tripReservation.updateMany({ where: { bookingId: id, status: { in: ['HELD', 'CONFIRMED'] } }, data: { status: 'RELEASED', cancelReason: 'Booking cancelled', version: { increment: 1 } } });
      await tx.shipment.updateMany({ where: { bookingId: id, status: { in: ['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP'] } }, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'Booking cancelled', version: { increment: 1 } } });
      await tx.bookingAmendment.updateMany({ where: { bookingId: id, status: 'PENDING' }, data: { status: 'WITHDRAWN', decidedAt: now, rejectionReason: 'Booking cancelled', version: { increment: 1 } } });
      await tx.transportQuote.updateMany({ where: { bookingId: id, status: 'SUBMITTED' }, data: { status: 'EXPIRED', version: { increment: 1 } } });
      await audit(tx, { actor, actorParty: party, farmer: access.farmer, action: mode === 'DISCARD' ? 'booking.draft-discarded' : 'booking.cancelled', entityType: 'booking', entityId: id, reason: input.reason });
      await notify(tx, {
        userIds: await bookingRecipients(tx, id, { farmer: true, processorRoles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'], transporter: true }, now),
        type: 'booking.cancelled',
        category: 'bookings',
        title: `${b.reference} was cancelled`,
        body: `Cancelled by the ${party.toLowerCase()}: ${input.reason}. Do not harvest for this booking. Held quantity and capacity were released.`,
        link: `/bookings/${id}`,
        bookingId: id,
        dedupeKey: `booking-cancelled:${id}`,
      });
      await recomputeReadiness(tx, id, 'booking.cancelled', now);
    });
    return this.detail(actor, id);
  }

  async proposeAmendment(actor: Actor, id: string, input: z.infer<typeof proposeAmendmentSchema>): Promise<BookingDetail> {
    const access = await this.access.booking(actor, id);
    let party: BookingParty;
    if (canApprove(access)) party = 'FARMER';
    else if (access.parties.includes('PROCESSOR')) {
      this.access.requireProcessorRole(access, [...COMMERCIAL_ROLES], 'propose changes to terms');
      party = 'PROCESSOR';
    } else throw new DomainError('FORBIDDEN', 'You cannot propose changes to this booking');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, id);
      const b = await tx.booking.findUniqueOrThrow({ where: { id }, include: { slot: true, harvestRequest: { include: { farmLocation: true } }, facility: true } });
      if (!['AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE'].includes(b.status)) throw new DomainError('INVALID_STATE_TRANSITION', `Terms cannot be changed while the booking is ${b.status.toLowerCase()}`);
      const { content } = await this.engine.currentTerms(tx, id);
      const next: BookingTermsContent = structuredClone(content);
      if (input.quantityKg) next.quantityKg = gramsToKgString(toGrams(input.quantityKg));
      if (input.priceKoboPerKg) next.priceKoboPerKg = input.priceKoboPerKg;
      if (input.plannedHarvestDate) next.harvest.plannedHarvestDate = input.plannedHarvestDate;
      if (input.pickupWindowStart) next.pickupWindow.start = new Date(input.pickupWindowStart).toISOString();
      if (input.pickupWindowEnd) next.pickupWindow.end = new Date(input.pickupWindowEnd).toISOString();
      if (input.deliveryWindowStart) next.deliveryWindow.start = new Date(input.deliveryWindowStart).toISOString();
      if (input.deliveryWindowEnd) next.deliveryWindow.end = new Date(input.deliveryWindowEnd).toISOString();
      if (input.toleranceBps !== undefined) next.toleranceBps = input.toleranceBps;
      if (input.paymentTermsDays !== undefined) {
        next.paymentTermsDays = input.paymentTermsDays;
        next.invoiceDueRule = content.invoiceDueRule.replace(/due \d+ day\(s\)/, `due ${input.paymentTermsDays} day(s)`);
      }
      if (input.handoverArrangement || input.handoverWindowStart || input.handoverWindowEnd || input.farmerDeliveryCostKobo !== undefined) {
        // Changing how or when the cassava changes hands is a material change: both sides agree again.
        const arrangement = input.handoverArrangement ?? content.handover?.arrangement;
        if (!arrangement) throw new DomainError('VALIDATION_FAILED', 'Choose whether the buyer collects or the farmer delivers', [{ path: 'handoverArrangement', message: 'Choose one' }]);
        const window = {
          start: new Date(input.handoverWindowStart ?? content.handover?.window.start ?? content.pickupWindow.start).toISOString(),
          end: new Date(input.handoverWindowEnd ?? content.handover?.window.end ?? content.pickupWindow.end).toISOString(),
        };
        const cost = arrangement === 'FARMER_DELIVERS' ? (input.farmerDeliveryCostKobo ?? content.handover?.farmerDeliveryCostKobo ?? null) : null;
        next.handover = handoverFor(arrangement, { farm: b.harvestRequest.farmLocation, facility: b.facility }, window, cost);
        next.pickupWindow = { ...window };
        next.deliveryWindow = { ...window };
        next.freightPayer = arrangement === 'FARMER_DELIVERS' ? 'FARMER' : 'PROCESSOR';
      }
      const ds = new Date(next.deliveryWindow.start);
      const de = new Date(next.deliveryWindow.end);
      if (ds < b.slot.startsAt || de > b.slot.endsAt || de <= ds) throw new DomainError('VALIDATION_FAILED', 'The delivery window must stay inside the processing slot');
      if (new Date(next.pickupWindow.end) <= new Date(next.pickupWindow.start)) throw new DomainError('VALIDATION_FAILED', 'Pickup window must end after it starts');
      if (next.transport && toGrams(next.quantityKg) > toGrams(next.transport.vehicleCapacityKg)) {
        throw new DomainError('VEHICLE_CAPACITY_EXCEEDED', 'The assigned vehicle cannot carry that quantity; arrange different transport first');
      }
      const reason = input.quantityKg && toGrams(input.quantityKg) > toGrams(content.quantityKg) && b.status === 'ACTIVE' ? 'OVER_DELIVERY' : 'AMENDMENT';
      const result = await this.engine.proposeVersion(tx, id, next, {
        reason,
        proposedByUserId: actor.userId,
        proposedByParty: party,
        amendmentReason: input.reason,
        baseVersionNo: input.baseVersionNo,
        explicit: [
          party === 'FARMER'
            ? { party: 'FARMER', method: 'EXPLICIT', actorUserId: actor.userId, farmer: access.farmer }
            : { party: 'PROCESSOR', method: 'EXPLICIT', actorUserId: actor.userId, organisationId: b.processorOrgId },
        ],
      });
      await audit(tx, { actor, farmer: access.farmer, action: 'booking.change-proposed', entityType: 'booking', entityId: id, reason: input.reason, data: { versionNo: result.version.versionNo } });
      await notify(tx, {
        userIds: await bookingRecipients(tx, id, { farmer: 'APPROVE_SALE', processorRoles: ['OWNER', 'MANAGER'], transporter: result.pendingParties.includes('TRANSPORTER') }, now),
        type: 'booking.change-proposed',
        category: 'bookings',
        title: `${b.reference}: change proposed — your confirmation may be needed`,
        body: `${input.reason}. Awaiting: ${result.pendingParties.join(', ').toLowerCase() || 'nobody'}. Do not act on the change until it is agreed.`,
        link: `/bookings/${id}`,
        bookingId: id,
        dedupeKey: `change-proposed:${result.amendmentId}`,
      });
      await this.engine.settle(tx, id, now, actor, 'amendment.proposed');
    });
    return this.detail(actor, id);
  }

  async startHarvest(actor: Actor, id: string, expectedVersion: number): Promise<BookingDetail> {
    const access = await this.access.booking(actor, id);
    const authority = this.access.requireFarmerAction(access, 'harvest.progress');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, id);
      const b = await tx.booking.findUniqueOrThrow({ where: { id }, include: { harvestLot: true } });
      if (b.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT', 'The booking changed. Reload and check readiness again.');
      const to = transition(BOOKING_MACHINE, b.status, 'startHarvest', 'booking');
      const readiness = (await computeReadiness(tx, id, now))!;
      if (!readiness.ready) {
        const failing = readiness.checks.filter((c) => !c.passed);
        throw new DomainError('NOT_READY', `Not ready to harvest: ${failing.map((c) => c.explanation).join(' ')}`, { failing: failing.map((c) => c.code) });
      }
      await tx.booking.update({ where: { id }, data: { status: to, activatedAt: now, version: { increment: 1 } } });
      await tx.harvestLot.update({ where: { id: b.harvestLot!.id }, data: { status: 'HARVEST_STARTED', harvestStartedAt: now, version: { increment: 1 } } });
      await audit(tx, { actor, farmer: authority, action: 'booking.harvest-started', entityType: 'booking', entityId: id });
      await notify(tx, {
        userIds: await bookingRecipients(tx, id, { processorRoles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'], transporter: true }, now),
        type: 'harvest.started',
        category: 'transport',
        title: `${b.reference}: harvest started`,
        body: 'The farmer has started harvesting. Collection should follow within the agreed pickup window.',
        link: `/bookings/${id}`,
        bookingId: id,
        dedupeKey: `harvest-started:${id}`,
      });
    });
    return this.detail(actor, id);
  }

  async readyForPickup(actor: Actor, id: string, input: z.infer<typeof readyForPickupSchema>): Promise<BookingDetail> {
    const access = await this.access.booking(actor, id);
    const authority = this.access.requireFarmerAction(access, 'harvest.progress');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, id);
      const b = await tx.booking.findUniqueOrThrow({ where: { id }, include: { harvestLot: true } });
      if (b.status !== 'ACTIVE' || b.harvestLot?.status !== 'HARVEST_STARTED') throw new DomainError('INVALID_STATE_TRANSITION', 'Start the harvest first');
      await tx.harvestLot.update({ where: { id: b.harvestLot.id }, data: { status: 'READY_FOR_PICKUP', readyForPickupAt: now, reportedHarvestedKg: input.reportedHarvestedKg, version: { increment: 1 } } });
      await audit(tx, { actor, farmer: authority, action: 'booking.ready-for-pickup', entityType: 'booking', entityId: id, data: { reportedHarvestedKg: input.reportedHarvestedKg } });
      await notify(tx, {
        userIds: await bookingRecipients(tx, id, { transporter: true, processorRoles: ['OWNER', 'MANAGER'] }, now),
        type: 'harvest.ready',
        category: 'transport',
        title: `${b.reference}: ready for pickup`,
        body: `About ${formatKg(input.reportedHarvestedKg)} harvested (farmer’s estimate).`,
        link: `/bookings/${id}`,
        bookingId: id,
        dedupeKey: `ready-for-pickup:${id}`,
      });
    });
    return this.detail(actor, id);
  }

  async openIncident(actor: Actor, id: string, input: z.infer<typeof openIncidentSchema>): Promise<BookingDetail> {
    const access = await this.access.booking(actor, id);
    const party: BookingParty = access.parties.find((p) => p !== 'ADMIN') ?? 'ADMIN';
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const b = await tx.booking.findUniqueOrThrow({ where: { id } });
      this.engine.assertNotTerminal(b.status);
      const inc = await tx.bookingIncident.create({ data: { bookingId: id, kind: input.kind, blocking: input.blocking, description: input.description, openedByUserId: actor.userId, openedByParty: party } });
      if (b.status === 'ACTIVE') {
        await tx.harvestLot.updateMany({ where: { bookingId: id, status: { in: ['HARVEST_STARTED', 'READY_FOR_PICKUP'] } }, data: { status: 'INCIDENT' } });
      }
      await audit(tx, { actor, actorParty: party, farmer: access.farmer, action: 'incident.opened', entityType: 'booking', entityId: id, data: { incidentId: inc.id, kind: input.kind } });
      await notify(tx, {
        userIds: await bookingRecipients(tx, id, { farmer: true, processorRoles: ['OWNER', 'MANAGER'], transporter: true, admins: true }, now),
        type: 'incident.opened',
        category: 'bookings',
        title: `${b.reference}: incident reported`,
        body: input.description.slice(0, 300),
        link: `/bookings/${id}`,
        bookingId: id,
        dedupeKey: `incident:${inc.id}`,
      });
      await recomputeReadiness(tx, id, 'incident.opened', now);
    });
    return this.detail(actor, id);
  }

  async resolveIncident(actor: Actor, id: string, incidentId: string, recoveryAction: string): Promise<BookingDetail> {
    const access = await this.access.booking(actor, id);
    if (!access.isAdmin && !(access.parties.includes('PROCESSOR') && access.processorRoles.some((r) => (COMMERCIAL_ROLES as readonly string[]).includes(r)))) {
      throw new DomainError('FORBIDDEN', 'Only the processor’s managers or HarvestSlot can resolve incidents');
    }
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const r = await tx.bookingIncident.updateMany({ where: { id: incidentId, bookingId: id, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedAt: now, resolvedByUserId: actor.userId, recoveryAction, version: { increment: 1 } } });
      if (r.count !== 1) throw new DomainError('NOT_FOUND', 'Open incident not found');
      const stillOpen = await tx.bookingIncident.count({ where: { bookingId: id, status: 'OPEN' } });
      if (!stillOpen) {
        const lot = await tx.harvestLot.findUnique({ where: { bookingId: id } });
        if (lot?.status === 'INCIDENT') {
          await tx.harvestLot.update({ where: { id: lot.id }, data: { status: lot.readyForPickupAt ? 'READY_FOR_PICKUP' : 'HARVEST_STARTED' } });
        }
      }
      await audit(tx, { actor, action: 'incident.resolved', entityType: 'booking', entityId: id, reason: recoveryAction, data: { incidentId } });
      await recomputeReadiness(tx, id, 'incident.resolved', now);
    });
    return this.detail(actor, id);
  }

  async messages(actor: Actor, id: string) {
    await this.access.booking(actor, id);
    const rows = await this.prisma.db.bookingMessage.findMany({ where: { bookingId: id }, orderBy: { createdAt: 'asc' }, take: 500 });
    const users = await this.prisma.db.user.findMany({ where: { id: { in: rows.map((r) => r.authorUserId) } }, select: { id: true, displayName: true } });
    return rows.map((m) => ({
      id: m.id,
      authorName: users.find((u) => u.id === m.authorUserId)?.displayName ?? 'Unknown',
      authorParty: m.authorParty,
      actingForFarmer: Boolean(m.actingForFarmerId),
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      mine: m.authorUserId === actor.userId,
    }));
  }

  async postMessage(actor: Actor, id: string, input: z.infer<typeof postMessageSchema>) {
    const access = await this.access.booking(actor, id);
    let party: BookingParty = access.parties.find((p) => p !== 'ADMIN') ?? 'ADMIN';
    if (party === 'FARMER' && access.farmer?.mode === 'DELEGATE') this.access.requireFarmerAction(access, 'message.send');
    if (access.parties.includes('FARMER') && input.actingForFarmerId) party = 'FARMER';
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const b = await tx.booking.findUniqueOrThrow({ where: { id } });
      await tx.bookingMessage.create({
        data: { bookingId: id, authorUserId: actor.userId, authorParty: party, actingForFarmerId: access.farmer?.mode === 'DELEGATE' ? access.farmer.farmerProfileId : null, body: input.body },
      });
      const recipients = (await bookingRecipients(tx, id, { farmer: true, processorRoles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'], transporter: true }, now)).filter((u) => u !== actor.userId);
      await notify(tx, {
        userIds: recipients,
        type: 'booking.message',
        category: 'bookings',
        title: `New message on ${b.reference}`,
        body: `${actor.displayName}: ${input.body.slice(0, 140)}`,
        link: `/bookings/${id}#messages`,
        bookingId: id,
      });
    });
    return this.messages(actor, id);
  }

  labels = { BOOKING_STATUS_LABELS, LOT_STATUS_LABELS };
}
