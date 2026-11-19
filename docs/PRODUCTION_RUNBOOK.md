# ARVEN Production Operations & Incident Runbook

> **Document:** `docs/PRODUCTION_RUNBOOK.md`  
> **Source-of-Truth:** ARVEN Blueprint Appendix D  
> **Status:** AUDITED & PASS  
> **Date:** 2026-11-19  
> **Author Role:** `frontend-developer` / `architecture-lead`  
> **Plan ID:** `5160a379-03cf-4239-9376-37b6fc9f2106`

---

## 1. System Architecture & Topology Overview

ARVEN runs as an enterprise high-performance monorepo:
- **API Server:** NestJS 12 (Express 5, NodeNext ESM) exposing `/api/v1` and health probes at `/health` and `/health/ready`.
- **Worker Process:** BullMQ 6 processor managing 8 distinct background queues backed by Redis 8 / Memurai.
- **Frontend Applications:** Next.js 16 (React 19, Turbopack, Tailwind CSS v4) with same-origin `proxy.ts` routing `/api/v1/*` to the API backend.
- **Data Tier:** PostgreSQL 18 with Prisma 7, connection pooling, and strict `CHECK` constraints.
- **Cache & Sessions:** Redis 8 / Memurai (`maxmemory-policy=noeviction`).
- **3D Pipeline:** `@arven/three-engine` using Three.js / React Three Fiber 9 with self-hosted Draco/KTX2 WASM decoders.

---

## 2. Standard Operational Procedures

### 2.1 Starting Services in Production
```bash
# 1. Database Migrations
pnpm --filter @arven/database prisma:migrate:deploy

# 2. Worker Queue Service
pnpm --filter @arven/worker start

# 3. Core REST API
pnpm --filter @arven/api start

# 4. Frontend Applications
pnpm --filter @arven/storefront start
pnpm --filter @arven/admin start
```

### 2.2 Health Check Monitoring
- **Liveness Probe:** `GET /health`  
  Returns `200 {"status":"ok","service":"@arven/api"}` if HTTP event loop is responsive. Exempt from rate limiting.
- **Readiness Probe:** `GET /health/ready`  
  Validates live TCP connections to both PostgreSQL 18 and Redis with a 3000ms timeout. Returns `200 {"status":"ready","checks":{"postgres":"up","redis":"up"}}`. Returns `503 SERVICE_UNAVAILABLE` without leaking credentials if either service drops.

### 2.3 Database Backup & Disaster Recovery
- Scheduled daily physical backup via `pg_dump` with transaction isolation `REPEATABLE READ`.
- Automated test drill executable anytime via:
  ```bash
  pnpm tsx --tsconfig apps/api/tsconfig.json scripts/db-backup-restore-drill.ts
  ```
- Verifies archive integrity and SHA-256 checksum match across all 26 core application tables.

---

## 3. Incident Response Playbooks

### Playbook 3.1: Database Connection Saturation
- **Symptom:** API logs show connection timeout errors; `/health/ready` returns 503.
- **Remediation:**
  1. Inspect PostgreSQL active connections: `SELECT count(*) FROM pg_stat_activity;`.
  2. Verify API pool limits configured via `DATABASE_POOL_MAX_API=10` and `DATABASE_POOL_MAX_WORKER=10`.
  3. Terminate idle zombie connections: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND state_change < current_timestamp - INTERVAL '5 minutes';`.

### Playbook 3.2: BullMQ Dead Letter Queue Accumulation
- **Symptom:** Alert on `dead_letter` queue size > 0.
- **Remediation:**
  1. Inspect failed job stack trace via Admin Monitoring or Redis CLI (`HGETALL bull:dead_letter:id`).
  2. If caused by external provider outage (e.g. Midtrans or Shipping API rate limit), trigger queue replay once external service recovers.
  3. In case of fatal payload corruption, quarantine the payload and notify customer support.

### Playbook 3.3: Midtrans Webhook Desynchronization
- **Symptom:** Customer completed payment on Midtrans Snap, but order status remains `PENDING_PAYMENT`.
- **Remediation:**
  1. Trigger manual transaction status sync via Admin Orders portal or API:
     `POST /api/v1/admin/orders/:id/sync-payment`
  2. This queries Midtrans `getStatus(orderId)`, verifies signature, and transitions order atomically to `PAID` via outbox event.

---

## 4. Log Inspection & Troubleshooting

- All logs are structured JSON (`Pino`).
- Standard fields: `level`, `time`, `service`, `requestId`, `actorId`, `method`, `path`, `status`.
- Sensitive values (`password`, `token`, `secret`, `cvv`, `cardNumber`) are permanently redacted at the serializer level.
- Filter errors via CLI:
  ```bash
  cat app.log | jq 'select(.level >= 40)'
  ```
