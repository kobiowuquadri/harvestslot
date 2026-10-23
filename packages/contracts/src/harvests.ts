import { z } from 'zod';
import { optionalText, reasonText, uuid } from './common.js';
import { FreightPayerE, HarvestRequestStatusE, OfferStatusE, ProposerPartyE, RejectionHandlingE, TransportPreferenceE } from './enums.js';
import { qualityTermsSchema } from './facilities.js';
import { isoDate, isoDateTime } from './time.js';
import { koboInt, positiveKgString, positiveKoboInt } from './units.js';

const harvestFields = {
  farmLocationId: uuid,
  estimatedQuantityKg: positiveKgString,
  /** Defaults to the estimated quantity; may be lower if part of the harvest is not for sale. */
  eligibleQuantityKg: positiveKgString.optional(),
  earliestHarvestDate: isoDate,
  latestHarvestDate: isoDate,
  variety: optionalText(80),
  cropAgeMonths: z.number().int().min(0).max(60).optional(),
  notes: optionalText(1000),
  minPriceKoboPerKg: koboInt.optional(),
  transportPreference: TransportPreferenceE.schema.default('PROCESSOR_PAYS'),
  maxDistanceKm: z.number().int().min(1).max(500).optional(),
};

function harvestRefinements<T extends z.ZodType<{ earliestHarvestDate?: string; latestHarvestDate?: string; estimatedQuantityKg?: string; eligibleQuantityKg?: string }>>(schema: T) {
  return schema
    .refine((v) => !v.earliestHarvestDate || !v.latestHarvestDate || v.latestHarvestDate >= v.earliestHarvestDate, {
      message: 'Latest date must be on or after the earliest date',
      path: ['latestHarvestDate'],
    })
    .refine(
      (v) =>
        !v.earliestHarvestDate ||
        !v.latestHarvestDate ||
        (new Date(v.latestHarvestDate).getTime() - new Date(v.earliestHarvestDate).getTime()) / 86_400_000 <= 60,
      { message: 'Keep the acceptable dates within 60 days', path: ['latestHarvestDate'] },
    )
    .refine(
      (v) =>
        !v.eligibleQuantityKg || !v.estimatedQuantityKg || Number(v.eligibleQuantityKg) <= Number(v.estimatedQuantityKg),
      { message: 'Quantity for sale cannot exceed the estimated harvest', path: ['eligibleQuantityKg'] },
    );
}

export const createHarvestSchema = harvestRefinements(
  z.object({
    ...harvestFields,
    /** Offline draft id; makes draft sync idempotent. */
    clientDraftId: z.string().uuid().optional(),
    publish: z.boolean().default(false),
  }),
);
export type CreateHarvestInput = z.infer<typeof createHarvestSchema>;

export const updateHarvestSchema = harvestRefinements(
  z.object({ ...harvestFields, expectedVersion: z.number().int().min(1) }).partial().required({ expectedVersion: true }),
);
export type UpdateHarvestInput = z.infer<typeof updateHarvestSchema>;

export const closeHarvestSchema = z.object({ expectedVersion: z.number().int().min(1), reason: reasonText });

export const harvestAllocationSchema = z.object({
  eligibleKg: z.string(),
  allocatedKg: z.string(),
  remainingKg: z.string(),
  state: z.enum(['UNALLOCATED', 'PARTIAL', 'FULL']),
});

export const harvestSchema = z.object({
  id: uuid,
  reference: z.string(),
  farmerProfileId: uuid,
  farmerName: z.string(),
  farmLocation: z.object({ id: uuid, label: z.string(), lga: z.string(), community: z.string().nullable() }),
  status: HarvestRequestStatusE.schema,
  estimatedQuantityKg: z.string(),
  eligibleQuantityKg: z.string(),
  earliestHarvestDate: z.string(),
  latestHarvestDate: z.string(),
  variety: z.string().nullable(),
  cropAgeMonths: z.number().nullable(),
  notes: z.string().nullable(),
  minPriceKoboPerKg: z.number().nullable(),
  transportPreference: TransportPreferenceE.schema,
  maxDistanceKm: z.number().nullable(),
  allocation: harvestAllocationSchema,
  openOffers: z.number(),
  bookings: z.number(),
  createdBy: z.object({ userId: uuid, displayName: z.string(), viaCooperative: z.string().nullable() }),
  publishedAt: z.string().nullable(),
  isDemo: z.boolean(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HarvestDto = z.infer<typeof harvestSchema>;

export const harvestListQuerySchema = z.object({
  status: HarvestRequestStatusE.schema.optional(),
  farmerProfileId: uuid.optional(),
});

/** Processor inbox: published requests eligible for at least one of the organisation's facilities. */
export const inboxItemSchema = z.object({
  harvestRequestId: uuid,
  reference: z.string(),
  farmerName: z.string(),
  lga: z.string(),
  community: z.string().nullable(),
  approx: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  remainingKg: z.string(),
  earliestHarvestDate: z.string(),
  latestHarvestDate: z.string(),
  minPriceKoboPerKg: z.number().nullable(),
  transportPreference: TransportPreferenceE.schema,
  variety: z.string().nullable(),
  invited: z.boolean(),
  bestFacility: z.object({ facilityId: uuid, facilityName: z.string(), straightLineKm: z.number(), score: z.number() }),
  existingOfferId: uuid.nullable(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

// ───────────── Offers ─────────────

const offerTermsFields = {
  slotId: uuid,
  quantityKg: positiveKgString,
  priceKoboPerKg: positiveKoboInt,
  plannedHarvestDate: isoDate,
  pickupWindowStart: isoDateTime,
  pickupWindowEnd: isoDateTime,
  deliveryWindowStart: isoDateTime,
  deliveryWindowEnd: isoDateTime,
  qualityTerms: qualityTermsSchema,
  toleranceBps: z.number().int().min(0).max(5000),
  paymentTermsDays: z.number().int().min(0).max(180),
  freightPayer: FreightPayerE.schema.default('PROCESSOR'),
  rejectionHandling: RejectionHandlingE.schema,
  cancellationTerms: z.string().trim().min(5).max(1000),
  note: optionalText(1000),
};

function windowRefinements<T extends z.ZodType<{ pickupWindowStart: string; pickupWindowEnd: string; deliveryWindowStart: string; deliveryWindowEnd: string }>>(schema: T) {
  return schema
    .refine((v) => new Date(v.pickupWindowEnd) > new Date(v.pickupWindowStart), {
      message: 'Pickup window must end after it starts',
      path: ['pickupWindowEnd'],
    })
    .refine((v) => new Date(v.deliveryWindowEnd) > new Date(v.deliveryWindowStart), {
      message: 'Delivery window must end after it starts',
      path: ['deliveryWindowEnd'],
    })
    .refine((v) => new Date(v.deliveryWindowEnd) > new Date(v.pickupWindowStart), {
      message: 'Delivery must be after pickup',
      path: ['deliveryWindowEnd'],
    });
}

export const createOfferSchema = windowRefinements(
  z.object({
    harvestRequestId: uuid,
    ...offerTermsFields,
    /** Hours the offer (and its capacity hold) stays open; capped by policy. */
    validForHours: z.number().int().min(1).max(336).optional(),
  }),
);
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const reviseOfferSchema = windowRefinements(
  z.object({ ...offerTermsFields, expectedVersionNo: z.number().int().min(1) }),
);

export const counterOfferSchema = z.object({
  expectedVersionNo: z.number().int().min(1),
  quantityKg: positiveKgString,
  priceKoboPerKg: positiveKoboInt,
  plannedHarvestDate: isoDate,
  note: optionalText(1000),
});

export const decideOfferSchema = z.object({
  expectedVersionNo: z.number().int().min(1),
  reason: optionalText(1000),
});

export const offerVersionSchema = z.object({
  versionNo: z.number(),
  proposedBy: ProposerPartyE.schema,
  proposedByName: z.string(),
  actingForFarmer: z.boolean(),
  slotId: uuid,
  slot: z.object({ startsAt: z.string(), endsAt: z.string(), lineName: z.string() }),
  quantityKg: z.string(),
  priceKoboPerKg: z.number(),
  plannedHarvestDate: z.string(),
  pickupWindowStart: z.string(),
  pickupWindowEnd: z.string(),
  deliveryWindowStart: z.string(),
  deliveryWindowEnd: z.string(),
  qualityTerms: qualityTermsSchema,
  toleranceBps: z.number(),
  paymentTermsDays: z.number(),
  freightPayer: FreightPayerE.schema,
  rejectionHandling: RejectionHandlingE.schema,
  cancellationTerms: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  estimatedProduceAmountKobo: z.number(),
});
export type OfferVersionDto = z.infer<typeof offerVersionSchema>;

export const offerSchema = z.object({
  id: uuid,
  harvestRequestId: uuid,
  harvestReference: z.string(),
  farmerName: z.string(),
  processorOrgId: uuid,
  processorName: z.string(),
  processorVerified: z.boolean(),
  facility: z.object({ id: uuid, name: z.string(), lga: z.string() }),
  status: OfferStatusE.schema,
  expiresAt: z.string(),
  currentVersionNo: z.number(),
  current: offerVersionSchema,
  versions: z.array(offerVersionSchema),
  /** Who must act next. */
  awaiting: z.enum(['FARMER', 'PROCESSOR', 'NONE']),
  hold: z.object({ status: z.string(), quantityKg: z.string(), expiresAt: z.string().nullable() }).nullable(),
  straightLineKm: z.number().nullable(),
  bookingId: uuid.nullable(),
  decisionReason: z.string().nullable(),
  isDemo: z.boolean(),
  version: z.number(),
  createdAt: z.string(),
});
export type OfferDto = z.infer<typeof offerSchema>;

export const acceptOfferResultSchema = z.object({ bookingId: uuid, bookingReference: z.string(), status: z.string() });
