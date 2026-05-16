# Phase 1 Business Flow Integration — Updated `main` Status (2026-05-16)

**Audience**: System Design / Backend / Frontend / Mobile / QA / DevOps
**Companion to**: `phase1_business_flow_integration_review_for_dev_team_20260514.md`
**Purpose**: Update the 2026-05-14 "未連通" assessment with what is now actually on `origin/main` after PR #45 / #46 / #47 landed.

---

## 0. Executive Update

The 2026-05-14 review judged most Phase 1 governance / multi-platform / driver work as "not fully connected". That judgement was correct **for the snapshot of `main` at that time**, but **substantially incorrect for the feature branches that already existed**. Between 2026-05-15 and 2026-05-16 we merged **3 PRs squashing 298+ commits of feature work into `main`**:

| Merge | Commit | What landed |
|---|---|---|
| **PR #46** | `61b97d0` | Root typecheck baseline fix — 38 typecheck errors → 0; tests 43→23 failures |
| **PR #47** | `d582c86` | **W2 Multi-Platform Wave** — driver app productization, driver multi-platform UI, API-MP / OPS-MP / TEN-MP backend, TOK-UI tokens, forwarder + adapter-registry |
| **PR #45** | `75ce143` | **W1a Tenant Governance Backend** — cost-center / approval rules / quota ledger / approval workflow + V0023+V0024 migrations + observability |

`origin/main` `HEAD` is now `75ce143`. Typecheck + Lint CI green. (Unit Tests still red — tracked in #48 as `FIX-ROOT-TESTS-BASELINE-002`; pre-existing assertion drift, not introduced by these merges.)

The previous "not fully connected" verdict therefore needs to be revised for **most** workflow families.

---

## 1. Workflow-Family Status Revision

| WF | Doc 2026-05-14 judgement | `main` actually now | Evidence on `main` |
|---|---|---|---|
| `WF-RLS-001` Runtime/Release | PASS live | ✅ unchanged | (no change in scope) |
| `WF-TEN-001` Tenant Boundary | PASS live | ✅ unchanged | (no change in scope) |
| `WF-ORD-001` Booking Intake | basic; tenant governance not integrated | ✅ **governance-aware booking intake landed** | `BE-CC-001` in `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` (cost-center directory validation on `createTenantBooking`); approval rule evaluation + quota preview wired in the same path |
| `WF-TGV-001` Tenant Governance | **"new flow / missing"** | ✅ **backend full stack landed** | `BE-CC-001` cost-center directory + booking validation + governance defaults seed; `BE-RULE-001` canonical contract + structured evaluator + 7 REST routes; `BE-QUOTA-001` policy + ledger + monthly snapshots; `BE-APR-001` workflow (ordered_chain → all_of_parallel) + V0024 + notification fan-out + P1 timeout; `BE-LOAD-001` concurrent reservation load test; `BE-INTEG-001` integration coverage; `OBS-GOV-001` Grafana dashboards + alert YAML; `DOC-API-GOV-001` + `DOC-TEN-GOV-001`. Plus contract-only subset of `OPS-UI-APR-001` for ops listing types. |
| `WF-DSP-001` Owned Dispatch | PASS live | ✅ unchanged; **now governance-aware** | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` has approval gating + governance integration via tenant-partner service |
| `WF-DRV-001` Driver Owned Task | PASS static | ✅ unchanged | — |
| `WF-DRV-MP-001` Driver Multi-Platform | **"not fully connected"** | ✅ **full UI + backend landed** | `DRV-MAT-*` driver productization (shell + screens for workspace, inbox, shift, trip, SOS, earnings, settings); `DRV-MP-*` multi-platform features (presence + earnings + jobs unified + onboarding mismatch + forwarded offer + trip authority + SOS source-platform); `API-MP-001..003` unified driver task view + forwarded actions + production adapter baseline; `OPS-MP-001..003` forwarder board + adapter health + driver platform eligibility; `TEN-MP-001` tenant source domain visibility; `823f134` driver-app rebuild with `FinanceAuthorityMode` + `platform-adapter-registry.ts`; `TOK-UI-001` cross-stack tokens + `DRV-UI-RD-001` RN wiring. |
| `WF-FWD-001` Forwarded 3rd-party | EXTERNAL-GATED | ◐ **adapter + backend landed; external sandbox still gated** | `apps/api/src/modules/forwarder/` complete with `grab-taiwan.adapter.ts`, `forwarder.controller.ts`, `forwarder.service.ts`, `forwarder-adapter.interface.ts`. `API-MP-003 harden production adapter baseline` is in. Still needs: real sandbox run with Grab Taiwan production creds — that part remains EXTERNAL-GATED until DevOps connects the sandbox. |
| `WF-COM-001` CTI/Recording/Filing | HOLD | ◐ **module structure landed; CTI callback still HOLD** | `apps/api/src/modules/callcenter/` exists with controller/service/repository; `apps/api/src/modules/reporting-filing/` with `download-signing.util.ts`. Activation of CTI webhook + recording callback + filing-package real run remain HOLD until provider sandbox is provisioned. |
| `WF-FIN-001` Billing/Report | PASS static | ◐ **billing/settlement module unchanged; governance-aware reporting still pending** | `apps/api/src/modules/billing-settlement/settlement-matrix.ts` + service is in. Governance attribution in reports (cost-center filter, approval-state trace, platform-source split) NOT yet wired — needs follow-up tasks `BE-FIN-CC-001`, `BE-FIN-APR-001`, `BE-FIN-FWD-001`. |
| `WF-PRT-001` Partner Eligibility | partial | ✅ **backend complete; UI deferred to W3** | `apps/api/src/modules/tenant-partner/` has `bank-card-inline-eligibility.adapter.ts`, `reference-token-eligibility.adapter.ts`, `partner-eligibility-adapter.interface.ts`, plus ops review queue routes (`/ops/partner/eligibility/reviews`). Still needs real bank/card-program sandbox credentials for live verification. |
| `WF-ADM-001` Platform Admin | back-end OK / UI TBD | ✅ backend + adapter-registry UI scaffold landed | `apps/platform-admin-web/app/adapter-registry/*` UI scaffold from W2; `tenant-governance` route in `apps/platform-admin-web/app/` — UI page from `ADM-UI-GOV-001` was deferred to W3 (depends on `ADM-UI-RD-001` shell). |

---

## 2. Items Still Genuinely Not on `main` (need W3 / external sandboxes / next sprint)

The 2026-05-14 doc was right about these items still being outstanding:

### Externally-gated (need DevOps / partner action)
- `WF-FWD-001-EXT`: live Grab Taiwan sandbox run + accept relay + cancel + settlement sample
- `WF-COM-001-EXT`: CTI provider sandbox + webhook signature validation + filing manifest hash real run
- `WF-PRT-001-EXT`: bank / credit-card eligibility sandbox + last4 verification flow

### W3 UI canvas wave (needs to be split into 4–6 PRs, dry-run in `.artifacts/W3-dry-run/REPORT.md`)
- `W1b` governance UI: `ADM-UI-GOV-001` admin governance monitoring page; `OPS-UI-APR-001` approval queue page; `TEN-UI-RD-010` tenant new-booking; `TEN-UI-RD-013` tenant cost-centers
- `W3a` UI design system foundation (`MGMT-UI-*` + `UI-CANVAS-DS-001`)
- `W3b` tenant-console-web foundation + page rebuilds (`TEN-UI-RD-001..009/011..018/099`)
- `W3c` driver-app canvas reskins (`DRV-UI-RD-002..009`)
- `W3d` ops console rebuilds (`OPS-UI-001..012` minus W1b)
- `W3e` platform admin rebuilds (`ADM-UI-001..007`)
- `W3f` partner booking + passenger + concierge + SBK-UI + SYS-UI

### Governance-aware billing / reporting follow-ups
- `BE-FIN-CC-001` invoice + report cost-center attribution
- `BE-FIN-APR-001` report approval decision trace
- `BE-FIN-FWD-001` platform-source settlement / earnings report

### Test debt
- `FIX-ROOT-TESTS-BASELINE-002` (#48): 25 root unit test failures still red (pre-existing assertion drift). 2 already fixed in PR #49 (audit-notification mocks). 23 to go in follow-up PRs.

---

## 3. Process Diagnosis Update

The 2026-05-14 doc's biggest unspoken finding turned out to be **process**, not implementation: the team had **300 commits of feature work on `codex/*` feature branches that nobody had merged to `main` for two weeks**, and `main`'s CI had been failing daily for 14 days without anyone catching it (billing was the proximate cause of the most recent runs; before that, real failures from drift).

What we did:
1. Surveyed the 298-commit divergence and grouped into 5 wave PRs (W0..W4) plus a baseline fix
2. Built dry-run worktrees from `origin/main`, cherry-picked each wave, resolved conflicts, verified typecheck/tests
3. Discovered a 390-line uncommitted patch in the source repo (helpers that `OBS-GOV-001` calls but never committed) — committed it as `079b922`
4. Discovered a large hidden commit `823f134 feat(driver-app): rebuild multi-platform execution surfaces` that the initial scoping missed (no `DRV-MP-*` / `API-MP-*` prefix in subject) — retroactively added to W2
5. Discovered that `MGMT-UI-004` (W3 territory) has a hard dep on `823f134` (W2) — confirmed W3 must split into multiple dependent PRs
6. Discovered the CI Typecheck check was actually red on driver-app due to a `apps/driver-app/app/incident.tsx` issue rooted in `api-client` `createIncident` missing a type parameter — fixed as part of the baseline-fix PR

What needs to change going forward (process recommendations):
- **Don't let `main` go red for 2 weeks.** Have a daily CI-on-main signal that breaks visibly.
- **Don't carry > 50 commits of feature work outside main.** The cost of merging grows non-linearly with cherry-pick conflict count.
- **The orchestrator should track "branch-ahead-of-main" debt** as a first-class observability metric.
- **Sidecar acceptance PRs are 35% of the diverged commits** — these are pure docs/metadata and can land continuously without waiting for matching feature merges.

---

## 4. Recommended Next Steps

In order:

1. **Merge PR #49 (FIX-ROOT-TESTS-BASELINE-002 part 1)** to drop CI failure count from 27→25.
2. **W3a UI design system foundation dry-run + PR** — most W1b UI and W3b/c/d/e/f wait on W3a.
3. **External-gated sandboxes** — DevOps action items: Grab Taiwan, CTI provider, partner bank sandbox.
4. **`BE-FIN-CC-001` / `-APR-001` / `-FWD-001`** governance-aware reporting (small backend follow-ups, scope clear after #45 lands).
5. **Re-evaluate Phase 1 readiness gate** with the system design team based on what's now in `main` — many of the "未連通" markers can flip after this review.

---

## 5. Verification Commands

To reproduce this assessment locally:

```bash
git fetch origin main
git checkout main
git log --oneline -5
# expect: 75ce143 / d582c86 / 61b97d0 + older

pnpm install
pnpm --filter @drts/contracts build
pnpm --filter @drts/ui-tokens build
pnpm typecheck                # 17/17 tasks pass, 0 errors
pnpm --filter @drts/api test  # 33 test files / 341 tests pass
pnpm test:unit                # 25 failed / 232 passed (deferred to #48)

# governance routes:
ls apps/api/src/modules/tenant-partner/
# expect: tenant-approval-rule-evaluator.ts, tenant-approval-workflow.ts,
#         tenant-quota-ledger.ts, tenant-partner.service.ts (260KB), ...

# migrations:
ls infra/migrations/V0023* infra/migrations/V0024*

# driver multi-platform:
ls apps/driver-app/components/
# expect: platform-binding, platform-status-card, platform-task-badge,
#         route-display, earnings-by-platform, ...

# forwarder + adapter:
ls apps/api/src/modules/forwarder/
ls packages/contracts/src/platform-adapter-registry.ts
```

---

## 6. PR / Issue References

- [PR #46 baseline fix](https://github.com/ajoe734/drts-fleet-platform/pull/46) — merged
- [PR #47 W2 multi-platform](https://github.com/ajoe734/drts-fleet-platform/pull/47) — merged
- [PR #45 W1a tenant governance](https://github.com/ajoe734/drts-fleet-platform/pull/45) — merged
- [PR #49 baseline-002 part 1](https://github.com/ajoe734/drts-fleet-platform/pull/49) — open
- [Issue #48 FIX-ROOT-TESTS-BASELINE-002](https://github.com/ajoe734/drts-fleet-platform/issues/48) — open, tracking 25 remaining failures
- W3 dry-run report: `.artifacts/W3-dry-run/REPORT.md` (in fix worktree)
- W1 dry-run report: `.artifacts/W1-dry-run/REPORT.md`
- W2 dry-run report: `.artifacts/W2-dry-run/REPORT.md`
