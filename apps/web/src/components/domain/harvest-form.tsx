'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Cherry, CloudOff, LocateFixed, MapPin, Plus, Scale, Search, Sprout } from 'lucide-react';
import {
  addDays,
  createHarvestSchema,
  CROPS,
  CropE,
  formatKg,
  formatLagosDate,
  formatTonnes,
  lagosDateString,
  OYO_LGAS,
  tonnesToKgString,
  updateHarvestSchema,
  type Crop,
  type FarmerProfileDto,
  type HarvestDto,
} from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { ChoiceCards, SearchSelect } from '@/components/ui/choice';
import { Field, Input } from '@/components/ui/form';
import { Alert, Dialog, DialogContent } from '@/components/ui/primitives';
import { ApiError, api, newIdempotencyKey } from '@/lib/api';
import { saveDraft } from '@/lib/drafts';
import { withFarmer, type FarmerContext } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useOnline } from './banners';
import { LocationForm } from './location-form';

type Unit = 'kg' | 't';
type Wait = '7' | '14' | '30';

export interface HarvestFormValues {
  /** What is for sale; fixed once the harvest is created. */
  crop: Crop;
  /** A saved farm location; empty when describing a new place. */
  farmLocationId: string;
  newPlace: boolean;
  lga: string;
  community: string;
  directions: string;
  lat: string;
  lng: string;
  accuracyM: string;
  quantity: string;
  unit: Unit;
  readyDate: string;
  waitDays: Wait;
}

export const emptyHarvestValues: HarvestFormValues = {
  crop: 'CASSAVA',
  farmLocationId: '',
  newPlace: false,
  lga: '',
  community: '',
  directions: '',
  lat: '',
  lng: '',
  accuracyM: '',
  quantity: '',
  unit: 'kg',
  readyDate: '',
  waitDays: '14',
};

/** Drafts saved by an older version of the form used other field names. */
export function normaliseDraftValues(raw: Record<string, unknown>): HarvestFormValues {
  const v = { ...emptyHarvestValues, ...(raw as Partial<HarvestFormValues>) };
  if (!v.quantity && typeof raw.estimatedQuantityKg === 'string') v.quantity = raw.estimatedQuantityKg;
  if (!v.readyDate && typeof raw.earliestHarvestDate === 'string') v.readyDate = raw.earliestHarvestDate;
  if (!CropE.values.includes(v.crop)) v.crop = 'CASSAVA';
  return v;
}

export function valuesFromHarvest(h: HarvestDto): HarvestFormValues {
  const days = Math.round((new Date(h.latestHarvestDate).getTime() - new Date(h.earliestHarvestDate).getTime()) / 86_400_000);
  return {
    ...emptyHarvestValues,
    crop: h.crop,
    farmLocationId: h.farmLocation.id,
    quantity: Number(h.eligibleQuantityKg).toString(),
    readyDate: h.earliestHarvestDate,
    waitDays: days <= 7 ? '7' : days <= 14 ? '14' : '30',
  };
}

/** Kilograms from what the farmer typed (kg or tonnes), or null when it is not a number. */
export function quantityKg(v: Pick<HarvestFormValues, 'quantity' | 'unit'>): string | null {
  const q = v.quantity.trim().replace(/,/g, '');
  if (!q) return null;
  if (v.unit === 'kg') return /^\d+(\.\d{1,3})?$/.test(q) ? q : null;
  try {
    return tonnesToKgString(q);
  } catch {
    return null;
  }
}

/** The API body for a new harvest request (also used to send drafts kept on the phone). */
export function harvestPayload(v: HarvestFormValues) {
  const kg = quantityKg(v) ?? '';
  const point = v.lat && v.lng ? { lat: Number(v.lat), lng: Number(v.lng) } : undefined;
  return {
    crop: v.crop,
    ...(v.farmLocationId && !v.newPlace
      ? { farmLocationId: v.farmLocationId }
      : {
          newLocation: {
            lga: v.lga,
            community: v.community.trim() || undefined,
            directions: v.directions.trim() || undefined,
            point,
            accuracyM: v.accuracyM ? Number(v.accuracyM) : undefined,
            source: point ? ('DEVICE_GPS' as const) : ('DESCRIPTION_ONLY' as const),
          },
        }),
    estimatedQuantityKg: kg,
    earliestHarvestDate: v.readyDate,
    latestHarvestDate: v.readyDate ? addDays(v.readyDate, Number(v.waitDays)) : '',
    transportPreference: 'PROCESSOR_PAYS' as const,
  };
}

const STEPS = ['What & where', 'How much', 'When', 'Check'] as const;
const STEP_PATHS: Array<(path: string) => boolean> = [
  (p) => p.startsWith('crop') || p.startsWith('farmLocationId') || p.startsWith('newLocation'),
  (p) => p.startsWith('estimatedQuantityKg') || p.startsWith('eligibleQuantityKg'),
  (p) => p.startsWith('earliestHarvestDate') || p.startsWith('latestHarvestDate'),
];

/**
 * "Add my harvest": what is for sale (cassava or tomatoes) and where, roughly how much, and when it will be ready — then a short
 * summary before "Find buyers". Works offline: the farmer can keep it on this phone and send it later;
 * sending uses the draft id as idempotency key, so retries never create a duplicate.
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
  const { me, config } = useSession();
  const locations = profile.locations.filter((l) => !l.archived);
  const [v, setV] = useState<HarvestFormValues>(() => ({ ...initial, newPlace: initial.newPlace || (!existing && locations.length === 0) }));
  const [step, setStep] = useState(existing ? 3 : 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'local'>(null);
  const [draftId] = useState(() => initialDraftId ?? newIdempotencyKey());
  const [addingLocation, setAddingLocation] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const [locating, setLocating] = useState<'idle' | 'busy' | 'failed'>('idle');
  const today = lagosDateString(new Date());
  const lgas = config?.supportedLgas?.length ? config.supportedLgas : [...OYO_LGAS];
  const set = <K extends keyof HarvestFormValues>(k: K, value: HarvestFormValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const kg = quantityKg(v);
  const noun = CROPS[v.crop].noun;

  const validate = (): Record<string, string> => {
    const out: Record<string, string> = {};
    const payload = harvestPayload(v);
    if (v.quantity.trim() && !kg) out.estimatedQuantityKg = v.unit === 't' ? 'Enter tonnes like 2 or 2.5' : 'Enter kilograms like 2000';
    if (v.readyDate && v.readyDate < today) out.earliestHarvestDate = 'Choose today or a later date';
    if (!existing && locations.length && !v.newPlace && !v.farmLocationId) out.farmLocationId = v.crop === 'TOMATO' ? 'Choose where the tomatoes are' : 'Choose where the cassava is';
    const result = existing
      ? updateHarvestSchema.safeParse({ farmLocationId: v.farmLocationId, estimatedQuantityKg: payload.estimatedQuantityKg, eligibleQuantityKg: payload.estimatedQuantityKg, earliestHarvestDate: payload.earliestHarvestDate, latestHarvestDate: payload.latestHarvestDate, expectedVersion: existing.version })
      : createHarvestSchema.safeParse({ ...payload, publish: true });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        out[path] ??= path === 'estimatedQuantityKg' ? `Enter how much ${noun} you have` : path === 'earliestHarvestDate' ? 'Choose when it will be ready' : path.startsWith('newLocation.lga') ? 'Choose the local government area' : issue.message;
      }
    }
    return out;
  };

  const stepErrors = (s: number, all: Record<string, string>) => Object.fromEntries(Object.entries(all).filter(([k]) => STEP_PATHS[s]?.(k)));

  const next = () => {
    const errs = stepErrors(step, validate());
    setErrors(errs);
    if (Object.keys(errs).length === 0) setStep((s) => Math.min(s + 1, 3));
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

  const submit = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = STEP_PATHS.findIndex((match) => Object.keys(errs).some(match));
      setStep(first === -1 ? 3 : first);
      return;
    }
    setBusy('save');
    setServerError(null);
    try {
      const payload = harvestPayload(v);
      let saved: HarvestDto;
      if (existing) {
        saved = await api<HarvestDto>(`/harvests/${existing.id}`, {
          method: 'PATCH',
          body: { farmLocationId: v.farmLocationId, estimatedQuantityKg: payload.estimatedQuantityKg, eligibleQuantityKg: payload.estimatedQuantityKg, earliestHarvestDate: payload.earliestHarvestDate, latestHarvestDate: payload.latestHarvestDate, expectedVersion: existing.version },
        });
        if (saved.status === 'DRAFT') saved = await api<HarvestDto>(`/harvests/${saved.id}/publish`, { method: 'POST', body: { expectedVersion: saved.version } });
      } else {
        saved = await api<HarvestDto>(`/farmers/${ctx.farmerProfileId}/harvests`, { method: 'POST', body: { ...payload, clientDraftId: draftId, publish: true }, idempotencyKey: draftId });
      }
      if (initialDraftId) await import('@/lib/drafts').then((d) => d.deleteDraft(initialDraftId));
      router.push(withFarmer(`/farmer/harvests/${saved.id}?saved=1`, ctx));
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

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocating('failed');
      return;
    }
    setLocating('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setV((p) => ({ ...p, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6), accuracyM: String(Math.round(pos.coords.accuracy)) }));
        setLocating('idle');
      },
      () => setLocating('failed'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  if (savedLocally) {
    return (
      <Alert tone="success" title="Saved on this phone">
        It has not been sent yet. When you are back online, open Harvests and choose “Send now”.
      </Alert>
    );
  }

  const placeLabel = v.newPlace || !v.farmLocationId
    ? [v.community.trim(), v.lga].filter(Boolean).join(', ') || 'Not chosen'
    : (() => {
        const l = locations.find((x) => x.id === v.farmLocationId);
        return l ? `${l.label}, ${l.lga}` : 'Not chosen';
      })();

  return (
    <div className="flex flex-col gap-5">
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => (i < step || existing ? setStep(i) : undefined)}
              aria-current={i === step ? 'step' : undefined}
              className={cn('flex w-full flex-col items-start gap-1.5 rounded-lg text-left text-xs font-medium', i === step ? 'text-ink' : i < step ? 'text-forest' : 'text-muted')}
            >
              <span className={cn('h-1.5 w-full rounded-full', i <= step ? 'bg-forest' : 'bg-line')} aria-hidden />
              {s}
            </button>
          </li>
        ))}
      </ol>
      {!online ? (
        <Alert tone="warning" title="You are offline">
          You can fill this in and keep it on this phone. Send it when you are back online.
        </Alert>
      ) : null}
      {conflict ? (
        <Alert tone="danger" title="This harvest was changed somewhere else">
          Your changes were not saved.{' '}
          <Link className="underline" href={withFarmer(`/farmer/harvests/${existing?.id}`, ctx)}>
            Open the latest version
          </Link>{' '}
          and make your change again.
        </Alert>
      ) : serverError ? (
        <Alert tone="danger">{serverError}</Alert>
      ) : null}

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        {step === 0 ? (
          <div className="flex flex-col gap-5">
            {existing ? (
              <p className="text-[15px] text-muted">
                Selling <strong className="text-ink">{noun}</strong>. To sell another crop, add a new harvest.
              </p>
            ) : (
              <ChoiceCards<Crop>
                name="crop"
                legend="What are you selling?"
                columns={2}
                value={v.crop}
                onChange={(c) => set('crop', c)}
                error={errors.crop}
                options={CropE.values.map((c) => ({ value: c, label: CROPS[c].label, description: CROPS[c].why, icon: c === 'TOMATO' ? <Cherry className="size-6" /> : <Sprout className="size-6" /> }))}
              />
            )}
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <MapPin className="size-5 text-forest" aria-hidden /> Where {v.crop === 'TOMATO' ? 'are the tomatoes' : 'is the cassava'}?
            </h2>
            {locations.length ? (
              <ChoiceCards<string>
                name="farmLocationId"
                legend="Your farms"
                value={v.newPlace ? '__new' : v.farmLocationId || null}
                onChange={(id) => setV((p) => ({ ...p, newPlace: id === '__new', farmLocationId: id === '__new' ? '' : id }))}
                error={errors.farmLocationId}
                options={[
                  ...locations.map((l) => ({ value: l.id, label: l.label, description: `${l.community ? `${l.community}, ` : ''}${l.lga}${l.exact ? ' · location saved' : ''}`, icon: <MapPin className="size-5" /> })),
                  ...(existing ? [] : [{ value: '__new', label: 'Somewhere else', description: 'Describe a different place', icon: <Plus className="size-5" /> }]),
                ]}
              />
            ) : null}
            {(v.newPlace || !locations.length) && !existing ? (
              <div className="flex flex-col gap-4 rounded-xl bg-canvas/60 p-4">
                <SearchSelect
                  id="harvest-lga"
                  label="Local government area"
                  required
                  options={lgas}
                  value={v.lga}
                  onChange={(x) => set('lga', x)}
                  placeholder="Start typing, e.g. Akinyele"
                  hint="Pick from the list. Buyers see only the area until a booking is confirmed."
                  error={errors['newLocation.lga'] ?? errors['newLocation'] ?? errors.farmLocationId}
                />
                <Field label="Town or village (optional)">
                  <Input value={v.community} onChange={(e) => set('community', e.target.value)} placeholder="e.g. Ojoo" />
                </Field>
                <Field label="Landmark or directions (optional)" hint="Shared only with the buyer you agree a booking with.">
                  <Input value={v.directions} onChange={(e) => set('directions', e.target.value)} placeholder="e.g. Behind the market, second left" />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" onClick={useMyLocation} loading={locating === 'busy'}>
                    <LocateFixed className="size-4" aria-hidden /> {v.lat ? 'Update my location' : 'Use my phone’s location'}
                  </Button>
                  <span className="text-[13px] text-muted" aria-live="polite">
                    {v.lat ? `Location saved (accurate to about ${v.accuracyM || '?'} m).` : locating === 'failed' ? 'Could not get your location — the area is enough.' : 'Optional — helps buyers plan collection.'}
                  </span>
                </div>
              </div>
            ) : null}
            {existing ? (
              <>
                <Button type="button" variant="outline" onClick={() => setAddingLocation(true)} disabled={!online}>
                  <Plus className="size-4" aria-hidden /> Add a farm location
                </Button>
                <Dialog open={addingLocation} onOpenChange={setAddingLocation}>
                  <DialogContent title="Add a farm location">
                    <LocationForm
                      farmerProfileId={ctx.farmerProfileId}
                      actingForCooperative={Boolean(ctx.acting)}
                      onSaved={(l) => {
                        setV((p) => ({ ...p, farmLocationId: l.id, newPlace: false }));
                        setAddingLocation(false);
                      }}
                    />
                  </DialogContent>
                </Dialog>
              </>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <Scale className="size-5 text-forest" aria-hidden /> Roughly how much {noun} {v.crop === 'TOMATO' ? 'are' : 'is'} for sale?
            </h2>
            <ChoiceCards<Unit>
              name="unit"
              legend="Unit"
              size="sm"
              columns={2}
              value={v.unit}
              onChange={(u) => set('unit', u)}
              options={[
                { value: 'kg', label: 'Kilograms (kg)' },
                { value: 't', label: 'Tonnes (t)' },
              ]}
            />
            <Field label={v.unit === 't' ? 'How many tonnes?' : 'How many kilograms?'} error={errors.estimatedQuantityKg} required>
              <Input inputMode="decimal" value={v.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder={v.unit === 't' ? 'e.g. 2' : 'e.g. 2000'} className="h-14 text-xl" />
            </Field>
            <p className="rounded-xl bg-leaf-50 px-4 py-3 text-[15px] text-forest-800" aria-live="polite">
              {kg && Number(kg) > 0 ? (
                <>
                  That is <strong className="text-lg">{formatKg(kg)}</strong>
                  {v.unit === 'kg' && Number(kg) >= 1000 ? ` (about ${formatTonnes(kg)})` : ''}. A rough figure is fine — the buyer weighs it.
                </>
              ) : (
                '1 tonne = 1,000 kg. A rough figure is fine — the buyer weighs it.'
              )}
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <CalendarDays className="size-5 text-forest" aria-hidden /> When will it be ready?
            </h2>
            <Field label="Ready from" error={errors.earliestHarvestDate} required>
              <Input type="date" min={today} value={v.readyDate} onChange={(e) => set('readyDate', e.target.value)} className="h-12" />
            </Field>
            <ChoiceCards<Wait>
              name="waitDays"
              legend={v.crop === 'TOMATO' ? 'How long can they stay on the plants after that?' : 'How long can it wait in the ground after that?'}
              size="sm"
              columns={3}
              value={v.waitDays}
              onChange={(w) => set('waitDays', w)}
              error={errors.latestHarvestDate}
              options={[
                { value: '7', label: 'About a week' },
                { value: '14', label: 'Two weeks' },
                { value: '30', label: 'A month' },
              ]}
            />
            <p className="text-[13px] text-muted">Do not harvest until your plan with a buyer is confirmed.</p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-ink">{existing ? 'Check your changes' : 'Check your harvest'}</h2>
            <dl className="divide-y divide-line rounded-xl border border-line">
              {[
                ['Selling', CROPS[v.crop].label, 0],
                ['Where', placeLabel, 0],
                ['How much', kg ? formatKg(kg) : 'Not entered', 1],
                ['Ready', v.readyDate ? `${formatLagosDate(v.readyDate)} — can wait until ${formatLagosDate(addDays(v.readyDate, Number(v.waitDays)))}` : 'Not chosen', 2],
              ].map(([k, val, s]) => (
                <div key={k as string} className="px-4 py-3">
                  <dt className="text-[13px] text-muted">{k}</dt>
                  <dd className="flex items-start justify-between gap-3 text-[15px] font-medium text-ink">
                    <span>{val}</span>
                    <button type="button" onClick={() => setStep(s as number)} className="shrink-0 rounded-md text-sm font-medium text-forest hover:underline">
                      Change<span className="sr-only"> {String(k).toLowerCase()}</span>
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
            {Object.keys(errors).length ? <Alert tone="danger">Some answers need fixing. Use “Change” to correct them.</Alert> : null}
            {!existing ? <p className="text-[13px] text-muted">Next we show buyers whose dates and space fit. Nothing is agreed until you accept an offer.</p> : null}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {step > 0 && !existing ? (
          <Button type="button" variant="outline" size="lg" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Button>
        ) : null}
        {step < 3 ? (
          <Button type="button" onClick={next} size="lg" className="flex-1 sm:flex-none">
            Next <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <>
            {online ? (
              <Button type="button" size="lg" onClick={() => void submit()} loading={busy === 'save'} disabled={busy !== null || conflict} className="flex-1 sm:flex-none">
                {existing ? (
                  'Save changes'
                ) : (
                  <>
                    <Search className="size-4" aria-hidden /> Find buyers
                  </>
                )}
              </Button>
            ) : null}
            {!existing ? (
              <Button type="button" variant={online ? 'ghost' : 'primary'} size="lg" onClick={() => void keepOnDevice()} loading={busy === 'local'} disabled={busy !== null}>
                <CloudOff className="size-4" aria-hidden /> Keep on this phone
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
