# ARVEN — Phase 07 Architecture & Package Boundary Contract

> **Execution Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Task ID:** `9f2df93a-be0c-40ae-b5d8-def99dde1c44` (`architecture-lead`)  
> **Governing Baselines:** [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md), [`docs/THREE_D_PIPELINE.md`](./THREE_D_PIPELINE.md), [`docs/DATA_MODEL.md`](./DATA_MODEL.md), [`docs/API_CONTRACTS.md`](./API_CONTRACTS.md)

## 1. Dependency Direction & Strict Bundle Isolation

```text
packages/validators (Zod v4 schemas)
        ├──► packages/contracts (DTOs + OpenAPI)
        ├──► apps/api (NestJS 12 ESM controllers/services/guards)
        └──► packages/three-engine (Browser/R3F 9 + binary GLB parser/builder)
                  ├──► apps/worker (pure Node GLB inspector only — zero DOM/WebGL)
                  ├──► apps/storefront (loaded ONLY on /products/[slug] via next/dynamic ssr: false)
                  └──► apps/admin (loaded ONLY on /catalog/products/[id] via next/dynamic ssr: false)
```

1. **Zero Eager 3D Bloat on Non-3D Routes:** Static and client bundles for `/`, `/shop`, `/collections`, `/cart`, `/checkout`, `/lookbook`, `/journal`, `/about`, and `/account/*` MUST NOT import `@arven/three-engine`, `three`, `@react-three/fiber`, or `@react-three/drei`.
2. **Hard Stack Pins Verified via Context7:**
   - React Three Fiber `^9.8` (`<Canvas frameloop="demand" ...>`) + `@react-three/drei@^10.7` (`OrbitControls`, `ContactShadows`, `useGLTF`) on React `^19.3.1`.
   - Next.js 16 `transpilePackages: ['@arven/ui', '@arven/three-engine', 'three']` in both `apps/storefront/next.config.ts` and `apps/admin/next.config.ts`.
   - Self-hosted decoder binaries in `/public/decoders/draco/` and `/public/decoders/basis/` with `GLTFLoader` / `DRACOLoader` / `KTX2Loader` configured strictly to same-origin paths.
3. **Asset Lifecycle & Publish Gate:**
   - Admin workflow: `presign -> upload-staging -> confirm (enqueue/validate -> READY | FAILED) -> publish (archived previous active -> active version + has3dEnabled=true)`.
   - `evaluateProductPublishGate` rejects `READY_TO_PUBLISH -> PUBLISHED` (`422 PUBLISH_GATE_UNMET`) when `has3dEnabled === true` lacks an active `READY` `Product3DAsset` with `posterKey`, `materialSlots`, and `mobileObjectKey` (`lite` profile).
4. **Checkout & Cart Authority Preservation:**
   - Preset swatches selected in 3D/2D viewer write `configuration: { colorPresetId, colorPresetCode, colorPresetLabel }` into `cart_items`. Prices, discounts, and stock remain 100% authoritative from `product_variants` & `inventory_levels`.
