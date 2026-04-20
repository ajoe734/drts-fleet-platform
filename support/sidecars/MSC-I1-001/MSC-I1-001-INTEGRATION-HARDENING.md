# MSC-I1-001 Integration Hardening Closeout

**Task:** `MSC-I1-001`  
**Owner:** `Codex2`  
**Reviewer:** `Codex`  
**Date:** `2026-04-20`  
**Status:** review approved; ready for done closeout

---

## Purpose

This packet closes the three acceptance questions on `MSC-I1-001`:

1. verify the critical cross-surface workflows still map to accepted APIs and read models
2. record any placeholder shell, mock-only path, or hidden manual dependency that still exists
3. produce a closeout note for the remaining integration and acceptance risk

This is a support-only closeout packet. It does not change canonical product truth.

---

## Evidence Sources

| Source                                                                                                                                                | Why it matters                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `docs/03-runbooks/master-system-closeout-checklist.md` §E                                                                                             | defines the integration and operational hardening closeout bar                 |
| `docs/03-runbooks/phase1-rollout.md`                                                                                                                  | documents rollout reality, manual rollout matrix, and staging evidence posture |
| `docs/04-uat/phase1-uat-scenarios.md` Overview and §5                                                                                                 | canonical cross-surface UAT and E2E inventory                                  |
| `docs/04-uat/fbp-014a-e2e-matrix.md` §§2-5                                                                                                            | guardrails, scenario chains, fixtures, and env-gated/manual split              |
| `support/sidecars/FBP-014/FBP-014-E2E-UMBRELLA-CLOSEOUT.md`                                                                                           | accepted umbrella decision for integrated E2E status                           |
| `support/sidecars/FBP-014A/FBP-014A-E2E-SCAFFOLD-EVIDENCE-PACK.md`                                                                                    | scaffold completeness and graceful-skip rules                                  |
| `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md`                                                                                            | live staging proof for `E2E-001` and `E2E-004`                                 |
| `support/sidecars/MSC-T1-001/MSC-T1-001-TENANT-SURFACE-CLOSEOUT.md`                                                                                   | tenant surface topology and external repo boundary closeout                    |
| `support/sidecars/MSC-F1-001/MSC-F1-001-FINANCE-REPORTING-AUDIT.md`                                                                                   | finance/reporting caveats that affect the end-to-end chain                     |
| `tests/e2e/run-e2e.sh`, `tests/e2e/E2E-001-enterprise-dispatch.sh`, `tests/e2e/E2E-002-forwarded-order.sh`, `tests/e2e/E2E-004-tenant-attribution.sh` | executable integration harness and scenario behavior                           |
| `tests/e2e/bootstrap.spec.ts`                                                                                                                         | shows Playwright/browser layer remains only a placeholder bootstrap            |
| `apps/api/src/modules/identity/identity.controller.ts`                                                                                                | current identity context and execution-mode exposure                           |
| `packages/contracts/src/index.ts`                                                                                                                     | current auth contract shape (`authMode: "bootstrap_headers"`)                  |
| `../tenant-commute-hub/src/App.tsx`, `../tenant-commute-hub/src/lib/drtsApi.ts`, `../tenant-commute-hub/src/lib/drts-shim/api-client.ts`              | current external tenant surface routes and backend-consumer wiring             |
| `apps/driver-app/README.md`, `apps/ops-console-web/README.md`                                                                                         | residual placeholder wording still present in local app docs                   |

---

## Closeout Answer

### 1. Critical cross-surface workflows still map to accepted APIs and read models

The repo has enough accepted integration proof to claim that the core Phase 1 cross-surface chain is real rather than only task-local:

| Workflow                                                                                    | Current anchor                                                     | Result                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------- |
| Tenant booking -> ops dispatch -> driver lifecycle -> tenant billing/audit                  | `FBP-014B` live run `874878` (`E2E-001`)                           | PASS                        |
| Platform-admin tenant create -> tenant booking -> ops attribution -> cross-tenant isolation | `FBP-014B` live run `874878` (`E2E-004`)                           | PASS                        |
| Tenant surface entry uses external `tenant-commute-hub` rather than retired local shell     | `MSC-T1-001`, `phase1-uat-scenarios.md`, `FBP-014A` guardrail `G1` | PASS                        |
| Billing and audit stay backend-owned in the integrated chain                                | `FBP-014`, `FBP-014B`, `MSC-F1-001`                                | PASS with caveats preserved |

The accepted live evidence is specific and sufficient:

- `E2E-001` proves a booking can become a dispatch job, produce a driver task, converge to `bookingStatusFinal=completed`, generate an invoice, and surface audit entries on staging runtime `drts-api-00016-s4v`.
- `E2E-004` proves the platform-admin tenant create -> tenant booking -> ops attribution chain and shows both list isolation and direct-detail isolation on live staging.
- The local `../tenant-commute-hub` checkout still exposes the actual tenant routes (`/booking-list`, `/bookings/new`, `/passengers`, `/addresses`, `/reports`, `/api-keys`, `/webhooks`, `/billing`, `/notifications`, `/sla`, `/users`, `/audit`) and consumes backend authority through shared API client calls under `/api/tenant/*`.

Conclusion: Wave-7-style integration is materially established for the owned enterprise-dispatch path and tenant attribution safety path.

### 2. Placeholder, env-gated, and manual dependencies still present

The closeout claim must still keep the following integration caveats explicit:

| Residual dependency / drift                                                         | Current evidence                                                             | Closeout interpretation                                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `E2E-002` forwarded-order mirror lifecycle is not live-proven in this closeout pass | `FBP-014`, `FBP-014A`, `tests/e2e/E2E-002-forwarded-order.sh`                | real env-gated dependency on seeded third-party forwarded tasks or live adapter data         |
| `E2E-003` phone booking -> compliance export remains manual-only                    | `fbp-014a-e2e-matrix.md` §4.3, `FBP-014` §5.3                                | real dependency on CTI session + recording callback webhook; not automated                   |
| Browser-layer Playwright suite is still only a bootstrap placeholder                | `tests/e2e/bootstrap.spec.ts`                                                | shell runner exists, but browser/UI-level integrated automation is not built out             |
| Staging/private ingress still uses bearer token plus bootstrap-style headers        | `FBP-014B` §2.2, `identity.controller.ts`, `packages/contracts/src/index.ts` | accepted for current evidence runs, but not the final auth-hardening end state               |
| Tenant external repo still uses bootstrap session construction and header injection | `../tenant-commute-hub/src/lib/drtsApi.ts`                                   | integration is wired to backend APIs, but the session/auth model is still bootstrap-oriented |
| Local app READMEs still describe Ops Console and Driver App as placeholder shells   | `apps/ops-console-web/README.md`, `apps/driver-app/README.md`                | documentation drift, not evidence that the operational routes are fake                       |
| Rollout beyond staging still depends on manual tenant/city/module matrix            | `phase1-rollout.md`, `FBP-013C`                                              | real operational dependency until full runtime flag-evaluation client slice lands            |

None of these caveats invalidate the accepted `E2E-001` / `E2E-004` evidence. They do mean the final narrative must not overstate the repo as fully automated or fully auth-hardened.

### 3. Remaining integration and acceptance risk

`MSC-I1-001` can close with the following narrow risk statement:

> The repo has live proof for the primary owned cross-surface workflow and for tenant attribution / cross-tenant safety, but it is not yet accurate to claim complete integration hardening across every Phase 1 operational path. Forwarded-order live proof remains environment-gated, CTI/compliance export remains manual-only, rollout expansion still needs the manual matrix, and auth/session wiring remains bootstrap-style pending the separate auth blocker closeout.

That risk statement is consistent with:

- `FBP-014` treating `E2E-001` and `E2E-004` as PASS, `E2E-002` as ENV-GATED, and `E2E-003` as MANUAL-ONLY
- `MSC-F1-001` preserving the finance/reporting caveats around passenger receipt deferral and the missing ops-console earnings path
- `phase1-rollout.md` explicitly holding pilot/production and keeping the manual rollout matrix in force
- the master closeout checklist, which distinguishes "integration hardening" from full operational completeness

---

## Findings

| Finding                                                                                        | Result                                               |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Core owned cross-surface happy path is live-proven on accepted staging runtime                 | PASS                                                 |
| Cross-tenant attribution and isolation are live-proven, not only statically asserted           | PASS                                                 |
| Production tenant entry remains the external `tenant-commute-hub`, not the retired local shell | PASS                                                 |
| No evidence shows billing or audit truth moved into a frontend-owned path                      | PASS                                                 |
| Forwarded-order mirror lifecycle is fully closed with live evidence                            | PARTIAL - env-gated                                  |
| Phone booking to compliance export is automation-complete                                      | PARTIAL - manual-only                                |
| Current auth/session posture is production-complete                                            | PARTIAL - bootstrap-style wiring remains             |
| Local documentation accurately reflects the maturity of all integrated surfaces                | PARTIAL - placeholder wording remains in app READMEs |

---

## Closeout Statement

`MSC-I1-001` can be closed from an integration-hardening perspective once reviewer confirmation is complete.

The repo can support this bounded claim:

> Phase 1 critical cross-surface integration is substantiated for the accepted owned happy path and tenant isolation path, with remaining caveats explicitly limited to env-gated forwarded-order evidence, manual-only CTI/compliance flow, bootstrap-style auth/session posture, and rollout/manual-matrix dependencies already tracked elsewhere.

What remains is real, but outside this task's acceptance bar:

- auth hardening and production auth replacement under `GAP-P2S3-001`
- final closeout narrative synchronization under `MSC-N1-001`
- any future live-proof expansion for forwarded adapters or CTI-backed flows
- optional cleanup of stale placeholder wording in local app READMEs

---

## Reviewer Notes

Please verify:

1. the packet does not over-claim beyond the accepted `FBP-014` umbrella verdict
2. the residual-risk section preserves the real ENV-GATED / MANUAL-ONLY split instead of silently collapsing it into PASS
3. the auth/bootstrap caveat is framed as an integration-hardening limitation, not as a contradiction of the accepted live staging evidence
4. the placeholder README wording is correctly treated as documentation drift rather than a reopened product-semantic blocker
