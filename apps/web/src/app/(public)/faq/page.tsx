import type { Metadata } from 'next';
import { ChevronDown } from 'lucide-react';
import { PageIntro } from '@/components/domain/marketing';

export const metadata: Metadata = { title: 'FAQ and contact' };

const faqs = [
  ['Which crops can I sell?', 'Cassava and tomatoes for now: both spoil quickly after harvest, so agreeing the buyer first matters most. A buyer publishes slots for the crop it buys, and you are only matched with buyers of your crop.'],
  ['Does a match mean someone will buy my harvest?', 'No. A match only shows processors with open capacity that fits your dates and location. Nothing is reserved until a processor sends an offer and you accept its exact terms.'],
  ['When should I start harvesting?', 'Only when your booking shows "Ready to harvest". That means the buyer, processing capacity, transport, vehicle and driver are all confirmed for the current terms. If anything changes, the booking stops being ready and you are told why.'],
  ['Who brings the produce to the buyer?', 'The offer says: either the buyer collects from your farm, or you deliver to their facility. Any delivery cost you would pay is shown before you accept.'],
  ['What if the facility rejects part of my load?', 'The facility records the weights and the accepted and rejected quantities with reasons and evidence. You review any material difference and can accept it or open a dispute. You are invoiced for the accepted quantity at the agreed price.'],
  ['Does HarvestSlot hold my money?', 'No. Processors pay farmers directly. A payment counts as received only when you confirm it arrived. HarvestSlot only collects its own service fee from processors.'],
  ['Can my cooperative act for me?', 'Only within the permissions you give, which you can see and revoke at any time. Approving a sale is a separate permission from helping with data entry.'],
  ['Is my farm location public?', 'No. Others see only an approximate area. The exact pickup point is shared only with the buyer on your confirmed booking.'],
  ['Does it work without internet?', 'You can draft a harvest request offline on your phone and send it when you reconnect. Anything that commits you — accepting offers, confirming pickup or payments — needs a connection, so you always see the true current state.'],
];

export default function FaqPage() {
  return (
    <>
      <PageIntro eyebrow="FAQ" title="Frequently asked questions">
        Short answers about matching, readiness, transport, payments and privacy.
      </PageIntro>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {faqs.map(([q, a]) => (
            <details key={q} className="group px-5 py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-5 text-[15px] leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
        <section className="mt-10 rounded-2xl border border-line bg-canvas p-6" aria-labelledby="contact">
          <h2 id="contact" className="font-display text-xl font-semibold text-ink">Contact</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Support contact details are set by the operator of this HarvestSlot deployment. <strong className="text-ink">[OPERATOR TO COMPLETE: support email, phone/WhatsApp line, office hours, postal address.]</strong>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">Signed-in users can raise issues on a specific booking from its page (messages or disputes), which keeps a complete record for everyone involved.</p>
        </section>
      </div>
    </>
  );
}
