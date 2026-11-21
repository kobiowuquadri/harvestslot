'use client';

import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import {
  CROPS,
  PARTY_LABELS,
  REJECTION_HANDLING_LABELS,
  estimateFarmerNet,
  formatNaira,
  kgToGrams,
  type BookingTermsContent,
  type Readiness,
  type TimelineEvent,
} from '@harvestslot/contracts';
import { Alert, Badge, DescriptionList } from '@/components/ui/primitives';
import { DateOnly, Kg, Money, Price, When, Window } from './display';

/** The backend-computed readiness, check by check. Never toggled by the client. */
export function ReadinessChecklist({ readiness }: { readiness: Readiness }) {
  return (
    <section id="readiness" aria-labelledby="readiness-heading" className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="readiness-heading" className="whitespace-nowrap text-base font-semibold text-ink">
          Ready to harvest?
        </h2>
        {readiness.ready ? (
          <Badge tone="success">
            <CheckCircle2 className="size-3.5" aria-hidden /> Ready to harvest
          </Badge>
        ) : (
          <Badge tone="warning">
            <XCircle className="size-3.5" aria-hidden /> Not ready — do not harvest yet
          </Badge>
        )}
      </div>
      <ol className="flex flex-col gap-2">
        {readiness.checks.map((c) => (
          <li key={c.code} className="flex gap-3 rounded-lg border border-line bg-surface p-3">
            {c.passed ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-leaf" aria-label="Passed" /> : <Circle className="mt-0.5 size-5 shrink-0 text-amber-ink" aria-label="Not yet" />}
            <div className="min-w-0 text-sm">
              <p className="font-medium">{c.label}</p>
              <p className="text-muted">{c.explanation}</p>
              {!c.passed && c.responsible ? <p className="mt-1 text-xs font-medium text-amber-ink">Waiting on: {PARTY_LABELS[c.responsible]}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">Checked by HarvestSlot at <When at={readiness.computedAt} />. It updates automatically when anything changes.</p>
    </section>
  );
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="text-sm text-muted">No events yet.</p>;
  return (
    <ol className="relative ml-2 border-l border-line pl-5">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="mb-4 last:mb-0">
          <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-leaf" aria-hidden />
          <p className="text-sm font-medium">{e.title}</p>
          {e.detail ? <p className="text-sm text-muted">{e.detail}</p> : null}
          <p className="text-xs text-muted">
            <When at={e.at} />
            {e.actor ? ` · ${e.actor}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Plain-language summary of agreed terms, with the farmer's estimate kept separate from invoices. */
export function TermsSummary({ terms, viewer }: { terms: BookingTermsContent; viewer: 'farmer' | 'processor' | 'transporter' | 'other' }) {
  const net = estimateFarmerNet({
    quantityGrams: kgToGrams(terms.quantityKg),
    priceKoboPerKg: BigInt(terms.priceKoboPerKg),
    freightKobo: terms.transport ? BigInt(terms.transport.priceKobo) : null,
    freightPayer: terms.freightPayer,
  });
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg bg-leaf-50 p-3 text-sm text-forest">
        <strong>{terms.processor.name}</strong> buys <strong>
          <Kg kg={terms.quantityKg} tonnes />
        </strong>{' '}
        of {CROPS[terms.harvest.crop ?? 'CASSAVA'].produce} from <strong>{terms.farmer.displayName}</strong> at <strong><Price kobo={terms.priceKoboPerKg} /></strong>, for processing at {terms.facility.name}. Pickup{' '}
        <Window start={terms.pickupWindow.start} end={terms.pickupWindow.end} />; delivery <Window start={terms.deliveryWindow.start} end={terms.deliveryWindow.end} />.{' '}
        {terms.freightPayer === 'PROCESSOR' ? 'The processor pays for transport.' : 'The farmer pays for transport, as shown below.'}
      </p>
      <DescriptionList
        items={[
          ['Quantity', <Kg key="q" kg={terms.quantityKg} tonnes />],
          ['Price', <Price key="p" kobo={terms.priceKoboPerKg} />],
          ['Tolerance', `±${terms.toleranceBps / 100}% (accepting more than this needs an agreed amendment)`],
          ['Harvest date', <DateOnly key="hd" date={terms.harvest.plannedHarvestDate} />],
          ['Pickup from', `${terms.harvest.pickupLocationLabel}, ${terms.harvest.pickupLga}`],
          ['Processing', `${terms.facility.name} · ${terms.line.name} (${terms.line.product.toLowerCase()})`],
          ['Quality requirements', `Delivered within ${terms.qualityTerms.maxHoursHarvestToDelivery} h of harvest${terms.qualityTerms.soilAndStemsRemoved ? '; soil and stems removed' : ''}${terms.qualityTerms.maxVisibleRotPercent !== undefined ? `; ≤${terms.qualityTerms.maxVisibleRotPercent}% visible rot` : ''}${terms.qualityTerms.minRootLengthCm ? `; roots ≥${terms.qualityTerms.minRootLengthCm} cm` : ''}`],
          ['Rejected produce', REJECTION_HANDLING_LABELS[terms.rejectionHandling]],
          ['Payment', terms.invoiceDueRule],
          ['Cancellation', terms.cancellationTerms],
          [
            'Transport',
            terms.transport ? (
              <span key="t">
                {terms.transport.transporterName}, {terms.transport.vehiclePlate} ({terms.transport.vehicleType.toLowerCase().replace('_', ' ')}) — <Money kobo={terms.transport.priceKobo} /> paid by the{' '}
                {terms.transport.freightPayer.toLowerCase()}
              </span>
            ) : (
              'Not yet arranged'
            ),
          ],
          ['HarvestSlot fee', terms.platformFee.enabled ? `${terms.platformFee.bps / 100}% of the produce value, paid by the processor (≈ ${formatNaira(terms.platformFee.estimatedKobo)}). Never charged to the farmer.` : 'None'],
        ]}
      />
      {viewer === 'farmer' ? (
        <Alert tone="info" title="Your estimate (not an invoice)">
          If all <Kg kg={terms.quantityKg} /> is accepted: produce value <Money kobo={Number(net.produceAmountKobo)} />
          {net.farmerPaidFreightKobo > 0n ? (
            <>
              {' '}
              minus transport you pay <Money kobo={Number(net.farmerPaidFreightKobo)} />
            </>
          ) : null}{' '}
          = <strong><Money kobo={Number(net.estimatedNetKobo)} /></strong>. The final amount is based on the quantity accepted at the facility; payment is confirmed by you when it arrives.
        </Alert>
      ) : null}
    </div>
  );
}
