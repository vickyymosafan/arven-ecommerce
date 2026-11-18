'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type {
  AddressResponse,
  AuthUserSummary,
  CartDto,
  CheckoutGuestAddress,
  CheckoutLineItemInput,
  CheckoutQuoteDto,
  CheckoutShippingSelection,
  CreateOrderRequest,
} from '@arven/contracts';
import {
  checkoutGuestAddressSchema,
  createOrderRequestSchema,
} from '@arven/validators';
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  FormField,
  IconCheck,
  Input,
  LinkButton,
  LoadingState,
  StatusBanner,
  Surface,
  buttonClassName,
  cn,
  formatIDR,
  formatWIB,
  useToast,
} from '@arven/ui';
import {
  ApiClientError,
  createIdempotencyKey,
  extractFieldErrors,
  saveGuestOrderToken,
  storefrontApi,
} from '@/lib/api-client';

interface GuestAddressFormState {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  subdistrict: string;
  city: string;
  province: string;
  postalCode: string;
}

const EMPTY_GUEST_ADDRESS: GuestAddressFormState = {
  recipientName: '',
  phone: '',
  line1: '',
  line2: '',
  subdistrict: '',
  city: '',
  province: '',
  postalCode: '',
};

function buildCheckoutItems(cart: CartDto): CheckoutLineItemInput[] {
  return cart.items.map((item) => {
    const colorPresetId =
      typeof item.configuration?.colorPresetId === 'string' &&
      item.configuration.colorPresetId.trim().length > 0
        ? item.configuration.colorPresetId.trim()
        : undefined;

    return {
      variantId: item.variantId,
      quantity: item.quantity,
      ...(colorPresetId ? { customization: { colorPresetId } } : {}),
    };
  });
}

function toGuestAddressPayload(form: GuestAddressFormState): CheckoutGuestAddress {
  return {
    recipientName: form.recipientName.trim(),
    phone: form.phone.trim(),
    line1: form.line1.trim(),
    ...(form.line2.trim() ? { line2: form.line2.trim() } : {}),
    ...(form.subdistrict.trim() ? { subdistrict: form.subdistrict.trim() } : {}),
    city: form.city.trim(),
    province: form.province.trim(),
    postalCode: form.postalCode.trim(),
    countryCode: 'ID',
  };
}

function mapZodIssuesToFieldErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const issue of issues) {
    const joined = issue.path.map((segment) => String(segment)).join('.');
    const leaf = String(issue.path[issue.path.length - 1] ?? 'form');
    if (joined && !next[joined]) {
      next[joined] = issue.message;
    }
    if (leaf && !next[leaf]) {
      next[leaf] = issue.message;
    }
  }
  return next;
}

function mapApiErrorsWithLeafAliases(error: ApiClientError): Record<string, string> {
  const raw = extractFieldErrors(error);
  const expanded: Record<string, string> = { ...raw };
  for (const [key, message] of Object.entries(raw)) {
    const parts = key.split('.');
    const leaf = parts[parts.length - 1];
    if (leaf && !expanded[leaf]) {
      expanded[leaf] = message;
    }
  }
  return expanded;
}

export function CheckoutView() {
  const router = useRouter();
  const { toast } = useToast();

  const [cart, setCart] = useState<CartDto | null>(null);
  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);
  const [addresses, setAddresses] = useState<AddressResponse[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [bootNonce, setBootNonce] = useState(0);

  const [addressMode, setAddressMode] = useState<'saved' | 'custom'>('custom');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestAddress, setGuestAddress] = useState<GuestAddressFormState>(EMPTY_GUEST_ADDRESS);

  const [selectedShipping, setSelectedShipping] = useState<CheckoutShippingSelection | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | undefined>(undefined);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponApplying, setCouponApplying] = useState(false);

  const [quote, setQuote] = useState<CheckoutQuoteDto | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [quoteRefreshNonce, setQuoteRefreshNonce] = useState(0);
  const [expiredQuoteTimestamp, setExpiredQuoteTimestamp] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<{
    message: string;
    code?: string;
    requestId?: string | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const quoteRequestSeqRef = useRef(0);
  const lastCommittedQuoteKeyRef = useRef<string | null>(null);
  const orderIdempotencyRef = useRef<{ signature: string; key: string } | null>(null);

  const retryBoot = useCallback(() => {
    setBootLoading(true);
    setBootError(null);
    setBootNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function hydrateCheckout() {
      try {
        const loadedCart = await storefrontApi.getCart();

        if (!active) return;

        const [meResult, loadedAddresses] =
          loadedCart.ownerType === 'USER'
            ? await Promise.all([
                storefrontApi.getCurrentUser().catch(() => null),
                storefrontApi.listAddresses().catch(() => []),
              ])
            : [null, [] as AddressResponse[]];

        if (!active) return;

        setCart(loadedCart);
        setAuthUser(meResult?.user ?? null);
        setAddresses(loadedAddresses);

        if (meResult?.user) {
          setGuestEmail((prev) => prev || meResult.user.email);
        }

        if (meResult?.user && loadedAddresses.length > 0) {
          const preferred =
            loadedAddresses.find((entry) => entry.isDefault) ?? loadedAddresses[0];
          setAddressMode('saved');
          setSelectedAddressId(preferred?.id ?? '');
        } else {
          setAddressMode('custom');
          setSelectedAddressId('');
        }

        setBootError(null);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setBootError({ message: err.message, requestId: err.requestId });
        } else {
          setBootError({ message: 'Unable to load checkout details right now.' });
        }
      } finally {
        if (active) {
          setBootLoading(false);
        }
      }
    }

    void hydrateCheckout();
    return () => {
      active = false;
    };
  }, [bootNonce]);

  const checkoutItems = useMemo(() => (cart ? buildCheckoutItems(cart) : []), [cart]);

  const validGuestAddress = useMemo(() => {
    if (addressMode === 'saved' && selectedAddressId) {
      return undefined;
    }
    const parsed = checkoutGuestAddressSchema.safeParse(toGuestAddressPayload(guestAddress));
    return parsed.success ? parsed.data : undefined;
  }, [addressMode, guestAddress, selectedAddressId]);

  const activeAddressId =
    authUser && addressMode === 'saved' && selectedAddressId ? selectedAddressId : undefined;

  useEffect(() => {
    if (!cart || cart.items.length === 0 || cart.hasUnavailableItems) {
      return;
    }

    const quotePayload = {
      ...(activeAddressId ? { addressId: activeAddressId } : {}),
      ...(!activeAddressId && validGuestAddress ? { guestAddress: validGuestAddress } : {}),
      ...(selectedShipping ? { shipping: selectedShipping } : {}),
      ...(appliedCouponCode ? { couponCode: appliedCouponCode } : {}),
      items: checkoutItems,
    };
    const effectKey = JSON.stringify({ payload: quotePayload, refreshNonce: quoteRefreshNonce });
    if (lastCommittedQuoteKeyRef.current === effectKey) {
      return;
    }

    const reqSeq = ++quoteRequestSeqRef.current;
    let active = true;

    void Promise.resolve()
      .then(() => {
        if (!active || reqSeq !== quoteRequestSeqRef.current) {
          return null;
        }
        setQuoteLoading(true);
        setQuoteError(null);
        return storefrontApi.quoteCheckout(quotePayload);
      })
      .then((nextQuote) => {
        if (!nextQuote || !active || reqSeq !== quoteRequestSeqRef.current) return;
        lastCommittedQuoteKeyRef.current = effectKey;
        setQuote(nextQuote);
        setQuoteError(null);
        setExpiredQuoteTimestamp(
          Date.now() > Date.parse(nextQuote.quoteExpiresAt) ? nextQuote.quoteExpiresAt : null,
        );
        if (!selectedShipping && nextQuote.selectedShipping) {
          const initialShipping = {
            provider: nextQuote.selectedShipping.provider,
            service: nextQuote.selectedShipping.serviceCode,
          };
          lastCommittedQuoteKeyRef.current = JSON.stringify({
            payload: {
              ...(activeAddressId ? { addressId: activeAddressId } : {}),
              ...(!activeAddressId && validGuestAddress ? { guestAddress: validGuestAddress } : {}),
              shipping: initialShipping,
              ...(appliedCouponCode ? { couponCode: appliedCouponCode } : {}),
              items: checkoutItems,
            },
            refreshNonce: quoteRefreshNonce,
          });
          setSelectedShipping(initialShipping);
        }
      })
      .catch((err: unknown) => {
        if (!active || reqSeq !== quoteRequestSeqRef.current) return;
        if (err instanceof ApiClientError) {
          setQuoteError({ message: err.message, requestId: err.requestId });
        } else {
          setQuoteError({ message: 'Unable to compute shipping and order totals right now.' });
        }
      })
      .finally(() => {
        if (active && reqSeq === quoteRequestSeqRef.current) {
          setQuoteLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    activeAddressId,
    appliedCouponCode,
    cart,
    checkoutItems,
    quoteRefreshNonce,
    selectedShipping,
    validGuestAddress,
  ]);

  useEffect(() => {
    const expiresAt = quote?.quoteExpiresAt;
    if (!expiresAt) {
      return;
    }
    const expiryMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiryMs)) {
      return;
    }
    const delayMs = Math.max(0, expiryMs - Date.now());
    const timer = window.setTimeout(() => {
      setExpiredQuoteTimestamp(expiresAt);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [quote?.quoteExpiresAt]);

  const quoteExpired = Boolean(
    quote?.quoteExpiresAt && expiredQuoteTimestamp === quote.quoteExpiresAt,
  );

  const activeShippingSelection: CheckoutShippingSelection | null = selectedShipping
    ? selectedShipping
    : quote?.selectedShipping
      ? {
          provider: quote.selectedShipping.provider,
          service: quote.selectedShipping.serviceCode,
        }
      : null;

  const handleApplyCoupon = async () => {
    const trimmed = couponInput.trim().toUpperCase();
    setCouponError(null);

    if (trimmed.length < 2 || trimmed.length > 64) {
      setCouponError('Enter a valid promotional code (2 to 64 characters).');
      return;
    }

    if (!cart || checkoutItems.length === 0) {
      return;
    }

    setCouponApplying(true);
    const couponQuotePayload = {
      ...(activeAddressId ? { addressId: activeAddressId } : {}),
      ...(!activeAddressId && validGuestAddress ? { guestAddress: validGuestAddress } : {}),
      ...(selectedShipping
        ? { shipping: selectedShipping }
        : activeShippingSelection
          ? { shipping: activeShippingSelection }
          : {}),
      couponCode: trimmed,
      items: checkoutItems,
    };

    try {
      const nextQuote = await storefrontApi.quoteCheckout(couponQuotePayload);
      lastCommittedQuoteKeyRef.current = JSON.stringify({
        payload: {
          ...(activeAddressId ? { addressId: activeAddressId } : {}),
          ...(!activeAddressId && validGuestAddress ? { guestAddress: validGuestAddress } : {}),
          ...(selectedShipping ? { shipping: selectedShipping } : {}),
          couponCode: trimmed,
          items: checkoutItems,
        },
        refreshNonce: quoteRefreshNonce,
      });
      setAppliedCouponCode(trimmed);
      setCouponInput(trimmed);
      setQuote(nextQuote);
      setQuoteError(null);
      setExpiredQuoteTimestamp(null);
      toast({
        tone: 'success',
        title: 'Promo applied',
        description: `Code ${trimmed} validated against current bag items.`,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCouponError(err.message);
      } else {
        setCouponError('Unable to validate promo code right now.');
      }
    } finally {
      setCouponApplying(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponError(null);
    setCouponInput('');
    setAppliedCouponCode(undefined);
  };

  const handleSelectAddressMode = (mode: 'saved' | 'custom', addressId?: string) => {
    setFieldErrors({});
    setSubmitError(null);
    setAddressMode(mode);
    if (mode === 'saved' && addressId) {
      setSelectedAddressId(addressId);
    } else if (mode === 'custom') {
      setSelectedAddressId('');
      if (authUser && !guestEmail.trim()) {
        setGuestEmail(authUser.email);
      }
    }
  };

  const updateGuestAddressField = (field: keyof GuestAddressFormState, value: string) => {
    setGuestAddress((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field] && !prev[`guestAddress.${field}`]) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      delete next[`guestAddress.${field}`];
      return next;
    });
  };

  const resolveOrderIdempotencyKey = (payload: CreateOrderRequest): string => {
    const signature = JSON.stringify(payload);
    if (orderIdempotencyRef.current?.signature === signature) {
      return orderIdempotencyRef.current.key;
    }
    const nextKey = createIdempotencyKey();
    orderIdempotencyRef.current = { signature, key: nextKey };
    return nextKey;
  };

  const handlePlaceOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cart || cart.items.length === 0 || cart.hasUnavailableItems) {
      return;
    }

    setFieldErrors({});
    setSubmitError(null);

    if (!activeShippingSelection) {
      setSubmitError({
        message: 'Select a shipping courier service before placing your order.',
      });
      return;
    }

    const candidatePayload: Record<string, unknown> = {
      shipping: activeShippingSelection,
      items: checkoutItems,
      ...(appliedCouponCode ? { couponCode: appliedCouponCode } : {}),
    };

    if (activeAddressId) {
      candidatePayload['addressId'] = activeAddressId;
    } else {
      const normalizedEmail = (guestEmail.trim() || authUser?.email || '').trim();
      candidatePayload['guestEmail'] = normalizedEmail;
      candidatePayload['guestAddress'] = toGuestAddressPayload(guestAddress);
    }

    const parsed = createOrderRequestSchema.safeParse(candidatePayload);
    if (!parsed.success) {
      const errors = mapZodIssuesToFieldErrors(parsed.error.issues);
      setFieldErrors(errors);
      setSubmitError({
        message: 'Review the highlighted shipping and contact fields before placing your order.',
      });
      return;
    }

    const orderKey = resolveOrderIdempotencyKey(parsed.data);
    setSubmitting(true);

    try {
      const created = await storefrontApi.createOrder(parsed.data, orderKey);

      if (created.guestToken) {
        saveGuestOrderToken(created.order.orderNumber, created.guestToken);
      }

      try {
        const paymentKey = createIdempotencyKey();
        await storefrontApi.createPaymentSession(
          created.order.id,
          paymentKey,
          {},
          created.guestToken ?? undefined,
        );
      } catch (paymentErr) {
        toast({
          tone: 'warning',
          title: 'Order reserved',
          description:
            paymentErr instanceof ApiClientError
              ? `${paymentErr.message} You can launch payment from the order status page.`
              : 'Order reserved. Launch your Midtrans payment session on the next screen.',
        });
      }

      router.push(`/checkout/status/${encodeURIComponent(created.order.orderNumber)}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(mapApiErrorsWithLeafAliases(err));
        setSubmitError({
          message: err.message,
          code: err.code,
          requestId: err.requestId,
        });
        if (err.status === 409) {
          setQuoteRefreshNonce((n) => n + 1);
        }
      } else {
        setSubmitError({
          message: 'Unable to submit your order right now. Please try again.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (bootLoading) {
    return (
      <div className="min-h-[38rem]">
        <LoadingState label="Preparing checkout details and Jakarta warehouse quote" rows={6} />
      </div>
    );
  }

  if (bootError) {
    return (
      <ErrorState
        title="Unable to initialize checkout"
        message={bootError.message}
        requestId={bootError.requestId}
        retryLabel="Retry"
        onRetry={retryBoot}
      />
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="space-y-8">
        <div className="space-y-2 border-b border-hairline pb-6">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Checkout
          </p>
          <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
            Order Checkout
          </h1>
        </div>

        <EmptyState
          title="Your Bag Is Empty"
          description="Add garments from the ARVEN catalog before proceeding to shipping and Midtrans payment."
          action={
            <div className="flex flex-wrap items-center gap-3">
              <LinkButton href="/shop" variant="primary" size="md">
                Explore Catalog
              </LinkButton>
              <LinkButton href="/cart" variant="secondary" size="md">
                Return to Bag
              </LinkButton>
            </div>
          }
        />
      </div>
    );
  }

  if (cart.hasUnavailableItems) {
    return (
      <div className="space-y-8">
        <div className="space-y-2 border-b border-hairline pb-6">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Checkout
          </p>
          <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
            Order Checkout
          </h1>
        </div>

        <StatusBanner
          tone="warning"
          title="Bag availability adjustment required"
          description="One or more pieces in your bag exceed current warehouse availability or are inactive. Update quantities or remove flagged lines in your bag first."
          action={
            <LinkButton href="/cart" variant="primary" size="sm">
              Return to Bag
            </LinkButton>
          }
        />
      </div>
    );
  }

  const shippingOptions = quote?.shippingOptions ?? [];
  const isStockConflict =
    submitError?.code?.includes('STOCK') || submitError?.code?.includes('INVENTORY');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Checkout
          </p>
          <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
            Shipping & Order Review
          </h1>
          <p className="text-sm text-ink-muted">
            Prices, stock reservation, and Indonesian courier rates are verified directly by
            Jakarta Atelier Main.
          </p>
        </div>

        <LinkButton href="/cart" variant="secondary" size="sm">
          Edit Bag
        </LinkButton>
      </div>

      {submitError ? (
        <StatusBanner
          tone="danger"
          title="Unable to place order"
          description={submitError.message}
          requestId={submitError.requestId}
          action={
            isStockConflict ? (
              <LinkButton href="/cart" variant="secondary" size="sm">
                Review Bag
              </LinkButton>
            ) : undefined
          }
          onDismiss={() => setSubmitError(null)}
        />
      ) : null}

      {quoteExpired ? (
        <StatusBanner
          tone="warning"
          title="Quote timestamp expired"
          description="Your 15-minute checkout quote window has elapsed. Refresh the server quote to confirm live stock and pricing before payment."
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={quoteLoading}
              loadingLabel="Refreshing"
              onClick={() => setQuoteRefreshNonce((n) => n + 1)}
            >
              Refresh Quote
            </Button>
          }
        />
      ) : null}

      <form
        onSubmit={handlePlaceOrder}
        noValidate
        className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start"
      >
        {/* Left Column: Address, Courier, Promo */}
        <div className="min-w-0 space-y-6 lg:col-span-7">
          {/* 1. Contact & Shipping Address */}
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                  Step 01
                </p>
                <h2 className="font-display text-2xl font-normal text-ink">
                  Contact & Delivery Destination
                </h2>
              </div>

              {authUser ? (
                <Link
                  href="/account/addresses"
                  className={buttonClassName({ variant: 'ghost', size: 'sm' })}
                >
                  Manage Address Book
                </Link>
              ) : (
                <Link
                  href="/auth/login?next=/checkout"
                  className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                >
                  Sign In for Saved Addresses
                </Link>
              )}
            </div>

            {authUser ? (
              <div className="rounded-[var(--radius-sm)] border border-hairline bg-subtle px-4 py-3 text-sm">
                <span className="text-ink-muted">Ordering as </span>
                <span className="font-medium text-ink">{authUser.fullName}</span>{' '}
                <span className="font-mono text-xs text-ink-muted">({authUser.email})</span>
              </div>
            ) : null}

            {authUser && addresses.length > 0 ? (
              <fieldset className="space-y-3">
                <legend className="text-xs font-medium uppercase tracking-[0.06em] text-ink">
                  Select Saved Address or Enter Destination
                </legend>
                <div role="radiogroup" aria-label="Saved shipping addresses" className="grid gap-3">
                  {addresses.map((address) => {
                    const selected =
                      addressMode === 'saved' && selectedAddressId === address.id;
                    return (
                      <label
                        key={address.id}
                        className={cn(
                          'flex min-h-11 cursor-pointer items-start justify-between gap-4 rounded-[var(--radius-sm)] p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                          selected
                            ? 'border-2 border-strong-border bg-panel'
                            : 'border border-control-border bg-canvas hover:border-strong-border hover:bg-subtle',
                        )}
                      >
                        <input
                          type="radio"
                          name="checkoutAddressOption"
                          value={address.id}
                          checked={selected}
                          onChange={() => handleSelectAddressMode('saved', address.id)}
                          className="sr-only"
                        />
                        <div className="min-w-0 space-y-1 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">{address.label}</span>
                            {address.isDefault ? <Badge tone="info">Default</Badge> : null}
                            {selected ? (
                              <Badge tone="success" icon={<IconCheck size={12} />}>
                                Selected
                              </Badge>
                            ) : null}
                          </div>
                          <p className="font-medium text-ink">
                            {address.recipientName}{' '}
                            <span className="font-mono text-xs text-ink-muted">
                              ({address.phone})
                            </span>
                          </p>
                          <p className="text-ink-secondary">
                            {address.line1}
                            {address.line2 ? `, ${address.line2}` : ''}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {address.city}, {address.province} {address.postalCode}
                          </p>
                        </div>
                      </label>
                    );
                  })}

                  <label
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                      addressMode === 'custom'
                        ? 'border-2 border-strong-border bg-panel'
                        : 'border border-control-border bg-canvas hover:border-strong-border hover:bg-subtle',
                    )}
                  >
                    <input
                      type="radio"
                      name="checkoutAddressOption"
                      value="custom"
                      checked={addressMode === 'custom'}
                      onChange={() => handleSelectAddressMode('custom')}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium text-ink">
                      Enter a different shipping address
                    </span>
                    {addressMode === 'custom' ? (
                      <Badge tone="success" icon={<IconCheck size={12} />}>
                        Selected
                      </Badge>
                    ) : null}
                  </label>
                </div>
              </fieldset>
            ) : null}

            {addressMode === 'custom' ? (
              <div className="space-y-4">
                <FormField
                  id="checkout-guest-email"
                  label="Contact Email"
                  hint="Order receipt and guest tracking token access are bound to this email."
                  error={fieldErrors['guestEmail']}
                  required
                >
                  <Input
                    id="checkout-guest-email"
                    name="guestEmail"
                    type="email"
                    autoComplete="email"
                    placeholder="client@domain.id"
                    value={guestEmail}
                    onChange={(event) => {
                      setGuestEmail(event.target.value);
                      setFieldErrors((prev) => {
                        if (!prev['guestEmail']) return prev;
                        const next = { ...prev };
                        delete next['guestEmail'];
                        return next;
                      });
                    }}
                    invalid={Boolean(fieldErrors['guestEmail'])}
                    aria-describedby={
                      fieldErrors['guestEmail']
                        ? 'checkout-guest-email-error'
                        : 'checkout-guest-email-hint'
                    }
                    className="scroll-mb-24"
                  />
                </FormField>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    id="checkout-recipient-name"
                    label="Recipient Full Name"
                    error={fieldErrors['recipientName'] ?? fieldErrors['guestAddress.recipientName']}
                    required
                  >
                    <Input
                      id="checkout-recipient-name"
                      name="recipientName"
                      autoComplete="name"
                      value={guestAddress.recipientName}
                      onChange={(event) =>
                        updateGuestAddressField('recipientName', event.target.value)
                      }
                      invalid={Boolean(
                        fieldErrors['recipientName'] ?? fieldErrors['guestAddress.recipientName'],
                      )}
                      aria-describedby={
                        fieldErrors['recipientName'] ?? fieldErrors['guestAddress.recipientName']
                          ? 'checkout-recipient-name-error'
                          : undefined
                      }
                      className="scroll-mb-24"
                    />
                  </FormField>

                  <FormField
                    id="checkout-phone"
                    label="Mobile Phone"
                    hint="Indonesian mobile or E.164 format, e.g. +6281234567890."
                    error={fieldErrors['phone'] ?? fieldErrors['guestAddress.phone']}
                    required
                  >
                    <Input
                      id="checkout-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+6281234567890"
                      value={guestAddress.phone}
                      onChange={(event) => updateGuestAddressField('phone', event.target.value)}
                      invalid={Boolean(fieldErrors['phone'] ?? fieldErrors['guestAddress.phone'])}
                      aria-describedby={
                        fieldErrors['phone'] ?? fieldErrors['guestAddress.phone']
                          ? 'checkout-phone-error'
                          : 'checkout-phone-hint'
                      }
                      className="scroll-mb-24"
                    />
                  </FormField>
                </div>

                <FormField
                  id="checkout-line1"
                  label="Street Address"
                  error={fieldErrors['line1'] ?? fieldErrors['guestAddress.line1']}
                  required
                >
                  <Input
                    id="checkout-line1"
                    name="line1"
                    autoComplete="address-line1"
                    placeholder="Jl. Senopati No. 18"
                    value={guestAddress.line1}
                    onChange={(event) => updateGuestAddressField('line1', event.target.value)}
                    invalid={Boolean(fieldErrors['line1'] ?? fieldErrors['guestAddress.line1'])}
                    aria-describedby={
                      fieldErrors['line1'] ?? fieldErrors['guestAddress.line1']
                        ? 'checkout-line1-error'
                        : undefined
                    }
                    className="scroll-mb-24"
                  />
                </FormField>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    id="checkout-line2"
                    label="Apartment / Unit / Notes (Optional)"
                    error={fieldErrors['line2'] ?? fieldErrors['guestAddress.line2']}
                  >
                    <Input
                      id="checkout-line2"
                      name="line2"
                      autoComplete="address-line2"
                      value={guestAddress.line2}
                      onChange={(event) => updateGuestAddressField('line2', event.target.value)}
                      invalid={Boolean(fieldErrors['line2'] ?? fieldErrors['guestAddress.line2'])}
                      aria-describedby={
                        fieldErrors['line2'] ?? fieldErrors['guestAddress.line2']
                          ? 'checkout-line2-error'
                          : undefined
                      }
                      className="scroll-mb-24"
                    />
                  </FormField>

                  <FormField
                    id="checkout-subdistrict"
                    label="Subdistrict / Kecamatan (Optional)"
                    error={fieldErrors['subdistrict'] ?? fieldErrors['guestAddress.subdistrict']}
                  >
                    <Input
                      id="checkout-subdistrict"
                      name="subdistrict"
                      value={guestAddress.subdistrict}
                      onChange={(event) =>
                        updateGuestAddressField('subdistrict', event.target.value)
                      }
                      invalid={Boolean(
                        fieldErrors['subdistrict'] ?? fieldErrors['guestAddress.subdistrict'],
                      )}
                      aria-describedby={
                        fieldErrors['subdistrict'] ?? fieldErrors['guestAddress.subdistrict']
                          ? 'checkout-subdistrict-error'
                          : undefined
                      }
                      className="scroll-mb-24"
                    />
                  </FormField>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    id="checkout-city"
                    label="City / Regency"
                    error={fieldErrors['city'] ?? fieldErrors['guestAddress.city']}
                    required
                  >
                    <Input
                      id="checkout-city"
                      name="city"
                      autoComplete="address-level2"
                      placeholder="Jakarta Selatan"
                      value={guestAddress.city}
                      onChange={(event) => updateGuestAddressField('city', event.target.value)}
                      invalid={Boolean(fieldErrors['city'] ?? fieldErrors['guestAddress.city'])}
                      aria-describedby={
                        fieldErrors['city'] ?? fieldErrors['guestAddress.city']
                          ? 'checkout-city-error'
                          : undefined
                      }
                      className="scroll-mb-24"
                    />
                  </FormField>

                  <FormField
                    id="checkout-province"
                    label="Province"
                    error={fieldErrors['province'] ?? fieldErrors['guestAddress.province']}
                    required
                  >
                    <Input
                      id="checkout-province"
                      name="province"
                      autoComplete="address-level1"
                      placeholder="DKI Jakarta"
                      value={guestAddress.province}
                      onChange={(event) => updateGuestAddressField('province', event.target.value)}
                      invalid={Boolean(
                        fieldErrors['province'] ?? fieldErrors['guestAddress.province'],
                      )}
                      aria-describedby={
                        fieldErrors['province'] ?? fieldErrors['guestAddress.province']
                          ? 'checkout-province-error'
                          : undefined
                      }
                      className="scroll-mb-24"
                    />
                  </FormField>

                  <FormField
                    id="checkout-postal-code"
                    label="Postal Code"
                    error={fieldErrors['postalCode'] ?? fieldErrors['guestAddress.postalCode']}
                    required
                  >
                    <Input
                      id="checkout-postal-code"
                      name="postalCode"
                      autoComplete="postal-code"
                      placeholder="12190"
                      value={guestAddress.postalCode}
                      onChange={(event) =>
                        updateGuestAddressField('postalCode', event.target.value)
                      }
                      invalid={Boolean(
                        fieldErrors['postalCode'] ?? fieldErrors['guestAddress.postalCode'],
                      )}
                      aria-describedby={
                        fieldErrors['postalCode'] ?? fieldErrors['guestAddress.postalCode']
                          ? 'checkout-postal-code-error'
                          : undefined
                      }
                      className="scroll-mb-24"
                    />
                  </FormField>
                </div>

                {!validGuestAddress ? (
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Shipping rates adjust automatically to your Indonesian destination once all
                    required address fields above are filled.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Surface>

          {/* 2. Courier / Shipping Service */}
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                  Step 02
                </p>
                <h2 className="font-display text-2xl font-normal text-ink">
                  Courier & Delivery Speed
                </h2>
              </div>

              {quote ? (
                <span className="font-mono text-xs text-ink-muted tabular-nums">
                  {quote.totalWeightGrams}g from {quote.warehouseCode}
                </span>
              ) : null}
            </div>

            {quoteError ? (
              <StatusBanner
                tone="danger"
                title="Quote unavailable"
                description={quoteError.message}
                requestId={quoteError.requestId}
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setQuoteRefreshNonce((n) => n + 1)}
                  >
                    Retry Quote
                  </Button>
                }
              />
            ) : shippingOptions.length === 0 ? (
              <LoadingState label="Calculating Indonesian courier rates" rows={2} />
            ) : (
              <fieldset className="space-y-3">
                <legend className="text-xs font-medium uppercase tracking-[0.06em] text-ink">
                  Available Shipping Services
                </legend>
                <div role="radiogroup" aria-label="Shipping method" className="grid gap-3">
                  {shippingOptions.map((option) => {
                    const isSelected =
                      activeShippingSelection?.provider === option.provider &&
                      activeShippingSelection?.service === option.serviceCode;
                    const etaLabel =
                      option.estimatedMinDays === option.estimatedMaxDays
                        ? `${option.estimatedMinDays} business day`
                        : `${option.estimatedMinDays} to ${option.estimatedMaxDays} business days`;

                    return (
                      <label
                        key={`${option.provider}:${option.serviceCode}`}
                        className={cn(
                          'flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                          isSelected
                            ? 'border-2 border-strong-border bg-panel'
                            : 'border border-control-border bg-canvas hover:border-strong-border hover:bg-subtle',
                        )}
                      >
                        <input
                          type="radio"
                          name="shippingService"
                          value={`${option.provider}:${option.serviceCode}`}
                          checked={isSelected}
                          onChange={() =>
                            setSelectedShipping({
                              provider: option.provider,
                              service: option.serviceCode,
                            })
                          }
                          className="sr-only"
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink">
                              {option.serviceName}
                            </span>
                            {isSelected ? (
                              <Badge tone="success" icon={<IconCheck size={12} />}>
                                Selected
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-ink-muted">Estimated arrival: {etaLabel}</p>
                        </div>

                        <span className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-ink">
                          {formatIDR(option.costIdr)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </Surface>

          {/* 3. Promo Code */}
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                Step 03
              </p>
              <h2 className="font-display text-2xl font-normal text-ink">Promotional Code</h2>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <FormField
                  id="checkout-coupon-code"
                  label="Promo Code"
                  hint="Enter a valid ARVEN campaign code if you hold one."
                  error={couponError ?? undefined}
                >
                  <Input
                    id="checkout-coupon-code"
                    name="couponCode"
                    placeholder="WELCOME10"
                    value={couponInput}
                    disabled={Boolean(appliedCouponCode) || couponApplying}
                    onChange={(event) => {
                      setCouponInput(event.target.value.toUpperCase());
                      if (couponError) setCouponError(null);
                    }}
                    invalid={Boolean(couponError)}
                    aria-describedby={
                      couponError ? 'checkout-coupon-code-error' : 'checkout-coupon-code-hint'
                    }
                    className="scroll-mb-24 font-mono uppercase"
                  />
                </FormField>
              </div>

              <div className="shrink-0 sm:mt-[22px]">
                {appliedCouponCode ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleRemoveCoupon}
                  >
                    Remove Code
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    isLoading={couponApplying}
                    loadingLabel="Checking"
                    disabled={!couponInput.trim()}
                    onClick={() => void handleApplyCoupon()}
                  >
                    Apply Code
                  </Button>
                )}
              </div>
            </div>

            {quote?.appliedCoupon ? (
              <StatusBanner
                tone="success"
                title={`Applied ${quote.appliedCoupon.code}`}
                description={`${quote.appliedCoupon.name} saved ${formatIDR(quote.appliedCoupon.discountAppliedIdr)} on this quote.`}
              />
            ) : null}
          </Surface>
        </div>

        {/* Right Column: Sticky Order Summary */}
        <aside aria-label="Order summary" className="min-w-0 lg:col-span-5 lg:sticky lg:top-24">
          <Surface variant="subtle" border="hairline" padding="lg" className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                  Server Quote
                </p>
                <h2 className="font-display text-2xl font-normal text-ink">Order Summary</h2>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                isLoading={quoteLoading}
                loadingLabel="Syncing"
                onClick={() => setQuoteRefreshNonce((n) => n + 1)}
              >
                Refresh Quote
              </Button>
            </div>

            <Divider />

            <ul className="space-y-3" aria-label="Checkout items">
              {cart.items.map((item) => {
                const quoteLine = quote?.items.find((q) => q.variantId === item.variantId);
                const lineTotal = quoteLine ? quoteLine.lineTotalIdr : item.lineSubtotalIdr;
                return (
                  <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="flex min-w-0 gap-3">
                      <div className="aspect-[3/4] w-14 shrink-0 overflow-hidden border border-hairline bg-panel">
                        {item.primaryImageUrl ? (
                          <img
                            src={item.primaryImageUrl}
                            alt={item.primaryImageAlt || item.productName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center font-mono text-[10px] text-ink-muted">
                            ARV
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium leading-snug text-ink">{item.productName}</p>
                        <p className="text-xs text-ink-muted">
                          {item.color} / Size {item.size}
                        </p>
                        <p className="font-mono text-xs tabular-nums text-ink-muted">
                          Qty {item.quantity} x {formatIDR(item.unitPriceIdr)}
                        </p>
                      </div>
                    </div>

                    <span className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-ink">
                      {formatIDR(lineTotal)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <Divider />

            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="whitespace-nowrap font-mono font-medium tabular-nums text-ink">
                  {formatIDR(quote ? quote.subtotalIdr : cart.subtotalIdr)}
                </dd>
              </div>

              {quote && quote.discountTotalIdr > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted">
                    Promo Discount{' '}
                    {quote.appliedCoupon ? (
                      <span className="font-mono text-xs text-ink">
                        ({quote.appliedCoupon.code})
                      </span>
                    ) : null}
                  </dt>
                  <dd className="whitespace-nowrap font-mono font-medium tabular-nums text-success-fg">
                    -{formatIDR(quote.discountTotalIdr)}
                  </dd>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">
                  Shipping{' '}
                  {quote?.selectedShipping ? (
                    <span className="text-xs text-ink">
                      ({quote.selectedShipping.serviceName})
                    </span>
                  ) : null}
                </dt>
                <dd className="whitespace-nowrap font-mono font-medium tabular-nums text-ink">
                  {quote ? formatIDR(quote.shippingTotalIdr) : 'Calculating...'}
                </dd>
              </div>
            </dl>

            <Divider />

            <dl className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                  Total Payable
                </dt>
                <dd className="whitespace-nowrap font-mono text-xl font-medium tabular-nums text-ink">
                  {formatIDR(quote ? quote.grandTotalIdr : cart.subtotalIdr)}
                </dd>
              </div>
            </dl>

            {quote?.quoteExpiresAt ? (
              <p className="font-mono text-xs tabular-nums text-ink-muted">
                Quote valid until {formatWIB(quote.quoteExpiresAt)}
              </p>
            ) : null}

            <StatusBanner
              tone="info"
              description="Inventory is reserved for 15 minutes upon order placement. Payment is completed securely via Midtrans without storing card credentials on ARVEN."
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={submitting}
              loadingLabel="Processing Order..."
              disabled={quoteLoading || !quote || !activeShippingSelection}
            >
              Place Order & Pay
            </Button>
          </Surface>
        </aside>
      </form>
    </div>
  );
}
