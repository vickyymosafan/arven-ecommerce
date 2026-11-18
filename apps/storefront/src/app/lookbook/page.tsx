'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CmsLookbookDto } from '@arven/contracts';
import {
  Badge,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  Surface,
  formatWIB,
} from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

export default function LookbookIndexPage() {
  const [lookbooks, setLookbooks] = useState<CmsLookbookDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadLookbooks = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getCmsLookbooks({ page: 1, limit: 24 })
      .then((result) => {
        if (!active) return;
        setLookbooks(result.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load published lookbooks right now.' });
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
            Editorial Lookbook
          </p>
          <h1 className="font-display text-4xl font-normal tracking-[-0.015em] text-ink sm:text-5xl">
            ARVEN Lookbook
          </h1>
          <p className="max-w-[var(--container-prose)] text-sm leading-relaxed text-ink-secondary">
            Seasonal silhouettes photographed in Jakarta across tailored wool, Japanese cotton, and
            architectural leather accessories.
          </p>
        </section>

        {loading ? (
          <LoadingState label="Loading published lookbooks" rows={4} className="min-h-[60dvh]" />
        ) : error ? (
          <ErrorState
            title="Unable to load lookbooks"
            message={error.message}
            requestId={error.requestId}
            onRetry={() => void loadLookbooks()}
          />
        ) : lookbooks.length === 0 ? (
          <EmptyState
            title="No lookbooks are currently published."
            description="Explore the active collection catalog to inspect available garments and sizing."
            action={
              <LinkButton href="/shop" variant="primary" size="md">
                Browse Collection
              </LinkButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {lookbooks.map((lookbook) => {
              const coverSlide = lookbook.slides[0] ?? null;
              return (
                <Surface
                  key={lookbook.id}
                  variant="elevated"
                  border="hairline"
                  padding="md"
                  className="flex flex-col justify-between gap-5"
                >
                  <div className="space-y-4">
                    <Link
                      href={`/lookbook/${encodeURIComponent(lookbook.slug)}`}
                      className="block overflow-hidden rounded-[var(--radius-none)] border border-hairline bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {coverSlide?.imageUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={coverSlide.imageUrl}
                            alt={coverSlide.altText ?? `${lookbook.title} lookbook study`}
                            decoding="async"
                            className="aspect-[3/4] w-full object-cover"
                          />
                        </>
                      ) : (
                        <div className="flex aspect-[3/4] w-full items-center justify-center bg-subtle p-6">
                          <span className="font-display text-2xl text-ink">
                            {lookbook.season}
                          </span>
                        </div>
                      )}
                    </Link>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs uppercase tracking-[0.06em] text-ink-muted">
                          {lookbook.season}
                        </span>
                        <Badge tone="neutral">
                          {lookbook.slides.length}{' '}
                          {lookbook.slides.length === 1 ? 'Frame' : 'Frames'}
                        </Badge>
                      </div>
                      <h2 className="font-display text-2xl font-normal text-ink">
                        <Link
                          href={`/lookbook/${encodeURIComponent(lookbook.slug)}`}
                          className="inline-flex min-h-11 items-center text-ink hover:text-link"
                        >
                          {lookbook.title}
                        </Link>
                      </h2>
                      {lookbook.description ? (
                        <p className="text-sm leading-relaxed text-ink-secondary">
                          {lookbook.description}
                        </p>
                      ) : null}
                      {lookbook.publishedAt ? (
                        <p className="font-mono text-xs tabular-nums text-ink-muted">
                          Published {formatWIB(lookbook.publishedAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <LinkButton
                    href={`/lookbook/${encodeURIComponent(lookbook.slug)}`}
                    variant="secondary"
                    size="md"
                    className="min-h-11"
                  >
                    Explore Lookbook
                  </LinkButton>
                </Surface>
              );
            })}
          </div>
        )}
      </div>
    </StorefrontShell>
  );
}
