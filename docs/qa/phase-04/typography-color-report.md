# ARVEN Phase 04 Typography, Color & Motion QA Report

> **Harness Plan ID:** `1a47de03-ee06-469d-936b-8d01ef5b28cc`  
> **Task ID:** `d2d3c7b8-fa90-40ef-8a80-5324f195ec0e`  
> **Checkpoint ID:** `typography-color`  
> **Independent Verifier:** `design-qa-agent`  
> **Execution Timestamps (UTC):** Initial audit: `2026-11-15T17:00:24Z` (Storefront & Admin `/login`), `2026-11-15T17:14:24Z` (Admin `/inventory`); **Post-repair re-verification:** `2026-11-15T17:59:51Z`  
> **Browser & Verification Tools:** Playwright Chromium (`1280x800`, headless) `getComputedStyle` audit + `antislop-contrast:check_contrast` MCP + static source scan  
> **Overall Verdict:** `PASS` (Post-repair verified)

---

## 1. Executive Summary

Independent Typography, Color Contrast, Copy Discipline, and Reduced-Motion QA across **Storefront** (`http://localhost:3000`) and **Admin** (`http://localhost:3001`) passed all Phase 04 `typography-color` criteria with **zero violations**:

- **Color & WCAG 2.2 AA Contrast:** All audited text and interactive control pairings on Storefront PDP (`/products/form-structured-calfskin-crossbody` in light & dark modes), populated `/cart` (light & dark modes), Admin `/login` (dark & light modes), and authenticated Admin `/inventory` (`Levels` dark & light, `Movements Ledger`, `Reservations`, `Record Stock Movement` modal) meet or exceed `4.5:1` for normal text and `3.0:1` for non-text UI borders.
- **Anti-Slop Color Governance:** `0` light-surface normal-text uses of banned Stone `#8B897F` (`rgb(139, 137, 127)`); light muted text resolves to Deep Stone `#5E5C54` (`5.83:1`–`6.70:1`) and dark muted text resolves to `#B2B0A6` (`5.43:1`–`8.10:1`). `0` pink/rose/magenta hues found in source files or rendered computed styles.
- **Typography, Numeric Alignment & Copy Hygiene:** `Cormorant Garamond` (`--font-display`), `Plus Jakarta Sans` (`--font-sans`, ARVEN's canonical UI sans per [`DESIGN.md`](../../../DESIGN.md) §4.1 and `layout.tsx`), and `JetBrains Mono` (`--font-mono`) loaded cleanly via `next/font/google`; `tabular-nums` applied on all IDR prices, subtotals, quantity readouts, and inventory counts; `WIB` timestamps verified across `Levels` and `Movements Ledger` (and source-verified via `formatWIB()` on `Reservations`); `0` visible copy clipping; `0` em dashes (`\u2014`) in rendered DOM text or Phase 04 TS/TSX source.
- **Motion & `prefers-reduced-motion: reduce`:** Verified in Playwright on `/cart` and `/inventory` `Record Stock Movement` modal (`transitionDuration: 1e-05s` / `0.01ms`, `scrollBehavior: auto`, `opacity: 1`, clean modal dismiss with `0` stuck overlays and restored `body.style.overflow`).
- **Clean State Restoration:** Temporary Storefront guest cart item was removed via `Remove` (`"Your Bag Is Empty"` confirmed) and the isolated browser context closed; no inventory mutations were performed during `/inventory` inspection.

---

## 2. Color & WCAG 2.2 Contrast Audit (`antislop-contrast` + `getComputedStyle`)

### 2.1 Storefront PDP (`/products/form-structured-calfskin-crossbody`)

| Element | Mode | Computed FG | Computed BG | Contrast (`check_contrast`) | Border (`1.4.11`) | Verdict |
|---|---|---|---|---|---|---|
| `h1` Product Title | Light | `#17191B` | `#F8F7F3` | `16.44:1` (Pass) | N/A | `PASS` |
| Price (`Rp 799.000`) | Light | `#17191B` | `#F8F7F3` | `16.44:1` (Pass) | N/A | `PASS` |
| Stock Hint (`Max 10 per order...`, muted) | Light | `#5E5C54` | `#F8F7F3` | `6.25:1` (Pass) | N/A | `PASS` |
| Quantity Stepper (`-` / `1` / `+`) | Light | `#17191B` | `#FFFFFF` | `17.63:1` (Pass) | `#747269` (`4.82:1`) | `PASS` |
| `Add to Bag` Primary CTA | Light | `#F8F7F3` | `#17191B` | `16.44:1` (Pass) | N/A | `PASS` |
| `Size Guide` Secondary CTA | Light | `#17191B` | `#E9E4DA` | `13.91:1` (Pass) | `#747269` (`3.81:1`) | `PASS` |
| `Material & Composition` Heading (muted) | Light | `#5E5C54` | `#F1EFE9` | `5.83:1` (Pass) | N/A | `PASS` |
| `Material & Composition` Copy | Light | `#17191B` | `#F1EFE9` | `15.33:1` (Pass) | N/A | `PASS` |
| `h1` & Price (`Rp 799.000`) | Dark | `#F8F7F3` | `#17191B` | `16.44:1` (Pass) | N/A | `PASS` |
| Stock Hint (`Max 10 per order...`, muted) | Dark | `#B2B0A6` | `#17191B` | `8.10:1` (Pass) | N/A | `PASS` |
| Quantity Stepper & `Size Guide` | Dark | `#F8F7F3` | `#35383A` | `11.02:1` (Pass) | `#9E9C92` (`4.29:1`) | `PASS` |
| `Add to Bag` Primary CTA | Dark | `#17191B` | `#F8F7F3` | `16.44:1` (Pass) | N/A | `PASS` |
| `Material & Composition` Heading (muted) | Dark | `#B2B0A6` | `#222528` | `7.08:1` (Pass) | N/A | `PASS` |
| `Material & Composition` Copy | Dark | `#F8F7F3` | `#222528` | `14.37:1` (Pass) | N/A | `PASS` |

### 2.2 Populated Storefront `/cart`

| Element | Mode | Computed FG | Computed BG | Contrast (`check_contrast`) | Border (`1.4.11`) | Verdict |
|---|---|---|---|---|---|---|
| `Shopping Bag` `h1` | Light | `#17191B` | `#F8F7F3` | `16.44:1` (Pass) | N/A | `PASS` |
| `Guest Bag` Badge | Light | `#17191B` | `#E9E4DA` | `13.91:1` (Pass) | `#747269` (`3.81:1`) | `PASS` |
| Item Title, SKU Value, `Rp 799.000`, `Rp 1.598.000`, `Remove` | Light | `#17191B` | `#FFFFFF` | `17.63:1` (Pass) | N/A | `PASS` |
| `SKU:` Label & `Line Subtotal` Label (muted) | Light | `#5E5C54` | `#FFFFFF` | `6.70:1` (Pass) | N/A | `PASS` |
| `Bag Totals` Summary Heading & Server Subtotal | Light | `#17191B` | `#F1EFE9` | `15.33:1` (Pass) | N/A | `PASS` |
| Summary `Total Pieces` Label (muted) | Light | `#5E5C54` | `#F1EFE9` | `5.83:1` (Pass) | N/A | `PASS` |
| `Checkout Staging` Info Banner | Light | `#1F4E79` | `#E6EEF5` | `7.39:1` (Pass) | N/A | `PASS` |
| `Continue Shopping` Primary CTA | Light | `#F8F7F3` | `#17191B` | `16.44:1` (Pass) | N/A | `PASS` |
| `Sign In to Save Bag` Secondary CTA | Light | `#17191B` | `#E9E4DA` | `13.91:1` (Pass) | `#747269` (`3.81:1`) | `PASS` |
| `Shopping Bag` `h1` & `Continue Shopping` | Dark | `#F8F7F3` / `#17191B` | `#17191B` / `#F8F7F3` | `16.44:1` (Pass) | N/A | `PASS` |
| `Guest Bag` Badge, Item Card, `Sign In to Save Bag` | Dark | `#F8F7F3` | `#35383A` | `11.02:1` (Pass) | `#9E9C92` (`4.29:1`) | `PASS` |
| `SKU:` & `Line Subtotal` Labels (muted) | Dark | `#B2B0A6` | `#35383A` | `5.43:1` (Pass) | N/A | `PASS` |
| `Bag Totals` Heading & Server Subtotal | Dark | `#F8F7F3` | `#222528` | `14.37:1` (Pass) | N/A | `PASS` |
| Summary `Total Pieces` Label (muted) | Dark | `#B2B0A6` | `#222528` | `7.08:1` (Pass) | N/A | `PASS` |
| `Checkout Staging` Info Banner | Dark | `#82B0DC` | `#1E2C3A` | `6.23:1` (Pass) | N/A | `PASS` |

### 2.3 Admin `/login` & Authenticated `/inventory`

| View / Element | Mode | Computed FG | Computed BG | Contrast (`check_contrast`) | Border (`1.4.11`) | Verdict |
|---|---|---|---|---|---|---|
| `/login` `Operations Sign In` `h1` & `Continue to MFA` | Dark | `#F8F7F3` / `#17191B` | `#17191B` / `#F8F7F3` | `16.44:1` (Pass) | N/A | `PASS` |
| `/login` `Staff Portal` Warning Badge | Dark | `#E2AE55` | `#30281B` | `7.21:1` (Pass) | N/A | `PASS` |
| `/login` `Mandatory TOTP MFA` & Subtitle (muted) | Dark | `#B2B0A6` | `#17191B` | `8.10:1` (Pass) | N/A | `PASS` |
| `/login` Email Input | Dark | `#F8F7F3` | `#35383A` | `11.02:1` (Pass) | `#9E9C92` (`4.29:1`) | `PASS` |
| `/login` `Staff Portal` Badge & Muted Copy | Light | `#875B12` / `#5E5C54` | `#F3ECE0` / `#F8F7F3` | `5.06:1` / `6.25:1` (Pass) | N/A | `PASS` |
| `/inventory` `Levels`: `h1`, SKU Mono, On Hand | Dark | `#F8F7F3` | `#17191B` | `16.44:1` (Pass) | N/A | `PASS` |
| `/inventory` `Levels`: KPI Labels & `Updated (WIB)` (muted) | Dark | `#B2B0A6` | `#17191B` | `8.10:1` (Pass) | N/A | `PASS` |
| `/inventory` `Levels`: KPI Numeric Count (`25`) | Dark | `#F8F7F3` | `#222528` | `14.37:1` (Pass) | N/A | `PASS` |
| `/inventory` `Levels`: Active Tab & `Receive` Action | Dark | `#F8F7F3` | `#35383A` | `11.02:1` (Pass) | `#9E9C92` (`4.29:1`) | `PASS` |
| `/inventory` `Levels`: Inactive Tab (muted) | Dark | `#B2B0A6` | `#222528` | `7.08:1` (Pass) | N/A | `PASS` |
| `/inventory` `Levels`: Table Header (`SKU & Garment`) | Dark | `#E9E4DA` | `#35383A` | `9.32:1` (Pass) | N/A | `PASS` |
| `/inventory` `Levels`: `LOW_STOCK` Badge | Dark | `#E2AE55` | `#30281B` | `7.21:1` (Pass) | N/A | `PASS` |
| `/inventory` `Levels`: Muted Labels & `Updated (WIB)` | Light | `#5E5C54` | `#F8F7F3` | `6.25:1` (Pass) | N/A | `PASS` |
| `/inventory` `Levels`: `LOW_STOCK` Badge | Light | `#875B12` | `#F3ECE0` | `5.06:1` (Pass) | N/A | `PASS` |
| `/inventory` `Movements Ledger`: `Timestamp (WIB)` & `Actor` (muted) | Dark | `#B2B0A6` | `#17191B` | `8.10:1` (Pass) | N/A | `PASS` |
| `/inventory` `Movements Ledger`: `Delta` (`-2`) | Dark | `#E2AE55` | `#17191B` | `8.75:1` (Pass) | N/A | `PASS` |
| `/inventory` `Movements Ledger`: `Reason` | Dark | `#E9E4DA` | `#17191B` | `13.91:1` (Pass) | N/A | `PASS` |
| `/inventory` `Movements Ledger`: `ADJUSTMENT` Badge | Dark | `#E2AE55` | `#30281B` | `7.21:1` (Pass) | N/A | `PASS` |
| `/inventory` `Reservations`: Status Select & Refresh | Dark | `#F8F7F3` | `#35383A` | `11.02:1` (Pass) | `#9E9C92` (`4.29:1`) | `PASS` |
| `/inventory` `Reservations`: Empty Heading | Dark | `#F8F7F3` | `#222528` | `14.37:1` (Pass) | N/A | `PASS` |
| `/inventory` `Record Stock Movement` Modal Surface, Title, Labels, `Cancel` | Dark | `#F8F7F3` | `#35383A` | `11.02:1` (Pass) | `#9E9C92` (`4.29:1`) | `PASS` |
| `/inventory` Modal Description & `Idempotency-Key` (muted) | Dark | `#B2B0A6` | `#35383A` | `5.43:1` (Pass) | N/A | `PASS` |
| `/inventory` Modal `Projected On Hand` (`13`) | Dark | `#F8F7F3` | `#222528` | `14.37:1` (Pass) | N/A | `PASS` |
| `/inventory` Modal `Record Movement` Primary CTA | Dark | `#17191B` | `#F8F7F3` | `16.44:1` (Pass) | N/A | `PASS` |

### 2.4 Banned Color Scan (`#8B897F` & Pink)

- **`#8B897F` (`rgb(139, 137, 127)`) on light surfaces:** `0` rendered normal-text violations across Storefront PDP, Storefront `/cart`, Admin `/login`, and Admin `/inventory` (`Levels` light mode). Source definition exists solely in [`packages/ui/src/styles/tokens.css`](../../../packages/ui/src/styles/tokens.css#L17) (`--color-stone-500`, marked banned for normal text on light surfaces) and is unused by normal text.
- **Zero pink colors:** `0` pink/rose/magenta hexes or Tailwind color utilities (`pink-*`, `rose-*`, `magenta-*`, `fuchsia-*`) across `apps/storefront/src`, `apps/admin/src`, and `packages/ui/src`, and `0` pink-signature RGB values detected in live rendered DOM styles.

---

## 3. Typography, Numeric Alignment & Copy Discipline

### 3.1 Font-Family Resolution (`document.fonts` + `getComputedStyle`)

| Role | Configured Token | Loaded Weights (`document.fonts`) | Computed Resolution (`h1` / `body` / `.font-mono`) |
|---|---|---|---|
| Display Serif | `--font-display` | `Cormorant Garamond` (`400`, `500`) | `"Cormorant Garamond", "Cormorant Garamond Fallback", Georgia, "Times New Roman", serif` (`36px` H1) |
| UI & Body Sans | `--font-sans` | `Plus Jakarta Sans` (`400`, `500`, `600`) | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (`16px` body) |
| Identifier / Numeric Mono | `--font-mono` | `JetBrains Mono` (`400`, `500`) | `"JetBrains Mono", "JetBrains Mono Fallback", ui-monospace, SFMono-Regular, Menlo, monospace` |

*(Note: ARVEN intentionally uses `Plus Jakarta Sans` for `--font-sans` rather than `Inter`, per [`DESIGN.md`](../../../DESIGN.md) §4.1 and root `layout.tsx` files.)*

### 3.2 `tabular-nums`, `WIB` Timestamps, Clipping & Em-Dash Hygiene

- **`tabular-nums` (`font-variant-numeric: tabular-nums`):** Verified live on PDP `Rp 799.000` (`24px`), PDP quantity value (`1`) & stock hint, `/cart` unit price (`Rp 799.000`), `/cart` line subtotal (`Rp 1.598.000`), `/cart` authoritative server subtotal (`Rp 1.598.000`), `/inventory` KPI counts (`25`), `Levels` `On Hand` (`3`), `Movements Ledger` `Delta` (`-2`), and `Record Stock Movement` modal `Projected On Hand` (`13`).
- **`WIB` Timestamps:**
  - `Levels` `Updated (WIB)`: rendered `"15 Nov 2026, 15:02 WIB"` across sampled rows.
  - `Movements Ledger` `Timestamp (WIB)`: rendered `"15 Nov 2026, 23:47 WIB"`, `"15 Nov 2026, 19:29 WIB"`, `"15 Nov 2026, 19:14 WIB"`, `"15 Nov 2026, 15:02 WIB"`.
  - `Reservations` `Expires (WIB)`: `0` reservation rows seeded in Phase 04 (empty state displayed cleanly); source column (`inventory-workspace.tsx:690-696`) formats `item.expiresAt` via `formatWIB()`.
- **Body Copy Clipping:** `0` visible text elements clipped (`scrollWidth > clientWidth` flagged only `1x1px` `sr-only` accessibility nodes: `"Skip to main content"` and `"Original price:"`).
- **Em-Dash (`\u2014`) Scan:** `0` occurrences in live rendered DOM (`document.body.innerText`) across PDP, `/cart`, `/login`, and `/inventory`, and `0` occurrences across all TS/TSX/CSS files under `apps/storefront/src`, `apps/admin/src`, and `packages/ui/src`.

---

## 4. Motion & `prefers-reduced-motion: reduce` Audit

| Surface | Emulated Condition | Computed `transitionDuration` | `scrollBehavior` | Opacity / Overlay State | Verdict |
|---|---|---|---|---|---|
| Storefront `/cart` | `prefers-reduced-motion: reduce` | `1e-05s` (`0.01ms`) on stepper & `Remove` button | `auto` | `body` `opacity: 1`; `Remove` cleans item to `"Your Bag Is Empty"` cleanly | `PASS` |
| Admin `/inventory` `Record Stock Movement` Modal | `prefers-reduced-motion: reduce` | `1e-05s` (`0.01ms`) on dialog & `Record Movement` submit button | `auto` | Modal `opacity: 1` while open (`body.overflow: hidden`); clicking `Cancel` unmounts dialog (`openDialogCount: 0`), restores `body.overflow: ""`, and keeps `body` `opacity: 1` | `PASS` |

---

## 5. Final Verdict

- **Typography, Color & Motion Checkpoint (`typography-color`):** **`PASS`**

---

## 6. Post-Repair Re-Verification (`2026-11-15T17:59:51Z`)

Following UI repairs to `apps/storefront/src/components/storefront-shell.tsx` (`sr-only` item suffix), `apps/storefront/src/components/cart/cart-view.tsx` (`<Divider />` outside `<dl>`, `whitespace-nowrap` subtotal), `apps/storefront/src/app/cart/page.tsx` (reserved loading height), and `apps/admin/src/components/inventory/inventory-workspace.tsx` (`aria-describedby` pointers + roving tablist focus), a fresh full verification executed cleanly against the rebuilt local stack (`:3000`, `:3001`, `:4000`):

- **Static Source Scan (`apps/storefront/src`, `apps/admin/src`, `packages/ui/src`):** `0` em dashes (`\u2014`), `0` pink/rose/magenta/fuchsia hexes or classes, and `#8B897F` confined strictly to its banned token comment in [`packages/ui/src/styles/tokens.css`](../../../packages/ui/src/styles/tokens.css#L17).
- **Live Storefront Repairs (`http://localhost:3000`, light & dark):**
  - **Header Bag Link:** Verified `"Bag0 items"` (`sr-only` `" items"`) before add, `"Bag1 item"` (`sr-only` `" item"`) after adding 1 piece on `/products/form-structured-calfskin-crossbody`, and restored to `"Bag0 items"` (`"Your Bag Is Empty"`) after clicking `Remove` on `/cart`.
  - **Populated `/cart` Structure & Numerics:** Confirmed `<Divider />` sits strictly outside `<dl>` (`dividerCountOutsideDl: 2`, `dividersInsideDl: 0`); `Authoritative Server Subtotal` `<dd>` renders `"Rp 799.000"` with `whiteSpace: "nowrap"`, `fontVariantNumeric: "tabular-nums"`, single-line `height: 28px`, `#17191B` on `#F1EFE9` (`15.33:1`) in light mode, and `#F8F7F3` on `#222528` (`14.37:1`) in dark mode.
  - **Storefront Muted/Color/Motion:** Light muted `#5E5C54` on `#F1EFE9` (`5.83:1`), dark muted `#B2B0A6` on `#222528` (`7.08:1`), `0` `#8B897F` normal text, `0` pink, `0` em dashes, `0` clipped elements, and clean `prefers-reduced-motion: reduce` (`transitionDuration: 1e-05s`, `scrollBehavior: "auto"`, `body` `opacity: 1`).
- **Live Admin `/login` & `/inventory` Modal Hints/Errors (`http://localhost:3001`, single MFA login):**
  - **Roving Tablist & Levels:** Keyboard `ArrowRight` / `ArrowLeft` moved focus cleanly across `#inventory-tab-levels` -> `#inventory-tab-movements` -> `#inventory-tab-reservations` -> `#inventory-tab-levels`; `Levels` muted text measured `#B2B0A6`/`#17191B` (`8.10:1`) dark and `#5E5C54`/`#F8F7F3` (`6.25:1`) light; `"15 Nov 2026, 15:02 WIB"` verified.
  - **`Record Stock Movement` Modal `aria-describedby` & Contrast:**
    - Hints (`#movement-delta-hint`, `#movement-reason-hint`): `#B2B0A6` on `#35383A` (`5.43:1`) in dark mode; `#5E5C54` on `#FFFFFF` (`6.70:1`) in light mode.
    - Client-side Zod Errors (`#movement-delta-error`, `#movement-reason-error`): `#E48966` on `#35383A` (`4.54:1`, verified PASS via `antislop-contrast:check_contrast`) in dark mode; `#9C3D3D` on `#FFFFFF` (`6.67:1`, verified PASS via `antislop-contrast:check_contrast`) in light mode.
    - Reduced Motion (`prefers-reduced-motion: reduce`): `dialogTransitionDuration: "1e-05s"`, `scrollBehavior: "auto"`, `dialogOpacity: "1"`, clean modal close (`openDialogCount: 0`, `bodyOpacityAfterClose: "1"`, `bodyOverflowAfterClose: ""`), `0` page errors.
