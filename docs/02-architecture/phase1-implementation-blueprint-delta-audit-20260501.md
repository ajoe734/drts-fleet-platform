# Phase 1 Implementation vs Full Operational Blueprint Delta Audit

Generated: 2026-05-01  
Scope: `drts-fleet-platform` plus sibling repo `tenant-commute-hub`  
Method: compare the accepted SA / SD / remediation blueprint against current code, task truth, workflow gates, UAT artifacts, Git state, and cross-repo state.

## 1. Executive Read

The implementation wave is now materially different from the 2026-04-30 audit.
The local `drts-fleet-platform` task board now reports `249/249 done`, the
`main` branch is synced with `origin/main`, and the repo-local ORX operational
remediation sweep has landed.

That does **not** mean the full system blueprint is production-complete. The
remaining delta has shifted from "active implementation tasks are open" to four
other categories:

1. **External-gated integrations** still block full live closure: real
   bank / issuer eligibility credentials, real Grab Taiwan or equivalent
   adapter proof, mobile distribution inputs, and live CTI / recording / filing
   activation.
2. **Release evidence is not fully synchronized**: `ai-status.json` says all
   tasks are done, but `current-work.md`, `docs-site/ai-status.json`, the UAT
   checklist, and workflow release gates still contain stale / unchecked /
   pending rows.
3. **Runtime durability is environment-dependent**: the API has migrations and
   repositories, but many services still permit in-memory / seed-backed runtime
   behavior when `DATABASE_URL` is absent. This is acceptable for local/demo, but
   it is not a production-closeout claim by itself.
4. **Cross-repo closure is not clean**: `tenant-commute-hub` exists locally and
   is not ahead/behind its remote, but it has uncommitted changes in its contract
   snapshot and tenant pages. The SD explicitly treats that repo as part of the
   Phase 1 surface, so this is a real closeout gap.

Bottom line:

- **Repo-local implementation status:** substantially complete.
- **Task-board status:** `ai-status.json` says complete.
- **Full operational blueprint status:** not fully complete until external
  gates, release/UAT evidence sync, tenant repo closure, and production
  deployment assumptions are resolved.

## 2. Sources Checked

Primary blueprint and planning:

- `phase1_system_analysis_v1.md`
- `docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md`
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`
- `docs/02-architecture/phase1-role-scenario-and-negative-flow-matrix-20260430.md`
- `docs/02-architecture/phase1-operational-complete-remediation-plan-20260430.md`
- `docs/03-runbooks/phase1-operational-remediation-execution-packet-20260430.md`

Execution and status:

- `ai-status.json`
- `current-work.md`
- `docs-site/ai-status.json`
- `docs-site/current-work.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/04-uat/phase1-uat-checklist.md`
- `docs/04-uat/phase1-uat-scenarios.md`

Implementation evidence:

- `apps/api/src/modules/**`
- `apps/platform-admin-web/app/**`
- `apps/ops-console-web/app/**`
- `apps/driver-app/app/**`
- `apps/driver-app/lib/**`
- `apps/tenant-portal-web/app/**`
- `packages/contracts/src/**`
- `packages/api-client/src/**`
- `infra/migrations/**`
- `tests/**`
- `apps/api/tests/unit/**`
- `apps/driver-app/tests/unit/**`
- sibling repo `/home/edna/workspace/tenant-commute-hub`

## 3. Current Git / Machine Truth Snapshot

### 3.1 `drts-fleet-platform`

- Branch: `main...origin/main`
- Ahead / behind: `0 / 0`
- Working tree at audit start: clean
- Latest commit at audit start: `8c9d94a fix(driver-app): add secure-store lockfile entry`
- Task count from `ai-status.json`: `249`
- Task status counts from `ai-status.json`: `done = 249`
- `ai-status.json.updated_at`: `2026-05-01T00:55:05Z`

### 3.2 Internal status drift

`ai-status.json` and `current-work.md` disagree:

| File                       | Observed status                                                | Meaning                                                        |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `ai-status.json`           | `249/249 done`                                                 | Machine task board says the implementation wave is closed.     |
| `current-work.md`          | still shows `ORX-GV-003 review_approved` and a pending handoff | Human-readable generated summary is stale.                     |
| `docs-site/ai-status.json` | `248 done`, `1 review_approved`                                | Dashboard artifact is stale relative to root `ai-status.json`. |

This is no longer a functional code gap, but it is a release-governance gap:
operators reading the wrong status artifact can still get the wrong answer.

### 3.3 `tenant-commute-hub`

The sibling repo is present at `/home/edna/workspace/tenant-commute-hub`.

- Branch: `main...origin/main`
- Ahead / behind: `0 / 0`
- Working tree: dirty
- Uncommitted diff: 11 files, `1433 insertions`, `34 deletions`

Changed files include:

- `README.md`
- `scripts/sync-drts-contract-snapshot.mjs`
- `src/lib/drts-shim/api-client.ts`
- `src/lib/drts-shim/generated/index.ts`
- `src/lib/drts-shim/generated/platform-codes.ts`
- `src/lib/drts-shim/generated/platform-earnings.ts`
- `src/lib/drts-shim/generated/platform-presence.ts`
- `src/pages/AddressManagement.tsx`
- `src/pages/AdminPanel.tsx`
- `src/pages/NewBooking.tsx`
- `src/pages/PassengerManagement.tsx`

Because the SD says `tenant-commute-hub` is the tenant / partner frontend
consumer, this uncommitted state means the cross-repo delivery is not clean even
though the core repo is clean.

## 4. High-Level Completion By Work Package

| Work Package                          | Blueprint intent                                                       | Current repo-local status                                                                                | Remaining delta                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A. Identity and entry                 | Separate platform / ops / tenant / partner / driver auth and lifecycle | Implemented baseline with control-plane auth, tenant / partner bootstrap, and driver device registration | Local/bootstrap fallbacks must remain explicitly non-production; tenant repo snapshot dirty.                    |
| B. Master data and onboarding         | Driver, vehicle, tenant, partner, bank entry lifecycle                 | Strong repo baseline across platform admin, regulatory registry, driver profile, tenant-partner          | Live data onboarding, real partner credentials, and tenant repo commit/push still open.                         |
| C. Intake channels                    | Tenant, partner, phone, forwarder order intake                         | Owned, phone, partner eligibility, and forwarder mirror APIs exist                                       | CTI / recording, real issuer, and real forwarder remain gated.                                                  |
| D. Dispatch and redispatch            | Queue families, assignment, redispatch, exception hold, map            | Implemented baseline with APIs, ops UI, stale-location/no-location handling                              | UAT checklist and release gate still show pending / unchecked negative-path rows.                               |
| E. Driver fulfillment and proof       | Task lifecycle, proof bundle, offline replay                           | Implemented baseline in driver app, API, tests                                                           | Native distribution and live mobile release inputs are external-gated.                                          |
| F. Complaint / incident / escalation  | Complaint, incident, service recovery, dispatch-exception handoff      | Implemented baseline with incident and complaint APIs / UI / tests                                       | Release evidence is static/repo-local; operational sign-off still needs synchronization.                        |
| G. Finance / reconciliation           | Settlement matrix, dispute queue, artifact control                     | Implemented baseline with reconciliation issue queue and artifact governance                             | Report/export and period jobs have static / hold evidence; production artifact store remains a deployment gate. |
| H. Reporting / audit / retention      | Evidence policy, legal hold, audit trace, filing                       | Implemented baseline in API and admin surfaces                                                           | Live CTI / filing activation and object-retention proof remain hold / deployment gates.                         |
| I. Integrations                       | Tenant API, webhooks, partner API, issuer, forwarder                   | Tenant webhooks and partner/forwarder scaffolding exist                                                  | Real issuer and forwarder credentials/adapters are external-gated.                                              |
| J. Map / realtime visualization       | Spatial truth and operator map board                                   | MVP exists with heartbeat and stale/no-location states                                                   | Rich map-first dispatch and live operational map evidence remain P1/P2.                                         |
| K. Runbook / ownership / release gate | Owner routes, gates, release language                                  | Many runbooks exist                                                                                      | Release/UAT artifacts are stale or unchecked in several places.                                                 |
| L. UAT / negative-path coverage       | Positive and negative workflows verified                               | Large UAT inventory and tests exist                                                                      | Checklist remains mostly unchecked; some gates still `PENDING`, `HOLD`, or `EXTERNAL-GATED`.                    |

## 5. Blueprint Delta By The 29 SD Categories

Legend:

- `Repo-complete`: core code, UI/API, task-board status, and repo-local tests or evidence exist.
- `Partial`: implementation exists but evidence, durability, UX completeness, or sync remains incomplete.
- `External-gated`: repo can only scaffold; live closure depends on outside systems.
- `Deferred`: intentionally outside the current Phase 1 completion claim.
- `Governance gap`: code may exist, but release/source-of-truth artifacts are inconsistent.

|   # | Blueprint area                                 | Current implementation evidence                                                                                                                     | Remaining delta vs full blueprint                                                                                                                            | Status             |
| --: | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
|   1 | Identity and entry                             | `auth`, `identity`, control-plane auth package, tenant / partner bootstrap sessions, driver device registration, negative-path tests                | Bootstrap/local fallback must remain non-production; tenant repo contract snapshot is dirty; docs-site status stale                                          | Partial            |
|   2 | Driver master and device binding               | `driver-profile`, `auth/driver-device-session`, platform admin driver/fleet surfaces, driver app onboarding, ORX-ID/MD tasks done                   | Device session binding is held in service memory; production-grade durable registration invitation / binding store still needs deployment-level confirmation | Partial            |
|   3 | Partner / bank program onboarding              | Platform admin partners page, `tenant-partner` partner/program/entry APIs, partner credential issue/revoke, registry and eligibility migrations     | Real issuer/bank contract, sandbox credentials, allowed test cards, and bank-specific production branding remain outside repo                                | External-gated     |
|   4 | Third-party API / forwarder integration        | `forwarder` module, adapter interface, Grab Taiwan stub, sync-failed/manual-fallback/reconciliation flows, driver route-lock semantics              | Real Grab Taiwan or equivalent adapter proof is absent; E2E-002 can gracefully skip without live adapter data                                                | External-gated     |
|   5 | Phone order and call center loop               | `callcenter` module, call session, recording callback, callback tasks, phone order link, transfer to complaint / incident, ops UI                   | Live CTI screen-pop, recording provider, recording export, and month-end filing activation remain `HOLD`                                                     | Partial            |
|   6 | Queue, dispatch, redispatch rules              | `owned-mobility` dispatch APIs, queue families, assign/reassign, timeout, no-supply, override request/approve/reject, ops dispatch UI               | Workflow release gates still list dispatch negative-path rows as `PENDING`; UAT checklist rows remain unchecked                                              | Governance gap     |
|   7 | Map and realtime location                      | Driver heartbeat, `ops.phase1_driver_locations`, ETA endpoint, ops map board MVP, stale/no-location states                                          | Rich map-first operations and live map evidence are still P1/P2, not full blueprint completion                                                               | Partial            |
|   8 | Recording / proof / eligibility gates          | Compliance gate contracts, proof bundle validation, driver completion proof, partner eligibility manual review, recording states                    | CTI recording and filing proof remain hold/external; eligibility real issuer proof is external-gated                                                         | Partial            |
|   9 | Finance / settlement / reconciliation          | Billing-settlement module, channel-aware matrix, reconciliation issues, assignment/comment/resolve/reopen, payments/revenue UI, artifact governance | Finance negative-path release gate still shows `PENDING`; production artifact store and live report/export evidence are not fully closed                     | Governance gap     |
|  10 | Tenant onboarding and rollout gate             | Platform admin tenant console, onboarding/rollout/role invite/rollback/suspend APIs, tenant runbook                                                 | Future tenant-by-tenant sign-off remains outside repo; `tenant-commute-hub` local changes are uncommitted                                                    | Partial            |
|  11 | Supply pool lifecycle                          | Regulatory registry vehicles/drivers/contracts/policies/exclusivity/offboarding, ops/admin vehicle surfaces                                         | Demo/reference seeds are present; live fleet data completeness and import execution remain deployment/ops work                                               | Partial            |
|  12 | Reservation vs realtime rules                  | Reservation hold statuses, queue entry policy, dispatch state transitions, override/exception hold mechanics                                        | UAT evidence remains unchecked; release gate needs sync after ORX completion                                                                                 | Governance gap     |
|  13 | Passenger / address master governance          | Tenant passenger/address APIs, tenant portal pages, contract snapshot types                                                                         | First-party passenger app/web and passenger receipt UI are intentionally deferred; tenant repo passenger/address changes are uncommitted                     | Deferred / Partial |
|  14 | Pricing authority and manual fare override     | Platform pricing, manual fare override API, actor/reason requirements, dispatch trace/audit semantics                                               | Deeper pricing governance and production pricing approval workflow remain later hardening                                                                    | Partial            |
|  15 | Complaint / incident / escalation              | Complaint taxonomy/reopen/SLA, incident creation/update/timeline, service recovery, dispatch-exception handoff, ops UI                              | Code baseline landed, but operational sign-off and UAT status are not synchronized                                                                           | Partial            |
|  16 | Tenant API / webhook governance                | Tenant API keys, webhook CRUD, secret rotation, delivery records, HMAC/retry service, tenant portal surfaces                                        | Real webhook delivery operations, alerting, and tenant repo commit/push remain open                                                                          | Partial            |
|  17 | Control-plane vs business-plane auth boundary  | Auth matrix, control-plane route policies, server-issued bearer behind IAP, partner/tenant/driver separated contexts                                | Need continuous release wording discipline so local/direct fallback is not misread as production auth                                                        | Partial            |
|  18 | Dual repo authority drift                      | Cross-repo gap matrix, managed contract snapshot, tenant hub shim sync script                                                                       | `tenant-commute-hub` dirty working tree is direct evidence of unresolved cross-repo sync closeout                                                            | Governance gap     |
|  19 | Tests / acceptance / E2E                       | Unit, smoke, E2E scripts, UAT docs, sidecars, 642 test declarations across test files                                                               | Full test suite was not rerun during this audit; UAT checklist has 144 unchecked marks; E2E-002/E2E-003 have live/external conditions                        | Partial            |
|  20 | Observability / alerts                         | Operational observability service, health/admin surfaces, observability runbook, alert keys                                                         | Production pager/SLO routing and live alert operations are not fully proven                                                                                  | Partial            |
|  21 | NFR / capacity / retention                     | Rate limiting, migrations, rollout docs, retention policies                                                                                         | Capacity/load testing and production retention execution remain weaker than feature coverage                                                                 | Partial            |
|  22 | Sensitive data / masking / secret policy       | Sensitive-data governance matrix, masking rules, artifact access controls, evidence policy, audit routes                                            | Deployment secret hygiene and real object/access policy enforcement remain operational gates                                                                 | Partial            |
|  23 | Retention / legal hold / evidentiary access    | Legal hold APIs, deletion exception APIs, evidence governance, audit/admin surfaces                                                                 | Real storage retention / evidentiary access integration remains deployment/legal gate                                                                        | Partial            |
|  24 | Internationalization / multilingual operations | ORX-GV-003 done; localized labels exist across admin/ops/driver/tenant surfaces                                                                     | Dashboard/status artifacts are stale; tenant repo uncommitted changes include generated snapshot and UI surfaces                                             | Governance gap     |
|  25 | Docs / decisions / backlog sync                | SA/SD/remediation/runbooks/task board exist; `ai-status.json` is all done                                                                           | `current-work.md`, `docs-site/ai-status.json`, UAT checklist, and release gate matrix are not aligned with all-done status                                   | Governance gap     |
|  26 | Data model and event boundary                  | Contracts centralize state machines; migrations V0011-V0022; repositories exist for many runtime domains                                            | `DATABASE_URL` optionality means services can still run in memory; production must prove DB-enabled boot and persistence                                     | Partial            |
|  27 | Channel marking and source-aware lifecycle     | Owned / phone / partner / forwarder source marking, channel-aware settlement, source-aware reporting                                                | Real external channel confirmation for issuer/forwarder remains gated                                                                                        | External-gated     |
|  28 | Human operation vs automation boundary         | Actor/reason/audit patterns, override workflow, manual fallback queues, chairman/supervisor closeout SOP                                            | Operator sign-off and release gate rows still need synchronization; automation state moved faster than dashboard docs                                        | Governance gap     |
|  29 | Future extension hooks                         | Feature gates, platform code registry, AV/future hooks, deferred scope decisions                                                                    | Future hooks are intentionally not product-complete and should not be claimed as Phase 1 delivery                                                            | Deferred           |

## 6. Highest-Risk Remaining Deltas

### 6.1 Release truth is split across artifacts

The root task board says done, but generated/status documents still disagree.
This matters because the team has been using status files as operational truth.

Current split:

- Root `ai-status.json`: all done.
- `current-work.md`: still shows active `ORX-GV-003`.
- `docs-site/ai-status.json`: still has one `review_approved`.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`: still has
  `PENDING (ORX-GV-001 rows)` in several negative-path gates.
- `docs/04-uat/phase1-uat-checklist.md`: still has 144 unchecked markers.

Required closure:

- regenerate or patch `current-work.md` and docs-site status from the root
  machine truth;
- update release gate rows after ORX completion, or explicitly keep them pending
  with a reason;
- separate "automated/static evidence exists" from "human UAT checkbox signed".

### 6.2 `tenant-commute-hub` is not clean

The core repo can be clean and pushed while the full system is still not clean,
because the accepted topology has two repos:

- `drts-fleet-platform`: business authority.
- `tenant-commute-hub`: tenant / partner frontend consumer.

The tenant repo currently has uncommitted contract snapshot and UI changes. That
is a direct gap against the SD's dual-repo authority guardrail.

Required closure:

- inspect the tenant diff;
- run tenant build/typecheck;
- commit and push those changes, or explicitly discard them if they are
  generated noise;
- record the synced contract snapshot version.

### 6.3 External-gated integrations remain real blockers

These are not developer TODOs in the core repo:

- real bank / issuer API contract;
- issuer sandbox credentials and allowed test cards;
- real Grab Taiwan or equivalent forwarder adapter credentials and callback
  proof;
- mobile distribution credentials and release channels;
- live CTI / recording provider activation;
- filing and period-end job evidence in a live/staging environment.

Required closure:

- keep them as external release gates, not hidden backlog bugs;
- do not market the system as production-complete until those gates are either
  satisfied or explicitly excluded from the release claim.

### 6.4 Runtime persistence still depends on deployment configuration

`DatabaseService` only enables Postgres when `DATABASE_URL` is configured. This
is a reasonable local/dev design, but production closure must prove:

- migrations are applied;
- API boots with DB enabled;
- runtime repositories load persisted state;
- no critical operational lifecycle relies only on process memory;
- demo seed data is not mistaken for live operational data.

The most sensitive example is driver device binding: the driver registration and
refresh/revoke logic exists, but the binding map itself is held in the
`DriverDeviceSessionService` process. The driver profile records binding
summaries, but production-grade refresh token / binding durability needs a
dedicated persistence proof before calling it fully closed.

### 6.5 UAT evidence is broader than implemented code

There are many automated tests and scripts, but the UAT checklist itself remains
mostly unchecked. That means the honest claim is:

- "repo-local implementation and test scaffolding exist";
- not "human UAT sign-off is complete".

Required closure:

- decide whether the UAT checklist is a real sign-off artifact or just an
  inventory;
- if it is real, mark completed rows with evidence references;
- if it is not real, rename it or add a stronger status disclaimer.

## 7. What Is Actually Done

The following are now materially implemented in the core repo:

- Core API modules: auth, identity, owned mobility, callcenter, complaint,
  incident, billing-settlement, forwarder, tenant-partner, regulatory registry,
  reporting-filing, audit-notification, operational observability, platform
  admin, driver profile, driver settings, platform presence, platform earnings,
  shift attendance, maintenance, feature flags.
- Platform admin surfaces: tenants, partners, fleet, pricing, payments, audit,
  health, switchboard, feature flags, users, notices.
- Ops console surfaces: dispatch, callcenter, complaints, incidents, drivers,
  vehicles, revenue, reports, maintenance, attendance, contracts.
- Driver app surfaces: onboarding, jobs, trip lifecycle, completion proof,
  incident/SOS, shift, earnings, platform presence, settings.
- Tenant portal surfaces in core repo: bookings, passengers, addresses, users,
  API keys, webhooks, billing, reports, notifications, SLA, audit.
- Migrations through V0022, including runtime snapshots, driver profiles,
  driver locations, partner registry/eligibility, partner ingress credentials,
  platform presence, platform earnings, and settlement index.
- Tests and scripts exist across unit, smoke, E2E, driver-app unit, and
  sidecar evidence.
- ORX operational remediation tasks are now marked done in root machine truth.

## 8. What Is Not Done Yet

These are the remaining gaps that should stay visible:

1. `tenant-commute-hub` dirty working tree must be resolved.
2. `current-work.md` and docs-site status must be regenerated or corrected.
3. UAT checklist rows must be signed or clearly reclassified as inventory.
4. Workflow release gates with `PENDING` must be updated or left pending with a
   current reason.
5. Real bank/issuer integration must be gated on partner inputs.
6. Real forwarder adapter proof must be gated on external platform inputs.
7. Mobile distribution must be gated on Expo/Apple/Android credentials.
8. Live CTI/recording and filing jobs must stay `HOLD` until activated.
9. Production DB-enabled runtime evidence must be captured.
10. Pilot and production sign-off must remain separate from repo-local closure.

## 9. Recommended Next Execution Tasks

These are not new feature families; they are closeout tasks required to make the
blueprint and implementation tell one story.

| ID           | Task                                                                         | Owner lane                    | Output                                                                                     |
| ------------ | ---------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| `SYNC-001`   | Regenerate `current-work.md` and docs-site status from root `ai-status.json` | Supervisor / governance       | Root and docs-site dashboards agree on `249/249 done`.                                     |
| `SYNC-002`   | Update workflow release gate rows after ORX completion                       | Governance / release          | `PENDING` rows either become `PASS` with evidence or remain pending with current reason.   |
| `SYNC-003`   | Reconcile `docs/04-uat/phase1-uat-checklist.md`                              | QA / release                  | UAT checklist distinguishes inventory, static evidence, live evidence, and human sign-off. |
| `XREPO-001`  | Close `tenant-commute-hub` dirty diff                                        | Tenant frontend / integration | Tenant repo clean, committed, pushed, and contract snapshot version recorded.              |
| `DEPLOY-001` | Capture DB-enabled runtime persistence evidence                              | Infra / API                   | Staging boot with `DATABASE_URL`, migrations, and persisted lifecycle smoke evidence.      |
| `EXT-001`    | Track real bank / issuer eligibility gate                                    | Partner / integration         | Contract, credentials, allowed test cards, sandbox proof.                                  |
| `EXT-002`    | Track real forwarder adapter gate                                            | Partner / integration         | Adapter credentials, webhook/callback proof, no graceful-skip reliance.                    |
| `EXT-003`    | Track mobile distribution gate                                               | Mobile release                | Expo/Apple/Android credentials, tester groups, build evidence.                             |
| `EXT-004`    | Track live CTI / recording / filing activation                               | Ops / compliance              | CTI callback, recording export, filing job evidence.                                       |

## 10. Final Status Statement

The correct status is:

> The Phase 1 repo-local implementation and ORX remediation wave are materially
> complete in `drts-fleet-platform`, with all root machine-truth tasks marked
> done and the core repo synced to `origin/main`. The full operational blueprint
> is not production-complete yet because external integrations, UAT/release
> evidence synchronization, cross-repo tenant closure, and DB-enabled production
> runtime proof remain open.

Avoid saying:

> "Everything is done."

Use instead:

> "Core repo implementation is done; operational release closure still has
> external, evidence, cross-repo, and deployment gates."
