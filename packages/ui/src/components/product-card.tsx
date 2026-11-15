'use client';

import { useState } from 'react';
import { cn } from '../lib/cn.js';
import { formatIDR } from '../lib/format.js';
import { Badge } from './badge.js';

export type CatalogStockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface CatalogProductMediaItem {
  id: string;
  url: string;
  altText: string;
  type?: string;
  isPrimary?: boolean;
}

export interface CatalogProductCardItem {
  id: string;
  slug: string;
  name: string;
  description?: string;
  material: string;
  fit: string;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  isFeatured: boolean;
  has3dEnabled?: boolean;
  inStock: boolean;
  stockStatus: CatalogStockStatus;
  primaryCategory: {
    id: string;
    slug: string;
    name: string;
  } | null;
  collections?: Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  primaryMedia: CatalogProductMediaItem | null;
  availableSizes: string[];
  availableColors: Array<{
    color: string;
    colorHex: string | null;
  }>;
}

export interface ProductCardProps {
  product: CatalogProductCardItem;
  href?: string;
  className?: string;
}

export function ProductCard({ product, href, className }: ProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const productHref = href ?? `/products/${product.slug}`;
  const mediaUrl = !imageError && product.primaryMedia?.url ? product.primaryMedia.url : null;
  const mediaAlt = product.primaryMedia?.altText || product.name;

  const hasDiscount =
    typeof product.compareAtPriceIdr === 'number' &&
    product.compareAtPriceIdr > product.priceIdr;

  const visibleSwatches = product.availableColors.slice(0, 4);
  const overflowSwatchCount = Math.max(0, product.availableColors.length - visibleSwatches.length);

  return (
    <article
      className={cn(
        'group flex flex-col justify-between rounded-[var(--radius-none)] border border-hairline bg-elevated transition-colors duration-[var(--duration-base)] hover:border-strong-border',
        className,
      )}
    >
      <div>
        <div className="relative aspect-[3/4] w-full overflow-hidden border-b border-hairline bg-panel">
          <a
            href={productHref}
            aria-label={mediaUrl ? `Inspect ${product.name}` : undefined}
            className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {mediaUrl ? (
              <img
                src={mediaUrl}
                alt={mediaAlt}
                decoding="async"
                onError={() => setImageError(true)}
                className="h-full w-full object-cover transition-transform duration-[var(--duration-base)] ease-[var(--ease-editorial)] motion-safe:group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-subtle p-6 text-center">
                <svg
                  width="48"
                  height="60"
                  viewBox="0 0 48 60"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  aria-hidden="true"
                  className="text-ink-muted"
                >
                  <rect x="4" y="4" width="40" height="52" />
                  <path d="M14 18h20M14 26h20M18 34h12" />
                </svg>
                <span className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                  <span className="sr-only">Inspect {product.name} in </span>
                  {product.primaryCategory?.name ?? 'ARVEN Studio'}
                </span>
              </div>
            )}
          </a>

          <div className="pointer-events-none absolute top-3 left-3 right-3 flex flex-wrap items-start justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {product.isFeatured ? <Badge tone="info">Featured</Badge> : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {product.stockStatus === 'LOW_STOCK' ? (
                <Badge tone="warning">Low Stock</Badge>
              ) : null}
              {product.stockStatus === 'OUT_OF_STOCK' ? (
                <Badge tone="neutral">Out of Stock</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
              {product.primaryCategory?.name ?? 'Garment'}
            </span>
            {product.collections && product.collections.length > 0 ? (
              <span className="text-xs text-ink-muted">
                {product.collections[0]?.name}
              </span>
            ) : null}
          </div>

          <h3 className="font-display text-lg font-medium leading-snug text-ink">
            <a
              href={productHref}
              className="inline-flex min-h-11 items-center py-1 text-ink hover:text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {product.name}
            </a>
          </h3>

          {product.material || product.fit ? (
            <p className="text-xs leading-relaxed text-ink-secondary">
              {[product.material, product.fit].filter(Boolean).join(' / ')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 border-t border-hairline px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-sm font-medium tabular-nums text-ink">
            {formatIDR(product.priceIdr)}
          </span>
          {hasDiscount && product.compareAtPriceIdr ? (
            <span className="font-mono text-xs tabular-nums text-ink-muted line-through">
              <span className="sr-only">Original price: </span>
              <span>{formatIDR(product.compareAtPriceIdr)}</span>
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          {visibleSwatches.length > 0 ? (
            <div role="group" className="flex items-center gap-1.5" aria-label="Available colors">
              {visibleSwatches.map((swatch) => (
                <span
                  key={swatch.color}
                  title={swatch.color}
                  className="inline-block h-3.5 w-3.5 rounded-full border border-control-border"
                  style={{ backgroundColor: swatch.colorHex || '#17191B' }}
                />
              ))}
              {overflowSwatchCount > 0 ? (
                <span className="font-mono text-xs text-ink-muted">
                  +{overflowSwatchCount}
                </span>
              ) : null}
            </div>
          ) : (
            <span>Single tone</span>
          )}

          {product.availableSizes.length > 0 ? (
            <span className="font-mono text-xs text-ink-muted">
              {product.availableSizes.join(' · ')}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
