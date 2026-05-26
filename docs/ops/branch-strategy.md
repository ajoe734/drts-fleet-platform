# Branch Strategy — nightly publish + hourly promote (v4)

**Status:** Adopted 2026-05-17  
**Owner:** Release engineering  
**Supersedes:** v3 (per-merge prod-\* tags). v3 tagged every dev merge → tag pollution + dev VM thrashing. v4 cuts an **immutable nightly publish snapshot** that dev VM deploys to, then **hourly auto-promotes** to master with a `prod/v<date>` tag.

---

## 1. Why v4

In v3, every dev merge auto-published to main and produced a `prod-*` tag. Two problems:

- **Tag pollution.** 30 AI merges/hour × 24h = 720 tags/day. Git tag list becomes a SHA wall.
- **dev VM instability.** dev VM = dev branch HEAD meant the environment shifted under testers mid-test.

v4 decouples three rhythms:

- AI cadence (continuous, per-PR merge to `dev`)
- dev VM cadence (1 / day, at nightly publish cut)
- prod-candidate cadence (≤ 1 / hour, hourly promote of latest stable publish)

You get a stable dev VM, a small list of meaningful tags, and a clear "which version is in which environment".

---

## 2. The model

```
  AI agents + humans → feat/codex/claude/gemini → PR to dev (3 CI gates, 0 reviewers)
                                                       │ auto-merge
                                                       ▼
                                                      dev
                                                 (continuous,
                                                  ci-integ on push)
                                                       │
                                                       │ 03:00 UTC nightly-publish.yml
                                                       │  ─ require ci-integ green on dev HEAD
                                                       │  ─ require content delta vs last publish
                                                       │  ─ cut snapshot
                                                       ▼
                                            publish/v2026.05.18.0   (immutable branch)
                                             + tag release/v2026.05.18.0
                                                       │
                                              push event → Deploy — Dev
                                                       ▼
                                              dev GCP env now on v2026.05.18.0
                                              (stable for ~24h)
                                                       │
                                                       │ hourly-promote.yml (~15 past every hour)
                                                       │  ─ pick latest publish/v*
                                                       │  ─ require ≥30 min soak time
                                                       │  ─ require no open issue labeled regression:v<date>
                                                       │  ─ require main does not already contain it
                                                       ▼
                                            auto-PR  publish/v<date> → main  (auto-merge, 3 gates)
                                                       │ on merge
                                                       ▼
                                                     main
                                                       │ tag-on-merge job
                                                       ▼
                                              tag prod/v2026.05.18.0
                                                       │
                                                       ▼
                                  Operator picks tag, dispatches deploy:
                                    gh workflow run deploy-staging.yml -f source_ref=<any>
                                    gh workflow run deploy-prod.yml    -f tag=prod/v<date>

  hotfix/<id> ──► PR direct to main (3 gates + admin bypass if needed) ──► merges + tagged
              └─► cherry-pick into dev
```

---

## 3. Branches and tags

| Name pattern                                     | Type   | How created                       | Mutability                      | Lifetime             |
| ------------------------------------------------ | ------ | --------------------------------- | ------------------------------- | -------------------- |
| `feat/*` `fix/*` `codex/*` `claude/*` `gemini/*` | branch | human / agent                     | mutable                         | short                |
| `dev`                                            | branch | bootstrap                         | mutable (only via PR + 3 gates) | permanent            |
| `main`                                           | branch | bootstrap                         | mutable (only via PR + 3 gates) | permanent            |
| `publish/v<YYYY.MM.DD>.<N>`                      | branch | `nightly-publish.yml` cron        | **immutable**                   | permanent (snapshot) |
| `release/v<YYYY.MM.DD>.<N>`                      | tag    | `nightly-publish.yml` cron        | immutable                       | permanent            |
| `prod/v<YYYY.MM.DD>.<N>`                         | tag    | `hourly-promote.yml` tag-on-merge | immutable                       | permanent            |
| `hotfix/*`                                       | branch | human / agent                     | mutable                         | short                |

`<N>` is the daily sequence (0-indexed). Nightly cron always cuts `.0`; if you manually re-cut the same day you get `.1`, `.2`, ...

The `release/v<date>` tag and the `publish/v<date>` branch always point at **the same SHA**. The branch lets you check out + run workflows; the tag is the immutable identifier you reference in docs / commit messages / issue titles.

The `prod/v<date>` tag is created when `hourly-promote.yml` successfully merges a publish into main. Its SHA is the squash-merge commit on main, **not** the publish branch's SHA — but the tree (file contents) matches.

---

## 4. Workflows

| Workflow                                | Trigger                                                   | What it does                                                                                                  |
| --------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ci.yml` (5 named gates)                | PR to main / dev; push main                               | Commit trailers + BFF-only imports + Runtime mirror guard + Smoke acceptance + UI implementation wave gate    |
| `ci-integ.yml`                          | push to dev; workflow_dispatch                            | heavier integration suite (build, integration tests, orchestrator-tests) — prerequisite for `nightly-publish` |
| `nightly-publish.yml`                   | cron `0 3 * * *`; workflow_dispatch                       | cut `publish/v<date>` + tag `release/v<date>` from dev HEAD                                                   |
| `deploy-dev.yml`                        | push to `publish/v*`; workflow_dispatch                   | deploy to dev GCP (this is what makes dev VM roll)                                                            |
| `hourly-promote.yml` (promote job)      | cron `15 * * * *`; workflow_dispatch                      | open auto-PR `publish/v<date> → main`, auto-merge                                                             |
| `hourly-promote.yml` (tag-on-merge job) | push to main                                              | tag `prod/v<date>` if main's tree matches a publish snapshot                                                  |
| `deploy-staging.yml`                    | workflow_dispatch only                                    | operator picks any ref → staging                                                                              |
| `deploy-prod.yml`                       | workflow_dispatch only, required `prod/v<date>` tag input | operator picks a prod tag → production deploy + protected health verification                                 |

---

## 5. Promotion gates

### Gate 1: feat → dev (every PR)

- 5 named CI checks: `Commit trailers`, `BFF-only imports`, `Runtime mirror guard`, `Smoke acceptance`, `UI implementation wave gate`
- 0 reviewers required
- `auto-merge` enabled per PR

#### Workflow-family release-gate matrix

Pack `00_INDEX.md` invariant 7 remains binding on top of the generic branch gate.
The current workflow family that adds extra release-discipline requirements is:

| Workflow family                        | Binding source                                                                                                                                  | Release gates that must stay green before merge / promote                                                                                         | Enforced by                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `phase1-ui-implementation-wave-202605` | `docs/03-runbooks/system-design-pack-implementation-runbook-20260524.md`; `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md` | `contracts compile`; `docs landed`; `backend support`; `api-client typed adoption`; `app adoption`; `action-authority discipline + smoke anchors` | `UI implementation wave gate` in `ci.yml`, branch protection on `main`/`dev`, and inline promote checks in `hourly-promote.yml` |

### Gate 2: dev → publish snapshot (once a day, nightly cron)

- `ci-integ` must be green on dev HEAD (skip publish otherwise)
- content delta vs latest publish required (skip if no real changes)

### Gate 3: publish → main (hourly cron)

- ≥30 min soak time since publish was cut (configurable)
- no open issue with label `regression:v<date>` (humans/testers can block by opening such an issue)
- main does not already contain this publish's content (idempotency)
- auto-PR opens, `hourly-promote.yml` ensures the static branch-strategy labels exist, and 5 named CI checks must pass

### Gate 4: prod deploy (manual)

- operator runs `gh workflow run deploy-prod.yml -f tag=prod/v<date>`
- tag shape validation: `^prod/v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$`
- tag-existence validation against origin
- production environment can be configured with required-reviewer for double gate

### Hotfix path

- branch off main, PR to main, 3 gates (or admin bypass)
- after merge, cherry-pick into dev
- if the hotfix needs to ship immediately to prod: cut a manual publish (`gh workflow run nightly-publish.yml`), trigger hourly-promote manually, then `gh workflow run deploy-prod.yml -f tag=<new prod tag>`

---

## 6. Branch protection

Identical settings on `main` and `dev`:

| Setting                       | Value                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Required reviewers            | 0                                                                                                                |
| Required status checks        | `Commit trailers`, `BFF-only imports`, `Runtime mirror guard`, `Smoke acceptance`, `UI implementation wave gate` |
| Strict (up-to-date with base) | yes                                                                                                              |
| Linear history                | yes                                                                                                              |
| Force-push                    | no                                                                                                               |
| Delete                        | no                                                                                                               |
| Enforce admins                | no                                                                                                               |

`publish/v*` branches are **not** protected by branch protection. They are protected by convention (immutable) and by the fact that nothing in the workflows writes to them after the initial nightly cut.

Applied via `scripts/branch-strategy/apply-branch-protection.sh --apply`.

Static GitHub labels used by the branch-strategy workflows are managed via
`scripts/branch-strategy/ensure-github-labels.sh --apply`. `hourly-promote.yml`
also runs that script immediately before applying the `automated` and
`auto-publish` labels to a promote PR, so missing repo metadata does not
silently break the `Commit trailers` bypass path in `ci.yml`.

---

## 7. Production deploy rail

`deploy-prod.yml` is now the production-ready manual rail.

It requires a `prod/v<date>` tag, validates the tag against origin, validates the
required `PROD_*` GitHub variables and secrets, confirms required Secret Manager
entries exist in the production GCP project, then runs the same core graph as
staging:

- `validate-config`
- `build-push`
- `migrate` unless `skip_migration=true`
- `deploy`
- `health-check`

The production rail is wired around:

1. Workload Identity Federation via `PROD_WIF_PROVIDER` + `PROD_WIF_SERVICE_ACCOUNT`
2. Cloud SQL attachment via `PROD_GCP_CLOUDSQL_INSTANCE`
3. Secret Manager mounts under `PROD_SECRET_PREFIX` (default `drts-prod`)
4. IAP-protected health verification via `PROD_CONTROL_PLANE_API_ORIGIN` and `PROD_IAP_CLIENT_ID`

Required repository variables:

- `PROD_GCP_PROJECT_ID`
- `PROD_GCP_REGION`
- `PROD_GCP_CLOUDSQL_INSTANCE`
- `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
- `PROD_PLATFORM_ADMIN_ORIGIN`
- `PROD_OPS_CONSOLE_ORIGIN`
- `PROD_CONTROL_PLANE_API_ORIGIN`
- `PROD_IAP_CLIENT_ID`

Required repository secrets:

- `PROD_WIF_PROVIDER`
- `PROD_WIF_SERVICE_ACCOUNT`

The `production` GitHub environment remains the human approval gate. Add or keep
required reviewers there if prod dispatch must pause for explicit operator sign-off.

Rollback is an operator re-dispatch of the previous known-good `prod/v<date>` tag,
normally with `skip_migration=true`. The detailed operator spec lives in
`docs/03-runbooks/production-deploy-rail-spec-20260519.md`, and the executable
drill procedure lives in
`docs/03-runbooks/production-rollback-drill-20260519.md`.

---

## 8. How to do common things

```bash
# What's the latest publish snapshot?
git ls-remote --heads origin 'refs/heads/publish/v*' | awk '{print $2}' | sort -V | tail -1

# What prod-tagged versions exist?
git ls-remote --tags origin 'refs/tags/prod/v*' | awk '{print $2}' | sort -V

# Manually cut a publish snapshot now (skips waiting for 03:00)
gh workflow run nightly-publish.yml

# Manually trigger hourly-promote (after publish is cut + soak)
gh workflow run hourly-promote.yml

# Deploy a specific prod tag to prod
gh workflow run deploy-prod.yml -f tag=prod/v2026.05.18.0

# Deploy current main HEAD to staging (no tag needed)
gh workflow run deploy-staging.yml -f source_ref=main

# Block promotion of a bad publish (humans / testers do this from the dev VM)
gh issue create --title "regression in v2026.05.18.0: bookings page blank" --label "regression:v2026.05.18.0"

# Redeploy yesterday's prod tag (rollback)
gh workflow run deploy-prod.yml -f tag=prod/v2026.05.17.0 -f skip_migration=true
```

---

## 9. Migration v3 → v4 (2026-05-17)

| v3                                                 | v4                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `backend-dev`, `frontend-dev` (two trunks)         | `dev` (single trunk)                                                      |
| every dev merge → main via `publish-to-master.yml` | nightly cut `publish/v<date>`; hourly promote to main                     |
| `prod-YYYYMMDD-<sha8>` tag per main push           | `release/v<date>` per nightly cut + `prod/v<date>` per successful promote |
| deploy-dev triggered by ci-integ workflow_run      | deploy-dev triggered by push to `publish/v*`                              |

v3 long-lived branches stay reachable in git history; they're deleted from origin after v4 is verified.

---

## 10. Branch hygiene

- Short-lived branches (`feat/*`, `codex/*`, …) auto-delete on merge (GitHub setting)
- `publish/v*` branches are kept permanently — they're cheap (ref pointers) and they're the deployment audit trail
- `release/v*` and `prod/v*` tags are kept permanently
- Old `prod-*` tags from v3 will linger until manually cleaned; new ones from v4 use `prod/v*` format so they don't collide

---

## 11. Anchor commit protocol (worker hygiene)

In a multi-worker repo, the working tree is a fragile asset. Supervisor reassignments, agent crashes, and parallel edits on the same file (e.g. `supervisor.py` routing) routinely cause in-session diffs to be lost or to require manual reconciliation. The protocol below treats branch + commit, not the working tree, as the unit of progress. In v4 every worker PRs against the single `dev` trunk, so the protocol is uniform across backend / frontend / docs.

### 11.1 When to anchor commit

Anchor commit at the first describable middle state — do not wait for completion — when **any** of the following hold:

- The change touches a **fragile surface**: `.orchestrator/supervisor.py` (esp. routing/dispatch), `.orchestrator/skills/*.md`, `.orchestrator/templates/*`, `.orchestrator/config*.json`, `.orchestrator/branch_routing.py`, `docs/ops/branch-strategy.md`, `docs/**`, `.github/workflows/**`, `.husky/*`.
- The change spans **more than one file** with shared design intent.
- The change is expected to take **more than one supervisor cycle** to land.
- The worker is **about to yield** to another task (planned reassignment, blocker, end-of-shift).

If any answer is yes and there is no branch yet, **stop editing and create the branch first**:

```bash
git switch -c <lane>/<task-id-kebab> origin/dev
```

Then commit the first describable state:

```bash
git add <task-owned files only>
git commit -m "wip(<TASK-ID>): anchor <scope>" \
  -m "LLM-Agent: <lane>" -m "Task-ID: <TASK-ID>" -m "Reviewer: <reviewer>"
```

The anchor commit is **not the deliverable**; it is a flag that says "this lane has a claim on this surface." Closeout still requires the formal commit per [`task-closeout-finalization.md`](../../.orchestrator/skills/task-closeout-finalization.md).

### 11.2 Do not stash design-intent diffs

`git stash` is acceptable **only** for tiny, throwaway, no-design-intent edits (e.g. a `console.log` you forgot to remove). Any diff touching the fragile surfaces in §11.1 must become a commit, never a stash. Reason: stash entries are anonymous, unreviewable, and almost always require manual rework once mainline advances.

If the supervisor reassigns a worker that has design-intent diffs in flight, the worker must anchor-commit **before** yielding. The supervisor's `worker_tree_guard` config (added by OPS-GIT-WORKFLOW-006) will block dispatch if a fragile-surface diff is uncommitted, and its chatbox sibling (`worker_tree_guard.chatbox_enabled`, added by OPS-GIT-WORKFLOW-007) refuses chatbox-driven `Edit`/`Write`/`MultiEdit`/`NotebookEdit` calls in the same condition.

### 11.3 Same-file parallel designers — declare the layer in the commit body

When two lanes touch the same file at different layers (e.g. one lane edits `supervisor.py` routing, another lane edits `supervisor.py` chair-review), the anchor commit body must declare which slice is claimed. Template:

```
wip(<TASK-ID>): anchor <scope>

Touches <file>: <slice>.
Does not change <other slices>.
Intended to compose with <PR# or task-id> on <other-slice>.

LLM-Agent: <lane>
Task-ID: <TASK-ID>
Reviewer: <reviewer>
```

The body lets the other lane (and future reviewers) tell at a glance whether the two patches are compatible.

### 11.4 `dev` advances → rebase the branch, never `git stash pop` on top

When `dev` has advanced while a lane was paused:

```bash
git fetch origin
git rebase origin/dev
```

Do **not** rely on `git stash pop` to recover paused work; the stash blob has no patch identity and almost always requires manual fixups against the moved trunk.

### 11.5 doc / skill / config — always branch + PR, never park in session

The three surface classes most often overwritten by parallel lanes are:

| Surface class                              | Examples                                                          | Why fragile                                      |
| ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------ |
| `docs/**`                                  | `docs/ops/branch-strategy.md`, `docs/03-runbooks/**`              | chair-review and supervisor lanes both edit them |
| `.orchestrator/skills/**`                  | `task-closeout-finalization.md`, `chairman-operational-review.md` | supervisor/chair changes touch these             |
| `.orchestrator/config*.json`, schema files | `config.example.json`, provider/capability schema                 | enabled-flag toggles by many lanes               |

For these, **never** keep edits in the working tree across more than one supervisor cycle. The required flow:

```bash
git switch -c <lane>/<topic> origin/dev
# edit
git add <files>
git commit -m "<TASK-ID>: <summary>" \
  -m "LLM-Agent: <lane>" -m "Task-ID: <TASK-ID>" -m "Reviewer: <reviewer>"
git push -u origin <lane>/<topic>
gh pr create --base dev --title "<TASK-ID>: <summary>" ...
```

### 11.6 Trigger checklist (before each significant save)

Worker prompts (wakeup + closeout skill) carry this checklist; it is reproduced here for human reference:

1. Am I touching a fragile surface from §11.1?
2. Will this take more than one supervisor cycle?
3. Am I about to yield (reassignment, blocker, planned pause)?
4. Is this a doc / skill / config change per §11.5?

If **any** answer is yes and the current branch is not `<lane>/<task-id-kebab>`, stop editing and:

```bash
git switch -c <lane>/<task-id-kebab> origin/dev
```

### 11.7 Related artifacts

- [`.orchestrator/skills/worker-anchor-commit.md`](../../.orchestrator/skills/worker-anchor-commit.md) — worker-facing operational skill for anchor commits (companion to closeout skill)
- [`.orchestrator/templates/wakeup.txt`](../../.orchestrator/templates/wakeup.txt) — supervisor wakeup template that injects branch context (target of OPS-GIT-WORKFLOW-005)
- [`.orchestrator/worker_tree_guard.py`](../../.orchestrator/worker_tree_guard.py) — shared tree-guard primitives (extracted by OPS-GIT-WORKFLOW-007). Backs both surfaces:
  - `check_worker_tree_guard` — supervisor dispatch guard, gated by `branch_strategy.worker_tree_guard.enabled` (OPS-GIT-WORKFLOW-006, opt-in)
  - `check_chatbox_tree_guard` — Claude-Code PreToolUse hook (via `.orchestrator/permission_broker.py`) for chatbox-driven `Edit`/`Write`/`MultiEdit`/`NotebookEdit`, gated by `branch_strategy.worker_tree_guard.chatbox_enabled` (OPS-GIT-WORKFLOW-007, opt-in)

---

## 12. References

- `.github/workflows/ci.yml` — the 5 PR gates
- `.github/workflows/ci-integ.yml` — heavier CI on push to `dev`
- `.github/workflows/nightly-publish.yml` — 03:00 UTC cut publish snapshot
- `.github/workflows/hourly-promote.yml` — :15 hourly promote + tag-on-merge
- `.github/workflows/deploy-dev.yml` — push-to-publish auto deploy
- `.github/workflows/deploy-staging.yml` — operator manual
- `.github/workflows/deploy-prod.yml` — operator manual, requires `prod/v<date>` tag
- `scripts/git/check_commit_trailers.py` + `check_staged_generated_files.py` — shared by husky + CI
- `scripts/branch-strategy/bootstrap-branches.sh` + `apply-branch-protection.sh` + `triage-branches.sh`
- `.orchestrator/branch_routing.py` — single track now; both backend + frontend → `dev`
- `.husky/pre-commit` + `commit-msg` — local gates mirroring CI
