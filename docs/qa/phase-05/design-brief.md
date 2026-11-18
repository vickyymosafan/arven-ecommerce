# Phase 05 Design Brief: Cart Checkout Handoff, Checkout Flow, Order Status & Order History

> **Scope:** `apps/storefront` Phase 05 Commerce UI (`/cart`, `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, `/account/orders/[orderNumber]`)  
> **Authority:** [`DESIGN.md`](../../../DESIGN.md), [`docs/API_CONTRACTS.md`](../../API_CONTRACTS.md), [`docs/PRD_AND_BUSINESS_RULES.md`](../../PRD_AND_BUSINESS_RULES.md)  
> **Shared Primitives:** `@arven/ui` (`Button`, `LinkButton`, `Surface`, `Divider`, `Badge`, `StatusChip`, `StatusBanner`, `EmptyState`, `LoadingState`, `ErrorState`, `FormField`, `Input`, `Select`, `Textarea`, `Modal`, `formatIDR`, `formatWIB`)

---

## 1. `/cart` Checkout Handoff (`apps/storefront/src/components/cart/cart-view.tsx`)

- **Replace Staging Notice:** Remove the Phase 04 `StatusBanner` (`title="Checkout Staging"`).
- **Primary CTA:** Render `"Proceed to Checkout"` linking to `/checkout` via `LinkButton` (`variant="primary"`, `size="lg"`, `fullWidth`, `min-h-11`).
- **Blocked / Unavailable Guard:** When `cart.hasUnavailableItems` is `true`, disable checkout progression (render a disabled `Button` with explicit inline helper text explaining why checkout is paused until flagged items are adjusted or removed) while keeping `"Continue Shopping"` (`/shop`) available as `variant="secondary"`.
- **Guest Convenience:** Retain `"Sign In to Save Bag"` (`/auth/login?next=/cart`) as a secondary action when `cart.ownerType === 'GUEST'`.
- **Monetary & Stock Clarity:** Keep all unit prices, compare-at prices, line subtotals, and authoritative server subtotal rendered with `formatIDR(...)` and `tabular-nums`.

---

## 2. `/checkout` Page (`apps/storefront/src/app/checkout/page.tsx` + client view)

### 2.1 Responsive 12-Column Grid
- **Mobile & Tablet (`< 1024px`):** Single-column flow (`grid-cols-1 gap-8`), stacking form steps cleanly without horizontal overflow (`scrollWidth <= innerWidth` down to `320px`).
- **Desktop (`>= 1024px`):** Asymmetric `7 + 5` split (`lg:grid-cols-12 lg:items-start`):
  - Left (`lg:col-span-7`, `min-w-0`): Contact & Shipping Address, Shipping Courier Selection, Promo Coupon Input.
  - Right (`lg:col-span-5`, `min-w-0 lg:sticky lg:top-24`): Server-quoted Order Summary + Primary Submit CTA.

### 2.2 Checkout Form Sections (`lg:col-span-7`)
1. **Contact & Shipping Address:**
   - **Authenticated User:** Selectable saved address cards from Address Book (`role="radiogroup"`, `aria-checked`, visible `2px` border + checkmark/label, `>= 44px` hit target) plus an option to enter a new shipping address or manage addresses (`/account/addresses`).
   - **Guest User:** Validated shipping & contact form (`email`, `recipientName`, `phone`, `streetAddress`, `city`, `province`, `postalCode`, `notes`) using `@arven/ui` `FormField`, `Input`, `Select`, and `Textarea`.
   - Apply `scroll-margin-bottom` on inputs so mobile virtual keyboards do not cover focused fields.
2. **Courier / Shipping Service Selector:**
   - Accessible `fieldset` / `legend` radio group populated from server quote/rates (`courierCode`, `serviceName`, ETA text, and `formatIDR(costIdr)` with `tabular-nums`).
   - Changing destination or courier triggers a fresh server quote (`POST /checkout/quote`).
3. **Promo Coupon Input:**
   - Horizontal input + `"Apply"` / `"Remove"` button (`min-h-11`, wraps cleanly at `320px`).
   - Inline validation and server feedback (`StatusBanner` / field error) for invalid, expired, or ineligible codes; never trust client-calculated discounts.

### 2.3 Order Summary & Safe Submission (`lg:col-span-5`)
- **Line Items Preview:** Compact garment thumbnails (`aspect-[3/4]`, `bg-subtle`), product title, color/size, quantity (`tabular-nums`), and line subtotal (`formatIDR` `tabular-nums`).
- **Server-Quoted Totals:** `Subtotal`, `Promo Discount` (when `> 0`), `Shipping`, and `Total` formatted via `formatIDR(...)` with `tabular-nums` and explicit server-authority note.
- **Idempotent Submission:**
  - Generate and retain a single `Idempotency-Key` per active checkout payload; regenerate only when cart/address/courier/coupon inputs change, so retries do not create duplicate orders.
  - Submit CTA (`"Place Order & Pay"`, `size="lg"`, `fullWidth`, `min-h-11`) enters `isLoading` (`"Processing Order..."`) while locking duplicate clicks.
- **Required Recovery States:**
  - **Empty Cart:** Render `EmptyState` linking back to `/shop`.
  - **Quote Stale / Expired:** Inline `StatusBanner` (`tone="warning"`) with `"Refresh Quote"` button.
  - **Stock Reservation Conflict (`409`):** `StatusBanner` (`tone="danger"`, `role="alert"`) naming the conflict and linking directly back to `/cart`.
  - **Payment Session Failure:** If order was created in `PENDING_PAYMENT` but payment redirect/session failed, navigate to `/checkout/status/[orderNumber]` or surface `"Retry Payment"` without duplicating the order.

---

## 3. `/checkout/status/[orderNumber]` Page

- **Non-Mutating Poll View:** Never mark an order paid from URL query parameters or browser redirects. Fetch authoritative status from the server on mount and poll cleanly at a bounded interval only while status is `PENDING_PAYMENT` (stopping immediately on terminal states). Include an explicit manual `"Refresh Status"` button (`min-h-11`).
- **Order Status Badges (`Badge` / `StatusChip`):** Pair color with explicit text labels (zero pulsing status dots):
  - `PENDING_PAYMENT` -> `warning` (`"Pending Payment"`)
  - `PAID` -> `success` (`"Payment Confirmed"`)
  - `EXPIRED` -> `neutral` or `warning` (`"Payment Expired"`)
  - `CANCELLED` -> `danger` (`"Cancelled"`)
- **WIB Expiry Timestamp:** Display `paymentExpiresAt` using `formatWIB(...)` (`Asia/Jakarta`, `WIB`, `tabular-nums`) when `PENDING_PAYMENT`.
- **Payment Action:** When `PENDING_PAYMENT` and a payment session URL/action is active, show a clear `"Complete Payment"` / `"Open Payment Page"` action (plus `"Retry Payment Session"` if no active URL is available).
- **Cancel Order Flow:** When `PENDING_PAYMENT` and cancellation is permitted, provide a `"Cancel Order"` secondary/danger control guarded by an explicit confirmation step (`Modal` or inline confirmation prompt) before invoking the cancel mutation, disabling buttons while in flight.
- **Summary & Next Navigation:** Display monospace `orderNumber` (`font-mono`), itemized lines and totals (`formatIDR` `tabular-nums`), and post-payment links to `/account/orders/[orderNumber]` (for authenticated users) or `/shop`.

---

## 4. `/account/orders` & `/account/orders/[orderNumber]` + `AccountShell`

### 4.1 `AccountShell` Navigation (`apps/storefront/src/components/account-shell.tsx`)
- Add `{ href: '/account/orders', label: 'Order History' }` to `accountNavItems`.
- Update active-state matching so `"Order History"` remains `aria-current="page"` on both `/account/orders` and `/account/orders/[orderNumber]` (`pathname === item.href || (item.href === '/account/orders' && pathname.startsWith('/account/orders/'))`).

### 4.2 Order History List (`/account/orders`)
- Wrap in `AccountShell` (`title="Order History"`).
- **Responsive Presentation:** Render clean stacked summary cards on mobile (`< 768px`) and a structured table or grid rows on `>= 768px` (wrapped in `overflow-x-auto` if tabular) with zero horizontal page overflow.
- **Fields per Order:** `orderNumber` (`font-mono`), created timestamp (`formatWIB`, `WIB`), order/payment status `Badge`, item count (`tabular-nums`), total (`formatIDR` `tabular-nums`), and `"View Order"` link (`min-h-11`).
- **Async States:** Reserved-height `LoadingState`, `EmptyState` (`"No Orders Yet"` + `/shop` CTA), and `ErrorState` with retry.

### 4.3 Order Detail (`/account/orders/[orderNumber]`)
- Wrap in `AccountShell`, including a `"Back to Order History"` link (`min-h-11`).
- **Header & Status:** Monospace `orderNumber`, placed date (`formatWIB`), order & payment `Badge`s, and shipping address + courier summary.
- **Line Items & Totals:** Item cards (`aspect-[3/4]` thumbnail, SKU `font-mono`, color/size, qty, `formatIDR` `tabular-nums`) and breakdown (`Subtotal`, `Discount`, `Shipping`, `Total`).
- **Contextual Actions:** If `PENDING_PAYMENT`, link to `/checkout/status/[orderNumber]` for payment completion/cancellation; handle `403` / `404` / fetch errors via `ErrorState`.

---

## 5. Non-Negotiable `DESIGN.md` & Quality Guardrails

1. **Semantic Tokens Only:** Use `--arven-*` semantic tokens and `@arven/ui` semantic Tailwind classes (`bg-canvas`, `bg-subtle`, `bg-panel`, `bg-elevated`, `text-ink`, `text-ink-secondary`, `text-ink-muted`, `border-hairline`, `border-control-border`, `border-strong-border`, `text-link`, `focus-visible:outline-focus`). Never hardcode raw hex values in components.
2. **Contrast & Stone Rule:** Never use `#8B897F` for normal text on light surfaces (`#F8F7F3`, `#F1EFE9`, `#E9E4DA`, `#FFFFFF`). Muted text MUST resolve to `#5E5C54` (`--arven-text-muted`) on light surfaces and `#B2B0A6` on dark surfaces.
3. **Zero Pink & Zero Em-Dashes:** No pink, rose, or magenta hues anywhere (errors use terracotta `#9C3D3D` light / `#E48966` dark). Zero em-dashes (`\u2014`) in any visible UI copy, labels, errors, or status descriptions.
4. **All 8 Interactive States:** Every interactive route and control MUST visibly handle `default`, `hover`, `focus` (`2px solid var(--arven-focus-ring)` with `2px` offset), `active`, `disabled` (explicit reason when blocked), `loading`, `empty`, and `error` (plus `success` confirmations).
5. **Tap Targets & Keyboard Ergonomics:** All clickable controls (`Button`, links, radio cards, steppers, quantity/cancel triggers) MUST meet `>= 44 x 44 px` (`min-h-11 min-w-11`) with `>= 8px` spacing between adjacent touch targets.
6. **CLS <= 0.10 & Motion Discipline:** Reserve explicit minimum heights on loading skeletons (`min-h-[...]`) matching loaded content geometry, animate compositor-safe properties (`transform`, `opacity`) only, forbid pulsing dots, and honor `@media (prefers-reduced-motion: reduce)`.
7. **Zero 3D / WebGL Leakage:** Do NOT import `three`, `@react-three/fiber`, `@react-three/drei`, or any 3D viewer modules on `/cart`, `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, or `/account/orders/[orderNumber]`.
8. **Responsive & Zoom Coverage:** Layouts must pass `320px` through `1920px` viewports and `200%` desktop zoom with `document.documentElement.scrollWidth <= window.innerWidth`.
