'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CustomizationPresetDto,
  Product3DAssetPublicDto,
  ProductDetailDto,
} from '@arven/contracts';
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  IconChevronDown,
  IconMinus,
  IconPlus,
  LinkButton,
  LoadingState,
  ProductCard,
  SizeGuideModal,
  StatusBanner,
  VariantSelector,
  cn,
  formatIDR,
  useToast,
} from '@arven/ui';
import { Product3DViewerIsland } from '@/components/catalog/product-3d-viewer-island';
import { OPEN_CART_DRAWER_EVENT } from '@/components/storefront-shell';
import { ApiClientError, notifyCartUpdated, storefrontApi } from '@/lib/api-client';

export function ProductDetailView({ slug }: { slug: string }) {
  const { toast } = useToast();

  const [product, setProduct] = useState<ProductDetailDto | null>(null);
  const [asset3d, setAsset3d] = useState<Product3DAssetPublicDto | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [addingToBag, setAddingToBag] = useState(false);
  const [addedToBagMessage, setAddedToBagMessage] = useState<string | null>(null);
  const [addToBagError, setAddToBagError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadProduct = useCallback(() => {
    setLoading(true);
    setNotFound(false);
    setError(null);
    setAsset3d(null);
    setViewMode('2d');
    setActivePresetId(null);
    setFallbackNotice(null);
    setQuantity(1);
    setAddedToBagMessage(null);
    setAddToBagError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getProductBySlug(slug)
      .then(async (data) => {
        if (!active) return;
        setProduct(data);
        setNotFound(false);
        setError(null);
        setQuantity(1);
        setAddedToBagMessage(null);
        setAddToBagError(null);
        setViewMode('2d');
        setFallbackNotice(null);
        const initialVariant =
          data.variants.find((v) => v.availableQty > 0) ?? data.variants[0] ?? null;
        setSelectedVariantId(initialVariant?.id ?? null);
        const initialMedia = data.primaryMedia ?? data.media[0] ?? null;
        setSelectedMediaId(initialMedia?.id ?? null);

        if (!data.has3dEnabled) {
          setAsset3d(null);
          setActivePresetId(null);
          if (active) {
            setLoading(false);
          }
          return;
        }

        try {
          const asset = await storefrontApi.getProduct3DAssets(slug);
          if (!active) return;
          setAsset3d(asset);
          const presets = asset?.customizationPresets.filter((p) => p.isActive) ?? [];
          const matchedInitialPreset =
            presets.find(
              (preset) =>
                initialVariant &&
                (preset.variantId === initialVariant.id ||
                  (preset.variantColor &&
                    preset.variantColor.toLowerCase() === initialVariant.color.toLowerCase())),
            ) ??
            presets[0] ??
            null;
          setActivePresetId(matchedInitialPreset?.id ?? null);
        } catch {
          if (!active) return;
          setAsset3d(null);
          setActivePresetId(null);
        } finally {
          if (active) {
            setLoading(false);
          }
        }
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
        setLoading(false);
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

  const activePresets = useMemo(() => {
    if (!asset3d) return [];
    return asset3d.customizationPresets.filter((p) => p.isActive);
  }, [asset3d]);

  const activePreset = useMemo(() => {
    if (activePresets.length === 0 || !activePresetId) return null;
    return activePresets.find((p) => p.id === activePresetId) ?? null;
  }, [activePresetId, activePresets]);

  const has3dControlSurface = Boolean(product && (product.has3dEnabled || asset3d !== null));

  const handleSelectPreset = useCallback(
    (preset: CustomizationPresetDto) => {
      setActivePresetId(preset.id);
      setAddedToBagMessage(null);
      setAddToBagError(null);
      if (!product) return;

      const byId = preset.variantId
        ? product.variants.find((v) => v.id === preset.variantId)
        : undefined;
      const targetColor = preset.variantColor?.trim().toLowerCase();
      const byColor =
        !byId && targetColor
          ? product.variants.find(
              (v) =>
                v.color.toLowerCase() === targetColor &&
                selectedVariant &&
                v.size === selectedVariant.size,
            ) ??
            product.variants.find(
              (v) => v.color.toLowerCase() === targetColor && v.availableQty > 0,
            ) ??
            product.variants.find((v) => v.color.toLowerCase() === targetColor)
          : undefined;
      const matchedVariant = byId ?? byColor;
      if (matchedVariant) {
        setSelectedVariantId(matchedVariant.id);
        setQuantity(1);
      }
    },
    [product, selectedVariant],
  );

  const maxOrderQuantity = selectedVariant
    ? Math.max(0, Math.min(10, selectedVariant.availableQty))
    : 0;
  const clampedQuantity =
    maxOrderQuantity > 0 ? Math.min(Math.max(1, quantity), maxOrderQuantity) : 1;

  const handleAddToBag = async () => {
    if (!product || !selectedVariant) return;
    setAddToBagError(null);
    setAddedToBagMessage(null);

    if (selectedVariant.availableQty <= 0) {
      toast({
        tone: 'warning',
        title: 'Variant currently out of stock',
        description: `${selectedVariant.sku} (${selectedVariant.color} / ${selectedVariant.size}) has 0 available units at JKT-MAIN-01.`,
      });
      return;
    }

    setAddingToBag(true);
    try {
      const updatedCart = await storefrontApi.addCartItem({
        variantId: selectedVariant.id,
        quantity: clampedQuantity,
        ...(activePreset
          ? {
              configuration: {
                colorPresetId: activePreset.id,
                colorPresetCode: activePreset.code,
                colorPresetLabel: activePreset.label,
              },
            }
          : {}),
      });
      notifyCartUpdated(updatedCart);
      const presetSummary = activePreset ? ` / ${activePreset.label}` : '';
      const summary = `Added ${clampedQuantity} x ${product.name} (${selectedVariant.sku} / ${selectedVariant.color} / Size ${selectedVariant.size}${presetSummary}) to your bag.`;
      setAddedToBagMessage(summary);
      toast({
        tone: 'success',
        title: 'Added to Bag',
        description: `${clampedQuantity} x ${selectedVariant.sku} (${selectedVariant.size}, ${selectedVariant.color}${presetSummary}) added at ${formatIDR(selectedVariant.priceIdr)}.`,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setAddToBagError({ message: err.message, requestId: err.requestId });
      } else {
        setAddToBagError({ message: 'Unable to add this garment to your bag right now.' });
      }
    } finally {
      setAddingToBag(false);
    }
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
    <div className="space-y-14">
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

      {/* Main 7:5 Editorial PDP Split */}
      {has3dControlSurface ? (
        <a
          href="#pdp-purchase-controls"
          className="fixed top-3 left-3 z-[var(--z-toast)] inline-flex min-h-11 -translate-y-[250%] items-center rounded-[var(--radius-xs)] border border-strong-border bg-inverse px-4 py-2 text-sm font-semibold text-ink-inverse shadow-[var(--shadow-raised)] transition-transform duration-[var(--duration-fast)] focus:translate-y-0 focus-visible:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Lewati Tampilan 3D
        </a>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-12">
        {/* Left Column (7 cols): 2D Studio Gallery & Progressive 3D Viewer */}
        <section aria-label="Product media gallery" className="space-y-4 lg:col-span-7">
          {has3dControlSurface ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Mode Tampilan Produk"
                className="inline-flex items-center border border-control-border bg-subtle p-1"
              >
                <button
                  type="button"
                  aria-pressed={viewMode === '2d'}
                  onClick={() => {
                    setViewMode('2d');
                    setFallbackNotice(null);
                  }}
                  className={cn(
                    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-xs)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.05em] transition-[background-color,color] cursor-pointer',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    viewMode === '2d'
                      ? 'bg-inverse text-ink-inverse'
                      : 'text-ink-secondary hover:text-ink',
                  )}
                >
                  Foto 2D
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === '3d'}
                  onClick={() => {
                    setFallbackNotice(null);
                    setViewMode('3d');
                  }}
                  className={cn(
                    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-xs)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.05em] transition-[background-color,color] cursor-pointer',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    viewMode === '3d'
                      ? 'bg-inverse text-ink-inverse'
                      : 'text-ink-secondary hover:text-ink',
                  )}
                >
                  Model 3D
                </button>
              </div>
              {asset3d ? (
                <span className="type-sku text-ink-muted">
                  3D Studio v{String(asset3d.version).padStart(4, '0')}
                </span>
              ) : null}
            </div>
          ) : null}

          {fallbackNotice ? (
            <StatusBanner
              tone="info"
              title="Mode 2D Studio Aktif"
              description="Perangkat ini tidak mendukung WebGL penuh, sehingga menampilkan poster studio. Pemilihan preset, varian, ukuran, dan Tambah ke Tas tetap berfungsi normal."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setViewMode('2d');
                    setFallbackNotice(null);
                  }}
                >
                  Tampilkan Galeri 2D
                </Button>
              }
            />
          ) : null}

          {viewMode === '3d' && asset3d !== null ? (
            <Product3DViewerIsland
              asset={asset3d}
              activePresetId={activePresetId}
              onFallbackTo2D={(reason) => {
                if (reason === 'user_switched_to_2d') {
                  setViewMode('2d');
                  setFallbackNotice(null);
                } else {
                  setFallbackNotice(reason);
                }
              }}
            />
          ) : (
            <>
              {viewMode === '3d' && asset3d === null ? (
                <StatusBanner
                  tone="info"
                  title="Model 3D belum tersedia"
                  description="Menampilkan galeri studio 2D. Anda tetap dapat memilih varian dan menambahkan produk ke tas."
                />
              ) : null}

              <div className="relative aspect-[3/4] w-full overflow-hidden border border-hairline bg-subtle">
                {activeMedia ? (
                  <img
                    src={activeMedia.url}
                    alt={activeMedia.altText || product.name}
                    className="block h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-subtle p-8 text-center">
                    <span className="font-display text-3xl tracking-[0.18em] uppercase text-ink">
                      ARVEN
                    </span>
                    <span className="text-sm text-ink-muted">{product.name}</span>
                  </div>
                )}

                {product.isFeatured ? (
                  <div className="pointer-events-none absolute bottom-3 left-3">
                    <span className="inline-flex items-center border border-hairline bg-canvas px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.05em] text-ink">
                      Featured
                    </span>
                  </div>
                ) : null}
              </div>

              {product.media.length > 1 ? (
                <div
                  role="group"
                  aria-label="Gallery view selector"
                  className="grid grid-cols-4 gap-3 sm:grid-cols-5"
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
                          'group relative aspect-[3/4] min-h-11 min-w-11 overflow-hidden border bg-subtle transition-colors cursor-pointer',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                          isSelected
                            ? 'border-2 border-strong-border'
                            : 'border-hairline hover:border-strong-border',
                        )}
                      >
                        <img
                          src={media.url}
                          alt={media.altText}
                          className="block h-full w-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </section>

        {/* Right Column (5 cols): Sticky Specifications & Purchase Controls */}
        <section
          id="pdp-purchase-controls"
          tabIndex={-1}
          aria-label="Product details and selection"
          className="space-y-6 lg:sticky lg:top-24 lg:col-span-5 focus:outline-none"
        >
          <div className="space-y-3 border-b border-hairline pb-6">
            <div className="flex flex-wrap items-center gap-2">
              {product.primaryCategory ? (
                <Link
                  href={`/shop/${product.primaryCategory.slug}`}
                  className="type-eyebrow inline-flex min-h-11 items-center text-link hover:underline"
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

            <h1 className="type-h1 text-ink">{product.name}</h1>

            <div className="flex flex-wrap items-baseline justify-between gap-4 pt-1">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-2xl font-semibold tabular-nums text-ink">
                  {formatIDR(displayPriceIdr)}
                </span>
                {hasDiscount && displayCompareAtIdr ? (
                  <del
                    aria-label={`Original price ${formatIDR(displayCompareAtIdr)}`}
                    className="text-sm tabular-nums text-ink-muted line-through"
                  >
                    {formatIDR(displayCompareAtIdr)}
                  </del>
                ) : null}
              </div>

              {selectedVariant ? (
                <span className="type-sku text-ink-muted">
                  SKU: <strong className="font-medium text-ink">{selectedVariant.sku}</strong>
                </span>
              ) : null}
            </div>

            <p className="type-ui leading-relaxed text-ink-secondary">{product.description}</p>
          </div>

          {/* Material & Color Presets (Server-driven 3D & Variant Sync) */}
          {activePresets.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="type-eyebrow text-ink">Material &amp; Color Presets</span>
                {activePreset ? (
                  <span className="text-xs font-medium text-ink-secondary">
                    {activePreset.label}
                  </span>
                ) : null}
              </div>
              <div
                role="radiogroup"
                aria-label="Material and color presets"
                className="flex flex-wrap items-center gap-2.5"
              >
                {activePresets.map((preset, presetIdx) => {
                  const isSelected = activePreset?.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleSelectPreset(preset)}
                      onKeyDown={(event) => {
                        if (activePresets.length <= 1) return;
                        let targetIdx: number | null = null;
                        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                          targetIdx = (presetIdx + 1) % activePresets.length;
                        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                          targetIdx = (presetIdx - 1 + activePresets.length) % activePresets.length;
                        } else if (event.key === 'Home') {
                          targetIdx = 0;
                        } else if (event.key === 'End') {
                          targetIdx = activePresets.length - 1;
                        }
                        if (targetIdx === null) return;
                        event.preventDefault();
                        const nextPreset = activePresets[targetIdx];
                        if (nextPreset) {
                          handleSelectPreset(nextPreset);
                          const radios =
                            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                              '[role="radio"]',
                            );
                          radios?.[targetIdx]?.focus();
                        }
                      }}
                      className={cn(
                        'inline-flex min-h-11 min-w-11 items-center gap-2.5 rounded-[var(--radius-xs)] border px-3.5 py-2 text-xs font-medium transition-[background-color,border-color,color] cursor-pointer',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                        isSelected
                          ? 'border-2 border-strong-border bg-panel text-ink font-semibold'
                          : 'border-control-border bg-elevated text-ink-secondary hover:border-strong-border hover:text-ink',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-4 w-4 shrink-0 rounded-full border border-control-border"
                        style={{ backgroundColor: preset.swatchHex }}
                      />
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Interactive Color & Size Variant Selector */}
          <VariantSelector
            variants={product.variants}
            selectedVariantId={selectedVariant?.id ?? null}
            onSelectVariant={(variant) => {
              setSelectedVariantId(variant.id);
              setQuantity(1);
              setAddedToBagMessage(null);
              setAddToBagError(null);
              if (activePresets.length > 0) {
                const matchedPreset =
                  activePresets.find((p) => p.variantId === variant.id) ??
                  activePresets.find(
                    (p) =>
                      p.variantColor &&
                      p.variantColor.toLowerCase() === variant.color.toLowerCase(),
                  );
                if (matchedPreset) {
                  setActivePresetId(matchedPreset.id);
                }
              }
            }}
          />

          {/* Quantity Stepper */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-eyebrow text-ink">Quantity</span>
              {selectedVariant && selectedVariant.availableQty > 0 ? (
                <span className="text-xs tabular-nums text-ink-muted">
                  Max {maxOrderQuantity} per order ({selectedVariant.availableQty} available)
                </span>
              ) : (
                <span className="text-xs text-ink-muted">Unavailable</span>
              )}
            </div>
            <div className="inline-flex items-center rounded-[var(--radius-xs)] border border-control-border bg-elevated">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={
                  !selectedVariant ||
                  selectedVariant.availableQty <= 0 ||
                  clampedQuantity <= 1 ||
                  addingToBag
                }
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                className="inline-flex min-h-11 min-w-11 items-center justify-center border-r border-control-border text-ink transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
              >
                <IconMinus size={15} />
              </button>
              <span
                role="status"
                aria-live="polite"
                aria-label={`Selected quantity ${selectedVariant && selectedVariant.availableQty > 0 ? clampedQuantity : 0}`}
                className="inline-flex min-h-11 min-w-12 items-center justify-center px-3 text-sm font-semibold tabular-nums text-ink"
              >
                {selectedVariant && selectedVariant.availableQty > 0 ? clampedQuantity : 0}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={
                  !selectedVariant ||
                  selectedVariant.availableQty <= 0 ||
                  clampedQuantity >= maxOrderQuantity ||
                  addingToBag
                }
                onClick={() =>
                  setQuantity((prev) => Math.min(maxOrderQuantity, Math.max(1, prev + 1)))
                }
                className="inline-flex min-h-11 min-w-11 items-center justify-center border-l border-control-border text-ink transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
              >
                <IconPlus size={15} />
              </button>
            </div>
          </div>

          {/* Primary Action Bar & Size Guide Trigger */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={addingToBag}
              loadingLabel="Adding to Bag"
              disabled={!selectedVariant || selectedVariant.availableQty <= 0}
              onClick={() => void handleAddToBag()}
            >
              {!selectedVariant || selectedVariant.availableQty <= 0
                ? 'Currently Out of Stock'
                : 'Add to Bag'}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="shrink-0 whitespace-nowrap"
              onClick={() => setSizeGuideOpen(true)}
            >
              Size Guide
            </Button>
          </div>

          {addToBagError ? (
            <StatusBanner
              tone="danger"
              title="Unable to add to bag"
              description={addToBagError.message}
              requestId={addToBagError.requestId}
            />
          ) : null}

          {addedToBagMessage ? (
            <StatusBanner
              tone="success"
              title="Added to Bag"
              description={addedToBagMessage}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent(OPEN_CART_DRAWER_EVENT));
                      }
                    }}
                  >
                    Open Bag
                  </Button>
                  <LinkButton href="/cart" variant="secondary" size="sm">
                    View Bag
                  </LinkButton>
                </div>
              }
            />
          ) : null}

          <Divider />

          {/* Native Editorial Disclosure Accordions (content-first noise reduction) */}
          <div className="divide-y divide-hairline border-b border-hairline">
            <details open className="group py-3.5">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                <span>Material &amp; Composition</span>
                <IconChevronDown
                  size={16}
                  className="shrink-0 text-ink-muted transition-transform duration-[var(--duration-fast)] group-open:rotate-180"
                />
              </summary>
              <p className="pt-2 pb-1 text-sm leading-relaxed text-ink-secondary">
                {product.material}
              </p>
            </details>

            <details open className="group py-3.5">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                <span>Fit &amp; Silhouette</span>
                <IconChevronDown
                  size={16}
                  className="shrink-0 text-ink-muted transition-transform duration-[var(--duration-fast)] group-open:rotate-180"
                />
              </summary>
              <p className="pt-2 pb-1 text-sm leading-relaxed text-ink-secondary">{product.fit}</p>
            </details>

            <details className="group py-3.5">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                <span>Care Instructions</span>
                <IconChevronDown
                  size={16}
                  className="shrink-0 text-ink-muted transition-transform duration-[var(--duration-fast)] group-open:rotate-180"
                />
              </summary>
              <p className="pt-2 pb-1 text-sm leading-relaxed text-ink-secondary">
                {product.careInstruction}
              </p>
            </details>

            <details className="group py-3.5">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                <span>Jakarta Studio Dispatch</span>
                <IconChevronDown
                  size={16}
                  className="shrink-0 text-ink-muted transition-transform duration-[var(--duration-fast)] group-open:rotate-180"
                />
              </summary>
              <p className="pt-2 pb-1 text-sm leading-relaxed text-ink-secondary">
                Dispatched directly from Jakarta Atelier Main (JKT-MAIN-01) with live inventory
                verification and insured domestic shipping.
              </p>
            </details>
          </div>
        </section>
      </div>

      {/* Related Garments */}
      {product.relatedProducts.length > 0 ? (
        <section
          aria-labelledby="related-garments-heading"
          className="space-y-8 border-t border-hairline pt-12"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1.5">
              <p className="type-eyebrow text-ink-muted">Complementary Silhouettes</p>
              <h2 id="related-garments-heading" className="type-display-lg text-ink">
                Pair With
              </h2>
            </div>
            <Link
              href="/shop"
              className="editorial-link inline-flex min-h-11 items-center text-sm font-medium text-ink hover:text-link"
            >
              Explore Full Catalog
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-10 min-[480px]:grid-cols-2 lg:grid-cols-4">
            {product.relatedProducts.map((related) => (
              <ProductCard key={related.id} product={related} />
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
