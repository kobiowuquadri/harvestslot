import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/domain/marketing';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'How it works' };

const steps: Array<[string, string]> = [
  ['Choose what you want to do', 'Create a free account to sell your harvest (farmers) or buy fresh produce (processors). Only the details needed for the account are asked; farm or facility details come when they are first needed.'],
  ['The buyer publishes buying slots', 'A processor says which crop it buys, how much it can receive, where, and on which dates. Farmers are matched only against slots for the same crop.'],
  ['The farmer adds a harvest', 'What is for sale (cassava, tomatoes, peppers and more), where it is, roughly how much (in kg or tonnes, shown in kg to check) and when it will be ready. Drafts can be kept on the phone without a signal.'],
  ['Find a buyer and send a request', 'Buyers whose location, buying dates and free space fit are listed, each with one sentence such as “Can receive your full 2,000 kg on Thursday”. A request reserves nothing.'],
  ['The buyer sends an offer', 'Price per kg, quantity, date and time, and how the produce gets there: “We’ll collect from the farm” or “The farmer will deliver to our facility”, with any delivery cost to the farmer. Sending the offer holds the buyer’s space until it expires. An offer without a handover decision stays a draft.'],
  ['The farmer accepts or declines', 'Every material term is on one screen. Accepting confirms the plan at once — “[Buyer] will collect 2,000 kg at [place] on [date] for ₦100 per kg” — and it is ready to harvest. Declining keeps the harvest available.'],
  ['Harvest and hand over', 'The produce changes hands at the agreed place and time. No driver or vehicle needs to be registered. If anything material changes, both sides agree again.'],
  ['The buyer records the weight', 'What arrived and what was accepted, with reasons for any difference. The farmer sees the final amount for the accepted weight and can agree or report a problem.'],
  ['Payment reported, then received', 'The buyer records the payment (“Payment reported”). It counts as paid only when the farmer confirms the money arrived (“Payment received”).'],
];

export default function HowItWorks() {
  return (
    <>
      <PageIntro eyebrow="How it works" title="From expected harvest to confirmed payment">
        Nine steps, each confirmed by the person responsible. Nothing is assumed, and nothing is harvested on a promise.
      </PageIntro>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <ol className="relative flex flex-col gap-8 before:absolute before:bottom-6 before:left-5 before:top-6 before:w-px before:bg-line">
          {steps.map(([title, body], i) => (
            <li key={title} className="relative flex gap-5">
              <span className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-surface font-display text-sm font-semibold text-ink ring-1 ring-line shadow-[var(--shadow-card)]">{i + 1}</span>
              <div className="pt-1.5">
                <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-14 flex flex-col items-start gap-4 rounded-2xl border border-line bg-canvas p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-lg font-semibold text-ink">Ready to plan a harvest?</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/register">Create an account</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/roles">What each role does</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
