# DRV-UI-RD-008 Sidecar Acceptance Packet

This document serves as the acceptance packet for the **DRV-UI-RD-008** sidecar, providing the specific checklist, dependency mapping, and machine-truth anchors required for the Wave 4 Driver App redesign.

## §1 Scope & Boundary

- **Task ID:** `DRV-UI-RD-008-SIDECAR-ACCEPTANCE`
- **Helper Kind:** `acceptance_packet`
- **Mutates Canonical:** `false`
- **Objective:** Support the acceptance of `DRV-UI-RD-008` (Reskin Settings) by defining specific verification gates without modifying the L1/L2 truth or core implementation.

## §2 Machine-Truth Anchors (as of 2026-05-12)

### Parent Task: DRV-UI-RD-008

- **Title:** Reskin Settings
- **Owner:** `Codex2`
- **Reviewer:** `Codex`
- **Status:** `backlog`
- **Summary (ZH):** `app/settings.tsx` 對齊 `ScreenSettings`。
- **Last Update:** `2026-05-10T10:41:44Z`

### Sidecar Task: DRV-UI-RD-008-SIDECAR-ACCEPTANCE

- **Owner:** `Gemini`
- **Reviewer:** `Codex2`
- **Status:** `in_progress`

## §3 Dependency Map

### Upstream Dependencies

- **DRV-UI-RD-001** (Wire @drts/ui-tokens into driver-app)
  - **Status:** `done`
  - **Anchor Commit:** `5db92c8`
  - **Note:** Provides the RN primitives layer under `apps/driver-app/components/ui/` (new) used for the reskin.

## §4 Task-Specific Acceptance Checklist

### A. Technical Integrity (Standard Wave 4)

- [ ] `pnpm --filter @drts/driver-app typecheck` passes.
- [ ] `pnpm --filter @drts/driver-app lint` passes.
- [ ] `pnpm --filter @drts/driver-app test` (Vitest) passes.
- [ ] Expo dev build on Android emulator successfully runs.
- [ ] Manual screenshot vs design canvas (`ScreenSettings`) verified.

### B. Functional & Visual Alignment (`DRV-UI-RD-008`)

- [ ] `apps/driver-app/app/settings.tsx` correctly imports and uses `@drts/ui-tokens` via the primitives layer.
- [ ] Visual styles match the redesign target specified in the design canvas for the Settings screen.
- [ ] Settings navigation and existing interactive elements (toggles, inputs) remain functional.

### C. Guardrails & Compliance

- [ ] **No Semantic Drift:** Backend behavior, location heartbeat, and provisioning flow are untouched.
- [ ] **Resource Discipline:** No imports from `@drts/ui-web` in the mobile app.
- [ ] **Consensus Fidelity:** Aligned to Wave 4 plan at `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` line 499.

## §5 Reviewer Handoff Notes (for Codex2)

1.  **Truth Anchor Check:** Please verify that the status of `DRV-UI-RD-008` and its dependency `DRV-UI-RD-001` matches the machine truth recorded in `ai-status.json`.
2.  **Artifact Alignment:** This packet defines the gates for `DRV-UI-RD-008`. When the parent task moves to `review`, ensure these specific checks (especially the guardrails against backend/heartbeat mutation) are satisfied.
3.  **Sidecar Closure:** As this is a support-only artifact, it can be closed with `NO_COMMIT_REQUIRED=1` once approved.
