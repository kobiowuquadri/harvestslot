import { z } from 'zod';
import { optionalText, reasonText, uuid } from './common.js';
import {
  AmendmentStatusE,
  BookingPartyE,
  BookingStatusE,
  ConfirmationMethodE,
  FreightPayerE,
  HandoverMethodE,
  HarvestLotStatusE,
  IncidentKindE,
  ProcessingProductE,
  RejectionHandlingE,
  ReservationStatusE,
  ShipmentStatusE,
  TermsChangeReasonE,
} from './enums.js';
import { qualityTermsSchema } from './facilities.js';
import { positiveKgString, positiveKoboInt } from './units.js';

// ───────────── Matching ─────────────

export const matchQuerySchema = z.object({ harvestRequestId: uuid });

export const matchFactorSchema = z.object({
  key: z.enum(['netValue', 'schedule', 'distance', 'capacityFit', 'reliability']),
  label: z.string(),
  weight: z.number(),
  score: z.number().nullable(),
  explanation: z.string(),
});

export const matchResultSchema = z.object({
  facilityId: uuid,
  facilityName: z.string(),
  processorOrgId: uuid,
  processorName: z.string(),
  processorReviewed: z.boolean(),
  lga: z.string(),
  slot: z.object({ id: uuid, startsAt: z.string(), endsAt: z.string(), lineName: z.string(), product: ProcessingProductE.schema }),
  availableKg: z.string(),
  fitKg: z.string(),
  indicativePriceKoboPerKg: z.number().nullable(),
  distance: z.object({
    straightLineKm: z.number(),
    estimatedRoadKm: z.number(),
    method: z.enum(['STRAIGHT_LINE_ESTIMATE', 'ROUTING_PROVIDER']),
    label: z.string(),
  }),
  costs: z.object({
    estimatedProduceAmountKobo: z.number().nullable(),
    freightPayer: z.literal('PROCESSOR'),
    freightNote: z.string(),
    estimatedFarmerNetKobo: z.number().nullable(),
  }),
  score: z.number(),
  factors: z.array(matchFactorSchema),
  reliability: z.object({ completedBookings: z.number(), onTimeRate: z.number().nullable(), label: z.string() }),
  explanation: z.array(z.string()),
  remainingSteps: z.array(z.string()),
  qualityCriteria: qualityTermsSchema,
  invited: z.boolean(),
  availabilityAsOf: z.string(),
});
export type MatchResult = z.infer<typeof matchResultSchema>;

export const matchResponseSchema = z.object({
  harvestRequestId: uuid,
  remainingKg: z.string(),
  computedAt: z.string(),
  disclaimer: z.string(),
  results: z.array(matchResultSchema),
  infeasible: z
    .object({
      reasons: z.array(z.string()),
      suggestions: z.array(z.object({ kind: z.enum(['REDUCE_QUANTITY', 'CHANGE_DATES', 'EXTEND_DISTANCE', 'WAIT']), text: z.string() })),
    })
    .nullable(),
});
export type MatchResponse = z.infer<typeof matchResponseSchema>;

// ───────────── Terms snapshot ─────────────

const windowSchema = z.object({ start: z.string(), end: z.string() });

export const transportTermsSchema = z.object({
  quoteId: uuid,
  transporterOrgId: uuid,
  transporterName: z.string(),
  vehicleId: uuid,
  vehiclePlate: z.string(),
  vehicleType: z.string(),
  vehicleCapacityKg: z.string(),
  pickupWindow: windowSchema,
  deliveryWindow: windowSchema,
  priceKobo: z.number(),
  freightPayer: FreightPayerE.schema,
  includedServices: z.array(z.string()),
  cancellationTerms: z.string(),
});
export type TransportTerms = z.infer<typeof transportTermsSchema>;

/** Immutable snapshot of everything a party agrees to. Stored in booking_terms_versions.content. */
export const bookingTermsContentSchema = z.object({
  schemaVersion: z.literal(1),
  bookingReference: z.string(),
  farmer: z.object({ farmerProfileId: uuid, displayName: z.string() }),
  processor: z.object({ organisationId: uuid, name: z.string() }),
  facility: z.object({ id: uuid, name: z.string(), lga: z.string(), address: z.string().nullable() }),
  line: z.object({ id: uuid, name: z.string(), product: ProcessingProductE.schema }),
  slot: z.object({ id: uuid, startsAt: z.string(), endsAt: z.string() }),
  harvest: z.object({
    harvestRequestId: uuid,
    reference: z.string(),
    plannedHarvestDate: z.string(),
    pickupLocationLabel: z.string(),
    pickupLga: z.string(),
  }),
  quantityKg: z.string(),
  priceKoboPerKg: z.number(),
  estimatedProduceAmountKobo: z.number(),
  toleranceBps: z.number(),
  qualityTerms: qualityTermsSchema,
  pickupWindow: windowSchema,
  deliveryWindow: windowSchema,
  paymentTermsDays: z.number(),
  invoiceDueRule: z.string(),
  cancellationTerms: z.string(),
  rejectionHandling: RejectionHandlingE.schema,
  freightPayer: FreightPayerE.schema,
  transport: transportTermsSchema.nullable(),
  platformFee: z.object({ enabled: z.boolean(), bps: z.number(), payer: z.literal('PROCESSOR'), estimatedKobo: z.number() }),
});
export type BookingTermsContent = z.infer<typeof bookingTermsContentSchema>;

// ───────────── Readiness ─────────────

export const READINESS_CHECKS = [
  'FARMER_ACCEPTED',
  'PROCESSOR_ACCEPTED',
  'CAPACITY_RESERVED',
  'TRANSPORT_ACCEPTED',
  'VEHICLE_DRIVER_CONFIRMED',
  'WINDOWS_FEASIBLE',
  'PARTICIPANTS_ELIGIBLE',
  'NO_BLOCKING_ISSUES',
] as const;
export type ReadinessCheckCode = (typeof READINESS_CHECKS)[number];

export const readinessCheckSchema = z.object({
  code: z.enum(READINESS_CHECKS),
  label: z.string(),
  passed: z.boolean(),
  explanation: z.string(),
  responsible: BookingPartyE.schema.nullable(),
});
export type ReadinessCheck = z.infer<typeof readinessCheckSchema>;

export const readinessSchema = z.object({
  ready: z.boolean(),
  computedAt: z.string(),
  checks: z.array(readinessCheckSchema),
});
export type Readiness = z.infer<typeof readinessSchema>;

// ───────────── Booking resources ─────────────

export const confirmationSchema = z.object({
  party: BookingPartyE.schema,
  method: ConfirmationMethodE.schema,
  actorName: z.string().nullable(),
  actingForFarmer: z.boolean(),
  viaCooperative: z.string().nullable(),
  createdAt: z.string(),
});

export const termsVersionSchema = z.object({
  id: uuid,
  versionNo: z.number(),
  reason: TermsChangeReasonE.schema,
  content: bookingTermsContentSchema,
  contentHash: z.string(),
  createdAt: z.string(),
  changedFields: z.array(z.string()),
  confirmations: z.array(confirmationSchema),
  requiredParties: z.array(BookingPartyE.schema),
});
export type TermsVersionDto = z.infer<typeof termsVersionSchema>;

export const amendmentSchema = z.object({
  id: uuid,
  status: AmendmentStatusE.schema,
  reason: z.string(),
  proposedByParty: BookingPartyE.schema,
  baseVersionNo: z.number(),
  terms: termsVersionSchema,
  pendingParties: z.array(BookingPartyE.schema),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
});
export type AmendmentDto = z.infer<typeof amendmentSchema>;

export const timelineEventSchema = z.object({
  at: z.string(),
  kind: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  actor: z.string().nullable(),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const bookingSummarySchema = z.object({
  id: uuid,
  reference: z.string(),
  status: BookingStatusE.schema,
  farmerName: z.string(),
  farmerProfileId: uuid,
  processorName: z.string(),
  processorOrgId: uuid,
  facilityName: z.string(),
  quantityKg: z.string(),
  priceKoboPerKg: z.number(),
  plannedHarvestDate: z.string(),
  pickupWindow: windowSchema,
  deliveryWindow: windowSchema,
  ready: z.boolean(),
  transportStatus: z.string(),
  receivingStatus: z.string().nullable(),
  nextAction: z.string().nullable(),
  confirmationDeadline: z.string().nullable(),
  isDemo: z.boolean(),
  updatedAt: z.string(),
});
export type BookingSummary = z.infer<typeof bookingSummarySchema>;

export const bookingListQuerySchema = z.object({
  status: BookingStatusE.schema.optional(),
  farmerProfileId: uuid.optional(),
  organisationId: uuid.optional(),
  view: z.enum(['farmer', 'processor', 'transporter', 'cooperative', 'admin']).optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const bookingDetailSchema = z.object({
  id: uuid,
  reference: z.string(),
  status: BookingStatusE.schema,
  version: z.number(),
  viewerParties: z.array(BookingPartyE.schema),
  viewerActingFor: z.object({ farmerName: z.string(), cooperativeName: z.string(), scopes: z.array(z.string()) }).nullable(),
  allowedActions: z.array(z.string()),
  current: termsVersionSchema,
  pendingAmendment: amendmentSchema.nullable(),
  readiness: readinessSchema,
  confirmationDeadline: z.string().nullable(),
  reservation: z.object({ status: ReservationStatusE.schema, quantityKg: z.string(), expiresAt: z.string().nullable() }).nullable(),
  harvestLot: z
    .object({
      status: HarvestLotStatusE.schema,
      quantityKg: z.string(),
      plannedHarvestDate: z.string(),
      harvestStartedAt: z.string().nullable(),
      readyForPickupAt: z.string().nullable(),
      reportedHarvestedKg: z.string().nullable(),
    })
    .nullable(),
  pickupLocation: z.object({
    label: z.string(),
    lga: z.string(),
    community: z.string().nullable(),
    directions: z.string().nullable(),
    exact: z.object({ lat: z.number(), lng: z.number(), accuracyM: z.number().nullable(), source: z.string() }).nullable(),
    approx: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  }),
  facilityLocation: z.object({ lat: z.number(), lng: z.number(), address: z.string().nullable() }),
  contacts: z.array(z.object({ party: BookingPartyE.schema, name: z.string(), phone: z.string().nullable() })),
  /** Latest transport job for the booking; participants need its id to confirm handovers. */
  shipment: z
    .object({
      id: uuid,
      tripId: uuid,
      status: ShipmentStatusE.schema,
      vehiclePlate: z.string(),
      driverName: z.string(),
      collectedKg: z.string().nullable(),
      pickupConfirmedAt: z.string().nullable(),
      pickupConfirmationMethod: HandoverMethodE.schema.nullable(),
      exceptionReason: z.string().nullable(),
      deliveredAt: z.string().nullable(),
    })
    .nullable(),
  cancelled: z.object({ at: z.string(), by: BookingPartyE.schema.nullable(), reason: z.string().nullable() }).nullable(),
  incidents: z.array(
    z.object({
      id: uuid,
      kind: IncidentKindE.schema,
      status: z.enum(['OPEN', 'RESOLVED']),
      blocking: z.boolean(),
      description: z.string(),
      recoveryAction: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  timeline: z.array(timelineEventSchema),
  isDemo: z.boolean(),
});
export type BookingDetail = z.infer<typeof bookingDetailSchema>;

// ───────────── Booking actions ─────────────

export const confirmTermsSchema = z.object({
  termsVersionId: uuid,
  contentHash: z.string().length(64),
  /** Acting farmer profile when a cooperative representative confirms. */
  actingForFarmerId: uuid.optional(),
});

export const cancelBookingSchema = z.object({ expectedVersion: z.number().int().min(1), reason: reasonText });
export const approveDraftSchema = z.object({ expectedVersion: z.number().int().min(1) });

export const proposeAmendmentSchema = z.object({
  baseVersionNo: z.number().int().min(1),
  reason: reasonText,
  quantityKg: positiveKgString.optional(),
  priceKoboPerKg: positiveKoboInt.optional(),
  plannedHarvestDate: z.iso.date().optional(),
  pickupWindowStart: z.iso.datetime({ offset: true }).optional(),
  pickupWindowEnd: z.iso.datetime({ offset: true }).optional(),
  deliveryWindowStart: z.iso.datetime({ offset: true }).optional(),
  deliveryWindowEnd: z.iso.datetime({ offset: true }).optional(),
  toleranceBps: z.number().int().min(0).max(5000).optional(),
  paymentTermsDays: z.number().int().min(0).max(180).optional(),
});

export const decideAmendmentSchema = z.object({
  termsVersionId: uuid,
  contentHash: z.string().length(64),
  decision: z.enum(['ACCEPT', 'REJECT']),
  reason: optionalText(1000),
});

export const startHarvestSchema = z.object({ expectedVersion: z.number().int().min(1) });
export const readyForPickupSchema = z.object({ reportedHarvestedKg: positiveKgString, note: optionalText(500) });

export const openIncidentSchema = z.object({
  kind: IncidentKindE.schema,
  description: z.string().trim().min(10).max(2000),
  blocking: z.boolean().default(true),
});
export const resolveIncidentSchema = z.object({ recoveryAction: z.string().trim().min(10).max(2000) });

export const messageSchema = z.object({
  id: uuid,
  authorName: z.string(),
  authorParty: BookingPartyE.schema,
  actingForFarmer: z.boolean(),
  body: z.string(),
  createdAt: z.string(),
  mine: z.boolean(),
});
export const postMessageSchema = z.object({ body: z.string().trim().min(1).max(2000), actingForFarmerId: uuid.optional() });
