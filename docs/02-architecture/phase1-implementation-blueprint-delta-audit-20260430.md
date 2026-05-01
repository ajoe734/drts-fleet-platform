# Phase 1 Implementation vs Blueprint Delta Audit

Generated: 2026-04-30  
Last machine-truth check: 2026-04-30T22:57:26Z  
Scope: compare the operational SA / SD blueprint against the current repository implementation, task board, tests, and runtime-control evidence.

## 1. Executive Read

The current implementation is no longer just a skeleton. Most core Phase 1 bounded contexts have contracts, API modules, web/mobile surfaces, persistence snapshot tables, and unit/smoke/E2E coverage.

However, the system should not be described as fully operationally closed yet. The current delta is concentrated in four areas:

1. Active ORX remediation tasks are still open in machine truth.
2. Several high-risk negative flows are implemented as baseline mechanics but still need review, runbook ownership, or release-gate evidence.
3. External-gated integrations remain outside repo-only closure: real bank/issuer eligibility, real Grab Taiwan or equivalent forwarder adapter, mobile distribution credentials, and live CTI/recording activation.
4. Control-plane documentation has drift: one closeout checklist says the active backlog is closed, while `ai-status.json` and `current-work.md` still show open work.

This audit separates "implemented in repo" from "operationally complete", because the blueprint requires roles, positive flows, negative flows, state machines, UI/API/runbook landing points, acceptance evidence, authority consistency, and audit/artifact rules before claiming closure.

## 2. Sources Checked

- `phase1_system_analysis_v1.md`
- `docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md`
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`
- `docs/02-architecture/phase1-operational-complete-remediation-plan-20260430.md`
- `docs/02-architecture/phase1-role-scenario-and-negative-flow-matrix-20260430.md`
- `docs/03-runbooks/phase1-operational-remediation-execution-packet-20260430.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `ai-status.json`
- `current-work.md`
- `apps/api/src/modules/**`
- `apps/ops-console-web/app/**`
- `apps/platform-admin-web/app/**`
- `apps/driver-app/app/**`
- `packages/contracts/src/index.ts`
- `infra/migrations/**`
- `tests/**`, `apps/api/tests/unit/**`, `apps/driver-app/tests/unit/**`

## 3. Machine Truth Snapshot

As of `ai-status.json.updated_at = 2026-04-30T22:57:26Z`:

| Metric      | Count |
| ----------- | ----: |
| Total tasks |   246 |
| Done        |   239 |
| In progress |     1 |
| Review      |     2 |
| Todo        |     1 |
| Backlog     |     3 |

Open items in machine truth:

| Task                            | Status        | Delta Meaning                                                                                 |
| ------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `ORX-DP-003`                    | `in_progress` | Exception-hold / override approval / release workflow is not closed.                          |
| `ORX-CS-002`                    | `todo`        | Incident escalation, service recovery, and dispatch-exception handoff are not started/closed. |
| `ORX-FN-002`                    | `review`      | Reconciliation issue queue implementation exists but review is still pending.                 |
| `ORX-GV-001`                    | `review`      | Negative-path UAT pack and release gate expansion exist but review is still pending.          |
| `ORX-GV-002`                    | `backlog`     | Role ownership matrix and runbook set remain unimplemented.                                   |
| `ORX-GV-003`                    | `backlog`     | Glossary and multilingual failure-state consistency remain unimplemented.                     |
| `ORX-DP-001-SIDECAR-ACCEPTANCE` | `backlog`     | Acceptance support artifact for queue policy is still open.                                   |

Additional control-plane issue:

- `.orchestrator/task-briefs/ORX-CS-002.md`, `.orchestrator/task-briefs/ORX-GV-002.md`, and `.orchestrator/task-briefs/ORX-GV-003.md` are missing even though those tasks exist in `ai-status.json`.
- `docs/03-runbooks/master-system-closeout-checklist.md` still says the current active execution backlog is closed, but `ai-status.json` and `current-work.md` disagree.
- Runtime note: supervisor had to be restarted during this audit and is now running again as PID `312511`. It queued a Gemini chairman `approval_triage` for pending approval `apr-20260430T175102Z-ddda0477` on `ORX-FN-002`, but that Gemini chairman attempt hit quota; the approval remains pending until another healthy chairman lane resolves it.

## 4. Blueprint Delta By The 29 SD Categories

Legend:

- `Closed / baseline`: repo implementation substantially exists and is backed by tests or evidence, but may still need pilot/production gate.
- `Partial`: implementation exists but a required negative flow, review, runbook, live gate, or external dependency remains.
- `Open`: not closed in machine truth or missing core implementation.
- `External-gated`: repo can only scaffold; real closure depends on outside credentials/system access.
- `Deferred`: intentionally outside current Phase 1 completion bar.

|   # | Blueprint Area                                   | Current Implementation Evidence                                                                                                                                                                   | Gap vs Blueprint                                                                                                                                                                           | Status              |
| --: | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
|   1 | Identity and entry                               | Control-plane / tenant / partner / driver auth contracts exist; protected control-plane auth is documented as IAP/Bearer, with bootstrap fallback for local/direct paths.                         | Production wording must keep bootstrap fallback explicitly non-primary. Runtime still has local/dev escape hatches.                                                                        | Closed / baseline   |
|   2 | Driver master and device binding                 | Driver profile API/service, device registration, onboarding UI, driver session refresh/revoke/rebind, and driver app routing exist.                                                               | Device bindings are currently runtime memory in `DriverDeviceSessionService`; full platform-admin issuance / durable registration-code lifecycle still needs careful production hardening. | Partial             |
|   3 | Partner / bank program onboarding                | Platform admin partner page supports partner/program/entry form, branding, auth mode, eligibility mode, status. Partner registry and eligibility persistence migrations exist.                    | Real bank/issuer API contract, sandbox credentials, allowed card test set, and bank-specific production branding remain outside repo-only closure.                                         | External-gated      |
|   4 | Third-party API / forwarder integration          | Forwarder contracts, API, reconciliation model, adapter health, manual fallback, and Grab Taiwan adapter class exist.                                                                             | Grab Taiwan adapter is a stub returning `grab_taiwan_*_stub`; live adapter credentials/callback proof remain external-gated.                                                               | External-gated      |
|   5 | Phone order and call center loop                 | Call-center service/UI can open calls, attach recording callback, quote ETA, create callback tasks, create phone order, link existing order, and transfer to complaint/incident.                  | Live CTI/screen-pop and recording export activation remain `HOLD`; month-end filing tied to CTI evidence is not fully live-gated.                                                          | Partial             |
|   6 | Queue, dispatch, redispatch rules                | Contracts include queue families, redispatch states, no-supply, delayed queue, exception hold. API/tests cover no-supply, timeout, reassign vs redispatch, queue entry, and dispatch traces.      | `ORX-DP-003` remains open for reviewed exception-hold and override release governance.                                                                                                     | Partial             |
|   7 | Map and realtime location                        | Driver heartbeat, `ops.phase1_driver_locations`, ETA calculation, dispatch workflow spatial point logic, map board MVP, stale/no-location states exist.                                           | Rich map-first dispatch UX is still P1/P2; live map operational evidence is thinner than core dispatch evidence.                                                                           | Partial             |
|   8 | Recording / proof / eligibility compliance gates | Contracts define compliance gate types/states; owned-mobility gates, phone recording gates, partner eligibility, proof bundle, driver photo/signoff/expense proof UX and tests exist.             | CTI recording live activation and some negative-path release evidence remain pending under workflow gates.                                                                                 | Partial             |
|   9 | Finance / settlement / reconciliation            | Channel-aware settlement matrix exists; billing-settlement service includes reconciliation issue types for forwarder and partner sponsor mismatch; platform/admin and ops revenue surfaces exist. | `ORX-FN-002` is in review, so reconciliation queue is not formally closed yet.                                                                                                             | Partial             |
|  10 | Tenant onboarding and rollout gate               | Platform admin tenant onboarding console exists with bootstrap defaults, integration package, rollout stages, owners, rollback flag. Cross-repo tenant surface is documented.                     | Future tenant rollout still needs tenant-by-tenant sign-off; tenant repo authority must keep syncing.                                                                                      | Closed / baseline   |
|  11 | Supply pool lifecycle                            | Regulatory registry has vehicle/driver/contract/insurance/exclusivity models, seeds, persistence, eligibility, and UI surfaces.                                                                   | Production supply onboarding is supported, but still has demo seed baselines and should not be confused with live fleet data completeness.                                                 | Closed / baseline   |
|  12 | Reservation vs realtime rules                    | Booking types, reservation hold states, queue entry policy, redispatch/exception behavior and tests exist.                                                                                        | Acceptance sidecar for `ORX-DP-001` is still open, so release evidence packaging is incomplete.                                                                                            | Partial             |
|  13 | Passenger / address master governance            | Tenant passenger/address contract tables and governance semantics exist; booking uses governed passenger/address resolution.                                                                      | First-party passenger app/web and passenger receipt UI are intentionally deferred.                                                                                                         | Deferred / baseline |
|  14 | Pricing authority and manual fare override       | Manual fare override API/client paths and tests require actor/reason/trace and block inappropriate post-completion edits.                                                                         | Deeper pricing governance is listed as P2 in the blueprint.                                                                                                                                | Closed / baseline   |
|  15 | Complaint / incident / escalation                | Complaint taxonomy/reopen/SLA and complaint-to-incident link tests exist; incident service/UI exists and supports priority queues.                                                                | `ORX-CS-002` remains todo for service recovery and dispatch-exception handoff; task brief is missing.                                                                                      | Open                |
|  16 | Tenant API / webhook governance                  | Tenant webhook endpoints, delivery records, scopes, HMAC/retry service, and API client paths exist.                                                                                               | Real delivery operations and disable/retry evidence need live environment confidence; webhook failure bursts are monitored but production alerting gate remains distinct.                  | Partial             |
|  17 | Control-plane vs business-plane auth boundary    | Auth matrix, route policies, protected control-plane direction, partner/tenant bootstrap bearer, driver device token flow exist.                                                                  | Some local/direct bootstrap paths remain by design; release wording must not imply all callers are under the same IAP trust boundary.                                                      | Closed / baseline   |
|  18 | Dual-repo authority drift guardrail              | Cross-repo gap matrix, tenant boundary docs, managed contract snapshot, CI/CD multi-repo checkout references exist.                                                                               | Drift guardrail depends on continuous sync discipline; `tenant-commute-hub` remains a separate authority surface.                                                                          | Partial             |
|  19 | Tests / acceptance / E2E                         | Unit, smoke, E2E scripts, UAT docs, workflow acceptance gates, and sidecar evidence packs exist.                                                                                                  | `ORX-GV-001` is still in review; several negative-path rows are marked pending; E2E-003/CTI remains hold.                                                                                  | Partial             |
|  20 | Observability / alerts                           | Operational observability service, alert keys, dashboard/health surfaces, and tests exist.                                                                                                        | Alerting is role-routed and measurable in repo, but production pager/SLO operationalization is not fully proven.                                                                           | Partial             |
|  21 | NFR / capacity / retention                       | Rate limiting, snapshot persistence, retention/evidence policies, and migrations exist.                                                                                                           | Capacity/load testing and production retention operation remain weaker than feature coverage.                                                                                              | Partial             |
|  22 | Sensitive data / masking / secret policy         | Sensitive-data matrix, auth policy, controlled downloads, evidence masking, hash-only references, and tests exist.                                                                                | Need continuous review that demo/local secrets and bootstrap helpers do not leak into production claims.                                                                                   | Closed / baseline   |
|  23 | Retention / legal hold / evidentiary access      | Evidence policy catalog, legal hold, deletion exception operations, audit page/API paths exist.                                                                                                   | Actual object storage/legal retention integration should remain a deployment gate, not just repo policy.                                                                                   | Partial             |
|  24 | Internationalization / multilingual operations   | Existing OPX glossary work covers many surfaces; localized labels exist across ops/driver/admin.                                                                                                  | `ORX-GV-003` remains backlog for failure-state copy consistency across admin / ops / driver / tenant / partner.                                                                            | Open                |
|  25 | Docs / decisions / backlog sync                  | SA, SD, remediation plan, UAT gates, execution packets, task board, sidecars, and current-work exist.                                                                                             | Active backlog vs closeout checklist drift; missing task briefs for active tasks; chairman/supervisor state can move faster than docs.                                                     | Partial             |
|  26 | Data model and event boundary                    | Contracts centralize state machines; migrations V0011-V0022 provide runtime snapshot and source-of-truth tables; repositories can persist JSONB runtime records.                                  | Many services still maintain in-memory state and only persist when `DATABASE_URL` is configured; production must run migrations and DB-enabled services.                                   | Partial             |
|  27 | Channel marking and source-aware lifecycle       | Owned order sources, partner airport transfer, phone orders, forwarder shadow/authority, channel-aware settlement, and source-aware reporting exist.                                              | Real external channel proof for forwarder/bank remains gated.                                                                                                                              | Partial             |
|  28 | Human operation vs automation boundary           | Operator actions require actor/reason/trace in many places; manual fallback/review queues exist; chairman/supervisor decision boundary has been added for orchestration.                          | `ORX-GV-002` ownership/runbook matrix remains backlog; exception/override owner routes are not fully operator-facing.                                                                      | Partial             |
|  29 | Future extension hooks                           | Future service bucket (`av_pilot`), platform code registry, deferred passenger/call-point/AV/ROC scope, and feature gates exist.                                                                  | Future hooks are intentionally not product-complete; they should stay out of Phase 1 completion claims.                                                                                    | Deferred            |

## 5. Highest-Risk Deltas

### 5.1 Active implementation is not actually closed

The strongest contradiction is between closeout wording and machine truth:

- `master-system-closeout-checklist.md` says the active execution backlog is closed.
- `ai-status.json` / `current-work.md` show 7 active items.

This is not cosmetic. If release status is read from the checklist alone, the system will overclaim completion.

### 5.2 Incident / service recovery is the largest functional hole

Complaint and basic incident mechanics exist, but `ORX-CS-002` is still `todo`.

Blueprint expectation:

- incident owner is explicit
- severity and escalation target are explicit
- dispatch exceptions can become incidents without losing trace
- service recovery actions are visible and reviewable

Current gap:

- task exists but task brief is missing
- service recovery workflow is not closed
- dispatch-exception handoff is dependent on `ORX-DP-003`

### 5.3 Exception hold / override is still in progress

The code already has reservation hold states, exception hold reason codes, queue families, and tests around release/cancel behavior. But the blueprint asks for a reviewed workflow for request / approval / release / expiry, and `ORX-DP-003` remains `in_progress`.

This blocks clean closure of dispatch negative flows and downstream incident escalation.

### 5.4 Reconciliation is implemented but not yet accepted

The billing settlement code has reconciliation issue types and lifecycle implementation, and `ORX-FN-002` says implementation is complete and ready for review. But the task status is still `review`, so it should not be counted as closed.

### 5.5 Negative-path gate is not fully accepted

`ORX-GV-001` has expanded negative-path gates in the release-gate document, but the task is still in review and several workflow rows are still marked pending. This matters because the blueprint explicitly rejected happy-path-only planning.

### 5.6 External integrations are real blockers, not repo TODOs

These cannot be fixed by code alone:

- real bank / issuer eligibility contract and credentials
- real Grab Taiwan or equivalent forwarder adapter
- mobile distribution credentials
- live CTI recording/screen-pop environment and filing activation

Repo scaffolding exists, but the release language must keep these as external-gated.

## 6. Implementation Evidence Summary

### Strongly Implemented

- API modules exist for owned mobility, callcenter, complaint, incident, billing-settlement, forwarder, tenant-partner, regulatory registry, reporting/filing, platform admin, driver profile, auth, feature flags, and observability.
- Platform admin has tenant, partner, fleet, pricing, audit, payments, health, switchboard surfaces.
- Ops console has dispatch, callcenter, complaints, incidents, revenue, reports, drivers, vehicles, maintenance, attendance surfaces.
- Driver app has onboarding, jobs, trip, shift, incident/SOS, earnings, platform presence, and settings/profile flows.
- Contracts define order status, dispatch job status, queue family, exception hold, compliance gates, reconciliation issues, forwarder lifecycle, incident lifecycle, evidence governance, and operational alerts.
- Migrations exist for runtime snapshots, driver profiles, driver locations, partner registry/eligibility, partner ingress credentials, platform presence, platform earnings, and settlement indexes.
- Tests cover core owned mobility, compliance gates, callcenter, complaint escalation, incident, forwarder, billing settlement, reporting/filing, driver profile, observability, webhook dispatch, driver app proof/replay/location/identity, smoke, and E2E scripts.

### Still Not Production-Complete Without Gate Evidence

- `DATABASE_URL` is optional; if absent, many services run in memory.
- Demo seed data is intentionally present across driver profile, regulatory registry, partner/tenant, settlement, public info, and platform admin.
- Forwarder adapter is a stub.
- CTI recording callback is represented, but live CTI activation is not proven.
- Mobile build/distribution depends on external accounts/keystores/tester groups.
- Pilot/production sign-off remains separate from repo-local and staging evidence.

## 7. Recommended Next Actions

1. Create missing task briefs for `ORX-CS-002`, `ORX-GV-002`, and `ORX-GV-003`.
2. Keep chairman/supervisor driving the remaining 7 machine-truth items until they close or are explicitly deferred.
3. Do not update release wording to "fully done" until `ORX-DP-003`, `ORX-CS-002`, `ORX-FN-002`, `ORX-GV-001`, `ORX-GV-002`, and `ORX-GV-003` are resolved.
4. Patch `master-system-closeout-checklist.md` so it no longer contradicts `ai-status.json`.
5. Treat external-gated integrations as separate release gates, not backlog bugs.
6. After ORX review closes, rerun the targeted unit suites for dispatch, callcenter, incident, billing-settlement, forwarder, and UAT documentation checks.

## 8. Bottom Line

The implementation has materially caught up with the blueprint in breadth. The remaining gap is no longer "we have no system"; it is "we have many implemented slices, but not all operational closure gates are accepted, externally proven, and synchronized in machine truth."

The honest status is:

- repo-local feature baseline: mostly implemented
- operational negative-flow closure: still in progress
- external integrations: gated
- production/pilot readiness: not claimable until the remaining ORX and gate evidence closes
