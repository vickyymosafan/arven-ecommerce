/**
 * Canonical platform constants shared across backend, worker, database, and UI boundary checks.
 */

export const ROLE_CODES = [
  'OWNER',
  'MANAGER',
  'PRODUCT',
  'INVENTORY',
  'ORDER',
  'CONTENT',
  'SUPPORT',
  'CUSTOMER',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ADMIN_ROLE_CODES = [
  'OWNER',
  'MANAGER',
  'PRODUCT',
  'INVENTORY',
  'ORDER',
  'CONTENT',
  'SUPPORT',
] as const satisfies readonly RoleCode[];

export type AdminRoleCode = (typeof ADMIN_ROLE_CODES)[number];

/**
 * Granular permission registry matching SECURITY_POLICY.md section 4.2 (36 canonical codes).
 */
export const PERMISSION_CODES = [
  'analytics.read',
  'analytics.read.limited',
  'analytics.export',
  'product.read',
  'product.write',
  'product.publish',
  'asset.read',
  'asset.upload',
  'asset.publish',
  'inventory.read',
  'inventory.receive',
  'inventory.adjust',
  'order.read',
  'order.read.limited',
  'order.fulfill',
  'order.cancel',
  'return.read',
  'return.review',
  'return.inspect',
  'return.approve',
  'refund.request',
  'refund.approve',
  'coupon.read',
  'coupon.manage',
  'customer.read',
  'customer.note.write',
  'review.moderate',
  'cms.read',
  'cms.write',
  'cms.publish',
  'user.read',
  'user.manage.limited',
  'user.role.manage',
  'settings.provider.manage',
  'audit.read',
  'audit.read.scoped',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const PERMISSION_DESCRIPTIONS: Record<PermissionCode, { area: string; description: string }> = {
  'analytics.read': { area: 'Sales Analytics', description: 'Full sales, conversion, cohort and 3D metrics' },
  'analytics.read.limited': { area: 'Sales Analytics', description: 'Order-volume / SLA support summary without margin/PII' },
  'analytics.export': { area: 'Sales Analytics', description: 'Export financial/analytics CSV or JSON (audit logged)' },
  'product.read': { area: 'Products & Catalog', description: 'Read draft, review, and published catalog variants and media' },
  'product.write': { area: 'Products & Catalog', description: 'Create/edit products, variants, prices, categories, collections' },
  'product.publish': { area: 'Products & Catalog', description: 'Transition product status READY_TO_PUBLISH -> PUBLISHED or ARCHIVED' },
  'asset.read': { area: '3D Assets & Presets', description: 'Read 3D asset metadata, validation runs, and presets' },
  'asset.upload': { area: '3D Assets & Presets', description: 'Request presigned upload and create 3D validation run' },
  'asset.publish': { area: '3D Assets & Presets', description: 'Approve validated READY 3D asset and customization presets' },
  'inventory.read': { area: 'Inventory & Stock', description: 'View warehouse levels, movements, and active reservations' },
  'inventory.receive': { area: 'Inventory & Stock', description: 'Append RECEIPT stock movement (+on_hand)' },
  'inventory.adjust': { area: 'Inventory & Stock', description: 'Append ADJUSTMENT movement (reason and audit required)' },
  'order.read': { area: 'Orders & Shipping', description: 'Full operational order, payment status, and shipment view' },
  'order.read.limited': { area: 'Orders & Shipping', description: 'Support order view (masked contact PII, no raw gateway payloads)' },
  'order.fulfill': { area: 'Orders & Shipping', description: 'Advance PAID -> PROCESSING -> READY_TO_SHIP and manage shipments' },
  'order.cancel': { area: 'Orders & Shipping', description: 'Cancel eligible unpaid or pre-shipment order (releases reservation)' },
  'return.read': { area: 'Returns & Refunds', description: 'View return requests, evidence, and inspection notes' },
  'return.review': { area: 'Returns & Refunds', description: 'Triage return eligibility and request details' },
  'return.inspect': { area: 'Returns & Refunds', description: 'Record physical receipt and RETURN_TO_STOCK inspection' },
  'return.approve': { area: 'Returns & Refunds', description: 'Approve or reject return claim' },
  'refund.request': { area: 'Returns & Refunds', description: 'Initiate refund request bound to order/return items' },
  'refund.approve': { area: 'Returns & Refunds', description: 'Authorize and trigger refund payout (OWNER + MFA step-up)' },
  'coupon.read': { area: 'Coupons & Promos', description: 'Inspect coupon definitions and redemption counts' },
  'coupon.manage': { area: 'Coupons & Promos', description: 'Create, update, enable/disable promotional coupons' },
  'customer.read': { area: 'Customers & Reviews', description: 'View customer profiles and order history' },
  'customer.note.write': { area: 'Customers & Reviews', description: 'Append support notes on customer/order cases' },
  'review.moderate': { area: 'Customers & Reviews', description: 'Approve or hide customer product reviews' },
  'cms.read': { area: 'CMS', description: 'View draft/published Homepage, Lookbooks, Journal, Campaigns' },
  'cms.write': { area: 'CMS', description: 'Create/edit CMS drafts' },
  'cms.publish': { area: 'CMS', description: 'Publish or archive CMS pages, articles, and lookbooks' },
  'user.read': { area: 'Users, Roles & Settings', description: 'View staff directory and role assignments' },
  'user.manage.limited': { area: 'Users, Roles & Settings', description: 'Suspend/activate customer or non-privileged staff' },
  'user.role.manage': { area: 'Users, Roles & Settings', description: 'Create/edit roles and grant/revoke any role (OWNER + MFA step-up)' },
  'settings.provider.manage': { area: 'Users, Roles & Settings', description: 'Configure payment/shipping/store settings (OWNER + MFA step-up)' },
  'audit.read': { area: 'Audit Logs', description: 'Query full immutable platform audit logs' },
  'audit.read.scoped': { area: 'Audit Logs', description: 'Query domain-scoped audit events (inventory/orders)' },
};

export const ROLE_PERMISSION_MATRIX: Record<RoleCode, readonly PermissionCode[]> = {
  OWNER: [...PERMISSION_CODES],
  MANAGER: [
    'analytics.read',
    'analytics.read.limited',
    'product.read',
    'product.write',
    'product.publish',
    'asset.read',
    'asset.upload',
    'asset.publish',
    'inventory.read',
    'inventory.receive',
    'inventory.adjust',
    'order.read',
    'order.read.limited',
    'order.fulfill',
    'order.cancel',
    'return.read',
    'return.review',
    'return.inspect',
    'return.approve',
    'refund.request',
    'coupon.read',
    'coupon.manage',
    'customer.read',
    'customer.note.write',
    'review.moderate',
    'cms.read',
    'cms.write',
    'cms.publish',
    'user.read',
    'user.manage.limited',
    'audit.read',
    'audit.read.scoped',
  ],
  PRODUCT: [
    'product.read',
    'product.write',
    'product.publish',
    'asset.read',
    'asset.upload',
    'asset.publish',
    'inventory.read',
    'order.read',
    'coupon.read',
    'cms.read',
  ],
  INVENTORY: [
    'product.read',
    'inventory.read',
    'inventory.receive',
    'inventory.adjust',
    'order.read',
    'return.read',
    'return.inspect',
    'audit.read.scoped',
  ],
  ORDER: [
    'analytics.read',
    'analytics.read.limited',
    'product.read',
    'inventory.read',
    'order.read',
    'order.read.limited',
    'order.fulfill',
    'order.cancel',
    'return.read',
    'refund.request',
    'coupon.read',
    'audit.read.scoped',
  ],
  CONTENT: [
    'product.read',
    'asset.read',
    'cms.read',
    'cms.write',
    'cms.publish',
  ],
  SUPPORT: [
    'analytics.read.limited',
    'product.read',
    'inventory.read',
    'order.read.limited',
    'order.cancel',
    'return.read',
    'return.review',
    'refund.request',
    'coupon.read',
    'customer.read',
    'customer.note.write',
    'review.moderate',
  ],
  CUSTOMER: [],
};

export const STEP_UP_REQUIRED_PERMISSIONS = [
  'user.role.manage',
  'refund.approve',
  'settings.provider.manage',
] as const satisfies readonly PermissionCode[];

export const BULLMQ_QUEUES = [
  'payment',
  'inventory',
  'order',
  'shipping',
  'notification',
  'media',
  '3d-assets',
  'analytics',
] as const;

export type BullMqQueueName = (typeof BULLMQ_QUEUES)[number];

export const QUEUE_NAMES = {
  PAYMENT: 'payment',
  INVENTORY: 'inventory',
  ORDER: 'order',
  SHIPPING: 'shipping',
  NOTIFICATION: 'notification',
  MEDIA: 'media',
  THREE_D_ASSETS: '3d-assets',
  ANALYTICS: 'analytics',
} as const satisfies Record<string, BullMqQueueName>;

export const DOMAIN_EVENTS = [
  'user.registered',
  'product.published',
  'product.variant.updated',
  'inventory.received',
  'inventory.reserved',
  'inventory.released',
  'order.created',
  'payment.pending',
  'payment.succeeded',
  'payment.failed',
  'order.ready_to_ship',
  'shipment.dispatched',
  'shipment.delivered',
  'return.requested',
  'refund.completed',
  'asset.validation.completed',
  'asset.published',
] as const;

export type DomainEventName = (typeof DOMAIN_EVENTS)[number];

export const SESSION_SCOPES = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
} as const;

export type SessionScopeType = (typeof SESSION_SCOPES)[keyof typeof SESSION_SCOPES];

export const HTTP_HEADERS = {
  REQUEST_ID: 'x-request-id',
  CSRF_TOKEN: 'x-csrf-token',
  PORTAL: 'x-arven-portal',
  IDEMPOTENCY_KEY: 'idempotency-key',
  IDEMPOTENT_REPLAYED: 'idempotent-replayed',
} as const;

export const CSRF_COOKIE_NAME = 'arven_csrf';
export const CSRF_PROD_COOKIE_NAME = '__Host-arven_csrf';

export const GUEST_CART_COOKIE_NAME = 'arven_guest_cart';
export const GUEST_CART_PROD_COOKIE_NAME = '__Host-arven_guest_cart';
export const DEFAULT_WAREHOUSE_CODE = 'JKT-MAIN-01';

export const CART_POLICY = {
  GUEST_CART_TTL_DAYS: 30,
  GUEST_TOKEN_BYTES: 32,
  MAX_LINE_QUANTITY: 99,
  MAX_CONFIGURATION_KEYS: 16,
} as const;

export const IDEMPOTENCY_POLICY = {
  MIN_KEY_LENGTH: 16,
  MAX_KEY_LENGTH: 128,
  TTL_HOURS: 24,
  IN_PROGRESS_RETRY_AFTER_SECONDS: 2,
} as const;

export const AUTH_POLICY = {
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_MAX_LENGTH: 128,
  ARGON2_MEMORY_COST_KIB: 65536,
  ARGON2_TIME_COST: 3,
  ARGON2_PARALLELISM: 4,
  ARGON2_HASH_LENGTH: 32,
  STEP_UP_MAX_AGE_MINUTES: 15,
  RESET_TOKEN_TTL_MINUTES: 30,
  VERIFY_TOKEN_TTL_HOURS: 24,
  CUSTOMER_SESSION_TTL_HOURS: 24 * 7,
  CUSTOMER_ABSOLUTE_TTL_DAYS: 30,
  ADMIN_SESSION_TTL_HOURS: 12,
  ADMIN_IDLE_TIMEOUT_MINUTES: 30,
  TOTP_ISSUER: 'ARVEN Admin',
} as const;
