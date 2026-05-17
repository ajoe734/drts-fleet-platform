# PBK-UI-003 Sidecar Review Packet

This document is the parallel review packet for `PBK-UI-003` ("CTBC reference funnel — 7 screens"). It does not change canonical truth. It consolidates the repo facts that the assigned parent reviewer (`Codex`, as of the `2026-05-17T09:00:29Z` chairman reassignment — see §2) and the sidecar reviewer (`Claude`) need to evaluate the parent task. The parent task is currently `in_progress` (reopened by `Codex` at `2026-05-17T09:05:04Z` for Storybook anchor parity); this packet's evidence remains usable for the re-review once the parent owner resubmits.

Anchors used here come from:

- `ai-status.json`
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` (§ `PBK-UI-003`, lines 550–559)
- `apps/partner-booking-web/app/[tenantSlug]/(public|authenticated)/...`
- `apps/partner-booking-web/lib/brand.ts`
- `packages/ui-web/src/partner-booking-funnel.tsx`
- `packages/ui-web/src/partner-booking.stories.tsx`
- `packages/ui-tokens/src/brands.ts` (via `@drts/ui-tokens` re-exports)
- `docs/05-ui/drts-design-canvas/Partner Booking.html`
- `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md`
- Commits `a3ca727` and `e45fb7b` on the active branch

## §1 Scope & Boundary

- **Task ID:** `PBK-UI-003-SIDECAR-REVIEW`
- **Parent Task:** `PBK-UI-003`
- **Helper Kind:** `review_packet`
- **Owner:** `Claude2`
- **Reviewer:** `Claude`
- **Mutates Canonical:** `false`
- **Objective:** Hand the parent reviewer (`Codex`) an evidence-anchored review checklist for `PBK-UI-003`, citing the actual routes, shared component, brand wiring, and Storybook parity stories that the owner shipped, without editing L1/L2 truth, runtime code, or the parent backlog item itself.

Guardrails for this packet:

- Do not change `PBK-UI-003` scope beyond what `ai-status.json` and `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` already say.
- Do not duplicate or contradict the prior acceptance packet at `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md`; treat it as the upstream scope/dependency reference and cite it instead of restating it.
- Keep the sidecar output confined to `support/sidecars/PBK-UI-003/`.
- Do not transition the parent task; only the parent owner / reviewer may `handoff`, `approve`, `reopen`, or close `PBK-UI-003`.

## §2 Machine-Truth Anchors

### Parent Task: `PBK-UI-003`

| Field        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Title        | `CTBC reference funnel — 7 screens`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Phase        | `Wave 5`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Owner        | `Claude`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Reviewer     | `Codex`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Status       | `in_progress` (reopened by reviewer `Codex` at `2026-05-17T09:05:04Z`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Depends on   | `PBK-UI-002`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Artifacts    | `apps/partner-booking-web/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Acceptance   | `pnpm --filter @drts/partner-booking-web typecheck / build / lint`; `Storybook 對照對應 PB_* artboard (PBK-UI-003 起)`                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Planning ref | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Last update  | `2026-05-17T09:05:04Z`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Routing note | `next`: reviewer-side rerun (`partner-booking-web typecheck/build/lint` PASS, `ui-web typecheck/lint/build-storybook` PASS, 7 routes render, brand-token wiring clean), reopened only on Storybook parity — the comparison iframe `Partner Booking.html#screen` anchors do not scroll the embedded artboard to the matching `PB_*` section under static hosting (evidence under `.artifacts/pbk-ui-003/*.png`). Reviewer requests switching the parity source so each story lands directly on its `PB_*` reference artboard before resubmitting. |

Owner / reviewer fields are read directly from `ai-status.json`. Reviewer routing has moved twice since handoff: (a) availability-first reassignment at `2026-05-17T08:49:51Z` moved reviewer `Codex` → `Codex2` when `Codex2` claimed it while `Codex` was unavailable; (b) chairman reassignment at `2026-05-17T09:00:29Z` moved reviewer `Codex2` → `Codex` after a `Codex2` chair-threshold terminal failure loop on this reviewer role (failure_streaks count=2, threshold=2, last worker failure `2026-05-17T08:57:00Z`). The live pairing in machine truth is now `Claude / Codex`, which is the pairing this packet uses.

### Sidecar Task: `PBK-UI-003-SIDECAR-REVIEW`

| Field               | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| Owner               | `Claude2`                                                  |
| Reviewer            | `Claude`                                                   |
| Status              | `in_progress` (this packet is the deliverable)             |
| `task_class`        | `sidecar`                                                  |
| `helper_kind`       | `review_packet`                                            |
| `mutates_canonical` | `false`                                                    |
| Artifact            | `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-REVIEW.md` |

### Sibling sidecar (already closed): `PBK-UI-003-SIDECAR-ACCEPTANCE`

- Status: `done` (commit `5b2cfc7`, push `origin/feat/claude2-ui-redesign-foundation`)
- Artifact: `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md`
- This review packet defers to the acceptance packet for §3 dependency map and §4 acceptance checklist; it does not restate them.

## §3 Implementation Evidence (what the parent owner actually shipped)

These are the concrete repo facts the parent reviewer should verify, with file paths and the commits that introduced them.

### A. Seven CTBC funnel routes under `[tenantSlug]/(public|authenticated)/...`

`apps/partner-booking-web/app/[tenantSlug]/...` currently contains exactly seven CTBC funnel route files plus the existing tenant layout:

- `(public)/page.tsx` → `activeScreen="landing"`
- `(public)/eligibility/page.tsx` → `activeScreen="eligibility"`
- `(public)/help/page.tsx` → `activeScreen="help"`
- `(authenticated)/book/page.tsx` → `activeScreen="book"`
- `(authenticated)/confirmed/page.tsx` → `activeScreen="confirmed"`
- `(authenticated)/trips/page.tsx` → `activeScreen="trips"`
- `(authenticated)/receipt/page.tsx` → `activeScreen="receipt"`

Plus the existing tenant chrome:

- `app/[tenantSlug]/layout.tsx` (unchanged shell)
- the legacy `app/[tenantSlug]/page.tsx` is removed (the `(public)/page.tsx` route group resolves to `/[tenantSlug]`, so keeping both would conflict)

Sample (`(public)/page.tsx`, lines 1–23): each route resolves the brand via `getBrandForSlug(tenantSlug)` from `@/lib/brand`, calls `notFound()` on an unknown slug, and renders `<PartnerBookingReferenceFunnel brand={brand} activeScreen={...} basePath={`/${tenantSlug}`} />`.

This satisfies the planning-doc artifact line `apps/partner-booking-web/app/[tenantSlug]/(public|authenticated)/...` and the acceptance line `7 條路由皆可 render` from `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` §`PBK-UI-003`.

### B. Shared white-label funnel component in `@drts/ui-web`

- `packages/ui-web/src/partner-booking-funnel.tsx` (~1660 lines) is the single shared component that renders all seven screens, driven by a `screen: PartnerBookingScreenId` prop and a `brand: PartnerBrandTemplate` prop.
- `packages/ui-web/src/index.tsx` exports `PartnerBookingReferenceFunnel`, `partnerBookingScreens`, and `isPartnerBookingScreenId`.
- The component reads brand chrome via `PartnerBrandTemplate` tokens from `@drts/ui-tokens`; mock data is local to the component (no API wiring), matching the planning-doc constraint "資料先用 mock；不接後端。"

The earlier `a3ca727` commit shipped this shared surface; `e45fb7b` re-shaped the host app from a single `?screen=` query route into seven explicit Next.js routes per the planning doc, while keeping `<PartnerBookingReferenceFunnel>` as the rendering surface. The in-page navigator helper in `partner-booking-funnel.tsx` was also updated to emit path-based hrefs (`landing → basePath`, others → `${basePath}/${screen}`) instead of `?screen=` query strings, so the funnel's internal nav matches the route layout.

### C. Brand wiring uses the `PBK-UI-002` token layer (no app-local registry)

`apps/partner-booking-web/lib/brand.ts` (lines 1–38) re-exports `PartnerBrandTemplate` from `@drts/ui-tokens` and resolves brands via `getPartnerBrandTemplateBySlug`. No app-local CTBC brand constant is introduced. CSS variables are emitted as `--pbk-*` via `getPartnerChromeVars(brand)`, consistent with the `PBK-UI-002` chrome contract recorded in `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md` §3.

This satisfies the acceptance-packet guardrail "No local hardcoded partner-brand registry reappears in `apps/partner-booking-web/**`."

### D. Storybook parity stories vs. the artboard

`packages/ui-web/src/partner-booking.stories.tsx` defines seven stories under `title: "Partner Booking/CTBC Funnel"`:

- `Landing`, `Eligibility`, `Book`, `Confirmed`, `Trips`, `Receipt`, `Help`

Each story renders a side-by-side `ComparisonFrame`:

- **Built**: `<PartnerBookingPhoneScreen brand={ctbcBrand} screen={screen} />` using `BRAND_TEMPLATES.CTBC` from `@drts/ui-tokens`.
- **Canvas**: an `<iframe>` pointed at `docs/05-ui/drts-design-canvas/Partner Booking.html#${anchor}` via `getPartnerBookingArtboardAnchor(screen)`.

That covers the `ai-status.json` acceptance line "Storybook 對照對應 PB*\* artboard (PBK-UI-003 起)" and the planning-doc line "Storybook 對照 `partner-screens.jsx::PB*\*`" (note: the parent owner anchored against `Partner Booking.html`rather than`partner-screens.jsx`; both live in `docs/05-ui/drts-design-canvas/`and the acceptance packet already names`Partner Booking.html` as a co-equal artboard source — the reviewer should confirm this is acceptable parity, not a scope drift).

### E. Owner-reported verification (from commits `a3ca727` and `e45fb7b`)

Recorded in commit bodies, not re-executed by this packet:

- `pnpm --filter @drts/partner-booking-web typecheck` — clean
- `pnpm --filter @drts/partner-booking-web build` — `next build` registers 7 `/[tenantSlug]/*` routes plus `/` and `/_not-found`
- `pnpm --filter @drts/partner-booking-web lint` — clean
- `pnpm --filter @drts/partner-booking-web test` — vitest, no tests
- `pnpm --filter @drts/ui-web typecheck` / `lint` / `build-storybook` — clean

This packet does not re-run these commands; the parent reviewer is expected to re-run at least the `partner-booking-web typecheck / build / lint` trio as part of approval, because that trio is the explicit acceptance line in `ai-status.json`.

### F. Commit + push provenance on the active branch

| Commit    | Subject                                                     | Trailers                                                       |
| --------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `a3ca727` | `feat(PBK-UI-003): add CTBC reference funnel`               | `LLM-Agent: Claude2`, `Task-ID: PBK-UI-003`, `Reviewer: Codex` |
| `e45fb7b` | `feat(PBK-UI-003): split CTBC funnel into 7 Next.js routes` | `LLM-Agent: Claude`, `Task-ID: PBK-UI-003`, `Reviewer: Codex`  |

Branch: `claude/pbk-ui-003`. Both commits carry `Reviewer: Codex` trailers. The earlier `Codex2` interim reviewership (active between `2026-05-17T08:49:51Z` and `2026-05-17T09:00:29Z`) created a temporary trailer / `ai-status.json` mismatch, but that mismatch was resolved on `2026-05-17T09:00:29Z` when the chairman reassigned reviewer `Codex2` → `Codex`. The trailers and live machine-truth reviewer now agree on `Codex`, so no closeout amendment is required on this axis.

## §4 Parent-Reviewer Checklist (`Codex`, reviewing `PBK-UI-003`)

These are concrete, evidence-backed gates the parent reviewer should walk before `approve`. They are aligned to the parent task's acceptance line in `ai-status.json` and to the planning-doc §`PBK-UI-003`.

### Scope gates

- [ ] Confirm exactly the seven CTBC routes listed in §3.A exist under `apps/partner-booking-web/app/[tenantSlug]/(public|authenticated)/...`, and no extras.
- [ ] Confirm the legacy `app/[tenantSlug]/page.tsx` was removed (so the `(public)/page.tsx` route group resolves cleanly to `/[tenantSlug]`).
- [ ] Confirm no backend / API coupling was introduced (mock data stays in the shared component and per-route page files).
- [ ] Confirm the seven routes all delegate to `<PartnerBookingReferenceFunnel>` from `@drts/ui-web` and do not re-implement screens locally.

### Brand-layer gate

- [ ] Confirm `apps/partner-booking-web/lib/brand.ts` still re-exports `PartnerBrandTemplate` from `@drts/ui-tokens` and uses `getPartnerBrandTemplateBySlug` for resolution (no app-local CTBC constant).
- [ ] Confirm chrome variables are emitted as `--pbk-*` via `getPartnerChromeVars`, matching the `PBK-UI-002` contract.

### Verification gates (must be re-run by reviewer)

- [ ] `pnpm --filter @drts/partner-booking-web typecheck`
- [ ] `pnpm --filter @drts/partner-booking-web build`
- [ ] `pnpm --filter @drts/partner-booking-web lint`
- [ ] Manual / Storybook artboard comparison for all seven `Partner Booking/CTBC Funnel` stories against `docs/05-ui/drts-design-canvas/Partner Booking.html`.

### Audit / closeout gates

- [ ] Confirm the parent task's `done` closeout will record `COMMIT_HASH` (currently `e45fb7b` plus any follow-up commit produced by the Storybook-anchor fix) along with `COMMIT_SUBJECT`, `PUSH_REMOTE`, and `PUSH_BRANCH` per `AI_COLLABORATION_GUIDE.md` §5 commit-evidence rule. (This sidecar packet itself is `NO_COMMIT_REQUIRED=1` per the same section.)
- (Resolved) The previously flagged `Reviewer: Codex` trailer vs. `ai-status.json` reviewer mismatch was self-resolved by the `2026-05-17T09:00:29Z` chairman reassignment (machine-truth reviewer is now `Codex`, matching the trailers). No closeout amendment needed on this axis. See §3.F.

### Out of scope for `PBK-UI-003` (do not block on these here)

- Negative-path coverage (`eligible / ineligible / manual_review / inactive entry / eligibility-required`) is `PBK-UI-004` per planning doc §`PBK-UI-004`. Not a blocker for `PBK-UI-003`.
- New-vs-old `partner` mode coexistence policy is `PBK-UI-005`. Not a blocker for `PBK-UI-003`.

## §5 Packet Completeness Check

These are the acceptance points for this sidecar artifact itself.

- [x] The packet is anchored to `ai-status.json` for both the sidecar task and parent task using live values (not the values frozen in the acceptance packet). Refresh `2026-05-17T09:11Z`: parent task now `Claude / Codex`, `status=in_progress`, `last_update=2026-05-17T09:05:04Z` after the `Codex` reopen for Storybook anchor parity.
- [x] The packet cites the concrete repo evidence the parent reviewer must inspect: the seven route files, `partner-booking-funnel.tsx`, `partner-booking.stories.tsx`, and `apps/partner-booking-web/lib/brand.ts`.
- [x] The packet anchors verification claims to commits `a3ca727` and `e45fb7b` and explicitly states that this packet does not re-run owner-side commands.
- [x] The packet defers to `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md` for §3 dependency map and §4 parent acceptance checklist instead of duplicating them.
- [x] The packet records the routing history (Codex → Codex2 availability-first reassignment, then Codex2 → Codex chairman reassignment) and notes that the earlier reviewer-trailer / `ai-status.json` mismatch is now self-resolved (machine-truth reviewer = trailer reviewer = `Codex`). See §3.F and §4 Audit gate.
- [x] The only support artifact content for this task is this file under `support/sidecars/PBK-UI-003/`.

## §6 Reviewer Handoff Notes (for `Claude`, sidecar reviewer)

1. Treat this as a sidecar review packet. It should help `Codex` (the current parent reviewer) re-review `PBK-UI-003` faster once the owner addresses the Storybook anchor parity reopen; it does not itself approve, reopen, or close the parent task.
2. Re-read `ai-status.json` before approving this sidecar — confirm the parent pairing is still `Claude / Codex`. The parent is currently `in_progress` (reopened at `2026-05-17T09:05:04Z` for Storybook parity); that does not invalidate this packet's §3 implementation-evidence claims (which are anchored to commits `a3ca727` and `e45fb7b`), but if the routing or commits move again, refresh §2 and §3.F before approval.
3. Sanity-check §3.A by listing `apps/partner-booking-web/app/[tenantSlug]/` and confirming exactly the seven funnel route files plus `layout.tsx` exist; reject the packet if the file list has drifted.
4. Sanity-check §3.C by reading `apps/partner-booking-web/lib/brand.ts` lines 1–38 to confirm no app-local CTBC registry has been reintroduced since this packet was written.
5. Approve this sidecar through `scripts/ai-status.sh approve` when the packet matches live repo state; the owner (`Claude2`) will then close it under `NO_COMMIT_REQUIRED=1` per `AI_COLLABORATION_GUIDE.md` §5 (sidecar closeout rule).
6. Do **not** rewrite the parent task's machine-truth state from this sidecar. The Storybook-anchor parity issue raised in the `Codex` reopen is parent-scope work for the parent owner (`Claude`); concerns about `PBK-UI-003` itself should be routed through the parent reviewer (`Codex`) or via the parent owner's follow-up commit, not by editing this packet.
