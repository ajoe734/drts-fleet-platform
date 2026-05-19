# Release Truth Audit

Date: 2026-05-19
Task: `WF-REL-001-AUDIT`
Method: repo-first audit after `git fetch origin`, using canonical machine truth
at `/home/edna/workspace/drts-fleet-platform/ai-status.json` plus direct
remote-ref and `origin/dev:<path>` checks. This report does not rely on the
worktree-local `ai-status.json` copy, and it does not infer `origin/dev` file
presence from post-audit `HEAD`.

## Scope

This audit cross-checks the release-truth surfaces that `WF-REL-001` is meant
to keep aligned:

- `origin/dev`
- `origin/publish/v*`
- `release/v*`
- `origin/main`
- `prod/v*`
- canonical `ai-status.json`
- canonical `current-work.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- prerequisite task artifacts for `DEV-SYNC-001` and `REL-SYNC-001`

The audit question is narrow:

> Does current repo truth support the machine-truth claim that release-truth
> synchronization inputs are landed and verifiable, or is there still drift
> that keeps `WF-REL-001` on `HOLD`?

## Executive Verdict

Current release truth is **not synchronized**.

The git-ref layer is only partially healthy:

- `origin/dev` is `210381402b30dd4a3d521a247c935f3270c4d100`
- latest publish snapshot is `origin/publish/v2026.05.19.0` at
  `949a49fb06eb674dd27b0f4bf6db746bd3c6f8aa`
- remote tag `release/v2026.05.19.0` dereferences to the same commit as that
  publish snapshot
- `origin/dev` is 7 commits ahead of the latest publish snapshot, which is
  expected drift between continuous merge cadence and nightly snapshot cadence
- `origin/main` is `a1f52719ba58e9612acde1aa8e7a4bc5a0d5abc6`
- `origin/main...origin/dev` is `1 42`, so `main` materially lags `dev`
- `origin/main` tree matches `release/v2026.05.18.0`, not the latest
  `release/v2026.05.19.0`
- no `prod/v*` tag currently exists on `origin`

The control-plane / artifact layer is where the release-truth failure appears:

- canonical `ai-status.json` marks `DEV-SYNC-001`, `REL-SYNC-001`, and
  `WF-REL-001-MATRIX` as `done`
- current `origin/dev` does not contain the claimed `DEV-SYNC-001` audit
  artifact
- current `origin/dev` does not contain either recorded `REL-SYNC-001` runbook
  path
- current `origin/dev` does not contain the claimed `WF-REL-001` matrix row

That mismatch means the repo cannot honestly claim release-truth
synchronization is complete. The prerequisite work existed on task-scoped
branches, but it is not verifiable from current trunk truth.

## Git Ref Truth

| Surface | Observed truth on 2026-05-19 | Audit read |
| --- | --- | --- |
| `origin/dev` | `210381402b30dd4a3d521a247c935f3270c4d100` | Current integration truth |
| latest publish snapshot | `origin/publish/v2026.05.19.0` -> `949a49fb06eb674dd27b0f4bf6db746bd3c6f8aa` | Latest nightly snapshot exists |
| matching latest release tag | `release/v2026.05.19.0^{}` -> `949a49fb06eb674dd27b0f4bf6db746bd3c6f8aa` | Latest publish/release alias is healthy |
| `origin/dev` vs latest publish | `origin/publish/v2026.05.19.0..origin/dev` = `7` commits | Expected post-snapshot dev drift |
| `origin/main` | `a1f52719ba58e9612acde1aa8e7a4bc5a0d5abc6` | Current promoted-tree truth |
| `origin/main...origin/dev` | `1 42` | `main` is 42 commits behind `dev` |
| `origin/main` tree | matches `release/v2026.05.18.0`; does not match `release/v2026.05.19.0` | Latest promote truth is still on the 2026-05-18 release tree |
| remote `prod/v*` tags | none found | Production-tag truth is absent |
| remote publish branches | `publish/v2026.05.17.0`, `publish/v2026.05.19.0`; no `publish/v2026.05.18.0` | One permanent publish branch is missing while its release tag still exists |

### Interpretation

- The newest publish snapshot and newest release tag are aligned at the ref
  level.
- `main` is intentionally not the same thing as `dev`, and it is currently
  aligned to the older `2026.05.18.0` promoted tree.
- Production-tag truth is missing entirely because no `prod/v*` tag exists on
  `origin`.
- `release/v2026.05.18.0` exists without a surviving `publish/v2026.05.18.0`
  branch, which conflicts with the branch-strategy invariant that publish
  branches are permanent and that each `release/v<date>` tag aliases the
  matching `publish/v<date>` branch SHA.

## Machine Truth vs `origin/dev`

Canonical `ai-status.json` currently records these prerequisite tasks as done:

| Task | Canonical machine status | Recorded artifact in machine truth | `origin/dev` result |
| --- | --- | --- | --- |
| `DEV-SYNC-001` | `done` | `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` | absent |
| `REL-SYNC-001` | `done` | `docs/03-runbooks/phase1-release-truth-sync-20260519.md` | absent |
| `WF-REL-001-MATRIX` | `done` | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` | file exists, but `WF-REL-001` row absent |

Direct object checks against `origin/dev` confirm:

- `origin/dev:docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  does not exist
- `origin/dev:docs/03-runbooks/phase1-release-truth-sync-20260519.md` does not
  exist
- `origin/dev:docs/03-runbooks/release-truth-sync-runbook-20260519.md` does
  not exist
- `origin/dev:docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
  still has no `WF-REL-001` row

This audit intentionally excludes the mutable lifecycle state of
`WF-REL-001-AUDIT` itself. The contradiction that matters is between completed
prerequisite task records and the actual release-truth surfaces visible from
`origin/dev`.

## Anchor Commit Evidence

The missing content is not hypothetical. It exists on earlier task-scoped
branch commits:

| Task | Evidence commit(s) | What those commits contain | Present at current `origin/dev`? |
| --- | --- | --- | --- |
| `DEV-SYNC-001` | `0861499` | adds `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` | no |
| `REL-SYNC-001` | `e686f13`, `ee6cfa7` | adds and extends `docs/03-runbooks/release-truth-sync-runbook-20260519.md` | no |
| `WF-REL-001-MATRIX` | `17941e4` | adds `WF-REL-001` `HOLD` row to the gate matrix | no |

The closeout commits recorded in canonical machine truth are metadata-only:

- `073c39e` for `DEV-SYNC-001`
- `3604aa8` for `REL-SYNC-001`
- `6da045d` for `WF-REL-001-MATRIX`

`git show --name-only --pretty=format:` on those closeout commits yields no
restored artifact paths. So machine truth records successful closeout metadata,
but current trunk truth still lacks the artifact contents and matrix row that
the prerequisite tasks claim to have landed.

## `REL-SYNC-001` Artifact-Path Drift

`REL-SYNC-001` has an additional naming inconsistency:

- canonical `ai-status.json` records artifact path
  `docs/03-runbooks/phase1-release-truth-sync-20260519.md`
- directive text points to
  `docs/03-runbooks/release-truth-sync-runbook-20260519.md`
- evidence commits `e686f13` and `ee6cfa7` touch only
  `docs/03-runbooks/release-truth-sync-runbook-20260519.md`
- current `origin/dev` contains neither path

So `REL-SYNC-001` is not only missing from current trunk; the canonical
artifact name also drifted between directive, anchor history, and machine truth.

## Gate Matrix Read

Current `origin/dev` still exposes other release-gate rows such as:

- `WF-RLS-001`
- `WF-PROD-001`
- `WF-FWD-001`
- `WF-COM-001`
- `WF-FIN-001`

But there is no checked-in `WF-REL-001` row at `origin/dev`.

That means the repo still lacks the workflow-family gate statement that should
tie release-truth synchronization to named evidence. Canonical machine truth is
ahead of the checked-in matrix file.

## Findings

### Finding 1: latest publish/release alias is healthy

The newest publish branch and newest release tag both resolve to
`949a49fb06eb674dd27b0f4bf6db746bd3c6f8aa`. That part of the nightly publish
rail is behaving as intended.

### Finding 2: promoted truth exists, but prod-tag truth is absent

`origin/main` currently matches the `release/v2026.05.18.0` tree, so there is
promoted content. But there is still no `prod/v*` tag on `origin`, so the repo
has no production-tag truth that operators could cite as the current prod
candidate.

### Finding 3: one release tag lacks its permanent publish-branch twin

Remote `release/v2026.05.18.0` exists, but `origin` no longer has
`publish/v2026.05.18.0`. That violates the branch-strategy invariant that the
publish branch is permanent and that the release tag aliases that branch's SHA.

### Finding 4: canonical machine truth overstates landed artifact truth

`DEV-SYNC-001`, `REL-SYNC-001`, and `WF-REL-001-MATRIX` are all closed in
canonical machine truth, but current `origin/dev` does not expose the artifact
files or matrix row that those task records point to.

### Finding 5: `WF-REL-001` cannot be verified from the checked-in matrix

Because current `origin/dev` has no `WF-REL-001` row, reviewers cannot read the
workflow-family gate statement that should govern release-truth claims. The
gate matrix still lacks the named row that the task board says is done.

## Verdict

`WF-REL-001` must remain `HOLD`.

Reason:

- git refs, machine truth, and checked-in artifacts do not yet tell the same
  story
- current `origin/dev` does not contain the prerequisite audit doc, sync
  runbook, or `WF-REL-001` gate row
- release truth for promoted content stops at `origin/main` /
  `release/v2026.05.18.0`; there is still no `prod/v*` truth
- one historical release tag no longer has its permanent publish-branch twin

## Required Repair Path

1. Land the approved `DEV-SYNC-001` artifact from `0861499` into current trunk,
   or reopen/retitle the task if the artifact is intentionally branch-local.
2. Choose one canonical `REL-SYNC-001` filename, then land the runbook content
   from `e686f13` / `ee6cfa7` under that single path and align machine truth to
   the same path.
3. Restore the `WF-REL-001` `HOLD` row from `17941e4` into
   `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` on current
   trunk.
4. Reconcile the `release/v2026.05.18.0` vs missing
   `publish/v2026.05.18.0` drift, or document an explicit exception to the
   branch-strategy invariant if the branch was intentionally removed.
5. Decide whether the missing `prod/v*` tags are an expected pre-prod state or
   an automation gap, then document that answer in the release-truth chain.
6. Re-run this audit only after current trunk carries the prerequisite docs and
   matrix row that canonical machine truth already claims to be done.

## Non-Claims Confirmed By This Audit

This audit does not claim that:

- `dev` and `main` should currently be identical
- the latest publish snapshot has already been promoted
- any `prod/v*` deployment candidate currently exists on origin
- branch-local evidence commits are sufficient by themselves to satisfy
  release-truth closure
- canonical machine-truth `done` state alone is enough to support a checked-in
  release-language claim

## Evidence Commands Used

```bash
git fetch origin
git rev-parse origin/dev origin/main origin/publish/v2026.05.19.0
git rev-list --left-right --count origin/main...origin/dev
git rev-list --count origin/publish/v2026.05.19.0..origin/dev
git ls-remote --heads origin 'refs/heads/publish/v*'
git ls-remote --tags origin 'refs/tags/release/v*'
git ls-remote --tags origin 'refs/tags/prod/v*'
git cat-file -e origin/dev:docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md
git cat-file -e origin/dev:docs/03-runbooks/phase1-release-truth-sync-20260519.md
git cat-file -e origin/dev:docs/03-runbooks/release-truth-sync-runbook-20260519.md
git show origin/dev:docs/03-runbooks/phase1-workflow-acceptance-release-gates.md | grep 'WF-REL-001'
git show --name-only --pretty=format: 0861499
git show --name-only --pretty=format: e686f13
git show --name-only --pretty=format: ee6cfa7
git show --name-only --pretty=format: 17941e4
git show --name-only --pretty=format: 073c39e
git show --name-only --pretty=format: 3604aa8
git show --name-only --pretty=format: 6da045d
```
