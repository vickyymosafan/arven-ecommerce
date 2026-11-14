# ARVEN: Design System & Experience Contract

> **Brand:** ARVEN (*"Beyond Trends. Beyond Time."*)
> **Status:** Phase 01 Canonical Design Contract
> **Sources of Truth:** [`ARVEN_Full_Blueprint_v1.md`](./ARVEN_Full_Blueprint_v1.md) (Sections 2, 3, 6, 13, 18, Appendix C), [`docs/PRD_AND_BUSINESS_RULES.md`](./docs/PRD_AND_BUSINESS_RULES.md), [`docs/DISCOVERY_REPORT.md`](./docs/DISCOVERY_REPORT.md), and [`docs/THREE_D_PIPELINE.md`](./docs/THREE_D_PIPELINE.md)
> **Scope:** Customer Storefront (`apps/storefront`), Operations Admin (`apps/admin`), and shared accessible UI primitives (`packages/ui`)

---

## 1. Brand & Visual Direction

### 1.1 Identity & Aesthetic Rationale

ARVEN is a luxury contemporary unisex fashion D2C platform spanning apparel, footwear, and accessories. Every interface decision serves product craft, material clarity, and transactional trust rather than decorative ornament.

- **Design Dials (Storefront Editorial):** `ENERGY 2 / RHYTHM 3 / MOTION 2`
  - Composed, gallery-quiet first impression on `Ivory` (`#F8F7F3`) and `Cream` (`#E9E4DA`) anchored by deep `Charcoal` (`#17191B`) typography, headers, footers, and dark 3D presentation bands.
  - Varied editorial rhythm: asymmetrical lookbook openers alternate with clean 4-column product grids and full-bleed textile studies.
  - Purposeful, restrained motion that confirms actions and preserves spatial continuity without continuous ambient loops.
- **Design Dials (Admin Operations Console):** `ENERGY 1 / RHYTHM 1 / MOTION 1`
  - High-legibility operational density built around the decision each screen owns (fulfill an order, audit stock movement, approve a refund, validate a 3D asset).
  - Supports both Light Operational Workspace (`Ivory`/`White`/`Cream`) and Dark Showcase/Console (`Charcoal`/`Graphite`) with independently verified semantic tokens.
- **Identity Motif:** Hairline `1px` architectural rules (`border.hairline`), sharp `0px–2px` editorial image framing, deliberate `3:4` garment portrait aspect ratios, and restrained editorial serif headlines paired with tabular numeric precision for IDR pricing and SKU codes.

### 1.2 Strict Anti-Slop Rules & Purpose Discipline

Every visual pattern in ARVEN must pass a one-line purpose check before entering code:

1. **No Pink Anywhere:** Pink, rose, magenta, and pastel-coral hues are strictly forbidden across UI tokens, focus rings, badges, illustrations, and error/hover states. Error states use warm terracotta brick (`#9C3D3D` on light; warm rust `#E48966` on dark).
2. **No Default AI Palettes or Gradients:** No blue-to-purple, cyan-to-blue, neon glows, radial hero orbs, or multi-hue rainbow gradients. Surfaces are solid editorial tones; image text overlays use a calibrated dark scrim (`rgba(23, 25, 27, 0.72)`).
3. **No Gratuitous Glassmorphism:** `backdrop-filter` is forbidden across navbars, product cards, sidebars, and modals simultaneously. Blur may appear on at most 1–2 transient functional overlays (such as a compact floating 3D viewer control strip or drawer backdrop) where foreground text contrast remains `>= 4.5:1`.
4. **No Decorative Bloat:** No background blueprint/dot grids, no left-edge decorative stripes on cards, no capsule "AI Powered / Beta / New" pill stacks above H1 headlines, no pulsing status dots, no decorative `→`/`↗` arrows on every button, and no emoji inside UI chrome or headings.
5. **No Fabricated Metrics or Testimonials:** Never render invented customer counts, fake "+12%" dashboard deltas, fictional reviews, or realistic dummy rows (`John Doe`, `johndoe@example.com`). Empty admin views show honest empty states with the next operational action.
6. **Copy Hygiene:** Forbid em dashes (`—`) and hype buzzwords ("Seamless", "Revolutionary", "Next Generation", "Effortless", "Unlock") in all UI copy. CTAs name the concrete outcome (`Tambah ke Tas`, `Lihat Koleksi`, `Lanjut ke Pembayaran`, `Proses Pengiriman`).
7. **Commerce-First Resilience:** Core browsing, variant selection, cart, and checkout must remain 100% functional without WebGL, avatars, or 3D scripts.

---

## 2. Storefront & Admin Sitemaps

Every navigation item rendered in UI MUST map to an implemented route. Unimplemented future-phase destinations (such as Showroom or Outfit Studio prior to Phase 08) must be feature-flagged out of live menus rather than shipped as dead links.

### 2.1 Storefront Sitemap (`apps/storefront`, Blueprint Section 6.1)

```text
Storefront (/)
├── Home (/)
├── Shop
│   ├── All Products (/shop)
│   ├── Category [slug] (/shop/[category])
│   └── Search (/search?q=...)
├── Collections [slug] (/collections, /collections/[slug])
├── Product [slug] (/products/[slug])
├── Experience (Phase 08)
│   ├── Virtual Showroom (/showroom)
│   └── Outfit Studio (/outfit-studio)
├── Lookbook [slug] (/lookbook, /lookbook/[slug])
├── Journal [slug] (/journal, /journal/[slug])
├── About & Contact (/about, /contact)
├── Legal (/privacy, /terms)
├── Auth (/login, /register, /forgot-password, /verify-email)
├── Cart & Checkout
│   ├── Cart (/cart + slide-over drawer)
│   └── Checkout (/checkout, /checkout/status/[orderNumber])
└── Account (/account)
    ├── Profile & Addresses (/account/addresses)
    ├── Orders [orderNumber] (/account/orders, /account/orders/[orderNumber])
    ├── Wishlist (/account/wishlist)
    └── Returns (/account/returns)
```

**Storefront Header Architecture:**
- **Primary Links (Desktop):** `Shop`, `Collections`, `Showroom` (Phase 08+), `Lookbook`, `Journal`, `About` (clean single row, no mega-menu bloat).
- **Utility Cluster:** `Search` (opens search bar/route), `Account`, `Bag` (with live server-synced item count badge when `> 0`).
- **Mobile Header (`< 768px`):** Compact `56px` bar containing `Menu` button (explicitly labeled `"Menu"` for screen readers and visible clarity, never a bare unlabeled hamburger), centered `ARVEN` wordmark, `Search`, and `Bag`. Opening `Menu` mounts a full-height accessible slide-over drawer with primary routes, collection links, language switcher (`ID` / `EN`), and `Account` entry.

### 2.2 Admin Sitemap (`apps/admin`, Blueprint Section 6.2)

```text
Admin (/admin)
├── Overview (/)
├── Catalog
│   ├── Products (/catalog/products, /catalog/products/[id])
│   ├── Variants (/catalog/variants)
│   ├── Categories (/catalog/categories)
│   ├── Collections (/catalog/collections)
│   ├── Media (/catalog/media)
│   └── 3D Assets (/catalog/3d-assets)
├── Inventory
│   ├── Warehouses (/inventory/warehouses)
│   ├── Stock Levels (/inventory/levels)
│   ├── Movements (/inventory/movements)
│   └── Reservations (/inventory/reservations)
├── Commerce
│   ├── Orders (/commerce/orders, /commerce/orders/[id])
│   ├── Payments (/commerce/payments)
│   ├── Shipments (/commerce/shipments)
│   ├── Returns (/commerce/returns)
│   ├── Refunds (/commerce/refunds)
│   └── Coupons (/commerce/coupons)
├── Customers
│   ├── Directory (/customers)
│   ├── Profiles (/customers/[id])
│   ├── Reviews (/customers/reviews)
│   └── Support Notes (/customers/notes)
├── Content
│   ├── Homepage (/content/homepage)
│   ├── Lookbook (/content/lookbook)
│   ├── Journal (/content/journal)
│   └── Campaigns (/content/campaigns)
├── Analytics
│   ├── Sales (/analytics/sales)
│   ├── Products (/analytics/products)
│   ├── Customers (/analytics/customers)
│   └── 3D Engagement (/analytics/3d)
└── Settings
    ├── Users (/settings/users)
    ├── Roles (/settings/roles)
    ├── Providers (/settings/providers)
    ├── Shipping (/settings/shipping)
    ├── Store (/settings/store)
    └── Audit Logs (/settings/audit-logs)
```

**Admin RBAC Navigation Rule:** Sidebar groups and links filter dynamically against the authenticated staff member's granular permission codes (e.g., `order.read`, `inventory.adjust`, `refund.approve`, `product.publish`, `asset.publish`, `user.role.manage`). Restricted destinations are hidden from navigation, and direct URL access renders an explicit `403` state with return navigation.

---

## 3. Three-Layer Token Architecture

Design tokens follow a strict **Primitive -> Semantic -> Component** hierarchy. React components and Tailwind utilities MUST consume Semantic or Component CSS custom properties (`--arven-*`), never raw primitive hex values.

### 3.1 Layer 1: Primitive Tokens

#### Color Primitives

| Token Name | Hex | Role / Origin |
|---|---|---|
| `--color-ivory-50` | `#F8F7F3` | Blueprint Ivory: primary editorial canvas |
| `--color-ivory-100` | `#F1EFE9` | Subtle elevated neutral well (product image frames, table row hover) |
| `--color-cream-200` | `#E9E4DA` | Blueprint Cream: editorial panels, light callout sections |
| `--color-cream-300` | `#DDD7CB` | Pressed/hover state for Cream panels and secondary buttons |
| `--color-white` | `#FFFFFF` | Pure crisp surface for inputs, modals, primary card surfaces on Ivory/Cream |
| `--color-stone-200` | `#D8D3C8` | Decorative hairline divider on light surfaces (non-text, non-control) |
| `--color-stone-300` | `#B2B0A6` | Accessible muted text on dark surfaces (`#17191B`, `#222528`, `#35383A`) |
| `--color-stone-400` | `#9E9C92` | Accessible interactive UI border on dark surfaces (`#35383A`, `#17191B`) |
| `--color-stone-500` | `#8B897F` | Blueprint Stone: large headings (`>= 18px` bold / `24px`), decorative rules, Ivory/White control borders, or muted text strictly on `#17191B` Charcoal |
| `--color-stone-600` | `#747269` | Accessible interactive control border on Cream (`#E9E4DA`) and normal text on `#F8F7F3`/`#FFFFFF` |
| `--color-stone-700` | `#5E5C54` | **Accessible Deep Stone**: primary muted text on ALL light surfaces (`#E9E4DA`, `#F1EFE9`, `#F8F7F3`, `#FFFFFF`) |
| `--color-graphite-700` | `#35383A` | Blueprint Graphite: dark secondary surface, dark cards/menus, light-mode secondary text |
| `--color-charcoal-800` | `#222528` | Dark subtle elevated surface (table hover, nested drawer well) |
| `--color-charcoal-900` | `#17191B` | Blueprint Charcoal: primary dark surface, header/footer/3D stage, primary light-mode ink |
| `--color-blue-600` | `#1F4E79` | Blueprint Accent Blue: light-mode links, focus rings, active indicators, solid accent fills |
| `--color-blue-100` | `#E6EEF5` | Soft info tint surface (light theme) |
| `--color-blue-300` | `#82B0DC` | Dark-mode Accent Blue: links, focus rings, active indicators on `#17191B`/`#35383A` |
| `--color-blue-900` | `#1E2C3A` | Soft info tint surface (dark theme) |
| `--color-sage-600` | `#416B59` | Blueprint Success: light-mode confirmation text, solid success fills |
| `--color-sage-100` | `#E8F0EC` | Soft success tint surface (light theme) |
| `--color-sage-300` | `#89BBA6` | Dark-mode Success text/icon on `#17191B`/`#35383A` |
| `--color-sage-900` | `#1E2E28` | Soft success tint surface (dark theme) |
| `--color-ochre-700` | `#875B12` | Light-mode Warning text/icon (warm brass/ochre, zero pink) |
| `--color-ochre-100` | `#F3ECE0` | Soft warning tint surface (light theme) |
| `--color-ochre-300` | `#E2AE55` | Dark-mode Warning text/icon on `#17191B`/`#35383A` |
| `--color-ochre-900` | `#30281B` | Soft warning tint surface (dark theme) |
| `--color-terracotta-700` | `#9C3D3D` | Blueprint Danger: light-mode error text, destructive fills |
| `--color-terracotta-100` | `#F5EAE8` | Soft danger tint surface (light theme) |
| `--color-terracotta-300` | `#E48966` | Dark-mode Danger text/icon (warm terracotta-rust, zero pink) |
| `--color-terracotta-900` | `#35231E` | Soft danger tint surface (dark theme) |
| `--color-scrim-dark-72` | `rgba(23, 25, 27, 0.72)` | Image overlay scrim (worst-case composite over `#FFFFFF` = `#58595B`) |

> **Stone `#8B897F` Governance Rule:** Because WCAG 2.2 contrast measurement shows `#8B897F` yields only `3.27:1` on `#F8F7F3` (Ivory) and `2.77:1` on `#E9E4DA` (Cream), `#8B897F` MUST NOT be used for normal body text, captions, prices, timestamps, or form labels on any light surface, nor for interactive control borders on Cream `#E9E4DA`. On light surfaces, use `#5E5C54` (`--color-stone-700`) for all muted text and `#747269` (`--color-stone-600`) for control borders on Cream. Reserve `#8B897F` strictly for decorative rules, large editorial numerals/subtitles (`>= 18px` bold or `>= 24px`) on `#F8F7F3`/`#FFFFFF`, interactive borders on `#F8F7F3`/`#FFFFFF`/`#35383A`, or muted text directly on `#17191B` Charcoal (`5.02:1`).

#### Spatial, Radius, Elevation & Z-Index Primitives

| Category | Tokens & Values | Purpose |
|---|---|---|
| **Spacing Scale (4px base)** | `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`, `--space-6: 24px`, `--space-8: 32px`, `--space-10: 40px`, `--space-12: 48px`, `--space-16: 64px`, `--space-20: 80px`, `--space-24: 96px` | Section padding halves on mobile (`48px` mobile vs `96px` desktop) so vertical scroll never feels empty |
| **Container & Grid** | `--container-max: 1440px`, `--container-prose: 65ch`, `--gutter-mobile: 16px`, `--gutter-tablet: 24px`, `--gutter-desktop: 48px` | Keeps editorial lookbooks wide while capping article/PDP prose at comfortable line measure |
| **Border Radii (`R-11`)** | `--radius-none: 0px` (editorial photo frames, tables), `--radius-xs: 2px` (badges, swatch squares, inputs), `--radius-sm: 4px` (buttons, cards in admin), `--radius-md: 8px` (modals, drawers), `--radius-full: 9999px` (circular color swatch dots ONLY) | Sharp architectural geometry distinguishes ARVEN from pill-shaped generic SaaS templates |
| **Elevation / Shadow (`R-12`)** | `--shadow-none: none` (default for cards, panels, tables), `--shadow-raised: 0 4px 16px rgba(23, 25, 27, 0.08)` (dropdowns, popovers), `--shadow-overlay: 0 12px 36px rgba(23, 25, 27, 0.18)` (modals, cart drawer, slide-over nav) | Flat surfaces separated by tonal step (`Ivory`/`Cream`/`White`) and `1px` rules; shadow reserved exclusively for floating overlay layers |
| **Z-Index Scale** | `--z-base: 0`, `--z-sticky: 20`, `--z-header: 30`, `--z-drawer: 40`, `--z-modal: 50`, `--z-toast: 60` | Prevents focus/overlay collisions between sticky headers, 3D controls, and Cart Drawer |

---

### 3.2 Layer 2: Semantic Tokens (Light Editorial & Dark Showcase/Admin Defined Independently)

Light and dark themes are designed independently (never via CSS `invert` or brightness hacks).

| Semantic Token | Light Editorial Storefront (`[data-theme="light"]`) | Dark Showcase & Admin (`[data-theme="dark"]`) |
|---|---|---|
| `--arven-surface-canvas` | `var(--color-ivory-50)` (`#F8F7F3`) | `var(--color-charcoal-900)` (`#17191B`) |
| `--arven-surface-subtle` | `var(--color-ivory-100)` (`#F1EFE9`) | `var(--color-charcoal-800)` (`#222528`) |
| `--arven-surface-panel` | `var(--color-cream-200)` (`#E9E4DA`) | `var(--color-graphite-700)` (`#35383A`) |
| `--arven-surface-panel-hover` | `var(--color-cream-300)` (`#DDD7CB`) | `var(--color-graphite-700)` (`#35383A`) + subtle inner border |
| `--arven-surface-elevated` | `var(--color-white)` (`#FFFFFF`) | `var(--color-graphite-700)` (`#35383A`) |
| `--arven-surface-inverse` | `var(--color-charcoal-900)` (`#17191B`) | `var(--color-ivory-50)` (`#F8F7F3`) |
| `--arven-text-primary` | `var(--color-charcoal-900)` (`#17191B`) | `var(--color-ivory-50)` (`#F8F7F3`) |
| `--arven-text-secondary` | `var(--color-graphite-700)` (`#35383A`) | `var(--color-cream-200)` (`#E9E4DA`) |
| `--arven-text-muted` | `var(--color-stone-700)` (`#5E5C54`) | `var(--color-stone-300)` (`#B2B0A6`) |
| `--arven-text-inverse` | `var(--color-ivory-50)` (`#F8F7F3`) | `var(--color-charcoal-900)` (`#17191B`) |
| `--arven-border-hairline` | `var(--color-stone-200)` (`#D8D3C8`) | `#46494C` (non-interactive hairline divider) |
| `--arven-border-control` | `var(--color-stone-600)` (`#747269`) | `var(--color-stone-400)` (`#9E9C92`) |
| `--arven-border-strong` | `var(--color-charcoal-900)` (`#17191B`) | `var(--color-ivory-50)` (`#F8F7F3`) |
| `--arven-accent-primary` | `var(--color-charcoal-900)` (`#17191B`) | `var(--color-ivory-50)` (`#F8F7F3`) |
| `--arven-accent-link` | `var(--color-blue-600)` (`#1F4E79`) | `var(--color-blue-300)` (`#82B0DC`) |
| `--arven-focus-ring` | `var(--color-blue-600)` (`#1F4E79`) | `var(--color-blue-300)` (`#82B0DC`) |
| `--arven-status-info-fg` | `var(--color-blue-600)` (`#1F4E79`) | `var(--color-blue-300)` (`#82B0DC`) |
| `--arven-status-info-bg` | `var(--color-blue-100)` (`#E6EEF5`) | `var(--color-blue-900)` (`#1E2C3A`) |
| `--arven-status-success-fg` | `var(--color-sage-600)` (`#416B59`) | `var(--color-sage-300)` (`#89BBA6`) |
| `--arven-status-success-bg` | `var(--color-sage-100)` (`#E8F0EC`) | `var(--color-sage-900)` (`#1E2E28`) |
| `--arven-status-warning-fg` | `var(--color-ochre-700)` (`#875B12`) | `var(--color-ochre-300)` (`#E2AE55`) |
| `--arven-status-warning-bg` | `var(--color-ochre-100)` (`#F3ECE0`) | `var(--color-ochre-900)` (`#30281B`) |
| `--arven-status-danger-fg` | `var(--color-terracotta-700)` (`#9C3D3D`) | `var(--color-terracotta-300)` (`#E48966`) |
| `--arven-status-danger-bg` | `var(--color-terracotta-100)` (`#F5EAE8`) | `var(--color-terracotta-900)` (`#35231E`) |

---

### 3.3 Layer 3: Component Tokens

Component tokens bind UI roles strictly to Semantic Tokens:

```css
/* Buttons */
--btn-primary-bg: var(--arven-accent-primary);
--btn-primary-fg: var(--arven-text-inverse);
--btn-primary-hover-bg: var(--color-graphite-700); /* Dark mode override: var(--color-cream-200) */
--btn-secondary-bg: var(--arven-surface-panel);
--btn-secondary-fg: var(--arven-text-primary);
--btn-secondary-border: var(--arven-border-control);
--btn-accent-bg: var(--color-blue-600);
--btn-accent-fg: var(--color-white);
--btn-danger-bg: var(--color-terracotta-700);
--btn-danger-fg: var(--color-white);

/* Inputs & Form Controls */
--input-bg: var(--arven-surface-elevated);
--input-fg: var(--arven-text-primary);
--input-placeholder: var(--arven-text-muted);
--input-border: var(--arven-border-control);
--input-border-focus: var(--arven-focus-ring);
--input-border-error: var(--arven-status-danger-fg);

/* Product Card & Media Wells */
--card-media-bg: var(--arven-surface-subtle);
--card-title-fg: var(--arven-text-primary);
--card-meta-fg: var(--arven-text-muted);
--card-border-hover: var(--arven-border-strong);

/* Admin Tables */
--table-header-bg: var(--arven-surface-panel);
--table-row-bg: var(--arven-surface-canvas);
--table-row-hover-bg: var(--arven-surface-subtle);
--table-border: var(--arven-border-hairline);

/* 3D Showcase Stage */
--stage3d-bg: var(--color-charcoal-900);
--stage3d-surface: var(--color-graphite-700);
--stage3d-fg: var(--color-ivory-50);
--stage3d-muted: var(--color-stone-300);
```

---

### 3.4 WCAG 2.2 Contrast Verification Table (`antislop-contrast:check_contrast`)

Every pairing below was computed directly via `antislop-contrast:check_contrast` (never guessed or eyeballed). Standard thresholds: **Normal Text `>= 4.5:1`**, **Large Text (`>= 18px` bold or `>= 24px`) `>= 3.0:1`**, **Non-Text UI Borders/Icons (WCAG 1.4.11) `>= 3.0:1`**.

#### A. Light Surface Pairings (`#F8F7F3` Ivory, `#F1EFE9` Subtle Ivory, `#E9E4DA` Cream, `#DDD7CB` Cream Hover, `#FFFFFF` White)

| Foreground | Background | Ratio | Normal Text (4.5) | Large Text (3.0) | Governance Usage Decision |
|---|---|---|---|---|---|
| `#17191B` (Charcoal) | `#F8F7F3` (Ivory) | `16.44` | PASS | PASS | Primary headings, body text, prices on main canvas |
| `#35383A` (Graphite) | `#F8F7F3` (Ivory) | `11.02` | PASS | PASS | Secondary body copy, specs on main canvas |
| `#5E5C54` (Deep Stone) | `#F8F7F3` (Ivory) | `6.25` | PASS | PASS | Muted metadata, captions, form labels on Ivory |
| `#747269` (Stone-600) | `#F8F7F3` (Ivory) | `4.50` | PASS | PASS | Interactive input borders (`4.50 >= 3.0`) and secondary notes |
| `#8B897F` (Stone) | `#F8F7F3` (Ivory) | `3.27` | **FAIL** | PASS | **Banned for normal text on Ivory**; allowed only for large display accents (`>= 24px`), decorative rules, or control borders (`3.27 >= 3.0`) |
| `#1F4E79` (Accent Blue) | `#F8F7F3` (Ivory) | `8.08` | PASS | PASS | Links, active filter states, focus rings on Ivory |
| `#416B59` (Success) | `#F8F7F3` (Ivory) | `5.64` | PASS | PASS | In-stock / success status text on Ivory |
| `#9C3D3D` (Danger) | `#F8F7F3` (Ivory) | `6.22` | PASS | PASS | Validation errors, destructive links on Ivory |
| `#875B12` (Ochre-700) | `#F8F7F3` (Ivory) | `5.54` | PASS | PASS | Low-stock / pending warning text on Ivory |
| `#17191B` (Charcoal) | `#E9E4DA` (Cream) | `13.91` | PASS | PASS | Headings, body, primary text on editorial Cream panels |
| `#35383A` (Graphite) | `#E9E4DA` (Cream) | `9.32` | PASS | PASS | Secondary prose on Cream panels |
| `#5E5C54` (Deep Stone) | `#E9E4DA` (Cream) | `5.29` | PASS | PASS | Accessible muted metadata, labels, placeholders on Cream |
| `#747269` (Stone-600) | `#E9E4DA` (Cream) | `3.81` | **FAIL** | PASS | **Non-text interactive border only** on Cream (`3.81 >= 3.0`); never normal text on Cream |
| `#8B897F` (Stone) | `#E9E4DA` (Cream) | `2.77` | **FAIL** | **FAIL** | **Banned for text AND interactive borders on Cream**; decorative hairline only |
| `#1F4E79` (Accent Blue) | `#E9E4DA` (Cream) | `6.84` | PASS | PASS | Links, focus rings on Cream panels |
| `#416B59` (Success) | `#E9E4DA` (Cream) | `4.77` | PASS | PASS | Success text on Cream panels |
| `#9C3D3D` (Danger) | `#E9E4DA` (Cream) | `5.26` | PASS | PASS | Error text on Cream panels |
| `#875B12` (Ochre-700) | `#E9E4DA` (Cream) | `4.69` | PASS | PASS | Warning text on Cream panels |
| `#17191B` (Charcoal) | `#DDD7CB` (Cream-300) | `12.30` | PASS | PASS | Hover state for secondary Cream buttons |
| `#5E5C54` (Deep Stone) | `#DDD7CB` (Cream-300) | `4.68` | PASS | PASS | Muted meta inside hovered Cream rows/buttons |
| `#17191B` (Charcoal) | `#F1EFE9` (Ivory-100) | `15.33` | PASS | PASS | Text inside subtle elevated wells and hovered table rows |
| `#5E5C54` (Deep Stone) | `#F1EFE9` (Ivory-100) | `5.83` | PASS | PASS | Muted meta inside subtle elevated wells |
| `#1F4E79` (Accent Blue) | `#F1EFE9` (Ivory-100) | `7.53` | PASS | PASS | Links inside hovered table rows |
| `#416B59` (Success) | `#F1EFE9` (Ivory-100) | `5.26` | PASS | PASS | Success labels inside hovered table rows |
| `#9C3D3D` (Danger) | `#F1EFE9` (Ivory-100) | `5.80` | PASS | PASS | Error labels inside hovered table rows |
| `#747269` (Stone-600) | `#F1EFE9` (Ivory-100) | `4.20` | **FAIL** | PASS | Non-text control borders inside subtle wells (`4.20 >= 3.0`) |
| `#17191B` (Charcoal) | `#FFFFFF` (White) | `17.63` | PASS | PASS | Input text, modal titles, drawer headings |
| `#35383A` (Graphite) | `#FFFFFF` (White) | `11.81` | PASS | PASS | Modal body copy |
| `#5E5C54` (Deep Stone) | `#FFFFFF` (White) | `6.70` | PASS | PASS | Input placeholders, helper captions on White |
| `#747269` (Stone-600) | `#FFFFFF` (White) | `4.82` | PASS | PASS | Input borders and secondary captions on White |
| `#8B897F` (Stone) | `#FFFFFF` (White) | `3.51` | **FAIL** | PASS | **Banned for normal text on White**; non-text border (`3.51 >= 3.0`) or large display only |
| `#1F4E79` (Accent Blue) | `#FFFFFF` (White) | `8.66` | PASS | PASS | Links and focus rings on White inputs/modals |
| `#416B59` (Success) | `#FFFFFF` (White) | `6.05` | PASS | PASS | Success feedback on White |
| `#9C3D3D` (Danger) | `#FFFFFF` (White) | `6.67` | PASS | PASS | Error feedback on White |

#### B. Dark Surface Pairings (`#17191B` Charcoal, `#222528` Charcoal-800, `#35383A` Graphite)

| Foreground | Background | Ratio | Normal Text (4.5) | Large Text (3.0) | Governance Usage Decision |
|---|---|---|---|---|---|
| `#FFFFFF` (White) | `#17191B` (Charcoal) | `17.63` | PASS | PASS | High-emphasis display titles and header/footer links |
| `#F8F7F3` (Ivory) | `#17191B` (Charcoal) | `16.44` | PASS | PASS | Primary dark-theme body text and navigation |
| `#E9E4DA` (Cream) | `#17191B` (Charcoal) | `13.91` | PASS | PASS | Secondary dark-theme editorial prose |
| `#B2B0A6` (Stone-300) | `#17191B` (Charcoal) | `8.10` | PASS | PASS | Primary dark-theme muted metadata |
| `#9E9C92` (Stone-400) | `#17191B` (Charcoal) | `6.40` | PASS | PASS | Dark-theme control borders and subtle labels on Charcoal |
| `#8B897F` (Stone) | `#17191B` (Charcoal) | `5.02` | PASS | PASS | Allowed for muted footer text strictly over `#17191B` Charcoal |
| `#1F4E79` (Accent Blue) | `#17191B` (Charcoal) | `2.03` | **FAIL** | **FAIL** | **Banned as foreground on dark surfaces** (use `#82B0DC`) |
| `#416B59` (Success) | `#17191B` (Charcoal) | `2.91` | **FAIL** | **FAIL** | **Banned as foreground on dark surfaces** (use `#89BBA6`) |
| `#9C3D3D` (Danger) | `#17191B` (Charcoal) | `2.64` | **FAIL** | **FAIL** | **Banned as foreground on dark surfaces** (use `#E48966`) |
| `#82B0DC` (Blue-300) | `#17191B` (Charcoal) | `7.72` | PASS | PASS | Dark-theme links, focus rings, active control indicators |
| `#89BBA6` (Sage-300) | `#17191B` (Charcoal) | `8.16` | PASS | PASS | Dark-theme success text and indicators |
| `#E2AE55` (Ochre-300) | `#17191B` (Charcoal) | `8.75` | PASS | PASS | Dark-theme warning text and indicators |
| `#E48966` (Terracotta-300) | `#17191B` (Charcoal) | `6.77` | PASS | PASS | Dark-theme error text and destructive accents |
| `#FFFFFF` (White) | `#35383A` (Graphite) | `11.81` | PASS | PASS | Primary text in dark cards, menus, 3D HUD overlays |
| `#F8F7F3` (Ivory) | `#35383A` (Graphite) | `11.02` | PASS | PASS | Primary body copy on Graphite menus/cards |
| `#E9E4DA` (Cream) | `#35383A` (Graphite) | `9.32` | PASS | PASS | Secondary copy on Graphite |
| `#B2B0A6` (Stone-300) | `#35383A` (Graphite) | `5.43` | PASS | PASS | Accessible dark-theme muted metadata on Graphite |
| `#9E9C92` (Stone-400) | `#35383A` (Graphite) | `4.29` | **FAIL** | PASS | **Non-text interactive border only** on Graphite (`4.29 >= 3.0`) |
| `#8B897F` (Stone) | `#35383A` (Graphite) | `3.36` | **FAIL** | PASS | **Banned for normal text on Graphite**; non-text border/large text only |
| `#82B0DC` (Blue-300) | `#35383A` (Graphite) | `5.17` | PASS | PASS | Links and focus rings on Graphite |
| `#89BBA6` (Sage-300) | `#35383A` (Graphite) | `5.47` | PASS | PASS | Success text on Graphite |
| `#E2AE55` (Ochre-300) | `#35383A` (Graphite) | `5.86` | PASS | PASS | Warning text on Graphite |
| `#E48966` (Terracotta-300) | `#35383A` (Graphite) | `4.54` | PASS | PASS | Error text on Graphite |
| `#F8F7F3` (Ivory) | `#222528` (Charcoal-800) | `14.37` | PASS | PASS | Text on dark hovered rows |
| `#B2B0A6` (Stone-300) | `#222528` (Charcoal-800) | `7.08` | PASS | PASS | Muted text on dark hovered rows |
| `#82B0DC` (Blue-300) | `#222528` (Charcoal-800) | `6.74` | PASS | PASS | Links on dark hovered rows |
| `#89BBA6` (Sage-300) | `#222528` (Charcoal-800) | `7.13` | PASS | PASS | Success labels on dark hovered rows |
| `#E2AE55` (Ochre-300) | `#222528` (Charcoal-800) | `7.64` | PASS | PASS | Warning labels on dark hovered rows |
| `#E48966` (Terracotta-300) | `#222528` (Charcoal-800) | `5.92` | PASS | PASS | Error labels on dark hovered rows |

#### C. Solid Fills, Soft Status Tints & Image Scrim Pairings

| Foreground | Background | Ratio | Normal Text (4.5) | Large Text (3.0) | Governance Usage Decision |
|---|---|---|---|---|---|
| `#FFFFFF` (White) | `#1F4E79` (Accent Blue) | `8.66` | PASS | PASS | Accent button text / active blue pill |
| `#F8F7F3` (Ivory) | `#1F4E79` (Accent Blue) | `8.08` | PASS | PASS | Ivory text on solid Accent Blue badge |
| `#FFFFFF` (White) | `#416B59` (Success) | `6.05` | PASS | PASS | Solid success badge/confirmation button |
| `#FFFFFF` (White) | `#9C3D3D` (Danger) | `6.67` | PASS | PASS | Destructive action button (`Cancel Order`, `Delete`) |
| `#17191B` (Charcoal) | `#82B0DC` (Blue-300) | `7.72` | PASS | PASS | Dark-mode accent CTA button fill |
| `#1F4E79` (Blue-600) | `#E6EEF5` (Blue-100) | `7.39` | PASS | PASS | Light soft info banner/status chip |
| `#416B59` (Sage-600) | `#E8F0EC` (Sage-100) | `5.21` | PASS | PASS | Light soft success banner/status chip |
| `#875B12` (Ochre-700) | `#F3ECE0` (Ochre-100) | `5.06` | PASS | PASS | Light soft warning banner/status chip |
| `#9C3D3D` (Terracotta-700) | `#F5EAE8` (Terracotta-100) | `5.66` | PASS | PASS | Light soft error banner/status chip |
| `#82B0DC` (Blue-300) | `#1E2C3A` (Blue-900) | `6.23` | PASS | PASS | Dark soft info banner/status chip |
| `#89BBA6` (Sage-300) | `#1E2E28` (Sage-900) | `6.58` | PASS | PASS | Dark soft success banner/status chip |
| `#E2AE55` (Ochre-300) | `#30281B` (Ochre-900) | `7.21` | PASS | PASS | Dark soft warning banner/status chip |
| `#E48966` (Terracotta-300) | `#35231E` (Terracotta-900) | `5.72` | PASS | PASS | Dark soft error banner/status chip |
| `#F8F7F3` (Ivory) | `#58595B` (Worst-case `scrim-dark-72` over `#FFFFFF`) | `6.54` | PASS | PASS | Editorial hero/lookbook text over photography with scrim |
| `#FFFFFF` (White) | `#58595B` (Worst-case `scrim-dark-72` over `#FFFFFF`) | `7.01` | PASS | PASS | White hero CTA/label over photography with scrim |

---

## 4. Typography Scale, Loading & Localization Rules

### 4.1 Typeface Pairing & Rationale (`R-06`)

| Role | Typeface | Fallback Stack | Weights Loaded | Brand Rationale |
|---|---|---|---|---|
| **Display / Editorial Serif** (`--font-display`) | `Cormorant Garamond` (`next/font/google`) | `Georgia, "Times New Roman", serif` | `400`, `500`, `600`, `400 italic` | High-contrast humanist editorial serif evoking contemporary fashion lookbooks without ornamental bloat; avoids generic tech display tropes. |
| **UI & Body Sans** (`--font-sans`) | `Plus Jakarta Sans` (`next/font/google`) | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | `400`, `500`, `600`, `700` | Indonesian-rooted contemporary geometric sans with open counters at `12px–16px`, full Latin diacritic support, and clean tabular numerals (`tabular-nums`); avoids the default AI `Inter`/`Space Grotesk` tell. |
| **Code / Identifier Mono** (`--font-mono`) | `IBM Plex Mono` (`next/font/google`) | `ui-monospace, SFMono-Regular, Menlo, monospace` | `400`, `500` | Restricted strictly to SKU IDs (`ARV-TOP-001`), order numbers, webhook IDs, and audit hashes. **Never** used for marketing headings or faux-terminal hero blocks. |

### 4.2 Modular Fluid Scale & Unitless Line-Heights

All line-heights are **unitless** so text scales cleanly when users zoom to `200%` (WCAG 1.4.4) and localized copy wraps onto additional lines without vertical collision.

| Token | Font Stack | Size (`clamp` / `rem`) | Unitless Line-Height | Weight | Letter-Spacing | Usage |
|---|---|---|---|---|---|---|
| `--text-display-xl` | `--font-display` | `clamp(2.5rem, 4.5vw + 1rem, 4.75rem)` (`40px–76px`) | `1.06` | `500` | `-0.02em` | Homepage campaign headline, Lookbook title |
| `--text-display-lg` | `--font-display` | `clamp(2rem, 3vw + 0.85rem, 3.25rem)` (`32px–52px`) | `1.10` | `500` | `-0.015em` | Collection opener, Journal article H1 |
| `--text-h1` | `--font-display` | `clamp(1.75rem, 2vw + 0.75rem, 2.5rem)` (`28px–40px`) | `1.15` | `500` | `-0.01em` | PDP product title, Shop/Account page H1 |
| `--text-h2` | `--font-sans` | `clamp(1.25rem, 1vw + 0.85rem, 1.625rem)` (`20px–26px`) | `1.25` | `600` | `-0.01em` | Section headers, Admin page titles, Drawer headings |
| `--text-h3` | `--font-sans` | `1.125rem` (`18px`) | `1.30` | `600` | `0` | Subsections, Checkout step headings, Card group headers |
| `--text-body` | `--font-sans` | `1rem` (`16px`) | `1.60` | `400` | `0` | Primary editorial prose (`max-width: 65ch`), descriptions, forms |
| `--text-ui` | `--font-sans` | `0.875rem` (`14px`) | `1.45` | `400 / 500` | `0` | Navigation links, buttons, table cells, product card titles, prices |
| `--text-caption` | `--font-sans` | `0.75rem` (`12px`) | `1.40` | `500` | `0.02em` | Form helpers, timestamps, stock hints, status chips (minimum UI text floor: `12px`) |
| `--text-micro-label` | `--font-sans` | `0.75rem` (`12px`) | `1.30` | `600` | `0.06em` | Controlled uppercase section labels only (tracking capped at `0.06em`, never wide `0.2em` slop) |
| `--text-sku` | `--font-mono` | `0.8125rem` (`13px`) | `1.40` | `400` | `0` | SKUs (`ARV-TOP-001`), tracking numbers, audit IDs |

### 4.3 Font Loading & CLS Prevention

- Load all three font families once at the root layout via `next/font/google` with `display: 'swap'`, `subsets: ['latin']`, and CSS variables (`--font-display`, `--font-sans`, `--font-mono`) attached to `<html>`, wired into Tailwind CSS v4 via `@theme inline`.
- Zero blocking external Google Fonts `<link>` tags at runtime (Next.js self-hosts font woff2 files at build time).
- Do not override `adjustFontFallback` off; allow Next.js automatic metric fallback adjustment so font swap produces CLS `<= 0.05`.

### 4.4 Localization (`id` Primary / `en` Secondary) & IDR Formatting

- **Bahasa Indonesia Expansion Allowance:** Indonesian UI labels are routinely 15%–25% longer than English equivalents (`"Bag"` vs `"Tas Belanja"`, `"Add to Bag"` vs `"Tambah ke Tas"`, `"Shipping Method"` vs `"Layanan Pengiriman"`).
  - Never hardcode fixed `width` or `white-space: nowrap` + `overflow: hidden` on buttons, tabs, badges, or table column headers.
  - Allow multi-line wrapping cleanly inside cards and buttons (`min-height: 44px`, padding vertical + horizontal).
  - QA tests MUST inspect critical routes (`Home`, `Shop`, `PDP`, `Cart`, `Checkout`, `Admin Orders`) with Indonesian copy at `320px`, `375px`, and `200%` zoom.
- **Currency Formatting (`IDR`):**
  - Always format using integer rupiah via a single deterministic `formatIDR()` helper wrapping `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 })` and stripping ICU non-breaking whitespace after `Rp` so server and client render `Rp299.000` / `Rp1.299.000` identically without React hydration mismatch.
  - Apply `font-variant-numeric: tabular-nums` (`tabular-nums`) to every price, subtotal, discount, shipping fee, quantity, and dashboard metric so columns align vertically.
- **Date & Timezone Formatting:**
  - Backend stores UTC ISO timestamps; UI converts to `Asia/Jakarta` (`WIB`) unless customer/admin profile specifies otherwise (e.g., `14 Nov 2026, 14.30 WIB` in `id-ID`).

---

## 5. Component Grammar & Required Interactive States

Every component in `packages/ui`, `apps/storefront`, and `apps/admin` MUST implement explicit visual and accessible handling for all required states: **`default`**, **`hover`**, **`active`**, **`focus`**, **`disabled`**, **`loading`**, **`empty`**, **`error`**, and **`success`**. Never communicate state by color alone: pair color with explicit text, icon, or pattern.

### 5.1 Shared Interactive Baseline

- **Minimum Touch Target (`R-03`):** Every clickable control (buttons, swatch targets, quantity steppers, filter checkboxes, pagination buttons, icon triggers) MUST occupy a minimum `44 x 44 px` hit area with at least `8px` spacing between adjacent targets on touch viewports.
- **Visible Focus Ring (`R-32`):** `:focus-visible` renders a `2px solid var(--arven-focus-ring)` outline with `2px` offset (`outline-offset: 2px`), meeting `>= 3.0:1` non-text contrast in both light (`#1F4E79`) and dark (`#82B0DC`) themes. `outline: none` without replacement is strictly forbidden.
- **Keyboard Escape & Focus Trap (`R-26`, `R-32`):** All modals, drawers, and popovers trap focus while open, close on `Escape` and backdrop click, and restore focus to their trigger element on close.

### 5.2 Core Component Specifications

#### 1. Navigation (Header, Mobile Drawer, Admin Sidebar, Breadcrumbs)
- **Anatomy:** Top utility/brand bar (`56px` mobile, `72px` desktop), single-row horizontal primary links on desktop (`>= 1024px` or `>= 768px` compact), mobile slide-over drawer (`< 768px`), footer with factual store/legal/contact groups (never a hollow 4-column template).
- **States:**
  - `default` / `hover`: `1px` bottom underline transition on link text (`transform: scaleX` / `opacity`), never shifting layout.
  - `active`: Current route highlighted with `aria-current="page"`, bold `600` weight, and bottom hairline indicator.
  - `focus`: Full focus ring around padded link hit box.
  - `loading` (Cart Bag count / Session auth): Render neutral label without layout jump (`Tas` -> `Tas (2)` inside reserved width).
  - `error` / `empty` (Search quick-query inside nav): Inline readable message (`"Tidak ditemukan produk untuk kata kunci tersebut"` + link to All Products).

#### 2. Product Card (`Storefront Grid`)
- **Anatomy:**
  1. Media frame (`aspect-[3/4]`, background `--arven-surface-subtle` `#F1EFE9`, `object-cover`, optional top-right crisp `3D` functional indicator badge ONLY when `Product3DAsset.status === 'READY'`).
  2. Color swatch row (up to 4 circular `16px` visual swatches inside `44x44px` hit boxes on PDP or link-only preview dots on Card, plus `+N` overflow text if `> 4` colors; never clickable dead swatches).
  3. Product Title (`--text-ui`, `font-medium`, max 2 lines, natural wrap).
  4. Price (`--text-ui`, `tabular-nums`, e.g., `Rp299.000`; optional strikethrough `compareAtPrice` only when a real active markdown exists, paired with `"Harga Asli"` `sr-only` context).
- **States:**
  - `default`: Clean image + metadata on Ivory without outer border box noise.
  - `hover`: Subtle image scale (`scale(1.02)`, `200ms`) or secondary studio image crossfade when available (respecting reduced motion), bottom `1px` border highlight.
  - `focus`: Entire card anchor or title link receives visible `2px` focus ring.
  - `loading`: Proportion-matched `aspect-[3/4]` tonal block + 2 title/price placeholder bars (no pulsing neon shimmer).
  - `disabled` / Sold Out: Explicit text badge `"Stok Habis"` / `"Out of Stock"` in `--arven-surface-panel` with `--arven-text-primary` text (never relies on opacity fade alone); card remains inspectable.
  - `error` (Image load failure): Neutral `#F1EFE9` placeholder displaying product name + category label cleanly with `alt` fallback.

#### 3. Variant Selector (Color & Size)
- **Anatomy:** Separate `fieldset` / `legend` groups for Color (`Warna: Black`) and Size (`Ukuran: M`), followed by deterministic stock hint (`"Tersedia"`, `"Tersisa 3 unit"`, or `"Stok Habis"`).
- **States:**
  - `default`: Unselected options have `1px solid var(--arven-border-control)` (`>= 3.0:1` contrast).
  - `hover`: Border transitions to `--arven-border-strong` (`#17191B` / `#F8F7F3`).
  - `active` / Selected: `2px` solid border `--arven-border-strong` + solid `--arven-surface-inverse` fill on Size button (with checkmark/`aria-checked="true"` + visible selected color name in legend so color is never sole indicator).
  - `focus`: Outer `2px` `--arven-focus-ring` separated by `2px` offset.
  - `disabled` (Out of stock / inactive SKU): Diagonal hairline strike + text `"Habis"` / `"Unavailable"`, `aria-disabled="true"` (kept focusable with clear explanation why it cannot be added to bag, OR distinct visual + `disabled` semantics matching ARIA best practices).
  - `error` (User clicks Add to Bag before selecting size): Inline error banner directly above/below Size `fieldset` (`role="alert"`, `--arven-status-danger-fg`, icon + `"Pilih ukuran terlebih dahulu"`), focus moves or points cleanly to the Size selector.
  - `loading` (Variant stock revalidation): Button shows `"Memeriksa stok..."` while keeping selected state locked.
  - `success` (Added to Bag): Inline confirmation + opens Cart Drawer or updates `aria-live="polite"` region (`"Essential Oversized Tee (Black, M) ditambahkan ke tas"`).

#### 4. Size Guide Modal / Drawer
- **Anatomy:** Accessible `<dialog>` / ARIA `role="dialog" aria-modal="true"` triggered from PDP Variant Selector (`"Panduan Ukuran"`). Displays category-specific measurements (Tops/Outerwear: `Lebar Dada / Panjang / Bahu` in `cm`; Bottoms: `Pinggang / Pinggul / Panjang`; Footwear: `EU / Panjang Kaki cm`; Accessories: `Dimensi cm`), fit notes (`Oversized`, `Relaxed`, `Structured`), and model/measurement reference when real data exists.
- **States:**
  - `default` / `open`: Table wrapped in horizontal scroll container with sticky first size column on narrow mobile (`< 640px`).
  - `loading`: Inline spinner + `"Memuat panduan ukuran..."`.
  - `empty`: Explicit fallback note (`"Panduan ukuran belum tersedia untuk kategori ini. Hubungi layanan pelanggan untuk detail ukuran."`).
  - `error`: Retry action inside dialog.
  - `focus` / Close: Initial focus moves to dialog close button or heading; `Escape` closes and returns focus to `"Panduan Ukuran"` trigger.

#### 5. Cart Drawer & Cart Page (`/cart`)
- **Anatomy:** Line item list (thumbnail `72x96px`, product link, selected color/size, optional customization preset label, unit price `tabular-nums`, `44x44px` `-` / `+` quantity stepper, remove action), price breakdown (`Subtotal`, note that shipping & promo coupons apply at Checkout), primary CTA `"Lanjut ke Checkout"`, secondary `"Lihat Tas Lengkap"`.
- **States:**
  - `default`: Live server-recalculated line totals.
  - `loading`: Optimistic lock on targeted item stepper (`aria-busy="true"`), disabling duplicate clicks while API confirms.
  - `empty`: Clear message (`"Tas belanja Anda masih kosong"`) + 1 primary CTA (`"Jelajahi Koleksi"` -> `/shop`).
  - `error` / Price or Stock Changed (`409` / server re-sync): Persistent non-dismissible inline warning banner (`--arven-status-warning-bg` / `--arven-status-warning-fg`) naming the exact item whose price updated or whose quantity was capped to available stock (`"Harga atau stok untuk Structured Trousers telah diperbarui."`).
  - `disabled`: Checkout CTA disabled with explicit reason text when any cart item is out of stock until adjusted/removed.
  - `success`: Confirmation feedback on item update/removal or promo eligibility.

#### 6. Checkout Summary & Flow (`/checkout`)
- **Anatomy:** Multi-section layout (1 column mobile, `7:5` asymmetric split desktop with sticky order summary on right):
  1. Contact & Shipping Address (authenticated saved address cards OR validated guest address inputs; mobile inputs include `scroll-margin-bottom` so the on-screen keyboard never hides focused fields).
  2. Shipping Service Selector (server-quoted rates, ETA, service code).
  3. Coupon Code Input (`Apply` / `Hapus` toggle).
  4. Order Summary Card (`Subtotal`, `Diskon Kupon`, `Ongkos Kirim`, `Pajak` if applicable, `Total Pembayaran` in `tabular-nums`).
  5. Primary Submit CTA (`"Buat Pesanan & Bayar"`).
- **States:**
  - `default`: Displays server-computed quote from `POST /checkout/quote`.
  - `loading` (Quote calculation or Order creation): Disables submit CTA with `"Memproses pesanan..."` and locks `Idempotency-Key` to prevent duplicate orders.
  - `empty` (Reached `/checkout` with empty cart): Redirects or renders clear empty checkout recovery linking to `/shop`.
  - `error` (Quote expired, invalid coupon, stock reservation conflict `409`, payment session creation failure): Explicit error banner (`role="alert"`) distinguishing recoverable input error (e.g., invalid coupon) from stock exhaustion (with link back to Cart) or payment retry (order created `PENDING_PAYMENT`, `"Coba Bayar Lagi"` action).
  - `success` / Payment Pending: Clear confirmation screen noting that payment confirmation is finalized by payment gateway verification (`"Menunggu konfirmasi pembayaran..."` vs `"Pembayaran Diterima"`), never trusting browser redirect URL parameters alone.

#### 7. Admin Data Tables (Orders, Products, Inventory Movements, Audit Logs)
- **Anatomy:** Decision-first column order (e.g., Admin Orders: `Order #`, `Tanggal (WIB)`, `Pelanggan`, `Status Order`, `Status Pembayaran`, `Total (IDR)`, `Aksi`), top filter toolbar (Search input + faceted status/date filters synced to URL query params), horizontal scroll container on mobile/tablet (`overflow-x-auto`) with crisp sticky first ID column, pagination footer (`Prev` / `Page X of Y` / `Next`).
- **States:**
  - `default` / `hover`: `1px` row dividers, subtle background shift (`--arven-surface-subtle` `#F1EFE9` light / `#222528` dark) on hover; row action menus expose ONLY actions permitted by the user's RBAC role.
  - `focus`: Keyboard-navigable header sort buttons and row action triggers with visible `2px` focus ring.
  - `loading`: Explicit table-body loading state (`"Memuat data pesanan..."` + column-aligned skeleton rows matching real column widths).
  - `empty`: Differentiate **first-run empty** (`"Belum ada pesanan masuk."`) vs **filtered empty** (`"Tidak ada pesanan sesuai filter."` + `"Reset Filter"` button).
  - `error`: Inline table alert banner (`403 Unauthorized`, `500 Server Error`, or `409 Optimistic Concurrency Conflict` when two admins update the same order) with `"Muat Ulang"` retry action.
  - `disabled`: Mutually exclusive state-machine actions disabled with tooltip/text explaining current order state (e.g., cannot ship an `EXPIRED` or `PENDING_PAYMENT` order).
  - `success`: Non-blocking status toast + live table refresh after command transitions (`"Order #ARV-1024 ditandai Siap Dikirim"`).

#### 8. 3D Product Viewer Controls (`<AccessibleProductControls>`)
- **Anatomy:** Dedicated HTML control strip outside `<canvas>` providing: View Mode toggle (`Foto 2D` / `Model 3D`), Preset/Material Swatch Selector (matching server `customization_presets`), Camera Step Controls (`Putar Kiri`, `Putar Kanan`, `Perbesar`, `Perkecil`, `Reset Tampilan`), and `"Lewati 3D"` skip link.
- **States:** Cover `default`, `loading` (progress percentage/status over crisp `poster.webp`), `error` (graceful fallback to 2D Gallery + `"Muat Ulang 3D"` button), `disabled` (WebGL unsupported notice showing 2D Gallery cleanly), `focus`, `hover`, `active`, `success` (preset applied announcement in `aria-live="polite"`). Full technical architecture is governed by [`docs/THREE_D_PIPELINE.md`](./docs/THREE_D_PIPELINE.md).

---

## 6. Motion Tokens & `prefers-reduced-motion` Rules

Motion communicates state transitions and spatial hierarchy. Continuous ambient loops, decorative bounces, and pulsing indicator dots are forbidden (`R-19`).

### 6.1 Motion Token Table

| Token | Value | Purpose |
|---|---|---|
| `--duration-instant` | `0ms` | Immediate state updates, keyboard focus ring appearance |
| `--duration-fast` | `120ms` | Button hover/press, swatch selection, link underline |
| `--duration-base` | `200ms` | Dropdown open/close, accordion expand, filter chip feedback |
| `--duration-moderate` | `320ms` | Cart Drawer / Mobile Menu slide-over (`transform` + `opacity` only) |
| `--duration-editorial` | `480ms` | Lookbook/Hero initial entrance reveal (once per load, never blocking input) |
| `--ease-editorial` | `cubic-bezier(0.22, 1, 0.36, 1)` | Decelerated quiet arrival for editorial drawers and panels |
| `--ease-ui` | `cubic-bezier(0.4, 0, 0.2, 1)` | Crisp, symmetrical easing for micro-interactions and controls |

### 6.2 Motion Implementation Rules

1. **Compositor-Safe Properties Only:** Animate `transform` and `opacity`. Never transition `width`, `height`, `top`, `left`, or `margin` (prevents layout thrashing and CLS).
2. **Interruptible & Reversible:** Drawers and filter panels must smoothly reverse mid-transition if toggled rapidly without locking pointer/keyboard input.
3. **Reduced-Motion Policy (`@media (prefers-reduced-motion: reduce)`):**
   - Collapse all CSS transition/animation durations (`--duration-fast` through `--duration-editorial`) to `0.01ms` or pure `opacity` crossfades (`<= 120ms` with zero translation/scale movement).
   - Disable smooth scroll behavior (`scroll-behavior: auto`).
   - Inside 3D experiences (`THREE_D_PIPELINE.md`), halt any turntable auto-rotation, ambient particle motion, and camera glide interpolation (snap immediately to preset camera views).

---

## 7. Page-Level Acceptance Matrix (Blueprint Section 6.5)

| Route / Page | Must Render & Work | Required Edge / Failure States | Core Integrity Rule |
|---|---|---|---|
| **Home** (`/`) | Campaign hero with dark scrim over photography, featured collections (`Essentials`, `Form`, `Atelier`, `Movement`), new arrivals grid, brand story / journal teaser | Campaign skeleton loading state; broken image graceful neutral placeholder without layout shift | Zero 3D JS downloaded unless an interactive 3D showcase block is explicitly engaged |
| **Shop & Search** (`/shop`, `/shop/[category]`, `/search`) | Responsive 1/2/3/4-column product grid, URL-synced facet filters (`category`, `collection`, `size`, `color`, `min/max price`, `availability`), sort (`newest`, `price_asc`, `price_desc`, `featured`), pagination | Loading skeleton grid; zero-results state with `"Reset Filter"` action; API error state with retry button | Only `PUBLISHED` active products appear; server-authoritative pagination and prices |
| **Product Detail** (`/products/[slug]`) | Immediate 2D gallery + `poster.webp`, title, IDR `tabular-nums` price, color/size variant selector, stock indicator, `"Panduan Ukuran"` modal, material/fit/care accordion, Add to Bag CTA, related items, optional 3D tab/toggle | Variant out-of-stock (`Habis`) indicator; WebGL unsupported / 3D asset failure falling back cleanly to 2D gallery with full checkout still possible | Selecting color+size deterministically resolves one active SKU; no silent variant mismatch |
| **Virtual Showroom** (`/showroom`, Phase 08) | Lazy-loaded 3D zone canvas, zone switcher controls, interactive product hotspots opening accessible quick-card with link to PDP | WebGL unsupported fallback showing curated zone photography + product list; asset pending/failed retry state; mobile touch navigation isolation | Zone assets load lazily per zone; does not trap vertical scroll or keyboard focus |
| **Outfit Studio** (`/outfit-studio`, Phase 08) | Fixed unisex mannequin rig, slot-based garment picker (`top`, `bottom`, `outerwear`, `footwear`, `accessory`), saved outfits panel, Add Compatible Items to Bag | Incompatible slot/rig error explanation; missing 3D garment asset notice; guest prompt explaining account requirement to persist saved outfits | Never claims body fitting or cloth simulation; saved outfits store IDs/config only (never authoritative prices) |
| **Cart** (`/cart` & Drawer) | Line items, variant summary, unit/line IDR totals, `44x44px` quantity steppers, remove button, subtotal summary, `"Lanjut ke Checkout"` CTA | Empty bag recovery state; server price/stock changed warning banner forcing customer review before checkout; update loading lock | Cart never guarantees stock reservation; server recalculates totals on every mutation |
| **Checkout** (`/checkout`) | Saved/guest shipping address form, shipping service selector, coupon code apply/remove, itemized order summary (`Subtotal`, `Diskon`, `Ongkir`, `Total`), payment initiation CTA | Quote expired refresh prompt; stock reservation conflict (`409`) recovery link to Cart; payment pending status screen; failed payment session retry | Server computes all totals & reserves stock atomically; browser redirect never marks order `PAID` |
| **Admin Orders** (`/admin/commerce/orders`) | Search by order number/email, status & payment filters, tabular list with WIB timestamps & IDR `tabular-nums`, order detail timeline (separate Order / Payment / Shipment / Return states), RBAC-gated transition actions | `403` Unauthorized gate; `409` concurrent state-transition conflict banner requiring refresh; empty filtered state | Every state transition uses validated command endpoints and writes immutable `audit_logs` |

---

## 8. Responsive Breakpoint & QA Viewport Matrix

ARVEN adopts **mobile-first progressive reflow**, not desktop-squeezed-into-mobile. Layouts explicitly address the **intermediate tablet/small-laptop band (`640px–1024px`)** so neither phone single-columns stretch awkwardly nor 4-column desktop grids crush card typography.

### 8.1 Breakpoint Architecture & Reflow Rules

| Breakpoint Band | CSS Min-Width | Target Context | Grid & Layout Reflow Rules |
|---|---|---|---|
| **Base (Compact Mobile)** | `0px` (`320px–639px`) | Small/standard smartphones (`320px`, `360px`, `375px`, `390px`, `414px`, `430px`) | 1-col Storefront editorial & checkout; 2-col compact Shop product grid (`>= 360px`) or 1-col at `320px` if card width `< 148px`; `16px` page gutter; `56px` compact sticky header with labeled `"Menu"`; filter drawer modal instead of permanent sidebar; `44x44px` min tap targets; horizontal scroll wrappers for Admin/Size Guide tables; `padding-bottom` clearance on mobile sticky checkout bars. |
| **`sm` (Large Mobile / Small Tablet)** | `640px` (`640px–767px`) | Landscape phones & compact tablets | 2-col Shop product grid (`gap: 16px`); 2-col Checkout form row pairs (`Kota` + `Kode Pos`); `20px` gutter; PDP stacks gallery above variant details cleanly. |
| **`md` (Tablet Portrait / Landscape Band)** | `768px` (`768px–1023px`) | Tablet portrait (`768px`) & landscape (`844px`) | **Explicit intermediate state:** 3-col Shop product grid (`minmax(0, 1fr)`) or 2-col with collapsible filter rail; PDP 2-col (`1fr 1fr`) gallery + purchase panel; Admin sidebar collapses to expandable icon/label rail or drawer so data tables maintain readable width; `24px` gutter. |
| **`lg` (Small Laptop / Tablet Landscape)** | `1024px` (`1024px–1279px`) | `1024px` landscape, 13" laptops | Full desktop Storefront top navigation bar; Shop persistent left filter sidebar (`260px`) + 3-col product grid; Checkout `7:5` split with sticky summary; Admin persistent `240px` sidebar + data workspace; `32px` gutter. |
| **`xl` (Standard Desktop)** | `1280px` (`1280px–1439px`) | `1280px`, `1366px` laptops | Shop left filter sidebar + 4-col product grid (`minmax(0, 1fr)`); PDP `7:5` media stage + sticky purchase column; `48px` gutter. |
| **`2xl` (Wide Desktop)** | `1440px+` (`1440px`, `1920px`) | Large studio displays | Content container capped at `1440px` centered on `#F8F7F3` / `#17191B` canvas so editorial line lengths and image grids never over-stretch across `1920px` monitors. |

### 8.2 13-Profile Playwright QA Verification Matrix

Phase 03, Phase 06, Phase 07, Phase 08, and Phase 09 browser QA checks MUST verify every implemented route across the 13 Harness viewport profiles with zero document-level horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`):

| # | Viewport Width (CSS px) | Orientation / Class | Primary Defect Check |
|---|---|---|---|
| 1 | `320px` | Narrow Mobile Portrait | Zero horizontal overflow, IDR prices (`Rp1.299.000`) & Indonesian labels wrap cleanly, no text clipping, `>= 44px` tap targets |
| 2 | `360px` | Standard Android Portrait | Filter drawer opens/closes without bleeding past viewport, Checkout inputs scroll above virtual keyboard |
| 3 | `375px` | Standard Compact Mobile | Product card grids and Variant Size buttons maintain `>= 8px` gap |
| 4 | `390px` | Modern Mobile Portrait | PDP 2D/3D toggle and sticky bottom CTA never cover last variant options |
| 5 | `414px` | Large Mobile Portrait | Cart Drawer width (`100vw`) and stepper controls operate cleanly with thumb |
| 6 | `430px` | Plus Mobile Portrait | Lookbook asymmetric imagery preserves aspect ratio without `100vh` mobile chrome clipping (`use dvh` or `auto`) |
| 7 | `768px` | Tablet Portrait | Intermediate 2-col/3-col grid activates cleanly (no stretched phone stack); Admin sidebar drawer collapses cleanly |
| 8 | `844px` | Landscape Mobile / Small Tablet | Sticky header height stays compact (`<= 56px`); horizontal table scroll works inside wrapper only |
| 9 | `1024px` | Tablet Landscape / Small Laptop | Persistent desktop nav fits without wrapping into 2 crowded lines; filter rail + 3-col grid fits cleanly |
| 10 | `1280px` | Standard Laptop | 4-col Shop grid + `260px` filter sidebar; Checkout sticky summary aligns inside viewport |
| 11 | `1366px` | Common Laptop | Admin Orders table displays primary decision columns without clipped action menus |
| 12 | `1440px` | Reference Studio Desktop | Max container width `1440px` aligns hero scrims, editorial grids, and 3D viewer stage cleanly |
| 13 | `1920px` | Full HD Wide Desktop | Centered `1440px` layout frame prevents stretched `> 65ch` prose or distorted hero crops |

**Zoom & Accessibility Check:** Additionally verify core storefront flows (`Home`, `Shop`, `PDP`, `Cart`, `Checkout`) and `Admin Orders` at **`200%` browser zoom** on desktop (`1280px` effective `640px`) and narrow mobile reflow (`320px`) with keyboard-only navigation (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`).
