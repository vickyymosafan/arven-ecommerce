'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { OrderDetailDto } from '@arven/contracts';
import { createCustomerReturnSchema } from '@arven/validators';
import {
  Badge,
  Button,
  Checkbox,
  Divider,
  ErrorState,
  FormField,
  IconChevronLeft,
  Input,
  LinkButton,
  LoadingState,
  Modal,
  Select,
  StatusBanner,
  Surface,
  Textarea,
  buttonClassName,
  formatIDR,
  formatWIB,
  useToast,
} from '@arven/ui';
import { AccountShell } from '@/components/account-shell';
import { ApiClientError, createIdempotencyKey, storefrontApi } from '@/lib/api-client';
import {
  CUSTOMER_RETURN_REASONS,
  clampReturnQuantity,
  formatOrderStatusLabel,
  getOrderStatusMeta,
  getPaymentStatusMeta,
  isOrderReturnEligible,
  isOrderReturnInProgress,
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

  // Customer Return Request Modal State
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedReturnItems, setSelectedReturnItems] = useState<
    Record<string, { selected: boolean; quantity: number }>
  >({});
  const [returnReason, setReturnReason] = useState('SIZE_FIT');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnIdempotencyKey, setReturnIdempotencyKey] = useState('');
  const [returnError, setReturnError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [submittingReturn, setSubmittingReturn] = useState(false);

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

  const openReturnModal = () => {
    if (!order) return;
    const initialSelection: Record<string, { selected: boolean; quantity: number }> = {};
    order.items.forEach((item, index) => {
      initialSelection[item.id] = {
        selected: index === 0,
        quantity: 1,
      };
    });
    setSelectedReturnItems(initialSelection);
    setReturnReason('SIZE_FIT');
    setReturnNotes('');
    setReturnError(null);
    setReturnIdempotencyKey(createIdempotencyKey());
    setReturnModalOpen(true);
  };

  const handleSubmitReturn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order || !isOrderReturnEligible(order.status)) {
      return;
    }
    setReturnError(null);

    const items = order.items
      .filter((item) => selectedReturnItems[item.id]?.selected)
      .map((item) => ({
        orderItemId: item.id,
        quantity: clampReturnQuantity(
          selectedReturnItems[item.id]?.quantity ?? 1,
          item.quantity,
        ),
      }));

    if (items.length === 0) {
      setReturnError({ message: 'Select at least one garment item to return.' });
      return;
    }

    const trimmedNotes = returnNotes.trim();
    if (trimmedNotes.length < 3) {
      setReturnError({
        message: 'Please provide return details (at least 3 characters) for our atelier review.',
      });
      return;
    }

    const parsed = createCustomerReturnSchema.safeParse({
      reason: returnReason,
      customerNotes: trimmedNotes,
      items,
    });

    if (!parsed.success) {
      setReturnError({
        message: parsed.error.issues[0]?.message ?? 'Please review the return request fields.',
      });
      return;
    }

    setSubmittingReturn(true);
    try {
      await storefrontApi.createCustomerReturn(
        order.id,
        parsed.data,
        returnIdempotencyKey,
      );
      setReturnModalOpen(false);
      toast({
        tone: 'success',
        title: 'Return request submitted',
        description: `Track inspection and refund updates for ${order.orderNumber} in My Returns.`,
      });
      router.push('/account/returns');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        router.replace(
          `/auth/login?next=${encodeURIComponent(`/account/orders/${orderNumber}`)}`,
        );
        return;
      }
      if (err instanceof ApiClientError) {
        setReturnError({ message: err.message, requestId: err.requestId });
      } else {
        setReturnError({ message: 'Unable to submit return request right now.' });
      }
    } finally {
      setSubmittingReturn(false);
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

              {isOrderReturnEligible(order.status) ? (
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-ink">Delivered Order Return Window</p>
                    <p className="text-xs text-ink-muted">
                      Eligible unworn pieces may be submitted for return inspection and refund.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    className="min-h-11"
                    onClick={openReturnModal}
                  >
                    Request Return
                  </Button>
                </div>
              ) : isOrderReturnInProgress(order.status) ? (
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-ink">Return Request Active</p>
                    <p className="text-xs text-ink-muted">
                      Review current return triage, physical receipt status, and refund progress.
                    </p>
                  </div>
                  <LinkButton
                    href="/account/returns"
                    variant="secondary"
                    size="md"
                    className="min-h-11"
                  >
                    View Return Status
                  </LinkButton>
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

      {/* Customer Return Request Modal */}
      <Modal
        isOpen={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        title={order ? `Request Return: ${order.orderNumber}` : 'Request Return'}
        description="Select eligible delivered pieces, choose return quantities, and describe the condition."
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={submittingReturn}
              onClick={() => setReturnModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="customer-return-request-form"
              variant="primary"
              isLoading={submittingReturn}
              loadingLabel="Submitting Return Request..."
            >
              Submit Return Request
            </Button>
          </>
        }
      >
        {order ? (
          <form
            id="customer-return-request-form"
            onSubmit={handleSubmitReturn}
            noValidate
            className="space-y-5"
          >
            {returnError ? (
              <StatusBanner
                tone="danger"
                title="Return request could not be submitted"
                description={returnError.message}
                requestId={returnError.requestId}
              />
            ) : null}

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                1. Select Items to Return
              </p>
              <div className="space-y-3">
                {order.items.map((item) => {
                  const selection = selectedReturnItems[item.id] ?? {
                    selected: false,
                    quantity: 1,
                  };
                  const qtyOptions = Array.from(
                    { length: item.quantity },
                    (_, i) => i + 1,
                  );

                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-sm)] border border-control-border bg-subtle p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--arven-focus-ring)] has-[:focus-visible]:outline-offset-2"
                    >
                      <div className="min-w-0 flex-1">
                        <Checkbox
                          id={`return-item-check-${item.id}`}
                          label={item.productName}
                          description={`SKU: ${item.sku} | ${item.color} / Size ${item.size} | Purchased Qty: ${item.quantity}`}
                          checked={selection.selected}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelectedReturnItems((prev) => ({
                              ...prev,
                              [item.id]: {
                                selected: checked,
                                quantity: prev[item.id]?.quantity ?? 1,
                              },
                            }));
                          }}
                        />
                      </div>

                      <div className="w-28 shrink-0">
                        <FormField id={`return-item-qty-${item.id}`} label="Return Qty">
                          <Select
                            id={`return-item-qty-${item.id}`}
                            disabled={!selection.selected}
                            value={String(selection.quantity)}
                            onChange={(event) => {
                              const nextQty = Number.parseInt(event.target.value, 10) || 1;
                              setSelectedReturnItems((prev) => ({
                                ...prev,
                                [item.id]: {
                                  selected: prev[item.id]?.selected ?? true,
                                  quantity: clampReturnQuantity(nextQty, item.quantity),
                                },
                              }));
                            }}
                            className="font-mono tabular-nums"
                          >
                            {qtyOptions.map((qty) => (
                              <option key={qty} value={String(qty)}>
                                {qty}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <FormField id="customer-return-reason" label="2. Return Reason" required>
              <Select
                id="customer-return-reason"
                value={returnReason}
                onChange={(event) => setReturnReason(event.target.value)}
              >
                {CUSTOMER_RETURN_REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              id="customer-return-notes"
              label="3. Condition & Return Notes"
              hint="Describe sizing feedback, packaging seal state, or any defect observed."
              required
            >
              <Textarea
                id="customer-return-notes"
                rows={3}
                value={returnNotes}
                onChange={(event) => setReturnNotes(event.target.value)}
                placeholder="Garment unworn with original atelier tags intact; requesting size exchange/refund."
                required
              />
            </FormField>
          </form>
        ) : null}
      </Modal>
    </AccountShell>
  );
}
