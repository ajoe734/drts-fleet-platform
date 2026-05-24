# PH1GC-DRV-MP-002 Unblock History Repair

## Scope

- Task: `PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-DRV-MP-002`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit date: `2026-05-24`

## Diagnosis

The parent is blocked by related branch/worktree history contamination. The
missing support-sidecar tree does exist on pushed task branches, but the
branches disagree on which replay path is canonical and the parent branch is
still rooted on stale ancestry.

1. The pushed parent branch
   `origin/codex2/ph1gc-drv-mp-002 @ 9be1a098361ec90b4e30f26854d24441c1c59a8b`
   is not based on current `origin/dev`. Its merge-base with `origin/dev` is
   `a7f88919fd15385ff32d5f70f05c74d5b36d7122`, and
   `origin/dev...origin/codex2/ph1gc-drv-mp-002` is `15 left / 15 right`.
2. The parent branch carries the intended task artifacts, including
   `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` and
   `support/sidecars/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE.md`,
   but they are bundled with stale ancestry and a merge commit, so replaying
   the whole branch would drag unrelated trunk drift into the parent.
3. The owner-lane helper branch
   `origin/codex2/ph1gc-drv-mp-002-unblock-history-repair @ 7d23cc19c8f6fea6b533d61c714590ab4eab3e4d`
   now contains four task commits:
   `b6df1cbc` (initial audit), `38ae6939` (support-tree replay),
   `0f3f3b55` (refresh canonical replay evidence), and `7d23cc19`
   (canonical replay handoff recorded in machine truth). The branch therefore
   no longer points at either earlier owner helper audit SHA cited during the
   failed review sequence; `38ae6939` and `0f3f3b55` are only ancestors on the
   same branch. Relative to current `origin/dev`, the branch is `21 left / 4
   right` with merge-base `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`. Its head
   commit `7d23cc19` also mixes support replay with control-plane files:
   `ai-status.json`, `current-work.md`, `docs-site/ai-status.json`, and
   `docs-site/current-work.md`. That makes the owner helper branch audit
   provenance only, not a clean replay rail.
4. A reviewer-lane helper branch also exists:
   `origin/codex/ph1gc-drv-mp-002-unblock-history-repair @ dfe8aaafad35e57f38ae78d35a19e70014d09469`.
   It is the cleanest currently pushed replay surface: one replay commit on top
   of merge-base `0150cbe4e56505854d375211e25d2ab82e948fc0`, with
   `origin/dev...origin/codex/ph1gc-drv-mp-002-unblock-history-repair` equal to
   `4 left / 1 right`.
5. A sibling pushed sidecar-only branch,
   `origin/codex/ph1gc-drv-mp-002-sidecar-acceptance @ 249aafe611730de86965e976c7d0b1c6796b9548`,
   is not based on current `origin/dev`. Its merge-base with `origin/dev` is
   `bf176edd9c100ad121face524588c3144bdcd15d`, and
   `origin/dev...origin/codex/ph1gc-drv-mp-002-sidecar-acceptance` is
   `22 left / 2 right`.
6. The diff from that stale-base `codex` sidecar branch to current `origin/dev`
   is therefore contaminated by trunk drift; it is not a clean single-purpose
   replay branch for the parent. The branch contains the intended sidecar
   acceptance file, but it is coupled to an older publish snapshot ancestry.
7. Additional related worktrees still point at non-canonical refs:
   `codex2/ph1gc-drv-mp-002-sidecar-acceptance` is a local-only worktree still
   parked at `bf176edd`, and several local helper worktrees still point at
   branch names that either have no remote branch or are stale-base audit refs.

## Exact Contamination

The contamination is the mismatch between:

1. The contaminated pushed parent branch
   (`origin/codex2/ph1gc-drv-mp-002`) that contains the required sidecar tree
   but sits on stale ancestry (`a7f88919`) and includes a merge commit.
2. Two different pushed history-repair branches that both look canonical:
   `origin/codex2/ph1gc-drv-mp-002-unblock-history-repair @ 7d23cc19`
   and `origin/codex/ph1gc-drv-mp-002-unblock-history-repair @ dfe8aaaf`.
   The support artifact and parent machine truth repeatedly lagged the mutable
   owner-lane helper head (`38ae6939` -> `0f3f3b55` -> `7d23cc19`), which made
   the canonical replay/audit story internally inconsistent with the actual
   remote ref even after each previous review follow-up. The final owner helper
   head is also mixed-content, because `7d23cc19` updates both support artifacts
   and machine-truth/dashboard files.
3. A pushed `codex` helper branch carrying related sidecar evidence but still
   rooted on stale base `bf176edd`
   (`origin/codex/ph1gc-drv-mp-002-sidecar-acceptance @ 249aafe6`).
4. Local helper worktrees whose branch names suggest they may be canonical, but
   which either have no remote branch or still sit on the stale base.

That contamination keeps the parent blocked on branch history because the
missing sidecar tree has more than one candidate replay branch and the stale
parent branch still mixes unblock notes, sidecar evidence, and unrelated trunk
history.

## Non-Destructive Repair Path

Do not force-push or rewrite any shared branch. Repair by replaying only the
task-owned sidecar artifacts from the cleanest pushed helper branch and
treating the stale-base branches as audit evidence only.

1. Treat
   `origin/codex/ph1gc-drv-mp-002-unblock-history-repair @ dfe8aaafad35e57f38ae78d35a19e70014d09469`
   as the canonical replay target for review. It is the smallest pushed replay
   branch still carrying the intended support tree, and its diff against
   `origin/dev` is limited to task-owned support artifacts:
   - `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR.md`
   - `support/sidecars/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE.md`
   - `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/*`
2. Keep
   `origin/codex2/ph1gc-drv-mp-002-unblock-history-repair @ 7d23cc19c8f6fea6b533d61c714590ab4eab3e4d`
   as the current owner-lane audit branch. It supersedes the earlier replay
   commits `38ae6939` and `0f3f3b55` on the same branch and is still useful
   provenance, but it is no longer the cleanest replay target now that
   `origin/dev` has advanced, the reviewer lane has a one-commit replay, and
   `7d23cc19` bundles machine-truth updates together with the support artifact.
3. Do not replay the parent from
   `origin/codex2/ph1gc-drv-mp-002`; keep that branch as immutable evidence of
   the stale-base mixed-ancestry parent branch, not as the canonical review
   path.
4. Do not replay the parent from
   `origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`; keep it as immutable
   evidence of the stale-base sidecar branch, not as the canonical review path.
5. Leave `codex2/ph1gc-drv-mp-002-sidecar-acceptance` and the stale-base audit
   branches in
   place for audit. They do not need renaming or history rewrite.
6. Parent owner `Codex2` should update the parent with this exact next step:

```bash
AI_NAME=Codex2 scripts/ai-status.sh progress PH1GC-DRV-MP-002 \
  "History repair: review/merge origin/codex/ph1gc-drv-mp-002-unblock-history-repair @ dfe8aaafad35e57f38ae78d35a19e70014d09469 as the cleanest replay of support/unblock/PH1GC-DRV-MP-002, support/sidecars/PH1GC-DRV-MP-002, and support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE. Treat origin/codex2/ph1gc-drv-mp-002 @ 9be1a098361ec90b4e30f26854d24441c1c59a8b, origin/codex2/ph1gc-drv-mp-002-unblock-history-repair @ 7d23cc19c8f6fea6b533d61c714590ab4eab3e4d (superseding ancestors 0f3f3b5588bb609430b40c9ca50406cc72920ca5 and 38ae69390790f98d627d55967a3739ef9f5b6403), and origin/codex/ph1gc-drv-mp-002-sidecar-acceptance @ 249aafe611730de86965e976c7d0b1c6796b9548 as audit evidence only; no force-push required."
```

7. If the control plane requires a review replay instead of a progress note,
   use the same canonical branch in the handoff:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff PH1GC-DRV-MP-002 Codex \
  "Replay review on canonical helper branch origin/codex/ph1gc-drv-mp-002-unblock-history-repair @ dfe8aaafad35e57f38ae78d35a19e70014d09469. It is the cleanest pushed replay of support/unblock/PH1GC-DRV-MP-002, support/sidecars/PH1GC-DRV-MP-002, and support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE; origin/codex2/ph1gc-drv-mp-002, origin/codex2/ph1gc-drv-mp-002-unblock-history-repair @ 7d23cc19c8f6fea6b533d61c714590ab4eab3e4d, and origin/codex/ph1gc-drv-mp-002-sidecar-acceptance stay as audit evidence only."
```

8. After that replay, the parent should remain blocked only on the external
   device-lab prerequisites already documented in
   `PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK.md`, not on branch ambiguity.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The pushed `codex` helper branch provides a single-commit canonical replay
  surface without touching the stale parent history.
- The pushed `codex2` helper branch remains available as immutable provenance
  for the earlier owner-lane replay.
- The contaminated parent branch is preserved unchanged for audit.
- The stale-base `codex` sidecar branch stays available for audit.
- The repair replays only task-owned support artifacts instead of trying to
  rewrite or rebase shared history.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Compared related branch/worktree state:
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads refs/remotes/origin | grep 'ph1gc-drv-mp-002' | sort`
  - `git worktree list --porcelain | grep -A2 -B1 'ph1gc-drv-mp-002'`
  - `git ls-remote --heads origin 'refs/heads/codex/ph1gc-drv-mp-002-sidecar-acceptance' 'refs/heads/codex/ph1gc-drv-mp-002-unblock-history-repair' 'refs/heads/codex2/ph1gc-drv-mp-002' 'refs/heads/codex2/ph1gc-drv-mp-002-unblock-history-repair'`
- Compared ancestry and diffs:
  - `git merge-base origin/dev origin/codex2/ph1gc-drv-mp-002`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-drv-mp-002`
  - `git rev-list --merges origin/dev..origin/codex2/ph1gc-drv-mp-002`
  - `git merge-base origin/dev origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`
  - `git merge-base origin/dev origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`
  - `git merge-base origin/dev origin/codex/ph1gc-drv-mp-002-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-drv-mp-002-unblock-history-repair`
  - `git diff --name-status origin/dev...origin/codex2/ph1gc-drv-mp-002`
  - `git diff --name-status origin/dev...origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`
  - `git diff --name-status origin/dev...origin/codex/ph1gc-drv-mp-002-unblock-history-repair`
  - `git diff --name-status origin/codex2/ph1gc-drv-mp-002-unblock-history-repair...origin/codex/ph1gc-drv-mp-002-unblock-history-repair`
  - `git show --stat --summary --name-only 9be1a098361ec90b4e30f26854d24441c1c59a8b`
  - `git show --stat --summary --name-only 0f3f3b5588bb609430b40c9ca50406cc72920ca5`
  - `git show --stat --summary --name-only 7d23cc19c8f6fea6b533d61c714590ab4eab3e4d`
  - `git show --stat --summary --name-only dfe8aaafad35e57f38ae78d35a19e70014d09469`
  - `git branch -r --contains 9be1a098`
  - `git branch -r --contains 0f3f3b55`
  - `git branch -r --contains 7d23cc19`
  - `git branch -r --contains dfe8aaaf`
  - `git branch -r --contains 249aafe6`
