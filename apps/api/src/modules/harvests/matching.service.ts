import { Inject, Injectable } from '@nestjs/common';
import {
  distanceLabel,
  explainInfeasibility,
  kobo as koboOrNull,
  rankMatches,
  slotUsageMany,
  type MatchCandidateInput,
  type MatchRequestInput,
  type Policies,
} from '@harvestslot/core';
import { cropNoun, formatKg, gramsToKgString, lagosStartOfDay, qualityTermsSchema, toGrams, type Crop, type MatchResponse } from '@harvestslot/contracts';
import type { Db } from '@harvestslot/db';
import { PrismaService } from '../../common/prisma.service.js';
import { ENV, type Env } from '../../common/tokens.js';

const HORIZON_DAYS = 75;

export interface RequestFacts {
  id: string;
  crop: Crop;
  remainingG: bigint;
  earliestHarvestDate: string;
  latestHarvestDate: string;
  exact: { lat: number; lng: number } | null;
  approx: { lat: number; lng: number } | null;
  maxDistanceKm: number | null;
  minPriceKoboPerKg: bigint | null;
  variety: string | null;
  isDemo: boolean;
}

/** Loads candidate slots and computes deterministic, explainable matches. A match never reserves anything. */
const MATCH_DAY = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

/** "Can receive your full 2,000 kg on Thu 20 Nov" — one sentence a farmer can act on. */
export function matchHeadline(fitG: bigint, remainingG: bigint, startsAt: Date, endsAt: Date): string {
  const start = MATCH_DAY.format(startsAt).replace(',', '');
  const end = MATCH_DAY.format(new Date(endsAt.getTime() - 1)).replace(',', '');
  const when = start === end ? `on ${start}` : `between ${start} and ${end}`;
  return fitG >= remainingG ? `Can receive your full ${formatKg(remainingG)} ${when}` : `Can receive ${formatKg(fitG)} of your ${formatKg(remainingG)} ${when}`;
}

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Produce-invoice payment punctuality per processor (only fully paid invoices with a confirmed payment). */
  private async reliability(db: Db, orgIds: string[], isDemo: boolean): Promise<Map<string, { completed: number; onTime: number }>> {
    const out = new Map<string, { completed: number; onTime: number }>();
    if (!orgIds.length) return out;
    const rows = await db.$queryRaw<{ orgId: string; settled: bigint; onTime: bigint }[]>`
      SELECT i."payerOrgId" AS "orgId",
             count(*)::bigint AS settled,
             count(*) FILTER (WHERE last_confirm <= i."dueAt")::bigint AS "onTime"
        FROM invoices i
        JOIN LATERAL (
          SELECT max(rc."createdAt") AS last_confirm
            FROM payment_attempts p JOIN receipt_confirmations rc ON rc."paymentAttemptId" = p.id AND rc.decision = 'CONFIRMED'
           WHERE p."invoiceId" = i.id
        ) pay ON true
       WHERE i.kind = 'PRODUCE' AND i.status = 'PAID' AND i."isDemo" = ${isDemo}
         AND i."payerOrgId" = ANY(${orgIds}::uuid[])
       GROUP BY i."payerOrgId"`;
    for (const r of rows) out.set(r.orgId, { completed: Number(r.settled), onTime: Number(r.onTime) });
    return out;
  }

  async candidates(db: Db, now: Date, opts: { orgId?: string; crop?: Crop; from: Date; to: Date; isDemo: boolean }): Promise<MatchCandidateInput[]> {
    const slots = await db.processingSlot.findMany({
      where: {
        status: 'PUBLISHED',
        startsAt: { gt: now, lt: opts.to },
        endsAt: { gt: opts.from },
        isDemo: opts.isDemo,
        ...(opts.orgId ? { facility: { organisationId: opts.orgId } } : {}),
        ...(opts.crop ? { line: { crop: opts.crop } } : {}),
      },
      include: { line: true, facility: { include: { organisation: { select: { id: true, name: true, status: true } } } } },
      orderBy: { startsAt: 'asc' },
      take: 2000,
    });
    const usage = await slotUsageMany(db, slots.map((s) => s.id), now);
    const reliability = await this.reliability(db, Array.from(new Set(slots.map((s) => s.facility.organisationId))), opts.isDemo);
    return slots.map((s) => ({
      facility: {
        id: s.facilityId,
        name: s.facility.name,
        lga: s.facility.lga,
        point: { lat: Number(s.facility.lat), lng: Number(s.facility.lng) },
        status: s.facility.status,
        acceptingProduce: s.facility.acceptingProduce,
        maxPickupDistanceKm: s.facility.maxPickupDistanceKm,
        minOrderG: toGrams(s.facility.minOrderKg),
        indicativePriceKoboPerKg: s.facility.indicativePriceKoboPerKg,
        qualityCriteria: qualityTermsSchema.parse(s.facility.qualityCriteria),
      },
      org: { id: s.facility.organisation.id, name: s.facility.organisation.name, status: s.facility.organisation.status },
      slot: { id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, status: s.status, lineName: s.line.name, lineStatus: s.line.status, crop: s.line.crop, product: s.line.product },
      usage: usage.get(s.id)!,
      reliability: reliability.get(s.facility.organisationId) ?? { completed: 0, onTime: 0 },
      invited: false,
    }));
  }

  window(r: { earliestHarvestDate: string; latestHarvestDate: string }): { from: Date; to: Date } {
    return {
      from: lagosStartOfDay(r.earliestHarvestDate),
      to: new Date(lagosStartOfDay(r.latestHarvestDate).getTime() + 8 * 86_400_000),
    };
  }

  input(r: RequestFacts, useExact: boolean): MatchRequestInput {
    const point = useExact ? (r.exact ?? r.approx) : r.approx;
    return {
      id: r.id,
      crop: r.crop,
      remainingG: r.remainingG,
      earliestHarvestDate: r.earliestHarvestDate,
      latestHarvestDate: r.latestHarvestDate,
      point,
      pointIsApproximate: !(useExact && r.exact),
      maxDistanceKm: r.maxDistanceKm,
      minPriceKoboPerKg: r.minPriceKoboPerKg,
      variety: r.variety,
    };
  }

  async forFarmer(r: RequestFacts, policies: Policies, invitedFacilityIds: Set<string>, now = new Date()): Promise<MatchResponse> {
    const { from, to } = this.window(r);
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
    const candidates = await this.candidates(this.prisma.db, now, { crop: r.crop, from, to: to < horizon ? to : horizon, isDemo: r.isDemo });
    candidates.forEach((c) => (c.invited = invitedFacilityIds.has(c.facility.id)));
    const input = this.input(r, true);
    const { matches, rejections } = rankMatches(input, candidates, {
      now,
      weights: policies.matchingWeights,
      roadFactor: this.env.ROAD_DISTANCE_FACTOR,
      reliabilityMinHistory: policies.reliabilityMinHistory,
    });
    // One result per facility (its best slot) keeps the comparison readable.
    const seen = new Set<string>();
    const best = matches.filter((m) => (seen.has(m.candidate.facility.id) ? false : (seen.add(m.candidate.facility.id), true))).slice(0, 12);
    return {
      harvestRequestId: r.id,
      remainingKg: gramsToKgString(r.remainingG),
      computedAt: now.toISOString(),
      disclaimer: 'Matches are recommendations only. Nothing is reserved until a processor sends an offer and you accept it.',
      results: best.map((m) => ({
        facilityId: m.candidate.facility.id,
        facilityName: m.candidate.facility.name,
        processorOrgId: m.candidate.org.id,
        processorName: m.candidate.org.name,
        processorReviewed: m.candidate.org.status === 'APPROVED',
        lga: m.candidate.facility.lga,
        slot: {
          id: m.candidate.slot.id,
          startsAt: m.candidate.slot.startsAt.toISOString(),
          endsAt: m.candidate.slot.endsAt.toISOString(),
          lineName: m.candidate.slot.lineName,
          product: m.candidate.slot.product as never,
        },
        availableKg: gramsToKgString(m.candidate.usage.availableG),
        fitKg: gramsToKgString(m.fitG),
        indicativePriceKoboPerKg: koboOrNull(m.candidate.facility.indicativePriceKoboPerKg),
        distance: {
          straightLineKm: m.straightLineKm,
          estimatedRoadKm: m.roadKm,
          method: 'STRAIGHT_LINE_ESTIMATE',
          label: distanceLabel(m.straightLineKm, m.roadKm, 'STRAIGHT_LINE_ESTIMATE'),
        },
        costs: {
          estimatedProduceAmountKobo: koboOrNull(m.estimatedProduceAmountKobo),
          freightPayer: 'PROCESSOR',
          freightNote: 'The offer says whether the buyer collects from your farm or you deliver, and any cost to you, before you accept.',
          estimatedFarmerNetKobo: koboOrNull(m.estimatedProduceAmountKobo),
        },
        score: m.score,
        factors: m.factors,
        reliability: { completedBookings: m.candidate.reliability.completed, onTimeRate: m.onTimeRate, label: m.reliabilityLabel },
        headline: matchHeadline(m.fitG, r.remainingG, m.candidate.slot.startsAt, m.candidate.slot.endsAt),
        explanation: m.explanation,
        remainingSteps: [
          'Send a request: the buyer replies with an offer (a request reserves nothing)',
          `You review the offer — price, date, and who brings the ${cropNoun(r.crop)} — and accept or decline`,
          'Your plan is confirmed and you can harvest',
        ],
        qualityCriteria: m.candidate.facility.qualityCriteria,
        invited: m.candidate.invited,
        availabilityAsOf: now.toISOString(),
      })),
      infeasible: best.length === 0 ? explainInfeasibility(input, rejections, candidates.length) : null,
    };
  }
}
