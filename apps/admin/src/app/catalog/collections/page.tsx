'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  AdminCollectionDto,
  AdminProductSummaryDto,
  CollectionStatusInput,
} from '@arven/contracts';
import { createCollectionRequestSchema, updateCollectionRequestSchema } from '@arven/validators';
import {
  Badge,
  Button,
  Checkbox,
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
} from '@arven/ui';
import { AdminShell } from '@/components/admin-shell';
import { AdminApiClientError, adminApi } from '@/lib/api-client';
import {
  buildStudioSvgDataUri,
  collectionStatusTone,
  slugifyCatalogTitle,
} from '@/lib/catalog-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

export default function AdminCatalogCollectionsPage() {
  const { toast } = useToast();
  const { user, loading: sessionLoading, error: sessionError, permissions, canAccess, reload } =
    useAdminSession();

  const canReadCatalog = canAccess(['product.read', 'product.write', 'product.publish']);
  const canWriteCatalog = Boolean(user?.roles.includes('OWNER') || permissions.has('product.write'));

  const [collections, setCollections] = useState<AdminCollectionDto[]>([]);
  const [products, setProducts] = useState<AdminProductSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminCollectionDto | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [status, setStatus] = useState<CollectionStatusInput>('DRAFT');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cols, prods] = await Promise.all([
        adminApi.listCollections(),
        adminApi.listProducts({ page: 1, limit: 100 }),
      ]);
      setCollections(cols);
      setProducts(prods.items);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: 'Unable to load collections.' });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading || !user || !canReadCatalog) {
      return;
    }

    let active = true;
    Promise.all([
      adminApi.listCollections(),
      adminApi.listProducts({ page: 1, limit: 100 }),
    ])
      .then(([cols, prods]) => {
        if (!active) return;
        setCollections(cols);
        setProducts(prods.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load collections.' });
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
  }, [canReadCatalog, sessionLoading, user]);

  const openCreateModal = () => {
    setEditTarget(null);
    setName('');
    setSlug('');
    setSlugTouched(false);
    setDescription('');
    setBannerUrl(buildStudioSvgDataUri('ARVEN CAPSULE', 'EDITORIAL RELEASE'));
    setStatus('DRAFT');
    setSelectedProductIds([]);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (col: AdminCollectionDto) => {
    setEditTarget(col);
    setName(col.name);
    setSlug(col.slug);
    setSlugTouched(true);
    setDescription(col.description ?? '');
    setBannerUrl(col.bannerUrl ?? '');
    setStatus(col.status);
    setSelectedProductIds(col.productIds);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveCollection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      bannerUrl: bannerUrl.trim() || null,
      status,
      productIds: selectedProductIds,
    };

    const validation = editTarget
      ? updateCollectionRequestSchema.safeParse(payload)
      : createCollectionRequestSchema.safeParse(payload);

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Invalid collection input.');
      return;
    }

    setSaving(true);
    try {
      if (editTarget) {
        await adminApi.updateCollection(editTarget.id, validation.data);
        toast({ tone: 'success', title: 'Collection updated' });
      } else {
        await adminApi.createCollection(
          validation.data as Parameters<typeof adminApi.createCollection>[0],
        );
        toast({ tone: 'success', title: 'Collection created' });
      }
      setModalOpen(false);
      await loadCollections();
    } catch (err) {
      setFormError(err instanceof AdminApiClientError ? err.message : 'Unable to save collection.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCollection = async (col: AdminCollectionDto) => {
    try {
      await adminApi.deleteCollection(col.id);
      toast({ tone: 'success', title: 'Collection archived', description: col.name });
      await loadCollections();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        toast({ tone: 'danger', title: 'Archive failed', description: err.message });
      }
    }
  };

  return (
    <AdminShell
      title="Capsule Collections"
      description="Curate editorial capsules, release schedules, hero banners, and ordered product assignments."
      user={user}
      actions={
        canReadCatalog && canWriteCatalog ? (
          <Button type="button" variant="primary" size="md" onClick={openCreateModal}>
            New Collection
          </Button>
        ) : undefined
      }
    >
      {sessionLoading ? (
        <LoadingState label="Verifying catalog access" rows={4} />
      ) : sessionError ? (
        <ErrorState
          title="Unable to verify staff session"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reload()}
        />
      ) : !canReadCatalog ? (
        <StatusBanner
          tone="danger"
          title="403 Forbidden: Catalog Read Permission Required"
          description="Your assigned role does not grant product.read access."
        />
      ) : loading ? (
        <LoadingState label="Loading curated collections" rows={4} />
      ) : error ? (
        <ErrorState
          title="Unable to load collections"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void loadCollections()}
        />
      ) : collections.length === 0 ? (
        <EmptyState
          title="No collections configured"
          description="Create editorial capsules to organize published garments on the storefront."
          action={
            canWriteCatalog ? (
              <Button type="button" variant="primary" size="md" onClick={openCreateModal}>
                Create Collection
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {collections.map((col) => (
            <Surface
              key={col.id}
              variant="elevated"
              border="hairline"
              padding="md"
              className="flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                {col.bannerUrl ? (
                  <div className="aspect-[5/2] overflow-hidden border border-hairline bg-panel">
                    <img
                      src={col.bannerUrl}
                      alt={`${col.name} capsule banner`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={collectionStatusTone(col.status)}>{col.status}</Badge>
                  <span className="font-mono text-xs tabular-nums text-ink-muted">
                    {col.productCount} {col.productCount === 1 ? 'Product' : 'Products'}
                  </span>
                </div>
                <div className="space-y-1">
                  <h2 className="font-display text-2xl font-normal text-ink">{col.name}</h2>
                  <p className="font-mono text-xs text-ink-muted">{col.slug}</p>
                </div>
                {col.description ? (
                  <p className="text-xs leading-relaxed text-ink-secondary">{col.description}</p>
                ) : null}
                <p className="font-mono text-xs text-ink-muted">
                  Updated {formatWIB(col.updatedAt)}
                </p>
              </div>

              {canWriteCatalog ? (
                <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
                  <Button type="button" variant="secondary" size="sm" onClick={() => openEditModal(col)}>
                    Edit &amp; Curate
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void handleDeleteCollection(col)}
                  >
                    Archive
                  </Button>
                </div>
              ) : null}
            </Surface>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? `Edit Collection: ${editTarget.name}` : 'Create Capsule Collection'}
        description="Configure capsule status, editorial banner artwork, and assigned catalog products."
        size="lg"
      >
        <form onSubmit={handleSaveCollection} className="space-y-4">
          {formError ? <StatusBanner tone="danger" description={formError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="col-name" label="Collection Name" required>
              <Input
                id="col-name"
                value={name}
                onChange={(e) => {
                  const val = e.target.value;
                  setName(val);
                  if (!slugTouched) {
                    setSlug(slugifyCatalogTitle(val));
                  }
                }}
              />
            </FormField>
            <FormField id="col-slug" label="URL Slug" required>
              <Input
                id="col-slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
              />
            </FormField>
          </div>
          <FormField id="col-desc" label="Description">
            <Textarea id="col-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField id="col-status" label="Publication Status">
            <Select
              id="col-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as CollectionStatusInput)}
            >
              <option value="DRAFT">DRAFT</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </Select>
          </FormField>
          <FormField id="col-banner" label="Banner URL or Studio SVG Data URI">
            <Textarea id="col-banner" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} />
          </FormField>

          {products.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
                Curated Garments ({selectedProductIds.length} selected)
              </p>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3">
                {products.map((prod) => (
                  <Checkbox
                    key={prod.id}
                    id={`col-prod-${prod.id}`}
                    label={`${prod.name} (${prod.status})`}
                    checked={selectedProductIds.includes(prod.id)}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedProductIds((prev) => [...prev, prod.id]);
                      } else {
                        setSelectedProductIds((prev) => prev.filter((id) => id !== prod.id));
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="md" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={saving}>
              {editTarget ? 'Save Collection' : 'Create Collection'}
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
