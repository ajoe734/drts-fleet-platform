# UI-FE-DRV-ONB Unblock History Repair

## Scope

- Task: `UI-FE-DRV-ONB-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-FE-DRV-ONB`
- Owner: `Codex`
- Reviewer: `Claude2`
- Audit timestamp: `2026-05-28`

## Diagnosis

The parent is blocked by branch/worktree history contamination, not by a missing
frontend implementation commit.

1. The real implementation already exists on the pushed owner branch
   `origin/codex2/ui-fe-drv-onb @ b380142de824afbbdeab2db1cba3bbc6c16d84d3`.
   That branch contains the task-scoped commits:
   - `d57639db` `UI-FE-DRV-ONB: rebuild driver onboarding cockpit`
   - `1de72362` `UI-FE-DRV-ONB: owner closeout`
   - `b380142d` `UI-FE-DRV-ONB: rebuild onboarding provisioning screen`
2. The local `codex/ui-fe-drv-onb` branch still points at
   `070f9aea91e066ffce138b321e16dd8cda10828d`, has no remote branch, and does
   not carry the implementation diff.
3. The assigned helper branch `codex/ui-fe-drv-onb-unblock-history-repair`
   points at `c373e932dded182aa209882523a957931f015ec2`, which is an unrelated
   `PH1GC-FIN-GOV-001` commit. The sibling helper branch
   `claude2/ui-fe-drv-onb-unblock-history-repair` points at the same SHA.
4. `c373e932` changes only governance/UAT/E2E files for `PH1GC-FIN-GOV-001` and
   does not touch `apps/driver-app/app/onboarding.tsx`.
5. There is no PR for `codex2/ui-fe-drv-onb`, and canonical `ai-status.json`
   still shows parent task `UI-FE-DRV-ONB` as `backlog`, so the control plane
   never resumed review on the already-pushed parent branch.

## Evidence

### Branch and worktree state

- `origin/dev @ 3eb49a7abb24d9ba6fd9d41395be9a750cb5d47d`
- local `codex/ui-fe-drv-onb @ 070f9aea91e066ffce138b321e16dd8cda10828d`
- local `codex/ui-fe-drv-onb-unblock-history-repair @ c373e932dded182aa209882523a957931f015ec2`
- local + remote `codex2/ui-fe-drv-onb @ b380142de824afbbdeab2db1cba3bbc6c16d84d3`
- local `claude2/ui-fe-drv-onb-unblock-history-repair @ c373e932dded182aa209882523a957931f015ec2`
- `git worktree list --porcelain` shows dedicated worktrees for:
  - `codex/ui-fe-drv-onb`
  - `codex/ui-fe-drv-onb-unblock-history-repair`
  - `codex2/ui-fe-drv-onb`
- `git show-ref --verify` confirms:
  - no `refs/remotes/origin/codex/ui-fe-drv-onb`
  - no `refs/remotes/origin/codex/ui-fe-drv-onb-unblock-history-repair`
  - yes `refs/remotes/origin/codex2/ui-fe-drv-onb @ b380142d`
- `git rev-list --left-right --count origin/dev...codex2/ui-fe-drv-onb = 17 3`
- `git diff --name-status origin/dev...codex2/ui-fe-drv-onb` shows only:
  - `apps/driver-app/app/onboarding.tsx`
  - `apps/driver-app/tsconfig.json`
- `git diff --name-status codex/ui-fe-drv-onb...codex/ui-fe-drv-onb-unblock-history-repair`
  shows only unrelated `PH1GC-FIN-GOV-001` docs/test changes

### Commit contamination

- `git show --stat c373e932` identifies commit subject
  `PH1GC-FIN-GOV-001: replay governance-aware billing/reporting spec and UAT (#308)`
- The same commit modifies 11 files under `docs/`, `support/sidecars/`, and
  `tests/e2e/`, with no onboarding-page file changes
- `git diff 070f9aea..c373e932 -- apps/driver-app/app/onboarding.tsx` is empty

### PR and machine truth

- `gh pr list --state all --search 'head:codex2/ui-fe-drv-onb'` returns `[]`
- Parent task `UI-FE-DRV-ONB` remains `backlog` in canonical `ai-status.json`
  even though `origin/codex2/ui-fe-drv-onb` already contains a verification
  trailer commit
- Before this repair, the expected artifact path
  `support/unblock/UI-FE-DRV-ONB/UI-FE-DRV-ONB-UNBLOCK-HISTORY-REPAIR.md` did
  not exist on `dev` or on the assigned helper branch

## Exact Contamination

The contamination is a three-way mismatch:

1. The actual implementation and verification evidence live on the pushed owner
   branch `origin/codex2/ui-fe-drv-onb`.
2. The local `codex/ui-fe-drv-onb` branch name exists separately but is only an
   older local-only branch with no remote and no review lifecycle.
3. The helper history-repair branch name was created on the Codex lane, but it
   was accidentally parked on the unrelated shared commit `c373e932` from
   `PH1GC-FIN-GOV-001`, so the helper branch itself cannot be used as parent
   evidence.

This means the parent is not blocked by missing onboarding code. It is blocked
because the review/control-plane rail never pointed back to the already-pushed
`codex2/ui-fe-drv-onb` branch, while the visible helper branch names point at
irrelevant history.

## Non-Destructive Repair Path

Do not force-push, rewrite, or rename any existing branch. Repair by treating
the existing pushed owner branch as canonical and replaying the task lifecycle
there.

1. Keep `origin/codex2/ui-fe-drv-onb @ b380142d` as the parent branch of
   record. It already contains the implementation diff and verification trailer.
2. Leave `codex/ui-fe-drv-onb`, `codex/ui-fe-drv-onb-unblock-history-repair`,
   and `claude2/ui-fe-drv-onb-unblock-history-repair` untouched. They are
   contamination evidence, not the replay surface.
3. Parent owner `Codex2` should reopen the task lifecycle on the existing
   pushed branch and hand off the current head for review:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff UI-FE-DRV-ONB Claude2 \
  "Replay review on pushed parent branch origin/codex2/ui-fe-drv-onb @ b380142de824afbbdeab2db1cba3bbc6c16d84d3. History repair confirms the onboarding implementation already lives there; do not use codex/ui-fe-drv-onb-unblock-history-repair because it points at unrelated PH1GC-FIN-GOV-001 commit c373e932."
```

4. Create the missing PR from the same already-pushed branch so review and merge
   evidence attach to the canonical rail instead of the contaminated helper:

```bash
gh pr create --base dev --head codex2/ui-fe-drv-onb \
  --title "UI-FE-DRV-ONB: rebuild onboarding provisioning screen" \
  --body "History repair replay: canonical implementation branch already exists at origin/codex2/ui-fe-drv-onb@b380142de824afbbdeab2db1cba3bbc6c16d84d3. This PR reattaches review to the pushed parent branch without force-pushing any shared history."
```

5. Parent reviewer `Claude2` reviews the same pushed branch/PR and either
   approves the implementation or records a normal code-level blocker:

```bash
AI_NAME=Claude2 scripts/ai-status.sh approve UI-FE-DRV-ONB \
  "Replay approval on origin/codex2/ui-fe-drv-onb @ b380142de824afbbdeab2db1cba3bbc6c16d84d3 after history repair. Review is scoped to the existing onboarding implementation branch; helper branch contamination is no longer the blocker."
```

6. After approval, parent owner `Codex2` can finalize on the same pushed branch
   with normal `done` evidence. No helper-branch rewrite is required.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The already-pushed implementation branch stays canonical.
- The contaminated helper branches remain available as audit evidence.
- Review resumes on the real task branch instead of moving commits across branch
  names.

## Owner Closeout Alignment

- Machine truth review approval for this helper task is owned by `Claude2` at
  `2026-05-28T09:23:12Z`, so this artifact now matches the approved reviewer
  and closeout rail.
- The helper branch of record remains
  `origin/codex/ui-fe-drv-onb-unblock-history-repair`; this closeout refreshes
  only the audit artifact and does not rewrite any shared branch name.
- The concrete unblocked next step for parent task `UI-FE-DRV-ONB` is still to
  replay review on `origin/codex2/ui-fe-drv-onb`, open the missing PR from that
  branch to `dev`, and ignore helper branch `c373e932` except as contamination
  evidence.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`,
  `.orchestrator/skills/worker-anchor-commit.md`, and
  `.orchestrator/skills/task-closeout-finalization.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Compared related refs and worktrees:
  - `git show-ref --verify refs/heads/codex/ui-fe-drv-onb`
  - `git show-ref --verify refs/remotes/origin/codex/ui-fe-drv-onb`
  - `git show-ref --verify refs/heads/codex/ui-fe-drv-onb-unblock-history-repair`
  - `git show-ref --verify refs/remotes/origin/codex/ui-fe-drv-onb-unblock-history-repair`
  - `git show-ref --verify refs/remotes/origin/codex2/ui-fe-drv-onb`
  - `git worktree list --porcelain`
  - `git branch -vv`
- Compared parent and contaminated helper histories:
  - `git log --reverse --oneline 070f9aea..codex2/ui-fe-drv-onb`
  - `git diff --name-status origin/dev...codex2/ui-fe-drv-onb`
  - `git diff --name-status codex/ui-fe-drv-onb...codex/ui-fe-drv-onb-unblock-history-repair`
  - `git show --stat c373e932`
  - `git diff 070f9aea..c373e932 -- apps/driver-app/app/onboarding.tsx`
- Checked PR state:
  - `gh pr list --state all --search 'head:codex2/ui-fe-drv-onb' --json number,title,headRefName,baseRefName,state,url`
