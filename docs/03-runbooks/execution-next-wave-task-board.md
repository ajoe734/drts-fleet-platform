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

## Current Status — 2026-07-07 (read this first)

> **Sections 1–11 below are historical closeout context (2026-04 → 2026-05).**
> They no longer describe the active board. The actual most-recent execution was
> the **map / geofence / service-area wave (2026-06-30 → 2026-07-04)** — the
> geofence/service-area foundation for the **Phase 2 Tesla/FSD monitoring
> sandbox**. For the current, reconciled state see **§12** at the bottom.
>
> **TL;DR:** the map/geofence wave is landed and green on `dev` (all 18 `MAP-*`
> tasks; supervisor 15/16 done, 1 permanent manual exception). One real
> product-UI gap remains — the **Platform Admin `/service-area-governance`
> publish screen** (backend + contracts + `GeometryEditor` done, admin route not
> yet built; canvas-gated). The Phase 2 sandbox itself is at foundation stage by
> design (governance/ODD APIs + Gate-B E2E landed; sandbox UI + external AV
> contracts deliberately deferred). Full detail in §12.

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

## 12. 2026-07-07 Map/Geofence Wave + Phase 2 Sandbox Reconciliation

This section supersedes sections 1–11 for the *current* state of the board.
Spec anchor: `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
(+ the `-20260701` delta). Progress source: live `.orchestrator/state.json`,
`git log origin/dev`, and deployed dev (`drts-dev-ray-tw-20260530` / `ne55h7sy3a`).

### 12.1 Landed on dev (all 18 `MAP-*` tasks)

- Backend authority: `MAP-BE-001` (geo/provenance contracts), `MAP-INFRA-001`
  (provider health/quota, #1016), `MAP-BE-002` (geo gateway, #1031), `MAP-BE-003`
  (typed api-client + OpenAPI delta), `MAP-BE-004` (service-area evaluation in
  booking creation), `MAP-BE-005` (order spatial audit snapshots), `MAP-BE-006`
  (service-area + stop-policy draft/review/publish/retire lifecycle + Phase 2
  sandbox-governance/ODD APIs + GeoJSON export, #1019/#1020).
- Shared UI: `MAP-UI-001` (`AddressMapPicker`, #1038), `MAP-UI-002`
  (`GeometryEditor` primitive + hardening, #1032/#1033).
- Surface integration: `MAP-FE-CALL-001` (callcenter), `MAP-FE-TEN-001` (tenant,
  #1045), `MAP-FE-CON-001` (concierge/partner, #1055), `MAP-FE-OPS-001` (Ops real
  map board, #1018), `MAP-MOB-DRV-001` (driver trip map/navigation, #1029).
- Observability + QA: `MAP-OBS-001` (#1039), `MAP-QA-001` (offline harness),
  `MAP-QA-002` (approved map/geofence E2E suite, #1057). Evidence under
  `support/sidecars/MAP-QA-00{1,2}/` (playwright, 2026-07-01 & 07-04 artifacts).
- Release: `MAP-REL-001` (#1060). Latest `deploy-dev` = success (2026-07-05).

Supervisor board: 15/16 done; the one `blocked` item is `PH1GC-DRV-MP-002`
(driver on-device evidence packet) — a standing **permanent manual exception**,
not part of the map wave.

### 12.2 Release-gate status (spec defines Gates A–E)

- **Gate A — callcenter safe to dispatch:** ✅ (`MAP-FE-CALL-001` + QA-002).
- **Gate B — governance safe to publish:** ⚠️ **backend/API + Gate-B E2E closed,
  but the operator-facing Platform Admin publish UI is not built** — see 12.3.
- **Gate C — Ops safe to operate:** ✅ (`MAP-FE-OPS-001`, `ops-map-board.ts`).
- **Gate D — driver safe to navigate:** ✅ (`MAP-MOB-DRV-001`).
- **Gate E — degraded safe:** ✅ (`MAP-BE-002` gateway + degradation fallbacks).

### 12.3 The one real open product gap (`MAP-GAP-005` / `-011` UI)

Backend service-area lifecycle APIs (`MAP-BE-006`), the `GeometryEditor`
primitive (`MAP-UI-002`), and the screen requirements
(`docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`)
are all done. **But there is no `/service-area-governance` route in
`apps/platform-admin-web`** — `MAP-FE-ADM-001` (#1047) closed as a *docs-only
screen handoff*, blocked on the canonical Platform Admin canvas publishing the
`/service-area-governance` screen family. The Phase 2 *sandbox* governance UI
(`app/sandbox/*`, `components/sandbox/sandbox-geometry-map.tsx`) exists and is
separate. Net: operators can publish no-pickup zones via API/backend, but not yet
through a Platform Admin screen.

Next step to close: publish the `/service-area-governance` route family into
`docs/05-ui/drts-design-canvas/Platform Admin.html` + `platform-screens-*.jsx`,
then implement the admin route against the existing contracts + `GeometryEditor`.

### 12.4 Deliberately deferred / out of scope (by design — not gaps)

- Batch impact preview across existing orders; Phase 2 sandbox operating-area
  authoring UI; any new backend contract beyond `/service-area/*` (delta scope
  cut).
- First-party Passenger App / Web + passenger receipt UI (intentionally out of
  scope).
- Phase 2 Tesla/FSD sandbox **body UI** (needs design canvas) and **external AV
  integration contracts** — foundation only (`P2-WP0` contracts + AV dispatch DD,
  `MAP-BE-006` sandbox-governance/ODD APIs, `P2-E2E-001` Gate-B suite).
