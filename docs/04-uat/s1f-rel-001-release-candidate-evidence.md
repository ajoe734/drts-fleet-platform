# Stage 1 Dev Functional Release Candidate Evidence Pack (`S1F-REL-001`)

- **Task ID:** `S1F-REL-001`
- **Task Title:** Finalize the verified Stage 1 functional release candidate
- **Owner:** `Gemini`
- **Reviewer:** `Claude`
- **Evidence Snapshot SHA:** `527a3d403464806ea1d4f417c60ac3e4fa8f17d6`
- **PR Head SHA:** `4b4c61d9b4794d50d45fb1119788aa574f307f90`
- **Code/CI Milestone SHA:** `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`
- **Candidate Branch:** `gemini/s1f-rel-001`
- **Pull Request:** [#1451](https://github.com/ajoe734/drts-fleet-platform/pull/1451)
- **Base Branch:** `dev`
- **Date:** `2026-08-17`
- **Planning Ref:** [`docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md`](../02-architecture/stage1-dev-functional-completeness-gap-20260808.md)
- **Execution Ref:** [`docs/03-runbooks/stage1-dev-functional-completion-execution-tasks-20260808.md`](../03-runbooks/stage1-dev-functional-completion-execution-tasks-20260808.md)
- **Status:** `superseded_by_s1f_rel_fin_close_001` — GCP Dev deployment and same-SHA
  operational acceptance, deferred at the time this pack was written, are now
  real and complete. See
  [`docs/04-uat/s1f-rel-fin-close-001-final-evidence-pack-20260823.md`](s1f-rel-fin-close-001-final-evidence-pack-20260823.md)
  for the authoritative deployed/accepted SHA, deploy workflow evidence, and
  the final G1-G8 matrix. This document is retained for the code/CI-milestone
  and dependency-lineage record; its G6/G8 rows and §4.4 below are updated in
  place rather than duplicated.

---

## 1. Executive Summary

Task `S1F-REL-001` finalizes, integrates, and verifies the comprehensive Stage 1 Dev Functional Release candidate closing all functional gaps G1 through G8 identified in `docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md`.

The code/CI milestone SHA is PR #1451's merge commit
`4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`; the earlier snapshot and PR-head
SHAs above describe its provenance, not competing release candidates.
**Update (2026-08-23, `S1F-REL-FIN-CLOSE-001`):** GCP Dev deployment and
same-SHA operational acceptance, described as deferred below, have since
completed for real. The deployed and operationally-accepted SHA is
`0d97e92fff563d32e0b33676edc3442ad32cd2e7` (a verified descendant of
`4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` reached via 11 reviewed fix PRs,
and a verified ancestor of current `dev` HEAD with zero intervening
application-code changes). Full evidence, including an initial deploy attempt
of `4012b10c0` that failed operational acceptance and was not hidden, is in
`docs/04-uat/s1f-rel-fin-close-001-final-evidence-pack-20260823.md`.

All 14 upstream functional implementation and verification task dependencies
across Waves A through D were reachable in evidence snapshot
`527a3d403464806ea1d4f417c60ac3e4fa8f17d6`. PR #1451 was squash-merged, so its
source commits are not Git ancestors of the merge SHA. The PR diff and squash
merge diff have the same stable patch ID, which records the source-to-merge
transition without making a false ancestry claim:

1. **Formal Referral Embed Booking & Lifecycle (`S1F-REF-001`, `S1F-REF-002`)**: Real controlled inputs, active booking creation at `/embed/yuhe-residence`, active trip resume, cancellation, rating, and receipt with live API readback.
2. **Enterprise Dispatch Semantic Controls & Lifecycle (`S1F-ENT-001`, `S1F-ENT-002`)**: Dynamic forms with live passenger, address, and cost-center bindings; create-read-update-cancel lifecycle against tenant booking command APIs.
3. **Fleet Partner Supply Onboarding & Actions (`S1F-FLT-001`, `S1F-FLT-002`, `S1F-FLT-003`)**: Valid fleet identity (`fleet-demo-001`), dynamic period derivation, driver/vehicle supply onboarding UI with document upload, submit/withdraw/resubmit flows, and statement actions.
4. **Platform Admin Supply Review & Truthful States (`S1F-ADM-001`, `S1F-ADM-002`)**: Admin review queue, diff inspection, start review, revision request, approval provisioning, and removal of false fixture fallbacks/inert buttons.
5. **Bank Console Scoped Reads & Downloads (`S1F-BANK-001`, `S1F-BANK-002`)**: Replaced demo arrays with scoped live API read models for bookings, programs, contracts, and statements; authenticated statement artifact downloads.
6. **Channel Partner Portal Formal Identity Alignment (`S1F-CHAN-001`)**: Bound portal bootstrap identity to formal Yuhe residence partner/program IDs (`yuhe-residence`).
7. **Driver App Journey Replay (`S1F-DRV-001`)**: Android emulator replay covering auth, task inbox, accept, start, complete with proof photos, offline heartbeat replay, and SOS incident escalation with operator readback.
8. **Cross-Surface Operational Browser Acceptance Suite (`S1F-UIX-001`)**: Release-blocking 7-journey Playwright acceptance suite validating state transitions across all Stage 1 surfaces, fixture-leakage guards, and 404 checks for paused/retired routes.
9. **Predeploy Candidate & Candidate SHA Plumbing (`S1F-REL-001-PREDEPLOY`)**: Candidate SHA header propagation (`x-drts-candidate-sha`) across active API/BFF/web paths and automated operational acceptance pipeline.

---

## 2. Dependency Provenance & Lineage Ledger

| Task ID                   | Component / Focus                            | PR / Branch | Commit / Reviewed SHA                      | Status             |
| :------------------------ | :------------------------------------------- | :---------- | :----------------------------------------- | :----------------- |
| **S1F-REF-001**           | Referral Embed form wiring                   | PR #1333    | `c022634e78ebc61aa4f107f9ff36eb74a68ef3a7` | Merged to `dev`    |
| **S1F-ENT-001**           | Enterprise Dispatch semantic inputs          | PR #1332    | `928d254b036573c21a415ff6819eb76369c9b5a8` | Merged to `dev`    |
| **S1F-FLT-001**           | Fleet Dev identity & fee plan                | PR #1330    | `f2939dbda84cbf9dff77636e2f1cf5b42b4d9fa2` | Merged to `dev`    |
| **S1F-BANK-001**          | Bank Console scoped live read models         | PR #1334    | `79c8ce273f324888126f59dfc3b53f66f9175440` | Merged to `dev`    |
| **S1F-ADM-002**           | Platform Admin truthful states & cleanup     | PR #1369    | `b084931ea2315b677a28eeb318fba81a4b497672` | Merged to `dev`    |
| **S1F-DRV-001**           | Android Driver journey replay evidence       | PR #1331    | `048a5d328a1cb2349694157eff3b44749f7bea5c` | Merged / Reachable |
| **S1F-REF-002**           | Referral active/history/cancel/rating        | PR #1371    | `867823f6ee8542ab6306ae039828ecfa1953eb1c` | Merged to `dev`    |
| **S1F-ENT-002**           | Enterprise booking lifecycle                 | PR #1356    | `3bf8a38a3d5ea7bb35c3453303d2946c1032df4c` | Merged to `dev`    |
| **S1F-FLT-002**           | Fleet supply onboarding UI                   | PR #1336    | `a2ebf7f69460a8a6ce980a373199feecba641473` | Merged to `dev`    |
| **S1F-FLT-003**           | Fleet operational actions & statements       | PR #1337    | `3860bb4a64ef72322d713c7c2da22c5e52cbe912` | Merged to `dev`    |
| **S1F-BANK-002**          | Bank statement downloads & role actions      | PR #1370    | `fba0a9d0f41aa1d5a7d6e64ee1df52518e22596d` | Merged to `dev`    |
| **S1F-ADM-001**           | Platform supply review UI & approval         | PR #1375    | `5d6b4122d20fc6c888d30e017618035fb54a8e63` | Merged to `dev`    |
| **S1F-CHAN-001**          | Channel Portal Yuhe residence binding        | PR #1357    | `ce80327f3aa41bf2803362a2656360ef372bb469` | Merged to `dev`    |
| **S1F-REL-001-PREDEPLOY** | Candidate SHA plumbing & acceptance pipeline | PR #1389    | `f9c720fa49df888ea4761f167d16c96b64a9481f` | Merged / Reachable |
| **S1F-UIX-001**           | Cross-surface operational browser suite      | PR #1386    | `5ef8259682ae8167234c64604a16478ffb13d6e4` | Merged / Reachable |
| **S1F-REL-001**           | Release candidate integration & verification | PR #1451    | `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` | Code/CI Complete   |

### Lineage Reachability Verification:

```bash
git merge-base --is-ancestor 5ef8259682ae8167234c64604a16478ffb13d6e4 527a3d403464806ea1d4f417c60ac3e4fa8f17d6 # UIX -> TRUE
git merge-base --is-ancestor 048a5d328a1cb2349694157eff3b44749f7bea5c 527a3d403464806ea1d4f417c60ac3e4fa8f17d6 # DRV -> TRUE
git merge-base --is-ancestor f9c720fa49df888ea4761f167d16c96b64a9481f 527a3d403464806ea1d4f417c60ac3e4fa8f17d6 # PREDEPLOY -> TRUE
git diff $(git merge-base 4b4c61d9b4794d50d45fb1119788aa574f307f90 4012b10c0cd4990bd238eaed6ddc23252bc0c8d4^) 4b4c61d9b4794d50d45fb1119788aa574f307f90 | git patch-id --stable # 5fcae997...
git diff 4012b10c0cd4990bd238eaed6ddc23252bc0c8d4^ 4012b10c0cd4990bd238eaed6ddc23252bc0c8d4 | git patch-id --stable # 5fcae997...
```

---

## 3. GAP Completion Gates (G1–G8) Verification Matrix

| Gate                       | Requirement                                                                                          | Test Suite & Verification Layer                                                                                                                  | Result                           |
| :------------------------- | :--------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------- |
| **G1 Active data truth**   | No active UI shows fixture/preview rows while its API is healthy.                                    | Operational browser journey assertions (`tests/e2e/operational-browser-acceptance.spec.ts`) & route gate scanning for fallback markers.          | **PASS**                         |
| **G2 Action truth**        | Every enabled control performs a request/download/navigation and has result/error state.             | Operational browser journey matrix covering 7 formal journeys with verified network requests, downloads, and intent routing.                     | **PASS**                         |
| **G3 Lifecycle truth**     | Create, update, cancel, submit, and approve operations survive refresh and readback.                 | Hermetic E2E suite (`001`, `002`, `006`, `012`, `019`) and operational browser specs validating API response IDs and subsequent readback.        | **PASS**                         |
| **G4 Cross-surface truth** | Formal Referral and Fleet supply records are visible in downstream scoped surfaces.                  | E2E-016 (Referral Channel), E2E-019 (Fleet Supply Onboarding to Platform Admin Review), and journey manifest contracts.                          | **PASS**                         |
| **G5 Native truth**        | Current-SHA Android emulator journey passes.                                                         | `docs/04-uat/s1f-drv-001-android-driver-journey-replay-evidence.md` & hermetic driver suites (E2E-001, E2E-006, E2E-017, E2E-018, E2E-021).      | **PASS**                         |
| **G6 Runtime truth**       | Exact accepted SHA is verified across CI and all active services pass health and operational checks. | **Updated 2026-08-23:** `Deploy - Dev` run [`32616137960`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616137960) deployed `0d97e92fff563d32e0b33676edc3442ad32cd2e7` to all 9 active Cloud Run services (100% traffic) with successful migration and health checks; `deployed=yes; all stages passed`. See `s1f-rel-fin-close-001-final-evidence-pack-20260823.md` §3.2, §6. | **PASS** |
| **G7 Frozen surfaces**     | Partner Booking and Concierge remain stopped with HTTP 404.                                          | Operational candidate test (`playwright.operational-candidate.config.ts`), deterministic route suite (39/39), and workflow pause assertions.     | **PASS**                         |
| **G8 Regression truth**    | Existing 22/22 API E2E, 39-route suite, build/typecheck, and deployed smoke stay green.              | Hermetic E2E, deterministic routes, unit tests, build, and typecheck pass. **Updated 2026-08-23:** deployed smoke is now real — `operational-candidate.spec.ts` (14/14) and `operational-browser-acceptance.spec.ts` (16/16) passed live against Cloud Run in run `32616137960` job `97139160397`. | **PASS** |

---

## 4. Empirical Test Suite Execution Summary

### 4.1 Hermetic E2E Suite (`./tests/e2e/run-e2e-hermetic.sh all`)

- **Result:** **22 / 22 passed (100%)**
- **Output:**

```text
──────── hermetic E2E-001 ────────
  ✓ PASS  E2E-001-enterprise-dispatch
──────── hermetic E2E-002 ────────
  ✓ PASS  E2E-002-forwarded-order
──────── hermetic E2E-003 ────────
  ✓ PASS  E2E-003-phone-recording-filing
──────── hermetic E2E-004 ────────
  ✓ PASS  E2E-004-tenant-attribution
──────── hermetic E2E-005 ────────
  ✓ PASS  E2E-005-tenant-governance
──────── hermetic E2E-006 ────────
  ✓ PASS  E2E-006-driver-multi-platform
──────── hermetic E2E-007 ────────
  ✓ PASS  E2E-007-partner-airport-transfer
──────── hermetic E2E-008 ────────
  ✓ PASS  E2E-008-partner-booking-cutover
──────── hermetic E2E-009 ────────
  ✓ PASS  E2E-009-prod-rail-dry-run
──────── hermetic E2E-010 ────────
  ✓ PASS  E2E-010-governance-aware-billing-reporting
──────── hermetic E2E-011 ────────
  ✓ PASS  E2E-011-platform-admin-control-plane
──────── hermetic E2E-012 ────────
  ✓ PASS  E2E-012-tenant-business-operations
──────── hermetic E2E-013 ────────
  ✓ PASS  E2E-013-service-product-eligibility
──────── hermetic E2E-014 ────────
  ✓ PASS  E2E-014-fleet-partner-revenue-share
──────── hermetic E2E-015 ────────
  ✓ PASS  E2E-015-partner-program-variants
──────── hermetic E2E-016 ────────
  ✓ PASS  E2E-016-referral-channel
──────── hermetic E2E-017 ────────
  ✓ PASS  E2E-017-driver-sos-incident
──────── hermetic E2E-018 ────────
  ✓ PASS  E2E-018-driver-device-lifecycle
──────── hermetic E2E-019 ────────
  ✓ PASS  E2E-019-fleet-supply-onboarding
──────── hermetic E2E-020 ────────
  ✓ PASS  E2E-020-service-product-runtime-eligibility
──────── hermetic E2E-021 ────────
  ✓ PASS  E2E-021-driver-heartbeat-replay
──────── hermetic E2E-022 ────────
  ✓ PASS  E2E-022-operations-reporting
════════════════════════════════════════
[hermetic] PASS (22): 001 002 003 004 005 006 007 008 009 010 011 012 013 014 015 016 017 018 019 020 021 022
[hermetic] FAIL (0): none
```

### 4.2 Deterministic Route Suite (`npx playwright test tests/e2e/deterministic-route-suite.spec.ts`)

- **Result:** **39 / 39 passed**
- **Output:**

```text
Running 39 tests using 16 workers
·······································
  39 passed (9.2s)
```

### 4.3 Operational Browser Manifest Integrity (`vitest run tests/unit/operational-browser-manifest.test.ts`)

- **Result:** **2 / 2 passed**
- **Output:**

```text
 ✓ tests/unit/operational-browser-manifest.test.ts (2 tests) 9ms
   ✓ operational browser journeys manifest guard (2)
     ✓ keeps the source evidence document independent of a candidate SHA
     ✓ conforms to the declared operation contract
```

### 4.4 GitHub Actions PR #1451 & Trunk `dev` CI Suites

- **CI on `dev` Trunk (Merge SHA `4012b10c0`):** Run `31997773400` (`CI (integration trunk)`) — **22 / 22 checks passing**
- **CI on PR #1451 Branch (`gemini/s1f-rel-001`):** Run `31997270480` (`CI (integration trunk)`) — **22 / 22 checks passing**
- **Checks Verified:**
  - `CI (integration trunk)/build`
  - `CI (integration trunk)/unit-tests`
  - `CI (integration trunk)/integration-tests`
  - `CI (integration trunk)/typecheck`
  - `CI (integration trunk)/lint`
  - `CI (integration trunk)/i18n-guard`
  - `CI/Product smoke acceptance`
  - `CI/Verify Internal Key Exception Registry`
  - All 14 additional workflow compliance and security guards.
- **Cloud Run Dev Deploy Workflow (`deploy-dev.yml`):** **Updated 2026-08-23.** The GCP billing gate (project #952590575714) was subsequently opened (`S1F-REL-FIN-DEP-001-UNBLOCK-*`, PR #1548). `Deploy - Dev` run [`32616137960`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32616137960) succeeded end-to-end (build/push, migration, all 9 service deploys, health checks, Partner Booking pause enforcement, and same-SHA operational acceptance 30/30) for SHA `0d97e92fff563d32e0b33676edc3442ad32cd2e7`. A separate explicit dispatch of the original locked candidate `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` (run `32616532316`) deployed successfully but failed its bundled operational-acceptance job 3/16 — that failure drove 11 reviewed fix PRs, after which `0d97e92fff...` (their merged result) passed. Live Cloud Run endpoints now serve this candidate. Full detail: `docs/04-uat/s1f-rel-fin-close-001-final-evidence-pack-20260823.md`.

---

## 5. Conclusion & Handoff

The code/CI milestone integrated via PR #1451 (`4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`) binds all Stage 1 functional changes, closes the dependency graph for `S1F-UIX-001` and `S1F-DRV-001`, and passes the required code and CI checks.

**Update (2026-08-23):** G6 runtime verification and the deployed-smoke portion of G8, previously deferred under the external GCP billing gate, are now complete. Stage 1 is deployed to Dev and has passed live, same-SHA operational acceptance at `0d97e92fff563d32e0b33676edc3442ad32cd2e7`. See `docs/04-uat/s1f-rel-fin-close-001-final-evidence-pack-20260823.md` for the authoritative closeout evidence, including the one deploy attempt (of the original static lock) that failed acceptance and was not hidden.
