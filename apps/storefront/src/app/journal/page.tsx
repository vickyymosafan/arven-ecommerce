'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CmsJournalArticleDto } from '@arven/contracts';
import {
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  Surface,
  formatWIB,
} from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

export default function JournalIndexPage() {
  const [articles, setArticles] = useState<CmsJournalArticleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadJournal = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getCmsJournal({ page: 1, limit: 24 })
      .then((result) => {
        if (!active) return;
        setArticles(result.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load journal essays right now.' });
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
        <section className="space-y-3 border-b border-hairline pb-8">
          <p className="type-eyebrow text-ink-muted">Editorial Notes</p>
          <h1 className="type-display-lg text-ink">ARVEN Journal</h1>
          <p className="type-body max-w-[var(--container-prose)] text-ink-secondary">
            Field dispatches on natural fibers, pattern architecture, garment care, and Jakarta
            studio production.
          </p>
        </section>

        {loading ? (
          <LoadingState label="Loading journal essays" rows={4} className="min-h-[60dvh]" />
        ) : error ? (
          <ErrorState
            title="Unable to load journal"
            message={error.message}
            requestId={error.requestId}
            onRetry={() => void loadJournal()}
          />
        ) : articles.length === 0 ? (
          <EmptyState
            title="No journal articles published yet."
            description="Browse the seasonal catalog and lookbooks while upcoming studio notes are prepared."
            action={
              <LinkButton href="/shop" variant="primary" size="md">
                Browse Collection
              </LinkButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Surface
                key={article.id}
                variant="elevated"
                border="hairline"
                padding="md"
                className="flex flex-col justify-between gap-5"
              >
                <div className="space-y-4">
                  <Link
                    href={`/journal/${encodeURIComponent(article.slug)}`}
                    className="block overflow-hidden rounded-[var(--radius-none)] border border-hairline bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {article.coverMediaUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={article.coverMediaUrl}
                          alt={`${article.title} cover image`}
                          decoding="async"
                          className="aspect-[16/10] w-full object-cover"
                        />
                      </>
                    ) : (
                      <div className="flex aspect-[16/10] w-full items-center justify-center bg-subtle p-6">
                        <span className="font-display text-xl text-ink">ARVEN Journal</span>
                      </div>
                    )}
                  </Link>

                  <div className="space-y-2">
                    <p className="font-mono text-xs tabular-nums text-ink-muted">
                      {formatWIB(article.publishedAt ?? article.createdAt)}
                      {article.authorName ? ` | ${article.authorName}` : ''}
                    </p>
                    <h2 className="font-display text-2xl font-normal text-ink">
                      <Link
                        href={`/journal/${encodeURIComponent(article.slug)}`}
                        className="inline-flex min-h-11 items-center text-ink hover:text-link"
                      >
                        {article.title}
                      </Link>
                    </h2>
                    <p className="text-sm leading-relaxed text-ink-secondary">
                      {article.excerpt}
                    </p>
                  </div>
                </div>

                <LinkButton
                  href={`/journal/${encodeURIComponent(article.slug)}`}
                  variant="secondary"
                  size="md"
                  className="min-h-11"
                >
                  Read Article
                </LinkButton>
              </Surface>
            ))}
          </div>
        )}
      </div>
    </StorefrontShell>
  );
}
