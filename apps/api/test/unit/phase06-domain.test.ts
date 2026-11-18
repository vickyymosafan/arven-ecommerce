import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertAdminOrderTransition,
  isAdminFulfillmentTarget,
  isPostShipmentProtectedStatus,
} from '../../src/modules/orders/domain/entities/order.entity.js';
import {
  maskAddressLine,
  maskOrderAddressSnapshot,
  maskPersonName,
} from '../../src/modules/orders/infrastructure/mappers/orders.mapper.js';
import {
  assertOrderEligibleForRefund,
  assertRefundAmountWithinCeiling,
  assertRefundRequestPendingApproval,
} from '../../src/modules/payments/domain/entities/payment.entity.js';
import {
  assertOrderEligibleForReturn,
  assertReturnApprovable,
  assertReturnReceivable,
  assertReturnReviewable,
  shouldRestockReturnItem,
  validateRequestedReturnItems,
} from '../../src/modules/returns/domain/entities/return.entity.js';

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

describe('Phase 06 Clean Architecture, Domain State Machines & Masking', () => {
  it('enforces pure TypeScript domain layer in returns/domain with zero NestJS/Prisma/Express imports', () => {
    const returnsDomainDir = resolve(
      import.meta.dirname,
      '../../src/modules/returns/domain',
    );
    const files = collectTsFiles(returnsDomainDir);
    expect(files.length).toBeGreaterThanOrEqual(4);

    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf8');
      expect(content).not.toMatch(/from\s+['"]@nestjs\//);
      expect(content).not.toMatch(/from\s+['"]@prisma\//);
      expect(content).not.toMatch(/from\s+['"]@arven\/database['"]/);
      expect(content).not.toMatch(/from\s+['"]express['"]/);
    }
  });

  it('validates admin order transitions and post-shipment protection helpers', () => {
    expect(isAdminFulfillmentTarget('PROCESSING')).toBe(true);
    expect(isAdminFulfillmentTarget('READY_TO_SHIP')).toBe(true);
    expect(isAdminFulfillmentTarget('CANCELLED')).toBe(false);
    expect(isPostShipmentProtectedStatus('SHIPPED')).toBe(true);
    expect(isPostShipmentProtectedStatus('DELIVERED')).toBe(true);
    expect(isPostShipmentProtectedStatus('PAID')).toBe(false);

    expect(() => assertAdminOrderTransition('PAID', 'PROCESSING')).not.toThrow();
    expect(() => assertAdminOrderTransition('PROCESSING', 'READY_TO_SHIP')).not.toThrow();
    expect(() => assertAdminOrderTransition('READY_TO_SHIP', 'SHIPPED')).not.toThrow();
    expect(() => assertAdminOrderTransition('DELIVERED', 'COMPLETED')).not.toThrow();
    expect(() => assertAdminOrderTransition('PENDING_PAYMENT', 'DELIVERED')).toThrow(
      /Cannot transition order/i,
    );
  });

  it('validates return window, item ownership, cumulative quantity bounds, and restock rules', () => {
    const now = new Date('2026-11-18T10:00:00.000Z');
    const recentDelivery = new Date('2026-11-10T10:00:00.000Z');
    const expiredDelivery = new Date('2026-11-01T09:59:59.000Z');

    expect(() =>
      assertOrderEligibleForReturn('DELIVERED', recentDelivery, now),
    ).not.toThrow();
    expect(() =>
      assertOrderEligibleForReturn('SHIPPED', recentDelivery, now),
    ).toThrow(/not eligible for return/i);
    expect(() =>
      assertOrderEligibleForReturn('DELIVERED', expiredDelivery, now),
    ).toThrow(/window.*expired/i);

    const orderItems = new Map([
      ['item-1', { id: 'item-1', variantId: 'var-1', sku: 'ARV-01', quantity: 2 }],
    ]);
    const alreadyReturned = new Map([['item-1', 1]]);

    expect(() =>
      validateRequestedReturnItems(
        [{ orderItemId: 'item-1', quantity: 1 }],
        orderItems,
        alreadyReturned,
      ),
    ).not.toThrow();

    expect(() =>
      validateRequestedReturnItems(
        [{ orderItemId: 'item-1', quantity: 2 }],
        orderItems,
        alreadyReturned,
      ),
    ).toThrow(/exceeds remaining returnable quantity/i);

    expect(() =>
      validateRequestedReturnItems(
        [{ orderItemId: 'foreign-item', quantity: 1 }],
        orderItems,
        alreadyReturned,
      ),
    ).toThrow(/does not belong to this order/i);

    expect(() =>
      validateRequestedReturnItems(
        [
          { orderItemId: 'item-1', quantity: 1 },
          { orderItemId: 'item-1', quantity: 1 },
        ],
        orderItems,
        new Map(),
      ),
    ).toThrow(/Duplicate orderItemId/i);

    expect(() => assertReturnReviewable('REQUESTED')).not.toThrow();
    expect(() => assertReturnReviewable('APPROVED')).toThrow(/cannot move to UNDER_REVIEW/i);

    expect(() =>
      assertReturnApprovable('UNDER_REVIEW', 'REJECT', undefined),
    ).toThrow(/adminNotes reason is required/i);
    expect(() =>
      assertReturnApprovable('UNDER_REVIEW', 'APPROVE', undefined),
    ).not.toThrow();

    expect(() => assertReturnReceivable('APPROVED')).not.toThrow();
    expect(() => assertReturnReceivable('REQUESTED')).toThrow(/cannot be physically received/i);

    expect(
      shouldRestockReturnItem({
        condition: 'UNOPENED',
        restock: true,
        variantId: 'var-1',
        alreadyRestocked: false,
      }),
    ).toBe(true);
    expect(
      shouldRestockReturnItem({
        condition: 'GOOD',
        restock: true,
        variantId: 'var-1',
        alreadyRestocked: false,
      }),
    ).toBe(true);
    expect(
      shouldRestockReturnItem({
        condition: 'DAMAGED',
        restock: true,
        variantId: 'var-1',
        alreadyRestocked: false,
      }),
    ).toBe(false);
    expect(
      shouldRestockReturnItem({
        condition: 'DEFECTIVE',
        restock: true,
        variantId: 'var-1',
        alreadyRestocked: false,
      }),
    ).toBe(false);
    expect(
      shouldRestockReturnItem({
        condition: 'GOOD',
        restock: false,
        variantId: 'var-1',
        alreadyRestocked: false,
      }),
    ).toBe(false);
    expect(
      shouldRestockReturnItem({
        condition: 'GOOD',
        restock: true,
        variantId: null,
        alreadyRestocked: false,
      }),
    ).toBe(false);
    expect(
      shouldRestockReturnItem({
        condition: 'GOOD',
        restock: true,
        variantId: 'var-1',
        alreadyRestocked: true,
      }),
    ).toBe(false);
  });

  it('validates dual-step refund eligibility and cumulative ceiling bounds', () => {
    expect(() => assertOrderEligibleForRefund('DELIVERED', 1_000_000)).not.toThrow();
    expect(() => assertOrderEligibleForRefund('PENDING_PAYMENT', 0)).toThrow(
      /not eligible for refund/i,
    );
    expect(() => assertOrderEligibleForRefund('PAID', 0)).toThrow(
      /settled payment/i,
    );

    expect(() =>
      assertRefundAmountWithinCeiling(400_000, 1_000_000, 600_000),
    ).not.toThrow();
    expect(() =>
      assertRefundAmountWithinCeiling(400_001, 1_000_000, 600_000),
    ).toThrow(/exceeds remaining refundable balance/i);
    expect(() =>
      assertRefundAmountWithinCeiling(0, 1_000_000, 0),
    ).toThrow(/exceeds remaining refundable balance/i);

    expect(() => assertRefundRequestPendingApproval('REQUESTED')).not.toThrow();
    expect(() => assertRefundRequestPendingApproval('SUCCEEDED')).toThrow(
      /cannot be approved/i,
    );
  });

  it('masks recipient name, street address, and phone while preserving city/province/postalCode', () => {
    expect(maskPersonName('Aria Kusuma')).toBe('A*** K***');
    expect(maskAddressLine('Jl. Kemang Raya No. 42')).toBe('Jl***');

    const masked = maskOrderAddressSnapshot({
      recipientName: 'Aria Kusuma',
      phone: '+6281234567890',
      line1: 'Jl. Kemang Raya No. 42',
      line2: 'Suite 3B',
      subdistrict: 'Mampang',
      city: 'Jakarta Selatan',
      province: 'DKI Jakarta',
      postalCode: '12730',
      countryCode: 'ID',
    });

    expect(masked).toEqual({
      recipientName: 'A*** K***',
      phone: '****7890',
      line1: 'Jl***',
      line2: '***',
      subdistrict: '***',
      city: 'Jakarta Selatan',
      province: 'DKI Jakarta',
      postalCode: '12730',
      countryCode: 'ID',
    });
  });
});
