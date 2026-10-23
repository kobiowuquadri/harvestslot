import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  addWeightEvidenceSchema,
  completeProcessingSchema,
  farmerReceivingReviewSchema,
  formatKg,
  gramsToKgString,
  kgToGrams,
  koboToNumber,
  produceAmountKobo,
  recordLossSchema,
  recordWeighingSchema,
  startProcessingSchema,
  submitQualityDecisionSchema,
  toGrams,
  toleranceGrams,
  type BookingTermsContent,
  type ReceivingDto,
} from '@harvestslot/contracts';
import {
  audit,
  BOOKING_MACHINE,
  bookingRecipients,
  DISPUTE_MACHINE,
  DomainError,
  issueReceivingInvoices,
  nextReference,
  notify,
  RECEIVING_MACHINE,
  transition,
  withTransaction,
  type Actor,
} from '@harvestslot/core';
import type { Tx } from '@harvestslot/db';
import { AccessService, type BookingAccess } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso, kg } from '../../common/serialize.js';
import { BookingEngine } from '../bookings/booking-engine.service.js';

const RECEIVING_ROLES = ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'] as const;

@Injectable()
export class ReceivingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly engine: BookingEngine,
  ) {}

  private discrepancy(contractedG: bigint, toleranceBps: number, netG: bigint, acceptedG: bigint, rejectedG: bigint): string[] {
    const reasons: string[] = [];
    if (rejectedG > 0n) reasons.push(`${formatKg(rejectedG)} rejected`);
    const lower = contractedG - toleranceGrams(contractedG, toleranceBps);
    if (netG < lower) reasons.push(`delivered ${formatKg(netG)} is below the contracted ${formatKg(contractedG)} minus tolerance`);
    if (acceptedG + rejectedG !== netG) reasons.push('accepted and rejected do not add up to the delivered net weight');
    return reasons;
  }

  async get(actor: Actor, bookingId: string): Promise<ReceivingDto | null> {
    const access = await this.access.booking(actor, bookingId);
    if (access.parties.every((p) => p === 'TRANSPORTER')) throw new DomainError('NOT_FOUND', 'Not found');
    const r = await this.prisma.db.receivingRecord.findUnique({
      where: { bookingId },
      include: { weightEvidence: { orderBy: { createdAt: 'asc' } }, qualityAssessment: true, booking: { include: { pickupRecords: true } } },
    });
    if (!r) return null;
    const { content } = await this.engine.currentTerms(this.prisma.db as unknown as Tx, bookingId);
    const userIds = [r.recordedByUserId, r.qualityAssessment?.assessedByUserId, ...r.weightEvidence.map((w) => w.suppliedByUserId)].filter((x): x is string => !!x);
    const users = await this.prisma.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } });
    const name = (id: string | undefined | null) => users.find((u) => u.id === id)?.displayName ?? 'Unknown';
    const contractedG = toGrams(content.quantityKg);
    const q = r.qualityAssessment;
    const reasons = q ? this.discrepancy(contractedG, content.toleranceBps, toGrams(r.netKg), toGrams(q.acceptedKg), toGrams(q.rejectedKg)) : [];
    const photos = await this.prisma.db.attachment.findMany({ where: { bookingId, purpose: { in: ['WEIGHT_EVIDENCE', 'QUALITY_PHOTO', 'DELIVERY_EVIDENCE'] } }, orderBy: { createdAt: 'asc' } });
    const actions: string[] = [];
    const processorSide = access.parties.includes('PROCESSOR') && access.processorRoles.some((x) => (RECEIVING_ROLES as readonly string[]).includes(x));
    if (processorSide && r.status === 'DRAFT') actions.push('reweigh', 'addEvidence', 'submitDecision');
    const farmerApprove = access.farmer && (access.farmer.mode === 'SELF' || (access.farmer.mode === 'DELEGATE' && access.farmer.scopes.includes('APPROVE_SALE')));
    if (farmerApprove && ['AWAITING_FARMER_REVIEW', 'REVIEW_OVERDUE'].includes(r.status)) actions.push('farmerAccept', 'farmerDispute');
    const pickup = r.booking.pickupRecords[0];
    return {
      id: r.id,
      bookingId,
      bookingReference: r.booking.reference,
      status: r.status,
      version: r.version,
      contractedKg: content.quantityKg,
      toleranceBps: content.toleranceBps,
      reportedPickupKg: pickup ? kg(pickup.reportedQuantityKg) : null,
      grossKg: kg(r.grossKg),
      tareKg: kg(r.tareKg),
      netKg: kg(r.netKg),
      weighingMethod: r.weighingMethod,
      scaleReference: r.scaleReference,
      weightVerification: r.weightVerification,
      weightEvidence: r.weightEvidence.map((w) => ({
        id: w.id,
        kind: w.kind,
        attachmentId: w.attachmentId,
        suppliedBy: name(w.suppliedByUserId),
        suppliedByParty: w.suppliedByParty,
        verification: w.verification,
        reference: w.reference,
        note: w.note,
        createdAt: w.createdAt.toISOString(),
      })),
      quality: q
        ? {
            acceptedKg: kg(q.acceptedKg),
            rejectedKg: kg(q.rejectedKg),
            rejectionReasons: q.rejectionReasons,
            rejectionNote: q.rejectionNote,
            rejectedDisposition: q.rejectedDisposition,
            criteriaResults: (q.criteriaResults ?? {}) as Record<string, unknown>,
            hoursSinceHarvest: q.hoursSinceHarvest === null ? null : Number(q.hoursSinceHarvest),
            note: q.note,
            assessedBy: name(q.assessedByUserId),
          }
        : null,
      materialDiscrepancy: reasons.length > 0,
      discrepancyReasons: reasons,
      reviewDeadline: iso(r.reviewDeadline),
      farmerDecision: r.farmerDecision,
      farmerDecidedAt: iso(r.farmerDecidedAt),
      farmerNote: r.farmerNote,
      finalisedAt: iso(r.finalisedAt),
      recordedBy: name(r.recordedByUserId),
      recordedAt: r.recordedAt.toISOString(),
      photos: photos.map((p) => ({ id: p.id, purpose: p.purpose, filename: p.originalFilename })),
      estimatedProduceAmountKobo: q ? koboToNumber(produceAmountKobo(toGrams(q.acceptedKg), BigInt(content.priceKoboPerKg))) : null,
      allowedActions: actions,
    };
  }

  private requireReceiving(access: BookingAccess): void {
    this.access.requireProcessorRole(access, [...RECEIVING_ROLES], 'record receiving');
  }

  async recordWeighing(actor: Actor, bookingId: string, input: z.infer<typeof recordWeighingSchema>) {
    const access = await this.access.booking(actor, bookingId);
    this.requireReceiving(access);
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, bookingId);
      const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { shipments: { where: { status: { in: ['ARRIVED_AT_FACILITY', 'DELIVERED'] } } }, receivingRecord: true } });
      if (b.status !== 'ACTIVE') throw new DomainError('INVALID_STATE_TRANSITION', 'Receiving is recorded for active bookings');
      if (!b.shipments.length) throw new DomainError('INVALID_STATE_TRANSITION', 'The load has not arrived at the facility');
      const gross = kgToGrams(input.grossKg);
      const tare = kgToGrams(input.tareKg);
      if (gross < tare) throw new DomainError('VALIDATION_FAILED', 'Gross weight must be at least the tare');
      const net = gramsToKgString(gross - tare);
      const data = {
        grossKg: gramsToKgString(gross),
        tareKg: gramsToKgString(tare),
        netKg: net,
        weighingMethod: input.weighingMethod,
        scaleReference: input.scaleReference ?? null,
        note: input.note ?? null,
        recordedByUserId: actor.userId,
        recordedAt: now,
      };
      if (b.receivingRecord) {
        if (b.receivingRecord.status !== 'DRAFT') throw new DomainError('INVALID_STATE_TRANSITION', 'The receiving decision has been submitted; weights can no longer change');
        await tx.receivingRecord.update({ where: { id: b.receivingRecord.id }, data: { ...data, version: { increment: 1 } } });
      } else {
        await tx.receivingRecord.create({ data: { bookingId, facilityId: b.facilityId, ...data } });
      }
      await audit(tx, { actor, organisationId: b.processorOrgId, action: b.receivingRecord ? 'receiving.reweighed' : 'receiving.weighed', entityType: 'booking', entityId: bookingId, data: { grossKg: input.grossKg, tareKg: input.tareKg, netKg: net, method: input.weighingMethod } });
    });
    return this.get(actor, bookingId);
  }

  async addEvidence(actor: Actor, bookingId: string, input: z.infer<typeof addWeightEvidenceSchema>) {
    const access = await this.access.booking(actor, bookingId);
    this.requireReceiving(access);
    const r = await this.prisma.db.receivingRecord.findUnique({ where: { bookingId } });
    if (!r) throw new DomainError('INVALID_STATE_TRANSITION', 'Record the weighing first');
    if (input.attachmentId) {
      const a = await this.prisma.db.attachment.findUnique({ where: { id: input.attachmentId } });
      if (!a || a.bookingId !== bookingId) throw new DomainError('VALIDATION_FAILED', 'Attachment must be uploaded for this booking');
    }
    await this.prisma.db.weightEvidence.create({
      data: {
        receivingRecordId: r.id,
        kind: input.kind,
        attachmentId: input.attachmentId ?? null,
        suppliedByUserId: actor.userId,
        suppliedByParty: 'PROCESSOR',
        // An uploaded ticket is a document, not independent verification.
        verification: input.attachmentId ? 'DOCUMENT_UPLOADED' : 'SELF_REPORTED',
        reference: input.reference ?? null,
        note: input.note ?? null,
      },
    });
    if (input.attachmentId && r.weightVerification === 'SELF_REPORTED') {
      await this.prisma.db.receivingRecord.update({ where: { id: r.id }, data: { weightVerification: 'DOCUMENT_UPLOADED' } });
    }
    await audit(this.prisma.db, { actor, action: 'receiving.evidence-added', entityType: 'booking', entityId: bookingId, data: { kind: input.kind } });
    return this.get(actor, bookingId);
  }

  /** Processor proposes the receiving decision. Material discrepancies go to the farmer for review. */
  async submitDecision(actor: Actor, bookingId: string, input: z.infer<typeof submitQualityDecisionSchema>) {
    const access = await this.access.booking(actor, bookingId);
    this.requireReceiving(access);
    const now = new Date();
    const policies = await this.prisma.policies();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, bookingId);
      await tx.$queryRawUnsafe('SELECT id FROM receiving_records WHERE "bookingId" = $1::uuid FOR UPDATE', bookingId);
      const r = await tx.receivingRecord.findUnique({ where: { bookingId }, include: { booking: { include: { shipments: true, pickupRecords: true, reservation: true } } } });
      if (!r) throw new DomainError('INVALID_STATE_TRANSITION', 'Record the weighing first');
      if (r.version !== input.expectedVersion) throw new DomainError('VERSION_CONFLICT', 'The receiving record changed. Reload and try again.');
      if (!r.booking.shipments.some((s) => s.status === 'DELIVERED')) throw new DomainError('INVALID_STATE_TRANSITION', 'Confirm delivery receipt before recording the quality decision');
      const { content } = await this.engine.currentTerms(tx, bookingId);
      const netG = toGrams(r.netKg);
      const acceptedG = kgToGrams(input.acceptedKg);
      const rejectedG = kgToGrams(input.rejectedKg);
      if (acceptedG + rejectedG !== netG) {
        throw new DomainError('QUANTITY_MISMATCH', `Accepted (${formatKg(acceptedG)}) plus rejected (${formatKg(rejectedG)}) must equal the delivered net weight (${formatKg(netG)})`);
      }
      const contractedG = toGrams(content.quantityKg);
      const maxAccept = contractedG + toleranceGrams(contractedG, content.toleranceBps);
      if (acceptedG > maxAccept) {
        throw new DomainError('OVER_TOLERANCE', `Accepting ${formatKg(acceptedG)} exceeds the contracted ${formatKg(contractedG)} plus tolerance (${formatKg(maxAccept)}). Propose an over-delivery amendment first, or record the excess as rejected (above contract).`);
      }
      const reasons = this.discrepancy(contractedG, content.toleranceBps, netG, acceptedG, rejectedG);
      const material = reasons.length > 0;
      const to = transition(RECEIVING_MACHINE, r.status, material ? 'submitWithDiscrepancy' : 'submitNoDiscrepancy', 'receiving record');
      await tx.qualityAssessment.create({
        data: {
          receivingRecordId: r.id,
          assessedByUserId: actor.userId,
          acceptedKg: gramsToKgString(acceptedG),
          rejectedKg: gramsToKgString(rejectedG),
          rejectionReasons: input.rejectionReasons,
          rejectionNote: input.rejectionNote ?? null,
          rejectedDisposition: rejectedG > 0n ? input.rejectedDisposition : 'NONE',
          criteriaResults: input.criteriaResults,
          hoursSinceHarvest: input.hoursSinceHarvest ?? null,
          note: input.note ?? null,
        },
      });
      await tx.receivingRecord.update({
        where: { id: r.id },
        data: {
          status: to,
          decisionSubmittedAt: now,
          decisionSubmittedByUserId: actor.userId,
          reviewDeadline: material ? new Date(now.getTime() + policies.receivingReviewHours * 3_600_000) : null,
          finalisedAt: material ? null : now,
          version: { increment: 1 },
        },
      });
      // Capacity used in this window stays used, regardless of the accepted quantity.
      if (r.booking.reservation && r.booking.reservation.status === 'CONFIRMED') {
        await tx.reservation.update({ where: { id: r.booking.reservation.id }, data: { status: 'CONSUMED', consumedAt: now, version: { increment: 1 } } });
      }
      const pickup = r.booking.pickupRecords[0];
      if (pickup && toGrams(pickup.reportedQuantityKg) > netG) {
        await tx.lossRecord.create({
          data: {
            bookingId,
            stage: 'IN_TRANSIT',
            quantityKg: gramsToKgString(toGrams(pickup.reportedQuantityKg) - netG),
            method: 'ESTIMATED',
            reason: 'Difference between the driver-reported pickup quantity (self-reported) and the facility net weight',
            recordedByUserId: actor.userId,
          },
        });
      }
      await audit(tx, { actor, organisationId: r.booking.processorOrgId, action: 'receiving.decision-submitted', entityType: 'booking', entityId: bookingId, data: { acceptedKg: input.acceptedKg, rejectedKg: input.rejectedKg, material } });
      if (material) {
        await notify(tx, {
          userIds: await bookingRecipients(tx, bookingId, { farmer: 'APPROVE_SALE' }, now),
          type: 'receiving.review-needed',
          category: 'receiving',
          title: `${r.booking.reference}: review the receiving decision`,
          body: `${formatKg(acceptedG)} accepted, ${formatKg(rejectedG)} rejected (${reasons.join('; ')}). Accept or dispute by ${new Date(now.getTime() + policies.receivingReviewHours * 3_600_000).toISOString().slice(0, 16).replace('T', ' ')} UTC. It will not be accepted automatically.`,
          link: `/bookings/${bookingId}/receiving`,
          bookingId,
          dedupeKey: `receiving-review:${r.id}`,
        });
      } else {
        await this.finalise(tx, bookingId, gramsToKgString(acceptedG), actor, now);
      }
    });
    return this.get(actor, bookingId);
  }

  /** Issues invoices for the accepted quantity and completes the booking once delivery and receiving are final. */
  private async finalise(tx: Tx, bookingId: string, acceptedKg: string, actor: Actor, now: Date) {
    await issueReceivingInvoices(tx, bookingId, acceptedKg, now);
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { receivingRecord: true, shipments: true } });
    if (b.status === 'ACTIVE' && b.receivingRecord?.status === 'FINAL' && b.shipments.some((s) => s.status === 'DELIVERED')) {
      await tx.booking.update({ where: { id: bookingId }, data: { status: transition(BOOKING_MACHINE, b.status, 'complete', 'booking'), completedAt: now, version: { increment: 1 } } });
      await audit(tx, { actor, action: 'booking.completed', entityType: 'booking', entityId: bookingId });
    }
    await notify(tx, {
      userIds: await bookingRecipients(tx, bookingId, { farmer: true, processorRoles: ['OWNER', 'MANAGER', 'FINANCE_OFFICER'] }, now),
      type: 'receiving.final',
      category: 'receiving',
      title: `${b.reference}: receiving decision final`,
      body: `${formatKg(acceptedKg)} accepted. The produce invoice has been issued. Delivery is complete; payment is tracked separately.`,
      link: `/bookings/${bookingId}`,
      bookingId,
      dedupeKey: `receiving-final:${bookingId}`,
    });
  }

  /** Farmer (or APPROVE_SALE representative) accepts or disputes a decision with a material discrepancy. */
  async farmerReview(actor: Actor, bookingId: string, input: z.infer<typeof farmerReceivingReviewSchema>) {
    const access = await this.access.booking(actor, bookingId);
    const authority = this.access.requireFarmerAction(access, 'receiving.review');
    if (input.decision === 'DISPUTED' && !input.dispute) throw new DomainError('VALIDATION_FAILED', 'Describe what you dispute');
    const now = new Date();
    const policies = await this.prisma.policies();
    await withTransaction(this.prisma.db, async (tx) => {
      await this.engine.lockGraph(tx, bookingId);
      await tx.$queryRawUnsafe('SELECT id FROM receiving_records WHERE "bookingId" = $1::uuid FOR UPDATE', bookingId);
      const r = await tx.receivingRecord.findUniqueOrThrow({ where: { bookingId }, include: { qualityAssessment: true, booking: true } });
      if (r.version !== input.expectedVersion) throw new DomainError('VERSION_CONFLICT', 'The receiving record changed. Reload and try again.');
      const to = transition(RECEIVING_MACHINE, r.status, input.decision === 'ACCEPTED' ? 'farmerAccept' : 'farmerDispute', 'receiving record');
      await tx.receivingRecord.update({
        where: { id: r.id },
        data: {
          status: to,
          farmerDecision: input.decision,
          farmerDecidedAt: now,
          farmerDecidedByUserId: actor.userId,
          farmerDelegationId: authority.mode === 'DELEGATE' ? authority.delegationId : null,
          farmerNote: input.note ?? null,
          finalisedAt: to === 'FINAL' ? now : null,
          version: { increment: 1 },
        },
      });
      await audit(tx, { actor, farmer: authority, action: input.decision === 'ACCEPTED' ? 'receiving.farmer-accepted' : 'receiving.farmer-disputed', entityType: 'booking', entityId: bookingId, data: { note: input.note ?? null } });
      const acceptedKg = r.qualityAssessment!.acceptedKg.toString();
      if (input.decision === 'ACCEPTED') {
        await this.finalise(tx, bookingId, acceptedKg, actor, now);
        return;
      }
      // Disputed: the undisputed accepted quantity is invoiced now; the dispute may add an adjustment later.
      await issueReceivingInvoices(tx, bookingId, acceptedKg, now);
      const produceInvoice = await tx.invoice.findUnique({ where: { bookingId_kind: { bookingId, kind: 'PRODUCE' } } });
      const d = input.dispute!;
      const dispute = await tx.dispute.create({
        data: {
          reference: await nextReference(tx, 'dispute'),
          bookingId,
          invoiceId: produceInvoice?.id ?? null,
          receivingRecordId: r.id,
          category: d.category,
          status: transition(DISPUTE_MACHINE, 'OPEN', 'awaitResponse'),
          openedByUserId: actor.userId,
          openedByParty: 'FARMER',
          respondentParty: 'PROCESSOR',
          actingForFarmerId: authority.mode === 'DELEGATE' ? authority.farmerProfileId : null,
          delegationId: authority.mode === 'DELEGATE' ? authority.delegationId : null,
          quantityInQuestionKg: d.quantityInQuestionKg ?? null,
          description: d.description,
          responseDeadline: new Date(now.getTime() + policies.disputeResponseHours * 3_600_000),
          isDemo: r.booking.isDemo,
        },
      });
      await tx.disputeEvent.createMany({
        data: [
          { disputeId: dispute.id, fromStatus: null, toStatus: 'OPEN', actorUserId: actor.userId, note: 'Opened from receiving review' },
          { disputeId: dispute.id, fromStatus: 'OPEN', toStatus: 'AWAITING_RESPONSE', actorUserId: actor.userId, note: 'Awaiting the processor’s response' },
        ],
      });
      await notify(tx, {
        userIds: await bookingRecipients(tx, bookingId, { processorRoles: ['OWNER', 'MANAGER', 'RECEIVING_OFFICER'], admins: true }, now),
        type: 'dispute.opened',
        category: 'disputes',
        title: `${r.booking.reference}: farmer disputed the receiving decision`,
        body: d.description.slice(0, 200),
        link: `/disputes/${dispute.id}`,
        bookingId,
        dedupeKey: `dispute-opened:${dispute.id}`,
      });
    });
    return this.get(actor, bookingId);
  }

  // ───────────── Processing ─────────────

  async processing(actor: Actor, bookingId: string) {
    const access = await this.access.booking(actor, bookingId);
    if (access.parties.every((p) => p === 'TRANSPORTER')) throw new DomainError('NOT_FOUND', 'Not found');
    const p = await this.prisma.db.processingRecord.findUnique({ where: { bookingId }, include: { line: true } });
    const losses = await this.prisma.db.lossRecord.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
    return {
      bookingId,
      status: p?.status ?? 'NOT_STARTED',
      lineName: p?.line.name ?? null,
      inputKg: kg(p?.inputKg),
      startedAt: iso(p?.startedAt),
      completedAt: iso(p?.completedAt),
      outputProduct: p?.outputProduct ?? null,
      outputKg: kg(p?.outputKg),
      conversionNote:
        'Fresh root weight and finished product weight are not directly comparable: conversion yield reflects processing (moisture and peel removal), not avoidable loss. Only measured handling losses are recorded as loss.',
      losses: losses.map((l) => ({ stage: l.stage, quantityKg: kg(l.quantityKg), method: l.method, reason: l.reason, createdAt: l.createdAt.toISOString() })),
    };
  }

  async startProcessing(actor: Actor, bookingId: string, input: z.infer<typeof startProcessingSchema>) {
    const access = await this.access.booking(actor, bookingId);
    this.access.requireProcessorRole(access, [...RECEIVING_ROLES], 'record processing');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { receivingRecord: { include: { qualityAssessment: true } }, processingRecord: true } });
      const r = b.receivingRecord;
      if (!r?.qualityAssessment || !['FINAL', 'DISPUTED', 'REVIEW_OVERDUE', 'AWAITING_FARMER_REVIEW'].includes(r.status)) {
        throw new DomainError('INVALID_STATE_TRANSITION', 'Record the receiving decision first');
      }
      if (b.processingRecord && b.processingRecord.status !== 'NOT_STARTED') throw new DomainError('INVALID_STATE_TRANSITION', 'Processing already started');
      const line = await tx.processingLine.findUnique({ where: { id: input.lineId } });
      if (!line || line.facilityId !== b.facilityId) throw new DomainError('VALIDATION_FAILED', 'Choose a line at this facility');
      if (kgToGrams(input.inputKg) > toGrams(r.qualityAssessment.acceptedKg)) throw new DomainError('QUANTITY_MISMATCH', 'Processed input cannot exceed the accepted quantity');
      await tx.processingRecord.upsert({
        where: { bookingId },
        create: { bookingId, lineId: input.lineId, status: 'IN_PROGRESS', inputKg: input.inputKg, startedAt: now, startedByUserId: actor.userId },
        update: { lineId: input.lineId, status: 'IN_PROGRESS', inputKg: input.inputKg, startedAt: now, startedByUserId: actor.userId, version: { increment: 1 } },
      });
      await audit(tx, { actor, action: 'processing.started', entityType: 'booking', entityId: bookingId, data: { inputKg: input.inputKg } });
    });
    return this.processing(actor, bookingId);
  }

  async completeProcessing(actor: Actor, bookingId: string, input: z.infer<typeof completeProcessingSchema>) {
    const access = await this.access.booking(actor, bookingId);
    this.access.requireProcessorRole(access, [...RECEIVING_ROLES], 'record processing');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      const p = await tx.processingRecord.findUnique({ where: { bookingId } });
      if (!p || p.status !== 'IN_PROGRESS') throw new DomainError('INVALID_STATE_TRANSITION', 'Processing has not started');
      if (input.handlingLossKg && p.inputKg && kgToGrams(input.handlingLossKg) > toGrams(p.inputKg)) throw new DomainError('QUANTITY_MISMATCH', 'Loss cannot exceed the processed input');
      await tx.processingRecord.update({
        where: { id: p.id },
        data: { status: 'COMPLETED', completedAt: now, completedByUserId: actor.userId, outputProduct: input.outputProduct, outputKg: input.outputKg ?? null, note: input.note ?? null, version: { increment: 1 } },
      });
      if (input.handlingLossKg && kgToGrams(input.handlingLossKg) > 0n) {
        await tx.lossRecord.create({
          data: { bookingId, stage: 'PROCESSING', quantityKg: input.handlingLossKg, method: 'MEASURED_WEIGHT', reason: input.handlingLossReason ?? 'Measured handling loss during processing', recordedByUserId: actor.userId },
        });
      }
      await audit(tx, { actor, action: 'processing.completed', entityType: 'booking', entityId: bookingId, data: { outputKg: input.outputKg ?? null } });
    });
    return this.processing(actor, bookingId);
  }

  async recordLoss(actor: Actor, bookingId: string, input: z.infer<typeof recordLossSchema>) {
    const access = await this.access.booking(actor, bookingId);
    this.access.requireProcessorRole(access, [...RECEIVING_ROLES], 'record losses');
    await this.prisma.db.lossRecord.create({ data: { bookingId, stage: input.stage, quantityKg: input.quantityKg, method: input.method, reason: input.reason, recordedByUserId: actor.userId } });
    await audit(this.prisma.db, { actor, action: 'loss.recorded', entityType: 'booking', entityId: bookingId, data: { stage: input.stage, quantityKg: input.quantityKg, method: input.method } });
    return this.processing(actor, bookingId);
  }

  /** Confirmed/active intake for the processor, with delay flags based on agreed windows. */
  async intake(actor: Actor, orgId: string, from?: string, to?: string) {
    await this.access.requireOrg(actor, orgId, 'processor.booking.view');
    const now = new Date();
    const rows = await this.prisma.db.booking.findMany({
      where: { processorOrgId: orgId, status: { in: ['AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE'] }, slot: { startsAt: { gte: from ? new Date(from) : new Date(now.getTime() - 7 * 86_400_000), lte: to ? new Date(to) : new Date(now.getTime() + 30 * 86_400_000) } } },
      include: { termsVersions: true, farmerProfile: { select: { displayName: true } }, shipments: { orderBy: { createdAt: 'desc' }, take: 1 }, receivingRecord: { select: { status: true } }, harvestLot: true, slot: { include: { line: true } } },
      orderBy: { slot: { startsAt: 'asc' } },
    });
    return rows.map((b) => {
      const c = b.termsVersions.find((v) => v.versionNo === b.currentTermsVersionNo)!.content as unknown as BookingTermsContent;
      const shipment = b.shipments[0];
      const delayed = !shipment || !['ARRIVED_AT_FACILITY', 'DELIVERED'].includes(shipment.status) ? new Date(c.deliveryWindow.end) < now : false;
      return {
        bookingId: b.id,
        reference: b.reference,
        status: b.status,
        farmerName: b.farmerProfile.displayName,
        quantityKg: c.quantityKg,
        lineName: b.slot.line.name,
        deliveryWindow: c.deliveryWindow,
        ready: b.lastReadiness,
        transportStatus: shipment?.status ?? (c.transport ? 'AGREED' : 'NOT_ARRANGED'),
        harvestStatus: b.harvestLot?.status ?? null,
        receivingStatus: b.receivingRecord?.status ?? null,
        delayed,
      };
    });
  }
}
