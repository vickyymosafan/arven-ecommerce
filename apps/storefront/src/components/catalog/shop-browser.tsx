'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  CategoryNodeDto,
  CollectionSummaryDto,
  ProductCardDto,
  ProductSort,
} from '@arven/contracts';
import {
  Badge,
  Button,
  Checkbox,
  Divider,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LinkButton,
  LoadingState,
  ProductCard,
  Select,
  SizeGuideModal,
  Surface,
  cn,
  formatIDR,
} from '@arven/ui';
import { ApiClientError, storefrontApi, type PaginationMeta } from '@/lib/api-client';

export interface ShopBrowserProps {
  fixedCategorySlug?: string;
  searchFocused?: boolean;
}

const DEFAULT_SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', '30', '32', '34', '41', '42', '43', 'ONE_SIZE'];
const DEFAULT_COLOR_OPTIONS = ['Charcoal', 'Ivory', 'Cream', 'Graphite', 'Obsidian', 'Deep Stone'];
const SEARCH_SUGGESTIONS = ['Heavyweight', 'Poplin', 'Wool', 'Sneaker', 'Calfskin', 'ARV-TOP-001'];

function flattenCategories(nodes: CategoryNodeDto[]): CategoryNodeDto[] {
  const flat: CategoryNodeDto[] = [];
  for (const node of nodes) {
    flat.push(node);
    if (node.children.length > 0) {
      flat.push(...flattenCategories(node.children));
    }
  }
  return flat;
}

export function ShopBrowser({ fixedCategorySlug, searchFocused = false }: ShopBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlCollection = searchParams.get('collection') ?? '';
  const urlSize = searchParams.get('size') ?? '';
  const urlColor = searchParams.get('color') ?? '';
  const urlMinPrice = searchParams.get('minPrice') ?? '';
  const urlMaxPrice = searchParams.get('maxPrice') ?? '';
  const urlInStock = searchParams.get('inStock') === 'true';
  const urlQuery = searchParams.get('q') ?? '';
  const urlSortRaw = searchParams.get('sort') ?? 'newest';
  const urlSort: ProductSort =
    urlSortRaw === 'price_asc' ||
    urlSortRaw === 'price_desc' ||
    urlSortRaw === 'featured' ||
    urlSortRaw === 'newest'
      ? urlSortRaw
      : 'newest';
  const urlCategory = fixedCategorySlug ?? searchParams.get('category') ?? '';
  const parsedPage = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const urlPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  const [categories, setCategories] = useState<CategoryNodeDto[]>([]);
  const [collections, setCollections] = useState<CollectionSummaryDto[]>([]);
  const [products, setProducts] = useState<ProductCardDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    requestId: '',
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [taxonomyLoaded, setTaxonomyLoaded] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let mounted = true;
    Promise.all([storefrontApi.getCategories(), storefrontApi.getCollections()])
      .then(([cats, cols]) => {
        if (!mounted) return;
        setCategories(flattenCategories(cats));
        setCollections(cols);
        setTaxonomyLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setTaxonomyLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const updateUrlParams = useCallback(
    (updates: Record<string, string | number | boolean | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === '' || value === false) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      if (!('page' in updates)) {
        next.delete('page');
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const loadProducts = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const minNum = urlMinPrice.trim() ? Number.parseInt(urlMinPrice.trim(), 10) : undefined;
    const maxNum = urlMaxPrice.trim() ? Number.parseInt(urlMaxPrice.trim(), 10) : undefined;
    const validMin = minNum !== undefined && Number.isFinite(minNum) && minNum >= 0 ? minNum : undefined;
    const validMax = maxNum !== undefined && Number.isFinite(maxNum) && maxNum >= 0 ? maxNum : undefined;

    storefrontApi
      .getProducts({
        page: urlPage,
        limit: 12,
        category: urlCategory || undefined,
        collection: urlCollection || undefined,
        size: urlSize || undefined,
        color: urlColor || undefined,
        minPrice: validMin,
        maxPrice: validMax,
        inStock: urlInStock ? true : undefined,
        q: urlQuery.trim() || undefined,
        sort: urlSort,
      })
      .then((result) => {
        if (!active) return;
        setProducts(result.items);
        setMeta(result.meta);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError({ message: err.message, requestId: err.requestId });
        } else {
          setError({ message: 'Unable to load products right now.' });
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
  }, [
    reloadNonce,
    urlCategory,
    urlCollection,
    urlColor,
    urlInStock,
    urlMaxPrice,
    urlMinPrice,
    urlPage,
    urlQuery,
    urlSize,
    urlSort,
  ]);

  const activeCategoryObj = useMemo(
    () => categories.find((cat) => cat.slug === urlCategory) ?? null,
    [categories, urlCategory],
  );

  const isUnknownFixedCategory = Boolean(
    fixedCategorySlug && taxonomyLoaded && !activeCategoryObj,
  );

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const qVal = String(formData.get('q') ?? '').trim();
    const minVal = String(formData.get('minPrice') ?? '').trim();
    const maxVal = String(formData.get('maxPrice') ?? '').trim();
    updateUrlParams({
      q: qVal || null,
      minPrice: minVal && /^\d+$/.test(minVal) ? minVal : null,
      maxPrice: maxVal && /^\d+$/.test(maxVal) ? maxVal : null,
    });
  };

  const handleResetFilters = () => {
    if (fixedCategorySlug) {
      router.push('/shop');
    } else {
      router.push(pathname);
    }
  };

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (!fixedCategorySlug && urlCategory) {
      chips.push({
        key: 'category',
        label: `Category: ${activeCategoryObj?.name ?? urlCategory}`,
        onClear: () => updateUrlParams({ category: null }),
      });
    }
    if (urlCollection) {
      const colName = collections.find((c) => c.slug === urlCollection)?.name ?? urlCollection;
      chips.push({
        key: 'collection',
        label: `Collection: ${colName}`,
        onClear: () => updateUrlParams({ collection: null }),
      });
    }
    if (urlSize) {
      chips.push({
        key: 'size',
        label: `Size: ${urlSize}`,
        onClear: () => updateUrlParams({ size: null }),
      });
    }
    if (urlColor) {
      chips.push({
        key: 'color',
        label: `Color: ${urlColor}`,
        onClear: () => updateUrlParams({ color: null }),
      });
    }
    if (urlMinPrice && /^\d+$/.test(urlMinPrice)) {
      chips.push({
        key: 'minPrice',
        label: `Min: ${formatIDR(Number.parseInt(urlMinPrice, 10))}`,
        onClear: () => updateUrlParams({ minPrice: null }),
      });
    }
    if (urlMaxPrice && /^\d+$/.test(urlMaxPrice)) {
      chips.push({
        key: 'maxPrice',
        label: `Max: ${formatIDR(Number.parseInt(urlMaxPrice, 10))}`,
        onClear: () => updateUrlParams({ maxPrice: null }),
      });
    }
    if (urlInStock) {
      chips.push({
        key: 'inStock',
        label: 'In Stock Only',
        onClear: () => updateUrlParams({ inStock: null }),
      });
    }
    if (urlQuery) {
      chips.push({
        key: 'q',
        label: `Query: "${urlQuery}"`,
        onClear: () => updateUrlParams({ q: null }),
      });
    }
    return chips;
  }, [
    activeCategoryObj?.name,
    collections,
    fixedCategorySlug,
    updateUrlParams,
    urlCategory,
    urlCollection,
    urlColor,
    urlInStock,
    urlMaxPrice,
    urlMinPrice,
    urlQuery,
    urlSize,
  ]);

  if (isUnknownFixedCategory) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="Category not found"
          description={`The catalog category "${fixedCategorySlug}" does not exist or is currently inactive.`}
          action={
            <LinkButton href="/shop" variant="primary" size="md">
              Browse All Products
            </LinkButton>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header & Category Tabs */}
      <section className="space-y-4 border-b border-hairline pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
              {searchFocused
                ? 'Archive Search'
                : fixedCategorySlug
                  ? `Category / ${fixedCategorySlug}`
                  : 'Complete Index'}
            </p>
            <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
              {searchFocused
                ? 'Search ARVEN Catalog'
                : activeCategoryObj?.name ?? 'Shop All Garments'}
            </h1>
            <p className="max-w-[var(--container-prose)] text-sm leading-relaxed text-ink-secondary">
              {searchFocused
                ? 'Locate garments by silhouette name, fabric composition, category, or exact SKU identifier.'
                : activeCategoryObj?.description ??
                  'Measured unisex silhouettes across tops, bottoms, outerwear, footwear, and architectural leather goods.'}
            </p>
          </div>

          {activeCategoryObj?.sizeGuideJson ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSizeGuideOpen(true)}
            >
              View Category Size Guide
            </Button>
          ) : null}
        </div>

        {/* Category Route Tabs */}
        <nav aria-label="Catalog categories" className="flex flex-wrap items-center gap-2 pt-2">
          <Link
            href="/shop"
            aria-current={!urlCategory && !searchFocused ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors',
              !urlCategory
                ? 'border-strong-border bg-inverse text-ink-inverse'
                : 'border-control-border bg-elevated text-ink-secondary hover:border-strong-border hover:text-ink',
            )}
          >
            All
          </Link>
          {categories.map((cat) => {
            const isSelected = urlCategory === cat.slug;
            return (
              <Link
                key={cat.id}
                href={searchFocused ? `/search?category=${cat.slug}` : `/shop/${cat.slug}`}
                aria-current={isSelected ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors',
                  isSelected
                    ? 'border-strong-border bg-inverse text-ink-inverse'
                    : 'border-control-border bg-elevated text-ink-secondary hover:border-strong-border hover:text-ink',
                )}
              >
                <span>{cat.name}</span>
                <span className="font-mono text-xs opacity-80">({cat.productCount})</span>
              </Link>
            );
          })}
        </nav>

        {searchFocused ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs font-medium text-ink-muted">Suggested queries:</span>
            {SEARCH_SUGGESTIONS.map((term) => (
              <Button
                key={term}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => updateUrlParams({ q: term })}
              >
                {term}
              </Button>
            ))}
          </div>
        ) : null}
      </section>

      {/* Filter & Sort Workbench */}
      <Surface variant="subtle" border="hairline" padding="md">
        <form
          key={`${urlQuery}|${urlMinPrice}|${urlMaxPrice}`}
          onSubmit={handleSearchSubmit}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="sm:col-span-2 lg:col-span-3">
              <FormField id="catalog-search-q" label="Search Name or SKU">
                <Input
                  id="catalog-search-q"
                  name="q"
                  defaultValue={urlQuery}
                  placeholder="e.g. Heavyweight, Wool, ARV-TOP-001"
                />
              </FormField>
            </div>

            <div className="lg:col-span-3">
              <FormField id="catalog-filter-collection" label="Collection">
                <Select
                  id="catalog-filter-collection"
                  value={urlCollection}
                  onChange={(event) => updateUrlParams({ collection: event.target.value || null })}
                >
                  <option value="">All Collections</option>
                  {collections.map((col) => (
                    <option key={col.id} value={col.slug}>
                      {col.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="lg:col-span-2">
              <FormField id="catalog-filter-size" label="Size">
                <Select
                  id="catalog-filter-size"
                  value={urlSize}
                  onChange={(event) => updateUrlParams({ size: event.target.value || null })}
                >
                  <option value="">All Sizes</option>
                  {DEFAULT_SIZE_OPTIONS.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="lg:col-span-2">
              <FormField id="catalog-filter-color" label="Color">
                <Select
                  id="catalog-filter-color"
                  value={urlColor}
                  onChange={(event) => updateUrlParams({ color: event.target.value || null })}
                >
                  <option value="">All Colors</option>
                  {DEFAULT_COLOR_OPTIONS.map((clr) => (
                    <option key={clr} value={clr}>
                      {clr}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="lg:col-span-2">
              <FormField id="catalog-sort" label="Sort Order">
                <Select
                  id="catalog-sort"
                  value={urlSort}
                  onChange={(event) => updateUrlParams({ sort: event.target.value })}
                >
                  <option value="newest">Newest Releases</option>
                  <option value="featured">Featured Curated</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </Select>
              </FormField>
            </div>
          </div>

          <Divider />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-4 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end">
              <div className="w-full sm:w-44">
                <FormField id="catalog-min-price" label="Min Price (IDR)">
                  <Input
                    id="catalog-min-price"
                    name="minPrice"
                    inputMode="numeric"
                    defaultValue={urlMinPrice}
                    placeholder="200000"
                  />
                </FormField>
              </div>
              <div className="w-full sm:w-44">
                <FormField id="catalog-max-price" label="Max Price (IDR)">
                  <Input
                    id="catalog-max-price"
                    name="maxPrice"
                    inputMode="numeric"
                    defaultValue={urlMaxPrice}
                    placeholder="1500000"
                  />
                </FormField>
              </div>
              <div className="pt-1">
                <Checkbox
                  id="catalog-in-stock"
                  label="In Stock Only"
                  checked={urlInStock}
                  onChange={(event) =>
                    updateUrlParams({ inStock: event.target.checked ? true : null })
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" size="md">
                Apply Filters
              </Button>
              <Button type="button" variant="secondary" size="md" onClick={handleResetFilters}>
                Reset Filters
              </Button>
            </div>
          </div>
        </form>
      </Surface>

      {/* Active Filter Chips & Result Count */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {loading
              ? 'Loading catalog...'
              : `${meta.total} ${meta.total === 1 ? 'product' : 'products'} found`}
          </span>
          {activeFilterChips.map((chip) => (
            <Button
              key={chip.key}
              type="button"
              variant="secondary"
              size="sm"
              onClick={chip.onClear}
            >
              <span>{chip.label}</span>
              <span aria-hidden="true" className="font-mono text-xs text-ink-muted">
                x
              </span>
            </Button>
          ))}
        </div>

        {meta.totalPages > 1 ? (
          <Badge tone="neutral">
            Page {meta.page} of {meta.totalPages}
          </Badge>
        ) : null}
      </div>

      {/* Product Grid / States */}
      <h2 className="sr-only">Catalog Products</h2>
      {loading ? (
        <LoadingState label="Fetching catalog products" rows={6} />
      ) : error ? (
        <ErrorState
          title="Unable to load catalog products"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void loadProducts()}
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="No garments match the current selection"
          description="Try removing one or more facet filters, widening your IDR price bounds, or resetting the search query."
          action={
            <Button type="button" variant="primary" size="md" onClick={handleResetFilters}>
              Reset All Filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {/* Pagination */}
          {meta.totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-6">
              <p className="font-mono text-xs tabular-nums text-ink-muted">
                Showing page {meta.page} of {meta.totalPages} ({meta.total} total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => updateUrlParams({ page: meta.page - 1 })}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => updateUrlParams({ page: meta.page + 1 })}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {activeCategoryObj ? (
        <SizeGuideModal
          isOpen={sizeGuideOpen}
          onClose={() => setSizeGuideOpen(false)}
          categoryName={activeCategoryObj.name}
          sizeGuide={activeCategoryObj.sizeGuideJson}
        />
      ) : null}
    </div>
  );
}
