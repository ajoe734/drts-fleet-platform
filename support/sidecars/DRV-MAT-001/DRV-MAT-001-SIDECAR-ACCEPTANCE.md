# DRV-MAT-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DRV-MAT-001` - Driver App shared UI foundation
**Sidecar Owner:** `Codex`
**Assigned Reviewer:** `Gemini2`
**Parent Owner / Reviewer At Snapshot:** `Gemini2` / `Codex`
**Generated:** `2026-05-05` (UTC)
**Snapshot Status:** Parent `DRV-MAT-001` and this support-only sidecar are `done` in machine truth

---

## 1) Scope Boundary

This sidecar only refreshes the acceptance framing, dependency map, machine-truth snapshot, and reviewer handoff notes for `DRV-MAT-001`. It does not change canonical truth or alter the parent runtime implementation.

- In scope: support-only acceptance checklist, current implementation snapshot, dependency and consumer map, evidence inventory, reviewer guidance.
- Out of scope: editing `apps/driver-app/components/ui/*`, changing `apps/driver-app/app/_layout.tsx`, rewriting `onboarding.tsx` or other downstream pages, modifying L1/L2 truth, or closing out the parent task.

---

## 2) Current Machine-Truth Snapshot

Based on `ai-status.json`, the execution packet, the design plan, and the current repo snapshot:

- Parent `DRV-MAT-001` is `review_approved` under owner `Gemini2` and reviewer `Codex`, last updated at `2026-05-05T00:51:09Z`.
- Parent machine-truth acceptance is currently recorded as:
  - `shared UI primitives exist`
  - `typecheck passes`
  - `no broad page rewrite before foundation`
- Parent review approval also records that, after a `tokens` compatibility export was added, `pnpm --filter @drts/driver-app typecheck`, `pnpm --filter @drts/driver-app test`, and `pnpm --filter @drts/driver-app lint` all passed.
- `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md` limits the formal write scope to `apps/driver-app/components/ui/*` plus optional minimal `apps/driver-app/app/_layout.tsx` integration. Shell and workstation/home rewrites remain downstream in `DRV-MAT-002`.
- The earlier `_layout.tsx` `tokens`/`Tokens` mismatch is now mitigated by `apps/driver-app/components/ui/tokens.ts`, which exports both `Tokens` and the compatibility alias `tokens`. `_layout.tsx` still imports the lowercase alias, so the packet treats it as a compatibility anchor rather than a live blocker.

Conclusion: this packet should be reviewed as a support-only freeze of the current accepted foundation state, not as a new implementation proposal.

---

## 3) Implementation Snapshot Captured By This Packet

### 3.1 Review-approved public shared UI contract

The public contract exported from `apps/driver-app/components/ui/index.ts` currently includes:

- `tokens`
- `AppScreen`
- `PageHeader`
- `ActionButton`
- `IconButton`
- `StatusChip`
- `InfoTile`
- `ListCard`
- `SegmentedControl`
- `FormField`
- `EmptyState`
- `ErrorBanner`
- `BottomActionBar`

### 3.2 Additional supporting files present in the current worktree

The shared UI folder also currently contains:

- `Chip.tsx`
- `ScreenFrame.tsx`
- `tokens.ts`

These files are relevant context for the landed foundation surface, even though the main exported contract is defined by `index.ts`.

### 3.3 Minimal shell integration snapshot

- `apps/driver-app/app/_layout.tsx` imports `tokens` from `@/components/ui/tokens`.
- Stack header colors, content background, and title typography are driven through the shared token contract.
- No `onboarding.tsx` or `index.tsx` workstation/home rewrite is claimed by this packet; those page-level changes remain part of `DRV-MAT-002`.

---

## 4) Parent Acceptance Snapshot

This checklist expands the current machine truth into reviewer-facing evidence without changing the accepted parent scope.

### AC-1 - Shared token contract exists

- [x] `apps/driver-app/components/ui/tokens.ts` defines the shared palette, spacing, radius, type scale, and layout tokens.
- [x] The file exports both `Tokens` and `tokens`, which matches the current compatibility posture recorded in the parent review approval.

### AC-2 - Shared UI primitives cover the foundation surface

- [x] The exported surface includes the expected reusable primitives for shared frame, header, buttons, status chips, form controls, empty/error states, segmented control, info tiles, list cards, and bottom action bar.
- [x] The current worktree also contains supporting `Chip.tsx` and `ScreenFrame.tsx` helpers inside the same shared UI slice.

### AC-3 - Components are usable from Expo Router screens

- [x] Parent machine truth records `pnpm --filter @drts/driver-app typecheck` as passing.
- [x] `_layout.tsx` already consumes the shared token contract for stack styling, which demonstrates screen-level integration.

### AC-4 - Foundation scope stayed within the approved boundary

- [x] The execution packet limits `DRV-MAT-001` to shared UI files plus optional minimal `_layout.tsx` integration.
- [x] The earlier review rejection against bundling the workstation/home rewrite into `DRV-MAT-001` was resolved before the parent moved to `review_approved`.
- [x] This packet does not claim or depend on any broader page rewrite outside the accepted foundation slice.

### AC-5 - Parent verification evidence is already in machine truth

- [x] Parent `next` status records the accepted foundation conclusion: shared UI foundation is in place and the `tokens` compatibility layer unblocks the `_layout.tsx` integration.
- [x] Parent `review_notes_zh` records the full verification set: `typecheck`, `test`, and `lint` all passed for `@drts/driver-app`.

Non-blocking note: the lowercase `tokens` import in `_layout.tsx` remains a compatibility detail to watch during `DRV-MAT-002`, but it is not an acceptance blocker for the already approved `DRV-MAT-001` foundation snapshot.

---

## 5) Dependency Map

### 5.1 Formal machine dependency

| Dependency    | Source                   | Status | Why It Matters                                                                                      |
| ------------- | ------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| `DRV-MAT-000` | `DRV-MAT-001.depends_on` | done   | Design freeze established the canonical palette, shared UI direction, and task sequencing baseline. |

### 5.2 Downstream tasks unblocked by the shared foundation

| Consumer      | Current Status | Why It Matters                                                                    |
| ------------- | -------------- | --------------------------------------------------------------------------------- |
| `DRV-MAT-002` | backlog        | Owns shell, onboarding, and workstation/home rewrites after the foundation lands. |
| `DRV-MAT-003` | backlog        | Reuses shared task-list and badge-ready primitives for the inbox surface.         |
| `DRV-MAT-004` | backlog        | Depends on the same shared action, layout, and card posture for trip workflow.    |
| `DRV-MAT-005` | backlog        | Reuses shared danger controls and confirmation-ready layout posture.              |
| `DRV-MAT-006` | backlog        | Reuses shared buttons, forms, status chips, and bottom action patterns.           |
| `DRV-MAT-007` | backlog        | Reuses shared status and platform control primitives.                             |
| `DRV-MAT-008` | backlog        | Reuses shared KPI tiles, segmented controls, and list-row building blocks.        |
| `DRV-MAT-009` | backlog        | Reuses shared form and settings-layout primitives.                                |

### 5.3 Practical review dependencies

| Anchor | Location                                                                        | Why It Matters                                                                              |
| ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| D-P-1  | `ai-status.json` entries for `DRV-MAT-001` and `DRV-MAT-001-SIDECAR-ACCEPTANCE` | Canonical machine truth for current parent and sidecar state.                               |
| D-P-2  | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md`       | Defines the accepted `DRV-MAT-001` scope and verification posture.                          |
| D-P-3  | `docs/02-architecture/driver-app-productization-design-plan-20260504.md`        | Captures the intended shared UI surface and task sequencing.                                |
| D-P-4  | `apps/driver-app/components/ui/index.ts` and `tokens.ts`                        | Current exported shared UI contract and compatibility alias.                                |
| D-P-5  | `apps/driver-app/app/_layout.tsx`                                               | Minimal shell integration anchor for the shared tokens.                                     |
| D-P-6  | `support/sidecars/DRV-MAT-001/DRV-MAT-001-SIDECAR-REVIEW.md`                    | Earlier review-stage evidence freeze, including the historical `_layout.tsx` mismatch note. |

---

## 6) Evidence Inventory

| ID  | Evidence                                 | Location                                                                  |
| --- | ---------------------------------------- | ------------------------------------------------------------------------- |
| E-1 | Parent task machine state                | `ai-status.json` entry for `DRV-MAT-001`                                  |
| E-2 | Sidecar task machine state               | `ai-status.json` entry for `DRV-MAT-001-SIDECAR-ACCEPTANCE`               |
| E-3 | Parent review approval summary           | `ai-status.json` parent `next` and `review_notes_zh`                      |
| E-4 | Parent execution scope and verification  | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md` |
| E-5 | Productization design plan row           | `docs/02-architecture/driver-app-productization-design-plan-20260504.md`  |
| E-6 | Shared UI public export surface          | `apps/driver-app/components/ui/index.ts`                                  |
| E-7 | Shared token contract and compatibility  | `apps/driver-app/components/ui/tokens.ts`                                 |
| E-8 | Minimal shell integration snapshot       | `apps/driver-app/app/_layout.tsx`                                         |
| E-9 | Historical review-stage support evidence | `support/sidecars/DRV-MAT-001/DRV-MAT-001-SIDECAR-REVIEW.md`              |

---

## 7) Reviewer Hotspots (`Gemini2`)

Reviewer should confirm:

1. The packet mirrors current machine truth: parent `DRV-MAT-001` is `review_approved`, while this sidecar remains support-only.
2. The packet treats the old `_layout.tsx` `tokens`/`Tokens` mismatch as historical context now covered by the compatibility alias, not as a still-open acceptance blocker.
3. The packet keeps `DRV-MAT-002` shell/home rewrite scope out of `DRV-MAT-001`.
4. The evidence is tied to current repo files and machine truth, rather than a generic restatement of design requirements.
5. No canonical truth or runtime implementation files were modified by this sidecar refresh.

---

## 8) Handoff Summary

This packet freezes the reviewer-facing acceptance story for `DRV-MAT-001` after the parent reached `review_approved`. It confirms that the shared UI foundation exists, the accepted scope stayed inside `components/ui/*` plus minimal `_layout.tsx` wiring, the `tokens` compatibility alias keeps the current shell integration valid, and the parent verification evidence already recorded in machine truth is sufficient for reviewer consumption. No canonical truth or mainline runtime files were changed while preparing this sidecar.
