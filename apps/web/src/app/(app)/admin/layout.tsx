'use client';

import type { ReactNode } from 'react';
import { EmptyState } from '@/components/domain/states';
import { useSession } from '@/lib/session';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { me } = useSession();
  // The API enforces admin access on every endpoint; this only avoids showing empty screens.
  if (me?.user.platformRole !== 'ADMIN') return <EmptyState title="Administrators only" />;
  return <>{children}</>;
}
