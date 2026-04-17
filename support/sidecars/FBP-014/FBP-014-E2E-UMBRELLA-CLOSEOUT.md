# FBP-014 — Integrated Cross-Surface and Cross-Repo E2E Suite Umbrella Closeout

**Task:** `FBP-014` — integrated cross-surface and cross-repo E2E suite umbrella  
**Owner:** Claude  
**Reviewer:** Codex  
**Status:** In review — see `ai-status.json` / `current-work.md` for live task state  
**Created:** 2026-04-17 (UTC)

---

## 1. Purpose & Scope

This document is the formal umbrella closeout packet for `FBP-014`.

Its job is to confirm that both child tasks (`FBP-014A` scaffold and `FBP-014B` live
evidence) are complete, cross-link their anchors, verify the integrated E2E suite decision,
and document downstream unblock conditions for `FBP-015`.

**In scope**

- Confirm `FBP-014A` and `FBP-014B` are both closed or in reviewer-approved state
- Cross-link child-pack commits and verification anchors
- State the umbrella-level E2E gate decisions (automated/env-gated/manual split)
- Confirm bug fixes incorporated into the live evidence run
- Verify all 7 non-negotiable guardrails from the BFF handoff packet
- Confirm `FBP-015` unblock conditions

**Out of scope**

- Rewriting child-pack conclusions
- Claiming live pilot or production sign-off not yet collected
- Modifying runtime / contract / governance truth

---

## 2. Child Task Status — Machine Truth Snapshot

| Child task | Status | Anchor commit / run                                                   | Primary evidence file                                              |
| ---------- | ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `FBP-014A` | `done` | commit `ef762e2`; dry-run verification 2026-04-16                     | `support/sidecars/FBP-014A/FBP-014A-E2E-SCAFFOLD-EVIDENCE-PACK.md` |
| `FBP-014B` | `done` | commit `929072c`; GHA deploy run `24545508036`; live E2E run `874878` | `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md`         |

Supporting sidecar tasks closed:

| Sidecar                        | Status | Evidence file                                               |
| ------------------------------ | ------ | ----------------------------------------------------------- |
| `FBP-014A-SIDECAR-BFF-HANDOFF` | `done` | `support/sidecars/FBP-014A/FBP-014A-SIDECAR-BFF-HANDOFF.md` |
| `FBP-014B-SIDECAR-ACCEPTANCE`  | `done` | `support/sidecars/FBP-014B/FBP-014B-SIDECAR-ACCEPTANCE.md`  |
| `FBP-014B-SIDECAR-REVIEW`      | `done` | `support/sidecars/FBP-014B/FBP-014B-SIDECAR-REVIEW.md`      |
| `FBP-014-SIDECAR-BFF-HANDOFF`  | `done` | `support/sidecars/FBP-014/FBP-014-SIDECAR-BFF-HANDOFF.md`   |

---

## 3. Bug Fixes Incorporated Into the Live Evidence Run

The live staging evidence run on `FBP-014B` was preceded by two critical bug fixes that were
required to make the integrated chain pass. Both are formally closed.

| Bug task  | Status | Commit    | Fix subject                                  | Impact on E2E suite                                                                 |
| --------- | ------ | --------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `BUG-001` | `done` | `b068f92` | Enforce tenant isolation for tenant bookings | Without this fix, `E2E-004` cross-tenant safety check would produce false negatives |
| `BUG-002` | `done` | `17f8895` | Require explicit dispatch trigger in E2E-001 | Without this fix, `E2E-001` would stall at dispatch polling (no auto-trigger)       |

Additionally, the booking projection and billing eligibility fixes carried by `929072c` were
required before `E2E-001` could converge on `status="completed"` and successfully generate
an invoice.

---

## 4. Upstream Execution-Family Freeze Inherited by This Umbrella

All upstream execution families that the child packs depend on are frozen.

| Major execution family                             | Closeout commit | Status |
| -------------------------------------------------- | --------------- | ------ |
| `FBP-005` tenant-facing BFF parity                 | `78cb874`       | `done` |
| `FBP-006` tenant-commute-hub BFF cutover           | `ddfc087`       | `done` |
| `FBP-007` tenant-portal-web retirement             | `3ef9079`       | `done` |
| `FBP-008` Platform Admin blueprint breadth         | `61547cc`       | `done` |
| `FBP-009` Ops Console Phase 1                      | `71d9fa8`       | `done` |
| `FBP-010` Callcenter / complaints / dispatch trace | `1d5ed4f`       | `done` |
| `FBP-011` Finance / billing / filing               | `b00b01b`       | `done` |
| `FBP-012` Public Info / Placard / Regulatory       | `7f02fe1`       | `done` |
| `FBP-013` Staging / smoke / UAT evidence closeout  | `4ec423d`       | `done` |

---

## 5. Integrated E2E Suite — Final Scenario State

### 5.1 Automated scenarios (live staging verified)

| Scenario  | Description                              | Surface chain                                                                      | Status   | Live run |
| --------- | ---------------------------------------- | ---------------------------------------------------------------------------------- | -------- | -------- |
| `E2E-001` | Enterprise dispatch full cycle           | Tenant booking → Ops dispatch → Driver lifecycle → Tenant billing + Audit          | **PASS** | `874878` |
| `E2E-004` | Tenant attribution + cross-tenant safety | Platform Admin tenant create → Tenant booking → Ops check → cross-tenant isolation | **PASS** | `874878` |

#### E2E-001 live chain (run 874878, 2026-04-17T03:11:24-28Z)

| Chain field          | Value                                          |
| -------------------- | ---------------------------------------------- |
| `bookingId`          | `booking-000014`                               |
| `tenantId`           | `10000000-0000-0000-0000-000000000201`         |
| `orderId`            | `d3b3b294-6cb6-443c-abe8-82aa5532fb93`         |
| `dispatchJobId`      | `c930fef0-f757-4db7-aa12-2deff19c82c6`         |
| `driverId`           | `drv-demo-001`                                 |
| `vehicleId`          | `veh-demo-001`                                 |
| `taskId`             | `2beb8ad3-1358-4bdf-9adf-100d7e1c2073`         |
| `bookingStatusFinal` | `completed`                                    |
| `invoiceId`          | `invoice-f96c5710-a2fa-4d45-b153-7e5d247ca49c` |
| `auditEntryCount`    | `65`                                           |

#### E2E-004 live chain (run 874878, 2026-04-17T03:11:29Z)

| Chain field               | Value              |
| ------------------------- | ------------------ |
| `newTenantId`             | `t_9cdf3f99`       |
| `newTenantCode`           | `E2E-ATTR-6395488` |
| `newTenantBookingId`      | `booking-000015`   |
| `crossTenantLeakDetected` | `false`            |
| `directDetailStatus`      | `404`              |

### 5.2 Environment-gated scenarios (graceful skip)

| Scenario  | Description                      | Reason not executed in closeout pass                                    | Status        |
| --------- | -------------------------------- | ----------------------------------------------------------------------- | ------------- |
| `E2E-002` | Forwarded order mirror lifecycle | Requires live forwarded-task seed from third-party platform integration | **ENV-GATED** |

`E2E-002` gracefully skips when no forwarded task is seeded. The script and fixtures are
in place (commit `ef762e2`). This is documented as acceptable in `FBP-014A` AC-3 and the
BFF handoff guardrail §4.

### 5.3 Manual-only scenarios (not automated)

| Scenario  | Description                        | Reason intentionally not automated                                         | Status          |
| --------- | ---------------------------------- | -------------------------------------------------------------------------- | --------------- |
| `E2E-003` | Phone booking to compliance export | Requires live CTI session + recording callback webhook; cannot be scripted | **MANUAL-ONLY** |

`E2E-003` is documented as manual-only in `docs/04-uat/fbp-014a-e2e-matrix.md §4.3`.
Fixtures are prepared for future CTI-backed automation if/when the live CTI environment is available.

---

## 6. Live Runtime Under Test

| Field               | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| Live API origin     | `https://drts-api-kdhu6wzufa-uc.a.run.app`                         |
| Cloud Run revision  | `drts-api-00016-s4v`                                               |
| API image           | `us-central1-docker.pkg.dev/autotaxi-492811/drts/api:929072c1a567` |
| GHA deploy run      | `Deploy - Staging` run `24545508036` (`success`)                   |
| GHA CI run          | Run `24545508043` (`failure` — unrelated repo-wide failures)       |
| E2E live run ID     | `874878`                                                           |
| Evidence chain file | `/tmp/drts-e2e-chain-874878.json`                                  |
| Evidence log file   | `/tmp/drts-e2e-evidence-874878.log`                                |

Note: The CI run `24545508043` failure does not affect the E2E evidence verdict — it
contains unrelated unit/typecheck failures and the staging deploy succeeded independently.

---

## 7. Integrated E2E Gate Decision Table

| Gate                                      | Verdict         | Evidence anchor                                                       | Notes                                                                                      |
| ----------------------------------------- | --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Scaffold completeness (AC-1 through AC-8) | **PASS**        | FBP-014A evidence pack §2; commit `ef762e2`                           | All 8 ACs met: helpers, E2E-001/002/004, fixtures, matrix doc, guardrail conformance       |
| Live integrated chain (booking→billing)   | **PASS**        | FBP-014B evidence pack §§3-4; run `874878`; commit `929072c`          | E2E-001 booking projection, billing eligibility, invoice retrieval all converge on staging |
| Live cross-tenant isolation proof         | **PASS**        | FBP-014B evidence pack §4.2; run `874878`                             | List isolation + direct-detail isolation both confirmed on live staging post-BUG-001 fix   |
| Forwarded order lifecycle                 | **ENV-GATED**   | FBP-014A evidence pack §3.2; E2E-002 script; BFF handoff guardrail G4 | Script in place; graceful skip when no seeded forwarded task; not a blocker for closeout   |
| Phone booking / CTI compliance export     | **MANUAL-ONLY** | FBP-014A evidence pack §3.3; matrix doc §4.3                          | Requires live CTI session; intentionally not automated; deferred to future CTI slice       |
| Guardrail conformance (G1–G7)             | **PASS**        | See §8 below                                                          | All 7 non-negotiable guardrails verified                                                   |
| Bug fix integration                       | **PASS**        | BUG-001 (`b068f92`), BUG-002 (`17f8895`); both `done`                 | Tenant isolation and dispatch-trigger fixes are part of the canonical runtime under test   |

---

## 8. Non-Negotiable Guardrail Verification

The seven guardrails from `FBP-014-SIDECAR-BFF-HANDOFF.md §6` are verified:

| Guardrail | Description                                               | Verification                                                                                 | Status   |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| G1        | Tenant surface is `tenant-commute-hub` only               | E2E-001 booking leg uses `/api/tenant/bookings`; retired `apps/tenant-portal-web` unused     | **PASS** |
| G2        | Repo B remains pure UI consumer                           | No Supabase direct truth or local authority appears in any E2E script                        | **PASS** |
| G3        | BFF wire rules intact (`/api/*`, `Idempotency-Key`, etc.) | `tests/e2e/lib/helpers.sh` enforces canonical headers on all write calls; commit `ef762e2`   | **PASS** |
| G4        | Owned enterprise-dispatch is the primary happy path       | E2E-001 is the owned booking → dispatch → driver → billing chain; E2E-002 is separate mirror | **PASS** |
| G5        | Billing and audit remain backend-owned                    | `POST /api/tenant/invoices/generate` and `GET /api/tenant/audit` — no UI self-calculation    | **PASS** |
| G6        | Cross-tenant safety is part of the definition of done     | E2E-004 explicitly verifies no cross-tenant list or detail leak on live staging              | **PASS** |
| G7        | Missing surface means reopen the right task               | BUG-001 and BUG-002 were opened and closed as separate formal tasks, not local workarounds   | **PASS** |

---

## 9. Downstream Unblock — FBP-015

With `FBP-014` closing, the following downstream dependency is now satisfied:

| Downstream task                   | Depends on FBP-014 | Unblock condition                                                                                                                                                                 |
| --------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FBP-015` deferred roadmap packet | yes                | `FBP-014` umbrella closing satisfies the formal dependency; Claude can now proceed with the deferred-roadmap packet for Passenger / Concierge / AV / ODD / Tesla / ROC live-board |

---

## 10. Acceptance Criteria Verification

| AC   | Criterion                                                                                              | Verdict                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | `FBP-014A` scaffold is done: scenario matrix, helpers, E2E-001/002/004, fixtures, matrix doc           | **PASS** — commit `ef762e2`; all 8 FBP-014A ACs verified; dry-run confirms 3 scenarios discovered                                        |
| AC-2 | `FBP-014B` live evidence run: booking → dispatch → driver → billing/audit chain passes on live staging | **PASS** — run `874878`; E2E-001 chain converged; booking projection and billing eligibility fixes deployed; invoice and audit confirmed |
| AC-3 | Cross-tenant isolation is live-proven, not only statically asserted                                    | **PASS** — E2E-004 run `874878`; list isolation and direct-detail isolation confirmed on post-BUG-001 staging runtime                    |
| AC-4 | The automated / env-gated / manual split is clearly documented                                         | **PASS** — §5 of this document; env-gated `E2E-002` and manual-only `E2E-003` are explicitly separated from the PASS verdict             |
| AC-5 | All 7 non-negotiable guardrails from the BFF handoff packet are satisfied                              | **PASS** — §8 verifies G1–G7; no retired surfaces, no local authority, BFF wire rules intact                                             |
| AC-6 | Bug fixes BUG-001 and BUG-002 are formally closed before the evidence is declared complete             | **PASS** — BUG-001 `done` at `b068f92`; BUG-002 `done` at `17f8895`; both fixes integrated into the `929072c` staging runtime under test |

---

## 11. Non-Claims

This umbrella does **not** claim:

- Named live pilot or production sign-off has been collected
- `E2E-002` (forwarded order) has been executed on live staging — it is env-gated
- `E2E-003` (phone booking / CTI compliance export) has been automated — it remains manual-only
- The forwarded-task third-party platform seed is available on staging
- Live CTI webhook callback evidence has been collected

---

## 12. Owner Closeout Statement

Both child tasks (`FBP-014A` scaffold, `FBP-014B` live evidence) are frozen and closed.
All upstream execution families carry closeout commits. All 7 guardrails are verified.
The two integrated E2E automated scenarios (E2E-001, E2E-004) passed on live staging
runtime `drts-api-00016-s4v`. The env-gated and manual-only scenarios are correctly
documented and do not block the umbrella closeout.

The integrated cross-surface E2E suite is complete for Phase 1 scope:

- Owned enterprise-dispatch happy path: **verified on live staging**
- Cross-tenant isolation: **verified on live staging**
- Forwarded order mirror: **script in place; env-gated graceful skip**
- Phone booking / CTI compliance: **manual-only; fixtures prepared**

`FBP-014` is ready for Codex reviewer sign-off.  
Upon approval, `FBP-015` is immediately unblocked for Claude to execute the deferred
roadmap packet for Passenger / Concierge / AV / ODD / Tesla / ROC live-board.
