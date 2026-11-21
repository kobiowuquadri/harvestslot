'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { DemoPersona } from '@harvestslot/contracts';
import { post } from '@/lib/api';
import { useSession } from '@/lib/session';

/** The main demo: a farmer selling several crops, a cassava buyer, a tomato buyer, and the administrator. */
export const PERSONAS: Array<{ persona: DemoPersona; label: string; home: string }> = [
  { persona: 'farmer', label: 'Farmer — selling (Adunni)', home: '/app' },
  { persona: 'processor-manager', label: 'Buyer — cassava (Bola)', home: '/app' },
  { persona: 'tomato-buyer', label: 'Buyer — tomatoes (Sade)', home: '/app' },
  { persona: 'admin', label: 'Administrator', home: '/admin' },
];

/** Only rendered when the server reports a permitted demonstration environment. */
export function DemoEntry({ compact = false }: { compact?: boolean }) {
  const { config, refresh } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!config?.demoMode) return null;
  const enter = async (p: (typeof PERSONAS)[number]) => {
    setBusy(p.persona);
    try {
      await post('/auth/demo-login', { persona: p.persona });
      try {
        window.localStorage.removeItem('hs.workspace.last');
      } catch {
        // ignore
      }
      await refresh();
      router.push(p.home);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Demo login failed');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className={`rounded-2xl border border-dashed border-amber-ink/25 bg-amber-50 p-4 text-left ${compact ? '' : 'mx-4 mb-12 sm:mx-auto sm:max-w-md'}`}>
      <p className="text-[13px] font-semibold text-amber-ink">Demonstration environment — sign in as a fictional user</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PERSONAS.map((p) => (
          <button
            key={p.persona}
            type="button"
            onClick={() => void enter(p)}
            disabled={busy !== null}
            className="rounded-full border border-amber-ink/20 bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-amber-ink/45 disabled:opacity-60"
          >
            {busy === p.persona ? 'Signing in…' : p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
