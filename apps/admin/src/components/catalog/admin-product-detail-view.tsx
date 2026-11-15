'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AdminCategoryDto,
  AdminCollectionDto,
  AdminProductDetailDto,
  AdminProductVariantDto,
  MediaTypeInput,
  ProductMediaDto,
  ProductStatusInput,
} from '@arven/contracts';
import {
  createProductMediaRequestSchema,
  createProductVariantRequestSchema,
  updateProductRequestSchema,
  updateProductVariantRequestSchema,
} from '@arven/validators';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Divider,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LinkButton,
  LoadingState,
  Modal,
  Select,
  StatusBanner,
  Surface,
  Textarea,
  formatIDR,
  formatWIB,
  useToast,
  type DataTableColumn,
} from '@arven/ui';
import { AdminShell } from '@/components/admin-shell';
import { AdminApiClientError, adminApi } from '@/lib/api-client';
import {
  buildStudioSvgDataUri,
  productStatusTone,
  stockStatusTone,
} from '@/lib/catalog-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

const NEXT_TRANSITIONS: Record<
  ProductStatusInput,
  Array<{ target: ProductStatusInput; label: string; variant: 'primary' | 'secondary' | 'danger' }>
> = {
  DRAFT: [
    { target: 'REVIEW', label: 'Submit for Review', variant: 'secondary' },
    { target: 'READY_TO_PUBLISH', label: 'Mark Ready to Publish', variant: 'primary' },
  ],
  REVIEW: [
    { target: 'READY_TO_PUBLISH', label: 'Mark Ready to Publish', variant: 'primary' },
    { target: 'DRAFT', label: 'Return to Draft', variant: 'secondary' },
  ],
  READY_TO_PUBLISH: [
    { target: 'PUBLISHED', label: 'Publish Product', variant: 'primary' },
    { target: 'REVIEW', label: 'Return to Review', variant: 'secondary' },
  ],
  PUBLISHED: [
    { target: 'ARCHIVED', label: 'Archive Product', variant: 'danger' },
  ],
  ARCHIVED: [
    { target: 'DRAFT', label: 'Restore to Draft', variant: 'secondary' },
  ],
};

export function AdminProductDetailView({ productId }: { productId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: sessionLoading, error: sessionError, permissions, canAccess, reload } =
    useAdminSession();

  const canReadCatalog = canAccess(['product.read', 'product.write', 'product.publish']);
  const canWriteCatalog = Boolean(user?.roles.includes('OWNER') || permissions.has('product.write'));
  const canPublishCatalog = Boolean(
    user?.roles.includes('OWNER') || permissions.has('product.publish'),
  );

  const [product, setProduct] = useState<AdminProductDetailDto | null>(null);
  const [categories, setCategories] = useState<AdminCategoryDto[]>([]);
  const [collections, setCollections] = useState<AdminCollectionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);

  // Metadata form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState('');
  const [fit, setFit] = useState('');
  const [careInstruction, setCareInstruction] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [savingMeta, setSavingMeta] = useState(false);

  // Transition feedback
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<{
    message: string;
    details: Array<{ field: string; issue: string }>;
  } | null>(null);

  // Variant modals
  const [addVariantOpen, setAddVariantOpen] = useState(false);
  const [vSku, setVSku] = useState('');
  const [vSize, setVSize] = useState('M');
  const [vColor, setVColor] = useState('Charcoal');
  const [vColorHex, setVColorHex] = useState('#17191B');
  const [vPriceIdr, setVPriceIdr] = useState('399000');
  const [vCompareAt, setVCompareAt] = useState('');
  const [vWeightGrams, setVWeightGrams] = useState('350');
  const [vInitialStock, setVInitialStock] = useState('10');
  const [variantError, setVariantError] = useState<string | null>(null);
  const [savingVariant, setSavingVariant] = useState(false);

  const [editVariantTarget, setEditVariantTarget] = useState<AdminProductVariantDto | null>(null);
  const [evPriceIdr, setEvPriceIdr] = useState('');
  const [evCompareAt, setEvCompareAt] = useState('');
  const [evWeightGrams, setEvWeightGrams] = useState('');
  const [evIsActive, setEvIsActive] = useState(true);
  const [evError, setEvError] = useState<string | null>(null);
  const [evSaving, setEvSaving] = useState(false);

  // Media modal
  const [addMediaOpen, setAddMediaOpen] = useState(false);
  const [mType, setMType] = useState<MediaTypeInput>('IMAGE');
  const [mUrl, setMUrl] = useState('');
  const [mAlt, setMAlt] = useState('');
  const [mPosition, setMPosition] = useState('0');
  const [mIsPrimary, setMIsPrimary] = useState(true);
  const [mError, setMError] = useState<string | null>(null);
  const [mSaving, setMSaving] = useState(false);

  // Archive / soft delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const syncForm = useCallback((detail: AdminProductDetailDto) => {
    setProduct(detail);
    setName(detail.name);
    setSlug(detail.slug);
    setDescription(detail.description);
    setMaterial(detail.material);
    setFit(detail.fit);
    setCareInstruction(detail.careInstruction);
    setSeoTitle(detail.seoTitle ?? '');
    setSeoDescription(detail.seoDescription ?? '');
    setIsVisible(detail.isVisible);
    setIsFeatured(detail.isFeatured);
    const primaryCat = detail.categories.find((c) => c.isPrimary) ?? detail.categories[0];
    setSelectedCategoryId(primaryCat?.id ?? '');
    setSelectedCollectionIds(detail.collections.map((c) => c.id));
  }, []);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, cats, cols] = await Promise.all([
        adminApi.getProductById(productId),
        adminApi.listCategories(),
        adminApi.listCollections(),
      ]);
      syncForm(detail);
      setCategories(cats);
      setCollections(cols);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: 'Unable to load product specification.' });
      }
    } finally {
      setLoading(false);
    }
  }, [productId, syncForm]);

  useEffect(() => {
    if (sessionLoading || !user || !canReadCatalog) {
      return;
    }

    let active = true;
    Promise.all([
      adminApi.getProductById(productId),
      adminApi.listCategories(),
      adminApi.listCollections(),
    ])
      .then(([detail, cats, cols]) => {
        if (!active) return;
        syncForm(detail);
        setCategories(cats);
        setCollections(cols);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load product specification.' });
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
  }, [canReadCatalog, productId, sessionLoading, syncForm, user]);

  const handleSaveMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = updateProductRequestSchema.safeParse({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim(),
      material: material.trim(),
      fit: fit.trim(),
      careInstruction: careInstruction.trim(),
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
      isVisible,
      isFeatured,
      categoryIds: selectedCategoryId ? [selectedCategoryId] : [],
      primaryCategoryId: selectedCategoryId || null,
      collectionIds: selectedCollectionIds,
    });

    if (!parsed.success) {
      toast({
        tone: 'danger',
        title: 'Validation error',
        description: parsed.error.issues[0]?.message ?? 'Check product fields.',
      });
      return;
    }

    setSavingMeta(true);
    setTransitionError(null);
    try {
      const updated = await adminApi.updateProduct(productId, parsed.data);
      syncForm(updated);
      toast({
        tone: 'success',
        title: 'Product metadata updated',
        description: `${updated.name} saved and audited.`,
      });
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        toast({ tone: 'danger', title: 'Update failed', description: err.message });
      }
    } finally {
      setSavingMeta(false);
    }
  };

  const handleTransition = async (targetStatus: ProductStatusInput) => {
    setTransitioning(true);
    setTransitionError(null);
    try {
      const updated = await adminApi.transitionProductStatus(productId, {
        targetStatus,
      });
      syncForm(updated);
      toast({
        tone: 'success',
        title: `Status updated to ${updated.status}`,
        description:
          updated.status === 'PUBLISHED'
            ? 'Outbox product.published event emitted and live on storefront.'
            : `${updated.name} transitioned cleanly.`,
      });
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setTransitionError({
          message: err.message,
          details: err.details,
        });
        toast({
          tone: 'danger',
          title: err.code === 'PUBLISH_GATE_UNMET' ? 'Publish Gate Unmet (422)' : 'Transition blocked',
          description: err.message,
        });
      }
    } finally {
      setTransitioning(false);
    }
  };

  const handleCreateVariant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVariantError(null);

    const priceNum = Number.parseInt(vPriceIdr.trim(), 10);
    const compareNum = vCompareAt.trim() ? Number.parseInt(vCompareAt.trim(), 10) : null;
    const weightNum = Number.parseInt(vWeightGrams.trim(), 10);
    const stockNum = Number.parseInt(vInitialStock.trim() || '0', 10);

    const parsed = createProductVariantRequestSchema.safeParse({
      sku: vSku.trim().toUpperCase(),
      size: vSize.trim(),
      color: vColor.trim(),
      colorHex: vColorHex.trim() || null,
      priceIdr: priceNum,
      compareAtPriceIdr: compareNum,
      weightGrams: weightNum,
      initialStock: stockNum,
      isActive: true,
    });

    if (!parsed.success) {
      setVariantError(parsed.error.issues[0]?.message ?? 'Invalid variant fields.');
      return;
    }

    setSavingVariant(true);
    try {
      const created = await adminApi.createVariant(productId, parsed.data);
      toast({
        tone: 'success',
        title: 'Variant created',
        description: `${created.sku} initialized with ${created.quantityOnHand} units on JKT-MAIN-01.`,
      });
      setAddVariantOpen(false);
      await loadDetail();
    } catch (err) {
      setVariantError(err instanceof AdminApiClientError ? err.message : 'Unable to create variant.');
    } finally {
      setSavingVariant(false);
    }
  };

  const openEditVariant = (variant: AdminProductVariantDto) => {
    setEditVariantTarget(variant);
    setEvPriceIdr(String(variant.priceIdr));
    setEvCompareAt(variant.compareAtPriceIdr !== null ? String(variant.compareAtPriceIdr) : '');
    setEvWeightGrams(String(variant.weightGrams));
    setEvIsActive(variant.isActive);
    setEvError(null);
  };

  const handleUpdateVariant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editVariantTarget) return;
    setEvError(null);

    const parsed = updateProductVariantRequestSchema.safeParse({
      priceIdr: Number.parseInt(evPriceIdr.trim(), 10),
      compareAtPriceIdr: evCompareAt.trim() ? Number.parseInt(evCompareAt.trim(), 10) : null,
      weightGrams: Number.parseInt(evWeightGrams.trim(), 10),
      isActive: evIsActive,
    });

    if (!parsed.success) {
      setEvError(parsed.error.issues[0]?.message ?? 'Invalid variant update values.');
      return;
    }

    setEvSaving(true);
    try {
      const updated = await adminApi.updateVariant(productId, editVariantTarget.id, parsed.data);
      toast({
        tone: 'success',
        title: 'Variant updated',
        description: `${updated.sku} saved (${formatIDR(updated.priceIdr)}; price updates logged to audit_logs).`,
      });
      setEditVariantTarget(null);
      await loadDetail();
    } catch (err) {
      setEvError(err instanceof AdminApiClientError ? err.message : 'Unable to update variant.');
    } finally {
      setEvSaving(false);
    }
  };

  const handleDeleteVariant = async (variant: AdminProductVariantDto) => {
    try {
      await adminApi.deleteVariant(productId, variant.id);
      toast({
        tone: 'success',
        title: 'Variant soft-deleted',
        description: `${variant.sku} deactivated.`,
      });
      await loadDetail();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        toast({ tone: 'danger', title: 'Delete failed', description: err.message });
      }
    }
  };

  const handleCreateMedia = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMError(null);

    const parsed = createProductMediaRequestSchema.safeParse({
      type: mType,
      url: mUrl.trim(),
      altText: mAlt.trim(),
      position: Number.parseInt(mPosition.trim() || '0', 10),
      isPrimary: mIsPrimary,
      width: 900,
      height: 1200,
    });

    if (!parsed.success) {
      setMError(parsed.error.issues[0]?.message ?? 'Invalid media input.');
      return;
    }

    setMSaving(true);
    try {
      await adminApi.createMedia(productId, parsed.data);
      toast({
        tone: 'success',
        title: 'Media added',
        description: 'Garment gallery asset saved.',
      });
      setAddMediaOpen(false);
      await loadDetail();
    } catch (err) {
      setMError(err instanceof AdminApiClientError ? err.message : 'Unable to attach media.');
    } finally {
      setMSaving(false);
    }
  };

  const handleSetPrimaryMedia = async (media: ProductMediaDto) => {
    try {
      await adminApi.updateMedia(productId, media.id, { isPrimary: true });
      toast({ tone: 'success', title: 'Primary image updated' });
      await loadDetail();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        toast({ tone: 'danger', title: 'Media update failed', description: err.message });
      }
    }
  };

  const handleDeleteMedia = async (media: ProductMediaDto) => {
    try {
      await adminApi.deleteMedia(productId, media.id);
      toast({ tone: 'success', title: 'Media removed' });
      await loadDetail();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        toast({ tone: 'danger', title: 'Media delete failed', description: err.message });
      }
    }
  };

  const handleSoftDeleteProduct = async () => {
    setDeleting(true);
    try {
      await adminApi.deleteProduct(productId);
      toast({
        tone: 'success',
        title: 'Product soft-deleted',
        description: 'Product archived and hidden from storefront.',
      });
      router.replace('/catalog/products');
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        toast({ tone: 'danger', title: 'Delete failed', description: err.message });
      }
    } finally {
      setDeleting(false);
    }
  };

  const variantColumns: DataTableColumn<AdminProductVariantDto>[] = [
    {
      key: 'sku',
      header: 'SKU',
      render: (v) => <code className="font-mono text-xs font-medium text-ink">{v.sku}</code>,
    },
    {
      key: 'spec',
      header: 'Size / Color',
      render: (v) => (
        <div className="flex items-center gap-2 text-xs text-ink">
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 rounded-full border border-control-border"
            style={{ backgroundColor: v.colorHex || '#17191B' }}
          />
          <span>
            {v.size} / {v.color}
          </span>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price (IDR)',
      render: (v) => (
        <div className="space-y-0.5 font-mono text-xs tabular-nums">
          <p className="font-medium text-ink">{formatIDR(v.priceIdr)}</p>
          {v.compareAtPriceIdr ? (
            <p className="text-ink-muted line-through">{formatIDR(v.compareAtPriceIdr)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock (On Hand / Res / Avail)',
      render: (v) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-ink">
            {v.quantityOnHand} / {v.quantityReserved} / {v.availableQty}
          </span>
          <Badge tone={stockStatusTone(v.stockStatus)}>{v.stockStatus}</Badge>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (v) =>
        canWriteCatalog ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => openEditVariant(v)}>
              Edit / Price
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => void handleDeleteVariant(v)}
            >
              Remove
            </Button>
          </div>
        ) : (
          <span className="text-xs text-ink-muted">Read only</span>
        ),
    },
  ];

  const availableTransitions = product ? NEXT_TRANSITIONS[product.status] ?? [] : [];

  return (
    <AdminShell
      title={product ? product.name : 'Product Specification'}
      description="Inspect Publish Gate readiness, transition product lifecycle, manage audited variant pricing, and curate studio media."
      user={user}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/catalog/products" variant="secondary" size="sm">
            Back to Products
          </LinkButton>
          {product && canWriteCatalog ? (
            <Button type="button" variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              Soft Delete
            </Button>
          ) : null}
        </div>
      }
    >
      {sessionLoading ? (
        <LoadingState label="Verifying catalog access" rows={5} />
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
        <LoadingState label="Loading product editorial workbench" rows={6} />
      ) : error || !product ? (
        <ErrorState
          title="Unable to load product"
          message={error?.message ?? 'Product not found.'}
          requestId={error?.requestId}
          onRetry={() => void loadDetail()}
        />
      ) : (
        <div className="space-y-8">
          {/* Publish Gate & Lifecycle Panel */}
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={productStatusTone(product.status)}>{product.status}</Badge>
                  <Badge tone={product.publishGate.canPublish ? 'success' : 'warning'}>
                    {product.publishGate.canPublish
                      ? 'Publish Gate Passed'
                      : `${product.publishGate.unmetCount} Gate Issue(s)`}
                  </Badge>
                </div>
                <h2 className="font-display text-2xl font-normal text-ink">
                  Publish Gate &amp; State Machine
                </h2>
                <p className="text-xs text-ink-muted">
                  Published timestamp: {formatWIB(product.publishedAt)} | Updated:{' '}
                  {formatWIB(product.updatedAt)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {availableTransitions.map((action) => (
                  <Button
                    key={action.target}
                    type="button"
                    variant={action.variant}
                    size="sm"
                    disabled={!canPublishCatalog || transitioning}
                    isLoading={transitioning}
                    onClick={() => void handleTransition(action.target)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>

            {!canPublishCatalog ? (
              <StatusBanner
                tone="info"
                description="Your session lacks product.publish permission. Lifecycle state transitions require Catalog Publish authorization."
              />
            ) : null}

            {transitionError ? (
              <StatusBanner
                tone="danger"
                title="Lifecycle transition blocked"
                description={
                  transitionError.details.length > 0
                    ? `${transitionError.message} (${transitionError.details.map((d) => `${d.field}: ${d.issue}`).join(' | ')})`
                    : transitionError.message
                }
              />
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              {product.publishGate.checks.map((check) => (
                <div
                  key={check.key}
                  className="space-y-2 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{check.label}</span>
                    <Badge tone={check.passed ? 'success' : 'warning'}>
                      {check.passed ? 'PASS' : 'UNMET'}
                    </Badge>
                  </div>
                  {check.issues.length > 0 ? (
                    <ul className="space-y-1 text-xs text-danger-fg">
                      {check.issues.map((issue, idx) => (
                        <li key={`${issue.field}-${idx}`}>
                          <code className="font-mono">{issue.field}</code>: {issue.issue}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-ink-muted">All required criteria satisfied.</p>
                  )}
                </div>
              ))}
            </div>
          </Surface>

          {/* Metadata & SEO Form */}
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-5">
            <h2 className="font-display text-2xl font-normal text-ink">
              Garment Metadata, Taxonomy &amp; SEO
            </h2>
            <Divider />

            <form onSubmit={handleSaveMetadata} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="edit-prod-name" label="Product Name" required>
                  <Input
                    id="edit-prod-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={!canWriteCatalog}
                  />
                </FormField>
                <FormField id="edit-prod-slug" label="URL Slug" required>
                  <Input
                    id="edit-prod-slug"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    disabled={!canWriteCatalog}
                  />
                </FormField>
              </div>

              <FormField id="edit-prod-desc" label="Description">
                <Textarea
                  id="edit-prod-desc"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={!canWriteCatalog}
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField id="edit-prod-material" label="Material">
                  <Input
                    id="edit-prod-material"
                    value={material}
                    onChange={(event) => setMaterial(event.target.value)}
                    disabled={!canWriteCatalog}
                  />
                </FormField>
                <FormField id="edit-prod-fit" label="Fit">
                  <Input
                    id="edit-prod-fit"
                    value={fit}
                    onChange={(event) => setFit(event.target.value)}
                    disabled={!canWriteCatalog}
                  />
                </FormField>
                <FormField id="edit-prod-care" label="Care Instructions">
                  <Input
                    id="edit-prod-care"
                    value={careInstruction}
                    onChange={(event) => setCareInstruction(event.target.value)}
                    disabled={!canWriteCatalog}
                  />
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="edit-prod-seotitle" label="SEO Title">
                  <Input
                    id="edit-prod-seotitle"
                    value={seoTitle}
                    onChange={(event) => setSeoTitle(event.target.value)}
                    disabled={!canWriteCatalog}
                  />
                </FormField>
                <FormField id="edit-prod-seodesc" label="SEO Description">
                  <Input
                    id="edit-prod-seodesc"
                    value={seoDescription}
                    onChange={(event) => setSeoDescription(event.target.value)}
                    disabled={!canWriteCatalog}
                  />
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="edit-prod-category" label="Primary Category">
                  <Select
                    id="edit-prod-category"
                    value={selectedCategoryId}
                    onChange={(event) => setSelectedCategoryId(event.target.value)}
                    disabled={!canWriteCatalog}
                  >
                    <option value="">Unassigned</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <div className="flex flex-wrap items-center gap-5 pt-6">
                  <Checkbox
                    id="edit-prod-visible"
                    label="Visible on Storefront"
                    checked={isVisible}
                    disabled={!canWriteCatalog}
                    onChange={(event) => setIsVisible(event.target.checked)}
                  />
                  <Checkbox
                    id="edit-prod-featured"
                    label="Featured Release"
                    checked={isFeatured}
                    disabled={!canWriteCatalog}
                    onChange={(event) => setIsFeatured(event.target.checked)}
                  />
                </div>
              </div>

              {collections.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
                    Collection Membership
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {collections.map((col) => (
                      <Checkbox
                        key={col.id}
                        id={`edit-col-${col.id}`}
                        label={col.name}
                        checked={selectedCollectionIds.includes(col.id)}
                        disabled={!canWriteCatalog}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedCollectionIds((prev) => [...prev, col.id]);
                          } else {
                            setSelectedCollectionIds((prev) => prev.filter((id) => id !== col.id));
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {canWriteCatalog ? (
                <div className="flex justify-end pt-2">
                  <Button type="submit" variant="primary" size="md" isLoading={savingMeta} loadingLabel="Saving">
                    Save Product Metadata
                  </Button>
                </div>
              ) : null}
            </form>
          </Surface>

          {/* Variants & Price Audit Manager */}
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-normal text-ink">
                  Variants &amp; Audited Pricing ({product.variants.length})
                </h2>
                <p className="text-xs text-ink-muted">
                  All price changes record actor, timestamp, old value, and new value into immutable audit logs.
                </p>
              </div>
              {canWriteCatalog ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setVSku('');
                    setVariantError(null);
                    setAddVariantOpen(true);
                  }}
                >
                  Add Variant
                </Button>
              ) : null}
            </div>

            {product.variants.length === 0 ? (
              <EmptyState
                title="No active variants"
                description="Add at least one SKU variant with initial inventory to satisfy the Publish Gate."
              />
            ) : (
              <DataTable
                caption="Product SKU variants"
                columns={variantColumns}
                rows={product.variants}
                getRowKey={(v) => v.id}
              />
            )}
          </Surface>

          {/* Media Gallery Manager */}
          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-normal text-ink">
                  Studio Media Gallery ({product.media.length})
                </h2>
                <p className="text-xs text-ink-muted">
                  At least one primary image with accessible alt text is required to publish.
                </p>
              </div>
              {canWriteCatalog ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setMUrl(buildStudioSvgDataUri(product.name, `POS ${product.media.length}`));
                    setMAlt(`${product.name} studio detail view`);
                    setMPosition(String(product.media.length));
                    setMIsPrimary(product.media.length === 0);
                    setMError(null);
                    setAddMediaOpen(true);
                  }}
                >
                  Attach Media
                </Button>
              ) : null}
            </div>

            {product.media.length === 0 ? (
              <EmptyState
                title="No media assets attached"
                description="Attach primary editorial garment imagery or studio SVG plates."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {product.media.map((media) => (
                  <Surface
                    key={media.id}
                    variant="subtle"
                    border="hairline"
                    padding="sm"
                    className="space-y-3"
                  >
                    <div className="aspect-[3/4] overflow-hidden border border-hairline bg-panel">
                      <img
                        src={media.url}
                        alt={media.altText}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">{media.type}</Badge>
                        {media.isPrimary ? <Badge tone="success">Primary</Badge> : null}
                      </div>
                      <span className="font-mono text-xs text-ink-muted">Pos {media.position}</span>
                    </div>
                    <p className="text-xs text-ink-secondary">{media.altText}</p>
                    {canWriteCatalog ? (
                      <div className="flex flex-wrap gap-2">
                        {!media.isPrimary ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleSetPrimaryMedia(media)}
                          >
                            Set Primary
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => void handleDeleteMedia(media)}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </Surface>
                ))}
              </div>
            )}
          </Surface>
        </div>
      )}

      {/* Add Variant Modal */}
      <Modal
        isOpen={addVariantOpen}
        onClose={() => setAddVariantOpen(false)}
        title="Add SKU Variant"
        description="Creates an active variant and initializes warehouse inventory on JKT-MAIN-01."
      >
        <form onSubmit={handleCreateVariant} className="space-y-4">
          {variantError ? <StatusBanner tone="danger" description={variantError} /> : null}
          <FormField id="new-var-sku" label="SKU" required>
            <Input
              id="new-var-sku"
              value={vSku}
              onChange={(event) => setVSku(event.target.value)}
              placeholder="ARV-OUT-099-M-BLK"
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="new-var-size" label="Size" required>
              <Input id="new-var-size" value={vSize} onChange={(e) => setVSize(e.target.value)} />
            </FormField>
            <FormField id="new-var-color" label="Color" required>
              <Input id="new-var-color" value={vColor} onChange={(e) => setVColor(e.target.value)} />
            </FormField>
            <FormField id="new-var-hex" label="Color Hex">
              <Input
                id="new-var-hex"
                value={vColorHex}
                onChange={(e) => setVColorHex(e.target.value)}
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="new-var-price" label="Price (IDR Integer)" required>
              <Input
                id="new-var-price"
                inputMode="numeric"
                value={vPriceIdr}
                onChange={(e) => setVPriceIdr(e.target.value)}
              />
            </FormField>
            <FormField id="new-var-compare" label="Compare-At Price (Optional)">
              <Input
                id="new-var-compare"
                inputMode="numeric"
                value={vCompareAt}
                onChange={(e) => setVCompareAt(e.target.value)}
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="new-var-weight" label="Weight (Grams)" required>
              <Input
                id="new-var-weight"
                inputMode="numeric"
                value={vWeightGrams}
                onChange={(e) => setVWeightGrams(e.target.value)}
              />
            </FormField>
            <FormField id="new-var-stock" label="Initial Stock (JKT-MAIN-01)">
              <Input
                id="new-var-stock"
                inputMode="numeric"
                value={vInitialStock}
                onChange={(e) => setVInitialStock(e.target.value)}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="md" onClick={() => setAddVariantOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={savingVariant}>
              Create Variant
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Variant Modal */}
      <Modal
        isOpen={Boolean(editVariantTarget)}
        onClose={() => setEditVariantTarget(null)}
        title={`Edit Variant: ${editVariantTarget?.sku ?? ''}`}
        description="Modifying priceIdr or compareAtPriceIdr records an explicit before/after entry in audit_logs."
      >
        <form onSubmit={handleUpdateVariant} className="space-y-4">
          {evError ? <StatusBanner tone="danger" description={evError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="edit-var-price" label="Price (IDR Integer)" required>
              <Input
                id="edit-var-price"
                inputMode="numeric"
                value={evPriceIdr}
                onChange={(e) => setEvPriceIdr(e.target.value)}
              />
            </FormField>
            <FormField id="edit-var-compare" label="Compare-At Price (Optional)">
              <Input
                id="edit-var-compare"
                inputMode="numeric"
                value={evCompareAt}
                onChange={(e) => setEvCompareAt(e.target.value)}
              />
            </FormField>
          </div>
          <FormField id="edit-var-weight" label="Weight (Grams)" required>
            <Input
              id="edit-var-weight"
              inputMode="numeric"
              value={evWeightGrams}
              onChange={(e) => setEvWeightGrams(e.target.value)}
            />
          </FormField>
          <Checkbox
            id="edit-var-active"
            label="Variant Active"
            checked={evIsActive}
            onChange={(e) => setEvIsActive(e.target.checked)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="md" onClick={() => setEditVariantTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={evSaving}>
              Save Variant Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Media Modal */}
      <Modal
        isOpen={addMediaOpen}
        onClose={() => setAddMediaOpen(false)}
        title="Attach Studio Media"
        description="Provide an accessible altText description and local/SVG asset URI."
      >
        <form onSubmit={handleCreateMedia} className="space-y-4">
          {mError ? <StatusBanner tone="danger" description={mError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="new-media-type" label="Media Type">
              <Select
                id="new-media-type"
                value={mType}
                onChange={(e) => setMType(e.target.value as MediaTypeInput)}
              >
                <option value="IMAGE">IMAGE</option>
                <option value="SWATCH">SWATCH</option>
                <option value="POSTER">POSTER</option>
              </Select>
            </FormField>
            <FormField id="new-media-pos" label="Gallery Position">
              <Input
                id="new-media-pos"
                inputMode="numeric"
                value={mPosition}
                onChange={(e) => setMPosition(e.target.value)}
              />
            </FormField>
          </div>
          <FormField id="new-media-alt" label="Accessible Alt Text" required>
            <Input id="new-media-alt" value={mAlt} onChange={(e) => setMAlt(e.target.value)} />
          </FormField>
          <FormField id="new-media-url" label="Media URL or Studio SVG Data URI" required>
            <Textarea id="new-media-url" value={mUrl} onChange={(e) => setMUrl(e.target.value)} />
          </FormField>
          <Checkbox
            id="new-media-primary"
            label="Set as primary gallery image"
            checked={mIsPrimary}
            onChange={(e) => setMIsPrimary(e.target.checked)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="md" onClick={() => setAddMediaOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={mSaving}>
              Attach Media
            </Button>
          </div>
        </form>
      </Modal>

      {/* Soft Delete Modal */}
      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Confirm Product Soft Delete"
        description={`Soft deleting "${product?.name ?? ''}" sets deletedAt, disables visibility, and transitions status to ARCHIVED.`}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="md" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="md"
            isLoading={deleting}
            onClick={() => void handleSoftDeleteProduct()}
          >
            Confirm Soft Delete
          </Button>
        </div>
      </Modal>
    </AdminShell>
  );
}
