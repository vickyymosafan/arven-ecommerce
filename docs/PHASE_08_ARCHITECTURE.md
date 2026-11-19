# ARVEN Phase 08 Architecture & Cross-Team Interface Contracts

> **Phase:** Phase 08 — Virtual Showroom (`FR-013`) & Outfit Studio (`FR-014`), Priority `P1`  
> **Harness Plan ID:** `902c7aba-7aeb-406d-9ebb-2edefdc9108f`  
> **Task ID:** `7d9134b4-fd71-4e58-9a20-a3c790b4c629` (`architecture-lead`)  
> **Baseline Documents:** [`AGENTS.md`](../AGENTS.md), [`docs/PHASE_08_PLAN.md`](./PHASE_08_PLAN.md), [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md), [`docs/DATA_MODEL.md`](./DATA_MODEL.md), [`docs/API_CONTRACTS.md`](./API_CONTRACTS.md), [`docs/THREE_D_PIPELINE.md`](./THREE_D_PIPELINE.md), [`docs/PHASE_07_ARCHITECTURE.md`](./PHASE_07_ARCHITECTURE.md)

---

## 1. Architectural Overview & Dependency Direction

Phase 08 introduces two progressive 3D commerce experiences (`/showroom` and `/outfit-studio`), customer outfit persistence (`/account/outfits` backed by `/api/v1/outfit-scenes`), and admin management (`/experience/showroom`, `/experience/outfit-studio`) while preserving ARVEN's strict commerce-first, zero-3D-leakage, and server-authoritative pricing invariants.

```text
packages/config (OUTFIT_STUDIO_POLICY, SHOWROOM_POLICY)
        │
        ▼
packages/validators (packages/validators/src/experiences.ts — Zod v4 .strict())
        ├──► packages/contracts (DTO interfaces + generated OpenAPI 3.0)
        ├──► packages/database (Prisma 7 schema + 0002_phase08_showroom_outfits + seed)
        ├──► packages/three-engine
        │         ├── .              (UNCHANGED — Phase 07 PDP only)
        │         ├── ./glb          (+ buildArvenMannequinGlbBuffer, buildArvenShowroomZoneGlbBuffer)
        │         ├── ./showroom     (ShowroomExperience — client-only R3F 9)
        │         └── ./outfit-studio(OutfitStudioExperience + evaluateOutfitCompatibility)
        └──► apps/api (apps/api/src/modules/experiences/ — 4-layer Clean Architecture)
                  └──► injects CartService (CartModule), StorageProvider, PrismaService, AuditLogService

apps/storefront
  ├── /showroom          ──► showroom-3d-island.tsx ──► next/dynamic ssr:false ──► @arven/three-engine/showroom
  ├── /outfit-studio     ──► outfit-studio-3d-island.tsx ──► next/dynamic ssr:false ──► @arven/three-engine/outfit-studio
  ├── /account/outfits   ──► 0 B three.js (2D posters + live IDR pricing only)
  └── /, /shop, /cart, /checkout, /lookbook, /journal, /about ──► 0 B three.js (unchanged)

apps/admin
  ├── /experience/showroom       ──► metadata/status/hotspots + optional next/dynamic ssr:false preview
  └── /experience/outfit-studio  ──► compatibility + public presets + optional next/dynamic ssr:false preview
```

### Non-Negotiable Boundary Invariants
1. **No New RBAC Codes or Queues (`AMB-P8-04`):** Reuse existing `asset.read` (read) and `asset.publish` (mutations) from the 36-code `PERMISSION_CODES` registry in [`packages/config/src/constants.ts`](../packages/config/src/constants.ts). No BullMQ queues are added (`8` queues unchanged); zone/mannequin GLBs are generated deterministically server-side via `@arven/three-engine/glb`.
2. **No Upload Surface for Showroom/Rigs:** Arbitrary GLB uploads for showroom zones or mannequin rigs are out of scope. Phase 07's `Product3DAsset` upload/validation pipeline remains unchanged.
3. **Zero Price Persistence:** `outfit_scenes.items` stores only `{ slot, productId, variantId, assetId, presetId }`. Prices, discounts, and stock are always resolved live from `product_variants` and `inventory_levels` on read and during `POST /api/v1/outfit-studio/cart-items`.
4. **ESM `NodeNext` Compliance:** All files under `apps/api/src/modules/experiences/**` and `packages/**` use explicit `.js` relative imports and zero CommonJS `__dirname` / `require()`.

---

## 2. Clean Architecture 4-Layer Design (`apps/api/src/modules/experiences/`)

Following the 4-layer layout established in [`apps/api/src/modules/orders/`](../apps/api/src/modules/orders/) and [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) §3.2:

```text
apps/api/src/modules/experiences/
├── domain/
│   ├── entities/
│   │   └── showroom-zone.entity.ts         # Zone status transition rules (DRAFT -> PUBLISHED -> ARCHIVED -> DRAFT)
│   ├── errors/
│   │   └── experiences-domain.error.ts     # ExperiencesDomainError, IncompatibleOutfitSlotError
│   ├── policies/
│   │   └── outfit-compatibility.policy.ts  # Pure evaluateOutfitCompatibility() + violation builder
│   ├── value-objects/
│   │   └── storage-keys.ts                 # Deterministic showroom & rig object keys + slug/rig guards
│   └── ports/
│       └── experiences.ports.ts            # Repository interfaces & Symbol DI tokens
├── application/
│   └── services/
│       ├── showroom.service.ts             # Zone CRUD + deterministic GLB build, transitions, hotspots, live price hydration
│       └── outfit-studio.service.ts        # Rig/garment catalog, stateless validate, CartService batch add, scenes/presets CRUD
├── infrastructure/
│   ├── mappers/
│   │   └── experiences.mapper.ts           # Prisma rows -> Public / Customer / Admin DTOs (zero price fields in items JSON)
│   └── repositories/
│       ├── prisma-showroom.repository.ts   # Implements ShowroomRepositoryPort via PrismaService
│       └── prisma-outfit-studio.repository.ts # Implements OutfitStudioRepositoryPort via PrismaService
├── presentation/
│   ├── showroom.controller.ts              # @Public() GET /showroom/scenes, /showroom/zones/:code/{scene,scene-lite,poster}
│   ├── outfit-studio.controller.ts         # @Public() catalog, rig binaries, throttled/CSRF validate & cart-items
│   ├── outfit-scenes.controller.ts         # @CustomerAuth() CRUD /outfit-scenes, /outfit-scenes/:id
│   └── admin-experiences.controller.ts     # @AdminAuth() + @RequirePermissions + @AuditAction
├── experiences.module.ts                   # Imports CartModule; binds ports; exports ShowroomService, OutfitStudioService
└── index.ts
```

### 2.1 Domain Layer Contracts (Zero NestJS / Prisma Imports)

#### A. Pure Compatibility Policy (`domain/policies/outfit-compatibility.policy.ts`)
Evaluates a requested `{ rigId, slots: [{ slot, productId?, variantId, presetId? }] }` against resolved catalog candidate descriptors (`OutfitCandidateDescriptor[]`):

1. **Rig Check:** `rigId === OUTFIT_STUDIO_POLICY.RIG_ID` (`'arven_mannequin_unisex_v1'`). Failure -> `RIG_MISMATCH`.
2. **Slot Cardinality & Duplicate Check:** `1 <= slots.length <= 5`, each `slot` in `OUTFIT_STUDIO_POLICY.SLOTS` (`top | bottom | outerwear | footwear | accessory`), no duplicate `slot` values. Duplicate -> `DUPLICATE_SLOT`.
3. **Per-Item Availability & Binding Checks:**
   - Candidate product exists, `status === 'PUBLISHED'`, `isVisible === true`, `deletedAt === null`, and has active `READY` `Product3DAsset` -> else `GARMENT_UNAVAILABLE`.
   - Selected variant exists, `isActive === true`, `deletedAt === null`, and `variant.productId === product.id` -> else `GARMENT_UNAVAILABLE` or `VARIANT_PRODUCT_MISMATCH`.
   - If `presetId` is supplied: preset exists, `preset.isActive === true`, `preset.assetId === asset.id`, and `preset.productId === product.id` -> else `PRESET_ASSET_MISMATCH`. *(Note: per Phase 07 seed convention, a `CustomizationPreset.variantId` points to one representative size variant of that colorway, so matching `assetId` + `productId` + `isActive` allows selecting any size variant of the same product without false rejection.)*
4. **Asset Compatibility Declaration Checks:**
   - `asset.config.outfitCompatibility` is non-null object; `compat.rigId === rigId` -> else `RIG_MISMATCH`.
   - `compat.skeletonVersion === OUTFIT_STUDIO_POLICY.SKELETON_VERSION` (`'1.0.0'`) -> else `SKELETON_VERSION_MISMATCH`.
   - `compat.slot === requestedSlot` -> else `SLOT_MISMATCH`.
   - `OUTFIT_STUDIO_POLICY.ANCHORS[compat.slot].includes(compat.anchor)` -> else `ANCHOR_INVALID`.
5. **Symmetric `incompatibleSlots` Matrix Check:**
   - For every unordered pair of active slots `(itemA, itemB)` in the outfit:
     - If `itemA.incompatibleSlots.includes(itemB.slot)` **OR** `itemB.incompatibleSlots.includes(itemA.slot)`, emit `LAYER_CONFLICT` on the conflicting slot(s).
     - Symmetry guarantee: declaring `incompatibleSlots: ['outerwear']` on a `top` garment (e.g. `atelier-oversized-poplin-shirt`) rejects `(top + outerwear)` regardless of whether `top` or `outerwear` was added first or appears first in `slots[]`.

#### B. Deterministic Storage Keys (`domain/value-objects/storage-keys.ts`)
- **Showroom zone keys** (strictly derived server-side from validated `code` matching `^[a-z0-9]+(-[a-z0-9]+)*$` and integer `version >= 1`):
  - `showroom/${code}/v${pad4(version)}/scene.glb`
  - `showroom/${code}/v${pad4(version)}/scene-lite.glb`
  - `showroom/${code}/v${pad4(version)}/poster.svg`
- **Mannequin rig keys** (pinned contract):
  - `rigs/arven_mannequin_unisex_v1/v0001/mannequin.glb`
  - `rigs/arven_mannequin_unisex_v1/v0001/mannequin-lite.glb`
  - `rigs/arven_mannequin_unisex_v1/v0001/poster.svg`
- Client filenames or arbitrary paths are never accepted; path traversal attempts fail parameter Zod validation (`400 VALIDATION_ERROR`) before reaching storage.

#### C. Zone State Machine (`domain/entities/showroom-zone.entity.ts`)
Allowed transitions only:
- `DRAFT -> PUBLISHED` (requires `sceneBytes > 0 && sceneBytes <= 6_291_456`, valid `posterKey`, sets `publishedAt = nowUtc`)
- `PUBLISHED -> ARCHIVED`
- `ARCHIVED -> DRAFT`

Any other transition (e.g., `DRAFT -> ARCHIVED`, `PUBLISHED -> DRAFT`, or self-transition) throws `ExperiencesDomainError(409, 'INVALID_STATE_TRANSITION', ...)`.

#### D. Domain Errors & `GlobalExceptionFilter` Compatibility (`domain/errors/experiences-domain.error.ts`)
[`GlobalExceptionFilter`](../apps/api/src/common/http/global-exception.filter.ts) normalizes `DomainHttpException.details` strictly to `Array<{ field: string; issue: string }>` per [`docs/API_CONTRACTS.md`](./API_CONTRACTS.md) §2.3. To preserve complete machine-readable violation metadata (`slot`, `productId`, `reason`) without modifying shared `common/http/*`:
- `IncompatibleOutfitSlotError` (`422 INCOMPATIBLE_OUTFIT_SLOT`) maps each `OutfitCompatibilityViolation` (`{ slot, productId, reason, message }`) to `ApiErrorDetail`:
  - `field`: `slots.${v.slot}` (or `'rigId'` for top-level rig mismatch)
  - `issue`: `${v.reason}|productId=${v.productId ?? 'none'}|${v.message}`
- Frontend/clients can parse the leading `REASON` token cleanly while `GlobalExceptionFilter` emits a valid ARVEN standard error envelope.

### 2.2 Application Services (`application/services/`)

1. **`ShowroomService`:**
   - `listPublishedScenes()`: Queries `PUBLISHED` zones ordered by `sortOrder ASC, createdAt ASC`, filters hotspots to `isActive === true` and `product.status === PUBLISHED && product.isVisible && product.deletedAt === null`, and hydrates each hotspot with live `fromPriceIdr = MIN(activeVariant.priceIdr)`, `productSlug`, `productName`, `primaryImageUrl`, `has3dEnabled`.
   - `readPublishedZoneBinary(code, kind: 'default' | 'lite' | 'poster')`: Enforces `status === PUBLISHED` (non-published `DRAFT`/`ARCHIVED` zones return `404 RESOURCE_NOT_FOUND`), reads from `STORAGE_PROVIDER` (`scope: 'public'`).
   - Admin mutations (`createZone`, `updateZone`, `transitionZone`, `createHotspot`, `updateHotspot`, `deleteHotspot`):
     - `createZone` invokes `buildArvenShowroomZoneGlbBuffer` (`default` and `lite`) + `buildStudioPosterSvg` from `@arven/three-engine/glb`, verifies `bytes <= SHOWROOM_POLICY.MAX_ZONE_BYTES` (`6_291_456`) and `liteBytes <= SHOWROOM_POLICY.MAX_LITE_ZONE_BYTES` (`3_670_016`), writes binaries via `STORAGE_PROVIDER.putBuffer({ scope: 'public', ... })`, and persists `showroom_zones` + `AuditLogService.record(..., tx)`.
     - Hotspot create/update verifies target `product` exists (non-deleted) and optional `variantId` belongs to `productId`.

2. **`OutfitStudioService`:**
   - `getCatalog()`: Returns pinned rig contract (`OUTFIT_STUDIO_POLICY`), compatible garments (strictly `PUBLISHED`, `isVisible`, non-deleted products with active `READY` asset whose `config.outfitCompatibility` satisfies `rigId === 'arven_mannequin_unisex_v1'`, `skeletonVersion === '1.0.0'`, valid slot & anchor), live variant prices & aggregate active-warehouse stock, active customization presets, and hydrated `publicPresets` (`outfit_scenes.isPublicPreset = true`). Deliberately incompatible assets (e.g., seeded `skeletonVersion = '0.9.0'`) are excluded automatically.
   - `readRigBinary(rigId, kind: 'default' | 'lite' | 'poster')`: Validates `rigId === OUTFIT_STUDIO_POLICY.RIG_ID` (else `404`), reads from `STORAGE_PROVIDER` (`scope: 'public'`).
   - `validateOutfitStateless(input)`: Loads candidate products/variants/assets/presets, runs `evaluateOutfitCompatibility()`, returns `{ valid: true, rigId, skeletonVersion, slotCount }` on success or throws `IncompatibleOutfitSlotError` (`422`).
   - `addOutfitToCart(req, res, input)`:
     - Resolves candidate descriptors and runs `evaluateOutfitCompatibility()` — throws `422 INCOMPATIBLE_OUTFIT_SLOT` if any slot/rig/layer rule fails.
     - Delegates transactional cart mutation to **`CartService.addOutfitItemsBatch(req, res, preparedItems)`** (`apps/api/src/modules/cart/cart.service.ts` exported by `CartModule`).
     - Inside that single transaction, `CartService` resolves or creates the customer/guest active cart (minting `arven_guest_cart` cookie once if anonymous), checks each variant's live product publish status, `variant.isActive`, aggregate active-warehouse `availableQty`, and `CART_POLICY.MAX_LINE_QUANTITY`, inserts/increments `cart_items` with `configuration: presetId ? { outfitPresetId: presetId } : {}`, and returns `{ cart, results: [{ slot, variantId, productId, status: 'ADDED' | 'OUT_OF_STOCK' | 'INACTIVE', reason }] }`.
     - **Module isolation preserved:** `ExperiencesModule` never queries `carts` or `cart_items` tables directly.
   - Customer `outfit_scenes` (`listCustomerOutfits`, `getCustomerOutfit`, `createCustomerOutfit`, `updateCustomerOutfit`, `deleteCustomerOutfit`):
     - All queries embed ownership directly in `where: { id, userId: actor.userId, isPublicPreset: false }`. Cross-user access returns `404 RESOURCE_NOT_FOUND` (not `403`, preventing ID enumeration).
     - `createCustomerOutfit` enforces `count(userId, isPublicPreset=false) < 50` (else `422 OUTFIT_LIMIT_REACHED`), validates compatibility (`422`), and writes only `[{ slot, productId, variantId, assetId, presetId }]`.
     - Read hydration resolves live `priceIdr`, `availableQty`, `inStock`, `stale: boolean`, and `staleReasons[]` per slot, plus `liveTotalIdr` across non-stale slots.
   - Admin compatibility & public presets (`listAdminGarments`, `setAssetOutfitCompatibility`, `removeAssetOutfitCompatibility`, `listAdminPublicPresets`, `createAdminPublicPreset`, `updateAdminPublicPreset`, `deleteAdminPublicPreset`):
     - `setAssetOutfitCompatibility` merges/updates `config.outfitCompatibility` on `Product3DAsset` inside `withTransaction` + `AuditLogService.record`.
     - Public preset mutations validate compatibility (`422`) and persist `userId: null, isPublicPreset: true`.

### 2.3 Controller & Security Surface Summary

| Controller | Route Prefix | Auth / Guard | CSRF / Throttle | Audit |
|---|---|---|---|---|
| `ShowroomController` | `showroom/*` | `@Public()` | GETs (`@SkipEnvelope()` on GLB/SVG binaries) | — |
| `OutfitStudioController` | `outfit-studio/*` | `@Public()` | `@SkipEnvelope()` on rig binaries; `POST validate` & `POST cart-items` are CSRF-enforced & throttled | — |
| `OutfitScenesController` | `outfit-scenes*` | `@CustomerAuth()` | CSRF-enforced on `POST/PATCH/DELETE` | Optional / DB ownership |
| `AdminExperiencesController` | `admin/showroom/*`, `admin/outfit-studio/*`, `admin/3d-assets/:id/outfit-compatibility` | `@AdminAuth()` + `@RequirePermissions('asset.read' \| 'asset.publish')` | Admin session + MFA + CSRF | `@AuditAction(...)` + `markAuditRecordedInTransaction(req)` |

> **Check gate:** Every route must satisfy `check:auth-metadata` (`0` violations: exactly one of `@Public`, `@CustomerAuth`, or `@AdminAuth`).

---

## 3. `@arven/three-engine` Subpath Architecture & Bundle Isolation

### 3.1 Package Exports (`packages/three-engine/package.json`)

- **`.` (`src/index.ts`):** **Strictly untouched.** Phase 07 PDP (`/products/[slug]`) continues importing `{ ProductExperience, ... }` from `@arven/three-engine` with zero added bytes or symbols.
- **`./glb` (`src/glb-binary.ts`):** Extended with deterministic Node-safe binary builders (zero DOM/WebGL imports so `packages/database` seed and `apps/api` can call them safely):
  - `buildArvenMannequinGlbBuffer(options?: { profile?: 'default' | 'lite' }): Buffer`
    - Generates unisex mannequin resting cleanly on `Y = 0` (`1 unit = 1 m`, `+Y` up, `+Z` forward).
    - Emits named anchor nodes matching `OUTFIT_STUDIO_POLICY.ANCHORS`: `spine_upper`, `pelvis`, `feet`, `shoulder_left`, `shoulder_right`, `wrist_left`.
    - Triangle caps: `<= 30,000` (`default`), `<= 12,000` (`lite`).
  - `buildArvenShowroomZoneGlbBuffer(options: ShowroomZoneGlbBuildOptions): Buffer`
    - Generates architectural gallery geometry (floor plinths, gallery walls, product pedestals, portal arch frames) with **baked `COLOR_0` vertex colors** (zero dynamic shadow-casting lights needed at runtime).
    - Byte caps: `<= 6,291,456` bytes (`default`), `<= 3,670,016` bytes (`lite`).
- **`./showroom` (`src/showroom.ts`):** Exports `ShowroomExperience` (`'use client'`), `ShowroomExperienceProps`, `ShowroomCameraControlHandle`, `ShowroomDiagnosticsSnapshot`.
- **`./outfit-studio` (`src/outfit-studio.ts`):** Exports `OutfitStudioExperience` (`'use client'`), `OutfitStudioExperienceProps`, `OutfitSlotRenderItem`, `OutfitStudioDiagnosticsSnapshot`, and pure `evaluateOutfitCompatibility` (`src/outfit-compatibility.ts`).

### 3.2 `./showroom` Component & Residency Contract

```typescript
export interface ShowroomCameraControlHandle {
  rotateBy: (deltaAzimuthRad: number, deltaPolarRad?: number) => void;
  moveForward: (stepMeters: number) => void;
  focusHotspot: (hotspotId: string) => void;
  resetView: () => void;
}

export interface ShowroomExperienceProps {
  readonly zones: ReadonlyArray<ShowroomZonePublicDto>;
  readonly activeZoneCode: string;
  readonly selectedHotspotId?: string | null;
  readonly tierOverride?: DeviceQualityTier;
  readonly reducedMotion?: boolean;
  readonly interactionEnabled?: boolean;
  readonly dracoDecoderPath?: string;   // default '/decoders/draco/'
  readonly ktx2TranscoderPath?: string; // default '/decoders/basis/'
  readonly onHotspotSelect?: (hotspot: ShowroomHotspotPublicDto) => void;
  readonly onZoneRequest?: (targetZoneCode: string) => void;
  readonly onWebGLFallback?: (reason: string) => void;
  readonly onControlsReady?: (handle: ShowroomCameraControlHandle | null) => void;
}
```

**Runtime & GPU Guarantees:**
1. **Max-2-Zone Residency (`SHOWROOM_POLICY.MAX_RESIDENT_ZONES = 2`):** Maintains a bounded map of loaded zone graphs `{ scene: THREE.Group, tracker: ResourceTracker }`. At any moment, only `activeZoneCode` and its immediate primary portal target (`activeZone.portals[0]?.targetZoneCode`, or last hovered portal target) may remain resident. Evicted zones are immediately detached and disposed via `tracker.disposeAll()`.
2. **Render & Budget:** `<Canvas frameloop="demand" dpr={tier === 'lite' ? [1, 1.5] : [1, 2]}>`, `frustumCulled = true` on all meshes, baked vertex-color lighting + unshadowed ambient/hemisphere fill only (no dynamic shadow maps), self-hosted `/decoders/draco/` & `/decoders/basis/` with `KTX2Loader.detectSupport(gl)`.
3. **Resilience:** `webglcontextlost` calls `event.preventDefault()`, pauses interactions, sets 3000ms recovery timer; 2nd context loss or timeout triggers `onWebGLFallback`. ErrorBoundary wraps `<Canvas>`.
4. **Diagnostics:** Updates `window.__ARVEN_3D_DIAGNOSTICS__` with `{ experience: 'showroom', activeZoneCode, residentZoneCodes, activeTier, frameloop: 'demand', geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, disposedResources, loadState, contextLostCount, reducedMotion, updatedAt }`.

### 3.3 `./outfit-studio` Component, Shared HDRI & Per-Slot Disposal Contract

```typescript
export interface OutfitSlotRenderItem {
  readonly slot: OutfitSlot;
  readonly productId: string;
  readonly variantId: string;
  readonly assetId: string;
  readonly modelUrl: string;
  readonly mobileModelUrl: string | null;
  readonly anchor: OutfitAnchor;
  readonly materialSlots: ReadonlyArray<MaterialSlotSpecDto>;
  readonly presetId: string | null;
  readonly materialOverrides: Readonly<Record<string, MaterialOverrideEntryInput>> | null;
}

export interface OutfitStudioExperienceProps {
  readonly rigId: string;
  readonly rigModelUrl: string;
  readonly rigMobileModelUrl: string | null;
  readonly rigPosterUrl: string;
  readonly slots: Partial<Record<OutfitSlot, OutfitSlotRenderItem>>;
  readonly tierOverride?: DeviceQualityTier;
  readonly reducedMotion?: boolean;
  readonly interactionEnabled?: boolean;
  readonly dracoDecoderPath?: string;   // default '/decoders/draco/'
  readonly ktx2TranscoderPath?: string; // default '/decoders/basis/'
  readonly onSlotLoaded?: (slot: OutfitSlot, assetId: string) => void;
  readonly onSlotError?: (slot: OutfitSlot, reason: string) => void;
  readonly onWebGLFallback?: (reason: string) => void;
}
```

**Runtime & GPU Guarantees:**
1. **Shared Studio Environment (`<group dispose={null}>` + Refcount):** A neutral studio environment/PMREM texture (or calibrated light rig) resides in `<group dispose={null}>` backed by a module-level refcount map keyed by studio environment ID (`acquireSharedStudioEnv()` on mount, `releaseSharedStudioEnv()` on unmount; disposes PMREM/texture only when refcount reaches `0`). Swapping garments never tears down or reallocates the shared studio environment.
2. **Per-Slot `ResourceTracker` Isolation:** Each of the 5 slots owns an independent `ResourceTracker`. On garment change or slot removal, ONLY that slot's previous `THREE.Object3D` is detached from its named rig anchor (`rigScene.getObjectByName(item.anchor)`) and its `ResourceTracker.disposeAll()` runs immediately.
3. **Material Preset Swaps Without Re-Fetch:** When `item.assetId` stays identical and only `item.materialOverrides` changes, `applyMaterialPresetToScene(...)` updates materials in-place and schedules dual `invalidate()` calls (`requestAnimationFrame(() => invalidate())`) under `frameloop="demand"`.
4. **Full Unmount Cleanup:** On unmount, all 5 slot trackers + rig tracker + `DRACOLoader` + `KTX2Loader` dispose, and shared studio env decrements its refcount.
5. **Diagnostics:** Updates `window.__ARVEN_3D_DIAGNOSTICS__` with `{ experience: 'outfit-studio', rigId, activeSlots, activeTier, frameloop: 'demand', geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, disposedResources, sharedEnvRefCount, loadState, contextLostCount, reducedMotion, updatedAt }`.

### 3.4 Next.js Route & Bundle Isolation Contract

- `apps/storefront/next.config.ts` and `apps/admin/next.config.ts` already pin `transpilePackages: ['@arven/ui', '@arven/three-engine', 'three']` (`three` must NEVER appear in `serverExternalPackages`).
- **Storefront islands (`motion-developer`):**
  - `apps/storefront/src/components/experience/showroom-3d-island.tsx` — `'use client'`, module-level `next/dynamic(() => import('@arven/three-engine/showroom').then((m) => m.ShowroomExperience), { ssr: false, loading: ... })`.
  - `apps/storefront/src/components/experience/outfit-studio-3d-island.tsx` — `'use client'`, module-level `next/dynamic(() => import('@arven/three-engine/outfit-studio').then((m) => m.OutfitStudioExperience), { ssr: false, loading: ... })`.
- **Zero 3D Leakage:** `/account/outfits` renders 2D posters (`posterUrl` / product image) and live IDR pricing only (`0 B` three.js). Build manifest verification (`AC-06`) must confirm `three` / `@react-three/*` appear exclusively on `/products/[slug]`, `/showroom`, `/outfit-studio` (storefront) and `/catalog/products/[id]`, `/experience/*` (admin), with zero showroom/outfit symbols in the PDP chunk.

---

## 4. Cross-Team DTO, Validator, URL Draft & SSR Contracts

### 4.1 Config Constants (`packages/config/src/constants.ts`)

```typescript
export const OUTFIT_SLOTS = ['top', 'bottom', 'outerwear', 'footwear', 'accessory'] as const;
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];

export const OUTFIT_ANCHORS = [
  'spine_upper',
  'pelvis',
  'feet',
  'shoulder_left',
  'shoulder_right',
  'wrist_left',
] as const;
export type OutfitAnchor = (typeof OUTFIT_ANCHORS)[number];

export const OUTFIT_STUDIO_POLICY = {
  RIG_ID: 'arven_mannequin_unisex_v1',
  SKELETON_VERSION: '1.0.0',
  SLOTS: OUTFIT_SLOTS,
  ANCHORS: {
    top: ['spine_upper'],
    outerwear: ['spine_upper'],
    bottom: ['pelvis'],
    footwear: ['feet'],
    accessory: ['shoulder_left', 'shoulder_right', 'wrist_left'],
  } as const satisfies Record<OutfitSlot, readonly OutfitAnchor[]>,
  MAX_SAVED_OUTFITS_PER_USER: 50,
  TITLE_MAX: 160,
} as const;

export const SHOWROOM_POLICY = {
  MAX_ZONE_BYTES: 6_291_456,
  MAX_LITE_ZONE_BYTES: 3_670_016,
  MAX_RESIDENT_ZONES: 2,
} as const;
```

### 4.2 Zod `.strict()` Schemas (`packages/validators/src/experiences.ts`)

All request schemas MUST use `z.strictObject(...)` so unknown fields (specifically any tampered `price`, `priceIdr`, `unitPriceIdr`, `amount`, `total`, `discount`) are rejected with `400 VALIDATION_ERROR` (Threat `T-03`):

- **Enums / Value Schemas:**
  - `showroomZoneStatusSchema`: `z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED'])`
  - `outfitSlotSchema`: `z.enum(['top', 'bottom', 'outerwear', 'footwear', 'accessory'])`
  - `outfitAnchorSchema`: `z.enum(['spine_upper', 'pelvis', 'feet', 'shoulder_left', 'shoulder_right', 'wrist_left'])`
  - `outfitCompatibilityReasonSchema`: `z.enum(['RIG_MISMATCH', 'SKELETON_VERSION_MISMATCH', 'SLOT_MISMATCH', 'ANCHOR_INVALID', 'LAYER_CONFLICT', 'DUPLICATE_SLOT', 'GARMENT_UNAVAILABLE', 'VARIANT_PRODUCT_MISMATCH', 'PRESET_ASSET_MISMATCH'])`
  - `outfitCompatibilityConfigSchema`: `z.strictObject({ rigId: z.string().trim().min(1).max(64), skeletonVersion: z.string().trim().regex(/^\d+\.\d+\.\d+$/), slot: outfitSlotSchema, anchor: outfitAnchorSchema, incompatibleSlots: z.array(outfitSlotSchema).max(5).default([]) })`
  - `showroomZoneCodeParamSchema`: `slugParamSchema` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 64)
  - `outfitRigIdParamSchema`: `z.string().trim().regex(/^arven_mannequin_[a-z0-9_]+$/).max(64)`
- **Outfit Studio / Customer Requests:**
  - `outfitSlotSelectionSchema`: `z.strictObject({ slot: outfitSlotSchema, productId: uuidSchema.optional(), variantId: uuidSchema, assetId: uuidSchema.optional(), presetId: uuidSchema.nullable().optional() })`
  - `validateOutfitRequestSchema`: `z.strictObject({ rigId: outfitRigIdParamSchema, slots: z.array(outfitSlotSelectionSchema).min(1).max(5) })`
  - `addOutfitToCartRequestSchema`: `z.strictObject({ rigId: outfitRigIdParamSchema, slots: z.array(z.strictObject({ slot: outfitSlotSchema, variantId: uuidSchema, presetId: uuidSchema.nullable().optional() })).min(1).max(5) })`
  - `createOutfitSceneRequestSchema`: `z.strictObject({ title: z.string().trim().min(1).max(160), rigId: outfitRigIdParamSchema, slots: z.array(outfitSlotSelectionSchema).min(1).max(5) })`
  - `updateOutfitSceneRequestSchema`: `z.strictObject({ title: z.string().trim().min(1).max(160).optional(), rigId: outfitRigIdParamSchema.optional(), slots: z.array(outfitSlotSelectionSchema).min(1).max(5).optional() }).refine((v) => Object.keys(v).length > 0)`
- **Admin Showroom & Compatibility Requests:**
  - `showroomVector3Schema`: `z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])`
  - `showroomCameraBaselineSchema`: `z.strictObject({ fovDeg: z.number().min(20).max(75).default(45), position: showroomVector3Schema, target: showroomVector3Schema, minDistance: z.number().positive().max(25).default(1.2), maxDistance: z.number().positive().max(40).default(12) })`
  - `showroomPortalSchema`: `z.strictObject({ targetZoneCode: showroomZoneCodeParamSchema, label: z.string().trim().min(1).max(120), position: showroomVector3Schema })`
  - `createShowroomZoneRequestSchema`, `updateShowroomZoneRequestSchema`, `transitionShowroomZoneRequestSchema` (`targetStatus: showroomZoneStatusSchema`)
  - `createShowroomHotspotRequestSchema`, `updateShowroomHotspotRequestSchema` (`positionX` in `[-50, 50]`, `positionY` in `[0, 10]`, `positionZ` in `[-50, 50]`)
  - `setAssetOutfitCompatibilityRequestSchema`: `outfitCompatibilityConfigSchema`
  - `createPublicOutfitPresetRequestSchema` / `updatePublicOutfitPresetRequestSchema`: `title`, `rigId`, `slots`

### 4.3 Shared DTOs (`packages/contracts/src/index.ts` + OpenAPI Sync)

`data-engineer` defines these interfaces in `packages/contracts/src/index.ts`; `backend-developer` exposes matching OpenAPI operations and runs `corepack pnpm contracts:generate` to update `packages/contracts/openapi/arven.openapi.json` and `packages/contracts/src/generated/openapi-paths.ts`:

- **Showroom DTOs:**
  - `ShowroomHotspotPublicDto`: `{ id, zoneId, productId, productSlug, productName, variantId, label, fromPriceIdr, primaryImageUrl, primaryImageAlt, has3dEnabled, position: [number, number, number], sortOrder }`
  - `ShowroomZonePublicDto`: `{ id, code, title, description, sortOrder, sceneUrl, liteSceneUrl, posterUrl, sceneBytes, liteSceneBytes, cameraBaseline, portals, lightingPreset, hotspots: ShowroomHotspotPublicDto[] }`
  - `ShowroomScenesResponseDto`: `{ zones: ShowroomZonePublicDto[] }`
  - `AdminShowroomHotspotDto`, `AdminShowroomZoneDto`
- **Outfit Studio DTOs:**
  - `OutfitCompatibilityConfigDto`: `{ rigId, skeletonVersion, slot, anchor, incompatibleSlots }`
  - `OutfitRigContractDto`: `{ rigId, skeletonVersion, slots, anchors, modelUrl, mobileModelUrl, posterUrl }`
  - `OutfitStudioGarmentVariantDto`: `{ id, sku, size, color, colorHex, priceIdr, compareAtPriceIdr, availableQty, inStock }`
  - `OutfitStudioGarmentDto`: `{ productId, productSlug, productName, material, fit, assetId, assetVersion, modelUrl, mobileModelUrl, posterUrl, compatibility: OutfitCompatibilityConfigDto, materialSlots, variants: OutfitStudioGarmentVariantDto[], customizationPresets: CustomizationPresetDto[] }`
  - `OutfitSceneSlotHydratedDto`: `{ slot, productId, productSlug, productName, variantId, sku, size, color, assetId, presetId, presetCode, presetLabel, swatchHex, unitPriceIdr, availableQty, inStock, posterUrl, stale, staleReasons: string[] }`
  - `OutfitSceneDto`: `{ id, title, rigId, skeletonVersion, isPublicPreset, slots: OutfitSceneSlotHydratedDto[], liveTotalIdr, hasStaleItems, createdAt, updatedAt }`
  - `OutfitStudioCatalogDto`: `{ rig: OutfitRigContractDto, garments: OutfitStudioGarmentDto[], publicPresets: OutfitSceneDto[] }`
  - `ValidateOutfitResultDto`: `{ valid: true, rigId, skeletonVersion, slotCount }`
  - `AddOutfitToCartItemResultDto`: `{ slot, variantId, productId, status: 'ADDED' | 'OUT_OF_STOCK' | 'INACTIVE', reason: string | null }`
  - `AddOutfitToCartResultDto`: `{ cart: CartDto, results: AddOutfitToCartItemResultDto[] }`
  - `AdminOutfitGarmentDiagnosticDto`: `{ assetId, productId, productSlug, productName, productStatus, assetStatus, isActiveVersion, version, posterUrl, compatibility: OutfitCompatibilityConfigDto | null, compatibleWithCurrentRig: boolean, diagnosticMessage: string | null }`

### 4.4 URL Draft Query Format & SSR Fallback Architecture

- **Guest Draft URL State (`/outfit-studio`):**
  - Query parameters map each slot key (`top`, `bottom`, `outerwear`, `footwear`, `accessory`) to `<variantUuid>` or `<variantUuid>:<presetUuid>`, plus optional `preset=<publicPresetUuid>`.
  - Parsing helper (`apps/storefront/src/lib/outfit-helpers.ts`) validates UUIDs strictly against `OutfitStudioCatalogDto` returned by `GET /api/v1/outfit-studio/catalog`. Invalid/stale query segments are discarded cleanly without runtime throws. No price/total parameters are ever read from URL.
- **SSR Fallback HTML Architecture:**
  - `/showroom` (`apps/storefront/src/app/showroom/page.tsx`): Renders `<StorefrontShell>` -> `<Suspense fallback={<LoadingState />}>` -> Server/Client shell renders architectural zone directory, static zone `posterUrl` images, and every active hotspot product with live `formatIDR()` prices and `<Link href="/products/...">` **directly in SSR HTML**. `Showroom3DIsland` (`next/dynamic ssr: false`) progressively mounts on the dark stage (`data-theme="dark"`); WebGL failure/disablement activates `ShowroomFallback` seamlessly.
  - `/outfit-studio` (`apps/storefront/src/app/outfit-studio/page.tsx`): Renders `<StorefrontShell>` -> `<Suspense fallback={<LoadingState />}>` -> permanent disclosure note (*"Pratinjau gaya visual menggunakan manekin standar. Periksa Panduan Ukuran untuk detail ukuran fisik."*), accessible slot radiogroups (`Arrow` / `Home` / `End` keys), compatibility notices, live IDR summary, and 2D poster preview cards outside `<Canvas>`, while `OutfitStudio3DIsland` (`next/dynamic ssr: false`) mounts when WebGL is available.
  - `/account/outfits` (`apps/storefront/src/app/account/outfits/page.tsx`): Wrapped in `<AccountShell>`, renders 2D saved-outfit cards with slot posters, live `formatIDR()` total, stale indicators, rename/delete actions, and `"Buka di Studio"` links (`0 B` three.js).

---

## 5. Prisma 7 Additive Migration `0002_phase08_showroom_outfits` Boundary

1. **Additive PSL Changes (`packages/database/prisma/schema.prisma`):**
   - Add `enum ShowroomZoneStatus { DRAFT PUBLISHED ARCHIVED }`.
   - Add `model ShowroomZone` (`@@map("showroom_zones")`) and `model ShowroomHotspot` (`@@map("showroom_hotspots")`) with exact columns, FKs, and indexes specified in [`docs/PHASE_08_PLAN.md`](./PHASE_08_PLAN.md) §5.1.
   - Add inverse relation arrays on `User`, `Product`, and `ProductVariant`. Zero existing columns altered or dropped.
2. **Migration Execution Workflow (Prisma 7):**
   - Run `corepack pnpm --filter @arven/database exec prisma migrate dev --create-only --name phase08_showroom_outfits`.
   - Append the manual SQL `CHECK` constraints (`chk_showroom_zone_*`, `chk_showroom_hotspot_*`, `chk_outfit_items_shape`, `chk_outfit_owner_or_public`, `chk_outfit_rig_format`, `chk_outfit_items_no_price`) to the generated `migration.sql`.
   - Apply against live PostgreSQL 18 (`5432`) via `corepack pnpm --filter @arven/database exec prisma migrate dev` and regenerate client (`prisma:generate`). **Never** run `prisma db push`.
3. **Migration Risk & Live Infrastructure Verification (`AMB-08`):**
   - **Constraint Drift Risk:** Prisma 7 PSL does not model PostgreSQL `CHECK` constraints (`chk_outfit_items_no_price`, etc.), so future `migrate dev` diffs must be inspected before applying, and `phase08-seed.test.ts` / `phase08-experience-security.test.ts` must query `pg_constraint` and attempt a raw SQL insert with `"unitPriceIdr"` to prove `chk_outfit_items_no_price` is live in PostgreSQL 18.
   - **Live DB/Redis Gate:** PostgreSQL 18 (`5432`) and Memurai Redis (`6379`) must be active when `data-engineer`, `backend-developer`, and `security-engineer` run migrations, seed, and integration tests. If either service is down, report **`BLOCKED`** honestly; never substitute mock DB/Redis passes.

---

## 6. Stage 3 Exclusive `ownedPaths` & Zero-Overlap Verification

Verified against the Phase 08 Harness Plan (`902c7aba-7aeb-406d-9ebb-2edefdc9108f`) and [`docs/PHASE_08_PLAN.md`](./PHASE_08_PLAN.md) §8:

| Engineer (Task ID) | Exclusive `ownedPaths` | Overlap Check |
|---|---|---|
| `data-engineer` (`3d1b8508`) | `packages/database/**`, `packages/validators/**`, `packages/config/**`, `packages/contracts/src/index.ts`, `docs/DATA_MODEL.md` | Disjoint from `backend-developer`'s `packages/contracts/openapi/**` & `src/generated/**` |
| `backend-developer` (`65455ca5`) | `apps/api/src/**`, `apps/api/test/integration/phase08-experiences.test.ts`, `apps/api/test/unit/phase08-outfit-compatibility.test.ts`, `packages/contracts/openapi/**`, `packages/contracts/src/generated/**`, `docs/API_CONTRACTS.md` | Disjoint from `security-engineer`'s `apps/api/test/security/phase08-experience-security.test.ts` |
| `threejs-developer` (`e0f492df`) | `packages/three-engine/**`, `apps/storefront/next.config.ts`, `apps/admin/next.config.ts` | Disjoint from all `apps/*/src/**` routes and components |
| `motion-developer` (`e816fc76`) | `apps/storefront/src/components/experience/showroom-3d-island.tsx`, `apps/storefront/src/components/experience/outfit-studio-3d-island.tsx`, `apps/storefront/test/phase08-experience-motion.test.tsx` | Exact filenames; disjoint from `frontend-developer`'s files in `components/experience/` |
| `frontend-developer` (`bb56a5b6`) | `apps/storefront/src/app/showroom/**`, `apps/storefront/src/app/outfit-studio/**`, `apps/storefront/src/app/account/outfits/**`, `apps/storefront/src/components/experience/showroom-view.tsx`, `showroom-fallback.tsx`, `hotspot-quick-card.tsx`, `outfit-studio-view.tsx`, `outfit-slot-picker.tsx`, `saved-outfits-panel.tsx`, `outfit-studio-fallback.tsx`, `apps/storefront/src/components/account/saved-outfits-view.tsx`, `storefront-shell.tsx`, `account-shell.tsx`, `apps/storefront/src/lib/api-client.ts`, `outfit-helpers.ts`, `apps/storefront/test/phase08-experience.test.tsx`, `phase06-editorial-returns.test.ts`, `apps/admin/src/app/experience/**`, `apps/admin/src/components/experience/**`, `apps/admin/src/lib/{api-client,ops-helpers,permissions}.ts`, `apps/admin/test/phase08-admin-experience.test.tsx` | Exact filenames inside `components/experience/`; zero overlap with `motion-developer` or `security-engineer` (`proxy.ts`) |
| `security-engineer` (`6fde4184`) | `apps/api/test/security/phase08-experience-security.test.ts`, `apps/storefront/src/proxy.ts`, `apps/admin/src/proxy.ts`, `apps/storefront/test/proxy.test.ts`, `apps/admin/test/proxy.test.ts` | Disjoint from all other test and app source paths |

**Unowned Shared Files:** `pnpm-lock.yaml`, root `package.json`, `.harness/**` (no dependency additions needed; any unexpected need escalates to coordinator).

### Stage 3 Handoff Sequence
1. **`data-engineer` + `threejs-developer`** land first:
   - `data-engineer` publishes `OUTFIT_STUDIO_POLICY`, `SHOWROOM_POLICY`, `packages/validators/src/experiences.ts`, `packages/contracts/src/index.ts` DTOs, migration `0002_phase08_showroom_outfits`, and seed (`buildArvenMannequinGlbBuffer` / `buildArvenShowroomZoneGlbBuffer` once `threejs-developer` exports `./glb`).
   - `threejs-developer` publishes `./glb` builders and `./showroom` + `./outfit-studio` props/components while keeping `.` untouched.
2. **`backend-developer`** implements `apps/api/src/modules/experiences/**` + `CartService.addOutfitItemsBatch` + `contracts:generate` OpenAPI sync.
3. **`motion-developer` + `frontend-developer` + `security-engineer`** consume contracts, engine islands, and live API endpoints to complete UI, motion/accessibility controls, and T-03/IDOR/RBAC/CSP security suites.
