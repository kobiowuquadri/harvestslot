import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/domain/logo';
import { PublicHeader } from '@/components/shell/public-header';

const FOOTER = [
  {
    title: 'Product',
    links: [
      ['How it works', '/how-it-works'],
      ['Who it’s for', '/roles'],
      ['FAQ and contact', '/faq'],
      ['Sign in', '/login'],
    ],
  },
  {
    title: 'Legal',
    links: [
      ['Privacy notice', '/privacy'],
      ['Terms of use', '/terms'],
      ['Photo credits', '/credits'],
    ],
  },
] as const;

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <PublicHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-muted">Harvest with a confirmed plan. Cassava harvest coordination between farmers selling and processors buying in Oyo State.</p>
            <p className="mt-3 text-xs text-muted">Aligned with SDG 12 (responsible production), SDG 2 and SDG 8.</p>
          </div>
          {FOOTER.map((col) => (
            <div key={col.title}>
              <p className="font-display text-sm font-semibold text-ink">{col.title}</p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <Link className="text-muted transition-colors hover:text-ink" href={href}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">Photographs: Wikimedia Commons contributors, used under open licences — see photo credits.</p>
        </div>
      </footer>
    </div>
  );
}
