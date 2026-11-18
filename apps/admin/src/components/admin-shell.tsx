'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { AuthUserSummary } from '@arven/contracts';
import {
  ArvenWordmark,
  Badge,
  Button,
  Divider,
  Drawer,
  IconMenu,
  SkipLink,
  StatusBanner,
  ThemeToggle,
  cn,
  useToast,
} from '@arven/ui';
import { AdminApiClientError, adminApi } from '@/lib/api-client';
import { formatRoleLabel } from '@/lib/format';
import { filterAdminNavItems, isAdminNavActive } from '@/lib/ops-helpers';

export interface AdminShellProps {
  title: string;
  description: string;
  user: AuthUserSummary | null;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminShell({
  title,
  description,
  user,
  actions,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const visibleNavItems = filterAdminNavItems({
    roles: user?.roles,
    permissions: user?.permissions,
    authenticated: Boolean(user),
  });

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await adminApi.logout();
      toast({
        tone: 'success',
        title: 'Signed out',
        description: 'Staff session closed.',
      });
      router.replace('/login');
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setSignOutError(err.message);
      } else {
        setSignOutError('Unable to close staff session right now.');
      }
    } finally {
      setSigningOut(false);
    }
  };

  const renderNavLinks = (onNavigate?: () => void) => (
    <nav aria-label="Operations console navigation" className="flex flex-col gap-1.5">
      {visibleNavItems.map((item) => {
        const active = isAdminNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-3.5 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors',
              active
                ? 'border-strong-border bg-panel text-ink'
                : 'border-transparent text-ink-secondary hover:border-control-border hover:bg-subtle hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink lg:flex-row">
      <SkipLink href="#main-content" />

      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:justify-between lg:border-r lg:border-hairline lg:bg-subtle lg:p-6">
        <div className="space-y-6">
          <div className="space-y-1">
            <Link href="/" className="inline-flex min-h-11 items-center">
              <ArvenWordmark />
            </Link>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
              Admin Operations
            </p>
          </div>

          <Divider />
          {renderNavLinks()}
        </div>

        <div className="space-y-4 border-t border-hairline pt-5">
          {user ? (
            <div className="space-y-1.5">
              <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
              <p className="truncate font-mono text-xs text-ink-muted">{user.email}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {user.roles.map((role) => (
                  <Badge key={role} tone="info">
                    {formatRoleLabel(role)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle defaultTheme="dark" storageKey="arven-admin-theme" />
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
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="sticky top-0 z-[var(--z-header)] flex min-h-16 items-center justify-between gap-2 border-b border-hairline bg-subtle px-3 sm:gap-3 sm:px-4 lg:hidden">
        <Link href="/" className="inline-flex min-w-0 min-h-11 items-center gap-2.5">
          <ArvenWordmark />
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted sm:inline">
            Ops
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle defaultTheme="dark" storageKey="arven-admin-theme" />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <IconMenu size={18} />
            <span className="hidden min-[360px]:inline">Menu</span>
          </Button>
        </div>
      </header>

      <Drawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="ARVEN Operations"
        side="left"
      >
        <div className="flex h-full flex-col justify-between gap-6">
          <div className="space-y-5">
            {renderNavLinks(() => setMobileMenuOpen(false))}
          </div>

          <div className="space-y-4 border-t border-hairline pt-4">
            {user ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-ink">{user.fullName}</p>
                <p className="font-mono text-xs text-ink-muted">{user.email}</p>
              </div>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              fullWidth
              isLoading={signingOut}
              loadingLabel="Signing out"
              onClick={handleSignOut}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </Drawer>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-8"
      >
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 border-b border-hairline pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                ARVEN Governance Portal
              </p>
              <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
                {title}
              </h1>
              <p className="max-w-[var(--container-prose)] text-sm leading-relaxed text-ink-muted">
                {description}
              </p>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>

          {signOutError ? <StatusBanner tone="danger" description={signOutError} /> : null}

          {children}
        </div>
      </main>
    </div>
  );
}
