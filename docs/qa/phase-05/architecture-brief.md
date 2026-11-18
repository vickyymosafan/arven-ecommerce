# ARVEN Phase 05 — Architecture & Shared Contracts Brief

> **Phase:** Phase 05 — Checkout Quote, Order State Machine, Midtrans Payment & Expiry Worker  
> **Plan ID:** `7046df9d-13df-413d-b6ae-2ebaaaa6ddd9`  
> **Task ID:** `7526f207-a971-4892-9aee-4a614b1aa612` (`architecture-lead`)  
> **Governing References:** [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md), [`docs/DATA_MODEL.md`](../../DATA_MODEL.md), [`docs/API_CONTRACTS.md`](../../API_CONTRACTS.md), [`docs/SECURITY_POLICY.md`](../../SECURITY_POLICY.md), [`docs/adr/ADR-003-atomic-inventory-outbox-and-payment-idempotency.md`](../../adr/ADR-003-atomic-inventory-outbox-and-payment-idempotency.md)

---

## 1. Shared Configuration, Validation & Contract Layer

### 1.1 `@arven/config` (`packages/config`)
- **`HTTP_HEADERS.GUEST_ORDER_TOKEN`**: `'x-guest-order-token'` for constant-time guest order lookup authorization alongside `GET /api/v1/orders/:orderNumber`, `POST /api/v1/payments/:orderId/session`, and `GET /api/v1/payments/:id`.
- **`CHECKOUT_POLICY`**:
  - `QUOTE_TTL_MINUTES = 15`
  - `RESERVATION_TTL_MINUTES = 15`
  - `RESERVATION_SWEEP_INTERVAL_MS = 60_000`
  - `ORDER_NUMBER_PREFIX = 'ARV'`
  - `MAX_LINE_ITEMS = 50`
  - `MAX_GUEST_TOKEN_BYTES = 32` (256-bit CSPRNG, stored SHA-256 hashed in `orders.guest_token_hash`)
- **`SHIPPING_POLICY` & `SHIPPING_PROVIDERS`**:
  - `DEFAULT_WEIGHT_GRAMS_FALLBACK = 500`
  - `SHIPPING_PROVIDERS = ['jne-adapter', 'sicepat-adapter']`
- **Runtime Environment (`env.ts` & `.env.example`)**:
  - `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, and `MIDTRANS_IS_PRODUCTION` added to `runtimeEnvSchema`.
  - Fail-closed `superRefine` rule: when `PAYMENT_DRIVER === 'midtrans'`, `MIDTRANS_SERVER_KEY` must be non-empty after `.trim()`, while `PAYMENT_DRIVER=local_stub` remains blocked in `NODE_ENV=production`.

### 1.2 `@arven/validators` (`packages/validators/src/checkout.ts`)
- All request body and query schemas use **Zod v4** `z.strictObject(...)` / strict `.extend(...)` to enforce `T-03` mass-assignment protection (rejecting client-supplied `unitPrice`, `discountAmount`, `total`, `status`, `userId`, `roles`, or unrecognized nested keys):
  - `checkoutShippingSelectionSchema`, `checkoutGuestAddressSchema` (`countryCode: 'ID'`), `checkoutItemCustomizationSchema`, `checkoutLineItemInputSchema` (`quantity` integer `1..99`), `checkoutQuoteRequestSchema` (`items` `1..50`)
  - `createOrderRequestSchema` with `.superRefine` requiring both `guestEmail` and `guestAddress` whenever `addressId` is omitted
  - `listOrdersQuerySchema`, `cancelOrderRequestSchema`, `createPaymentSessionRequestSchema`
  - `orderNumberParamSchema`, `orderIdParamSchema`, `paymentIdParamSchema`
- `midtransWebhookPayloadSchema` uses `.passthrough()` over required signature fields (`order_id`, `status_code`, `gross_amount`, `transaction_status`, `transaction_id`, `signature_key`, plus optional `payment_type`, `fraud_status`, `settlement_time`) so extra gateway metadata is preserved without mutating raw signed strings.

### 1.3 `@arven/contracts` (`packages/contracts/src/index.ts`)
- Exports immutable-snapshot HTTP DTO contracts aligned with `DATA_MODEL.md` and `API_CONTRACTS.md` §9.2:
  - `ShippingRateOptionDto`, `CheckoutQuoteItemDto`, `AppliedCouponDto`, `CheckoutQuoteDto`
  - `OrderAddressSnapshotDto`, `OrderItemDto`, `OrderStatusHistoryDto`, `OrderSummaryDto`, `OrderDetailDto`, `CreateOrderResultDto`
  - `PaymentSummaryDto`, `PaymentSessionDto`, `MidtransWebhookAckDto`
- Re-exports all corresponding request/query/enum types from `@arven/validators`.

---

## 2. Clean 4-Layer Architecture Inside `apps/api`

All Phase 05 critical modules (`checkout`, `orders`, `payments`) follow the strict four-layer dependency rule (`domain` -> `application` -> `infrastructure` / `presentation`, zero `@nestjs/*` or `@prisma/client` imports in `domain/`):

```text
apps/api/src/modules/<checkout|orders|payments>/
├── domain/
│   ├── entities/        # Pure TS aggregates & state transition guards (OrderStatus, PaymentStatus)
│   ├── value-objects/   # Integer IDR arithmetic, line discount allocation, reservation windows
│   ├── events/          # Typed domain event payloads (order.created, payment.pending/succeeded/failed)
│   ├── errors/          # DomainError subclasses mapped cleanly by global exception filter
│   └── ports/           # Symbol DI tokens + repository/provider interfaces
├── application/
│   ├── commands/        # Quote, CreateOrder, CancelOrder, CreatePaymentSession, ProcessWebhook
│   ├── queries/         # Customer/guest order lookup & paginated order history
│   └── services/        # UnitOfWork/Prisma tx boundary, Idempotency-Key lock, Outbox emission
├── infrastructure/
│   ├── repositories/    # Prisma 7 + raw SQL row locking (`FOR UPDATE`) implementing domain ports
│   ├── adapters/        # Midtrans/LocalStub PaymentProvider & DeterministicShippingProvider wiring
│   └── mappers/         # Bidirectional DB <-> Domain <-> @arven/contracts DTO mappers
└── presentation/
    ├── *.controller.ts  # Thin routes with @Body({ schema }), @Param(..., { schema }), @Query({ schema })
    └── presenters/      # Envelope formatting & guest header extraction
```

### 2.1 `inventory` Transaction-Safe Reservation Exports
`InventoryModule` exports an application/service boundary (`InventoryReservationService` / `InventoryService` methods) callable inside a caller-owned Prisma transaction (`tx: Prisma.TransactionClient`):
1. **`reserveStockForOrder(tx, { orderId, warehouseId, items, expiresAt, actorId })`**:
   - Aggregates duplicate `variantId` quantities per order and sorts strictly by **`variantId ASC`** to eliminate AB-BA circular lock deadlocks.
   - Executes atomic conditional update: `UPDATE inventory_levels SET quantity_reserved = quantity_reserved + $qty ... WHERE warehouse_id = $w AND variant_id = $v AND (quantity_on_hand - quantity_reserved) >= $qty RETURNING id`.
   - Aborts transaction with `409 VARIANT_OUT_OF_STOCK` if affected rows != 1.
   - Inserts `stock_reservations` (`ACTIVE`, synced `expires_at`) and append-only `inventory_movements` (`type = 'RESERVATION'`, `quantity_delta = +qty`).
2. **`commitOrderReservations(tx, { orderId, actorId })`**:
   - Transitions `stock_reservations` atomically with guard `WHERE order_id = $orderId AND status = 'ACTIVE'`.
   - Deducts both `quantity_on_hand` and `quantity_reserved` on `inventory_levels` and appends `inventory_movements` (`type = 'SALE'`, `quantity_delta = -qty`).
3. **`releaseOrderReservations(tx, { orderId, targetStatus: 'RELEASED' | 'EXPIRED', actorId, reason })`**:
   - Transitions `stock_reservations` atomically with guard `WHERE order_id = $orderId AND status = 'ACTIVE'`.
   - Decrements `quantity_reserved` on `inventory_levels` and appends `inventory_movements` (`type = 'RELEASE'`, `quantity_delta = -qty`).

### 2.2 `checkout`, `orders` & `payments` Module Boundaries
- **`checkout`**:
  - `POST /api/v1/checkout/quote`: Server-authoritative variant prices, stock check, active `coupons` validation + proportional half-up integer IDR discount allocation (`SUM(discountAllocatedIdr) === discountTotalIdr`), `ShippingProvider.getRates(...)` from default warehouse (`JKT-MAIN-01`) with `500g` fallback when needed, and `quoteExpiresAt = now + 15m`.
  - `POST /api/v1/checkout/orders`: Enforces `Idempotency-Key` (`actorScope + method + path + canonical body hash`), resolves customer saved address (`WHERE id = :id AND user_id = :userId`) or validates guest address/email, generates `ARV-YYYYMMDD-XXXXXX` order number, issues 256-bit `guestToken` (returning plaintext once in `CreateOrderResultDto` and storing only `SHA-256(guestToken)`), reserves stock via `inventory`, increments `coupons.used_count` + inserts `coupon_redemptions` atomically, converts active cart if applicable, writes `order_status_history` and `outbox_events ('order.created')`.
- **`orders`**:
  - `GET /api/v1/orders`: Authenticated self-only query (`WHERE user_id = session.userId`), paginated via `listOrdersQuerySchema`.
  - `GET /api/v1/orders/:orderNumber`: Enforces ownership (`session.userId === order.userId`) OR constant-time `SHA-256(X-Guest-Order-Token)` verification (`401`/`403` without leaking victim order PII).
  - `POST /api/v1/orders/:id/cancel`: Requires `Idempotency-Key`, verifies owner/guest proof, enforces `PENDING_PAYMENT -> CANCELLED` state machine guard, calls `releaseOrderReservations(..., 'RELEASED')`, records `order_status_history` & `outbox_events ('inventory.released')`.
- **`payments`**:
  - `POST /api/v1/payments/:orderId/session`: Requires `Idempotency-Key` + owner/guest proof, verifies order is `PENDING_PAYMENT` and unexpired, invokes `PaymentProvider.createSession`, persists `payments` (`PENDING`) + `outbox_events ('payment.pending')`.
  - `GET /api/v1/payments/:id`: Owner or `X-Guest-Order-Token` scoped sanitized payment status read.
  - `POST /api/v1/payments/webhooks/midtrans`: `@Public()` + `@SkipCsrf()` route:
    1. Validate payload shape (`midtransWebhookPayloadSchema`).
    2. Constant-time `crypto.timingSafeEqual` check on lowercase hex `SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)` -> `401 WEBHOOK_SIGNATURE_INVALID` on mismatch.
    3. Deduplicate via `INSERT INTO payment_events (provider, provider_event_id, ...)` (`${transaction_id}:${transaction_status}:${status_code}`) -> return `{ acknowledged: true, duplicate: true }` (`200 OK`) on unique conflict.
    4. Active server-to-server confirmation via `PaymentProvider.getStatus(order_id)` confirming live status & `grossAmountIdr`.
    5. Row-locked PostgreSQL transaction (`SELECT ... FOR UPDATE` on `payments` and `orders`): settle (`SETTLEMENT` + `OrderStatus.PAID` + `commitOrderReservations` -> `SALE` + `outbox_events ('payment.succeeded')`), fail/expire (`FAILED`/`EXPIRED` + `releaseOrderReservations` + `outbox_events ('payment.failed')`), or flag late settlement after expiry without overselling.

---

## 3. `apps/worker` Expiry & Reconciliation Boundaries

- **Outbox Relay (`OutboxRelayService`)**: Continues polling unpublished `outbox_events` (`FOR UPDATE SKIP LOCKED`) and routing `inventory.*` -> `inventory`, `order.*` -> `order`, `payment.*` -> `payment`, `user.*` -> `notification` with `jobId = outboxEvent.id`.
- **`inventory` Queue (Repeatable Reservation Expiry Sweep)**:
  - Registers repeatable BullMQ `v6.5.3` job scheduler (`upsertJobScheduler`) at `CHECKOUT_POLICY.RESERVATION_SWEEP_INTERVAL_MS` (`60_000 ms`).
  - Queries bounded batches of `stock_reservations` where `status = 'ACTIVE' AND expires_at <= NOW()`, locks order + reservation rows in deterministic order, marks `stock_reservations.status = 'EXPIRED'`, decrements `inventory_levels.quantity_reserved`, inserts `inventory_movements (RELEASE)`, transitions `orders.status` (`PENDING_PAYMENT -> EXPIRED`) + `order_status_history (actorType = 'SYSTEM')`, expires pending `payments`, and emits `inventory.released` outbox event. Strictly idempotent under concurrent runs or retries.
- **`payment` & `order` Queues**:
  - `payment` processor: reconciles stale `PENDING` payments near/past expiry via `PaymentProvider.getStatus(...)` before expiry finalization, and handles `payment.succeeded` / `payment.failed` async follow-ups (e.g., triggering notification jobs).
  - `order` processor: handles `order.created` and lifecycle follow-ups idempotently without inventing prices or bypassing DB state machine guards.
