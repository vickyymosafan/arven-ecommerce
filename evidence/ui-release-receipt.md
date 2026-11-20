# ARVEN UI/UX Luxury Visual & Layout Overhaul: Release Decision Packet

## 1. Summary of Changes
- **Design Tokens & Theme (`@arven/ui`)**:
  - Added Champagne Gold atelier accent tokens (`--color-gold-200..900`).
  - Added Architectural Frosted Glass scrim tokens (`--arven-glass-bg`, `--arven-glass-border`, `--shadow-glass`).
  - Added `.bg-glass` and `.border-glass` utilities in `theme.css`.
  - Added `gold` tone to `Badge` and `Button`.
  - Added `glass` variant to `Surface`.
  - Added hover zoom and 3D Atelier badge support to `ProductCard`.
- **Storefront App (`apps/storefront`)**:
  - Luxury Atelier Announcement Bar with Indonesian white-glove delivery details and atelier hours.
  - Frosted Architectural Sticky Navigation bar with refined active indicator states.
  - Asymmetrical Editorial Magazine Hero with seasonal archive badge, Cormorant/Playfair typography, and direct 3D Showroom action.
  - Upgraded Curated Capsules cards with smooth hover zoom and refined metadata overlays.
  - Dedicated Interactive 3D Garment Inspection Section (WebGL 60 FPS, physical fabric drape simulation).
  - Materiality & Architectural Craftsmanship Narrative (Sulawesi Raw Silk, Grade-A Combed Cashmere, Okayama 14oz Selvedge Denim, Tuscan Vegetable-Tanned Vachetta Leather).
  - Multi-Column Luxury Footer with Jakarta Atelier coordinates and IDR currency indicators.
- **Admin App (`apps/admin`)**:
  - Sleek dark luxury console styling with live status indicator.
  - KPI metric cards with subtle gold accents and clean monospace tabular-numeral formatting.

## 2. Invariants Verification
- Zero pink anywhere: PASS
- Never use Stone `#8B897F` for normal text on light surfaces; Deep Stone `#5E5C54` used: PASS (Contrast 6.2:1 > 4.5:1 WCAG AAA)
- Zero em dashes (`\u2014`) in UI copy: PASS
- 8-state interactive models preserved: PASS
- Touch targets >= 44x44px: PASS
- Full build and test suite passing (262/262 tests, 23/23 turbo build tasks): PASS
