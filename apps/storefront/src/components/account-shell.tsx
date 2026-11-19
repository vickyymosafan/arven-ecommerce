'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { Button, StatusBanner, cn, useToast } from '@arven/ui';
import { ApiClientError, storefrontApi } from '@/lib/api-client';
import { StorefrontShell } from './storefront-shell';

const accountNavItems = [
  { href: '/account', label: 'Profile Overview' },
  { href: '/account/orders', label: 'Order History' },
  { href: '/account/outfits', label: 'Saved Outfits' },
  { href: '/account/returns', label: 'Returns' },
  { href: '/account/addresses', label: 'Address Book' },
  { href: '/account/sessions', label: 'Active Sessions' },
] as const;

export interface AccountShellProps {
  title: string;
  description: string;
  children: ReactNode;
}

function AccountNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Account sections"
      className="flex flex-wrap items-center gap-2 border-b border-hairline pb-4"
    >
      {accountNavItems.map((item) => {
        const active =
          pathname === item.href ||
          (item.href === '/account/orders' && Boolean(pathname?.startsWith('/account/orders/'))) ||
          (item.href === '/account/returns' && Boolean(pathname?.startsWith('/account/returns/')));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors',
              active
                ? 'border-strong-border bg-panel text-ink'
                : 'border-hairline bg-subtle text-ink-secondary hover:border-control-border hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LiveAccountNavLinks() {
  const pathname = usePathname();
  return <AccountNavLinks pathname={pathname} />;
}

export function AccountShell({ title, description, children }: AccountShellProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await storefrontApi.logout();
      toast({
        tone: 'success',
        title: 'Signed out',
        description: 'Your customer session has been closed cleanly.',
      });
      router.replace('/auth/login');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSignOutError(err.message);
      } else {
        setSignOutError('Unable to sign out right now. Please try again.');
      }
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <StorefrontShell>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 border-b border-hairline pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-muted">
              Clientele Account
            </p>
            <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
              {title}
            </h1>
            <p className="max-w-[var(--container-prose)] text-sm leading-relaxed text-ink-muted">
              {description}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={signingOut}
            loadingLabel="Signing out"
            onClick={handleSignOut}
          >
            Sign Out
          </Button>
        </div>

        {signOutError ? <StatusBanner tone="danger" description={signOutError} /> : null}

        <Suspense fallback={<AccountNavLinks pathname={null} />}>
          <LiveAccountNavLinks />
        </Suspense>

        <div>{children}</div>
      </div>
    </StorefrontShell>
  );
}
