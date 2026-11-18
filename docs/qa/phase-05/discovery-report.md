# ARVEN Phase 05 Discovery Report

> **Phase:** Phase 05 - Checkout Quote, Order State Machine, Midtrans Payment & Expiry Worker  
> **Plan ID:** `7046df9d-13df-413d-b6ae-2ebaaaa6ddd9`  
> **Task ID:** `979de011-d3d3-454e-892f-381f6afad45f` (`discovery-lead`)  
> **Runtime Topology:** Non-Docker Windows (`PostgreSQL 18` listening on `5432`, `Memurai` listening on `127.0.0.1:6379`)

---

## 1. Baseline & Environment Verification

- **Prior Gate:** Phase 04 (`1a47de03-ee06-469d-936b-8d01ef5b28cc`) passed all 8 harness checkpoints (`docs/PHASE_04_VERIFICATION_RECEIPT.md`, verdict `RELEASE_READY`).
- **Database Schema & Constraints Already Migrated (`0001_phase02_core/migration.sql`):**
  - Tables present: `orders`, `order_items`, `order_status_history`, `payments`, `payment_events`, `stock_reservations`, `coupons`, `coupon_redemptions`, `addresses`, `inventory_levels`, `inventory_movements`, `outbox_events`, `idempotency_records`.
  - Manual SQL `CHECK` constraints verified present: `chk_inventory_on_hand_nonneg`, `chk_inventory_reserved_nonneg`, `chk_inventory_reserved_lte_on_hand`, `chk_stock_reservation_qty_pos`, `chk_inventory_movement_delta_nonzero`, `chk_order_totals_nonneg`, `chk_order_owner_or_guest`, `chk_order_item_qty_pos`, `chk_order_item_unit_price_nonneg`, `chk_order_item_line_total_nonneg`, `chk_payment_amount_pos`, `chk_coupon_value_pos`, `chk_coupon_pct_bounds`.
  - **Signed Ledger Convention (`docs/DATA_MODEL.md` section 7):** `RESERVATION` -> `+qty`, `SALE` -> `-qty`, `RELEASE` -> `-qty`. Multi-variant updates sort strictly by `variant_id ASC` to avoid circular lock waits.
- **Live Infra Check:** TCP listeners verified active on `5432` (PostgreSQL 18) and `127.0.0.1:6379` (Memurai).

## 2. Context7 API Verification Summary

1. **BullMQ `v6.5.3` (`/taskforcesh/bullmq/v6.5.3`):** Repeatable scheduled sweeps use `queue.upsertJobScheduler(schedulerId, { every: 60000 }, { name, data, opts })` alongside NestJS `@Processor` workers.
2. **Next.js `v16.1.6` (`/vercel/next.js/v16.1.6`):** With `cacheComponents: true`, runtime routes reading cookies, `params`, or `useSearchParams()` (`/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, `/account/orders/[orderNumber]`) wrap dynamic client islands / async param access inside React `<Suspense>` boundaries.
3. **Prisma `v7.10.1` (`/prisma/orm/7.10.1`):** Interactive `prisma.$transaction` (`withTransaction`) + `$queryRaw` / `$executeRaw` `FOR UPDATE` locking and `@prisma/adapter-pg` preserve atomicity without legacy patterns.

## 3. Existing Workspace Gaps & Phase 05 Workstreams

- `packages/config`: needs `HTTP_HEADERS.GUEST_ORDER_TOKEN` (`'x-guest-order-token'`), `CHECKOUT_POLICY`, deterministic shipping provider codes, and optional `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION` runtime env validation (allowing `local_stub` in non-production while enforcing strict Midtrans credentials when `PAYMENT_DRIVER=midtrans`).
- `packages/database/src/seed.ts`: needs idempotent promotional coupon seed (`WELCOME10`) for live quote/checkout validation.
- `packages/validators` & `packages/contracts`: needs strict `.strict()` checkout/order/payment schemas (`checkoutQuoteRequestSchema`, `createOrderRequestSchema`, `createPaymentSessionRequestSchema`, `cancelOrderRequestSchema`, `listOrdersQuerySchema`, `midtransWebhookPayloadSchema`) and response DTOs (`CheckoutQuoteDto`, `CreateOrderResultDto`, `OrderDetailDto`, `OrderSummaryDto`, `PaymentSessionDto`, `PaymentSummaryDto`, `MidtransWebhookAckDto`).
- `apps/api`:
  - `main.ts`: add `'X-Guest-Order-Token'` to CORS `allowedHeaders`.
  - `shared/adapters/`: add `ShippingProvider` (`DeterministicShippingProvider`) and `PaymentProvider` (`MidtransPaymentAdapter` + `LocalStubPaymentAdapter` non-prod only, both enforcing `SHA512` `crypto.timingSafeEqual` verification).
  - `inventory/`: export transaction-safe `reserveStockForOrder`, `commitOrderReservations`, `releaseOrderReservations`.
  - New Clean 4-layer modules (`checkout`, `orders`, `payments`): `/checkout/quote`, `/checkout/orders`, `/orders`, `/orders/:orderNumber`, `/orders/:id/cancel`, `/payments/:orderId/session`, `/payments/:id`, `/payments/webhooks/:provider` (`@Public()` + `@SkipCsrf()` + `SHA512` + `payment_events` dedup + `getStatus()`).
- `apps/worker`: add repeatable `inventory` reservation expiry sweep (`every 60s`), `payment` webhook/reconciliation processor, and `order` lifecycle processor.
- `apps/storefront`: replace Phase 04 `/cart` staging notice with `/checkout` CTA, build `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, `/account/orders/[orderNumber]`, and add `Order History` link in `AccountShell`.

## 4. Strict Phase Scope Boundary

Zero Phase 06+ deliverables (`apps/admin` order fulfillment/returns/refunds/coupons/CMS routes or Phase 07+ Three.js/WebGL viewer) are permitted in Phase 05.
