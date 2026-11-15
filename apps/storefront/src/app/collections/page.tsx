'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CollectionSummaryDto } from '@arven/contracts';
import {
  Badge,
  Divider,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  ProductCard,
  Surface,
  formatWIB,
} from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

export default function CollectionsIndexPage() {
  const [collections, setCollections] = useState<CollectionSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadCollections = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getCollections()
      .then((data) => {
        if (!active) return;
        setCollections(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load published collections right now.' });
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
      <div className="space-y-10">
        <section className="space-y-3 border-b border-hairline pb-6">
          <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
            Editorial Index
          </p>
          <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-5xl">
            ARVEN Collections
          </h1>
          <p className="max-w-[var(--container-prose)] text-sm leading-relaxed text-ink-secondary">
            Curated garment capsules organized by textile weight, silhouette architecture, and
            everyday movement.
          </p>
        </section>

        {loading ? (
          <LoadingState
            label="Loading published capsule collections"
            rows={4}
            className="min-h-[85dvh]"
          />
        ) : error ? (
          <ErrorState
            title="Unable to load collections"
            message={error.message}
            requestId={error.requestId}
            onRetry={() => void loadCollections()}
          />
        ) : collections.length === 0 ? (
          <EmptyState
            title="No published collections available"
            description="Check the full shop catalog to view individual garments currently published."
            action={
              <LinkButton href="/shop" variant="primary" size="md">
                Explore Shop Catalog
              </LinkButton>
            }
          />
        ) : (
          <div className="space-y-10">
            {collections.map((collection) => (
              <Surface
                key={collection.id}
                variant="elevated"
                border="hairline"
                padding="lg"
                className="space-y-6"
              >
                <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
                  <div className="lg:col-span-5">
                    <Link
                      href={`/collections/${collection.slug}`}
                      className="block overflow-hidden rounded-[var(--radius-none)] border border-hairline bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {collection.bannerUrl ? (
                        <img
                          src={collection.bannerUrl}
                          alt={`${collection.name} editorial banner`}
                          decoding="async"
                          className="aspect-[5/2] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[5/2] w-full items-center justify-center bg-subtle p-6">
                          <span className="font-display text-2xl text-ink">{collection.name}</span>
                        </div>
                      )}
                    </Link>
                  </div>

                  <div className="space-y-4 lg:col-span-7">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">Capsule</Badge>
                      <Badge tone="neutral">
                        {collection.productCount} {collection.productCount === 1 ? 'Piece' : 'Pieces'}
                      </Badge>
                      {collection.startsAt ? (
                        <span className="font-mono text-xs text-ink-muted">
                          Active from {formatWIB(collection.startsAt)}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="font-display text-3xl font-normal text-ink">
                      <Link
                        href={`/collections/${collection.slug}`}
                        className="inline-flex min-h-11 items-center text-ink hover:text-link"
                      >
                        {collection.name}
                      </Link>
                    </h2>

                    {collection.description ? (
                      <p className="max-w-[var(--container-prose)] text-sm leading-relaxed text-ink-secondary">
                        {collection.description}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <LinkButton href={`/collections/${collection.slug}`} variant="primary" size="md">
                        Explore {collection.name}
                      </LinkButton>
                      <LinkButton
                        href={`/shop?collection=${encodeURIComponent(collection.slug)}`}
                        variant="secondary"
                        size="md"
                      >
                        Filter in Shop
                      </LinkButton>
                    </div>
                  </div>
                </div>

                {collection.featuredProducts.length > 0 ? (
                  <>
                    <Divider />
                    <div className="space-y-4">
                      <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                        Selected Pieces from {collection.name}
                      </p>
                      <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3">
                        {collection.featuredProducts.slice(0, 3).map((product) => (
                          <ProductCard key={product.id} product={product} />
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </Surface>
            ))}
          </div>
        )}
      </div>
    </StorefrontShell>
  );
}
