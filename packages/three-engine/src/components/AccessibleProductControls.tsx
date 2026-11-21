'use client';

import type { DeviceQualityTier } from '../capabilities.js';

export type CameraPresetKey = 'three_quarter' | 'front' | 'back' | 'side' | 'detail';

export interface CameraPresetOption {
  readonly key: CameraPresetKey;
  readonly label: string;
}

export const ARVEN_CAMERA_PRESETS: readonly CameraPresetOption[] = [
  { key: 'three_quarter', label: 'Tiga Perempat' },
  { key: 'front', label: 'Depan' },
  { key: 'side', label: 'Samping' },
  { key: 'back', label: 'Belakang' },
  { key: 'detail', label: 'Detail Kain' },
] as const;

export interface AccessibleProductControlsProps {
  readonly activeCameraPreset: CameraPresetKey;
  readonly onSelectCameraPreset: (preset: CameraPresetKey) => void;
  readonly onRotateLeft: () => void;
  readonly onRotateRight: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onResetCamera: () => void;
  readonly activeTier: DeviceQualityTier;
  readonly isMobileViewport: boolean;
  readonly touchOrbitActive: boolean;
  readonly onToggleTouchOrbit: () => void;
  readonly reducedMotion: boolean;
  readonly liveAnnouncement: string;
}

export function AccessibleProductControls({
  activeCameraPreset,
  onSelectCameraPreset,
  onRotateLeft,
  onRotateRight,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  activeTier,
  isMobileViewport,
  touchOrbitActive,
  onToggleTouchOrbit,
  reducedMotion,
  liveAnnouncement,
}: AccessibleProductControlsProps) {
  return (
    <div
      className="space-y-3 border-t border-[#46494C] bg-[#17191B] px-3 py-3 text-[#F8F7F3] sm:px-4"
      data-testid="arven-3d-controls"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Sudut Kamera 3D"
          className="flex flex-wrap items-center gap-2"
        >
          {ARVEN_CAMERA_PRESETS.map((preset) => {
            const active = activeCameraPreset === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectCameraPreset(preset.key)}
                className={[
                  'inline-flex min-h-11 items-center justify-center border px-3 py-2 text-xs font-medium tracking-[0.04em] transition-[background-color,border-color,color] cursor-pointer',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC]',
                  active
                    ? 'border-[#C5A572] bg-[#35383A] text-[#F8F7F3]'
                    : 'border-[#9E9C92] bg-[#17191B] text-[#F8F7F3] hover:bg-[#35383A]',
                ].join(' ')}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <span className="font-mono text-xs text-[#B2B0A6]">
          Tier: {activeTier === 'lite' ? 'Lite (Mobile)' : 'Studio Default'}
          {reducedMotion ? ' · Gerak Dikurangi' : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Kontrol Navigasi Kamera"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            onClick={onRotateLeft}
            aria-label="Putar Kiri 45 Derajat"
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[#9E9C92] bg-[#17191B] px-3 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
          >
            Putar Kiri 45°
          </button>
          <button
            type="button"
            onClick={onRotateRight}
            aria-label="Putar Kanan 45 Derajat"
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[#9E9C92] bg-[#17191B] px-3 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
          >
            Putar Kanan 45°
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            aria-label="Perbesar Model 3D"
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[#9E9C92] bg-[#17191B] px-3 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
          >
            Perbesar
          </button>
          <button
            type="button"
            onClick={onZoomOut}
            aria-label="Perkecil Model 3D"
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[#9E9C92] bg-[#17191B] px-3 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
          >
            Perkecil
          </button>
          <button
            type="button"
            onClick={onResetCamera}
            aria-label="Reset Tampilan Kamera 3D"
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[#9E9C92] bg-[#17191B] px-3 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
          >
            Reset Tampilan
          </button>
        </div>

        {isMobileViewport ? (
          <button
            type="button"
            aria-pressed={touchOrbitActive}
            onClick={onToggleTouchOrbit}
            className={[
              'inline-flex min-h-11 items-center justify-center border px-3 text-xs font-medium transition-[background-color,border-color,color] cursor-pointer',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC]',
              touchOrbitActive
                ? 'border-[#C5A572] bg-[#35383A] text-[#F8F7F3]'
                : 'border-[#9E9C92] bg-[#17191B] text-[#F8F7F3] hover:bg-[#35383A]',
            ].join(' ')}
          >
            {touchOrbitActive ? 'Kunci Gulir Halaman' : 'Aktifkan Putar 3D'}
          </button>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </p>
    </div>
  );
}
