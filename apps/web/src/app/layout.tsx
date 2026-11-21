import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'HarvestSlot — Harvest with a confirmed plan', template: '%s · HarvestSlot' },
  description:
    'Agree a buyer, a date and the handover for your cassava or tomatoes before you harvest. Oyo State, Nigeria.',
  manifest: '/manifest.webmanifest',
  applicationName: 'HarvestSlot',
  icons: {
    icon: [
      { url: '/favicon.ico?v=hs-brand-2', sizes: 'any' },
      { url: '/icons/icon-16.png?v=hs-brand-2', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-32.png?v=hs-brand-2', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon.ico?v=hs-brand-2',
    apple: { url: '/apple-touch-icon.png?v=hs-brand-2', sizes: '180x180', type: 'image/png' },
  },
  appleWebApp: { capable: true, title: 'HarvestSlot', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#137a3b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG">
      <body className="min-h-dvh antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
