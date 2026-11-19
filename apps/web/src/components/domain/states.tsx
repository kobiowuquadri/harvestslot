'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { Inbox, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, Skeleton } from '@/components/ui/primitives';

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-[13px] font-medium text-muted">{eyebrow}</div> : null}
        <h1 className="text-[1.65rem] font-semibold leading-tight text-ink">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action, icon }: { title: ReactNode; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong/60 bg-surface px-6 py-12 text-center">
      <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-leaf-50 text-forest">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <p className="font-display font-semibold text-ink">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : null;
  if (api?.code === 'NETWORK_ERROR') {
    return (
      <Alert tone="warning" title="You are offline" action={onRetry ? <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button> : undefined}>
        <span className="inline-flex items-center gap-1">
          <WifiOff className="size-4" aria-hidden /> Live data cannot be shown until you reconnect. Nothing shown here is up to date.
        </span>
      </Alert>
    );
  }
  return (
    <Alert
      tone="danger"
      title={api?.status === 404 ? 'Not found' : api?.status === 403 ? 'You do not have access' : 'Something went wrong'}
      action={
        onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden /> Retry
          </Button>
        ) : undefined
      }
    >
      {api?.message ?? (error instanceof Error ? error.message : 'Unknown error')}
      {api?.requestId ? <span className="mt-1 block text-xs text-muted">Reference: {api.requestId}</span> : null}
    </Alert>
  );
}

export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="inline-flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/** Standard loading / error / empty handling around a query. */
export function QueryView<T>({ query, empty, isEmpty, children, loadingLabel }: { query: UseQueryResult<T>; empty?: ReactNode; isEmpty?: (data: T) => boolean; children: (data: T) => ReactNode; loadingLabel?: string }) {
  if (query.isLoading) return <LoadingState label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data === undefined || query.data === null) return <>{empty ?? null}</>;
  if (empty && isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
