'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  AdminProduct3DAssetDto,
  AdminProductDetailDto,
  AssetStatusInput,
  AssetValidationStatusInput,
  CustomizationPresetDto,
} from '@arven/contracts';
import { buildArvenGarmentGlbBuffer, inferSilhouetteFromSlug } from '@arven/three-engine/glb';
import {
  createCustomizationPresetRequestSchema,
  isAllowedArvenColorHex,
} from '@arven/validators';
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
  StatusBanner,
  Surface,
  useToast,
  type BadgeTone,
} from '@arven/ui';
import { AdminApiClientError, adminApi } from '@/lib/api-client';

const DynamicAdminProductExperience = dynamic(
  () => import('@arven/three-engine').then((mod) => mod.ProductExperience),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-[3/4] w-full items-center justify-center border border-control-border bg-[#17191B] p-6 text-center text-[#F8F7F3]">
        <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
          Loading 3D QA Preview...
        </p>
      </div>
    ),
  },
);

const MAX_CLIENT_GLB_BYTES = 15_728_640;

export interface AdminProduct3DPanelProps {
  product: AdminProductDetailDto;
  canReadAssets: boolean;
  canUploadAssets: boolean;
  canPublishAssets: boolean;
  onProductUpdated?: () => Promise<void> | void;
}

function assetStatusTone(status: AssetStatusInput): BadgeTone {
  switch (status) {
    case 'READY':
      return 'success';
    case 'PROCESSING':
    case 'UPLOADED':
      return 'info';
    case 'FAILED':
      return 'danger';
    case 'ARCHIVED':
    default:
      return 'neutral';
  }
}

function validationStatusTone(status: AssetValidationStatusInput): BadgeTone {
  switch (status) {
    case 'PASSED':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'RUNNING':
    case 'QUEUED':
    default:
      return 'info';
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('Unable to read GLB binary file.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to read GLB binary file.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

export function AdminProduct3DPanel({
  product,
  canReadAssets,
  canUploadAssets,
  canPublishAssets,
  onProductUpdated,
}: AdminProduct3DPanelProps) {
  const { toast } = useToast();

  const [assets, setAssets] = useState<AdminProduct3DAssetDto[]>([]);
  const [loading, setLoading] = useState(canReadAssets);
  const [loadError, setLoadError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // Upload & validation state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [publishingAssetId, setPublishingAssetId] = useState<string | null>(null);

  // QA Preview modal state
  const [previewAsset, setPreviewAsset] = useState<AdminProduct3DAssetDto | null>(null);
  const [previewPresetId, setPreviewPresetId] = useState<string | null>(null);

  // Preset creation & deletion state
  const [presetCode, setPresetCode] = useState('');
  const [presetLabel, setPresetLabel] = useState('');
  const [presetSwatchHex, setPresetSwatchHex] = useState('#17191B');
  const [presetVariantId, setPresetVariantId] = useState('');
  const [presetError, setPresetError] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);

  const loadAssets = useCallback(
    async (preferredAssetId?: string | null) => {
      if (!canReadAssets) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const list = await adminApi.listProduct3DAssets(product.id);
        setAssets(list);
        setSelectedAssetId((current) => {
          if (preferredAssetId && list.some((a) => a.id === preferredAssetId)) {
            return preferredAssetId;
          }
          if (current && list.some((a) => a.id === current)) {
            return current;
          }
          return list.find((a) => a.isActiveVersion)?.id ?? list[0]?.id ?? null;
        });
      } catch (err) {
        if (err instanceof AdminApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load 3D asset versions for this product.' });
        }
      } finally {
        setLoading(false);
      }
    },
    [canReadAssets, product.id],
  );

  useEffect(() => {
    if (!canReadAssets) {
      return;
    }

    let active = true;
    adminApi
      .listProduct3DAssets(product.id)
      .then((list) => {
        if (!active) return;
        setAssets(list);
        setLoadError(null);
        setSelectedAssetId((current) => {
          if (current && list.some((a) => a.id === current)) {
            return current;
          }
          return list.find((a) => a.isActiveVersion)?.id ?? list[0]?.id ?? null;
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load 3D asset versions for this product.' });
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
  }, [canReadAssets, product.id]);

  const selectedAsset = useMemo(() => {
    if (assets.length === 0) return null;
    return assets.find((a) => a.id === selectedAssetId) ?? assets[0] ?? null;
  }, [assets, selectedAssetId]);

  const uploadAndConfirmGlb = useCallback(
    async (params: {
      fileName: string;
      defaultBytes: Uint8Array;
      liteBytes?: Uint8Array;
    }) => {
      setUploading(true);
      setUploadError(null);
      try {
        const silhouette = inferSilhouetteFromSlug(product.slug);
        const presigned = await adminApi.presign3DAssetUpload(product.id, {
          fileName: params.fileName,
          contentType: 'model/gltf-binary',
          bytes: params.defaultBytes.byteLength,
          silhouette,
          lightingPreset: 'arven_studio_neutral_v1',
        });

        await adminApi.uploadStaging3DAsset(presigned.asset.id, {
          glbBase64: uint8ArrayToBase64(params.defaultBytes),
          ...(params.liteBytes
            ? { liteGlbBase64: uint8ArrayToBase64(params.liteBytes) }
            : {}),
        });

        const confirmed = await adminApi.confirm3DAsset(presigned.asset.id, {});
        await loadAssets(confirmed.id);

        if (confirmed.status === 'READY') {
          toast({
            tone: 'success',
            title: `3D Asset v${String(confirmed.version).padStart(4, '0')} Validated`,
            description: 'GLB passed glTF 2.0 and material slot validation.',
          });
        } else {
          toast({
            tone: 'warning',
            title: `3D Asset v${String(confirmed.version).padStart(4, '0')} Validation ${confirmed.status}`,
            description:
              confirmed.validationRuns[0]?.errorSummary ??
              'Inspect the validation report for diagnostic errors.',
          });
        }
      } catch (err) {
        const message =
          err instanceof AdminApiClientError
            ? err.message
            : 'Unable to upload and validate 3D GLB asset.';
        setUploadError(message);
        toast({
          tone: 'danger',
          title: '3D asset upload failed',
          description: message,
        });
      } finally {
        setUploading(false);
      }
    },
    [loadAssets, product.id, product.slug, toast],
  );

  const handleGenerateStudioGlb = async () => {
    const silhouette = inferSilhouetteFromSlug(product.slug);
    const primaryVariant = product.variants.find(
      (v) => v.colorHex && isAllowedArvenColorHex(v.colorHex),
    );
    const primaryHex = primaryVariant?.colorHex ?? '#17191B';
    const defaultBytes = buildArvenGarmentGlbBuffer({
      silhouette,
      primaryHex,
      profile: 'default',
    });
    const liteBytes = buildArvenGarmentGlbBuffer({
      silhouette,
      primaryHex,
      profile: 'lite',
    });

    await uploadAndConfirmGlb({
      fileName: `${product.slug}-studio.glb`,
      defaultBytes,
      liteBytes,
    });
  };

  const handleGlbFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size < 20 || file.size > MAX_CLIENT_GLB_BYTES) {
      setUploadError(
        `GLB file must be between 20 bytes and ${MAX_CLIENT_GLB_BYTES.toLocaleString('en-US')} bytes.`,
      );
      return;
    }

    try {
      const bytes = await readFileAsUint8Array(file);
      await uploadAndConfirmGlb({
        fileName: file.name || `${product.slug}.glb`,
        defaultBytes: bytes,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to read selected GLB file.');
    }
  };

  const handlePublishAsset = async (asset: AdminProduct3DAssetDto) => {
    setPublishingAssetId(asset.id);
    try {
      const published = await adminApi.publish3DAsset(asset.id, {
        enableProduct3d: true,
      });
      toast({
        tone: 'success',
        title: `Published 3D Version v${String(published.version).padStart(4, '0')}`,
        description: 'Active 3D viewer version promoted and product 3D flag enabled.',
      });
      await loadAssets(published.id);
      await onProductUpdated?.();
    } catch (err) {
      const message =
        err instanceof AdminApiClientError ? err.message : 'Unable to publish 3D asset version.';
      toast({
        tone: 'danger',
        title: '3D publish blocked',
        description: message,
      });
    } finally {
      setPublishingAssetId(null);
    }
  };

  const handleCreatePreset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAsset) return;
    setPresetError(null);

    const normalizedCode = presetCode.trim().toLowerCase();
    const normalizedLabel = presetLabel.trim();
    const normalizedHex = presetSwatchHex.trim().toUpperCase();

    if (!isAllowedArvenColorHex(normalizedHex)) {
      setPresetError(
        'Swatch hex must be a valid 6-digit hex color (#RRGGBB). Pink and magenta colors are forbidden by the ARVEN design contract.',
      );
      return;
    }

    const parsed = createCustomizationPresetRequestSchema.safeParse({
      code: normalizedCode,
      label: normalizedLabel,
      swatchHex: normalizedHex,
      materialOverrides: {
        mat_fabric_primary: {
          baseColorHex: normalizedHex,
        },
      },
      variantId: presetVariantId || null,
      isActive: true,
      sortOrder: selectedAsset.customizationPresets.length,
    });

    if (!parsed.success) {
      setPresetError(parsed.error.issues[0]?.message ?? 'Invalid customization preset fields.');
      return;
    }

    setSavingPreset(true);
    try {
      const created: CustomizationPresetDto = await adminApi.create3DAssetPreset(
        selectedAsset.id,
        parsed.data,
      );
      setAssets((prev) =>
        prev.map((asset) =>
          asset.id === selectedAsset.id
            ? {
                ...asset,
                customizationPresets: [...asset.customizationPresets, created],
              }
            : asset,
        ),
      );
      setPresetCode('');
      setPresetLabel('');
      setPresetSwatchHex('#17191B');
      setPresetVariantId('');
      toast({
        tone: 'success',
        title: 'Customization preset added',
        description: `${created.label} (${created.swatchHex}) bound to mat_fabric_primary.`,
      });
    } catch (err) {
      const message =
        err instanceof AdminApiClientError
          ? err.message
          : 'Unable to save customization preset.';
      setPresetError(message);
    } finally {
      setSavingPreset(false);
    }
  };

  const handleDeletePreset = async (assetId: string, presetId: string) => {
    setDeletingPresetId(presetId);
    setPresetError(null);
    try {
      await adminApi.delete3DAssetPreset(assetId, presetId);
      setAssets((prev) =>
        prev.map((asset) =>
          asset.id === assetId
            ? {
                ...asset,
                customizationPresets: asset.customizationPresets.filter((p) => p.id !== presetId),
              }
            : asset,
        ),
      );
      toast({
        tone: 'success',
        title: 'Customization preset removed',
      });
    } catch (err) {
      const message =
        err instanceof AdminApiClientError
          ? err.message
          : 'Unable to delete customization preset.';
      setPresetError(message);
      toast({
        tone: 'danger',
        title: 'Preset delete failed',
        description: message,
      });
    } finally {
      setDeletingPresetId(null);
    }
  };

  return (
    <Surface variant="elevated" border="hairline" padding="lg" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-normal text-ink">
            3D Studio Assets &amp; Customization Presets
          </h2>
          <p className="text-xs text-ink-muted">
            Quarantine GLB upload, mesh and material slot validation, QA preview, version publishing,
            and server-driven presets.
          </p>
        </div>

        {canReadAssets && canUploadAssets ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={uploading}
              loadingLabel="Validating GLB"
              onClick={() => void handleGenerateStudioGlb()}
            >
              Generate Studio GLB &amp; Validate
            </Button>

            <label
              htmlFor="admin-glb-file-upload"
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-control-border bg-panel px-3.5 py-2 text-xs font-medium tracking-[0.04em] text-ink transition-colors hover:border-strong-border hover:bg-panel-hover cursor-pointer"
            >
              Upload .GLB File
            </label>
            <input
              id="admin-glb-file-upload"
              type="file"
              accept=".glb,model/gltf-binary"
              disabled={uploading}
              onChange={(event) => void handleGlbFileSelect(event)}
              className="sr-only"
            />
          </div>
        ) : null}
      </div>

      {!canReadAssets ? (
        <StatusBanner
          tone="info"
          title="3D Asset Access Restricted"
          description="Your assigned role does not include asset.read permission."
        />
      ) : loading ? (
        <LoadingState label="Loading 3D asset versions and validation runs" rows={4} />
      ) : loadError ? (
        <ErrorState
          title="Unable to load 3D assets"
          message={loadError.message}
          requestId={loadError.requestId}
          onRetry={() => void loadAssets()}
        />
      ) : (
        <div className="space-y-6">
          {uploadError ? <StatusBanner tone="danger" title="Upload Error" description={uploadError} /> : null}

          {assets.length === 0 ? (
            <EmptyState
              title="No 3D asset versions uploaded"
              description={
                canUploadAssets
                  ? 'Generate a Studio GLB or upload a validated .glb model to enable interactive 3D inspection.'
                  : 'No 3D asset versions have been uploaded for this garment yet.'
              }
            />
          ) : (
            <div className="space-y-3">
              {assets.map((asset) => {
                const isSelected = selectedAsset?.id === asset.id;
                const latestRun = asset.validationRuns[0] ?? null;
                const defaultProfile = asset.config.qualityProfiles.default;
                const canPublishThis =
                  canPublishAssets && asset.status === 'READY' && !asset.isActiveVersion;

                return (
                  <Surface
                    key={asset.id}
                    variant={isSelected ? 'panel' : 'subtle'}
                    border={isSelected ? 'strong' : 'hairline'}
                    padding="md"
                    className="space-y-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                            v{String(asset.version).padStart(4, '0')}
                          </span>
                          <Badge tone={assetStatusTone(asset.status)}>{asset.status}</Badge>
                          {asset.isActiveVersion ? (
                            <Badge tone="success">Active Version</Badge>
                          ) : null}
                          <Badge tone="neutral">{asset.format}</Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-ink-muted">
                          <span>{asset.bytes.toLocaleString('en-US')} B</span>
                          <span>
                            {defaultProfile.triangles.toLocaleString('en-US')} tri /{' '}
                            {defaultProfile.vertices.toLocaleString('en-US')} vtx
                          </span>
                          <span>{asset.customizationPresets.length} preset(s)</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant={isSelected ? 'primary' : 'secondary'}
                          size="sm"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedAssetId(asset.id)}
                        >
                          {isSelected ? 'Selected Version' : 'Manage Presets'}
                        </Button>

                        {asset.status !== 'FAILED' ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setPreviewAsset(asset);
                              setPreviewPresetId(asset.customizationPresets[0]?.id ?? null);
                            }}
                          >
                            Preview 3D QA
                          </Button>
                        ) : null}

                        {canPublishThis ? (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            isLoading={publishingAssetId === asset.id}
                            loadingLabel="Publishing"
                            onClick={() => void handlePublishAsset(asset)}
                          >
                            Publish 3D Version
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {latestRun ? (
                      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-2.5 text-xs">
                        <Badge tone={validationStatusTone(latestRun.status)}>
                          Validation {latestRun.status}
                        </Badge>
                        <span className="font-mono text-ink-muted">{latestRun.validatorVersion}</span>
                        {latestRun.errorSummary ? (
                          <span className="text-danger-fg">{latestRun.errorSummary}</span>
                        ) : (
                          <span className="text-ink-secondary">
                            Mesh and material slot checks passed.
                          </span>
                        )}
                      </div>
                    ) : null}
                  </Surface>
                );
              })}
            </div>
          )}

          {selectedAsset ? (
            <>
              <Divider />

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-ink">
                      Customization Presets for v{String(selectedAsset.version).padStart(4, '0')}
                    </h3>
                    <p className="text-xs text-ink-muted">
                      Each preset overrides slot <code className="font-mono">mat_fabric_primary</code>{' '}
                      and optionally synchronizes an active product variant.
                    </p>
                  </div>
                </div>

                {presetError ? (
                  <StatusBanner tone="danger" title="Preset Validation Error" description={presetError} />
                ) : null}

                {selectedAsset.customizationPresets.length === 0 ? (
                  <EmptyState
                    title="No customization presets defined"
                    description="Add a material and color preset below to bind swatch hex values to mat_fabric_primary."
                  />
                ) : (
                  <div className="space-y-2.5">
                    {selectedAsset.customizationPresets.map((preset) => {
                      const linkedVariant =
                        product.variants.find((v) => v.id === preset.variantId) ?? null;
                      return (
                        <div
                          key={preset.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <span
                              aria-hidden="true"
                              className="inline-block h-5 w-5 shrink-0 rounded-full border border-control-border"
                              style={{ backgroundColor: preset.swatchHex }}
                            />
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium text-ink">{preset.label}</p>
                              <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-muted">
                                <span>{preset.code}</span>
                                <span>{preset.swatchHex}</span>
                                {linkedVariant || preset.variantSku ? (
                                  <Badge tone="neutral">
                                    {linkedVariant
                                      ? `${linkedVariant.sku} (${linkedVariant.color})`
                                      : preset.variantSku}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {canUploadAssets ? (
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              isLoading={deletingPresetId === preset.id}
                              loadingLabel="Removing"
                              onClick={() => void handleDeletePreset(selectedAsset.id, preset.id)}
                            >
                              Delete Preset
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {canUploadAssets ? (
                  <form
                    onSubmit={handleCreatePreset}
                    className="space-y-4 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                      Add Customization Preset
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <FormField id="preset-code" label="Preset Code" required>
                        <Input
                          id="preset-code"
                          value={presetCode}
                          onChange={(e) => setPresetCode(e.target.value)}
                          placeholder="charcoal-wool"
                        />
                      </FormField>
                      <FormField id="preset-label" label="Preset Label" required>
                        <Input
                          id="preset-label"
                          value={presetLabel}
                          onChange={(e) => setPresetLabel(e.target.value)}
                          placeholder="Charcoal Wool"
                        />
                      </FormField>
                      <FormField id="preset-swatch-hex" label="Swatch Hex" required>
                        <Input
                          id="preset-swatch-hex"
                          value={presetSwatchHex}
                          onChange={(e) => setPresetSwatchHex(e.target.value)}
                          placeholder="#17191B"
                        />
                      </FormField>
                      <FormField id="preset-variant-id" label="Linked Variant">
                        <Select
                          id="preset-variant-id"
                          value={presetVariantId}
                          onChange={(e) => setPresetVariantId(e.target.value)}
                        >
                          <option value="">No variant link</option>
                          {product.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.sku} ({variant.size} / {variant.color})
                            </option>
                          ))}
                        </Select>
                      </FormField>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        isLoading={savingPreset}
                        loadingLabel="Saving Preset"
                      >
                        Add Preset
                      </Button>
                    </div>
                  </form>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Preview 3D QA Modal */}
      <Modal
        isOpen={Boolean(previewAsset)}
        onClose={() => setPreviewAsset(null)}
        title={
          previewAsset
            ? `3D QA Preview: v${String(previewAsset.version).padStart(4, '0')}`
            : '3D QA Preview'
        }
        description="Inspect silhouette scale, orientation, and material slot overrides using self-hosted decoders before publishing."
        size="lg"
      >
        {previewAsset ? (
          <div className="space-y-4">
            {previewAsset.customizationPresets.length > 0 ? (
              <div
                role="radiogroup"
                aria-label="Preview material presets"
                className="flex flex-wrap items-center gap-2"
              >
                {previewAsset.customizationPresets.map((preset) => {
                  const selected = previewPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPreviewPresetId(preset.id)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-control-border bg-elevated px-3 py-1.5 text-xs font-medium text-ink hover:border-strong-border cursor-pointer"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-3.5 w-3.5 rounded-full border border-control-border"
                        style={{ backgroundColor: preset.swatchHex }}
                      />
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <DynamicAdminProductExperience
              productId={product.id}
              assetId={previewAsset.id}
              version={previewAsset.version}
              productName={product.name}
              modelUrl={previewAsset.previewModelUrl}
              mobileModelUrl={null}
              posterUrl={previewAsset.posterUrl}
              config={previewAsset.config}
              presets={previewAsset.customizationPresets}
              activePresetId={previewPresetId}
              dracoDecoderPath="/decoders/draco/"
              ktx2TranscoderPath="/decoders/basis/"
            />
          </div>
        ) : null}
      </Modal>
    </Surface>
  );
}
