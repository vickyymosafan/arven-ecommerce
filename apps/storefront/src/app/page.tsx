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
  EmptyState,
  ErrorState,
  IconArrowRight,
  LinkButton,
  LoadingState,
  ProductCard,
  Surface,
  formatIDR,
} from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

const materialProvenance = [
  {
    index: '01',
    fiber: 'Raw Silk',
    origin: 'South Sulawesi',
    title: 'Textured Slub Weave',
    description:
      'Hand-loomed natural slub fibers yielding crisp architectural structure and effortless breathability across humid climates.',
  },
  {
    index: '02',
    fiber: 'Virgin Wool',
    origin: 'Grade-A Combed',
    title: 'Double-Faced Drape',
    description:
      'Pure combed fibers finished without synthetic softeners for sculpted silhouettes that hold proportion season after season.',
  },
  {
    index: '03',
    fiber: 'Selvedge Twill',
    origin: 'Okayama Mills',
    title: 'Low-Tension Shuttle Loom',
    description:
      'Dense long-staple cotton woven at low tension on vintage shuttle looms for clean line weight and enduring surface character.',
  },
  {
    index: '04',
    fiber: 'Full-Grain Calfskin',
    origin: 'Vegetable Tanned',
    title: 'Architectural Patina',
    description:
      'Conditioned exclusively with natural bark extracts and finished with burnished raw edges that deepen gracefully over years of wear.',
  },
] as const;

const atelierPromises = [
  {
    index: '01',
    eyebrow: 'Interactive Fit',
    title: '3D Silhouette & Outfit Studio',
    summary:
      'Inspect fabric finishes in 360 degrees or pair tops, outerwear, and trousers on our unisex studio mannequin before ordering.',
    href: '/outfit-studio',
    actionLabel: 'Open Outfit Studio',
  },
  {
    index: '02',
    eyebrow: 'Verified Fulfillment',
    title: 'Insured Jakarta Studio Dispatch',
    summary:
      'Every order is confirmed against live Jakarta atelier inventory with transparent IDR totals and tracked nationwide couriers.',
    href: '/shop',
    actionLabel: 'Browse Ready Stock',
  },
  {
    index: '03',
    eyebrow: 'Clientele Care',
    title: 'Saved Outfits, Addresses & Returns',
    summary:
      'Manage your delivery book, revisit saved styling combinations, track shipments, and initiate returns from one private account.',
    href: '/account',
    actionLabel: 'Visit My Account',
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
      storefrontApi.getProducts({ featured: true, sort: 'featured', limit: 8 }),
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

  const heroGarment =
    featuredProducts.find((item) => Boolean(item.primaryMedia?.url)) ??
    featuredProducts[0] ??
    null;

  return (
    <StorefrontShell>
      <div className="space-y-20 lg:space-y-24">
        {/* Asymmetric Editorial Luxury Hero */}
        <section className="grid gap-10 border-b border-hairline pb-14 lg:grid-cols-12 lg:items-center lg:gap-12 lg:pb-16">
          <div className="space-y-7 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="gold">Archive 2026</Badge>
              <span className="type-eyebrow text-ink-muted">Jakarta Architectural Atelier</span>
            </div>

            <h1 className="type-display-xl text-ink">
              Beyond Trends.
              <br />
              <em className="font-normal italic">Beyond Time.</em>
            </h1>

            <p className="type-body max-w-[54ch] text-ink-secondary">
              ARVEN is a contemporary unisex fashion house defined by sculptural proportion,
              heavyweight natural fibers, and disciplined monochromatic craft. Explore measured
              capsules or step directly into our interactive 3D Virtual Showroom.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <LinkButton href="/shop" variant="primary" size="lg">
                <span>Explore Catalog</span>
                <IconArrowRight size={16} />
              </LinkButton>
              <LinkButton href="/collections" variant="secondary" size="lg">
                View Capsules
              </LinkButton>
              <Link
                href="/showroom"
                className="editorial-link inline-flex min-h-11 items-center px-2 text-sm font-medium text-ink transition-colors hover:text-link"
              >
                <span>Enter 3D Showroom</span>
              </Link>
            </div>

            <dl className="grid grid-cols-3 gap-4 border-t border-hairline pt-6 sm:max-w-lg">
              <div className="space-y-1">
                <dt className="type-caption text-ink-muted">Capsules</dt>
                <dd className="font-display text-2xl font-normal tabular-nums text-ink">
                  {loading ? '04' : String(collections.length).padStart(2, '0')}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="type-caption text-ink-muted">Categories</dt>
                <dd className="font-display text-2xl font-normal tabular-nums text-ink">
                  {loading ? '05' : String(categories.length).padStart(2, '0')}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="type-caption text-ink-muted">Inspection</dt>
                <dd className="font-display text-2xl font-normal text-ink">2D &amp; 3D</dd>
              </div>
            </dl>
          </div>

          {/* Right Editorial Hero Stage */}
          <div className="lg:col-span-5">
            {heroGarment ? (
              <Link
                href={`/products/${heroGarment.slug}`}
                className="group mx-auto flex w-full max-w-md flex-col overflow-hidden border border-hairline bg-subtle transition-colors duration-[var(--duration-base)] hover:border-strong-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:mr-0 lg:ml-auto"
              >
                <div className="aspect-[3/4] w-full overflow-hidden bg-subtle">
                  {heroGarment.primaryMedia?.url ? (
                    <img
                      src={heroGarment.primaryMedia.url}
                      alt={heroGarment.primaryMedia.altText || heroGarment.name}
                      decoding="async"
                      className="block h-full w-full object-cover transition-transform duration-[var(--duration-editorial)] ease-[var(--ease-editorial)] motion-safe:group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-panel p-8 text-center">
                      <span className="font-display text-4xl tracking-[0.2em] uppercase text-ink">
                        ARVEN
                      </span>
                      <span className="mt-2 font-display text-lg italic text-ink-secondary">
                        Atelier Study 01
                      </span>
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--color-graphite-700)] bg-[var(--color-charcoal-900)] p-5 text-[var(--color-ivory-50)] sm:p-6">
                  <div className="flex items-end justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--color-gold-200)]">
                        {heroGarment.collections?.[0]?.name ?? 'Featured Edition'}
                      </p>
                      <p className="font-display text-2xl font-normal leading-snug text-[var(--color-ivory-50)]">
                        {heroGarment.name}
                      </p>
                      <p className="text-sm font-medium tabular-nums text-[var(--color-cream-200)]">
                        {formatIDR(heroGarment.priceIdr)}
                      </p>
                    </div>
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--color-stone-400)] text-[var(--color-ivory-50)] transition-colors group-hover:border-[var(--color-ivory-50)] group-hover:bg-[var(--color-ivory-50)] group-hover:text-[var(--color-charcoal-900)]">
                      <IconArrowRight size={18} />
                    </span>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="flex aspect-[4/5] w-full flex-col justify-between border border-hairline bg-subtle p-8">
                <span className="type-eyebrow text-ink-muted">Seasonal Monograph</span>
                <div className="space-y-2 border-y border-hairline py-8 text-center">
                  <p className="font-display text-4xl tracking-[0.18em] uppercase text-ink">
                    ARVEN
                  </p>
                  <p className="font-display text-xl italic text-ink-secondary">
                    Jakarta Studio Archive
                  </p>
                </div>
                <span className="type-caption text-ink-muted">
                  Loading flagship garment study
                </span>
              </div>
            )}
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
            {/* Curated Capsule Collections */}
            <section aria-labelledby="home-collections-heading" className="space-y-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1.5">
                  <p className="type-eyebrow text-ink-muted">Editorial Capsules</p>
                  <h2 id="home-collections-heading" className="type-display-lg text-ink">
                    House Collections
                  </h2>
                </div>
                <Link
                  href="/collections"
                  className="editorial-link inline-flex min-h-11 items-center text-sm font-medium text-ink transition-colors hover:text-link"
                >
                  <span>Browse All Collections</span>
                  <IconArrowRight size={15} />
                </Link>
              </div>

              {collections.length === 0 ? (
                <EmptyState
                  title="No active collections published"
                  description="Seasonal capsule releases will appear here once curated and published by the studio."
                />
              ) : (
                <div className="grid gap-8 md:grid-cols-2">
                  {collections.map((collection, index) => (
                    <article
                      key={collection.id}
                      className="group flex flex-col justify-between border-b border-hairline pb-6 transition-colors hover:border-strong-border"
                    >
                      <div className="space-y-4">
                        <Link
                          href={`/collections/${collection.slug}`}
                          className="relative block aspect-[5/2] w-full overflow-hidden border border-hairline bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          {collection.bannerUrl ? (
                            <img
                              src={collection.bannerUrl}
                              alt={`${collection.name} capsule editorial banner`}
                              decoding="async"
                              className="block h-full w-full object-cover transition-transform duration-[var(--duration-editorial)] ease-[var(--ease-editorial)] motion-safe:group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-subtle p-4">
                              <span className="font-display text-2xl text-ink">
                                {collection.name}
                              </span>
                            </div>
                          )}
                        </Link>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                            <span className="font-semibold uppercase tracking-[0.05em]">
                              Capsule {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="tabular-nums">
                              {collection.productCount}{' '}
                              {collection.productCount === 1 ? 'Piece' : 'Pieces'}
                            </span>
                          </div>

                          <h3 className="font-display text-2xl font-normal leading-snug text-ink">
                            <Link
                              href={`/collections/${collection.slug}`}
                              className="inline-flex min-h-11 items-center text-ink transition-colors hover:text-link"
                            >
                              {collection.name}
                            </Link>
                          </h3>

                          {collection.description ? (
                            <p className="text-sm leading-relaxed text-ink-secondary">
                              {collection.description}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="pt-4">
                        <Link
                          href={`/collections/${collection.slug}`}
                          className="editorial-link inline-flex min-h-11 items-center text-xs font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:text-link"
                        >
                          <span>Explore Capsule</span>
                          <IconArrowRight size={14} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Featured Garments (Balanced 4-Column Gallery Grid) */}
            <section aria-labelledby="home-featured-heading" className="space-y-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1.5">
                  <p className="type-eyebrow text-ink-muted">Selected Silhouettes</p>
                  <h2 id="home-featured-heading" className="type-display-lg text-ink">
                    Featured Releases
                  </h2>
                </div>
                <Link
                  href="/shop"
                  className="editorial-link inline-flex min-h-11 items-center text-sm font-medium text-ink transition-colors hover:text-link"
                >
                  <span>Shop All Garments</span>
                  <IconArrowRight size={15} />
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
                <div className="grid grid-cols-1 gap-x-6 gap-y-10 min-[480px]:grid-cols-2 lg:grid-cols-4">
                  {featuredProducts.slice(0, 8).map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}
            </section>

            {/* Dark Architectural 3D Showroom & Outfit Studio Band */}
            <section
              data-theme="dark"
              aria-labelledby="home-showroom-heading"
              className="rounded-[var(--radius-xs)] border border-hairline bg-canvas p-7 text-ink sm:p-10 lg:p-14"
            >
              <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
                <div className="space-y-5 lg:col-span-7">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone="gold">WebGL Studio</Badge>
                    <span className="type-eyebrow text-ink-muted">Virtual Atelier</span>
                  </div>

                  <h2 id="home-showroom-heading" className="type-display-lg text-ink">
                    Interactive 3D <em className="font-normal italic">Garment Inspection</em>
                  </h2>

                  <p className="type-body max-w-[54ch] text-ink-secondary">
                    Examine fabric finish, seam proportion, and full 360-degree silhouettes inside
                    our architectural WebGL showroom, or layer compatible pieces in the Outfit
                    Studio with full 2D gallery resilience.
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <LinkButton href="/showroom" variant="gold" size="lg">
                      <span>Enter Virtual Showroom</span>
                      <IconArrowRight size={16} />
                    </LinkButton>
                    <LinkButton href="/outfit-studio" variant="secondary" size="lg">
                      Open Outfit Studio
                    </LinkButton>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:col-span-5">
                  <div className="space-y-1.5 border border-hairline bg-subtle p-4">
                    <p className="type-eyebrow text-gold-fg">01 · Spatial Zones</p>
                    <p className="text-sm leading-relaxed text-ink-secondary">
                      Move across curated gallery zones with direct garment hotspots.
                    </p>
                  </div>
                  <div className="space-y-1.5 border border-hairline bg-subtle p-4">
                    <p className="type-eyebrow text-gold-fg">02 · 360° Orbit</p>
                    <p className="text-sm leading-relaxed text-ink-secondary">
                      Inspect seams and drape via pointer, touch, or keyboard controls.
                    </p>
                  </div>
                  <div className="space-y-1.5 border border-hairline bg-subtle p-4">
                    <p className="type-eyebrow text-gold-fg">03 · Material Presets</p>
                    <p className="text-sm leading-relaxed text-ink-secondary">
                      Switch studio fabric finishes synchronized live with active SKUs.
                    </p>
                  </div>
                  <div className="space-y-1.5 border border-hairline bg-subtle p-4">
                    <p className="type-eyebrow text-gold-fg">04 · Outfit Layering</p>
                    <p className="text-sm leading-relaxed text-ink-secondary">
                      Compose compatible looks on a standard unisex rig and add to bag.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Category Architecture */}
            <section aria-labelledby="home-categories-heading" className="space-y-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1.5">
                  <p className="type-eyebrow text-ink-muted">Architectural Wardrobe</p>
                  <h2 id="home-categories-heading" className="type-display-lg text-ink">
                    Shop by Category
                  </h2>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/shop/${category.slug}`}
                    className="group flex min-h-36 flex-col justify-between border border-hairline bg-elevated p-5 transition-colors duration-[var(--duration-fast)] hover:border-strong-border hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="type-eyebrow text-ink-muted">{category.slug}</span>
                      <span className="text-xs font-semibold tabular-nums text-ink-muted">
                        {String(category.productCount).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="space-y-2 pt-5">
                      <p className="font-display text-2xl font-normal text-ink transition-colors group-hover:text-link">
                        {category.name}
                      </p>
                      {category.description ? (
                        <p className="text-xs leading-relaxed text-ink-secondary">
                          {category.description}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Atelier Materiality & Craftsmanship */}
            <section
              aria-labelledby="home-craft-heading"
              className="space-y-8 border-t border-hairline pt-14"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1.5">
                  <p className="type-eyebrow text-ink-muted">Artisanal Provenance</p>
                  <h2 id="home-craft-heading" className="type-display-lg text-ink">
                    Materiality &amp; <em className="font-normal italic">Craft</em>
                  </h2>
                </div>
                <Link
                  href="/journal"
                  className="editorial-link inline-flex min-h-11 items-center text-sm font-medium text-ink transition-colors hover:text-link"
                >
                  <span>Read Atelier Journal</span>
                  <IconArrowRight size={15} />
                </Link>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {materialProvenance.map((item) => (
                  <Surface
                    key={item.index}
                    variant="elevated"
                    border="hairline"
                    padding="md"
                    className="flex flex-col justify-between space-y-4 transition-colors hover:border-strong-border"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
                        <span className="type-eyebrow text-ink-muted">
                          {item.index} · {item.fiber}
                        </span>
                        <span className="text-xs font-semibold text-gold-fg">{item.origin}</span>
                      </div>
                      <h3 className="font-display text-2xl font-normal leading-snug text-ink">
                        {item.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-ink-secondary">
                        {item.description}
                      </p>
                    </div>
                  </Surface>
                ))}
              </div>
            </section>
          </>
        )}

        {/* Atelier Services & Clientele Promise */}
        <section
          aria-labelledby="atelier-services-heading"
          className="space-y-8 border-t border-hairline pt-14"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <p className="type-eyebrow text-ink-muted">House Services</p>
              <h2 id="atelier-services-heading" className="type-display-lg text-ink">
                Clientele Experience
              </h2>
            </div>
            <Link
              href="/about"
              className="editorial-link inline-flex min-h-11 items-center text-sm font-medium text-ink transition-colors hover:text-link"
            >
              <span>About ARVEN Atelier</span>
              <IconArrowRight size={15} />
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {atelierPromises.map((item) => (
              <Surface
                key={item.index}
                variant="subtle"
                border="hairline"
                padding="lg"
                className="flex flex-col justify-between gap-6"
              >
                <div className="space-y-3">
                  <p className="type-eyebrow text-gold-fg">
                    {item.index} · {item.eyebrow}
                  </p>
                  <h3 className="font-display text-2xl font-normal leading-snug text-ink">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-ink-secondary">{item.summary}</p>
                </div>

                <div>
                  <LinkButton href={item.href} variant="secondary" size="sm">
                    <span>{item.actionLabel}</span>
                    <IconArrowRight size={14} />
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
