# SR-RECOVERY-CONTRACTS-20260911 — Proof / Push-Receipt / Adapter-Registry Contracts & Migration Allocation

Owner：Claude；Reviewer：Claude2。日期：2026-09-11 UTC。

## 0. Provenance correction (read this before trusting any earlier note)

At dispatch, this task's machine-truth `next` field claimed the implementation
was "already substantially drafted," reported 31 regression tests and a
completed ff-merge to `origin/dev c0ec81b69`. That claim was **verified false**
before any further work: `git rev-parse HEAD origin/dev` showed this branch's
HEAD was bit-for-bit identical to `origin/dev`'s tip (no task commit existed
at all — that tip commit is `c0ec81b69`, the unrelated `SR-RECOVERY-CANVAS-20260911`
canvas-states PR), and only 2 of the 11 declared artifacts existed on disk —
`packages/contracts/src/platform-adapter-registry.ts` and
`docs/04-uat/.../schema-allocation.json` — both pre-existing baseline files
last touched by `SR-CONTRACT-001`/`SR-ACADEMY-BE-001`/W2, not new work. This
was recorded via `ai-status.sh progress` before implementation began. Every
claim in this report was re-verified against actual command output, not
carried over from that prior note.

## 1. 版本與追溯 (Version & Traceability)

- **工作分支 (Branch)**：`claude/sr-recovery-contracts-20260911`
- **工作樹目錄 (Worktree)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-recovery-contracts-20260911`
- **基準 SHA (Base SHA)**：`c0ec81b694fbd440d9c835129fcb062ba6b04340` (`origin/dev`, identical to branch HEAD before this candidate's commit)
- **規劃參照 (Planning Reference)**：`docs/04-uat/system-remediation-20260906/source/capabilities.json`
- **路由依據 (Routing authority)**：
  - `support/unblock/SR-PROOF-001/SR-PROOF-001-UNBLOCK-PLANNING-DECISION.md`
  - `support/unblock/SR-PUSH-001/SR-PUSH-001-UNBLOCK-PLANNING-DECISION.md`
  - `support/unblock/SR-ADMIN-ADAPTER-001/SR-ADMIN-ADAPTER-001-UNBLOCK-PLANNING-DECISION.md`
- **相依 (Dependencies)**：`SR-CONTRACT-001`, `SR-CONTRACT-READ-001`, `SR-OPS-CONTRACT-001`, `UV-EXEC-019`, `SR-BOOKING-VERIFY`
- **下游 (Downstream producers this unblocks)**：`SR-PROOF-001`, `SR-PUSH-001`, `SR-LIVE-PUSH-001`, `SR-ADMIN-ADAPTER-001`

---

## 2. 交付範圍 (What was actually built)

### 2.1 Remittance Proof (`packages/contracts/src/remittance-proof.ts`, new)

Server-generated `proofId`; batch/driver ownership fixed at upload; immutable
content identity (`contentHash`/`contentType`/`sizeBytes` set once); an
authoritative scan lifecycle (`pending_scan` → `clean` | `rejected`); an
expiring, single-purpose authorized readback grant
(`RemittanceProofReadbackGrant.expiresAt`); and a durable, idempotent payment
receipt (`RemittanceProofPaymentReceipt`, keyed by `(batchId, idempotencyKey)`
per the migration allocation below) replacing the existing
`markReimbursementPaid`'s bare, client-trusted `remittanceProofId` string
(`apps/api/src/modules/billing-settlement/billing-settlement.service.ts:2580-2678`).

### 2.2 Passenger Push Delivery (`packages/contracts/src/passenger-push-delivery.ts`, new)

Provider-neutral claim/lease/fence (`PushDeliveryClaim.fenceToken`, monotonic
per `outboxId`) so a stalled worker's write cannot clobber the worker that
reclaimed a row; `PushProviderAckState` and `PushDeviceDeliveryState` are
independent fields — a provider ack never implies `deviceDeliveryState:
"delivered"`; `PushDeliveryReceipt.dedupeKey` is server-derived
(`outboxId:fenceToken`), never client-suppliable; and
`RecordPushDeliveryReceiptResult.outcome: "persistence_unknown"` gives a
caller a real value to return when the provider ack was observed but the
durable write itself failed, instead of fabricating `"recorded"`. This
directly answers the gap found in
`support/unblock/SR-PUSH-001/SR-PUSH-001-UNBLOCK-PLANNING-DECISION.md`:
`MultiTaxiRepository.updateConsumerNotificationOutboxDelivery` currently
updates by id with no claim/fence/receipt columns and its persistence helper
swallows write failure. No transport/provider (FCM/APNs/etc.) is chosen — out
of scope by this task's own acceptance bar.

### 2.3 Platform Adapter Registry extension (`packages/contracts/src/platform-adapter-registry.ts`, extended)

Added `AdapterCredentialExpiry` (nullable `reference`/`expiresAt`, never the
secret), `AdapterCredentialExpiryWarning` (server-computed
`unknown|ok|warning|expired`; missing/unparsable expiry resolves to
`unknown`, never `ok`), `PlatformAdapterAuditEvidence` (server-generated,
never client-constructed) and, on `UpdatePlatformAdapterCommand`, `reason`
and `expectedRevision` for optimistic concurrency. **Design note**: these new
fields are typed optional (`?:`) rather than required. `apps/platform-admin-web`
(`AdapterManager.ts:defaultAdapters()`, `EditAdapterModal.tsx:80`,
`PlatformAdapterRegistry.ts`) already constructs `PlatformAdapter` and
`UpdatePlatformAdapterCommand` object literals without these fields; making
them required broke `pnpm --filter @drts/platform-admin-web typecheck`
(verified — see §3) and that app is outside this task's `write_scopes`. A
downstream `SR-ADMIN-ADAPTER-001`-scoped implementation is expected to
populate them and can tighten them to required once its own consumers are
updated; this candidate does not silently drop the requirement, it documents
it in the type's own doc comments.

### 2.4 API client (`packages/api-client/src/index.ts` + new `remittance-proof.ts` / `platform-adapter-registry.ts` companions)

Following the existing `system-remediation.ts` convention (real methods live
on `ApiClient` in `index.ts`; the companion file re-exports types, declares a
`*ClientInterface`, and provides functional-adapter wrappers): added
`uploadRemittanceProof`, `getRemittanceProof`,
`requestRemittanceProofReadback`, `markReimbursementPaidWithProof`, and
`getPlatformAdapterCredentialExpiryWarning` (which **rejects** — via the
existing `ApiClientError` path on non-2xx — rather than resolving a
fabricated warning object on API failure; covered by a dedicated negative
test in §3). Passenger push delivery has no client-facing surface by design
(server-internal claim/lease), matching its absence from this task's
artifact list.

### 2.5 OpenAPI (`docs/04-api/openapi-spec.yaml`)

Five new paths (`/api/reimbursements/proofs`,
`/api/reimbursements/proofs/{proofId}`,
`/api/reimbursements/proofs/{proofId}/readback`,
`/api/reimbursements/{batchId}/pay-with-proof`,
`/api/platform-admin/adapters/{id}/credential-expiry-warning`), two new tags
(`RemittanceProof`, `PlatformAdapterRegistry`), and matching
request/response/envelope schemas, styled after the existing
`/api/driver-leave/*` block. `MoneyAmount` is inlined (`currency`/
`amountMinor`) rather than `$ref`'d, matching this file's existing convention
— there is no shared `MoneyAmount` component in this spec today.

### 2.6 Migration allocation (`docs/04-uat/system-remediation-20260906/schema-allocation.json`)

Appended (not replaced) `additional_allocations` reserving `V0098` (billing,
`billing.phase1_remittance_proofs` + `billing.phase1_remittance_proof_payment_receipts`),
`V0099` (ops, `ops.phase1_push_delivery_claims` + `ops.phase1_push_delivery_receipts`),
`V0100` (admin, `admin.phase1_platform_adapters` + `admin.phase1_platform_adapter_mutation_audit`)
— confirmed collision-free against the highest canonical migration on disk
(`infra/migrations/V0097__platform_presence_busy_and_heartbeat.sql`) and
against every other task in `in_progress` at write time (`ai-status.sh list
--status in_progress`: `SR-OPS-PROOF-001` is an unrelated backup/restore-proof
task, no migration-number overlap). Each entry records concrete table,
constraint and transaction invariants (fencing check, idempotency
`UNIQUE (batch_id, idempotency_key)`, same-transaction audit insert, etc.)
for the downstream BE producers to implement against — this task allocates
and specifies, it does not write the `infra/migrations/*.sql` files
themselves, matching the `SR-CONTRACT-001` precedent.

### 2.7 Tests (`tests/unit/system-remediation/sr-recovery-contracts-20260911/`)

New file, 32 passing cases across 4 groups: schema-allocation invariants,
`@drts/contracts` structural + back-compat regression guards, `@drts/api-client`
mock-fetch transport tests (including the credential-expiry-warning
API-failure-rejects-not-resolves negative case), and Ajv-compiled
positive/negative validation of the new OpenAPI schemas (invalid enum
values, missing required fields, wrong types).

---

## 3. 驗證執行紀錄與實際結果 (Verification Evidence)

| 檢查項目 / 指令 | Exit Code | 實際結果摘要 |
| :-- | :-: | :-- |
| `git rev-parse HEAD origin/dev` (pre-work) | 0 | 確認兩者相同 SHA `c0ec81b69...`，證實先前「已完成」聲明為假 |
| `pnpm --filter @drts/contracts build` | 0 | `tsc -p tsconfig.json`，無 emit 錯誤 |
| `pnpm --filter @drts/api-client typecheck` | 0 | `tsc -p tsconfig.typecheck.json --noEmit`，無錯誤 |
| `pnpm --filter @drts/platform-admin-web typecheck` | 0 | 驗證新增/選填欄位未破壞既有 FE 消費者編譯（見 §2.3 設計說明） |
| `pnpm --filter @drts/api typecheck` | 0 | 驗證 `apps/api` 對 `@drts/contracts` 之既有型別消費未被破壞 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-recovery-contracts-20260911/` | 0 | 1 test file, **32 passed**, 0 failed |
| `git diff --check` | 0 | 工作目錄零 whitespace error |
| `python3 -c "import yaml; yaml.safe_load(...)"` | 0 | `openapi-spec.yaml` 41 paths / 177 schemas，新增內容可解析 |
| `python3 -c "import json; json.load(...)"` | 0 | `schema-allocation.json` 可解析，`additional_allocations` 3 筆 |

This task's declared `test_commands` (`git diff --check`, contracts build,
api-client typecheck, the vitest run above) all pass. The two extra
typechecks (`platform-admin-web`, `api`) were run beyond the declared list
specifically to verify the optional-field design decision in §2.3 does not
regress out-of-scope consumers, since root CI runs `turbo run typecheck`
across the whole workspace.

---

## 4. 變更範圍守護 (Write Scopes Compliance)

Only files in this task's declared `write_scopes`/`artifacts` were touched:

1. `packages/contracts/src/remittance-proof.ts` — new
2. `packages/contracts/src/passenger-push-delivery.ts` — new
3. `packages/contracts/src/platform-adapter-registry.ts` — extended
4. `packages/contracts/src/index.ts` — export wiring
5. `packages/api-client/src/remittance-proof.ts` — new
6. `packages/api-client/src/platform-adapter-registry.ts` — new
7. `packages/api-client/src/index.ts` — new `ApiClient` methods + export wiring
8. `docs/04-api/openapi-spec.yaml` — new paths/tags/schemas
9. `docs/04-uat/system-remediation-20260906/schema-allocation.json` — appended allocations
10. `tests/unit/system-remediation/sr-recovery-contracts-20260911/` — new test file
11. `docs/04-uat/system-remediation-20260906/SR-RECOVERY-CONTRACTS-20260911.md` — this document

No file under `apps/`, `infra/migrations/`, or any other task's declared
scope was modified — including `apps/platform-admin-web`, whose typecheck was
run read-only as verification, not touched.

---

## 5. 驗證界線與非即時排除聲明 (Boundaries & Non-Live Exclusions)

- **No backend implementation**: `billing-settlement.service.ts`'s
  `markReimbursementPaid`, `MultiTaxiService.deliverPassengerNotification`/
  `MultiTaxiRepository.updateConsumerNotificationOutboxDelivery`, and
  `platform-admin.repository.ts`/`platform-admin.service.ts` are unchanged —
  wiring the new types into real persistence and control flow is
  `SR-PROOF-001` / `SR-PUSH-001` / `SR-ADMIN-ADAPTER-001`'s job, per the
  centralization rule these unblock decisions already established.
- **No `infra/migrations/*.sql` files written** — allocation and invariants
  only (§2.6); no DDL executed against any database.
- **No live provider/device push test** — provider-neutral contract only, by
  explicit acceptance instruction ("Do not choose external provider/device
  protocol merely to close this task").
- **No frontend screen work** — the canvas-level proof upload/scan/reject/
  readback states for `PA_Reimbursements`/`PA_ReimbursementDetail`
  (`platform-screens-3.jsx`) remain a separate, already-identified design
  follow-up per the `SR-PROOF-001` unblock decision.
- **`UpdatePlatformAdapterCommand.reason`/`expectedRevision` are optional, not
  enforced** at the type level in this candidate — see §2.3 for why, and what
  a downstream implementation still owns.

---

## 6. 交接資訊 (Handoff)

- **狀態 (Status)**：candidate ready, awaiting independent review (`Claude2`) and CI
- **CANDIDATE_SHA**：set via `git rev-parse HEAD` at commit time (see machine-truth handoff note)
- **CANDIDATE_BRANCH**：`claude/sr-recovery-contracts-20260911`
