# GAP-VERIFY Unblock Planning Decision

## Scope

- Task: `GAP-VERIFY-UNBLOCK-PLANNING-DECISION`
- Parent: `GAP-VERIFY`
- Owner: `Codex2`
- Reviewer: `Codex`
- Decision date: `2026-06-05`
- Decision type: Routing decision (no new product/contract change)

## Diagnosis

`GAP-VERIFY` is not blocked by a missing product or contract decision.

The current blocker is a machine-truth routing defect:

1. The parent task is still recorded as `blocked`, even though the completed
   helper `GAP-VERIFY-UNBLOCK-MANUAL-UNBLOCK` already resolved the prior
   reviewer-wait state and routed the parent back to executable fix work.
2. The parent still depends on `GAP-OPS-LIST-RSC`, `GAP-PA-FLEET-SHELL`,
   `GAP-PA-PRICING-TABS`, and `GAP-E2E-SUITE`, but those task IDs do not exist
   in current machine truth. That makes the dependency graph stale rather than
   semantically unresolved.
3. The remaining failures named on the parent are implementation/integration
   defects on live dev: Ops vehicle detail HTTP 500 and Platform Admin pricing
   tab URL round-trip behavior.

## Canonical Evidence

| Source | Finding |
| --- | --- |
| `docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md` §1, §6, §7 | Phase 1 keeps independent apps and forbids a unified multi-app shell. The repo already has the shell/topology decision; `GAP-VERIFY` does not need a new shell product decision. |
| `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §5.10 | `/pricing` is already defined as a four-tab governance surface. The expected IA and tab behavior are already canonical. |
| `docs/05-ui/platform-admin-body-parity-closeout-20260602.md` §3 | Platform Admin's accepted UI closeout already records `One shell only` as `PASS`. `/fleet` does not need a new planning decision; it needs integration verification on dev. |
| `ai-status.json` task slice `GAP-VERIFY` | The parent's own `next` field already describes the concrete live-dev defects still failing acceptance: Ops `/vehicles/veh-demo-001` HTTP 500 and Platform Admin `/pricing` tab clicks pinned at `/pricing`. |
| `ai-status.json` task slice `GAP-VERIFY-UNBLOCK-MANUAL-UNBLOCK` | The earlier unblock already resolved the old reviewer wait and explicitly routed `GAP-VERIFY` back to executable fix work rather than a planning-semantics question. |

## Decision

No new product, UI-contract, or backend-contract decision is required.

`GAP-VERIFY` is unblocked by correcting its routing:

1. Treat the parent as an execution/integration task, not a planning task.
2. Stop treating the stale dependency IDs as authoritative blockers.
3. Use the existing canonical UI/shell decisions:
   - Platform Admin remains a single-shell app.
   - `/pricing` remains a four-tab surface.
   - The audit target is still zero broken routes on dev after fixes deploy.

## Scope Cut And Explicit Follow-Up

No scope cut is needed for the parent acceptance. The scope remains:

- rerun the browser audit on live dev
- confirm zero broken routes
- refresh the scoreboard evidence

The explicit follow-up needed before the parent can pass is execution work, not
planning work:

1. fix Ops `/vehicles/veh-demo-001` so the live-dev route stops returning
   HTTP 500
2. fix Platform Admin `/pricing` tab navigation so tab clicks round-trip via
   URL state instead of staying pinned at `/pricing`
3. deploy those fixes to dev
4. rerun the browser audit and update the scoreboard artifact

If supervisors want dependency gating, they should mint or retarget real
executable fix tasks for those defects rather than keeping `GAP-VERIFY`
blocked on nonexistent task IDs.

## Parent Unblocked Next Step

Resume `GAP-VERIFY` as executable follow-up:

> Replace the stale dependency-based block with concrete fix routing. Either
> reopen or mint execution tasks for the live-dev Ops vehicle-detail 500 and
> Platform Admin pricing-tab URL-sync defects, land/deploy those fixes, then
> rerun the browser audit and refresh the functional gap report scoreboard.

The parent should not remain blocked on a missing product/contract decision.

## Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only. Canonical shell and pricing behavior decisions already exist; no new product/contract change is needed. |
| Record the decision | Recorded here: `GAP-VERIFY` is an execution-routing problem, not a planning-semantics gap. |
| scope cut | Not needed. Parent acceptance remains unchanged. |
| or explicit follow-up needed by the parent task | Recorded above as the concrete live-dev fix/deploy/rerun sequence. |
| Produce task-scoped commit/push/PR evidence for any canonical change | To be recorded in task status handoff and branch history for this artifact addition. |
| Update the parent task with the concrete unblocked next step | The next step is to route or create real executable fix work for the two remaining live-dev defects, then rerun the audit. |
