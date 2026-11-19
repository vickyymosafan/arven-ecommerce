'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  AdminProductSummaryDto,
  AdminShowroomHotspotDto,
  AdminShowroomZoneDto,
  LightingPresetInput,
  ShowroomZonePublicDto,
  ShowroomZoneStatusInput,
} from '@arven/contracts';
import {
  createShowroomHotspotRequestSchema,
  createShowroomZoneRequestSchema,
  updateShowroomZoneRequestSchema,
} from '@arven/validators';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
  StatusBanner,
  Surface,
  Textarea,
  formatWIB,
  useToast,
  type DataTableColumn,
} from '@arven/ui';
import { AdminForbiddenPanel } from '@/components/admin-forbidden-panel';
import { AdminShell } from '@/components/admin-shell';
import {
  AdminApiClientError,
  adminApi,
  extractAdminFieldErrors,
} from '@/lib/api-client';
import { getShowroomZoneStatusBadge } from '@/lib/ops-helpers';
import { SHOWROOM_POLICY } from '@/lib/permissions';
import { useAdminSession } from '@/lib/use-admin-session';

const DynamicAdminShowroomExperience = dynamic(
  () => import('@arven/three-engine/showroom').then((m) => m.ShowroomExperience),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-[16/9] w-full items-center justify-center border border-control-border bg-[#17191B] p-6 text-center text-[#F8F7F3]">
        <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
          Loading 3D Showroom Zone Preview...
        </p>
      </div>
    ),
  },
);

const LIGHTING_PRESET_OPTIONS: readonly LightingPresetInput[] = [
  'arven_studio_neutral_v1',
  'arven_warm_editorial_v1',
];

function toPublicZonePreviewDto(zone: AdminShowroomZoneDto): ShowroomZonePublicDto {
  return {
    id: zone.id,
    code: zone.code,
    title: zone.title,
    description: zone.description,
    sortOrder: zone.sortOrder,
    sceneUrl: zone.sceneUrl,
    liteSceneUrl: zone.liteSceneUrl,
    posterUrl: zone.posterUrl,
    sceneBytes: zone.sceneBytes,
    liteSceneBytes: zone.liteSceneBytes,
    cameraBaseline: zone.cameraBaseline,
    portals: zone.portals,
    lightingPreset:
      (zone.config['lightingPreset'] as LightingPresetInput | undefined) ??
      'arven_studio_neutral_v1',
    hotspots: zone.hotspots
      .filter((h) => h.isActive)
      .map((h) => ({
        id: h.id,
        zoneId: h.zoneId,
        productId: h.productId,
        productSlug: h.productSlug,
        productName: h.productName,
        variantId: h.variantId,
        label: h.label,
        fromPriceIdr: 0,
        primaryImageUrl: null,
        primaryImageAlt: h.productName,
        has3dEnabled: true,
        position: [h.positionX, h.positionY, h.positionZ],
        sortOrder: h.sortOrder,
      })),
  };
}

export function AdminShowroomView() {
  const { toast } = useToast();
  const {
    user,
    loading: sessionLoading,
    error: sessionError,
    canAccess,
    reload: reloadSession,
  } = useAdminSession();

  const canRead = canAccess(['asset.read', 'asset.publish']);
  const canPublish = canAccess(['asset.publish']);

  const [zones, setZones] = useState<AdminShowroomZoneDto[]>([]);
  const [products, setProducts] = useState<AdminProductSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [previewZone, setPreviewZone] = useState<AdminShowroomZoneDto | null>(null);

  // Zone Create/Edit Modal
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<AdminShowroomZoneDto | null>(null);
  const [zoneCode, setZoneCode] = useState('');
  const [zoneTitle, setZoneTitle] = useState('');
  const [zoneDescription, setZoneDescription] = useState('');
  const [zoneSortOrder, setZoneSortOrder] = useState('0');
  const [zoneLightingPreset, setZoneLightingPreset] = useState<LightingPresetInput>(
    'arven_studio_neutral_v1',
  );
  const [zonePortalTargetCode, setZonePortalTargetCode] = useState('');
  const [zonePortalLabel, setZonePortalLabel] = useState('');
  const [zoneModalError, setZoneModalError] = useState<string | null>(null);
  const [zoneFieldErrors, setZoneFieldErrors] = useState<Record<string, string>>({});
  const [savingZone, setSavingZone] = useState(false);
  const [transitioningZoneId, setTransitioningZoneId] = useState<string | null>(null);

  // Hotspot Form State
  const [hotspotProductId, setHotspotProductId] = useState('');
  const [hotspotLabel, setHotspotLabel] = useState('');
  const [hotspotPosX, setHotspotPosX] = useState('0');
  const [hotspotPosY, setHotspotPosY] = useState('1.1');
  const [hotspotPosZ, setHotspotPosZ] = useState('0');
  const [hotspotSortOrder, setHotspotSortOrder] = useState('0');
  const [hotspotError, setHotspotError] = useState<string | null>(null);
  const [savingHotspot, setSavingHotspot] = useState(false);
  const [busyHotspotId, setBusyHotspotId] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadData = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (sessionLoading || !user || !canRead) {
      return;
    }
    let active = true;
    Promise.all([
      adminApi.listShowroomZones(),
      adminApi.listProducts({ page: 1, limit: 50 }).catch(() => ({
        items: [] as AdminProductSummaryDto[],
        meta: { requestId: '', page: 1, limit: 50, total: 0, totalPages: 1 },
      })),
    ])
      .then(([zoneList, productPage]) => {
        if (!active) return;
        setZones(zoneList);
        setProducts(productPage.items);
        setLoadError(null);
        setSelectedZoneId((current) => {
          if (current && zoneList.some((z) => z.id === current)) {
            return current;
          }
          return zoneList[0]?.id ?? null;
        });
        setHotspotProductId((current) => current || (productPage.items[0]?.id ?? ''));
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load Virtual Showroom zones.' });
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
  }, [canRead, reloadNonce, sessionLoading, user]);

  const selectedZone = useMemo(() => {
    if (zones.length === 0) return null;
    return zones.find((z) => z.id === selectedZoneId) ?? zones[0] ?? null;
  }, [selectedZoneId, zones]);

  const openCreateZoneModal = () => {
    setEditingZone(null);
    setZoneCode('');
    setZoneTitle('');
    setZoneDescription('');
    setZoneSortOrder(String(zones.length));
    setZoneLightingPreset('arven_studio_neutral_v1');
    setZonePortalTargetCode('');
    setZonePortalLabel('');
    setZoneModalError(null);
    setZoneFieldErrors({});
    setZoneModalOpen(true);
  };

  const openEditZoneModal = (zone: AdminShowroomZoneDto) => {
    setEditingZone(zone);
    setZoneCode(zone.code);
    setZoneTitle(zone.title);
    setZoneDescription(zone.description ?? '');
    setZoneSortOrder(String(zone.sortOrder));
    setZoneLightingPreset(
      ((zone.config['lightingPreset'] as LightingPresetInput | undefined) ??
        'arven_studio_neutral_v1'),
    );
    const firstPortal = zone.portals[0];
    setZonePortalTargetCode(firstPortal?.targetZoneCode ?? '');
    setZonePortalLabel(firstPortal?.label ?? '');
    setZoneModalError(null);
    setZoneFieldErrors({});
    setZoneModalOpen(true);
  };

  const handleSaveZone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setZoneModalError(null);
    setZoneFieldErrors({});

    const parsedSort = Number.parseInt(zoneSortOrder, 10);
    const portals =
      zonePortalTargetCode.trim() && zonePortalLabel.trim()
        ? [
            {
              targetZoneCode: zonePortalTargetCode.trim().toLowerCase(),
              label: zonePortalLabel.trim(),
              position: [2.2, 0, -2.5] as [number, number, number],
            },
          ]
        : [];

    if (editingZone) {
      const payload = {
        title: zoneTitle.trim(),
        description: zoneDescription.trim() ? zoneDescription.trim() : null,
        sortOrder: Number.isNaN(parsedSort) ? 0 : parsedSort,
        lightingPreset: zoneLightingPreset,
        portals,
      };
      const parsed = updateShowroomZoneRequestSchema.safeParse(payload);
      if (!parsed.success) {
        setZoneModalError(
          parsed.error.issues[0]?.message ?? 'Invalid showroom zone fields.',
        );
        return;
      }

      setSavingZone(true);
      try {
        const updated = await adminApi.updateShowroomZone(editingZone.id, parsed.data);
        setZones((prev) => prev.map((z) => (z.id === updated.id ? updated : z)));
        setZoneModalOpen(false);
        toast({
          tone: 'success',
          title: 'Showroom zone updated',
          description: `${updated.title} (${updated.code}) saved.`,
        });
      } catch (err) {
        if (err instanceof AdminApiClientError) {
          setZoneFieldErrors(extractAdminFieldErrors(err));
          setZoneModalError(err.message);
        } else {
          setZoneModalError('Unable to update showroom zone.');
        }
      } finally {
        setSavingZone(false);
      }
    } else {
      const payload = {
        code: zoneCode.trim().toLowerCase(),
        title: zoneTitle.trim(),
        description: zoneDescription.trim() ? zoneDescription.trim() : null,
        sortOrder: Number.isNaN(parsedSort) ? 0 : parsedSort,
        lightingPreset: zoneLightingPreset,
        portals,
      };
      const parsed = createShowroomZoneRequestSchema.safeParse(payload);
      if (!parsed.success) {
        setZoneModalError(
          parsed.error.issues[0]?.message ?? 'Invalid showroom zone fields.',
        );
        return;
      }

      setSavingZone(true);
      try {
        const created = await adminApi.createShowroomZone(parsed.data);
        setZones((prev) => [...prev, created]);
        setSelectedZoneId(created.id);
        setZoneModalOpen(false);
        toast({
          tone: 'success',
          title: 'Showroom zone created',
          description: `Generated architectural GLB for ${created.title} (${created.code}).`,
        });
      } catch (err) {
        if (err instanceof AdminApiClientError) {
          setZoneFieldErrors(extractAdminFieldErrors(err));
          setZoneModalError(err.message);
        } else {
          setZoneModalError('Unable to create showroom zone.');
        }
      } finally {
        setSavingZone(false);
      }
    }
  };

  const handleTransitionZone = useCallback(
    async (zone: AdminShowroomZoneDto, targetStatus: ShowroomZoneStatusInput) => {
      setTransitioningZoneId(zone.id);
      try {
        const updated = await adminApi.transitionShowroomZone(zone.id, {
          targetStatus,
        });
        setZones((prev) => prev.map((z) => (z.id === updated.id ? updated : z)));
        toast({
          tone: 'success',
          title: `Zone ${updated.code} -> ${updated.status}`,
          description: 'Showroom zone lifecycle state updated.',
        });
      } catch (err) {
        toast({
          tone: 'danger',
          title: 'Zone state transition failed',
          description:
            err instanceof AdminApiClientError
              ? err.message
              : 'Unable to transition showroom zone status.',
        });
      } finally {
        setTransitioningZoneId(null);
      }
    },
    [toast],
  );

  const handleCreateHotspot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedZone) return;
    setHotspotError(null);

    const parsed = createShowroomHotspotRequestSchema.safeParse({
      productId: hotspotProductId.trim(),
      label: hotspotLabel.trim(),
      positionX: Number.parseFloat(hotspotPosX),
      positionY: Number.parseFloat(hotspotPosY),
      positionZ: Number.parseFloat(hotspotPosZ),
      sortOrder: Number.parseInt(hotspotSortOrder, 10) || 0,
      isActive: true,
    });

    if (!parsed.success) {
      setHotspotError(
        parsed.error.issues[0]?.message ?? 'Invalid hotspot coordinates or product selection.',
      );
      return;
    }

    setSavingHotspot(true);
    try {
      const created = await adminApi.createShowroomHotspot(selectedZone.id, parsed.data);
      setZones((prev) =>
        prev.map((z) =>
          z.id === selectedZone.id
            ? { ...z, hotspots: [...z.hotspots, created] }
            : z,
        ),
      );
      setHotspotLabel('');
      toast({
        tone: 'success',
        title: 'Hotspot added',
        description: `${created.label} attached to ${selectedZone.title}.`,
      });
    } catch (err) {
      setHotspotError(
        err instanceof AdminApiClientError ? err.message : 'Unable to create product hotspot.',
      );
    } finally {
      setSavingHotspot(false);
    }
  };

  const handleToggleHotspotActive = async (hotspot: AdminShowroomHotspotDto) => {
    if (!selectedZone) return;
    setBusyHotspotId(hotspot.id);
    setHotspotError(null);
    try {
      const updated = await adminApi.updateShowroomHotspot(hotspot.id, {
        isActive: !hotspot.isActive,
      });
      setZones((prev) =>
        prev.map((z) =>
          z.id === selectedZone.id
            ? {
                ...z,
                hotspots: z.hotspots.map((h) => (h.id === updated.id ? updated : h)),
              }
            : z,
        ),
      );
      toast({
        tone: 'success',
        title: updated.isActive ? 'Hotspot activated' : 'Hotspot paused',
        description: updated.label,
      });
    } catch (err) {
      setHotspotError(
        err instanceof AdminApiClientError ? err.message : 'Unable to update hotspot state.',
      );
    } finally {
      setBusyHotspotId(null);
    }
  };

  const handleDeleteHotspot = async (hotspot: AdminShowroomHotspotDto) => {
    if (!selectedZone) return;
    setBusyHotspotId(hotspot.id);
    setHotspotError(null);
    try {
      await adminApi.deleteShowroomHotspot(hotspot.id);
      setZones((prev) =>
        prev.map((z) =>
          z.id === selectedZone.id
            ? {
                ...z,
                hotspots: z.hotspots.filter((h) => h.id !== hotspot.id),
              }
            : z,
        ),
      );
      toast({
        tone: 'success',
        title: 'Hotspot deleted',
        description: hotspot.label,
      });
    } catch (err) {
      setHotspotError(
        err instanceof AdminApiClientError ? err.message : 'Unable to delete hotspot.',
      );
    } finally {
      setBusyHotspotId(null);
    }
  };

  const zoneColumns = useMemo<DataTableColumn<AdminShowroomZoneDto>[]>(
    () => [
      {
        key: 'code',
        header: 'Zone Code',
        render: (row) => (
          <div className="space-y-0.5">
            <span className="font-mono text-xs font-semibold text-ink">{row.code}</span>
            <p className="text-sm font-medium text-ink">{row.title}</p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => {
          const badge = getShowroomZoneStatusBadge(row.status);
          return <Badge tone={badge.tone}>{badge.label}</Badge>;
        },
      },
      {
        key: 'payload',
        header: 'GLB Payload',
        render: (row) => (
          <div className="space-y-0.5 font-mono text-xs tabular-nums text-ink-muted">
            <p>Default: {(row.sceneBytes / 1024).toFixed(1)} KB</p>
            {row.liteSceneBytes ? (
              <p>Lite: {(row.liteSceneBytes / 1024).toFixed(1)} KB</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'hotspots',
        header: 'Hotspots',
        render: (row) => (
          <span className="font-mono text-xs tabular-nums text-ink">
            {row.hotspots.filter((h) => h.isActive).length} active / {row.hotspots.length} total
          </span>
        ),
      },
      {
        key: 'publishedAt',
        header: 'Published (WIB)',
        render: (row) => (
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {formatWIB(row.publishedAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (row) => {
          const isSelected = selectedZone?.id === row.id;
          const isTransitioning = transitioningZoneId === row.id;

          return (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant={isSelected ? 'primary' : 'secondary'}
                size="sm"
                className="min-h-11"
                onClick={() => setSelectedZoneId(row.id)}
              >
                {isSelected ? 'Inspecting Hotspots' : 'Inspect Hotspots'}
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                onClick={() => setPreviewZone(row)}
              >
                Preview 3D Zone
              </Button>

              {canPublish ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-11"
                    onClick={() => openEditZoneModal(row)}
                  >
                    Edit Zone
                  </Button>

                  {row.status === 'DRAFT' ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="min-h-11"
                      isLoading={isTransitioning}
                      onClick={() => void handleTransitionZone(row, 'PUBLISHED')}
                    >
                      Publish Zone
                    </Button>
                  ) : null}

                  {row.status === 'PUBLISHED' ? (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      className="min-h-11"
                      isLoading={isTransitioning}
                      onClick={() => void handleTransitionZone(row, 'ARCHIVED')}
                    >
                      Archive Zone
                    </Button>
                  ) : null}

                  {row.status === 'ARCHIVED' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      isLoading={isTransitioning}
                      onClick={() => void handleTransitionZone(row, 'DRAFT')}
                    >
                      Restore to Draft
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canPublish, handleTransitionZone, selectedZone?.id, transitioningZoneId],
  );

  return (
    <AdminShell
      title="Virtual Showroom Management"
      description="Manage architectural gallery zones, deterministic baked-lighting GLB payloads, lifecycle status transitions, and 3D product hotspots."
      user={user}
      actions={
        canPublish ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            className="min-h-11"
            onClick={openCreateZoneModal}
          >
            Create Showroom Zone
          </Button>
        ) : undefined
      }
    >
      {sessionLoading ? (
        <LoadingState label="Verifying staff session and permissions" rows={5} />
      ) : sessionError ? (
        <ErrorState
          title="Session verification failed"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reloadSession()}
        />
      ) : !canRead ? (
        <AdminForbiddenPanel
          description="Your assigned role does not include asset.read or asset.publish permissions for Virtual Showroom operations."
        />
      ) : loading ? (
        <LoadingState label="Loading Virtual Showroom zones and hotspots" rows={5} />
      ) : loadError ? (
        <ErrorState
          title="Unable to load Virtual Showroom zones"
          message={loadError.message}
          requestId={loadError.requestId}
          onRetry={() => void loadData()}
        />
      ) : (
        <div className="space-y-8">
          {!canPublish ? (
            <StatusBanner
              tone="info"
              title="Read-Only Access Mode"
              description="Your role has asset.read access. Creating zones, transitioning statuses, and mutating hotspots require asset.publish permission."
            />
          ) : null}

          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-normal text-ink">
                  Architectural Gallery Zones
                </h2>
                <p className="font-mono text-xs tabular-nums text-ink-muted">
                  Budget cap: {(SHOWROOM_POLICY.MAX_ZONE_BYTES / (1024 * 1024)).toFixed(1)} MB default /{' '}
                  {(SHOWROOM_POLICY.MAX_LITE_ZONE_BYTES / (1024 * 1024)).toFixed(1)} MB lite / Max{' '}
                  {SHOWROOM_POLICY.MAX_RESIDENT_ZONES} resident zones
                </p>
              </div>
              <Badge tone="neutral">
                <span className="font-mono tabular-nums">{zones.length} zones</span>
              </Badge>
            </div>

            {zones.length === 0 ? (
              <EmptyState
                title="No showroom zones configured"
                description="Create a showroom zone to generate deterministic gallery GLB geometry and attach product hotspots."
              />
            ) : (
              <DataTable
                columns={zoneColumns}
                rows={zones}
                getRowKey={(row) => row.id}
                caption="Virtual Showroom zones directory"
              />
            )}
          </Surface>

          {/* Hotspot Inspector for Selected Zone */}
          {selectedZone ? (
            <Surface variant="elevated" border="hairline" padding="lg" className="space-y-6">
              <div className="flex flex-col gap-2 border-b border-hairline pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-normal text-ink">
                      Hotspots: {selectedZone.title}
                    </h2>
                    <Badge tone="info">{selectedZone.code}</Badge>
                  </div>
                  <p className="text-xs text-ink-muted">
                    Product markers inside this zone resolve live IDR prices from product variants on every public query.
                  </p>
                </div>
                <span className="font-mono text-xs tabular-nums text-ink-muted">
                  {selectedZone.hotspots.length} hotspot(s)
                </span>
              </div>

              {hotspotError ? (
                <StatusBanner
                  tone="danger"
                  title="Hotspot Operation Error"
                  description={hotspotError}
                />
              ) : null}

              {selectedZone.hotspots.length === 0 ? (
                <EmptyState
                  title="No hotspots in this zone"
                  description="Attach published catalog products to 3D coordinates inside this gallery zone."
                />
              ) : (
                <div className="space-y-2.5">
                  {selectedZone.hotspots.map((hotspot) => (
                    <div
                      key={hotspot.id}
                      className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{hotspot.label}</span>
                          <Badge tone={hotspot.isActive ? 'success' : 'neutral'}>
                            {hotspot.isActive ? 'ACTIVE' : 'PAUSED'}
                          </Badge>
                          <Badge tone="neutral">{hotspot.productStatus}</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-ink-muted">
                          <span>Product: {hotspot.productName} ({hotspot.productSlug})</span>
                          <span>
                            XYZ: [{hotspot.positionX.toFixed(2)}, {hotspot.positionY.toFixed(2)},{' '}
                            {hotspot.positionZ.toFixed(2)}]
                          </span>
                          <span>Sort: {hotspot.sortOrder}</span>
                        </div>
                      </div>

                      {canPublish ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="min-h-11"
                            isLoading={busyHotspotId === hotspot.id}
                            onClick={() => void handleToggleHotspotActive(hotspot)}
                          >
                            {hotspot.isActive ? 'Pause Hotspot' : 'Activate Hotspot'}
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            className="min-h-11"
                            isLoading={busyHotspotId === hotspot.id}
                            onClick={() => void handleDeleteHotspot(hotspot)}
                          >
                            Delete Hotspot
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {canPublish ? (
                <form
                  onSubmit={handleCreateHotspot}
                  className="space-y-4 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                    Add Product Hotspot to {selectedZone.title}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FormField id="hotspot-product" label="Catalog Product" required>
                      {products.length > 0 ? (
                        <Select
                          id="hotspot-product"
                          value={hotspotProductId}
                          onChange={(e) => setHotspotProductId(e.target.value)}
                        >
                          {products.map((prod) => (
                            <option key={prod.id} value={prod.id}>
                              {prod.name} ({prod.slug})
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          id="hotspot-product"
                          value={hotspotProductId}
                          onChange={(e) => setHotspotProductId(e.target.value)}
                          placeholder="Product UUID"
                        />
                      )}
                    </FormField>

                    <FormField id="hotspot-label" label="Hotspot Label" required>
                      <Input
                        id="hotspot-label"
                        value={hotspotLabel}
                        onChange={(e) => setHotspotLabel(e.target.value)}
                        placeholder="Heavyweight Crew Tee Plinth"
                      />
                    </FormField>

                    <FormField id="hotspot-sort-order" label="Sort Order">
                      <Input
                        id="hotspot-sort-order"
                        type="number"
                        min={0}
                        max={1000}
                        value={hotspotSortOrder}
                        onChange={(e) => setHotspotSortOrder(e.target.value)}
                      />
                    </FormField>

                    <FormField id="hotspot-pos-x" label="Position X (-50..50 m)" required>
                      <Input
                        id="hotspot-pos-x"
                        type="number"
                        step="0.1"
                        value={hotspotPosX}
                        onChange={(e) => setHotspotPosX(e.target.value)}
                      />
                    </FormField>

                    <FormField id="hotspot-pos-y" label="Position Y (0..10 m)" required>
                      <Input
                        id="hotspot-pos-y"
                        type="number"
                        step="0.1"
                        value={hotspotPosY}
                        onChange={(e) => setHotspotPosY(e.target.value)}
                      />
                    </FormField>

                    <FormField id="hotspot-pos-z" label="Position Z (-50..50 m)" required>
                      <Input
                        id="hotspot-pos-z"
                        type="number"
                        step="0.1"
                        value={hotspotPosZ}
                        onChange={(e) => setHotspotPosZ(e.target.value)}
                      />
                    </FormField>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="min-h-11"
                      isLoading={savingHotspot}
                      loadingLabel="Adding Hotspot"
                    >
                      Add Hotspot
                    </Button>
                  </div>
                </form>
              ) : null}
            </Surface>
          ) : null}
        </div>
      )}

      {/* Create / Edit Showroom Zone Modal */}
      <Modal
        isOpen={zoneModalOpen}
        onClose={() => setZoneModalOpen(false)}
        title={editingZone ? `Edit Zone: ${editingZone.code}` : 'Create Showroom Zone'}
        description="Showroom zones use deterministic server-generated architectural GLB models with baked vertex-color lighting."
        size="lg"
      >
        <form onSubmit={handleSaveZone} className="space-y-4">
          {zoneModalError ? (
            <StatusBanner tone="danger" title="Validation Error" description={zoneModalError} />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="zone-code"
              label="Zone Code (Slug)"
              required
              error={zoneFieldErrors['code']}
            >
              <Input
                id="zone-code"
                value={zoneCode}
                disabled={Boolean(editingZone)}
                onChange={(e) => setZoneCode(e.target.value)}
                placeholder="atrium-entrance"
              />
            </FormField>

            <FormField
              id="zone-title"
              label="Zone Title"
              required
              error={zoneFieldErrors['title']}
            >
              <Input
                id="zone-title"
                value={zoneTitle}
                onChange={(e) => setZoneTitle(e.target.value)}
                placeholder="Atrium"
              />
            </FormField>

            <FormField id="zone-sort-order" label="Sort Order">
              <Input
                id="zone-sort-order"
                type="number"
                min={0}
                max={1000}
                value={zoneSortOrder}
                onChange={(e) => setZoneSortOrder(e.target.value)}
              />
            </FormField>

            <FormField id="zone-lighting-preset" label="Lighting Preset">
              <Select
                id="zone-lighting-preset"
                value={zoneLightingPreset}
                onChange={(e) => setZoneLightingPreset(e.target.value as LightingPresetInput)}
              >
                {LIGHTING_PRESET_OPTIONS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="zone-portal-target" label="Primary Portal Target Zone Code">
              <Input
                id="zone-portal-target"
                value={zonePortalTargetCode}
                onChange={(e) => setZonePortalTargetCode(e.target.value)}
                placeholder="tailoring-gallery"
              />
            </FormField>

            <FormField id="zone-portal-label" label="Primary Portal Label">
              <Input
                id="zone-portal-label"
                value={zonePortalLabel}
                onChange={(e) => setZonePortalLabel(e.target.value)}
                placeholder="Galeri Tailoring"
              />
            </FormField>
          </div>

          <FormField id="zone-description" label="Editorial Description">
            <Textarea
              id="zone-description"
              rows={3}
              value={zoneDescription}
              onChange={(e) => setZoneDescription(e.target.value)}
              placeholder="Architectural concrete plinths with natural skylight ambience."
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="min-h-11"
              onClick={() => setZoneModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="min-h-11"
              isLoading={savingZone}
              loadingLabel="Saving Zone"
            >
              {editingZone ? 'Save Zone Changes' : 'Generate & Create Zone'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 3D Preview Modal */}
      <Modal
        isOpen={Boolean(previewZone)}
        onClose={() => setPreviewZone(null)}
        title={previewZone ? `3D Zone Preview: ${previewZone.title}` : '3D Zone Preview'}
        description="Inspect baked vertex-color lighting, camera baseline, and active product hotspot placement."
        size="lg"
      >
        {previewZone ? (
          <div className="space-y-4">
            <div className="aspect-[16/9] w-full overflow-hidden border border-control-border bg-[#17191B]">
              <DynamicAdminShowroomExperience
                zones={[toPublicZonePreviewDto(previewZone)]}
                activeZoneCode={previewZone.code}
                interactionEnabled
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs tabular-nums text-ink-muted">
              <span>Code: {previewZone.code}</span>
              <span>Payload: {(previewZone.sceneBytes / 1024).toFixed(1)} KB</span>
              <span>Hotspots: {previewZone.hotspots.filter((h) => h.isActive).length}</span>
            </div>
          </div>
        ) : null}
      </Modal>
    </AdminShell>
  );
}
