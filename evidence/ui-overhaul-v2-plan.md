# ARVEN UI/UX, Layout & Typography Overhaul — Design, Architecture & Governance Contract (v2)

> **Plan ID:** `b1568948-75be-4876-a938-8f6750d8b77a`
> **Aligned Contracts:** `DESIGN.md`, `AGENTS.md`, `modern-web-guidance` (`typography`, `css-layout`, `navbar`, `content-first-noise-reduction`, `color`, `dark-mode`, `dark-mode-toggle`, `dialog`)

## 1. Governance & Security Boundaries
- Strict presentation-layer scope (`packages/ui`, `apps/storefront`, `apps/admin`). Zero changes to API auth/RBAC/payment/inventory invariants, Prisma schema, or security headers.
- Strict WCAG 2.2 AA/AAA contrast compliance, zero pink hues, zero `#8B897F` for normal light-surface text, zero em dashes (`\u2014`), minimum `12px` UI text floor, minimum `24x24px` input / `44x44px` interactive control targets.
- Preserve dynamic-import isolation of `@arven/three-engine/*` so `/`, `/shop`, `/collections`, `/cart`, `/checkout` never bundle Three.js.

## 2. Clean Architecture & Patch Boundaries
- **Layer 1 (`packages/ui`):** Single source of truth for primitive/semantic/component tokens (`tokens.css`), fluid typography classes & dark-mode/forced-colors utilities (`theme.css`), icons (`icons.tsx`), `Badge`, `Button`, `Surface`, `Input`/`Checkbox`, `Modal`/`Drawer`, `ProductCard`, `ThemeToggle`, `DataTable`.
- **Layer 2 (`apps/storefront`):** Root font loading (`Cormorant_Garamond` normal+italic, `Plus_Jakarta_Sans`, `IBM_Plex_Mono`) + FOUC script, redesigned 3-zone `StorefrontShell` + `CartDrawer` + `SearchOverlay`, asymmetric editorial Hero & balanced 4-col Homepage, desktop left-rail + mobile drawer `ShopBrowser`, `7:5` editorial `ProductDetailView` with native `<details>` specs, harmonized `Collections`, `Lookbook`, `Journal`, `About`, `Cart`, `Checkout`, `Account`, `Auth`.
- **Layer 3 (`apps/admin`):** Root font loading + dual-theme FOUC support, grouped sidebar navigation in `AdminShell` (preserving `ADMIN_NAV_ITEMS` order), executive Overview headings (removing internal `Phase 02/03/06` labels) & high-contrast KPI cards, refined `AdminLoginPage`.

## 3. Typography & Color Contract
- **Fluid Scale (`tokens.css`):** Implements `DESIGN.md` §4.2 (`--text-display-xl`..`--text-sku`) with `max / min <= 2.5` for 200% zoom reflow (WCAG 1.4.4), unitless line-heights (`1.06`..`1.60`), `text-wrap: balance` on display/headings, `text-wrap: pretty` on body copy.
- **Font Discipline:** `Cormorant Garamond` (normal + italic) for editorial display/titles; `Plus Jakarta Sans` for eyebrows (`--text-micro-label`), nav, body, prices (`tabular-nums`); `IBM Plex Mono` strictly for SKUs, order numbers, audit hashes, and numeric codes.
- **Accessible Atelier Gold Tokens:**
  - Light: `--arven-accent-gold-fg: #6E542E` (`6.96:1` on White, `6.48:1` on Ivory), `--arven-accent-gold-bg: #F5EFE4` (`6.07:1` pair).
  - Dark: `--arven-accent-gold-fg: #E2C9A4` (`11.1:1` on Charcoal, `7.4:1` on Graphite), `--arven-accent-gold-bg: #2C251B` (`9.2:1` pair).
- **Dual-Theme Polarity:** `:root` uses `color-scheme: light dark` with `@media (prefers-color-scheme: dark)` fallback on `:root:not([data-theme="light"])` and explicit `[data-theme="light"]`/`[data-theme="dark"]` subtree overrides.
