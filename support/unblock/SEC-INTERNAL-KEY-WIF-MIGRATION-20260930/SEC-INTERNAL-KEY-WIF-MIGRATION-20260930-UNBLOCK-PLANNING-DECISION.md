# SEC-INTERNAL-KEY-WIF-MIGRATION-20260930 Planning-Decision Routing

## Scope

- Task: `SEC-INTERNAL-KEY-WIF-MIGRATION-20260930-UNBLOCK-PLANNING-DECISION`
- Parent: `SEC-INTERNAL-KEY-WIF-MIGRATION-20260930`
- Owner: `Claude`
- Reviewer: `Claude2`
- Routing date: `2026-10-01`
- Canonical record: `docs/02-architecture/internal-key-exceptions.md` §7.8

## Diagnosis

The chairman-triage brief asked this helper to "resolve or route the missing
product/contract decision" behind the parent's `blocked` state. **There is no
missing decision.** The product decision was already made and recorded on
2026-09-30 (the §2 inventory row for `INTERNAL_KEY_EXCP_002` cites it
explicitly), and every round since (§7.1-§7.7, plus the earlier
`-UNBLOCK-MANUAL-UNBLOCK` and `-UNBLOCK-HISTORY-REPAIR` helper tasks) has
operated inside that decision. Re-verified independently in this session from
this worktree at `origin/dev` HEAD `5b0ec5283`:

- `required_acceptance` items 1-2 are met and merged (`merge_sha` on the
  parent's current candidate is `c47ea39ac0131...`, which is an ancestor of
  this HEAD).
- `required_acceptance` item 3 (`excp_002_removed_and_deploy_dev_green`) is
  genuinely still open: `INTERNAL_KEY_EXCP_002` is still present in
  `apps/api/src/common/auth/internal-key-exception-registry.ts` at this HEAD
  (`grep -n "INTERNAL_KEY_EXCP_002" apps/api/src/common/auth/internal-key-exception-registry.ts`
  still matches), because removing the legacy fallback is causally downstream
  of a real `deploy-dev.yml` run proving every caller lands on WIF, which
  itself needs ops to populate the §7.6 2-entry
  `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` GCP secret first. This is a
  GCP/GitHub admin-write ops action outside sandbox reach, confirmed by prior
  sessions to be deliberately reserved for a human operator (not merely a
  sandbox permission gap -- see §7.6's session note that the sandbox's own
  gcloud account actually held `roles/owner` and still declined to act).
- The parent's **most recent** `blocked` worker-outcome
  (`claude-20261001T025612Z-002820d9`, `2026-10-01T02:58:43Z`, recorded
  summary `"Claude2"`) carries no new finding. Cross-checked against
  `ai-activity-log.jsonl`: that dispatch requested a Bash approval at
  `02:57:41Z` (`apr-20261001T025741Z-ead31224`), was killed
  (`worker_superseded`) at `02:58:45Z` before the approval resolved, and the
  approval was then `auto-pruned`/`deny`'d -- the standard failure signature
  of the `orchestrator_approval_broker` MCP being unreachable. This worker's
  own session independently observed the identical `CONNECT_TIMEOUT` live on
  2026-10-01, and the activity log holds 404 `approval_pruned` events across
  many unrelated tasks, confirming an infra-wide outage rather than anything
  specific to this task's content. The synthetic `blocked` receipt is a side
  effect of that outage, not a new decision point.

## Routing decision

No entry goes into `PHASE1_OPEN_QUESTIONS.md` or `PHASE1_DECISION_LEDGER.md`
-- there is no open product/contract question to record there. The parent
stays `blocked`, `waiting_for: Claude2` (nearest valid lane agent;
`human`/`Supervisor` are rejected by `ensure_agent`), with its `next` field
corrected to state plainly that the remaining gate is the human-operator ops
action above. Any future owner dispatch onto the parent while that ops action
is outstanding should re-block immediately with the same message rather than
re-attempt code changes.

This worker could not write that correction onto the parent task directly:
`TaskBoardCommandExecutor._guard_worker_command` in
`tools/development-orchestrator/bin/ai_status.py` restricts a dispatched
worker (`ORCH_DISPATCH_ROLE`/`ORCH_RUN_ID` set, as every task-brief dispatch
has) to mutating only its own `ORCH_DISPATCH_TASK_ID`, not the parent's. The
exact Supervisor-privileged commands needed to land the correction in machine
truth are recorded in `docs/02-architecture/internal-key-exceptions.md` §7.8
and reproduced below for a Supervisor-privileged interactive session (no
`ORCH_DISPATCH_ROLE`/`ORCH_RUN_ID`) to run once this helper candidate is
reviewed:

```
TASK_METADATA_JSON='{"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Claude2","resolved_parent_next":"No open product/contract decision (user decision stands from 2026-09-30, see internal-key-exceptions.md §7.8). required_acceptance items 1-2 remain merged; item 3 (excp_002_removed_and_deploy_dev_green) remains blocked on a human operator populating the 2-entry WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS GCP secret, setting DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED, and running a real green deploy-dev. Do not redispatch an owner for code work until that ops action lands."}' \
  AI_NAME=Supervisor ORCH_STATUS_ROOT=$PWD python3 tools/development-orchestrator/bin/ai_status.py assign \
  SEC-INTERNAL-KEY-WIF-MIGRATION-20260930-UNBLOCK-PLANNING-DECISION Claude Claude2

AI_NAME=Supervisor ORCH_STATUS_ROOT=$PWD python3 tools/development-orchestrator/bin/ai_status.py note \
  SEC-INTERNAL-KEY-WIF-MIGRATION-20260930 'No open product/contract decision (user decision stands from 2026-09-30, see internal-key-exceptions.md §7.8). required_acceptance items 1-2 remain merged; item 3 remains blocked on a human operator GCP/GitHub ops action, not code or review work.'
```

The `assign` call sets `resolved_parent_status: blocked` on this helper so
that once this helper itself reaches `done` via the normal candidate
lifecycle (review by Claude2, CI, merge), `apply_unblock_parent_resolution`
reads that field and keeps the parent correctly `blocked` (with the
corrected `next` message and a fresh open blocker entry) instead of
defaulting it to `todo` with a generic message -- the default outcome when a
completed `unblock` helper carries no `resolved_parent_*` metadata. The
`note` call gives the parent's `next` field the corrected text immediately,
without waiting for this helper's own merge.

## Acceptance evidence

| Finding / acceptance key | Source & location | Before -> after | Command, exit code, evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| Resolve or route the missing product/contract decision | `docs/02-architecture/internal-key-exceptions.md` §7.8 (new); this file | Before: chairman triage assumed a decision gap. After: documented finding that no decision is missing; 2026-09-30 decision cited at its existing registry location. | Read-through of §2 inventory row and worker_outcomes history via `ai-status.sh show SEC-INTERNAL-KEY-WIF-MIGRATION-20260930` | N/A -- documentation routing, no runtime behavior to test |
| Record the decision / scope cut / explicit follow-up | §7.8 + this file's "Routing decision" section | Before: parent's `next` field only carried the generic worker_outcomes summary `"Claude2"`. After: explicit follow-up text drafted for Supervisor to land via `note`. | See `assign`/`note` commands above (not run by this worker; guard-blocked, see Diagnosis) | The two commands above have not been executed; they require a Supervisor-privileged session, explicitly out of this dispatch's reach per `_guard_worker_command` |
| Produce task-scoped commit/push/PR evidence for any canonical change | This commit + pushed branch + PR (see handoff) | N/A (new artifact + doc section) | `git log`, `git push`, PR URL recorded at handoff | None |
| Update the parent task with the concrete unblocked next step | Drafted in §7.8 and above, pending Supervisor execution | Parent's `next`/`resolved_parent_*` not yet updated in `ai-status.json` as of this commit | Machine-truth write requires the Supervisor commands above | Cannot be completed by this dispatched worker; flagged for Supervisor follow-up rather than claimed as done |

## Independent re-verification of the registry-state claim

```
$ grep -n "INTERNAL_KEY_EXCP_002" apps/api/src/common/auth/internal-key-exception-registry.ts
61:    exceptionId: "INTERNAL_KEY_EXCP_002",
```

Confirms `INTERNAL_KEY_EXCP_002` is still registered at `origin/dev` HEAD
`5b0ec5283`, i.e. the parent's `required_acceptance` item 3 is genuinely still
open and this is not a stale claim.
