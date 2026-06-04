# GAP-VERIFY — Unblock Planning Decision

**Task ID:** `GAP-VERIFY-UNBLOCK-PLANNING-DECISION`
**Parent task:** `GAP-VERIFY`
**Owner:** `Codex`
**Reviewer:** `Codex2`
**Decision date:** 2026-06-04
**Decision type:** Routing decision (no new product/contract change)

---

## 1. Decision

`GAP-VERIFY` is **not** blocked on a missing product or contract decision.
The canonical execution truth already says what the parent must do: re-run the
browser gap audit on live dev after the fix wave, then update the report
scoreboard from actual dev evidence.

This unblock task therefore resolves to:

- **No new L1/L2 product decision**
- **No schema / contract change**
- **No scope cut**
- **Explicit execution follow-up for the parent task**

The remaining issue is execution and integration evidence:

- the parent's `2026-06-04 02:56:54Z` re-audit still observed live dev failures
  (`/revenue` 500, `/vehicles/veh-demo-001` 500, `/pricing` tab regression,
  `/attendance` tab regression)
- one dependency (`GAP-E2E-SUITE`) is still `branch_pushed`, which affects
  regression automation but does **not** create a missing planning-semantic
  blocker for the parent's manual dev re-audit

## 2. Canonical Evidence

| Source | Finding |
| --- | --- |
| `AI_COLLABORATION_GUIDE.md` §2 | Product semantics must come from higher-precedence canonical truth; unresolved product choices go to `PHASE1_OPEN_QUESTIONS.md`. No such open product choice exists for `GAP-VERIFY`. |
| `scripts/ai-status.sh show GAP-VERIFY` | The parent is a dev-runtime verification task: re-run browser audit on dev, confirm 39 routes, single shell, and tab round-trips, then refresh the scoreboard artifact. |
| `scripts/ai-status.sh show GAP-OPS-LIST-RSC` | The three RSC fixes for `/drivers`, `/vehicles`, and `/contracts` are already reconciled to `origin/dev@721b615f...`. |
| `scripts/ai-status.sh show GAP-PA-FLEET-SHELL` | The `/fleet` double-shell fix is done and already squash-merged to `origin/dev` (`#508` / dev commit `1256f6d9`), so the shell decision is not missing. |
| `scripts/ai-status.sh show GAP-PA-PRICING-TABS` | The `/pricing` URL-driven tab contract is already on `origin/dev@48ac41ed...`; the tab behavior decision is not missing. |
| `scripts/ai-status.sh show GAP-E2E-SUITE` | The deterministic route suite is `done` but only `branch_pushed`; this is an integration follow-up for CI regression coverage, not a planning blocker for `GAP-VERIFY`. |
| `docs/05-ui/dev-runtime-functional-gap-report-20260603.md` on branch `codex/gap-verify` at commit `a6de0eae` | The parent's latest report refresh explicitly says the `2026-06-04 02:56:54Z` live dev re-run still fails acceptance with `2` confirmed HTTP 500 routes plus `2` tab-strip regressions. |
| `support/sidecars/GAP-VERIFY/GAP-VERIFY-SIDECAR-ACCEPTANCE.md` on branch `claude/gap-verify-sidecar-acceptance` at commit `e4e83090` | Three functional fix dependencies are reachable from `origin/dev`; `GAP-E2E-SUITE` is not yet on `origin/dev`, but that only delays persistent regression protection, not the parent's immediate dev audit. |

## 3. Why This Is Not A Product/Contract Blocker

The parent task already has a settled contract:

- verify all 39 routes on **live dev**
- confirm **0 HTTP 500**
- confirm **single shell everywhere**
- confirm **tab strips round-trip**
- refresh the scoreboard/report from observed evidence

Nothing in that acceptance depends on a missing business rule, API contract, or
canonical product decision. The blocker was misclassified because live dev
still failed the audit after the latest run, but that is an execution-state
fact, not a semantics gap.

The only unresolved items are:

- whether live dev now reflects every expected fix
- whether the remaining `/vehicles/[vehicleId]` and `/attendance` regressions
  need new implementation tasks
- when the deterministic route suite will be merged to `dev`

Those are routing / execution follow-ups, not missing product truth.

## 4. Scope Cut And Follow-Up

No scope cut is required. The parent scope remains valid.

What changes is the routing:

1. `GAP-VERIFY` should resume as an execution task, not stay blocked on
   planning semantics.
2. The parent should re-run the live dev browser audit against the current dev
   deployment and refresh `docs/05-ui/dev-runtime-functional-gap-report-20260603.md`.
3. If the same four live regressions still reproduce, route them as concrete
   implementation / integration defects:
   - ops `/vehicles/[vehicleId]`
   - ops `/attendance` tab round-trip
   - and, only if still reproducible on current dev, `/revenue` or `/pricing`
4. Track `GAP-E2E-SUITE` merge-to-dev separately as regression-guard
   hardening, not as a blocker on the parent's manual re-audit acceptance.

## 5. Parent Task Next Step

The concrete next step for `GAP-VERIFY` is:

> Resume the task in execution. Re-run the live dev browser audit on the
> current `origin/dev` deployment, refresh
> `docs/05-ui/dev-runtime-functional-gap-report-20260603.md` with the new
> scoreboard and evidence, and treat any remaining failures as implementation /
> integration bugs rather than missing product semantics. `GAP-E2E-SUITE`
> remaining branch-only should be recorded as follow-up regression hardening,
> not as a blocker for the manual dev audit.

## 6. Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only: no missing product/contract decision exists for `GAP-VERIFY`; the parent is an execution/evidence task. |
| Record the decision | Recorded here as a routing decision with no new L1/L2 semantic change. |
| scope cut | Not needed. Parent scope remains the same. |
| or explicit follow-up needed by the parent task | Recorded in §4 and §5: resume dev re-audit, refresh scoreboard, route any remaining failures as concrete defects. |
| Produce task-scoped commit/push/PR evidence for any canonical change | Delivered on branch `codex/gap-verify-unblock-planning-decision` with this unblock artifact. |
| Update the parent task with the concrete unblocked next step | The parent should point to the live dev re-audit + scoreboard refresh step above. |
