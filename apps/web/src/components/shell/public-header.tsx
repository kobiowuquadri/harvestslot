'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpRight, Menu } from 'lucide-react';
import { Logo } from '@/components/domain/logo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const PRIMARY = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/roles', label: 'Who it’s for' },
  { href: '/#team', label: 'Team' },
];
const SECONDARY = [{ href: '/faq', label: 'FAQ' }];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={cn('rounded-md px-3 py-2 font-display text-[13.5px] font-medium transition-colors', active ? 'text-ink' : 'text-muted hover:text-ink')}>
      {label}
    </Link>
  );
}

export function PublicHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="HarvestSlot home" className="shrink-0">
          <Logo />
        </Link>
        <div className="hidden items-center md:flex">
          {PRIMARY.map((l) => (
            <NavLink key={l.href} {...l} active={pathname === l.href} />
          ))}
          <span className="mx-3 h-5 w-px bg-line" aria-hidden />
          {SECONDARY.map((l) => (
            <NavLink key={l.href} {...l} active={pathname === l.href} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/register">Get started</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/login">
              Sign in <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
          <button type="button" className="rounded-lg p-2 text-ink hover:bg-canvas md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </nav>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Menu">
          <ul className="flex flex-col gap-1">
            {[...PRIMARY, ...SECONDARY].map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 font-display font-medium text-ink hover:bg-canvas">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-1 gap-2">
            <Button asChild size="lg">
              <Link href="/register" onClick={() => setOpen(false)}>
                Get started
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login" onClick={() => setOpen(false)}>
                Sign in
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
