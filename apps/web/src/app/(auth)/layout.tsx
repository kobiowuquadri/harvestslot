import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/domain/logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-canvas px-4 py-8">
      <Link href="/" className="mb-6" aria-label="HarvestSlot home">
        <Logo />
      </Link>
      <main id="main" className="w-full max-w-md">
        {children}
      </main>
      <p className="mt-8 text-center text-xs text-muted">
        <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link> · <Link href="/faq" className="underline">Help</Link>
      </p>
    </div>
  );
}
