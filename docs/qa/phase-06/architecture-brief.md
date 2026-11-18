# ARVEN Phase 06 — Architecture & Clean Boundaries Brief

> **Phase:** Phase 06 — Admin Operations Dashboard, Order Fulfillment & Shipments, Returns & Dual-Step Refunds, Coupons, CMS & Audit Logs  
> **Plan ID:** `c3f9e082-a528-4293-a98b-ad26d1a2dd87`  
> **Task ID:** `4afb3830-3717-4ea3-ae00-d3dd9132cd6d` (`architecture-lead`)  
> **Baseline Sources:** [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) (§§3–4), [`docs/API_CONTRACTS.md`](../../API_CONTRACTS.md) (§§8.6–8.8), [`docs/DATA_MODEL.md`](../../DATA_MODEL.md) (Domains 6–11), [`docs/qa/phase-06/discovery-report.md`](./discovery-report.md), [`docs/qa/phase-06/governance-brief.md`](./governance-brief.md)

---

## 1. Shared Contracts & Validation Surface

All Phase 06 HTTP inputs, query filters, and response payloads flow through a single Zod-first contract boundary:

- **`packages/validators` (`@arven/validators`, Zod v4 Standard Schema):**
  - `src/admin-ops.ts`: `shipmentStatusSchema`, `couponStatusSchema`, `adminOrdersQuerySchema`, `adminTransitionOrderSchema`, `adminCreateShipmentSchema`, `adminCouponsQuerySchema`, `createCouponSchema`, `updateCouponSchema`, `analyticsSalesQuerySchema`.
  - `src/returns.ts`: `returnStatusSchema`, `returnItemConditionSchema`, `refundStatusSchema`, `customerReturnItemInputSchema`, `createCustomerReturnSchema`, `adminReturnsQuerySchema`, `reviewReturnSchema`, `approveReturnSchema`, `receiveReturnItemSchema`, `receiveReturnSchema`, `adminRefundsQuerySchema`, `requestRefundSchema`, `approveRefundSchema`.
  - `src/cms.ts`: `cmsStatusSchema`, `adminCmsListQuerySchema`, `cmsPageBlockSchema`, `cmsPageBlocksSchema`, `createCmsPageSchema`, `updateCmsPageSchema`, `cmsLookbookSlideSchema`, `createCmsLookbookSchema`, `updateCmsLookbookSchema`, `cmsJournalBodySchema`, `createCmsJournalSchema`, `updateCmsJournalSchema`, `transitionCmsStatusSchema`.
  - All JSON mutation bodies use `z.strictObject(...)` to reject mass-assignment keys (`status`, `requestedBy`, `approvedBy`, `usedCount`, `publishedAt`). Pagination enforces `page >= 1` and `1 <= limit <= 100`.
- **`packages/contracts` (`@arven/contracts`):**
  - Re-exports inferred request/query/enum types from `@arven/validators` and defines DTO interfaces: `ShipmentEventDto`, `ShipmentDto`, `AdminOrderSummaryDto`, `AdminOrderDetailDto` (extends `OrderDetailDto` with `userId`, `customerEmail`, `piiMasked`, `shipments`, `returns`, `refunds`), `ReturnItemDto`, `ReturnDetailDto`, `RefundDto`, `AdminCouponDto`, `CmsPageBlockDto`, `CmsPageDto`, `CmsLookbookSlideDto`, `CmsLookbookDto`, `CmsJournalArticleDto`, `AdminSalesDailyPointDto`, `AdminOrderStatusCountDto`, and `AdminSalesAnalyticsDto`.

---

## 2. Backend Clean Architecture (`apps/api`, NestJS 12 ESM)

Every new module follows native ESM (`NodeNext`, explicit `.js` relative imports) and passes `StandardSchemaValidationPipe` + global guards (`ArvenThrottlerGuard` → `CsrfGuard` → `SessionAuthGuard` → `MfaEnforcementGuard` → `PermissionGuard`). Cross-module communication uses exported NestJS application services or transactional `outbox_events` via `OutboxWriterService` — never direct imports of another module's private Prisma repositories.

### 2.1 New Modules

#### A. `returns` (Critical 4-Layer Module: `apps/api/src/modules/returns/`)
```text
src/modules/returns/
├── domain/
│   ├── entities/return.entity.ts          # ReturnStatus state machine (REQUESTED -> UNDER_REVIEW -> APPROVED/REJECTED -> RECEIVED -> REFUNDED/CLOSED)
│   ├── errors/returns-domain.error.ts     # ReturnWindowExpired, ReturnQuantityExceeded, InvalidReturnState
│   ├── events/returns.events.ts           # Typed 'return.requested' outbox event payload
│   └── ports/returns.ports.ts             # RETURNS_REPOSITORY Symbol + repository interface
├── application/services/returns.service.ts # Ownership/guest-token check, IdempotencyService, tx orchestration
├── infrastructure/
│   ├── mappers/returns.mapper.ts          # Maps Return/ReturnItem + SUPPORT PII masking
│   └── repositories/prisma-returns.repository.ts # SELECT ... FOR UPDATE on orders & returns
├── presentation/
│   ├── returns.controller.ts              # Customer POST /orders/:id/returns, GET /returns/:id
│   └── admin-returns.controller.ts        # Admin GET/review/approve/receive endpoints
└── returns.module.ts                      # Imports OrdersModule, InventoryModule, AuditNotificationsModule
```
- **Restock Boundary:** `ReturnsService.receiveReturn()` locks `returns` `FOR UPDATE`, validates `status === 'APPROVED'`, updates `return_items.restocked = true` conditionally (`WHERE id = $1 AND restocked = false`) only when `condition IN ('UNOPENED', 'GOOD') && restock === true && variantId !== null`, and delegates stock increment to `InventoryService.returnStockFromInspection(tx, ...)` inside the **same `prisma.$transaction`**.

#### B. `shipping` (`apps/api/src/modules/shipping/`)
- **Ownership:** `Shipment` & `ShipmentEvent` lifecycle (`UNFULFILLED -> READY_TO_SHIP -> IN_TRANSIT -> DELIVERED | FAILED | RETURNED`).
- **Controllers & Services:** `AdminShippingController` (`POST /admin/orders/:id/shipments`, `POST /admin/shipments/:id/sync-tracking`), `ShippingService`, `ShippingMapper`.
- **Ports & Adapters:** Consumes injected `SHIPPING_PROVIDER` (`ShippingProvider` from `apps/api/src/shared/adapters/shipping.provider.ts`, backed by `DeterministicShippingProvider` in local/test).
- **Order Sync Boundary:** Shipment creation and tracking sync invoke exported `OrdersService` / `OrdersModule` transaction helpers (or shared `tx` callback) to advance `OrderStatus` (`READY_TO_SHIP -> SHIPPED -> DELIVERED`), append `order_status_history`, write `audit_logs`, and emit `shipment.dispatched` / `shipment.delivered` to `outbox_events`.

#### C. `coupons` (`apps/api/src/modules/coupons/`)
- **Ownership:** `Coupon` CRUD (`GET /admin/coupons`, `POST /admin/coupons`, `PATCH /admin/coupons/:id`, `DELETE /admin/coupons/:id`).
- **Validation & Invariants:** Enforces unique uppercase `code`, `discountType === 'PERCENTAGE'` bounds (`1..100`), `endsAt > startsAt` (including partial `PATCH` cross-validation against persisted DB timestamps/type), and `AuditLogService` logging on all mutations (`coupon.created`, `coupon.updated`, `coupon.deleted`/`archived`).

#### D. `cms` (`apps/api/src/modules/cms/`)
- **Ownership:** `Page`, `Lookbook`, and `JournalArticle` editorial entities.
- **Controllers:**
  - `CmsPublicController` (`@Public()`): `GET /cms/pages/:slug`, `GET /cms/lookbooks`, `GET /cms/lookbooks/:slug`, `GET /cms/journal`, `GET /cms/journal/:slug`. Strictly filters `status = 'PUBLISHED' AND deletedAt IS NULL`.
  - `AdminCmsController` (`@AdminAuth()`): CRUD + `POST .../transition` for pages, lookbooks, and journal articles.
- **Permission Separation:** `cms.write` allows CRUD and `DRAFT <-> PREVIEW`; `cms.publish` is verified inside the transition handler before allowing transitions to `PUBLISHED` (setting `publishedAt = NOW()`) or `ARCHIVED`. Soft deletes stamp `deletedAt` and emit `audit_logs`.

#### E. `analytics` (`apps/api/src/modules/analytics/`)
- **Ownership:** Server-authoritative KPI aggregation (`GET /admin/analytics/sales?days=30`).
- **Role-Based Projection:** Evaluates `actor.permissions.includes('analytics.read')` vs `analytics.read.limited`:
  - Full (`analytics.read`): computes `grossSalesIdr`, `netSalesIdr`, `totalRefundedIdr`, `averageOrderValueIdr`, `paymentSuccessRatePct`, `returnRatePct`, and daily IDR series from `orders`, `payments`, `refunds`, and `returns`.
  - Limited (`analytics.read.limited` / `SUPPORT`): sets `limitedView = true`, returns operational counts (`totalOrders`, `paidOrders`, `fulfilledOrders`, `openReturnsCount`, `statusBreakdown`, daily order counts), and sets all IDR/financial fields to `null`.

### 2.2 Extensions to Existing `apps/api` Modules

| Existing Module | Files / Services Extended | Phase 06 Responsibilities |
|---|---|---|
| `orders` (4-layer) | `OrdersService`, `OrdersMapper`, `PrismaOrdersRepository`, new `AdminOrdersController` | Add `GET /admin/orders`, `GET /admin/orders/:id`, `POST /admin/orders/:id/transition`. Enforce `order.fulfill` for `PROCESSING`/`READY_TO_SHIP`/`SHIPPED`/`DELIVERED`/`COMPLETED` and `order.cancel` for `CANCELLED` (blocking `SUPPORT` post-shipment). Apply `SUPPORT` (`order.read.limited`) PII masking (`a***@domain.com`, `****5678`, masked street/recipient, `piiMasked: true`) and payment gateway redaction. Export `OrdersModule` transaction helpers for `shipping` & `returns`. |
| `payments` (4-layer) | `PaymentsService`, `PrismaPaymentsRepository`, `PaymentsMapper`, new `AdminRefundsController` | Add `GET /admin/refunds`, `POST /admin/orders/:id/refunds/request` (`refund.request` + `Idempotency-Key`), and `POST /admin/refunds/:id/approve` (`refund.approve` + `@RequireMfaStepUp(900)` + `Idempotency-Key`). Lock `orders`/`payments`/`refunds` `FOR UPDATE`, bound cumulative refunds to `<= totalPaidIdr`, invoke `PAYMENT_PROVIDER.refund(...)`, update `PaymentStatus`/`OrderStatus`/`ReturnStatus`, record both `requestedBy` and `approvedBy` in `audit_logs`, and emit `refund.completed` outbox event. |
| `inventory` | `InventoryService` | Add `returnStockFromInspection(tx: PrismaTransactionClient, input)` executing atomic `UPDATE inventory_levels SET quantity_on_hand = quantity_on_hand + qty, updated_at = NOW()` + append-only `InventoryMovementType.RETURN_TO_STOCK` (`referenceType = 'RETURN'`) inside caller's transaction. Export `InventoryService` from `InventoryModule`. |
| `app.module.ts` | `AppModule` | Register `ShippingModule`, `ReturnsModule`, `CouponsModule`, `CmsModule`, and `AnalyticsModule`. |

---

## 3. Asynchronous Worker (`apps/worker`, NestJS 12 + BullMQ 6)

- **Outbox Routing (`apps/worker/src/outbox/outbox-routing.ts`):**
  - `shipment.*` routes to `QUEUE_NAMES.SHIPPING`.
  - `return.*` routes to `QUEUE_NAMES.ORDER`.
  - `refund.*` routes to `QUEUE_NAMES.PAYMENT`.
- **New `ShippingProcessor` (`apps/worker/src/processors/shipping.processor.ts`):**
  - `@Processor(QUEUE_NAMES.SHIPPING)`, registered in `WorkerModule`.
  - Handles `shipment.dispatched` and `shipment.delivered` jobs idempotently, resolves order recipient metadata from `WorkerPrismaService`, and enqueues customer email notifications onto `QUEUE_NAMES.NOTIFICATION`.
- **Existing Processor Extensions:**
  - `OrderProcessor` (`QUEUE_NAMES.ORDER`): handle `return.requested` and enqueue customer return confirmation onto `QUEUE_NAMES.NOTIFICATION`.
  - `PaymentProcessor` (`QUEUE_NAMES.PAYMENT`): handle `refund.completed` and enqueue refund receipt onto `QUEUE_NAMES.NOTIFICATION`.
  - `NotificationsProcessor` (`QUEUE_NAMES.NOTIFICATION`): add `SUBJECT_BY_EVENT` templates for `shipment.dispatched`, `shipment.delivered`, `return.requested`, and `refund.completed`.

---

## 4. Frontend Applications (`apps/admin` & `apps/storefront`, Next.js 16 + React 19)

Both apps communicate exclusively over same-origin `/api/v1/*` proxy routes (`src/proxy.ts`), consume `@arven/contracts` + `@arven/validators`, format IDR with `formatIDR()` + `tabular-nums`, format dates in `Asia/Jakarta` (`WIB`) via `formatWIB()`, use `X-CSRF-Token` on mutations, and obey `DESIGN.md` tokens (zero `#8B897F` light-mode text, zero pink, zero em dashes).

### 4.1 `apps/admin`
- **`AdminShell` Navigation (`src/components/admin-shell.tsx`):** Gate nav items by RBAC permissions (`orders`, `returns`, `coupons`, `cms`, `audit-logs`, etc.).
- **Overview (`src/app/page.tsx`):** Replace static placeholders with live `GET /admin/analytics/sales` KPIs (`AdminSalesAnalyticsDto`, honoring `limitedView` for `SUPPORT`).
- **Operations Routes:**
  - `/orders` (`src/app/orders/page.tsx`): Search/status filter, `piiMasked` indicator, pagination.
  - `/orders/[id]` (`src/app/orders/[id]/page.tsx`): Line items, status transition controls, shipment creation (`jne-adapter` / `sicepat-adapter`) & tracking sync, refund request modal (`Idempotency-Key`).
  - `/returns` (`src/app/returns/page.tsx`): Return queue, review/approve actions, physical receipt & per-item inspection (`UNOPENED | GOOD | DAMAGED | DEFECTIVE`, `restock`), and `OWNER`-only refund approval queue integrated with `MfaStepUpModal` (`@RequireMfaStepUp(900)`).
  - `/coupons` (`src/app/coupons/page.tsx`): Coupons list, create/edit drawer enforcing `PERCENTAGE <= 100` & `endsAt > startsAt`.
  - `/cms` (`src/app/cms/page.tsx`): Tabs for Pages, Lookbooks, and Journal Articles with structured editor and `DRAFT -> PREVIEW -> PUBLISHED -> ARCHIVED` workflow (`cms.publish` gated).

### 4.2 `apps/storefront`
- **Editorial Routes & Header Navigation:**
  - `/lookbook` & `/lookbook/[slug]` (`GET /cms/lookbooks`, `GET /cms/lookbooks/:slug`)
  - `/journal` & `/journal/[slug]` (`GET /cms/journal`, `GET /cms/journal/:slug`)
  - Add Lookbook & Journal links into `StorefrontShell` header/navigation.
- **Customer Returns:**
  - `/account/orders/[orderNumber]` (`order-detail-view.tsx`): Enable "Request Return" action when `order.status === 'DELIVERED'` (`POST /orders/:id/returns` with `Idempotency-Key` + `X-CSRF-Token`).
  - `/account/returns` (`src/app/account/returns/page.tsx`): Customer return tracking list & detail timeline (`GET /returns/:id`).

---

## 5. Strict Phase 07–08 Scope Boundary

Phase 06 excludes all 3D/WebGL assets and experiences: no `packages/three-engine`, no `three` / `@react-three/fiber` / `@react-three/drei`, no `/decoders/` WASM assets, no `3d-assets` worker or `/admin/products/:id/3d-assets/*` endpoints, and no `/showroom` or `/outfit-studio` routes.
