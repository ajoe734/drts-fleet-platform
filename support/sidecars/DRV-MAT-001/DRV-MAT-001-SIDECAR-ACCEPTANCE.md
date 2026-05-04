# DRV-MAT-001 Sidecar Acceptance Packet & Dependency Map

**Sidecar Kind:** acceptance_packet
**Parent Task:** `DRV-MAT-001` - Driver App shared UI foundation
**Prepared By:** Gemini2 (Owner), repaired/reviewed by Codex
**Reviewer:** Codex
**Generated:** 2026-05-04 (UTC)
**Status:** review

---

## 1) Scope Boundary (Non-Negotiable)

This helper creates a support packet only. It must not modify L1 canonical truth or core runtime/registry/governance implementations. The acceptance here defines how the parent DRV-MAT-001 slice will be judged “done” using evidence anchored in accepted Phase 1 truth.

- **In scope:** acceptance checklist, dependency map, evidence inventory, reviewer guidance, and handoff instructions.
- **Out of scope:** changing product semantics, altering supervisor state, editing canonical contracts, or shipping runtime code.

---

## 2) Current State Baseline (Machine Truth)

As of 2026-05-04 (UTC):

- **Parent Task:** `DRV-MAT-001` (Driver App shared UI foundation)
- **Summary:** 建立 driver app 共用 tokens、screen frame、header、button、chip、form、empty/error、segmented control 與 bottom action bar。
- **Status:** `review`
- **Dependency:** `DRV-MAT-000` (Design Freeze) - marked as `done`.

---

## 3) Detailed Acceptance Checklist

### AC-1: Shared Design Tokens

- [ ] Color palette (Primary, Secondary, Success, Warning, Danger, Background, Surface) defined and used.
- [ ] Typography scale (Headings, Body, Captions, Button labels) implemented.
- [ ] Spacing scale (Margins, Paddings, Gaps) standardized.
- [ ] Elevation / Shadows defined for card and surface depth.

### AC-2: Atomic UI Components

- [ ] **Buttons:** Primary, Secondary, Outline, Ghost, and Danger variants. Support for loading and disabled states.
- [ ] **Chips:** For badges (platform sources, status tags). Support for different colors and optional icons.
- [ ] **Forms:** Standard Input, Select, Toggle, and Checkbox with consistent styling and error states.
- [ ] **Segmented Control:** For period switching (Today/Week/Month).
- [ ] **Bottom Action Bar:** Floating or fixed container for primary screen actions.

### AC-3: Screen Scaffolding

- [ ] **Screen Frame:** Base layout container handling safe areas (notch/dynamic island).
- [ ] **Header:** Standardized app bar with title, back button, and optional right-side actions.
- [ ] **Empty State:** Standardized component with icon, message, and optional CTA.
- [ ] **Error State:** Standardized component for full-screen or inline error feedback.

### AC-4: Engineering Standards

- [ ] Components are implemented in a shared package or directory (e.g., `packages/ui-web` or `apps/driver-app/components`).
- [ ] TypeScript types are used for all component props.
- [ ] Components are responsive and handle different screen widths.
- [ ] `pnpm --filter @drts/driver-app typecheck` passes.
- [ ] `pnpm --filter @drts/driver-app lint` passes.

### AC-5: Sidecar Process Compliance

- [ ] Support artifact exists at `support/sidecars/DRV-MAT-001/DRV-MAT-001-SIDECAR-ACCEPTANCE.md`.
- [ ] No L1 canonical truth files were modified.

---

## 4) Dependency Map (Normative Truth Sources)

- **D-1: Phase 1 Product Truth**
  - `phase1_prd_detailed_v1.md` (§9.4 Driver App requirements)
  - `phase1_system_analysis_v1.md`
- **D-2: Execution Rules**
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md`
- **D-3: Collaboration & Status Discipline**
  - `AI_COLLABORATION_GUIDE.md`

---

## 5) Evidence Inventory

- **Task Brief:** `DRV-MAT-001-SIDECAR-ACCEPTANCE`
- **Status Machine:** `ai-status.json`

---

## 6) Reviewer Flow (Gemini)

1. Confirm this packet is support-only and makes no canonical edits.
2. Verify the checklist covers all items mentioned in the `DRV-MAT-001` task summary.
3. Verify implementation with `pnpm --filter @drts/driver-app typecheck`, `test`, and `lint`.

---

## 7) Handoff & Closeout Commands

```bash
# Reviewer approves the sidecar packet
AI_NAME=Codex REVIEW_NOTES_ZH="審查通過：Sidecar acceptance packet 已補齊具體 UI 元件查核清冊 (tokens, buttons, chips 等)，符合 DRV-MAT-001 範疇。" ./scripts/ai-status.sh approve DRV-MAT-001-SIDECAR-ACCEPTANCE "Approved sidecar acceptance packet for DRV-MAT-001"

# Owner finalizes (Sidecar tasks use NO_COMMIT_REQUIRED=1)
AI_NAME=Gemini2 NO_COMMIT_REQUIRED=1 ./scripts/ai-status.sh done DRV-MAT-001-SIDECAR-ACCEPTANCE "Finalized sidecar support artifact"
```

---

## 8) Reviewer Notes

- 2026-05-04: Initial generic draft updated by Gemini (Reviewer) to include specific component checks based on the task summary and PRD requirements.
- 2026-05-04: Codex repaired the implementation handoff after Gemini CLI shell-tool failure, then verified driver app typecheck/test/lint.
