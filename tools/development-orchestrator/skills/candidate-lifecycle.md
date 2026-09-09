# Candidate Lifecycle

The status transaction is the only lifecycle authority:

`backlog/todo -> in_progress -> review -> integrating -> acceptance -> done`

The supervisor automatically migrates older task records once before it can
dispatch them. Do not repair legacy lifecycle fields manually.

1. The owner works on its task branch and may push checkpoint commits. Checkpoints are recoverability evidence, not review candidates.
2. The owner runs scoped verification, pushes the final branch head, then records `CANDIDATE_SHA` and `CANDIDATE_BRANCH` with `ai-status.sh handoff`.
3. The reviewer checks that exact SHA. Reviewers do not edit, commit, push, amend, rebase, or change the candidate branch. Approval records `REVIEWED_SHA`, which must exactly equal `CANDIDATE_SHA`.
4. The GitHub bus records CI and merge only when the PR head is the same candidate SHA. A later push invalidates review/CI evidence and returns the task to `in_progress`.
5. A merged task with `required_acceptance` enters `acceptance`; record each required key through `record-acceptance`. Tasks with no outstanding acceptance evidence become `done` automatically after the same-SHA merge.

Never call `done` directly. Never use branch-only, a merged commit message, or a stale CI run as a substitute for candidate evidence.

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
