# Wave 0 Design Gates Master Handoff Document
**Multi-Taxi Operational UI Design Packets & Handoff QA**

**Parent Task ID:** `MTX-DESIGN-WAVE0`  
**Owner:** Gemini  
**Reviewer:** Codex  
**Status:** Ready for Review Handoff  
**Execution Baseline:** `dev@725317b16c14b1e9b8d9448687a4aa9daf92d246`  
**Canonical Requirement:** `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md` §3 & `08_multi_taxi_operations_ui_design_requirements_20260723.md`

---

## 1. Summary of Wave 0 Deliverables

The visual design and operational UI handoff for Phase 1 Multi-Taxi (Wave 0 Design Gates) is complete across all four design packets plus Design QA:

1. **`MTX-DESIGN-001` Operating Authorization Console:**
   - **Screens:** `MTX-AUTH-UI-01..06` (Registry, Detail, Draft Editor, Lifecycle Confirmation, Authorized Vehicles, Conflict/Permission State, Narrow 390px Viewport).
   - **Canvas Mounting:** Mounted in `Platform Admin.html` (Section 08) & `mtx-operations-screens.jsx`.
   - **Packet:** `support/sidecars/MTX-DESIGN-001/DESIGN-HANDOFF-PACKET.md`.

2. **`MTX-DESIGN-002` Queue Semantics Operations:**
   - **Screens:** `MTX-QUEUE-UI-01..03` (Queue Overview, Queue Entry Detail, Non-Bypassable Legal Denial State, Narrow 390px Viewport).
   - **Canvas Mounting:** Mounted in `Ops Console.html` (Section 08) & `mtx-operations-screens.jsx`.
   - **Packet:** `support/sidecars/MTX-DESIGN-002/DESIGN-HANDOFF-PACKET.md`.

3. **`P5-DESIGN-001` Rating Governance:**
   - **Screens:** `P5-RATE-UI-01..03` (Rating Review Queue, Moderation Detail, Driver Rating Authority, Narrow 390px Viewport).
   - **Canvas Mounting:** Mounted in `Platform Admin.html` (Section 09) & `mtx-operations-screens.jsx`.
   - **Packet:** `support/sidecars/P5-DESIGN-001/DESIGN-HANDOFF-PACKET.md`.

4. **`P5-DESIGN-002` Fare, Payment, Receipt, and Retention Operations:**
   - **Screens:** `P5-COM-UI-01..05` (Fare Anomaly Queue/Detail, Payment Exception Detail, Certificate Support, Operational Record Query, Controlled Export/Retention, Narrow 390px Viewports).
   - **Canvas Mounting:** Mounted in `Platform Admin.html` Section 10 (`p5-fare-anomaly`, `p5-fare-anomaly-narrow`, `p5-payment-exception`, `p5-payment-exception-narrow`, `p5-certificate`, `p5-records-query`, `p5-records-query-narrow`, `p5-export-retention`) & `mtx-operations-screens.jsx`.
   - **Packet:** `support/sidecars/P5-DESIGN-002/DESIGN-HANDOFF-PACKET.md`.

5. **`P5-S3-DESIGN-QA-001` Handoff Completion & Design QA:**
   - **Deliverable:** `support/sidecars/P5-S3-DESIGN-QA-001/DESIGN-QA-HANDOFF-CHECKLIST.md`.
   - **Editable Figma Source Tree:** `docs/05-ui/drts-design-canvas/figma-source-tree.json` (11 Figma pages `00_Cover`..`10_Handoff`, auto-layout specs, token mappings).
   - **Preflight Record:** `support/sidecars/MTX-DESIGN-WAVE0/CURRENT-HEAD-PREFLIGHT.md`.
   - **PNG Screenshots:** All 11 required PNG files generated under `support/sidecars/P5-S3-DESIGN-QA-001/screenshots/` and `docs/05-ui/drts-design-canvas/screenshots/`.

---

## 2. Acceptance Criteria Verification

- [x] State matrix + frames + frozen copy + a11y + prototype + handoff for all four design packets (`MTX-DESIGN-001`, `MTX-DESIGN-002`, `P5-DESIGN-001`, `P5-DESIGN-002`).
- [x] Design QA handoff complete (`P5-S3-DESIGN-QA-001`).
- [x] Editable Figma source tree JSON (`docs/05-ui/drts-design-canvas/figma-source-tree.json`) and 11 Figma page layer specifications.
- [x] Mounted in design canvas HTML shells (`Platform Admin.html` Sections 08-10 & `Ops Console.html` Section 08) with explicit Desktop 1440px and Narrow 390px viewports for all packets including `P5-DESIGN-002`.
- [x] All 11 PNG screenshot evidence files generated and verified against requirements §20.
- [x] Explicit narrow viewport frames (390px), ARIA dialog/alert/live-region hooks, skeletal loading, and interactive prototype transitions implemented.
- [x] All visual components strictly built with `@drts/ui-tokens` realm tokens (Platform, Ops, Tenant, System, Driver). No ad-hoc hex palettes introduced.
- [x] Unblocks implementation UI tasks in Fleets B, C, D, and F.
---

## 3. §19 Per-Frame Annotations Evidence Verification

All 23 frames across the four design packets (`MTX-DESIGN-001`, `MTX-DESIGN-002`, `P5-DESIGN-001`, `P5-DESIGN-002`) and the Figma source tree (`docs/05-ui/drts-design-canvas/figma-source-tree.json`) strictly satisfy all §19 frame-annotation requirements:

1. **Screen ID & Viewport:** Explicitly annotated for Desktop 1440px / 1280px and Narrow Mobile 390px viewports across all screens.
2. **User Capabilities:** Mapped to exact backend capabilities (`multi_taxi_authorization:read`, `:write`, `:activate`, `ops_dispatch:read`, `rating:moderate`, `fare_publication:manage`, `multi_taxi_records:read`, `:export`).
3. **Data States:** Complete representation of happy active, draft, suspended, expired/revoked, loading, empty, 403 forbidden, 409 stale conflict, non-bypassable legal denial, rated, new_driver, unavailable, fare anomaly fail-closed, payment failed, and legal hold freeze states.
4. **Source Status:** All frames marked as `live-contract` matching canonical spec contracts.
5. **Component Variants:** Component names from `@drts/ui-tokens` & DRTS design canvas bound to every frame.
6. **Focus Order:** Sequential accessibility focus orders (1 -> 2 -> 3...) defined for keyboard navigation and ARIA focus trapping on modal dialogs.
7. **API & Field Mapping:** Exact HTTP endpoints and request/response field mappings documented for developer handoff.
8. **Empty / Error / Conflict Behavior Evidence:** Explicit evidence for empty states, error alerts, fail-closed quote issues, non-bypassable legal denials, and 409 conflict handling.

Detailed per-frame evidence matrices are archived in individual design packets:
- `support/sidecars/MTX-DESIGN-001/DESIGN-HANDOFF-PACKET.md` §7 (7 frames)
- `support/sidecars/MTX-DESIGN-002/DESIGN-HANDOFF-PACKET.md` §7 (4 frames)
- `support/sidecars/P5-DESIGN-001/DESIGN-HANDOFF-PACKET.md` §7 (4 frames)
- `support/sidecars/P5-DESIGN-002/DESIGN-HANDOFF-PACKET.md` §7 (8 frames)
- `docs/05-ui/drts-design-canvas/figma-source-tree.json` (Structured JSON machine truth)
