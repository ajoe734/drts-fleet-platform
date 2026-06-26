# P2-DP-S1-001 — Review Packet & Evidence Summary

> **Sidecar task:** `P2-DP-S1-001-SIDECAR-REVIEW` (helper_kind=`review_packet`, mutates_canonical=`false`)
> **Owner:** Claude · **Reviewer:** Codex2
> **Self-status:** `in_progress` → handoff to Codex2 on completion of this packet.
> **Parent task:** `P2-DP-S1-001` — *PassengerDisclosurePolicy + message catalog + acknowledgement (S1=a)*
> **Parent status (machine truth @ 2026-06-26T09:53Z):** `review` · owner `Codex2` · reviewer `Codex`
> **Generated:** 2026-06-26 (UTC), from impl branch `origin/codex2/p2-dp-s1-001-final` @ `eac1fbf3d`.

This is a **support artifact only**. It does not modify L1 canonical truth, contracts, runtime, or the
parent's `review` status. It rebuilds an evidence map from the parent implementation so the assigned
reviewer can audit P2-DP-S1-001 acceptance against cited file:line evidence. The parent owner decides
whether to absorb any of this into the mainline review.

---

## 1. Parent state & integration vehicle

| Field | Value |
|---|---|
| Impl branch | `origin/codex2/p2-dp-s1-001-final` |
| Anchor commit | `eac1fbf3d` — `P2-DP-S1-001: fix disclosure closeout typecheck fallout` |
| Commit lineage | `33dfddd02` (implement) → `9ab857567` (finalize closeout) → `eac1fbf3d` (typecheck fallout fix) |
| Integration vehicle | **PR #917** → base `dev`, from `codex2/p2-dp-s1-001-final`, auto-merge enabled |
| Diff vs `origin/dev` | **15 files, +2092 / −72** |
| Dependency | `P2-DP-C3-001` (visibility/messageCode) — satisfied per parent `next` note |

Owner-reported local verification (from parent `next`): `check_commit_trailers.py --base origin/dev`,
`pnpm typecheck`, and 5 targeted vitest suites (repository / service / owned-mobility service+controller /
int-p2-002 hook). Parent is gated on **required GitHub checks** for integration closeout — **not** a code
fault. This packet does **not** re-assert CI state; reviewer should read PR #917 checks directly.

### 1.1 Changed-surface inventory (vs `origin/dev`)

| Layer | File | Δ |
|---|---|---|
| Contracts | `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` | +121 |
| Contracts | `packages/contracts/src/index.ts` | +7 |
| Migration | `infra/migrations/V0042__passenger_disclosure_policy_catalog_acknowledgements.sql` | +112 (new) |
| Gate service | `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts` | +411 |
| Gate repo | `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.repository.ts` | +232 |
| Gate controller | `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller.ts` | +69 |
| Gate types | `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.types.ts` | +18 |
| Owned mobility svc | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` | +387 |
| Owned mobility ctrl | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` | +19 |
| Tests (unit) | `sandbox-dispatch-gate.service.test.ts` (+141), `sandbox-dispatch-gate.repository.test.ts` (+44), `owned-mobility.service.test.ts` (+323), `owned-mobility.controller.test.ts` (+48) | |
| Tests (integration) | `apps/api/tests/integration/int-p2-002-sandbox-dispatch-hook.test.ts` | +231 |
| Fixture | `apps/api/tests/fixtures/dispatch-booking-fixture.ts` | +1 |

> **Migration ordering (clean):** `dev` head is `V0041`; branch adds `V0042` on top with no gap/collision.

---

## 2. Acceptance evidence map

Parent acceptance (single composite criterion) decomposed into auditable sub-claims **AC-1…AC-8**.
All citations are against `origin/codex2/p2-dp-s1-001-final`.

### AC-1 — Three contracts defined: PassengerDisclosurePolicy / MessageCatalog(Entry) / AcknowledgementRecord
- `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
  - `PassengerDisclosureMessageCatalogEntry` (entryId, catalogVersion, messageCode, locale, bodyText, **legalApproved**, timestamps).
  - `PassengerDisclosurePolicy` + `PassengerDisclosurePolicyChannelRule` (channel, messageCode, **requiresAcknowledgement**, **acknowledgementMode**).
  - `PassengerAcknowledgementRecord` (bookingId, orderId, policyId, messageCode, channel, acknowledgementMode, actorType/Ref, acknowledgedAt, evidenceRef).
  - `PassengerDisclosureRequirementSnapshot` — runtime projection consumed by the gate & booking records.
  - Upsert/record command DTOs: `UpsertPassengerDisclosurePolicyCommand`, `UpsertPassengerDisclosureMessageCatalogEntryCommand`, `RecordPassengerAcknowledgementCommand`.
- `packages/contracts/src/index.ts`: wires `PassengerDisclosureRequirementSnapshot` onto `OwnedOrderRecord` and `BookingRecord`; `RecordPassengerAcknowledgementCommand` onto `CreateTenantBookingCommand.passengerDisclosureAcknowledgement`.

### AC-2 — channelRules carry `acknowledgementMode` ∈ {per_booking_checkbox, program_level_contract, verbal_recorded, operator_confirmed_notice}
- Contract enum `PASSENGER_DISCLOSURE_ACKNOWLEDGEMENT_MODES` lists exactly the 4 modes; typed on `PassengerDisclosurePolicyChannelRule.acknowledgementMode`.
- DB enforcement: `V0042` `passenger_acknowledgement_records.acknowledgement_mode` `CHECK (… IN (4 modes))`.

### AC-3 — Baseline message catalog v1 loaded (§1.6 messageCode; en-US verbatim, zh-TW baseline `legalApproved=false`)
- `V0042` seeds `passenger_disclosure_message_catalog` with two rows under `catalog_version='passenger_disclosure.v1'`, `message_code='sandbox_passenger_disclosure.av_program_notice'`:
  - `pdc-v1-av-en-us` — locale `en-US`, **`legal_approved=TRUE`**, verbatim English body.
  - `pdc-v1-av-zh-tw` — locale `zh-TW`, **`legal_approved=FALSE`**, baseline zh-TW body.
  - `ON CONFLICT (entry_id) DO NOTHING` → idempotent seed.
- Service mirrors the baseline catalog version constant: `BASELINE_DISCLOSURE_CATALOG_VERSION = "passenger_disclosure.v1"` (`sandbox-dispatch-gate.service.ts:48`).

### AC-4 — messageCode is the sole text authority (frontend/no hard-coded legal copy)
- Gate projection only emits a `messageCode` when a catalog entry exists for it, else `null`:
  `sandbox-dispatch-gate.service.ts:215` (`messageCode: this.messageCatalogEntries.some(... entry.messageCode === channelRule.messageCode) ? channelRule.messageCode : null`).
- `PassengerDisclosureRequirementSnapshot.messageCode` is `string | null` — body text is **not** carried on the snapshot; copy resolves via catalog lookup keyed by `messageCode::locale` (`messageCatalogKey`, `service.ts:1170`).
- Unique index `idx_p2_passenger_disclosure_catalog_code_locale (message_code, locale)` guarantees a single authoritative entry per code+locale.

### AC-5 — Missing policy/catalog ⇒ AV passenger assignment **fail-closed** (booking allowed, AV not dispatched)
- Hard-reason collection adds blocking codes (`sandbox-dispatch-gate.service.ts:809–819`):
  - no `policyId` → `PASSENGER_DISCLOSURE_POLICY_MISSING`
  - no `messageCode` → `PASSENGER_DISCLOSURE_MESSAGE_MISSING`
  - `requiresAcknowledgement && !acknowledgedAt` → `PASSENGER_ACKNOWLEDGEMENT_REQUIRED`
- Any hard reason forces a blocked decision (`service.ts:1358–1385`): `if (hardReasonCodes.length > 0) decision = "block"` and `fallbackRequired: decision === "block"` → AV blocked, human fallback required. Booking creation path is independent (owned-mobility), satisfying "可建 booking 不派 AV".
- New reason codes registered in `SANDBOX_DISPATCH_REASON_CODES` (contract) — the 3 codes above.

### AC-6 — Acknowledgement recorded when required
- `recordAcknowledgement` path (`service.ts:230–270`): rejects when `!requiresAcknowledgement` (`This disclosure does not require an acknowledgement.`) and when `!messageCode` (`…message is missing.`), else persists `PassengerAcknowledgementRecord`.
- Owned-mobility booking flow records the ack on the booking when the policy demands it and emits `booking.passenger_disclosure_acknowledged` event + `acknowledge_passenger_disclosure` audit action (`owned-mobility.service.ts:1121–1192`); inline acks persist on the **same transaction executor** (test AC, §3).

### AC-7 — Persistence: policies, catalog, acknowledgement records
- `V0042` creates `av_sandbox.passenger_disclosure_policies`, `…message_catalog`, `…acknowledgement_records` with scoped/locale/booking/order indexes.
- Repository upsert + cache-load methods: catalog upsert keyed on `(message_code, locale)`; policy/catalog/ack reads feed the gate disclosure cache (`service.ts:1118–1166` lazy `disclosureCacheLoaded`).

### AC-8 — Unit + integration green (owner-reported)
| Test | File:line | Asserts |
|---|---|---|
| Block dispatch when ack required but missing | `sandbox-dispatch-gate.service.test.ts:1006` | AC-5 hard-block |
| Reuse persisted catalog entry id on reseed (no explicit id) | `sandbox-dispatch-gate.service.test.ts:21` | idempotent catalog upsert |
| Upsert catalog entries on message_code+locale key | `sandbox-dispatch-gate.repository.test.ts:83` | AC-4 uniqueness |
| Record ack on booking when policy demands | `owned-mobility.service.test.ts:3078` | AC-6 |
| Persist inline booking acks on same txn executor | `owned-mobility.service.test.ts:3170` | AC-6 atomicity |
| Clear stored acks when policy semantics change | `owned-mobility.service.test.ts:3289` | snapshot invalidation |
| Audience-specific disclosure projection | `owned-mobility.service.test.ts:2937` | visibility (P2-DP-C3-001 seam) |
| **Integration:** require ack before AV assignment when policy demands | `int-p2-002-sandbox-dispatch-hook.test.ts:268` | AC-5 end-to-end fail-closed |

---

## 3. API surface added (for contract-review focus)

| Route | Controller | Purpose |
|---|---|---|
| `POST passenger-disclosure/policies` | sandbox-dispatch-gate | upsert disclosure policy |
| `GET  passenger-disclosure/policies/:policyId` | sandbox-dispatch-gate | read policy |
| `POST passenger-disclosure/catalog` | sandbox-dispatch-gate | upsert catalog entry |
| `GET  passenger-disclosure/catalog` | sandbox-dispatch-gate | list catalog |
| `POST tenant/bookings/:bookingId/passenger-disclosure-acknowledgement` | owned-mobility | record passenger ack |

---

## 4. Reviewer focus (R1–R7) — for Codex2 / parent reviewer Codex

- **R1 — Fail-closed completeness:** confirm `collectHardReasons` (`service.ts:809–819`) is the *only* path AV
  dispatch can clear, and that `decision="block"` ⇒ `fallbackRequired=true` (`service.ts:1364/1385`) cannot be
  bypassed by the soft-reason / safety-operator branch when a disclosure hard reason is present (hard reasons
  are evaluated first, so safety-operator path is unreachable while blocked — verify intended).
- **R2 — messageCode authority:** verify no legal copy is hard-coded in API/UF beyond `V0042` seed + service
  baseline constant; snapshot `messageCode` nullifies when the catalog lacks the code (`service.ts:215`).
  Confirm `bodyText` is never persisted on the requirement snapshot or booking record.
- **R3 — Acknowledgement atomicity:** `owned-mobility.service.ts:1121–1192` inline-ack on same txn executor —
  confirm no second connection/commit splits booking + ack (test `:3170` covers; check the executor threading).
- **R4 — Snapshot invalidation:** `clearStoredAcknowledgements` when policy semantics change
  (`owned-mobility.service.ts` diff equality at `:5108–5125`; test `:3289`) — verify equality keys
  (messageCode + requiresAcknowledgement) are sufficient; an `acknowledgementMode` change alone may not
  invalidate. **Flag for reviewer judgement.**
- **R5 — Catalog uniqueness vs. legalApproved:** unique `(message_code, locale)` means a single row owns both
  body and `legal_approved`. Confirm zh-TW `legalApproved=false` is surfaced/blocked correctly downstream
  (baseline is intentionally not legally approved per §1.6).
- **R6 — Migration safety:** `V0042` is additive, `IF NOT EXISTS` + `ON CONFLICT DO NOTHING`, no FK to
  policies/catalog from `acknowledgement_records` (policy_id/message_code are plain TEXT) — confirm this
  loose coupling is intended (no `ON DELETE` semantics; ack rows survive policy deletion).
- **R7 — Contract enums vs. DB CHECK parity:** the 4 acknowledgementModes, 4 channels, 4 actorTypes are
  duplicated in both the TS const arrays and the `V0042` CHECK constraints — confirm they stay in lockstep
  (drift would let a contract value fail at the DB).

---

## 5. Risks / GOTCHAs

- **G1 — CI not asserted here.** Parent is `review` gated on PR #917 required checks. This packet asserts
  *code* evidence only; integration closeout (`merged_to_dev`) is the integrator's gate, not a code fault.
- **G2 — No FK from acknowledgement records.** `policy_id` / `message_code` on `passenger_acknowledgement_records`
  are unconstrained TEXT (R6). Intentional decoupling, but reviewer should confirm orphan-ack tolerance.
- **G3 — Loose snapshot-equality invalidation (R4).** `acknowledgementMode`-only policy edits may not clear a
  stored ack. Low risk for v1 (single AV notice code) but worth an explicit reviewer call.
- **G4 — Enum/CHECK duplication (R7).** Contract const arrays and SQL CHECK lists must be hand-kept in sync.

---

## 6. Handoff

- **Self (sidecar) status target:** `handoff` → **Codex2**, moving this task to `review`.
- **Parent P2-DP-S1-001:** stays `review` (owner Codex2 / reviewer Codex). This packet does **not** change it.
- **Integration:** P2-DP-S1-001 closeout = PR #917 merge to `dev` by the integrator → auto-reconcile.
- **Absorption:** parent owner/reviewer may fold R1–R7 / G1–G4 into the mainline review at their discretion.
