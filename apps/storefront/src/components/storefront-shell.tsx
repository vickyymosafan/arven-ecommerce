'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import type { CartDto } from '@arven/contracts';
import {
  ArvenWordmark,
  Divider,
  Drawer,
  IconBag,
  IconMenu,
  IconSearch,
  IconUser,
  SkipLink,
  ThemeToggle,
  cn,
} from '@arven/ui';
import { CartDrawer } from '@/components/cart/cart-drawer';
import { SearchOverlay } from '@/components/search-overlay';
import { CART_UPDATED_EVENT, storefrontApi } from '@/lib/api-client';

export const OPEN_CART_DRAWER_EVENT = 'arven:open-cart-drawer';

interface NavLinkItem {
  href: string;
  label: string;
}

const editorialNavLinks: readonly NavLinkItem[] = [
  { href: '/shop', label: 'Shop' },
  { href: '/collections', label: 'Collections' },
  { href: '/showroom', label: 'Showroom' },
  { href: '/lookbook', label: 'Lookbook' },
  { href: '/journal', label: 'Journal' },
  { href: '/about', label: 'About' },
];

const drawerAccountLinks: readonly NavLinkItem[] = [
  { href: '/outfit-studio', label: 'Outfit Studio' },
  { href: '/search', label: 'Search Archive' },
  { href: '/cart', label: 'Shopping Bag' },
  { href: '/account', label: 'My Account' },
  { href: '/account/orders', label: 'Order History' },
  { href: '/account/outfits', label: 'Saved Outfits' },
  { href: '/account/returns', label: 'Returns' },
  { href: '/account/addresses', label: 'Saved Addresses' },
  { href: '/account/sessions', label: 'Active Sessions' },
  { href: '/auth/login', label: 'Sign In' },
  { href: '/auth/register', label: 'Create Account' },
];

export interface StorefrontShellProps {
  children: ReactNode;
  narrow?: boolean;
}

function isNavHrefActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/' || href === '/account') {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BagCountBadge({ count }: { count: number | null }) {
  if (count === null) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-5 min-w-5 items-center justify-center text-xs opacity-0"
      >
        0
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-xs)] border px-1.5 text-xs font-semibold leading-none tabular-nums transition-colors duration-[var(--duration-fast)]',
        count > 0
          ? 'border-strong-border bg-inverse text-ink-inverse'
          : 'border-hairline bg-subtle text-ink-muted',
      )}
    >
      {count}
    </span>
  );
}

function DesktopNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Primary storefront navigation"
      className="hidden items-center gap-0.5 lg:flex xl:gap-2"
    >
      {editorialNavLinks.map((item) => {
        const active = isNavHrefActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'nav-underline inline-flex min-h-11 items-center whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors',
              active
                ? 'font-semibold text-ink'
                : 'text-ink-secondary hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LiveDesktopNav() {
  const pathname = usePathname();
  return <DesktopNavLinks pathname={pathname} />;
}

function MobileDrawerNavContent({
  onClose,
  pathname,
  bagCount,
}: {
  onClose: () => void;
  pathname: string | null;
  bagCount: number | null;
}) {
  return (
    <div className="space-y-6">
      <nav aria-label="Mobile storefront navigation" className="flex flex-col gap-1.5">
        <Link
          href="/"
          aria-current={pathname === '/' ? 'page' : undefined}
          onClick={onClose}
          className={cn(
            'inline-flex min-h-11 items-center justify-between rounded-[var(--radius-xs)] border px-4 py-2.5 font-display text-xl font-normal transition-colors',
            pathname === '/'
              ? 'border-strong-border bg-panel text-ink'
              : 'border-transparent text-ink hover:border-hairline hover:bg-subtle',
          )}
        >
          <span>Home</span>
        </Link>

        {editorialNavLinks.map((item) => {
          const active = isNavHrefActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              onClick={onClose}
              className={cn(
                'inline-flex min-h-11 items-center justify-between rounded-[var(--radius-xs)] border px-4 py-2.5 font-display text-xl font-normal transition-colors',
                active
                  ? 'border-strong-border bg-panel text-ink'
                  : 'border-transparent text-ink hover:border-hairline hover:bg-subtle',
              )}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Divider />

      <div className="space-y-3">
        <p className="type-eyebrow px-1 text-ink-muted">Clientele &amp; Utilities</p>
        <div className="flex flex-col gap-1.5">
          {drawerAccountLinks.map((item) => {
            const active = isNavHrefActive(pathname, item.href);
            const isBag = item.href === '/cart';
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onClose}
                className={cn(
                  'inline-flex min-h-11 items-center justify-between rounded-[var(--radius-xs)] border px-4 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-strong-border bg-panel text-ink'
                    : 'border-hairline bg-subtle text-ink-secondary hover:border-control-border hover:text-ink',
                )}
              >
                <span>{item.label}</span>
                {isBag ? <BagCountBadge count={bagCount} /> : null}
              </Link>
            );
          })}
        </div>
      </div>

      <Divider />

      <div className="flex items-center justify-between gap-3 px-1">
        <span className="type-eyebrow text-ink-muted">Appearance</span>
        <ThemeToggle defaultTheme="light" storageKey="arven-storefront-theme" />
      </div>
    </div>
  );
}

function LiveMobileDrawerNavContent({
  onClose,
  bagCount,
}: {
  onClose: () => void;
  bagCount: number | null;
}) {
  const pathname = usePathname();
  return <MobileDrawerNavContent onClose={onClose} pathname={pathname} bagCount={bagCount} />;
}

export function StorefrontShell({ children, narrow = false }: StorefrontShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bagCount, setBagCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const refreshBagCount = () => {
      void storefrontApi
        .getCart()
        .catch(() => null)
        .then((cart) => {
          if (!active) return;
          setBagCount(cart ? cart.totalQuantity : 0);
        });
    };

    refreshBagCount();

    const handleCartUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<CartDto | undefined>;
      if (customEvent.detail && typeof customEvent.detail.totalQuantity === 'number') {
        setBagCount(customEvent.detail.totalQuantity);
        return;
      }
      refreshBagCount();
    };

    const handleOpenCartDrawer = () => {
      setCartDrawerOpen(true);
    };

    window.addEventListener(CART_UPDATED_EVENT, handleCartUpdated);
    window.addEventListener(OPEN_CART_DRAWER_EVENT, handleOpenCartDrawer);
    return () => {
      active = false;
      window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdated);
      window.removeEventListener(OPEN_CART_DRAWER_EVENT, handleOpenCartDrawer);
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <SkipLink href="#main-content" />

      {/* Subtle Non-Sticky Atelier Dispatch Strip */}
      <div className="border-b border-hairline bg-inverse px-4 py-2 text-center text-xs font-medium tracking-[0.04em] text-ink-inverse">
        <div className="mx-auto flex max-w-[var(--container-max)] items-center justify-center gap-3 sm:px-6 lg:justify-between lg:px-12">
          <span className="hidden text-xs opacity-85 lg:inline">
            Jakarta Atelier · Est. 2026
          </span>
          <span>Complimentary Insured Delivery Across Indonesia</span>
          <span className="hidden text-xs opacity-85 lg:inline">
            Mon - Sat, 09:00 - 21:00 WIB
          </span>
        </div>
      </div>

      {/* Clean 3-Zone Sticky Editorial Header */}
      <header className="sticky top-0 z-[var(--z-header)] border-b border-hairline bg-canvas/95 backdrop-blur-sm transition-colors">
        <div className="mx-auto flex h-16 w-full max-w-[var(--container-max)] items-center justify-between gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-12">
          {/* Mobile Left: Menu Trigger */}
          <div className="flex items-center lg:hidden">
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-[var(--radius-xs)] border border-hairline px-2.5 py-2 text-xs font-semibold uppercase tracking-[0.05em] text-ink transition-colors hover:border-strong-border hover:bg-subtle cursor-pointer"
            >
              <IconMenu size={18} />
              <span className="hidden min-[360px]:inline">Menu</span>
            </button>
          </div>

          {/* Left (Desktop) / Center (Mobile): Architectural Wordmark */}
          <div className="flex shrink-0 items-center">
            <Link
              href="/"
              aria-label="ARVEN Home"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-xs)] px-1"
            >
              <ArvenWordmark />
            </Link>
          </div>

          {/* Center (Desktop): 6 Editorial Routes */}
          <Suspense fallback={<DesktopNavLinks pathname={null} />}>
            <LiveDesktopNav />
          </Suspense>

          {/* Right: Clean Utility Cluster (Search, Account, Bag, Theme) */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search catalog"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 py-2 text-xs font-medium uppercase tracking-[0.05em] text-ink transition-colors hover:bg-subtle cursor-pointer"
            >
              <IconSearch size={18} />
              <span className="hidden xl:inline">Search</span>
            </button>

            <Link
              href="/account"
              aria-label="Account"
              className="hidden min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 py-2 text-xs font-medium uppercase tracking-[0.05em] text-ink transition-colors hover:bg-subtle sm:inline-flex"
            >
              <IconUser size={18} />
              <span className="hidden xl:inline">Account</span>
            </Link>

            <button
              type="button"
              onClick={() => setCartDrawerOpen(true)}
              aria-label={
                bagCount !== null
                  ? `Open shopping bag, ${bagCount} ${bagCount === 1 ? 'item' : 'items'}`
                  : 'Open shopping bag'
              }
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 py-2 text-xs font-medium uppercase tracking-[0.05em] text-ink transition-colors hover:bg-subtle cursor-pointer"
            >
              <IconBag size={18} />
              <span className="hidden xl:inline">Bag</span>
              <BagCountBadge count={bagCount} />
            </button>

            <div className="hidden lg:block lg:pl-1">
              <ThemeToggle compact defaultTheme="light" storageKey="arven-storefront-theme" />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <Drawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="ARVEN"
        subtitle="Jakarta Atelier"
        side="left"
        closeLabel="Close navigation menu"
      >
        <Suspense
          fallback={
            <MobileDrawerNavContent
              onClose={() => setMobileMenuOpen(false)}
              pathname={null}
              bagCount={bagCount}
            />
          }
        >
          <LiveMobileDrawerNavContent
            onClose={() => setMobileMenuOpen(false)}
            bagCount={bagCount}
          />
        </Suspense>
      </Drawer>

      {/* Slide-Over Shopping Bag Drawer */}
      <CartDrawer isOpen={cartDrawerOpen} onClose={() => setCartDrawerOpen(false)} />

      {/* Quick Search Modal */}
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-12 lg:py-14',
          narrow ? 'max-w-xl' : 'max-w-[var(--container-max)]',
        )}
      >
        {children}
      </main>

      <footer className="border-t border-hairline bg-subtle">
        <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-10 px-4 py-14 text-sm text-ink-muted sm:px-6 lg:px-12">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-5">
              <div className="space-y-1.5">
                <p className="font-display text-2xl font-normal tracking-[0.16em] uppercase text-ink">
                  ARVEN
                </p>
                <p className="font-display text-base italic text-ink-secondary">
                  Beyond Trends. Beyond Time.
                </p>
              </div>
              <p className="type-ui max-w-md text-ink-secondary">
                Contemporary unisex apparel, footwear, and architectural accessories crafted in
                Jakarta through restrained monochromatic geometry and natural textile weight.
              </p>
              <p className="type-caption text-ink-muted">
                Jakarta Studio · Kemang, South Jakarta
              </p>
            </div>

            <div className="space-y-3 lg:col-span-2">
              <p className="type-eyebrow text-ink">Wardrobe</p>
              <ul className="flex flex-col gap-1 text-sm">
                <li>
                  <Link
                    href="/shop"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Shop All
                  </Link>
                </li>
                <li>
                  <Link
                    href="/collections"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Collections
                  </Link>
                </li>
                <li>
                  <Link
                    href="/search"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Search Archive
                  </Link>
                </li>
                <li>
                  <Link
                    href="/cart"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Shopping Bag
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-3 lg:col-span-2">
              <p className="type-eyebrow text-ink">Experiences</p>
              <ul className="flex flex-col gap-1 text-sm">
                <li>
                  <Link
                    href="/showroom"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    3D Showroom
                  </Link>
                </li>
                <li>
                  <Link
                    href="/outfit-studio"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Outfit Studio
                  </Link>
                </li>
                <li>
                  <Link
                    href="/lookbook"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Lookbook
                  </Link>
                </li>
                <li>
                  <Link
                    href="/journal"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Journal
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    About
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-3 lg:col-span-3">
              <p className="type-eyebrow text-ink">Clientele Care</p>
              <ul className="flex flex-col gap-1 text-sm">
                <li>
                  <Link
                    href="/account"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    My Account
                  </Link>
                </li>
                <li>
                  <Link
                    href="/account/orders"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Orders
                  </Link>
                </li>
                <li>
                  <Link
                    href="/account/outfits"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Saved Outfits
                  </Link>
                </li>
                <li>
                  <Link
                    href="/account/returns"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Returns
                  </Link>
                </li>
                <li>
                  <Link
                    href="/account/addresses"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Addresses
                  </Link>
                </li>
                <li>
                  <Link
                    href="/account/sessions"
                    className="inline-flex min-h-11 items-center text-ink-secondary hover:text-ink hover:underline"
                  >
                    Sessions
                  </Link>
                </li>
                <li className="flex flex-wrap items-center gap-4 pt-1">
                  <Link
                    href="/auth/login"
                    className="inline-flex min-h-11 items-center font-medium text-link hover:underline"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/register"
                    className="inline-flex min-h-11 items-center font-medium text-link hover:underline"
                  >
                    Register
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <Divider />

          <div className="flex flex-col gap-2 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 ARVEN Atelier. All rights reserved. Jakarta, Indonesia.</p>
            <p className="tabular-nums">Currency: IDR (Rp) · All taxes included</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
