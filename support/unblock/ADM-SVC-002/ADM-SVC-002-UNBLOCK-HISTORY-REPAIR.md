# ADM-SVC-002 Unblock History Repair

## Scope

- Task: `ADM-SVC-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `ADM-SVC-002`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-05T03:00:00Z`

## Diagnosis

The parent is not blocked by missing page code. The contamination is a branch
/ worktree / commit provenance mismatch between local `codex/*` aliases and the
actual pushed owner rails on `origin/codex2/*`.

1. The parent page implementation already exists at
   `21189af7ad95cfc7a7806d008f370900c6ca5ae4` with subject
   `wip(ADM-SVC-002): anchor vehicle eligibility matrix page`.
2. That commit carries trailers for the real owner lane:
   `LLM-Agent: codex2`, `Task-ID: ADM-SVC-002`, `Reviewer: Codex`.
3. Origin has no `refs/heads/codex/adm-svc-002`, but it does have
   `refs/heads/codex2/adm-svc-002 @ 21189af7ad95cfc7a7806d008f370900c6ca5ae4`.
4. The local parent worktree
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-adm-svc-002`
   is on branch `codex/adm-svc-002`, but that local branch tracks
   `origin/dev`, not the pushed owner rail. `git status -sb` therefore reports
   `## codex/adm-svc-002...origin/dev [ahead 1]`, which makes the already-owned
   task commit look like unpublished local drift.
5. The backend dependency shows the same pattern. Origin has no
   `refs/heads/codex/be-svc-002`, but it does have
   `refs/heads/codex2/be-svc-002 @ b1578b59cbdad688973881f272e29e83edde9e39`
   with the reviewed API closeout. Local `codex/be-svc-002` instead points at
   `origin/dev`.
6. This means reviewer/owner evidence exists, but the local lane names suggest
   the wrong rails. The blocker is provenance ambiguity, not missing delivery.

## Evidence

### Branch and worktree state

- `origin/dev @ 1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4`
- local helper branch
  `codex/adm-svc-002-unblock-history-repair @ 1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4`
- local parent alias
  `codex/adm-svc-002 @ 21189af7ad95cfc7a7806d008f370900c6ca5ae4`
  in worktree
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-adm-svc-002`
- pushed parent owner rail
  `origin/codex2/adm-svc-002 @ 21189af7ad95cfc7a7806d008f370900c6ca5ae4`
- local dependency alias
  `codex/be-svc-002 @ 1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4`
- pushed dependency owner rail
  `origin/codex2/be-svc-002 @ b1578b59cbdad688973881f272e29e83edde9e39`
- `git ls-remote --heads origin 'codex/adm-svc-002' 'codex/be-svc-002' 'codex2/adm-svc-002' 'codex2/be-svc-002'`
  returns only:
  - `refs/heads/codex2/adm-svc-002 @ 21189af7...`
  - `refs/heads/codex2/be-svc-002 @ b1578b59...`
- local parent branch config shows:
  - `branch.codex/adm-svc-002.remote = origin`
  - `branch.codex/adm-svc-002.merge = refs/heads/dev`

### Exact task diffs

- `git diff --stat origin/dev..codex/adm-svc-002` shows the parent branch is
  exactly the vehicle-eligibility page diff:
  - `apps/platform-admin-web/app/vehicle-eligibility/page.tsx`
  - `apps/platform-admin-web/components/admin-shell.tsx`
  - `apps/platform-admin-web/components/assistant/assistant-types.ts`
  - `apps/platform-admin-web/components/assistant/route-context.ts`
  - `apps/platform-admin-web/lib/translations.ts`
- `git diff --stat origin/dev..origin/codex2/be-svc-002` shows the reviewed API
  dependency diff:
  - `apps/api/src/modules/vehicle-eligibility/*`
  - `apps/api/src/app.module.ts`
  - `packages/contracts/src/index.ts`
  - `tests/unit/vehicle-eligibility.test.ts`

### Commit provenance

- `git show --stat --summary --no-patch 21189af7` confirms:
  - subject `wip(ADM-SVC-002): anchor vehicle eligibility matrix page`
  - trailers `LLM-Agent: Codex2`, `Task-ID: ADM-SVC-002`, `Reviewer: Codex`
- `git show --stat --summary --no-patch b1578b59` confirms:
  - subject `BE-SVC-002: finalize reviewed vehicle eligibility matrix admin API`
  - trailers `LLM-Agent: Codex2`, `Task-ID: BE-SVC-002`, `Reviewer: Codex`
  - verification trailers already recorded on the dependency closeout commit

## Exact Contamination

The contamination is a four-part naming/provenance mismatch:

1. The real pushed owner rails for both `ADM-SVC-002` and `BE-SVC-002` live on
   `origin/codex2/*`.
2. The local `codex/*` branches reuse the same task ids but either point at a
   local-only alias (`codex/adm-svc-002`) or still point at `origin/dev`
   (`codex/be-svc-002`).
3. The local parent alias also tracks `origin/dev`, so standard status output
   misrepresents the parent commit as unpublished branch drift.
4. Because the dependency and parent branch names no longer match the owner
   lane recorded in commit trailers and machine truth, the parent task appears
   blocked on branch history even though the clean owner commits already exist.

This is branch/worktree/commit contamination, not a content regression.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any shared branch.

1. Treat `origin/codex2/adm-svc-002 @ 21189af7...` as the canonical parent rail.
2. Treat `origin/codex2/be-svc-002 @ b1578b59...` as the canonical dependency
   rail.
3. Treat local `codex/adm-svc-002` only as a worktree alias for inspection of
   the pushed `codex2` commit; do not push or open review against
   `origin/codex/adm-svc-002`.
4. Treat local `codex/be-svc-002` as stale/misdirected; do not use it as
   dependency evidence.
5. Resume `ADM-SVC-002` from the existing owner implementation commit on
   `origin/codex2/adm-svc-002`, using `origin/codex2/be-svc-002` as its backend
   dependency evidence.
6. Keep this helper branch only for the diagnostic artifact and machine-truth
   note that clarifies which rails are canonical.

If the owner wants local status output to align with provenance, they may
optionally repoint the local aliases with explicit branch config, but that is a
local convenience only and is not required for the safe repair path above.

## Parent Next Step

History ambiguity is resolved. The concrete next step for `ADM-SVC-002` is:

- reuse the owner implementation already on
  `origin/codex2/adm-svc-002 @ 21189af7ad95cfc7a7806d008f370900c6ca5ae4`
- use `origin/codex2/be-svc-002 @ b1578b59cbdad688973881f272e29e83edde9e39`
  as the backend dependency evidence
- do not reopen or push any `origin/codex/*` branch for this task stem
- continue the separate acceptance decision about `i18n-guard` from the correct
  `codex2` rails instead of treating branch history as the blocker

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The pushed owner and dependency rails stay unchanged.
- The confusing local `codex/*` aliases are demoted to audit-only context.
- The helper branch records the diagnosis without contaminating the parent rail.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Inspected machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show ADM-SVC-002-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show ADM-SVC-002`
- Compared related refs and worktrees:
  - `git worktree list --porcelain`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short) %(subject)' ...`
  - `git ls-remote --heads origin 'codex/adm-svc-002' 'codex/be-svc-002' 'codex2/adm-svc-002' 'codex2/be-svc-002'`
  - `git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-adm-svc-002 status -sb`
  - `git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-adm-svc-002 config --get branch.codex/adm-svc-002.merge`
  - `git diff --stat origin/dev..codex/adm-svc-002`
  - `git diff --stat origin/dev..origin/codex2/be-svc-002`
  - `git show --stat --summary --no-patch 21189af7`
  - `git show --stat --summary --no-patch b1578b59`
