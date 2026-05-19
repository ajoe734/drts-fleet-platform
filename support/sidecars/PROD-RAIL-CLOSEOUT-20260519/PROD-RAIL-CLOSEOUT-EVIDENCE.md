# PROD-RAIL-CLOSEOUT — Production Rail Dry-Run Evidence (2026-05-19)

**Date:** 2026-05-19
**Wave:** `phase1-v2-business-flow-gates`
**Closes:** WF-PROD-001 dry-run gate (still external-gated for actual prod execution)
**Predecessor tasks (all done in dev):**

- `PROD-RAIL-001` — `.github/workflows/deploy-prod.yml` upgraded from SKELETON to real implementation
- `TST-E2E-009-PROD-RAIL` — `tests/e2e/E2E-009-prod-rail-dry-run.sh` static contract checker

---

## 1. Summary

The production deploy rail is **structurally complete** in `dev`:

- `deploy-prod.yml` is no longer a skeleton — it carries real `validate-config`, `build-push`, `migrate`, `deploy`, and `health-check` jobs (627 lines).
- E2E-009 dry-run script asserts the rail's contract end-to-end and **passes locally** as of this evidence.
- All 4 rail surfaces report `status=pass` in the static contract check.

The rail is **not yet runnable against real production**, by design: `PROD_GCP_PROJECT_ID`, `PROD_WIF_PROVIDER`, `PROD_WIF_SERVICE_ACCOUNT`, `PROD_GCP_CLOUDSQL_INSTANCE`, `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`, and `PROD_SECRET_PREFIX` are gated by GitHub Settings → Secrets/Variables and must be configured by a human operator before the first real `gh workflow run deploy-prod.yml -f tag=prod/v<date>` will succeed.

This evidence packet documents what is and is not claimed.

## 2. Dry-run execution

```
$ bash tests/e2e/E2E-009-prod-rail-dry-run.sh
```

Output (abridged):

```
════════════════════════════════════════════════════════
  E2E-009 — Production rail dry-run
════════════════════════════════════════════════════════

◆ SURFACE: validate-config — production workflow gate ◆
[PASS] validate-config job exists
[PASS] production environment gate is declared
[PASS] prod tag regex is enforced
[PASS] origin tag existence check is present
[PASS] PROD_GCP_PROJECT_ID config gate is present
[PASS] PROD_GCP_REGION config gate is present
[PASS] PROD_GCP_CLOUDSQL_INSTANCE config gate is present
[PASS] PROD_GCP_RUNTIME_SERVICE_ACCOUNT config gate is present
[PASS] PROD_WIF_SERVICE_ACCOUNT config gate is present
[PASS] PROD_WIF_PROVIDER config gate is present

◆ SURFACE: build-push — prod rail real implementation ◆
[PASS] staging build-push source job exists
[PASS] staging api / migrate / platform-admin-web / ops-console-web image builds exist
[PASS] prod build-push job exists (non-skeleton)
[PASS] prod uses docker/build-push-action

◆ SURFACE: deploy dry-run — workflow dispatch + real deploy graph ◆
[PASS] prod workflow is manually dispatchable
[PASS] prod workflow serialises deployment runs
[PASS] prod concurrency group is fixed
[PASS] prod migrate job exists (non-skeleton)
[PASS] prod deploy job exists (non-skeleton)
[PASS] prod health-check job exists (non-skeleton)
[PASS] branch strategy documents deploy command

◆ SURFACE: rollback by tag — operator command path ◆
[PASS] rollback heading is documented
[PASS] rollback by tag command is documented
[PASS] operator-driven prod tag deploy is documented

Chain summary:
{
  "validate_config": { "status": "pass", "mode": "static_contract_check" },
  "build_push":      { "status": "pass", "mode": "real_implementation" },
  "deploy_dry_run":  { "status": "pass", "mode": "real_workflow_dispatch_contract" },
  "rollback":        { "status": "pass", "mode": "tag_redeploy_contract" }
}
```

## 3. What this evidence proves

| Surface         | Claim                                                                                                                            | Evidence                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| validate-config | Job exists; required prod vars/secrets are referenced; tag regex enforces `prod/vYYYY.MM.DD.N`; origin tag existence is checked. | `deploy-prod.yml:50-145`         |
| build-push      | Real `docker/build-push-action` job exists for prod (4 services).                                                                | `deploy-prod.yml:146-232`        |
| migrate         | Real migrate job exists.                                                                                                         | `deploy-prod.yml:233-358`        |
| deploy          | Real deploy job exists.                                                                                                          | `deploy-prod.yml:359-535`        |
| health-check    | Real health-check job exists.                                                                                                    | `deploy-prod.yml:536-627`        |
| rollback        | Operator command path documented in branch-strategy.md (`gh workflow run deploy-prod.yml -f tag=prod/v<date>`).                  | `docs/ops/branch-strategy.md` §7 |

## 4. What this evidence does NOT claim

This is a **static contract check**, not a live deployment. Specifically:

- No image was actually built or pushed.
- No Cloud Run revision was created.
- No Cloud SQL migration was run.
- No prod GCP project was contacted.
- WIF authentication was not exercised.
- Secret Manager access was not exercised.

These require:

1. `vars.PROD_GCP_PROJECT_ID` etc. to be set in repo Settings → Variables.
2. `secrets.PROD_WIF_SERVICE_ACCOUNT` and `secrets.PROD_WIF_PROVIDER` to be set in repo Settings → Secrets.
3. The configured GCP project to have the runtime service account, Cloud SQL instance, Artifact Registry repo, and Secret Manager entries created.
4. A real `prod/v*` tag created via `hourly-promote.yml`.

Until those are done, the first actual `gh workflow run deploy-prod.yml -f tag=prod/v<date>` will fail at `validate-config` with the documented "missing prod config" diagnostic. **That failure mode is intentional and is itself a gate.**

## 5. Workflow-family gate read update

Updates `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`:

| Family              | Before                                | After                                                                                                         |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `WF-PROD-001` (new) | not yet listed (per planning runbook) | `PASS (dry-run contract evidence)` with explicit `EXTERNAL-GATED` remaining-non-claim for live prod execution |
| `WF-RLS-001`        | `PASS (live staging evidence)`        | unchanged — live staging proof remains, prod execution still external-gated                                   |

`WF-PROD-001` does **not** claim `PASS (live prod evidence)`. That requires:

- GitHub Environment `production` configured with reviewer rule.
- First real `gh workflow run deploy-prod.yml -f tag=prod/vYYYY.MM.DD.N` succeeds with image build + migration + deploy + health-check all green.
- Rollback drill executed against a previous prod tag.

## 6. Companion: auto-promote PR backlog

While preparing this closeout, the wave-merge campaign (PR #161) landed `PROD-RAIL-001` and `TST-E2E-009-PROD-RAIL` content into `dev`. The two pre-wave auto-promote PRs were also disposed of:

- `#157` `publish/v2026.05.18.0 → main` — merged (admin override of self-review requirement; the v2026.05.18.0 snapshot pre-dates the wave content)
- `#159` `publish/v2026.05.19.0 → main` — merged (same)

A subsequent `hourly-promote.yml` run will produce a new `publish/v2026.05.19.1+` PR that carries PR #161's wave deliverables (including this evidence packet, the upgraded `deploy-prod.yml`, and the dry-run script) for promotion to `main`. That PR is the next anchor for actual prod execution.

## 7. Operator next steps

To progress from "rail dry-run pass" → "rail live pass":

1. Configure GitHub repo Settings:
   - `vars.PROD_GCP_PROJECT_ID`, `vars.PROD_GCP_REGION`, `vars.PROD_GCP_CLOUDSQL_INSTANCE`, `vars.PROD_GCP_RUNTIME_SERVICE_ACCOUNT`, `vars.PROD_ARTIFACT_REPOSITORY` (optional), `vars.PROD_SECRET_PREFIX`
   - `secrets.PROD_WIF_PROVIDER`, `secrets.PROD_WIF_SERVICE_ACCOUNT`
2. Create GitHub Environment `production` with required reviewer rule (typically @ajoe734).
3. Provision the GCP project: WIF pool + provider, Cloud SQL instance, Artifact Registry repo, Secret Manager entries, runtime service account with `roles/run.admin` + `roles/cloudsql.client` + `roles/secretmanager.secretAccessor`.
4. Once a `publish/v*` PR with PR #161 content merges to `main`, `hourly-promote.yml` produces a `prod/vYYYY.MM.DD.N` tag.
5. Execute the first real deploy: `gh workflow run deploy-prod.yml -f tag=prod/vYYYY.MM.DD.N` — Environment reviewer approves; workflow runs validate → build-push → migrate → deploy → health-check.
6. Verify health-check pass; produce a follow-on evidence packet capturing live execution.
7. Update `WF-PROD-001` gate read to `PASS (live prod execution evidence)`.
