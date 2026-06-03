# PA-AI-QA-001 Unblock History Repair

## Scope

- Task: `PA-AI-QA-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PA-AI-QA-001`
- Owner: `Codex2`
- Reviewer: `Claude2`
- Audit timestamp: `2026-06-03T03:42:00Z`

## Diagnosis

The parent is blocked by task-branch ancestry contamination, not by a missing
QA commit.

1. The expected parent owner branch is local `codex/pa-ai-qa-001` at
   `d6cceaaf22d8704c6610c8f05f746bdd05786cc0`, but there is no matching remote
   `origin/codex/pa-ai-qa-001`.
2. `git reflog show codex/pa-ai-qa-001` proves that branch was created cleanly
   from `origin/dev @ 3be8464262d315d57b1d42d004cc196d3578bf42`, then
   immediately contaminated by three cherry-picks from task `PA-AI-FE-002`
   before the QA anchor landed:
   - `6c5fa95a` `PA-AI-FE-002: add deterministic Platform Admin assistant route-context registry/adapters`
   - `04c48a99` `PA-AI-FE-002: align assistant RefreshTier to canonical @drts/contracts union`
   - `fb769bea` `PA-AI-FE-002: fix noUncheckedIndexedAccess in toSegments path split`
3. Those three commits are not QA-only work. They are local cherry-pick copies
   of already-pushed FE-002 work that canonically exists on
   `origin/claude/pa-ai-fe-002` as:
   - `907dd7f6` route-context registry/adapters
   - `7d6ff283` canonical RefreshTier alignment
   - `999704e4` strict typecheck fix
4. Relative to the clean FE-002 baseline (`origin/claude/pa-ai-fe-002 @
   999704e4`), the QA anchor `d6cceaaf` adds only five task-owned file changes:
   - `apps/platform-admin-web/components/admin-shell.tsx`
   - `apps/platform-admin-web/components/assistant/platform-assistant-overlay.tsx`
   - `apps/platform-admin-web/lib/runtime-config.tsx`
   - `playwright.config.ts`
   - `tests/e2e/platform-admin-assistant-overlay.spec.ts`
5. Because the local-only owner branch mixes FE-002 ancestry under a QA task
   name, it cannot be safely pushed as canonical `PA-AI-QA-001` evidence
   without also publishing unrelated task history.

## Evidence

### Branch and worktree state

- `origin/dev @ 3be8464262d315d57b1d42d004cc196d3578bf42`
- local `codex/pa-ai-qa-001 @ d6cceaaf22d8704c6610c8f05f746bdd05786cc0`
- no remote `origin/codex/pa-ai-qa-001`
- canonical FE-002 rail:
  `origin/claude/pa-ai-fe-002 @ 999704e4fd7603cb87fa29b03520e61823b3b8f8`
- `git merge-base origin/dev codex/pa-ai-qa-001` returns `3be84642`,
  confirming the branch started from clean `dev`
- `git log --oneline origin/dev..codex/pa-ai-qa-001` returns exactly:
  - `d6cceaaf` `wip(PA-AI-QA-001): anchor assistant overlay coverage`
  - `fb769bea` `PA-AI-FE-002: fix noUncheckedIndexedAccess in toSegments path split`
  - `04c48a99` `PA-AI-FE-002: align assistant RefreshTier to canonical @drts/contracts union`
  - `6c5fa95a` `PA-AI-FE-002: add deterministic Platform Admin assistant route-context registry/adapters`
- `git branch -r --contains d6cceaaf` returns nothing, confirming the QA anchor
  has never been pushed
- `git branch -r | grep 'pa-ai-fe-002'` shows the existing clean upstream
  dependency rail `origin/claude/pa-ai-fe-002`

### Exact diff shape

- `git diff --name-only origin/dev...d6cceaaf` shows eight files because it
  includes the contaminated FE-002 ancestry plus the QA overlay work
- `git diff --name-only 999704e4..d6cceaaf` isolates the true QA-only delta to
  five files:
  - `apps/platform-admin-web/components/admin-shell.tsx`
  - `apps/platform-admin-web/components/assistant/platform-assistant-overlay.tsx`
  - `apps/platform-admin-web/lib/runtime-config.tsx`
  - `playwright.config.ts`
  - `tests/e2e/platform-admin-assistant-overlay.spec.ts`
- `git show --stat --summary d6cceaaf` confirms the QA anchor itself touches
  only those five files and introduces the overlay + Playwright coverage

### Machine-truth anchor

- Parent task `PA-AI-QA-001` remains `blocked` in canonical machine truth
- Parent `next` previously referenced boot/build-chain validation issues, but
  did not isolate the separate branch-history problem on `codex/pa-ai-qa-001`

## Exact Contamination

The contamination is a three-part mismatch:

1. The branch name `codex/pa-ai-qa-001` implies a task-scoped QA rail, but its
   ancestry includes three FE-002 commits under duplicated local hashes.
2. The same logical FE-002 work already exists on a pushed upstream branch
   (`origin/claude/pa-ai-fe-002`), so the QA branch duplicated dependency
   history instead of cleanly building on it.
3. Because `origin/codex/pa-ai-qa-001` does not yet exist, the owner still has
   a safe non-destructive escape hatch, but only if the contaminated local
   branch is preserved as audit evidence and replaced with a clean branch before
   first push.

## Non-Destructive Repair Path

Do not force-push or rewrite any shared remote history. The contaminated QA
branch is local-only, so repair can happen by preserving it and creating a
fresh canonical owner branch.

1. Preserve the current contaminated local branch as audit evidence by renaming
   it locally, for example:

```bash
git branch -m codex/pa-ai-qa-001 codex/pa-ai-qa-001-contaminated-20260603
```

2. Recreate the canonical owner branch name from the clean FE-002 upstream rail
   that already contains the required route-context dependency:

```bash
git switch -c codex/pa-ai-qa-001 origin/claude/pa-ai-fe-002
```

3. Replay only the QA anchor onto that clean base:

```bash
git cherry-pick d6cceaaf22d8704c6610c8f05f746bdd05786cc0
```

4. Push the fresh branch as the first shared `PA-AI-QA-001` rail:

```bash
git push -u origin codex/pa-ai-qa-001
```

5. Resume parent validation and review from that clean branch. If `PA-AI-FE-002`
   merges to `origin/dev` before the replay happens, the owner may instead
   recreate `codex/pa-ai-qa-001` from updated `origin/dev` and cherry-pick
   `d6cceaaf`; the key rule is that the pushed QA rail must not include the
   duplicated FE-002 cherry-pick ancestry.

6. Keep the renamed contaminated local branch as immutable audit evidence until
   the parent task closes out. No helper or parent branch requires force-push.

## Current Unblocked Next Step

For parent owner `Codex`:

1. Rename local-only `codex/pa-ai-qa-001` to an audit alias.
2. Recreate `codex/pa-ai-qa-001` from `origin/claude/pa-ai-fe-002` (or
   `origin/dev` if FE-002 merges first).
3. Cherry-pick `d6cceaaf`.
4. Push `origin/codex/pa-ai-qa-001`.
5. Continue the existing build-chain unblock work from that clean rail instead
   of the contaminated local branch.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The contaminated local branch is preserved for audit instead of being deleted.
- The clean pushed QA rail will contain only one QA commit on top of the
  accepted FE-002 dependency baseline.
- The parent task can resume on its intended branch name with unambiguous
  task-scoped evidence.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Compared branch ancestry and reflog:
  - `git reflog show --date=iso codex/pa-ai-qa-001`
  - `git merge-base origin/dev codex/pa-ai-qa-001`
  - `git log --oneline origin/dev..codex/pa-ai-qa-001`
  - `git branch -r --contains d6cceaaf`
  - `git ls-remote --heads origin 'codex/pa-ai-qa-001' 'codex2/pa-ai-qa-001-unblock-history-repair'`
- Compared the contaminated branch against the clean FE-002 upstream:
  - `git branch -r | grep 'pa-ai-fe-002'`
  - `git log --oneline --max-count=12 origin/claude/pa-ai-fe-002`
  - `git diff --name-only 999704e4..d6cceaaf`
  - `git diff --name-only origin/dev...d6cceaaf`
- Confirmed the QA anchor contents:
  - `git show --stat --summary d6cceaaf`
