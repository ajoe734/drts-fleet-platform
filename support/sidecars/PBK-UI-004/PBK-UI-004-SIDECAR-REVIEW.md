# PBK-UI-004 Sidecar Review Packet

This document is the parallel review-support packet for `PBK-UI-004` ("Authority-safe negative paths"). It does not change canonical truth. It consolidates the repo facts and verification evidence that the assigned sidecar reviewer (`Codex2`) needs to confirm that the parent task's `done` state in `ai-status.json` — recorded at `2026-05-12T21:11:06Z` with commit `13104105d299eadd0b433596b2f173249dfbb5fc` (`feat(PBK-UI-004): preserve authority-safe partner negative paths`) pushed to `origin/feat/claude2-ui-redesign-foundation` — is justified by what is actually in the tree.

Anchors used here:

- `ai-status.json`
- `apps/partner-booking-web/app/[tenantSlug]/page.tsx`
- `apps/partner-booking-web/app/[tenantSlug]/[routeState]/page.tsx`
- `apps/partner-booking-web/lib/route-state.ts`
- `apps/partner-booking-web/README.md`
- `packages/ui-web/src/partner-booking-funnel.tsx`
- `packages/ui-web/src/index.tsx`
- `apps/tenant-console-web/app/partner/(authenticated)/eligibility/page.tsx`
- `apps/tenant-console-web/app/partner/(authenticated)/booking/new/page.tsx`
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` §`PBK-UI-004`

## §1 Scope & Boundary

- **Task ID:** `PBK-UI-004-SIDECAR-REVIEW`
- **Parent Task:** `PBK-UI-004`
- **Helper Kind:** `review_packet`
- **Owner:** `Claude`
- **Reviewer:** `Codex2`
- **Mutates Canonical:** `false`
- **Objective:** Hand off a reviewer-facing evidence summary for the parent authority-safe negative-paths task without editing L1/L2 truth, runtime code, or the parent backlog item itself. At the moment this refreshed packet is handed off, the parent is `done` — reviewer `Codex` previously passed the implementation at `2026-05-12T21:04:38Z`, owner `Codex2` finalised closeout at `2026-05-12T21:11:06Z` with task-scoped commit `13104105d299eadd0b433596b2f173249dfbb5fc` pushed to `origin/feat/claude2-ui-redesign-foundation`. The packet records what the implementation surface actually contains, how it lines up with the parent's acceptance, and what `Codex2` (sidecar reviewer) should re-confirm before approving this sidecar.

Guardrails for this packet:

- Only the artifact under `support/sidecars/PBK-UI-004/` is touched.
- Machine-truth state transitions go through `scripts/ai-status.sh`, never by hand-editing `ai-status.json` / `current-work.md` / `ai-activity-log.jsonl`.
- The packet does not re-decide parent scope; it cites what was already decided in `ai-status.json` and the workbreakdown planning doc.

## §2 Machine-Truth Anchors

### Parent task: `PBK-UI-004`

| Field                | Value                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Title                | `Authority-safe negative paths`                                                                                                              |
| Phase                | `Wave 5`                                                                                                                                     |
| Owner                | `Codex2`                                                                                                                                     |
| Reviewer             | `Codex`                                                                                                                                      |
| Status               | `done` (closeout finalised by `Codex2` after review approval by `Codex`)                                                                     |
| Depends on           | `PBK-UI-003` (`done` at commit `fbc05f6`)                                                                                                    |
| Planning ref         | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`                                                                                      |
| Acceptance           | `pnpm --filter @drts/partner-booking-web typecheck / build / lint`; `Storybook 對照對應 PB_* artboard (PBK-UI-003 起)`                       |
| Last update          | `2026-05-12T21:11:06Z` (parent `done`; reviewer approval recorded at `2026-05-12T21:04:38Z`)                                                 |
| Commit hash          | `13104105d299eadd0b433596b2f173249dfbb5fc`                                                                                                   |
| Commit subject       | `feat(PBK-UI-004): preserve authority-safe partner negative paths`                                                                           |
| Commit agent         | `Codex2`                                                                                                                                     |
| Commit reviewer      | `Codex`                                                                                                                                      |
| Push remote / branch | `origin` / `feat/claude2-ui-redesign-foundation`                                                                                             |
| Push recorded at     | `2026-05-12T21:11:06Z`                                                                                                                       |
| `review_notes_zh[0]` | `核對舊 partner flow 語義：eligible / ineligible / manual_review 停在 eligibility gate；inactive / eligibility-required 停在 booking gate。` |
| `review_notes_zh[1]` | `/[tenantSlug]/[routeState] 與 root ?screen / ?scenario fallback 解析一致，未知 state 會 notFound()。`                                       |
| `review_notes_zh[2]` | `驗證通過：pnpm --filter @drts/partner-booking-web typecheck、build、lint，以及 pnpm --filter @drts/ui-web build-storybook。`                |
| `review_notes_zh[3]` | `既有 PB_* Storybook parity story 仍可 build；negative-path 呈現透過同一組 eligibility / book artboard screen 承載。`                        |

The parent's `next` field at `done` records the closeout summary verbatim: "Closeout complete: task-scoped commit pushed after review-approved partner negative path parity for eligible/ineligible/manual*review/inactive/eligibility-required routes." The earlier reviewer summary at `review_approved` ("Review passed: authority-safe direct routes preserve tenant-console-web gate parity, unknown route states 404 correctly, and verification passed for partner-booking-web typecheck/build/lint plus ui-web build-storybook") is preserved in the four `review_notes_zh` items and the `commit*_`/`push\__` fields above are now populated, so the closeout invariant (`done`requires`COMMIT_HASH`/`COMMIT_SUBJECT`/`PUSH_REMOTE`/`PUSH_BRANCH`) is satisfied.

### This sidecar task: `PBK-UI-004-SIDECAR-REVIEW`

| Field               | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| Owner               | `Claude`                                                   |
| Reviewer            | `Codex2`                                                   |
| Status              | `review` (handed off after the post-`done` refresh)        |
| `task_class`        | `sidecar`                                                  |
| `helper_kind`       | `review_packet`                                            |
| `mutates_canonical` | `false`                                                    |
| Depends on          | `PBK-UI-003`                                               |
| Artifact            | `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md` |

## §3 Delivered Surface — what landed in the closeout commit

The parent implementation now lives in task-scoped commit `13104105d299eadd0b433596b2f173249dfbb5fc` on `feat/claude2-ui-redesign-foundation` (pushed to `origin`). `git show --stat 13104105d299eadd0b433596b2f173249dfbb5fc` lists six files (`456 insertions(+), 24 deletions(-)`), and the trailer carries `LLM-Agent: Codex2 / Task-ID: PBK-UI-004 / Reviewer: Codex / Verification: pnpm --filter @drts/partner-booking-web typecheck; … build; … lint; pnpm --filter @drts/ui-web build-storybook`. The following paths together form the `PBK-UI-004` surface in that commit:

| Path                                                              | Change in commit                 | Role                                                                                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/partner-booking-web/app/[tenantSlug]/[routeState]/page.tsx` | new (+32 lines)                  | Dynamic catch-segment that resolves a single path token (`eligible`, `ineligible`, `manual_review`, `inactive`, `eligibility-required`, or a screen id) and renders the funnel. |
| `apps/partner-booking-web/lib/route-state.ts`                     | new (+55 lines)                  | Pure resolvers: `resolvePartnerRouteState(routeState)` returns `null` for unknown ids; `resolvePartnerSearchState(screen, scenario)` is the `?screen` / `?scenario` fallback.   |
| `apps/partner-booking-web/app/[tenantSlug]/page.tsx`              | modified (+/− 28 lines)          | Switches root tenant page from inline `normalizeScreen` to shared `resolvePartnerSearchState`, forwards `activeScenario` to the funnel.                                         |
| `apps/partner-booking-web/README.md`                              | modified (+10 lines)             | Routing-rules section now documents the five direct authority-safe routes alongside `?screen` / `?scenario` backward-compat entry.                                              |
| `packages/ui-web/src/partner-booking-funnel.tsx`                  | modified (+346 / heavy refactor) | Adds `partnerBookingScenarios`, `PartnerBookingScenarioId`, scenario metadata, `scenarioScreenById` mapping, scenario chip rendering, and `activeScenario` prop on the funnel.  |
| `packages/ui-web/src/index.tsx`                                   | modified (+9 lines)              | Re-exports `partnerBookingScenarios`, `PartnerBookingScenarioId`, `isPartnerBookingScenarioId`, `getPartnerBookingScenarioMeta`, `getPartnerBookingScenarioScreen`.             |

Because the closeout commit has already landed, the sidecar reviewer can audit either against the commit (e.g. `git show 13104105 -- <path>`) or against the working tree on `feat/claude2-ui-redesign-foundation` — they line up. No other paths in the diff fall outside this task scope.

### Surface facts that line up with the diff

- `packages/ui-web/src/partner-booking-funnel.tsx` declares
  `partnerBookingScenarios = ["eligible", "ineligible", "manual_review", "inactive", "eligibility-required"] as const`
  and exposes the five scenarios through `PartnerBookingScenarioId`, `getPartnerBookingScenarioMeta`, `getPartnerBookingScenarioScreen`, and `isPartnerBookingScenarioId`.
- The same module's `scenarioScreenById` table is the single source of truth for which screen a scenario lands on:
  - `eligible`, `ineligible`, `manual_review` → screen `eligibility`
  - `inactive`, `eligibility-required` → screen `book`
- `PartnerBookingPhoneScreen` (single-phone render) and `PartnerBookingReferenceFunnel` (multi-screen chrome) both accept `scenario`/`activeScenario` and pass it through to the appropriate gate. The chrome additionally renders an "Authority-safe states" section whose links use `buildScenarioHref(basePath, scenario)` → `${basePath}/${scenario}`.
- `apps/partner-booking-web/app/[tenantSlug]/[routeState]/page.tsx` is the direct-route renderer:
  1. resolves brand via `getBrandForSlug(tenantSlug)`; unknown slug → `notFound()`,
  2. resolves the dynamic segment via `resolvePartnerRouteState(routeState)`; unknown id → `notFound()`,
  3. renders `<PartnerBookingReferenceFunnel ... activeScreen={resolved.activeScreen} activeScenario?={resolved.activeScenario} />`.
- `apps/partner-booking-web/lib/route-state.ts` keeps the resolution logic pure and shared. `resolvePartnerRouteState`:
  - returns `{ activeScreen: routeState }` when the token is a screen id,
  - returns `{ activeScreen: getPartnerBookingScenarioScreen(routeState), activeScenario: routeState }` when the token is a scenario id,
  - returns `null` otherwise (so the direct route can `notFound()`).
    `resolvePartnerSearchState(screen, scenario)` is the `?screen` / `?scenario` fallback used by the root tenant page; it prefers a recognised `scenario`, falls back to a recognised `screen`, then to `landing`. Array-shaped query values are normalised through `normalizeSingleValue`.
- `apps/partner-booking-web/app/[tenantSlug]/page.tsx` now drops the inline `normalizeScreen` helper and `isPartnerBookingScreenId` import, switching to the shared `resolvePartnerSearchState` and forwarding `activeScenario` only when present (so the existing seven-screen flow is unchanged when no scenario is supplied).

## §4 Five-Scenario Parity Mapping

The planning doc, runtime code, and the legacy `tenant-console-web/app/partner/` surface all line up on the same five authority-safe scenarios. The token in the URL, the scenario id in `partnerBookingScenarios`, the chip `label` in `scenarioMeta`, the target screen in `scenarioScreenById`, and the tenant-console-web gate concept are consistent:

| Planning negative path | URL token                            | Scenario id            | Funnel chip `label`    | Target screen | Tenant-console-web gate concept                                                                                                                     |
| ---------------------- | ------------------------------------ | ---------------------- | ---------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eligible`             | `/[tenantSlug]/eligible`             | `eligible`             | `eligible`             | `eligibility` | `eligibility/page.tsx` callout: "eligible: booking create unlocks with the verification id stamped on the booking."                                 |
| `ineligible`           | `/[tenantSlug]/ineligible`           | `ineligible`           | `ineligible`           | `eligibility` | `eligibility/page.tsx` callout: "ineligible: booking is denied; the partner sees the issuer reason code and may not retry without changing inputs." |
| `manual_review`        | `/[tenantSlug]/manual_review`        | `manual_review`        | `manual_review`        | `eligibility` | `eligibility/page.tsx` callout: "manual_review: booking is held in degraded mode; ops review is required."                                          |
| `inactive` entry       | `/[tenantSlug]/inactive`             | `inactive`             | `inactive`             | `book`        | `booking/new/page.tsx`: `partner_entry_inactive` warning callout blocks create when `partnerEntry.status !== "active"`.                             |
| `eligibility-required` | `/[tenantSlug]/eligibility-required` | `eligibility-required` | `eligibility_required` | `book`        | `booking/new/page.tsx`: `eligibility_required` warning callout blocks create when `eligibilityMode !== "none"` and no verification id is present.   |

Notes:

- `getPartnerBookingScenarioScreen(scenario)` returns the planning-doc gate ("stops at" screen), so the new direct route never silently falls through to a different screen — matching the parent reviewer note ("eligible / ineligible / manual_review 停在 eligibility gate；inactive / eligibility-required 停在 booking gate").
- The chip `label` for `eligibility-required` is intentionally `eligibility_required` (underscore) because that is the rejection reason code reused from `tenant-console-web` while the URL token stays `eligibility-required` (kebab-case) so the path segment is URL-safe.
- The five PB\_\* artboard screens (`Landing`, `Eligibility`, `Book`, `Confirmed`, `Trips`, `Receipt`, `Help`) are not redrawn; scenario rendering is overlaid on the existing `eligibility` / `book` artboards (see parent `review_notes_zh[3]`: "negative-path 呈現透過同一組 eligibility / book artboard screen 承載").

## §5 Routing & Fallback Symmetry

Two render entry points share the same resolver module, so both surfaces agree on what is a valid scenario or screen and what falls through to `landing` or `notFound()`:

| Entry                                        | Resolver                                      | Unknown-token behavior        | Default                       |
| -------------------------------------------- | --------------------------------------------- | ----------------------------- | ----------------------------- |
| `/[tenantSlug]` with `?screen` / `?scenario` | `resolvePartnerSearchState(screen, scenario)` | Falls back to `landing`       | `{ activeScreen: "landing" }` |
| `/[tenantSlug]/[routeState]`                 | `resolvePartnerRouteState(routeState)`        | Returns `null` → `notFound()` | n/a (404)                     |

This is the symmetry the parent reviewer flagged as passing in `review_notes_zh[1]`: the dynamic segment route uses the strict variant (404 on unknown), while the root tenant page keeps the lenient fallback for backward-compatible demo entry — both go through the same scenario / screen id check functions in `packages/ui-web/src/partner-booking-funnel.tsx`.

`apps/partner-booking-web/README.md` records this rule directly: "The tenant root still accepts `?screen=` / `?scenario=` for backward-compatible demo entry, but the canonical PBK-UI-004 negative-path states are direct routes."

## §6 Acceptance Evidence Mapping

The `ai-status.json` acceptance for `PBK-UI-004` is two items: the partner-booking-web commands trilogy, and the Storybook artboard comparison. The parent reviewer (`Codex`) recorded a `review_approved` summary citing the verification rerun that covers both:

| Acceptance item                                                 | Evidence in `ai-status.json` `PBK-UI-004` (parent `next` + `review_notes_zh`)             | Anchor in the tree                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm --filter @drts/partner-booking-web typecheck`             | Reviewer passed at `2026-05-12T21:04:38Z` (`review_notes_zh[2]`)                          | `apps/partner-booking-web/tsconfig.json`, `lib/route-state.ts`, `[routeState]/page.tsx` |
| `pnpm --filter @drts/partner-booking-web build`                 | Reviewer passed at `2026-05-12T21:04:38Z` (`review_notes_zh[2]`)                          | `apps/partner-booking-web/`                                                             |
| `pnpm --filter @drts/partner-booking-web lint`                  | Reviewer passed at `2026-05-12T21:04:38Z` (`review_notes_zh[2]`)                          | `apps/partner-booking-web/`                                                             |
| Storybook artboard parity (`PB_* against Partner Booking.html`) | `pnpm --filter @drts/ui-web build-storybook` rerun verified (`review_notes_zh[2]`, `[3]`) | `packages/ui-web/src/partner-booking.stories.tsx`, `Partner Booking.html`               |

This sidecar packet does not re-execute these commands; the parent reviewer's recorded reruns are the canonical evidence. The mapping above is the audit hand-off so `Codex2` (sidecar reviewer) can spot-check rather than re-run unless a discrepancy appears. The Storybook story file `partner-booking.stories.tsx` itself was not modified by `PBK-UI-004` — the parent reviewer note in `review_notes_zh[3]` explicitly records that the PB\_\* parity stories from `PBK-UI-003` continue to build and negative-path UI rides on the existing `eligibility` / `book` artboards rather than introducing new ones.

## §7 Scope Guardrails — what `PBK-UI-004` should NOT have done

The packet flags these so the sidecar reviewer can confirm none of them slipped into the parent change:

- No backend or API wiring. The new direct routes are pure mock-data renders driven by `getBrandForSlug` and the funnel component; there is no fetch / API client introduced under `apps/partner-booking-web/`.
- No new artboard. The five scenarios overlay the existing `eligibility` and `book` artboards from `PBK-UI-003`. There is no new screen id added to `partnerBookingScreens`, and no new entry in `packages/ui-web/src/partner-booking.stories.tsx`.
- No re-implementation of partner-session / auth. The legacy authority gate logic remains in `apps/tenant-console-web/app/partner/(authenticated)/booking/new/page.tsx` and `eligibility/page.tsx`; `PBK-UI-004` only mirrors the _naming_ of the five states into the new app surface as UI route states (the parent reviewer summary: "authority-safe direct routes preserve tenant-console-web gate parity").
- No cross-cutting cutover decision. The new-vs-old partner mode coexistence policy stays in `PBK-UI-005` (decision doc, currently `backlog`, dependent on `PBK-UI-004`).
- No layout-time scenario resolution. `app/[tenantSlug]/layout.tsx` is unchanged by this task; both the root tenant page and the `[routeState]` page resolve scenarios at the page level so a missing brand is still the first thing that fails with `notFound()`.

## §8 Dependency State at Approval

`PBK-UI-004`'s only dependency is `PBK-UI-003`:

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| Task           | `PBK-UI-003`                                  |
| Status         | `done`                                        |
| Commit         | `fbc05f62926392b7363360757f475275b9b56deb`    |
| Commit subject | `feat(PBK-UI-003): add CTBC reference funnel` |
| Push           | `origin/feat/claude2-ui-redesign-foundation`  |

`PBK-UI-004`'s closeout commit `13104105` sits on the same branch, so `PBK-UI-003` (`fbc05f6`) is a strict ancestor — the dependency edge is satisfied in `ai-status.json` and physically present in the branch history. The `PBK-UI-003` review packet (`support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-REVIEW.md`) is the immediate predecessor for this packet and follows the same shape.

## §9 Reviewer Closeout Checklist (for `Codex2`)

These are the sidecar-review gates. They are framed as audit checks against artifacts already in the tree (or in `ai-status.json`), not as new build steps to run.

### A. Machine truth still matches this packet

- [ ] `ai-status.json` still records `PBK-UI-004` as `done`, owner `Codex2`, reviewer `Codex`, last_update `2026-05-12T21:11:06Z` or later, with `commit_hash` `13104105d299eadd0b433596b2f173249dfbb5fc`, `commit_subject` `feat(PBK-UI-004): preserve authority-safe partner negative paths`, `push_remote` `origin`, `push_branch` `feat/claude2-ui-redesign-foundation`. If any of those fields drift unexpectedly (e.g. status moved back to `review`/`in_progress`, or the commit hash changed), refresh §2 of this packet before approving.
- [ ] `ai-status.json` still records `PBK-UI-003` as `done` on commit `fbc05f62926392b7363360757f475275b9b56deb` pushed to `origin/feat/claude2-ui-redesign-foundation`.
- [ ] `ai-status.json` still records this sidecar (`PBK-UI-004-SIDECAR-REVIEW`) as owned by `Claude`, reviewed by `Codex2`, with `helper_kind: review_packet`, `mutates_canonical: false`, and depends on `PBK-UI-003`.

### B. Repo state matches the implementation surface

- [ ] `apps/partner-booking-web/app/[tenantSlug]/[routeState]/page.tsx` exists and resolves the segment via `resolvePartnerRouteState`, returning `notFound()` for unknown tokens.
- [ ] `apps/partner-booking-web/lib/route-state.ts` exports `resolvePartnerRouteState` (strict) and `resolvePartnerSearchState` (lenient with `landing` default) and only consumes `@drts/ui-web` scenario/screen helpers.
- [ ] `apps/partner-booking-web/app/[tenantSlug]/page.tsx` uses `resolvePartnerSearchState(screen, scenario)`, forwards `activeScenario` only when present, and still falls back to `landing` when neither query is recognised.
- [ ] `packages/ui-web/src/partner-booking-funnel.tsx` declares `partnerBookingScenarios` with exactly the five ids `eligible / ineligible / manual_review / inactive / eligibility-required` and `scenarioScreenById` maps them to `eligibility / eligibility / eligibility / book / book` respectively. `PartnerBookingReferenceFunnel` accepts an optional `activeScenario` prop.
- [ ] `packages/ui-web/src/index.tsx` re-exports `partnerBookingScenarios`, `PartnerBookingScenarioId`, `isPartnerBookingScenarioId`, `getPartnerBookingScenarioMeta`, `getPartnerBookingScenarioScreen` from the funnel module.
- [ ] `apps/partner-booking-web/README.md` "Routing rules" still documents the five authority-safe direct routes alongside the `?screen` / `?scenario` backward-compat entry.
- [ ] `git log --oneline -1 13104105d299eadd0b433596b2f173249dfbb5fc` resolves to `feat(PBK-UI-004): preserve authority-safe partner negative paths` and the commit is reachable from `origin/feat/claude2-ui-redesign-foundation` (`git branch -a --contains 13104105…` lists `feat/claude2-ui-redesign-foundation` and `remotes/origin/feat/claude2-ui-redesign-foundation`). The commit trailer carries `LLM-Agent: Codex2 / Task-ID: PBK-UI-004 / Reviewer: Codex`.

### C. Scope guardrails still hold

- [ ] No fetch / network call or backend client appears under `apps/partner-booking-web/app/[tenantSlug]/`. The planning-doc "mock data / no backend" boundary still holds.
- [ ] No new screen id has been added to `partnerBookingScreens` and no new entry has been appended to `packages/ui-web/src/partner-booking.stories.tsx` to "stand up a negative-path screen" — the parent reviewer note ("negative-path 呈現透過同一組 eligibility / book artboard screen 承載") still holds.
- [ ] `apps/tenant-console-web/app/partner/(authenticated)/` is untouched by this task. The legacy gate logic (`eligibility/page.tsx`, `booking/new/page.tsx`) remains the authority source for the rejection-reason naming that the new app mirrors as UI route states.
- [ ] `PBK-UI-005` (cutover decision doc) is still separate. No `docs/01-decisions/SD-DP-*` content has leaked into this task.

### D. Packet hygiene

- [ ] The only task-scoped content edit for `PBK-UI-004-SIDECAR-REVIEW` is this file under `support/sidecars/PBK-UI-004/`.
- [ ] All sidecar state transitions for this task were made through `scripts/ai-status.sh` (`start`, `handoff`, `approve`).

## §10 Reviewer Handoff Notes (for `Codex2`)

1. Treat this packet as audit material for the parent reviewer's recorded `review_approved` → `done` transition. The parent reviewer (`Codex`) signed off at `2026-05-12T21:04:38Z` with the four `review_notes_zh` items; the parent owner (`Codex2`) then finalised `done` at `2026-05-12T21:11:06Z` with the task-scoped commit recorded in §2. The sidecar reviewer should approve, reopen, or block _this packet_, but not re-decide the parent's review (that is `Codex`'s call) and not re-decide the parent's closeout (that is already recorded in machine truth).
2. The parent's `done` closeout has already landed: task-scoped commit `13104105d299eadd0b433596b2f173249dfbb5fc` covering the six paths in §3, normal non-force push to `origin/feat/claude2-ui-redesign-foundation`, and `commit_*` / `push_*` fields populated in `ai-status.json`. If §9.A or §9.B shows that any of these have drifted since this refresh (e.g. the commit was reverted, the branch was force-rewound, or `commit_subject` no longer matches `feat(PBK-UI-004): preserve authority-safe partner negative paths`), reopen this sidecar rather than approving on stale evidence.
3. If §9.A or §9.B fails (machine truth has moved, or the implementation files / branch state have diverged from the diff captured here), reopen this sidecar with `AI_NAME=Codex2 scripts/ai-status.sh reopen PBK-UI-004-SIDECAR-REVIEW "<reason>"` rather than approving on stale evidence.
4. If §9.C fails (a guardrail was crossed in the parent change), the right move is to raise that against `PBK-UI-004` directly with the parent reviewer (`Codex`) and, if needed, request a follow-up canonical task — do not silently expand or contract this sidecar's scope to compensate.
5. Approval should explicitly confirm that the only file changed under this sidecar's task scope is `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md`. Any machine-truth state changes should appear only as `ai-status.json` / `current-work.md` / `ai-activity-log.jsonl` updates produced by `scripts/ai-status.sh`.
6. This is a sidecar/support slice, so the sidecar's own closeout uses `NO_COMMIT_REQUIRED=1` per the collaboration guide — only the packet markdown changes, no runtime commit is owed by this task.
