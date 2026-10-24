'use client';

import { LocateFixed } from 'lucide-react';
import { useState } from 'react';
import { OYO_LGAS, type FarmLocationDto } from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

type Source = 'DEVICE_GPS' | 'SELF_REPORTED_PIN' | 'COOPERATIVE_REPORTED' | 'DESCRIPTION_ONLY';

/**
 * Add or edit a farm location. GPS comes from the phone (with its reported accuracy); without it the
 * farmer can describe the place. The API stores exact coordinates privately and only shares an
 * approximate area until a booking needs the exact pickup point.
 */
export function LocationForm({ farmerProfileId, existing, actingForCooperative, onSaved }: { farmerProfileId: string; existing?: FarmLocationDto; actingForCooperative?: boolean; onSaved?: (l: FarmLocationDto) => void }) {
  const { config } = useSession();
  const lgas = config?.supportedLgas?.length ? config.supportedLgas : [...OYO_LGAS];
  const [label, setLabel] = useState(existing?.label ?? '');
  const [lga, setLga] = useState(existing?.lga ?? '');
  const [community, setCommunity] = useState(existing?.community ?? '');
  const [directions, setDirections] = useState(existing?.directions ?? '');
  const [point, setPoint] = useState<{ lat: number; lng: number; accuracyM?: number } | null>(existing?.exact ? { lat: existing.exact.lat, lng: existing.exact.lng, accuracyM: existing.exact.accuracyM ?? undefined } : null);
  const [source, setSource] = useState<Source>(existing?.source ?? 'DESCRIPTION_ONLY');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const save = useAction<void, FarmLocationDto>({
    request: () => {
      const body = {
        label,
        lga,
        community: community || undefined,
        directions: directions || undefined,
        point: point ? { lat: point.lat, lng: point.lng } : undefined,
        accuracyM: point?.accuracyM,
        source: point ? source : 'DESCRIPTION_ONLY',
        ...(existing ? { expectedVersion: existing.version } : {}),
      };
      return existing
        ? { path: `/farmers/${farmerProfileId}/locations/${existing.id}`, method: 'PATCH', body, idempotent: false }
        : { path: `/farmers/${farmerProfileId}/locations`, body };
    },
    invalidate: [['farmer-profile', farmerProfileId]],
    success: 'Location saved',
    toastErrors: false,
    onSuccess: (l) => onSaved?.(l),
  });

  const locate = () => {
    setGpsError(null);
    if (!('geolocation' in navigator)) {
      setGpsError('This device cannot share its location. Describe the place instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPoint({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)), accuracyM: Math.round(pos.coords.accuracy) });
        setSource(actingForCooperative ? 'COOPERATIVE_REPORTED' : 'DEVICE_GPS');
      },
      (err) => {
        setLocating(false);
        setGpsError(err.code === err.PERMISSION_DENIED ? 'Location permission was refused. You can still describe the place.' : 'Could not get a GPS fix. Try again outside, or describe the place.');
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
      <Field label="Name for this farm" hint="For example “Farm by the river”." required>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Local government area" required>
        <Select value={lga} onChange={(e) => setLga(e.target.value)}>
          <option value="" disabled>
            Choose…
          </option>
          {lgas.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Town or community">
        <Input value={community} onChange={(e) => setCommunity(e.target.value)} maxLength={120} />
      </Field>
      <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
        <p className="text-sm font-medium">Exact position (optional but helps the driver)</p>
        {point ? (
          <p className="text-sm">
            {point.lat.toFixed(5)}, {point.lng.toFixed(5)} {point.accuracyM !== undefined ? <span className="text-muted">(±{point.accuracyM} m, {source === 'DEVICE_GPS' ? 'from this phone' : source === 'COOPERATIVE_REPORTED' ? 'recorded by cooperative' : 'self-reported'})</span> : null}
          </p>
        ) : (
          <p className="text-sm text-muted">Stand at the farm entrance and use your phone’s GPS.</p>
        )}
        {point && point.accuracyM !== undefined && point.accuracyM > 100 ? <Alert tone="warning">The GPS accuracy is low (±{point.accuracyM} m). Add directions below.</Alert> : null}
        {gpsError ? <Alert tone="warning">{gpsError}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={locate} loading={locating}>
            <LocateFixed className="size-4" aria-hidden /> Use my current location
          </Button>
          {point ? (
            <Button type="button" variant="ghost" onClick={() => setPoint(null)}>
              Remove position
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted">Only you, people you authorise, and the transporter and processor of a confirmed booking see the exact position. Others see the area only.</p>
      </div>
      <Field label="Directions" hint="Landmarks a driver can follow, e.g. “after the Baptist church, second left”.">
        <Textarea value={directions} onChange={(e) => setDirections(e.target.value)} maxLength={500} />
      </Field>
      <Button type="submit" loading={save.isPending} disabled={!label || !lga}>
        {existing ? 'Save changes' : 'Add location'}
      </Button>
    </form>
  );
}
