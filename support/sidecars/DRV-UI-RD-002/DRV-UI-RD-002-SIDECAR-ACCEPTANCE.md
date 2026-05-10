# DRV-UI-RD-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DRV-UI-RD-002` — Reskin Workspace cockpit
**Parent Owner:** `Codex2` (per `ai-status.json -> DRV-UI-RD-002.owner`)
**Parent Reviewer:** `Codex` (per `ai-status.json -> DRV-UI-RD-002.reviewer`)
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, the planning ref, runtime behavior, the parent's
machine-truth fields, or any L1/L2 product surface. For the live
machine-truth status of this sidecar row, read
`ai-status.json -> DRV-UI-RD-002-SIDECAR-ACCEPTANCE.status` directly;
this packet does not snapshot it.

This packet is the forward-looking acceptance map for parent
`DRV-UI-RD-002`. At packet write the parent is `backlog` in machine
truth — the parent owner (`Codex2`) has not yet claimed the task and
no parent diff exists, so each acceptance gate below is phrased as a
property the parent diff must satisfy once the parent moves to
`in_progress`. The sidecar reviewer (`Codex2`) is the same lane as the
parent owner (`Codex2`); the sidecar review only audits packet
accuracy and does **not** approve the parent diff — only the parent
reviewer (`Codex`) may approve `DRV-UI-RD-002`. This packet does not
pre-approve any future parent diff.

---

## 1. Scope Boundary

In scope:

- Translate the parent task's `acceptance` field, the planning-ref
  Wave 4 task line for `DRV-UI-RD-002`, and the cross-cutting
  acceptance gates into a concrete, citation-anchored acceptance
  checklist for the Workspace cockpit reskin (the
  `app/index.tsx` route + `app/onboarding.tsx` screen, which together
  back the design canvas's `ScreenWorkspace` and `ScreenProvisioning`
  references).
- Pin the dependency map and confirm each upstream slice is `done` in
  machine truth.
- Record the formal downstream tasks that depend on `DRV-UI-RD-002` so
  reviewer attention during parent finalize can correctly weigh
  blast-radius risk (Wave 4 driver closeout packet, sibling reskins
  whose visual vocabulary should align).
- Preserve a reviewer-handoff command block the assigned sidecar
  reviewer (`Codex2`) can run after this packet is written.

Out of scope:

- editing L1 / L2 product truth (`phase1_*`, contracts bundle), the
  planning-ref workbreakdown doc, or the parent task's machine-truth
  fields (`ai-status.json -> DRV-UI-RD-002`)
- editing `apps/driver-app/app/index.tsx`,
  `apps/driver-app/app/onboarding.tsx`, or any other parent-write-
  scope file under `apps/driver-app/`
- pre-running the parent's acceptance commands, opening a
  parent-scoped commit, or altering parent ownership / reviewership
- predicting the specific shape of the parent diff before the parent
  owner finalizes it
- approving DRV-UI-RD-002 itself (only `Codex` may do that on the
  parent row, as the live parent reviewer)
- altering provisioning-flow contract semantics
  (`initializeDriverIdentity`, `registerDriverDevice`,
  `isDriverIdentityProvisioned`, `getDriverIdentityIssue`,
  `hasDriverDevOverride` in `apps/driver-app/lib/api-client.ts` /
  `apps/driver-app/lib/driver-identity-bootstrap.ts`) — the
  planning-ref Wave 4 guardrail explicitly forbids changing the
  provisioning flow, so these stay read-only context for this slice
- rewriting `apps/driver-app/lib/driver-location-heartbeat.ts` or
  `apps/driver-app/lib/api-client.ts` networking — the same Wave 4
  guardrail forbids backend / heartbeat / provisioning behavior
  changes

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> DRV-UI-RD-002-SIDECAR-ACCEPTANCE`

Persistent fields:

- owner=`Claude2`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`DRV-UI-RD-002`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on: `DRV-UI-RD-001` (mirrors the parent's dependency set)
- artifacts:
  `support/sidecars/DRV-UI-RD-002/DRV-UI-RD-002-SIDECAR-ACCEPTANCE.md`
  (this file)
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Live status (read directly from machine truth, not from this packet):

- The current value of
  `ai-status.json -> DRV-UI-RD-002-SIDECAR-ACCEPTANCE.status` is the
  authoritative present state of this sidecar. This packet
  intentionally does not snapshot the live status — any such snapshot
  becomes false the moment the sidecar transitions (e.g., between
  owner handoff and reviewer read, or between approve and done). For
  the lifecycle history of this sidecar, see `ai-activity-log.jsonl`
  filtered on `DRV-UI-RD-002-SIDECAR-ACCEPTANCE`.

### Parent — `ai-status.json -> DRV-UI-RD-002`

- id=`DRV-UI-RD-002`
- title=`Reskin Workspace cockpit`
- summary_zh=`app/index.tsx + app/onboarding.tsx 視覺對齊 ScreenWorkspace
  - ScreenProvisioning。`
- owner=`Codex2`, reviewer=`Codex` (assigned `2026-05-10T10:41:44Z`
  per `ai-activity-log.jsonl` `assign` events for this id)
- status=`backlog` (per snapshot at packet write,
  `last_update=2026-05-10T10:41:44Z`); the parent has not yet been
  claimed by `Codex2` and no parent diff exists — each gate in §4 is
  a forward-looking property the eventual parent diff must satisfy.
  - For the live cycle position of the parent, read
    `ai-status.json -> DRV-UI-RD-002.status` directly; this packet
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
reviewer. If the parent owner field shifts before the parent
finalizes, the live parent reviewer (`Codex` at packet write) should
re-confirm ownership before approving and the commit `LLM-Agent`
trailer must reflect the live owner at finalize time.

Same-lane note: at packet write the sidecar reviewer (`Codex2`) is
the same lane as the parent owner (`Codex2`). This is a deliberate
same-lane configuration for the sidecar — the reviewer audits
packet accuracy only, not the parent diff. Sibling Wave 4 sidecars
(e.g., `DRV-UI-RD-004-SIDECAR-ACCEPTANCE` at earlier revisions) have
used the same pattern; the parent diff is still approved by the live
parent reviewer (`Codex`), not by the sidecar reviewer.

### Authoritative source documents

- L1 / L2 product truth — provisioning-flow + forwarded-vs-owned
  authority semantics that the workspace cockpit reskin must preserve
  through every visual change:
  - `phase1_prd_detailed_v1.md` (forwarded vs owned dispatch
    authority, degraded-state handling)
  - `phase1_service_contracts_v1.md`
    (`UnifiedDriverTaskView`, `PlatformPresenceRecord`,
    `PlatformPresenceSummary`, `ShiftRecord`,
    `PLATFORM_CODE_REGISTRY` — the typed surfaces the cockpit reads)
- Planning ref — parent slice spec:
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`,
    section `## Wave 4 — Driver app visual reskin (DRV-UI-RD-NNN)`
    lines 484–516, with the parent's task line at 491 enumerating
    the two routes (`app/index.tsx` / `app/onboarding.tsx`).
  - Cross-cutting acceptance gates lines 583–600 (typecheck, lint,
    build, test, Storybook, reviewer review_notes_zh, commit hash).
  - Wave 4 dependency line 509: `Depends on: Wave 1 (TOK-UI-001)。
可與 Wave 3 平行` — `DRV-UI-RD-002` sits on the same upstream
    chain as the rest of Wave 4 driver reskins.
  - Wave 4 guardrail line 514: `A/B variants 不實作 (從 Workspace
A/B、Inbox A/B 中各選一個落地)` — the design canvas's
    `ScreenWorkspace` ships `variant='A'` and `variant='B'`
    (`docs/05-ui/drts-design-canvas/driver-screens-1.jsx:154–262`
    for variant A and `289–406` for variant B); `DRV-UI-RD-002` may
    only land **one** variant in the driver app.
- Existing workspace-cockpit surface (read-only context for the
  sidecar; the parent owner edits these files, not this sidecar):
  - `apps/driver-app/app/index.tsx` (5 lines at packet write — only
    `<Redirect href="/onboarding" />`; the entry route does not
    render the cockpit, it forwards to onboarding).
  - `apps/driver-app/app/onboarding.tsx` (2114 lines at packet
    write; renders the three-state shell — provisioning view at
    line 1193–1245, degraded view at 1252–1293, cockpit view at
    1299–1545+).
  - `apps/driver-app/lib/driver-workspace-cockpit.ts` (declares
    `summarizeWorkspaceTasks`, `isOwnedUnifiedTask`,
    `hasUnifiedTaskSyncIssue`, `buildFallbackUnifiedDriverTaskView`
    — the cockpit's task summarization helpers; visual-only tweaks
    inside the file are fine but the helper signatures must remain
    stable so `app/jobs.tsx` and `app/trip.tsx` keep typechecking).
  - `apps/driver-app/lib/driver-identity-bootstrap.ts` (provisioning
    flow internals — out of scope per Wave 4 guardrail line 513).
  - `apps/driver-app/lib/driver-location-heartbeat.ts` (heartbeat
    subscription — out of scope per Wave 4 guardrail line 513).
  - `apps/driver-app/lib/api-client.ts` (provisioning + presence +
    shift endpoints — out of scope; reviewer audits that no behavior
    changes leak in).
  - `apps/driver-app/lib/operational-labels.ts` (zhTW labels for
    statuses; the reskin should continue routing copy through this
    module rather than inlining strings in `onboarding.tsx`).
- Existing RN primitives layer (the surface DRV-UI-RD-001 added; the
  parent diff may consume but should not edit these unless gap-fixing
  a primitive needed for the workspace shell):
  - `apps/driver-app/components/ui-rn/` — `theme.ts` (driver theme
    bridge to `@drts/ui-tokens`), `AppText`, `AuthorityBadge`,
    `Badge`, `Button`, `ForwardedStatusBadge`, `Screen`, `Stack`,
    `Surface`, `index.ts`. `theme.ts` already imports
    `AUTHORITY_COLORS`, `DISPLAY_STRINGS`, `DENSITY_SCALES`,
    `STATUS_DISPLAY_STRINGS`, `STATUS_TONE_BY_VALUE`,
    `STATUS_TONES`, `SURFACE_ACCENTS` from `@drts/ui-tokens`.
  - `apps/driver-app/components/ui/` — pre-existing DRV-MAT
    primitives the cockpit currently consumes
    (`AppScreen`, `ActionButton`, `AuthorityBanner`, `ErrorBanner`,
    `FormField`, `PlatformBadge`, `StatusChip`, `tokens` —
    `apps/driver-app/app/onboarding.tsx:19–28`). These remain in the
    cockpit's import surface at packet write; the parent diff
    iterates against them.
- Token bundle the reskin depends on (read-only context):
  - `packages/ui-tokens/src/index.ts` (re-export surface)
  - `packages/ui-tokens/src/colors.ts` (authority + accent + status
    palettes — `OWNED`, `FORWARDED`, `STATUS_TONES`,
    `SURFACE_ACCENTS`)
  - `packages/ui-tokens/src/density.ts` (numeric scale)
  - `packages/ui-tokens/src/status.ts` (`STATUS_VOCABULARY`,
    `STATUS_TONE_BY_VALUE`, `STATUS_DISPLAY_STRINGS`,
    `isForwardedStatus`, `DISPLAY_STRINGS`)
- Design canvas references (frozen per cross-cutting acceptance
  gates line 597 — must **not** be edited by the parent diff):
  - `docs/05-ui/drts-design-canvas/driver-screens-1.jsx:64–135`
    (`ScreenProvisioning`)
  - `docs/05-ui/drts-design-canvas/driver-screens-1.jsx:154–262`
    (`ScreenWorkspace` variant A — header, hero, KPI row, reauth
    alert, platform presence list, quick links, bottom tabs)
  - `docs/05-ui/drts-design-canvas/driver-screens-1.jsx:289–406`
    (`ScreenWorkspace` variant B — denser stacked layout)
  - `docs/05-ui/drts-design-canvas/DRTS Driver App.html:138–187`
    (canvas iframe entries that render both variants for review)

---

## 3. Dependency Map

### Formal upstream dependencies

The parent's `depends_on` set is `DRV-UI-RD-001`. It is `done` in
`ai-status.json` at packet write.

| Dep ID          | Title                                                                  | Owner | Reviewer | Status (truth)            | What this slice provides to DRV-UI-RD-002                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------- | ----- | -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DRV-UI-RD-001` | Wire `@drts/ui-tokens` into driver-app; build RN-side primitives layer | Codex | Codex2   | `done` (commit `5db92c8`) | Lands the cross-stack `@drts/ui-tokens` integration into driver-app and the new `apps/driver-app/components/ui-rn/` primitives (`Screen`, `Stack`, `Surface`, `Button`, `Badge`, `AuthorityBadge`, `ForwardedStatusBadge`, `AppText`, `theme.ts`). DRV-UI-RD-002 must drive its workspace cockpit visual alignment from these primitives + the existing `apps/driver-app/components/ui/` (DRV-MAT) primitives the cockpit currently imports, not by hand-rolling new color literals. Provides `theme.ts`'s mapping from `STATUS_TONE_BY_VALUE` so the cockpit never re-derives forwarded status tones. |

Dependency assertion:

- The parent's workspace cockpit reskin is a **composition** layer
  on top of the existing driver theme bridge
  (`apps/driver-app/components/ui-rn/theme.ts`), the
  `STATUS_VOCABULARY` / `STATUS_TONE_BY_VALUE` / `SURFACE_ACCENTS`
  tables in `@drts/ui-tokens`, and the pre-existing
  `apps/driver-app/components/ui/` primitives the onboarding cockpit
  currently imports (`AppScreen`, `ActionButton`, `AuthorityBanner`,
  `ErrorBanner`, `FormField`, `PlatformBadge`, `StatusChip`,
  `tokens`). No upstream slice needs to reopen for parent acceptance
  given the current snapshot.
- If `DRV-UI-RD-001` later reopens (theme bridge token surface
  changes, primitive prop signatures change, `AuthorityBadge` /
  `ForwardedStatusBadge` API drifts), the cockpit reskin and the
  parent's typecheck must be re-validated before the parent can
  finalize. `pnpm --filter @drts/driver-app typecheck` will pick up
  most prop-shape drifts; a semantically silent regression (e.g., a
  token surface keeps the same shape but flips light/dark values)
  would still need a manual sidecar-or-review check.
- If the upstream `@drts/ui-tokens` `STATUS_VOCABULARY` reopens (new
  forwarded statuses, status tone re-mapping), the cockpit's
  warning-callout list (sync-issue / pending-platform /
  fallback-mode banners) must be re-audited against the new surface,
  but the planning-ref Wave 4 guardrail keeps that out of scope for
  DRV-UI-RD-002 itself.

### Non-formal but spec-relevant upstream context

These tasks are referenced by the surrounding waves but are **not**
in the parent's formal `depends_on`. They are listed here so the
reviewer understands what the "existing baseline" the parent must
preserve actually is:

| Spec-relevant slice | Status (truth)            | Why it matters to DRV-UI-RD-002                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOK-UI-001`        | `done` (commit `a6028b7`) | Lands the cross-stack `@drts/ui-tokens` package whose `colors.ts`, `density.ts`, and `status.ts` provide the authority / accent / status / density / display-string surfaces driver-app reads. DRV-UI-RD-002's cockpit palette resolves through these tables transitively via DRV-UI-RD-001's `theme.ts`.                                                                                                                                                                                                               |
| `DRV-MAT-004`       | `done`                    | Established the unified trip workflow command center (`apps/driver-app/components/ui/` DRV-MAT primitives — `AppScreen`, `PageHeader`, `BottomActionBar`, `StatusChip`, `InfoTile`, `EmptyState`, `ErrorBanner`, `FormField`, `IconButton`). DRV-UI-RD-002 reuses these, not a new RN primitive set, for the workspace cockpit shell. The cockpit at packet write already consumes `AppScreen`, `ActionButton`, `AuthorityBanner`, `ErrorBanner`, `FormField`, `PlatformBadge`, `StatusChip`, `tokens` from this layer. |
| `EMC-W1-002`        | `done`                    | Driver onboarding degraded-state hardening. The degraded-state branch (`onboarding.tsx:1252–1293`) DRV-UI-RD-002 reskins must continue to surface the "工作台暫時降級" handoff with the `身份失敗` / `旗標降級` chip pair the same way EMC-W1-002 wired up; reviewer should confirm the new paint does not collapse the degraded message into the success/warning palette or hide the `重新檢查連線` / `重新初始化身份` recovery actions.                                                                               |
| `EXT-001`           | `done`                    | Established the `PlatformPresenceRecord` / `PlatformPresenceSummary` typed surface the cockpit reads via `client.getPlatformPresence()`. The cockpit's `PlatformRow` list (`onboarding.tsx:1462–1485`) and the `reauthPlatform` urgent-action card (`1392–1399`) must keep rendering off these typed shapes — not switch to a hand-rolled local mock.                                                                                                                                                                   |

These are informational anchors, not parent-acceptance gates.

### Formal downstream dependents

`DRV-UI-RD-009` is the only task in machine truth that formally lists
`DRV-UI-RD-002` in its `depends_on` set at packet write
(`ai-status.json -> DRV-UI-RD-009.depends_on` =
`[DRV-UI-RD-001, DRV-UI-RD-002, DRV-UI-RD-003, DRV-UI-RD-004,
DRV-UI-RD-005, DRV-UI-RD-006, DRV-UI-RD-007, DRV-UI-RD-008]`).
Beyond that formal edge, the planning ref places these consumers
immediately adjacent to DRV-UI-RD-002 within Wave 4 dependency
intent:

| Downstream consumer | Edge type                        | Why it depends on DRV-UI-RD-002                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-009`     | **formal** (`depends_on`)        | Wave 4 driver closeout packet (assigned to `Claude` / `Copilot`, currently `backlog`). Listed in `ai-status.json -> DRV-UI-RD-009.depends_on`. Cannot finalize until DRV-UI-RD-002 (and its 7 Wave-4 siblings) reach `done`; finalize blocks the entire Wave 4 driver closeout.                                                                                                                                            |
| `DRV-UI-RD-003`     | informal (planning-ref ordering) | Reskin Inbox (`app/jobs.tsx`). The cockpit's "下一步動作" hero card and quick-link "任務 / 行程" tiles route into Inbox + Trip; if DRV-UI-RD-002 shifts the cockpit's status-chip vocabulary, KPI-tile labels, or platform-row variant mapping, Inbox row visuals should align with the same vocabulary in DRV-UI-RD-003. Decoupled enough to land independently, but visual drift between the two slices is a known risk. |
| `DRV-UI-RD-004`     | informal (planning-ref ordering) | Reskin Trip (`app/trip.tsx`). The cockpit's `HeroCard` "繼續行程 / 查看路線" CTA pair previews the trip surface; DRV-UI-RD-004 reskins the destination screen. Eyebrow copy + status chip variants for `owned_active` should match between the cockpit preview and the trip screen.                                                                                                                                        |
| `DRV-UI-RD-005`     | informal (planning-ref ordering) | Reskin Platform Presence (`app/platform-presence.tsx`). The cockpit's platform-row list (`PlatformRow` rendering off `PlatformPresenceRecord`) and the `reauthPlatform` urgent card link into the platform-presence screen; the visual vocabulary for `online` / `offline` / `reauth_required` should align between the two surfaces.                                                                                      |
| `DRV-UI-RD-006`     | informal (planning-ref ordering) | Reskin Earnings + Shift. The cockpit's `KpiTile` "班次" reading and the quick-link "班次" / "收入" tiles route into the earnings/shift surfaces; KPI-tile tone semantics (`success` / `neutral` / `warning`) should align.                                                                                                                                                                                                 |
| `DRV-UI-RD-007`     | informal (planning-ref ordering) | Reskin SOS (`app/incident.tsx`). The cockpit's bell button (`onboarding.tsx:1314–1331`) routes into `/incident`; the SOS surface should not regress in its critical-tone treatment when the cockpit reroutes to it.                                                                                                                                                                                                        |
| `DRV-UI-RD-008`     | informal (planning-ref ordering) | Reskin Settings. The cockpit's quick-link "設定" tile routes into `/settings`; settings surface should align with the cockpit shell tone.                                                                                                                                                                                                                                                                                  |

Blast-radius note for the parent reviewer (`Codex` at packet write):

- If the parent diff regresses the **provisioning flow** — for
  example, by changing the gating on `isDriverIdentityProvisioned()`,
  by suppressing `getDriverIdentityIssue()` errors, by skipping
  `initializeDriverIdentity()` on mount, or by reordering the three
  cockpit branches (loading → unprovisioned → degraded → cockpit) —
  the planning-ref guardrail "禁止改變 backend 行為、location
  heartbeat、provisioning flow" (line 513) is violated and the parent
  must reopen.
- If the parent diff edits `apps/driver-app/lib/api-client.ts`,
  `apps/driver-app/lib/driver-location-heartbeat.ts`,
  `apps/driver-app/lib/driver-identity-bootstrap.ts`, or
  `apps/driver-app/lib/driver-identity-routing.ts`, that is a backend
  / heartbeat / provisioning behavior change and falls under the
  Wave 4 guardrail. The parent diff must remain visual-only.
- If the parent diff hard-codes new color literals inside
  `onboarding.tsx` rather than reaching them through `tokens.colors.*`
  (from `apps/driver-app/components/ui/tokens.ts`) or the
  `STATUS_TONE_BY_VALUE` / `SURFACE_ACCENTS` tables in
  `@drts/ui-tokens`, the cross-stack token discipline DRV-UI-RD-001
  established is violated. Reviewer should grep the parent diff for
  raw hex literals (`#[0-9a-fA-F]{3,6}`) and challenge any that are
  not passthroughs of existing tokens. Note: the cockpit at packet
  write already uses `tokens.colors.dangerBg` / `tokens.colors.danger`
  / `tokens.colors.brandBg` / `tokens.colors.brand` /
  `tokens.colors.warningBg` / `tokens.colors.warning` /
  `tokens.colors.text` / `tokens.colors.textMuted` (see
  `WarningCallout` palette at line 163–180 and the cockpit chrome at
  1314–1331); the reskin should preserve or extend that pattern, not
  abandon it.
- If the parent diff drops the **degraded-state branch** (`flagsOk` /
  `identityOk` chip pair + recovery action pair at line 1252–1293) or
  collapses the three-state shell into a single rendered state, the
  EMC-W1-002 hardening regresses. The shell must continue to render
  Loading → Unprovisioned → Degraded → Cockpit, in that order.
- If the parent diff lands **both** Workspace variants (A and B) from
  the design canvas, the planning-ref Wave 4 guardrail line 514
  "A/B variants 不實作 (從 Workspace A/B、Inbox A/B 中各選一個落地)"
  is violated. The parent diff must pick exactly one Workspace
  variant and document the choice in the handoff note.
- If the parent diff drops the warning-callout stack
  (`syncIssueCount` banner at line 1401–1407, `pendingPlatformCount`
  banner at 1409–1415, `taskFallbackMode` banner at 1417–1423,
  `taskLoadError` banner at 1425–1431, `platformLoadError` banner at
  1433–1439, `mismatchedPlatforms` banner at 1441–1449), the cockpit
  loses its degraded-data signaling — drivers will not see
  forwarded-task sync issues, fallback-mode rendering, platform
  presence load errors, or off-shift platform-mismatch warnings.
  Each banner is anchored to a real product-state predicate; the
  reskin may restyle them but must not silently delete branches.
- If the parent diff edits `apps/driver-app/lib/driver-workspace-cockpit.ts`
  to change the signature of `summarizeWorkspaceTasks`,
  `isOwnedUnifiedTask`, `hasUnifiedTaskSyncIssue`, or
  `buildFallbackUnifiedDriverTaskView`, the cockpit's task
  summarization will break and `app/jobs.tsx` and `app/trip.tsx`
  (which also import these helpers) will type-error. Visual-only
  tweaks inside the file are fine; the exported helper signatures
  must remain stable.

### Ordering guidance vs. formal blockers

The planning ref places `DRV-UI-RD-002` inside Wave 4 between
DRV-UI-RD-001 and DRV-UI-RD-003 (lines 489–492 of the planning ref).
The only formal blocker is the dependency recorded in
`ai-status.json -> DRV-UI-RD-002.depends_on`. This sidecar does not
introduce extra prerequisites beyond machine truth.

---

## 4. Acceptance Checklist

Each item below is the parent acceptance gate rephrased as a concrete,
citation-anchored check the parent owner (`Codex2`) self-verifies
before handing off, and the parent reviewer (`Codex`) audits at
review time. At packet write the parent task is `backlog` in machine
truth — the parent owner has not yet claimed the task in this cycle,
so each gate below is forward-looking and applies once the parent
moves to `in_progress` and produces a diff; for the live cycle
position read `ai-status.json -> DRV-UI-RD-002.status` directly (see
§2). Each item below is phrased as a property the parent diff must
satisfy rather than a property already observed, because this packet
is support-only and intentionally does not pre-approve the diff.

Legend: `[REQUIRED]` = explicit gate from
`ai-status.json -> DRV-UI-RD-002.acceptance` or from the planning-ref
Wave 4 acceptance / guardrail block. `[DERIVED]` = unwritten but
implied by the planning ref or by the L0 / L2 collaboration rules; the
parent reviewer may treat these as informational.

### A. Two design-canvas references render under the new paint `[REQUIRED]`

`ai-status.json -> DRV-UI-RD-002.summary_zh` says the slice aligns
`app/index.tsx + app/onboarding.tsx` with `ScreenWorkspace +
ScreenProvisioning`. The two canvas references map to the same file:

| Canvas reference                                                                   | Where the driver-app currently renders it                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScreenProvisioning` (`docs/05-ui/drts-design-canvas/driver-screens-1.jsx:64–135`) | `apps/driver-app/app/onboarding.tsx:1193–1245` (the `if (!provisioned)` branch — brand tile, activation step timeline, registration form, primary action, warning callout)                                                          |
| `ScreenWorkspace` variant A or B (`driver-screens-1.jsx:154–262` / `289–406`)      | `apps/driver-app/app/onboarding.tsx:1299–1545+` (the cockpit branch — header + bell, hero next-action card, KPI row, authority readiness banners, reauth alert, warning-callout stack, platform list, helper hint, quick-link grid) |

The parent diff must satisfy:

- [ ] `ScreenProvisioning` parity — the unprovisioned branch keeps
      the activation step timeline (currently `ACTIVATION_STEPS` at
      `onboarding.tsx:63–79`), the registration form (`FormField`
      pair for `registrationCode` + `deviceLabel` at 1215–1232), the
      primary `註冊此裝置` action (`ActionButton` at 1233–1240), and
      the closing warning callout "未啟用裝置無法接收派單…"
      (`WarningCallout` at 1243). Visual chrome may shift; the
      activation flow must not collapse into a single step or skip
      the warning callout.
- [ ] `ScreenWorkspace` variant choice — the parent diff picks
      **exactly one** Workspace variant from the design canvas
      (variant A or variant B) per planning-ref guardrail line 514.
      The handoff note must declare which variant landed and cite
      the canvas reference (e.g., `landed variant A per
    driver-screens-1.jsx:154–262`). Landing both variants violates
      the guardrail.
- [ ] Cockpit shell composition — the chosen Workspace variant keeps
      the cockpit's product-state surfaces:
      header + greeting + status row + bell button (currently
      `onboarding.tsx:1301–1332`), hero next-action card
      (`HeroCard` at 1334–1341 driven by `nextAction` derivation),
      KPI row (`KpiTile` x3 at 1343–1367 — 班次 / 急件 / 外部可接單),
      authority readiness banner pair (`AuthorityBanner` x2 at
      1369–1390 — DRTS 自營派單 + 外部平台就緒狀態), reauth urgent
      card when `reauthPlatform` is non-null (1392–1399), warning
      callout stack (six predicates at 1401–1449), platform presence
      section (`PlatformRow` list at 1451–1485), helper hint
      (1487–1494), and quick-link grid (`QuickTile` x6 at
      1496–1539). The reskin may restyle each surface but must not
      silently drop a surface — each one is anchored to a real
      product-state predicate.
- [ ] Three-state shell ordering — the cockpit's branch order
      (Loading → Unprovisioned → Degraded → Cockpit, currently at
      `onboarding.tsx:1188–1294` ahead of the cockpit return at 1299) must be preserved. The reskin must not reorder the
      branches or render a branch unconditionally.
- [ ] `app/index.tsx` containment — at packet write `app/index.tsx`
      is a 5-line `Redirect href="/onboarding"`. The parent diff
      should leave the redirect in place; the cockpit reskin lives
      in `onboarding.tsx`, not in the entry route. If the diff
      changes the redirect (e.g., changes the target route or
      removes the redirect), the handoff note must justify the
      change because it affects deep linking and route ordering.

### B. Provisioning flow is not changed `[REQUIRED]`

Planning ref line 513 (Wave 4 guardrail):

> 禁止改變 backend 行為、location heartbeat、provisioning flow

The parent diff must satisfy:

- [ ] `initializeDriverIdentity()` (called at `onboarding.tsx:524`)
      keeps running on mount with the same effect lifecycle. The
      reskin must not skip the call, defer it past first paint, or
      change the `cancelled` cleanup pattern at 521–550.
- [ ] `isDriverIdentityProvisioned()` (called at line 553) keeps
      gating the unprovisioned branch. The reskin must not flip the
      condition, hard-code `provisioned = true`, or render the
      cockpit before identity is bootstrapped.
- [ ] `getDriverIdentityIssue()` (called at line 541) keeps surfacing
      identity errors into `provisioningError`, and `provisioningError`
      keeps rendering through `ErrorBanner` (line 1212–1214) inside
      the unprovisioned branch. The reskin must not suppress error
      surfacing or render the registration form when the identity
      bootstrap raised an issue.
- [ ] `registerDriverDevice(normalizedCode, deviceLabel)` (called at
      line 1006 from `handleRegister`) keeps the same call signature
      and the same `submitting` flag flow. The reskin may restyle
      the primary action button but must not change which arguments
      are sent or the loading-state semantics.
- [ ] `hasDriverDevOverride()` gating (line 1202) keeps controlling
      the `開發覆寫` chip render. The reskin may restyle the chip but
      must not show it unconditionally or hide it for legitimate dev
      overrides.
- [ ] No edits leak into `apps/driver-app/lib/driver-identity-bootstrap.ts`,
      `apps/driver-app/lib/driver-identity-routing.ts`, or
      `apps/driver-app/lib/api-client.ts`'s provisioning-related
      exports (`initializeDriverIdentity`, `registerDriverDevice`,
      `isDriverIdentityProvisioned`, `getDriverIdentityIssue`,
      `hasDriverDevOverride`, `getDriverClient`, `getDriverId`).

### C. Degraded-state and warning-callout branches preserved `[REQUIRED]`

The cockpit currently surfaces six discrete warning conditions and a
dedicated degraded-state branch. The parent diff must satisfy:

- [ ] Degraded-state branch (`onboarding.tsx:1252–1293`) keeps the
      `flagsOk === false || identityOk === false` predicate, the
      "工作台暫時降級" copy, the `身份正常 / 身份失敗` +
      `旗標正常 / 旗標降級` `StatusChip` pair, the `重新檢查連線`
      action, and the `重新初始化身份 / 先查看任務收件匣` secondary
      action. Per EMC-W1-002 hardening, this surface must not
      collapse into the cockpit branch or hide the recovery actions.
- [ ] `taskSummary.syncIssueCount > 0` banner (line 1401–1407) keeps
      `tone="danger"`, the warning icon, and the exact predicate.
      The summary derives from `summarizeWorkspaceTasks` over
      `taskViews` and counts forwarded-task sync issues — this is
      the cockpit-side echo of the trip screen's `sync_failed`
      handling, which the Wave 4 guardrail "既有 forwarded
      sync_failed 處理邏輯不可降級" (line 515) protects.
- [ ] `taskSummary.pendingPlatformCount > 0` banner (line 1409–1415)
      keeps `tone="info"` and surfaces forwarded-pending awaiting
      platform confirmation — drivers must continue to see the
      "確認前請勿自行前往接送點" guidance.
- [ ] `taskFallbackMode` banner (line 1417–1423) keeps `tone="info"`
      and surfaces the legacy mirror data warning when
      `client.listUnifiedDriverTasks()` falls back to
      `client.listDriverTasks()` (the fallback path at 564–580). The
      reskin must not silently hide the fallback signal.
- [ ] `taskLoadError` banner (1425–1431) and `platformLoadError`
      banner (1433–1439) keep `tone="warning"` and surface the
      respective error messages from `Promise.allSettled` rejections
      (596–602). The reskin must not swallow these errors into a
      generic neutral surface.
- [ ] `mismatchedPlatforms.length > 0 && !isDriverOnShift` banner
      (1441–1449) keeps the off-shift platform-mismatch warning;
      this is the cockpit's safety check for drivers who left
      external platforms online while not on a DRTS shift.
- [ ] `reauthPlatform` urgent card (1392–1399) keeps rendering when
      any `PlatformPresenceRecord` has `reauthRequired === true`,
      and keeps routing into `/platform-presence`.

### D. Cross-stack token discipline `[REQUIRED]`

DRV-UI-RD-001 wired `@drts/ui-tokens` into the driver-app via
`apps/driver-app/components/ui-rn/theme.ts`. The parent diff must
satisfy:

- [ ] No raw color literal that doesn't trace back through
      `tokens.colors.*` (`apps/driver-app/components/ui/tokens.ts`)
      or through the `STATUS_TONE_BY_VALUE` / `SURFACE_ACCENTS` /
      authority palette in `@drts/ui-tokens`
      (`packages/ui-tokens/src/colors.ts`,
      `packages/ui-tokens/src/status.ts`). Reviewer can grep the
      parent diff for `#[0-9a-fA-F]{3,6}` outside `tokens.ts`; new
      literals require a justification note in the handoff. The
      cockpit at packet write already routes its WarningCallout
      palette through `tokens.colors.dangerBg` / `tokens.colors.danger`
      / `tokens.colors.brandBg` / `tokens.colors.brand` /
      `tokens.colors.warningBg` / `tokens.colors.warning`
      (`onboarding.tsx:163–180`); the reskin should preserve or
      extend that pattern.
- [ ] `STATUS_VOCABULARY` consumers (`ForwardedStatusBadge` at
      `apps/driver-app/components/ui-rn/ForwardedStatusBadge.tsx`,
      `theme.ts`'s `STATUS_TONE_BY_VALUE` import) remain the source
      of truth for forwarded-task status display strings. The reskin
      must not duplicate the vocabulary inside `onboarding.tsx` if
      the cockpit grows a forwarded-task surface that needs status
      copy.
- [ ] If the reskin needs additional token-level helpers (e.g., a
      new `surfaceCockpitHero` variant), the helper is added inside
      `apps/driver-app/components/ui/tokens.ts` next to the existing
      surface palette, not inlined into `onboarding.tsx`. Reviewer
      should reject token additions that escape into unrelated apps
      without going through `@drts/ui-tokens` and `TOK-UI-001`
      follow-ups.
- [ ] The reskin should prefer consuming existing
      `apps/driver-app/components/ui-rn/` primitives
      (`AuthorityBadge`, `ForwardedStatusBadge`, `Button`,
      `Surface`, `Stack`, `Screen`, `AppText`) where they fit, since
      DRV-UI-RD-001 added them precisely so Wave 4 reskins can drop
      hand-rolled palettes. Either consumption shape is acceptable
      (existing DRV-MAT primitives or new RN-side primitives, or a
      hybrid); the choice should be explicit in the handoff note so
      DRV-UI-RD-009 can document the consumption pattern at Wave 4
      closeout.

### E. Recorded acceptance commands `[REQUIRED]`

This section translates two layered gate sets that both bind
`DRV-UI-RD-002`:

1. **Parent task acceptance** —
   `ai-status.json -> DRV-UI-RD-002 -> acceptance`: typecheck, lint,
   test, and Expo dev build on Android emulator + manual screenshot
   vs canvas. Authoritative for this slice's machine-truth row.
2. **Wave 4 cross-cutting acceptance gates** —
   `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` lines
   583–593, applied to **every** redesign task: typecheck, lint,
   build, test (`--passWithNoTests` allowed), Storybook story render
   next to the design canvas iframe, reviewer `review_notes_zh`
   visual pass/diff list, and commit hash + reviewer record per
   closeout format.

Closeout commit-evidence per cross-cutting gate #7 is covered
separately in §4.H so this section does not duplicate it.

- [ ] `pnpm --filter @drts/driver-app typecheck`
  - Resolves to `tsc --noEmit` per
    `apps/driver-app/package.json` `typecheck` script.
  - Parent owner (`Codex2`) must run on the final pre-commit state
    and record PASS in the parent's `next` / handoff note before
    handoff.
  - Parent reviewer (`Codex`) re-confirms PASS at `review_approved`.
  - The sidecar does **not** re-run this command.
- [ ] `pnpm --filter @drts/driver-app lint`
  - Resolves to `eslint . --max-warnings=0` per
    `apps/driver-app/package.json` `lint` script. Strict gate — even
    warnings must be zero.
- [ ] `pnpm --filter @drts/driver-app test`
  - Resolves to `vitest run --passWithNoTests` per
    `apps/driver-app/package.json` `test` script. The driver-app
    does not currently ship an `onboarding.tsx` unit test; if the
    parent owner adds one (recommended for the degraded-state
    regression guard), it must keep `vitest run` green. If no test
    is added, `--passWithNoTests` keeps the gate passing.
- [ ] `pnpm --filter @drts/driver-app build` `[cross-cutting gate #3]`
  - `apps/driver-app/package.json` defines two scripts that bind
    this gate together: `"build": "tsc --noEmit"` (line 8) **and**
    `"prebuild": "expo prebuild"` (line 17). Because `prebuild` is
    the npm-defined pre-hook for the `build` lifecycle, invoking
    `pnpm --filter @drts/driver-app build` runs `expo prebuild`
    first and only then runs `tsc --noEmit`. This gate is therefore
    **not** output-identical to `pnpm --filter @drts/driver-app
typecheck`: the typecheck portion is identical, but the side
    effect — native project regeneration — is real filesystem state
    that the cross-cutting gate produces and `typecheck` does not.
  - Side-effect surface to expect when the gate runs:
    - `apps/driver-app/ios/` — created by `expo prebuild` but **not
      tracked** in the repo at packet write (`git ls-files
apps/driver-app/ios` returns nothing). The planning ref does
      not authorize landing iOS native scaffolding in
      DRV-UI-RD-002, so the parent commit must not pick it up.
    - `apps/driver-app/android/` — already **tracked** at packet
      write (`apps/driver-app/android/.gitignore`,
      `apps/driver-app/android/app/build.gradle`, etc.). Re-running
      `expo prebuild` may rewrite tracked files in this directory;
      if it does, those rewrites are not a DRV-UI-RD-002
      deliverable either and must not enter the parent commit.
    - Other Expo prebuild outputs (`apps/driver-app/.expo/` is
      already `.gitignore`-d via the root `.gitignore` `# mobile /
expo` block); nothing additional is expected to leak past
      these two directories, but the parent owner should still
      verify with `git status apps/driver-app/` before committing.
  - Cleanup expectation before parent handoff / finalize:
    - parent owner (`Codex2`) runs `git status apps/driver-app/ios
apps/driver-app/android` after the gate. The required state
      before the parent `done` commit is:
      (a) any newly created `apps/driver-app/ios/` is **not** added
      to the staged diff (either delete the directory or rely on
      a selective `git add` that excludes it), and
      (b) `git diff -- apps/driver-app/android/` is empty against
      `HEAD` so the regenerated native scaffold is identical to
      the committed baseline (or, if `expo prebuild` legitimately
      rewrites a file, the parent owner reverts that rewrite —
      DRV-UI-RD-002 is visual-only and must not move native
      scaffolds).
    - reviewer (`Codex`) re-runs the gate during `review_approved`
      verification and applies the same cleanup check before
      authorizing the parent's commit / push. If the reviewer's
      re-run leaves residual `ios/` or modified `android/` files in
      the working tree, those must be reverted before the parent
      `done` transition; they are **not** sidecar-fixable artifacts.
  - Handoff-note expectation for the parent owner: the build-gate
    PASS line in `ai-status.json -> DRV-UI-RD-002.next` must record
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
    (Wave 4 driver closeout / packaging slices), not a
    DRV-UI-RD-002 decision.
- [ ] Storybook story render (cross-cutting gate #5)
  - Planning ref line 591: "對應 Storybook story 可啟動，並在 design
    canvas iframe 旁 render". The Storybook root for this monorepo
    lives at `packages/ui-web/.storybook/` (`main.ts` glob:
    `../src/**/*.stories.@(ts|tsx)`); at packet write it ships the
    stories landed by the `SBK-UI-001` and `SBK-UI-002` slices.
    **Caveat for DRV-UI-RD-002 specifically:** driver-app is Expo /
    React Native and is forbidden from importing `@drts/ui-web`
    (planning ref Wave 4 preamble lines 486–487), so the cockpit
    screen and the `apps/driver-app/components/ui-rn/` primitives
    are **not** part of the `packages/ui-web` Storybook surface and
    there is no per-app Storybook under `apps/driver-app/`. Two
    acceptable evidence shapes for this gate:
    - **a)** parent owner / parent reviewer confirms that any
      `@drts/ui-tokens`-backed primitive the cockpit reskin newly
      consumes is already covered by an existing
      `packages/ui-web/src/**/*.stories.*` story (e.g., authority
      badges, status tone surfaces from `STATUS_TONE_BY_VALUE`
      rendered through ui-web wrappers) and that story still
      launches via `pnpm --filter @drts/ui-web storybook` at the
      slice's pre-commit state — i.e., the gate is satisfied
      transitively through the ui-tokens layer the cockpit reads
      from.
    - **b)** parent owner declares the gate as **N/A for
      driver-app** in the handoff note, with citation to planning
      ref lines 486–487 (no `@drts/ui-web` import allowed) and a
      note that the Wave 4 driver closeout (`DRV-UI-RD-009`) is the
      appropriate slice to land driver-side primitive stories — not
      this cockpit reskin. Either evidence shape must be explicit
      in the handoff; silent omission is not acceptable. Reviewer
      captures the decision in
      `ai-status.json -> DRV-UI-RD-002.review_notes_zh`.
- [ ] Expo dev build run on Android emulator (planning ref line 507):
      manual screenshot vs design canvas, with at least the three
      shell states covered (unprovisioned vs degraded vs cockpit).
      The Wave 4 cross-cutting acceptance gates (planning ref lines
      583–593, gate #6) require the reviewer to record "視覺通過或
      差異列表" in `review_notes_zh`. This is not a machine-checkable
      gate; the reviewer captures it in
      `ai-status.json -> DRV-UI-RD-002.review_notes_zh` after
      manually stepping through: - the unprovisioned branch (with and without
      `provisioningError`, with and without `hasDriverDevOverride()`) - the degraded branch (each `flagsOk` × `identityOk`
      combination that hits `false`) - the cockpit branch with at least one of each warning callout
      firing (`syncIssueCount > 0`, `pendingPlatformCount > 0`,
      `taskFallbackMode === true`, `taskLoadError !== null`,
      `platformLoadError !== null`, `mismatchedPlatforms.length > 0`),
      plus a `reauthPlatform` non-null path for the urgent card.
  - DRV-UI-RD-001's commit (`5db92c8`) explicitly noted "Android
    emulator / manual screenshot not run in this environment (no
    adb/emulator SDK)"; if the constraint stands at finalize, the
    handoff note must declare so explicitly and surface a
    fallback-evidence pathway (e.g., Expo web preview, static
    screenshot from a device farm, design-canvas side-by-side from
    `docs/05-ui/drts-design-canvas/DRTS Driver App.html`) the
    reviewer can audit against — silent omission of the
    manual-screenshot record is a reopen trigger.

### F. Translation parity `[DERIVED]`

DRV-UI-RD-002 introduces visual chrome around existing copy; the
existing copy is already zhTW per
`apps/driver-app/lib/operational-labels.ts` and the inline strings
in `onboarding.tsx` (e.g., "工作台", "上班中", "外部可接單", "DRTS
自營派單", "外部平台就緒狀態", "需重新授權", "確認前請勿自行前往接送點"
). The parent diff must satisfy:

- [ ] If the parent diff exposes any new consumer-facing string (for
      example, an empty-state caption on a new info tile, a tooltip
      on a new chip, or a re-worded banner), the new copy lands in
      zhTW first. The driver-app does not ship a runtime locale
      switcher today, so en parity is **not** required unless the
      diff also wires up `STATUS_DISPLAY_STRINGS` (which already
      carries `en` + `zhTW`) for a new label. If no new copy is
      added — the most likely outcome — this gate is vacuously
      satisfied.

### G. Scope containment `[DERIVED]`

The parent's `artifacts` block is `apps/driver-app/`. That is broad;
the planning-ref task line scopes the slice tightly to
`app/index.tsx` + `app/onboarding.tsx`. The parent diff must
satisfy:

- [ ] `git diff --stat HEAD` against the parent's pre-commit state
      shows changes primarily inside
      `apps/driver-app/app/onboarding.tsx`, plus any of these
      support files needed to keep typecheck and the manual
      screenshot gate sane:
      `apps/driver-app/app/index.tsx` (only if the redirect target
      legitimately needs to change — should be rare),
      `apps/driver-app/components/ui/tokens.ts` (only if a new
      semantic token is needed; preferred over inline literals),
      `apps/driver-app/components/ui/<primitive>.tsx` (only if a
      DRV-MAT primitive needs a new variant prop to support the
      cockpit shell — should be rare),
      `apps/driver-app/components/ui-rn/<primitive>.tsx` (only if
      a DRV-UI-RD-001-side primitive needs a gap fix to support
      the cockpit shell — should be rare). If additional ancillary
      files appear in the diff, the handoff note must explain why.
- [ ] No edits leak into `phase1_*` truth, the contracts bundle
      (`packages/contracts/**`), `@drts/ui-tokens` source
      (`packages/ui-tokens/**` — token additions belong to
      TOK-UI-001 follow-ups), other apps
      (`apps/{platform-admin-web,ops-console-web,tenant-console-web,
    partner-booking-web,api}/**`), driver lib modules forbidden
      by the Wave 4 guardrail (`apps/driver-app/lib/api-client.ts`,
      `apps/driver-app/lib/driver-location-heartbeat.ts`,
      `apps/driver-app/lib/driver-identity-bootstrap.ts`,
      `apps/driver-app/lib/driver-identity-routing.ts`), the
      `summarizeWorkspaceTasks` / `isOwnedUnifiedTask` /
      `hasUnifiedTaskSyncIssue` /
      `buildFallbackUnifiedDriverTaskView` exports of
      `apps/driver-app/lib/driver-workspace-cockpit.ts` (visual-only
      tweaks inside the file are fine, but the helper signatures
      must not change), or the design canvas
      (`docs/05-ui/drts-design-canvas/**` — frozen per cross-cutting
      acceptance gate "禁止修改 docs/05-ui/drts-design-canvas/" at
      planning ref line 597).

### H. Commit evidence at parent finalize `[REQUIRED]`

Per `AI_COLLABORATION_GUIDE.md` §5 (commit evidence rule), parent
`DRV-UI-RD-002` is a canonical implementation slice (not a sidecar),
so `done` requires:

- [ ] Local task-scoped commit whose subject includes
      `DRV-UI-RD-002`. Sibling slices in this wave used subjects of
      the form `feat(DRV-UI-RD-001): wire ui-tokens into driver-app
    RN primitives` (commit `5db92c8`). Reviewer should not treat
      the exact wording as required, only the presence of
      `DRV-UI-RD-002`.
- [ ] Commit body trailers:
  - `LLM-Agent: Codex2`
  - `Task-ID: DRV-UI-RD-002`
  - `Reviewer: Codex`
- [ ] A normal non-force push, with `PUSH_REMOTE` / `PUSH_BRANCH`
      recorded in the `done` transition. Sibling DRV-UI commits land
      on `feat/claude2-ui-redesign-foundation` per
      `ai-status.json -> DRV-UI-RD-001` (commit `5db92c8` on the
      current branch); the parent owner should pick a branch
      consistent with the live wave's branching pattern, not assume
      that branch name.
- [ ] `done` transition runs through
      `scripts/ai-status.sh done DRV-UI-RD-002` with `COMMIT_HASH` /
      `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` set —
      `NO_COMMIT_REQUIRED=1` is **not** acceptable for the parent
      (only for sidecars like this one).
- [ ] If the parent owner field shifts before finalize, the commit
      `LLM-Agent` trailer must reflect the live owner at finalize
      time, not the owner named in this packet at packet-write time.

---

## 5. Reviewer Evidence Anchors

The sidecar reviewer (`Codex2`) and, later, the parent reviewer
(`Codex`) can use these anchors to validate the eventual parent
handoff without treating this packet as canonical truth:

- `ai-status.json -> DRV-UI-RD-002`
- `ai-status.json -> DRV-UI-RD-002-SIDECAR-ACCEPTANCE`
- `ai-activity-log.jsonl` (filter on either id)
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`, section
  `## Wave 4 — Driver app visual reskin (DRV-UI-RD-NNN)`
  (lines 484–516 at packet write), with cross-cutting gates at
  583–600
- `apps/driver-app/app/index.tsx` (the entry redirect — should stay
  a redirect)
- `apps/driver-app/app/onboarding.tsx` (the screen being reskinned;
  authoritative for the three-state shell at line 1188–1545+)
- `apps/driver-app/lib/driver-workspace-cockpit.ts`
  (`summarizeWorkspaceTasks`, `isOwnedUnifiedTask`,
  `hasUnifiedTaskSyncIssue`, `buildFallbackUnifiedDriverTaskView` —
  the helper signatures the cockpit relies on)
- `apps/driver-app/lib/driver-identity-bootstrap.ts` (provisioning
  flow internals — out of scope; reviewer audits that no edits leak
  in)
- `apps/driver-app/lib/driver-identity-routing.ts` (out of scope —
  reviewer audits that no edits leak in)
- `apps/driver-app/lib/driver-location-heartbeat.ts` (out of scope —
  reviewer audits that no edits leak in)
- `apps/driver-app/lib/api-client.ts` (provisioning + presence +
  shift endpoints — out of scope; reviewer audits that no behavior
  changes)
- `apps/driver-app/lib/operational-labels.ts` (zhTW status copy)
- `apps/driver-app/components/ui/` (DRV-MAT primitives the cockpit
  imports — `AppScreen`, `ActionButton`, `AuthorityBanner`,
  `ErrorBanner`, `FormField`, `PlatformBadge`, `StatusChip`,
  `tokens`)
- `apps/driver-app/components/ui-rn/` (DRV-UI-RD-001 primitives
  layer — `theme.ts` cross-stack token bridge — reviewer should be
  able to read `theme.ts` and confirm the parent diff did not
  bypass the bridge)
- `packages/ui-tokens/src/colors.ts`,
  `packages/ui-tokens/src/status.ts`,
  `packages/ui-tokens/src/density.ts` (upstream token + status
  bundle)
- `docs/05-ui/drts-design-canvas/driver-screens-1.jsx`
  (`ScreenProvisioning` at 64–135, `ScreenWorkspace` variants at
  154–262 / 289–406 — frozen design-canvas references)
- `docs/05-ui/drts-design-canvas/DRTS Driver App.html` (canvas
  iframe entries the manual screenshot gate compares against)

Reviewer-focused implementation checkpoints, derived from the parent
planning ref:

- The three cockpit shell states (Loading → Unprovisioned → Degraded
  → Cockpit) must each render distinguishable surface visuals — a
  reviewer flipping between `provisioned=false`, `flagsOk=false`,
  `identityOk=false`, and the happy cockpit path should never see
  two shell states paint identically (the degraded surface
  especially must read as recoverable, not as permanent failure).
- The variant-A vs variant-B Workspace decision must be a single
  variant — landing both is a guardrail violation.
- The warning-callout stack (six predicates) must keep firing on
  the same product-state predicates after the reskin; collapsing
  multiple banners into one or hiding any branch is a regression.
- The provisioning flow (registration form, primary action, dev
  override chip, error banner) must not change behavior — the
  reskin restyles the chrome, not the state machine.

---

## 6. Sidecar Acceptance Checklist

Mirrors `ai-status.json -> DRV-UI-RD-002-SIDECAR-ACCEPTANCE.acceptance`
(stable across cycles) plus two derived items the sidecar owner
self-verifies before each handoff. The live cycle position
(`in_progress` / `review` / `review_approved` / `done`) is in
`ai-status.json -> DRV-UI-RD-002-SIDECAR-ACCEPTANCE.status`; cycle
history is in `ai-activity-log.jsonl` filtered on this id. This
packet does not snapshot the live status (see §2).

The first four boxes describe properties of the packet content, which
hold across cycles once they hold. The fifth box describes the
handoff transition; it resets to `[ ]` at the start of each cycle —
i.e., on the initial owner claim and again every time the reviewer
runs `scripts/ai-status.sh reopen` to send the sidecar back for
revision. It lands as `[x]` once the sidecar reaches
`review_approved` and the owner records `done`.

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Keep the packet scoped to acceptance framing, dependency
      mapping, and reviewer support.
- [x] Keep the dependency map aligned with current machine truth.
- [ ] Hand off the packet to the assigned reviewer for the current
      cycle (executed via `scripts/ai-status.sh handoff
    DRV-UI-RD-002-SIDECAR-ACCEPTANCE Codex2 …` after the packet
      revisions for this cycle land in the working tree). At
      reviewer `approve`, the sidecar moves to `review_approved`;
      at owner `done`, the sidecar uses `NO_COMMIT_REQUIRED=1` per
      L0 §5 because `task_class=sidecar` and
      `mutates_canonical=false`.

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
`DRV-UI-RD-002`, which still needs to go through its own backlog →
todo → in_progress → review → review_approved → done lifecycle under
owner `Codex2` and reviewer `Codex`):

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh approve DRV-UI-RD-002-SIDECAR-ACCEPTANCE \
  "Acceptance packet aligned with current machine truth: parent DRV-UI-RD-002 owner=Codex2 reviewer=Codex status=backlog (last_update 2026-05-10T10:41:44Z, parent not yet claimed); sidecar owner=Claude2 reviewer=Codex2; depends_on (DRV-UI-RD-001 done at commit 5db92c8) correct; DRV-UI-RD-009 is the formal downstream depends_on consumer; section 4.A two-route mapping (ScreenProvisioning ↔ onboarding.tsx unprovisioned branch 1193–1245, ScreenWorkspace variant A or B ↔ cockpit branch 1299–1545+) and three-state shell ordering (Loading → Unprovisioned → Degraded → Cockpit) anchored to onboarding.tsx; section 4.B provisioning-flow guardrail anchored on planning-ref line 513 with explicit no-touch list (initializeDriverIdentity / isDriverIdentityProvisioned / getDriverIdentityIssue / registerDriverDevice / hasDriverDevOverride / driver-identity-bootstrap.ts / driver-identity-routing.ts / api-client.ts provisioning exports); section 4.C six warning-callout predicates and EMC-W1-002 degraded-state branch enumerated with line anchors; section 4.D cross-stack token discipline cites the existing tokens.colors.* usage at onboarding.tsx:163–180; section 4.E build gate correctly describes pnpm --filter @drts/driver-app build semantics — apps/driver-app/package.json defines build=tsc --noEmit AND prebuild=expo prebuild, so the gate runs the npm prebuild lifecycle first and regenerates native scaffolds (creates untracked apps/driver-app/ios/, may rewrite tracked apps/driver-app/android/) before tsc runs; the gate is NOT output-identical to typecheck; cleanup expectation captured (parent owner Codex2 reverts prebuild side-effects before commit, reviewer Codex re-verifies on review_approved re-run, handoff note records `build (expo prebuild + tsc --noEmit) PASS, prebuild side-effects reverted` rather than just `build PASS`); section 4.E Storybook story render gate captures the Expo / RN no-@drts/ui-web caveat with two acceptable evidence shapes; section 4.E Expo Android emulator gate carries forward the DRV-UI-RD-001 environment-constraint pattern; section 4.H commit trailers updated to LLM-Agent=Codex2 / Reviewer=Codex; A/B variants 不實作 guardrail anchored on planning-ref line 514; section 6 reframes the handoff item as resetting to [ ] each reopen cycle and the live cycle position is anchored on ai-status.json status; reviewer evidence anchors include design-canvas references at frozen paths; no canonical-truth or apps/driver-app/* runtime files were edited."
```

Reopen if drift is found instead:

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh reopen DRV-UI-RD-002-SIDECAR-ACCEPTANCE \
  "packet needs revision: [specify machine-truth drift vs ai-status.json -> DRV-UI-RD-002, dependency-map error, missing acceptance gate, provisioning-flow guardrail misstatement, A/B variant guardrail misstatement, Wave 4 guardrail boundary error, or support-scope violation]"
```

Note: `reopen` of this sidecar must be limited to sidecar-document
accuracy; it is not a mechanism for litigating parent design choices.
If the planning ref itself needs change, that is a `DRV-UI-RD-002`
parent-task or workbreakdown-revision decision, not a sidecar action.
If the parent task transitions while this sidecar is in `review`
(e.g., parent moves from `backlog` to `in_progress` or `review`), the
reviewer should treat that as expected — this packet is
forward-looking and intentionally does not snapshot transient parent
status (see §2).

---

## 8. Closeout Note

This sidecar is `task_class=sidecar` with `mutates_canonical=false`,
so per `AI_COLLABORATION_GUIDE.md` §5 commit evidence rule, owner
closeout (`Claude2` → `done`) may use `NO_COMMIT_REQUIRED=1` after
sidecar approval. The parent task `DRV-UI-RD-002` is **not** a
sidecar — it is a canonical implementation slice that, when
finalized, must go through the full local-commit + push + done
sequence with `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` /
`PUSH_BRANCH` recorded. Nothing in this packet authorizes the
parent owner to skip that sequence, nothing in this packet authorizes
any change to L1 / L2 truth, the planning ref, the contracts bundle,
the `@drts/ui-tokens` source, the location heartbeat, the
provisioning-flow internals (`driver-identity-bootstrap.ts`,
`driver-identity-routing.ts`, `api-client.ts` provisioning exports),
the `summarizeWorkspaceTasks` / `isOwnedUnifiedTask` /
`hasUnifiedTaskSyncIssue` / `buildFallbackUnifiedDriverTaskView`
helper signatures, or the design canvas, and nothing in this packet
pre-approves the parent diff — the parent reviewer (`Codex` at
packet write) remains the sole approver of `DRV-UI-RD-002`.
