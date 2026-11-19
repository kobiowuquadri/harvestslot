import Link from 'next/link';
import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/domain/logo';
import { Photo } from '@/components/domain/photo';
import { photos } from '@/content/photos';

const promises = ['A buyer and price agreed in writing', 'Space held for your harvest at the buyer', 'Who collects, where and when — agreed before you dig'];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-surface lg:grid-cols-[1fr_minmax(0,1fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link href="/" className="self-start" aria-label="HarvestSlot home">
          <Logo />
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
          {children}
        </main>
        <p className="text-center text-xs text-muted lg:text-left">
          <Link href="/privacy" className="hover:text-ink hover:underline">Privacy</Link> · <Link href="/terms" className="hover:text-ink hover:underline">Terms</Link> · <Link href="/faq" className="hover:text-ink hover:underline">Help</Link>
        </p>
      </div>
      <aside className="relative hidden p-4 lg:block" aria-label="About HarvestSlot">
        <div className="sticky top-4 h-[calc(100dvh-2rem)] overflow-hidden rounded-[28px] bg-ink">
          <Photo photo={photos.cassavaHarvest} mono sizes="50vw" className="opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 p-10">
            <p className="font-display text-[2rem] font-semibold leading-tight text-white">Harvest with a confirmed plan.</p>
            <ul className="mt-6 flex flex-col gap-3">
              {promises.map((p) => (
                <li key={p} className="flex items-center gap-3 text-[15px] text-white/90">
                  <CheckCircle2 className="size-5 shrink-0 text-[#7ee2a5]" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
