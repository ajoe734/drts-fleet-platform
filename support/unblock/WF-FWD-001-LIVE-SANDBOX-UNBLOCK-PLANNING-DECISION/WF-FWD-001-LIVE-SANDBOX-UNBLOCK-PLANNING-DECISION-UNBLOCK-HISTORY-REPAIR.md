# WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION History Repair

- Task: `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION-UNBLOCK-HISTORY-REPAIR`
- Parent: `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION`
- Owner: `Codex`
- Reviewer: `Claude`
- Date: `2026-05-19`
- Status: `documented non-force repair path; parent resume sequence prepared`

## Diagnosis

The planning-decision child already has valid delivery evidence on the owner
branch, but the assigned history-repair worktree carries a stale tracked
snapshot of machine truth.

That split created three different "truths" at once:

1. canonical machine truth at `AI_STATUS_ROOT=/home/edna/workspace/drts-fleet-platform`
2. the isolated worktree snapshot on
   `codex/wf-fwd-001-live-sandbox-unblock-planning-decision-unblock-history-repair`
3. an older similarly named history-repair branch for the parent
   `WF-FWD-001-LIVE-SANDBOX`

The result is that the planning-decision task looks unfinished from the
assigned worktree even though the reviewed branch evidence is already complete.

## Exact contamination

### 1. The assigned worktree snapshot is older than canonical machine truth

The current worktree branch is:

- local branch:
  `codex/wf-fwd-001-live-sandbox-unblock-planning-decision-unblock-history-repair`
- worktree:
  `.artifacts/worktrees/auto/codex-wf-fwd-001-live-sandbox-unblock-planning-decision-unblock-history-repair`
- `HEAD`: `2103814`
- `origin/dev`: `2103814`
- remote branch for this task: absent

Its tracked `ai-status.json` is stale relative to the canonical root:

- local snapshot has no
  `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION-UNBLOCK-HISTORY-REPAIR`
  task record at all
- local snapshot still shows
  `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION status=in_progress`
  with next=`reviewing planning artifacts and resolving missing product/contract decision`
- canonical machine truth shows
  `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION status=blocked waiting_for=Codex`
  with the explicit closeout-ready message recorded at `2026-05-19T16:59:47Z`
- local snapshot still shows
  `WF-FWD-001-LIVE-SANDBOX status=in_progress`
  while canonical machine truth already has the external-only hold
  `status=blocked waiting_for=Codex2`

This means a worker who reads the tracked worktree copy instead of
`AI_STATUS_ROOT/ai-status.json` will misdiagnose the planning child as still in
mid-edit rather than in lifecycle repair.

### 2. The reviewed planning evidence lives on a different branch than the assigned repair branch

The valid planning-task evidence is on the owner branch:

- branch:
  `origin/codex2/wf-fwd-001-live-sandbox-unblock-planning-decision`
- reviewed commit: `e190c2bf00923c443b2e67c79ec6ee233d07bded`
- subject:
  `docs(WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION): stabilize delivery evidence`
- PR: `#166`

That branch already contains the final artifact:

- `support/unblock/WF-FWD-001-LIVE-SANDBOX/WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION.md`

By contrast, the assigned history-repair branch started at `origin/dev`,
contains none of that task-scoped evidence, and had no remote branch yet.

### 3. A similarly named but wrong-scope history-repair branch already exists

There is also an older remote branch:

- `origin/codex/wf-fwd-001-live-sandbox-unblock-history-repair@58cfdd8`

That branch is for the parent helper task
`WF-FWD-001-LIVE-SANDBOX-UNBLOCK-HISTORY-REPAIR`, not for the planning-decision
child. Its artifact path is:

- `support/unblock/WF-FWD-001-LIVE-SANDBOX/WF-FWD-001-LIVE-SANDBOX-UNBLOCK-HISTORY-REPAIR.md`

Because the names differ only by the missing
`-PLANNING-DECISION-` segment, it is easy to confuse the old parent-scope audit
with this task. It must be treated as separate history.

### 4. Lifecycle evidence exists, but the review transition never landed in machine truth

Canonical handoffs and activity log entries show the planning task already
reached reviewed evidence state:

- owner handoff at `2026-05-19T16:51:25Z` for branch
  `origin/codex2/wf-fwd-001-live-sandbox-unblock-planning-decision@e190c2b`
- reviewer no-findings response at `2026-05-19T16:55:45Z`
- canonical `next` later records that closeout is blocked only because
  `ai-status.json` never moved that task into `review_approved`

So the contamination is not missing content on the owner branch.
It is stale worktree state plus a lost lifecycle transition.

## Non-force repair path

Do not rewrite or force-push any shared branch.

Use this additive repair path instead:

1. Treat `/home/edna/workspace/drts-fleet-platform/ai-status.json` and
   `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl` as the only
   control-plane authority from isolated worktrees.
2. Treat the tracked `ai-status.json` inside this worktree as an old branch
   snapshot, not canonical machine truth.
3. Preserve
   `origin/codex2/wf-fwd-001-live-sandbox-unblock-planning-decision@e190c2b`
   as the canonical planning-task delivery branch.
4. Preserve
   `origin/codex/wf-fwd-001-live-sandbox-unblock-history-repair@58cfdd8`
   as separate parent-scope audit history. Do not reuse it for this child.
5. Close this history-repair task on its own correctly named branch, then
   resume the parent planning task in machine truth with a no-code replay:
   - set parent `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION` back to
     active owner work
   - instruct `Codex2` to hand off the existing branch evidence again from
     `origin/codex2/wf-fwd-001-live-sandbox-unblock-planning-decision@e190c2b`
   - `Codex` re-approves in machine truth
   - `Codex2` runs `done` with the already prepared closeout evidence:
     `COMMIT_HASH=e190c2bf00923c443b2e67c79ec6ee233d07bded`,
     `COMMIT_SUBJECT='docs(WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION): stabilize delivery evidence'`,
     `PUSH_REMOTE=origin`,
     `PUSH_BRANCH=codex2/wf-fwd-001-live-sandbox-unblock-planning-decision`

This fixes the unblock path without rewriting the reviewed planning branch.

## Parent next step after this repair

After this task is review-approved and closed out, the parent planning task
should resume with this exact sequence:

1. `Codex2` re-handoffs the unchanged planning branch evidence at `e190c2b`
   and cites PR `#166`.
2. `Codex` replays the missing `approve` transition in machine truth.
3. `Codex2` finalizes `done` immediately using the existing commit/push
   evidence.

No new planning-content commit is required unless the owner chooses to refresh
metadata-only closeout notes.

## Evidence checked

- canonical `ai-status.json` at
  `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- canonical `ai-activity-log.jsonl` at
  `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- local tracked worktree snapshot `ai-status.json`
- `origin/dev@2103814`
- `origin/codex2/wf-fwd-001-live-sandbox-unblock-planning-decision@e190c2b`
- `origin/codex/wf-fwd-001-live-sandbox-unblock-history-repair@58cfdd8`
