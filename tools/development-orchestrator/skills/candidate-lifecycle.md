# Candidate Lifecycle

The status transaction is the only lifecycle authority:

`backlog/todo -> in_progress -> review -> integrating -> acceptance -> done`

The supervisor automatically migrates older task records once before it can
dispatch them. Do not repair legacy lifecycle fields manually.

Owners, reviewers and Supervisor must apply the delivery-quality and repeated
rework rules in [AI Collaboration Guide §0.7](../../../AI_COLLABORATION_GUIDE.md#07-交付品質與退修規範).
Keep finding-level verification evidence in the existing task artifact and
reference it at handoff; use the lifecycle below without extra transitions.

1. The owner works on its task branch and may push checkpoint commits. Checkpoints are recoverability evidence, not review candidates.
2. The owner runs scoped verification, pushes the final branch head, then records `CANDIDATE_SHA` and `CANDIDATE_BRANCH` with `ai-status.sh handoff`.
3. The reviewer checks that exact SHA. Reviewers do not edit, commit, push, amend, rebase, or change the candidate branch. Approval records `REVIEWED_SHA`, which must exactly equal `CANDIDATE_SHA`.
4. The GitHub bus records CI and merge only when the PR head is the same candidate SHA. A later push invalidates review/CI evidence and returns the task to `in_progress`.
5. A merged task with `required_acceptance` enters `acceptance`; record each required key through `record-acceptance`. Tasks with no outstanding acceptance evidence become `done` automatically after the same-SHA merge.

Never call `done` directly. Never use branch-only, a merged commit message, or a stale CI run as a substitute for candidate evidence.

During `acceptance` or after `done`, owner `progress` reports behave as `note`:
they update the message while preserving the candidate, review, CI, merge,
acceptance evidence and outstanding gates. `start` rejects those states so a
stale owner dispatch cannot silently reopen completed implementation. Use
`record-acceptance` to record verified gates; if code changes are required, ask
the reviewer to explicitly `reopen` the candidate before starting implementation.
Only the assigned reviewer may `reopen` from `acceptance` or `done`; an owner
attempt is rejected without changing state or recording a log entry. Other
implementation states retain the existing owner/reviewer reopen permissions.

When acceptance findings need the original reviewer to decide, the owner,
assigned reviewer or Supervisor can request that decision through the normal
status CLI. This records routing metadata only; it does not reopen source,
approve a candidate or grant acceptance credit. Scope is merged canonical
`acceptance` tasks with matching candidate/review/green CI and a merge SHA.

1. Read the single task using `show`. Set `ACCEPTANCE_REVIEW_SNAPSHOT_JSON`
   to a JSON object containing exactly `task_id`, `candidate_sha`,
   `candidate_generation`, `reviewed_sha`, `merge_sha`, and `reviewer` from
   that task. Use the full frozen SHAs and current assigned reviewer.
2. With your actual `AI_NAME`, run
   `request-acceptance-review <task-id> <reason> <evidence-ref>`. A second
   valid pending request is rejected. Stale metadata may be replaced only
   with a new exact current snapshot through this transaction; prior requests
   remain in the append-only log. No task status, roles, dependencies, CI,
   merge or acceptance evidence changes.
3. Normal dispatch routes the same original task through `review_ready_dispatch`
   to its current reviewer in a detached candidate workspace. It waits for any
   active/pending original-task worker, retains eligibility and dependency/
   external gates, and rejects stale queued requests and retries. Reviewers
   remain read-only: do not edit, commit, push or change branches.
4. The reviewer reads the request evidence and keeps the dispatched task/role/
   candidate fence intact. For a decision set the exact snapshot above and
   `ACCEPTANCE_REVIEW_REQUEST_ID` to the pending `request_id` supplied in the
   prompt. Source repair uses existing `reopen <task-id> <findings>`, which
   consumes the request and clears candidate/acceptance evidence under the
   existing contract. A dispatched worker must have the actual reviewer role
   and `AI_NAME` matching its dispatched agent to consume a pending request
   through reopen; owner dispatch cannot claim the reviewer identity. Genuine
   unfenced reviewer decisions and nonacceptance reopen permissions retain
   their existing behavior. If no repair is needed, use
   `decline-acceptance-review <task-id> <request-id> <reason>`; it resolves only
   routing metadata and restores ordinary acceptance-owner routing. Owners and
   Supervisor cannot decline or substitute for the reviewer decision.

Invalid/stale pending requests hold dispatch closed; never change task status,
global `review_statuses`, or another worker's task/fence to route a review.
Requests and decisions are recorded in the existing append-only activity log.
`done` reopen permissions and all review/CI/merge/acceptance gates stay intact.

For an unblock helper, completing the helper does not erase later parent
blockers. If a planning or recovery delivery leaves routing or implementation
work outstanding, record `resolved_parent_status: blocked`,
`resolved_parent_next` and `resolved_parent_waiting_for` through canonical task
metadata before merge. The merge transaction preserves that disposition and
records `resolved_parent_at`; it must not silently replace it with `todo`.

A helper-backed `resume-blocked` must name a completed helper for that parent,
with a resumable disposition and no open parent blocker newer than its
resolution. Legacy helpers without a valid `resolved_parent_at` remain held;
mutable `last_update` is never completion evidence. Updating a note or progress
does not renew resolution evidence. The chair keeps
such held parents visible as `wait_for_parent_resolution`, without repeatedly
dispatching their owners or creating the same helper. After actually resolving
the remaining blocker, Supervisor can explicitly resume the parent with the
new evidence and without claiming the old helper resolved it.
