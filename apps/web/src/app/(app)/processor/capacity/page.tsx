'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { addDays, formatLagosDate, lagosDateString, lagosStartOfDay, PRODUCT_LABELS, type FacilityDto, type SlotDto } from '@harvestslot/contracts';
import { BuyingSlotButton } from '@/components/domain/buying-slot-form';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DemoTag, Kg, StatusBadge, When, Window } from '@/components/domain/display';
import { OrgGate } from '@/components/domain/org-gate';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, Dialog, DialogContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import type { Workspace } from '@/lib/session';
import { lagosInputToIso } from '@/lib/utils';
import { useCrops } from '@/lib/crops';

function UsageBar({ s }: { s: SlotDto }) {
  const limit = Number(s.usage.limitKg) || 1;
  const pct = (v: string) => `${Math.min(100, (Number(v) / limit) * 100)}%`;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="bg-forest" style={{ width: pct(s.usage.consumedKg) }} />
        <div className="bg-leaf" style={{ width: pct(s.usage.committedKg) }} />
        <div className="bg-amber" style={{ width: pct(s.usage.heldKg) }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        <span className="text-forest">■</span> received <Kg kg={s.usage.consumedKg} /> · <span className="text-leaf">■</span> booked <Kg kg={s.usage.committedKg} /> · <span className="text-amber-ink">■</span> held by offers <Kg kg={s.usage.heldKg} /> · free <strong><Kg kg={s.usage.availableKg} /></strong> of <Kg kg={s.usage.limitKg} />
      </p>
    </div>
  );
}

function AdjustDialog({ s, orgId }: { s: SlotDto; orgId: string }) {
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState(s.processingCapacityKg);
  const [limit, setLimit] = useState(s.purchaseLimitKg);
  const [reason, setReason] = useState('');
  const adjust = useAction({ request: () => ({ path: `/slots/${s.id}/capacity`, body: { expectedVersion: s.version, processingCapacityKg: cap, purchaseLimitKg: limit, reason } }), invalidate: [['slots', orgId]], success: 'Capacity updated', toastErrors: false, onSuccess: () => setOpen(false) });
  const history = useApi<Array<{ id: string; actor: string; prevPurchaseLimitKg: string; newPurchaseLimitKg: string; reason: string; createdAt: string }>>(['slot-adjustments', s.id], open ? `/slots/${s.id}/adjustments` : null);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Adjust capacity
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Adjust capacity" description="You cannot go below what is already held, confirmed or received. Changes are logged with your reason.">
          <div className="flex flex-col gap-4">
            {adjust.error ? <Alert tone="danger">{adjust.error.message}</Alert> : null}
            <Field label="Processing capacity (kg)">
              <Input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
            </Field>
            <Field label="Purchase limit (kg)" hint="How much you will buy for this slot.">
              <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </Field>
            <Field label="Reason" required>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button onClick={() => adjust.mutate()} loading={adjust.isPending} disabled={reason.trim().length < 5}>
              Save
            </Button>
            {history.data?.length ? (
              <ul className="text-xs text-muted">
                {history.data.map((h) => (
                  <li key={h.id}>
                    <When at={h.createdAt} /> · {h.actor}: limit {h.prevPurchaseLimitKg} → {h.newPurchaseLimitKg} kg — {h.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateSlot({ orgId, facilities }: { orgId: string; facilities: FacilityDto[] }) {
  const crops = useCrops();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'single' | 'series'>('series');
  const lines = facilities.flatMap((f) => f.lines.filter((l) => l.status === 'ACTIVE').map((l) => ({ ...l, facilityName: f.name })));
  const [lineId, setLineId] = useState(lines[0]?.id ?? '');
  const today = lagosDateString(new Date());
  const [start, setStart] = useState(`${addDays(today, 1)}T08:00`);
  const [end, setEnd] = useState(`${addDays(today, 1)}T16:00`);
  const [firstDate, setFirstDate] = useState(addDays(today, 1));
  const [days, setDays] = useState('5');
  const [startHour, setStartHour] = useState('8');
  const [duration, setDuration] = useState('8');
  const [cap, setCap] = useState('20000');
  const [limit, setLimit] = useState('20000');
  const [publish, setPublish] = useState(true);
  const [result, setResult] = useState<{ created: number; skipped: Array<{ date: string; reason: string }> } | null>(null);
  const create = useAction<void, { created?: number; skipped?: Array<{ date: string; reason: string }> }>({
    request: () =>
      mode === 'single'
        ? { path: '/slots', body: { lineId, startsAt: lagosInputToIso(start), endsAt: lagosInputToIso(end), processingCapacityKg: cap, purchaseLimitKg: limit, publish } }
        : { path: '/slots/series', body: { lineId, firstDate, days: Number(days), startHour: Number(startHour), durationHours: Number(duration), processingCapacityKg: cap, purchaseLimitKg: limit, publish } },
    invalidate: [['slots', orgId]],
    success: mode === 'single' ? 'Slot created' : 'Slots created',
    toastErrors: false,
    onSuccess: (r) => {
      if (mode === 'series' && r.created !== undefined) setResult({ created: r.created, skipped: r.skipped ?? [] });
      else setOpen(false);
    },
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={!lines.length}>
        <Plus className="size-4" aria-hidden /> Add by processing line
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setResult(null);
        }}
      >
        <DialogContent title="Add processing slots" description="Overlapping slots on the same line are refused.">
          <div className="flex flex-col gap-4">
            {create.error ? <Alert tone="danger">{create.error.message}</Alert> : null}
            {result ? (
              <Alert tone="success" title={`${result.created} slot(s) created`}>
                {result.skipped.length ? (
                  <ul className="list-disc pl-5">
                    {result.skipped.map((s) => (
                      <li key={s.date}>
                        {s.date}: {s.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Alert>
            ) : null}
            <Field label="Line">
              <Select value={lineId} onChange={(e) => setLineId(e.target.value)}>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.facilityName} · {l.name} ({crops.info(l.crop).noun}, {PRODUCT_LABELS[l.product].toLowerCase()})
                  </option>
                ))}
              </Select>
            </Field>
            <Select aria-label="Mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="series">Same hours on several days</option>
              <option value="single">One slot</option>
            </Select>
            {mode === 'single' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Starts (Lagos time)">
                  <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
                </Field>
                <Field label="Ends">
                  <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="First day">
                  <Input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
                </Field>
                <Field label="Number of days">
                  <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
                </Field>
                <Field label="Start hour (0–23)">
                  <Input inputMode="numeric" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
                </Field>
                <Field label="Hours per slot">
                  <Input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Processing capacity (kg)">
                <Input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
              </Field>
              <Field label="Purchase limit (kg)">
                <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </Field>
            </div>
            <Checkbox label="Publish now (farmers can be matched to it)" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!lineId}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Capacity({ w }: { w: Extract<Workspace, { kind: 'processor' }> }) {
  const crops = useCrops();
  const today = lagosDateString(new Date());
  const [facilityId, setFacilityId] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 21));
  const facilities = useApi<FacilityDto[]>(['facilities', w.orgId], `/organisations/${w.orgId}/facilities`);
  const params = new URLSearchParams({ from: lagosStartOfDay(from).toISOString(), to: lagosStartOfDay(addDays(to, 1)).toISOString() });
  if (facilityId) params.set('facilityId', facilityId);
  const slots = useApi<SlotDto[]>(['slots', w.orgId, params.toString()], `/organisations/${w.orgId}/slots?${params.toString()}`);
  const byDay = useMemo(() => {
    const m = new Map<string, SlotDto[]>();
    for (const s of slots.data ?? []) {
      const d = lagosDateString(new Date(s.startsAt));
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots.data]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Buying slots"
        description="Tell farmers what you buy, how much you can receive, where, and on which dates. Farmers whose harvest fits see you as a buyer; an offer you send holds the space until they answer."
        actions={
          facilities.data ? (
            <>
              <BuyingSlotButton orgId={w.orgId} facilities={facilities.data} approved={w.status === 'APPROVED'} />
              {facilities.data.some((f) => f.lines.length) ? <CreateSlot orgId={w.orgId} facilities={facilities.data} /> : null}
            </>
          ) : null
        }
      />
      {w.status !== 'APPROVED' ? <Alert tone="warning">HarvestSlot is reviewing your business. You can save buying slots now and publish them once the review is done.</Alert> : null}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Facility">
          <Select value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
            <option value="">All facilities</option>
            {facilities.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <QueryView
        query={slots}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState title="No buying slots in these dates" action={facilities.data ? <BuyingSlotButton orgId={w.orgId} facilities={facilities.data} approved={w.status === 'APPROVED'} size="md" /> : undefined}>
            Publish one so farmers near you can send you their harvest.
          </EmptyState>
        }
      >
        {() => (
          <div className="flex flex-col gap-5">
            {byDay.map(([day, list]) => (
              <section key={day} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-ink">{formatLagosDate(day)}</h2>
                {list.map((s) => (
                  <Card key={s.id}>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {s.facilityName} · {s.lineName}
                        </span>
                        <Badge>{crops.info(s.crop).label}</Badge>
                        <StatusBadge kind="slot" status={s.status} />
                        {s.isDemo ? <DemoTag /> : null}
                        <span className="text-sm text-muted">
                          <Window start={s.startsAt} end={s.endsAt} />
                        </span>
                        <span className="ml-auto text-xs text-muted">
                          {s.bookingsCount} booking(s) · as of <When at={s.asOf} />
                        </span>
                      </div>
                      <UsageBar s={s} />
                      {s.closedReason ? <p className="text-sm text-muted">Closed: {s.closedReason}</p> : null}
                      <div className="flex flex-wrap gap-2">
                        {s.status === 'DRAFT' ? <PublishButton s={s} orgId={w.orgId} /> : null}
                        {['DRAFT', 'PUBLISHED'].includes(s.status) ? (
                          <>
                            <AdjustDialog s={s} orgId={w.orgId} />
                            <ReasonActionDialog trigger="Stop new offers" triggerSize="sm" title="Close this buying slot?" description="Existing bookings stay. No new offers can use it." confirmLabel="Close slot" path={`/slots/${s.id}/close`} body={{ expectedVersion: s.version }} invalidate={[['slots', w.orgId]]} success="Slot closed" />
                            {s.bookingsCount === 0 ? <ReasonActionDialog trigger="Cancel slot" triggerSize="sm" title="Cancel this slot?" confirmLabel="Cancel slot" path={`/slots/${s.id}/cancel`} body={{ expectedVersion: s.version }} invalidate={[['slots', w.orgId]]} success="Slot cancelled" /> : null}
                          </>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </section>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

function PublishButton({ s, orgId }: { s: SlotDto; orgId: string }) {
  const publish = useAction({ request: () => ({ path: `/slots/${s.id}/publish`, body: { expectedVersion: s.version } }), invalidate: [['slots', orgId]], success: 'Published' });
  return (
    <Button size="sm" onClick={() => publish.mutate()} loading={publish.isPending}>
      Publish
    </Button>
  );
}

export default function CapacityPage() {
  return <OrgGate kind="processor">{(w) => <Capacity w={w} />}</OrgGate>;
}
