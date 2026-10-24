'use client';

import { useParams } from 'next/navigation';
import type { HarvestDto } from '@harvestslot/contracts';
import { FarmerGate, WithFarmerProfile } from '@/components/domain/farmer-gate';
import { HarvestForm, valuesFromHarvest } from '@/components/domain/harvest-form';
import { PageHeader, QueryView } from '@/components/domain/states';
import { useApi } from '@/lib/hooks';

export default function EditHarvestPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<HarvestDto>(['harvest', id], `/harvests/${id}`);
  return (
    <FarmerGate>
      {(ctx) => (
        <div className="mx-auto max-w-2xl">
          <PageHeader title="Edit harvest request" description="Changes do not affect bookings already agreed — those keep their own terms." />
          <QueryView query={q}>
            {(h) => <WithFarmerProfile ctx={ctx}>{(profile) => <HarvestForm key={h.version} ctx={ctx} profile={profile} initial={valuesFromHarvest(h)} existing={h} />}</WithFarmerProfile>}
          </QueryView>
        </div>
      )}
    </FarmerGate>
  );
}
