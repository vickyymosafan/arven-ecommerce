# ARVEN UI/UX Visual & Layout Overhaul: Planning & Contracts

## 1. Governance & Risk Profile
- **Policy Compliance:** No mutations to backend auth, database schemas, or API contracts.
- **Privacy & Security:** Presentation-layer updates only; zero PII leakage, zero client-side privilege escalation.
- **Autonomy Boundaries:** Work within monorepo code, zero remote pushes without authorization.

## 2. Architecture & Change Boundaries
- `packages/ui/src/styles/tokens.css` & `theme.css`: Core design tokens, luxury glass scrims, champagne accents.
- `packages/ui/src/components/*`: `product-card.tsx`, `badge.tsx`, `surface.tsx`, `button.tsx` styling enhancements.
- `apps/storefront/src/app/page.tsx`: Editorial split hero, capsule collection cards, virtual showroom teaser, craftsmanship narrative.
- `apps/storefront/src/components/storefront-shell.tsx`: Frosted glass architectural header, luxury announcement ticker, refined search and cart drawers.
- `apps/admin/src/app/page.tsx` & shell: Sleek dark luxury UI styling.

## 3. Design & Experience Contract
- **Colors:**
  - Canvas: Ivory `#F8F7F3`, Cream `#E9E4DA`
  - Dark/Accents: Charcoal `#17191B`, Graphite `#35383A`
  - Gold/Champagne: `#C5A880` (Accent), `#E8DCCB` (Soft Warm Accent)
  - Text Muted: Deep Stone `#5E5C54` on light (WCAG AAA), `#B2B0A6` on dark.
  - Invariant: Zero pink (`#FFC0CB`), zero em dashes (`\u2014`).
- **Surfaces & Glass:**
  - Frosted glass backdrop blur (`backdrop-blur-md bg-canvas/85 border-b border-hairline/60`).
  - Hairline architectural borders (`border-[0.5px]` / `border-hairline`).
- **Typography & Motion:**
  - Editorial high-fashion headlines with tracked uppercase subtitles and serif hero statements.
  - Smooth hardware-accelerated transitions (200-300ms cubic-bezier), full `prefers-reduced-motion` compliance.
