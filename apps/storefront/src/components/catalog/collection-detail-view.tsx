'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CollectionDetailDto } from '@arven/contracts';
import {
  Badge,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  ProductCard,
  Surface,
  formatWIB,
} from '@arven/ui';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

export function CollectionDetailView({ slug }: { slug: string }) {
  const [collection, setCollection] = useState<CollectionDetailDto | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadCollection = useCallback(() => {
    setLoading(true);
    setNotFound(false);
    setError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getCollectionBySlug(slug)
      .then((data) => {
        if (!active) return;
        setCollection(data);
        setNotFound(false);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 404) {
          setNotFound(true);
        } else if (err instanceof ApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load collection details right now.' });
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
  }, [slug, reloadNonce]);

  if (loading) {
    return <LoadingState label="Loading capsule collection" rows={5} />;
  }

  if (notFound) {
    return (
      <EmptyState
        title="Collection not found"
        description={`The capsule "${slug}" could not be found or is no longer active.`}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <LinkButton href="/collections" variant="primary" size="md">
              View All Collections
            </LinkButton>
            <LinkButton href="/shop" variant="secondary" size="md">
              Open Shop Index
            </LinkButton>
          </div>
        }
      />
    );
  }

  if (error || !collection) {
    return (
      <ErrorState
        title="Unable to load collection"
        message={error?.message ?? 'Unexpected error loading collection.'}
        requestId={error?.requestId}
        onRetry={() => void loadCollection()}
      />
    );
  }

  return (
    <div className="space-y-10">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Link href="/" className="inline-flex min-h-11 items-center px-1 hover:text-ink hover:underline">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href="/collections"
          className="inline-flex min-h-11 items-center px-1 hover:text-ink hover:underline"
        >
          Collections
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-ink">{collection.name}</span>
      </nav>

      <Surface variant="elevated" border="hairline" padding="lg">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            {collection.bannerUrl ? (
              <img
                src={collection.bannerUrl}
                alt={`${collection.name} editorial artwork`}
                className="aspect-[5/2] w-full border border-hairline bg-panel object-cover"
              />
            ) : (
              <div className="flex aspect-[5/2] w-full items-center justify-center border border-hairline bg-subtle p-6">
                <span className="font-display text-2xl text-ink">{collection.name}</span>
              </div>
            )}
          </div>

          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">Capsule Edition</Badge>
              <Badge tone="neutral">
                {collection.productCount} {collection.productCount === 1 ? 'Piece' : 'Pieces'}
              </Badge>
              {collection.startsAt ? (
                <span className="font-mono text-xs text-ink-muted">
                  Released {formatWIB(collection.startsAt)}
                </span>
              ) : null}
            </div>

            <h1 className="type-display-lg text-ink">
              {collection.name}
            </h1>

            {collection.description ? (
              <p className="type-ui max-w-[var(--container-prose)] text-ink-secondary">
                {collection.description}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <LinkButton
                href={`/shop?collection=${encodeURIComponent(collection.slug)}`}
                variant="secondary"
                size="md"
              >
                Open in Shop Filter
              </LinkButton>
              <LinkButton href="/collections" variant="ghost" size="md">
                All Collections
              </LinkButton>
            </div>
          </div>
        </div>
      </Surface>

      <section aria-labelledby="collection-products-heading" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            id="collection-products-heading"
            className="font-display text-2xl font-normal text-ink sm:text-3xl"
          >
            Curated Garments ({collection.products.length})
          </h2>
        </div>

        {collection.products.length === 0 ? (
          <EmptyState
            title="No published garments in this capsule yet"
            description="Pieces assigned to this capsule will appear here as soon as they pass studio publishing review."
            action={
              <LinkButton href="/shop" variant="primary" size="md">
                Browse Available Catalog
              </LinkButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {collection.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
