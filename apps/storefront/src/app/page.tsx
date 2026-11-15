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
      <div className="space-y-14">
        {/* Editorial Hero */}
        <section className="grid gap-8 border-b border-hairline pb-12 lg:grid-cols-12 lg:items-end">
          <div className="space-y-5 lg:col-span-8">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="info">Seasonal Archive</Badge>
              <span className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                Jakarta Studio Dispatch
              </span>
            </div>

            <h1 className="font-display text-4xl font-normal leading-[1.08] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
              Beyond Trends.
              <br />
              Beyond Time.
            </h1>

            <p className="max-w-[var(--container-prose)] text-base leading-relaxed text-ink-secondary">
              ARVEN is a contemporary luxury fashion house shaped by architectural proportion,
              natural fiber weight, and restrained monochromatic craft. Explore published garments,
              inspect multi-variant sizing, and curate pieces built for longevity.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <LinkButton href="/shop" variant="primary" size="lg">
                Explore Catalog
              </LinkButton>
              <LinkButton href="/collections" variant="secondary" size="lg">
                View Capsules
              </LinkButton>
              <LinkButton href="/search" variant="ghost" size="lg">
                Search Archive
              </LinkButton>
            </div>
          </div>

          <div className="lg:col-span-4">
            <Surface variant="panel" border="control" padding="md" className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                  House Release Index
                </span>
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
                  <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
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
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {collections.map((collection) => (
                    <Surface
                      key={collection.id}
                      variant="elevated"
                      border="hairline"
                      padding="none"
                      className="flex flex-col justify-between overflow-hidden transition-colors hover:border-strong-border"
                    >
                      <Link
                        href={`/collections/${collection.slug}`}
                        className="block border-b border-hairline bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {collection.bannerUrl ? (
                          <img
                            src={collection.bannerUrl}
                            alt={`${collection.name} capsule editorial banner`}
                            decoding="async"
                            className="aspect-[5/2] w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[5/2] w-full items-center justify-center bg-subtle p-4">
                            <span className="font-display text-xl text-ink">{collection.name}</span>
                          </div>
                        )}
                      </Link>

                      <div className="flex flex-1 flex-col justify-between gap-4 p-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                              Capsule
                            </span>
                            <span className="font-mono text-xs tabular-nums text-ink-muted">
                              {collection.productCount} {collection.productCount === 1 ? 'piece' : 'pieces'}
                            </span>
                          </div>
                          <h3 className="font-display text-2xl font-normal text-ink">
                            <Link
                              href={`/collections/${collection.slug}`}
                              className="inline-flex min-h-11 items-center text-ink hover:text-link"
                            >
                              {collection.name}
                            </Link>
                          </h3>
                          {collection.description ? (
                            <p className="text-xs leading-relaxed text-ink-secondary">
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
                    className="group flex min-h-28 flex-col justify-between rounded-[var(--radius-sm)] border border-hairline bg-elevated p-4 transition-colors hover:border-strong-border hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
