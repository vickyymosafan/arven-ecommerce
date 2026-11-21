'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CartDto, CartItemDto } from '@arven/contracts';
import {
  Button,
  Divider,
  Drawer,
  IconMinus,
  IconPlus,
  StatusBanner,
  buttonClassName,
  formatIDR,
  useToast,
} from '@arven/ui';
import {
  ApiClientError,
  CART_UPDATED_EVENT,
  notifyCartUpdated,
  storefrontApi,
} from '@/lib/api-client';

export interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { toast } = useToast();
  const [cart, setCart] = useState<CartDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const loadCart = useCallback(async () => {
    try {
      const data = await storefrontApi.getCart();
      setCart(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to load your shopping bag right now.',
      );
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    storefrontApi
      .getCart()
      .then((data) => {
        if (!active) return;
        setCart(data);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load your shopping bag right now.',
        );
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    const handleCartUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<CartDto | undefined>;
      if (customEvent.detail) {
        setCart(customEvent.detail);
      } else if (isOpen) {
        void loadCart();
      }
    };
    window.addEventListener(CART_UPDATED_EVENT, handleCartUpdated);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdated);
    };
  }, [isOpen, loadCart]);

  const handleUpdateQty = async (item: CartItemDto, nextQuantity: number) => {
    if (nextQuantity < 1 || nextQuantity > 99) return;
    setBusyItemId(item.id);
    setError(null);
    try {
      const updated = await storefrontApi.updateCartItem(item.id, { quantity: nextQuantity });
      setCart(updated);
      notifyCartUpdated(updated);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Unable to update item quantity.',
      );
    } finally {
      setBusyItemId(null);
    }
  };

  const handleRemove = async (item: CartItemDto) => {
    setBusyItemId(item.id);
    setError(null);
    try {
      await storefrontApi.removeCartItem(item.id);
      const refreshed = await storefrontApi.getCart();
      setCart(refreshed);
      notifyCartUpdated(refreshed);
      toast({
        tone: 'success',
        title: 'Removed from Bag',
        description: `${item.productName} removed from your bag.`,
      });
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Unable to remove item from bag.',
      );
    } finally {
      setBusyItemId(null);
    }
  };

  const hasItems = Boolean(cart && cart.items.length > 0);
  const subtitle = cart
    ? `${cart.totalQuantity} ${cart.totalQuantity === 1 ? 'piece' : 'pieces'} staged`
    : undefined;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Shopping Bag"
      subtitle={subtitle}
      side="right"
      size="md"
      closeLabel="Close shopping bag"
      footer={
        hasItems && cart ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-eyebrow text-ink-muted">Subtotal</span>
              <span className="text-lg font-semibold tabular-nums text-ink">
                {formatIDR(cart.subtotalIdr)}
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              Shipping rates and promotional codes are calculated at checkout.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              {cart.hasUnavailableItems ? (
                <Link
                  href="/cart"
                  onClick={onClose}
                  className={buttonClassName({ variant: 'primary', size: 'lg', fullWidth: true })}
                >
                  Review Availability in Bag
                </Link>
              ) : (
                <Link
                  href="/checkout"
                  onClick={onClose}
                  className={buttonClassName({ variant: 'primary', size: 'lg', fullWidth: true })}
                >
                  Proceed to Checkout
                </Link>
              )}
              <Link
                href="/cart"
                onClick={onClose}
                className={buttonClassName({ variant: 'secondary', size: 'md', fullWidth: true })}
              >
                View Full Bag
              </Link>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {error ? (
          <StatusBanner
            tone="danger"
            description={error}
            onDismiss={() => setError(null)}
          />
        ) : null}

        {isOpen && cart === null && error === null ? (
          <div role="status" aria-live="polite" className="space-y-3 py-4">
            <div className="h-24 w-full border border-hairline bg-subtle" />
            <div className="h-24 w-full border border-hairline bg-subtle" />
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <div className="space-y-5 py-8 text-left">
            <div className="space-y-2">
              <h3 className="font-display text-2xl font-normal text-ink">
                Your bag is currently empty
              </h3>
              <p className="type-ui text-ink-muted">
                Explore published silhouettes, tailored outerwear, and accessories from the Jakarta atelier.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/shop"
                onClick={onClose}
                className={buttonClassName({ variant: 'primary', size: 'md' })}
              >
                Explore Catalog
              </Link>
              <Link
                href="/collections"
                onClick={onClose}
                className={buttonClassName({ variant: 'secondary', size: 'md' })}
              >
                View Capsules
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {cart.hasUnavailableItems ? (
              <StatusBanner
                tone="warning"
                description="One or more pieces require quantity adjustment before checkout."
              />
            ) : null}

            <ul className="divide-y divide-hairline">
              {cart.items.map((item) => {
                const isBusy = busyItemId === item.id;
                const canDecrease = !isBusy && item.quantity > 1;
                const maxQty = Math.min(99, Math.max(0, item.availableQty));
                const canIncrease = !isBusy && item.availableQty > 0 && item.quantity < maxQty;

                return (
                  <li key={item.id} className="flex gap-4 py-4 first:pt-0">
                    <Link
                      href={`/products/${item.productSlug}`}
                      onClick={onClose}
                      className="block aspect-[3/4] w-20 shrink-0 overflow-hidden border border-hairline bg-subtle"
                    >
                      {item.primaryImageUrl ? (
                        <img
                          src={item.primaryImageUrl}
                          alt={item.primaryImageAlt || item.productName}
                          decoding="async"
                          className="block h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center p-2 text-center">
                          <span className="font-display text-sm tracking-[0.14em] uppercase text-ink-muted">
                            ARVEN
                          </span>
                        </div>
                      )}
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                      <div className="space-y-1">
                        <Link
                          href={`/products/${item.productSlug}`}
                          onClick={onClose}
                          className="font-display text-lg font-normal leading-snug text-ink hover:text-link hover:underline"
                        >
                          {item.productName}
                        </Link>
                        <p className="text-xs text-ink-muted">
                          {item.color} · Size {item.size}
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-ink">
                          {formatIDR(item.lineSubtotalIdr)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="inline-flex items-center border border-control-border bg-canvas">
                          <button
                            type="button"
                            aria-label={`Decrease quantity for ${item.productName}`}
                            disabled={!canDecrease}
                            onClick={() => void handleUpdateQty(item, item.quantity - 1)}
                            className="inline-flex h-11 w-11 items-center justify-center text-ink transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                          >
                            <IconMinus size={14} />
                          </button>
                          <span className="inline-flex min-w-8 items-center justify-center text-xs font-semibold tabular-nums text-ink">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase quantity for ${item.productName}`}
                            disabled={!canIncrease}
                            onClick={() => void handleUpdateQty(item, item.quantity + 1)}
                            className="inline-flex h-11 w-11 items-center justify-center text-ink transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                          >
                            <IconPlus size={14} />
                          </button>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => void handleRemove(item)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <Divider />
          </div>
        )}
      </div>
    </Drawer>
  );
}
