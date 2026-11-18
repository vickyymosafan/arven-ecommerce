'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CmsJournalArticleDto } from '@arven/contracts';
import {
  Divider,
  ErrorState,
  IconChevronLeft,
  LoadingState,
  buttonClassName,
  formatWIB,
} from '@arven/ui';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

interface NormalizedSection {
  heading?: string;
  body: string;
}

function normalizeJournalBody(body: CmsJournalArticleDto['body']): NormalizedSection[] {
  const buildSection = (entry: Record<string, unknown>, rawBody: string): NormalizedSection => {
    const heading = typeof entry['heading'] === 'string' ? entry['heading'] : undefined;
    // Avoid duplicating identical heading text into the paragraph slot (e.g., heading-only JSON blocks).
    const bodyText = heading && rawBody.trim() === heading.trim() ? '' : rawBody;
    return { heading, body: bodyText };
  };

  if (Array.isArray(body)) {
    return body
      .map((entry) => {
        const rawBody =
          typeof entry['body'] === 'string'
            ? entry['body']
            : typeof entry['paragraph'] === 'string'
              ? entry['paragraph']
              : typeof entry['text'] === 'string'
                ? entry['text']
                : '';
        return buildSection(entry, rawBody);
      })
      .filter((s) => s.body.length > 0 || Boolean(s.heading));
  }

  const sections = body['sections'];
  if (Array.isArray(sections)) {
    return sections
      .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .map((entry) => {
        const rawBody =
          typeof entry['body'] === 'string'
            ? entry['body']
            : typeof entry['text'] === 'string'
              ? entry['text']
              : '';
        return buildSection(entry, rawBody);
      })
      .filter((s) => s.body.length > 0 || Boolean(s.heading));
  }

  const paragraphs = body['paragraphs'];
  if (Array.isArray(paragraphs)) {
    return paragraphs
      .filter((p): p is string => typeof p === 'string')
      .map((p) => ({ body: p }));
  }

  if (typeof body['content'] === 'string') {
    return [{ body: body['content'] }];
  }

  return [];
}

export interface JournalDetailViewProps {
  slug: string;
}

export function JournalDetailView({ slug }: JournalDetailViewProps) {
  const [article, setArticle] = useState<CmsJournalArticleDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    requestId?: string | null;
    isNotFound?: boolean;
  } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadArticle = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getCmsJournalBySlug(slug)
      .then((data) => {
        if (!active) return;
        setArticle(data);
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
          setError({ message: 'Unable to load this journal article right now.' });
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

  const sections = article ? normalizeJournalBody(article.body) : [];

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/journal"
          className={buttonClassName({ variant: 'secondary', size: 'sm' })}
        >
          <IconChevronLeft size={16} />
          <span>Back to Journal</span>
        </Link>
      </div>

      {loading ? (
        <LoadingState label="Loading journal article" rows={5} className="min-h-[60dvh]" />
      ) : error || !article ? (
        <ErrorState
          title={error?.isNotFound ? 'Article not found' : 'Unable to load article'}
          message={
            error?.message ?? 'This journal article could not be found or is no longer published.'
          }
          requestId={error?.requestId}
          onRetry={error?.isNotFound ? undefined : () => void loadArticle()}
        />
      ) : (
        <article className="mx-auto max-w-[var(--container-prose)] space-y-8">
          <header className="space-y-4">
            <p className="font-mono text-xs tabular-nums text-ink-muted">
              {formatWIB(article.publishedAt ?? article.createdAt)}
              {article.authorName ? ` | Written by ${article.authorName}` : ''}
            </p>
            <h1 className="font-display text-4xl font-normal tracking-[-0.02em] text-ink sm:text-5xl">
              {article.title}
            </h1>
            <p className="text-base leading-relaxed text-ink-secondary">
              {article.excerpt}
            </p>
          </header>

          {article.coverMediaUrl ? (
            <div className="overflow-hidden rounded-[var(--radius-none)] border border-hairline bg-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={article.coverMediaUrl}
                alt={`${article.title} editorial photograph`}
                decoding="async"
                className="aspect-[16/10] w-full object-cover"
              />
            </div>
          ) : null}

          <Divider />

          <div className="space-y-6">
            {sections.map((section, idx) => (
              <section key={idx} className="space-y-2.5">
                {section.heading ? (
                  <h2 className="font-display text-2xl font-normal text-ink">
                    {section.heading}
                  </h2>
                ) : null}
                {section.body ? (
                  <p className="text-base leading-relaxed text-ink-secondary">{section.body}</p>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
