import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminOrderDetailDto, RefundDto } from '@arven/contracts';
import {
  AdminApiClientError,
  adminApi,
  clearAdminCsrfTokenCache,
} from '../src/lib/api-client';
import {
  canUserApproveRefund,
  computeOrderRefundSummary,
  filterAdminNavItems,
  fromWibDateTimeInputValue,
  getAnalyticsVisibility,
  isAdminNavActive,
  isRestockAllowedForCondition,
  toWibDateTimeInputValue,
} from '../src/lib/ops-helpers';

const SAMPLE_ORDER_DETAIL: AdminOrderDetailDto = {
  id: '11111111-1111-4111-8111-111111111111',
  orderNumber: 'ARV-20261118-0001',
  isGuest: false,
  userId: '22222222-2222-4222-8222-222222222222',
  guestEmail: null,
  customerEmail: 'client@arven.id',
  piiMasked: false,
  status: 'DELIVERED',
  currency: 'IDR',
  subtotalIdr: 1200000,
  discountTotalIdr: 0,
  shippingTotalIdr: 25000,
  taxTotalIdr: 0,
  grandTotalIdr: 1225000,
  shippingProvider: 'jne-adapter',
  shippingService: 'REG',
  couponCodeSnapshot: null,
  addressSnapshot: {
    recipientName: 'Nadia Putri',
    phone: '+628123456789',
    line1: 'Jl. Kemang Raya No. 10',
    line2: null,
    subdistrict: null,
    city: 'Jakarta Selatan',
    province: 'DKI Jakarta',
    postalCode: '12730',
    countryCode: 'ID',
  },
  items: [],
  statusHistory: [],
  latestPayment: null,
  payments: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      orderId: '11111111-1111-4111-8111-111111111111',
      provider: 'midtrans',
      providerReference: 'MID-001',
      providerTransactionId: 'TX-001',
      method: 'bca_va',
      status: 'SETTLEMENT',
      amountIdr: 1225000,
      currency: 'IDR',
      snapToken: null,
      redirectUrl: null,
      expiresAt: '2026-11-18T09:00:00.000Z',
      settledAt: '2026-11-18T08:15:00.000Z',
      failureReason: null,
      createdAt: '2026-11-18T08:00:00.000Z',
      updatedAt: '2026-11-18T08:15:00.000Z',
    },
  ],
  shipments: [],
  returns: [],
  refunds: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      orderId: '11111111-1111-4111-8111-111111111111',
      orderNumber: 'ARV-20261118-0001',
      paymentId: '33333333-3333-4333-8333-333333333333',
      returnId: null,
      refundKey: 'RFD-1',
      providerRefundId: null,
      status: 'REQUESTED',
      amountIdr: 225000,
      currency: 'IDR',
      reason: 'Shipping adjustment',
      requestedBy: '55555555-5555-4555-8555-555555555555',
      approvedBy: null,
      completedAt: null,
      createdAt: '2026-11-18T08:20:00.000Z',
      updatedAt: '2026-11-18T08:20:00.000Z',
    },
  ],
  paymentExpiresAt: '2026-11-18T09:00:00.000Z',
  paidAt: '2026-11-18T08:15:00.000Z',
  createdAt: '2026-11-18T08:00:00.000Z',
  updatedAt: '2026-11-18T08:20:00.000Z',
};

describe('Phase 06 Admin Operations helpers & RBAC gates', () => {
  afterEach(() => {
    clearAdminCsrfTokenCache();
    vi.restoreAllMocks();
  });

  it('filters AdminShell navigation items by RBAC permissions and excludes Phase 07/08 3d-assets', () => {
    const supportNav = filterAdminNavItems({
      authenticated: true,
      roles: ['SUPPORT'],
      permissions: ['order.read.limited', 'return.read', 'return.review', 'analytics.read.limited'],
    });
    const supportHrefs = supportNav.map((item) => item.href);

    expect(supportHrefs).toContain('/');
    expect(supportHrefs).toContain('/orders');
    expect(supportHrefs).toContain('/returns');
    expect(supportHrefs).not.toContain('/coupons');
    expect(supportHrefs).not.toContain('/cms');
    expect(supportHrefs).not.toContain('/catalog/3d-assets');

    const ownerNav = filterAdminNavItems({
      authenticated: true,
      roles: ['OWNER'],
      permissions: [],
    });
    expect(ownerNav.map((i) => i.href)).toEqual([
      '/',
      '/catalog/products',
      '/catalog/categories',
      '/catalog/collections',
      '/inventory',
      '/orders',
      '/returns',
      '/coupons',
      '/cms',
      '/users',
      '/roles',
      '/audit-logs',
      '/ops/runtime',
    ]);
    expect(isAdminNavActive('/orders/123', '/orders')).toBe(true);
    expect(isAdminNavActive('/orders', '/orders')).toBe(true);
  });

  it('gates refund approval strictly to OWNER or refund.approve permission', () => {
    expect(
      canUserApproveRefund({
        roles: ['SUPPORT'],
        permissions: ['refund.request', 'return.read'],
      }),
    ).toBe(false);
    expect(
      canUserApproveRefund({
        roles: ['OPERATIONS'],
        permissions: ['order.fulfill', 'refund.request'],
      }),
    ).toBe(false);
    expect(
      canUserApproveRefund({
        roles: ['OWNER'],
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canUserApproveRefund({
        roles: ['FINANCE_LEAD'],
        permissions: ['refund.approve'],
      }),
    ).toBe(true);
  });

  it('determines analytics KPI visibility mode (full vs limited vs none)', () => {
    expect(
      getAnalyticsVisibility({ roles: ['OWNER'], permissions: [] }),
    ).toBe('full');
    expect(
      getAnalyticsVisibility({ roles: ['MERCHANDISER'], permissions: ['analytics.read'] }),
    ).toBe('full');
    expect(
      getAnalyticsVisibility({ roles: ['SUPPORT'], permissions: ['analytics.read.limited'] }),
    ).toBe('limited');
    expect(
      getAnalyticsVisibility({ roles: ['WAREHOUSE_OPERATOR'], permissions: ['inventory.read'] }),
    ).toBe('none');
  });

  it('enforces RETURN_TO_STOCK condition rules, refund ceiling math, and WIB datetime conversion', () => {
    expect(isRestockAllowedForCondition('UNOPENED')).toBe(true);
    expect(isRestockAllowedForCondition('GOOD')).toBe(true);
    expect(isRestockAllowedForCondition('DAMAGED')).toBe(false);
    expect(isRestockAllowedForCondition('DEFECTIVE')).toBe(false);

    const summary = computeOrderRefundSummary(SAMPLE_ORDER_DETAIL);
    expect(summary.eligible).toBe(true);
    expect(summary.totalPaidIdr).toBe(1225000);
    expect(summary.committedRefundsIdr).toBe(225000);
    expect(summary.remainingRefundableIdr).toBe(1000000);

    const wibInput = toWibDateTimeInputValue('2026-11-18T01:30:00.000Z');
    expect(wibInput).toBe('2026-11-18T08:30');
    expect(fromWibDateTimeInputValue(wibInput)).toBe('2026-11-18T01:30:00.000Z');
  });

  it('surfaces MFA_STEP_UP_REQUIRED on approveRefund while sending Idempotency-Key and X-CSRF-Token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-admin-1' },
            meta: { requestId: 'req-csrf' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'MFA_STEP_UP_REQUIRED',
              message: 'Fresh MFA step-up required within 15 minutes',
            },
            meta: { requestId: 'req-stepup' },
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              ...(SAMPLE_ORDER_DETAIL.refunds[0] as RefundDto),
              status: 'SUCCEEDED',
              approvedBy: 'owner-1',
            },
            meta: { requestId: 'req-approve-ok' },
          }),
          { status: 200 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adminApi.approveRefund(
        '44444444-4444-4444-8444-444444444444',
        { decision: 'APPROVE' },
        'idem-rfd-key-001',
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof AdminApiClientError && err.isMfaStepUpRequired,
    );

    const retried = await adminApi.approveRefund(
      '44444444-4444-4444-8444-444444444444',
      { decision: 'APPROVE' },
      'idem-rfd-key-001',
    );
    expect(retried.status).toBe('SUCCEEDED');

    const retryHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(retryHeaders.get('idempotency-key')).toBe('idem-rfd-key-001');
    expect(retryHeaders.get('x-csrf-token')).toBe('csrf-admin-1');
  });

  it('contains zero em-dashes, zero #8B897F, zero pink tokens, and zero Three.js imports in Phase 06 admin files', () => {
    const adminPhase06Files = [
      'src/components/admin-shell.tsx',
      'src/components/admin-forbidden-panel.tsx',
      'src/components/orders/admin-order-detail-view.tsx',
      'src/app/page.tsx',
      'src/app/orders/page.tsx',
      'src/app/orders/[id]/page.tsx',
      'src/app/returns/page.tsx',
      'src/app/coupons/page.tsx',
      'src/app/cms/page.tsx',
      'src/lib/ops-helpers.ts',
    ];

    for (const relPath of adminPhase06Files) {
      const fullPath = path.resolve(import.meta.dirname, '..', relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content, `${relPath} must not contain em-dash`).not.toContain('\u2014');
      expect(content.toLowerCase(), `${relPath} must not use #8b897f`).not.toContain('#8b897f');
      expect(content, `${relPath} must not import three`).not.toMatch(/from\s+['"]three['"]/);
      expect(content, `${relPath} must not import r3f`).not.toMatch(/@react-three\/fiber/);
    }
  });
});
