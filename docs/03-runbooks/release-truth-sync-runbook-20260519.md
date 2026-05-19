# Release Truth Sync Runbook

**Date:** 2026-05-19
**Owner:** release engineering / workflow owners
**Workflow family:** `WF-REL-001`

## Purpose

This runbook defines how Phase 1 release truth stays synchronized across:

- `dev`
- `publish/v<YYYY.MM.DD>.<N>`
- `release/v<YYYY.MM.DD>.<N>`
- `main`
- `prod/v<YYYY.MM.DD>.<N>`
- `ai-status.json`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- closeout / audit / evidence documents

`WF-REL-001` exists to prevent a split-brain state where branch history says one
thing, workflow gates say another, and machine truth claims a third.

## Non-Negotiable Rules

1. `ai-status.json` is the canonical machine truth for task state. `current-work.md`
   is a human summary only.
2. `dev` is the integration trunk. Task branches merge into `dev`, not directly
   into `publish/v*`.
3. `publish/v*` is an immutable snapshot branch cut from `dev` by
   `nightly-publish.yml`.
4. `release/v*` is an immutable tag pointing to the same SHA as the matching
   `publish/v*` branch.
5. `main` receives publish content only through the promote path described in
   `hourly-promote.yml` or the documented hotfix path.
6. `prod/v*` is an immutable tag on `main`. Its commit SHA may differ from the
   matching `publish/v*` SHA, but the tree content must match the promoted
   publish snapshot.
7. Any task marked `done` must point to reviewable evidence artifacts and, when
   relevant, the workflow gate matrix row updated for the same truth change.
8. Closeout prose must never claim pilot, production, or external proof that the
   current workflow gate read does not support.

## Truth Model

| Surface | What it means | Source of truth |
| --- | --- | --- |
| `dev` | Latest merged implementation truth | git branch `dev` |
| `publish/v*` | Immutable daily testable snapshot of `dev` | `.github/workflows/nightly-publish.yml` |
| `release/v*` | Immutable tag alias for the publish snapshot SHA | `.github/workflows/nightly-publish.yml` |
| `main` | Promoted content that passed publish soak + CI gates | `.github/workflows/hourly-promote.yml` |
| `prod/v*` | Deployable production tag for a promoted main tree | `.github/workflows/hourly-promote.yml`, `.github/workflows/deploy-prod.yml` |
| `ai-status.json` | Task lifecycle / owner / evidence machine truth | `scripts/ai-status.sh`, `scripts/ai_status.py` |
| release gate matrix | Workflow-family release claim truth | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` |
| runbooks / audits / sidecars | Narrative + evidence interpretation | checked-in docs under `docs/**`, `support/sidecars/**` |

## Invariants That Must Stay True

### Branch / tag invariants

- `publish/v<date>` and `release/v<date>` resolve to the same SHA.
- `prod/v<date>` resolves to a `main` commit whose tree matches the promoted
  `publish/v<date>` snapshot.
- `publish/v*` branches are never used as development branches and are never
  force-updated.

### Machine-truth invariants

- If a workflow family status changed, the corresponding matrix row must be
  updated in the same closeout cycle or explicitly called out as pending.
- If a task is `done`, its machine-truth record must include evidence-oriented
  next-step / commit / push metadata rather than prose-only completion.
- `current-work.md` may lag briefly, but it must never be treated as authority
  over `ai-status.json`.

### Release-language invariants

- `PASS (repo-local)`, `PASS (sandbox evidence)`, `PASS (static evidence)`,
  `PASS (live staging evidence)`, `HOLD`, and `EXTERNAL-GATED` are binding
  vocabulary.
- "merged to dev" is not the same as "promoted to main".
- "promoted to main" is not the same as "deployed to production".
- "prod tag exists" is not the same as "production deploy completed".

## Standard Sync Protocol

### 1. Task closeout into `dev`

When a worker finishes a task branch:

1. Update machine truth with `start`, `progress`, `handoff`, `approve`, `done`,
   `blocker`, or `reopen` through `scripts/ai-status.sh` or
   `python3 scripts/ai_status.py`.
2. Ensure the task's checked-in artifact exists and its claims match the current
   workflow gate matrix wording.
3. If the task changes release semantics, update
   `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` in the same
   supervisor wave or explicitly link the dependent follow-up task.
4. Merge the task branch into `dev` through the normal PR path.

Required result:

- `dev` is the newest implementation truth.
- `ai-status.json` tells reviewers what actually landed.
- docs do not over-claim beyond named evidence.

### 2. Nightly snapshot: `dev` -> `publish/v*` + `release/v*`

`nightly-publish.yml` is the only normal path that cuts publish truth.

Preconditions:

- latest `ci-integ` on `dev` is green
- `dev` has a real content delta vs the latest publish snapshot

Expected outputs:

- branch `publish/v<date>`
- tag `release/v<date>`
- both point to the same `dev` SHA
- `deploy-dev.yml` is dispatched against that publish snapshot

Interpretation:

- `dev` answers "what merged?"
- `publish/v*` answers "what exact snapshot are testers / dev env on?"
- `release/v*` answers "what immutable identifier names that snapshot in docs
  and evidence?"

### 3. Promotion: `publish/v*` -> `main` + `prod/v*`

`hourly-promote.yml` is the normal path for promotion truth.

Preconditions:

- publish snapshot soaked for at least the configured minimum
- no open `regression:v<date>` issue
- `main` does not already contain the snapshot content
- PR CI gates pass

Expected outputs:

- auto-promotion PR `publish/v<date> -> main`
- squash merge into `main`
- annotated `prod/v<date>` tag on the resulting `main` commit
- if a human-merged push reaches `main`, fallback tag-on-merge logic may create
  the `prod/v*` tag only when `main`'s tree matches an existing publish snapshot

Interpretation:

- `main` answers "what publish content is approved as the current promoted tree?"
- `prod/v*` answers "what exact promoted tree can operators deploy?"

### 4. Production dispatch: `prod/v*` -> live prod

`deploy-prod.yml` is the only production rail covered by this runbook.

Preconditions:

- requested `prod/v<date>` tag exists on origin
- required GitHub `PROD_*` variables and secrets exist
- required GCP wiring exists
- required `production` environment reviewers are available

Expected outputs:

- workflow run URL
- deployed `prod/v*` tag + resolved commit SHA
- migration-run or migration-skipped decision
- protected health-check result
- rollback owner / approver when relevant

This step updates live deployment truth, but it does not by itself change the
workflow-family gate wording unless new evidence justifies a gate uplift.

## Required Sync Checks

Run these checks before claiming `WF-REL-001` truth is aligned.

### A. Branch / tag consistency

```bash
git ls-remote --heads origin 'refs/heads/publish/v*' | awk '{print $2}' | sort -V | tail -1
git ls-remote --tags origin 'refs/tags/release/v*' | awk '{print $2}' | sort -V | tail -1
git ls-remote --tags origin 'refs/tags/prod/v*' | awk '{print $2}' | sort -V | tail -1
```

Confirm:

- the latest `publish/v*` has a matching `release/v*`
- the latest `prod/v*` corresponds to a promoted publish snapshot, not an
  unrelated tree

Recommended deep check:

```bash
latest_publish=$(git ls-remote --heads origin 'refs/heads/publish/v*' | awk '{print $2}' | sort -V | tail -1 | sed 's|refs/heads/||')
latest_release=$(git ls-remote --tags origin 'refs/tags/release/v*' | awk '{print $2}' | grep -v '\^{}' | sort -V | tail -1 | sed 's|refs/tags/||')
latest_prod=$(git ls-remote --tags origin 'refs/tags/prod/v*' | awk '{print $2}' | grep -v '\^{}' | sort -V | tail -1 | sed 's|refs/tags/||')

git fetch origin "$latest_publish" "$latest_release" "$latest_prod" main --quiet
git rev-parse "origin/$latest_publish"
git rev-parse "$latest_release^{}"
git rev-parse "$latest_prod^{}"
git rev-parse "origin/main^{tree}"
git rev-parse "$latest_prod^{tree}"
```

Read the result this way:

- `origin/$latest_publish` SHA must equal `release/v*^{}` SHA
- `prod/v*^{tree}` must equal `origin/main^{tree}` for the promoted snapshot
- matching tree does not imply matching commit SHA because `main` is a squash
  merge target

### B. Machine truth vs docs

Confirm all of the following agree:

- `ai-status.json`
- the relevant task artifact under `docs/**`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- any referenced sidecar / evidence pack

Common drift pattern:

- task marked `done` in machine truth
- artifact exists
- gate matrix still says old status or omits the family entirely

That state is not release-truth synced.

### C. Closeout wording vs gate vocabulary

Reject closeout language if it collapses distinct truths such as:

- "all release gates are green" when some are `HOLD` or `EXTERNAL-GATED`
- "prod-ready" when only a `prod/v*` tag exists
- "published" when the change only merged to `dev`

### D. Machine-truth lifecycle vs git lifecycle

Confirm the narrative stays in this order:

1. task artifact updated
2. machine truth updated through `scripts/ai-status.sh` or `python3 scripts/ai_status.py`
3. branch merged into `dev`
4. nightly publish cuts `publish/v*` + `release/v*`
5. hourly promote merges into `main` and tags `prod/v*`
6. optional `deploy-prod.yml` run creates live deployment evidence

If prose skips ahead of this order, release truth is overstated.

## Drift Scenarios And Repairs

### Scenario 1: `dev` moved, but no new publish snapshot exists

Meaning:

- implementation truth advanced
- tester / dev environment truth did not

Action:

- wait for `nightly-publish.yml`, or manually dispatch it if immediate snapshot
  truth is required
- do not describe dev-env verification as covering the new `dev` commits until a
  new publish snapshot exists

### Scenario 2: `publish/v*` exists, but matrix / docs still describe older truth

Meaning:

- deployment snapshot advanced
- narrative release truth is stale

Action:

- update the affected runbook / audit / closeout docs
- update the workflow gate matrix if workflow-family status changed
- record the sync repair in machine truth via `progress` or the owning task

### Scenario 3: `main` contains promoted content, but no `prod/v*` tag exists

Meaning:

- promotion truth is incomplete

Action:

- inspect `hourly-promote.yml` tag-on-merge behavior
- verify whether `main` tree matches a publish snapshot
- do not tell operators to deploy by commit SHA; repair the prod tag path first

Suggested repair commands:

```bash
git fetch origin main --quiet
main_tree=$(git rev-parse 'origin/main^{tree}')
for ref in $(git ls-remote --heads origin 'refs/heads/publish/v*' | awk '{print $2}' | sort -V); do
  git fetch origin "$ref" --quiet
  pub_sha=$(git ls-remote --heads origin "$ref" | awk '{print $1}')
  pub_tree=$(git rev-parse "$pub_sha^{tree}")
  if [ "$pub_tree" = "$main_tree" ]; then
    echo "main matches ${ref#refs/heads/}"
  fi
done
```

If no publish tree matches, treat the push as a hotfix or out-of-band change and
document the exception before any production claim.

### Scenario 4: `prod/v*` exists, but no deploy evidence exists

Meaning:

- deployable candidate exists
- production execution truth does not

Action:

- keep workflow-family claims at the documented gate read
- capture deploy / rollback evidence separately before any uplift

Minimum evidence to attach after a real production run:

- workflow run URL
- `prod/v*` tag name
- resolved deployed SHA
- migration decision
- protected health-check result
- rollback owner and approver, if rollback or rollback readiness was part of the run

### Scenario 5: Hotfix merged directly to `main`

Meaning:

- `main` truth may have diverged from latest publish snapshot by design

Required repair:

1. cherry-pick the hotfix back into `dev`
2. cut a new manual publish snapshot
3. re-run promotion so future `prod/v*` tags realign with the publish model
4. update machine truth and evidence so the exception is explicit

### Scenario 6: Task or docs claim completion, but machine truth still shows
`backlog`, wrong owner, or missing handoff metadata

Meaning:

- the repo has prose or artifacts that imply completion
- the control plane cannot yet defend that claim

Action:

1. correct `ai-status.json` through the supported status scripts
2. make sure owner / reviewer / status reflect the actual lane responsible for
   the artifact
3. only then describe the runbook or gate change as reviewable or done

This repair is mandatory even when the document itself is already written. Human
readability does not override machine truth.

## Evidence Minimum For `WF-REL-001`

Any release-truth sync closeout should name at least:

- current `dev` truth anchor
- current `publish/v*` and matching `release/v*`
- current promoted `main` / `prod/v*` relationship
- the machine-truth task / docs / gate-matrix surfaces checked
- any known intentional drift or remaining non-claim

Recommended closeout shape:

```text
WF-REL-001 closeout anchor
- dev: <branch or merge commit>
- publish: <publish/v...> @ <sha>
- release: <release/v...> @ <same sha>
- main: <sha or PR number>
- prod: <prod/v...> @ <main sha>
- machine truth checked: ai-status.json + task state command
- gate matrix checked: phase1-workflow-acceptance-release-gates.md
- non-claim: <what is still not true>
```

## Non-Claims

This runbook does not claim that:

- every `dev` merge is automatically deployed everywhere
- a `prod/v*` tag means production already runs that version
- workflow-family gates become `PASS` solely because a branch or tag exists
- `current-work.md` is reliable enough to override `ai-status.json`

## Reference Anchors

- `docs/ops/branch-strategy.md`
- `.github/workflows/nightly-publish.yml`
- `.github/workflows/hourly-promote.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-prod.yml`
- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
