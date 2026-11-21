'use client';

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
  AdminInventoryLevelDto,
  AdminInventoryMovementDto,
  AdminManualMovementTypeInput,
  AdminStockReservationDto,
  InventoryMovementTypeInput,
  StockReservationStatusInput,
} from '@arven/contracts';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  FormField,
  Input,
  Modal,
  Select,
  StatusBanner,
  Surface,
  cn,
  formatWIB,
  useToast,
  type DataTableColumn,
} from '@arven/ui';
import { AdminShell } from '@/components/admin-shell';
import {
  AdminApiClientError,
  adminApi,
  extractAdminFieldErrors,
  generateIdempotencyKey,
  type PaginationMeta,
} from '@/lib/api-client';
import { stockStatusTone } from '@/lib/catalog-helpers';
import {
  computeProjectedOnHand,
  movementTypeTone,
  reservationStatusTone,
  validateStockMovementDraft,
} from '@/lib/inventory-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

type InventoryTabId = 'levels' | 'movements' | 'reservations';

const TAB_ITEMS: readonly { id: InventoryTabId; label: string }[] = [
  { id: 'levels', label: 'Levels' },
  { id: 'movements', label: 'Movements Ledger' },
  { id: 'reservations', label: 'Reservations' },
];

const DEFAULT_META: PaginationMeta = {
  requestId: '',
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
};

function formatSignedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

export function InventoryWorkspace() {
  const { toast } = useToast();
  const { user, loading: sessionLoading, error: sessionError, permissions, canAccess, reload } =
    useAdminSession();

  const isOwner = Boolean(user?.roles.includes('OWNER'));
  const canReadInventory = canAccess(['inventory.read', 'inventory.receive', 'inventory.adjust']);
  const canReceive = Boolean(isOwner || permissions.has('inventory.receive'));
  const canAdjust = Boolean(isOwner || permissions.has('inventory.adjust'));
  const canMutateInventory = canReceive || canAdjust;

  const allowedMovementTypes = useMemo<AdminManualMovementTypeInput[]>(() => {
    const types: AdminManualMovementTypeInput[] = [];
    if (canReceive) types.push('RECEIPT');
    if (canAdjust) types.push('ADJUSTMENT');
    return types;
  }, [canAdjust, canReceive]);

  const [activeTab, setActiveTab] = useState<InventoryTabId>('levels');
  const tabButtonRefs = useRef<Partial<Record<InventoryTabId, HTMLButtonElement | null>>>({});

  // Levels state
  const [draftLevelQuery, setDraftLevelQuery] = useState('');
  const [draftLowStockOnly, setDraftLowStockOnly] = useState(false);
  const [levelFilters, setLevelFilters] = useState<{
    page: number;
    q: string;
    lowStockOnly: boolean;
  }>({
    page: 1,
    q: '',
    lowStockOnly: false,
  });
  const [levels, setLevels] = useState<AdminInventoryLevelDto[]>([]);
  const [levelsMeta, setLevelsMeta] = useState<PaginationMeta>(DEFAULT_META);
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [levelsError, setLevelsError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [variantOptions, setVariantOptions] = useState<AdminInventoryLevelDto[]>([]);

  // Movements ledger state
  const [movementTypeFilter, setMovementTypeFilter] = useState<'ALL' | InventoryMovementTypeInput>(
    'ALL',
  );
  const [movementsPage, setMovementsPage] = useState(1);
  const [movements, setMovements] = useState<AdminInventoryMovementDto[]>([]);
  const [movementsMeta, setMovementsMeta] = useState<PaginationMeta>(DEFAULT_META);
  const [movementsLoading, setMovementsLoading] = useState(true);
  const [movementsError, setMovementsError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);

  // Reservations state
  const [reservationStatusFilter, setReservationStatusFilter] = useState<
    'ALL' | StockReservationStatusInput
  >('ALL');
  const [reservationsPage, setReservationsPage] = useState(1);
  const [reservations, setReservations] = useState<AdminStockReservationDto[]>([]);
  const [reservationsMeta, setReservationsMeta] = useState<PaginationMeta>(DEFAULT_META);
  const [activeReservationsCount, setActiveReservationsCount] = useState<number>(0);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [reservationsError, setReservationsError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);

  // Record Stock Movement modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVariantId, setModalVariantId] = useState('');
  const [modalWarehouseCode, setModalWarehouseCode] = useState('JKT-MAIN-01');
  const [modalType, setModalType] = useState<AdminManualMovementTypeInput>('RECEIPT');
  const [modalDeltaRaw, setModalDeltaRaw] = useState('10');
  const [modalReason, setModalReason] = useState('');
  const [modalIdempotencyKey, setModalIdempotencyKey] = useState(() =>
    generateIdempotencyKey('admin-inv'),
  );
  const [modalFieldErrors, setModalFieldErrors] = useState<Record<string, string>>({});
  const [modalError, setModalError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [submittingMovement, setSubmittingMovement] = useState(false);

  const loadLevels = useCallback(async () => {
    setLevelsLoading(true);
    setLevelsError(null);
    try {
      const [pageResult, optionsResult] = await Promise.all([
        adminApi.listInventoryLevels({
          page: levelFilters.page,
          limit: 20,
          q: levelFilters.q || undefined,
          lowStockOnly: levelFilters.lowStockOnly ? true : undefined,
        }),
        adminApi.listInventoryLevels({ page: 1, limit: 100 }),
      ]);
      setLevels(pageResult.items);
      setLevelsMeta(pageResult.meta);
      setVariantOptions(optionsResult.items);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setLevelsError({ message: err.message, requestId: err.requestId });
      } else {
        setLevelsError({ message: 'Unable to load inventory levels right now.' });
      }
    } finally {
      setLevelsLoading(false);
    }
  }, [levelFilters]);

  const loadMovements = useCallback(async () => {
    setMovementsLoading(true);
    setMovementsError(null);
    try {
      const result = await adminApi.listInventoryMovements({
        page: movementsPage,
        limit: 20,
        type: movementTypeFilter === 'ALL' ? undefined : movementTypeFilter,
      });
      setMovements(result.items);
      setMovementsMeta(result.meta);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setMovementsError({ message: err.message, requestId: err.requestId });
      } else {
        setMovementsError({ message: 'Unable to load inventory movements ledger.' });
      }
    } finally {
      setMovementsLoading(false);
    }
  }, [movementTypeFilter, movementsPage]);

  const loadReservations = useCallback(async () => {
    setReservationsLoading(true);
    setReservationsError(null);
    try {
      const [result, activeSummary] = await Promise.all([
        adminApi.listStockReservations({
          page: reservationsPage,
          limit: 20,
          status: reservationStatusFilter === 'ALL' ? undefined : reservationStatusFilter,
        }),
        adminApi.listStockReservations({
          page: 1,
          limit: 1,
          status: 'ACTIVE',
        }),
      ]);
      setReservations(result.items);
      setReservationsMeta(result.meta);
      setActiveReservationsCount(activeSummary.meta.total);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setReservationsError({ message: err.message, requestId: err.requestId });
      } else {
        setReservationsError({ message: 'Unable to load stock reservations.' });
      }
    } finally {
      setReservationsLoading(false);
    }
  }, [reservationStatusFilter, reservationsPage]);

  useEffect(() => {
    if (sessionLoading || !user || !canReadInventory) {
      return;
    }
    let active = true;
    Promise.all([
      adminApi.listInventoryLevels({
        page: levelFilters.page,
        limit: 20,
        q: levelFilters.q || undefined,
        lowStockOnly: levelFilters.lowStockOnly ? true : undefined,
      }),
      adminApi.listInventoryLevels({ page: 1, limit: 100 }),
    ])
      .then(([pageResult, optionsResult]) => {
        if (!active) return;
        setLevels(pageResult.items);
        setLevelsMeta(pageResult.meta);
        setVariantOptions(optionsResult.items);
        setLevelsError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setLevelsError({ message: err.message, requestId: err.requestId });
        } else {
          setLevelsError({ message: 'Unable to load inventory levels right now.' });
        }
      })
      .finally(() => {
        if (active) setLevelsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canReadInventory, levelFilters, sessionLoading, user]);

  useEffect(() => {
    if (sessionLoading || !user || !canReadInventory) {
      return;
    }
    let active = true;
    adminApi
      .listInventoryMovements({
        page: movementsPage,
        limit: 20,
        type: movementTypeFilter === 'ALL' ? undefined : movementTypeFilter,
      })
      .then((result) => {
        if (!active) return;
        setMovements(result.items);
        setMovementsMeta(result.meta);
        setMovementsError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setMovementsError({ message: err.message, requestId: err.requestId });
        } else {
          setMovementsError({ message: 'Unable to load inventory movements ledger.' });
        }
      })
      .finally(() => {
        if (active) setMovementsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canReadInventory, movementTypeFilter, movementsPage, sessionLoading, user]);

  useEffect(() => {
    if (sessionLoading || !user || !canReadInventory) {
      return;
    }
    let active = true;
    Promise.all([
      adminApi.listStockReservations({
        page: reservationsPage,
        limit: 20,
        status: reservationStatusFilter === 'ALL' ? undefined : reservationStatusFilter,
      }),
      adminApi.listStockReservations({
        page: 1,
        limit: 1,
        status: 'ACTIVE',
      }),
    ])
      .then(([result, activeSummary]) => {
        if (!active) return;
        setReservations(result.items);
        setReservationsMeta(result.meta);
        setActiveReservationsCount(activeSummary.meta.total);
        setReservationsError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setReservationsError({ message: err.message, requestId: err.requestId });
        } else {
          setReservationsError({ message: 'Unable to load stock reservations.' });
        }
      })
      .finally(() => {
        if (active) setReservationsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    canReadInventory,
    reservationStatusFilter,
    reservationsPage,
    sessionLoading,
    user,
  ]);

  const openMovementModal = (preset?: {
    variantId?: string;
    warehouseCode?: string;
    type?: AdminManualMovementTypeInput;
  }) => {
    if (!canMutateInventory) return;
    const defaultType =
      preset?.type && allowedMovementTypes.includes(preset.type)
        ? preset.type
        : (allowedMovementTypes[0] ?? 'RECEIPT');
    const defaultVariantId =
      preset?.variantId ?? variantOptions[0]?.variantId ?? levels[0]?.variantId ?? '';

    setModalVariantId(defaultVariantId);
    setModalWarehouseCode(preset?.warehouseCode || 'JKT-MAIN-01');
    setModalType(defaultType);
    setModalDeltaRaw(defaultType === 'RECEIPT' ? '10' : '1');
    setModalReason('');
    setModalFieldErrors({});
    setModalError(null);
    setModalIdempotencyKey(generateIdempotencyKey('admin-inv'));
    setModalOpen(true);
  };

  const regenerateModalIdempotencyKey = () => {
    setModalIdempotencyKey(generateIdempotencyKey('admin-inv'));
  };

  const selectedLevelForModal = useMemo(() => {
    return (
      variantOptions.find((item) => item.variantId === modalVariantId) ??
      levels.find((item) => item.variantId === modalVariantId) ??
      null
    );
  }, [levels, modalVariantId, variantOptions]);

  const projectedOnHand = useMemo(() => {
    if (!selectedLevelForModal) return null;
    return computeProjectedOnHand(selectedLevelForModal.quantityOnHand, modalDeltaRaw);
  }, [modalDeltaRaw, selectedLevelForModal]);

  const handleSubmitMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalFieldErrors({});
    setModalError(null);

    if (!allowedMovementTypes.includes(modalType)) {
      setModalError({
        message: 'Your role does not have permission for the selected stock movement type.',
      });
      return;
    }

    const validation = validateStockMovementDraft({
      warehouseCode: modalWarehouseCode,
      variantId: modalVariantId,
      type: modalType,
      quantityDeltaRaw: modalDeltaRaw,
      reason: modalReason,
    });

    if (!validation.ok) {
      setModalFieldErrors(validation.fieldErrors);
      return;
    }

    setSubmittingMovement(true);
    try {
      const result = await adminApi.createStockMovement(validation.data, modalIdempotencyKey);
      toast({
        tone: 'success',
        title: 'Stock movement recorded',
        description: `${result.level.sku} updated to ${result.level.quantityOnHand} on hand (${result.level.availableQty} available).`,
      });
      setModalOpen(false);
      await Promise.all([loadLevels(), loadMovements()]);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setModalFieldErrors(extractAdminFieldErrors(err));
        setModalError({ message: err.message, requestId: err.requestId });
      } else {
        setModalError({ message: 'Unable to record stock movement right now.' });
      }
    } finally {
      setSubmittingMovement(false);
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % TAB_ITEMS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + TAB_ITEMS.length) % TAB_ITEMS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = TAB_ITEMS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = TAB_ITEMS[nextIndex];
    if (nextTab) {
      setActiveTab(nextTab.id);
      tabButtonRefs.current[nextTab.id]?.focus();
    }
  };

  const handleLevelSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLevelFilters({
      page: 1,
      q: draftLevelQuery.trim(),
      lowStockOnly: draftLowStockOnly,
    });
  };

  const resetLevelFilters = () => {
    setDraftLevelQuery('');
    setDraftLowStockOnly(false);
    setLevelFilters({ page: 1, q: '', lowStockOnly: false });
  };

  const lowStockCountOnPage = useMemo(() => {
    return levels.filter(
      (item) => item.stockStatus === 'LOW_STOCK' || item.stockStatus === 'OUT_OF_STOCK',
    ).length;
  }, [levels]);

  const levelColumns: DataTableColumn<AdminInventoryLevelDto>[] = [
    {
      key: 'sku',
      header: 'SKU & Garment',
      render: (item) => (
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs font-medium text-ink break-all">{item.sku}</p>
          <p className="text-sm font-medium text-ink">{item.productName}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full border border-control-border"
                style={{ backgroundColor: item.colorHex || '#17191B' }}
              />
              <span>{item.color}</span>
            </span>
            <span aria-hidden="true">/</span>
            <span>Size {item.size}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'onHand',
      header: 'On Hand',
      align: 'right',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-ink">
          {item.quantityOnHand}
        </span>
      ),
    },
    {
      key: 'reserved',
      header: 'Reserved',
      align: 'right',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-sm tabular-nums text-ink-secondary">
          {item.quantityReserved}
        </span>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      align: 'right',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-ink">
          {item.availableQty}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => <Badge tone={stockStatusTone(item.stockStatus)}>{item.stockStatus}</Badge>,
    },
    {
      key: 'updated',
      header: 'Updated (WIB)',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-xs text-ink-muted">
          {formatWIB(item.updatedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Quick Ops',
      align: 'right',
      render: (item) =>
        canMutateInventory ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canReceive ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  openMovementModal({
                    variantId: item.variantId,
                    warehouseCode: item.warehouseCode,
                    type: 'RECEIPT',
                  })
                }
              >
                Receive
              </Button>
            ) : null}
            {canAdjust ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  openMovementModal({
                    variantId: item.variantId,
                    warehouseCode: item.warehouseCode,
                    type: 'ADJUSTMENT',
                  })
                }
              >
                Adjust
              </Button>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-ink-muted">Read only</span>
        ),
    },
  ];

  const movementColumns: DataTableColumn<AdminInventoryMovementDto>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp (WIB)',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-xs text-ink-muted">
          {formatWIB(item.createdAt)}
        </span>
      ),
    },
    {
      key: 'sku',
      header: 'SKU & Variant',
      render: (item) => (
        <div className="min-w-0 space-y-0.5">
          <p className="font-mono text-xs font-medium text-ink break-all">{item.sku}</p>
          <p className="text-xs text-ink-secondary">
            {item.productName} ({item.color} / {item.size})
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (item) => <Badge tone={movementTypeTone(item.type)}>{item.type}</Badge>,
    },
    {
      key: 'delta',
      header: 'Delta',
      align: 'right',
      render: (item) => (
        <span
          className={cn(
            'whitespace-nowrap font-mono text-sm font-semibold tabular-nums',
            item.quantityDelta > 0 ? 'text-success-fg' : 'text-warning-fg',
          )}
        >
          {formatSignedDelta(item.quantityDelta)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (item) => (
        <span className="text-xs text-ink-secondary break-words">
          {item.reason || 'Not specified'}
        </span>
      ),
    },
    {
      key: 'referenceType',
      header: 'Reference',
      render: (item) => (
        <span className="font-mono text-xs text-ink-muted">{item.referenceType}</span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (item) => (
        <span className="font-mono text-xs text-ink-muted break-all">
          {item.actorEmail || 'System'}
        </span>
      ),
    },
  ];

  const reservationColumns: DataTableColumn<AdminStockReservationDto>[] = [
    {
      key: 'orderNumber',
      header: 'Order Reference',
      render: (item) => (
        <span className="font-mono text-xs font-medium text-ink break-all">
          {item.orderNumber || item.orderId}
        </span>
      ),
    },
    {
      key: 'sku',
      header: 'SKU & Variant',
      render: (item) => (
        <div className="min-w-0 space-y-0.5">
          <p className="font-mono text-xs font-medium text-ink break-all">{item.sku}</p>
          <p className="text-xs text-ink-secondary">
            {item.productName} ({item.color} / {item.size})
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Reserved Qty',
      align: 'right',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-ink">
          {item.quantity}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <Badge tone={reservationStatusTone(item.status)}>{item.status}</Badge>
      ),
    },
    {
      key: 'expiresAt',
      header: 'Expires (WIB)',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-xs text-ink-muted">
          {formatWIB(item.expiresAt)}
        </span>
      ),
    },
  ];

  return (
    <AdminShell
      title="Inventory Ledger"
      description="Monitor JKT-MAIN-01 warehouse stock levels, audit append-only stock movements, and review active order reservations."
      user={user}
      actions={
        canReadInventory && canMutateInventory ? (
          <Button type="button" variant="primary" size="md" onClick={() => openMovementModal()}>
            Record Stock Movement
          </Button>
        ) : undefined
      }
    >
      {sessionLoading ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Verifying inventory permissions...</p>
        </div>
      ) : sessionError ? (
        <StatusBanner
          tone="danger"
          title="Unable to verify staff session"
          description={sessionError.message}
          requestId={sessionError.requestId}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void reload()}>
              Retry
            </Button>
          }
        />
      ) : !canReadInventory ? (
        <StatusBanner
          tone="danger"
          title="403 Forbidden: Inventory Read Permission Required"
          description="Your assigned role does not grant inventory.read, inventory.receive, or inventory.adjust access."
        />
      ) : (
        <div className="space-y-6">
          {!canMutateInventory ? (
            <StatusBanner
              tone="info"
              title="Read-Only Inventory Mode"
              description="Your role grants inventory.read visibility. Recording stock receipts or manual adjustments requires inventory.receive or inventory.adjust permission."
            />
          ) : null}

          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Surface variant="subtle" border="hairline" padding="md" className="space-y-1.5">
              <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                Primary Warehouse
              </p>
              <p className="font-mono text-xl font-medium text-ink">JKT-MAIN-01</p>
              <p className="text-xs text-ink-muted">Jakarta Atelier Main</p>
            </Surface>

            <Surface variant="subtle" border="hairline" padding="md" className="space-y-1.5">
              <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                Tracked SKUs
              </p>
              <p className="font-mono text-xl font-medium tabular-nums text-ink">
                {levelsMeta.total}
              </p>
              <p className="text-xs tabular-nums text-ink-muted">
                {levels.length} shown on current page
              </p>
            </Surface>

            <Surface variant="subtle" border="hairline" padding="md" className="space-y-1.5">
              <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                Low / Out-of-Stock (Page)
              </p>
              <p className="font-mono text-xl font-medium tabular-nums text-ink">
                {lowStockCountOnPage}
              </p>
              <p className="text-xs text-ink-muted">At or below reorder threshold</p>
            </Surface>

            <Surface variant="subtle" border="hairline" padding="md" className="space-y-1.5">
              <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                Active Reservations
              </p>
              <p className="font-mono text-xl font-medium tabular-nums text-ink">
                {activeReservationsCount}
              </p>
              <p className="text-xs text-ink-muted">Pending order holds</p>
            </Surface>
          </div>

          {/* Accessible Tabs */}
          <div
            role="tablist"
            aria-label="Inventory workspace sections"
            className="flex flex-wrap gap-2 border-b border-hairline pb-3"
          >
            {TAB_ITEMS.map((tab, index) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(node) => {
                    tabButtonRefs.current[tab.id] = node;
                  }}
                  id={`inventory-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`inventory-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors cursor-pointer',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    selected
                      ? 'border-strong-border bg-panel text-ink'
                      : 'border-hairline bg-subtle text-ink-muted hover:border-control-border hover:text-ink',
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Panel: Levels */}
          {activeTab === 'levels' ? (
            <section
              id="inventory-panel-levels"
              role="tabpanel"
              aria-labelledby="inventory-tab-levels"
              className="space-y-4"
            >
              <Surface variant="subtle" border="hairline" padding="md">
                <form
                  onSubmit={handleLevelSearchSubmit}
                  className="flex flex-col gap-4 md:flex-row md:items-end"
                >
                  <div className="min-w-0 flex-1">
                    <FormField id="inv-levels-search" label="Search SKU or Product">
                      <Input
                        id="inv-levels-search"
                        value={draftLevelQuery}
                        onChange={(event) => setDraftLevelQuery(event.target.value)}
                        placeholder="Search by SKU, product name, or slug..."
                      />
                    </FormField>
                  </div>

                  <div className="flex min-h-11 items-center">
                    <Checkbox
                      id="inv-low-stock-only"
                      label="Low Stock Only"
                      checked={draftLowStockOnly}
                      onChange={(event) => setDraftLowStockOnly(event.target.checked)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" variant="primary" size="md">
                      Filter
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={resetLevelFilters}
                    >
                      Reset
                    </Button>
                  </div>
                </form>
              </Surface>

              <DataTable
                caption="ARVEN warehouse inventory levels"
                columns={levelColumns}
                rows={levels}
                getRowKey={(row) => row.id}
                tableBreakpoint="xl"
                isLoading={levelsLoading}
                loadingLabel="Loading warehouse inventory levels"
                error={levelsError?.message}
                errorRequestId={levelsError?.requestId}
                onRetry={() => void loadLevels()}
                emptyTitle="No inventory records found"
                emptyDescription="Adjust your search term or low-stock filter to view SKU levels."
                emptyAction={
                  <Button type="button" variant="secondary" size="sm" onClick={resetLevelFilters}>
                    Reset Filters
                  </Button>
                }
              />

              {levelsMeta.totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="font-mono text-xs tabular-nums text-ink-muted">
                    Page {levelsMeta.page} of {levelsMeta.totalPages} ({levelsMeta.total} SKUs)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={levelsMeta.page <= 1}
                      onClick={() =>
                        setLevelFilters((prev) => ({ ...prev, page: prev.page - 1 }))
                      }
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={levelsMeta.page >= levelsMeta.totalPages}
                      onClick={() =>
                        setLevelFilters((prev) => ({ ...prev, page: prev.page + 1 }))
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Tab Panel: Movements Ledger */}
          {activeTab === 'movements' ? (
            <section
              id="inventory-panel-movements"
              role="tabpanel"
              aria-labelledby="inventory-tab-movements"
              className="space-y-4"
            >
              <Surface variant="subtle" border="hairline" padding="md">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="w-full sm:max-w-xs">
                    <FormField id="inv-movement-type-filter" label="Movement Type">
                      <Select
                        id="inv-movement-type-filter"
                        value={movementTypeFilter}
                        onChange={(event) => {
                          setMovementsPage(1);
                          setMovementTypeFilter(
                            event.target.value as 'ALL' | InventoryMovementTypeInput,
                          );
                        }}
                      >
                        <option value="ALL">All Movement Types</option>
                        <option value="RECEIPT">RECEIPT</option>
                        <option value="ADJUSTMENT">ADJUSTMENT</option>
                        <option value="RESERVATION">RESERVATION</option>
                        <option value="RELEASE">RELEASE</option>
                        <option value="SALE">SALE</option>
                        <option value="RETURN_TO_STOCK">RETURN_TO_STOCK</option>
                      </Select>
                    </FormField>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={() => void loadMovements()}
                    >
                      Refresh Ledger
                    </Button>
                    {movementTypeFilter !== 'ALL' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={() => {
                          setMovementsPage(1);
                          setMovementTypeFilter('ALL');
                        }}
                      >
                        Clear Filter
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Surface>

              <DataTable
                caption="ARVEN append-only inventory movements ledger"
                columns={movementColumns}
                rows={movements}
                getRowKey={(row) => row.id}
                tableBreakpoint="xl"
                isLoading={movementsLoading}
                loadingLabel="Loading append-only movements ledger"
                error={movementsError?.message}
                errorRequestId={movementsError?.requestId}
                onRetry={() => void loadMovements()}
                emptyTitle="No inventory movements recorded"
                emptyDescription="Stock receipts, adjustments, and order lifecycle movements will appear in this append-only ledger."
              />

              {movementsMeta.totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="font-mono text-xs tabular-nums text-ink-muted">
                    Page {movementsMeta.page} of {movementsMeta.totalPages} ({movementsMeta.total}{' '}
                    entries)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={movementsMeta.page <= 1}
                      onClick={() => setMovementsPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={movementsMeta.page >= movementsMeta.totalPages}
                      onClick={() => setMovementsPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Tab Panel: Reservations */}
          {activeTab === 'reservations' ? (
            <section
              id="inventory-panel-reservations"
              role="tabpanel"
              aria-labelledby="inventory-tab-reservations"
              className="space-y-4"
            >
              <Surface variant="subtle" border="hairline" padding="md">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="w-full sm:max-w-xs">
                    <FormField id="inv-reservation-status-filter" label="Reservation Status">
                      <Select
                        id="inv-reservation-status-filter"
                        value={reservationStatusFilter}
                        onChange={(event) => {
                          setReservationsPage(1);
                          setReservationStatusFilter(
                            event.target.value as 'ALL' | StockReservationStatusInput,
                          );
                        }}
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="RELEASED">RELEASED</option>
                        <option value="COMMITTED">COMMITTED</option>
                        <option value="EXPIRED">EXPIRED</option>
                      </Select>
                    </FormField>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={() => void loadReservations()}
                    >
                      Refresh Reservations
                    </Button>
                    {reservationStatusFilter !== 'ALL' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={() => {
                          setReservationsPage(1);
                          setReservationStatusFilter('ALL');
                        }}
                      >
                        Clear Filter
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Surface>

              <DataTable
                caption="ARVEN stock reservations"
                columns={reservationColumns}
                rows={reservations}
                getRowKey={(row) => row.id}
                tableBreakpoint="xl"
                isLoading={reservationsLoading}
                loadingLabel="Loading stock reservations"
                error={reservationsError?.message}
                errorRequestId={reservationsError?.requestId}
                onRetry={() => void loadReservations()}
                emptyTitle="No stock reservations found"
                emptyDescription="Order checkout stock reservations appear here once checkout holds are created."
              />

              {reservationsMeta.totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="font-mono text-xs tabular-nums text-ink-muted">
                    Page {reservationsMeta.page} of {reservationsMeta.totalPages} (
                    {reservationsMeta.total} reservations)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={reservationsMeta.page <= 1}
                      onClick={() => setReservationsPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={reservationsMeta.page >= reservationsMeta.totalPages}
                      onClick={() => setReservationsPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      {/* Record Stock Movement Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => {
          if (!submittingMovement) {
            setModalOpen(false);
          }
        }}
        title="Record Stock Movement"
        description="Appends an immutable inventory movement entry and atomically updates warehouse stock levels using a stable Idempotency-Key."
        size="md"
      >
        <form onSubmit={handleSubmitMovement} noValidate className="space-y-4">
          {modalError ? (
            <StatusBanner
              tone="danger"
              title="Movement rejected"
              description={modalError.message}
              requestId={modalError.requestId}
            />
          ) : null}

          <FormField
            id="movement-variant"
            label="Target SKU Variant"
            required
            error={modalFieldErrors.variantId}
          >
            <Select
              id="movement-variant"
              value={modalVariantId}
              onChange={(event) => {
                setModalVariantId(event.target.value);
                regenerateModalIdempotencyKey();
              }}
              invalid={Boolean(modalFieldErrors.variantId)}
              aria-describedby={modalFieldErrors.variantId ? 'movement-variant-error' : undefined}
            >
              {variantOptions.length === 0 ? (
                <option value="">No variants loaded</option>
              ) : (
                variantOptions.map((item) => (
                  <option key={item.variantId} value={item.variantId}>
                    {item.sku} ({item.productName}, {item.color} / {item.size}) - On hand:{' '}
                    {item.quantityOnHand}
                  </option>
                ))
              )}
            </Select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="movement-warehouse"
              label="Warehouse Code"
              required
              error={modalFieldErrors.warehouseCode}
            >
              <Input
                id="movement-warehouse"
                value={modalWarehouseCode}
                onChange={(event) => {
                  setModalWarehouseCode(event.target.value);
                  regenerateModalIdempotencyKey();
                }}
                invalid={Boolean(modalFieldErrors.warehouseCode)}
                aria-describedby={
                  modalFieldErrors.warehouseCode ? 'movement-warehouse-error' : undefined
                }
              />
            </FormField>

            <FormField
              id="movement-type"
              label="Movement Type"
              required
              error={modalFieldErrors.type}
            >
              <Select
                id="movement-type"
                value={modalType}
                onChange={(event) => {
                  const nextType = event.target.value as AdminManualMovementTypeInput;
                  setModalType(nextType);
                  if (nextType === 'RECEIPT' && modalDeltaRaw.trim().startsWith('-')) {
                    setModalDeltaRaw('10');
                  }
                  regenerateModalIdempotencyKey();
                }}
                invalid={Boolean(modalFieldErrors.type)}
                aria-describedby={modalFieldErrors.type ? 'movement-type-error' : undefined}
              >
                {allowedMovementTypes.includes('RECEIPT') ? (
                  <option value="RECEIPT">RECEIPT (Inbound Restock)</option>
                ) : null}
                {allowedMovementTypes.includes('ADJUSTMENT') ? (
                  <option value="ADJUSTMENT">ADJUSTMENT (Cycle Count / Correction)</option>
                ) : null}
              </Select>
            </FormField>
          </div>

          <FormField
            id="movement-delta"
            label={modalType === 'RECEIPT' ? 'Quantity Received (+)' : 'Quantity Delta (+ or -)'}
            required
            hint={
              modalType === 'RECEIPT'
                ? 'Must be a positive whole integer.'
                : 'Enter a positive or negative non-zero whole integer.'
            }
            error={modalFieldErrors.quantityDelta}
          >
            <Input
              id="movement-delta"
              type="number"
              step={1}
              value={modalDeltaRaw}
              onChange={(event) => {
                setModalDeltaRaw(event.target.value);
                regenerateModalIdempotencyKey();
              }}
              invalid={Boolean(modalFieldErrors.quantityDelta)}
              aria-describedby={
                modalFieldErrors.quantityDelta ? 'movement-delta-error' : 'movement-delta-hint'
              }
            />
          </FormField>

          {selectedLevelForModal ? (
            <Surface variant="subtle" border="hairline" padding="sm" className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-ink-muted">Current On Hand / Reserved</span>
                <span className="font-mono tabular-nums text-ink">
                  {selectedLevelForModal.quantityOnHand} on hand /{' '}
                  {selectedLevelForModal.quantityReserved} reserved
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold uppercase tracking-[0.06em] text-ink">
                  Projected On Hand
                </span>
                <span
                  className={cn(
                    'font-mono text-sm font-semibold tabular-nums',
                    projectedOnHand !== null &&
                      projectedOnHand < selectedLevelForModal.quantityReserved
                      ? 'text-danger-fg'
                      : 'text-ink',
                  )}
                >
                  {projectedOnHand !== null ? projectedOnHand : 'Invalid integer'}
                </span>
              </div>
              {projectedOnHand !== null &&
              projectedOnHand < selectedLevelForModal.quantityReserved ? (
                <p className="text-xs text-danger-fg">
                  Projected on-hand stock cannot fall below currently reserved quantity (
                  {selectedLevelForModal.quantityReserved}).
                </p>
              ) : null}
            </Surface>
          ) : null}

          <FormField
            id="movement-reason"
            label={modalType === 'ADJUSTMENT' ? 'Reason (Required)' : 'Reason (Optional)'}
            required={modalType === 'ADJUSTMENT'}
            hint={
              modalType === 'ADJUSTMENT'
                ? 'Minimum 3 characters required for audit accountability.'
                : 'Optional supplier delivery note or PO reference.'
            }
            error={modalFieldErrors.reason}
          >
            <Input
              id="movement-reason"
              value={modalReason}
              onChange={(event) => {
                setModalReason(event.target.value);
                regenerateModalIdempotencyKey();
              }}
              placeholder={
                modalType === 'RECEIPT'
                  ? 'Batch delivery from Bandung atelier'
                  : 'Cycle count variance reconciliation'
              }
              invalid={Boolean(modalFieldErrors.reason)}
              aria-describedby={
                modalFieldErrors.reason ? 'movement-reason-error' : 'movement-reason-hint'
              }
            />
          </FormField>

          <p className="font-mono text-xs text-ink-muted break-all">
            Idempotency-Key: <span className="text-ink">{modalIdempotencyKey}</span>
          </p>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={submittingMovement}
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={submittingMovement}
              loadingLabel="Recording movement"
            >
              Record Movement
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
