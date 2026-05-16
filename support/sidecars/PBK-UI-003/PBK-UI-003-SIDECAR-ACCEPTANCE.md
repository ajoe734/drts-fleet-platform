# PBK-UI-003 Sidecar Acceptance Packet

This document is the parallel support packet for `PBK-UI-003` ("CTBC reference funnel — 7 screens"). It does not change canonical truth. It consolidates the repo facts that the assigned reviewer (`Codex2`) and parent-task owner (`Codex2`) need before the parent task starts implementation or later enters review.

Anchors used here come from:

- `ai-status.json`
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- `docs/05-ui/drts-design-canvas/partner-screens.jsx`
- `packages/ui-tokens/src/brands.ts`
- `apps/partner-booking-web/lib/brand.ts`
- `apps/partner-booking-web/app/[tenantSlug]/layout.tsx`
- `apps/partner-booking-web/app/[tenantSlug]/page.tsx`

## §1 Scope & Boundary

- **Task ID:** `PBK-UI-003-SIDECAR-ACCEPTANCE`
- **Parent Task:** `PBK-UI-003`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Codex`
- **Reviewer:** `Codex2`
- **Mutates Canonical:** `false`
- **Objective:** Hand off a reviewer-facing acceptance checklist and dependency map for the parent CTBC funnel task without editing L1/L2 truth, runtime code, or the parent backlog item itself.

Guardrails for this packet:

- Do not change `PBK-UI-003` scope beyond what `ai-status.json` and `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` already say.
- Do not invent backend/API dependencies; the planning doc explicitly scopes `PBK-UI-003` to mock data and no backend integration.
- Keep the sidecar output confined to `support/sidecars/PBK-UI-003/`.

## §2 Machine-Truth Anchors

### Parent Task: `PBK-UI-003`

| Field                          | Value                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Title                          | `CTBC reference funnel — 7 screens`                                                                                    |
| Phase                          | `Wave 5`                                                                                                               |
| Owner                          | `Codex2`                                                                                                               |
| Reviewer                       | `Codex`                                                                                                                |
| Status                         | `backlog`                                                                                                              |
| Depends on                     | `PBK-UI-002`                                                                                                           |
| Planning ref                   | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`                                                                |
| Acceptance in `ai-status.json` | `pnpm --filter @drts/partner-booking-web typecheck / build / lint`; `Storybook 對照對應 PB_* artboard (PBK-UI-003 起)` |
| Last update                    | `2026-05-10T10:41:44Z`                                                                                                 |

Planning-doc scope for `PBK-UI-003` is specific:

- It is the CTBC demo funnel only, not a generic multi-brand rollout.
- It must render seven screens: `Landing`, `Eligibility`, `Book`, `Confirmed`, `Trips`, `Receipt`, `Help`.
- Data stays mock-only; the planning doc says "資料先用 mock；不接後端。"
- The expected artifact family is `apps/partner-booking-web/app/[tenantSlug]/(public|authenticated)/...`.

### Sidecar Task: `PBK-UI-003-SIDECAR-ACCEPTANCE`

| Field               | Value                                                          |
| ------------------- | -------------------------------------------------------------- |
| Owner               | `Codex`                                                        |
| Reviewer            | `Codex2`                                                       |
| Status              | `in_progress`                                                  |
| `task_class`        | `sidecar`                                                      |
| `helper_kind`       | `acceptance_packet`                                            |
| `mutates_canonical` | `false`                                                        |
| Artifact            | `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md` |

## §3 Dependency Map

### Direct dependency: `PBK-UI-002` — Partner-side token + brand layer

| Field          | Value                                        |
| -------------- | -------------------------------------------- |
| Status         | `done`                                       |
| Owner          | `Codex2`                                     |
| Reviewer       | `Codex`                                      |
| Depends on     | `PBK-UI-001`                                 |
| Commit         | `d7046eb`                                    |
| Commit subject | `PBK-UI-002 Partner token brand chrome`      |
| Push           | `origin/feat/claude2-ui-redesign-foundation` |
| Recorded at    | `2026-05-10T17:04:37Z`                       |

`PBK-UI-002` is the concrete prerequisite for `PBK-UI-003`, not a vague upstream:

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` defines `PBK-UI-002` as the token/brand layer in `packages/ui-tokens/src/brands.ts` plus `apps/partner-booking-web/lib/brand.ts`.
- `packages/ui-tokens/src/brands.ts` exists and is the shared template source for CTBC/CATHAY/GRAND brand definitions.
- `apps/partner-booking-web/lib/brand.ts` exists and resolves partner branding from `@drts/ui-tokens`; the parent task should extend this layer, not replace it with app-local brand constants.
- `ai-status.json` records reviewer confirmation that the partner brand layer is token-driven and that partner-booking-web consumes injected `--pbk-*` CSS variables without reintroducing a local brand registry.

### Current repo baseline for the parent task

The present `apps/partner-booking-web` tree is consistent with `PBK-UI-003` still being `backlog`:

- `apps/partner-booking-web/app/[tenantSlug]/layout.tsx` exists and wraps tenant routes with `TenantShell`.
- `apps/partner-booking-web/app/[tenantSlug]/page.tsx` exists as the current bootstrap/home route.
- That page explicitly says the richer CTBC funnel "still land[s] in PBK-UI-003", which matches the machine-truth dependency split between `PBK-UI-002` and `PBK-UI-003`.
- The seven planning-doc routes under `app/[tenantSlug]/(public|authenticated)/...` are not present yet, so this packet should be read as a start gate for the parent work, not as evidence that `PBK-UI-003` is already implemented.

### Design-parity anchor for the parent task

`docs/05-ui/drts-design-canvas/partner-screens.jsx` and `docs/05-ui/drts-design-canvas/Partner Booking.html` are the concrete artboard sources for the required seven-screen funnel:

- `PB_Landing`
- `PB_Eligibility`
- `PB_Book`
- `PB_Confirmed`
- `PB_Trips`
- `PB_Receipt`
- `PB_Help`

This matches the planning-doc acceptance line: `Storybook 對照 partner-screens.jsx::PB_*`.

## §4 Parent-Task Acceptance Checklist (`PBK-UI-003`)

These are the reviewer-facing gates for the parent task, derived from `ai-status.json` and the Wave 5 UI breakdown. They are intentionally specific so the parent owner can use them later without reinterpreting scope.

### A. Scope gates

- [ ] Deliver exactly the seven CTBC reference screens named in the planning doc: `Landing`, `Eligibility`, `Book`, `Confirmed`, `Trips`, `Receipt`, `Help`.
- [ ] Keep the implementation in `apps/partner-booking-web/` and render the funnel under the `[tenantSlug]` route family described by the planning doc.
- [ ] Keep data mock-only and do not add backend/API coupling as part of `PBK-UI-003`.
- [ ] Use the completed `PBK-UI-002` brand layer (`packages/ui-tokens/src/brands.ts` and `apps/partner-booking-web/lib/brand.ts`) rather than introducing app-local CTBC-only brand state.

### B. Verification gates

- [ ] `pnpm --filter @drts/partner-booking-web typecheck`
- [ ] `pnpm --filter @drts/partner-booking-web build`
- [ ] `pnpm --filter @drts/partner-booking-web lint`
- [ ] Storybook / manual visual comparison is performed against `docs/05-ui/drts-design-canvas/partner-screens.jsx::PB_*`, because `ai-status.json` marks artboard comparison as mandatory starting with `PBK-UI-003`.
- [ ] Reviewer verifies the parent task still respects the planning-doc boundary "mock data / no backend" and the `PBK-UI-002` token-driven brand dependency.

### C. Guardrails

- [ ] No canonical truth files are edited as part of this sidecar packet.
- [ ] No local hardcoded partner-brand registry reappears in `apps/partner-booking-web/**`.
- [ ] Parent review should reject any implementation that claims completion without all seven screens or without the Storybook/artboard comparison gate.

## §5 Packet Completeness Check

These are the acceptance points for this sidecar artifact itself. They are complete as of this rewrite.

- [x] The packet is anchored to `ai-status.json` for both the sidecar task and parent task.
- [x] The packet names the actual upstream dependency `PBK-UI-002` and records its done-state commit `d7046eb`.
- [x] The dependency map references the actual repo paths called out by the planning doc: `packages/ui-tokens/src/brands.ts` and `apps/partner-booking-web/lib/brand.ts`.
- [x] The packet records the current app baseline at `apps/partner-booking-web/app/[tenantSlug]/layout.tsx` and `page.tsx`.
- [x] The packet ties the visual acceptance gate to the concrete design source `docs/05-ui/drts-design-canvas/partner-screens.jsx`.
- [x] The only support artifact content for this task is this file under `support/sidecars/PBK-UI-003/`.

## §6 Reviewer Handoff Notes (for `Codex2`)

1. Reconfirm `ai-status.json` still shows `PBK-UI-003` as `backlog`, owned by `Codex2`, reviewed by `Codex`, and dependent on `PBK-UI-002`. If that machine truth changes, refresh §2 and §4 before approving this packet.
2. Reconfirm `PBK-UI-002` is still `done` on commit `d7046eb` pushed to `origin/feat/claude2-ui-redesign-foundation`, because this packet is anchored to that dependency state.
3. When the parent task starts, check that new routes build on `apps/partner-booking-web/lib/brand.ts` and the token exports instead of creating CTBC-specific local theme logic.
4. Treat this as a sidecar-only support packet. It should not be used to silently broaden `PBK-UI-003` into backend integration or policy work that belongs to later partner-booking tasks.
5. Approval should verify that the only task-scoped content edit is `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md`, plus machine-truth state transitions recorded through `scripts/ai-status.sh`.
