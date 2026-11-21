import { describe, expect, it } from 'vitest';
import { kgToGrams } from '@harvestslot/contracts';
import { explainInfeasibility, rankMatches, type MatchCandidateInput, type MatchRequestInput } from '../src/matching.js';
import { DEFAULT_MATCHING_WEIGHTS } from '../src/policies.js';
import type { SlotUsageGrams } from '../src/capacity.js';

const now = new Date('2026-10-23T08:00:00Z');
const opts = { now, weights: DEFAULT_MATCHING_WEIGHTS, roadFactor: 1.4, reliabilityMinHistory: 5 };

function usage(availableKg: string): SlotUsageGrams {
  const a = kgToGrams(availableKg);
  return { limitG: a, processingG: a, purchaseLimitG: a, heldG: 0n, committedG: 0n, consumedG: 0n, usedG: 0n, availableG: a };
}

const request: MatchRequestInput = {
  id: 'r1',
  crop: 'CASSAVA',
  remainingG: kgToGrams('2000'),
  earliestHarvestDate: '2026-10-27',
  latestHarvestDate: '2026-10-30',
  point: { lat: 7.52, lng: 3.92 }, // Akinyele area
  pointIsApproximate: false,
  maxDistanceKm: 80,
  minPriceKoboPerKg: 20_000n,
  variety: null,
};

function candidate(id: string, o: Partial<{ price: bigint | null; availableKg: string; lat: number; lng: number; slotStart: string; orgStatus: string; minOrderKg: string; completed: number; onTime: number; radius: number; varieties: string[]; crop: 'CASSAVA' | 'TOMATO' }> = {}): MatchCandidateInput {
  const start = new Date(o.slotStart ?? '2026-10-28T07:00:00Z');
  return {
    facility: {
      id: `f-${id}`,
      name: `Facility ${id}`,
      lga: 'Akinyele',
      point: { lat: o.lat ?? 7.45, lng: o.lng ?? 3.9 },
      status: 'ACTIVE',
      acceptingProduce: true,
      maxPickupDistanceKm: o.radius ?? 100,
      minOrderG: kgToGrams(o.minOrderKg ?? '500'),
      indicativePriceKoboPerKg: o.price === undefined ? 25_000n : o.price,
      qualityCriteria: { maxHoursHarvestToDelivery: 48, soilAndStemsRemoved: true, varietiesAccepted: o.varieties ?? [] },
    },
    org: { id: `o-${id}`, name: `Org ${id}`, status: o.orgStatus ?? 'APPROVED' },
    slot: { id: `s-${id}`, startsAt: start, endsAt: new Date(start.getTime() + 8 * 3_600_000), status: 'PUBLISHED', lineName: 'Line A', lineStatus: 'ACTIVE', crop: o.crop ?? 'CASSAVA', product: o.crop === 'TOMATO' ? 'TOMATO_PASTE' : 'GARRI' },
    usage: usage(o.availableKg ?? '5000'),
    reliability: { completed: o.completed ?? 0, onTime: o.onTime ?? 0 },
    invited: false,
  };
}

describe('matching eligibility', () => {
  it('excludes unapproved processors, distant facilities, full slots and low prices', () => {
    const { matches, rejections } = rankMatches(
      request,
      [
        candidate('ok'),
        candidate('unapproved', { orgStatus: 'PENDING_REVIEW' }),
        candidate('far', { lat: 8.9, lng: 3.4 }), // ~160 km
        candidate('full', { availableKg: '0' }),
        candidate('cheap', { price: 15_000n }),
        candidate('late', { slotStart: '2026-11-10T07:00:00Z' }),
        candidate('variety', { varieties: ['TME 419'] }),
      ],
      opts,
    );
    expect(matches.map((m) => m.candidate.facility.id)).toEqual(['f-ok', 'f-variety']);
    const reasons = Object.fromEntries(rejections.map((r) => [r.slotId, r.reason]));
    expect(reasons).toMatchObject({
      's-unapproved': 'PROCESSOR_NOT_APPROVED',
      's-far': 'TOO_FAR_FOR_PROCESSOR',
      's-full': 'NO_CAPACITY',
      's-cheap': 'PRICE_BELOW_MINIMUM',
      's-late': 'DATES_INCOMPATIBLE',
    });
  });

  it('only pairs a harvest with buying slots for the same crop', () => {
    const tomatoes = { ...request, crop: 'TOMATO' as const, minPriceKoboPerKg: null };
    const { matches, rejections } = rankMatches(tomatoes, [candidate('cassava-buyer'), candidate('tomato-buyer', { crop: 'TOMATO' })], opts);
    expect(matches.map((m) => m.candidate.facility.id)).toEqual(['f-tomato-buyer']);
    expect(rejections).toEqual([expect.objectContaining({ slotId: 's-cassava-buyer', reason: 'CROP_NOT_BOUGHT', detail: 'This buying slot is for cassava, not tomatoes.' })]);
    // And the other way round: a cassava harvest never lands at a tomato buyer.
    expect(rankMatches(request, [candidate('tomato-buyer', { crop: 'TOMATO' })], opts).matches).toHaveLength(0);
  });

  it('explains when nobody buys the crop yet', () => {
    const out = explainInfeasibility({ ...request, crop: 'TOMATO' }, [], 0);
    expect(out.reasons[0]).toBe('No buyer has published open capacity for tomatoes on upcoming dates.');
  });

  it('rejects a variety the facility does not accept when the farmer stated one', () => {
    const { matches } = rankMatches({ ...request, variety: 'TMS 30572' }, [candidate('v', { varieties: ['TME 419'] })], opts);
    expect(matches).toHaveLength(0);
  });

  it('partial capacity is eligible but scores lower on fit', () => {
    const { matches } = rankMatches(request, [candidate('partial', { availableKg: '800' }), candidate('full', { availableKg: '3000' })], opts);
    expect(matches[0]!.candidate.facility.id).toBe('f-full');
    const partial = matches.find((m) => m.candidate.facility.id === 'f-partial')!;
    expect(partial.fitG).toBe(kgToGrams('800'));
    expect(partial.factors.find((f) => f.key === 'capacityFit')!.score).toBeCloseTo(0.4, 3);
  });
});

describe('matching ranking and explanations', () => {
  it('prefers higher indicative value when other factors are equal', () => {
    const { matches } = rankMatches(request, [candidate('low', { price: 22_000n }), candidate('high', { price: 26_000n })], opts);
    expect(matches.map((m) => m.candidate.facility.id)).toEqual(['f-high', 'f-low']);
    expect(matches[0]!.estimatedProduceAmountKobo).toBe(52_000_000n);
  });

  it('does not invent reliability for organisations without history', () => {
    const { matches } = rankMatches(request, [candidate('new'), candidate('seasoned', { completed: 10, onTime: 9 })], opts);
    const newcomer = matches.find((m) => m.candidate.facility.id === 'f-new')!;
    expect(newcomer.reliabilityLabel).toBe('Not enough history');
    expect(newcomer.factors.find((f) => f.key === 'reliability')!.score).toBeNull();
    const seasoned = matches.find((m) => m.candidate.facility.id === 'f-seasoned')!;
    expect(seasoned.onTimeRate).toBeCloseTo(0.9);
  });

  it('labels distance as straight-line with an estimate, never as a route', () => {
    const { matches } = rankMatches(request, [candidate('ok')], opts);
    const distance = matches[0]!.factors.find((f) => f.key === 'distance')!;
    expect(distance.explanation).toMatch(/straight-line/);
    expect(distance.explanation).toMatch(/estimate, not a route/);
  });

  it('is deterministic', () => {
    const cands = [candidate('a'), candidate('b'), candidate('c', { price: 24_000n })];
    const first = rankMatches(request, cands, opts).matches.map((m) => m.candidate.facility.id);
    const second = rankMatches(request, [...cands].reverse(), opts).matches.map((m) => m.candidate.facility.id);
    expect(first).toEqual(second);
  });
});

describe('infeasibility explanations', () => {
  it('suggests a quantity that fits and alternative dates', () => {
    const big = { ...request, remainingG: kgToGrams('10000') };
    const { matches, rejections } = rankMatches(
      big,
      [candidate('small', { availableKg: '300', minOrderKg: '500' }), candidate('later', { slotStart: '2026-11-12T07:00:00Z' })],
      opts,
    );
    expect(matches).toHaveLength(0);
    const info = explainInfeasibility(big, rejections, 2);
    expect(info.reasons.length).toBeGreaterThan(0);
    expect(info.suggestions.map((s) => s.kind)).toEqual(expect.arrayContaining(['CHANGE_DATES']));
  });

  it('explains that no capacity is published at all', () => {
    const info = explainInfeasibility(request, [], 0);
    expect(info.suggestions[0]!.kind).toBe('WAIT');
  });

  it('suggests extending the farmer distance limit', () => {
    const near = { ...request, maxDistanceKm: 5 };
    const { rejections } = rankMatches(near, [candidate('mid')], opts);
    const info = explainInfeasibility(near, rejections, 1);
    expect(info.suggestions.map((s) => s.kind)).toContain('EXTEND_DISTANCE');
  });
});
