# ARVEN — Phase 08 Security, Privacy, RBAC & Anti-Tamper Governance

> **Phase:** Phase 08 — Virtual Showroom (`FR-013`) & Outfit Studio (`FR-014`) (`P1` per `AMB-P8-05`)  
> **Harness Plan ID:** `902c7aba-7aeb-406d-9ebb-2edefdc9108f`  
> **Task ID:** `23f6ac7a-a56c-4614-9a2f-c183100d1c34` (`governance-lead`)  
> **Governing Baselines:** [`AGENTS.md`](../AGENTS.md), [`docs/SECURITY_POLICY.md`](./SECURITY_POLICY.md), [`docs/PRINCIPAL_DEVELOPMENT.md`](./PRINCIPAL_DEVELOPMENT.md), [`docs/PRD_AND_BUSINESS_RULES.md`](./PRD_AND_BUSINESS_RULES.md) (`FR-013`, `FR-014`), [`docs/PHASE_07_GOVERNANCE.md`](./PHASE_07_GOVERNANCE.md), [`docs/PHASE_08_PLAN.md`](./PHASE_08_PLAN.md)

---

## 1. Zero-Expansion RBAC & Admin Route Governance (`AMB-P8-04`)

### 1.1 Permission Catalog Preservation
Phase 08 **MUST NOT** add new permission codes, new roles, or new BullMQ queues. The canonical permission registry in [`packages/config/src/constants.ts`](../packages/config/src/constants.ts) (`PERMISSION_CODES`) and [`docs/SECURITY_POLICY.md`](./SECURITY_POLICY.md) §4.2 remains unchanged (note: `AGENTS.md` and `PHASE_08_PLAN.md` refer to the 34-code baseline, while `packages/config/src/constants.ts` contains the 36 canonical codes aligned with `SECURITY_POLICY.md` §4.2; zero codes are added or removed in Phase 08).

All Phase 08 admin endpoints reuse existing `asset.*` permissions:
- **Read endpoints:** `@RequirePermissions('asset.read')`
- **Mutation endpoints:** `@RequirePermissions('asset.publish')`

### 1.2 Role-by-Role Access Matrix (Admin Experience Routes)

| Role | `asset.read` (Showroom/Outfit Studio `GET`) | `asset.publish` (Showroom/Outfit Studio Mutations) | Notes |
|---|---|---|---|
| `OWNER` | **Allow** | **Allow** | Full access with active Admin session + TOTP MFA |
| `MANAGER` | **Allow** | **Allow** | Full access with active Admin session + TOTP MFA |
| `PRODUCT` | **Allow** | **Allow** | Full access with active Admin session + TOTP MFA |
| `CONTENT` | **Allow** (Read-Only) | **Deny (`403 FORBIDDEN`)** | May inspect zones, garments, and presets; blocked from mutations |
| `INVENTORY` | **Deny (`403 FORBIDDEN`)** | **Deny (`403 FORBIDDEN`)** | No `asset.*` grants |
| `ORDER` | **Deny (`403 FORBIDDEN`)** | **Deny (`403 FORBIDDEN`)** | No `asset.*` grants *(operations fulfillment role)* |
| `SUPPORT` | **Deny (`403 FORBIDDEN`)** | **Deny (`403 FORBIDDEN`)** | No `asset.*` grants |
| `CUSTOMER` | **Deny (`403 FORBIDDEN`)** | **Deny (`403 FORBIDDEN`)** | Blocked at `SessionAuthGuard` / `PermissionGuard` on all `/admin/*` routes |

*(Note: ARVEN does not define separate `OPERATIONS` or `FINANCE` role enums; operational fulfillment/warehouse duties map to `ORDER`/`INVENTORY` and financial approvals map to `OWNER` per `SECURITY_POLICY.md` §4.1.)*

### 1.3 Admin Experience Endpoints, Permissions & Mandatory `@AuditAction`

Every admin handler in `apps/api/src/modules/experiences/` MUST carry `@AdminAuth()`, `@RequirePermissions(...)`, and—for every state-changing endpoint—`@AuditAction(action, resource)` paired with `markAuditRecordedInTransaction(req)` and transactional `AuditLogService` persistence:

| Method & Route (`/api/v1`) | Permission | `@AuditAction(action, resource)` |
|---|---|---|
| `GET /admin/showroom/zones` | `asset.read` | — |
| `GET /admin/showroom/zones/:id` | `asset.read` | — |
| `POST /admin/showroom/zones` | `asset.publish` | `@AuditAction('showroom.zone.created', 'ShowroomZone')` |
| `PATCH /admin/showroom/zones/:id` | `asset.publish` | `@AuditAction('showroom.zone.updated', 'ShowroomZone')` |
| `POST /admin/showroom/zones/:id/transition` | `asset.publish` | `@AuditAction('showroom.zone.transitioned', 'ShowroomZone')` |
| `POST /admin/showroom/zones/:id/hotspots` | `asset.publish` | `@AuditAction('showroom.hotspot.created', 'ShowroomHotspot')` |
| `PATCH /admin/showroom/hotspots/:id` | `asset.publish` | `@AuditAction('showroom.hotspot.updated', 'ShowroomHotspot')` |
| `DELETE /admin/showroom/hotspots/:id` | `asset.publish` | `@AuditAction('showroom.hotspot.deleted', 'ShowroomHotspot')` |
| `GET /admin/outfit-studio/garments` | `asset.read` | — |
| `PUT /admin/3d-assets/:id/outfit-compatibility` | `asset.publish` | `@AuditAction('asset.outfit_compatibility.updated', 'Product3DAsset')` |
| `DELETE /admin/3d-assets/:id/outfit-compatibility` | `asset.publish` | `@AuditAction('asset.outfit_compatibility.removed', 'Product3DAsset')` |
| `GET /admin/outfit-studio/presets` | `asset.read` | — |
| `POST /admin/outfit-studio/presets` | `asset.publish` | `@AuditAction('outfit.preset.created', 'OutfitScene')` |
| `PATCH /admin/outfit-studio/presets/:id` | `asset.publish` | `@AuditAction('outfit.preset.updated', 'OutfitScene')` |
| `DELETE /admin/outfit-studio/presets/:id` | `asset.publish` | `@AuditAction('outfit.preset.deleted', 'OutfitScene')` |

---

## 2. Threat `T-03` Anti-Price-Tampering Governance

Saved outfits (`outfit_scenes`), draft validations (`/outfit-studio/validate`), cart additions (`/outfit-studio/cart-items`), and showroom hotspots (`/showroom/scenes`) MUST never trust client-supplied prices, discounts, totals, or availability flags.

1. **Strict Zod Schema Rejection (`400 VALIDATION_ERROR`):**
   - All Phase 08 request schemas in `packages/validators/src/experiences.ts` MUST apply `.strict()`.
   - Any payload containing unknown keys—specifically any price, amount, total, discount, subtotal, status, or owner-override fields (`price`, `priceIdr`, `unitPrice`, `unitPriceIdr`, `amount`, `total`, `discount`, `discountAmount`, `subtotal`, `userId`, `isPublicPreset` on customer endpoints)—MUST fail `StandardSchemaValidationPipe` with HTTP `400 VALIDATION_ERROR` before reaching service logic.
2. **PostgreSQL Defense-in-Depth (`chk_outfit_items_no_price`):**
   - Migration `0002_phase08_showroom_outfits` MUST append SQL `CHECK` constraints to `outfit_scenes`:
     - `chk_outfit_items_shape`: `jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 5`
     - `chk_outfit_owner_or_public`: `user_id IS NOT NULL OR is_public_preset = true`
     - `chk_outfit_rig_format`: `mannequin_rig_version ~ '^arven_mannequin_[a-z0-9_]+$'`
     - `chk_outfit_items_no_price`: `NOT jsonb_path_exists(items, '$[*].keyvalue() ? (@.key like_regex "price|amount|total|discount" flag "i")')`
   - Persisted `items` entries store ONLY `{ slot, productId, variantId, assetId, presetId }`.
   - Integration tests MUST execute a raw SQL `INSERT` containing `unitPriceIdr` into `outfit_scenes` and assert PostgreSQL constraint rejection.
3. **Server-Side Live Price & Availability Re-Resolution:**
   - `GET /outfit-scenes` and `GET /outfit-scenes/:id` MUST re-query `products`, `product_variants`, `inventory_levels`, `product_3d_assets`, and `customization_presets` inside a database read transaction to hydrate live `priceIdr`, stock availability, and a `stale` indicator if a variant/product became inactive or compatibility changed.
   - `POST /outfit-studio/cart-items` MUST re-validate rig/slot compatibility and resolve authoritative `product_variants.price` and stock availability inside a transaction, delegating line-item creation to `CartService` with `configuration: { outfitPresetId }` only (never forwarding prices). It returns per-slot outcomes (`ADDED | OUT_OF_STOCK | INACTIVE`).
   - `GET /showroom/scenes` MUST compute hotspot `fromPriceIdr` live from active `product_variants` of `PUBLISHED` visible products; prices MUST NEVER be persisted inside `showroom_zones.config`.

---

## 3. Ownership, IDOR & Guest Access Boundaries (`AMB-P8-01`, `T-02`)

1. **Canonical Route (`AMB-P8-01`):**
   - The canonical resource path is **`/api/v1/outfit-scenes`** (resolving `/outfits/*` in `SECURITY_POLICY.md` §4.3 to `/outfit-scenes` per `API_CONTRACTS.md` §8.4 and `THREE_D_PIPELINE.md` §5.3).
2. **Customer Auth & Query-Embedded Ownership:**
   - All `/outfit-scenes` and `/outfit-scenes/:id` handlers MUST be decorated with `@CustomerAuth()`.
   - Every repository read, update, and delete MUST embed `where: { id, userId: actor.userId }` (or `where: { userId: actor.userId }` for collection reads) directly in the Prisma query—never fetch by `id` alone before checking ownership.
   - Cross-user IDOR attempts (User A calling `GET`, `PATCH`, or `DELETE` on User B's `id`, or on a public preset row where `userId IS NULL`) MUST return **`404 RESOURCE_NOT_FOUND`**—never `403 FORBIDDEN`—and leak zero victim metadata.
3. **Per-User Saved Outfit Cap:**
   - `POST /outfit-scenes` enforces `OUTFIT_STUDIO_POLICY.MAX_SAVED_OUTFITS_PER_USER = 50` inside the creation transaction; exceeding 50 saved outfits for `actor.userId` rejects with **`422 OUTFIT_LIMIT_REACHED`**.
4. **Guest Interaction vs. Persistence Boundary:**
   - Guests (unauthenticated browsers) MAY access:
     - `GET /showroom/scenes`, `GET /showroom/zones/:code/*` (`@Public()`)
     - `GET /outfit-studio/catalog`, `GET /outfit-studio/rigs/:rigId/*` (`@Public()`)
     - `POST /outfit-studio/validate` (`@Public()`, CSRF/Origin protected via `CsrfGuard`, Redis-throttled via `@Throttle`)
     - `POST /outfit-studio/cart-items` (`@Public()`, CSRF/Origin protected via `CsrfGuard`, Redis-throttled via `@Throttle`, uses guest cart cookie or customer session)
   - Guests calling `GET`, `POST`, `PATCH`, or `DELETE` on `/outfit-scenes*` MUST fail closed with **`401 UNAUTHORIZED`** (`SessionAuthGuard`).

---

## 4. Rig & Slot Compatibility Governance (`FR-014`)

Server-side compatibility enforcement is authoritative in `OutfitCompatibilityPolicy` (`apps/api/src/modules/experiences/`) and shared across `POST /outfit-studio/validate`, `POST /outfit-studio/cart-items`, `POST /outfit-scenes`, `PATCH /outfit-scenes/:id`, and `POST/PATCH /admin/outfit-studio/presets*`.

### 4.1 Fixed Mannequin Contract (`packages/config/src/constants.ts`)
- `RIG_ID`: `'arven_mannequin_unisex_v1'`
- `SKELETON_VERSION`: `'1.0.0'`
- `SLOTS`: `['top', 'bottom', 'outerwear', 'footwear', 'accessory']` (max 1 garment per slot; 1..5 items per outfit)
- `ANCHORS`:
  - `top`: `['spine_upper']`
  - `outerwear`: `['spine_upper']`
  - `bottom`: `['pelvis']`
  - `footwear`: `['feet']`
  - `accessory`: `['shoulder_left', 'shoulder_right', 'wrist_left']`

### 4.2 Mandatory `422 INCOMPATIBLE_OUTFIT_SLOT` Reason Codes
Any compatibility violation returns HTTP **`422`** with `error.code = 'INCOMPATIBLE_OUTFIT_SLOT'` and `details.violations[] = { slot, productId, reason }`:

| `reason` Code | Server-Side Validation Rule |
|---|---|
| `RIG_MISMATCH` | Submitted `rigId !== 'arven_mannequin_unisex_v1'` OR garment `config.outfitCompatibility.rigId !== 'arven_mannequin_unisex_v1'`. |
| `SKELETON_VERSION_MISMATCH` | Garment `config.outfitCompatibility.skeletonVersion !== '1.0.0'` (e.g., seeded `atelier-archive-field-jacket` pinned to `'0.9.0'`; also excluded from `GET /outfit-studio/catalog`). |
| `SLOT_MISMATCH` | Submitted `slot` does not equal garment `config.outfitCompatibility.slot` (e.g., crossbody assigned to `top`). |
| `ANCHOR_INVALID` | Garment `config.outfitCompatibility.anchor` is not included in `OUTFIT_STUDIO_POLICY.ANCHORS[slot]`. |
| `LAYER_CONFLICT` | Symmetric conflict check: for any pair `(A, B)` in `slots`, `A.incompatibleSlots` includes `B.slot` **OR** `B.incompatibleSlots` includes `A.slot` (e.g., `atelier-oversized-poplin-shirt` + `atelier-boxy-wool-overshirt` in either order). |
| `DUPLICATE_SLOT` | Request `slots[]` contains more than one entry for the same `slot`. |
| `GARMENT_UNAVAILABLE` | Referenced product is deleted, not `PUBLISHED`, or `!isVisible`; OR `Product3DAsset` is missing, not `READY`, not active, or lacks non-null `config.outfitCompatibility`. |
| `VARIANT_PRODUCT_MISMATCH` | Submitted `variantId` does not exist, is inactive/deleted, or does not belong to the resolved product. |
| `PRESET_ASSET_MISMATCH` | Submitted `presetId` (when non-null) does not exist, is inactive, or does not belong to the resolved `Product3DAsset`. |

Admin `PUT /admin/3d-assets/:id/outfit-compatibility` MUST validate `rigId`, `skeletonVersion`, `slot`, `anchor`, and `incompatibleSlots` against `OUTFIT_STUDIO_POLICY` before persisting.

---

## 5. Showroom Publication, Path Traversal & Binary Serving (`T-06`)

1. **Publication Isolation:**
   - `GET /showroom/scenes` returns **only** `ShowroomZone` rows with `status = 'PUBLISHED'`. Hotspots inside a published zone are included **only** when `hotspot.isActive = true` AND `product.status = 'PUBLISHED' AND product.isVisible = true AND product.deletedAt IS NULL`.
   - `GET /showroom/zones/:code/scene`, `/scene-lite`, and `/poster` MUST return **`404 RESOURCE_NOT_FOUND`** when the zone does not exist or its status is `DRAFT` or `ARCHIVED` (e.g., seeded `archive-vault`).
2. **Path Traversal Prevention (`..`, `/`, `\`, Null Bytes):**
   - Route param `:code` MUST be validated by Zod regex `^[a-z0-9]+(-[a-z0-9]+)*$` (max 64 chars, matching `chk_showroom_zone_code_format`).
   - Route param `:rigId` MUST be validated by Zod regex `^arven_mannequin_[a-z0-9_]+$` (max 64 chars, matching `chk_outfit_rig_format`) and matched against `OUTFIT_STUDIO_POLICY.RIG_ID` (`404` otherwise).
   - Storage reads MUST resolve keys strictly from validated DB columns (`sceneObjectKey`, `liteSceneObjectKey`, `posterKey`) or the code-pinned rig prefix (`rigs/arven_mannequin_unisex_v1/v0001/...`)—never by concatenating untrusted user input onto filesystem/bucket paths.
3. **Binary Response Headers:**
   - All binary routes (`/showroom/zones/:code/{scene,scene-lite,poster}` and `/outfit-studio/rigs/:rigId/{model,model-lite,poster}`) MUST use `@Public()`, `@SkipEnvelope()`, and emit:
     - `X-Content-Type-Options: nosniff`
     - `Cache-Control: public, max-age=31536000, immutable`
     - `Content-Type: model/gltf-binary` (for `.glb`) or `image/svg+xml` / `image/webp` (for posters matching `AMB-P8-06`).
4. **No Arbitrary GLB Upload Surface:**
   - Phase 08 introduces **zero** new user or admin arbitrary GLB upload endpoints. `POST /admin/showroom/zones` generates deterministic gallery geometry server-side via `@arven/three-engine/glb` (`buildArvenShowroomZoneGlbBuffer`) within strict byte caps (`scene_bytes <= 6291456`, `lite_scene_bytes <= 3670016` enforced in PostgreSQL `CHECK` constraints). Mannequin rig GLBs are deterministic code-pinned artifacts. Product 3D asset uploads continue using the Phase 07 `T-06` quarantine pipeline unchanged.

---

## 6. CSP, Telemetry & Privacy Verification

1. **Content Security Policy (`apps/storefront/src/proxy.ts` & `apps/admin/src/proxy.ts`):**
   - Production `script-src` MUST maintain `'self' 'nonce-<random>' <NEXT_CACHE_COMPONENTS_INLINE_HASHES> 'wasm-unsafe-eval'` **without** `'unsafe-eval'` (`'unsafe-eval'` permitted strictly when `NODE_ENV === 'development'`).
   - `worker-src 'self' blob:` MUST remain enabled for self-hosted Draco/Meshopt/KTX2 web workers under `/decoders/`.
   - **Zero external CDNs:** `script-src`, `connect-src`, `img-src`, and `worker-src` MUST NOT add third-party CDN origins (`unpkg.com`, `gstatic.com`, etc.).
   - Security headers `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()` remain enforced on all storefront and admin pages.
2. **Privacy & Non-PII Telemetry:**
   - Saved outfit queries and public catalog endpoints NEVER expose customer PII (`email`, `phone`, `fullName`, `address`) of other users or preset authors.
   - Any 3D/experience diagnostics or telemetry remain strictly pseudonymous/aggregate with zero PII in logs (`T-08`).

---

## 7. Scope Boundaries, Verification Gates & Separation of Duties

1. **Non-Fit-Simulation Boundary (`FR-014` / `R-36`):**
   - Phase 08 explicitly prohibits cloth/drape physics simulation, body measurement scanning, parametric avatar shaping, skinning deformation beyond rigid anchor attachment, or virtual fit/sizing guarantees.
   - `/outfit-studio` MUST render the permanent disclosure: *"Pratinjau gaya visual menggunakan manekin standar. Periksa Panduan Ukuran untuk detail ukuran fisik."*
2. **Auth Metadata Gate (`check:auth-metadata`):**
   - Every new route in `apps/api/src/modules/experiences/` MUST declare exactly one of `@Public()`, `@CustomerAuth()`, or `@AdminAuth()`, and every `/admin/*` handler MUST declare `@RequirePermissions(...)`.
   - `corepack pnpm --filter @arven/api check:auth-metadata` MUST pass with **`0` violations**.
3. **Phase 08 Scope Lock:**
   - Phase 09 hardening (`k6` load tests, backup/restore drills, CDN/WAF rollout, production cutover runbooks) is strictly out of scope.
4. **Stage 3/4 Separation & Repair Budget (`PRINCIPAL_DEVELOPMENT.md` §4.3–4.4):**
   - Implementation agents (`data-engineer`, `backend-developer`, `threejs-developer`, `motion-developer`, `frontend-developer`, `security-engineer`) MUST NEVER verify or mark `PASS` on their own patches or quality checkpoints.
   - Independent QA agents (`responsive-qa-agent`, `visual-qa-agent`, `functional-qa-agent`, `design-qa-agent`, `threejs-qa-agent`, `accessibility-qa-agent`, `security-qa-agent`, `performance-qa-agent`, `independent-assurance-lead`) execute Stage 4 verification against all 10 Phase 08 quality checkpoints (`responsive`, `layout`, `interaction`, `typography-color`, `motion`, `3d-rendering`, `accessibility`, `performance`, `security`, `final-regression`).
   - Maximum repair budget is **`maxRepairIterations = 5`**; if any required checkpoint or task remains failing at `5/5`, automated retries MUST stop and escalate to the user with a Decision Packet.
