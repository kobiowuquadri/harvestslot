'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/domain/states';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/settings', label: 'Account' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/privacy', label: 'Privacy & data' },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <nav aria-label="Settings" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={pathname === t.href ? 'page' : undefined} className={cn('whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium', pathname === t.href ? 'border-forest text-forest' : 'border-transparent text-muted')}>
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="max-w-2xl">{children}</div>
    </div>
  );
}
