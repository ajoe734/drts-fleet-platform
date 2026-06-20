# MOB-UAT-002 Unblock History Repair

## Scope

- Task: `MOB-UAT-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `MOB-UAT-002`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-20T15:12:05Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-mob-uat-002-unblock-history-repair`
- Assigned helper branch:
  `codex/mob-uat-002-unblock-history-repair`

## Diagnosis

`MOB-UAT-002` is not blocked by damaged shared history. The parent branch is
already a normal linear evidence-pack branch, and the remaining blocker is the
real-device UAT requirement recorded in machine truth.

1. The canonical parent branch already exists remotely as
   `origin/claude/mob-uat-002 @ 553492bc5624d4772a5b9ef377ef873eda2ffe7a`.
   Its tip is a single task commit:
   `MOB-UAT-002: iOS physical-device UAT evidence-pack scaffold (SD §11.4)`.
2. `git reflog show --date=iso claude/mob-uat-002` shows the branch was
   created from `origin/dev` on `2026-06-20 15:00:25 +0000` at
   `643257bcd5f7da26776de0f8911de69eddd25e46`, then advanced once at
   `2026-06-20 15:04:56 +0000` by the scaffold commit. There is no merge,
   reset, or force-push signature in the branch provenance.
3. Relative to current
   `origin/dev @ ee37168950e191e643f9a4b6ebc725eea18effb4`, the parent branch is
   `1 ahead / 1 behind`:
   - unique parent commit:
     `553492bc5` `MOB-UAT-002: iOS physical-device UAT evidence-pack scaffold (SD §11.4)`
   - unique trunk commit:
     `ee3716895` `REP-QA-001: add E2E-022 operations reporting coverage`
4. `git diff --name-only origin/dev...claude/mob-uat-002` shows only one task
   file:
   `docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md`.
   The parent branch does not mix unrelated files or cross-task payload.
5. `git worktree list --porcelain` shows no worktree currently attached to
   `claude/mob-uat-002`, but it also shows no conflicting `MOB-UAT-002`
   worktree, no stray `*-dev-closeout` branch, and no duplicate task-stem alias
   pointing at unrelated commits.
6. Parent machine truth already states the real blocker: a real iPhone,
   TestFlight or signed build, and a human operator are required to execute the
   scenarios in the scaffold. That is an external UAT dependency, not a
   branch-history defect.

## Evidence

### Parent branch state

- `origin/dev @ ee37168950e191e643f9a4b6ebc725eea18effb4`
- `origin/claude/mob-uat-002 @ 553492bc5624d4772a5b9ef377ef873eda2ffe7a`
- `git rev-list --left-right --count origin/dev...claude/mob-uat-002`:
  `1 1`
- `git log --oneline origin/dev..claude/mob-uat-002` shows only:
  - `553492bc5` `MOB-UAT-002: iOS physical-device UAT evidence-pack scaffold (SD §11.4)`
- `git log --oneline claude/mob-uat-002..origin/dev` shows only:
  - `ee3716895` `REP-QA-001: add E2E-022 operations reporting coverage`
- `git diff --name-only origin/dev...claude/mob-uat-002` shows only:
  - `docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md`
- `git reflog show --date=iso claude/mob-uat-002` shows only:
  - `2026-06-20 15:04:56 +0000` `commit: MOB-UAT-002: iOS physical-device UAT evidence-pack scaffold (SD §11.4)`
  - `2026-06-20 15:00:25 +0000` `branch: Created from origin/dev`
- `git branch -r --contains 643257bcd5f7da26776de0f8911de69eddd25e46`
  confirms the parent was created from a commit still on trunk:
  - `origin/dev`
  - `origin/claude/mob-uat-002`

### Worktree state

- local branch `claude/mob-uat-002 @ 553492bc5624d4772a5b9ef377ef873eda2ffe7a`
  tracks `origin/claude/mob-uat-002`
- `git worktree list --porcelain` shows no attached worktree for
  `refs/heads/claude/mob-uat-002`
- there is no second branch or worktree with task stem `mob-uat-002`
  pointing at unrelated content
- the assigned helper branch
  `codex/mob-uat-002-unblock-history-repair @ 7794d85a60bc3aa4038e95e4a054c7bbe5ecd84d`
  tracks `origin/codex/mob-uat-002-unblock-history-repair` and contains only
  this helper task's audit evidence commit

### Machine-truth evidence

- parent task `MOB-UAT-002` is `blocked`
- parent `next` already records that acceptance is external:
  real-device iOS evidence must be captured by a human/TestFlight operator
- helper task `MOB-UAT-002-UNBLOCK-HISTORY-REPAIR` was created by blocked-task
  triage, but the git evidence above shows the parent rail itself is already
  usable

## Exact Contamination

There is no shared branch/worktree/commit contamination on `MOB-UAT-002`
itself.

The only mismatch uncovered by this audit is dispatch-level misclassification:
the parent task was routed to a history-repair helper even though its git rail
is already clean and the real blocker is external iOS evidence capture. The
absence of an attached local worktree is operational context, not corrupted
history.

## Non-Destructive Repair Path

Do not rewrite, force-push, rename, or replay `origin/claude/mob-uat-002`.

1. Keep `origin/claude/mob-uat-002 @ 553492bc5` as the canonical parent branch.
2. When human/TestFlight execution is available, resume from that existing
   branch in a fresh dedicated worktree or checkout instead of editing from an
   unrelated `dev` worktree. Example:

```bash
git fetch origin
git worktree add <resume-worktree> claude/mob-uat-002
```

3. Record the real-device results directly in
   `docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md`.
4. Push the evidence update normally to `origin/claude/mob-uat-002` or, if the
   eventual owner wants a separate follow-up rail, to a new linear child branch
   created from that tip. No force-push or history surgery is required.
5. Handoff `MOB-UAT-002` to `Claude2` only after the real-device evidence is
   captured and the scaffold sections are filled.

## Concrete Parent Next Step

`MOB-UAT-002` should stay blocked on external iOS UAT, but it does not need any
branch repair first.

Concrete next step:

1. reuse `origin/claude/mob-uat-002 @ 553492bc5`
2. collect real iPhone/TestFlight evidence into
   `docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md`
3. push the evidence update with a normal non-force push
4. hand off to `Claude2` for review

## Why This Is Safe

- no shared ref is rewritten
- no force-push is required
- the existing remote branch already isolates the task delta
- the parent remains correctly blocked on external evidence instead of being
  redirected into unnecessary replay work
- using a fresh worktree for the eventual human evidence pass avoids future
  contamination without changing current history

## Owner Closeout

- `2026-06-20T15:14:49Z` reviewer approval from `Codex2` confirmed the
  diagnosis, the pushed helper commit
  `7794d85a60bc3aa4038e95e4a054c7bbe5ecd84d`, and the parent next-step update.
- This helper task is support-only history triage, so closeout records
  `INTEGRATION_STATUS=not_applicable` rather than a product-branch integration
  state.
- No PR, merge to `dev`, CI promotion, or dev deployment is part of this
  history-triage helper branch.

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- checked machine truth with:
  - `AI_NAME=Codex scripts/ai-status.sh show MOB-UAT-002`
  - `AI_NAME=Codex scripts/ai-status.sh show MOB-UAT-002-UNBLOCK-HISTORY-REPAIR`
- inspected parent and helper refs:
  - `git branch --show-current`
  - `git branch -vv --list 'claude/mob-uat-001' 'claude/mob-uat-002' 'codex/mob-uat-002-unblock-history-repair'`
  - `git ls-remote --heads origin '*mob-uat-002*' '*mob-uat-001*'`
  - `git show-ref | grep 'mob-uat-002\\|mob-uat-001'`
  - `git merge-base origin/dev claude/mob-uat-002`
  - `git rev-list --left-right --count origin/dev...claude/mob-uat-002`
  - `git log --oneline origin/dev..claude/mob-uat-002`
  - `git log --oneline claude/mob-uat-002..origin/dev`
  - `git diff --name-only origin/dev...claude/mob-uat-002`
  - `git diff --stat origin/dev..claude/mob-uat-002`
  - `git reflog show --date=iso claude/mob-uat-002`
  - `git branch -r --contains 643257bcd5f7da26776de0f8911de69eddd25e46`
  - `git worktree list --porcelain`
  - `git show --stat --summary --decorate 553492bc5624d4772a5b9ef377ef873eda2ffe7a`
  - `git show --no-patch --pretty=fuller 643257bcd5f7da26776de0f8911de69eddd25e46`
  - `git show --no-patch --pretty=fuller ee37168950e191e643f9a4b6ebc725eea18effb4`

No runtime tests were run in this helper task. This repair is branch-history
triage and machine-truth guidance only.
