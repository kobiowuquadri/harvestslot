'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { I18nProvider, type Locale } from '@/i18n';
import { ApiError } from '@/lib/api';
import { SessionProvider, useSession } from '@/lib/session';

function LocaleBridge({ children }: { children: ReactNode }) {
  const { me } = useSession();
  return <I18nProvider locale={(me?.user.locale as Locale) ?? 'en'}>{children}</I18nProvider>;
}

function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <LocaleBridge>
          {children}
          <ServiceWorkerRegistration />
          <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 5000 }} />
        </LocaleBridge>
      </SessionProvider>
    </QueryClientProvider>
  );
}
