# PBK-UI-004 Sidecar Review Packet

This document is the support-only review packet for `PBK-UI-004`
("Authority-safe negative paths"). It does not change canonical truth or the
parent implementation. Its purpose is narrower: give the assigned sidecar
reviewer (`Codex`) a clean evidence summary for the current parent review state
and remove stale packet text that no longer matches the live control plane.

Current reality to preserve:

- The sidecar task `PBK-UI-004-SIDECAR-REVIEW` is in `review`, owned by
  `Codex2`, reviewed by `Codex`.
- The parent task `PBK-UI-004` is also in `review`, but its current structured
  reviewer is `Codex2`, not `Codex`.
- The parent implementation evidence lives on branch `claude2/pbk-ui-004`
  (`origin/claude2/pbk-ui-004`), mainly in commits `f8da53e` and `63f6aef`.
- Dependency `PBK-UI-003` is already `done` on commit
  `89b5a96840987e6caac94d251e76dcbc40f83ce8`.

Anchors used here:

- `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- `apps/partner-booking-web/README.md`
- `git show --stat --summary f8da53e`
- `git show --stat --summary 63f6aef`
- `git branch -a --contains f8da53e`
- `git branch -a --contains 63f6aef`

## §1 Scope & Boundary

- **Task ID:** `PBK-UI-004-SIDECAR-REVIEW`
- **Parent Task:** `PBK-UI-004`
- **Helper Kind:** `review_packet`
- **Sidecar Owner / Reviewer:** `Codex2` -> `Codex`
- **Mutates Canonical:** `false`
- **Objective:** refresh the packet so it matches current machine truth and the
  active parent review evidence, without editing runtime code or L1/L2 truth.

Guardrails for this packet:

- Only `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md` is changed by
  this sidecar branch.
- Any machine-truth state transition belongs in `scripts/ai-status.sh`, not in
  manual edits to `ai-status.json`, `current-work.md`, or activity logs.
- Approval of this sidecar packet is not approval of the parent implementation;
  it only confirms the packet faithfully summarizes the current review state.

## §2 Machine-Truth Anchors

### Sidecar task: `PBK-UI-004-SIDECAR-REVIEW`

| Field | Value |
| --- | --- |
| Title | `Prepare PBK-UI-004 review packet and evidence summary` |
| Owner | `Codex2` |
| Reviewer | `Codex` |
| Status | `review` |
| Depends on | `PBK-UI-003` |
| `task_class` | `sidecar` |
| `helper_kind` | `review_packet` |
| `mutates_canonical` | `false` |
| Artifact | `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md` |
| `last_update` | `2026-05-18T07:36:14Z` |

The sidecar task's current `next` text says the packet was refreshed for a
then-current `Claude2` -> `Codex` parent handoff. That summary is now slightly
stale because the parent reviewer has since been reassigned again. The sidecar
reviewer, however, is still `Codex`.

### Parent task: `PBK-UI-004`

| Field | Value |
| --- | --- |
| Title | `Authority-safe negative paths` |
| Phase | `Wave 5` |
| Owner | `Claude2` |
| Reviewer | `Codex2` |
| Status | `review` |
| Depends on | `PBK-UI-003` |
| Planning ref | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` |
| Acceptance | `pnpm --filter @drts/partner-booking-web typecheck / build / lint`; `Storybook 對照對應 PB_* artboard (PBK-UI-003 起)` |
| `last_update` | `2026-05-18T07:46:24Z` |

Important nuance:

- The parent's structured fields currently route the live parent review to
  `Codex2`.
- The parent's free-text `next` field was overwritten by a later sidecar note
  and still says "Current machine truth remains PBK-UI-004=todo with reviewer
  Codex...". That sentence is stale and should **not** override the structured
  `owner` / `reviewer` / `status` fields above.
- The latest pending handoff row confirms the live parent reviewer movement:
  `Codex` -> `Codex2` at `2026-05-18T07:43:14Z`.

### Dependency: `PBK-UI-003`

| Field | Value |
| --- | --- |
| Title | `CTBC reference funnel — 7 screens` |
| Owner | `Claude2` |
| Reviewer | `Gemini2` |
| Status | `done` |
| Commit | `89b5a96840987e6caac94d251e76dcbc40f83ce8` |
| Commit subject | `fix(PBK-UI-003): drop redundant @drts/ui-web path-map` |
| Push | `origin/claude2/pbk-ui-003` |
| `last_update` | `2026-05-18T07:03:36Z` |

This means the parent dependency gate is now satisfied. The sidecar packet no
longer needs to speak about `PBK-UI-003` as `in_progress`.

## §3 Parent Review Handoff Trail

The most relevant recent handoffs are:

| Timestamp | Handoff | Status | Why it matters |
| --- | --- | --- | --- |
| `2026-05-18T07:17:11Z` | `Codex2` -> `Claude2` | done | parent owner moved back to a healthy lane |
| `2026-05-18T07:21:28Z` | `Claude2` -> `Codex` | done | parent entered review with concrete implementation evidence |
| `2026-05-18T07:43:14Z` | `Codex` -> `Codex2` | pending | parent reviewer moved again after Codex terminal retries |

Reviewer routing consequence:

- `Codex` reviews this **sidecar packet**.
- `Codex2` is the currently structured reviewer for the **parent task**.

The packet must keep those two roles distinct.

## §4 Parent Implementation Evidence

The parent review evidence lives on branch `claude2/pbk-ui-004`
(`origin/claude2/pbk-ui-004`), not on this sidecar branch.

### Commit `f8da53e` — PBK-UI-003 scaffolding import

`git show --stat --summary f8da53e` confirms:

- subject:
  `PBK-UI-004: import PBK-UI-003 base scaffolding (wip anchor)`
- branch containment:
  `claude2/pbk-ui-004`, `origin/claude2/pbk-ui-004`
- 30-file import including:
  - `apps/partner-booking-web/app/[tenantSlug]/(public|authenticated)/*`
  - `apps/partner-booking-web/lib/brand.ts`
  - `packages/ui-tokens/src/brands.ts`
  - `packages/ui-web/src/partner-booking-funnel.tsx`
  - `packages/ui-web/src/partner-booking.stories.tsx`

This anchor matters because the negative-path work was not built on the sparse
README-only partner-booking baseline in this sidecar worktree. It was built on
top of the full PBK-UI-003 funnel surface imported into the owner branch.

### Commit `63f6aef` — authority-safe negative paths

`git show --stat --summary 63f6aef` confirms:

- subject: `PBK-UI-004: preserve authority-safe negative paths`
- branch containment:
  `claude2/pbk-ui-004`, `origin/claude2/pbk-ui-004`
- 15-file diff including the key review surface:
  - `apps/partner-booking-web/app/[tenantSlug]/(public)/eligible/page.tsx`
  - `apps/partner-booking-web/app/[tenantSlug]/(public)/ineligible/page.tsx`
  - `apps/partner-booking-web/app/[tenantSlug]/(public)/manual_review/page.tsx`
  - `apps/partner-booking-web/app/[tenantSlug]/(public)/inactive/page.tsx`
  - `apps/partner-booking-web/app/[tenantSlug]/(public)/eligibility-required/page.tsx`
  - `apps/partner-booking-web/lib/render-state-gate.tsx`
  - `packages/ui-web/src/partner-booking-funnel.tsx`
  - `packages/ui-web/src/index.tsx`
  - `docs/05-ui/drts-design-canvas/Partner Booking.html`
  - `docs/05-ui/drts-design-canvas/partner-screens.jsx`

The commit message itself records the intended semantics:

- the five negative states are explicit `/<tenantSlug>/<state>` routes
- each route delegates to `renderPartnerStateGate`
- the shared UI surface is `@drts/ui-web/PartnerBookingStateGate`
- review assets for `PB_Eligible`, `PB_Ineligible`, `PB_ManualReview`,
  `PB_Inactive`, and `PB_EligibilityRequired` were added under
  `docs/05-ui/drts-design-canvas/`

## §5 Parent Review Evidence Summary

The active parent review handoff from `Claude2` recorded these concrete claims:

- the five authority-safe negative paths were ported into
  `apps/partner-booking-web/app/[tenantSlug]/(public)/`
- the implementation uses `renderPartnerStateGate` and
  `PartnerBookingStateGate` from `@drts/ui-web`
- acceptance reruns passed:
  `pnpm --filter @drts/partner-booking-web typecheck / lint / build`
- the Next build registered all five negative-path routes alongside the
  `PBK-UI-003` funnel
- design-canvas references for the five `PB_*` negative-path artboards were
  added for reviewer spot checks

This packet does not re-run those commands. It consolidates the branch, commit,
and handoff anchors that the current parent reviewer lane should use.

## §6 Sidecar Scope Guardrails

- This sidecar branch only changes the packet file under
  `support/sidecars/PBK-UI-004/`.
- The parent implementation evidence belongs to branch `claude2/pbk-ui-004`,
  not to this sidecar branch.
- The packet must not claim that `Codex` is still the active parent reviewer.
  That was true earlier in the day but is no longer the current structured
  state.
- The packet must not treat the parent's stale free-text `next` string as
  stronger truth than the structured task fields plus pending handoff row.

## §7 Reviewer Checklist For This Sidecar

### A. Machine truth

- [ ] `PBK-UI-004-SIDECAR-REVIEW` still shows owner `Codex2`, reviewer `Codex`,
      status `review`, helper kind `review_packet`, and artifact path under
      `support/sidecars/PBK-UI-004/`.
- [ ] `PBK-UI-004` still shows structured fields
      `owner=Claude2`, `reviewer=Codex2`, `status=review`.
- [ ] `PBK-UI-003` still shows `done` on commit
      `89b5a96840987e6caac94d251e76dcbc40f83ce8`.

### B. Evidence branch

- [ ] `git branch -a --contains f8da53e` lists `claude2/pbk-ui-004` and
      `origin/claude2/pbk-ui-004`.
- [ ] `git branch -a --contains 63f6aef` lists `claude2/pbk-ui-004` and
      `origin/claude2/pbk-ui-004`.
- [ ] The negative-path surface described in §4 is present on the owner branch
      evidence commits, not merely in packet prose.

### C. Sidecar-only hygiene

- [ ] The only task-scoped content change for this sidecar is this packet file.
- [ ] No parent runtime files, no canonical product docs, and no `ai-status`
      content were hand-edited by the sidecar patch.

## §8 Reviewer Handoff Notes

1. This refresh makes the reviewer split explicit: `Codex` reviews the sidecar
   packet, while `Codex2` is now the structured reviewer for the parent task.
2. The parent task's free-text `next` field is stale. Use the structured fields
   plus the latest pending handoff row when deciding who currently owns parent
   review.
3. The sidecar packet now points at the correct implementation evidence branch:
   `claude2/pbk-ui-004`, specifically commits `f8da53e` and `63f6aef`.
4. Approval of this sidecar means the packet is accurate and reviewer-usable.
   It does not approve or close out `PBK-UI-004` itself.
