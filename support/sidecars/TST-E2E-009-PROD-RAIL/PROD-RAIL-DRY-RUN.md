# TST-E2E-009-PROD-RAIL — Production Rail Dry-Run

## Purpose

This sidecar explains what `tests/e2e/E2E-009-prod-rail-dry-run.sh` verifies.

The scenario is intentionally static. It does **not** invoke GitHub Actions,
build Docker images, or deploy to GCP. The current repository state still marks
`.github/workflows/deploy-prod.yml` as a skeleton, and the production GCP
project/secrets are not represented in local testable form. The dry-run instead
proves that the contract for the rail is explicit and reviewable.

## Checks

The script validates four linked stages:

1. `validate-config`
   Confirms `deploy-prod.yml` has the production environment gate, prod-tag
   shape validation, origin tag existence check, and the required `PROD_*`
   variable/secret guardrails.
2. `build-push`
   Confirms the staging workflow still carries the canonical build graph for the
   four active images and that the prod workflow / branch strategy point to that
   graph as the completion contract.
3. `deploy dry-run`
   Confirms the prod workflow is manual-only, serialised under `deploy-prod`,
   and explicitly documents the reserved deploy graph plus skeleton state.
4. `rollback by tag`
   Confirms the branch strategy preserves the operator rollback command that
   redeploys an earlier `prod/v*` tag.

## Current Read

- `deploy-prod.yml` is still a skeleton by design.
- The production rail is documented, but not locally executable end-to-end.
- `E2E-009` should pass as long as the workflow and runbook remain coherent.
- If prod deployment jobs are later implemented, this sidecar should be updated
  to describe any new live or semi-live verification surface.
