# Release Truth Audit

Date: 2026-05-19
Task: `WF-REL-001-AUDIT`
Method: repo-first audit of git refs, workflow definitions, machine truth, and
checked-in release-gate artifacts.

## Scope

This audit cross-checks the release-truth surfaces that `WF-REL-001` is meant
to keep aligned:

- `origin/dev`
- `publish/v*`
- `release/v*`
- `origin/main`
- `prod/v*`
- `ai-status.json`
- `current-work.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- directive-required `DEV-SYNC-001` and `REL-SYNC-001` artifacts

The audit question is narrow:

> Does current repo truth support the machine-truth claim that release-truth
> synchronization inputs are already done, or is there still drift that keeps
> `WF-REL-001` on `HOLD`?

## Executive Verdict

Current release truth is **not synchronized**.

The branch/tag model itself is understandable and partly healthy:

- `origin/dev` is at `210381402b30dd4a3d521a247c935f3270c4d100`
- latest publish snapshot is `publish/v2026.05.19.0` at
  `949a49fb06eb674dd27b0f4bf6db746bd3c6f8aa`
- matching immutable tag `release/v2026.05.19.0` dereferences to the same SHA
- `origin/main` is at `a1f52719ba58e9612acde1aa8e7a4bc5a0d5abc6`
- `origin/main...origin/dev` is `1 42`, so `main` materially lags `dev`
- no `prod/v*` tag currently exists on `origin`

The release-truth control-plane layer is where the drift appears:

- `ai-status.json` marks `DEV-SYNC-001` and `WF-REL-001-MATRIX` as `done`
- `ai-status.json` still keeps `REL-SYNC-001` `in_progress`
- the current `origin/dev` tree does **not** contain the claimed
  `DEV-SYNC-001` audit artifact
- the current `origin/dev` tree does **not** contain the claimed
  `REL-SYNC-001` sync runbook artifact
- the current `origin/dev` tree does **not** contain the claimed `WF-REL-001`
  matrix row

That mismatch means the repo cannot honestly claim release-truth synchronization
is complete. Two prerequisite tasks are closed in machine truth without their
artifacts appearing in `origin/dev`, while the remaining prerequisite
(`REL-SYNC-001`) is still open and also has no landed runbook artifact.

## Git Ref Truth

### Checked refs

| Surface | Observed truth on 2026-05-19 | Audit read |
| --- | --- | --- |
| `origin/dev` | `210381402b30dd4a3d521a247c935f3270c4d100` | Current integration truth |
| latest `publish/v*` | `publish/v2026.05.19.0` -> `949a49fb06eb674dd27b0f4bf6db746bd3c6f8aa` | Latest nightly snapshot exists |
| matching `release/v*` | `release/v2026.05.19.0^{}` -> `949a49fb06eb674dd27b0f4bf6db746bd3c6f8aa` | Publish/release alias is consistent |
| `origin/main` | `a1f52719ba58e9612acde1aa8e7a4bc5a0d5abc6` | Promotion truth exists but lags dev |
| `origin/main...origin/dev` | `1 42` | `main` is 42 commits behind `dev` |
| latest `prod/v*` | none found on `origin` | Production tag truth is absent |

### Interpretation

- The `dev -> publish/v* -> release/v*` portion of the model is functioning.
- The `main` branch is not current with `dev`, so dev truth and promoted truth
  are already intentionally different.
- Because no `prod/v*` tag exists, production-deploy truth is not available and
  must remain a non-claim.

This aligns with `docs/ops/branch-strategy.md`: promotion and prod-tag truth
must not be inferred from `dev` merges alone.

## Machine Truth vs Repo Tree

### What machine truth says

`ai-status.json` currently records:

| Task | Machine status | Recorded artifact |
| --- | --- | --- |
| `DEV-SYNC-001` | `done` | `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` |
| `REL-SYNC-001` | `in_progress` | `docs/03-runbooks/phase1-release-truth-sync-20260519.md` |
| `WF-REL-001-MATRIX` | `done` | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` |

This audit intentionally excludes the lifecycle state of `WF-REL-001-AUDIT`
itself because that row changes as soon as the document is handed off for
review. The critical contradiction is between prerequisite task state,
historical branch evidence, and the actual `origin/dev` tree content.

### What the repo tree says

At current `HEAD == origin/dev`:

- `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` is absent
- `docs/03-runbooks/phase1-release-truth-sync-20260519.md` is absent
- `docs/03-runbooks/release-truth-sync-runbook-20260519.md` is absent
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` still has no
  `WF-REL-001` row

So the checked-in release surfaces do not match the task-closeout claims.

## Anchor Commit Evidence

The missing content is not hypothetical. It exists on earlier task-scoped anchor
commits, which means the machine-truth closeouts were based on real draft
artifacts that did not survive into the current `origin/dev` tree.

| Task | Anchor / evidence commit | What that commit contains | Present at current `origin/dev`? |
| --- | --- | --- | --- |
| `DEV-SYNC-001` | `0861499` | adds `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` (181 lines) | no |
| `REL-SYNC-001` | `e686f13` and `ee6cfa7` | adds and extends `docs/03-runbooks/release-truth-sync-runbook-20260519.md` | no |
| `WF-REL-001-MATRIX` | `17941e4` | adds `WF-REL-001` `HOLD` row to the gate matrix | no |

The corresponding closeout commits still recorded in `ai-status.json` do not
restore those artifacts into the current tree:

- `073c39e` for `DEV-SYNC-001`
- `6da045d` for `WF-REL-001-MATRIX`

`3604aa8` remains relevant only as historical `REL-SYNC-001` branch evidence:
it is an earlier closeout attempt on `origin/codex2/rel-sync-001`, but current
`ai-status.json` has since reopened `REL-SYNC-001` to `in_progress` and no
longer records that commit as the active machine-truth closeout.

The release-truth problem is therefore:

1. machine truth closes `DEV-SYNC-001` and `WF-REL-001-MATRIX`, but their
   artifacts are still absent from `origin/dev`
2. machine truth keeps `REL-SYNC-001` open, and its target runbook is also
   absent from `origin/dev`
3. anchor commits prove drafts existed on task branches
4. downstream readers cannot verify the claimed release-truth surfaces from the
   tree they actually check out

## Gate Matrix Read

The current checked-in matrix still exposes:

- `WF-RLS-001` as `PASS (live staging evidence)`
- `WF-PROD-001` as `PASS (dry-run contract evidence)`
- `WF-FWD-001` as `EXTERNAL-GATED`
- `WF-COM-001` as `PASS (sandbox evidence)`
- `WF-FIN-001` as `PASS (static evidence)`

But there is no checked-in `WF-REL-001` row at current `origin/dev`.

That means the repo still lacks the family-level gate statement that should tie
release-truth synchronization to named evidence. The machine-truth `done` state
for `WF-REL-001-MATRIX` is therefore ahead of the checked-in release-gate file.

## Release-Truth Findings

### Finding 1: publish/release alias is healthy, but prod-tag truth is absent

The latest publish branch and release tag match at the same SHA, which is good.
However, there is no `prod/v*` tag on `origin`, so no production-tag release
truth exists to reconcile yet.

Impact:

- any wording that implies a current production deploy candidate is available by
  `prod/v*` would be false
- `WF-PROD-001` may still remain `PASS (dry-run contract evidence)`, but live
  prod-tag language must stay non-claiming

### Finding 2: machine truth and landed artifact truth still diverge

`DEV-SYNC-001` and `WF-REL-001-MATRIX` are marked `done`, while `REL-SYNC-001`
remains `in_progress`, but the current tree does not expose any of their
required release-truth artifacts.

Impact:

- reviewers reading only `origin/dev` cannot validate the claimed artifacts
- `WF-REL-001` cannot move beyond `HOLD`
- the release-truth story splits across machine truth, anchor commits, and the
  actual branch contents

### Finding 3: `current-work.md` is not the issue; artifact landing is

`current-work.md` behaves as a summary of machine truth. The real defect is
that machine-truth closeout metadata for prerequisite release-sync work refers
to artifacts absent from the checked-in tree.

Impact:

- this is not a `current-work.md` repair problem
- this is a branch-content / merge-integrity problem

## WF-REL-001 Verdict

`WF-REL-001` must remain `HOLD`.

Reason:

- release-truth synchronization requires machine truth, docs, and git surfaces
  to tell the same story
- current repo state still has unresolved drift between `ai-status.json` and
  the checked-in artifacts/matrix
- no prod-tag truth exists yet
- `origin/main` is intentionally behind `origin/dev`, so closeout language must
  continue distinguishing dev truth, publish truth, promoted truth, and prod
  truth

## Required Repair Path

The minimum repair path is:

1. restore the `DEV-SYNC-001` artifact into the checked-in tree from the
   approved audit content anchored at `0861499`
2. complete and land the `REL-SYNC-001` runbook into the checked-in tree,
   reconciling the draft content anchored at `e686f13` / `ee6cfa7` with the
   reopened machine-truth state
3. restore the `WF-REL-001` gate row into
   `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` from `17941e4`
4. re-check that the restored docs match current branch strategy and current
   ref truth
5. only then consider `WF-REL-001` eligible for review closeout

If the intent was for those artifacts to remain absent and only branch-local
history to carry the evidence, then the machine-truth closeouts for
`DEV-SYNC-001` and `WF-REL-001-MATRIX` are overstated and should be reopened
instead. Either way, the current split state is not a valid synchronized
release-truth outcome.

## Non-Claims Confirmed By This Audit

This audit does not claim that:

- `origin/dev` has already been promoted to `main`
- the latest publish snapshot has a production tag
- `WF-REL-001` is complete
- `DEV-SYNC-001`, `REL-SYNC-001`, and `WF-REL-001-MATRIX` are all closed in
  machine truth
- any of the three prerequisite release-truth artifacts are safely verifiable
  from the current checked-in tree
- machine-truth `done` alone is enough to support a release-language claim

## Evidence Commands Used

```bash
git rev-parse HEAD origin/dev origin/main
git rev-list --left-right --count origin/main...origin/dev
git ls-remote --heads origin 'refs/heads/publish/v*'
git ls-remote --tags origin 'refs/tags/release/v*^{}'
git ls-remote --tags origin 'refs/tags/prod/v*^{}'
git show --stat --patch 0861499 -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md
git show --stat --patch e686f13 -- docs/03-runbooks/release-truth-sync-runbook-20260519.md
git show --stat --patch ee6cfa7 -- docs/03-runbooks/release-truth-sync-runbook-20260519.md
git show --stat --patch 17941e4 -- docs/03-runbooks/phase1-workflow-acceptance-release-gates.md
```
