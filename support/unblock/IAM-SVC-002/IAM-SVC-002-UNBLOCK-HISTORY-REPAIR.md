# IAM-SVC-002 Unblock History Repair

## Scope

- Task: `IAM-SVC-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-SVC-002`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-08-05T14:40:00Z`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-svc-002-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-svc-002-unblock-history-repair`

## Diagnosis

`IAM-SVC-002` is blocked by branch/worktree/commit contamination, not by missing
implementation code. The accepted implementation exists on a local owner rail,
but every shared reference that another worker would naturally follow points at
the wrong history.

1. The owner implementation rail is local `gemini2/iam-svc-002 @ e868122f`.
   That branch contains the actual reviewed fix stack:
   `fc34223b -> 718a3d04 -> cbc9fdca -> de0ae9af -> e868122f`.
2. Before this repair, `git ls-remote --heads origin
   'refs/heads/gemini2/iam-svc-002'` returned no result, so the canonical owner
   rail had never been pushed to GitHub.
3. The only shared remote rail for this task is reviewer branch
   `origin/claude/iam-svc-002 @ 98520ae0`. That branch is not owner delivery
   history; it is a reviewer-owned snapshot stack whose tip commit subject is
   `wip(IAM-SVC-002): anchor reviewed round-4 snapshot (owner f8820f35)`.
4. `git range-diff 717a87195d59..claude/iam-svc-002
   717a87195d59..gemini2/iam-svc-002` shows the reviewer rail is not a clean
   replay of the owner rail. It contains reviewer WIP anchors
   `a1e7a087 -> d0c89c42 -> 98520ae0` in place of the owner commits
   `fc34223b -> de0ae9af -> e868122f`.
5. The assigned helper branch `codex/iam-svc-002-unblock-history-repair` was
   created directly from `origin/dev` at `2026-08-05 14:22:23 +0000`, and its
   current tip is `6a144781`, which is unrelated commit
   `IAM-SVC-001: replay workload identity primary path for clean PR`.
6. Before this repair, `gh pr list --state all --json
   number,title,url,headRefName,baseRefName,state,isDraft --search
   'iam-svc-002'` returned `[]`, so there was no GitHub PR representing either
   the owner rail or the reviewer rail for `IAM-SVC-002`.
7. Parent machine truth still reports the task as blocked with next-step prose
   about missing push credentials, but it does not name the exact safe resume
   rail or explain that the helper branch itself is contaminated.

## Evidence

### Branch and remote state

- local owner rail:
  `gemini2/iam-svc-002 @ e868122fcd05ac2e276b44205c1ad7eb02be7489`
- local reviewer rail:
  `claude/iam-svc-002 @ 98520ae011ebc86c916880862554727a2241edc6`
- local helper rail:
  `codex/iam-svc-002-unblock-history-repair @ 6a1447816875db1fd83d1e18a197be286e232feb`
- `git ls-remote --heads origin 'refs/heads/gemini2/iam-svc-002' 'refs/heads/claude/iam-svc-002' 'refs/heads/codex/iam-svc-002-unblock-history-repair'`
  confirmed before repair:
  - `origin/claude/iam-svc-002 @ 98520ae011ebc86c916880862554727a2241edc6`
  - no `origin/gemini2/iam-svc-002`
  - no `origin/codex/iam-svc-002-unblock-history-repair`
- After repair execution:
  - `git push -u origin gemini2/iam-svc-002` published
    `origin/gemini2/iam-svc-002 @ e868122fcd05ac2e276b44205c1ad7eb02be7489`
  - `gh pr create --base dev --head ajoe734:gemini2/iam-svc-002 ...` opened
    PR `#1311`
    (`https://github.com/ajoe734/drts-fleet-platform/pull/1311`)
- `gh pr list ... --search 'iam-svc-002'` returned `[]` before repair

### Reflog / worktree evidence

- `git reflog show --date=iso gemini2/iam-svc-002` records:
  - branch created from `origin/dev` at `2026-08-05 12:16:48 +0000`
  - owner anchor `fc34223b`
  - owner fix commits `718a3d04`, `cbc9fdca`, `de0ae9af`
  - final reviewed owner tip amended to `e868122f`
- `git reflog show --date=iso claude/iam-svc-002` records:
  - branch created from `origin/dev` at `2026-08-05 12:19:26 +0000`
  - reviewer anchor commits `a1e7a087`, `d0c89c42`, `98520ae0`
- `git reflog show --date=iso codex/iam-svc-002-unblock-history-repair`
  records only:
  - `branch: Created from origin/dev` at `2026-08-05 14:22:23 +0000`
- `git worktree list --porcelain` shows the assigned helper worktree attached to
  `codex/iam-svc-002-unblock-history-repair`; there is no worktree attached to
  `gemini2/iam-svc-002` in this clone, so the owner rail is easy to lose by
  name alone.

### History delta

- `git rev-parse claude/iam-svc-002^{tree} gemini2/iam-svc-002^{tree}` returns
  the same tree id:
  `e74ef8cba2d04d06e8dfa9c621b14e24308f869a`
- This proves the reviewer rail and the owner rail currently have the same
  repository tree even though their commit histories differ.
- `git range-diff 717a87195d59..claude/iam-svc-002
  717a87195d59..gemini2/iam-svc-002` shows the exact mismatch:
  - reviewer WIP anchor `a1e7a087` corresponds to owner anchor `fc34223b`
  - reviewer WIP anchor `d0c89c42` corresponds to owner fix `de0ae9af`
  - reviewer WIP anchor `98520ae0` corresponds to owner fix `e868122f`

## Exact Contamination

The contamination is a three-rail identity split:

1. The only owner-complete implementation stack is local
   `gemini2/iam-svc-002 @ e868122f`, but it has no remote branch and no PR.
2. The only shared remote rail is reviewer branch
   `origin/claude/iam-svc-002 @ 98520ae0`, which has the same tree but the wrong
   ownership/history semantics for parent closeout.
3. The helper branch for this unblock task is itself contaminated because it was
   created from current `origin/dev` and now points at unrelated `IAM-SVC-001`
   clean-replay commit `6a144781`.

So the parent stayed blocked not because the code is unfinished, but because no
single pushed branch/PR answers all of these questions at once:

- Which SHA is the canonical owner delivery rail?
- Which branch should reviewers resume from?
- Which helper branch records the history diagnosis instead of pretending to be
  delivery history?

## Non-Destructive Repair Path

Do not force-push `claude/iam-svc-002`. Do not rewrite `gemini2/iam-svc-002`.
Do not continue the parent from the helper branch.

1. Treat local `gemini2/iam-svc-002 @ e868122f...` as the canonical owner rail.
   It already contains the accepted implementation tree and verification.
2. Push that exact branch tip to GitHub without rewriting history:

```bash
git push -u origin gemini2/iam-svc-002
```

3. Open the first real parent PR from the owner rail to `dev`:

```bash
gh pr create \
  --base dev \
  --head gemini2/iam-svc-002 \
  --title "IAM-SVC-002: inventory rotate and retire temporary internal-key exceptions" \
  --body "Publishes the already-reviewed IAM-SVC-002 implementation from gemini2/iam-svc-002 @ e868122f. Reviewer-only branch claude/iam-svc-002 remains audit evidence; no force-push or history rewrite is used."
```

4. Keep `origin/claude/iam-svc-002 @ 98520ae0...` as audit evidence of review
   snapshots only. It should not be used for merge or closeout.
5. Keep `codex/iam-svc-002-unblock-history-repair` as the diagnostic helper
   branch for this memo only. It should never be mistaken for the parent owner
   rail.
6. This repair executed steps 2 and 3 successfully:
   - pushed `origin/gemini2/iam-svc-002 @ e868122f...`
   - opened PR `#1311`
     (`https://github.com/ajoe734/drts-fleet-platform/pull/1311`)
7. Parent owner `Gemini2` should now refresh machine truth with a normal
   handoff that names the pushed SHA and PR URL.

## Concrete Parent Next Step

`IAM-SVC-002` should resume from `gemini2/iam-svc-002 @ e868122f...`, not from
`origin/claude/iam-svc-002` and not from
`codex/iam-svc-002-unblock-history-repair`.

Concrete next step:

1. Use pushed owner rail `origin/gemini2/iam-svc-002 @
   e868122fcd05ac2e276b44205c1ad7eb02be7489` and PR `#1311`
   (`https://github.com/ajoe734/drts-fleet-platform/pull/1311`) as the
   canonical delivery path.
2. Have owner `Gemini2` rerun
   `AI_NAME=Gemini2 scripts/ai-status.sh handoff IAM-SVC-002 Claude "..."`
   against that pushed SHA / PR.
3. Reviewer `Claude` continues review on the owner PR instead of on the reviewer
   snapshot rail.

## Why This Is Safe

- No shared history is rewritten.
- No force-push is required.
- The reviewer branch remains preserved as audit evidence.
- The helper branch remains preserved as diagnostic evidence.
- The repair path uses the already-reviewed owner commit and normal push/PR
  mechanics.

## Repair Execution Result

The non-destructive repair path is now live:

- Canonical owner branch:
  `origin/gemini2/iam-svc-002 @ e868122fcd05ac2e276b44205c1ad7eb02be7489`
- Canonical parent PR:
  `#1311` — `https://github.com/ajoe734/drts-fleet-platform/pull/1311`
- Reviewer snapshot branch preserved:
  `origin/claude/iam-svc-002 @ 98520ae011ebc86c916880862554727a2241edc6`
- Helper branch remains diagnostic only until its own artifact commit is pushed.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-SVC-002-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-SVC-002`
- Inspected local branch / worktree state:
  - `git branch --show-current`
  - `git status --short`
  - `git branch -vv | rg 'iam-svc-002|iam-svc-001'`
  - `git show-ref --heads | rg 'iam-svc-002($|-unblock-history-repair|-clean)'`
  - `git worktree list --porcelain`
  - `git log --graph --decorate --oneline --max-count=40 codex/iam-svc-002-unblock-history-repair dev origin/dev codex/iam-svc-001-unblock-history-repair origin/codex/iam-svc-001-unblock-history-repair gemini2/iam-svc-002 claude/iam-svc-002`
  - `git reflog show --date=iso gemini2/iam-svc-002`
  - `git reflog show --date=iso claude/iam-svc-002`
  - `git reflog show --date=iso codex/iam-svc-002-unblock-history-repair`
  - `git rev-parse claude/iam-svc-002^{tree} gemini2/iam-svc-002^{tree}`
  - `git range-diff 717a87195d59..claude/iam-svc-002 717a87195d59..gemini2/iam-svc-002`
  - `git show --stat --summary --decorate --no-patch 6a144781 e868122f 98520ae0 fc34223b`
- Inspected remote / PR state:
  - `git ls-remote --heads origin 'refs/heads/gemini2/iam-svc-002' 'refs/heads/claude/iam-svc-002' 'refs/heads/codex/iam-svc-002-unblock-history-repair'`
  - `gh pr list --state all --json number,title,url,headRefName,baseRefName,state,isDraft --search 'iam-svc-002'`
  - `git push -u origin gemini2/iam-svc-002`
  - `gh pr create --base dev --head ajoe734:gemini2/iam-svc-002 --title "IAM-SVC-002: inventory rotate and retire temporary internal-key exceptions" --body "..."`

No application code was changed in this helper task. This repair is limited to
history diagnosis, branch routing, and machine-truth next-step clarification.
