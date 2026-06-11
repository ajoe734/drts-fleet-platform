# BANK-UI-STATEMENTS-20260610 Sidecar Acceptance Packet

This document is the support-only acceptance packet for `BANK-UI-STATEMENTS-20260610`.
It does not change canonical truth, runtime code, design sources, or parent-task
ownership. It consolidates the repo facts the assigned sidecar reviewer (`Claude2`) can
use when auditing the parent statements slice and this support task.

Anchors used here come from:

- `ai-status.json` via `scripts/ai-status.sh show BANK-UI-STATEMENTS-20260610`
- `apps/bank-console-web/app/statements/page.tsx`
- `apps/bank-console-web/components/pending-screen.tsx`
- `docs/05-ui/drts-design-canvas/Bank Console.html`
- `docs/05-ui/drts-design-canvas/bank-screens-2.jsx`
- `apps/bank-console-web/lib/translations.ts`
- `packages/ui-tokens/src/brands.ts`

## 1. Scope & Boundary

- **Task ID:** `BANK-UI-STATEMENTS-20260610-SIDECAR-ACCEPTANCE`
- **Parent Task:** `BANK-UI-STATEMENTS-20260610`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Codex`
- **Reviewer:** `Claude2`
- **Mutates Canonical:** `false`
- **Objective:** hand off a reviewer-facing acceptance checklist, dependency map, and
  current baseline for the bank-console statements slice without editing L1/L2 truth or
  parent runtime files.

Guardrails for this packet:

- Only support artifacts belong in `support/sidecars/BANK-UI-STATEMENTS-20260610/`.
- Do not rewrite the parent task's `acceptance` contract.
- Do not treat design canvas files as editable implementation targets; they are visual
  truth only.

## 2. Machine-Truth Anchors

### Parent task: `BANK-UI-STATEMENTS-20260610`

| Field | Value |
| --- | --- |
| Title | `BANK-UI-STATEMENTS: bank-console settlement statements (BK_Statements/Detail)` |
| Owner | `Codex` |
| Reviewer | `Claude2` |
| Status | `in_progress` |
| Depends on | `CCAT-APP-SCAFFOLD-20260610`, `CCAT-API-STATEMENTS-20260610` |
| Artifacts | `apps/bank-console-web/app/statements/page.tsx`, `apps/bank-console-web/app/statements/[period]/page.tsx`, `docs/05-ui/drts-design-canvas/bank-screens-*.jsx`, `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` |
| Acceptance | per-trip lines, masked refs, issuer-pays-DRTS direction, signed-artifact download, dispute path, BK_* canvas match, zh-TW via `t()`, issuer brand from `@drts/ui-tokens`, `pnpm --filter @drts/bank-console-web typecheck` and `build` |
| Last update | `2026-06-11T12:29:52Z` |

Parent-task notes already recorded in machine truth matter for reviewer context:

- `next` says the owner branch is clean and pushed at `54159f9f`, reviewer approval is
  already recorded, and final `done` is gated on integration-level action beyond
  `branch_pushed`.
- `review_notes_zh` already captures the substantive review evidence: per-trip detail,
  masking, issuer-pays-DRTS direction, signed downloads, dispute path, canvas parity,
  central `t()`, token-sourced brand colors, and passing `build`/`typecheck`.

This packet does not override those recorded notes. It packages them into a sidecar
review artifact.

### Sidecar task: `BANK-UI-STATEMENTS-20260610-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Owner | `Codex` |
| Reviewer | `Claude2` |
| Status at dispatch | `backlog` |
| `task_class` | `sidecar` |
| `helper_kind` | `acceptance_packet` |
| `mutates_canonical` | `false` |
| Artifact | `support/sidecars/BANK-UI-STATEMENTS-20260610/BANK-UI-STATEMENTS-20260610-SIDECAR-ACCEPTANCE.md` |

## 3. Current Baseline And Design Truth

The repo baseline before reading the parent diff is unambiguous:

- `apps/bank-console-web/app/statements/page.tsx` in this worktree is a `PendingScreen`
  stub, not the finished statements implementation.
- `apps/bank-console-web/components/pending-screen.tsx` explicitly exists to avoid
  inventing a final screen when no canvas exists. That rationale does **not** apply to
  statements, because the bank canvas already includes statements artboards.
- `docs/05-ui/drts-design-canvas/Bank Console.html` includes:
  - `/statements` as artboard `BK_Statements`
  - `/statements/[period]` as artboard `BK_StatementDetail`
- `docs/05-ui/drts-design-canvas/bank-screens-2.jsx` defines the visual contract for
  both screens, including KPI row, period table, per-trip detail table, masked
  references, signed-artifact download actions, and a dispute notice path.

Reviewer consequence:

- A placeholder route is acceptable as a temporary scaffold state.
- A placeholder route is **not** acceptable as the parent task's final delivered state,
  because the required canvas is present and the parent acceptance explicitly demands BK
  canvas parity.

## 4. Dependency Map

### Declared upstream dependencies

The parent task formally declares:

- `CCAT-APP-SCAFFOLD-20260610`
- `CCAT-API-STATEMENTS-20260610`

Observed machine-truth state during this sidecar pass:

- `scripts/ai-status.sh show CCAT-APP-SCAFFOLD-20260610` returned `Task not found`.
- `scripts/ai-status.sh show CCAT-API-STATEMENTS-20260610` returned `Task not found`.

Interpretation:

- These dependencies are still authoritative because they are recorded on the parent
  task.
- Their current status cannot be confirmed from machine truth under those exact IDs in
  this worktree session.
- The sidecar reviewer should treat them as declared-but-unresolved identifiers unless a
  supervisor or parent owner points to renamed/rekeyed task rows.

### Practical dependency meaning

| Dependency | Why it matters to the parent slice |
| --- | --- |
| `CCAT-APP-SCAFFOLD-20260610` | Provides the bank-console route/shell scaffold the statements screens land into. |
| `CCAT-API-STATEMENTS-20260610` | Provides the statements data/API shape implied by the canvas and the parent acceptance language around per-trip lines, dispute flagging, and signed artifacts. |

Because this is a support-only task, this packet does not attempt to repair dependency
key drift. It only records that the declared IDs were not resolvable via the standard
task-status command at packet write time.

## 5. Parent Acceptance Checklist

These checks translate the parent task's acceptance string and the bank canvas into a
reviewer-facing checklist.

### A. Canvas parity

- [ ] `/statements` matches `BK_Statements` in
  `docs/05-ui/drts-design-canvas/bank-screens-2.jsx`.
- [ ] `/statements/[period]` matches `BK_StatementDetail` in the same canvas file.
- [ ] The implementation does not stop at `PendingScreen` once the parent task claims
  completion.

### B. Statements content

- [ ] The period list shows period, trip count, total amount, issued date, due date,
  signed-artifact state, and statement status.
- [ ] The detail screen shows per-trip lines with fare, subsidy, out-of-pocket, masked
  benefit reference, masked cardholder reference, and period total.
- [ ] The issuer-pays-DRTS money-flow direction is stated on the detail surface.
- [ ] Signed-artifact download is present.
- [ ] The dispute-line path exists for a single trip.

### C. Data safety and localization

- [ ] Cardholder and card references remain masked in the rendered data.
- [ ] zh-TW stays primary through central `t()` usage; no inline locale ternaries are
  introduced for the statements surface.

### D. Token and verification gates

- [ ] Issuer brand colors come from `@drts/ui-tokens`, not app-local raw hex values.
- [ ] `pnpm --filter @drts/bank-console-web typecheck`
- [ ] `pnpm --filter @drts/bank-console-web build`

## 6. Packet Completeness Check

- [x] This sidecar created only a support artifact.
- [x] The packet anchors itself to machine truth for the parent and sidecar rows.
- [x] The packet records the current local baseline: `app/statements/page.tsx` is still a
  placeholder in this worktree.
- [x] The packet ties acceptance to the concrete bank canvas artboards rather than an
  invented redesign.
- [x] The packet records that the parent's declared dependency IDs were not resolvable by
  `scripts/ai-status.sh show` during this session.

## 7. Reviewer Handoff Notes For `Claude2`

1. Reconfirm the sidecar row still points at this file and still belongs to `Codex` →
   `Claude2`.
2. Reconfirm whether the dependency IDs were renamed elsewhere in machine truth. If they
   were, refresh Section 4 before approving.
3. Use the parent task's recorded `review_notes_zh` as the primary evidence anchor for
   the completed statements slice; this packet exists to make that evidence reviewable
   without reopening runtime files first.
4. Reject any attempt to treat the local `PendingScreen` scaffold as sufficient evidence
   of parent completion; the canvas already defines the final statements surfaces.
5. Approval for this sidecar should verify that the only task-scoped content change is
   this support artifact plus machine-truth lifecycle transitions written via
   `scripts/ai-status.sh`.
