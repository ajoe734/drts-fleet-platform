# P2-DP-C4-001 — Review Packet & Evidence Summary (Sidecar)

- **Sidecar Task:** `P2-DP-C4-001-SIDECAR-REVIEW`
- **Parent Task:** `P2-DP-C4-001` — *Fulfillment segment ledger + sandbox billing treatment (no fallback surcharge)*
- **Helper Kind:** `review_packet` (support-only; does NOT mutate canonical truth)
- **Sidecar Owner:** Claude  |  **Sidecar Reviewer:** Codex2
- **Parent Owner:** Codex2  |  **Parent Reviewer:** Claude2  |  **Parent Status:** `review`
- **Prepared:** 2026-06-26
- **Self-status:** `in_progress` → handed off to Codex2 for sidecar review

> This packet rebuilds the review evidence for the parent implementation so the reviewer
> can verify acceptance without re-deriving it from scratch. It is a **support artifact only**.
> It does not edit L1 canonical truth, contract source of truth, or runtime/registry/governance
> implementation. The parent owner (Codex2) decides whether to absorb any of this into the main line.

---

## 1. Implementation Under Review

- **Branch:** `origin/codex2/p2-dp-c4-001`
- **Anchor commit:** `332feb22b` — *"P2-DP-C4-001: persist sandbox fulfillment ledger and billing treatment"*
- **Base:** sits directly on top of `c4126ee88` (P2-FBK-001 merged to dev via #901) → parent dep `P2-FBK-001` satisfied.
- **Diff vs `origin/dev`:** 7 files, +1000 / −5.

| File | Δ | Role |
| --- | --- | --- |
| `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` | +76 | Contract DTOs/enums: `FulfillmentSegmentRecord`, `SandboxBillingTreatmentRecord`, `Phase2MoneyAmount`, type unions |
| `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` | +162 | Producer: builds segments + billing treatment on trip completion, emits on event |
| `apps/api/src/modules/owned-mobility/owned-mobility-events.ts` | +10 | Event payload gains `bookingId`, `sandboxFulfillmentSegments`, `sandboxBillingTreatment` |
| `apps/api/src/modules/billing-settlement/billing-settlement.service.ts` | +152/−5 | Consumer: ingests, merges (idempotent), persists, list APIs, AV driver-statement suppression |
| `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts` | +311 | Dual-write/read of both tables; row⇄record mappers |
| `apps/api/tests/unit/billing-settlement.service.test.ts` | +112 | AV-only invoice + driver-statement suppression unit |
| `apps/api/tests/integration/int-p2-008-roc-human-fallback.test.ts` | +182 | Mixed AV→human fallback E2E: one invoice + human Phase1 statement |

### Backing schema (already on dev — NOT in this diff)
The repository persists to `av_sandbox.fulfillment_segments` and `av_sandbox.sandbox_billing_treatments`.
Both tables were created by **`infra/migrations/V0040__phase2_decision_packet_addendum.sql`**, merged to dev
via **P2-DP-S5-001 / PR #899 (`d4d6a5a93`)**. So persistence has a valid backing schema on dev; this branch
does not need to ship a migration. *(See R5 for a contract↔DDL alignment check.)*

---

## 2. Acceptance Criteria → Evidence Map

Parent AC (single compound criterion):
> *Segment ledger + billing treatment persisted; fallbackSurchargeApplied always false; AV→human fallback adds no customer charge; human driver gets Phase1 settlement; mixed fulfillment yields one invoice; unit+integration green.*

| # | AC clause | Where satisfied | Evidence |
| --- | --- | --- | --- |
| AC-1 | **Segment ledger persisted** | `owned-mobility.service.ts::buildSandboxFulfillmentSegments` produces `FulfillmentSegmentRecord[]`; `billing-settlement.service.ts::handleOwnedMobilityTripCompleted` merges + `persistChanges("…_sandbox_ledger")`; repo `INSERT … ON CONFLICT (fulfillment_segment_id) DO UPDATE` into `av_sandbox.fulfillment_segments`; reload path in `onModuleInit`. | upsert + reload round-trip; `listFulfillmentSegments(orderId)` read API |
| AC-2 | **Billing treatment persisted** | `buildSandboxBillingTreatment` → `SandboxBillingTreatmentRecord`; repo upsert into `av_sandbox.sandbox_billing_treatments`; `listSandboxBillingTreatments(orderId)` read API. | upsert + reload; mapper round-trip |
| AC-3 | **`fallbackSurchargeApplied` always false** | Hard-coded `fallbackSurchargeApplied: false` in `buildSandboxBillingTreatment` (no branch sets true). Contract carries the §C4/§6 rationale comment. Persisted into `treatment_snapshot` jsonb; read back as `snapshot.fallbackSurchargeApplied === true` (absent/anything ⇒ `false`). | invariant holds by construction **and** by safe read-coercion; asserted in both tests |
| AC-4 | **AV→human fallback adds no customer charge** | `passengerExtraChargeAllowed: false`, `passengerExtraCharge: money(0)`; fallback cost goes to `internalHumanFallbackCost` / `platformAbsorbed` with `fallbackCostAbsorber: "platform"`; `partnerCharge`/`tenantCharge` left `null`. No fare-component mutation. | matches adjudication §C4/§6 "internal cost / partner subsidy, not fare" |
| AC-5 | **Human driver gets Phase1 settlement** | For `treatmentType !== "normal_av"`, `eligibleForDriverStatement` stays `true` → human segment flows through Phase1 settlement. Integration test generates a driver statement for `drv-human-001` (length 1) over the fallback order. | `int-p2-008` asserts `statements.items` length 1 + line for the order |
| AC-6 | **AV normal completion ≠ driver settlement** | `findSandboxBillingTreatmentForOrder` → if latest `treatmentType === "normal_av"` then `eligibleForDriverStatement = false`. Unit test: AV-only order ⇒ `generateDriverStatements` rejects with `VALIDATION_ERROR` (no eligible statement). | safety-operator on an AV trip is not a settleable Phase1 driver |
| AC-7 | **Mixed fulfillment → one invoice** | `bookingId` threaded end-to-end; segments share one `bookingId`; treatment `treatmentSnapshot.fulfillmentMode = "mixed"` when a prior AV segment + human completion coexist. Integration test asserts the tenant invoice has exactly one line for the booking's order. | one customer invoice across AV + human segments |
| AC-8 | **Unit + integration green** | Parent verification (from task `next`): `pnpm --filter @drts/contracts build`; `pnpm --filter @drts/api test -- --run apps/api/tests/unit/billing-settlement.service.test.ts apps/api/tests/integration/int-p2-008-roc-human-fallback.test.ts`. | reviewer should re-run to confirm green on their checkout |

---

## 3. Mid-trip Fallback Semantics (adjudication §C4/§6)

The producer models the "AV segment ends + human segment begins, still one invoice" rule:

- `buildSandboxFulfillmentSegments` iterates `dispatchAssignments` for the order (ordered by `createdAt`),
  emitting one segment per assignment: `tesla_av` (when `isSandboxAvVehicle`) or `human_taxi`, with
  `segmentReason` distinguishing `sandbox_av_completed` / `sandbox_av_attempt` / `roc_human_fallback` /
  `phase1_human_dispatch`. Non-completed cancelled human assignments are skipped.
- `buildSandboxBillingTreatment` detects fallback two ways: explicit `complianceFlags.includes("sandbox_human_fallback")`,
  **or** a completed non-AV task while a prior `tesla_av` segment on a different vehicle exists (`previousAvSegment`).
  When neither holds and the completing task is human, it returns `null` (pure Phase1 order — no sandbox treatment row), which is correct.
- `treatmentSnapshot` captures `fulfillmentMode` ∈ {`tesla_av`,`human_fallback`,`mixed`}, customer fare, and
  `humanDriverSettlementMode` (`phase1_standard` on fallback) — useful for the §6.4 invoice/report dimensions.

---

## 4. Reviewer Focus Areas (for Codex2)

> Ranked by where a subtle defect would most likely hide. Each is a *check to perform*, not a found defect.

- **R1 — `fallbackSurchargeApplied` round-trip (snapshot-folded field).** There is **no dedicated column** for
  `fallback_surcharge_applied` in V0040; the repo writes it inside `treatment_snapshot` jsonb on persist and reads it
  back via `treatmentSnapshot.fallbackSurchargeApplied === true`. Confirm you accept storing an invariant inside a jsonb
  snapshot rather than a typed/`CHECK`-constrained column. The `=== true` coercion makes the field default to `false`
  on any missing/legacy row, which is consistent with the always-false invariant — but it also means the column could
  never enforce the invariant at the DB layer. **Decide if that is acceptable** or if a follow-up should add a real
  `BOOLEAN NOT NULL DEFAULT FALSE` column + `CHECK (fallback_surcharge_applied = FALSE)`.
- **R2 — read/write `treatmentSnapshot` asymmetry.** On write, the in-memory `treatmentSnapshot` does **not** contain a
  `fallbackSurchargeApplied` key (it is injected only at the SQL boundary). On reload, the returned record's
  `treatmentSnapshot` **does** contain that key (it is part of the stored jsonb). So a freshly-built record and a
  reloaded one differ by one snapshot key. Cosmetic, not a correctness bug for the invariant — confirm no downstream
  equality/serialization check depends on snapshot exactness.
- **R3 — currency default divergence (TWD vs NTD).** V0040 DDL defaults `currency` to `'TWD'`; the app uses
  `DEFAULT_CURRENCY = "NTD"` and every produced record carries explicit `"NTD"`. The DDL default is only reachable if a
  row is ever inserted without a currency (it never is, on the current write path). Confirm this is a benign latent
  mismatch and not a sign of a unit/currency drift elsewhere (Phase 1 settlement is NTD).
- **R4 — AV driver-statement suppression coupling.** `eligibleForDriverStatement` is decided from the *latest* sandbox
  treatment for the order (`findSandboxBillingTreatmentForOrder`, sorted desc by `createdAt`). Verify ordering is stable
  when multiple treatments share a `createdAt` (string `localeCompare` on ISO timestamps), and that a mixed order's
  *latest* treatment is `fallback_human` (not `normal_av`) so the human driver remains settleable. The integration test
  covers the mixed case; the unit test covers the AV-only suppression — confirm both directions.
- **R5 — contract ↔ DDL enum alignment.** Cross-check the three unions against V0040 `CHECK` constraints:
  - `segment_type` ∈ {`tesla_av`,`human_taxi`,`cancelled`,`non_revenue_recovery`} ✔ matches `FULFILLMENT_SEGMENT_TYPES`.
  - `treatment_type` ∈ {`normal_av`,`fallback_human`,`incident_waived`,`partner_program_adjusted`,`tenant_contract_adjusted`} ✔ matches `SANDBOX_BILLING_TREATMENT_TYPES`.
  - `fallback_cost_absorber` ∈ {`platform`,`partner`,`tenant_contract`} ✔ matches `SANDBOX_FALLBACK_COST_ABSORBERS`.
  Producer currently only emits `tesla_av`/`human_taxi` segment types and `normal_av`/`fallback_human` treatments — the
  other enum members are schema-forward but unexercised. Confirm that is intended headroom, not dead surface to trim.
- **R6 — idempotency / replay.** Both merges are `Map`-keyed by primary id (`fulfillmentSegmentId`,
  `sandboxBillingTreatmentId`) and both upserts are `ON CONFLICT … DO UPDATE`. Deterministic ids
  (`segment-${orderId}-${n}`, `sandbox-billing-${orderId}`) mean a re-emitted completion event overwrites rather than
  duplicates. Confirm the `segment-${orderId}-${index+1}` index is stable across replays (it is derived from sorted
  assignment order, so a new assignment appended later shifts no existing index — verify that assumption holds for your
  fallback flows).
- **R7 — `createdAt` fallback to wall-clock.** `buildSandboxBillingTreatment` uses
  `completedTask.completedAt ?? new Date().toISOString()`. In the normal path `completedAt` is set; the `new Date()`
  fallback is a non-determinism source if ever hit in tests. Confirm production always supplies `completedAt`.

---

## 5. What This Packet Did NOT Touch (scope guard)

- No edits to `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl` content (state changes go through
  `scripts/ai-status.sh` only).
- No edits to L1 product truth, `packages/contracts` source, runtime modules, or `infra/migrations`.
- Only this support artifact under `support/sidecars/P2-DP-C4-001/` was created.

## 6. Handoff Notes for Codex2 (sidecar reviewer)

- This is a **review_packet helper**, not a code change. Approving it means the evidence map (§2), the mid-trip
  semantics (§3), and the focus areas (§4) are a faithful, useful basis for the parent review — not that the parent
  implementation itself is approved (that remains Claude2's call on `P2-DP-C4-001`).
- If you find the evidence map wrong or a focus area mis-stated, `reopen` with the specific §/row.
- Parent integration status is unchanged: `P2-DP-C4-001` stays `review` on `codex2/p2-dp-c4-001`; its code is **not**
  on dev yet (expected). This sidecar carries `INTEGRATION_STATUS=not_applicable` (support artifact only).
