'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FarmerGate, WithFarmerProfile } from '@/components/domain/farmer-gate';
import { emptyHarvestValues, HarvestForm, normaliseDraftValues, type HarvestFormValues } from '@/components/domain/harvest-form';
import { LoadingState, PageHeader } from '@/components/domain/states';
import { getDraft } from '@/lib/drafts';

function NewHarvest() {
  const params = useSearchParams();
  const draftParam = params.get('draft');
  // A link can choose the crop up front, e.g. /farmer/harvests/new?crop=TOMATO.
  const crop = params.get('crop') === 'TOMATO' ? 'TOMATO' : 'CASSAVA';
  const [initial, setInitial] = useState<HarvestFormValues | null>(draftParam ? null : { ...emptyHarvestValues, crop });
  useEffect(() => {
    if (!draftParam) return;
    getDraft(draftParam)
      .then((d) => setInitial(d ? normaliseDraftValues(d.values) : emptyHarvestValues))
      .catch(() => setInitial(emptyHarvestValues));
  }, [draftParam]);
  return (
    <FarmerGate>
      {(ctx) => (
        <div className="mx-auto max-w-2xl">
          <PageHeader title="Add my harvest" description="Three quick questions. Then we show buyers that fit — nothing is agreed until you accept an offer." />
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
