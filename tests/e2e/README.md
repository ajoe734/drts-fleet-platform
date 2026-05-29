# DRTS Platform — Cross-Surface E2E Suite

This directory holds the stateful cross-surface scenarios that stitch together
tenant, ops, driver, billing, and tenant-boundary evidence.

Use it together with:

- `docs/04-uat/fbp-014a-e2e-matrix.md` for the detailed scenario design
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` for release-gate interpretation
- `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` for the latest live staging rerun

## Gate Role

The E2E suite is not "all of release" by itself.

It serves three purposes:

1. prove cross-surface ID continuity for named workflow families
2. make cross-tenant safety reviewable
3. keep external-adapter and manual-only flows explicit instead of silently passing them

## Scenario Map

| Scenario                          | Workflow families                                      | Gate role                                                              | Current read                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-001-enterprise-dispatch.sh`  | `WF-ORD-001`, `WF-DSP-001`, `WF-DRV-001`, `WF-FIN-001` | owned booking -> dispatch -> driver -> billing/audit continuity        | live staging evidence contributes to all four families via `FBP-014B`; final family reads remain `WF-ORD-001` / `WF-DSP-001` = `PASS (live staging evidence)`, `WF-DRV-001` / `WF-FIN-001` = `PASS (static evidence)` per the release matrix |
| `E2E-002-forwarded-order.sh`      | `WF-FWD-001`                                           | route-locked forwarded-task visibility and no-owned-assignment guard   | `EXTERNAL-GATED`; live adapter proof remains external                                                                                                                                                                                        |
| `E2E-003` (manual only)           | `WF-COM-001`                                           | phone-order -> recording -> export boundary                            | `HOLD`; deferred pending live CTI and job activation                                                                                                                                                                                         |
| `E2E-004-tenant-attribution.sh`   | `WF-TEN-001`, `WF-ORD-001`                             | tenant creation, new-tenant booking, attribution, no cross-tenant leak | `PASS (live staging evidence)` via `FBP-014B`                                                                                                                                                                                                |
| `E2E-009-prod-rail-dry-run.sh`    | `WF-PROD-001`                                          | static dry-run of validate-config → build-push → deploy → rollback-by-tag against `deploy-prod.yml` and the production runbook | `PASS (repo-local)` in SKELETON mode on `dev`; full-rail assertions auto-activate when PROD-RAIL-001 merges to dev                                                                                                                            |

## Important Boundaries

- `E2E-001` and `E2E-004` are the release-grade live staging anchors.
- `E2E-002` is allowed to skip when no forwarded-task seed or adapter data is available.
- `E2E-003` is intentionally manual-only until CTI/recording/filing hooks are activated.
- `E2E-009` is a contract dry-run against `.github/workflows/deploy-prod.yml` and
  `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`. It never executes
  `gcloud`, never contacts a real Cloud Run target, and ignores `E2E_API_URL`.
  It detects whether the workflow is in SKELETON or FULL mode (PROD-RAIL-001
  determines that). Use it as a pre-flight before any operator runs
  `gh workflow run deploy-prod.yml`.
- The retired `apps/tenant-portal-web` shell is never a production verification target.

## Running

```bash
./tests/e2e/run-e2e.sh
./tests/e2e/run-e2e.sh --suite 001,004
./tests/e2e/run-e2e.sh --suite 009
./tests/e2e/run-e2e.sh --dry-run
```

Use a bare origin in `E2E_API_URL` and provide `E2E_AUTH_BEARER_TOKEN` when
staging ingress requires identity.
