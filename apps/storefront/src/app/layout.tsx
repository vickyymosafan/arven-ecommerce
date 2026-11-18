import type { Metadata } from 'next';
import { Cormorant_Garamond, IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { connection } from 'next/server';
import { Suspense, type ReactNode } from 'react';
import { ToastProvider } from '@arven/ui';
import './globals.css';

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-display',
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ARVEN | Beyond Trends. Beyond Time.',
    template: '%s | ARVEN',
  },
  description:
    'ARVEN Luxury Contemporary Fashion. Customer account identity, saved delivery addresses, and session management.',
};

async function RequestDynamicMarker() {
  await connection();
  return null;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${cormorantGaramond.variable} ${plusJakartaSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-dvh bg-canvas text-ink font-sans antialiased">
        <Suspense fallback={null}>
          <RequestDynamicMarker />
        </Suspense>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
