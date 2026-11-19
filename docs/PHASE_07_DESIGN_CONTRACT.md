# ARVEN — Phase 07 Design, Color, Typography & Motion Experience Contract

> **Execution Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Task ID:** `902e0731-4a34-49c8-8203-c746980922bb` (`design-lead`)  
> **Governing Baselines:** [`DESIGN.md`](../DESIGN.md), [`docs/THREE_D_PIPELINE.md`](./THREE_D_PIPELINE.md)

## 1. Light Commerce vs Dark 3D Showcase Pairing

- **PDP Page Surface (`apps/storefront`):** Light editorial surface (`Ivory #F8F7F3` canvas, `Cream #E9E4DA` secondary panels, `#17191B` primary ink, `#5E5C54` muted ink >= 4.5:1 — NEVER `#8B897F` normal text on light).
- **Interactive 3D Stage Surface (`Product3DViewerIsland` & Admin Preview):** Dark Showcase framing (`#17191B` Charcoal stage, `#35383A` Graphite controls/borders, `#F8F7F3` foreground text, `#B2B0A6` muted labels >= 7:1, `#C5A572` Warm Bronze active camera/preset indicator on dark or `#82B0DC` focus ring).
- **Strict Prohibitions:** Zero pink/magenta anywhere (`isAllowedArvenColorHex` rejects `#FF*` / magenta hexes on presets), zero em dashes (`—`) in UI copy, `IBM Plex Mono` with `tabular-nums` on SKU, asset byte size, triangle count, version tags, and IDR prices.

## 2. Accessibility, Motion & Mobile Scroll Guardrails

1. **Skip Link & Non-Trapping Keyboard Controls:**
   - `"Lewati Tampilan 3D"` skip link positioned directly before `<ProductExperience>` jumps focus to `#pdp-purchase-controls` (Variant Selection & Add to Bag).
   - Mode Toggle (`Foto 2D` / `Model 3D`), Camera Preset Tabs (`Depan`, `Tiga Perempat`, `Belakang`, `Detail`), Step Buttons (`Putar Kiri 45°`, `Putar Kanan 45°`, `Perbesar`, `Perkecil`, `Reset Tampilan`), and Material Swatches (`role="radiogroup"`) maintain `>= 44x44px` (`min-h-11 min-w-11`) touch targets and keyboard Arrow / `Home` / `End` navigation.
2. **Mobile Touch Scroll Isolation (`< 768px`):**
   - Outer viewer container maintains `touch-action: pan-y` by default on viewports `< 768px`, enabling orbit interaction only after clicking explicit `"Aktifkan Putar 3D"` / `"Kunci Gulir"` toggle or interacting with step controls.
3. **`prefers-reduced-motion: reduce`:**
   - Zero continuous idle rotation/turntable loops, `enableDamping = false`, and instant deterministic camera snaps on preset activation.
4. **WebGL Disabled / Context Loss Fallback:**
   - Automatically renders `poster.webp` / primary product image + informative banner (`"Tampilan 2D aktif"`) + `"Muat Ulang Model 3D"` / `"Kembali ke Foto 2D"` with zero uncaught errors; Add to Bag and preset selection stay 100% functional.
