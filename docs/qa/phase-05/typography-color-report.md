# ARVEN Phase 05 Typography, Color & Motion QA Report

> **Harness Plan ID:** `7046df9d-13df-413d-b6ae-2ebaaaa6ddd9`  
> **Task ID:** `81789589-3122-4b08-96ca-fe07b18553f4`  
> **Checkpoint ID:** `typography-color`  
> **Independent Verifier:** `design-qa-agent`  
> **Execution Timestamp (UTC):** `2026-11-16T03:25:24Z` (Guest suite) & `2026-11-16T03:41:15Z` (Authenticated & cleanup verification)  
> **Live Target:** `http://localhost:3000` (Storefront) + `http://localhost:4000` (API)  
> **Browser Engine:** Playwright Chromium (`1280x800`, Light & Dark themes, `prefers-reduced-motion: reduce`) + `antislop-contrast:check_contrast`  
> **Overall Verdict:** **`PASS`** *(with 2 non-blocking minor typographic polish advisories: `TYP-05-001`, `TYP-05-002`)*

---

## 1. Executive Summary

Independent typography, color-theming, contrast, and motion QA across all Phase 05 Storefront commerce routes (`/cart`, `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, `/account/orders/[orderNumber]`) passed every Hard Gate and `DESIGN.md` guardrail:

- **Static Guardrail Scan (`57` files across `apps/storefront/src` & `packages/ui/src`):** `0` em-dashes (`\u2014`) in UI strings or code, `0` pink/rose/magenta/fuchsia tokens or utilities, `0` `#8B897F` normal text usages on light surfaces, `0` 3D/WebGL leaks (`three`, `@react-three/*`), and `0` non-compositor transitions (`transition-all`, `transition-[width]`, `transition-[height]`).
- **Fonts & Typographic Hierarchy:** `Cormorant Garamond` (display serif), `Plus Jakarta Sans` (UI/body sans), and `JetBrains Mono` (SKUs, order numbers, monetary amounts, timestamps) all load cleanly (`status: "loaded"`) via `next/font/google` (`display: "swap"`).
- **IDR & WIB Determinism:** All `formatIDR()` values render with `font-variant-numeric: tabular-nums` and single-line geometry; summary totals (`<dd>`) and order-history `<td>` price cells enforce `white-space: nowrap`. All dedicated timestamps format in `Asia/Jakarta` (`WIB`) with `font-mono tabular-nums`.
- **Light & Dark Theme Contrast (`antislop-contrast:check_contrast`):** All rendered text pairings across Light (`#F8F7F3` Ivory / `#F1EFE9` Subtle Ivory / `#E9E4DA` Cream / `#FFFFFF` White) and Dark (`#17191B` Charcoal / `#222528` Charcoal-800 / `#35383A` Graphite) themes meet or exceed `>= 4.5:1` for normal text (`>= 3.0:1` for large text and interactive control borders). Muted text resolves cleanly to `#5E5C54` (light) and `#B2B0A6` (dark); errors resolve to `#9C3D3D` (light) and `#E48966` (dark).
- **Reduced Motion (`prefers-reduced-motion: reduce`):** All motion tokens (`--duration-fast`, `--duration-base`, `--duration-moderate`, `--duration-editorial`) collapse to `.01ms`, `html` `scroll-behavior` resolves to `auto`, interactive controls compute `transitionDuration: 1e-05s` (`0.01ms`), and `motion-safe:animate-spin` / `motion-safe:animate-pulse` indicators halt without clipped animations.
- **Synthetic Order Cleanup:** All synthetic orders created during verification were cancelled via UI or expired cleanly, restoring `ARV-TOP-001` `availableQty = 25` (`PENDING_PAYMENT` count = `0`).

---

## 2. Static Guardrail Scan (`apps/storefront/src` & `packages/ui/src`)

Scanned `36` TypeScript/TSX/CSS files in `apps/storefront/src` and `21` files in `packages/ui/src` (`57` files total):

| Guardrail Check | Scope | Observed Count | Details & Evidence | Verdict |
|---|---|---|---|---|
| Em-dash (`\u2014`) ban | `apps/storefront/src`, `packages/ui/src`, + rendered `innerText` | `0` | Zero occurrences in source files or rendered DOM across all 5 Phase 05 routes (`emDash: false`). | `PASS` |
| Pink / Rose / Magenta / Fuchsia ban | `apps/storefront/src`, `packages/ui/src` | `0` | Zero occurrences of pink/rose/magenta/fuchsia color utilities, CSS vars, or hexes. Errors use terracotta (`#9C3D3D` light, `#E48966` dark). | `PASS` |
| Stone `#8B897F` normal-text ban | `apps/storefront/src`, `packages/ui/src` | `0` in `storefront` (`1` token comment in `tokens.css:17`) | `#8B897F` is never referenced in `apps/storefront/src` or component classes; muted text uses `--arven-text-muted` (`#5E5C54` light, `#B2B0A6` dark). | `PASS` |
| Semantic token compliance | `apps/storefront/src/**/*.tsx` | `1` swatch fallback | All UI surfaces, text, borders, and statuses use semantic `--arven-*` tokens/utilities; only `cart-view.tsx:329` has `item.colorHex \|\| '#17191B'` for a `12x12px` product color dot. | `PASS` |
| Zero 3D / WebGL leakage | `apps/storefront/src` | `0` | Zero imports of `three`, `@react-three/fiber`, or `@react-three/drei`. | `PASS` |
| Compositor-safe transitions | `apps/storefront/src`, `packages/ui/src` | `0` unsafe transitions | Zero `transition-all`, `transition-[width]`, or `transition-[height]` classes; transitions animate `background-color`, `border-color`, `color`, `opacity` only. | `PASS` |

---

## 3. Typography, Font Loading, `formatIDR` & `WIB` Verification

Artifacts saved in [`docs/qa/phase-05/screenshots/typography-color/`](./screenshots/typography-color/) with full DOM telemetry in [`guest-metrics.json`](./screenshots/typography-color/guest-metrics.json) and [`auth-metrics.json`](./screenshots/typography-color/auth-metrics.json).

### 3.1 Font Family Loading & Role Mapping (`apps/storefront/src/app/layout.tsx`)

- **Loaded Webfonts (`document.fonts` `status === 'loaded'`):** `Cormorant Garamond` (`--font-display`), `Plus Jakarta Sans` (`--font-sans`), and `JetBrains Mono` (`--font-mono`) confirmed loaded on every inspected route in both Light and Dark modes. *(Note: `DESIGN.md` §4.1 references `IBM Plex Mono`, whereas `layout.tsx` intentionally wires `JetBrains Mono` per the Phase 05 design brief.)*
- **Role Verification:**
  - `h1` & `h2` editorial/section headings (`36px / 40px` `h1` on `1280x800`): `"Cormorant Garamond", "Cormorant Garamond Fallback", Georgia, "Times New Roman", serif`
  - `body` & interactive UI copy (`16px` base): `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  - `.font-mono` (SKUs, order numbers, `Rp` monetary values, WIB timestamps): `"JetBrains Mono", "JetBrains Mono Fallback", ui-monospace, SFMono-Regular, Menlo, monospace`

### 3.2 Route-by-Route `formatIDR`, `tabular-nums`, `nowrap` & `WIB` Matrix

| Route & Theme | Fonts Loaded | `formatIDR` Items | `tabular-nums` / `nowrap` / Single-Line | `WIB` Timestamps (`Asia/Jakarta`) | Em-Dashes (`\u2014`) | Verdict |
|---|---|---|---|---|---|---|
| `/cart` (Light & Dark) | `Cormorant Garamond`, `Plus Jakarta Sans`, `JetBrains Mono` | `3` (`Rp 299.000` unit, line subtotal, server subtotal) | `3/3` `tabular-nums`, `1`-line height (`20px`/`24px`); summary `<dd>` `white-space: nowrap` *(see `TYP-05-002`)* | N/A | `0` | `PASS` |
| `/checkout` (Validation Errors + Populated/`WELCOME10`, Light & Dark) | `Cormorant Garamond`, `Plus Jakarta Sans`, `JetBrains Mono` | `8`–`9` (line, couriers, subtotal, `-Rp 29.900`, shipping, total) | `9/9` `tabular-nums`, `white-space: nowrap` on all summary `<dd>` / courier / line totals, `1` line | `1` (`Quote valid until 16 Nov 2026, 10:40 WIB`, `tabular-nums`) | `0` | `PASS` |
| `/checkout/status/[orderNumber]` (Pending, Light & Dark) | `Cormorant Garamond`, `Plus Jakarta Sans`, `JetBrains Mono` | `6` (session amount, item unit/line, subtotal, `-Rp 29.900`, shipping, grand total) | `6/6` `tabular-nums`, `white-space: nowrap` on totals, `1` line | `4` (`Placed ... WIB`, `Payment Deadline (WIB)` `16 Nov 2026, 10:40 WIB`, `tabular-nums`) | `0` | `PASS` |
| `/account/orders` (List, Light & Dark) | `Cormorant Garamond`, `Plus Jakarta Sans`, `JetBrains Mono` | `9` (`Rp 315.000`, `Rp 815.000` table rows) | `9/9` `tabular-nums`, `white-space: nowrap`, `1`-line rendered text inside `py-3` table cells | `9` table timestamps (`16 Nov 2026, 10:38 WIB`, etc., `tabular-nums`) | `0` | `PASS` |
| `/account/orders/[orderNumber]` (`ARV-20261116-7B5D58`, Light & Dark) | `Cormorant Garamond`, `Plus Jakarta Sans`, `JetBrains Mono` | `5` (item line, subtotal, shipping, grand total, payment amount) | `5/5` `tabular-nums`, `white-space: nowrap` on totals, `1` line | `5` (`Placed`, `Reserved until`, `Status Timeline`, `Expires (WIB)`, `tabular-nums`) | `0` | `PASS` |

---

## 4. Contrast Verification Across Light & Dark Themes (`antislop-contrast:check_contrast`)

Every foreground/background pairing observed in the live DOM across Light and Dark modes was measured directly with `antislop-contrast:check_contrast`. Thresholds: **Normal text `>= 4.5:1`**, **Large text (`>= 24px` or `>= 18.66px` bold) `>= 3.0:1`**, **Non-text UI control borders `>= 3.0:1`**.

### 4.1 Light Theme (`[data-theme="light"]`) Pairings

| Role / Sample Element | Foreground | Background | Ratio | Threshold | Verdict |
|---|---|---|---|---|---|
| Primary ink on Ivory canvas (`ARVEN`, `h1`, prose) | `#17191B` | `#F8F7F3` | `16.44:1` | `4.5:1` | `PASS` |
| Primary ink on Elevated White card (`/cart` item, `/checkout` card, table rows) | `#17191B` | `#FFFFFF` | `17.63:1` | `4.5:1` | `PASS` |
| Primary ink on Subtle Ivory well (`Bag Totals`, `Order Summary`, footer) | `#17191B` | `#F1EFE9` | `15.33:1` | `4.5:1` | `PASS` |
| Primary ink on Cream panel (active nav pill, selected address/courier, secondary CTA) | `#17191B` | `#E9E4DA` | `13.91:1` | `4.5:1` | `PASS` |
| Secondary ink (`Home` nav, garment metadata) on Ivory / White / Subtle | `#35383A` | `#F8F7F3` / `#FFFFFF` / `#F1EFE9` | `11.02:1` / `11.81:1` / `10.27:1` | `4.5:1` | `PASS` |
| **Muted text (`--arven-text-muted`)** on Ivory (`Atelier`, descriptions) | `#5E5C54` | `#F8F7F3` | `6.25:1` | `4.5:1` | `PASS` |
| **Muted text (`--arven-text-muted`)** on White (`SKU:`, timestamps, hints) | `#5E5C54` | `#FFFFFF` | `6.70:1` | `4.5:1` | `PASS` |
| **Muted text (`--arven-text-muted`)** on Subtle Ivory (`Total Pieces`, `Subtotal`) | `#5E5C54` | `#F1EFE9` | `5.83:1` | `4.5:1` | `PASS` |
| **Muted text (`--arven-text-muted`)** on Cream (`Estimated arrival`, secondary panels) | `#5E5C54` | `#E9E4DA` | `5.29:1` | `4.5:1` | `PASS` |
| Primary CTA (`Proceed to Checkout`, `Place Order & Pay`) | `#F8F7F3` | `#17191B` | `16.44:1` | `4.5:1` | `PASS` |
| **Error / Danger text** (`*` required, `#checkout-guest-email-error`, `Cancelled` badge) | `#9C3D3D` | `#FFFFFF` / `#F5EAE8` | `6.67:1` / `5.66:1` | `4.5:1` | `PASS` |
| **Danger button** (`Cancel Order`, `Confirm Cancellation`) | `#FFFFFF` | `#9C3D3D` | `6.67:1` | `4.5:1` | `PASS` |
| **Success** (`Selected` badge, `Applied WELCOME10`, `-Rp 29.900`) | `#416B59` | `#E8F0EC` / `#F1EFE9` | `5.21:1` / `5.26:1` | `4.5:1` | `PASS` |
| **Warning** (`Pending Payment`, `Awaiting Payment` badge) | `#875B12` | `#F3ECE0` | `5.06:1` | `4.5:1` | `PASS` |
| **Links & Focus Ring** (`Shop All` footer, `:focus-visible` `2px solid` on `a[href="/checkout"]`) | `#1F4E79` | `#F8F7F3` / `#F1EFE9` / `#E6EEF5` | `8.08:1` / `7.53:1` / `7.39:1` | `4.5:1` (`3.0:1` ring) | `PASS` |
| **Control borders** (buttons, inputs, bag pill on Ivory / Subtle / White) | `#747269` | `#F8F7F3` / `#F1EFE9` / `#FFFFFF` | `4.50:1` / `4.20:1` / `4.82:1` | `3.0:1` | `PASS` |

### 4.2 Dark Theme (`[data-theme="dark"]`) Pairings

| Role / Sample Element | Foreground | Background | Ratio | Threshold | Verdict |
|---|---|---|---|---|---|
| Primary ink on Charcoal canvas (`ARVEN`, `h1`, prose) | `#F8F7F3` | `#17191B` | `16.44:1` | `4.5:1` | `PASS` |
| Primary ink on Charcoal-800 subtle well (`Bag Totals`, `Order Summary`, `table` header) | `#F8F7F3` | `#222528` | `14.37:1` | `4.5:1` | `PASS` |
| Primary ink on Graphite elevated card (`Ordered Garments`, `Contact & Delivery`) | `#F8F7F3` | `#35383A` | `11.02:1` | `4.5:1` | `PASS` |
| Secondary ink (`Home` nav, garment specs, courier names) on Charcoal / Charcoal-800 / Graphite | `#E9E4DA` | `#17191B` / `#222528` / `#35383A` | `13.91:1` / `12.16:1` / `9.32:1` | `4.5:1` | `PASS` |
| **Muted text (`--arven-text-muted`)** on Charcoal (`Atelier`, captions) | `#B2B0A6` | `#17191B` | `8.10:1` | `4.5:1` | `PASS` |
| **Muted text (`--arven-text-muted`)** on Charcoal-800 (`Subtotal`, `Summary`) | `#B2B0A6` | `#222528` | `7.08:1` | `4.5:1` | `PASS` |
| **Muted text (`--arven-text-muted`)** on Graphite (`SKU:`, timestamps, hints) | `#B2B0A6` | `#35383A` | `5.43:1` | `4.5:1` | `PASS` |
| Dark primary CTA (`Proceed to Checkout`, `Place Order & Pay` inverted button) | `#17191B` | `#F8F7F3` / `#E9E4DA` | `16.44:1` / `13.91:1` | `4.5:1` | `PASS` |
| **Dark Error / Danger text** (`*` required, inline field errors on Graphite, `Cancelled` badge) | `#E48966` | `#35383A` / `#35231E` | `4.54:1` / `5.72:1` | `4.5:1` | `PASS` |
| **Dark Danger button** (`Cancel Order`, `Confirm Cancellation`) | `#17191B` | `#E48966` | `6.77:1` | `4.5:1` | `PASS` |
| **Dark Success** (`Selected` badge, `-Rp 29.900`) | `#89BBA6` | `#1E2E28` / `#222528` | `6.58:1` / `7.13:1` | `4.5:1` | `PASS` |
| **Dark Warning** (`Pending Payment`, `Awaiting Payment` badge) | `#E2AE55` | `#30281B` | `7.21:1` | `4.5:1` | `PASS` |
| Dark status banner prose (`Unable to place order`, `Awaiting payment`, `Inventory reserved`) | `#F8F7F3` | `#35231E` / `#30281B` / `#1E2C3A` | `13.89:1` / `13.56:1` / `13.27:1` | `4.5:1` | `PASS` |
| **Dark Links & Focus Ring** (`Shop All` footer, `:focus-visible` `2px solid` on `a[href="/checkout"]`) | `#82B0DC` | `#17191B` / `#222528` / `#35383A` / `#1E2C3A` | `7.72:1` / `6.74:1` / `5.17:1` / `6.23:1` | `4.5:1` (`3.0:1` ring) | `PASS` |
| **Dark control borders** (`#9E9C92` on Charcoal / Charcoal-800 / Graphite) | `#9E9C92` | `#17191B` / `#222528` / `#35383A` | `6.40:1` / `5.59:1` / `4.29:1` | `3.0:1` | `PASS` |

---

## 5. Motion & `prefers-reduced-motion: reduce` Verification

Tested via `page.emulateMedia({ reducedMotion: 'reduce' })` across all 5 routes (`/cart`, `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, `/account/orders/[orderNumber]`):

| Check | Measured Result Across All 5 Routes | Expected Contract (`DESIGN.md` §6 & `tokens.css`) | Verdict |
|---|---|---|---|
| Media query match | `window.matchMedia('(prefers-reduced-motion: reduce)').matches === true` | `true` | `PASS` |
| Scroll behavior | `getComputedStyle(document.documentElement).scrollBehavior === "auto"` | `"auto"` (smooth scroll disabled) | `PASS` |
| CSS motion tokens | `--duration-fast: .01ms`, `--duration-base: .01ms`, `--duration-moderate: .01ms`, `--duration-editorial: .01ms` | All durations collapse to `0.01ms` | `PASS` |
| Interactive control transitions | Sampled `<a>`, `<button>`, `<input>`, `<select>` all report `transitionDuration: "1e-05s"` (`0.01ms`) and `animationDuration: "1e-05s"` | Transitions collapse cleanly (`0.01ms`), zero clipped animations | `PASS` |
| Loading spinners & skeletons | `Button` and `LoadingState` spinners use `motion-safe:animate-spin`; skeleton rows use `motion-safe:animate-pulse` (`packages/ui/src/components/async-states.tsx:54,62`) | Halted under `prefers-reduced-motion: reduce` | `PASS` |

---

## 6. Visual Artifacts Inspected (`docs/qa/phase-05/screenshots/typography-color/`)

- Light & Dark captures reviewed visually across all 5 routes:
  - [`cart-light-1280x800.png`](./screenshots/typography-color/cart-light-1280x800.png), [`cart-dark-1280x800.png`](./screenshots/typography-color/cart-dark-1280x800.png)
  - [`checkout-errors-light-1280x800.png`](./screenshots/typography-color/checkout-errors-light-1280x800.png), [`checkout-errors-dark-1280x800.png`](./screenshots/typography-color/checkout-errors-dark-1280x800.png)
  - [`checkout-promo-dark-1280x800.png`](./screenshots/typography-color/checkout-promo-dark-1280x800.png)
  - [`checkout-status-light-1280x800.png`](./screenshots/typography-color/checkout-status-light-1280x800.png), [`checkout-status-dark-1280x800.png`](./screenshots/typography-color/checkout-status-dark-1280x800.png)
  - [`account-orders-light-1280x800.png`](./screenshots/typography-color/account-orders-light-1280x800.png), [`account-orders-dark-1280x800.png`](./screenshots/typography-color/account-orders-dark-1280x800.png)
  - [`account-order-detail-light-1280x800.png`](./screenshots/typography-color/account-order-detail-light-1280x800.png), [`account-order-detail-dark-1280x800.png`](./screenshots/typography-color/account-order-detail-dark-1280x800.png)

---

## 7. Non-Blocking Minor Polish Advisories

| ID | Severity | Location | Observation & Recommended Polish |
|---|---|---|---|
| `TYP-05-001` | **Minor (`Advisory`)** | `apps/storefront/src/components/account/order-detail-view.tsx:148` | `AccountShell`'s `<h1>` renders `"Order ARV-20261116-7B5D58"` wholly in `Cormorant Garamond`, showing proportional serif digits (`20261116`) instead of monospace numerals as used in `CheckoutStatusView` (`checkout-status-view.tsx:379`) and the `Order Snapshot` `<h2>` directly below it. Supporting an optional `ReactNode` `title` or monospace span for the order number in `AccountShell` would unify both detail pages. |
| `TYP-05-002` | **Minor (`Advisory`)** | `apps/storefront/src/components/cart/cart-view.tsx:340,384` | Unit price `<span>` and line subtotal `<p>` in `/cart` apply `font-mono tabular-nums` without `whitespace-nowrap` (unlike summary `<dd>` totals which set `whitespace-nowrap`). They rendered single-line at tested widths (`1280px`), and adding `whitespace-nowrap` guarantees parity with summary totals for larger multi-million IDR amounts on narrow screens. |

---

## 8. Synthetic Test Order Cleanup & Final Verdict

- **Guest order `ARV-20261116-CE3EA8`:** Cancelled cleanly via UI (`Cancel Order` -> `Confirm Cancellation` on `/checkout/status/ARV-20261116-CE3EA8`).
- **Authenticated order `ARV-20261116-7B5D58`:** Cancelled cleanly via UI (`Cancel Order` -> `Confirm Cancellation` on `/account/orders/ARV-20261116-7B5D58`).
- **Interrupted-run guest order `ARV-20261116-36D900`:** 15-minute reservation window expired cleanly prior to final verification.
- **Post-QA API Check:**
  - `GET /api/v1/orders?status=PENDING_PAYMENT&limit=20` -> `meta.total: 0`
  - `GET /api/v1/products/essentials-heavyweight-crew-tee` -> `ARV-TOP-001` `availableQty: 25` (baseline restored, `0` reserved units).
- **Checkpoint `typography-color` Verdict:** **`PASS`**

---

## 9. Repair Iteration 2 Re-Verification (`2026-11-16T06:00:05Z`)

Post-Repair-2 verification confirmed all fixes across `checkout-view.tsx`, `checkout-status-view.tsx`, `order-detail-view.tsx`, and `cart-view.tsx` (`repair2-metrics.json`, [`repair2-checkout-focus-light.png`](./screenshots/typography-color/repair2-checkout-focus-light.png), [`repair2-checkout-focus-dark.png`](./screenshots/typography-color/repair2-checkout-focus-dark.png)):

- **Static Guardrail Scan (`57` files across `apps/storefront/src` & `packages/ui/src`):** `0` em-dashes (`\u2014`), `0` pink/rose/magenta/fuchsia tokens or utilities, `0` `#8B897F` usages in `apps/storefront/src`, `0` 3D leaks, and `0` non-compositor transitions.
- **Checkout Radio Card Keyboard Focus Ring (`has-[:focus-visible]:outline-2 outline-offset-2 outline-focus`):**
  - **Light Theme:** Keyboard `Tab` onto `SiCepat Reguler` (`input[name="shippingService"]`) triggers `2px solid` outline (`2px` offset) around `<label>` (`#1F4E79` token / `#1E4A72` sampled, **`8.66:1`** / **`9.22:1`** vs `#FFFFFF` surrounding surface, `>= 3.0:1` UI contrast **`PASS`**).
  - **Dark Theme:** Keyboard `Tab` triggers `2px solid` outline (`2px` offset, `#82B0DC`, **`5.17:1`** vs `#35383A` Graphite surrounding surface, `>= 3.0:1` UI contrast **`PASS`**).
  - **Step 03 Coupon Alignment:** `#checkout-coupon-code` (`top: 1599px`) and `Apply Code` (`top: 1599px`) align at `topDeltaPx: 0`.
- **Cart `TYP-05-002` `whitespace-nowrap` Fix (`cart-view.tsx:340,384`):** Unit price `<span>` (`Rp 299.000`), line subtotal `<p>` (`Rp 299.000`), and summary `<dd>` (`Rp 299.000`) all compute `whiteSpace: "nowrap"`, `fontVariantNumeric: "tabular-nums"`, `JetBrains Mono`, and `1` line.
- **`Cancel Order` Danger Button, Focus Restore & Reduced Motion (`/checkout/status/ARV-20261116-568567`):**
  - `"Cancel Order"` renders `#FFFFFF` on `#9C3D3D` (**`6.67:1` `PASS`**) in Light mode and `#17191B` on `#E48966` (**`6.77:1` `PASS`**) in Dark mode.
  - Clicking `Cancel Order` -> `Keep Order` restores keyboard focus cleanly to `<button>Cancel Order</button>`.
  - Under `prefers-reduced-motion: reduce`, `--duration-fast` collapses to `.01ms`, `scrollBehavior` is `"auto"`, and submit/cancel button `transitionDuration` collapses to `1e-05s` (`0.01ms`).
- **Cleanup:** Guest order `ARV-20261116-568567` cancelled via UI (`Order cancelled`); `ARV-TOP-001` `availableQty` verified restored to `25` (`0` pending reservations remaining).
- **Post-Repair-2 Verdict (`typography-color`):** **`PASS`** (`TYP-05-002` resolved; `TYP-05-001` remains minor non-blocking advisory).
