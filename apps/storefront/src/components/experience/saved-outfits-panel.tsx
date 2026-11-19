'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { OutfitSceneDto } from '@arven/contracts';
import {
  Badge,
  Button,
  FormField,
  Input,
  StatusBanner,
  Surface,
  buttonClassName,
  cn,
  formatIDR,
  formatWIB,
} from '@arven/ui';
import { OUTFIT_STUDIO_RIG_CONTRACT } from '@/lib/outfit-helpers';

export interface SavedOutfitsPanelProps {
  readonly isAuthenticated: boolean;
  readonly authChecked: boolean;
  readonly scenes: ReadonlyArray<OutfitSceneDto>;
  readonly loadingScenes: boolean;
  readonly scenesError: string | null;
  readonly activeSceneId: string | null;
  readonly savingScene: boolean;
  readonly saveError: string | null;
  readonly deletingSceneId: string | null;
  readonly hasDraftItems: boolean;
  readonly loginRedirectHref: string;
  readonly onSaveOutfit: (title: string) => Promise<boolean>;
  readonly onLoadScene: (scene: OutfitSceneDto) => void;
  readonly onDeleteScene: (sceneId: string) => void;
  readonly onRetryLoad: () => void;
}

export function SavedOutfitsPanel({
  isAuthenticated,
  authChecked,
  scenes,
  loadingScenes,
  scenesError,
  activeSceneId,
  savingScene,
  saveError,
  deletingSceneId,
  hasDraftItems,
  loginRedirectHref,
  onSaveOutfit,
  onLoadScene,
  onDeleteScene,
  onRetryLoad,
}: SavedOutfitsPanelProps) {
  const [titleInput, setTitleInput] = useState('');
  const [guestPromptVisible, setGuestPromptVisible] = useState(false);

  const quotaReached =
    scenes.length >= OUTFIT_STUDIO_RIG_CONTRACT.MAX_SAVED_OUTFITS_PER_USER;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setGuestPromptVisible(true);
      return;
    }
    const trimmed = titleInput.trim();
    if (!trimmed) return;
    const saved = await onSaveOutfit(trimmed);
    if (saved) {
      setTitleInput('');
    }
  };

  return (
    <Surface
      variant="elevated"
      border="hairline"
      padding="md"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
        <div className="space-y-0.5">
          <h2 className="font-display text-2xl font-normal text-ink">
            Paduan Tersimpan
          </h2>
          <p className="text-xs text-ink-muted">
            Menyimpan konfigurasi ID produk dan varian saja. Harga selalu dihitung ulang dari server.
          </p>
        </div>
        {isAuthenticated ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-ink-muted">
              {scenes.length} / {OUTFIT_STUDIO_RIG_CONTRACT.MAX_SAVED_OUTFITS_PER_USER}
            </span>
            <Link
              href="/account/outfits"
              className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-link hover:underline"
            >
              Kelola di Akun
            </Link>
          </div>
        ) : null}
      </div>

      {!authChecked ? (
        <p className="text-xs text-ink-muted">Memeriksa status sesi akun...</p>
      ) : !isAuthenticated ? (
        <div className="space-y-3">
          <StatusBanner
            tone="info"
            title={
              guestPromptVisible
                ? 'Login Diperlukan untuk Menyimpan Paduan'
                : 'Mode Draf Tamu'
            }
            description="Masuk ke akun Anda untuk menyimpan paduan ini secara permanen. Draf saat ini tetap tersimpan pada tautan halaman."
            action={
              <Link
                href={loginRedirectHref}
                className={buttonClassName({ variant: 'primary', size: 'sm' })}
              >
                Masuk untuk Simpan
              </Link>
            }
          />
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={!hasDraftItems}
            onClick={() => setGuestPromptVisible(true)}
            className="min-h-11"
          >
            Simpan Paduan
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <FormField id="outfit-scene-title" label="Judul Paduan" required>
                <Input
                  id="outfit-scene-title"
                  value={titleInput}
                  maxLength={OUTFIT_STUDIO_RIG_CONTRACT.TITLE_MAX}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="Contoh: Setelan Monokrom Sore"
                  disabled={savingScene || quotaReached}
                />
              </FormField>
            </div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!hasDraftItems || !titleInput.trim() || quotaReached}
              isLoading={savingScene}
              loadingLabel="Menyimpan..."
              className="min-h-11 shrink-0"
            >
              Simpan Paduan
            </Button>
          </form>

          {quotaReached ? (
            <StatusBanner
              tone="warning"
              description="Batas 50 paduan tersimpan tercapai. Hapus salah satu paduan untuk menyimpan yang baru."
            />
          ) : null}

          {saveError ? (
            <StatusBanner tone="danger" title="Gagal Menyimpan Paduan" description={saveError} />
          ) : null}

          {loadingScenes ? (
            <p className="text-xs text-ink-muted" aria-busy="true">
              Memuat daftar paduan...
            </p>
          ) : scenesError ? (
            <StatusBanner
              tone="danger"
              description={scenesError}
              action={
                <Button type="button" variant="secondary" size="sm" onClick={onRetryLoad}>
                  Muat Ulang
                </Button>
              }
            />
          ) : scenes.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Belum ada paduan tersimpan pada akun Anda.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {scenes.map((scene) => {
                const isActive = activeSceneId === scene.id;
                return (
                  <li
                    key={scene.id}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'flex flex-col gap-3 rounded-[var(--radius-sm)] border p-3 sm:flex-row sm:items-center sm:justify-between',
                      isActive
                        ? 'border-2 border-strong-border bg-panel'
                        : 'border-hairline bg-canvas',
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{scene.title}</span>
                        {isActive ? <Badge tone="info">Sedang Dibuka</Badge> : null}
                        {scene.hasStaleItems ? (
                          <Badge tone="warning">Stok atau varian berubah</Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-ink-muted">
                        <span>{scene.slots.length} / 5 slot</span>
                        <span className="text-ink">{formatIDR(scene.liveTotalIdr)}</span>
                        <span>{formatWIB(scene.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onLoadScene(scene)}
                        className="min-h-11"
                      >
                        Muat
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        isLoading={deletingSceneId === scene.id}
                        loadingLabel="Menghapus"
                        onClick={() => onDeleteScene(scene.id)}
                        className="min-h-11"
                      >
                        Hapus
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Surface>
  );
}
