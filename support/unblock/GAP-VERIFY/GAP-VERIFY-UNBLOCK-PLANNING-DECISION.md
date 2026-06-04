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

- the parent task `GAP-VERIFY` is currently `blocked`, but its machine-truth
  `next` field already describes live dev verification failures, not an
  unresolved product rule or API contract
- the unresolved work is to re-run the dev audit, refresh evidence, and route
  any still-reproducible failures as concrete implementation or integration
  defects

## 2. Canonical Evidence

| Source | Finding |
| --- | --- |
| `AI_COLLABORATION_GUIDE.md` §2 | Product semantics must come from higher-precedence canonical truth; unresolved product choices go to `PHASE1_OPEN_QUESTIONS.md`. |
| `PHASE1_OPEN_QUESTIONS.md` | No open item mentions `GAP-VERIFY`, `/pricing`, `/attendance`, `/revenue`, or an unresolved verification-time product contract that would require a new planning decision. |
| `scripts/ai-status.sh show GAP-VERIFY` | The parent is explicitly an execution verification task: re-run browser audit on dev, confirm 39 routes, single shell, tab round-trips, and refresh the scoreboard/report artifact. Its current `next` field lists live failures from the last re-run, which is an execution-state report rather than a planning gap. |
| `docs/05-ui/ops-console-parity-verification-20260602.md` | The ops route inventory and verification model already exist as execution evidence: route coverage, single-shell expectation, and remote-dev re-run after deploy are framed as verification/integration work, not a product-semantics question. |
| `docs/05-ui/platform-admin-body-parity-audit-20260602.md` | `/pricing` is already specified as a four-tab body-parity target, so the remaining issue is whether current dev behavior matches the settled UI contract, not what the contract should be. |
| `docs/05-ui/system-design-answers-all-apps-20260524.md` | Q-ADM10/Q-ADM11 already resolve the `/pricing` behavior: versioned pricing with sibling tabs under `/pricing`. This decision already exists in canonical planning artifacts. |
| `docs/05-ui/ops-console-body-parity-audit-20260602.md` | `/attendance` and `/revenue` are already enumerated as existing ops routes with parity targets, so remaining failures are implementation or integration drift, not missing scope definition. |

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
- which remaining route regressions still reproduce on current dev and therefore
  need concrete implementation follow-up tasks
- whether any regression should be routed to integration hardening after the
  re-audit

Those are routing / execution follow-ups, not missing product truth.

## 4. Scope Cut And Follow-Up

No scope cut is required. The parent scope remains valid.

What changes is the routing:

1. `GAP-VERIFY` should resume as an execution task, not stay blocked on
   planning semantics.
2. The parent should re-run the live dev browser audit against the current dev
   deployment and refresh its evidence artifact / scoreboard from current
   findings.
3. If the same live regressions still reproduce, route them as concrete
   implementation / integration defects tied to the failing routes or tab flows.
4. Keep regression automation or merge-to-dev hardening as a separate
   integration follow-up, not as a blocker on the parent's manual re-audit
   acceptance unless the parent task is explicitly re-scoped.

## 5. Parent Task Next Step

The concrete next step for `GAP-VERIFY` is:

> Resume the task in execution. Re-run the live dev browser audit on the
> current dev deployment, refresh the parent evidence artifact with the new
> scoreboard and findings, and treat any remaining failures as implementation /
> integration bugs rather than missing product semantics.

## 6. Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only: no missing product/contract decision exists for `GAP-VERIFY`; the parent is an execution/evidence task. |
| Record the decision | Recorded here as a routing decision with no new L1/L2 semantic change. |
| scope cut | Not needed. Parent scope remains the same. |
| or explicit follow-up needed by the parent task | Recorded in §4 and §5: resume dev re-audit, refresh scoreboard, route any remaining failures as concrete defects. |
| Produce task-scoped commit/push/PR evidence for any canonical change | Delivered on branch `codex/gap-verify-unblock-planning-decision` with this unblock artifact. |
| Update the parent task with the concrete unblocked next step | The parent should point to the live dev re-audit + scoreboard refresh step above. |
