'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CmsLookbookDto } from '@arven/contracts';
import {
  Badge,
  ErrorState,
  IconChevronLeft,
  LinkButton,
  LoadingState,
  Surface,
  buttonClassName,
  formatWIB,
} from '@arven/ui';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

export interface LookbookDetailViewProps {
  slug: string;
}

export function LookbookDetailView({ slug }: LookbookDetailViewProps) {
  const [lookbook, setLookbook] = useState<CmsLookbookDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    requestId?: string | null;
    isNotFound?: boolean;
  } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadLookbook = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getCmsLookbookBySlug(slug)
      .then((data) => {
        if (!active) return;
        setLookbook(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError({
            message: err.message,
            requestId: err.requestId,
            isNotFound: err.status === 404,
          });
        } else {
          setError({ message: 'Unable to load this lookbook right now.' });
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
  }, [reloadNonce, slug]);

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/lookbook"
          className={buttonClassName({ variant: 'secondary', size: 'sm' })}
        >
          <IconChevronLeft size={16} />
          <span>Back to Lookbooks</span>
        </Link>
      </div>

      {loading ? (
        <LoadingState label="Loading editorial lookbook" rows={6} className="min-h-[60dvh]" />
      ) : error || !lookbook ? (
        <ErrorState
          title={error?.isNotFound ? 'Lookbook not found' : 'Unable to load lookbook'}
          message={
            error?.message ?? 'This seasonal lookbook could not be found or is no longer published.'
          }
          requestId={error?.requestId}
          onRetry={error?.isNotFound ? undefined : () => void loadLookbook()}
        />
      ) : (
        <article className="space-y-12">
          {/* Opener Hero */}
          {lookbook.slides[0]?.imageUrl ? (
            <header className="grid grid-cols-1 overflow-hidden rounded-[var(--radius-none)] border border-hairline bg-subtle md:grid-cols-12">
              <div className="md:col-span-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lookbook.slides[0].imageUrl}
                  alt={lookbook.slides[0].altText ?? `${lookbook.title} editorial opener`}
                  decoding="async"
                  className="aspect-[3/4] h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-col justify-end bg-elevated p-6 sm:p-10 md:col-span-7">
                <div className="max-w-[var(--container-prose)] space-y-3 text-ink">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{lookbook.season}</Badge>
                    {lookbook.publishedAt ? (
                      <span className="font-mono text-xs tabular-nums text-ink-muted">
                        {formatWIB(lookbook.publishedAt)}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="font-display text-4xl font-normal tracking-[-0.02em] text-ink sm:text-5xl">
                    {lookbook.title}
                  </h1>
                  {lookbook.description ? (
                    <p className="text-sm leading-relaxed text-ink-secondary">
                      {lookbook.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </header>
          ) : (
            <header className="space-y-3 border-b border-hairline pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{lookbook.season}</Badge>
                {lookbook.publishedAt ? (
                  <span className="font-mono text-xs text-ink-muted">
                    {formatWIB(lookbook.publishedAt)}
                  </span>
                ) : null}
              </div>
              <h1 className="font-display text-4xl font-normal tracking-[-0.02em] text-ink sm:text-5xl">
                {lookbook.title}
              </h1>
              {lookbook.description ? (
                <p className="max-w-[var(--container-prose)] text-sm leading-relaxed text-ink-secondary">
                  {lookbook.description}
                </p>
              ) : null}
            </header>
          )}

          {/* Alternating Editorial Slides */}
          <div className="space-y-12">
            {lookbook.slides.map((slide, index) => {
              const reversed = index % 2 === 1;
              return (
                <Surface
                  key={slide.id ?? `${slide.title}-${index}`}
                  variant="elevated"
                  border="hairline"
                  padding="lg"
                >
                  <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
                    <div className={reversed ? 'lg:col-span-7 lg:order-2' : 'lg:col-span-7'}>
                      <div className="overflow-hidden rounded-[var(--radius-none)] border border-hairline bg-subtle">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={slide.imageUrl}
                          alt={slide.altText ?? slide.title}
                          decoding="async"
                          className="aspect-[3/4] w-full object-cover"
                        />
                      </div>
                    </div>

                    <div
                      className={
                        reversed
                          ? 'space-y-4 lg:col-span-5 lg:order-1'
                          : 'space-y-4 lg:col-span-5'
                      }
                    >
                      <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted tabular-nums">
                        Look {String(index + 1).padStart(2, '0')}
                      </p>
                      <h2 className="font-display text-3xl font-normal text-ink">
                        {slide.title}
                      </h2>
                      {slide.caption ? (
                        <p className="max-w-[var(--container-prose)] text-sm leading-relaxed text-ink-secondary">
                          {slide.caption}
                        </p>
                      ) : null}
                      {slide.productSlug ? (
                        <div className="pt-2">
                          <LinkButton
                            href={`/products/${encodeURIComponent(slide.productSlug)}`}
                            variant="primary"
                            size="md"
                            className="min-h-11"
                          >
                            Shop Featured Piece
                          </LinkButton>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Surface>
              );
            })}
          </div>
        </article>
      )}
    </div>
  );
}
