import { z } from 'zod';
import { optionalText, reasonText, shortText, uuid } from './common.js';
import { CropRequestStatusE, ProcessingProductE, type ProcessingProduct } from './enums.js';
import type { QualityTerms } from './facilities.js';

/**
 * Crops are data, managed by administrators (`crops` table): nothing in the code lists them.
 * A harvest and a buyer intake line each name one crop by its code, e.g. `CASSAVA`, `TOMATO`.
 */
export type Crop = string;
export const cropCode = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use capital letters, digits and _ (for example OKRA)');

export const cropSchema = z.object({
  code: z.string(),
  label: z.string(),
  /** The word used inside sentences: "cassava", "tomatoes". */
  noun: z.string(),
  nounIsPlural: z.boolean(),
  /** What the farmer hands over: "fresh roots". */
  produce: z.string(),
  /** One line on why the timing matters. */
  why: z.string(),
  maxHoursHarvestToDelivery: z.number(),
  soilAndStemsRemoved: z.boolean(),
  qualityNotes: z.string().nullable(),
  products: z.array(ProcessingProductE.schema),
  active: z.boolean(),
  sortOrder: z.number(),
});
export type CropDto = z.infer<typeof cropSchema>;

/** An administrator adds a crop: available to farmers and buyers at once, no release needed. */
export const cropInputSchema = z.object({
  /** Derived from the label when left out (e.g. "Garden eggs" → GARDEN_EGGS). */
  code: cropCode.optional(),
  label: shortText(40),
  noun: shortText(40),
  nounIsPlural: z.boolean().default(false),
  produce: shortText(60),
  why: shortText(160),
  maxHoursHarvestToDelivery: z.number().int().min(1).max(168).default(48),
  soilAndStemsRemoved: z.boolean().default(false),
  qualityNotes: optionalText(300),
  products: z.array(ProcessingProductE.schema).min(1).max(10).default(['OTHER']),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(100),
  /** Open "ask for this crop" requests this crop answers; their farmers are told it can now be listed. */
  answersRequestIds: z.array(uuid).max(200).default([]),
});
export type CropInput = z.infer<typeof cropInputSchema>;

export const cropUpdateSchema = cropInputSchema.omit({ code: true, answersRequestIds: true }).partial();

/** "My crop isn't listed": a farmer asks for a crop. */
export const cropRequestInputSchema = z.object({ name: shortText(60), note: optionalText(300) });

export const cropRequestSchema = z.object({
  id: uuid,
  name: z.string(),
  nameKey: z.string(),
  note: z.string().nullable(),
  status: CropRequestStatusE.schema,
  requestedByName: z.string(),
  lga: z.string().nullable(),
  resolvedCropCode: z.string().nullable(),
  createdAt: z.string(),
  isDemo: z.boolean(),
});
export type CropRequestDto = z.infer<typeof cropRequestSchema>;

export const dismissCropRequestsSchema = z.object({ nameKey: z.string().min(1).max(60), reason: reasonText });

/** "Garden eggs" → "GARDEN_EGGS". */
export function cropCodeFromLabel(label: string): string {
  const code = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 40);
  return /^[A-Z]/.test(code) ? code : `CROP_${code}`.slice(0, 40);
}

/** Lower-case name used to group requests for the same crop ("Okra ", "okra" → "okra"). */
export function cropNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
}

/** Wording for a crop whose details are not loaded (an old record, or a crop switched off). */
export function cropFallback(code: string): Pick<CropDto, 'code' | 'label' | 'noun' | 'nounIsPlural' | 'produce' | 'products'> {
  const words = code.toLowerCase().replace(/_/g, ' ');
  return { code, label: words.charAt(0).toUpperCase() + words.slice(1), noun: words, nounIsPlural: false, produce: 'fresh produce', products: ['OTHER'] };
}

/** "is"/"are" for the crop's noun: "the cassava is", "the tomatoes are". */
export const cropVerb = (c: Pick<CropDto, 'nounIsPlural'>): 'is' | 'are' => (c.nounIsPlural ? 'are' : 'is');

/** Default purchase terms a buyer's new place starts with for this crop (the buyer can change them). */
export function qualityForCrop(c: Pick<CropDto, 'maxHoursHarvestToDelivery' | 'soilAndStemsRemoved' | 'qualityNotes'>): QualityTerms {
  return {
    maxHoursHarvestToDelivery: c.maxHoursHarvestToDelivery,
    soilAndStemsRemoved: c.soilAndStemsRemoved,
    maxVisibleRotPercent: 5,
    varietiesAccepted: [],
    ...(c.qualityNotes ? { notes: c.qualityNotes } : {}),
  };
}

export const PRODUCT_LABELS: Record<ProcessingProduct, string> = {
  GARRI: 'Garri',
  FLOUR: 'Flour',
  STARCH: 'Starch',
  FUFU: 'Fufu',
  CHIPS: 'Chips',
  TOMATO_PASTE: 'Tomato paste',
  OTHER: 'Other',
};
