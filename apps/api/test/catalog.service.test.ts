import { describe, expect, it, vi } from 'vitest';
import {
  CollectionStatus,
  MediaType,
  ProductStatus,
  WarehouseStatus,
} from '@arven/database';
import type { AuthenticatedActor } from '../src/common/security/index.js';
import type { AuditLogService } from '../src/modules/audit-notifications/audit-log.service.js';
import type { OutboxWriterService } from '../src/modules/audit-notifications/outbox-writer.service.js';
import {
  CatalogService,
  evaluateProductPublishGate,
} from '../src/modules/catalog/catalog.service.js';
import type { PrismaService } from '../src/shared/prisma/prisma.service.js';

function makeActor(overrides: Partial<AuthenticatedActor> = {}): AuthenticatedActor {
  return {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'product.manager@arven.test',
    fullName: 'ARVEN Product Manager',
    sessionId: '22222222-2222-4222-8222-222222222222',
    sessionTokenHash: 'a'.repeat(64),
    scope: 'ADMIN',
    roles: ['PRODUCT'],
    permissions: ['product.read', 'product.write', 'product.publish'],
    mfaEnabled: true,
    mfaVerifiedAt: new Date(),
    ...overrides,
  };
}

function makeReadyLoadedProduct(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-11-15T00:00:00.000Z');
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slug: 'essentials-heavyweight-crew-tee',
    name: 'Essentials Heavyweight Crew Tee',
    description: 'Dense combed cotton jersey tee.',
    material: '100% Organic Cotton',
    fit: 'Relaxed Fit',
    careInstruction: 'Machine wash cold.',
    status: ProductStatus.DRAFT,
    isVisible: true,
    isFeatured: true,
    has3dEnabled: false,
    seoTitle: 'Essentials Heavyweight Crew Tee | ARVEN',
    seoDescription: 'Organic combed cotton heavyweight crew tee.',
    sizeGuideOverride: {
      unit: 'cm',
      columns: ['Size', 'Chest'],
      rows: [{ Size: 'M', Chest: '118' }],
    },
    publishedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    productCategories: [
      {
        productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        categoryId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        isPrimary: true,
        category: {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          parentId: null,
          slug: 'tops',
          name: 'Tops',
          description: 'Tops category',
          sizeGuide: { unit: 'cm', columns: ['Size'], rows: [{ Size: 'M' }] },
          sortOrder: 1,
          isActive: true,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      },
    ],
    collectionProducts: [
      {
        collectionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        position: 1,
        collection: {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          slug: 'essentials',
          name: 'Essentials',
          description: 'Essentials collection',
          status: CollectionStatus.PUBLISHED,
          startsAt: now,
          endsAt: null,
          heroMediaUrl: 'data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E',
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      },
    ],
    variants: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sku: 'ARV-TOP-001',
        size: 'M',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 299_000n,
        compareAtPriceIdr: 349_000n,
        weightGrams: 320,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
        isActive: true,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        inventoryLevels: [
          {
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            warehouseId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            variantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            quantityOnHand: 15,
            quantityReserved: 2,
            lowStockThreshold: 5,
            updatedAt: now,
            warehouse: {
              id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
              code: 'JKT-MAIN-01',
              status: WarehouseStatus.ACTIVE,
            },
          },
        ],
      },
    ],
    media: [
      {
        id: '99999999-9999-4999-8999-999999999999',
        productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        variantId: null,
        type: MediaType.IMAGE,
        objectKey: 'seed/products/essentials-heavyweight-crew-tee/01-primary.svg',
        url: 'data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E',
        altText: 'Essentials Heavyweight Crew Tee front view',
        position: 0,
        width: 900,
        height: 1200,
        isPrimary: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  };
}

describe('CatalogService & Publish Gate domain rules', () => {
  it('evaluates Publish Gate pass and reports all unmet criteria with 422 PUBLISH_GATE_UNMET', async () => {
    const readyProduct = makeReadyLoadedProduct();
    const passEval = evaluateProductPublishGate(readyProduct);
    expect(passEval.canPublish).toBe(true);
    expect(passEval.unmetCount).toBe(0);

    const incompleteProduct = makeReadyLoadedProduct({
      material: '',
      seoTitle: null,
      seoDescription: '',
      sizeGuideOverride: null,
      productCategories: [],
      variants: [],
      media: [],
    });

    const failEval = evaluateProductPublishGate(incompleteProduct);
    expect(failEval.canPublish).toBe(false);
    expect(failEval.unmetCount).toBeGreaterThanOrEqual(5);

    const tx = {
      product: {
        findFirst: vi.fn(async () => incompleteProduct),
      },
    };
    const prismaMock = {
      withTransaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as PrismaService;

    const service = new CatalogService(
      prismaMock,
      { record: vi.fn() } as unknown as AuditLogService,
      { enqueue: vi.fn() } as unknown as OutboxWriterService,
    );

    await expect(
      service.transitionProductStatus(makeActor(), incompleteProduct.id, {
        targetStatus: 'PUBLISHED',
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'PUBLISH_GATE_UNMET',
    });
  });

  it('transitions a ready product to PUBLISHED, stamps publishedAt, and enqueues product.published outbox event', async () => {
    const draftReady = makeReadyLoadedProduct();
    const publishedProduct = makeReadyLoadedProduct({
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date('2026-11-15T08:00:00.000Z'),
    });

    let callCount = 0;
    const tx = {
      product: {
        findFirst: vi.fn(async () => {
          callCount += 1;
          return callCount === 1 ? draftReady : publishedProduct;
        }),
        update: vi.fn(async () => publishedProduct),
      },
    };
    const prismaMock = {
      withTransaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as PrismaService;

    const auditMock = { record: vi.fn(async () => undefined) } as unknown as AuditLogService;
    const outboxMock = { enqueue: vi.fn(async () => 'outbox-1') } as unknown as OutboxWriterService;

    const service = new CatalogService(prismaMock, auditMock, outboxMock);
    const result = await service.transitionProductStatus(makeActor(), draftReady.id, {
      targetStatus: 'PUBLISHED',
      reason: 'Launch approval complete',
    });

    expect(result.status).toBe('PUBLISHED');
    expect(outboxMock.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: 'Product',
        aggregateId: draftReady.id,
        eventType: 'product.published',
      }),
      tx,
    );
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.status.transitioned',
        resource: 'Product',
        resourceId: draftReady.id,
      }),
      tx,
    );
  });

  it('records dedicated price change audit log (oldValue -> newValue) when variant priceIdr changes (§4.1)', async () => {
    const baseProduct = makeReadyLoadedProduct();
    const updatedProduct = makeReadyLoadedProduct({
      variants: [
        {
          ...baseProduct.variants[0]!,
          priceIdr: 329_000n,
          compareAtPriceIdr: 379_000n,
        },
      ],
    });

    let loadIdx = 0;
    const tx = {
      product: {
        findFirst: vi.fn(async () => {
          loadIdx += 1;
          return loadIdx === 1 ? baseProduct : updatedProduct;
        }),
      },
      productVariant: {
        update: vi.fn(async () => updatedProduct.variants[0]),
      },
      inventoryLevel: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    const prismaMock = {
      withTransaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as PrismaService;
    const auditRecordMock = vi.fn(async () => undefined);
    const service = new CatalogService(
      prismaMock,
      { record: auditRecordMock } as unknown as AuditLogService,
      { enqueue: vi.fn() } as unknown as OutboxWriterService,
    );

    const updatedVariant = await service.updateVariant(
      makeActor(),
      baseProduct.id,
      baseProduct.variants[0]!.id,
      {
        priceIdr: 329000,
        compareAtPriceIdr: 379000,
      },
    );

    expect(updatedVariant.priceIdr).toBe(329000);
    expect(auditRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.variant.price_changed',
        resource: 'ProductVariant',
        beforeState: expect.objectContaining({
          oldValue: 299000,
          priceIdr: 299000,
        }),
        afterState: expect.objectContaining({
          newValue: 329000,
          priceIdr: 329000,
        }),
      }),
      tx,
    );
  });

  it('filters, sorts, paginates public products and throws 404 on non-published PDP', async () => {
    const prodCheap = makeReadyLoadedProduct({
      id: '11111111-2222-4333-8444-555555555555',
      slug: 'cheap-tee',
      name: 'Alpha Tee',
      status: ProductStatus.PUBLISHED,
      isFeatured: false,
      variants: [
        {
          ...makeReadyLoadedProduct().variants[0]!,
          priceIdr: 299_000n,
        },
      ],
    });
    const prodExpensive = makeReadyLoadedProduct({
      id: '22222222-3333-4444-8555-666666666666',
      slug: 'expensive-coat',
      name: 'Beta Coat',
      status: ProductStatus.PUBLISHED,
      isFeatured: true,
      variants: [
        {
          ...makeReadyLoadedProduct().variants[0]!,
          sku: 'ARV-OUT-001',
          priceIdr: 899_000n,
        },
      ],
    });

    const prismaMock = {
      client: {
        product: {
          findMany: vi.fn(async () => [prodCheap, prodExpensive]),
          findFirst: vi.fn(async () => null),
        },
      },
    } as unknown as PrismaService;

    const service = new CatalogService(
      prismaMock,
      { record: vi.fn() } as unknown as AuditLogService,
      { enqueue: vi.fn() } as unknown as OutboxWriterService,
    );

    const sortedDesc = await service.listPublicProducts({
      page: 1,
      limit: 12,
      sort: 'price_desc',
    });
    expect(sortedDesc.total).toBe(2);
    expect(sortedDesc.items[0]?.slug).toBe('expensive-coat');
    expect(sortedDesc.items[1]?.slug).toBe('cheap-tee');

    await expect(service.getPublicProductBySlug('draft-product')).rejects.toMatchObject({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
    });
  });
});
