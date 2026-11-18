import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CmsLookbookDto, ReturnDetailDto } from '@arven/contracts';
import { clearCsrfTokenCache, storefrontApi } from '../src/lib/api-client';
import {
  clampReturnQuantity,
  getReturnStatusMeta,
  isOrderReturnEligible,
  isOrderReturnInProgress,
} from '../src/lib/format';

describe('Phase 06 Storefront Editorial & Customer Returns', () => {
  afterEach(() => {
    clearCsrfTokenCache();
    vi.restoreAllMocks();
  });

  it('enforces return eligibility strictly on DELIVERED orders and clamps item quantities', () => {
    expect(isOrderReturnEligible('DELIVERED')).toBe(true);
    expect(isOrderReturnEligible('PENDING_PAYMENT')).toBe(false);
    expect(isOrderReturnEligible('SHIPPED')).toBe(false);
    expect(isOrderReturnEligible('CANCELLED')).toBe(false);

    expect(isOrderReturnInProgress('RETURN_REQUESTED')).toBe(true);
    expect(isOrderReturnInProgress('RETURN_APPROVED')).toBe(true);
    expect(isOrderReturnInProgress('RETURNED')).toBe(true);
    expect(isOrderReturnInProgress('DELIVERED')).toBe(false);

    expect(clampReturnQuantity(0, 3)).toBe(1);
    expect(clampReturnQuantity(5, 3)).toBe(3);
    expect(clampReturnQuantity(2, 3)).toBe(2);

    expect(getReturnStatusMeta('RECEIVED').tone).toBe('success');
    expect(getReturnStatusMeta('REJECTED').tone).toBe('danger');
  });

  it('calls CMS lookbook & customer return API endpoints with Idempotency-Key and X-CSRF-Token', async () => {
    const sampleLookbook: CmsLookbookDto = {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'autumn-architecture',
      title: 'Autumn Architecture',
      season: 'AW26',
      description: 'Structured wool silhouettes.',
      slides: [
        {
          title: 'Look 01',
          imageUrl: '/images/look-01.jpg',
          altText: 'Charcoal coat',
          productSlug: 'structured-wool-coat',
        },
      ],
      status: 'PUBLISHED',
      publishedAt: '2026-11-18T00:00:00.000Z',
      createdAt: '2026-11-18T00:00:00.000Z',
      updatedAt: '2026-11-18T00:00:00.000Z',
    };

    const sampleReturn: ReturnDetailDto = {
      id: '22222222-2222-4222-8222-222222222222',
      orderId: '33333333-3333-4333-8333-333333333333',
      orderNumber: 'ARV-20261118-0009',
      userId: '44444444-4444-4444-8444-444444444444',
      customerEmail: 'member@arven.id',
      piiMasked: false,
      status: 'REQUESTED',
      reason: 'SIZE_FIT',
      customerNotes: 'Need smaller size',
      evidenceKeys: [],
      adminNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      receivedAt: null,
      items: [],
      createdAt: '2026-11-18T02:00:00.000Z',
      updatedAt: '2026-11-18T02:00:00.000Z',
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [sampleLookbook],
            meta: { requestId: 'req-lb', page: 1, limit: 20, total: 1, totalPages: 1 },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-cust-1' },
            meta: { requestId: 'req-csrf' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: sampleReturn,
            meta: { requestId: 'req-ret-create' },
          }),
          { status: 201 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const lookbooks = await storefrontApi.getCmsLookbooks({ page: 1, limit: 20 });
    expect(lookbooks.items).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/cms/lookbooks?page=1&limit=20');

    const createdReturn = await storefrontApi.createCustomerReturn(
      sampleReturn.orderId,
      {
        reason: 'SIZE_FIT',
        customerNotes: 'Need smaller size',
        items: [{ orderItemId: '55555555-5555-4555-8555-555555555555', quantity: 1 }],
      },
      'idem-cust-ret-0001',
    );
    expect(createdReturn.status).toBe('REQUESTED');

    const postHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(postHeaders.get('idempotency-key')).toBe('idem-cust-ret-0001');
    expect(postHeaders.get('x-csrf-token')).toBe('csrf-cust-1');
  });

  it('contains zero em-dashes, zero #8B897F, zero Three.js imports, and zero Phase 07/08 links in Phase 06 storefront files', () => {
    const storefrontPhase06Files = [
      'src/components/storefront-shell.tsx',
      'src/components/account-shell.tsx',
      'src/components/account/order-detail-view.tsx',
      'src/components/editorial/lookbook-detail-view.tsx',
      'src/components/editorial/journal-detail-view.tsx',
      'src/app/lookbook/page.tsx',
      'src/app/lookbook/[slug]/page.tsx',
      'src/app/journal/page.tsx',
      'src/app/journal/[slug]/page.tsx',
      'src/app/about/page.tsx',
      'src/app/account/returns/page.tsx',
      'src/lib/format.ts',
    ];

    for (const relPath of storefrontPhase06Files) {
      const fullPath = path.resolve(import.meta.dirname, '..', relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content, `${relPath} must not contain em-dash`).not.toContain('\u2014');
      expect(content.toLowerCase(), `${relPath} must not use #8b897f`).not.toContain('#8b897f');
      expect(content, `${relPath} must not import three`).not.toMatch(/from\s+['"]three['"]/);
      expect(content, `${relPath} must not link to /showroom`).not.toContain('/showroom');
      expect(content, `${relPath} must not link to /outfit-studio`).not.toContain('/outfit-studio');
    }
  });
});
