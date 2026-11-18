# ARVEN Phase 05 Accessibility QA Report (`WCAG 2.2 AA`)

> **Harness Plan ID:** `7046df9d-13df-413d-b6ae-2ebaaaa6ddd9`  
> **Task ID:** `94a5557e-f6a6-485e-abd3-263ac157c1f1`  
> **Checkpoint ID:** `accessibility`  
> **Independent Verifier:** `accessibility-qa-agent`  
> **Execution Timestamp (UTC):** `2026-11-16T03:54:58Z` (Initial full suite) & `2026-11-16T03:56:40Z` (Fresh Skip-Link & full-page Tab verification)  
> **Live Target:** `http://localhost:3000` (Storefront) + `http://localhost:4000` (API)  
> **Tools & Versions:** Playwright `playwright-core 1.65.1` (`chromium_headless_shell-1248`, headless) + `@axe-core/playwright 4.14.0` (`axe-core 4.14.0`, tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) + custom DOM/ARIA/Keyboard/Zoom/Reduced-Motion inspection scripts  
> **Overall Verdict:** **`FAIL`** *(1 blocking WCAG 2.4.7 Focus Visible defect `A11Y-05-001` on `/checkout` radio cards; `24 / 24` automated `axe-core` scans passed with `0` violations)*

---

## 1. Executive Summary

Independent WCAG 2.2 AA accessibility verification across all Phase 05 Storefront routes (`/cart`, `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, `/account/orders/[orderNumber]`) in both **Light (`[data-theme="light"]`)** and **Dark (`[data-theme="dark"]`)** themes confirmed:

- **Automated `axe-core` WCAG 2.2 AA Scans:** **`24 / 24` scans passed with `0` violations** (`0` critical, `0` serious, `0` moderate, `0` minor).
- **Semantic Structure, `<dl>`, `aria-describedby`, Accessible Names, Zoom & Reduced Motion:** `0` invalid `<dl>` direct children (`<Divider />` sits outside `<dl>` across all routes), `0` dangling `aria-describedby` or `aria-labelledby` IDs across hint-to-error transitions, `0` unnamed controls, `0` `label-content-name-mismatch` findings, `AccountShell` `"Order History"` link sets `aria-current="page"` on both `/account/orders` and `/account/orders/[orderNumber]`, `0px` horizontal overflow at `640x400` and `200%` CSS zoom across all routes, and `prefers-reduced-motion: reduce` collapses transition durations to `0.01ms` (`1e-05s`) with `scrollBehavior: auto`.
- **Blocking Keyboard Focus Defect Found (`A11Y-05-001`):** Live keyboard `Tab` and `ArrowUp`/`ArrowDown` inspection caught a **WCAG 2.4.7 Focus Visible (Level AA)** and `DESIGN.md` §5.1 failure that `axe-core` does not detect statically: on `/checkout`, both the **Saved Shipping Addresses** radio cards (`apps/storefront/src/components/checkout/checkout-view.tsx:722-738`, `767-782`) and the **Shipping Method** radio cards (`apps/storefront/src/components/checkout/checkout-view.tsx:1095-1116`) use `<input type="radio" className="sr-only" />` inside a `<label>` that has **no `has-[:focus-visible]` or `focus-within` outline**, leaving keyboard users with zero visible focus ring on the card while navigating radio options.

---

## 2. Automated `axe-core` WCAG 2.2 AA Scan Matrix (`24 / 24` = `0` Violations)

All scans executed at `1280x800` against live Storefront + API with `withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])`.

| # | Route & State | Theme | Passes | Incomplete | Violations | Failing Rule IDs |
|---:|---|---|---:|---:|---:|---|
| 1 | `/cart` (Empty) | Light | `22` | `0` | `0` | - |
| 2 | `/cart` (Empty) | Dark | `22` | `0` | `0` | - |
| 3 | `/cart` (Populated) | Light | `25` | `1` | `0` | - |
| 4 | `/cart` (Populated) | Dark | `25` | `1` | `0` | - |
| 5 | `/checkout` (Empty) | Light | `22` | `0` | `0` | - |
| 6 | `/checkout` (Empty) | Dark | `22` | `0` | `0` | - |
| 7 | `/checkout` (Guest populated) | Light | `31` | `0` | `0` | - |
| 8 | `/checkout` (Guest populated) | Dark | `31` | `0` | `0` | - |
| 9 | `/checkout` (Guest validation errors) | Light | `31` | `0` | `0` | - |
| 10 | `/checkout` (Guest validation errors) | Dark | `31` | `0` | `0` | - |
| 11 | `/checkout` (Authenticated saved addresses) | Light | `30` | `0` | `0` | - |
| 12 | `/checkout` (Authenticated saved addresses) | Dark | `30` | `0` | `0` | - |
| 13 | `/checkout/status/[orderNumber]` (Pending) | Light | `27` | `1` | `0` | - |
| 14 | `/checkout/status/[orderNumber]` (Pending) | Dark | `27` | `1` | `0` | - |
| 15 | `/checkout/status/[orderNumber]` (Cancel confirmation open) | Light | `29` | `1` | `0` | - |
| 16 | `/checkout/status/[orderNumber]` (Cancel confirmation open) | Dark | `29` | `1` | `0` | - |
| 17 | `/checkout/status/[orderNumber]` (Guest token verification prompt) | Light | `26` | `0` | `0` | - |
| 18 | `/checkout/status/[orderNumber]` (Guest token verification prompt) | Dark | `26` | `0` | `0` | - |
| 19 | `/checkout/status/[orderNumber]` (Cancelled) | Light | `27` | `1` | `0` | - |
| 20 | `/checkout/status/[orderNumber]` (Cancelled) | Dark | `27` | `1` | `0` | - |
| 21 | `/account/orders` (Order History list) | Light | `27` | `0` | `0` | - |
| 22 | `/account/orders` (Order History list) | Dark | `27` | `0` | `0` | - |
| 23 | `/account/orders/[orderNumber]` (Order Detail) | Light | `26` | `0` | `0` | - |
| 24 | `/account/orders/[orderNumber]` (Order Detail) | Dark | `26` | `0` | `0` | - |

*Totals:* **`24` scans**, **`0` total violations**, **`0` page errors**.

---

## 3. Blocking Defect Requiring Repair

### `A11Y-05-001` (`Serious` / Blocking — WCAG 2.4.7 Focus Visible, `DESIGN.md` §5.1)

- **Location:** `apps/storefront/src/components/checkout/checkout-view.tsx`:
  - Saved shipping address radio cards: lines `722-738` (`address` cards) and `767-782` (`"Enter a different shipping address"` card)
  - Shipping courier radio cards: lines `1095-1116` (`shippingOptions` cards)
- **Observed Behavior:**
  - Each radio card renders `<input type="radio" ... className="sr-only" />` inside a `<label className="flex min-h-11 cursor-pointer ... rounded-[var(--radius-sm)] ...">` without any `:focus-within` or `has-[:focus-visible]` focus outline styling.
  - When a keyboard user presses `Tab` into either `[role="radiogroup"]` (`"Saved shipping addresses"` or `"Shipping method"`) or navigates between options with `ArrowUp`/`ArrowDown`:
    - The hidden `1x1px` `<input type="radio" class="sr-only">` receives `:focus-visible` (`outline: 2px solid rgb(31, 78, 121)`), which is visually clipped inside the `1x1px` `sr-only` box.
    - The visible enclosing `<label>` computes `outline: 3px none rgb(23, 25, 27)` (`outlineStyle: "none"`, `boxShadow: "none"`).
  - As a result, sighted keyboard users have **no visible focus indicator** when focusing or arrowing through saved shipping addresses or shipping service methods on `/checkout`.
- **Expected Contract (`DESIGN.md` §5.1 & WCAG 2.4.7):**
  - Every interactive control must display a visible `:focus-visible` ring (`2px solid var(--arven-focus-ring)` with `2px` offset).
- **Recommended Fix:**
  - Add `has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus` to the `<label>` `className` on lines `725`, `769`, and `1098` of `apps/storefront/src/components/checkout/checkout-view.tsx`.

---

## 4. Non-Blocking Advisories

| ID | Severity | Location | Observation & Recommended Polish |
|---|---|---|---|
| `A11Y-05-002` | **Minor (`Advisory`)** | `apps/storefront/src/components/checkout/checkout-status-view.tsx:612-623`, `apps/storefront/src/components/account/order-detail-view.tsx:280-291` | Activating `"Keep Order"` inside the inline cancellation confirmation unmounts the confirmation panel while `"Keep Order"` holds focus, dropping focus to `document.body` instead of restoring focus to the `"Cancel Order"` trigger button. Moving focus back to a ref on `"Cancel Order"` on close preserves keyboard reading position. |
| `A11Y-05-003` | **Minor (`Advisory`, carried from Phase 04)** | `packages/ui/src/components/async-states.tsx` (`<EmptyState />`) | `<EmptyState />` renders `<h3>`, producing an `h1 -> h3` heading level skip on empty `/cart` and empty `/checkout` (does not violate `axe-core` WCAG 2.2 AA). |

---

## 5. Semantic Structure, ARIA, Keyboard, Zoom & Motion Verification Matrix

### 5.1 Landmarks, Headings, `<dl>`, `aria-describedby`, Accessible Names & `AccountShell`

| Route / State | `h1` & Heading Order | `<dl>` Count / Invalid Children | `aria-describedby` Valid / Dangling | Unnamed Controls / `label-content-name-mismatch` | `AccountShell` `"Order History"` `aria-current` | Em-Dashes (`\u2014`) | Result |
|---|---|---|---|---|---|---|---|
| `/cart` (Empty) | `1` `h1`; `h1 -> h3` (`EmptyState` advisory) | `0` / `0` | `0` / `0` | `0` / `0` | N/A | `0` | `PASS` |
| `/cart` (Populated) | `1` `h1`; `0` skips | `2` / `0` | `0` / `0` | `0` / `0` | N/A | `0` | `PASS` |
| `/checkout` (Empty) | `1` `h1`; `h1 -> h3` (`EmptyState` advisory) | `0` / `0` | `0` / `0` | `0` / `0` | N/A | `0` | `PASS` |
| `/checkout` (Guest initial hints) | `1` `h1`; `0` skips | `2` / `0` | `3` / `0` (`guest-email-hint`, `phone-hint`, `coupon-code-hint`) | `0` / `0` | N/A | `0` | `PASS` |
| `/checkout` (Guest validation errors) | `1` `h1`; `0` skips | `2` / `0` | `8` / `0` (all `7` required fields switched cleanly to `*-error` + `coupon-code-hint`) | `0` / `0` | N/A | `0` | `PASS` |
| `/checkout` (Invalid promo `INVALIDCODE99`) | `1` `h1`; `0` skips | `2` / `0` | `3` / `0` (`checkout-coupon-code -> checkout-coupon-code-error`) | `0` / `0` | N/A | `0` | `PASS` |
| `/checkout` (Auth saved addresses) | `1` `h1`; `0` skips | `2` / `0` | `1` / `0` (`checkout-coupon-code-hint`) | `0` / `0` | N/A | `0` | `PASS` |
| `/checkout/status/[orderNumber]` (Pending + Cancel open) | `1` `h1`; `0` skips | `5` / `0` | `0` dangling | `0` / `0` | N/A | `0` | `PASS` |
| `/checkout/status/[orderNumber]` (Guest token prompt hint -> error) | `1` `h1`; `0` skips | `0` / `0` | `1` / `0` (`guest-order-token-input-hint` -> `guest-order-token-input-error`) | `0` / `0` | N/A | `0` | `PASS` |
| `/checkout/status/[orderNumber]` (Cancelled) | `1` `h1`; `0` skips | `5` / `0` | `0` dangling | `0` / `0` | N/A | `0` | `PASS` |
| `/account/orders` | `1` `h1`; `0` skips | `10` / `0` | `0` / `0` | `0` / `0` | `"page"` | `0` | `PASS` |
| `/account/orders/[orderNumber]` | `1` `h1`; `0` skips | `3` / `0` | `0` / `0` | `0` / `0` | `"page"` | `0` | `PASS` |

- **Note on `Bag` Link & `ThemeToggle` (`label-content-name-mismatch`):** Verified `Bag` link (`a[href="/cart"]`) and `ThemeToggle` (`"Dark"` / `"Light"` with `aria-label="Switch to dark theme"` / `"Switch to light theme"`) produce `0` `label-content-name-mismatch` violations in both `axe-core` and DOM text-inclusion checks.
- **Note on `<dl>` Definition Lists:** Across all `22` inspected `<dl>` elements across `/cart`, `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, and `/account/orders/[orderNumber]`, every `<Divider />` sits strictly outside `<dl>`, with `0` invalid direct children.

### 5.2 Keyboard Navigation, Skip Link & `:focus-visible` Focus Rings

| Route / Flow | Skip Link (`Tab` -> `Enter` -> `#main-content`) | `Tab` / `Shift+Tab` Traversal | Missing `:focus-visible` Rings | Radio / Interactive Keyboard Checks | Result |
|---|---|---|---|---|---|
| `/cart` (Empty) | `PASS` (`2px solid rgb(31, 78, 121)` -> `#main-content`) | `PASS` (`13` unique controls, `Shift+Tab` reverses cleanly) | `0` | All controls reachable | `PASS` |
| `/cart` (Populated) | `PASS` (`2px solid rgb(31, 78, 121)` -> `#main-content`) | `PASS` (`18` unique controls, `Shift+Tab` reverses cleanly) | `0` | Quantity steppers, `Remove`, `Proceed to Checkout` reachable | `PASS` |
| `/checkout` (Guest populated) | `PASS` (`2px solid rgb(31, 78, 121)` -> `#main-content`) | `PASS` (`26` unique controls, `Shift+Tab` reverses cleanly) | **`1` group (`shippingService` radio cards)** | `ArrowDown` toggles shipping service (`shippingRadioKeyboardOk: true`), but `<label>` outline is `none` (`A11Y-05-001`) | **`FAIL`** |
| `/checkout` (Auth saved addresses) | `PASS` (`2px solid rgb(31, 78, 121)` -> `#main-content`) | `PASS` (`18` unique controls) | **`2` groups (`checkoutAddressOption` + `shippingService` radio cards)** | `ArrowDown`/`ArrowUp` toggles saved vs custom address (`addrRadioKeyboardOk: true`), but `<label>` outline is `none` (`A11Y-05-001`) | **`FAIL`** |
| `/checkout/status/[orderNumber]` | Verified | `PASS` (`16` controls, `Shift+Tab` reverses cleanly) | `0` | `Cancel Order` opens inline confirmation via `Enter`; `#status-cancel-reason`, `Confirm Cancellation`, `Keep Order` reachable | `PASS` |
| `/account/orders` | `PASS` (`2px solid rgb(31, 78, 121)` -> `#main-content`) | `PASS` (`28` unique controls, `Shift+Tab` reverses cleanly) | `0` | `AccountShell` links, status filters, `View Order` links reachable | `PASS` |
| `/account/orders/[orderNumber]` | Verified | `PASS` (`18` controls, `Shift+Tab` reverses cleanly) | `0` | `Back to Order History`, `Continue to Payment`, `Cancel Order` reachable | `PASS` |

### 5.3 `200%` Browser Zoom, `640x400` Reflow & `prefers-reduced-motion: reduce`

| Route / State | `640x400` Viewport (`scrollWidth / innerWidth`) | `200%` CSS Zoom at `1280x800` (`scrollWidth / innerWidth`) | Horizontal Overflow | Result |
|---|---|---|---|---|
| `/cart` (Empty) | `640 / 640` | `1280 / 1280` | `0px` | `PASS` |
| `/cart` (Populated) | `640 / 640` | `1280 / 1280` | `0px` | `PASS` |
| `/checkout` (Guest populated) | `640 / 640` | `1280 / 1280` | `0px` | `PASS` |
| `/checkout/status/[orderNumber]` (Pending) | `640 / 640` | `1280 / 1280` | `0px` | `PASS` |
| `/account/orders` | `640 / 640` | `1280 / 1280` | `0px` | `PASS` |
| `/account/orders/[orderNumber]` | `640 / 640` | `1280 / 1280` | `0px` | `PASS` |

- **`prefers-reduced-motion: reduce`:** Verified on `/account/orders/[orderNumber]` via `page.emulateMedia({ reducedMotion: 'reduce' })`: `window.matchMedia('(prefers-reduced-motion: reduce)').matches === true`, `scrollBehavior === "auto"`, and `transitionDuration === "1e-05s"` (`0.01ms`).

---

## 6. Synthetic Test Order Cleanup Verification

- **Guest order `ARV-20261116-B47898`:** Cancelled via UI (`Cancel Order` -> `Confirm Cancellation` on `/checkout/status/ARV-20261116-B47898`).
- **Authenticated order `ARV-20261116-0DC352` (and interrupted-run `ARV-20261116-B7A350`):** Cancelled via UI on `/account/orders/[orderNumber]`.
- **Post-Audit API Check:**
  - `GET /api/v1/orders?status=PENDING_PAYMENT&limit=20` -> `meta.total = 0` (`0` pending orders remaining)
  - `GET /api/v1/products/essentials-heavyweight-crew-tee` -> `ARV-TOP-001` `availableQty = 25` (baseline stock restored, `0` reserved units)
  - Customer cart emptied cleanly post-verification.

---

## 7. Final Checkpoint Verdict

- **Checkpoint `accessibility` Verdict:** **`FAIL`**
- **Reason:** Blocking WCAG 2.4.7 (Focus Visible) defect `A11Y-05-001` on `/checkout` saved shipping address cards and shipping method radio cards (`apps/storefront/src/components/checkout/checkout-view.tsx:722-738, 767-782, 1095-1116`), where `sr-only` `<input type="radio">` elements lack `has-[:focus-visible]` / `focus-within` outline styling on their enclosing `<label>` cards.


---

## Repair Iteration 2 Re-Verification (2026-11-16)

> **Verifier note:** The `accessibility-qa-agent` subagents (`e7e0cf3f-2b97-4aa6-b9cb-75fa8183745f` and the replacement `aefba5f7-cbcf-48d8-868f-ff7dd9b8a097`) both stopped with `RESOURCE_EXHAUSTED (429)` (reset in about 119h). This re-verification was therefore run by the orchestrator, not by an independent QA subagent. The orchestrator did not write the Phase 05 application code. Script: `a11y-repair2.mjs` (Playwright 1.65.1 + `@axe-core/playwright` 4.14.0, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, viewport `1280x800`). Raw metrics: [`screenshots/accessibility/post-repair2-metrics.json`](./screenshots/accessibility/post-repair2-metrics.json).

**Overall verdict for this section: PASS** (resolves `A11Y-05-001` and `A11Y-05-002`).

| Check | Result |
|---|---|
| `A11Y-05-001` focus ring on `/checkout` radio cards (authenticated customer, saved address + shipping method) | `12` radio focus events across both themes, `0` missing a focus-visible outline. Light: `2px solid rgb(23, 25, 27)` offset `2px`. Dark: `2px solid rgb(248, 247, 243)` offset `2px`. Input names covered: `checkoutAddressOption`, `shippingService`. |
| `A11Y-05-002` focus restore on `Keep Order` | `/checkout/status/ARV-20261116-27F24A`: focus returned to `Cancel Order`. `/account/orders/ARV-20261116-63C8FC`: focus returned to `Cancel Order`. |
| axe-core WCAG 2.2 AA scans | `9` scans, `0` violations: `/checkout` (light, dark), `/checkout/status` pending (light, dark), cancel panel open, cancelled, `/account/orders/[orderNumber]` pending (light, dark), cancel panel open. |
| Cleanup | Both test orders cancelled via UI. `GET /api/v1/orders?status=PENDING_PAYMENT&limit=20` returned `0`. |

**Not covered in this re-run** (still valid from the first pass, `24/24` scans, `0` violations): guest `/checkout` states, `/cart`, `/account/orders`, 200% zoom, reduced motion. The `/checkout` guest radio cards share the same label classes as the authenticated ones but were not tab-tested here. The custom-address radio card was not separately identified in the metrics (both address cards share the `checkoutAddressOption` name). Advisory `A11Y-05-003` (`EmptyState` renders `<h3>`, inherited from Phase 04) remains open and non-blocking.
