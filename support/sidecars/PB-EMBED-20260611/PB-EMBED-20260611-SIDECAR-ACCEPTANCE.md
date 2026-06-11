# PB-EMBED-20260611 Acceptance Packet & Dependency Map

This document is the support-only acceptance packet for `PB-EMBED-20260611`
("PB-EMBED: S2 online-banking embed identity states"). It does not change
canonical truth. It consolidates the repo facts that the assigned sidecar
reviewer (`Codex2`) needs in order to verify the already-closed parent task
against machine truth, the design request, and the implementation branch.

Anchors used here come from:

- `scripts/ai-status.sh show PB-EMBED-20260611`
- `docs/05-ui/credit-card-airport-transfer-design-followup-request-20260610.md`
- `docs/05-ui/drts-design-canvas/pb-embed.jsx`
- `apps/partner-booking-web/lib/program-theme.ts`
- `apps/partner-booking-web/lib/program-screens.tsx`
- Branch `origin/codex/pb-embed-20260611`
- Commits `688fe8df`, `ba2be4ce`, `ec80f8d0`

## 1. Scope Boundary

- **Task ID:** `PB-EMBED-20260611-SIDECAR-ACCEPTANCE`
- **Parent Task:** `PB-EMBED-20260611`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Codex`
- **Reviewer:** `Codex2`
- **Mutates Canonical:** `false`
- **Objective:** hand off a reviewer-facing acceptance checklist, dependency map,
  and implementation anchor list for the parent embed-state task without
  editing L1/L2 truth or runtime behavior on this sidecar branch.

Guardrails for this packet:

- Only `support/sidecars/PB-EMBED-20260611/` is touched by this task.
- Machine-truth transitions must go through `scripts/ai-status.sh`.
- The packet does not re-implement the embed flow; it cites the already-pushed
  parent branch and the design/request anchors that the parent closed against.

## 2. Machine-Truth Snapshot

### Parent task: `PB-EMBED-20260611`

| Field | Value |
| --- | --- |
| Title | `PB-EMBED: S2 online-banking embed identity states` |
| Owner | `Codex` |
| Reviewer | `Claude2` |
| Status | `done` |
| Depends on | `[]` |
| Last update | `2026-06-11T02:23:28Z` |
| Commit | `ec80f8d082367d7d693f343ce21fb2fc58aeab97` |
| Push | `origin/codex/pb-embed-20260611` |
| Integration status | `branch_pushed` |

Parent acceptance recorded in machine truth:

1. `the 5 embed states (handoff/reauth/unsupported/consent/fallback) implemented`
2. `identity via issuer reference token with no raw card capture`
3. `fallback routes to the standalone 機場接送 entry;reuse the existing 7-screen funnel + lib/program-theme.ts (do not rebuild card)`
4. `match the canvas BK/PB functions`
5. `zh-TW primary via t()`
6. `issuer brand via program-theme not raw hex so check_ui_realm_tokens passes`
7. `pnpm --filter @drts/partner-booking-web typecheck and build pass`

The parent `next` field already records owner finalize complete:

> review-approved embed identity states are committed and pushed on
> `codex/pb-embed-20260611`; acceptance rerun passed for
> `@drts/partner-booking-web` `typecheck` / `build`

### Sidecar task: `PB-EMBED-20260611-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Owner | `Codex` |
| Reviewer | `Codex2` |
| Status at draft time | `in_progress` |
| `task_class` | `sidecar` |
| `helper_kind` | `acceptance_packet` |
| `mutates_canonical` | `false` |
| Depends on | `[]` |
| Artifact | `support/sidecars/PB-EMBED-20260611/PB-EMBED-20260611-SIDECAR-ACCEPTANCE.md` |

## 3. Delivery Chain

The parent closeout is a three-step chain, not a single opaque `done` state:

| Commit | Role | Key effect |
| --- | --- | --- |
| `688fe8df` | initial implementation | adds embed routes, `lib/embed-states.tsx`, and embed i18n strings for B1-B5 |
| `ba2be4ce` | review fix | fixes the B1/B4 CTA continuation and closes the unauthorized-host bypass on `/[tenantSlug]/embed` |
| `ec80f8d0` | owner closeout | records final verification and push after review approval |

This matters for review because the parent's most important behavioral
guarantees are split across the implementation commit and the follow-up review
fix:

- `688fe8df` introduces the 5-state embed surface.
- `ba2be4ce` ensures the happy path continues into the embed funnel at
  `eligibility`, while the bare `/embed` index cannot bypass the unsupported
  host guard.

## 4. Dependency Map

### 4.1 Formal machine dependencies

`PB-EMBED-20260611.depends_on = []`

This parent task is not machine-blocked by any sibling task. The packet should
not invent extra formal dependencies.

### 4.2 Informative implementation dependencies

These are not machine-enforced backlog dependencies, but they are the source
anchors a reviewer should use when checking whether the parent `done` state is
defensible.

| Anchor | Why it matters |
| --- | --- |
| `docs/05-ui/credit-card-airport-transfer-design-followup-request-20260610.md` §2 | defines request B1-B5 and the non-negotiables: reference-token identity, no raw card capture, compact host chrome, fallback to standalone |
| `docs/05-ui/drts-design-canvas/pb-embed.jsx` | concrete visual/behavioral canvas for `PB_EmbedHandoff`, `PB_EmbedReauth`, `PB_EmbedUnsupported`, `PB_EmbedConsent`, `PB_EmbedFallback` |
| `apps/partner-booking-web/lib/program-theme.ts` | brand authority for issuer palette/wording; reviewer should confirm the embed consumes theme data instead of hard-coded issuer colors |
| `apps/partner-booking-web/lib/program-screens.tsx` | owns the existing standalone 7-screen funnel and the `eligibility` route anchor used by the embed continuation fix |
| `origin/codex/pb-embed-20260611:apps/partner-booking-web/lib/embed-states.tsx` | primary implementation anchor for B1-B5, host guard, standalone fallback, and CTA routing |
| `origin/codex/pb-embed-20260611:apps/partner-booking-web/app/[tenantSlug]/embed/page.tsx` | host-resolved index route; review-fix anchor for unauthorized-host block on bare `/embed` |
| `origin/codex/pb-embed-20260611:apps/partner-booking-web/app/[tenantSlug]/embed/[state]/page.tsx` | per-state entry route with host-resolution enforcement |
| `origin/codex/pb-embed-20260611:apps/partner-booking-web/lib/translations.ts` | zh-TW primary `t()` strings for all embed labels and copy |

## 5. Parent Acceptance Checklist Expansion

### AC-1. Five embed states implemented

Reviewer checks:

- `lib/embed-states.tsx` exports `EMBED_IDENTITY_STATES` with exactly:
  `handoff`, `reauth`, `unsupported`, `consent`, `fallback`.
- `/app/[tenantSlug]/embed/[state]/page.tsx` resolves state segments through
  `resolveEmbedStateSegment`.
- `EmbedIdentityFlow` renders a state nav for those 5 states, matching the
  canvas/request vocabulary.

Expected verdict: `PASS`

### AC-2. Identity via issuer reference token; no raw card capture

Reviewer checks:

- The module comment in `lib/embed-states.tsx` explicitly states identity
  arrives from a signed issuer reference token and the embed never captures raw
  card data.
- Handoff and reauth states render issuer-session / reference-token evidence
  rows, not card-entry fields.
- `translations.ts` copy for reauth/consent/fallback repeats the "never ask
  for card number or password" constraint in zh-TW and en mirrors.

Expected verdict: `PASS`

### AC-3. Fallback returns to the standalone funnel; do not rebuild card flow

Reviewer checks:

- `renderEmbedState()` in `lib/embed-states.tsx` defines `standaloneHref` as
  ``${basePath}/program`` for unsupported/fallback.
- The review fix defines `embedContinueHref` with
  `getProgramScreenHref(`${basePath}/program`, "eligibility")` so handoff and
  consent skip standalone bootstrap but still reuse the existing funnel.
- No parallel standalone card funnel is introduced under `/embed`; the embed
  routes back into the existing `/program` surface.

Expected verdict: `PASS`

### AC-4. Matches the canvas BK/PB functions

Reviewer checks:

- `lib/embed-states.tsx` header comment cites
  `docs/05-ui/drts-design-canvas/pb-embed.jsx`.
- The implementation states correspond directly to canvas functions:
  `PB_EmbedHandoff`, `PB_EmbedReauth`, `PB_EmbedUnsupported`,
  `PB_EmbedConsent`, `PB_EmbedFallback`.
- Visual behavior matches the request intent:
  compact host chrome, host badge, state-specific chips, and standalone
  fallback only for blocked/non-session states.

Expected verdict: `PASS`

### AC-5. zh-TW primary via `t()`

Reviewer checks:

- `lib/embed-states.tsx` imports `t` from `@/lib/translations`.
- `translations.ts` contains the full embed key set in both `zh` and `en`.
- zh-TW copy is the primary behavioral source:
  `embed.flow.summary`, `embed.handoff.note`, `embed.reauth.bodyStrong`,
  `embed.unsupported.title`, `embed.consent.title`, `embed.fallback.title`.

Expected verdict: `PASS`

### AC-6. Issuer brand comes from `program-theme`, not raw issuer hex

Reviewer checks:

- `EmbedIdentityFlow` and `EmbedChrome` consume `PartnerProgramTheme`.
- The routes call `getProgramThemeForSlug(tenantSlug)` instead of embedding a
  card-only brand map locally.
- Reviewer should tolerate shared semantic status colors in
  `lib/embed-states.tsx`; the non-negotiable is that issuer branding and chrome
  colors come from `program-theme.ts`.

Expected verdict: `PASS`

### AC-7. `typecheck` and `build` passed

Machine-truth anchor:

- `ec80f8d0` trailer records:
  `pnpm install --frozen-lockfile PASS`
  `pnpm --filter @drts/partner-booking-web typecheck PASS`
  `pnpm --filter @drts/partner-booking-web build PASS`

Implementation-commit anchor:

- `688fe8df` message also records `typecheck + build + lint pass` at the time
  of implementation.

Expected verdict: `PASS`

## 6. Reviewer Hotspots

`Codex2` should focus on these two review-sensitive behaviors first:

1. The `/[tenantSlug]/embed` index route must not hardcode the happy path.
   `ba2be4ce` changed it to call `resolveEmbedState(theme, "handoff", originHost)`.
2. The B1/B4 primary CTA must continue to
   `/${tenantSlug}/program/eligibility`, not back to the standalone landing
   bootstrap. That fix also landed in `ba2be4ce`.

If those two checks pass, the rest of the packet mostly reduces to confirming
the design request was translated cleanly into the existing partner-booking
surface model.

## 7. Evidence Inventory

| Evidence | Anchor | Status |
| --- | --- | --- |
| Parent machine-truth closeout | `scripts/ai-status.sh show PB-EMBED-20260611` | present |
| Initial B1-B5 implementation | commit `688fe8df` | present |
| Review-fix for CTA continuation and host guard | commit `ba2be4ce` | present |
| Final verification + push | commit `ec80f8d0` | present |
| Request source for B1-B5 | `credit-card-airport-transfer-design-followup-request-20260610.md` §2 | present |
| Canvas source for B1-B5 | `drts-design-canvas/pb-embed.jsx` | present |
| zh-TW embed copy | `origin/codex/pb-embed-20260611:apps/partner-booking-web/lib/translations.ts` | present |

## 8. Sidecar Acceptance Checklist

- [x] Support artifact only; no canonical truth edited
- [x] Parent machine truth copied from the task record without reinterpretation
- [x] Dependency map distinguishes formal machine deps (`[]`) from informative
      implementation anchors
- [x] Reviewer-facing acceptance checklist is tied to concrete files/commits
- [x] Reviewer handoff is possible without switching this sidecar branch into
      the parent branch

## 9. Reviewer Handoff

Suggested reviewer pull list:

1. `scripts/ai-status.sh show PB-EMBED-20260611`
2. `git show 688fe8df --stat --name-only`
3. `git show ba2be4ce --stat --name-only`
4. `git show origin/codex/pb-embed-20260611:apps/partner-booking-web/lib/embed-states.tsx`
5. `git show origin/codex/pb-embed-20260611:apps/partner-booking-web/app/[tenantSlug]/embed/page.tsx`
6. `git show origin/codex/pb-embed-20260611:apps/partner-booking-web/app/[tenantSlug]/embed/[state]/page.tsx`
7. `git show origin/codex/pb-embed-20260611:apps/partner-booking-web/lib/translations.ts`

Suggested approval framing:

- approve if the packet accurately maps the parent's `done` state to those
  anchors and preserves the key review fix in `ba2be4ce`
- reopen only if the packet misstates the fallback/continuation behavior or the
  host-guard behavior
