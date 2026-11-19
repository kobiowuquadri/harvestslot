import { z } from 'zod';
import { optionalText, reasonText, uuid } from './common.js';
import {
  BookingPartyE,
  DisputeCategoryE,
  DisputeStatusE,
  EvidenceVerificationE,
  FarmerReceivingDecisionE,
  InvoiceKindE,
  InvoiceStatusE,
  LossMethodE,
  LossStageE,
  PartyTypeE,
  PaymentAttemptStatusE,
  PaymentMethodE,
  ProcessingProductE,
  ProcessingStatusE,
  ReceiptDecisionE,
  ReceivingStatusE,
  RefundStatusE,
  RejectedDispositionE,
  RejectionReasonE,
  ResolutionKindE,
  VerificationLevelE,
  WeighingMethodE,
  WeightEvidenceKindE,
} from './enums.js';
import { isoDate } from './time.js';
import { kgString, koboInt, positiveKgString, positiveKoboInt } from './units.js';

// ───────────── Receiving ─────────────

export const recordWeighingSchema = z
  .object({
    grossKg: positiveKgString,
    tareKg: kgString.default('0'),
    weighingMethod: WeighingMethodE.schema,
    scaleReference: optionalText(80),
    note: optionalText(1000),
  })
  .refine((v) => Number(v.grossKg) >= Number(v.tareKg), { message: 'Gross weight must be at least the tare', path: ['tareKg'] });

/** One step from the booking: what arrived and what the buyer accepts. Payment is for the accepted weight. */
export const recordAcceptedWeightSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    receivedKg: positiveKgString,
    acceptedKg: kgString,
    weighingMethod: WeighingMethodE.schema.default('PLATFORM_SCALE'),
    rejectionReasons: z.array(RejectionReasonE.schema).default([]),
    note: optionalText(1000),
  })
  .refine((v) => Number(v.acceptedKg) <= Number(v.receivedKg), { message: 'Accepted weight cannot be more than the weight received', path: ['acceptedKg'] })
  .refine((v) => Number(v.acceptedKg) === Number(v.receivedKg) || v.rejectionReasons.length > 0, {
    message: 'Say why some cassava was not accepted',
    path: ['rejectionReasons'],
  });

export const addWeightEvidenceSchema = z.object({
  kind: WeightEvidenceKindE.schema,
  attachmentId: uuid.optional(),
  reference: optionalText(80),
  note: optionalText(500),
});

export const submitQualityDecisionSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    acceptedKg: kgString,
    rejectedKg: kgString,
    rejectionReasons: z.array(RejectionReasonE.schema).default([]),
    rejectionNote: optionalText(1000),
    rejectedDisposition: RejectedDispositionE.schema.default('NONE'),
    criteriaResults: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])).default({}),
    hoursSinceHarvest: z.number().min(0).max(1000).optional(),
    note: optionalText(1000),
  })
  .refine((v) => Number(v.rejectedKg) === 0 || v.rejectionReasons.length > 0, {
    message: 'Give at least one reason for the rejected quantity',
    path: ['rejectionReasons'],
  })
  .refine((v) => Number(v.rejectedKg) === 0 || v.rejectedDisposition !== 'NONE', {
    message: 'Choose what happens to the rejected cassava',
    path: ['rejectedDisposition'],
  });

export const farmerReceivingReviewSchema = z.object({
  expectedVersion: z.number().int().min(1),
  decision: FarmerReceivingDecisionE.schema,
  note: optionalText(1000),
  actingForFarmerId: uuid.optional(),
  /** Required when disputing: what the farmer believes. */
  dispute: z
    .object({
      category: z.enum(['WEIGHT', 'QUALITY_REJECTION']),
      quantityInQuestionKg: kgString.optional(),
      description: z.string().trim().min(10).max(2000),
    })
    .optional(),
});

export const receivingSchema = z.object({
  id: uuid,
  bookingId: uuid,
  bookingReference: z.string(),
  status: ReceivingStatusE.schema,
  version: z.number(),
  contractedKg: z.string(),
  toleranceBps: z.number(),
  reportedPickupKg: z.string().nullable(),
  grossKg: z.string(),
  tareKg: z.string(),
  netKg: z.string(),
  weighingMethod: WeighingMethodE.schema,
  scaleReference: z.string().nullable(),
  weightVerification: EvidenceVerificationE.schema,
  weightEvidence: z.array(
    z.object({
      id: uuid,
      kind: WeightEvidenceKindE.schema,
      attachmentId: uuid.nullable(),
      suppliedBy: z.string(),
      suppliedByParty: BookingPartyE.schema,
      verification: EvidenceVerificationE.schema,
      reference: z.string().nullable(),
      note: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  quality: z
    .object({
      acceptedKg: z.string(),
      rejectedKg: z.string(),
      rejectionReasons: z.array(RejectionReasonE.schema),
      rejectionNote: z.string().nullable(),
      rejectedDisposition: RejectedDispositionE.schema,
      criteriaResults: z.record(z.string(), z.unknown()),
      hoursSinceHarvest: z.number().nullable(),
      note: z.string().nullable(),
      assessedBy: z.string(),
    })
    .nullable(),
  materialDiscrepancy: z.boolean(),
  discrepancyReasons: z.array(z.string()),
  reviewDeadline: z.string().nullable(),
  farmerDecision: FarmerReceivingDecisionE.schema.nullable(),
  farmerDecidedAt: z.string().nullable(),
  farmerNote: z.string().nullable(),
  finalisedAt: z.string().nullable(),
  recordedBy: z.string(),
  recordedAt: z.string(),
  photos: z.array(z.object({ id: uuid, purpose: z.string(), filename: z.string() })),
  estimatedProduceAmountKobo: z.number().nullable(),
  allowedActions: z.array(z.string()),
});
export type ReceivingDto = z.infer<typeof receivingSchema>;

export const startProcessingSchema = z.object({ lineId: uuid, inputKg: positiveKgString });
export const completeProcessingSchema = z.object({
  outputProduct: ProcessingProductE.schema,
  outputKg: kgString.optional(),
  handlingLossKg: kgString.optional(),
  handlingLossReason: optionalText(500),
  note: optionalText(1000),
});
export const recordLossSchema = z.object({
  stage: LossStageE.schema,
  quantityKg: positiveKgString,
  method: LossMethodE.schema,
  reason: z.string().trim().min(5).max(500),
});
export const processingSchema = z.object({
  bookingId: uuid,
  status: ProcessingStatusE.schema,
  lineName: z.string().nullable(),
  inputKg: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  outputProduct: ProcessingProductE.schema.nullable(),
  outputKg: z.string().nullable(),
  conversionNote: z.string(),
  losses: z.array(z.object({ stage: LossStageE.schema, quantityKg: z.string(), method: LossMethodE.schema, reason: z.string(), createdAt: z.string() })),
});

// ───────────── Invoices & payments ─────────────

export const paymentAttemptSchema = z.object({
  id: uuid,
  method: PaymentMethodE.schema,
  amountKobo: z.number(),
  payerReference: z.string().nullable(),
  providerReference: z.string().nullable(),
  paidOn: z.string().nullable(),
  status: PaymentAttemptStatusE.schema,
  verificationLevel: VerificationLevelE.schema,
  verificationLabel: z.string(),
  providerEnvironment: z.string().nullable(),
  reportedBy: z.string().nullable(),
  note: z.string().nullable(),
  evidence: z.array(z.object({ attachmentId: uuid, filename: z.string() })),
  receipt: z
    .object({ decision: ReceiptDecisionE.schema, amountReceivedKobo: z.number().nullable(), decidedBy: z.string(), note: z.string().nullable(), createdAt: z.string() })
    .nullable(),
  createdAt: z.string(),
});
export type PaymentAttemptDto = z.infer<typeof paymentAttemptSchema>;

export const invoiceSchema = z.object({
  id: uuid,
  number: z.string(),
  kind: InvoiceKindE.schema,
  bookingId: uuid,
  bookingReference: z.string(),
  payer: z.object({ type: PartyTypeE.schema, id: uuid.nullable(), name: z.string() }),
  payee: z.object({ type: PartyTypeE.schema, id: uuid.nullable(), name: z.string() }),
  currency: z.literal('NGN'),
  lines: z.array(z.object({ description: z.string(), quantityKg: z.string().nullable(), unitPriceKobo: z.number().nullable(), amountKobo: z.number() })),
  adjustments: z.array(z.object({ id: uuid, amountKobo: z.number(), reason: z.string(), createdAt: z.string(), disputeId: uuid.nullable() })),
  subtotalKobo: z.number(),
  adjustmentsKobo: z.number(),
  totalKobo: z.number(),
  confirmedPaidKobo: z.number(),
  reportedPendingKobo: z.number(),
  outstandingKobo: z.number(),
  status: InvoiceStatusE.schema,
  overdue: z.boolean(),
  disputed: z.boolean(),
  issuedAt: z.string(),
  dueAt: z.string(),
  payments: z.array(paymentAttemptSchema),
  refunds: z.array(z.object({ id: uuid, amountKobo: z.number(), reason: z.string(), status: RefundStatusE.schema, createdAt: z.string() })),
  viewerRole: z.enum(['PAYER', 'PAYEE', 'ADMIN', 'OBSERVER']),
  allowedActions: z.array(z.string()),
  isDemo: z.boolean(),
  version: z.number(),
});
export type InvoiceDto = z.infer<typeof invoiceSchema>;

export const invoiceListQuerySchema = z.object({
  role: z.enum(['payer', 'payee', 'any']).default('any'),
  organisationId: uuid.optional(),
  farmerProfileId: uuid.optional(),
  kind: InvoiceKindE.schema.optional(),
  status: z.enum(['OPEN', 'PAID', 'OVERDUE', 'ALL']).default('ALL'),
});

export const reportPaymentSchema = z.object({
  method: z.enum(['BANK_TRANSFER', 'CASH', 'MOBILE_MONEY']),
  amountKobo: positiveKoboInt,
  payerReference: z.string().trim().min(2, 'Enter the bank or receipt reference').max(80),
  paidOn: isoDate,
  note: optionalText(500),
  evidenceAttachmentIds: z.array(uuid).max(5).default([]),
});

export const receiptDecisionSchema = z
  .object({
    decision: ReceiptDecisionE.schema,
    amountReceivedKobo: koboInt.optional(),
    note: optionalText(500),
    actingForFarmerId: uuid.optional(),
  })
  .refine((v) => v.decision !== 'AMOUNT_DIFFERS' || v.amountReceivedKobo !== undefined, {
    message: 'Enter the amount actually received',
    path: ['amountReceivedKobo'],
  });

export const reportRefundSchema = z.object({ paymentAttemptId: uuid.optional(), amountKobo: positiveKoboInt, reason: reasonText });
export const initialiseCheckoutResultSchema = z.object({
  paymentAttemptId: uuid,
  reference: z.string(),
  checkoutUrl: z.string(),
  provider: z.enum(['paystack', 'simulated']),
});

// ───────────── Disputes ─────────────

export const openDisputeSchema = z.object({
  bookingId: uuid,
  invoiceId: uuid.optional(),
  category: DisputeCategoryE.schema,
  amountInQuestionKobo: koboInt.optional(),
  quantityInQuestionKg: kgString.optional(),
  description: z.string().trim().min(10).max(4000),
  evidenceAttachmentIds: z.array(uuid).max(10).default([]),
  actingForFarmerId: uuid.optional(),
});

export const disputeMessageInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  proposedAdjustmentKobo: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).optional(),
  evidenceAttachmentIds: z.array(uuid).max(10).default([]),
  actingForFarmerId: uuid.optional(),
});

export const resolveDisputeSchema = z.object({
  outcome: z.string().trim().min(5).max(500),
  rationale: z.string().trim().min(20).max(4000),
  adjustmentKobo: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).optional(),
  revisedAcceptedKg: kgString.optional(),
});

export const disputeSchema = z.object({
  id: uuid,
  reference: z.string(),
  bookingId: uuid,
  bookingReference: z.string(),
  invoiceId: uuid.nullable(),
  invoiceNumber: z.string().nullable(),
  category: DisputeCategoryE.schema,
  status: DisputeStatusE.schema,
  openedByParty: BookingPartyE.schema,
  openedBy: z.string(),
  respondentParty: BookingPartyE.schema,
  actingForFarmer: z.boolean(),
  amountInQuestionKobo: z.number().nullable(),
  quantityInQuestionKg: z.string().nullable(),
  description: z.string(),
  responseDeadline: z.string(),
  overdue: z.boolean(),
  messages: z.array(
    z.object({
      id: uuid,
      author: z.string(),
      authorParty: BookingPartyE.schema,
      body: z.string(),
      proposedAdjustmentKobo: z.number().nullable(),
      settlementAcceptedAt: z.string().nullable(),
      createdAt: z.string(),
      mine: z.boolean(),
    }),
  ),
  events: z.array(z.object({ fromStatus: DisputeStatusE.schema.nullable(), toStatus: DisputeStatusE.schema, actor: z.string().nullable(), note: z.string().nullable(), createdAt: z.string() })),
  evidence: z.array(z.object({ id: uuid, filename: z.string(), uploadedAt: z.string() })),
  resolution: z
    .object({
      kind: ResolutionKindE.schema,
      outcome: z.string(),
      rationale: z.string(),
      adjustmentKobo: z.number().nullable(),
      revisedAcceptedKg: z.string().nullable(),
      decidedBy: z.string(),
      createdAt: z.string(),
      note: z.string(),
    })
    .nullable(),
  viewerParty: BookingPartyE.schema,
  allowedActions: z.array(z.string()),
  createdAt: z.string(),
  version: z.number(),
});
export type DisputeDto = z.infer<typeof disputeSchema>;
