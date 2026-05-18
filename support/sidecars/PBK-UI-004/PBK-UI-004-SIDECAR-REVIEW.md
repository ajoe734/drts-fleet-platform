# PBK-UI-004 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `PBK-UI-004` — Authority-safe negative paths
**Parent Owner:** `Claude2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Codex2`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-18` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, or the parent review verdict.

This packet replaces an older stale closeout-oriented draft. Current machine
truth says parent `PBK-UI-004` is in `review`, not `done`. The purpose here is
to hand `Codex` a reviewer-facing evidence summary that matches the live
`ai-status.json` row, the current pending parent handoff to `Codex`, and the
concrete commit surface on branch `claude2/pbk-ui-004`.

---

## 1. Scope Boundary

In scope:

- summarize stable machine-truth anchors for this sidecar and parent
  `PBK-UI-004`
- record the dependency baseline on `PBK-UI-003`
- capture the current parent review-ready state, including owner/reviewer
  reassignment trail and the latest handoff message
- pin the implementation surface to commits `f8da53e` and `63f6aef` on
  `claude2/pbk-ui-004`
- restate the reviewer checks that matter for the current parent review

Out of scope:

- editing `apps/partner-booking-web/**`, `packages/ui-web/**`, or
  `docs/05-ui/drts-design-canvas/**`
- changing parent task `PBK-UI-004` status, reviewer verdict, or closeout
  metadata
- editing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  except through sidecar lifecycle commands
- claiming parent `done` evidence that does not yet exist in machine truth

---

## 2. Machine-Truth Anchors

### Sidecar task — `PBK-UI-004-SIDECAR-REVIEW`

Stable fields in canonical `ai-status.json`
(`/home/edna/workspace/drts-fleet-platform/ai-status.json`):

- owner=`Codex2`
- reviewer=`Codex`
- status=`in_progress`
- phase=`Wave 5`
- task_class=`sidecar`
- helper_parent=`PBK-UI-004`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- depends_on=`PBK-UI-003`
- artifact=`support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md`

Current owner note in machine truth:

- `Packet being rewritten from stale closeout narrative to current review-ready handoff aligned with parent PBK-UI-004 review state`

### Parent task — `PBK-UI-004`

Stable fields in canonical `ai-status.json`:

- title=`Authority-safe negative paths`
- owner=`Claude2`
- reviewer=`Codex`
- status=`review`
- depends_on=`PBK-UI-003`
- acceptance:
  - `pnpm --filter @drts/partner-booking-web typecheck / build / lint`
  - `Storybook 對照對應 PB_* artboard (PBK-UI-003 起)`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- last_update=`2026-05-18T07:21:28Z`

Current pending review handoff in machine truth:

- from=`Claude2`
- to=`Codex`
- created_at=`2026-05-18T07:21:28Z`
- message summary:
  - five authority-safe negative paths were ported into
    `apps/partner-booking-web/app/[tenantSlug]/(public)/`
  - implementation uses `renderPartnerStateGate` plus
    `@drts/ui-web/PartnerBookingStateGate`
  - commits cited: `f8da53e` and `63f6aef`
  - verification cited:
    `pnpm --filter @drts/partner-booking-web typecheck / lint / build`
  - Storybook/design review anchor cited:
    `PB_Eligible`, `PB_Ineligible`, `PB_ManualReview`, `PB_Inactive`,
    `PB_EligibilityRequired`

### Dependency — `PBK-UI-003`

Canonical dependency baseline:

- status=`done`
- owner=`Claude2`
- reviewer=`Gemini2`
- commit_hash=`89b5a96840987e6caac94d251e76dcbc40f83ce8`
- commit_subject=`fix(PBK-UI-003): drop redundant @drts/ui-web path-map`
- push_ref=`origin/claude2/pbk-ui-003`

Why it matters:

- `PBK-UI-004` is layered on top of the shipped PBK-UI-003 seven-screen CTBC
  funnel baseline rather than re-implementing the funnel from scratch

---

## 3. Parent Lifecycle Relevant To This Review

The important lifecycle facts for this packet are:

| Timestamp UTC          | Event                | Meaning |
| ---------------------- | -------------------- | ------- |
| `2026-05-18T07:03:36Z` | `PBK-UI-003` `done`  | Dependency closed out on `origin/claude2/pbk-ui-003` with full app verification. |
| `2026-05-18T07:17:11Z` | owner reassignment   | `PBK-UI-004` ownership moved from `Codex2` to `Claude2` because `Codex2` had repeated worker exits on this task. |
| `2026-05-18T07:21:28Z` | parent `handoff`     | `Claude2` handed `PBK-UI-004` to reviewer `Codex` with commits, acceptance commands, and design-artboard anchors. |
| `2026-05-18T07:25:39Z` | sidecar `assign`     | This sidecar was registered with owner `Codex2` as a support-only review-packet slice for parent `PBK-UI-004`. |

Reviewer interpretation:

- the parent is waiting on `Codex`, not on closeout
- this sidecar should help verify the review-ready evidence packet, not claim
  the parent has already been approved or pushed to `done`

---

## 4. Review Surface Anchors

The parent handoff points to two commits on branch `claude2/pbk-ui-004`, and
`git branch -a --contains` confirms both are reachable from:

- local `claude2/pbk-ui-004`
- `remotes/origin/claude2/pbk-ui-004`

### Commit `f8da53e` — PBK-UI-003 base scaffolding import

`git show --stat --summary f8da53e` reports a large base import so PBK-UI-004
can compile on a clean `origin/dev` base before PBK-UI-003 merges forward.
Load-bearing files from that import include:

- `apps/partner-booking-web/app/[tenantSlug]/(public)/page.tsx`
- `apps/partner-booking-web/app/[tenantSlug]/(public)/eligibility/page.tsx`
- `apps/partner-booking-web/app/[tenantSlug]/(authenticated)/book/page.tsx`
- `packages/ui-web/src/partner-booking-funnel.tsx`
- `packages/ui-web/src/index.tsx`
- `apps/partner-booking-web/lib/brand.ts`

Interpretation:

- `f8da53e` is the mechanical base layer that brings the PBK-UI-003 funnel
  surface into the PBK-UI-004 branch
- reviewer focus for `PBK-UI-004` should stay on the delta added by `63f6aef`

### Commit `63f6aef` — authority-safe negative paths

`git show --stat --summary 63f6aef` records the actual PBK-UI-004 delta:

- five new direct routes under
  `apps/partner-booking-web/app/[tenantSlug]/(public)/`:
  - `eligible/page.tsx`
  - `ineligible/page.tsx`
  - `manual_review/page.tsx`
  - `inactive/page.tsx`
  - `eligibility-required/page.tsx`
- new helper:
  `apps/partner-booking-web/lib/render-state-gate.tsx`
- shared UI additions in:
  `packages/ui-web/src/partner-booking-funnel.tsx`
  and `packages/ui-web/src/index.tsx`
- design-canvas review anchors added under `docs/05-ui/drts-design-canvas/`,
  including `Partner Booking.html` plus the supporting JSX/assets

This is the review surface that the parent handoff asks `Codex` to validate.

---

## 5. Source-Level Evidence Summary

### `apps/partner-booking-web/lib/render-state-gate.tsx`

Commit `63f6aef` adds `renderPartnerStateGate(params, state)`:

- awaits `tenantSlug`
- resolves the brand through `getBrandForSlug(tenantSlug)`
- calls `notFound()` for unknown slugs
- renders `PartnerBookingStateGate` with `brand`, `state`, and
  `basePath=\`/${tenantSlug}\``

Review value:

- the direct negative-path routes stay white-label-aware
- unknown tenant slugs fail closed rather than rendering an unbranded surface

### `packages/ui-web/src/partner-booking-funnel.tsx`

Commit `63f6aef` adds a dedicated negative-path state model:

- `partnerBookingStateScreens =`
  `["eligible", "ineligible", "manual_review", "inactive", "eligibility_required"]`
- `PartnerBookingStateScreenId`
- per-state metadata with:
  - `routeSegment`
  - `label`
  - `title`
  - `summary`
  - `guidance`
  - `primaryAction`
  - `secondaryAction`
  - `bullets`

Important nuance:

- route file names mix underscore and hyphen forms:
  - internal state id: `eligibility_required`
  - external route segment: `eligibility-required`
- reviewer should confirm that this mapping stays intentional and is not a
  broken mismatch

The same metadata block shows the intended behavioral split:

- `eligible` keeps booking progression available
- `ineligible` blocks booking and redirects toward retry/support
- `manual_review` is a hard stop with support/entry fallback
- `inactive` is an explicit inactive entry state
- `eligibility_required` routes the rider back through eligibility before
  booking is unlocked

### `packages/ui-web/src/index.tsx`

Commit `63f6aef` re-exports the negative-path surface:

- `getPartnerBookingStateHref`
- `getPartnerBookingStateScreenMeta`
- `partnerBookingStateScreens`
- `PartnerBookingStateGate`
- `PartnerBookingStateScreenId`

Review value:

- the state-gate API is consumable from app code without reaching into private
  module paths

### `apps/partner-booking-web/README.md`

The README on the parent branch states:

- PBK-UI-003 owns the seven explicit funnel routes
- PBK-UI-004 owns the authority-safe negative-path direct gate routes
- PBK-UI-005 remains the separate cutover-policy decision doc

Review value:

- the docs keep scope separation explicit
- PBK-UI-004 is framed as route/state work, not deployment or cutover policy

---

## 6. Acceptance Evidence Mapping

The parent handoff message to `Codex` claims:

| Acceptance item | Evidence currently available |
| --------------- | ---------------------------- |
| `pnpm --filter @drts/partner-booking-web typecheck` | Explicitly cited in the parent handoff message at `2026-05-18T07:21:28Z`. |
| `pnpm --filter @drts/partner-booking-web lint` | Explicitly cited in the parent handoff message at `2026-05-18T07:21:28Z`. |
| `pnpm --filter @drts/partner-booking-web build` | Explicitly cited in the parent handoff message at `2026-05-18T07:21:28Z`, including route registration for the five negative-path pages. |
| Storybook / PB_* artboard comparison | Parent handoff cites `PB_Eligible`, `PB_Ineligible`, `PB_ManualReview`, `PB_Inactive`, `PB_EligibilityRequired` as the review anchors now present under `docs/05-ui/drts-design-canvas/`. |

What is intentionally not claimed yet:

- no parent `review_approved` note exists yet
- no parent `done` metadata (`commit_hash`, `push_remote`, `push_branch`) exists
  yet in machine truth
- this sidecar packet does not invent those fields ahead of the parent review

---

## 7. Reviewer Spot-Check Checklist

For sidecar reviewer `Codex`:

- [ ] Canonical `ai-status.json` still shows this sidecar owned by `Codex2`,
      reviewed by `Codex`, support-only, depending on `PBK-UI-003`.
- [ ] Canonical `ai-status.json` still shows parent `PBK-UI-004` in `review`
      with owner `Claude2`, reviewer `Codex`, and the `2026-05-18T07:21:28Z`
      handoff message.
- [ ] Canonical `ai-status.json` still shows dependency `PBK-UI-003` as `done`
      at commit `89b5a96840987e6caac94d251e76dcbc40f83ce8`.
- [ ] `git branch -a --contains f8da53e` and `git branch -a --contains 63f6aef`
      still include `claude2/pbk-ui-004` and
      `remotes/origin/claude2/pbk-ui-004`.
- [ ] `git show 63f6aef:apps/partner-booking-web/lib/render-state-gate.tsx`
      still resolves brand by slug and `notFound()`s unknown slugs.
- [ ] `git show 63f6aef:packages/ui-web/src/partner-booking-funnel.tsx`
      still defines exactly five negative-path states:
      `eligible`, `ineligible`, `manual_review`, `inactive`,
      `eligibility_required`, with `eligibility-required` as the route segment
      for the last case.
- [ ] `git show 63f6aef:packages/ui-web/src/index.tsx` still re-exports the
      state-gate surface.
- [ ] `git show 63f6aef:apps/partner-booking-web/README.md` still separates
      PBK-UI-003, PBK-UI-004, and PBK-UI-005 responsibilities cleanly.
- [ ] The only task-scoped content edit under this sidecar remains this packet
      file in `support/sidecars/PBK-UI-004/`.

---

## 8. Handoff Notes For `Codex`

1. Treat this as a support packet for the parent review currently pending with
   `Codex`. It is not a replacement for the parent reviewer decision.
2. The previous version of this file assumed parent closeout metadata from an
   older branch state. That was stale relative to canonical machine truth on
   `2026-05-18`; this rewrite deliberately removes those premature `done`
   claims.
3. If parent `PBK-UI-004` advances to `review_approved` or `done` before you
   review this sidecar, update the packet or request a refresh rather than
   approving stale lifecycle text.
4. If the parent handoff commit set changes away from `f8da53e` and `63f6aef`,
   reopen this sidecar instead of approving a packet that points at the wrong
   review surface.
5. Approval should confirm that this sidecar stayed support-only and that any
   machine-truth transitions happened through `scripts/ai-status.sh` or
   `python3 scripts/ai_status.py`, not by manual edits to canonical status
   files.
