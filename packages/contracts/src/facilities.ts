import { z } from 'zod';
import { lgaName, nigeriaPoint, optionalText, reasonText, shortText, uuid } from './common.js';
import { FacilityStatusE, LineStatusE, ProcessingProductE, RejectionHandlingE, SlotStatusE } from './enums.js';
import { cropCode } from './crops.js';
import { isoDateTime } from './time.js';
import { kgString, koboInt, positiveKgString } from './units.js';

/** Structured purchase requirements. Photos never certify these; they are checked on receipt. */
export const qualityTermsSchema = z.object({
  maxHoursHarvestToDelivery: z.number().int().min(1).max(168),
  soilAndStemsRemoved: z.boolean(),
  maxVisibleRotPercent: z.number().int().min(0).max(100).optional(),
  minRootLengthCm: z.number().int().min(0).max(150).optional(),
  varietiesAccepted: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  notes: optionalText(500),
});
export type QualityTerms = z.infer<typeof qualityTermsSchema>;

export const facilityInputSchema = z.object({
  name: shortText(120),
  lga: lgaName,
  address: optionalText(300),
  point: nigeriaPoint,
  qualityCriteria: qualityTermsSchema,
  minOrderKg: kgString,
  maxPickupDistanceKm: z.number().int().min(1).max(500),
  indicativePriceKoboPerKg: koboInt.optional(),
  defaultToleranceBps: z.number().int().min(0).max(5000).default(500),
  defaultPaymentTermsDays: z.number().int().min(0).max(180).default(7),
  rejectionHandling: RejectionHandlingE.schema.default('RETURNED_AT_PROCESSOR_COST'),
  cancellationTerms: shortText(1000),
});
export type FacilityInput = z.infer<typeof facilityInputSchema>;

export const updateFacilitySchema = facilityInputSchema.partial().extend({
  expectedVersion: z.number().int().min(1),
  status: FacilityStatusE.schema.optional(),
});

/** A line buys one crop; its product must be one that crop can make (checked by the API). */
export const lineInputSchema = z.object({ name: shortText(80), crop: cropCode.default('CASSAVA'), product: ProcessingProductE.schema });
export const updateLineSchema = lineInputSchema.omit({ crop: true }).partial().extend({
  expectedVersion: z.number().int().min(1),
  status: LineStatusE.schema.optional(),
});

export const lineSchema = z.object({
  id: uuid,
  facilityId: uuid,
  name: z.string(),
  crop: z.string(),
  product: ProcessingProductE.schema,
  status: LineStatusE.schema,
  version: z.number(),
});

export const facilitySchema = z.object({
  id: uuid,
  organisationId: uuid,
  organisationName: z.string(),
  name: z.string(),
  lga: z.string(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  status: FacilityStatusE.schema,
  qualityCriteria: qualityTermsSchema,
  minOrderKg: z.string(),
  maxPickupDistanceKm: z.number(),
  indicativePriceKoboPerKg: z.number().nullable(),
  defaultToleranceBps: z.number(),
  defaultPaymentTermsDays: z.number(),
  rejectionHandling: RejectionHandlingE.schema,
  cancellationTerms: z.string(),
  isDemo: z.boolean(),
  version: z.number(),
  lines: z.array(lineSchema),
});
export type FacilityDto = z.infer<typeof facilitySchema>;

const slotWindow = z
  .object({ startsAt: isoDateTime, endsAt: isoDateTime })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: 'End must be after start', path: ['endsAt'] })
  .refine((v) => new Date(v.endsAt).getTime() - new Date(v.startsAt).getTime() <= 7 * 24 * 3600_000, {
    message: 'A slot can be at most 7 days long',
    path: ['endsAt'],
  });

export const createSlotSchema = z
  .object({
    lineId: uuid,
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    processingCapacityKg: positiveKgString,
    purchaseLimitKg: kgString,
    notes: optionalText(500),
    publish: z.boolean().default(false),
  })
  .and(slotWindow);
export type CreateSlotInput = z.infer<typeof createSlotSchema>;

/** Creates the same window on consecutive days (e.g. a week of 08:00–16:00 slots). */
export const createSlotSeriesSchema = z.object({
  lineId: uuid,
  firstDate: z.iso.date(),
  days: z.number().int().min(1).max(31),
  startHour: z.number().int().min(0).max(23),
  durationHours: z.number().int().min(1).max(24),
  processingCapacityKg: positiveKgString,
  purchaseLimitKg: kgString,
  publish: z.boolean().default(false),
});

export const adjustCapacitySchema = z.object({
  expectedVersion: z.number().int().min(1),
  processingCapacityKg: kgString,
  purchaseLimitKg: kgString,
  reason: reasonText,
});

export const closeSlotSchema = z.object({ expectedVersion: z.number().int().min(1), reason: reasonText });

export const slotUsageSchema = z.object({
  limitKg: z.string(),
  heldKg: z.string(),
  committedKg: z.string(),
  consumedKg: z.string(),
  availableKg: z.string(),
});
export type SlotUsage = z.infer<typeof slotUsageSchema>;

export const slotSchema = z.object({
  id: uuid,
  lineId: uuid,
  lineName: z.string(),
  crop: z.string(),
  product: ProcessingProductE.schema,
  facilityId: uuid,
  facilityName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  processingCapacityKg: z.string(),
  purchaseLimitKg: z.string(),
  status: SlotStatusE.schema,
  publishedAt: z.string().nullable(),
  notes: z.string().nullable(),
  closedReason: z.string().nullable(),
  usage: slotUsageSchema,
  bookingsCount: z.number(),
  isDemo: z.boolean(),
  version: z.number(),
  /** When the usage figures were computed; clients must not present older data as live. */
  asOf: z.string(),
});
export type SlotDto = z.infer<typeof slotSchema>;

export const slotsQuerySchema = z.object({
  facilityId: uuid.optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  status: SlotStatusE.schema.optional(),
});

/**
 * "Tell farmers what you buy, how much you can receive, where, and on which dates." One form: the crop,
 * an existing place or a new one described here (created on first use), a date range and a quantity.
 */
export const buyingSlotSchema = z
  .object({
    crop: cropCode.default('CASSAVA'),
    facilityId: uuid.optional(),
    newFacility: z.object({ name: shortText(120), lga: lgaName, address: optionalText(300), point: nigeriaPoint.optional() }).optional(),
    fromDate: z.iso.date(),
    toDate: z.iso.date(),
    quantityKg: positiveKgString,
    /** The price per kg you expect to pay, shown to farmers as a guide (the offer sets the real price). */
    priceKoboPerKg: koboInt.optional(),
    notes: optionalText(500),
  })
  .refine((v) => v.facilityId || v.newFacility, { message: 'Tell farmers where to bring or where you collect from', path: ['facilityId'] })
  .refine((v) => v.toDate >= v.fromDate, { message: 'The last day must be on or after the first day', path: ['toDate'] })
  .refine((v) => (new Date(v.toDate).getTime() - new Date(v.fromDate).getTime()) / 86_400_000 < 7, { message: 'A buying slot can cover at most 7 days', path: ['toDate'] });
export type BuyingSlotInput = z.infer<typeof buyingSlotSchema>;
