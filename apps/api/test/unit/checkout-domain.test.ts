import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import {
  aggregateRequestedItems,
  allocateLineDiscounts,
  buildOrderNumber,
  computeCouponDiscount,
  type CouponPolicySnapshot,
} from '../../src/modules/checkout/domain/value-objects/checkout-pricing.vo.js';
import { assertOrderCancellable } from '../../src/modules/orders/domain/entities/order.entity.js';
import {
  assertOrderEligibleForPaymentSession,
  evaluateWebhookTransition,
} from '../../src/modules/payments/domain/entities/payment.entity.js';
import {
  LOCAL_STUB_DEFAULT_MIDTRANS_SERVER_KEY,
  LocalStubPaymentAdapter,
  computeMidtransSignature,
} from '../../src/shared/adapters/payment.provider.js';
import {
  DeterministicShippingProvider,
  calculateChargeableWeightKg,
  resolveIndonesianShippingZone,
} from '../../src/shared/adapters/shipping.provider.js';

function createInMemoryRedisStub(): Redis {
  const store = new Map<string, string>();
  const mock = {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<'OK'> {
      store.set(key, value);
      return 'OK';
    },
  };
  return mock as unknown as Redis;
}

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Phase 05 Clean Architecture & Domain Rules', () => {
  it('enforces pure TypeScript domain layers with zero NestJS/Prisma/Express imports', () => {
    const modulesRoot = resolve(import.meta.dirname, '../../src/modules');
    const domainDirs = ['checkout/domain', 'orders/domain', 'payments/domain'];

    for (const relDir of domainDirs) {
      const files = collectTsFiles(join(modulesRoot, relDir));
      expect(files.length).toBeGreaterThan(0);

      for (const filePath of files) {
        const content = readFileSync(filePath, 'utf8');
        expect(content).not.toMatch(/from\s+['"]@nestjs\//);
        expect(content).not.toMatch(/from\s+['"]@prisma\//);
        expect(content).not.toMatch(/from\s+['"]@arven\/database['"]/);
        expect(content).not.toMatch(/from\s+['"]express['"]/);
      }
    }
  });

  it('computes Indonesian shipping zones, chargeable kg, and courier rates deterministically', async () => {
    expect(resolveIndonesianShippingZone('DKI Jakarta', 'Jakarta Selatan')).toBe(
      'JABODETABEK',
    );
    expect(resolveIndonesianShippingZone('Jawa Barat', 'Depok')).toBe('JABODETABEK');
    expect(resolveIndonesianShippingZone('Jawa Barat', 'Bandung')).toBe('JAVA');
    expect(resolveIndonesianShippingZone('Bali', 'Denpasar')).toBe('OUTER_ISLAND');

    expect(calculateChargeableWeightKg(450)).toBe(1);
    expect(calculateChargeableWeightKg(1000)).toBe(1);
    expect(calculateChargeableWeightKg(1001)).toBe(2);

    const provider = new DeterministicShippingProvider();
    const outerRates = await provider.getRates({
      originWarehouseCode: 'JKT-MAIN-01',
      destination: {
        recipientName: 'Client',
        phone: '+6281234567890',
        addressLine1: 'Jl. Sunset Road 88',
        city: 'Denpasar',
        province: 'Bali',
        postalCode: '80361',
        countryCode: 'ID',
      },
      totalWeightGrams: 1200,
      declaredValueIdr: 2_500_000,
    });

    expect(outerRates).toHaveLength(4);
    const jneReg = outerRates.find(
      (r) => r.provider === 'jne-adapter' && r.serviceCode === 'REG',
    );
    const sicepatBest = outerRates.find(
      (r) => r.provider === 'sicepat-adapter' && r.serviceCode === 'BEST',
    );
    expect(jneReg?.costIdr).toBe(76_000);
    expect(sicepatBest?.costIdr).toBe(118_000);
  });

  it('allocates line-level discounts so line sums exactly equal discountTotalIdr', () => {
    const allocated = allocateLineDiscounts(
      [
        { variantId: 'v1', unitPriceIdr: 100_000, quantity: 1, weightGrams: 400 },
        { variantId: 'v2', unitPriceIdr: 100_000, quantity: 1, weightGrams: 400 },
        { variantId: 'v3', unitPriceIdr: 100_000, quantity: 1, weightGrams: 400 },
      ],
      10_000,
    );

    const sumDiscount = allocated.reduce((acc, l) => acc + l.discountAllocatedIdr, 0);
    const sumLineTotal = allocated.reduce((acc, l) => acc + l.lineTotalIdr, 0);
    expect(sumDiscount).toBe(10_000);
    expect(allocated.map((l) => l.discountAllocatedIdr)).toEqual([3334, 3333, 3333]);
    expect(sumLineTotal).toBe(290_000);
  });

  it('computes PERCENTAGE half-up, FIXED_AMOUNT, and FREE_SHIPPING coupon rules', () => {
    const baseCoupon: CouponPolicySnapshot = {
      id: 'c1',
      code: 'WELCOME10',
      name: 'Welcome 10%',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      maxDiscountIdr: 500_000,
      minOrderSubtotalIdr: 200_000,
      usageLimitTotal: 100,
      usageLimitPerUser: 2,
      usedCount: 0,
      status: 'ACTIVE',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2029-01-01T00:00:00.000Z'),
    };
    const now = new Date('2026-06-01T00:00:00.000Z');

    expect(
      computeCouponDiscount({
        coupon: baseCoupon,
        subtotalIdr: 1_000_005,
        shippingCostIdr: 32_000,
        userRedemptionCount: 0,
        now,
      }),
    ).toEqual({
      discountTotalIdr: 100_001,
      shippingDiscountIdr: 0,
      discountAppliedIdr: 100_001,
    });

    expect(
      computeCouponDiscount({
        coupon: { ...baseCoupon, discountType: 'FREE_SHIPPING', discountValue: 0 },
        subtotalIdr: 1_000_000,
        shippingCostIdr: 38_000,
        userRedemptionCount: 0,
        now,
      }),
    ).toEqual({
      discountTotalIdr: 0,
      shippingDiscountIdr: 38_000,
      discountAppliedIdr: 38_000,
    });

    expect(() =>
      computeCouponDiscount({
        coupon: baseCoupon,
        subtotalIdr: 150_000,
        shippingCostIdr: 18_000,
        userRedemptionCount: 0,
        now,
      }),
    ).toThrow(/at least IDR 200000/i);
  });

  it('merges duplicate variant items and formats ARVEN order numbers', () => {
    const merged = aggregateRequestedItems(
      [
        { variantId: 'var-a', quantity: 2 },
        { variantId: 'var-a', quantity: 3 },
      ],
      50,
    );
    expect(merged).toEqual([{ variantId: 'var-a', quantity: 5, colorPresetId: undefined }]);
    expect(buildOrderNumber(new Date('2026-11-16T00:00:00Z'), 'a1b2c3d4')).toBe(
      'ARV-20261116-A1B2C3',
    );
  });

  it('blocks LocalStubPaymentAdapter in production and verifies constant-time Midtrans SHA512 webhooks', async () => {
    const redis = createInMemoryRedisStub();

    expect(
      () =>
        new LocalStubPaymentAdapter(
          {
            NODE_ENV: 'production',
            MIDTRANS_SERVER_KEY: 'secret',
            APP_URL: 'https://arven.id',
          },
          redis,
        ),
    ).toThrow(/strictly forbidden when NODE_ENV=production/i);

    const stub = new LocalStubPaymentAdapter(
      {
        NODE_ENV: 'test',
        MIDTRANS_SERVER_KEY: '',
        APP_URL: 'http://localhost:3000',
      },
      redis,
    );

    const session = await stub.createSession({
      orderId: '00000000-0000-0000-0000-000000000001',
      orderNumber: 'ARV-20261116-ABCDEF',
      amountIdr: 1_500_000,
      currency: 'IDR',
      customer: { fullName: 'Aria', email: 'aria@example.com' },
      items: [{ sku: 'ARV-01', name: 'Silk Trench', unitPriceIdr: 1_500_000, quantity: 1 }],
      expiresAt: new Date(Date.now() + 15 * 60_000),
      idempotencyKey: 'idem-key-123456',
    });

    const initialStatus = await stub.getStatus(session.providerReference);
    expect(initialStatus.status).toBe('PENDING');
    expect(initialStatus.grossAmountIdr).toBe(1_500_000);

    const signature = computeMidtransSignature({
      orderId: session.providerReference,
      statusCode: '200',
      grossAmount: '1500000',
      serverKey: LOCAL_STUB_DEFAULT_MIDTRANS_SERVER_KEY,
    });

    await expect(
      stub.verifyWebhook(
        {},
        {
          order_id: session.providerReference,
          status_code: '200',
          gross_amount: '1500000',
          transaction_status: 'settlement',
          transaction_id: 'tx-123',
          signature_key: 'bad-signature',
        },
      ),
    ).rejects.toThrow(/signature verification failed/i);

    const verified = await stub.verifyWebhook(
      {},
      {
        order_id: session.providerReference,
        status_code: '200',
        gross_amount: '1500000',
        transaction_status: 'settlement',
        transaction_id: 'tx-123',
        payment_type: 'qris',
        signature_key: signature,
      },
    );
    expect(verified.mappedStatus).toBe('SETTLEMENT');
    const updatedStatus = await stub.getStatus(session.providerReference);
    expect(updatedStatus.status).toBe('SETTLEMENT');
    expect(updatedStatus.grossAmountIdr).toBe(1_500_000);
  });

  it('enforces order cancellation and webhook transition guards', () => {
    expect(() => assertOrderCancellable('PENDING_PAYMENT')).not.toThrow();
    expect(() => assertOrderCancellable('PAID')).toThrow(/ORDER_CANNOT_BE_CANCELLED|cannot be cancelled/i);

    expect(() =>
      assertOrderEligibleForPaymentSession(
        'PENDING_PAYMENT',
        new Date(Date.now() - 1000),
        new Date(),
      ),
    ).toThrow(/expired/i);

    expect(
      evaluateWebhookTransition({
        orderStatus: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        providerStatus: 'SETTLEMENT',
        providerAmountIdr: 500_000,
        expectedAmountIdr: 500_000,
      }),
    ).toBe('SETTLE');

    expect(
      evaluateWebhookTransition({
        orderStatus: 'EXPIRED',
        paymentStatus: 'EXPIRED',
        providerStatus: 'SETTLEMENT',
        providerAmountIdr: 500_000,
        expectedAmountIdr: 500_000,
      }),
    ).toBe('LATE_SETTLEMENT_CONFLICT');

    expect(
      evaluateWebhookTransition({
        orderStatus: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        providerStatus: 'SETTLEMENT',
        providerAmountIdr: 499_000,
        expectedAmountIdr: 500_000,
      }),
    ).toBe('AMOUNT_MISMATCH');
  });
});
