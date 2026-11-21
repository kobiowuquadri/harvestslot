import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { PageIntro } from '@/components/domain/marketing';
import { Photo } from '@/components/domain/photo';
import { photos } from '@/content/photos';

export const metadata: Metadata = { title: 'Who HarvestSlot is for' };

const roles = [
  {
    id: 'farmers',
    title: 'Farmers — selling cassava or tomatoes',
    points: [
      'Create an account with your name and a phone number or email. Your farm is asked for when you add a harvest.',
      'Add a harvest: where, roughly how much, and when it will be ready. Buyers see only the area until you agree a plan.',
      'See buyers that fit and send a request. Review an offer on one screen and accept or decline.',
      'Your confirmed plan says who collects (or where you deliver), when, and for how much — and what happens next.',
      'See the final amount for the weight accepted, report a problem if something is wrong, and confirm when the money arrives.',
    ],
  },
  {
    id: 'processors',
    title: 'Processors — buying fresh produce',
    points: [
      'Create an account with your name and business name. HarvestSlot reviews new businesses before their buying slots go live.',
      'Publish buying slots: how much you can receive, where, and on which dates. Your facility is asked for the first time.',
      'Review farmers’ requests and send offers prefilled from the request and slot. Choose “We’ll collect” or “The farmer delivers”; undecided offers stay as drafts.',
      'Accepted offers appear in your bookings. From the booking, record the weight you accept and the payment you make.',
      'Staff (receiving and finance officers) join through an invitation from your business.',
    ],
  },
];

const rolePhotos = { farmers: photos.farmerHoldingCassava, processors: photos.tomatoBaskets } as const;

export default function RolesPage() {
  return (
    <>
      <PageIntro eyebrow="Who it’s for" title="Every role in a fresh-produce sale, on one plan">
        Farmers sell, processors buy. Each side confirms its own part — and sees what the other still has to do.
      </PageIntro>
      <nav aria-label="Roles" className="sticky top-16 z-30 border-b border-line/70 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 py-2 max-sm:scroll-fade-x sm:px-6">
          {roles.map((r) => (
            <a key={r.id} href={`#${r.id}`} className="whitespace-nowrap rounded-full px-3.5 py-1.5 font-display text-[13.5px] font-medium text-muted hover:bg-canvas hover:text-ink">
              {r.title}
            </a>
          ))}
        </div>
      </nav>
      <div className="mx-auto flex max-w-5xl flex-col gap-16 px-4 py-16 sm:px-6">
        {roles.map((r, i) => (
          <section key={r.id} id={r.id} aria-labelledby={`${r.id}-title`} className="grid scroll-mt-32 grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12">
            <div className={`aspect-[4/3] overflow-hidden rounded-[24px] bg-line shadow-[var(--shadow-raised)] ${i % 2 ? 'md:order-2' : ''}`}>
              <Photo photo={rolePhotos[r.id as keyof typeof rolePhotos]} mono sizes="(min-width: 768px) 460px, 100vw" />
            </div>
            <div>
              <h2 id={`${r.id}-title`} className="font-display text-2xl font-semibold tracking-tight text-ink">
                {r.title}
              </h2>
              <ul className="mt-5 flex flex-col gap-3">
                {r.points.map((pt) => (
                  <li key={pt} className="flex gap-3 text-[15px] leading-relaxed text-muted">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-forest" aria-hidden />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
        <p className="text-center text-sm text-muted">
          Ready to start? <Link href="/register" className="font-medium text-forest underline underline-offset-2">Create an account</Link>
        </p>
      </div>
    </>
  );
}
