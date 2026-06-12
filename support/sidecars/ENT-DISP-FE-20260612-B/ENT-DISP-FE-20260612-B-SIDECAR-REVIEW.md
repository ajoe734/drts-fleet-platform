# ENT-DISP-FE-20260612-B Sidecar Review Packet

**Sidecar Kind:** `review_packet`
**Parent Task:** `ENT-DISP-FE-20260612-B`
**Parent Owner:** `Codex`
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Claude2`
**Generated:** `2026-06-12` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT`

This support artifact corrects the earlier review packet commit
`7d182a8d`, which preserved useful mechanical evidence but framed the parent
implementation as acceptable even though the parent reviewer had already
reopened it. This packet does not modify canonical truth or the parent
implementation. It exists to hand the reopened review context to `Claude2`
without endorsing the canvas-absent false premise.

## 1. Machine Truth Snapshot

### Sidecar - `ENT-DISP-FE-20260612-B-SIDECAR-REVIEW`

- owner=`Codex`
- reviewer=`Claude2`
- status=`review_approved`
- helper_parent=`ENT-DISP-FE-20260612-B`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/ENT-DISP-FE-20260612-B/ENT-DISP-FE-20260612-B-SIDECAR-REVIEW.md`

### Parent - `ENT-DISP-FE-20260612-B`

- owner=`Codex`
- reviewer=`Claude2`
- status=`in_progress`
- acceptance=`web shell/embedded shell 對齊設計稿; 無 admin nav; 基礎 primitives 可供後續頁面使用`
- machine-truth next:
  `Reworking enterprise dispatch shell to match employee self-service canvas: replace admin/ops nav and landing, align embed shell, remove out-of-scope ops pages, then rerun app gates.`

## 2. Review Correction Summary

The earlier sidecar packet should not be used as approval framing for the parent
task.

- It treated dispatch-ops navigation (`overview`, `reassignments`, `supply`) as
  positive evidence.
- It instructed the reviewer to confirm that the shell stayed dispatch-scoped,
  which would have approved the wrong information architecture.
- It told the reviewer to confirm copy claiming the Enterprise Dispatch canvas
  was missing, even though the canonical root already contains that canvas.

The correct review posture is:

- the parent implementation was reopened because the shell must align to the
  employee self-service Enterprise Dispatch canvas
- the branch-local absence of enterprise canvas files is not product truth
- any route copy or checklist that treats the missing-canvas premise as valid is
  itself part of the defect

## 3. Authoritative Defect Evidence

### Canonical root evidence: employee self-service nav exists

Canonical machine-truth root:
`/home/edna/workspace/drts-fleet-platform`

- `/home/edna/workspace/drts-fleet-platform/docs/05-ui/drts-design-canvas/ent-shell.jsx:48-51`
  defines the top navigation as:
  `首頁` / `我的預約` / `行程` / `說明`
- `/home/edna/workspace/drts-fleet-platform/docs/05-ui/drts-design-canvas/ent-screens-1.jsx:46-60`
  shows the home workspace as employee self-service booking flow, not an ops
  dispatch console

### Canonical root evidence: Enterprise Dispatch canvas files are present

These files exist in the canonical root and were timestamped `2026-06-12 14:40`
UTC during this review:

- `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
- `docs/05-ui/drts-design-canvas/ent-shell.jsx`
- `docs/05-ui/drts-design-canvas/ent-screens-1.jsx`
- `docs/05-ui/drts-design-canvas/ent-screens-2.jsx`

### Current parent implementation evidence: false premise is encoded in app copy

- `apps/enterprise-dispatch-web/app/page.tsx:47` says the route stops until a
  dedicated Enterprise Dispatch canvas is supplied
- `apps/enterprise-dispatch-web/app/page.tsx:83-88` says no
  `Enterprise Dispatch.html` canvas exists under
  `docs/05-ui/drts-design-canvas`
- `apps/enterprise-dispatch-web/app/page.tsx:99-100` says the dispatch
  dashboard is pending design handoff

Those statements are false relative to canonical root. They are review defects,
not checklist items to confirm.

### Branch-local evidence: why the false premise looked plausible

This isolated worktree does not currently contain the Enterprise Dispatch canvas
files under `docs/05-ui/drts-design-canvas`; `HEAD` only resolves the directory
entry there. That explains the local perception, but it does not override the
canonical root files above.

## 4. Reusable Mechanical Evidence From The Earlier Parent Branch

The earlier packet contained mechanical evidence that is still useful, provided
it is not mistaken for approval framing.

### Prior parent branch anchor

- branch=`codex/ent-disp-fe-20260612-b`
- anchor commit=`97297e1c9bdd0a1454a7efc3f3e319a7de781514`
- diff target=`origin/dev...codex/ent-disp-fe-20260612-b`
- diff shape=`10 files changed, 973 insertions, 215 deletions`

### Shared `CanvasShell` seam remained additive

From `codex/ent-disp-fe-20260612-b:packages/ui-web/src/canvas-primitives/index.tsx`:

- `:125-146` adds `headerControls` to `ShellProps`
- `:286-308` threads `headerControls` through the `Shell` signature
- `:549-594` renders `headerControls ?? <default controls>`, preserving default
  behavior when the prop is absent

### Defective IA from the earlier implementation is explicit

From `codex/ent-disp-fe-20260612-b:apps/enterprise-dispatch-web/components/enterprise-shell.tsx:21-45`:

- nav keys were `overview`, `reassignments`, and `supply`
- this was the concrete implementation reopened by the parent reviewer because
  it does not match the employee self-service canvas

## 5. Reviewer Checklist

- Confirm the packet no longer endorses the missing-canvas premise.
- Confirm the packet clearly distinguishes canonical-root truth from branch-local
  absence.
- Confirm the parent defect is described as wrong IA and wrong copy, not as a
  lack of design source material.
- Confirm the reusable mechanical evidence is limited to diff shape and the
  additive `headerControls` seam.
- Confirm reviewer identity is `Claude2` throughout this packet.
- Confirm the pushed branch state is recorded accurately for owner closeout
  evidence.

## 6. Verification Snapshot

Reviewed for this packet:

- `AI_NAME=Codex scripts/ai-status.sh show ENT-DISP-FE-20260612-B`
- `AI_NAME=Codex scripts/ai-status.sh show ENT-DISP-FE-20260612-B-SIDECAR-REVIEW`
- canonical-root file presence and timestamps for:
  `Enterprise Dispatch.html`, `ent-shell.jsx`, `ent-screens-1.jsx`,
  `ent-screens-2.jsx`
- canonical-root line anchors in `ent-shell.jsx` and `ent-screens-1.jsx`
- current worktree line anchors in `apps/enterprise-dispatch-web/app/page.tsx`
- prior parent branch anchors via `git show codex/ent-disp-fe-20260612-b:...`

Push-state note:

- `git ls-remote --heads origin codex/ent-disp-fe-20260612-b-sidecar-review`
  resolves commit `61e6d848bf72d977e4c0f9fe84dd749c8d639514`
- corrected packet is pushed on
  `origin/codex/ent-disp-fe-20260612-b-sidecar-review` and can be closed out
  from this branch state

## 7. Reviewer Handoff

For `Claude2`:

- treat this as a support-only packet for the reopened parent review
- use Section 3 as the authoritative reason the earlier packet framing was wrong
- use Section 4 only as reusable mechanical evidence, not as approval guidance
- after sidecar review, the parent owner still needs to rework the actual
  implementation branch to match the employee self-service canvas
