# PBK-UI-003 Sidecar Review Packet

This packet is a support artifact for `PBK-UI-003` only. It does not change
canonical truth, runtime code, contracts, or the parent task state. Its job is
to summarize the current machine-truth anchors and the candidate implementation
evidence that the parent reviewer (`Codex2`) needs, then hand that summary to
the sidecar reviewer (`Codex2`).

This worktree is the isolated sidecar branch, not the parent implementation
branch. Parent evidence below is therefore anchored to canonical machine truth
at `/home/edna/workspace/drts-fleet-platform/ai-status.json` and to the live
parent branch ref `origin/claude2/pbk-ui-003`.

Anchors used here:

- `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md`
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- `docs/05-ui/drts-design-canvas/Partner Booking.html`
- `apps/partner-booking-web/lib/brand.ts` at `origin/claude2/pbk-ui-003`
- `apps/partner-booking-web/app/[tenantSlug]/(public|authenticated)/...` at
  `origin/claude2/pbk-ui-003`
- `packages/ui-web/src/partner-booking-funnel.tsx` at
  `origin/claude2/pbk-ui-003`
- `packages/ui-web/src/partner-booking.stories.tsx` at
  `origin/claude2/pbk-ui-003`
- `packages/ui-web/src/index.tsx` at `origin/claude2/pbk-ui-003`
- `packages/ui-tokens/src/brands.ts` at commit `d7046eb`
- commits `a3ca727`, `a9a634a`, `fae4de0`, and `89b5a96`

## 1. Scope And Boundary

- **Task ID:** `PBK-UI-003-SIDECAR-REVIEW`
- **Parent Task:** `PBK-UI-003`
- **Helper Kind:** `review_packet`
- **Owner:** `Codex`
- **Reviewer:** `Codex2`
- **Mutates Canonical:** `false`
- **Artifact:** `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-REVIEW.md`

Guardrails for this packet:

- Keep output confined to `support/sidecars/PBK-UI-003/`.
- Do not change parent runtime files, `ai-status.json`, planning refs, or the
  `PBK-UI-002` brand-layer contract except through normal state commands.
- Treat the acceptance packet as the upstream scope/dependency reference; this
  review packet extends it with review evidence rather than replacing it.
- Do not claim parent acceptance from this sidecar. Parent `PBK-UI-003` stays a
  separate review decision owned by `Claude2` and reviewed by `Codex2`.

Control-plane note: the embedded dispatch brief claimed this sidecar for
`Codex` at `2026-05-18T04:30:26Z`, but the isolated worktree did not contain a
fresh local copy of the sidecar task row or artifact. Canonical machine truth
now records the coherent active pair `owner=Codex`, `reviewer=Codex2`.

## 2. Machine-Truth Snapshot

These fields were re-read from canonical machine truth during the owner refresh
at `2026-05-18T05:51:04Z`, immediately before the re-handoff that moved this
sidecar back to `review` at `2026-05-18T05:54:25Z`.

### Parent task: `PBK-UI-003`

| Field | Value |
| --- | --- |
| Owner | `Claude2` |
| Reviewer | `Codex2` |
| Status | `review` |
| Depends on | `PBK-UI-002` |
| Planning ref | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` |
| Last update | `2026-05-18T04:47:00Z` |
| Pending handoff | `Claude2 -> Codex2` |

Current canonical `next` summary for the parent:

- chair review reassigned the parent reviewer from `Codex` to `Codex2`
- rationale recorded in machine truth: keep owner/reviewer separation from
  `Claude2` and move the review off the `Codex` lane after the `2/2` terminal
  review loop
- the implementation evidence under review still points at branch head
  `89b5a96`

### Sidecar task: `PBK-UI-003-SIDECAR-REVIEW`

| Field | Value |
| --- | --- |
| Owner | `Codex` |
| Reviewer | `Codex2` |
| Status | `review` |
| Depends on | `PBK-UI-002` |
| Helper kind | `review_packet` |
| Mutates canonical | `false` |
| Last update | `2026-05-18T05:54:25Z` |
| Refresh snapshot cited by handoff | `2026-05-18T05:51:04Z` |

This row reflects the completed owner refresh and the reviewer handoff recorded
in canonical machine truth. The current `next` summary states that the packet
was refreshed for current machine truth after parent reviewer drift, now cites
parent reviewer `Codex2`, parent `last_update=2026-05-18T04:47:00Z`, and the
sidecar refresh snapshot at `2026-05-18T05:51:04Z`, with verification via:

- `jq '.tasks[] | select(.id=="PBK-UI-003-SIDECAR-REVIEW" or .id=="PBK-UI-003" or .id=="PBK-UI-002")'`
- `git log --oneline --decorate origin/claude2/pbk-ui-003 -8`
- `git diff --check -- support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-REVIEW.md`

### Direct dependency: `PBK-UI-002`

`PBK-UI-002` remains the concrete prerequisite and is still recorded as:

- `status=done`
- `commit_hash=d7046eb`
- `commit_subject=PBK-UI-002 Partner token brand chrome`
- `push_ref=origin/feat/claude2-ui-redesign-foundation`
- `reviewer=Codex`

That dependency still anchors brand resolution through `@drts/ui-tokens` rather
than through app-local CTBC constants.

## 3. Parent Evidence Map

### A. Commit chain on `origin/claude2/pbk-ui-003`

| Commit | Purpose | Evidence carried by the commit |
| --- | --- | --- |
| `a3ca727` | add CTBC reference funnel | introduces `packages/ui-web/src/partner-booking-funnel.tsx`, `packages/ui-web/src/partner-booking.stories.tsx`, `@drts/ui-web` exports, and the first app integration |
| `a9a634a` | split funnel into 7 explicit routes | replaces the old single `app/[tenantSlug]/page.tsx` flow with seven concrete Next.js routes under `(public|authenticated)` |
| `fae4de0` | restore lockfile and white-label heading | fixes the missing `@drts/ui-web` importer entry in `pnpm-lock.yaml` and removes CTBC-only heading copy from `partner-booking-funnel.tsx` |
| `89b5a96` | drop redundant `@drts/ui-web` path-map | removes the tsconfig path override so `partner-booking-web` resolves `@drts/ui-web` through the workspace package boundary |

`6ea7594` also exists in the branch history, but it is only a machine-truth
anchor commit for prior review state. It does not carry parent runtime changes.

### B. Seven concrete route files

At `origin/claude2/pbk-ui-003`, the app tree contains the exact seven route
files required by the planning ref:

| Screen | File | `activeScreen` |
| --- | --- | --- |
| Landing | `app/[tenantSlug]/(public)/page.tsx` | `landing` |
| Eligibility | `app/[tenantSlug]/(public)/eligibility/page.tsx` | `eligibility` |
| Help | `app/[tenantSlug]/(public)/help/page.tsx` | `help` |
| Book | `app/[tenantSlug]/(authenticated)/book/page.tsx` | `book` |
| Confirmed | `app/[tenantSlug]/(authenticated)/confirmed/page.tsx` | `confirmed` |
| Trips | `app/[tenantSlug]/(authenticated)/trips/page.tsx` | `trips` |
| Receipt | `app/[tenantSlug]/(authenticated)/receipt/page.tsx` | `receipt` |

Each page follows the same pattern:

- await `params.tenantSlug`
- resolve the brand through `getBrandForSlug`
- call `notFound()` for an unknown slug
- render `<PartnerBookingReferenceFunnel brand={brand} activeScreen=... basePath={...} />`

`a9a634a` also deletes legacy `apps/partner-booking-web/app/[tenantSlug]/page.tsx`
to avoid route conflict with `(public)/page.tsx`.

### C. Shared white-label funnel surface

`a3ca727` introduces `packages/ui-web/src/partner-booking-funnel.tsx` and
defines the canonical screen ids:

- `landing`
- `eligibility`
- `book`
- `confirmed`
- `trips`
- `receipt`
- `help`

The same file exposes screen metadata with the expected artboard eyebrows:

- `PB_Landing`
- `PB_Eligibility`
- `PB_Book`
- `PB_Confirmed`
- `PB_Trips`
- `PB_Receipt`
- `PB_Help`

`packages/ui-web/src/index.tsx` exports:

- `PartnerBookingReferenceFunnel`
- `PartnerBookingPhoneScreen`
- `partnerBookingScreens`
- `isPartnerBookingScreenId`
- `getPartnerBookingScreenMeta`
- `getPartnerBookingArtboardAnchor`

This keeps the rendered partner-booking surface in one shared white-label
component rather than duplicating screen markup inside the app routes.

### D. Storybook parity evidence

`a3ca727` also introduces `packages/ui-web/src/partner-booking.stories.tsx`.
At branch head `89b5a96`, it still provides:

- story title `Partner Booking/CTBC Funnel`
- exports `Landing`, `Eligibility`, `Book`, `Confirmed`, `Trips`, `Receipt`,
  and `Help`
- an iframe parity target of
  ``docs/05-ui/drts-design-canvas/Partner Booking.html#${anchor}``
- artboard anchors derived through `getPartnerBookingArtboardAnchor(screen)`

This matches the parent acceptance requirement that Storybook comparison begins
with `PBK-UI-003`.

### E. Brand boundary remains token-driven

The parent branch still keeps branding behind the `PBK-UI-002` contract:

- `apps/partner-booking-web/lib/brand.ts` re-exports `PartnerBrandTemplate`
  from `@drts/ui-tokens`
- brand lookup is `getPartnerBrandTemplateBySlug`
- app chrome variables are emitted as `--pbk-*`
- `d7046eb:packages/ui-tokens/src/brands.ts` remains the source for
  `BRAND_TEMPLATES.CTBC`, `CATHAY`, and `GRAND`

The white-label copy regression called out by `Codex` at `2026-05-18T03:45:52Z`
was addressed in `fae4de0`, which changed the funnel heading from a CTBC-only
label to `${brand.displayName} reference funnel · 7 screens` and replaced a
CTBC-only artboard sentence with brand-agnostic PB_* wording.

## 4. Review History And Residual Audit Points

Two parent review failures matter to this packet because they explain why the
current review handoff is at `89b5a96`, not at `a9a634a`:

1. `2026-05-18T03:45:52Z` rejection:
   - `pnpm-lock.yaml` was stale for the new `@drts/ui-web` workspace dep
   - `partner-booking-funnel.tsx` still contained CTBC-only heading/canvas copy
   - `fae4de0` addresses both
2. `2026-05-18T04:05:00Z` rejection:
   - clean-checkout `partner-booking-web typecheck` failed because
     `apps/partner-booking-web/tsconfig.json` path-mapped `@drts/ui-web`
     directly to source
   - `89b5a96` removes that redundant path-map

Current residual audit points for the parent reviewer (`Codex2`):

- rerun the parent acceptance commands from a clean checkout if trust in the
  owner's `89b5a96` verification is still in question
- confirm the seven route files still point at the shared funnel surface
- confirm Storybook parity still resolves to the intended `PB_*` anchors
- confirm no app-local CTBC registry or CTBC-only copy has reappeared

This sidecar packet does not pre-approve any of those parent gates. It only
packages the evidence and review history.

## 5. Sidecar Reviewer Checklist For `Codex2`

- [ ] Re-read canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  and confirm `PBK-UI-003` is still `owner=Claude2`, `reviewer=Codex2`,
  `status=review`, `last_update=2026-05-18T04:47:00Z`, and branch-head review
  evidence still points at `89b5a96`.
- [ ] Confirm `PBK-UI-003-SIDECAR-REVIEW` is still `owner=Codex`,
  `reviewer=Codex2`, `helper_kind=review_packet`,
  `mutates_canonical=false`, `status=review`, `last_update=2026-05-18T05:54:25Z`,
  and that the latest owner handoff references the `2026-05-18T05:51:04Z`
  refresh snapshot.
- [ ] Confirm `PBK-UI-002` is still `done` at `d7046eb`.
- [ ] Confirm branch `origin/claude2/pbk-ui-003` still contains commits
  `a3ca727`, `a9a634a`, `fae4de0`, and `89b5a96`.
- [ ] Confirm the only task-scoped content edit is this file under
  `support/sidecars/PBK-UI-003/`.
- [ ] Approve this sidecar only if the packet still matches live machine truth
  and the parent evidence branch named above.
