# ARVEN: 3D Experience & Asset Pipeline Contract

> **Status:** Phase 01 Canonical 3D Architecture & Asset Specification
> **Sources of Truth:** [`ARVEN_Full_Blueprint_v1.md`](../ARVEN_Full_Blueprint_v1.md) (Sections 7.3, 13, 18, Appendix C), [`docs/PRD_AND_BUSINESS_RULES.md`](./PRD_AND_BUSINESS_RULES.md), [`docs/DISCOVERY_REPORT.md`](./DISCOVERY_REPORT.md), and [`DESIGN.md`](../DESIGN.md)
> **Target Delivery Phases:** Phase 07 (Product 3D Viewer & Asset Pipeline) and Phase 08 (Virtual Showroom & Outfit Studio)

---

## 1. Scope & Non-Goals

ARVEN enhances editorial commerce with progressive 3D visualization while maintaining a strict **commerce-first** rule: every customer purchase path (browse, variant selection, cart, checkout, payment) MUST work identically without WebGL.

### 1.1 Release v1 Scope vs. Explicit Non-Goals

| Experience | Priority | In Scope (Release v1) | Explicitly Out of Scope (v1) |
|---|---|---|---|
| **3D Product Viewer** (`FR-011`) | P1 | Interactive orbit, zoom, view reset, camera focus presets, 2D/3D mode toggle, immediate `poster.webp`, static 2D gallery fallback | Mandatory WebGL gating before Add to Bag or Checkout |
| **Material / Color Customizer** (`FR-012`) | P1 | Server-driven `customization_presets` mapped deterministically to validated `materialSlots` | Arbitrary client-side RGB hex pickers creating unmanufactured/unpriced SKUs |
| **Virtual Showroom** (`FR-013`) | P1 | Zone-based lazy-loaded architectural gallery spaces, baked lighting, interactive product hotspots opening PDP quick-cards, mobile touch/button zone navigation | Open-world multiplayer avatars, real-time physics collisions, continuous global scene preload |
| **Outfit Studio** (`FR-014`) | P1 | Fixed unisex mannequin rig (`arven_mannequin_unisex_v1`), slot-validated garment combination (`top`, `bottom`, `outerwear`, `footwear`, `accessory`), saved outfit configs (`outfit_scenes`) storing product/variant/preset IDs only | Real-time cloth/drape physics simulation, body measurement scanning, parametric avatar body shaping, virtual size/fit guarantees |

---

## 2. Next.js 16 + React 19 + R3F 9 + Three.js Integration Boundaries

### 2.1 Verified Package & Version Matrix

Per Phase 01 dependency verification (`DISCOVERY_REPORT.md` & Context7 official docs):

| Package | Version Constraint | Integration Requirement |
|---|---|---|
| `next` | `^16.4` (`16.x`) | App Router Server-first rendering; `transpilePackages: ['three']` in `next.config.ts` |
| `react` / `react-dom` | `^19` | Required peer runtime for React Three Fiber 9 |
| `@react-three/fiber` | `^9.8` (`9.x`) | Strictly R3F 9 (R3F 8 is React 18 only and forbidden) |
| `@react-three/drei` | `^10.7` (`10.x`) | R3F 9 / React 19 generation (`useGLTF`, `OrbitControls`, `Environment`, `Preload`) |
| `three` & `@types/three` | Pinned minor (e.g. `0.17x` / `0.18x` verified compatible with `drei`) | Transpiled via `next.config.ts`; decoders self-hosted under `/public/decoders/` |

### 2.2 Monorepo Boundaries & Rendering Isolation

- **`packages/three-engine`:** Contains pure browser/WebGL scene builders, `GLTFLoader` + `DRACOLoader` + `KTX2Loader` + `MeshoptDecoder` wrappers, `ResourceTracker` disposal utilities, material preset applicator, capability/tier detector, and shared R3F canvas primitives.
  - **Strict Boundary:** `packages/three-engine` MUST NEVER import Prisma, NestJS, payment logic, Cart mutation secrets, or database entities. It accepts serialized API DTOs (`AssetManifest`) only.
- **`apps/storefront` & `apps/admin`:** Own routing, SEO metadata, server data fetching, Cart/Checkout integration, and RBAC upload/preview screens.
- **`next.config.ts` Rule:**
  ```ts
  import type { NextConfig } from 'next'

  const nextConfig: NextConfig = {
    transpilePackages: ['three'],
  }

  export default nextConfig
  ```
  *(Note: `three` MUST NOT appear in `serverExternalPackages`.)*
- **Zero 3D JavaScript on Non-3D Routes:**
  - Storefront Home (`/`), Shop (`/shop`, `/shop/[category]`, `/search`), Collections (`/collections/[slug]`), Cart (`/cart`), Checkout (`/checkout`), Account (`/account/*`), Lookbook, and Journal MUST ship **0 KB of `three`, `@react-three/fiber`, or `@react-three/drei` bundles** (unless a specific route explicitly mounts an opt-in 3D viewer trigger, and even then only dynamically after interaction).
  - Product Detail (`/products/[slug]`) renders product details, variant selector, size guide, stock status, Add to Bag CTA, and `poster.webp` + 2D gallery **purely on the server** without blocking on WebGL.
  - The interactive 3D canvas loads exclusively inside a `'use client'` wrapper via `next/dynamic(..., { ssr: false })`:
    ```tsx
    'use client'
    import dynamic from 'next/dynamic'

    const ProductCanvasClient = dynamic(
      () => import('./product-canvas-client').then((m) => m.ProductCanvasClient),
      {
        ssr: false,
        loading: () => <PosterStageLoadingFallback />,
      },
    )
    ```

### 2.3 Canonical Product Viewer Component Model (Blueprint Section 13.2)

```tsx
<ProductExperience assetManifest={manifest} poster={posterUrl} fallbackGallery={images}>
  <CanvasBoundary>
    <SceneEnvironment />
    <ProductModel />
    <CameraControls />
    <MaterialPresetController />
    <LightingRig />
  </CanvasBoundary>
  <AccessibleProductControls />
</ProductExperience>
```

| Layer | Runtime Boundary | Responsibilities |
|---|---|---|
| `<ProductExperience>` | Client Island Root | Holds UI state (`viewMode: '2d' | '3d'`, `activePresetId`, `cameraPreset`, `webglStatus`, `assetError`) **outside** the R3F reconciler. Checks device capability / `Save-Data` / `prefers-reduced-motion` and emits structured 3D telemetry. |
| `<CanvasBoundary>` | React ErrorBoundary + R3F `<Canvas>` | Wraps `<Canvas frameloop="demand" dpr={tierDpr} fallback={<StaticGalleryFallback />}>` inside an ErrorBoundary catching WebGL crashes. Attaches `webglcontextlost` / `webglcontextrestored` listeners in `onCreated`. |
| `<SceneEnvironment>` & `<LightingRig>` | R3F Scene | Configures calibrated neutral studio IBL environment (`HDRI` with verified license, wrapped in `<group dispose={null}>` only if explicitly ref-counted across route). Never uses colored neon spotlights. |
| `<ProductModel>` | R3F Scene | Loads `lite` or `default` `.glb`, registers meshes/materials/textures in `ResourceTracker`, enforces center/ground alignment, disposes GPU resources on asset/version swap and unmount. |
| `<CameraControls>` | R3F Scene | Configures bounded `OrbitControls` (polar/azimuth/distance clamps), calls `invalidate()` on demand, disables smooth damping animation under `prefers-reduced-motion`. |
| `<MaterialPresetController>` | R3F Scene | Applies server-validated `customization_presets` ONLY to declared `customizable: true` `materialSlots` (`baseColor`, `roughnessFactor`, `normalScale`, texture swap with disposal of displaced textures). |
| `<AccessibleProductControls>` | Standard DOM outside `<canvas>` | Keyboard & screen-reader accessible buttons/radios for `2D/3D Toggle`, `Preset Swatches`, `Rotate Left/Right`, `Zoom In/Out`, `Reset View`, `"Lewati 3D"` skip anchor, and `aria-live="polite"` status announcements. |

---

## 3. GLB/GLTF Blender-to-CDN Asset Pipeline

### 3.1 End-to-End Lifecycle (Blueprint Section 13.3)

```text
1. Product Tech Pack (garment specs, fabrics, colorway swatches)
   -> 2. Blender Modeling & Topology Cleanup
   -> 3. UV Unwrap & Deterministic Slot Assignment
   -> 4. PBR Texture Baking (baseColor sRGB, ORM linear, OpenGL Normal)
   -> 5. Naming, Scale & Coordinate Validation in Blender Export Preset
   -> 6. GLB Binary Export
   -> 7. Admin Presigned Upload -> Private Staging Bucket (staging/uploads/...)
   -> 8. BullMQ `3d-assets` Worker Automated Validation & Optimization:
         - Magic bytes + glTF 2.0 schema check (reject malformed / external URI leaks)
         - Mesh & material slot verification against `materialSlots` contract
         - Geometry compression (Meshopt / Draco) + Texture transcoding (KTX2/Basis)
         - Desktop (`default`) + Mobile (`lite`) LOD variant generation
         - Automated `poster.webp` & optional turntable frames render
   -> 9. Admin Visual QA Preview (`READY_FOR_QA` / `READY`)
   -> 10. Publish to Immutable Versioned CDN Key (products/{slug}/v{NNN}/...)
   -> 11. Product Manager Publish Gate (`Product3DAsset.status = READY`)
```

### 3.2 Coordinate System, Scale & Geometry Baseline

| Standard Area | Locked Project Rule (`documented-project-standard`) |
|---|---|
| **Format** | Binary `.glb` (glTF 2.0) exclusively for CDN delivery. External `.gltf` + `.bin`/`.png` sidecars are forbidden on public CDN to eliminate waterfall requests. |
| **Coordinate System** | Right-handed `+Y` Up, `+Z` Forward (facing camera at default orbit `(0, 0, +Z)`), `+X` viewer-right. Blender glTF exporter MUST enable `+Y Up`. |
| **Scale & Origin** | `1 unit = 1 meter` (`1.0m`). Horizontal bounding box centered at `X = 0, Z = 0`. Footwear, bags, and mannequins rest cleanly on ground plane `Y = 0`; suspended garments center vertically around `cameraBaseline.targetY`. |
| **Camera Baseline** | Default `fov = 35` degrees (low-distortion fashion lens), `near = 0.05`, `far = 50`, default distance `2.2 * boundingRadius`, `minDistance = 0.85 * boundingRadius`, `maxDistance = 3.5 * boundingRadius`, polar clamp `[0.25 rad, 1.85 rad]`. |
| **Geometry Hygiene** | Zero hidden interior geometry, zero duplicate/overlapping vertices, zero unapplied modifiers, manifold outer shells, valid normals/tangents, max `TEXCOORD_0` (plus `TEXCOORD_1` strictly if separate AO UV exists). |

### 3.3 Deterministic Mesh & Material Slot Naming

Customizers and Outfit Studio anchor validation depend on deterministic node/material identifiers (Blueprint Section 13.4):

- **Canonical Mesh Identifiers:** `body_main`, `collar_trim`, `sleeve_left`, `sleeve_right`, `cuff_hem`, `pocket_detail`, `hardware_zipper`, `hardware_button`, `upper_leather`, `sole_base`, `strap_main`, `stitching`.
- **Canonical Material Slot Identifiers:** `fabric_outer`, `fabric_lining`, `fabric_rib`, `stitching`, `metal_hardware`, `leather_upper`, `rubber_outsole`.
- **Validation Gate:** The `3d-assets` worker rejects any uploaded GLB whose declared `materialSlots` in the manifest do not exist in the parsed glTF node/material graph (transitioning `AssetStatus` to `FAILED` with exact diagnostic error codes).

### 3.4 PBR Textures, Compression & LOD Profiles

- **PBR Channel Standard:**
  - `baseColorTexture`: `sRGB` color space.
  - `normalTexture`: `linear` color space, OpenGL (`+Y`) tangent-space normal map.
  - `metallicRoughnessTexture` / `occlusionTexture`: `linear` color space, packed ORM (`R = Occlusion`, `G = Roughness`, `B = Metallic`).
- **Compression & Decoder Hosting:**
  - **Geometry:** Evaluate and apply **Meshopt (`EXT_meshopt_compression`)** or **Draco (`KHR_draco_mesh_compression`)** in the `3d-assets` worker.
  - **Textures:** Transcode to **KTX2 / Basis Universal (`KHR_texture_basisu`)** (`UASTC` for high-frequency normal/weave maps, `ETC1S` for diffuse/roughness), while retaining WebP/PNG fallback textures inside `lite` / legacy compatibility builds if Basis hardware transcoding is unavailable.
  - **Self-Hosted Decoders:** Host Draco WASM/JS, Meshopt decoder, and Basis KTX2 transcoder files under same-origin `/decoders/draco/`, `/decoders/meshopt/`, and `/decoders/basis/` (configured via `useGLTF.setDecoderPath('/decoders/draco/')` and `ktx2Loader.setTranscoderPath('/decoders/basis/')` + `ktx2Loader.detectSupport(gl)`). **Never** fetch decoder binaries from third-party unpinned CDNs (`unpkg.com` / `gstatic.com`) at runtime, preserving strict CSP headers.
- **LOD Quality Profiles:**

| Profile | Target Devices | Max Triangles | Max Texture Dimension | Target GLB Size | Hard Validator Cap |
|---|---|---|---|---|---|
| `default` | Desktop & high-tier tablets | `<= 80,000` | `2048 x 2048` | `2 – 8 MB` | Reject `> 10 MB` (`FAILED`) |
| `lite` | Mobile phones, `Save-Data`, low-tier GPU | `<= 25,000` | `1024 x 1024` | `<= 2.5 MB` | Reject `> 3.5 MB` (`FAILED`) |

### 3.5 Immutable Object Keys & License/Source Provenance

- **Private Upload Quarantine:** `staging/uploads/{assetId}/{randomUuid}.glb` (non-public bucket, MIME/magic-byte inspected before worker processing; never served directly to browsers).
- **Immutable Published Keys:** Every published version creates a brand-new immutable prefix:
  - `products/{productSlug}/v{000N}/model.glb`
  - `products/{productSlug}/v{000N}/model-lite.glb`
  - `products/{productSlug}/v{000N}/poster.webp`
  - `products/{productSlug}/v{000N}/turntable/` (optional 2D fallback frames)
  - Served via CDN with `Cache-Control: public, max-age=31536000, immutable`. Overwriting an existing `v{000N}` key is strictly forbidden; updates increment `version` atomically in PostgreSQL (`Product3DAsset`).
- **License & Provenance Tracking:** Every `Product3DAsset` record MUST store provenance metadata before transitioning to `READY`: `modelAuthor`, `modelLicense` (e.g., `ARVEN-Proprietary` or commercial license ref), `textureSourceLicense`, `hdriLicense`, and `shader/font` attributions where applicable.

### 3.6 Canonical Asset Metadata JSON Schema (Blueprint Section 13.5 Extended)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ArvenProduct3DAssetManifest",
  "type": "object",
  "required": [
    "assetId",
    "productId",
    "version",
    "format",
    "objectKey",
    "liteObjectKey",
    "posterKey",
    "bytes",
    "liteBytes",
    "triangleCount",
    "status",
    "coordinateSystem",
    "cameraBaseline",
    "materialSlots",
    "qualityProfiles",
    "provenance"
  ],
  "properties": {
    "assetId": { "type": "string", "format": "uuid" },
    "productId": { "type": "string", "format": "uuid" },
    "variantId": { "type": ["string", "null"], "format": "uuid" },
    "version": { "type": "integer", "minimum": 1 },
    "format": { "type": "string", "enum": ["glb"] },
    "objectKey": { "type": "string", "pattern": "^products/[a-z0-9-]+/v[0-9]{3,}/model\\.glb$" },
    "liteObjectKey": { "type": "string", "pattern": "^products/[a-z0-9-]+/v[0-9]{3,}/model-lite\\.glb$" },
    "posterKey": { "type": "string", "pattern": "^products/[a-z0-9-]+/v[0-9]{3,}/poster\\.webp$" },
    "bytes": { "type": "integer", "maximum": 10485760 },
    "liteBytes": { "type": "integer", "maximum": 3670016 },
    "triangleCount": { "type": "integer", "minimum": 1, "maximum": 80000 },
    "status": { "type": "string", "enum": ["UPLOADED", "PROCESSING", "READY", "FAILED", "ARCHIVED"] },
    "coordinateSystem": { "type": "string", "const": "y-up-z-forward-meters" },
    "cameraBaseline": {
      "type": "object",
      "required": ["fovDeg", "target", "initialPosition", "minDistance", "maxDistance"],
      "properties": {
        "fovDeg": { "type": "number", "default": 35 },
        "target": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 },
        "initialPosition": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 },
        "minDistance": { "type": "number" },
        "maxDistance": { "type": "number" }
      }
    },
    "materialSlots": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["mesh", "material", "customizable"],
        "properties": {
          "mesh": { "type": "string" },
          "material": { "type": "string" },
          "customizable": { "type": "boolean" }
        }
      }
    },
    "qualityProfiles": {
      "type": "object",
      "required": ["desktop", "mobile"],
      "properties": {
        "desktop": { "type": "string", "enum": ["default"] },
        "mobile": { "type": "string", "enum": ["lite"] }
      }
    },
    "outfitCompatibility": {
      "type": ["object", "null"],
      "required": ["rigId", "skeletonVersion", "slot", "anchor"],
      "properties": {
        "rigId": { "type": "string", "const": "arven_mannequin_unisex_v1" },
        "skeletonVersion": { "type": "string" },
        "slot": { "type": "string", "enum": ["top", "bottom", "outerwear", "footwear", "accessory"] },
        "anchor": { "type": "string" },
        "incompatibleSlots": { "type": "array", "items": { "type": "string" } }
      }
    },
    "provenance": {
      "type": "object",
      "required": ["modelAuthor", "modelLicense", "textureLicense", "hdriLicense"],
      "properties": {
        "modelAuthor": { "type": "string" },
        "modelLicense": { "type": "string" },
        "textureLicense": { "type": "string" },
        "hdriLicense": { "type": "string" }
      }
    }
  }
}
```

---

## 4. Performance Budgets & GPU Resource Lifecycle

### 4.1 Hard Budgets (Blueprint Section 13.6)

| Budget Category | Target Budget | Measurement & Enforcement |
|---|---|---|
| **Desktop GLB Size** | `2 – 8 MB` (`<= 10 MB` hard cap) | Enforced by `3d-assets` BullMQ validator before `READY` |
| **Mobile `lite` GLB Size** | `<= 2.5 MB` (`<= 3.5 MB` hard cap) | Served when viewport `< 768px`, `navigator.connection?.saveData === true`, or low-tier GPU detected |
| **Immediate Poster (`poster.webp`)** | `< 150 KB`, LCP-friendly | Rendered immediately in SSR HTML via responsive image pipeline (`0` WebGL dependency, explicit `aspect-[3/4]` for `0.00` CLS) |
| **Route JS Isolation** | `0 KB` 3D JS on Catalog/Cart/Checkout | Verified via Next.js bundle analyzer (`next experimental-analyze` / `@next/bundle-analyzer`) |
| **Render Loop & DPR** | `frameloop="demand"` (Product Viewer); `dpr` capped `[1, 2]` desktop / `[1, 1.5]` mobile | Product Viewer renders zero frames while idle; `invalidate()` triggers only on camera orbit, resize, preset update, or camera reset |
| **Showroom Scene Loading** | Zone-by-zone lazy chunks (`<= 6 MB` per active zone) | Baked lightmaps instead of dynamic multi-shadow lights; frustum/occlusion culling; preload only active zone + immediate portal target |

### 4.2 Strict GPU Resource Disposal Protocol (Three.js r186 + R3F 9)

WebGL memory leaks cause mobile Safari/Chrome tab reloads after 3–5 product inspections. All 3D scenes MUST enforce explicit teardown:

1. **Renderer Ownership:** Omit manual `THREE.WebGLRenderer` instantiation where possible and let R3F 9 manage `<Canvas>` renderer creation so R3F automatically disposes the renderer and releases its WebGL context on unmount.
2. **`ResourceTracker` on Every Loaded GLTF/Preset:**
   - Every dynamically loaded GLB scene tree, cloned mesh, procedural geometry, runtime-swapped `Material`, `Texture` (across standard material maps AND custom shader `uniforms`), and `WebGLRenderTarget` MUST be registered with a per-mount `ResourceTracker` (following Three.js `cleanup` guidance).
   - On model swap (e.g., switching Outfit Studio garments or navigating between PDPs) and on component unmount:
     1. Detach `Object3D` from parent scene.
     2. Dispose all tracked `BufferGeometry`, `Material`, and `Texture` instances via `.dispose()`.
     3. Clear `GLTFLoader` / `useGLTF` cache keys for unmounted product models so stale textures do not accumulate indefinitely in RAM.
     4. Dispose dedicated `DRACOLoader` and `KTX2Loader` worker pools when leaving 3D route families.
   - Any intentionally shared asset (such as a neutral studio HDRI reused across Outfit Studio swaps) MUST reside inside `<group dispose={null}>` with explicit reference-counted disposal when the `/outfit-studio` or `/showroom` route unmounts.
3. **Verification Gate:** Phase 07/08 QA MUST run an automated Playwright scenario opening/closing 10 consecutive 3D product models and swapping 10 presets while asserting `gl.info.memory.geometries` and `gl.info.memory.textures` return to baseline without unbounded monotonic growth or console WebGL warnings.

---

## 5. Accessibility, Fallback & Outfit Studio Guardrails

### 5.1 WebGL Unavailable, Context Loss & Asset Failure Fallbacks

- **No-WebGL Fallback (`<Canvas fallback={...}>`):**
  - If WebGL initialization fails (headless browser, disabled hardware acceleration, restricted WebView), `<Canvas fallback={<StaticGalleryFallback />}>` seamlessly displays the product `poster.webp` and full multi-angle 2D image gallery.
  - All variant selectors, size guide, Add to Bag, and Checkout actions operate identically.
- **Asset Load / Network Error:**
  - Display crisp `poster.webp`, log anonymized telemetry (`assetId`, `version`, `errorCode`, `connectionType`, `deviceTier`, zero PII), and provide an accessible `"Muat Ulang Model 3D"` / `"Retry 3D View"` action.
- **WebGL Context Loss Recovery (`webglcontextlost` / `webglcontextrestored`):**
  - Inside `<Canvas onCreated={({ gl }) => ...}>`:
    - Bind `webglcontextlost` with `event.preventDefault()`, freeze user-facing 3D controls into a `"Memulihkan tampilan 3D..."` state, and retain `selectedVariantId`, `activePresetId`, and `outfitSlots` in React/URL state outside the Canvas.
    - On `webglcontextrestored`, re-initialize `KTX2Loader.detectSupport(gl)`, re-apply the customer's preserved preset/camera view, and announce restoration via `aria-live="polite"`.
    - If context does not restore within `3000ms` or loses context twice in one session, automatically degrade cleanly to the 2D static gallery with an informative banner.

### 5.2 Keyboard Navigation, Touch Scroll Isolation & Reduced Motion

1. **Keyboard Controls (`R-32`):**
   - `<Canvas>` itself does not trap `Tab` focus. Users reach `<AccessibleProductControls>` cleanly in DOM order:
     - `Mode Toggle` (`Foto 2D` / `Model 3D`)
     - `Color / Material Presets` (semantic radio group with visible color name labels)
     - `Camera Step Buttons` (`Putar Kiri 45°`, `Putar Kanan 45°`, `Perbesar`, `Perkecil`, `Reset Tampilan`)
     - `Lewati Tampilan 3D` skip link jumping directly past the viewer to Variant Selection & Add to Bag.
   - Focusing the canvas wrapper allows Arrow keys (`Left/Right/Up/Down`) to orbit and `+`/`-` to zoom, while `Tab` exits cleanly to the next interactive control.
2. **Touch Scroll Isolation (`R-03`):**
   - On mobile viewports (`< 768px`), the outer viewer container preserves vertical page scrolling (`touch-action: pan-y`).
   - Product Viewer activates orbit gesture capture ONLY after tapping an explicit `"Putar 3D"` interaction toggle or when the pointer starts cleanly inside the compact bounded viewer card (never full-bleed `100vh` scroll hijack!).
   - Virtual Showroom provides explicit on-screen directional/zone jump buttons (`44x44px` tap targets) alongside touch look/orbit so mobile users can move between zones without two-finger drag confusion.
3. **Reduced Motion (`prefers-reduced-motion: reduce`):**
   - Disable automatic turntable rotation completely.
   - Disable damped camera glide interpolation (`enableDamping = false` / instant deterministic camera snaps on preset button activation).
   - Suppress ambient floating particles, pulsing hotspot beacons, or decorative camera drift in Virtual Showroom.

### 5.3 Outfit Studio Guardrails (`FR-014`, Blueprint Section 13.8)

1. **Fixed Mannequin Contract:**
   - Release v1 supports one standardized unisex mannequin rig (`rigId: "arven_mannequin_unisex_v1"`, `skeletonVersion: "1.0.0"`).
   - Every garment GLB usable in Outfit Studio MUST declare `outfitCompatibility` (`rigId`, `skeletonVersion`, `slot`, `anchor`, and `incompatibleSlots`) in its validated manifest.
2. **Strict Slot & Layer Compatibility Validation:**
   - Supported slots: `top`, `bottom`, `outerwear`, `footwear`, `accessory`.
   - Enforced both in UI (preventing invalid combinations with an inline accessible explanation, e.g., `"Overshirt ini tidak kompatibel dengan jaket luar yang sedang aktif"`) and server-side when saving (`POST /outfit-scenes`).
3. **Honest Product Claims (`R-36`):**
   - Outfit Studio displays a permanent concise disclosure note: *"Pratinjau gaya visual menggunakan manekin standar. Periksa Panduan Ukuran untuk detail ukuran fisik."* It MUST NEVER claim personalized body measurements, garment drape simulation, or size-fit prediction.
4. **Authoritative Pricing & Persistence Boundary:**
   - Saved outfits (`outfit_scenes`) store ONLY `{ outfitId, rigId, slots: [{ slot, productId, variantId, presetId }] }`.
   - Whenever an Outfit Studio scene loads or a customer clicks `"Tambah Item ke Tas"`, the frontend requests live availability and IDR prices from the backend catalog/cart APIs; stale or out-of-stock variants are flagged explicitly rather than added at cached prices.

---

## 6. Automated & Manual Verification Gates (Phases 07–09)

1. **Upload Security & Validation Test:** Malformed `.glb`, renamed `.exe`/`.html`, oversized `> 10 MB` upload, or GLB missing required `materialSlots` MUST transition to `FAILED` in `3d-assets` worker and NEVER become `PUBLISHED`/`READY`.
2. **Non-WebGL Commerce Test:** Playwright suite with WebGL disabled (`--disable-webgl`) MUST browse PDP, select color/size variant, add to cart, apply coupon, and reach Checkout payment creation with zero JS uncaught exceptions.
3. **Memory Leak & Disposal Audit:** Repeated PDP navigation + 10 preset swaps MUST keep `renderer.info.memory.geometries` and `textures` flat after unmount.
4. **Bundle Isolation Audit:** Build output for `/`, `/shop`, `/cart`, and `/checkout` MUST contain zero references to `three`, `@react-three/fiber`, or `@react-three/drei`.
5. **13-Profile Responsive & Touch Audit:** Verify PDP 3D viewer, Virtual Showroom hotspots, and Outfit Studio slot controls across all 13 Playwright viewports (`320px` through `1920px`) plus `prefers-reduced-motion: reduce`.
