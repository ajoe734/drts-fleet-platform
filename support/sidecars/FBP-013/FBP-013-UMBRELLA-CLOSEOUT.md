# FBP-013 — Staging / Smoke / UAT Evidence Closeout Umbrella

**Task:** `FBP-013` — staging / smoke / UAT evidence closeout umbrella  
**Owner:** Claude  
**Reviewer:** Codex  
**Status:** In review — see `ai-status.json` / `current-work.md` for live task state  
**Created:** 2026-04-16 (UTC)

---

## 1. Purpose & Scope

This document is the formal umbrella closeout packet for `FBP-013`.

Its job is to confirm that all four child evidence packs are fully closed, cross-link their
anchors, state the final release-decision gate results, and verify the downstream unblock
conditions for `FBP-014` / `FBP-014B`.

**In scope**

- Confirm FBP-013A / FBP-013B / FBP-013C / FBP-013D are all `done`
- Cross-link child-pack commits and verification anchors
- State umbrella-level gate decisions
- Confirm FBP-014 / FBP-014B unblock conditions
- Carry forward residual pilot / production HOLD items

**Out of scope**

- Rewriting child-pack conclusions
- Claiming live pilot or production sign-off not yet collected
- Modifying runtime / contract / governance truth

---

## 2. Child Evidence Pack Status — Machine Truth Snapshot

All four FBP-013 child tasks are `done` in `ai-status.json` as of 2026-04-16 UTC.

| Child task | Status | Anchor commit / run                                           | Primary evidence file                                                |
| ---------- | ------ | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `FBP-013A` | `done` | commit `e0b256d`; GHA run `#24522301392`                      | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` |
| `FBP-013B` | `done` | commits `3558649`, `67d37346e7dda22b8aafdc953fad7c45909972e5` | `support/sidecars/FBP-013B/FBP-013B-SMOKE-EVIDENCE-PACK.md`          |
| `FBP-013C` | `done` | commit `7dfc61710933586e18221946f176c935c0024e97`             | `support/sidecars/FBP-013C/FBP-013C-UAT-EVIDENCE-PACK.md`            |
| `FBP-013D` | `done` | commit `dd0e7d7`                                              | `support/sidecars/FBP-013D/FBP-013D-FINAL-EVIDENCE-CLOSEOUT.md`      |

Supporting sidecar tasks also closed:

| Sidecar                             | Status                                                                |
| ----------------------------------- | --------------------------------------------------------------------- |
| `FBP-013A-INFRA`                    | `done` — staging deploy infra remediation; green rerun `#24522301392` |
| `FBP-013A-SIDECAR-ACCEPTANCE`       | `done`                                                                |
| `FBP-013A-INFRA-SIDECAR-ACCEPTANCE` | `done`                                                                |
| `FBP-013B-SIDECAR-ACCEPTANCE`       | `done`                                                                |
| `FBP-013B-SIDECAR-REVIEW`           | `done`                                                                |
| `FBP-013C-SIDECAR-REVIEW`           | `done`                                                                |
| `FBP-013D-SIDECAR-ACCEPTANCE`       | `done`                                                                |
| `FBP-013D-SIDECAR-REVIEW`           | `done`                                                                |
| `FBP-013-SIDECAR-ACCEPTANCE`        | `done`                                                                |

---

## 3. Upstream Execution-Family Freeze Inherited by This Umbrella

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

---

## 4. Umbrella Evidence Decision Table

| Gate                    | Verdict                | Evidence anchors                                                              | Notes                                                                                                                                |
| ----------------------- | ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Staging deploy evidence | **PASS**               | FBP-013A §§3-6, §11; GHA run `#24522301392`; commit `e0b256d`                 | Four jobs: build-push, migrate (V0001-V0018), deploy, health-check — all passed                                                      |
| Deploy ordering         | **PASS**               | FBP-013A §4; `.github/workflows/deploy-staging.yml`                           | `build-push → migrate → deploy → health-check` machine-enforced by GHA job dependency graph                                          |
| Migration completeness  | **PASS**               | FBP-013A §3; `E-12` migrate job log                                           | V0001–V0018 applied on staging; idempotent                                                                                           |
| Health check            | **PASS**               | FBP-013A §3; `E-13` health-check step                                         | `GET /api/health` → HTTP 200 confirmed                                                                                               |
| Feature-flag API        | **PASS (implemented)** | FBP-013A §5; `apps/api/src/modules/feature-flags/feature-flags.controller.ts` | `/api/admin/flags` is implemented; runtime flag-evaluation client remains post-Phase-1 work                                          |
| Smoke evidence (static) | **PASS**               | FBP-013B §§2-6, §8-9                                                          | 6 critical-path cases: health, booking-create, dispatch-assign, driver-accept, billing-invoice, report-export; bootstrap-header auth |
| UAT scenario coverage   | **PASS (45/45 P1)**    | FBP-013C §§5-7, §10                                                           | 93 scenarios total; 45/45 non-deferred P1 scenarios statically verified; 5 deferred items formally tracked                           |
| Manual rollout matrix   | **DOCUMENTED**         | FBP-013A §9; `docs/03-runbooks/phase1-rollout.md`                             | Intentional interim control; tenant/city/module matrix execution remains manual                                                      |
| Pilot launch gate       | **HOLD**               | FBP-013C §7.1                                                                 | Requires live UAT completion, zero open P1 bugs, named product-owner acceptance of all deferred items                                |
| Production rollout gate | **HOLD**               | FBP-013C §7.2                                                                 | Requires pilot observation, tolerance metrics, month-end dry runs, rollback-owner acknowledgement                                    |

---

## 5. Residual Pilot / Production Holds

These items are inherited from FBP-013D and FBP-013C and remain open for pilot / production
launch. They do **not** block the evidence closeout verdict.

| Item                                  | Current state         | What still blocks pilot / production                           |
| ------------------------------------- | --------------------- | -------------------------------------------------------------- |
| Named UAT live sign-off               | not yet collected     | Both pilot and production require explicit named approvals     |
| Deferred scenario `OC-022`            | hold                  | CTI webhook callback live evidence                             |
| Deferred scenario `OC-023`            | hold                  | Staging scheduler filing-job live evidence                     |
| Deferred scenario `OC-024`            | hold                  | Recording-index export live evidence                           |
| Deferred scenario `DA-018`            | hold                  | Period-end billing job live evidence                           |
| Deferred scenario `E2E-003`           | hold                  | Depends on `OC-022` + `OC-024` evidence                        |
| Manual rollout matrix execution       | not started           | Required before production rollout                             |
| Runtime flag-evaluation client        | deferred post-Phase 1 | Granular runtime cutovers limited until the client slice lands |
| Pilot observation / tolerance metrics | not yet collected     | Required before production gate                                |

---

## 6. Downstream Unblock — FBP-014 / FBP-014B

With `FBP-013` closing, the following downstream dependencies are now satisfied:

| Downstream task                              | Depends on FBP-013             | Unblock condition                                                                 |
| -------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `FBP-014` (umbrella)                         | yes — `FBP-013` and `FBP-014A` | `FBP-014A` is already `done`; `FBP-013` closing unblocks the umbrella             |
| `FBP-014B` final integrated E2E evidence run | yes — `FBP-013` and `FBP-014A` | Both deps now `done`; Gemini can proceed with the integrated staging evidence run |
| `FBP-015` deferred roadmap packet            | indirect — via `FBP-014`       | Remains queued behind FBP-014 completion                                          |

`FBP-014A` closed at commit `15:19 UTC 2026-04-16` with the cross-surface E2E scaffold
(scenario matrix, fixtures, E2E-001/002/004 scripts, dry-run runner, evidence pack).

---

## 7. Acceptance Criteria Verification

The three acceptance criteria from FBP-013-SIDECAR-ACCEPTANCE are verified:

| AC   | Criterion                                                                                                | Verdict                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | Staging deploy, smoke, UAT, pilot/production evidence have real output and sign-off framework            | **PASS** — live GHA run `#24522301392` is the deploy proof; smoke static evidence is reviewable; UAT sign-off framework with named roles is defined in FBP-013C §7                              |
| AC-2 | Manual rollout matrix and `/api/admin/flags` operational gap correctly handled (not only documented)     | **PASS** — deploy ordering is machine-enforced by GHA graph; `/api/admin/flags` is implemented; manual rollout matrix is explicitly documented as intentional interim control, not an oversight |
| AC-3 | Every major execution family's paired verification child is integrated back into final evidence closeout | **PASS** — §3 of this document lists all 8 upstream families with their closeout commits; FBP-013D §6.2 cross-links each family to its paired sidecar verification artifact                     |

---

## 8. Non-Claims

This umbrella does **not** claim:

- Named live pilot or production sign-off has been collected
- All deferred UAT items are resolved
- The runtime flag-evaluation client is operational
- Manual tenant/city/module rollout has been executed

---

## 9. Owner Closeout Statement

All four child evidence packs (`FBP-013A`, `FBP-013B`, `FBP-013C`, `FBP-013D`) are
frozen and `done`. All supporting sidecars are `done`. All upstream execution families
carry closeout commits. The three acceptance criteria are verified.

The evidence closeout gates (staging deploy, smoke static, UAT static) all PASS.
Pilot and production rollout gates remain correctly on HOLD pending live sign-off.

`FBP-013` is ready for Codex reviewer sign-off.  
Upon approval, `FBP-014` / `FBP-014B` are immediately unblocked for Gemini to execute
the final integrated cross-repo evidence run.
