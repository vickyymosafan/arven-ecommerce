# ARVEN UI/UX, Layout & Typography Overhaul — Implementation & Build Evidence

- **Plan ID:** `b1568948-75be-4876-a938-8f6750d8b77a`
- **Date:** 2026-11-21
- **Scope:** Presentation-layer design system (`packages/ui`), Storefront (`apps/storefront`), Admin (`apps/admin`). Zero backend API contract, Prisma schema, auth/RBAC, or inventory/payment invariant changes.

## 1. Design System & Typography Overhaul (`packages/ui`)
- **Semantic Tokens & Dual Polarity (`packages/ui/src/styles/tokens.css`, `packages/ui/src/styles/theme.css`):**
  - Implemented all 10 `DESIGN.md` §4.2 fluid modular typography scales (`--text-display-xl`..`--text-sku`) with WCAG 1.4.4 compliant `clamp()` bounds (`max/min <= 2.5`), unitless line-heights, `text-wrap: balance` on headings, `text-wrap: pretty` on body copy, and semantic `.type-*` utilities.
  - Added WCAG-calibrated Atelier Gold semantic tokens (`--arven-accent-gold-fg`: `#6E542E` light / `#E2C9A4` dark; `--arven-accent-gold-bg`: `#F5EFE4` light / `#2C251B` dark) ensuring AA/AAA contrast on both Ivory and Charcoal surfaces.
  - Wired native OS polarity (`color-scheme: light dark`, `@media (prefers-color-scheme: dark)` on `:root:not([data-theme="light"])`) alongside explicit `[data-theme="light"]` / `[data-theme="dark"]` subtree overrides, `accent-color`, `scrollbar-color`, `@media (forced-colors: active)`, and `:target { scroll-margin-top: 5.5rem }`.
- **Component & Interaction Craft (`packages/ui/src/components/*`):**
  - `SkipLink`: Upgraded to WCAG off-screen slide-in (`-translate-y-[250%] focus:translate-y-0`), eliminating `1px` box vertical clipping while maintaining 16.7:1 focus contrast and 44px hit height.
  - `Button`: Replaced `disabled:opacity-50` with explicit AA-legible disabled tokens (`disabled:bg-subtle disabled:text-ink-muted disabled:border-hairline`), ensuring 5.9:1+ contrast in light and dark modes.
  - `Checkbox` (`input.tsx`): Upgraded hit target from 18px to `24x24px` (`h-6 w-6`, WCAG 2.2 AA).
  - `Badge`: Fixed `tone="gold"` to use `bg-gold-bg text-gold-fg border-gold-border/60`.
  - `ProductCard`: Gallery-grade architectural framing, solid bottom-pinned opaque status chips, studio monogram fallback spacing (`pb-12` + centered fit label so chips never overlap fallback text), and semantic `<del aria-label>` original price.
  - `Drawer` & `Modal`: Compositor-safe entrance animations (`arven-fade-in`, `arven-dialog-in`, `arven-drawer-in-right/left`), `overscroll-contain`, Tab focus trap inside `Drawer`, and `size` / `subtitle` / `footer` slots.
  - `ThemeToggle`: Added `compact` icon mode, OS `prefers-color-scheme` sync + `storage` cross-tab sync + `<meta name="color-scheme">` updates.
  - `icons.tsx`: Added crisp architectural outline icons (`IconSearch`, `IconBag`, `IconUser`, `IconFilter`, `IconArrowRight`, `IconPlus`, `IconMinus`, `IconChevronDown`).

## 2. Storefront Architecture & UX Polish (`apps/storefront`)
- **Navigation & Shell (`storefront-shell.tsx`, `cart-drawer.tsx`, `search-overlay.tsx`, `layout.tsx`):**
  - Replaced cramped 10-link colliding header with balanced 3-zone sticky header (`ARVEN` wordmark | 6 editorial links with compositor-safe `.nav-underline` | Search Modal trigger + Account + Shopping Bag slide-over Drawer + compact ThemeToggle).
  - Added slide-over `CartDrawer` synced with `CART_UPDATED_EVENT` and `OPEN_CART_DRAWER_EVENT` (live steppers, item removal, availability banner, IDR subtotal, direct checkout CTA).
  - Added `SearchOverlay` modal with autofocus search input and curated quick keywords.
  - Removed hardcoded `data-theme="light"` from `layout.tsx`, exported `viewport: Viewport = { colorScheme: 'light dark' }`, and enabled `Cormorant_Garamond` italic weight.
- **Homepage (`app/page.tsx`) & Editorial Routes:**
  - Asymmetric luxury editorial hero (`Beyond Trends.` / *`Beyond Time.`*) + `3:4` uncropped flagship garment plate with solid `#17191B` architectural caption plaque beneath the artwork.
  - 2-column `aspect-[5/2]` House Collections showcase (matching native `1600x640` SVG banners with zero text cropping), symmetrical 4-column Featured Releases grid, `data-theme="dark"` Virtual Showroom showcase band, non-clipped 5-column Category grid, AA-compliant Materiality Provenance cards, and Clientele Experience services (replacing Phase 02 governance copy).
  - `/shop` (`shop-browser.tsx`): Compact top search/sort toolbar + desktop sticky 260px left filter rail beside 3-column product grid + mobile slide-over Filter `Drawer`.
  - PDP (`product-detail-view.tsx`): 7:5 editorial split, clean thumbnails, segmented 2D/3D switcher, native `<details>/<summary>` specification accordions, and "Open Bag" drawer action.
  - Checkout (`checkout-view.tsx`): Added 3-step visual progress stepper (`01 Delivery Address`, `02 Courier & Promo`, `03 Payment Settlement`).
  - Eliminated all sub-12px typography (`text-[10px]`, `text-[11px]`) across all storefront and admin views.

## 3. Admin Portal Polish (`apps/admin`)
- `layout.tsx`: Enabled dual-theme polarity (`colorScheme: 'light dark'`, removed hardcoded `data-theme="dark"`) and Cormorant Garamond italic.
- `admin-shell.tsx` & `ops-helpers.ts`: Grouped sticky sidebar (`Command`, `Catalog & 3D`, `Commerce`, `Editorial`, `Governance`) preserving exact `ADMIN_NAV_ITEMS` order for RBAC tests.
- `app/page.tsx` & `app/login/page.tsx`: Replaced internal Phase labels with domain operations headings, upgraded KPI IDR labels to `text-xs font-semibold text-gold-fg`, and harmonized Login portal typography.

## 4. Build, Lint, Typecheck & Unit Test Results
Executed `pnpm --filter @arven/ui build && pnpm turbo typecheck lint test --filter=@arven/ui --filter=@arven/storefront --filter=@arven/admin`:
- **Turbo Tasks:** 14/14 PASSED (exit code 0)
- **Unit Tests:** 89/89 PASSED (`@arven/ui` 17/17 across 7 suites, `@arven/storefront` 40/40 across 10 suites, `@arven/admin` 32/32 across 8 suites)
- **ESLint:** 0 errors across `@arven/ui`, `@arven/storefront`, `@arven/admin`
- **TypeScript (`tsc --noEmit` + `next typegen`):** 0 errors across all 3 packages
- **Invariants scan:** 0 sub-12px classes, 0 raw `text-gold`, 0 em dashes (`\u2014`), 0 `#8B897F` text uses, 0 pink hexes.
