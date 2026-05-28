# UI-FE-TEN-BKG SIDECAR ACCEPTANCE

Snapshot Type: parallel sidecar support packet
Snapshot Captured At: 2026-05-28T13:14:21Z
Sidecar Owner: Claude2
Sidecar Reviewer: Codex2
Parent Task: UI-FE-TEN-BKG
Parent Title: tenant-console-web: rebuild Bookings list page to canvas Tenant Console.html
Parent Owner / Reviewer: Codex2 / Codex
Parent Status At Capture: review (handoff message recorded in `ai-status.json` at `2026-05-28T13:14:57Z`)

## Purpose

This packet is a sidecar-only support artifact for UI-FE-TEN-BKG. It does not change canonical truth, contracts, or runtime code. It packages:

- an acceptance checklist that mirrors packet §5.2 (`/bookings` — Booking List) and operating context §3 of `docs/05-ui/tenant-console-design-handoff-packet-20260525.md`,
- a dependency map naming the exact contract / client SDK / UI seams the bookings list relies on,
- evidence anchors so the assigned reviewer (Codex2) can spot-check the parent slice without re-deriving the spec.

The packet is intentionally derived from the canonical packet + contracts, not from new design opinion. Anywhere the canonical spec is silent, this packet defers (and says so explicitly).

## Scope Boundary

- Allowed: support material under `support/sidecars/UI-FE-TEN-BKG/`.
- Not allowed: edits to `apps/tenant-console-web/**`, `packages/contracts/**`, `packages/api-client/**`, `packages/ui-web/**`, `packages/ui-tokens/**`, or any L1/L2 canonical truth.
- Not allowed: machine-truth closeout (`done`) for the parent task. Parent closeout remains with parent owner Codex2 / parent reviewer Codex.

## Source Documents Anchored

- Canonical packet — `docs/05-ui/tenant-console-design-handoff-packet-20260525.md`
  - §3.1 Locale (Q-X17)
  - §3.2 Refresh model (Q-X01, Q-X02) — `/bookings` is **T5 Tenant slow** (30s)
  - §3.3 Identity / health context bar (Q-X11, Q-X12)
  - §3.4 Confirmation pattern (Q-X09, Q-X10) — high-risk cancel lives in detail, not list
  - §3.5 Authority boundaries (Q-X13) — CTAs from `data.availableActions[]`
  - §3.6 Empty / not-ready states (Q-X15) — 6 `EmptyReason` values for tenant
  - §3.10 Cross-app navigation (Q-X03) — new-tab cross-app deep links
  - §3.11 Command semantics (Q-TEN04) — synchronous command pattern
  - §5.2 `/bookings` — Booking List (must-show, must-do, decision points, state variants)
- L1 product truth — `phase1_prd_detailed_v1.md`, `phase1_service_contracts_v1.md`
- Shared UI runtime contract — `packages/contracts/src/ui-runtime.ts`
- Tenant booking record contract — `packages/contracts/src/index.ts` (BookingRecord + TenantBookingListResponse envelope)

## Machine-Truth Snapshot

- `ai-status.json` is authoritative; this packet is a captured snapshot at `2026-05-28T13:14:21Z`.
- Parent task `UI-FE-TEN-BKG` is `review` (handoff to reviewer `Codex`) per the canonical `ai-status.json` entry whose `next` field records: `Bookings list branch already contained the contract-driven rebuild; verified availableActions/crossAppLinks/editableUntil/slaStatus are consumed from ui-runtime, 6 empty states remain distinct, refresh control wired to T5 slow. Validation passed: pnpm --filter @drts/tenant-console-web typecheck && pnpm --filter @drts/tenant-console-web build. Pushed codex2/ui-fe-ten-bkg @ c06e04f6.`
- Sidecar task `UI-FE-TEN-BKG-SIDECAR-ACCEPTANCE` was started by `Claude2` via `scripts/ai-status.sh start` at packet authoring time.
- Parent's official acceptance string (verbatim): `Visual matches Tenant Console.html corresponding artboard; behaviour matches packet §5 entry for Bookings list; availableActions drives CTAs; EmptyReason 6 states rendered distinctly; refresh tier wired; pnpm --filter @drts/tenant-console-web typecheck + build pass`.

## Acceptance Checklist (tenant-console `/bookings` list only)

Each row is anchored to a specific spec citation so the reviewer can confirm a yes/no with a cited reference.

### A. Visual / page shell

- [ ] Page title + eyebrow reads as the Bookings list per Tenant Console.html artboard. (packet §5.2 entry; §4.1 sitemap row "/bookings 訂單")
- [ ] Locale primary zh-TW with en secondary; status codes use canonical OwnedOrderStatus, not localized aliases. (packet §3.1; `OWNED_ORDER_STATUSES` in `packages/contracts/src/index.ts`)
- [ ] Header chip surfaces actor / realm / tenant / environment; sidebar footer surfaces API health + `lastCheckedAt` (or page-level health banner if app shell renders this globally). (packet §3.3)

### B. Refresh tier + freshness

- [ ] Refresh tier visibly identified as **T5 Tenant slow** (30s cadence). (packet §3.2 table; §5.2 "Refresh tier: T5")
- [ ] Response envelope `UiRefreshMetadata` consumed for the freshness indicator (`generatedAt` / `dataFreshness` / `source` / `staleAfterMs`); UI does not invent its own staleness heuristic. (`ui-runtime.ts` §Q-X01, lines 90–95)
- [ ] Manual refresh affordance available with stale / degraded indication. (packet §3.2)

### C. Authority boundaries — `availableActions` drives CTAs (Q-X13)

- [ ] Page-level CTAs ("Create booking", filter, search, export) are driven by `availableActions[]` rather than role-derived booleans. (packet §3.5; `ResourceActionDescriptor` at `ui-runtime.ts:145`)
- [ ] Row-level CTAs ("Open detail", any edit affordances) are driven by per-row `BookingRecord.availableActions`. (`packages/contracts/src/index.ts` BookingRecord §`availableActions`)
- [ ] Disabled affordances show as disabled with `disabledReasonCode` tooltip (NOT hidden). (`ui-runtime.ts` Q-X13 comment + §3.5)
- [ ] No hard-coded `if (role === ...)` action gating in the page tree.

### D. Booking editability — `editableUntil` + `readOnlyReasonCode` (Q-TEN05)

- [ ] `editableUntil` column / chip rendered when present, with relative-urgency cue. (packet §5.2 must-show; BookingRecord §`editableUntil`)
- [ ] When the booking is read-only, the visible reason maps to `TenantBookingReadOnlyReasonCode` (`completed | cancelled | past_editable_window | forwarded_authority`). (`packages/contracts/src/index.ts:2385`)
- [ ] Editability is **not** inferred from `BookingStatus` alone. (packet §3.5 explicit constraint; `BookingRecord` doc-comment lines 2358–2375)

### E. Forwarded-authority (Q-DRV04) — no synthetic tenant workflow

- [ ] List renders a callout / banner when forwarded-authority bookings are present, naming the adapter-native states (`accept_pending`, `confirmed_by_platform`, `lost_race`, `cancelled_by_platform`, `sync_failed`). (BookingRecord context; `TenantBookingForwardedAuthorityPolicy` in `packages/contracts/src/index.ts`)
- [ ] Forwarded-authority adapter-native states do NOT surface as tenant workflow CTAs.
- [ ] Cross-app deep link from a forwarded row (e.g. ops-console resource) opens in a new tab per Q-X03. (packet §3.10; §5.2 entry-exit)

### F. EmptyReason — six distinct states (Q-X15)

The tenant-console flavor of `EmptyReason` (per `ui-runtime.ts:166`) is:

`no_data | not_provisioned | fetch_failed | permission_denied | external_unavailable | filtered_empty`

(`driver_not_eligible` is driver-app-specific and does NOT apply to the tenant Bookings list.)

- [ ] All six reasons are rendered with distinct title + body + CTA wording, not a shared "no data" string.
- [ ] `not_provisioned` (brand-new tenant not configured) is visually distinct from `no_data` (configured tenant with zero bookings). (packet §3.6 explicit example)
- [ ] `filtered_empty` is shown when filters / search / status chips eliminate all rows; suggests clearing filters.
- [ ] `permission_denied` and `external_unavailable` are rendered without crashing the page (`?empty=…` preview links or equivalent toggles allowed for visual QA).
- [ ] Empty envelope `EmptyStateEnvelope.nextAction` (when present) renders as the empty-state CTA, not a hard-coded button. (`ui-runtime.ts:181`)

### G. Command semantics (Q-TEN04)

- [ ] List page does NOT cancel / update bookings directly; high-risk write actions live in `/bookings/[id]`. (packet §3.4; §5.2 — list owns only medium / low risk)
- [ ] "Create booking" CTA navigates to `/bookings/new`, which submits via `POST /api/tenant/bookings/commands/create` (verified by sibling task UI-FE-TEN-BKGNEW, not this packet). (packet §3.11)

### H. Filters / search / sitemap entry-exit

- [ ] Filter chips cover at minimum: status, service bucket / subtype, date range. (packet §5.2 must-support)
- [ ] Search field covers booking id, order id, passenger. (packet §5.2 must-support; §3.8)
- [ ] Row → `/bookings/[id]` and "Create" → `/bookings/new` per packet §4.2 inter-page navigation.
- [ ] Cross-app deep links from list rows open in new tabs. (packet §3.10)

### I. Audit + receipt

- [ ] Any write action triggered from the list (medium-risk create / export) returns an `ActionReceipt` with `auditId` and a "View audit" affordance. (packet §3.4, §3.7; `ActionReceipt` at `ui-runtime.ts:201`)
- [ ] No write action on the list bypasses the receipt pattern.

### J. Build + typecheck — owner verification gate

- [ ] `pnpm --filter @drts/tenant-console-web typecheck` passes. (recorded in parent's `next` field)
- [ ] `pnpm --filter @drts/tenant-console-web build` passes. (recorded in parent's `next` field)
- Note: This packet does not re-run typecheck/build — that gate belongs to parent owner Codex2 and reviewer Codex on `codex2/ui-fe-ten-bkg`.

## Dependency Map

The parent slice depends on five upstream tasks (all `done` at snapshot time per `ai-status.json`). Each upstream task contributes a specific seam the Bookings list consumes; the table below names the seam, not just the task id.

### UI-FE-TOKENS (done; owner Claude2 / reviewer Codex2)

- Provides design tokens + primitive components consumed by the Bookings list page shell.
- Consumed via `@drts/ui-tokens` and primitives under `@drts/ui-web` / `apps/tenant-console-web/components/page-primitives.tsx`.
- Reviewer should confirm the page uses tokenized colors / spacing for status chips, callout panels, and table-grid surfaces — not bespoke CSS values.

### UI-BE-005 (done; owner Codex / reviewer Codex2)

- Provides `GET /api/tenant/integration-governance/readiness` aggregated endpoint (Q-TEN10).
- Tangential to the Bookings list itself, but feeds the integration-governance tile that the workspace home (`/`) surfaces and that the Bookings list refers to via cross-app navigation. The list page should not crash if readiness is degraded; degraded state belongs in the shell header / banner per packet §3.3.

### UI-BE-007-BKG (done; owner Claude2 / reviewer Codex2)

- Provides the Q-TEN04 synchronous command surface (`POST /api/tenant/bookings/commands/{create,update,cancel}`) and Q-TEN05 `editableUntil` semantics.
- The list relies on these backend semantics indirectly: it must not invent its own editability model; it consumes `editableUntil` + `readOnlyReasonCode` + `availableActions` from the backend record.

### UI-CL-001 (done; owner Codex2 / reviewer Codex)

- Provides the generic response unwrapper for `UiHealthEnvelope` + `UiRefreshMetadata`.
- The Bookings list freshness chip must consume the unwrapped `UiRefreshMetadata` rather than constructing one client-side.
- **Observation for reviewer (not a blocker):** `packages/api-client/src/index.ts:614` currently exposes `listTenantBookings(): Promise<BookingRecord[]>`. The canonical `TenantBookingListResponse` envelope (defined at `packages/contracts/src/index.ts` near line 2399) carries `refreshMetadata`, `pageActions`, `emptyState`, and `forwardedAuthorityPolicy`. If the parent slice is meant to consume the envelope end-to-end, the SDK method should evolve to return the envelope (or expose a sibling method) so the page does not synthesize `UiRefreshMetadata` locally. Worth flagging on review.

### UI-CL-004 (done; owner Codex2 / reviewer Codex)

- Provides the tenant integration-governance readiness method in the shared SDK.
- Bookings list is a downstream consumer only if the page surfaces a readiness chip from the shell. Not a hard dependency for list rendering.

### Cross-dependency note

- The parent task brief lists these five upstream tasks, all `done`. There is no blocking upstream gap at snapshot time. Any list-side gap surfaced during review (e.g. SDK envelope unwrap) is a parent-scope item, not an upstream-blocker.

## What The Reviewer (Codex2) Should Confirm

- This packet is UI-FE-TEN-BKG-specific. Checklist items are anchored to packet §5.2, §3.x sections, or specific contract symbols in `ui-runtime.ts` / `index.ts`; no generic UI advice.
- Dependency map cites the five recorded upstream tasks and explains the seam each one provides, not just the id.
- Packet does not claim the parent task is done. Parent closeout (commit + push + machine-truth `done`) belongs to parent owner Codex2 and parent reviewer Codex.
- The packet's "Observation for reviewer" notes (e.g. SDK envelope vs `BookingRecord[]` return type) are flagged, not silently accepted.
- No files outside `support/sidecars/UI-FE-TEN-BKG/` are modified by this sidecar slice.

## Evidence Index

- `docs/05-ui/tenant-console-design-handoff-packet-20260525.md:75-145`
  Operating-context sections §3.1–§3.6 (locale, refresh tier, identity bar, confirmation, authority, empty states) used to anchor checklist items A–F.
- `docs/05-ui/tenant-console-design-handoff-packet-20260525.md:186-196`
  §3.11 command semantics (Q-TEN04) — anchors checklist §G.
- `docs/05-ui/tenant-console-design-handoff-packet-20260525.md:302-324`
  §5.2 `/bookings` — Booking List functional brief.
- `packages/contracts/src/ui-runtime.ts:78-208`
  `UiRefreshMetadata`, `RefreshTier`, `ResourceActionDescriptor`, `EmptyReason`, `EmptyStateEnvelope`, `ActionReceipt`.
- `packages/contracts/src/index.ts:2313-2378`
  `BookingRecord` shape including `editableUntil`, `readOnlyReasonCode`, `availableActions`.
- `packages/contracts/src/index.ts:2385-2389`
  `TenantBookingReadOnlyReasonCode` enum.
- `packages/contracts/src/index.ts:2399-2405`
  `TenantBookingListResponse` envelope (referenced for the SDK observation in the dependency map).
- `packages/api-client/src/index.ts:614-615`
  Current `listTenantBookings()` SDK shape (returns `BookingRecord[]`).
- `apps/tenant-console-web/app/bookings/page.tsx`
  Parent slice's primary artifact (canonical truth on branch `codex2/ui-fe-ten-bkg`; on `dev` at snapshot time the page references a `@/lib/bookings-runtime` module that ships with the parent branch — not part of this sidecar).
- `ai-status.json` task records for `UI-FE-TEN-BKG`, `UI-FE-TOKENS`, `UI-BE-005`, `UI-BE-007-BKG`, `UI-CL-001`, `UI-CL-004`.

## Local Verification For This Sidecar Slice

- Confirm only `support/sidecars/UI-FE-TEN-BKG/UI-FE-TEN-BKG-SIDECAR-ACCEPTANCE.md` changed for this task.
- Run `git diff --check -- support/sidecars/UI-FE-TEN-BKG/`.
- Spot-check the anchor files and packet line ranges listed in the Evidence Index.

## Reviewer Handoff

Owner handoff command (run by Claude2):

`AI_NAME=Claude2 scripts/ai-status.sh handoff UI-FE-TEN-BKG-SIDECAR-ACCEPTANCE Codex2 "UI-FE-TEN-BKG support packet authored at support/sidecars/UI-FE-TEN-BKG/UI-FE-TEN-BKG-SIDECAR-ACCEPTANCE.md: acceptance checklist (visual/refresh/authority/editability/forwarded-authority/empty-state/command/audit/build), dependency map for UI-FE-TOKENS / UI-BE-005 / UI-BE-007-BKG / UI-CL-001 / UI-CL-004, and evidence anchors into packet §3/§5.2 + ui-runtime.ts + BookingRecord. Flagged SDK observation: listTenantBookings still returns BookingRecord[] rather than TenantBookingListResponse envelope. No canonical truth or runtime touched; git diff --check clean on the sidecar artifact."`

Reviewer approval command (run by Codex2):

`AI_NAME=Codex2 scripts/ai-status.sh approve UI-FE-TEN-BKG-SIDECAR-ACCEPTANCE "Reviewed: packet is UI-FE-TEN-BKG-specific, anchored to packet §5.2 + ui-runtime contracts, dependency map names the seam for each upstream task, support-only artifact under support/sidecars/UI-FE-TEN-BKG/."`
