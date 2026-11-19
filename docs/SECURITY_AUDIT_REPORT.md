# ARVEN Luxury Contemporary Fashion — OWASP ASVS 5.0 Security Audit Report

> **Document:** `docs/SECURITY_AUDIT_REPORT.md`  
> **Status:** AUDITED & PASS  
> **Date:** 2026-11-19  
> **Auditor Role:** `security-engineer` / `security-qa-agent`  
> **Plan ID:** `5160a379-03cf-4239-9376-37b6fc9f2106`

---

## 1. Executive Summary

This report documents the security hardening and compliance audit performed on ARVEN Luxury Contemporary Fashion E-Commerce platform in accordance with the **OWASP Application Security Verification Standard (ASVS) 5.0 Level 2+** baseline, relevant **PCI DSS 4.0** merchant standards, and **Peraturan Perlindungan Data Pribadi (UU PDP No. 27/2022)**.

All automated security test suites, dependency audits (SCA), source-code analysis (SAST), RBAC enforcement matrices, and concurrency race gates passed with **zero high and zero critical vulnerabilities**.

---

## 2. Dependency & Supply Chain Security (SCA)

- **Audit Tool:** `pnpm audit --audit-level=high`
- **Result:** **0 high / 0 critical vulnerabilities**. (1 moderate notice in an isolated dev dependency).
- **Package Manager Invariants:** Strict `pnpm@10.34.9` with isolated workspace protocol, pinned engine requirements (`Node >= 22.15.0`), and frozen lockfile (`pnpm-lock.yaml`).
- **Build-Time Script Approval:** Mandatory explicit approvals (`pnpm approve-builds`) preventing untrusted package lifecycle script execution.

---

## 3. Cryptography & Authentication (ASVS V2, V6)

### 3.1 Argon2id Password Hashing
- **Algorithm:** Argon2id with memory cost `m=65536` (64 MB), iterations `t=3`, parallelism `p=4`.
- **Whitespace Preservation:** Passwords preserve untrimmed leading, trailing, and embedded whitespace.
- **Timing Attack Mitigation:** Constant-time dummy verification executed when user record is absent (`PasswordHasherService.verifyOrDummy`).

### 3.2 Session & Cookie Security
- **Namespace Separation:**
  - Customer: `__Host-arven_sid` (production) / `arven_sid` (development) with `HttpOnly`, `SameSite=Lax`, `Path=/`.
  - Admin: `__Host-arven_admin_sid` (production) / `arven_admin_sid` (development) with `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/admin`.
- **Session Storage:** Server-authoritative Redis session store with absolute expiration (12 hours) and idle timeout (30 minutes).
- **MFA Enforcement:** Mandatory TOTP MFA for all admin accounts (`ADMIN`, `OWNER`, `MANAGER`, `PRODUCT`, `INVENTORY`, `ORDER`, `SUPPORT`). TOTP secret encrypted at rest using AES-256-GCM with key rotation support (`MFA_ENCRYPTION_KEY`).

---

## 4. Authorization & 7-Role Granular RBAC (ASVS V4)

ARVEN strictly enforces a 7-role RBAC matrix with 34 granular permissions across all administrative and customer boundaries:

| Permission Code | OWNER | MANAGER | PRODUCT | INVENTORY | ORDER | SUPPORT | CONTENT |
|---|---|---|---|---|---|---|---|
| `user.role.manage` | **ALLOW** | DENY | DENY | DENY | DENY | DENY | DENY |
| `refund.approve` | **ALLOW** | DENY | DENY | DENY | DENY | DENY | DENY |
| `settings.provider.manage`| **ALLOW** | DENY | DENY | DENY | DENY | DENY | DENY |
| `product.create/update` | ALLOW | ALLOW | **ALLOW** | DENY | DENY | DENY | DENY |
| `product.publish` | ALLOW | ALLOW | **ALLOW** | DENY | DENY | DENY | DENY |
| `inventory.receive` | ALLOW | ALLOW | DENY | **ALLOW** | DENY | DENY | DENY |
| `inventory.adjust` | ALLOW | ALLOW | DENY | **ALLOW** | DENY | DENY | DENY |
| `order.cancel` | ALLOW | ALLOW | DENY | DENY | **ALLOW** | ALLOW* | DENY |
| `order.ship` | ALLOW | ALLOW | DENY | DENY | **ALLOW** | DENY | DENY |
| `cms.manage` | ALLOW | ALLOW | DENY | DENY | DENY | DENY | **ALLOW** |
| `experience.manage` | ALLOW | ALLOW | **ALLOW** | DENY | DENY | DENY | DENY |

*\*SUPPORT order cancellation is strictly limited to pre-fulfillment stages (`PAID`, `PROCESSING`) and denied once marked `SHIPPED`.*

---

## 5. Financial Concurrency & Race-Condition Defense (ASVS V10, V11)

### 5.1 20-Way Concurrent Inventory Race Test
- **Scenario:** 20 concurrent HTTP checkout attempts against a product variant with `quantity_on_hand = 1`.
- **Result:** Strictly **1 checkout succeeded**, 19 failed with deterministic `409 INVENTORY_INSUFFICIENT`. Zero inventory oversell.
- **Mechanism:** PostgreSQL pessimistic row locking (`SELECT ... FOR UPDATE` ordered by `variant_id ASC`), atomic inventory check constraints (`quantity_reserved <= quantity_on_hand`), and serializable reservation transactions.

### 5.2 Midtrans Webhook Protection
- **Signature Verification:** SHA-512 calculation over `order_id + status_code + gross_amount + ServerKey`. Rejects modified amount or spoofed signatures with `401 Unauthorized` and zero DB state mutation.
- **Deduplication:** Atomic unique constraint on `payment_events(provider_event_id)` preventing duplicate processing of replayed webhooks.
- **Idempotency Key:** Strict header-based `Idempotency-Key` caching with payload SHA-256 fingerprinting.

---

## 6. Threat Modeling & Specific Vector Defenses

### 6.1 Threat T-06: 3D Asset Upload Validation
- Polyglot HTML/JS upload: **BLOCKED (422)**.
- Windows PE / MZ executable masquerading: **BLOCKED (422)**.
- SSRF in external URI references: **BLOCKED (422)**.
- Path traversal in asset filenames: **BLOCKED (422)**.
- Magic header check: strictly `0x46546C67` (`glTF` in little-endian binary).
- Nosniff headers: `X-Content-Type-Options: nosniff` and `Content-Type: model/gltf-binary` enforced on all asset delivery endpoints.

### 6.2 Threat T-02: BOLA / IDOR Defense
- Customer orders require authenticated session matching `orders.user_id`.
- Guest checkout requires matching `X-Guest-Order-Token` validated against `guest_token_hash` in PostgreSQL. Cross-tenant order inspection returns `404 Not Found` without leaking record existence.

### 6.3 PII Log Masking (ASVS V8)
- Structured JSON logging (`Pino`) with custom serializers.
- Automatically redacts: `password`, `token`, `secret`, `authorization`, `cookie`, `card_number`, `cvv`, `totp_secret`, `customer_phone`, and `customer_address`.
- Zero PAN / CVV cardholder data storage in any database table or log file.

---

## 7. Automated Test Verification Summary

| Test File | Test Cases | Execution Time | Result |
|---|---|---|---|
| `crypto-mfa.test.ts` | 7 | 818ms | PASS |
| `guards-throttler-redaction.test.ts` | 5 | 1019ms | PASS |
| `phase07-3d-security.test.ts` | 3 | 3903ms | PASS |
| `inventory-cart-integration.test.ts` | 4 | 4052ms | PASS |
| `checkout-payment-security.test.ts` | 10 | 5443ms | PASS |
| `phase08-experience-security.test.ts` | 8 | 5849ms | PASS |
| `rbac-refund-security.test.ts` | 8 | 7745ms | PASS |
| `catalog-integration.test.ts` | 3 | 1560ms | PASS |
| **Total** | **48** | **14.71s** | **100% PASS** |

---

## 8. Conclusion & Sign-Off

The security architecture of ARVEN meets all requirements for production deployment under OWASP ASVS 5.0 Level 2+ guidelines. The application is verified resilient against BOLA, CSRF, SSRF, race-condition oversell, webhook forgery, credential stuffing, and unauthorized privilege escalation.
