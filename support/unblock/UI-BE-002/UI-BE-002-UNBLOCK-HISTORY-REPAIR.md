# UI-BE-002 Unblock History Repair

## Scope

- Task: `UI-BE-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-BE-002`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-26`

## Diagnosis

The parent is blocked by branch/worktree history ambiguity plus a missing
machine-truth transition, not by missing `/api/health` implementation.

1. `origin/gemini2/ui-be-002 @ 242cb93246aa1e7c1151aaeb2624b844a9c49270`
   is the original owner rail and the real contaminated history. Relative to
   `origin/dev` it is `13 ahead / 7 behind`, and its ancestry mixes the health
   work with unrelated surfaces including:
   - `apps/ops-console-web/app/dashboard/page.tsx`
   - `apps/api/package.json`
   - `apps/api/src/common/snake-case.interceptor.ts`
   - `apps/api/src/common/skip-snake-case.decorator.ts`
   - `pnpm-lock.yaml`
   - `apps/api/tsconfig.json`
2. `origin/codex2/ui-be-002 @ 1c32aa1d545929a11b4916c067e86b11a253f598`
   is the later repair rail. It trims the task diff down to the seven health
   files only, and the reviewer handoff history confirms the patch passed
   `vitest`, `tsc --noEmit`, and replay validation against `origin/dev`.
   However, its ancestry still starts from the old planning commit
   `75f10e4c4098f37f3e46d3ba692da6d0e705db2f`, so the branch itself is still
   `7 ahead / 8 behind` `origin/dev`.
3. local `codex/ui-be-002 @ 75f10e4c4098f37f3e46d3ba692da6d0e705db2f` still
   exists as a separate worktree on the planning packet commit and has no
   matching remote branch. That stale reviewer-lane alias reuses the same task
   stem while pointing at non-task history.
4. Canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
   temporarily lost the `review_approved` transition for `UI-BE-002` after the
   final reviewer pass on `b89fec88`. That drift blocked the parent at
   `2026-05-26T12:45:05Z` until this child task reopened the parent onto the
   clean `origin/codex2/ui-be-002` evidence branch and restored a concrete
   machine-truth next step.

## Evidence

### Branch and worktree state

- `origin/dev @ 070f9aea5a16f68c9352d81925a0b6bda3ae2e7c`
- local `codex/ui-be-002 @ 75f10e4c4098f37f3e46d3ba692da6d0e705db2f`
  in worktree
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-be-002`
  with `git branch -vv` showing `[origin/dev: behind 8]`
- `origin/codex2/ui-be-002 @ 1c32aa1d545929a11b4916c067e86b11a253f598`
  with `git rev-list --left-right --count origin/dev...codex2/ui-be-002`
  returning `8 7`
- `origin/gemini2/ui-be-002 @ 242cb93246aa1e7c1151aaeb2624b844a9c49270`
  with `git rev-list --left-right --count origin/dev...gemini2/ui-be-002`
  returning `7 13`
- reviewer-lane `origin/codex/ui-be-002-unblock-history-repair @ affbc19bdcc745e89bf634ace7e289645fc8f19e`
  is the first pushed artifact commit for this child task
- `origin/codex/ui-be-002-sidecar-acceptance @ f37b2a2d2188e1ec835e45f2d5a4034195ccb86d`
- `git ls-remote --heads origin` returns pushed refs for
  `codex2/ui-be-002`, `gemini2/ui-be-002`,
  `codex/ui-be-002-unblock-history-repair`, and
  `codex/ui-be-002-sidecar-acceptance`, but not for `codex/ui-be-002`
- `gh pr list --head codex2/ui-be-002 --json number,title,headRefName,baseRefName,state,url`
  returns `[]`

### Exact diff shape

- `git diff --name-only 5e76ec58..gemini2/ui-be-002` shows 14 mixed-surface
  files spanning health logic, snake_case runtime, dashboard UI, lockfile, and
  config churn
- `git diff --name-only origin/dev...codex2/ui-be-002` shows only:
  - `apps/api/src/health/health.controller.ts`
  - `apps/api/src/health/health.module.ts`
  - `apps/api/src/health/health.service.ts`
  - `apps/api/src/main.ts`
  - `apps/api/tests/unit/health.controller.test.ts`
  - `apps/api/tests/unit/health.service.test.ts`
  - `apps/api/tests/unit/snake-case-runtime.test.ts`
- `git diff --check origin/dev...codex2/ui-be-002` is clean

### Machine-truth state evidence

- Canonical `ai-status.json` currently shows parent `UI-BE-002` as:
  - owner `Codex2`
  - reviewer `Codex`
  - status `review`
  - next step: `Codex` approves the already re-handed clean branch
- `ai-activity-log.jsonl` records:
  - `2026-05-26T12:29:02Z` owner handoff on `ce4d6f1a`
  - `2026-05-26T12:33:00Z` reviewer failure on `ce4d6f1a`
  - `2026-05-26T12:35:37Z` owner re-handoff on `b89fec88`
  - `2026-05-26T12:41:27Z` reviewer pass message for `b89fec88`
  - `2026-05-26T12:45:05Z` parent reassignment + blocker creation
  - `2026-05-26T12:56:49Z` child-task reopen that restored the parent onto
    `origin/codex2/ui-be-002`
  - `2026-05-26T12:59:06Z` owner re-handoff of the unchanged clean parent rail
- The original defect was the missing `review_approved` transition between the
  final review pass and the blocker creation; the parent has since been
  restored to a normal review state without rewriting any shared branch

## Exact Contamination

The blockage is a four-part mismatch:

1. The first owner rail (`origin/gemini2/ui-be-002`) mixed task code with
   unrelated runtime/frontend/config changes and cannot be used as a canonical
   parent rail.
2. The reviewer-lane local branch (`codex/ui-be-002`) still points at the
   planning packet commit, so the same task stem maps to a stale non-task
   worktree.
3. The later repair rail (`origin/codex2/ui-be-002`) is the only pushed branch
   containing the accepted clean task diff, but it is still based on old trunk
   history and therefore serves as review/closeout evidence, not as a rebased
   integration branch.
4. Machine truth lost the final `review -> review_approved` transition, so the
   parent task is blocked even though the clean closeout commit
   `1c32aa1d545929a11b4916c067e86b11a253f598` is already pushed.

## Non-Destructive Repair Path

Do not force-push, rebase, or rename any existing shared branch.

1. Freeze `origin/gemini2/ui-be-002` as audit-only contamination evidence.
2. Treat local `codex/ui-be-002` as a stale alias only; do not reuse it for
   review or closeout.
3. Reuse the already-pushed clean repair rail
   `origin/codex2/ui-be-002 @ 1c32aa1d545929a11b4916c067e86b11a253f598` as the
   canonical parent evidence branch. No branch rewrite is needed.
4. Resume the blocked parent from machine truth so the owner can re-handoff the
   same pushed closeout branch through the normal lifecycle. This was already
   completed by the child-task reviewer:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen UI-BE-002 \
  "History repair complete: ignore audit-only origin/gemini2/ui-be-002 and stale local codex/ui-be-002. Resume on origin/codex2/ui-be-002 @ 1c32aa1d545929a11b4916c067e86b11a253f598; owner should re-handoff that existing clean closeout branch for review approval, then finalize with done. Evidence: support/unblock/UI-BE-002/UI-BE-002-UNBLOCK-HISTORY-REPAIR.md." 
```

5. The parent has already been re-handed to review, so the concrete next step
   is now the reviewer approval:

```bash
AI_NAME=Codex scripts/ai-status.sh approve UI-BE-002 \
  "Review passed after history repair: origin/codex2/ui-be-002 @ 1c32aa1d remains the clean parent evidence branch; origin/gemini2/ui-be-002 is audit-only contamination evidence; owner may close out without any history rewrite."
```

6. Owner closeout step after approval:

```bash
AI_NAME=Codex2 \
COMMIT_HASH=1c32aa1d545929a11b4916c067e86b11a253f598 \
COMMIT_SUBJECT="UI-BE-002: finalize approved health taxonomy closeout" \
PUSH_REMOTE=origin \
PUSH_BRANCH=codex2/ui-be-002 \
PUSH_COMMIT=1c32aa1d545929a11b4916c067e86b11a253f598 \
scripts/ai-status.sh done UI-BE-002 \
  "Owner finalized approved /api/health UiHealthEnvelope closeout on pushed branch origin/codex2/ui-be-002 at 1c32aa1d545929a11b4916c067e86b11a253f598; origin/gemini2/ui-be-002 remains audit-only contamination evidence and no force-push was required."
```

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The contaminated owner rail remains available for audit.
- The clean repair rail remains the canonical pushed evidence branch.
- The parent is resumed by state-machine correction only, not by altering the
  already-pushed task commits.
- The canonical unblock artifact can be replayed onto the owner branch for this
  child task without changing the already-pushed reviewer-lane audit branch.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical
  `/home/edna/workspace/drts-fleet-platform/ai-status.json` and
  `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Compared related refs and worktrees:
  - `git branch -vv | grep 'ui-be-002'`
  - `git worktree list --porcelain`
  - `git log --graph --oneline --decorate --max-count=30 gemini2/ui-be-002 codex2/ui-be-002 codex/ui-be-002 --`
  - `git rev-list --left-right --count origin/dev...gemini2/ui-be-002`
  - `git rev-list --left-right --count origin/dev...codex2/ui-be-002`
  - `git diff --name-only 5e76ec58..gemini2/ui-be-002`
  - `git diff --name-only origin/dev...codex2/ui-be-002`
  - `git diff --check origin/dev...codex2/ui-be-002`
  - `git ls-remote --heads origin 'refs/heads/codex2/ui-be-002' 'refs/heads/gemini2/ui-be-002' 'refs/heads/codex/ui-be-002' 'refs/heads/codex/ui-be-002-sidecar-acceptance'`
  - `gh pr list --head codex2/ui-be-002 --json number,title,headRefName,baseRefName,state,url`
- Confirmed machine-truth event ordering around the lost approval with:
  - `grep -n '"task_id": "UI-BE-002"' -B2 -A6 /home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
