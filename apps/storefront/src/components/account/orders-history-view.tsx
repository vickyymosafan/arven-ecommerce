'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { OrderStatusInput, OrderSummaryDto } from '@arven/contracts';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  LinkButton,
  LoadingState,
  Select,
  Surface,
  buttonClassName,
  formatIDR,
  formatWIB,
} from '@arven/ui';
import { AccountShell } from '@/components/account-shell';
import { ApiClientError, storefrontApi, type PaginationMeta } from '@/lib/api-client';
import { getOrderStatusMeta } from '@/lib/format';

const ORDER_FILTER_OPTIONS: ReadonlyArray<{ value: '' | OrderStatusInput; label: string }> = [
  { value: '', label: 'All Order Statuses' },
  { value: 'PENDING_PAYMENT', label: 'Pending Payment' },
  { value: 'PAID', label: 'Payment Confirmed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'READY_TO_SHIP', label: 'Ready to Ship' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Payment Expired' },
];

export function OrdersHistoryView() {
  const router = useRouter();

  const [orders, setOrders] = useState<OrderSummaryDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'' | OrderStatusInput>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;

    storefrontApi
      .listMyOrders({
        page,
        limit: 10,
        ...(statusFilter ? { status: statusFilter } : {}),
      })
      .then((result) => {
        if (!active) return;
        setOrders(result.items);
        setMeta(result.meta);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          router.replace('/auth/login?next=/account/orders');
          return;
        }
        if (err instanceof ApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load your order history right now.' });
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
  }, [page, reloadNonce, router, statusFilter]);

  const totalPages = meta?.totalPages ?? 1;

  return (
    <AccountShell
      title="Order History"
      description="Inspect placed orders, Midtrans payment confirmations, and shipping status across your ARVEN account."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-ink-muted">
            {meta ? (
              <>
                <span className="font-mono tabular-nums text-ink">{meta.total}</span>{' '}
                {meta.total === 1 ? 'order recorded' : 'orders recorded'}
              </>
            ) : (
              'Your account order ledger'
            )}
          </p>

          <div className="w-full sm:w-64">
            <FormField id="order-history-status-filter" label="Filter by Status">
              <Select
                id="order-history-status-filter"
                value={statusFilter}
                onChange={(event) => {
                  setLoading(true);
                  setStatusFilter(event.target.value as '' | OrderStatusInput);
                  setPage(1);
                }}
              >
                {ORDER_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value || 'ALL'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </div>

        {loading ? (
          <div className="min-h-[32rem]">
            <LoadingState label="Loading your order history" rows={4} />
          </div>
        ) : loadError ? (
          <ErrorState
            title="Could not load order history"
            message={loadError.message}
            requestId={loadError.requestId}
            retryLabel="Retry"
            onRetry={retryLoad}
          />
        ) : orders.length === 0 ? (
          <EmptyState
            title={statusFilter ? 'No Orders Match This Status' : 'No Orders Yet'}
            description={
              statusFilter
                ? 'Clear the status filter to inspect all orders placed on your account.'
                : 'Completed and pending orders placed under your ARVEN account will appear here.'
            }
            action={
              statusFilter ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setLoading(true);
                    setStatusFilter('');
                    setPage(1);
                  }}
                >
                  Show All Orders
                </Button>
              ) : (
                <LinkButton href="/shop" variant="primary" size="md">
                  Explore Catalog
                </LinkButton>
              )
            }
          />
        ) : (
          <div className="space-y-6">
            {/* Mobile Stacked Cards */}
            <div className="space-y-4 md:hidden">
              {orders.map((order) => {
                const statusMeta = getOrderStatusMeta(order.status);
                return (
                  <Surface
                    key={order.id}
                    variant="elevated"
                    border="hairline"
                    padding="md"
                    className="space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-mono text-sm font-semibold text-ink">
                          {order.orderNumber}
                        </p>
                        <p className="font-mono text-xs tabular-nums text-ink-muted">
                          {formatWIB(order.createdAt)}
                        </p>
                      </div>
                      <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                    </div>

                    <dl className="grid grid-cols-2 gap-3 border-t border-hairline pt-3 text-sm">
                      <div>
                        <dt className="text-xs text-ink-muted">Pieces</dt>
                        <dd className="font-mono font-medium tabular-nums text-ink">
                          {order.totalQuantity}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs text-ink-muted">Grand Total</dt>
                        <dd className="whitespace-nowrap font-mono font-medium tabular-nums text-ink">
                          {formatIDR(order.grandTotalIdr)}
                        </dd>
                      </div>
                    </dl>

                    <Link
                      href={`/account/orders/${encodeURIComponent(order.orderNumber)}`}
                      className={buttonClassName({
                        variant: 'secondary',
                        size: 'md',
                        fullWidth: true,
                      })}
                    >
                      View Order
                    </Link>
                  </Surface>
                );
              })}
            </div>

            {/* Desktop Hairline Table */}
            <div className="hidden overflow-x-auto rounded-[var(--radius-sm)] border border-hairline bg-elevated md:block">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Customer order history</caption>
                <thead>
                  <tr className="border-b border-hairline bg-panel text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                    <th scope="col" className="px-4 py-3">
                      Order Number
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Placed (WIB)
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Items
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Courier
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Total
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {orders.map((order) => {
                    const statusMeta = getOrderStatusMeta(order.status);
                    return (
                      <tr key={order.id} className="transition-colors hover:bg-subtle">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-ink">
                          {order.orderNumber}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-ink-muted">
                          {formatWIB(order.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-ink">
                          {order.totalQuantity} {order.totalQuantity === 1 ? 'piece' : 'pieces'}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-secondary">
                          {order.shippingProvider} ({order.shippingService})
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-medium tabular-nums text-ink">
                          {formatIDR(order.grandTotalIdr)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/account/orders/${encodeURIComponent(order.orderNumber)}`}
                            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                          >
                            View Order
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
                <p className="font-mono text-xs tabular-nums text-ink-muted">
                  Page {meta?.page ?? page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => {
                      setLoading(true);
                      setPage((p) => Math.max(1, p - 1));
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => {
                      setLoading(true);
                      setPage((p) => p + 1);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </AccountShell>
  );
}
