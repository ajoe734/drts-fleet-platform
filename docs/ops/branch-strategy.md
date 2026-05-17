# Branch Strategy — AI-native, tag-based promotion (v3)

**Status:** Adopted 2026-05-17  
**Owner:** Release engineering  
**Supersedes:** v2 (`*-staging` branches + milestone promotion). v2 used branches as the promotion unit; v3 uses **tags**, which fits AI cadence better — every green dev integration becomes a candidate, operators choose what to deploy.

---

## 1. Why v3

Most work in this repo is by AI agents. Agents commit dozens of small task closures per hour. v2 still routed each closure through a branch-shaped funnel (`*-dev` → `*-staging` → `main`); operators had to remember which branches existed in which environment. v3 collapses the model:

- **dev** = continuous auto-deploy of `*-dev` HEAD (always reflects "the latest thing the AI made")
- **main** = publish trunk, automatically fed from `*-dev`, every merge tagged `prod-YYYYMMDD-<sha8>`
- **staging / production** = operator picks a tag and dispatches the deploy workflow

There is no `*-staging` branch. There is no "promote dev → staging" branch action. The promotion mechanism is _selecting a tag_.

---

## 2. The model

```
   AI agents + humans → feat/codex/claude/gemini branches
                          │ PR (0 reviewers; 3 CI gates required)
                          ▼
            ┌────────────────────────────────────┐
            │  backend-dev      frontend-dev     │
            │  continuous integration trunks      │
            │   ─ on push: ci-integ (heavier)     │
            │   ─ ci-integ green → Deploy — Dev   │ ← AUTO DEPLOY to dev GCP
            │   ─ ci-integ green → publish-to-master:
            │                  · open auto-PR → main
            │                  · auto-merge (admin)
            └────────────────────────────────────┘
                                │
                                ▼
            ┌────────────────────────────────────┐
            │  main (publish trunk)               │
            │   ─ on push: tag prod-YYYYMMDD-<sha>│
            └────────────────────────────────────┘
                                │
                tags accumulate: prod-20260517-abc12345
                                 prod-20260517-def67890
                                 …
                                │
       OPERATOR ACTION (workflow_dispatch):
          gh workflow run deploy-staging.yml -f source_ref=prod-20260517-abc12345
          gh workflow run deploy-prod.yml    -f tag=prod-20260517-abc12345
                                │
                                ▼
                       staging / production GCP

       hotfix/<id>  ──► PR straight to main (CI must pass, auto-merges) ──► tagged
                  └─► cherry-pick into *-dev within 24h
```

---

## 3. Branches

| Family            | Purpose                                  | Lifetime | Naming                                |
| ----------------- | ---------------------------------------- | -------- | ------------------------------------- |
| `feat/*`          | Human-authored feature                   | Short    | `feat/<scope>-<desc>`                 |
| `fix/*`           | Human-authored bug fix                   | Short    | `fix/<scope>-<desc>`                  |
| `codex/*`         | Codex agent worker output                | Short    | `codex/<task-id-kebab>`               |
| `claude/*` `claude2/*`  | Claude agent worker output         | Short    | `claude/<task-id-kebab>`              |
| `gemini/*` `gemini2/*`  | Gemini agent worker output         | Short    | `gemini/<task-id-kebab>`              |
| `backend-dev`     | Backend continuous trunk                 | Permanent | exactly this name                    |
| `frontend-dev`    | Frontend continuous trunk                | Permanent | exactly this name                    |
| `main`            | Publish trunk + production source        | Permanent | exactly this name                    |
| `hotfix/*`        | Emergency PR-to-main                     | Shortest | `hotfix/<incident-id>`                |

> Three long-lived branches: `main`, `backend-dev`, `frontend-dev`. Everything else is disposable.

---

## 4. Task → track routing

`.orchestrator/branch_routing.py` routes by task-ID prefix:

| Track    | Task ID prefixes                                                                                          | Base branch       |
| -------- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| Backend  | `BE-*`, `API-*`, `SC-*`, `OBS-*`, `BE-INTEG-*`, `BE-APR-*`, `BE-CC-*`, `EVD-*`, `FWD-*`, `TCH-*`           | `backend-dev`     |
| Frontend | `UI-*`, `*-UI-*` (e.g. `OPS-UI-*`, `TEN-UI-*`), `DRV-*`, `PA-*`, `PB-*`, `DS-*`                            | `frontend-dev`    |
| Docs     | `DOC-*`, `DOCS-*`                                                                                          | `backend-dev` (default) |
| Cross    | no rule matches                                                                                            | `backend-dev` (with cross-track reviewer caveat) |

Worker PRs target `backend-dev` or `frontend-dev`; from there the publish + deploy chain is automatic.

---

## 5. Promotion gates

| Gate                          | Trigger                              | Required CI                                          | Approver        | Mechanism                                  |
| ----------------------------- | ------------------------------------ | ---------------------------------------------------- | --------------- | ------------------------------------------ |
| `feat/* → *-dev`              | PR open                              | **Commit trailers + Runtime mirror guard + Smoke acceptance** | none (CI is gate) | `ci.yml`; auto-merge once green        |
| `*-dev push → dev deploy`     | every push (cancel-in-progress)      | `ci-integ` must pass                                 | none            | `deploy-dev.yml` via `workflow_run`        |
| `*-dev push → publish-to-master` | every push (one in flight at a time) | `ci-integ` must pass                                 | none (CI + auto-merge) | `publish-to-master.yml` opens auto-PR `*-dev → main`, sets auto-merge |
| `auto-PR → main`              | auto-merge when CI green             | same 3 gates as `feat → *-dev`                       | none            | GitHub auto-merge (squash)                 |
| `main push → tag`             | every push                           | n/a                                                  | none            | `publish-to-master.yml tag-on-merge` job tags `prod-YYYYMMDD-<sha8>` |
| **Staging deploy**            | `workflow_dispatch` (operator)       | none (just deploy)                                   | **operator**    | `deploy-staging.yml -f source_ref=<tag or branch>` |
| **Production deploy**         | `workflow_dispatch` (operator)       | tag must match `prod-*` regex; tag must exist        | **operator**    | `deploy-prod.yml -f tag=<prod-*>`          |
| `hotfix/* → main`             | Emergency PR                         | same 3 CI gates                                      | 0 reviewers (CI is gate) OR admin bypass | Same flow as feat; back-port via cherry-pick to `*-dev` within 24h |

### 5.1 Why CI-only gating (0 reviewers)

AI commits at high cadence. Requiring a human approval per PR is a bottleneck the model can't sustain. The repo trusts the **3 CI gates** instead:

1. **Commit trailers** — every commit must have `<TASK-ID>: <subject>` and `Task-ID:`, `LLM-Agent:`, `Reviewer:` trailers. Forces every change to be auditable.
2. **Runtime mirror guard** — no `docs-site/*`, `*-bg.pid`, runtime logs, or other derived artifacts in the diff. Forces clean source-of-truth commits.
3. **Smoke acceptance** — lint + typecheck + unit tests pass.

If a future operator wants a human-approval layer, change `required_approving_review_count: 0` to `1` in `scripts/branch-strategy/apply-branch-protection.sh`.

### 5.2 Why tag-based staging/prod (not branches)

In v2, staging meant "what's in the `*-staging` branch right now". That couples one operator decision (deploy to staging) with a stateful branch ref. v3 makes the staging environment **stateless** — the GitHub deployment record + `gh run view` tells you what's deployed. Operator picks any tag for any environment at any time.

This also makes rollback trivial: `gh workflow run deploy-staging.yml -f source_ref=prod-20260515-abc12345` to redeploy yesterday's tag.

---

## 6. Branch protection (identical for main + backend-dev + frontend-dev)

| Setting                              | Value                                                  |
| ------------------------------------ | ------------------------------------------------------ |
| Required reviewers                   | 0                                                      |
| Required status checks               | **Commit trailers**, **Runtime mirror guard**, **Smoke acceptance** |
| Strict (require branch up-to-date)   | yes                                                    |
| Required linear history              | yes (squash-only)                                      |
| Allow force-push                     | no                                                     |
| Allow deletion                       | no                                                     |
| Enforce admins                       | no (admin can bypass — used for the initial cutover and emergency fixes) |
| Direct push                          | rejected (must go through PR)                          |

Applied via `scripts/branch-strategy/apply-branch-protection.sh --apply`.

---

## 7. Hotfix path

```
hotfix/<incident-id> ──(PR, 3 gates)──► main ──(tag prod-*)──► operator deploys to prod
                  │
                  └─► cherry-pick into backend-dev AND/OR frontend-dev within 24h
```

Same PR flow, same 3 gates. The only difference: hotfix branches off `main`, not `*-dev`. After landing, cherry-pick the fix back into the affected `*-dev` so the dev environment isn't behind prod.

---

## 8. Production deploy (skeleton)

`deploy-prod.yml` is structured like `deploy-staging.yml` but requires a `prod-*` tag input and uses `PROD_*` repo variables/secrets that are **not yet configured**. The first run fails in `validate-config` with the missing list. To complete the prod rail:

1. Provision a `prod` GCP project + Workload Identity Federation
2. Set repo **variables** (Settings → Variables → Actions):
   - `PROD_GCP_PROJECT_ID`, `PROD_GCP_REGION`, `PROD_GCP_CLOUDSQL_INSTANCE`, `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
   - (optional) `PROD_ARTIFACT_PROJECT_ID`, `PROD_ARTIFACT_REGION`, `PROD_ARTIFACT_REPOSITORY`, `PROD_SECRET_PREFIX`
3. Set repo **secrets**:
   - `PROD_WIF_PROVIDER`, `PROD_WIF_SERVICE_ACCOUNT`
4. Copy build-push + deploy job graph from `deploy-staging.yml` into `deploy-prod.yml`, swapping `STAGING_*` → `PROD_*` and `environment: staging` → `environment: production`.

The GitHub `production` environment is already created (id `15434985743`). Optional: add required reviewers for a deploy-time human gate.

---

## 9. Migration v1 → v2 → v3 (one-time, 2026-05-17)

| v1 branch                          | v2 name           | v3 fate                |
| ---------------------------------- | ----------------- | ---------------------- |
| `merge/backend-dev-into-main`      | `backend-dev`     | kept                   |
| `merge/frontend-dev-into-main`     | `frontend-dev`    | kept                   |
| `backend-dev-publish`              | `backend-staging` | **deleted** (no more staging branch) |
| `frontend-dev-publish`             | `frontend-staging`| **deleted**            |
| `release/*`                        | removed           | n/a                    |

All commits remain reachable through `backend-dev` / `frontend-dev` / `main`.

---

## 10. Branch hygiene

- **Short-lived branches** (`feat/*`, `fix/*`, `codex/*`, `claude*/*`, `gemini*/*`): auto-delete 7 days after merge (repo setting `delete_branch_on_merge: true`).
- **Stale-branch sweep**: `scripts/branch-strategy/triage-branches.sh` reports branches with no commit in 30+ days that are unmerged.
- **Tags**: `prod-*` tags are permanent (deployment history). No auto-pruning.

---

## 11. References

- `.github/workflows/ci.yml` — the 3 PR gates (Commit trailers / Runtime mirror guard / Smoke acceptance)
- `.github/workflows/ci-integ.yml` — heavier CI on push to `*-dev`
- `.github/workflows/publish-to-master.yml` — auto-PR `*-dev → main` + auto-merge + tag
- `.github/workflows/deploy-dev.yml` — auto-deploy on `*-dev` push (via workflow_run from ci-integ)
- `.github/workflows/deploy-staging.yml` — **manual** dispatch, operator picks `source_ref`
- `.github/workflows/deploy-prod.yml` — **manual** dispatch with required `prod-*` `tag` input
- `.github/CODEOWNERS` — owner rules per path
- `.orchestrator/branch_routing.py` — task → track mapping
- `scripts/git/check_commit_trailers.py` — shared by husky `commit-msg` hook + CI
- `scripts/git/check_staged_generated_files.py` — shared by husky `pre-commit` + CI
- `scripts/branch-strategy/bootstrap-branches.sh` — create the 2 dev branches
- `scripts/branch-strategy/apply-branch-protection.sh` — set protection on main + 2 dev branches
- `scripts/branch-strategy/triage-branches.sh` — branch inventory
- `.husky/pre-commit` — local mirror guard
- `.husky/commit-msg` — local trailer check
