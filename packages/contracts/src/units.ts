import { z } from 'zod';

/**
 * Units and money.
 *
 * - Quantities travel as decimal strings in kilograms with at most 3 decimal places. Arithmetic is done
 *   in integer grams (bigint) so it is exact.
 * - Money travels as integer kobo (NGN minor unit). Arithmetic uses bigint; never floating point.
 * - Rounding is defined once here (`roundHalfUpDiv`) and used by every calculation.
 */

export const QUANTITY_DECIMALS = 3;
export const GRAMS_PER_KG = 1000n;
export const MAX_QUANTITY_KG = 100_000_000; // 100,000 tonnes: far above any single harvest or slot

const KG_PATTERN = /^(0|[1-9]\d{0,10})(\.\d{1,3})?$/;

/** Decimal-string kilograms, ≥ 0, max 3 decimal places, e.g. "2000", "1800.5", "0.250". */
export const kgString = z
  .string()
  .trim()
  .regex(KG_PATTERN, 'Enter kilograms as a number with at most 3 decimal places')
  .refine((v) => Number(v) <= MAX_QUANTITY_KG, 'Quantity is unrealistically large');

/** Strictly positive kilograms. */
// Zod keeps running checks after a failed regex, so this must not assume the pattern matched.
export const positiveKgString = kgString.refine((v) => !KG_PATTERN.test(v) || kgToGrams(v) > 0n, 'Quantity must be greater than zero');

/** Integer kobo, non-negative, within JS safe-integer range. */
export const koboInt = z
  .number()
  .int('Amounts are whole kobo')
  .min(0, 'Amount cannot be negative')
  .max(Number.MAX_SAFE_INTEGER);

export const positiveKoboInt = koboInt.refine((v) => v > 0, 'Amount must be greater than zero');

/** Basis points 0–10,000 (100%). */
export const bpsInt = z.number().int().min(0).max(10_000);

export function kgToGrams(kg: string): bigint {
  const trimmed = kg.trim();
  if (!KG_PATTERN.test(trimmed)) throw new RangeError(`Invalid kilogram value: ${kg}`);
  const [whole, fraction = ''] = trimmed.split('.');
  return BigInt(whole!) * GRAMS_PER_KG + BigInt(fraction.padEnd(QUANTITY_DECIMALS, '0'));
}

/** Accepts any decimal-like value with ≤ 3 dp (Prisma Decimal, number, string); throws on more precision. */
export function toGrams(value: { toString(): string } | number | string): bigint {
  const s = typeof value === 'number' ? value.toFixed(QUANTITY_DECIMALS) : value.toString();
  const negative = s.startsWith('-');
  const body = negative ? s.slice(1) : s;
  const [whole, fraction = ''] = body.split('.');
  if (!/^\d+$/.test(whole ?? '') || !/^\d*$/.test(fraction)) throw new RangeError(`Invalid quantity: ${s}`);
  const significant = fraction.replace(/0+$/, '');
  if (significant.length > QUANTITY_DECIMALS) throw new RangeError(`Quantity has more than 3 decimal places: ${s}`);
  const grams = BigInt(whole!) * GRAMS_PER_KG + BigInt(significant.padEnd(QUANTITY_DECIMALS, '0'));
  return negative ? -grams : grams;
}

/** Canonical API representation: fixed 3 decimal places, e.g. 1800000n → "1800.000". */
export function gramsToKgString(grams: bigint): string {
  const negative = grams < 0n;
  const abs = negative ? -grams : grams;
  const whole = abs / GRAMS_PER_KG;
  const fraction = (abs % GRAMS_PER_KG).toString().padStart(QUANTITY_DECIMALS, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Normalise any kilogram value to the canonical 3-dp string. */
export function normaliseKg(value: { toString(): string } | string): string {
  return gramsToKgString(toGrams(value));
}

/**
 * Integer division rounding half away from zero ("round half up" for non-negative values).
 * This is the single rounding rule for all money and quantity derivations.
 */
export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('Denominator must be positive');
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = abs / denominator;
  const remainder = abs % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Produce amount = accepted quantity × unit price, rounded to the nearest kobo. */
export function produceAmountKobo(acceptedGrams: bigint, priceKoboPerKg: bigint): bigint {
  if (acceptedGrams < 0n || priceKoboPerKg < 0n) throw new RangeError('Quantity and price must be non-negative');
  return roundHalfUpDiv(acceptedGrams * priceKoboPerKg, GRAMS_PER_KG);
}

/** Percentage fee in basis points, rounded to the nearest kobo. */
export function bpsOfKobo(amountKobo: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0) throw new RangeError('bps must be a non-negative integer');
  return roundHalfUpDiv(amountKobo * BigInt(bps), 10_000n);
}

/** Tolerance band in grams, e.g. ±5% of the contracted quantity. */
export function toleranceGrams(contractedGrams: bigint, toleranceBps: number): bigint {
  return roundHalfUpDiv(contractedGrams * BigInt(toleranceBps), 10_000n);
}

export interface FarmerNetEstimate {
  produceAmountKobo: bigint;
  farmerPaidFreightKobo: bigint;
  otherFarmerChargesKobo: bigint;
  estimatedNetKobo: bigint;
}

/** Estimated farmer net. Always presented as an estimate, separate from invoices and receipts. */
export function estimateFarmerNet(input: {
  quantityGrams: bigint;
  priceKoboPerKg: bigint;
  freightKobo?: bigint | null;
  freightPayer: 'PROCESSOR' | 'FARMER';
  otherFarmerChargesKobo?: bigint;
}): FarmerNetEstimate {
  const produce = produceAmountKobo(input.quantityGrams, input.priceKoboPerKg);
  const freight = input.freightPayer === 'FARMER' ? (input.freightKobo ?? 0n) : 0n;
  const other = input.otherFarmerChargesKobo ?? 0n;
  return {
    produceAmountKobo: produce,
    farmerPaidFreightKobo: freight,
    otherFarmerChargesKobo: other,
    estimatedNetKobo: produce - freight - other,
  };
}

export function koboToNumber(kobo: bigint): number {
  if (kobo > BigInt(Number.MAX_SAFE_INTEGER) || kobo < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('Amount exceeds safe integer range');
  }
  return Number(kobo);
}

// ───────────── Display formatting (en-NG) ─────────────

const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₦450,000.00 — formats kobo exactly (string-based, no float division of large values). */
export function formatNaira(kobo: number | bigint): string {
  const k = typeof kobo === 'bigint' ? kobo : BigInt(Math.trunc(kobo));
  const negative = k < 0n;
  const abs = negative ? -k : k;
  const naira = abs / 100n;
  const rest = (abs % 100n).toString().padStart(2, '0');
  const grouped = naira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}₦${grouped}.${rest}`;
}

/** Same as formatNaira but via Intl for small values where locale nuances matter (kept for parity tests). */
export function formatNairaIntl(kobo: number): string {
  return nairaFormatter.format(kobo / 100);
}

/** Price per kilogram, e.g. "₦250.00/kg". */
export function formatPricePerKg(koboPerKg: number | bigint): string {
  return `${formatNaira(koboPerKg)}/kg`;
}

function groupDecimal(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** "1,800 kg" / "1,800.5 kg". Kilograms are canonical. */
export function formatKg(kg: string | bigint): string {
  const grams = typeof kg === 'bigint' ? kg : toGrams(kg);
  const s = gramsToKgString(grams).replace(/\.?0+$/, '');
  return `${groupDecimal(s)} kg`;
}

/** Optional tonne display, e.g. "1.8 t" (display only; never used for storage or arithmetic). */
export function formatTonnes(kg: string | bigint, maxDecimals = 2): string {
  const grams = typeof kg === 'bigint' ? kg : toGrams(kg);
  const scale = 10n ** BigInt(maxDecimals);
  const t = roundHalfUpDiv(grams * scale, 1_000_000n);
  const whole = t / scale;
  const frac = (t % scale).toString().padStart(maxDecimals, '0').replace(/0+$/, '');
  return `${groupDecimal(frac ? `${whole}.${frac}` : `${whole}`)} t`;
}

/** Converts tonnes typed by a user to a kilogram string, refusing more than 3 kg-decimal places of precision. */
export function tonnesToKgString(tonnes: string): string {
  const m = /^(\d{1,8})(?:\.(\d{1,6}))?$/.exec(tonnes.trim());
  if (!m) throw new RangeError('Enter tonnes as a number with at most 6 decimal places');
  const grams = BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0'));
  return gramsToKgString(grams);
}
