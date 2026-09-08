# SR-ENTERPRISE-SEARCH-001: verified history repair path

Audit: 2026-09-08. Owner: Codex. Reviewer: Gemini.
Task: `SR-ENTERPRISE-SEARCH-001-UNBLOCK-HISTORY-REPAIR`.
Disposition: documented non-destructive recovery; parent remains blocked on
backend capability planning. No parent implementation or published ref changed.

## Reassignment and corrected evidence

This report supersedes the conclusions of the prior helper candidate
`d4723fd2fea8efeff3b7e54f40e16e9647d202d7` on
[PR #1790](https://github.com/ajoe734/drts-fleet-platform/pull/1790), which was
still OPEN at inspection. That PR is not this reassigned task's candidate.
The current canonical task assigns Codex as owner and Gemini as reviewer.

Fetched and rebased the assigned isolated worker branch
`codex/sr-enterprise-search-001-unblock-history-repair` onto
`890548b4f357542968c8b14f33f23e0685be007a` (`origin/dev`), exit 0.
The earlier report's purported full SHA beginning `1cdaaa5b57f006` is erroneous;
the original worker base was `1cdaaa5b5e5301de2da0a692c78c4cc29b0c10a9`.

| Preserved ref | Inspected head | Role |
| --- | --- | --- |
| `origin/gemini/sr-enterprise-search-001` | `2d469d644499d5f45a81cc7328dac5305a458d78` | Latest preserved parent WIP; PR #1695 OPEN |
| `origin/codex2/sr-enterprise-search-001` | `7e82f650020cbc49ff41b77ea9851c85284bd8de` | Duplicate recovery fork; PR #1724 OPEN |
| parent `reconstruction.branch_head` | `ecf6f70e7bf4a3a57735f198f6bfa81762019f3b` | Historical provenance, not a locked current candidate |

`git worktree list --porcelain` showed no worktree on either parent branch.
This worker was clean before editing; canonical root remained on `dev` and was
not switched. No global assertion about other workers' dirty files or stashes
is made. No worktree deletion, stash, reset, force push, or parent PR mutation
was performed.

## Exact divergence and its limits

1. Codex2 fork has duplicate implementation commits `641af0c6d` and
   `f20c35e97`: `git show <sha> --pretty=format: | git patch-id --stable`
   returns the identical patch ID `65a229c1f0b124761e7445604dabbd0e90e5d5b1`
   for both. Merge `b42862d4b65315c0859b37be28b961ff8ef84da7` joins parents
   `9b2528e249e3ffc907fdc29f04228da2fe235b62` and
   `c40fd8a5d09e4082976e8ddda8cc2d642d480467`. This is duplicated recovery
   history, not a clean continuation of the later Gemini corrections.
2. Gemini WIP retains correction commits `388e16944`, `79ebf9ddd`, and
   `2d469d644`, plus four merges from dev (`7da03ca6d`, `5eddaf79b`,
   `a6e907073`, `4de0ce0e0`). Merge ancestry alone is not proof of corruption.
   The WIP is recoverable but still documents an unmet backend-filter gate.
3. The previous report incorrectly interpreted a two-endpoint diff as proof
   that PR #1724 would delete unrelated trunk work. A two-dot comparison
   includes newer trunk changes absent from an older branch. Actual three-dot
   diffs against the fetched base are:
   - Gemini: 3 files, 2,563 insertions / 3 deletions.
   - Codex2: 4 files, 2,115 insertions / 2 deletions.
   Both are within the parent's three declared path scopes (the tests scope
   is a directory). `enterprise-search-logic.ts` is therefore not an extra
   unauthorized path merely because it is a fourth file. Its duplicated
   business logic still requires substantive review.
4. Both net patches pass `git apply --check` on the inspected dev tree.
   There is no demonstrated current patch-application blocker. History repair
   means selecting preserved corrected intent and retiring duplicate candidate
   routing, not claiming unrelated-file deletion or force-rewriting history.

Observed merge bases: Gemini `3fb9b06461dc2bf92043144974eedbbc9f69d0f3`;
Codex2 `3b60a3757238663572f16f010c94f446f2c71eaa`.

## Non-destructive continuation for the parent owner

Supervisor should designate one replacement branch/worktree for Gemini after
the backend producer and shared-scope gate below is resolved. Preserve both old
remote branches and their PRs as provenance. Do not rebase a published parent
branch and then force push. Do not resume from the reconstruction snapshot.

In a supervisor-assigned clean replacement worktree based on freshly fetched
`origin/dev`, record `BASE_SHA=$(git rev-parse HEAD)`. Recover the net WIP patch
using its merge base (not an entire stale endpoint tree):

```bash
RECOVERY_SHA=2d469d644499d5f45a81cc7328dac5305a458d78
PATCH_BASE=$(git merge-base "$BASE_SHA" "$RECOVERY_SHA")
RECOVERY_PATCH=$(mktemp /tmp/sr-enterprise-search-001.XXXXXX.patch)
git diff "$PATCH_BASE" "$RECOVERY_SHA" -- \
  apps/enterprise-dispatch-web/app/bookings/page.tsx \
  tests/unit/system-remediation/sr-enterprise-search-001/ \
  docs/04-uat/system-remediation-20260906/SR-ENTERPRISE-SEARCH-001.md \
  > "$RECOVERY_PATCH"
git apply --check "$RECOVERY_PATCH"
```

Check the complete three-dot changed-path list before applying, so path filters
cannot hide unexpected source changes. If producer changes conflict, reconcile
only the authorized parent scope against the new API; never overwrite shared
producer files to make the old patch apply. Apply after the check, inspect the
diff, and immediately anchor the recovered multi-file intent with task trailers
and a normal push. This audit performed only the check, not the application.

Then consume the reviewed backend query/envelope, adapt tests to the real
implementation, and record new base/candidate SHAs. Required parent checks:
`git diff --check`, enterprise package typecheck, and the task Vitest directory
(no `passWithNoTests`). Record queries, totals and resource IDs; unexecuted live
or device checks stay explicitly unexecuted. Publish a replacement PR to dev
referencing #1695 and #1724, normal-push, and hand off the exact SHA to the
parent's independent reviewer. Supervisor should supersede old PR routing once
the replacement is locked. Neither old PR is claimed closed by this report.

## Concrete next step recorded for the parent

Parent is currently `blocked`, owner Gemini, reviewer Codex, with empty
`depends_on`. Current-release `show SR-BOOKING-VERIFY` still exits 1:
`Task not found: SR-BOOKING-VERIFY`.

Supervisor/Chairman must identify or register the backend filter producer,
assign owner/reviewer, record the real producer ID in parent dependencies, and
authorize shared contract/client plus enterprise wrapper scope as described in
[the planning decision](SR-ENTERPRISE-SEARCH-001-UNBLOCK-PLANNING-DECISION.md).
After producer merge/acceptance, dispatch Gemini to the clean continuation
above. The history route is available; frontend recovery alone does not satisfy
the parent's backend-filter acceptance. This helper grants no scope expansion.

## Verification and delivery

Executed on the inspected dev base (all exit 0 unless specified):

- `git fetch origin && git rebase origin/dev`.
- `git worktree list --porcelain`; parent branch and PR head inventory.
- `git diff --stat origin/dev...2d469d644` and
  `git diff --stat origin/dev...7e82f6500` with the counts above.
- `git diff origin/dev...2d469d644 | git apply --check`.
- `git diff origin/dev...7e82f6500 | git apply --check`.
- Duplicate patch-ID and merge-parent checks documented above.
- Current-release single-task queries for helper and parent; missing producer
  query exit 1 as documented.

This is an evidence-only helper. No app runtime, live API, device, deployment,
or parent acceptance test was executed or claimed. Helper candidate SHA, normal
push and replacement helper PR evidence are recorded in machine truth at
handoff. Review/CI/merge remain candidate-lifecycle responsibilities.
