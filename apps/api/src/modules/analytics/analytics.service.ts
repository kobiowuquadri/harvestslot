import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  addDays,
  analyticsQuerySchema,
  gramsToKgString,
  lagosDateString,
  lagosStartOfDay,
  toGrams,
  type AnalyticsResponse,
  type BookingTermsContent,
} from '@harvestslot/contracts';
import { DomainError, slotUsageMany, type Actor } from '@harvestslot/core';
import type { Prisma } from '@harvestslot/db';
import { AccessService } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';

type Def = AnalyticsResponse['definitions'][number];
type Val = AnalyticsResponse['values'][number];

/**
 * Every metric has a definition, its source fields, exclusions and an explicit empty state.
 * Nothing here estimates impact ("tonnes saved", income uplift); measured records only.
 */
export const METRICS: Def[] = [
  { key: 'requests_published', label: 'Harvest requests published', definition: 'Requests that became published in the period.', sources: ['harvest_requests.publishedAt'], exclusions: 'Drafts; other data scope (demo vs live).', unit: 'count' },
  { key: 'unallocated_kg', label: 'Quantity still unallocated', definition: 'For requests currently published: quantity for sale minus active allocations (now, not period-bound).', sources: ['harvest_requests.eligibleQuantityKg', 'harvest_lots.quantityKg'], exclusions: 'Released lots and lapsed holds.', unit: 'kg' },
  { key: 'bookings_by_status', label: 'Bookings by status', definition: 'Bookings created in the period, grouped by current status.', sources: ['bookings.status', 'bookings.createdAt'], exclusions: 'Other data scope.', unit: 'count' },
  { key: 'slot_capacity', label: 'Slot capacity use', definition: 'For slots starting in the period: held (unexpired), committed, consumed and unused kg of min(processing, purchase limit).', sources: ['processing_slots', 'reservations'], exclusions: 'Cancelled slots; expired holds count as unused.', unit: 'kg' },
  { key: 'confirmation_lead_time', label: 'Confirmation lead time', definition: 'Average hours from booking creation to confirmation, for bookings confirmed in the period.', sources: ['bookings.createdAt', 'bookings.confirmedAt'], exclusions: 'Unconfirmed bookings.', unit: 'hours' },
  { key: 'pickup_punctuality', label: 'Pickups within window', definition: 'Share of pickups confirmed by the end of the agreed pickup window.', sources: ['shipments.pickupConfirmedAt', 'booking_terms_versions.content.pickupWindow'], exclusions: 'Cancelled shipments.', unit: 'percent' },
  { key: 'delivery_punctuality', label: 'Deliveries within window', definition: 'Share of deliveries confirmed by the end of the agreed delivery window.', sources: ['shipments.deliveredAt', 'booking_terms_versions.content.deliveryWindow'], exclusions: 'Cancelled shipments.', unit: 'percent' },
  { key: 'harvest_to_receipt', label: 'Harvest start → receipt', definition: 'Average hours from recorded harvest start to delivery confirmation.', sources: ['harvest_lots.harvestStartedAt', 'shipments.deliveredAt'], exclusions: 'Bookings without both timestamps.', unit: 'hours' },
  { key: 'harvest_to_processing', label: 'Harvest start → processing', definition: 'Average hours from recorded harvest start to processing start.', sources: ['harvest_lots.harvestStartedAt', 'processing_records.startedAt'], exclusions: 'Bookings not yet processed.', unit: 'hours' },
  { key: 'cancellations', label: 'Cancellations and no-shows', definition: 'Bookings cancelled in the period by party; no-shows are confirmed bookings whose pickup window ended without harvest or collection.', sources: ['bookings.cancelledByParty', 'harvest_lots.status'], exclusions: 'Expired (never confirmed) bookings are reported separately.', unit: 'count' },
  { key: 'accepted_rejected', label: 'Accepted and rejected quantity', definition: 'Sum of accepted and rejected kg in quality decisions recorded in the period, with rejection reasons.', sources: ['quality_assessments'], exclusions: 'Receiving records without a decision.', unit: 'kg' },
  { key: 'payments', label: 'Invoice payment position', definition: 'Open invoices: outstanding, overdue, reported-but-unconfirmed; and payments confirmed by recipients or verified by a provider in the period.', sources: ['invoices', 'payment_attempts'], exclusions: 'Simulated payments are excluded from live data.', unit: 'kobo' },
  { key: 'produce_value', label: 'Produce transaction value', definition: 'Total of produce invoices issued in the period. This is money owed between farmers and processors — not HarvestSlot revenue and not cash received.', sources: ['invoices(kind=PRODUCE).totalKobo'], exclusions: 'Freight and fee invoices.', unit: 'kobo' },
  { key: 'freight_obligations', label: 'Freight obligations', definition: 'Total of freight invoices issued in the period.', sources: ['invoices(kind=FREIGHT).totalKobo'], exclusions: '—', unit: 'kobo' },
  { key: 'platform_fees', label: 'HarvestSlot service fees', definition: 'Fee invoices issued in the period, and the part confirmed received.', sources: ['invoices(kind=PLATFORM_FEE)'], exclusions: 'Simulated payments excluded in live scope.', unit: 'kobo' },
  { key: 'farmer_receipts', label: 'Farmer receipts confirmed', definition: 'Produce-invoice payments the farmer side confirmed as received in the period. Estimated net proceeds are shown on each booking separately.', sources: ['payment_attempts(status=CONFIRMED_BY_RECIPIENT)'], exclusions: 'Reported but unconfirmed payments.', unit: 'kobo' },
  { key: 'measured_losses', label: 'Recorded losses (with provenance)', definition: 'Loss records in the period by stage and method. "Estimated" in-transit loss compares a driver-reported pickup quantity with a weighed net quantity.', sources: ['loss_records'], exclusions: 'Conversion yield (roots → product) is not a loss.', unit: 'kg' },
];

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  private range(q: z.infer<typeof analyticsQuerySchema>) {
    const to = q.to ?? lagosDateString(new Date());
    const from = q.from ?? addDays(to, -90);
    return { from, to, fromAt: lagosStartOfDay(from), toAt: lagosStartOfDay(addDays(to, 1)) };
  }

  async compute(
    actor: Actor,
    scope: { kind: 'platform' | 'processor' | 'cooperative' | 'transporter' | 'farmer'; id: string | null },
    q: z.infer<typeof analyticsQuerySchema>,
  ): Promise<AnalyticsResponse> {
    let name = 'HarvestSlot platform';
    let bookingWhere: Prisma.BookingWhereInput = {};
    let isDemo = q.dataScope === 'demo';
    if (scope.kind === 'platform') {
      if (actor.platformRole !== 'ADMIN') throw new DomainError('NOT_FOUND', 'Not found');
    } else if (scope.kind === 'processor') {
      const m = await this.access.requireOrg(actor, scope.id!, 'processor.analytics.view');
      name = m.organisationName;
      bookingWhere = { processorOrgId: scope.id! };
      isDemo = (await this.prisma.db.organisation.findUniqueOrThrow({ where: { id: scope.id! } })).isDemo;
    } else if (scope.kind === 'transporter') {
      const m = await this.access.requireOrg(actor, scope.id!, 'transport.job.view');
      name = m.organisationName;
      bookingWhere = { trips: { some: { transporterOrgId: scope.id! } } };
      isDemo = (await this.prisma.db.organisation.findUniqueOrThrow({ where: { id: scope.id! } })).isDemo;
    } else if (scope.kind === 'cooperative') {
      const m = await this.access.requireOrg(actor, scope.id!, 'coop.act');
      name = m.organisationName;
      const members = await this.prisma.db.cooperativeMembership.findMany({ where: { cooperativeId: scope.id!, status: 'ACTIVE' }, select: { farmerProfileId: true } });
      bookingWhere = { farmerProfileId: { in: members.map((x) => x.farmerProfileId) } };
      isDemo = (await this.prisma.db.organisation.findUniqueOrThrow({ where: { id: scope.id! } })).isDemo;
    } else {
      const a = await this.access.farmer(actor, scope.id!, 'finance.view');
      name = a.farmerName;
      bookingWhere = { farmerProfileId: scope.id! };
      isDemo = (await this.prisma.db.farmerProfile.findUniqueOrThrow({ where: { id: scope.id! } })).isDemo;
    }
    const { from, to, fromAt, toAt } = this.range(q);
    const db = this.prisma.db;
    const inRange = { gte: fromAt, lt: toAt };
    const bw: Prisma.BookingWhereInput = { AND: [bookingWhere, { isDemo }] };
    const values: Val[] = [];
    const v = (key: string, value: number | string | null, emptyReason: string | null = null, breakdown?: Val['breakdown']) => values.push({ key, value, emptyReason: value === null ? emptyReason ?? 'No data in this period' : null, ...(breakdown ? { breakdown } : {}) });
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

    // Requests and supply (farmer / coop / platform scopes).
    const requestWhere: Prisma.HarvestRequestWhereInput =
      scope.kind === 'farmer' ? { farmerProfileId: scope.id! } : scope.kind === 'cooperative' ? { farmerProfileId: { in: ((bookingWhere as { farmerProfileId: { in: string[] } }).farmerProfileId.in) } } : {};
    if (['platform', 'farmer', 'cooperative'].includes(scope.kind)) {
      v('requests_published', await db.harvestRequest.count({ where: { ...requestWhere, isDemo, publishedAt: inRange } }));
      const open = await db.harvestRequest.findMany({ where: { ...requestWhere, isDemo, status: 'PUBLISHED' }, include: { lots: { where: { status: { not: 'RELEASED' } } } } });
      const unallocated = open.reduce((s, r) => s + (toGrams(r.eligibleQuantityKg) - r.lots.reduce((x, l) => x + toGrams(l.quantityKg), 0n)), 0n);
      v('unallocated_kg', open.length ? gramsToKgString(unallocated > 0n ? unallocated : 0n) : null, 'No published requests');
    }

    const bookings = await db.booking.findMany({
      where: { AND: [bw, { createdAt: inRange }] },
      include: { termsVersions: true, shipments: true, harvestLot: true, processingRecord: true },
    });
    const byStatus = new Map<string, number>();
    bookings.forEach((b) => byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1));
    v('bookings_by_status', bookings.length || null, 'No bookings in this period', Array.from(byStatus.entries()).map(([label, value]) => ({ label, value })));

    if (['platform', 'processor'].includes(scope.kind)) {
      const slots = await db.processingSlot.findMany({ where: { startsAt: inRange, status: { not: 'CANCELLED' }, isDemo, ...(scope.kind === 'processor' ? { facility: { organisationId: scope.id! } } : {}) }, select: { id: true } });
      const usage = await slotUsageMany(db, slots.map((s) => s.id), new Date());
      let held = 0n, committed = 0n, consumed = 0n, limit = 0n;
      usage.forEach((u) => {
        held += u.heldG;
        committed += u.committedG;
        consumed += u.consumedG;
        limit += u.limitG;
      });
      v('slot_capacity', slots.length ? gramsToKgString(limit) : null, 'No slots in this period', [
        { label: 'Held (unexpired)', value: gramsToKgString(held) },
        { label: 'Committed', value: gramsToKgString(committed) },
        { label: 'Consumed', value: gramsToKgString(consumed) },
        { label: 'Unused', value: gramsToKgString(limit - held - committed - consumed > 0n ? limit - held - committed - consumed : 0n) },
      ]);
    }

    const confirmed = await db.booking.findMany({ where: { AND: [bw, { confirmedAt: inRange }] }, select: { createdAt: true, confirmedAt: true } });
    v('confirmation_lead_time', avg(confirmed.map((b) => (b.confirmedAt!.getTime() - b.createdAt.getTime()) / 3_600_000)), 'No bookings confirmed in this period');

    const shipments = await db.shipment.findMany({
      where: { status: { not: 'CANCELLED' }, booking: bw, OR: [{ pickupConfirmedAt: inRange }, { deliveredAt: inRange }] },
      include: { booking: { include: { termsVersions: true, harvestLot: true, processingRecord: true } } },
    });
    const terms = (b: { termsVersions: Array<{ versionNo: number; content: unknown }>; currentTermsVersionNo: number }) => b.termsVersions.find((t) => t.versionNo === b.currentTermsVersionNo)?.content as BookingTermsContent | undefined;
    const pickups = shipments.filter((s) => s.pickupConfirmedAt && s.pickupConfirmedAt >= fromAt && s.pickupConfirmedAt < toAt);
    const onTimePickups = pickups.filter((s) => {
      const c = terms(s.booking);
      return c && s.pickupConfirmedAt! <= new Date(c.pickupWindow.end);
    });
    v('pickup_punctuality', pickups.length ? Math.round((onTimePickups.length / pickups.length) * 100) : null, 'No confirmed pickups in this period', [{ label: 'Pickups', value: pickups.length }]);
    const deliveries = shipments.filter((s) => s.deliveredAt && s.deliveredAt >= fromAt && s.deliveredAt < toAt);
    const onTimeDeliveries = deliveries.filter((s) => {
      const c = terms(s.booking);
      return c && s.deliveredAt! <= new Date(c.deliveryWindow.end);
    });
    v('delivery_punctuality', deliveries.length ? Math.round((onTimeDeliveries.length / deliveries.length) * 100) : null, 'No deliveries in this period', [{ label: 'Deliveries', value: deliveries.length }]);
    v('harvest_to_receipt', avg(deliveries.filter((s) => s.booking.harvestLot?.harvestStartedAt).map((s) => (s.deliveredAt!.getTime() - s.booking.harvestLot!.harvestStartedAt!.getTime()) / 3_600_000)), 'No deliveries with a recorded harvest start');
    const processed = await db.processingRecord.findMany({ where: { startedAt: inRange, booking: bw }, include: { booking: { include: { harvestLot: true } } } });
    v('harvest_to_processing', avg(processed.filter((p) => p.booking.harvestLot?.harvestStartedAt).map((p) => (p.startedAt!.getTime() - p.booking.harvestLot!.harvestStartedAt!.getTime()) / 3_600_000)), 'Nothing processed in this period');

    const cancelled = await db.booking.findMany({ where: { AND: [bw, { cancelledAt: inRange }] }, select: { cancelledByParty: true } });
    const now = new Date();
    const confirmedOpen = await db.booking.findMany({ where: { AND: [bw, { status: 'CONFIRMED' }] }, include: { termsVersions: true, harvestLot: true } });
    const noShows = confirmedOpen.filter((b) => {
      const c = terms(b);
      return c && new Date(c.pickupWindow.end) < now && b.harvestLot?.status === 'ALLOCATED';
    }).length;
    const expired = await db.booking.count({ where: { AND: [bw, { expiredAt: inRange }] } });
    const cancelBreakdown = ['FARMER', 'PROCESSOR', 'TRANSPORTER', 'ADMIN'].map((p) => ({ label: `Cancelled by ${p.toLowerCase()}`, value: cancelled.filter((c) => c.cancelledByParty === p).length }));
    v('cancellations', cancelled.length + noShows, null, [...cancelBreakdown, { label: 'No-shows (pickup window missed)', value: noShows }, { label: 'Expired before confirmation', value: expired }]);

    const qa = await db.qualityAssessment.findMany({ where: { createdAt: inRange, receivingRecord: { booking: bw } } });
    const accepted = qa.reduce((s, x) => s + toGrams(x.acceptedKg), 0n);
    const rejected = qa.reduce((s, x) => s + toGrams(x.rejectedKg), 0n);
    const reasons = new Map<string, number>();
    qa.forEach((x) => x.rejectionReasons.forEach((r) => reasons.set(r, (reasons.get(r) ?? 0) + 1)));
    v('accepted_rejected', qa.length ? gramsToKgString(accepted) : null, 'No quality decisions in this period', [
      { label: 'Accepted kg', value: gramsToKgString(accepted) },
      { label: 'Rejected kg', value: gramsToKgString(rejected) },
      ...Array.from(reasons.entries()).map(([label, value]) => ({ label: `Reason: ${label.toLowerCase().replace(/_/g, ' ')}`, value })),
    ]);

    // Money: separate obligations, never netted; invoice value is not cash received.
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      isDemo,
      ...(scope.kind === 'processor' ? { OR: [{ payerOrgId: scope.id! }, { payeeOrgId: scope.id! }] } : {}),
      ...(scope.kind === 'transporter' ? { OR: [{ payeeOrgId: scope.id! }, { payerOrgId: scope.id! }] } : {}),
      ...(scope.kind === 'farmer' ? { OR: [{ payeeFarmerId: scope.id! }, { payerFarmerId: scope.id! }] } : {}),
      ...(scope.kind === 'cooperative' ? { booking: bookingWhere } : {}),
    };
    const openInv = await db.invoice.findMany({ where: { ...invoiceWhere, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, include: { payments: true } });
    const outstanding = openInv.reduce((s, i) => s + (i.totalKobo - i.confirmedPaidKobo), 0n);
    const overdue = openInv.filter((i) => i.dueAt < now).reduce((s, i) => s + (i.totalKobo - i.confirmedPaidKobo), 0n);
    const reported = openInv.flatMap((i) => i.payments).filter((p) => p.status === 'REPORTED').reduce((s, p) => s + p.amountKobo, 0n);
    const confirmedPayments = await db.paymentAttempt.findMany({
      where: { invoice: invoiceWhere, status: { in: ['CONFIRMED_BY_RECIPIENT', 'PROVIDER_SUCCESS'] }, updatedAt: inRange, ...(isDemo ? {} : { verificationLevel: { not: 'SIMULATED' } }) },
      include: { invoice: { select: { kind: true } } },
    });
    // Scope cooperative: aggregated only; individual members' finances are not itemised.
    v('payments', Number(outstanding), null, [
      { label: 'Outstanding on open invoices', value: Number(outstanding) },
      { label: 'Of which overdue', value: Number(overdue) },
      { label: 'Reported, awaiting recipient confirmation', value: Number(reported) },
      { label: 'Confirmed received in period', value: Number(confirmedPayments.reduce((s, p) => s + p.amountKobo, 0n)) },
    ]);
    const issued = await db.invoice.findMany({ where: { ...invoiceWhere, issuedAt: inRange } });
    const sumKind = (k: string) => issued.filter((i) => i.kind === k).reduce((s, i) => s + i.totalKobo, 0n);
    v('produce_value', issued.some((i) => i.kind === 'PRODUCE') ? Number(sumKind('PRODUCE')) : null, 'No produce invoices in this period');
    v('freight_obligations', issued.some((i) => i.kind === 'FREIGHT') ? Number(sumKind('FREIGHT')) : null, 'No freight invoices in this period');
    if (scope.kind === 'platform' || scope.kind === 'processor') {
      const feesConfirmed = confirmedPayments.filter((p) => p.invoice.kind === 'PLATFORM_FEE').reduce((s, p) => s + p.amountKobo, 0n);
      v('platform_fees', issued.some((i) => i.kind === 'PLATFORM_FEE') ? Number(sumKind('PLATFORM_FEE')) : null, 'No fee invoices in this period', [{ label: 'Confirmed received', value: Number(feesConfirmed) }]);
    }
    v('farmer_receipts', Number(confirmedPayments.filter((p) => p.invoice.kind === 'PRODUCE').reduce((s, p) => s + p.amountKobo, 0n)) || null, 'No farmer receipts confirmed in this period');

    const losses = await db.lossRecord.findMany({ where: { createdAt: inRange, booking: bw } });
    const lossBreakdown = new Map<string, bigint>();
    losses.forEach((l) => lossBreakdown.set(`${l.stage.toLowerCase().replace('_', ' ')} (${l.method === 'MEASURED_WEIGHT' ? 'measured' : 'estimated'})`, (lossBreakdown.get(`${l.stage.toLowerCase().replace('_', ' ')} (${l.method === 'MEASURED_WEIGHT' ? 'measured' : 'estimated'})`) ?? 0n) + toGrams(l.quantityKg)));
    v('measured_losses', losses.length ? gramsToKgString(losses.reduce((s, l) => s + toGrams(l.quantityKg), 0n)) : null, 'No losses recorded in this period', Array.from(lossBreakdown.entries()).map(([label, g]) => ({ label, value: gramsToKgString(g) })));

    const visible = new Set(values.map((x) => x.key));
    return {
      scope: { kind: scope.kind, id: scope.id, name },
      dataScope: isDemo ? 'demo' : 'live',
      range: { from, to },
      generatedAt: now.toISOString(),
      definitions: METRICS.filter((m) => visible.has(m.key)),
      values,
      notes: [
        isDemo ? 'Demonstration data — fictional organisations and farmers. Not evidence of real activity.' : 'Live data only; demonstration records are excluded.',
        'HarvestSlot does not compute "tonnes saved", income uplift, jobs or emissions from bookings. Impact claims need baseline and pilot observations with a stated method.',
        'Invoice totals are obligations, not cash received; produce value is not HarvestSlot revenue.',
      ],
    };
  }
}
