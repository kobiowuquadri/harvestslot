'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CloudOff, Send } from 'lucide-react';
import { createHarvestSchema, formatKg, formatTonnes, updateHarvestSchema, type FarmerProfileDto, type HarvestDto } from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { Field, Input, RadioCards, Textarea } from '@/components/ui/form';
import { Alert, Card, CardContent, Dialog, DialogContent } from '@/components/ui/primitives';
import { ApiError, api, newIdempotencyKey } from '@/lib/api';
import { saveDraft } from '@/lib/drafts';
import { withFarmer, type FarmerContext } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { koboToNairaInput, nairaToKobo } from '@/lib/utils';
import { useOnline } from './banners';
import { DateOnly, Kg, Price } from './display';
import { LocationForm } from './location-form';

export interface HarvestFormValues {
  farmLocationId: string;
  estimatedQuantityKg: string;
  eligibleQuantityKg: string;
  earliestHarvestDate: string;
  latestHarvestDate: string;
  variety: string;
  cropAgeMonths: string;
  notes: string;
  minPriceNaira: string;
  transportPreference: 'PROCESSOR_PAYS' | 'FARMER_MAY_PAY';
  maxDistanceKm: string;
}

export const emptyHarvestValues: HarvestFormValues = {
  farmLocationId: '',
  estimatedQuantityKg: '',
  eligibleQuantityKg: '',
  earliestHarvestDate: '',
  latestHarvestDate: '',
  variety: '',
  cropAgeMonths: '',
  notes: '',
  minPriceNaira: '',
  transportPreference: 'PROCESSOR_PAYS',
  maxDistanceKm: '',
};

export function valuesFromHarvest(h: HarvestDto): HarvestFormValues {
  return {
    farmLocationId: h.farmLocation.id,
    estimatedQuantityKg: h.estimatedQuantityKg,
    eligibleQuantityKg: h.eligibleQuantityKg === h.estimatedQuantityKg ? '' : h.eligibleQuantityKg,
    earliestHarvestDate: h.earliestHarvestDate,
    latestHarvestDate: h.latestHarvestDate,
    variety: h.variety ?? '',
    cropAgeMonths: h.cropAgeMonths?.toString() ?? '',
    notes: h.notes ?? '',
    minPriceNaira: h.minPriceKoboPerKg !== null ? koboToNairaInput(h.minPriceKoboPerKg) : '',
    transportPreference: h.transportPreference,
    maxDistanceKm: h.maxDistanceKm?.toString() ?? '',
  };
}

function payloadFrom(v: HarvestFormValues) {
  const minPrice = v.minPriceNaira.trim() ? nairaToKobo(v.minPriceNaira) : undefined;
  return {
    farmLocationId: v.farmLocationId,
    estimatedQuantityKg: v.estimatedQuantityKg.trim(),
    eligibleQuantityKg: v.eligibleQuantityKg.trim() || undefined,
    earliestHarvestDate: v.earliestHarvestDate,
    latestHarvestDate: v.latestHarvestDate,
    variety: v.variety.trim() || undefined,
    cropAgeMonths: v.cropAgeMonths ? Number(v.cropAgeMonths) : undefined,
    notes: v.notes.trim() || undefined,
    minPriceKoboPerKg: minPrice === null ? -1 : minPrice,
    transportPreference: v.transportPreference,
    maxDistanceKm: v.maxDistanceKm ? Number(v.maxDistanceKm) : undefined,
  };
}

const STEPS = ['Farm', 'Quantity', 'Dates', 'Price & transport', 'Review'] as const;
const STEP_FIELDS: Record<number, string[]> = {
  0: ['farmLocationId'],
  1: ['estimatedQuantityKg', 'eligibleQuantityKg', 'variety', 'cropAgeMonths'],
  2: ['earliestHarvestDate', 'latestHarvestDate'],
  3: ['minPriceKoboPerKg', 'transportPreference', 'maxDistanceKm', 'notes'],
};

/**
 * Step-by-step harvest request. Works offline: the farmer can keep the form on this phone as a draft
 * and send it later. Sending uses the draft id as idempotency key, so retries never duplicate.
 */
export function HarvestForm({
  ctx,
  profile,
  initial,
  existing,
  draftId: initialDraftId,
}: {
  ctx: FarmerContext;
  profile: FarmerProfileDto;
  initial: HarvestFormValues;
  existing?: HarvestDto;
  draftId?: string;
}) {
  const router = useRouter();
  const online = useOnline();
  const { me } = useSession();
  const [v, setV] = useState<HarvestFormValues>(initial);
  const [step, setStep] = useState(existing ? 4 : 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState<null | 'draft' | 'publish' | 'local'>(null);
  const [draftId] = useState(() => initialDraftId ?? newIdempotencyKey());
  const [addingLocation, setAddingLocation] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const set = (k: keyof HarvestFormValues) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const locations = profile.locations.filter((l) => !l.archived);

  const validate = (publish: boolean): Record<string, string> => {
    const payload = payloadFrom(v);
    const result = existing ? updateHarvestSchema.safeParse({ ...payload, expectedVersion: existing.version }) : createHarvestSchema.safeParse({ ...payload, publish });
    const out: Record<string, string> = {};
    if (payload.minPriceKoboPerKg === -1) out.minPriceKoboPerKg = 'Enter a price like 120 or 120.50';
    if (!result.success) for (const issue of result.error.issues) out[issue.path.join('.')] ??= issue.message;
    return out;
  };

  const next = () => {
    const errs = validate(false);
    const stepErrs = Object.fromEntries(Object.entries(errs).filter(([k]) => STEP_FIELDS[step]?.includes(k)));
    setErrors(stepErrs);
    if (Object.keys(stepErrs).length === 0) setStep((s) => Math.min(s + 1, 4));
  };

  const keepOnDevice = async () => {
    if (!me) return;
    setBusy('local');
    await saveDraft({ id: draftId, userId: me.user.id, farmerProfileId: ctx.farmerProfileId, serverId: existing?.id, serverVersion: existing?.version, values: v as unknown as Record<string, unknown> });
    setBusy(null);
    // Offline, another page may not load — confirm in place instead of navigating.
    if (navigator.onLine) router.push(withFarmer('/farmer/harvests?saved=device', ctx));
    else setSavedLocally(true);
  };

  const submit = async (publish: boolean) => {
    const errs = validate(publish);
    setErrors(errs);
    if (Object.keys(errs).length) {
      const firstStep = Number(Object.entries(STEP_FIELDS).find(([, fields]) => fields.some((f) => errs[f]))?.[0] ?? 4);
      setStep(firstStep);
      return;
    }
    setBusy(publish ? 'publish' : 'draft');
    setServerError(null);
    try {
      const payload = payloadFrom(v);
      let saved: HarvestDto;
      if (existing) {
        saved = await api<HarvestDto>(`/harvests/${existing.id}`, { method: 'PATCH', body: { ...payload, expectedVersion: existing.version } });
        if (publish && saved.status === 'DRAFT') saved = await api<HarvestDto>(`/harvests/${saved.id}/publish`, { method: 'POST', body: { expectedVersion: saved.version } });
      } else {
        saved = await api<HarvestDto>(`/farmers/${ctx.farmerProfileId}/harvests`, { method: 'POST', body: { ...payload, clientDraftId: draftId, publish }, idempotencyKey: draftId });
      }
      if (initialDraftId) await import('@/lib/drafts').then((d) => d.deleteDraft(initialDraftId));
      router.push(withFarmer(`/farmer/harvests/${saved.id}${publish ? '?published=1' : ''}`, ctx));
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'NETWORK_ERROR') {
          await keepOnDevice();
          return;
        }
        if (e.code === 'VERSION_CONFLICT') setConflict(true);
        setErrors(e.fieldErrors);
        setServerError(e.message);
      } else setServerError('Could not save');
    } finally {
      setBusy(null);
    }
  };

  const err = (k: string) => errors[k];
  const est = Number(v.estimatedQuantityKg);

  if (savedLocally) {
    return (
      <Alert tone="success" title="Saved on this phone">
        It has not been sent yet. When you are back online, open Harvests and choose “Send now”.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex gap-1 overflow-x-auto text-xs" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => (i < step || existing ? setStep(i) : undefined)}
              aria-current={i === step ? 'step' : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 font-medium ${i === step ? 'bg-forest text-white' : i < step ? 'bg-leaf-50 text-forest' : 'bg-canvas text-muted'}`}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>
      {!online ? (
        <Alert tone="warning" title="You are offline">
          You can fill in the form and keep it on this phone. Send it when you are back online.
        </Alert>
      ) : null}
      {conflict ? (
        <Alert tone="danger" title="This request was changed by someone else">
          Your changes were not saved. <Link className="underline" href={withFarmer(`/farmer/harvests/${existing?.id}`, ctx)}>Open the latest version</Link> and make your change again.
        </Alert>
      ) : serverError ? (
        <Alert tone="danger">{serverError}</Alert>
      ) : null}
      <Card>
        <CardContent className="flex flex-col gap-4">
          {step === 0 ? (
            <>
              {locations.length ? (
                <RadioCards
                  legend="Which farm is this harvest from?"
                  name="farmLocationId"
                  value={v.farmLocationId || undefined}
                  onChange={(id) => setV((p) => ({ ...p, farmLocationId: id }))}
                  options={locations.map((l) => ({ value: l.id, label: l.label, description: `${l.community ? `${l.community}, ` : ''}${l.lga}${l.exact ? ' · GPS saved' : ''}` }))}
                />
              ) : (
                <p className="text-sm text-muted">Add the farm first so processors know roughly where the cassava is.</p>
              )}
              {err('farmLocationId') ? <p className="text-sm text-danger">Choose a farm location</p> : null}
              <Button type="button" variant="outline" onClick={() => setAddingLocation(true)} disabled={!online}>
                Add a farm location
              </Button>
              <Dialog open={addingLocation} onOpenChange={setAddingLocation}>
                <DialogContent title="Add a farm location">
                  <LocationForm
                    farmerProfileId={ctx.farmerProfileId}
                    actingForCooperative={Boolean(ctx.acting)}
                    onSaved={(l) => {
                      setV((p) => ({ ...p, farmLocationId: l.id }));
                      setAddingLocation(false);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Field label="How much cassava do you expect to harvest? (kg)" hint={est > 0 ? `≈ ${formatTonnes(v.estimatedQuantityKg)} · a pickup van carries about 1,500 kg` : 'Enter kilograms. 1 tonne = 1,000 kg.'} error={err('estimatedQuantityKg')} required>
                <Input inputMode="decimal" value={v.estimatedQuantityKg} onChange={set('estimatedQuantityKg')} placeholder="e.g. 8000" />
              </Field>
              <Field label="How much of it is for sale? (kg)" hint="Leave empty if all of it is for sale." error={err('eligibleQuantityKg')}>
                <Input inputMode="decimal" value={v.eligibleQuantityKg} onChange={set('eligibleQuantityKg')} />
              </Field>
              <Field label="Variety (optional)" error={err('variety')}>
                <Input value={v.variety} onChange={set('variety')} placeholder="e.g. TME 419" />
              </Field>
              <Field label="Crop age in months (optional)" error={err('cropAgeMonths')}>
                <Input inputMode="numeric" value={v.cropAgeMonths} onChange={set('cropAgeMonths')} />
              </Field>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <p className="text-sm text-muted">Give the range of days you could harvest. Do not harvest until a booking shows “Ready to harvest”.</p>
              <Field label="Earliest harvest date" error={err('earliestHarvestDate')} required>
                <Input type="date" value={v.earliestHarvestDate} onChange={set('earliestHarvestDate')} />
              </Field>
              <Field label="Latest harvest date" error={err('latestHarvestDate')} required>
                <Input type="date" value={v.latestHarvestDate} onChange={set('latestHarvestDate')} min={v.earliestHarvestDate || undefined} />
              </Field>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Field label="Lowest price you will accept (₦ per kg, optional)" hint="Processors below this price are not shown as matches." error={err('minPriceKoboPerKg')}>
                <Input inputMode="decimal" value={v.minPriceNaira} onChange={set('minPriceNaira')} placeholder="e.g. 120" />
              </Field>
              <RadioCards
                legend="Transport"
                name="transportPreference"
                value={v.transportPreference}
                onChange={(t) => setV((p) => ({ ...p, transportPreference: t }))}
                options={[
                  { value: 'PROCESSOR_PAYS', label: 'The processor arranges and pays for transport', description: 'Recommended.' },
                  { value: 'FARMER_MAY_PAY', label: 'I may pay for transport if the price is right', description: 'Any transport cost you agree to is shown before you accept.' },
                ]}
              />
              <Field label="Furthest distance to a facility (km, optional)" error={err('maxDistanceKm')}>
                <Input inputMode="numeric" value={v.maxDistanceKm} onChange={set('maxDistanceKm')} />
              </Field>
              <Field label="Notes for processors (optional)" error={err('notes')}>
                <Textarea value={v.notes} onChange={set('notes')} maxLength={1000} />
              </Field>
            </>
          ) : null}
          {step === 4 ? (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Farm</dt>
                <dd>{locations.find((l) => l.id === v.farmLocationId)?.label ?? <span className="text-danger">Not chosen</span>}</dd>
              </div>
              <div>
                <dt className="text-muted">For sale</dt>
                <dd>{v.estimatedQuantityKg ? <Kg kg={v.eligibleQuantityKg || v.estimatedQuantityKg} tonnes /> : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Harvest dates</dt>
                <dd>
                  {v.earliestHarvestDate && v.latestHarvestDate ? (
                    <>
                      <DateOnly date={v.earliestHarvestDate} /> – <DateOnly date={v.latestHarvestDate} />
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Minimum price</dt>
                <dd>{v.minPriceNaira ? <Price kobo={nairaToKobo(v.minPriceNaira)} /> : 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-muted">Transport</dt>
                <dd>{v.transportPreference === 'PROCESSOR_PAYS' ? 'Processor pays' : 'I may pay'}</dd>
              </div>
              {v.eligibleQuantityKg ? (
                <div>
                  <dt className="text-muted">Estimated harvest</dt>
                  <dd>{formatKg(v.estimatedQuantityKg || '0')}</dd>
                </div>
              ) : null}
              {Object.keys(errors).length ? (
                <div className="sm:col-span-2">
                  <Alert tone="danger">Some answers need fixing. Use the steps above.</Alert>
                </div>
              ) : null}
            </dl>
          ) : null}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {step > 0 && step < 4 ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        ) : null}
        {step < 4 ? (
          <Button type="button" onClick={next} size="lg">
            Next
          </Button>
        ) : (
          <>
            {online ? (
              <>
                <Button type="button" size="lg" onClick={() => void submit(true)} loading={busy === 'publish'} disabled={busy !== null || conflict}>
                  <Send className="size-4" aria-hidden /> {existing?.status === 'PUBLISHED' ? 'Save changes' : 'Publish to processors'}
                </Button>
                {existing?.status !== 'PUBLISHED' ? (
                  <Button type="button" variant="outline" onClick={() => void submit(false)} loading={busy === 'draft'} disabled={busy !== null || conflict}>
                    Save as draft
                  </Button>
                ) : null}
              </>
            ) : null}
            {!existing ? (
              <Button type="button" variant={online ? 'ghost' : 'primary'} onClick={() => void keepOnDevice()} loading={busy === 'local'} disabled={busy !== null}>
                <CloudOff className="size-4" aria-hidden /> Keep on this phone
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
