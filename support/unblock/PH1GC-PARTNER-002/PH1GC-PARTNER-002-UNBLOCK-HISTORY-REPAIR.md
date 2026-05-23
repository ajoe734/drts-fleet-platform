# PH1GC-PARTNER-002 Unblock History Repair

## Scope

- Task: `PH1GC-PARTNER-002-UNBLOCK-HISTORY-REPAIR`
- Dispatch parent: `PH1GC-PARTNER-002`
- Canonical parent lineage: `PARTNER-ELIG-LIVE-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-05-23`
- Live parent branch named by canonical machine truth:
  `origin/codex2/ph1gc-partner-002 @ 2ec2868c`
- Existing history-repair packet branch:
  `origin/codex/ph1gc-partner-002-unblock-history-repair @ 65045479`
  (draft PR `#253`)

## Diagnosis

`PH1GC-PARTNER-002` is still blocked on real issuer sandbox evidence, not on a
missing product decision.

The current contamination is that the live parent row in canonical machine truth
now points to a new Codex2 restoration commit
`origin/codex2/ph1gc-partner-002 @ 2ec2868c`, but the only task-scoped
history-repair packet still lived on the older Codex branch family that
documented `origin/codex/ph1gc-partner-002 @ a8b2b3ad/c0452396`.

That leaves the repo with two PH1GC branch families carrying the same reserved
hold-state sidecar path:

- the live blocked parent branch owned by `Codex2`
- the older audit/history-repair branch family owned by `Codex`

Before this repair, only the older family had a task-scoped history packet and
PR. The newly restored live branch had no matching packet that mapped it back to
the canonical `PARTNER-ELIG-LIVE-001` lineage.

## Evidence

### 1. Canonical machine truth now names the Codex2 restoration branch

Current canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
records:

- `PH1GC-PARTNER-002 owner=Codex2 reviewer=Codex status=blocked`
- parent `next` says the missing sidecar path
  `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md` was
  restored on branch `codex2/ph1gc-partner-002` at commit `2ec2868c`
- the parent remains `blocked_external` because real issuer sandbox
  credentials, allowed test cards, and real sandbox execution logs are still
  absent

So the live parent row already moved away from the older Codex branch family.

### 2. The live parent branch carries only the restored sidecar file

Current live parent branch:

- `origin/codex2/ph1gc-partner-002 @ 2ec2868c253f23a8e7b722049f1deb23328bf9f0`
- `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-partner-002`
  = `11 2`
- `gh pr list --state all --head codex2/ph1gc-partner-002` returns no PR

Diff against `origin/dev` for the relevant paths shows only:

- `A support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`

So the live branch restored the sidecar path, but it did not add a task-scoped
history-repair packet under `support/unblock/PH1GC-PARTNER-002/`.

### 3. The older Codex PH1GC branch family still exists in parallel

Older PH1GC branch family still present on origin:

- `origin/codex/ph1gc-partner-002 @ c0452396`
- `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002`
  = `11 2`
- its diff still adds:
  - `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
  - `support/sidecars/PARTNER-ELIG-LIVE-001/PH1GC-PARTNER-002-CLOSEOUT-20260522.md`

That older family also contains the earlier restore commit:

- `a8b2b3ad` (`wip(PH1GC-PARTNER-002): restore hold-state sidecar`)

So the older family remains useful audit history, but it is no longer the live
branch named by canonical machine truth.

### 4. The existing history-repair PR still belongs to the older family

Current history-repair branch and PR:

- `origin/codex/ph1gc-partner-002-unblock-history-repair @ 65045479`
- draft PR `#253`
  <https://github.com/ajoe734/drts-fleet-platform/pull/253>
- `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002-unblock-history-repair`
  = `11 2`

That branch had already documented the older alias-replay problem. This repair
updates the same packet branch so the packet and PR now explicitly reference the
new live Codex2 restoration commit instead of leaving the repo split between an
old packet and a new live parent branch.

### 5. `origin/dev` still lacks the reserved sidecar path

Neither live PH1GC branch family has merged to `origin/dev`.

For the current live parent branch:

- `git diff --name-status origin/dev...origin/codex2/ph1gc-partner-002 -- support/sidecars/PARTNER-ELIG-LIVE-001`
  shows the sidecar file as added on the branch only

So trunk still does not contain the reserved hold-state sidecar path that the
parent row now references.

## Exact Contamination

The exact contamination is a four-part mismatch:

1. Canonical machine truth points the live blocked parent at
   `origin/codex2/ph1gc-partner-002 @ 2ec2868c`.
2. The only existing history-repair packet and PR still belonged to the older
   `origin/codex/ph1gc-partner-002` branch family.
3. The new live restoration branch had no task-scoped history packet or PR of
   its own, so review evidence and branch ownership no longer matched.
4. `origin/dev` still lacks the shared sidecar path, so future reviewers could
   easily cite the wrong branch family or assume the live restore had already
   been canonically repaired.

This is a branch/packet lineage mismatch, not a semantic blocker.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any published branch.

Repair by explicitly treating the Codex2 restoration commit as the live source
of truth for the PH1GC parent, while preserving the older Codex branches as
audit history.

1. Keep machine truth aligned to the current live parent row:
   - `PH1GC-PARTNER-002` stays `blocked`
   - the live branch remains `origin/codex2/ph1gc-partner-002 @ 2ec2868c`
   - the external gate remains `EXT-001-BLK-001` through `EXT-001-BLK-006`
2. Keep the older Codex family intact as audit history; do not rewrite or merge
   it just to make the packet lineage look tidy:
   - `origin/codex/ph1gc-partner-002`
   - `origin/codex/ph1gc-partner-002-unblock-history-repair`
3. Repair the mismatch by updating this task-scoped packet branch so the packet
   and its PR explicitly name `2ec2868c` as the live restoration commit and
   explain how it relates back to canonical `PARTNER-ELIG-LIVE-001`.
4. If current `dev` actually needs the reserved sidecar path before external
   issuer inputs arrive, replay only the live restoration commit onto a fresh
   dev-based branch instead of merging or rewriting either older PH1GC family:

```bash
git fetch origin
git switch -c codex2/ph1gc-partner-002-replay origin/dev
git cherry-pick 2ec2868c253f23a8e7b722049f1deb23328bf9f0
git push -u origin codex2/ph1gc-partner-002-replay
gh pr create --base dev --head codex2/ph1gc-partner-002-replay \
  --title "PH1GC-PARTNER-002: replay hold-state sidecar restore" \
  --body "Replays the live Codex2 hold-state sidecar restore (2ec2868c) onto current dev without rewriting older PH1GC audit branches."
```

5. Keep future redacted issuer evidence under the canonical shared path:
   - `support/sidecars/PARTNER-ELIG-LIVE-001/`

## Parent Next Step

The concrete next step for `PH1GC-PARTNER-002` is:

1. If trunk needs the reserved hold-state sidecar path, replay
   `2ec2868c253f23a8e7b722049f1deb23328bf9f0` from
   `origin/codex2/ph1gc-partner-002` onto a fresh `origin/dev` branch and open
   a normal PR.
2. Otherwise keep `PH1GC-PARTNER-002` blocked on
   `EXT-001-BLK-001` through `EXT-001-BLK-006`, attach redacted real issuer
   sandbox evidence under `support/sidecars/PARTNER-ELIG-LIVE-001/`, and rerun
   the live issuer proof from that shared sidecar path.

That resolves the history question without rewriting shared history and without
pretending the live parent branch is still the older Codex lineage.

## Why This Is Safe

- no shared branch is force-pushed
- no older PH1GC branch is rewritten
- the live parent branch and the audit/history branch stay distinguishable
- the packet now points at the same live branch/commit that canonical machine
  truth points at
- any future trunk replay can cherry-pick a single pushed commit
- the external issuer gate remains unchanged and explicit

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- checked canonical machine truth in
  `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- checked recent lifecycle events in
  `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- refreshed remote refs with `git fetch origin`
- inspected branch content and reachability:
  - `git show --stat --oneline origin/codex2/ph1gc-partner-002`
  - `git show --stat --oneline origin/codex/ph1gc-partner-002`
  - `git show --stat --oneline origin/codex/ph1gc-partner-002-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-partner-002`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-partner-002-unblock-history-repair`
  - `git diff --name-status origin/dev...origin/codex2/ph1gc-partner-002 -- support/sidecars/PARTNER-ELIG-LIVE-001`
  - `git diff --name-status origin/dev...origin/codex/ph1gc-partner-002 -- support/sidecars/PARTNER-ELIG-LIVE-001`
- inspected PR state:
  - `gh pr list --state all --head codex2/ph1gc-partner-002`
  - `gh pr list --state all --head codex/ph1gc-partner-002-unblock-history-repair`

No runtime or sandbox tests were run. This task is a docs/status/history repair
only.
