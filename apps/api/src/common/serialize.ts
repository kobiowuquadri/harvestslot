import { dbDateToString, gramsToKgString, toGrams } from '@harvestslot/contracts';

/** Prisma Decimal (or null) → canonical 3-dp kilogram string. */
export function kg(value: { toString(): string }): string;
export function kg(value: { toString(): string } | null | undefined): string | null;
export function kg(value: { toString(): string } | null | undefined): string | null {
  return value === null || value === undefined ? null : gramsToKgString(toGrams(value));
}

/** BigInt kobo → JSON-safe number. */
export function kobo(value: bigint): number;
export function kobo(value: bigint | null | undefined): number | null;
export function kobo(value: bigint | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Amount exceeds safe integer range');
  return Number(value);
}

export function iso(value: Date): string;
export function iso(value: Date | null | undefined): string | null;
export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function day(value: Date): string {
  return dbDateToString(value);
}

export function num(value: { toString(): string } | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value.toString());
}
