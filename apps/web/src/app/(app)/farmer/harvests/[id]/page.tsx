'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Info, MapPin, Send } from 'lucide-react';
import type { HarvestDto, MatchResponse, MatchResult, OfferDto } from '@harvestslot/contracts';
import { ConfirmActionButton, ReasonActionDialog } from '@/components/domain/dialogs';
import {
  DateOnly,
  DemoTag,
  Kg,
  Money,
  Price,
  ReviewedTag,
  StatusBadge,
  When,
} from '@/components/domain/display';
import { FarmerGate } from '@/components/domain/farmer-gate';
import { AllocationBar, OfferCards } from '@/components/domain/lists';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DescriptionList,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Td,
  Th,
} from '@/components/ui/primitives';
import { farmerCan, useApi, withFarmer, type FarmerContext } from '@/lib/hooks';

function MatchCard({ m, harvestId, canAsk }: { m: MatchResult; harvestId: string; canAsk: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{m.processorName}</CardTitle>
          <ReviewedTag approved={m.processorReviewed} />
          <Badge tone="neutral">Score {Math.round(m.score)}/100</Badge>
        </div>
        <p className="text-sm text-muted">
          {m.facilityName} · {m.lga} · {m.slot.lineName} ({m.slot.product.toLowerCase()})
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DescriptionList
          items={[
            [
              'Indicative price',
              m.indicativePriceKoboPerKg ? (
                <Price key="p" kobo={m.indicativePriceKoboPerKg} />
              ) : (
                'Not published — ask for an offer'
              ),
            ],
            ['Could take', <Kg key="k" kg={m.fitKg} tonnes />],
            ['Processing slot', <When key="s" at={m.slot.startsAt} />],
            ['Distance', m.distance.label],
            [
              'Estimated value to you',
              m.costs.estimatedFarmerNetKobo !== null ? (
                <Money key="v" kobo={m.costs.estimatedFarmerNetKobo} />
              ) : (
                '—'
              ),
            ],
            ['Track record', m.reliability.label],
          ]}
        />
        <p className="text-xs text-muted">{m.costs.freightNote}</p>
        <details className="rounded-lg border border-line p-3 text-sm">
          <summary className="cursor-pointer font-medium">Why this match is ranked here</summary>
          <ul className="mt-2 list-disc pl-5">
            {m.explanation.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <Table caption="Ranking factors" className="mt-3 min-w-0">
            <thead>
              <tr>
                <Th>Factor</Th>
                <Th>Weight</Th>
                <Th>Score</Th>
                <Th>Why</Th>
              </tr>
            </thead>
            <tbody>
              {m.factors.map((f) => (
                <tr key={f.key}>
                  <Td>{f.label}</Td>
                  <Td>{Math.round(f.weight * 100)}%</Td>
                  <Td>{f.score === null ? 'n/a' : Math.round(f.score * 100)}</Td>
                  <Td className="text-muted">{f.explanation}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted">
            Still needed before harvest: {m.remainingSteps.join(' → ')}
          </p>
        </details>
        <p className="text-xs text-muted">
          Quality asked for: delivered within {m.qualityCriteria.maxHoursHarvestToDelivery} h of harvest
          {m.qualityCriteria.soilAndStemsRemoved ? ', soil and stems removed' : ''}. Availability as of{' '}
          <When at={m.availabilityAsOf} />.
        </p>
        {m.invited ? (
          <Badge tone="info">Offer requested — waiting for the processor</Badge>
        ) : canAsk ? (
          <ConfirmActionButton
            label={
              <>
                <Send className="size-4" aria-hidden /> Ask for an offer
              </>
            }
            path={`/harvests/${harvestId}/offer-requests`}
            body={{ facilityId: m.facilityId }}
            invalidate={[['matches', harvestId]]}
            success="The processor has been asked for an offer"
            variant="secondary"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function Matches({ harvest, ctx }: { harvest: HarvestDto; ctx: FarmerContext }) {
  const q = useApi<MatchResponse>(
    ['matches', harvest.id],
    harvest.status === 'PUBLISHED' ? `/harvests/${harvest.id}/matches` : null,
  );
  if (harvest.status !== 'PUBLISHED')
    return <Alert tone="info">Publish the request to see which processors could take your cassava.</Alert>;
  return (
    <QueryView query={q}>
      {(r) => (
        <div className="flex flex-col gap-4">
          <Alert tone="info" title="These are recommendations, not offers">
            {r.disclaimer} Computed <When at={r.computedAt} />.
          </Alert>
          {r.infeasible ? (
            <Alert tone="warning" title="No processor can take this request right now">
              <ul className="list-disc pl-5">
                {r.infeasible.reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {r.infeasible.suggestions.length ? (
                <>
                  <p className="mt-2 font-medium">You could:</p>
                  <ul className="list-disc pl-5">
                    {r.infeasible.suggestions.map((s) => (
                      <li key={s.text}>{s.text}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Alert>
          ) : null}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {r.results.map((m) => (
              <MatchCard
                key={`${m.facilityId}-${m.slot.id}`}
                m={m}
                harvestId={harvest.id}
                canAsk={farmerCan(ctx, 'harvest.edit')}
              />
            ))}
          </div>
        </div>
      )}
    </QueryView>
  );
}

function OffersCompare({ harvestId, ctx }: { harvestId: string; ctx: FarmerContext }) {
  const q = useApi<OfferDto[]>(['offers', 'harvest', harvestId], `/harvests/${harvestId}/offers`);
  return (
    <QueryView
      query={q}
      isEmpty={(d) => d.length === 0}
      empty={
        <EmptyState title="No offers yet">
          Processors you asked, and processors who find your request, can send offers. You will get a
          notification.
        </EmptyState>
      }
    >
      {(offers) => (
        <>
          <div className="md:hidden">
            <OfferCards items={offers} perspective="farmer" />
          </div>
          <div className="hidden md:block">
            <Table caption="Offers for this harvest">
              <thead>
                <tr>
                  <Th>Processor</Th>
                  <Th>Status</Th>
                  <Th>Quantity</Th>
                  <Th>Price</Th>
                  <Th>Est. value</Th>
                  <Th>Harvest date</Th>
                  <Th>Transport</Th>
                  <Th>Expires</Th>
                  <Th>
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <Td>
                      <span className="font-medium">{o.processorName}</span>
                      <span className="block text-xs text-muted">
                        {o.facility.name}
                        {o.straightLineKm !== null
                          ? ` · ${Math.round(o.straightLineKm)} km straight-line`
                          : ''}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge kind="offer" status={o.status} />
                      {o.awaiting === 'FARMER' ? (
                        <span className="mt-1 block text-xs font-semibold text-amber-ink">
                          Your reply needed
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Kg kg={o.current.quantityKg} />
                    </Td>
                    <Td>
                      <Price kobo={o.current.priceKoboPerKg} />
                    </Td>
                    <Td>
                      <Money kobo={o.current.estimatedProduceAmountKobo} />
                    </Td>
                    <Td>
                      <DateOnly date={o.current.plannedHarvestDate} />
                    </Td>
                    <Td>{o.current.freightPayer === 'PROCESSOR' ? 'Processor pays' : 'You pay'}</Td>
                    <Td>
                      <When at={o.expiresAt} relative />
                    </Td>
                    <Td>
                      <Link
                        className="font-medium text-leaf underline"
                        href={withFarmer(`/offers/${o.id}`, ctx)}
                      >
                        View
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </QueryView>
  );
}

function HarvestDetail({ ctx }: { ctx: FarmerContext }) {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const q = useApi<HarvestDto>(['harvest', id], `/harvests/${id}`);
  const editable = farmerCan(ctx, 'harvest.edit');
  return (
    <QueryView query={q}>
      {(h) => (
        <div className="flex flex-col gap-6">
          <PageHeader
            eyebrow={
              <Link href={withFarmer('/farmer/harvests', ctx)} className="underline">
                Harvest requests
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-2">
                {h.reference} <StatusBadge kind="harvest" status={h.status} /> {h.isDemo ? <DemoTag /> : null}
              </span>
            }
            actions={
              editable ? (
                <>
                  {h.status === 'DRAFT' ? (
                    <ConfirmActionButton
                      label="Publish to processors"
                      path={`/harvests/${h.id}/publish`}
                      body={{ expectedVersion: h.version }}
                      invalidate={[['harvest', id], ['harvests']]}
                      success="Published — processors can now see it"
                    />
                  ) : null}
                  {['DRAFT', 'PUBLISHED'].includes(h.status) ? (
                    <Button asChild variant="outline">
                      <Link href={withFarmer(`/farmer/harvests/${h.id}/edit`, ctx)}>Edit</Link>
                    </Button>
                  ) : null}
                  {h.status === 'PUBLISHED' ? (
                    <ReasonActionDialog
                      trigger="Stop taking offers"
                      title="Close this request?"
                      description="Open offers lapse. Agreed bookings are not affected."
                      confirmLabel="Close request"
                      path={`/harvests/${h.id}/close`}
                      body={{ expectedVersion: h.version }}
                      invalidate={[['harvest', id], ['harvests']]}
                      success="Request closed"
                    />
                  ) : null}
                  {['DRAFT', 'PUBLISHED'].includes(h.status) && h.bookings === 0 ? (
                    <ReasonActionDialog
                      trigger="Withdraw"
                      title="Withdraw this request?"
                      description="Use this if the cassava is no longer for sale."
                      confirmLabel="Withdraw request"
                      path={`/harvests/${h.id}/withdraw`}
                      body={{ expectedVersion: h.version }}
                      invalidate={[['harvest', id], ['harvests']]}
                      success="Request withdrawn"
                    />
                  ) : null}
                </>
              ) : null
            }
          />
          {params.get('published') ? (
            <Alert tone="success" title="Published">
              Matching processors are listed below. You will be notified when an offer arrives.
            </Alert>
          ) : null}
          <Card>
            <CardContent className="flex flex-col gap-4">
              <DescriptionList
                items={[
                  [
                    'Farm',
                    <span key="f" className="inline-flex items-center gap-1">
                      <MapPin className="size-4" aria-hidden /> {h.farmLocation.label},{' '}
                      {h.farmLocation.community ? `${h.farmLocation.community}, ` : ''}
                      {h.farmLocation.lga}
                    </span>,
                  ],
                  ['Estimated harvest', <Kg key="e" kg={h.estimatedQuantityKg} tonnes />],
                  ['For sale', <Kg key="s" kg={h.eligibleQuantityKg} tonnes />],
                  [
                    'Harvest window',
                    <span key="w">
                      <DateOnly date={h.earliestHarvestDate} /> – <DateOnly date={h.latestHarvestDate} />
                    </span>,
                  ],
                  ['Minimum price', <Price key="p" kobo={h.minPriceKoboPerKg} />],
                  [
                    'Transport',
                    h.transportPreference === 'PROCESSOR_PAYS' ? 'Processor pays' : 'Farmer may pay',
                  ],
                  ['Variety', h.variety ?? '—'],
                  [
                    'Created by',
                    `${h.createdBy.displayName}${h.createdBy.viaCooperative ? ` (for ${h.farmerName}, via ${h.createdBy.viaCooperative})` : ''}`,
                  ],
                ]}
              />
              <AllocationBar allocated={h.allocation.allocatedKg} eligible={h.allocation.eligibleKg} />
              {h.bookings ? (
                <Link
                  className="inline-flex items-center gap-1 text-sm font-medium text-leaf underline"
                  href={withFarmer('/bookings', ctx)}
                >
                  <Info className="size-4" aria-hidden /> {h.bookings} booking{h.bookings > 1 ? 's' : ''} from
                  this request
                </Link>
              ) : null}
            </CardContent>
          </Card>
          <Tabs defaultValue={h.openOffers ? 'offers' : 'matches'}>
            <TabsList>
              <TabsTrigger value="matches">Matching processors</TabsTrigger>
              <TabsTrigger value="offers">Offers ({h.openOffers} open)</TabsTrigger>
            </TabsList>
            <TabsContent value="matches">
              <Matches harvest={h} ctx={ctx} />
            </TabsContent>
            <TabsContent value="offers">
              <OffersCompare harvestId={h.id} ctx={ctx} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </QueryView>
  );
}

export default function HarvestDetailPage() {
  return <FarmerGate>{(ctx) => <HarvestDetail ctx={ctx} />}</FarmerGate>;
}
