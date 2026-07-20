# S3-UI-OPS-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `S3-UI-OPS-001` — S-3 ops SOS UI
**Parent Owner (at review_approved):** `Copilot` (initially implemented by `Gemini` / `Gemini2` on `gemini/s3-ui-ops-001`)
**Parent Reviewer:** `Gemini`
**Sidecar Owner:** `Gemini`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-07-20` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical truth, the design execution brief, runtime behavior, or any L1/L2 product surface. For the live machine-truth status of this sidecar row, read `ai-status.json -> S3-UI-OPS-001-SIDECAR-REVIEW.status` directly.

This packet is the reviewer-support companion to the parent slice `S3-UI-OPS-001` (currently `review_approved` in machine truth) and to the sibling acceptance packet `support/sidecars/S3-UI-OPS-001/S3-UI-OPS-001-SIDECAR-ACCEPTANCE.md`. It records the citation-anchored evidence that backs the parent's implementation quality and provides a clear audit trail for the reviewer.

---

## 1. Scope Boundary

### In scope:
- Restate the parent task's `acceptance` field and design requirements as a citation-anchored evidence summary against the parent branch (`origin/gemini/s3-ui-ops-001`).
- Verify the parent's machine-truth dependency satisfaction.
- Record the independent line-anchor spot-checks that verify the implemented screens and logic.
- Provide a reviewer handoff command block that the assigned reviewer (`Codex`) can run on this sidecar after reading the packet.

### Out of scope:
- Editing L1/L2 product truth, product specification documents, or the parent's machine-truth status fields directly.
- Modifying main application code files in `apps/ops-console-web/` or `apps/api/` from this sidecar review branch.
- Altering the sibling acceptance packet `S3-UI-OPS-001-SIDECAR-ACCEPTANCE.md`.

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> S3-UI-OPS-001-SIDECAR-REVIEW`
- **Owner:** `Gemini`
- **Reviewer:** `Codex`
- **Task Class:** `sidecar`
- **Helper Parent:** `S3-UI-OPS-001`
- **Helper Kind:** `review_packet`
- **Mutates Canonical:** `false`
- **Depends On:** `S3-BE-001` (mirrors the parent's dependency set)
- **Artifacts:** `support/sidecars/S3-UI-OPS-001/S3-UI-OPS-001-SIDECAR-REVIEW.md` (this file)
- **Acceptance:**
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### Parent — `ai-status.json -> S3-UI-OPS-001`
- **ID:** `S3-UI-OPS-001`
- **Title:** `S-3 ops SOS UI`
- **Owner:** `Copilot` (reassigned by Chairman to finalize closeout while maintaining owner/reviewer separation; original code authored by `Gemini` on branch `gemini/s3-ui-ops-001`)
- **Reviewer:** `Gemini`
- **Status:** `review_approved`
- **Depends On:** `S3-BE-001`
- **Artifacts:**
  - `apps/ops-console-web/app/`
  - `apps/ops-console-web/lib/api-client.ts`
  - `docs/05-ui/drts-design-canvas/ops-sos.jsx`
- **Acceptance:**
  - `critical alert persistent non-toast no auto-dismiss`
  - `shows event/elapsed/driver/plate/order/location/severity+ack`
  - `sound-disabled health both sound+visual`
  - `queue columns+detail(summary/map/context/supplements/attachments/timeline/linked incident)`
  - `first-writer-wins ack`
  - `coral realm no 套皮`
  - `fixture vs live wired to live+SSE before release`
  - `reviewer PASS`

### Sibling sidecar — `ai-status.json -> S3-UI-OPS-001-SIDECAR-ACCEPTANCE`
- **Owner:** `Gemini`
- **Reviewer:** `Copilot`
- **Status:** `review`
- **Artifact:** `support/sidecars/S3-UI-OPS-001/S3-UI-OPS-001-SIDECAR-ACCEPTANCE.md`

### Authoritative Source Documents
- **Design Canvas Authority:** [ops-sos.jsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/docs/05-ui/drts-design-canvas/ops-sos.jsx)
- **Parent Branch context (read-only):** `origin/gemini/s3-ui-ops-001`
- **Backend Service Logic:** [incident.service.ts](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/api/src/modules/incident/incident.service.ts)

---

## 3. Dependency Satisfaction

The parent's `depends_on` set contains `S3-BE-001`. This task is fully `done` in machine truth and integrated into the main dev branch.

| Dep ID | Status (truth) | Recorded Commit | Contribution to S3-UI-OPS-001 |
| :--- | :--- | :--- | :--- |
| `S3-BE-001` | `done` | `7a03bd3aa` | Establishes the driver SOS backend routes, incident database schema mappings, event sequence generation, and core incident repository. |

---

## 4. Evidence Summary

Each item below restates the parent acceptance bar mapped against the finalized parent branch `origin/gemini/s3-ui-ops-001`.

### A. Critical Alert Persistent Non-Toast No Auto-Dismiss `[REQUIRED]`
- [x] **Overlay implementation:** In [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/ops-console-web/app/sos/page.tsx), when there is an unacknowledged SOS incident (`pendingAlert` resolves to true), an absolute positioned alert card block is rendered over the UI (lines 351–466).
- [x] **Persistent backdrop:** The background page body has opacity reduced to `0.35` and `pointerEvents` set to `none` (lines 191–194), which blocks all regular console interactions until the critical alert is acknowledged or opened.
- [x] **No auto-dismiss:** The modal contains no timer or automatic self-dismissal hooks, fulfilling the persistence contract.

### B. Shows event/elapsed/driver/plate/order/location/severity+ack `[REQUIRED]`
- [x] **Event details mapped:** Mapped in [sos-sound-context.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/ops-console-web/components/sos-sound-context.tsx) (lines 135–182). Mapped attributes include:
  - `eventNo` / `no`: Extracted from the incident title (e.g. `SOS-123-ABC`) or incidentId.
  - `status`: Mapped status text (e.g. "待確認", "已確認", "調查中", "已結案").
  - `wait`: Mapped elapsed timer computed based on occurred/createdAt against active state `nowTime` refreshed every 5 seconds.
  - `driver`: `relatedDriverId`.
  - `plate`: `relatedVehicleId`.
  - `order`: `relatedOrderId`.
  - `location`: `location`.
  - `type`: Category translations (交通事故, 乘客急病, 治安事件).
  - `ack`: `assignedTo` value.
- [x] **Card render:** These fields are clearly rendered in the Card's description list (`CanvasDL`) inside the critical overlay in [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/ops-console-web/app/sos/page.tsx) (lines 393–415).

### C. Sound-Disabled Health Both Sound + Visual `[REQUIRED]`
- [x] **Oscillator beep playback:** In [sos-sound-context.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/ops-console-web/components/sos-sound-context.tsx) (lines 232–273), a periodic `playBeep` oscillator function runs every 4 seconds when a pending unacknowledged alert exists.
- [x] **Sound-disabled banner:** In [ops-shell.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/ops-console-web/components/ops-shell.tsx) (lines 115–144), if sound is off (`soundOff`) or blocked by the browser (`audioBlocked`), a wide warning banner (`CanvasBanner` with `tone="warn"`) is displayed advising the operator that browser auto-play is blocked and providing a button to manually enable sound.
- [x] **API Health degradation link:** In [ops-health-footer.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/ops-console-web/components/ops-health-footer.tsx) (lines 79–88), sound health is linked to workstation health. If the sound alert is disabled or blocked, status is downgraded to `degraded`. If an AudioContext initialization error is caught, the health status becomes `down`.

### D. Queue columns+detail(summary/map/context/supplements/attachments/timeline/linked incident) `[REQUIRED]`
- [x] **Detail workspace layout:** Implemented in [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/ops-console-web/app/sos/%5BincidentId%5D/page.tsx) with a grid layout separating:
  - **Summary & Context:** `PageHeader` rendering the event status pill and metadata subtitle (driver, plate, order).
  - **Map coordinate display:** `GoogleMapBaseLayer` centered on the通報當下座標 parsed from location or fetched order pickup points. Emits `CanvasEmptyState` fallback when no coordinates are present.
  - **Supplements & Attachments:** Renders attachments summary (photos count, voice play labels).
  - **Timeline:** Interactive list rendering events mapping occurred time, action notes, and management tones.
  - **Linked incident:** Links to the main incident detail route `/incidents/${incidentId}` via ExternalLink button.

### E. First-Writer-Wins ack `[REQUIRED]`
- [x] **UI guard check:** In [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/ops-console-web/app/sos/page.tsx) (lines 160–180) and [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/ops-console-web/app/sos/%5BincidentId%5D/page.tsx) (lines 189–207), the local `handleAcknowledge` function checks if the fetched incident has already been assigned to another operator. If `assignedTo` is populated, it alerts the user with: `確認失敗：已由 ${current.assignedTo} 先行接手！ (First-Writer-Wins)`.
- [x] **Backend enforcement:** In [incident.service.ts](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/api/src/modules/incident/incident.service.ts) (lines 294–311), the service throws `INCIDENT_ASSIGNMENT_CONFLICT` (HTTP 409 Conflict) if the incident is already assigned to a different operator.
- [x] **Unit test coverage:** Added in [incident.controller.test.ts](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/api/tests/unit/incident.controller.test.ts) (lines 225–275): `"enforces first-writer-wins for assignments, throwing conflict error if already assigned to a different operator"`.

### F. Coral realm no 套皮 `[REQUIRED]`
- [x] **Token theme config:** All custom layout/cards in `apps/ops-console-web/` initialize the styling theme via `buildCanvasTheme({ surface: "ops", dark: true, density: "compact" })`, utilizing realm design tokens from `@drts/ui-web` instead of hardcoded hex values in local CSS.

### G. Fixture vs Live wired to Live + SSE before release `[REQUIRED]`
- [x] **Real API client fetching:** Real REST client wired in [sos-sound-context.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-review/apps/ops-console-web/components/sos-sound-context.tsx) (lines 62–73) fetching `/api/incidents` on mount.
- [x] **SSE wired:** Uses `createOpsDispatchEventSource()` to connect to the live SSE stream, register event listeners for dispatch changes (`order_created`, `order_updated`, `dispatch_job_updated`, etc.), plus the new `incident_created` and `incident_updated` events, triggering data refetching.

---

## 5. Reviewer Focus

For the `Codex` reviewer checking this sidecar:
- Verify that this support artifact is created inside the path `support/sidecars/S3-UI-OPS-001/S3-UI-OPS-001-SIDECAR-REVIEW.md`.
- Confirm that the dependency mapping in §3 reflects the dev state.
- Check the evidence summary in §4, verifying that each acceptance criteria resolves to actual code implementations on the parent implementation branch `origin/gemini/s3-ui-ops-001`.
- Ensure that the sidecar does not modify any canonical product source files.

---

## 6. Reviewer Handoff Commands

### Approve the sidecar:
```bash
AI_NAME=Codex ./scripts/ai-status.sh approve S3-UI-OPS-001-SIDECAR-REVIEW \
  "Review packet aligned with current machine truth: parent S3-UI-OPS-001 is status=review_approved; depends_on S3-BE-001 is satisfied; design-packet requirements (overlay alerts, mapped detail rows, AudioContext singleton beep playback, warning banner for blocked audio, GoogleMapBaseLayer centering, first-writer-wins UI + backend conflict validation, coral realm tokens, and SSE live wiring) mapped to origin/gemini/s3-ui-ops-001; unit test coverage verified; sidecar does not mutate canonical truth."
```

### Reopen the sidecar:
```bash
AI_NAME=Codex ./scripts/ai-status.sh reopen S3-UI-OPS-001-SIDECAR-REVIEW \
  "packet needs revision: [specify any mapping or documentation inaccuracies]"
```

---

## 7. Artifacts Created / Updated
- `support/sidecars/S3-UI-OPS-001/S3-UI-OPS-001-SIDECAR-REVIEW.md` (this file)
