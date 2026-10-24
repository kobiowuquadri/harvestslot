'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FarmerGate, WithFarmerProfile } from '@/components/domain/farmer-gate';
import { emptyHarvestValues, HarvestForm, type HarvestFormValues } from '@/components/domain/harvest-form';
import { LoadingState, PageHeader } from '@/components/domain/states';
import { getDraft } from '@/lib/drafts';

function NewHarvest() {
  const params = useSearchParams();
  const draftParam = params.get('draft');
  const [initial, setInitial] = useState<HarvestFormValues | null>(draftParam ? null : emptyHarvestValues);
  useEffect(() => {
    if (!draftParam) return;
    getDraft(draftParam)
      .then((d) => setInitial(d ? { ...emptyHarvestValues, ...(d.values as Partial<HarvestFormValues>) } : emptyHarvestValues))
      .catch(() => setInitial(emptyHarvestValues));
  }, [draftParam]);
  return (
    <FarmerGate>
      {(ctx) => (
        <div className="mx-auto max-w-2xl">
          <PageHeader title="New harvest request" description="About two minutes. Nothing is shared with processors until you publish." />
          {initial ? (
            <WithFarmerProfile ctx={ctx}>{(profile) => <HarvestForm ctx={ctx} profile={profile} initial={initial} draftId={draftParam ?? undefined} />}</WithFarmerProfile>
          ) : (
            <LoadingState rows={1} />
          )}
        </div>
      )}
    </FarmerGate>
  );
}

export default function NewHarvestPage() {
  return <NewHarvest />;
}
