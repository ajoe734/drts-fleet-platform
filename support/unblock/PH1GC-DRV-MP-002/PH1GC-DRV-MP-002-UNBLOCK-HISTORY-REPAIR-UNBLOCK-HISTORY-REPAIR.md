# PH1GC-DRV-MP-002 Unblock History Repair Unblock History Repair

## Scope

- Task: `PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-DRV-MP-002`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-24`

## Diagnosis

The earlier history-repair path identified the correct clean replay branch, but
the owner helper branch then drifted again. The current blockage is no longer
"which support tree should be replayed"; it is that the owner helper branch now
mixes support-artifact replay with control-plane state updates, so it cannot be
treated as the canonical replay rail for the parent.

1. `origin/codex/ph1gc-drv-mp-002-unblock-history-repair @ dfe8aaafad35e57f38ae78d35a19e70014d09469`
   is still the cleanest pushed replay branch. Relative to current
   `origin/dev`, it is `4 left / 1 right`, and its single task commit changes
   only:
   - `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR.md`
   - `support/sidecars/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE.md`
   - `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/*`
2. The owner helper branch
   `origin/codex2/ph1gc-drv-mp-002-unblock-history-repair @ 7d23cc19c8f6fea6b533d61c714590ab4eab3e4d`
   now sits at `21 left / 4 right` from current `origin/dev` with merge-base
   `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`.
3. Its newest commit `7d23cc19` is not a support-only replay. It modifies:
   - `ai-status.json`
   - `current-work.md`
   - `docs-site/ai-status.json`
   - `docs-site/current-work.md`
   - `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR.md`
4. That means the owner helper branch superseded the earlier support-only audit
   commit `0f3f3b5588bb609430b40c9ca50406cc72920ca5` with a mixed-content
   control-plane refresh. The replay story is therefore contaminated again:
   the same branch name now means both "support replay provenance" and
   "machine-truth/dashboard refresh."
5. The parent branch
   `origin/codex2/ph1gc-drv-mp-002 @ 9be1a098361ec90b4e30f26854d24441c1c59a8b`
   remains stale-base mixed ancestry (`15 left / 15 right` from current
   `origin/dev`, merge-base `a7f88919fd15385ff32d5f70f05c74d5b36d7122`) and is
   still not a safe replay surface.
6. The parent task itself is still `blocked` in canonical `ai-status.json` for
   external device-lab reasons. This helper task does not change that product
   reality; it only removes branch-history ambiguity so the parent can stay
   blocked for the correct reason.

## Exact Contamination

The contamination keeping the parent blocked on history is:

1. The owner helper branch that should have stayed a replay/audit branch was
   advanced by `7d23cc19` to include control-plane files in addition to support
   artifacts.
2. The earlier history-repair note therefore became self-invalidating: it
   named the reviewer helper as canonical, but the owner helper kept moving and
   mixed in non-replay content.
3. The pushed parent branch is still stale-base mixed ancestry, so the owner
   lane still lacks a clean canonical replay branch of its own.
4. Because the helper task itself is not a canonical task row in
   `ai-status.json`, the control-plane edits on `7d23cc19` cannot be treated as
   the authoritative path to unblock the parent.

In short: the clean replay already exists on the reviewer lane, but the owner
lane re-contaminated its helper branch by coupling replay provenance to machine
truth refresh commits.

## Non-Destructive Repair Path

Do not force-push, rebase, or rename any shared branch. Repair the unblock path
by freezing branch roles instead of rewriting history.

1. Freeze
   `origin/codex/ph1gc-drv-mp-002-unblock-history-repair @ dfe8aaafad35e57f38ae78d35a19e70014d09469`
   as the canonical support-artifact replay branch for review/merge purposes.
2. Freeze
   `origin/codex2/ph1gc-drv-mp-002-unblock-history-repair @ 7d23cc19c8f6fea6b533d61c714590ab4eab3e4d`
   as audit evidence only. It remains useful provenance for how the owner lane
   drifted, but it is not the replay target anymore.
3. Keep
   `origin/codex2/ph1gc-drv-mp-002 @ 9be1a098361ec90b4e30f26854d24441c1c59a8b`
   as immutable evidence of the stale-base parent branch. Do not replay from
   it and do not force-push over it.
4. Update the parent task's `next` message so it points at the frozen clean
   replay branch, then returns the parent to its real blocker: external device
   provisioning.
5. Leave all existing refs in place. No destructive repair is required.

## Parent Next Step

The parent should be updated with this concrete next step:

```bash
AI_NAME=Codex2 scripts/ai-status.sh progress PH1GC-DRV-MP-002 \
  "History repair complete: treat origin/codex/ph1gc-drv-mp-002-unblock-history-repair @ dfe8aaafad35e57f38ae78d35a19e70014d09469 as the canonical clean replay of support/unblock/PH1GC-DRV-MP-002, support/sidecars/PH1GC-DRV-MP-002, and support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE. Treat origin/codex2/ph1gc-drv-mp-002-unblock-history-repair @ 7d23cc19c8f6fea6b533d61c714590ab4eab3e4d and origin/codex2/ph1gc-drv-mp-002 @ 9be1a098361ec90b4e30f26854d24441c1c59a8b as audit evidence only. After replay/merge review, parent remains blocked only on external Android+iPhone device-lab, Expo/EAS, Apple/TestFlight, weak-network, and human capture prerequisites."
```

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The clean replay commit stays available on an existing pushed branch.
- The contaminated owner helper and stale parent branch stay available as audit
  evidence.
- The parent is unblocked from history ambiguity without pretending the
  external device-evidence blocker is solved.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Compared relevant refs and worktrees:
  - `git branch -vv | grep 'ph1gc-drv-mp-002'`
  - `git worktree list --porcelain | grep -A2 -B0 'ph1gc-drv-mp-002'`
  - `git ls-remote --heads origin 'refs/heads/codex/ph1gc-drv-mp-002-unblock-history-repair' 'refs/heads/codex2/ph1gc-drv-mp-002' 'refs/heads/codex2/ph1gc-drv-mp-002-unblock-history-repair'`
- Compared ancestry and changed paths:
  - `git merge-base origin/dev origin/codex/ph1gc-drv-mp-002-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-drv-mp-002-unblock-history-repair`
  - `git diff --name-status origin/dev...origin/codex/ph1gc-drv-mp-002-unblock-history-repair`
  - `git merge-base origin/dev origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`
  - `git diff --name-status origin/dev...origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`
  - `git merge-base origin/dev origin/codex2/ph1gc-drv-mp-002`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-drv-mp-002`
- Inspected exact commit contents:
  - `git show --stat --summary --name-only dfe8aaafad35e57f38ae78d35a19e70014d09469`
  - `git show --stat --summary --name-only 0f3f3b5588bb609430b40c9ca50406cc72920ca5`
  - `git show --stat --summary --name-only 7d23cc19c8f6fea6b533d61c714590ab4eab3e4d`
  - `git show --stat --summary --name-only 9be1a098361ec90b4e30f26854d24441c1c59a8b`
