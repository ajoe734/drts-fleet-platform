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

## 2026-10-19 original full-task R1 continuation (superseded by R2 below)

Root formally reopened the same original task after reviewing immutable `aa129c50623ccd377f212016c78d105f0bd373d5` (PR2709, generation `fd9a0cc2c790438795ec0724a9eb0396`). The original full four clauses, four keys, seven scopes and both genuine DONE dependencies remain; spec SHA256 is `0426d1fcf0762b6e60863e611395e40292a8d7d642fda3407415bec1e65edf2c`. Current sole author is Codex2 and independent reviewer is Codex. Original Claude-authored source/history, original Claude2 review lane/evidence, all previous CI and the full NEXT/HOLD context remain preserved; this continuation does not rewrite their credit.

The successor isolated branch starts from freshly verified accepted dev `729375e76b49827d5a752282b93371fe6aa3fd20` and normally merges the original aa129 history as `1e957e7c1` (two original parents; managed hooks/trailers succeeded). The old PR2709 remains untouched. The earlier readonly support packet and all20 evidence references remain frozen outside this new source evidence directory.

The actual original mounted defect was: staging fileA commits, upload transport fails, selecting fileB and retrying reuses fileA's staging key, so the real backend correctly rejects `409 IDEMPOTENCY_KEY_REUSED`. The caller now retains the current attempt's exact content/MIME and separate stage/upload identities. An unchanged command, including reselecting an equivalent new File object or retrying after an uncertain ACK, retains the original keys. Different file bytes or MIME change the staging and upload keys; changing only batch/filename retains the unchanged staging identity and changes the upload identity. Complete success clears the attempt. The backend's idempotency decisions, canonical batch/driver/finance actor binding, storage ACK, scan/readback/download/payment gates and all roles remain unchanged. No key is regenerated simply because a retry button was clicked.

### Full original keys and evidence

| Original key                                                      | Continued source and verification                                                                                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| remittance-finance_actual-authorized-content-upload               | Original finance routes/OpenAPI/local client and real mounted FileReader→client→guard→Controller→service upload; normal and changed-file recovery succeed.                          |
| remittance-finance_canonical-batch-and-uploader-attribution       | Original canonical driver/actual verified finance actor, content/hash/size/MIME and ACK assertions remain; actual mounted positive verifies them again.                             |
| remittance-finance_original-proof-scan-download-gates-and-denials | Complete original proof, route, download, legacy gate, billing, proof-client/closure and C080/C081 regressions pass; scanner unconfigured/pending and denied paths remain truthful. |
| remittance-finance_exact-candidate-validation                     | Ordinary preserved-history branch, original full task UAT and command/hash packet; new exact candidate CI, independent Root review/protected merge/four-key records remain pending. |

### Meaningful before and fixed after

The expanded original self-owned finance-upload file preserves every original statement/assertion in its18 original controller cases and adds seven actual mounted UI cases. Only those mounted cases install/clean up a JSDOM document inside the unit process; the original Node cases keep their environment. Existing `createUiModuleLoader` executes the actual page and local client. Presentation/Next/authenticated-client context are controlled boundaries; the actual file input, FileReader, page command decisions, ApiClient, route guard, Controller, service and idempotency code run. Only external credential verification, existing noDB/in-memory storage, scripted scanner and explicit HTTP faults are doubled. No product listener, browser/E2E server, PG or provider runs on the VM.

At the preserved merged original caller `1e957e7c1`, the identical final25-case test set produced **23 pass / 2 fail / 0 skip**, reproducing changed-content recovery failure and unchanged upload identity after a filename change. After the caller correction, all25 pass. The broader affected regressions pass **130 / 130 across9 files, zero skips**, default5000ms test timeout and `--no-file-parallelism`:

| Existing file                                |                                    Passed cases |
| -------------------------------------------- | ----------------------------------------------: |
| sr-proof-001-finance-upload-remittance-proof |                      25 (original18 + mounted7) |
| sr-proof-001-remittance-proof                | 21 (original19 plus accepted later regressions) |
| proof-route-auth                             |                                               8 |
| proof-download-auth                          |                                              22 |
| legacy-proof-gate                            |                                              13 |
| billing-settlement                           |                                               8 |
| audit-proof-closure                          |                                              18 |
| audit-proof-client                           |                                               9 |
| c080-c081-reimbursement-remittance-proof     |                                               6 |

The new mounted cases cover normal uploaded bytes/attribution; stage failure before the command; stage ACK with a lost response; unchanged new File-object retry after upload failure; changed bytes with identical name/MIME/size; unchanged stage content with a renamed upload; and upload committed before its HTTP response was lost. Wrapping spies still execute the real producers and verify that unchanged retries replay once without duplicate proof IDs/timestamps.

New evidence lives at `.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/remittance-original-source-evidence/`: `merged-original-caller-final-before.{json,log,command.json}` and `fixed-complete-proof-and-context-regressions.{json,log,command.json}` preserve exact commands/exits/times and per-case results. Earlier new-fixture diagnostics using an overly exact error-message query are retained separately and are not meaningful product-before credit: the shared generic post method includes the error JSON in its message, so the final query matches the same visible error substring. The initial empty-worktree setup anomaly and subsequent single locked reattachment/materialization are also retained; no old source, branch or evidence was deleted/reset.

Focused TypeScript checking of the actual page and self-owned tests passes (exit0), and focused ESLint passes with zero warnings. Exact command records are `focused-source-and-owned-tests-typecheck.command.json` and `focused-eslint.command.json`; the complete original controller-test statements/expectations are independently AST-equivalent to the preserved merge baseline. Normal managed hooks/full-range trailer results and final immutable candidate identity are recorded in the final delivery packet.

Existing local unit/controlled-storage evidence does not establish live credential/provider/scanner/PG durability, actual financial issuance/payment, hosted intended-role acceptance, whole C081 or whole goal. New same-candidate mandatory CI and independent Root review/protected merge remain required. The author does not approve, record acceptance keys/DONE or deploy.

## R2: fresh consumable stage for a changed upload attempt

Root's complete original four-clause R2 review (`3690607db4f4bdf8dc8499e6dd85a32139b2d34658a96bc125c05d19ca97c44a`) reopened immutable `3b466a0333491ef58b9e329cbd45a6ab7cf71ff9`, generation `bd4d320525e64ae1aaaaf5a1e7d9ae33`, under the same owner/reviewer, four keys, seven scopes, original spec and dependencies. Original aa129, R1 source/130-case evidence and independent support hashes remain frozen; R2 evidence uses the separate `remittance-original-source-evidence/R2/` directory.

The storage port and actual Memory/S3/GCS adapters consume each staged reference once. R1 incorrectly retained the stage key when only the filename changed. If the original upload had already committed before its HTTP ACK was lost, that stage key replayed a consumed reference while the changed filename produced a new upload key. The real backend correctly returned400. R1's separate rename-before-upload and unchanged-ACK-loss cases missed this combination; their130 passes do not establish the combined recovery.

The minimal caller correction creates a fresh stage/upload pair whenever any overall attempt payload changes (content, MIME, batch or filename). Exact unchanged-command retries retain the original pair, so both completed responses replay without another commit. No key changes solely because the user clicks retry. Backend one-use consumption, idempotency400/409, actual finance/driver attribution, scanner, download and payment contracts remain unchanged.

The R1-added rename case now asserts a fresh usable stage key/reference and successful upload, replacing only its faulty stage-reuse expectation. A new actual mounted case commits the first upload, loses its HTTP ACK, renames the same bytes/MIME, and successfully commits a second proof through a new stage/ref/pair. It verifies the new filename, proof ID, independent original-byte SHA/size/MIME, canonical driver/finance actor, clean scan, and exact immutability of the first proof. The unchanged-command ACK-loss case retains its original pair/ID/timestamp and single-producer assertions. Every original aa129 controller statement and all30 static expect calls remain.

Clean R2 before at literal3b466: **24 pass / 2 fail / 0 skip** from the final26-case file. The two failures are the fresh-stage rename expectation and actual renamed upload after committed ACK loss. The first run's ENOSPC occurred before collection (0 executed). Two later runs also exposed a transient mounted-fixture initial-proof loading state and are retained as preparation diagnostics, not clean product-before credit. The final fixture drains real initial batch/proof effects using standard async React act without sleep, timeout changes or decision mocks. Translation returns a stable t/locale as in the real provider; the earlier assumption that t caused loadBatch rerenders was disproved by the literal dependency list `[batchId, client]` and is not a product finding.

After the minimal fresh-pair correction, all26 owned cases and the complete original nine-file regression context pass **131 / 131, zero skips**. Focused actual page/test TypeScript and ESLint both pass (exit0).

Commands use the existing repository dependencies, default5000ms test timeout and no-file-parallelism. Only the per-command optional Node bytecode cache is disabled (`NODE_DISABLE_COMPILE_CACHE=1`) under Root's disk instruction; checks and assertions are unchanged. Final R2 command/results, full before/fixed mapping, original/R1 assertion preservation, ordinary hooks/trailers/push and new exact candidate CI snapshot are recorded in the R2 immutable packet. All four original keys continue to map to the full producer/caller, attribution, lifecycle/denials and exact-candidate review requirements above; Root independent full review, new own CI/protected merge and four key records remain required. No Source self-approval, provider/financial/whole-goal acceptance or deployment is claimed.

## R3: bind the owned test to the actual SDK Source

Root reopened immutable `7749edf385bccf2b573bc4cfc6607a077d659c34`, generation `cf481d8febf34f0aaf340f9a5dd87f45`, after its mandatory integration run `39222393809`, typecheck job `117963092633`, failed. The complete raw log (`d0b4cb3d1c5983bfddf551063ea39658c209540e1f9c01ec3a95bd6a6d8bb21c`) records actual PR checkout `8751062ca19273322cb07c7087ec9ced8dd95147` and exactly two diagnostics in the owned test: line30 TS2307 cannot resolve `@drts/api-client`, followed by line812 TS7006 for the untyped `path` callback. The full original four-clause review is `49675e7071515852955b6f711db223403e2a28129d4ad92acf50a7e6fc9fdec2`; normal reopen receipt is `69ad5ef6fa9320766f8893135012c84136a4a54a72794e28b12db8c9ffb2fe6e`.

The only test change replaces the package-name import with `../../../../packages/api-client/src`, the same actual SDK implementation already exercised by the mounted caller. The production Page, local client, Controller, translations and OpenAPI remain byte-exact to7749. Every non-import test statement, including the original18 controller cases and all R1/R2 strong assertions, is AST-equivalent to7749; all84 static `expect` calls remain. Root configuration, compiler type flags, ambient declarations, guards, single-use storage, idempotency400/409, finance/driver attribution, scan/download/payment decisions are unchanged.

Using a local evidence-only config that inherits the unmodified root TypeScript options and limits `include` to this actual owned test, literal7749 reproduces precisely those same two diagnostics (exit2). After the import correction, that same config passes (exit0). This is relevant scoped TypeScript evidence; the earlier R2 page/test config had an explicit SDK path mapping and did not establish the mandatory whole-root CI result. No local whole-root pass is claimed. The complete nine-file regression context again passes **131 / 131, zero skips**, with unchanged default5000ms test timeout and no-file-parallelism. Focused ESLint also passes with zero warnings.

All new evidence uses `remittance-original-source-evidence/R3/`. Original aa129/3b/7749 source, generations, functional before/fixed results, independent support and CI failure evidence remain frozen. The initial R3 owner-start invocation missing its required message and an auxiliary parity command invoked from the wrong working directory are retained as preparation diagnostics; the corrected commands succeed and neither is product/typecheck-before evidence. New exact candidate own CI, Root independent full four-clause review, protected merge and four acceptance keys remain required. This is the same original task with four keys, seven scopes and original dependencies; there is no provider, financial, deployment or whole-goal completion claim.
