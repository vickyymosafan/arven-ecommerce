# ARVEN: Phase 08 Design, Experience, Accessibility & Responsive Contract

> **Phase:** Phase 08 (`FR-013` Virtual Showroom & `FR-014` Outfit Studio, Priority `P1`)  
> **Harness Plan ID:** `902c7aba-7aeb-406d-9ebb-2edefdc9108f`  
> **Task ID:** `f6ff029a-59a1-4b54-a7f1-a018c788ca52` (`design-lead`)  
> **Governing Baselines:** [`DESIGN.md`](../DESIGN.md), [`docs/THREE_D_PIPELINE.md`](./THREE_D_PIPELINE.md), [`docs/PHASE_08_PLAN.md`](./PHASE_08_PLAN.md), [`docs/PHASE_07_DESIGN_CONTRACT.md`](./PHASE_07_DESIGN_CONTRACT.md), and [`packages/ui/src/styles/tokens.css`](../packages/ui/src/styles/tokens.css)

---

## 1. Scope & Architectural Design Philosophy

Phase 08 delivers ARVEN's spatial and styling experiences while preserving strict **commerce-first resilience** and **visual restraint** (`ENERGY 2 / RHYTHM 3 / MOTION 2` on Storefront; `ENERGY 1 / RHYTHM 1 / MOTION 1` on Admin):

1. **Storefront `/showroom` (`FR-013`):** Architectural Dark Showcase gallery stage (`data-theme="dark"`) with zone-by-zone lazy loading (max 2 resident zones), accessible product hotspots opening an accessible Quick-Card dialog/drawer, and a clean transition below the stage into the Editorial Light (`data-theme="light"`) curated catalog and footer.
2. **Storefront `/outfit-studio` (`FR-014`):** Split editorial workspace pairing a Dark Showcase 3D Mannequin Stage (`data-theme="dark"`) for standardized rig `arven_mannequin_unisex_v1` with an Ivory/Cream Editorial Light Slot Picker, Saved Outfits drawer/panel, and permanent visual-preview disclosure.
3. **Storefront `/account/outfits`:** Editorial Light (`data-theme="light"`) 2D-only Saved Outfits management inside `AccountShell` (`0 B` of `three` / `@react-three/*`).
4. **Admin `/experience/showroom` & `/experience/outfit-studio`:** Admin Dark Workspace (`data-theme="dark"`) matching Phase 06/07 `AdminShell` density, table geometry, and RBAC permission gating (`asset.read` vs `asset.publish`).

### Hard Anti-Slop Prohibitions (Phase 08 Gate)
- **Zero Pink Anywhere:** Pink, rose, magenta, and pastel-coral hues (`#FF*`, `#F472B6`, etc.) are forbidden across UI tokens, 3D hotspot markers, compatibility badges, and Admin previews.
- **Zero Em Dashes (`\u2014`):** Never use em dashes in UI copy, headings, status messages, banners, labels, or aria announcements. Use periods, colons, or commas.
- **No `#8B897F` Normal Text on Light Surfaces:** `--color-stone-500` (`#8B897F`) yields `3.27:1` on `#F8F7F3` and `2.77:1` on `#E9E4DA` (FAIL). Always use `--arven-text-muted` (`#5E5C54` Deep Stone) on light surfaces.
- **No Fit or Cloth-Simulation Claims:** Outfit Studio never claims personalized body measurements, virtual tailoring, or garment drape simulation.
- **No Unbounded Ambient Motion:** Zero pulsing hotspot beacons, zero ambient particles, zero continuous turntable/camera drift, and `frameloop="demand"` (`0` idle rAF).

---

## 2. Surface, Theme & WCAG 2.2 AA Contrast Spec

All components MUST consume semantic CSS custom properties (`--arven-*`) from `packages/ui/src/styles/tokens.css` (and `@arven/ui` theme utilities) rather than raw ad-hoc hex literals, except where explicitly scoped to 3D stage accents (`#C5A572` Warm Bronze).

### 2.1 Route Surface & Theme Architecture

| Route | App | Theme Scope | Surface Composition |
|---|---|---|---|
| `/showroom` | `storefront` | Hybrid: Dark Showcase Stage (`data-theme="dark"`) -> Editorial Light Catalog & Footer (`data-theme="light"`) | Stage & HUD controls use `#17191B` canvas / `#222528` subtle / `#35383A` Graphite panels. Transition divider (`1px solid var(--arven-border-hairline)`) leads cleanly into `#F8F7F3` Ivory / `#E9E4DA` Cream zone directory, accessible product grid, and `StorefrontShell` footer. |
| `/outfit-studio` | `storefront` | Split Editorial Workspace: Dark Stage (`data-theme="dark"`) + Editorial Light Controls (`data-theme="light"`) | Left/Top 3D Mannequin Stage scoped to `data-theme="dark"` (`#17191B` / `#35383A`, `aspect-[3/4]` mobile, sticky viewport panel `>= 640px`). Right/Bottom Slot Picker, Garment Selector, Disclosure Banner, Saved Outfits panel, and Add-to-Bag summary rendered on Editorial Light (`#F8F7F3` Ivory canvas, `#E9E4DA` Cream panels, `#FFFFFF` elevated inputs/cards). |
| `/account/outfits` | `storefront` | Editorial Light (`data-theme="light"`) | Inside `AccountShell`: `#F8F7F3` canvas, `#F1EFE9` 2D poster frame well (`aspect-[3/4]`), `#E9E4DA` active nav/summary panels, `#FFFFFF` outfit cards with `1px` hairline borders. Zero 3D canvas or WebGL chunks. |
| `/experience/showroom` | `admin` | Admin Dark (`data-theme="dark"`) | Inside `AdminShell`: `#17191B` canvas, `#222528` table row hover, `#35383A` Graphite cards/table headers/modal previews, `#46494C` hairlines, optional 3D zone preview behind `next/dynamic` `ssr: false`. |
| `/experience/outfit-studio` | `admin` | Admin Dark (`data-theme="dark"`) | Inside `AdminShell`: matching Graphite/Charcoal diagnostic tables for garment compatibility, inline compatibility editor, public preset CRUD, and optional 3D preview behind `next/dynamic` `ssr: false`. |

### 2.2 Verified WCAG 2.2 AA Contrast Pairings

All ratios below are verified via `antislop-contrast:check_contrast` (baseline tokens from `DESIGN.md` §3.4 plus Phase 08 `#C5A572` Dark Showcase pairings verified in this session):

#### A. Dark Showcase & Admin Surfaces (`data-theme="dark"`)

| Role | Foreground | Background | Ratio | AA Verdict | Usage in Phase 08 |
|---|---|---|---|---|---|
| Primary text | `#F8F7F3` (`--arven-text-primary`) | `#17191B` (`--arven-surface-canvas`) | `16.44:1` | PASS | Stage headings, active zone title, admin headings |
| Secondary prose | `#E9E4DA` (`--arven-text-secondary`) | `#17191B` (`--arven-surface-canvas`) | `13.91:1` | PASS | Zone editorial description, Quick-Card subtitle on dark HUD |
| Muted metadata | `#B2B0A6` (`--arven-text-muted`) | `#17191B` (`--arven-surface-canvas`) | `8.10:1` | PASS | Tier readout, triangle/MB telemetry, secondary hints |
| Muted metadata on Graphite | `#B2B0A6` (`--arven-text-muted`) | `#35383A` (`--arven-surface-panel`) | `5.43:1` | PASS | Zone bar captions, admin table metadata, HUD sublabels |
| Primary text on Graphite | `#F8F7F3` (`--arven-text-primary`) | `#35383A` (`--arven-surface-panel`) | `11.02:1` | PASS | Active zone pill label, Quick-Card drawer on dark, admin cards |
| Control border (non-text) | `#9E9C92` (`--arven-border-control`) | `#17191B` / `#35383A` | `6.40:1` / `4.29:1` | PASS (`>= 3.0`) | Default buttons, directional controls, inputs on dark |
| Dark focus ring | `#82B0DC` (`--arven-focus-ring`) | `#17191B` / `#35383A` | `7.72:1` / `5.17:1` | PASS | `2px solid` outline (`2px` offset, `0ms` transition) on all dark controls |
| Warm Bronze accent | `#C5A572` (Dark Showcase Accent) | `#17191B` / `#222528` / `#35383A` | `7.55:1` / `6.60:1` / `5.06:1` | PASS | Active zone border/dot, active hotspot marker ring, active camera mode border |
| Dark Ink on Bronze fill | `#17191B` (Charcoal) | `#C5A572` (Warm Bronze) | `7.55:1` | PASS | Active 3D hotspot numbered badge fill |
| Dark Status (Info / Success / Warning / Danger) | `#82B0DC` / `#89BBA6` / `#E2AE55` / `#E48966` | `#1E2C3A` / `#1E2E28` / `#30281B` / `#35231E` | `6.23` / `6.58` / `7.21` / `5.72` | PASS | Admin compatibility status chips, WebGL context-loss warning, asset/load error banner |

#### B. Editorial Light Surfaces (`data-theme="light"`)

| Role | Foreground | Background | Ratio | AA Verdict | Usage in Phase 08 |
|---|---|---|---|---|---|
| Primary ink | `#17191B` (`--arven-text-primary`) | `#F8F7F3` / `#E9E4DA` / `#FFFFFF` | `16.44` / `13.91` / `17.63` | PASS | Product titles, IDR prices, slot headings, disclosure text |
| Secondary prose | `#35383A` (`--arven-text-secondary`) | `#F8F7F3` / `#E9E4DA` | `11.02` / `9.32` | PASS | Garment descriptions, preset notes, saved outfit metadata |
| Muted metadata | `#5E5C54` (`--arven-text-muted`) | `#F8F7F3` / `#E9E4DA` / `#FFFFFF` | `6.25` / `5.29` / `6.70` | PASS | Slot helper labels, variant labels, updated timestamps (NEVER `#8B897F`) |
| Control border (non-text) | `#747269` (`--arven-border-control`) | `#F8F7F3` / `#E9E4DA` / `#FFFFFF` | `4.50` / `3.81` / `4.82` | PASS (`>= 3.0`) | Radio cards, input borders, secondary Cream button borders |
| Light focus ring & links | `#1F4E79` (`--arven-focus-ring`) | `#F8F7F3` / `#E9E4DA` / `#FFFFFF` | `8.08` / `6.84` / `8.66` | PASS | `2px solid` outline (`2px` offset, `0ms` transition), PDP & Size Guide links |
| Light Status (Info / Success / Warning / Danger) | `#1F4E79` / `#416B59` / `#875B12` / `#9C3D3D` | `#E6EEF5` / `#E8F0EC` / `#F3ECE0` / `#F5EAE8` | `7.39` / `5.21` / `5.06` / `5.66` | PASS | Disclosure banner (`info`/`neutral`), added-to-bag (`success`), stale variant (`warning`), incompatible garment (`danger`) |

### 2.3 Focus Ring Contract (`0ms` Transition)

Every interactive control in both Dark Showcase and Editorial Light themes MUST render an immediate focus ring with zero animation lag:

```css
:focus-visible {
  outline: 2px solid var(--arven-focus-ring); /* #1F4E79 light | #82B0DC dark */
  outline-offset: 2px;
  transition-property: background-color, border-color, color;
  transition-duration: var(--duration-fast);
  /* outline itself transitions in 0ms (--duration-instant) */
}
```

`outline: none` without an explicit `:focus-visible` replacement is strictly forbidden.

---

## 3. Typography, Numerics & Copy Governance

### 3.1 Self-Hosted Font Stack

Matches `apps/storefront/src/app/layout.tsx`, `apps/admin/src/app/layout.tsx`, and `packages/ui/src/styles/theme.css` (all self-hosted at build time via `next/font/google`, zero external runtime font network calls, `display: 'swap'`):

| Role | Token | Font Family | Fallback | Phase 08 Usage |
|---|---|---|---|---|
| **Display Serif** | `--font-display` | `Cormorant Garamond` (`400`, `500`, `600`) | `Georgia, "Times New Roman", serif` | `/showroom` H1, zone titles, `/outfit-studio` H1, `/account/outfits` H1, Quick-Card product title |
| **UI & Body Sans** | `--font-sans` | `Plus Jakarta Sans` (`400`, `500`, `600`, `700`) | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | All controls, slot selectors, banners, disclosure text, descriptions, Admin tables *(repo standard per `DESIGN.md` §4.1; replaces generic Inter)* |
| **Identifier Mono** | `--font-mono` | `IBM Plex Mono` (`400`, `500`) | `ui-monospace, SFMono-Regular, Menlo, monospace` | Zone codes (`atrium-entrance`), rig ID (`arven_mannequin_unisex_v1`), SKU codes (`ARV-OUT-002`), byte payloads (`2.14 MB`), triangle counts (`18.420 tris`), asset version tags (`v0001`) |

### 3.2 `tabular-nums` & `formatIDR()` Rules

- **`tabular-nums` (`font-variant-numeric: tabular-nums`):** Mandatory on every IDR price, `"Mulai Rp..."` showroom quick-card price, outfit live subtotal, slot occupancy counter (`3 / 5`), hotspot counter (`2 / 2`), saved outfit quota counter (`1 / 50`), payload MB/KB readouts, triangle counts, and bag item quantities.
- **Deterministic IDR Formatting:** Always use `formatIDR(amount)` from `@arven/ui` (never inline `toLocaleString`). Produces `Rp499.000`, `Rp1.299.000` identically across SSR and client hydration.
- **Timestamps:** Render saved-outfit `updatedAt` and admin audit/publication timestamps in `Asia/Jakarta` (`WIB`) via `formatWIB()` from `@arven/ui`.

### 3.3 Tone & Copy Hygiene (Indonesian Primary / Luxury Editorial)

- **Zero em dashes (`U+2014`)** and **zero hype buzzwords** (*"Seamless"*, *"Revolutionary"*, *"Effortless"*, *"AI-Powered"*, *"Virtual Fit"*).
- **Mandatory Permanent Outfit Studio Disclosure:**
  > `"Pratinjau gaya visual menggunakan manekin standar. Periksa Panduan Ukuran untuk detail ukuran fisik."`
  - Must remain visible in the DOM (outside `<canvas>`, never hidden inside an accordion or tooltip) on `/outfit-studio`, paired with a direct accessible link/trigger to size guide details on PDP or inline size reference.
- **Canonical Copy Inventory (Reference Strings):**

| Context | Approved Copy |
|---|---|
| Skip links | `"Lewati Ruang Pamer 3D"` (Showroom), `"Lewati Studio 3D"` (Outfit Studio) |
| Mobile 3D interaction toggle | `"Aktifkan Putar 3D"` (locked to scroll) / `"Kunci Gulir Halaman"` (orbit active) |
| Showroom zone header micro-label | `"Virtual Showroom"` / `"Ruang Pamer ARVEN"` |
| Showroom fallback section heading | `"Katalog Zona Ruang Pamer"` |
| Quick-Card CTA & close | `"Lihat Detail Produk"`, `"Tutup Kartu Produk"` |
| Outfit Studio primary actions | `"Simpan Paduan"` (Save Outfit), `"Tambah Item ke Tas"` (Add Compatible Items to Bag), `"Bersihkan Slot"` (Clear Slot) |
| Guest save prompt | `"Masuk ke akun Anda untuk menyimpan paduan ini secara permanen. Draf saat ini tetap tersimpan pada tautan halaman."` |
| Layer conflict rejection (inline) | `"Kemeja oversized ini tidak kompatibel dengan outerwear yang sedang aktif."` |
| Rig / skeleton mismatch (admin / validation) | `"Aset 3D ini tidak kompatibel dengan manekin standar arven_mannequin_unisex_v1 (v1.0.0)."` |
| WebGL fallback notice | `"Tampilan 3D tidak tersedia pada perangkat ini. Mode poster 2D aktif dan seluruh produk tetap dapat dibeli."` |
| Context loss / recovery | `"Memulihkan tampilan 3D..."` -> on fallback: `"Tampilan 3D dialihkan ke galeri 2D agar penelusuran tetap stabil."` |

---

## 4. Layout Geometry & 13-Profile Responsive Contract

Layouts follow mobile-first progressive reflow with explicit intermediate handling (`640px–1023px`) and hard `1440px` max-width framing (`--container-max`) so `1920px` displays never over-stretch prose (`<= 65ch`) or 3D canvases.

### 4.1 `/showroom` Layout Architecture

1. **Skip Link & Editorial Band Header (`#17191B` Dark Showcase):**
   - Compact header strip (`Virtual Showroom`, active zone title, concise 1–2 line zone description, `"Lewati Ruang Pamer 3D"` skip link targeting `#showroom-catalog-directory`).
   - Quick link to `/outfit-studio` (`"Buka Outfit Studio"`) positioned in the top action row (`min-h-11`).
2. **3D Gallery Stage (`data-theme="dark"`):**
   - **Mobile (`320px–639px`):** `aspect-[4/3]` or `aspect-[3/4]` bounded frame (`min-h-[300px] max-h-[62dvh]`), never `100vh` full-bleed so page scroll remains clear and unobstructed.
   - **Tablet (`640px–1023px`):** `16:10` / `aspect-[16/10]` (`max-h-[68dvh]`).
   - **Desktop (`>= 1024px`):** `aspect-[16/9]` (`max-h-[72dvh]`), centered within `max-w-[var(--container-max)]`.
3. **Zone Navigation & Camera Control Dock (HTML DOM directly beneath `<canvas>`, `data-theme="dark"`):**
   - **Zone Bar (`role="radiogroup"`, `aria-label="Pilih Zona Ruang Pamer"`):** Horizontal wrap on desktop (`>= 768px`), horizontal scrollable/wrapping chip group with full `44x44px` buttons and `>= 8px` gap on `320px–639px` (no clipped text, no fixed width). Includes Portal Jump pills when the active zone declares `portals`.
   - **Directional & Orbit Step Bar:** `Putar Kiri 45°`, `Putar Kanan 45°`, `Perbesar`, `Perkecil`, `Reset Tampilan`, plus mobile-only `"Aktifkan Putar 3D"` / `"Kunci Gulir Halaman"` toggle (`< 768px`).
   - **Accessible Hotspot Strip (DOM mirror of active zone hotspots):** Every active hotspot in the current zone appears as a `44x44px` minimum focusable button (`"1. Heavyweight Crew Tee"`) below the stage so keyboard and screen-reader users reach 100% of hotspots without pointer raycasting.
4. **Hotspot Quick-Card (`<dialog>` / Accessible Drawer):**
   - **Mobile (`< 768px`):** Bottom sheet drawer (`max-h-[82dvh]`, `rounded-t-[var(--radius-md)]`), easy thumb reach.
   - **Desktop (`>= 768px`):** Anchored side drawer or centered compact dialog (`max-w-md`), `1px solid var(--arven-border-control)`, `--shadow-overlay`.
   - **Contents:** `3:4` thumbnail, Product Title (`Cormorant Garamond`), live `"Mulai "` + `formatIDR(fromPriceIdr)` (`tabular-nums`), stock/variant summary, primary CTA `"Lihat Detail Produk"` (`/products/[slug]`), and explicit `44x44px` Close button.
5. **Editorial Light Catalog Fallback & Directory (`#showroom-catalog-directory`, `data-theme="light"`):**
   - Always rendered in SSR HTML below the stage (regardless of WebGL availability) so non-WebGL shoppers and keyboard skip-link users browse curated zone posters and `ProductCard` grids (`1-col` at `320px`, `2-col` at `360px–767px`, `3-col` at `768px–1279px`, `4-col` at `>= 1280px`) identically to `/shop`.

### 4.2 `/outfit-studio` Split Editorial Workspace Architecture

1. **Responsive Grid Structure:**
   - **Mobile (`320px–639px`):** Single-column vertical flow.
     1. Page H1 + Permanent Disclosure Banner (compact, readable without truncation).
     2. Dark Showcase 3D Mannequin Stage (`data-theme="dark"`, `aspect-[3/4]`, capped `max-h-[65dvh]`) + Camera & Mobile Touch Lock Dock directly below stage.
     3. Active Slot Radiogroup (`top`, `bottom`, `outerwear`, `footwear`, `accessory`) + Garment Picker + Variant/Preset Pills + Compatibility Alerts.
     4. Saved Outfits Panel / Drawer trigger + Bag Summary & `"Tambah Item ke Tas"` CTA.
   - **Small Tablet / Split Band (`640px–1023px`):** 2-column split (`grid-cols-12`, 5/7 or 6/6 split at `>= 640px` / `md:` `768px` with `gap-6`) where the Dark Showcase 3D Mannequin Stage becomes **sticky** (`sm:sticky sm:top-20`) at `aspect-[3/4]` within viewport height (`sm:max-h-[calc(100dvh-6rem)]`), paired beside the scrollable Editorial Light Slot Picker.
   - **Desktop (`>= 1024px`):** Asymmetric `5:7` (`lg:grid-cols-12`: 5 cols sticky Dark Showcase Mannequin Stage `aspect-[3/4]` + 7 cols Editorial Light Workspace with Slot Tabs, Garment Cards, Public Presets, Saved Outfits drawer/panel, and Sticky/Bottom Summary Footer).
2. **Slot Occupancy Header:**
   - Displays slot counter in `tabular-nums` (`"Slot Terisi: 3 / 5"`) and active rig badge (`arven_mannequin_unisex_v1` in `--font-mono`).

### 4.3 `/account/outfits` & Admin Experience Pages

- **`/account/outfits` (Storefront):** Uses `AccountShell` (`data-theme="light"`). Responsive 2D card grid (`1-col` `320px–639px`, `2-col` `640px–1023px`, `3-col` `>= 1024px`). Each card shows `3:4` studio/mannequin poster (`poster.svg`), outfit title, slot item summary list with live `formatIDR()` prices (`tabular-nums`), computed live total, WIB `updatedAt`, stale/out-of-stock status chip if flagged by backend, `"Buka di Studio"`, `"Ubah Nama"`, and `"Hapus"` (`44x44px` minimum buttons).
- **`/experience/showroom` & `/experience/outfit-studio` (Admin):** Uses `AdminShell` (`data-theme="dark"`). Decision-first tables wrapped in `overflow-x-auto` with sticky first identifier column on `< 1024px`; inline drawer/panel for editing zone metadata, transition state (`DRAFT -> PUBLISHED -> ARCHIVED`), hotspot coordinates, garment `outfitCompatibility` JSON fields (`slot`, `anchor`, `incompatibleSlots`), and public preset items. Read-only roles (`CONTENT`) see controls disabled or hidden per RBAC (`asset.read` only; `asset.publish` required for mutations).

### 4.4 13-Profile Responsive & Mobile Touch Isolation Verification Matrix

Every Phase 08 route (`/showroom`, `/outfit-studio`, `/account/outfits`, `/experience/showroom`, `/experience/outfit-studio`) MUST pass with zero document horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`):

| # | Width | Viewport Class | Key Phase 08 Layout & Touch Rules |
|---|---|---|---|
| 1 | `320px` | Narrow Mobile Portrait | 1-col stacked stage + controls; IDR prices (`Rp1.299.000`) & slot labels wrap cleanly without clipping; zone/slot chips wrap cleanly; `>= 44x44px` tap targets with `>= 8px` gap |
| 2 | `360px` | Standard Android Portrait | Quick-Card bottom drawer fits cleanly within `100vw`; mobile touch scroll isolation (`touch-action: pan-y`) active by default |
| 3 | `375px` | Standard Compact Mobile | Outfit garment picker renders 2-col compact cards (`gap-3`) or clean 1-col rows with `>= 44x44px` select targets |
| 4 | `390px` | Modern Mobile Portrait | `lite` WebGL tier active; DPR capped `[1, 1.5]`; disclosure banner readable above/below stage without obscuring slot controls |
| 5 | `414px` | Large Mobile Portrait | Camera step controls (`Putar Kiri`, `Putar Kanan`, `Perbesar`, `Perkecil`, `Reset`) wrap cleanly across 2 rows max |
| 6 | `430px` | Plus Mobile Portrait | Stage uses `aspect-[3/4]` / bounded `dvh`, never `100vh` mobile chrome clipping |
| 7 | `768px` | Tablet Portrait | Outfit Studio split layout activates (`sticky` Dark Stage left + Ivory Slot Picker right); Showroom 3-col catalog grid |
| 8 | `844px` | Landscape Mobile / Small Tablet | Sticky Mannequin Stage capped at `max-h-[calc(100dvh-5rem)]` so controls remain reachable; Admin table scrolls inside wrapper only |
| 9 | `1024px` | Tablet Landscape / Small Laptop | Storefront primary nav incl. `Showroom` fits on 1 row without wrap; Admin persistent `240px` sidebar + experience table fit cleanly |
| 10 | `1280px` | Standard Laptop | Outfit Studio `5:7` split; Showroom `16:9` stage + 4-col fallback catalog |
| 11 | `1366px` | Common Laptop | Admin `/experience/outfit-studio` compatibility table + inline inspector panel without clipped action buttons |
| 12 | `1440px` | Reference Studio Desktop | Max container `1440px` aligns Showroom stage, Quick-Card dialog, and Outfit Studio cleanly |
| 13 | `1920px` | Full HD Wide Desktop | Centered `1440px` container prevents over-stretched canvases or `> 65ch` editorial descriptions |
| + | `200%` Zoom | `1280px` (`640px` eff.) + `320px` | Outfit Studio sticky stage degrades gracefully without overlapping slot picker; all buttons remain `>= 44x44px` and non-overlapping |

**Touch Scroll Isolation Rule (`< 768px`):**
- Outer `<div data-testid="...-stage">` sets `touch-action: pan-y` by default when `touchOrbitActive === false`.
- OrbitControls pointer capture (`touch-action: none` on the inner canvas wrapper) activates **only** when the user taps `"Aktifkan Putar 3D"` (`aria-pressed="true"`), and deactivates immediately on tapping `"Kunci Gulir Halaman"`.
- Zone-jump buttons, slot radios, and directional step buttons always work independently of `touchOrbitActive`.

---

## 5. Complete 8-State Interactive Component Matrix

Every Phase 08 interactive surface MUST implement **Default**, **Hover**, **Focus-Visible**, **Active**, **Disabled**, **Loading**, **Empty**, and **Error/Incompatible** states without relying on color alone.

### 5.1 Showroom Zone Bar (`role="radiogroup"`, Dark Showcase)

| State | Visual & Token Spec | Accessibility & Behavior |
|---|---|---|
| **Default** | `--arven-surface-canvas` (`#17191B`) fill, `1px solid var(--arven-border-control)` (`#9E9C92`), `#F8F7F3` text, `min-h-11` (`>= 44px`), `>= 8px` gap | `role="radio"`, `aria-checked="false"`, roving `tabIndex={-1}` |
| **Hover** | Background shifts to `#35383A` (`--arven-surface-panel`), border `#F8F7F3` (`120ms` ease) | Pointer cursor; no layout shift |
| **Focus-Visible** | `2px solid #82B0DC` (`--arven-focus-ring`), `2px` offset, `0ms` outline transition | ArrowLeft/Right/Up/Down/Home/End move selection; Tab exits radiogroup |
| **Active (Selected)** | `#35383A` fill, `2px solid #C5A572` (Warm Bronze) border + `6px` square `#C5A572` indicator + bold `#F8F7F3` label | `aria-checked="true"`, `tabIndex={0}`, triggers `aria-live="polite"` zone announcement |
| **Disabled** | `#222528` fill, `1px solid #46494C`, `#B2B0A6` text + `"(Sedang Memuat)"` / `"(Belum Tersedia)"` text label | `aria-disabled="true"` (used during initial zone error or locked state, never hidden silently) |
| **Loading** | Selected target button displays compact spinner + `"Memuat zona..."` label while keeping previous zone geometry until swap completes | `aria-busy="true"` on stage container; announcements deferred until ready |
| **Empty** | Rendered if zero `PUBLISHED` zones exist: Dark panel (`#222528`) stating `"Belum ada zona ruang pamer yang dipublikasikan."` + link to `/shop` | Valid landmark retained; no empty black canvas |
| **Error / Incompatible** | Zone GLB fetch fails: keeps zone bar interactive to switch zones, displays `#35231E` / `#E48966` banner over `poster.svg` with `"Muat Ulang Zona"` button | `role="alert"` + telemetry emitted (zero PII) |

### 5.2 Hotspot Markers + Quick-Card Drawer/Dialog

| State | Visual & Token Spec | Accessibility & Behavior |
|---|---|---|
| **Default** | In 3D & DOM strip: `44x44px` minimum hit box (`1px solid #9E9C92`, `#17191B` fill, `#F8F7F3` crisp index numeral `1`, `2`...). **No pulsing ring or idle animation.** | Both in-scene marker and mirrored DOM hotspot button carry `aria-label="Produk: {name}, mulai {formatIDR}"` |
| **Hover** | Marker border `#C5A572`, background `#35383A`, subtle crisp scale `1.0` (no bounce) | Displays compact non-overlapping product name tooltip or highlights corresponding DOM hotspot chip |
| **Focus-Visible** | `2px solid #82B0DC` outline, `2px` offset (`0ms`) | Focusing a DOM hotspot moves camera toward hotspot (or snaps if `reducedMotion`) and announces `"Fokus ke {productName}"` |
| **Active (Open)** | Hotspot border `#C5A572` + `#C5A572` fill / `#17191B` ink badge; opens Quick-Card (`<dialog role="dialog" aria-modal="true">`) | Focus moves cleanly to Quick-Card title or Close button; `Escape` or backdrop click closes and returns focus to triggering hotspot button |
| **Disabled** | Inactive or out-of-catalog hotspot filtered server-side; if product stock is `0`, Quick-Card renders `"Stok Habis"` badge (`#35383A` / `#F8F7F3`) | Quick-Card remains inspectable with link to PDP (`"Lihat Detail Produk"`) |
| **Loading** | If product live details hydrate asynchronously: `3:4` subtle `#222528` media block + 2 static placeholder bars (no neon shimmer) | `aria-busy="true"` inside Quick-Card body |
| **Empty** | Zone with `0` active hotspots renders `"Zona arsitektural ini tidak memiliki penanda produk aktif."` in DOM hotspot strip | Screen-reader & keyboard users understand zone has architectural view only |
| **Error / Incompatible** | Quick-Card product unavailable / deleted mid-session: displays `"Produk ini tidak lagi tersedia."` (`#E48966` on `#35231E`) + `"Tutup"` button | Never shows stale cached price; `role="alert"` |

### 5.3 Outfit Slot Selector Radiogroups (`top`, `bottom`, `outerwear`, `footwear`, `accessory`)

| State | Visual & Token Spec | Accessibility & Behavior |
|---|---|---|
| **Default** | Editorial Light (`#FFFFFF` card on `#F8F7F3` canvas), `1px solid #747269` (`--arven-border-control`), `3:4` thumbnail (`#F1EFE9`), title (`#17191B`), live `formatIDR()` (`tabular-nums`, `#17191B`), `min-h-11` hit targets | Slot switcher (`role="radiogroup"`) + Garment options (`role="radiogroup"`) + Variant/Preset selector (`role="radiogroup"`) |
| **Hover** | Card/pill border transitions to `#17191B` (`--arven-border-strong`), background `#F1EFE9` (`120ms`) | Zero layout shift |
| **Focus-Visible** | `2px solid #1F4E79` (`--arven-focus-ring`), `2px` offset (`0ms`) | ArrowLeft/Right/Up/Down/Home/End navigate options cleanly |
| **Active (Selected)** | `2px solid #17191B`, `#E9E4DA` Cream panel fill (or `#17191B` fill / `#F8F7F3` ink on slot/size pills) + explicit check icon / `"Dipilih"` label | `aria-checked="true"`, updates URL query draft (`?top=...`) and triggers 3D mannequin slot swap + `aria-live="polite"` announcement |
| **Disabled** | `#F1EFE9` background, `1px solid #D8D3C8`, `#5E5C54` text + explicit status tag (`"Stok Habis"` or `"Tidak Kompatibel"`) | `aria-disabled="true"` (kept focusable so keyboard/SR users read the rejection reason) |
| **Loading** | During garment GLB attach or `/outfit-studio/validate`: targeted slot pill shows `"Memasang..."` / `"Memeriksa..."` while mannequin stage shows neutral progress bar over `#17191B` | Prevents double-swap race conditions via `aria-busy="true"` |
| **Empty** | Slot with no eligible garments renders `"Belum ada produk yang tersedia untuk slot {slotLabel}."` (`#5E5C54` on `#F1EFE9`) | Clean empty state; other slots unaffected |
| **Error / Incompatible** | Selecting an incompatible garment or preset triggers inline alert + locks invalid attach (see §5.4) | Mannequin retains last valid combination; never silently replaces without explanation |

### 5.4 Incompatible Garment Banner / Chip

| State | Visual & Token Spec | Accessibility & Behavior |
|---|---|---|
| **Default (Hidden / No Conflict)** | Absent from DOM or subtle neutral compatibility note `"Semua item terpilih kompatibel dengan manekin standar."` (`#416B59` on `#E8F0EC`) | Announced cleanly only when status changes |
| **Hover (On Trigger / Chip)** | `"Tidak Kompatibel"` chip (`#9C3D3D` on `#F5EAE8`, `5.66:1`) underlines optional `"Lihat Alasan"` or shows conflict pair clearly | No hidden hover-only error text (reason must be readable without hover) |
| **Focus-Visible** | `2px solid #1F4E79` (`2px` offset, `0ms`) on inline action button (e.g., `"Lepas Outerwear"` / `"Lepas Kemeja"` quick-resolve button) | Keyboard user can resolve layer conflict in one action |
| **Active (Conflict Resolved)** | Clicking quick-resolve clears conflicting slot and immediately attaches the newly requested garment | `aria-live="polite"` confirms slot replacement |
| **Disabled** | Action disabled during server validation request (`aria-busy="true"`) | Prevents conflicting simultaneous mutations |
| **Loading** | `"Memvalidasi kompatibilitas..."` (`#1F4E79` on `#E6EEF5`) during `POST /outfit-studio/validate` | Brief inline indicator |
| **Empty** | Not applicable (banner suppressed when no violation exists) | Zero visual clutter |
| **Error / Incompatible (Primary State)** | `#F5EAE8` (`--arven-status-danger-bg`) container with `1px solid #9C3D3D` (`--arven-status-danger-fg`), alert icon, exact violation copy (e.g. `"Kemeja oversized ini tidak kompatibel dengan outerwear yang sedang aktif."` for `LAYER_CONFLICT`, or `"Aset tidak sesuai slot {slot}."` for `SLOT_MISMATCH`, or `"Versi kerangka manekin tidak cocok."` for `SKELETON_VERSION_MISMATCH`), plus optional `"Ganti Slot Terkait"` action | `role="alert"` on submission/rejection; garment card shows `"Konflik Layer"` chip so color is never sole indicator |

### 5.5 Saved Outfits List (`/outfit-studio` Panel & `/account/outfits`)

| State | Visual & Token Spec | Accessibility & Behavior |
|---|---|---|
| **Default** | Editorial Light card (`#FFFFFF`, `1px solid #D8D3C8` hairline, `#E9E4DA` header summary), `3:4` 2D poster (`poster.svg`), title, `n / 5` slot count (`tabular-nums`), live server-calculated total `formatIDR()` (`tabular-nums`), WIB timestamp (`#5E5C54`) | `"Buka di Studio"`, `"Ubah Nama"`, `"Hapus"` buttons (`min-h-11`, `>= 8px` gap) |
| **Hover** | Card border shifts to `#17191B` (`120ms`); action buttons highlight per `Button` token | Clean editorial card hover |
| **Focus-Visible** | `2px solid #1F4E79` (`2px` offset, `0ms`) on every card link and action button | Logical DOM tab order |
| **Active (Loaded in Studio)** | Active saved outfit card gets `2px solid #17191B` + `#E9E4DA` Cream fill + `"Sedang Dibuka"` badge (`#1F4E79` on `#E6EEF5`) | `aria-current="true"` on currently loaded outfit |
| **Disabled (Quota / Auth / Stale)** | Guest view: `"Simpan Paduan"` button stays actionable or directs cleanly to login banner; at `50 / 50` quota: `"Batas 50 paduan tersimpan tercapai. Hapus salah satu paduan untuk menyimpan yang baru."` | Never allows silent overwrite; stale/out-of-stock item displays warning chip `"Stok atau varian berubah"` (`#875B12` on `#F3ECE0`) |
| **Loading** | Skeleton cards matching `3:4` poster + 3 static neutral `#F1EFE9` text bars (`"Memuat daftar paduan..."`) | `aria-busy="true"`, `0.00` CLS |
| **Empty** | Authenticated with 0 outfits: `"Belum ada paduan tersimpan."` + CTA `"Buat Paduan di Outfit Studio"` (`/outfit-studio`). Guest: `"Masuk untuk menyimpan paduan pakaian Anda."` + link to `/auth/login?next=/outfit-studio` | Clear next action; zero fake rows |
| **Error / Incompatible** | API `401` / `422` / `500`: `#F5EAE8` banner with `#9C3D3D` text (`"Gagal memuat paduan tersimpan."` or `"Sebagian item tidak lagi tersedia."`) + `"Muat Ulang"` retry button | Preserves current studio draft in URL params |

### 5.6 WebGL Fallback Gallery (`/showroom` & `/outfit-studio`)

| State | Visual & Token Spec | Accessibility & Behavior |
|---|---|---|
| **Default (WebGL Active vs Fallback)** | When WebGL is unavailable (`--disable-webgl`), blocked, or failed twice: mounts directly inside `<Canvas fallback={...}>` with curated `poster.svg` zone/mannequin preview + `#E6EEF5`/`#1F4E79` info banner (`"Mode 2D aktif. Semua produk tetap dapat dipilih dan dibeli."`) | Zero uncaught exceptions; **0** broken canvas placeholders |
| **Hover** | Fallback product cards & 2D slot poster tiles use standard `ProductCard` / Editorial Light hover (`scale(1.02)` on image only when reduced motion is false) | Standard pointer behavior |
| **Focus-Visible** | `2px solid #1F4E79` (light catalog) / `#82B0DC` (dark stage poster header), `2px` offset (`0ms`) | Full keyboard access to zone switcher, slot picker, save, and Add to Bag |
| **Active** | Switching zones in fallback `/showroom` updates the displayed zone `poster.svg` and scrolls/filters or highlights the zone's product cards; in fallback `/outfit-studio`, slot selection updates the 2D layered poster & summary list | Same API validation (`POST /outfit-studio/validate`) and `POST /outfit-studio/cart-items` |
| **Disabled** | `"Muat Ulang Tampilan 3D"` button hidden or disabled with `"Perangkat tidak mendukung WebGL"` when WebGL capability check returns `false` permanently | Honest hardware capability communication |
| **Loading** | Immediate SSR `poster.svg` / `poster.webp` rendered in `aspect-[3/4]` or `aspect-[16/9]` container before dynamic 3D chunk mounts (`0.00` CLS) | No blank flash |
| **Empty** | Missing zone poster falls back to neutral `#222528` / `#F1EFE9` architectural frame with zone title & category label | Never renders broken `<img>` icon |
| **Error / Incompatible** | Context lost (`webglcontextlost`) shows `"Memulihkan tampilan 3D..."` for up to `3000ms`; if unrecovered or lost twice, transitions automatically to 2D fallback gallery with `"Coba Muat Ulang 3D"` retry action | Preserves URL draft (`?top=...`) and active zone (`?zone=...`) across recovery/degradation |

### 5.7 Admin Experience Consoles (`/experience/showroom`, `/experience/outfit-studio`)

- **States:** Follow `DESIGN.md` §5.2.7 (`Admin Data Tables`) in `data-theme="dark"` (`#17191B` / `#222528` / `#35383A`):
  - **Read-Only (`CONTENT` role):** Mutation buttons (`Create Zone`, `Transition Status`, `Edit Compatibility`, `Create Preset`) hidden or rendered `disabled` with explicit `"Memerlukan izin asset.publish"` explanation.
  - **Conflict / Validation (`422` / `409`):** Inline `#35231E` / `#E48966` alert naming the offending field (`skeletonVersion`, `anchor`, `incompatibleSlots`, or `sceneBytes > 6 MB`).
  - **Success:** Non-blocking toast + table refresh via `useToast()`.

---

## 6. Accessibility, Keyboard & Motion Rules

### 6.1 Demand Rendering & Idle Budget
- `<Canvas frameloop="demand" dpr={tier === 'lite' ? [1, 1.5] : [1, 2]}>` is mandatory on both `/showroom`, `/outfit-studio`, and Admin 3D previews.
- **Zero idle `requestAnimationFrame` loops (`0` rAF calls in 700ms idle check).** Call `invalidate()` strictly on:
  - Camera orbit/zoom/step or zone portal transition
  - Initial GLB mount and dual `invalidate()` after async garment attachment
  - Preset / slot swap or window resize
- **No pulsing/bobbing/spinning hotspot beacons, no floating dust particles, no idle camera drift.**

### 6.2 `prefers-reduced-motion: reduce` Contract
- **3D Scene:**
  - `enableDamping = false` on `OrbitControls`.
  - Zone-to-zone and hotspot-focus camera transitions snap deterministically (`duration = 0ms`, immediate `camera.position.copy(...)` + `controls.target.copy(...)` + `controls.update()` + `invalidate()`).
  - Garment swap and preset change apply instantaneously without scale/fade bounce.
- **DOM UI:**
  - `tokens.css` collapses `--duration-fast`..`--duration-editorial` to `0.01ms` and sets `scroll-behavior: auto`.
  - Quick-Card drawer/dialog mounts via instant visibility / `<= 120ms` opacity fade only (zero slide/transform travel).

### 6.3 Keyboard Navigation & Focus Management
1. **Non-Trapping `<Canvas>`:**
   - `<Canvas>` never captures `Tab` or `Shift+Tab`. All interactive controls live in standard HTML DOM outside `<canvas>`.
   - Skip links (`"Lewati Ruang Pamer 3D"` -> `#showroom-catalog-directory`, `"Lewati Studio 3D"` -> `#outfit-studio-controls`) are the first focusable element inside each 3D section.
2. **Roving Tabindex / Radiogroup Keyboarding:**
   - Showroom Zone Bar, Hotspot Selector Strip, Outfit Studio 5-Slot Selector, Garment Option List, and Variant/Preset Selector implement `role="radiogroup"` + `role="radio"` (or native `<input type="radio">`) supporting `ArrowRight` / `ArrowDown` (next), `ArrowLeft` / `ArrowUp` (previous), `Home` (first), `End` (last), and `Space` / `Enter` (activate).
3. **Quick-Card Focus Lifecycle (`/showroom`):**
   - Activating a hotspot (in 3D or DOM strip) opens the Quick-Card dialog/drawer, stores a ref to the triggering hotspot button, and moves focus to the Quick-Card heading or Close button.
   - While open, `Tab` cycles inside the Quick-Card; `Escape` or Close button closes the card and restores focus directly to the triggering hotspot button.
4. **`aria-live="polite"` Region:**
   - Dedicated visually hidden (`sr-only`) `aria-live="polite"` region outside `<canvas>` announces:
     - Zone transitions: `"Berpindah ke zona Galeri Tailoring. 3 produk tersedia."`
     - Hotspot selection: `"Membuka kartu produk Heavyweight Crew Tee, mulai Rp499.000."`
     - Camera actions: `"Kamera diputar 45 derajat ke kiri."` / `"Tampilan kamera direset."`
     - Garment slot attach/remove: `"Heavyweight Crew Tee dipasang pada slot Atasan. 2 dari 5 slot terisi."`
     - Incompatible rejection (`role="alert"` or assertive/polite immediate feedback): `"Kemeja oversized ini tidak kompatibel dengan outerwear yang sedang aktif."`
     - Add to Bag outcome: `"3 item kompatibel ditambahkan ke tas."` (or exact partial out-of-stock count).
     - WebGL context loss / restoration: `"Memulihkan tampilan 3D..."` -> `"Tampilan 3D dipulihkan."`

---

## 7. Implementation Checklist for Downstream Agents

- **`threejs-developer` & `motion-developer`:** Keep `./showroom` and `./outfit-studio` strictly separated from root `@arven/three-engine` (PDP bundle must remain untouched). Enforce `touch-action: pan-y`, `frameloop="demand"`, `enableDamping={!reducedMotion}`, `44x44px` DOM controls, and `aria-live="polite"` hooks.
- **`frontend-developer`:** Consume `@arven/ui` semantic tokens (`bg-canvas`, `bg-panel`, `text-ink`, `text-ink-muted`, `text-link`, `border-control-border`, `border-strong-border`) + `data-theme="dark"` wrapper for Dark Showcase stages, `formatIDR` with `tabular-nums`, permanent disclosure note on `/outfit-studio`, `0 B` three.js on `/account/outfits`, and zero em dashes in any copy.
- **`responsive-qa-agent` / `accessibility-qa-agent` / `design-qa-agent`:** Verify all 13 profiles + 200% zoom, `antislop-contrast` compliance (`#8B897F` banned on light, `#C5A572` dark-only accent, zero pink), axe `0` violations, `--disable-webgl` full purchase & save flow, and zero idle rAF frames.
