'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef } from 'react';
import type { Product3DAssetPublicDto } from '@arven/contracts';
import { storefrontApi } from '@/lib/api-client';

const DynamicProductExperience = dynamic(
  () => import('@arven/three-engine').then((mod) => mod.ProductExperience),
  {
    ssr: false,
    loading: () => (
      <div
        data-theme="dark"
        className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 border border-[#35383A] bg-[#17191B] p-6 text-center"
        data-testid="arven-3d-loading"
      >
        <span className="border border-[#46494C] bg-[#35383A] px-3 py-1 font-mono text-xs uppercase tracking-[0.08em] text-[#C5A572]">
          3D Studio
        </span>
        <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
          Memuat Penampil Studio 3D...
        </p>
      </div>
    ),
  },
);

export interface Product3DViewerIslandProps {
  readonly asset: Product3DAssetPublicDto;
  readonly activePresetId: string | null;
  readonly onFallbackTo2D?: (reason: string) => void;
}

/**
 * Client-only 3D product viewer boundary loaded strictly on the PDP via next/dynamic (ssr: false).
 */
export function Product3DViewerIsland({
  asset,
  activePresetId,
  onFallbackTo2D,
}: Product3DViewerIslandProps) {
  const fallbackCallbackRef = useRef(onFallbackTo2D);
  useEffect(() => {
    fallbackCallbackRef.current = onFallbackTo2D;
  }, [onFallbackTo2D]);

  const previousPresetIdRef = useRef<string | null>(activePresetId);

  const handleFallback = useCallback((reason: string) => {
    fallbackCallbackRef.current?.(reason);
  }, []);

  const handleTelemetry = useCallback(
    (event: {
      eventType:
        | 'viewer_opened'
        | 'preset_selected'
        | 'camera_preset'
        | 'fallback_triggered'
        | 'load_error'
        | 'context_lost';
      deviceTier: 'default' | 'lite';
      errorCode?: string;
      cameraPreset?: string;
      durationMs?: number;
    }) => {
      const selectedPreset = asset.customizationPresets.find(
        (preset) => preset.id === activePresetId,
      );
      void storefrontApi
        .record3DTelemetry({
          eventType: event.eventType,
          productId: asset.productId,
          assetId: asset.id,
          version: asset.version,
          deviceTier: event.deviceTier,
          ...(selectedPreset ? { presetCode: selectedPreset.code } : {}),
          ...(event.cameraPreset ? { cameraPreset: event.cameraPreset } : {}),
          ...(event.errorCode ? { errorCode: event.errorCode } : {}),
          ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
        })
        .catch(() => {
          // Telemetry must never interrupt interactive product inspection or checkout
        });
    },
    [activePresetId, asset.customizationPresets, asset.id, asset.productId, asset.version],
  );

  useEffect(() => {
    if (
      previousPresetIdRef.current !== null &&
      previousPresetIdRef.current !== activePresetId &&
      activePresetId !== null
    ) {
      const nextPreset = asset.customizationPresets.find(
        (preset) => preset.id === activePresetId,
      );
      if (nextPreset) {
        void storefrontApi
          .record3DTelemetry({
            eventType: 'preset_selected',
            productId: asset.productId,
            assetId: asset.id,
            version: asset.version,
            presetCode: nextPreset.code,
          })
          .catch(() => {
            // Non-blocking telemetry
          });
      }
    }
    previousPresetIdRef.current = activePresetId;
  }, [activePresetId, asset.customizationPresets, asset.id, asset.productId, asset.version]);

  return (
    <section
      data-theme="dark"
      aria-label={`Studio Penampil 3D ${asset.productName}`}
      data-testid="product-3d-viewer-island"
      className="overflow-hidden border border-[#35383A] bg-[#17191B] text-[#F8F7F3]"
    >
      <DynamicProductExperience
        productId={asset.productId}
        assetId={asset.id}
        version={asset.version}
        productName={asset.productName}
        productSlug={asset.productSlug}
        modelUrl={asset.modelUrl}
        mobileModelUrl={asset.mobileModelUrl}
        posterUrl={asset.posterUrl}
        config={asset.config}
        presets={asset.customizationPresets}
        activePresetId={activePresetId}
        dracoDecoderPath="/decoders/draco/"
        ktx2TranscoderPath="/decoders/basis/"
        onFallbackTo2D={handleFallback}
        onTelemetryEvent={handleTelemetry}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#46494C] bg-[#17191B] px-3 py-2 text-xs text-[#B2B0A6] sm:px-4">
        <span className="font-mono tabular-nums">
          Geometri studio:{' '}
          {asset.config.qualityProfiles.default.triangles.toLocaleString('id-ID')} tri |{' '}
          {(asset.bytes / 1024).toFixed(1)} KB
        </span>
        <span className="font-mono text-[#C5A572]">
          Material PBR fisik | Render on-demand
        </span>
      </div>
    </section>
  );
}
