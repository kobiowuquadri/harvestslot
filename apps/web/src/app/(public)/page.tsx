import { CalendarCheck2, ClipboardCheck, Factory, HandCoins, Scale, Truck } from 'lucide-react';
import Link from 'next/link';
import { DemoEntry } from './demo-entry';

const checklist = [
  { icon: HandCoins, text: 'Who is buying your cassava, at what price per kilogram' },
  { icon: Factory, text: 'Which facility will receive and process it, and when' },
  { icon: ClipboardCheck, text: 'The quality requirements and quantity tolerance' },
  { icon: Truck, text: 'Who transports it, and who pays for transport' },
  { icon: CalendarCheck2, text: 'When to harvest, when pickup happens, what is still awaiting confirmation' },
  { icon: Scale, text: 'What happens if quantities differ, and what payment is due' },
];

export default function LandingPage() {
  return (
    <>
      <section className="bg-forest text-white">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-3 inline-block rounded-full bg-amber px-3 py-1 text-xs font-semibold text-amber-ink">Cassava · Oyo State, Nigeria</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Harvest with a confirmed plan.</h1>
            <p className="mt-4 max-w-xl text-lg text-white/90">
              HarvestSlot helps cassava farmers arrange a buyer, processing capacity and transport <em>before</em> harvesting — so fresh roots are not dug up without somewhere to go.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="rounded-lg bg-amber px-5 py-3 font-semibold text-amber-ink hover:bg-amber-100">
                Create an account
              </Link>
              <Link href="/how-it-works" className="rounded-lg border border-white/40 px-5 py-3 font-semibold text-white hover:bg-white/10">
                See how it works
              </Link>
            </div>
            <DemoEntry />
          </div>
          <div className="rounded-2xl bg-white p-6 text-ink shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-wide text-leaf">The question HarvestSlot answers</p>
            <p className="mt-1 text-2xl font-semibold text-forest">Is there a confirmed plan for this harvest?</p>
            <ul className="mt-5 flex flex-col gap-3">
              {checklist.map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3 text-sm">
                  <Icon className="mt-0.5 size-5 shrink-0 text-leaf" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
            <p className="mt-5 rounded-lg bg-leaf-50 p-3 text-sm text-forest">
              Only when the farmer, processor and transporter have all confirmed the same terms does a booking show <strong>Ready to harvest</strong>.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold text-forest">One booking, every commitment visible</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            ['Farmers', 'Post your expected harvest, compare offers in plain language, and start harvesting only when the plan is confirmed. You confirm pickup and payment yourself.'],
            ['Processors', 'Publish capacity by processing line and date, make offers that hold capacity, schedule intake, record weights and quality, and track what you owe.'],
            ['Transporters', 'See jobs in your service area, quote with a specific vehicle, and record pickup and delivery with handover codes instead of disputes.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border border-line bg-surface p-5">
              <h3 className="font-semibold text-forest">{title}</h3>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-semibold text-forest">What HarvestSlot does not do</h2>
          <ul className="mt-4 grid grid-cols-1 gap-2 text-sm text-muted sm:grid-cols-2">
            <li>• It does not hold or move the money for your cassava. Processors pay farmers directly; both sides confirm.</li>
            <li>• It never charges farmers a processing fee for selling their crop.</li>
            <li>• It does not show live vehicle tracking — drivers record milestones, and you confirm handovers.</li>
            <li>• It does not claim impact numbers it has not measured. HarvestSlot is a new service and publishes no pilot results yet.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
