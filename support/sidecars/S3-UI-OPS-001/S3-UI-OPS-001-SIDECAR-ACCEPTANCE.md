# S3-UI-OPS-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `S3-UI-OPS-001` - S-3 ops SOS UI
**Prepared By:** `Gemini`
**Generated:** `2026-07-20` (UTC)
**Status:** `SUPPORT-ONLY ACCEPTANCE PACKET` - parent `S3-UI-OPS-001` is currently in `review` in machine truth, awaiting verification by Gemini; this packet compiles support evidence with no runtime alterations.

---

## 1) Scope Boundary

本 sidecar 只整理 `S3-UI-OPS-001` 的 acceptance framing、dependency map、repo evidence anchors、以及 reviewer handoff packet。它不改寫 L1 canonical truth，也不代替 parent 任務修改 `apps/ops-console-web` 的主線實作。

- In scope: support packet, parent acceptance framing, formal dependency map, evidence anchors, downstream impact notes, reviewer handoff summary.
- Out of scope: canonical truth edits, runtime code changes, design reinterpretation, or approval on behalf of the assigned reviewer.

---

## 2) Current Machine-Truth Baseline

### Parent task: `S3-UI-OPS-001`

Source: `ai-status.json` (retrieved via `scripts/ai-status.sh show`)

- status=`review`
- owner=`Codex`
- reviewer=`Gemini`
- depends_on=`S3-BE-001`
- artifacts:
  - `apps/ops-console-web/app/`
  - `apps/ops-console-web/lib/api-client.ts`
  - `docs/05-ui/drts-design-canvas/ops-sos.jsx`
- acceptance:
  - `critical alert persistent non-toast no auto-dismiss`
  - `shows event/elapsed/driver/plate/order/location/severity+ack`
  - `sound-disabled health both sound+visual`
  - `queue columns+detail(summary/map/context/supplements/attachments/timeline/linked incident)`
  - `first-writer-wins ack`
  - `coral realm no 套皮`
  - `fixture vs live wired to live+SSE before release`
  - `reviewer PASS`

Interpretation:

- The parent task is submitted on branch `origin/codex/s3-ui-ops-001` and is waiting for Gemini's review.
- This sidecar packet is prepared to help the reviewer verify the parent task's criteria with mapped evidence anchors in the codebase.

### Sidecar task: `S3-UI-OPS-001-SIDECAR-ACCEPTANCE`

Source: `ai-status.json`

- owner=`Gemini`
- reviewer=`Codex`
- helper_parent=`S3-UI-OPS-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/S3-UI-OPS-001/S3-UI-OPS-001-SIDECAR-ACCEPTANCE.md`

---

## 3) Parent Acceptance Frame

The parent task's formal acceptance is mapped below to the corresponding implementation details in the parent branch `origin/codex/s3-ui-ops-001`:

| Parent acceptance criteria | Implementation details / anchors | Verification approach |
| :--- | :--- | :--- |
| `critical alert persistent non-toast no auto-dismiss` | Overlay container uses absolute positioning over the queue screen in [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/app/sos/page.tsx). | Component checks for active critical alerts and forces rendering of overlay card. No automatic timer dismisses it. |
| `shows event/elapsed/driver/plate/order/location/severity+ack` | Grid columns render all specified attributes in [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/app/sos/page.tsx) and [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/app/sos/%5BincidentId%5D/page.tsx). | Field mapper matches contract fields via [sos-view-model.ts](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/lib/sos-view-model.ts). |
| `sound-disabled health both sound+visual` | Warning banner rendered when `soundBlocked` is true or `soundOff` is enabled. Audio context plays via browser AudioContext oscillator in [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/app/sos/page.tsx). | Banner requests user interaction to activate browser AudioContext when it starts in suspended state. |
| `queue columns+detail(summary/map/context/supplements/attachments/timeline/linked incident)` | Rich detailed interface divided into grid blocks representing location map, timeline, context metadata, driver supplements, and linked incident cases in [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/app/sos/%5BincidentId%5D/page.tsx). | Inspect page layout structure for DL (definition lists), Card boundaries, and Timeline items. |
| `first-writer-wins ack` | Acknowledge action performs assignment checks. If incident status or assignment has changed (e.g. `assignedTo` is already populated), action button is disabled. | Checked in [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/app/sos/%5BincidentId%5D/page.tsx) and validated by backend. |
| `coral realm no 套皮` | Canvas shell configured with `buildCanvasTheme({ surface: "ops", dark: true, density: "compact" })` in [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/app/sos/page.tsx), utilizing token classes without hardcoded hex colors. | Visual tokens are inherited from the `@drts/ui-web` design system configured for the `ops` realm. |
| `fixture vs live wired to live+SSE before release` | Real SSE listeners configured in [ops-shell.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/components/ops-shell.tsx) and [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/app/sos/page.tsx) listening to event stream updates. | Verify `EventSource` initialization and handlers for incident creation and update events. |

---

## 4) Dependency Map

### Formal upstream dependencies

The parent task `S3-UI-OPS-001` depends on one backend task:

| Dependency | Machine-truth status | Why it matters to `S3-UI-OPS-001` |
| :--- | :--- | :--- |
| `S3-BE-001` | `done` | Establishes the driver SOS endpoints, incident correlation txn logic, event number generation, and database schema mappings. |

Evidence anchor for `S3-BE-001` completion:
- Commit Hash: `7a03bd3aa6dcd2726b1f6bb68e7a2325579a7767`
- Commit Subject: `S3-BE-001: driver SOS backend + incident correlation (#1111)`
- Branch: `origin/dev`

### Formal downstream tasks

No subsequent tasks in the current wave directly block on this sidecar packet.

---

## 5) Reviewer Evidence Anchors

The parent reviewer (`Gemini`) can inspect the implementation using these code files in the parent branch `origin/codex/s3-ui-ops-001`:

- **Design Canvas Authority:** [ops-sos.jsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/docs/05-ui/drts-design-canvas/ops-sos.jsx)
- **SOS Main Queue and Overlay:** [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/app/sos/page.tsx)
- **SOS Event Detail Page:** [page.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/app/sos/%5BincidentId%5D/page.tsx)
- **Shared Navigation Shell:** [ops-shell.tsx](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/components/ops-shell.tsx)
- **API Client & SSE Integration:** [api-client.ts](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/lib/api-client.ts)
- **State mapping and helper methods:** [sos-view-model.ts](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/lib/sos-view-model.ts)
- **View Model Unit Tests:** [sos-view-model.test.ts](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/ops-console-web/tests/unit/sos-view-model.test.ts)
- **Backend Dispatch Service:** [ops-dispatch-events.service.ts](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/api/src/common/ops-dispatch-events.service.ts)
- **Backend Service Logic:** [incident.service.ts](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-s3-ui-ops-001-sidecar-acceptance/apps/api/src/modules/incident/incident.service.ts)

---

## 6) Sidecar Acceptance Checklist

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Keep the packet scoped to acceptance framing, dependency mapping, and reviewer support.
- [x] Keep the dependency map aligned with current machine truth.
- [x] Refresh the packet to reflect parent `review` state and recorded branch/commit evidence.
- [x] Record sidecar handoff and review lifecycle in the packet while treating `ai-status.json` as the live status source.

---

## 7) Handoff Notes For The Assigned Reviewer

- Parent `S3-UI-OPS-001` is currently in status `review` and assigned to Gemini for verification.
- Upstream `S3-BE-001` is already fully closed and merged into `dev`.
- This sidecar packet acts as the formal verification guideline and dependency map to support Codex in reviewing our acceptance process.
- The parent branch `origin/codex/s3-ui-ops-001` has its latest WIP commit at `8c1f67f0266dd5be5e5a08faff60fe5b57ab2002` establishing key navigation structures and layout definitions.

---

## 8) Change Log

- `2026-07-20T23:31:58Z` - Sidecar task transitioned to `in_progress` in machine truth by `Gemini`.
- `2026-07-20T23:33:20Z` - Initial support-only acceptance packet and dependency map created for `S3-UI-OPS-001` with parent acceptance mapping, dependency map, and codebase evidence anchors.
