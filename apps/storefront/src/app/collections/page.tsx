'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CollectionSummaryDto } from '@arven/contracts';
import {
  Badge,
  Divider,
  EmptyState,
  ErrorState,
  IconArrowRight,
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
      <div className="space-y-12">
        <section className="space-y-3 border-b border-hairline pb-8">
          <p className="type-eyebrow text-ink-muted">Editorial Capsules</p>
          <h1 className="type-display-lg text-ink">ARVEN Collections</h1>
          <p className="type-body max-w-[var(--container-prose)] text-ink-secondary">
            Curated garment capsules organized by natural textile weight, silhouette architecture,
            and enduring everyday proportion.
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
          <div className="space-y-12">
            {collections.map((collection, idx) => (
              <Surface
                key={collection.id}
                variant="elevated"
                border="hairline"
                padding="lg"
                className="space-y-8"
              >
                <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
                  <div className="lg:col-span-6">
                    <Link
                      href={`/collections/${collection.slug}`}
                      className="group block overflow-hidden border border-hairline bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {collection.bannerUrl ? (
                        <img
                          src={collection.bannerUrl}
                          alt={`${collection.name} editorial banner`}
                          decoding="async"
                          className="block aspect-[5/2] w-full object-cover transition-transform duration-[var(--duration-editorial)] ease-[var(--ease-editorial)] motion-safe:group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex aspect-[5/2] w-full items-center justify-center bg-subtle p-6">
                          <span className="font-display text-3xl text-ink">{collection.name}</span>
                        </div>
                      )}
                    </Link>
                  </div>

                  <div className="space-y-4 lg:col-span-6">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge tone="gold">Capsule {String(idx + 1).padStart(2, '0')}</Badge>
                      <Badge tone="neutral">
                        {collection.productCount}{' '}
                        {collection.productCount === 1 ? 'Piece' : 'Pieces'}
                      </Badge>
                      {collection.startsAt ? (
                        <span className="type-caption tabular-nums text-ink-muted">
                          Active from {formatWIB(collection.startsAt)}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="type-display-lg text-ink">
                      <Link
                        href={`/collections/${collection.slug}`}
                        className="inline-flex min-h-11 items-center text-ink transition-colors hover:text-link"
                      >
                        {collection.name}
                      </Link>
                    </h2>

                    {collection.description ? (
                      <p className="type-ui max-w-[var(--container-prose)] text-ink-secondary">
                        {collection.description}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <LinkButton
                        href={`/collections/${collection.slug}`}
                        variant="primary"
                        size="md"
                      >
                        <span>Explore {collection.name}</span>
                        <IconArrowRight size={15} />
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
                    <div className="space-y-5">
                      <p className="type-eyebrow text-ink-muted">
                        Selected Pieces from {collection.name}
                      </p>
                      <div className="grid grid-cols-1 gap-x-6 gap-y-8 min-[480px]:grid-cols-2 lg:grid-cols-3">
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
