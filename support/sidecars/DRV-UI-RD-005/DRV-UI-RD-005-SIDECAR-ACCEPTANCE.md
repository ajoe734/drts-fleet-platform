# DRV-UI-RD-005 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DRV-UI-RD-005` — Reskin Platform Presence
**Parent Owner:** `Codex2` (per `ai-status.json -> DRV-UI-RD-005.owner`)
**Parent Reviewer:** `Codex` (per `ai-status.json -> DRV-UI-RD-005.reviewer`)
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, the planning ref, runtime behavior, the parent's
machine-truth fields, or any L1/L2 product surface. For the live
machine-truth status of this sidecar row, read
`ai-status.json -> DRV-UI-RD-005-SIDECAR-ACCEPTANCE.status` directly;
this packet does not snapshot it.

This packet is the forward-looking acceptance map for parent
`DRV-UI-RD-005`. At packet write the parent is `backlog` in machine
truth — the parent owner (`Codex2`) has not yet claimed the task and
no parent diff exists, so each acceptance gate below is phrased as a
property the parent diff must satisfy once the parent moves to
`in_progress`. The sidecar reviewer (`Codex2`) is the same lane as
the parent owner (`Codex2`); the sidecar review only audits packet
accuracy and does **not** approve the parent diff — only the parent
reviewer (`Codex`) may approve `DRV-UI-RD-005`. This packet does not
pre-approve any future parent diff.

---

## 1. Scope Boundary

In scope:

- Translate the parent task's `acceptance` field, the planning-ref
  Wave 4 task line for `DRV-UI-RD-005`, and the cross-cutting
  acceptance gates into a concrete, citation-anchored acceptance
  checklist for the Platform Presence reskin (the
  `app/platform-presence.tsx` route, which backs the design
  canvas's `ScreenPlatform`).
- Pin the dependency map and confirm each upstream slice is `done`
  in machine truth.
- Record the formal downstream tasks that depend on
  `DRV-UI-RD-005` so reviewer attention during parent finalize can
  correctly weigh blast-radius risk (Wave 4 driver closeout packet,
  sibling reskins whose visual vocabulary should align).
- Preserve a reviewer-handoff command block the assigned sidecar
  reviewer (`Codex2`) can run after this packet is written.

Out of scope:

- editing L1 / L2 product truth (`phase1_*`, contracts bundle), the
  planning-ref workbreakdown doc, or the parent task's machine-truth
  fields (`ai-status.json -> DRV-UI-RD-005`)
- editing `apps/driver-app/app/platform-presence.tsx` or any other
  parent-write-scope file under `apps/driver-app/`
- pre-running the parent's acceptance commands, opening a
  parent-scoped commit, or altering parent ownership / reviewership
- predicting the specific shape of the parent diff before the parent
  owner finalizes it
- approving DRV-UI-RD-005 itself (only `Codex` may do that on the
  parent row, as the live parent reviewer)
- altering platform-presence contract semantics
  (`PlatformPresenceRecord`, `PlatformPresenceSummary`,
  `PlatformPresenceAdapterStatusRecord`, `PLATFORM_CODE_REGISTRY` in
  `@drts/contracts`, and the driver-app callers
  `getPlatformPresence`, `setPlatformOnline`, `setPlatformOffline`
  in `apps/driver-app/lib/api-client.ts`) — the planning-ref Wave 4
  guardrail forbids changing backend / provisioning / heartbeat
  behavior, so these stay read-only context for this slice
- altering `assessPlatformHealth` /
  `getPlatformHealthSeverity` health-assessment semantics in
  `apps/driver-app/components/platform-status-card.tsx`
  (visual-only tweaks inside the file are fine but the exported
  helper signatures must remain stable so other screens keep
  typechecking)

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> DRV-UI-RD-005-SIDECAR-ACCEPTANCE`

Persistent fields:

- owner=`Claude2`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`DRV-UI-RD-005`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on: `DRV-UI-RD-001` (mirrors the parent's dependency set)
- artifacts:
  `support/sidecars/DRV-UI-RD-005/DRV-UI-RD-005-SIDECAR-ACCEPTANCE.md`
  (this file)
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Live status (read directly from machine truth, not from this packet):

- The current value of
  `ai-status.json -> DRV-UI-RD-005-SIDECAR-ACCEPTANCE.status` is
  the authoritative present state of this sidecar. This packet
  intentionally does not snapshot the live status — any such
  snapshot becomes false the moment the sidecar transitions (e.g.,
  between owner handoff and reviewer read, or between approve and
  done). For the lifecycle history of this sidecar, see
  `ai-activity-log.jsonl` filtered on
  `DRV-UI-RD-005-SIDECAR-ACCEPTANCE`.

### Parent — `ai-status.json -> DRV-UI-RD-005`

- id=`DRV-UI-RD-005`
- title=`Reskin Platform Presence`
- summary_zh=`app/platform-presence.tsx 對齊 ScreenPlatform。`
- owner=`Codex2`, reviewer=`Codex` (per the second `assign` event
  at `2026-05-10T10:41:44Z` in `ai-activity-log.jsonl`; the
  original `2026-05-10T06:31:45Z` event assigned to `Claude2` with
  reviewer `Codex2` but was superseded)
- status=`backlog` (per snapshot at packet write,
  `last_update=2026-05-10T10:41:44Z`); the parent has not yet been
  claimed by `Codex2` and no parent diff exists — each gate in §4
  is a forward-looking property the eventual parent diff must
  satisfy.
  - For the live cycle position of the parent, read
    `ai-status.json -> DRV-UI-RD-005.status` directly; this packet
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
(`DRV-UI-RD-002-SIDECAR-ACCEPTANCE`) use the same pattern; the
parent diff is still approved by the live parent reviewer
(`Codex`), not by the sidecar reviewer.

### Authoritative source documents

- L1 / L2 product truth — platform-presence semantics that the
  reskin must preserve through every visual change:
  - `phase1_prd_detailed_v1.md` (forwarded vs owned dispatch
    authority, platform reauth + token expiry semantics, degraded
    state handling)
  - `phase1_service_contracts_v1.md`
    (`PlatformPresenceRecord`, `PlatformPresenceSummary`,
    `PlatformPresenceAdapterStatusRecord`,
    `PLATFORM_CODE_REGISTRY` — the typed surfaces the screen
    reads)
- Planning ref — parent slice spec:
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`,
    section `## Wave 4 — Driver app visual reskin (DRV-UI-RD-NNN)`
    lines 484–516, with the parent's task line at 496:
    `DRV-UI-RD-005 Reskin Platform Presence (app/platform-presence.tsx)`.
  - Cross-cutting acceptance gates lines 583–600 (typecheck, lint,
    build, test, Storybook, reviewer review_notes_zh, commit hash).
  - Wave 4 dependency line 509: `Depends on: Wave 1 (TOK-UI-001)。
可與 Wave 3 平行` — `DRV-UI-RD-005` sits on the same upstream
    chain as the rest of Wave 4 driver reskins.
  - Wave 4 guardrails lines 511–515 — backend / location heartbeat /
    provisioning flow may not change; A/B variants do not ship
    (the canvas's `ScreenPlatform` only exposes a single variant
    via the `variant='A'` default in
    `docs/05-ui/drts-design-canvas/driver-screens-3.jsx:4`, so the
    A/B-pick guardrail collapses to "ship the canvas paint" for
    this slice); existing handling that is stronger than the mock
    (forwarded chip, reauth banner, eligibility + adapter-status
    surfacing) may not be downgraded.
- Existing platform-presence surface (read-only context for the
  sidecar; the parent owner edits these files, not this sidecar):
  - `apps/driver-app/app/platform-presence.tsx` (370 lines at
    packet write — renders three top-level branches: loading
    spinner at lines 129–136, unprovisioned `EmptyState` at lines
    138–148, and the populated list at lines 182–289 with
    summary card, error banner, sync-notes card, empty-state
    card, per-platform `PlatformStatusCard`, and bottom spacer).
  - `apps/driver-app/components/platform-status-card.tsx`
    (declares `PlatformStatusCard` + `assessPlatformHealth` +
    `getPlatformHealthSeverity` + `PlatformStatusAction` —
    cockpit-internal health summarization used here; visual-only
    tweaks inside the file are fine but the exported helper
    signatures must remain stable).
  - `apps/driver-app/lib/api-client.ts` (declares
    `getDriverClient`, `isDriverIdentityProvisioned`,
    `getPlatformPresence`, `setPlatformOnline`,
    `setPlatformOffline` — out of scope per Wave 4 guardrail
    line 513; reviewer audits that no behavior changes leak in).
  - `apps/driver-app/components/ui/*` (existing primitives such
    as `ActionButton`, `EmptyState`, `ErrorBanner`, `PageHeader`,
    `StatusChip`, `Tokens` — already imported by the screen).
  - `apps/driver-app/components/ui-rn/*` (the new RN primitives
    layer landed by `DRV-UI-RD-001`; the reskin should pull from
    this layer per the planning-ref Wave 4 intro lines 486–487,
    "driver-app 是 Expo / React Native，不能 import
    @drts/ui-web，只能用 @drts/ui-tokens").
- Design canvas paint reference (read-only and frozen — listed in
  cross-cutting "禁止" rule line 597, so this sidecar and the
  parent diff both leave it untouched):
  - `docs/05-ui/drts-design-canvas/driver-screens-3.jsx:4-44`
    (`ScreenPlatform`: 24px header, 13px subtitle "3 個平台 ·
    2 上線 · 1 需處理", three top-row KPIs `可接單 / 今日完成 /
需動作`, per-platform `PlatformCard` with reauth banner, and
    the bottom info card explaining online/offline semantics).
  - `docs/05-ui/drts-design-canvas/driver-screens-3.jsx:46+`
    (`PlatformCard` paint: 44×44 mono code chip toned by
    `forwardedBg/ownedBg`, name + 外部 chip, status-dot + status
    text + last-sync mono timestamp, right-side `Switch`, optional
    bottom reauth banner).

---

## 3. Dependency Map

### Formal upstream dependencies

| Upstream        | Status (read live)                                                                                                                                       | Why it matters for DRV-UI-RD-005                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-001` | `done` (commit `5db92c8312953f584c0ddb51b366ea177b78b978`, push `origin/feat/claude2-ui-redesign-foundation`, `commit_recorded_at=2026-05-10T13:51:12Z`) | Wired `@drts/ui-tokens` into the driver app and stood up the RN-side primitives layer at `apps/driver-app/components/ui-rn/`. The Platform Presence reskin pulls its visual vocabulary from those primitives (`AppText`, `Surface`, `Badge`, `ForwardedStatusBadge`, etc.) plus the existing `components/ui/` layer; without `DRV-UI-RD-001` `done`, no token surface to reskin against. |

The Wave 4 driver reskin chain transitively depends on
`TOK-UI-001` (the `@drts/ui-tokens` package itself) through
`DRV-UI-RD-001`; the planning ref line 509 records this as the only
formal Wave-level upstream. `TOK-UI-001` is read live; this packet
does not snapshot it because the formal blocker for this row is
`DRV-UI-RD-001`.

### Non-formal but spec-relevant upstream context

These are not `depends_on` rows but they constrain the reskin shape:

- `phase1_service_contracts_v1.md` — `PlatformPresenceRecord`
  shape (status, eligibility, forwarded flag, reauth flag, token
  expiry, last-sync timestamp), `PlatformPresenceSummary` shape
  (presences + adapterStatuses + notes), `PLATFORM_CODE_REGISTRY`
  (display-name lookup). The reskin must continue rendering the
  same fields the canvas paints, even if visual treatment shifts.
- `phase1_prd_detailed_v1.md` — forwarded vs owned authority
  display rules, reauth-required handling, eligibility blocking
  semantics. The canvas's `forwarded` chip and `reauth` banner
  encode product policy, not just paint.
- Sibling Wave 4 driver reskin slices currently in flight or
  recently closed (`DRV-UI-RD-002` Workspace cockpit,
  `DRV-UI-RD-003` Inbox, `DRV-UI-RD-004` Trip): the reskin's
  visual vocabulary (header sizing, KPI strip, card border /
  banner toning) should match siblings so the closeout packet
  `DRV-UI-RD-009` can confirm cross-screen visual parity without
  re-litigating tokens.

### Formal downstream dependents

| Downstream                                                                 | Depends on `DRV-UI-RD-005` because                                                                              | Risk if `DRV-UI-RD-005` diff drifts                                                                                                                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-009` (Wave 4 driver closeout packet, per planning-ref line 500) | The closeout packet enumerates every Wave 4 driver reskin slice and asserts cross-screen visual + token parity. | If Platform Presence diverges from sibling reskins (e.g. different header style, different KPI strip toning), the closeout packet must either flag the divergence or be rewritten. |

### Ordering guidance vs. formal blockers

`DRV-UI-RD-005` is not formally blocked by sibling Wave 4 driver
reskins, only by `DRV-UI-RD-001`. The planning-ref Wave 4 section
treats all reskin slices as siblings that can run in any order once
`DRV-UI-RD-001` is `done`. This packet does not redefine the
blocker set; it only records the ordering guidance that the
closeout packet `DRV-UI-RD-009` will rely on visual parity across
siblings.

---

## 4. Acceptance Checklist

Each item is a forward-looking property the parent diff must
satisfy at parent-finalize time. The sidecar review only audits
that this checklist exists and points at the right anchors; it
does not pre-verify the parent diff.

### A. Three render branches still render `[REQUIRED]`

The parent diff must continue rendering all three top-level
branches of the Platform Presence screen without regressing their
data flow:

1. **Loading branch** — `loading === true` during the initial
   `loadPresence()` call (current implementation at
   `apps/driver-app/app/platform-presence.tsx:129-136`).
   Acceptance: the reskin's loading paint renders an indeterminate
   indicator + zhTW hint text, and the screen does not crash if
   `summary` is still `null`.
2. **Unprovisioned branch** — `isProvisioned === false` per
   `isDriverIdentityProvisioned()` (lines 138–148). Acceptance:
   the reskin renders an `EmptyState`-equivalent with the
   "裝置尚未配置" copy (or visually-aligned replacement) so the
   driver knows the device cannot yet show platform health.
3. **Populated list branch** — `summary` is non-null and
   `presences.length` can be zero, one, or many (lines 182–289).
   Acceptance:
   - The header zone shows screen title, subtitle ("已連接 N
     個平台" or canvas-aligned wording), and the three-KPI summary
     (`可接單`, `需處理`, `已阻塞` — current implementation —
     or the canvas's `可接單 / 今日完成 / 需動作` triple; either
     KPI triple is acceptable as long as the canvas's `tone`
     spectrum is honored).
   - Per-platform `PlatformStatusCard` continues to render reauth
     and toggle actions; tones (`primary`, `danger`, `warning`,
     `neutral`) come from the new token surface, not hard-coded
     hex.
   - The empty-state branch (presences.length === 0) renders a
     "尚未連接任何平台" prompt (or canvas-aligned replacement)
     with a primary action that routes to `/settings`.
   - The sync-notes card (`summary.notes`) and the error banner
     continue rendering when their state is non-empty.

### B. Forwarded + reauth + eligibility surfacing is not downgraded `[REQUIRED]`

Per the Wave 4 guardrail "既有 forwarded sync_failed 處理邏輯比
mock 更強，不可降級" (planning-ref line 515) and the canvas's
explicit reauth banner / forwarded chip:

- The reskin must continue surfacing `record.forwarded` distinctly
  from owned platforms — the canvas paints a `外部` chip + a toned
  44×44 code chip; the reskin may use the new RN primitive
  `ForwardedStatusBadge` or the existing `PlatformBadge`, but the
  distinction must remain visible at a glance.
- The reskin must continue surfacing `record.reauthRequired`
  (the current `handleReauth` flow at lines 97–127) with a
  visually-distinct treatment (toned border + bottom reauth
  banner per canvas line 77+, or equivalent token-level alert
  paint).
- The reskin must continue surfacing `record.eligibility` and the
  `adapterStatus` map (current implementation feeds them into
  `assessPlatformHealth` lines 154–170; downstream the
  `PlatformStatusCard` paints eligibility + adapter status). Token
  - paint changes are fine; dropping the field surfaces is not.
- The reskin must continue calling `setPlatformOnline` /
  `setPlatformOffline` / `setPlatformOnline({tokenExpiresAt:null})`
  with unchanged argument shapes; the toggle and reauth actions are
  the screen's only mutating calls and they are out-of-scope per
  the Wave 4 backend-freeze guardrail.

### C. zhTW copy parity `[REQUIRED]`

The reskin must keep zhTW operational copy in parity with the
existing surface. Specifically:

- Top-line wording: title ("平台健康中心" or canvas-aligned
  "平台連線" — either is acceptable as long as the closeout
  packet's cross-screen header vocabulary stays consistent;
  reviewer is the arbiter).
- Action labels: "切換上線" / "切換離線" / "重新驗證" / "查看
  綁定" / "前往設定管理綁定" / "前往設定" — wording may be
  re-balanced to match siblings, but the action set may not
  shrink.
- Alert dialog wording for failed toggles / reauth ("無法更新平
  台狀態", "無法重新驗證平台", "已送出重新驗證", and the
  confirmation prompt "要為「<code>」重新啟動平台驗證嗎？")
  must remain user-visible. Token paint may change; the
  user-actionable wording may not be dropped.
- The sync-notes card title "同步說明" and the empty-state
  copy ("尚未連接任何平台", "先到設定完成平台帳號綁定...")
  may be re-styled but not removed.

### D. Cross-stack token discipline `[REQUIRED]`

Per the Wave 4 intro (planning-ref lines 486–487): the driver app
is Expo / React Native and may not import `@drts/ui-web`. The
reskin must:

- Pull visual tokens from `@drts/ui-tokens` (via the existing
  `Tokens` re-export at `apps/driver-app/components/ui/tokens.ts`
  or via the new `ui-rn` theme bridge at
  `apps/driver-app/components/ui-rn/theme.ts`).
- Avoid introducing any `import` from `@drts/ui-web` or its
  subpaths anywhere in the driver-app tree.
- Avoid hard-coded hex / rgb / rgba color literals in the
  reskinned file — every color must resolve through the token
  surface so the closeout packet `DRV-UI-RD-009` can audit
  per-screen token usage in one sweep.

### E. Recorded acceptance commands `[REQUIRED]`

Per the parent's `acceptance` field and the cross-cutting Wave 4
gates (planning-ref lines 583–593):

1. `pnpm --filter @drts/driver-app typecheck` — must pass after
   the reskin.
2. `pnpm --filter @drts/driver-app lint` — must pass after the
   reskin.
3. `pnpm --filter @drts/driver-app build` — must pass after the
   reskin. (Note for the parent owner: per
   `apps/driver-app/package.json`, `build=tsc --noEmit` is the
   driver-app build entry, and `prebuild=expo prebuild` may
   regenerate native scaffolds under `apps/driver-app/ios/` /
   `apps/driver-app/android/` as part of the npm `prebuild`
   lifecycle. Sibling DRV-UI-RD-004 reviewer reopen events
   documented this behavior; do not be surprised by untracked
   `apps/driver-app/ios/` after running `build`.)
4. `pnpm --filter @drts/driver-app test` — must pass (or
   `--passWithNoTests` is acceptable per cross-cutting gate line
   590).
5. Storybook render: if any Platform Presence stories land in
   `packages/ui-web/src/` or under a driver-app story bridge, they
   must continue to render. At packet write no such stories exist
   (`platform-presence`-keyed stories are absent from
   `packages/ui-web/src/`); the parent owner may decide whether
   to ship a new story alongside the reskin or to rely on the
   sibling closeout packet to record visual parity.
6. Reviewer `review_notes_zh` on `DRV-UI-RD-005` must record
   either visual-pass confirmation or a diff list per the
   cross-cutting gate line 592.

### F. Translation parity `[DERIVED]`

The reskin must not introduce English-only copy in user-facing
positions; the canvas paints every visible string in zhTW and the
existing implementation matches that. If new visual affordances
are added (e.g. a "今日完成" KPI tile per the canvas), they must
ship with zhTW copy.

### G. Scope containment `[DERIVED]`

The parent diff must stay within `apps/driver-app/` per the parent
`artifacts` array. Specifically, the parent diff may touch:

- `apps/driver-app/app/platform-presence.tsx` (primary surface)
- `apps/driver-app/components/platform-status-card.tsx`
  (visual-only tweaks; helper signatures must remain stable)
- `apps/driver-app/components/ui/*` (additive primitive tweaks
  only; existing exports must remain stable)
- `apps/driver-app/components/ui-rn/*` (additive primitive
  tweaks only; existing exports must remain stable)

The parent diff must not touch:

- `apps/driver-app/lib/api-client.ts` (Wave 4 backend-freeze)
- `apps/driver-app/lib/driver-location-heartbeat.ts` (Wave 4
  heartbeat-freeze)
- `apps/driver-app/lib/driver-identity-bootstrap.ts` (Wave 4
  provisioning-freeze)
- `packages/contracts/src/platform-presence*` (Wave 4 contract-freeze)
- `docs/05-ui/drts-design-canvas/*` (frozen per cross-cutting
  "禁止" rule line 597)

### H. Commit evidence at parent finalize `[REQUIRED]`

Per `AI_COLLABORATION_GUIDE.md` §5 commit evidence rule for
canonical implementation tasks, the parent owner's finalize must
record:

- a local task-scoped commit whose subject includes `DRV-UI-RD-005`
- commit body trailers:
  - `LLM-Agent: Codex2` (the live parent owner at packet write;
    must reflect live owner at finalize time)
  - `Task-ID: DRV-UI-RD-005`
  - `Reviewer: Codex` (the live parent reviewer at packet write;
    must reflect live reviewer at finalize time)
- a normal non-force push, with `PUSH_REMOTE` and `PUSH_BRANCH`
  recorded on the parent row at `done` time.

The sidecar itself uses `NO_COMMIT_REQUIRED=1` at its own `done`
because it is a sidecar acceptance packet (per §5 "sidecar or
explicit non-canonical closeout tasks" rule).

---

## 5. Reviewer Evidence Anchors

For the sidecar review (`Codex2` reviewing this packet), the
following anchors are the primary audit surfaces:

- **Packet scope vs. parent scope**:
  `support/sidecars/DRV-UI-RD-005/DRV-UI-RD-005-SIDECAR-ACCEPTANCE.md`
  (this file) vs. `ai-status.json -> DRV-UI-RD-005.acceptance` and
  `apps/driver-app/app/platform-presence.tsx`.
- **Dependency map accuracy**:
  `ai-status.json -> DRV-UI-RD-005.depends_on` vs. §3 of this
  packet, plus the live `done` state of `DRV-UI-RD-001` in
  `ai-status.json` (with commit hash `5db92c8...`).
- **Planning-ref citations**:
  `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` lines
  484–516 (Wave 4 section), 583–600 (cross-cutting gates), 509
  (Wave dependency), 511–515 (Wave guardrails).
- **Design canvas citations**:
  `docs/05-ui/drts-design-canvas/driver-screens-3.jsx:4-44`
  (`ScreenPlatform`), `:46-94+` (`PlatformCard`).
- **Read-only context cross-checks**: the parent-write-scope files
  enumerated in §4.G are not edited by this packet.
- **Same-lane handoff configuration**: at packet write the sidecar
  reviewer (`Codex2`) is the same lane as the parent owner
  (`Codex2`). Reviewer audits packet-only; the parent diff is
  reviewed by `Codex`.

For the parent review (`Codex` reviewing the eventual
`DRV-UI-RD-005` diff — out of scope for this sidecar but
recorded here so the parent reviewer can reuse the anchors):

- Acceptance §4.A–§4.G against the parent diff.
- Commit trailers per §4.H.
- The Wave 4 backend / heartbeat / provisioning freeze (parent
  reviewer audits that the parent diff does not import or modify
  out-of-scope files).

---

## 6. Sidecar Acceptance Checklist

Per the sidecar's own `acceptance` field on `ai-status.json`:

- [x] **Create support artifacts only** — this packet is the only
      artifact created by the sidecar; the parent-write-scope files
      enumerated in §4.G are not edited.
- [x] **Do not edit canonical truth** — no L1 / L2 product truth
      files (`phase1_*`, contracts bundle, planning ref, design canvas)
      are edited; only the new sidecar artifact under
      `support/sidecars/DRV-UI-RD-005/` is written.
- [x] **Hand off the packet to the assigned reviewer** — the
      sidecar owner (`Claude2`) hands off to the sidecar reviewer
      (`Codex2`) via the `handoff` command in §7 below.

Live cycle state for this sidecar (read from
`ai-status.json -> DRV-UI-RD-005-SIDECAR-ACCEPTANCE.status`, not
from this packet) advances as:

- `backlog` → `in_progress` (sidecar owner start) →
  `review` (sidecar owner handoff to `Codex2`) →
  `review_approved` (sidecar reviewer approve) →
  `done` (sidecar owner closeout with `NO_COMMIT_REQUIRED=1`).

---

## 7. Reviewer Handoff Commands

After the sidecar owner writes this packet and runs the handoff,
the sidecar reviewer (`Codex2`) can audit with:

```bash
# Open the packet
sed -n '1,80p' support/sidecars/DRV-UI-RD-005/DRV-UI-RD-005-SIDECAR-ACCEPTANCE.md

# Confirm parent + sidecar machine truth anchors
python3 - <<'PY'
import json
d = json.load(open('ai-status.json'))
for t in d['tasks']:
    if t['id'] in ('DRV-UI-RD-005', 'DRV-UI-RD-005-SIDECAR-ACCEPTANCE', 'DRV-UI-RD-001'):
        print(t['id'], t.get('status'), 'owner=', t.get('owner'),
              'reviewer=', t.get('reviewer'),
              'last_update=', t.get('last_update'))
PY

# Confirm upstream done state
grep -E '"DRV-UI-RD-001"' ai-activity-log.jsonl | tail -5

# Confirm planning-ref citations resolve
sed -n '484,516p' docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md
sed -n '583,600p' docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md

# Confirm design-canvas anchors resolve
sed -n '1,80p' docs/05-ui/drts-design-canvas/driver-screens-3.jsx
```

Approval command (sidecar reviewer, after audit passes):

```bash
AI_NAME=Codex2 REVIEW_NOTES_ZH="DRV-UI-RD-005 sidecar acceptance packet 內容核對通過||scope boundary、dependency map、acceptance checklist、reviewer evidence anchors 皆對齊 ai-status.json + planning ref + design canvas" \
  scripts/ai-status.sh approve DRV-UI-RD-005-SIDECAR-ACCEPTANCE \
  "Sidecar acceptance packet reviewed; support-only scope and dependency map align with machine truth"
```

Reopen command (sidecar reviewer, if audit fails):

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen DRV-UI-RD-005-SIDECAR-ACCEPTANCE \
  "<具體不通過原因 — 例如 dependency map 與 ai-status.json 不一致、acceptance 條目漏列、scope boundary 與 parent artifacts 衝突>"
```

---

## 8. Closeout Note

This sidecar is a support-only acceptance packet; per
`AI_COLLABORATION_GUIDE.md` §5 sidecar rule, the sidecar's own
`done` may use `NO_COMMIT_REQUIRED=1`. The sidecar owner's
closeout after `review_approved`:

```bash
AI_NAME=Claude2 NO_COMMIT_REQUIRED=1 \
  scripts/ai-status.sh done DRV-UI-RD-005-SIDECAR-ACCEPTANCE \
  "Sidecar acceptance packet approved by Codex2; closed without commit per sidecar rule"
```

The parent task `DRV-UI-RD-005` continues on its own cycle —
`backlog` → `in_progress` (when `Codex2` claims) → ... → `done`
(with commit hash + push evidence per §4.H) — independent of
this sidecar's closeout.
