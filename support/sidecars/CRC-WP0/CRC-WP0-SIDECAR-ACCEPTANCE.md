# CRC-WP0 Sidecar Acceptance Packet

This document is the support-only acceptance packet for `CRC-WP0` ("Contracts + scaffolds for referral channel / durable binding / revenue-share / settlement direction"). It does not change canonical truth. It consolidates the machine-truth snapshot, dependency map, current repo baseline, and reviewer-facing acceptance checklist that the assigned reviewer (`Claude2`) can use before the parent task starts implementation.

Anchors used here come from:

- dispatch brief embedded in the supervisor wakeup for `CRC-WP0-SIDECAR-ACCEPTANCE`
- `ai-status.json` task slices for `CRC-WP0` and `CRC-WP0-SIDECAR-ACCEPTANCE`
- `packages/contracts/src/index.ts`
- `apps/api/src/modules/billing-settlement/settlement-matrix.ts`
- `apps/api/src/modules/billing-settlement/billing-settlement.module.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.module.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.module.ts`
- `apps/api/src/modules/fleet-partner/fleet-partner.service.ts`

## 1. Scope and boundary

- **Task ID:** `CRC-WP0-SIDECAR-ACCEPTANCE`
- **Parent Task:** `CRC-WP0`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Codex`
- **Reviewer:** `Claude2`
- **Mutates Canonical:** `false`
- **Objective:** hand off a reviewer-facing acceptance checklist and dependency map for the parent referral-channel foundation task without editing L1/L2 truth, runtime code, or the parent backlog item itself.

Guardrails for this packet:

- Treat the embedded dispatch brief plus `ai-status.json` as the source for parent scope, because the wakeup explicitly says not to read `.orchestrator/task-briefs/*` and the referenced referral spec file is not present in this worktree.
- Keep this sidecar limited to support material under `support/sidecars/CRC-WP0/`.
- Do not expand `CRC-WP0` into a second partner system or a second settlement engine; the parent brief explicitly says to extend existing `tenant-partner`, `billing-settlement`, and `owned-mobility` surfaces only.

## 2. Machine-truth anchors

### Parent task: `CRC-WP0`

| Field | Value |
| --- | --- |
| Title | `Contracts + scaffolds for referral channel / durable binding / revenue-share / settlement direction` |
| Phase | `community-referral-channel-20260613` |
| Owner | `Claude2` |
| Reviewer | `Codex2` |
| Status | `backlog` |
| Depends on | `[]` |
| Artifacts | `packages/contracts/src/`, `apps/api/src/modules/` |
| Acceptance | `Contracts compile & export; scaffolds registered; pnpm --filter @drts/contracts build + pnpm --filter @drts/api typecheck pass` |
| Last update | `2026-06-13T14:56:25Z` |

Parent scope as stated in machine truth and the embedded brief:

- Add/export referral-channel contract shapes under `packages/contracts/src/`.
- Cover four specific additions: a referral channel / partner-type value (`referral_channel`), `ReferralRevenueShareRule`, `PartnerUserIdentityLinkRecord`, and settlement-direction/channel constants (`drts_pays_partner`, `partner_referral`).
- Add matching API module scaffolds / registration only; do not implement business logic.
- Reuse existing `tenant-partner`, `billing-settlement`, and `owned-mobility` slices instead of creating parallel subsystems.

### Sidecar task: `CRC-WP0-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Owner | `Codex` |
| Reviewer | `Claude2` |
| Status | `in_progress` |
| `task_class` | `sidecar` |
| `helper_kind` | `acceptance_packet` |
| `mutates_canonical` | `false` |
| Artifact | `support/sidecars/CRC-WP0/CRC-WP0-SIDECAR-ACCEPTANCE.md` |

## 3. Dependency map

### Declared upstream dependencies

`CRC-WP0` currently has no formal `depends_on` entries in machine truth. That means this packet should frame readiness around existing repo surfaces, not around missing prerequisite tasks.

### Existing surfaces the parent must extend

| Surface | Current evidence | Why it matters |
| --- | --- | --- |
| `packages/contracts/src/index.ts` | Shared contract barrel already exports generic partner and settlement record families, including `SettlementMatrixRecord` and fleet revenue-share record types. | Parent contract additions must land here and export cleanly instead of creating a side file that bypasses the repo's contract barrel. |
| `apps/api/src/modules/tenant-partner/tenant-partner.module.ts` | Module already wires tenant-partner as the existing partner-domain slice and imports `BillingSettlementModule` plus `OwnedMobilityModule` via `forwardRef`. | Referral-channel partner identity/binding scaffolds belong in the existing tenant-partner slice, not in a new top-level partner module. |
| `apps/api/src/modules/owned-mobility/owned-mobility.module.ts` | Module already depends on `TenantPartnerModule` and registers an order-feed provider back into tenant-partner. | Durable passenger binding and referral-origin order context should compose with this existing owned-order flow. |
| `apps/api/src/modules/billing-settlement/settlement-matrix.ts` | Current settlement matrix only includes `tenant_enterprise`, `partner_airport`, `phone_dispatch`, and `forwarded_shadow`. | Parent brief requires a new `partner_referral` channel and a new settlement direction, so this file is the clearest baseline showing the gap. |
| `apps/api/src/modules/fleet-partner/fleet-partner.service.ts` | Repo already has revenue-share CRUD semantics (`create/update/delete revenue share rule`) for fleet partners. | Parent should align new referral revenue-share naming with existing repo vocabulary and avoid inventing an incompatible formula model unless the contract layer deliberately defines one. |

### Current gap baseline

The repo baseline is consistent with `CRC-WP0` still being `backlog`:

- `packages/contracts/src/index.ts` does not currently expose `ReferralRevenueShareRule` or `PartnerUserIdentityLinkRecord`.
- The same contract barrel does not currently expose a dedicated `referral_channel` partner-type constant or enum member by that exact name.
- `apps/api/src/modules/billing-settlement/settlement-matrix.ts` does not currently define `channelKey: "partner_referral"` and does not contain `drts_pays_partner`.
- The three target modules exist, but there is no obvious referral-specific scaffold under `tenant-partner`, `billing-settlement`, or `owned-mobility` yet.

These are start-gate observations only. They are not a request for this sidecar to implement the missing pieces.

## 4. Parent-task acceptance checklist (`CRC-WP0`)

These checks are for the parent owner/reviewer pair later. They are derived from the embedded brief, current repo topology, and the parent acceptance command list in machine truth.

### A. Contract-surface gates

- [ ] `packages/contracts/src/index.ts` exports the referral-channel additions required by the brief.
- [ ] A referral partner-type / channel value for `referral_channel` is added additively to the existing contract surface instead of replacing existing partner-type semantics.
- [ ] `ReferralRevenueShareRule` is exported with the brief-required shape: rate type (`percent` or `per_trip`), value, currency, and effective-period fields.
- [ ] `PartnerUserIdentityLinkRecord` is exported with the brief-required identity-binding semantics: `entrySlug + partnerUserRef -> drtsPassengerId`, plus status, consent scope, and `lastSeenAt`.
- [ ] Settlement-direction / channel constants include `drts_pays_partner` and `partner_referral` in the canonical contract/API surface used by the implementation.

### B. Module-scaffold gates

- [ ] API changes stay within existing module families under `apps/api/src/modules/tenant-partner`, `apps/api/src/modules/billing-settlement`, and/or `apps/api/src/modules/owned-mobility`.
- [ ] Any new module registration is additive scaffold wiring only; no duplicate partner or settlement subsystem is introduced.
- [ ] The parent reviewer can trace the scaffold registration path from module wiring back to the existing modules already present in this repo.
- [ ] The parent implementation does not silently move referral-channel logic into `fleet-partner`; that slice is only a vocabulary/reference anchor for revenue-share semantics.

### C. Verification gates

- [ ] `pnpm --filter @drts/contracts build`
- [ ] `pnpm --filter @drts/api typecheck`
- [ ] Reviewer confirms the changes are scaffold-only and do not claim business-logic completion beyond the parent brief.

### D. Guardrails

- [ ] No canonical truth files are edited as part of this sidecar packet.
- [ ] The parent implementation extends existing surfaces and does not introduce a second partner registry, a second settlement engine, or a second owned-order domain.
- [ ] If the parent needs additional semantic decisions beyond the embedded brief, those decisions are surfaced back through the normal canonical-truth workflow rather than invented in implementation.

## 5. Reviewer hotspots and dependency notes

1. `settlement-matrix.ts` is the most concrete baseline for reviewer validation because it proves the new `partner_referral` channel does not exist yet and shows the current naming style for settlement rows.
2. `tenant-partner.module.ts` and `owned-mobility.module.ts` already depend on each other. Reviewer should prefer scaffold additions that respect that existing composition instead of adding a fourth module with overlapping responsibilities.
3. `fleet-partner.service.ts` already contains revenue-share CRUD language and formula types. Reviewer should check that `ReferralRevenueShareRule` is intentionally aligned or intentionally distinct, not accidentally conflicting.
4. Because the referenced referral spec markdown is absent from this worktree, any parent implementation that relies on additional unstated semantics should be treated as speculative unless backed by machine truth or another canonical source the parent owner can cite.

## 6. Packet completeness check

- [x] The packet is anchored to `ai-status.json` for both the sidecar task and parent task.
- [x] The packet records that `CRC-WP0` currently has no formal upstream task dependencies.
- [x] The dependency map references the actual repo surfaces named or implied by the parent brief: `packages/contracts/src/index.ts`, `tenant-partner`, `billing-settlement`, and `owned-mobility`.
- [x] The packet records the current gap baseline for `referral_channel`, `ReferralRevenueShareRule`, `PartnerUserIdentityLinkRecord`, `partner_referral`, and `drts_pays_partner`.
- [x] The packet keeps scope limited to support-only acceptance framing and reviewer guidance.
- [x] The only support artifact content for this task is this file under `support/sidecars/CRC-WP0/`.

## 7. Reviewer handoff notes (for `Claude2`)

1. Reconfirm `ai-status.json` still shows `CRC-WP0` as `backlog`, owner `Claude2`, reviewer `Codex2`, with no declared dependencies. If the parent state changes, refresh Sections 2-4 before approving this packet.
2. Reconfirm the referral spec path cited in the parent summary is still absent or has been restored. If restored later, the packet should be refreshed to cite it directly.
3. When the parent work begins, reject any implementation that creates a parallel referral partner module or settlement engine outside the three named module families.
4. Use this as a sidecar-only support packet. It must not be used to silently broaden `CRC-WP0` into a full referral-channel business-logic implementation.
5. Approval should verify that the only task-scoped content edit is `support/sidecars/CRC-WP0/CRC-WP0-SIDECAR-ACCEPTANCE.md`, plus lifecycle state transitions recorded via `scripts/ai-status.sh`.
