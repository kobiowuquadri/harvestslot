'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, CloudOff, Handshake, MapPin, Plus, Search, Sprout } from 'lucide-react';
import { formatKg, formatNaira, type BookingSummary, type HarvestDto } from '@harvestslot/contracts';
import { DashboardHeader, greeting, todayLabel } from '@/components/domain/dashboard';
import { DateOnly, StatusBadge } from '@/components/domain/display';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/primitives';
import { listDrafts, type HarvestDraft } from '@/lib/drafts';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useFirstName, type Page } from './shared';

const naira = (kobo: number) => formatNaira(kobo).replace(/\.00$/, '');
const PLAN_DONE = (b: BookingSummary) => ['CANCELLED', 'EXPIRED'].includes(b.status) || b.nextStep.actor === 'NONE';

function AddHarvestButton({ size = 'lg', className }: { size?: 'md' | 'lg'; className?: string }) {
  return (
    <Button asChild size={size} className={className}>
      <Link href="/farmer/harvests/new">
        <Plus className="size-5" aria-hidden /> Add my harvest
      </Link>
    </Button>
  );
}

/** First visit: one thing to do. */
function GetStarted() {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-5 bg-leaf-50 px-5 py-8 sm:px-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-forest text-white" aria-hidden>
          <Sprout className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Find a buyer before you harvest</h2>
          <p className="mt-2 max-w-xl text-[15px] text-muted">Tell us where your cassava is, roughly how much you have and when it will be ready. We show buyers who can take it.</p>
        </div>
        <AddHarvestButton className="self-start" />
      </div>
      <ol className="grid gap-px bg-line sm:grid-cols-3">
        {[
          { icon: <MapPin className="size-4" />, t: 'Add your harvest', d: 'Where, how much, when' },
          { icon: <Search className="size-4" />, t: 'Choose a buyer', d: 'Send a request and get an offer' },
          { icon: <Handshake className="size-4" />, t: 'Agree the plan', d: 'Who collects, when, for how much' },
        ].map((s, i) => (
          <li key={s.t} className="flex items-start gap-3 bg-surface px-5 py-4">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-canvas text-xs font-semibold text-forest ring-1 ring-line">{i + 1}</span>
            <span>
              <span className="block text-sm font-semibold text-ink">{s.t}</span>
              <span className="text-[13px] text-muted">{s.d}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A confirmed (or finishing) plan: the sentence, where it stands, and what to do next. */
function PlanCard({ b }: { b: BookingSummary }) {
  const ns = b.nextStep;
  const yours = Boolean(ns.forViewer);
  return (
    <li>
      <Link
        href={`/bookings/${b.id}`}
        className={cn(
          'flex flex-col gap-4 rounded-2xl border bg-surface p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:shadow-[var(--shadow-raised)]',
          yours ? 'border-forest/40' : 'border-line hover:border-line-strong/40',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={yours ? 'accent' : b.ready ? 'success' : 'neutral'}>{ns.stage}</Badge>
          <span className="font-mono text-xs text-muted">{b.reference}</span>
        </div>
        <p className="text-[17px] font-semibold leading-snug text-ink">{b.plan.sentence}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className={cn('flex items-start gap-2 text-sm', yours ? 'font-medium text-forest-800' : 'text-muted')}>
            <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden />
            {ns.forViewer ?? ns.waitingFor ?? 'Open the plan'}
          </p>
          <span className="text-sm font-semibold text-ink">{naira(b.plan.weighed?.finalAmountKobo ?? b.plan.estimatedAmountKobo)}</span>
        </div>
      </Link>
    </li>
  );
}

function HarvestCard({ h }: { h: HarvestDto }) {
  const offers = h.openOffers > 0;
  return (
    <li>
      <Link href={`/farmer/harvests/${h.id}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-line-strong/40 hover:shadow-[var(--shadow-raised)]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[17px] font-semibold text-ink">{formatKg(h.allocation.remainingKg)} for sale</p>
            <p className="flex flex-wrap items-center gap-x-3 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {h.farmLocation.label}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden /> <DateOnly date={h.earliestHarvestDate} /> – <DateOnly date={h.latestHarvestDate} />
              </span>
            </p>
          </div>
          <StatusBadge kind="harvest" status={h.status} />
        </div>
        <p className={cn('rounded-xl px-3.5 py-2.5 text-sm', offers ? 'bg-amber-50 font-medium text-amber-ink' : 'bg-canvas text-ink')}>
          <span className="font-semibold">{h.nextStep.stage}.</span> {h.nextStep.forFarmer}
        </p>
      </Link>
    </li>
  );
}

export function FarmerDashboard() {
  const { me } = useSession();
  const firstName = useFirstName();
  const [drafts, setDrafts] = useState<HarvestDraft[]>([]);
  useEffect(() => {
    if (me) listDrafts(me.user.id).then(setDrafts).catch(() => setDrafts([]));
  }, [me]);
  const bookings = useApi<Page<BookingSummary>>(['bookings', 'farmer', 'home'], '/bookings?view=farmer&limit=50');
  const harvests = useApi<HarvestDto[]>(['harvests', 'mine'], '/harvests');

  const all = bookings.data?.items ?? [];
  // Plans that still need something, the ones waiting on this farmer first.
  const live = all.filter((b) => !PLAN_DONE(b)).sort((a, b) => Number(Boolean(b.nextStep.forViewer)) - Number(Boolean(a.nextStep.forViewer)) || a.plan.window.start.localeCompare(b.plan.window.start));
  const finished = all.filter((b) => b.status === 'COMPLETED' && PLAN_DONE(b)).slice(0, 3);
  const openHarvests = (harvests.data ?? []).filter((h) => ['DRAFT', 'PUBLISHED'].includes(h.status) && h.allocation.state !== 'FULL');
  const loading = bookings.isLoading || harvests.isLoading;
  const fresh = !loading && all.length === 0 && (harvests.data ?? []).length === 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <DashboardHeader eyebrow={todayLabel()} title={`${greeting()}${firstName ? `, ${firstName}` : ''}`} actions={fresh ? undefined : <AddHarvestButton />} />

      {drafts.length ? (
        <Alert tone="info" title={`${drafts.length} harvest${drafts.length > 1 ? 's' : ''} saved on this phone`} action={<Button asChild size="sm" variant="outline"><Link href="/farmer/harvests">Send</Link></Button>}>
          <span className="inline-flex items-center gap-1">
            <CloudOff className="size-4" aria-hidden /> Not sent to HarvestSlot yet. Send it when you are online.
          </span>
        </Alert>
      ) : null}

      {loading ? <div className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-line" aria-busy="true" /> : fresh ? <GetStarted /> : null}

      {live.length ? (
        <section aria-labelledby="plans" className="flex flex-col gap-3">
          <h2 id="plans" className="flex items-center gap-2 text-lg font-semibold text-ink">
            <ClipboardCheck className="size-5 text-forest" aria-hidden /> Your plans
          </h2>
          <ul className="flex flex-col gap-3">
            {live.map((b) => (
              <PlanCard key={b.id} b={b} />
            ))}
          </ul>
        </section>
      ) : null}

      {openHarvests.length ? (
        <section aria-labelledby="harvests" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="harvests" className="flex items-center gap-2 text-lg font-semibold text-ink">
              <Sprout className="size-5 text-forest" aria-hidden /> Harvests looking for a buyer
            </h2>
            <Link href="/farmer/harvests" className="text-sm font-medium text-forest hover:underline">
              All harvests
            </Link>
          </div>
          <ul className="flex flex-col gap-3">
            {openHarvests.map((h) => (
              <HarvestCard key={h.id} h={h} />
            ))}
          </ul>
        </section>
      ) : null}

      {!loading && !fresh && !live.length && !openHarvests.length ? (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-6">
          <p className="text-[15px] text-ink">Nothing is waiting on you. Add your next harvest when it is nearly ready.</p>
          <AddHarvestButton size="md" />
        </section>
      ) : null}

      {finished.length ? (
        <section aria-labelledby="finished" className="flex flex-col gap-2">
          <h2 id="finished" className="text-sm font-semibold text-muted">
            Finished sales
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {finished.map((b) => (
              <li key={b.id}>
                <Link href={`/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-canvas/60">
                  <span className="flex items-center gap-2 text-ink">
                    <CheckCircle2 className="size-4 text-forest" aria-hidden /> {b.processorName} · {formatKg(b.plan.weighed?.acceptedKg ?? b.quantityKg)}
                  </span>
                  <span className="font-medium text-ink">{naira(b.plan.weighed?.finalAmountKobo ?? b.plan.estimatedAmountKobo)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
