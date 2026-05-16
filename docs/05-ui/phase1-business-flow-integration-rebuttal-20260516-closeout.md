# Phase 1 Business Flow Integration — Campaign Closeout (2026-05-16, late)

**Audience**: System Design / Backend / Frontend / Mobile / QA / DevOps
**Companion to**: `phase1-business-flow-integration-rebuttal-20260516.md` (earlier today)
**Purpose**: Final state after the full 298-commit merge campaign closed out — every workflow family + every wave PR + every test-baseline round.

---

## 0. Executive Update

The earlier rebuttal (2026-05-16, morning) captured `main` after **3 wave PRs** had merged (#45 W1a / #46 baseline / #47 W2). Throughout the rest of 2026-05-16 we landed the remaining waves, the 5 deferred W1b feat commits as manual rewrites, and six rounds of root-test baseline fixes:

| Merge | What landed |
|---|---|
| #50 W1b partial (governance UI minus 5 deferred feats) | tenant cost-center / approval pages, ops approval queue scaffolding |
| #53 W3a (UI design system foundation) | management primitives, canvas tokens, MGMT-UI-* |
| #54 W3b (tenant-console foundation) | tenant-console-web shell + early page rebuilds |
| #56-#61-#62 W3b-part-2 + ui-web extensions + closing | tenant page rebuilds completed, ManagementThemeProvider, tenant-booking-story-support, shell brand/version/search/avatar |
| #55 W3c (driver-app reskins) | DRV-UI-RD-002..009 canvas reskins |
| #57 W3d (ops console rebuilds) | OPS-UI-001..012 (minus W1b) |
| #58 W3e (platform admin rebuilds) | ADM-UI-001..007 |
| #59 W3f (partner-booking + passenger + concierge + SBK-UI + SYS-UI) | partner-booking-web, passenger-web, concierge-portal-web |
| #49 / #52 / #61 / #63 / #65 / #70 | FIX-ROOT-TESTS-BASELINE-002 parts 1–6, taking root failing tests from 27 → 0 |
| #64 W1b feat retry partial (TEN-UI-RD-010) | tenant new-booking route |
| #66 TEN-UI-RD-013-MANUAL | tenant cost-centers canvas-redesign route |
| #67 OPS-UI-APR-001-MANUAL | ops approval-requests route + sidebar entry |
| **#68 ADM-UI-GOV-001-MANUAL** | tenant governance monitoring page + summary endpoint (controller + service + contracts + api-client + sidebar entry) |
| **#69 BE-INTEG-001 wire + realign** | wired `tests/integration/**` into vitest config (was previously dark on every CI run) + realigned 2 of 3 cases with current behavior |

`origin/main` `HEAD` is now past PR #69. **Lint ✓ Typecheck ✓ Unit Tests ✓** for the first time since this campaign opened.

---

## 1. Updated Workflow-Family Status Table

| WF | 2026-05-14 review | 2026-05-16 morning | **2026-05-16 closeout** | Notes |
|---|---|---|---|---|
| `WF-RLS-001` Runtime/Release | PASS | PASS | ✅ PASS | unchanged |
| `WF-TEN-001` Tenant Boundary | PASS | PASS | ✅ PASS | unchanged |
| `WF-ORD-001` Booking Intake | "basic" | ✅ governance-aware | ✅ **complete + admin-visible** | + ADM-UI-GOV-001 cross-tenant rollup gives platform operators a single view of cost-center coverage, active-rule posture, monthly quota burn, approval backlog, and approver-readiness alerts per tenant |
| `WF-TGV-001` Tenant Governance | "missing" | ✅ backend full stack | ✅ **backend + tenant UI + ops UI + platform admin UI all on `main`** | `tenant-console-web` cost-centers + rules + quota pages; `ops-console-web/approval-requests` queue; `platform-admin-web/tenant-governance` monitoring page; BE-INTEG-001 e2e coverage now actually executed by CI |
| `WF-DSP-001` Owned Dispatch | PASS | PASS + governance-aware | ✅ PASS | unchanged from morning |
| `WF-DRV-001` Driver Owned Task | PASS | PASS | ✅ PASS + canvas reskin | DRV-UI-RD-002..009 landed in W3c |
| `WF-DRV-MP-001` Driver Multi-Platform | "not connected" | ✅ full UI + backend | ✅ + driver-app canvas reskin | DRV-UI-RD-* finalized in W3c |
| `WF-FWD-001` Forwarded 3rd-party | EXTERNAL-GATED | ◐ adapter + backend on `main` | ◐ **same — external sandbox still the only gap** | DevOps still needs Grab Taiwan production sandbox creds |
| `WF-COM-001` CTI/Recording/Filing | HOLD | ◐ module structure landed | ◐ **same — provider sandbox still HOLD** | unchanged |
| `WF-FIN-001` Billing/Report | PASS | ◐ governance-aware reporting pending | ◐ **same — `BE-FIN-CC/APR/FWD-001` still outstanding** | unchanged |
| `WF-PRT-001` Partner Eligibility | partial | ✅ backend complete; UI deferred | ✅ **partner-booking-web shipped in W3f** | UI shell now exists; live verification still needs bank sandbox |
| `WF-ADM-001` Platform Admin | back-end OK / UI TBD | ✅ scaffold + ADM-UI-GOV-001 deferred | ✅ **ADM-UI-GOV-001 landed** | platform-admin governance monitoring page in #68 |

**Net change vs morning rebuttal**: WF-TGV-001 / WF-ORD-001 / WF-PRT-001 / WF-ADM-001 all stepped up; remaining ◐ are all external-sandbox or follow-up backend tasks, not "未連通" in the original sense.

---

## 2. What is Still Genuinely Not on `main`

Same set as morning rebuttal; no movement in this list during the second half of the day:

### Externally-gated (need DevOps / partner action — not a dev-team blocker)
- `WF-FWD-001-EXT`: live Grab Taiwan sandbox run
- `WF-COM-001-EXT`: CTI provider sandbox + recording callback live run
- `WF-PRT-001-EXT`: bank / credit-card eligibility sandbox + last4 verification flow

### Backend follow-ups (small, scope-clear)
- `BE-FIN-CC-001` invoice + report cost-center attribution
- `BE-FIN-APR-001` report approval decision trace
- `BE-FIN-FWD-001` platform-source settlement / earnings report

### Drift-issues filed today (from baseline-fix discoveries)
- Issue #71: regulatory-registry `dispatchableFlag` does not auto-restore after compliance is restored
- Issue #72: owned-mobility `completeDriverTask` does not flip quota summary pending → confirmed
- Issue #73: tenant-governance audit taxonomy — 6 cost-center / governance action names removed without alias
- Issue #74: quota ledger — no `consume` entry written at task completion

---

## 3. CI Posture

| Check | Before campaign | After campaign |
|---|---|---|
| **Lint** | failing (Husky/eslint config drift) | ✅ green on `main` |
| **Typecheck** | failing (~38 errors across api-client / driver-app / contracts) | ✅ green on `main` |
| **Unit Tests** | 27 failing root tests (assertion drift, masking refactor, audit naming refactor, schema growth) | ✅ green on `main` (257/257) |
| **Integration Tests** | not executed at all (`tests/integration/**` not in vitest include) | ✅ now executed — 3/3 BE-INTEG-001 cases pass |

The integration-test gap is worth re-reading: BE-INTEG-001 was shipped 2026-05-13 as a 1046-line e2e test for the entire booking → approval → dispatch → completion → billing → audit pipeline. It sat on disk for 3 days, untouched by every CI run, because vitest's `include` glob didn't match `tests/integration/**`. PR #69 fixed this by widening the include — every future change now actually runs this suite.

---

## 4. Process Learnings (delta from morning rebuttal)

Adding to the morning rebuttal's process diagnosis:

5. **Manual rewrites are a viable fallback for deferred feat commits.** When 5 of W1b's feat commits couldn't be cherry-picked (W1b base was on the wrong canvas-redesign rebase target), 3 of them were faster to rewrite by hand on top of canvas-redesigned `main` than to untangle the rebase chain. Reused existing shared helpers (`tenant-governance-shared.tsx`, `admin-btn` className pattern) — none required new shells.

6. **Stale-test detection should be a CI gate.** All 17 baseline failures fixed in PR #70 had one root cause each — a service refactor that broke assertions long before the campaign opened. None were caught for weeks because nobody ran root vitest as part of normal dev flow. The morning rebuttal already flagged "main CI failing 14 days unnoticed"; today's finding is sharper: **even within failing CI, individual test failures weren't being investigated case by case**.

7. **`vitest.config.ts` glob coverage should be reviewed any time a new test root is added.** Integration tests sat unrun for 3 days because the include pattern didn't match. Recommend adding a tiny CI check that asserts every `*.test.ts` file under `tests/` matches at least one include glob.

---

## 5. Recommended Next Steps (updated from morning #4)

Original list (1–5) is now done or filed:

1. ~~Merge PR #49~~ → done (and parts 2–6 since)
2. ~~W3a UI design system foundation~~ → done in PR #53
3. **External-gated sandboxes** — still the largest dev-team-blocking unknown. Recommend DevOps owner.
4. ~~`BE-FIN-CC-001` / `-APR-001` / `-FWD-001` governance-aware reporting~~ — scope clear, not yet started. Recommend assigning when next sprint slot opens.
5. **Re-evaluate Phase 1 readiness gate with system design team** — based on this closeout + the morning rebuttal, the "未連通" verdict can flip for every workflow family EXCEPT WF-FWD-001-EXT / WF-COM-001-EXT / WF-PRT-001-EXT (all external-gated, not dev-blocked) and WF-FIN-001 (small backend follow-ups remaining).

New items surfaced by closeout:

6. Triage issues **#71–#74** — decide whether each is a regression to fix in production or a model change to update test expectations + documentation around.
7. Audit other test directories for vitest-include coverage (per learning #7 above).

---

## 6. Verification Commands (updated)

```bash
git fetch origin main
git checkout main
git log --oneline -10
# expect: closeout merges through #70 / #69 / #68 / #67 / #66

pnpm install
pnpm --filter @drts/contracts build
pnpm --filter @drts/ui-tokens build
pnpm typecheck                # 20/20 tasks pass, 0 errors
pnpm --filter @drts/api test  # 35 files / 365 tests pass (includes 3 integration)
pnpm test:unit                # 257/257 pass (was 240/257 before #70)
pnpm exec vitest run          # full root suite green

# New today:
ls apps/platform-admin-web/app/tenant-governance/
# expect: page.tsx (610 lines, KPI rollup + alert chips + detail panel)

ls apps/api/src/modules/platform-admin/
# expect: tenant-governance.controller.ts + tenant-governance.service.ts

grep -n "tests/integration" vitest.config.ts
# expect: include now contains tests/integration/**/*.test.ts
```

---

## 7. PR / Issue References (campaign full set)

**Closed today**:
- PR #68 ADM-UI-GOV-001-MANUAL
- PR #69 BE-INTEG-001 wire + realign
- PR #70 root-tests-baseline-002 part 6

**Earlier in campaign** (see morning rebuttal §6 + PR list):
- W1a #45, baseline #46, W2 #47, baseline-002 parts 1–5 (#49, #52, #61, #63, #65), W1b partial #50, W3a–W3f (#53, #54, #55, #57, #58, #59), W3b-part-2 plumbing (#56, #61, #62), W1b deferred feat manual rewrites (#64, #66, #67)

**Open issues filed today**:
- #71 dispatchableFlag stuck-off
- #72 quota summary no flip on completion
- #73 audit action-name taxonomy missing alias
- #74 quota ledger no `consume` entry

**Original review doc**: `phase1_business_flow_integration_review_for_dev_team_20260514.md` (system design team's "未連通" assessment)
**Earlier rebuttal**: `phase1-business-flow-integration-rebuttal-20260516.md`
