'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  AlarmClock,
  CalendarClock,
  CalendarPlus,
  ClipboardCheck,
  Factory,
  FileWarning,
  Gauge,
  Handshake,
  Inbox,
  PackageOpen,
  Scale,
  Wallet,
} from 'lucide-react';
import {
  addDays,
  formatPricePerKg,
  lagosDateString,
  lagosStartOfDay,
  SHIPMENT_STATUS_LABELS,
  type BookingSummary,
  type InboxItem,
  type InvoiceDto,
  type OfferDto,
  type ShipmentStatus,
  type SlotDto,
} from '@harvestslot/contracts';
import { Badge, Table, Td, Th } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import {
  ActivityFeed,
  useNow,
  MobileRows,
  AttentionList,
  CapacityChart,
  compactNaira,
  DashboardHeader,
  greeting,
  KpiStrip,
  Panel,
  PanelEmpty,
  PanelLink,
  Pipeline,
  STAGE_RAMP,
  sumKg,
  todayLabel,
  tonnes,
  type CapacityDay,
} from '@/components/domain/dashboard';
import { can, useApi } from '@/lib/hooks';
import type { Workspace } from '@/lib/session';
import { OrgStatusAlert, useFirstName, windowLabel, type Page } from './shared';

interface IntakeRow {
  bookingId: string;
  reference: string;
  status: string;
  farmerName: string;
  quantityKg: string;
  lineName: string;
  deliveryWindow: { start: string; end: string };
  ready: boolean;
  transportStatus: string;
  receivingStatus: string | null;
  delayed: boolean;
}

function transportLabel(s: string) {
  if (s === 'AGREED') return 'Transport agreed';
  if (s === 'NOT_ARRANGED') return 'Not arranged';
  return SHIPMENT_STATUS_LABELS[s as ShipmentStatus] ?? s;
}

const DAY = new Intl.DateTimeFormat('en-NG', { weekday: 'short', timeZone: 'Africa/Lagos' });
const DATE = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
const DAYNUM = new Intl.DateTimeFormat('en-NG', { day: 'numeric', timeZone: 'Africa/Lagos' });

export function ProcessorDashboard({ w }: { w: Extract<Workspace, { kind: 'processor' }> }) {
  const firstName = useFirstName();
  const today = lagosDateString(new Date());
  const commercial = can(w, 'processor.offer.manage');
  const slotManager = can(w, 'processor.slot.manage');
  const finance = can(w, 'processor.invoice.view');

  const range = new URLSearchParams({
    from: lagosStartOfDay(today).toISOString(),
    to: lagosStartOfDay(addDays(today, 14)).toISOString(),
  }).toString();
  const slots = useApi<SlotDto[]>(
    ['slots', w.orgId, 'dashboard', today],
    `/organisations/${w.orgId}/slots?${range}`,
  );
  const intake = useApi<IntakeRow[]>(['intake', w.orgId], `/organisations/${w.orgId}/intake`);
  const bookings = useApi<Page<BookingSummary>>(
    ['bookings', w.orgId, 'dashboard'],
    `/bookings?view=processor&organisationId=${w.orgId}&limit=100`,
  );
  const inbox = useApi<InboxItem[]>(
    ['inbox', w.orgId],
    commercial ? `/organisations/${w.orgId}/inbox` : null,
  );
  const offers = useApi<OfferDto[]>(
    ['offers', w.orgId, 'open'],
    commercial ? `/organisations/${w.orgId}/offers` : null,
  );
  const payables = useApi<InvoiceDto[]>(
    ['invoices', w.orgId, 'payer-open'],
    finance ? `/invoices?organisationId=${w.orgId}&role=payer&status=OPEN` : null,
  );

  const days = useMemo<CapacityDay[]>(() => {
    const out: CapacityDay[] = [];
    for (let i = 0; i < 14; i++) {
      const date = addDays(today, i);
      const onDay = (slots.data ?? []).filter(
        (s) => s.status !== 'CANCELLED' && lagosDateString(new Date(s.startsAt)) === date,
      );
      const noon = lagosStartOfDay(date);
      out.push({
        date,
        weekday: i === 0 ? 'Today' : DAY.format(noon),
        day: i === 0 || DAYNUM.format(noon) === '1' ? DATE.format(noon) : DAYNUM.format(noon),
        slots: onDay.length,
        limitKg: sumKg(onDay.map((s) => s.usage.limitKg)),
        bookedKg: sumKg(onDay.flatMap((s) => [s.usage.committedKg, s.usage.consumedKg])),
        heldKg: sumKg(onDay.map((s) => s.usage.heldKg)),
        freeKg: sumKg(onDay.map((s) => s.usage.availableKg)),
      });
    }
    return out;
  }, [slots.data, today]);

  const now = useNow();
  const week = now + 7 * 86_400_000;
  const upcoming = (intake.data ?? [])
    .filter((r) => new Date(r.deliveryWindow.end).getTime() >= now - 86_400_000)
    .sort((a, b) => a.deliveryWindow.start.localeCompare(b.deliveryWindow.start));
  const nextWeek = upcoming.filter((r) => new Date(r.deliveryWindow.start).getTime() <= week);
  const delayed = upcoming.filter((r) => r.delayed);
  const all = bookings.data?.items ?? [];
  const count = (...s: string[]) => all.filter((b) => s.includes(b.status)).length;
  const limit = days.reduce((a, d) => a + d.limitKg, 0);
  const booked = days.reduce((a, d) => a + d.bookedKg + d.heldKg, 0);
  const free = days.reduce((a, d) => a + d.freeKg, 0);
  const newSupply = (inbox.data ?? []).filter((i) => !i.existingOfferId);
  const counterOffers = (offers.data ?? []).filter((o) => o.awaiting === 'PROCESSOR');
  const overdue = (payables.data ?? []).filter((i) => i.overdue);
  // The short buying journey: answer requests, send drafts, record weights and payments from the booking.
  const toAnswer = (inbox.data ?? []).filter((i) => i.request && !i.offer);
  const drafts = (inbox.data ?? []).filter((i) => i.offer?.status === 'DRAFT');
  const toWeigh = all.filter((b) => b.nextStep.forViewer?.includes('record the weight') && new Date(b.plan.window.start).getTime() <= now);
  const toPay = all.filter((b) => b.nextStep.forViewer?.startsWith('Record the payment'));

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        eyebrow={`${greeting()}${firstName ? `, ${firstName}` : ''} · ${todayLabel()}`}
        title={w.label}
        description="Buying slots, farmers’ requests and your bookings — agreed before anything is harvested."
        actions={
          <>
            {commercial ? (
              <Button asChild variant="outline">
                <Link href="/processor/inbox">
                  <Inbox className="size-4" aria-hidden /> Requests
                </Link>
              </Button>
            ) : null}
            {slotManager ? (
              <Button asChild>
                <Link href="/processor/capacity">
                  <CalendarPlus className="size-4" aria-hidden /> Buying slots
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <OrgStatusAlert workspace={w} />

      <KpiStrip
        items={[
          {
            label: 'Intake, next 7 days',
            icon: Factory,
            href: '/processor/intake',
            value: intake.data ? tonnes(sumKg(nextWeek.map((r) => r.quantityKg))) : undefined,
            sub: intake.data ? (
              <>
                <span>
                  {nextWeek.length} deliver{nextWeek.length === 1 ? 'y' : 'ies'}
                </span>
                {delayed.length ? <Badge tone="danger">{delayed.length} late</Badge> : null}
              </>
            ) : null,
          },
          {
            label: 'Buying slots taken, next 14 days',
            icon: Gauge,
            href: '/processor/capacity',
            value: slots.data ? (limit ? `${Math.round((booked / limit) * 100)}%` : 'No slots') : undefined,
            meter:
              slots.data && limit
                ? { value: booked / limit, label: 'Share of published capacity booked or held' }
                : undefined,
            sub: slots.data
              ? limit
                ? `${tonnes(booked)} booked or held · ${tonnes(free)} free`
                : 'Publish slots so farmers can be matched'
              : null,
          },
          commercial
            ? {
                label: 'Open supply in your area',
                icon: PackageOpen,
                href: '/processor/inbox',
                value: inbox.data ? tonnes(sumKg(newSupply.map((i) => i.remainingKg))) : undefined,
                sub: inbox.data
                  ? `${newSupply.length} harvest request${newSupply.length === 1 ? '' : 's'} without your offer`
                  : null,
              }
            : {
                label: 'Awaiting confirmation',
                icon: Handshake,
                href: '/bookings',
                value: bookings.data ? count('AWAITING_CONFIRMATIONS') : undefined,
                sub: 'Bookings not yet confirmed by every party',
              },
          finance
            ? {
                label: 'Payables outstanding',
                icon: Wallet,
                href: '/invoices',
                value: payables.data
                  ? compactNaira(payables.data.reduce((a, i) => a + i.outstandingKobo, 0))
                  : undefined,
                sub: payables.data ? (
                  <>
                    <span>
                      {payables.data.length} open invoice{payables.data.length === 1 ? '' : 's'}
                    </span>
                    {overdue.length ? <Badge tone="danger">{overdue.length} overdue</Badge> : null}
                  </>
                ) : null,
              }
            : {
                label: 'Harvests in progress',
                icon: ClipboardCheck,
                href: '/bookings',
                value: bookings.data ? count('ACTIVE') : undefined,
                sub: 'Harvested, in transit or being received',
              },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Panel
            title="Processing capacity"
            description="Next 14 days, all your buying slots"
            action={<PanelLink href="/processor/capacity">Manage</PanelLink>}
          >
            {slots.isLoading ? (
              <div className="h-[280px] animate-pulse rounded-xl bg-canvas" />
            ) : limit === 0 ? (
              <PanelEmpty
                icon={CalendarClock}
                title="No capacity published for the next 14 days"
                action={
                  slotManager ? (
                    <Button asChild size="sm">
                      <Link href="/processor/capacity">Publish a buying slot</Link>
                    </Button>
                  ) : null
                }
              >
                Farmers can only be matched to slots you publish.
              </PanelEmpty>
            ) : (
              <CapacityChart days={days} caption="Processing capacity per day for the next 14 days" />
            )}
          </Panel>

          <Panel
            title="Upcoming intake"
            description="Collections and deliveries agreed with farmers"
            action={<PanelLink href="/processor/intake">Intake schedule</PanelLink>}
            bodyClassName="p-0"
          >
            {upcoming.length === 0 ? (
              <PanelEmpty icon={Factory} title="No deliveries scheduled">
                Confirmed bookings appear here with their delivery windows.
              </PanelEmpty>
            ) : (
              <>
                <MobileRows
                  rows={upcoming.slice(0, 6).map((r) => {
                    const wl = windowLabel(r.deliveryWindow.start, r.deliveryWindow.end);
                    return {
                      key: r.bookingId,
                      href: `/bookings/${r.bookingId}`,
                      title: (
                        <>
                          <span className="font-mono text-[13px]">{r.reference}</span> · {r.farmerName}
                        </>
                      ),
                      meta: `${wl.day}, ${wl.time} · ${transportLabel(r.transportStatus)}`,
                      aside: (
                        <>
                          <span className="text-sm font-semibold tabular text-ink">
                            {tonnes(sumKg([r.quantityKg]))}
                          </span>
                          {r.delayed ? (
                            <Badge tone="danger">Late</Badge>
                          ) : r.ready ? (
                            <Badge tone="success">Ready</Badge>
                          ) : (
                            <Badge tone="warning">Not ready</Badge>
                          )}
                        </>
                      ),
                    };
                  })}
                />
                <div className="hidden md:block">
                  <Table caption="Upcoming intake" bare className="min-w-[680px]">
                    <thead>
                      <tr>
                        <Th className="pl-5">Delivery</Th>
                        <Th>Booking</Th>
                        <Th className="text-right">Quantity</Th>
                        <Th>Transport</Th>
                        <Th className="pr-5">Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcoming.slice(0, 6).map((r) => {
                        const wl = windowLabel(r.deliveryWindow.start, r.deliveryWindow.end);
                        return (
                          <tr key={r.bookingId} className="hover:bg-canvas/60">
                            <Td className="pl-5">
                              <span className="block whitespace-nowrap font-medium text-ink">{wl.day}</span>
                              <span className="whitespace-nowrap text-[13px] text-muted tabular">
                                {wl.time}
                              </span>
                            </Td>
                            <Td>
                              <Link
                                href={`/bookings/${r.bookingId}`}
                                className="font-mono text-[13px] font-semibold text-ink hover:underline"
                              >
                                {r.reference}
                              </Link>
                              <span className="block text-[13px] text-muted">
                                {r.farmerName} · {r.lineName}
                              </span>
                            </Td>
                            <Td className="text-right font-medium tabular text-ink">
                              {tonnes(sumKg([r.quantityKg]))}
                            </Td>
                            <Td className="text-[13px] text-muted">{transportLabel(r.transportStatus)}</Td>
                            <Td className="pr-5">
                              {r.delayed ? (
                                <Badge tone="danger">
                                  <AlarmClock className="size-3.5" aria-hidden /> Late
                                </Badge>
                              ) : r.ready ? (
                                <Badge tone="success">Ready</Badge>
                              ) : (
                                <Badge tone="warning">Not ready</Badge>
                              )}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              </>
            )}
          </Panel>

          {commercial ? (
            <Panel
              title="New supply in your area"
              description="Farmers’ harvests that fit your buying slots, best match first"
              action={<PanelLink href="/processor/inbox">Requests</PanelLink>}
              bodyClassName="p-0"
            >
              {newSupply.length === 0 ? (
                <PanelEmpty icon={Inbox} title="No new harvest requests">
                  Requests that match your capacity and service area appear here.
                </PanelEmpty>
              ) : (
                <>
                  <MobileRows
                    rows={[...newSupply]
                      .sort((a, b) => b.bestFacility.score - a.bestFacility.score)
                      .slice(0, 5)
                      .map((i) => ({
                        key: i.harvestRequestId,
                        href: '/processor/inbox',
                        title: (
                          <>
                            <span className="font-mono text-[13px]">{i.reference}</span> · {i.lga}
                          </>
                        ),
                        meta: `${DATE.format(lagosStartOfDay(i.earliestHarvestDate))} – ${DATE.format(lagosStartOfDay(i.latestHarvestDate))} · ${i.bestFacility.straightLineKm.toFixed(0)} km`,
                        aside: (
                          <>
                            <span className="text-sm font-semibold tabular text-ink">
                              {tonnes(sumKg([i.remainingKg]))}
                            </span>
                            <span className="text-xs text-muted">
                              {i.minPriceKoboPerKg !== null
                                ? `min ${formatPricePerKg(i.minPriceKoboPerKg)}`
                                : 'Open price'}
                            </span>
                          </>
                        ),
                      }))}
                  />
                  <div className="hidden md:block">
                    <Table caption="New supply in your area" bare className="min-w-[680px]">
                      <thead>
                        <tr>
                          <Th className="pl-5">Request</Th>
                          <Th>Harvest window</Th>
                          <Th className="text-right">Available</Th>
                          <Th className="text-right">Min. price</Th>
                          <Th className="pr-5 text-right">Distance</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...newSupply]
                          .sort((a, b) => b.bestFacility.score - a.bestFacility.score)
                          .slice(0, 5)
                          .map((i) => (
                            <tr key={i.harvestRequestId} className="hover:bg-canvas/60">
                              <Td className="pl-5">
                                <Link
                                  href="/processor/inbox"
                                  className="font-mono text-[13px] font-semibold text-ink hover:underline"
                                >
                                  {i.reference}
                                </Link>
                                <span className="block text-[13px] text-muted">
                                  {i.farmerName} · {i.community ? `${i.community}, ` : ''}
                                  {i.lga}
                                </span>
                              </Td>
                              <Td className="text-[13px] text-ink">
                                {DATE.format(lagosStartOfDay(i.earliestHarvestDate))} –{' '}
                                {DATE.format(lagosStartOfDay(i.latestHarvestDate))}
                                {i.invited ? (
                                  <Badge tone="info" className="ml-2">
                                    Invited
                                  </Badge>
                                ) : null}
                              </Td>
                              <Td className="text-right font-medium tabular text-ink">
                                {tonnes(sumKg([i.remainingKg]))}
                              </Td>
                              <Td className="text-right tabular text-[13px]">
                                {i.minPriceKoboPerKg !== null ? (
                                  formatPricePerKg(i.minPriceKoboPerKg)
                                ) : (
                                  <span className="text-muted">Open</span>
                                )}
                              </Td>
                              <Td className="pr-5 text-right tabular text-[13px] text-muted">
                                {i.bestFacility.straightLineKm.toFixed(0)} km
                              </Td>
                            </tr>
                          ))}
                      </tbody>
                    </Table>
                  </div>
                </>
              )}
            </Panel>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Needs attention">
            <AttentionList
              items={[
                ...(commercial
                  ? [
                      { label: 'Harvest requests to review', detail: 'Farmers asked you directly', count: inbox.data ? toAnswer.length : undefined, href: '/processor/inbox', icon: Inbox, tone: 'warning' as const },
                      { label: 'Draft offers to send', detail: 'Decide collection or delivery', count: inbox.data ? drafts.length : undefined, href: '/processor/inbox', icon: Handshake, tone: 'info' as const },
                      { label: 'Counter-offers to answer', detail: 'Farmers proposed different terms', count: offers.data ? counterOffers.length : undefined, href: '/processor/inbox', icon: Handshake, tone: 'info' as const },
                    ]
                  : []),
                { label: 'Weights to record', detail: 'Handover time has come', count: bookings.data ? toWeigh.length : undefined, href: '/bookings', icon: Scale, tone: 'warning' },
                { label: 'Handovers running late', detail: 'Past the agreed time, no weight yet', count: intake.data ? delayed.length : undefined, href: '/processor/intake', icon: AlarmClock, tone: 'danger' },
                ...(finance
                  ? [
                      { label: 'Payments to record', detail: 'Weighed and not yet paid', count: bookings.data ? toPay.length : undefined, href: '/bookings', icon: FileWarning, tone: 'warning' as const },
                      { label: 'Overdue invoices', detail: 'Past their due date', count: payables.data ? overdue.length : undefined, href: '/invoices', icon: FileWarning, tone: 'danger' as const },
                    ]
                  : []),
              ]}
            />
          </Panel>

          <Panel
            title="Booking pipeline"
            description="Every booking with your organisation"
            action={<PanelLink href="/bookings" />}
          >
            <Pipeline
              stages={[
                {
                  label: 'Waiting for a confirmation',
                  count: count('DRAFT', 'AWAITING_CONFIRMATIONS'),
                  color: STAGE_RAMP[0],
                },
                { label: 'Confirmed', count: count('CONFIRMED'), color: STAGE_RAMP[1] },
                { label: 'Handed over / being weighed', count: count('ACTIVE'), color: STAGE_RAMP[2] },
                { label: 'Completed', count: count('COMPLETED'), color: STAGE_RAMP[3] },
              ]}
              footnote={
                count('CANCELLED', 'EXPIRED')
                  ? `${count('CANCELLED', 'EXPIRED')} cancelled or expired not shown.`
                  : undefined
              }
            />
          </Panel>

          <Panel title="Recent activity" action={<PanelLink href="/notifications" />}>
            <ActivityFeed />
          </Panel>
        </div>
      </div>
    </div>
  );
}
