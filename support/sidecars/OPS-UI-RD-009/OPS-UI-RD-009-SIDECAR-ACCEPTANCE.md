# OPS-UI-RD-009 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `OPS-UI-RD-009` — Wave 2 closeout — visual review packet
**Parent Owner:** `Claude2`
**Parent Reviewer:** `Claude`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Claude2`
**Generated:** `2026-05-10` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, or the closeout doc itself.

This packet is the reviewer-facing acceptance companion to
`docs/05-ui/ops-console-redesign-closeout-20260510.md`. The closeout doc
remains the canonical Wave 2 sign-off artifact; this packet pins the
machine-truth anchors, the dependency map, and the acceptance checklist that
the parent reviewer (`Claude`) is expected to apply against the closeout doc.

Transient parent lifecycle truth (`status`, `next`, `last_update`) remains
authoritative only in `ai-status.json`. This packet does not snapshot those
fields, by design — the XS-UI-002 sidecar refresh lesson applies here too.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar as a concrete reviewer checklist against
  the closeout doc and its surface signoff matrix
- pin the machine-truth dependency on `OPS-UI-RD-001`..`OPS-UI-RD-008`
- enumerate the verifiable anchors the closeout doc cites (commit hashes,
  approval timestamps, canvas anchors, parity story files)
- record the parent task's structural shape so a reviewer can audit the
  closeout doc without re-deriving it from scratch

Out of scope:

- editing L1/L2 product truth, the closeout doc, or `ai-status.json`
- editing the design canvas (`docs/05-ui/drts-design-canvas/Ops Console.html`)
  or any parity story under `packages/ui-web/src/ops-*.stories.tsx`
- re-running per-task acceptance commands; per the closeout doc those were
  recorded at each upstream task's `review_approved` event and are not part
  of this packet's scope
- mutating or "absorbing" the parent task; absorption is the parent owner's
  decision, not the sidecar's

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json → OPS-UI-RD-009-SIDECAR-ACCEPTANCE`

- owner=`Claude`
- reviewer=`Claude2`
- depends_on=`OPS-UI-RD-001`..`OPS-UI-RD-008`
- task_class=`sidecar`
- helper_parent=`OPS-UI-RD-009`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/OPS-UI-RD-009/OPS-UI-RD-009-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent — `ai-status.json → OPS-UI-RD-009`

- owner=`Claude2`
- reviewer=`Claude`
- phase=`Wave 2`
- depends_on=`OPS-UI-RD-001`..`OPS-UI-RD-008`
- acceptance=`每個 surface 標註 reviewer + 通過時間`
- artifact root=`docs/05-ui/ops-console-redesign-closeout-20260510.md`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- branch on which the cited commits live=`origin/feat/claude2-ui-redesign-foundation`

### Upstream Wave 2 dependencies (all `done` in `ai-status.json`)

| Dep ID          | Status | Reviewer of record | Approved (UTC)       | Shipped commit           | Primary artifact root                                                          |
| --------------- | ------ | ------------------ | -------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `OPS-UI-RD-001` | `done` | `Codex2`           | 2026-05-10T14:51:55Z | `cd10d83`                | `apps/ops-console-web/app/layout.tsx` + sidebar                                |
| `OPS-UI-RD-002` | `done` | `Claude2`          | 2026-05-10T16:13:46Z | `449e419`                | `apps/ops-console-web/app/globals.css`                                         |
| `OPS-UI-RD-003` | `done` | `Codex2`           | 2026-05-10T17:24:05Z | `675be25`                | `apps/ops-console-web/app/dashboard/page.tsx`                                  |
| `OPS-UI-RD-004` | `done` | `Codex2`           | 2026-05-10T18:20:26Z | `8f3efa2`                | `apps/ops-console-web/app/dispatch/*`                                          |
| `OPS-UI-RD-005` | `done` | `Codex`            | 2026-05-10T17:52:18Z | `646696e`                | `apps/ops-console-web/app/callcenter/page.tsx`                                 |
| `OPS-UI-RD-006` | `done` | `Codex`            | 2026-05-10T20:01:46Z | `c97924a` over `1d72fe3` | `apps/ops-console-web/app/{complaints,incidents}/page.tsx`                     |
| `OPS-UI-RD-007` | `done` | `Codex`            | 2026-05-10T19:07:04Z | `e1c4965`                | `apps/ops-console-web/app/{reports,revenue,attendance,maintenance}/page.tsx`   |
| `OPS-UI-RD-008` | `done` | `Codex`            | 2026-05-10T18:05:44Z | `91f37c4`                | `apps/ops-console-web/app/{drivers,vehicles,contracts,feature-flags}/page.tsx` |

Branch presence assertion:

- every commit hash above resolves on `origin/feat/claude2-ui-redesign-foundation`
  at packet generation time (verified via `git branch -r --contains <sha>`)

### Authoritative supporting documents

- `docs/05-ui/ops-console-redesign-closeout-20260510.md` (canonical closeout doc)
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` (planning ref)
- `docs/05-ui/drts-design-canvas/Ops Console.html` (design source of truth)
- `packages/ui-web/src/ops-dashboard.stories.tsx`
- `packages/ui-web/src/ops-callcenter.stories.tsx`
- `packages/ui-web/src/ops-incidents.stories.tsx`
- `packages/ui-web/src/ops-reporting.stories.tsx`
- `packages/ui-web/src/ops-master-data.stories.tsx`
- `packages/ui-web/src/tenant-shell.stories.tsx` (composes `ManagementShell`)
- `packages/ui-web/src/platform-shell.stories.tsx` (composes `ManagementShell`)
- `packages/ui-web/src/management-{primitives,sidebar,topbar}.stories.tsx`
  (shell primitives — note: no `management-shell.stories.tsx` exists; the
  composed shell is exercised through `tenant-shell` and `platform-shell`
  stories)

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

The parent task formally depends on all eight Wave 2 implementation slices.
The closeout doc's role is to bind each slice to its reviewer + approval +
commit + canvas/story anchor, not to re-litigate per-slice acceptance.

| Dep ID          | What it contributes to `OPS-UI-RD-009`                                                                                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPS-UI-RD-001` | Shell adoption baseline; required so every other surface row is "post-shell" in the closeout matrix.                                                                                                                                                                        |
| `OPS-UI-RD-002` | Global token / CSS cleanup; the closeout records this as a no-anchor row because it is token-level rather than a surface redesign.                                                                                                                                          |
| `OPS-UI-RD-003` | Dashboard surface row + canvas anchor `Ops Console.html#dashboard` + parity story `ops-dashboard.stories.tsx`.                                                                                                                                                              |
| `OPS-UI-RD-004` | Dispatch (owned + forwarded) row + canvas anchor `Ops Console.html#dispatch-flow`; parity coverage is via in-app snapshot tests rather than a `packages/ui-web` story.                                                                                                      |
| `OPS-UI-RD-005` | Callcenter row + canvas anchor `Ops Console.html#callcenter` (`OC_Callcenter`) + parity story `ops-callcenter.stories.tsx`.                                                                                                                                                 |
| `OPS-UI-RD-006` | Complaints + Incidents row + canvas anchors `OC_Complaints`, `OC_Incidents`, `OC_IncidentDetail` under `Ops Console.html#callcenter` + parity story `ops-incidents.stories.tsx`. Two commits ship the redesign (`1d72fe3` primitive adoption, `c97924a` KPI alignment fix). |
| `OPS-UI-RD-007` | Reports / Revenue / Attendance / Maintenance row + four canvas anchors + parity story `ops-reporting.stories.tsx`.                                                                                                                                                          |
| `OPS-UI-RD-008` | Master data row (drivers / vehicles / contracts / flags) + four canvas anchors + parity story `ops-master-data.stories.tsx`.                                                                                                                                                |

Assertion:

- The closeout doc does not invent new acceptance bars. Each row's reviewer +
  timestamp + commit triple is sourced from the corresponding `done` task's
  `commit_recorded_at`, `commit_reviewer`, and `commit_hash` in
  `ai-status.json`, plus the matching `review_approved` event in
  `ai-activity-log.jsonl`.

### B. Downstream consumer map

The Wave 2 closeout is a terminal closeout artifact for the ops-console-web
redesign Wave 2. Its downstream consumers are not other tasks but reviewers
and humans who need a stable "what shipped" anchor for the Wave.

| Consumer                                                              | Relationship       | Why `OPS-UI-RD-009` matters                                                                                                        |
| --------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Human reviewer / product owner                                        | primary consumer   | Single page that binds every shipped surface to a reviewer signature and a reproducible `before..after` git delta.                 |
| Future ops-console redesign waves                                     | reference baseline | Wave 3+ work can cite the matrix as the "post-Wave-2 baseline" without re-deriving each commit.                                    |
| Tenant / platform-admin redesign waves (`TEN-UI-RD-*`, `ADM-UI-RD-*`) | structural sibling | The matrix shape (surface · reviewer · approved-at · before · after · canvas · parity story) is a template these waves can mirror. |
| Design canvas maintenance (`docs/05-ui/drts-design-canvas/`)          | anchor inventory   | Closeout enumerates which canvas anchors are load-bearing for Wave 2; canvas refactors must preserve them.                         |

Dispatch interpretation:

- No `ai-status.json` task has a hard machine-truth `depends_on` edge to
  `OPS-UI-RD-009` at packet time. The consumers above are reference / template
  consumers, not formal dependencies, and should not be promoted to hard
  dependencies in machine truth without an explicit decision.

---

## 4. Acceptance Checklist

This checklist restates the parent acceptance bar —
`每個 surface 標註 reviewer + 通過時間` ("each surface annotated with reviewer +
approval time") — as a reviewable checklist against
`docs/05-ui/ops-console-redesign-closeout-20260510.md`. The closeout doc's own
"Verification scope" section already enumerates the four reviewer asks; this
checklist makes them auditable line items.

Legend: `[REQUIRED]` = explicit parent acceptance bar. `[DERIVED]` = reviewer
support gate for this packet.

### A. Reviewer-signature coverage `[REQUIRED]`

- [x] Every Wave 2 surface (`OPS-UI-RD-001`..`OPS-UI-RD-008`) appears as a row
      in the closeout surface signoff matrix.
- [x] Each row records the reviewer of record (`Codex` / `Codex2` / `Claude2`)
      that posted the final `review_approved` event for the corresponding
      `ai-status.json` task.
- [x] Each row records an approval UTC timestamp.
- [x] Each row records a shipped commit hash.

### B. Machine-truth consistency `[REQUIRED]`

- [x] Every `(reviewer, approved-at)` pair in the matrix matches the final
      `review_approved` event for that task in `ai-activity-log.jsonl`.
- [x] Every `commit_hash` in the matrix matches the `commit_hash` recorded on
      the corresponding `ai-status.json` task entry.
- [x] Every `commit_hash` resolves on `origin/feat/claude2-ui-redesign-foundation`.

### C. Canvas + parity anchor existence `[REQUIRED]`

- [x] `Ops Console.html#dashboard` exists in `docs/05-ui/drts-design-canvas/Ops Console.html`.
- [x] `Ops Console.html#dispatch-flow` exists.
- [x] `Ops Console.html#callcenter` exists (covers `OC_Callcenter`,
      `OC_Complaints`, `OC_Incidents`, `OC_IncidentDetail`).
- [x] `Ops Console.html#reports`, `#revenue`, `#attendance`, `#maintenance`
      all exist.
- [x] `Ops Console.html#drivers`, `#vehicles`, `#contracts`, `#flags` all exist.
- [x] Parity stories `packages/ui-web/src/ops-{dashboard,callcenter,incidents,reporting,master-data}.stories.tsx`
      all exist.
- [x] `OPS-UI-RD-001` shell-row citation either resolves to an existing
      `packages/ui-web/src/*.stories.tsx` file or is removed. The
      `management-shell.stories.tsx` file does **not** exist on this branch;
      the composed `ManagementShell` is exercised through
      `tenant-shell.stories.tsx` and `platform-shell.stories.tsx`, with shell
      primitives covered by `management-{primitives,sidebar,topbar}.stories.tsx`.

### D. Sidecar handoff readiness `[DERIVED]`

- [x] This packet matches the current machine-truth owner/reviewer assignment
      for both the sidecar and the parent task.
- [x] This packet does not snapshot live parent `status` / `next` /
      `last_update` values; those remain authoritative in `ai-status.json`.
- [x] This packet does not edit canonical truth — the closeout doc and the
      `ai-status.json` task remain untouched by this sidecar.
- [x] This packet does not record `done` evidence for the parent task; that
      step is the parent owner's responsibility after parent review approval.

---

## 5. Reviewer Focus

For `Claude2` reviewing this sidecar:

- confirm the machine-truth anchor section matches the current `ai-status.json`
  fields for both `OPS-UI-RD-009-SIDECAR-ACCEPTANCE` and `OPS-UI-RD-009`, with
  mutable parent lifecycle truth deferred to `ai-status.json`
- confirm the dependency map upstream table matches the eight `done` tasks'
  `commit_hash` / `commit_recorded_at` / `commit_reviewer` values
- confirm the downstream map does not assert any hard machine-truth
  `depends_on` edges that do not exist in `ai-status.json`
- confirm the acceptance checklist remains a faithful expansion of the
  parent acceptance bar and does not invent new bars
- confirm the packet remains support-only and does not modify
  `docs/05-ui/ops-console-redesign-closeout-20260510.md`, the design canvas,
  any parity story, or `ai-status.json`

---

## 6. Handoff Summary

This sidecar packet is scoped as stable reviewer support material for the
Wave 2 ops-console-web closeout. The closeout doc itself remains canonical;
this packet is a reviewer companion that:

- pins the eight upstream `done` evidence triples in one place
- restates the parent acceptance bar as an auditable checklist
- maps the closeout doc's structural anchors (canvas + parity stories)
- defers all transient parent lifecycle truth to `ai-status.json`

After sidecar review approval the packet is intended to remain in
`support/sidecars/OPS-UI-RD-009/` as a stable reference; it is not absorbed
into the canonical closeout doc and does not change any other artifact.
