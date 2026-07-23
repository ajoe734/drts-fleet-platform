# MTX-DESIGN-WAVE0 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Task ID:** `MTX-DESIGN-WAVE0-SIDECAR-ACCEPTANCE`  
**Parent Task:** `MTX-DESIGN-WAVE0`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Gemini`  
**Generated:** `2026-07-23` (UTC)  
**Scope:** support-only artifact; does not edit canonical truth, runtime code, or design source.

This packet is the reviewer-facing acceptance companion for `MTX-DESIGN-WAVE0`
("Wave 0 design gates"). It consolidates the parent machine-truth closeout,
the Wave 0 design-gate checklist from the execution packet, and the downstream
unlock map documented by the parent handoff evidence.

## 1. Scope Boundary

In scope:

- capture the sidecar machine-truth anchors for
  `MTX-DESIGN-WAVE0-SIDECAR-ACCEPTANCE`
- summarize the parent task closeout evidence already recorded in machine truth
- provide a reviewer-ready checklist for the Wave 0 design packet and handoff
- map the documented downstream unlocks for Fleets B, C, D, F, and H

Out of scope:

- editing canonical source specs, execution packets, or design canvases
- changing the parent `MTX-DESIGN-WAVE0` record or its commit evidence
- claiming downstream implementation tasks exist in machine truth when they are
  only documented in the execution packet

## 2. Machine-Truth Anchors

### Sidecar - `MTX-DESIGN-WAVE0-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Gemini`
- status=`in_progress` at packet creation time
- depends_on=`none`
- helper_parent=`MTX-DESIGN-WAVE0`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/MTX-DESIGN-WAVE0/MTX-DESIGN-WAVE0-SIDECAR-ACCEPTANCE.md`

Live workflow fields such as `status`, `next`, and `last_update` remain
authoritative only in `ai-status.json`.

### Parent - `MTX-DESIGN-WAVE0`

Machine-truth snapshot observed during this dispatch:

- owner=`Gemini`
- reviewer=`Codex`
- status=`done`
- acceptance=`state matrix+frames+frozen copy+a11y+prototype+handoff for all
  four design packets` and `design QA handoff complete`
- commit=`e49a64977e4a38e8178897c7c12718a369ba4d0c`
- subject=`fix(MTX-DESIGN-WAVE0): fix handoff annotations, legal denial a11y
  focus traps and rating detail sections`
- push target=`origin/gemini/mtx-design-wave0`
- integration_status=`not_applicable`
- latest machine-truth note=`Finalized MTX-DESIGN-WAVE0 task closeout with
  approved commit e49a64977 pushed to origin/gemini/mtx-design-wave0`

Reviewer implication:

- the parent task is already formally closed in machine truth
- this sidecar is a post-closeout support packet, not a blocker repair or a
  replacement for the parent handoff document

## 3. Canonical Evidence Surfaces

The packet is anchored to these already-existing sources:

- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`
  - defines Wave 0 design gates, acceptance language, and dependency order
- parent closeout commit `e49a64977e4a38e8178897c7c12718a369ba4d0c`
  - updates:
    - `docs/05-ui/drts-design-canvas/mtx-operations-screens.jsx`
    - `docs/05-ui/multi-taxi-operations-design-wave0-handoff-20260723.md`
- parent handoff document
  `docs/05-ui/multi-taxi-operations-design-wave0-handoff-20260723.md`
  - declares `Status: review_ready`
  - maps Screen IDs, frame names, components, prototype flows, frozen copy,
    a11y behavior, API bindings, and screenshot evidence

Important caveat:

- in this sidecar branch, the parent closeout files are read via the recorded
  commit object rather than the current worktree path
- that does not change their canonical status; it only reflects that this
  isolated sidecar worktree was branched separately from the parent owner lane

## 4. Wave 0 Deliverable Coverage

The execution packet defines four design gates plus one design-QA handoff gate.
The parent handoff evidence covers all of them as follows.

| Gate | Execution-packet expectation | Evidence observed in parent handoff |
| --- | --- | --- |
| `MTX-DESIGN-001` Operating Authorization Console | state matrix, desktop+narrow frames, frozen copy, a11y annotations, prototype flow, implementation handoff | `MTX-AUTH-UI-01..06` frame matrix, desktop+narrow entries, component bindings, focus-trap notes, screenshot evidence |
| `MTX-DESIGN-002` Queue Semantics Operations | explicit queue modes, legal denial presentation, non-bypassable denial copy, state coverage | `MTX-QUEUE-UI-01..03` frame matrix, legal denial modal, Highway Law §91 copy, `preventBypass` a11y behavior |
| `P5-DESIGN-001` Rating Governance | review queue/detail, moderated states, server-owned driver summary, non-happy states | `P5-RATE-UI-01..03` frame matrix, invalidation flow, locked aggregate authority summary, screenshot evidence |
| `P5-DESIGN-002` Fare/Payment/Receipt/Retention Operations | fare anomaly, payment pending/failed/reversed, certificate failure, retention/legal hold/export states | `P5-COM-UI-01..05` frame matrix, fail-closed fare copy, payment exception, records query, controlled export/legal hold evidence |
| `P5-S3-DESIGN-QA-001` Handoff Completion | editable source, prototype links, responsive frames, copy/state matrices, a11y/dev annotations, PNG evidence, forbidden-word scan | handoff packet sections 2-10, clickable flow matrix, bilingual copy deck, state/permission matrix, developer annotations, screenshot manifest, forbidden-term scan pass |

## 5. Dependency / Unlock Map

These are reviewer-relevant unlock relationships from the execution packet and
parent handoff document. They are not asserted as active `depends_on` edges in
machine truth unless a task row exists there.

| Wave 0 gate | Downstream surface unlocked | Source of unlock claim | Machine-truth availability |
| --- | --- | --- | --- |
| `MTX-DESIGN-001` | Fleet B UI / `MTX-AUTH-UI-001` | execution packet §3 and §5 | task row not found in `ai-status.sh show` during this dispatch |
| `MTX-DESIGN-002` | Fleet C UI / `MTX-QUEUE-003` | execution packet §3 and §5 | task row not found in `ai-status.sh show` during this dispatch |
| `P5-DESIGN-001` | Fleet D moderation UI / `P5-RATE-003` | execution packet §3 and §5 | task row not found in `ai-status.sh show` during this dispatch |
| `P5-DESIGN-002` | Fleet F operational UI | execution packet §3, parent handoff §1 and §11 | parent handoff names `P5-COM-UI-01..05`; no single task row was validated here |
| all four gates | Fleet H design QA / `P5-S3-DESIGN-QA-001` | execution packet §3 and parent handoff §1 | task row not found in `ai-status.sh show` during this dispatch |

Reviewer takeaway:

- the unlock map is documented and internally consistent across the execution
  packet and parent handoff
- the downstream task IDs are not universally present as standalone
  machine-truth rows in the current board slice, so this sidecar must not
  overstate them as live tracked dependencies

## 6. Reviewer Checklist

Use this checklist when reviewing the sidecar and sanity-checking the parent
design closeout evidence.

1. Verify machine truth first.
   - `MTX-DESIGN-WAVE0` should remain `done` with commit
     `e49a64977e4a38e8178897c7c12718a369ba4d0c` and push target
     `origin/gemini/mtx-design-wave0`.

2. Verify the parent handoff packet covers all Wave 0 gates.
   - Authorization, queue semantics, rating governance, and commerce/retention
     all need explicit frame coverage, not prose-only claims.
   - The handoff must also include Design QA evidence for copy, accessibility,
     prototype flow, and screenshots.

3. Verify the legal and fail-closed constraints remain explicit.
   - Queue denial for `physical_rank` and `taxi_stand` must be legally
     non-bypassable.
   - Fare quote failure must remain fail-closed rather than inventing a
     fallback amount.
   - Rating governance must not imply direct editing of aggregate ratings.

4. Verify responsive and accessibility evidence exists where required.
   - Narrow/mobile variants should be present for the surfaces called out in
     the handoff matrix.
   - Dialog/focus-trap behavior should be explicitly annotated for legal denial
     and confirmation flows.

5. Verify developer handoff depth is implementation-usable.
   - Screen IDs, component names, API bindings, state names, and screenshot
     artifacts should be present and consistent.
   - The packet should support Fleet B/C/D/F implementation without reopening
     the visual contract.

6. Respect the sidecar boundary.
   - If the reviewer finds a gap, route it as a parent evidence concern or a
     new board task; do not treat this support packet as authority to mutate
     canonical design truth.

## 7. Expected Reviewer Conclusion Shape

If the sidecar is accepted, the reviewer handoff should confirm:

- parent closeout for `MTX-DESIGN-WAVE0` is already consistent in machine truth
- Wave 0 handoff evidence covers all four design gates plus Design QA
- dependency/unlock map is documented without overstating missing task rows
- no canonical truth changes were made by this sidecar

If the sidecar is rejected or reopened, the issue should fall into one of these
classes:

- parent handoff evidence missing a required gate or state matrix
- unlock claims exceed what the execution packet or handoff actually document
- sidecar misstates machine-truth status or closeout evidence
- sidecar crosses the support-only boundary into canonical interpretation

## 8. Evidence Snapshot

Evidence used to assemble this packet:

- `scripts/ai-status.sh show MTX-DESIGN-WAVE0-SIDECAR-ACCEPTANCE`
- `scripts/ai-status.sh show MTX-DESIGN-WAVE0`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`
- `git show --name-only e49a64977e4a38e8178897c7c12718a369ba4d0c`
- `git show e49a64977e4a38e8178897c7c12718a369ba4d0c:docs/05-ui/multi-taxi-operations-design-wave0-handoff-20260723.md`
- `git show e49a64977e4a38e8178897c7c12718a369ba4d0c:docs/05-ui/drts-design-canvas/mtx-operations-screens.jsx`
- `scripts/ai-status.sh show MTX-AUTH-UI-001` -> `Task not found`
- `scripts/ai-status.sh show MTX-QUEUE-003` -> `Task not found`
- `scripts/ai-status.sh show P5-RATE-003` -> `Task not found`
- `scripts/ai-status.sh show P5-S3-DESIGN-QA-001` -> `Task not found`

Known limits:

- this packet does not restate the full parent handoff document
- this packet does not claim verification of downstream implementation task
  execution, only the documented Wave 0 design unlocks
- this packet intentionally avoids editing or normalizing any canonical design
  files into this sidecar branch
