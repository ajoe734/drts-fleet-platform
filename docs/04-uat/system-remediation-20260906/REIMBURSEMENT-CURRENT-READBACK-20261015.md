# UAT & Verification Report: REIMBURSEMENT-CURRENT-READBACK-20261015

- **Task ID**: `REIMBURSEMENT-CURRENT-READBACK-20261015`
- **Title**: 修正補助款原幣值顯示與真實對帳狀態讀回
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Task Spec Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/remaining-original-functional-fixes-20261015/REIMBURSEMENT-CURRENT-READBACK-20261015.json` (`sha256: 0131e6e8f27ce3089a38b7f5a38d580d5f6eb48cb3c01e4a672fb831929c5767`)
- **Audit Inputs**:
  - `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T0940-internal-frontier-root/C080-C081-current-accepted-reimbursement-dataflow-readonly-audit.json` (`sha256: 77aa9124ab47da8966286d0ca6c61782c578fa1dd80c09ca003ea9ee1c37e7ef`)
  - `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T0940-internal-frontier-root/C080-C081-existing-full-workflow-authority-readonly-locator.json` (`sha256: 247cdcc71c4f72af7b7048810cc166f29668216b987f9649e8a370c68a527355`)
- **Unchanged Base SHA (`origin/dev`)**: `ed70d73a03dd224e109867c99b7d04128484a3fe`
- **Dependencies Adopted**: `SR-QA-FINANCE-001` (`done`), `SR-PROOF-001` (`done`)

---

## 1. Per-Finding & Required Acceptance Verification Table (`AI_COLLABORATION_GUIDE.md` §0.7)

| Finding ID / Acceptance Key                                                                                                 | Affected Location                                                                                                                                                                                                             | Root Cause                                                                                                                                                                                                                                                                                                                                                                   | Concrete Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Verification Command & Evidence                                                                                                                                                                                                                                                                                                                                                | Status            |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `C080-REIMBURSEMENT-UI-MINOR-UNIT-AS-CURRENCY`<br>`reimbursement_actual-minor-unit-list-detail-item-display`                | `apps/platform-admin-web/app/payments/reimbursements/page.tsx`<br>`apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`<br>`apps/platform-admin-web/app/payments/reimbursements/reimbursement-readback.ts` | Both reimbursement queue (`page.tsx:58-62`) and detail (`[batchId]/page.tsx:263-268`) formatted `MoneyAmount.amountMinor` directly via `amount.amountMinor.toLocaleString()`, rendering canonical minor units (`12345`, `1`, `0`) as whole major-unit currency (`12,345 TWD`, `1 TWD`, `0 TWD`) across queue totals, detail header/summary totals, and recipient line items. | Extracted shared `formatReimbursementMoney` in `reimbursement-readback.ts` using the established canonical minor-unit convention (`Math.floor(absMinor / 100)` + `.padStart(2, "0")` cents, preserving sign and currency code) and wired both `page.tsx` and `[batchId]/page.tsx` to it without altering `BillingSettlementService` integer amounts, sums, or rounding policy.                                                                                                                                                                                     | Unchanged base reproduction (`before.log`, exit `1`) -> Fixed candidate (`after.log`, exit `0`):<br>`pnpm exec vitest run tests/unit/reimbursement-current-readback-20261015/ --maxWorkers=1 --testTimeout=30000`                                                                                                                                                              | Verified (`PASS`) |
| `C080-REIMBURSEMENT-QUEUE-TIMER-FABRICATES-RECONCILIATION`<br>`reimbursement_canonical-status-without-timer-reconciliation` | `apps/platform-admin-web/app/payments/reimbursements/page.tsx`<br>`apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`<br>`apps/platform-admin-web/app/payments/reimbursements/reimbursement-readback.ts` | `deriveQueueStatus` in `page.tsx:64-93` fabricated `"reconciled"` (`已對帳`) whenever `batch.status === "paid"` and `Date.now() - Date.parse(batch.paidAt) >= 72h`, even though the canonical API record only stored `status: "paid"` with no reconciliation record, causing queue/detail readback divergence after 72h.                                                     | Extracted shared `deriveReimbursementWorkflowState` in `reimbursement-readback.ts` and wired both `page.tsx` (`deriveQueueStatus`) and `[batchId]/page.tsx` (`getWorkflowState`) to it. A canonical `paid` batch remains `"paid"` (`已付款`) before and after 72h (`+1h`, `+72h`, `+168h`) unless an explicit authoritative reconciliation field (`workflowState === "reconciled"`, `reconciledAt`, or `reconciliationReceiptId`) is present on the record. Existing `draft`, `pending_approval`, `approved`, `exported`, empty, and error branches are preserved. | Unchanged base reproduction (`before.log`, exit `1`) -> Fixed candidate (`after.log`, exit `0`):<br>`pnpm exec vitest run tests/unit/reimbursement-current-readback-20261015/ --maxWorkers=1 --testTimeout=30000`                                                                                                                                                              | Verified (`PASS`) |
| `reimbursement_original-proof-role-and-error-regressions`                                                                   | `tests/unit/reimbursement-current-readback-20261015/reimbursement-current-readback.test.ts`                                                                                                                                   | Regression guard required to ensure readback fixes do not weaken proof-gated payment (`REMITTANCE_PROOF_REQUIRED`, `REMITTANCE_PROOF_BATCH_MISMATCH`), scan fail-closed (`pending_scan` / `infected` / `scan_failed`), driver ownership check (`REMITTANCE_PROOF_FORBIDDEN`), UI mark-paid gating, or route RBAC denials (`403` for `driver` / `operator` / `auditor`).      | Added full service + route RBAC + UI detail mark-paid gating regression tests and ran existing `SR-PROOF-001` & `SR-QA-FINANCE-001` suites without modifying shared SDK, Billing schema/service, or proof guards.                                                                                                                                                                                                                                                                                                                                                  | `pnpm exec vitest run tests/unit/reimbursement-current-readback-20261015/ tests/unit/system-remediation/sr-qa-finance-001/c080-c081-reimbursement-remittance-proof.test.ts tests/unit/audit-proof-client.test.ts tests/unit/audit-proof-closure.test.ts tests/unit/system-remediation/sr-proof-001/ --maxWorkers=1 --testTimeout=30000` (exit `0`, 8 files / 102 tests passed) | Verified (`PASS`) |
| `reimbursement-readback_exact-candidate-validation`                                                                         | Authorized `write_scopes` only                                                                                                                                                                                                | Candidate must pass socket-free repository tests, root & app typecheck, lint, formatting, and honest UAT documentation on the exact candidate commit.                                                                                                                                                                                                                        | Verified all checks in isolated worktree without starting any VM runtime/server; recorded unchanged-base failure vs fixed-candidate pass logs under `.local/reimbursement-current-readback-20261015/`.                                                                                                                                                                                                                                                                                                                                                             | `pnpm typecheck:root` (exit `0`), `pnpm --filter @drts/platform-admin-web typecheck` (exit `0`), `pnpm --filter @drts/platform-admin-web lint` (exit `0`), `eslint --max-warnings=0` (exit `0`), `prettier --check` (exit `0`)                                                                                                                                                 | Verified (`PASS`) |

---

## 2. Unchanged-Base Reproduction vs Fixed-Candidate Evidence

### 2.1 Unchanged Base (`ed70d73a03dd224e109867c99b7d04128484a3fe`) Before Production Fix

Command:

```bash
pnpm exec vitest run tests/unit/reimbursement-current-readback-20261015/ --maxWorkers=1 --testTimeout=30000
```

Result (`Exit Code: 1`, log saved to `.local/reimbursement-current-readback-20261015/before.log`):

- `FAIL` `renders TWD amountMinor 12345 as 123.45, 1 as 0.01, and 0 as 0.00 across queue totals, detail totals, and recipient line items`: `expected '12,345 TWD' to be '123.45 TWD'`
- `FAIL` `preserves canonical BillingSettlementService integer minor amounts, multi-item sums, negative signs, and currency codes`: unable to find `'123.46 TWD'` because UI rendered `'12,346 TWD'` and `'-12,345 USD'`
- `FAIL` `keeps a canonical paid batch in paid state before and after 72 hours across queue and detail without timer-fabricated reconciliation`: at `paidAt + 72h`, queue rendered `'已對帳'` instead of `'已付款'` (`expected '已對帳' to be '已付款'`)
- `FAIL` `preserves draft, pending_approval, approved, exported, explicit authoritative reconciled, empty, and error branches across queue and detail`: detail view ignored explicit `reconciledAt` and rendered `'已付款'` instead of `'已對帳'`
- `PASS` `preserves proof-gated payment, scan fail-closed, driver ownership boundary, UI mark-paid gate, and route RBAC denials`

### 2.2 Fixed Candidate After Production Fix

Command:

```bash
pnpm exec vitest run tests/unit/reimbursement-current-readback-20261015/ --maxWorkers=1 --testTimeout=30000
```

Result (`Exit Code: 0`, log saved to `.local/reimbursement-current-readback-20261015/after.log`):

- `PASS` `tests/unit/reimbursement-current-readback-20261015/reimbursement-current-readback.test.ts` (5 tests passed)

### 2.3 Impacted Reimbursement / Proof / Finance Regression Suite

Command:

```bash
pnpm exec vitest run tests/unit/reimbursement-current-readback-20261015/ tests/unit/system-remediation/sr-qa-finance-001/c080-c081-reimbursement-remittance-proof.test.ts tests/unit/audit-proof-client.test.ts tests/unit/audit-proof-closure.test.ts tests/unit/system-remediation/sr-proof-001/ --maxWorkers=1 --testTimeout=30000
```

Result (`Exit Code: 0`, log saved to `.local/reimbursement-current-readback-20261015/impacted-vitest.log`):

- `Test Files: 8 passed (8)`
- `Tests: 102 passed (102)`

---

## 3. Scope Discipline & Explicit Residual Boundaries

- **Write Scope Compliance**: Only the 5 authorized `write_scopes` paths were created or modified. No shared SDKs (`packages/contracts`, `packages/api-client`), `BillingSettlementService`, proof upload/readback actors or guards, or active Demo/Report/Training files were modified.
- **Adopted Narrow Credit**: Adopts existing `DONE` credit from `SR-PROOF-001` (signed remittance proof readback & scan fail-closed gate) and `SR-QA-FINANCE-001` (`C080/C081` unit/contract proof-gate closure).
- **Honest Open Boundaries (Not Whole C080/C081 Completion)**:
  - This task claims only its 4 assigned Source acceptance keys (`reimbursement_actual-minor-unit-list-detail-item-display`, `reimbursement_canonical-status-without-timer-reconciliation`, `reimbursement_original-proof-role-and-error-regressions`, `reimbursement-readback_exact-candidate-validation`).
  - Original full C080/C081 workflow gaps remain honestly open outside this readback task:
    1. Real batch export file generation (CSV/XML/bank remittance export action & backend endpoint/record).
    2. Explicit manual/automated mark-reconciled backend state transition and operator action (`reconciled` is only displayed when an authoritative reconciliation field is present on the record, never fabricated by a 72h timer).
    3. Cashier vs reviewer proof upload actor arbitration (`C081-PROOF-UPLOAD-ACTOR-CASHIER-OR-REVIEWER`).
    4. Hosted multi-role (`finance_reviewer`, `finance_cashier`, `driver`) live environment, external storage/malware-scanner provider, and same-release browser/runtime evidence.
