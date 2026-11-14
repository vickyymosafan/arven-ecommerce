# ADR-003: Atomic Inventory Reservation, Transactional Outbox, and Payment Idempotency

Status: Accepted  
Date: 2026-11-14  
Owners: Architecture Lead / Backend Lead  

## Context

ARVEN's `Atelier` and `Form` collections feature limited-quantity drops where multiple shoppers race concurrently for the final units of a variant. Blueprint Sections 1.4, 5.2–5.4, 10.4, 12.1–12.5, and 18.2 establish strict financial and stock integrity invariants:
1. **Zero overselling** under concurrent checkouts.
2. **Append-only stock ledger** (`inventory_movements`) paired with operational levels (`inventory_levels`).
3. **Zero duplicate payment commits or duplicate orders** when clients retry checkout or Midtrans replays webhooks.
4. **Never trust client redirects** (`/checkout/finish`) to mark an order `PAID`.
5. **No dual-write drift** between PostgreSQL commits and Redis/BullMQ background job dispatch.

## Decision

Enforce a four-part transactional guarantee across `apps/api`, `packages/database`, and `apps/worker`:

### 1. Atomic Conditional Stock Reservation + SQL `CHECK` Constraints
- Multi-item checkout requests sort line items by **`variant_id ASC`** before touching `inventory_levels` to establish a global lock order and prevent AB-BA deadlocks.
- Inside a single PostgreSQL transaction (`prisma.$transaction` with explicit timeout and bounded deadlock retry up to 3 attempts with jitter):
  1. Execute atomic conditional update per variant:
     ```sql
     UPDATE inventory_levels
     SET quantity_reserved = quantity_reserved + $qty,
         updated_at = NOW()
     WHERE warehouse_id = $warehouse_id
       AND variant_id = $variant_id
       AND (quantity_on_hand - quantity_reserved) >= $qty
     RETURNING id;
     ```
  2. If affected row count `!== 1`, roll back immediately and return `409 Conflict` (`VARIANT_OUT_OF_STOCK`).
  3. Insert `orders` (`PENDING_PAYMENT`), `order_items` (immutable price/SKU/config snapshots), `stock_reservations` (`ACTIVE`, bounded `expires_at`), `inventory_movements` (`RESERVATION`, `+qty`), and `outbox_events` (`order.created`, `inventory.reserved`).
- Enforce defense-in-depth at the database engine via manual migration `CHECK` constraints (`quantity_on_hand >= 0`, `quantity_reserved >= 0`, `quantity_reserved <= quantity_on_hand`, `quantity > 0`) as specified in [`DATA_MODEL.md`](../DATA_MODEL.md).

### 2. Mutation `Idempotency-Key` with Request Payload Hash Verification
- Critical mutations (`POST /checkout/orders`, `POST /payments/:orderId/session`, `POST /orders/:id/cancel`, `POST /orders/:id/returns`, `POST /admin/orders/:id/refunds`, `POST /admin/stock-movements`) require an `Idempotency-Key` header.
- `idempotency_records` enforces `UNIQUE(idempotency_key, actor_scope, route)` and stores `request_hash = SHA256(actorScope + method + route + canonicalJsonBody)`.
- Same key + matching hash + `COMPLETED` -> replays exact stored HTTP status and JSON body (`Idempotent-Replayed: true`).
- Same key + **mismatched `request_hash`** -> returns **`409 Conflict` (`IDEMPOTENCY_CONFLICT`)** without running the mutation.
- Concurrent duplicate while `IN_PROGRESS` -> returns **`409 Conflict` (`IDEMPOTENCY_IN_PROGRESS`)**.

### 3. Midtrans Webhook Cryptographic Verification, Event Deduplication & Authoritative Re-Query
- `POST /api/v1/payments/webhooks/midtrans` computes:
  $$\text{expected} = \text{SHA512}(\text{order\_id} + \text{status\_code} + \text{gross\_amount} + \text{MIDTRANS\_SERVER\_KEY})$$
  and compares with `signature_key` using `crypto.timingSafeEqual`.
- Persists webhook payload into `payment_events` protected by `UNIQUE(provider, provider_event_id)` (`${transaction_id}:${transaction_status}:${status_code}`). Duplicate deliveries hit the unique constraint and return `200 OK` safely with zero side effects.
- Queries Midtrans `GET /v2/{order_id}/status` (`PaymentProvider.getStatus`) before committing `PaymentStatus.SETTLEMENT`, `OrderStatus.PAID`, `StockReservationStatus.COMMITTED`, and `InventoryMovementType.SALE` (`quantity_on_hand -= qty`, `quantity_reserved -= qty`) inside a single DB transaction.
- Client browser return URLs are strictly read-only UX views and never mutate payment or order records.

### 4. Transactional Outbox & Reconciliation Worker
- Post-commit async work (emails, fulfillment notifications, analytics) is written to `outbox_events` inside the domain transaction and relayed to BullMQ (`bullmq@^6` on Redis 8.x) by `apps/worker` using `jobId = outboxEvent.id`.
- A repeatable `inventory` queue sweep releases expired `ACTIVE` reservations (`RELEASE`) after `expires_at` passes.
- A repeatable `payment` reconciliation job polls `PaymentProvider.getStatus` for stale `PENDING` payments and routes late-settled-after-expiry payments into an explicit admin alert/refund exception workflow rather than violating stock invariants.

## Alternatives considered

- **Option A — Redis distributed locks (`Redlock`) as primary inventory guard:** Rejected because Redis lock expiration under GC pauses or failover risks overselling; PostgreSQL row locks + `CHECK` constraints enforce invariants in the authoritative ledger itself.
- **Option B — Direct `Queue.add()` inside NestJS services without Outbox:** Rejected due to dual-write failure windows if PostgreSQL commits and Redis is temporarily unreachable or the API pod crashes mid-request.
- **Option C — Relying solely on `Idempotency-Key` cache in Redis:** Rejected because volatile cache eviction could allow duplicate checkout or refund execution; PostgreSQL `idempotency_records` gives ACID persistence aligned with order creation.

## Consequences

- **Benefits:** Mathematically enforced stock ceiling (`quantity_reserved <= quantity_on_hand`), deterministic replay/conflict handling on client retries, idempotent webhook processing under Midtrans retries, and guaranteed delivery of post-commit notifications.
- **Trade-offs:** Slight write amplification (`stock_reservations` + `inventory_movements` + `outbox_events` + `idempotency_records` per checkout) and need for periodic archival/cleanup jobs on expired `idempotency_records` and published `outbox_events`.

## Verification

- **Concurrency Integration Test:** Fire 20 parallel `POST /checkout/orders` requests against a variant with `quantity_on_hand = 1`; assert exactly 1 `201 Created`, 19 `409 VARIANT_OUT_OF_STOCK`, `quantity_reserved === 1`, `quantity_on_hand === 1`.
- **Idempotency Test:** Replay `POST /checkout/orders` with identical key + body -> identical `orderNumber` (`Idempotent-Replayed: true`); replay same key + modified `quantity` -> `409 IDEMPOTENCY_CONFLICT`.
- **Webhook Deduplication Test:** Deliver identical signed settlement webhook 5 times concurrently/sequentially -> 1 `payment_events` row, 1 `SALE` movement, `quantity_on_hand = 0`, `quantity_reserved = 0`.
- **Expiry & Reconciliation Tests:** Expire reservation via clock/worker trigger -> `quantity_reserved` decrements back to `0` and order transitions to `EXPIRED`.
- **Browser Redirect Security Test:** Visiting checkout success route without verified webhook keeps order at `PENDING_PAYMENT`.
