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

## 2. Machine-Truth Snapshot

As of 2026-06-30 UTC, the remaining map/geofence queue has no task in `ready`.

- `review-blocked`: 10 tasks are already in `review` and waiting reviewer approval or explicit reopen, including the integrated `GeometryEditor` branch for Platform Admin.
- `dependency-blocked`: 7 tasks are still in `backlog` or `todo` because at least one prerequisite task is not yet closed on an integrated branch or review outcome.
- `ready`: 0 tasks. The next supervisor cycle should spend effort on review throughput, not on opening more parallel implementation work.

Merged prerequisites already satisfied on `dev`:

| Task | Gate coverage unlocked | Machine-truth state |
| --- | --- | --- |
| `MAP-PROD-000` | Provider and rollout policy for Gate A-E | `done`, recorded as merged to `dev` |
| `MAP-INFRA-001` | Provider config, quota, and health rails for Gate A-E | `done`, recorded as merged to `dev` |
| `MAP-BE-004` | Backend service-area enforcement for Gate A/C/E surfaces | `done`, recorded as merged to `dev` |
| `MAP-BE-006` | Governance lifecycle APIs for Gate B | `done`, recorded as merged to `dev` |
| `MAP-FE-OPS-001` | Ops real-map surface for Gate C | `done`, recorded as merged to `dev` |

Evidence source rule:

- If a task has a dedicated sidecar packet on another branch, the handoff must cite `origin/<branch>@<sha>:<path>`.
- If a task does not have a dedicated sidecar packet yet, the machine-truth task handoff in `ai-status` plus branch/SHA plus command logs is the required evidence packet.

## 3. Required Start Order

1. Review/merge contract and backend authority tasks: `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-BE-005`.
2. Review/merge shared UI and proof prerequisites: `MAP-UI-001`, `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, `MAP-FE-CALL-001`, `MAP-QA-001`.
3. Review/merge `MAP-UI-002-INTEGRATE-001` so Platform Admin gets one validated `GeometryEditor` branch with hardening included.
4. Start/finish remaining surfaces in parallel once their current review prerequisites close: `MAP-FE-ADM-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-MOB-DRV-001`.
5. Implement `MAP-OBS-001` only after backend event names and surface reason codes are stable.
6. Implement `MAP-QA-002` only after the surface tasks expose stable hooks or explicit UAT artifacts.
7. Close `MAP-REL-001` only after Gate A-E evidence is attached and every remaining gap is `closed`, `failed`, or explicitly `external-gated`.

## 4. Remaining Task Board

### 4.1 Review-blocked queue

| Task | Owner / reviewer | Status | Class | Current start condition or next action | Production gate | Dependency snapshot |
| --- | --- | --- | --- | --- | --- | --- |
| `MAP-BE-001` | `Codex` / `Claude2` | `review` | `review-blocked` | Start condition is already satisfied; reviewer now closes or reopens the geo-contract and provenance packet. | Gate A-E foundation | `MAP-PROD-000 done` |
| `MAP-BE-002` | `Codex` / `Claude2` | `review` | `review-blocked` | Start condition is already satisfied; reviewer now closes or reopens the backend geo gateway packet. | Gate A-E foundation | `MAP-BE-001 review`, `MAP-INFRA-001 done` |
| `MAP-BE-003` | `Codex` / `Claude2` | `review` | `review-blocked` | Start condition is already satisfied; reviewer now closes or reopens the typed API-client packet. | Gate A-E foundation | `MAP-BE-001 review`, `MAP-BE-002 review` |
| `MAP-BE-005` | `Codex` / `Claude2` | `review` | `review-blocked` | Start condition is already satisfied; reviewer now closes or reopens the spatial audit snapshot packet. | Gate A-E foundation | `MAP-BE-004 done` |
| `MAP-UI-001` | `Codex` / `Claude2` | `review` | `review-blocked` | Start condition is already satisfied; reviewer now closes or reopens the shared `AddressMapPicker` packet. | Gate A/C/E foundation | `MAP-BE-003 review` |
| `MAP-UI-002` | `Codex2` / `Claude2` | `review` | `review-blocked` | Sidecar review currently says "do not approve yet"; missing root test import, coordinate range validation, and polygon self-intersection validation must be fixed or explicitly reopened. | Gate B foundation | `MAP-BE-006 done` |
| `MAP-FE-CALL-001` | `Codex` / `Claude2` | `review` | `review-blocked` | Start condition is already satisfied; reviewer now validates Gate A evidence while keeping final Gate A claim blocked on `MAP-QA-002`. | Gate A | `MAP-UI-001 review`, `MAP-BE-004 done`, `MAP-BE-005 review` |
| `MAP-QA-001` | `Codex` / `Claude2` | `review` | `review-blocked` | Start condition is already satisfied; reviewer now closes or reopens the offline harness/fixture packet so `MAP-QA-002` has stable mocked-provider rails. | Gate A-E proof foundation | `MAP-BE-002 review`, `MAP-UI-001 review` |
| `MAP-UI-002-HARDEN-001` | `Codex2` / `Claude2` | `review` | `review-blocked` | Start condition is already satisfied; reviewer now validates the hardening proof and package-local checks before closeout. | Gate B foundation | `MAP-BE-006 done` |
| `MAP-UI-002-INTEGRATE-001` | `Codex` / `Claude2` | `review` | `review-blocked` | Start condition is already satisfied; reviewer now validates the integrated `GeometryEditor` branch, exact upstream commits, and restored admin consumer wiring before `MAP-FE-ADM-001` treats it as stable input. | Gate B | `MAP-UI-002 review`, `MAP-UI-002-HARDEN-001 review` |

### 4.2 Dependency-blocked queue

| Task | Owner / reviewer | Status | Class | Current start condition or next action | Production gate | Dependency snapshot |
| --- | --- | --- | --- | --- | --- | --- |
| `MAP-FE-ADM-001` | `Codex2` / `Codex` | `todo` | `dependency-blocked` | Do not start implementation until `MAP-BE-006` is consumed together with the integrated `GeometryEditor` branch now under review in `MAP-UI-002-INTEGRATE-001`; wait for that review outcome before treating the admin dependency set as stable. | Gate B | `MAP-BE-006 done`, `MAP-UI-002 review`, `MAP-UI-002-HARDEN-001 review`, `MAP-UI-002-INTEGRATE-001 review` |
| `MAP-FE-TEN-001` | `Claude2` / `Codex2` | `backlog` | `dependency-blocked` | Do not start implementation until `MAP-UI-001` and `MAP-BE-005` are accepted or pinned into a stable review branch together with `MAP-BE-004`. | Gate E | `MAP-UI-001 review`, `MAP-BE-004 done`, `MAP-BE-005 review` |
| `MAP-FE-CON-001` | `Codex2` / `Claude` | `backlog` | `dependency-blocked` | Do not start implementation until `MAP-UI-001` and `MAP-BE-005` are accepted or pinned into a stable review branch together with `MAP-BE-004`. | Gate E | `MAP-UI-001 review`, `MAP-BE-004 done`, `MAP-BE-005 review` |
| `MAP-MOB-DRV-001` | `Codex2` / `Claude2` | `backlog` | `dependency-blocked` | Do not start implementation until stable trip coordinates and persisted snapshots are available from `MAP-BE-003` and `MAP-BE-005`. | Gate D | `MAP-BE-003 review`, `MAP-BE-005 review` |
| `MAP-OBS-001` | `Codex2` / `Codex` | `todo` | `dependency-blocked` | Do not start final instrumentation until backend event names and surface reason codes stabilize from `MAP-BE-002` and `MAP-BE-005`; `MAP-BE-006` is already available. | Gate A-E proof | `MAP-BE-002 review`, `MAP-BE-005 review`, `MAP-BE-006 done` |
| `MAP-QA-002` | `Codex2` / `Codex` | `todo` | `dependency-blocked` | Do not start final cross-surface pass until `MAP-FE-CALL-001`, `MAP-FE-ADM-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-MOB-DRV-001`, and `MAP-QA-001` expose stable hooks or explicit UAT artifacts. | Gate A-E proof | `MAP-FE-CALL-001 review`, `MAP-FE-OPS-001 done`, `MAP-FE-TEN-001 backlog`, `MAP-FE-CON-001 backlog`, `MAP-FE-ADM-001 todo`, `MAP-MOB-DRV-001 backlog`, `MAP-QA-001 review` |
| `MAP-REL-001` | `Codex2` / `Codex` | `todo` | `dependency-blocked` | Do not start final gate closeout until `MAP-QA-002` and `MAP-OBS-001` deliver final evidence packets on integrated branches. | Gate A-E final audit | `MAP-QA-002 todo`, `MAP-OBS-001 todo` |

## 5. Task Kickoff Matrix

### 5.1 Foundation and review packets

| Task | Required sidecar or evidence packet | Must-run command family | Handoff expectation |
| --- | --- | --- | --- |
| `MAP-BE-001` | Machine-truth handoff in `ai-status` plus branch/SHA and command logs. | `Contracts`, `API` | Preserve legacy `AddressPayload.lat/lng` compatibility and explicitly say downstream Gate A-E proof is still pending. |
| `MAP-BE-002` | Machine-truth handoff in `ai-status` plus branch/SHA and command logs. | `API`, `Contracts` | Record provider error normalization and backend authority coverage; do not claim surface readiness. |
| `MAP-BE-003` | Machine-truth handoff in `ai-status` plus branch/SHA and command logs. | `API client`, `API` | Record typed client methods and error-envelope coverage needed by downstream web/mobile surfaces. |
| `MAP-BE-005` | Machine-truth handoff in `ai-status` plus branch/SHA and command logs. | `Contracts`, `API` | Record persisted spatial snapshots, geometry refs, and legacy/manual-review handling; do not claim Gate A-E pass. |
| `MAP-UI-001` | Machine-truth handoff in `ai-status` plus branch/SHA and command logs. | `Shared UI` | Record shared picker behavior, provider-outage visibility, and any remaining design-canvas signoff work. |
| `MAP-UI-002` | `origin/codex/map-ui-002-sidecar-review@9810eb16aa126c7aca0cd595e2449171e90f9eef:support/sidecars/MAP-UI-002/MAP-UI-002-SIDECAR-REVIEW.md` | `Shared UI`, `Platform Admin` | Either fix every sidecar blocker or reopen; do not hand off Platform Admin work against a half-validated `GeometryEditor`. |
| `MAP-FE-CALL-001` | `origin/codex/map-fe-call-001-sidecar-gatea@54604cf6f:support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-GATE-A-EVIDENCE.md` | `Ops Console`, `Cross-surface E2E` | Record serviceable, blocked, manual-review, degraded, backend-authority, and snapshot evidence; state that final Gate A proof still belongs to `MAP-QA-002`. |
| `MAP-QA-001` | Machine-truth handoff in `ai-status` plus harness docs and artifact paths from the review branch. | `Cross-surface E2E`, `Shared UI`, `API` | Record fixture inventory, targeted Playwright config, and offline-provider assumptions that `MAP-QA-002` must inherit. |
| `MAP-UI-002-HARDEN-001` | Machine-truth handoff in `ai-status`, package-local verification logs, and commit `414f27484`. | `Shared UI`, `Platform Admin` | Record range validation, self-intersection blocking, and GeoJSON import guardrails; note that one integrated consumer branch is still pending. |

### 5.2 Implementation-start packets

| Task | Required sidecar or evidence packet | Must-run command family | Handoff expectation |
| --- | --- | --- | --- |
| `MAP-UI-002-INTEGRATE-001` | Consume the `MAP-UI-002` review packet above plus the `MAP-UI-002-HARDEN-001` review handoff on one branch. | `Shared UI`, `Platform Admin` | Name the exact upstream commits composed together and prove that admin consumers import one integrated `GeometryEditor` surface. |
| `MAP-FE-ADM-001` | `origin/codex/map-fe-adm-001-sidecar-gateb@3c460c150:support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-GATE-B-GOVERNANCE.md` | `Platform Admin`, `API client` | Record publish/retire, evaluator refresh, audit payload, invalid geometry rejection, and do-not-claim wording for Gate B until final proof lands. |
| `MAP-FE-TEN-001` | `origin/codex/map-fe-entry-sidecar-gatee@606cce9c7:support/sidecars/MAP-FE-ENTRY-SURFACES/MAP-FE-ENTRY-GATE-E-CONSISTENCY.md` | `Tenant` | Record saved-address pin confirmation, coordinate/provenance submit, serviceability preview, backend anti-bypass, and degraded/manual-review behavior. |
| `MAP-FE-CON-001` | `origin/codex/map-fe-entry-sidecar-gatee@606cce9c7:support/sidecars/MAP-FE-ENTRY-SURFACES/MAP-FE-ENTRY-GATE-E-CONSISTENCY.md` | `Concierge/Partner` | Record customer-safe reason copy, backend anti-bypass, degraded/manual-review behavior, and affected partner-entry inventory. |
| `MAP-MOB-DRV-001` | `origin/codex/map-mob-drv-001-sidecar-uat@0e727a5cf:support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT.md` | `Driver App` | Record native map rendering, coordinate-based navigation, heartbeat coexistence, degraded fallback, and Android/iOS simulator or external-gated UAT artifact paths. |

### 5.3 Proof and release packets

| Task | Required sidecar or evidence packet | Must-run command family | Handoff expectation |
| --- | --- | --- | --- |
| `MAP-OBS-001` | `origin/codex/map-obs-001-sidecar-evidence@bb497376fae55e5ae42224b4e71a5be7c871d891:support/sidecars/MAP-OBS-001/MAP-OBS-001-EVIDENCE-CONTRACT.md` | `API`, `Release/provider preflight` | Record event names, metrics, alerts, dashboards, and runbook evidence proving provider outage, address ambiguity, policy denial, coordinate-less attempts, manual override, and geometry mutations are distinguishable. |
| `MAP-QA-002` | Dependency task `MAP-QA-002-SIDECAR-PLAN` plus `origin/codex/map-gap-coverage-sidecar@37aeb91ad:support/sidecars/MAP-REL-001/MAP-GAP-TO-TASK-COVERAGE-MATRIX.md` and all surface sidecars. | `Cross-surface E2E`, `Ops Console`, `Platform Admin`, `Tenant`, `Concierge/Partner`, `Driver App` | Record branch/SHA, command logs, screenshots/traces/UAT artifacts, and explicit surface substitutions for every `E2E-MAP-001` through `E2E-MAP-007` assertion. |
| `MAP-REL-001` | Dependency task `MAP-REL-001-SIDECAR-GATE-AUDIT` plus `MAP-GAP-COVERAGE-SIDECAR` at `origin/codex/map-gap-coverage-sidecar@37aeb91ad:support/sidecars/MAP-REL-001/MAP-GAP-TO-TASK-COVERAGE-MATRIX.md` and this kickoff packet. | `Release/provider preflight`, `Cross-surface E2E` | Final report must use only `pass`, `fail`, or `external-gated` for Gate A-E and must not claim production-ready without the underlying `MAP-QA-002` and `MAP-OBS-001` evidence. |

## 6. Command Family Expansion

Each fleet handoff should include exact branch/SHA and command output for its packages.

| Command family | Exact minimum commands |
| --- | --- |
| `Contracts` | `pnpm --filter @drts/contracts typecheck`, `pnpm --filter @drts/contracts test` |
| `API` | `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/api test`, `pnpm --filter @drts/api lint` |
| `API client` | `pnpm --filter @drts/api-client typecheck` |
| `Shared UI` | `pnpm --filter @drts/ui-web typecheck`, `pnpm --filter @drts/ui-web test`, `pnpm --filter @drts/ui-web lint` |
| `Ops Console` | `pnpm --filter @drts/ops-console-web typecheck`, `pnpm --filter @drts/ops-console-web test`, `pnpm --filter @drts/ops-console-web lint` |
| `Platform Admin` | `pnpm --filter @drts/platform-admin-web typecheck`, `pnpm --filter @drts/platform-admin-web test`, `pnpm --filter @drts/platform-admin-web lint` |
| `Tenant` | `pnpm --filter @drts/tenant-portal-web typecheck`, `pnpm --filter @drts/tenant-portal-web test`, `pnpm --filter @drts/tenant-console-web typecheck`, `pnpm --filter @drts/tenant-console-web test` |
| `Concierge/Partner` | `pnpm --filter @drts/concierge-portal-web typecheck`, `pnpm --filter @drts/concierge-portal-web test`, `pnpm --filter @drts/partner-booking-web typecheck`, `pnpm --filter @drts/partner-booking-web test` |
| `Driver App` | `pnpm --filter @drts/driver-app typecheck`, `pnpm --filter @drts/driver-app test`, `pnpm --filter @drts/driver-app lint`, plus simulator/UAT evidence |
| `Cross-surface E2E` | `pnpm exec playwright test -c playwright.map-geofence-harness.config.ts`, targeted configs per sidecar, and `pnpm test:e2e` or documented substitutes |
| `Release/provider preflight` | `scripts/check-map-provider-config.sh`, rerun the required `Cross-surface E2E` commands, and attach the alert/runbook evidence referenced by `MAP-OBS-001` |

If a package has no `test` or `lint` script, the owner must either add it or document the exact substitute evidence. Missing scripts cannot silently count as pass.

## 7. Required Handoff Template

Every owner handoff should include:

- Branch and commit SHA under review.
- Dependencies used and whether each was merged, cherry-picked, or substituted.
- Required sidecar packet ref. If the packet lives on another branch, cite `origin/<branch>@<sha>:<path>`.
- Commands run with pass/fail result.
- E2E or UAT artifact paths.
- Known external-gated items.
- Explicit do-not-claim statement if production gate evidence is incomplete.

Suggested handoff text:

```text
This task satisfies branch-level implementation acceptance for <TASK-ID> on <branch>@<sha>. It does not by itself claim Gate <A-E> production pass. Final production readiness remains gated on MAP-QA-002, MAP-OBS-001, and MAP-REL-001 evidence.
```

## 8. Do-Not-Claim Rules

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

## 9. Parent And Proof Handoff Notes

Recommended note for `MAP-REL-001`:

```text
Use support/sidecars/MAP-REL-001/MAP-FLEET-EXECUTION-KICKOFF.md as the machine-truth kickoff checklist for all remaining map/geofence tasks, and pair it with MAP-GAP-COVERAGE-SIDECAR on origin/codex/map-gap-coverage-sidecar@37aeb91ad:support/sidecars/MAP-REL-001/MAP-GAP-TO-TASK-COVERAGE-MATRIX.md. This packet does not claim production readiness; it only defines owner/reviewer/status, blocker class, start condition, sidecar, command, and handoff rules.
```

Recommended note for `MAP-QA-002`:

```text
Use MAP-FLEET-KICKOFF-SIDECAR together with MAP-QA-002-SIDECAR-PLAN and MAP-GAP-COVERAGE-SIDECAR so final E2E only counts evidence from implementation branches with stable hooks, command output, branch/SHA, and explicit mobile simulator or UAT artifacts where automation is not available.
```
