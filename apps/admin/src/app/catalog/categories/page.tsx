'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminCategoryDto } from '@arven/contracts';
import { createCategoryRequestSchema, updateCategoryRequestSchema } from '@arven/validators';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  StatusBanner,
  Textarea,
  formatWIB,
  useToast,
  type DataTableColumn,
} from '@arven/ui';
import { AdminShell } from '@/components/admin-shell';
import { AdminApiClientError, adminApi } from '@/lib/api-client';
import { slugifyCatalogTitle } from '@/lib/catalog-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

const DEFAULT_SIZE_GUIDE_TEMPLATE = JSON.stringify(
  {
    unit: 'cm',
    notes: 'Measurements recorded flat across garment.',
    columns: ['Size', 'Chest', 'Length'],
    rows: [
      { Size: 'S', Chest: '54', Length: '70' },
      { Size: 'M', Chest: '57', Length: '72' },
      { Size: 'L', Chest: '60', Length: '74' },
    ],
  },
  null,
  2,
);

export default function AdminCatalogCategoriesPage() {
  const { toast } = useToast();
  const { user, loading: sessionLoading, error: sessionError, permissions, canAccess, reload } =
    useAdminSession();

  const canReadCatalog = canAccess(['product.read', 'product.write', 'product.publish']);
  const canWriteCatalog = Boolean(user?.roles.includes('OWNER') || permissions.has('product.write'));

  const [categories, setCategories] = useState<AdminCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminCategoryDto | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [sizeGuideText, setSizeGuideText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.listCategories();
      setCategories(data);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: 'Unable to load categories.' });
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
    adminApi
      .listCategories()
      .then((data) => {
        if (!active) return;
        setCategories(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load categories.' });
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
    setSortOrder(String(categories.length + 1));
    setIsActive(true);
    setSizeGuideText(DEFAULT_SIZE_GUIDE_TEMPLATE);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (category: AdminCategoryDto) => {
    setEditTarget(category);
    setName(category.name);
    setSlug(category.slug);
    setSlugTouched(true);
    setDescription(category.description ?? '');
    setSortOrder(String(category.sortOrder));
    setIsActive(category.isActive);
    setSizeGuideText(
      category.sizeGuideJson ? JSON.stringify(category.sizeGuideJson, null, 2) : '',
    );
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    let parsedSizeGuide: Record<string, unknown> | null = null;
    if (sizeGuideText.trim()) {
      try {
        const obj = JSON.parse(sizeGuideText.trim()) as unknown;
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          setFormError('Size guide JSON must be a JSON object.');
          return;
        }
        parsedSizeGuide = obj as Record<string, unknown>;
      } catch {
        setFormError('Size guide JSON is invalid syntax.');
        return;
      }
    }

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      sortOrder: Number.parseInt(sortOrder.trim() || '0', 10),
      isActive,
      sizeGuideJson: parsedSizeGuide,
    };

    const validation = editTarget
      ? updateCategoryRequestSchema.safeParse(payload)
      : createCategoryRequestSchema.safeParse(payload);

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Invalid category fields.');
      return;
    }

    setSaving(true);
    try {
      if (editTarget) {
        await adminApi.updateCategory(editTarget.id, validation.data);
        toast({ tone: 'success', title: 'Category updated' });
      } else {
        await adminApi.createCategory(validation.data as Parameters<typeof adminApi.createCategory>[0]);
        toast({ tone: 'success', title: 'Category created' });
      }
      setModalOpen(false);
      await loadCategories();
    } catch (err) {
      setFormError(err instanceof AdminApiClientError ? err.message : 'Unable to save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDeleteCategory = async (category: AdminCategoryDto) => {
    try {
      await adminApi.deleteCategory(category.id);
      toast({ tone: 'success', title: 'Category soft-deleted', description: category.name });
      await loadCategories();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        toast({ tone: 'danger', title: 'Delete failed', description: err.message });
      }
    }
  };

  const columns: DataTableColumn<AdminCategoryDto>[] = [
    {
      key: 'name',
      header: 'Category',
      render: (cat) => (
        <div className="space-y-0.5">
          <p className="font-medium text-ink">{cat.name}</p>
          <p className="font-mono text-xs text-ink-muted">{cat.slug}</p>
        </div>
      ),
    },
    {
      key: 'order',
      header: 'Sort Order',
      render: (cat) => (
        <span className="font-mono text-xs tabular-nums text-ink">{cat.sortOrder}</span>
      ),
    },
    {
      key: 'status',
      header: 'Visibility',
      render: (cat) => (
        <Badge tone={cat.isActive ? 'success' : 'neutral'}>
          {cat.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'sizeGuide',
      header: 'Size Guide',
      render: (cat) => (
        <Badge tone={cat.sizeGuideJson ? 'info' : 'warning'}>
          {cat.sizeGuideJson ? 'Configured' : 'Missing'}
        </Badge>
      ),
    },
    {
      key: 'products',
      header: 'Products',
      render: (cat) => (
        <span className="font-mono text-xs tabular-nums text-ink">{cat.productCount}</span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated (WIB)',
      render: (cat) => (
        <span className="whitespace-nowrap font-mono text-xs text-ink-muted">
          {formatWIB(cat.updatedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (cat) =>
        canWriteCatalog ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => openEditModal(cat)}>
              Edit
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => void handleSoftDeleteCategory(cat)}
            >
              Delete
            </Button>
          </div>
        ) : (
          <span className="text-xs text-ink-muted">Read only</span>
        ),
    },
  ];

  return (
    <AdminShell
      title="Catalog Categories"
      description="Manage product taxonomy hierarchy, sort positions, visibility, and default size measurement charts."
      user={user}
      actions={
        canReadCatalog && canWriteCatalog ? (
          <Button type="button" variant="primary" size="md" onClick={openCreateModal}>
            New Category
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
        <LoadingState label="Loading taxonomy categories" rows={5} />
      ) : error ? (
        <ErrorState
          title="Unable to load categories"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void loadCategories()}
        />
      ) : categories.length === 0 ? (
        <EmptyState
          title="No categories configured"
          description="Create top-level garment categories with size guide measurements."
          action={
            canWriteCatalog ? (
              <Button type="button" variant="primary" size="md" onClick={openCreateModal}>
                Create Category
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          caption="ARVEN catalog categories"
          columns={columns}
          rows={categories}
          getRowKey={(cat) => cat.id}
          tableBreakpoint="xl"
        />
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? `Edit Category: ${editTarget.name}` : 'Create Category'}
        description="Categories supply fallback size measurement tables to the Product Detail Page SizeGuideModal."
        size="lg"
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          {formError ? <StatusBanner tone="danger" description={formError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="cat-name" label="Category Name" required>
              <Input
                id="cat-name"
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
            <FormField id="cat-slug" label="URL Slug" required>
              <Input
                id="cat-slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
              />
            </FormField>
          </div>
          <FormField id="cat-desc" label="Description">
            <Textarea id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="cat-order" label="Sort Order">
              <Input
                id="cat-order"
                inputMode="numeric"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </FormField>
            <div className="pt-6">
              <Checkbox
                id="cat-active"
                label="Category Active on Storefront"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
            </div>
          </div>
          <FormField
            id="cat-size-guide"
            label="Size Guide JSON"
            hint="Structured measurement object with unit, columns[], and rows[]"
          >
            <Textarea
              id="cat-size-guide"
              rows={8}
              className="font-mono text-xs"
              value={sizeGuideText}
              onChange={(e) => setSizeGuideText(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="md" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={saving}>
              {editTarget ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
