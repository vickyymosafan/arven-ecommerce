'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type {
  RefundDto,
  RefundStatusInput,
  ReturnDetailDto,
  ReturnItemConditionInput,
  ReturnStatusInput,
} from '@arven/contracts';
import { receiveReturnSchema } from '@arven/validators';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Divider,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
  StatusBanner,
  Surface,
  Textarea,
  cn,
  formatIDR,
  formatWIB,
  useToast,
  type DataTableColumn,
} from '@arven/ui';
import { AdminForbiddenPanel } from '@/components/admin-forbidden-panel';
import { AdminShell } from '@/components/admin-shell';
import { MfaStepUpModal } from '@/components/mfa-step-up-modal';
import {
  AdminApiClientError,
  adminApi,
  generateIdempotencyKey,
  type PaginationMeta,
} from '@/lib/api-client';
import {
  canUserApproveRefund,
  formatStatusLabel,
  getRefundStatusBadge,
  getReturnStatusBadge,
  isRestockAllowedForCondition,
} from '@/lib/ops-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

const RETURN_STATUS_OPTIONS: readonly ReturnStatusInput[] = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'RECEIVED',
  'REFUNDED',
  'CLOSED',
];

const REFUND_STATUS_OPTIONS: readonly RefundStatusInput[] = [
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'REJECTED',
];

const CONDITION_OPTIONS: readonly ReturnItemConditionInput[] = [
  'UNOPENED',
  'GOOD',
  'DAMAGED',
  'DEFECTIVE',
];

type ActiveQueueTab = 'returns' | 'refunds';

interface InspectionItemDraft {
  returnItemId: string;
  condition: ReturnItemConditionInput;
  restock: boolean;
}

export default function AdminReturnsAndRefundsPage() {
  const { toast } = useToast();
  const {
    user,
    loading: sessionLoading,
    error: sessionError,
    permissions,
    canAccess,
    reload,
  } = useAdminSession();

  const hasAnyReturnsOrRefundsAccess = canAccess([
    'return.read',
    'return.review',
    'return.inspect',
    'return.approve',
    'refund.request',
    'refund.approve',
  ]);
  const showReturnsTab = canAccess([
    'return.read',
    'return.review',
    'return.inspect',
    'return.approve',
  ]);
  const showRefundsTab = canAccess(['refund.request', 'refund.approve', 'return.read']);
  const canReadReturnsList = canAccess(['return.read']);
  const canReadRefundsList = canAccess(['refund.request', 'refund.approve']);
  const canReviewReturn = canAccess(['return.review']);
  const canApproveReturn = canAccess(['return.approve']);
  const canInspectReturn = canAccess(['return.inspect']);
  const isOwnerOrRefundApprover = useMemo(
    () => canUserApproveRefund({ roles: user?.roles, permissions }),
    [permissions, user?.roles],
  );

  const [activeTab, setActiveTab] = useState<ActiveQueueTab>('returns');
  const effectiveTab: ActiveQueueTab =
    activeTab === 'returns' && !showReturnsTab && showRefundsTab ? 'refunds' : activeTab;
  const returnsTabRef = useRef<HTMLButtonElement | null>(null);
  const refundsTabRef = useRef<HTMLButtonElement | null>(null);

  // Returns Queue State
  const [returnStatusFilter, setReturnStatusFilter] = useState<string>('');
  const [returnPage, setReturnPage] = useState(1);
  const [returnsList, setReturnsList] = useState<ReturnDetailDto[]>([]);
  const [returnsMeta, setReturnsMeta] = useState<PaginationMeta>({
    requestId: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loadingReturns, setLoadingReturns] = useState(true);
  const [returnsError, setReturnsError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [returnsNonce, setReturnsNonce] = useState(0);

  // Refunds Queue State
  const [refundStatusFilter, setRefundStatusFilter] = useState<string>('');
  const [refundPage, setRefundPage] = useState(1);
  const [refundsList, setRefundsList] = useState<RefundDto[]>([]);
  const [refundsMeta, setRefundsMeta] = useState<PaginationMeta>({
    requestId: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loadingRefunds, setLoadingRefunds] = useState(true);
  const [refundsError, setRefundsError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [refundsNonce, setRefundsNonce] = useState(0);

  // Return Inspection Modal State
  const [selectedReturn, setSelectedReturn] = useState<ReturnDetailDto | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [warehouseCode, setWarehouseCode] = useState('JKT-MAIN-01');
  const [inspectionDrafts, setInspectionDrafts] = useState<Record<string, InspectionItemDraft>>(
    {},
  );
  const [receiveIdempotencyKey, setReceiveIdempotencyKey] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submittingReturnAction, setSubmittingReturnAction] = useState(false);

  // Dual-Step Refund Approval & MFA Step-Up State
  const [approvingRefundId, setApprovingRefundId] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{
    refundId: string;
    idempotencyKey: string;
  } | null>(null);
  const [refundActionError, setRefundActionError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);

  const loadReturns = useCallback(() => {
    if (!user || !canReadReturnsList) return;
    setLoadingReturns(true);
    setReturnsError(null);
    setReturnsNonce((n) => n + 1);
  }, [canReadReturnsList, user]);

  const loadRefunds = useCallback(() => {
    if (!user || !canReadRefundsList) return;
    setLoadingRefunds(true);
    setRefundsError(null);
    setRefundsNonce((n) => n + 1);
  }, [canReadRefundsList, user]);

  useEffect(() => {
    if (sessionLoading || !user || !canReadReturnsList) {
      return;
    }

    let active = true;
    adminApi
      .listReturns({
        page: returnPage,
        limit: 20,
        status: (returnStatusFilter as ReturnStatusInput) || undefined,
      })
      .then((result) => {
        if (!active) return;
        setReturnsList(result.items);
        setReturnsMeta(result.meta);
        setReturnsError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setReturnsError({ message: err.message, requestId: err.requestId });
        } else {
          setReturnsError({ message: 'Unable to load returns queue right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingReturns(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canReadReturnsList, returnPage, returnStatusFilter, returnsNonce, sessionLoading, user]);

  useEffect(() => {
    if (sessionLoading || !user || !canReadRefundsList) {
      return;
    }

    let active = true;
    adminApi
      .listRefunds({
        page: refundPage,
        limit: 20,
        status: (refundStatusFilter as RefundStatusInput) || undefined,
      })
      .then((result) => {
        if (!active) return;
        setRefundsList(result.items);
        setRefundsMeta(result.meta);
        setRefundsError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setRefundsError({ message: err.message, requestId: err.requestId });
        } else {
          setRefundsError({ message: 'Unable to load refunds queue right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingRefunds(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canReadRefundsList, refundPage, refundStatusFilter, refundsNonce, sessionLoading, user]);

  const openReturnModal = (ret: ReturnDetailDto) => {
    setSelectedReturn(ret);
    setActionNotes(ret.adminNotes ?? '');
    setWarehouseCode('JKT-MAIN-01');
    setModalError(null);
    setReceiveIdempotencyKey(generateIdempotencyKey('admin-ret'));

    const drafts: Record<string, InspectionItemDraft> = {};
    for (const item of ret.items) {
      const initialCond: ReturnItemConditionInput = item.condition ?? 'GOOD';
      drafts[item.id] = {
        returnItemId: item.id,
        condition: initialCond,
        restock: isRestockAllowedForCondition(initialCond),
      };
    }
    setInspectionDrafts(drafts);
  };

  const handleStartReview = async () => {
    if (!selectedReturn) return;
    setModalError(null);
    setSubmittingReturnAction(true);
    try {
      const updated = await adminApi.reviewReturn(selectedReturn.id, {
        ...(actionNotes.trim() ? { notes: actionNotes.trim() } : {}),
      });
      setSelectedReturn(updated);
      await loadReturns();
      toast({
        tone: 'success',
        title: 'Return moved to Under Review',
        description: `Return ${updated.id.slice(0, 8)} is ready for approval or rejection.`,
      });
    } catch (err) {
      setModalError(
        err instanceof AdminApiClientError
          ? err.message
          : 'Unable to start return review right now.',
      );
    } finally {
      setSubmittingReturnAction(false);
    }
  };

  const handleApproveOrRejectReturn = async (decision: 'APPROVE' | 'REJECT') => {
    if (!selectedReturn) return;
    const trimmedNotes = actionNotes.trim();
    if (decision === 'REJECT' && trimmedNotes.length === 0) {
      setModalError('Admin notes are required when rejecting a return request.');
      return;
    }

    setModalError(null);
    setSubmittingReturnAction(true);
    try {
      const updated = await adminApi.approveReturn(selectedReturn.id, {
        decision,
        ...(trimmedNotes ? { adminNotes: trimmedNotes } : {}),
      });
      setSelectedReturn(updated);
      await loadReturns();
      toast({
        tone: 'success',
        title: decision === 'APPROVE' ? 'Return approved' : 'Return rejected',
        description: `Return ${updated.id.slice(0, 8)} updated to ${updated.status}.`,
      });
      if (decision === 'REJECT') {
        setSelectedReturn(null);
      }
    } catch (err) {
      setModalError(
        err instanceof AdminApiClientError
          ? err.message
          : 'Unable to record return decision right now.',
      );
    } finally {
      setSubmittingReturnAction(false);
    }
  };

  const handleReceiveAndInspect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedReturn) return;
    setModalError(null);

    const itemsPayload = selectedReturn.items.map((item) => {
      const draft = inspectionDrafts[item.id] ?? {
        returnItemId: item.id,
        condition: 'GOOD' as ReturnItemConditionInput,
        restock: true,
      };
      return {
        returnItemId: item.id,
        condition: draft.condition,
        restock: isRestockAllowedForCondition(draft.condition) ? draft.restock : false,
      };
    });

    const parsed = receiveReturnSchema.safeParse({
      ...(warehouseCode.trim() ? { warehouseCode: warehouseCode.trim() } : {}),
      ...(actionNotes.trim() ? { adminNotes: actionNotes.trim() } : {}),
      items: itemsPayload,
    });

    if (!parsed.success) {
      setModalError(parsed.error.issues[0]?.message ?? 'Invalid return inspection input.');
      return;
    }

    setSubmittingReturnAction(true);
    try {
      const updated = await adminApi.receiveReturn(
        selectedReturn.id,
        parsed.data,
        receiveIdempotencyKey,
      );
      setSelectedReturn(null);
      await loadReturns();
      toast({
        tone: 'success',
        title: 'Return received & stock inspected',
        description: `Return ${updated.id.slice(0, 8)} processed with inventory ledger sync.`,
      });
    } catch (err) {
      setModalError(
        err instanceof AdminApiClientError
          ? err.message
          : 'Unable to complete physical receipt inspection right now.',
      );
    } finally {
      setSubmittingReturnAction(false);
    }
  };

  const executeApproveRefund = useCallback(
    async (refundId: string, idempotencyKey: string) => {
      setApprovingRefundId(refundId);
      setRefundActionError(null);
      try {
        const updated = await adminApi.approveRefund(
          refundId,
          { decision: 'APPROVE' },
          idempotencyKey,
        );
        setRefundsList((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        setPendingApproval(null);
        setStepUpOpen(false);
        toast({
          tone: 'success',
          title: 'Refund approved and recorded in audit log.',
          description: `Refund ${updated.refundKey} (${formatIDR(updated.amountIdr)}) transitioned to ${updated.status}.`,
        });
      } catch (err) {
        if (err instanceof AdminApiClientError && err.isMfaStepUpRequired) {
          setPendingApproval({ refundId, idempotencyKey });
          setStepUpOpen(true);
          return;
        }
        if (err instanceof AdminApiClientError) {
          setRefundActionError({ message: err.message, requestId: err.requestId });
        } else {
          setRefundActionError({ message: 'Unable to authorize refund payout right now.' });
        }
      } finally {
        setApprovingRefundId(null);
      }
    },
    [toast],
  );

  const handleClickApproveRefund = useCallback(
    (refund: RefundDto) => {
      const idempotencyKey = generateIdempotencyKey('admin-rfd-app');
      void executeApproveRefund(refund.id, idempotencyKey);
    },
    [executeApproveRefund],
  );

  const handleRetryAfterStepUp = async () => {
    if (!pendingApproval) return;
    await executeApproveRefund(pendingApproval.refundId, pendingApproval.idempotencyKey);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: ActiveQueueTab) => {
    if (!showReturnsTab || !showRefundsTab) {
      return;
    }
    let nextTab: ActiveQueueTab | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      nextTab = current === 'returns' ? 'refunds' : 'returns';
    } else if (event.key === 'Home') {
      nextTab = 'returns';
    } else if (event.key === 'End') {
      nextTab = 'refunds';
    }
    if (!nextTab) {
      return;
    }
    event.preventDefault();
    setActiveTab(nextTab);
    if (nextTab === 'returns') {
      returnsTabRef.current?.focus();
    } else {
      refundsTabRef.current?.focus();
    }
  };

  const returnColumns = useMemo<DataTableColumn<ReturnDetailDto>[]>(
    () => [
      {
        key: 'id',
        header: 'Return ID',
        render: (row) => (
          <div className="space-y-0.5">
            <span className="font-mono text-xs font-medium text-ink">
              {row.id.slice(0, 8)}
            </span>
            {row.piiMasked ? (
              <p className="font-mono text-[11px] text-ink-muted">{row.customerEmail ?? 'Masked'}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'orderNumber',
        header: 'Order #',
        render: (row) => (
          <Link
            href={`/orders/${encodeURIComponent(row.orderId)}`}
            className="inline-flex min-h-11 items-center font-mono text-xs text-link hover:underline"
          >
            {row.orderNumber}
          </Link>
        ),
      },
      {
        key: 'requestedAt',
        header: 'Requested (WIB)',
        render: (row) => (
          <span className="font-mono text-xs tabular-nums text-ink-secondary">
            {formatWIB(row.createdAt)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => {
          const badge = getReturnStatusBadge(row.status);
          return <Badge tone={badge.tone}>{badge.label}</Badge>;
        },
      },
      {
        key: 'items',
        header: 'Items / Qty',
        render: (row) => {
          const totalQty = row.items.reduce((sum, item) => sum + item.quantity, 0);
          return (
            <span className="font-mono text-xs tabular-nums text-ink">
              {row.items.length} line{row.items.length === 1 ? '' : 's'} / {totalQty} qty
            </span>
          );
        },
      },
      {
        key: 'action',
        header: 'Action',
        align: 'right',
        render: (row) => (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => openReturnModal(row)}
          >
            Review / Inspect
          </Button>
        ),
      },
    ],
    [],
  );

  const refundColumns = useMemo<DataTableColumn<RefundDto>[]>(
    () => [
      {
        key: 'refundKey',
        header: 'Refund Key',
        render: (row) => (
          <span className="font-mono text-xs font-medium text-ink">{row.refundKey}</span>
        ),
      },
      {
        key: 'orderNumber',
        header: 'Order #',
        render: (row) => (
          <Link
            href={`/orders/${encodeURIComponent(row.orderId)}`}
            className="inline-flex min-h-11 items-center font-mono text-xs text-link hover:underline"
          >
            {row.orderNumber ?? row.orderId.slice(0, 8)}
          </Link>
        ),
      },
      {
        key: 'amountIdr',
        header: 'Amount (IDR)',
        align: 'right',
        render: (row) => (
          <span className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-ink">
            {formatIDR(row.amountIdr)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => {
          const badge = getRefundStatusBadge(row.status);
          return <Badge tone={badge.tone}>{badge.label}</Badge>;
        },
      },
      {
        key: 'requestedBy',
        header: 'Requested By',
        render: (row) => (
          <div className="space-y-0.5 text-xs">
            <p className="font-mono text-ink">{row.requestedByEmail ?? row.requestedBy}</p>
            <p className="font-mono tabular-nums text-ink-muted">{formatWIB(row.createdAt)}</p>
          </div>
        ),
      },
      {
        key: 'approvedBy',
        header: 'Approved By',
        render: (row) =>
          row.approvedBy ? (
            <div className="space-y-0.5 text-xs">
              <p className="font-mono text-ink">{row.approvedByEmail ?? row.approvedBy}</p>
              <p className="font-mono tabular-nums text-ink-muted">
                {formatWIB(row.completedAt)}
              </p>
            </div>
          ) : (
            <span className="text-xs text-ink-muted">Awaiting OWNER</span>
          ),
      },
      {
        key: 'action',
        header: 'Action',
        align: 'right',
        render: (row) => {
          if (row.status !== 'REQUESTED') {
            return <span className="font-mono text-xs text-ink-muted">Processed</span>;
          }
          if (!isOwnerOrRefundApprover) {
            return <span className="text-xs text-ink-muted">OWNER Approval Required</span>;
          }
          return (
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="min-h-11"
              isLoading={approvingRefundId === row.id}
              loadingLabel="Authorizing..."
              onClick={() => handleClickApproveRefund(row)}
            >
              Approve Refund
            </Button>
          );
        },
      },
    ],
    [approvingRefundId, handleClickApproveRefund, isOwnerOrRefundApprover],
  );

  return (
    <AdminShell
      title="Returns & Dual-Step Refunds"
      description="Triage customer return requests, inspect physical receipt for RETURN_TO_STOCK, and authorize OWNER-exclusive MFA refunds."
      user={user}
    >
      {sessionLoading ? (
        <LoadingState label="Checking return and refund permissions" rows={4} />
      ) : sessionError ? (
        <ErrorState
          title="Unable to verify staff session"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reload()}
        />
      ) : !hasAnyReturnsOrRefundsAccess ? (
        <AdminForbiddenPanel description="Your assigned role does not include return or refund management permissions." />
      ) : (
        <div className="space-y-6">
          {/* Accessible Role Tablist */}
          <div
            role="tablist"
            aria-label="Returns and Refunds Queues"
            className="flex flex-wrap items-center gap-2 border-b border-hairline pb-3"
          >
            {showReturnsTab ? (
              <button
                ref={returnsTabRef}
                id="tab-returns-queue"
                type="button"
                role="tab"
                aria-selected={effectiveTab === 'returns'}
                aria-controls="panel-returns-queue"
                tabIndex={effectiveTab === 'returns' ? 0 : -1}
                onClick={() => setActiveTab('returns')}
                onKeyDown={(event) => handleTabKeyDown(event, 'returns')}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors cursor-pointer',
                  effectiveTab === 'returns'
                    ? 'border-strong-border bg-panel text-ink'
                    : 'border-hairline bg-subtle text-ink-secondary hover:border-control-border hover:text-ink',
                )}
              >
                <span>Returns Queue</span>
                <Badge tone="neutral" className="tabular-nums">
                  {returnsMeta.total}
                </Badge>
              </button>
            ) : null}

            {showRefundsTab ? (
              <button
                ref={refundsTabRef}
                id="tab-refunds-queue"
                type="button"
                role="tab"
                aria-selected={effectiveTab === 'refunds'}
                aria-controls="panel-refunds-queue"
                tabIndex={effectiveTab === 'refunds' ? 0 : -1}
                onClick={() => setActiveTab('refunds')}
                onKeyDown={(event) => handleTabKeyDown(event, 'refunds')}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors cursor-pointer',
                  effectiveTab === 'refunds'
                    ? 'border-strong-border bg-panel text-ink'
                    : 'border-hairline bg-subtle text-ink-secondary hover:border-control-border hover:text-ink',
                )}
              >
                <span>Refunds Queue</span>
                <Badge tone="neutral" className="tabular-nums">
                  {refundsMeta.total}
                </Badge>
              </button>
            ) : null}
          </div>

          {effectiveTab === 'returns' && showReturnsTab ? (
            <section
              id="panel-returns-queue"
              role="tabpanel"
              aria-labelledby="tab-returns-queue"
              className="space-y-6"
            >
              {!canReadReturnsList ? (
                <StatusBanner
                  tone="info"
                  description="Viewing the returns queue requires return.read permission."
                />
              ) : (
                <>
                  <Surface variant="subtle" border="hairline" padding="md">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div className="w-full sm:w-72">
                        <FormField id="returns-status-filter" label="Return Status">
                          <Select
                            id="returns-status-filter"
                            value={returnStatusFilter}
                            onChange={(event) => {
                              setReturnStatusFilter(event.target.value);
                              setReturnPage(1);
                            }}
                          >
                            <option value="">ALL</option>
                            {RETURN_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {formatStatusLabel(status)}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        className="min-h-11"
                        onClick={() => void loadReturns()}
                      >
                        Refresh Queue
                      </Button>
                    </div>
                  </Surface>

                  <DataTable
                    caption="ARVEN returns queue"
                    tableBreakpoint="lg"
                    columns={returnColumns}
                    rows={returnsList}
                    getRowKey={(row) => row.id}
                    isLoading={loadingReturns}
                    loadingLabel="Loading return requests"
                    error={returnsError?.message ?? null}
                    errorRequestId={returnsError?.requestId ?? null}
                    onRetry={() => void loadReturns()}
                    emptyTitle="No return requests found"
                    emptyDescription="Adjust the status filter or check again when customers submit return claims."
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-xs text-ink-muted">
                    <span className="font-mono tabular-nums">
                      Page {returnsMeta.page} of {returnsMeta.totalPages} ({returnsMeta.total} returns)
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        className="min-h-11"
                        disabled={returnsMeta.page <= 1 || loadingReturns}
                        onClick={() => setReturnPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        className="min-h-11"
                        disabled={returnsMeta.page >= returnsMeta.totalPages || loadingReturns}
                        onClick={() => setReturnPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </section>
          ) : null}

          {effectiveTab === 'refunds' && showRefundsTab ? (
            <section
              id="panel-refunds-queue"
              role="tabpanel"
              aria-labelledby="tab-refunds-queue"
              className="space-y-6"
            >
              <StatusBanner
                tone="info"
                title="Dual-Control Refund Authorization"
                description="Refund initiation (refund.request) and payout authorization (refund.approve) are strictly separated. Only OWNER with fresh TOTP MFA step-up verification (within 15 minutes) may authorize payout."
              />

              {refundActionError ? (
                <StatusBanner
                  tone="danger"
                  title="Refund Authorization Failed"
                  description={refundActionError.message}
                  requestId={refundActionError.requestId}
                  onDismiss={() => setRefundActionError(null)}
                />
              ) : null}

              {!canReadRefundsList ? (
                <StatusBanner
                  tone="info"
                  description="Viewing the refunds queue requires refund.request or refund.approve permission."
                />
              ) : (
                <>
                  <Surface variant="subtle" border="hairline" padding="md">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div className="w-full sm:w-72">
                        <FormField id="refunds-status-filter" label="Refund Status">
                          <Select
                            id="refunds-status-filter"
                            value={refundStatusFilter}
                            onChange={(event) => {
                              setRefundStatusFilter(event.target.value);
                              setRefundPage(1);
                            }}
                          >
                            <option value="">ALL</option>
                            {REFUND_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {formatStatusLabel(status)}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        className="min-h-11"
                        onClick={() => void loadRefunds()}
                      >
                        Refresh Queue
                      </Button>
                    </div>
                  </Surface>

                  <DataTable
                    caption="ARVEN dual-step refunds queue"
                    tableBreakpoint="lg"
                    columns={refundColumns}
                    rows={refundsList}
                    getRowKey={(row) => row.id}
                    isLoading={loadingRefunds}
                    loadingLabel="Loading refund requests"
                    error={refundsError?.message ?? null}
                    errorRequestId={refundsError?.requestId ?? null}
                    onRetry={() => void loadRefunds()}
                    emptyTitle="No refund requests found"
                    emptyDescription="Refund requests initiated from an order detail workspace appear here for OWNER approval."
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-xs text-ink-muted">
                    <span className="font-mono tabular-nums">
                      Page {refundsMeta.page} of {refundsMeta.totalPages} ({refundsMeta.total} refunds)
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        className="min-h-11"
                        disabled={refundsMeta.page <= 1 || loadingRefunds}
                        onClick={() => setRefundPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        className="min-h-11"
                        disabled={refundsMeta.page >= refundsMeta.totalPages || loadingRefunds}
                        onClick={() => setRefundPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </section>
          ) : null}
        </div>
      )}

      {/* Return Detail & Inspection Modal */}
      <Modal
        isOpen={Boolean(selectedReturn)}
        onClose={() => setSelectedReturn(null)}
        title={
          selectedReturn
            ? `Return ${selectedReturn.id.slice(0, 8)} (Order ${selectedReturn.orderNumber})`
            : 'Return Inspection'
        }
        description={
          selectedReturn
            ? `Submitted ${formatWIB(selectedReturn.createdAt)} | Status: ${formatStatusLabel(selectedReturn.status)}`
            : undefined
        }
        size="lg"
        footer={
          <Button type="button" variant="secondary" onClick={() => setSelectedReturn(null)}>
            Close
          </Button>
        }
      >
        {selectedReturn ? (
          <div className="space-y-5">
            {modalError ? <StatusBanner tone="danger" description={modalError} /> : null}

            <div className="rounded-[var(--radius-sm)] border border-hairline bg-subtle p-4 space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={getReturnStatusBadge(selectedReturn.status).tone}>
                  {getReturnStatusBadge(selectedReturn.status).label}
                </Badge>
                <span className="font-mono text-xs text-ink-muted">
                  Customer: {selectedReturn.customerEmail ?? 'Account customer'}
                </span>
              </div>
              <p className="font-medium text-ink">Reason: {selectedReturn.reason}</p>
              {selectedReturn.customerNotes ? (
                <p className="text-xs leading-relaxed text-ink-secondary">
                  Customer notes: {selectedReturn.customerNotes}
                </p>
              ) : null}
              {selectedReturn.evidenceKeys.length > 0 ? (
                <p className="font-mono text-xs text-ink-muted">
                  Evidence keys: {selectedReturn.evidenceKeys.join(', ')}
                </p>
              ) : null}
              {selectedReturn.reviewedAt ? (
                <p className="font-mono text-xs tabular-nums text-ink-muted">
                  Reviewed: {formatWIB(selectedReturn.reviewedAt)}
                </p>
              ) : null}
              {selectedReturn.receivedAt ? (
                <p className="font-mono text-xs tabular-nums text-ink-muted">
                  Received: {formatWIB(selectedReturn.receivedAt)}
                </p>
              ) : null}
            </div>

            <Divider />

            {selectedReturn.status === 'APPROVED' && canInspectReturn ? (
              <form onSubmit={handleReceiveAndInspect} noValidate className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-ink">
                    Receive &amp; Inspect Stock
                  </h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Checking Return to sellable stock (RETURN_TO_STOCK) atomically increments
                    inventory_levels.quantity_on_hand and appends an immutable RETURN_TO_STOCK
                    inventory_movements ledger row. DAMAGED and DEFECTIVE units cannot be restocked.
                  </p>
                </div>

                <FormField id="return-receive-wh" label="Receiving Warehouse Code">
                  <Input
                    id="return-receive-wh"
                    value={warehouseCode}
                    onChange={(event) => setWarehouseCode(event.target.value)}
                    className="font-mono"
                  />
                </FormField>

                <div className="space-y-3">
                  {selectedReturn.items.map((item) => {
                    const draft = inspectionDrafts[item.id] ?? {
                      returnItemId: item.id,
                      condition: 'GOOD' as ReturnItemConditionInput,
                      restock: true,
                    };
                    const allowRestock = isRestockAllowedForCondition(draft.condition);

                    return (
                      <div
                        key={item.id}
                        className="space-y-3 rounded-[var(--radius-sm)] border border-control-border bg-subtle p-3.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-ink">{item.productName}</p>
                            <p className="font-mono text-xs text-ink-muted">
                              SKU: {item.sku} | {item.color} / Size {item.size}
                            </p>
                          </div>
                          <span className="font-mono text-xs tabular-nums text-ink">
                            Return Qty: {item.quantity}
                          </span>
                        </div>

                        <fieldset className="space-y-2">
                          <legend className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                            Inspected Condition
                          </legend>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {CONDITION_OPTIONS.map((cond) => {
                              const selected = draft.condition === cond;
                              return (
                                <label
                                  key={cond}
                                  className={cn(
                                    'relative flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border px-3 py-2 text-xs font-medium transition-colors',
                                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--arven-focus-ring)] has-[:focus-visible]:outline-offset-2',
                                    selected
                                      ? 'border-strong-border bg-panel text-ink'
                                      : 'border-control-border bg-canvas text-ink-secondary hover:text-ink',
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name={`condition-${item.id}`}
                                    value={cond}
                                    checked={selected}
                                    onChange={() => {
                                      setInspectionDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: {
                                          returnItemId: item.id,
                                          condition: cond,
                                          restock: isRestockAllowedForCondition(cond)
                                            ? (prev[item.id]?.restock ?? true)
                                            : false,
                                        },
                                      }));
                                    }}
                                    className="sr-only"
                                  />
                                  <span>{cond}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>

                        <Checkbox
                          id={`restock-${item.id}`}
                          label="Return to sellable stock (RETURN_TO_STOCK)"
                          description={
                            allowRestock
                              ? 'Eligible for sellable stock return upon receipt.'
                              : 'Disabled because DAMAGED and DEFECTIVE garments cannot re-enter sellable inventory.'
                          }
                          disabled={!allowRestock}
                          checked={allowRestock ? draft.restock : false}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setInspectionDrafts((prev) => ({
                              ...prev,
                              [item.id]: {
                                returnItemId: item.id,
                                condition: draft.condition,
                                restock: checked,
                              },
                            }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                <FormField id="return-receive-notes" label="Inspection Notes (Optional)">
                  <Textarea
                    id="return-receive-notes"
                    value={actionNotes}
                    onChange={(event) => setActionNotes(event.target.value)}
                    placeholder="Record physical seal, tag, and garment check observations"
                  />
                </FormField>

                <p className="font-mono text-[11px] text-ink-muted">
                  Idempotency-Key: {receiveIdempotencyKey}
                </p>

                <Button
                  type="submit"
                  variant="primary"
                  className="min-h-11"
                  isLoading={submittingReturnAction}
                  loadingLabel="Recording Receipt..."
                >
                  Confirm Receive &amp; Inspect Stock
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                    Returned Units
                  </h3>
                  <ul className="space-y-2">
                    {selectedReturn.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3 text-xs"
                      >
                        <div>
                          <p className="font-medium text-ink">{item.productName}</p>
                          <p className="font-mono text-ink-muted">
                            {item.sku} | {item.color} / Size {item.size}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono tabular-nums text-ink">
                            Qty: {item.quantity}
                          </span>
                          {item.condition ? (
                            <Badge tone={item.restocked ? 'success' : 'neutral'}>
                              {item.condition}
                              {item.restocked ? ' (Restocked)' : ''}
                            </Badge>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {selectedReturn.status === 'REQUESTED' && canReviewReturn ? (
                  <div className="space-y-3 border-t border-hairline pt-4">
                    <FormField id="return-review-notes" label="Triage Notes (Optional)">
                      <Textarea
                        id="return-review-notes"
                        value={actionNotes}
                        onChange={(event) => setActionNotes(event.target.value)}
                        placeholder="Initial triage notes before review"
                      />
                    </FormField>
                    <Button
                      type="button"
                      variant="primary"
                      className="min-h-11"
                      isLoading={submittingReturnAction}
                      loadingLabel="Starting Review..."
                      onClick={() => void handleStartReview()}
                    >
                      Start Review
                    </Button>
                  </div>
                ) : null}

                {selectedReturn.status === 'UNDER_REVIEW' && canApproveReturn ? (
                  <div className="space-y-3 border-t border-hairline pt-4">
                    <FormField
                      id="return-decision-notes"
                      label="Decision Notes (Required on Reject)"
                    >
                      <Textarea
                        id="return-decision-notes"
                        value={actionNotes}
                        onChange={(event) => setActionNotes(event.target.value)}
                        placeholder="Approval instructions or rejection justification"
                      />
                    </FormField>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        className="min-h-11"
                        isLoading={submittingReturnAction}
                        loadingLabel="Approving..."
                        onClick={() => void handleApproveOrRejectReturn('APPROVE')}
                      >
                        Approve Return
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        className="min-h-11"
                        isLoading={submittingReturnAction}
                        loadingLabel="Rejecting..."
                        onClick={() => void handleApproveOrRejectReturn('REJECT')}
                      >
                        Reject Return
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Inline OWNER MFA Step-Up Modal for Refund Approval */}
      <MfaStepUpModal
        isOpen={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setPendingApproval(null);
        }}
        onVerified={handleRetryAfterStepUp}
        redirectPath="/returns"
      />
    </AdminShell>
  );
}
