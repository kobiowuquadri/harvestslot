'use client';

import { useEffect, useState } from 'react';
import { OYO_LGAS, VEHICLE_TYPE_LABELS, VehicleTypeE, type DriverDto, type VehicleDto, type VehicleType } from '@harvestslot/contracts';
import { DemoTag, Kg, StatusBadge, Window } from '@/components/domain/display';
import { OrgGate } from '@/components/domain/org-gate';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { lagosInputToIso } from '@/lib/utils';

function Vehicles({ orgId }: { orgId: string }) {
  const q = useApi<VehicleDto[]>(['vehicles', orgId], `/organisations/${orgId}/vehicles`);
  const [plate, setPlate] = useState('');
  const [type, setType] = useState<VehicleType>('LIGHT_TRUCK');
  const [capacity, setCapacity] = useState('5000');
  const add = useAction({ request: () => ({ path: `/organisations/${orgId}/vehicles`, body: { registrationPlate: plate, type, capacityKg: capacity }, idempotent: false }), invalidate: [['vehicles', orgId]], success: 'Vehicle added', toastErrors: false, onSuccess: () => setPlate('') });
  const status = useAction<{ v: VehicleDto; status: string }>({ request: ({ v, status: s }) => ({ path: `/vehicles/${v.id}`, method: 'PATCH', idempotent: false, body: { expectedVersion: v.version, status: s } }), invalidate: [['vehicles', orgId]], success: 'Vehicle updated' });
  return (
    <div className="flex flex-col gap-4">
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No vehicles yet" />}>
        {(items) => (
          <ul className="flex flex-col gap-2">
            {items.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
                <span className="font-mono font-semibold">{v.registrationPlate}</span>
                <span>
                  {VEHICLE_TYPE_LABELS[v.type]} · <Kg kg={v.capacityKg} />
                </span>
                <StatusBadge kind="generic" status={v.status} />
                {v.isDemo ? <DemoTag /> : null}
                {v.nextCommitment ? (
                  <span className="text-muted">
                    Next: {v.nextCommitment.bookingReference}, <Window start={v.nextCommitment.startsAt} end={v.nextCommitment.endsAt} />
                  </span>
                ) : null}
                <span className="ml-auto">
                  <Select aria-label={`Status of ${v.registrationPlate}`} value={v.status} onChange={(e) => status.mutate({ v, status: e.target.value })} className="h-9 w-40">
                    <option value="ACTIVE">Active</option>
                    <option value="MAINTENANCE">In maintenance</option>
                    <option value="RETIRED">Retired</option>
                  </Select>
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      <Card>
        <CardHeader>
          <CardTitle>Add a vehicle</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
          {add.error ? <Alert tone="danger" className="sm:col-span-4">{add.error.message}</Alert> : null}
          <Field label="Plate" error={add.error?.fieldErrors.registrationPlate}>
            <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="OYO-123-AB" />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as VehicleType)}>
              {VehicleTypeE.values.map((t) => (
                <option key={t} value={t}>
                  {VEHICLE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Capacity (kg)">
            <Input inputMode="decimal" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!plate}>
            Add
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Drivers({ orgId }: { orgId: string }) {
  const q = useApi<DriverDto[]>(['drivers', orgId], `/organisations/${orgId}/drivers`);
  const [emailOrPhone, setId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const add = useAction({ request: () => ({ path: `/organisations/${orgId}/drivers`, body: { emailOrPhone, displayName: name, phone: phone || undefined }, idempotent: false }), invalidate: [['drivers', orgId]], success: 'Driver added', toastErrors: false, onSuccess: () => { setId(''); setName(''); setPhone(''); } });
  const toggle = useAction<DriverDto>({ request: (d) => ({ path: `/drivers/${d.id}`, method: 'PATCH', idempotent: false, body: { expectedVersion: d.version, status: d.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }), invalidate: [['drivers', orgId]], success: 'Driver updated' });
  return (
    <div className="flex flex-col gap-4">
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No drivers yet" />}>
        {(items) => (
          <ul className="flex flex-col gap-2">
            {items.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
                <span className="font-medium">{d.displayName}</span>
                <span className="text-muted">{d.phone ?? 'no phone'}</span>
                <StatusBadge kind="generic" status={d.status} />
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => toggle.mutate(d)}>
                  {d.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      <Card>
        <CardHeader>
          <CardTitle>Add a driver</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
          {add.error ? <Alert tone="danger" className="sm:col-span-4">{add.error.message}</Alert> : null}
          <Field label="Their email or phone" hint="They sign in with this to see their jobs.">
            <Input value={emailOrPhone} onChange={(e) => setId(e.target.value)} />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Phone for farmers to call">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!emailOrPhone || !name}>
            Add
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ServiceAreas({ orgId }: { orgId: string }) {
  const { config } = useSession();
  const lgas = config?.supportedLgas?.length ? config.supportedLgas : [...OYO_LGAS];
  const q = useApi<string[]>(['service-areas', orgId], `/organisations/${orgId}/service-areas`);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (q.data) setSelected(q.data);
  }, [q.data]);
  const save = useAction({ request: () => ({ path: `/organisations/${orgId}/service-areas`, method: 'PUT', idempotent: false, body: { lgas: selected } }), invalidate: [['service-areas', orgId], ['opportunities', orgId]], success: 'Service areas saved' });
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted">You see transport requests for pickups in these local government areas.</p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
          {lgas.map((l) => (
            <Checkbox key={l} label={l} checked={selected.includes(l)} onChange={(e) => setSelected((p) => (e.target.checked ? [...p, l] : p.filter((x) => x !== l)))} />
          ))}
        </div>
        <Button className="self-start" onClick={() => save.mutate()} loading={save.isPending}>
          Save areas
        </Button>
      </CardContent>
    </Card>
  );
}

function Availability({ orgId }: { orgId: string }) {
  const vehicles = useApi<VehicleDto[]>(['vehicles', orgId], `/organisations/${orgId}/vehicles`);
  const q = useApi<Array<{ id: string; vehiclePlate: string; startsAt: string; endsAt: string; note: string | null }>>(['availability', orgId], `/organisations/${orgId}/availability`);
  const [vehicleId, setVehicleId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const add = useAction({ request: () => ({ path: `/organisations/${orgId}/availability`, body: { vehicleId, startsAt: lagosInputToIso(start), endsAt: lagosInputToIso(end) }, idempotent: false }), invalidate: [['availability', orgId]], success: 'Availability added', toastErrors: false });
  const remove = useAction<string>({ request: (id) => ({ path: `/availability/${id}`, method: 'DELETE', idempotent: false }), invalidate: [['availability', orgId]], success: 'Removed' });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Optional: tell HarvestSlot when vehicles are free. Commitments from accepted jobs are tracked automatically and can never overlap.</p>
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<p className="text-sm text-muted">No availability windows recorded.</p>}>
        {(rows) => (
          <ul className="flex flex-col gap-1 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                {r.vehiclePlate}: <Window start={r.startsAt} end={r.endsAt} />
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        {add.error ? <Alert tone="danger" className="sm:col-span-4">{add.error.message}</Alert> : null}
        <Field label="Vehicle">
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Choose…</option>
            {vehicles.data?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.registrationPlate}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Until">
          <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!vehicleId || !start || !end}>
          Add
        </Button>
      </div>
    </div>
  );
}

export default function FleetPage() {
  return (
    <OrgGate kind="transporter">
      {(w) => (
        <div className="flex flex-col gap-6">
          <PageHeader title="Fleet" description="Vehicles, drivers, where you operate and when you are free." />
          <Tabs defaultValue="vehicles">
            <TabsList>
              <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
              <TabsTrigger value="drivers">Drivers</TabsTrigger>
              <TabsTrigger value="areas">Service areas</TabsTrigger>
              <TabsTrigger value="availability">Availability</TabsTrigger>
            </TabsList>
            <TabsContent value="vehicles">
              <Vehicles orgId={w.orgId} />
            </TabsContent>
            <TabsContent value="drivers">
              <Drivers orgId={w.orgId} />
            </TabsContent>
            <TabsContent value="areas">
              <ServiceAreas orgId={w.orgId} />
            </TabsContent>
            <TabsContent value="availability">
              <Availability orgId={w.orgId} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </OrgGate>
  );
}
