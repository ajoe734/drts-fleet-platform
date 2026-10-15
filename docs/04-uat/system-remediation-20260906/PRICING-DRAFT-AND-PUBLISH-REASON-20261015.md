# UAT Evidence: PRICING-DRAFT-AND-PUBLISH-REASON-20261015

Status: owner checkpoint; routine Supervisor scope coordination required for `tests/e2e/E2E-011-platform-admin-control-plane.sh` before final candidate handoff.

## 1. Metadata & Scope

- **Task ID**: `PRICING-DRAFT-AND-PUBLISH-REASON-20261015` (`完成費率草稿建立與發布原因權威稽核`)
- **Owner / Reviewer**: `Gemini` / `Gemini2`
- **Branch**: `gemini/pricing-draft-and-publish-reason-20261015`
- **Immutable Base SHA (`origin/dev`)**: `ed70d73a03dd224e109867c99b7d04128484a3fe`
- **Pre-Fix Defect Reproduction Anchor SHA**: `a52a97befaa6fe6f72fc15c9e07e51d23fffe2b1` (`a52a97bef`)
- **Initial Implementation & Scoped-Unit Checkpoint SHA**: `3a620a47331977793f85579e631dca45e523a9d2` (PR `#2656`)
- **Candidate SHA**: **not ready / awaiting scope coordination**. This is an owner checkpoint, not a completed review candidate; final same-SHA mandatory CI, independent `Gemini2` review, protected merge, and acceptance remain pending after `tests/e2e/E2E-011-platform-admin-control-plane.sh` is added to `write_scopes`.
- **Canonical Spec Reference**: `.local/remaining-original-functional-fixes-20261015/PRICING-DRAFT-AND-PUBLISH-REASON-20261015.json` (SHA-256 `25d89d4bf363b5f6ba1518dd1108acc2a4549ef85a75a3ae067ddd6dd08e1d22`)
- **Source Audit Reference**: `.local/goal-continuation-20261015T0940-internal-frontier-root/C076-current-accepted-pricing-dataflow-readonly-audit.json` (SHA-256 `b8bba80c9b9b63a6368a6abeb05feeb34f75f01b9d747c3970dee2e3609200f5`)
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
  - _(Note: `packages/api-client` and `apps/api/src/modules/platform-admin/platform-admin.controller.ts` were not modified because existing pass-through already forwards `CreatePlatformPricingRuleCommand` and `PublishPlatformPricingRuleCommand` unchanged. Excluded caller `tests/e2e/E2E-011-platform-admin-control-plane.sh` has NOT been edited.)_

---

## 2. Required scope coordination (unresolved)

The task's current `write_scopes` allowlist excludes 1 existing E2E caller script that invokes `POST /platform-admin/pricing-rules/:ruleId/publish` directly without a `reason` field and must be adapted for this contract change. The owner requests routine Supervisor conflict checking and exact `write_scopes` expansion via `ai-status.sh progress` on 2026-10-15. No excluded file has been edited (`tests/e2e/E2E-011-platform-admin-control-plane.sh` remains at base git blob OID `073f62258bdc68c553619499da6655b6513cd107`, SHA-256 `647efd729ac908888e83477088dca273bdaf2b5b0f946c9b461d46b423e48d9e`).

### 2.1 Why this caller must be adapted (no server requirement weakening)

Per Acceptance #2 (_"Retain the original UI minimum 12 trimmed characters and make the actual server mutation enforce the established reason requirement; do not drop reason for compatibility or accept an optional empty reason as a substitute"_) and Acceptance #4 (_"If unavoidable exact shared caller hunk is needed, request routine Supervisor scope coordination before writing, never edit concurrently or disable the feature"_), `PlatformAdminService.publishPlatformPricingRule` strictly enforces a non-blank `>= 12` trimmed-character `reason`. Weakening the server check to accept an omitted/empty `reason` is explicitly forbidden by the task specification.

### 2.2 Exact requested additional path (0 production files + 1 existing test caller file)

1. `tests/e2e/E2E-011-platform-admin-control-plane.sh`
   - **Base / checkpoint blob OID**: `073f62258bdc68c553619499da6655b6513cd107` (SHA-256 `647efd729ac908888e83477088dca273bdaf2b5b0f946c9b461d46b423e48d9e`)
   - **Exact location**: lines 518–524 (`UAT-ADM-007 — POST /platform-admin/pricing-rules/:ruleId/publish`).
   - **Current lines (518–524)**:

     ```bash
     PRICING_PUBLISH_FILE="${TMP_DIR}/pricing-publish.json"
     write_json "$PRICING_PUBLISH_FILE" \
       --arg publishedBy "e2e-platform-admin-001" \
       '{ publishedBy: $publishedBy }'

     log_step "UAT-ADM-007 — POST /platform-admin/pricing-rules/:ruleId/publish"
     http_call POST "/platform-admin/pricing-rules/${PRICING_RULE_ID}/publish" "$PRICING_PUBLISH_FILE"
     ```

   - **Exact minimal hunk needed**:
     Include a valid `>= 12` trimmed-character `reason` in `PRICING_PUBLISH_FILE` (matching the existing `reason` convention in `UAT-ADM-006` at lines 480 and 488 of the same script), preserving all existing status, version, evidence, `expect_audit "publish_platform_pricing_rule"`, and `require_pricing_rule_readback` assertions:
     ```bash
     PRICING_PUBLISH_FILE="${TMP_DIR}/pricing-publish.json"
     write_json "$PRICING_PUBLISH_FILE" \
       --arg publishedBy "e2e-platform-admin-001" \
       '{ publishedBy: $publishedBy, reason: "e2e-011-pricing-rule-publish" }'
     ```

### 2.3 Exhaustive repo-wide caller verification & hosted CI evidence on `3a620a47331977793f85579e631dca45e523a9d2`

A repo-wide search (`grep -rnE --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist "pricing-rules|publishPlatformPricingRule|PublishPlatformPricingRuleCommand|createPlatformPricingRule|CreatePlatformPricingRuleCommand" apps/ packages/ tests/ tools/`) verified every caller in the repository:

- `apps/platform-admin-web/app/pricing/page.tsx`: in `write_scopes`, updated at `3a620a47331977793f85579e631dca45e523a9d2`.
- `packages/api-client/src/index.ts` (lines 4279–4296): passes `{ body: command }` unchanged; no edit required (active Demo-owned).
- `apps/api/src/modules/platform-admin/platform-admin.controller.ts` (lines 261–286): passes `@Body() command` unchanged; no edit required.
- `apps/api/src/modules/platform-admin/platform-admin.service.ts` (lines 2026–2205): in `write_scopes`, updated at `3a620a47331977793f85579e631dca45e523a9d2`.
- `tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts` (lines 81, 100): in `write_scopes`, updated at `3a620a47331977793f85579e631dca45e523a9d2`.
- `tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx`: in `write_scopes`, added at `3a620a47331977793f85579e631dca45e523a9d2`.
- `tests/e2e/system-remediation/sr-qa-governance-001/sr-qa-governance-001.spec.ts` (lines 147–178): synthetic `recorder.recordHttpCall` metadata only; does not call the API or service; `ui-e2e` passed in CI.
- `tests/e2e/E2E-011-platform-admin-control-plane.sh` (lines 518–524): **sole excluded caller**. Hosted CI run `38722266436` (`CI (integration trunk)`, job `116381103876` `cross-surface-e2e`) passed 21/22 scenarios (`001`–`010`, `012`–`022`) and failed only on `011` at `UAT-ADM-007 — POST /platform-admin/pricing-rules/:ruleId/publish` with HTTP `400` `{"error":{"code":"FIELD_REQUIRED","message":"reason is required.","details":{"field":"reason"},"retryable":false}}`. Meanwhile hosted `CI` run `38722266342` (`Product smoke acceptance` job `116380348895`, full lint + typecheck + root unit tests + API unit tests, and `Smoke acceptance` job `116387266959`) and `Ops Shell Remote Acceptance` (`38722266369`) all passed (`SUCCESS`). (`CI (integration trunk) / unit` job `116381103930` was cancelled at its 20m workflow timeout after spending ~4m building the Docker image; all unit suites passed in `Product smoke acceptance`.)

After Supervisor scope coordination grants `tests/e2e/E2E-011-platform-admin-control-plane.sh`, the owner will apply the 1-line JSON payload adaptation, rerun checks, push the final candidate, and hand off to `Gemini2` through the normal same-SHA lifecycle.

---

## 3. §0.7 Finding & Acceptance Mapping Table

| Finding / Acceptance Key                                         | Original Defect / Root Cause                                                                                                                                                                                                                                                                                                                                                                | Code Hunk Fixed (`file:line`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Regression Test Case                                                                                                                                                                                                                                                                            | Verification Result & Outstanding Limits                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `C076-F1` / `pricing_actual-create-draft-command-and-readback`   | Header button `pricing.action.createPassengerDraft` in `apps/platform-admin-web/app/pricing/page.tsx` only called `handleTabChange(...)` and had zero callers of `client.createPlatformPricingRule`. Since `PLATFORM_PRICING_RULES_SEED` only contains `"active"` rules, `draftRules` was empty and the Publish workflow was unreachable from the UI.                                       | `apps/platform-admin-web/app/pricing/page.tsx:507-718` (`CreateDraftModal`), `apps/platform-admin-web/app/pricing/page.tsx:1239-1301` (`handleCreateDraft` calling `client.createPlatformPricingRule(command)` + `Promise.all` canonical readback + `setSelectedDraftId(created.ruleId)`), `apps/platform-admin-web/app/pricing/page.tsx:1383-1404` (header button opens modal on `passenger` tab while preserving tab/query)                                                                                                                                                                                          | `tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx` (`C076-F1 + C076-F2: creates a canonical pricing draft from the page header action, reads it back into comparison, and publishes it with user-entered reason recorded in authoritative audit`) | **Scoped PASS** (Failed before fix in `.local/pricing-draft-and-publish-reason-20261015/before.log`; passed after fix in `.local/pricing-draft-and-publish-reason-20261015/after.log`). Final candidate CI / review / merge pending E2E-011 scope coordination. |
| `C076-F2` / `pricing_publish-reason-reaches-authoritative-audit` | `handlePublish` validated `publishReason.trim().length >= 12` in UI state but omitted `reason` from `PublishPlatformPricingRuleCommand` and hardcoded cosmetic `publishedBy: platform_admin:${locale}`. `PlatformAdminService.publishPlatformPricingRule` did not validate or record `reason` in `publish_platform_pricing_rule` audit (`newValuesSummary`) or `PlatformPricingRuleRecord`. | `packages/contracts/src/index.ts:7655,7673` (`publishReason?: string \| null` on `PlatformPricingRuleRecord`, `reason: string` on `PublishPlatformPricingRuleCommand`), `apps/api/src/modules/platform-admin/platform-admin.service.ts:2117-2204` (server-side non-blank `>= 12` trimmed char validation before archiving/mutating, cosmetic locale persona stripping, `rule.publishReason = reason`, `recordAudit` `actorId: publishedBy` and `newValuesSummary.reason`), `apps/platform-admin-web/app/pricing/page.tsx:1303-1361` (`handlePublish` sends trimmed `reason` and `usePlatformAdminAuthority().actorId`) | `tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx` (`C076-F2 UI-to-audit flow` & `C076-F2 server enforcement`)                                                                                                                                    | **Scoped PASS** (Failed before fix in `.local/pricing-draft-and-publish-reason-20261015/before.log`; passed after fix in `.local/pricing-draft-and-publish-reason-20261015/after.log`). Excluded caller `E2E-011` awaits scope coordination.                    |
| `pricing_original-version-scope-and-failure-regressions`         | Ensure duplicate version conflict (`409 PRICING_RULE_VERSION_CONFLICT`) and upstream publish failure (`503 PRICING_PUBLISH_UNAVAILABLE`) do not fabricate local drafts or optimistic receipts, and preserve existing narrow C076 (4 tests), C103 (5 tests), and `platform-admin.test.ts` (12 tests).                                                                                        | `apps/api/src/modules/platform-admin/platform-admin.service.ts:2026-2115`, `apps/platform-admin-web/app/pricing/page.tsx:1239-1361`, `tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts:70-126`                                                                                                                                                                                                                                                                                                                                                                                  | `tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx` (`keeps create and publish failures honest...`), `c076-fee-plan-pricing.test.ts`, `c103-partner-schemes-pricing.test.ts`, `platform-admin.test.ts`                                             | **Scoped PASS** (25/25 unit tests pass; hosted `Product smoke acceptance` `116380348895` passed). Excluded caller `tests/e2e/E2E-011-platform-admin-control-plane.sh` failed in `cross-surface-e2e` (`116381103876`) pending scope expansion.                   |
| `pricing_exact-candidate-validation`                             | Execute impacted repository unit tests, package builds, TypeScript typechecks (`@drts/contracts`, `@drts/api`, `@drts/platform-admin-web`, `typecheck:root`), Prettier, and ESLint (`--max-warnings=0`) without starting any VM runtime services.                                                                                                                                           | All scoped files above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Full verification suite below                                                                                                                                                                                                                                                                   | **Blocked on scope coordination**: local unit/typecheck/lint exit `0`; hosted `cross-surface-e2e` requires `tests/e2e/E2E-011-platform-admin-control-plane.sh` scope grant before final candidate handoff, review, merge, and acceptance.                       |

---

## 4. Before / After Reproduction Evidence

### 4.1 Before-Fix Reproduction (at base `ed70d73a03dd224e109867c99b7d04128484a3fe` / test anchor `a52a97bef`)

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

### 4.2 After-Fix Scoped Verification (Checkpoint `3a620a47331977793f85579e631dca45e523a9d2`)

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

## 5. Honest Remaining Boundaries (Out of Scope for This Task)

- This task claims only its 4 assigned `Source` acceptance keys (`pricing_actual-create-draft-command-and-readback`, `pricing_publish-reason-reaches-authoritative-audit`, `pricing_original-version-scope-and-failure-regressions`, `pricing_exact-candidate-validation`), which remain pending final candidate CI, `Gemini2` review, and protected merge after routine Supervisor scope coordination for `tests/e2e/E2E-011-platform-admin-control-plane.sh`.
- The unaudited Demo-owned quote/order fare calculation path, full C076 multi-instance concurrency/database transaction locking, and live deployed Cloud Run multi-role browser E2E evidence remain honestly open under their respective tasks and are not claimed as completed by this change.
- In compliance with `AGENTS.md`, no product dev servers, preview servers, Playwright browser servers, or Docker Compose services were started on this VM.
