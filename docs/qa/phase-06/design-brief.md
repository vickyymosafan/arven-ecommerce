# ARVEN Phase 06 Design & UX Brief

> **Phase:** Phase 06 - Admin Operations Console, Order Fulfillment & Shipments, Returns & Dual-Step Refunds, Coupons, CMS & Storefront Editorial/Returns  
> **Plan ID:** `c3f9e082-a528-4293-a98b-ad26d1a2dd87`  
> **Task ID:** `393ff0c4-6c87-4b86-9a6d-b2794b34e6f6` (`design-lead`)  
> **Design Authorities:** [`DESIGN.md`](../../../DESIGN.md), [`docs/qa/phase-06/discovery-report.md`](./discovery-report.md), [`packages/ui/src/styles/tokens.css`](../../../packages/ui/src/styles/tokens.css), [`packages/ui/src/styles/theme.css`](../../../packages/ui/src/styles/theme.css)

---

## 1. Phase 06 Design Direction & Scope Boundary

Phase 06 spans two surfaces with distinct design dials and strict Phase 06 boundaries:

1. **Admin Operations Console (`apps/admin`):** `ENERGY 1 / RHYTHM 1 / MOTION 1`
   - High-legibility operational workspace defaulted to Dark Theme (`[data-theme="dark"]`, `#17191B` Charcoal canvas, `#222528` subtle, `#35383A` Graphite elevated panels) with full Light Theme (`[data-theme="light"]`) parity via `ThemeToggle`.
   - Every screen is anchored to the exact operational decision it owns: inspect KPIs without fabricated deltas, fulfill orders, dispatch/sync shipments, triage returns and inspect returned units (`RETURN_TO_STOCK`), dual-step authorize refunds with `OWNER` MFA step-up, manage coupons, and transition editorial CMS items (`DRAFT -> PREVIEW -> PUBLISHED -> ARCHIVED`).
2. **Storefront Editorial & Customer Returns (`apps/storefront`):** `ENERGY 2 / RHYTHM 3 / MOTION 2`
   - Composed gallery-quiet Light Editorial canvas (`#F8F7F3` Ivory / `#E9E4DA` Cream / `#17191B` Charcoal ink) with Dark Theme support, pairing `Cormorant Garamond` (`font-display`) editorial headlines with `Plus Jakarta Sans` (`font-sans`) UI and `IBM Plex Mono` (`font-mono`) strictly for order/return/SKU codes.
   - Adds public `Lookbook` (`/lookbook`, `/lookbook/[slug]`) and `Journal` (`/journal`, `/journal/[slug]`) routes plus customer `/account/returns` and `Request Return` on `DELIVERED` orders (`/account/orders/[orderNumber]`).
3. **Strict Phase 06 Exclusion:**
   - Zero Phase 07/08 3D features or imports (`three`, `@react-three/fiber`, `@react-three/drei`, `/showroom`, `/outfit-studio`, `/catalog/3d-assets`, GLB viewers) may appear in navigation, routes, or bundles.

---

## 2. Admin Operations Console (`apps/admin`) UX/UI Contracts

### 2.1 Permission-Gated `AdminShell` Navigation (`apps/admin/src/components/admin-shell.tsx`)

Update `adminNavItems` in `AdminShell` to include all Phase 06 routes in logical operational order, filtering strictly via `requiredPermissions` (with `OWNER` bypass preserved as implemented in `AdminShell` lines 94-104):

| Order | Nav Label | Route (`href`) | `requiredPermissions` (Any Match) |
|---|---|---|---|
| 1 | `Overview` | `/` | *(Always visible to authenticated MFA-verified staff)* |
| 2 | `Products` | `/catalog/products` | `['product.read', 'product.write', 'product.publish']` |
| 3 | `Categories` | `/catalog/categories` | `['product.read', 'product.write']` |
| 4 | `Collections` | `/catalog/collections` | `['product.read', 'product.write']` |
| 5 | `Inventory` | `/inventory` | `['inventory.read', 'inventory.receive', 'inventory.adjust']` |
| 6 | `Orders` | `/orders` | `['order.read', 'order.read.limited', 'order.fulfill', 'order.cancel']` |
| 7 | `Returns & Refunds` | `/returns` | `['return.read', 'return.review', 'return.inspect', 'return.approve', 'refund.request', 'refund.approve']` |
| 8 | `Coupons` | `/coupons` | `['coupon.read', 'coupon.manage']` |
| 9 | `CMS` | `/cms` | `['cms.read', 'cms.write', 'cms.publish']` |
| 10 | `Users` | `/users` | `['user.read', 'user.manage.limited', 'user.role.manage']` |
| 11 | `Roles & Permissions` | `/roles` | `['user.read', 'user.role.manage']` |
| 12 | `Audit Logs` | `/audit-logs` | `['audit.read', 'audit.read.scoped']` |
| 13 | `Runtime Health` | `/ops/runtime` | *(Always visible to authenticated MFA-verified staff)* |

**RBAC Route Guard & `403` Contract:**
- Restricted routes remain hidden from both desktop sidebar and mobile drawer `visibleNavItems`.
- Direct navigation to any Phase 06 route (`/orders`, `/orders/[id]`, `/returns`, `/coupons`, `/cms`) without a matching permission MUST render an explicit `StatusBanner` / `ErrorState` `403 Forbidden` access-denied panel inside `AdminShell` with a `"Return to Overview"` link (`/`), never leaking fetched operational state.
- Active link matching (`pathname === item.href || pathname.startsWith(item.href + '/')`) highlights `/orders` cleanly on `/orders/[id]`.

---

### 2.2 `/` Operations Overview (`apps/admin/src/app/page.tsx`)

Preserve the existing Operator Identity, MFA Assurance, Quick Navigation, and RBAC Permission Matrix cards while adding a top **Live Sales & Operations KPI Band** driven strictly by `GET /admin/analytics/sales`:

- **Permission Gating & Honest Metric Suppression:**
  - **No permission (`!canAccess(['analytics.read', 'analytics.read.limited'])`):** Do not call `GET /admin/analytics/sales`; either hide the KPI band or show a compact single-line notice (`"Sales KPI summary requires analytics.read or analytics.read.limited permission."`).
  - **Full Analytics (`analytics.read`):** Render all 5 live KPI cards in a responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`):
    1. `Gross Sales` (`formatIDR(kpis.grossSalesIdr)`, `tabular-nums`)
    2. `Paid Orders` (`kpis.paidOrdersCount`, `tabular-nums`)
    3. `AOV` (`formatIDR(kpis.averageOrderValueIdr)`, `tabular-nums`)
    4. `Pending Payment` (`kpis.pendingPaymentCount`, `tabular-nums`)
    5. `Open Returns` (`kpis.openReturnsCount`, `tabular-nums`)
  - **Limited Analytics (`analytics.read.limited` without `analytics.read`):** Suppress monetary revenue amounts cleanly (`Gross Sales` and `AOV` cards MUST NOT display raw Rupiah revenue or fallback fake numbers). Either render only the 3 volume/SLA cards (`Paid Orders`, `Pending Payment`, `Open Returns`) in a balanced `lg:grid-cols-3` layout or render explicit `"Restricted (analytics.read.limited)"` caption with volume-only KPIs and a clear `Badge` (`tone="info"`, `"Volume & SLA View"`). Prefer rendering the 3 operational volume cards (`Paid Orders`, `Pending Payment`, `Open Returns`) plus a `StatusBanner` (`tone="info"`) explaining that revenue totals (`Gross Sales`, `AOV`) are suppressed under `analytics.read.limited`.
- **Zero Fabricated Deltas Rule (`DESIGN.md` §1.2.5):**
  - Strictly forbid fake percentage trends (`"+12.4%"`, `"-3% vs last week"`), sparklines, or mocked fallback counts.
  - Display server-reported window context (e.g., `"Live server totals as of " + formatWIB(generatedAt)` in `text-xs text-ink-muted`).
  - Zero values (`Rp0` / `0`) must render honestly as `Rp0` or `0`, never replaced with placeholder dashes or dummy rows.
- **States:** `loading` (`LoadingState` skeleton cards), `error` (`ErrorState` with `requestId` and retry), `empty` / zero activity (honest `0` / `Rp0` values with direct `LinkButton` to `/orders` or `/returns`).

---

### 2.3 `/orders` & `/orders/[id]` Order Fulfillment & Shipments

#### A. `/orders` Queue View
- **Header & Filter Toolbar (`Surface variant="subtle"`):**
  - Search input (`orderNumber` or customer/guest email), Order Status `<Select>` (`ALL`, `PENDING_PAYMENT`, `PAID`, `PROCESSING`, `READY_TO_SHIP`, `SHIPPED`, `DELIVERED`, `COMPLETED`, `CANCELLED`, `EXPIRED`, `REFUND_PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED`, `RETURN_REQUESTED`, `RETURN_APPROVED`, `RETURNED`), Payment Status `<Select>`, plus `"Apply Filters"` and `"Reset Filters"` buttons synced to URL search params.
  - When user holds `order.read.limited` (without `order.read`), render a top `StatusBanner` (`tone="info"`): `"Limited Support View active: customer contact PII is masked and raw payment gateway payloads are redacted."`
- **`DataTable` Columns (Desktop `tableBreakpoint="lg"`, mobile card reflow via `@arven/ui` `DataTable`):**
  1. `Order #` (`font-mono`, link to `/orders/[id]`)
  2. `Placed (WIB)` (`formatWIB(createdAt)`, `tabular-nums`)
  3. `Customer` (Full name / masked email indicator badge when `piiMasked`)
  4. `Order Status` (`Badge` mapped deterministically per `OrderStatus`)
  5. `Payment` (`Badge` mapped per `PaymentStatus`)
  6. `Total` (`formatIDR(grandTotalIdr)`, `align="right"`, `tabular-nums`)
  7. `Action` (`LinkButton` `"Inspect"` -> `/orders/[id]`, `min-h-11`)
- **Pagination:** `Prev` / `Page X of Y` / `Next` with `min-h-11` buttons.

#### B. `/orders/[id]` Order Detail & Fulfillment Workspace
- **Top Status Strip:** Order number (`font-mono`), `OrderStatus` `Badge`, `PaymentStatus` `Badge`, placed/paid timestamps (`formatWIB`), and `PII Masked` `Badge` (`tone="warning"`) when `order.read.limited` is active.
- **Asymmetric Workspace (`lg:grid-cols-12`, `7:5` or `8:4` split):**
  - **Left Column (`lg:col-span-7` or `8`):**
    1. **Line Items Card:** SKU (`font-mono`), product/variant (`size`, `color`), quantity (`tabular-nums`), unit price, discount allocation, line total (`formatIDR`, `tabular-nums`), plus itemized breakdown (`Subtotal`, `Coupon Discount`, `Shipping`, `Grand Total`).
    2. **Shipments & Tracking Card:** Lists each `Shipment` (`provider`, `serviceCode`, `trackingNumber` in `font-mono`, `ShipmentStatus` `Badge`, `shippedAt`/`deliveredAt` in `formatWIB`, expandable/vertical `ShipmentEvent` timeline).
       - Action: **`"Create Shipment"`** button (visible only when `order.fulfill` permitted and order is in `PAID` / `PROCESSING` / `READY_TO_SHIP` without an active conflicting shipment).
       - Row Action: **`"Sync Tracking"`** button (`order.fulfill`, `min-h-11`, inline loading state) calling `POST /admin/shipments/:id/sync-tracking` and refreshing events/order status.
    3. **Order Status History & Payment/Refund Summary:** Chronological timeline (`fromStatus -> toStatus`, actor type, reason, `formatWIB`) and redacted/summary payment records (raw `gatewayResponse` / PII suppressed on `order.read.limited`).
  - **Right Column (`lg:col-span-5` or `4`):**
    1. **Shipping Destination & Customer Card:** Name, masked or full email/phone, address lines, city, postal code. Use sibling bordered rows (`border-t border-hairline pt-2`) inside `<dl>` instead of `<Divider />`!
    2. **Order State Actions (`Surface variant="elevated"`):**
       - **`order.fulfill` transitions:** Explicit next-step command buttons only for valid current transitions (`PAID -> PROCESSING` `"Start Processing"`, `PROCESSING -> READY_TO_SHIP` `"Mark Ready to Ship"`). Disabled buttons explain why (e.g., `"Create or dispatch shipment to advance"`), never silent failures.
       - **`order.cancel` action:** `"Cancel Order"` (`variant="danger"`, opens confirmation modal requiring reason) available only on eligible unpaid/pre-shipment states.
       - **`refund.request` action:** `"Request Refund"` button (visible when `refund.request` permitted and order has a `SETTLEMENT` / refundable payment) opening the **Request Refund Modal**.
- **Modals on `/orders/[id]`:**
  1. **`Create Shipment` Modal (`Modal size="md"`):** Warehouse selector (or default warehouse display), `provider` / `serviceCode` (`DeterministicShippingProvider` / order service prefilled), optional carrier/dispatch note, `Idempotency-Key` generated per submit attempt, disabled submit while in-flight, explicit `409` concurrency error banner with `"Reload Order"` button.
  2. **`Request Refund` Modal (`Modal size="md"`):** Displays refundable payment ceiling (`formatIDR`), optional linked `Return` reference if applicable, `amountIdr` numeric input (`tabular-nums`), `reason` textarea (`required`), generated `Idempotency-Key`, inline field validation, and confirmation toast noting that `OWNER` MFA step-up approval is required on `/returns` (`Refunds Queue`).

---

### 2.4 `/returns` Returns & Dual-Step Refunds Console

- **Tabbed Header (`role="tablist"` with keyboard ArrowLeft/ArrowRight or accessible route/tab buttons `min-h-11`):**
  - Tab 1: **`Returns Queue`** (visible if `return.read`, `return.review`, `return.inspect`, or `return.approve`)
  - Tab 2: **`Refunds Queue`** (visible if `refund.request`, `refund.approve`, or `return.read`)
  - Tab counts in `tabular-nums` inside `Badge` or inline count, never pulsing indicators.

#### Tab 1: `Returns Queue`
- **Filters:** Status `<Select>` (`ALL`, `REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `RECEIVED`, `REFUNDED`, `CLOSED`).
- **`DataTable` + Inspection Drawer/Modal:**
  - Columns: `Return ID` (`font-mono`), `Order #` (link to `/orders/[id]`), `Requested (WIB)`, `Status` (`Badge`), `Items / Qty`, `Action` (`"Review / Inspect"`).
  - **Return Detail & Inspection Modal (`Modal size="lg"`):**
    - Shows customer reason, `customerNotes`, evidence keys (if present), itemized `return_items` (`productNameSnapshot`, `skuSnapshot`, `quantity` returned), and prior reviewer/timestamps (`formatWIB`).
    - **RBAC-Gated Lifecycle Actions:**
      1. `REQUESTED` + `return.review`: `"Start Review"` (`POST /admin/returns/:id/review`) + optional `adminNotes`.
      2. `UNDER_REVIEW` + `return.approve`: `"Approve Return"` and `"Reject Return"` (`POST /admin/returns/:id/approve`, `adminNotes` required on reject).
      3. `APPROVED` + `return.inspect`: **`"Receive & Inspect Stock"`** panel inside the modal:
         - Per-return-item card (`rounded-[var(--radius-sm)] border border-control-border p-3`) using `has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--arven-focus-ring)] has-[:focus-visible]:outline-offset-2` for custom condition radio options (`UNOPENED`, `GOOD`, `DAMAGED`, `DEFECTIVE`) and a `Checkbox` (`"Return to sellable stock (RETURN_TO_STOCK)"`, `restocked`).
         - Explicit helper note: checking `Return to sellable stock` atomically increments `inventory_levels.quantity_on_hand` and appends an immutable `RETURN_TO_STOCK` `inventory_movements` ledger row.
         - Submit calls `POST /admin/returns/:id/receive` with `Idempotency-Key`.

#### Tab 2: `Refunds Queue` (Dual-Step Accountability + `OWNER` MFA Step-Up)
- **Dual-Control Notice (`StatusBanner tone="info"`):** Explains that refund initiation (`refund.request`) and payout authorization (`refund.approve`) are strictly separated; only `OWNER` with fresh TOTP step-up (within 15 minutes) may authorize payout.
- **`DataTable` Columns:**
  1. `Refund Key` (`font-mono`)
  2. `Order #` (link to `/orders/[id]`)
  3. `Amount (IDR)` (`formatIDR(amountIdr)`, `tabular-nums`, `align="right"`)
  4. `Status` (`Badge`: `REQUESTED`, `APPROVED`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `REJECTED`)
  5. `Requested By` (staff name/email + `createdAt` `formatWIB`)
  6. `Approved By` (staff name/email + `completedAt` `formatWIB`, or `"Awaiting OWNER"` muted label)
  7. `Action`
- **Dual-Step `MfaStepUpModal` Flow (`apps/admin/src/components/mfa-step-up-modal.tsx`):**
  - `"Approve Refund"` button renders **only** when `isOwner || permissions.has('refund.approve')` AND `refund.status === 'REQUESTED'`. Non-`OWNER` staff see a neutral `"OWNER Approval Required"` label (never a broken button).
  - Clicking `"Approve Refund"` opens a concise confirmation or triggers `POST /admin/refunds/:id/approve` with a persistent `Idempotency-Key` for that approval intent.
  - If the backend responds with HTTP `403` indicating MFA step-up is required (e.g., `MFA_STEP_UP_REQUIRED` / fresh step-up missing), mount `<MfaStepUpModal isOpen={...} redirectPath="/returns" onVerified={retryApproveRefund} />` so the `OWNER` enters their 6-digit TOTP code inline and `onVerified` immediately retries `POST /admin/refunds/:id/approve` seamlessly without losing context or duplicating the payout (`Idempotency-Key` preserved).
  - On success, update the row immediately to show `approvedBy` and `SUCCEEDED`/`APPROVED` status plus toast feedback (`"Refund approved and recorded in audit log."`).

---

### 2.5 `/coupons` Promotional Coupons Management

- **Permission Gating:** Read-only table for `coupon.read`; `"Create Coupon"`, `"Edit"`, and `"Pause / Activate"` controls gated by `coupon.manage`.
- **`DataTable` Columns:**
  1. `Code` (`font-mono uppercase`) + `Name`
  2. `Discount` (e.g., `"15% (cap Rp150.000)"` or `"Rp100.000 off"` or `"Free Shipping"` using `formatIDR`, `tabular-nums`)
  3. `Min Subtotal` (`formatIDR(minOrderSubtotalIdr)`, `tabular-nums`)
  4. `Redemptions` (`usedCount` / `usageLimitTotal ?? "Unlimited"`, `tabular-nums`)
  5. `Active Window (WIB)` (`formatWIB(startsAt)` to `formatWIB(endsAt)`)
  6. `Status` (`Badge`: `DRAFT`, `ACTIVE`, `PAUSED`, `EXPIRED`, `ARCHIVED`)
  7. `Actions` (`"Edit"`, `"Pause"` / `"Activate"` toggle, `min-h-11`)
- **Create / Edit Coupon Modal (`Modal size="lg"`):**
  - Fields: `code` (uppercase mono), `name`, `discountType` (`PERCENTAGE`, `FIXED_AMOUNT`, `FREE_SHIPPING` radio group or `<Select>` with `has-[:focus-visible]` if custom cards), `discountValue` (percentage `1-100` or IDR integer with `formatIDR` live preview hint), `maxDiscountIdr` (shown/enabled for `PERCENTAGE`), `minOrderSubtotalIdr`, `usageLimitTotal`, `usageLimitPerUser`, `startsAt` & `endsAt` (explicitly labeled `(WIB / Asia/Jakarta)` and converted cleanly to/from UTC ISO), and `status` (`DRAFT`, `ACTIVE`, `PAUSED`).
  - Inline Zod validation errors via `FormField` (`role="alert"`), `Idempotency-Key` / loading state on submit.

---

### 2.6 `/cms` Editorial CMS Workspace (`Lookbooks`, `Journal`, `Pages`)

- **Tabbed Workspace (`role="tablist"`):**
  - `Lookbooks` (`Lookbook` records)
  - `Journal` (`JournalArticle` records)
  - `Pages` (`Page` records, e.g., `about`)
- **State Machine Controls (`CmsStatus`: `DRAFT -> PREVIEW -> PUBLISHED -> ARCHIVED`):**
  - Table lists `Title`, `Slug` (`font-mono`), `Season / Excerpt`, `Status` (`Badge`), `Published (WIB)`, and `Actions`.
  - Editing / creating requires `cms.write`.
  - Status transitions (`"Move to Preview"`, `"Publish"`, `"Archive"`, `"Return to Draft"`) call `POST /admin/cms/.../transition` and are strictly gated: `"Publish"` and `"Archive"` actions render/enable ONLY when `cms.publish` is present.
- **Editor Modal / Drawer (`Modal size="lg"`):**
  - **Lookbook Editor:** `title`, `slug`, `season`, `description`, structured `slides` builder (add/remove/reorder slide with `imageUrl`, `altText` required for accessibility, `caption`, optional `productSlug` / `ctaLabel`) with JSON preview or safe structured inputs (never silently losing unsaved fields).
  - **Journal Editor:** `title`, `slug`, `excerpt`, `coverMediaUrl`, `body` (structured paragraphs/sections editor or validated blocks), `status` badge.
  - **Page Editor:** `title`, `slug`, `seoTitle`, `seoDescription`, structured `blocks` editor (`hero`, `editorial_text`, `callout`).
  - **Live Storefront Link:** When `status === 'PUBLISHED'` (or `PREVIEW` with preview token/route if supported), provide a non-blocking `"View on Storefront"` link in `Actions`.

---

## 3. Storefront Editorial & Customer Returns (`apps/storefront`) UX/UI Contracts

### 3.1 `StorefrontShell` Navigation Updates (`apps/storefront/src/components/storefront-shell.tsx`)

Update `StorefrontShell` cleanly while preserving the single-row desktop header (`<= 1` row at `1024px+`, zero crowding) and `56px` mobile header + slide-over `Drawer`:

- **Primary Nav (`primaryNavLinks`):**
  1. `Home` (`/`)
  2. `Shop` (`/shop`)
  3. `Collections` (`/collections`)
  4. `Lookbook` (`/lookbook`)
  5. `Journal` (`/journal`)
  6. `Search` (`/search`)
  7. `Bag` (`/cart`, with `BagCountPill`)
  8. `Account` (`/account`)
  9. `Sign In` (`/auth/login`)
- **Desktop Header Fit (`1024px` - `1440px`):**
  - Keep compact link padding (`px-2 xl:px-3`) and `gap-1 xl:gap-2` on `lg:flex` so all 9 links + `ARVEN` wordmark + `ThemeToggle` sit comfortably on a single horizontal row at `1024px` without wrapping or overflowing.
- **Mobile Drawer Secondary Links (`drawerSecondaryLinks`):**
  - Add `{ href: '/account/returns', label: 'Returns' }` alongside `Order History`, `Saved Addresses`, `Active Sessions`, `Create Account`.
- **Footer Links:**
  - Add `Lookbook` (`/lookbook`), `Journal` (`/journal`), `About` (`/about` if seeded CMS page is wired), and `Returns` (`/account/returns`) to the footer link cluster with `min-h-11` tap targets.
- **Zero Future-Phase Links:** Do NOT add `Showroom` or `Outfit Studio` links in Phase 06.

---

### 3.2 Editorial Lookbook (`/lookbook`, `/lookbook/[slug]`)

- **Index Page (`/lookbook`):**
  - Editorial header (`font-display` `text-4xl sm:text-5xl`, subtitle capped at `max-w-[var(--container-prose)]`).
  - Asymmetric / curated grid of published Lookbooks (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, `gap-8`): each card features a `3:4` (`aspect-[3/4]`) portrait frame (`bg-subtle`), season micro-label (`text-xs uppercase tracking-[0.06em] text-ink-muted`), `Cormorant Garamond` title, concise description, and `"Explore Lookbook"` link (`min-h-11`).
  - Empty state: honest editorial empty panel (`"No lookbooks are currently published."` + `"Browse Collection"` -> `/shop`).
- **Detail Page (`/lookbook/[slug]`):**
  - Opener hero with season label, `Cormorant Garamond` H1 (`--text-display-lg`), editorial intro (`max-w-[65ch]`). If text overlays a hero photograph, enforce `rgba(23, 25, 27, 0.72)` dark scrim (`--color-scrim-dark-72`) with `#F8F7F3` Ivory text (`6.54:1` worst-case contrast).
  - Alternating editorial slide rhythm (`RHYTHM 3`): large `aspect-[3/4]` or `aspect-[4/5]` portrait imagery paired with slide caption, garment notes, and optional `"Shop Featured Piece"` link to `/products/[slug]`.
  - Zero decorative floating badges, zero pulsing dots, zero em-dashes in copy.

---

### 3.3 Editorial Journal (`/journal`, `/journal/[slug]`)

- **Index Page (`/journal`):**
  - `Cormorant Garamond` H1 (`"ARVEN Journal"`), concise editorial lead (`max-w-[65ch]`).
  - Responsive 1/2/3-column editorial article cards: `aspect-[3/4]` or `aspect-[4/3]` cover image (`bg-subtle`), published date via `formatWIB` (`text-xs text-ink-muted`), `Cormorant Garamond` article title, excerpt (`text-sm text-ink-secondary`), and `"Read Article"` link (`min-h-11`).
- **Article Detail (`/journal/[slug]`):**
  - Breadcrumb back to `/journal` (`min-h-11`).
  - Centered or asymmetric editorial article container with prose strictly constrained to `max-w-[var(--container-prose)]` (`65ch`), `Cormorant Garamond` H1, `formatWIB(publishedAt)` metadata (`text-ink-muted`), optional `aspect-[4/3]` cover image with meaningful `altText`, and structured body blocks rendered with comfortable `leading-relaxed` (`1.60`) typography.

---

### 3.4 Customer Returns (`/account/returns` & `/account/orders/[orderNumber]`)

#### A. `AccountShell` Update (`apps/storefront/src/components/account-shell.tsx`)
- Add `{ href: '/account/returns', label: 'Returns' }` to `accountNavItems` (active when `pathname === '/account/returns' || pathname.startsWith('/account/returns/')`).

#### B. `Request Return` Flow on `/account/orders/[orderNumber]`
- **Eligibility Rule:** Show the `"Request Return"` action panel/button strictly when `order.status === 'DELIVERED'` (per `OrderStatus` state machine). Do not render dead return buttons on `PENDING_PAYMENT`, `CANCELLED`, or `SHIPPED` orders; if an order is in `RETURN_REQUESTED` / `RETURN_APPROVED` / `RETURNED`, show a status link `"View Return Status"` -> `/account/returns`.
- **Return Request Form / Modal (`Modal size="lg"` or inline expandable panel):**
  1. **Select Items to Return:** List each `orderItem` inside an accessible selection card (`rounded-[var(--radius-sm)] border border-control-border p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--arven-focus-ring)] has-[:focus-visible]:outline-offset-2`). Include a `Checkbox` (`min-h-11 min-w-11` hit target) and a quantity stepper / bounded `<Select>` (`1..item.quantity`) with `tabular-nums`.
  2. **Return Reason (`FormField` + `<Select>` or accessible radio group):** Structured reasons (e.g., `SIZE_FIT`, `DEFECTIVE_ITEM`, `WRONG_ITEM`, `DAMAGED_IN_TRANSIT`, `OTHER`) + `customerNotes` `<Textarea>` (`required` or validated per schema).
  3. **Submission & Idempotency:** Generate a single `Idempotency-Key` per submission intent, disable submit with `"Submitting Return Request..."`, handle `409` / validation errors with inline `StatusBanner` (`role="alert"`), and on success show toast + `"Track in My Returns"` navigation to `/account/returns`.

#### C. `/account/returns` Customer Returns Tracking
- Renders inside `AccountShell`.
- **List / Cards:** Each return request shows:
  - Return reference ID (`font-mono`), Order # link (`/account/orders/[orderNumber]`), submitted timestamp (`formatWIB`), `ReturnStatus` `Badge` (`REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `RECEIVED`, `REFUNDED`, `CLOSED`), customer reason, and returned items summary (`productNameSnapshot`, `sizeSnapshot`, `colorSnapshot`, `qty`, condition after inspection if set).
  - Show `adminNotes` cleanly when present (especially on `REJECTED` or `APPROVED` instructions) and linked refund status (`formatIDR` when refunded).
- **States:** `loading` (`LoadingState`), `error` (`ErrorState` with retry), `empty` (`EmptyState` `"No return requests submitted yet"` with `"View Order History"` -> `/account/orders`).

---

## 4. Non-Negotiable `DESIGN.md` & Accessibility Guardrails

Every Phase 06 component and page across `apps/admin` and `apps/storefront` MUST satisfy all of the following rules:

1. **Semantic Tokens Only:** Use Tailwind utilities bound in `theme.css` (`bg-canvas`, `bg-subtle`, `bg-panel`, `bg-elevated`, `text-ink`, `text-ink-secondary`, `text-ink-muted`, `text-link`, `border-hairline`, `border-control-border`, `border-strong-border`, `bg-info-bg`/`text-info-fg`, `bg-success-bg`/`text-success-fg`, `bg-warning-bg`/`text-warning-fg`, `bg-danger-bg`/`text-danger-fg`) or `var(--arven-*)`. Never hardcode primitive hex colors in JSX/TSX.
2. **Contrast & Stone Rule:** Light muted text uses `text-ink-muted` (`#5E5C54`, `6.25:1` on Ivory / `5.29:1` on Cream); dark muted text uses `text-ink-muted` (`#B2B0A6`, `8.10:1` on Charcoal / `5.43:1` on Graphite). `#8B897F` MUST NOT be used for normal text on any light surface.
3. **Zero Pink Anywhere:** Error/destructive states use Terracotta (`#9C3D3D` light / `#E48966` dark). No pink, rose, or magenta tokens or classes.
4. **Zero Em-Dashes (`\u2014`) in UI Copy:** All headings, labels, empty states, banners, buttons, and placeholders must avoid `\u2014` (use colons, commas, parentheses, or short hyphens if needed).
5. **All 8 Interactive States + Success:** Every interactive route and control implements `default`, `hover`, `active`, `focus`, `disabled`, `loading`, `empty`, `error`, and `success` feedback (via `StatusBanner`, `useToast`, or `aria-live="polite"`), never communicating state by color alone.
6. **Valid `<dl>` Structure (`<Divider />` Outside `<dl>`):** Never place `<Divider />` (`<hr>`) as a child of `<dl>`. Separate `<dl>` definition groups with border classes on `<div className="flex justify-between border-t border-hairline pt-2">` or place `<Divider />` strictly outside `<dl>`.
7. **Focus Rings on Custom Selection Cards:** Any custom radio/checkbox card (return item selection, inspection condition selector, coupon discount type selector) MUST apply `has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--arven-focus-ring)] has-[:focus-visible]:outline-offset-2` while keeping the underlying `<input>` visually accessible (`sr-only` or styled native control, never `display: none`).
8. **Touch Targets & Spacing:** Every button, link, tab, checkbox, and stepper MUST enforce `min-h-11` (`44px`) and `min-w-11` where icon-only, with `>= 8px` (`gap-2`) between adjacent touch controls.
9. **Numeric & Time Determinism:** Use `@arven/ui` `formatIDR()` with `tabular-nums` for all Rupiah figures and `formatWIB()` for all timestamps (`Asia/Jakarta`).
10. **Motion & Bundle Discipline:** Respect `@media (prefers-reduced-motion: reduce)` (`tokens.css` collapses durations to `0.01ms`); zero infinite ambient animations or pulsing dots; zero Three.js/WebGL imports anywhere in `apps/admin` or `apps/storefront` Phase 06 code.
11. **13-Profile Responsive Reflow:** All new routes must pass zero horizontal document overflow (`scrollWidth <= innerWidth`) across `320px`, `360px`, `375px`, `390px`, `414px`, `430px`, `768px`, `844px`, `1024px`, `1280px`, `1366px`, `1440px`, and `1920px`, plus `200%` desktop zoom.
