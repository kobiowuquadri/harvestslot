'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { InboxItem } from '@harvestslot/contracts';
import { DateOnly, Kg, Price } from '@/components/domain/display';
import { OfferForm } from '@/components/domain/offer-form';
import { OrgGate } from '@/components/domain/org-gate';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Dialog, DialogContent } from '@/components/ui/primitives';
import { can, useApi } from '@/lib/hooks';
import type { Workspace } from '@/lib/session';

function Inbox({ w }: { w: Extract<Workspace, { kind: 'processor' }> }) {
  const params = useSearchParams();
  const router = useRouter();
  const q = useApi<InboxItem[]>(['inbox', w.orgId], `/organisations/${w.orgId}/inbox`);
  const [offerFor, setOfferFor] = useState<InboxItem | null>(null);
  const highlighted = params.get('request');
  const approved = w.status === 'APPROVED';
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Harvest inbox" description="Published harvest requests your facilities could take, best fit first. Locations are shown by area until a booking is confirmed." />
      {!approved ? <Alert tone="warning">Your organisation must be reviewed before you can make offers.</Alert> : null}
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No matching harvest requests right now">Requests appear here when farmers near your facilities publish them, or invite you directly.</EmptyState>}>
        {(items) => (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {items.map((i) => (
              <li key={i.harvestRequestId} className={`rounded-xl border bg-surface p-4 ${highlighted === i.harvestRequestId ? 'border-forest ring-1 ring-forest' : 'border-line'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-forest">{i.reference}</span>
                  {i.invited ? <Badge tone="accent">Farmer asked you for an offer</Badge> : null}
                  {i.existingOfferId ? <Badge tone="info">Offer sent</Badge> : null}
                </div>
                <p className="mt-2 text-sm">
                  <strong>{i.farmerName}</strong> · {i.community ? `${i.community}, ` : ''}
                  {i.lga}
                </p>
                <p className="text-sm">
                  <Kg kg={i.remainingKg} tonnes /> available · harvest <DateOnly date={i.earliestHarvestDate} /> – <DateOnly date={i.latestHarvestDate} />
                </p>
                <p className="text-sm text-muted">
                  {i.minPriceKoboPerKg ? <>Minimum <Price kobo={i.minPriceKoboPerKg} /> · </> : null}
                  {i.transportPreference === 'PROCESSOR_PAYS' ? 'Wants processor-paid transport' : 'Farmer may pay transport'}
                  {i.variety ? ` · ${i.variety}` : ''}
                </p>
                <p className="text-sm text-muted">
                  Best fit: {i.bestFacility.facilityName}, {Math.round(i.bestFacility.straightLineKm)} km straight-line (score {Math.round(i.bestFacility.score)})
                </p>
                <div className="mt-3 flex gap-2">
                  {i.existingOfferId ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/offers/${i.existingOfferId}`}>View offer</Link>
                    </Button>
                  ) : can(w, 'processor.offer.manage') ? (
                    <Button size="sm" onClick={() => setOfferFor(i)} disabled={!approved}>
                      Make an offer
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      <Dialog open={offerFor !== null} onOpenChange={(o) => !o && setOfferFor(null)}>
        <DialogContent title={`Offer to ${offerFor?.farmerName ?? ''}`} description="The farmer sees exactly these terms. Capacity is held only when they accept." wide>
          {offerFor ? (
            <OfferForm
              orgId={w.orgId}
              harvest={{ harvestRequestId: offerFor.harvestRequestId, remainingKg: offerFor.remainingKg, earliestHarvestDate: offerFor.earliestHarvestDate, latestHarvestDate: offerFor.latestHarvestDate, transportPreference: offerFor.transportPreference, minPriceKoboPerKg: offerFor.minPriceKoboPerKg }}
              onDone={(o) => {
                setOfferFor(null);
                router.push(`/offers/${o.id}`);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function InboxPage() {
  return <OrgGate kind="processor">{(w) => <Inbox w={w} />}</OrgGate>;
}
