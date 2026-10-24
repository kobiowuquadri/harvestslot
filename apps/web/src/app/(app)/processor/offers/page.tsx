'use client';

import { useState } from 'react';
import { OFFER_STATUS_LABELS, OfferStatusE, type OfferDto } from '@harvestslot/contracts';
import { OfferCards } from '@/components/domain/lists';
import { OrgGate } from '@/components/domain/org-gate';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Select } from '@/components/ui/form';
import { useApi } from '@/lib/hooks';

function Offers({ orgId }: { orgId: string }) {
  const [status, setStatus] = useState('');
  const q = useApi<OfferDto[]>(['offers', orgId, status], `/organisations/${orgId}/offers${status ? `?status=${status}` : ''}`);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Offers"
        description="Offers you have made. An offer reserves nothing until the farmer accepts it."
        actions={
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
            <option value="">All</option>
            {OfferStatusE.values.map((s) => (
              <option key={s} value={s}>
                {OFFER_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        }
      />
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No offers" />}>
        {(items) => <OfferCards items={items} perspective="processor" />}
      </QueryView>
    </div>
  );
}

export default function OffersPage() {
  return <OrgGate kind="processor">{(w) => <Offers orgId={w.orgId} />}</OrgGate>;
}
