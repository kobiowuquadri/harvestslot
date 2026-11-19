'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronRight, type LucideIcon } from 'lucide-react';
import { formatRelative, toGrams, type NotificationDto } from '@harvestslot/contracts';
import { Segmented, Table, Td, Th } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';

// ───────────── Numbers ─────────────

/** Sum of kilogram strings, exact (grams as bigint), returned as kilograms. */
export function sumKg(values: Array<string | null | undefined>): number {
  let g = 0n;
  for (const v of values) if (v) g += toGrams(v);
  return Number(g) / 1000;
}

/** Tile-sized tonnes: "12.5 t", "850 kg" below one tonne. */
export function tonnes(kg: number): string {
  if (kg < 1000) return `${Math.round(kg).toLocaleString('en-NG')} kg`;
  const t = kg / 1000;
  return `${t.toLocaleString('en-NG', { maximumFractionDigits: t < 10 ? 2 : 1 })} t`;
}

/** Tile-sized naira: "₦468,000", "₦1.24M". The exact amount is always one click away. */
export function compactNaira(kobo: number): string {
  const naira = kobo / 100;
  if (Math.abs(naira) >= 1_000_000)
    return `₦${(naira / 1_000_000).toLocaleString('en-NG', { maximumFractionDigits: 2 })}M`;
  return `₦${Math.round(naira).toLocaleString('en-NG')}`;
}

// ───────────── Clock ─────────────

let clock = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(onChange: () => void) {
  clockListeners.add(onChange);
  if (!clockTimer) {
    clock = Date.now();
    clockTimer = setInterval(() => {
      clock = Date.now();
      clockListeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    clockListeners.delete(onChange);
    if (!clockListeners.size && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

/** The current time, refreshed every minute, so "today" and "late" stay right on a dashboard left open. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => clock,
    () => clock,
  );
}

const lagos = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-NG', { ...opts, timeZone: 'Africa/Lagos' });

export function todayLabel(now = new Date()): string {
  return lagos({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
}

export function greeting(now = new Date()): string {
  const h = Number(lagos({ hour: 'numeric', hourCycle: 'h23' }).format(now));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ───────────── Layout ─────────────

export function DashboardHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[13px] font-medium text-muted">{eyebrow}</p> : null}
        <h1 className="mt-1 text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className={cn('flex-1 p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children = 'View all' }: { href: string; children?: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 rounded-md text-[13px] font-medium text-forest hover:text-forest-800"
    >
      {children} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/** A quiet in-panel message for "nothing here yet". */
export function PanelEmpty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-canvas text-muted ring-1 ring-line">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children ? <p className="max-w-xs text-[13px] text-muted">{children}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

// ───────────── Key figures ─────────────

export interface Kpi {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  href?: string;
  /** 0–1 share shown as a meter under the value. */
  meter?: { value: number; label: string };
}

export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <section
      aria-label="Key figures"
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-[var(--shadow-card)]',
        items.length >= 4 ? 'xl:grid-cols-4' : items.length === 3 ? 'xl:grid-cols-3' : '',
      )}
    >
      {items.map((k) => (
        <KpiCell
          key={k.label}
          k={k}
          className={items.length % 2 ? 'last:col-span-2 xl:last:col-span-1' : undefined}
        />
      ))}
    </section>
  );
}

function KpiCell({ k, className }: { k: Kpi; className?: string }) {
  const Icon = k.icon;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{k.label}</p>
        <span
          className="hidden size-8 shrink-0 place-items-center rounded-lg bg-leaf-50 text-forest sm:grid"
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-1 text-[1.4rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
        {k.value ?? '—'}
      </p>
      {k.meter ? <Meter value={k.meter.value} label={k.meter.label} className="mt-3" /> : null}
      {k.sub ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">{k.sub}</div>
      ) : null}
    </>
  );
  return k.href ? (
    <Link
      href={k.href}
      className={cn('group block bg-surface p-4 transition-colors hover:bg-canvas/60 sm:p-5', className)}
    >
      {body}
    </Link>
  ) : (
    <div className={cn('bg-surface p-4 sm:p-5', className)}>{body}</div>
  );
}

/** A single ratio against a limit. The track is a lighter step of the fill's ramp. */
export function Meter({
  value,
  label,
  className,
  severity = false,
}: {
  value: number;
  label: string;
  className?: string;
  severity?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const fill = severity && pct >= 95 ? 'bg-danger' : severity && pct >= 80 ? 'bg-amber' : 'bg-forest';
  return (
    <div
      className={cn('h-1.5 overflow-hidden rounded-full bg-leaf-100', className)}
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ───────────── Work queue ─────────────

export interface AttentionItem {
  label: string;
  detail?: string;
  count: number | undefined;
  href: string;
  icon: LucideIcon;
  tone?: 'warning' | 'danger' | 'info' | 'neutral';
}

const toneChip: Record<NonNullable<AttentionItem['tone']>, string> = {
  warning: 'bg-amber-50 text-amber-ink ring-amber-100',
  danger: 'bg-danger-50 text-danger ring-danger/15',
  info: 'bg-info-50 text-info ring-info/15',
  neutral: 'bg-leaf-50 text-forest ring-leaf-100',
};

/** Things waiting on this user, most urgent first; cleared items stay listed but quiet. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  const open = items.filter((i) => (i.count ?? 0) > 0);
  const clear = items.filter((i) => i.count === 0);
  return (
    <div className="flex flex-col gap-3">
      {open.length === 0 && clear.length === items.length ? (
        <p className="flex items-center gap-2 rounded-xl bg-leaf-50 px-3.5 py-3 text-sm font-medium text-forest">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden /> You are all caught up.
        </p>
      ) : null}
      <ul className="-mx-2 flex flex-col">
        {open.map((i) => {
          const Icon = i.icon;
          return (
            <li key={i.label}>
              <Link
                href={i.href}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-canvas"
              >
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
                    toneChip[i.tone ?? 'neutral'],
                  )}
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{i.label}</span>
                  {i.detail ? (
                    <span className="block truncate text-[13px] text-muted">{i.detail}</span>
                  ) : null}
                </span>
                <span className="min-w-6 rounded-full bg-ink px-2 py-0.5 text-center text-xs font-semibold text-white">
                  {i.count}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      {clear.length && open.length ? (
        <p className="flex items-start gap-2 border-t border-line pt-3 text-[13px] text-muted">
          <Check className="mt-0.5 size-3.5 shrink-0 text-forest" aria-hidden />
          <span>Clear: {clear.map((c) => c.label.toLowerCase()).join(', ')}.</span>
        </p>
      ) : null}
    </div>
  );
}

// ───────────── Activity ─────────────

export function ActivityFeed({ limit = 6 }: { limit?: number }) {
  const q = useApi<{ items: NotificationDto[] }>(
    ['notifications', 'recent', limit],
    `/notifications?limit=${limit}`,
  );
  if (q.isLoading)
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-canvas" />
        ))}
      </div>
    );
  const items = q.data?.items ?? [];
  if (!items.length)
    return <p className="text-sm text-muted">No activity yet. Updates about your bookings appear here.</p>;
  return (
    <ol className="relative flex flex-col gap-4 before:absolute before:bottom-2 before:left-[3px] before:top-2 before:w-px before:bg-line">
      {items.map((n) => (
        <li key={n.id} className="relative flex gap-3 pl-0">
          <span
            className={cn(
              'relative mt-1.5 size-[7px] shrink-0 rounded-full ring-4 ring-surface',
              n.readAt ? 'bg-line-strong' : 'bg-forest',
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {n.link ? (
                <Link href={n.link} className="hover:underline">
                  {n.title}
                </Link>
              ) : (
                n.title
              )}
              {n.readAt ? null : <span className="sr-only"> (unread)</span>}
            </p>
            <p className="line-clamp-2 text-[13px] text-muted">{n.body}</p>
            <p className="mt-0.5 text-xs text-muted">
              <time dateTime={n.createdAt}>{formatRelative(n.createdAt)}</time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ───────────── Pipeline ─────────────

/** Ordered stages of one hue, light → dark (validated ordinal ramp). */
export const STAGE_RAMP = ['#6cb98c', '#2f9459', '#137a3b', '#0a4624'] as const;

export interface Stage {
  label: string;
  count: number;
  color: string;
  href?: string;
}

/** One whole split into ordered stages: a thin segmented bar above rows that carry the figures. */
export function Pipeline({ stages, footnote }: { stages: Stage[]; footnote?: ReactNode }) {
  const total = stages.reduce((a, s) => a + s.count, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[1.75rem] font-semibold leading-none tracking-tight text-ink">{total}</p>
        <p className="text-[13px] text-muted">in progress or completed</p>
      </div>
      <div
        className="mt-4 flex h-2 gap-[2px] overflow-hidden rounded-full bg-canvas"
        role="img"
        aria-label={stages.map((s) => `${s.label}: ${s.count}`).join(', ')}
      >
        {total > 0
          ? stages
              .filter((s) => s.count > 0)
              .map((s) => <span key={s.label} style={{ flexGrow: s.count, background: s.color }} />)
          : null}
      </div>
      <ul className="mt-4 flex flex-col divide-y divide-line">
        {stages.map((s) => {
          const row = (
            <>
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden />
              <span className="flex-1 text-ink">{s.label}</span>
              <span className="font-semibold tabular text-ink">{s.count}</span>
              <span className="w-10 text-right tabular text-muted">
                {total ? Math.round((s.count / total) * 100) : 0}%
              </span>
            </>
          );
          return (
            <li key={s.label}>
              {s.href ? (
                <Link
                  href={s.href}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-canvas"
                >
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-3 py-2.5 text-sm">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
      {footnote ? <p className="mt-3 text-xs text-muted">{footnote}</p> : null}
    </div>
  );
}

// ───────────── Progress ─────────────

export function ProgressSteps({
  steps,
  label,
}: {
  steps: Array<{ label: string; done: boolean }>;
  label: string;
}) {
  const current = steps.findIndex((s) => !s.done);
  const doneCount = current === -1 ? steps.length : current;
  return (
    <div>
      {/* Phones: a compact segmented bar. */}
      <div className="sm:hidden">
        <p className="text-[13px] text-muted">
          Step {Math.min(doneCount + 1, steps.length)} of {steps.length} ·{' '}
          <span className="font-medium text-ink">{steps[current]?.label ?? 'Complete'}</span>
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s.label}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                s.done
                  ? 'bg-forest'
                  : i === current
                    ? 'bg-leaf-100 ring-1 ring-inset ring-forest'
                    : 'bg-line',
              )}
            />
          ))}
        </div>
      </div>
      <ol
        className="hidden grid-flow-col sm:grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        aria-label={label}
      >
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex flex-col items-center px-1 text-center">
            {i > 0 ? (
              <span
                className={cn(
                  'absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2',
                  s.done || i <= doneCount ? 'bg-forest' : 'bg-line',
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                'relative grid size-7 place-items-center rounded-full text-xs font-semibold',
                s.done
                  ? 'bg-forest text-white'
                  : i === current
                    ? 'bg-surface text-forest ring-2 ring-forest'
                    : 'bg-canvas text-muted ring-1 ring-line',
              )}
              aria-hidden
            >
              {s.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={cn(
                'mt-2 text-xs leading-snug',
                i === current ? 'font-semibold text-ink' : 'text-muted',
              )}
            >
              {s.label}
            </span>
            <span className="sr-only">
              {s.done ? ' — done' : i === current ? ' — current step' : ' — not started'}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ───────────── Capacity chart ─────────────

export interface CapacityDay {
  date: string;
  weekday: string;
  day: string;
  limitKg: number;
  bookedKg: number;
  heldKg: number;
  freeKg: number;
  slots: number;
}

const CAPACITY_SERIES = [
  { key: 'bookedKg', label: 'Booked', color: STAGE_RAMP[2] },
  { key: 'heldKg', label: 'Held by open offers', color: STAGE_RAMP[0] },
] as const;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceCeil(v: number): number {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Column path with a 4px rounded data-end and a square base. */
function columnPath(x: number, yTop: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  if (h <= 0) return '';
  return `M${x},${yTop + h}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${yTop + h}Z`;
}

/** Daily processing capacity: booked and held stacked on the free track, with a table view twin. */
export function CapacityChart({ days, caption }: { days: CapacityDay[]; caption: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const H = 232;
  const padL = 40;
  const padR = 4;
  const padT = 10;
  const padB = 40;
  const plotH = H - padT - padB;
  const max = niceCeil(Math.max(0, ...days.map((d) => d.limitKg)));
  const plotW = Math.max(0, width - padL - padR);
  const band = days.length ? plotW / days.length : 0;
  const barW = Math.max(6, Math.min(24, band * 0.56));
  const y = (kg: number) => padT + plotH - (kg / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = band < 34 ? 2 : 1;
  const a = active !== null ? days[active] : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted"
          aria-label="Legend"
        >
          {CAPACITY_SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />{' '}
              {s.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-[#e9ecf0]" aria-hidden /> Free
          </li>
        </ul>
        <Segmented
          label="Capacity view"
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
        />
      </div>
      {view === 'table' ? (
        <Table caption={caption}>
          <thead>
            <tr>
              <Th>Day</Th>
              <Th className="text-right">Slots</Th>
              <Th className="text-right">Limit</Th>
              <Th className="text-right">Booked</Th>
              <Th className="text-right">Held</Th>
              <Th className="text-right">Free</Th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <Td>
                  {d.weekday} {d.day}
                </Td>
                <Td className="text-right tabular">{d.slots}</Td>
                <Td className="text-right tabular">{tonnes(d.limitKg)}</Td>
                <Td className="text-right tabular">{tonnes(d.bookedKg)}</Td>
                <Td className="text-right tabular">{tonnes(d.heldKg)}</Td>
                <Td className="text-right tabular">{tonnes(d.freeKg)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <div ref={ref} className="relative" onMouseLeave={() => setActive(null)}>
          {width > 0 ? (
            <svg
              width={width}
              height={H}
              role="group"
              aria-label={caption}
              className="block overflow-visible"
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="#e4e7ec" strokeWidth={1} />
                  <text
                    x={padL - 8}
                    y={y(t)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-muted text-[11px] tabular"
                  >
                    {t === 0 ? '0' : tonnes(t)}
                  </text>
                </g>
              ))}
              {days.map((d, i) => {
                const cx = padL + band * i + band / 2;
                const x = cx - barW / 2;
                const base = y(0);
                const bookedH = (d.bookedKg / max) * plotH;
                const heldH = (d.heldKg / max) * plotH;
                const gap = bookedH > 0 && heldH > 0 ? 2 : 0;
                const label = `${d.weekday} ${d.day}: ${d.slots ? `${tonnes(d.bookedKg)} booked, ${tonnes(d.heldKg)} held, ${tonnes(d.freeKg)} free of ${tonnes(d.limitKg)}` : 'no capacity published'}`;
                return (
                  <g key={d.date}>
                    {d.limitKg > 0 ? (
                      <path
                        d={columnPath(x, y(d.limitKg), barW, base - y(d.limitKg), 4)}
                        fill={active === i ? '#dfe3e8' : '#e9ecf0'}
                      />
                    ) : null}
                    {bookedH > 0 ? (
                      <path
                        d={
                          heldH > 0
                            ? `M${x},${base}V${base - bookedH}H${x + barW}V${base}Z`
                            : columnPath(x, base - bookedH, barW, bookedH, 4)
                        }
                        fill={CAPACITY_SERIES[0].color}
                      />
                    ) : null}
                    {heldH > 0 ? (
                      <path
                        d={columnPath(x, base - bookedH - gap - heldH, barW, heldH, 4)}
                        fill={CAPACITY_SERIES[1].color}
                      />
                    ) : null}
                    {i % labelEvery === 0 ? (
                      <text
                        x={cx}
                        y={H - padB + 16}
                        textAnchor="middle"
                        className={cn('text-[11px]', d.limitKg > 0 ? 'fill-ink' : 'fill-muted')}
                      >
                        <tspan x={cx}>{d.weekday}</tspan>
                        <tspan x={cx} dy="1.3em" className="fill-muted tabular">
                          {d.day}
                        </tspan>
                      </text>
                    ) : null}
                    <rect
                      x={padL + band * i}
                      y={padT}
                      width={band}
                      height={plotH}
                      fill="transparent"
                      tabIndex={0}
                      role="img"
                      aria-label={label}
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive(null)}
                      className="cursor-default outline-none focus-visible:stroke-forest focus-visible:stroke-2"
                    />
                  </g>
                );
              })}
            </svg>
          ) : (
            <div style={{ height: H }} />
          )}
          {a && active !== null ? (
            <div
              className="pointer-events-none absolute top-0 z-10 w-48 -translate-x-1/2 rounded-xl bg-ink px-3 py-2.5 text-xs text-white shadow-lg"
              style={{ left: Math.min(Math.max(padL + band * active + band / 2, 96), width - 96) }}
              aria-hidden
            >
              <p className="font-semibold">
                {a.weekday} {a.day}
                <span className="font-normal text-white/70">
                  {' '}
                  · {a.slots ? `${a.slots} slot${a.slots > 1 ? 's' : ''}` : 'no slots'}
                </span>
              </p>
              {a.slots ? (
                <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular">
                  <dt className="text-white/70">Booked</dt>
                  <dd className="text-right">{tonnes(a.bookedKg)}</dd>
                  <dt className="text-white/70">Held</dt>
                  <dd className="text-right">{tonnes(a.heldKg)}</dd>
                  <dt className="text-white/70">Free</dt>
                  <dd className="text-right">{tonnes(a.freeKg)}</dd>
                  <dt className="text-white/70">Limit</dt>
                  <dd className="text-right">{tonnes(a.limitKg)}</dd>
                </dl>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ───────────── Small pieces ─────────────

export interface MobileRow {
  key: string;
  href?: string;
  title: ReactNode;
  meta?: ReactNode;
  extra?: ReactNode;
  aside?: ReactNode;
}

/** Phone-width stand-in for a panel table: one stacked row per record. Pair with a table hidden below md. */
export function MobileRows({ rows }: { rows: MobileRow[] }) {
  return (
    <ul className="divide-y divide-line md:hidden">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{r.title}</span>
              {r.meta ? <span className="mt-0.5 block text-[13px] text-muted">{r.meta}</span> : null}
              {r.extra ? <span className="mt-2 block">{r.extra}</span> : null}
            </span>
            {r.aside ? (
              <span className="flex shrink-0 flex-col items-end gap-1 text-right">{r.aside}</span>
            ) : null}
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className="flex items-start gap-3 px-5 py-3.5 hover:bg-canvas/60">
                {inner}
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-5 py-3.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn('inline-block size-1.5 rounded-full bg-current', className)} aria-hidden />;
}

/** A row of label/value pairs used in summary cards. */
export function Facts({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
