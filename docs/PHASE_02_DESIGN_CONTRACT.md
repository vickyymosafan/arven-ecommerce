# ARVEN: Phase 02 Design System & Experience Contract

> **Plan ID:** `34ede88d-3a68-4410-8a37-9d1fd18ee2f3`  
> **Task ID:** `8a46f0ef-6a44-42df-90b5-3434a85c1184` (`design-lead`)  
> **Status:** Canonical Phase 02 UI Specification (**Implementation Held Behind Mandatory Antislop Timing User Confirmation Gate**)  
> **Sources of Truth:** [`DESIGN.md`](../DESIGN.md), [`docs/PHASE_02_DISCOVERY.md`](./PHASE_02_DISCOVERY.md), [`docs/API_CONTRACTS.md`](./API_CONTRACTS.md), [`docs/SECURITY_POLICY.md`](./SECURITY_POLICY.md), [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md), [`docs/adr/ADR-002-session-proxy-and-same-site-auth.md`](./adr/ADR-002-session-proxy-and-same-site-auth.md)

---

## 1. Mandatory Pre-Implementation Gates & Design Read

### 1.1 Antislop Timing User Confirmation Gate (Hard Blocker)

Per `antislop` core skill rules and [`docs/PHASE_02_DISCOVERY.md`](./PHASE_02_DISCOVERY.md) Section 3:

1. **Implementation Hold:** Authoring any `.tsx`, `.css`, or UI implementation files under `packages/ui`, `apps/storefront`, or `apps/admin` MUST NOT start until the user answers the mandatory `antislop` timing prompt in the user's chat language:
   - **1. DURING:** Apply `antislop`, `antislop-ui`, `antislop-human`, `antislop-layoutmobile`, and `antislop-copywriting` rules continuously while generating code, finishing with the Delivery Gate.
   - **2. AFTER:** Generate UI implementation first, then run a numbered `anti-slop/audit-001-YYYY-MM-DD.md` findings report and apply only user-approved numbered fixes.
2. **Visual Asset Confirmation Boundary (`R-23`):** Phase 02 renders the `ARVEN` typographic wordmark set in `Cormorant Garamond` and neutral initial-based account identifiers. Do NOT invent SVG logo marks, brand emblems, user avatars, testimonials, or statistical claims without explicit user confirmation.
3. **Phase 02 Scope Lock:** Only `packages/ui` base primitives, `apps/storefront` Phase 02 entry/auth/account shell routes (`/`, `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account`), and `apps/admin` Phase 02 auth/MFA/dashboard shell routes (`/login`, `/mfa`, `/dashboard`, plus `/` redirect) may be built in Phase 02. Catalog, cart, checkout, full admin CRUD tables, and 3D canvases remain strictly out of scope until Phases 03 through 08.

### 1.2 Phase 02 Design Read & Dials (`R-37` & `R-31`)

- **Storefront Editorial & Auth Shell (`apps/storefront`):**
  - *Reading this as: contemporary unisex luxury fashion storefront entry and customer identity experience for Indonesian and international shoppers, in a quiet gallery editorial style on Ivory (`#F8F7F3`) and Cream (`#E9E4DA`) anchored by Charcoal (`#17191B`), dial `ENERGY 2 / RHYTHM 3 / MOTION 2`.*
- **Admin Operations Auth & Console Shell (`apps/admin`):**
  - *Reading this as: high-legibility operational security and RBAC session console for ARVEN internal staff, in a restrained dark workspace style on Charcoal (`#17191B`) and Graphite (`#35383A`), dial `ENERGY 1 / RHYTHM 1 / MOTION 1`.*

#### Purpose & Decision Rationale (`R-31`)

| Decision Area | Phase 02 Choice | One-Line Purpose Reason (`R-31`) |
|---|---|---|
| **Palette & Surfaces** | Light Ivory `#F8F7F3` / Cream `#E9E4DA` (Storefront); Dark Charcoal `#17191B` / Graphite `#35383A` (Admin) | Separates tactile editorial commerce from focused operational security while matching `DESIGN.md` brand tokens. |
| **Single Deliberate Accent** | Accent Blue (`#1F4E79` light / `#82B0DC` dark) | Concentrates link, active state, and keyboard focus attention in one verified non-pink hue. |
| **Typography** | `Cormorant Garamond` (display) + `Plus Jakarta Sans` (UI/body) + `IBM Plex Mono` (IDs/codes) | Pairs fashion editorial voice with Indonesian diacritic legibility and tabular numeric alignment. |
| **Border Radius (`R-11`)** | `0px` frames/tables, `2px` inputs/chips, `4px` buttons/admin panels, `8px` dialogs | Establishes architectural garment-atelier geometry instead of uniform pill-shaped templates. |
| **Elevation (`R-12`)** | Flat tonal steps + `1px` hairline rules; shadow reserved for drawers/dialogs | Keeps form and operational surfaces grounded without floating-card noise. |
| **Icons (`R-04`)** | Minimal stroke icons strictly for concrete UI controls (eye toggle, close, status glyph, menu) | Avoids decorative icon clutter while pairing non-text status cues with readable labels. |
| **Motion (`R-19`)** | `120ms`–`320ms` compositor-only `transform`/`opacity` state transitions; zero ambient loops | Confirms interactive state changes smoothly while honoring `ENERGY 2` / `ENERGY 1` and reduced-motion preferences. |
| **Layout Composition (`R-05`)** | Asymmetric editorial auth/landing split on Storefront; compact decision-first security console on Admin | Matches content density and real Phase 02 capabilities without filler bento grids or fabricated KPI cards. |

---

## 2. CSS Custom Property Token Architecture (`packages/ui`)

### 2.1 Package Structure & Tailwind CSS v4 Binding

`packages/ui` exports a framework-pure CSS token stylesheet consumed by both `apps/storefront/src/app/globals.css` and `apps/admin/src/app/globals.css`:

- `packages/ui/src/styles/tokens.css`: Layer 1 Primitive tokens, Layer 2 Semantic tokens (`:root, [data-theme="light"]` and `[data-theme="dark"]`), Layer 3 Component tokens, motion tokens, and `@media (prefers-reduced-motion: reduce)` overrides.
- `packages/ui/src/styles/theme.css`: Tailwind CSS v4 integration (`@import "tailwindcss";`, `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`, and `@theme inline { ... }` mapping Tailwind utility classes directly to `--arven-*` and `--font-*` CSS variables).

### 2.2 Exact CSS Custom Property Definitions (`tokens.css`)

```css
/* packages/ui/src/styles/tokens.css */

/* ==========================================================================
   LAYER 1: PRIMITIVE TOKENS (Never referenced directly in JSX/TSX components)
   ========================================================================== */
:root {
  /* Color Primitives */
  --color-ivory-50: #F8F7F3;
  --color-ivory-100: #F1EFE9;
  --color-cream-200: #E9E4DA;
  --color-cream-300: #DDD7CB;
  --color-white: #FFFFFF;

  --color-stone-200: #D8D3C8;   /* Non-interactive light hairline divider ONLY */
  --color-stone-300: #B2B0A6;   /* Accessible muted text on dark surfaces */
  --color-stone-400: #9E9C92;   /* Accessible interactive border on dark surfaces */
  --color-stone-500: #8B897F;   /* BANNED for normal text on any light surface */
  --color-stone-600: #747269;   /* Accessible control border on Cream/Ivory/White */
  --color-stone-700: #5E5C54;   /* Accessible muted text on ALL light surfaces */

  --color-graphite-700: #35383A;
  --color-charcoal-800: #222528;
  --color-charcoal-900: #17191B;
  --color-charcoal-border-hairline: #46494C; /* Non-interactive dark hairline divider ONLY */

  --color-blue-100: #E6EEF5;
  --color-blue-300: #82B0DC;
  --color-blue-600: #1F4E79;
  --color-blue-900: #1E2C3A;

  --color-sage-100: #E8F0EC;
  --color-sage-300: #89BBA6;
  --color-sage-600: #416B59;
  --color-sage-900: #1E2E28;

  --color-ochre-100: #F3ECE0;
  --color-ochre-300: #E2AE55;
  --color-ochre-700: #875B12;
  --color-ochre-900: #30281B;

  --color-terracotta-100: #F5EAE8;
  --color-terracotta-300: #E48966;
  --color-terracotta-700: #9C3D3D;
  --color-terracotta-900: #35231E;

  --color-scrim-dark-72: rgba(23, 25, 27, 0.72);

  /* Spacing Scale (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;

  /* Container & Grid */
  --container-max: 1440px;
  --container-prose: 65ch;
  --gutter-mobile: 16px;
  --gutter-tablet: 24px;
  --gutter-desktop: 48px;

  /* Border Radii (Architectural Geometry) */
  --radius-none: 0px;
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-full: 9999px; /* Color swatch dots ONLY */

  /* Elevation & Z-Index */
  --shadow-none: none;
  --shadow-raised: 0 4px 16px rgba(23, 25, 27, 0.08);
  --shadow-overlay: 0 12px 36px rgba(23, 25, 27, 0.18);

  --z-base: 0;
  --z-sticky: 20;
  --z-header: 30;
  --z-drawer: 40;
  --z-modal: 50;
  --z-toast: 60;

  /* Motion Primitives */
  --duration-instant: 0ms;
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-moderate: 320ms;
  --duration-editorial: 480ms;

  --ease-editorial: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-ui: cubic-bezier(0.4, 0, 0.2, 1);
}

/* ==========================================================================
   LAYER 2: SEMANTIC TOKENS
   Light Editorial Storefront (Default & [data-theme="light"])
   ========================================================================== */
:root,
[data-theme="light"] {
  color-scheme: light;

  --arven-surface-canvas: var(--color-ivory-50);       /* #F8F7F3 */
  --arven-surface-subtle: var(--color-ivory-100);      /* #F1EFE9 */
  --arven-surface-panel: var(--color-cream-200);       /* #E9E4DA */
  --arven-surface-panel-hover: var(--color-cream-300); /* #DDD7CB */
  --arven-surface-elevated: var(--color-white);        /* #FFFFFF */
  --arven-surface-inverse: var(--color-charcoal-900);  /* #17191B */

  --arven-text-primary: var(--color-charcoal-900);     /* #17191B */
  --arven-text-secondary: var(--color-graphite-700);   /* #35383A */
  --arven-text-muted: var(--color-stone-700);          /* #5E5C54 */
  --arven-text-inverse: var(--color-ivory-50);         /* #F8F7F3 */

  --arven-border-hairline: var(--color-stone-200);     /* #D8D3C8 (non-interactive only) */
  --arven-border-control: var(--color-stone-600);      /* #747269 */
  --arven-border-strong: var(--color-charcoal-900);    /* #17191B */

  --arven-accent-primary: var(--color-charcoal-900);   /* #17191B */
  --arven-accent-primary-hover: var(--color-graphite-700); /* #35383A */
  --arven-accent-link: var(--color-blue-600);          /* #1F4E79 */
  --arven-focus-ring: var(--color-blue-600);           /* #1F4E79 */

  --arven-status-info-fg: var(--color-blue-600);       /* #1F4E79 */
  --arven-status-info-bg: var(--color-blue-100);       /* #E6EEF5 */
  --arven-status-success-fg: var(--color-sage-600);    /* #416B59 */
  --arven-status-success-bg: var(--color-sage-100);    /* #E8F0EC */
  --arven-status-warning-fg: var(--color-ochre-700);   /* #875B12 */
  --arven-status-warning-bg: var(--color-ochre-100);   /* #F3ECE0 */
  --arven-status-danger-fg: var(--color-terracotta-700); /* #9C3D3D */
  --arven-status-danger-bg: var(--color-terracotta-100); /* #F5EAE8 */
}

/* ==========================================================================
   Dark Showcase & Admin Operations Console ([data-theme="dark"])
   Independently calibrated; never synthesized via CSS invert() filters.
   ========================================================================== */
[data-theme="dark"] {
  color-scheme: dark;

  --arven-surface-canvas: var(--color-charcoal-900);   /* #17191B */
  --arven-surface-subtle: var(--color-charcoal-800);   /* #222528 */
  --arven-surface-panel: var(--color-graphite-700);    /* #35383A */
  --arven-surface-panel-hover: var(--color-charcoal-800); /* #222528 + strong border */
  --arven-surface-elevated: var(--color-graphite-700); /* #35383A */
  --arven-surface-inverse: var(--color-ivory-50);      /* #F8F7F3 */

  --arven-text-primary: var(--color-ivory-50);         /* #F8F7F3 */
  --arven-text-secondary: var(--color-cream-200);      /* #E9E4DA */
  --arven-text-muted: var(--color-stone-300);          /* #B2B0A6 */
  --arven-text-inverse: var(--color-charcoal-900);     /* #17191B */

  --arven-border-hairline: var(--color-charcoal-border-hairline); /* #46494C */
  --arven-border-control: var(--color-stone-400);      /* #9E9C92 */
  --arven-border-strong: var(--color-ivory-50);        /* #F8F7F3 */

  --arven-accent-primary: var(--color-ivory-50);       /* #F8F7F3 */
  --arven-accent-primary-hover: var(--color-cream-200); /* #E9E4DA */
  --arven-accent-link: var(--color-blue-300);          /* #82B0DC */
  --arven-focus-ring: var(--color-blue-300);           /* #82B0DC */

  --arven-status-info-fg: var(--color-blue-300);       /* #82B0DC */
  --arven-status-info-bg: var(--color-blue-900);       /* #1E2C3A */
  --arven-status-success-fg: var(--color-sage-300);    /* #89BBA6 */
  --arven-status-success-bg: var(--color-sage-900);    /* #1E2E28 */
  --arven-status-warning-fg: var(--color-ochre-300);   /* #E2AE55 */
  --arven-status-warning-bg: var(--color-ochre-900);   /* #30281B */
  --arven-status-danger-fg: var(--color-terracotta-300); /* #E48966 */
  --arven-status-danger-bg: var(--color-terracotta-900); /* #35231E */
}

/* ==========================================================================
   LAYER 3: COMPONENT TOKENS (Bound strictly to Semantic Tokens)
   ========================================================================== */
:root,
[data-theme="light"],
[data-theme="dark"] {
  --btn-primary-bg: var(--arven-accent-primary);
  --btn-primary-fg: var(--arven-text-inverse);
  --btn-primary-hover-bg: var(--arven-accent-primary-hover);
  --btn-secondary-bg: var(--arven-surface-panel);
  --btn-secondary-fg: var(--arven-text-primary);
  --btn-secondary-border: var(--arven-border-control);
  --btn-secondary-hover-bg: var(--arven-surface-panel-hover);
  --btn-accent-bg: var(--color-blue-600);
  --btn-accent-fg: var(--color-white);
  --btn-danger-bg: var(--color-terracotta-700);
  --btn-danger-fg: var(--color-white);

  --input-bg: var(--arven-surface-elevated);
  --input-fg: var(--arven-text-primary);
  --input-placeholder: var(--arven-text-muted);
  --input-border: var(--arven-border-control);
  --input-border-focus: var(--arven-focus-ring);
  --input-border-error: var(--arven-status-danger-fg);

  --card-media-bg: var(--arven-surface-subtle);
  --card-title-fg: var(--arven-text-primary);
  --card-meta-fg: var(--arven-text-muted);
  --card-border-hover: var(--arven-border-strong);

  --table-header-bg: var(--arven-surface-panel);
  --table-row-bg: var(--arven-surface-canvas);
  --table-row-hover-bg: var(--arven-surface-subtle);
  --table-border: var(--arven-border-hairline);

  --stage3d-bg: var(--color-charcoal-900);
  --stage3d-surface: var(--color-graphite-700);
  --stage3d-fg: var(--color-ivory-50);
  --stage3d-muted: var(--color-stone-300);
}

[data-theme="dark"] {
  --btn-accent-bg: var(--color-blue-300);
  --btn-accent-fg: var(--color-charcoal-900);
  --btn-danger-bg: var(--color-terracotta-300);
  --btn-danger-fg: var(--color-charcoal-900);
}

/* ==========================================================================
   ACCESSIBILITY & REDUCED MOTION POLICY
   ========================================================================== */
:focus-visible {
  outline: 2px solid var(--arven-focus-ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0.01ms;
    --duration-base: 0.01ms;
    --duration-moderate: 0.01ms;
    --duration-editorial: 0.01ms;
  }

  html {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 2.3 Tailwind CSS v4 `@theme inline` Bridge (`theme.css`)

Verified against Tailwind CSS v4 `@theme inline` specification so dynamic theme overrides on `[data-theme="dark"]` propagate through Tailwind utilities without static variable baking:

```css
/* packages/ui/src/styles/theme.css */
@import "tailwindcss";
@import "./tokens.css";

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@theme inline {
  --font-display: var(--font-display), Georgia, "Times New Roman", serif;
  --font-sans: var(--font-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace;

  --color-canvas: var(--arven-surface-canvas);
  --color-subtle: var(--arven-surface-subtle);
  --color-panel: var(--arven-surface-panel);
  --color-panel-hover: var(--arven-surface-panel-hover);
  --color-elevated: var(--arven-surface-elevated);
  --color-inverse: var(--arven-surface-inverse);

  --color-ink: var(--arven-text-primary);
  --color-ink-secondary: var(--arven-text-secondary);
  --color-ink-muted: var(--arven-text-muted);
  --color-ink-inverse: var(--arven-text-inverse);

  --color-hairline: var(--arven-border-hairline);
  --color-control-border: var(--arven-border-control);
  --color-strong-border: var(--arven-border-strong);

  --color-accent: var(--arven-accent-primary);
  --color-link: var(--arven-accent-link);
  --color-focus: var(--arven-focus-ring);

  --color-info-fg: var(--arven-status-info-fg);
  --color-info-bg: var(--arven-status-info-bg);
  --color-success-fg: var(--arven-status-success-fg);
  --color-success-bg: var(--arven-status-success-bg);
  --color-warning-fg: var(--arven-status-warning-fg);
  --color-warning-bg: var(--arven-status-warning-bg);
  --color-danger-fg: var(--arven-status-danger-fg);
  --color-danger-bg: var(--arven-status-danger-bg);
}
```

### 2.4 WCAG 2.2 AA Contrast & Copy Guardrails (Verified Ratios)

All contrast checks below are verified via `antislop-contrast:check_contrast`:

1. **Muted Text on Light (`#5E5C54` Deep Stone):** `6.25:1` on `#F8F7F3` (Ivory), `5.29:1` on `#E9E4DA` (Cream), `5.83:1` on `#F1EFE9` (Ivory-100), `6.70:1` on `#FFFFFF` (White). All PASS WCAG AA `>= 4.5:1`.
2. **Muted Text on Dark (`#B2B0A6` Stone-300):** `8.10:1` on `#17191B` (Charcoal), `7.08:1` on `#222528` (Charcoal-800), `5.43:1` on `#35383A` (Graphite). All PASS WCAG AA `>= 4.5:1`.
3. **Interactive Control Borders (`>= 3.0:1` WCAG 1.4.11):**
   - Light surfaces use `#747269` (`--color-stone-600`): `3.81:1` on `#E9E4DA` (Cream), `4.50:1` on `#F8F7F3` (Ivory), `4.82:1` on `#FFFFFF` (White).
   - Dark surfaces use `#9E9C92` (`--color-stone-400`): `4.29:1` on `#35383A` (Graphite), `6.40:1` on `#17191B` (Charcoal).
4. **Decorative Hairline Dividers Only (`< 3.0:1` non-control):** `#D8D3C8` on `#F8F7F3` (`1.39:1`) and `#46494C` on `#17191B` (`1.95:1`) are restricted strictly to non-interactive visual hairlines (`<hr>`, table row dividers) and MUST NEVER serve as input, checkbox, or button borders.
5. **Hard Banned Color & Copy Patterns:**
   - **Zero `#8B897F` normal text on light surfaces:** `#8B897F` yields `3.27:1` on `#F8F7F3` (FAIL), `2.77:1` on `#E9E4DA` (FAIL), and `3.51:1` on `#FFFFFF` (FAIL). Never assign `--color-stone-500` to body copy, form labels, placeholders, timestamps, or captions on light themes.
   - **Zero Pink Anywhere:** Pink, rose, magenta, and pastel-coral are strictly banned across CSS tokens, focus outlines, error text, badges, and illustrations.
   - **Zero Em Dashes (`U+2014`) in UI Copy (`R-02`):** Use commas, colons, periods, or parentheses across all labels, headings, validation alerts, empty states, and helper text.
   - **Admin Theme Governance (`R-21` & `R-34`):** `apps/admin` renders with `<html data-theme="dark">` by default for high-legibility operations. In Phase 02, omit a light/dark toggle unless both `[data-theme="dark"]` and `[data-theme="light"]` are explicitly implemented and verified across all Admin QA checks. Every `packages/ui` primitive MUST resolve cleanly under both `[data-theme="light"]` and `[data-theme="dark"]`.

---

## 3. Typography, Formatting Helpers & Interactive State Grammar

### 3.1 Font Loading (`next/font/google` in Root Layouts)

Both `apps/storefront/src/app/layout.tsx` and `apps/admin/src/app/layout.tsx` load all three typefaces once via `next/font/google` (Next.js 16 self-hosts `.woff2` files at build time with zero external runtime `<link>` requests and automatic `adjustFontFallback` enabled for CLS `<= 0.05`):

```typescript
import { Cormorant_Garamond, IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google';

export const fontDisplay = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
});

export const fontSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal'],
  display: 'swap',
  variable: '--font-sans',
});

export const fontMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal'],
  display: 'swap',
  variable: '--font-mono',
});
```

Attach `${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}` to `<html>` and set `body` font-family to `var(--font-sans)`.

### 3.2 Modular Fluid Type Scale & Localization Expansion Rules

All line-heights are unitless so `200%` browser zoom (`WCAG 1.4.4`) and Bahasa Indonesia text (`15%` to `25%` longer than English) wrap cleanly without overlapping or clipping:

| Scale Role | Font Variable | Size (`clamp` / `rem`) | Line-Height | Weight | Tracking | Phase 02 Usage |
|---|---|---|---|---|---|---|
| `display-xl` | `--font-display` | `clamp(2.5rem, 4.5vw + 1rem, 4.75rem)` | `1.06` | `500` | `-0.02em` | Storefront `/` hero headline |
| `display-lg` | `--font-display` | `clamp(2rem, 3vw + 0.85rem, 3.25rem)` | `1.10` | `500` | `-0.015em` | Storefront editorial statement |
| `h1` | `--font-display` | `clamp(1.75rem, 2vw + 0.75rem, 2.5rem)` | `1.15` | `500` | `-0.01em` | Auth page titles (`/login`, `/register`), Account H1 |
| `h2` | `--font-sans` | `clamp(1.25rem, 1vw + 0.85rem, 1.625rem)` | `1.25` | `600` | `-0.01em` | Admin page titles (`/dashboard`, `/mfa`), section headings |
| `h3` | `--font-sans` | `1.125rem` (`18px`) | `1.30` | `600` | `0` | Form group headings, security cards |
| `body` | `--font-sans` | `1rem` (`16px`) | `1.60` | `400` | `0` | Prose (`max-width: 65ch`), form inputs (prevents iOS auto-zoom) |
| `ui` | `--font-sans` | `0.875rem` (`14px`) | `1.45` | `400`/`500` | `0` | Navigation links, buttons, table cells, session rows |
| `caption` | `--font-sans` | `0.75rem` (`12px`) | `1.40` | `500` | `0.02em` | Form helper hints, timestamps, status chips (`12px` floor) |
| `micro-label` | `--font-sans` | `0.75rem` (`12px`) | `1.30` | `600` | `0.06em` | Controlled uppercase section labels (max `0.06em` tracking) |
| `mono-code` | `--font-mono` | `0.8125rem` (`13px`) | `1.40` | `400` | `0` | Request IDs, TOTP setup keys, recovery codes, permission codes |

**Bahasa Indonesia Wrapping Rule:** Never place fixed pixel `width` or `white-space: nowrap; overflow: hidden` on buttons, tabs, badges, or table headers. Buttons maintain `min-height: 44px` and pad vertically (`py-2.5 px-5`) so wrapped multi-line Indonesian labels stay crisp.

### 3.3 Deterministic `formatIDR()` and `formatWIB()` Helpers (`packages/ui`)

Both helpers live in `packages/ui/src/lib/format.ts` and enforce identical server SSR and browser CSR output to prevent React 19 hydration mismatches:

```typescript
// packages/ui/src/lib/format.ts

const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Formats integer Rupiah without floats and normalizes ICU non-breaking space
 * after "Rp" so SSR (Node.js) and CSR (browsers) produce identical markup (e.g., "Rp299.000").
 * Always pair in JSX with `tabular-nums`.
 */
export function formatIDR(amountIdr: number | bigint): string {
  const numeric = typeof amountIdr === 'bigint' ? Number(amountIdr) : amountIdr;
  if (!Number.isFinite(numeric)) {
    throw new RangeError(`Invalid IDR amount: ${String(amountIdr)}`);
  }
  return idrFormatter.format(Math.trunc(numeric)).replace(/Rp[\s\u00A0\u202F]+/g, 'Rp');
}

const wibDateTimeId = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const wibDateTimeEn = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Converts UTC ISO string or Date (from TIMESTAMPTZ(3)) into deterministic Asia/Jakarta WIB string
 * (e.g., "14 Nov 2026, 21.30 WIB"). Always pair with `tabular-nums`.
 */
export function formatWIB(input: string | Date, locale: 'id' | 'en' = 'id'): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const formatter = locale === 'en' ? wibDateTimeEn : wibDateTimeId;
  return `${formatter.format(date)} WIB`;
}
```

### 3.4 Mandatory 8-State Interactive Grammar

Every interactive primitive and data view in `packages/ui`, `apps/storefront`, and `apps/admin` MUST implement explicit behavior and non-color-only visual cues across all 8 required states (plus `success` confirmation on mutations):

| State | Visual & CSS Contract | Keyboard / ARIA / Behavior Contract |
|---|---|---|
| **1. `default`** | Uses semantic surface/border tokens (`--btn-*`, `--input-*`); `1px` control border (`>= 3.0:1` contrast) | Logical DOM tab order; `min-height: 44px` and `min-width: 44px` tap target; `>= 8px` gap between adjacent targets |
| **2. `hover`** | Background shifts to hover token (`--btn-primary-hover-bg`, `--btn-secondary-hover-bg`, `--table-row-hover-bg`) or border upgrades to `--arven-border-strong` (`120ms --ease-ui`) | Never hides essential information behind hover-only triggers; touch devices receive matching `:active` tap feedback |
| **3. `active`** | Subtle press feedback (`scale(0.99)` on buttons or stronger tonal surface) during pointer/keyboard press | Current route links carry `aria-current="page"`, bold `600` weight, and hairline bottom/left indicator |
| **4. `focus-visible`** | `2px solid var(--arven-focus-ring)` outline with `outline-offset: 2px` (`#1F4E79` light / `#82B0DC` dark) | Never stripped with `outline: none` without replacement; form controls carry `scroll-margin-bottom: 120px` above mobile keyboards |
| **5. `disabled`** | Explicit text/icon cue plus reduced tonal fill or hairline border (`cursor: not-allowed`); never relies on low opacity that breaks legibility | Native `disabled` on form submit buttons during invalid/blocked preconditions, or `aria-disabled="true"` with tooltip/helper reason when focusable explanation is needed |
| **6. `loading`** | Labeled status text (`"Memproses masuk..."`, `"Memuat sesi aktif..."`) plus calm indicator or column-matched tonal skeleton (no neon shimmer) | Sets `aria-busy="true"`, prevents duplicate submits on forms/buttons, preserves container height to avoid CLS |
| **7. `empty`** | Distinguishes first-run empty vs filtered empty; names cause and single next action (e.g., `"Belum ada alamat tersimpan. Tambah alamat pengiriman untuk checkout lebih cepat."`) | Uses semantic heading + action button/link; never shows a hollow `"No data"` stub or fake rows |
| **8. `error`** | Paired `--arven-status-danger-fg` + `--arven-status-danger-bg` + alert glyph + specific human recovery copy + `meta.requestId` on system failures | Form field errors bind via `aria-invalid="true"` and `aria-describedby`; page/form alerts use `role="alert"`; API errors offer `"Coba Lagi"` retry |
| **`success` (mutation)** | Paired `--arven-status-success-fg` + `--arven-status-success-bg` + check glyph + outcome text | Announced politely via `role="status"` / `aria-live="polite"` without trapping focus |

---

## 4. Exact Phase 02 Primitive & Screen Inventory

### 4.1 `packages/ui` Base Primitives Inventory

`packages/ui` contains zero API fetching, zero Next.js server-only imports (client primitives marked `'use client'` cleanly), and zero Prisma/database imports (`docs/ARCHITECTURE.md` Section 2.1):

| Export | File | Purpose & Required Contract |
|---|---|---|
| `tokens.css` / `theme.css` | `src/styles/` | Layer 1-3 CSS custom properties + Tailwind v4 `@theme inline` bridge |
| `formatIDR`, `formatWIB`, `cn` | `src/lib/format.ts`, `src/lib/cn.ts` | Deterministic IDR & Asia/Jakarta `WIB` formatters + class merge |
| `SkipLink` | `src/components/skip-link.tsx` | Visually hidden until `:focus-visible`, jumps to `#main-content` |
| `Button` / `LinkButton` | `src/components/button.tsx` | Variants: `primary`, `secondary`, `accent`, `danger`, `ghost`; `44x44px` min size, `isLoading` + `loadingLabel`, wraps Indonesian copy cleanly |
| `FormField` / `Input` / `PasswordInput` | `src/components/form-field.tsx`, `input.tsx` | `16px` mobile input text, `>= 44px` height, `#747269`/`#9E9C92` borders, error `aria-describedby` + `role="alert"`, `PasswordInput` eye toggle (`>= 44x44px`, `aria-pressed`) |
| `Checkbox` / `Select` | `src/components/checkbox.tsx`, `select.tsx` | `44x44px` touch wrapper around checkbox control; accessible native `<select>` styled with semantic tokens |
| `AlertBanner` | `src/components/alert-banner.tsx` | `info`, `success`, `warning`, `error`; always renders glyph + text + optional retry action + optional `requestId` mono tag |
| `StatusChip` | `src/components/status-chip.tsx` | Functional status chip (`2px` radius, semantic fg/bg); zero decorative capsule pills (`R-09`) |
| `Surface` / `Card` / `Divider` | `src/components/surface.tsx` | Flat architectural surface panels (`canvas`, `subtle`, `panel`, `elevated`, `inverse`) + `1px` hairline divider |
| `Dialog` / `Drawer` | `src/components/dialog.tsx`, `drawer.tsx` | Native `<dialog>` or ARIA modal focus trap, `Escape` close, backdrop close, restores focus to trigger on close, `shadow-overlay` |
| `EmptyState` / `LoadingState` / `ErrorState` | `src/components/async-states.tsx` | Dedicated state primitives enforcing `R-27` cause + next action semantics |
| `DataTableShell` | `src/components/data-table.tsx` | `overflow-x-auto` wrapper with sticky first column option and tabular cell alignment for Admin & Account session tables |
| `LocalQrSvg` | `src/components/local-qr-svg.tsx` | Renders deterministic 2D QR SVG purely in-browser from `otpauth://` URI (never contacts external QR image services) |

### 4.2 Same-Origin BFF Client & CSRF Protocol (`apps/storefront` & `apps/admin`)

Browser requests from both Next.js apps MUST use a shared BFF client helper (`src/lib/api-client.ts`):

1. **Base Path:** All browser calls target same-origin `/api/v1/...` with `credentials: 'include'`. Never hardcode `http://localhost:4000` in client bundles.
2. **CSRF Synchronization:** Before executing any state-changing method (`POST`, `PATCH`, `PUT`, `DELETE`), acquire a fresh or session-bound token from `GET /api/v1/csrf-token` and send `X-CSRF-Token: <token>` alongside `Content-Type: application/json`. Refresh CSRF token automatically on session establishment (login / MFA verify) and retry once cleanly if `403 CSRF_INVALID` occurs due to session rotation.
3. **Envelope & Error Handling:** Parse `{ success, data, error, meta }` from `docs/API_CONTRACTS.md` Section 2. Map Zod field issues (`error.details[]`) directly onto matching form inputs; render unexpected `500`/`503` errors via `AlertBanner` showing `meta.requestId` without exposing SQL or stack details.
4. **Rate-Limit Handling (`429 RATE_LIMITED`):** Disable duplicate submit and surface retry guidance cleanly (`"Terlalu banyak percobaan. Coba lagi dalam beberapa saat."`).

### 4.3 `apps/storefront` Phase 02 Screen Inventory

**Storefront Navigation Hygiene (`R-24`, `R-26`):**
In Phase 02, `apps/storefront` renders ONLY destinations that exist in Phase 02 (`/` Beranda, `/login` Masuk or `/account` Akun Saya). Future-phase routes (`/shop`, `/collections`, `/lookbook`, `/journal`, `/showroom`, `/outfit-studio`, `/cart`) MUST NOT appear as clickable links in the Phase 02 navbar or footer until their respective phases deliver those pages.

- **Header (`56px` mobile, `72px` desktop):** Left `ARVEN` wordmark (`Cormorant Garamond`, links to `/`); right single-row links on `>= 768px` (`Beranda`, `Masuk` / `Daftar` when guest OR `Akun Saya` + `Keluar` when signed in); on `< 768px`, compact bar with labeled `"Menu"` button (`44x44px`) opening slide-over `Drawer`, centered `ARVEN` wordmark, and quick link to `Masuk` or `Akun`.

| Route | Auth Posture | API Integration | Required UI Blocks & All-State Behavior |
|---|---|---|---|
| **`/`** | Public (`cacheComponents` static shell + `<Suspense>` auth status slot) | `GET /api/v1/auth/me` (silent check inside `<Suspense>` nav/CTA slot; `401` handled cleanly as guest) | Asymmetric Luxury Editorial Entry (`ENERGY 2 / RHYTHM 3`): `ARVEN` typographic campaign headline (`"Beyond Trends. Beyond Time."`), concise brand statement, and primary outcome CTAs (`"Masuk ke Akun"` / `"Buat Akun"` for guests; `"Buka Profil & Alamat"` -> `/account` when authenticated). Honest footer notice stating Phase 02 Identity & Account Foundation scope, zero fake statistics/testimonials/bento grids. |
| **`/login`** | Public guest entry (redirects to `/account` only if live `/auth/me` confirms active `CUSTOMER` session) | `GET /api/v1/csrf-token`, `POST /api/v1/auth/login` | Email + `PasswordInput` form (`scroll-margin-bottom: 120px`), `"Lupa kata sandi?"` -> `/forgot-password`, `"Belum punya akun? Daftar"` -> `/register`. Handles `loading` (`"Memeriksa akun..."`), `401 INVALID_CREDENTIALS` generic error banner, `429 RATE_LIMITED` banner, and open-redirect-safe `?next=` navigation (`/` or `/account*` only). |
| **`/register`** | Public | `GET /api/v1/csrf-token`, `POST /api/v1/auth/register` | `fullName`, `email`, `phone` (optional Indonesian format helper `+62...` / `08...`), `password` (`12..128` chars, preserves spaces, inline rule hint), `confirmPassword`, plus **separate opt-in checkbox** for promotional updates (`SECURITY_POLICY.md` Section 6.1). `409` duplicate email banner, `400` field-level Zod issues, `success` view instructing email verification with link to `/login`. |
| **`/verify-email`** | Public (`<Suspense>` wrapper reading `searchParams.token`) | `GET /api/v1/csrf-token`, `POST /api/v1/auth/verify-email` | Auto-submits token when `?token=` is present inside `<Suspense>` (plus manual token input fallback if opened directly without query). Shows `loading` (`"Memverifikasi email Anda..."`), `success` (`"Email berhasil diverifikasi"` + CTA `"Masuk ke Akun"`), and `error` (invalid/expired token + link to `/login`). |
| **`/forgot-password`** | Public | `GET /api/v1/csrf-token`, `POST /api/v1/auth/forgot-password` | Email form submitting reset request. Always transitions to uniform anti-enumeration `success` state (`"Jika email tersebut terdaftar, kami telah mengirimkan tautan pengaturan ulang kata sandi."`) per `SECURITY_POLICY.md` Section 3.1.5, plus `"Kirim Ulang"` / `"Kembali ke Halaman Masuk"`. |
| **`/reset-password`** | Public (`<Suspense>` wrapper reading `searchParams.token`) | `GET /api/v1/csrf-token`, `POST /api/v1/auth/reset-password` | New password (`12..128` chars) + confirm password form bound to URL token (or explicit missing-token error state linking to `/forgot-password`). On `success`, confirms all prior sessions have been revoked and renders CTA `"Masuk dengan Kata Sandi Baru"` -> `/login`. |
| **`/account`** | Protected (`CUSTOMER` session required; `Cache-Control: no-store`) | `GET /api/v1/auth/me`, `GET/PATCH /api/v1/users/me`, `GET/DELETE /api/v1/users/me/sessions`, `GET/POST/PATCH/DELETE /api/v1/users/me/addresses`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all` | **Three functional Phase 02 sections:** (1) **Profil Akun** (edit `fullName` & `phone`, read-only email + verification badge); (2) **Buku Alamat Pengiriman** (list addresses with `Alamat Utama` badge, add/edit modal/form including `subdistrict`/Kecamatan, set default, delete confirmation dialog; honest empty state `"Belum ada alamat tersimpan"` + `"Tambah Alamat"`); (3) **Sesi & Keamanan** (active sessions table with `WIB` timestamps, masked IP/UA, single-session revoke button, `"Keluar"`, `"Keluar dari Semua Perangkat"`). Every panel handles `loading`, `empty`, `error`, and `success` states. |

### 4.4 `apps/admin` Phase 02 Screen Inventory

**Admin Navigation & Theme Posture (`ENERGY 1 / RHYTHM 1 / MOTION 1`):**
`apps/admin` uses `[data-theme="dark"]` (`#17191B` Charcoal / `#35383A` Graphite). Phase 02 sidebar/header links are limited strictly to `/dashboard` (and `"Keluar"` logout action) so zero unimplemented Phase 06 routes produce dead `404` clicks (`R-24`).

| Route | Auth Posture | API Integration | Required UI Blocks & All-State Behavior |
|---|---|---|---|
| **`/`** | Redirect gateway | `proxy.ts` cookie check + `/api/v1/auth/me` | Redirects immediately to `/login` when unauthenticated, `/mfa` when admin session lacks `mfaVerified`, or `/dashboard` when authenticated + MFA-verified. |
| **`/login`** | Public staff gateway | `GET /api/v1/csrf-token`, `POST /api/v1/auth/admin/login` | Centered dark Charcoal/Graphite auth panel (`max-width: 440px`) clearly titled `"Portal Operasional ARVEN: Masuk Staf"`. Email + `PasswordInput` (`scroll-margin-bottom: 120px`). Handles `401`, `403` (customer account denied admin login), `429` throttle, and `loading` state. Redirects to `/mfa` on credential success. |
| **`/mfa`** | Admin pre-MFA session required (`arven_admin_sid` / `__Host-arven_admin_sid`) | `GET /api/v1/auth/me`, `POST /api/v1/auth/mfa/setup`, `POST /api/v1/auth/mfa/verify`, `POST /api/v1/auth/logout` | **Dual-state MFA workflow:** (a) **Enrollment (`!mfaEnabled`):** triggers `POST /api/v1/auth/mfa/setup`, renders **local `LocalQrSvg`** (zero third-party QR URL calls), displays manual Base32 secret in `--font-mono` with copy feedback, displays one-time recovery codes list once with clear storage warning, and requires initial 6-digit TOTP verification before entering `/dashboard`; (b) **Challenge (`mfaEnabled && !mfaVerified`):** 6-digit numeric TOTP input (`inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`) submitting `POST /api/v1/auth/mfa/verify`. Includes `"Ganti Akun / Keluar"` escape hatch (`POST /api/v1/auth/logout`). Handles `401` invalid/replayed TOTP (`afterTimeStep` protection) and `429`. |
| **`/dashboard`** | Protected (`ADMIN` session + `mfaVerified === true` + non-`CUSTOMER` role; `Cache-Control: no-store`) | `GET /api/v1/auth/me`, `GET /api/v1/users/me/sessions`, `DELETE /api/v1/users/me/sessions/:id`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all` | **Decision-First Phase 02 Security & RBAC Console (zero fake KPI cards or fabricated metrics per `R-17` / `R-38`):** (1) **Status Akun & Peran Staf** (signed-in email, assigned role badges e.g. `OWNER`, `MANAGER`, `SUPPORT`, exact verified permission count derived from real `permissions.length`, and expandable/searchable permission code registry in `--font-mono`); (2) **Status MFA & Sesi Aktif** (`mfaVerifiedAt` formatted via `formatWIB`, active session table with revoke control and `"Keluar Semua Perangkat"`); (3) **Cakupan Operasional Phase 02** (honest architectural notice identifying active Phase 02 Identity/RBAC boundaries and upcoming Phase 06 operational modules without clickable ghost links). |

---

## 5. Next.js 16 `proxy.ts` Route Protection, CSP & `/api/v1/*` BFF Rewrite Contract

Per [`docs/adr/ADR-002-session-proxy-and-same-site-auth.md`](./adr/ADR-002-session-proxy-and-same-site-auth.md), [`docs/SECURITY_POLICY.md`](./SECURITY_POLICY.md) Section 3.3, and Next.js 16 App Router specification:

### 5.1 Prohibited Legacy Patterns & Required Config (`next.config.ts`)

- **Strictly Forbidden:** `middleware.ts`, `experimental.ppr`, `experimental.dynamicIO`, and `export const dynamic = 'force-dynamic'`.
- **Mandatory in `apps/storefront/next.config.ts` and `apps/admin/next.config.ts`:**
  - `cacheComponents: true` (every runtime read of `cookies()`, `headers()`, `searchParams`, or uncached `/auth/me` fetch MUST sit inside a `<Suspense>` boundary).
  - Top-level `turbopack: {}` (never `experimental.turbopack`).
  - `transpilePackages: ['@arven/ui', '@arven/validators', '@arven/contracts']` as needed for monorepo workspace packages.

### 5.2 `/api/v1/*` Same-Origin BFF Proxy Rules (`src/proxy.ts`)

Both `apps/storefront/src/proxy.ts` and `apps/admin/src/proxy.ts` export `export function proxy(request: NextRequest)`:

1. **Matcher Scope:** Run `proxy` on page routes and `/api/v1/:path*`, excluding Next.js internal static assets:
   ```typescript
   export const config = {
     matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)'],
   };
   ```
2. **Same-Origin `/api/v1/*` Rewrite:**
   - Match `pathname.startsWith('/api/v1/')`.
   - Resolve `API_INTERNAL_URL` from server env (`http://127.0.0.1:4000` in non-production dev; fail closed with `503` in production if missing).
   - Validate incoming `X-Request-Id` against `^[a-zA-Z0-9_-]{8,64}$`; generate `crypto.randomUUID()` if absent or invalid.
   - Strip untrusted spoofable internal headers (`x-forwarded-user`, `x-arven-actor-*`, `x-arven-internal-*`) from cloned `request.headers`, while preserving `Cookie`, `Origin`, `Referer`, `X-CSRF-Token`, `Idempotency-Key`, and `Content-Type`.
   - Return `NextResponse.rewrite(new URL(pathname + search, apiInternalUrl), { request: { headers: sanitizedHeaders } })` and attach `X-Request-Id` on the response so `Set-Cookie`, status codes, and `Cache-Control: no-store` pass straight back to the browser on same-origin.
3. **Optimistic Cookie Pre-Check + Authoritative Server Verification:**
   - `proxy.ts` checks **cookie presence only** (fast redirect optimization; never trusted as authorization):
     - **Storefront:** checks `__Host-arven_sid` (prod/HTTPS) or `arven_sid` (local HTTP). Missing cookie on `/account` or `/account/:path*` redirects to `/login?next=<safePath>`.
     - **Admin:** checks `__Host-arven_admin_sid` (prod/HTTPS) or `arven_admin_sid` (local HTTP). Missing cookie on `/dashboard`, `/dashboard/:path*`, or `/mfa` redirects to `/login?next=<safePath>`. Root `/` redirects to `/dashboard` if cookie present, else `/login`.
   - **Open-Redirect Guard:** Any `next` query param MUST start with `/` and NOT start with `//` or contain scheme characters; otherwise fall back to `/account` (Storefront) or `/dashboard` (Admin).
   - **Authoritative Gate (`<Suspense>` Server/Client Check):** Every protected route (`/account`, `/mfa`, `/dashboard`) and auth-bypass check (`/login`) MUST verify live session state against `apps/api` `GET /api/v1/auth/me` (forwarding `Cookie` and `X-Request-Id`, `cache: 'no-store'`). Stale or revoked cookies return `401` from `/auth/me` and redirect to `/login` cleanly without redirect loops; admin sessions with `mfaVerified === false` redirect strictly to `/mfa`; `CUSTOMER` sessions attempting admin access receive explicit `403` access denied UI.
4. **CSP Nonce & Security Headers (HTML Routes):**
   - Generate per-request base64 nonce via `Buffer.from(crypto.randomUUID()).toString('base64')`.
   - Set `x-nonce` and `Content-Security-Policy` on both forwarded request headers (`NextResponse.next({ request: { headers } })`) and response headers:
     - `default-src 'self'`
     - `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`
     - `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`
     - `img-src 'self' blob: data:`
     - `font-src 'self'`
     - `connect-src 'self'`
     - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`
     - Plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`, and `Cache-Control: no-store` on `/account`, `/login`, `/register`, `/reset-password`, `/verify-email`, `/mfa`, and `/dashboard`.
   - Note for `cacheComponents: true`: verify under `pnpm build` that any `headers()` / `cookies()` call lives inside a `<Suspense>` boundary so Next.js 16 prerendering succeeds cleanly.

---

## 6. Responsive Breakpoints & Phase 02 QA Verification Checklist

### 6.1 Breakpoint Reflow Architecture

ARVEN designs mobile-first and explicitly handles the intermediate tablet/small-laptop band (`640px`–`1023px`) so forms and tables never stretch awkwardly or crush controls:

| Breakpoint Band | Min Width | Storefront Phase 02 Behavior | Admin Phase 02 Behavior |
|---|---|---|---|
| **Base (Compact Mobile)** | `0px` (`320px–639px`) | `56px` sticky header with labeled `"Menu"` drawer button; 1-col auth cards & account panels (`16px` gutter); full-width `44px+` buttons; `overflow-x-auto` session table wrapper | `56px` top bar + collapsible mobile nav drawer; single-column stacked `/login`, `/mfa`, and `/dashboard` security panels; `overflow-x-auto` session table with sticky `Session ID` / `Device` column |
| **`sm` (Large Mobile)** | `640px` (`640px–767px`) | `20px` gutter; 2-col address form pairs (`Kota` + `Kode Pos`) | `20px` gutter; 2-col MFA recovery code grid (`font-mono`) |
| **`md` (Intermediate Band)** | `768px` (`768px–1023px`) | `72px` header shows single-row primary links; `/account` transitions to 2-col profile + address grid (`24px` gutter) | Collapsible compact sidebar rail (`200px`) + fluid main panel (`minmax(0, 1fr)`); zero squeezed multi-col tables |
| **`lg` (Small Laptop)** | `1024px` (`1024px–1279px`) | `32px` gutter; Storefront `/` hero adopts asymmetric editorial split; `/account` uses left vertical section nav + content column | Persistent `240px` Admin sidebar + main security workspace (`32px` gutter) |
| **`xl` / `2xl` (Desktop)** | `1280px` / `1440px+` | `48px` gutter; container capped at `1440px` centered on `#F8F7F3` canvas; prose capped at `65ch` | Container capped at `1440px` centered on `#17191B` canvas; tables display all columns cleanly without clipping |

### 6.2 Phase 02 Playwright & Accessibility QA Checklist

Every Phase 02 UI route (`apps/storefront`: `/`, `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account`; `apps/admin`: `/login`, `/mfa`, `/dashboard`) MUST be verified by independent QA agents (`responsive-qa-agent`, `visual-qa-agent`, `functional-qa-agent`, `design-qa-agent`, `accessibility-qa-agent`, `security-qa-agent`, `performance-qa-agent`) before Phase 02 exit:

- [ ] **13-Viewport Overflow Check (`responsive`):** Inspect all Phase 02 routes at `320px`, `360px`, `375px`, `390px`, `414px`, `430px`, `768px`, `844px`, `1024px`, `1280px`, `1366px`, `1440px`, and `1920px` CSS widths; assert `document.documentElement.scrollWidth <= window.innerWidth` (`0px` horizontal overflow) and zero clipped buttons/inputs.
- [ ] **200% Zoom & Mobile Keyboard Reflow (`accessibility`, `responsive`):** Verify `/login`, `/register`, `/account`, `/mfa`, and `/dashboard` at `200%` browser zoom (`1280px` and `320px`) with zero clipped text and confirm focused inputs maintain `scroll-margin-bottom` clearance above mobile keyboards.
- [ ] **Tap Targets & Touch Equivalence (`responsive`, `interaction`):** Assert all buttons, checkboxes, eye toggles, drawer triggers, and links have `>= 44 x 44 px` hit area, `>= 8px` adjacent gap, and zero hover-only controls.
- [ ] **Contrast & Token Hygiene (`typography-color`):** Verify computed CSS variables on both Storefront (`[data-theme="light"]`) and Admin (`[data-theme="dark"]`); confirm zero `#8B897F` normal text on light surfaces, `#5E5C54` muted on light, `#B2B0A6` muted on dark, zero pink colors anywhere, zero em dashes (`U+2014`) in UI copy, and zero Tailwind/CSS font load failures (`Cormorant Garamond`, `Plus Jakarta Sans`, `IBM Plex Mono`).
- [ ] **8-State Interactive Completeness & R-35 Click-Through (`interaction`):** Record real browser click-through evidence across every link, form submission, validation error, loading lock, empty address/session state, dialog close (`Escape` + focus restore), logout, and MFA setup/challenge without console errors or uncaught page errors.
- [ ] **Keyboard Accessibility & Reduced Motion (`accessibility`):** Run `axe-core` (0 critical/serious violations), verify logical `Tab`/`Shift+Tab` order, `SkipLink` visibility on focus, `2px` `--arven-focus-ring` visibility on every interactive element, and `@media (prefers-reduced-motion: reduce)` collapse.
- [ ] **Dead Link & Fabrication Audit (`layout`, `antislop` Delivery Gate):** Confirm zero links pointing to unimplemented Phase 03 through Phase 08 routes (`R-24`), zero non-functional controls (`R-26`), zero fabricated metrics/avatars/testimonials (`R-17`, `R-18`, `R-38`), and Bahasa Indonesia wrapping integrity across all buttons and labels.
- [ ] **BFF Proxy, Cookies & CSP Security Check (`security`):** Verify `proxy.ts` forwards `/api/v1/*` with `X-Request-Id`, sets CSP nonces and `nosniff`/`frame-ancestors 'none'`, redirects unauthenticated `/account` and `/dashboard`/`/mfa` visits safely without open redirects, enforces `arven_sid` vs `arven_admin_sid` scope isolation, and blocks unverified MFA sessions from `/dashboard`.
