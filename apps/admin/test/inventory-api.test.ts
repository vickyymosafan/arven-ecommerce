import { afterEach, describe, expect, it, vi } from 'vitest';
import { idempotencyKeySchema } from '@arven/validators';
import {
  adminApi,
  clearAdminCsrfTokenCache,
  generateIdempotencyKey,
} from '../src/lib/api-client';
import {
  computeProjectedOnHand,
  validateStockMovementDraft,
} from '../src/lib/inventory-helpers';

describe('adminApi inventory client and movement helpers', () => {
  afterEach(() => {
    clearAdminCsrfTokenCache();
    vi.restoreAllMocks();
  });

  it('generates Idempotency-Key values compliant with idempotencyKeySchema', () => {
    const key = generateIdempotencyKey('admin-inv');
    const parsed = idempotencyKeySchema.safeParse(key);
    expect(parsed.success).toBe(true);
    expect(key.startsWith('admin-inv:')).toBe(true);
  });

  it('lists inventory levels, movements, and reservations with query serialization', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [],
            meta: { requestId: 'req-lvl', page: 1, limit: 20, total: 0, totalPages: 1 },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [],
            meta: { requestId: 'req-mov', page: 1, limit: 20, total: 0, totalPages: 1 },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [],
            meta: { requestId: 'req-res', page: 1, limit: 20, total: 0, totalPages: 1 },
          }),
          { status: 200 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    await adminApi.listInventoryLevels({ page: 1, q: 'ARV', lowStockOnly: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/v1/admin/inventory/levels?page=1&q=ARV&lowStockOnly=true',
    );

    await adminApi.listInventoryMovements({ page: 2, type: 'RECEIPT' });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/v1/admin/inventory/movements?page=2&type=RECEIPT',
    );

    await adminApi.listStockReservations({ page: 1, status: 'ACTIVE' });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      '/api/v1/admin/inventory/reservations?page=1&status=ACTIVE',
    );
  });

  it('sends Idempotency-Key and x-csrf-token when creating a stock movement', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'admin-csrf-inv' },
            meta: { requestId: 'req-csrf' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              movement: {
                id: '11111111-1111-4111-8111-111111111111',
                warehouseId: '22222222-2222-4222-8222-222222222222',
                warehouseCode: 'JKT-MAIN-01',
                warehouseName: 'Jakarta Atelier Main',
                variantId: '33333333-3333-4333-8333-333333333333',
                sku: 'ARV-TEE-BLK-M',
                productName: 'Essential Heavyweight Tee',
                color: 'Charcoal',
                size: 'M',
                type: 'RECEIPT',
                quantityDelta: 10,
                referenceType: 'MANUAL_ADMIN',
                referenceId: null,
                reason: 'Atelier batch delivery',
                actorId: '44444444-4444-4444-8444-444444444444',
                actorEmail: 'inventory@arven.id',
                createdAt: '2026-11-15T12:00:00.000Z',
              },
              level: {
                id: '55555555-5555-4555-8555-555555555555',
                warehouseId: '22222222-2222-4222-8222-222222222222',
                warehouseCode: 'JKT-MAIN-01',
                warehouseName: 'Jakarta Atelier Main',
                variantId: '33333333-3333-4333-8333-333333333333',
                productId: '66666666-6666-4666-8666-666666666666',
                productSlug: 'essential-heavyweight-tee',
                productName: 'Essential Heavyweight Tee',
                productStatus: 'PUBLISHED',
                sku: 'ARV-TEE-BLK-M',
                color: 'Charcoal',
                colorHex: '#17191B',
                size: 'M',
                priceIdr: 299000,
                variantIsActive: true,
                quantityOnHand: 25,
                quantityReserved: 2,
                availableQty: 23,
                lowStockThreshold: 5,
                stockStatus: 'IN_STOCK',
                updatedAt: '2026-11-15T12:00:00.000Z',
              },
            },
            meta: { requestId: 'req-mov-post' },
          }),
          { status: 201 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const idemKey = generateIdempotencyKey('admin-inv');
    const result = await adminApi.createStockMovement(
      {
        warehouseCode: 'JKT-MAIN-01',
        variantId: '33333333-3333-4333-8333-333333333333',
        type: 'RECEIPT',
        quantityDelta: 10,
        referenceType: 'MANUAL_ADMIN',
        reason: 'Atelier batch delivery',
      },
      idemKey,
    );

    expect(result.level.quantityOnHand).toBe(25);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/admin/stock-movements');
    const headers = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(headers.get('Idempotency-Key')).toBe(idemKey);
    expect(headers.get('x-csrf-token')).toBe('admin-csrf-inv');
  });

  it('validates createAdminStockMovementSchema rules and projected on-hand preview', () => {
    expect(computeProjectedOnHand(15, '-4')).toBe(11);
    expect(computeProjectedOnHand(15, 'abc')).toBeNull();

    const invalidReceipt = validateStockMovementDraft({
      warehouseCode: 'JKT-MAIN-01',
      variantId: '33333333-3333-4333-8333-333333333333',
      type: 'RECEIPT',
      quantityDeltaRaw: '-5',
      reason: '',
    });
    expect(invalidReceipt.ok).toBe(false);
    if (!invalidReceipt.ok) {
      expect(invalidReceipt.fieldErrors.quantityDelta).toBeDefined();
    }

    const invalidAdjustment = validateStockMovementDraft({
      warehouseCode: 'JKT-MAIN-01',
      variantId: '33333333-3333-4333-8333-333333333333',
      type: 'ADJUSTMENT',
      quantityDeltaRaw: '-2',
      reason: 'ab',
    });
    expect(invalidAdjustment.ok).toBe(false);
    if (!invalidAdjustment.ok) {
      expect(invalidAdjustment.fieldErrors.reason).toBeDefined();
    }

    const validAdjustment = validateStockMovementDraft({
      warehouseCode: 'JKT-MAIN-01',
      variantId: '33333333-3333-4333-8333-333333333333',
      type: 'ADJUSTMENT',
      quantityDeltaRaw: '-2',
      reason: 'Cycle count adjustment',
    });
    expect(validAdjustment.ok).toBe(true);
  });
});
