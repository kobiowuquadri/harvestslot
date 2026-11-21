import type { Crop, ProcessingProduct } from './enums.js';
import type { QualityTerms } from './facilities.js';

/** What HarvestSlot needs to know about each crop it supports. Matching only pairs the same crop. */
export interface CropInfo {
  /** "Cassava", "Tomatoes": headings and choices. */
  label: string;
  /** "cassava", "tomatoes": inside sentences ("2,000 kg of tomatoes"). */
  noun: string;
  /** What the farmer hands over: "fresh roots", "fresh tomatoes". */
  produce: string;
  /** Products a line buying this crop can make. */
  products: ProcessingProduct[];
  /** Name of the intake line created with a buyer's first buying slot for this crop. */
  intakeLineName: string;
  /** Purchase requirements a new place starts with (the buyer can change them). */
  defaultQuality: QualityTerms;
  /** Why the timing matters, in one line (shown when choosing the crop). */
  why: string;
}

export const CROPS: Record<Crop, CropInfo> = {
  CASSAVA: {
    label: 'Cassava',
    noun: 'cassava',
    produce: 'fresh roots',
    products: ['GARRI', 'FLOUR', 'STARCH', 'FUFU', 'CHIPS', 'OTHER'],
    intakeLineName: 'Cassava intake',
    defaultQuality: {
      maxHoursHarvestToDelivery: 48,
      soilAndStemsRemoved: true,
      maxVisibleRotPercent: 5,
      varietiesAccepted: [],
      notes: 'Fresh roots, harvested no more than 48 hours before delivery.',
    },
    why: 'Roots start to spoil within two to three days of being dug up.',
  },
  TOMATO: {
    label: 'Tomatoes',
    noun: 'tomatoes',
    produce: 'fresh tomatoes',
    products: ['TOMATO_PASTE', 'OTHER'],
    intakeLineName: 'Tomato intake',
    defaultQuality: {
      maxHoursHarvestToDelivery: 24,
      soilAndStemsRemoved: false,
      maxVisibleRotPercent: 5,
      varietiesAccepted: [],
      notes: 'Firm, ripe tomatoes in crates, picked no more than 24 hours before delivery.',
    },
    why: 'Ripe tomatoes bruise and soften within days, faster in the heat.',
  },
};

/** "cassava" / "tomatoes", for use inside a sentence. */
export const cropNoun = (crop: Crop): string => CROPS[crop].noun;

export const PRODUCT_LABELS: Record<ProcessingProduct, string> = {
  GARRI: 'Garri',
  FLOUR: 'Flour',
  STARCH: 'Starch',
  FUFU: 'Fufu',
  CHIPS: 'Chips',
  TOMATO_PASTE: 'Tomato paste',
  OTHER: 'Other',
};
