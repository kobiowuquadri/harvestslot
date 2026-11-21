import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Factory,
  HandCoins,
  KeyRound,
  ListChecks,
  Scale,
  Sprout,
  Truck,
  XCircle,
} from 'lucide-react';
import Image from 'next/image';
import { Photo } from '@/components/domain/photo';
import { Button } from '@/components/ui/button';
import { photos } from '@/content/photos';
import { team } from '@/content/team';

const roles = [
  { icon: Sprout, title: 'Sell your harvest', body: 'Add your harvest of any listed crop, choose a buyer, agree who collects and when — then harvest.' },
  { icon: Factory, title: 'Buy fresh produce', body: 'Publish buying slots for each crop, answer farmers’ requests, record the weight and the payment.' },
  { icon: Truck, title: 'Collect or deliver', body: 'One decision in the offer: the buyer collects from the farm, or the farmer delivers.' },
  { icon: HandCoins, title: 'Paid for what is accepted', body: 'The final amount uses the weight accepted; the farmer confirms the money arrived.' },
];

const steps = [
  { icon: Sprout, title: 'Add your harvest', body: 'What you are selling, where it is, roughly how much (kg or tonnes) and when it will be ready. Drafts wait on the phone without a signal.' },
  { icon: ListChecks, title: 'Find a buyer', body: 'See buyers whose location, buying dates and free space fit — each explained in one sentence — and send a request.' },
  { icon: Truck, title: 'Accept the offer', body: 'Price, quantity, date, place and who brings the produce are on one screen. Accept or decline; declining keeps your harvest listed.' },
  { icon: BadgeCheck, title: 'Ready to harvest', body: 'Once both sides agree and the buyer’s space is reserved, the plan says so in one sentence. Then weigh, pay and confirm receipt.' },
];

const features = [
  { icon: ListChecks, title: 'Buyers explained in one sentence', body: '“Can receive your full 2,000 kg on Thursday.” Each suggestion says why it fits — dates, distance (labelled straight-line) and free space.' },
  { icon: CalendarClock, title: 'Space that is really held', body: 'A sent offer holds the buyer’s capacity until it expires, and acceptance reserves it. Two farmers can never be promised the same space.' },
  { icon: CheckCircle2, title: 'Always “what happens next”', body: 'Every plan says who acts next — “Waiting for the buyer’s offer”, “Record the weight”, “Confirm you received ₦190,000”.' },
  { icon: KeyRound, title: 'Changes need agreement', body: 'If price, quantity, date or the handover changes, both sides agree again. Nothing is edited behind anyone’s back.' },
  { icon: Scale, title: 'Paid on the accepted weight', body: 'The buyer records what arrived and what they accept. Any difference from the offer is flagged, and the farmer can agree or report a problem.' },
  { icon: HandCoins, title: 'Payment the farmer confirms', body: '“Payment reported” and “Payment received” are kept apart: it counts as paid only when the farmer confirms the money arrived.' },
];

const audiences = [
  { id: 'farmers', title: 'Farmers selling their harvest', photo: photos.farmerHoldingCassava, body: 'Know your buyer, price, place and day before you harvest, and confirm every payment yourself. Free for farmers.' },
  { id: 'processors', title: 'Processors buying fresh produce', photo: photos.tomatoBaskets, body: 'Tell farmers what you buy, how much you can receive, where and when. Plan intake instead of hoping for deliveries, and keep weights on record.' },
];

const notDone = [
  'Hold or move the money for your harvest — buyers pay farmers directly and the farmer confirms.',
  'Charge farmers a fee for selling their crop.',
  'Track trucks live — the buyer collects or the farmer delivers, at the agreed time.',
  'Publish impact numbers it has not measured. HarvestSlot is a new service with no pilot results yet.',
];

function SectionHeading({ eyebrow, title, body, center = false }: { eyebrow: string; title: string; body?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="font-display text-sm font-semibold text-forest">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.1rem] sm:leading-tight">{title}</h2>
      {body ? <p className="mt-3 text-base leading-relaxed text-muted">{body}</p> : null}
    </div>
  );
}

function HeroCardLeft() {
  return (
    <div className="relative mx-auto w-full max-w-[290px]">
      <div className="dot-grid absolute -right-8 -top-8 h-24 w-28 opacity-50" aria-hidden />
      <div className="relative aspect-[3/4] overflow-hidden rounded-[28px] bg-line shadow-[var(--shadow-raised)]">
        <Photo photo={photos.farmerHarvesting} mono priority sizes="290px" />
        <div className="absolute inset-x-2.5 top-2.5 rounded-xl bg-white/95 px-2.5 py-2 shadow-lg backdrop-blur sm:inset-x-3 sm:top-3 sm:rounded-2xl sm:p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink sm:text-[13px]">
            <CheckCircle2 className="size-4 shrink-0 text-forest" aria-hidden /> Ready to harvest
          </p>
          <p className="mt-0.5 hidden text-xs text-muted sm:block">Buyer, date and collection agreed</p>
        </div>
      </div>
      <div className="absolute -bottom-4 -left-2 rotate-[-10deg] rounded-2xl bg-forest p-2.5 text-white shadow-lg sm:-bottom-6 sm:-left-6 sm:p-3.5" aria-hidden>
        <Sprout className="size-5 sm:size-7" />
      </div>
    </div>
  );
}

function HeroCardRight() {
  return (
    <div className="relative mx-auto w-full max-w-[290px] lg:mt-16">
      <svg className="absolute -right-2 -top-10 h-16 w-16 text-forest sm:-right-6 sm:-top-14 sm:h-24 sm:w-24" viewBox="0 0 96 96" fill="none" aria-hidden>
        <path d="M18 78C18 42 42 18 82 16c0 40-24 64-64 62Z" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
        <path d="M18 78 60 36" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <div className="relative aspect-[3/4] overflow-hidden rounded-[28px] bg-line shadow-[var(--shadow-raised)]">
        <Photo photo={photos.farmerUprooting} mono priority sizes="290px" />
        <div className="absolute inset-x-2.5 bottom-2.5 rounded-xl bg-white/95 px-2.5 py-2 shadow-lg backdrop-blur sm:inset-x-3 sm:bottom-3 sm:rounded-2xl sm:p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink sm:text-[13px]">
            <KeyRound className="size-4 shrink-0 text-forest" aria-hidden /> Pickup confirmed
          </p>
          <p className="mt-0.5 hidden text-xs text-muted sm:block">Handed over with a one-time code</p>
        </div>
      </div>
      <div className="absolute -left-2 -top-3 rotate-[8deg] rounded-xl bg-white p-2 text-forest shadow-lg ring-1 ring-line sm:-left-4 sm:-top-4 sm:p-2.5" aria-hidden>
        <Truck className="size-5" />
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-canvas">
        <div className="mx-auto grid max-w-6xl grid-cols-2 items-center gap-x-5 gap-y-14 px-4 pb-14 pt-12 sm:gap-x-8 sm:px-6 lg:grid-cols-[1fr_1.5fr_1fr] lg:gap-x-10 lg:pb-16 lg:pt-16">
          <div className="order-2 lg:order-1">
            <HeroCardLeft />
          </div>
          <div className="order-1 col-span-2 text-center lg:order-2 lg:col-span-1">
            <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted ring-1 ring-line">
              <span className="size-1.5 rounded-full bg-forest" aria-hidden /> Fresh produce · Oyo State, Nigeria
            </p>
            <h1 className="mt-5 text-[2.5rem] font-semibold leading-[1.1] text-ink sm:text-5xl lg:text-[3.25rem]">
              Harvest with a <span className="headline-underline whitespace-nowrap">confirmed plan.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-muted">
              Know who will buy your harvest, how much they will take, and when and where it should be ready — <strong className="font-semibold text-ink">before you harvest</strong> — so a crop that spoils fast never leaves the farm without somewhere to go.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/register">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
            <p className="mt-5 text-[13px] text-muted">
              <span className="whitespace-nowrap">Free for farmers</span> · <span className="whitespace-nowrap">Works on any phone</span> · <span className="whitespace-nowrap">Drafts work offline</span>
            </p>
          </div>
          <div className="order-3">
            <HeroCardRight />
          </div>
        </div>

        {/* In place of a partner strip: who the platform serves (no partnerships are claimed). */}
        <div className="border-t border-line/80 bg-canvas">
          <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4">
            {roles.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex flex-col items-start gap-3 sm:flex-row">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-[var(--shadow-card)] ring-1 ring-line">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-display text-[15px] font-semibold text-ink">{title}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16">
          <div className="relative">
            <div className="dot-grid absolute -bottom-6 -left-6 h-28 w-32 opacity-40" aria-hidden />
            <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] shadow-[var(--shadow-raised)]">
              <Photo photo={photos.cassavaFarm} sizes="(min-width: 1024px) 540px, 100vw" />
            </div>
            <div className="absolute bottom-6 right-3 max-w-[220px] rounded-2xl bg-surface p-4 shadow-[var(--shadow-raised)] ring-1 ring-line sm:-right-6 sm:bottom-8">
              <p className="text-xs font-medium text-muted">The question we answer</p>
              <p className="mt-1 font-display text-[15px] font-semibold leading-snug text-ink">Is there a confirmed plan for this harvest?</p>
            </div>
          </div>
          <div>
            <SectionHeading eyebrow="How it works" title="From expected harvest to a confirmed plan" body="Four steps stand between a field ready for harvest and a harvest that is safe to start." />
            <ol className="mt-8 flex flex-col gap-5">
              {steps.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-leaf-50 text-forest">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold text-ink">
                      <span className="mr-1.5 text-muted">{String(i + 1).padStart(2, '0')}</span>
                      {title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/how-it-works" className="mt-8 inline-flex items-center gap-1.5 font-display text-sm font-semibold text-forest hover:underline">
              See all nine steps, through to payment <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="scroll-mt-20 bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading center eyebrow="Features" title="Built for the realities of a fresh crop" body="Cassava roots, ripe tomatoes, fresh peppers: many crops start to spoil within days of harvest. Every part of HarvestSlot is designed so nobody digs, drives or pays on a promise that might not hold." />
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
                <span className="flex size-11 items-center justify-center rounded-xl bg-leaf-50 text-forest">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 font-display text-[17px] font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading eyebrow="Who it’s for" title="One booking, every commitment visible" />
            <Link href="/roles" className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-forest hover:underline">
              What each role can do <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {audiences.map((a) => (
              <Link key={a.id} href={`/roles#${a.id}`} className="group block">
                <div className="aspect-[4/5] overflow-hidden rounded-[22px] bg-line">
                  <Photo photo={a.photo} mono sizes="(min-width: 1024px) 270px, (min-width: 640px) 50vw, 100vw" className="transition duration-500 group-hover:scale-[1.03] group-hover:grayscale-0" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">{a.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{a.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Team ── */}
      <section id="team" className="scroll-mt-20 bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading center eyebrow="Team" title="The people building HarvestSlot" body="A small team working on one question: how a fresh harvest can leave the farm with a buyer already waiting." />
          <ul className="mx-auto mt-12 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2">
            {team.map((m) => (
              <li key={m.name} className="flex flex-col items-center text-center">
                <div className="aspect-[4/5] w-full max-w-[260px] overflow-hidden rounded-[22px] bg-line shadow-[var(--shadow-card)] ring-1 ring-line">
                  <Image src={m.photo.src} width={m.photo.width} height={m.photo.height} alt={m.photo.alt} sizes="260px" unoptimized className="h-full w-full object-cover" />
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold text-ink">{m.name}</h3>
                <p className="mt-0.5 text-sm font-medium text-forest">{m.role}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Honesty ── */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
          <SectionHeading eyebrow="Plainly stated" title="What HarvestSlot does not do" body="Trust starts with being clear about the limits of the service." />
          <ul className="grid grid-cols-1 gap-3">
            {notDone.map((t) => (
              <li key={t} className="flex gap-3 rounded-2xl border border-line bg-canvas p-4 text-sm leading-relaxed text-ink">
                <XCircle className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                <span>It does not {t.charAt(0).toLowerCase() + t.slice(1)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Call to action ── */}
      <section className="bg-canvas px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-ink">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div className="px-6 py-12 sm:px-12">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Plan your next harvest before you dig.</h2>
              <p className="mt-3 max-w-lg text-base leading-relaxed text-white/75">Sell your harvest as a farmer, or buy fresh produce for your processing facility. Free to start.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/register">Create an account</Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="border border-white/25 text-white hover:bg-white/10">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </div>
            <div className="hidden h-full min-h-[300px] lg:block">
              <Photo photo={photos.cassavaHarvest} mono sizes="420px" className="opacity-80" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
