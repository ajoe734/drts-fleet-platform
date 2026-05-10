# Execution Next-Wave Task Board

## Purpose

This board reflects the current supervisor-managed execution board after the
system closeout wave and the newly materialized post-closeout hardening /
parity / evidence wave.

It is the practical bridge between:

- the broader system-closeout blueprint
- the current `ai-status.json` execution backlog
- the now-closed protected control-plane auth migration
- the repo-executable next-wave backlog now opened from
  `docs/03-runbooks/execution-mode-candidate-backlog.md`

## Decision Anchors

- `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`
- `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`
- `docs/01-decisions/SD-DP-20260422-003-design-truth-supersession-rule.md`

## 1. Execution-Ready Now

These tasks were materialized and are now effectively closed.

1. `MSC-R1-001`
   - status: `done`
   - owner / reviewer: `Codex2` / `Claude`
   - objective: close the remaining staging-evidence narrative drift, confirm the resolved `FBP-013A` credential blocker state, and produce the rollout-evidence closeout packet

2. `MSC-T1-001`
   - status: `done`
   - owner / reviewer: `Codex` / `Claude`
   - objective: verify the `tenant-commute-hub` contract, authority boundary, and retired shell assumptions

3. `MSC-P1-001`
   - status: `done`
   - owner / reviewer: `Claude` / `Codex`
   - objective: produce an explicit decision packet for Passenger / Call Point / Concierge / complaint-entry completion scope

4. `MSC-F1-001`
   - status: `done`
   - owner / reviewer: `Codex2` / `Claude`
   - objective: audit finance / reporting / filing completeness against the PRD and actual operator workflow

## 2. Dependency-Gated Execution

These tasks were real and materialized; only one remains open now.

1. `MSC-I1-001`
   - status: `done`
   - owner / reviewer: `Gemini` / `Codex`
   - depends on: `MSC-T1-001`, `MSC-F1-001`
   - objective: verify cross-surface workflow integrity and remaining operational hardening gaps

2. `MSC-N1-001`
   - status: `done`
   - owner / reviewer: `Codex` / `Claude`
   - depends on: `MSC-R1-001`, `MSC-T1-001`, `MSC-P1-001`, `MSC-F1-001`, `MSC-I1-001`, `GAP-P2S3-001`
   - objective: align `ai-status.json`, `current-work.md`, evidence packets, and control-plane views to one final closeout story

## 3. Former Final Blocker

1. `GAP-P2S3-001`
   - status: `done`
   - owner: `Gemini`
   - objective: Cloud IAP / OIDC JWT production for the staged internal control-plane cutover, replacing bootstrap-header trust
   - closeout: human GCP / Cloud IAP prerequisites, protected control-plane proxy migration, staging verifier repair, and merged inner-trust cleanup are complete on remote `main`
   - evidence anchor: `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`

## 4. Dispatch Rule Right Now

If supervisor execution mode keeps running, the intended behavior is:

1. treat `GAP-P2S3-001` as closed unless the protected control-plane auth boundary regresses
2. use `docs/03-runbooks/master-system-closeout-checklist.md` plus `docs/03-runbooks/execution-mode-candidate-backlog.md` as the planning anchors for any new wave
3. keep external-gated and deferred scope explicit instead of silently reopening it as repo-local backlog
4. avoid reopening product-surface scope that is intentionally out of strategy or externally gated

## 5. Current Interpretation

- The switchboard follow-up wave is already closed.
- The substantive closeout wave (`MSC-R1-001`, `MSC-T1-001`, `MSC-P1-001`, `MSC-F1-001`, `MSC-I1-001`) and the final narrative sync (`MSC-N1-001`) are done.
- A fresh repo-only execution wave is now open for hardening, workflow parity, and evidence expansion.
- The former final auth blocker is now closed; any remaining visible delta is external-gated, intentionally deferred, or ordinary follow-on maintenance.

## 6. Materialized Post-Closeout Wave

On `2026-04-22`, the repo-executable candidates were materialized into
`ai-status.json` so the supervisor and auto workers could start execution.

Current active families:

1. `EMC-H1-001` through `EMC-H1-004`
   - persistence and source-of-truth hardening
2. `EMC-H2-001`
   - driver-task runtime bus externalization
3. `EMC-W1-001` through `EMC-W1-003`
   - workflow parity and authority hardening
4. `EMC-I1-001` and `EMC-I1-002`
   - evidence expansion and repo-controlled automation

Execution notes:

1. `EMC-X1-001` remains partner-gated, while `EMC-X1-002` is now materially closed as code work: `ajoe734/tenant-commute-hub#1` and `#3` plus `ajoe734/drts-fleet-platform#1` and `#12` are merged, local live smoke passed through the landing branch plus local `drts-api`, and the former tenant identity-hardening remainder is no longer a remote-main code gap; only docs/evidence sync remains if the team wants a fresh post-merge annex packet
2. first-party Passenger App / Web and passenger-surface receipt UI remain intentionally out of scope
3. `GAP-P2S3-001` is now historical closeout context rather than the active blocker story
4. staged identity-cutover planning now assumes internal control-plane callers move first; tenant, driver, adapter, and webhook flows are not default IAP targets

## 7. Backlog Source

For the detailed rationale, ordering, and non-materialized remainder, use
`docs/03-runbooks/execution-mode-candidate-backlog.md`.

## 8. 2026-04-28 Productization Execution Packet

The next actionable productization wave has been split into supervisor-ready
tasks in:

- `docs/03-runbooks/phase1-productization-execution-packet-20260428.md`

This packet materializes the remaining productization gaps without reopening the
closed control-plane auth, tenant cutover, or intentionally deferred passenger
surface decisions.

Dispatch families and status as of 2026-04-28:

1. `P1PX-BE-001` and `P1PX-BE-002` — **done**
   - partner registry / eligibility persistence and partner-authenticated ingress
   - commits: `db06e6f`, `4e5c22e`
2. `P1PX-FE-001` — **done**
   - `tenant-commute-hub` partner-only booking shell and bank-specific entry branding
   - commit: `29f27526c20103af5ddd61152d4961d04b314724` (tenant-commute-hub)
3. `P1PX-BE-003` — **done**
   - partner truth carry-through into audit, finance, reporting, and operator review
   - commit: `0519485`
4. `P1PX-DRV-001` and `P1PX-DRV-002` — **done**
   - driver app production identity / device posture and EAS internal build evidence
   - commits: `83a3e4c`, `4a99bdd`
5. `P1PX-DOC-001` — **in review** (pending Codex reviewer approval; owner will finalize to done after approval)
   - blueprint and gap-matrix truth sync after implementation slices finish

All P1PX implementation slices are closed. The remaining delta is:

- external-gated: real bank/issuer credentials (`EMC-X1-004`), Grab Taiwan adapter (`EMC-X1-001`), mobile distribution inputs
- intentionally deferred: first-party passenger app/web, passenger receipt UI, call point/concierge, AV/ODD, live board

## 9. 2026-04-29 Operational Blueprint Execution Packet

The newly accepted operational SA/SD supplements have now been materialized
into a supervisor-ready packet at:

- `docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md`

That packet has since been materialized into `ai-status.json` as the active
`OPX-*` execution family. The operational sync path is now:

1. accepted SA supplement + SD blueprint + scoped decisions
2. `docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md`
3. `ai-status.json` / `current-work.md`
4. code-backed audits and closeout docs

The active families are `OPX-ID-*`, `OPX-MD-*`, `OPX-IN-*`, `OPX-DP-*`,
`OPX-CM-*`, `OPX-GV-*`. Future operational-closure work should extend this same
materialization chain instead of reopening detached prose-only backlog.

## 10. 2026-04-30 Detailed Remediation Packet

The broader `OPX-*` operational wave now has a follow-on detailed remediation
packet at:

- `docs/03-runbooks/phase1-operational-remediation-execution-packet-20260430.md`

This packet does not replace `OPX-*`. It refines the newly completed role /
scenario / negative-flow planning into execution-ready slices for:

1. driver registration / rebind / revoke
2. driver master and supply lifecycle consoles
3. phone-order recording and partner eligibility failure paths

## 11. 2026-05-04 Driver App Productization Wave

The driver app productization design has been split into supervisor-ready
materialization tasks in:

- `docs/02-architecture/driver-app-productization-design-plan-20260504.md`
- `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md`

This wave is repo-local productization work for the native Expo driver app. It
does not reopen mobile store distribution evidence, Expo credentials, Android
signing, Apple team access, or first-party passenger scope.

Materialized task family:

1. `DRV-MAT-000` — design freeze and route/task graph confirmation
2. `DRV-MAT-001` — shared UI foundation
3. `DRV-MAT-002` — app shell and workstation home
4. `DRV-MAT-003` — task inbox materialization
5. `DRV-MAT-004` — trip workflow command center
6. `DRV-MAT-005` — SOS incident flow
7. `DRV-MAT-006` — shift and attendance materialization
8. `DRV-MAT-007` — platform presence and binding
9. `DRV-MAT-008` — earnings dashboard materialization
10. `DRV-MAT-009` — settings materialization
11. `DRV-MAT-010` — route-by-route productization verification pack

Dispatch rule:

1. Dispatch `DRV-MAT-000` and `DRV-MAT-001` first.
2. Do not dispatch page rewrites before `DRV-MAT-001` lands.
3. After foundation, `DRV-MAT-003`, `DRV-MAT-006`, `DRV-MAT-007`, and
   `DRV-MAT-008` may run in parallel because their write scopes are disjoint.
4. Keep `DRV-MAT-004` under focused review because it touches trip action,
   completion proof, pending replay, heartbeat, and stale-session behavior.
5. Treat `DRV-MAT-010` as the final evidence gate for this wave.
6. forwarder sync-failed and reconciliation handling
7. queue families, override workflows, and map-board MVP
8. driver proof UX, offline replay, and finance / artifact governance
9. negative-path UAT, role-ownership runbooks, and glossary sync

If a future wave is materialized from this packet, it should open as an
explicit `ORX-*` family linked back to the accepted remediation plan rather
than being merged silently into historical `OPX-*` prose.

## 12. 2026-05-08 Platform Admin And Ops Console Design Wave

The management-console design review has now been converted into a supervisor-
ready execution packet at:

- `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`

This wave is scoped to repo-local implementation of the supplied `drts.zip`
designs for:

- `Platform Admin`
- `Ops Console`

It does not include:

- `Tenant Console` productization
- `Partner Booking`
- `Driver App`

Materialized task families for this wave:

1. `MGMT-UI-001`
   - initial shared desktop primitive extraction
2. `MGMT-UI-003` through `MGMT-UI-005`
   - shared shell, table/filter/status, and workflow primitive hardening
3. `ADM-UI-002` through `ADM-UI-004`
   - platform admin governance, finance, and control-plane surfaces
4. `ADM-UI-005` and `ADM-UI-006`
   - explicit tenant-detail and partner-detail deep-page hardening follow-ons
5. `OPS-UI-002` through `OPS-UI-005`
   - ops dashboard, dispatch, casework, reporting, and registry surfaces
6. `OPS-UI-006` through `OPS-UI-008`
   - explicit dispatch-board authority split, dispatch-detail, and callcenter
     workspace follow-ons
7. `MGMT-UI-002`
   - route-by-route verification and evidence packet

Dispatch rule:

1. treat `MGMT-UI-001` as the landed primitive baseline
2. dispatch `MGMT-UI-003` through `MGMT-UI-005` before backlog/todo page-family rewrites
3. after foundation hardening lands, page-family tasks may run in parallel by disjoint write scope
4. keep `ADM-UI-001`, `OPS-UI-001`, `ADM-MP-*`, and `OPS-MP-*` as completed prerequisites to extend rather than replace
5. treat `MGMT-UI-002` as the final evidence gate for this design wave

## 13. 2026-05-08 Tenant Console And Cross-System Design Wave

The selected tenant-console and cross-system guardrail work has now been
converted into a supervisor-ready execution packet at:

- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`

This wave is intentionally narrower than a full tenant-portal rebuild. It
materializes the user-selected slices:

- `UI-TN-01` through `UI-TN-06`
- `UI-TN-12` through `UI-TN-17`
- `UI-XS-01` through `UI-XS-04`

Materialized task families for this wave:

1. `TEN-UI-001`
   - tenant-console productization topology decision
2. `XS-UI-001` through `XS-UI-004`
   - route/endpoints, backend-gap inventory, command matrix, and query/filter
     normalization
3. `TEN-UI-002` through `TEN-UI-008`
   - tenant shell, home, booking, integration, governance, and real-RBAC
     productization
4. `TEN-UI-009`
   - tenant-console verification packet

Dispatch rule:

1. dispatch `TEN-UI-001` first; do not broad-start tenant UI rewrites while the
   target app topology is ambiguous
2. dispatch `XS-UI-001` immediately after the topology decision lands
3. do not finalize tenant workflow implementations before the endpoint,
   command-action, and filter/query guardrails are explicit
4. treat `TEN-UI-009` as the final evidence gate for this selected tenant wave

## 14. 2026-05-09 Full-System UI Completion Wave

The repo now has a new supervisor-ready packet for the gap between "main
consoles are materially rebuilt" and "the complete system UI is actually
finished":

- `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`

This wave explicitly reopens the remaining full-system families that were
previously only deferred or partially verified:

- repo-local partner booking mode completion
- Passenger App / Passenger Web and passenger receipt landing zones
- Call Point / Concierge Portal landing zone and materialization
- full auth / registration / invite / revoke / negative-flow matrix
- multi-platform forwarded-authority completion across driver / ops / admin /
  tenant surfaces
- final full-system verification packet

Materialized task families for this wave:

1. `SYS-UI-001`
   - full-system surface reopen and landing-zone decision
2. `SYS-UI-002`
   - repo-local partner booking mode productization
3. `SYS-UI-003` and `SYS-UI-004`
   - passenger shell plus passenger booking/status/receipt/negative flows
4. `SYS-UI-005`
   - call point / concierge portal materialization
5. `SYS-UI-006`
   - cross-surface auth / registration / invite / revoke / failure matrix
6. `SYS-UI-007`
   - multi-platform forwarded-authority completion
7. `SYS-UI-008`
   - full-system UI verification packet

Dispatch rule:

1. dispatch `SYS-UI-001` first; do not claim full-system completion while the
   missing landing zones are still ambiguous
2. after `SYS-UI-001`, `SYS-UI-002`, `SYS-UI-003`, and `SYS-UI-005` may run in
   parallel if write scopes stay disjoint
3. keep `SYS-UI-006` as the cross-surface positive/negative/auth-flow closure
   gate
4. keep `SYS-UI-007` under focused review because it cuts across driver / ops /
   admin / tenant authority presentation
5. treat `SYS-UI-008` as the only acceptable basis for any future "完整系統 UI
   已完成" claim
