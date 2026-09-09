# SR-PUSH-001 history repair evidence

Inspected 2026-09-09 UTC. Owner Codex2; reviewer Gemini.
Disposition: verified non-destructive recovery path; parent product gates remain blocked.

## Exact history and worktree findings

- Fetched `origin/dev`: `8c6e1fa9732ec8322de275084817683e6d67407c`.
- Parent local and remote `codex2/sr-push-001` both point to
  `6f683d4ef3de7c98bc3825220d459ea334bee406`.
  [Draft PR #1823](https://github.com/ajoe734/drts-fleet-platform/pull/1823)
  is OPEN against dev at that exact head, with no merge commit.
- `git worktree list --porcelain` shows no parent worktree checkout. This helper
  stays in its supervisor-assigned isolated worktree on
  `codex2/sr-push-001-unblock-history-repair`, initially clean at the fetched dev.
  No canonical-root switch or other worker edits were performed.
- Original anchors `8b015a460` -> `268087ce7` descend from UV-EXEC-006 merge
  `e97653b7ffb962a6c4d688e8706711d860fa3604`.
  Rebased copies `2d34d862c` -> `26f862e9d` descend from planning-helper merge
  `a24045986ac29231d34657df3a343b02d9fbb770` (PR #1828).
- `git range-diff 8b015a460^..268087ce7 2d34d862c^..26f862e9d`
  reports `=` for both commits: identical patches with different ancestry.
  Merge `2d10084d9dbef57468ca4acfd7316c139e327749` has parents `26f862e9d`
  and `268087ce7`. `git diff 26f862e9d 2d10084d9 --stat` is empty.
  It already repaired published ancestry without force-pushing. Final anchor
  `6f683d4ef` adds post-routing observations.
- `git rev-list --left-right --count origin/dev...origin/codex2/sr-push-001`
  reports `4 6`. All six parent-only commits are SR-PUSH-001 anchors/merge.
  The net PR diff is exactly two added files, 224 lines: the parent UAT evidence
  and `tests/unit/system-remediation/sr-push-001/outbox-boundary.test.ts`.
  No unrelated product/control-plane files occur in that diff.

Thus the observed contamination is duplicate pre/post-rebase anchor history,
already preserved by a normal merge, not lost code or uncommitted mixed work.
There is no present evidence that history is the active product blocker. The
parent's canonical next field identifies scope/provider/claim-receipt decisions;
UV-EXEC-006 is already done. Do not repeatedly dispatch a history repair as a
substitute for those decisions.

## Verified non-destructive next branch path

Preserve old branch and PR #1823 as provenance. After supervisor routes a fresh
parent execution branch (suggested `codex2/sr-push-001-history-recovered`) and
isolated worktree, start it from freshly fetched origin/dev. Do not repoint the
existing published parent branch, replay both duplicate commit ranges, or force
push. The following describes owner work after routing, not actions this helper
has performed:

1. Fetch origin; record the new dev SHA. Reuse any existing successor worktree
   and inspect its state before creating anything. For a new successor, create
   its isolated worktree from origin/dev. Keep the parent ref at the SHA above.
2. Generate the net patch from the pinned parent head, limiting it to the two
   existing parent-owned paths, and check it in the clean successor:

   ```bash
   git diff --binary origin/dev...6f683d4ef3de7c98bc3825220d459ea334bee406 -- \
     docs/04-uat/system-remediation-20260906/SR-PUSH-001.md \
     tests/unit/system-remediation/sr-push-001/outbox-boundary.test.ts \
     > /tmp/sr-push-001-recovery.patch
   git apply --check /tmp/sr-push-001-recovery.patch
   git apply /tmp/sr-push-001-recovery.patch
   ```

   If dev now contains either path or the check fails, compare the current
   files and recover only missing task content; never overwrite newer work.
3. Rerun the parent's targeted Vitest and API typecheck, recording the actual
   fresh base and results. Historical results are four passes/two expected
   failures; expected failures do not satisfy product acceptance. Commit only
   the recovered parent paths with SR-PUSH-001 trailers, ordinary-push the new
   branch, and open a draft PR against dev linking #1823. Keep #1823 intact
   until supervisor/reviewer confirms successor provenance and routing.
4. Supervisor records the parent execution branch through the canonical status
   CLI and grants service/repository scopes, writer dependencies, approved
   provider/device protocol, and SR-CONTRACT claim/receipt allocation described
   in the existing planning packet. Parent implementation and candidate handoff
   proceed only after these gates. This helper does not authorize shared writes.

This path avoids rewriting shared history and does not carry duplicate anchors
into the successor. The helper only documents/checks the path, as allowed by
its acceptance; it does not change the parent's branch or PR.

## Verification and delivery boundary

At the inspected dev SHA, these commands exited 0:

- `git fetch origin`; `git rebase origin/dev` (helper already up to date).
- `gh pr view 1823 --json url,state,headRefName,headRefOid,baseRefName,mergeCommit,body`.
- The range-diff and empty merge-tree diff commands above.
- Net patch generation above and `git apply --check /tmp/sr-push-001-recovery.patch`
  against the clean helper checkout. Patch SHA-256:
  `d70ef561c030ff5575714606943eff41ae53cdf8a267c1fe6fe83f26cac44723`.
- `git diff origin/dev...origin/codex2/sr-push-001 --check`.

The patch was checked, not applied; the temporary file is reproducible from
the pinned Git objects and is not delivery evidence. No product tests, provider
send, server, database or real-device acceptance were run by this documentation
helper. Parent evidence remains historical. Final helper commit, ordinary push,
PR and exact-SHA handoff are recorded in the PR and canonical task lifecycle.

Parent next step: supervisor routes the fresh successor and resolves the scope/
protocol/contract gates in
`support/unblock/SR-PUSH-001/SR-PUSH-001-UNBLOCK-PLANNING-DECISION.md`;
Codex2 then recovers the verified net patch and reruns current-base regressions.
Keep the parent blocked for those concrete gates, not for an unresolved Git
history repair. Helper review does not imply parent acceptance.
