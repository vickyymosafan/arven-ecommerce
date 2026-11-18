# ARVEN Phase 05 Security QA Report

> **Plan ID:** `7046df9d-13df-413d-b6ae-2ebaaaa6ddd9`  
> **Task ID:** `9ddf9306-804d-408d-b3c9-67ec5ebf0afe` (`security-qa-agent`)  
> **Checkpoint:** `security`  
> **Executed (UTC):** 2026-11-18  
> **Verdict:** `PASS` (no Critical/High/Medium findings; 2 low advisories)

> **Independence disclosure:** The QA subagents were blocked by `RESOURCE_EXHAUSTED (429)` (reset about 119h), and the user approved running the remaining QA steps in the orchestrator. This report was produced by the orchestrator, not by an independent QA subagent. The orchestrator did not write the Phase 05 application code, but the `T-02..T-05` test file was written by the `security-engineer` subagent and is re-run here, not re-authored. Treat this as lower assurance than a separate-agent audit.

## 1. Automated checks (run in this session)

| Check | Command | Result |
|---|---|---|
| Route auth metadata | `pnpm --filter @arven/api check:auth-metadata` | exit `0`, `Route auth metadata check passed with zero violations.` |
| API suite vs live PostgreSQL 18 + Memurai | `pnpm --filter @arven/api test` | `13` test files, `66 / 66` tests passed (includes `test/security/checkout-payment-security.test.ts`, `10` tests, and `test/integration/checkout-orders-payments.test.ts`, `2` tests) |
| Dependency audit | `pnpm audit --prod --audit-level high` | `No known vulnerabilities found` |

## 2. Static source scan (`apps/api/src`, `apps/worker/src`, `apps/storefront/src`, `packages/validators/src`)

| Control | Finding |
|---|---|
| `@SkipCsrf()` scope | Only one use: `payments.controller.ts:95` (webhook). The checker also rejects it on any non-`/webhook` path. |
| Raw unsafe SQL (`queryRawUnsafe`, `executeRawUnsafe`) | `0` occurrences |
| Constant-time comparison | `timingSafeEqual` used in `token-crypto.service.ts` (`timingSafeEqualUtf8`), `order-access.service.ts:106` (guest token hash compare) and `payment.provider.ts:212` (webhook SHA512 compare) |
| Card data (`cvv`, `cvc`, `card_number`, `pan`) | `0` occurrences in storefront, API and validators |
| `console.log` / `console.debug` in `src` | `0` occurrences |
| Tracked secrets (`.env`, `*.pem`, `*.key`) | none in `git ls-files` |
| `LocalStubPaymentAdapter` in production | constructor throws when `NODE_ENV === 'production'` (`payment.provider.ts:472-473`), and every method calls `assertNonProduction()` |

## 3. Live probes against the running API (`http://127.0.0.1:4000/api/v1`)

| Request | Response |
|---|---|
| `POST /payments/webhooks/midtrans` with forged `signature_key` | `401 WEBHOOK_SIGNATURE_INVALID`, `Cache-Control: no-store` |
| `POST /payments/webhooks/stripe` | `400 VALIDATION_ERROR` (unsupported provider rejected) |
| `GET /orders/ARV-20260101-AAAAAA` with no credentials | `401 AUTHENTICATION_REQUIRED`, `Cache-Control: no-store` |
| `GET /orders` with no session | `401 UNAUTHORIZED` |
| `POST /checkout/orders` and `POST /checkout/quote` without CSRF token | `403 CSRF_INVALID` (fail closed) |

## 4. Threat coverage (from the `66/66` suite, re-run here)

`T-02` IDOR and guest token, `T-03` mass assignment and price re-read, `T-04` 20-way oversell, `T-05` webhook forgery, 3x concurrent replay, amount mismatch and late settlement, `T-08` log and payload redaction. The previous per-test results are recorded in the `security-engineer` evidence `7abc52f4-d272-4b8d-8367-13ce2ecce9ae`; this run only confirms they still pass.

## 5. Advisories (non-blocking)

- `SEC-05-001` (Low): `GET /orders` returns `401` without a `Cache-Control` header (other order and payment routes set `no-store`). The body is an error with no data.
- `SEC-05-002` (Low): The Phase 05 browser QA reports noted `403 -> 200` CSRF retry right after login on `POST /cart/merge` (inherited from Phase 04, handled by the client retry).

## 6. Not covered

No external penetration test, no SAST tool beyond the grep scans above, no secret-scanner binary, and no Midtrans sandbox call (the `local_stub` adapter was used, so the live Midtrans HTTP path is untested here).
