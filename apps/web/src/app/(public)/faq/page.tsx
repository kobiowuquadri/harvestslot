import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'FAQ and contact' };

const faqs = [
  ['Does a match mean someone will buy my cassava?', 'No. A match only shows processors with open capacity that fits your dates and location. Nothing is reserved until a processor sends an offer and you accept its exact terms.'],
  ['When should I start harvesting?', 'Only when your booking shows "Ready to harvest". That means the buyer, processing capacity, transport, vehicle and driver are all confirmed for the current terms. If anything changes, the booking stops being ready and you are told why.'],
  ['Who pays for transport?', 'The processor, unless you explicitly agree to pay. Farmer-paid transport is always shown to you and needs your confirmation.'],
  ['What if the facility rejects part of my load?', 'The facility records the weights and the accepted and rejected quantities with reasons and evidence. You review any material difference and can accept it or open a dispute. You are invoiced for the accepted quantity at the agreed price.'],
  ['Does HarvestSlot hold my money?', 'No. Processors pay farmers directly. A payment counts as received only when you confirm it arrived. HarvestSlot only collects its own service fee from processors.'],
  ['Can my cooperative act for me?', 'Only within the permissions you give, which you can see and revoke at any time. Approving a sale is a separate permission from helping with data entry.'],
  ['Is my farm location public?', 'No. Others see only an approximate area. The exact pickup point is shared only with the processor and transporter on your confirmed booking.'],
  ['Does it work without internet?', 'You can draft a harvest request offline on your phone and send it when you reconnect. Anything that commits you — accepting offers, confirming pickup or payments — needs a connection, so you always see the true current state.'],
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-forest">Frequently asked questions</h1>
      <div className="mt-6 flex flex-col gap-3">
        {faqs.map(([q, a]) => (
          <details key={q} className="group rounded-xl border border-line bg-surface p-4 open:shadow-sm">
            <summary className="cursor-pointer list-none font-medium text-forest">{q}</summary>
            <p className="mt-2 text-sm text-muted">{a}</p>
          </details>
        ))}
      </div>
      <section className="mt-10 rounded-xl border border-line bg-surface p-6" aria-labelledby="contact">
        <h2 id="contact" className="text-xl font-semibold text-forest">Contact</h2>
        <p className="mt-2 text-sm text-muted">
          Support contact details are set by the operator of this HarvestSlot deployment. <strong>[OPERATOR TO COMPLETE: support email, phone/WhatsApp line, office hours, postal address.]</strong>
        </p>
        <p className="mt-2 text-sm text-muted">Signed-in users can raise issues on a specific booking from its page (messages or disputes), which keeps a complete record for everyone involved.</p>
      </section>
    </div>
  );
}
