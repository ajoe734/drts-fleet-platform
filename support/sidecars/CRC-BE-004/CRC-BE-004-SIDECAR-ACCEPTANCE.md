# Sidecar Acceptance Packet: CRC-BE-004

- **Parent Task:** `CRC-BE-004` (`settlement-matrix: add partner_referral channel (drts_pays_partner)`)
- **Sidecar Task:** `CRC-BE-004-SIDECAR-ACCEPTANCE`
- **Status Snapshot:** parent `CRC-BE-004` is `in_progress`; sidecar is support-only and must not edit canonical truth or runtime behavior
- **Sidecar Owner:** `Codex`
- **Sidecar Reviewer:** `Codex2`
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Primary Machine Truth:** `ai-status.json`
- **Primary Product Reference:** `docs/community-app-referral-channel-20260613:docs/05-ui/community-app-referral-channel-spec-20260613.md` (§3, §5, §6, §8)

## 1. Purpose

This packet prepares the acceptance checklist, dependency map, and reviewer handoff framing for `CRC-BE-004`.

It is intentionally support-only:

- no edits to canonical product truth
- no edits to runtime implementation
- no claim that parent acceptance is already satisfied

The packet separates what is already landed through `CRC-WP0` from what the parent task still needs to prove for final acceptance.

## 2. Machine-Truth Snapshot

Current task-state anchors captured during this pass:

| Task ID | Status | Owner | Reviewer | Why it matters |
| --- | --- | --- | --- | --- |
| `CRC-WP0` | `done` | `Codex` | `Claude2` | Contracts/scaffolds for referral channel and settlement direction already landed on `origin/dev` at `19bb64f5b978`. |
| `CRC-BE-004` | `in_progress` | `Codex` | `Claude2` | Parent implementation task for adding the settlement-matrix row and matrix-consistency checks. |
| `CRC-BE-004-SIDECAR-ACCEPTANCE` | `in_progress` | `Codex` | `Codex2` | This packet only; support artifact scope. |

Sidecar machine-truth facts:

- `depends_on`: `CRC-WP0`
- `artifact`: `support/sidecars/CRC-BE-004/CRC-BE-004-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

## 3. Dependency Map

### 3.1 Direct hard dependency

| Dependency | Status | Evidence | Why it matters to `CRC-BE-004` |
| --- | --- | --- | --- |
| `CRC-WP0` | `done` | `ai-status.json` snapshot + commit `19bb64f5b978b07ebd44b7c8c7c2da7191f57cd5` | Parent task assumes the referral settlement vocabulary already exists: `partner_referral`, `drts_pays_partner`, `ReferralRevenueShareRule`, `PartnerUserIdentityLinkRecord`, and billing/tenant/owned-mobility scaffolds. |

### 3.2 Ownership split the reviewer should preserve

| Surface | Owned by | Reviewer expectation |
| --- | --- | --- |
| Referral-channel contracts and scaffold services | `CRC-WP0` | Parent task should consume existing exports/services, not redefine referral channel constants or direction strings. |
| Settlement matrix row for referral payout | `CRC-BE-004` | Parent task must add or verify the `partner_referral` row semantics match spec §6 exactly enough for Phase 1. |
| Matrix consistency tests and acceptance proof | `CRC-BE-004` | Parent task must supply executable evidence that the row is present and typecheck/tests pass. |

### 3.3 Downstream implications called out by the spec

These are not machine-truth task dependencies for this sidecar, but they explain why the reviewer should treat the matrix row as more than copy text:

| Spec phase / surface | Why `CRC-BE-004` matters |
| --- | --- |
| `P0` attribution validation | Settlement channel needs a canonical `partner_referral` row so attributed orders reconcile through the correct channel vocabulary. |
| `P3` referral revenue-share engine | Spec §6 requires `partner_referral` plus the opposite settlement direction `drts_pays_partner`; this parent task is the matrix-level acceptance slice for that requirement. |
| Channel partner reporting / statements | Statement and reporting code consume matrix channel metadata, so incorrect row semantics would propagate into referral statement generation later. |

## 4. Parent Acceptance Checklist

The parent acceptance row in machine truth is:

- `partner_referral channel present with drts_pays_partner; matrix tests pass; typecheck pass`

Reviewer should evaluate `CRC-BE-004` against the checklist below.

### 4.1 Settlement-matrix semantics

- verify `apps/api/src/modules/billing-settlement/settlement-matrix.ts` contains a row with `channelKey: PARTNER_REFERRAL_CHANNEL_KEY`
- verify that row represents the referral payout mirror described in the spec:
  - payer is DRTS / platform
  - direction is conceptually `drts_pays_partner`
  - reconciliation path is referral attribution review plus revenue-share closeout
- verify the row remains in the existing owned-mobility / billing-settlement mechanism rather than introducing a second settlement system

### 4.2 Contract reuse and non-duplication

- verify parent code reuses `PARTNER_REFERRAL_CHANNEL_KEY` and referral settlement constants from `@drts/contracts`
- verify parent code does not introduce a second hard-coded referral channel key string or a competing settlement-direction vocabulary
- verify parent code does not mutate unrelated canonical surfaces outside the matrix/test scope

### 4.3 Executable verification gates

- verify the parent handoff records the exact commands run
- minimum expected commands:
  - `pnpm --filter @drts/api typecheck`
  - matrix-focused tests covering `BillingSettlementService` / `settlement-matrix`
- if the parent uses a broader test command, verify the packet still points to the matrix behavior explicitly instead of relying on unrelated passing tests

### 4.4 Reviewer questions to resolve before parent closeout

1. Does the final matrix behavior expose `partner_referral` as a first-class channel on the same footing as `tenant_enterprise`, `partner_airport`, `phone_dispatch`, and `forwarded_shadow`?
2. Is the referral channel clearly modeled as the mirror of `partner_airport`, consistent with spec §1 and §6?
3. Do tests explicitly fail if the referral row disappears or regresses, rather than only passing indirectly through unrelated snapshots?
4. Does the parent handoff include actual typecheck/test evidence on the final tree?

## 5. Repo-Visible Evidence On Current Tree

These anchors are already visible in the repository and help narrow the review.

### 5.1 Spec anchors

- `docs/community-app-referral-channel-20260613:docs/05-ui/community-app-referral-channel-spec-20260613.md`
  - §3 says referral is not a new system; it reuses the existing partner/settlement mechanism.
  - §5 adds `partner_user_identity_link` and `partnerType = "referral_channel"` plus settlement deltas.
  - §6 requires a new matrix channel `partner_referral` and opposite direction `drts_pays_partner`.
  - §8 places matrix work in `P3` and recommends validating attribution first, then settlement generalization.

### 5.2 Already-landed dependency evidence (`CRC-WP0`)

- `packages/contracts/src/referral-channel.ts`
  - exports `REFERRAL_SETTLEMENT_DIRECTIONS = ["drts_pays_partner"]`
  - exports `REFERRAL_SETTLEMENT_CHANNEL_KEYS = ["partner_referral"]`
  - exports `PARTNER_REFERRAL_CHANNEL_KEY`
  - defines `ReferralRevenueShareRule`
  - defines `PartnerUserIdentityLinkRecord`
- `apps/api/src/modules/billing-settlement/referral-settlement.scaffold.service.ts`
  - returns `{ channelKey: PARTNER_REFERRAL_CHANNEL_KEY, direction: REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER, payer: "drts_platform", payee: "partner" }`
- `apps/api/src/modules/tenant-partner/referral-channel.scaffold.service.ts`
  - confirms the tenant-partner surface is extended rather than replaced

### 5.3 Current matrix evidence on this tree

- `apps/api/src/modules/billing-settlement/settlement-matrix.ts`
  - already includes a `partner_referral` row keyed by `PARTNER_REFERRAL_CHANNEL_KEY`
  - row language already reflects platform-funded referral revenue share and referral attribution closeout
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
  - `listSettlementMatrix()` delegates to `buildSettlementMatrix()`, so matrix row presence directly affects API-visible settlement data
- `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`
  - consumes `buildSettlementMatrix()`, so channel regression would leak into reporting flows

### 5.4 Present testing gap visible on this tree

- `apps/api/tests/unit/billing-settlement.service.test.ts`
  - currently asserts `tenant_enterprise`, `partner_airport`, `phone_dispatch`, and `forwarded_shadow`
  - does **not** currently assert the `partner_referral` row
  - does **not** currently assert referral-specific semantics like DRTS-funded payout / referral closeout wording

This is the most important reviewer hotspot for the parent task: if no new tests are added, the parent acceptance bullet `matrix tests pass` is weakly evidenced.

## 6. Reviewer Handoff Frame

When `Claude2` reviews `CRC-BE-004`, this packet should reduce the review to:

1. Confirm the parent task builds on the `CRC-WP0` contract/scaffold layer already landed in `dev`.
2. Confirm the settlement-matrix row for `partner_referral` is present and semantically aligned with the referral-channel spec.
3. Confirm the parent adds direct matrix coverage for `partner_referral`, not only incidental coverage through the broader matrix shape.
4. Confirm `pnpm --filter @drts/api typecheck` and the relevant matrix tests were actually run on the parent handoff tree.

When `Codex2` reviews this sidecar, the decision is narrower:

- confirm the packet matches current machine truth for `CRC-WP0`, `CRC-BE-004`, and this sidecar
- confirm the spec citations and repo-visible evidence are accurate
- confirm the packet does not claim parent acceptance is already complete
- confirm no canonical or runtime file was edited for this sidecar

## 7. Evidence Anchors

- `ai-status.json`
  - `CRC-WP0`
  - `CRC-BE-004`
  - `CRC-BE-004-SIDECAR-ACCEPTANCE`
- `docs/community-app-referral-channel-20260613:docs/05-ui/community-app-referral-channel-spec-20260613.md`
- `packages/contracts/src/referral-channel.ts`
- `apps/api/src/modules/billing-settlement/referral-settlement.scaffold.service.ts`
- `apps/api/src/modules/billing-settlement/settlement-matrix.ts`
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
- `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`
- `apps/api/tests/unit/billing-settlement.service.test.ts`
- commit `19bb64f5b978b07ebd44b7c8c7c2da7191f57cd5` (`CRC-WP0: add referral channel contracts and scaffolds (#681)`)

## 8. Sidecar Verification

This pass changes only `support/sidecars/CRC-BE-004/CRC-BE-004-SIDECAR-ACCEPTANCE.md`.

Verification performed for the sidecar artifact:

- single-task machine-truth review via `scripts/ai-status.sh show`
- spec review of `community-app-referral-channel-spec-20260613.md` from the repo docs branch
- committed-source anchor scan for contracts, scaffold services, settlement matrix, reporting consumer, and unit tests
- `git diff --check -- support/sidecars/CRC-BE-004/CRC-BE-004-SIDECAR-ACCEPTANCE.md`

No runtime/typecheck/test command was run for this sidecar itself because it is support-only and does not modify executable behavior.
