'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type {
  CategoryNodeDto,
  CollectionSummaryDto,
  ProductCardDto,
} from '@arven/contracts';
import {
  Badge,
  Divider,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  ProductCard,
  Surface,
} from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

const clienteleHighlights = [
  {
    code: '01 / IDENTITY',
    title: 'Customer Credentials',
    summary:
      'Register with email verification, manage profile details, and sign in across sessions.',
    href: '/auth/login',
    actionLabel: 'Sign In',
  },
  {
    code: '02 / LOGISTICS',
    title: 'Saved Delivery Addresses',
    summary:
      'Maintain Indonesian shipping destinations and designate a default address ahead of checkout.',
    href: '/account/addresses',
    actionLabel: 'Manage Addresses',
  },
  {
    code: '03 / SESSIONS',
    title: 'Active Device Controls',
    summary:
      'Inspect active browser sessions in WIB timestamps and revoke unrecognized devices anytime.',
    href: '/account/sessions',
    actionLabel: 'Review Sessions',
  },
] as const;

export default function StorefrontHomePage() {
  const [collections, setCollections] = useState<CollectionSummaryDto[]>([]);
  const [categories, setCategories] = useState<CategoryNodeDto[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<ProductCardDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadEditorialHome = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      storefrontApi.getCollections(),
      storefrontApi.getCategories(),
      storefrontApi.getProducts({ featured: true, sort: 'featured', limit: 6 }),
    ])
      .then(([collectionsData, categoriesData, productsResult]) => {
        if (!active) return;
        setCollections(collectionsData);
        setCategories(categoriesData);
        setFeaturedProducts(productsResult.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load ARVEN catalog showcase right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [reloadNonce]);

  return (
    <StorefrontShell>
      <div className="space-y-16">
        {/* Editorial Hero */}
        <section className="grid gap-8 border-b border-hairline pb-14 lg:grid-cols-12 lg:items-end">
          <div className="space-y-6 lg:col-span-8">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="gold">Seasonal Archive · 2026</Badge>
              <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                Jakarta Studio Dispatch
              </span>
            </div>

            <h1 className="font-display text-4xl font-normal leading-[1.06] tracking-[-0.025em] text-ink sm:text-5xl lg:text-6xl">
              Beyond Trends.
              <br />
              Beyond Time.
            </h1>

            <p className="max-w-[var(--container-prose)] text-base leading-relaxed text-ink-secondary">
              ARVEN is an architectural luxury house shaped by sculptural proportion, natural fiber weight,
              and restrained monochromatic craft. Curated and finished in Jakarta for timeless permanence.
              Inspect published garments, explore multi-variant sizing, or step into our real-time 3D Virtual Showroom.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <LinkButton href="/shop" variant="primary" size="lg">
                Explore Catalog
              </LinkButton>
              <LinkButton href="/collections" variant="secondary" size="lg">
                View Capsules
              </LinkButton>
              <LinkButton href="/showroom" variant="gold" size="lg">
                3D Showroom
              </LinkButton>
            </div>
          </div>

          <div className="lg:col-span-4">
            <Surface variant="glass" border="control" padding="md" className="space-y-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-gold" aria-hidden="true" />
                  <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink">
                    House Release Index
                  </span>
                </div>
                <Badge tone="success">Published</Badge>
              </div>
              <Divider />
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Active Capsules</dt>
                  <dd className="font-mono text-xs tabular-nums text-ink">
                    {loading ? '...' : `${collections.length} Collections`}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Garment Categories</dt>
                  <dd className="font-mono text-xs tabular-nums text-ink">
                    {loading ? '...' : `${categories.length} Categories`}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Featured Editions</dt>
                  <dd className="font-mono text-xs tabular-nums text-ink">
                    {loading ? '...' : `${featuredProducts.length} Pieces`}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Fulfillment Origin</dt>
                  <dd className="font-mono text-xs text-ink">Jakarta (JKT-MAIN-01)</dd>
                </div>
              </dl>
              <div className="rounded-[var(--radius-xs)] border border-hairline bg-panel/70 p-3 text-xs leading-relaxed text-ink-secondary">
                <p className="font-medium text-ink">Virtual Showroom Active</p>
                <p className="text-[11px] text-ink-muted">Inspect fabric drape and 360-degree silhouettes in real-time WebGL.</p>
              </div>
            </Surface>
          </div>
        </section>

        {loading ? (
          <LoadingState label="Loading curated collections and featured garments" rows={4} />
        ) : error ? (
          <ErrorState
            title="Unable to load seasonal catalog"
            message={error.message}
            requestId={error.requestId}
            onRetry={() => void loadEditorialHome()}
          />
        ) : (
          <>
            {/* Curated Capsules */}
            <section aria-labelledby="home-collections-heading" className="space-y-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                    Editorial Capsules
                  </p>
                  <h2
                    id="home-collections-heading"
                    className="font-display text-2xl font-normal tracking-[-0.015em] text-ink sm:text-3xl"
                  >
                    House Collections
                  </h2>
                </div>
                <Link
                  href="/collections"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
                >
                  Browse All Collections
                </Link>
              </div>

              {collections.length === 0 ? (
                <EmptyState
                  title="No active collections published"
                  description="Seasonal capsule releases will appear here once curated and published by the studio."
                />
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {collections.map((collection) => (
                    <Surface
                      key={collection.id}
                      variant="elevated"
                      border="hairline"
                      padding="none"
                      className="group flex flex-col justify-between overflow-hidden transition-all duration-[var(--duration-moderate)] hover:border-strong-border hover:shadow-[var(--shadow-raised)]"
                    >
                      <Link
                        href={`/collections/${collection.slug}`}
                        className="relative block aspect-[5/3] w-full overflow-hidden border-b border-hairline bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {collection.bannerUrl ? (
                          <img
                            src={collection.bannerUrl}
                            alt={`${collection.name} capsule editorial banner`}
                            decoding="async"
                            className="h-full w-full object-cover transition-transform duration-[var(--duration-moderate)] ease-[var(--ease-editorial)] motion-safe:group-hover:scale-[1.04]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-subtle p-4">
                            <span className="font-display text-xl text-ink">{collection.name}</span>
                          </div>
                        )}
                        <span className="absolute bottom-2.5 right-2.5 rounded-[var(--radius-xs)] border border-hairline bg-canvas/85 px-2 py-0.5 font-mono text-[10px] uppercase tabular-nums tracking-[0.06em] text-ink backdrop-blur-sm">
                          {collection.productCount} {collection.productCount === 1 ? 'piece' : 'pieces'}
                        </span>
                      </Link>

                      <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                        <div className="space-y-2">
                          <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                            Capsule Release
                          </span>
                          <h3 className="font-display text-2xl font-normal text-ink">
                            <Link
                              href={`/collections/${collection.slug}`}
                              className="inline-flex min-h-11 items-center text-ink hover:text-link"
                            >
                              {collection.name}
                            </Link>
                          </h3>
                          {collection.description ? (
                            <p className="line-clamp-2 text-xs leading-relaxed text-ink-secondary">
                              {collection.description}
                            </p>
                          ) : null}
                        </div>

                        <LinkButton href={`/collections/${collection.slug}`} variant="secondary" size="sm">
                          View Capsule
                        </LinkButton>
                      </div>
                    </Surface>
                  ))}
                </div>
              )}
            </section>

            {/* Virtual Showroom Feature Banner */}
            <section className="relative overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-charcoal-border-hairline)] bg-[var(--color-charcoal-900)] p-8 text-[var(--color-ivory-50)] sm:p-12">
              <div className="relative z-10 grid gap-8 lg:grid-cols-12 lg:items-center">
                <div className="space-y-4 lg:col-span-8">
                  <div className="flex items-center gap-2">
                    <Badge tone="gold">WebGL · 60 FPS</Badge>
                    <span className="font-mono text-xs uppercase tracking-[0.08em] text-[var(--color-stone-300)]">
                      Virtual Atelier
                    </span>
                  </div>
                  <h2 className="font-display text-3xl font-normal tracking-[-0.015em] sm:text-4xl text-[var(--color-ivory-50)]">
                    Interactive 3D Garment Inspection
                  </h2>
                  <p className="max-w-xl text-sm leading-relaxed text-[var(--color-stone-300)]">
                    Experience real-time cloth drape, 360-degree rotation, and multi-angle silhouette exploration.
                    Examine fabric texture, seams, and structured fits directly within our WebGL showroom
                    powered by client-side Three.js.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <LinkButton href="/showroom" variant="gold" size="md">
                      Enter Virtual Showroom
                    </LinkButton>
                    <LinkButton
                      href="/outfit-studio"
                      variant="secondary"
                      size="md"
                      className="border-[var(--color-charcoal-border-hairline)] bg-[var(--color-graphite-700)] text-[var(--color-ivory-50)] hover:bg-[var(--color-charcoal-800)]"
                    >
                      Open Outfit Studio
                    </LinkButton>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:col-span-4">
                  <div className="rounded-[var(--radius-xs)] border border-[var(--color-charcoal-border-hairline)] bg-[var(--color-graphite-700)]/60 p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.06em] text-[var(--color-gold-300)]">01 / Draping</p>
                    <p className="mt-1 text-xs text-[var(--color-stone-300)]">Physical gravity &amp; fabric drape simulation</p>
                  </div>
                  <div className="rounded-[var(--radius-xs)] border border-[var(--color-charcoal-border-hairline)] bg-[var(--color-graphite-700)]/60 p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.06em] text-[var(--color-gold-300)]">02 / Orbit</p>
                    <p className="mt-1 text-xs text-[var(--color-stone-300)]">Smooth touch &amp; mouse orbit at 60 FPS</p>
                  </div>
                  <div className="rounded-[var(--radius-xs)] border border-[var(--color-charcoal-border-hairline)] bg-[var(--color-graphite-700)]/60 p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.06em] text-[var(--color-gold-300)]">03 / Shaders</p>
                    <p className="mt-1 text-xs text-[var(--color-stone-300)]">PBR rendering of tactile fiber textures</p>
                  </div>
                  <div className="rounded-[var(--radius-xs)] border border-[var(--color-charcoal-border-hairline)] bg-[var(--color-graphite-700)]/60 p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.06em] text-[var(--color-gold-300)]">04 / Styling</p>
                    <p className="mt-1 text-xs text-[var(--color-stone-300)]">Curate &amp; inspect layer combinations</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Featured Garments */}
            <section aria-labelledby="home-featured-heading" className="space-y-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                    Selected Silhouettes
                  </p>
                  <h2
                    id="home-featured-heading"
                    className="font-display text-2xl font-normal tracking-[-0.015em] text-ink sm:text-3xl"
                  >
                    Featured Releases
                  </h2>
                </div>
                <Link
                  href="/shop"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
                >
                  Shop All Garments
                </Link>
              </div>

              {featuredProducts.length === 0 ? (
                <EmptyState
                  title="No featured garments available"
                  description="Explore the complete shop index to inspect available catalog pieces."
                  action={
                    <LinkButton href="/shop" variant="primary" size="sm">
                      Open Shop Index
                    </LinkButton>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3">
                  {featuredProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}
            </section>

            {/* Category Architecture */}
            <section aria-labelledby="home-categories-heading" className="space-y-6">
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                  Architectural Wardrobe
                </p>
                <h2
                  id="home-categories-heading"
                  className="font-display text-2xl font-normal tracking-[-0.015em] text-ink sm:text-3xl"
                >
                  Shop by Category
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/shop/${category.slug}`}
                    className="group flex min-h-28 flex-col justify-between rounded-[var(--radius-sm)] border border-hairline bg-elevated p-4 transition-all duration-[var(--duration-fast)] hover:border-strong-border hover:bg-panel hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                        {category.slug}
                      </span>
                      <Badge tone="neutral">{category.productCount}</Badge>
                    </div>
                    <div className="space-y-1 pt-3">
                      <p className="font-display text-xl font-medium text-ink group-hover:text-link">
                        {category.name}
                      </p>
                      {category.description ? (
                        <p className="line-clamp-2 text-xs text-ink-muted">{category.description}</p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Atelier Materiality & Craftsmanship */}
            <section aria-labelledby="home-craft-heading" className="space-y-8 border-t border-hairline pt-12">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                    Artisanal Provenance
                  </p>
                  <h2
                    id="home-craft-heading"
                    className="font-display text-2xl font-normal tracking-[-0.015em] text-ink sm:text-3xl"
                  >
                    Materiality &amp; Architectural Craft
                  </h2>
                </div>
                <Link
                  href="/journal"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
                >
                  Read Atelier Journal
                </Link>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Surface variant="elevated" border="hairline" padding="md" className="space-y-3 transition-colors hover:border-strong-border">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">01 / RAW SILK</span>
                    <span className="font-mono text-[10px] uppercase text-gold">South Sulawesi</span>
                  </div>
                  <h3 className="font-display text-lg font-medium text-ink">Textured Slub Weave</h3>
                  <p className="text-xs leading-relaxed text-ink-secondary">
                    Artisanal hand-loomed fibers with irregular natural slub, yielding crisp structural volume and breathability in tropical heat.
                  </p>
                </Surface>

                <Surface variant="elevated" border="hairline" padding="md" className="space-y-3 transition-colors hover:border-strong-border">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">02 / CASHMERE</span>
                    <span className="font-mono text-[10px] uppercase text-gold">Grade-A Combed</span>
                  </div>
                  <h3 className="font-display text-lg font-medium text-ink">Double-Faced Weight</h3>
                  <p className="text-xs leading-relaxed text-ink-secondary">
                    Pure combed fibers finished without synthetic softeners, creating a fluid architectural drape that softens with every wear.
                  </p>
                </Surface>

                <Surface variant="elevated" border="hairline" padding="md" className="space-y-3 transition-colors hover:border-strong-border">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">03 / SELVEDGE</span>
                    <span className="font-mono text-[10px] uppercase text-gold">Okayama Mills</span>
                  </div>
                  <h3 className="font-display text-lg font-medium text-ink">14oz Shuttle Loom</h3>
                  <p className="text-xs leading-relaxed text-ink-secondary">
                    Pure rope-dyed indigo woven at low tension on vintage wooden shuttle looms, finished with custom ARVEN redline ticking.
                  </p>
                </Surface>

                <Surface variant="elevated" border="hairline" padding="md" className="space-y-3 transition-colors hover:border-strong-border">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">04 / VACHETTA</span>
                    <span className="font-mono text-[10px] uppercase text-gold">Tuscan Tannery</span>
                  </div>
                  <h3 className="font-display text-lg font-medium text-ink">Vegetable Tanning</h3>
                  <p className="text-xs leading-relaxed text-ink-secondary">
                    Conditioned exclusively with natural chestnut and mimosa barks for raw edges that develop a deep golden patina over time.
                  </p>
                </Surface>
              </div>
            </section>
          </>
        )}

        {/* Clientele Services Strip */}
        <section aria-labelledby="capabilities-heading" className="space-y-6 border-t border-hairline pt-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                Clientele Workspace
              </p>
              <h2
                id="capabilities-heading"
                className="font-display text-2xl font-normal tracking-[-0.015em] text-ink sm:text-3xl"
              >
                Account &amp; Delivery Governance
              </h2>
            </div>
            <Link
              href="/account"
              className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
            >
              Open Account Workspace
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {clienteleHighlights.map((item) => (
              <Surface
                key={item.code}
                variant="subtle"
                border="hairline"
                padding="md"
                className="flex flex-col justify-between gap-5"
              >
                <div className="space-y-2.5">
                  <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                    {item.code}
                  </p>
                  <h3 className="font-display text-2xl font-normal leading-snug text-ink">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-ink-secondary">{item.summary}</p>
                </div>

                <div>
                  <LinkButton href={item.href} variant="secondary" size="sm">
                    {item.actionLabel}
                  </LinkButton>
                </div>
              </Surface>
            ))}
          </div>
        </section>
      </div>
    </StorefrontShell>
  );
}
