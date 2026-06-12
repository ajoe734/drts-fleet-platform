# ENT-DISP-FE-20260612-B Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`  
**Parent Task:** `ENT-DISP-FE-20260612-B` - Enterprise Dispatch shell and primitives  
**Parent Owner:** `Codex`  
**Parent Reviewer:** `Claude2`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Codex2`  
**Generated:** `2026-06-12` (UTC)  
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet is a reviewer-facing handoff companion for parent task
`ENT-DISP-FE-20260612-B`. The parent slice adds the enterprise dispatch web
shell, an embedded shell preview, app-local enterprise primitive wrappers, and
the shared `CanvasShell` extension needed to inject custom topbar controls. This
sidecar does not modify canonical truth or the parent implementation. It exists
to pin the parent status snapshot, the file-level evidence map, and the concrete
review checklist for the assigned reviewer.

At packet generation time, the parent task is in `review` in machine truth. The
implementation anchor visible from this worktree is commit
`97297e1c9bdd0a1454a7efc3f3e319a7de781514`
(`wip(ENT-DISP-FE-20260612-B): anchor shell primitives`) on branch
`codex/ent-disp-fe-20260612-b`.

## 1. Scope Boundary

In scope:

- snapshot the parent task's current machine-truth status and reviewer target
- map the parent branch diff against `origin/dev`
- list the shell, embed, primitive, and shared-library evidence anchors
- restate the parent verification note and current verification gaps
- hand off a reviewer checklist without changing parent runtime files

Out of scope:

- editing canonical implementation files under `apps/enterprise-dispatch-web/**`
  or `packages/ui-web/src/canvas-primitives/index.tsx`
- changing L1/L2 product truth, runtime contracts, registry/governance, or
  parent task ownership records
- absorbing, approving, or closing out the parent task

## 2. Machine Truth Anchors

### Sidecar - `ENT-DISP-FE-20260612-B-SIDECAR-REVIEW`

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress` at packet drafting time
- task_class=`sidecar`
- helper_parent=`ENT-DISP-FE-20260612-B`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/ENT-DISP-FE-20260612-B/ENT-DISP-FE-20260612-B-SIDECAR-REVIEW.md`

### Parent - `ENT-DISP-FE-20260612-B` snapshot

- owner=`Codex`
- reviewer=`Claude2`
- status=`review`
- depends_on=`ENT-DISP-FE-20260612-A`
- artifacts:
  - `apps/enterprise-dispatch-web`
  - `docs/05-ui/drts-design-canvas/ent-kit.jsx`
  - `docs/05-ui/drts-design-canvas/ent-shell.jsx`
- `next` snapshot from machine truth:
  `Implemented enterprise dispatch web shell, embedded shell preview, and theme-bound base primitives in apps/enterprise-dispatch-web; added CanvasShell headerControls override to support shared shell topbar composition. Verification: git diff --check passed. Unable to run app lint/typecheck in this worktree because eslint/tsc are unavailable and pnpm reported missing node_modules.`
- latest visible implementation anchor from git:
  `97297e1c9bdd0a1454a7efc3f3e319a7de781514`

## 3. Parent Diff Shape

Diff target: `origin/dev...codex/ent-disp-fe-20260612-b`

- 10 files changed
- 973 insertions / 215 deletions
- new files:
  - `apps/enterprise-dispatch-web/app/embedded-preview/page.tsx`
  - `apps/enterprise-dispatch-web/components/enterprise-primitives.tsx`
  - `apps/enterprise-dispatch-web/components/enterprise-shell.tsx`
  - `apps/enterprise-dispatch-web/lib/enterprise-theme.ts`
- modified files:
  - `apps/enterprise-dispatch-web/app/globals.css`
  - `apps/enterprise-dispatch-web/app/layout.tsx`
  - `apps/enterprise-dispatch-web/app/page.tsx`
  - `apps/enterprise-dispatch-web/app/reassignments/page.tsx`
  - `apps/enterprise-dispatch-web/app/supply/page.tsx`
  - `packages/ui-web/src/canvas-primitives/index.tsx`

## 4. Evidence Map

### Shared library extension

- `packages/ui-web/src/canvas-primitives/index.tsx:125-146` adds
  `headerControls` to `ShellProps`, making topbar injection explicit.
- `packages/ui-web/src/canvas-primitives/index.tsx:286-308` threads the new
  prop through the `Shell` signature.
- `packages/ui-web/src/canvas-primitives/index.tsx:549-594` renders
  `headerControls ?? <default controls>` so app-specific chrome can replace the
  stock search / keyboard hint / bell / avatar cluster without forking the rest
  of `CanvasShell`.

### Enterprise shell and embed chrome

- `apps/enterprise-dispatch-web/components/enterprise-shell.tsx:21-46` defines
  dispatch-only navigation (`overview`, `reassignments`, `supply`) with no admin
  IA carry-over.
- `apps/enterprise-dispatch-web/components/enterprise-shell.tsx:63-131`
  implements refresh metadata chips with freshness/degraded states.
- `apps/enterprise-dispatch-web/components/enterprise-shell.tsx:134-247`
  implements the operator identity chip used in the custom topbar.
- `apps/enterprise-dispatch-web/components/enterprise-shell.tsx:251-325`
  implements the sidebar health footer envelope.
- `apps/enterprise-dispatch-web/components/enterprise-shell.tsx:328-390`
  mounts `CanvasShell` with ops theme, custom `headerControls`, and
  `sidebarFooter`.
- `apps/enterprise-dispatch-web/components/enterprise-shell.tsx:393-513`
  adds `EnterpriseEmbedShell` on top of `CanvasWindowChrome` for embedded host
  preview flows.
- `apps/enterprise-dispatch-web/components/enterprise-shell.tsx:515-526`
  exports compact top-level actions used by the overview route.

### Enterprise primitive wrappers

- `apps/enterprise-dispatch-web/components/enterprise-primitives.tsx:30-76`
  wraps shared canvas primitives with `enterpriseTheme`.
- `apps/enterprise-dispatch-web/components/enterprise-primitives.tsx:78-110`
  adds app-local layout helpers (`EnterpriseKpiGrid`, `EnterpriseSection`) so
  later pages can stay on the theme-bound wrapper layer.
- `apps/enterprise-dispatch-web/lib/enterprise-theme.ts:3-20` pins the app to
  the ops realm via `buildCanvasTheme({ surface: "ops", density: "compact" })`
  and exports shared page/card layout styles.

### App wiring

- `apps/enterprise-dispatch-web/app/layout.tsx:6-22` makes `EnterpriseShell`
  the root layout shell for the app.
- `apps/enterprise-dispatch-web/app/page.tsx:23-120` turns the landing page
  into a shell/primitives overview with explicit scope guardrails and an embed
  preview entry point.
- `apps/enterprise-dispatch-web/app/reassignments/page.tsx:12-45` converts the
  reassignment route into queue-shell scaffolding rather than placeholder admin
  chrome.
- `apps/enterprise-dispatch-web/app/supply/page.tsx:12-47` converts the supply
  route into monitoring-shell scaffolding using the new KPI and card wrappers.
- `apps/enterprise-dispatch-web/app/embedded-preview/page.tsx:17-67` provides a
  concrete embedded-shell preview with host context, quick action tray, and
  compact controls.

## 5. Reviewer Checklist

- Confirm the shared `CanvasShell` change is additive and backward compatible:
  `headerControls` must only override the topbar control cluster, not alter nav,
  footer, or body layout behavior when absent.
- Confirm the enterprise app now uses ops-themed wrapper primitives rather than
  ad hoc tenant/admin chrome imports.
- Confirm root layout wiring places all enterprise routes inside
  `EnterpriseShell`.
- Confirm the shell nav stays dispatch-scoped and does not introduce admin nav.
- Confirm the embedded preview is support-only and does not claim more product
  scope than the parent task acceptance allows.
- Confirm the parent route copy explicitly records the missing dedicated
  Enterprise Dispatch artboard instead of fabricating runtime detail.
- Confirm the shared-library change is the minimal seam required for the app
  topbar composition (`headerControls` on `CanvasShell`).

## 6. Verification Snapshot

Recorded by the parent owner in machine truth:

- `git diff --check` passed
- app lint/typecheck could not run in this worktree because `eslint` and `tsc`
  were unavailable
- `pnpm` could not complete app checks because `node_modules` were missing

Sidecar preparation verification performed here:

- reviewed parent task status via `AI_NAME=Codex scripts/ai-status.sh show ENT-DISP-FE-20260612-B`
- reviewed sidecar task status via `AI_NAME=Codex scripts/ai-status.sh show ENT-DISP-FE-20260612-B-SIDECAR-REVIEW`
- inspected parent branch diff/stat and anchor commit metadata from
  `codex/ent-disp-fe-20260612-b`

## 7. Reviewer Handoff Notes

For `Codex2` reviewing this sidecar packet:

- this packet is support-only and should be judged on whether it accurately
  captures the parent review surface and evidence anchors
- parent approval remains `Claude2`'s responsibility; this sidecar reviewer is
  only approving the packet/handoff quality
- if the packet looks accurate, approve the sidecar task after checking the
  artifact path and machine-truth references

For `Claude2` reviewing the parent task:

- the implementation branch visible from this worktree is
  `codex/ent-disp-fe-20260612-b`
- the current anchor commit is
  `97297e1c9bdd0a1454a7efc3f3e319a7de781514`
- the highest-risk seam is the shared `CanvasShell` extension in
  `packages/ui-web/src/canvas-primitives/index.tsx`
