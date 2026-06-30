# MAP Fleet Execution Kickoff Packet

**Sidecar task:** `MAP-FLEET-KICKOFF-SIDECAR`

**Parent task:** `MAP-REL-001` - Map/geofence production release gates

**Parent owner/reviewer:** `Codex2` / `Codex`

**Sidecar owner/reviewer:** `Codex` / `Codex2`

**Scope boundary:** support artifact only. This packet tells fleets how to start and close remaining implementation work; it does not claim production readiness.

## 1. Kickoff Verdict

The map/geofence wave is ready for focused fleet execution, but it is **not** production-ready.

The fleet should treat current work as three parallel lanes:

1. Review unblock lane: approve or reopen review-gated backend/UI/foundation tasks so implementation branches can test against stable contracts.
2. Surface implementation lane: build Platform Admin, Tenant, Concierge/Partner, and Driver map surfaces against the approved contracts and sidecar evidence packets.
3. L4 proof lane: implement `MAP-QA-002`, `MAP-OBS-001`, and `MAP-REL-001` only against integrated implementation branches, not sidecar plans alone.

Sidecar packets are acceptance contracts. They do not replace implementation, E2E, mobile UAT, audit, or release evidence.

## 2. Current Fleet Board Snapshot

| Lane | Tasks | Current state | Fleet action |
| --- | --- | --- | --- |
| Foundation review unblock | `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-BE-005`, `MAP-UI-001`, `MAP-UI-002`, `MAP-QA-001` | `review` | Reviewers should approve or reopen with specific fixes. Surface owners should not claim final production behavior until these are accepted/integrated. |
| Geometry integration unblock | `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001` | `review` / `backlog` | Finish hardening review, then run integration closeout so Platform Admin can build on one validated `GeometryEditor` surface. |
| Surface implementation | `MAP-FE-ADM-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-MOB-DRV-001` | `todo` / `backlog` | Start implementation only with the required sidecar evidence packets and dependency notes attached. |
| Final proof | `MAP-QA-002`, `MAP-OBS-001`, `MAP-REL-001` | `todo` | Prepare harness/fixtures now, but final pass requires implementation branches and evidence. |

## 3. Required Start Order

1. Review/merge contract and backend authority tasks: `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-BE-005`.
2. Review/merge shared UI primitives: `MAP-UI-001`, `MAP-UI-002`, `MAP-UI-002-HARDEN-001`.
3. Execute `MAP-UI-002-INTEGRATE-001` so Platform Admin gets a single integrated GeometryEditor with hardening.
4. Start/finish remaining surfaces in parallel: `MAP-FE-ADM-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-MOB-DRV-001`.
5. Implement observability in `MAP-OBS-001` against real events/metrics from backend and surfaces.
6. Implement final cross-surface E2E in `MAP-QA-002`.
7. Close `MAP-REL-001` only after Gate A-E evidence is attached and every gap is `closed` or explicitly `external-gated`.

## 4. Task Kickoff Matrix

| Task | Owner / reviewer | Start condition | Required sidecar/evidence | Must prove before close |
| --- | --- | --- | --- | --- |
| `MAP-UI-002-INTEGRATE-001` | `Codex` / `Claude2` | `MAP-UI-002` and `MAP-UI-002-HARDEN-001` are review-approved or their final commits are known. | `MAP-UI-002-SIDECAR-REVIEW`, `MAP-UI-002-HARDEN-001` review notes. | Integrated GeometryEditor exposes primitive + range validation + self-intersection blocking in one branch; admin consumers can import it without half-merge risk. |
| `MAP-FE-ADM-001` | `Codex2` / `Codex` | `MAP-BE-006` done, `MAP-UI-002-INTEGRATE-001` available, typed API-client service-area methods verified or added. | `MAP-FE-ADM-001-SIDECAR-GATEB`, `MAP-GAP-COVERAGE-SIDECAR`. | Admin publish/retire without SQL, evaluator refresh, audit payload, invalid geometry rejection, callcenter blocked-after-publish, Phase 2 ODD/route separation, platform-admin checks. |
| `MAP-FE-TEN-001` | `Claude2` / `Codex2` | `MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005` are accepted or tested branch contains final equivalents. | `MAP-FE-ENTRY-SIDECAR-GATEE`, `MAP-GAP-COVERAGE-SIDECAR`. | Tenant saved-address pin confirmation, Tenant Console coordinate/provenance submit, serviceability preview, backend anti-bypass, provider outage/manual-review behavior, package checks. |
| `MAP-FE-CON-001` | `Codex2` / `Claude` | `MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005` are accepted or tested branch contains final equivalents. | `MAP-FE-ENTRY-SIDECAR-GATEE`, `MAP-GAP-COVERAGE-SIDECAR`. | Concierge/partner picker integration, customer-safe reason copy, backend anti-bypass, provider outage/manual-review behavior, affected partner-entry inventory, package checks. |
| `MAP-MOB-DRV-001` | `Codex2` / `Claude2` | `MAP-BE-003` and `MAP-BE-005` are accepted or mobile fixture branch has stable trip coordinates/snapshots. | `MAP-MOB-DRV-001-SIDECAR-UAT`, `MAP-GAP-COVERAGE-SIDECAR`. | Native trip map/pins, coordinate-based navigation, heartbeat coexistence, degraded fallback, route-authority copy, Android/iOS simulator or external-gated mobile UAT. |
| `MAP-OBS-001` | `Codex2` / `Codex` | Backend event names and surface reason codes are stable enough to instrument. | `MAP-OBS-001-SIDECAR-EVIDENCE`, `MAP-GAP-COVERAGE-SIDECAR`. | Metrics/audit/alerts/runbook prove provider outage, address ambiguity, policy denial, coordinate-less attempts, manual override, and geometry mutations are distinguishable. |
| `MAP-QA-002` | `Codex2` / `Codex` | Surface tasks expose stable hooks or documented UAT artifacts; `MAP-QA-001` harness is accepted. | `MAP-QA-002-SIDECAR-PLAN`, `MAP-GAP-COVERAGE-SIDECAR`, all surface sidecars. | `E2E-MAP-001` through `E2E-MAP-007` produce command logs, screenshots/traces/UAT, branch/SHA, and API/audit assertions. |
| `MAP-REL-001` | `Codex2` / `Codex` | `MAP-QA-002` and `MAP-OBS-001` have final evidence. | `MAP-REL-001-SIDECAR-GATE-AUDIT`, `MAP-GAP-COVERAGE-SIDECAR`. | Gate A-E pass/fail/external-gated report, rollout/rollback flags, PostGIS/provider prereqs, gap closeout, no unsupported production claim. |

## 5. Minimum Command Families

Each fleet handoff should include exact branch/SHA and command output for its packages.

| Surface | Minimum commands |
| --- | --- |
| Shared UI | `pnpm --filter @drts/ui-web typecheck`, `pnpm --filter @drts/ui-web test`, `pnpm --filter @drts/ui-web lint` |
| API/API-client | `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/api test`, `pnpm --filter @drts/api lint`, `pnpm --filter @drts/api-client typecheck` |
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
