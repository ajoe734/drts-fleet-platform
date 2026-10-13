# ORCH-ACCEPTANCE-REVIEW-ROUTING-20261013

Owner: Codex2. Current assigned reviewer: Codex (the initial specification
named Gemini; the canonical task assignment and formal rework now name Codex).
Source base:
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

### ROUTING-REOPEN-ACTOR-FINDING: repaired locally, delivery gates pending

The Supervisor probe at checkpoint
`5854e3071d59869a9dc39da819e02dc323f84f92` and Codex's formal review of
candidate `dff3ceed068ab2942ba8dbf4ee7183517e1312dc` both confirm the same
unresolved trigger. The review source and precise repair boundary are in
`/home/lupin/workspace/drts-fleet-platform/.local/continue-unfinished-20261013T0144/ROUTING-REOPEN-ACTOR-FINDING.md`
and the canonical task's 2026-10-13T02:00:50Z reopen receipt.

Actual call path: `run_task_board_command` →
`TaskBoardCommandExecutor.execute_with_result` → `_guard_worker_command` →
`ai_status.command_reopen` → `_require_pending_acceptance_review` →
`_resolve_acceptance_review` → existing candidate/evidence clearing. The guard
checks `AI_NAME` against `ORCH_DISPATCH_AGENT` for request/decline only; reopen
trusts the claimed actor. With role owner, agent Codex2, claimed actor Codex,
and the exact public request ID/snapshot, the forbidden reopen exits 0,
consumes the request and removes candidate evidence. Expected: command exit 1
and byte-identical board/activity log.

This continuation first reproduced the locked candidate using a tooling-only
Git archive in the isolated evidence directory
`actor-repair-round2/baseline-dff3ceed`; `old-candidate-probe.log` records probe
exit 1 because the forbidden command succeeded. The existing 1,037-test pass
did not cover this case. New committed transaction regressions use the real
CLI/guard/persistence, with only the filesystem root isolated. Required repair:
pending acceptance-review reopen must use the actual reviewer dispatch with
a matching actor, before any handler/log mutation. Keep genuine unfenced
reviewer reopen, original nonacceptance permissions, same-owner request,
decline, foreign-task and stale candidate/generation/merge controls.

`_guard_worker_command` now applies the request/decline actor comparison to
the acceptance reopen path that consumes unresolved request metadata, and
requires reviewer dispatch before invoking the handler. It matches the
existing handler's status/request predicate, including malformed unresolved
metadata, without changing nonacceptance or resolved-request behavior.
The same supplied probe now exits 0: forbidden command exit 1, board unchanged,
candidate retained, request still pending (`fixed-probe.log`). New real
transaction tests pass (`actor-regression-green.log`): owner/reviewer actor
impersonation and owner-role negatives preserve board **and** activity-log
bytes; legitimate fenced/unfenced reviewer and nonacceptance controls pass.
The regression anchor is `ee296fc17`; full affected-suite results follow in
the final verification section before the new candidate is handed off.

## Implementation and protocol

`ai_status.command_request_acceptance_review` accepts only the owner, current
reviewer or Supervisor. `ACCEPTANCE_REVIEW_SNAPSHOT_JSON` must exactly match
the six fields in `dispatch_policy.acceptance_review_snapshot`: task ID,
candidate SHA/generation, reviewed SHA, merge SHA and reviewer. The source must
be canonical, merged and in acceptance with full SHAs, matching review/green
CI, and distinct owner/reviewer. Requests require a reason and evidence ref;
they receive an immutable request ID and timestamp. Existing valid pending
requests cannot be overwritten. A stale request can be superseded only through
a new exact current snapshot; all requests remain in the append-only log.

`pending_acceptance_review` validates the entire frozen identity and request
shape. `resolve_dispatch_target` returns the existing `review_ready_dispatch`
for that original task and current reviewer. Ordinary acceptance retains the
owner route; dependency and external gates still hold requested review. Stale
or malformed pending metadata holds dispatch closed. Request changes enter
the existing event signature and material fingerprint; ordinary task
signatures are preserved. Role-specific eligibility is applied to the reviewer
route. Acceptance-owner dispatch also carries the existing owner fence so its
request transaction remains bound to the original task.

`supervisor_runtime.dispatch_ready_tasks`, `apply_chair_task_action` and
`start_worker_for_request` prevent overlapping an active or pending original
worker. Queued owner events become stale; owner retries cannot run while the
request is pending. Review retries revalidate candidate/generation, reviewer,
merge, request ID/content, dependency/external/CI floors and original task.
The existing detached candidate workspace is mandatory for this route;
disabled worktree provisioning cannot deliver into the canonical workspace.
The request is revalidated after workspace I/O and before process delivery.
No helper reassignment or alternative worker mechanism is added.

The reviewer prompt supplies the exact snapshot and request ID without
changing any `ORCH_DISPATCH_*` guard. `decline-acceptance-review` is current
reviewer-only and resolves routing metadata; source/acceptance evidence is
unchanged. Genuine reviewer `reopen` consumes the exact pending request before
the existing source/evidence clearing transaction. Obsolete pending metadata
is discarded when existing lifecycle actions invalidate a candidate; request
history remains in the log. Existing done-reopen permissions remain intact.
The normal committed worker receipt records request as progress and
decline/reopen as advanced. The cross-task fence is unchanged.

## Verification ledger

Evidence directory (canonical VM only):
`/home/lupin/workspace/drts-fleet-platform/.local/orch-acceptance-review-routing-20261013/`.
The final candidate SHA is recorded by the canonical handoff and
`candidate-verification.json` in that directory; it is not a merge SHA.

| Finding / required acceptance                                      | Source and repair                                                                                                         | Old → new                                                                                                                                                                                          | Command / version / evidence                                                                                                                                                                                                | Pending limitation                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Explicit request routes owner                                      | `dispatch_policy.resolve_dispatch_target`, `pending_acceptance_review`                                                    | Original source `1fba7476925bb29e6f2eeff7acbeb0ba16d0afb4`: actual Codex2 route, expected Codex, exit 1. Fixed source: original task/current Codex reviewer, pass                                  | `baseline-policy-repro.log` calls the actual old Git-object policy, SHA256 `6c10ad51afc86a61a9a345c7aeb990e5bafd82b7fccf21b3f658b534bab1e63a` (matches supplied live-policy evidence); regression in `test_dispatch_policy` | Pure source reproduction; no live C123 request or state write                                                     |
| Request/decline preserve lifecycle and evidence                    | `ai_status.command_request_acceptance_review`, `command_decline_acceptance_review`                                        | Metadata-only changes; reject unlocked/nonacceptance/source-editor/foreign actor, duplicate, malformed and stale snapshots; pass                                                                   | `acceptance_review_routing.test_transactions`; real temporary CLI transactions, persistence and activity log                                                                                                                | Task-board filesystem isolated; no lifecycle business logic mocked                                                |
| Same-task genuine reopen, original fences                          | `TaskBoardCommandExecutor._guard_worker_command`, `ai_status.command_reopen`                                              | Foreign task retains exit 1 and no state/log write. Owner start/reopen and Supervisor reopen still reject. Current original reviewer reopens and consumes; pass                                    | Transaction tests cover candidate/generation/reviewer/merge/request-ID drift, decline, done permission and stale request replacement                                                                                        | No impersonated live reviewer action                                                                              |
| Managed readonly original-task route, no overlap                   | `supervisor_runtime.start_worker_for_request`, `dispatch_ready_tasks`, `task_records.task_is_dispatch_eligible_for_agent` | Existing detached workspace pins actual local Git candidate; owner dirty tree untouched; correct task/role/SHA/generation env; active/pending sibling, stale owner retry and I/O race denied; pass | `acceptance_review_routing.test_runtime`; adapter delivery mocked, actual role/policy/admission/worktree/prompt/fence paths run                                                                                             | Local Git fixtures, no real worker launched. Existing production adapters retained                                |
| `orchestrator_acceptance_review_routing_and_fences`                | All paths above; `test_dispatch_policy`, `test_control_plane_summary`                                                     | Source behavior pass, prior controls retained                                                                                                                                                      | Focused and full Python results below; exact-candidate verification JSON/logs in evidence directory                                                                                                                         | Independent Gemini evaluation pending; live original reviewer decision belongs to normal tooling activation       |
| `orchestrator_acceptance_review_routing_same_sha_review_ci_merge`  | Existing candidate lifecycle, no gate changes                                                                             | Pending independent review/CI/merge                                                                                                                                                                | Final pushed candidate → Gemini → exact-SHA GitHub CI → protected dev merge; canonical candidate fields and PR are the authority                                                                                            | Owner cannot substitute local tests for review/CI/merge or write done                                             |
| `orchestrator_acceptance_review_routing_normal_tooling_activation` | Existing `bin/release-lifecycle.py`, `verify_release` / `activate`                                                        | Pending                                                                                                                                                                                            | Supervisor must record integrated source SHA, immutable release/manifest hashes, activation audit and normal healthy heartbeat with worker/fence continuity                                                                 | Supervisor-only after review/CI/protected merge. No active `orchestrator-0fb44e9576d3` hotpatch or WIP activation |

## Check results and reproducibility

Run repository checks from `tools/development-orchestrator`:

```bash
python3 -m unittest control_plane.tests.acceptance_review_routing.test_transactions control_plane.tests.acceptance_review_routing.test_runtime control_plane.tests.test_dispatch_policy control_plane.tests.test_control_plane_summary test_ai_status test_dispatch_contract control_plane.tests.test_task_board_commands
python3 -m unittest discover -s . -p 'test_*.py'
```

- Original valid regression: exit 1, wrong target Codex2; baseline Git-object
  replay has the same policy content hash as the supplied active-release
  reproduction. This is the old failure evidence.
- Source checkpoint `5854e3071d59869a9dc39da819e02dc323f84f92`:
  focused 98 tests passed (exit 0), full suite 1,032 tests passed (exit 0,
  23.457 seconds; `full-unittest.log`). Additional stale-metadata and queue/I/O
  race tests are included in the final source and results below.
- Final source checkpoint `e06167004202df27902e1d52e909f166c34a9c80`:
  focused **103 tests passed** (exit 0, 0.698 seconds; `focused-final.log`),
  full **1,037 tests passed** (exit 0, 24.224 seconds; `full-final.log`).
  The closeout commit changes only this evidence ledger; the candidate receipt
  verifies unchanged tooling source and records candidate/file/log hashes.
  Python compileall and Markdown Prettier passed. The prior `git diff --check`
  pass claim was incomplete: Codex's formal review and this continuation both
  ran `git diff --check 1fba7476925bb29e6f2eeff7acbeb0ba16d0afb4..dff3ceed068ab2942ba8dbf4ee7183517e1312dc`
  and got exit 2 for extra EOF blank lines in routing `test_runtime.py:206`
  and `test_transactions.py:232`. Those lines are corrected in this repair;
  the final full-range check must be recorded separately.
- During test authoring, incomplete temporary fixture fields, missing log
  message, a wrong mock symbol and one root-cwd invocation caused check
  failures. Those are setup/development failures, not old-policy defect
  reproduction; they were corrected before final verification.
- First Markdown format check warned about this ledger. Final formatting is
  corrected and checked at closeout. Python syntax and whitespace checks are
  included in the exact-candidate verification receipt.
- Expected mock tick-error tracebacks and one temporary child-process
  `ResourceWarning` appeared in the first passing full-suite log. That child
  had exited when checked; no product or extra service was started.

`origin/dev` advanced to `deb6a6cd22123f15ada5789e384d8b7f6a2b3555`
with the independent throttle-key component. It has no orchestrator file
overlap; this task's published branch history is retained without rebasing or
force pushing. That independent product delivery is not transplanted here.

The release selector is `active`, and the documented executable activation
checks tests in the immutable release and reachability from `origin/dev`, then
records an activation audit. This owner has read that implementation and the
operating model but has neither prepared nor activated a release. The third
required key remains outstanding until Supervisor provides real evidence.

Only repository Python checks run on this VM. No product, browser, PG or
Compose runtime is started. Full system acceptance remains NOT_ACHIEVED;
production is not deployed.
