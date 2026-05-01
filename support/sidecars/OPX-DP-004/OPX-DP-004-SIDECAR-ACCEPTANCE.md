# OPX-DP-004 Acceptance Packet

Task: **Dispatch map board and spatial operations uplift**
Parent task: `OPX-DP-004`
Sidecar ID: `OPX-DP-004-SIDECAR-ACCEPTANCE`
Prepared by: `Claude2`
Reviewer: `Codex`
Date: `2026-04-30`

---

## 1. Dependency Map

| Dependency   | Title                                                        | Status   | Impact on OPX-DP-004                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPX-DP-001` | Queue-entry policy and reservation vs realtime orchestration | **done** | Prerequisite queue-entry conditions, reservation holds, and exception-hold criteria are in place. OPX-DP-004 builds the spatial visualization layer over the queue and dispatch states that OPX-DP-001 established. |
| `OPX-GV-002` | Workflow-based acceptance matrix and release gates           | **done** | Release gate framework is established. OPX-DP-004 can reference the acceptance matrix to ensure map-board work satisfies the governed verification pattern (web typecheck + manual map smoke).                      |

Both dependencies are satisfied. No blocking upstream work remains.

---

## 2. Acceptance Criteria Checklist

Source: `ai-status.json` acceptance field for OPX-DP-004 and `docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md` section `OPX-DP-004`.

### AC-1: Operators can view spatial context for queue and candidate supply

| Check                                                                                                        | Evidence                                                                                                                          | Status  |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Dispatch workflow renders queue state per order (`pending`, `reserved`, `exception`, `timeout`, `no_supply`) | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:29-34,54-92` (`getQueueState`, `getQueueStateKey`, `getQueueStateColor`) | PARTIAL |
| SSE stream includes `driver_location_updated` and `supply_lifecycle_updated` events                          | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:270-277,308-315`                                                         | PASS    |
| Candidate supply list is fetchable and rendered per dispatch job                                             | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:372-382,927-959` (`fetchCandidates`, candidate select panel)             | PASS    |
| ETA display for candidates with proper locale handling                                                       | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:96-114` (`formatEta`) and candidate option rendering at `:949-951`       | PASS    |
| **Map visualization component** for spatial queue/candidate overlay in dispatch board                        | Not yet present in `apps/ops-console-web/app/dispatch/`                                                                           | PENDING |

**Assessment:** The tabular queue context and candidate supply are functional. The "spatial" visualization (map-based overlay showing queue positions and candidate locations on a map) is the outstanding piece for this acceptance criterion.

### AC-2: Tenant / call-center address capture can use governed geospatial input

| Check                                                                        | Evidence                                                                                                                                | Status  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `MapPicker` component exists with draggable pin and reverse geocoding        | `tenant-commute-hub/src/components/MapPicker.tsx:1-12` (interface), `:14-52` (map init with marker), `:55-60` (reverse geocode on drag) | PASS    |
| `MapPicker` uses `mapbox-gl` with configurable token (localStorage-governed) | `tenant-commute-hub/src/components/MapPicker.tsx:22-30` (token from localStorage), `:36` (mapboxgl.accessToken assignment)              | PASS    |
| Address capture callback wired through `onLocationSelect(lat, lng, address)` | `tenant-commute-hub/src/components/MapPicker.tsx:9` (interface contract)                                                                | PASS    |
| Governed token provisioning (not hardcoded)                                  | Token retrieved from `localStorage.getItem("mapbox_token")` rather than baked in                                                        | PASS    |
| Integration into call-center or tenant booking flows                         | Not verified in current dispatch workflow or call-center page                                                                           | PENDING |

**Assessment:** The `MapPicker` component exists and follows a governed pattern (token from localStorage, not hardcoded). Whether it is wired into the actual call-center booking or tenant portal address capture flow depends on the parent task owner's integration work.

### AC-3: Map interactions remain projections over backend truth

| Check                                                                            | Evidence                                                                                                   | Status |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| Dispatch board reads from backend SSE/API, not local map state                   | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:217-324` (EventSource-driven state)               | PASS   |
| `MapPicker` emits location via callback; does not write backend state directly   | `tenant-commute-hub/src/components/MapPicker.tsx:9` (callback-only interface, no direct API mutation)      | PASS   |
| No map-driven dispatch commands bypass the backend dispatch API                  | No map-initiated dispatch actions found in current codebase                                                | PASS   |
| Queue state, candidate assignment, and fare derive from API, not map interaction | Dispatch workflow uses `getOpsClient()` for all mutations (`reassignDispatchJob`, `redispatchOrder`, etc.) | PASS   |

**Assessment:** The projection-over-backend-truth constraint is satisfied in the current architecture. Map components are read/select only; all authoritative state flows through the backend API.

---

## 3. Scope Bleed Assessment

### Write scope defined in execution packet

- `apps/ops-console-web/app/dispatch/` (ops-console map board)
- `tenant-commute-hub/src/components/MapPicker.tsx` (tenant/call-center address picker)
- Related map helpers in both repos

### Observations

The parent task `OPX-DP-004` is `in_progress` under `Codex`. The existing dispatch workflow file already contains queue-state visualization, candidate panels, and SSE-driven location event handling from prior tasks (OPX-DP-001 through OPX-DP-003). No map overlay or spatial board has been added to the dispatch page yet.

The `MapPicker.tsx` in `tenant-commute-hub` appears to predate this task (it was part of the scaffold). The parent task may govern its integration rather than its creation.

No scope bleed detected at this point. The dispatch workflow additions from prior tasks (exception hold, redispatch, fare override) are correctly scoped to their respective task IDs.

---

## 4. Downstream Impact

Tasks that depend on `OPX-DP-004`:

| Downstream Task | Title                                                    | Current Status | Impact                                                                                                                                      |
| --------------- | -------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPX-GV-005`    | Operational glossary and multilingual copy consistency   | backlog        | Blocked until OPX-DP-004 is done; needs map/spatial terminology settled before glossary alignment.                                          |
| `ORX-DP-004`    | Map-board MVP with stale-location and no-location states | backlog        | Direct child remediation task. Depends on OPX-DP-004 for the base map board; extends it with stale-location and no-location state handling. |

---

## 5. Verification Checklist

Per execution packet, OPX-DP-004 verification requires:

| Verification     | Method                                                       | Notes                                                                                         |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Web typecheck    | `npx tsc --noEmit` in ops-console-web and tenant-commute-hub | Must pass after map integration is added                                                      |
| Manual map smoke | Manual visual verification                                   | Operator should see spatial context; tenant/call-center should be able to pick address on map |

---

## 6. Remaining Work Before `done`

1. **[OWNER: Codex]** Add map visualization overlay to the dispatch board (`apps/ops-console-web/app/dispatch/`) showing queue positions and candidate supply locations spatially
2. **[OWNER: Codex]** Wire `MapPicker` or equivalent into call-center/tenant booking address capture flow (or confirm existing integration is sufficient)
3. **[OWNER: Codex]** Web typecheck pass across both repos
4. **[REVIEW: Codex2]** Verify map remains a projection (no map-driven state mutations)
5. **[REVIEW: Codex2]** Manual map smoke test

---

## 7. Handoff Notes

This acceptance packet is a **support artifact only** (sidecar `acceptance_packet`). It does not modify any canonical implementation, contract, or runtime code.

The parent task `OPX-DP-004` is `in_progress` under `Codex`. Both dependencies (`OPX-DP-001`, `OPX-GV-002`) are satisfied. The tabular dispatch workflow and candidate supply mechanisms are functional. The primary outstanding deliverable is the spatial/map visualization layer in the ops dispatch board and confirmed integration of governed geospatial input in tenant/call-center flows.

Ready for reviewer: `Codex`
