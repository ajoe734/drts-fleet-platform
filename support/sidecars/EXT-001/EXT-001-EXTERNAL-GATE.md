# EXT-001 — Real Bank / Issuer Eligibility External Gate

**Task:** `EXT-001`  
**Owner:** Gemini2  
**Reviewer:** Codex  
**Status:** reviewer-corrected gate packet  
**Created:** 2026-05-01

## Purpose

This packet turns the live issuer portion of `WF-PARTNER-001` from an implicit productization
blocker into an auditable external gate. The repo has the contract seam, persistence model, retry/manual-review
path, and operator queue. It does not yet have live issuer credentials, issuer-approved sandbox
fixtures, or sponsor sign-off.

## Evidence Anchors

| Evidence family        | Current anchor                                                                                | Gate read      |
| ---------------------- | --------------------------------------------------------------------------------------------- | -------------- |
| Contract fields        | `docs/02-architecture/phase1-issuer-eligibility-integration-contract-20260429.md`             | repo-complete  |
| Manual fallback        | `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`                               | repo-complete  |
| Productization blocker | `docs/03-runbooks/master-system-closeout-checklist.md` D-4a                                   | external-gated |
| Runtime implementation | `packages/contracts`, `apps/api/src/modules/tenant-partner`, `apps/ops-console-web` contracts | repo/static    |

## Required Contract Fields

Every issuer adapter activation must keep the persisted contract snapshot fields named in the
contract document:

| Field                  | Required evidence before live activation                                  |
| ---------------------- | ------------------------------------------------------------------------- |
| `adapterCode`          | Issuer-specific adapter code registered and mapped to the issuing bank.   |
| `adapterVersion`       | Versioned adapter release or sandbox profile.                             |
| `adapterKind`          | One of `issuer_card_lookup` or `issuer_reference_lookup`.                 |
| `eligibilityMode`      | One of `bank_card_inline` or `reference_required`.                        |
| `decisionTtlSeconds`   | Issuer-approved TTL, default currently `1800` seconds.                    |
| `retryPolicy`          | Timeout/retry/backoff values approved for issuer sandbox and production.  |
| `manualFallbackPolicy` | Operator queue, reason codes, and sponsor/issuer evidence requirements.   |
| `sensitiveDataPolicy`  | Masking/hash rules for card/reference data and audit export constraints.  |
| operator-facing notes  | Traditional Chinese ops copy for eligible, ineligible, and manual review. |

## External Blocker Records

| Blocker ID        | Missing input                                  | Required evidence                                                                 | Owner to confirm              | Release effect                            |
| ----------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------- |
| `EXT-001-BLK-001` | Issuer / bank API contract authority           | Signed or otherwise approved endpoint, schema, status-code, and SLA contract.     | Bank / issuer integration PM  | No production issuer activation.          |
| `EXT-001-BLK-002` | Sandbox credentials and network allowlist      | Sandbox client id/secret or token, mTLS/IP allowlist if required, secret path.    | Bank / issuer technical owner | No live sandbox proof.                    |
| `EXT-001-BLK-003` | Allowed test card / reference matrix           | Issuer-approved fixtures for eligible, ineligible, expired, timeout, rate-limit.  | Bank / issuer QA owner        | UAT cannot claim issuer coverage.         |
| `EXT-001-BLK-004` | Timeout and retry behavior confirmation        | Evidence that `3000ms`, `3` attempts, and backoff behavior match issuer guidance. | Bank / issuer technical owner | Manual fallback remains repo-only.        |
| `EXT-001-BLK-005` | Manual-review fallback business sign-off       | Sponsor/issuer sign-off that offline evidence may release a held booking.         | Product + ops + sponsor       | Manual review cannot imply approval.      |
| `EXT-001-BLK-006` | Sensitive-data handling and retention approval | Data masking, token hashing, audit visibility, and retention approval.            | Security / compliance         | No production credential or card rollout. |

## Allowed Test Fixture Matrix

The exact card/reference values must come from the issuer. Until then, only fixture categories are
approved:

| Fixture category       | Expected outcome        | Required assertion                                                  |
| ---------------------- | ----------------------- | ------------------------------------------------------------------- |
| eligible card          | `eligible`              | `decisionSource=issuer_realtime`, authorization/reference captured. |
| ineligible card        | `ineligible`            | Reason code propagated; no benefit booking released.                |
| expired / revoked card | `ineligible`            | Error copy does not present retry as a remedy.                      |
| rate-limited issuer    | retry then review/deny  | Retry count and final reason recorded.                              |
| issuer timeout         | `manual_review`         | `manualFallbackRequestedBy=system:auto_fallback`.                   |
| malformed reference    | `ineligible` or `error` | Raw reference never appears in logs, audit, exports, or UI.         |

## Timeout Fallback Rule

The default repo policy remains:

- Attempt timeout: `3000ms`.
- Max attempts: `3`.
- Backoff: `250ms`, `2x` multiplier, cap `1000ms`.
- Retryable family: `ISSUER_TIMEOUT`, `ISSUER_RATE_LIMIT`, `ISSUER_UNAVAILABLE`, `ISSUER_5XX`.
- Exhaustion result: `manual_review`, not `eligible`.

`manual_review` is an exception-hold state. It means an operator must collect offline issuer or
sponsor evidence. It does not mean the issuer approved the benefit.

## Acceptance Mapping

| Acceptance item                                    | Evidence                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| issuer contract fields named                       | Contract field list above and architecture contract document.         |
| credential and sandbox requirements named          | `EXT-001-BLK-001` and `EXT-001-BLK-002`.                              |
| allowed test cards and timeout fallback named      | Fixture matrix and timeout fallback rule above.                       |
| missing external inputs become blocker records     | `EXT-001-BLK-001` to `EXT-001-BLK-006`.                               |
| manual review fallback not overclaimed as approval | Manual fallback rule above plus manual-review runbook operator rules. |

## Reviewer Decision Language

Allowed:

- "The repo has an issuer eligibility contract and manual-review fallback."
- "Real issuer activation remains `EXTERNAL-GATED` on `EXT-001-BLK-*` inputs."

Not allowed:

- "Bank eligibility is production-ready."
- "Manual review equals issuer approval."
- "Test cards passed" unless issuer-provided fixtures and logs are attached.
