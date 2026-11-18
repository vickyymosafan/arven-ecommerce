'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { ReturnDetailDto } from '@arven/contracts';
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  Modal,
  StatusBanner,
  Surface,
  formatIDR,
  formatWIB,
} from '@arven/ui';
import { AccountShell } from '@/components/account-shell';
import { ApiClientError, storefrontApi, type PaginationMeta } from '@/lib/api-client';
import { getReturnStatusMeta } from '@/lib/format';

export default function CustomerReturnsPage() {
  const router = useRouter();
  const [returnsList, setReturnsList] = useState<ReturnDetailDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    requestId: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [inspectReturn, setInspectReturn] = useState<ReturnDetailDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadReturns = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi
      .listMyReturns({ page, limit: 20 })
      .then((result) => {
        if (!active) return;
        setReturnsList(result.items);
        setMeta(result.meta);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 401) {
          router.replace('/auth/login?next=/account/returns');
          return;
        }
        if (err instanceof ApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load your return requests right now.' });
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
  }, [page, reloadNonce, router]);

  const handleOpenDetail = async (item: ReturnDetailDto) => {
    setInspectReturn(item);
    setLoadingDetail(true);
    try {
      const fresh = await storefrontApi.getReturnById(item.id);
      setInspectReturn(fresh);
    } catch {
      // Keep summary item if detail refresh fails transiently
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <AccountShell
      title="Returns & Inspection Tracking"
      description="Monitor return claim approvals, atelier physical receipt inspections, and refund settlements."
    >
      {loading ? (
        <LoadingState label="Loading return requests" rows={4} className="min-h-[24rem]" />
      ) : error ? (
        <ErrorState
          title="Could not load return requests"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void loadReturns()}
        />
      ) : returnsList.length === 0 ? (
        <EmptyState
          title="No return requests submitted yet"
          description="Return requests can be initiated directly from any delivered order in your order history."
          action={
            <LinkButton href="/account/orders" variant="primary" size="md">
              View Order History
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            {returnsList.map((ret) => {
              const statusMeta = getReturnStatusMeta(ret.status);
              const totalReturnValueIdr = ret.items.reduce(
                (sum, item) => sum + item.unitPriceIdr * item.quantity,
                0,
              );

              return (
                <Surface
                  key={ret.id}
                  variant="elevated"
                  border="hairline"
                  padding="lg"
                  className="space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-ink">
                          Return {ret.id.slice(0, 8)}
                        </span>
                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      </div>
                      <p className="text-xs text-ink-muted">
                        Order:{' '}
                        <Link
                          href={`/account/orders/${encodeURIComponent(ret.orderNumber)}`}
                          className="font-mono text-link hover:underline"
                        >
                          {ret.orderNumber}
                        </Link>
                        {' | '}
                        <span className="font-mono tabular-nums">
                          Submitted {formatWIB(ret.createdAt)}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {ret.status === 'REFUNDED' ? (
                        <span className="font-mono text-sm font-medium tabular-nums text-success-fg">
                          Refunded ({formatIDR(totalReturnValueIdr)})
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="min-h-11"
                        onClick={() => void handleOpenDetail(ret)}
                      >
                        Inspect Return
                      </Button>
                    </div>
                  </div>

                  <Divider />

                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-ink">Reason: {ret.reason}</p>
                    {ret.customerNotes ? (
                      <p className="text-xs leading-relaxed text-ink-secondary">
                        {ret.customerNotes}
                      </p>
                    ) : null}
                    {ret.adminNotes ? (
                      <StatusBanner
                        tone={ret.status === 'REJECTED' ? 'danger' : 'info'}
                        title="Atelier Review Note"
                        description={ret.adminNotes}
                      />
                    ) : null}
                  </div>

                  <ul className="space-y-2">
                    {ret.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-medium text-ink">{item.productName}</p>
                          <p className="font-mono text-ink-muted">
                            {item.color} / Size {item.size} / Qty{' '}
                            <span className="tabular-nums">{item.quantity}</span>
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {item.condition ? (
                            <Badge tone="neutral">Condition: {item.condition}</Badge>
                          ) : null}
                          <span className="font-mono tabular-nums text-ink">
                            {formatIDR(item.unitPriceIdr * item.quantity)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Surface>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-xs text-ink-muted">
            <span className="font-mono tabular-nums">
              Page {meta.page} of {meta.totalPages} ({meta.total} total returns)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="min-h-11"
                disabled={meta.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="min-h-11"
                disabled={meta.page >= meta.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={Boolean(inspectReturn)}
        onClose={() => setInspectReturn(null)}
        title={
          inspectReturn ? `Return ${inspectReturn.id.slice(0, 8)}` : 'Return Timeline'
        }
        description={
          inspectReturn
            ? `Order ${inspectReturn.orderNumber} | Submitted ${formatWIB(inspectReturn.createdAt)}`
            : undefined
        }
        size="md"
        footer={
          <Button type="button" variant="secondary" onClick={() => setInspectReturn(null)}>
            Close
          </Button>
        }
      >
        {inspectReturn ? (
          <div className="space-y-4">
            {loadingDetail ? (
              <p className="font-mono text-xs text-ink-muted">Refreshing latest return record...</p>
            ) : null}

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Status</dt>
                <dd>
                  <Badge tone={getReturnStatusMeta(inspectReturn.status).tone}>
                    {getReturnStatusMeta(inspectReturn.status).label}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-hairline pt-2">
                <dt className="text-ink-muted">Reviewed (WIB)</dt>
                <dd className="font-mono text-xs tabular-nums text-ink">
                  {formatWIB(inspectReturn.reviewedAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-hairline pt-2">
                <dt className="text-ink-muted">Received &amp; Inspected (WIB)</dt>
                <dd className="font-mono text-xs tabular-nums text-ink">
                  {formatWIB(inspectReturn.receivedAt)}
                </dd>
              </div>
            </dl>

            {inspectReturn.adminNotes ? (
              <StatusBanner
                tone={inspectReturn.status === 'REJECTED' ? 'danger' : 'info'}
                title="Atelier Note"
                description={inspectReturn.adminNotes}
              />
            ) : null}

            <div className="space-y-2 border-t border-hairline pt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Returned Pieces
              </p>
              <ul className="space-y-2">
                {inspectReturn.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3 text-xs"
                  >
                    <div>
                      <p className="font-medium text-ink">{item.productName}</p>
                      <p className="font-mono text-ink-muted">
                        {item.sku} | Qty {item.quantity}
                      </p>
                    </div>
                    {item.condition ? (
                      <Badge tone="neutral">{item.condition}</Badge>
                    ) : (
                      <span className="text-ink-muted">Pending inspection</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>
    </AccountShell>
  );
}
