# MAP Fleet Execution Kickoff Packet

**Sidecar task:** `MAP-FLEET-KICKOFF-SIDECAR`

**Parent task:** `MAP-REL-001` - Map/geofence production release gates

**Parent owner/reviewer:** `Codex2` / `Codex`

**Sidecar owner/reviewer:** `Codex` / `Codex2`

**Scope boundary:** support artifact only. This packet tells fleets how to start and close remaining implementation work; it does not claim production readiness.

**Machine-truth sync:** owner/reviewer/status values below were synchronized against `scripts/ai-status.sh list` on `2026-06-30` UTC. If older planning notes disagree, this packet follows `ai-status` as the current execution control plane.

## 1. Kickoff Verdict

The map/geofence wave is ready for focused fleet execution, but it is **not** production-ready.

The fleet should treat current work as three parallel lanes:

1. Review unblock lane: approve or reopen review-gated backend/UI/foundation tasks so implementation branches can test against stable contracts.
2. Surface implementation lane: build Platform Admin, Tenant, Concierge/Partner, and Driver map surfaces against the approved contracts and sidecar evidence packets.
3. L4 proof lane: implement `MAP-QA-002`, `MAP-OBS-001`, and `MAP-REL-001` only against integrated implementation branches, not sidecar plans alone.

Sidecar packets are acceptance contracts. They do not replace implementation, E2E, mobile UAT, audit, or release evidence.

## 2. Current Fleet Board Snapshot

`Blocker class` is intentionally strict:

- `review-blocked` means implementation exists but needs reviewer approval or a reopen with specific fixes.
- `dependency-blocked` means the task cannot honestly close until upstream implementation/review evidence exists.
- `ready` means fleet work can start now, but final gate pass still requires the closeout evidence named in this packet.

| Task | Owner / reviewer | Status | Blocker class | Start condition | Production gate(s) | Fleet action |
| --- | --- | --- | --- | --- | --- | --- |
| `MAP-BE-001` | `Codex` / `Claude2` | `review` | `review-blocked` | Reviewer validates provenance contract branch or reopens with concrete fixes. | Gate A/E provenance and audit assertions. | Approve/reopen; consumers must not treat provenance as final until accepted. |
| `MAP-BE-002` | `Codex` / `Claude2` | `review` | `review-blocked` | Reviewer validates provider-neutral search/resolve/reverse gateway. | Gate A/E geocode authority and degraded behavior. | Approve/reopen before picker and E2E branches rely on it as stable backend authority. |
| `MAP-BE-003` | `Codex` / `Claude2` | `review` | `review-blocked` | Reviewer validates shared API-client/service seam for map surfaces. | Gate A/C/D/E API-client authority. | Approve/reopen before Ops, Driver, and final E2E rely on typed coordinate data. |
| `MAP-BE-005` | `Codex` / `Claude2` | `review` | `review-blocked` | Reviewer validates order coordinate/snapshot persistence. | Gate A/B/C/D/E snapshot and spatial audit. | Approve/reopen before any surface claims backend anti-bypass or persisted serviceability. |
| `MAP-UI-001` | `Codex` / `Claude2` | `review` | `review-blocked` | Reviewer validates shared `AddressMapPicker` contract, fallback, and tests. | Gate A/E entry-surface consistency. | Approve/reopen before Tenant, Concierge, Partner, and callcenter reuse it as stable UI primitive. |
| `MAP-UI-002` | `Codex2` / `Claude2` | `review` | `review-blocked` | Reviewer validates base `GeometryEditor` behavior. | Gate B governance. | Approve/reopen before integration and Platform Admin build on it. |
| `MAP-UI-002-HARDEN-001` | `Codex2` / `Claude2` | `review` | `review-blocked` | Reviewer validates geometry hardening fixes. | Gate B governance. | Approve/reopen; integration must not proceed with half-validated geometry behavior. |
| `MAP-QA-001` | `Codex` / `Claude2` | `review` | `review-blocked` | Reviewer validates mocked-provider E2E harness. | All gates test foundation. | Approve/reopen before `MAP-QA-002` uses the harness as final evidence substrate. |
| `MAP-FE-CALL-001` | `Codex` / `Claude2` | `review` | `review-blocked` | Reviewer validates callcenter map booking implementation branch. | Gate A and Gate E. | Approve/reopen; Gate A still cannot pass until backend/provider E2E, observability, and release evidence exist. |
| `MAP-UI-002-INTEGRATE-001` | `Codex` / `Claude2` | `backlog` | `dependency-blocked` | `MAP-UI-002` and `MAP-UI-002-HARDEN-001` are approved or final commits are explicitly named. | Gate B governance. | Start immediately after review unblock to produce one importable `GeometryEditor` surface. |
| `MAP-FE-ADM-001` | `Codex2` / `Codex` | `todo` | `dependency-blocked` | `MAP-BE-006` is done and `MAP-UI-002-INTEGRATE-001` is available. | Gate B governance. | Implement Platform Admin publish/retire and Phase 2 policy separation against the Gate B sidecar. |
| `MAP-FE-TEN-001` | `Claude2` / `Codex2` | `backlog` | `dependency-blocked` | `MAP-UI-001`, `MAP-BE-004`, and `MAP-BE-005` are accepted or equivalent commits are named. | Gate E plus entry-surface Gate A assertions. | Implement Tenant saved-address/pin/serviceability flow against shared entry sidecar. |
| `MAP-FE-CON-001` | `Codex2` / `Claude` | `backlog` | `dependency-blocked` | `MAP-UI-001`, `MAP-BE-004`, and `MAP-BE-005` are accepted or equivalent commits are named. | Gate E plus partner/concierge entry assertions. | Implement Concierge/Partner map picker and anti-bypass behavior against shared entry sidecar. |
| `MAP-MOB-DRV-001` | `Codex2` / `Claude2` | `backlog` | `dependency-blocked` | `MAP-BE-003` and `MAP-BE-005` are accepted or stable mobile fixture commits are named. | Gate D driver navigation. | Implement native driver trip map/navigation and attach simulator or external-gated UAT evidence. |
| `MAP-OBS-001` | `Codex2` / `Codex` | `todo` | `ready` | Event names and reason codes from backend/surface branches are stable enough to instrument. | Gate A-E observability. | Start metrics/audit/alert/runbook wiring now; final pass waits for integrated branches emitting real events. |
| `MAP-QA-002` | `Codex2` / `Codex` | `todo` | `dependency-blocked` | Surface tasks expose stable hooks and `MAP-QA-001` harness is accepted. | Gate A-E E2E proof. | Prepare fixtures now; final close requires implementation branch SHAs, command logs, screenshots/traces, and UAT artifacts. |
| `MAP-REL-001` | `Codex2` / `Codex` | `todo` | `dependency-blocked` | `MAP-QA-002` and `MAP-OBS-001` attach final evidence. | Gate A-E release closeout. | Close only after every gap is `closed` or explicitly `external-gated` with owner/date. |

## 3. Required Start Order

1. Review/merge contract and backend authority tasks: `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-BE-005`.
2. Review/merge shared UI primitives: `MAP-UI-001`, `MAP-UI-002`, `MAP-UI-002-HARDEN-001`.
3. Execute `MAP-UI-002-INTEGRATE-001` so Platform Admin gets a single integrated GeometryEditor with hardening.
4. Start/finish remaining surfaces in parallel: `MAP-FE-ADM-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-MOB-DRV-001`.
5. Implement observability in `MAP-OBS-001` against real events/metrics from backend and surfaces.
6. Implement final cross-surface E2E in `MAP-QA-002`.
7. Close `MAP-REL-001` only after Gate A-E evidence is attached and every gap is `closed` or explicitly `external-gated`.

## 4. Task Kickoff Matrix

| Task | Status / blocker class | Production gate(s) | Required sidecar/evidence | Must prove before close |
| --- | --- | --- | --- | --- |
| `MAP-BE-001` | `review` / `review-blocked` | Gate A/E provenance. | `MAP-GAP-COVERAGE-SIDECAR`; reviewer notes. | Geo contracts keep legacy compatibility, validate coordinates, and preserve provider/manual/saved/reverse/external provenance in tests. |
| `MAP-BE-002` | `review` / `review-blocked` | Gate A/E geocode authority. | `MAP-GAP-COVERAGE-SIDECAR`; reviewer notes. | Provider-neutral search/resolve/reverse endpoints, deterministic mock provider, normalized errors, and API/contracts checks. |
| `MAP-BE-003` | `review` / `review-blocked` | Gate A/C/D/E API seam. | `MAP-GAP-COVERAGE-SIDECAR`; reviewer notes. | API-client exports stable coordinate/snapshot types used by Ops, Driver, and final E2E without ad hoc payload parsing. |
| `MAP-BE-005` | `review` / `review-blocked` | Gate A/B/C/D/E spatial audit. | `MAP-GAP-COVERAGE-SIDECAR`; reviewer notes. | Order creation persists coordinates, provenance, serviceability snapshot, policy/version IDs, and blocks backend bypass. |
| `MAP-UI-001` | `review` / `review-blocked` | Gate A/E entry consistency. | `MAP-FE-ENTRY-SIDECAR-GATEE`, `MAP-FE-CALL-001-SIDECAR-GATEA`. | Shared picker emits contract payloads, supports serviceability preview, exposes outage/manual fallback, and passes UI checks. |
| `MAP-UI-002` | `review` / `review-blocked` | Gate B governance. | `MAP-UI-002-SIDECAR-REVIEW`, `MAP-FE-ADM-001-SIDECAR-GATEB`. | Base geometry editor supports polygon/circle/route editing in a reusable package with tests. |
| `MAP-UI-002-HARDEN-001` | `review` / `review-blocked` | Gate B governance. | `MAP-UI-002-SIDECAR-REVIEW`, hardening review notes. | Geometry validation covers primitive/range/self-intersection and cannot regress admin publish safety. |
| `MAP-QA-001` | `review` / `review-blocked` | All gates test foundation. | `MAP-QA-002-SIDECAR-PLAN`. | Mocked-provider harness can deterministically exercise map flows without relying on live provider availability. |
| `MAP-FE-CALL-001` | `review` / `review-blocked` | Gate A and Gate E. | `MAP-FE-CALL-001-SIDECAR-GATEA`, `MAP-GAP-COVERAGE-SIDECAR`. | Phone agents cannot unknowingly create coordinate-less dispatchable orders; serviceable/blocked/manual-review/provider-degraded paths are visible and persisted. |
| `MAP-UI-002-INTEGRATE-001` | `backlog` / `dependency-blocked` | Gate B governance. | `MAP-UI-002-SIDECAR-REVIEW`, `MAP-UI-002-HARDEN-001` review notes. | Integrated GeometryEditor exposes primitive + range validation + self-intersection blocking in one branch; admin consumers can import it without half-merge risk. |
| `MAP-FE-ADM-001` | `todo` / `dependency-blocked` | Gate B governance. | `MAP-FE-ADM-001-SIDECAR-GATEB`, `MAP-GAP-COVERAGE-SIDECAR`. | Admin publish/retire without SQL, evaluator refresh, audit payload, invalid geometry rejection, callcenter blocked-after-publish, Phase 2 ODD/route separation, platform-admin checks. |
| `MAP-FE-TEN-001` | `backlog` / `dependency-blocked` | Gate E plus entry assertions. | `MAP-FE-ENTRY-SIDECAR-GATEE`, `MAP-GAP-COVERAGE-SIDECAR`. | Tenant saved-address pin confirmation, Tenant Console coordinate/provenance submit, serviceability preview, backend anti-bypass, provider outage/manual-review behavior, package checks. |
| `MAP-FE-CON-001` | `backlog` / `dependency-blocked` | Gate E plus entry assertions. | `MAP-FE-ENTRY-SIDECAR-GATEE`, `MAP-GAP-COVERAGE-SIDECAR`. | Concierge/partner picker integration, customer-safe reason copy, backend anti-bypass, provider outage/manual-review behavior, affected partner-entry inventory, package checks. |
| `MAP-MOB-DRV-001` | `backlog` / `dependency-blocked` | Gate D driver navigation. | `MAP-MOB-DRV-001-SIDECAR-UAT`, `MAP-GAP-COVERAGE-SIDECAR`. | Native trip map/pins, coordinate-based navigation, heartbeat coexistence, degraded fallback, route-authority copy, Android/iOS simulator or external-gated mobile UAT. |
| `MAP-OBS-001` | `todo` / `ready` | Gate A-E observability. | `MAP-OBS-001-SIDECAR-EVIDENCE`, `MAP-GAP-COVERAGE-SIDECAR`. | Metrics/audit/alerts/runbook prove provider outage, address ambiguity, policy denial, coordinate-less attempts, manual override, and geometry mutations are distinguishable. |
| `MAP-QA-002` | `todo` / `dependency-blocked` | Gate A-E E2E proof. | `MAP-QA-002-SIDECAR-PLAN`, `MAP-GAP-COVERAGE-SIDECAR`, all surface sidecars. | `E2E-MAP-001` through `E2E-MAP-007` produce command logs, screenshots/traces/UAT, branch/SHA, and API/audit assertions. |
| `MAP-REL-001` | `todo` / `dependency-blocked` | Gate A-E release closeout. | `MAP-REL-001-SIDECAR-GATE-AUDIT`, `MAP-GAP-COVERAGE-SIDECAR`. | Gate A-E pass/fail/external-gated report, rollout/rollback flags, PostGIS/provider prereqs, gap closeout, no unsupported production claim. |

## 5. Minimum Command Families

Each fleet handoff should include exact branch/SHA and command output for its packages.

| Surface | Minimum commands |
| --- | --- |
| Shared UI | `pnpm --filter @drts/ui-web typecheck`, `pnpm --filter @drts/ui-web test`, `pnpm --filter @drts/ui-web lint` |
| API/API-client | `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/api test`, `pnpm --filter @drts/api lint`, `pnpm --filter @drts/api-client typecheck` |
| Callcenter/Ops Console | `pnpm --filter @drts/ops-console-web typecheck`, `pnpm --filter @drts/ops-console-web test`, `pnpm --filter @drts/ops-console-web lint`, plus Gate A E2E evidence |
| Platform Admin | `pnpm --filter @drts/platform-admin-web typecheck`, `pnpm --filter @drts/platform-admin-web test`, `pnpm --filter @drts/platform-admin-web lint` |
| Tenant | `pnpm --filter @drts/tenant-portal-web typecheck`, `pnpm --filter @drts/tenant-portal-web test`, `pnpm --filter @drts/tenant-console-web typecheck`, `pnpm --filter @drts/tenant-console-web test` |
| Concierge/Partner | `pnpm --filter @drts/concierge-portal-web typecheck`, `pnpm --filter @drts/concierge-portal-web test`, `pnpm --filter @drts/partner-booking-web typecheck`, `pnpm --filter @drts/partner-booking-web test` |
| Driver App | `pnpm --filter @drts/driver-app typecheck`, `pnpm --filter @drts/driver-app test`, `pnpm --filter @drts/driver-app lint`, plus simulator/UAT evidence |
| Cross-surface E2E | `pnpm exec playwright test -c playwright.map-geofence-harness.config.ts`, targeted configs per sidecar, and `pnpm test:e2e` or documented substitutes |

If a package has no `test` or `lint` script, the owner must either add it or document the exact substitute evidence. Missing scripts cannot silently count as pass.

## 6. Required Handoff Template

Every owner handoff should include:

- Branch and commit SHA under review.
- Dependencies used and whether each was merged, cherry-picked, or substituted.
- Sidecar checklist items satisfied.
- Commands run with pass/fail result.
- E2E or UAT artifact paths.
- Known external-gated items.
- Explicit do-not-claim statement if production gate evidence is incomplete.

Suggested handoff text:

```text
This task satisfies branch-level implementation acceptance for <TASK-ID> on <branch>@<sha>. It does not by itself claim Gate <A-E> production pass. Final production readiness remains gated on MAP-QA-002, MAP-OBS-001, and MAP-REL-001 evidence.
```

## 7. Do-Not-Claim Rules

No fleet should claim:

- "production-ready"
- "Gate A/B/C/D/E pass"
- "E2E complete"
- "deployed to stage/prod"
- "provider outage safe"
- "driver navigation validated"

unless the exact release gate evidence exists in `MAP-QA-002`, `MAP-OBS-001`, and `MAP-REL-001`.

Safe interim wording:

- "Implementation branch is ready for review."
- "Sidecar evidence contract is satisfied."
- "Release gate remains pending final E2E/observability/release closeout."

## 8. Parent And QA Handoff

Recommended note for `MAP-REL-001`:

```text
Use support/sidecars/MAP-REL-001/MAP-FLEET-EXECUTION-KICKOFF.md as the fleet kickoff checklist. It defines start order, dependency blockers, required sidecars, commands, handoff templates, and do-not-claim rules for the remaining map/geofence production tasks.
```

Recommended note for `MAP-QA-002`:

```text
Use MAP-FLEET-KICKOFF-SIDECAR together with MAP-GAP-COVERAGE-SIDECAR to ensure final E2E only counts evidence from implementation branches with stable hooks, command output, and explicit mobile/UAT artifacts where automation is not available.
```
