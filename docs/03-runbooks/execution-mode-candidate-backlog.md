# Execution-Mode Candidate Backlog

Status: sections A and B were materialized in `ai-status.json` on
`2026-04-22`; `GAP-P2S3-001` is now closed on remote `main`; section C remains
candidate-only; `EMC-X1-001` is still partner-gated and `EMC-X1-002` now has
annex-audit evidence plus merged cross-repo landings; section D remains
intentionally out of scope

## Purpose

This runbook captures repo-scoped execution candidates that may be opened if the
team wants a new hardening / parity / evidence wave after the current closeout
cycle.

It exists to answer a narrower question than the master closeout checklist:

> Which remaining imperfections are real execution-mode candidates inside this
> repo, and which are external-gated or intentionally out of scope?

## Guardrails

- This document does **not** reopen current shared truth: `GAP-P2S3-001` is
  now closed on the protected control-plane path, and the visible remainder is
  external-gated or intentionally deferred rather than an active repo blocker.
- Current product-entry and receipt strategy is ratified by
  `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`.
- Current staged auth-cutover topology is ratified by
  `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`.
- The IDs below originated as candidate labels in this runbook.
- `EMC-H1-*`, `EMC-H2-001`, `EMC-W1-*`, and `EMC-I1-*` are now active
  execution-mode tasks in `ai-status.json`.
- `EMC-X1-*` remain unmaterialized until their partner or cross-repo
  dependencies are explicitly named and accepted.
- This draft assumes the current product strategy is **not** to build a
  first-party Passenger App / Web for the current execution mode. Passenger
  demand is expected to enter through third-party ride-hailing apps and partner
  channels instead of a DRTS-owned consumer app.
- Do not reopen first-party passenger-surface work unless product strategy
  changes explicitly.

## A. Materializable Repo-Only Candidates

These are good execution-mode candidates because they are primarily repo-local,
have clear evidence anchors, and do not require a new product-topology
decision.

### `EMC-H1-001` tenant-partner persistence hardening

- Type: hardening
- Objective: remove remaining demo-tenant / seed-first runtime posture and make
  tenant partner surfaces persistence-first for passengers, addresses, users,
  API keys, notifications, SLA, and webhook metadata.
- Primary anchors:
  - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
  - `support/sidecars/GAP-P2S1-010/GAP-P2S1-010-SIDECAR-ACCEPTANCE.md`
- Why it belongs in execution mode:
  - the surface already exists
  - the task is implementation hardening, not product discovery

### `EMC-H1-002` driver-profile persistence-first hardening

- Type: hardening
- Objective: remove seed profile fallback and make driver profile reads/writes
  persistence-first with explicit empty-state handling.
- Primary anchors:
  - `apps/api/src/modules/driver-profile/driver-profile.service.ts`
  - `tests/unit/driver-profile.test.ts`
- Why it belongs in execution mode:
  - the API and UI already exist
  - the gap is runtime truth hardening rather than missing surface design

### `EMC-H1-003` platform-earnings DB-backed aggregation hardening

- Type: hardening
- Objective: remove in-memory earnings fallback and require DB-backed
  aggregation as the normal runtime path.
- Primary anchors:
  - `apps/api/src/modules/platform-earnings/platform-earnings.service.ts`
  - `tests/unit/platform-earnings.test.ts`
- Why it belongs in execution mode:
  - the read model is already defined
  - the remaining work is persistence / aggregation hardening

### `EMC-H1-004` billing-settlement source-of-truth hardening

- Type: hardening
- Objective: remove demo-tenant and seeded settlement fallback from invoice,
  statement, reimbursement, and billing-profile flows where production truth is
  already expected.
- Primary anchors:
  - `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
  - `support/sidecars/MSC-F1-001/MSC-F1-001-FINANCE-REPORTING-AUDIT.md`
- Why it belongs in execution mode:
  - finance and reporting flows are already accepted as implemented baseline
  - remaining work is durability / truth hardening

### `EMC-H2-001` driver-task event bus externalization

- Type: runtime hardening
- Objective: replace the single-instance in-memory driver-task SSE fan-out with
  Redis / pub-sub or an equivalent external event bus.
- Primary anchors:
  - `apps/api/src/modules/owned-mobility/owned-mobility-task-events.service.ts`
  - `docs/00-context/current-system-blueprint-alignment-audit-20260421.md`
- Why it belongs in execution mode:
  - the functional flow already exists
  - the gap is horizontal-scale readiness

### `EMC-W1-001` ops-console driver earnings drilldown parity

- Type: workflow parity
- Objective: align the ops-console driver earnings workflow with the UAT wording
  that expects `Drivers -> select driver -> Earnings`.
- Primary anchors:
  - `apps/ops-console-web/app/drivers/page.tsx`
  - `apps/ops-console-web/app/revenue/page.tsx`
  - `support/sidecars/MSC-F1-001/MSC-F1-001-FINANCE-REPORTING-AUDIT.md`
- Why it belongs in execution mode:
  - the underlying finance data exists
  - the remaining gap is UI workflow parity, not domain design

### `EMC-W1-002` driver onboarding degraded-state hardening

- Type: workflow parity
- Objective: replace the current placeholder fallback path in driver onboarding
  with a formal degraded-state / provisioning / recovery UX.
- Primary anchors:
  - `apps/driver-app/app/onboarding.tsx`
  - `apps/driver-app/README.md`
- Why it belongs in execution mode:
  - the screen exists and connectivity checks already exist
  - the gap is polish and operational completeness

### `EMC-W1-003` public info publish identity hardening

- Type: authority hardening
- Objective: require identity-derived publisher actor information for public
  info publication and remove fallback trust in `command.publishedBy`.
- Primary anchors:
  - `apps/api/src/modules/platform-admin/platform-admin.service.ts`
  - `support/sidecars/GAP-SB-001/GAP-SB-001-SIDECAR-ACCEPTANCE.md`
- Why it belongs in execution mode:
  - the publish flow already exists
  - the gap is authority-hardening, not missing feature scope

## B. Repo-Executable But Evidence-Dependent Candidates

These can be opened in execution mode, but their final closeout still depends on
staging conditions, external systems, or live evidence.

### `EMC-I1-001` forwarded-order live-evidence expansion

- Type: integration evidence
- Objective: move forwarded-order proof from env-gated status toward repeatable
  live evidence where the environment permits.
- Primary anchors:
  - `tests/e2e/E2E-002-forwarded-order.sh`
  - `support/sidecars/MSC-I1-001/MSC-I1-001-INTEGRATION-HARDENING.md`
- External dependency:
  - seeded third-party forwarded tasks or partner test data

### `EMC-I1-002` phone-booking to compliance-export automation expansion

- Type: integration evidence
- Objective: automate more of the current manual-only phone booking to
  compliance export chain where repo-controlled pieces can be verified
  automatically.
- Primary anchors:
  - `apps/api/src/modules/callcenter/`
  - `apps/api/src/modules/reporting-filing/`
  - `support/sidecars/MSC-I1-001/MSC-I1-001-INTEGRATION-HARDENING.md`
- External dependency:
  - CTI session source and recording callback path remain environment-gated

## C. Candidate-Only Cross-Repo / External Work

These are real backlog candidates, but they should only be materialized with
the partner or cross-repo dependency stated up front.

### `EMC-X1-001` Grab Taiwan real adapter integration

- Type: partner integration
- Objective: replace the current stub adapter with a real partner-backed
  accept / reject / complete / heartbeat / earnings integration.
- Primary anchors:
  - `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts`
  - `apps/api/src/modules/forwarder/forwarder.service.ts`
- External dependency:
  - partner API contract, credentials, sandbox, and test evidence

### `EMC-X1-002` tenant-commute-hub authority annex remediation

- Type: cross-repo audit / remediation
- Objective: confirm the remote cutover landing, retire the now-superseded
  Supabase authority posture that used to exist on clean remote `main`, and
  close the tenant identity-bootstrap drift so `tenant-commute-hub` can be
  treated as a pure consumer of `drts-fleet-platform`.
- Current execution status on `2026-04-24`:
  1. PR `ajoe734/tenant-commute-hub#1` merged the tenant landing branch
     `feat/tenant-bff-foundation-landing-20260422` to remote `main`
  2. PR `ajoe734/drts-fleet-platform#1` merged the backend compatibility branch
     `fix/tenant-cross-repo-compat-20260423` to remote `main`
  3. targeted local live smoke passes end-to-end through the tenant landing
     branch plus local `drts-api`
  4. PR `ajoe734/tenant-commute-hub#3` merged the identity-hardening slice
     `feat/tenant-identity-hardening-20260424` to remote `main`
  5. PR `ajoe734/drts-fleet-platform#12` merged the companion backend auth
     alignment to remote `main`
  6. the former tenant identity-hardening remainder is therefore no longer a
     live code gap on remote `main`
- Primary anchors:
  - `docs/02-architecture/authority/rgx-010-tenant-commute-hub-authority-annex-audit-20260422.md`
  - `docs/02-architecture/authority/rgp-002-authority-map.md`
  - `docs/02-architecture/tenant-commute-hub-boundary.md`
- Cross-repo dependency:
  - optional fresh annex supplement if the team wants a current remote-main-only
    evidence packet after the historical split-state audit

## D. Do Not Materialize Under Current Strategy

These should **not** be turned into execution-mode work items unless the product
strategy changes.

### Passenger App / Web

- Do not open a first-party consumer app/web implementation slice for the
  current execution mode.
- Current working strategy: passenger demand should enter through third-party
  ride-hailing apps and partner channels instead of a DRTS-owned consumer app.

### Passenger receipt UI tied to a first-party passenger surface

- Do not open a passenger receipt UI slice as if it were a missing in-repo
  consumer workflow.
- Reopen only if product defines an alternative non-first-party delivery
  channel for receipts.

## E. Suggested Materialization Order

If the team wants a new repo execution wave, the recommended order is:

1. `EMC-H1-001` through `EMC-H1-004`
   - persistence / source-of-truth hardening first
2. `EMC-H2-001`
   - runtime scale hardening after persistence truth is stronger
3. `EMC-W1-001` through `EMC-W1-003`
   - workflow parity and authority hardening
4. `EMC-I1-001` and `EMC-I1-002`
   - expand live evidence and automation once the runtime baseline is firmer
5. `EMC-X1-001` and `EMC-X1-002`
   - only when external dependencies are explicitly in place

## F. Materialized On 2026-04-22

The following candidate families have now been materialized into the canonical
execution task board:

- `EMC-H1-001` through `EMC-H1-004`
- `EMC-H2-001`
- `EMC-W1-001` through `EMC-W1-003`
- `EMC-I1-001` and `EMC-I1-002`

These tasks now belong to supervisor-managed execution and are no longer merely
draft candidate labels.

## G. Relationship To Current Shared Truth

- `GAP-P2S3-001` is no longer the active blocker story.
- Nothing in this runbook should be read as reopening the closeout narrative by
  default.
- Use this file as the backlog source for any future expansion beyond the
  materialized repo-executable set above.
