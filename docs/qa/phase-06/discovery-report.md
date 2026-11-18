# ARVEN Phase 06 Discovery Report

> **Phase:** Phase 06 - Admin Operations Dashboard, Order Fulfillment & Shipments, Returns & Dual-Step Refunds, Coupons, CMS & Audit Logs  
> **Plan ID:** `c3f9e082-a528-4293-a98b-ad26d1a2dd87`  
> **Task ID:** `929a6018-7d08-426e-85cb-66c633e5e4e1` (`discovery-lead`)  
> **Runtime Topology:** Non-Docker Windows (`PostgreSQL 18` listening on `5432`, `Memurai` listening on `127.0.0.1:6379`)

---

## 1. Baseline & Existing Infrastructure

- **Prior Gate:** Phase 05 (`7046df9d-13df-413d-b6ae-2ebaaaa6ddd9`) passed all 8 harness checkpoints (`docs/PHASE_05_VERIFICATION_RECEIPT.md`, verdict `RELEASE_READY`).
- **Database Schema Already Migrated (`0001_phase02_core/migration.sql`):**
  - All Phase 06 tables exist cleanly with SQL constraints: `orders`, `order_items`, `order_status_history`, `payments`, `refunds` (`chk_refund_amount_pos`), `shipments`, `shipment_events`, `coupons` (`chk_coupon_value_pos`, `chk_coupon_pct_bounds`), `coupon_redemptions`, `returns`, `return_items` (`chk_return_item_qty_pos`), `pages`, `journal_articles`, `lookbooks`, `media_assets`, `audit_logs`.
- **Existing Admin Modules (`apps/admin`):** `/login`, `/mfa/setup`, `/mfa/verify`, `/` Overview (RBAC inspector), `/catalog/products`, `/catalog/categories`, `/catalog/collections`, `/inventory`, `/users`, `/roles`, `/audit-logs`, `/ops/runtime`.
- **Existing API Security & Adapters:** `MfaEnforcementGuard`, `PermissionGuard` (`RequirePermissions`, `RequireAnyPermission`, `RequireMfaStepUp`), `checkRouteAuthMetadata`, `MfaStepUpModal`, `ShippingProvider` (`DeterministicShippingProvider`), `PaymentProvider` (`MidtransPaymentAdapter` / `LocalStubPaymentAdapter`).

## 2. Phase 06 Target Deliverables

1. **Shared Foundation (`packages/validators`, `packages/contracts`, `packages/database/src/seed.ts`):**
   - Zod v4 `.strict()` schemas + DTO contracts for Admin Orders & Shipments, Customer/Admin Returns, Dual-Step Refunds (`refund.request` -> `refund.approve`), Coupons CRUD, Editorial CMS (`Page`, `Lookbook`, `JournalArticle` `DRAFT -> PREVIEW -> PUBLISHED -> ARCHIVED`), and Admin Sales KPI Analytics (`analytics.read` / `analytics.read.limited`).
   - Idempotent seed additions for initial Editorial Lookbook (`essentials-aw26`), Journal Articles, and CMS `about` page.
2. **Backend (`apps/api`) & Worker (`apps/worker`):**
   - **Orders & Shipments:** `GET /admin/orders`, `GET /admin/orders/:id` (with `order.read.limited` email/phone PII masking & gateway redaction), `POST /admin/orders/:id/transition`, `POST /admin/orders/:id/shipments` (`ShippingProvider.createShipment`), `POST /admin/shipments/:id/sync-tracking` (`ShippingProvider.getTracking`).
   - **Returns & Dual-Step Refunds:** Customer `POST /orders/:id/returns` (`Idempotency-Key`, item/qty validation on `DELIVERED` orders) & `GET /returns/:id`; Admin `GET /admin/returns`, `GET /admin/returns/:id`, `POST /admin/returns/:id/review` (`return.review`), `POST /admin/returns/:id/approve` (`return.approve`), `POST /admin/returns/:id/receive` (`return.inspect` -> `RETURN_TO_STOCK` inventory movement + atomic `quantity_on_hand` increment); Refunds `GET /admin/refunds`, `POST /admin/orders/:id/refunds/request` (`refund.request`, `Idempotency-Key`), `POST /admin/refunds/:id/approve` (`refund.approve`, `OWNER`-exclusive `@RequireMfaStepUp(900)`, `Idempotency-Key`, records both `requestedBy` and `approvedBy` in `audit_logs`).
   - **Coupons:** `GET/POST/PATCH /admin/coupons` (`coupon.read` / `coupon.manage`).
   - **CMS & Analytics:** Public `GET /cms/pages/:slug`, `/cms/lookbooks`, `/cms/lookbooks/:slug`, `/cms/journal`, `/cms/journal/:slug`; Admin `GET/POST/PATCH/DELETE /admin/cms/*` + `POST .../transition` (`cms.read`/`cms.write`/`cms.publish`); `GET /admin/analytics/sales` (`analytics.read` / `analytics.read.limited`).
   - **Worker:** `ShippingProcessor` (`QUEUE_NAMES.SHIPPING`) + `return.requested` / `refund.completed` notification handling.
3. **Frontend (`apps/admin` & `apps/storefront`):**
   - **Admin (`/`, `/orders`, `/orders/[id]`, `/returns`, `/coupons`, `/cms`):** Permission-gated `AdminShell` nav, real server Overview KPIs (zero fabricated deltas), Order fulfillment + shipment dispatch + tracking sync + refund request, Returns inspection (`RETURN_TO_STOCK`) + `OWNER` MFA step-up refund approval, Coupons CRUD, CMS editor & publish state machine.
   - **Storefront (`/lookbook`, `/lookbook/[slug]`, `/journal`, `/journal/[slug]`, `/account/returns`, `/account/orders/[orderNumber]`):** Editorial Lookbook & Journal pages + header nav links, Customer return submission on `DELIVERED` orders + `/account/returns` tracking.

## 3. Strict Phase Boundary

Zero Phase 07–08 3D assets, presigned GLB upload, R3F 9 product viewer, Virtual Showroom, or Outfit Studio code belongs in Phase 06 (`3d-rendering` excluded).
