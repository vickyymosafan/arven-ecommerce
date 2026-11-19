import type { PermissionCode } from '@arven/config';
import type {
  AdminOrderDetailDto,
  CmsStatusInput,
  CouponStatusInput,
  OrderStatusInput,
  PaymentStatusInput,
  RefundStatusInput,
  ReturnStatusInput,
  ShipmentStatusInput,
  ShowroomZoneStatusInput,
} from '@arven/contracts';
import type { BadgeTone } from '@arven/ui';

export interface AdminNavItem {
  href: string;
  label: string;
  requiredPermissions?: readonly PermissionCode[];
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: '/', label: 'Overview' },
  {
    href: '/catalog/products',
    label: 'Products',
    requiredPermissions: ['product.read', 'product.write', 'product.publish'],
  },
  {
    href: '/catalog/categories',
    label: 'Categories',
    requiredPermissions: ['product.read', 'product.write'],
  },
  {
    href: '/catalog/collections',
    label: 'Collections',
    requiredPermissions: ['product.read', 'product.write'],
  },
  {
    href: '/experience/showroom',
    label: 'Showroom',
    requiredPermissions: ['asset.read', 'asset.publish'],
  },
  {
    href: '/experience/outfit-studio',
    label: 'Outfit Studio',
    requiredPermissions: ['asset.read', 'asset.publish'],
  },
  {
    href: '/inventory',
    label: 'Inventory',
    requiredPermissions: ['inventory.read', 'inventory.receive', 'inventory.adjust'],
  },
  {
    href: '/orders',
    label: 'Orders',
    requiredPermissions: ['order.read', 'order.read.limited', 'order.fulfill', 'order.cancel'],
  },
  {
    href: '/returns',
    label: 'Returns & Refunds',
    requiredPermissions: [
      'return.read',
      'return.review',
      'return.inspect',
      'return.approve',
      'refund.request',
      'refund.approve',
    ],
  },
  {
    href: '/coupons',
    label: 'Coupons',
    requiredPermissions: ['coupon.read', 'coupon.manage'],
  },
  {
    href: '/cms',
    label: 'CMS',
    requiredPermissions: ['cms.read', 'cms.write', 'cms.publish'],
  },
  {
    href: '/users',
    label: 'Users',
    requiredPermissions: ['user.read', 'user.manage.limited', 'user.role.manage'],
  },
  {
    href: '/roles',
    label: 'Roles & Permissions',
    requiredPermissions: ['user.read', 'user.role.manage'],
  },
  {
    href: '/audit-logs',
    label: 'Audit Logs',
    requiredPermissions: ['audit.read', 'audit.read.scoped'],
  },
  { href: '/ops/runtime', label: 'Runtime Health' },
];

export function filterAdminNavItems(params: {
  roles?: readonly string[] | null;
  permissions?: ReadonlySet<string> | readonly string[] | null;
  authenticated?: boolean;
}): readonly AdminNavItem[] {
  const isOwner = Boolean(params.roles?.includes('OWNER'));
  const permSet =
    params.permissions instanceof Set
      ? params.permissions
      : new Set(params.permissions ?? []);

  return ADMIN_NAV_ITEMS.filter((item) => {
    if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
      return true;
    }
    if (!params.authenticated || isOwner) {
      return true;
    }
    return item.requiredPermissions.some((code) => permSet.has(code));
  });
}

export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type AnalyticsVisibilityMode = 'full' | 'limited' | 'none';

export function getAnalyticsVisibility(params: {
  roles?: readonly string[] | null;
  permissions?: ReadonlySet<string> | readonly string[] | null;
}): AnalyticsVisibilityMode {
  if (params.roles?.includes('OWNER')) {
    return 'full';
  }
  const permSet =
    params.permissions instanceof Set
      ? params.permissions
      : new Set(params.permissions ?? []);
  if (permSet.has('analytics.read')) {
    return 'full';
  }
  if (permSet.has('analytics.read.limited')) {
    return 'limited';
  }
  return 'none';
}

export function formatStatusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

const ORDER_STATUS_TONES: Record<OrderStatusInput, BadgeTone> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'success',
  PROCESSING: 'info',
  READY_TO_SHIP: 'info',
  SHIPPED: 'info',
  DELIVERED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'neutral',
  REFUND_PENDING: 'warning',
  PARTIALLY_REFUNDED: 'warning',
  REFUNDED: 'neutral',
  RETURN_REQUESTED: 'warning',
  RETURN_APPROVED: 'info',
  RETURNED: 'neutral',
};

const PAYMENT_STATUS_TONES: Record<PaymentStatusInput, BadgeTone> = {
  PENDING: 'warning',
  AUTHORIZED: 'info',
  SETTLEMENT: 'success',
  FAILED: 'danger',
  EXPIRED: 'neutral',
  REFUND_PENDING: 'warning',
  PARTIALLY_REFUNDED: 'warning',
  REFUNDED: 'neutral',
};

const SHIPMENT_STATUS_TONES: Record<ShipmentStatusInput, BadgeTone> = {
  UNFULFILLED: 'neutral',
  READY_TO_SHIP: 'info',
  IN_TRANSIT: 'info',
  DELIVERED: 'success',
  FAILED: 'danger',
  RETURNED: 'warning',
};

const RETURN_STATUS_TONES: Record<ReturnStatusInput, BadgeTone> = {
  REQUESTED: 'warning',
  UNDER_REVIEW: 'info',
  APPROVED: 'info',
  REJECTED: 'danger',
  RECEIVED: 'success',
  REFUNDED: 'success',
  CLOSED: 'neutral',
};

const REFUND_STATUS_TONES: Record<RefundStatusInput, BadgeTone> = {
  REQUESTED: 'warning',
  APPROVED: 'info',
  PROCESSING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  REJECTED: 'danger',
};

const COUPON_STATUS_TONES: Record<CouponStatusInput, BadgeTone> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warning',
  EXPIRED: 'neutral',
  ARCHIVED: 'danger',
};

const CMS_STATUS_TONES: Record<CmsStatusInput, BadgeTone> = {
  DRAFT: 'neutral',
  PREVIEW: 'info',
  PUBLISHED: 'success',
  ARCHIVED: 'warning',
};

export function getOrderStatusBadge(status: OrderStatusInput): { label: string; tone: BadgeTone } {
  return {
    label: formatStatusLabel(status),
    tone: ORDER_STATUS_TONES[status] ?? 'neutral',
  };
}

export function getPaymentStatusBadge(
  status: PaymentStatusInput | null | undefined,
): { label: string; tone: BadgeTone } {
  if (!status) {
    return { label: 'UNPAID', tone: 'neutral' };
  }
  return {
    label: formatStatusLabel(status),
    tone: PAYMENT_STATUS_TONES[status] ?? 'neutral',
  };
}

export function getShipmentStatusBadge(
  status: ShipmentStatusInput,
): { label: string; tone: BadgeTone } {
  return {
    label: formatStatusLabel(status),
    tone: SHIPMENT_STATUS_TONES[status] ?? 'neutral',
  };
}

export function getReturnStatusBadge(
  status: ReturnStatusInput,
): { label: string; tone: BadgeTone } {
  return {
    label: formatStatusLabel(status),
    tone: RETURN_STATUS_TONES[status] ?? 'neutral',
  };
}

export function getRefundStatusBadge(
  status: RefundStatusInput,
): { label: string; tone: BadgeTone } {
  return {
    label: formatStatusLabel(status),
    tone: REFUND_STATUS_TONES[status] ?? 'neutral',
  };
}

export function getCouponStatusBadge(
  status: CouponStatusInput,
): { label: string; tone: BadgeTone } {
  return {
    label: formatStatusLabel(status),
    tone: COUPON_STATUS_TONES[status] ?? 'neutral',
  };
}

export function getCmsStatusBadge(status: CmsStatusInput): { label: string; tone: BadgeTone } {
  return {
    label: formatStatusLabel(status),
    tone: CMS_STATUS_TONES[status] ?? 'neutral',
  };
}

const SHOWROOM_ZONE_STATUS_TONES: Record<ShowroomZoneStatusInput, BadgeTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  ARCHIVED: 'warning',
};

export function getShowroomZoneStatusBadge(
  status: ShowroomZoneStatusInput,
): { label: string; tone: BadgeTone } {
  return {
    label: formatStatusLabel(status),
    tone: SHOWROOM_ZONE_STATUS_TONES[status] ?? 'neutral',
  };
}

export function canUserPublishExperience(params: {
  roles?: readonly string[] | null;
  permissions?: ReadonlySet<string> | readonly string[] | null;
}): boolean {
  if (params.roles?.includes('OWNER')) {
    return true;
  }
  const permSet =
    params.permissions instanceof Set
      ? params.permissions
      : new Set(params.permissions ?? []);
  return permSet.has('asset.publish');
}

const REFUND_ELIGIBLE_ORDER_STATUSES = new Set<string>([
  'PAID',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'RETURN_APPROVED',
  'RETURNED',
  'PARTIALLY_REFUNDED',
]);

const SETTLED_PAYMENT_STATUSES = new Set<string>([
  'SETTLEMENT',
  'PARTIALLY_REFUNDED',
  'REFUND_PENDING',
]);

const COMMITTED_REFUND_STATUSES = new Set<string>([
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'SUCCEEDED',
]);

export interface OrderRefundSummary {
  eligible: boolean;
  totalPaidIdr: number;
  committedRefundsIdr: number;
  remainingRefundableIdr: number;
}

export function computeOrderRefundSummary(order: AdminOrderDetailDto): OrderRefundSummary {
  const totalPaidIdr = order.payments
    .filter((p) => SETTLED_PAYMENT_STATUSES.has(p.status))
    .reduce((sum, p) => sum + p.amountIdr, 0);

  const committedRefundsIdr = order.refunds
    .filter((r) => COMMITTED_REFUND_STATUSES.has(r.status))
    .reduce((sum, r) => sum + r.amountIdr, 0);

  const remainingRefundableIdr = Math.max(0, totalPaidIdr - committedRefundsIdr);
  const eligible =
    REFUND_ELIGIBLE_ORDER_STATUSES.has(order.status) &&
    totalPaidIdr > 0 &&
    remainingRefundableIdr > 0;

  return {
    eligible,
    totalPaidIdr,
    committedRefundsIdr,
    remainingRefundableIdr,
  };
}

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Converts a UTC ISO string into a `YYYY-MM-DDTHH:mm` value representing Asia/Jakarta (WIB) wall time.
 */
export function toWibDateTimeInputValue(isoString: string | null | undefined): string {
  if (!isoString) {
    return '';
  }
  const parsed = Date.parse(isoString);
  if (Number.isNaN(parsed)) {
    return '';
  }
  const wibDate = new Date(parsed + JAKARTA_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = wibDate.getUTCFullYear();
  const mm = pad(wibDate.getUTCMonth() + 1);
  const dd = pad(wibDate.getUTCDate());
  const hh = pad(wibDate.getUTCHours());
  const min = pad(wibDate.getUTCMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * Converts a `YYYY-MM-DDTHH:mm` WIB wall-time input into an ISO-8601 UTC string with `+07:00` or `Z`.
 */
export function fromWibDateTimeInputValue(wibLocalValue: string): string | null {
  const trimmed = wibLocalValue.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second = '00'] = match;
  const isoWithOffset = `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`;
  const ms = Date.parse(isoWithOffset);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

export function canUserApproveRefund(params: {
  roles?: readonly string[] | null;
  permissions?: ReadonlySet<string> | readonly string[] | null;
}): boolean {
  if (params.roles?.includes('OWNER')) {
    return true;
  }
  const permSet =
    params.permissions instanceof Set
      ? params.permissions
      : new Set(params.permissions ?? []);
  return permSet.has('refund.approve');
}

export function isRestockAllowedForCondition(
  condition: 'UNOPENED' | 'GOOD' | 'DAMAGED' | 'DEFECTIVE',
): boolean {
  return condition === 'UNOPENED' || condition === 'GOOD';
}

