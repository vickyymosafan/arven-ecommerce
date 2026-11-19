'use client';

import Link from 'next/link';
import type { ShowroomHotspotPublicDto, ShowroomZonePublicDto } from '@arven/contracts';
import { Badge, Button, StatusBanner, buttonClassName, formatIDR } from '@arven/ui';

export interface ShowroomFallbackProps {
  readonly zone: ShowroomZonePublicDto | null;
  readonly reason?: string | null;
  readonly canRetry3D?: boolean;
  readonly onRetry3D?: () => void;
  readonly onSelectHotspot?: (hotspot: ShowroomHotspotPublicDto) => void;
}

export function ShowroomFallback({
  zone,
  reason,
  canRetry3D = false,
  onRetry3D,
  onSelectHotspot,
}: ShowroomFallbackProps) {
  if (!zone) {
    return (
      <div
        data-theme="dark"
        className="flex min-h-[280px] flex-col items-start justify-center gap-4 border border-[#46494C] bg-[#222528] p-6 text-[#F8F7F3]"
      >
        <p className="font-display text-2xl font-normal">
          Belum ada zona ruang pamer yang dipublikasikan.
        </p>
        <p className="max-w-[var(--container-prose)] text-sm text-[#B2B0A6]">
          Jelajahi katalog lengkap ARVEN untuk melihat koleksi siap pakai dan detail ukuran resmi.
        </p>
        <Link
          href="/shop"
          className={buttonClassName({ variant: 'primary', size: 'md' })}
        >
          Lihat Koleksi
        </Link>
      </div>
    );
  }

  return (
    <div
      data-theme="dark"
      data-testid="showroom-2d-fallback"
      className="space-y-4 border border-[#46494C] bg-[#17191B] p-4 text-[#F8F7F3] sm:p-6"
    >
      <StatusBanner
        tone="info"
        title="Mode Poster 2D Aktif"
        description={
          reason
            ? 'Tampilan 3D tidak tersedia pada perangkat ini. Mode poster 2D aktif dan seluruh produk tetap dapat dibeli.'
            : 'Menampilkan poster arsitektural zona beserta daftar produk aktif.'
        }
        action={
          canRetry3D && onRetry3D ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetry3D}
              className="min-h-11"
            >
              Muat Ulang 3D
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="overflow-hidden border border-[#46494C] bg-[#222528] lg:col-span-7">
          {zone.posterUrl ? (
            <img
              src={zone.posterUrl}
              alt={`Poster arsitektural zona ${zone.title}`}
              decoding="async"
              className="aspect-[16/10] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 p-6 text-center">
              <span className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
                {zone.code}
              </span>
              <span className="font-display text-2xl text-[#F8F7F3]">{zone.title}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between gap-4 border border-[#46494C] bg-[#222528] p-4 lg:col-span-5">
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
              Zona Ruang Pamer: {zone.code}
            </p>
            <h2 className="font-display text-2xl font-normal text-[#F8F7F3]">{zone.title}</h2>
            {zone.description ? (
              <p className="text-sm leading-relaxed text-[#E9E4DA]">{zone.description}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#B2B0A6]">
              Produk di Zona Ini ({zone.hotspots.length})
            </p>
            {zone.hotspots.length === 0 ? (
              <p className="text-xs text-[#B2B0A6]">
                Zona arsitektural ini tidak memiliki penanda produk aktif.
              </p>
            ) : (
              <ul className="space-y-2">
                {zone.hotspots.map((hotspot, idx) => (
                  <li
                    key={hotspot.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-[#46494C] bg-[#17191B] p-2.5"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-medium text-[#F8F7F3]">
                        {idx + 1}. {hotspot.productName}
                      </p>
                      <p className="font-mono text-xs tabular-nums text-[#B2B0A6]">
                        Mulai {formatIDR(hotspot.fromPriceIdr)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hotspot.has3dEnabled ? <Badge tone="info">3D</Badge> : null}
                      {onSelectHotspot ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onSelectHotspot(hotspot)}
                          className="min-h-11"
                        >
                          Ringkas
                        </Button>
                      ) : null}
                      <Link
                        href={`/products/${encodeURIComponent(hotspot.productSlug)}`}
                        className={buttonClassName({ variant: 'primary', size: 'sm' })}
                      >
                        Detail
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
