'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  AdminOrderSummaryDto,
  OrderStatusInput,
  PaymentStatusInput,
} from '@arven/contracts';
import {
  Badge,
  Button,
  DataTable,
  ErrorState,
  FormField,
  Input,
  LinkButton,
  LoadingState,
  Select,
  StatusBanner,
  Surface,
  formatIDR,
  formatWIB,
  type DataTableColumn,
} from '@arven/ui';
import { AdminForbiddenPanel } from '@/components/admin-forbidden-panel';
import { AdminShell } from '@/components/admin-shell';
import { AdminApiClientError, adminApi, type PaginationMeta } from '@/lib/api-client';
import {
  formatStatusLabel,
  getOrderStatusBadge,
  getPaymentStatusBadge,
} from '@/lib/ops-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

const ORDER_STATUS_OPTIONS: readonly OrderStatusInput[] = [
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'RETURN_REQUESTED',
  'RETURN_APPROVED',
  'RETURNED',
];

const PAYMENT_STATUS_OPTIONS: readonly PaymentStatusInput[] = [
  'PENDING',
  'AUTHORIZED',
  'SETTLEMENT',
  'FAILED',
  'EXPIRED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
];

function AdminOrdersContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading: sessionLoading, error: sessionError, canAccess, reload } =
    useAdminSession();

  const hasOrdersAccess = canAccess([
    'order.read',
    'order.read.limited',
    'order.fulfill',
    'order.cancel',
  ]);
  const canReadOrders = canAccess(['order.read', 'order.read.limited']);
  const isLimitedSupportView = Boolean(user && !canAccess(['order.read']) && canAccess(['order.read.limited']));

  const urlPage = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const urlStatus = (searchParams.get('status') ?? '') as OrderStatusInput | '';
  const urlPaymentStatus = (searchParams.get('paymentStatus') ?? '') as PaymentStatusInput | '';
  const urlQuery = searchParams.get('q') ?? '';

  const [draftQuery, setDraftQuery] = useState(urlQuery);
  const [draftStatus, setDraftStatus] = useState<string>(urlStatus);
  const [draftPaymentStatus, setDraftPaymentStatus] = useState<string>(urlPaymentStatus);

  const [orders, setOrders] = useState<AdminOrderSummaryDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    requestId: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );
  const [reloadNonce, setReloadNonce] = useState(0);

  const pushFiltersToUrl = useCallback(
    (next: { page: number; status: string; paymentStatus: string; q: string }) => {
      setLoadingOrders(true);
      const params = new URLSearchParams();
      if (next.page > 1) params.set('page', String(next.page));
      if (next.status) params.set('status', next.status);
      if (next.paymentStatus) params.set('paymentStatus', next.paymentStatus);
      if (next.q.trim()) params.set('q', next.q.trim());
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router],
  );

  const fetchOrders = useCallback(() => {
    setLoadingOrders(true);
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!user || !canReadOrders) {
      return;
    }

    let active = true;
    adminApi
      .listOrders({
        page: urlPage,
        limit: 20,
        status: urlStatus || undefined,
        q: urlQuery.trim() || undefined,
      })
      .then((result) => {
        if (!active) return;
        setOrders(result.items);
        setMeta(result.meta);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load orders queue right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingOrders(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canReadOrders, reloadNonce, urlPage, urlQuery, urlStatus, user]);

  const filteredOrders = useMemo(() => {
    if (!urlPaymentStatus) {
      return orders;
    }
    return orders.filter((row) => row.latestPaymentStatus === urlPaymentStatus);
  }, [orders, urlPaymentStatus]);

  const showPiiMaskedBanner =
    isLimitedSupportView || orders.some((order) => order.piiMasked);

  const handleApplyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    pushFiltersToUrl({
      page: 1,
      status: draftStatus,
      paymentStatus: draftPaymentStatus,
      q: draftQuery,
    });
  };

  const handleResetFilters = () => {
    setDraftQuery('');
    setDraftStatus('');
    setDraftPaymentStatus('');
    pushFiltersToUrl({ page: 1, status: '', paymentStatus: '', q: '' });
  };

  const columns = useMemo<DataTableColumn<AdminOrderSummaryDto>[]>(
    () => [
      {
        key: 'orderNumber',
        header: 'Order #',
        headerClassName: 'px-2.5 whitespace-nowrap',
        cellClassName: 'px-2.5',
        render: (row) => (
          <div className="space-y-1">
            <Link
              href={`/orders/${encodeURIComponent(row.id)}`}
              className="inline-flex min-h-11 items-center font-mono text-xs font-medium text-link hover:underline"
            >
              {row.orderNumber}
            </Link>
            {row.latestTrackingNumber ? (
              <p className="font-mono text-[11px] text-ink-muted">
                AWB: {row.latestTrackingNumber}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'placedAt',
        header: 'Placed (WIB)',
        headerClassName: 'px-2.5 whitespace-nowrap',
        cellClassName: 'px-2.5 max-w-[9.5rem] whitespace-normal',
        render: (row) => (
          <span className="font-mono text-xs tabular-nums text-ink-secondary">
            {formatWIB(row.createdAt)}
          </span>
        ),
      },
      {
        key: 'customer',
        header: 'Customer',
        headerClassName: 'px-2.5 whitespace-nowrap',
        cellClassName: 'px-2.5 max-w-[12.5rem] break-words',
        render: (row) => (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-ink">{row.recipientName}</span>
              {row.piiMasked ? <Badge tone="warning">PII Masked</Badge> : null}
              {row.isGuest ? <Badge tone="neutral">Guest</Badge> : null}
            </div>
            <p className="break-all font-mono text-xs text-ink-muted">
              {row.customerEmail ?? 'No email'}
            </p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status / Payment',
        headerClassName: 'px-2.5 whitespace-nowrap',
        cellClassName: 'px-2.5 whitespace-nowrap',
        render: (row) => {
          const orderBadge = getOrderStatusBadge(row.status);
          const paymentBadge = getPaymentStatusBadge(row.latestPaymentStatus);
          return (
            <div className="flex flex-col items-start gap-1">
              <Badge tone={orderBadge.tone}>{orderBadge.label}</Badge>
              <Badge tone={paymentBadge.tone}>{paymentBadge.label}</Badge>
            </div>
          );
        },
      },
      {
        key: 'total',
        header: 'Total',
        align: 'right',
        headerClassName: 'px-2.5 whitespace-nowrap',
        cellClassName: 'px-2.5 whitespace-nowrap',
        render: (row) => (
          <span className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-ink">
            {formatIDR(row.grandTotalIdr)}
          </span>
        ),
      },
      {
        key: 'action',
        header: 'Inspect',
        align: 'right',
        headerClassName: 'px-2.5 whitespace-nowrap',
        cellClassName: 'px-2.5 whitespace-nowrap',
        render: (row) => (
          <LinkButton
            href={`/orders/${encodeURIComponent(row.id)}`}
            variant="secondary"
            size="sm"
            className="min-h-11"
          >
            Inspect
          </LinkButton>
        ),
      },
    ],
    [],
  );

  return (
    <AdminShell
      title="Orders Queue"
      description="Inspect paid and pending customer orders, monitor settlement status, and enter fulfillment workspaces."
      user={user}
    >
      {sessionLoading ? (
        <LoadingState label="Checking order operations permissions" rows={4} />
      ) : sessionError ? (
        <ErrorState
          title="Unable to verify staff session"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reload()}
        />
      ) : !hasOrdersAccess ? (
        <AdminForbiddenPanel description="Your assigned role does not include order.read, order.read.limited, order.fulfill, or order.cancel permissions." />
      ) : !canReadOrders ? (
        <AdminForbiddenPanel description="Reading the order queue requires order.read or order.read.limited permission." />
      ) : (
        <div className="space-y-6">
          {showPiiMaskedBanner ? (
            <StatusBanner
              tone="info"
              title="Limited Support View"
              description="Limited Support View active: customer contact PII is masked and raw payment gateway payloads are redacted."
            />
          ) : null}

          <Surface variant="subtle" border="hairline" padding="md">
            <form
              onSubmit={handleApplyFilters}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
            >
              <div className="lg:col-span-4">
                <FormField id="orders-search" label="Search Order # or Email">
                  <Input
                    id="orders-search"
                    placeholder="ARV-... or client@example.com"
                    value={draftQuery}
                    onChange={(event) => setDraftQuery(event.target.value)}
                  />
                </FormField>
              </div>
              <div className="lg:col-span-3">
                <FormField id="orders-status-filter" label="Order Status">
                  <Select
                    id="orders-status-filter"
                    value={draftStatus}
                    onChange={(event) => setDraftStatus(event.target.value)}
                  >
                    <option value="">ALL</option>
                    {ORDER_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {formatStatusLabel(status)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="lg:col-span-3">
                <FormField id="orders-payment-filter" label="Payment Status">
                  <Select
                    id="orders-payment-filter"
                    value={draftPaymentStatus}
                    onChange={(event) => setDraftPaymentStatus(event.target.value)}
                  >
                    <option value="">ALL</option>
                    {PAYMENT_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {formatStatusLabel(status)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="flex flex-wrap gap-2 lg:col-span-2 lg:justify-end">
                <Button type="submit" variant="primary" size="md">
                  Apply Filters
                </Button>
                <Button type="button" variant="secondary" size="md" onClick={handleResetFilters}>
                  Reset Filters
                </Button>
              </div>
            </form>
          </Surface>

          <DataTable
            caption="ARVEN customer orders queue"
            tableBreakpoint="xl"
            columns={columns}
            rows={filteredOrders}
            getRowKey={(row) => row.id}
            isLoading={loadingOrders}
            loadingLabel="Loading orders queue"
            error={loadError?.message ?? null}
            errorRequestId={loadError?.requestId ?? null}
            onRetry={() => void fetchOrders()}
            emptyTitle="No orders match the active filters"
            emptyDescription="Adjust the search query, order status, or payment status filter."
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-xs text-ink-muted">
            <span className="font-mono tabular-nums">
              Page {meta.page} of {meta.totalPages} ({meta.total} total orders)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="min-h-11"
                disabled={meta.page <= 1 || loadingOrders}
                onClick={() =>
                  pushFiltersToUrl({
                    page: Math.max(1, meta.page - 1),
                    status: urlStatus,
                    paymentStatus: urlPaymentStatus,
                    q: urlQuery,
                  })
                }
              >
                Prev
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="min-h-11"
                disabled={meta.page >= meta.totalPages || loadingOrders}
                onClick={() =>
                  pushFiltersToUrl({
                    page: meta.page + 1,
                    status: urlStatus,
                    paymentStatus: urlPaymentStatus,
                    q: urlQuery,
                  })
                }
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense
      fallback={
        <AdminShell
          title="Orders Queue"
          description="Inspect paid and pending customer orders, monitor settlement status, and enter fulfillment workspaces."
          user={null}
        >
          <LoadingState label="Loading orders queue" rows={5} />
        </AdminShell>
      }
    >
      <AdminOrdersContent />
    </Suspense>
  );
}
