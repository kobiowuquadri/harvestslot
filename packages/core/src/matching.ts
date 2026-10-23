import {
  formatKg,
  formatLagosDate,
  formatLagosWindow,
  formatPricePerKg,
  gramsToKgString,
  koboToNumber,
  lagosStartOfDay,
  produceAmountKobo,
  type QualityTerms,
} from '@harvestslot/contracts';
import type { SlotUsageGrams } from './capacity.js';
import { distanceLabel, estimateRoadKm, haversineKm, round1, type Point } from './geo.js';
import type { MatchingWeights } from './policies.js';

export interface MatchRequestInput {
  id: string;
  remainingG: bigint;
  earliestHarvestDate: string;
  latestHarvestDate: string;
  point: Point | null;
  pointIsApproximate: boolean;
  maxDistanceKm: number | null;
  minPriceKoboPerKg: bigint | null;
  variety: string | null;
}

export interface MatchCandidateInput {
  facility: {
    id: string;
    name: string;
    lga: string;
    point: Point;
    status: string;
    acceptsCassava: boolean;
    maxPickupDistanceKm: number;
    minOrderG: bigint;
    indicativePriceKoboPerKg: bigint | null;
    qualityCriteria: QualityTerms;
  };
  org: { id: string; name: string; status: string };
  slot: { id: string; startsAt: Date; endsAt: Date; status: string; lineName: string; lineStatus: string; product: string };
  usage: SlotUsageGrams;
  reliability: { completed: number; onTime: number };
  invited: boolean;
}

export interface MatchOptions {
  now: Date;
  weights: MatchingWeights;
  roadFactor: number;
  reliabilityMinHistory: number;
}

export type RejectionReason =
  | 'PROCESSOR_NOT_APPROVED'
  | 'FACILITY_UNAVAILABLE'
  | 'SLOT_NOT_OPEN'
  | 'DATES_INCOMPATIBLE'
  | 'TOO_FAR_FOR_PROCESSOR'
  | 'TOO_FAR_FOR_FARMER'
  | 'NO_CAPACITY'
  | 'BELOW_MINIMUM_ORDER'
  | 'PRICE_BELOW_MINIMUM'
  | 'VARIETY_NOT_ACCEPTED';

export interface MatchRejection {
  slotId: string;
  facilityName: string;
  reason: RejectionReason;
  detail: string;
  availableG?: bigint;
  slotStartsAt?: Date;
  straightLineKm?: number;
}

export interface FactorScore {
  key: 'netValue' | 'schedule' | 'distance' | 'capacityFit' | 'reliability';
  label: string;
  weight: number;
  score: number | null;
  explanation: string;
}

export interface MatchCore {
  candidate: MatchCandidateInput;
  fitG: bigint;
  straightLineKm: number;
  roadKm: number;
  score: number;
  factors: FactorScore[];
  explanation: string[];
  estimatedProduceAmountKobo: bigint | null;
  reliabilityLabel: string;
  onTimeRate: number | null;
}

const HOUR = 3_600_000;

function harvestBounds(r: MatchRequestInput): { start: Date; end: Date } {
  const start = lagosStartOfDay(r.earliestHarvestDate);
  const end = new Date(lagosStartOfDay(r.latestHarvestDate).getTime() + 24 * HOUR);
  return { start, end };
}

/** Hard eligibility. Returns null when eligible, otherwise the first failing rule. */
export function checkEligibility(r: MatchRequestInput, c: MatchCandidateInput, opts: MatchOptions): MatchRejection | null {
  const base = { slotId: c.slot.id, facilityName: c.facility.name };
  if (c.org.status !== 'APPROVED') return { ...base, reason: 'PROCESSOR_NOT_APPROVED', detail: 'Processor has not been reviewed and approved.' };
  if (c.facility.status !== 'ACTIVE' || !c.facility.acceptsCassava || c.slot.lineStatus !== 'ACTIVE') {
    return { ...base, reason: 'FACILITY_UNAVAILABLE', detail: 'Facility or line is not accepting cassava.' };
  }
  if (c.slot.status !== 'PUBLISHED' || c.slot.startsAt <= opts.now) {
    return { ...base, reason: 'SLOT_NOT_OPEN', detail: 'Slot is not open for new bookings.' };
  }
  const { start, end } = harvestBounds(r);
  const maxHours = c.facility.qualityCriteria.maxHoursHarvestToDelivery;
  if (c.slot.endsAt <= start || c.slot.startsAt >= new Date(end.getTime() + maxHours * HOUR)) {
    return {
      ...base,
      reason: 'DATES_INCOMPATIBLE',
      detail: `Slot ${formatLagosWindow(c.slot.startsAt, c.slot.endsAt)} does not fit harvest dates within ${maxHours} h of harvest.`,
      slotStartsAt: c.slot.startsAt,
      availableG: c.usage.availableG,
    };
  }
  const km = r.point ? haversineKm(r.point, c.facility.point) : 0;
  if (r.point && km > c.facility.maxPickupDistanceKm) {
    return { ...base, reason: 'TOO_FAR_FOR_PROCESSOR', detail: `${round1(km)} km exceeds the facility's ${c.facility.maxPickupDistanceKm} km pickup radius.`, straightLineKm: km };
  }
  if (r.point && r.maxDistanceKm !== null && km > r.maxDistanceKm) {
    return { ...base, reason: 'TOO_FAR_FOR_FARMER', detail: `${round1(km)} km exceeds your ${r.maxDistanceKm} km limit.`, straightLineKm: km };
  }
  if (c.usage.availableG <= 0n) {
    return { ...base, reason: 'NO_CAPACITY', detail: 'No purchase/processing capacity left in this slot.', availableG: 0n, slotStartsAt: c.slot.startsAt };
  }
  const fit = c.usage.availableG < r.remainingG ? c.usage.availableG : r.remainingG;
  if (fit < c.facility.minOrderG) {
    return {
      ...base,
      reason: 'BELOW_MINIMUM_ORDER',
      detail:
        r.remainingG < c.facility.minOrderG
          ? `Your remaining ${formatKg(r.remainingG)} is below the minimum order of ${formatKg(c.facility.minOrderG)}.`
          : `Only ${formatKg(c.usage.availableG)} left, below the minimum order of ${formatKg(c.facility.minOrderG)}.`,
      availableG: c.usage.availableG,
      slotStartsAt: c.slot.startsAt,
    };
  }
  if (r.minPriceKoboPerKg !== null && c.facility.indicativePriceKoboPerKg !== null && c.facility.indicativePriceKoboPerKg < r.minPriceKoboPerKg) {
    return {
      ...base,
      reason: 'PRICE_BELOW_MINIMUM',
      detail: `Indicative price ${formatPricePerKg(c.facility.indicativePriceKoboPerKg)} is below your minimum ${formatPricePerKg(r.minPriceKoboPerKg)}.`,
    };
  }
  const varieties = c.facility.qualityCriteria.varietiesAccepted ?? [];
  if (r.variety && varieties.length > 0 && !varieties.some((v) => v.toLowerCase() === r.variety!.toLowerCase())) {
    return { ...base, reason: 'VARIETY_NOT_ACCEPTED', detail: `Facility accepts ${varieties.join(', ')} only.` };
  }
  return null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Ranks eligible candidates with configurable weights; unknown factors are excluded and their weight redistributed. */
export function rankMatches(
  r: MatchRequestInput,
  candidates: MatchCandidateInput[],
  opts: MatchOptions,
): { matches: MatchCore[]; rejections: MatchRejection[] } {
  const rejections: MatchRejection[] = [];
  const eligible: MatchCandidateInput[] = [];
  for (const c of candidates) {
    const rejection = checkEligibility(r, c, opts);
    if (rejection) rejections.push(rejection);
    else eligible.push(c);
  }

  const prices = eligible.map((c) => c.facility.indicativePriceKoboPerKg).filter((p): p is bigint => p !== null);
  const minP = prices.length ? prices.reduce((a, b) => (a < b ? a : b)) : null;
  const maxP = prices.length ? prices.reduce((a, b) => (a > b ? a : b)) : null;
  const { start: harvestStart, end: harvestEnd } = harvestBounds(r);

  const matches = eligible.map((c): MatchCore => {
    const fitG = c.usage.availableG < r.remainingG ? c.usage.availableG : r.remainingG;
    const km = r.point ? haversineKm(r.point, c.facility.point) : 0;
    const roadKm = estimateRoadKm(km, opts.roadFactor);
    const price = c.facility.indicativePriceKoboPerKg;

    const netScore = price === null || minP === null || maxP === null ? null : maxP === minP ? 1 : Number(price - minP) / Number(maxP - minP);
    const slotStart = c.slot.startsAt.getTime();
    const daysOutside =
      slotStart < harvestStart.getTime()
        ? (harvestStart.getTime() - slotStart) / (24 * HOUR)
        : slotStart > harvestEnd.getTime()
          ? (slotStart - harvestEnd.getTime()) / (24 * HOUR)
          : 0;
    const scheduleScore = clamp01(1 - 0.25 * daysOutside);
    const distanceScore = r.point ? clamp01(1 - km / Math.max(1, c.facility.maxPickupDistanceKm)) : null;
    const fitScore = r.remainingG > 0n ? Number((fitG * 1000n) / r.remainingG) / 1000 : 0;
    const enoughHistory = c.reliability.completed >= opts.reliabilityMinHistory;
    const onTimeRate = enoughHistory ? c.reliability.onTime / c.reliability.completed : null;

    const factors: FactorScore[] = [
      {
        key: 'netValue',
        label: 'Estimated value to you',
        weight: opts.weights.netValue,
        score: netScore,
        explanation:
          price === null
            ? 'No indicative price published — the offer will set the price.'
            : `Indicative ${formatPricePerKg(price)}; the processor pays transport by default, so this is your estimated net per kg.`,
      },
      {
        key: 'schedule',
        label: 'Fits your dates',
        weight: opts.weights.schedule,
        score: scheduleScore,
        explanation:
          daysOutside === 0
            ? `Processing starts ${formatLagosDate(c.slot.startsAt)}, inside your harvest dates.`
            : `Processing starts ${formatLagosDate(c.slot.startsAt)}, ${Math.ceil(daysOutside)} day(s) outside your dates but within the facility's ${c.facility.qualityCriteria.maxHoursHarvestToDelivery} h freshness limit.`,
      },
      {
        key: 'distance',
        label: 'Distance',
        weight: opts.weights.distance,
        score: distanceScore,
        explanation: r.point
          ? `${distanceLabel(km, roadKm, 'STRAIGHT_LINE_ESTIMATE')}${r.pointIsApproximate ? ' — measured from your LGA centre' : ''}.`
          : 'Farm location not pinned; distance not scored.',
      },
      {
        key: 'capacityFit',
        label: 'Capacity fit',
        weight: opts.weights.capacityFit,
        score: fitScore,
        explanation: fitG >= r.remainingG ? `Can take all ${formatKg(r.remainingG)}.` : `Can take ${formatKg(fitG)} of your ${formatKg(r.remainingG)}.`,
      },
      {
        key: 'reliability',
        label: 'Payment track record',
        weight: opts.weights.reliability,
        score: onTimeRate,
        explanation: enoughHistory
          ? `${Math.round((onTimeRate ?? 0) * 100)}% of ${c.reliability.completed} produce invoices were confirmed paid by their due date.`
          : `Not enough history (${c.reliability.completed} settled invoice(s) on HarvestSlot); not scored.`,
      },
    ];
    const known = factors.filter((f) => f.score !== null && f.weight > 0);
    const weightSum = known.reduce((s, f) => s + f.weight, 0);
    const score = weightSum > 0 ? Math.round((known.reduce((s, f) => s + f.weight * (f.score ?? 0), 0) / weightSum) * 100) : 0;

    const explanation = [
      `Slot ${formatLagosWindow(c.slot.startsAt, c.slot.endsAt)} on ${c.slot.lineName}.`,
      factors[3]!.explanation,
      factors[0]!.explanation,
      factors[2]!.explanation,
    ];
    return {
      candidate: c,
      fitG,
      straightLineKm: round1(km),
      roadKm,
      score,
      factors,
      explanation,
      estimatedProduceAmountKobo: price === null ? null : produceAmountKobo(fitG, price),
      reliabilityLabel: enoughHistory ? `${Math.round((onTimeRate ?? 0) * 100)}% paid on time (${c.reliability.completed} invoices)` : 'Not enough history',
      onTimeRate,
    };
  });

  matches.sort((a, b) => b.score - a.score || (a.candidate.slot.startsAt.getTime() - b.candidate.slot.startsAt.getTime()) || a.candidate.facility.name.localeCompare(b.candidate.facility.name));
  return { matches, rejections };
}

/** Explains why nothing matched and proposes concrete, valid changes. */
export function explainInfeasibility(
  r: MatchRequestInput,
  rejections: MatchRejection[],
  totalCandidates: number,
): { reasons: string[]; suggestions: Array<{ kind: 'REDUCE_QUANTITY' | 'CHANGE_DATES' | 'EXTEND_DISTANCE' | 'WAIT'; text: string }> } {
  const reasons: string[] = [];
  const suggestions: Array<{ kind: 'REDUCE_QUANTITY' | 'CHANGE_DATES' | 'EXTEND_DISTANCE' | 'WAIT'; text: string }> = [];
  if (totalCandidates === 0) {
    reasons.push('No processor has published open capacity for upcoming dates.');
    suggestions.push({ kind: 'WAIT', text: 'Keep the request published; processors can still see it in their inbox and make an offer.' });
    return { reasons, suggestions };
  }
  const by = (reason: RejectionReason) => rejections.filter((x) => x.reason === reason);
  const counts = new Map<RejectionReason, number>();
  rejections.forEach((x) => counts.set(x.reason, (counts.get(x.reason) ?? 0) + 1));
  const describe: Record<RejectionReason, string> = {
    PROCESSOR_NOT_APPROVED: 'processor not yet approved',
    FACILITY_UNAVAILABLE: 'facility not accepting cassava',
    SLOT_NOT_OPEN: 'slot closed',
    DATES_INCOMPATIBLE: 'outside your harvest dates',
    TOO_FAR_FOR_PROCESSOR: "beyond the facility's pickup radius",
    TOO_FAR_FOR_FARMER: 'beyond your maximum distance',
    NO_CAPACITY: 'fully booked',
    BELOW_MINIMUM_ORDER: 'below minimum order',
    PRICE_BELOW_MINIMUM: 'indicative price below your minimum',
    VARIETY_NOT_ACCEPTED: 'variety not accepted',
  };
  for (const [reason, n] of counts) reasons.push(`${n} slot(s): ${describe[reason]}.`);

  const dateMisses = by('DATES_INCOMPATIBLE').filter((x) => (x.availableG ?? 0n) > 0n && x.slotStartsAt);
  if (dateMisses.length) {
    const soonest = dateMisses.sort((a, b) => a.slotStartsAt!.getTime() - b.slotStartsAt!.getTime())[0]!;
    suggestions.push({
      kind: 'CHANGE_DATES',
      text: `${soonest.facilityName} has capacity from ${formatLagosDate(soonest.slotStartsAt!)}. If you can harvest around then, update your acceptable dates.`,
    });
  }
  const capacityMisses = [...by('BELOW_MINIMUM_ORDER'), ...by('NO_CAPACITY')].filter((x) => (x.availableG ?? 0n) > 0n);
  if (capacityMisses.length) {
    const largest = capacityMisses.reduce((a, b) => ((a.availableG ?? 0n) > (b.availableG ?? 0n) ? a : b));
    if ((largest.availableG ?? 0n) < r.remainingG) {
      suggestions.push({
        kind: 'REDUCE_QUANTITY',
        text: `The largest remaining capacity in your dates is ${formatKg(largest.availableG!)} at ${largest.facilityName}. You could offer ${gramsToKgString(largest.availableG!).replace(/\.?0+$/, '')} kg now and the rest later.`,
      });
    }
  }
  const farMisses = by('TOO_FAR_FOR_FARMER');
  if (farMisses.length && r.maxDistanceKm !== null) {
    const nearest = farMisses.reduce((a, b) => ((a.straightLineKm ?? 1e9) < (b.straightLineKm ?? 1e9) ? a : b));
    suggestions.push({
      kind: 'EXTEND_DISTANCE',
      text: `${nearest.facilityName} is ${round1(nearest.straightLineKm ?? 0)} km away (straight-line). Raising your maximum distance would include it.`,
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({ kind: 'WAIT', text: 'Keep the request published; processors can still make an offer from their inbox.' });
  }
  return { reasons, suggestions };
}

export function kobo(n: bigint | null): number | null {
  return n === null ? null : koboToNumber(n);
}
