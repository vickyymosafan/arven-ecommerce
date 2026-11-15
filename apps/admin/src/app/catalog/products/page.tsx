'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  AdminCategoryDto,
  AdminCollectionDto,
  AdminProductSummaryDto,
  ProductStatusInput,
} from '@arven/contracts';
import { createProductRequestSchema } from '@arven/validators';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
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
import { AdminApiClientError, adminApi, extractAdminFieldErrors, type PaginationMeta } from '@/lib/api-client';
import { productStatusTone, slugifyCatalogTitle } from '@/lib/catalog-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

interface ProductFilterState {
  page: number;
  q: string;
  status: string;
  category: string;
}

export default function AdminCatalogProductsPage() {
  const { toast } = useToast();
  const { user, loading: sessionLoading, error: sessionError, permissions, canAccess, reload } =
    useAdminSession();

  const canReadCatalog = canAccess(['product.read', 'product.write', 'product.publish']);
  const canWriteCatalog = Boolean(user?.roles.includes('OWNER') || permissions.has('product.write'));

  const [draftQuery, setDraftQuery] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [filters, setFilters] = useState<ProductFilterState>({
    page: 1,
    q: '',
    status: '',
    category: '',
  });

  const [products, setProducts] = useState<AdminProductSummaryDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    requestId: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [categories, setCategories] = useState<AdminCategoryDto[]>([]);
  const [collections, setCollections] = useState<AdminCollectionDto[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  // Create Product Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newMaterial, setNewMaterial] = useState('');
  const [newFit, setNewFit] = useState('');
  const [newCare, setNewCare] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadCatalogProducts = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const [productsResult, categoriesResult, collectionsResult] = await Promise.all([
        adminApi.listProducts({
          page: filters.page,
          limit: 20,
          q: filters.q || undefined,
          status: (filters.status as ProductStatusInput) || undefined,
          category: filters.category || undefined,
        }),
        adminApi.listCategories(),
        adminApi.listCollections(),
      ]);
      setProducts(productsResult.items);
      setMeta(productsResult.meta);
      setCategories(categoriesResult);
      setCollections(collectionsResult);
      if (!selectedCategoryId && categoriesResult.length > 0) {
        setSelectedCategoryId(categoriesResult[0]?.id ?? '');
      }
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setListError({ message: err.message, requestId: err.requestId });
      } else {
        setListError({ message: 'Unable to load admin product catalog.' });
      }
    } finally {
      setListLoading(false);
    }
  }, [filters, selectedCategoryId]);

  useEffect(() => {
    if (sessionLoading || !user || !canReadCatalog) {
      return;
    }

    let active = true;
    Promise.all([
      adminApi.listProducts({
        page: filters.page,
        limit: 20,
        q: filters.q || undefined,
        status: (filters.status as ProductStatusInput) || undefined,
        category: filters.category || undefined,
      }),
      adminApi.listCategories(),
      adminApi.listCollections(),
    ])
      .then(([productsResult, categoriesResult, collectionsResult]) => {
        if (!active) return;
        setProducts(productsResult.items);
        setMeta(productsResult.meta);
        setCategories(categoriesResult);
        setCollections(collectionsResult);
        if (categoriesResult.length > 0) {
          setSelectedCategoryId((prev) => prev || (categoriesResult[0]?.id ?? ''));
        }
        setListError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setListError({ message: err.message, requestId: err.requestId });
        } else {
          setListError({ message: 'Unable to load admin product catalog.' });
        }
      })
      .finally(() => {
        if (active) {
          setListLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canReadCatalog, filters, sessionLoading, user]);

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters({
      page: 1,
      q: draftQuery.trim(),
      status: draftStatus,
      category: draftCategory,
    });
  };

  const resetFilters = () => {
    setDraftQuery('');
    setDraftStatus('');
    setDraftCategory('');
    setFilters({ page: 1, q: '', status: '', category: '' });
  };

  const openCreateModal = () => {
    setNewName('');
    setNewSlug('');
    setSlugTouched(false);
    setNewDescription('');
    setNewMaterial('');
    setNewFit('');
    setNewCare('');
    setSelectedCollectionIds([]);
    setCreateFieldErrors({});
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateFieldErrors({});
    setCreateError(null);

    const parsed = createProductRequestSchema.safeParse({
      name: newName.trim(),
      slug: newSlug.trim(),
      description: newDescription.trim(),
      material: newMaterial.trim(),
      fit: newFit.trim(),
      careInstruction: newCare.trim(),
      isVisible: true,
      isFeatured: false,
      has3dEnabled: false,
      categoryIds: selectedCategoryId ? [selectedCategoryId] : [],
      primaryCategoryId: selectedCategoryId || null,
      collectionIds: selectedCollectionIds,
    });

    if (!parsed.success) {
      const issues: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] ? String(issue.path[0]) : 'form';
        if (!issues[key]) {
          issues[key] = issue.message;
        }
      }
      setCreateFieldErrors(issues);
      return;
    }

    setCreating(true);
    try {
      const created = await adminApi.createProduct(parsed.data);
      toast({
        tone: 'success',
        title: 'Draft product created',
        description: `${created.name} created in DRAFT status.`,
      });
      setCreateOpen(false);
      await loadCatalogProducts();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setCreateFieldErrors(extractAdminFieldErrors(err));
        setCreateError(err.message);
      } else {
        setCreateError('Unable to create product draft.');
      }
    } finally {
      setCreating(false);
    }
  };

  const columns: DataTableColumn<AdminProductSummaryDto>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (item) => (
        <div className="space-y-1">
          <Link
            href={`/catalog/products/${item.id}`}
            className="font-medium text-ink hover:text-link hover:underline"
          >
            {item.name}
          </Link>
          <p className="font-mono text-xs text-ink-muted">{item.slug}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (item) => (
        <span className="text-xs text-ink-secondary">
          {item.primaryCategory?.name ?? 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Lifecycle',
      render: (item) => <Badge tone={productStatusTone(item.status)}>{item.status}</Badge>,
    },
    {
      key: 'publishGate',
      header: 'Publish Gate',
      render: (item) =>
        item.publishGate.canPublish ? (
          <Badge tone="success">Gate Ready</Badge>
        ) : (
          <Badge tone="warning">{item.publishGate.unmetCount} Unmet</Badge>
        ),
    },
    {
      key: 'variants',
      header: 'Variants / Stock',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-xs tabular-nums text-ink">
          {item.variantCount} SKUs / {item.totalAvailableStock} avail
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Base Price',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-xs font-medium tabular-nums text-ink">
          {formatIDR(item.priceIdr)}
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated (WIB)',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-xs text-ink-muted">
          {formatWIB(item.updatedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (item) => (
        <LinkButton href={`/catalog/products/${item.id}`} variant="secondary" size="sm">
          Manage
        </LinkButton>
      ),
    },
  ];

  return (
    <AdminShell
      title="Catalog Products"
      description="Author draft garments, assign taxonomy and capsules, manage variant pricing, and validate Publish Gate criteria."
      user={user}
      actions={
        canReadCatalog && canWriteCatalog ? (
          <Button type="button" variant="primary" size="md" onClick={openCreateModal}>
            New Product Draft
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
          description="Your assigned role does not grant product.read, product.write, or product.publish access."
        />
      ) : (
        <div className="space-y-6">
          <Surface variant="subtle" border="hairline" padding="md">
            <form onSubmit={handleFilterSubmit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FormField id="admin-prod-q" label="Search Name, Slug, or SKU">
                <Input
                  id="admin-prod-q"
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.target.value)}
                  placeholder="Search catalog..."
                />
              </FormField>

              <FormField id="admin-prod-status" label="Lifecycle Status">
                <Select
                  id="admin-prod-status"
                  value={draftStatus}
                  onChange={(event) => setDraftStatus(event.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="REVIEW">REVIEW</option>
                  <option value="READY_TO_PUBLISH">READY_TO_PUBLISH</option>
                  <option value="PUBLISHED">PUBLISHED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </Select>
              </FormField>

              <FormField id="admin-prod-category" label="Category">
                <Select
                  id="admin-prod-category"
                  value={draftCategory}
                  onChange={(event) => setDraftCategory(event.target.value)}
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.slug}>
                      {cat.name}
                    </option>
                  ))}
                </Select>
              </FormField>

              <div className="flex items-end gap-2">
                <Button type="submit" variant="primary" size="md">
                  Filter
                </Button>
                <Button type="button" variant="secondary" size="md" onClick={resetFilters}>
                  Reset
                </Button>
              </div>
            </form>
          </Surface>

          {listLoading ? (
            <LoadingState label="Loading catalog products" rows={5} />
          ) : listError ? (
            <ErrorState
              title="Unable to load catalog products"
              message={listError.message}
              requestId={listError.requestId}
              onRetry={() => void loadCatalogProducts()}
            />
          ) : products.length === 0 ? (
            <EmptyState
              title="No products match your filters"
              description="Adjust status or search criteria, or create a new draft product."
              action={
                canWriteCatalog ? (
                  <Button type="button" variant="primary" size="md" onClick={openCreateModal}>
                    Create Product Draft
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" size="md" onClick={resetFilters}>
                    Reset Filters
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-4">
              <DataTable
                caption="ARVEN admin product catalog"
                columns={columns}
                rows={products}
                getRowKey={(row) => row.id}
                tableBreakpoint="xl"
              />

              {meta.totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="font-mono text-xs tabular-nums text-ink-muted">
                    Page {meta.page} of {meta.totalPages} ({meta.total} products)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={meta.page <= 1}
                      onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={meta.page >= meta.totalPages}
                      onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Product Draft"
        description="New products enter the catalog in DRAFT status and must pass the 4-point Publish Gate before storefront publication."
        size="lg"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4">
          {createError ? <StatusBanner tone="danger" description={createError} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="create-prod-name" label="Product Name" required error={createFieldErrors.name}>
              <Input
                id="create-prod-name"
                value={newName}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setNewName(nextName);
                  if (!slugTouched) {
                    setNewSlug(slugifyCatalogTitle(nextName));
                  }
                }}
                placeholder="Atelier Structured Coat"
              />
            </FormField>

            <FormField id="create-prod-slug" label="URL Slug" required error={createFieldErrors.slug}>
              <Input
                id="create-prod-slug"
                value={newSlug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setNewSlug(event.target.value);
                }}
                placeholder="atelier-structured-coat"
              />
            </FormField>
          </div>

          <FormField
            id="create-prod-desc"
            label="Editorial Description"
            error={createFieldErrors.description}
          >
            <Textarea
              id="create-prod-desc"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="Detailed silhouette architecture and construction summary..."
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="create-prod-material" label="Material" error={createFieldErrors.material}>
              <Input
                id="create-prod-material"
                value={newMaterial}
                onChange={(event) => setNewMaterial(event.target.value)}
                placeholder="100% Virgin Wool"
              />
            </FormField>

            <FormField id="create-prod-fit" label="Fit" error={createFieldErrors.fit}>
              <Input
                id="create-prod-fit"
                value={newFit}
                onChange={(event) => setNewFit(event.target.value)}
                placeholder="Relaxed Architectural Fit"
              />
            </FormField>
          </div>

          <FormField
            id="create-prod-care"
            label="Care Instructions"
            error={createFieldErrors.careInstruction}
          >
            <Input
              id="create-prod-care"
              value={newCare}
              onChange={(event) => setNewCare(event.target.value)}
              placeholder="Dry clean only. Steam on low setting."
            />
          </FormField>

          <FormField id="create-prod-category" label="Primary Category">
            <Select
              id="create-prod-category"
              value={selectedCategoryId}
              onChange={(event) => setSelectedCategoryId(event.target.value)}
            >
              <option value="">Select category later</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </Select>
          </FormField>

          {collections.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
                Assign Collections
              </p>
              <div className="flex flex-wrap gap-3">
                {collections.map((col) => {
                  const checked = selectedCollectionIds.includes(col.id);
                  return (
                    <Checkbox
                      key={col.id}
                      id={`create-prod-col-${col.id}`}
                      label={col.name}
                      checked={checked}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedCollectionIds((prev) => [...prev, col.id]);
                        } else {
                          setSelectedCollectionIds((prev) => prev.filter((item) => item !== col.id));
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={creating} loadingLabel="Saving draft">
              Create Draft
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
