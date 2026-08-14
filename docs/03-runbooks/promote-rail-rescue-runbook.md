# Promote-rail rescue runbook — unblocking a stuck `publish → main` promote

**Status:** Adopted 2026-06-08
**Owner:** Release engineering
**Applies to:** the v4 branch strategy (`docs/ops/branch-strategy.md`)

This runbook covers the failure mode where `hourly-promote.yml` can no longer
land a `publish/v* → main` PR, so `main` (and therefore prod) freezes while
`dev` keeps advancing. It has happened twice (#265 `PROMOTE-RESCUE-254`,
2026-05-24; #574 `PROMOTE-RESCUE-20260608`, 2026-06-08), so the procedure is
recorded here instead of being re-derived each time.

---

## 1. Symptoms

- `hourly-promote.yml` runs **fail** every hour, ending in
  `Timed out waiting for required checks to register on PR #<n>`.
- The auto-promote PR (`auto-promote: publish/v<date> → main`) shows
  `mergeable: CONFLICTING` / `mergeStateStatus: DIRTY`.
- `gh pr checks <promote-PR>` shows the `ci-integ` jobs (build/lint/unit/…)
  passing, but the **three required gates** (`Commit trailers`,
  `Runtime mirror guard`, `Smoke acceptance`) are **absent** — never registered.
- `prod/v<date>` tags stop advancing; `git log -1 origin/main` is days old.
- A backlog of open `auto-promote` PRs accumulates (one per failed hourly run).

## 2. Root cause

GitHub cannot build the `refs/pull/<n>/merge` ref for a **CONFLICTING** PR, so
the `pull_request`-triggered `ci.yml` (which provides the 3 required gates)
never runs. The required checks therefore never register, and
`hourly-promote.yml`'s "wait for required checks" step times out — forever.

The PR conflicts because **`main` has diverged from `dev`**: commits landed
directly on `main` (hotfixes, or a previous promote-rescue) and were never
cherry-picked back to `dev`. Since every `publish/v*` snapshot is cut from
`dev`, each one then conflicts with `main`'s divergent content. See
[`branch-strategy.md` §5 reconciliation rule](../ops/branch-strategy.md).

## 3. Diagnosis (read-only)

```bash
# Confirm the stuck PR is CONFLICTING (not a transient check failure)
gh pr view <promote-PR> --json mergeable,mergeStateStatus,baseRefName,headRefName

# Confirm the 3 required gates are MISSING (not failing)
gh pr checks <promote-PR>

# See what on main is NOT in dev (the divergence)
git fetch origin main dev
git cherry -v origin/dev origin/main        # '+' = on main, not in dev

# Confirm dev is the source of truth: is anything main-only actually NEEDED?
#   'A' = files on main missing from dev (the only real loss candidates)
git diff --name-status origin/dev origin/main | awk '$1=="A"'
# Check each: is it already superseded in dev (different path / re-landed)?
```

If the `A` set is only gitignored runtime mirrors + files `dev` intentionally
removed/refactored, then **`dev` fully supersedes `main`** and the rescue is
safe. If `main` has genuinely unique, wanted content, STOP — port that content
to `dev` first (normal PR), then rescue.

## 4. Pre-flight checks (must pass before rescuing)

1. **`ci-integ` green on `dev` HEAD** — otherwise you cannot cut a fresh publish:
   ```bash
   gh run list --workflow=ci-integ.yml --branch dev -L 3 --json conclusion,headSha
   ```
2. **The 5 guarded `tools/development-orchestrator/dashboard/` mirror files are identical `main`↔target-publish** —
   otherwise the rescue commit trips the Runtime mirror guard:
   ```bash
   for f in tools/development-orchestrator/dashboard/ai-status.json tools/development-orchestrator/dashboard/ai-activity-log.jsonl \
            tools/development-orchestrator/dashboard/current-work.md tools/development-orchestrator/dashboard/orchestrator-state.json \
            tools/development-orchestrator/dashboard/approval-queue.json; do
     git diff --quiet origin/main origin/<target-publish> -- "$f" \
       && echo "SAME $f" || echo "DIFF $f  <-- must keep main's version in the rescue"
   done
   ```

## 5. Rescue procedure

The key trick: build the rescue branch **off `main`** with a **single commit**
whose tree equals the target publish snapshot. Because the branch is a
descendant of `main`, the PR's merge-base is `main` HEAD → **no conflict** →
the required gates register and run normally.

```bash
# (a) Cut a fresh publish from current dev HEAD (skip if rescuing an existing one)
gh workflow run nightly-publish.yml --ref dev
# wait, then note the new branch, e.g. publish/v2026.06.08.0
git ls-remote --heads origin 'refs/heads/publish/v*' | awk '{print $2}' | sort -V | tail -1

# (b) Isolated worktree off main, overwrite its tree with the publish snapshot
TARGET=publish/v2026.06.08.0
SAFE=${TARGET//\//-}
git fetch origin main "refs/heads/$TARGET:refs/remotes/origin/$SAFE"
git worktree add -b rescue/promote-reconcile-<date> /tmp/drts-rescue origin/main
cd /tmp/drts-rescue
git rm -rq .
git checkout "origin/$SAFE" -- .
git add -A
git diff --quiet "origin/$SAFE" && echo "TREE MATCHES TARGET" || echo "MISMATCH — stop"

# (c) Single commit with the required trailers (Task-ID / LLM-Agent / Reviewer)
git commit -F - <<'MSG'
PROMOTE-RESCUE-<date>: reconcile main to dev (<TARGET>)

<one paragraph: rail deadlocked, main diverged, dev supersedes main>

Task-ID: PROMOTE-RESCUE-<date>
LLM-Agent: <lane>
Reviewer: <human>
MSG

# (d) Dry-run the gates locally, then push + open the PR
python3 <repo>/tools/ci/git/check_commit_trailers.py --base origin/main --head HEAD
python3 <repo>/tools/ci/git/check_staged_generated_files.py --range origin/main HEAD
git push -u origin rescue/promote-reconcile-<date>
gh pr create --base main --title "PROMOTE-RESCUE-<date>: ..." --body "..."
```

Verify the PR is `MERGEABLE` and the 3 gates run, then squash-merge:

```bash
gh pr view <rescue-PR> --json mergeable,mergeStateStatus   # expect MERGEABLE / CLEAN
gh pr merge <rescue-PR> --squash
```

On merge, the `tag-on-merge` job tags `prod/v<date>` because `main`'s tree now
matches the publish snapshot.

## 6. Cleanup

```bash
# Close the originally-stuck auto-promote PR and the whole stale backlog
gh pr list --state open --label auto-publish --json number,title
for pr in <list>; do
  gh pr close "$pr" --comment "Superseded by #<rescue-PR> (PROMOTE-RESCUE-<date>): main reconciled to dev (<TARGET>), a superset of this publish's content."
done

# Remove the worktree
git worktree remove /tmp/drts-rescue --force
```

## 7. Post-conditions (verify)

- `git diff --quiet origin/main origin/dev` → `main` tree == `dev`.
- `prod/v<date>` tag exists and is the latest.
- `gh pr list --state open --label auto-publish` → empty.
- Next `hourly-promote` run is green (idempotency skip — `main` already contains
  the latest publish).

## 8. Prevention

The rescue treats the symptom. The cause is `main`/`dev` divergence; prevent it
per the reconciliation rule in [`branch-strategy.md` §5](../ops/branch-strategy.md):
**any** commit that lands directly on `main` (hotfix _or_ rescue) must be
cherry-picked back to `dev` in the same change. Periodically audit with
`git cherry -v origin/dev origin/main`; a non-empty `+` list is early warning
that the next promote will conflict.
