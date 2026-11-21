'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CmsPageBlockDto, CmsPageDto } from '@arven/contracts';
import {
  Divider,
  ErrorState,
  LinkButton,
  LoadingState,
  Surface,
} from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

function isSafeCmsHref(href: string): boolean {
  const trimmed = href.trim();
  return (trimmed.startsWith('/') && !trimmed.startsWith('//')) || trimmed.startsWith('https://');
}

function extractBlocks(blocks: CmsPageDto['blocks']): CmsPageBlockDto[] {
  if (Array.isArray(blocks)) {
    return blocks;
  }
  const nested = (blocks as Record<string, unknown>)['blocks'];
  return Array.isArray(nested) ? (nested as CmsPageBlockDto[]) : [];
}

export default function AboutCmsPage() {
  const [page, setPage] = useState<CmsPageDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadPage = useCallback(() => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getCmsPageBySlug('about')
      .then((data) => {
        if (!active) return;
        setPage(data);
        setError(null);
        setNotFound(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 404) {
          setNotFound(true);
        } else if (err instanceof ApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load the About page right now.' });
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

  const blocks = page ? extractBlocks(page.blocks) : [];

  return (
    <StorefrontShell>
      {loading ? (
        <LoadingState label="Loading ARVEN house story" rows={4} className="min-h-[85dvh]" />
      ) : error ? (
        <ErrorState
          title="Unable to load About page"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void loadPage()}
        />
      ) : notFound || !page ? (
        <article className="mx-auto max-w-[var(--container-prose)] space-y-6">
          <p className="type-eyebrow text-ink-muted">Jakarta Atelier</p>
          <h1 className="type-display-xl text-ink">
            Beyond Trends. <em className="font-normal italic">Beyond Time.</em>
          </h1>
          <Divider />
          <p className="type-body text-ink-secondary">
            ARVEN designs contemporary unisex garments, footwear, and architectural objects built
            around proportion, natural textile weight, and long-term wear.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <LinkButton href="/shop" variant="primary" size="md">
              Explore Shop
            </LinkButton>
            <LinkButton href="/lookbook" variant="secondary" size="md">
              View Lookbook
            </LinkButton>
          </div>
        </article>
      ) : (
        <article className="mx-auto max-w-[var(--container-prose)] space-y-8">
          <header className="space-y-3 border-b border-hairline pb-6">
            <p className="type-eyebrow text-ink-muted">ARVEN House</p>
            <h1 className="type-display-lg text-ink">{page.title}</h1>
          </header>

          <div className="space-y-6">
            {blocks.map((block, idx) => (
              <Surface
                key={block.id ?? idx}
                variant={block.type === 'callout' ? 'subtle' : 'elevated'}
                border="hairline"
                padding="lg"
                className="space-y-3"
              >
                {block.heading ? (
                  <h2 className="font-display text-2xl font-normal text-ink">{block.heading}</h2>
                ) : null}
                {block.subheading ? (
                  <p className="text-xs uppercase tracking-[0.06em] text-ink-muted">
                    {block.subheading}
                  </p>
                ) : null}
                {block.body ? (
                  <p className="text-sm leading-relaxed text-ink-secondary">{block.body}</p>
                ) : null}
                {block.ctaLabel && block.ctaHref && isSafeCmsHref(block.ctaHref) ? (
                  <div className="pt-2">
                    <LinkButton href={block.ctaHref} variant="secondary" size="md">
                      {block.ctaLabel}
                    </LinkButton>
                  </div>
                ) : null}
              </Surface>
            ))}
          </div>
        </article>
      )}
    </StorefrontShell>
  );
}
