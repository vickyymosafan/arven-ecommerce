# ARVEN Phase 04 Functional Interaction QA Report (Post-Repair Re-Verification)

> **Harness Plan ID:** `1a47de03-ee06-469d-936b-8d01ef5b28cc`  
> **Task ID:** `ade4f9c8-f11f-479f-abbd-6fe1df7faeba`  
> **Checkpoint ID:** `interaction`  
> **Independent Verifier:** `functional-qa-agent`  
> **Post-Repair Execution Timestamp (UTC):** `2026-11-15T17:53:17.854Z`  
> **Browser Engine:** Playwright Chromium (`1280x800`, headless)  
> **Overall Verdict:** `PASS`

---

## 1. Executive Summary

Post-repair functional interaction QA against freshly built local servers (`http://localhost:3000`, `http://localhost:3001`, `http://localhost:4000`) passed all Storefront and Admin Phase 04 scenarios cleanly:

- **Storefront Guest Cart & Merge (`http://localhost:3000`):** PDP quantity `2` -> `Add to Bag` (`200`) -> live `Bag` pill `2` -> `/cart` qty `+1` (`PATCH` `200` -> `3`) -> reload persistence via `HttpOnly` `arven_guest_cart` -> customer login + merge (`/auth/login?next=/cart`, `POST /api/v1/cart/merge` `200` with `ownerType: "USER"` and `arven_guest_cart` cleared) -> `-1` (`PATCH` `200`) & `Remove` (`DELETE` `204`) returning `/cart` to empty state (`"Your Bag Is Empty"`, `Bag` pill `0`).
- **Admin `/inventory` (`http://localhost:3001/inventory`, Single MFA Session):** Single `OWNER` MFA authentication -> keyboard roving-tabindex navigation (`ArrowRight` / `End` / `ArrowLeft` / `Home` updating both `aria-selected` and `document.activeElement`) -> `Levels` search & reset -> blank-reason `ADJUSTMENT` Zod validation (`aria-describedby="movement-reason-error"`, `aria-invalid="true"`, `0` API calls) -> `RECEIPT +2` (`201`, `14 -> 16`, WIB timestamp & actor email) -> compensating `ADJUSTMENT -2` rollback (`201`, `16 -> 14` baseline restored).

---

## 2. Storefront Guest Cart & Merge Flow (`http://localhost:3000`)

| Step | Scenario & Verified State Transition | HTTP Status | Observed UI / Cookie / State Result | Verdict |
|---|---|---|---|---|
| `1.1` | Clean context on `/products/form-structured-calfskin-crossbody`, select variant | `200` | Product `"Form Structured Calfskin Crossbody"`, active SKU `ARV-ACC-001` | `PASS` |
| `1.2` | Increment stepper to `2`, click `Add to Bag` | `POST /api/v1/cart/items` -> `200` | Header `Bag` link `BagCountPill` = `"2"` (`"Bag2 items"` with `.sr-only` unit label), `"View Bag"` link visible | `PASS` |
| `1.3` | Open `/cart` | `GET /api/v1/cart` -> `200` | Line item `ARV-ACC-001`, unit price `Rp 799.000`, qty `2`, subtotal `Rp 1.598.000` | `PASS` |
| `1.4` | Click `+` stepper, reload `/cart` | `PATCH /api/v1/cart/items/:id` -> `200` | Qty updates `2 -> 3`, subtotal `Rp 2.397.000`; `arven_guest_cart` (`httpOnly: true`) present; after `page.reload()` qty remains `3` and subtotal remains `Rp 2.397.000` | `PASS` |
| `1.5` | Sign in as `customer.dev@arven.local` at `/auth/login?next=/cart` | `POST /api/v1/auth/login` -> `200`; `POST /api/v1/cart/merge` -> `[403, 200]` | Redirects to `/cart`; merged payload `ownerType === "USER"`, `"Saved to Account"` badge visible; `arven_guest_cart` cleared; `arven_sid` present | `PASS` |
| `1.6` | Click `-` stepper, click `Remove` | `PATCH` -> `200`; `DELETE /api/v1/cart/items/:id` -> `204` | Qty decrements `3 -> 2`; `Remove` deletes item (`204`); `/cart` shows `EmptyState` (`"Your Bag Is Empty"`) and header `BagCountPill` returns to `"0"` (`"Bag0 items"`) | `PASS` |

### Storefront Console & Network Telemetry

- **Page Errors:** `0`
- **Failed Requests:** `0`
- **Console Errors:** `1` (`Failed to load resource: the server responded with a status of 403 (Forbidden)`)
- **HTTP `>= 400` Responses:** `1` (`POST http://localhost:3000/api/v1/cart/merge` -> `403`, immediately auto-retried -> `200`)
- **Non-Blocking Transition Note:** Pre-login cached CSRF token in `apps/storefront/src/lib/api-client.ts` triggers one `403 CSRF_INVALID` on first `POST /api/v1/cart/merge` after `loginCustomer()`, then `clearCsrfTokenCache()` + retry succeeds cleanly with `200`. Zero errors occurred on PDP or `/cart` interactions.

---

## 3. Admin Inventory Operations Flow (`http://localhost:3001/inventory`)

| Step | Scenario & Verified State Transition | HTTP Status | Observed UI / Accessibility / Ledger Result | Verdict |
|---|---|---|---|---|
| `2.1` | Single Admin (`OWNER`) login + TOTP MFA -> `/inventory` | `POST /api/v1/auth/admin/login` -> `200`; `POST /api/v1/auth/mfa/verify` -> `[403, 200]` | Authenticated once (`owner.dev@arven.local`), navigated to `/inventory`; `20` inventory level rows hydrated | `PASS` |
| `2.2` | Keyboard tab navigation (`ArrowRight` / `End` / `ArrowLeft` / `Home`) | N/A | `ArrowRight` -> `document.activeElement.id === "inventory-tab-movements"` (`aria-selected="true"`); `End` -> `"inventory-tab-reservations"` (`"true"`); `ArrowLeft` -> `"inventory-tab-movements"` (`"true"`); `Home` -> `"inventory-tab-levels"` (`"true"`) | `PASS` |
| `2.3` | `Levels` search (`ARV-ACC-001`) + `Reset` | `GET /api/v1/admin/inventory/levels` -> `200` | Captured baseline `ARV-ACC-001` `quantityOnHand = 14`; `Reset` restored full table | `PASS` |
| `2.4` | Blank-reason `ADJUSTMENT` Zod validation | `0` API calls sent | Blocked submission; `#movement-reason` has `aria-describedby="movement-reason-error"`, `aria-invalid="true"`, and `#movement-reason-error` displays `"Reason must be at least 3 characters for manual stock adjustments"` | `PASS` |
| `2.5` | Submit `RECEIPT` (`+2` on `ARV-ACC-001`) | `POST /api/v1/admin/stock-movements` -> `201` | Modal closed; `Levels` updated `14 -> 16`; `Movements Ledger` top row: `16 Nov 2026, 00:53 WIB`, `ARV-ACC-001`, `RECEIPT`, `+2`, `MANUAL_ADMIN`, `owner.dev@arven.local` | `PASS` |
| `2.6` | Submit compensating `ADJUSTMENT` (`-2`, reason `"QA post-repair rollback check"`) | `POST /api/v1/admin/stock-movements` -> `201` | Modal closed; `Levels` restored to `14`; `Movements Ledger` top row: `16 Nov 2026, 00:53 WIB`, `ARV-ACC-001`, `ADJUSTMENT`, `-2`, `"QA post-repair rollback check"`, `MANUAL_ADMIN`, `owner.dev@arven.local` | `PASS` |

### Admin Console & Network Telemetry

- **Page Errors:** `0`
- **Failed Requests:** `2` (`GET /?_rsc=...` and `GET /api/v1/auth/me` `net::ERR_ABORTED` triggered when script navigated from `/` to `/inventory` immediately after MFA redirect; `0` failed requests on `/inventory`)
- **Console Errors:** `1` (`Failed to load resource: the server responded with a status of 403 (Forbidden)`)
- **HTTP `>= 400` Responses:** `1` (`POST http://localhost:3001/api/v1/auth/mfa/verify` -> `403`, immediately auto-retried -> `200`, matching the pre-login CSRF cache refresh behavior noted prior to repair)
- **On `/inventory`:** `0` console errors, `0` page errors, `0` failed requests, `0` HTTP `>= 400` responses.

---

## 4. Final Verdict

- **Post-Repair Functional Interaction Checkpoint (`interaction`):** **`PASS`**
- **Test State Cleanup:** Customer cart (`customer.dev@arven.local`) returned to empty (`0` items); `ARV-ACC-001` stock level returned to baseline (`14` on hand) via compensating `ADJUSTMENT` (`-2`).
