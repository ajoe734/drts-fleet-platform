# Phase 1 Issuer Eligibility Integration Contract

Status: implemented contract baseline for `OPX-IN-002`  
Date: 2026-04-29  
Scope: `packages/contracts`, `apps/api/src/modules/tenant-partner`

## Purpose

This document formalizes the issuer / bank eligibility contract that sits
between partner ingress and downstream booking truth for
`credit_card_airport_transfer` partner programs.

The repo now exposes a machine-readable contract snapshot on each partner entry
and each persisted eligibility verification record. Live external sandbox
evidence remains gated by issuer / bank prerequisites, but the runtime
structure, failure model, and sensitive-data rules are no longer implicit.

## Contract Surface

Each eligible partner entry now derives a
`PartnerEligibilityIntegrationContractRecord` with:

- `adapterCode` and `adapterVersion`
- `adapterKind`
- `eligibilityMode`
- `decisionTtlSeconds`
- `retryPolicy`
- `manualFallbackPolicy`
- `sensitiveDataPolicy`
- operator-facing notes

Each verification record now snapshots:

- the contract used at verification time
- adapter attempt history
- decision source
- manual fallback state
- card program code, benefit reference, and issuer authorization reference

## Adapter Matrix

| Eligibility mode     | Adapter code                 | Adapter kind              | Decision source           | Default TTL |
| -------------------- | ---------------------------- | ------------------------- | ------------------------- | ----------- |
| `bank_card_inline`   | `issuer_bank_card_inline_v1` | `issuer_card_lookup`      | `issuer_realtime`         | 30 minutes  |
| `reference_required` | `issuer_reference_lookup_v1` | `issuer_reference_lookup` | `issuer_reference_lookup` | 30 minutes  |

Current repo adapters are contract-complete stubs. They define the runtime seam
and persistence shape now, while live upstream evidence stays external-gated.

## External Activation Gate

`EXT-001` records the live issuer / bank activation blockers in
`support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`. Production wording is not allowed until the
following inputs are attached:

- issuer-approved API contract and endpoint authority
- sandbox credentials, secret path, and network allowlist requirements
- issuer-approved test card / reference matrix for eligible, ineligible, expired, timeout, and
  rate-limited cases
- confirmation that timeout and retry behavior is accepted by the issuer
- business sign-off for manual review fallback and offline evidence handling
- security / compliance approval for sensitive-data masking, hashing, audit visibility, and
  retention

Missing inputs remain `EXTERNAL-GATED`; they must not be summarized as a passed issuer UAT.

## Timeout / Retry / Manual Review Baseline

Default retry policy:

- timeout per adapter attempt: `3000ms`
- max attempts: `3`
- backoff: `250ms`, multiplier `2x`, capped at `1000ms`
- retryable error family: `ISSUER_TIMEOUT`, `ISSUER_RATE_LIMIT`,
  `ISSUER_UNAVAILABLE`, `ISSUER_5XX`

Fallback behavior:

- timeout or retry exhaustion lands the verification in `manual_review`
- `manualFallback.queue` is `ops_console`
- the fallback record must carry `reasonCode`, `requestedBy`, and `notes`
- the runtime seeds `requestedBy=system:auto_fallback` when the system itself
  routes a verification into manual review

## Sensitive Data Governance

The contract aligns to
`docs/02-architecture/phase1-sensitive-data-governance-matrix-20260429.md`.

Enforced rules:

- `referenceToken` is persisted only as `referenceTokenHash`
- raw `referenceToken` must never be copied into `benefitReference`
- derived `benefitReference` and `issuerAuthorizationRef` may remain canonical
  internal join keys, but reporting and export surfaces must mask them
- audit trails record outcome and reason metadata, not raw partner tokens

For `reference_required`, when a caller omits `benefitReference`, the runtime
derives a non-secret reference from the token hash suffix rather than
persisting the raw token.

## Operational Notes

- `manual_review` remains a hard stop for downstream booking creation until an
  operator resolves the eligibility state.
- Contract snapshots are stored with verification records so future adapter
  policy changes do not erase the policy that governed historical decisions.
- `OPX-IN-003` continues to own tenant API / webhook governance; this document
  is limited to issuer / bank eligibility.
