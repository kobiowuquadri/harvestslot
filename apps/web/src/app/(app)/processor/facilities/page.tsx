'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ProcessingProductE, type FacilityDto } from '@harvestslot/contracts';
import { DemoTag, Kg, Price, StatusBadge } from '@/components/domain/display';
import { FacilityForm } from '@/components/domain/facility-form';
import { OrgGate } from '@/components/domain/org-gate';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Badge, Card, CardContent, CardHeader, CardTitle, DescriptionList, Dialog, DialogContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';

function AddLine({ facility, orgId }: { facility: FacilityDto; orgId: string }) {
  const [name, setName] = useState('');
  const [product, setProduct] = useState('GARRI');
  const add = useAction({ request: () => ({ path: `/facilities/${facility.id}/lines`, body: { name, product }, idempotent: false }), invalidate: [['facilities', orgId]], success: 'Line added', onSuccess: () => setName('') });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field label="New line name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Garri line 2" />
      </Field>
      <Field label="Product">
        <Select value={product} onChange={(e) => setProduct(e.target.value)}>
          {ProcessingProductE.values.map((p) => (
            <option key={p} value={p}>
              {p.toLowerCase()}
            </option>
          ))}
        </Select>
      </Field>
      <Button onClick={() => add.mutate()} loading={add.isPending} disabled={name.trim().length < 1}>
        Add line
      </Button>
    </div>
  );
}

function LineToggle({ line, orgId }: { line: FacilityDto['lines'][number]; orgId: string }) {
  const toggle = useAction({ request: () => ({ path: `/lines/${line.id}`, method: 'PATCH', idempotent: false, body: { expectedVersion: line.version, status: line.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }), invalidate: [['facilities', orgId]], success: 'Line updated' });
  return (
    <Button size="sm" variant="ghost" onClick={() => toggle.mutate()} loading={toggle.isPending}>
      {line.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
    </Button>
  );
}

function Facilities({ orgId }: { orgId: string }) {
  const q = useApi<FacilityDto[]>(['facilities', orgId], `/organisations/${orgId}/facilities`);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FacilityDto | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Facilities and lines"
        description="Each facility has its own location, quality requirements and default terms, used to pre-fill offers."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Add facility
          </Button>
        }
      />
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No facilities yet">Add your processing site to publish capacity.</EmptyState>}>
        {(items) => (
          <div className="flex flex-col gap-4">
            {items.map((f) => (
              <Card key={f.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{f.name}</CardTitle>
                    <StatusBadge kind="generic" status={f.status} />
                    {f.isDemo ? <DemoTag /> : null}
                    <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditing(f)}>
                      Edit
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <DescriptionList
                    items={[
                      ['Location', `${f.address ? `${f.address}, ` : ''}${f.lga} (${f.lat.toFixed(4)}, ${f.lng.toFixed(4)})`],
                      ['Minimum order', <Kg key="m" kg={f.minOrderKg} />],
                      ['Furthest pickup', `${f.maxPickupDistanceKm} km`],
                      ['Indicative price', <Price key="p" kobo={f.indicativePriceKoboPerKg} />],
                      ['Defaults', `±${f.defaultToleranceBps / 100}% tolerance · pay within ${f.defaultPaymentTermsDays} days`],
                      ['Quality', `≤${f.qualityCriteria.maxHoursHarvestToDelivery} h from harvest${f.qualityCriteria.soilAndStemsRemoved ? ', soil and stems removed' : ''}`],
                    ]}
                  />
                  <div>
                    <p className="mb-2 text-sm font-medium">Processing lines</p>
                    <ul className="flex flex-col gap-1">
                      {f.lines.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                          {l.name} <Badge tone="neutral">{l.product.toLowerCase()}</Badge> <StatusBadge kind="generic" status={l.status} />
                          <LineToggle line={l} orgId={orgId} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <AddLine facility={f} orgId={orgId} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryView>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === 'new' ? 'Add a facility' : 'Edit facility'} wide>
          {editing ? (
            <FacilityForm
              orgId={orgId}
              existing={editing === 'new' ? undefined : editing}
              onDone={() => {
                setEditing(null);
                void qc.invalidateQueries({ queryKey: ['facilities', orgId] });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function FacilitiesPage() {
  return <OrgGate kind="processor">{(w) => <Facilities orgId={w.orgId} />}</OrgGate>;
}
