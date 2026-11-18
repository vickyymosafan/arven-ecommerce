'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CartAvailabilityIssueCode, CartDto, CartItemDto } from '@arven/contracts';
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  StatusBanner,
  Surface,
  buttonClassName,
  formatIDR,
  useToast,
} from '@arven/ui';
import { ApiClientError, notifyCartUpdated, storefrontApi } from '@/lib/api-client';

function availabilityIssueBadge(
  issueCode: CartAvailabilityIssueCode | null,
): { label: string; tone: 'warning' | 'danger' } {
  switch (issueCode) {
    case 'INSUFFICIENT_STOCK':
      return { label: 'Limited Stock', tone: 'warning' };
    case 'OUT_OF_STOCK':
      return { label: 'Out of Stock', tone: 'danger' };
    case 'VARIANT_INACTIVE':
      return { label: 'Variant Inactive', tone: 'danger' };
    case 'PRODUCT_UNAVAILABLE':
    default:
      return { label: 'Unavailable', tone: 'danger' };
  }
}

function CartItemThumbnail({
  item,
  broken,
  onImageError,
}: {
  item: CartItemDto;
  broken: boolean;
  onImageError: (itemId: string) => void;
}) {
  const imageUrl = !broken && item.primaryImageUrl ? item.primaryImageUrl : null;

  return (
    <Link
      href={`/products/${item.productSlug}`}
      aria-label={`Inspect ${item.productName}`}
      className="block aspect-[3/4] w-20 shrink-0 overflow-hidden border border-hairline bg-panel sm:w-24 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={item.primaryImageAlt || item.productName}
          decoding="async"
          onError={() => onImageError(item.id)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-subtle p-2 text-center">
          <svg
            width="28"
            height="36"
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
          <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-muted">
            ARVEN
          </span>
        </div>
      )}
    </Link>
  );
}

export function CartView() {
  const { toast } = useToast();

  const [cart, setCart] = useState<CartDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [actionError, setActionError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [reloadNonce, setReloadNonce] = useState(0);

  const retryLoadCart = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getCart()
      .then((nextCart) => {
        if (!active) return;
        setCart(nextCart);
        setLoadError(null);
        notifyCartUpdated(nextCart);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load your shopping bag right now.' });
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

  const handleImageError = useCallback((itemId: string) => {
    setBrokenImages((prev) => (prev[itemId] ? prev : { ...prev, [itemId]: true }));
  }, []);

  const handleUpdateQuantity = async (item: CartItemDto, nextQuantity: number) => {
    if (nextQuantity < 1 || nextQuantity > 99) return;
    setActionError(null);
    setUpdatingItemId(item.id);
    try {
      const updatedCart = await storefrontApi.updateCartItem(item.id, { quantity: nextQuantity });
      setCart(updatedCart);
      notifyCartUpdated(updatedCart);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setActionError({ message: err.message, requestId: err.requestId });
      } else {
        setActionError({ message: `Unable to update quantity for ${item.productName}.` });
      }
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleRemoveItem = async (item: CartItemDto) => {
    setActionError(null);
    setRemovingItemId(item.id);
    try {
      await storefrontApi.removeCartItem(item.id);
      const refreshedCart = await storefrontApi.getCart();
      setCart(refreshedCart);
      notifyCartUpdated(refreshedCart);
      toast({
        tone: 'success',
        title: 'Removed from Bag',
        description: `${item.productName} (${item.sku}) removed from your bag.`,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setActionError({ message: err.message, requestId: err.requestId });
      } else {
        setActionError({ message: `Unable to remove ${item.productName} from your bag.` });
      }
    } finally {
      setRemovingItemId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[38rem] sm:min-h-[34rem]">
        <LoadingState label="Hydrating your shopping bag and live inventory" rows={4} />
      </div>
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Unable to load your bag"
        message={loadError.message}
        requestId={loadError.requestId}
        retryLabel="Retry"
        onRetry={retryLoadCart}
      />
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="space-y-8">
        <div className="space-y-2 border-b border-hairline pb-6">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Clientele Bag
          </p>
          <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
            Shopping Bag
          </h1>
        </div>

        <EmptyState
          title="Your Bag Is Empty"
          description="Select silhouettes, sizes, and colorways from the ARVEN collection to stage pieces for your order."
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/shop" className={buttonClassName({ variant: 'primary', size: 'md' })}>
                Explore Catalog
              </Link>
              <Link
                href="/collections"
                className={buttonClassName({ variant: 'secondary', size: 'md' })}
              >
                View Capsules
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Clientele Bag
          </p>
          <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
            Shopping Bag
          </h1>
          <p className="text-sm text-ink-muted">
            <span className="font-mono tabular-nums text-ink">{cart.totalQuantity}</span>{' '}
            {cart.totalQuantity === 1 ? 'piece' : 'pieces'} staged with live Jakarta warehouse
            verification.
          </p>
        </div>

        <Badge tone={cart.ownerType === 'USER' ? 'info' : 'neutral'}>
          {cart.ownerType === 'USER' ? 'Saved to Account' : 'Guest Bag'}
        </Badge>
      </div>

      {actionError ? (
        <StatusBanner
          tone="danger"
          title="Bag update failed"
          description={actionError.message}
          requestId={actionError.requestId}
          onDismiss={() => setActionError(null)}
        />
      ) : null}

      {cart.hasUnavailableItems ? (
        <StatusBanner
          tone="warning"
          title="Availability check required"
          description="One or more items in your bag exceed current warehouse availability or are no longer active. Adjust quantities or remove flagged lines before checkout."
        />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        {/* Bag Line Items */}
        <section aria-label="Bag items" className="min-w-0 space-y-4 lg:col-span-8">
          {cart.items.map((item) => {
            const isUpdating = updatingItemId === item.id;
            const isRemoving = removingItemId === item.id;
            const isBusy = isUpdating || isRemoving;
            const maxAllowed = Math.min(99, Math.max(0, item.availableQty));
            const canIncrease =
              !isBusy && item.availableQty > 0 && item.quantity < maxAllowed;
            const canDecrease = !isBusy && item.quantity > 1;
            const hasDiscount =
              typeof item.compareAtIdr === 'number' && item.compareAtIdr > item.unitPriceIdr;
            const issueBadge = !item.isAvailable ? availabilityIssueBadge(item.issueCode) : null;

            return (
              <Surface
                key={item.id}
                variant="elevated"
                border="hairline"
                padding="md"
                className="min-w-0"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <CartItemThumbnail
                      item={item}
                      broken={Boolean(brokenImages[item.id])}
                      onImageError={handleImageError}
                    />

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="space-y-1">
                        <Link
                          href={`/products/${item.productSlug}`}
                          className="inline-flex min-h-11 items-center py-1 font-display text-lg font-normal leading-snug text-ink hover:text-link hover:underline"
                        >
                          {item.productName}
                        </Link>
                        <p className="font-mono text-xs text-ink-muted break-all">
                          SKU: <span className="text-ink">{item.sku}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="inline-block h-3 w-3 shrink-0 rounded-full border border-control-border"
                            style={{ backgroundColor: item.colorHex || '#17191B' }}
                          />
                          <span>{item.color}</span>
                        </span>
                        <span aria-hidden="true" className="text-ink-muted">
                          /
                        </span>
                        <span>Size {item.size}</span>
                      </div>

                      <div className="flex flex-wrap items-baseline gap-2.5 pt-0.5">
                        <span className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-ink">
                          {formatIDR(item.unitPriceIdr)}
                        </span>
                        {hasDiscount && item.compareAtIdr ? (
                          <span className="font-mono text-xs tabular-nums text-ink-muted line-through">
                            <span className="sr-only">Original price: </span>
                            {formatIDR(item.compareAtIdr)}
                          </span>
                        ) : null}
                      </div>

                      {!item.isAvailable && issueBadge ? (
                        <div className="space-y-2 rounded-[var(--radius-xs)] border border-danger-fg/35 bg-danger-bg p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={issueBadge.tone}>{issueBadge.label}</Badge>
                            {item.issueCode === 'INSUFFICIENT_STOCK' && item.availableQty > 0 ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={isBusy}
                                onClick={() =>
                                  void handleUpdateQuantity(item, Math.min(99, item.availableQty))
                                }
                              >
                                Set to {item.availableQty} available
                              </Button>
                            ) : null}
                          </div>
                          <p className="text-xs leading-relaxed text-ink">
                            {item.issueMessage ??
                              'This garment variant requires quantity adjustment or removal.'}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Quantity Controls, Line Subtotal & Remove */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                        Line Subtotal
                      </p>
                      <p className="whitespace-nowrap font-mono text-base font-medium tabular-nums text-ink">
                        {formatIDR(item.lineSubtotalIdr)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        role="group"
                        aria-label={`Quantity controls for ${item.productName}`}
                        className="inline-flex items-center rounded-[var(--radius-sm)] border border-control-border bg-canvas"
                      >
                        <button
                          type="button"
                          aria-label={`Decrease quantity for ${item.productName}`}
                          disabled={!canDecrease}
                          onClick={() => void handleUpdateQuantity(item, item.quantity - 1)}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center border-r border-control-border text-sm font-medium text-ink transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                        >
                          -
                        </button>
                        <span
                          aria-live="polite"
                          className="inline-flex min-h-11 min-w-10 items-center justify-center px-2 font-mono text-sm font-medium tabular-nums text-ink"
                        >
                          {isUpdating ? '...' : item.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase quantity for ${item.productName}`}
                          disabled={!canIncrease}
                          onClick={() => void handleUpdateQuantity(item, item.quantity + 1)}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center border-l border-control-border text-sm font-medium text-ink transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        isLoading={isRemoving}
                        loadingLabel="Removing"
                        disabled={isBusy}
                        onClick={() => void handleRemoveItem(item)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              </Surface>
            );
          })}
        </section>

        {/* Order Summary Panel */}
        <aside aria-label="Bag summary" className="min-w-0 lg:col-span-4 lg:sticky lg:top-24">
          <Surface variant="subtle" border="hairline" padding="lg" className="space-y-5">
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                Summary
              </p>
              <h2 className="font-display text-2xl font-normal text-ink">Bag Totals</h2>
            </div>

            <Divider />

            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Total Pieces</dt>
                <dd className="font-mono font-medium tabular-nums text-ink">
                  {cart.totalQuantity}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Currency</dt>
                <dd className="font-mono text-xs uppercase tracking-[0.06em] text-ink">
                  {cart.currency}
                </dd>
              </div>
            </dl>

            <Divider />

            <dl className="text-sm">
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                  Authoritative Server Subtotal
                </dt>
                <dd className="whitespace-nowrap font-mono text-xl font-medium tabular-nums text-ink">
                  {formatIDR(cart.subtotalIdr)}
                </dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 pt-1">
              {cart.hasUnavailableItems ? (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled
                    aria-describedby="cart-checkout-blocked-reason"
                  >
                    Proceed to Checkout
                  </Button>
                  <p
                    id="cart-checkout-blocked-reason"
                    className="text-xs leading-relaxed text-danger-fg"
                  >
                    One or more items in your bag are out of stock or exceed warehouse
                    availability. Adjust quantities or remove flagged items before checkout.
                  </p>
                </div>
              ) : (
                <LinkButton href="/checkout" variant="primary" size="lg" fullWidth>
                  Proceed to Checkout
                </LinkButton>
              )}

              <LinkButton href="/shop" variant="secondary" size="md" fullWidth>
                Continue Shopping
              </LinkButton>

              {cart.ownerType === 'GUEST' ? (
                <LinkButton href="/auth/login?next=/cart" variant="secondary" size="md" fullWidth>
                  Sign In to Save Bag
                </LinkButton>
              ) : null}
            </div>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
