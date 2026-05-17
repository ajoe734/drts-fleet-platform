# Branch Strategy — AI-native Dev / Staging / Prod (v2)

**Status:** Adopted 2026-05-17  
**Owner:** Release engineering  
**Supersedes:** v1 three-layer model (merge/* + *-publish + release/*) — kept in git history only.

---

## 1. Why v2

Most engineering work in this repo is done by AI agents (Codex / Claude / Gemini / Copilot). The traditional GitFlow-style "feature → develop → release" cadence assumes humans batch commits and cut release windows. AI agents commit dozens of small task closures per hour, so the right model is different:

- **Dev** = always reflects "the latest thing the AI made" → continuous deployment, every push.
- **Staging** = milestone-blessed integration → deploy on **explicit human/supervisor promotion**, never on schedule.
- **Prod** = explicit PR review with at least 2 approvers, then auto-deploy.

If you came from v1 thinking — drop the `merge/*-dev-into-main`, `*-publish`, and `release/*` mental model. v2 is simpler.

---

## 2. The model

```
       AI agents + humans commit on feat/codex/claude/gemini branches
                                ↓ PR (1 reviewer + ci-feat green)
                  ┌─────────────────────────────────────┐
                  │  backend-dev      frontend-dev      │
                  │  continuous integration trunks       │
                  │  ─→ on every push: ci-integ          │
                  │  ─→ on ci-integ green: Deploy — Dev  │ ← AUTO DEPLOY to dev GCP
                  └─────────────────────────────────────┘
                                ↓ workflow_dispatch (promote-to-staging.yml)
                                ↓ trigger: human / supervisor presses button
                                ↓ inputs:  milestone identifier (audit), run_integration_tests=true
                                ↓ behaviour: fast-forward dev → staging if dev's ci-integ is green
                  ┌─────────────────────────────────────┐
                  │  backend-staging  frontend-staging  │
                  │  milestone-blessed staging trunks    │
                  │  ─→ on every push: ci-staging        │
                  │  ─→ on ci-staging green: Deploy — Staging │ ← AUTO DEPLOY to staging GCP
                  └─────────────────────────────────────┘
                                ↓ PR: staging → main
                                ↓ branch protection: 2 reviewers, ci-staging required
                  ┌─────────────────────────────────────┐
                  │  main                                │
                  │  production source of truth          │
                  │  ─→ on every push: Deploy — Prod    │ ← AUTO DEPLOY to prod GCP (skeleton; see §7)
                  └─────────────────────────────────────┘
                                ↑
               hotfix/*  ───────┘  emergency: PR straight to main (2 reviewers or admin bypass);
                                   AI/release manager back-ports to *-dev next cycle.
```

---

## 3. Branches

| Family            | Purpose                                  | Lifetime | Naming                                          |
| ----------------- | ---------------------------------------- | -------- | ----------------------------------------------- |
| `feat/*`          | Human-authored feature                   | Short    | `feat/<scope>-<desc>`                           |
| `fix/*`           | Human-authored bug fix                   | Short    | `fix/<scope>-<desc>`                            |
| `codex/*`         | Codex agent worker output                | Short    | `codex/<task-id-kebab>`                         |
| `claude/*` `claude2/*` | Claude agent worker output          | Short    | `claude/<task-id-kebab>`                        |
| `gemini/*` `gemini2/*` | Gemini agent worker output          | Short    | `gemini/<task-id-kebab>`                        |
| `backend-dev`     | Continuous backend integration trunk     | Permanent | exactly this name                              |
| `frontend-dev`    | Continuous frontend integration trunk    | Permanent | exactly this name                              |
| `backend-staging` | Milestone-blessed backend trunk          | Permanent | exactly this name                              |
| `frontend-staging`| Milestone-blessed frontend trunk         | Permanent | exactly this name                              |
| `main`            | Production source of truth               | Permanent | exactly this name                              |
| `hotfix/*`        | Emergency direct-to-main                 | Shortest | `hotfix/<incident-id>`                          |

> The 5 long-lived branches (`backend-dev`, `frontend-dev`, `backend-staging`, `frontend-staging`, `main`) are the only ones with branch protection. Everything else is disposable; short-lived branches auto-delete on merge.

---

## 4. Task → track routing

Workers are routed by task-ID prefix via `.orchestrator/branch_routing.py`:

| Track    | Task ID prefixes                                                                                          | Base branch       |
| -------- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| Backend  | `BE-*`, `API-*`, `SC-*`, `OBS-*`, `BE-INTEG-*`, `BE-APR-*`, `BE-CC-*`, `EVD-*`, `FWD-*`, `TCH-*`           | `backend-dev`     |
| Frontend | `UI-*`, `*-UI-*` (e.g. `OPS-UI-*`, `TEN-UI-*`), `DRV-*`, `PA-*`, `PB-*`, `DS-*`                            | `frontend-dev`    |
| Docs     | `DOC-*`, `DOCS-*`                                                                                          | `backend-dev` (default) |
| Cross    | no rule matches                                                                                            | `backend-dev` + reviewer must approve cross-track impact |

Full mapping table is config-driven via `branch_strategy.track_rules` in `.orchestrator/config.json`; defaults live in `branch_routing.DEFAULTS`.

---

## 5. Promotion gates

| Gate                            | Trigger                                  | Required CI                  | Approver                        | Mechanism                                           |
| ------------------------------- | ---------------------------------------- | ---------------------------- | ------------------------------- | --------------------------------------------------- |
| `feat → *-dev`                  | PR open + ready_for_review               | `ci-feat`                    | 1 CODEOWNER                     | GitHub PR                                           |
| `*-dev push → dev deploy`       | every push (cancel-in-progress)          | `ci-integ` must pass first   | none (auto)                     | `deploy-dev.yml` via `workflow_run`                 |
| `*-dev → *-staging`             | `workflow_dispatch` (human/supervisor)   | `ci-integ` re-checked        | release manager (button press)  | `promote-to-staging.yml` — `milestone` input required |
| `*-staging push → staging deploy` | every push                              | `ci-staging` must pass first | none (auto)                     | `deploy-staging.yml` via `workflow_run`             |
| `*-staging → main`              | PR (manual)                              | `ci-staging` + ci-feat       | **2 approvers** (branch protection) | GitHub PR; release notes summarise milestones      |
| `main push → prod deploy`       | every push (merge to main)               | none extra (PR gate did it)  | (optional) production env reviewer | `deploy-prod.yml` (currently skeleton — see §7)   |
| `hotfix/* → main`               | Emergency PR                             | minimal `ci-feat`            | 2 approvers OR admin bypass     | Manual; **must back-port to both `*-dev`**          |

### 5.1 Why milestone-driven staging (not nightly)

AI commits dev continuously. If we nightly-promoted dev → staging, staging would be a moving target indistinguishable from dev. The model collapses unless a deliberate "this block is done" decision selects what goes to staging.

The `promote-to-staging.yml` workflow requires a `milestone` input string (audit trail) and only fast-forwards if dev is ahead AND has content delta AND ci-integ is green. Easy to invoke; hard to invoke accidentally.

Future enhancement (not yet wired): supervisor watches `ai-status.json`; when all tasks for a wave / milestone are `done` or `review_approved`, it calls `gh workflow run promote-to-staging.yml -f track=both -f milestone=<wave-id>`. Default OFF — humans flip it on once they're comfortable.

### 5.2 What rolls back

| Failure point                | Rollback                                                            |
| ---------------------------- | ------------------------------------------------------------------- |
| `*-dev` ci-integ red         | dev deploy is gated on ci-integ green → won't fire. Revert offending squash on `*-dev`. |
| Dev deploy red               | Investigate; redeploy older SHA via `gh workflow run deploy-dev.yml -f source_ref=<sha>`. |
| `*-staging` ci-staging red   | Staging deploy is gated on ci-staging green → won't fire. Revert promotion PR. |
| `main` post-merge red        | `git revert` on main + open hotfix PR.                              |
| Prod deploy red              | Redeploy older SHA via `gh workflow run deploy-prod.yml -f source_ref=<sha>`. |

---

## 6. CI and branch protection

| Branch              | Required reviews   | Required status checks       | Force-push       | Deletion |
| ------------------- | ------------------ | ---------------------------- | ---------------- | -------- |
| `main`              | 2                  | `ci-staging`                 | no               | no       |
| `backend-staging`   | 1 (release manager)| `ci-staging`                 | no (FF only)     | no       |
| `frontend-staging`  | 1 (release manager)| `ci-staging`                 | no (FF only)     | no       |
| `backend-dev`       | 1 (CODEOWNERS)     | `ci-feat`                    | no               | no       |
| `frontend-dev`      | 1 (CODEOWNERS)     | `ci-feat`                    | no               | no       |

The `*-staging` branches are written almost exclusively by `promote-to-staging.yml` (fast-forward push). Manual PRs into `*-staging` are technically possible but discouraged — promote properly from `*-dev` instead.

Applied via `scripts/branch-strategy/apply-branch-protection.sh`.

---

## 7. Production deploy (skeleton)

`deploy-prod.yml` is structured like `deploy-staging.yml` but uses `PROD_*` repo variables/secrets which are **not yet configured**. The first run will fail in `validate-config` with a clear list of what's missing. To complete the prod rail:

1. Provision a `prod` GCP project + Workload Identity Federation
2. Set the following repo **variables** (Settings → Variables → Actions):
   - `PROD_GCP_PROJECT_ID`, `PROD_GCP_REGION`, `PROD_GCP_CLOUDSQL_INSTANCE`
   - `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
   - (optional) `PROD_ARTIFACT_PROJECT_ID`, `PROD_ARTIFACT_REGION`, `PROD_ARTIFACT_REPOSITORY`, `PROD_SECRET_PREFIX`
3. Set the following repo **secrets**:
   - `PROD_WIF_PROVIDER`, `PROD_WIF_SERVICE_ACCOUNT`
4. Copy the build-push + deploy job graph from `deploy-staging.yml` into `deploy-prod.yml`, swapping `STAGING_*` references for `PROD_*` and `staging` env binding for `production`.

The GitHub `production` environment is already created (id `15434985743`). It can optionally be configured with required reviewers for a deploy-time double gate.

---

## 8. Hotfix path

```
hotfix/<incident-id>  ──►  main  (PR, 2 reviewers OR admin bypass, minimal ci-feat)
                  │
                  └─► cherry-pick into backend-dev AND/OR frontend-dev within 24h
```

The hotfix back-port is enforced by a check baked into `promote-to-staging.yml`: if it detects `main` is more than one commit ahead of `*-staging` (post-promotion), it opens an issue tagged `hotfix-drift` listing the missing commits.

---

## 9. Migration from v1 (one-time, 2026-05-17)

Old branches were renamed without content change:

| v1 name                          | v2 name           |
| -------------------------------- | ----------------- |
| `merge/backend-dev-into-main`    | `backend-dev`     |
| `merge/frontend-dev-into-main`   | `frontend-dev`    |
| `backend-dev-publish`            | `backend-staging` |
| `frontend-dev-publish`           | `frontend-staging`|
| `release/*` (cut from publish)   | removed (use staging→main PR) |

v1 long-lived branches are deleted from origin once v2 is verified. Their commits are still reachable via the new branches (created at the same SHAs).

---

## 10. Branch hygiene

- **Short-lived branches** (`feat/*`, `fix/*`, `codex/*`, `claude*/*`, `gemini*/*`): auto-delete 7 days after merge.
- **`*-closeout` branches**: legacy convention; do not create new ones — closeouts live in commit messages and `.artifacts/`.
- **Stale-branch sweep**: `scripts/branch-strategy/triage-branches.sh` posts an issue weekly listing branches with no commit in 30+ days that are not merged to main.

---

## 11. References

- `.github/workflows/ci.yml` — ci-feat (PR gate)
- `.github/workflows/ci-integ.yml` — CI on `*-dev` push
- `.github/workflows/ci-staging.yml` — CI on `*-staging` push
- `.github/workflows/deploy-dev.yml` — auto-deploy to dev via workflow_run from ci-integ
- `.github/workflows/deploy-staging.yml` — auto-deploy to staging via workflow_run from ci-staging
- `.github/workflows/deploy-prod.yml` — auto-deploy to prod on push to main (skeleton)
- `.github/workflows/promote-to-staging.yml` — milestone-triggered dev → staging promotion
- `.github/CODEOWNERS` — owner rules per path
- `.orchestrator/branch_routing.py` — task → track mapping
- `scripts/branch-strategy/bootstrap-branches.sh` — create long-lived branches
- `scripts/branch-strategy/apply-branch-protection.sh` — set protection rules
- `scripts/branch-strategy/triage-branches.sh` — branch inventory
