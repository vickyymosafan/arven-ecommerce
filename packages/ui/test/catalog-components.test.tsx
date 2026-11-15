import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  ProductCard,
  type CatalogProductCardItem,
} from '../src/components/product-card.js';
import {
  VariantSelector,
  type CatalogVariantOption,
} from '../src/components/variant-selector.js';
import { SizeGuideModal } from '../src/components/size-guide-modal.js';

afterEach(() => {
  cleanup();
});

const sampleProduct: CatalogProductCardItem = {
  id: 'prod-1',
  slug: 'essential-oversized-tee',
  name: 'Essential Oversized Tee',
  material: '100% Heavyweight Combed Cotton 280gsm',
  fit: 'Oversized Architectural Fit',
  priceIdr: 449000,
  compareAtPriceIdr: 549000,
  isFeatured: true,
  inStock: true,
  stockStatus: 'LOW_STOCK',
  primaryCategory: {
    id: 'cat-tops',
    slug: 'tops',
    name: 'Tops',
  },
  collections: [
    {
      id: 'col-essentials',
      slug: 'essentials',
      name: 'Essentials',
    },
  ],
  primaryMedia: {
    id: 'media-1',
    url: '/images/products/essential-oversized-tee-front.svg',
    altText: 'Essential Oversized Tee front view',
  },
  availableSizes: ['S', 'M', 'L', 'XL'],
  availableColors: [
    { color: 'Charcoal', colorHex: '#17191B' },
    { color: 'Ivory', colorHex: '#F8F7F3' },
  ],
};

const sampleVariants: CatalogVariantOption[] = [
  {
    id: 'var-1',
    sku: 'ARV-TOP-001-BLK-M',
    size: 'M',
    color: 'Charcoal',
    colorHex: '#17191B',
    priceIdr: 449000,
    compareAtPriceIdr: null,
    weightGrams: 340,
    availableQty: 12,
    lowStockThreshold: 5,
    stockStatus: 'IN_STOCK',
  },
  {
    id: 'var-2',
    sku: 'ARV-TOP-001-BLK-L',
    size: 'L',
    color: 'Charcoal',
    colorHex: '#17191B',
    priceIdr: 449000,
    compareAtPriceIdr: null,
    weightGrams: 360,
    availableQty: 3,
    lowStockThreshold: 5,
    stockStatus: 'LOW_STOCK',
  },
  {
    id: 'var-3',
    sku: 'ARV-TOP-001-IVR-M',
    size: 'M',
    color: 'Ivory',
    colorHex: '#F8F7F3',
    priceIdr: 469000,
    compareAtPriceIdr: 529000,
    weightGrams: 340,
    availableQty: 0,
    lowStockThreshold: 5,
    stockStatus: 'OUT_OF_STOCK',
  },
];

describe('ProductCard, VariantSelector, and SizeGuideModal', () => {
  it('renders ProductCard with formatted IDR prices, badges, and product link', () => {
    render(<ProductCard product={sampleProduct} />);

    expect(screen.getByText('Essential Oversized Tee')).toBeTruthy();
    expect(screen.getByText('Featured')).toBeTruthy();
    expect(screen.getByText('Low Stock')).toBeTruthy();
    expect(screen.getByText('Rp 449.000')).toBeTruthy();
    expect(screen.getByText('Rp 549.000')).toBeTruthy();
    expect(screen.getByText('S · M · L · XL')).toBeTruthy();
  });

  it('switches variants via color and size fieldsets in VariantSelector', () => {
    const onSelect = vi.fn();
    function SelectorHarness() {
      const [selectedId, setSelectedId] = useState<string>('var-1');
      return (
        <VariantSelector
          variants={sampleVariants}
          selectedVariantId={selectedId}
          onSelectVariant={(v) => {
            setSelectedId(v.id);
            onSelect(v);
          }}
        />
      );
    }

    render(<SelectorHarness />);

    expect(screen.getByText('ARV-TOP-001-BLK-M')).toBeTruthy();
    expect(screen.getByText('In Stock (12 available)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'L' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'var-2' }));
    expect(screen.getByText('ARV-TOP-001-BLK-L')).toBeTruthy();
    expect(screen.getByText('Low Stock - Only 3 left')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Ivory/i }));
    expect(screen.getByText('ARV-TOP-001-IVR-M')).toBeTruthy();
    expect(screen.getByText('Rp 469.000')).toBeTruthy();
  });

  it('renders SizeGuideModal measurement table and closes on button click', () => {
    const onClose = vi.fn();
    render(
      <SizeGuideModal
        isOpen
        onClose={onClose}
        productName="Essential Oversized Tee"
        categoryName="Tops"
        sizeGuide={{
          unit: 'cm',
          notes: 'Measured flat across chest and shoulder.',
          columns: ['Size', 'Chest', 'Length'],
          rows: [
            { Size: 'M', Chest: '58', Length: '72' },
            { Size: 'L', Chest: '61', Length: '74' },
          ],
        }}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tops Size & Measurement Guide' })).toBeTruthy();
    expect(screen.getByText('Measured flat across chest and shoulder.')).toBeTruthy();
    expect(screen.getByText('58')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close Guide' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
