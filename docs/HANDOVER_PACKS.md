# ARVEN Technical Handover & Operational Packs

> **Document:** `docs/HANDOVER_PACKS.md`  
> **Source-of-Truth:** ARVEN Blueprint Appendix E  
> **Status:** AUDITED & PASS  
> **Date:** 2026-11-19  
> **Author Role:** `frontend-developer` / `governance-lead`  
> **Plan ID:** `5160a379-03cf-4239-9376-37b6fc9f2106`

---

## 1. Overview of Handover Documentation

This document compiles the operational handover packages for engineering, operations, security, and administrative teams maintaining the ARVEN Luxury Contemporary Fashion platform.

---

## 2. Pack 1: Engineering & Monorepo Architecture

- **Codebase Navigation:** Monorepo managed via Turbo 2 and pnpm 10 workspaces.
  - `apps/api`: NestJS 12 backend with Clean Architecture, Zod validation, and OpenAPI contracts.
  - `apps/worker`: BullMQ background processing worker.
  - `apps/storefront`: Next.js 16 luxury customer shopping experience.
  - `apps/admin`: Next.js 16 administrative operations console with 7-role RBAC.
  - `packages/database`: PostgreSQL 18 schema, Prisma 7 client, and seed logic.
  - `packages/three-engine`: High-performance 3D scene engine, showroom, and studio rig systems.
  - `packages/contracts`: Shared TypeScript API interfaces and OpenAPI definitions.
  - `packages/validators`: Standard Schema / Zod runtime validation schemas.
  - `packages/config`: Type-safe runtime environment configuration loader.
  - `packages/observability`: Structured Pino logging and correlation ID tracking.

- **Key Developer Commands:**
  - Build all: `pnpm build`
  - Run lint & typecheck: `pnpm turbo lint typecheck`
  - Run full test suite: `pnpm test`
  - Re-generate Prisma client: `pnpm db:generate`
  - Apply migrations: `pnpm db:migrate`

---

## 3. Pack 2: Security & Identity Governance

- **Authentication System:**
  - Argon2id password hashing with constant-time dummy verification.
  - Separate cookie namespaces (`arven_sid` for Storefront, `arven_admin_sid` for Admin).
  - Mandatory TOTP MFA for all administrative personnel.
  - CSRF double-submit token protection on all state-mutating requests (`X-CSRF-Token`).
- **7-Role RBAC Model:**
  - Granular permissions mapped across `OWNER`, `MANAGER`, `PRODUCT`, `INVENTORY`, `ORDER`, `SUPPORT`, and `CONTENT`.
  - Sensitive administrative operations (`refund.approve`, `user.role.manage`, `settings.provider.manage`) strictly reserved for `OWNER`.
- **Payment Compliance (PCI DSS 4.0):** Zero PAN or CVV cardholder data enters or is stored within ARVEN infrastructure; all card operations are handled via Midtrans Snap client redirection and SHA-512 webhook verification.

---

## 4. Pack 3: 3D Asset & CMS Content Guidelines

- **3D Model Standards:**
  - Binary GLB format strictly starting with magic bytes `0x46546C67`.
  - Max file size: 25 MB per garment, 50 MB per showroom environment.
  - Textures: 2K maximum resolution (2048x2048), PBR metallic-roughness workflow.
  - Geometry: Draco compression enabled; polycount strictly under 80,000 triangles per asset.
  - Self-hosted decoders located in `/decoders/` with immutable cache headers.
- **Visual Design Rules:**
  - Storefront uses Ivory (`#F8F7F3`) and Cream (`#E9E4DA`) surfaces.
  - Text contrast: Deep Stone (`#5E5C54`) for muted text on light backgrounds (never use `#8B897F` for normal text).
  - Zero pink colors anywhere in production UI.
  - Zero em dashes (`—`) in UI copy (use periods or hyphens).

---

## 5. Pack 4: Customer Support & Fulfillment Guide

- **Order States:** `PENDING_PAYMENT` -> `PAID` -> `PROCESSING` -> `SHIPPED` -> `DELIVERED` -> `COMPLETED`.
- **Returns & Exchanges:**
  - Customer submits return request with return reason and items.
  - Administrative reviewer approves or rejects request (`return.review` / `return.approve`).
  - Warehouse marks items received (`return.receive`).
  - Owner approves dual-step financial refund (`refund.approve`).
- **Audit Logging:** Every administrative action (price edit, stock adjustment, role change, refund approval) is immutably logged in `audit_logs` table with actor ID, IP address, timestamp, and before/after JSON diffs.
