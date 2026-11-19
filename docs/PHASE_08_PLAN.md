# ARVEN Phase 08 Plan: Virtual Showroom & Outfit Studio

> **Phase:** Phase 08 (`FR-013`, `FR-014`, P1; `docs/PRD_AND_BUSINESS_RULES.md` §2.3 & §5, `docs/PRINCIPAL_DEVELOPMENT.md` §2, `docs/THREE_D_PIPELINE.md` §1, §4, §5, Blueprint §13.4, §13.6, §13.8)  
> **Harness Plan ID:** `902c7aba-7aeb-406d-9ebb-2edefdc9108f`  
> **Discovery Task:** `2af4856c-e384-4f9d-a814-9bf8e9fee661` (`discovery-lead`)  
> **Baseline Commit:** `7dfa194` (Phase 07 complete, clean working tree at discovery time)  
> **Runtime Topology:** Native Windows, no Docker. `PostgreSQL 18` on `5432` (port open at discovery), `Memurai` Redis API on `6379` (port open at discovery), `pnpm@10.34.9` via Corepack (`corepack pnpm --version` = `10.34.9`), `LocalFsStorageAdapter` on `.local/storage`.

---

## 1. Scope & Non-Goals

### 1.1 In Scope (P1)

1. **Virtual Showroom (`/showroom`, `FR-013`)**
   - SSR shell (zone list, editorial copy, accessible product list) plus a client-only 3D island loaded via `next/dynamic(..., { ssr: false })`.
   - Zone-based architectural gallery: one GLB per zone, lazy-loaded. Only the **active zone + its immediate portal target** may be resident (max 2 zones in GPU memory).
   - Per active zone payload `<= 6 MB` (`default`), `<= 3.5 MB` (`lite`). Baked lighting (vertex color / lightmap, no dynamic multi-shadow lights), frustum culling, `frameloop="demand"`.
   - Product hotspots open an accessible quick-card (name, live "from" IDR price via `formatIDR()` + `tabular-nums`, primary image, link to PDP). No pulsing beacons.
   - 44x44px on-screen zone-jump and directional buttons, mobile `touch-action: pan-y` scroll isolation, keyboard reachable controls.
   - Non-WebGL / context-loss / asset-failure fallback: curated zone posters + full product list, all purchasable through normal PDP flow.
2. **Outfit Studio (`/outfit-studio`, `FR-014`)**
   - One fixed unisex mannequin rig `arven_mannequin_unisex_v1` (`skeletonVersion: "1.0.0"`).
   - Five slots: `top`, `bottom`, `outerwear`, `footwear`, `accessory` (max one garment per slot).
   - Strict compatibility validation in UI **and** server: rig ID, skeleton version, declared slot, anchor, `incompatibleSlots` (checked symmetrically).
   - Saved outfits (`outfit_scenes`) for logged-in customers only. Payload stores IDs and visual config only. Prices are never persisted; they are re-resolved server-side on every read and on add-to-bag.
   - "Tambah Item ke Tas" adds compatible, in-stock items through a server endpoint that re-validates compatibility and reads authoritative prices.
   - Permanent disclosure: *"Pratinjau gaya visual menggunakan manekin standar. Periksa Panduan Ukuran untuk detail ukuran fisik."*
   - Guest users can compose a draft in React/URL state; saving prompts login.
3. **Account:** `/account/outfits` saved-outfit list (2D posters only, live prices, rename/delete, open in studio).
4. **Admin:** showroom zone and hotspot management, outfit compatibility management for garment 3D assets, curated public outfit presets.
5. **Backend:** new NestJS 12 `experiences` module (public, customer, admin controllers), Zod validators, contracts and OpenAPI sync.
6. **Data:** one additive Prisma migration (showroom tables + `outfit_scenes` CHECK hardening), deterministic seed of zones, hotspots, rig GLB, garment compatibility, an intentionally incompatible garment, public presets.
7. **Engine:** `@arven/three-engine` new subpath entries `./showroom` and `./outfit-studio`, reusing `ResourceTracker`, `disposeSceneGraph`, `detectWebGLCapabilities`, `resolveDeviceQualityTier`, `prefersReducedMotion`, self-hosted `/decoders/`.

### 1.2 Explicit Non-Goals (Strictly Out of Scope)

- **Phase 09 work:** production hardening, k6 load tests, backup/restore drills, launch runbooks, CDN/WAF rollout, deployment.
- **Simulation:** no cloth/drape physics, no body measurement scanning, no parametric avatar shaping, no size/fit prediction, no skinning-based garment deformation beyond rigid anchor attachment.
- **Showroom scope creep:** no open-world walking, no multiplayer avatars, no physics collisions, no continuous global preload of all zones, no ambient particles or camera drift.
- **Upload surface:** no new arbitrary GLB upload endpoint for showroom zones or rigs (zones are generated deterministically server-side; rig is a code-pinned contract). Phase 07 product asset upload pipeline stays unchanged.
- **No new RBAC permission codes** (catalog stays at 34). No worker or BullMQ queue changes (8 queues unchanged).
- No changes to checkout, payments, inventory reservation, or order state machines.

---

## 2. Current-State Inventory (verified at `7dfa194`)

### 2.1 Data Layer (`packages/database`)

| Item | State | Evidence |
|---|---|---|
| Migrations | Only `0001_phase02_core` exists | `packages/database/prisma/migrations/` |
| `OutfitScene` model / `outfit_scenes` table | **EXISTS** (id, user_id NULL FK CASCADE, title VARCHAR(160), mannequin_rig_version VARCHAR(64), items JSONB, is_public_preset, timestamps; indexes `(user_id, updated_at DESC)`, `(is_public_preset)`) | `schema.prisma` L612-627; `migration.sql` L376-386, L944, L947, L1145 |
| `outfit_scenes` SQL CHECKs | **MISSING** (no shape, owner, or no-price guard) | `migration.sql` L1287-1344 has none for outfit_scenes |
| `Product3DAsset.config` JSONB | **EXISTS**; no `outfitCompatibility` key written by seed or API | `schema.prisma` L556; `git grep outfit` = 0 hits outside schema/migration |
| Showroom zone / hotspot models, enums, tables | **MISSING** (not in `DATA_MODEL.md` either) | `git grep -i showroom -- packages` = 0 hits |
| Mannequin rig table | **MISSING by design** (rig is a fixed code contract; no table needed) | `THREE_D_PIPELINE.md` §5.3 |
| Seed | 6 products (tee, poplin shirt, trouser, overshirt, sneaker, crossbody), 6 `READY` assets (`v0001`), 13 presets, `has3dEnabled` on 4 | `packages/database/src/seed.ts` (2374 lines; storage writes L1908-2028) |
| Seed tests | `seed.test.ts`, `phase06-seed.test.ts`, `phase07-seed.test.ts` (count assertions will change if a product is added) | `packages/database/test/` |

### 2.2 API (`apps/api`)

| Item | State |
|---|---|
| Modules | `analytics, audit-notifications, auth, cart, catalog, checkout, cms, coupons, health, inventory, orders, payments, returns, shipping, users-roles`. **No** showroom/outfit module. |
| 3D service | `apps/api/src/modules/catalog/assets3d.service.ts` (`getPublicProduct3DAssets`, `readPublic3DAssetBinary` with storage `readBuffer`, presign/upload/confirm/publish, presets, telemetry) |
| Security decorators | `apps/api/src/common/security/decorators.ts`: `Public`, `CustomerAuth`, `AdminAuth`, `RequirePermissions`, `AuditAction` |
| Endpoints `/showroom/*`, `/outfit-studio/*`, `/outfit-scenes/*` | **MISSING** (documented only in `docs/API_CONTRACTS.md` §8.4 L248-250) |
| Error code `INCOMPATIBLE_OUTFIT_SLOT` | Documented (`API_CONTRACTS.md` L98), **not implemented** |

### 2.3 Shared Packages

| Package | State |
|---|---|
| `@arven/three-engine` | `src/{glb-binary,capabilities,resource-tracker,material-preset-controller,index}.ts`, `src/components/{ProductExperience,AccessibleProductControls}.tsx`; exports `.` and `./glb`. **No** showroom/outfit primitives, no mannequin builder, no multi-zone loader. |
| `@arven/validators` | `src/assets3d.ts` (presign, presets, telemetry, `garmentSilhouetteSchema`). **No** outfit/showroom schemas. |
| `@arven/contracts` | `src/index.ts`, `src/generated/openapi-paths.ts`, `openapi/`. **No** outfit/showroom DTOs. |
| `@arven/config` | `src/constants.ts`: `PERMISSION_CODES`, `ROLE_PERMISSION_MATRIX`, `QUEUE_NAMES` (incl. `THREE_D_ASSETS`). **No** rig/outfit policy constants. |

### 2.4 Frontend Routes

| Route | App | Current State |
|---|---|---|
| `/showroom` | storefront | **No route file** (`apps/storefront/src/app/showroom` absent) -> Next.js 404. Runtime 404 recorded in `PHASE_07_VERIFICATION_RECEIPT.md` L46. |
| `/outfit-studio` | storefront | **No route file** -> 404 (same receipt). |
| `/account/outfits` | storefront | **No route file** -> 404. |
| `/experience/showroom`, `/experience/outfit-studio` | admin | **No route files** -> 404. |
| Nav | storefront | `storefront-shell.tsx` L26-29 has Shop, Collections, Lookbook, Journal only; `account-shell.tsx` L11-15 has no outfits link; admin nav in `apps/admin/src/lib/ops-helpers.ts` L21-84 has no experience entries. |
| Guard test | storefront | `apps/storefront/test/phase06-editorial-returns.test.ts` L156-157 asserts `storefront-shell.tsx` and `account-shell.tsx` do **not** contain `/showroom` or `/outfit-studio`. Must be updated in Phase 08 when the nav links ship. |

> [!NOTE]
> Runtime 404 re-verification needs a running dev server (none was listening on 3000/3001/4000 at discovery). The independent `responsive-qa-agent` must capture a baseline 404 before implementation lands, or rely on the Phase 07 receipt.

### 2.5 Lessons Carried from Phase 07 (do not regress)

- CSP `script-src` must keep `'wasm-unsafe-eval'` and `worker-src 'self' blob:` (Meshopt/Draco), still without `'unsafe-eval'`.
- `globals.css` `@source` for `packages/three-engine/src` already exists; new engine components get Tailwind classes automatically.
- Dark 3D stages scope `data-theme="dark"` + `--arven-accent-focus: #82B0DC`.
- `ContactShadows frames={Infinity}` + dual `invalidate()` after async attach under `frameloop="demand"`.
- No `.convertSRGBToLinear()` on hex colors already in sRGB.
- Gate 3D fetches on data flags to avoid 404 noise; `/decoders/*` immutable cache headers already set.
- Root `@arven/three-engine` export is imported by the PDP island. **New showroom/outfit code must live behind new subpath exports** so the PDP chunk does not grow and showroom code never reaches the PDP.

---

## 3. Resolved Ambiguities (`AMB-P8-*`)

| ID | Conflict | Resolution |
|---|---|---|
| `AMB-P8-01` | `SECURITY_POLICY.md` L209 names `/outfits/*`; `API_CONTRACTS.md` L250 and `THREE_D_PIPELINE.md` L335 name `/outfit-scenes` | Canonical route is **`/outfit-scenes`**. Ownership scoping rule from SECURITY_POLICY applies unchanged. |
| `AMB-P8-02` | `THREE_D_PIPELINE.md` §5.3 payload `{ outfitId, rigId, slots: [...] }` vs `DATA_MODEL.md` `items` entries `{productId, variantId, assetId, slot, presetId}` | DB: `mannequin_rig_version = rigId`, `items = [{ slot, productId, variantId, assetId, presetId|null }]`. API DTO exposes `{ id, title, rigId, skeletonVersion, slots: [...] }`. Skeleton version comes from the rig constant. |
| `AMB-P8-03` | Showroom zones/hotspots required by FR-013 and `GET /showroom/scenes`, but absent from `DATA_MODEL.md` | Add `showroom_zones` + `showroom_hotspots` (§5). `data-engineer` amends `DATA_MODEL.md` Domain 3. |
| `AMB-P8-04` | No dedicated showroom/outfit permission codes in the 34-code catalog | Reuse `asset.read` (read) and `asset.publish` (all mutations). Grants: OWNER, MANAGER, PRODUCT mutate; CONTENT read-only. No new codes. |
| `AMB-P8-05` | Phase 08 priority shown as P2 in `PHASE_07_VERIFICATION_RECEIPT.md` L117 vs P1 in PRD/PRINCIPAL_DEVELOPMENT | **P1** (PRD and PRINCIPAL_DEVELOPMENT are authoritative). |
| `AMB-P8-06` | Seed posters are `poster.svg` (Phase 07) vs `poster.webp` spec | Inherited Phase 07 deviation; Phase 08 zone/rig posters follow the same `.svg` seed convention. Not reopened. |

---

## 4. Routes to Add

| App | Route | Rendering | Notes |
|---|---|---|---|
| storefront | `/showroom` | SSR shell + `<Suspense>` skeleton + client island (`ssr: false`) | Fallback product list rendered in SSR HTML first. Dark Showcase tokens (`#17191B` / `#35383A`). |
| storefront | `/outfit-studio` | SSR shell + client island (`ssr: false`) | Slot picker, compatibility messages and disclosure are DOM (outside Canvas). Draft state in URL search params (`?top=<variantId>:<presetId>&...`). |
| storefront | `/account/outfits` | Client account page (existing account-shell pattern) | 2D only. **0 B three.js.** |
| admin | `/experience/showroom` | Admin page, 3D zone preview behind `next/dynamic` `ssr: false` | Zone metadata, status transitions, hotspot CRUD. |
| admin | `/experience/outfit-studio` | Admin page | Garment compatibility table + editor, public preset CRUD, optional 3D preview behind `next/dynamic`. |

Nav: storefront primary nav adds `Showroom`; `Outfit Studio` linked from `/showroom` and footer; account nav adds `Saved Outfits`; admin nav adds `Showroom` and `Outfit Studio` gated by `asset.read`.

---

## 5. Data Model Deltas

### 5.1 New Migration `0002_phase08_showroom_outfits`

Workflow (Prisma 7, `prisma.config.ts` already present): edit `schema.prisma` -> `corepack pnpm --filter @arven/database exec prisma migrate dev --create-only --name phase08_showroom_outfits` -> append manual SQL CHECKs to the generated `migration.sql` -> `prisma migrate dev` against local PostgreSQL 18. **Never** `prisma db push`. Additive only; no column drops on existing tables.

**Enum**

```prisma
enum ShowroomZoneStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}
```

**`showroom_zones`**

| Column | Type | Null | Default / Constraint |
|---|---|---|---|
| `id` | `UUID` | NO | PK `gen_random_uuid()` |
| `code` | `VARCHAR(64)` | NO | `UNIQUE`, slug format CHECK |
| `title` | `VARCHAR(160)` | NO | |
| `description` | `TEXT` | YES | |
| `status` | `ShowroomZoneStatus` | NO | `'DRAFT'` |
| `sort_order` | `INTEGER` | NO | `0` |
| `scene_object_key` | `VARCHAR(512)` | NO | `UNIQUE`, `showroom/{code}/v{000N}/scene.glb` |
| `lite_scene_object_key` | `VARCHAR(512)` | YES | `showroom/{code}/v{000N}/scene-lite.glb` |
| `poster_key` | `VARCHAR(512)` | NO | |
| `scene_bytes` | `BIGINT` | NO | CHECK `> 0 AND <= 6291456` |
| `lite_scene_bytes` | `BIGINT` | YES | CHECK `NULL OR (> 0 AND <= 3670016)` |
| `camera_baseline` | `JSONB` | NO | `'{}'`, CHECK object |
| `portals` | `JSONB` | NO | `'[]'`, CHECK array; entries `{ targetZoneCode, label, position:[x,y,z] }` |
| `config` | `JSONB` | NO | `'{}'`; `lightingPreset`, `bakedLighting: true`, `triangleCount`, `liteTriangleCount`, `provenance` |
| `published_at` | `TIMESTAMPTZ(3)` | YES | CHECK required when `PUBLISHED` |
| `created_by` | `UUID` | YES | FK `users(id)` `ON DELETE SET NULL` |
| `created_at`, `updated_at` | `TIMESTAMPTZ(3)` | NO | `NOW()` |

Indexes: `(status, sort_order)`.

**`showroom_hotspots`**

| Column | Type | Null | Default / Constraint |
|---|---|---|---|
| `id` | `UUID` | NO | PK |
| `zone_id` | `UUID` | NO | FK `showroom_zones(id)` `ON DELETE CASCADE` |
| `product_id` | `UUID` | NO | FK `products(id)` `ON DELETE CASCADE` |
| `variant_id` | `UUID` | YES | FK `product_variants(id)` `ON DELETE SET NULL` |
| `label` | `VARCHAR(120)` | NO | |
| `position_x`, `position_y`, `position_z` | `DOUBLE PRECISION` | NO | CHECK `abs(x) <= 50`, `y >= 0 AND y <= 10`, `abs(z) <= 50` |
| `sort_order` | `INTEGER` | NO | `0`, CHECK `>= 0` |
| `is_active` | `BOOLEAN` | NO | `true` |
| `created_at`, `updated_at` | `TIMESTAMPTZ(3)` | NO | `NOW()` |

Indexes / uniques: `UNIQUE(zone_id, product_id)`, `(zone_id, is_active, sort_order)`.

**Manual SQL CHECKs (appended to generated migration)**

```sql
ALTER TABLE "showroom_zones"
  ADD CONSTRAINT chk_showroom_zone_code_format CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT chk_showroom_zone_sort_nonneg CHECK (sort_order >= 0),
  ADD CONSTRAINT chk_showroom_zone_scene_bytes CHECK (scene_bytes > 0 AND scene_bytes <= 6291456),
  ADD CONSTRAINT chk_showroom_zone_lite_bytes CHECK (lite_scene_bytes IS NULL OR (lite_scene_bytes > 0 AND lite_scene_bytes <= 3670016)),
  ADD CONSTRAINT chk_showroom_zone_camera_object CHECK (jsonb_typeof(camera_baseline) = 'object'),
  ADD CONSTRAINT chk_showroom_zone_portals_array CHECK (jsonb_typeof(portals) = 'array'),
  ADD CONSTRAINT chk_showroom_zone_published_at CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL);

ALTER TABLE "showroom_hotspots"
  ADD CONSTRAINT chk_showroom_hotspot_position CHECK (abs(position_x) <= 50 AND position_y >= 0 AND position_y <= 10 AND abs(position_z) <= 50),
  ADD CONSTRAINT chk_showroom_hotspot_sort_nonneg CHECK (sort_order >= 0);

ALTER TABLE "outfit_scenes"
  ADD CONSTRAINT chk_outfit_items_shape CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 5),
  ADD CONSTRAINT chk_outfit_owner_or_public CHECK (user_id IS NOT NULL OR is_public_preset = true),
  ADD CONSTRAINT chk_outfit_rig_format CHECK (mannequin_rig_version ~ '^arven_mannequin_[a-z0-9_]+$'),
  ADD CONSTRAINT chk_outfit_items_no_price CHECK (
    NOT jsonb_path_exists(items, '$[*].keyvalue() ? (@.key like_regex "price|amount|total|discount" flag "i")')
  );
```

> [!IMPORTANT]
> `chk_outfit_items_no_price` is defense-in-depth behind `.strict()` Zod schemas (Threat `T-03`). Integration tests must prove a raw SQL insert containing `unitPriceIdr` fails at the DB layer.

### 5.2 `Product3DAsset.config.outfitCompatibility` (no schema change)

Stored inside existing `config` JSONB, matching `THREE_D_PIPELINE.md` §3.6:

```json
{ "rigId": "arven_mannequin_unisex_v1", "skeletonVersion": "1.0.0", "slot": "top", "anchor": "spine_upper", "incompatibleSlots": [] }
```

Absent or `null` = garment not offered in Outfit Studio.

### 5.3 Rig Contract Constant (`packages/config/src/constants.ts`)

`OUTFIT_STUDIO_POLICY = { RIG_ID: 'arven_mannequin_unisex_v1', SKELETON_VERSION: '1.0.0', SLOTS: ['top','bottom','outerwear','footwear','accessory'], ANCHORS: { top: ['spine_upper'], outerwear: ['spine_upper'], bottom: ['pelvis'], footwear: ['feet'], accessory: ['shoulder_left','shoulder_right','wrist_left'] }, MAX_SAVED_OUTFITS_PER_USER: 50, TITLE_MAX: 160 }` and `SHOWROOM_POLICY = { MAX_ZONE_BYTES: 6291456, MAX_LITE_ZONE_BYTES: 3670016, MAX_RESIDENT_ZONES: 2 }`. Rig storage keys: `rigs/arven_mannequin_unisex_v1/v0001/{mannequin.glb, mannequin-lite.glb, poster.svg}`.

---

## 6. API Endpoints (`/api/v1`, new `experiences` module)

Error code for every compatibility failure: `422 INCOMPATIBLE_OUTFIT_SLOT` with `details.violations[] = { slot, productId, reason }`, `reason` in `RIG_MISMATCH | SKELETON_VERSION_MISMATCH | SLOT_MISMATCH | ANCHOR_INVALID | LAYER_CONFLICT | DUPLICATE_SLOT | GARMENT_UNAVAILABLE | VARIANT_PRODUCT_MISMATCH | PRESET_ASSET_MISMATCH`. Unknown keys (incl. any price field) -> `400 VALIDATION_ERROR`.

### 6.1 Public (`@Public()`)

| Method | Route | Notes |
|---|---|---|
| `GET` | `/showroom/scenes` | `PUBLISHED` zones ordered by `sort_order`: `code`, title, description, scene/lite/poster URLs, bytes, `cameraBaseline`, `portals`, active hotspots whose product is `PUBLISHED` + visible, each with live `fromPriceIdr`, slug, name, primary image. Draft/archived zones never returned. |
| `GET` | `/showroom/zones/:code/scene`, `/scene-lite`, `/poster` | `@SkipEnvelope()`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=31536000, immutable`; `404` for non-published zones. |
| `GET` | `/outfit-studio/catalog` | Rig contract (`rigId`, `skeletonVersion`, slots, anchors, mannequin URLs) + garments grouped by slot: only `PUBLISHED` products with active `READY` asset and valid `outfitCompatibility` matching the rig. Each includes variants with live `priceIdr` + availability flag, asset model/lite/poster URLs, active presets, `incompatibleSlots`. Also returns public presets (`is_public_preset = true`). |
| `GET` | `/outfit-studio/rigs/:rigId/model`, `/model-lite`, `/poster` | Binary, same headers as above; `404` for unknown rig. |
| `POST` | `/outfit-studio/validate` | Stateless compatibility check of `{ rigId, slots[] }` for guest drafts (throttled, CSRF). `200 { valid: true }` or `422`. |
| `POST` | `/outfit-studio/cart-items` | Guest/User cart. Body `{ rigId, slots: [{ slot, variantId, presetId? }] }`. Re-validates compatibility, reads authoritative variant price + availability in the transaction, adds each item via existing `CartService` (`configuration.outfitPresetId` only). Returns per-slot result `ADDED | OUT_OF_STOCK | INACTIVE`. Never accepts prices. |

### 6.2 Customer (`@CustomerAuth()`, ownership embedded in query: `where: { id, userId: actor.userId }`)

| Method | Route | Notes |
|---|---|---|
| `GET` | `/outfit-scenes` | Own scenes, `updated_at DESC`, hydrated with live price/availability per slot (`stale` flag if variant inactive or asset no longer compatible). |
| `GET` | `/outfit-scenes/:id` | `404` (not `403`) for another user's ID. |
| `POST` | `/outfit-scenes` | `{ title, rigId, slots[] }`. Server validates compatibility -> `422`; limit 50 per user -> `422 OUTFIT_LIMIT_REACHED`. Persists IDs only. |
| `PATCH` | `/outfit-scenes/:id` | Same validation on `slots` when provided. |
| `DELETE` | `/outfit-scenes/:id` | `204`. |

### 6.3 Admin (`@AdminAuth()` + `@RequirePermissions` + `@AuditAction` on mutations)

| Method | Route | Permission | Audit Action |
|---|---|---|---|
| `GET` | `/admin/showroom/zones`, `/admin/showroom/zones/:id` | `asset.read` | |
| `POST` | `/admin/showroom/zones` (deterministic server-generated zone GLB; no upload) | `asset.publish` | `showroom.zone.created` |
| `PATCH` | `/admin/showroom/zones/:id` | `asset.publish` | `showroom.zone.updated` |
| `POST` | `/admin/showroom/zones/:id/transition` (`DRAFT -> PUBLISHED -> ARCHIVED`, `ARCHIVED -> DRAFT`) | `asset.publish` | `showroom.zone.transitioned` |
| `POST` | `/admin/showroom/zones/:id/hotspots` | `asset.publish` | `showroom.hotspot.created` |
| `PATCH` / `DELETE` | `/admin/showroom/hotspots/:id` | `asset.publish` | `showroom.hotspot.updated` / `.deleted` |
| `GET` | `/admin/outfit-studio/garments` (all active READY assets + compatibility diagnostics) | `asset.read` | |
| `PUT` / `DELETE` | `/admin/3d-assets/:id/outfit-compatibility` | `asset.publish` | `asset.outfit_compatibility.updated` / `.removed` |
| `GET` | `/admin/outfit-studio/presets` | `asset.read` | |
| `POST` / `PATCH` / `DELETE` | `/admin/outfit-studio/presets`, `/admin/outfit-studio/presets/:id` (`user_id NULL`, `is_public_preset = true`) | `asset.publish` | `outfit.preset.created` / `.updated` / `.deleted` |

`check:auth-metadata` must report `0` violations (every route has exactly one of `Public` / `CustomerAuth` / `AdminAuth`).

---

## 7. Seed Spec (`packages/database/src/seed.ts`, idempotent upserts)

1. **Rig:** generate deterministic `mannequin.glb` (`<= 30,000` tris) and `mannequin-lite.glb` (`<= 12,000` tris) + `poster.svg` into `.local/storage/public/rigs/arven_mannequin_unisex_v1/v0001/` using a new `buildArvenMannequinGlbBuffer` from `@arven/three-engine/glb`. Named nodes for anchors: `spine_upper`, `pelvis`, `feet`, `shoulder_left`, `shoulder_right`, `wrist_left`. Rest on `Y = 0`, `1 unit = 1 m`.
2. **Garment compatibility** (update existing 6 active asset `config.outfitCompatibility`, rig `arven_mannequin_unisex_v1`, skeleton `1.0.0`):

| Product slug | Slot | Anchor | `incompatibleSlots` |
|---|---|---|---|
| `essentials-heavyweight-crew-tee` | `top` | `spine_upper` | `[]` |
| `atelier-oversized-poplin-shirt` | `top` | `spine_upper` | `["outerwear"]` (layer conflict: oversized volume clips through boxy overshirt) |
| `form-wide-leg-tailored-trouser` | `bottom` | `pelvis` | `[]` |
| `atelier-boxy-wool-overshirt` | `outerwear` | `spine_upper` | `[]` |
| `movement-minimalist-leather-sneaker` | `footwear` | `feet` | `[]` |
| `form-structured-calfskin-crossbody` | `accessory` | `shoulder_left` | `[]` |

3. **Deliberately incompatible garment:** new product `atelier-archive-field-jacket` (SKU `ARV-OUT-002`, category `outerwear`, collection `atelier`, `PUBLISHED`, 2 variants with inventory, `has3dEnabled: false`), active `READY` asset `v0001` with `outfitCompatibility.skeletonVersion = "0.9.0"`. Expected: excluded from `/outfit-studio/catalog`; `POST /outfit-scenes` and `/outfit-studio/validate` referencing it -> `422` reason `SKELETON_VERSION_MISMATCH`. Second rejection vector uses existing data: poplin shirt + overshirt -> `LAYER_CONFLICT`; crossbody in `top` slot -> `SLOT_MISMATCH`.
4. **Zones** (deterministic procedural gallery GLBs, baked vertex-color lighting, `.local/storage/public/showroom/{code}/v0001/{scene.glb, scene-lite.glb, poster.svg}`):

| Code | Title | Status | Sort | Portals |
|---|---|---|---|---|
| `atrium-entrance` | Atrium | `PUBLISHED` | 0 | `tailoring-gallery` |
| `tailoring-gallery` | Galeri Tailoring | `PUBLISHED` | 1 | `atrium-entrance`, `movement-annex` |
| `movement-annex` | Annex Movement | `PUBLISHED` | 2 | `tailoring-gallery` |
| `archive-vault` | Arsip | `DRAFT` | 3 | none (must never be public) |

5. **Hotspots:** atrium: tee, poplin shirt; tailoring: trouser, overshirt, field jacket; movement: sneaker, crossbody; archive-vault: 1 hotspot (tee). Total 8.
6. **Public presets** (`user_id NULL`, `is_public_preset true`): `Seragam Atelier` (tee + trouser + overshirt + sneaker), `Linen Harian` (poplin shirt + trouser + sneaker + crossbody). Both must pass server compatibility.
7. **Customer outfit:** one saved outfit for the existing seeded dev customer (only when dev users are seeded), items IDs only.
8. **Test updates:** existing seed count assertions (`6` READY assets -> `7`, product counts) updated in `packages/database/test/*`; new `packages/database/test/phase08-seed.test.ts`.

---

## 8. Stage 2/3 Task Breakdown & File Ownership (zero overlap)

Planning stage (already in the harness DAG, depends on this discovery task):

| Task | Role | Deliverable (owned path) |
|---|---|---|
| `23f6ac7a` | `governance-lead` | `docs/PHASE_08_GOVERNANCE.md` (permission mapping §6.3, T-03 / IDOR / T-06 risk profile) |
| `7d9134b4` | `architecture-lead` | `docs/PHASE_08_ARCHITECTURE.md` (experiences module layering, engine subpaths, bundle isolation) |
| `f6ff029a` | `design-lead` | `docs/PHASE_08_DESIGN_CONTRACT.md` (showroom/studio layouts, 13 profiles, states, copy) |

Implementation stage (parallel group `implementation`):

| Role (Task) | Owned Paths (exclusive locks) | Core Deliverables |
|---|---|---|
| `data-engineer` (`3d1b8508`) | `packages/database/**`, `packages/validators/**`, `packages/config/**`, `packages/contracts/src/index.ts`, `docs/DATA_MODEL.md` | Migration `0002_phase08_showroom_outfits` + manual CHECKs; Prisma models; `OUTFIT_STUDIO_POLICY` / `SHOWROOM_POLICY`; `.strict()` Zod schemas (`packages/validators/src/experiences.ts`: outfit slot, outfit scene create/update, validate, cart-items, admin zone/hotspot/compat/preset); DTOs; seed §7; `phase08-seed.test.ts`, validator tests; DATA_MODEL Domain 3 amendment. |
| `backend-developer` (`65455ca5`) | `apps/api/src/**`, `apps/api/test/integration/phase08-experiences.test.ts`, `apps/api/test/unit/phase08-outfit-compatibility.test.ts`, `packages/contracts/openapi/**`, `packages/contracts/src/generated/**`, `docs/API_CONTRACTS.md` | `apps/api/src/modules/experiences/**` (domain `OutfitCompatibilityPolicy` pure function, services, public/customer/admin controllers), `AppModule` registration, binary streaming, cart-items via `CartService`, OpenAPI sync (`corepack pnpm contracts:generate`), API_CONTRACTS §8.4 amendment. |
| `threejs-developer` (`e0f492df`) | `packages/three-engine/**`, `apps/storefront/next.config.ts`, `apps/admin/next.config.ts` | Subpath exports `./showroom` (`<ShowroomExperience>`: zone loader with max-2 residency, portal preload, baked lighting, frustum culling, hotspot meshes, `frameloop="demand"`, context-loss handling, diagnostics `window.__ARVEN_3D_DIAGNOSTICS__`) and `./outfit-studio` (`<OutfitStudioExperience>`: mannequin + rigid anchor attachment, per-slot `ResourceTracker` swap disposal, shared HDRI in `<group dispose={null}>` with refcount). `./glb` gains `buildArvenMannequinGlbBuffer`, `buildArvenShowroomZoneGlbBuffer`. Pure `evaluateOutfitCompatibility` helper mirrored in engine tests. Root `.` export unchanged. |
| `motion-developer` (`e816fc76`) | `apps/storefront/src/components/experience/showroom-3d-island.tsx`, `apps/storefront/src/components/experience/outfit-studio-3d-island.tsx`, `apps/storefront/test/phase08-experience-motion.test.tsx` | Module-level `next/dynamic` islands importing only `@arven/three-engine/showroom` / `/outfit-studio`; zone transition camera glides, instant snaps under `prefers-reduced-motion`, 44x44 zone-jump/directional controls, `touch-action: pan-y` + explicit interaction toggle, hotspot focus/announce via `aria-live`, WebGL fallback callbacks. |
| `frontend-developer` (`bb56a5b6`) | `apps/storefront/src/app/showroom/**`, `apps/storefront/src/app/outfit-studio/**`, `apps/storefront/src/app/account/outfits/**`, `apps/storefront/src/components/experience/showroom-view.tsx`, `apps/storefront/src/components/experience/showroom-fallback.tsx`, `apps/storefront/src/components/experience/hotspot-quick-card.tsx`, `apps/storefront/src/components/experience/outfit-studio-view.tsx`, `apps/storefront/src/components/experience/outfit-slot-picker.tsx`, `apps/storefront/src/components/experience/saved-outfits-panel.tsx`, `apps/storefront/src/components/experience/outfit-studio-fallback.tsx`, `apps/storefront/src/components/account/saved-outfits-view.tsx`, `apps/storefront/src/components/storefront-shell.tsx`, `apps/storefront/src/components/account-shell.tsx`, `apps/storefront/src/lib/api-client.ts`, `apps/storefront/src/lib/outfit-helpers.ts`, `apps/storefront/test/phase08-experience.test.tsx`, `apps/storefront/test/phase06-editorial-returns.test.ts`, `apps/admin/src/app/experience/**`, `apps/admin/src/components/experience/**`, `apps/admin/src/lib/api-client.ts`, `apps/admin/src/lib/ops-helpers.ts`, `apps/admin/src/lib/permissions.ts`, `apps/admin/test/phase08-admin-experience.test.tsx` | SSR shells + fallbacks, quick-cards, slot picker with inline compatibility explanation (e.g. "Kemeja oversized ini tidak kompatibel dengan outerwear yang sedang aktif"), disclosure note, guest save prompt, saved-outfits panel and account page with live prices, add-to-bag results, nav links (relax the phase06 no-link guard for the two shells only), admin zone/hotspot and compatibility/preset UIs with RBAC action gating. |
| `security-engineer` (`6fde4184`) | `apps/api/test/security/phase08-experience-security.test.ts`, `apps/storefront/src/proxy.ts`, `apps/admin/src/proxy.ts`, `apps/storefront/test/proxy.test.ts`, `apps/admin/test/proxy.test.ts` | T-03 tamper suite (price keys -> `400`, DB CHECK rejects raw price insert), IDOR on `/outfit-scenes/:id` (`404`), guest `POST /outfit-scenes` -> `401`, CSRF/Origin on all mutations, 7-role RBAC matrix on admin experience routes, draft zone/binary not exposed, path traversal on `:code` / `:rigId`, CSP unchanged-or-tightened (keep `'wasm-unsafe-eval'`, no `'unsafe-eval'`). |

> [!NOTE]
> Overlap check: `apps/storefront/src/components/experience/` is split by **exact filenames** between `frontend-developer` and `motion-developer`; no glob covers the directory. `packages/contracts` is split as in Phase 07 (`src/index.ts` data vs `openapi/**` + `src/generated/**` backend). `apps/api/test/security/**` is owned only via the single new security file. `pnpm-lock.yaml` and root `package.json` are unowned: no dependency additions are expected; any need must be escalated to the coordinator first.

Interface handoffs: data-engineer publishes validators/DTOs/constants first; threejs-developer publishes subpath APIs (props contract documented in `PHASE_08_ARCHITECTURE.md`); backend consumes validators; frontend/motion consume DTOs and engine props.

---

## 9. Acceptance Criteria Mapped to the Phase 08 Gate

| # | Gate Criterion (PRINCIPAL_DEVELOPMENT §2 Phase 08) | Verification | Checkpoint |
|---|---|---|---|
| AC-01 | Rig/slot incompatibility rejection | Integration: `422 INCOMPATIBLE_OUTFIT_SLOT` for field jacket (`SKELETON_VERSION_MISMATCH`), poplin shirt + overshirt (`LAYER_CONFLICT`, both orders), crossbody in `top` (`SLOT_MISMATCH`), duplicate slot, wrong rig; field jacket absent from catalog; UI shows inline explanation and blocks selection | `security`, `interaction` |
| AC-02 | Saved outfits omit authoritative prices | Zod strict rejects price keys (`400`); DB `chk_outfit_items_no_price` rejects raw insert; persisted `items` contain only `slot, productId, variantId, assetId, presetId`; changing a variant price in DB is reflected on next `GET /outfit-scenes` and in cart via `/outfit-studio/cart-items` | `security` |
| AC-03 | Mobile WebGL FPS & memory budget | `lite` tier on 390x844 emulation with 4x CPU throttle: median interaction FPS `>= 30` (desktop `>= 50`); idle rAF `0` in 700 ms; DPR cap `[1, 1.5]` mobile; resident zones `<= 2`; active zone payload `<= 6 MB` default / `<= 3.5 MB` lite; `gl.info.memory.geometries/textures` return to baseline after 10 zone switches and 10 garment swaps; JS heap growth `<= 10%` after cycles | `performance`, `3d-rendering` |
| AC-04 | `3d-rendering` QA PASS | Zones render grounded with baked lighting, hotspots placed, mannequin + garments anchored, zero console/WebGL errors, context-loss recovery and 2D degrade, disposal on unmount | `3d-rendering` |
| AC-05 | `responsive` QA PASS | `/showroom`, `/outfit-studio`, `/account/outfits`, admin experience pages across 13 profiles (320 to 1920) + 200% zoom; 44x44 targets; no horizontal overflow; vertical scroll never hijacked on mobile | `responsive`, `layout` |
| AC-06 | 0 B three.js on non-3D routes | Build manifest scan: `three` / `@react-three/*` chunks referenced only by `products/[slug]`, `showroom`, `outfit-studio` (storefront) and `catalog/products/[id]`, `experience/*` (admin). `/`, `/shop`, `/collections`, `/cart`, `/checkout`, `/lookbook`, `/journal`, `/about`, `/account/*` (incl. `/account/outfits`) = 0 B. PDP chunk contains no showroom/outfit symbols. | `performance` |
| AC-07 | WebGL-off fallback | `--disable-webgl`: `/showroom` shows zone posters + product list with working PDP links; `/outfit-studio` shows 2D slot picker with posters, validation, save and add-to-bag still functional; zero uncaught exceptions | `interaction`, `3d-rendering` |
| AC-08 | Accessibility | axe `0` violations; slot picker radiogroups with Arrow/Home/End; hotspot quick-card focus management; canvas does not trap Tab; reduced motion disables glides/beacons | `accessibility`, `motion` |
| AC-09 | Design discipline | Semantic `--arven-*` tokens, no `#8B897F` text on light, zero pink, zero em dashes in UI copy, 8 interactive states, disclosure text present, no fit/size claims | `typography-color` |
| AC-10 | Scope & regression | All prior suites green (`corepack pnpm turbo lint typecheck test build`), `check:auth-metadata` 0 violations, no Phase 09 artifacts, migration applies cleanly on live PostgreSQL 18 | `final-regression` |

---

## 10. Risks & BLOCKED Conditions

| Risk | Impact | Mitigation / Rule |
|---|---|---|
| PostgreSQL 18 (`5432`) or Memurai (`6379`) not running | Migration, seed and integration suites cannot run | Report **`BLOCKED`** honestly (`AMB-08`). Never substitute mocks for DB/Redis integration passes. Both ports were open at discovery. |
| `pnpm` not on PATH | Commands fail | Use `corepack pnpm ...` (verified `10.34.9`). |
| Showroom code leaks into PDP or catalog bundles | Violates 0 B rule, regresses PDP perf | Separate subpath exports; manifest scan in AC-06. |
| Headless Chromium lacks GPU, FPS numbers unrepresentative | AC-03 evidence weak | Use SwiftShader/ANGLE consistently, record environment in report; treat memory-baseline checks as hard gate, FPS with documented method. |
| Seed product addition breaks prior count assertions | Regression failures | data-engineer updates assertions in owned `packages/database/test/*`; QA verifies prior tests unchanged elsewhere. |
| Prisma 7 CHECK constraints dropped by future `migrate dev` diffs | Silent loss of guards | Keep CHECKs only in migration SQL; integration test asserts constraints exist via `pg_constraint`. |
| `jsonb_path_exists` regex CHECK too broad (blocks a legit key containing "total") | Valid saves rejected | Items schema has a fixed key set (`slot, productId, variantId, assetId, presetId`); none match. |
| Scope pressure toward fit simulation | Blueprint risk register "Tinggi/tinggi" | Non-goals §1.2; disclosure note mandatory; reviewers reject skinning/physics code. |
| Hotspot quick-card shows stale price | T-03 adjacent | Price always from `GET /showroom/scenes` live query; never cached in zone config. |
| Repair loop exceeds `maxRepairIterations = 5` | Phase cannot close | Escalate to human per `PRINCIPAL_DEVELOPMENT.md`. |

---

## 11. Verification & Quality Checkpoints (`902c7aba-7aeb-406d-9ebb-2edefdc9108f`)

All 10 checkpoints (`responsive`, `layout`, `interaction`, `typography-color`, `motion`, `3d-rendering`, `accessibility`, `performance`, `security`, `final-regression`) must reach `pass` with independent QA evidence under `docs/qa/phase-08/` before `release-lead` writes `docs/PHASE_08_VERIFICATION_RECEIPT.md`. Phase 09 must not start until `harness.evaluate_quality_gate` passes.
