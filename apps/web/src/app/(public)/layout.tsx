import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/domain/logo';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2" aria-label="HarvestSlot home">
            <Logo />
          </Link>
          <div className="flex items-center gap-1 text-sm sm:gap-4">
            <Link href="/how-it-works" className="hidden rounded px-2 py-2 hover:text-leaf sm:inline">
              How it works
            </Link>
            <Link href="/roles" className="hidden rounded px-2 py-2 hover:text-leaf sm:inline">
              Who it is for
            </Link>
            <Link href="/faq" className="hidden rounded px-2 py-2 hover:text-leaf md:inline">
              FAQ
            </Link>
            <Link href="/login" className="rounded-lg px-3 py-2 font-medium text-forest hover:bg-leaf-50">
              Sign in
            </Link>
            <Link href="/register" className="rounded-lg bg-forest px-3 py-2 font-medium text-white hover:bg-forest-800">
              Get started
            </Link>
          </div>
        </nav>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-6 px-4 py-8 text-sm text-muted sm:grid-cols-3">
          <div>
            <Logo />
            <p className="mt-2">Harvest with a confirmed plan. Cassava harvest coordination for Oyo State, Nigeria.</p>
          </div>
          <ul className="flex flex-col gap-1">
            <li><Link className="hover:text-leaf" href="/how-it-works">How it works</Link></li>
            <li><Link className="hover:text-leaf" href="/roles">For farmers, processors, transporters and cooperatives</Link></li>
            <li><Link className="hover:text-leaf" href="/faq">FAQ and contact</Link></li>
          </ul>
          <ul className="flex flex-col gap-1">
            <li><Link className="hover:text-leaf" href="/privacy">Privacy notice</Link></li>
            <li><Link className="hover:text-leaf" href="/terms">Terms of use</Link></li>
            <li>Aligned with SDG 12 (responsible production), SDG 2 and SDG 8.</li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
