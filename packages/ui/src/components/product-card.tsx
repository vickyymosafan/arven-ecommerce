'use client';

import { useState } from 'react';
import { cn } from '../lib/cn.js';
import { formatIDR } from '../lib/format.js';

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
        'group flex flex-col justify-between bg-canvas transition-colors duration-[var(--duration-base)]',
        className,
      )}
    >
      <div className="space-y-3.5">
        {/* 3:4 Editorial Media Well */}
        <div className="relative aspect-[3/4] w-full overflow-hidden border border-hairline bg-subtle transition-colors duration-[var(--duration-base)] group-hover:border-strong-border">
          <a
            href={productHref}
            aria-label={`Inspect ${product.name}`}
            className="relative block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          >
            {mediaUrl ? (
              <img
                src={mediaUrl}
                alt={mediaAlt}
                decoding="async"
                onError={() => setImageError(true)}
                className="block h-full w-full object-cover transition-transform duration-[var(--duration-editorial)] ease-[var(--ease-editorial)] motion-safe:group-hover:scale-[1.03]"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-between bg-subtle px-6 pt-6 pb-12 text-center">
                <span className="type-eyebrow text-ink-muted">
                  {product.primaryCategory?.name ?? 'ARVEN Archive'}
                </span>
                <div className="space-y-2 border-y border-hairline px-4 py-5">
                  <span className="block font-display text-2xl font-normal tracking-[0.18em] uppercase text-ink">
                    ARVEN
                  </span>
                  <span className="block text-xs text-ink-muted">
                    Studio Silhouette Study
                  </span>
                  <span className="block pt-1 text-xs font-medium text-ink-secondary">
                    {product.fit || 'Architectural Fit'}
                  </span>
                </div>
                <span aria-hidden="true" className="h-1" />
              </div>
            )}
          </a>

          {/* Opaque Architectural Indicator Chips (pinned bottom-left to never obscure top artwork headers) */}
          {(product.has3dEnabled ||
            product.isFeatured ||
            product.stockStatus === 'LOW_STOCK' ||
            product.stockStatus === 'OUT_OF_STOCK') ? (
            <div className="pointer-events-none absolute right-2.5 bottom-2.5 left-2.5 flex flex-wrap items-end justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {product.isFeatured ? (
                  <span className="inline-flex items-center border border-hairline bg-canvas px-2 py-1 text-xs font-semibold uppercase tracking-[0.05em] leading-none text-ink">
                    Featured
                  </span>
                ) : null}
                {product.has3dEnabled ? (
                  <span className="inline-flex items-center border border-gold-border bg-gold-bg px-2 py-1 text-xs font-semibold uppercase tracking-[0.05em] leading-none text-gold-fg">
                    3D View
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {product.stockStatus === 'LOW_STOCK' ? (
                  <span className="inline-flex items-center border border-warning-fg/40 bg-warning-bg px-2 py-1 text-xs font-semibold uppercase tracking-[0.05em] leading-none text-warning-fg">
                    Low Stock
                  </span>
                ) : null}
                {product.stockStatus === 'OUT_OF_STOCK' ? (
                  <span className="inline-flex items-center border border-control-border bg-panel px-2 py-1 text-xs font-semibold uppercase tracking-[0.05em] leading-none text-ink">
                    Out of Stock
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Gallery Metadata Block */}
        <div className="space-y-1.5 px-0.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
            <span className="font-semibold uppercase tracking-[0.05em]">
              {product.primaryCategory?.name ?? 'Garment'}
            </span>
            {product.collections && product.collections.length > 0 ? (
              <span>{product.collections[0]?.name}</span>
            ) : null}
          </div>

          <h3 className="font-display text-xl font-normal leading-snug text-ink">
            <a
              href={productHref}
              className="inline-flex min-h-11 items-center text-ink transition-colors hover:text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {product.name}
            </a>
          </h3>

          {product.material || product.fit ? (
            <p className="text-xs leading-relaxed text-ink-muted">
              {[product.material, product.fit].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
      </div>

      {/* Price & Variant Footer */}
      <div className="mt-3 space-y-2.5 border-t border-hairline px-0.5 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums text-ink">
            {formatIDR(product.priceIdr)}
          </span>
          {hasDiscount && product.compareAtPriceIdr ? (
            <del
              aria-label={`Original price ${formatIDR(product.compareAtPriceIdr)}`}
              className="text-xs tabular-nums text-ink-muted line-through"
            >
              {formatIDR(product.compareAtPriceIdr)}
            </del>
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
                <span className="tabular-nums text-xs text-ink-muted">
                  +{overflowSwatchCount}
                </span>
              ) : null}
            </div>
          ) : (
            <span>Single tone</span>
          )}

          {product.availableSizes.length > 0 ? (
            <span className="tabular-nums text-xs text-ink-muted">
              {product.availableSizes.join(' · ')}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
