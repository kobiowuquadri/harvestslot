import type { Env } from '@harvestslot/config';
import type { Db } from '@harvestslot/db';

export interface MatchingWeights {
  netValue: number;
  schedule: number;
  distance: number;
  capacityFit: number;
  reliability: number;
}

export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  netValue: 0.35,
  schedule: 0.2,
  distance: 0.2,
  capacityFit: 0.15,
  reliability: 0.1,
};

/** Business policies: environment defaults, overridable by administrators (platform_settings). */
export interface Policies {
  platformFeeEnabled: boolean;
  platformFeeBps: number;
  offerHoldHours: number;
  bookingConfirmationHoldHours: number;
  transportBufferMinutes: number;
  handoverCodeTtlMinutes: number;
  receivingReviewHours: number;
  disputeResponseHours: number;
  matchingWeights: MatchingWeights;
  /** Minimum completed bookings before an organisation's punctuality is used for ranking. */
  reliabilityMinHistory: number;
}

export function policiesFromEnv(env: Env): Policies {
  return {
    platformFeeEnabled: env.PLATFORM_FEE_ENABLED,
    platformFeeBps: env.PLATFORM_FEE_BPS,
    offerHoldHours: env.OFFER_HOLD_HOURS,
    bookingConfirmationHoldHours: env.BOOKING_CONFIRMATION_HOLD_HOURS,
    transportBufferMinutes: env.TRANSPORT_BUFFER_MINUTES,
    handoverCodeTtlMinutes: env.HANDOVER_CODE_TTL_MINUTES,
    receivingReviewHours: env.RECEIVING_REVIEW_HOURS,
    disputeResponseHours: env.DISPUTE_RESPONSE_HOURS,
    matchingWeights: DEFAULT_MATCHING_WEIGHTS,
    reliabilityMinHistory: 5,
  };
}

const OVERRIDABLE: Array<keyof Policies> = [
  'platformFeeEnabled',
  'platformFeeBps',
  'offerHoldHours',
  'bookingConfirmationHoldHours',
  'transportBufferMinutes',
  'receivingReviewHours',
  'disputeResponseHours',
  'matchingWeights',
];

export function validatePolicyValue(key: string, value: unknown): string | null {
  const intIn = (min: number, max: number) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? null : `${key} must be an integer between ${min} and ${max}`;
  switch (key) {
    case 'platformFeeEnabled':
      return typeof value === 'boolean' ? null : 'platformFeeEnabled must be true or false';
    case 'platformFeeBps':
      return intIn(0, 2000);
    case 'offerHoldHours':
    case 'bookingConfirmationHoldHours':
      return intIn(1, 336);
    case 'transportBufferMinutes':
      return intIn(0, 1440);
    case 'receivingReviewHours':
      return intIn(1, 336);
    case 'disputeResponseHours':
      return intIn(1, 720);
    case 'matchingWeights': {
      if (!value || typeof value !== 'object') return 'matchingWeights must be an object';
      const w = value as Record<string, unknown>;
      const keys = Object.keys(DEFAULT_MATCHING_WEIGHTS);
      if (!keys.every((k) => typeof w[k] === 'number' && (w[k] as number) >= 0 && (w[k] as number) <= 1)) {
        return `matchingWeights needs numbers 0–1 for ${keys.join(', ')}`;
      }
      const sum = keys.reduce((s, k) => s + (w[k] as number), 0);
      return Math.abs(sum - 1) < 0.001 ? null : 'matchingWeights must sum to 1';
    }
    default:
      return `${key} cannot be changed`;
  }
}

export async function loadPolicies(db: Db, env: Env): Promise<Policies> {
  const base = policiesFromEnv(env);
  const rows = await db.platformSetting.findMany({ where: { key: { in: OVERRIDABLE as string[] } } });
  const overrides: Partial<Policies> = {};
  for (const row of rows) {
    if (validatePolicyValue(row.key, row.value) === null) {
      (overrides as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return { ...base, ...overrides };
}
