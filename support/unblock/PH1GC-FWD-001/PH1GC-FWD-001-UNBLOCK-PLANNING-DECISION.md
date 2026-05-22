# PH1GC-FWD-001 — Unblock Planning Decision

Last updated: 2026-05-22
Owner: Codex
Reviewer: Codex2
Parent task: `PH1GC-FWD-001`
Unblock task: `PH1GC-FWD-001-UNBLOCK-PLANNING-DECISION`
Kind: `planning_decision`

## Decision

`PH1GC-FWD-001` does not need a new product decision or a new in-repo
contract decision.

The canonical planning artifacts already define the forwarder lane as an
external-platform gate with a named evidence bar for any uplift from
`EXTERNAL-GATED` to sandbox-backed proof. This unblock therefore resolves by
routing the parent task back to that existing gate, not by changing product
semantics and not by relabeling repo-local proof as sandbox proof.

Recorded outcome:

1. `PH1GC-FWD-001` remains `blocked`.
2. No scope cut is introduced.
3. Explicit external follow-up is still required before `WF-FWD-001` or
   `PH1GC-FWD-001` can claim sandbox evidence.

## Why this resolves the blocker

The missing item was not an unresolved business rule. The missing item was a
confirmation of which planning path governs the forwarder proof lane.

That planning path is already present in repo:

1. `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
   section `3.3 WF-FWD-001` defines forwarder as the third-party platform
   flow, keeps the design gap at the evidence-classification layer, and says
   the gate only uplifts when the required forwarder proof packet exists.
2. `docs/00-context/phase1-origin-dev-execution-worklist-20260519.md`
   Workstream `D` distinguishes a sandbox harness from real provider proof,
   requires the harness to stay labeled as sandbox rather than production
   partner proof, and keeps real provider proof as a separate requirement.
3. `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
   keeps `WF-FWD-001` at `EXTERNAL-GATED`, says any uplift is gated on real
   partner sandbox evidence, and states the working rule `No over-claim`.
4. `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` still
   records `WF-FWD-001` as `EXTERNAL-GATED` and says live forwarded-task
   seeds, callback behavior, and platform-adapter confirmation remain outside
   repo-only closure.
5. `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` already names
   the concrete missing external inputs in `EXT-002-BLK-001` through
   `EXT-002-BLK-007`.

Because those planning sources already converge, this unblock does not create
new product truth. It records that the parent remains governed by the existing
external gate and that the remaining work is external-input acquisition plus
evidence collection.

## Canonical routing basis

The routing decision recorded here is:

1. Keep `WF-FWD-001` at `EXTERNAL-GATED`.
2. Keep `PH1GC-FWD-001` blocked until the forwarder integration owners provide
   the external inputs already named in `EXT-002-BLK-001` through
   `EXT-002-BLK-007`.
3. Treat repo-local forwarder verification as informative but non-uplifting.
   It may support guardrail coverage, but it does not satisfy the sandbox
   proof bar defined by the planning artifacts above.
4. Do not restate stubbed or repo-local behavior as sandbox-partner proof.
5. Resume the parent only when the external bundle is ready and the sidecar can
   collect the full directive `§D` proof set against an approved forwarder
   path.

## Current evidence boundary

`support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` records the
current forwarder posture as `partial evidence only` and explicitly keeps
`WF-FWD-001` at `EXTERNAL-GATED`.

That evidence pack already shows why repo-only work cannot clear this planning
lane today:

- no non-interactive credential path was available
- the older documented staging host returned `404`
- the newer internal hostname was not reachable from this machine
- no live forwarded-task seed or callback chain was available to validate
  `EXT-002-BLK-004` through `EXT-002-BLK-007`

This confirms that the unresolved portion is external execution input, not a
missing semantic rule inside the repo.

## Parent next step

`PH1GC-FWD-001` should stay `blocked` with this exact next step:

> Wait for the forwarder integration owners to provide approved API contract
> authority, a reachable staging endpoint, a non-interactive credential path,
> signed webhook/replay-proof samples, and at least one seeded forwarded-task
> flow so `FWD-LIVE-001` can collect and verify `EXT-002-BLK-001` through
> `EXT-002-BLK-007` evidence without over-claiming `WF-FWD-001`.

When those prerequisites land, the owner should:

1. Collect the full directive `§D` proof set in
   `support/sidecars/FWD-LIVE-001/`.
2. Verify the evidence resolves `EXT-002-BLK-001` through
   `EXT-002-BLK-007`.
3. Only then propose any gate uplift for `WF-FWD-001`.

## Scope cut

Out of scope for this unblock:

- changing L1 product truth
- inventing a new repo-local forwarder contract to stand in for partner
  authority
- reclassifying repo-local or stub proof as sandbox proof
- uplifting `WF-FWD-001` without the named external inputs
- claiming `PH1GC-FWD-001` is repo-locally finishable

## Non-claim

This packet does not claim:

- that `WF-FWD-001` passed
- that the forwarder sandbox proof exists today
- that the missing blocker is a repo bug
- that a new product or contract decision was required

## Canonical artifacts cited

- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
- `docs/00-context/phase1-origin-dev-execution-worklist-20260519.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`

## Delivery evidence

Closeout commit, push, and review metadata will be appended through the normal
task lifecycle once the owner hands off this packet for review.
