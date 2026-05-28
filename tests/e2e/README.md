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

| Scenario                         | Workflow families                                      | Gate role                                                              | Current read                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-001-enterprise-dispatch.sh` | `WF-ORD-001`, `WF-DSP-001`, `WF-DRV-001`, `WF-FIN-001` | owned booking -> dispatch -> driver -> billing/audit continuity        | live staging evidence contributes to all four families via `FBP-014B`; final family reads remain `WF-ORD-001` / `WF-DSP-001` = `PASS (live staging evidence)`, `WF-DRV-001` / `WF-FIN-001` = `PASS (static evidence)` per the release matrix |
| `E2E-002-forwarded-order.sh`     | `WF-FWD-001`                                           | route-locked forwarded-task visibility and no-owned-assignment guard   | `EXTERNAL-GATED`; live adapter proof remains external                                                                                                                                                                                        |
| `E2E-003` (manual only)          | `WF-COM-001`                                           | phone-order -> recording -> export boundary                            | `HOLD`; deferred pending live CTI and job activation                                                                                                                                                                                         |
| `E2E-004-tenant-attribution.sh`  | `WF-TEN-001`, `WF-ORD-001`                             | tenant creation, new-tenant booking, attribution, no cross-tenant leak | `PASS (live staging evidence)` via `FBP-014B`                                                                                                                                                                                                |

## Important Boundaries

- `E2E-001` and `E2E-004` are the release-grade live staging anchors.
- `E2E-002` is allowed to skip when no forwarded-task seed or adapter data is available.
- `E2E-003` is intentionally manual-only until CTI/recording/filing hooks are activated.
- The retired `apps/tenant-portal-web` shell is never a production verification target.

## Running

```bash
./tests/e2e/run-e2e.sh
./tests/e2e/run-e2e.sh --suite 001,004
./tests/e2e/run-e2e.sh --dry-run
```

Use a bare origin in `E2E_API_URL` and provide `E2E_AUTH_BEARER_TOKEN` when
staging ingress requires identity.
