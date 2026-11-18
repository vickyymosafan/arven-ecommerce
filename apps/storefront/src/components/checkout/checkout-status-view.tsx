'use client';

import { useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { OrderDetailDto } from '@arven/contracts';
import {
  Badge,
  Button,
  Divider,
  ErrorState,
  FormField,
  IconRefresh,
  Input,
  LinkButton,
  LoadingState,
  StatusBanner,
  Surface,
  buttonClassName,
  formatIDR,
  formatWIB,
  useToast,
} from '@arven/ui';
import {
  ApiClientError,
  createIdempotencyKey,
  readGuestOrderToken,
  saveGuestOrderToken,
  storefrontApi,
} from '@/lib/api-client';
import { getOrderStatusMeta, getPaymentStatusMeta } from '@/lib/format';

export interface CheckoutStatusViewProps {
  orderNumber: string;
}

const POLL_INTERVAL_MS = 8_000;

export function CheckoutStatusView({ orderNumber }: CheckoutStatusViewProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const queryToken = searchParams.get('token')?.trim() || null;

  const [overrideToken, setOverrideToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [needsAccessProof, setNeedsAccessProof] = useState(false);

  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);

  const [creatingPayment, setCreatingPayment] = useState(false);
  const [paymentActionError, setPaymentActionError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const activeTokenRef = useRef<string | null>(overrideToken ?? queryToken);
  const cancelOrderButtonRef = useRef<HTMLButtonElement | null>(null);

  const fetchOrder = useCallback(
    async (mode: 'initial' | 'manual' | 'poll', override?: string | null) => {
      const tokenToUse =
        override !== undefined ? override : activeTokenRef.current;

      if (mode === 'manual') {
        setRefreshing(true);
      }

      try {
        const detail = await storefrontApi.getOrderDetail(
          orderNumber,
          tokenToUse ?? undefined,
        );
        if (detail.latestPayment?.id && detail.status === 'PENDING_PAYMENT') {
          void storefrontApi
            .getPaymentSummary(detail.latestPayment.id, tokenToUse ?? undefined)
            .catch(() => null);
        }
        setOrder(detail);
        setNeedsAccessProof(false);
        setLoadError(null);
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.status === 401 || err.status === 403) {
            setNeedsAccessProof(true);
            setLoadError(null);
          } else if (err.status === 404 && !tokenToUse) {
            setNeedsAccessProof(true);
            setLoadError(null);
          } else {
            setLoadError({ message: err.message, requestId: err.requestId });
          }
        } else if (mode !== 'poll') {
          setLoadError({ message: 'Unable to retrieve order and payment status.' });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orderNumber],
  );

  useEffect(() => {
    if (queryToken) {
      saveGuestOrderToken(orderNumber, queryToken);
    }
    const resolvedToken =
      overrideToken ?? queryToken ?? readGuestOrderToken(orderNumber);
    activeTokenRef.current = resolvedToken;

    let active = true;
    storefrontApi
      .getOrderDetail(orderNumber, resolvedToken ?? undefined)
      .then((detail) => {
        if (!active) return;
        if (detail.latestPayment?.id && detail.status === 'PENDING_PAYMENT') {
          void storefrontApi
            .getPaymentSummary(detail.latestPayment.id, resolvedToken ?? undefined)
            .catch(() => null);
        }
        setOrder(detail);
        setNeedsAccessProof(false);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError) {
          if (err.status === 401 || err.status === 403) {
            setNeedsAccessProof(true);
            setLoadError(null);
          } else if (err.status === 404 && !resolvedToken) {
            setNeedsAccessProof(true);
            setLoadError(null);
          } else {
            setLoadError({ message: err.message, requestId: err.requestId });
          }
        } else {
          setLoadError({ message: 'Unable to retrieve order and payment status.' });
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
  }, [orderNumber, overrideToken, queryToken]);

  useEffect(() => {
    if (!order || order.status !== 'PENDING_PAYMENT') {
      return;
    }

    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void fetchOrder('poll');
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [fetchOrder, order]);

  const handleUnlockGuestOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = tokenInput.trim();
    if (trimmed.length < 16) {
      setTokenError('Enter the complete guest order access token issued at checkout.');
      return;
    }
    setTokenError(null);
    saveGuestOrderToken(orderNumber, trimmed);
    activeTokenRef.current = trimmed;
    setLoading(true);
    setNeedsAccessProof(false);
    setOverrideToken(trimmed);
  };

  const handleCreatePaymentSession = async () => {
    if (!order || order.status !== 'PENDING_PAYMENT') {
      return;
    }
    setPaymentActionError(null);
    setCreatingPayment(true);
    try {
      const idempotencyKey = createIdempotencyKey();
      const session = await storefrontApi.createPaymentSession(
        order.id,
        idempotencyKey,
        {},
        activeTokenRef.current ?? undefined,
      );
      await fetchOrder('manual');
      toast({
        tone: 'success',
        title: 'Payment session ready',
        description: `Reference ${session.providerReference} is active until ${formatWIB(session.expiresAt)}.`,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setPaymentActionError({ message: err.message, requestId: err.requestId });
      } else {
        setPaymentActionError({
          message: 'Unable to create a payment session right now.',
        });
      }
    } finally {
      setCreatingPayment(false);
    }
  };

  const handleCancelOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order || order.status !== 'PENDING_PAYMENT') {
      return;
    }

    const trimmedReason = cancelReason.trim();
    if (trimmedReason.length > 0 && trimmedReason.length < 3) {
      setCancelReasonError('Cancellation reason must be at least 3 characters.');
      return;
    }

    setCancelReasonError(null);
    setPaymentActionError(null);
    setCancelling(true);

    try {
      const idempotencyKey = createIdempotencyKey();
      const updated = await storefrontApi.cancelOrder(
        order.id,
        idempotencyKey,
        trimmedReason ? { reason: trimmedReason } : {},
        activeTokenRef.current ?? undefined,
      );
      setOrder(updated);
      setCancelConfirmOpen(false);
      setCancelReason('');
      toast({
        tone: 'success',
        title: 'Order cancelled',
        description: `Order ${updated.orderNumber} was cancelled and reserved inventory was released.`,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setPaymentActionError({ message: err.message, requestId: err.requestId });
      } else {
        setPaymentActionError({ message: 'Unable to cancel this order right now.' });
      }
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[38rem]">
        <LoadingState label="Verifying order and payment status with server" rows={6} />
      </div>
    );
  }

  if (needsAccessProof) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div className="space-y-2 border-b border-hairline pb-6">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Order Lookup Verification
          </p>
          <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink">
            Order <span className="font-mono">{orderNumber}</span>
          </h1>
        </div>

        <StatusBanner
          tone="info"
          title="Verification required"
          description="Sign in to the customer account that placed this order or enter your guest order access token to inspect payment status."
        />

        <Surface variant="elevated" border="hairline" padding="lg" className="space-y-5">
          <form onSubmit={handleUnlockGuestOrder} noValidate className="space-y-4">
            <FormField
              id="guest-order-token-input"
              label="Guest Order Access Token"
              hint="Paste the token saved from your checkout confirmation."
              error={tokenError ?? undefined}
              required
            >
              <Input
                id="guest-order-token-input"
                name="guestToken"
                type="password"
                autoComplete="off"
                value={tokenInput}
                onChange={(event) => {
                  setTokenInput(event.target.value);
                  if (tokenError) setTokenError(null);
                }}
                invalid={Boolean(tokenError)}
                aria-describedby={
                  tokenError ? 'guest-order-token-input-error' : 'guest-order-token-input-hint'
                }
              />
            </FormField>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" size="md">
                View Order Status
              </Button>
              <LinkButton
                href={`/auth/login?next=${encodeURIComponent(`/checkout/status/${orderNumber}`)}`}
                variant="secondary"
                size="md"
              >
                Sign In to Account
              </LinkButton>
            </div>
          </form>
        </Surface>
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <ErrorState
        title="Unable to retrieve order status"
        message={loadError?.message ?? 'Order details could not be loaded.'}
        requestId={loadError?.requestId}
        retryLabel="Retry"
        onRetry={() => {
          setLoading(true);
          void fetchOrder('initial');
        }}
      />
    );
  }

  const orderStatusMeta = getOrderStatusMeta(order.status);
  const latestPayment = order.latestPayment;
  const paymentStatusMeta = latestPayment ? getPaymentStatusMeta(latestPayment.status) : null;
  const isPendingPayment = order.status === 'PENDING_PAYMENT';
  const hasActivePaymentLink =
    isPendingPayment &&
    Boolean(latestPayment?.redirectUrl) &&
    latestPayment?.status === 'PENDING';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Order & Payment Verification
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
              Order <span className="font-mono text-2xl sm:text-3xl">{order.orderNumber}</span>
            </h1>
            <Badge tone={orderStatusMeta.tone}>{orderStatusMeta.label}</Badge>
          </div>
          <p className="font-mono text-xs tabular-nums text-ink-muted">
            Placed {formatWIB(order.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            isLoading={refreshing}
            loadingLabel="Refreshing"
            onClick={() => void fetchOrder('manual')}
          >
            <IconRefresh size={16} />
            <span>Refresh Payment Status</span>
          </Button>
          {!order.isGuest ? (
            <LinkButton
              href={`/account/orders/${encodeURIComponent(order.orderNumber)}`}
              variant="ghost"
              size="md"
            >
              Order History Detail
            </LinkButton>
          ) : null}
        </div>
      </div>

      {paymentActionError ? (
        <StatusBanner
          tone="danger"
          title="Payment or cancellation action failed"
          description={paymentActionError.message}
          requestId={paymentActionError.requestId}
          onDismiss={() => setPaymentActionError(null)}
        />
      ) : null}

      {isPendingPayment ? (
        <StatusBanner
          tone="warning"
          title="Awaiting payment confirmation"
          description={`Complete payment before ${formatWIB(order.paymentExpiresAt)}. Order confirmation updates automatically once Midtrans settlement is verified on our server.`}
        />
      ) : order.status === 'PAID' ||
        order.status === 'PROCESSING' ||
        order.status === 'READY_TO_SHIP' ||
        order.status === 'SHIPPED' ||
        order.status === 'DELIVERED' ||
        order.status === 'COMPLETED' ? (
        <StatusBanner
          tone="success"
          title="Payment confirmed"
          description={
            order.paidAt
              ? `Payment settled on ${formatWIB(order.paidAt)}. Your order is confirmed in Jakarta Atelier Main.`
              : 'Payment settlement is confirmed on server.'
          }
        />
      ) : order.status === 'CANCELLED' ? (
        <StatusBanner
          tone="danger"
          title="Order cancelled"
          description="This order was cancelled and its inventory reservation has been released."
        />
      ) : order.status === 'EXPIRED' ? (
        <StatusBanner
          tone="info"
          title="Payment window expired"
          description="The 15-minute payment reservation window elapsed before settlement. Return to the catalog to place a new order."
        />
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        {/* Left: Payment Session & Itemized Receipt */}
        <div className="min-w-0 space-y-6 lg:col-span-7">
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                  Payment Gateway
                </p>
                <h2 className="font-display text-2xl font-normal text-ink">
                  Midtrans Payment Session
                </h2>
              </div>
              {paymentStatusMeta ? (
                <Badge tone={paymentStatusMeta.tone}>{paymentStatusMeta.label}</Badge>
              ) : null}
            </div>

            {latestPayment ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                    Provider Reference
                  </dt>
                  <dd className="font-mono text-xs text-ink break-all">
                    {latestPayment.providerReference}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                    Session Amount
                  </dt>
                  <dd className="whitespace-nowrap font-mono font-medium tabular-nums text-ink">
                    {formatIDR(latestPayment.amountIdr)}
                  </dd>
                </div>
                {latestPayment.snapToken ? (
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                      Snap Token
                    </dt>
                    <dd className="font-mono text-xs text-ink break-all">
                      {latestPayment.snapToken}
                    </dd>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                    {latestPayment.settledAt ? 'Settled (WIB)' : 'Payment Deadline (WIB)'}
                  </dt>
                  <dd className="font-mono text-xs tabular-nums text-ink">
                    {latestPayment.settledAt
                      ? formatWIB(latestPayment.settledAt)
                      : formatWIB(order.paymentExpiresAt)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-ink-muted">
                No payment session has been initialized yet for this order.
              </p>
            )}

            {isPendingPayment ? (
              <div className="space-y-4 border-t border-hairline pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  {hasActivePaymentLink && latestPayment?.redirectUrl ? (
                    <LinkButton
                      href={latestPayment.redirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="primary"
                      size="lg"
                    >
                      Open Payment Link
                    </LinkButton>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      isLoading={creatingPayment}
                      loadingLabel="Creating Session..."
                      onClick={() => void handleCreatePaymentSession()}
                    >
                      Create Payment Session
                    </Button>
                  )}

                  {hasActivePaymentLink ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      isLoading={creatingPayment}
                      loadingLabel="Creating Session..."
                      onClick={() => void handleCreatePaymentSession()}
                    >
                      Create New Payment Session
                    </Button>
                  ) : null}

                  {!cancelConfirmOpen ? (
                    <button
                      ref={cancelOrderButtonRef}
                      type="button"
                      className={buttonClassName({ variant: 'danger', size: 'md' })}
                      onClick={() => setCancelConfirmOpen(true)}
                    >
                      Cancel Order
                    </button>
                  ) : null}
                </div>

                {cancelConfirmOpen ? (
                  <Surface variant="subtle" border="control" padding="md" className="space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-ink">
                        Confirm Order Cancellation
                      </h3>
                      <p className="text-xs leading-relaxed text-ink-muted">
                        Cancelling releases your reserved stock immediately. This action cannot be
                        undone.
                      </p>
                    </div>
                    <form onSubmit={handleCancelOrder} noValidate className="space-y-3">
                      <FormField
                        id="status-cancel-reason"
                        label="Reason (Optional)"
                        error={cancelReasonError ?? undefined}
                      >
                        <Input
                          id="status-cancel-reason"
                          placeholder="Changing garment size or shipping destination"
                          value={cancelReason}
                          onChange={(event) => {
                            setCancelReason(event.target.value);
                            if (cancelReasonError) setCancelReasonError(null);
                          }}
                          invalid={Boolean(cancelReasonError)}
                          aria-describedby={
                            cancelReasonError ? 'status-cancel-reason-error' : undefined
                          }
                        />
                      </FormField>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          type="submit"
                          variant="danger"
                          size="sm"
                          isLoading={cancelling}
                          loadingLabel="Cancelling..."
                        >
                          Confirm Cancellation
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={cancelling}
                          onClick={() => {
                            setCancelConfirmOpen(false);
                            setCancelReasonError(null);
                            window.requestAnimationFrame(() => {
                              cancelOrderButtonRef.current?.focus();
                            });
                          }}
                        >
                          Keep Order
                        </Button>
                      </div>
                    </form>
                  </Surface>
                ) : null}
              </div>
            ) : null}
          </Surface>

          {/* Itemized Receipt */}
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
            <h2 className="font-display text-2xl font-normal text-ink">Itemized Order</h2>
            <Divider />
            <ul className="divide-y divide-hairline">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-ink">{item.productName}</p>
                    <p className="font-mono text-xs text-ink-muted">SKU: {item.sku}</p>
                    <p className="text-xs text-ink-secondary">
                      {item.color} / Size {item.size} / Qty{' '}
                      <span className="font-mono tabular-nums">{item.quantity}</span>
                    </p>
                    <p className="font-mono text-xs tabular-nums text-ink-muted">
                      Unit {formatIDR(item.unitPriceIdr)}
                      {item.discountAllocatedIdr > 0
                        ? ` (Discount -${formatIDR(item.discountAllocatedIdr)})`
                        : ''}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-ink">
                    {formatIDR(item.lineTotalIdr)}
                  </span>
                </li>
              ))}
            </ul>
          </Surface>
        </div>

        {/* Right: Totals & Shipping Snapshot */}
        <aside className="min-w-0 space-y-6 lg:col-span-5">
          <Surface variant="subtle" border="hairline" padding="lg" className="space-y-5">
            <h2 className="font-display text-2xl font-normal text-ink">Receipt Summary</h2>
            <Divider />

            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="whitespace-nowrap font-mono font-medium tabular-nums text-ink">
                  {formatIDR(order.subtotalIdr)}
                </dd>
              </div>
              {order.discountTotalIdr > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted">
                    Promo Discount{' '}
                    {order.couponCodeSnapshot ? (
                      <span className="font-mono text-xs text-ink">
                        ({order.couponCodeSnapshot})
                      </span>
                    ) : null}
                  </dt>
                  <dd className="whitespace-nowrap font-mono font-medium tabular-nums text-success-fg">
                    -{formatIDR(order.discountTotalIdr)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">
                  Shipping ({order.shippingProvider} / {order.shippingService})
                </dt>
                <dd className="whitespace-nowrap font-mono font-medium tabular-nums text-ink">
                  {formatIDR(order.shippingTotalIdr)}
                </dd>
              </div>
            </dl>

            <Divider />

            <dl className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                  Grand Total
                </dt>
                <dd className="whitespace-nowrap font-mono text-xl font-medium tabular-nums text-ink">
                  {formatIDR(order.grandTotalIdr)}
                </dd>
              </div>
            </dl>
          </Surface>

          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-3">
            <h2 className="font-display text-2xl font-normal text-ink">Shipping Destination</h2>
            <Divider />
            <div className="space-y-1 text-sm text-ink-secondary">
              <p className="font-medium text-ink">{order.addressSnapshot.recipientName}</p>
              <p className="font-mono text-xs text-ink-muted">{order.addressSnapshot.phone}</p>
              <p>{order.addressSnapshot.line1}</p>
              {order.addressSnapshot.line2 ? <p>{order.addressSnapshot.line2}</p> : null}
              {order.addressSnapshot.subdistrict ? (
                <p>{order.addressSnapshot.subdistrict}</p>
              ) : null}
              <p>
                {order.addressSnapshot.city}, {order.addressSnapshot.province}{' '}
                {order.addressSnapshot.postalCode}
              </p>
              <p className="font-mono text-xs uppercase text-ink-muted">
                {order.addressSnapshot.countryCode}
              </p>
            </div>
          </Surface>

          <LinkButton href="/shop" variant="secondary" size="md" fullWidth>
            Continue Shopping
          </LinkButton>
        </aside>
      </div>
    </div>
  );
}
