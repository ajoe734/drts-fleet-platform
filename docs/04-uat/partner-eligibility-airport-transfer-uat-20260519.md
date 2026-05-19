# Partner Eligibility / Airport Transfer UAT

**Status:** draft  
**Task:** `PRT-UAT-001`  
**Owner:** `Codex`  
**Reviewer:** `Claude2`  
**Created:** `2026-05-19`

## 1. Purpose

This document defines the UAT scenario pack for the Phase 1 partner eligibility
/ airport-transfer flow accepted as `WF-PARTNER-001`.

Some existing evidence still carries legacy `PRT` naming:

- shell E2E task: `TST-E2E-007-PRT`
- script: `tests/e2e/E2E-007-partner-airport-transfer.sh`
- older workflow matrix row: `WF-PRT-001`

This UAT doc follows the accepted v3 naming (`WF-PARTNER-001`) while keeping
those legacy evidence anchors explicit.

## 2. Scope

The covered chain is:

```text
partner entry login
→ eligibility verify by cardLast4 or referenceToken
→ eligible / ineligible / manual_review outcome
→ airport-transfer booking creation
→ dispatch assignment
→ driver completion
→ invoice / reporting read-back
→ operator review queue and audit handling
```

This document is a scenario and evidence map. It is not a claim that real
issuer sandbox or live issuer approval is complete.

## 3. Evidence Posture

| Evidence area | Primary anchor | What it proves | Evidence grade |
| --- | --- | --- | --- |
| Cross-surface happy path | `tests/e2e/E2E-007-partner-airport-transfer.sh` | Eligible verification preserves `partnerEntrySlug`, `eligibilityVerificationId`, `benefitReference`, optional `issuerAuthorizationRef`, dispatch, driver completion, and invoice propagation. | `REPO-LOCAL VERIFIED` |
| Manual-review operator lane | `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` | `manual_review` and `ineligible` outcomes have explicit operator meaning and do not silently release a benefit booking. | `STATIC EVIDENCE` |
| Queue read / manual resolution API | `tests/unit/client-integration.test.ts` | Ops queue surfaces `manual_review`, retry counts, fallback metadata, and explicit review resolution calls. | `STATIC EVIDENCE` |
| Eligibility outcome and sensitive-data handling | `tests/unit/tenant-partner-foundation.test.ts` | Eligible / ineligible outcomes are explicit; reference-token flow derives `benefitReference` and `issuerAuthorizationRef` without echoing the raw token. | `STATIC EVIDENCE` |
| External live-issuer gate | `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` | Real issuer contract, credentials, fixtures, timeout confirmation, sponsor sign-off, and data-retention approval remain open. | `EXTERNAL-GATED` |

Overall workflow read remains aligned with
`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`:
repo/static proof is present, while real issuer activation stays external-gated
under `EXT-001`.

## 4. Preconditions And Test Data

### Required actors

- `partner_api_key` identity bound to the selected partner entry
- `tenant_admin` for booking and invoice read-back
- `ops_user` for dispatch and eligibility review queue checks
- `driver_user` for trip completion

### Suggested seed entries

| Entry slug | Mode | Suggested input | Expected outcome |
| --- | --- | --- | --- |
| `bank-demo-beta-airport` | `reference_required` | unique `referenceToken` | `eligible` |
| `bank-demo-alpha-airport` | `bank_card_inline` | `cardLast4=2468` | `eligible` |
| `bank-demo-alpha-airport` | `bank_card_inline` | `cardLast4=1357` | `ineligible` |

### Shared assertions

- `business_dispatch_subtype="credit_card_airport_transfer"`
- `eligibilityVerificationId` persists from verification into booking and invoice
- `benefitReference` persists from verification into booking and invoice
- `manual_review` is an exception-hold state, not implicit approval
- raw `referenceToken` must not be echoed back as `benefitReference`

## 5. Scenario Matrix

| ID | Scenario | Priority | Primary evidence | Classification |
| --- | --- | --- | --- | --- |
| `PRT-UAT-01` | Eligible partner verification completes the booking → dispatch → driver → invoice chain | P1 | `TST-E2E-007-PRT` / `tests/e2e/E2E-007-partner-airport-transfer.sh` | `REPO-LOCAL VERIFIED` |
| `PRT-UAT-02` | Airport pickup without flight number is rejected | P1 | `02_acceptance_scenarios_gherkin.md` `SC-010`; `docs/04-uat/phase1-uat-scenarios.md` `TP-004` | `STATIC EVIDENCE` |
| `PRT-UAT-03` | Ineligible card program stops benefit-backed flow with explicit reason code | P1 | `tests/unit/tenant-partner-foundation.test.ts` | `STATIC EVIDENCE` |
| `PRT-UAT-04` | Issuer timeout / retry exhaustion lands in ops manual-review queue | P1 | `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`; `tests/unit/client-integration.test.ts` | `STATIC EVIDENCE` |
| `PRT-UAT-05` | Reference-token flow masks sensitive input while preserving downstream audit joins | P1 | `tests/unit/tenant-partner-foundation.test.ts`; `tests/e2e/E2E-007-partner-airport-transfer.sh` | `STATIC EVIDENCE` |

## 6. Detailed Scenarios

### `PRT-UAT-01` Eligible full chain

**Goal**

Prove that an eligibility-approved partner airport-transfer request preserves
its identity and benefit references across booking, dispatch, driver
completion, and invoice output.

**Suggested execution**

1. Resolve a partner entry via `GET /partner/entries/:entrySlug`.
2. Verify eligibility via `POST /partner/eligibility/verify`.
3. Read back the verification via `GET /partner/eligibility/:eligibilityVerificationId`.
4. Create the booking via `POST /tenant/bookings`.
5. Read back the booking via `GET /tenant/bookings/:bookingId`.
6. Trigger dispatch via `POST /orders/:orderId/dispatch`.
7. Assign a driver via `POST /dispatch/assign`.
8. Drive the task lifecycle through accept, depart, arrive, start, and complete.
9. Re-read the completed booking.
10. Generate and read the tenant invoice.

**Expected**

- partner entry resolves to
  `businessDispatchSubtype="credit_card_airport_transfer"`
- eligibility response returns `verificationStatus="eligible"`
- `eligibilityVerificationId` is non-empty
- `benefitReference` is non-empty
- if `issuerAuthorizationRef` is returned, the same value survives read-back
- booking preserves `partnerEntrySlug`, `eligibilityVerificationId`, and
  `benefitReference`
- dispatch produces a `dispatchJobId`
- driver task can be completed without breaking the chain
- final booking status is `completed`
- invoice line preserves:
  - `channelKey="partner_airport"`
  - `partnerEntrySlug`
  - `eligibilityVerificationId`
  - `benefitReference`
  - optional `issuerAuthorizationRef`

**Primary evidence**

- `tests/e2e/E2E-007-partner-airport-transfer.sh`
- `docs/04-uat/fbp-014a-e2e-matrix.md`

### `PRT-UAT-02` Pickup without flight number

**Goal**

Confirm that airport pickup validation rejects incomplete flight data before a
formal order is created.

**Suggested execution**

1. Attempt an airport-transfer booking with `direction="pickup"`.
2. Omit `flightNo`.
3. Submit the booking request.

**Expected**

- backend returns `FLIGHT_NO_REQUIRED`
- no formal order is created
- the flow remains at validation rather than moving into dispatch

**Primary evidence**

- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` `SC-010`
- `docs/04-uat/phase1-uat-scenarios.md` `TP-004`

### `PRT-UAT-03` Ineligible card program

**Goal**

Prove that an ineligible benefit program is represented as an explicit denial,
not as a transient retry or an eligible booking.

**Suggested execution**

1. Verify eligibility for `bank-demo-alpha-airport` with a known non-matching
   card suffix such as `cardLast4=1357`.
2. Observe the verification response before any booking attempt proceeds.

**Expected**

- `verificationStatus="ineligible"`
- `verificationReasonCode="CARD_PROGRAM_NOT_ELIGIBLE"`
- downstream benefit-backed booking release does not proceed as an eligible
  case
- operator/error messaging remains aligned to explicit denial semantics

**Primary evidence**

- `tests/unit/tenant-partner-foundation.test.ts`
- `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`

### `PRT-UAT-04` Timeout / retry exhaustion manual-review lane

**Goal**

Confirm that issuer degradation or timeout exhaustion opens a visible
manual-review queue item and does not masquerade as approval.

**Suggested execution**

1. Simulate or stub an issuer path that exhausts retries.
2. Read the queue via `GET /api/ops/partner/eligibility/reviews`.
3. Inspect the queue item before any review decision.
4. If offline issuer evidence exists, submit an explicit review decision via
   `POST /api/ops/partner/eligibility/reviews/resolve`.

**Expected**

- queue item is listed ahead of denials as `verificationStatus="manual_review"`
- `verificationReasonCode="ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED"`
- `attemptCount=3`
- `latestAttemptStatus="error"`
- `manualFallback.requestedBy="system:auto_fallback"`
- request hints expose non-secret values only, such as `flightNo`
- no dispatch or settlement release is implied until offline evidence is
  explicitly reviewed
- approving a review is an auditable operator action, not an automatic issuer
  success signal

**Primary evidence**

- `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`
- `tests/unit/client-integration.test.ts`
- `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`

### `PRT-UAT-05` Sensitive data masking and downstream joins

**Goal**

Verify that reference-token-based partner flows keep the join keys needed by
billing/reporting without storing or echoing raw sensitive input.

**Suggested execution**

1. Verify a `reference_required` entry such as `bank-demo-beta-airport`.
2. Inspect the verification output and the persisted downstream read-back.
3. Confirm booking/invoice joins use derived references rather than the raw
   token.

**Expected**

- eligible reference-token verification returns derived identifiers
  (`benefitReference`, `issuerAuthorizationRef`)
- `referenceTokenHash` is present with a `sha256:` prefix where the contract
  exposes it
- raw `referenceToken` is not echoed back as `benefitReference`
- downstream booking and invoice checks still preserve the derived
  `benefitReference` and `eligibilityVerificationId`

**Primary evidence**

- `tests/unit/tenant-partner-foundation.test.ts`
- `tests/e2e/E2E-007-partner-airport-transfer.sh`

## 7. Evidence Capture Checklist

For a human or sandbox UAT pass, record at minimum:

- entry slug and eligibility mode used
- verification response showing `eligibilityVerificationId`
- booking read-back showing `partnerEntrySlug` and `benefitReference`
- dispatch assignment evidence showing `dispatchJobId` or `taskId`
- completed booking read-back
- invoice line read-back with `channelKey="partner_airport"`
- manual-review queue screenshot or payload for degraded-path runs
- audit handle or operator note keyed by `eligibilityVerificationId`

## 8. Release Language And Non-Claims

Allowed:

- "Repo-local partner eligibility and airport-transfer continuity is proven by `TST-E2E-007-PRT`."
- "Manual review is visible and auditable as a separate operator lane."
- "`eligibilityVerificationId` and `benefitReference` propagate into booking and invoice evidence."

Not allowed:

- "Real issuer or bank activation is complete."
- "Manual review equals issuer approval."
- "This UAT closes `EXT-001`."
- "The flow has live issuer coverage" unless issuer-provided credentials,
  fixtures, timeout confirmation, and sponsor/security approvals are attached.

## 9. Exit Read

This UAT pack satisfies the v3 documentation requirement for
`docs/04-uat/partner-eligibility-airport-transfer-uat-20260519.md` by naming:

- the automated eligible full-chain path (`E2E-007-PRT`)
- the negative validation path (`FLIGHT_NO_REQUIRED`)
- the explicit ineligible reason path
- the timeout / retry-exhaustion manual-review path
- the sensitive-data and downstream-join assertions

The remaining live-issuer claim stays explicitly blocked by `EXT-001` /
`PARTNER-ELIG-LIVE-001`.
