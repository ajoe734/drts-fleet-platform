# I18N-OPS-04 Unblock History Repair

## Scope

- Task: `I18N-OPS-04-UNBLOCK-HISTORY-REPAIR`
- Parent: `I18N-OPS-04`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-04`

## Diagnosis

The parent is blocked by branch ancestry contamination, not by missing task
content.

1. `origin/dev` is currently at `94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`.
2. The owner parent branch already exists locally and on origin as
   `codex2/i18n-ops-04 @ a1dfe85f06feb92695573ce0b181c934cd489142`.
3. That owner branch does not fork from `origin/dev`. Its merge-base with both
   `origin/dev` and `codex2/i18n-wp0` is the same `94c3aa2d`, and
   `git rev-list --left-right --count codex2/i18n-wp0...codex2/i18n-ops-04`
   returns `1 2`, proving the branch is stacked on top of the private
   dependency commit `4e925b0d` from `codex2/i18n-wp0`.
4. The dependency commit `4e925b0d` carries unrelated WP0 baseline changes in
   `.github/workflows/ci.yml`, `.husky/pre-commit`, `scripts/i18n-guard.mjs`,
   `scripts/i18n-guard-baseline.json`, and shared translation helpers. Those
   files are not part of the `I18N-OPS-04` acceptance scope.
5. The reviewer branch `codex/i18n-ops-04 @ 6f8e506cfb63b022b4f52f2d45aa75ad93ad2c77`
   lands the same driver page tree cleanly on top of `origin/dev`, with no diff
   versus the owner branch tree, which proves the parent code itself is valid
   while the owner branch ancestry is not.

## Evidence

### Branch and worktree state

- `origin/dev @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`
- local + remote owner branch
  `codex2/i18n-ops-04 @ a1dfe85f06feb92695573ce0b181c934cd489142`
- local + remote reviewer branch
  `codex/i18n-ops-04 @ 6f8e506cfb63b022b4f52f2d45aa75ad93ad2c77`
- helper audit branch
  `codex2/i18n-ops-04-unblock-history-repair @ <pending push from this task>`
- `git rev-list --left-right --count origin/dev...codex2/i18n-ops-04`
  returns `0 2`, confirming the owner branch is only two commits ahead of dev.
- `git rev-list --left-right --count codex2/i18n-wp0...codex2/i18n-ops-04`
  returns `1 2`, confirming the owner branch is stacked on top of WP0's private
  commit instead of branching directly from dev.
- `git diff --stat origin/dev..codex2/i18n-ops-04` shows only the 5 driver i18n
  files, while `git diff --stat 4e925b0d..codex2/i18n-ops-04` still reflects
  the WP0 baseline footprint beneath them. That proves the tree is correct but
  the ancestry is contaminated.
- `git diff codex2/i18n-ops-04..codex/i18n-ops-04` is empty, confirming the
  reviewer branch already materializes the same final file tree without the WP0
  dependency commit.

### Parent provenance

- `git show --stat --summary --name-only 4e925b0d` confirms the inherited WP0
  dependency commit touched CI, husky, guard scripts, and shared translation
  infrastructure outside the parent task scope.
- `git show --stat --summary --name-only a1dfe85f` confirms the owner parent
  branch only adds the driver i18n task files.
- `git show --stat --summary --name-only 6f8e506c` confirms the reviewer branch
  carries the formal closeout commit on top of a clean `origin/dev` ancestry.

## Exact Contamination

The contamination is a three-part mismatch:

1. `codex2/i18n-ops-04` was branched from `codex2/i18n-wp0` after WP0's private
   commit `4e925b0d`, not from `origin/dev`.
2. The parent task therefore appears to depend on unrelated guard / CI /
   translation-foundation changes that are outside `I18N-OPS-04` acceptance.
3. Because `origin/codex2/i18n-ops-04` is already published, the owner cannot
   safely repair the ancestry in place without rewriting shared history.

This is branch/worktree/commit contamination. The task implementation is not the
blocker; the published owner rail is.

## Non-Destructive Repair Path

Do not force-push or rewrite `origin/codex2/i18n-ops-04`.

1. Leave `origin/codex2/i18n-ops-04 @ a1dfe85f...` in place as contamination
   evidence only.
2. Reuse the clean reviewer rail as proof of the correct final tree:
   `origin/codex/i18n-ops-04 @ 6f8e506c...`.
3. For the owner closeout rail, create a fresh owner branch from `origin/dev`,
   then cherry-pick only the task commits that produce the clean driver tree:
   `c6a726eb` and `4570b055`.
4. On that fresh owner branch, create a formal owner closeout commit with
   `LLM-Agent: Codex2`, `Task-ID: I18N-OPS-04`, and `Reviewer: Codex`, then
   push the new branch normally.
5. Update the parent task to resume from that fresh clean owner rail rather than
   from the contaminated published branch.

Concrete command sequence for the parent owner:

```bash
git fetch origin
git switch -c codex2/i18n-ops-04-repair origin/dev
git cherry-pick c6a726eb
git cherry-pick 4570b055
git commit --allow-empty -m "I18N-OPS-04: finalize drivers i18n centralization closeout" \
  -m "LLM-Agent: Codex2" \
  -m "Task-ID: I18N-OPS-04" \
  -m "Reviewer: Codex"
git push -u origin codex2/i18n-ops-04-repair
```

## Why This Is Safe

- No remote ref is rewritten.
- No force-push is required.
- The contaminated owner branch remains available as audit evidence.
- The clean reviewer branch already proves the final tree is valid on top of
  `origin/dev`.
- The owner can resume on a fresh branch with the same file tree and correct
  ancestry.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md` and `docs/ops/branch-strategy.md`
- Compared related branch and worktree state:
  - `git branch -vv | grep 'i18n-ops-04\\|i18n-wp0'`
  - `git worktree list --porcelain`
  - `git ls-remote --heads origin 'refs/heads/codex2/i18n-ops-04' 'refs/heads/codex/i18n-ops-04' 'refs/heads/codex2/i18n-ops-04-unblock-history-repair'`
  - `git merge-base codex2/i18n-ops-04 origin/dev`
  - `git merge-base codex2/i18n-ops-04 codex2/i18n-wp0`
  - `git rev-list --left-right --count origin/dev...codex2/i18n-ops-04`
  - `git rev-list --left-right --count codex2/i18n-wp0...codex2/i18n-ops-04`
  - `git diff --stat origin/dev..codex2/i18n-ops-04`
  - `git diff --stat 4e925b0d..codex2/i18n-ops-04`
  - `git diff codex2/i18n-ops-04..codex/i18n-ops-04`
- Confirmed parent provenance:
  - `git show --stat --summary --name-only 4e925b0d`
  - `git show --stat --summary --name-only a1dfe85f`
  - `git show --stat --summary --name-only 6f8e506c`
