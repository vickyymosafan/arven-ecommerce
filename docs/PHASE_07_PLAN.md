# ARVEN Phase 07 Plan — 3D Product Viewer, Asset Pipeline & Customization Presets

> **Phase:** Phase 07 (`FR-011`, `FR-012`, `docs/PRD_AND_BUSINESS_RULES.md` §2.3 & §5, `docs/THREE_D_PIPELINE.md`)  
> **Harness Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Baseline Commit:** `e2cd575` (Phase 06 Complete)  
> **Runtime Topology:** Native Windows Non-Docker (`PostgreSQL 18` on `5432`, `Memurai` Redis API on `6379`, `LocalFsStorageAdapter` on `.local/storage`)

---

## 1. Phase 07 Scope & Non-Goals

### In Scope (`P1`)
1. **`packages/three-engine` (`@arven/three-engine`):**
   - `three`, `@react-three/fiber@^9.8.x`, `@react-three/drei@^10.7.x` pinned for React 19 + Next.js 16 Turbopack (`transpilePackages: ['@arven/ui', '@arven/three-engine', 'three']`).
   - Spec-compliant binary glTF 2.0 (`.glb`) builder (`buildArvenGarmentGlbBuffer`) and strict security/geometry validator (`inspectAndValidateGlbBuffer`).
   - `ResourceTracker` GPU memory tracking & disposal utilities (`disposeSceneGraph`) + 10x swap memory leak prevention.
   - `MaterialPresetController` (`applyMaterialPresetToScene`) updating only `customizable: true` slots within validated `roughnessRange` / `metalnessRange`.
   - WebGL capability & device tier resolver (`default` desktop <= 80,000 tris / <= 10 MB; `lite` mobile / `Save-Data` <= 25,000 tris / <= 3.5 MB).
   - Shared `'use client'` `<ProductExperience>` (`<Canvas frameloop="demand">`, `webglcontextlost`/`webglcontextrestored` recovery, `prefers-reduced-motion: reduce` instant camera snaps, mobile `touch-action: pan-y` scroll isolation, diagnostics bridge `window.__ARVEN_3D_DIAGNOSTICS__`) and `<AccessibleProductControls>`.
2. **Self-Hosted Decoder Assets & CSP Hardening:**
   - Copy `draco` and `basis` WASM/JS decoders from `three/examples/jsm/libs/` into `apps/storefront/public/decoders/` and `apps/admin/public/decoders/`.
   - Update `proxy.ts` (`apps/storefront`, `apps/admin`) with `"worker-src 'self' blob:"` and zero external CDN dependencies.
3. **Contracts, Validators, Database Seed & BullMQ `3d-assets` Worker:**
   - `packages/validators/src/assets3d.ts` (`.strict()` Zod v4 schemas rejecting unknown keys, pink hexes, unsafe URLs, oversized uploads).
   - `packages/contracts/src/index.ts` DTOs + synchronized `packages/contracts/openapi/arven.openapi.json` & `OPENAPI_PATHS`.
   - `packages/database/src/seed.ts`: generate deterministic `.glb` (`model.glb` + `model-lite.glb`) and `poster.webp` files into `.local/storage/public/products/{slug}/v0001/`, seed `Product3DAsset` (`READY`, `isActiveVersion: true`), `AssetValidationRun` (`PASSED`), and `CustomizationPreset` rows mapped to real variants across the catalog (`has3dEnabled: true` on featured products).
   - `apps/worker/src/processors/three-d-assets.processor.ts`: BullMQ processor for `QUEUE_NAMES.THREE_D_ASSETS` (`3d-assets`) executing binary GLB magic-byte, JSON chunk, polyglot/SSRF URI, triangle/size cap, and material slot validation before promoting immutable versioned keys.
4. **Backend 3D Assets, Presets & Publish Gate (`apps/api`):**
   - Public endpoints (`@Public()`): `GET /products/:id/3d-assets`, `GET /3d-assets/:id/metadata`, `GET /3d-assets/:id/model`, `GET /3d-assets/:id/model-lite`, `GET /3d-assets/:id/poster` (`X-Content-Type-Options: nosniff`, `Cache-Control: immutable`), `POST /3d-assets/telemetry` (zero PII).
   - Admin endpoints (`@AdminAuth()`, `asset.read` / `asset.upload` / `asset.publish` + `@AuditAction`): `GET /admin/products/:id/3d-assets`, `POST /admin/products/:id/3d-assets/presign`, `PUT /admin/3d-assets/:id/upload-staging`, `POST /admin/3d-assets/:id/confirm`, `GET /admin/3d-assets/:id/preview-model`, `POST /admin/3d-assets/:id/publish`, `GET/POST/PATCH/DELETE /admin/3d-assets/:id/presets`, and `GET /admin/analytics/3d-engagement`.
   - `evaluateProductPublishGate` updated so `has3dEnabled === true` enforces active `READY` `Product3DAsset` with poster, material slots, and lite profile (`422 PUBLISH_GATE_UNMET`).
5. **Admin 3D Asset Studio & Storefront PDP 2D/3D Experience:**
   - `apps/admin`: `<AdminProduct3DPanel>` on `/catalog/products/[id]` for version table, presign/upload/confirm validation diagnostics, `<ProductExperience>` preview modal (`next/dynamic` `ssr: false`), version publish toggle, and preset CRUD + `has3dEnabled` checkbox.
   - `apps/storefront`: PDP `/products/[slug]` preserves SSR-first 2D studio gallery (`Foto 2D` / `Model 3D` opt-in toggle), `next/dynamic(..., { ssr: false })` 3D viewer island on Dark Showcase (`#17191B` / `#35383A`), `"Lewati Tampilan 3D"` skip link, color/material preset radio swatches synced with variant selection & Cart `configuration`, camera angle & step buttons, mobile scroll guard, and graceful WebGL-disabled / `webglcontextlost` 2D fallback.
   - Route Bundle Isolation: `0 KB` of `three` or `@react-three/*` loaded on `/`, `/shop`, `/collections`, `/cart`, `/checkout`, `/lookbook`, `/journal`, `/about`, or `/account/*`.

### Strictly Deferred to Phase 08
- Virtual Showroom (`/showroom`, `FR-013`) and Outfit Studio (`/outfit-studio`, `FR-014`).

---

## 2. Parallel Workstream Ownership Split (Stage 3)

| Harness Task Role | Owned Paths (Disjoint Locks) | Core Deliverables |
|---|---|---|
| `threejs-developer` | `package.json`, `pnpm-lock.yaml`, `packages/three-engine/**`, `apps/storefront/public/decoders/**`, `apps/admin/public/decoders/**`, `apps/storefront/next.config.ts`, `apps/admin/next.config.ts`, `apps/storefront/package.json`, `apps/admin/package.json` | `@arven/three-engine`, GLB builder/validator, `ResourceTracker`, `MaterialPresetController`, `<ProductExperience>`, self-hosted decoders, Next 16 `transpilePackages` |
| `data-engineer` | `packages/validators/**`, `packages/contracts/src/index.ts`, `packages/database/**`, `apps/worker/**` | 3D Zod schemas & DTOs, `.glb`/`.webp` studio fixtures in `seed.ts`, BullMQ `3d-assets` worker processor |
| `backend-developer` | `apps/api/src/**`, `packages/contracts/openapi/**`, `packages/contracts/src/generated/**` | Public & Admin 3D asset/preset controllers, binary streaming with `nosniff`, `3d-engagement` analytics, `evaluateProductPublishGate`, OpenAPI sync |
| `security-engineer` | `apps/storefront/src/proxy.ts`, `apps/admin/src/proxy.ts`, `apps/api/test/security/phase07-3d-security.test.ts` | `worker-src 'self' blob:` CSP, Threat `T-06` negative GLB/polyglot/SSRF/oversize tests, RBAC 7-role `asset.*` & telemetry PII hygiene tests |
| `motion-developer` | `apps/storefront/src/components/catalog/product-3d-viewer-island.tsx`, `apps/storefront/test/phase07-pdp-motion.test.tsx` | Accessible camera presets, step controls, reduced-motion instant camera transitions, mobile `touch-action: pan-y` interaction toggle, WebGL fallback |
| `frontend-developer` | `apps/storefront/src/components/catalog/product-detail-view.tsx`, `apps/storefront/src/lib/api-client.ts`, `apps/storefront/test/phase07-pdp-3d.test.tsx`, `apps/admin/src/components/catalog/**`, `apps/admin/src/lib/api-client.ts`, `apps/admin/test/phase07-admin-3d.test.tsx` | Storefront PDP `2D / 3D` viewer integration, preset swatches + Cart `configuration`, Admin 3D Asset Studio panel & preset CRUD |

---

## 3. Verification & Quality Checkpoints (`22202ad0-0d75-430c-ad26-ba1895be7ec4`)

All 10 Harness checkpoints (`responsive`, `layout`, `interaction`, `typography-color`, `motion`, `3d-rendering`, `accessibility`, `performance`, `security`, `final-regression`) must transition to `pass` backed by independent QA subagent evidence before Phase 08 begins.
