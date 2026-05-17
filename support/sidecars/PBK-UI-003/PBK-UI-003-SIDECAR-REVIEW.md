# PBK-UI-003 Sidecar Review Packet

This sidecar packet is a support artifact for `PBK-UI-003` only. It does not edit canonical truth, runtime code, contracts, or parent task state. Its job is to summarize the machine-truth anchors and repo evidence that `Claude2` approved for `PBK-UI-003-SIDECAR-REVIEW`, so `Codex2` can close the sidecar cleanly.

## 1. Machine-Truth Snapshot

### Parent task: `PBK-UI-003`

Current `ai-status.json` row:

- Owner: `Claude2`
- Reviewer: `Codex`
- Status: `done`
- Depends on: `PBK-UI-002`
- Planning ref: `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- Commit: `a9a634ae9dba497b9967219ee1f6a6a94768009c`
- Commit subject: `feat(PBK-UI-003): split CTBC funnel into 7 Next.js routes`
- Push: `origin/claude2/pbk-ui-003`
- Last update: `2026-05-17T16:45:58Z`

`ai-status.json` `next` records the parent closeout as:

- CTBC funnel shipped as 7 explicit Next.js routes under `apps/partner-booking-web`
- all routes render the shared `@drts/ui-web` `PartnerBookingReferenceFunnel`
- Codex reran `pnpm --filter @drts/partner-booking-web typecheck / build / lint`
- Codex reran `pnpm --filter @drts/ui-web typecheck / lint / build-storybook`
- closeout commit `a9a634a` was pushed via normal non-force push to `origin/claude2/pbk-ui-003`

### Sidecar task: `PBK-UI-003-SIDECAR-REVIEW`

Current `ai-status.json` row:

- Owner: `Codex2`
- Reviewer: `Claude2`
- Status: `review_approved`
- Helper kind: `review_packet`
- Mutates canonical: `false`
- Artifact: `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-REVIEW.md`
- Last update: `2026-05-17T16:42:38Z`
- Reviewer summary: `Sidecar review packet matches machine truth and verified parent commits; approve`

Note on timing: the packet that reviewer checked was written while the parent was still in review. Parent `PBK-UI-003` later moved to `done` at `2026-05-17T16:45:58Z`. That timing difference is expected and does not invalidate the packet; the reviewer explicitly called out that the sidecar's earlier `in_progress` snapshot was normal lifecycle sequencing, not a defect.

## 2. Parent Evidence Anchors

The parent branch and commits named in machine truth are fetchable and match the implementation history:

- Branch: `origin/claude2/pbk-ui-003`
- Commit `a3ca727`: `feat(PBK-UI-003): add CTBC reference funnel`
- Commit `a9a634a`: `feat(PBK-UI-003): split CTBC funnel into 7 Next.js routes`

Evidence carried forward from those commits and from the reviewer note:

- `a3ca727` introduces `packages/ui-web/src/partner-booking-funnel.tsx`
- `a3ca727` introduces `packages/ui-web/src/partner-booking.stories.tsx`
- `a3ca727` exports the shared surface for partner-booking from `packages/ui-web/src/index.tsx`
- `a9a634a` replaces the old single `app/[tenantSlug]/page.tsx` flow with 7 explicit routes
- `a9a634a` adds the public routes:
  - `/[tenantSlug]`
  - `/[tenantSlug]/eligibility`
  - `/[tenantSlug]/help`
- `a9a634a` adds the authenticated routes:
  - `/[tenantSlug]/book`
  - `/[tenantSlug]/confirmed`
  - `/[tenantSlug]/trips`
  - `/[tenantSlug]/receipt`
- `a9a634a` deletes legacy `apps/partner-booking-web/app/[tenantSlug]/page.tsx` to avoid route-group conflict
- `apps/partner-booking-web/lib/brand.ts` continues to resolve branding through `@drts/ui-tokens` and emits `--pbk-*` CSS vars rather than introducing app-local CTBC-only state

## 3. Reviewer-Approved Findings

`Claude2` approved the sidecar because it matched current machine truth and the verified parent commits:

- parent `PBK-UI-003` reviewer/owner pairing matched the repo state used for review: `Claude2 / Codex`
- dependency `PBK-UI-002` was already `done` at `d7046eb` on `origin/feat/claude2-ui-redesign-foundation`
- the 7 explicit Next.js routes were all present at `a9a634a`
- Storybook `packages/ui-web/src/partner-booking.stories.tsx` from `a3ca727` still carried the 7 exports:
  - `Landing`
  - `Eligibility`
  - `Book`
  - `Confirmed`
  - `Trips`
  - `Receipt`
  - `Help`
- story title remained `Partner Booking/CTBC Funnel`
- the packet stayed inside `support/sidecars/PBK-UI-003/`
- the packet did not change canonical truth or try to overrule the parent review

## 4. Closeout Boundary

This sidecar remains support-only:

- allowed output: this review packet
- not allowed: edits to parent runtime files, canonical truth, contracts, registry logic, or parent task state
- reviewer already passed it at `2026-05-17T16:42:38Z`
- owner closeout should only finalize the sidecar lifecycle and preserve the packet on the correct task branch

## 5. Verification Used For This Packet

Packet refresh and closeout evidence are based on:

- `ai-status.json` rows for `PBK-UI-003`, `PBK-UI-003-SIDECAR-REVIEW`, and `PBK-UI-002`
- `ai-status.json` handoff/review history for `PBK-UI-003` and `PBK-UI-003-SIDECAR-REVIEW`
- `git show --stat --summary a3ca727`
- `git show --stat --summary a9a634a`
- reviewer-approved note stored in `ai-status.json.review_notes_zh`

No canonical truth files were edited to produce this packet refresh.
