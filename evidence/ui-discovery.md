# ARVEN UI/UX Visual & Layout Overhaul: Discovery & Context

## 1. Scope & Objective
Elevate the luxury contemporary fashion aesthetic across ARVEN Storefront and Admin portals:
- Introduce refined architectural color accents: Champagne Gold (`#C5A880`), Frosted Glass/Scrims, hairline borders.
- Re-architect Storefront Homepage (`apps/storefront/src/app/page.tsx`) with an asymmetrical editorial hero layout, seasonal capsule preview, atelier craftsmanship narrative, and 3D Virtual Showroom teaser.
- Upgrade Storefront Shell (`apps/storefront/src/components/storefront-shell.tsx`) with frosted architectural sticky navigation, luxury announcement ticker, and refined search/bag indicators.
- Refine shared `@arven/ui` primitives (`ProductCard`, `Button`, `Badge`, `Surface`) with tactile luxury micro-interactions and sharp architectural geometry.
- Enhance Admin console with sleek dark luxury surfaces and brushed accents.

## 2. Invariants & Rules
- Zero pink anywhere (`#FFC0CB` or variants strictly banned).
- Deep Stone `#5E5C54` (`--arven-text-muted`) on light surfaces (contrast > 6:1); `#B2B0A6` on dark surfaces.
- Zero em dashes (`\u2014`) in UI copy.
- 8 interactive component states preserved.
- Touch targets >= 44x44px.
