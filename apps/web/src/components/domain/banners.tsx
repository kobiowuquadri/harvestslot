'use client';

import { useSyncExternalStore } from 'react';
import { FlaskConical, Users, WifiOff } from 'lucide-react';
import { DELEGATION_SCOPE_LABELS, type DelegationScope } from '@harvestslot/contracts';
import { useT } from '@/i18n';
import { useSession } from '@/lib/session';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

export function OfflineBanner() {
  const online = useOnline();
  const { t } = useT();
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-ink">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      {t('common.offline')} Draft harvest requests can still be saved on this device.
    </div>
  );
}

export function DemoBanner() {
  const { config, me } = useSession();
  const { t } = useT();
  if (!config?.demoMode && !me?.user.isDemo) return null;
  return (
    <div className="flex items-center gap-2 bg-amber px-4 py-1.5 text-xs font-medium text-amber-ink">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      {t('common.demo')}
    </div>
  );
}

/** Shown on every screen where a cooperative representative acts for a farmer. */
export function ActingForBanner({ farmerName, cooperativeName, scopes }: { farmerName: string; cooperativeName: string; scopes: DelegationScope[] | string[] }) {
  return (
    <div className="mb-4 flex flex-col gap-1 rounded-lg border border-info/30 bg-info-50 p-3 text-sm text-info sm:flex-row sm:items-center sm:gap-3">
      <span className="inline-flex items-center gap-2 font-semibold">
        <Users className="size-4" aria-hidden /> Acting for {farmerName}
      </span>
      <span className="text-ink/80">
        via {cooperativeName}. Permissions: {scopes.map((s) => DELEGATION_SCOPE_LABELS[s as DelegationScope]?.label ?? s).join(', ')}. Every action records both you and the farmer.
      </span>
    </div>
  );
}
