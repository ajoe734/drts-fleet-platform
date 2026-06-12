# ENT-DISP-FE-20260612 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Sidecar Task:** `ENT-DISP-FE-20260612-SIDECAR-ACCEPTANCE`  
**Parent Task:** `ENT-DISP-FE-20260612` - Enterprise Dispatch frontend rebuild umbrella  
**Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Claude2`  
**Snapshot Date:** `2026-06-12` (UTC)  
**Snapshot Basis:** machine-truth task board plus current isolated worktree contents

> This is a support-only packet. It does not modify canonical truth, does not close the umbrella task, and does not claim that any Enterprise Dispatch product surface is implemented yet.

---

## 1. Scope Boundary

This sidecar exists to give the assigned reviewer a stable acceptance frame for the Enterprise Dispatch umbrella while the main work is still being split across slices `A` through `F`.

In scope:

- acceptance checklist for the umbrella and each active child slice
- dependency map across `A-F`
- artifact presence / absence snapshot in the current repo
- reviewer handoff notes and risk flags

Out of scope:

- editing canonical product truth
- implementing `apps/enterprise-dispatch-web`
- authoring the missing design-canvas source files declared by the slice tasks
- changing task ownership, parent acceptance, or rollout claims

---

## 2. Current Machine-Truth Snapshot

### 2.1 Parent umbrella

- `ENT-DISP-FE-20260612` is `todo`
- owner / reviewer: `Claude2` / `Codex`
- declared artifacts:
  - `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`
  - `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md`
  - `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
- umbrella acceptance:
  - complete slices `A-F`
  - preserve the product boundary between `enterprise_dispatch` and `credit_card_airport_transfer`
  - keep a complete supervisor task trail

### 2.2 Child slices

| Slice | Status | Owner | Reviewer | Depends On | Acceptance focus |
| --- | --- | --- | --- | --- | --- |
| `A` | `in_progress` | `Claude2` | `Codex` | none | create `apps/enterprise-dispatch-web`, basic shell, runnable typecheck/lint, boundary README |
| `B` | `backlog` | `Codex` | `Claude2` | `A` | enterprise web shell, embed shell, base primitives |
| `C` | `backlog` | `Claude2` | `Codex` | `B` | website booking flow: home, new, review, submitted |
| `D` | `backlog` | `Codex` | `Claude2` | `B` | history, detail, trip, receipt, help |
| `E` | `backlog` | `Claude2` | `Codex` | `B` | gate states and embedded identity handoff |
| `F` | `blocked` | `Gemini` | `Codex` | `A` | API wiring, test coverage, rollout evidence |

### 2.3 Waiting / reviewer-facing items relevant to Codex

- `ENT-DISP-FE-20260612-A` is already in `in_progress` and reviews back to `Codex`
- `ENT-DISP-FE-20260612-B` is backlog assigned to `Codex`
- `ENT-DISP-FE-20260612-D` is backlog assigned to `Codex`
- `ENT-DISP-FE-20260612-F` is `blocked` and explicitly `waiting_for: Codex` because its API/test slice cannot resume until `B-E` create the UI routes and shared data adapter surfaces
- this sidecar task is `review_approved`; owner closeout is pending commit / push / `done`

---

## 3. Repo Baseline At Review Time

### 3.1 Present source anchors

- `tests/e2e/E2E-001-enterprise-dispatch.sh`
  - existing end-to-end script for the enterprise dispatch full cycle
  - proves the repo already distinguishes the `enterprise_dispatch` flow as its own scenario chain across tenant -> ops -> driver -> billing / audit
- `docs/05-ui/drts-design-canvas/README.md`
  - current design-canvas bundle describes the landed visual sources for Driver / Platform Admin / Ops / Tenant only
  - confirms the design bundle is prototype-only and must be rebuilt in product code

### 3.2 Missing or not-yet-landed artifacts declared by machine truth

At the snapshot used for this packet, the following declared Enterprise Dispatch artifacts are not present in the isolated worktree:

- `apps/enterprise-dispatch-web`
- `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`
- `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md`
- `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
- `docs/05-ui/drts-design-canvas/ent-kit.jsx`
- `docs/05-ui/drts-design-canvas/ent-shell.jsx`
- `docs/05-ui/drts-design-canvas/ent-screens-1.jsx`
- `docs/05-ui/drts-design-canvas/ent-screens-2.jsx`
- `docs/05-ui/drts-design-canvas/ent-states.jsx`

Interpretation:

- the task board is ahead of the repo contents
- slice `A` is the first slice expected to materialize the missing app root and work-package artifact
- slices `B-E` reference Enterprise Dispatch-specific canvas files that are not in the landed design-canvas bundle yet, so implementation must either add those support artifacts first or explicitly re-anchor to another visual source before claiming acceptance

---

## 4. Dependency Map

### 4.1 Formal graph

```text
A -> B
B -> C
B -> D
B -> E
A -> F
(B, C, D, E) -> F practical unblock
```

### 4.2 Meaning of each edge

- `A -> B`: shell/primitives work cannot start until the standalone Enterprise Dispatch app scaffold exists
- `B -> C`: booking flow pages depend on the web shell and shared primitives
- `B -> D`: status/outcome pages depend on the same shell and primitives
- `B -> E`: gate/embed states depend on the same shell and primitives
- `A -> F`: API-tests slice formally depends on the app root existing
- `B-E -> F` practical unblock: machine truth already says `F` remains blocked until UI routes and shared data adapter surfaces exist

### 4.3 Boundary map

Required boundary to preserve throughout all slices:

- Enterprise Dispatch is a dedicated product surface for `enterprise_dispatch`
- it must not reuse the full tenant-console admin shell
- it must not reuse the partner-booking / bank airport-transfer styling or flow assumptions
- existing repo evidence already distinguishes `enterprise_dispatch` from `credit_card_airport_transfer` in tests and contracts, so frontend work must keep that split visible rather than blur it in UI naming, route chrome, or field sets

---

## 5. Acceptance Checklist

### 5.1 Umbrella readiness checklist

- [ ] `A-F` all reach accepted lifecycle states on the task board
- [ ] the repo contains a real `apps/enterprise-dispatch-web` surface rather than only support notes
- [ ] support artifacts and visual-source references exist for every slice that claims design parity
- [ ] no acceptance note claims reuse of tenant-console or partner-booking as the final Enterprise Dispatch shell
- [ ] rollout / test evidence for `F` is recorded only after UI surfaces needed by `F` actually exist

### 5.2 Slice-specific reviewer prompts

`A`

- [ ] `apps/enterprise-dispatch-web` exists
- [ ] `/` renders a basic shell
- [ ] runnable typecheck/lint evidence is recorded
- [ ] README explicitly bans inheriting tenant-portal, tenant-console, and partner-booking surfaces as product reuse

`B`

- [ ] shell has no admin navigation
- [ ] embedded shell is distinct from the full website shell where required
- [ ] primitives are reusable by `C-E`
- [ ] visuals do not drift into teal tenant-console or card-airport styling

`C`

- [ ] flow covers `home -> new -> review -> submitted`
- [ ] review step makes cost center / approval / quota visible
- [ ] submitted state handles both accepted and pending outcomes

`D`

- [ ] history / detail / trip / receipt / help routes exist
- [ ] `availableActions` drives user actions
- [ ] active trip uses a progress rail instead of ad hoc status text

`E`

- [ ] gate states cover auth, suspended, approval, quota, no-supply, degraded
- [ ] embed states cover handoff, reauth, unsupported, consent, fallback
- [ ] no admin navigation or management credential input leaks into the product

`F`

- [ ] API gap map is attached to the final app shape, not to placeholder routes
- [ ] tests cover booking, gate, and embed flows
- [ ] dev URL and rollback notes are recorded
- [ ] unblock evidence explicitly names which `B-E` surfaces the API/test slice now depends on

---

## 6. Reviewer Hotspots

1. The umbrella parent is still `todo`. Do not let any sidecar or child review imply umbrella completion.
2. The current repo already has a valid `enterprise_dispatch` business distinction in tests and contracts; frontend work must preserve that distinction from `credit_card_airport_transfer`.
3. Several artifacts referenced by machine truth are still absent. A review pass should reject any slice that cites those files as if they already exist.
4. `F` is formally dependent on `A` but practically blocked on `B-E`. Reviewer notes should preserve that nuance so rollout work is not restarted too early.
5. Because `B` and `D` are assigned to `Codex`, later execution should treat this packet as upstream context for those two slices.

---

## 7. Recommended Handoff Notes

Use this packet as the reviewer baseline for the current umbrella:

- parent acceptance is organizational, not yet implementation-backed
- slice `A` is the current entry point
- slices `B` and `D` are the upcoming Codex-owned implementation lanes
- slice `F` should stay blocked until the missing UI surfaces and shared adapter layer exist
- any future packet should update the missing-artifact inventory before claiming parity against Enterprise Dispatch-specific design files

---

## 8. Review Conclusion

This sidecar packet is acceptable as a support artifact because it:

- stays within support-only scope
- does not modify canonical truth
- maps the real `A-F` task graph from machine truth
- records the current repo mismatch between declared and materialized Enterprise Dispatch artifacts
- gives the assigned reviewer a concrete checklist for future slice reviews

It does **not** approve the umbrella implementation itself. It only approves the acceptance packet as a reviewer handoff aid and owner closeout reference.
