import { describe, expect, it } from 'vitest';
import {
  bpsOfKobo,
  estimateFarmerNet,
  formatKg,
  formatNaira,
  formatTonnes,
  gramsToKgString,
  kgString,
  kgToGrams,
  normaliseKg,
  positiveKgString,
  produceAmountKobo,
  roundHalfUpDiv,
  toGrams,
  toleranceGrams,
  tonnesToKgString,
} from '../src/units.js';
import { createHarvestSchema } from '../src/harvests.js';

describe('roundHalfUpDiv (the single rounding rule)', () => {
  it('rounds .5 up and below .5 down', () => {
    expect(roundHalfUpDiv(15n, 10n)).toBe(2n);
    expect(roundHalfUpDiv(14n, 10n)).toBe(1n);
    expect(roundHalfUpDiv(25n, 10n)).toBe(3n);
    expect(roundHalfUpDiv(10n, 10n)).toBe(1n);
    expect(roundHalfUpDiv(0n, 10n)).toBe(0n);
  });
  it('rounds negative values half away from zero', () => {
    expect(roundHalfUpDiv(-15n, 10n)).toBe(-2n);
    expect(roundHalfUpDiv(-14n, 10n)).toBe(-1n);
  });
  it('rejects non-positive denominators', () => {
    expect(() => roundHalfUpDiv(1n, 0n)).toThrow();
  });
});

describe('quantities', () => {
  it('converts kilograms to exact grams', () => {
    expect(kgToGrams('2000')).toBe(2_000_000n);
    expect(kgToGrams('1800.5')).toBe(1_800_500n);
    expect(kgToGrams('0.001')).toBe(1n);
    expect(gramsToKgString(1_800_500n)).toBe('1800.500');
    expect(normaliseKg('1900')).toBe('1900.000');
  });
  it('rejects more than three decimal places, negatives and junk', () => {
    expect(kgString.safeParse('1.2345').success).toBe(false);
    expect(kgString.safeParse('-1').success).toBe(false);
    expect(kgString.safeParse('1e3').success).toBe(false);
    expect(kgString.safeParse('01').success).toBe(false);
    expect(() => toGrams('1.0001')).toThrow();
  });
  it('accepts Prisma-style decimals with trailing zeros', () => {
    expect(toGrams('1800.000')).toBe(1_800_000n);
    expect(toGrams({ toString: () => '12.5' })).toBe(12_500n);
  });
  it('formats kilograms and tonnes for display only', () => {
    expect(formatKg('1800.000')).toBe('1,800 kg');
    expect(formatKg('1800.5')).toBe('1,800.5 kg');
    expect(formatTonnes('1800')).toBe('1.8 t');
    expect(formatTonnes('2000')).toBe('2 t');
    expect(formatTonnes('1234.567', 3)).toBe('1.235 t');
    expect(tonnesToKgString('1.8')).toBe('1800.000');
    expect(tonnesToKgString('0.0015')).toBe('1.500');
    expect(() => tonnesToKgString('1.0000001')).toThrow();
  });
  it('computes tolerance bands in grams', () => {
    expect(toleranceGrams(2_000_000n, 500)).toBe(100_000n); // 5% of 2,000 kg = 100 kg
    expect(toleranceGrams(1_000n, 333)).toBe(33n); // 33.3 g → 33 g
  });
});

describe('money', () => {
  it('produce amount = accepted quantity × price, rounded to kobo', () => {
    // 1,800 kg at ₦250/kg = ₦450,000
    expect(produceAmountKobo(kgToGrams('1800'), 25_000n)).toBe(45_000_000n);
    // 0.333 kg at ₦1.50/kg = 49.95 kobo → 50 kobo
    expect(produceAmountKobo(kgToGrams('0.333'), 150n)).toBe(50n);
    // 0.001 kg at ₦0.01/kg = 0.001 kobo → 0
    expect(produceAmountKobo(1n, 1n)).toBe(0n);
    // exactly half a kobo rounds up
    expect(produceAmountKobo(500n, 1n)).toBe(1n);
  });
  it('platform fee uses basis points with half-up rounding', () => {
    expect(bpsOfKobo(45_000_000n, 150)).toBe(675_000n); // 1.5% of ₦450,000 = ₦6,750
    expect(bpsOfKobo(333n, 150)).toBe(5n); // 4.995 → 5
    expect(bpsOfKobo(100n, 0)).toBe(0n);
    expect(() => bpsOfKobo(100n, 1.5)).toThrow();
  });
  it('estimated farmer net only deducts farmer-paid freight', () => {
    const processorPays = estimateFarmerNet({
      quantityGrams: kgToGrams('2000'),
      priceKoboPerKg: 25_000n,
      freightKobo: 3_500_000n,
      freightPayer: 'PROCESSOR',
    });
    expect(processorPays.estimatedNetKobo).toBe(50_000_000n);
    const farmerPays = estimateFarmerNet({
      quantityGrams: kgToGrams('2000'),
      priceKoboPerKg: 25_000n,
      freightKobo: 3_500_000n,
      freightPayer: 'FARMER',
    });
    expect(farmerPays.farmerPaidFreightKobo).toBe(3_500_000n);
    expect(farmerPays.estimatedNetKobo).toBe(46_500_000n);
  });
  it('formats naira exactly from kobo', () => {
    expect(formatNaira(45_000_000)).toBe('₦450,000.00');
    expect(formatNaira(5n)).toBe('₦0.05');
    expect(formatNaira(-12_345n)).toBe('−₦123.45');
    expect(formatNaira(900_719_925_474_099n)).toBe('₦9,007,199,254,740.99');
  });
});

describe('quantity validation never throws on malformed input', () => {
  it('reports a validation issue instead of throwing', () => {
    for (const bad of ['', 'abc', '1,000', '-5', '1.2345', '  ']) {
      const r = positiveKgString.safeParse(bad);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toMatch(/kilograms/);
    }
    expect(positiveKgString.safeParse('0').error?.issues[0]?.message).toBe('Quantity must be greater than zero');
    expect(positiveKgString.safeParse('2000').success).toBe(true);
  });

  it('harvest creation reports field issues for an empty form', () => {
    const r = createHarvestSchema.safeParse({ farmLocationId: '01a16a30-7479-764c-81e8-b93b7242cbce', estimatedQuantityKg: '', earliestHarvestDate: '', latestHarvestDate: '', transportPreference: 'PROCESSOR_PAYS' });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('estimatedQuantityKg');
    expect(paths).not.toContain('farmLocationId');
  });
});
