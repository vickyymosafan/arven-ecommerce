# ARVEN Phase 09 Governance & Security Policy Document

> **Phase:** ARVEN Phase 09: Production Readiness, Security Hardening, Performance Auditing & Release Governance  
> **Plan ID:** `5160a379-03cf-4239-9376-37b6fc9f2106`  
> **Task ID:** `f6ae61dc-c906-4df0-9c78-5227590a38dc`  
> **Role:** `governance-lead`  
> **Date:** 2026-11-19  

---

## 1. Governance Principles & Authority Boundaries

Phase 09 enforces the ultimate quality, security, and release governance rules for the entire ARVEN platform:

1. **Contracts and Standards Authority:**
   - Security: OWASP ASVS 5.0 Level 2 baseline, strictly governed by [`docs/SECURITY_POLICY.md`](./SECURITY_POLICY.md).
   - Identity & RBAC: 7 canonical roles (`OWNER`, `MANAGER`, `PRODUCT`, `INVENTORY`, `ORDER`, `CONTENT`, `SUPPORT`, plus `CUSTOMER`) enforcing 34 granular permission codes without wildcard bypasses.
   - Financial Integrity: Zero PAN/CVV storage, server-authoritative checkout quote calculations, atomic inventory reservations with `variant_id ASC` lock ordering, and Midtrans constant-time SHA-512 signature verification.
   - Clean Architecture & ESM: Strict layer boundary separation, explicit `.js` import specifiers, and zero frontend `@prisma/client` leaking.
2. **Strict Stage Separation & Anti-Gaming Law:**
   - Implementation agents (`backend-developer`, `data-engineer`, etc.) MUST NEVER attest to or mark `PASS` on their own outputs.
   - All 10 Quality Checkpoints must be independently evaluated by designated QA agents (`security-qa-agent`, `performance-qa-agent`, `accessibility-qa-agent`, `visual-qa-agent`, `responsive-qa-agent`, `threejs-qa-agent`, `design-qa-agent`, `functional-qa-agent`, `independent-assurance-lead`).
3. **Repair Budget & Hard Escalation (`maxRepairIterations = 5`):**
   - Maximum automated repair iteration budget is 5.
   - If any checkpoint or task fails after 5 repair iterations, automated retries stop immediately and escalate to human leadership with a Decision Packet.
4. **Human Approval Boundary:**
   - Per `evidence-and-release-governance`, **never commit external deployments, production promotions, or destructive data actions without explicit human authorization.**

---

## 2. OWASP ASVS 5.0 Audit Requirements

Before the `security` checkpoint can be marked `PASS`, the following must be verified:

| ASVS Area | Control Tested | Implementation / Verification Standard |
|---|---|---|
| **V1 Architecture & Threat Modeling** | 6 Trust Boundaries | Monorepo isolation, public/customer/admin/worker trust domains |
| **V2 Authentication** | Password Hashing & MFA | Argon2id (`m=65536, t=3, p=4`), mandatory TOTP MFA for staff |
| **V3 Session Management** | Session Isolation | `__Host-` SameSite cookies, session rotation on login/privilege changes |
| **V4 Access Control** | 7-Role Granular RBAC | 34 permission codes, deny-by-default guards, IDOR defense on customer data |
| **V5 Cryptography** | Key & Secret Management | Constant-time comparisons (`crypto.timingSafeEqual`), zero hardcoded secrets |
| **V8 Data Protection** | PII & PCI-DSS Scope | Zero PAN/CVV storage, email/phone masking in structured logs |
| **V12 File & Resource** | Binary Upload Security | GLB magic bytes `0x46546C67`, polyglot rejection, SSRF URI blocking, CSP headers |
| **V14 Concurrency & Integrity** | Oversell & Tampering | Row-level locking on inventory, Idempotency-Key collision checks |

---

## 3. Production Health & Observability SLA

- **Liveness Probe (`GET /api/v1/health`):** Returns `200 OK` if the HTTP server process is responsive.
- **Readiness Probe (`GET /api/v1/ready`):** Returns `200 OK` only when:
  1. PostgreSQL 18 connection pool is healthy and queryable (`SELECT 1`).
  2. Memurai Redis client responds to `PING` within `< 100ms`.
  3. BullMQ queues are accepting jobs.
- **Log Hygiene:** Zero secrets or PII leaked into stdout/stderr. All logs formatted as structured JSON with `requestId`, `timestamp`, `service`, and `logLevel`.

---

## 4. Disaster Recovery & Backup Integrity

- **Automated Backup & Restore Harness (`scripts/db-backup-restore-drill.ts`):**
  - Connects to native PostgreSQL 18.
  - Takes a transactional schema and data snapshot.
  - Validates sequence numbers, table row counts, and referential integrity against baseline.
  - Simulates restoration and validates zero data truncation.
