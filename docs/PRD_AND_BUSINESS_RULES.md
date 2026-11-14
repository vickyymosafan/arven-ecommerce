# ARVEN — Product Requirements & Business Rules Baseline

> **Source of Truth:** Extracted from [`ARVEN_Full_Blueprint_v1.md`](../ARVEN_Full_Blueprint_v1.md) (v1.0, 2026-11-14).  
> **Rule:** Never invent prices, SKUs, state transitions, or scope outside this contract unless updated via an accepted ADR and requirement revision.

---

## 1. Product Identity & Scope Boundaries

- **Brand:** ARVEN (*"Beyond Trends. Beyond Time."*)
- **Category & Model:** Luxury contemporary fashion, Direct-to-Consumer (D2C), unisex apparel, footwear, and accessories.
- **Experience:** Editorial storefront + Admin dashboard + Backend API + Background worker, enhanced by Hybrid 3D (Product Viewer, Virtual Showroom, Outfit Studio).

### 1.1 Scope Matrix (Release v1)

| In Scope (v1) | Explicitly Out of Scope (v1) |
|---|---|
| Storefront, catalog, variants, cart, checkout, payment, order | Multi-vendor marketplace |
| Admin, inventory ledger, CMS, coupons, basic returns, analytics | Full manufacturing ERP and accounting |
| 3D product viewer, color/material presets, showroom, asset-based Outfit Studio | Real-time cloth physics simulation and accurate virtual body fitting |
| Payment & shipping integrations via provider adapters | Native iOS/Android mobile apps |
| RBAC permissions, audit trail, monitoring, automated tests | Multi-country tax engine and advanced multi-warehouse routing optimization |

### 1.2 Non-Negotiable Product Principles

1. **Commerce-first:** Users must be able to browse, select variants, add to cart, and complete checkout without WebGL, avatars, or the 3D showroom.
2. **Server-authoritative:** Prices, discounts, stock availability, order snapshots, and payment states are computed and enforced exclusively by the backend.
3. **Progressive enhancement:** 3D features lazy-load based on device capability and connection, with immediate poster and static gallery fallbacks.
4. **Asset-driven:** Every 3D asset carries versioned metadata, validation status, license attribution, and fallback media.
5. **Operational transparency:** All stock changes, payment transitions, order updates, and admin actions are auditable.
6. **Modular monolith:** Logical domain boundaries inside a single NestJS API (+ separate BullMQ worker process) before considering microservices.

### 1.3 Baseline Operating Assumptions

| Area | Baseline Rule |
|---|---|
| Initial Market & Currency | Indonesia; `IDR` (integer rupiah or `NUMERIC(18,2)` — **never floating point**); operational timezone `Asia/Jakarta` (storage strictly UTC). |
| Languages | Bahasa Indonesia primary; architecture & typography ready for English (`id` / `en`). |
| Fulfillment | Single primary warehouse at launch; schema supports multi-warehouse (`warehouse_id` on levels, movements, reservations). |
| Payment | Midtrans as first adapter (`PaymentProvider` interface ready for additional providers). |
| Shipping | Adapter contract (`ShippingProvider`); carrier/aggregator chosen after SLA & rate simulation. |
| Guest Checkout | Supported (`20.3` recommended), requiring guest cart token security and guest order snapshot/tracking safety. |

---

## 2. Catalog Taxonomy, Collections & Seed Specification

### 2.1 Categories & Collections

- **Categories:**
  - `Tops` (T-shirt, shirt, polo, sweatshirt)
  - `Bottoms` (Trousers, denim, shorts, cargo)
  - `Outerwear` (Jacket, blazer, coat, cardigan)
  - `Footwear` (Sneakers, loafers, boots)
  - `Accessories` (Bag, belt, wallet, cap)
- **Collections:**
  - `Essentials` (always-on core, planned restock)
  - `Form` (experimental silhouettes/construction, seasonal drops)
  - `Atelier` (exclusive/limited quantities, strict drop/restock rules)
  - `Movement` (urban functional daily wear)

### 2.2 Initial Development Simulation Catalog (Seed Data)

*Note: Names, SKUs, and IDR prices below are synthetic seed fixtures for development/testing, not final commercial pricing.*

| SKU Prefix | Product | Category | Example Variants | Simulated Price (IDR) |
|---|---|---|---|---|
| `ARV-TOP-001` | Essential Oversized Tee | Tops | Black/Ivory; S–XL | `299000` |
| `ARV-TOP-002` | Relaxed Oxford Shirt | Tops | White/Sky; S–XL | `499000` |
| `ARV-BOT-001` | Structured Trousers | Bottoms | Black/Stone; 28–34 | `649000` |
| `ARV-OUT-001` | Utility Overshirt | Outerwear | Charcoal/Olive; S–XL | `899000` |
| `ARV-FW-001` | Minimal Leather Sneaker | Footwear | White/Black; 39–44 | `1299000` |
| `ARV-ACC-001` | Everyday Tote | Accessories | Black/Tan; One Size | `799000` |

### 2.3 Definition of a Ready Product (Publish Gate)

A product cannot transition to `PUBLISHED` unless:
1. It has `name`, unique `slug`, `description`, `category`, `material`, `fit`, and `care_instruction`.
2. It has at least 1 active `ProductVariant` with unique `sku`, valid `size`/`color`, non-negative `price`, weight/dimensions, and warehouse `inventory_level` initialized.
3. Category-appropriate size guide and SEO title/description are configured.
4. Primary media + gallery images with `alt_text` and sort positions exist. (3D asset is optional; if 3D badge/experience is enabled, `Product3DAsset` must be `READY` with poster, valid material slots, and mobile lite/fallback profile, reviewed by Product Manager).

---

## 3. Functional & Non-Functional Requirements

### 3.1 Functional Requirements Matrix

| ID | Requirement | Priority | Acceptance Summary |
|---|---|---|---|
| `FR-001` | Registration, login, logout, password reset, email verification | P0 | Secure validated session; Argon2id; admin MFA |
| `FR-002` | Product catalog & category listing | P0 | Only `PUBLISHED` active products shown with pagination |
| `FR-003` | Product variants & SKU selection | P0 | Color/size selection maps deterministically to active SKU |
| `FR-004` | Search, sort & facet filters | P0 | Filters (`category`, `collection`, `size`, `color`, `min/max price`, `availability`); Sort (`newest`, `price_asc`, `price_desc`, `featured`); Search by name/SKU/category/description |
| `FR-005` | Guest & authenticated cart | P0 | Secure guest cart token; explicit merge rules on login; server price recalculation |
| `FR-006` | Server-authoritative checkout quote | P0 | Transparent subtotal, coupon discount, shipping, tax (if applicable), grand total |
| `FR-007` | Order creation & Midtrans payment integration | P0 | Order snapshots; signed & idempotent webhook processing |
| `FR-008` | Atomic inventory reservation & ledger | P0 | Zero overselling under concurrency; append-only `inventory_movements` |
| `FR-009` | Admin product, order, and inventory ops | P0 | Granular RBAC enforcement + immutable `audit_logs` |
| `FR-010` | Customer order history | P0 | Strict resource ownership check (`user_id` or verified guest token) |
| `FR-011` | 3D product viewer | P1 | Lazy WebGL load, poster-first, static gallery fallback |
| `FR-012` | Color/material presets | P1 | Server-driven `customization_presets` validated per model |
| `FR-013` | Virtual showroom | P1 | Lazy-loaded zones, hotspots, mobile navigation, non-WebGL fallback |
| `FR-014` | Outfit Studio | P1 | Fixed mannequin rig; strict slot/rig compatibility validation; saved outfits store IDs/config only (never authoritative prices) |
| `FR-015` | CMS Lookbook & Journal | P1 | `DRAFT` → preview → `PUBLISHED` → `ARCHIVED` workflow |
| `FR-016` | Wishlist & product reviews | P1 | Ownership checks on wishlists; moderation gate on reviews |
| `FR-017` | Return & refund workflow | P1 | Bound to order items & purchased quantities; tracked inspection & provider/manual refund audit |
| `FR-018` | Advanced analytics | P2 | Consistent KPI definitions (Gross/Net Sales, AOV, Conversion, Payment Success, Return Rate, Stock Cover, 3D Engagement) |
| `FR-019` | Recommendation engine | P2 | Opt-in, explainable rules, privacy-aware |
| `FR-020` | Multi-warehouse routing | P2 | Location & stock routing rules agreed before enabling |

### 3.2 Non-Functional Baseline Targets

| Area | Target | Verification |
|---|---|---|
| Web Performance | Healthy Core Web Vitals; catalog routes never wait on 3D bundles | Lighthouse + Next.js bundle analysis |
| 3D Loading | Poster renders immediately; GLB (2–8 MB target) lazy-loaded | Network trace + mobile device profiling |
| API Availability & Latency | 99.5% initial core API availability; per-endpoint P95 baselines | k6 load tests + APM |
| Accessibility | WCAG 2.2 AA contrast, keyboard nav, visible focus, `alt_text`, reduced motion | `axe-core` + keyboard & zoom audits |
| Security | OWASP ASVS 5.0 verification baseline | SAST, dependency scan, authz & webhook replay tests |
| Data Integrity | Zero overselling; zero payment double-apply | Concurrency integration & k6 tests |
| Responsive | Mobile-first across mobile, tablet, desktop | Playwright viewport matrix (`13` profiles via Harness) |

---

## 4. Core Lifecycles, State Machines & Operational Rules

### 4.1 Product Lifecycle
- **Blueprint 5.1 Flow:** `DRAFT` → `REVIEW` → `READY_TO_PUBLISH` → `PUBLISHED` → `ARCHIVED`.
- **Blueprint 10.6 Enum:** `DRAFT, REVIEW, PUBLISHED, ARCHIVED` *(see Discovery Report Ambiguity #1 — resolved in `DATA_MODEL.md` by including `READY_TO_PUBLISH` or mapping publish-gate validation cleanly)*.
- Price changes must record `actor`, `timestamp`, `old_value`, and `new_value` in `audit_logs`.

### 4.2 Inventory Lifecycle & Movement Types
- **Rule:** Never mutate `inventory_levels` without appending an `inventory_movements` row in the same transaction.
- **Movement Types:**
  - `RECEIPT`: `+on_hand` (supplier intake)
  - `RESERVATION`: `+reserved` (atomic checkout lock with `expires_at`)
  - `RELEASE`: `-reserved` (reservation expired, payment failed, or unpaid order cancelled)
  - `SALE` *(blueprint 5.2 calls it `COMMIT/SALE`, 10.6 enum uses `SALE`)*: `-on_hand` and `-reserved` (confirmed payment commit)
  - `ADJUSTMENT`: `+/- on_hand` (stock opname, damaged, lost — requires reason & actor)
  - `RETURN_TO_STOCK`: `+on_hand` (only after return inspection passes)

### 4.3 Separate Transaction State Machines

Payment, Order, Shipment, Return, and Refund MUST remain **five separate state machines** driven by validated commands (never raw client status patches):

1. **Order (`OrderStatus`):**
   - Happy path: `PENDING_PAYMENT` → `PAID` → `PROCESSING` → `READY_TO_SHIP` → `SHIPPED` → `DELIVERED` → `COMPLETED`
   - Failure/Cancel: `PENDING_PAYMENT` → `EXPIRED` | `CANCELLED`
   - Refund branch: `PAID` → `REFUND_PENDING` → `PARTIALLY_REFUNDED` | `REFUNDED`
   - Return branch: `DELIVERED` → `RETURN_REQUESTED` → `RETURN_APPROVED` → `RETURNED`
2. **Payment (`PaymentStatus`):**
   - `PENDING` → `AUTHORIZED` | `SETTLEMENT` | `FAILED` | `EXPIRED`
   - `SETTLEMENT` → `REFUND_PENDING` → `PARTIALLY_REFUNDED` | `REFUNDED`
3. **Shipment (`ShipmentStatus`):**
   - `UNFULFILLED` → `READY_TO_SHIP` → `IN_TRANSIT` → `DELIVERED` | `FAILED` | `RETURNED`
4. **Return (`ReturnStatus`):**
   - `REQUESTED` → `UNDER_REVIEW` → `APPROVED` | `REJECTED`
   - `APPROVED` → `RECEIVED` → `REFUNDED` → `CLOSED`
5. **3D Asset (`AssetStatus`):**
   - `UPLOADED` → `PROCESSING` → `READY` | `FAILED` → `ARCHIVED`

### 4.4 Critical Checkout & Payment Invariants
1. Client sends only cart/variant IDs, quantity, optional customization preset ID, address ID (or guest address payload), shipping service selection, coupon code, and `Idempotency-Key`.
2. Backend re-reads authoritative variant price, active status, coupon eligibility, and shipping quote.
3. Backend atomically reserves stock in `variant_id` sorted order inside a DB transaction, writes `order` + `order_items` snapshots + `stock_reservations` + `outbox_events`.
4. Browser redirect success **never** marks an order `PAID`. Only signature-verified + provider-status-checked webhooks (deduplicated via `payment_events.provider_event_id`) or scheduled reconciliation jobs transition payment/order state and commit stock.

---

## 5. Phase-by-Phase Execution Roadmap (Phases 01–09)

| Phase | Scope | Primary Deliverables | Exit Gate |
|---|---|---|---|
| **01** | Discovery & Contracts | PRD, Discovery Report, `AGENTS.md`, ADRs, Architecture, Data Model, API Contracts, Security Policy, Design Contract | Contracts consistent & zero unverified version assumptions |
| **02** | Foundation, Auth & RBAC | `pnpm` + Turborepo, `docker-compose`, Prisma 7 initial schema + seed, Auth (`Argon2id`, cookie session, admin MFA), RBAC | Dev build/lint/typecheck/unit/auth tests pass |
| **03** | Catalog & Storefront (P0) | Catalog/Category/Collection API + Storefront Home/Shop/Search/PDP (2D gallery + size guide) | Catalog CRUD + responsive Storefront Playwright QA pass |
| **04** | Inventory Ledger & Cart (P0) | Warehouses, `inventory_levels` + SQL `CHECK`, append-only movements, guest/user cart + merge | Stock invariant & cart merge integration tests pass |
| **05** | Checkout & Payment (P0) | Server quote, atomic reservation + expiry worker, `Idempotency-Key`, Midtrans sandbox adapter & webhook, order history | Concurrency oversell test + duplicate webhook test + E2E pass |
| **06** | Admin Ops & CMS (P0/P1) | Admin orders/fulfillment/shipments, inventory ops, returns/refunds, coupons, CMS Lookbook/Journal, audit logs | RBAC permission tests + Admin/Customer E2E pass |
| **07** | 3D Product Viewer (P1) | `packages/three-engine`, presigned upload + GLB validator worker, R3F 9 viewer, presets, poster/static fallback | Malformed GLB rejected; non-WebGL checkout + memory disposal pass |
| **08** | 3D Showroom & Outfit Studio (P1) | Zone-based lazy showroom + hotspots, mannequin rig & compatible garment slots + saved outfits | Slot compatibility validation + mobile WebGL perf QA pass |
| **09** | Production Readiness | OWASP ASVS 5.0 audit, `axe-core` accessibility, `k6` load tests, observability, backup/restore drill, release checklist | All 9 Harness Quality Checkpoints `PASS` |
