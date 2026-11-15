'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProductDetailDto } from '@arven/contracts';
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  ProductCard,
  SizeGuideModal,
  StatusBanner,
  Surface,
  VariantSelector,
  cn,
  formatIDR,
  useToast,
} from '@arven/ui';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

export function ProductDetailView({ slug }: { slug: string }) {
  const { toast } = useToast();

  const [product, setProduct] = useState<ProductDetailDto | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [selectionConfirmedMessage, setSelectionConfirmedMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadProduct = useCallback(() => {
    setLoading(true);
    setNotFound(false);
    setError(null);
    setSelectionConfirmedMessage(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getProductBySlug(slug)
      .then((data) => {
        if (!active) return;
        setProduct(data);
        setNotFound(false);
        setError(null);
        setSelectionConfirmedMessage(null);
        const initialVariant =
          data.variants.find((v) => v.availableQty > 0) ?? data.variants[0] ?? null;
        setSelectedVariantId(initialVariant?.id ?? null);
        const initialMedia = data.primaryMedia ?? data.media[0] ?? null;
        setSelectedMediaId(initialMedia?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 404) {
          setNotFound(true);
        } else if (err instanceof ApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load product details right now.' });
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

  const selectedVariant = useMemo(() => {
    if (!product || product.variants.length === 0) return null;
    return (
      product.variants.find((v) => v.id === selectedVariantId) ??
      product.variants.find((v) => v.availableQty > 0) ??
      product.variants[0] ??
      null
    );
  }, [product, selectedVariantId]);

  const activeMedia = useMemo(() => {
    if (!product) return null;
    return (
      product.media.find((m) => m.id === selectedMediaId) ??
      product.primaryMedia ??
      product.media[0] ??
      null
    );
  }, [product, selectedMediaId]);

  const handleConfirmSelection = () => {
    if (!product || !selectedVariant) return;
    if (selectedVariant.availableQty <= 0) {
      toast({
        tone: 'warning',
        title: 'Variant currently out of stock',
        description: `${selectedVariant.sku} (${selectedVariant.color} / ${selectedVariant.size}) has 0 available units at JKT-MAIN-01.`,
      });
      return;
    }

    const summary = `Selected ${product.name} (${selectedVariant.sku} / ${selectedVariant.color} / Size ${selectedVariant.size}) at ${formatIDR(selectedVariant.priceIdr)}. Cart and checkout bag allocation opens in Phase 04.`;
    setSelectionConfirmedMessage(summary);
    toast({
      tone: 'success',
      title: 'Variant specification verified',
      description: `${selectedVariant.sku} (${selectedVariant.size}, ${selectedVariant.color}) ready at ${formatIDR(selectedVariant.priceIdr)}.`,
    });
  };

  if (loading) {
    return (
      <LoadingState
        label="Loading garment specification and gallery"
        rows={6}
        className="min-h-[85dvh]"
      />
    );
  }

  if (notFound) {
    return (
      <EmptyState
        title="Product not found"
        description={`The garment "${slug}" is unavailable, unpublished, or removed from the active catalog.`}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <LinkButton href="/shop" variant="primary" size="md">
              Return to Shop
            </LinkButton>
            <LinkButton href="/search" variant="secondary" size="md">
              Search Catalog
            </LinkButton>
          </div>
        }
      />
    );
  }

  if (error || !product) {
    return (
      <ErrorState
        title="Unable to load garment details"
        message={error?.message ?? 'Unexpected error loading product.'}
        requestId={error?.requestId}
        onRetry={() => void loadProduct()}
      />
    );
  }

  const displayPriceIdr = selectedVariant?.priceIdr ?? product.priceIdr;
  const displayCompareAtIdr = selectedVariant?.compareAtPriceIdr ?? product.compareAtPriceIdr;
  const hasDiscount = typeof displayCompareAtIdr === 'number' && displayCompareAtIdr > displayPriceIdr;

  return (
    <div className="space-y-12">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Link href="/" className="inline-flex min-h-11 items-center px-1 hover:text-ink hover:underline">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href="/shop"
          className="inline-flex min-h-11 items-center px-1 hover:text-ink hover:underline"
        >
          Shop
        </Link>
        {product.primaryCategory ? (
          <>
            <span aria-hidden="true">/</span>
            <Link
              href={`/shop/${product.primaryCategory.slug}`}
              className="inline-flex min-h-11 items-center px-1 hover:text-ink hover:underline"
            >
              {product.primaryCategory.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <span className="font-medium text-ink">{product.name}</span>
      </nav>

      {/* Main 2-Column PDP Layout */}
      <div className="grid gap-10 lg:grid-cols-12">
        {/* Left Column: 2D Studio Gallery */}
        <section aria-label="Product media gallery" className="space-y-4 lg:col-span-6">
          <div className="relative aspect-[3/4] w-full overflow-hidden border border-hairline bg-panel">
            {activeMedia ? (
              <img
                src={activeMedia.url}
                alt={activeMedia.altText || product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-subtle p-8 text-center">
                <span className="font-display text-2xl text-ink-muted">{product.name}</span>
              </div>
            )}

            <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
              {activeMedia ? <Badge tone="neutral">{activeMedia.type}</Badge> : null}
              {product.isFeatured ? <Badge tone="info">Featured</Badge> : null}
            </div>
          </div>

          {product.media.length > 1 ? (
            <div
              role="group"
              aria-label="Gallery view selector"
              className="grid grid-cols-3 gap-3 sm:grid-cols-4"
            >
              {product.media.map((media, idx) => {
                const isSelected = activeMedia?.id === media.id;
                return (
                  <button
                    key={media.id}
                    type="button"
                    aria-label={`View image ${idx + 1}: ${media.altText}`}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => setSelectedMediaId(media.id)}
                    className={cn(
                      'group relative min-h-11 min-w-11 overflow-hidden border bg-panel transition-colors cursor-pointer',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                      isSelected
                        ? 'border-2 border-strong-border'
                        : 'border-hairline hover:border-strong-border',
                    )}
                  >
                    <img
                      src={media.url}
                      alt={media.altText}
                      className="aspect-[3/4] w-full object-cover"
                    />
                    <span className="block border-t border-hairline bg-canvas px-2 py-1 text-left font-mono text-xs text-ink-muted">
                      {media.type}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        {/* Right Column: Specifications & Variant Selector */}
        <section aria-label="Product details and selection" className="space-y-6 lg:col-span-6">
          <div className="space-y-3 border-b border-hairline pb-6">
            <div className="flex flex-wrap items-center gap-2">
              {product.primaryCategory ? (
                <Link
                  href={`/shop/${product.primaryCategory.slug}`}
                  className="inline-flex min-h-11 items-center text-xs font-semibold uppercase tracking-[0.06em] text-link hover:underline"
                >
                  {product.primaryCategory.name}
                </Link>
              ) : null}
              {product.collections.map((col) => (
                <Link
                  key={col.id}
                  href={`/collections/${col.slug}`}
                  className="inline-flex min-h-11 items-center"
                >
                  <Badge tone="neutral">{col.name}</Badge>
                </Link>
              ))}
            </div>

            <h1 className="font-display text-3xl font-normal leading-tight tracking-[-0.015em] text-ink sm:text-4xl">
              {product.name}
            </h1>

            <div className="flex flex-wrap items-baseline justify-between gap-4 pt-1">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-2xl font-medium tabular-nums text-ink">
                  {formatIDR(displayPriceIdr)}
                </span>
                {hasDiscount && displayCompareAtIdr ? (
                  <span className="font-mono text-sm tabular-nums text-ink-muted line-through">
                    <span className="sr-only">Original price: </span>
                    {formatIDR(displayCompareAtIdr)}
                  </span>
                ) : null}
              </div>

              {selectedVariant ? (
                <span className="font-mono text-xs text-ink-muted">
                  SKU: <strong className="font-medium text-ink">{selectedVariant.sku}</strong>
                </span>
              ) : null}
            </div>

            <p className="text-sm leading-relaxed text-ink-secondary">{product.description}</p>
          </div>

          {/* Interactive Color & Size Variant Selector */}
          <VariantSelector
            variants={product.variants}
            selectedVariantId={selectedVariant?.id ?? null}
            onSelectVariant={(variant) => {
              setSelectedVariantId(variant.id);
              setSelectionConfirmedMessage(null);
            }}
          />

          {/* Primary Action Bar & Size Guide Trigger */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              disabled={!selectedVariant || selectedVariant.availableQty <= 0}
              onClick={handleConfirmSelection}
            >
              {!selectedVariant || selectedVariant.availableQty <= 0
                ? 'Currently Out of Stock'
                : 'Select Variant Specification'}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => setSizeGuideOpen(true)}
            >
              Size Guide
            </Button>
          </div>

          {selectionConfirmedMessage ? (
            <StatusBanner
              tone="success"
              title="Specification Locked"
              description={selectionConfirmedMessage}
            />
          ) : null}

          <Divider />

          {/* Architectural Craft & Care Specifications */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Surface variant="subtle" border="hairline" padding="md" className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Material &amp; Composition
              </h2>
              <p className="text-sm leading-relaxed text-ink">{product.material}</p>
            </Surface>

            <Surface variant="subtle" border="hairline" padding="md" className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Fit &amp; Silhouette
              </h2>
              <p className="text-sm leading-relaxed text-ink">{product.fit}</p>
            </Surface>

            <Surface variant="subtle" border="hairline" padding="md" className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Care Instructions
              </h2>
              <p className="text-sm leading-relaxed text-ink">{product.careInstruction}</p>
            </Surface>

            <Surface variant="subtle" border="hairline" padding="md" className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Warehouse Dispatch
              </h2>
              <p className="text-sm leading-relaxed text-ink">
                Jakarta Atelier Main (JKT-MAIN-01). Verified physical inventory check before checkout.
              </p>
            </Surface>
          </div>
        </section>
      </div>

      {/* Related Garments */}
      {product.relatedProducts.length > 0 ? (
        <section aria-labelledby="related-garments-heading" className="space-y-6 border-t border-hairline pt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                Complementary Silhouettes
              </p>
              <h2
                id="related-garments-heading"
                className="font-display text-2xl font-normal text-ink sm:text-3xl"
              >
                Related Garments
              </h2>
            </div>
            <Link
              href="/shop"
              className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
            >
              View Complete Catalog
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-4">
            {product.relatedProducts.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}

      <SizeGuideModal
        isOpen={sizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
        productName={product.name}
        categoryName={product.primaryCategory?.name}
        sizeGuide={product.sizeGuide}
      />
    </div>
  );
}
