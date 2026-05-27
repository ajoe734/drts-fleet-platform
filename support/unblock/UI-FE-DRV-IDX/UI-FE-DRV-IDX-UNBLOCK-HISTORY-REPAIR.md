# UI-FE-DRV-IDX Unblock History Repair

## Scope

- Task: `UI-FE-DRV-IDX-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-FE-DRV-IDX`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-05-27`

## Diagnosis

The parent is blocked by mixed branch/state history, not by a missing cockpit
implementation commit.

1. `UI-FE-DRV-IDX` first moved through a `codex2` implementation/review cycle.
   `Codex2` handed off commit `64b7a51d` on 2026-05-25T19:54Z, and `Codex`
   explicitly recorded at 2026-05-25T20:12Z that this handoff commit was being
   pulled into `codex/ui-fe-drv-idx` before fixing the inbox truncation review
   bug.
2. That produced one pushed owner-lane branch
   `origin/codex/ui-fe-drv-idx @ b334ef9663d026e9ca37da636a158219dc75eff2`
   with the reviewed follow-up fix commit `8ecdea98` in its ancestry.
3. The same task later completed again on a separate pushed branch
   `origin/codex2/ui-fe-drv-idx @ 1c83f9af648a0a787fa0da41e4c1688e6a74ae1b`,
   whose ancestry is different: it contains the original `codex2` cockpit rebuild
   chain (`1f34ba15`, `97b3c0c5`, `1c83f9af`) and is based on a later trunk tip
   `070f9aea`, not on the `5e76ec58` base used by the `codex` branch.
4. Because both task branches are pushed and both carry closeout commits for the
   same task id, the control plane can see two plausible parent histories even
   though only one matches the parent's current machine-truth owner/reviewer
   pair.
5. Parent machine truth now points at the `codex2` branch. In canonical
   `ai-status.json`, `UI-FE-DRV-IDX` is owned by `Codex2`, reviewed by
   `Claude2`, and its blocker text says closeout commit `1c83f9af` is already on
   `origin/codex2/ui-fe-drv-idx` but the task regressed from `review_approved`
   back to `in_progress` after approval due to a later owner progress update.

## Evidence

### Branch and commit state

- `origin/codex/ui-fe-drv-idx @ b334ef9663d026e9ca37da636a158219dc75eff2`
- `origin/codex2/ui-fe-drv-idx @ 1c83f9af648a0a787fa0da41e4c1688e6a74ae1b`
- merge-base of `codex/ui-fe-drv-idx` and `codex2/ui-fe-drv-idx` is
  `5e76ec587b25307a5e63068e4ef80a895d4179a6`
- `git rev-list --left-right --count codex/ui-fe-drv-idx...codex2/ui-fe-drv-idx`
  returns `2 10`
- `git log --oneline 5e76ec58..b334ef96` shows the `codex` branch carries:
  - `8ecdea98` `UI-FE-DRV-IDX: cover full cockpit notification inbox`
  - `b334ef96` `UI-FE-DRV-IDX: finalize approved workspace cockpit closeout`
- `git log --oneline 070f9aea..1c83f9af` shows the `codex2` branch carries:
  - `1f34ba15` `UI-FE-DRV-IDX: rebuild driver workspace cockpit`
  - `97b3c0c5` `UI-FE-DRV-IDX: complete cockpit workspace spec`
  - `1c83f9af` `UI-FE-DRV-IDX: finalize cockpit reskin closeout`
- `git diff --name-only codex/ui-fe-drv-idx...codex2/ui-fe-drv-idx` shows the
  two branch histories do not differ only in `apps/driver-app/app/index.tsx`;
  the later-base `codex2` branch also drags unrelated docs/ops history into the
  comparison because it starts from a newer trunk commit.

### Machine-truth anchors

- Parent task `UI-FE-DRV-IDX` is `blocked` in canonical
  `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Parent `next` says:
  `Closeout commit 1c83f9af pushed to origin/codex2/ui-fe-drv-idx ... reviewer must restore review_approved before owner can run done with commit/push metadata.`
- Canonical activity log records the branch crossover:
  - `2026-05-25T19:54:06Z` `Codex2` handoff cites pushed commit `64b7a51d`
  - `2026-05-25T20:12:42Z` `Codex` progress says it is pulling handoff commit
    `64b7a51d` into `codex/ui-fe-drv-idx`
  - `2026-05-25T20:29:07Z` `Codex` hands off the resulting `codex` branch after
    validating commit `8ecdea98`
  - `2026-05-26T13:43:59Z` chairman creates this history-repair child and cites
    the later `codex2` closeout commit `1c83f9af` as the already-pushed parent
    tip that lost its `review_approved` state
- `git ls-remote --heads origin` confirms both parent branches exist remotely:
  - `refs/heads/codex/ui-fe-drv-idx @ b334ef96`
  - `refs/heads/codex2/ui-fe-drv-idx @ 1c83f9af`
- `gh pr list --state all --search 'UI-FE-DRV-IDX'` finds no task-specific PR;
  the only match is the umbrella task-registration PR `#286`

## Exact Contamination

The contamination is a two-part mismatch:

1. The same task id has two different pushed parent branches with different
   commit ancestry:
   `origin/codex/ui-fe-drv-idx @ b334ef96` and
   `origin/codex2/ui-fe-drv-idx @ 1c83f9af`.
2. The parent's machine truth no longer points to the earlier `codex` replay.
   It now points to the later `codex2` closeout, but the reviewer-approved state
   for that closeout was accidentally regressed by a later owner progress event.

This means the parent is not blocked by missing UI work. It is blocked because
history currently presents two durable branch rails for the same task while the
control plane still needs the `codex2` rail restored to `review_approved`/`done`.

## Non-Destructive Repair Path

Do not force-push, rebase, rename, or delete either parent branch. Repair by
declaring the already-pushed `codex2` branch the canonical parent replay rail
and replaying only the state transition.

1. Treat `origin/codex2/ui-fe-drv-idx @ 1c83f9af648a0a787fa0da41e4c1688e6a74ae1b`
   as the canonical parent branch, because:
   - the current parent owner/reviewer pair is `Codex2` / `Claude2`
   - canonical `ai-status.json` already names `1c83f9af` as the closeout commit
   - the blocker is loss of `review_approved`, not absence of a pushed commit
2. Leave `origin/codex/ui-fe-drv-idx @ b334ef96` untouched. It remains valid
   audit evidence of the earlier replay/fix path, but it is not the canonical
   branch for final parent closeout anymore.
3. Parent reviewer `Claude2` restores `review_approved` on the existing pushed
   `codex2` branch:

```bash
AI_NAME=Claude2 scripts/ai-status.sh approve UI-FE-DRV-IDX \
  "Replay approval on canonical parent branch origin/codex2/ui-fe-drv-idx @ 1c83f9af648a0a787fa0da41e4c1688e6a74ae1b. History repair confirms the older origin/codex/ui-fe-drv-idx @ b334ef96 is superseded audit history, not the closeout rail. No force-push or code replay required."
```

4. Parent owner `Codex2` then performs the formal closeout on the same already
   pushed branch with commit/push metadata:

```bash
AI_NAME=Codex2 COMMIT_HASH=1c83f9af648a0a787fa0da41e4c1688e6a74ae1b \
COMMIT_SUBJECT="UI-FE-DRV-IDX: finalize cockpit reskin closeout" \
PUSH_REMOTE=origin PUSH_BRANCH=codex2/ui-fe-drv-idx \
scripts/ai-status.sh done UI-FE-DRV-IDX \
  "Parent closeout finalized on canonical branch origin/codex2/ui-fe-drv-idx @ 1c83f9af648a0a787fa0da41e4c1688e6a74ae1b after restoring reviewer approval. Earlier origin/codex/ui-fe-drv-idx history remains preserved as audit evidence; no force-push required."
```

5. If reviewer `Claude2` finds a real UI regression on commit `1c83f9af`, that
   should be recorded as a normal parent reopen/blocker against
   `origin/codex2/ui-fe-drv-idx`. Do not reopen history repair unless the
   canonical replay branch itself becomes ambiguous again.

## Why This Is Safe

- No remote branch is rewritten.
- No commit moves between branch names.
- The already-pushed closeout commit `1c83f9af` remains the canonical parent tip.
- The earlier `codex` branch remains available for audit and diff inspection.
- The repair resolves ambiguity by replaying state, not by rewriting history.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Compared related branch and worktree state:
  - `git worktree list --porcelain`
  - `git branch -vv | grep 'ui-fe-drv-idx'`
  - `git ls-remote --heads origin 'refs/heads/codex/ui-fe-drv-idx' 'refs/heads/codex2/ui-fe-drv-idx'`
- Compared ancestry and divergence:
  - `git merge-base codex/ui-fe-drv-idx codex2/ui-fe-drv-idx`
  - `git rev-list --left-right --count codex/ui-fe-drv-idx...codex2/ui-fe-drv-idx`
  - `git log --oneline 5e76ec58..b334ef96`
  - `git log --oneline 070f9aea..1c83f9af`
  - `git diff --name-only codex/ui-fe-drv-idx...codex2/ui-fe-drv-idx`
- Confirmed machine-truth blocker and crossover history:
  - `sed -n '23045,23105p' /home/edna/workspace/drts-fleet-platform/ai-status.json`
  - `grep -n '64b7a51d\\|UI-FE-DRV-IDX-UNBLOCK-HISTORY-REPAIR' /home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Confirmed no task-specific PR exists yet:
  - `gh pr list --state all --search 'UI-FE-DRV-IDX' --json number,title,headRefName,baseRefName,state,url`
