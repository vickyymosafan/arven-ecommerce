# ARVEN — System Architecture & Engineering Boundaries

> **Status:** Phase 01 Architecture Baseline  
> **Source of Truth:** Derived from [`ARVEN_Full_Blueprint_v1.md`](../ARVEN_Full_Blueprint_v1.md), [`PRD_AND_BUSINESS_RULES.md`](./PRD_AND_BUSINESS_RULES.md), and [`DISCOVERY_REPORT.md`](./DISCOVERY_REPORT.md).  
> **Governing ADRs:** [ADR-001](./adr/ADR-001-tech-stack-and-version-pins.md), [ADR-002](./adr/ADR-002-session-proxy-and-same-site-auth.md), [ADR-003](./adr/ADR-003-atomic-inventory-outbox-and-payment-idempotency.md).

---

## 1. Architectural Style & System Context

ARVEN is designed as a **Modular Monolith** split into **four deployable runtime applications** backed by a single transactional PostgreSQL source of truth, Redis queue/cache tier, and S3-compatible object storage + CDN.

### 1.1 High-Level Runtime Topology

```text
Customer Browser / Admin Browser
        │  HTTPS (same-origin /api/v1/*)
        ▼
     CDN / WAF
        ├──► apps/storefront (Next.js 16 + React 19 + R3F 9)
        │         └── proxy.ts + rewrites -> /api/v1/* ──────────┐
        └──► apps/admin (Next.js 16 + React 19)                     │
                  └── proxy.ts + rewrites -> /api/v1/* ──────────┤
                                                                    ▼
External Webhooks (Midtrans / Carrier) ───► WAF ────► apps/api (NestJS 12 ESM, Express 5)
                                                        │
                     ┌──────────────────────────────────┼──────────────────────────────┐
                     ▼                                  ▼                              ▼
             PostgreSQL 18.x                       Redis 8.x                  S3-Compatible Storage
      (Prisma 7 + @prisma/adapter-pg)      (BullMQ 6 Queues + Cache)           (MinIO dev / R2 prod)
                     ▲                                  ▲                              ▲
                     └──────────────────────────────────┼──────────────────────────────┘
                                                        │
                                                 apps/worker (NestJS 12 + @nestjs/bullmq)
                                                        │
                                                        ▼
                             External Providers (Midtrans, Shipping, Email, Analytics)
```

### 1.2 Why Modular Monolith First
1. **Single ACID Transaction Boundary:** Checkout must atomically reserve stock, record ledger movements, write immutable order snapshots, persist idempotency locks, and emit transactional outbox events in a single PostgreSQL transaction ([ADR-003](./adr/ADR-003-atomic-inventory-outbox-and-payment-idempotency.md)).
2. **Operational Simplicity:** Four processes (`storefront`, `admin`, `api`, `worker`) share strict TypeScript contracts without distributed Saga orchestration overhead or premature network hops.
3. **Clean Extraction Seams:** Domain modules inside `apps/api` communicate only through public application service interfaces or typed domain events, preserving clear extraction seams if high-throughput domains (e.g., `3d-assets` or `analytics`) ever require independent scaling.

---

## 2. Monorepo Structure & Workspace Boundaries

Managed via `pnpm` workspaces (`corepack enable` + `packageManager` pin) and `turbo` pipeline orchestration.

```text
arven/
├── apps/
│   ├── storefront/              # Next.js 16 customer e-commerce & Hybrid 3D storefront
│   ├── admin/                   # Next.js 16 operations, catalog, order & RBAC dashboard
│   ├── api/                     # NestJS 12 ESM REST API (Modular Monolith)
│   └── worker/                  # NestJS 12 ESM BullMQ processors & outbox relay
├── packages/
│   ├── database/                # Prisma 7 schema, prisma.config.ts, migrations, seed, PrismaPg factory
│   ├── contracts/               # Generated OpenAPI spec & typed HTTP DTO interfaces
│   ├── validators/              # Shared Zod v4 Standard Schema input/query validators
│   ├── ui/                      # Shared accessible UI primitives & ARVEN design tokens
│   ├── three-engine/            # Reusable Three.js / R3F 9 scenes, GLB loaders, disposers
│   ├── config/                  # Shared ESLint, TypeScript (NodeNext/App), Tailwind config
│   └── observability/           # Structured Pino logger, redaction, OpenTelemetry & Sentry wrappers
├── infrastructure/
│   ├── docker/                  # Dockerfiles (multi-stage pinned images) & local init scripts
│   ├── scripts/                 # OpenAPI export, DB backup/restore & verification scripts
│   └── deployment/              # Staging/production manifests & cutover runbooks
├── docs/
│   ├── adr/                     # Accepted Architecture Decision Records (ADR-001..003+)
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── API_CONTRACTS.md
│   ├── DISCOVERY_REPORT.md
│   └── PRD_AND_BUSINESS_RULES.md
├── docker-compose.yml           # Local PostgreSQL 18, Redis 8, MinIO, Mailpit
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### 2.1 Package & Application Ownership Matrix

| Workspace | May Own | Strictly Prohibited From |
|---|---|---|
| `apps/storefront` | App Router pages, SEO metadata, customer UI, client islands, local ephemeral UI state, same-site `/api/v1/*` proxy | Acting as source of truth for price/stock/payment status; importing `@arven/database` or Prisma |
| `apps/admin` | Operational UI screens, RBAC-aware forms/tables, asset upload & preview workflows, proxy to `/api/v1/*` | Bypassing backend validation, state machine guards, or audit logging |
| `apps/api` | HTTP controllers, auth/RBAC guards, domain rules, ACID transactions, outbox emission, provider verification | Fat controllers with inline SQL/Prisma; leaking internal entities directly without DTO mapping |
| `apps/worker` | Retryable idempotent BullMQ consumers, outbox relay, reservation expiry sweep, payment reconciliation, GLB validation | Acting as single source of truth outside DB transactions; inventing prices or bypassing state machines |
| `packages/database` | `prisma.config.ts`, `schema.prisma`, SQL migrations (with manual `CHECK` constraints), deterministic seed, `PrismaPg` client factory | Containing HTTP logic, business workflows, or provider SDK calls |
| `packages/validators` | Framework-agnostic Zod v4 schemas (`~standard.jsonSchema`) for API requests, queries, and shared client form hints | Importing NestJS, Prisma, React, or Next.js internals |
| `packages/contracts` | Generated OpenAPI 3.0 spec (`openapi/arven.openapi.json`), generated TypeScript API DTO & error envelope types | Re-exporting Prisma models directly to browser apps |
| `packages/ui` | Accessible Tailwind components, focus/keyboard primitives, ARVEN design tokens | Direct API fetching or domain business logic |
| `packages/three-engine` | R3F 9 `Canvas` boundary, GLTF/GLB loaders, material slot controllers, disposal helpers, WebGL capability check | Accessing PostgreSQL, Redis, payments, or pricing logic; breaking SSR when dynamically imported |
| `packages/observability` | Structured JSON logger (with PII redaction), `requestId` async context, OpenTelemetry tracing, Sentry helpers | Logging raw passwords, tokens, session IDs, Midtrans server keys, or unmasked PII |

### 2.2 Workspace Dependency Direction (Acyclic DAG)

```text
apps/storefront ──► packages/ui, packages/three-engine, packages/contracts, packages/validators, packages/observability, packages/config
apps/admin      ──► packages/ui, packages/contracts, packages/validators, packages/observability, packages/config
apps/api        ──► packages/database, packages/contracts, packages/validators, packages/observability, packages/config
apps/worker     ──► packages/database, packages/contracts, packages/observability, packages/config
packages/three-engine ──► packages/ui (optional fallback primitives), packages/config
packages/contracts    ──► packages/validators (type/schema alignment only)
```

> **Anti-Coupling Guardrail:** `eslint-plugin-boundaries` (or `no-restricted-imports`) MUST enforce that `apps/storefront`, `apps/admin`, and `packages/three-engine` can **never** import `@arven/database`, `@prisma/client`, or `apps/api/*`.

---

## 3. Clean Architecture Inside `apps/api` & `apps/worker`

### 3.1 ESM & TypeScript Configuration
Per [ADR-001](./adr/ADR-001-tech-stack-and-version-pins.md), NestJS 12 packages (`apps/api` and `apps/worker`) run in **native ESM mode**:
- `"type": "module"` in `apps/api/package.json` and `apps/worker/package.json`.
- `tsconfig.json` uses `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` (compatible with `Node16` strict ESM resolution, `"resolvePackageJsonExports": true`, `"emitDecoratorMetadata": true`, `"experimentalDecorators": true`).
- All relative TypeScript imports use explicit `.js` extensions (e.g., `import { OrderEntity } from '../domain/entities/order.entity.js'`).
- File paths use `import.meta.dirname` instead of CommonJS `__dirname`.

### 3.2 Four-Layer Module Layout (Mandatory for Critical Modules)

Applied strictly to **`inventory`, `checkout`, `orders`, `payments`, and `returns`** (and recommended for all other domain modules):

```text
src/modules/<domain>/
├── domain/
│   ├── entities/             # Pure TS aggregates & state transition methods (no NestJS/Prisma imports)
│   ├── value-objects/        # MoneyIdr, Sku, Quantity, ReservationWindow
│   ├── events/               # Typed domain event payloads (dot.case names + schemaVersion)
│   ├── errors/               # DomainError subclasses mapped to HTTP status codes in global filter
│   └── ports/                # Repository & external provider interfaces (Symbol tokens + TS interfaces)
├── application/
│   ├── commands/             # Explicit command DTOs & handlers (e.g., CreateOrderCommand)
│   ├── queries/              # Read-model queries (allowlisted sorting/filtering)
│   └── services/             # Transaction boundary orchestration & Outbox emission
├── infrastructure/
│   ├── repositories/         # Prisma 7 + raw SQL atomic queries implementing domain ports
│   ├── adapters/             # Midtrans, R2/MinIO, Shipping, Mailpit/SES provider implementations
│   └── mappers/              # Bidirectional DB row <-> Domain Entity <-> DTO mappers
├── presentation/
│   ├── <domain>.controller.ts # Thin NestJS routes with @Body({ schema }) + @UseGuards()
│   └── presenters/           # Envelope serialization helpers
└── <domain>.module.ts        # NestJS DI wiring (binds ports to infrastructure adapters)
```

### 3.3 Layer Dependency Rules
1. `domain/` imports **only** standard TypeScript/built-ins (`node:crypto` forbidden in pure domain logic except via injected port). Zero imports from `@nestjs/*`, `@prisma/client`, `express`, or provider SDKs.
2. `application/` depends only on `domain/` ports, `packages/database` transaction runner abstraction (`UnitOfWork`), and `packages/observability`.
3. `infrastructure/` implements `domain/` ports using Prisma 7 (`PrismaClient` + `PrismaPg`), Redis/BullMQ, or provider HTTP clients.
4. `presentation/` validates external inputs at the edge via `StandardSchemaValidationPipe` + Zod schemas from `@arven/validators`, invokes `application/` services, and returns standardized envelopes.
5. **Cross-Module Isolation:** Module A must NEVER inject Module B's Prisma repository or query Module B's private tables directly. Cross-module calls occur exclusively through:
   - Exported public application services (synchronous reads/writes inside a shared `TransactionContext`, e.g. `CheckoutService` calling `InventoryReservationService` & `PricingQuoteService`), OR
   - Transactional Outbox events (`outbox_events` -> BullMQ) for asynchronous reactions.

### 3.4 Backend Domain Module Map (17 Modules)

| # | Module | Tier | Primary Ownership |
|---|---|---|---|
| 1 | `auth` | Critical | Registration, login, Argon2id verification, session cookies, TOTP MFA (admin), email verification, password reset |
| 2 | `users-roles` | Critical | User profiles, addresses, RBAC roles/permissions (`user.role.manage`), ownership enforcement |
| 3 | `catalog` | Core | Products, categories, variants, SKUs, product media, size guides, publish readiness gate |
| 4 | `collections` | Core | Curated collections (`Essentials`, `Form`, `Atelier`, `Movement`), scheduled merchandising windows |
| 5 | `pricing-promotions` | Critical | Authoritative server pricing, coupon validation, discount rounding & line allocation, redemption tracking |
| 6 | `inventory` | Critical (4-layer) | Warehouses, `inventory_levels`, append-only `inventory_movements`, atomic `stock_reservations` |
| 7 | `cart` | Core | Authenticated & guest carts (`arven_guest_cart`), item dedup, explicit login cart merge |
| 8 | `checkout` | Critical (4-layer) | Server-authoritative quote, idempotency lock, sorted atomic stock reservation, order + outbox creation |
| 9 | `orders` | Critical (4-layer) | `OrderStatus` state machine, immutable snapshots, status history, customer/guest lookup, cancellation |
| 10 | `payments` | Critical (4-layer) | `PaymentStatus` machine, Midtrans adapter, webhook signature + `getStatus`, `payment_events` dedup, refunds |
| 11 | `shipping` | Core | `ShipmentStatus` machine, `ShippingProvider` adapter, rate quote, label creation, tracking event sync |
| 12 | `returns` | Critical (4-layer) | `ReturnStatus` machine, item/qty validation, inspection outcomes, `RETURN_TO_STOCK` & refund trigger |
| 13 | `reviews` | Supporting | Verified-buyer product reviews, moderation workflow (`PENDING`/`APPROVED`/`HIDDEN`/`REJECTED`) |
| 14 | `media-3d-assets` | Core | Presigned upload URLs, MIME/size validation, `product_3d_assets` versioning, `customization_presets`, `outfit_scenes` |
| 15 | `cms` | Supporting | Homepage sections, Lookbooks, Journal articles, static pages (`DRAFT -> PREVIEW -> PUBLISHED -> ARCHIVED`) |
| 16 | `analytics` | Supporting | KPI aggregation (Gross/Net Sales, AOV, Conversion, Return Rate, Stock Cover, 3D Engagement), privacy scrubbing |
| 17 | `audit-notifications` | Platform | Append-only `audit_logs`, `outbox_events` relay, transactional email templates |

---

## 4. Asynchronous Architecture: Outbox, 8 BullMQ Queues & Provider Adapters

### 4.1 Transactional Outbox Flow
1. Any state-changing transaction (e.g., `order.created`, `payment.succeeded`, `asset.validation.completed`) inserts a row into `outbox_events` in the **same PostgreSQL transaction** as the domain mutation.
2. `OutboxRelayService` inside `apps/worker` polls unpublished rows (`WHERE published_at IS NULL AND next_attempt_at <= NOW() FOR UPDATE SKIP LOCKED` in small batches, e.g., 50 rows) and enqueues each event into its target BullMQ queue with `jobId = outboxEvent.id` for broker-level deduplication.
3. Upon enqueue success, `published_at = NOW()` is stamped. Transient broker failures increment `attempts`, capture `last_error`, and apply exponential backoff.
4. All BullMQ consumers MUST be **idempotent** because at-least-once delivery applies.

### 4.2 BullMQ 6 Queues Inventory (Redis 8.x — 8 Queues)

Configured via `@nestjs/bullmq@^12` + `bullmq@^6` (`^6.5.3`) backed by **Redis 8.x** (non-volatile persistence `AOF` recommended for queue durability):

| # | Queue Name | Primary Jobs | Priority | Retry / Backoff / DLQ Policy |
|---|---|---|---|---|
| 1 | `payment` | Async webhook post-processing, Midtrans `getStatus` polling fallback, periodic pending-payment reconciliation | High (`priority: 1`) | 5 attempts, exponential backoff (`5s` base), fail moves to `payment:dlq` + alert |
| 2 | `inventory` | Repeatable reservation expiry sweep (every 60s), release expired `ACTIVE` reservations, low-stock threshold alerts | High (`priority: 1`) | 5 attempts, exponential (`2s`), strictly idempotent SQL state guards |
| 3 | `order` | Order confirmation follow-up, unpaid order expiration sync, auto-completion after delivery window | High/Normal (`priority: 2`) | 4 attempts, exponential (`5s`), idempotent state transitions |
| 4 | `shipping` | Carrier shipment creation, label generation, periodic tracking status poll | Normal (`priority: 3`) | 6 attempts, exponential (`15s` base) for carrier outage resilience |
| 5 | `notification` | Verification email, password reset, order receipt, shipment tracking email, return/refund update | Normal (`priority: 3`) | 5 attempts, exponential (`10s`), dead-letter inspection on bounce/error |
| 6 | `media` | Uploaded image magic-byte check, resize/WebP conversion, EXIF stripping, metadata extraction | Low/Normal (`priority: 4`) | 3 attempts, fixed (`10s`), marks media validation failed on corrupt input |
| 7 | `3d-assets` | GLB binary/JSON parse, mesh/material slot validation against product config, size/rig checks, poster verification | Low/Normal (`priority: 4`, concurrency `2`) | 3 attempts, isolated worker concurrency + memory/CPU cap, marks `AssetStatus.FAILED` with diagnostics |
| 8 | `analytics` | Daily sales/funnel rollups, stock cover snapshots, privacy-scrubbed 3D engagement rollups | Low (`priority: 5`) | 3 attempts, exponential (`30s`), rebuildable aggregations |

### 4.3 Domain Event Catalog (`schema_version = 1`)

All events follow `dot.case` naming and exclude raw secrets or unnecessary PII:
- `user.registered`
- `product.published`
- `product.variant.updated`
- `inventory.received`
- `inventory.reserved`
- `inventory.released`
- `order.created`
- `payment.pending`
- `payment.succeeded`
- `payment.failed`
- `order.ready_to_ship`
- `shipment.dispatched`
- `shipment.delivered`
- `return.requested`
- `refund.completed`
- `asset.validation.completed`
- `asset.published`

### 4.4 External Provider Adapter Interfaces (`AMB-07` Resolution)

Every external integration sits behind a clean TypeScript port in `apps/api/src/shared/ports/` so providers can be swapped or tested deterministically in local/CI environments:

```typescript
// 1. PaymentProvider
export interface PaymentSessionRequest {
  orderId: string;
  orderNumber: string;
  amountIdr: number;
  currency: 'IDR';
  customer: { fullName: string; email: string; phone?: string };
  items: ReadonlyArray<{ sku: string; name: string; unitPriceIdr: number; quantity: number }>;
  expiresAt: Date;
  idempotencyKey: string;
}

export interface PaymentSessionResult {
  provider: 'midtrans' | string;
  providerReference: string;
  snapToken?: string;
  redirectUrl: string;
  rawExpiresAt?: Date;
}

export interface ProviderPaymentStatus {
  providerReference: string;
  providerTransactionId?: string;
  status: 'PENDING' | 'AUTHORIZED' | 'SETTLEMENT' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  grossAmountIdr: number;
  paymentMethod?: string;
  settledAt?: Date;
  rawPayload: Record<string, unknown>;
}

export interface VerifiedWebhookEvent {
  providerEventId: string;
  providerReference: string;
  eventType: string;
  statusCode: string;
  grossAmountRaw: string;
  mappedStatus: ProviderPaymentStatus['status'];
  rawPayload: Record<string, unknown>;
}

export interface RefundRequest {
  paymentId: string;
  providerReference: string;
  refundKey: string;
  amountIdr: number;
  reason: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  rawPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly providerCode: string;
  createSession(input: PaymentSessionRequest): Promise<PaymentSessionResult>;
  getStatus(providerReference: string): Promise<ProviderPaymentStatus>;
  verifyWebhook(headers: Record<string, string | string[] | undefined>, payload: unknown): Promise<VerifiedWebhookEvent>;
  refund(input: RefundRequest): Promise<RefundResult>;
}

// 2. ShippingProvider
export interface ShippingAddressSnapshot {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province: string;
  postalCode: string;
  countryCode: 'ID' | string;
}

export interface ShippingQuoteInput {
  originWarehouseCode: string;
  destination: ShippingAddressSnapshot;
  totalWeightGrams: number;
  declaredValueIdr: number;
}

export interface ShippingRateOption {
  provider: string;
  serviceCode: string;
  serviceName: string;
  costIdr: number;
  estimatedMinDays: number;
  estimatedMaxDays: number;
}

export interface CreateShipmentInput {
  orderNumber: string;
  originWarehouseCode: string;
  destination: ShippingAddressSnapshot;
  serviceCode: string;
  totalWeightGrams: number;
  items: ReadonlyArray<{ sku: string; name: string; quantity: number; weightGrams: number }>;
}

export interface ShipmentDispatchResult {
  providerReference: string;
  trackingNumber: string;
  labelUrl?: string;
}

export interface TrackingSnapshot {
  trackingNumber: string;
  status: 'READY_TO_SHIP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED';
  events: ReadonlyArray<{ occurredAt: Date; description: string; location?: string; rawCode?: string }>;
}

export interface ShippingProvider {
  readonly providerCode: string;
  getRates(input: ShippingQuoteInput): Promise<ReadonlyArray<ShippingRateOption>>;
  createShipment(input: CreateShipmentInput): Promise<ShipmentDispatchResult>;
  getTracking(trackingNumber: string): Promise<TrackingSnapshot>;
  cancelShipment(providerReference: string, reason: string): Promise<{ cancelled: boolean }>;
}

// 3. EmailProvider
export interface EmailSendResult {
  messageId: string;
  accepted: boolean;
}

export interface EmailProvider {
  sendTransactional(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
    idempotencyKey?: string;
  }): Promise<EmailSendResult>;

  sendTemplate(input: {
    to: string;
    templateCode: string;
    locale: 'id' | 'en';
    variables: Record<string, string | number | boolean>;
    idempotencyKey?: string;
  }): Promise<EmailSendResult>;
}

// 4. ObjectStorageProvider
export interface PresignedUploadResult {
  objectKey: string;
  uploadUrl: string;
  method: 'PUT';
  requiredHeaders: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObjectMetadata {
  objectKey: string;
  contentLength: number;
  contentType: string;
  eTag?: string;
}

export interface ObjectStorageProvider {
  createPresignedUpload(input: {
    objectKey: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUploadResult>;

  headObject(objectKey: string, bucketScope: 'staging' | 'public'): Promise<StoredObjectMetadata | null>;
  deleteObject(objectKey: string, bucketScope: 'staging' | 'public'): Promise<void>;
  publishAsset(input: {
    stagingKey: string;
    publicKey: string;
    contentType: string;
    cacheControl: string;
  }): Promise<{ publicUrl: string; eTag?: string }>;
}

// 5. AnalyticsExporter
export interface AnalyticsExporter {
  emitEvent(input: {
    eventName: string;
    occurredAt: Date;
    sessionKey?: string; // Pseudonymous hash, never raw PII
    properties: Record<string, string | number | boolean>;
  }): Promise<void>;

  aggregatePeriod(input: {
    metric: string;
    periodStartUtc: Date;
    periodEndUtc: Date;
  }): Promise<{ rowsWritten: number }>;
}
```

**Local Development Adapters:**
- `ObjectStorageProvider` -> MinIO S3-compatible local adapter (`@aws-sdk/client-s3`).
- `EmailProvider` -> Mailpit SMTP (`nodemailer`) locally; production transactional email provider (SES/Postmark/Resend) via config.
- `PaymentProvider` -> Midtrans Sandbox in staging/dev; deterministic `LocalTestPaymentAdapter` enabled **only** when `NODE_ENV === 'test' || (NODE_ENV === 'development' && PAYMENT_DRIVER === 'local_stub')` and strictly blocked on startup if `NODE_ENV === 'production'`.
- `ShippingProvider` -> Deterministic local zone/weight rate table adapter until carrier contract is provisioned.

---

## 5. Frontend Rendering Boundaries (Next.js 16 + React 19 + R3F 9)

Both `apps/storefront` and `apps/admin` run **Next.js 16 App Router** with:
- **`cacheComponents: true`** in `next.config.ts` (replacing deprecated `experimental.ppr`, `experimental.dynamicIO`, and route-level `export const dynamic = 'force-dynamic'`).
- **`proxy.ts`** at the app root (`export function proxy(request: NextRequest)`) replacing `middleware.ts`.
- **Top-level `turbopack` config** in `next.config.ts`.
- **`transpilePackages: ['three']`** in `apps/storefront/next.config.ts` (plus shared monorepo packages if shipping uncompiled TS).

### 5.1 Route Rendering & `<Suspense>` Boundary Matrix

| Route Family | Rendering Strategy (`cacheComponents: true`) | `<Suspense>` / Client Boundary Rule |
|---|---|---|
| `/` (Home), `/lookbook/[slug]`, `/journal/[slug]`, `/about` | Cached Server Components (`'use cache'` + `cacheTag` / `cacheLife`) | Header cart count & user greeting live in a `<Suspense>`-wrapped client/dynamic island so the static shell streams immediately |
| `/shop`, `/shop/[category]`, `/collections`, `/collections/[slug]`, `/search` | Server-rendered catalog grid + URL-driven client filter/sort controls | Dynamic availability/filter islands wrapped in `<Suspense>`; zero 3D bundle imported |
| `/products/[slug]` (PDP) | Cached Server Component product details, size guide, static gallery & poster | Variant availability badge in `<Suspense>`; 3D Viewer loaded via `next/dynamic(..., { ssr: false })` inside `<ErrorBoundary>` + WebGL capability check ONLY when product has `READY` 3D asset |
| `/showroom`, `/outfit-studio` | Lightweight SSR shell + `'use client'` `ssr: false` 3D boundary | Explicit `<Suspense>` skeleton + immediate non-WebGL accessible product list/fallback |
| `/cart`, `/checkout`, `/account/*` | Uncached per-request dynamic routes (read `cookies()` / `headers()`) | Must sit inside `<Suspense>` boundaries per Next.js 16 `cacheComponents` requirement; never cached publicly (`Cache-Control: no-store`) |
| `apps/admin/*` | Uncached authenticated/MFA-gated dynamic routes | Protected by `proxy.ts` session check + server-side `/auth/me` verification + `<Suspense>` data tables |

---

## 6. Environment & Deployment Topology

| Dimension | Local Dev | CI | Staging | Production |
|---|---|---|---|---|
| Infra | `docker-compose.yml` (`postgres:18`, `redis:8`, `minio`, `mailpit`) | Ephemeral PostgreSQL 18 + Redis 8 service containers | Managed staging DB + Redis + dedicated R2 staging bucket | Managed PostgreSQL 18 (PITR, private VPC) + Redis 8 (private VPC, AOF) + R2 + CDN + WAF |
| Secrets | `.env.local` (gitignored) | CI masked test secrets | Staging secret manager + Midtrans Sandbox keys | Production secret manager / Docker secrets + Midtrans Production keys |
| Processes | `pnpm dev --filter ...` | Ephemeral test servers + Playwright | `storefront`, `admin`, `api`, `worker` containers | Horizontally scaled `storefront`, `admin`, `api` + isolated `worker` instances (separate `3d-assets` concurrency cap) |
| Seed Data | Synthetic 6-SKU ARVEN fixture (`ARV-TOP-001`..`ARV-ACC-001`) | Deterministic fixture reset per suite | Curated UAT catalog | Zero test fixtures; initial admin bootstrap via CLI |
| Graceful Shutdown | `SIGTERM` cleanup | Automatic teardown | Zero-downtime rolling deploy | Drain HTTP connections -> close BullMQ workers -> `prisma.$disconnect()` -> `pgPool.end()` |

### 6.1 Connection Pooling & Timeout Baselines
- `apps/api`: `pg.Pool` max connections sized explicitly per instance (`DATABASE_POOL_MAX`, default `20` in prod, `10` in dev), `statement_timeout = 10000` (10s) on request connections to prevent runaway locks.
- `apps/worker`: Separate `pg.Pool` (`DATABASE_POOL_MAX`, default `10`) so heavy background jobs never starve checkout API connections.
- Redis: Dedicated connection config for BullMQ (`maxRetriesPerRequest: null` per BullMQ requirement) vs short-timeout connection for cache/rate-limit lookups.
