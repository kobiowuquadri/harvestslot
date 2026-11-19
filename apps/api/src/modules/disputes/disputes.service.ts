import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  disputeMessageInputSchema,
  formatKg,
  formatNaira,
  gramsToKgString,
  kgToGrams,
  openDisputeSchema,
  produceAmountKobo,
  resolveDisputeSchema,
  toGrams,
  type BookingParty,
  type BookingTermsContent,
  type DisputeDto,
} from '@harvestslot/contracts';
import {
  adminUserIds,
  audit,
  BOOKING_MACHINE,
  bookingRecipients,
  DISPUTE_MACHINE,
  DomainError,
  issueReceivingInvoices,
  nextReference,
  notify,
  RECEIVING_MACHINE,
  refreshInvoice,
  transition,
  withTransaction,
  type Actor,
  type DisputeAction,
} from '@harvestslot/core';
import type { Prisma, Tx } from '@harvestslot/db';
import { AccessService, type BookingAccess } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso, kg, kobo } from '../../common/serialize.js';
import { BookingEngine } from '../bookings/booking-engine.service.js';

const include = {
  booking: { select: { reference: true, isDemo: true } },
  invoice: { select: { number: true, payerType: true, payeeType: true, kind: true } },
  messages: { orderBy: { createdAt: 'asc' as const } },
  events: { orderBy: { createdAt: 'asc' as const } },
  resolution: true,
} as const;
type DisputeRow = Prisma.DisputeGetPayload<{ include: typeof include }>;

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly engine: BookingEngine,
  ) {}

  private viewerParty(access: BookingAccess): BookingParty {
    return (access.parties.find((p) => p !== 'ADMIN') ?? 'ADMIN') as BookingParty;
  }
  /** The cassava reached the buyer: a handover booking once receiving is recorded, older bookings once the shipment was delivered. */
  private async handedOver(tx: Tx, b: { id: string; currentTermsVersionNo: number; shipments: Array<{ status: string }> }): Promise<boolean> {
    const v = await tx.bookingTermsVersion.findUniqueOrThrow({ where: { bookingId_versionNo: { bookingId: b.id, versionNo: b.currentTermsVersionNo } } });
    return Boolean((v.content as unknown as BookingTermsContent).handover) || b.shipments.some((s) => s.status === 'DELIVERED');
  }


  private async dto(d: DisputeRow, actor: Actor, access: BookingAccess): Promise<DisputeDto> {
    const ids = [d.openedByUserId, ...d.messages.map((m) => m.authorUserId), ...d.events.map((e) => e.actorUserId), d.resolution?.decidedByUserId].filter((x): x is string => !!x);
    const users = await this.prisma.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
    const name = (id: string | null | undefined) => users.find((u) => u.id === id)?.displayName ?? (id ? 'Unknown' : null);
    const evidence = await this.prisma.db.attachment.findMany({ where: { disputeId: d.id }, orderBy: { createdAt: 'asc' } });
    const party = this.viewerParty(access);
    const open = !['RESOLVED', 'WITHDRAWN'].includes(d.status);
    const actions: string[] = [];
    if (open) {
      actions.push('message');
      if (party === d.openedByParty) actions.push('withdraw');
      if (access.isAdmin) actions.push('resolve');
      const proposal = [...d.messages].reverse().find((m) => m.proposedAdjustmentKobo !== null && !m.settlementAcceptedAt);
      if (proposal && proposal.authorParty !== party && party !== 'ADMIN') actions.push('acceptSettlement');
    }
    return {
      id: d.id,
      reference: d.reference,
      bookingId: d.bookingId,
      bookingReference: d.booking.reference,
      invoiceId: d.invoiceId,
      invoiceNumber: d.invoice?.number ?? null,
      category: d.category,
      status: d.status,
      openedByParty: d.openedByParty,
      openedBy: name(d.openedByUserId) ?? 'Unknown',
      respondentParty: d.respondentParty,
      actingForFarmer: Boolean(d.delegationId),
      amountInQuestionKobo: kobo(d.amountInQuestionKobo),
      quantityInQuestionKg: kg(d.quantityInQuestionKg),
      description: d.description,
      responseDeadline: d.responseDeadline.toISOString(),
      overdue: open && d.responseDeadline < new Date(),
      messages: d.messages.map((m) => ({
        id: m.id,
        author: name(m.authorUserId) ?? 'Unknown',
        authorParty: m.authorParty,
        body: m.body,
        proposedAdjustmentKobo: kobo(m.proposedAdjustmentKobo),
        settlementAcceptedAt: iso(m.settlementAcceptedAt),
        createdAt: m.createdAt.toISOString(),
        mine: m.authorUserId === actor.userId,
      })),
      events: d.events.map((e) => ({ fromStatus: e.fromStatus, toStatus: e.toStatus, actor: name(e.actorUserId), note: e.note, createdAt: e.createdAt.toISOString() })),
      evidence: evidence.map((a) => ({ id: a.id, filename: a.originalFilename, uploadedAt: a.createdAt.toISOString() })),
      resolution: d.resolution
        ? {
            kind: d.resolution.kind,
            outcome: d.resolution.outcome,
            rationale: d.resolution.rationale,
            adjustmentKobo: kobo(d.resolution.adjustmentKobo),
            revisedAcceptedKg: kg(d.resolution.revisedAcceptedKg),
            decidedBy: name(d.resolution.decidedByUserId) ?? 'Unknown',
            createdAt: d.resolution.createdAt.toISOString(),
            note: 'A resolution records what was decided. Any money owed must still be paid and confirmed through the invoice; no transfer or refund is implied.',
          }
        : null,
      viewerParty: party,
      allowedActions: actions,
      createdAt: d.createdAt.toISOString(),
      version: d.version,
    };
  }

  async get(actor: Actor, id: string): Promise<DisputeDto> {
    const d = await this.prisma.db.dispute.findUnique({ where: { id }, include });
    if (!d) throw new DomainError('NOT_FOUND', 'Dispute not found');
    const access = await this.access.booking(actor, d.bookingId);
    return this.dto(d, actor, access);
  }

  async list(actor: Actor, bookingId?: string): Promise<DisputeDto[]> {
    let where: Prisma.DisputeWhereInput;
    if (bookingId) {
      await this.access.booking(actor, bookingId);
      where = { bookingId };
    } else if (actor.platformRole === 'ADMIN') {
      where = {};
    } else {
      // Disputes on bookings the actor participates in.
      const memberships = await this.access.memberships(actor);
      const own = await this.prisma.db.farmerProfile.findUnique({ where: { userId: actor.userId }, select: { id: true } });
      const orgIds = memberships.map((m) => m.organisationId);
      where = {
        booking: {
          OR: [
            ...(own ? [{ farmerProfileId: own.id }] : []),
            { processorOrgId: { in: orgIds } },
            { trips: { some: { transporterOrgId: { in: orgIds } } } },
          ],
        },
      };
    }
    const rows = await this.prisma.db.dispute.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 200 });
    const out: DisputeDto[] = [];
    for (const d of rows) {
      try {
        out.push(await this.dto(d, actor, await this.access.booking(actor, d.bookingId)));
      } catch {
        // Not a participant (e.g. delegation revoked): skip.
      }
    }
    return out;
  }

  async open(actor: Actor, input: z.infer<typeof openDisputeSchema>): Promise<DisputeDto> {
    const access = await this.access.booking(actor, input.bookingId);
    let party: BookingParty;
    if (access.farmer) {
      this.access.requireFarmerAction(access, 'dispute.open');
      party = 'FARMER';
    } else if (access.parties.includes('PROCESSOR')) party = 'PROCESSOR';
    else if (access.transporter) party = 'TRANSPORTER';
    else throw new DomainError('FORBIDDEN', 'Only booking participants can open disputes');
    const now = new Date();
    const policies = await this.prisma.policies();
    const id = await withTransaction(this.prisma.db, async (tx) => {
      const b = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
      if (!['ACTIVE', 'COMPLETED', 'CANCELLED', 'CONFIRMED'].includes(b.status)) throw new DomainError('INVALID_STATE_TRANSITION', 'Disputes are opened on confirmed, active or finished bookings');
      let respondent: BookingParty = party === 'FARMER' ? 'PROCESSOR' : party === 'PROCESSOR' ? 'FARMER' : 'PROCESSOR';
      if (input.invoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
        if (!inv || inv.bookingId !== b.id) throw new DomainError('VALIDATION_FAILED', 'The invoice does not belong to this booking');
        if (inv.payeeType === 'PLATFORM') respondent = 'ADMIN';
        else if (inv.kind === 'FREIGHT') respondent = party === 'TRANSPORTER' ? (inv.payerType === 'FARMER' ? 'FARMER' : 'PROCESSOR') : 'TRANSPORTER';
      } else if (['PICKUP', 'DELIVERY'].includes(input.category) && party !== 'TRANSPORTER') {
        respondent = 'TRANSPORTER';
      }
      if (input.evidenceAttachmentIds.length) {
        const n = await tx.attachment.count({ where: { id: { in: input.evidenceAttachmentIds }, bookingId: b.id, purpose: 'DISPUTE_EVIDENCE', disputeId: null } });
        if (n !== input.evidenceAttachmentIds.length) throw new DomainError('VALIDATION_FAILED', 'Evidence must be dispute evidence uploaded for this booking');
      }
      const d = await tx.dispute.create({
        data: {
          reference: await nextReference(tx, 'dispute'),
          bookingId: b.id,
          invoiceId: input.invoiceId ?? null,
          category: input.category,
          status: transition(DISPUTE_MACHINE, 'OPEN', 'awaitResponse'),
          openedByUserId: actor.userId,
          openedByParty: party,
          respondentParty: respondent,
          actingForFarmerId: access.farmer?.mode === 'DELEGATE' ? access.farmer.farmerProfileId : null,
          delegationId: access.farmer?.mode === 'DELEGATE' ? access.farmer.delegationId : null,
          amountInQuestionKobo: input.amountInQuestionKobo === undefined ? null : BigInt(input.amountInQuestionKobo),
          quantityInQuestionKg: input.quantityInQuestionKg ?? null,
          description: input.description,
          responseDeadline: new Date(now.getTime() + policies.disputeResponseHours * 3_600_000),
          isDemo: b.isDemo,
        },
      });
      if (input.evidenceAttachmentIds.length) await tx.attachment.updateMany({ where: { id: { in: input.evidenceAttachmentIds } }, data: { disputeId: d.id } });
      await tx.disputeEvent.createMany({
        data: [
          { disputeId: d.id, fromStatus: null, toStatus: 'OPEN', actorUserId: actor.userId, note: null },
          { disputeId: d.id, fromStatus: 'OPEN', toStatus: 'AWAITING_RESPONSE', actorUserId: actor.userId, note: `Awaiting a response from the ${respondent.toLowerCase()}` },
        ],
      });
      await audit(tx, { actor, actorParty: party, farmer: access.farmer, action: 'dispute.opened', entityType: 'dispute', entityId: d.id, data: { bookingId: b.id, category: input.category } });
      await notify(tx, {
        userIds: await bookingRecipients(tx, b.id, { farmer: respondent === 'FARMER' ? 'APPROVE_SALE' : undefined, processorRoles: respondent === 'PROCESSOR' ? ['OWNER', 'MANAGER', 'FINANCE_OFFICER'] : [], transporter: respondent === 'TRANSPORTER', admins: true }, now),
        type: 'dispute.opened',
        category: 'disputes',
        title: `Dispute ${d.reference} opened on ${b.reference}`,
        body: input.description.slice(0, 200),
        link: `/disputes/${d.id}`,
        bookingId: b.id,
        dedupeKey: `dispute-opened:${d.id}`,
      });
      return d.id;
    });
    return this.get(actor, id);
  }

  private async move(tx: Tx, d: { id: string; status: DisputeRow['status'] }, action: DisputeAction, actorUserId: string | null, note: string | null) {
    const to = transition(DISPUTE_MACHINE, d.status, action, 'dispute');
    if (to === d.status) return to;
    await tx.dispute.update({ where: { id: d.id }, data: { status: to, version: { increment: 1 }, ...(to === 'RESOLVED' ? { resolvedAt: new Date() } : {}) } });
    await tx.disputeEvent.create({ data: { disputeId: d.id, fromStatus: d.status, toStatus: to, actorUserId, note } });
    return to;
  }

  async message(actor: Actor, id: string, input: z.infer<typeof disputeMessageInputSchema>): Promise<DisputeDto> {
    const d0 = await this.prisma.db.dispute.findUnique({ where: { id } });
    if (!d0) throw new DomainError('NOT_FOUND', 'Dispute not found');
    const access = await this.access.booking(actor, d0.bookingId);
    const party = this.viewerParty(access);
    if (party === 'FARMER' && access.farmer?.mode === 'DELEGATE') this.access.requireFarmerAction(access, 'dispute.open');
    if (party === 'ADMIN' && input.proposedAdjustmentKobo !== undefined) throw new DomainError('BAD_REQUEST', 'Administrators resolve disputes; they do not propose settlements');
    if (input.proposedAdjustmentKobo !== undefined && !d0.invoiceId) throw new DomainError('BAD_REQUEST', 'Link an invoice to propose a money settlement');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM disputes WHERE id = $1::uuid FOR UPDATE', id);
      const d = await tx.dispute.findUniqueOrThrow({ where: { id } });
      if (['RESOLVED', 'WITHDRAWN'].includes(d.status)) throw new DomainError('INVALID_STATE_TRANSITION', 'This dispute is closed');
      if (input.evidenceAttachmentIds.length) {
        const n = await tx.attachment.count({ where: { id: { in: input.evidenceAttachmentIds }, bookingId: d.bookingId, purpose: 'DISPUTE_EVIDENCE' } });
        if (n !== input.evidenceAttachmentIds.length) throw new DomainError('VALIDATION_FAILED', 'Evidence must be uploaded for this booking');
        await tx.attachment.updateMany({ where: { id: { in: input.evidenceAttachmentIds } }, data: { disputeId: id } });
      }
      await tx.disputeMessage.create({
        data: {
          disputeId: id,
          authorUserId: actor.userId,
          authorParty: party,
          actingForFarmerId: access.farmer?.mode === 'DELEGATE' ? access.farmer.farmerProfileId : null,
          body: input.body,
          proposedAdjustmentKobo: input.proposedAdjustmentKobo === undefined ? null : BigInt(input.proposedAdjustmentKobo),
        },
      });
      if (party === d.respondentParty && d.status === 'AWAITING_RESPONSE') await this.move(tx, d, 'respond', actor.userId, 'Respondent replied');
      await audit(tx, { actor, actorParty: party, action: 'dispute.message', entityType: 'dispute', entityId: id, data: { proposal: input.proposedAdjustmentKobo ?? null } });
      await notify(tx, {
        userIds: (await bookingRecipients(tx, d.bookingId, { farmer: 'APPROVE_SALE', processorRoles: ['OWNER', 'MANAGER', 'FINANCE_OFFICER'], transporter: true, admins: true }, now)).filter((u) => u !== actor.userId),
        type: 'dispute.message',
        category: 'disputes',
        title: `New message on dispute ${d.reference}`,
        body: input.proposedAdjustmentKobo !== undefined ? `Settlement proposed: invoice adjustment of ${formatNaira(input.proposedAdjustmentKobo)}.` : input.body.slice(0, 160),
        link: `/disputes/${id}`,
        bookingId: d.bookingId,
      });
    });
    return this.get(actor, id);
  }

  /** The counterparty accepts a settlement proposal: a mutual resolution with an audited invoice adjustment. */
  async acceptSettlement(actor: Actor, id: string, messageId: string): Promise<DisputeDto> {
    const d0 = await this.prisma.db.dispute.findUnique({ where: { id } });
    if (!d0) throw new DomainError('NOT_FOUND', 'Dispute not found');
    const access = await this.access.booking(actor, d0.bookingId);
    const party = this.viewerParty(access);
    if (party === 'FARMER') this.access.requireFarmerAction(access, 'dispute.open');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, d0.bookingId);
      if (d0.invoiceId) await tx.$queryRawUnsafe('SELECT id FROM invoices WHERE id = $1::uuid FOR UPDATE', d0.invoiceId);
      await tx.$queryRawUnsafe('SELECT id FROM disputes WHERE id = $1::uuid FOR UPDATE', id);
      const d = await tx.dispute.findUniqueOrThrow({ where: { id } });
      const m = await tx.disputeMessage.findUnique({ where: { id: messageId } });
      if (!m || m.disputeId !== id || m.proposedAdjustmentKobo === null || m.settlementAcceptedAt) throw new DomainError('NOT_FOUND', 'Settlement proposal not found');
      if (m.authorParty === party) throw new DomainError('FORBIDDEN', 'The other party must accept your proposal');
      await tx.disputeMessage.update({ where: { id: messageId }, data: { settlementAcceptedAt: now, settlementAcceptedById: actor.userId } });
      await this.applyResolution(tx, d, {
        kind: 'MUTUAL_SETTLEMENT',
        outcome: `Settled by agreement: invoice adjusted by ${formatNaira(m.proposedAdjustmentKobo)}`,
        rationale: 'Both parties agreed to the settlement proposal in the dispute thread.',
        adjustmentKobo: m.proposedAdjustmentKobo,
        revisedAcceptedKg: null,
        decidedByUserId: actor.userId,
        agreedByUserIds: [m.authorUserId, actor.userId],
      }, actor, now);
    });
    return this.get(actor, id);
  }

  /** Administrator decision with rationale. Adjustments are recorded; transfers are not invented. */
  async resolve(actor: Actor, id: string, input: z.infer<typeof resolveDisputeSchema>): Promise<DisputeDto> {
    if (actor.platformRole !== 'ADMIN') throw new DomainError('NOT_FOUND', 'Not found');
    const d0 = await this.prisma.db.dispute.findUnique({ where: { id } });
    if (!d0) throw new DomainError('NOT_FOUND', 'Dispute not found');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, d0.bookingId);
      if (d0.invoiceId) await tx.$queryRawUnsafe('SELECT id FROM invoices WHERE id = $1::uuid FOR UPDATE', d0.invoiceId);
      const d = await tx.dispute.findUniqueOrThrow({ where: { id } });
      let adjustment = input.adjustmentKobo === undefined ? null : BigInt(input.adjustmentKobo);
      if (input.revisedAcceptedKg !== undefined) {
        // A revised accepted quantity becomes an adjustment on the produce invoice at the agreed price.
        const rec = await tx.receivingRecord.findUnique({ where: { bookingId: d.bookingId }, include: { qualityAssessment: true } });
        if (!rec?.qualityAssessment) throw new DomainError('BAD_REQUEST', 'There is no receiving decision to revise');
        if (kgToGrams(input.revisedAcceptedKg) > toGrams(rec.netKg)) throw new DomainError('QUANTITY_MISMATCH', 'Revised accepted quantity cannot exceed the delivered net weight');
        const { content } = await this.engine.currentTerms(tx, d.bookingId);
        const price = BigInt(content.priceKoboPerKg);
        const delta = produceAmountKobo(kgToGrams(input.revisedAcceptedKg), price) - produceAmountKobo(toGrams(rec.qualityAssessment.acceptedKg), price);
        adjustment = (adjustment ?? 0n) + delta;
      }
      await this.applyResolution(tx, d, {
        kind: 'ADMIN_DECISION',
        outcome: input.outcome,
        rationale: input.rationale,
        adjustmentKobo: adjustment,
        revisedAcceptedKg: input.revisedAcceptedKg ? gramsToKgString(kgToGrams(input.revisedAcceptedKg)) : null,
        decidedByUserId: actor.userId,
        agreedByUserIds: [],
      }, actor, now);
    });
    return this.get(actor, id);
  }

  private async applyResolution(
    tx: Tx,
    d: { id: string; status: DisputeRow['status']; bookingId: string; invoiceId: string | null; reference: string },
    r: { kind: 'ADMIN_DECISION' | 'MUTUAL_SETTLEMENT'; outcome: string; rationale: string; adjustmentKobo: bigint | null; revisedAcceptedKg: string | null; decidedByUserId: string; agreedByUserIds: string[] },
    actor: Actor,
    now: Date,
  ) {
    if (['RESOLVED', 'WITHDRAWN'].includes(d.status)) throw new DomainError('INVALID_STATE_TRANSITION', 'This dispute is already closed');
    const resolution = await tx.resolution.create({
      data: { disputeId: d.id, kind: r.kind, outcome: r.outcome, rationale: r.rationale, adjustmentKobo: r.adjustmentKobo, revisedAcceptedKg: r.revisedAcceptedKg, decidedByUserId: r.decidedByUserId, agreedByUserIds: r.agreedByUserIds },
    });
    let invoiceId = d.invoiceId;
    if (r.adjustmentKobo !== null && r.adjustmentKobo !== 0n) {
      if (!invoiceId) {
        const produce = await tx.invoice.findUnique({ where: { bookingId_kind: { bookingId: d.bookingId, kind: 'PRODUCE' } } });
        invoiceId = produce?.id ?? null;
      }
      if (!invoiceId) throw new DomainError('BAD_REQUEST', 'No invoice to adjust for this booking');
      await tx.adjustment.create({ data: { invoiceId, amountKobo: r.adjustmentKobo, reason: `Dispute ${d.reference}: ${r.outcome}`, disputeId: d.id, resolutionId: resolution.id, createdByUserId: actor.userId } });
      await refreshInvoice(tx, invoiceId);
    }
    await this.move(tx, d, 'resolve', actor.userId, r.outcome);
    // A disputed or overdue receiving review becomes final once resolved; the booking can then complete.
    const rec = await tx.receivingRecord.findUnique({ where: { bookingId: d.bookingId }, include: { qualityAssessment: true } });
    if (rec && ['DISPUTED', 'REVIEW_OVERDUE'].includes(rec.status)) {
      await tx.receivingRecord.update({ where: { id: rec.id }, data: { status: transition(RECEIVING_MACHINE, rec.status, 'resolve'), finalisedAt: now, version: { increment: 1 } } });
      if (rec.qualityAssessment) await issueReceivingInvoices(tx, d.bookingId, rec.qualityAssessment.acceptedKg.toString(), now);
      const b = await tx.booking.findUniqueOrThrow({ where: { id: d.bookingId }, include: { shipments: true } });
      if (b.status === 'ACTIVE' && (await this.handedOver(tx, b))) {
        await tx.booking.update({ where: { id: b.id }, data: { status: transition(BOOKING_MACHINE, b.status, 'complete'), completedAt: now, version: { increment: 1 } } });
      }
    }
    await audit(tx, { actor, action: 'dispute.resolved', entityType: 'dispute', entityId: d.id, reason: r.rationale, data: { kind: r.kind, adjustmentKobo: r.adjustmentKobo?.toString() ?? null, revisedAcceptedKg: r.revisedAcceptedKg } });
    await notify(tx, {
      userIds: [...(await bookingRecipients(tx, d.bookingId, { farmer: true, processorRoles: ['OWNER', 'MANAGER', 'FINANCE_OFFICER'], transporter: true }, now)), ...(await adminUserIds(tx))],
      type: 'dispute.resolved',
      category: 'disputes',
      title: `Dispute ${d.reference} resolved`,
      body: `${r.outcome}${r.adjustmentKobo ? ` — invoice adjusted by ${formatNaira(r.adjustmentKobo)}` : ''}. Any payment due is made and confirmed through the invoice.`,
      link: `/disputes/${d.id}`,
      bookingId: d.bookingId,
      dedupeKey: `dispute-resolved:${d.id}`,
    });
  }

  async withdraw(actor: Actor, id: string, reason: string): Promise<DisputeDto> {
    const d0 = await this.prisma.db.dispute.findUnique({ where: { id } });
    if (!d0) throw new DomainError('NOT_FOUND', 'Dispute not found');
    const access = await this.access.booking(actor, d0.bookingId);
    if (this.viewerParty(access) !== d0.openedByParty) throw new DomainError('FORBIDDEN', 'Only the party that opened the dispute can withdraw it');
    await withTransaction(this.prisma.db, async (tx) => {
      const d = await tx.dispute.findUniqueOrThrow({ where: { id } });
      await this.move(tx, d, 'withdraw', actor.userId, reason);
      const rec = await tx.receivingRecord.findUnique({ where: { bookingId: d.bookingId } });
      if (rec?.status === 'DISPUTED' && d.receivingRecordId === rec.id) {
        // Withdrawing a receiving dispute means the farmer accepts the decision.
        await tx.receivingRecord.update({ where: { id: rec.id }, data: { status: 'FINAL', finalisedAt: new Date(), version: { increment: 1 } } });
        const b = await tx.booking.findUniqueOrThrow({ where: { id: d.bookingId }, include: { shipments: true } });
        if (b.status === 'ACTIVE' && (await this.handedOver(tx, b))) {
          await tx.booking.update({ where: { id: b.id }, data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } } });
        }
      }
      await audit(tx, { actor, action: 'dispute.withdrawn', entityType: 'dispute', entityId: id, reason });
    });
    return this.get(actor, id);
  }

  formatQty(q: string) {
    return formatKg(q);
  }
}
