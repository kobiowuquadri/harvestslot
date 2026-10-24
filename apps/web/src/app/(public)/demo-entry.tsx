'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { DemoPersona } from '@harvestslot/contracts';
import { post } from '@/lib/api';
import { useSession } from '@/lib/session';

export const PERSONAS: Array<{ persona: DemoPersona; label: string; home: string }> = [
  { persona: 'farmer', label: 'Farmer (Adunni)', home: '/app' },
  { persona: 'processor-manager', label: 'Processor manager', home: '/app' },
  { persona: 'receiving-officer', label: 'Receiving officer', home: '/processor/receiving' },
  { persona: 'finance-officer', label: 'Finance officer', home: '/processor/invoices' },
  { persona: 'transporter', label: 'Transport dispatcher', home: '/transport/opportunities' },
  { persona: 'driver', label: 'Driver (Tunde)', home: '/transport/jobs' },
  { persona: 'cooperative', label: 'Cooperative representative', home: '/coop/members' },
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
    <div className={compact ? '' : 'mt-8 rounded-xl border border-white/30 bg-white/10 p-4'}>
      <p className={`text-sm font-semibold ${compact ? 'text-amber-ink' : 'text-white'}`}>Demonstration environment — sign in as a fictional user:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {PERSONAS.map((p) => (
          <button
            key={p.persona}
            type="button"
            onClick={() => void enter(p)}
            disabled={busy !== null}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${compact ? 'border border-amber-ink/30 bg-amber-50 text-amber-ink hover:bg-amber-100' : 'bg-white text-forest hover:bg-leaf-50'} disabled:opacity-60`}
          >
            {busy === p.persona ? 'Signing in…' : p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
