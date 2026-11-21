'use client';

import { useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import type { FarmLocationDto } from '@harvestslot/contracts';
import { ConfirmActionButton } from '@/components/domain/dialogs';
import { FarmerGate, useFarmerProfile } from '@/components/domain/farmer-gate';
import { LocationForm } from '@/components/domain/location-form';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, Dialog, DialogContent } from '@/components/ui/primitives';
import { farmerCan, type FarmerContext } from '@/lib/hooks';

const SOURCE_LABEL: Record<FarmLocationDto['source'], string> = {
  DEVICE_GPS: 'Phone GPS',
  SELF_REPORTED_PIN: 'Pin set by farmer',
  COOPERATIVE_REPORTED: 'Recorded by cooperative',
  DESCRIPTION_ONLY: 'Description only',
};

function Locations({ ctx }: { ctx: FarmerContext }) {
  const q = useFarmerProfile(ctx);
  const [editing, setEditing] = useState<FarmLocationDto | 'new' | null>(null);
  const canEdit = farmerCan(ctx, 'location.edit');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Farm locations"
        description="Processors see only the area until a booking is confirmed; the driver and processor of a confirmed booking see the exact pickup point."
        actions={
          canEdit ? (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> Add location
            </Button>
          ) : null
        }
      />
      <QueryView query={q}>
        {(p) => {
          const live = p.locations.filter((l) => !l.archived);
          return live.length ? (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {live.map((l) => (
                <li key={l.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-2">
                      <p className="flex items-center gap-2 font-semibold text-ink">
                        <MapPin className="size-4" aria-hidden /> {l.label}
                      </p>
                      <p className="text-sm">
                        {l.community ? `${l.community}, ` : ''}
                        {l.lga}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={l.exact ? 'success' : 'warning'}>{l.exact ? `Exact point saved${l.exact.accuracyM !== null ? ` (±${l.exact.accuracyM} m)` : ''}` : 'No exact point'}</Badge>
                        <Badge tone="neutral">{SOURCE_LABEL[l.source]}</Badge>
                      </div>
                      {l.directions ? <p className="text-sm text-muted">Directions: {l.directions}</p> : null}
                      {canEdit ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => setEditing(l)}>
                            Edit
                          </Button>
                          <ConfirmActionButton label="Archive" size="sm" variant="ghost" path={`/farmers/${ctx.farmerProfileId}/locations/${l.id}/archive`} invalidate={[['farmer-profile', ctx.farmerProfileId]]} success="Location archived. Existing requests and bookings keep it." />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No farm locations yet">Add the place where your harvest will be collected.</EmptyState>
          );
        }}
      </QueryView>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === 'new' ? 'Add a farm location' : 'Edit location'}>
          {editing ? <LocationForm farmerProfileId={ctx.farmerProfileId} existing={editing === 'new' ? undefined : editing} actingForCooperative={Boolean(ctx.acting)} onSaved={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LocationsPage() {
  return <FarmerGate>{(ctx) => <Locations ctx={ctx} />}</FarmerGate>;
}
