# UAT Evidence: PRICING-DRAFT-AND-PUBLISH-REASON-20261015

## 1. Metadata & Scope

- **Task ID**: `PRICING-DRAFT-AND-PUBLISH-REASON-20261015` (`完成費率草稿建立與發布原因權威稽核`)
- **Owner / Reviewer**: `Gemini` / `Gemini2`
- **Branch**: `gemini/pricing-draft-and-publish-reason-20261015`
- **Immutable Base SHA (`origin/dev`)**: `ed70d73a03dd224e109867c99b7d04128484a3fe`
- **Pre-Fix Defect Reproduction Anchor SHA**: `a52a97bef`
- **Canonical Spec Reference**: `.local/remaining-original-functional-fixes-20261015/PRICING-DRAFT-AND-PUBLISH-REASON-20261015.json`
- **Source Audit Reference**: `.local/goal-continuation-20261015T0940-internal-frontier-root/C076-current-accepted-pricing-dataflow-readonly-audit.json`
- **Assigned Source Acceptance Keys (4 own keys only)**:
  1. `pricing_actual-create-draft-command-and-readback`
  2. `pricing_publish-reason-reaches-authoritative-audit`
  3. `pricing_original-version-scope-and-failure-regressions`
  4. `pricing_exact-candidate-validation`
- **Write Scopes Touched**:
  - `packages/contracts/src/index.ts`
  - `apps/api/src/modules/platform-admin/platform-admin.service.ts`
  - `apps/platform-admin-web/app/pricing/page.tsx`
  - `tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx`
  - `tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts`
  - `docs/04-uat/system-remediation-20260906/PRICING-DRAFT-AND-PUBLISH-REASON-20261015.md`
  - _(Note: `packages/api-client` and `apps/api/src/modules/platform-admin/platform-admin.controller.ts` were not modified because existing pass-through already forwards `CreatePlatformPricingRuleCommand` and `PublishPlatformPricingRuleCommand` unchanged.)_

---

## 2. §0.7 Finding & Acceptance Mapping Table

| Finding / Acceptance Key                                         | Original Defect / Root Cause                                                                                                                                                                                                                                                                                                                                                                | Code Hunk Fixed (`file:line`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Regression Test Case                                                                                                                                                                                                                                                                            | Verification Result                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `C076-F1` / `pricing_actual-create-draft-command-and-readback`   | Header button `pricing.action.createPassengerDraft` in `apps/platform-admin-web/app/pricing/page.tsx` only called `handleTabChange(...)` and had zero callers of `client.createPlatformPricingRule`. Since `PLATFORM_PRICING_RULES_SEED` only contains `"active"` rules, `draftRules` was empty and the Publish workflow was unreachable from the UI.                                       | `apps/platform-admin-web/app/pricing/page.tsx:507-718` (`CreateDraftModal`), `apps/platform-admin-web/app/pricing/page.tsx:1141-1200` (`handleCreateDraft` calling `client.createPlatformPricingRule(command)` + `Promise.all` canonical readback + `setSelectedDraftId(created.ruleId)`), `apps/platform-admin-web/app/pricing/page.tsx:1285-1305` (header button opens modal on `passenger` tab while preserving tab/query)                                                                                                                                                                                          | `tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx` (`C076-F1 + C076-F2: creates a canonical pricing draft from the page header action, reads it back into comparison, and publishes it with user-entered reason recorded in authoritative audit`) | **PASS** (Failed before fix in `.local/pricing-draft-and-publish-reason-20261015/before.log`; passed after fix in `.local/pricing-draft-and-publish-reason-20261015/after.log`) |
| `C076-F2` / `pricing_publish-reason-reaches-authoritative-audit` | `handlePublish` validated `publishReason.trim().length >= 12` in UI state but omitted `reason` from `PublishPlatformPricingRuleCommand` and hardcoded cosmetic `publishedBy: platform_admin:${locale}`. `PlatformAdminService.publishPlatformPricingRule` did not validate or record `reason` in `publish_platform_pricing_rule` audit (`newValuesSummary`) or `PlatformPricingRuleRecord`. | `packages/contracts/src/index.ts:7655,7673` (`publishReason?: string \| null` on `PlatformPricingRuleRecord`, `reason: string` on `PublishPlatformPricingRuleCommand`), `apps/api/src/modules/platform-admin/platform-admin.service.ts:2095-2177` (server-side non-blank `>= 12` trimmed char validation before archiving/mutating, cosmetic locale persona stripping, `rule.publishReason = reason`, `recordAudit` `actorId: publishedBy` and `newValuesSummary.reason`), `apps/platform-admin-web/app/pricing/page.tsx:1202-1269` (`handlePublish` sends trimmed `reason` and `usePlatformAdminAuthority().actorId`) | `tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx` (`C076-F2 UI-to-audit flow` & `C076-F2 server enforcement`)                                                                                                                                    | **PASS** (Failed before fix in `.local/pricing-draft-and-publish-reason-20261015/before.log`; passed after fix in `.local/pricing-draft-and-publish-reason-20261015/after.log`) |
| `pricing_original-version-scope-and-failure-regressions`         | Ensure duplicate version conflict (`409 PRICING_RULE_VERSION_CONFLICT`) and upstream publish failure (`503 PRICING_PUBLISH_UNAVAILABLE`) do not fabricate local drafts or optimistic receipts, and preserve existing narrow C076 (4 tests), C103 (5 tests), and `platform-admin.test.ts` (12 tests).                                                                                        | `apps/api/src/modules/platform-admin/platform-admin.service.ts:2026-2093`, `apps/platform-admin-web/app/pricing/page.tsx:1141-1269`, `tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts:70-126`                                                                                                                                                                                                                                                                                                                                                                                  | `tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx` (`keeps create and publish failures honest...`), `c076-fee-plan-pricing.test.ts`, `c103-partner-schemes-pricing.test.ts`, `platform-admin.test.ts`                                             | **PASS** (25/25 unit tests pass)                                                                                                                                                |
| `pricing_exact-candidate-validation`                             | Execute impacted repository unit tests, package builds, TypeScript typechecks (`@drts/contracts`, `@drts/api`, `@drts/platform-admin-web`, `typecheck:root`), Prettier, and ESLint (`--max-warnings=0`) without starting any VM runtime services.                                                                                                                                           | All scoped files above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Full verification suite below                                                                                                                                                                                                                                                                   | **PASS** (All commands exit `0`)                                                                                                                                                |

---

## 3. Before / After Reproduction Evidence

### 3.1 Before-Fix Reproduction (at base `ed70d73a03dd224e109867c99b7d04128484a3fe` / test anchor `a52a97bef`)

- **Command**:
  ```bash
  pnpm exec vitest run tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx
  ```
- **Log File**: `.local/pricing-draft-and-publish-reason-20261015/before.log`
- **Result**: `1 failed (1) | 4 failed (4)`
  1. **`C076-F1` failure**: Clicking `建立乘客定價草稿` (`pricing.action.createPassengerDraft`) rendered no draft creation form (`Unable to find a label with the text of: 規則名稱`) and issued `0` `POST /api/platform-admin/pricing-rules` requests.
  2. **`C076-F2` UI-to-audit failure**: When publishing a pre-seeded draft after entering `"   Board-approved Q2 passenger fee schedule rollout   "`, the outgoing `POST /api/platform-admin/pricing-rules/:ruleId/publish` body dropped `reason` and sent the cosmetic locale string `"platform_admin:zh"`:
     ```diff
     - Expected
     + Received
       {
     -   "publishedBy": "pa-pricing-manager-01",
     -   "reason": "Board-approved Q2 passenger fee schedule rollout",
     +   "publishedBy": "platform_admin:zh",
       }
     ```
  3. **`C076-F2` server enforcement failure**: Calling `platformAdminController.publishPlatformPricingRule` with `undefined`, `""`, `"   "`, or `"  short 11c  "` succeeded without throwing `ApiRequestError`.

### 3.2 After-Fix Verification

- **Unit Test Command**:
  ```bash
  pnpm exec vitest run \
    tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx \
    tests/unit/system-remediation/sr-qa-finance-001/c076-fee-plan-pricing.test.ts \
    tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts \
    tests/unit/platform-admin.test.ts
  ```
- **Log File**: `.local/pricing-draft-and-publish-reason-20261015/after.log`
- **Exit Code**: `0` (`Test Files 4 passed (4), Tests 25 passed (25)`)

- **Build, Typecheck & Lint Command**:
  ```bash
  pnpm --filter @drts/contracts build && \
  pnpm --filter @drts/api typecheck && \
  pnpm --filter @drts/platform-admin-web typecheck && \
  pnpm typecheck:root && \
  pnpm exec eslint \
    apps/platform-admin-web/app/pricing/page.tsx \
    packages/contracts/src/index.ts \
    apps/api/src/modules/platform-admin/platform-admin.service.ts \
    tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx \
    tests/unit/system-remediation/sr-qa-finance-001/c076-fee-plan-pricing.test.ts \
    tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts \
    --max-warnings=0
  ```
- **Log File**: `.local/pricing-draft-and-publish-reason-20261015/typecheck-lint.log`
- **Exit Code**: `0`

---

## 4. Honest Remaining Boundaries (Out of Scope for This Task)

- This task claims only its 4 assigned `Source` acceptance keys (`pricing_actual-create-draft-command-and-readback`, `pricing_publish-reason-reaches-authoritative-audit`, `pricing_original-version-scope-and-failure-regressions`, `pricing_exact-candidate-validation`).
- The unaudited Demo-owned quote/order fare calculation path, full C076 multi-instance concurrency/database transaction locking, and live deployed Cloud Run multi-role browser E2E evidence remain honestly open under their respective tasks and are not claimed as completed by this change.
- In compliance with `AGENTS.md`, no product dev servers, preview servers, Playwright browser servers, or Docker Compose services were started on this VM.
