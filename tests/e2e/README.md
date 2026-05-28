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
| `E2E-010-governance-aware-billing-reporting.sh` | `WF-FIN-GOV-001` (depends on `WF-TGV-001` + `WF-FIN-001`) | governed booking → quota → approval snapshot → approve → dispatch+driver completion → invoice/report (line bound to governed orderId) → settlement/platform-earnings → audited download (FG-08) → cross-tenant scope (FG-09) | `SHELL` driving FG-01..FG-09; hard-fails on cost-center drop, missing audit chain, missing invoice line for the governed orderId, or cross-tenant invoice scope widening. Verification-body enrichment fields may still record `NOT_POPULATED` in default mode until a governed staging rerun can pass `STRICT_VERIFICATION_BODY=1` |

## Important Boundaries

- `E2E-001` and `E2E-004` are the release-grade live staging anchors.
- `E2E-002` is allowed to skip when no forwarded-task seed or adapter data is available.
- `E2E-003-phone-recording-filing.sh` proves the repo-local phone-order/recording/export/filing chain in sandbox mode, but does not claim live CTI provider media, staging scheduler activation, or external retention execution.
- `E2E-010-governance-aware-billing-reporting.sh` is a SHELL: the uplift to `PASS (live staging evidence)` remains blocked until a governed staging rerun produces reviewer-readable invoice/report artifacts and a green `STRICT_VERIFICATION_BODY=1` result. Default-mode runs still record each verification-body field as a literal value or `NOT_POPULATED`; the script hard-fails on the contract regressions named in `FIN-GOV-SPEC-001`: cost-center attribution dropped from the booking read-back; driver lifecycle cannot reach completion after dispatch+assign accepted; invoice does not include the just-completed governed `orderId`; no `generate_tenant_invoice` audit entry for that invoice (FG-08); or a cross-tenant fetch of the invoice returns 2xx instead of 4xx (FG-09).
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
