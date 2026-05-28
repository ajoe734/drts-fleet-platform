# UI-FE-OPS-CC Unblock History Repair

## Scope

- Task: `UI-FE-OPS-CC-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-FE-OPS-CC`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-05-27T23:40:39Z`
- Canonical machine-truth root:
  `/home/edna/workspace/drts-fleet-platform`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-fe-ops-cc-unblock-history-repair`
- Assigned helper branch:
  `codex/ui-fe-ops-cc-unblock-history-repair`

## Diagnosis

`UI-FE-OPS-CC` is not blocked by missing UI code. The remaining block is a
combination of parent lifecycle drift plus stale helper-branch routing.

1. The real parent evidence branch is
   `origin/codex2/ui-fe-ops-cc @ ea083ab0bab6b5cf93bfbcbb273c37f65ef3b38f`.
   That branch already contains the reviewed owner-closeout commit for
   `UI-FE-OPS-CC`.
2. The last reviewed content commit on the parent rail is
   `79d85fbfd7550e8ff763d92cc6fe19a798081f94`
   (`wip(UI-FE-OPS-CC): align callcenter workspace to canvas`), and the parent
   task's existing review notes say reviewer `Claude` approved that content.
3. The helper branch assigned to this task,
   `codex/ui-fe-ops-cc-unblock-history-repair`, is not a continuation of any
   prior repair work. `git reflog` shows a single event:
   `2026-05-26 21:40:41 +0000 branch: Created from origin/dev`.
4. A second local branch,
   `claude2/ui-fe-ops-cc-unblock-history-repair`, is contaminated the same way:
   it also has only one reflog entry and was created from the same old
   `origin/dev` snapshot.
5. Both helper branches resolve to the identical unrelated SHA
   `c373e932dded182aa209882523a957931f015ec2`
   (`PH1GC-FIN-GOV-001: replay governance-aware billing/reporting spec and UAT
   (#308)`), while current `origin/dev` has already advanced to
   `3eb49a7ad2d2237b4b4ba688cadc9778cec76d69`.
6. There is no pushed remote helper branch for either stale helper name:
   `git ls-remote --heads origin` returns refs for
   `codex2/ui-fe-ops-cc` and `codex2/ui-fe-ops-cc-unblock-manual-unblock`, but
   not for `codex/ui-fe-ops-cc-unblock-history-repair` or
   `claude2/ui-fe-ops-cc-unblock-history-repair`.
7. The parent's earlier unblock helper already proved the functional blocker is
   lifecycle drift, not missing implementation: after reviewer approval at
   `2026-05-26T15:22:23Z`, owner `Codex2` ran `progress` at
   `2026-05-26T15:22:57Z` and later `blocker` at `2026-05-26T15:26:28Z`,
   which pulled the parent out of the normal `review_approved -> done` path.

The contamination is therefore not on the parent delivery branch. It is on the
helper-task branch/worktree routing: two local helper branches exist with the
correct task stem but the wrong ancestry, no task commits, no remote refs, and
an unrelated merge SHA at their heads.

## Evidence

### Parent task evidence already exists

- `origin/codex2/ui-fe-ops-cc @ ea083ab0bab6b5cf93bfbcbb273c37f65ef3b38f`
- closeout subject:
  `UI-FE-OPS-CC: owner closeout`
- trailers on `ea083ab0`:
  - `LLM-Agent: Codex2`
  - `Task-ID: UI-FE-OPS-CC`
  - `Reviewer: Claude`
  - `Verification: pnpm --filter @drts/ops-console-web typecheck; pnpm --filter @drts/ops-console-web build`
- last reviewed content commit:
  `79d85fbfd7550e8ff763d92cc6fe19a798081f94`
- existing machine-truth note on parent `UI-FE-OPS-CC` says:
  - current status is `review`
  - the review evidence already approved commit `79d85fbf`
  - closeout commit/push already exist at
    `ea083ab0bab6b5cf93bfbcbb273c37f65ef3b38f` on
    `origin/codex2/ui-fe-ops-cc`

### Helper branch contamination

- assigned helper branch before this repair:
  `codex/ui-fe-ops-cc-unblock-history-repair @ c373e932dded182aa209882523a957931f015ec2`
- parallel stale helper branch:
  `claude2/ui-fe-ops-cc-unblock-history-repair @ c373e932dded182aa209882523a957931f015ec2`
- both helper branches have merge-base `c373e932` with `origin/dev`
- `git reflog show codex/ui-fe-ops-cc-unblock-history-repair`:
  `c373e932 ... branch: Created from origin/dev`
- `git reflog show claude2/ui-fe-ops-cc-unblock-history-repair`:
  `c373e932 ... branch: Created from origin/dev`
- current trunk tip:
  `origin/dev @ 3eb49a7ad2d2237b4b4ba688cadc9778cec76d69`
- remote refs present:
  - `origin/codex2/ui-fe-ops-cc @ ea083ab0bab6b5cf93bfbcbb273c37f65ef3b38f`
  - `origin/codex2/ui-fe-ops-cc-unblock-manual-unblock @ 2d0d12e302c1fbac378a3b421fe06f0b6232e8fa`
- remote refs absent:
  - `origin/codex/ui-fe-ops-cc-unblock-history-repair`
  - `origin/claude2/ui-fe-ops-cc-unblock-history-repair`

### Existing unblock evidence on the parent path

`support/unblock/UI-FE-OPS-CC/UI-FE-OPS-CC-UNBLOCK-MANUAL-UNBLOCK.md` already
records that:

- reviewer `Claude` approved the parent at `2026-05-26T15:22:23Z`
- owner `Codex2` regressed the state with a `progress` call at
  `2026-05-26T15:22:57Z`
- owner `Codex2` then set a `blocker` at `2026-05-26T15:26:28Z`
- the legal replay path is:
  `resume_parent_task -> handoff -> approve -> done`

That manual-unblock packet remains correct. This history-repair task only adds
the missing branch/worktree explanation so later operators do not confuse the
stale local helper branches with the real parent evidence branch.

## Exact Contamination

The exact contamination is three-part:

1. The real parent implementation and closeout evidence live on
   `origin/codex2/ui-fe-ops-cc`, but the history-repair helper got reassigned
   onto a different lane without inheriting any earlier helper history.
2. Two local helper branches with the correct task stem now exist
   (`codex/...` and `claude2/...`), yet both are just one-step local branches
   created from old `origin/dev @ c373e932` and therefore look canonical while
   containing zero task evidence.
3. Because the parent was already separately diagnosed as lifecycle drift, the
   stale helper branches risk sending reviewers back to an unrelated merge SHA
   instead of the actual closeout commit `ea083ab0` and the existing manual
   replay instructions.

This is stale branch/worktree routing contamination layered on top of an
already-documented parent state regression. It does not require rewriting the
shared parent branch or force-pushing any published history.

## Non-Destructive Repair Path

Do not force-push, rebase, or rename any shared branch.

1. Treat `origin/codex2/ui-fe-ops-cc @ ea083ab0` as the canonical parent
   delivery rail.
2. Preserve the stale local-only helper branches as audit evidence of bad
   routing:
   - `codex/ui-fe-ops-cc-unblock-history-repair @ c373e932`
   - `claude2/ui-fe-ops-cc-unblock-history-repair @ c373e932`
3. Rebuild the helper packet additively on the currently assigned Codex helper
   branch instead of trying to transplant or rewrite any Codex2 history.
4. Push this rebuilt helper branch normally so a real remote evidence rail
   exists for `codex/ui-fe-ops-cc-unblock-history-repair`.
5. Keep the parent replay path exactly as the manual-unblock packet already
   describes:
   - chair resumes `UI-FE-OPS-CC`
   - owner `Codex2` re-handoffs against the already-pushed parent closeout
     branch
   - reviewer `Claude` re-approves
   - owner `Codex2` runs `done` with `COMMIT_HASH=ea083ab0...`

## Concrete Parent Next Step

`UI-FE-OPS-CC` should not use either stale local helper branch for closeout.
Its concrete next step remains:

1. keep the reviewed parent evidence on
   `origin/codex2/ui-fe-ops-cc @ ea083ab0bab6b5cf93bfbcbb273c37f65ef3b38f`
2. replay the parent lifecycle only, not the code changes:
   - `AI_NAME=Codex2 scripts/ai-status.sh handoff UI-FE-OPS-CC Claude "...ea083ab0..."`
   - `AI_NAME=Claude scripts/ai-status.sh approve UI-FE-OPS-CC "...ea083ab0..."`
   - `AI_NAME=Codex2 COMMIT_HASH=ea083ab0... COMMIT_SUBJECT='UI-FE-OPS-CC: owner closeout' PUSH_REMOTE=origin PUSH_BRANCH=codex2/ui-fe-ops-cc scripts/ai-status.sh done UI-FE-OPS-CC "..."`
3. ignore `codex/ui-fe-ops-cc-unblock-history-repair@c373e932` and
   `claude2/ui-fe-ops-cc-unblock-history-repair@c373e932` for parent delivery;
   they are stale helper placeholders only

## Why This Is Safe

- no shared branch is rewritten
- no force-push is required
- the actual parent evidence branch stays unchanged
- the earlier manual-unblock packet stays valid
- the stale helper branches remain reachable for audit instead of being hidden
- the new helper packet gives future reviewers a pushed task-scoped branch with
  correct branch ancestry explanation

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- inspected canonical machine truth for:
  - `UI-FE-OPS-CC`
  - `UI-FE-OPS-CC-UNBLOCK-HISTORY-REPAIR`
  - `UI-FE-OPS-CC-UNBLOCK-MANUAL-UNBLOCK`
- inspected parent and helper refs:
  - `git fetch origin --prune`
  - `git branch -vv --list 'codex2/ui-fe-ops-cc' 'claude2/ui-fe-ops-cc-unblock-history-repair' 'codex/ui-fe-ops-cc-unblock-history-repair'`
  - `git ls-remote --heads origin 'codex/ui-fe-ops-cc-unblock-history-repair' 'claude2/ui-fe-ops-cc-unblock-history-repair' 'codex2/ui-fe-ops-cc' 'codex2/ui-fe-ops-cc-unblock-manual-unblock'`
  - `git reflog show --date=iso codex/ui-fe-ops-cc-unblock-history-repair`
  - `git reflog show --date=iso claude2/ui-fe-ops-cc-unblock-history-repair`
  - `git rev-parse codex/ui-fe-ops-cc-unblock-history-repair claude2/ui-fe-ops-cc-unblock-history-repair origin/dev codex2/ui-fe-ops-cc`
  - `git show --no-patch --format=fuller c373e932`
  - `git show --no-patch --format=fuller 3eb49a7a`
  - `git show --no-patch --format=fuller 79d85fbf`
  - `git show --no-patch --format=fuller ea083ab0`
  - `git show --stat --summary --format=fuller a9953b23`
  - `git show origin/codex2/ui-fe-ops-cc-unblock-manual-unblock:support/unblock/UI-FE-OPS-CC/UI-FE-OPS-CC-UNBLOCK-MANUAL-UNBLOCK.md`

No runtime tests were run. This task is branch/history evidence repair only.
