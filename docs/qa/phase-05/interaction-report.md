# ARVEN Phase 05 Functional Interaction QA Report

> **Harness Plan ID:** `7046df9d-13df-413d-b6ae-2ebaaaa6ddd9`  
> **Task ID:** `d9e3d056-c8cc-4d0b-8725-88aa665171aa`  
> **Checkpoint ID:** `interaction`  
> **Independent Verifier:** `functional-qa-agent`  
> **Execution Timestamp (UTC):** `2026-11-16T03:08:29.656Z` (Guest suite: `2026-11-16T02:54:33.158Z`)  
> **Browser Engine:** Playwright Chromium (`1440x900`, headless) + `localhost.run_interaction_scenario`  
> **Overall Verdict:** `PASS`

---

## 1. Executive Summary

Independent end-to-end functional interaction QA against the live Storefront (`http://localhost:3000`) and API (`http://localhost:4000`) verified all Phase 05 commerce flows cleanly:

- **Empty & Blocked States:** Verified `/cart` empty state (`"Your Bag Is Empty"`), `/checkout` empty state (`"Your Bag Is Empty"`), blank guest checkout submission inline field validation (`7` inline field errors + summary banner, `0` `POST /api/v1/checkout/orders` calls), and invalid promo code feedback (`INVALIDCODE99` -> `POST /api/v1/checkout/quote` `404` `"Coupon code was not found"`, clearing cleanly on edit).
- **Guest E2E Checkout Lifecycle (`ARV-20261116-91BCBC`):** Verified `/products/essentials-heavyweight-crew-tee` (`ARV-TOP-001`) `Add to Bag` (`200`) -> `/cart` -> `Proceed to Checkout` -> `/checkout` -> courier toggling (`sicepat-adapter:REG` `Rp 16.000` / `Rp 315.000` -> `jne-adapter:REG` `Rp 18.000` / `Rp 317.000` -> `jne-adapter:YES` `Rp 32.000` / `Rp 331.000`) -> promo `WELCOME10` (`-10%`, `-Rp 29.900`, `Rp 301.100`), `Remove Code` (`Rp 331.000`), and re-apply `WELCOME10` (`-Rp 29.900`) -> idempotent order + payment session creation (`POST /api/v1/checkout/orders` `201` with `Idempotency-Key`, `POST /api/v1/payments/:orderId/session` `201` with `Idempotency-Key`) -> `/checkout/status/ARV-20261116-91BCBC` reload persistence via `sessionStorage` (`arven:guest-order:ARV-20261116-91BCBC`) -> `Refresh Payment Status` (`GET /api/v1/orders/ARV-20261116-91BCBC` `200`, stays `PENDING_PAYMENT`) -> UI `Cancel Order` -> `Confirm Cancellation` (`POST /api/v1/orders/:id/cancel` `200` `CANCELLED`) restoring `ARV-TOP-001` `availableQty` `25 -> 24 -> 25`.
- **Authenticated Customer Flow & Order History (`ARV-20261116-C9CA71`):** Verified unauthenticated `/account/orders` redirects cleanly to `/auth/login?next=%2Faccount%2Forders` -> sign-in as `customer.dev@arven.local` (`200`) -> saved address (`Primary Residence`) vs custom address toggle (`Enter a different shipping address`) on `/checkout` -> order placement (`201`) -> `/account/orders` list + `PENDING_PAYMENT` status filter -> `/account/orders/ARV-20261116-C9CA71` (`AccountShell` `"Order History"` `aria-current="page"`, `Ordered Garments`, `Delivery Destination`, `Status Timeline` with `WIB` timestamps, and `Continue to Payment` / `Cancel Order` CTAs) -> UI cancellation releasing reserved stock (`25 -> 24 -> 25`).
- **Clean Telemetry & State Hygiene:** `0` page errors, `0` failed requests, `0` `5xx` responses, `0` unexpected `401`/`403` errors on Phase 05 routes (`GET /api/v1/auth/me` no longer fires on guest `/checkout`), and `0` active `PENDING_PAYMENT` orders remaining post-run.

---

## 2. Harness Scenario Checks (`localhost.run_interaction_scenario`)

| Route | Run ID | Harness Evidence ID | Steps & Observed Outcome | Console / Page / HTTP Errors | Verdict |
|---|---|---|---|---|---|
| `/cart` | `f0488c46-992f-49a2-a1a7-06faa8ed7328` | `66fced01-79e4-4bb5-bd2f-7687dbda2655` | `h1` visible, `"Shopping Bag"` text verified | `0` / `0` / `0` | `PASS` |
| `/checkout` | `e8f453e8-136f-4ec3-ba6d-51494d5379d4` | `b971cf73-9a9b-4003-98c2-00cdaf9d479f` | `h1` visible, `"Order Checkout"` text verified | `0` / `0` / `0` | `PASS` |
| `/products/essentials-heavyweight-crew-tee` | `cdbc1a8a-122a-4601-b15a-787d74d19b4b` | `c46b121f-3627-4230-876e-1dad6fe38122` | `h1` visible, `Add to Bag` button visible | `0` / `0` / `0` | `PASS` |
| `/account/orders` (unauthenticated) | `7f0d9e39-1824-4878-91a3-d3e47025e379` | `a0d9a758-1948-46e1-98f7-141c190f6ece` | Redirected to login (`#login-email` visible, `"Access Your Account"`) | `0` page, `0` HTTP; `1` harness-injected `caret-color: transparent` hydration warning (confirmed `0` errors in clean Playwright Chromium) | `PASS` |

---

## 3. End-to-End Interactive Verification Matrix

All captures saved in [`docs/qa/phase-05/screenshots/interaction/`](./screenshots/interaction/).

### 3.1 Empty States & Checkout Validation (Flow 1)

| Step | Scenario & Verified Transition | HTTP / API Evidence | Observed UI & State Result | Screenshot | Verdict |
|---|---|---|---|---|---|---|
| `1.1` | Visit `/cart` with empty guest session | `GET /api/v1/cart` -> `200` | `"Your Bag Is Empty"` heading, `"Explore Catalog"` + `"View Capsules"` actions | [`01-cart-empty.png`](./screenshots/interaction/01-cart-empty.png) | `PASS` |
| `1.2` | Visit `/checkout` with empty bag | `GET /api/v1/cart` -> `200` | `"Your Bag Is Empty"` heading, `"Explore Catalog"` + `"Return to Bag"` actions | [`02-checkout-empty.png`](./screenshots/interaction/02-checkout-empty.png) | `PASS` |
| `1.3` | `/products/essentials-heavyweight-crew-tee` -> `Add to Bag` -> `/cart` -> `Proceed to Checkout` | `POST /api/v1/cart/items` -> `200`; `POST /api/v1/checkout/quote` -> `200` | Baseline `ARV-TOP-001` `availableQty = 25`; `"View Bag"` visible; `/checkout` hydrated | N/A | `PASS` |
| `1.4` | Submit `/checkout` with blank required guest fields | `0` `POST /api/v1/checkout/orders` calls | Summary banner `"Review the highlighted shipping and contact fields before placing your order."` + all `7` inline errors (`checkout-guest-email-error`, `checkout-recipient-name-error`, `checkout-phone-error`, `checkout-line1-error`, `checkout-city-error`, `checkout-province-error`, `checkout-postal-code-error`) | [`03-checkout-validation-errors.png`](./screenshots/interaction/03-checkout-validation-errors.png) | `PASS` |
| `1.5` | Apply invalid promo code `INVALIDCODE99` and clear input | `POST /api/v1/checkout/quote` -> `404` | Inline `#checkout-coupon-code-error` renders `"Coupon code was not found"`; clearing input hides error cleanly | [`04-checkout-invalid-promo.png`](./screenshots/interaction/04-checkout-invalid-promo.png) | `PASS` |

### 3.2 Guest E2E Checkout, Courier/Promo Recompute, Status Recovery & Cancellation (Flow 2)

| Step | Scenario & Verified Transition | HTTP / API Evidence | Observed UI & State Result | Screenshot | Verdict |
|---|---|---|---|---|---|---|
| `2.1` | Fill valid guest contact & Jakarta address (`qa.guest.phase05@arven.local`, `Jl. Senopati No. 18`, `12190`) | `POST /api/v1/checkout/quote` -> `200` | Server quote initializes with `sicepat-adapter:REG` (`Rp 16.000`, subtotal `Rp 299.000`, grand total `Rp 315.000`) | N/A | `PASS` |
| `2.2` | Toggle shipping couriers (`sicepat-adapter:REG` -> `jne-adapter:REG` -> `jne-adapter:YES`) | `POST /api/v1/checkout/quote` -> `200` per toggle | Shipping & grand total recompute dynamically: `Rp 16.000` / `Rp 315.000` -> `Rp 18.000` / `Rp 317.000` -> `Rp 32.000` / `Rp 331.000` | [`05-checkout-courier-toggle.png`](./screenshots/interaction/05-checkout-courier-toggle.png) | `PASS` |
| `2.3` | Apply `WELCOME10` -> `Remove Code` -> Re-apply `WELCOME10` | `POST /api/v1/checkout/quote` -> `200` | `"Applied WELCOME10"` (`-Rp 29.900`, total `Rp 301.100`) -> removed (`discountTotalIdr: 0`, total `Rp 331.000`) -> re-applied (`-Rp 29.900`, total `Rp 301.100`) | [`06-checkout-welcome10-applied.png`](./screenshots/interaction/06-checkout-welcome10-applied.png) | `PASS` |
| `2.4` | Submit guest order & payment session | `POST /api/v1/checkout/orders` -> `201` (`Idempotency-Key` present); `POST /api/v1/payments/1f29110e-1389-4073-938c-597d228ccad8/session` -> `201` (`Idempotency-Key` present) | Navigated to `/checkout/status/ARV-20261116-91BCBC`; `sessionStorage` stores `arven:guest-order:ARV-20261116-91BCBC`; `ARV-TOP-001` `availableQty` reserved `25 -> 24` | [`07-guest-status-pending.png`](./screenshots/interaction/07-guest-status-pending.png) | `PASS` |
| `2.5` | Reload `/checkout/status/ARV-20261116-91BCBC` & click `Refresh Payment Status` | `GET /api/v1/orders/ARV-20261116-91BCBC` -> `200` | `sessionStorage` token recovery renders order directly without verification prompt; manual refresh keeps status `PENDING_PAYMENT` | N/A | `PASS` |
| `2.6` | Click `Cancel Order` -> enter reason -> `Confirm Cancellation` | `POST /api/v1/orders/1f29110e-1389-4073-938c-597d228ccad8/cancel` -> `200` (`Idempotency-Key` present) | Transitions to `CANCELLED`, `"Order cancelled"` banner shown, and `ARV-TOP-001` `availableQty` restored `24 -> 25` | [`08-guest-status-cancelled.png`](./screenshots/interaction/08-guest-status-cancelled.png) | `PASS` |

### 3.3 Authenticated Customer Flow & Order History (Flow 3)

| Step | Scenario & Verified Transition | HTTP / API Evidence | Observed UI & State Result | Screenshot | Verdict |
|---|---|---|---|---|---|---|
| `3.1` | Visit `/account/orders` unauthenticated | Client auth redirect | Cleanly redirects to `http://localhost:3000/auth/login?next=%2Faccount%2Forders` with `#login-email` visible | [`09-unauth-orders-redirect.png`](./screenshots/interaction/09-unauth-orders-redirect.png) | `PASS` |
| `3.2` | Sign in as `customer.dev@arven.local` on `/auth/login?next=/account/orders` | `POST /api/v1/auth/login` -> `200`; `POST /api/v1/cart/merge` -> `[403, 200]` | Authenticated customer session established; lands on `/account/orders` | N/A | `PASS` |
| `3.3` | Add `essentials-heavyweight-crew-tee` -> `/cart` -> `/checkout` | `POST /api/v1/cart/items` -> `200`; `GET /api/v1/auth/me` -> `200`; `GET /api/v1/users/me/addresses` -> `200` | Hydrates authenticated checkout | N/A | `PASS` |
| `3.4` | Toggle `Primary Residence` vs `Enter a different shipping address` | `POST /api/v1/checkout/quote` -> `200` | `"Ordering as ARVEN Dev Customer"` + `"Primary Residence"` (`DEFAULT` / `SELECTED`) shown by default; toggling custom mounts guest/custom inputs; toggling back restores `Primary Residence` | [`10-auth-checkout-saved-address.png`](./screenshots/interaction/10-auth-checkout-saved-address.png), [`11-auth-checkout-custom-toggle.png`](./screenshots/interaction/11-auth-checkout-custom-toggle.png) | `PASS` |
| `3.5` | Place authenticated order | `POST /api/v1/checkout/orders` -> `201` (`Idempotency-Key` present); `POST /api/v1/payments/c3fbe5bc-f10c-4b58-88ef-523600fc7a30/session` -> `201` | Created `ARV-20261116-C9CA71`; `ARV-TOP-001` `availableQty` reserved `25 -> 24` | N/A | `PASS` |
| `3.6` | Inspect `/account/orders`, filter by `PENDING_PAYMENT`, and open `/account/orders/ARV-20261116-C9CA71` | `GET /api/v1/orders?page=1&limit=10&status=PENDING_PAYMENT` -> `200`; `GET /api/v1/orders/ARV-20261116-C9CA71` -> `200` | Table lists `ARV-20261116-C9CA71` (`Rp 315.000`, `WIB`); detail page keeps `"Order History"` `aria-current="page"`, renders `Ordered Garments`, `Delivery Destination`, `Status Timeline` (`WIB`), `Continue to Payment`, and `Cancel Order` | [`12-account-orders-list.png`](./screenshots/interaction/12-account-orders-list.png), [`13-account-order-detail-pending.png`](./screenshots/interaction/13-account-order-detail-pending.png) | `PASS` |
| `3.7` | Cancel `ARV-20261116-C9CA71` via UI confirmation | `POST /api/v1/orders/c3fbe5bc-f10c-4b58-88ef-523600fc7a30/cancel` -> `200` (`Idempotency-Key` present) | Order transitions to `CANCELLED`, `Status Timeline` appends `CANCELLED` (`WIB`), `Continue to Payment` / `Cancel Order` removed, `ARV-TOP-001` `availableQty` restored `24 -> 25`, `PENDING_PAYMENT` count = `0` | [`14-account-order-detail-cancelled.png`](./screenshots/interaction/14-account-order-detail-cancelled.png) | `PASS` |

---

## 4. Console, Network & Cleanup Telemetry

- **Guest Flow Telemetry:**
  - **Page Errors:** `0`
  - **Failed Requests:** `0`
  - **HTTP `>= 500`:** `0`
  - **HTTP `4xx`:** `1` intentional expected `404` (`POST /api/v1/checkout/quote` for invalid promo test `INVALIDCODE99`). Zero `401` responses on guest `/checkout` (`GET /api/v1/auth/me` is no longer called when `cart.ownerType === 'GUEST'`).
- **Authenticated Flow Telemetry:**
  - **Page Errors:** `0`
  - **Failed Requests:** `0`
  - **HTTP `>= 500`:** `0`
  - **HTTP `4xx`:** `1` known Phase 04 pre-login CSRF cache transition (`POST /api/v1/cart/merge` -> `403`, immediately auto-retried after `GET /api/v1/csrf-token` -> `200`). `0` console/HTTP errors across `/checkout`, `/checkout/status/[orderNumber]`, `/account/orders`, and `/account/orders/[orderNumber]`.
- **Non-Blocking Advisory (`INT-05-001`):**
  - In `apps/storefront/src/components/checkout/checkout-view.tsx`, `handleApplyCoupon` invokes `storefrontApi.quoteCheckout(...)` directly and then updates `appliedCouponCode`, which also sits in the quote `useEffect` dependency array (`L314`) and fires a second `POST /api/v1/checkout/quote` call per coupon application. Non-blocking (idempotent), though skipping the duplicate effect fetch would reduce quote traffic against the `@Throttle` window.
- **Post-QA State Verification:**
  - `GET /api/v1/orders?status=PENDING_PAYMENT&limit=20` -> `meta.total = 0`
  - `GET /api/v1/products/essentials-heavyweight-crew-tee` -> `ARV-TOP-001` `availableQty = 25` (baseline restored).

---

## 5. Repair Iteration 2 Re-Verification (`2026-11-16T05:53:00.317Z`)

Post-Repair-2 verification against the rebuilt local servers (`http://localhost:3000`, `http://localhost:4000`) confirmed all targeted fixes (`checkout-view.tsx` `lastCommittedQuoteKeyRef` quote deduplication, `checkout-status-view.tsx` & `order-detail-view.tsx` `Keep Order` focus restore):

| Check | Scenario & Verified Behavior | Network / Focus / Stock Measurement | Screenshot | Verdict |
|---|---|---|---|---|
| `R2.1` | Populated `/checkout` `WELCOME10` deduplication + `INVALIDCODE99` validation | `INVALIDCODE99` -> `POST /api/v1/checkout/quote` `404` (`#checkout-coupon-code-error`: `"Coupon code was not found"`); `WELCOME10` `Apply Code` -> strictly **`1` `POST /api/v1/checkout/quote` request & `1` response (`200`)** (`INT-05-001` **RESOLVED**) | [`repair2-checkout-welcome10.png`](./screenshots/interaction/repair2-checkout-welcome10.png) | `PASS` |
| `R2.2` | Guest `Place Order & Pay` -> `/checkout/status/ARV-20261116-E45248` -> `Cancel Order` -> `Keep Order` -> `Cancel Order` -> `Confirm Cancellation` | `Keep Order` restored `document.activeElement` to `<button>Cancel Order</button>`; `Confirm Cancellation` (`POST /api/v1/orders/:id/cancel` `200`) set `CANCELLED` and restored `ARV-TOP-001` `availableQty` `25 -> 24 -> 25` | [`repair2-guest-status-cancelled.png`](./screenshots/interaction/repair2-guest-status-cancelled.png) | `PASS` |
| `R2.3` | Customer `/account/orders/ARV-20261116-15E9A5` -> `Cancel Order` -> `Keep Order` -> `Cancel Order` -> `Confirm Cancellation` | `Keep Order` restored `document.activeElement` to `<button>Cancel Order</button>`; `Confirm Cancellation` (`POST /api/v1/orders/:id/cancel` `200`) set `CANCELLED`, restored `ARV-TOP-001` `availableQty` `25 -> 24 -> 25`, and left `0` `PENDING_PAYMENT` orders | [`repair2-account-order-cancelled.png`](./screenshots/interaction/repair2-account-order-cancelled.png) | `PASS` |

- **Repair 2 Network & Error Telemetry:**
  - **Guest Run:** `24` API requests, `0` page errors, `0` failed requests, `0` `5xx`, `1` intentional `404` (`INVALIDCODE99` quote test).
  - **Authenticated Run:** `39` API requests, `0` page errors, `0` failed requests, `0` `5xx`, `1` inherited Phase 04 `POST /api/v1/cart/merge` `403 -> 200` CSRF cache transition on login (`0` errors on `/checkout` and `/account/orders/*`).

---

## 6. Final Verdict

- **Functional Interaction Checkpoint (`interaction`):** **`PASS`**
