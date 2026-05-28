# WF-FWD-001-LIVE-SANDBOX History Repair

- Task: `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-HISTORY-REPAIR`
- Parent: `WF-FWD-001-LIVE-SANDBOX`
- Owner: `Codex`
- Reviewer: `Codex2`
- Date: `2026-05-19`
- Status: `documented non-force repair path; canonical next step verified`

## Diagnosis

`WF-FWD-001-LIVE-SANDBOX` was not blocked by a new product or runtime gap.
It was blocked by mixed branch/worktree truth:

1. isolated worker worktrees carried tracked `ai-status.json` and
   `current-work.md` snapshots that were older than the canonical
   machine-truth root behind `AI_STATUS_ROOT` / `ORCH_STATUS_ROOT`
2. the parent anchor branch bundled child-task artifacts, so later review
   passes could confuse "parent WIP evidence" with "task-scoped canonical
   unblock evidence"
3. one reviewer branch then diagnosed the parent from the stale local snapshot
   instead of from canonical machine truth

The net effect was conflicting unblock conclusions on different branches even
though canonical truth had already settled the real blocker chain.

## Exact contamination

### 1. Stale branch-local machine-truth snapshots

The clearest stale snapshot is the reviewer worktree for
`codex/wf-fwd-001-live-sandbox-unblock-manual-unblock`:

- worktree: `.artifacts/worktrees/auto/codex-wf-fwd-001-live-sandbox-unblock-manual-unblock`
- branch head: `6be61c4`
- local `ai-status.json` timestamp: `2026-05-19 15:41:12Z`
- local `current-work.md` timestamp: `2026-05-19 15:41:12Z`
- local snapshot state:
  - `FWD-SPEC-001 status=backlog`
  - `WF-FWD-001-LIVE-SANDBOX status=blocked`
  - `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md` absent in
    the worktree tree

Canonical machine truth had already moved past that snapshot:

- canonical root is addressed through `AI_STATUS_ROOT` / `ORCH_STATUS_ROOT`
- canonical `ai-status.json` records `FWD-SPEC-001 done` at
  `2026-05-19T15:17:22Z`
- the task-scoped spec branch already existed at
  `origin/codex2/fwd-spec-001@f249aec`

This is the precise stale-snapshot mismatch that produced the incorrect
"finish `FWD-SPEC-001` first" diagnosis.

### 2. Parent branch carried child-task artifacts

`origin/codex2/wf-fwd-001-live-sandbox@b1707c5` is a parent-task anchor commit,
but it bundles four different artifact classes:

- `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md`
- `support/sidecars/FWD-LIVE-SANDBOX-20260519/FWD-LIVE-SANDBOX-EVIDENCE.md`
- `support/unblock/WF-FWD-001-LIVE-SANDBOX/WF-FWD-001-LIVE-SANDBOX-UNBLOCK-MANUAL-UNBLOCK.md`
- `support/unblock/WF-FWD-001-LIVE-SANDBOX/WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION.md`

That commit is valid as an anchor, but not as final task-scoped evidence for
either unblock child. It polluted review because the parent branch looked like a
delivery branch for the helper tasks.

### 3. Divergent helper conclusions landed on different branches

The two manual-unblock branches now represent different historical readings:

- `origin/codex/wf-fwd-001-live-sandbox-unblock-manual-unblock@6be61c4`
  recorded the stale-snapshot diagnosis: `FWD-SPEC-001` still incomplete
- `origin/codex2/wf-fwd-001-live-sandbox-unblock-manual-unblock@fafbd58`
  corrected the diagnosis after rebasing on current truth: `FWD-SPEC-001` is
  already done and the remaining blocker is only `EXT-002-BLK-001..007`
- `origin/codex2/wf-fwd-001-live-sandbox-unblock-manual-unblock@068b0ff`
  is the closeout metadata commit that finalized the approved task-scoped
  branch without rewriting shared history

The stale branch is preserved in history, but it is superseded.

### 4. Related but separate planning-decision status drift

`origin/codex2/wf-fwd-001-live-sandbox-unblock-planning-decision@e190c2b`
already contains the approved planning artifact, and `ai-activity-log.jsonl`
records Codex `review_approved` at `2026-05-19T16:55:45Z`.

However, canonical `ai-status.json` did not reflect that transition, so the
owner could not run `done`. Chair created
`WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION-UNBLOCK-HISTORY-REPAIR`
for that separate status-replay problem.

This repair note does not rewrite that child branch. It only records that the
planning child now has its own dedicated history-repair path.

## Non-force repair path

Do not rewrite or force-push any of the polluted branches. The repair is:

1. Treat the canonical machine-truth root behind `scripts/ai-status.sh` as the
   only authority for task state from isolated worktrees.
2. Treat branch-local tracked copies of `ai-status.json` and `current-work.md`
   as stale snapshots unless they are explicitly synced from the canonical
   root.
3. Preserve `origin/codex/wf-fwd-001-live-sandbox-unblock-manual-unblock@6be61c4`
   and `origin/codex2/wf-fwd-001-live-sandbox@b1707c5` as historical evidence,
   but mark them superseded for unblock truth.
4. Use the already approved task-scoped manual-unblock branch as the canonical
   unblock result:
   - artifact commit: `fafbd58`
   - closeout metadata commit: `068b0ffbac7e81dc12c3dabe86000930cc5bb375`
   - push target: `origin/codex2/wf-fwd-001-live-sandbox-unblock-manual-unblock`
5. Leave the planning-decision branch repair to its dedicated child history
   task instead of mixing the state replay into this parent-scope repair.
6. Keep the parent blocked on the external partner sandbox package only.

This path is additive, auditable, and does not require rewriting any shared
branch history.

## Canonical parent next step

The parent should continue to use the external-only unblock wording already
confirmed by the manual-unblock closeout:

> Await partner sandbox package for Grab Taiwan or equivalent: approved API
> contract, sandbox credentials, webhook signing details, and one
> forwarded-task seed. Once available, rerun the FWD live evidence pack in
> staging.

Canonical machine truth now already reflects that wording:

- `WF-FWD-001-LIVE-SANDBOX status=blocked` at `2026-05-19T17:02:22Z`
- `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-MANUAL-UNBLOCK status=done` at
  `2026-05-19T17:02:22Z`
- current parent `next` in canonical `ai-status.json` matches the external-only
  unblock sequence above

This means the remaining work for this task branch is audit evidence only; no
force-push or additional state rewrite is required to keep the parent on the
correct unblock path.

## Evidence checked

- canonical `ai-status.json` at the machine-truth root
- branch-local `ai-status.json` / `current-work.md` timestamps in the affected
  worktrees
- `origin/codex2/fwd-spec-001@f249aec`
- `origin/codex2/wf-fwd-001-live-sandbox@b1707c5`
- `origin/codex/wf-fwd-001-live-sandbox-unblock-manual-unblock@6be61c4`
- `origin/codex2/wf-fwd-001-live-sandbox-unblock-manual-unblock@fafbd58`
- `origin/codex2/wf-fwd-001-live-sandbox-unblock-manual-unblock@068b0ff`
- `origin/codex2/wf-fwd-001-live-sandbox-unblock-planning-decision@e190c2b`
- `ai-activity-log.jsonl` entries for the manual-unblock and planning-decision
  review transitions
