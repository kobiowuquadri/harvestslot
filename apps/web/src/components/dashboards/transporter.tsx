'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Flag,
  MapPin,
  Navigation,
  Route,
  Send,
  Truck,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  SHIPMENT_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  type InvoiceDto,
  type JobDto,
  type OpportunityDto,
  type ShipmentStatus,
  type VehicleDto,
} from '@harvestslot/contracts';
import {
  ActivityFeed,
  useNow,
  MobileRows,
  AttentionList,
  compactNaira,
  DashboardHeader,
  Facts,
  greeting,
  KpiStrip,
  Panel,
  PanelEmpty,
  PanelLink,
  ProgressSteps,
  sumKg,
  todayLabel,
  tonnes,
} from '@/components/domain/dashboard';
import { Button } from '@/components/ui/button';
import { Badge, Table, Td, Th } from '@/components/ui/primitives';
import { can, useApi } from '@/lib/hooks';
import type { Workspace } from '@/lib/session';
import { OrgStatusAlert, useFirstName, windowLabel } from './shared';

const STAGES: ShipmentStatus[] = [
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'COLLECTED',
  'PICKUP_CONFIRMED',
  'IN_TRANSIT',
  'ARRIVED_AT_FACILITY',
  'DELIVERED',
];
const progress = (s: ShipmentStatus) => Math.max(0, STAGES.indexOf(s)) / (STAGES.length - 1);
const isActive = (j: JobDto) => !['DELIVERED', 'CANCELLED'].includes(j.status);
const lagosDay = (iso: string | number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(iso));

function JobProgress({ status }: { status: ShipmentStatus }) {
  const pct = Math.round(progress(status) * 100);
  return (
    <div className="min-w-32">
      <span className="text-[13px] font-medium text-ink">{SHIPMENT_STATUS_LABELS[status]}</span>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-leaf-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Job progress"
      >
        <div className="h-full rounded-full bg-forest" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
    </div>
  );
}

export function TransporterDashboard({ w }: { w: Extract<Workspace, { kind: 'transporter' }> }) {
  return can(w, 'transport.quote.manage') ? <DispatchDashboard w={w} /> : <DriverDashboard w={w} />;
}

function DispatchDashboard({ w }: { w: Extract<Workspace, { kind: 'transporter' }> }) {
  const firstName = useFirstName();
  const owner = can(w, 'transport.invoice.manage');
  const jobs = useApi<JobDto[]>(['jobs', w.orgId], `/organisations/${w.orgId}/jobs`);
  const opportunities = useApi<OpportunityDto[]>(
    ['opportunities', w.orgId],
    `/organisations/${w.orgId}/opportunities`,
  );
  const vehicles = useApi<VehicleDto[]>(['vehicles', w.orgId], `/organisations/${w.orgId}/vehicles`);
  const receivables = useApi<InvoiceDto[]>(
    ['invoices', w.orgId, 'payee-open'],
    owner ? `/invoices?organisationId=${w.orgId}&role=payee&status=OPEN` : null,
  );

  const active = (jobs.data ?? [])
    .filter(isActive)
    .sort((a, b) => a.pickupWindow.start.localeCompare(b.pickupWindow.start));
  const now = useNow();
  const today = lagosDay(now);
  const todayJobs = active.filter((j) => lagosDay(j.pickupWindow.start) === today);
  const opps = opportunities.data ?? [];
  const toQuote = opps.filter((o) => !o.myQuote);
  const replacements = toQuote.filter((o) => o.reason === 'REPLACEMENT');
  const pending = opps.filter((o) => o.myQuote?.status === 'SUBMITTED');
  const fleet = (vehicles.data ?? []).filter((v) => v.status !== 'RETIRED');
  const inService = fleet.filter((v) => v.status === 'ACTIVE');
  const soon = now + 24 * 3_600_000;
  const free = inService.filter(
    (v) => !v.nextCommitment || new Date(v.nextCommitment.startsAt).getTime() > soon,
  );
  const outstanding = (receivables.data ?? []).reduce((a, i) => a + i.outstandingKobo, 0);

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        eyebrow={`${greeting()}${firstName ? `, ${firstName}` : ''} · ${todayLabel()}`}
        title={w.label}
        description="Loads in your service area, quotes, and every job from farm gate to facility."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/transport/fleet">
                <Truck className="size-4" aria-hidden /> Fleet
              </Link>
            </Button>
            <Button asChild>
              <Link href="/transport/opportunities">
                <Send className="size-4" aria-hidden /> Find loads
              </Link>
            </Button>
          </>
        }
      />
      <OrgStatusAlert workspace={w} />

      <KpiStrip
        items={[
          {
            label: 'Loads to quote',
            icon: Route,
            href: '/transport/opportunities',
            value: opportunities.data ? toQuote.length : undefined,
            sub: opportunities.data ? (
              <>
                <span>{tonnes(sumKg(toQuote.map((o) => o.quantityKg)))} in your area</span>
                {replacements.length ? <Badge tone="warning">{replacements.length} replacement</Badge> : null}
              </>
            ) : null,
          },
          {
            label: 'Quotes awaiting decision',
            icon: Send,
            href: '/transport/quotes',
            value: opportunities.data ? pending.length : undefined,
            sub: opportunities.data
              ? pending.length
                ? `${compactNaira(pending.reduce((a, o) => a + (o.myQuote?.priceKobo ?? 0), 0))} quoted`
                : 'No quotes pending'
              : null,
          },
          {
            label: 'Active jobs',
            icon: Navigation,
            href: '/transport/jobs',
            value: jobs.data ? active.length : undefined,
            sub: jobs.data ? `${todayJobs.length} pickup${todayJobs.length === 1 ? '' : 's'} today` : null,
          },
          owner
            ? {
                label: 'Freight receivable',
                icon: Wallet,
                href: '/invoices',
                value: receivables.data ? compactNaira(outstanding) : undefined,
                sub: receivables.data
                  ? `${receivables.data.length} open invoice${receivables.data.length === 1 ? '' : 's'}`
                  : null,
              }
            : {
                label: 'Vehicles free in the next 24 h',
                icon: Truck,
                href: '/transport/fleet',
                value: vehicles.data ? `${free.length} / ${inService.length}` : undefined,
                meter:
                  vehicles.data && inService.length
                    ? {
                        value: free.length / inService.length,
                        label: 'Share of vehicles free in the next 24 hours',
                      }
                    : undefined,
              },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Panel
            title="Job board"
            description="Active jobs by pickup time"
            action={<PanelLink href="/transport/jobs">All jobs</PanelLink>}
            bodyClassName="p-0"
          >
            {active.length === 0 ? (
              <PanelEmpty icon={Navigation} title="No active jobs">
                Jobs appear here once a quote is accepted and a driver confirmed.
              </PanelEmpty>
            ) : (
              <>
                <MobileRows
                  rows={active.slice(0, 6).map((j) => {
                    const wl = windowLabel(j.pickupWindow.start, j.pickupWindow.end);
                    return {
                      key: j.shipmentId,
                      href: `/transport/jobs/${j.shipmentId}`,
                      title: (
                        <>
                          <span className="font-mono text-[13px]">{j.bookingReference}</span> · {j.pickup.lga}{' '}
                          → {j.destination.facilityName}
                        </>
                      ),
                      meta: `${wl.day}, ${wl.time} · ${j.vehicle.plate} · ${j.driver.name}`,
                      extra: <JobProgress status={j.status} />,
                      aside: (
                        <span className="text-sm font-semibold tabular text-ink">
                          {tonnes(sumKg([j.quantityKg]))}
                        </span>
                      ),
                    };
                  })}
                />
                <div className="hidden md:block">
                  <Table caption="Active jobs" bare className="min-w-[700px]">
                    <thead>
                      <tr>
                        <Th className="pl-5">Pickup</Th>
                        <Th>Job</Th>
                        <Th className="text-right">Load</Th>
                        <Th>Vehicle and driver</Th>
                        <Th className="pr-5">Progress</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.slice(0, 6).map((j) => {
                        const wl = windowLabel(j.pickupWindow.start, j.pickupWindow.end);
                        return (
                          <tr key={j.shipmentId} className="hover:bg-canvas/60">
                            <Td className="pl-5">
                              <span className="block whitespace-nowrap font-medium text-ink">{wl.day}</span>
                              <span className="whitespace-nowrap text-[13px] text-muted tabular">
                                {wl.time}
                              </span>
                            </Td>
                            <Td>
                              <Link
                                href={`/transport/jobs/${j.shipmentId}`}
                                className="font-mono text-[13px] font-semibold text-ink hover:underline"
                              >
                                {j.bookingReference}
                              </Link>
                              <span className="block text-[13px] text-muted">
                                {j.pickup.lga} → {j.destination.facilityName}
                              </span>
                            </Td>
                            <Td className="text-right font-medium tabular text-ink">
                              {tonnes(sumKg([j.quantityKg]))}
                            </Td>
                            <Td className="text-[13px]">
                              <span className="block font-medium text-ink">{j.vehicle.plate}</span>
                              <span className="text-muted">{j.driver.name}</span>
                            </Td>
                            <Td className="pr-5">
                              <JobProgress status={j.status} />
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

          <Panel
            title="Open loads"
            description="Harvests in your service area that still need transport"
            action={<PanelLink href="/transport/opportunities">Find loads</PanelLink>}
            bodyClassName="p-0"
          >
            {toQuote.length === 0 ? (
              <PanelEmpty icon={Route} title="No loads waiting for a quote">
                Confirmed bookings in your service areas appear here.
              </PanelEmpty>
            ) : (
              <>
                <MobileRows
                  rows={toQuote.slice(0, 5).map((o) => {
                    const wl = windowLabel(o.pickupWindow.start, o.pickupWindow.end);
                    return {
                      key: o.bookingId,
                      href: '/transport/opportunities',
                      title: `${o.pickupLga} → ${o.facilityLga}`,
                      meta: `${wl.day}, ${wl.time} · ${o.straightLineKm.toFixed(0)} km · ${o.facilityName}`,
                      aside: (
                        <>
                          <span className="text-sm font-semibold tabular text-ink">
                            {tonnes(sumKg([o.quantityKg]))}
                          </span>
                          {o.reason === 'REPLACEMENT' ? <Badge tone="warning">Replacement</Badge> : null}
                        </>
                      ),
                    };
                  })}
                />
                <div className="hidden md:block">
                  <Table caption="Open loads" bare className="min-w-[680px]">
                    <thead>
                      <tr>
                        <Th className="pl-5">Route</Th>
                        <Th>Pickup window</Th>
                        <Th className="text-right">Load</Th>
                        <Th className="text-right">Distance</Th>
                        <Th className="pr-5">Freight paid by</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {toQuote.slice(0, 5).map((o) => {
                        const wl = windowLabel(o.pickupWindow.start, o.pickupWindow.end);
                        return (
                          <tr key={o.bookingId} className="hover:bg-canvas/60">
                            <Td className="pl-5">
                              <Link
                                href="/transport/opportunities"
                                className="font-medium text-ink hover:underline"
                              >
                                {o.pickupCommunity ? `${o.pickupCommunity}, ` : ''}
                                {o.pickupLga} → {o.facilityLga}
                              </Link>
                              <span className="block text-[13px] text-muted">
                                {o.bookingReference} · {o.facilityName}
                                {o.reason === 'REPLACEMENT' ? (
                                  <Badge tone="warning" className="ml-2">
                                    Replacement
                                  </Badge>
                                ) : null}
                              </span>
                            </Td>
                            <Td className="text-[13px]">
                              <span className="block whitespace-nowrap text-ink">{wl.day}</span>
                              <span className="whitespace-nowrap text-muted tabular">{wl.time}</span>
                            </Td>
                            <Td className="text-right font-medium tabular text-ink">
                              {tonnes(sumKg([o.quantityKg]))}
                            </Td>
                            <Td className="text-right tabular text-[13px] text-muted">
                              {o.straightLineKm.toFixed(0)} km
                            </Td>
                            <Td className="pr-5 text-[13px] text-ink">
                              {o.freightPayer === 'PROCESSOR' ? 'Processor' : 'Farmer'}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              </>
            )}
            {toQuote.length ? (
              <p className="border-t border-line px-5 py-3 text-xs text-muted">
                Distances are straight-line estimates, not road routes.
              </p>
            ) : null}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Needs attention">
            <AttentionList
              items={[
                {
                  label: 'Replacement loads',
                  detail: 'Another transporter cancelled',
                  count: opportunities.data ? replacements.length : undefined,
                  href: '/transport/opportunities',
                  icon: Flag,
                  tone: 'danger',
                },
                {
                  label: 'Loads to quote',
                  detail: 'New in your service area',
                  count: opportunities.data ? toQuote.length - replacements.length : undefined,
                  href: '/transport/opportunities',
                  icon: Route,
                  tone: 'warning',
                },
                {
                  label: 'Pickups today',
                  detail: 'Check drivers are on their way',
                  count: jobs.data ? todayJobs.length : undefined,
                  href: '/transport/jobs',
                  icon: CalendarClock,
                  tone: 'info',
                },
                {
                  label: 'Vehicles in maintenance',
                  detail: 'Not available for new jobs',
                  count: vehicles.data ? fleet.filter((v) => v.status === 'MAINTENANCE').length : undefined,
                  href: '/transport/fleet',
                  icon: Wrench,
                  tone: 'neutral',
                },
              ]}
            />
          </Panel>

          <Panel
            title="Fleet"
            description={
              vehicles.data
                ? `${inService.length} in service · ${free.length} free in the next 24 h`
                : undefined
            }
            action={<PanelLink href="/transport/fleet">Manage</PanelLink>}
          >
            {fleet.length === 0 ? (
              <p className="text-sm text-muted">No vehicles registered yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {fleet.slice(0, 5).map((v) => {
                  const busy = v.nextCommitment && new Date(v.nextCommitment.startsAt).getTime() <= soon;
                  return (
                    <li key={v.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-lg bg-canvas text-muted ring-1 ring-line"
                        aria-hidden
                      >
                        <Truck className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{v.registrationPlate}</span>
                        <span className="block truncate text-[13px] text-muted">
                          {VEHICLE_TYPE_LABELS[v.type]} · {tonnes(sumKg([v.capacityKg]))}
                        </span>
                      </span>
                      {v.status === 'MAINTENANCE' ? (
                        <Badge tone="warning">Maintenance</Badge>
                      ) : busy ? (
                        <Badge tone="info">On a job</Badge>
                      ) : (
                        <Badge tone="success">Free</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity" action={<PanelLink href="/notifications" />}>
            <ActivityFeed limit={5} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function DriverDashboard({ w }: { w: Extract<Workspace, { kind: 'transporter' }> }) {
  const firstName = useFirstName();
  const jobs = useApi<JobDto[]>(['jobs', w.orgId], `/organisations/${w.orgId}/jobs`);
  const active = (jobs.data ?? [])
    .filter(isActive)
    .sort((a, b) => a.pickupWindow.start.localeCompare(b.pickupWindow.start));
  const delivered = (jobs.data ?? []).filter((j) => j.status === 'DELIVERED');
  const now = useNow();
  const today = lagosDay(now);
  const next = active[0];
  const stepsFor = (s: ShipmentStatus) => {
    const i = STAGES.indexOf(s);
    return [
      { label: 'To the farm', done: i >= 2 },
      { label: 'Loaded', done: i >= 3 },
      { label: 'Pickup confirmed', done: i >= 4 },
      { label: 'At the facility', done: i >= 6 },
      { label: 'Delivered', done: i >= 7 },
    ];
  };
  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        eyebrow={todayLabel()}
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={`Your jobs for ${w.label}, step by step.`}
      />
      <KpiStrip
        items={[
          {
            label: 'Pickups today',
            icon: CalendarClock,
            href: '/transport/jobs',
            value: jobs.data
              ? active.filter((j) => lagosDay(j.pickupWindow.start) === today).length
              : undefined,
          },
          {
            label: 'Upcoming jobs',
            icon: ClipboardList,
            href: '/transport/jobs',
            value: jobs.data ? active.length : undefined,
          },
          {
            label: 'Delivered',
            icon: CheckCircle2,
            href: '/transport/jobs',
            value: jobs.data ? delivered.length : undefined,
          },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Panel title="Next job" action={<PanelLink href="/transport/jobs">All jobs</PanelLink>}>
            {next ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-ink">
                        {next.bookingReference}
                      </span>
                      <Badge tone="info">{SHIPMENT_STATUS_LABELS[next.status]}</Badge>
                    </p>
                    <p className="mt-2 text-lg font-semibold tracking-tight text-ink">
                      {next.pickup.lga} → {next.destination.facilityName}
                    </p>
                  </div>
                  <Button asChild size="lg">
                    <Link href={`/transport/jobs/${next.shipmentId}`}>
                      Open job <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </div>
                <Facts
                  className="rounded-xl bg-canvas/70 p-4"
                  items={[
                    [
                      'Pickup',
                      `${windowLabel(next.pickupWindow.start, next.pickupWindow.end).day}, ${windowLabel(next.pickupWindow.start, next.pickupWindow.end).time}`,
                    ],
                    ['Farm', next.pickup.label],
                    ['Load', tonnes(sumKg([next.quantityKg]))],
                    ['Vehicle', next.vehicle.plate],
                  ]}
                />
                <ProgressSteps
                  steps={stepsFor(next.status)}
                  label={`Progress of job ${next.bookingReference}`}
                />
                {next.pickup.directions ? (
                  <p className="flex items-start gap-2 text-sm text-muted">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {next.pickup.directions}
                  </p>
                ) : null}
              </div>
            ) : (
              <PanelEmpty icon={Navigation} title="No jobs assigned">
                Your dispatcher assigns jobs to you; they appear here.
              </PanelEmpty>
            )}
          </Panel>
          {active.length > 1 ? (
            <Panel title="Later jobs" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {active.slice(1, 6).map((j) => {
                  const wl = windowLabel(j.pickupWindow.start, j.pickupWindow.end);
                  return (
                    <li key={j.shipmentId}>
                      <Link
                        href={`/transport/jobs/${j.shipmentId}`}
                        className="flex items-center gap-4 px-5 py-3.5 hover:bg-canvas/60"
                      >
                        <span className="w-24 shrink-0 text-[13px]">
                          <span className="block font-medium text-ink">{wl.day}</span>
                          <span className="text-muted tabular">{wl.time}</span>
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block truncate font-medium text-ink">
                            {j.pickup.lga} → {j.destination.facilityName}
                          </span>
                          <span className="text-[13px] text-muted">
                            {j.bookingReference} · {tonnes(sumKg([j.quantityKg]))}
                          </span>
                        </span>
                        <ArrowRight className="size-4 text-muted" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Recent activity" action={<PanelLink href="/notifications" />}>
            <ActivityFeed limit={6} />
          </Panel>
          {delivered.length ? (
            <Panel title="Recently delivered">
              <ul className="flex flex-col gap-2 text-sm">
                {delivered.slice(0, 4).map((j) => (
                  <li key={j.shipmentId} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[13px] font-semibold text-ink">{j.bookingReference}</span>
                    <span className="text-muted">{tonnes(sumKg([j.quantityKg]))}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Freight is invoiced by your organisation, not by drivers.
              </p>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
