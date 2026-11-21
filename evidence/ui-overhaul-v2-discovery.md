# ARVEN UI/UX, Layout & Typography Overhaul — Discovery Report (v2)

> **Plan ID:** `b1568948-75be-4876-a938-8f6750d8b77a`
> **Date:** 2026-11-21
> **Baseline Playwright Runs:** Storefront `5006fce4-c589-4718-8fb7-8afa61ebce29`, Admin `a617c529-b8a2-4406-afdd-54b60a6eb343`

## 1. Live Visual & Automated Audit Findings

Inspecting live Storefront (`http://localhost:3000`) and Admin (`http://localhost:3001`) via `craftrig` (`localhost.discover_routes` + `localhost.audit_visual_a11y`) uncovered critical visual, layout, typography, and WCAG defects left unresolved by commit `20ac6de`:

1. **Header Text Collision at 1280px (`apps/storefront/src/components/storefront-shell.tsx`):**
   - Packing 10 flat uppercase links (`Home`, `Shop`, `Collections`, `Showroom`, `Lookbook`, `Journal`, `Search`, `Bag`, `Account`, `Sign In`) into one navbar caused `ARVEN | Atelier` to physically overlap `Home` (`ARVEN | ATELIHOME`).
2. **56 Rendered Contrast Violations & 4 Serious Axe-Core Failures:**
   - Dark 3D Showcase band on `/` omitted `data-theme="dark"`, causing `<Badge tone="gold">WebGL · 60 FPS</Badge>` to render `#17191B` ink over `#2C2A27` (`1.23:1` invisible text).
   - Materiality section used `text-gold` (`#C5A880`) at `10px` on `#FFFFFF` (`2.26:1` FAIL, below `12px` floor).
   - Footer separator `span.text-hairline` (`|`) rendered `#D8D3C8` over `#F2F1EA` (`1.32:1` FAIL).
3. **Sub-11px Tiny Text & Line-Clamp Clipping:**
   - Announcement bar (`10px`), collection piece overlay pill (`10px`), materiality provenance labels (`10px`), and `line-clamp-2` category descriptions (`scrollHeight 48px > clientHeight 32px`) failed typography audits.
4. **Target Size Defect (`packages/ui/src/components/input.tsx`):**
   - `Checkbox` input box (`18x18px`) fell below WCAG 2.2 AA `24x24px` target minimum.
5. **Broken System Dark-Mode Polarity (`layout.tsx` & `tokens.css`):**
   - Hardcoded `data-theme="light"` (Storefront) and `data-theme="dark"` (Admin) prevented `@media (prefers-color-scheme)` from taking effect during dual-theme browser testing and OS theme matching.
6. **Layout & Luxury Editorial UX Deficits:**
   - Homepage Hero right column displays a developer-style status widget (`House Release Index`, `Fulfillment Origin: JKT-MAIN-01`) and bottom section displays leftover Phase 02 auth scaffolding (`Account & Delivery Governance`, `Active Device Controls`).
   - Homepage Featured Releases uses `lg:grid-cols-3` for 4 items, stranding a single orphan card on row 2.
   - `/shop` places an 8-input full-width form wall above the product grid, pushing all garments below the fold on desktop and mobile (`>650px` scroll on `390px`).
   - No quick slide-over Cart Drawer or quick Search overlay from the header.
   - `Cormorant_Garamond` omitted `italic` style; `DESIGN.md` §4.2 fluid typography tokens were undefined; `IBM Plex Mono` was overused for marketing eyebrows across all pages.
   - Admin Overview exposes internal build phase labels (`Phase 06`, `Phase 03`, `Phase 02`) and renders an ungrouped flat 15-item sidebar list.

## 2. Preserved Test & Architecture Contracts

- Unit test suites audited across `packages/ui/test/*`, `apps/storefront/test/*`, and `apps/admin/test/*`.
- All existing ARIA roles, button labels tested by Vitest (`Featured`, `Low Stock`, `Foto 2D`, `Model 3D`, `Lewati Tampilan 3D`, `Switch to dark theme`, `ADMIN_NAV_ITEMS` order in `filterAdminNavItems`), zero pink hexes, zero `#8B897F` normal text, zero em dashes (`\u2014`), and 3D dynamic bundle isolation must remain 100% intact.
