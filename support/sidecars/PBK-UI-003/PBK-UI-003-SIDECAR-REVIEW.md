# PBK-UI-003 Sidecar Review Packet

This document is the parallel review-support packet for `PBK-UI-003` ("CTBC reference funnel — 7 screens"). It does not change canonical truth. It consolidates the repo facts and verification evidence that the assigned sidecar reviewer (`Codex2`) needs to confirm that the parent task's `done` state in `ai-status.json` — and the closeout commit/push it cites — is justified by what is actually in the tree.

This packet is a sibling to `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md`. The acceptance sidecar covers start-gate scope and dependency mapping; this review sidecar covers post-implementation evidence and reviewer handoff.

Anchors used here:

- `ai-status.json`
- `apps/partner-booking-web/app/[tenantSlug]/page.tsx`
- `apps/partner-booking-web/app/[tenantSlug]/layout.tsx`
- `packages/ui-web/src/partner-booking-funnel.tsx`
- `packages/ui-web/src/partner-booking.stories.tsx`
- `packages/ui-web/src/index.tsx`
- `docs/05-ui/drts-design-canvas/Partner Booking.html`
- `docs/05-ui/drts-design-canvas/partner-screens.jsx`
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- Commit `fbc05f62926392b7363360757f475275b9b56deb` on `origin/feat/claude2-ui-redesign-foundation`

## §1 Scope & Boundary

- **Task ID:** `PBK-UI-003-SIDECAR-REVIEW`
- **Parent Task:** `PBK-UI-003`
- **Helper Kind:** `review_packet`
- **Owner:** `Claude`
- **Reviewer:** `Codex2`
- **Mutates Canonical:** `false`
- **Objective:** Hand off a reviewer-facing evidence summary for the parent CTBC funnel task without editing L1/L2 truth, runtime code, or the parent backlog item itself. The parent has already been finalized to `done` in `ai-status.json` with task-scoped commit and normal non-force push recorded; this packet records why and gives `Codex2` enough anchors to either confirm or reopen the sidecar.

Guardrails for this packet:

- Only the artifact under `support/sidecars/PBK-UI-003/` is touched.
- Machine-truth state transitions go through `scripts/ai-status.sh`, never by hand-editing `ai-status.json` / `current-work.md` / `ai-activity-log.jsonl`.
- The packet does not re-decide parent scope; it cites what was already decided.

## §2 Machine-Truth Anchors

### Parent task: `PBK-UI-003`

| Field           | Value                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Title           | `CTBC reference funnel — 7 screens`                                                                                    |
| Phase           | `Wave 5`                                                                                                               |
| Owner           | `Codex2`                                                                                                               |
| Reviewer        | `Codex`                                                                                                                |
| Status          | `done` (closeout finalized by `Codex2`)                                                                                |
| Depends on      | `PBK-UI-002` (`done` at commit `d7046eb`)                                                                              |
| Planning ref    | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`                                                                |
| Acceptance      | `pnpm --filter @drts/partner-booking-web typecheck / build / lint`; `Storybook 對照對應 PB_* artboard (PBK-UI-003 起)` |
| Last update     | `2026-05-12T20:31:57Z`                                                                                                 |
| Commit hash     | `fbc05f62926392b7363360757f475275b9b56deb`                                                                             |
| Commit subject  | `feat(PBK-UI-003): add CTBC reference funnel`                                                                          |
| Commit agent    | `Codex2`                                                                                                               |
| Commit reviewer | `Codex`                                                                                                                |
| Commit recorded | `2026-05-12T20:31:57Z`                                                                                                 |
| Push remote     | `origin`                                                                                                               |
| Push branch     | `feat/claude2-ui-redesign-foundation`                                                                                  |
| Push ref        | `origin/feat/claude2-ui-redesign-foundation`                                                                           |
| Push commit     | `fbc05f62926392b7363360757f475275b9b56deb`                                                                             |
| Push recorded   | `2026-05-12T20:31:57Z`                                                                                                 |

`ai-status.json` `next` for `PBK-UI-003` records the closeout summary: task-scoped commit `fbc05f62926392b7363360757f475275b9b56deb` ("feat(PBK-UI-003): add CTBC reference funnel") is already on `origin/feat/claude2-ui-redesign-foundation` after a normal non-force push. The recorded verification rerun is: `pnpm --filter @drts/ui-web typecheck`; `pnpm --filter @drts/ui-web build-storybook`; `pnpm --filter @drts/partner-booking-web typecheck`; `pnpm --filter @drts/partner-booking-web build`; `pnpm --filter @drts/partner-booking-web lint`; with reviewer artboard parity confirmed for landing/eligibility/book/confirmed/trips/receipt/help against `docs/05-ui/drts-design-canvas/Partner Booking.html`.

### This sidecar task: `PBK-UI-003-SIDECAR-REVIEW`

| Field               | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| Owner               | `Claude`                                                   |
| Reviewer            | `Codex2`                                                   |
| Status              | `in_progress`                                              |
| `task_class`        | `sidecar`                                                  |
| `helper_kind`       | `review_packet`                                            |
| `mutates_canonical` | `false`                                                    |
| Depends on          | `PBK-UI-002`                                               |
| Artifact            | `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-REVIEW.md` |

## §3 Delivered Surface — what is in the tree

Commit `fbc05f62926392b7363360757f475275b9b56deb` (`feat(PBK-UI-003): add CTBC reference funnel`) is the implementation commit for the parent task. `git show --stat` reports the diff as:

| Path                                                 | Lines         |
| ---------------------------------------------------- | ------------- |
| `apps/partner-booking-web/app/[tenantSlug]/page.tsx` | `+80 / -56`   |
| `apps/partner-booking-web/package.json`              | `+1`          |
| `apps/partner-booking-web/tsconfig.json`             | `+3 / -1`     |
| `packages/ui-web/src/index.tsx`                      | `+9`          |
| `packages/ui-web/src/partner-booking-funnel.tsx`     | `+1660`       |
| `packages/ui-web/src/partner-booking.stories.tsx`    | `+159`        |
| Total                                                | `+1856 / -56` |

Key surface facts that match this commit in the working tree:

- `packages/ui-web/src/partner-booking-funnel.tsx` declares `partnerBookingScreens = ["landing", "eligibility", "book", "confirmed", "trips", "receipt", "help"]` as a frozen tuple and exposes the screen ids through `PartnerBookingScreenId`, `getPartnerBookingScreenMeta`, `getPartnerBookingArtboardAnchor`, and `isPartnerBookingScreenId`.
- The same module exports `PartnerBookingPhoneScreen` (single-screen render) and `PartnerBookingReferenceFunnel` (multi-screen chrome) and is re-exported through `packages/ui-web/src/index.tsx`.
- `packages/ui-web/src/partner-booking.stories.tsx` defines parity stories `Landing`, `Eligibility`, `Book`, `Confirmed`, `Trips`, `Receipt`, `Help` and renders each story alongside an iframe pointed at `/drts-design-canvas/Partner%20Booking.html#${anchor}`.
- `apps/partner-booking-web/app/[tenantSlug]/page.tsx` uses `PartnerBookingReferenceFunnel`, the brand resolver from `@/lib/brand`, and `?screen=` to switch active screen, falling back to `landing` when the query is missing or invalid.

## §4 Seven-Screen Parity Mapping

The planning doc, runtime code, Storybook stories, and design canvas all line up on the same seven screens. The screen ids, `eyebrow` labels in `partner-booking-funnel.tsx`, Storybook story names in `partner-booking.stories.tsx`, and artboard anchors in `docs/05-ui/drts-design-canvas/Partner Booking.html` are consistent:

| Planning screen | Funnel `id`   | Funnel `eyebrow` | Storybook story | Artboard anchor                    |
| --------------- | ------------- | ---------------- | --------------- | ---------------------------------- |
| Landing         | `landing`     | `PB_Landing`     | `Landing`       | `Partner Booking.html#landing`     |
| Eligibility     | `eligibility` | `PB_Eligibility` | `Eligibility`   | `Partner Booking.html#eligibility` |
| Book            | `book`        | `PB_Book`        | `Book`          | `Partner Booking.html#book`        |
| Confirmed       | `confirmed`   | `PB_Confirmed`   | `Confirmed`     | `Partner Booking.html#confirmed`   |
| Trips           | `trips`       | `PB_Trips`       | `Trips`         | `Partner Booking.html#trips`       |
| Receipt         | `receipt`     | `PB_Receipt`     | `Receipt`       | `Partner Booking.html#receipt`     |
| Help            | `help`        | `PB_Help`        | `Help`          | `Partner Booking.html#help`        |

`getPartnerBookingArtboardAnchor(screen)` returns `screen` directly, so the Storybook iframe `src` and the artboard anchor stay identical with no per-screen mapping table to drift. The parity stories are the artifact that the `ai-status.json` acceptance line `Storybook 對照對應 PB_* artboard (PBK-UI-003 起)` calls for.

## §5 Acceptance Evidence Mapping

The `ai-status.json` acceptance for `PBK-UI-003` is two items: the partner-booking-web commands trilogy, and the Storybook artboard comparison. The closeout `next` field on `PBK-UI-003` (recorded `2026-05-12T20:31:57Z`) cites the verification rerun that covers both:

| Acceptance item                                                 | Evidence in `ai-status.json` `PBK-UI-003.next` (closeout)                                                    | Anchor in the tree                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `pnpm --filter @drts/partner-booking-web typecheck`             | closeout verified 2026-05-12 (commit `fbc05f6`, pushed to `origin/feat/claude2-ui-redesign-foundation`)      | `apps/partner-booking-web/tsconfig.json`                                  |
| `pnpm --filter @drts/partner-booking-web build`                 | closeout verified 2026-05-12 (commit `fbc05f6`, pushed to `origin/feat/claude2-ui-redesign-foundation`)      | `apps/partner-booking-web/`                                               |
| `pnpm --filter @drts/partner-booking-web lint`                  | closeout verified 2026-05-12 (commit `fbc05f6`, pushed to `origin/feat/claude2-ui-redesign-foundation`)      | `apps/partner-booking-web/`                                               |
| Storybook artboard parity (`PB_* against Partner Booking.html`) | `pnpm --filter @drts/ui-web typecheck` and `pnpm --filter @drts/ui-web build-storybook` verified at closeout | `packages/ui-web/src/partner-booking.stories.tsx`, `Partner Booking.html` |

This sidecar packet does not re-execute these commands; the parent owner's recorded closeout reruns are the canonical evidence. The mapping above is the audit hand-off so `Codex2` can spot-check rather than re-run unless a discrepancy appears.

## §6 Scope Guardrails — what `PBK-UI-003` should NOT have done

The packet flags these so the sidecar reviewer can confirm none of them slipped into the parent change:

- No backend or API wiring (planning doc: "資料先用 mock；不接後端。"). The page reads `searchParams.screen` and renders mock-driven UI; there is no fetch / API call introduced in `apps/partner-booking-web/`.
- No app-local partner-brand registry. Branding still flows through `getBrandForSlug` in `apps/partner-booking-web/lib/brand.ts` (delivered in `PBK-UI-002`).
- No expansion into negative-path screens. The five negative paths (`eligible / ineligible / manual_review / inactive / eligibility-required`) are explicitly scoped to `PBK-UI-004`, which is `todo` and dependent on `PBK-UI-003`.
- No second-partner (`CATHAY`, `GRAND`) brand demo wiring. Brand templates exist in `packages/ui-tokens/src/brands.ts` via `PBK-UI-002`, but the funnel landing in `PBK-UI-003` is the CTBC reference, not a multi-brand showcase.

## §7 Dependency State at Approval

`PBK-UI-003`'s only dependency is `PBK-UI-002`:

| Field          | Value                                        |
| -------------- | -------------------------------------------- |
| Task           | `PBK-UI-002`                                 |
| Status         | `done`                                       |
| Commit         | `d7046eb`                                    |
| Commit subject | `PBK-UI-002 Partner token brand chrome`      |
| Push           | `origin/feat/claude2-ui-redesign-foundation` |

This is the same branch the `PBK-UI-003` implementation commit `fbc05f6` is on, so the dependency edge is satisfied in `ai-status.json` and physically present in the branch history.

## §8 Reviewer Closeout Checklist (for `Codex2`)

These are the sidecar-review gates. They are framed as audit checks against artifacts already in the tree, not as new build steps to run.

### A. Machine truth still matches this packet

- [ ] `ai-status.json` still records `PBK-UI-003` as `done`, owner `Codex2`, reviewer `Codex`, last_update `2026-05-12T20:31:57Z`, with `commit_hash` `fbc05f62926392b7363360757f475275b9b56deb`, `commit_subject` `feat(PBK-UI-003): add CTBC reference funnel`, `push_remote` `origin`, and `push_branch` `feat/claude2-ui-redesign-foundation`. If any of those fields drift, refresh §2 of this packet before approving.
- [ ] `ai-status.json` still records `PBK-UI-002` as `done` on commit `d7046eb` pushed to `origin/feat/claude2-ui-redesign-foundation`.
- [ ] `ai-status.json` still records this sidecar (`PBK-UI-003-SIDECAR-REVIEW`) as owned by `Claude`, reviewed by `Codex2`, with `helper_kind: review_packet` and `mutates_canonical: false`.

### B. Repo state matches the parent owner's closeout record

- [ ] `git log --oneline -1 fbc05f62926392b7363360757f475275b9b56deb` resolves to `feat(PBK-UI-003): add CTBC reference funnel`, and that commit is reachable from `origin/feat/claude2-ui-redesign-foundation`.
- [ ] `git log --oneline -1 -- packages/ui-web/src/partner-booking-funnel.tsx` resolves to commit `fbc05f6` and the file is present.
- [ ] `packages/ui-web/src/partner-booking.stories.tsx` still exports the seven parity stories `Landing`, `Eligibility`, `Book`, `Confirmed`, `Trips`, `Receipt`, `Help` and references `Partner Booking.html` as the canvas src.
- [ ] `packages/ui-web/src/index.tsx` still re-exports the partner-booking surface that `apps/partner-booking-web/app/[tenantSlug]/page.tsx` imports.
- [ ] `apps/partner-booking-web/app/[tenantSlug]/page.tsx` still uses `PartnerBookingReferenceFunnel`, `getBrandForSlug`, and `isPartnerBookingScreenId`, with `?screen=` driving the active screen and `landing` as the fallback.

### C. Scope guardrails still hold

- [ ] No fetch / network call or backend client appears under `apps/partner-booking-web/app/[tenantSlug]/`. The planning-doc "mock data / no backend" boundary still holds.
- [ ] No partner-brand registry has been re-introduced inside `apps/partner-booking-web/`. Brand resolution still flows through `apps/partner-booking-web/lib/brand.ts` consuming `@drts/ui-tokens`.
- [ ] `PBK-UI-004` (negative paths) is still separate. None of its five negative-path screens have leaked into the funnel implementation.

### D. Packet hygiene

- [ ] The only task-scoped content edit for `PBK-UI-003-SIDECAR-REVIEW` is this file under `support/sidecars/PBK-UI-003/`.
- [ ] All sidecar state transitions for this task were made through `scripts/ai-status.sh` (`start`, `handoff`, `approve`).

## §9 Reviewer Handoff Notes (for `Codex2`)

1. Treat this packet as audit material for the parent owner's already-recorded closeout. The parent task is `done` with task-scoped commit `fbc05f6` already pushed to `origin/feat/claude2-ui-redesign-foundation`; the sidecar reviewer should approve, reopen, or block _this packet_, but not re-decide the parent's approval or re-execute its closeout — that already happened under `Codex` (parent reviewer) and `Codex2` (parent owner).
2. If §8.A or §8.B fails (machine truth has moved, or the implementation files / closeout commit have been amended after `2026-05-12T20:31:57Z`), reopen this sidecar with `AI_NAME=Codex2 scripts/ai-status.sh reopen PBK-UI-003-SIDECAR-REVIEW "<reason>"` rather than approving on stale evidence.
3. If §8.C fails (a guardrail was crossed in the parent commit), the right move is to raise that against `PBK-UI-003` directly with the parent reviewer (`Codex`) and, if needed, request a follow-up canonical task — do not silently expand or contract this sidecar's scope to compensate.
4. Approval should explicitly confirm that the only file changed under this sidecar's task scope is `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-REVIEW.md`. Any machine-truth state changes should appear only as `ai-status.json` / `current-work.md` / `ai-activity-log.jsonl` updates produced by `scripts/ai-status.sh`.
5. This is a sidecar/support slice, so the sidecar's own closeout uses `NO_COMMIT_REQUIRED=1` per the collaboration guide §5 — only the packet markdown changes, no runtime commit is owed by this task.
