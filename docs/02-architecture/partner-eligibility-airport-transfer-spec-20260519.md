# Partner Eligibility / Airport Transfer Spec

Status: formalized static-evidence spec for `PRT-SPEC-001`  
Date: 2026-05-19  
Scope: `apps/api/src/modules/tenant-partner`, `apps/api/src/modules/owned-mobility`, `apps/api/src/modules/billing-settlement`, `apps/api/src/modules/reporting-filing`, `apps/ops-console-web`, `tests/e2e/E2E-007-partner-airport-transfer.sh`

## Purpose

This document turns the partner eligibility and airport-transfer flow into a
formal Phase 1 architecture spec for `WF-PRT-001` / `WF-PARTNER-001`.

It consolidates two evidence families:

1. `PRT-VERIF-001` proved that partner eligibility truth is carried from
   verified partner ingress through booking, trip execution, billing, and
   reporting.
2. `EXT-001` proved that real issuer / bank activation is still an explicit
   external gate and may not be reworded as a completed live integration.

The outcome is intentionally availability-first: repo/static proof is named,
operator fallback is named, and live issuer closure remains out of scope until
the external gate packet is cleared.

## Canonical Outcome

The current Phase 1 repo baseline supports the following claims:

- partner-authenticated ingress resolves a bank/program entry and binds
  `partnerId`, `partnerProgramId`, and `partnerEntrySlug` to the request lane
- eligibility verification persists a contract snapshot, decision metadata,
  retry/fallback state, and downstream join keys
- airport-transfer booking creation requires partner-entry context plus an
  eligible verification record when the entry enables eligibility
- the verified partner truth carries into dispatch, driver completion, tenant
  invoice lines, and reporting/review rows
- manual-review and ineligible outcomes have an explicit operator lane and must
  block dispatch/settlement release as benefit-sponsored service

The current repo baseline does not support the following claims:

- no real issuer / bank sandbox or production activation is proven
- no issuer-approved test cards or reference fixtures are attached
- `manual_review` does not equal issuer approval
- `PASS (static evidence)` for `WF-PRT-001` is not the same as live issuer
  closure; `EXT-001` remains binding

## Source Anchors

| Concern | Binding anchor | What it contributes |
| --- | --- | --- |
| Workflow gate read | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` | Names `WF-PRT-001` as `PASS (static evidence)` with `EXT-001` still binding for live issuer proof. |
| Prior verification closeout | `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md` | Records `PRT-VERIF-001` as closed and states that partner eligibility to billing/reporting propagation was verified. |
| Partner entry topology | `docs/02-architecture/phase1-partner-channel-bank-entry-addendum-20260425.md` | Defines partner registry, ingress, eligibility verification, and carry-through fields. |
| Issuer contract seam | `docs/02-architecture/phase1-issuer-eligibility-integration-contract-20260429.md` | Names contract snapshot fields, retry policy, manual fallback, and sensitive-data policy. |
| Manual review lane | `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` | Defines `manual_review` / `ineligible` operator meaning and release-stop rules. |
| End-to-end chain proof | `tests/e2e/E2E-007-partner-airport-transfer.sh` | Verifies entry resolution, eligibility, booking read-back, dispatch/driver completion, and invoice-line propagation. |
| Downstream carry-through tests | `tests/unit/tenant-partner-foundation.test.ts`, `tests/unit/billing-settlement.test.ts`, `tests/unit/reporting-filing.test.ts`, `apps/api/tests/unit/tenant-partner.service.test.ts` | Prove persistence shape, invoice/report carry-through, masking, and evidence/queue redaction rules. |

## Evidence Reconstruction Note

`tenant-governance-wave-closeout-20260514.md` still cites
`support/sidecars/PRT-VERIF-001/` as the original verification sidecar.
That directory is not present in the current tree snapshot available to this
worker. Because machine truth still records the task as closed, this spec treats
the surviving closeout statement plus the still-present E2E/test anchors as the
reviewable evidence chain for `PRT-VERIF-001`.

This means the spec is allowed to formalize the verified runtime shape, but not
to invent sidecar contents that are no longer directly inspectable here.

## Surviving Evidence Map

The formal spec keeps `PRT-VERIF-001` and `EXT-001` as named evidence families
instead of collapsing them into a single happy-path summary.

| Task / evidence family | Surviving anchor | What remains reviewable now |
| --- | --- | --- |
| `PRT-VERIF-001` closeout claim | `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md` §1, §2.3 | Machine-truth closeout statement that the partner eligibility to booking/trip/billing/reporting chain was verified. |
| `PRT-VERIF-001` booking-create gate | `tests/unit/owned-mobility.test.ts` | Positive gate: eligible verification can create a booking; negative gate: airport-transfer partner bookings are rejected without `eligibilityVerificationId`. |
| `PRT-VERIF-001` provenance persistence | `tests/unit/tenant-partner-foundation.test.ts`, `tests/unit/owned-mobility.test.ts` | Verification records persist partner/program/entry provenance and the same anchor survives service reload and booking read-back. |
| `PRT-VERIF-001` downstream carry-through | `tests/e2e/E2E-007-partner-airport-transfer.sh`, `tests/unit/billing-settlement.test.ts`, `tests/unit/reporting-filing.test.ts` | The same partner-benefit anchor continues into dispatch, completion, invoice, and reporting rows. |
| `PRT-VERIF-001` negative path | `apps/api/tests/unit/tenant-partner.service.test.ts`, `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` | `manual_review` and `ineligible` remain explicit stop states with queue/audit/evidence separation; denial cannot be silently turned into eligibility. |
| `EXT-001` external gate | `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`, `docs/02-architecture/phase1-issuer-eligibility-integration-contract-20260429.md` | Live issuer activation still requires external blocker clearance and manual review may not be restated as issuer approval. |

## Architecture Baseline

### 1. Partner ingress and identity binding

Partner airport-transfer programs enter through a canonical partner entry,
typically keyed by `entrySlug` and configured for
`businessDispatchSubtype=credit_card_airport_transfer`.

At minimum, the ingress lane binds:

- `tenantId`
- `partnerId`
- `partnerProgramId`
- `partnerEntrySlug`
- `eligibilityMode`

`tests/e2e/E2E-007-partner-airport-transfer.sh` asserts that resolving
`/partner/entries/:entrySlug` returns the expected tenant/partner/program
identity before any booking is created.

### 2. Eligibility verification contract

Eligibility verification is not just a boolean gate. The persisted verification
record is the durable provenance anchor for the rest of the workflow.

The contract baseline requires:

- contract snapshot fields such as `adapterCode`, `adapterVersion`,
  `adapterKind`, `eligibilityMode`, `decisionTtlSeconds`, `retryPolicy`,
  `manualFallbackPolicy`, and `sensitiveDataPolicy`
- verification fields such as `eligibilityVerificationId`,
  `verificationStatus`, `verificationReasonCode`, `benefitReference`,
  `issuerAuthorizationRef`, `decisionSource`, `attempts`, and fallback metadata
- sensitive-token handling where raw reference tokens are not persisted or
  echoed into public-facing join keys

`tests/unit/tenant-partner-foundation.test.ts` and
`apps/api/tests/unit/tenant-partner.service.test.ts` confirm that:

- eligible and ineligible outcomes both preserve auditable provenance
- reference-token mode stores `referenceTokenHash` instead of raw token data
- queue views are redacted while evidence-detail views retain the evidence-grade
  fields needed for audit and reconciliation

### 3. Booking-creation gate

For airport-transfer partner programs, a booking is only valid when the partner
entry context and the eligibility verification record agree.

The booking truth must preserve at least:

- `partnerEntrySlug`
- `eligibilityVerificationId`
- `benefitReference`
- `issuerAuthorizationRef`
- partner/program identity needed for audit and downstream finance/reporting

The surviving evidence chain for this gate is two-sided:

- `tests/unit/owned-mobility.test.ts` proves the positive create path persists
  partner/program/eligibility provenance onto both the booking and the order.
- The same test file proves the negative path rejects
  `credit_card_airport_transfer` creation when `eligibilityVerificationId` is
  missing; the workflow must fail with
  `ELIGIBILITY_VERIFICATION_REQUIRED` instead of silently creating a benefit
  booking.

`tests/e2e/E2E-007-partner-airport-transfer.sh` verifies that booking read-back
returns the same `partnerEntrySlug`, `eligibilityVerificationId`, and
`benefitReference` that were produced during verification.

This is the explicit booking-create gate anchor that keeps `WF-PRT-001` in
`PASS (static evidence)` rather than reducing it to a dispatch-only claim.

### 4. Dispatch and driver execution

The airport-transfer flow does not end at booking creation. The spec requires
the partner-eligibility truth to remain attached after dispatch assignment and
driver completion so that later billing/reporting surfaces can prove why the
trip belonged to the partner-benefit lane.

`E2E-007` covers:

- dispatch trigger for the created order
- dispatch task discovery/assignment
- driver task acceptance and lifecycle progression
- final completed booking state before invoice generation

### 5. Billing, reporting, and operator review carry-through

The flow is only considered architecturally closed when the same eligibility
provenance is visible downstream.

Provenance persistence is not inferred from one read-back call. The spec relies
on multiple surviving anchors:

- `tests/unit/tenant-partner-foundation.test.ts` proves eligibility
  verification persists partner/program/entry identity and keeps ineligible
  outcomes auditable instead of dropping the record.
- `tests/unit/owned-mobility.test.ts` proves the persisted verification can be
  reused after tenant-partner service reload and still drive booking creation.
- `tests/e2e/E2E-007-partner-airport-transfer.sh` proves the runtime lane keeps
  the same anchor through dispatch and final invoice generation.

Required downstream shape:

- tenant invoice lines keep `partnerEntrySlug`,
  `eligibilityVerificationId`, `benefitReference`, and
  `issuerAuthorizationRef`
- reporting/revenue review rows keep partner/program identifiers and the same
  verification anchor, but mask sensitive references on export/review surfaces
- ops manual-review queue exposes triage-safe hints only; evidence drill-down
  remains separately governed

Evidence:

- `tests/unit/billing-settlement.test.ts` verifies live completed trips generate
  invoice lines with the expected partner/eligibility fields.
- `tests/unit/reporting-filing.test.ts` verifies revenue-summary rows keep the
  partner identifiers while masking `issuerAuthorizationRef` and
  `benefitReference`.
- `apps/api/tests/unit/tenant-partner.service.test.ts` verifies queue redaction
  and evidence-detail access boundaries.

### 6. Negative path and operator hold semantics

`PRT-VERIF-001` is not limited to the eligible happy path. The surviving
negative-path evidence is part of the formal chain:

- `tests/unit/tenant-partner-foundation.test.ts` proves explicit
  `ineligible` outcomes are persisted with a reason code rather than discarded.
- `apps/api/tests/unit/tenant-partner.service.test.ts` proves retry exhaustion
  becomes `manual_review`, manual-review items sort ahead of denials in the ops
  queue, and triage views redact evidence-grade fields while detail views keep
  them for audit.
- The same service test proves ops may approve a `manual_review` case only with
  an explicit offline confirmation reason code, while approving an already
  `ineligible` case is rejected with `ELIGIBILITY_OVERRIDE_REQUIRED`.
- `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` keeps the
  release-stop rule explicit: `manual_review` and `ineligible` both block
  dispatch/settlement release as benefit-sponsored service until the correct
  operator path is completed.

This negative path is the surviving replacement for any no-longer-present
`PRT-VERIF-001` sidecar detail. The spec therefore names the living test and
runbook anchors alongside the historical task id instead of dropping the field
from the formalized chain.

## Phase 1 Flow Contract

| Leg | Required invariant | Current evidence |
| --- | --- | --- |
| Partner entry | Entry resolves to a tenant/partner/program lane configured for airport-transfer eligibility. | `E2E-007` leg 1.1; partner-channel addendum. |
| Eligibility verify | Verification returns durable provenance and contract/fallback metadata. | `E2E-007` leg 1.2-1.3; issuer integration contract; tenant-partner tests. |
| Tenant booking | Booking creation requires a matching eligibility verification, and booking read-back preserves the exact verification anchor and benefit reference. | `E2E-007` leg 2.1-2.2; `tests/unit/owned-mobility.test.ts` positive + negative booking gate coverage. |
| Dispatch / driver | Dispatch and trip completion do not sever partner-benefit provenance. | `E2E-007` legs 3-4 and final completed booking check. |
| Billing / reporting | Invoice/reporting rows continue to expose the partner-benefit lane with correct masking. | `E2E-007` leg 5; billing-settlement and reporting-filing unit tests. |
| Manual review / denial | Retry exhaustion or issuer failure routes to ops hold, explicit denials remain denied, and neither path may be silently converted into benefit release. | manual-review runbook; `apps/api/tests/unit/tenant-partner.service.test.ts`; issuer contract fallback rules. |

## Release-Gate Reading

For v3 blueprint completion, the correct release language is:

- `WF-PRT-001` / `WF-PARTNER-001`: `PASS (static evidence)`
- live issuer activation: `EXTERNAL-GATED`

That wording is mandatory because the repo proves architecture, persistence,
downstream propagation, and operator fallback, but it does not prove external
issuer acceptance.

## External Gate Binding

`EXT-001` remains the binding non-claim packet for real bank / issuer
activation.

Before any live/sandbox issuer-coverage claim is allowed, the following blocker
families must be cleared:

1. issuer / bank API contract authority
2. sandbox credentials and allowlist requirements
3. approved eligible/ineligible/timeout fixture matrix
4. timeout/retry behavior confirmation
5. manual-review fallback business sign-off
6. sensitive-data handling and retention approval

Until then:

- repo-local fallback remains `manual_review`
- benefit bookings must not be released on timeout exhaustion alone
- reviewers must not convert static proof into live-integration wording

## Reviewer Checklist

- confirm the spec names both `PRT-VERIF-001` and `EXT-001` instead of only the
  happy path
- confirm the flow contract covers ingress, verification, booking, dispatch,
  billing, and reporting
- confirm manual-review and redaction rules are explicit
- confirm release language stops at `PASS (static evidence)` and keeps
  `EXT-001` binding for live issuer proof

## References

- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md`
- `docs/02-architecture/phase1-partner-channel-bank-entry-addendum-20260425.md`
- `docs/02-architecture/phase1-issuer-eligibility-integration-contract-20260429.md`
- `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`
- `tests/e2e/E2E-007-partner-airport-transfer.sh`
- `tests/unit/tenant-partner-foundation.test.ts`
- `tests/unit/billing-settlement.test.ts`
- `tests/unit/reporting-filing.test.ts`
- `apps/api/tests/unit/tenant-partner.service.test.ts`
