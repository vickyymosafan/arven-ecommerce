'use client';

import Link from 'next/link';
import type { ShowroomHotspotPublicDto } from '@arven/contracts';
import { Badge, Button, Modal, buttonClassName, formatIDR } from '@arven/ui';

export interface HotspotQuickCardProps {
  readonly hotspot: ShowroomHotspotPublicDto | null;
  readonly zoneTitle?: string | null;
  readonly onClose: () => void;
}

export function HotspotQuickCard({
  hotspot,
  zoneTitle,
  onClose,
}: HotspotQuickCardProps) {
  return (
    <Modal
      isOpen={Boolean(hotspot)}
      onClose={onClose}
      title={hotspot?.productName ?? 'Detail Produk'}
      description={zoneTitle ? `Penanda produk pada zona ${zoneTitle}.` : undefined}
      size="sm"
      closeLabel="Tutup Kartu Produk"
      footer={
        hotspot ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onClose}
              className="min-h-11"
            >
              Tutup
            </Button>
            <Link
              href={`/products/${encodeURIComponent(hotspot.productSlug)}`}
              className={buttonClassName({
                variant: 'primary',
                size: 'md',
              })}
            >
              Lihat Detail Produk
            </Link>
          </div>
        ) : null
      }
    >
      {hotspot ? (
        <div className="space-y-4">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[var(--radius-none)] border border-hairline bg-subtle">
            {hotspot.primaryImageUrl ? (
              <img
                src={hotspot.primaryImageUrl}
                alt={hotspot.primaryImageAlt || hotspot.productName}
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
                <span className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                  ARVEN Studio
                </span>
                <span className="font-display text-xl text-ink">{hotspot.productName}</span>
              </div>
            )}

            <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-1.5">
              {hotspot.has3dEnabled ? <Badge tone="info">3D</Badge> : null}
              <Badge tone="neutral">{hotspot.label}</Badge>
            </div>
          </div>

          <div className="space-y-2 border-t border-hairline pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Harga Publik Terkini
              </span>
              <span className="font-mono text-lg font-medium tabular-nums text-ink">
                Mulai {formatIDR(hotspot.fromPriceIdr)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-ink-secondary">
              Pilih ukuran, warna, dan periksa panduan ukuran resmi pada halaman detail produk.
            </p>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
