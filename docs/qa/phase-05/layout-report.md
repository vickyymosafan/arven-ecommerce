# ARVEN Phase 05 Visual Layout QA Report

> **Harness Plan ID:** `7046df9d-13df-413d-b6ae-2ebaaaa6ddd9`  
> **Task ID:** `51a02cf3-b5bc-4532-a940-a0eed9ebe552`  
> **Checkpoint ID:** `layout`  
> **Independent Verifier:** `visual-qa-agent`  
> **Execution Timestamp (UTC):** `2026-11-16T02:27:50Z`  
> **Overall Verdict:** `PASS` *(with 1 non-blocking minor alignment advisory `LAY-05-001`)*

---

## 1. Executive Summary

Independent visual and DOM layout verification was completed across Storefront (`http://localhost:3000`) for all Phase 05 commerce routes by inspecting the existing captures in [`docs/qa/phase-05/screenshots/responsive/`](./screenshots/responsive/) and executing a fresh Playwright Chromium visual + DOM geometry audit (`20` screenshots + [`layout-metrics.json`](./screenshots/layout/layout-metrics.json)) saved in [`docs/qa/phase-05/screenshots/layout/`](./screenshots/layout/) across mobile (`375x812`) and desktop (`1440x900`).

All Phase 05 layout criteria **PASS**:

- **Zero Horizontal Overflow & Out-of-Bounds Elements:** `0px` horizontal overflow (`scrollWidth === innerWidth`) and `0` out-of-bounds elements across all `18` full-page viewport captures + `2` desktop loading/scrolled state captures.
- **Semantic `<dl>` & `<Divider />` Integrity:** Every `<dl>` block inspected across `/cart`, `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, and `/account/orders/[orderNumber]` contains zero `<hr>` / `<Divider />` children and zero invalid direct children (`hasHr: false`, `invalidChildren: []`).
- **Single-Line `formatIDR` Totals:** Every monetary total, subtotal, discount, shipping fee, and grand total renders on `1` single line (`white-space: nowrap`, `lineCount: 1`, `tabular-nums`, `isClipped: false`).
- **Desktop Split & Sticky Alignment:** `/cart` (`8+4`), `/checkout` (`7+5`), `/checkout/status/[orderNumber]` (`7+5`), and `/account/orders/[orderNumber]` (`7+5`) align left and right columns at exact `topDeltaPx: 0` on `1440x900`. On `/checkout` scrolled (`scrollY: 520`), the sticky `Order Summary` (`lg:sticky lg:top-24`) pins cleanly at `top: 96px` with `31px` clearance below the `65px` sticky header.
- **Loading Skeleton Reserved Height:** `/checkout` loading state (`min-h-[38rem]`) reserves `608px` vertical height (`statusHeight: 376px`, 6 skeleton rows) prior to hydration.
- **Responsive Presentation Reflow:** `/account/orders` renders stacked cards below `768px` (`375x812`: `mobileCardsVisible: true`, `desktopTableVisible: false`) and a bordered data table at `>= 768px` (`1440x900`: `mobileCardsVisible: false`, `desktopTableVisible: true`). `AccountShell` keeps `"Order History"` active (`aria-current="page"`) on both `/account/orders` and `/account/orders/[orderNumber]`.
- **Clean Synthetic Order Cleanup:** All synthetic test orders created during inspection (`ARV-20261116-07C090`, `ARV-20261116-DFCDD6`, and interrupted-run `ARV-20261116-A67F9A`) were cancelled cleanly via UI confirmation (`Cancel Order` -> `Confirm Cancellation`); post-cleanup query verified `0` `PENDING_PAYMENT` orders remaining so reserved inventory returned to `0`.
- **Design & Anti-Slop Hygiene:** `0` broken images, `0` em dashes (`\u2014`), `0` pink hues, `0` pulsing status dots, `0` page errors, `0` HTTP `>= 500` responses.

---

## 2. Prior Responsive Captures Inspected (`docs/qa/phase-05/screenshots/responsive/`)

Reviewed `post-repair-cart-1440x900.png`, `post-repair-cart-375x812.png`, `post-repair-guest-checkout-1280x800.png`, `post-repair-auth-checkout-1280x800.png`, `guest-checkout-status-1440x900.png`, `guest-checkout-status-375x812.png`, `guest-checkout-status-cancelled-1280x800.png`, `account-orders-list-375x812.png`, `account-orders-list-1440x900.png`, `account-order-detail-375x812.png`, and `account-order-detail-1440x900.png`:

- Confirmed post-repair `/cart` line-item title link vertical hit height (`>= 44px`) and clean `8+4` / stacked reflow without clipping.
- Observed in the earlier `guest-checkout-status-375x812.png` and `guest-checkout-status-cancelled-1280x800.png` captures that a transient fixed toast / mid-page scroll offset appeared in Playwright `fullPage: true` renders; fresh captures in `screenshots/layout/` explicitly reset scroll (`y = 0`) and dismiss transient toasts to verify clean underlying page composition, alongside a dedicated scrolled capture (`checkout-guest-scrolled-1440x900.png`) for sticky-summary verification.
- Observed the `Apply Code` button vertical offset in Step 03 (`Promotional Code`) on `post-repair-guest-checkout-1280x800.png` and `post-repair-auth-checkout-1280x800.png`, quantified below as `LAY-05-001`.

---

## 3. Fresh Visual & DOM Layout Audit (`docs/qa/phase-05/screenshots/layout/`)

Full DOM telemetry is stored in [`docs/qa/phase-05/screenshots/layout/layout-metrics.json`](./screenshots/layout/layout-metrics.json).

### 3.1 Route-by-Route Verification Matrix

| Route & State | Viewports (`375x812`, `1440x900`) | Overflow / OOB / Broken Img | `<dl>` Semantic Check | `formatIDR` `nowrap` / Single-Line | Key Layout & Composition Checks | Screenshots |
|---|---|---|---|---|---|---|
| `/cart` (Empty) | `375x812`, `1440x900` | `0px` / `0` / `0` | N/A | N/A | `"Your Bag Is Empty"` `EmptyState` with primary `"Explore Catalog"` + `"View Capsules"`, zero staging banner | [`cart-empty-375x812.png`](./screenshots/layout/cart-empty-375x812.png), [`cart-empty-1440x900.png`](./screenshots/layout/cart-empty-1440x900.png) |
| `/cart` (Populated) | `375x812`, `1440x900` | `0px` / `0` / `0` (`1/1` img) | `2` `<dl>` blocks, `hasHr: false`, `invalidChildren: []` | `<dd>` `Rp 299.000` (`nowrap`, `1` line, `120x28px`, `tabular-nums`) | `"Proceed to Checkout"` (`href="/checkout"`, `361x48px` desktop); `<Divider />` strictly outside `<dl>`; `1440x900` `8+4` split (`885px` + `427px`, `top: 263px`, `topDeltaPx: 0`) | [`cart-populated-375x812.png`](./screenshots/layout/cart-populated-375x812.png), [`cart-populated-1440x900.png`](./screenshots/layout/cart-populated-1440x900.png) |
| `/checkout` (Loading Skeleton) | `1440x900` | `0px` / `0` / `0` | N/A | N/A | Reserved wrapper `min-h-[38rem]` measured `608px` height (`statusHeight: 376px`, 6 rows) | [`checkout-loading-1440x900.png`](./screenshots/layout/checkout-loading-1440x900.png) |
| `/checkout` (Guest Populated) | `375x812`, `1440x900` | `0px` / `0` / `0` (`1/1` img) | `2` `<dl>` blocks, `hasHr: false`, `invalidChildren: []` | All `9` IDR items `1` line (`dd` `nowrap`, `isClipped: false`) | `375x812` single column (`343px`); `1440x900` `7+5` (`771px` + `541px`, `top: 262px`, `topDeltaPx: 0`) | [`checkout-guest-375x812.png`](./screenshots/layout/checkout-guest-375x812.png), [`checkout-guest-1440x900.png`](./screenshots/layout/checkout-guest-1440x900.png) |
| `/checkout` (Guest + `WELCOME10` & Scrolled Sticky) | `375x812`, `1440x900` (`y=0` & `y=520`) | `0px` / `0` / `0` (`1/1` img) | `2` `<dl>` blocks, `hasHr: false`, `invalidChildren: []` | `Rp 299.000`, `-Rp 29.900`, `Rp 16.000`, `Rp 285.100` (`nowrap`, `1` line) | Success banner (`Applied WELCOME10`), `Remove Code` toggle, discounted item line (`Rp 269.100`), `Promo Discount (WELCOME10)`; at `scrollY: 520`, sticky `aside` pins at `top: 96px` (`31px` below `65px` header) | [`checkout-guest-welcome10-375x812.png`](./screenshots/layout/checkout-guest-welcome10-375x812.png), [`checkout-guest-welcome10-1440x900.png`](./screenshots/layout/checkout-guest-welcome10-1440x900.png), [`checkout-guest-scrolled-1440x900.png`](./screenshots/layout/checkout-guest-scrolled-1440x900.png) |
| `/checkout` (Authenticated Saved Address) | `375x812`, `1440x900` | `0px` / `0` / `0` (`1/1` img) | `2` `<dl>` blocks, `hasHr: false`, `invalidChildren: []` | All `9` IDR items `1` line (`nowrap`, `isClipped: false`) | `"Ordering as ARVEN Dev Customer"`, `"Primary Residence"` (`DEFAULT` + `SELECTED` badges, `2px` border), `"Enter a different shipping address"` option, `topDeltaPx: 0` (`262px`) | [`checkout-auth-saved-375x812.png`](./screenshots/layout/checkout-auth-saved-375x812.png), [`checkout-auth-saved-1440x900.png`](./screenshots/layout/checkout-auth-saved-1440x900.png) |
| `/checkout/status/ARV-20261116-07C090` (`PENDING_PAYMENT`) | `375x812`, `1440x900` | `0px` / `0` / `0` | `5` `<dl>` blocks, `hasHr: false`, `invalidChildren: []` | All `7` IDR items `1` line (`dd`/`span` `nowrap`, `isClipped: false`) | Payment session summary (`Midtrans Payment Session`, `AWAITING PAYMENT`, WIB deadline), `Itemized Order`, `Receipt Summary` (`Subtotal`, `Promo Discount`, `Shipping`, `GRAND TOTAL`), `Shipping Destination`; `1440x900` `top: 371px`, `topDeltaPx: 0` | [`checkout-status-pending-375x812.png`](./screenshots/layout/checkout-status-pending-375x812.png), [`checkout-status-pending-1440x900.png`](./screenshots/layout/checkout-status-pending-1440x900.png) |
| `/checkout/status/ARV-20261116-07C090` (`CANCELLED`) | `375x812`, `1440x900` | `0px` / `0` / `0` | `5` `<dl>` blocks, `hasHr: false`, `invalidChildren: []` | All `7` IDR items `1` line (`nowrap`, `isClipped: false`) | `CANCELLED` badge, danger release banner, `SESSION EXPIRED` payment badge, cancel/pay actions cleanly removed | [`checkout-status-cancelled-375x812.png`](./screenshots/layout/checkout-status-cancelled-375x812.png), [`checkout-status-cancelled-1440x900.png`](./screenshots/layout/checkout-status-cancelled-1440x900.png) |
| `/account/orders` | `375x812`, `1440x900` | `0px` / `0` / `0` | `5` `<dl>` blocks, `hasHr: false`, `invalidChildren: []` | All `5` `Rp 815.000` totals `1` line (`nowrap`, `tabular-nums`) | `375x812`: `mobileCardsVisible: true`, `desktopTableVisible: false` (`md:hidden` cards); `1440x900`: `mobileCardsVisible: false`, `desktopTableVisible: true` (bordered table); `AccountShell` `"Order History"` `aria-current="page"` | [`account-orders-375x812.png`](./screenshots/layout/account-orders-375x812.png), [`account-orders-1440x900.png`](./screenshots/layout/account-orders-1440x900.png) |
| `/account/orders/ARV-20261116-DFCDD6` | `375x812`, `1440x900` | `0px` / `0` / `0` | `3` `<dl>` blocks, `hasHr: false`, `invalidChildren: []` | All `6` IDR items `1` line (`nowrap`, `tabular-nums`) | `AccountShell` `"Order History"` tab active (`aria-current="page"`), `"Back to Order History"` link, `Order Snapshot`, `Ordered Garments`, `Status Timeline`, `Payment Totals`, `Delivery Destination`, `Payment Record` | [`account-order-detail-375x812.png`](./screenshots/layout/account-order-detail-375x812.png), [`account-order-detail-1440x900.png`](./screenshots/layout/account-order-detail-1440x900.png) |

---

## 4. Layout Observations & Minor Advisories (Non-Blocking)

| ID | Severity | Location | Measurement / Root Cause | Impact & Recommended Polish |
|---|---|---|---|---|
| `LAY-05-001` | **Minor (`Advisory`)** | `apps/storefront/src/components/checkout/checkout-view.tsx` (`L1151`) | In Step 03 (`Promotional Code`), the row uses `flex flex-col gap-3 sm:flex-row sm:items-end`. Because `FormField` stacks `<label>` above `<Input>` and a hint `<p>` below `<Input>`, `sm:items-end` aligns `"Apply Code"` / `"Remove Code"` with the bottom of the hint text instead of `#checkout-coupon-code`: on `1440x900`, `input` is `top: 1560..1606` (`46px`) while `"Apply Code"` is `top: 1587..1631` (`44px`), a `+28px` top / `+26px` bottom downward offset. | No overlap, clipping, overflow, or tap-target violation (`44px` height met). For crisp horizontal alignment with the `<Input>` box regardless of hint or error lines, switch the row to `sm:items-start` and give the button wrapper `sm:mt-[22px]` (matching `FormField` label height + `gap-1.5`). |
| `LAY-05-002` | **Minor (`Inherited Shell`)** | `apps/storefront/src/components/storefront-shell.tsx` (`L327`) | Footer text link `"Bag"` (`min-h-11 px-1`) measures `31.1 × 44 px` (meets `44px` vertical height, below `44px` horizontal width due to 3-character label). All Phase 05 interactive controls across `/cart`, `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, and `/account/orders/[orderNumber]` meet `>= 44 × 44 px`. | Inherited from `StorefrontShell` (Phase 03/04); zero Phase 05 control failures. Optional shell polish: widen footer link horizontal hit padding (`px-2.5` or `min-w-11 justify-center`). |

*(Note: During authenticated `/auth/login`, Next.js client telemetry recorded the known Phase 04 `1× HTTP 403` pre-login CSRF cache transition on `/api/v1/cart/merge` before auto-retry succeeded; `0` console/page/HTTP errors occurred on `/cart`, `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, or `/account/orders/[orderNumber]`.)*

---

## 5. Synthetic Test Data Cleanup

- `ARV-20261116-07C090` (Guest order with `WELCOME10`): Cancelled cleanly via UI confirmation on `/checkout/status/ARV-20261116-07C090`.
- `ARV-20261116-DFCDD6` (Customer order for `customer.dev@arven.local`): Cancelled cleanly via UI confirmation on `/account/orders/ARV-20261116-DFCDD6`.
- `ARV-20261116-A67F9A` (Prior interrupted-run pending order for `customer.dev@arven.local`): Cancelled cleanly via UI confirmation on `/account/orders/ARV-20261116-A67F9A`.
- Post-cleanup check (`GET /api/v1/orders?status=PENDING_PAYMENT&limit=20`): `200 OK`, `pendingCount: 0` (reserved stock returned to `0`).

---

## 6. Checkpoint Verdict

- **Checkpoint `layout`:** **`PASS`** (zero overflow, zero clipping, zero overlaps, semantic `<dl>` + `<Divider />` structure verified, single-line `nowrap` IDR totals verified, sticky summary alignment & loading skeleton reserved height verified, and responsive card/table reflow verified across `375x812` and `1440x900`).


---

## 7. Repair Iteration 2 Re-Verification

> **Re-Verification Timestamp (UTC):** `2026-11-16T04:16:04Z`  
> **Post-Repair-2 Verdict:** `PASS` (`LAY-05-001` resolved)

Following Repair Iteration 2 (`checkout-view.tsx` `has-[:focus-visible]` radio card outlines + `sm:items-start` `sm:mt-[22px]` coupon button alignment, `checkout-status-view.tsx` & `order-detail-view.tsx` native `<button>` ref `Cancel Order` danger styling + focus restoration, and `cart-view.tsx` `whitespace-nowrap` IDR prices), a focused Playwright layout audit (`11` fresh `r2-*` screenshots + [`post-repair2-metrics.json`](./screenshots/layout/post-repair2-metrics.json)) verified:

1. **`LAY-05-001` Resolved — Step 03 Coupon Button Alignment (`/checkout`, `1440x900`):**
   - Guest (`/checkout` before promo): `#checkout-coupon-code` (`top: 1560..1606`, `46px`) vs `"Apply Code"` (`top: 1560..1604`, `44px`) -> **`topDeltaPx: 0`**, `bottomDeltaPx: -2` (visually flush in [`r2-checkout-guest-1440x900.png`](./screenshots/layout/r2-checkout-guest-1440x900.png)).
   - Guest (`/checkout` with `WELCOME10` applied): `#checkout-coupon-code` (`top: 1524..1570`, `46px`) vs `"Remove Code"` (`top: 1524..1568`, `44px`) -> **`topDeltaPx: 0`**, `bottomDeltaPx: -2` ([`r2-checkout-guest-welcome10-1440x900.png`](./screenshots/layout/r2-checkout-guest-welcome10-1440x900.png)).
   - Authenticated (`/checkout` saved address): `#checkout-coupon-code` (`top: 1355..1401`, `46px`) vs `"Apply Code"` (`top: 1355..1399`, `44px`) -> **`topDeltaPx: 0`**, `bottomDeltaPx: -2` ([`r2-checkout-auth-saved-1440x900.png`](./screenshots/layout/r2-checkout-auth-saved-1440x900.png)).
2. **Radio Card Styling (`checkout-view.tsx`):**
   - All radio cards (`4` shipping options on guest `/checkout`, `2` saved address + `4` shipping options on auth `/checkout`) carry `has-[:focus-visible]` focus-ring styling, `54px–126px` height, `0px` horizontal overflow ([`r2-checkout-auth-saved-1440x900.png`](./screenshots/layout/r2-checkout-auth-saved-1440x900.png)).
3. **Native `"Cancel Order"` Button Styling (`checkout-status-view.tsx` & `order-detail-view.tsx`):**
   - Rendered dimensions `137 × 44 px` across both `375x812` and `1440x900` on `/checkout/status/ARV-20261116-1278AD` and `/account/orders/ARV-20261116-8A38A4`, matching the `@arven/ui` danger button spec (`backgroundColor: rgb(156, 61, 61)`, `color: rgb(255, 255, 255)`, `borderRadius: 4px`, `fontSize: 14px`, `fontWeight: 500`, `0px` overflow) ([`r2-checkout-status-pending-1440x900.png`](./screenshots/layout/r2-checkout-status-pending-1440x900.png), [`r2-checkout-status-pending-375x812.png`](./screenshots/layout/r2-checkout-status-pending-375x812.png), [`r2-account-order-detail-1440x900.png`](./screenshots/layout/r2-account-order-detail-1440x900.png), [`r2-account-order-detail-375x812.png`](./screenshots/layout/r2-account-order-detail-375x812.png)).
   - On `/account/orders/ARV-20261116-8A38A4`, clicking `"Cancel Order"` -> `"Keep Order"` synchronously restored `document.activeElement` to `"Cancel Order"`. *(Note: on `/checkout/status/ARV-20261116-1278AD`, `requestAnimationFrame` focus restoration had not yet fired synchronously on the immediate next microtask; deferred focus restoration is verified by functional/accessibility checks.)*
4. **Single-Line `formatIDR` `nowrap` on `/cart` (`TYP-05-002`, `cart-view.tsx`):**
   - Unit price (`<span>` `Rp 299.000`), line subtotal (`<p>` `Rp 299.000`), and server subtotal (`<dd>` `Rp 299.000`) all report `whiteSpace: "nowrap"`, `lineCount: 1`, `isClipped: false`, `tabular-nums`, and `0px` horizontal overflow across `375x812` & `1440x900` ([`r2-cart-populated-375x812.png`](./screenshots/layout/r2-cart-populated-375x812.png), [`r2-cart-populated-1440x900.png`](./screenshots/layout/r2-cart-populated-1440x900.png)).
5. **Clean Order Cleanup:**
   - Temporary orders `ARV-20261116-1278AD` (guest) and `ARV-20261116-8A38A4` (customer) were cancelled via UI confirmation; post-cleanup `GET /api/v1/orders?status=PENDING_PAYMENT&limit=20` returned `200 OK`, `pendingCount: 0`.
