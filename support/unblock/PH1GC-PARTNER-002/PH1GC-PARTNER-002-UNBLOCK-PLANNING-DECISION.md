# PH1GC-PARTNER-002 Unblock Planning Decision

## Scope

- Task: `PH1GC-PARTNER-002-UNBLOCK-PLANNING-DECISION`
- Parent: `PH1GC-PARTNER-002`
- Owner: `Codex`
- Reviewer: `Codex2`
- Decision date: `2026-05-22`

## Diagnosis

`PH1GC-PARTNER-002` was blocked by a missing field-level contract decision in
the canonical `WF-PARTNER-001` spec.

The directive requires `flight / terminal / luggage` rules for
`credit_card_airport_transfer`, but the existing partner spec only covered
airport resolution, subsidy timing, and eligibility linkage. The repo already
had the fields and some behavior scattered across contracts, UAT, and runbooks,
but the authoritative partner spec did not say which fields affect eligibility
versus booking-only fulfillment context.

## Decision

The canonical decision is now recorded in
`docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
§6:

1. `direction` remains part of the partner eligibility request context.
2. `flightNo` is required only for `direction = pickup`; missing pickup flight
   number is a pre-booking rejection, not a post-booking exception.
3. `terminal` and `luggageCount` are booking-scoped travel-detail fields. They
   must persist onto booking/request/manual-review context, but they do not
   change issuer eligibility classification by themselves.
4. Updating `terminal` or `luggageCount` does not mint a new
   `eligibilityVerificationId` and does not, by itself, trigger
   re-verification.

## Scope Cut And Routing

- `PH1GC-PARTNER-002` is scoped to issuer **sandbox classification proof**
  against the now-recorded contract. It is not a live-issuer activation task.
- Live issuer activation remains external-gated under
  `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`.
- The wave-planning HELD row for `PARTNER-ELIG-LIVE-001` now explicitly says
  the work is blocked on sandbox credentials and that its scope is sandbox proof
  only, not live activation.

## Parent Unblocked Next Step

Once issuer/bank sandbox credentials and the remaining `EXT-001` gate inputs
arrive, `PH1GC-PARTNER-002` should proceed by creating
`support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md` and
capturing the nine-item sandbox proof set from `WF-PARTNER-001` §2.1 using the
field contract from §6. The sidecar must include:

1. `eligible`, `ineligible`, and `manual_review` sandbox outcomes.
2. Timeout / retry proof.
3. Booking linkage, billing/reporting linkage, and audit-log linkage.
4. Negative-path proof for `NP-PARTNER-001`, `NP-PARTNER-002`,
   `NP-PARTNER-003`, and `NP-PARTNER-007`.

The external gate remains `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`
with blocker records `EXT-001-BLK-001` through `EXT-001-BLK-006`.

This means the parent is no longer blocked on product semantics. The only
remaining blocker is external credential availability.

## Verification Basis

- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
  §3.5
- `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
- `docs/02-architecture/phase1-partner-channel-bank-entry-addendum-20260425.md`
- `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
- `docs/04-uat/phase1-uat-scenarios.md`
- `packages/contracts/src/index.ts`
