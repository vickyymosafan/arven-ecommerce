# ARVEN Phase 09 Design, Accessibility & Experience Contract

> **Phase:** ARVEN Phase 09: Production Readiness, Security Hardening, Performance Auditing & Release Governance  
> **Plan ID:** `5160a379-03cf-4239-9376-37b6fc9f2106`  
> **Task ID:** `9df35034-66ba-4c26-81ec-dae5eb65509f`  
> **Role:** `design-lead`  
> **Date:** 2026-11-19  

---

## 1. Design Tokens & Theme Contracts

All UI surfaces in ARVEN strictly consume semantic `--arven-*` CSS variables defined in `@arven/ui`:

| Semantic Token | Light Value (Storefront) | Dark Value (3D Stage / Admin) | Purpose & Usage |
|---|---|---|---|
| `--arven-bg-surface` | `#F8F7F3` (Ivory) | `#17191B` (Charcoal) | Primary canvas background |
| `--arven-bg-subtle` | `#E9E4DA` (Cream) | `#22252A` (Deep Slate) | Elevated panels, cards, and modal drawers |
| `--arven-text-primary` | `#17191B` (Charcoal) | `#F8F7F3` (Ivory) | Headings, primary labels, price tags |
| `--arven-text-muted` | `#5E5C54` (Deep Stone) | `#B2B0A6` (Muted Stone) | Secondary text, timestamps, captions |
| `--arven-accent-primary`| `#17191B` (Charcoal) | `#F8F7F3` (Ivory) | Primary CTAs, active pills |
| `--arven-accent-focus` | `#17191B` (14.82:1) | `#82B0DC` (7.72:1) | High-contrast keyboard focus indicator |

### Anti-Slop Discipline
1. **Forbidden Hex Codes:** Zero occurrences of deprecated `#8B897F` Stone text on light backgrounds (`3.27:1` / `2.77:1` FAIL). Zero pink tokens (`#FF69B4`, `#EC4899`, etc.).
2. **Typography Standards:** `Cormorant Garamond` (display), `Plus Jakarta Sans` (body), `IBM Plex Mono` (`tabular-nums` enforced on currency). Zero em dashes (`\u2014`) in Indonesian UI copy.
3. **8 Interactive States:** Every button, link, and input implements: `default`, `hover`, `focus-visible`, `active`, `disabled`, `loading`, `empty`, `error`.

---

## 2. Accessibility (WCAG 2.2 Level AA) Contracts

- **Contrast:** Minimum 4.5:1 for body copy; 3:1 for large display titles and UI boundaries. Focus indicator `#82B0DC` on `#17191B` provides 7.72:1 contrast.
- **Touch Target Size:** Minimum 44px x 44px on all interactive controls.
- **Reflow:** At 200% zoom (640x400) and across all 14 responsive profiles (320px–3840px), 0px horizontal overflow is guaranteed.
- **Keyboard Navigation:** Logical DOM tab order, no keyboard traps, visible focus rings with `0s` transition, modal focus traps with `Escape` restoration.

---

## 3. Motion & Animation Standards

- Standard mode: `cubic-bezier(0.16, 1, 0.3, 1)` easing for drawers and menus; gentle orbit damping (`dampingFactor: 0.08`).
- `prefers-reduced-motion: reduce`: All CSS transitions collapse to `0.01ms`, 3D camera damping is disabled, and continuous rotation is suppressed.
- R3F on-demand rendering: `<Canvas frameloop="demand">` ensures 0 idle rAF execution.
