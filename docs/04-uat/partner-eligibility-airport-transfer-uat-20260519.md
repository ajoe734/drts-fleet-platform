# Partner Eligibility / Airport Transfer UAT — 2026-05-19

**Task:** `PRT-UAT-001`
**Owner:** `Codex2`
**Reviewer:** `Codex`
**Date:** `2026-05-19`
**Primary evidence:** `TST-E2E-007-PRT`, `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`
**Workflow family:** `WF-PRT-001`
**Artifact status:** `review-ready`
**Overall read:** `PASS (static evidence)` with live issuer proof still `EXTERNAL-GATED`

## 1. Executive Summary

This report formalizes the UAT read for Phase 1 partner eligibility and airport
transfer intake. The repo now has a named end-to-end chain for partner entry
resolution, eligibility verification, airport-transfer booking creation,
dispatch handoff, driver completion, and invoice propagation via
`tests/e2e/E2E-007-partner-airport-transfer.sh`.

The repo also has an explicit operator runbook for non-happy-path eligibility
outcomes. `manual_review` is a hold state requiring offline issuer evidence or
sponsor confirmation, while `ineligible` must not be reframed as a transient
retry case.

The correct gate read is therefore:

- `WF-PRT-001` is `PASS (static evidence)`.
- Repo-local evidence names both the positive path and the operator-controlled
  negative path.
- Real issuer sandbox/live proof remains `EXTERNAL-GATED` under `EXT-001`; this
  document does not claim live bank/issuer activation.

## 2. Evidence Baseline

| Evidence family | Current anchor | Read | Notes |
| --- | --- | --- | --- |
| Happy-path partner chain | `tests/e2e/E2E-007-partner-airport-transfer.sh` | `STATIC EVIDENCE` | Verifies entry resolution, eligibility, booking read-back, dispatch, trip completion, and invoice propagation. |
| UAT checklist anchors | `docs/04-uat/phase1-uat-checklist.md` (`TP-003`, `TP-030` to `TP-032`) | `STATIC EVIDENCE` | Names the booking happy path plus bootstrap and inactive-entry negative gates. |
| Manual-review operator lane | `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` | `STATIC EVIDENCE` | Defines `manual_review` and `ineligible` handling; explicitly forbids releasing benefit trips on unresolved reviews. |
| Contract and persistence model | `docs/02-architecture/phase1-issuer-eligibility-integration-contract-20260429.md` | `STATIC EVIDENCE` | Names contract snapshot, retry/fallback behavior, sensitive-data rules, and persisted verification fields. |
| Workflow-family release language | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` (`WF-PRT-001`) | `STATIC EVIDENCE` | Binds this family to `PASS (static evidence)` and forbids overclaiming live issuer closure. |
| Live issuer activation gate | `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` | `EXTERNAL-GATED` | Missing issuer contract authority, credentials, approved fixtures, timeout confirmation, business sign-off, and security approval. |

## 3. Scenario Matrix

| ID | Flow | Expected read | Evidence anchor |
| --- | --- | --- | --- |
| `PRT-01` | Partner entry resolves as `credit_card_airport_transfer` with eligibility enabled | `PASS (static evidence)` | `E2E-007` leg 1.1 |
| `PRT-02` | Eligibility verify returns `eligible`, non-empty `eligibilityVerificationId`, and non-empty `benefitReference` | `PASS (static evidence)` | `E2E-007` leg 1.2 |
| `PRT-03` | Eligibility detail read-back preserves `partnerEntrySlug` and `benefitReference` | `PASS (static evidence)` | `E2E-007` leg 1.3 |
| `PRT-04` | Tenant airport-transfer booking read-back preserves `partnerEntrySlug`, `eligibilityVerificationId`, `benefitReference`, and optional `issuerAuthorizationRef` | `PASS (static evidence)` | `E2E-007` leg 2.2 |
| `PRT-05` | Ops can dispatch and assign the partner-backed order into driver execution | `PASS (static evidence)` | `E2E-007` leg 3 |
| `PRT-06` | Driver completes the trip and downstream invoice retains partner-airport channel metadata and the same `benefitReference` | `PASS (static evidence)` | `E2E-007` later legs + script pass criteria |
| `PRT-07` | Retry exhaustion or issuer timeout lands in `manual_review` and blocks benefit release until offline evidence/sponsor confirmation exists | `PASS (static evidence)` | manual-review runbook + issuer contract timeout/fallback baseline |
| `PRT-08` | Ineligible or inactive partner entry does not bootstrap/release the benefit flow and keeps reason handling explicit | `PASS (static evidence)` | `TP-032`, manual-review runbook outcome matrix |

## 4. UAT Interpretation

### 4.1 Happy path

- `E2E-007` defines the full surface chain as:
  `Partner ingress -> Tenant Portal -> Ops Console -> Driver App -> Tenant Billing`.
- The script records the continuity chain:
  `partnerEntrySlug -> eligibilityVerificationId -> benefitReference -> bookingId -> orderId -> dispatchJobId -> taskId -> invoiceId`.
- Its pass criteria require the partner entry subtype,
  eligibility success, booking read-back preservation, driver completion, and
  invoice-line propagation of the same `benefitReference`.

### 4.2 Manual review and ineligible handling

- The runbook defines `manual_review` for retry exhaustion and issuer timeout.
- `manual_review` is not approval. Operators must hold dispatch or settlement
  release until offline issuer evidence or sponsor confirmation is collected.
- `ineligible` means the presented card/program does not qualify, or the issuer
  returned an explicit denial. The case must not be reframed as a transient
  retry if the backend reason code says otherwise.
- Queue interpretation stays explicit through `attemptCount`,
  `latestAttemptStatus`, `manualFallbackRequestedBy`, and the persisted
  `eligibilityVerificationId` audit handle.

### 4.3 Sensitive-data and provenance guardrails

- The issuer contract requires contract snapshots, adapter attempt history,
  decision source, manual fallback state, card-program metadata,
  `benefitReference`, and `issuerAuthorizationRef` to remain inspectable in the
  persisted verification record.
- Raw `referenceToken` is not allowed to propagate as booking/reporting truth.
  The contract requires `referenceTokenHash` persistence instead and keeps
  reporting/export surfaces masked.
- This means the UAT claim is not merely "booking works"; it is that eligibility
  provenance survives into downstream booking and billing truth without exposing
  raw issuer secrets.

## 5. Negative-Path Coverage

| Scenario | Expected behavior | Anchor |
| --- | --- | --- |
| `TP-030` wrong tenant scope | Reject bootstrap with `TENANT_SCOPE_MISMATCH`; no session issued | `docs/04-uat/phase1-uat-checklist.md` |
| `TP-031` suspended tenant user | Reject bootstrap with `TENANT_USER_SUSPENDED` | `docs/04-uat/phase1-uat-checklist.md` |
| `TP-032` inactive partner entry | Reject bootstrap with `PARTNER_ENTRY_INACTIVE`; audit written | `docs/04-uat/phase1-uat-checklist.md` |
| Issuer timeout / rate-limit / unavailable | Retry per contract policy, then land in `manual_review` after exhaustion | issuer contract + `EXT-001` timeout fallback rule |
| Explicit ineligible decision | Keep benefit-sponsored service blocked; route to non-benefit lane or reject | manual-review runbook outcome matrix |

## 6. External-Gated Boundaries

This UAT report does **not** claim:

- real issuer or bank sandbox credentials are configured
- issuer-approved eligible/ineligible/expired/timeout fixture values were run
- live issuer timeout/backoff behavior has been confirmed against bank guidance
- manual-review fallback has sponsor/issuer business sign-off for release
- security/compliance sign-off for live sensitive-data handling is complete

Those inputs remain blocked by `EXT-001-BLK-001` through `EXT-001-BLK-006` in
`support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`.

## 7. Repo-Local Verification Run

The following checks were executed for this task:

| Command | Result | Purpose |
| --- | --- | --- |
| `bash -n tests/e2e/E2E-007-partner-airport-transfer.sh tests/e2e/run-e2e.sh` | `PASS` | Shell syntax sanity for the named partner UAT path |
| `./tests/e2e/run-e2e.sh --suite 007 --dry-run` | `PASS` | Confirms the E2E harness still registers the `007` scenario in this workspace |
| `git diff --check` | `PASS` | Whitespace / patch sanity for the doc change |

No live issuer sandbox or production verification was run in this task. That
would require the external inputs tracked by `EXT-001`.

## 8. Closeout Read

`PRT-UAT-001` is satisfied by this artifact as a UAT formalization of the
partner eligibility / airport transfer flow. The release-language outcome
remains:

- `WF-PRT-001`: `PASS (static evidence)`
- Live issuer activation: `EXTERNAL-GATED`

That wording must remain explicit in any downstream wave closeout or release
summary.
