import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'How it works' };

const steps = [
  ['Post your harvest', 'The farmer (or their cooperative, with permission) says how much cassava will be ready, between which dates, and where to collect it. Drafts can be saved on the phone without a signal.'],
  ['See who could buy it', 'HarvestSlot lists processors with open capacity in those dates, explaining why each one fits — distance (marked as straight-line unless a road route is available), capacity, price indication and track record. A match is not an offer and reserves nothing.'],
  ['Receive offers that hold capacity', 'A processor sends an offer with exact terms: price per kg, quantity, harvest and pickup times, quality rules and what happens to rejected roots. The offer holds their capacity until it expires.'],
  ['Accept the exact terms', 'The farmer reviews a plain-language summary and accepts a specific version. Viewing an offer never accepts it. Accepting reserves the quantity so it cannot be sold twice.'],
  ['Arrange transport', 'Transporters serving the area quote with a named vehicle. The freight payer (the processor, unless the farmer explicitly agrees otherwise) accepts a quote; the transporter confirms a driver.'],
  ['Ready to harvest', 'When every party has confirmed the same version of the terms, capacity is committed and the booking shows Ready to harvest, with every check listed. If anything changes — a cancellation, an expired hold, a transport problem — readiness is lost immediately and everyone is told.'],
  ['Harvest, pickup and delivery', 'The farmer records harvest start. The driver records arrival and loading; the farmer confirms the handover in the app or gives the driver a one-time code. Receiving staff confirm delivery the same way.'],
  ['Weighing and quality', 'The facility records gross, tare and net weight with evidence, then the accepted and rejected quantity with reasons. If anything differs materially, the farmer reviews it and can accept or dispute — it is never accepted automatically.'],
  ['Invoices and payment', 'The produce invoice is for the accepted quantity at the agreed price. The payer records each payment; it counts only when the recipient confirms it arrived. Freight and the HarvestSlot service fee are separate invoices.'],
];

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-forest">How HarvestSlot works</h1>
      <p className="mt-2 text-muted">Nine steps from an expected harvest to a confirmed payment.</p>
      <ol className="mt-8 flex flex-col gap-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-4 rounded-xl border border-line bg-surface p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-forest font-semibold text-white">{i + 1}</span>
            <div>
              <h2 className="font-semibold text-forest">{title}</h2>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-muted">
        Ready to start? <Link href="/register" className="font-medium text-leaf underline">Create an account</Link> or read <Link href="/roles" className="font-medium text-leaf underline">what each role does</Link>.
      </p>
    </div>
  );
}
