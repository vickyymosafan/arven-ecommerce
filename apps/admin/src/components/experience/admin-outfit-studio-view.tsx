'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  AdminOutfitGarmentDiagnosticDto,
  OutfitAnchorInput,
  OutfitSceneDto,
  OutfitSlotInput,
  OutfitStudioCatalogDto,
} from '@arven/contracts';
import type { OutfitSlotRenderItem } from '@arven/three-engine/outfit-studio';
import {
  createPublicOutfitPresetRequestSchema,
  setAssetOutfitCompatibilityRequestSchema,
  updatePublicOutfitPresetRequestSchema,
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
  formatIDR,
  formatWIB,
  useToast,
  type DataTableColumn,
} from '@arven/ui';
import { AdminForbiddenPanel } from '@/components/admin-forbidden-panel';
import { AdminShell } from '@/components/admin-shell';
import { AdminApiClientError, adminApi } from '@/lib/api-client';
import {
  OUTFIT_ANCHORS,
  OUTFIT_SLOTS,
  OUTFIT_STUDIO_POLICY,
} from '@/lib/permissions';
import { useAdminSession } from '@/lib/use-admin-session';

const DynamicAdminOutfitStudioExperience = dynamic(
  () =>
    import('@arven/three-engine/outfit-studio').then(
      (m) => m.OutfitStudioExperience,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-[3/4] w-full items-center justify-center border border-control-border bg-[#17191B] p-6 text-center text-[#F8F7F3]">
        <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
          Loading 3D Outfit Studio Mannequin Preview...
        </p>
      </div>
    ),
  },
);

export function AdminOutfitStudioView() {
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

  const [garments, setGarments] = useState<AdminOutfitGarmentDiagnosticDto[]>([]);
  const [presets, setPresets] = useState<OutfitSceneDto[]>([]);
  const [catalog, setCatalog] = useState<OutfitStudioCatalogDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);

  // Compatibility Editor Modal State
  const [editingGarment, setEditingGarment] =
    useState<AdminOutfitGarmentDiagnosticDto | null>(null);
  const [compatRigId, setCompatRigId] = useState<string>(OUTFIT_STUDIO_POLICY.RIG_ID);
  const [compatSkeletonVersion, setCompatSkeletonVersion] = useState<string>(
    OUTFIT_STUDIO_POLICY.SKELETON_VERSION,
  );
  const [compatSlot, setCompatSlot] = useState<OutfitSlotInput>('top');
  const [compatAnchor, setCompatAnchor] = useState<OutfitAnchorInput>('spine_upper');
  const [compatIncompatibleSlots, setCompatIncompatibleSlots] = useState<
    OutfitSlotInput[]
  >([]);
  const [compatError, setCompatError] = useState<string | null>(null);
  const [savingCompat, setSavingCompat] = useState(false);
  const [removingAssetId, setRemovingAssetId] = useState<string | null>(null);

  // Public Preset Modal State
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<OutfitSceneDto | null>(null);
  const [presetTitle, setPresetTitle] = useState('');
  const [presetSlotVariants, setPresetSlotVariants] = useState<
    Partial<Record<OutfitSlotInput, string>>
  >({});
  const [presetError, setPresetError] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);

  // 3D Mannequin Preview Modal State
  const [previewPreset, setPreviewPreset] = useState<OutfitSceneDto | null>(null);
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
      adminApi.listOutfitStudioGarments(),
      adminApi.listOutfitStudioPresets(),
      adminApi.getPublicOutfitStudioCatalog().catch(() => null),
    ])
      .then(([garmentList, presetList, publicCatalog]) => {
        if (!active) return;
        setGarments(garmentList);
        setPresets(presetList);
        setCatalog(publicCatalog);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({
            message: 'Unable to load Outfit Studio compatibility diagnostics and presets.',
          });
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

  const openCompatibilityEditor = useCallback((garment: AdminOutfitGarmentDiagnosticDto) => {
    setEditingGarment(garment);
    setCompatRigId(garment.compatibility?.rigId ?? OUTFIT_STUDIO_POLICY.RIG_ID);
    setCompatSkeletonVersion(
      garment.compatibility?.skeletonVersion ?? OUTFIT_STUDIO_POLICY.SKELETON_VERSION,
    );
    const defaultSlot = garment.compatibility?.slot ?? 'top';
    setCompatSlot(defaultSlot);
    setCompatAnchor(
      garment.compatibility?.anchor ??
        (OUTFIT_STUDIO_POLICY.ANCHORS[defaultSlot][0] as OutfitAnchorInput),
    );
    setCompatIncompatibleSlots(garment.compatibility?.incompatibleSlots ?? []);
    setCompatError(null);
  }, []);

  const handleToggleIncompatibleSlot = (slot: OutfitSlotInput) => {
    setCompatIncompatibleSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  };

  const handleSaveCompatibility = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingGarment) return;
    setCompatError(null);

    const parsed = setAssetOutfitCompatibilityRequestSchema.safeParse({
      rigId: compatRigId.trim(),
      skeletonVersion: compatSkeletonVersion.trim(),
      slot: compatSlot,
      anchor: compatAnchor,
      incompatibleSlots: compatIncompatibleSlots.filter((s) => s !== compatSlot),
    });

    if (!parsed.success) {
      setCompatError(
        parsed.error.issues[0]?.message ?? 'Invalid outfit compatibility fields.',
      );
      return;
    }

    setSavingCompat(true);
    try {
      const updated = await adminApi.setAssetOutfitCompatibility(
        editingGarment.assetId,
        parsed.data,
      );
      setGarments((prev) =>
        prev.map((item) => (item.assetId === updated.assetId ? updated : item)),
      );
      setEditingGarment(null);
      toast({
        tone: 'success',
        title: 'Outfit compatibility updated',
        description: `${updated.productName} bound to ${parsed.data.slot} (${parsed.data.anchor}).`,
      });
    } catch (err) {
      setCompatError(
        err instanceof AdminApiClientError
          ? err.message
          : 'Unable to update garment outfit compatibility.',
      );
    } finally {
      setSavingCompat(false);
    }
  };

  const handleRemoveCompatibility = useCallback(async (garment: AdminOutfitGarmentDiagnosticDto) => {
    setRemovingAssetId(garment.assetId);
    try {
      await adminApi.removeAssetOutfitCompatibility(garment.assetId);
      setGarments((prev) =>
        prev.map((item) =>
          item.assetId === garment.assetId
            ? {
                ...item,
                compatibility: null,
                compatibleWithCurrentRig: false,
                diagnosticMessage: 'No outfitCompatibility configured on this 3D asset.',
              }
            : item,
        ),
      );
      toast({
        tone: 'success',
        title: 'Outfit compatibility removed',
        description: `${garment.productName} excluded from Outfit Studio catalog.`,
      });
    } catch (err) {
      toast({
        tone: 'danger',
        title: 'Failed to remove compatibility',
        description:
          err instanceof AdminApiClientError
            ? err.message
            : 'Unable to remove outfit compatibility.',
      });
    } finally {
      setRemovingAssetId(null);
    }
  }, [toast]);

  const openCreatePresetModal = () => {
    setEditingPreset(null);
    setPresetTitle('');
    const initialSlots: Partial<Record<OutfitSlotInput, string>> = {};
    if (catalog) {
      const topGarment = catalog.garments.find((g) => g.compatibility.slot === 'top');
      const bottomGarment = catalog.garments.find(
        (g) => g.compatibility.slot === 'bottom',
      );
      if (topGarment?.variants[0]) {
        initialSlots.top = topGarment.variants[0].id;
      }
      if (bottomGarment?.variants[0]) {
        initialSlots.bottom = bottomGarment.variants[0].id;
      }
    }
    setPresetSlotVariants(initialSlots);
    setPresetError(null);
    setPresetModalOpen(true);
  };

  const openEditPresetModal = (preset: OutfitSceneDto) => {
    setEditingPreset(preset);
    setPresetTitle(preset.title);
    const map: Partial<Record<OutfitSlotInput, string>> = {};
    for (const item of preset.slots) {
      map[item.slot] = item.variantId;
    }
    setPresetSlotVariants(map);
    setPresetError(null);
    setPresetModalOpen(true);
  };

  const handleSavePreset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPresetError(null);

    const slotsPayload: Array<{
      slot: OutfitSlotInput;
      productId?: string;
      variantId: string;
      assetId?: string;
      presetId?: string | null;
    }> = [];

    for (const slot of OUTFIT_SLOTS) {
      const variantId = presetSlotVariants[slot]?.trim();
      if (!variantId) continue;
      const matchedGarment = catalog?.garments.find((g) =>
        g.variants.some((v) => v.id === variantId),
      );
      slotsPayload.push({
        slot,
        ...(matchedGarment
          ? {
              productId: matchedGarment.productId,
              assetId: matchedGarment.assetId,
            }
          : {}),
        variantId,
        presetId: null,
      });
    }

    const rawPayload = {
      title: presetTitle.trim(),
      rigId: OUTFIT_STUDIO_POLICY.RIG_ID,
      slots: slotsPayload,
    };

    const schema = editingPreset
      ? updatePublicOutfitPresetRequestSchema
      : createPublicOutfitPresetRequestSchema;
    const parsed = schema.safeParse(rawPayload);

    if (!parsed.success) {
      setPresetError(
        parsed.error.issues[0]?.message ??
          'Select at least one compatible slot and provide a preset title.',
      );
      return;
    }

    setSavingPreset(true);
    try {
      if (editingPreset) {
        const updated = await adminApi.updateOutfitStudioPreset(
          editingPreset.id,
          rawPayload,
        );
        setPresets((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)),
        );
        toast({
          tone: 'success',
          title: 'Public preset updated',
          description: updated.title,
        });
      } else {
        const created = await adminApi.createOutfitStudioPreset(rawPayload);
        setPresets((prev) => [created, ...prev]);
        toast({
          tone: 'success',
          title: 'Public preset created',
          description: created.title,
        });
      }
      setPresetModalOpen(false);
    } catch (err) {
      setPresetError(
        err instanceof AdminApiClientError
          ? err.message
          : 'Unable to save public outfit preset.',
      );
    } finally {
      setSavingPreset(false);
    }
  };

  const handleDeletePreset = async (preset: OutfitSceneDto) => {
    setDeletingPresetId(preset.id);
    try {
      await adminApi.deleteOutfitStudioPreset(preset.id);
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
      toast({
        tone: 'success',
        title: 'Public preset deleted',
        description: preset.title,
      });
    } catch (err) {
      toast({
        tone: 'danger',
        title: 'Failed to delete preset',
        description:
          err instanceof AdminApiClientError
            ? err.message
            : 'Unable to delete public outfit preset.',
      });
    } finally {
      setDeletingPresetId(null);
    }
  };

  const previewRenderSlots = useMemo(() => {
    const map: Partial<Record<OutfitSlotInput, OutfitSlotRenderItem>> = {};
    if (!previewPreset) return map;
    for (const slotItem of previewPreset.slots) {
      const matchedGarment = catalog?.garments.find(
        (g) => g.productId === slotItem.productId,
      );
      map[slotItem.slot] = {
        slot: slotItem.slot,
        productId: slotItem.productId,
        variantId: slotItem.variantId,
        assetId: slotItem.assetId,
        modelUrl:
          matchedGarment?.modelUrl ??
          `/api/v1/3d-assets/${encodeURIComponent(slotItem.assetId)}/model`,
        mobileModelUrl:
          matchedGarment?.mobileModelUrl ??
          `/api/v1/3d-assets/${encodeURIComponent(slotItem.assetId)}/model-lite`,
        anchor:
          matchedGarment?.compatibility.anchor ??
          (OUTFIT_STUDIO_POLICY.ANCHORS[slotItem.slot][0] as OutfitAnchorInput),
        materialSlots: matchedGarment?.materialSlots ?? [],
        presetId: slotItem.presetId,
        materialOverrides: null,
      };
    }
    return map;
  }, [catalog?.garments, previewPreset]);

  const garmentColumns = useMemo<DataTableColumn<AdminOutfitGarmentDiagnosticDto>[]>(
    () => [
      {
        key: 'product',
        header: 'Garment & 3D Asset',
        render: (row) => (
          <div className="space-y-0.5">
            <p className="font-medium text-ink">{row.productName}</p>
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-ink-muted">
              <span>{row.productSlug}</span>
              <span>v{String(row.version).padStart(4, '0')}</span>
              <Badge tone="neutral">{row.productStatus}</Badge>
            </div>
          </div>
        ),
      },
      {
        key: 'slotAnchor',
        header: 'Slot & Anchor',
        render: (row) =>
          row.compatibility ? (
            <div className="space-y-0.5 font-mono text-xs text-ink">
              <p>
                Slot: <span className="font-semibold">{row.compatibility.slot}</span>
              </p>
              <p className="text-ink-muted">Anchor: {row.compatibility.anchor}</p>
              {row.compatibility.incompatibleSlots.length > 0 ? (
                <p className="text-warning-fg">
                  Blocks: {row.compatibility.incompatibleSlots.join(', ')}
                </p>
              ) : null}
            </div>
          ) : (
            <span className="text-xs text-ink-muted">Not configured</span>
          ),
      },
      {
        key: 'rigSkeleton',
        header: 'Rig & Skeleton',
        render: (row) =>
          row.compatibility ? (
            <div className="space-y-0.5 font-mono text-xs tabular-nums">
              <p className="text-ink">{row.compatibility.rigId}</p>
              <p
                className={
                  row.compatibility.skeletonVersion ===
                  OUTFIT_STUDIO_POLICY.SKELETON_VERSION
                    ? 'text-ink-muted'
                    : 'font-semibold text-danger-fg'
                }
              >
                v{row.compatibility.skeletonVersion}
              </p>
            </div>
          ) : (
            <span className="font-mono text-xs text-ink-muted">--</span>
          ),
      },
      {
        key: 'diagnostic',
        header: 'Rig Compatibility Status',
        render: (row) => (
          <div className="space-y-1">
            {row.compatibleWithCurrentRig ? (
              <Badge tone="success">COMPATIBLE</Badge>
            ) : row.compatibility ? (
              <Badge tone="danger">INCOMPATIBLE</Badge>
            ) : (
              <Badge tone="neutral">UNCONFIGURED</Badge>
            )}
            {row.diagnosticMessage ? (
              <p className="max-w-xs text-xs text-ink-secondary">
                {row.diagnosticMessage}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (row) =>
          canPublish ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                onClick={() => openCompatibilityEditor(row)}
              >
                Configure Compatibility
              </Button>
              {row.compatibility ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  className="min-h-11"
                  isLoading={removingAssetId === row.assetId}
                  onClick={() => void handleRemoveCompatibility(row)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ) : (
            <span className="font-mono text-xs text-ink-muted">Read-only</span>
          ),
      },
    ],
    [canPublish, handleRemoveCompatibility, openCompatibilityEditor, removingAssetId],
  );

  return (
    <AdminShell
      title="Outfit Studio Compatibility & Presets"
      description="Govern 3D garment compatibility against the standardized mannequin rig (arven_mannequin_unisex_v1 v1.0.0) and manage curated public outfit presets."
      user={user}
      actions={
        canPublish ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            className="min-h-11"
            onClick={openCreatePresetModal}
          >
            Create Public Preset
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
          description="Your assigned role does not include asset.read or asset.publish permissions for Outfit Studio operations."
        />
      ) : loading ? (
        <LoadingState
          label="Loading garment 3D compatibility diagnostics and public presets"
          rows={5}
        />
      ) : loadError ? (
        <ErrorState
          title="Unable to load Outfit Studio diagnostics"
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
              description="Your role has asset.read access. Updating rig compatibility or mutating public outfit presets requires asset.publish permission."
            />
          ) : null}

          {/* Garment Compatibility Diagnostics Table */}
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-normal text-ink">
                  Garment 3D Rig Compatibility Diagnostics
                </h2>
                <p className="font-mono text-xs tabular-nums text-ink-muted">
                  Pinned Rig Contract: {OUTFIT_STUDIO_POLICY.RIG_ID} (skeleton v
                  {OUTFIT_STUDIO_POLICY.SKELETON_VERSION})
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success">
                  <span className="font-mono tabular-nums">
                    {garments.filter((g) => g.compatibleWithCurrentRig).length} compatible
                  </span>
                </Badge>
                <Badge tone="danger">
                  <span className="font-mono tabular-nums">
                    {garments.filter((g) => !g.compatibleWithCurrentRig).length} incompatible
                  </span>
                </Badge>
              </div>
            </div>

            {garments.length === 0 ? (
              <EmptyState
                title="No active READY 3D assets found"
                description="Upload and publish product 3D assets in Catalog -> Products to configure Outfit Studio compatibility."
              />
            ) : (
              <DataTable
                columns={garmentColumns}
                rows={garments}
                getRowKey={(row) => row.assetId}
                caption="Garment 3D asset compatibility table"
              />
            )}
          </Surface>

          {/* Curated Public Outfit Presets */}
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-normal text-ink">
                  Curated Public Outfit Presets
                </h2>
                <p className="text-xs text-ink-muted">
                  Public presets store product, variant, and asset IDs only. Live IDR totals are resolved dynamically from active variants.
                </p>
              </div>
              <Badge tone="neutral">
                <span className="font-mono tabular-nums">{presets.length} presets</span>
              </Badge>
            </div>

            {presets.length === 0 ? (
              <EmptyState
                title="No public outfit presets configured"
                description="Create a curated outfit preset to offer quick styling combinations in the Storefront Outfit Studio."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {presets.map((preset) => (
                  <Surface
                    key={preset.id}
                    variant="subtle"
                    border="hairline"
                    padding="md"
                    className="flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <h3 className="font-display text-xl font-normal text-ink">
                            {preset.title}
                          </h3>
                          <p className="font-mono text-xs tabular-nums text-ink-muted">
                            {preset.rigId} (v{preset.skeletonVersion}) / Updated{' '}
                            {formatWIB(preset.updatedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge tone="info">
                            <span className="font-mono tabular-nums">
                              {preset.slots.length} / 5 slots
                            </span>
                          </Badge>
                          {preset.hasStaleItems ? (
                            <Badge tone="warning">Stale Item</Badge>
                          ) : null}
                        </div>
                      </div>

                      <ul className="space-y-1.5 border-t border-hairline pt-2.5 text-xs">
                        {preset.slots.map((slotItem) => (
                          <li
                            key={`${preset.id}-${slotItem.slot}`}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="text-ink-secondary">
                              <strong className="font-mono uppercase text-ink">
                                {slotItem.slot}
                              </strong>
                              : {slotItem.productName} ({slotItem.sku ?? slotItem.size})
                            </span>
                            <span className="font-mono tabular-nums text-ink">
                              {formatIDR(slotItem.unitPriceIdr)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
                      <div className="space-y-0.5">
                        <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                          Live Preset Total
                        </span>
                        <p className="font-mono text-sm font-semibold tabular-nums text-ink">
                          {formatIDR(preset.liveTotalIdr)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="min-h-11"
                          onClick={() => setPreviewPreset(preset)}
                        >
                          Preview 3D Mannequin
                        </Button>
                        {canPublish ? (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="min-h-11"
                              onClick={() => openEditPresetModal(preset)}
                            >
                              Edit Preset
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              className="min-h-11"
                              isLoading={deletingPresetId === preset.id}
                              onClick={() => void handleDeletePreset(preset)}
                            >
                              Delete Preset
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </Surface>
                ))}
              </div>
            )}
          </Surface>
        </div>
      )}

      {/* Garment Compatibility Editor Modal */}
      <Modal
        isOpen={Boolean(editingGarment)}
        onClose={() => setEditingGarment(null)}
        title={
          editingGarment
            ? `Configure Compatibility: ${editingGarment.productName}`
            : 'Configure Outfit Compatibility'
        }
        description="Bind this 3D garment asset to a standardized mannequin rig, skeleton version, slot, anchor node, and symmetric layer-conflict rules."
        size="lg"
      >
        {editingGarment ? (
          <form onSubmit={handleSaveCompatibility} className="space-y-4">
            {compatError ? (
              <StatusBanner
                tone="danger"
                title="Compatibility Validation Error"
                description={compatError}
              />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="compat-rig-id" label="Mannequin Rig ID" required>
                <Input
                  id="compat-rig-id"
                  value={compatRigId}
                  onChange={(e) => setCompatRigId(e.target.value)}
                  placeholder="arven_mannequin_unisex_v1"
                />
              </FormField>

              <FormField
                id="compat-skeleton-version"
                label="Skeleton Version (x.y.z)"
                required
              >
                <Input
                  id="compat-skeleton-version"
                  value={compatSkeletonVersion}
                  onChange={(e) => setCompatSkeletonVersion(e.target.value)}
                  placeholder="1.0.0"
                />
              </FormField>

              <FormField id="compat-slot" label="Garment Slot" required>
                <Select
                  id="compat-slot"
                  value={compatSlot}
                  onChange={(e) => {
                    const nextSlot = e.target.value as OutfitSlotInput;
                    setCompatSlot(nextSlot);
                    const allowedAnchors = OUTFIT_STUDIO_POLICY.ANCHORS[nextSlot];
                    if (
                      allowedAnchors[0] &&
                      !(allowedAnchors as readonly string[]).includes(compatAnchor)
                    ) {
                      setCompatAnchor(allowedAnchors[0]);
                    }
                  }}
                >
                  {OUTFIT_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField id="compat-anchor" label="Rig Anchor Node" required>
                <Select
                  id="compat-anchor"
                  value={compatAnchor}
                  onChange={(e) =>
                    setCompatAnchor(e.target.value as OutfitAnchorInput)
                  }
                >
                  {OUTFIT_ANCHORS.map((anchor) => (
                    <option key={anchor} value={anchor}>
                      {anchor}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                Incompatible Slots (Symmetric Layer Conflicts)
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {OUTFIT_SLOTS.filter((s) => s !== compatSlot).map((slot) => {
                  const checked = compatIncompatibleSlots.includes(slot);
                  return (
                    <label
                      key={slot}
                      className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-control-border bg-subtle px-3 py-2 text-xs font-medium text-ink cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleIncompatibleSlot(slot)}
                        className="h-4 w-4"
                      />
                      <span className="font-mono">{slot}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="min-h-11"
                onClick={() => setEditingGarment(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="min-h-11"
                isLoading={savingCompat}
                loadingLabel="Saving Compatibility"
              >
                Save Compatibility Config
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Create / Edit Public Preset Modal */}
      <Modal
        isOpen={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        title={
          editingPreset
            ? `Edit Public Preset: ${editingPreset.title}`
            : 'Create Curated Public Preset'
        }
        description="Compose a public outfit preset for the standardized mannequin rig. Prices are never stored in the preset payload."
        size="lg"
      >
        <form onSubmit={handleSavePreset} className="space-y-4">
          {presetError ? (
            <StatusBanner
              tone="danger"
              title="Preset Validation Error"
              description={presetError}
            />
          ) : null}

          <FormField id="public-preset-title" label="Preset Title" required>
            <Input
              id="public-preset-title"
              value={presetTitle}
              maxLength={OUTFIT_STUDIO_POLICY.TITLE_MAX}
              onChange={(e) => setPresetTitle(e.target.value)}
              placeholder="Seragam Atelier"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            {OUTFIT_SLOTS.map((slot) => {
              const slotGarments =
                catalog?.garments.filter((g) => g.compatibility.slot === slot) ??
                [];
              return (
                <FormField
                  key={slot}
                  id={`preset-slot-${slot}`}
                  label={`Slot: ${slot}`}
                >
                  {slotGarments.length > 0 ? (
                    <Select
                      id={`preset-slot-${slot}`}
                      value={presetSlotVariants[slot] ?? ''}
                      onChange={(e) =>
                        setPresetSlotVariants((prev) => ({
                          ...prev,
                          [slot]: e.target.value,
                        }))
                      }
                    >
                      <option value="">-- Empty Slot --</option>
                      {slotGarments.flatMap((g) =>
                        g.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {g.productName} ({v.color} / {v.size} /{' '}
                            {formatIDR(v.priceIdr)})
                          </option>
                        )),
                      )}
                    </Select>
                  ) : (
                    <Input
                      id={`preset-slot-${slot}`}
                      value={presetSlotVariants[slot] ?? ''}
                      onChange={(e) =>
                        setPresetSlotVariants((prev) => ({
                          ...prev,
                          [slot]: e.target.value,
                        }))
                      }
                      placeholder="Variant UUID (optional)"
                    />
                  )}
                </FormField>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="min-h-11"
              onClick={() => setPresetModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="min-h-11"
              isLoading={savingPreset}
              loadingLabel="Saving Preset"
            >
              {editingPreset ? 'Save Preset Changes' : 'Create Public Preset'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 3D Mannequin Preview Modal */}
      <Modal
        isOpen={Boolean(previewPreset)}
        onClose={() => setPreviewPreset(null)}
        title={
          previewPreset
            ? `3D Mannequin Preview: ${previewPreset.title}`
            : '3D Mannequin Preview'
        }
        description="Inspect anchor attachment and material overrides on arven_mannequin_unisex_v1."
        size="lg"
      >
        {previewPreset ? (
          <div className="space-y-4">
            <div className="mx-auto aspect-[3/4] max-w-md overflow-hidden border border-control-border bg-[#17191B]">
              <DynamicAdminOutfitStudioExperience
                rigId={previewPreset.rigId}
                rigModelUrl={
                  catalog?.rig.modelUrl ??
                  `/api/v1/outfit-studio/rigs/${encodeURIComponent(previewPreset.rigId)}/model`
                }
                rigMobileModelUrl={
                  catalog?.rig.mobileModelUrl ??
                  `/api/v1/outfit-studio/rigs/${encodeURIComponent(previewPreset.rigId)}/model-lite`
                }
                rigPosterUrl={
                  catalog?.rig.posterUrl ??
                  `/api/v1/outfit-studio/rigs/${encodeURIComponent(previewPreset.rigId)}/poster`
                }
                slots={previewRenderSlots}
                interactionEnabled
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs tabular-nums text-ink-muted">
              <span>Rig: {previewPreset.rigId}</span>
              <span>Slots: {previewPreset.slots.length} / 5</span>
              <span>Live Total: {formatIDR(previewPreset.liveTotalIdr)}</span>
            </div>
          </div>
        ) : null}
      </Modal>
    </AdminShell>
  );
}
