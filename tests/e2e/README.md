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

| Scenario                            | Workflow families                                      | Gate role                                                              | Current read                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-001-enterprise-dispatch.sh`    | `WF-ORD-001`, `WF-DSP-001`, `WF-DRV-001`, `WF-FIN-001` | owned booking -> dispatch -> driver -> billing/audit continuity        | live staging evidence contributes to all four families via `FBP-014B`; final family reads remain `WF-ORD-001` / `WF-DSP-001` = `PASS (live staging evidence)`, `WF-DRV-001` / `WF-FIN-001` = `PASS (static evidence)` per the release matrix |
| `E2E-002-forwarded-order.sh`        | `WF-FWD-001`                                           | route-locked forwarded-task visibility and no-owned-assignment guard   | `EXTERNAL-GATED`; live adapter proof remains external                                                                                                                                                                                        |
| `E2E-003-phone-recording-filing.sh` | `WF-COM-001`, `WF-FIN-001`                             | call session -> phone order -> recording callback -> export -> filing  | `PASS (sandbox evidence)` for repo-local automation; live CTI/provider activation and staging job ownership still remain explicit external/deferred gates                                                                                    |
| `E2E-004-tenant-attribution.sh`     | `WF-TEN-001`, `WF-ORD-001`                             | tenant creation, new-tenant booking, attribution, no cross-tenant leak | `PASS (live staging evidence)` via `FBP-014B`                                                                                                                                                                                                |
| `E2E-010-governance-aware-billing-reporting.sh` | `WF-FIN-GOV-001` (depends on `WF-TGV-001` + `WF-FIN-001`) | governed booking → quota → approval snapshot → approve → dispatch+driver completion → invoice generation → audit row → report export → verification-body field assertion on the billing record | hard-fails on missing seed (no silent passes) and on any of the 13 directive §H verification-body keys being absent from the billing record (per spec §6); `PASS (static evidence)` until executed against a governed staging rerun for `PASS (live staging evidence)` |

## Important Boundaries

- `E2E-001` and `E2E-004` are the release-grade live staging anchors.
- `E2E-002` is allowed to skip when no forwarded-task seed or adapter data is available.
- `E2E-003-phone-recording-filing.sh` proves the repo-local phone-order/recording/export/filing chain in sandbox mode, but does not claim live CTI provider media, staging scheduler activation, or external retention execution.
- `E2E-010-governance-aware-billing-reporting.sh` follows the same hard-fail discipline as the other E2E scripts. It hard-asserts every directive §H verification-body key is present on the billing record (`has(<key>)` per `REQUIRED_KEYS`) and exits non-zero on any missing key. Repo-only execution serves as `PASS (static evidence)`; `PASS (live staging evidence)` requires running the script against a governed staging rerun, currently blocked by the IAP credential / ingress gate documented in `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` §4.
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
