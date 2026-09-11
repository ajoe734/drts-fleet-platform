# SR-PROOF-001 — 匯款證明上傳、歸屬查驗與付款 gate

Owner：Claude；Reviewer：Claude2。日期：2026-09-11 UTC。

## 1. 版本與追溯 (Version & Traceability)

- **工作分支 (Branch)**：`claude/sr-proof-001-recovery-20260911`
- **工作樹目錄 (Worktree)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-proof-001`
- **基準 SHA (Base SHA)**：`f31c2489fc9f9406e3313d984e729287d2f602cb` (`origin/dev` at session start, after fast-forwarding this worktree's branch)
- **候選 SHA (Candidate SHA)**：set via `git rev-parse HEAD` at commit time (see handoff note in machine-truth `progress`/`handoff` calls)
- **規劃參照 (Planning Reference)**：`docs/04-uat/system-remediation-20260906/source/capabilities.json`
- **任務規格 (Task spec)**：`docs/03-runbooks/system-remediation-20260906/SR-PROOF-001.md`
- **相依 (Dependencies)**：`SR-ARTIFACT-001`, `SR-INVOICE-001`, `SR-CONTRACT-001`, `SR-RECOVERY-CONTRACTS-20260911`, `SR-RECOVERY-CANVAS-20260911` — all merged to `origin/dev` before this task began; the authoritative `packages/contracts/src/remittance-proof.ts` / `packages/api-client/src/remittance-proof.ts` / `docs/04-api/openapi-spec.yaml` (5 new `RemittanceProof` paths) / `docs/04-uat/system-remediation-20260906/schema-allocation.json` (V0098 allocation) these produced were consumed as-is; none of those files are in this task's `write_scopes` and none were modified.

### 0. Provenance note

The dispatched task brief's `next` field described this task as "beginning
exploration"; no prior implementation commit existed on this branch or its
worktree before this session (`git log` on the branch showed only the
fast-forward to `origin/dev`). Everything below was built and verified in
this session.

---

## 2. 交付範圍 (What was built)

### 2.1 Contracts consumed, not redefined

`packages/contracts/src/remittance-proof.ts` (built by
`SR-RECOVERY-CONTRACTS-20260911`) already defines `RemittanceProofRecord`,
`UploadRemittanceProofCommand`, `RequestRemittanceProofReadbackCommand`,
`RemittanceProofReadbackGrant`, `MarkReimbursementPaidWithProofCommand`,
`RemittanceProofPaymentReceipt`, and the five `docs/04-api/openapi-spec.yaml`
paths/schemas for them. This task implements the backend and UI behind that
already-locked contract; it does not add fields to it.

### 2.2 New backend modules (`apps/api/src/modules/billing-settlement/`)

- `remittance-proof-storage.port.ts` / `remittance-proof-storage.adapter.ts`
  — a dedicated (not the shared `DocumentArtifactStore`, whose fixed kind
  enum in `document-artifact-kinds.ts` is out of `write_scopes` to widen)
  two-phase (`stage` → `commit`) content store. `commit` computes
  `contentHash`/`sizeBytes` from the actual staged bytes, never from
  whatever the client declared on the upload command. The default
  `InMemoryRemittanceProofStorageAdapter` has the same durability posture as
  `InMemoryDocumentArtifactStore` elsewhere in this codebase (real bytes,
  real sha256, not durable across process restarts).
- `remittance-proof-scanner.port.ts` / `remittance-proof-scanner.adapter.ts`
  — `UnprovisionedRemittanceProofScannerAdapter` is the wired default: fail
  closed (`availability(): "unavailable"`, `scan()` throws), mirroring the
  sibling `UnavailablePaymentRecoveryPort` already in this module. A newly
  uploaded proof's `scanState` is unconditionally `pending_scan`
  (`packages/contracts/src/remittance-proof.ts`'s own invariant, and the
  locked OpenAPI upload description). Nothing auto-promotes it to `clean`.
  The file also includes `EicarSignatureRemittanceProofScannerAdapter`, an
  honest, narrowly-scoped (EICAR-signature-only) scanner usable for
  local/dev/test wiring — never wired as the runtime default.
- `remittance-proof.service.ts` (`RemittanceProofService`) — owns the proof
  lifecycle: `uploadProof`, `getProof`, `requestReadback`
  (HMAC-signed, expiring link via the existing
  `apps/api/src/common/controlled-download.ts` signing utility, `kind:
  "remittance-proof"` — a generic string parameter, not tied to
  `document-artifact-kinds.ts`), `verifyReadbackGrant` (test-reachable
  verification of the same signature+expiry check), `recordScanResult` /
  `attemptScan` (idempotent; the seam a real scanning pipeline would call),
  and `markPaidWithProof` (existence + batch-match + `clean` scan +
  idempotent receipt). Runs against an in-memory fallback when no DB
  repository is wired (matching this whole module's existing dual-mode
  pattern for `reimbursementBatches`), or against the durable repository
  path below when one is.
- `billing-settlement.repository.ts` — added `insertRemittanceProof`,
  `findRemittanceProofById`, `recordRemittanceProofScanResult` (guarded
  `WHERE scan_state = 'pending_scan'`, so a second scan-result call for an
  already-terminal proof is a no-op replay, not a re-transition), and
  `markRemittanceProofPaid` (a real SQL transaction: replay-check by
  `(batch_id, idempotency_key)` first, `SELECT ... FOR UPDATE` on the proof
  row, validate batch match + `clean`, `INSERT ... ON CONFLICT (batch_id,
  idempotency_key) DO NOTHING RETURNING *`, with a race-lost fallback
  re-SELECT). Batch existence/`approvedAt` is intentionally **not**
  re-validated in SQL — `BillingSettlementService` already holds the
  authoritative in-memory `ReimbursementBatchRecord` used everywhere else in
  this module, and duplicating that check against a second (SQL) source of
  batch truth would create two ways for batch state to disagree.
- `infra/migrations/V0098__sr_remittance_proof.sql` — the two tables per
  `schema-allocation.json`'s V0098 invariants
  (`billing.phase1_remittance_proofs`,
  `billing.phase1_remittance_proof_payment_receipts`, including the
  `UNIQUE (batch_id, idempotency_key)` idempotency constraint). One
  deliberate deviation from the allocation text is documented in the
  migration's header comment: `batch_id` is `varchar(100)` (matching the
  real `billing.phase1_reimbursement_batches.batch_id` column from
  `V0012__phase1_remaining_runtime_snapshots.sql`), not `uuid` as the
  allocation doc's prose suggested — the allocation text's type was
  descriptive shorthand, not literal; matching the actual referenced
  column's type is what foreign-key integrity requires.
- `billing-settlement.module.ts` — wires `RemittanceProofService` and binds
  `REMITTANCE_PROOF_STORAGE`/`REMITTANCE_PROOF_SCANNER` to their
  always-available / fail-closed default adapters, following the exact
  `PAYMENT_RECOVERY_PORT` provider-binding convention already in this file.

### 2.3 `billing-settlement.service.ts` (new methods; existing methods unchanged)

`stageRemittanceProofContent`, `uploadRemittanceProof` (resolves the batch,
denormalises `driverId` from it — never from the client — and enforces that
a `driver`-realm caller can only upload against their own batch),
`getRemittanceProof`, `requestRemittanceProofReadback`,
`markReimbursementPaidWithProof` (batch existence + `approvedAt`, then
delegates proof/receipt validation to `RemittanceProofService`, then updates
the batch to `paid` — matching the existing `markReimbursementPaid`'s own
batch-mutation shape — only when the receipt call was not itself a replay
of an already-paid state). A `remittanceProofServiceForTest` getter exposes
the underlying `RemittanceProofService` for unit tests to drive
`attemptScan`/`markPaidWithProof` directly, since neither has an HTTP route
in the locked OpenAPI surface (see §5).

**The existing `markReimbursementPaid` / `POST reimbursements/:batchId/pay`
is intentionally left unchanged.** `tests/unit/billing-settlement.test.ts`
(outside this task's `write_scopes`) has a passing regression that marks a
batch paid using a bare, never-uploaded `remittanceProofId: "remit-proof-001"`
string; gating that existing method on a real proof record would break that
out-of-scope test, which the branch-strategy rules for this task explicitly
forbid ("只改 write_scopes"). The proof-backed gate this task delivers is
the **new** `markReimbursementPaidWithProof` method and
`POST reimbursements/:batchId/pay-with-proof` route, matching
`SR-RECOVERY-CONTRACTS-20260911`'s own framing of that new command/route as
the thing "replacing the existing `markReimbursementPaid`'s bare,
client-trusted `remittanceProofId` string". **This is a known, explicit
boundary, not an oversight**: a caller who calls the legacy `/pay` route
directly still bypasses the proof gate. Closing that gap requires either
changing/removing the legacy route (which needs the out-of-scope test
updated first) or a follow-up task with `tests/unit/billing-settlement.test.ts`
in its `write_scopes`.

### 2.4 `billing-settlement.controller.ts` (new routes)

- `POST reimbursements/proofs` — `uploadRemittanceProof` (`@RequireRealms("driver")`,
  `@RequireScopes("driver:write")`, matching the locked OpenAPI description's
  documented RBAC for this exact route).
- `GET reimbursements/proofs/:proofId` — `getRemittanceProof`.
- `POST reimbursements/proofs/:proofId/readback` — `requestRemittanceProofReadback`.
- `POST reimbursements/:batchId/pay-with-proof` — `markReimbursementPaidWithProof`.
- `POST reimbursements/proofs/staged-content` — **not** one of the five
  locked OpenAPI paths; see §5 for why it exists and its exact boundary.

None of these touch `docs/04-api/openapi-spec.yaml` (not in `write_scopes`);
the four routes above match that file's already-committed path/schema
definitions exactly (method, path shape, request/response types).

### 2.5 UI (`apps/platform-admin-web/app/payments/reimbursements/`)

- `[batchId]/page.tsx` — added a "匯款證明 · Remittance proof" card (proof
  metadata, scan-state pill, readback banner with expiry + re-authorize,
  matching `docs/05-ui/drts-design-canvas/platform-screens-3.jsx`'s
  `PA_ReimbursementDetail` §13.1 states) and a "標記已付款 · 前置條件" gate
  card (batch-approved / proof-clean `GateRow`s, mirroring the canvas's own
  `GateRow`) whose mark-paid button now calls
  `markReimbursementPaidWithProof` instead of the free-text
  `remittanceProofId` input the page previously rendered (that input and
  the old `handleMarkPaid` call are removed). The canvas file's own
  component API (`ActionButton` with a `descriptor` prop, a `Stepper`, a
  `GateRow`) is a **design mockup's** simplified API, not the real
  `@drts/ui-web` package — this page already translated the canvas's
  visual intent into this app's actual `CanvasCard`/`CanvasPill`/`CanvasBanner`/`CanvasBtn`
  components before this task touched it (see the existing hand-rolled
  `stepperStyle` state-machine stepper), so the new proof/gate sections
  follow that same established translation, not the canvas's literal props.
- `translations.ts` (new, local to this directory) — see §5 for why this
  exists instead of adding keys to the shared
  `apps/platform-admin-web/lib/translations.ts`. Named `translations.ts`
  (not a task-specific filename) because `tools/ci/i18n-guard.mjs` only
  skips scanning files with that exact name, matching the repo's existing
  route-scoped convention (e.g. `apps/platform-admin-web/app/users/translations.ts`).
- The queue list page (`page.tsx`) is **not** changed: it already derives an
  "exported" status from `remittanceProofId` presence, and adding a live
  per-row proof-state column would need an additional list-of-batches →
  N proof lookups fan-out this task chose not to add given the scope
  already covered by the detail page. Documented here as a deliberate,
  not-done scope choice.

---

## 3. 驗證執行紀錄與實際結果 (Verification Evidence)

| 檢查項目 / 指令 | Exit Code | 實際結果摘要 |
| :-- | :-: | :-- |
| `git diff --check` | 0 | 工作目錄零 whitespace error |
| `pnpm --filter @drts/contracts build` | 0 | Rebuilt so `@drts/api`/`@drts/platform-admin-web` resolve the already-merged `remittance-proof.ts` types (their pre-existing dist was stale from before `SR-RECOVERY-CONTRACTS-20260911` merged; this task did not change any `packages/contracts` source) |
| `pnpm --filter @drts/api typecheck` | 0 | `tsc -p tsconfig.json --noEmit`, no errors |
| `pnpm --filter @drts/platform-admin-web typecheck` | 0 | Next.js route-type generation + `tsc`, no errors |
| `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/` | 0 | 1 test file, **19 passed**, 0 failed |
| `pnpm exec vitest run tests/unit/billing-settlement.test.ts` | 0 | Pre-existing, out-of-scope regression suite — **8 passed**, 0 failed (confirms the legacy `markReimbursementPaid` path this task deliberately left unchanged, per §2.3, still works exactly as before) |

Full command transcripts were run interactively in this session; the table
above records the exact commands and their exit codes/summaries.

### 3.1 Acceptance-criteria → test mapping (`tests/unit/system-remediation/sr-proof-001/sr-proof-001-remittance-proof.test.ts`)

- 虛構ID 無法 paid → `"rejects a fabricated proofId"` (`REMITTANCE_PROOF_NOT_FOUND`).
- 他batch 無法 paid → `"rejects a proof that belongs to a different batch"` (`REMITTANCE_PROOF_BATCH_MISMATCH`), exercised directly against `RemittanceProofService.markPaidWithProof` (see the test's own comment for why: the seeded fixture data does not reliably yield two independent reimbursement-eligible batches in one call, so this isolates the exact ownership-check branch instead of fighting fixture data).
- 未掃描 無法 paid → `"rejects a proof still pending_scan"` (`REMITTANCE_PROOF_NOT_CLEAN`).
- 掃描被拒 無法 paid → `"rejects a proof the scanner rejected"` (`REMITTANCE_PROOF_NOT_CLEAN`, plus asserts the rejection reason round-trips through `getRemittanceProof`).
- 未核准 無法 paid → `"rejects mark-paid when the batch is not yet approved, even with a clean proof"` (`REMITTANCE_PROOF_BATCH_NOT_APPROVED`).
- 合法證明可從付款紀錄回看 → `"pays with a clean, batch-matching, approved proof and records a durable receipt"`: pays, then re-reads the proof via `getRemittanceProof(paidBatch.remittanceProofId)` and issues a fresh, currently-valid readback grant from it.
- 重送 markPaid → `"replays the identical receipt when markPaid is resent with the same idempotencyKey"`.
- 並發覆核 → `"converges concurrent markPaid calls with the same idempotencyKey onto one receipt"` (`Promise.all` of 3 concurrent calls with the same key).
- durable receipt 正確 → both of the above assert `receiptId`/`paidAt`/`createdAt` are identical across replay/concurrency, not merely "some receipt".
- Authorized readback + re-authorization on expiry → `"verifies a fresh grant, then rejects the same grant once expired"` (`vi.useFakeTimers`, advances past `expiresAt`, asserts `verifyReadbackGrant` flips from `{ok:true}` to `{ok:false, reason:"expired"}`, then asserts re-authorization issues a distinct, currently-valid `readbackUrl`).
- 越權 (ownership) → `"rejects an upload from a driver who does not own the batch"`.
- Storage/scanner adapter unit coverage → `InMemoryRemittanceProofStorageAdapter` (real content identity, single-use `stagedContentRef`, rejects unknown refs) and both scanner adapters (`Unprovisioned...` fail-closed; `EicarSignature...` real detection, not a fixed-percentage or fixture verdict).

---

## 4. 變更範圍守護 (Write Scopes Compliance)

Only files in this task's declared `write_scopes` were touched:

1. `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
2. `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
3. `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`
4. `apps/api/src/modules/billing-settlement/billing-settlement.module.ts`
5. `apps/api/src/modules/billing-settlement/remittance-proof.service.ts` — new
6. `apps/api/src/modules/billing-settlement/remittance-proof-storage.port.ts` — new
7. `apps/api/src/modules/billing-settlement/remittance-proof-storage.adapter.ts` — new
8. `apps/api/src/modules/billing-settlement/remittance-proof-scanner.port.ts` — new
9. `apps/api/src/modules/billing-settlement/remittance-proof-scanner.adapter.ts` — new
10. `apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`
11. `apps/platform-admin-web/app/payments/reimbursements/translations.ts` — new
12. `tests/unit/system-remediation/sr-proof-001/` — new
13. `infra/migrations/V0098__sr_remittance_proof.sql` — new
14. `docs/04-uat/system-remediation-20260906/SR-PROOF-001.md` — this document

`packages/contracts`, `packages/api-client`, `docs/04-api/openapi-spec.yaml`,
`docs/04-uat/system-remediation-20260906/schema-allocation.json`, and
`apps/platform-admin-web/lib/translations.ts` were read but not modified —
all outside this task's `write_scopes`.

`pnpm --filter @drts/contracts build` was run to refresh a stale `dist/`
(pre-dating `SR-RECOVERY-CONTRACTS-20260911`'s merge); this is a build
artifact regeneration from already-merged source, not a source edit, and
`git status` confirms no `packages/contracts` source file is modified.

---

## 5. 驗證界線與非即時排除聲明 (Boundaries & Non-Live Exclusions)

- **No live malware-scanning provider**: `UnprovisionedRemittanceProofScannerAdapter`
  is the wired default; a real AV/content-scanning integration is this
  task's own declared external gate, not something faked here. Tests
  exercise the `clean`/`rejected` transitions with an explicit,
  clearly-labelled test double (`ScriptedRemittanceProofScanner`), never
  the runtime default.
- **No live database exercised**: this VM cannot run Postgres/Docker
  Compose (VM restriction). `BillingSettlementRepository`'s new
  `insertRemittanceProof` / `findRemittanceProofById` /
  `recordRemittanceProofScanResult` / `markRemittanceProofPaid` methods and
  `infra/migrations/V0098__sr_remittance_proof.sql` are written to the same
  patterns as this repository's existing DB-backed methods (verified by
  direct comparison to `claimMultiTaxiPaymentRecoveryCommand`'s
  `ON CONFLICT ... DO NOTHING RETURNING` idempotency shape and
  `certificate-support.repository.ts`'s `SELECT ... FOR UPDATE` transaction
  shape) but are **not executed against a live database in this session**.
  All test coverage above exercises the in-memory fallback path (no
  `BillingSettlementRepository` injected / `isEnabled() === false`), which
  is also this module's default when no database is configured.
- **No raw-bytes staging endpoint in the locked contract**: `UploadRemittanceProofCommand.stagedContentRef`
  (`packages/contracts/src/remittance-proof.ts`) is documented as "opaque
  reference into the storage adapter's staged upload; not the raw bytes",
  which presumes a prior staging call. `SR-RECOVERY-CONTRACTS-20260911`'s
  own boundaries section says explicitly that no frontend/staging work was
  in its scope. This task added `POST reimbursements/proofs/staged-content`
  (base64 JSON body, to avoid introducing a `multer`/multipart dependency
  nothing else in this codebase uses) as the missing first phase, within
  this task's own `write_scopes` (`billing-settlement.controller.ts`). It is
  **not** one of the five OpenAPI paths `SR-RECOVERY-CONTRACTS-20260911`
  locked, and `docs/04-api/openapi-spec.yaml` is not in this task's
  `write_scopes` to add it to. Recorded here as a known gap for whichever
  task next touches that spec file.
- **No driver-facing upload UI**: the upload endpoint's own locked RBAC
  (`realm: driver, actor: driver_user`) means uploading is a driver-app
  action, not a platform-admin one — platform admin's role (and this task's
  only UI `write_scopes`, `apps/platform-admin-web/app/payments/reimbursements/`)
  is reviewing, authorizing readback, and marking paid, matching the canvas
  design's own framing (`uploadedBy` is a driver-side actor, not
  `pa_super_admin`). No driver-app upload screen was built; that belongs to
  whichever task owns a driver-facing app surface.
- **No byte-serving readback route**: `RemittanceProofReadbackGrant.readbackUrl`
  is a genuine, real HMAC-signed, expiring URL (via the same
  `createControlledDownloadMetadata`/`verifyControlledDownloadSignature`
  utility five other modules already use), but no controller route in this
  task actually streams bytes back for it — `RemittanceProofService.verifyReadbackGrant`
  exists so the signature+expiry logic is directly testable, and the
  detail-page UI surfaces the grant's authorization state/expiry (matching
  the canvas's own `Banner`, which likewise does not open a file preview).
  Wiring an actual byte-serving GET route is a small, well-scoped follow-up
  once a task with that specific route in its `write_scopes`/the OpenAPI
  spec exists.
- **Legacy `markReimbursementPaid` / `POST .../pay` is unhardened** — see
  §2.3. This is the single largest residual gap: a caller can still bypass
  the proof gate through the pre-existing route.
- **No real payment execution** — per the task's own instruction
  ("不執行真付款"), `markReimbursementPaidWithProof` only records a durable
  receipt and flips the batch's `status`; no external payment rail is
  called.

---

## 5.5 CI 修復記錄 (CI regression fix, post-review)

Reviewer `Claude2` locked candidate `b630fff4834463ad8d017a997a174e772d41499a`
(PR #1988, run `34584718150`); `unit` and `iam-negative-matrix` both failed
with real regressions in this task's own new controller code (not flaky
infra):

1. **`tests/security/iam-route-inventory.test.ts` — `realmMismatches`
   non-empty.** `BillingSettlementController#getRemittanceProof`
   (`GET reimbursements/proofs/:proofId`) declared
   `@RequireRealms("system","platform","ops","driver")` on scope
   `billing:read`, but `packages/contracts/src/iam-policy-catalog.ts`'s
   `billing:read` `allowedRealms` is `[system,platform,tenant,ops,partner]`
   — `driver` is not in the catalogue. `packages/contracts` is not in this
   task's `write_scopes`, so the catalogue could not be widened; the only
   in-scope fix is to drop `driver` from the decorator. Confirmed safe: the
   only caller of this route is `apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`
   (an admin/ops surface); no driver-web caller exists, and this task's own
   `tests/unit/system-remediation/sr-proof-001/` coverage calls
   `billingSettlementService.getRemittanceProof` directly (bypassing the
   controller decorator), so no test depended on the `driver` realm being
   present. Fixed in `billing-settlement.controller.ts` by changing
   `@RequireRealms("system", "platform", "ops", "driver")` to
   `@RequireRealms("system", "platform", "ops")`.
2. **`tests/security/idempotency-regression-guard.test.ts` —
   `unexpectedUnprotected` non-empty.** Two new `POST` create-type routes
   lacked idempotency protection: `stageRemittanceProofContent`
   (`POST reimbursements/proofs/staged-content`) and
   `uploadRemittanceProof` (`POST reimbursements/proofs`) — both had
   `hasIdempotencyHeader=false` and `hasIdempotencyServiceUsage=false`.
   Fixed by wrapping both handler bodies in `this.idempotencyService.execute(...)`
   (the same `IdempotencyService`/`IdempotencyRepository` already
   constructed in this controller for `approveReimbursementBatch` /
   `markReimbursementPaid`), with an added `@Headers("idempotency-key")
   idempotencyKey?: string` parameter on each, `required: true`, and a
   scope key (`billing:remittance_proof:staged_content:create` /
   `` `billing:remittance_proof:${command.batchId}:upload` ``) plus a
   request-shaped `payload` for replay-hash matching — matching the
   existing pattern exactly.

**Verification run in this worktree** (base `origin/dev` at
`f31c2489fc9f9406e3313d984e729287d2f602cb`, prior failing candidate
`b630fff4834463ad8d017a997a174e772d41499a`):

- `pnpm --filter @drts/contracts build` — required first; `apps/api`'s
  `tsconfig.json` resolves `@drts/contracts` to a generated `index.d.ts`
  under `packages/contracts/dist` (a gitignored build output directory),
  which did not exist in this worktree until built (a stale/missing build
  artifact, not a source problem — confirmed `git status` shows no
  `packages/contracts` source changes).
- `pnpm --filter @drts/api typecheck` — 0 errors (previously failed with
  `@drts/contracts` "has no exported member" errors purely from the missing
  `dist/`; unrelated to this fix).
- `pnpm --filter @drts/platform-admin-web typecheck` — exit 0.
- `pnpm exec vitest run tests/security/iam-route-inventory.test.ts tests/security/idempotency-regression-guard.test.ts` —
  2 files passed, 15 tests passed (both previously-failing suites now green).
- `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/` — 1
  file passed, 19 tests passed (no regression from the fix).
- `git diff --check` — exit 0 (no whitespace errors).

**Not reproduced/root-caused in this session**: CI also reported failures
on `Product smoke acceptance`, `Smoke acceptance`, and `ci-integ` on the
same locked SHA. Those jobs require a running product/browser/DB
environment this VM does not permit (VM restriction: no dev servers,
Playwright, or Docker Compose here) and were not investigated or fixed in
this pass — flagged here as unresolved, not claimed fixed.

---

## 5.6 CI 修復記錄二 (Canonical consistency fix, post-review)

Candidate `f8a1d069a9b79179070159a553b4cd3c1a9c593a` (PR #1988, run
`34587199282`) failed the `Canonical consistency` check with a real
finding (not flaky infra):

- `[consistency] cited-paths: 1 finding(s)` — `docs/04-uat/system-remediation-20260906/SR-PROOF-001.md`
  cited a path combining `packages/contracts/dist` with a trailing
  generated filename in a single code span, and that combined form does
  not exist in the repo tree (`packages/contracts/dist/` is a gitignored
  build output directory, only materialized by running
  `pnpm --filter @drts/contracts build`). `tools/ci/git/check_canonical_consistency.py`'s
  `check_cited_paths` rejects any doc-cited path matching its
  `docs|apps|packages|tools|infra|tests|operations|support|.github` +
  known-extension pattern that is not present on disk at checkout time.
  Fixed by rewording §5's evidence note to describe the generated
  filename in prose (not code-span-adjacent to the directory path) and
  cite only the real, tracked directory `packages/contracts/dist` (no
  extension, so the regex does not match it as a file citation) — no
  change in the underlying evidence claim, only in how the (correctly)
  non-existent generated file is referenced.

**Re-verification in this worktree** (base `origin/dev` after fetch,
prior candidate `f8a1d069a9b79179070159a553b4cd3c1a9c593a`):

- `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD` —
  `cited-paths: 0 finding(s)`, overall `OK` (previously 1 finding).
- `pnpm --filter @drts/contracts build` — exit 0.
- `pnpm --filter @drts/api typecheck` — exit 0.
- `pnpm --filter @drts/platform-admin-web typecheck` — exit 0.
- `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/` — 1
  file passed, 19 tests passed (no regression; docs-only change).
- `git diff --check` — exit 0.

No source (`.ts`/`.tsx`) files changed in this pass — the fix is
confined to this evidence document, which is inside this task's
`write_scopes`.

## 5.7 CI 修復記錄三 (Canonical consistency fix, self-referential citation)

Candidate `c34e2d90cb62369eb6e5bd22197ff06b37345daa` (which added §5.6
above) failed the `Canonical consistency` check again (GitHub run
`34587898500`, job `103226316828`, completed `2026-09-11T10:11:03Z`)
with the same `cited-paths` check: §5.6's own description of the prior
fix re-quoted the offending path (line 383 at the time) as a single
code span joining the `packages/contracts/dist` directory directly to
the generated filename with the `.d.ts` extension, while narrating what
the previous finding had cited. `check_cited_paths` does not
distinguish descriptive/quoted citations from load-bearing ones — it
flags every backtick span matching the path-with-known-extension
pattern that is absent on disk, so quoting the bad example reproduced
the same finding one level up.

Fixed by rewording §5.6 to describe the offending combination in prose
without ever placing the full `packages/contracts/dist` + generated
filename inside one code span (the pattern used throughout this
document to safely reference the gitignored build directory).

**Re-verification in this worktree** (base `origin/dev` at
`5aaf95218d5272d6e19555d67e03e0f7a4e36e4e` after fetch, prior candidate
`c34e2d90cb62369eb6e5bd22197ff06b37345daa`):

- `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD` —
  `cited-paths: 0 finding(s)`, overall `OK` (previously 1 finding on the
  same check).
- `pnpm --filter @drts/contracts build` — exit 0 (regenerates the
  gitignored `packages/contracts/dist`, required before `apps/api`
  typechecks in this worktree).
- `pnpm --filter @drts/api typecheck` — exit 0, 0 errors.
- `pnpm --filter @drts/platform-admin-web typecheck` — exit 0 (route
  types generated successfully).
- `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/` —
  1 file passed, 19 tests passed (no regression).
- `git diff --check` — exit 0.

No source (`.ts`/`.tsx`) files changed in this pass — the fix is again
confined to this evidence document, which is inside this task's
`write_scopes`. All four `test_commands` recorded in task machine truth
were re-run above and pass; lint and i18n-guard were already green on
the parent candidate per the earlier fix records and are unaffected by
a docs-only change, so were not re-run.

---

## 6. 交接資訊 (Handoff)

- **狀態 (Status)**：candidate ready, awaiting independent review (`Claude2`) and CI.
- **CANDIDATE_SHA**：set via `git rev-parse HEAD` at commit time (see machine-truth `handoff` call).
- **CANDIDATE_BRANCH**：`claude/sr-proof-001-recovery-20260911`.
- **INTEGRATION_STATUS**：`branch_pushed` until merged to `origin/dev` and a `Deploy - Dev` run confirms it.
