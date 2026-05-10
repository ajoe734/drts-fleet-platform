# DRV-UI-RD-004 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DRV-UI-RD-004` — Reskin Trip — 7 states 全 visual 對齊
**Parent Owner:** `Codex` (per `ai-status.json -> DRV-UI-RD-004.owner`)
**Parent Reviewer:** `Claude2` (per `ai-status.json -> DRV-UI-RD-004.reviewer`)
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Claude2`
**Generated:** `2026-05-10` (UTC); refreshed `2026-05-10` after parent
availability-first reassignment (Codex → Codex2, reviewer Codex2 → Codex)
and sidecar reassignment (Claude → Claude2); revised `2026-05-10` after
reviewer reopen at `2026-05-10T15:47:46Z` to add the driver-app build
gate + Storybook render gate to §4.E and reframe §6 around per-cycle
handoff state; revised again `2026-05-10` after reviewer reopen at
`2026-05-10T16:08:52Z` to correct the §4.E build-gate description
because `apps/driver-app/package.json` ships both `build=tsc --noEmit`
**and** `prebuild=expo prebuild`, so the cross-cutting build gate runs
the npm `prebuild` lifecycle first and regenerates native scaffolds
(`apps/driver-app/ios/` untracked, possible rewrites under tracked
`apps/driver-app/android/`) before `tsc` — not the previously stated
"output-identical to typecheck" behaviour; refreshed again
`2026-05-10` after a chain of chairman reassignments (parent owner
Codex2 → Codex per `ai-activity-log.jsonl` chair-reassignment events,
parent reviewer Codex → Claude2 at `2026-05-10T16:48:45Z` because
Codex could no longer review its own owner row, sidecar owner
Claude2 → Codex → Claude with the final hop applied at
`2026-05-10T17:48:43Z` per `ai-activity-log.jsonl`
`chair_reassignment_applied` after the Codex owner streak crossed
threshold
on this row, and sidecar reviewer Codex → Claude2 to keep the
reviewer outside the owner lane), plus a parent cycle-position
revert from `review` → `todo` so the parent owner has not yet
re-claimed the task at this packet refresh — earlier WIP edits to
`apps/driver-app/app/trip.tsx` and
`apps/driver-app/components/route-display.tsx` remain in the working
tree but are not attached to a live parent claim yet; revised again
`2026-05-10` after the new sidecar owner (`Claude`) re-claimed the
in_progress sidecar to sweep the packet body so that §1, §2, §3, §4
intro / §4.E / §4.H, §5, §6, §7, and §8 all read the live
ownership pair (parent owner=`Codex`, parent reviewer=`Claude2`,
sidecar owner=`Claude`, sidecar reviewer=`Claude2`), the live parent
status `todo`, the §4.H commit trailers (`LLM-Agent: Codex`,
`Reviewer: Claude2`), and the live `AI_NAME=Claude2` sidecar
approve / reopen handoff lane — header rows 5–8 were already
current before this sweep, only the body was stale
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, the planning ref, runtime behavior, the parent's
machine-truth fields, or any L1/L2 product surface. For the live
machine-truth status of this sidecar row, read
`ai-status.json -> DRV-UI-RD-004-SIDECAR-ACCEPTANCE.status` directly; this
packet does not snapshot it.

This packet is the forward-looking acceptance map for parent
`DRV-UI-RD-004`. At this packet refresh the parent is `todo` in
machine truth — the chairman reverted the parent off `review` and
reassigned the parent owner to `Codex` (with reviewer `Claude2`),
so the parent has **not** been re-claimed yet and no live parent
diff exists at this revision. Earlier uncommitted edits to
`apps/driver-app/app/trip.tsx` and
`apps/driver-app/components/route-display.tsx` (left over from the
prior `Codex2`-owned `review` cycle) are still present in the
working tree but are not attached to a live parent claim — the
reviewer (`Claude2`) and the next parent owner (`Codex`) decide
whether to keep, revise, or discard those edits when the parent
moves to `in_progress` again. The packet stays support-only so the
acceptance framing, dependency map, and reviewer evidence anchors
are already pinned to current truth before the next parent cycle
runs. After the latest chairman reassignment chain, the sidecar
owner / sidecar reviewer pair is `Claude` / `Claude2`, and the
parent owner / parent reviewer pair is `Codex` / `Claude2`. The
same lane (`Claude2`) now reviews both this sidecar and the
parent, replacing the prior same-lane (`Codex`) review pattern;
this remains a deliberate same-lane review configuration (the
sibling DRV-UI / DSY-UI sidecars use the same pattern), it has
just shifted lanes. This packet does **not** pre-approve any
future parent diff.

---

## 1. Scope Boundary

In scope:

- Translate the parent task's `acceptance` field and the planning-ref
  Wave 4 task line plus cross-cutting acceptance gates into a concrete,
  citation-anchored acceptance checklist for the seven trip experience
  states.
- Pin the dependency map and confirm each upstream slice is `done` in
  machine truth.
- Record the formal downstream tasks that depend on `DRV-UI-RD-004` so
  reviewer attention during parent finalize can correctly weigh
  blast-radius risk (forwarded sync_failed handling, location heartbeat,
  provisioning flow, completion-proof gates).
- Preserve a reviewer-handoff command block the assigned sidecar
  reviewer (`Claude2`) can run after this packet is written.

Out of scope:

- editing L1 / L2 product truth (`phase1_*`, contracts bundle), the
  planning-ref workbreakdown doc, or the parent task's machine-truth
  fields (`ai-status.json -> DRV-UI-RD-004`)
- editing `apps/driver-app/app/trip.tsx`,
  `apps/driver-app/components/route-display.tsx`, or any other
  parent-write-scope file under `apps/driver-app/`
- pre-running the parent's acceptance commands, opening a parent-scoped
  commit, or altering parent ownership / reviewership
- predicting the specific shape of the parent diff before the parent
  owner finalizes it
- approving DRV-UI-RD-004 itself (only `Claude2` may do that on the
  parent row, as the live parent reviewer)
- altering forwarded-task contract semantics (`@drts/contracts` is owned
  by the contracts lane, not DRV-UI-RD-004)
- rewriting `apps/driver-app/lib/trip-workflow.ts`,
  `apps/driver-app/lib/api-client.ts`, or
  `apps/driver-app/lib/driver-location-heartbeat.ts` — the planning-ref
  Wave 4 guardrail forbids backend / heartbeat / provisioning behavior
  changes, so these stay read-only context for this slice

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> DRV-UI-RD-004-SIDECAR-ACCEPTANCE`

Persistent fields:

- owner=`Claude` (re-claimed via chairman reassignment from `Codex`
  at `2026-05-10T17:48:43Z` per `ai-activity-log.jsonl` event
  `chair_reassignment_applied`, after the Codex owner streak crossed
  threshold on this row — `failure_streaks
DRV-UI-RD-004-SIDECAR-ACCEPTANCE:owner count=2 threshold=2
awaiting_chair=true`, last terminal exit `2026-05-10T17:26:47Z`
  worker `codex-20260510T172235Z-2379ff2b`. The full owner chain on
  this row over the past ~2.5 hours is
  `Claude2 → Codex → Claude`.)
- reviewer=`Claude2` (reassigned from `Codex` to keep the reviewer
  outside the owner lane after the chairman swapped the owner away
  from `Codex`)
- task_class=`sidecar`
- helper_parent=`DRV-UI-RD-004`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on: `DRV-UI-RD-001` (mirrors the parent's dependency set)
- artifacts:
  `support/sidecars/DRV-UI-RD-004/DRV-UI-RD-004-SIDECAR-ACCEPTANCE.md`
  (this file)
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Live status (read directly from machine truth, not from this packet):

- The current value of
  `ai-status.json -> DRV-UI-RD-004-SIDECAR-ACCEPTANCE.status` is the
  authoritative present state of this sidecar. This packet intentionally
  does not snapshot the live status — any such snapshot becomes false
  the moment the sidecar transitions (e.g., between owner handoff and
  reviewer read, or between approve and done). For the lifecycle history
  of this sidecar, see `ai-activity-log.jsonl` filtered on
  `DRV-UI-RD-004-SIDECAR-ACCEPTANCE`.

### Parent — `ai-status.json -> DRV-UI-RD-004`

- id=`DRV-UI-RD-004`
- title=`Reskin Trip — 7 states 全 visual 對齊`
- summary_zh=`owned_active / forwarded_offered / pending / confirmed /
lost / cancelled / sync_failed。既有 forwarded sync_failed 邏輯不可降級。`
- owner=`Codex`, reviewer=`Claude2` (after a chain of chairman
  reassignments — owner went `Codex` → `Codex2` (availability-first
  rebalance at `2026-05-10T15:13:08Z`) → `Codex` (chair reassignment
  reverting the rebalance), and reviewer was reassigned `Codex2` →
  `Codex` → `Claude2` at `2026-05-10T16:48:45Z` because `Codex` could
  no longer review its own owner row after the owner reassignment).
- status=`todo` (per snapshot at packet revision,
  `last_update=2026-05-10T16:48:45Z`); the parent has been reverted
  off `review` and the parent owner (`Codex`) has not yet re-claimed
  the task at this packet refresh — uncommitted edits to
  `apps/driver-app/app/trip.tsx` and
  `apps/driver-app/components/route-display.tsx` left over from the
  prior `Codex2`-owned `review` cycle remain in the working tree but
  are not attached to a live parent claim.
  - parent `next` field at revision: chairman reassignment
    description ("Chairman reassigned reviewer from Codex to
    Claude2: After moving owner to Codex, Codex can no longer be the
    reviewer. Claude2 is dispatch-capable …"); the diff-progress
    `next` snippet from the prior `Codex2` review cycle (the one
    quoted in older revisions of this packet describing the trip
    DRV-MAT primitive migration and `pnpm --filter
@drts/driver-app typecheck / lint / test` PASS) has been
    superseded and is no longer the live `next`. When the parent
    owner re-claims and produces a new diff, the build / storybook
    gates added in §4.E still apply and the reviewer should confirm
    them at `review_approved`.
  - For the live cycle position of the parent, read
    `ai-status.json -> DRV-UI-RD-004.status` directly; this packet
    does not snapshot transient parent status.
- depends_on: `DRV-UI-RD-001`
- artifacts:
  - `apps/driver-app/`
- acceptance:
  - `pnpm --filter @drts/driver-app typecheck / lint / test`
  - `Expo dev build on Android emulator + manual screenshot vs canvas`
  - `Backend / location heartbeat / provisioning flow 不可動`
- phase: `Wave 4`
- planning_ref: `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`

This packet treats `ai-status.json` as authoritative for owner /
reviewer. If the parent owner field shifts again before the parent
finalizes (the supervisor has already rebalanced this row multiple
times on `2026-05-10`, and the most recent reviewer hop happened at
`2026-05-10T16:48:45Z`), the live parent reviewer (`Claude2` at
packet refresh) should re-confirm ownership before approving and
the commit `LLM-Agent` trailer must reflect the live owner at
finalize time.

### Authoritative source documents

- L1 / L2 product truth — forwarded-vs-owned authority semantics that
  the trip screen reskin must preserve through every visual change:
  - `phase1_prd_detailed_v1.md` (forwarded vs owned dispatch authority,
    sync-failed degraded-state handling)
  - `phase1_service_contracts_v1.md`
    (`ForwardedDriverActionResponse.outcome`,
    `DriverTaskRecord.status`, etc. — the fields the trip screen reads)
- Planning ref — parent slice spec:
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`,
    section `## Wave 4 — Driver app visual reskin (DRV-UI-RD-NNN)`
    lines 484–516, with the parent's task line at 493–495 enumerating
    the seven states (`owned_active / forwarded_offered /
forwarded_pending / forwarded_confirmed / forwarded_lost /
forwarded_cancelled / sync_failed`).
  - Cross-cutting acceptance gates lines 583–600 (typecheck, lint,
    build, test, Storybook, reviewer review_notes_zh, commit hash).
  - Wave 4 dependency line 617: `TOK-UI-001 → DRV-UI-RD-001 (driver
wire-up)` is the chain DRV-UI-RD-004 sits on.
- Existing trip surface (read-only context for the sidecar; the parent
  owner edits these files, not this sidecar):
  - `apps/driver-app/app/trip.tsx` (the screen being reskinned;
    currently 2071 lines, in flight at packet write — uncommitted edits
    already migrate to `Tokens` from `@/components/ui` and add
    `getTripSurfacePalette` / `getTripStateEyebrow` /
    `getStatusChipVariant` / `getIdleBottomActionLabel` helpers per
    trip experience state).
  - `apps/driver-app/components/route-display.tsx` (route surface used
    by trip; also receiving uncommitted edits at packet write).
  - `apps/driver-app/lib/trip-workflow.ts` (declares the
    `TripExperienceState` union the screen branches on; line 10–17 is
    the seven-state literal vocabulary the parent diff must keep).
  - `apps/driver-app/lib/completion-proof.ts` (completion-proof gating
    used by `owned_active`; the parent diff must not regress proof
    requirements when restyling the bottom action bar).
  - `apps/driver-app/lib/driver-location-heartbeat.ts` (heartbeat
    subscription; the planning-ref guardrail forbids touching it).
  - `apps/driver-app/lib/api-client.ts` (forwarded
    accept/reject/replay endpoints; not in DRV-UI-RD-004 scope).
- Existing RN primitives layer (the surface DRV-UI-RD-001 added; the
  parent diff may consume but should not edit these unless gap-fixing a
  primitive needed for the seven states):
  - `apps/driver-app/components/ui-rn/` — `theme.ts` (driver theme
    bridge to `@drts/ui-tokens`), `AppText`, `AuthorityBadge`,
    `Badge`, `Button`, `ForwardedStatusBadge`, `Screen`, `Stack`,
    `Surface`, `index.ts`. `ForwardedStatusBadge` already speaks the
    `STATUS_VOCABULARY` from `@drts/ui-tokens` (`packages/ui-tokens/
src/status.ts`).
  - `apps/driver-app/components/ui/` — pre-existing DRV-MAT primitives
    (`AppScreen`, `BottomActionBar`, `EmptyState`, `ErrorBanner`,
    `FormField`, `IconButton`, `InfoTile`, `PageHeader`, `StatusChip`,
    `TaskStateChip`, etc.) plus `tokens.ts` exporting `Tokens`. These
    remain in the trip screen's import surface at packet write; the
    parent diff is iterating against them.
- Token bundle the reskin depends on (read-only context):
  - `packages/ui-tokens/src/index.ts` (re-export surface)
  - `packages/ui-tokens/src/colors.ts` (authority + accent + status
    palettes — `OWNED`, `FORWARDED`, `STATUS_TONES`)
  - `packages/ui-tokens/src/density.ts` (numeric scale)
  - `packages/ui-tokens/src/status.ts` (`STATUS_VOCABULARY`,
    `STATUS_TONE_BY_VALUE`, `STATUS_DISPLAY_STRINGS`,
    `isForwardedStatus`, `DISPLAY_STRINGS`)

---

## 3. Dependency Map

### Formal upstream dependencies

The parent's `depends_on` set is `DRV-UI-RD-001`. It is `done` in
`ai-status.json` at packet write.

| Dep ID          | Title                                                                  | Owner | Reviewer | Status (truth)            | What this slice provides to DRV-UI-RD-004                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------- | ----- | -------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-001` | Wire `@drts/ui-tokens` into driver-app; build RN-side primitives layer | Codex | Codex2   | `done` (commit `5db92c8`) | Lands the cross-stack `@drts/ui-tokens` integration into driver-app and the new `apps/driver-app/components/ui-rn/` primitives (`Screen`, `Stack`, `Surface`, `Button`, `Badge`, `AuthorityBadge`, `ForwardedStatusBadge`, `AppText`, `theme.ts`). DRV-UI-RD-004 must drive its seven-state visual alignment from these primitives + the existing `apps/driver-app/components/ui/` (DRV-MAT) primitives, not by hand-rolling new color literals. Provides `theme.ts`'s mapping from `STATUS_TONE_BY_VALUE` so the trip screen never re-derives forwarded status tones. |

Dependency assertion:

- The parent's seven-state reskin is a **composition** layer on top of
  the existing driver theme bridge (`apps/driver-app/components/ui-rn/
theme.ts`), the `STATUS_VOCABULARY` / `STATUS_TONE_BY_VALUE` tables in
  `@drts/ui-tokens` (`packages/ui-tokens/src/status.ts`), and the
  pre-existing `apps/driver-app/components/ui/` primitives the trip
  screen currently imports. No upstream slice needs to reopen for parent
  acceptance given the current snapshot.
- If `DRV-UI-RD-001` later reopens (theme bridge token surface changes,
  primitive prop signatures change, `ForwardedStatusBadge` API drifts),
  the trip reskin and the parent's typecheck must be re-validated before
  the parent can finalize. `pnpm --filter @drts/driver-app typecheck`
  will pick up most prop-shape drifts; a semantically silent regression
  (e.g., a token surface keeps the same shape but flips light/dark
  values) would still need a manual sidecar-or-review check.
- If the upstream `@drts/ui-tokens` `STATUS_VOCABULARY` reopens (new
  forwarded statuses, status tone re-mapping), the trip screen's branch
  list must be re-audited against the new surface, but the planning-ref
  Wave 4 guardrail keeps that out of scope for DRV-UI-RD-004 itself.

### Non-formal but spec-relevant upstream context

These tasks are referenced by the surrounding waves but are **not** in
the parent's formal `depends_on`. They are listed here so the reviewer
understands what the "existing baseline" the parent must preserve
actually is:

| Spec-relevant slice | Status (truth)            | Why it matters to DRV-UI-RD-004                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOK-UI-001`        | `done`                    | Lands the cross-stack `@drts/ui-tokens` package whose `colors.ts`, `density.ts`, and `status.ts` provide the authority / accent / status / density / display-string surfaces driver-app reads. DRV-UI-RD-004's seven-state palette resolves through these tables transitively via DRV-UI-RD-001's `theme.ts`.                                                                                                           |
| `DRV-MAT-004`       | `done`                    | Established the unified trip workflow command center (`apps/driver-app/components/ui/` DRV-MAT primitives — `AppScreen`, `PageHeader`, `BottomActionBar`, `StatusChip`, `InfoTile`, `EmptyState`, `ErrorBanner`, `FormField`, `IconButton`). DRV-UI-RD-004 reuses these, not a new RN primitive set, for the seven-state shell.                                                                                         |
| `DRV-MP-005`        | `done` (commit `1705dd2`) | Redesigned trip authority boundaries — `applyForwardedActionExperienceState`, `getForwardedActionCardCopy`, `describeForwardedActionOutcome`, `getTripStatusPresentation`, `getTripLockBody`, `getTripAuthorityDescription`, `getTripCapabilityItems`. DRV-UI-RD-004 must keep all branches of these functions working — visual changes only — so forwarded vs. owned authority copy stays correct under the new paint. |
| `EMC-W1-002`        | `done`                    | Driver onboarding degraded-state hardening. The `sync_failed` rendering DRV-UI-RD-004 reskins must continue to surface the degraded-state handoff (派車台處理) the same way EMC-W1-002 wired up; reviewer should confirm the new paint does not collapse the degraded message into the success/warning palette.                                                                                                         |

These are informational anchors, not parent-acceptance gates.

### Formal downstream dependents

`DRV-UI-RD-009` is the only task in machine truth that formally lists
`DRV-UI-RD-004` in its `depends_on` set at packet refresh
(`ai-status.json -> DRV-UI-RD-009.depends_on` =
`[DRV-UI-RD-001, DRV-UI-RD-002, DRV-UI-RD-003, DRV-UI-RD-004,
DRV-UI-RD-005, DRV-UI-RD-006, DRV-UI-RD-007, DRV-UI-RD-008]`).
Beyond that formal edge, the planning ref places these consumers
immediately adjacent to DRV-UI-RD-004 within Wave 4 dependency intent:

| Downstream consumer | Edge type                        | Why it depends on DRV-UI-RD-004                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-009`     | **formal** (`depends_on`)        | Wave 4 driver closeout packet (assigned to `Claude` / `Copilot`, currently `backlog`). Listed in `ai-status.json -> DRV-UI-RD-009.depends_on`. Cannot finalize until DRV-UI-RD-004 reaches `done`; finalize blocks the entire Wave 4 driver closeout.                                                                                                                                                                |
| `DRV-UI-RD-002`     | informal (planning-ref ordering) | Reskin Workspace cockpit (`app/index.tsx` / `app/onboarding.tsx`). Workspace links into Trip; if DRV-UI-RD-004 shifts the per-state shell vocabulary (eyebrow copy, status chip variants, surface palette helpers), Workspace cockpit's "next-task preview" cards should match the new vocabulary in DRV-UI-RD-002. Decoupled enough to land independently, but visual drift between the two slices is a known risk. |
| `DRV-UI-RD-003`     | informal (planning-ref ordering) | Reskin Inbox (`app/jobs.tsx`). The inbox row visual for forwarded vs owned, and for `accept_pending` / `confirmed` / `sync_failed`, should align with the trip screen's seven-state palette.                                                                                                                                                                                                                         |

Blast-radius note for the parent reviewer (`Claude2` at packet refresh):

- If the parent diff regresses `forwarded_sync_failed` rendering — for
  example, by collapsing it into the generic warning palette, dropping
  the lock message body (`getTripLockBody`), or removing the danger-tone
  surface (`getTripSurfacePalette`'s `sync_failed` branch) — the
  planning-ref guardrail "既有 forwarded sync_failed 邏輯不可降級"
  (line 515) is violated and the parent must reopen.
- If the parent diff edits `apps/driver-app/lib/trip-workflow.ts`,
  `apps/driver-app/lib/api-client.ts`, or
  `apps/driver-app/lib/driver-location-heartbeat.ts`, that is a backend
  / heartbeat / provisioning behavior change and falls under the Wave 4
  guardrail "禁止改變 backend 行為、location heartbeat、provisioning
  flow" (line 513). The parent diff must remain visual-only.
- If the parent diff hard-codes new color literals inside `trip.tsx`
  rather than reaching them through `Tokens.colors.*` (from
  `apps/driver-app/components/ui/tokens.ts`) or the
  `STATUS_TONE_BY_VALUE` / `SURFACE_ACCENTS` tables in
  `@drts/ui-tokens`, the cross-stack token discipline DRV-UI-RD-001
  established is violated. Reviewer should grep the parent diff for raw
  hex literals (`#[0-9a-fA-F]{3,6}`) and challenge any that are not
  passthroughs of existing tokens.
- If the parent diff renames or removes the `TripExperienceState`
  literals (`owned_active`, `forwarded_offered`, `forwarded_pending`,
  `forwarded_confirmed`, `forwarded_lost`, `forwarded_cancelled`,
  `sync_failed`) — even cosmetically — the contract-bound consumers in
  `apps/driver-app/lib/trip-workflow.ts` and
  `applyForwardedActionExperienceState` will type-error or, worse,
  fall through. The seven-state union must remain identical.
- If the parent diff removes the completion-proof gating
  (`shouldShowTripCompletionProof`,
  `shouldDisableCompleteTripAction`,
  `getCompletionSubmitBlocker`) from the `owned_active` branch, the
  trip screen will allow completion submits without proof — a
  product-semantics regression, not a visual change.
- If the parent diff drops the `sync_failed`-only `RouteLockedBadge` or
  the `getTripLockBody` body copy when restyling the screen header /
  hero region, drivers lose the visual signal that a forwarded order is
  in degraded sync state. Reviewer should confirm the restyled hero
  preserves the lock surface in `forwarded_pending`,
  `forwarded_lost`, `forwarded_cancelled`, and `sync_failed`.

### Ordering guidance vs. formal blockers

The planning ref places `DRV-UI-RD-004` inside Wave 4 between
DRV-UI-RD-003 and DRV-UI-RD-005 (lines 491–497 of the planning ref). The
only formal blocker is the dependency recorded in
`ai-status.json -> DRV-UI-RD-004.depends_on`. This sidecar does not
introduce extra prerequisites beyond machine truth.

---

## 4. Acceptance Checklist

Each item below is the parent acceptance gate rephrased as a concrete,
citation-anchored check the parent owner (`Codex`) self-verifies
before handing off, and the parent reviewer (`Claude2`) audits at
review time. At packet revision the parent task is `todo` in machine
truth — the parent owner has not yet re-claimed the task in this
cycle, so each gate below is forward-looking and applies once the
parent moves to `in_progress` and produces a diff; for the live cycle
position read `ai-status.json -> DRV-UI-RD-004.status` directly (see
§2). Each item below is still phrased as a property the parent diff
must satisfy rather than a property already observed, because this
packet is support-only and intentionally does not pre-approve the
diff.

Legend: `[REQUIRED]` = explicit gate from
`ai-status.json -> DRV-UI-RD-004.acceptance` or from the planning-ref
Wave 4 acceptance / guardrail block. `[DERIVED]` = unwritten but implied
by the planning ref or by the L0 / L2 collaboration rules; the parent
reviewer may treat these as informational.

### A. All seven `TripExperienceState` values render under the new paint `[REQUIRED]`

`ai-status.json -> DRV-UI-RD-004.summary_zh` enumerates the seven
states. The parent diff must satisfy:

- [ ] `owned_active` — the canonical local-dispatch path. The restyled
      screen must keep the existing pre-trip / on-trip / completion
      progression: pending acceptance → on_trip → completion-proof
      submit. `getTripStatusPresentation` line 322–337 of `trip.tsx`
      drives the eyebrow + status chip + tracking detail; the parent
      diff may replace those visuals but must continue to pass through
      `formatDriverTaskStatusLabel(task.status)` so localized status
      copy still matches `apps/driver-app/lib/operational-labels.ts`.
- [ ] `forwarded_offered` — accept / reject CTA pair must remain
      visible and dispatch to `acceptForwardedDriverOffer` /
      `rejectForwardedDriverOffer` (`apps/driver-app/lib/api-client.ts`
      via `trip.tsx` line 49–55). The parent diff must not turn this
      into a single-button surface; the planning-ref capability list
      "可送出：接受平台訂單。可送出：婉拒平台訂單" (`getTripCapabilityItems`
      line 415–420 of `trip.tsx`) must continue to round-trip.
- [ ] `forwarded_pending` — the lock body
      (`getTripLockBody` line 347–352, icon `time-outline`, title
      "正在等待平台確認…") must remain visible. `getTripCapabilityItems`
      line 421–422 says "目前沒有可用本地操作。" — reviewer should
      confirm no primary action button is rendered.
- [ ] `forwarded_confirmed` — eyebrow "來源平台已確認", status chip
      `success` tone, no local lifecycle CTAs (DRTS does not own this
      task post-confirm). `getTripStatusPresentation` line 298–303 and
      `getTripAuthorityDescription` line 389–390 must still resolve
      correctly under the new paint.
- [ ] `forwarded_lost` — `getTripLockBody` line 353–358 with icon
      `close-circle-outline`, title "未取得此訂單" must remain. Status
      chip neutral tone; `tripSurfacePalette` falls through to the
      forwarded surface (not danger).
- [ ] `forwarded_cancelled` — `getTripLockBody` line 359–364, icon
      `ban-outline`, title "平台已取消". Same neutral surface treatment.
- [ ] `sync_failed` — `getTripSurfacePalette` line 487–493 returns the
      danger surface (`Tokens.colors.surfaceDanger`,
      `Tokens.colors.danger`); the lock body line 365–370 with icon
      `alert-circle-outline`, title "同步異常" must remain. Per
      `summary_zh` "既有 forwarded sync_failed 邏輯不可降級" — this is a
      hard guardrail, not a stylistic preference.

### B. Forwarded sync_failed handling is not downgraded `[REQUIRED]`

Planning ref line 515 (Wave 4 guardrail):

> 既有 forwarded sync_failed 處理邏輯比 mock 更強，不可降級

The parent diff must satisfy:

- [ ] `applyForwardedActionExperienceState`
      (`apps/driver-app/app/trip.tsx:200`) keeps mapping
      `ForwardedDriverActionResponse.outcome === "sync_failed"` to
      `TripExperienceState === "sync_failed"`. The branching must not
      collapse into a fallback `forwarded_cancelled` or `unknown`.
- [ ] `getTripStatusPresentation` `sync_failed` branch (line 316–321)
      keeps tone `danger` and detail "需派車台處理，請等待指示。"
- [ ] `getTripLockBody` `sync_failed` branch (line 365–370) keeps the
      explicit lock UI; the new paint must not let the screen render
      lifecycle CTAs in this state.
- [ ] `getTripCapabilityItems` `sync_failed` branch (line 431–435) keeps
      surfacing the operator-facing message that 派車台 will resolve
      synchronization, not the driver.
- [ ] `getTripSurfacePalette` `sync_failed` branch (line 487–493) keeps
      using the danger surface tokens, not the forwarded surface
      tokens.
- [ ] No path inside `trip.tsx` short-circuits `sync_failed` into the
      generic owned-or-forwarded surface based on
      `task?.sourcePlatform` alone — the explicit `sync_failed` check
      must remain the first branch in the surface / status / lock
      lookups.

### C. Completion-proof + tracking gates remain wired `[REQUIRED]`

The `owned_active` path goes through completion-proof gates that the
visual reskin must pass through, not silently drop. The parent diff
must satisfy:

- [ ] `shouldShowTripCompletionProof(task, experienceState)`
      (`apps/driver-app/lib/trip-workflow.ts`) still gates the proof
      surface. The reskin may replace the surrounding chrome but must
      not unconditionally render the proof form for forwarded states.
- [ ] `getCompletionSubmitBlocker` reasons (line 39 of
      `completion-proof.ts`: `proof_requirements_unavailable` /
      `expense_amount_invalid` / `tracking_unavailable` / proof-photo
      shortage / signoff missing) continue to surface as user-readable
      copy in the bottom action region. The parent diff at packet write
      already routes these through a `bottomNotice` constant
      (`trip.tsx` line 678–693 in the WIP); reviewer should confirm
      every blocker variant still renders a banner the driver can read.
- [ ] `shouldDisableCompleteTripAction` continues to drive the primary
      action's `disabled` prop. A reskin that makes the button look
      enabled while the underlying handler is disabled is a regression.
- [ ] `LocationTrackingState` gating (`requesting_permission` /
      `active` / `permission_denied` / `error` — line 173–178 of
      `trip.tsx`) keeps surfacing through the on-trip presentation. The
      planning-ref Wave 4 guardrail explicitly bars touching the
      location heartbeat module itself, so reviewer should confirm only
      the visual chrome around the tracking state changed.

### D. Cross-stack token discipline `[REQUIRED]`

DRV-UI-RD-001 wired `@drts/ui-tokens` into the driver-app via
`apps/driver-app/components/ui-rn/theme.ts`. The parent diff must
satisfy:

- [ ] No raw color literal that doesn't trace back through
      `Tokens.colors.*` (`apps/driver-app/components/ui/tokens.ts`) or
      through the `STATUS_TONE_BY_VALUE` / `SURFACE_ACCENTS` /
      authority palette in `@drts/ui-tokens`
      (`packages/ui-tokens/src/colors.ts`,
      `packages/ui-tokens/src/status.ts`). Reviewer can grep the diff
      for `#[0-9a-fA-F]{3,6}` outside `tokens.ts`; new literals require
      a justification note in the handoff.
- [ ] `STATUS_VOCABULARY` consumers (existing
      `ForwardedStatusBadge` at
      `apps/driver-app/components/ui-rn/ForwardedStatusBadge.tsx`,
      `theme.ts` `STATUS_TONE_BY_VALUE` import) remain the source of
      truth for forwarded-task status display strings. The reskin must
      not duplicate the vocabulary inside `trip.tsx`.
- [ ] If the reskin needs additional token-level helpers (e.g., a new
      `surfaceForwardedStrong` variant), the helper is added inside
      `apps/driver-app/components/ui/tokens.ts` next to the existing
      surface palette (line 41–93 at packet write), not inlined into
      `trip.tsx`. Reviewer should reject token additions that escape
      into unrelated apps without going through `@drts/ui-tokens` and
      `TOK-UI-001` follow-ups.

### E. Recorded acceptance commands `[REQUIRED]`

This section translates two layered gate sets that both bind
`DRV-UI-RD-004`:

1. **Parent task acceptance** —
   `ai-status.json -> DRV-UI-RD-004 -> acceptance`: typecheck, lint,
   test, and Expo dev build on Android emulator + manual screenshot vs
   canvas. Authoritative for this slice's machine-truth row.
2. **Wave 4 cross-cutting acceptance gates** —
   `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` lines
   583–593, applied to **every** redesign task: typecheck, lint,
   build, test (`--passWithNoTests` allowed), Storybook story render
   next to the design canvas iframe, reviewer `review_notes_zh` visual
   pass/diff list, and commit hash + reviewer record per closeout
   format.

Mapping the six boxes below to the two gate sets:

- typecheck, lint, test — present in both the parent `acceptance`
  array and cross-cutting gates #1 / #2 / #4.
- build — present in cross-cutting gate #3 only; not duplicated into
  the parent's `acceptance` array, but still `[REQUIRED]` because the
  planning ref binds it to every Wave 4 redesign task.
- Storybook story render — present in cross-cutting gate #5 only;
  same reason still `[REQUIRED]`, with a driver-app-specific caveat
  (no `@drts/ui-web` import is allowed in driver-app).
- Expo dev build on Android emulator + manual screenshot vs canvas —
  present in the parent `acceptance` array; absorbs the reviewer
  `review_notes_zh` visual pass record from cross-cutting gate #6.

Closeout commit-evidence per cross-cutting gate #7 is covered
separately in §4.H so this section does not duplicate it.

- [ ] `pnpm --filter @drts/driver-app typecheck`
  - Resolves to `tsc --noEmit` per
    `apps/driver-app/package.json` `typecheck` script.
  - Parent owner (`Codex`) must run on the final pre-commit state and
    record PASS in the parent's `next` / handoff note before handoff.
  - Parent reviewer (`Claude2`) re-confirms PASS at `review_approved`.
  - The sidecar does **not** re-run this command.
- [ ] `pnpm --filter @drts/driver-app lint`
  - Resolves to `eslint . --max-warnings=0` per
    `apps/driver-app/package.json` `lint` script. Strict gate — even
    warnings must be zero.
- [ ] `pnpm --filter @drts/driver-app test`
  - Resolves to `vitest run --passWithNoTests` per
    `apps/driver-app/package.json` `test` script. The driver-app does
    not currently ship a `trip.tsx` unit test; if the parent owner adds
    one (recommended for the sync_failed regression guard), it must
    keep `vitest run` green. If no test is added, `--passWithNoTests`
    keeps the gate passing.
- [ ] `pnpm --filter @drts/driver-app build` `[cross-cutting gate #3]`
  - `apps/driver-app/package.json` defines two scripts that bind this
    gate together: `"build": "tsc --noEmit"` (line 8) **and**
    `"prebuild": "expo prebuild"` (line 17). Because `prebuild` is the
    npm-defined pre-hook for the `build` lifecycle, invoking
    `pnpm --filter @drts/driver-app build` runs `expo prebuild` first
    and only then runs `tsc --noEmit`. Reviewer verification at
    `2026-05-10T16:08:52Z` empirically observed the `prebuild` hook
    firing — `expo prebuild` regenerated native scaffolding under
    `apps/driver-app/ios/` (currently untracked at packet revision)
    before `tsc --noEmit` ran. This gate is therefore **not**
    output-identical to `pnpm --filter @drts/driver-app typecheck`:
    the typecheck portion is identical, but the side effect — native
    project regeneration — is real filesystem state that the
    cross-cutting gate produces and `typecheck` does not.
  - Side-effect surface to expect when the gate runs:
    - `apps/driver-app/ios/` — created by `expo prebuild` but **not
      tracked** in the repo at packet revision (`git ls-files
apps/driver-app/ios` returns nothing). The planning ref does
      not authorize landing iOS native scaffolding in DRV-UI-RD-004,
      so the parent commit must not pick it up.
    - `apps/driver-app/android/` — already **tracked** (37 files at
      packet revision; `apps/driver-app/android/.gitignore`,
      `apps/driver-app/android/app/build.gradle`, etc.). Re-running
      `expo prebuild` may rewrite tracked files in this directory; if
      it does, those rewrites are not a DRV-UI-RD-004 deliverable
      either and must not enter the parent commit.
    - Other Expo prebuild outputs (`apps/driver-app/.expo/` is already
      `.gitignore`-d via the root `.gitignore` `# mobile / expo`
      block); nothing additional is expected to leak past these two
      directories, but the parent owner should still verify with
      `git status apps/driver-app/` before committing.
  - Cleanup expectation before parent handoff / finalize:
    - parent owner (`Codex`) runs `git status apps/driver-app/ios
apps/driver-app/android` after the gate. The required state
      before the parent `done` commit is:
      (a) any newly created `apps/driver-app/ios/` is **not** added
      to the staged diff (either delete the directory or rely on
      a selective `git add` that excludes it), and
      (b) `git diff -- apps/driver-app/android/` is empty against
      `HEAD` so the regenerated native scaffold is identical to
      the committed baseline (or, if `expo prebuild` legitimately
      rewrites a file, the parent owner reverts that rewrite —
      DRV-UI-RD-004 is visual-only and must not move native
      scaffolds).
    - reviewer (`Claude2`) re-runs the gate during `review_approved`
      verification and applies the same cleanup check before
      authorizing the parent's commit / push. If the reviewer's
      re-run leaves residual `ios/` or modified `android/` files in
      the working tree, those must be reverted before the parent
      `done` transition; they are **not** sidecar-fixable artifacts.
  - Handoff-note expectation for the parent owner: the build-gate
    PASS line in `ai-status.json -> DRV-UI-RD-004.next` must record
    both halves explicitly — `build (expo prebuild + tsc --noEmit)
PASS, prebuild side-effects reverted` (or equivalent wording).
    Recording only "build PASS" without acknowledging the prebuild
    hook is a reopen trigger because the reviewer cannot tell from
    the note alone whether the side-effect cleanup was performed.
  - Future-script note: if `apps/driver-app/package.json` later
    swaps `build` to a real bundler invocation (e.g., `expo export`,
    an EAS preview build) or removes the `prebuild` hook, this gate
    inherits the new semantics automatically — the cross-cutting
    gate binds the script name, not the current implementation. A
    reskin slice should not proactively edit the `build` /
    `prebuild` script definitions; that is an infra-lane decision
    (Wave 4 driver closeout / packaging slices), not a DRV-UI-RD-004
    decision.
- [ ] Storybook story render (cross-cutting gate #5)
  - Planning ref line 591: "對應 Storybook story 可啟動，並在 design
    canvas iframe 旁 render". The Storybook root for this monorepo
    lives at `packages/ui-web/.storybook/` (`main.ts` glob:
    `../src/**/*.stories.@(ts|tsx)`); at packet refresh it ships
    `packages/ui-web/src/storybook-smoke.stories.tsx` plus the stories
    landed by the `SBK-UI-001` and `SBK-UI-002` slices. **Caveat for
    DRV-UI-RD-004 specifically:** driver-app is Expo / React Native
    and is forbidden from importing `@drts/ui-web` (planning ref Wave
    4 preamble lines 486–487), so the trip screen and the
    `apps/driver-app/components/ui-rn/` primitives are **not** part of
    the `packages/ui-web` Storybook surface and there is no per-app
    Storybook under `apps/driver-app/`. Two acceptable evidence shapes
    for this gate:
    - **a)** parent owner / parent reviewer confirms that any
      `@drts/ui-tokens`-backed primitive the trip reskin newly
      consumes is already covered by an existing
      `packages/ui-web/src/**/*.stories.*` story (e.g., authority
      badges, status tone surfaces from
      `STATUS_TONE_BY_VALUE` rendered through ui-web wrappers) and
      that story still launches via `pnpm --filter @drts/ui-web
storybook` at the slice's pre-commit state — i.e., the gate is
      satisfied transitively through the ui-tokens layer the trip
      screen reads from.
    - **b)** parent owner declares the gate as **N/A for driver-app**
      in the handoff note, with citation to planning ref lines
      486–487 (no `@drts/ui-web` import allowed) and a note that the
      Wave 4 driver closeout (`DRV-UI-RD-009`) is the appropriate
      slice to land driver-side primitive stories — not this trip
      reskin. Either evidence shape must be explicit in the handoff;
      silent omission is not acceptable. Reviewer captures the
      decision in `ai-status.json -> DRV-UI-RD-004.review_notes_zh`.
- [ ] Expo dev build run on Android emulator (planning ref line 507):
      manual screenshot vs design canvas, with at least the seven
      states covered. The Wave 4 cross-cutting acceptance gates
      (planning ref lines 583–593, gate #6) require the reviewer to
      record "視覺通過或差異列表" in `review_notes_zh`. This is not a
      machine-checkable gate; the reviewer captures it in
      `ai-status.json -> DRV-UI-RD-004.review_notes_zh` after manually
      stepping through every `TripExperienceState`.
  - DRV-UI-RD-001's commit (`5db92c8`) explicitly noted "Android
    emulator / manual screenshot not run in this environment (no
    adb/emulator SDK)"; the parent owner has already echoed the same
    constraint in the live `ai-status.json -> DRV-UI-RD-004.next`
    field at packet refresh ("此環境缺 adb / emulator, Android
    emulator + manual screenshot vs canvas 尚未執行"). If the
    constraint stands at finalize, the handoff note must declare so
    explicitly and surface a fallback-evidence pathway (e.g., Expo
    web preview, static screenshot from a device farm) the reviewer
    can audit against — silent omission of the manual-screenshot
    record is a reopen trigger.

### F. Translation parity `[DERIVED]`

DRV-UI-RD-004 introduces visual chrome around existing copy; the
existing copy is already zhTW per
`apps/driver-app/lib/operational-labels.ts` and the inline strings in
`trip.tsx` (e.g., line 230–243 outcome titles, line 252–272 forwarded
action card copy). The parent diff must satisfy:

- [ ] If the parent diff exposes any new consumer-facing string (for
      example, an empty-state caption or a tooltip on a new info tile),
      the new copy lands in zhTW first. The driver-app does not ship a
      runtime locale switcher today, so en parity is **not** required
      unless the diff also wires up `STATUS_DISPLAY_STRINGS` (which
      already carries `en` + `zhTW`) for a new label. If no new copy is
      added — the most likely outcome — this gate is vacuously
      satisfied.

### G. Scope containment `[DERIVED]`

The parent's `artifacts` block is `apps/driver-app/`. That is broad;
the planning ref scopes the slice tightly to `app/trip.tsx`. The parent
diff must satisfy:

- [ ] `git diff --stat HEAD` against the parent's pre-commit state
      shows changes primarily inside `apps/driver-app/app/trip.tsx`,
      plus any of these support files needed to keep typecheck and the
      manual screenshot gate sane:
      `apps/driver-app/components/route-display.tsx` (already touched
      in WIP at packet write — the route surface is part of the Trip
      screen),
      `apps/driver-app/components/ui/tokens.ts` (only if a new
      semantic token is needed; preferred over inline literals),
      `apps/driver-app/components/ui/<primitive>.tsx` (only if a
      DRV-MAT primitive needs a new variant prop to support a state's
      paint — should be rare). If additional ancillary files appear in
      the diff, the handoff note must explain why.
- [ ] No edits leak into `phase1_*` truth, the contracts bundle
      (`packages/contracts/**`), `@drts/ui-tokens` source
      (`packages/ui-tokens/**` — token additions belong to TOK-UI-001
      follow-ups), other apps
      (`apps/{platform-admin-web,ops-console-web,tenant-console-web,
    partner-booking-web,api}/**`), or driver lib modules forbidden
      by the Wave 4 guardrail (`apps/driver-app/lib/api-client.ts`,
      `apps/driver-app/lib/driver-location-heartbeat.ts`,
      `apps/driver-app/lib/trip-workflow.ts`'s
      `TripExperienceState` definition — visual-only tweaks to the
      utility functions inside the same module are fine, but the
      union itself must not change).

### H. Commit evidence at parent finalize `[REQUIRED]`

Per `AI_COLLABORATION_GUIDE.md` §5 (commit evidence rule), parent
`DRV-UI-RD-004` is a canonical implementation slice (not a sidecar),
so `done` requires:

- [ ] Local task-scoped commit whose subject includes `DRV-UI-RD-004`.
      Sibling slices in this wave used subjects of the form
      `feat(DRV-UI-RD-001): wire ui-tokens into driver-app RN
    primitives` (commit `5db92c8`). Reviewer should not treat the
      exact wording as required, only the presence of `DRV-UI-RD-004`.
- [ ] Commit body trailers:
  - `LLM-Agent: Codex`
  - `Task-ID: DRV-UI-RD-004`
  - `Reviewer: Claude2`
- [ ] A normal non-force push, with `PUSH_REMOTE` / `PUSH_BRANCH`
      recorded in the `done` transition. Sibling DRV-UI commits land on
      `feat/claude2-ui-redesign-foundation` per
      `ai-status.json -> DRV-UI-RD-001` (commit `5db92c8` on the
      current branch); the parent owner should pick a branch
      consistent with the live wave's branching pattern, not assume
      that branch name.
- [ ] `done` transition runs through
      `scripts/ai-status.sh done DRV-UI-RD-004` with `COMMIT_HASH` /
      `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` set —
      `NO_COMMIT_REQUIRED=1` is **not** acceptable for the parent
      (only for sidecars like this one).
- [ ] If the parent owner field shifts before finalize, the commit
      `LLM-Agent` trailer must reflect the live owner at finalize time,
      not the owner named in this packet at packet-write time.

---

## 5. Reviewer Evidence Anchors

The sidecar reviewer (`Claude2`) and, later, the parent reviewer
(`Claude2` — same lane after the parent-reviewer reassignment, now
shifted from the prior same-lane `Codex` configuration) can use
these anchors to validate the eventual parent handoff without
treating this packet as canonical truth:

- `ai-status.json -> DRV-UI-RD-004`
- `ai-status.json -> DRV-UI-RD-004-SIDECAR-ACCEPTANCE`
- `ai-activity-log.jsonl` (filter on either id)
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`, section
  `## Wave 4 — Driver app visual reskin (DRV-UI-RD-NNN)`
  (lines 484–516 at packet write), with cross-cutting gates at
  583–600
- `apps/driver-app/app/trip.tsx` (the screen being reskinned;
  authoritative for state branching at line 200–540 and below)
- `apps/driver-app/components/route-display.tsx` (route surface; also
  touched in WIP)
- `apps/driver-app/lib/trip-workflow.ts` (`TripExperienceState` union
  at line 10–17 — the contract the seven branches must keep)
- `apps/driver-app/lib/completion-proof.ts` (proof-gating reasons)
- `apps/driver-app/lib/driver-location-heartbeat.ts` (out of scope —
  reviewer audits that no edits leak in)
- `apps/driver-app/lib/api-client.ts` (forwarded action endpoints —
  out of scope; reviewer audits that no behavior changes)
- `apps/driver-app/components/ui/` (DRV-MAT primitives the trip screen
  imports — `AppScreen`, `BottomActionBar`, `EmptyState`,
  `ErrorBanner`, `FormField`, `IconButton`, `InfoTile`, `PageHeader`,
  `StatusChip`, `Tokens`)
- `apps/driver-app/components/ui-rn/` (DRV-UI-RD-001 primitives layer
  - `theme.ts` cross-stack token bridge — reviewer should be able to
    read `theme.ts` and confirm the parent diff did not bypass the
    bridge)
- `packages/ui-tokens/src/colors.ts`, `packages/ui-tokens/src/status.ts`,
  `packages/ui-tokens/src/density.ts` (upstream token + status bundle)

Reviewer-focused implementation checkpoints, derived from the parent
planning ref:

- The seven `TripExperienceState` branches must each render
  distinguishable surface + status visuals — a reviewer flipping
  between forwarded_offered, forwarded_pending, forwarded_confirmed,
  forwarded_lost, forwarded_cancelled, sync_failed, and owned_active
  should never see two states paint identically (sync_failed especially
  must read as danger, not just generic neutral / forwarded).
- `RouteLockedBadge` (`trip.tsx` line 105–115 in the WIP; previously
  line 105 in HEAD) is the visual cue that the route is locked from
  driver edits. The reskin is currently re-themed to use
  `Tokens.colors.warning`; reviewer should confirm the badge still
  appears on every state where `RouteDisplay` would otherwise suggest
  driver-editable navigation.
- The bottom action bar must keep its "primary CTA absent / disabled /
  enabled" tri-state legible: `getIdleBottomActionLabel` (line 538–550)
  is the fallback copy when no primary action is available; the
  reviewer should confirm idle copy reads correctly for each non-owned
  state.
- The location heartbeat behavior (`syncDriverLocationHeartbeat`,
  `subscribeToDriverLocationUpdates`, `stopDriverLocationHeartbeat`)
  is out of scope — reviewer should audit the diff for any edit to
  `apps/driver-app/lib/driver-location-heartbeat.ts` (planning-ref
  guardrail line 513).

---

## 6. Sidecar Acceptance Checklist

Mirrors `ai-status.json -> DRV-UI-RD-004-SIDECAR-ACCEPTANCE.acceptance`
(stable across cycles) plus two derived items the sidecar owner self-
verifies before each handoff. The live cycle position
(`in_progress` / `review` / `review_approved` / `done`) is in
`ai-status.json -> DRV-UI-RD-004-SIDECAR-ACCEPTANCE.status`; cycle
history is in `ai-activity-log.jsonl` filtered on this id. This packet
does not snapshot the live status (see §2).

The first four boxes describe properties of the packet content, which
hold across cycles once they hold. The fifth box describes the
handoff transition; it resets to `[ ]` at the start of each cycle —
i.e., on the initial owner claim and again every time the reviewer
runs `scripts/ai-status.sh reopen` to send the sidecar back for
revision. It lands as `[x]` once the sidecar reaches
`review_approved` and the owner records `done`.

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Keep the packet scoped to acceptance framing, dependency mapping,
      and reviewer support.
- [x] Keep the dependency map aligned with current machine truth.
- [ ] Hand off the packet to the assigned reviewer for the current
      cycle (executed via `scripts/ai-status.sh handoff
    DRV-UI-RD-004-SIDECAR-ACCEPTANCE Claude2 …` after the packet
      revisions for this cycle land in the working tree). At reviewer
      `approve`, the sidecar moves to `review_approved`; at owner
      `done`, the sidecar uses `NO_COMMIT_REQUIRED=1` per L0 §5
      because `task_class=sidecar` and `mutates_canonical=false`.

Cycle-level note: the supervisor / reviewer treats this checkbox as
the "is the current cycle finished" indicator, not as a one-shot
permanent state — when it is `[ ]` while the live status is
`in_progress`, the owner is mid-revision; when it is `[ ]` while the
live status is `review`, the reviewer is mid-audit; when it is `[x]`
the sidecar is at `review_approved` or `done`. Authoritative cycle
position is always the machine-truth status, not this checkbox.

---

## 7. Reviewer Handoff Commands

Approve (sidecar only — does not approve or close parent
`DRV-UI-RD-004`, which still needs to go through its own todo →
in_progress → review → review_approved → done lifecycle under owner
`Codex` and reviewer `Claude2`):

```bash
AI_NAME=Claude2 ./scripts/ai-status.sh approve DRV-UI-RD-004-SIDECAR-ACCEPTANCE \
  "Acceptance packet aligned with current machine truth after the chair-reassignment chain (final hop applied 2026-05-10T17:48:43Z per ai-activity-log.jsonl chair_reassignment_applied): parent DRV-UI-RD-004 owner=Codex reviewer=Claude2 status=todo (last_update 2026-05-10T16:48:45Z, parent reverted off review and not yet re-claimed by the new owner); sidecar owner=Claude reviewer=Claude2; depends_on (DRV-UI-RD-001 done at commit 5db92c8) correct; DRV-UI-RD-009 is the formal downstream depends_on consumer; section 4 intro and §4.E owner/reviewer references now read Codex/Claude2; section 4.E build-gate item still correctly describes `pnpm --filter @drts/driver-app build` semantics — apps/driver-app/package.json defines `build=tsc --noEmit` AND `prebuild=expo prebuild`, so the gate runs the npm prebuild lifecycle first and regenerates native scaffolds (creates untracked apps/driver-app/ios/, may rewrite tracked apps/driver-app/android/) before tsc runs; the gate is NOT output-identical to typecheck; cleanup expectation captured (parent owner Codex reverts prebuild side-effects before commit, reviewer Claude2 re-verifies on review_approved re-run, handoff note records `build (expo prebuild + tsc --noEmit) PASS, prebuild side-effects reverted` rather than just `build PASS`); section 4.H commit trailers updated to LLM-Agent=Codex / Reviewer=Claude2; future-script note retained so the gate inherits new semantics if the package.json `build`/`prebuild` scripts change; Storybook story render gate, typecheck/lint/test gates, and Expo Android emulator screenshot gate unchanged from prior revision; section 6 still reframes the handoff item as resetting to [ ] each reopen cycle and the live cycle position is anchored on ai-status.json status; sync_failed-not-downgraded guardrail still anchored on planning-ref line 515; cross-stack token discipline still anchored on @drts/ui-tokens via apps/driver-app/components/ui-rn/theme.ts and apps/driver-app/components/ui/tokens.ts; reviewer evidence anchors unchanged; no canonical-truth or apps/driver-app/* runtime files were edited."
```

Reopen if drift is found instead:

```bash
AI_NAME=Claude2 ./scripts/ai-status.sh reopen DRV-UI-RD-004-SIDECAR-ACCEPTANCE \
  "packet needs revision: [specify machine-truth drift vs ai-status.json -> DRV-UI-RD-004, dependency-map error, missing acceptance gate, sync_failed guardrail misstatement, Wave 4 guardrail boundary error, or support-scope violation]"
```

Note: `reopen` of this sidecar must be limited to sidecar-document
accuracy; it is not a mechanism for litigating parent design choices.
If the planning ref itself needs change, that is a `DRV-UI-RD-004`
parent-task or workbreakdown-revision decision, not a sidecar action.
If the parent task transitions while this sidecar is in `review` (e.g.,
parent moves from `in_progress` to `review` or `review_approved`), the
reviewer should treat that as expected — this packet is
forward-looking and intentionally does not snapshot transient parent
status (see §2).

---

## 8. Closeout Note

This sidecar is `task_class=sidecar` with `mutates_canonical=false`, so
per `AI_COLLABORATION_GUIDE.md` §5 commit evidence rule, owner closeout
(`Claude` → `done`) may use `NO_COMMIT_REQUIRED=1` after sidecar
approval. The parent task `DRV-UI-RD-004` is **not** a sidecar — it is
a canonical implementation slice that, when finalized, must go through
the full local-commit + push + done sequence with `COMMIT_HASH` /
`COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` recorded. Nothing in
this packet authorizes the parent owner to skip that sequence, nothing
in this packet authorizes any change to L1 / L2 truth, the planning
ref, the contracts bundle, the `@drts/ui-tokens` source, the location
heartbeat, the forwarded-action API client, or the
`TripExperienceState` union, and nothing in this packet pre-approves
the parent diff — the parent reviewer (`Claude2` at packet refresh)
remains the sole approver of `DRV-UI-RD-004`.
