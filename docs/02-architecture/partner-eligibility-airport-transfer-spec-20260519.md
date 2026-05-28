# Partner Eligibility & Airport-Transfer Spec

**Date**: 2026-05-19 (date stamped to align with directive; reconciled commit 2026-05-22)
**Authority**: directive §E `PARTNER-001` — `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
**Workflow family**: `WF-PARTNER-001` (formerly `WF-PRT-001`; renamed per directive §3.2 — no alias)
**Pairs with**: `docs/02-architecture/phase1-partner-channel-bank-entry-addendum-20260425.md` (topology — extended, not replaced)
**Sidecar evidence**: `support/sidecars/PARTNER-ELIG-LIVE-001/` (driven by `PH1GC-PARTNER-002`)

This spec defines the contract surface for partner-channel eligibility verification and airport-transfer benefit intake. It is the canonical reference for any code, contract, UAT scenario, sidecar, or E2E script under `WF-PARTNER-001`.

---

## 1. Identity model

### 1.1 `entrySlug`

`entrySlug` is the public-facing routing token that resolves to a _partner entry_ — a single configured ingress into the platform that combines:

- a partner brand (e.g., `ctbc-world-elite`, `cathay-bank-airport-transfer`)
- a tenant scope (which DRTS tenant owns the booking)
- an eligibility verifier (issuer or bank sandbox / live endpoint)
- a benefit program (e.g., `credit_card_airport_transfer`)
- a UI surface (typically `apps/partner-booking-web` route segment `[tenantSlug]/[entrySlug]`)

`entrySlug` is the **only** acceptable external identifier for a partner entry in URLs, logs, billing records, and reporting. Internal references use the surrogate `partnerEntryId` UUID, never the slug alone.

### 1.2 Partner entry identity invariants

A partner entry is uniquely identified by the tuple `(tenantSlug, entrySlug)`. Renaming an `entrySlug` is a versioned action: the prior slug is retired with a redirect record kept for ≥14 days; bookings that referenced the prior slug retain it in their immutable booking record.

`partnerEntryId` is immutable. `entrySlug` is mutable through the retire-and-redirect path only.

---

## 2. Issuer / bank sandbox requirement

### 2.1 Mandatory sandbox before live

A partner entry whose eligibility flow requires real card or account verification (e.g., credit-card BIN check, partner-membership lookup) must hold **sandbox classification proof** before any live-classification claim. Sandbox classification proof comprises:

- a named issuer / bank counterparty
- a credential-source declaration (with masked reference token)
- at least one successful `eligible` verification on a sandbox-allowed test instrument
- at least one successful `ineligible` verification
- at least one successful `manual_review` verification
- a timeout / retry proof
- a downstream booking linkage (the verification ID flows into the booking record)
- a billing / reporting linkage (the verification ID flows into the invoice and report rows)
- an audit log proof

These nine items are the directive-§E `PARTNER-002` evidence set and are housed under `support/sidecars/PARTNER-ELIG-LIVE-001/`.

### 2.2 What is not sandbox

The following do **not** constitute sandbox classification:

- a purely local fixture or mock issuer response
- a repo-local test that uses a fabricated card number not declared by the issuer
- a static test JSON committed into the repo as the only "evidence"

If only repo-local mocks are available, `WF-PARTNER-001` gate-read remains `PASS (repo-local)` and the matrix row's non-claim must state that sandbox classification is pending.

---

## 3. Card / token masking and reference-token model

### 3.1 `cardLast4`

The only credit-card surface allowed to be stored or returned by the platform is `cardLast4` (4 digits). Full PAN, expiry, and CVV must never enter platform storage. If an issuer integration returns more than `cardLast4`, the adapter strips down to `cardLast4` before persistence.

### 3.2 `referenceToken`

The issuer-issued reference token (e.g., a one-time eligibility hash or a tokenized verification handle) is stored in masked form using the platform's standard `maskOpaqueToken(value, 8, 4)` helper — first 8 + last 4 visible, middle redacted. The unmasked value never enters logs, reports, or audit records. The masking applies at every persistence boundary: booking record, billing record, report export, audit row.

### 3.3 Reference-token verification derivation

For partner eligibility verifications where the booking record references the issuer interaction by hash rather than by token, the canonical hash is `sha256(referenceToken || tenantSlug || entrySlug)` truncated to 32 hex characters. Downstream consumers compare the hash, not the masked token.

---

## 4. Manual review flow

### 4.1 States

A partner eligibility verification has exactly one of these terminal states:

- `eligible` — issuer confirmed; booking may proceed.
- `ineligible` — issuer denied; booking must be refused with the issuer-supplied reason code.
- `manual_review` — issuer returned indeterminate; booking is held pending operator review.

`pending` is a non-terminal interim state used only while the issuer call is in flight. `timeout` is not a terminal state; on timeout the verification is retried (see §4.3) and ultimately resolves to one of the three terminal states or to `ineligible` with reason `issuer_unreachable` after the retry budget is exhausted.

### 4.2 Manual review queue

`manual_review` verifications enter a per-tenant operator queue. The operator may:

- approve to `eligible` (with operator id + reason recorded)
- reject to `ineligible` (with operator id + reason recorded)

The operator action is itself audited (`audit_id` references the original `eligibilityVerificationId`). Operator-driven transitions are visible in the partner booking's verification history.

### 4.3 Timeout and retry budget

Default issuer timeout: 8 seconds per request. Retry budget: 2 retries with exponential backoff (1s, 3s). After exhaustion: terminal `ineligible` with reason code `issuer_unreachable`. Tenant configuration may tighten (lower timeout, fewer retries) but cannot extend beyond the defaults.

---

## 5. Booking / billing / reporting linkage

### 5.1 Booking record fields

A partner-channel booking record persists:

```
partnerEntryId           uuid          // immutable internal id
entrySlug                string        // public slug as-of booking
tenantSlug               string
partnerProgramCode       string        // e.g. credit_card_airport_transfer
eligibilityVerificationId uuid         // → eligibility verification row
eligibilityState         enum          // eligible | manual_review (refused bookings do not enter this table)
cardLast4                string        // 4 digits or null
referenceToken           string        // masked: maskOpaqueToken(...)
referenceHash            string        // sha256-derived per §3.3, used for joins
```

### 5.2 Billing record linkage

The invoice row for a partner-channel booking carries `partnerProgramCode`, `eligibilityVerificationId`, and `referenceHash`. Reports keyed by partner program join through `referenceHash`, not the masked `referenceToken`.

### 5.3 Reporting linkage

The governance-aware reporting flow (`WF-FIN-GOV-001`) treats `partnerProgramCode` and `eligibilityVerificationId` as required fields when the booking originated from a partner channel. The full field set is declared in `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` §3.

### 5.4 Audit linkage

Every state transition on an eligibility verification (issued, retried, eligible, ineligible, manual_review entered, manual_review resolved) emits an audit row keyed by `eligibilityVerificationId`. The audit row carries the masked `referenceToken` (not the unmasked value).

---

## 6. Airport-transfer benefit specifics

The first live-bound `partnerProgramCode` under `WF-PARTNER-001` is `credit_card_airport_transfer`. Additional invariants for this program:

- Booking must declare `pickupLocation` or `dropoffLocation` resolves to an airport (codeset: IATA + DRTS internal airport registry).
- Benefit eligibility verification is run _at booking time_, not at trip time. Trip-time changes (driver assignment, route updates) do not re-trigger verification.
- The verification result is bound to the specific booking; re-quoting the same trip 24 hours later requires a new verification.
- Benefit price subsidy is applied to the booking total at billing time, sourcing the subsidy amount from the partner program's published rate (versioned via the platform admin pricing module — `WF-ADM-001`).

The airport-transfer payload uses the existing tenant booking contract fields
`direction`, `flightNo`, `terminal`, and `luggageCount` with these additional
rules:

- `direction` is required and stays part of the booking + eligibility request
  context.
- `flightNo` is required for `direction = pickup`; submission without it is
  rejected before booking creation.
- `terminal` is a booking-scoped travel-detail field. It must persist onto the
  booking/request context and remain visible to operator manual-review flows,
  but it does not change the issuer eligibility classification by itself.
- `luggageCount` is a booking-scoped travel-detail field. It persists with the
  booking/request context for fulfillment, but it does not change issuer
  eligibility classification by itself.
- Updating `terminal` or `luggageCount` does not mint a new
  `eligibilityVerificationId` and does not, by itself, trigger a new
  eligibility verification. Re-verification stays reserved for changes that
  materially alter partner entry / eligibility truth, such as
  `partnerEntrySlug`, the bound verification identifier, or a new pickup-side
  eligibility request.

Other partner programs follow the same eligibility / linkage / audit contract but may declare program-specific extension fields. Extension fields land in `packages/contracts/src/` as program-scoped schema rather than this spec.

---

## 7. Negative paths (required UAT coverage)

The UAT for `WF-PARTNER-001` must cover at minimum:

| ID               | Negative scenario                                               | Expected outcome                                                             |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `NP-PARTNER-001` | Eligibility verification returns `ineligible`                   | Booking refused with issuer reason code; no driver dispatch                  |
| `NP-PARTNER-002` | Eligibility verification times out across retry budget          | Terminal `ineligible` with reason `issuer_unreachable`; booking refused      |
| `NP-PARTNER-003` | `manual_review` held longer than tenant SLA                     | Operator queue surfaces overdue item; no auto-eligibility flip               |
| `NP-PARTNER-004` | Operator rejects `manual_review`                                | Booking refused; audit row carries operator id                               |
| `NP-PARTNER-005` | Re-quote 24h+ after original verification                       | New verification required; prior verification not honored                    |
| `NP-PARTNER-006` | Booking attempts to bypass eligibility (direct API)             | API rejects without `eligibilityVerificationId` present and `eligible` state |
| `NP-PARTNER-007` | Reporting export includes a manual_review-then-rejected booking | Export row reflects refused state; subsidy not applied                       |
| `NP-PARTNER-008` | Unauthorized export of unmasked reference token                 | Export refused; audit captures the attempt                                   |

`PH1GC-PARTNER-002` sidecar evidence must demonstrate at least `NP-PARTNER-001`, `NP-PARTNER-002`, `NP-PARTNER-003`, and `NP-PARTNER-007` in the issuer sandbox.

---

## 8. Out of scope

- Live-issuer activation (separate gate; covered when `support/sidecars/PARTNER-ELIG-LIVE-001/` shows live-classified proof — currently sandbox only).
- Partner Booking pilot cutover (`WF-PBK-001` — separate workflow family driven by `PH1GC-PBK-001`).
- Driver-side display of partner-program metadata on assigned trips (covered by `WF-DRV-001` / `WF-DRV-MP-001`).
- Subsidy accounting reconciliation against partner-program statements (`WF-FIN-GOV-001` after subsidy is paid).
