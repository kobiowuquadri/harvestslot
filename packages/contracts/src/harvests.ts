import { z } from 'zod';
import { lgaName, nigeriaPoint, optionalText, reasonText, shortText, uuid } from './common.js';
import { CropE, FreightPayerE, HandoverArrangementE, HarvestRequestStatusE, LocationSourceE, OfferStatusE, ProposerPartyE, RejectionHandlingE, TransportPreferenceE } from './enums.js';
import { qualityTermsSchema } from './facilities.js';
import { isoDate, isoDateTime } from './time.js';
import { koboInt, positiveKgString, positiveKoboInt } from './units.js';

/** A farm location created inline while adding a harvest ("Where is the harvest?"). */
export const newHarvestLocationSchema = z.object({
  label: shortText(80).optional(),
  lga: lgaName,
  community: optionalText(120),
  directions: optionalText(500),
  point: nigeriaPoint.optional(),
  accuracyM: z.number().int().min(0).max(100_000).optional(),
  source: LocationSourceE.schema.default('DESCRIPTION_ONLY'),
});

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
    /** What is for sale. Fixed once created: offers and bookings are made for this crop. */
    crop: CropE.schema.default('CASSAVA'),
    /** Either an existing farm location or a new one described in the same step. */
    farmLocationId: uuid.optional(),
    newLocation: newHarvestLocationSchema.optional(),
    /** Offline draft id; makes draft sync idempotent. */
    clientDraftId: z.string().uuid().optional(),
    publish: z.boolean().default(false),
  }),
).refine((v) => v.farmLocationId || v.newLocation, { message: 'Tell us where the harvest is', path: ['farmLocationId'] });
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
  crop: CropE.schema,
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
  /** Buyers the farmer asked for an offer, and where each request stands. */
  requests: z.array(
    z.object({
      facilityId: uuid,
      facilityName: z.string(),
      processorName: z.string(),
      sentAt: z.string(),
      status: z.enum(['WAITING_FOR_OFFER', 'OFFER_RECEIVED', 'DECLINED']),
      declineReason: z.string().nullable(),
      offerId: uuid.nullable(),
    }),
  ),
  /** What happens next for this harvest, in plain words. */
  nextStep: z.object({ stage: z.string(), forFarmer: z.string() }),
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
  crop: CropE.schema,
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
  farmLabel: z.string(),
  /** Set when the farmer sent this buyer a request directly. */
  request: z.object({ sentAt: z.string(), declinedAt: z.string().nullable() }).nullable(),
  /** This organisation's latest offer on the request (draft, sent, accepted…). */
  offer: z.object({ id: uuid, status: OfferStatusE.schema, versionNo: z.number(), bookingId: uuid.nullable() }).nullable(),
  /** The slot that fits best, used to prefill an offer. */
  bestSlot: z.object({ slotId: uuid, startsAt: z.string(), endsAt: z.string(), availableKg: z.string(), lineName: z.string() }).nullable(),
  /** What the buyer should do, e.g. "Review harvest request". */
  nextStep: z.string(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const declineRequestSchema = z.object({ facilityId: uuid.optional(), reason: reasonText });

// ───────────── Offers ─────────────

const offerTermsFields = {
  slotId: uuid,
  quantityKg: positiveKgString,
  priceKoboPerKg: positiveKoboInt,
  /** The agreed day: harvest for collection, or delivery to the facility. */
  plannedHarvestDate: isoDate,
  /** When the produce changes hands. Pickup and delivery windows are derived from it. */
  handoverWindowStart: isoDateTime.optional(),
  handoverWindowEnd: isoDateTime.optional(),
  /** Leaving this empty keeps the offer as a draft: it cannot be sent without a handover decision. */
  handoverArrangement: HandoverArrangementE.schema.optional(),
  /** Estimated delivery cost the farmer pays when they deliver (shown before acceptance). */
  farmerDeliveryCostKobo: koboInt.optional(),
  // Detailed windows and terms stay available; when omitted they come from the handover window and the facility defaults.
  pickupWindowStart: isoDateTime.optional(),
  pickupWindowEnd: isoDateTime.optional(),
  deliveryWindowStart: isoDateTime.optional(),
  deliveryWindowEnd: isoDateTime.optional(),
  qualityTerms: qualityTermsSchema.optional(),
  toleranceBps: z.number().int().min(0).max(5000).optional(),
  paymentTermsDays: z.number().int().min(0).max(180).optional(),
  freightPayer: FreightPayerE.schema.optional(),
  rejectionHandling: RejectionHandlingE.schema.optional(),
  cancellationTerms: z.string().trim().min(5).max(1000).optional(),
  note: optionalText(1000),
};

type WindowFields = {
  handoverWindowStart?: string;
  handoverWindowEnd?: string;
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
  handoverArrangement?: string;
  farmerDeliveryCostKobo?: number;
};

function windowRefinements<T extends z.ZodType<WindowFields>>(schema: T) {
  return schema
    .refine(
      (v) =>
        (v.handoverWindowStart && v.handoverWindowEnd) ||
        (v.pickupWindowStart && v.pickupWindowEnd && v.deliveryWindowStart && v.deliveryWindowEnd),
      { message: 'Choose when the produce changes hands', path: ['handoverWindowStart'] },
    )
    .refine((v) => !v.handoverWindowStart || !v.handoverWindowEnd || new Date(v.handoverWindowEnd) > new Date(v.handoverWindowStart), {
      message: 'The time window must end after it starts',
      path: ['handoverWindowEnd'],
    })
    .refine((v) => !v.pickupWindowStart || !v.pickupWindowEnd || new Date(v.pickupWindowEnd) > new Date(v.pickupWindowStart), {
      message: 'Pickup window must end after it starts',
      path: ['pickupWindowEnd'],
    })
    .refine((v) => !v.deliveryWindowStart || !v.deliveryWindowEnd || new Date(v.deliveryWindowEnd) > new Date(v.deliveryWindowStart), {
      message: 'Delivery window must end after it starts',
      path: ['deliveryWindowEnd'],
    })
    .refine((v) => v.farmerDeliveryCostKobo === undefined || v.farmerDeliveryCostKobo === 0 || v.handoverArrangement === 'FARMER_DELIVERS', {
      message: 'A delivery cost applies only when the farmer delivers',
      path: ['farmerDeliveryCostKobo'],
    });
}

export const createOfferSchema = windowRefinements(
  z.object({
    harvestRequestId: uuid,
    ...offerTermsFields,
    /** False saves a draft (not visible to the farmer, nothing reserved). */
    send: z.boolean().default(true),
    /** Hours the offer (and its capacity hold) stays open; capped by policy. */
    validForHours: z.number().int().min(1).max(336).optional(),
  }),
).refine((v) => !v.send || v.handoverArrangement, {
  message: 'Choose how the produce will get there, or save the offer as a draft',
  path: ['handoverArrangement'],
});
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const reviseOfferSchema = windowRefinements(
  z.object({ ...offerTermsFields, expectedVersionNo: z.number().int().min(1), send: z.boolean().default(false) }),
);

/** Sends a draft offer: checks it is complete, reserves capacity and notifies the farmer. */
export const sendOfferSchema = z.object({ expectedVersionNo: z.number().int().min(1), validForHours: z.number().int().min(1).max(336).optional() });

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
  handoverArrangement: HandoverArrangementE.schema.nullable(),
  farmerDeliveryCostKobo: z.number().nullable(),
  /** Where the produce changes hands: the farm for collection, the facility for delivery. */
  handoverPlace: z.string().nullable(),
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
  crop: CropE.schema,
  farmerProfileId: uuid,
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
