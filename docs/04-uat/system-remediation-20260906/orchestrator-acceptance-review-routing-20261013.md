# ORCH-ACCEPTANCE-REVIEW-ROUTING-20261013

Owner: Codex2. Reviewer: Gemini. Source base:
`1fba7476925bb29e6f2eeff7acbeb0ba16d0afb4`.

## Findings and repair boundary

The existing `resolve_dispatch_target` routes every acceptance task to its
owner. The original C123 reviewer must explicitly reopen frozen source, but
cannot do that from a foreign task worker: the existing transaction correctly
rejects it with `Dispatched worker cannot mutate a different task`.
The supplied actual-policy evidence is at
`.local/production-continuation-20261012T2330/actual-original-reviewer-routing-gap.json`
in the canonical root. Failed hosted run 38326823141 remains failed; its
evidence and C123 acceptance credits are outside this source task's writes.

Repair only the existing status transaction and managed dispatch path. Add an
acceptance-only request bound to task ID, candidate SHA/generation, reviewed
SHA, merge SHA and current reviewer. Requests do not transition lifecycle or
grant source authority. Reuse `review_ready_dispatch`, detached candidate
workspace and current task/role/candidate fences. Decline is reviewer-only;
actual rework uses existing reviewer `reopen`. Preserve dependency, external,
CI, merge and acceptance floors, and never overlap an active original worker.

## Verification ledger

| Finding / required acceptance | Source and repair | Old → new | Command / version / evidence | Pending limitation |
| --- | --- | --- | --- | --- |
| Explicit review request routes owner | `dispatch_policy.resolve_dispatch_target` | Baseline regression pending | `python3 -m unittest control_plane.tests.test_dispatch_policy.CandidateDispatchPolicyTest.test_requested_original_acceptance_routes_current_reviewer` | Repair in progress |
| `orchestrator_acceptance_review_routing_and_fences` | Status transaction, original-task fences, managed reviewer dispatch | Pending | Focused pure repository tests planned | No live original-task mutation in source work |
| `orchestrator_acceptance_review_routing_same_sha_review_ci_merge` | Existing candidate lifecycle | Pending | Final pushed candidate → Gemini → exact-SHA CI → protected dev merge | Handoff/independent evidence pending |
| `orchestrator_acceptance_review_routing_normal_tooling_activation` | Existing immutable release lifecycle | Pending | Supervisor release source/manifest hashes and heartbeat required | Supervisor-only activation after reviewed CI/merge; worker must not activate WIP |

Only repository Python checks run on this VM. No product, browser, PG or
Compose runtime is started. Full system acceptance remains NOT_ACHIEVED;
production is not deployed.
