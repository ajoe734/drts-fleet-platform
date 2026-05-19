# Tenant Governance Workflow Release-Gate Runbook

Last updated: 2026-05-19
Task ref: `TGV-RUNBOOK-001`
Workflow family: `WF-TGV-001`
Owner: `Codex`
Reviewer: `Claude2`

This runbook operationalises the release-gate language for the tenant
governance workflow family. It is the named companion for `WF-TGV-001` in
`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` and consolidates
the backend contract wave (`BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`,
`BE-APR-001`), the dedicated negative-path pack (`E2E-005`), and the
governance observability contract (`OBS-GOV-001`).

Current accepted posture on 2026-05-19 is:

- `WF-TGV-001` = `PASS (static evidence)`
- release bucket = `static; staging-ready`
- dedicated shell negative-pack coverage is named separately under `E2E-005`

This document defines what that verdict means, what it does not mean, and how
to refresh it to a fresh live staging read without over-claiming production
readiness.

## Scope

This runbook is bounded to:

- tenant cost-center directory validation and booking enforcement
- approval-rule evaluation and governance-sensitive re-evaluation
- quota policy, ledger, monthly snapshots, and atomic reservation behavior
- approval-request lifecycle, rejection, manual escalation, and admin visibility
- cross-console governance surfaces in tenant, ops, and platform-admin views
- governance audit events, metric namespace, dashboard panels, and alert rules

It is not in scope to:

- claim a production rollout or tenant-by-tenant cutover approval
- close governance-aware billing/reporting follow-up work (`BE-FIN-CC-001`,
  `BE-FIN-APR-001`, `BE-FIN-FWD-001`)
- overstate forwarded-order, CTI/recording, or partner-issuer external proof
- claim that Phase 1 ships true sequential `ordered_chain` execution or an
  automated approval-timeout cron; both remain documented Phase 1 limits

## Binding Gate Posture

Use the status vocabulary from
`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` exactly.

| Gate layer | Required posture | Meaning | Must not claim |
| ---------- | ---------------- | ------- | -------------- |
| `WF-TGV-001` baseline row | `PASS (static evidence)` | Backend contracts, tenant UI, ops UI, and platform-admin governance surfaces are all named and reviewable against canonical backend truth. | A fresh live rerun or production sign-off. |
| ORX-GV-001 negative-path expansion | `PASS (repo-local)` | Governance failures are named, fail closed, and are backed by repo-local automated evidence. | Tenant-specific rollout approval or live sandbox proof by itself. |
| `OBS-GOV-001` observability watch | ready | Summary endpoint, metric namespace, dashboard panels, and alert rules exist and are reviewable. | A separate human paging/on-call staffing approval. |
| Optional live staging refresh | `PASS (live staging evidence)` only after rerun | `E2E-005` is replayed on staging, evidence is captured, and the gate row/dashboard are refreshed from that evidence. | That repo-local or static evidence alone counts as a live replay. |

If the live staging refresh is not performed, release language must stay at
`PASS (static evidence)` even when all repo-local tests are green.

## Required Evidence Pack

The release gate is only valid if each slice below has a named evidence anchor.

| Slice | What must be true | Required anchors |
| ----- | ----------------- | ---------------- |
| `BE-CC-001` cost-center authority | Tenant bookings validate against the tenant-owned directory; unknown, disabled, and cross-tenant cost centers fail closed. | `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md` §2.1; `docs/04-uat/fbp-014a-e2e-matrix.md` §4.5 cases A-C; `tests/integ/tenant-governance-negative.test.ts`; `tests/e2e/E2E-005-tenant-governance.sh` |
| `BE-RULE-001` rule evaluation | Approval rules evaluate against canonical fields only; governance-sensitive updates cancel/replace stale approvals, while notes-only updates do not. | `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md` §2.1; `docs/04-uat/fbp-014a-e2e-matrix.md` §4.5 cases E, G, H; `apps/api/tests/integration/tenant-governance-e2e.test.ts`; `tests/integ/tenant-governance-negative.test.ts` |
| `BE-QUOTA-001` quota enforcement | Hard-block quota exhaustion fails closed, atomic reservation leaves no residue on denied flows, and last-unit races do not double-spend quota. | `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md` §2.1-2.2; `docs/04-uat/fbp-014a-e2e-matrix.md` §4.5 cases D, F; `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts`; `tests/integ/tenant-governance-negative.test.ts`; `docs/04-api/audit-event-taxonomy.md` (`tenant.quota_reservation.blocked`) |
| `BE-APR-001` approval workflow | Approval requests, decisions, rejection, and manual escalation are visible and block dispatch when governance says they must. | `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md` §2.1-2.4; `docs/04-uat/fbp-014a-e2e-matrix.md` §4.5 cases I, J; `apps/api/src/modules/platform-admin/tenant-governance.controller.ts`; `tests/e2e/E2E-005-tenant-governance.sh` |
| `E2E-005` negative-path pack | Cases A-J are named with pass criteria and audit evidence capture rules. | `docs/04-uat/fbp-014a-e2e-matrix.md` §4.5; `tests/e2e/E2E-005-tenant-governance.sh`; `tests/integ/tenant-governance-negative.test.ts` |
| `OBS-GOV-001` observability | Platform/admin operators can see governance summary state, metrics export exists, and the five release-relevant alert rules are documented. | `docs/03-runbooks/operational-observability-alert-runbook.md` (`Tenant Governance Alerts`); `apps/api/src/modules/platform-admin/tenant-governance.controller.ts`; `docs/05-ui/phase1-business-flow-integration-rebuttal-20260516-closeout.md` §1 (`ADM-UI-GOV-001`) |

## Release-Gate Procedure

### 1. Static evidence review

Before any release statement, confirm all of the following:

1. `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` still reads
   `WF-TGV-001` as `PASS (static evidence)`.
2. `docs/04-uat/phase1-business-flow-verification-dashboard-20260519.md`
   still treats tenant governance as `static; staging-ready`.
3. `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md` still names
   `BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`, `BE-APR-001`, `BE-INTEG-001`,
   and `OBS-GOV-001` as shipped evidence, not as open design intent.
4. No release note silently upgrades the posture to `PASS (live staging
   evidence)` unless `E2E-005` has been rerun on staging and evidence has been
   captured.
5. Phase 1 limits remain explicit:
   - `ordered_chain` currently executes as `all_of_parallel`
   - approval timeout auto-cron remains deferred; only manual escalation is
     shipped
   - governance-aware billing/reporting follow-up work remains outside this gate

### 2. Repo-local verification

Run the repo-local checks below before claiming the workflow family is still
releaseable on the candidate commit:

```bash
pnpm --filter @drts/api exec vitest run \
  tests/integration/tenant-governance-e2e.test.ts \
  tests/load/tenant-quota-concurrent-reserve.test.ts \
  tests/unit/owned-mobility.service.test.ts \
  tests/unit/tenant-partner.service.test.ts

pnpm --filter @drts/api test:tenant-governance-negative

bash -n tests/e2e/E2E-005-tenant-governance.sh

bash tests/e2e/run-e2e.sh --suite 005 --dry-run
```

Expected interpretation:

- unit/integration/load coverage keeps the static gate reviewable
- `test:tenant-governance-negative` keeps the ORX-GV-001 negative-path claim
  alive
- `bash -n` plus `--dry-run` proves the shell harness is still executable and
  wired

If any check fails, the workflow family is no longer releasable until the
failure is resolved or explicitly downgraded in the gate row.

### 3. Optional live staging refresh

Use this path only when leadership wants a fresh staging replay instead of
accepting the static-evidence gate.

1. Point the E2E harness at staging using the standard environment variables
   for `tests/e2e/run-e2e.sh`.
2. Run `bash tests/e2e/run-e2e.sh --suite 005`.
3. Preserve the evidence output, including each captured `auditId`.
4. Accept bounded skips only if the evidence log records the exact
   environmental reason.
5. Refresh the gate row/dashboard only after the captured evidence has been
   reviewed.

The live replay passes only if all of the `E2E-005` matrix criteria hold:

1. Cases A through J pass live or carry an explicit bounded skip reason.
2. Every denied path records machine-readable audit evidence.
3. The no-approver path does not increase quota-ledger count.
4. Governance-sensitive field changes rotate approval requests; notes-only
   changes do not.
5. Rule-blocked or rejected bookings do not dispatch.
6. Manual escalation remains visible from
   `GET /api/admin/tenant-governance/summary`.

If the live rerun is skipped, incomplete, or only partially reviewable, keep
the gate language at `PASS (static evidence)`.

## Observability Watch

`OBS-GOV-001` is part of the release gate, not an afterthought. The reviewer
must be able to point at both the summary surface and the alert contract.

### Summary surface

- `GET /api/admin/tenant-governance/summary`
- Platform Admin `tenant-governance` monitoring page
- Ops approval queue and tenant governance summary counts

### Metrics and alerts

| Alert | Trigger | Release implication |
| ----- | ------- | ------------------- |
| `TenantGovernanceQuotaUsageHigh` | quota usage above 95% for 10 minutes | Do not treat high-volume tenants as stable until quota ownership or enforcement mode is confirmed. |
| `TenantGovernancePendingApprovalP95AgeHigh` | p95 pending approval age above 24h for 15 minutes | Approval workflow is drifting; confirm approver routing before sign-off. |
| `TenantGovernancePendingApprovalOldestCritical` | oldest pending approval age above 48h for 15 minutes | Treat as an on-call blocker; stale approvals must not be normalized into release acceptance. |
| `TenantGovernanceEvaluatorLatencyHigh` | evaluator p95 above 200ms for 10 minutes | Rule evaluation may be degrading the booking path; inspect before release. |
| `TenantGovernanceQuotaRaceFailuresHigh` | more than 10 `QUOTA_INSUFFICIENT_AT_COMMIT` race failures per minute for 5 minutes | Confirm whether the race is expected demand pressure or a quota/ledger defect before sign-off. |

Supporting panels must include at least:

- pending approvals + p95 age
- quota usage by tenant
- evaluator latency p50/p95/p99
- ledger writes per second
- race failures per minute
- validation rejects per minute by cost-center error code

## No-Go Conditions

Do not clear the workflow family if any of the following is true:

- unknown, disabled, or cross-tenant cost centers are accepted
- hard-block quota exhaustion fails without `tenant.quota_reservation.blocked`
  evidence
- the no-resolvable-approver path consumes quota or creates a dispatchable
  booking
- governance-sensitive updates fail to rotate approval requests
- notes-only updates rotate approval requests
- a rejected or rule-blocked booking still dispatches
- manual escalation is absent from the governance summary surface
- the `tenant_governance_*` metrics or alert inventory are missing or stale
- release wording says "live" when the actual evidence is still static or
  repo-local only

## Allowed Release Language

Allowed:

- "`WF-TGV-001` is `PASS (static evidence)`; `BE-CC-001` / `BE-RULE-001` /
  `BE-QUOTA-001` / `BE-APR-001`, `E2E-005`, and `OBS-GOV-001` are all named
  and reviewable."
- "Tenant governance is staging-ready, but the current gate does not claim a
  fresh live replay."

Not allowed:

- "Tenant governance is live-proven" without a reviewed staging replay of
  `E2E-005`
- "All governance work is production-ready" when the gate is only static
  evidence
- "Quota and approval are done" without also naming the admin monitoring and
  audit visibility requirements

## Reference Anchors

- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md`
- `docs/03-runbooks/operational-observability-alert-runbook.md`
- `docs/04-uat/fbp-014a-e2e-matrix.md`
- `docs/04-uat/phase1-business-flow-verification-dashboard-20260519.md`
- `docs/05-ui/phase1-business-flow-integration-rebuttal-20260516.md`
- `docs/05-ui/phase1-business-flow-integration-rebuttal-20260516-closeout.md`
- `apps/api/src/modules/platform-admin/tenant-governance.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/tests/integration/tenant-governance-e2e.test.ts`
- `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts`
- `tests/integ/tenant-governance-negative.test.ts`
- `tests/e2e/E2E-005-tenant-governance.sh`
