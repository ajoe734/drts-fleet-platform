# DRV-MAT-001 Sidecar Acceptance Packet

This document serves as the acceptance packet for the DRV-MAT-001 sidecar. It summarizes the implementation state of the shared UI foundation for the driver app and identifies known discrepancies against the design plan.

**Task ID:** DRV-MAT-001-SIDECAR-ACCEPTANCE
**Parent Task:** DRV-MAT-001
**Helper Kind:** acceptance_packet
**Status:** review
**Owner:** Gemini
**Reviewer:** Codex
**Last Updated:** 2026-05-05T01:15:00Z

## Acceptance Checklist

Based on `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md`:

- [x] **Shared Tokens:** Exist in `apps/driver-app/components/ui/tokens.ts`.
  - _Verification:_ Verified palette, spacing, radius, and type scale against Design Plan Section 3.2.
- [x] **Component Coverage:** Shared components cover the list in Design Plan Section 3.3.
  - _Inventory:_ `ActionButton`, `AppScreen`, `BottomActionBar`, `Chip`, `EmptyState`, `ErrorBanner`, `FormField`, `IconButton`, `InfoTile`, `ListCard`, `PageHeader`, `SegmentedControl`, `StatusChip`.
- [x] **Type Safety:** Components are typed and usable from Expo Router screens.
  - _Verification:_ `pnpm --filter @drts/driver-app typecheck` passes.
- [ ] **AppScreen Integrated Support:** Integrated loading/error/empty wrapper support.
  - _Status:_ **Partial**. `AppScreen` currently only provides the safe-area frame and scrollable container. `EmptyState` and `ErrorBanner` exist as separate components but are not yet integrated into `AppScreen` via props.
- [x] **Behavior Integrity:** No page-specific behavior changes introduced beyond shell wiring.
- [x] **Shell Integration:** `apps/driver-app/app/_layout.tsx` consumes shared tokens for header and content styling.

## Dependency Map

- **Upstream:**
  - `DRV-MAT-000` (Design Freeze): Provides the design contract and execution baseline.
- **Downstream (Blocked by this foundation):**
  - `DRV-MAT-002` (Shell and Workstation Home)
  - `DRV-MAT-003` (Task Inbox)
  - `DRV-MAT-004` (Trip Workflow)
  - `DRV-MAT-005` (SOS Flow)
  - `DRV-MAT-006` (Shift and Attendance)
  - `DRV-MAT-007` (Platform Presence)
  - `DRV-MAT-008` (Earnings Dashboard)
  - `DRV-MAT-009` (Settings)

## Support Artifacts & Verification Evidence

### 1. Component Inventory

The following components are materialized under `apps/driver-app/components/ui/`:

- `ActionButton.tsx`: Replaces text-as-button with primary/secondary/danger variants.
- `AppScreen.tsx`: Shared safe-area page frame.
- `BottomActionBar.tsx`: Sticky mobile action group.
- `EmptyState.tsx`: Reusable empty/error/loading display.
- `ErrorBanner.tsx`: Inline validation/API error banner.
- `FormField.tsx`: Labeled input with help/error text support.
- `PageHeader.tsx`: Compact page title and subtitle.
- `tokens.ts`: Centralized design tokens (palette, spacing, etc.).

### 2. Known Issues & Discrepancies

- **AppScreen Prop Support:** `AppScreen` does not yet expose `isLoading`, `error`, or `isEmpty` props as implied by the Design Plan (docs/02-architecture/driver-app-productization-design-plan-20260504.md:86). Implementation currently requires manual composition of `EmptyState` or `ErrorBanner` within the screen children.
- **\_layout.tsx Import Style:** `apps/driver-app/app/_layout.tsx` imports the lowercase `tokens` alias from `tokens.ts`. While functional (due to `export const tokens = Tokens`), the project is trending towards uppercase `Tokens`. This is maintained as an integration anchor for `DRV-MAT-002`.
- **AuthContext Import:** Previous reports of a missing `AuthContext` in `shift.tsx` have been addressed; `typecheck` now passes cleanly.

### 3. Verification Command

```bash
# Verify type safety and component integration
pnpm --filter @drts/driver-app typecheck
```

## Handoff Note

This packet reflects the machine truth of the `DRV-MAT-001` foundation as of May 5, 2026. It confirms the existence of the shared UI contract while explicitly flagging the `AppScreen` feature gap for the reviewer's attention. No canonical truth or runtime files were modified in the creation of this sidecar artifact.
