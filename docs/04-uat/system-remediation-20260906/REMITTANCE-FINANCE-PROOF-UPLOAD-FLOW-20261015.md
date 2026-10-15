# UAT & Verification Report: REMITTANCE-FINANCE-PROOF-UPLOAD-FLOW-20261015

- **Task ID**: `REMITTANCE-FINANCE-PROOF-UPLOAD-FLOW-20261015`
- **Title**: 原C081合法財務角色上傳匯款原檔並接通原批次proof閉環
- **Owner**: `Claude`
- **Reviewer**: `Claude2`
- **Task Spec Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1114-internal-functional-root/REMITTANCE-FINANCE-PROOF-UPLOAD-FLOW-20261015-R1-actual-original-machine-binding.task-spec.json` (`sha256: 0426d1fcf0762b6e60863e611395e40292a8d7d642fda3407415bec1e65edf2c`)
- **Actual Fresh Accepted `dev` Base Built From** (after both required dependencies `done`): `127925f37dd89da695b37f3324b31da38f47a58c`
- **Dependencies Adopted (both `done` before this candidate started)**:
  - `REMITTANCE-PROOF-ACTOR-AUTHORITY-20261015` -- disposition report (`mutates_canonical: false`), adopted as-is:
    `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T0940-internal-frontier-root/REMITTANCE-PROOF-ACTOR-AUTHORITY-20261015.md`
    (Revision 3). §3 decides: the existing driver-submit + finance-review split does not satisfy C081's literal
    "出納...上傳" half; §4 decides a new parallel route (not widening the driver-only route) because
    `BootstrapAuthGuard.assertScopesAllowed` requires ALL of a route's declared scopes regardless of caller
    realm, so one route cannot demand `driver:write` for drivers and `billing:write` for finance. §5 gives the
    exact scope/path/symbol mapping this task implements unchanged.
  - `REIMBURSEMENT-BATCH-EXPORT-RECONCILIATION-20261015` (merge `b1d75b4900a63cd2aa6c6dd0ccb48874472a21b2`, PR
    #2681, already present on the build base above).

---

## 1. Per-Finding & Required Acceptance Verification Table (`AI_COLLABORATION_GUIDE.md` §0.7)

| Finding / Acceptance Key                                            | Affected Location                                                                                                                                                                                                                | Root Cause / Flow Absence                                                                                                                                                                                                                                                                                                                                                                                     | Concrete Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Verification Command & Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Status            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `remittance-finance_actual-authorized-content-upload`               | `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` (new `financeStageRemittanceProofContent`, `financeUploadRemittanceProof`), `docs/04-api/openapi-spec.yaml`                                           | No route of any kind let a `system`/`platform`/`ops` caller with `billing:write` stage or upload a remittance proof. `POST reimbursements/proofs/staged-content` and `POST reimbursements/proofs` were (and remain) locked to `@RequireRealms("driver")` + `@RequireScopes("driver:write")` (confirmed on the build base: both decorators unchanged, same lines).                                             | Added two new routes, `POST reimbursements/proofs/finance-staged-content` and `POST reimbursements/proofs/finance-upload`, each `@RequireRealms("system","platform","ops")` + `@RequireScopes("billing:write")`, mirroring the driver pair's body/size/MIME validation and idempotency discipline exactly (same validation branches, same `idempotencyService.execute` wrapper). `financeUploadRemittanceProof` calls the existing `billingSettlementService.uploadRemittanceProof` then `scanRemittanceProof(..., bestEffort=true)`, byte-for-byte the same two-call sequence the driver route already uses. No service/contracts/IAM-catalog change: `billing:write`'s `allowedRealms` already includes `system`/`platform`/`ops` (`packages/contracts/src/iam-policy-catalog.ts`), so the new routes pass `tests/security/iam-route-inventory.test.ts` with zero catalog edits. Documented both new `operationId`s/paths/RBAC in `docs/04-api/openapi-spec.yaml`, without touching the existing driver-route text.                                                                | `npx vitest run tests/unit/system-remediation/sr-proof-001/sr-proof-001-finance-upload-remittance-proof.test.ts` (exit `0`, 18/18) -- covers real-guard RBAC admission for `system`/`platform`/`ops` + `billing:write` at both new routes, and a full stage→upload→(synchronous best-effort scan) flow producing a real `RemittanceProofRecord` with server-computed `content.contentHash`/`sizeBytes` (client-sent `sizeBytes: 999999` ignored, byte-count asserted from the actual staged bytes). | Verified (`PASS`) |
| `remittance-finance_canonical-batch-and-uploader-attribution`       | `billing-settlement.controller.ts` (new routes call existing `billingSettlementService.uploadRemittanceProof` unchanged)                                                                                                         | Acceptance required `proof.driverId` to come from the batch and `uploadedByActorId` from the actual finance caller, never a client-supplied value. The existing service method already does this independent of realm (`driverId: batch.driverId`, `uploadedByActorId: identity?.actorId ?? null`, `billing-settlement.service.ts`), but no caller path reached it as a non-driver identity before this task. | No service-layer change: the new controller methods pass the real `identity` (resolved by `@CurrentIdentity()` from the actual verified bearer token) through unchanged. The driver-ownership check (`identity?.realm === "driver" && callerDriverId !== batch.driverId`) is realm-gated and does not fire for `system`/`platform`/`ops` callers, so a finance caller may upload against any existing approved batch, not only a batch it "owns" (finance is not a batch owner).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Same test file -- `canonical batch and uploader attribution` + `allows a finance caller to upload against any existing batch` tests assert `uploaded.data.driverId === batch.driverId` and `uploaded.data.uploadedByActorId === <finance actorId>` (never equal to `batch.driverId`), across two different batches/callers. A third test confirms the unknown-`batchId` case still 404s with the existing `NOT_FOUND` code, unchanged.                                                              | Verified (`PASS`) |
| `remittance-finance_original-proof-scan-download-gates-and-denials` | No change to `remittance-proof.service.ts`, `billing-settlement.service.ts`'s `scanRemittanceProof`/`markReimbursementPaidWithProof`/`requestRemittanceProofReadback`, or any existing driver/readback/scan/pay-with-proof route | Acceptance required the full existing `pending_scan → clean/rejected` lifecycle, the `markReimbursementPaidWithProof` gate, and all existing denials to apply identically regardless of uploader realm, with zero widening.                                                                                                                                                                                   | Zero lines changed in any gate-owning file. Verified by exercising the _existing_ gate against a _finance-uploaded_ proof: a finance-uploaded, scanner-confirmed-clean proof pays the batch through the unchanged `markReimbursementPaidWithProof`; the same finance-uploaded proof is rejected with the unchanged `REMITTANCE_PROOF_BATCH_MISMATCH` when presented against a different batch; a finance upload against an unprovisioned/unavailable scanner stays honestly `pending_scan` (not fabricated clean), and an authorized retry (`scanRemittanceProof`, same route finance already holds `billing:write` for) surfaces `REMITTANCE_PROOF_SCANNER_UNAVAILABLE` rather than inventing a verdict. The driver-only route, its RBAC, and its own 19 pre-existing regressions (`sr-proof-001-remittance-proof.test.ts`) and RBAC tests (`proof-route-auth.test.ts`) were re-run unmodified and still pass, plus `audit-proof-closure.test.ts` (controller-level driver upload/scan-retry flow) and `billing-settlement.test.ts` (8 pre-existing `markReimbursementPaid` tests). | Same test file -- 3 tests under "unchanged scan lifecycle and pay-with-proof gate". Plus: `npx vitest run tests/unit/system-remediation/sr-proof-001/ tests/unit/audit-proof-closure.test.ts tests/unit/billing-settlement.test.ts tests/security/iam-route-inventory.test.ts` (exit `0`, 6 files / 100 tests, see §2.2).                                                                                                                                                                           | Verified (`PASS`) |
| `remittance-finance_exact-candidate-validation`                     | Authorized `write_scopes` only                                                                                                                                                                                                   | Candidate must pass socket-free unit tests, root & per-package typecheck, lint, formatting, and honest UAT documentation on the exact candidate commit, after genuinely serializing behind both dependent tasks' real `done` state.                                                                                                                                                                           | Confirmed both dependencies `done` via `ai-status.sh show` before any write (REMITTANCE-PROOF-ACTOR-AUTHORITY-20261015 disposition report adopted as-is; REIMBURSEMENT-BATCH-EXPORT-RECONCILIATION-20261015 merge already present on this worktree's `origin/dev`-tracking HEAD -- no rebase needed). Ran `@drts/contracts`/`@drts/control-plane-auth` rebuild (clears stale-dist typecheck noise per prior-task precedent), then `@drts/api` and `platform-admin-web` typecheck, ESLint, Prettier, and the full impacted unit-test set, all socket-free (no VM dev/preview/DB/browser server started). No shared SDK (`packages/api-client`), IAM catalog, `remittance-proof.ts` contract, `billing-settlement.service.ts`/`.repository.ts`, or migration file was touched, matching the actor-authority report's §5 "no change needed" list exactly.                                                                                                                                                                                                                               | See §2 below for exact commands/exits.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Verified (`PASS`) |

---

## 2. Verification Commands & Exit Codes

### 2.1 Candidate-only test file

```bash
npx vitest run tests/unit/system-remediation/sr-proof-001/sr-proof-001-finance-upload-remittance-proof.test.ts
```

Result: `Exit Code: 0`, `Test Files: 1 passed (1)`, `Tests: 18 passed (18)`.

### 2.2 Flow-absence confirmation on the actual build base

```bash
grep -n "financeStageRemittanceProofContent\|financeUploadRemittanceProof" <(git show 127925f37dd89da695b37f3324b31da38f47a58c:apps/api/src/modules/billing-settlement/billing-settlement.controller.ts)
```

No match on the base commit -- this is new caller capability, not a bug fix of an existing broken implementation. The driver-only routes' `@RequireRealms("driver")` + `@RequireScopes("driver:write")` decorators are confirmed unchanged (same source lines on base and candidate).

### 2.3 Impacted reimbursement / proof / finance / IAM regression suite

```bash
npx vitest run \
  tests/unit/system-remediation/sr-proof-001/ \
  tests/unit/audit-proof-closure.test.ts \
  tests/unit/billing-settlement.test.ts \
  tests/security/iam-route-inventory.test.ts \
  tests/unit/reimbursement-current-readback-20261015/ \
  tests/unit/payment-detail-minor-precision-20261015/ \
  tests/unit/reimbursement-batch-export-reconciliation-20261015/ \
  tests/unit/multi-tenant-header-routing.test.ts \
  tests/unit/invoice-mail-20261004/ \
  tests/unit/tenant-invoice-authoritative-read-20261015/ \
  tests/contract/iam-contracts.test.ts \
  tests/unit/system-remediation/sr-recovery-contracts-20260911/ \
  tests/unit/system-remediation/sr-contract-001/ \
  tests/unit/system-remediation/sr-contract-read-001/ \
  tests/contract/uv-exec-001.test.ts \
  --maxWorkers=1
```

Result: `Exit Code: 0`, `Test Files: 23 passed (23)`, `Tests: 375 passed (375)`.

**Note on `--maxWorkers=1`**: the same 23 files pass individually and in smaller combinations at default
concurrency; only this exact 23-file set at default worker concurrency intermittently fails one unrelated
jsdom/React suite (`payment-detail-minor-precision-20261015`, a suite this task does not touch) due to
cross-file worker-thread pollution in this test runner, not a regression this candidate introduces (confirmed:
removing this task's new test file from the same 23-file set still reproduces 18 unrelated failures at default
concurrency, and the full 23-file set is fully green at `--maxWorkers=1`). This matches the already-established
precedent in this codebase (`REIMBURSEMENT-BATCH-EXPORT-RECONCILIATION-20261015`'s own UAT §2.1 also pins
`--maxWorkers=1`).

### 2.4 Typecheck

```bash
pnpm --filter @drts/contracts run build          # exit 0 (rebuild to clear stale-dist noise)
pnpm --filter @drts/control-plane-auth run build # exit 0 (ditto)
pnpm --filter @drts/api run typecheck            # exit 0
pnpm --filter platform-admin-web run typecheck   # exit 0
```

(Root `pnpm typecheck:root` surfaces pre-existing, unrelated errors across other modules --
`passenger-app/review-demo`, `platform-admin.service.ts` pricing-reason fields, `regulatory-registry.service.ts`,
`regulatory-reporting`/`reporting-filing` controllers, `tenant-partner.service.ts`, `voice-booking` -- none of
which touch `billing-settlement`, `remittance-proof`, or any file in this task's `write_scopes`; confirmed none
of this task's own files appear in that output.)

### 2.5 Lint

```bash
pnpm --filter @drts/api exec eslint src/modules/billing-settlement/billing-settlement.controller.ts
pnpm --filter platform-admin-web exec eslint app/payments/reimbursements/
npx eslint tests/unit/system-remediation/sr-proof-001/sr-proof-001-finance-upload-remittance-proof.test.ts
```

Result: `Exit Code: 0` for all three, no errors or warnings.

### 2.6 Formatting

```bash
pnpm exec prettier --check \
  apps/api/src/modules/billing-settlement/billing-settlement.controller.ts \
  "apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx" \
  apps/platform-admin-web/app/payments/reimbursements/remittance-finance-proof-client.ts \
  apps/platform-admin-web/app/payments/reimbursements/translations.ts \
  tests/unit/system-remediation/sr-proof-001/sr-proof-001-finance-upload-remittance-proof.test.ts \
  docs/04-api/openapi-spec.yaml
```

Result: `Exit Code: 0`, "All matched files use Prettier code style!".

### 2.7 Test-coverage registration

```bash
python3 tools/ci/check_test_coverage.py
```

Result: `check_test_coverage: all 99 test files yield tests CI runs.` (this checker scopes to Python
`test_*.py`/unittest discovery; it does not enumerate the new TypeScript/vitest file, which is instead proven
collected and run by §2.1/§2.3 above.)

---

## 3. Scope Discipline & Explicit Residual Boundaries

- **Write Scope Compliance**: Only files inside this task's authorized `write_scopes` were created or modified:
  `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`, `docs/04-api/openapi-spec.yaml`,
  `apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`,
  `apps/platform-admin-web/app/payments/reimbursements/translations.ts`,
  `apps/platform-admin-web/app/payments/reimbursements/remittance-finance-proof-client.ts` (new),
  `tests/unit/system-remediation/sr-proof-001/sr-proof-001-finance-upload-remittance-proof.test.ts` (new), and
  this report. `billing-settlement.service.ts`, `.repository.ts`, `remittance-proof.service.ts`,
  `packages/contracts/src/remittance-proof.ts`, `packages/contracts/src/index.ts`,
  `packages/contracts/src/iam-policy-catalog.ts`, and all `infra/migrations/*.sql` needed no change, exactly as
  the actor-authority report's §5 predicted.
- **No shared/active-producer edits**: `packages/api-client`, `apps/api/src/common/auth/`,
  `apps/platform-admin-web/lib/translations.ts`, and `apps/platform-admin-web/app/payments/reimbursements/
reimbursement-readback.ts` / `reimbursement-workflow-client.ts` / `page.tsx` (the C080 list page) were left
  untouched. `apps/platform-admin-web/app/payments/reimbursements/remittance-finance-proof-client.ts` follows
  the same task-local-adapter-over-`ApiClient.post()` pattern `reimbursement-workflow-client.ts` already
  established, rather than widening the shared `@drts/api-client` SDK.
- **Driver-only route boundary preserved**: `POST reimbursements/proofs/staged-content` and
  `POST reimbursements/proofs` keep `@RequireRealms("driver")` + `@RequireScopes("driver:write")` verbatim; no
  decorator, body validation, or OpenAPI text for either route was touched. The new finance routes are fully
  parallel, with their own idempotency scopes (`...:staged_content:finance_create`,
  `...:${batchId}:finance_upload`) distinct from the driver routes' (`...:staged_content:create`,
  `...:${batchId}:upload`), verified not to collide even when both callers reuse the identical raw
  `Idempotency-Key` header value for the same batch.
- **Honest open boundaries (not whole C081 completion)**:
  1. This task closes exactly the Source implementation scope the actor-authority report (§5-7) handed off --
     the two new routes, their RBAC/OpenAPI documentation, and the finance-side UI/local client. It does not
     reopen or re-litigate that report's disposition decision, and it does not touch the still-separate C080
     batch-export/mark-reconciled gap boundary (already closed by `REIMBURSEMENT-BATCH-EXPORT-RECONCILIATION-20261015`).
  2. No real signing-key/HSM mount, hosted multi-role (platform finance/cashier) acceptance, or live
     same-release browser/E2E run was performed; the finance upload/scan/pay-with-proof flow is proven at the
     socket-free controller/service unit boundary only (real content hash/size from actual bytes, real
     `pending_scan`/`clean`/`rejected` scan-adapter behavior, real idempotency-store replay), per this VM's
     runtime restriction (no `pnpm exec playwright`, `pnpm dev`, or Docker Compose was started).
  3. No new financial approval policy, maker-checker entitlement, tenant mapping, or batch schema was
     introduced -- a finance upload is exactly the existing `uploadRemittanceProof` command reached from a new
     authorized caller identity, nothing else.
  4. The UI upload control in `[batchId]/page.tsx` is shown only in the existing "no proof uploaded yet" empty
     state (mirroring the existing card's own state machine); it does not add a re-upload path for an
     already-`clean`/`rejected` proof, which was out of this task's acceptance scope and is not implied by the
     actor-authority report's §5 UI guidance.
