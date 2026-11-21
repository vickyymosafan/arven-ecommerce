'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AdminOrderDetailDto, ShipmentDto } from '@arven/contracts';
import {
  adminCreateShipmentSchema,
  requestRefundSchema,
} from '@arven/validators';
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
import { AdminForbiddenPanel } from '@/components/admin-forbidden-panel';
import { AdminShell } from '@/components/admin-shell';
import {
  AdminApiClientError,
  adminApi,
  extractAdminFieldErrors,
  generateIdempotencyKey,
} from '@/lib/api-client';
import {
  computeOrderRefundSummary,
  formatStatusLabel,
  getOrderStatusBadge,
  getPaymentStatusBadge,
  getRefundStatusBadge,
  getReturnStatusBadge,
  getShipmentStatusBadge,
} from '@/lib/ops-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

const SHIPPABLE_STATUSES = new Set(['PAID', 'PROCESSING', 'READY_TO_SHIP']);
const ADMIN_CANCELLABLE_STATUSES = new Set([
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'READY_TO_SHIP',
]);

export interface AdminOrderDetailViewProps {
  orderId: string;
}

export function AdminOrderDetailView({ orderId }: AdminOrderDetailViewProps) {
  const { toast } = useToast();
  const { user, loading: sessionLoading, error: sessionError, canAccess, reload } =
    useAdminSession();

  const hasOrdersAccess = canAccess([
    'order.read',
    'order.read.limited',
    'order.fulfill',
    'order.cancel',
  ]);
  const canReadOrders = canAccess(['order.read', 'order.read.limited']);
  const canFulfill = canAccess(['order.fulfill']);
  const canCancel = canAccess(['order.cancel']);
  const canRequestRefund = canAccess(['refund.request']);

  const [order, setOrder] = useState<AdminOrderDetailDto | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );
  const [reloadNonce, setReloadNonce] = useState(0);
  const [transitioningTo, setTransitioningTo] = useState<string | null>(null);
  const [syncingShipmentId, setSyncingShipmentId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<{
    message: string;
    requestId?: string | null;
    isConflict?: boolean;
  } | null>(null);

  // Create Shipment Modal State
  const [shipmentModalOpen, setShipmentModalOpen] = useState(false);
  const [shipProvider, setShipProvider] = useState<'jne-adapter' | 'sicepat-adapter'>('jne-adapter');
  const [shipServiceCode, setShipServiceCode] = useState('REG');
  const [shipWarehouseCode, setShipWarehouseCode] = useState('JKT-MAIN-01');
  const [shipDispatchNote, setShipDispatchNote] = useState('');
  const [shipIdempotencyKey, setShipIdempotencyKey] = useState('');
  const [shipFieldErrors, setShipFieldErrors] = useState<Record<string, string>>({});
  const [shipError, setShipError] = useState<{
    message: string;
    isConflict?: boolean;
    requestId?: string | null;
  } | null>(null);
  const [creatingShipment, setCreatingShipment] = useState(false);

  // Cancel Order Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);

  // Request Refund Modal State
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [refundReturnId, setRefundReturnId] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState('');
  const [refundFieldErrors, setRefundFieldErrors] = useState<Record<string, string>>({});
  const [refundBannerError, setRefundBannerError] = useState<string | null>(null);
  const [requestingRefund, setRequestingRefund] = useState(false);

  const fetchOrder = useCallback(() => {
    if (!user || !canReadOrders) {
      return;
    }
    setLoadingOrder(true);
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, [canReadOrders, user]);

  useEffect(() => {
    if (sessionLoading || !user || !canReadOrders) {
      return;
    }

    let active = true;
    adminApi
      .getOrderById(orderId)
      .then((detail) => {
        if (!active) return;
        setOrder(detail);
        setLoadError(null);
        setWorkspaceError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load order detail right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingOrder(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canReadOrders, orderId, reloadNonce, sessionLoading, user]);

  const refundSummary = useMemo(
    () => (order ? computeOrderRefundSummary(order) : null),
    [order],
  );

  const hasActiveConflictingShipment = useMemo(() => {
    if (!order) return false;
    return order.shipments.some(
      (s) => s.status !== 'FAILED' && s.status !== 'RETURNED',
    );
  }, [order]);

  const canCreateShipment = Boolean(
    order &&
      canFulfill &&
      SHIPPABLE_STATUSES.has(order.status) &&
      !hasActiveConflictingShipment,
  );

  const openShipmentModal = () => {
    if (!order) return;
    setShipProvider(
      order.shippingProvider === 'sicepat-adapter' ? 'sicepat-adapter' : 'jne-adapter',
    );
    setShipServiceCode(order.shippingService || 'REG');
    setShipWarehouseCode('JKT-MAIN-01');
    setShipDispatchNote('');
    setShipFieldErrors({});
    setShipError(null);
    setShipIdempotencyKey(generateIdempotencyKey('admin-shp'));
    setShipmentModalOpen(true);
  };

  const openRefundModal = () => {
    if (!order || !refundSummary) return;
    setRefundAmountInput(String(refundSummary.remainingRefundableIdr));
    const eligibleRet = order.returns.find(
      (r) => r.status === 'APPROVED' || r.status === 'RECEIVED',
    );
    setRefundReturnId(eligibleRet?.id ?? '');
    setRefundReason('');
    setRefundFieldErrors({});
    setRefundBannerError(null);
    setRefundIdempotencyKey(generateIdempotencyKey('admin-rfd'));
    setRefundModalOpen(true);
  };

  const handleTransitionStatus = async (toStatus: 'PROCESSING' | 'READY_TO_SHIP') => {
    if (!order) return;
    setTransitioningTo(toStatus);
    setWorkspaceError(null);
    try {
      const updated = await adminApi.transitionOrder(order.id, { toStatus });
      setOrder(updated);
      toast({
        tone: 'success',
        title: `Order moved to ${formatStatusLabel(toStatus)}`,
        description: `Order ${updated.orderNumber} updated in status history.`,
      });
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setWorkspaceError({
          message: err.message,
          requestId: err.requestId,
          isConflict: err.status === 409,
        });
      } else {
        setWorkspaceError({ message: 'Unable to transition order status right now.' });
      }
    } finally {
      setTransitioningTo(null);
    }
  };

  const handleConfirmCancelOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order) return;
    const trimmed = cancelReason.trim();
    if (trimmed.length < 3) {
      setCancelError('Please enter a cancellation reason (minimum 3 characters).');
      return;
    }

    setCancelError(null);
    setCancellingOrder(true);
    try {
      const updated = await adminApi.transitionOrder(order.id, {
        toStatus: 'CANCELLED',
        reason: trimmed,
      });
      setOrder(updated);
      setCancelModalOpen(false);
      setCancelReason('');
      toast({
        tone: 'success',
        title: 'Order cancelled',
        description: `Order ${updated.orderNumber} cancelled and any active reservations released.`,
      });
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setCancelError(err.message);
      } else {
        setCancelError('Unable to cancel order right now.');
      }
    } finally {
      setCancellingOrder(false);
    }
  };

  const handleCreateShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order) return;

    setShipFieldErrors({});
    setShipError(null);

    const parsed = adminCreateShipmentSchema.safeParse({
      provider: shipProvider,
      serviceCode: shipServiceCode,
      warehouseCode: shipWarehouseCode,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'serviceCode');
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setShipFieldErrors(nextErrors);
      return;
    }

    setCreatingShipment(true);
    try {
      const shipment = await adminApi.createShipment(
        order.id,
        parsed.data,
        shipIdempotencyKey,
      );
      setShipmentModalOpen(false);
      await fetchOrder();
      toast({
        tone: 'success',
        title: 'Shipment created & dispatched',
        description: shipment.trackingNumber
          ? `Tracking ${shipment.trackingNumber} registered (${shipment.provider}).`
          : 'Shipment dispatched.',
      });
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        const detailsMap = extractAdminFieldErrors(err);
        setShipFieldErrors(detailsMap);
        setShipError({
          message: err.message,
          isConflict: err.status === 409,
          requestId: err.requestId,
        });
      } else {
        setShipError({ message: 'Unable to create shipment right now.' });
      }
    } finally {
      setCreatingShipment(false);
    }
  };

  const handleSyncTracking = async (shipment: ShipmentDto) => {
    setSyncingShipmentId(shipment.id);
    setWorkspaceError(null);
    try {
      const updatedShipment = await adminApi.syncShipmentTracking(shipment.id);
      await fetchOrder();
      toast({
        tone: 'success',
        title: 'Tracking synchronized',
        description: `Shipment ${updatedShipment.trackingNumber ?? updatedShipment.id} is ${formatStatusLabel(updatedShipment.status)}.`,
      });
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setWorkspaceError({
          message: err.message,
          requestId: err.requestId,
          isConflict: err.status === 409,
        });
      } else {
        setWorkspaceError({ message: 'Unable to sync shipment tracking right now.' });
      }
    } finally {
      setSyncingShipmentId(null);
    }
  };

  const handleRequestRefund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order || !refundSummary) return;

    setRefundFieldErrors({});
    setRefundBannerError(null);

    const amountNumber = Number.parseInt(refundAmountInput.replace(/\D/g, ''), 10);
    const payload = {
      amountIdr: Number.isFinite(amountNumber) ? amountNumber : 0,
      reason: refundReason.trim(),
      ...(refundReturnId ? { returnId: refundReturnId } : {}),
    };

    const parsed = requestRefundSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'amountIdr');
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setRefundFieldErrors(nextErrors);
      return;
    }

    if (parsed.data.amountIdr > refundSummary.remainingRefundableIdr) {
      setRefundFieldErrors({
        amountIdr: `Amount exceeds refundable ceiling (${formatIDR(refundSummary.remainingRefundableIdr)}).`,
      });
      return;
    }

    setRequestingRefund(true);
    try {
      const refund = await adminApi.requestRefund(
        order.id,
        parsed.data,
        refundIdempotencyKey,
      );
      setRefundModalOpen(false);
      await fetchOrder();
      toast({
        tone: 'success',
        title: 'Refund request submitted',
        description: `Refund ${refund.refundKey} (${formatIDR(refund.amountIdr)}) awaits OWNER MFA step-up approval on /returns.`,
      });
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        const detailsMap = extractAdminFieldErrors(err);
        setRefundFieldErrors(detailsMap);
        setRefundBannerError(err.message);
      } else {
        setRefundBannerError('Unable to submit refund request right now.');
      }
    } finally {
      setRequestingRefund(false);
    }
  };

  const orderStatusBadge = order ? getOrderStatusBadge(order.status) : null;
  const latestPaymentBadge = order?.latestPayment
    ? getPaymentStatusBadge(order.latestPayment.status)
    : null;

  return (
    <AdminShell
      title={order ? `Order ${order.orderNumber}` : 'Order Fulfillment Workspace'}
      description="Inspect order items, manage shipments and carrier tracking sync, and initiate dual-step refund requests."
      user={user}
      actions={
        <Link
          href="/orders"
          className={buttonClassName({ variant: 'secondary', size: 'sm' })}
        >
          <IconChevronLeft size={16} />
          <span>Back to Orders</span>
        </Link>
      }
    >
      {sessionLoading ? (
        <LoadingState label="Checking order permissions" rows={5} />
      ) : sessionError ? (
        <ErrorState
          title="Unable to verify staff session"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reload()}
        />
      ) : !hasOrdersAccess || !canReadOrders ? (
        <AdminForbiddenPanel description="Inspecting order details requires order.read or order.read.limited permission." />
      ) : loadingOrder ? (
        <LoadingState label="Loading order record, shipments, and payment ledger" rows={6} />
      ) : loadError || !order ? (
        <ErrorState
          title="Could not load order record"
          message={loadError?.message ?? 'Order was not found.'}
          requestId={loadError?.requestId}
          onRetry={() => void fetchOrder()}
        />
      ) : (
        <div className="space-y-6">
          {order.piiMasked ? (
            <StatusBanner
              tone="info"
              title="Limited Support View"
              description="Customer contact PII is masked and raw payment gateway payloads are redacted under order.read.limited."
            />
          ) : null}

          {workspaceError ? (
            <StatusBanner
              tone="danger"
              title={workspaceError.isConflict ? 'Order State Conflict' : 'Operation Failed'}
              description={workspaceError.message}
              requestId={workspaceError.requestId}
              action={
                workspaceError.isConflict ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void fetchOrder()}
                  >
                    Reload Order
                  </Button>
                ) : undefined
              }
              onDismiss={() => setWorkspaceError(null)}
            />
          ) : null}

          {/* Top Status Strip */}
          <Surface variant="elevated" border="hairline" padding="md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-lg font-semibold text-ink">
                    {order.orderNumber}
                  </span>
                  {orderStatusBadge ? (
                    <Badge tone={orderStatusBadge.tone}>{orderStatusBadge.label}</Badge>
                  ) : null}
                  {latestPaymentBadge ? (
                    <Badge tone={latestPaymentBadge.tone}>{latestPaymentBadge.label}</Badge>
                  ) : null}
                  {order.piiMasked ? <Badge tone="warning">PII Masked</Badge> : null}
                </div>
                <p className="font-mono text-xs tabular-nums text-ink-muted">
                  Placed: {formatWIB(order.createdAt)}
                  {order.paidAt ? ` | Paid: ${formatWIB(order.paidAt)}` : ''}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                onClick={() => void fetchOrder()}
              >
                Reload Order
              </Button>
            </div>
          </Surface>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            {/* Left Column (7 cols) */}
            <div className="min-w-0 space-y-6 lg:col-span-7">
              {/* Line Items Card */}
              <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
                <h2 className="font-display text-2xl font-normal text-ink">Line Items</h2>
                <Divider />
                <div className="space-y-3 md:hidden">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="space-y-2 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3.5 text-sm"
                    >
                      <div className="space-y-0.5">
                        <p className="font-medium text-ink">{item.productName}</p>
                        <p className="font-mono text-xs text-ink-muted">SKU: {item.sku}</p>
                        <p className="text-xs text-ink-secondary">
                          {item.color} / Size {item.size}
                        </p>
                      </div>
                      <dl className="space-y-1 border-t border-hairline pt-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-ink-muted">Unit Price</dt>
                          <dd className="font-mono tabular-nums text-ink-secondary">
                            {formatIDR(item.unitPriceIdr)} x {item.quantity}
                          </dd>
                        </div>
                        {item.discountAllocatedIdr > 0 ? (
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-ink-muted">Discount</dt>
                            <dd className="font-mono tabular-nums text-success-fg">
                              -{formatIDR(item.discountAllocatedIdr)}
                            </dd>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <dt className="font-medium text-ink">Line Total</dt>
                          <dd className="font-mono font-medium tabular-nums text-ink">
                            {formatIDR(item.lineTotalIdr)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-hairline text-xs uppercase tracking-[0.06em] text-ink-muted">
                        <th className="py-2 pr-3 font-medium">Piece / Variant</th>
                        <th className="py-2 px-3 text-right font-medium">Qty</th>
                        <th className="py-2 px-3 text-right font-medium">Unit</th>
                        <th className="py-2 pl-3 text-right font-medium">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {order.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-3 pr-3 align-top">
                            <p className="font-medium text-ink">{item.productName}</p>
                            <p className="font-mono text-xs text-ink-muted">SKU: {item.sku}</p>
                            <p className="text-xs text-ink-secondary">
                              {item.color} / Size {item.size}
                            </p>
                            {item.discountAllocatedIdr > 0 ? (
                              <p className="font-mono text-xs tabular-nums text-success-fg">
                                Discount: -{formatIDR(item.discountAllocatedIdr)}
                              </p>
                            ) : null}
                          </td>
                          <td className="py-3 px-3 text-right align-top font-mono tabular-nums text-ink">
                            {item.quantity}
                          </td>
                          <td className="py-3 px-3 text-right align-top whitespace-nowrap font-mono tabular-nums text-ink-secondary">
                            {formatIDR(item.unitPriceIdr)}
                          </td>
                          <td className="py-3 pl-3 text-right align-top whitespace-nowrap font-mono font-medium tabular-nums text-ink">
                            {formatIDR(item.lineTotalIdr)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <dl className="space-y-2 border-t border-hairline pt-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Subtotal</dt>
                    <dd className="font-mono tabular-nums text-ink">
                      {formatIDR(order.subtotalIdr)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">
                      Coupon Discount{' '}
                      {order.couponCodeSnapshot ? (
                        <span className="font-mono text-xs text-ink">
                          ({order.couponCodeSnapshot})
                        </span>
                      ) : null}
                    </dt>
                    <dd className="font-mono tabular-nums text-success-fg">
                      -{formatIDR(order.discountTotalIdr)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">
                      Shipping ({order.shippingProvider} / {order.shippingService})
                    </dt>
                    <dd className="font-mono tabular-nums text-ink">
                      {formatIDR(order.shippingTotalIdr)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2">
                    <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                      Grand Total
                    </dt>
                    <dd className="font-mono text-lg font-medium tabular-nums text-ink">
                      {formatIDR(order.grandTotalIdr)}
                    </dd>
                  </div>
                </dl>
              </Surface>

              {/* Shipments & Tracking Card */}
              <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-2xl font-normal text-ink">
                    Shipments &amp; Tracking
                  </h2>
                  {canFulfill && SHIPPABLE_STATUSES.has(order.status) ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="min-h-11"
                      disabled={!canCreateShipment}
                      onClick={openShipmentModal}
                    >
                      Create Shipment
                    </Button>
                  ) : null}
                </div>
                <Divider />

                {order.shipments.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    No carrier shipments created for this order yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {order.shipments.map((shipment) => {
                      const sBadge = getShipmentStatusBadge(shipment.status);
                      return (
                        <div
                          key={shipment.id}
                          className="space-y-3 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge tone={sBadge.tone}>{sBadge.label}</Badge>
                                <span className="font-mono text-xs text-ink">
                                  {shipment.provider} ({shipment.serviceCode})
                                </span>
                                {shipment.warehouseCode ? (
                                  <span className="font-mono text-xs text-ink-muted">
                                    WH: {shipment.warehouseCode}
                                  </span>
                                ) : null}
                              </div>
                              <p className="font-mono text-sm font-medium text-ink">
                                Tracking: {shipment.trackingNumber ?? 'Pending AWB'}
                              </p>
                              <p className="font-mono text-xs tabular-nums text-ink-muted">
                                Shipped: {formatWIB(shipment.shippedAt)}
                                {shipment.deliveredAt
                                  ? ` | Delivered: ${formatWIB(shipment.deliveredAt)}`
                                  : ''}
                              </p>
                            </div>

                            {canFulfill ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="min-h-11"
                                isLoading={syncingShipmentId === shipment.id}
                                loadingLabel="Syncing"
                                onClick={() => void handleSyncTracking(shipment)}
                              >
                                Sync Tracking
                              </Button>
                            ) : null}
                          </div>

                          {shipment.events.length > 0 ? (
                            <ol className="space-y-2 border-t border-hairline pt-3">
                              {shipment.events.map((evt) => (
                                <li
                                  key={evt.id}
                                  className="flex flex-wrap items-start justify-between gap-2 text-xs"
                                >
                                  <div className="space-y-0.5">
                                    <p className="font-medium text-ink">
                                      {evt.description}
                                    </p>
                                    {evt.location ? (
                                      <p className="text-ink-muted">{evt.location}</p>
                                    ) : null}
                                  </div>
                                  <span className="font-mono tabular-nums text-ink-muted">
                                    {formatWIB(evt.occurredAt)}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Surface>

              {/* Status History & Payment/Refund Summary */}
              <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
                <h2 className="font-display text-2xl font-normal text-ink">
                  Order Status History
                </h2>
                <Divider />
                {order.statusHistory.length === 0 ? (
                  <p className="text-sm text-ink-muted">No status transitions recorded.</p>
                ) : (
                  <ol className="space-y-3">
                    {order.statusHistory.map((entry) => {
                      const badge = getOrderStatusBadge(entry.toStatus);
                      return (
                        <li
                          key={entry.id}
                          className="flex flex-col gap-1 border-b border-hairline pb-3 last:border-b-0 last:pb-0"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={badge.tone}>{badge.label}</Badge>
                              <span className="font-mono text-xs text-ink-muted">
                                {entry.fromStatus ? `${entry.fromStatus} -> ` : ''}
                                {entry.toStatus} ({entry.actorType})
                              </span>
                            </div>
                            <span className="font-mono text-xs tabular-nums text-ink-muted">
                              {formatWIB(entry.createdAt, { includeSeconds: true })}
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

              <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
                <h2 className="font-display text-2xl font-normal text-ink">
                  Payment &amp; Refund Summary
                </h2>
                <Divider />
                {order.payments.length === 0 ? (
                  <p className="text-sm text-ink-muted">No payment sessions recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {order.payments.map((payment) => {
                      const pBadge = getPaymentStatusBadge(payment.status);
                      return (
                        <div
                          key={payment.id}
                          className="rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3.5 text-xs space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={pBadge.tone}>{pBadge.label}</Badge>
                              <span className="font-mono uppercase text-ink">
                                {payment.provider}
                                {payment.method ? ` (${payment.method})` : ''}
                              </span>
                            </div>
                            <span className="font-mono text-sm font-medium tabular-nums text-ink">
                              {formatIDR(payment.amountIdr)}
                            </span>
                          </div>
                          <p className="font-mono text-ink-muted">
                            Reference: {payment.providerReference}
                          </p>
                          <p className="font-mono tabular-nums text-ink-muted">
                            {payment.settledAt
                              ? `Settled: ${formatWIB(payment.settledAt)}`
                              : `Expires: ${formatWIB(payment.expiresAt)}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {order.refunds.length > 0 ? (
                  <div className="space-y-3 border-t border-hairline pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                      Linked Refunds
                    </h3>
                    {order.refunds.map((refund) => {
                      const rBadge = getRefundStatusBadge(refund.status);
                      return (
                        <div
                          key={refund.id}
                          className="rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3.5 text-xs space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={rBadge.tone}>{rBadge.label}</Badge>
                              <span className="font-mono text-ink">{refund.refundKey}</span>
                            </div>
                            <span className="font-mono text-sm font-medium tabular-nums text-ink">
                              {formatIDR(refund.amountIdr)}
                            </span>
                          </div>
                          <p className="text-ink-secondary">Reason: {refund.reason}</p>
                          <p className="font-mono text-ink-muted">
                            Requested by: {refund.requestedByEmail ?? refund.requestedBy}
                            {refund.approvedBy
                              ? ` | Approved by: ${refund.approvedByEmail ?? refund.approvedBy}`
                              : ' | Awaiting OWNER approval'}
                          </p>
                          {!order.piiMasked && refund.gatewayResponse ? (
                            <pre className="whitespace-pre-wrap break-all rounded-[var(--radius-xs)] border border-hairline bg-canvas p-2 font-mono text-xs text-ink-muted">
                              {JSON.stringify(refund.gatewayResponse, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {order.returns.length > 0 ? (
                  <div className="space-y-2 border-t border-hairline pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                      Linked Returns
                    </h3>
                    <div className="space-y-2">
                      {order.returns.map((ret) => {
                        const retBadge = getReturnStatusBadge(ret.status);
                        return (
                          <div
                            key={ret.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <Badge tone={retBadge.tone}>{retBadge.label}</Badge>
                                <span className="font-mono text-ink">{ret.id.slice(0, 8)}</span>
                              </div>
                              <p className="text-ink-secondary">{ret.reason}</p>
                            </div>
                            <LinkButton href="/returns" variant="secondary" size="sm">
                              Open Returns
                            </LinkButton>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </Surface>
            </div>

            {/* Right Column (5 cols) */}
            <div className="min-w-0 space-y-6 lg:col-span-5">
              {/* Shipping Destination & Customer Card (valid <dl> without <Divider /> inside) */}
              <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
                <h2 className="font-display text-2xl font-normal text-ink">
                  Shipping Destination &amp; Customer
                </h2>
                <Divider />
                <dl className="space-y-2.5 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Recipient</dt>
                    <dd className="font-medium text-ink">
                      {order.addressSnapshot.recipientName}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-t border-hairline pt-2">
                    <dt className="text-ink-muted">Email</dt>
                    <dd className="font-mono text-xs text-ink">
                      {order.customerEmail ?? 'Not recorded'}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-t border-hairline pt-2">
                    <dt className="text-ink-muted">Phone</dt>
                    <dd className="font-mono text-xs text-ink">{order.addressSnapshot.phone}</dd>
                  </div>
                  <div className="flex flex-col gap-1 border-t border-hairline pt-2">
                    <dt className="text-ink-muted">Address</dt>
                    <dd className="text-ink-secondary">
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
                    </dd>
                  </div>
                </dl>
              </Surface>

              {/* Order State Actions */}
              <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
                <h2 className="font-display text-2xl font-normal text-ink">
                  Order State Actions
                </h2>
                <Divider />

                <div className="space-y-3">
                  {canFulfill ? (
                    <div className="space-y-2">
                      {order.status === 'PAID' ? (
                        <Button
                          type="button"
                          variant="primary"
                          fullWidth
                          className="min-h-11"
                          isLoading={transitioningTo === 'PROCESSING'}
                          loadingLabel="Advancing..."
                          onClick={() => void handleTransitionStatus('PROCESSING')}
                        >
                          Start Processing
                        </Button>
                      ) : null}

                      {order.status === 'PROCESSING' ? (
                        <Button
                          type="button"
                          variant="primary"
                          fullWidth
                          className="min-h-11"
                          isLoading={transitioningTo === 'READY_TO_SHIP'}
                          loadingLabel="Updating..."
                          onClick={() => void handleTransitionStatus('READY_TO_SHIP')}
                        >
                          Mark Ready to Ship
                        </Button>
                      ) : null}

                      {SHIPPABLE_STATUSES.has(order.status) ? (
                        <div className="space-y-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            fullWidth
                            className="min-h-11"
                            disabled={!canCreateShipment}
                            onClick={openShipmentModal}
                          >
                            Create Shipment &amp; Dispatch
                          </Button>
                          {!canCreateShipment ? (
                            <p className="text-xs text-ink-muted">
                              An active shipment already exists for this order. Use Sync Tracking on the shipment card.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {!['PAID', 'PROCESSING', 'READY_TO_SHIP'].includes(order.status) ? (
                        <p className="text-xs text-ink-muted">
                          Fulfillment staging buttons apply to PAID, PROCESSING, or READY_TO_SHIP orders.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {canCancel && ADMIN_CANCELLABLE_STATUSES.has(order.status) ? (
                    <div className="border-t border-hairline pt-3">
                      <Button
                        type="button"
                        variant="danger"
                        fullWidth
                        className="min-h-11"
                        onClick={() => {
                          setCancelReason('');
                          setCancelError(null);
                          setCancelModalOpen(true);
                        }}
                      >
                        Cancel Order
                      </Button>
                    </div>
                  ) : null}

                  {canRequestRefund && refundSummary ? (
                    <div className="space-y-2 border-t border-hairline pt-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink-muted">Remaining Refundable Ceiling</span>
                        <span className="font-mono font-medium tabular-nums text-ink">
                          {formatIDR(refundSummary.remainingRefundableIdr)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        fullWidth
                        className="min-h-11"
                        disabled={!refundSummary.eligible}
                        onClick={openRefundModal}
                      >
                        Request Refund
                      </Button>
                      {!refundSummary.eligible ? (
                        <p className="text-xs text-ink-muted">
                          Refund requests require a settled payment and positive remaining refundable balance.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {!canFulfill && !canCancel && !canRequestRefund ? (
                    <p className="text-xs text-ink-muted">
                      Read-only mode active. Your role does not include fulfillment, cancellation, or refund request permissions.
                    </p>
                  ) : null}
                </div>
              </Surface>
            </div>
          </div>
        </div>
      )}

      {/* Create Shipment Modal */}
      <Modal
        isOpen={shipmentModalOpen}
        onClose={() => setShipmentModalOpen(false)}
        title="Create Shipment"
        description="Dispatch parcel through carrier adapter and advance order to SHIPPED."
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={creatingShipment}
              onClick={() => setShipmentModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-shipment-form"
              variant="primary"
              isLoading={creatingShipment}
              loadingLabel="Creating Shipment..."
            >
              Dispatch Shipment
            </Button>
          </>
        }
      >
        <form id="create-shipment-form" onSubmit={handleCreateShipment} noValidate className="space-y-4">
          {shipError ? (
            <StatusBanner
              tone="danger"
              title={shipError.isConflict ? 'Concurrency Conflict (409)' : 'Shipment Failed'}
              description={shipError.message}
              requestId={shipError.requestId}
              action={
                shipError.isConflict ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShipmentModalOpen(false);
                      void fetchOrder();
                    }}
                  >
                    Reload Order
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          <FormField
            id="ship-warehouse"
            label="Origin Warehouse Code"
            error={shipFieldErrors['warehouseCode']}
            required
          >
            <Input
              id="ship-warehouse"
              value={shipWarehouseCode}
              onChange={(event) => setShipWarehouseCode(event.target.value)}
              invalid={Boolean(shipFieldErrors['warehouseCode'])}
              className="font-mono"
            />
          </FormField>

          <FormField
            id="ship-provider"
            label="Carrier Adapter"
            error={shipFieldErrors['provider']}
            required
          >
            <Select
              id="ship-provider"
              value={shipProvider}
              onChange={(event) =>
                setShipProvider(event.target.value as 'jne-adapter' | 'sicepat-adapter')
              }
              invalid={Boolean(shipFieldErrors['provider'])}
            >
              <option value="jne-adapter">jne-adapter (JNE Express)</option>
              <option value="sicepat-adapter">sicepat-adapter (SiCepat)</option>
            </Select>
          </FormField>

          <FormField
            id="ship-service"
            label="Service Code"
            error={shipFieldErrors['serviceCode']}
            required
          >
            <Input
              id="ship-service"
              value={shipServiceCode}
              onChange={(event) => setShipServiceCode(event.target.value)}
              invalid={Boolean(shipFieldErrors['serviceCode'])}
              placeholder="REG or YES"
              className="font-mono"
            />
          </FormField>

          <FormField id="ship-note" label="Dispatch Note (Optional)">
            <Input
              id="ship-note"
              value={shipDispatchNote}
              onChange={(event) => setShipDispatchNote(event.target.value)}
              placeholder="Internal packing or courier handoff note"
            />
          </FormField>

          <p className="font-mono text-xs text-ink-muted">
            Idempotency-Key: {shipIdempotencyKey}
          </p>
        </form>
      </Modal>

      {/* Cancel Order Confirmation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Confirm Order Cancellation"
        description="Cancelling releases any reserved inventory and cannot be undone."
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={cancellingOrder}
              onClick={() => setCancelModalOpen(false)}
            >
              Keep Order
            </Button>
            <Button
              type="submit"
              form="admin-cancel-order-form"
              variant="danger"
              isLoading={cancellingOrder}
              loadingLabel="Cancelling..."
            >
              Confirm Cancel Order
            </Button>
          </>
        }
      >
        <form id="admin-cancel-order-form" onSubmit={handleConfirmCancelOrder} noValidate className="space-y-4">
          {cancelError ? <StatusBanner tone="danger" description={cancelError} /> : null}
          <FormField id="admin-cancel-reason" label="Cancellation Reason" required>
            <Textarea
              id="admin-cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="State why this order is being cancelled"
              required
            />
          </FormField>
        </form>
      </Modal>

      {/* Request Refund Modal */}
      <Modal
        isOpen={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        title="Request Dual-Step Refund"
        description="Step 1: Initiate a refund request bound to the settled payment. OWNER MFA step-up approval is required in /returns."
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={requestingRefund}
              onClick={() => setRefundModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="request-refund-form"
              variant="primary"
              isLoading={requestingRefund}
              loadingLabel="Submitting..."
            >
              Submit Refund Request
            </Button>
          </>
        }
      >
        <form id="request-refund-form" onSubmit={handleRequestRefund} noValidate className="space-y-4">
          {refundBannerError ? (
            <StatusBanner tone="danger" description={refundBannerError} />
          ) : null}

          {refundSummary ? (
            <div className="rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-muted">Total Settled</span>
                <span className="font-mono tabular-nums text-ink">
                  {formatIDR(refundSummary.totalPaidIdr)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Committed / Pending Refunds</span>
                <span className="font-mono tabular-nums text-ink">
                  {formatIDR(refundSummary.committedRefundsIdr)}
                </span>
              </div>
              <div className="flex justify-between border-t border-hairline pt-1 font-medium">
                <span className="text-ink">Refundable Ceiling</span>
                <span className="font-mono tabular-nums text-ink">
                  {formatIDR(refundSummary.remainingRefundableIdr)}
                </span>
              </div>
            </div>
          ) : null}

          <FormField
            id="refund-amount-idr"
            label="Refund Amount (IDR)"
            error={refundFieldErrors['amountIdr']}
            required
          >
            <Input
              id="refund-amount-idr"
              type="text"
              inputMode="numeric"
              value={refundAmountInput}
              onChange={(event) => setRefundAmountInput(event.target.value.replace(/\D/g, ''))}
              invalid={Boolean(refundFieldErrors['amountIdr'])}
              className="font-mono tabular-nums"
            />
          </FormField>

          {order && order.returns.length > 0 ? (
            <FormField id="refund-return-id" label="Linked Return (Optional)">
              <Select
                id="refund-return-id"
                value={refundReturnId}
                onChange={(event) => setRefundReturnId(event.target.value)}
              >
                <option value="">None (Order-level refund)</option>
                {order.returns.map((ret) => (
                  <option key={ret.id} value={ret.id}>
                    {ret.id.slice(0, 8)} ({ret.status}: {ret.reason})
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          <FormField
            id="refund-reason"
            label="Refund Reason"
            error={refundFieldErrors['reason']}
            required
          >
            <Textarea
              id="refund-reason"
              value={refundReason}
              onChange={(event) => setRefundReason(event.target.value)}
              invalid={Boolean(refundFieldErrors['reason'])}
              placeholder="Explain the justification for this refund request"
              required
            />
          </FormField>

          <p className="font-mono text-xs text-ink-muted">
            Idempotency-Key: {refundIdempotencyKey}
          </p>
        </form>
      </Modal>
    </AdminShell>
  );
}
