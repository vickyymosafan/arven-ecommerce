import { Inject, Injectable } from '@nestjs/common';
import type {
  Admin3DEngagementAnalyticsDto,
  AdminOrderStatusCountDto,
  AdminSalesAnalyticsDto,
  AdminSalesDailyPointDto,
} from '@arven/contracts';
import { AssetStatus, OrderStatus, RefundStatus, ReturnStatus } from '@arven/database';
import type { AnalyticsSalesQuery, OrderStatusInput } from '@arven/validators';
import type { Redis } from 'ioredis';
import type { AuthenticatedActor } from '../../common/security/index.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../shared/redis/redis.module.js';
import { TELEMETRY_3D_REDIS_KEY } from '../catalog/assets3d.service.js';

const PAID_LIKE_ORDER_STATUSES = new Set<OrderStatus>([
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.READY_TO_SHIP,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
  OrderStatus.REFUND_PENDING,
  OrderStatus.PARTIALLY_REFUNDED,
  OrderStatus.REFUNDED,
  OrderStatus.RETURN_REQUESTED,
  OrderStatus.RETURN_APPROVED,
  OrderStatus.RETURNED,
]);

const FULFILLED_ORDER_STATUSES = new Set<OrderStatus>([
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
]);

const CANCELLED_OR_EXPIRED_STATUSES = new Set<OrderStatus>([
  OrderStatus.CANCELLED,
  OrderStatus.EXPIRED,
]);

const OPEN_RETURN_STATUSES = new Set<ReturnStatus>([
  ReturnStatus.REQUESTED,
  ReturnStatus.UNDER_REVIEW,
  ReturnStatus.APPROVED,
  ReturnStatus.RECEIVED,
]);

const PENDING_REFUND_STATUSES = new Set<RefundStatus>([
  RefundStatus.REQUESTED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSING,
]);

const JAKARTA_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toJakartaDateKey(date: Date): string {
  return JAKARTA_DATE_FORMATTER.format(date);
}

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getSalesAnalytics(
    actor: AuthenticatedActor,
    query: AnalyticsSalesQuery,
  ): Promise<AdminSalesAnalyticsDto> {
    const limitedView = !actor.permissions.includes('analytics.read');
    const days = query.days;
    const now = new Date();
    const since = new Date(now.getTime() - (days - 1) * 86_400_000);
    since.setUTCHours(0, 0, 0, 0);

    const [orders, returns, refunds] = await Promise.all([
      this.prisma.client.order.findMany({
        where: { createdAt: { gte: since } },
        select: {
          status: true,
          grandTotalIdr: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      this.prisma.client.return.findMany({
        where: { createdAt: { gte: since } },
        select: {
          status: true,
        },
      }),
      this.prisma.client.refund.findMany({
        where: {
          OR: [
            { createdAt: { gte: since } },
            { completedAt: { gte: since } },
          ],
        },
        select: {
          status: true,
          amountIdr: true,
          completedAt: true,
          createdAt: true,
        },
      }),
    ]);

    const statusCounts = new Map<OrderStatus, number>();
    let totalOrders = 0;
    let paidOrders = 0;
    let pendingPaymentOrders = 0;
    let fulfilledOrders = 0;
    let cancelledOrExpiredOrders = 0;
    let grossSalesIdrSum = 0;

    const dailyBuckets = new Map<
      string,
      {
        orderCount: number;
        paidOrderCount: number;
        grossSalesIdr: number;
        refundedIdr: number;
      }
    >();

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const d = new Date(now.getTime() - offset * 86_400_000);
      const key = toJakartaDateKey(d);
      if (!dailyBuckets.has(key)) {
        dailyBuckets.set(key, {
          orderCount: 0,
          paidOrderCount: 0,
          grossSalesIdr: 0,
          refundedIdr: 0,
        });
      }
    }

    for (const order of orders) {
      totalOrders += 1;
      statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);

      const isPaid =
        order.paidAt !== null || PAID_LIKE_ORDER_STATUSES.has(order.status);
      if (isPaid) {
        paidOrders += 1;
        grossSalesIdrSum += Number(order.grandTotalIdr);
      }
      if (order.status === OrderStatus.PENDING_PAYMENT) {
        pendingPaymentOrders += 1;
      }
      if (FULFILLED_ORDER_STATUSES.has(order.status)) {
        fulfilledOrders += 1;
      }
      if (CANCELLED_OR_EXPIRED_STATUSES.has(order.status)) {
        cancelledOrExpiredOrders += 1;
      }

      const dateKey = toJakartaDateKey(order.createdAt);
      const bucket = dailyBuckets.get(dateKey) ?? {
        orderCount: 0,
        paidOrderCount: 0,
        grossSalesIdr: 0,
        refundedIdr: 0,
      };
      bucket.orderCount += 1;
      if (isPaid) {
        bucket.paidOrderCount += 1;
        bucket.grossSalesIdr += Number(order.grandTotalIdr);
      }
      dailyBuckets.set(dateKey, bucket);
    }

    let openReturnsCount = 0;
    const totalReturnsCount = returns.length;
    for (const ret of returns) {
      if (OPEN_RETURN_STATUSES.has(ret.status)) {
        openReturnsCount += 1;
      }
    }

    let pendingRefundRequestsCount = 0;
    let totalRefundedIdrSum = 0;
    for (const refund of refunds) {
      if (PENDING_REFUND_STATUSES.has(refund.status)) {
        pendingRefundRequestsCount += 1;
      }
      if (refund.status === RefundStatus.SUCCEEDED) {
        const amt = Number(refund.amountIdr);
        totalRefundedIdrSum += amt;
        const refundDate = refund.completedAt ?? refund.createdAt;
        const dateKey = toJakartaDateKey(refundDate);
        const bucket = dailyBuckets.get(dateKey);
        if (bucket) {
          bucket.refundedIdr += amt;
        }
      }
    }

    const statusBreakdown: AdminOrderStatusCountDto[] = Array.from(
      statusCounts.entries(),
    ).map(([status, count]) => ({
      status: status as OrderStatusInput,
      count,
    }));

    const dailySeries: AdminSalesDailyPointDto[] = Array.from(dailyBuckets.entries())
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .map(([date, bucket]) => ({
        date,
        orderCount: bucket.orderCount,
        paidOrderCount: bucket.paidOrderCount,
        grossSalesIdr: limitedView ? null : bucket.grossSalesIdr,
        netSalesIdr: limitedView
          ? null
          : Math.max(0, bucket.grossSalesIdr - bucket.refundedIdr),
      }));

    const netSalesIdr = Math.max(0, grossSalesIdrSum - totalRefundedIdrSum);
    const averageOrderValueIdr =
      paidOrders > 0 ? Math.round(grossSalesIdrSum / paidOrders) : 0;
    const paymentSuccessRatePct =
      totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 1000) / 10 : 0;
    const returnRatePct =
      paidOrders > 0
        ? Math.round((totalReturnsCount / paidOrders) * 1000) / 10
        : 0;

    return {
      days,
      limitedView,
      currency: 'IDR',
      totalOrders,
      paidOrders,
      pendingPaymentOrders,
      fulfilledOrders,
      cancelledOrExpiredOrders,
      openReturnsCount,
      totalReturnsCount,
      pendingRefundRequestsCount,
      grossSalesIdr: limitedView ? null : grossSalesIdrSum,
      netSalesIdr: limitedView ? null : netSalesIdr,
      totalRefundedIdr: limitedView ? null : totalRefundedIdrSum,
      averageOrderValueIdr: limitedView ? null : averageOrderValueIdr,
      paymentSuccessRatePct: limitedView ? null : paymentSuccessRatePct,
      returnRatePct: limitedView ? null : returnRatePct,
      statusBreakdown,
      dailySeries,
      generatedAt: now.toISOString(),
    };
  }

  async get3DEngagementAnalytics(): Promise<Admin3DEngagementAnalyticsDto> {
    const [readyAssetsCount, productsWith3DCount, telemetryMap] = await Promise.all([
      this.prisma.client.product3DAsset.count({
        where: { status: AssetStatus.READY, isActiveVersion: true },
      }),
      this.prisma.client.product.count({
        where: { has3dEnabled: true, deletedAt: null },
      }),
      this.redis.hgetall(TELEMETRY_3D_REDIS_KEY).catch(() => ({} as Record<string, string>)),
    ]);

    const readCount = (field: string): number => {
      const parsed = Number.parseInt(telemetryMap[field] ?? '0', 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };

    return {
      viewerOpenedCount: readCount('viewer_opened'),
      presetSelectedCount: readCount('preset_selected'),
      cameraPresetCount: readCount('camera_preset'),
      fallbackTriggeredCount: readCount('fallback_triggered'),
      loadErrorCount: readCount('load_error'),
      contextLostCount: readCount('context_lost'),
      readyAssetsCount,
      productsWith3DCount,
      generatedAt: new Date().toISOString(),
    };
  }
}
