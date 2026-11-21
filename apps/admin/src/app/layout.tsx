import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { connection } from 'next/server';
import { Suspense, type ReactNode } from 'react';
import { ToastProvider } from '@arven/ui';
import './globals.css';

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
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
    default: 'ARVEN Operations | Admin Console',
    template: '%s | ARVEN Operations',
  },
  description:
    'ARVEN staff operations portal for catalog merchandising, commerce fulfillment, 3D assets, MFA governance, RBAC roles, and runtime diagnostics.',
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

async function RequestDynamicMarker() {
  await connection();
  return null;
}

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
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
