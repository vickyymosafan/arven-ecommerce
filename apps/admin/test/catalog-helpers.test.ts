import { describe, expect, it } from 'vitest';
import {
  buildStudioSvgDataUri,
  collectionStatusTone,
  productStatusTone,
  slugifyCatalogTitle,
  stockStatusTone,
} from '../src/lib/catalog-helpers';

describe('admin catalog helper functions', () => {
  it('slugifies editorial product and collection titles deterministically', () => {
    expect(slugifyCatalogTitle('Atelier Boxy Wool Overshirt!')).toBe(
      'atelier-boxy-wool-overshirt',
    );
    expect(slugifyCatalogTitle('  Essentials 2026 / Capsule  ')).toBe(
      'essentials-2026-capsule',
    );
  });

  it('maps product, collection, and stock statuses to semantic badge tones', () => {
    expect(productStatusTone('PUBLISHED')).toBe('success');
    expect(productStatusTone('READY_TO_PUBLISH')).toBe('info');
    expect(productStatusTone('REVIEW')).toBe('warning');
    expect(productStatusTone('ARCHIVED')).toBe('danger');
    expect(productStatusTone('DRAFT')).toBe('neutral');

    expect(collectionStatusTone('SCHEDULED')).toBe('info');
    expect(stockStatusTone('LOW_STOCK')).toBe('warning');
    expect(stockStatusTone('OUT_OF_STOCK')).toBe('danger');
  });

  it('generates safe ARVEN studio SVG data URIs without pink tokens or scripts', () => {
    const uri = buildStudioSvgDataUri('Heavyweight Crew <script>', 'STUDIO 01');
    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    const decoded = decodeURIComponent(uri);
    expect(decoded).not.toContain('<script');
    expect(decoded).toContain('#17191B');
    expect(decoded).toContain('#F8F7F3');
  });
});
