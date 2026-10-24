import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'HarvestSlot — Harvest with a confirmed plan', template: '%s · HarvestSlot' },
  description: 'Arrange a buyer, processing capacity and transport for your cassava before you harvest. Oyo State, Nigeria.',
  manifest: '/manifest.webmanifest',
  applicationName: 'HarvestSlot',
  icons: { icon: '/icons/icon.svg', apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: 'HarvestSlot', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#143e31',
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
