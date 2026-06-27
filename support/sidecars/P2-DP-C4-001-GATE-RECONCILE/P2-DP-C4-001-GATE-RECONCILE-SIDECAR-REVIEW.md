# P2-DP-C4-001-GATE-RECONCILE — Review Packet & Evidence Summary

- **Sidecar task:** `P2-DP-C4-001-GATE-RECONCILE-SIDECAR-REVIEW`
- **Helper kind:** `review_packet` (support-only; does **not** mutate canonical truth)
- **Parent task:** `P2-DP-C4-001-GATE-RECONCILE` (owner `Codex2`, reviewer `Codex`, status `review`)
- **Packet owner:** `Claude` → **handoff reviewer:** `Codex2`
- **Prepared:** 2026-06-27 (post-merge of PR #977)

> Scope note: this is an independent evidence summary assembled from `origin/dev`
> machine truth to help the reviewer adjudicate the parent. It asserts no new
> canonical state. All line references are against `origin/dev` at the merge
> commit unless stated otherwise.

---

## 1. Canonical delivery (what landed)

| Field | Value |
| --- | --- |
| Merge commit | `24435d436448d48f496cd2d796e5398435d3d8d4` |
| PR | [#977](https://github.com/ajoe734/drts-fleet-platform/pull/977) — **MERGED** 2026-06-27T07:21:07Z |
| Base ← Head | `dev` ← `codex2/p2-dp-c4-001-gate-reconcile` |
| Diff size | 16 files, **+3583 / −76** |
| Gate service size | **1520 lines** on `origin/dev` (restored from the 83-line stub) |

**History-repair caveat (from parent `next`):** the canonical delivery is
`origin/dev@24435d436` via merged PR #977 **only**. Do **not** resume from the
local `codex/p2-dp-c4-001-gate-reconcile@6ac346ab8` head or the deleted
`codex2/...` remote head. PR #977 is merge evidence; the outstanding PostGIS
`ci-integ` reland is tracked separately (see §4).

### Files of record

```
apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts     1539 ++  (restored full gate)
apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.repository.ts    416 ++
apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller.ts    109 ++
apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.types.ts         166 ++
apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.module.ts         18 +-
apps/api/src/modules/.../tesla-telemetry/tesla-telemetry.policy.ts                 54 ++
apps/api/tests/integration/int-roc-001-operational-actions.test.ts                 54 +-   (stub-era fix #1)
apps/api/tests/integration/e2e-p2-008-human-fallback.test.ts                       88 ++   (stub-era fix #2)
apps/api/tests/integration/e2e-p2-006-evidence-freeze.test.ts                     138 ++
apps/api/tests/integration/int-evd-001-vehicle-evidence-gate.test.ts               94 +-
apps/api/tests/unit/sandbox-dispatch-gate.service.test.ts                          90 +-
apps/api/tests/integration/e2e-p2-test-helpers.ts                                 248 ++
packages/contracts/src/phase2-tesla-fsd-sandbox.ts                                631 +-
packages/contracts/src/index.ts                                                     9 ++
apps/api/.../owned-mobility/owned-mobility.service.ts                               4 ++
apps/.../tests/fixtures/dispatch-booking-fixture.ts                                 1 +
```

---

## 2. Acceptance question #1 — safety-critical ROC dataflow (RESOLVED)

**The question (from parent brief):** the restored gate computes
`roc: input.roc ?? rocRestriction(service fallback)` at the merge site, but the
downstream `reasonCodes` builders read only `input.roc`. Is the service-driven
ROC stop-new-dispatch / operational-hold code dropped from the decision? Is this
a **gate bug** (reason builders must consume the merged ROC) or a **test gap**
(tests must pass `input.roc` explicitly)?

**Verdict in the merged delivery: it was a gate bug, and it is fixed — by
merging upstream, at input-resolution time, so `input.roc` is *already* the
merged snapshot before any reason builder runs.** The fix is architectural
(single source of merged truth) rather than patching each call site.

### Evidence chain (`origin/dev:.../sandbox-dispatch-gate.service.ts`)

1. **Merge helper** — `mergeRocRestrictions(inputRoc, serviceRoc)` (:1494) unions
   `reasonCodes` (de-duped via `Set`) and OR-combines `stopNewDispatchActive`,
   `operationalHoldActive`, `humanFallbackActive`. Neither side is dropped.

2. **Service fallback resolved into the canonical input** — in the async input
   resolver (:472–:549):
   ```
   const rocRestriction = this.rocOperationsService?.getDispatchRestrictions(input.vehicleId);   // :472
   const mergedRocRestriction = this.mergeRocRestrictions(input.roc ?? null, rocRestriction ?? null); // :475
   ...
   return { ... roc: mergedRocRestriction, ... };   // :549
   ```
   So the resolved `SandboxDispatchGateInput.roc` is the **merged** snapshot.

3. **Reason builders consume the already-merged `input.roc`** — `buildEvaluationRecord`
   (:1452) → `normalizeInput` (:595) → `collectHardReasons` (:789), where
   `reasons.push(...input.roc.reasonCodes)` (:830) now reads the merged codes,
   because the merge happened upstream at step 2. The original bug (reason
   builders blind to the service fallback) cannot recur: there is no path where a
   builder sees a pre-merge `input.roc`.

4. **Defensive second merge for the ROC snapshot/telemetry surface** — a second
   `mergeRocRestriction` (:676) feeds the evaluation snapshot fields exposed to
   the ROC console (:741 `reasonCodes`, :743 `stopNewDispatchActive`,
   :745 `operationalHoldActive`, :746 `humanFallbackActive`), keeping the
   surfaced restriction flags consistent with the decision.

**Reviewer check (copy-paste):**
```bash
f=apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts
git show origin/dev:$f | sed -n '472,477p;549p;676,677p;741,746p;830p;1494,1518p'
```

---

## 3. Acceptance question #2 — two stub-era tests (FIXED)

Both stub-era tests were realigned to the async full-gate contract (`await` +
full input), mirroring the driver's `e2e-p2-006` template.

### 3a. `int-roc-001-operational-actions.test.ts`
Drives a ROC operational action through the **service** (`rocOperationsService`/
`/api/roc/...`) and evaluates the gate **without** passing `roc` in the
evaluate input, then asserts the service-driven codes appear in the decision —
i.e. it directly exercises the §2 service-fallback merge that was the bug:
```
decision.decision === "block"
decision.hardReasonCodes ⊇ ["RECORDER_UNHEALTHY", "ROC_STOP_NEW_DISPATCH", "ROC_OPERATIONAL_HOLD"]   // :224
GET /api/roc/vehicles → items[].{stopNewDispatchActive:true, operationalHoldActive:true,
                                 gateReasonCodes ⊇ [...same...]}                                       // :242
```
This is the regression guard: if the merge were removed, the service-only ROC
codes would not surface and these assertions fail.

### 3b. `e2e-p2-008-human-fallback.test.ts`
Now `await`s `evaluateDispatch` (:50) and asserts the human-fallback path:
```
humanFallbackActive: true   // :68, :76
decision: "block"           // :81
hardReasonCodes: arrayContaining([...])   // :82
```

**Reviewer check:**
```bash
git show origin/dev:apps/api/tests/integration/int-roc-001-operational-actions.test.ts | sed -n '222,250p'
git show origin/dev:apps/api/tests/integration/e2e-p2-008-human-fallback.test.ts     | sed -n '48,84p'
```

PR commit trail also records `vitest run` verification for
`sandbox-dispatch-gate.service.test.ts`, `int-roc-001-operational-actions.test.ts`,
`e2e-p2-006-evidence-freeze.test.ts`, `e2e-p2-008-human-fallback.test.ts`, and
`int-evd-001-vehicle-evidence-gate.test.ts`, plus `typecheck`/`build` for api and
enterprise-dispatch-web.

---

## 4. CI status at merge (honest accounting)

PR #977 merged at 07:21:07Z. **Logic/contract gates green; two infra-bound
checks red and accepted as a known dev-trunk gap, not a gate regression.**

| Check | Result | Notes |
| --- | --- | --- |
| unit | ✅ pass | gate unit suite realigned to async full gate |
| integration | ✅ pass | |
| typecheck | ✅ pass | |
| build | ✅ pass | |
| lint | ✅ pass | |
| Smoke acceptance | ✅ pass | |
| i18n / i18n-guard | ✅ pass | |
| BFF-only imports | ✅ pass | |
| Commit trailers | ✅ pass | |
| Runtime mirror guard | ✅ pass | |
| orchestrator-tests | ✅ pass | |
| **e2e** | ❌ fail | **all 22 hermetic scenarios FAIL (`FAIL (22): 001..022`)** |
| **ci-integ** | ❌ fail | aggregate gate over e2e |

**Why the e2e red is infra, not a C4-001 regression:** the failure set is
*all 22* scenarios, not the 8 gate-touching ones — an all-or-nothing systemic
DB-boot failure consistent with the known PostGIS-missing image on
`postgres:16` (`V0037/V0038` migrations require the PostGIS extension;
`ci-integ.yml` postgres service lacks it). The same red is present on the dev
trunk independent of this PR. The parent's own `next` field carries the
remediation: *"reland the PostGIS ci-integ fix from a fresh branch off current
origin/dev, rerun ci-integ, then treat PR #977 as merge evidence only."*

**Reviewer check:**
```bash
gh pr checks 977
gh run view --job 83800096917 --log-failed | grep -i 'FAIL ('   # → "FAIL (22): 001 002 ... 022"
```

---

## 5. Reviewer handoff (Codex2)

**Recommendation: the parent delivery satisfies its acceptance.** Both acceptance
items are met on canonical truth:

- ✅ Full safety gate restored (1520 lines on `origin/dev`, not the 83-line stub);
  no safety check left bypassed.
- ✅ Acceptance #1 — service-driven ROC stop-new-dispatch / operational-hold codes
  flow into the gate decision, via an upstream merge so every reason builder sees
  the merged `input.roc` (§2).
- ✅ Acceptance #2 — both stub-era tests (`int-roc-001`, `e2e-p2-008`) realigned to
  the async full-gate contract; `int-roc-001` is a genuine service-fallback
  regression guard (§3).

**Open item to confirm before considering the dev-deploy loop closed (NOT a
blocker for adjudicating this parent's logic):** `e2e` / `ci-integ` are red on the
known PostGIS infra gap (§4). This is environmental and already has a tracked
remediation in the parent `next` (reland PostGIS fix from a fresh branch + rerun
ci-integ). Suggest the reviewer treat PR #977 as merge evidence for the gate
logic and track the PostGIS reland as the remaining integration step.

**Suggested reviewer disposition:** approve the gate-logic delivery; carry the
PostGIS `ci-integ` reland as a separate follow-up so green e2e can be produced on
a PostGIS-enabled image.

---

## Appendix — verification index

| Claim | Command |
| --- | --- |
| Merge commit / PR state | `gh pr view 977 --json state,mergeCommit,mergedAt,baseRefName,headRefName` |
| Gate restored to full size | `git show origin/dev:apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts \| wc -l` |
| ROC merge dataflow (§2) | `… \| sed -n '472,477p;549p;676,677p;741,746p;830p;1494,1518p'` |
| Stub-era test fixes (§3) | `git show origin/dev:apps/api/tests/integration/int-roc-001-operational-actions.test.ts \| sed -n '222,250p'` |
| CI at merge (§4) | `gh pr checks 977` ; `gh run view --job 83800096917 --log-failed \| grep -i 'FAIL ('` |
