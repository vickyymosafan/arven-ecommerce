'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { OrderDetailDto } from '@arven/contracts';
import {
  Badge,
  Button,
  Divider,
  ErrorState,
  FormField,
  IconChevronLeft,
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
import { AccountShell } from '@/components/account-shell';
import { ApiClientError, createIdempotencyKey, storefrontApi } from '@/lib/api-client';
import {
  formatOrderStatusLabel,
  getOrderStatusMeta,
  getPaymentStatusMeta,
} from '@/lib/format';

export interface OrderDetailViewProps {
  orderNumber: string;
}

export function OrderDetailView({ orderNumber }: OrderDetailViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const cancelOrderButtonRef = useRef<HTMLButtonElement | null>(null);
  const [actionError, setActionError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;

    storefrontApi
      .getOrderDetail(orderNumber)
      .then((detail) => {
        if (!active) return;
        setOrder(detail);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 401) {
          router.replace(
            `/auth/login?next=${encodeURIComponent(`/account/orders/${orderNumber}`)}`,
          );
          return;
        }
        if (err instanceof ApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load order details right now.' });
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
  }, [orderNumber, reloadNonce, router]);

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
    setActionError(null);
    setCancelling(true);

    try {
      const idempotencyKey = createIdempotencyKey();
      const updated = await storefrontApi.cancelOrder(
        order.id,
        idempotencyKey,
        trimmedReason ? { reason: trimmedReason } : {},
      );
      setOrder(updated);
      setCancelConfirmOpen(false);
      setCancelReason('');
      toast({
        tone: 'success',
        title: 'Order cancelled',
        description: `Order ${updated.orderNumber} was cancelled and reserved stock was released.`,
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        router.replace(
          `/auth/login?next=${encodeURIComponent(`/account/orders/${orderNumber}`)}`,
        );
        return;
      }
      if (err instanceof ApiClientError) {
        setActionError({ message: err.message, requestId: err.requestId });
      } else {
        setActionError({ message: 'Unable to cancel this order right now.' });
      }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <AccountShell
      title={`Order ${orderNumber}`}
      description="Inspect itemized order snapshots, delivery destination, payment records, and server status history."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/account/orders"
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
          >
            <IconChevronLeft size={16} />
            <span>Back to Order History</span>
          </Link>
        </div>

        {loading ? (
          <div className="min-h-[34rem]">
            <LoadingState label="Loading order snapshot and status history" rows={5} />
          </div>
        ) : loadError || !order ? (
          <ErrorState
            title="Could not load order details"
            message={loadError?.message ?? 'Order was not found on this account.'}
            requestId={loadError?.requestId}
            retryLabel="Retry"
            onRetry={retryLoad}
          />
        ) : (
          <div className="space-y-6">
            {actionError ? (
              <StatusBanner
                tone="danger"
                title="Order update failed"
                description={actionError.message}
                requestId={actionError.requestId}
                onDismiss={() => setActionError(null)}
              />
            ) : null}

            {/* Order Status Header */}
            <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
                    Order Snapshot
                  </p>
                  <h2 className="font-mono text-xl font-semibold text-ink">
                    {order.orderNumber}
                  </h2>
                  <p className="font-mono text-xs tabular-nums text-ink-muted">
                    Placed {formatWIB(order.createdAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={getOrderStatusMeta(order.status).tone}>
                    {getOrderStatusMeta(order.status).label}
                  </Badge>
                  {order.latestPayment ? (
                    <Badge tone={getPaymentStatusMeta(order.latestPayment.status).tone}>
                      {getPaymentStatusMeta(order.latestPayment.status).label}
                    </Badge>
                  ) : null}
                </div>
              </div>

              {order.status === 'PENDING_PAYMENT' ? (
                <div className="space-y-4 border-t border-hairline pt-4">
                  <StatusBanner
                    tone="warning"
                    title="Payment awaiting completion"
                    description={`Inventory remains reserved until ${formatWIB(order.paymentExpiresAt)}.`}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <LinkButton
                      href={`/checkout/status/${encodeURIComponent(order.orderNumber)}`}
                      variant="primary"
                      size="md"
                    >
                      Continue to Payment
                    </LinkButton>
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
                          Cancelling this pending order releases reserved pieces immediately.
                        </p>
                      </div>
                      <form onSubmit={handleCancelOrder} noValidate className="space-y-3">
                        <FormField
                          id="account-cancel-reason"
                          label="Reason (Optional)"
                          error={cancelReasonError ?? undefined}
                        >
                          <Input
                            id="account-cancel-reason"
                            placeholder="Adjusting order items"
                            value={cancelReason}
                            onChange={(event) => {
                              setCancelReason(event.target.value);
                              if (cancelReasonError) setCancelReasonError(null);
                            }}
                            invalid={Boolean(cancelReasonError)}
                            aria-describedby={
                              cancelReasonError ? 'account-cancel-reason-error' : undefined
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

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
              {/* Line Items & Status Timeline */}
              <div className="min-w-0 space-y-6 lg:col-span-7">
                <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
                  <h2 className="font-display text-2xl font-normal text-ink">Ordered Garments</h2>
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

                <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
                  <h2 className="font-display text-2xl font-normal text-ink">Status Timeline</h2>
                  <Divider />
                  {order.statusHistory.length === 0 ? (
                    <p className="text-sm text-ink-muted">No status transitions recorded yet.</p>
                  ) : (
                    <ol className="space-y-4">
                      {order.statusHistory.map((entry) => {
                        const targetMeta = getOrderStatusMeta(entry.toStatus);
                        return (
                          <li
                            key={entry.id}
                            className="flex flex-col gap-1 border-b border-hairline pb-3 last:border-b-0 last:pb-0"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge tone={targetMeta.tone}>{targetMeta.label}</Badge>
                                {entry.fromStatus ? (
                                  <span className="font-mono text-xs text-ink-muted">
                                    from {formatOrderStatusLabel(entry.fromStatus)}
                                  </span>
                                ) : null}
                              </div>
                              <span className="font-mono text-xs tabular-nums text-ink-muted">
                                {formatWIB(entry.createdAt)}
                              </span>
                            </div>
                            {entry.reason ? (
                              <p className="text-xs text-ink-secondary">{entry.reason}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </Surface>
              </div>

              {/* Right Column: Summary, Shipping, Payment */}
              <div className="min-w-0 space-y-6 lg:col-span-5">
                <Surface variant="subtle" border="hairline" padding="lg" className="space-y-5">
                  <h2 className="font-display text-2xl font-normal text-ink">Payment Totals</h2>
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
                  <h2 className="font-display text-2xl font-normal text-ink">
                    Delivery Destination
                  </h2>
                  <Divider />
                  <div className="space-y-1 text-sm text-ink-secondary">
                    <p className="font-medium text-ink">{order.addressSnapshot.recipientName}</p>
                    <p className="font-mono text-xs text-ink-muted">
                      {order.addressSnapshot.phone}
                    </p>
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

                {order.latestPayment ? (
                  <Surface variant="elevated" border="hairline" padding="lg" className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-display text-2xl font-normal text-ink">
                        Payment Record
                      </h2>
                      <Badge tone={getPaymentStatusMeta(order.latestPayment.status).tone}>
                        {getPaymentStatusMeta(order.latestPayment.status).label}
                      </Badge>
                    </div>
                    <Divider />
                    <dl className="space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-ink-muted">Gateway</dt>
                        <dd className="font-mono text-xs uppercase text-ink">
                          {order.latestPayment.provider}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-ink-muted">Reference</dt>
                        <dd className="font-mono text-xs text-ink break-all text-right">
                          {order.latestPayment.providerReference}
                        </dd>
                      </div>
                      {order.latestPayment.method ? (
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-ink-muted">Method</dt>
                          <dd className="font-mono text-xs text-ink">
                            {order.latestPayment.method}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-ink-muted">Amount</dt>
                        <dd className="whitespace-nowrap font-mono font-medium tabular-nums text-ink">
                          {formatIDR(order.latestPayment.amountIdr)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-ink-muted">
                          {order.latestPayment.settledAt ? 'Settled (WIB)' : 'Expires (WIB)'}
                        </dt>
                        <dd className="font-mono text-xs tabular-nums text-ink">
                          {order.latestPayment.settledAt
                            ? formatWIB(order.latestPayment.settledAt)
                            : formatWIB(order.latestPayment.expiresAt)}
                        </dd>
                      </div>
                    </dl>
                  </Surface>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </AccountShell>
  );
}
