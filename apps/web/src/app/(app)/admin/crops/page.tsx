'use client';

import { useState } from 'react';
import { Plus, Sprout } from 'lucide-react';
import { cropCodeFromLabel, PRODUCT_LABELS, type CropDto, type CropRequestDto } from '@harvestslot/contracts';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DemoTag } from '@/components/domain/display';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';

const INVALIDATE = [['admin', 'crops'], ['admin', 'crop-requests'], ['public-config']];

interface Draft {
  label: string;
  noun: string;
  nounIsPlural: boolean;
  produce: string;
  why: string;
  hours: string;
  notes: string;
  answersRequestIds: string[];
}
const emptyDraft: Draft = { label: '', noun: '', nounIsPlural: false, produce: '', why: '', hours: '48', notes: '', answersRequestIds: [] };

/** Adding a crop takes effect at once: farmers can list it and buyers can open buying slots for it. */
function AddCropDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: Draft }) {
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const save = useAction({
    request: () => ({
      path: '/admin/crops',
      body: {
        label: d.label.trim(),
        noun: (d.noun.trim() || d.label.trim()).toLowerCase(),
        nounIsPlural: d.nounIsPlural,
        produce: d.produce.trim() || `fresh ${(d.noun.trim() || d.label.trim()).toLowerCase()}`,
        why: d.why.trim(),
        maxHoursHarvestToDelivery: Number(d.hours) || 48,
        ...(d.notes.trim() ? { qualityNotes: d.notes.trim() } : {}),
        answersRequestIds: d.answersRequestIds,
      },
    }),
    invalidate: INVALIDATE,
    success: (c: CropDto) => `${c.label} added. Farmers can list it now${d.answersRequestIds.length ? ', and those who asked were told' : ''}.`,
    toastErrors: false,
    onSuccess: () => onOpenChange(false),
  });
  const fe = save.error?.fieldErrors ?? {};
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a crop" description="Farmers can list it and buyers can open buying slots for it as soon as you save. No release is needed." wide>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={fe.label ?? fe.code} hint={d.label.trim() ? `Code: ${cropCodeFromLabel(d.label)}` : 'As farmers see it, e.g. Okra'}>
              <Input value={d.label} onChange={(e) => set('label', e.target.value)} maxLength={40} />
            </Field>
            <Field label="Word used in sentences" error={fe.noun} hint="e.g. “okra”, “peppers”. Leave empty to use the name.">
              <Input value={d.noun} onChange={(e) => set('noun', e.target.value)} maxLength={40} />
            </Field>
          </div>
          <Checkbox label="This word is plural (“the peppers are”, not “the okra is”)" checked={d.nounIsPlural} onChange={(e) => set('nounIsPlural', e.target.checked)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What the farmer hands over" error={fe.produce} hint="e.g. “fresh pods”. Leave empty for “fresh …”.">
              <Input value={d.produce} onChange={(e) => set('produce', e.target.value)} maxLength={60} />
            </Field>
            <Field label="Deliver within (hours of harvest)" error={fe.maxHoursHarvestToDelivery} hint="The default freshness term for a buyer’s new place.">
              <Input inputMode="numeric" value={d.hours} onChange={(e) => set('hours', e.target.value)} />
            </Field>
          </div>
          <Field label="Why timing matters, in one line" required error={fe.why} hint="Shown to farmers when they choose the crop.">
            <Input value={d.why} onChange={(e) => set('why', e.target.value)} maxLength={160} placeholder="e.g. Pods turn tough and lose colour within two days of picking." />
          </Field>
          <Field label="Default quality notes (optional)" error={fe.qualityNotes}>
            <Input value={d.notes} onChange={(e) => set('notes', e.target.value)} maxLength={300} />
          </Field>
          <Button type="submit" loading={save.isPending} disabled={d.label.trim().length < 2 || d.why.trim().length < 2}>
            Add crop
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleCrop({ c }: { c: CropDto }) {
  const toggle = useAction({
    request: () => ({ path: `/admin/crops/${c.code}`, method: 'PATCH', idempotent: false, body: { active: !c.active } }),
    invalidate: INVALIDATE,
    success: c.active ? `${c.label} switched off for new harvests and buying slots` : `${c.label} switched on`,
  });
  return (
    <Button size="sm" variant={c.active ? 'ghost' : 'outline'} onClick={() => toggle.mutate()} loading={toggle.isPending}>
      {c.active ? 'Switch off' : 'Switch on'}
    </Button>
  );
}

export default function AdminCrops() {
  const crops = useApi<CropDto[]>(['admin', 'crops'], '/admin/crops');
  const requests = useApi<CropRequestDto[]>(['admin', 'crop-requests'], '/admin/crop-requests');
  const [adding, setAdding] = useState<Draft | null>(null);
  const groups = Object.values(
    (requests.data ?? []).reduce<Record<string, CropRequestDto[]>>((m, r) => ((m[r.nameKey] ??= []).push(r), m), {}),
  ).sort((a, b) => b.length - a.length);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crops"
        description="The crops farmers can list and buyers can buy. A crop you add is available at once; switching one off stops new harvests and buying slots for it, while existing sales carry on."
        actions={
          <Button onClick={() => setAdding({ ...emptyDraft })}>
            <Plus className="size-4" aria-hidden /> Add a crop
          </Button>
        }
      />
      {adding ? <AddCropDialog key={JSON.stringify(adding)} open onOpenChange={(o) => !o && setAdding(null)} initial={adding} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Farmers asking for a crop</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryView query={requests}>
            {() =>
              groups.length === 0 ? (
                <EmptyState title="No open requests">When a farmer’s crop isn’t listed, they can ask for it from “Add my harvest”. Requests appear here.</EmptyState>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {groups.map((g) => (
                    <li key={g[0]!.nameKey} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                          {g[0]!.name.charAt(0).toUpperCase() + g[0]!.name.slice(1)}
                          <Badge tone="accent">
                            {g.length} {g.length === 1 ? 'farmer' : 'farmers'}
                          </Badge>
                          {g.every((r) => r.isDemo) ? <DemoTag /> : null}
                        </p>
                        <ul className="mt-1 text-sm text-muted">
                          {g.map((r) => (
                            <li key={r.id}>
                              {r.requestedByName}
                              {r.lga ? ` (${r.lga})` : ''}
                              {r.note ? `: “${r.note}”` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" onClick={() => setAdding({ ...emptyDraft, label: g[0]!.name.charAt(0).toUpperCase() + g[0]!.name.slice(1), noun: g[0]!.nameKey, answersRequestIds: g.map((r) => r.id) })}>
                          Add this crop
                        </Button>
                        <ReasonActionDialog
                          trigger="Dismiss"
                          triggerSize="sm"
                          triggerVariant="ghost"
                          title={`Dismiss the requests for ${g[0]!.name}?`}
                          description="Each farmer who asked is told, with your reason."
                          reasonLabel="Reason the farmers will see"
                          confirmLabel="Dismiss and tell them"
                          path="/admin/crop-requests/dismiss"
                          body={{ nameKey: g[0]!.nameKey }}
                          invalidate={INVALIDATE}
                          success="Dismissed; the farmers were told"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )
            }
          </QueryView>
        </CardContent>
      </Card>

      <QueryView query={crops}>
        {(rows) => (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((c) => (
              <li key={c.code} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-leaf-50 text-forest">
                  <Sprout className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    {c.label} <span className="font-mono text-xs font-normal text-muted">{c.code}</span>
                    <Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Listed' : 'Switched off'}</Badge>
                  </p>
                  <p className="mt-0.5 text-sm text-muted">{c.why}</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Delivered within {c.maxHoursHarvestToDelivery} h by default · Products: {c.products.map((p) => PRODUCT_LABELS[p]).join(', ')}
                  </p>
                </div>
                <ToggleCrop c={c} />
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
