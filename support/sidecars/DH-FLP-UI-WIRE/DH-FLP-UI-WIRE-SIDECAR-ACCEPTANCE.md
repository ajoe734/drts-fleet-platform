# DH-FLP-UI-WIRE Sidecar Acceptance Packet

This document is the parallel support packet for `DH-FLP-UI-WIRE` ("Fleet Portal: wire pages to live `/api/fleet-partner/*`, replace fixtures"). It does **not** change canonical truth. It consolidates the repo facts that the assigned reviewer (`Codex`) and the parent-task owner (`Claude`) need while the parent task is in review and heading toward closeout.

Anchors used here come from machine truth and the canonical handoff, not from prose summaries:

- `ai-status.json` (via `scripts/ai-status.sh show <id>` slices only — never the full file)
- `docs/05-ui/fleet-partner-portal-design-handoff-20260604.md`
- `docs/05-ui/design-handoff-20260525-implementation-plan.md` (parent's cited plan)
- `packages/api-client/src/index.ts` (dependency surface, on `origin/codex2/dh-flp-be-client`)
- `apps/fleet-partner-portal-web/app/**` and `apps/fleet-partner-portal-web/lib/**` (on `origin/claude/dh-flp-ui-wire`)

## §1 Scope & Boundary

- **Task ID:** `DH-FLP-UI-WIRE-SIDECAR-ACCEPTANCE`
- **Parent Task:** `DH-FLP-UI-WIRE`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Claude2`
- **Reviewer:** `Claude`
- **Mutates Canonical:** `false`
- **Objective:** Hand off a reviewer-facing acceptance checklist and dependency map for the parent Fleet Portal wiring task without editing L1/L2 truth, runtime code, the `packages/api-client` surface, or the parent backlog item itself.

Guardrails for this packet:

- Do not change `DH-FLP-UI-WIRE` scope beyond what `ai-status.json` and the canonical handoff already state.
- Do not invent backend/API dependencies. The portal API set is fixed by SD §6.2; pages without a defined endpoint stay contract-gap pages and must be fixture-only with a visible degraded notice — not silently "wired".
- Keep the sidecar output confined to `support/sidecars/DH-FLP-UI-WIRE/`.

## §2 Machine-Truth Anchors

### Parent Task: `DH-FLP-UI-WIRE`

| Field                          | Value                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Title                          | `Fleet Portal: wire pages to live /api/fleet-partner/* (replace fixtures)`                                               |
| Phase                          | `design-handoff-followups-202606`                                                                                       |
| Owner                          | `Claude`                                                                                                                |
| Reviewer                       | `Codex`                                                                                                                 |
| Status                         | `in_progress` (most recent transition: a `reopen`/review-failed; see §6)                                                |
| Depends on                     | `DH-FLP-BE-CLIENT`                                                                                                       |
| Branch                         | `origin/claude/dh-flp-ui-wire` — head `02110237` "give dashboard recent-trips its own source flag"                       |
| Acceptance in `ai-status.json` | All 10 routes render live partner-scoped data with graceful fallback; no hardcoded fixtures in the render path; typecheck+lint+build pass |
| Last update                    | `2026-06-06T11:11:18Z`                                                                                                  |

Parent prerequisite recorded in the parent summary: **PR #541 must already be merged into `dev`** before the parent edits land on `dev`. The `apps/fleet-partner-portal-web` tree is **not present on `dev`** as of this packet — it currently lives only on `origin/claude/dh-flp-ui-wire`. Treat any "wired" claim as branch-local until that prereq + this branch are on `dev`.

### Sidecar Task: `DH-FLP-UI-WIRE-SIDECAR-ACCEPTANCE`

| Field               | Value                                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| Owner               | `Claude2`                                                                    |
| Reviewer            | `Claude`                                                                     |
| Status              | `in_progress`                                                                |
| `task_class`        | `sidecar`                                                                    |
| `helper_kind`       | `acceptance_packet`                                                          |
| `mutates_canonical` | `false`                                                                      |
| Artifact            | `support/sidecars/DH-FLP-UI-WIRE/DH-FLP-UI-WIRE-SIDECAR-ACCEPTANCE.md`       |

## §3 Dependency Map

### Direct dependency: `DH-FLP-BE-CLIENT` — `@drts/api-client` fleet-portal methods

| Field              | Value                                                              |
| ------------------ | ----------------------------------------------------------------- |
| Status             | `done`                                                             |
| Owner              | `Codex2`                                                           |
| Reviewer           | `Codex`                                                            |
| Depends on         | `DH-FLP-BE-ENDPOINTS`                                              |
| Commit             | `aa476dae` — `DH-FLP-BE-CLIENT: close out reviewed api client methods` |
| Push               | `origin/codex2/dh-flp-be-client`                                   |
| Integration status | `branch_pushed` (⚠ **not** `merged_to_dev`)                       |
| Recorded at        | `2026-06-06T10:34:11Z`                                             |

`DH-FLP-BE-CLIENT` is the concrete prerequisite for the parent's `lib/api-client.server.ts` seam. The client methods it ships are confirmed present in `packages/api-client/src/index.ts` on `origin/codex2/dh-flp-be-client`:

| Client method                   | Backing endpoint (SD §6.2)               | Status         |
| ------------------------------- | ---------------------------------------- | -------------- |
| `listFleetPortalStatements()`   | `GET /api/fleet-partner/statements`      | pre-existing   |
| `listFleetPortalDashboard()`    | `GET /api/fleet-partner/dashboard`       | new in dep     |
| `listFleetPortalDrivers()`      | `GET /api/fleet-partner/drivers`         | new in dep     |
| `listFleetPortalVehicles()`     | `GET /api/fleet-partner/vehicles`        | new in dep     |
| `listFleetPortalTrips()`        | `GET /api/fleet-partner/trips`           | new in dep     |
| `getFleetPortalQualityMetrics()`| `GET /api/fleet-partner/quality-metrics` | new in dep     |

These six methods cover exactly the six SD-defined portal endpoints. The portal requires the `x-fleet-partner-id` header; the dep added client support for passing it, which the parent's `api-client.server.ts` must supply alongside control-plane auth.

### Transitive dependency: `DH-FLP-BE-ENDPOINTS` — contract source

| Field              | Value                          |
| ------------------ | ------------------------------ |
| Status             | `done`                         |
| Owner              | `Codex`                        |
| Reviewer           | `Codex2`                       |
| Commit             | `5770299f`                     |
| Push               | `origin/codex/dh-flp-be-endpoints` |
| Integration status | `branch_pushed`                |

This is the source of the response contracts (`FleetPartnerPortal*Record`) the dep methods are typed against. Both upstreams are `branch_pushed`, not `merged_to_dev`; the full chain (endpoints → client → UI wire) is staged across three unmerged branches plus the PR #541 prereq.

### Design / contract authority

`docs/05-ui/fleet-partner-portal-design-handoff-20260604.md` is the canonical page+endpoint authority. Key facts the reviewer must hold:

- SA §7.5 defines **9 P0 pages**; SD §6.2 defines **6 portal endpoints**.
- Six pages have a primary endpoint: **Dashboard, Drivers, Vehicles, Trips, Revenue Share/Statements, Quality Metrics** (Dashboard may also read `quality-metrics` as a supporting summary).
- Three pages are **contract-gap** pages with **no portal endpoint in SD §6.2**: **Documents, Training, Incidents/Complaints**. The handoff (§5.6–§5.8, §7, §9) is explicit that these must stay marked contract-dependent and must not be invented.

### Parent branch baseline (route inventory)

`origin/claude/dh-flp-ui-wire` ships these route files under `apps/fleet-partner-portal-web/app/`:

`page.tsx` (root), `dashboard/`, `drivers/`, `vehicles/`, `trips/`, `statements/`, `revenue/`, `quality/`, `documents/`, `training/`, `cases/`.

**9-page → 10-route reconciliation** (resolves the "10 routes" in parent acceptance vs "9 P0 pages" in the handoff):

| SA §7.5 P0 page          | Implemented route(s)        | Endpoint-backed?                       |
| ------------------------ | --------------------------- | -------------------------------------- |
| Dashboard                | `dashboard/`                | yes — `dashboard` (+ `quality-metrics`)|
| Drivers                  | `drivers/`                  | yes — `drivers`                        |
| Vehicles                 | `vehicles/`                 | yes — `vehicles`                       |
| Trips                    | `trips/`                    | yes — `trips`                          |
| Revenue Share / Statements | `revenue/` **and** `statements/` | yes — `statements`               |
| Quality Metrics          | `quality/`                  | yes — `quality-metrics`                |
| Documents                | `documents/`                | **no — contract gap, fixture-only**    |
| Training                 | `training/`                 | **no — contract gap, fixture-only**    |
| Incidents / Complaints   | `cases/`                    | **no — contract gap, fixture-only**    |

The SA "Revenue Share / Statements" page is split into two routes (`revenue/` + `statements/`), which is what makes the count 10. The fixture seam lives in `lib/fleet-portal-fixtures.ts`; the live-vs-fixture resolution lives in `lib/fleet-portal-data.server.ts`; the scoped client wrapper is `lib/api-client.server.ts`.

## §4 Parent-Task Acceptance Checklist (`DH-FLP-UI-WIRE`)

Reviewer-facing gates derived from `ai-status.json` acceptance, the canonical handoff, and the dependency contract. Intentionally specific so the parent owner/reviewer can use them without reinterpreting scope.

### A. Scope gates

- [ ] The **6 endpoint-backed routes** (`dashboard`, `drivers`, `vehicles`, `trips`, `statements`, `quality`) render **live partner-scoped data** via the `DH-FLP-BE-CLIENT` methods, not fixtures, on the happy path.
- [ ] The `revenue/` route is consistent with `statements/` (same `statements` endpoint source); no second invented endpoint.
- [ ] The **3 contract-gap routes** (`documents`, `training`, `cases`) render fixtures **with a visible degraded/contract-not-ready notice** — they must not be presented as live, and must not invent a `/api/fleet-partner/{documents,training,incidents,complaints}` endpoint.
- [ ] `lib/api-client.server.ts` is fleet-partner-scoped: control-plane auth **and** `x-fleet-partner-id` resolution are applied; partner scoping is not bypassable.
- [ ] No hardcoded fixtures remain in the render path of the 6 live routes (acceptance: "no hardcoded fixtures in the render path").
- [ ] Graceful fallback is per-endpoint: when an endpoint is unavailable, that surface shows fixtures **plus an explicit data-source notice**, following the ops-detail pattern.
- [ ] Central `t()` i18n is preserved across all wired routes (no inlined strings introduced by the wiring).

### B. Verification gates

- [ ] `pnpm --filter @drts/fleet-partner-portal-web typecheck`
- [ ] `pnpm --filter @drts/fleet-partner-portal-web lint`
- [ ] `pnpm --filter @drts/fleet-partner-portal-web build`
- [ ] Run the gates **at the parent branch tip** (`origin/claude/dh-flp-ui-wire`), in a worktree whose HEAD is the reviewed commit — **not** at canonical root on `dev` (where the app does not exist → vacuous pass). Build workspace deps first if typecheck shows phantom cross-package errors.
- [ ] Confirm no `as`-cast hides a missing field: the UI must consume the dep's `FleetPartnerPortal*Record` contracts as typed, not re-declare a write/receipt envelope the backend does not emit.

### C. Source-honesty gate (the live review finding)

- [ ] **Dashboard recent-trips must carry its own `source` flag.** The prior review failed because `loadDashboard()` folded the trips fallback into `recentTrips` without a per-block source flag, so a KPI-live + trips-error state rendered **mock trip rows labeled live** (`fleet-portal-data.server.ts` ~464–513 and `dashboard/page.tsx` ~76–132 at commit `b2e0184d`). Parent head `02110237` ("give dashboard recent-trips its own source flag") claims to fix this — the reviewer must re-verify that every independently-fetched block on every page surfaces its own live/fixture source, with no composite block silently mixing the two.

### D. Guardrails

- [ ] No L1/L2 canonical truth, contract source, `packages/api-client`, or registry/governance file is edited by the parent beyond `apps/fleet-partner-portal-web/**`.
- [ ] No contract-gap page is "completed" by inventing an endpoint or hiding the degraded state.
- [ ] Parent review rejects any completion claim that omits a route, mixes mock+live under one source flag, or runs gates only at canonical root.

## §5 Packet Completeness Check

Acceptance points for this sidecar artifact itself; complete as of this writing.

- [x] Anchored to `ai-status.json` slices for the sidecar, parent, direct dep, and transitive dep.
- [x] Names the direct dependency `DH-FLP-BE-CLIENT` and records its done-state commit `aa476dae` / `origin/codex2/dh-flp-be-client`, with the **6 confirmed client methods** mapped to endpoints.
- [x] Records the transitive contract dep `DH-FLP-BE-ENDPOINTS` (`5770299f`) and flags both upstreams as `branch_pushed`, not merged.
- [x] Reconciles the "10 routes" (acceptance) vs "9 P0 pages" (handoff) against the **actual route inventory on `origin/claude/dh-flp-ui-wire`**.
- [x] Separates the 6 endpoint-backed routes from the 3 contract-gap routes per SD §6.2 / handoff §7.
- [x] Captures the live review finding (dashboard recent-trips source flag) and the parent's follow-up commit `02110237`.
- [x] Only support-artifact content for this task is this file under `support/sidecars/DH-FLP-UI-WIRE/`.

## §6 Reviewer Handoff Notes (for `Claude`)

1. Reconfirm `ai-status.json` still shows `DH-FLP-UI-WIRE` as owned by `Claude`, reviewed by `Codex`, dependent on `DH-FLP-BE-CLIENT`. As of this packet the parent is **back in `in_progress` after a review-failed (`reopen`)** — the cited failure is the dashboard mock-trips-as-live seam. If that machine truth changes, refresh §2/§4 before approving this packet.
2. This packet is a **start/review gate, not evidence the parent is done**. The Fleet Portal app does not exist on `dev`; the whole chain (endpoints → client → UI) plus PR #541 is staged on unmerged branches. Do not let a "wired to live" claim be read as `dev_deployed`.
3. Both upstream deps are `branch_pushed`. Before the parent can integrate, the dep merge order is: PR #541 → `DH-FLP-BE-ENDPOINTS` → `DH-FLP-BE-CLIENT` → this UI wire. Flag if the parent tries to merge ahead of its `@drts/api-client` dependency.
4. The three contract-gap pages (`documents`, `training`, `cases`) are **expected to remain fixture-backed**. Do not treat their non-live state as a parent defect; treat a *missing degraded notice* or an *invented endpoint* as the defect.
5. Treat this as a sidecar-only support packet. It must not be used to broaden `DH-FLP-UI-WIRE` into building the missing Documents/Training/Incidents contracts — those are separate backend follow-ups (handoff §9).
6. Approval should verify the only task-scoped content edit is `support/sidecars/DH-FLP-UI-WIRE/DH-FLP-UI-WIRE-SIDECAR-ACCEPTANCE.md`, plus machine-truth state transitions recorded through `scripts/ai-status.sh`.
