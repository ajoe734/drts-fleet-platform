# IAM-UI-TEN-001 Unblock History Repair

## Scope

- Task: `IAM-UI-TEN-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-UI-TEN-001`
- Owner: `Codex`; reviewer: `Claude`
- Audit timestamp: `2026-08-09T02:48:15Z`
- Helper branch: `codex/iam-ui-ten-001-unblock-history-repair`

## Diagnosis

The parent has a split, non-canonical task history.  This is real branch
contamination, but it is not the remaining product blocker: the parent task's
machine-truth `next` correctly identifies the missing canonical Tenant Console
session-administration artboard and tenant-bounded session inventory/revoke
client contract.

The split is:

1. The only remote owner rail is `codex/iam-ui-ten-001 @
   4e7d40db1b8fe7c59e3e6241df753c47ff65f015`.  It contains one task commit,
   `wip(IAM-UI-TEN-001): anchor tenant session canvas requirements`, and that
   commit changes only
   `docs/05-ui/drts-design-canvas/tenant-iam-session-screen-requirements-20260809.md`.
   It has no PR.
2. A separate *local-only* rail, `gemini2/iam-ui-ten-001 @
   de40d1f1212d9f2bc7d245a9a7e7c9af815ee3ff`, contains the 1,778-line UI
   implementation commit attributed to Gemini2, even though its commit trailer
   says `Task-ID: IAM-UI-TEN-001` and `Reviewer: Codex`.  `origin` has no
   `gemini2/iam-ui-ten-001` ref and GitHub has no PR for it.
3. The parent owner branch and the Gemini2 local rail are siblings, not a
   continuation of each other: their merge base is
   `e46023c03ce9bdc43f6384688369fb01069a5718`.  The owner anchor is based on
   current `origin/dev` (`8d6346c97...`); the local implementation is based on
   the older merge base.
4. `claude/iam-ui-ten-001` points at current `origin/dev` and contains no task
   payload.  It is a misleading same-task-name ref, not a usable delivery rail.

Consequently, no branch simultaneously supplies an owner-owned, remote,
reviewable, current-base implementation.  Treating the local Gemini2 commit as
the parent owner rail would bypass both ownership and normal PR evidence;
treating the owner rail as the implementation would silently discard the local
UI payload.

## Evidence

- `git rev-list --left-right --count origin/dev...codex/iam-ui-ten-001` is
  `0 1`: the remote owner rail has exactly the documentation anchor above
  trunk.
- `git rev-list --left-right --count origin/dev...gemini2/iam-ui-ten-001` is
  `1 1`: the local implementation rail is one commit behind current trunk and
  one commit ahead of it.
- `git ls-remote --heads origin 'codex/iam-ui-ten-001'
  'gemini2/iam-ui-ten-001'` returns only `codex/iam-ui-ten-001 @ 4e7d40db1...`.
- `gh pr list --state all --head codex/iam-ui-ten-001` and the corresponding
  Gemini2 query both return `[]`; neither history has a PR record.
- `git diff --stat codex/iam-ui-ten-001...gemini2/iam-ui-ten-001` reports five
  application/test files and 1,778 additions, so this is not an empty or
  metadata-only duplicate:
  - `apps/tenant-console-web/app/users/actions.ts`
  - `apps/tenant-console-web/app/users/page.tsx`
  - `apps/tenant-console-web/app/users/user-management-client.tsx`
  - `apps/tenant-console-web/tests/unit/users-iam-lifecycle.test.ts`
  - `tests/e2e/tenant-iam-ui.spec.ts`

## Non-destructive Repair Path

Do not force-push, rename, or overwrite any existing ref.  In particular, do
not push `gemini2/iam-ui-ten-001` as though it were the Codex owner rail.

After the canonical session screen/API prerequisites are supplied, the parent
owner should create an additive clean replay rail from the then-current trunk:

```bash
git fetch origin
git switch -c codex/iam-ui-ten-001-clean-replay origin/dev
git cherry-pick de40d1f1212d9f2bc7d245a9a7e7c9af815ee3ff
```

The cherry-pick must be reviewed against the final canvas and API contract,
because the existing parent status says those inputs are currently absent.  It
may need intentional edits or rejection; this repair does not certify the
local-only UI payload as correct.  Once reviewed, the owner should run the
task-required checks, push the new branch normally, and open one PR to `dev`.
The existing owner anchor and local Gemini2 ref remain immutable audit
evidence; the new replay branch becomes the only candidate delivery rail.

## Concrete Parent Next Step

`IAM-UI-TEN-001` remains blocked on product inputs, not on a Git operation.
When `IAM-SES-003` provides the tenant-bounded session inventory/revoke client
contract and the design owner supplies a canonical Tenant Console session
administration artboard, resume only by creating the clean replay branch above.
Then review/reconcile `de40d1f12` to those inputs, verify it, push it, and open
a PR.  Do not resume on `codex/iam-ui-ten-001`, `gemini2/iam-ui-ten-001`, or
`claude/iam-ui-ten-001` directly.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`, the worker anchor protocol, and
  `docs/ops/branch-strategy.md`.
- Queried machine truth with `scripts/ai-status.sh show` for the helper and
  parent tasks.
- Inspected worktrees, refs, merge bases, commit provenance, range counts, and
  the complete application diff listed above.
- Checked origin refs with `git ls-remote` and GitHub PR evidence with `gh pr
  list`.
- Ran `git diff --check origin/dev de40d1f12`; it produced no whitespace
  errors.

No application code was changed or certified in this helper task.  This commit
documents the safe replay boundary and preserves the blocked parent until its
missing canonical inputs exist.

## Helper Delivery Evidence

- Commits: `e79e2f3b34e7cc30b8e14ab7014314854c4ab1b3`
  (`...: document clean replay path`) and
  `d6053090b69af0cc7dda18f6b76bd97ccc138c06`
  (`...: record PR evidence`)
- Push: normal non-force push to
  `origin/codex/iam-ui-ten-001-unblock-history-repair`
- PR: [#1353](https://github.com/ajoe734/drts-fleet-platform/pull/1353), open
  against `dev`.  Its initial head was `e79e2f3b...`; the normal follow-up push
  advances the branch to `d6053090b...`.  This is branch-pushed evidence only;
  it does not claim a merge or a dev deployment.
