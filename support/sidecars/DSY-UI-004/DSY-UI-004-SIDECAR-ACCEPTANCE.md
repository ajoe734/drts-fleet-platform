# DSY-UI-004 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DSY-UI-004` — Density + dark mode toggle support
**Parent Owner:** `Codex2` (per `ai-status.json -> DSY-UI-004.owner`)
**Parent Reviewer:** `Codex` (per `ai-status.json -> DSY-UI-004.reviewer`)
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-10` (UTC) — initial draft
**Last machine-truth refresh:** `2026-05-10T15:11Z` (UTC) — snapshots in §1, §2,
§3 spec-relevant, §3 downstream, and §4 reviewer-cross-references re-pinned to
current `ai-status.json` after reviewer reopened for "dependency/status snapshot
drift remained at handoff". Re-handoff scope is sidecar document accuracy only;
no acceptance gates added or weakened, and no canonical truth touched.
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical
truth, the planning ref, runtime behavior, or any L1/L2 product surface. For the
live machine-truth status of this sidecar row, read
`ai-status.json -> DSY-UI-004-SIDECAR-ACCEPTANCE.status` directly; this packet does
not snapshot it.

This packet is the forward-looking acceptance map for parent `DSY-UI-004`. The
parent is `review` in machine truth at this refresh (`last_update=2026-05-10T15:06:54Z`)
— the parent owner (`Codex2`) has handed off the management theme provider work
on `packages/ui-web` to parent reviewer `Codex` for review. The packet exists so
that as the parent moves through review and finalize, the acceptance framing,
dependency map, and reviewer evidence anchors are already pinned to current
truth and ready to be audited against the eventual diff. The sidecar reviewer
(`Codex2`) and the parent owner (`Codex2`) are the same lane; this is a
deliberate same-lane review pattern (parent reviewer `Codex` and sidecar
reviewer `Codex2` are the cross-account review pair already used elsewhere in
the DSY-UI redesign wave). This packet does **not** pre-approve the parent diff.

---

## 1. Scope Boundary

In scope:

- Translate the parent task's `acceptance` field and the planning-ref `Work` block
  into a concrete, citation-anchored acceptance checklist.
- Pin the dependency map and confirm each upstream slice is `done` in machine
  truth.
- Record the formal downstream tasks that depend on `DSY-UI-004` so reviewer
  attention during parent finalize can correctly weigh blast-radius risk.
- Preserve a reviewer-handoff command block the assigned sidecar reviewer
  (`Codex2`) can run after this packet is written.

Out of scope:

- editing L1 / L2 product truth (`phase1_*`, contracts bundle), the planning-ref
  workbreakdown doc, or the parent task's machine-truth fields
  (`ai-status.json -> DSY-UI-004`)
- editing `packages/ui-web/src/management-theme-context.tsx`,
  `packages/ui-web/src/management-theme-context.test.tsx`,
  `packages/ui-web/src/management-theme.ts`,
  `packages/ui-web/src/management-shell.tsx`,
  `packages/ui-web/src/index.tsx`,
  `packages/ui-web/src/client.tsx`, `packages/ui-web/.storybook/**`, or any other
  parent-write-scope file
- pre-running the parent's acceptance commands, opening a parent-scoped commit,
  or altering parent ownership / reviewership
- predicting the specific shape of the parent diff before the parent owner
  finalizes it
- approving DSY-UI-004 itself (only `Codex` may do that on the parent row)

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> DSY-UI-004-SIDECAR-ACCEPTANCE`

Persistent fields:

- owner=`Claude2`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`DSY-UI-004`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on: `DSY-UI-003` (mirrors the parent's dependency set)
- artifacts: `support/sidecars/DSY-UI-004/DSY-UI-004-SIDECAR-ACCEPTANCE.md`
  (this file)
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Live status (read directly from machine truth, not from this packet):

- The current value of `ai-status.json -> DSY-UI-004-SIDECAR-ACCEPTANCE.status` is
  the authoritative present state of this sidecar. This packet intentionally does
  not snapshot the live status — any such snapshot becomes false the moment the
  sidecar transitions (e.g., between owner handoff and reviewer read, or between
  approve and done). For the lifecycle history of this sidecar, see
  `ai-activity-log.jsonl` filtered on `DSY-UI-004-SIDECAR-ACCEPTANCE`.

### Parent — `ai-status.json -> DSY-UI-004`

- id=`DSY-UI-004`
- title=`Density + dark mode toggle support`
- owner=`Codex2`, reviewer=`Codex`
- status=`review` (per snapshot at last machine-truth refresh,
  `last_update=2026-05-10T15:06:54Z`)
  - parent reviewer `Codex` is currently reviewing the handed-off diff; this
    sidecar does not gate or pre-approve that review.
- depends_on: `DSY-UI-003`
- artifacts:
  - `packages/ui-web/src/management-theme-context.tsx`
  - `packages/ui-web/src/index.tsx`
- acceptance:
  - `pnpm --filter @drts/ui-web typecheck`
  - `pnpm --filter @drts/ui-web test`
  - `Provider works in storybook environment`
- phase: `Wave 1`
- planning_ref: `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`

This packet treats `ai-status.json` as authoritative for owner / reviewer. If the
parent owner field shifts before the parent finalizes, the parent reviewer
(`Codex`) should re-confirm ownership before approving.

### Authoritative source documents

- L1 / L2 product truth — design system tone / authority / status semantics that
  the theme must preserve in dark mode:
  - `phase1_prd_detailed_v1.md` (authority semantics)
  - `phase1_service_contracts_v1.md` (no theme effect, but must not regress
    contract surfaces)
- Planning ref — parent slice spec:
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`, section
    `### \`DSY-UI-004\` Density + dark mode toggle support` (lines 269–281 at
    packet write)
- Wave-1 design dependency chain (line 614–615 of the same planning ref):
  - `DSY-UI-003 (shell redesign) → DSY-UI-004 (density / dark mode)`
- Existing theme surface (read-only context for the sidecar; the parent owner
  edits these files, not this sidecar):
  - `packages/ui-web/src/management-theme.ts` (token-level density & color-mode
    primitives — `ManagementDensity`, `ManagementMode`, `MANAGEMENT_COLOR_MODES`,
    `MANAGEMENT_SURFACE_TONE_MODES`, `densityValue`, `managementColors`,
    `managementMainShellStyle`, `managementSurfaceTone`)
  - `packages/ui-web/src/management-theme-context.tsx` (the new context,
    `ManagementThemeProvider`, `useTheme`, `useOptionalManagementTheme`)
  - `packages/ui-web/src/management-theme-context.test.tsx` (existing context
    unit test — density + dark + mode probe + ManagementShell consumer assertion)
  - `packages/ui-web/src/management-shell.tsx` (already opts into
    `useOptionalManagementTheme()` so a wrapping provider drives shell density
    and mode without requiring shell consumers to thread props)
  - `packages/ui-web/src/client.tsx` (client-only re-export surface; already
    re-exports `ManagementThemeProvider`, `useTheme`,
    `useOptionalManagementTheme`, `ManagementThemeContextValue`,
    `ManagementThemeProviderProps`)
  - `packages/ui-web/src/index.tsx` (server-safe re-exports — currently exposes
    `ManagementDensity` / `ManagementMode` types but not the client-only
    provider; the parent diff must keep the SSR boundary intact, see §4.A)
- Storybook surface (read-only context for the sidecar; the parent owner edits
  the Storybook config to wire the toolbar globals into a provider decorator):
  - `packages/ui-web/.storybook/main.ts`
  - `packages/ui-web/.storybook/preview.tsx` (already declares `density` and
    `dark` globalTypes; the decorator that pipes those globals into
    `ManagementThemeProvider` is the work item)
- Token bundle the theme depends on (read-only context):
  - `packages/ui-tokens/src/colors.ts` (light + dark variants of `OWNED`,
    `FORWARDED`, `SURFACE_ACCENTS`, `STATUS_TONES` — referenced from planning
    ref line 200)
  - `packages/ui-tokens/src/density.ts` (numeric scale — referenced from
    planning ref line 202)

---

## 3. Dependency Map

### Formal upstream dependencies

The parent's `depends_on` set is `DSY-UI-003`. It is `done` in `ai-status.json`
at packet write.

| Dep ID       | Title                                                                                            | Owner  | Reviewer | Status (truth)            | What this slice provides to DSY-UI-004                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------ | ------ | -------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DSY-UI-003` | Shell redesign — sidebar + topbar (`ManagementSidebar` / `ManagementTopbar` / `ManagementShell`) | Codex2 | Codex    | `done` (commit `36a069c`) | Provides the shell containers (`ManagementShell`, `ManagementPageStack`, `ManagementSidebar`, `ManagementTopbar`) that DSY-UI-004 must drive via the new `ManagementThemeProvider`. `ManagementShell` already opts into `useOptionalManagementTheme()` (`packages/ui-web/src/management-shell.tsx:38`, `:109`) so the provider, when wrapped above the shell, must transparently drive both density and mode without breaking unwrapped consumers. |

Dependency assertion:

- The parent's density + dark mode work is a composition / specialization layer
  on top of the existing color-mode tokens (`MANAGEMENT_COLOR_MODES`),
  density-mode primitives (`densityValue`, `MANAGEMENT_SPACING`,
  `MANAGEMENT_TYPOGRAPHY`), and the shell re-exports landed by `DSY-UI-003`. No
  upstream slice needs to reopen for parent acceptance given the current
  snapshot.
- If `DSY-UI-003` later reopens (shell prop shape changes, sidebar/topbar density
  prop signature changes), this dependency map and the parent's typecheck must
  be re-validated before the parent can finalize. `pnpm --filter @drts/ui-web
typecheck` will pick up most shape drifts in the prop wiring, but a
  semantically silent regression (e.g., shell stops calling
  `useOptionalManagementTheme`) would still need a manual sidecar-or-review
  check.
- If the upstream `@drts/ui-tokens` color-mode bundle reopens (new dark-mode
  values, new authority/status tones), the theme color tables in
  `packages/ui-web/src/management-theme.ts` may shift; the parent reviewer
  should re-confirm the dark surface fidelity but this is an upstream-token
  concern, not a DSY-UI-004 regression.

### Non-formal but spec-relevant upstream context

These tasks are referenced by the surrounding Wave 1 design wave but are **not**
in the parent's formal `depends_on`. They are listed here so the reviewer
understands what the "existing baseline" the parent must preserve actually is:

| Spec-relevant slice | Status (truth)                                                    | Why it matters to DSY-UI-004                                                                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TOK-UI-001`        | `done`                                                            | Lands the cross-stack `@drts/ui-tokens` package whose `colors.ts` provides light + dark variants for authority, surface accent, and status tones. `DSY-UI-004`'s dark mode rendering depends on those dark-mode token values being correct.                                                                  |
| `DSY-UI-001`        | `done`                                                            | Establishes `ManagementThemeProvider`-adjacent accent + tone tables in `packages/ui-web/src/management-theme.ts` (`MANAGEMENT_COLOR_MODES`, `MANAGEMENT_SURFACE_TONE_MODES`). DSY-UI-004's provider must not re-roll equivalent state — it consumes these tables.                                            |
| `DSY-UI-002`        | `done`                                                            | Lands the authority + status primitives (`AuthorityBadge`, `StatusChip`, etc.). DSY-UI-004 must not introduce a separate authority/status palette inside the new context — those primitives keep deriving their tone from the same `MANAGEMENT_SURFACE_TONE_MODES` that the new context routes mode through. |
| `SBK-UI-001`        | `done` (commit `fced012`, transitioned at `2026-05-10T14:56:13Z`) | Adds the `@drts/ui-web` Storybook scaffold (`packages/ui-web/.storybook/main.ts`, `preview.tsx`). DSY-UI-004's "Provider works in storybook environment" gate piggybacks on the toolbar globals (`density`, `dark`) that SBK-UI-001 already declared — see `packages/ui-web/.storybook/preview.tsx`.         |

These are informational anchors, not parent-acceptance gates.

### Formal downstream dependents

No task in machine truth currently lists `DSY-UI-004` in `depends_on` (verified
at this refresh). That said, the planning ref places these consumers immediately
downstream of DSY-UI-004 in dependency intent:

| Likely downstream consumer                                                   | Why it informally depends on DSY-UI-004                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SBK-UI-002`                                                                 | Stories for authority + status + shell. The "side-by-side designed/built" stories will only render correctly once `ManagementThemeProvider` is wired into Storybook so the `density` / `dark` toolbar globals actually drive the shell paint. If DSY-UI-004 lands the provider but skips the Storybook decorator, SBK-UI-002 inherits a broken toggle.                                                                                                                |
| `OPS-UI-RD-001`                                                              | Adopt new shell. Already `done` at this refresh (commit `cd10d83`, transitioned at `2026-05-10T14:57:09Z`) and consumes `ManagementShell` directly. Once `ManagementThemeProvider` ships, ops-console may opt into density / dark from a global root provider. Until DSY-UI-004 finalizes, ops-console keeps using the unwrapped shell — `ManagementShell` falls back to `density="comfortable"` / `mode="light"` via `useOptionalManagementTheme()` — which is fine. |
| Other RD waves (`OPS-UI-RD-002+`, future tenant / partner / driver consoles) | These will eventually wrap their app root in `ManagementThemeProvider`. They are out of scope for DSY-UI-004 itself, but the provider's API (controllable + uncontrolled, `setDensity` / `setDark` / `setMode` / `toggleDark`) must be stable enough not to require source-level rewrites in those consumers later.                                                                                                                                                   |

Blast-radius note for the parent reviewer (`Codex`):

- If the parent diff regresses `useOptionalManagementTheme()` (e.g., renames the
  hook, removes the optional variant, or makes the provider mandatory), every
  unwrapped consumer of `ManagementShell` — including `OPS-UI-RD-001`'s
  `ops-console-web` shell adoption already `done` (commit `cd10d83`) — will
  throw at render time, since `useTheme()` throws when no provider is mounted.
- If the parent diff hard-codes a default of `dark=true` instead of the planning
  ref's "預設不 opt-in dark mode" guardrail (line 281), every existing console
  flips to dark on next deploy. The provider's default must remain
  `defaultDensity="comfortable"` / `defaultDark=false` and that default must
  remain observable in `useTheme()` when no `density` / `dark` props are passed.
- If the parent diff changes the SSR boundary — for example, by re-exporting
  `ManagementThemeProvider` from the server-safe `index.tsx` instead of (or in
  addition to) the client-only `client.tsx` — Next.js consumers that import the
  server entry will hit a "use client" boundary error at build time. The current
  layout (`client.tsx` re-exports the provider, `index.tsx` only re-exports the
  type aliases `ManagementDensity` / `ManagementMode`) is the correct shape and
  must be preserved.
- If the parent diff teaches `ManagementThemeProvider` to write to
  `localStorage` or `document.documentElement.classList` without a controlled
  opt-in, the SSR-rendered first paint will desync from client hydration and
  every consuming console will hydrate-mismatch.

### Ordering guidance vs. formal blockers

The planning ref places `DSY-UI-004` inside Wave 1 immediately after DSY-UI-003
and before SBK-UI-002 (lines 614–620 of the planning ref). The only formal
blocker is the dependency recorded in `ai-status.json -> DSY-UI-004.depends_on`.
This sidecar does not introduce extra prerequisites beyond machine truth.

---

## 4. Acceptance Checklist

Each item below is the parent acceptance gate rephrased as a concrete,
citation-anchored check the parent owner (`Codex2`) self-verified before
handing off, and the parent reviewer (`Codex`) can audit at review time. The
parent task is `review` in machine truth at this refresh
(`last_update=2026-05-10T15:06:54Z`), so each item is now an audit anchor: it
states the property the handed-off parent diff must satisfy, against which the
parent reviewer can compare the actual diff. This packet still does not
pre-approve that diff.

Legend: `[REQUIRED]` = explicit gate from `ai-status.json -> DSY-UI-004.acceptance`
or from the planning-ref `Acceptance` block. `[DERIVED]` = unwritten but implied
by the planning ref or by the L0 / L2 collaboration rules; the parent reviewer
may treat these as informational.

### A. `<ManagementThemeProvider>` and `useTheme()` exist with the planned shape `[REQUIRED]`

Planning ref line 271–272:

> theme 加 `density: "compact" | "comfortable"` 與 `dark: boolean`，
> 經由 React context 傳遞。提供 `<ManagementThemeProvider>` 與 `useTheme()` hook。

The parent diff must satisfy:

- [ ] `packages/ui-web/src/management-theme-context.tsx` exports
      `ManagementThemeProvider`, `useTheme`, and `useOptionalManagementTheme`
      (the existing snapshot already does — the parent diff must not regress
      these symbols' names or signatures). The current snapshot defines
      `ManagementThemeContextValue` with `{ density, dark, mode, setDensity,
    setDark, setMode, toggleDark }`; reviewers should treat that as the
      stable shape unless the parent owner explicitly documents a rename in the
      handoff note.
- [ ] `useTheme()` throws when called outside a provider (current behavior at
      `packages/ui-web/src/management-theme-context.tsx:122` —
      `"useTheme must be used within a ManagementThemeProvider."`). This is the
      contract that lets consumers fail loudly when the provider is missing.
- [ ] `useOptionalManagementTheme()` returns `null` when called outside a
      provider (current behavior at
      `packages/ui-web/src/management-theme-context.tsx:130`). This is the
      contract that lets `ManagementShell` and similar primitives keep working
      without a provider, preserving the planning-ref guardrail "不影響既有未
      wrap 的頁面" (line 281).
- [ ] The client-only re-export surface in `packages/ui-web/src/client.tsx`
      keeps re-exporting `ManagementThemeProvider`, `useTheme`,
      `useOptionalManagementTheme`, `ManagementThemeContextValue`, and
      `ManagementThemeProviderProps`. The parent diff must not move these
      re-exports to the server-safe entry `packages/ui-web/src/index.tsx` (the
      file is annotated `"use client"`; moving it would break SSR consumers).
- [ ] If the parent diff adds new fields to `ManagementThemeContextValue`
      (e.g., system-preference fallback, a `colorScheme` enum that supersedes
      `dark`), the addition must be backward-compatible with the existing test
      probe (`packages/ui-web/src/management-theme-context.test.tsx`). New fields
      either layer on top of the existing `{ density, dark, mode, setDensity,
    setDark, setMode, toggleDark }` shape, or the parent owner documents the
      breaking shape change in the handoff note for the reviewer.

### B. `density: "compact" | "comfortable"` is fully wired through context `[REQUIRED]`

Planning ref line 271 (density part):

- [ ] `ManagementThemeContextValue.density` is typed `ManagementDensity` and
      sourced from `packages/ui-web/src/management-theme.ts` line 24. No new
      `"compact" | "comfortable"` literal is re-declared inside the context
      module.
- [ ] `ManagementThemeProvider` exposes both controlled (`density` prop) and
      uncontrolled (`defaultDensity` prop) modes via the existing
      `useControllableDensity` helper at lines 38–54 of
      `management-theme-context.tsx`. The default must remain `"comfortable"`
      (constant `DEFAULT_DENSITY` at line 32).
- [ ] `setDensity(density)` is exposed and updates the resolved value when
      `density` is uncontrolled, and forwards to `onDensityChange` when
      controlled (existing behavior at line 46–53). Reviewer can confirm by
      reading the handoff diff against the snapshot at packet write — no
      regression in that branching is expected.
- [ ] Density flows transparently into `ManagementShell` via
      `useOptionalManagementTheme()` (existing call at
      `packages/ui-web/src/management-shell.tsx:38`). A wrapping
      `<ManagementThemeProvider density="compact">` must change shell padding
      from `32px` to `24px` without any prop wiring on the shell itself —
      currently asserted by the test at
      `packages/ui-web/src/management-theme-context.test.tsx:30` (`padding:24px`).

### C. `dark: boolean` is fully wired through context with mode mirror `[REQUIRED]`

Planning ref line 271 (dark part):

- [ ] `ManagementThemeContextValue.dark: boolean` is exposed and defaults to
      `false` (constant `DEFAULT_DARK` at line 33 of
      `management-theme-context.tsx`). Planning ref guardrail line 281: "預設不
      opt-in dark mode".
- [ ] `ManagementThemeContextValue.mode: ManagementMode` is exposed as a
      derived value (`dark ? "dark" : "light"` at line 93) so consumers can
      switch on the existing `ManagementMode` enum without re-deriving from
      `dark` themselves. This must remain a derived property — if it becomes a
      separately settable field, divergence between `dark` and `mode` becomes
      possible and shell paint loses determinism.
- [ ] Both controlled (`dark` prop) and uncontrolled (`defaultDark` prop) modes
      are exposed via `useControllableDark` (lines 56–72). The reviewer should
      confirm that toggling `dark` via `setDark(true)` repaints the shell:
      `padding:24px;background:#020617;color:#e2e8f0` is the dark-compact
      surface signature, already asserted at
      `packages/ui-web/src/management-theme-context.test.tsx:36`–`:38`.
- [ ] `toggleDark()` is exposed (line 105–107) and behaves as an
      idempotent inversion, not as a forced setter. This is the API surface
      callers will most often use from a topbar mode switch.
- [ ] `setMode(mode)` is exposed (line 102–104) and routes `mode === "dark"`
      back into `setDark(true)`. The reviewer should confirm that setting mode
      to `"light"` calls `setDark(false)` and vice versa.

### D. `index.tsx` re-export is SSR-safe `[REQUIRED]`

`ai-status.json -> DSY-UI-004.artifacts` lists
`packages/ui-web/src/index.tsx`. The parent diff may touch this file, but it
must satisfy:

- [ ] The server-safe entry `packages/ui-web/src/index.tsx` does **not** re-export
      `ManagementThemeProvider`, `useTheme`, or `useOptionalManagementTheme`
      directly — those live in `packages/ui-web/src/client.tsx` because
      `management-theme-context.tsx` is `"use client"`. The reviewer should
      confirm `packages/ui-web/src/index.tsx` only re-exports the **types**
      `ManagementDensity` / `ManagementMode` (already at lines 39–40 of
      `index.tsx`) and any newly-needed token-level utilities — not the
      runtime client component.
- [ ] If the parent owner needs to expose new server-safe utility from
      `management-theme.ts` (e.g., a `darkModeStyle` helper), it is added to
      `packages/ui-web/src/index.tsx` alongside the existing
      `managementColors` / `managementMainShellStyle` / `managementSurfaceTone`
      block (lines 22–35), not buried inside the client module.
- [ ] The client entry `packages/ui-web/src/client.tsx` continues to be the
      canonical surface for `ManagementThemeProvider` / `useTheme` /
      `useOptionalManagementTheme` and the related types. The parent diff must
      not split these symbols across multiple modules in a way that breaks
      consumers using the existing `@drts/ui-web/client` import path.

### E. Recorded acceptance commands `[REQUIRED]`

`ai-status.json -> DSY-UI-004 -> acceptance`:

- [ ] `pnpm --filter @drts/ui-web typecheck`
  - Parent owner (`Codex2`) must run on the final pre-commit state and record
    PASS in the parent's `next` / handoff note before handoff.
  - Parent reviewer (`Codex`) re-confirms PASS at `review_approved`.
  - The sidecar does **not** re-run this command.
- [ ] `pnpm --filter @drts/ui-web test`
  - Parent owner (`Codex2`) must run and record PASS in handoff. The existing
    test file `packages/ui-web/src/management-theme-context.test.tsx` covers
    the two probe assertions: density+dark+mode propagation through `useTheme`,
    and `ManagementShell` consumption of theme defaults from context. The
    parent owner may add tests but must not delete the existing two assertions
    without a documented replacement.
- [ ] `Provider works in storybook environment`
  - The Storybook preview at `packages/ui-web/.storybook/preview.tsx` already
    declares `density` and `dark` toolbar globals (lines 4–28 at packet write).
    The parent diff must wire those globals into a Storybook decorator that
    mounts `<ManagementThemeProvider density={density} dark={dark}>` around the
    rendered story so the toolbar toggle visibly repaints stories. Because no
    visual regression tooling is in scope (planning ref line 296 — `SBK-UI-001`
    guardrail), this is a manual reviewer check: open Storybook, flip the
    toolbar, observe the shell repaint.
  - `pnpm --filter @drts/ui-web build-storybook` should still complete. The
    parent diff does not need to re-run it from the sidecar; the parent owner
    or `SBK-UI-001` reviewer (already `done` at commit `fced012`) records the
    result.

### F. Translation parity `[DERIVED]`

`DSY-UI-004` does not introduce user-visible copy directly (the toggles live in
the Storybook toolbar, which is a developer surface). However:

- [ ] If the parent diff exposes any consumer-facing toggle copy (for example,
      a `<DensityToggle>` or `<DarkModeToggle>` primitive added during this
      slice), every new copy key appears in both the `en` and `zh` branches of
      whichever console-level i18n table consumes it. If no consumer-facing
      copy is added — the most likely outcome — this gate is vacuously
      satisfied.

### G. Scope containment `[DERIVED]`

The parent's `artifacts` block is:

- `packages/ui-web/src/management-theme-context.tsx`
- `packages/ui-web/src/index.tsx`

The parent diff must satisfy:

- [ ] `git diff --stat HEAD` against the parent's pre-commit state shows
      changes primarily inside `packages/ui-web/src/management-theme-context.tsx`,
      `packages/ui-web/src/index.tsx`, plus any of these support files needed
      to keep typecheck and the Storybook gate green:
      `packages/ui-web/src/client.tsx` (already re-exports the provider; the
      parent diff may touch it to add new types),
      `packages/ui-web/src/management-theme-context.test.tsx` (existing test
      file; the parent diff may extend it),
      `packages/ui-web/.storybook/preview.tsx` (the decorator wiring is the
      Storybook integration work item),
      `packages/ui-web/src/management-shell.tsx` (only if the shell needs new
      hook-consumer refinement; it already calls
      `useOptionalManagementTheme()` so a no-op here is preferred). If
      additional ancillary files appear in the diff, the handoff note must
      explain why.
- [ ] No edits leak into `phase1_*` truth, the contracts bundle
      (`packages/contracts/**`), `@drts/ui-tokens` source
      (`packages/ui-tokens/**` — token additions belong to TOK-UI-001
      follow-ups, not DSY-UI-004), or any console app
      (`apps/{platform-admin-web,ops-console-web,tenant-console-web,
    partner-booking-web,driver-mobile-web,api}/**`). Console-level provider
      adoption is a **future** wave (`OPS-UI-RD-***` / `TEN-UI-***` /
      `ADM-UI-***`), not part of DSY-UI-004's slice.

### H. Commit evidence at parent finalize `[REQUIRED]`

Per `AI_COLLABORATION_GUIDE.md` §5 (commit evidence rule), parent `DSY-UI-004`
is a canonical implementation slice (not a sidecar), so `done` requires:

- [ ] Local task-scoped commit whose subject includes `DSY-UI-004`. (Sibling
      sidecars in this wave used subjects of the form
      `feat(ui-web): finalize DSY-UI-XXX <slice-name>` — see commits `36a069c`,
      `2cc1b24`, `1053e31` on the current branch. The reviewer should not
      treat the exact wording as required, only the presence of `DSY-UI-004`.)
- [ ] Commit body trailers:
  - `LLM-Agent: Codex2`
  - `Task-ID: DSY-UI-004`
  - `Reviewer: Codex`
- [ ] A normal non-force push, with `PUSH_REMOTE` / `PUSH_BRANCH` recorded in
      the `done` transition. Sibling DSY-UI commits land on
      `feat/claude2-ui-redesign-foundation` per `ai-status.json -> DSY-UI-003`;
      the parent owner should pick a branch consistent with the live wave's
      branching pattern, not assume that branch name.
- [ ] `done` transition runs through `scripts/ai-status.sh done DSY-UI-004`
      with `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` set
      — `NO_COMMIT_REQUIRED=1` is **not** acceptable for the parent (only for
      sidecars like this one).
- [ ] If the parent owner field shifts before finalize, the commit `LLM-Agent`
      trailer must reflect the live owner at finalize time, not the owner
      named in this packet at packet-write time.

---

## 5. Reviewer Evidence Anchors

The sidecar reviewer (`Codex2`) and, later, the parent reviewer (`Codex`) can
use these anchors to validate the eventual parent handoff without treating this
packet as canonical truth:

- `ai-status.json -> DSY-UI-004`
- `ai-status.json -> DSY-UI-004-SIDECAR-ACCEPTANCE`
- `ai-activity-log.jsonl` (filter on either id)
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`, section
  `### \`DSY-UI-004\` Density + dark mode toggle support` (lines 269–281 at
  packet write)
- `packages/ui-web/src/management-theme.ts` (token-level density / mode tables)
- `packages/ui-web/src/management-theme-context.tsx` (the new provider + hooks)
- `packages/ui-web/src/management-theme-context.test.tsx` (existing test
  baseline)
- `packages/ui-web/src/management-shell.tsx` (existing context consumer; lines
  19, 38, 109)
- `packages/ui-web/src/client.tsx` (client re-export surface)
- `packages/ui-web/src/index.tsx` (server-safe re-export surface)
- `packages/ui-web/.storybook/main.ts`,
  `packages/ui-web/.storybook/preview.tsx` (Storybook surface; toolbar globals
  for `density` + `dark`)
- `packages/ui-tokens/src/colors.ts` and `packages/ui-tokens/src/density.ts`
  (upstream token bundle the theme depends on)

Reviewer-focused implementation checkpoints, derived from the parent planning
ref:

- `ManagementThemeProvider` must remain controllable + uncontrolled. Either
  prop pattern works in isolation, but the parent diff must not collapse them
  into a single mode (controlled-only would break shell defaults; uncontrolled-only
  would block console-level state lifting).
- The default render path (no provider mounted) must continue producing
  `density="comfortable"` / `mode="light"` shell paint via
  `useOptionalManagementTheme()`'s `null` return. This is the planning-ref
  guardrail for "不影響既有未 wrap 的頁面" (line 281).
- The Storybook decorator wiring is a real work item (the toolbar globals
  exist, but no decorator currently maps them onto `ManagementThemeProvider`).
  A reviewer should be able to flip the Storybook toolbar and watch the shell
  paint switch — both density and dark — without a page reload.
- The SSR boundary stays: `index.tsx` exports the **types**, `client.tsx`
  exports the **runtime provider + hooks**.

---

## 6. Sidecar Acceptance Checklist

Mirrors `ai-status.json -> DSY-UI-004-SIDECAR-ACCEPTANCE.acceptance`:

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Keep the packet scoped to acceptance framing, dependency mapping, and
      reviewer support.
- [x] Keep the dependency map aligned with current machine truth.
- [ ] Hand off the packet to the assigned reviewer (executed via
      `scripts/ai-status.sh handoff` after the packet is committed-equivalent
      in the working tree; sidecars use `NO_COMMIT_REQUIRED=1` at
      sidecar-`done` per L0 §5).

---

## 7. Reviewer Handoff Commands

Approve (sidecar only — does not approve or close parent `DSY-UI-004`, which
still needs to go through its own in_progress → review → review_approved → done
lifecycle under owner `Codex2` and reviewer `Codex`):

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh approve DSY-UI-004-SIDECAR-ACCEPTANCE \
  "Acceptance packet aligned with current machine truth at re-handoff: parent DSY-UI-004 is status=review with owner=Codex2 reviewer=Codex (last_update 2026-05-10T15:06:54Z); depends_on (DSY-UI-003 done, commit 36a069c) is correct; spec-relevant SBK-UI-001 done at commit fced012 (2026-05-10T14:56:13Z) and OPS-UI-RD-001 done at commit cd10d83 (2026-05-10T14:57:09Z) are reflected in the dependency map; planning-ref Work block (density compact/comfortable, dark boolean, ManagementThemeProvider, useTheme hook, Storybook integration) is translated into a citation-anchored acceptance checklist; SSR boundary (index.tsx types vs client.tsx runtime) is anchored; downstream impact on SBK-UI-002 / OPS-UI-RD-001 / future console adopters is captured; reviewer evidence anchors point at packages/ui-web/src/{management-theme.ts,management-theme-context.tsx,management-theme-context.test.tsx,management-shell.tsx,client.tsx,index.tsx} and packages/ui-web/.storybook/{main.ts,preview.tsx} without editing them."
```

Reopen if drift is found instead:

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh reopen DSY-UI-004-SIDECAR-ACCEPTANCE \
  "packet needs revision: [specify machine-truth drift vs ai-status.json -> DSY-UI-004, dependency-map error, missing acceptance gate, SSR-boundary misstatement, or support-scope violation]"
```

Note: `reopen` of this sidecar must be limited to sidecar-document accuracy; it
is not a mechanism for litigating parent design choices. If the planning ref
itself needs change, that is a `DSY-UI-004` parent-task or
workbreakdown-revision decision, not a sidecar action. If the parent task
transitions while this sidecar is in `review` (e.g., parent moves from
`in_progress` to `review` or `review_approved`), the reviewer should treat that
as expected — this packet is forward-looking and intentionally does not
snapshot transient parent status (see §2).

---

## 8. Closeout Note

This sidecar is `task_class=sidecar` with `mutates_canonical=false`, so per
`AI_COLLABORATION_GUIDE.md` §5 commit evidence rule, owner closeout (`Claude2` →
`done`) may use `NO_COMMIT_REQUIRED=1` after sidecar approval. The parent task
`DSY-UI-004` is **not** a sidecar — it is a canonical implementation slice that,
when finalized, must go through the full local-commit + push + done sequence
with `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` recorded.
Nothing in this packet authorizes the parent owner to skip that sequence,
nothing in this packet authorizes any change to L1 / L2 truth or the planning
ref, and nothing in this packet pre-approves the parent diff — the parent
reviewer (`Codex`) remains the sole approver of `DSY-UI-004`.
