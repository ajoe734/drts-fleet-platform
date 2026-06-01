# WF-PROD-001-LIVE-EXEC Manual Unblock

Last updated: 2026-05-19
Owner: Codex2
Reviewer: Codex
Parent task: `WF-PROD-001-LIVE-EXEC`

## Summary

`WF-PROD-001-LIVE-EXEC` is no longer blocked on task dependencies.

The remaining blockers are external production-readiness gates:

1. Production GitHub configuration is still incomplete.
   - The GitHub `production` environment already exists and already has a required reviewer rule for `ajoe734`.
   - Required production repo variables and secrets are not present yet.
2. Production GCP resources referenced by the deploy rail still need operator provisioning.
3. No production release tag exists yet.
   - `origin` currently has `main` and `publish/v*` branches, but no `refs/tags/prod/v*` tag for `deploy-prod.yml`.
4. No live production deploy evidence exists yet.
   - `deploy-prod.yml` has not been dispatched with a valid `prod/v*` tag, so `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md` is still pending.

## Evidence

## 1. Dependency state in canonical machine truth

- Canonical `AI_STATUS_ROOT` shows `PROD-SPEC-001` as `done` at `2026-05-19T17:19:57Z`.
- Canonical `AI_STATUS_ROOT` shows `PROD-DRILL-001` as `done` at `2026-05-19T19:58:14Z`.
- Canonical `AI_STATUS_ROOT` shows `WF-PROD-001-LIVE-EXEC` resumed after the planning unblock and now focused on re-verifying its HELD-external posture.

This means the parent is dependency-ready and the remaining gap is external readiness, not unfinished upstream tasks.

## 2. GitHub production environment status

Checked on 2026-05-19 via:

```bash
gh api repos/ajoe734/drts-fleet-platform/environments/production
```

Result:

- environment `production` exists
- `required_reviewers` protection rule exists
- reviewer is `ajoe734`

So the old blocker text that implied the production environment reviewer rule was still missing is stale.

## 3. Missing production repo variables

Checked on 2026-05-19 via:

```bash
gh variable list --repo ajoe734/drts-fleet-platform
```

Present variables are `DEV_*`, `STAGING_*`, and legacy non-prod entries. No required `PROD_*` entries were found for:

- `PROD_GCP_PROJECT_ID`
- `PROD_GCP_REGION`
- `PROD_GCP_CLOUDSQL_INSTANCE`
- `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
- `PROD_PLATFORM_ADMIN_ORIGIN`
- `PROD_OPS_CONSOLE_ORIGIN`
- `PROD_CONTROL_PLANE_API_ORIGIN`
- `PROD_IAP_CLIENT_ID`

Optional production entries such as `PROD_ARTIFACT_PROJECT_ID`, `PROD_ARTIFACT_REGION`, `PROD_ARTIFACT_REPOSITORY`, and `PROD_SECRET_PREFIX` were also absent.

## 4. Missing production repo secrets

Checked on 2026-05-19 via:

```bash
gh secret list --repo ajoe734/drts-fleet-platform
```

Present secrets are `DEV_*`, `STAGING_*`, and legacy non-prod entries. Required production secrets are absent:

- `PROD_WIF_PROVIDER`
- `PROD_WIF_SERVICE_ACCOUNT`

## 5. No deployable prod tag yet

Checked on 2026-05-19 via:

```bash
git ls-remote --tags origin 'refs/tags/prod/v*'
```

Result: no matching prod tags exist on `origin`.

Related branch state:

```bash
git ls-remote --heads origin 'publish/*' 'main'
```

Observed:

- `refs/heads/main` exists
- `refs/heads/publish/v2026.05.17.0` exists
- `refs/heads/publish/v2026.05.19.0` exists

So the publish rail has advanced, but the prod deploy input tag has not been created yet.

## Concrete unblock path

The next actionable path for `WF-PROD-001-LIVE-EXEC` is:

1. Human operator provisions the missing required production repo variables:
   - `PROD_GCP_PROJECT_ID`
   - `PROD_GCP_REGION`
   - `PROD_GCP_CLOUDSQL_INSTANCE`
   - `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
   - `PROD_PLATFORM_ADMIN_ORIGIN`
   - `PROD_OPS_CONSOLE_ORIGIN`
   - `PROD_CONTROL_PLANE_API_ORIGIN`
   - `PROD_IAP_CLIENT_ID`
2. Human operator provisions the missing required production repo secrets:
   - `PROD_WIF_PROVIDER`
   - `PROD_WIF_SERVICE_ACCOUNT`
3. Human operator provisions the referenced prod GCP project resources described in `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`, including the Secret Manager entries expected under the production secret prefix.
4. `hourly-promote.yml` or the release operator produces the first `prod/vYYYY.MM.DD.N` tag on `origin`.
5. The assigned owner runs `gh workflow run deploy-prod.yml -f tag=prod/vYYYY.MM.DD.N` and records live evidence in `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`.

## Scope decision

No live deploy was attempted in this task.
No canonical contract or workflow file needed to change.
The required task-scoped action is to refresh the operator handoff and task summary so they point only at the real remaining external blockers.
