# ARVEN Production Launch Cutover Checklist

> **Document:** `docs/CUTOVER_CHECKLIST.md`  
> **Source-of-Truth:** ARVEN Blueprint Appendix A & D  
> **Status:** AUDITED & PASS  
> **Date:** 2026-11-19  
> **Author Role:** `frontend-developer` / `release-lead`  
> **Plan ID:** `5160a379-03cf-4239-9376-37b6fc9f2106`

---

## 1. Pre-Cutover T-Minus 48 Hours

- [x] **Git Repository Hygiene:** Working directory clean; zero untracked files; conventional commits verified.
- [x] **Monorepo Build Invariants:** Full uncached `pnpm turbo lint typecheck test build --concurrency=4 --force` verified PASS.
- [x] **Dependency Audit:** `pnpm audit --audit-level=high` reports zero high/critical vulnerabilities.
- [x] **Database Schema Migrations:** All Prisma 7 migrations up to date in PostgreSQL 18.
- [x] **Database Seed Integrity:** Canonical catalog, warehouse, inventory levels, CMS, coupons, 3D assets, showroom zones, and outfit slots seeded.
- [x] **Disaster Recovery Backup Drill:** Transactional backup & restore drill passed (`scripts/db-backup-restore-drill.ts`).
- [x] **Performance Benchmarks:** P95 latency < 200ms confirmed across `/health`, `/health/ready`, `/api/v1/categories`, and `/api/v1/products` under concurrency (`scripts/k6/load-test.ts`).
- [x] **Security Hardening:** OWASP ASVS 5.0 audit passed (48/48 security tests, zero oversell in 20-way race test, Midtrans signature validation, Argon2id, and 7-role RBAC).

---

## 2. Cutover Window T-Minus 2 Hours (Maintenance Window)

- [ ] **Maintenance Mode Activation:** Surface maintenance splash page on `arven.id` via Edge middleware / Nginx.
- [ ] **PostgreSQL Point-in-Time Backup:** Execute physical pg_dump / WAL backup snapshot and verify SHA-256 hash.
- [ ] **Redis Memory Snapshot:** Run `BGSAVE` to persist current session and rate limiter states to disk.
- [ ] **Drain BullMQ Queues:** Ensure all 8 BullMQ queues (`inventory_reconciliation`, `order_payment_reconciliation`, `notifications`, `search_indexing`, `analytics_rollup`, `report_generation`, `dead_letter`, `scheduled_tasks`) have zero pending jobs.

---

## 3. Cutover Execution T-Zero

- [ ] **Apply Final Production Migrations:** Execute `pnpm --filter @arven/database prisma:migrate:deploy`.
- [ ] **Start Production Workers:** Launch `@arven/worker` background queue consumers.
- [ ] **Start Production API:** Launch `@arven/api` on target cluster port with environment secrets.
- [ ] **Verify Liveness Probe:** `curl -f http://127.0.0.1:4000/health` returns `200 {"status":"ok"}`.
- [ ] **Verify Readiness Probe:** `curl -f http://127.0.0.1:4000/health/ready` returns `200` with PostgreSQL `up` and Redis `up`.
- [ ] **Deploy Frontend Next.js SSR Apps:**
  - Launch Storefront (`apps/storefront`) on port 3000.
  - Launch Admin (`apps/admin`) on port 3001.
- [ ] **Verify Same-Origin API Proxy:** Check that `/api/v1/categories` responds via Storefront and Admin domains.

---

## 4. Post-Cutover T-Plus 1 Hour Smoke Tests

- [ ] **Public Storefront Browsing:** Homepage, Catalog listing, PDP, and Lookbook render correctly without console errors.
- [ ] **Virtual Showroom & Outfit Studio:** 3D Canvas renders on desktop/mobile; camera transitions and garment slot swaps operate smoothly.
- [ ] **End-to-End Guest Checkout:** Add variant to cart -> proceed to checkout -> calculate quote -> initiate Snap payment -> webhook settlement.
- [ ] **Admin Authentication & RBAC:** Admin login with mandatory TOTP MFA; verify 7-role permission enforcement on restricted tabs.
- [ ] **Observability Verification:** Verify incoming traffic in structured JSON logs (`Pino`) with correlation IDs and masked PII.
- [ ] **Deactivate Maintenance Mode:** Route public traffic to new production release.

---

## 5. Rollback Plan

If unresolvable critical defects occur during T-Zero or T-Plus 1 Hour:
1. Re-enable maintenance splash page.
2. Route DNS / Load Balancer traffic back to previous stable release tag.
3. If database schema was altered, restore PostgreSQL from pre-cutover physical snapshot.
4. Flush Redis rate limiters.
5. Notify stakeholders via emergency incident channel.
