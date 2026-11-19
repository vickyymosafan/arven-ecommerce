'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { OutfitSceneDto } from '@arven/contracts';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LinkButton,
  LoadingState,
  StatusBanner,
  Surface,
  buttonClassName,
  formatIDR,
  formatWIB,
  useToast,
} from '@arven/ui';
import { AccountShell } from '@/components/account-shell';
import { ApiClientError, storefrontApi } from '@/lib/api-client';
import {
  OUTFIT_SLOT_LABELS,
  OUTFIT_STUDIO_RIG_CONTRACT,
  buildOutfitStudioHrefFromScene,
} from '@/lib/outfit-helpers';

export function SavedOutfitsView() {
  const router = useRouter();
  const { toast } = useToast();

  const [scenes, setScenes] = useState<OutfitSceneDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [savingRenameId, setSavingRenameId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    storefrontApi.outfitScenes
      .list()
      .then((list) => {
        if (!active) return;
        setScenes(list);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          router.replace('/auth/login?next=/account/outfits');
          return;
        }
        if (err instanceof ApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Gagal memuat daftar paduan pakaian tersimpan.' });
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
  }, [reloadNonce, router]);

  const startRename = (scene: OutfitSceneDto) => {
    setRenamingId(scene.id);
    setRenameTitle(scene.title);
    setActionError(null);
  };

  const handleRenameSubmit = async (
    event: FormEvent<HTMLFormElement>,
    sceneId: string,
  ) => {
    event.preventDefault();
    const trimmed = renameTitle.trim();
    if (!trimmed) return;
    setSavingRenameId(sceneId);
    setActionError(null);
    try {
      const updated = await storefrontApi.outfitScenes.update(sceneId, {
        title: trimmed,
      });
      setScenes((prev) => prev.map((s) => (s.id === sceneId ? updated : s)));
      setRenamingId(null);
      toast({
        tone: 'success',
        title: 'Nama Paduan Diperbarui',
        description: updated.title,
      });
    } catch (err) {
      setActionError(
        err instanceof ApiClientError
          ? err.message
          : 'Gagal mengubah nama paduan.',
      );
    } finally {
      setSavingRenameId(null);
    }
  };

  const handleDelete = async (scene: OutfitSceneDto) => {
    setDeletingId(scene.id);
    setActionError(null);
    try {
      await storefrontApi.outfitScenes.remove(scene.id);
      setScenes((prev) => prev.filter((s) => s.id !== scene.id));
      toast({
        tone: 'success',
        title: 'Paduan Dihapus',
        description: `${scene.title} telah dihapus dari akun Anda.`,
      });
    } catch (err) {
      setActionError(
        err instanceof ApiClientError
          ? err.message
          : 'Gagal menghapus paduan tersimpan.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AccountShell
      title="Saved Outfits"
      description="Daftar paduan pakaian 2D tersimpan dengan perhitungan harga IDR langsung dari server dan deteksi ketersediaan stok terkini."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            Kuota tersimpan:{' '}
            <span className="font-mono font-medium tabular-nums text-ink">
              {scenes.length} / {OUTFIT_STUDIO_RIG_CONTRACT.MAX_SAVED_OUTFITS_PER_USER}
            </span>
          </p>
          <Link
            href="/outfit-studio"
            className={buttonClassName({ variant: 'primary', size: 'md' })}
          >
            Buat Paduan Baru di Studio
          </Link>
        </div>

        {actionError ? (
          <StatusBanner
            tone="danger"
            title="Gagal Memperbarui Paduan"
            description={actionError}
          />
        ) : null}

        {loading ? (
          <div className="min-h-[28rem]">
            <LoadingState label="Memuat paduan pakaian tersimpan" rows={4} />
          </div>
        ) : loadError ? (
          <ErrorState
            title="Gagal memuat Saved Outfits"
            message={loadError.message}
            requestId={loadError.requestId}
            retryLabel="Muat Ulang"
            onRetry={retryLoad}
          />
        ) : scenes.length === 0 ? (
          <EmptyState
            title="Belum ada paduan tersimpan."
            description="Padukan atasan, bawahan, outerwear, alas kaki, dan aksesori pada Outfit Studio lalu simpan ke akun Anda."
            action={
              <LinkButton href="/outfit-studio" variant="primary" size="md">
                Buat Paduan di Outfit Studio
              </LinkButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {scenes.map((scene) => {
              const isRenaming = renamingId === scene.id;
              const studioHref = buildOutfitStudioHrefFromScene(scene);
              const primaryPoster =
                scene.slots.find((s) => s.posterUrl)?.posterUrl ??
                `/api/v1/outfit-studio/rigs/${encodeURIComponent(scene.rigId)}/poster`;

              return (
                <Surface
                  key={scene.id}
                  variant="elevated"
                  border="hairline"
                  padding="none"
                  className="flex flex-col justify-between overflow-hidden"
                >
                  <div>
                    <div className="relative aspect-[3/4] w-full overflow-hidden border-b border-hairline bg-subtle">
                      <img
                        src={primaryPoster}
                        alt={`Poster 2D paduan ${scene.title}`}
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-1.5">
                        <Badge tone="neutral">
                          <span className="font-mono tabular-nums">
                            {scene.slots.length} / 5 slot
                          </span>
                        </Badge>
                        {scene.hasStaleItems ? (
                          <Badge tone="warning">Stok atau varian berubah</Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4 p-4">
                      <div className="space-y-1">
                        {isRenaming ? (
                          <form
                            onSubmit={(e) => void handleRenameSubmit(e, scene.id)}
                            className="space-y-2"
                          >
                            <FormField
                              id={`rename-outfit-${scene.id}`}
                              label="Nama Baru Paduan"
                              required
                            >
                              <Input
                                id={`rename-outfit-${scene.id}`}
                                value={renameTitle}
                                maxLength={OUTFIT_STUDIO_RIG_CONTRACT.TITLE_MAX}
                                onChange={(e) => setRenameTitle(e.target.value)}
                              />
                            </FormField>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="submit"
                                variant="primary"
                                size="sm"
                                isLoading={savingRenameId === scene.id}
                                loadingLabel="Menyimpan"
                                className="min-h-11"
                              >
                                Simpan Nama
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setRenamingId(null)}
                                className="min-h-11"
                              >
                                Batal
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <h2 className="font-display text-2xl font-normal text-ink">
                              {scene.title}
                            </h2>
                            <p className="font-mono text-xs tabular-nums text-ink-muted">
                              Diperbarui {formatWIB(scene.updatedAt)}
                            </p>
                          </>
                        )}
                      </div>

                      <ul className="space-y-2 border-t border-hairline pt-3">
                        {scene.slots.map((slotItem) => (
                          <li
                            key={`${scene.id}-${slotItem.slot}`}
                            className="flex items-start justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <p className="font-medium text-ink">
                                {OUTFIT_SLOT_LABELS[slotItem.slot]}: {slotItem.productName}
                              </p>
                              <p className="text-ink-muted">
                                {[slotItem.color, slotItem.size, slotItem.presetLabel]
                                  .filter(Boolean)
                                  .join(' / ')}
                              </p>
                              {slotItem.stale ? (
                                <p className="text-warning-fg">
                                  Tidak aktif{slotItem.staleReasons.length > 0 ? `: ${slotItem.staleReasons.join(', ')}` : ''}
                                </p>
                              ) : !slotItem.inStock ? (
                                <p className="text-warning-fg">Stok saat ini habis</p>
                              ) : null}
                            </div>
                            <span className="shrink-0 font-mono font-medium tabular-nums text-ink">
                              {formatIDR(slotItem.unitPriceIdr)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-hairline bg-subtle p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                        Total Harga Terkini
                      </span>
                      <span className="font-mono text-base font-semibold tabular-nums text-ink">
                        {formatIDR(scene.liveTotalIdr)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={studioHref}
                        className={buttonClassName({
                          variant: 'primary',
                          size: 'sm',
                          fullWidth: false,
                        })}
                      >
                        Buka di Studio
                      </Link>
                      {!isRenaming ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => startRename(scene)}
                          className="min-h-11"
                        >
                          Ubah Nama
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        isLoading={deletingId === scene.id}
                        loadingLabel="Menghapus"
                        onClick={() => void handleDelete(scene)}
                        className="min-h-11"
                      >
                        Hapus
                      </Button>
                    </div>
                  </div>
                </Surface>
              );
            })}
          </div>
        )}
      </div>
    </AccountShell>
  );
}
