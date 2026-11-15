'use client';

import { useMemo } from 'react';
import { cn } from '../lib/cn.js';
import { formatIDR } from '../lib/format.js';
import { Badge } from './badge.js';
import type { CatalogStockStatus } from './product-card.js';

export interface CatalogVariantOption {
  id: string;
  sku: string;
  size: string;
  color: string;
  colorHex: string | null;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  weightGrams: number;
  availableQty: number;
  lowStockThreshold: number;
  stockStatus: CatalogStockStatus;
}

export interface VariantSelectorProps {
  variants: readonly CatalogVariantOption[];
  selectedVariantId: string | null;
  onSelectVariant: (variant: CatalogVariantOption) => void;
  className?: string;
}

export function VariantSelector({
  variants,
  selectedVariantId,
  onSelectVariant,
  className,
}: VariantSelectorProps) {
  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return null;
    return (
      variants.find((v) => v.id === selectedVariantId) ??
      variants.find((v) => v.availableQty > 0) ??
      variants[0] ??
      null
    );
  }, [selectedVariantId, variants]);

  const uniqueColors = useMemo(() => {
    const map = new Map<string, { color: string; colorHex: string | null; hasStock: boolean }>();
    for (const v of variants) {
      const existing = map.get(v.color);
      if (!existing) {
        map.set(v.color, {
          color: v.color,
          colorHex: v.colorHex,
          hasStock: v.availableQty > 0,
        });
      } else if (v.availableQty > 0) {
        existing.hasStock = true;
      }
    }
    return Array.from(map.values());
  }, [variants]);

  const uniqueSizes = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const v of variants) {
      if (!seen.has(v.size)) {
        seen.add(v.size);
        list.push(v.size);
      }
    }
    return list;
  }, [variants]);

  const activeColor = selectedVariant?.color ?? uniqueColors[0]?.color ?? '';
  const activeSize = selectedVariant?.size ?? uniqueSizes[0] ?? '';

  const handleSelectColor = (color: string) => {
    const exactMatch = variants.find((v) => v.color === color && v.size === activeSize);
    if (exactMatch) {
      onSelectVariant(exactMatch);
      return;
    }
    const firstInStock = variants.find((v) => v.color === color && v.availableQty > 0);
    const fallback = firstInStock ?? variants.find((v) => v.color === color);
    if (fallback) {
      onSelectVariant(fallback);
    }
  };

  const handleSelectSize = (size: string) => {
    const exactMatch = variants.find((v) => v.color === activeColor && v.size === size);
    if (exactMatch) {
      onSelectVariant(exactMatch);
      return;
    }
    const fallback = variants.find((v) => v.size === size);
    if (fallback) {
      onSelectVariant(fallback);
    }
  };

  if (variants.length === 0) {
    return (
      <div className={cn('rounded-[var(--radius-sm)] border border-hairline bg-subtle p-4', className)}>
        <p className="text-sm text-ink-muted">No active variants configured for this garment.</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Color Selector */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
          Color: <span className="font-normal text-ink-secondary">{activeColor}</span>
        </legend>
        <div className="flex flex-wrap items-center gap-2.5">
          {uniqueColors.map((item) => {
            const isSelected = activeColor === item.color;
            return (
              <button
                key={item.color}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleSelectColor(item.color)}
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center gap-2.5 rounded-[var(--radius-sm)] border px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  isSelected
                    ? 'border-2 border-strong-border bg-panel text-ink font-semibold'
                    : 'border-control-border bg-elevated text-ink-secondary hover:border-strong-border hover:text-ink',
                )}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-4 shrink-0 rounded-full border border-control-border"
                  style={{ backgroundColor: item.colorHex || '#17191B' }}
                />
                <span>{item.color}</span>
                {!item.hasStock ? (
                  <span className="text-xs text-ink-muted">(Out of Stock)</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Size Selector */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
          Size: <span className="font-normal text-ink-secondary">{activeSize}</span>
        </legend>
        <div className="flex flex-wrap items-center gap-2.5">
          {uniqueSizes.map((size) => {
            const matchingVariant =
              variants.find((v) => v.color === activeColor && v.size === size) ??
              variants.find((v) => v.size === size);
            const isSelected = selectedVariant?.size === size;
            const isOutOfStock = !matchingVariant || matchingVariant.availableQty <= 0;

            return (
              <button
                key={size}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleSelectSize(size)}
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  isSelected
                    ? 'border-2 border-strong-border bg-inverse text-ink-inverse font-semibold'
                    : isOutOfStock
                      ? 'border-control-border bg-subtle text-ink-muted line-through hover:border-strong-border'
                      : 'border-control-border bg-elevated text-ink hover:border-strong-border hover:bg-panel',
                )}
              >
                <span>{size}</span>
                {isOutOfStock ? (
                  <span className="sr-only"> (Out of Stock)</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Live Selected Variant Summary */}
      {selectedVariant ? (
        <div
          aria-live="polite"
          className="space-y-3 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="font-mono text-xs text-ink">
                SKU: <span className="font-medium">{selectedVariant.sku}</span>
              </p>
              <p className="font-mono text-xs text-ink-muted">
                Weight: {selectedVariant.weightGrams} g
              </p>
            </div>

            <div className="text-right">
              <p className="font-mono text-base font-semibold tabular-nums text-ink">
                {formatIDR(selectedVariant.priceIdr)}
              </p>
              {selectedVariant.compareAtPriceIdr &&
              selectedVariant.compareAtPriceIdr > selectedVariant.priceIdr ? (
                <p className="font-mono text-xs tabular-nums text-ink-muted line-through">
                  {formatIDR(selectedVariant.compareAtPriceIdr)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
              Availability
            </span>
            {selectedVariant.stockStatus === 'IN_STOCK' ? (
              <Badge tone="success">
                In Stock ({selectedVariant.availableQty} available)
              </Badge>
            ) : selectedVariant.stockStatus === 'LOW_STOCK' ? (
              <Badge tone="warning">
                Low Stock - Only {selectedVariant.availableQty} left
              </Badge>
            ) : (
              <Badge tone="danger">Out of Stock</Badge>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
