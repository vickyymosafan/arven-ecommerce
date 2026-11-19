# ARVEN Phase 07 Typography, Color & Motion QA Report

> **Harness Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Task ID:** `a89f99e4-5130-41b4-87cb-e064033632f8`  
> **Checkpoints Audited:** `typography-color` & `motion`  
> **Independent Verifier:** `design-qa-agent`  
> **Initial Audit Window (UTC):** `2026-11-18T19:14:54Z` – `2026-11-18T19:29:01Z` (`FAIL` — `DEFECT-P7-TC-01..03`, `DEFECT-P7-MT-01`)  
> **Repair Iteration 2 Re-Verification (UTC):** `2026-11-18T19:40:53Z` – `2026-11-18T19:41:23Z`  
> **Live Rebuilt Builds Audited (Repair Iteration 2):**  
> - Storefront (`http://localhost:3000`): `BUILD_ID = BA0BbwlrTPzeDXz72cRIk` (`apps/storefront/.next/static/chunks/25owd8k_9m5p1.css`)  
> - Admin (`http://localhost:3001`): `BUILD_ID = -E5yDvh8yP87Gm1-5cHdL` (`apps/admin/.next/static/chunks/356bqp08w2xpy.css`)  
> - API (`http://localhost:4000`): Live (`PostgreSQL 18` + `Memurai/Redis`)  
> **Browser Engine:** Playwright Chromium `1248` (`D:\ms-playwright\chromium-1248\chrome-win64\chrome.exe`, headless; WebGL 2.0 via `--use-gl=angle --use-angle=swiftshader --enable-webgl --ignore-gpu-blocklist`, plus separate `--disable-webgl --disable-webgl2 --disable-3d-apis` instance for fallback checks)  
> **Viewports Audited:** `1280x800` & `375x812`  
> **Final Checkpoint Verdicts (Post-Repair Iteration 2):**  
> - **`typography-color`: `PASS`**  
> - **`motion`: `PASS`**

---

## 1. Executive Summary & Repair Closure

Independent live browser re-verification after **Repair Iteration 2** across Storefront PDPs (`atelier-boxy-wool-overshirt`, `essentials-heavyweight-crew-tee`, `movement-minimalist-leather-sneaker` in `2D`, `Model 3D`, and `--disable-webgl` fallback at `1280x800` & `375x812`), Admin (`/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7` in Dark & Light modes + `Preview 3D QA` modal, authenticated via live TOTP MFA `owner.dev@arven.local` and signed out cleanly with `/api/v1/auth/me -> 401`), and Motion / `prefers-reduced-motion: reduce` confirms **PASS** for both **`typography-color`** and **`motion`**:

| Defect ID | Initial Finding (`nvuShbP1qGRRdLkauDvtM` / `LsU5Qdu5Bg-Ht0xSNk8kM`) | Repair Iteration 2 Verification (`BA0BbwlrTPzeDXz72cRIk` / `-E5yDvh8yP87Gm1-5cHdL`) | Status |
|---|---|---|---|
| **DEFECT-P7-TC-01** | Dark 3D stage `:focus-visible` fell back to `#1F4E79` (`2.03:1` < `3.0:1`) on Storefront and Light Admin `Preview 3D QA` modal. | Compiled CSS bundles include `focus-visible:outline-[#82B0DC]` and containers carry `data-theme="dark"`. Measured `t=0ms` focus ring on `Depan` & `Muat Ulang Model 3D` = `rgb(130, 176, 220)` (`#82B0DC`, **`7.72:1`** on `#17191B`) across Storefront, WebGL Fallback, Dark Admin, and Light Admin. | **CLOSED** |
| **DEFECT-P7-TC-02** | Missing `@source` for `packages/three-engine/src` excluded `border-[#C5A572]`, `border-[#9E9C92]`, `bg-[#35383A]`, `hover:bg-[#35383A]`, `hover:bg-[#46494C]`, `bg-[#17191B]/95`, `bottom-0`, `inset-x-0`, clipping the WebGL fallback overlay (`bottom: -149px`) and collapsing Admin modal 3D active/HUD styles. | `missingClasses: []` in both Storefront (`25owd8k_9m5p1.css`) and Admin (`356bqp08w2xpy.css`). Storefront & Admin 3D stages render `#C5A572` active borders, `#35383A` active fill, `#9E9C92` inactive borders, and `#C5A572` `3D STUDIO · v0001` HUD badges. `--disable-webgl` overlay sits inside container (`bottom: 0px`, `overlayInsideContainer: true`, `rgba` `0.95` `#17191B` scrim). | **CLOSED** |
| **DEFECT-P7-TC-03** | `font-variant-numeric` evaluated to `normal` on Storefront 3D footer metrics, version badges, and SKUs. | `font-variant-numeric: tabular-nums` + `IBM Plex Mono` verified live across Storefront IDR prices, compare-at price, SKUs, stock counters, `Studio 3D v0001`, `3D STUDIO · v0001`, `Proporsi default: ... tri \| ... KB`, and Admin SKU, price, stock, `v0001`, bytes, and triangles. | **CLOSED** |
| **DEFECT-P7-MT-01** | `hover` on `Depan` produced zero change (`#17191B`); `transition-colors` delayed `outline-color` by `150ms`. | `AccessibleProductControls` and fallback buttons use `transitionProperty: "background-color, border-color, color"`, yielding instant **`0ms`** `:focus-visible` outline (`#82B0DC` at `t=0ms`), crisp hover (`#17191B` -> `#35383A` on `Depan`/`Kembali ke Foto 2D`, `#35383A` -> `#46494C` on `Muat Ulang Model 3D`), and crisp active `#35383A` + `#C5A572` styling. | **CLOSED** |

---

## 2. Typography & Self-Hosted Font Verification

### 2.1 `document.fonts`, External CDN & Compiled CSS Audit

| Application & View | Loaded `document.fonts` Families & Weights | Font Network Requests | `JetBrains Mono` | External CDN (`fonts.googleapis.com` / `fonts.gstatic.com`) | Compiled CSS Missing 3D Utilities |
|---|---|---|---|---|---|
| **Storefront** (`3` PDPs @ `1280x800` & `375x812`) | `Cormorant Garamond` (`400`, `500`), `Plus Jakarta Sans` (`400`, `500`, `600`), `IBM Plex Mono` (`400`, `500`) | Same-origin (`http://localhost:3000/_next/static/media/...`) | **`0`** (`0` CSS, `0` `document.fonts`) | **`0`** | **`0`** (`missingClasses: []`) |
| **Admin** (`/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7` Dark & Light + Modal) | `Cormorant Garamond` (`400`, `500`), `Plus Jakarta Sans` (`400`, `500`, `600`), `IBM Plex Mono` (`400`, `500`) | Same-origin (`http://localhost:3001/_next/static/media/...`) | **`0`** (`0` CSS, `0` `document.fonts`) | **`0`** | **`0`** (`missingClasses: []`) |

### 2.2 Storefront PDP Typography & `tabular-nums` Matrix (Post-Repair)

| Product (`slug`) | Element | Rendered Sample | Computed `font-family` | Size / Weight | `font-variant-numeric` | Status |
|---|---|---|---|---|---|---|
| `atelier-boxy-wool-overshirt` | `h1` Title (`1280` / `375`) | `Atelier Boxy Wool Overshirt` | `Cormorant Garamond, ...` | `36px` / `30px`, `400` | `normal` | `PASS` |
| `atelier-boxy-wool-overshirt` | IDR Price | `Rp 899.000` | `IBM Plex Mono, ...` | `24px`, `500` | **`tabular-nums`** | `PASS` |
| `atelier-boxy-wool-overshirt` | SKU Readout | `SKU: ARV-OUT-001` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| `atelier-boxy-wool-overshirt` | Stock Counter (`Qty`) | `Max 10 per order (12 available)` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| `atelier-boxy-wool-overshirt` | Header 3D Badge | `Studio 3D v0001` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| `atelier-boxy-wool-overshirt` | Canvas HUD Badge | `3D STUDIO · v0001` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| `atelier-boxy-wool-overshirt` | 3D Footer Metrics | `Proporsi default: 132 tri \| 9.7 KB` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| `essentials-heavyweight-crew-tee` | IDR Price & Compare-At | `Rp 299.000` / `Original price: Rp 349.000` | `IBM Plex Mono, ...` | `24px` (`500`) / `14px` (`400`) | **`tabular-nums`** | `PASS` |
| `essentials-heavyweight-crew-tee` | SKU & Stock Counter | `SKU: ARV-TOP-001` / `Max 10 per order (25 available)` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| `essentials-heavyweight-crew-tee` | Badges & 3D Footer | `Studio 3D v0001` / `3D STUDIO · v0001` / `60 tri \| 5.9 KB` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| `movement-minimalist-leather-sneaker` | IDR Price | `Rp 1.299.000` | `IBM Plex Mono, ...` | `24px`, `500` | **`tabular-nums`** | `PASS` |
| `movement-minimalist-leather-sneaker` | SKU & Stock Counter | `SKU: ARV-FW-001` / `Max 10 per order (10 available)` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| `movement-minimalist-leather-sneaker` | Badges & 3D Footer | `Studio 3D v0001` / `3D STUDIO · v0001` / `156 tri \| 10.9 KB` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |

### 2.3 Admin Typography & `WIB` Timestamp Measurements (`/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7`)

| Admin Element | Rendered Sample | Computed `font-family` | Size / Weight | `font-variant-numeric` | Status |
|---|---|---|---|---|---|
| Variant `SKU` | `ARV-OUT-001` | `IBM Plex Mono, ...` | `12px`, `500` | **`tabular-nums`** | `PASS` |
| Variant `Price (IDR)` | `Rp 899.000` | `IBM Plex Mono, ...` | `12px`, `500` | **`tabular-nums`** | `PASS` |
| Variant `Stock` | `12 / 0 / 12` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| 3D Asset Version Tag | `v0001` | `IBM Plex Mono, ...` | `14px`, `600` | **`tabular-nums`** | `PASS` |
| 3D Asset Bytes & Triangles | `9,924 B` / `132 tri / 264 vtx` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| Modal HUD Version Badge | `3D STUDIO · v0001` | `IBM Plex Mono, ...` | `12px`, `400` | **`tabular-nums`** | `PASS` |
| `WIB` Timestamps Line | `Published timestamp: 14 Nov 2026, 23:47 WIB \| Updated: 19 Nov 2026, 00:43 WIB` | `Plus Jakarta Sans, ...` | `12px`, `400` | `normal` | `PASS` |

---

## 3. WCAG 2.2 Color Contrast, Focus Rings & Theme Polarity Audit

### 3.1 Storefront PDP: Light Commerce, Dark 3D Stage & `--disable-webgl` Fallback

| Surface / Element | Computed FG | Computed BG | Text Ratio | Border / Focus Ring | Border/Ring Ratio | Verdict |
|---|---|---|---|---|---|---|
| **Light PDP:** `h1`, Price, Prose, `SKU:`, `Studio 3D v0001` | `#17191B` / `#35383A` / `#5E5C54` | `#F8F7F3` (Ivory) | **`16.44:1`** / **`11.02:1`** / **`6.25:1`** | N/A | N/A | `PASS` |
| **Light PDP:** `Mode Toggle` (`Foto 2D` active / `Model 3D` inactive) | `#F8F7F3` / `#5E5C54` | `#17191B` / `#E9E4DA` | **`16.44:1`** / **`5.29:1`** | `#17191B` (`16.44:1`) / `#747269` (`4.50:1`) | **`4.50:1+`** | `PASS` |
| **Light PDP:** `Preset Radio` (active / inactive) & CTAs | `#17191B` / `#35383A` / `#F8F7F3` | `#E9E4DA` / `#FFFFFF` / `#17191B` | **`11.81:1`**–**`16.44:1`** | `#17191B` (`16.44:1`) / `#747269` (`4.50:1`) | **`4.50:1+`** | `PASS` |
| **Dark 3D Stage (`data-theme="dark"`):** HUD `3D STUDIO · v0001` | `#C5A572` | `#17191B` (`0.9` scrim) | **`7.55:1`** | `#46494C` (decorative) | `1.95:1` | `PASS` |
| **Dark 3D Stage:** HUD Preset (`Obsidian` / `Charcoal` / `Cream`) | `#F8F7F3` | `#17191B` (`0.9` scrim) | **`16.44:1`** | `#46494C` (decorative) | `1.95:1` | `PASS` |
| **Dark 3D Stage:** Camera Active (`Tiga Perempat`) | `#F8F7F3` | `#35383A` | **`11.02:1`** | **`#C5A572`** vs `#17191B` | **`7.55:1`** | `PASS` |
| **Dark 3D Stage:** Camera Inactive (`Depan`), Step & Touch Gate | `#F8F7F3` | `#17191B` | **`16.44:1`** | **`#9E9C92`** vs `#17191B` | **`6.40:1`** | `PASS` |
| **Dark 3D Stage:** `Tier:` & `Proporsi default:` Footer | `#B2B0A6` | `#17191B` | **`8.10:1`** | N/A | N/A | `PASS` |
| **Dark 3D Stage:** `Render sesuai kebutuhan (demand)...` Footer | `#C5A572` | `#17191B` | **`7.55:1`** | N/A | N/A | `PASS` |
| **Dark 3D Stage:** `Depan` `:focus-visible` (`t=0ms`) | N/A | `#17191B` | N/A | **`#82B0DC`** (`2px`, `2px` offset) | **`7.72:1`** | `PASS` |
| **WebGL Fallback (`--disable-webgl`):** Overlay Positioning (`1280` & `375`) | `#F8F7F3` / `#B2B0A6` | `#17191B` (`0.95` scrim, `bottom: 0px`) | **`16.44:1`** / **`8.10:1`** | `overlayInsideContainer: true` (`top >= fb.top`, `bottom <= fb.bottom`) | N/A | `PASS` |
| **WebGL Fallback:** `Muat Ulang Model 3D` Button | `#F8F7F3` | `#35383A` (`hover: #46494C`) | **`11.02:1`** | `#C5A572` (`7.55:1`), focus **`#82B0DC`** (`7.72:1` at `0ms`) | **`7.55:1+`** | `PASS` |
| **WebGL Fallback:** `Kembali ke Foto 2D` Button | `#F8F7F3` | `#17191B` (`hover: #35383A`) | **`16.44:1`** | `#9E9C92` (`6.40:1`) | **`6.40:1`** | `PASS` |

### 3.2 Admin Dark & Light Contrast Audit (`/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7` & `Preview 3D QA` Modal)

| Admin Element | Dark Mode (`FG` / `BG` -> Ratio) | Light Mode (`FG` / `BG` -> Ratio) | Verdict |
|---|---|---|---|
| `h1`, Variant `SKU` / `Price` / `Stock`, `WIB` Timestamps | `#F8F7F3` on `#17191B` (`16.44:1`); `#B2B0A6` on `#35383A` (`5.43:1`) | `#17191B` on `#F8F7F3` (`16.44:1`); `#5E5C54` on `#FFFFFF` (`6.70:1`) | `PASS` |
| Version `v0001`, Bytes/Tri, `Validation PASSED`, Preset Form | `11.02:1` / `5.43:1` / `6.58:1` / `14.37:1` | `13.91:1` / `5.29:1` / `5.21:1` / `15.33:1` | `PASS` |
| Modal `3D STUDIO · v0001` (`data-theme="dark"`) | `#C5A572` on `#17191B` -> **`7.55:1`** (border `#46494C`) | `#C5A572` on `#17191B` -> **`7.55:1`** (border `#46494C`) | `PASS` |
| Modal Active Camera (`Tiga Perempat`) | `#F8F7F3` on `#35383A` (**`11.02:1`**), border **`#C5A572`** (`7.55:1`) | `#F8F7F3` on `#35383A` (**`11.02:1`**), border **`#C5A572`** (`7.55:1`) | `PASS` |
| Modal Inactive Camera (`Depan`) & Hover | `#F8F7F3` on `#17191B` (**`16.44:1`**), border **`#9E9C92`** (`6.40:1`), hover **`#35383A`** | `#F8F7F3` on `#17191B` (**`16.44:1`**), border **`#9E9C92`** (`6.40:1`), hover **`#35383A`** | `PASS` |
| Modal `Depan` `:focus-visible` (`t=0ms`) | **`#82B0DC`** on `#17191B` -> **`7.72:1`** | **`#82B0DC`** on `#17191B` -> **`7.72:1`** | `PASS` |

*(Non-blocking polish observation: On the Storefront light-mode Mode Toggle buttons `Foto 2D` / `Model 3D` in `apps/storefront/src/components/catalog/product-detail-view.tsx`, `transition-colors` still includes `outline-color`, transitioning focus outline from `rgb(94, 92, 84)` `#5E5C54` `6.25:1` to `rgb(31, 78, 121)` `#1F4E79` `8.08:1` over `150ms`; both endpoints and every interpolated state exceed `3.0:1`, while all Dark 3D Stage controls now render `#82B0DC` at `0ms`.)*

---

## 4. Anti-Slop Governance & Session Cleanliness Scans

Across all `6` Storefront PDP runs (`2D` & `3D`), all `6` WebGL Fallback runs, and all `4` Admin scans (`Dark`, `Dark Modal`, `Light`, `Light Modal`):

- **Contrast Failures (`< 4.5:1` normal / `< 3.0:1` large):** **`0`** across every run.
- **`#8B897F` (`rgb(139, 137, 127)`) Light-Surface Normal Text Violations:** **`0`** across every run.
- **Forbidden Pink / Magenta Hues:** **`0`** across every run.
- **Em Dashes (`\u2014`):** **`0`** across every run.
- **Uncaught `pageerror`s & External Font Requests:** **`0`** across every run.
- **Admin Sign-Out Verification:** Logged in via live TOTP MFA (`owner.dev@arven.local`, `totpTimeStepUsed: 59834362`), clicked `Sign Out` -> redirected to `http://localhost:3001/login`, and verified `GET /api/v1/auth/me` returned **`401`**.

---

## 5. Motion & `prefers-reduced-motion: reduce` Verification (Post-Repair)

| Mode & Check | Measured Result | Verdict |
|---|---|---|
| **Default (`no-preference`):** `frameloop` & `loadState` | `frameloop: "demand"`, `loadState: "ready"`, `reducedMotion: false` | `PASS` |
| **Default (`no-preference`):** Idle `requestAnimationFrame` (`1500ms` after settle) | **`0` callbacks (`0.0` fps idle GPU/RAF)** | `PASS` |
| **Default (`no-preference`):** Dark 3D `:focus-visible` Timing (`Depan` & `Muat Ulang Model 3D`) | `transitionProperty: "background-color, border-color, color"`; `t=0ms` `outlineColor` immediately `rgb(130, 176, 220)` (`#82B0DC`, `2px`, `2px` offset) | `PASS` |
| **Default (`no-preference`):** Dark 3D `:hover` (`Depan`) | `matchesHover: true` -> `rgb(23, 25, 27)` -> **`rgb(53, 56, 58)`** (`#35383A`) across `1280x800` & `375x812` on all 3 products | `PASS` |
| **Reduced-Motion (`reduce`):** Media Query & CSS Collapse | `matchMedia('(prefers-reduced-motion: reduce)').matches === true`, `--duration-fast: .01ms`, `--duration-editorial: .01ms`, `scrollBehavior: "auto"` | `PASS` |
| **Reduced-Motion (`reduce`):** Diagnostics & Badge | `window.__ARVEN_3D_DIAGNOSTICS__.reducedMotion === true`, `'Gerak Dikurangi'` visible (`"Tier: Studio Default · Gerak Dikurangi"`) | `PASS` |
| **Reduced-Motion (`reduce`):** Idle `requestAnimationFrame` (`1500ms`) | **`0` callbacks** (zero idle turntable spin) | `PASS` |
| **Reduced-Motion (`reduce`):** `Depan` Snap + Accessibility States | `cameraPreset: "front"`, `aria-pressed: "true"`, active `bg: rgb(53, 56, 58)` + `border: rgb(197, 165, 114)`, hover `rgb(53, 56, 58)`, focus `t=0ms` `rgb(130, 176, 220)` (`#82B0DC`), `13535 B` snap **`identicalAfter500ms: true`** | `PASS` |
| **Reduced-Motion (`reduce`):** `Belakang` Snap + Accessibility States | `cameraPreset: "back"`, `aria-pressed: "true"`, active `rgb(53, 56, 58)` + `rgb(197, 165, 114)`, hover `rgb(53, 56, 58)`, focus `t=0ms` `rgb(130, 176, 220)`, `11618 B` snap **`identicalAfter500ms: true`** | `PASS` |
| **Reduced-Motion (`reduce`):** `Detail` Snap + Accessibility States | `cameraPreset: "detail"`, `aria-pressed: "true"`, active `rgb(53, 56, 58)` + `rgb(197, 165, 114)`, hover `rgb(53, 56, 58)`, focus `t=0ms` `rgb(130, 176, 220)`, `14964 B` snap **`identicalAfter500ms: true`** | `PASS` |
| **Reduced-Motion (`reduce`):** Distinct Camera Views | `depanVsBelakang: true`, `depanVsDetail: true`, `belakangVsDetail: true` | `PASS` |
