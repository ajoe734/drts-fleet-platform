# Branch Strategy — nightly publish + hourly promote (v4)

**Status:** Adopted 2026-05-17  
**Owner:** Release engineering  
**Supersedes:** v3 (per-merge prod-* tags). v3 tagged every dev merge → tag pollution + dev VM thrashing. v4 cuts an **immutable nightly publish snapshot** that dev VM deploys to, then **hourly auto-promotes** to master with a `prod/v<date>` tag.

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

| Name pattern              | Type      | How created                          | Mutability | Lifetime |
| ------------------------- | --------- | ------------------------------------ | ---------- | -------- |
| `feat/*` `fix/*` `codex/*` `claude/*` `gemini/*` | branch | human / agent | mutable | short |
| `dev`                     | branch    | bootstrap                            | mutable (only via PR + 3 gates) | permanent |
| `main`                    | branch    | bootstrap                            | mutable (only via PR + 3 gates) | permanent |
| `publish/v<YYYY.MM.DD>.<N>` | branch  | `nightly-publish.yml` cron           | **immutable** | permanent (snapshot) |
| `release/v<YYYY.MM.DD>.<N>` | tag     | `nightly-publish.yml` cron           | immutable | permanent |
| `prod/v<YYYY.MM.DD>.<N>`  | tag       | `hourly-promote.yml` tag-on-merge    | immutable | permanent |
| `hotfix/*`                | branch    | human / agent                        | mutable | short |

`<N>` is the daily sequence (0-indexed). Nightly cron always cuts `.0`; if you manually re-cut the same day you get `.1`, `.2`, ...

The `release/v<date>` tag and the `publish/v<date>` branch always point at **the same SHA**. The branch lets you check out + run workflows; the tag is the immutable identifier you reference in docs / commit messages / issue titles.

The `prod/v<date>` tag is created when `hourly-promote.yml` successfully merges a publish into main. Its SHA is the squash-merge commit on main, **not** the publish branch's SHA — but the tree (file contents) matches.

---

## 4. Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` (3 named gates) | PR to main / dev; push main | Commit trailers + Runtime mirror guard + Smoke acceptance |
| `ci-integ.yml` | push to dev; workflow_dispatch | heavier integration suite (build, integration tests, orchestrator-tests) — prerequisite for `nightly-publish` |
| `nightly-publish.yml` | cron `0 3 * * *`; workflow_dispatch | cut `publish/v<date>` + tag `release/v<date>` from dev HEAD |
| `deploy-dev.yml` | push to `publish/v*`; workflow_dispatch | deploy to dev GCP (this is what makes dev VM roll) |
| `hourly-promote.yml` (promote job) | cron `15 * * * *`; workflow_dispatch | open auto-PR `publish/v<date> → main`, auto-merge |
| `hourly-promote.yml` (tag-on-merge job) | push to main | tag `prod/v<date>` if main's tree matches a publish snapshot |
| `deploy-staging.yml` | workflow_dispatch only | operator picks any ref → staging |
| `deploy-prod.yml` | workflow_dispatch only, required `prod/v<date>` tag input | operator picks a prod tag → production (currently skeleton, see §7) |

---

## 5. Promotion gates

### Gate 1: feat → dev (every PR)
- 3 named CI checks: `Commit trailers`, `Runtime mirror guard`, `Smoke acceptance`
- 0 reviewers required
- `auto-merge` enabled per PR

### Gate 2: dev → publish snapshot (once a day, nightly cron)
- `ci-integ` must be green on dev HEAD (skip publish otherwise)
- content delta vs latest publish required (skip if no real changes)

### Gate 3: publish → main (hourly cron)
- ≥30 min soak time since publish was cut (configurable)
- no open issue with label `regression:v<date>` (humans/testers can block by opening such an issue)
- main does not already contain this publish's content (idempotency)
- auto-PR opens, auto-merge enabled, 3 named CI checks must pass

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

| Setting | Value |
| --- | --- |
| Required reviewers | 0 |
| Required status checks | `Commit trailers`, `Runtime mirror guard`, `Smoke acceptance` |
| Strict (up-to-date with base) | yes |
| Linear history | yes |
| Force-push | no |
| Delete | no |
| Enforce admins | no |

`publish/v*` branches are **not** protected by branch protection. They are protected by convention (immutable) and by the fact that nothing in the workflows writes to them after the initial nightly cut.

Applied via `scripts/branch-strategy/apply-branch-protection.sh --apply`.

---

## 7. Production deploy (skeleton)

`deploy-prod.yml` validates the tag input format and existence, then calls into a build+deploy job graph that uses `PROD_*` GitHub variables and secrets that are **not yet configured**. The workflow will fail in `validate-config` with the list of missing vars/secrets.

To complete the prod rail:

1. Provision a `prod` GCP project + Workload Identity Federation
2. Set repo variables: `PROD_GCP_PROJECT_ID`, `PROD_GCP_REGION`, `PROD_GCP_CLOUDSQL_INSTANCE`, `PROD_GCP_RUNTIME_SERVICE_ACCOUNT` (+ optional `PROD_ARTIFACT_*`, `PROD_SECRET_PREFIX`)
3. Set repo secrets: `PROD_WIF_PROVIDER`, `PROD_WIF_SERVICE_ACCOUNT`
4. Copy `deploy-staging.yml`'s build-push + deploy job graph into `deploy-prod.yml`, swapping `STAGING_*` → `PROD_*` and `environment: staging` → `environment: production`

The `production` GitHub environment is already created. Add required reviewers if you want a deploy-time human gate on top of the prod tag selection.

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
gh workflow run deploy-prod.yml -f tag=prod/v2026.05.17.0
```

---

## 9. Migration v3 → v4 (2026-05-17)

| v3 | v4 |
| --- | --- |
| `backend-dev`, `frontend-dev` (two trunks) | `dev` (single trunk) |
| every dev merge → main via `publish-to-master.yml` | nightly cut `publish/v<date>`; hourly promote to main |
| `prod-YYYYMMDD-<sha8>` tag per main push | `release/v<date>` per nightly cut + `prod/v<date>` per successful promote |
| deploy-dev triggered by ci-integ workflow_run | deploy-dev triggered by push to `publish/v*` |

v3 long-lived branches stay reachable in git history; they're deleted from origin after v4 is verified.

---

## 10. Branch hygiene

- Short-lived branches (`feat/*`, `codex/*`, …) auto-delete on merge (GitHub setting)
- `publish/v*` branches are kept permanently — they're cheap (ref pointers) and they're the deployment audit trail
- `release/v*` and `prod/v*` tags are kept permanently
- Old `prod-*` tags from v3 will linger until manually cleaned; new ones from v4 use `prod/v*` format so they don't collide

---

## 11. References

- `.github/workflows/ci.yml` — the 3 PR gates
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
