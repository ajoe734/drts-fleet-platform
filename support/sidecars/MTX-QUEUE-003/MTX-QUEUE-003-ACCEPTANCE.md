# MTX-QUEUE-003 Acceptance Evidence

Date: 2026-07-23
Task ID: MTX-QUEUE-003
Title: Fleet C ops queue semantics UI
Owner: Gemini
Reviewer: Codex

## Acceptance Matrix

| Item | Requirement                                             | Code Location                                                                                                                                          | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `queue mode as text never color-only`                   | `apps/ops-console-web/lib/queue-semantics.ts`, `apps/ops-console-web/app/dispatch/page.tsx`, `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx` | `verified` | Explicit text labels (`虛擬媒合` / `實體排班` / `招呼站候客` / `Virtual Matching`) and matching mode text (`平台媒合` / `Platform Reserved`) are rendered alongside badges in list & detail cards. Tested in `tests/unit/queue-semantics.test.ts`.                                                                                                                                                                                                        |
| 2    | `siteId blank not masquerading as virtual`              | `apps/ops-console-web/lib/queue-semantics.ts`                                                                                                          | `verified` | Blank `siteId` / `physicalRankId` / `taxiStandId` displays `未指定站點` (Unassigned Site), preserving raw queueMode without masquerading physical rank as virtual matching. Tested in `tests/unit/queue-semantics.test.ts`.                                                                                                                                                                                                                               |
| 3    | `denial copy per doc08 §7.3 no raw reason code primary` | `apps/ops-console-web/lib/queue-semantics.ts`, `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx`                                               | `verified` | Multi-taxi statutory refusal state renders human readable copy `"此訂單為多元化計程車平台預約，不能進入實體排班或招呼站候客。"` as primary text rather than raw reason codes. State code maps to `statutory_refusal` (`"法定拒絕態"`). Tested in `tests/unit/queue-semantics.test.ts`.                                                                                                                                                                    |
| 4    | `no override/force-checkin control`                     | `apps/ops-console-web/lib/queue-semantics.ts`, `apps/ops-console-web/app/dispatch/page.tsx`, `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx` | `verified` | `isForbiddenStatutoryOverrideAction` strips all canonical/legacy override & fare override CTAs (`request_exception_override`, `approve_exception_override`, `manual_fare_override`, `request_override`, `approve_override`, `fare_override`, `force_checkin`) in statutory refusal state, displaying `"依法禁止人工 Override 或強行排班"`. Compliance card & `buildOverrideSummary` explicitly suppress override-based status in statutory refusal state. |
| 5    | `i18n via t()`                                          | `apps/ops-console-web/lib/translations.ts`                                                                                                             | `verified` | All queue semantics, overview titles, refusal copies (zh: `"此訂單為多元化計程車平台預約，不能進入實體排班或招呼站候客。"`, en: `"This order is a multi-taxi platform reservation and cannot enter physical ranks or taxi stands."`), and state codes (`opsCode.statutory_refusal`) loaded via `t()`.                                                                                                                                                     |
| 6    | `unit+e2e green + reviewer PASS`                        | `apps/ops-console-web/tests/unit/queue-semantics.test.ts`, `tests/e2e/ops-queue-semantics.spec.ts`                                                     | `verified` | Unit test suite passes 100% (6/6 test files passed, 23/23 tests green), Playwright E2E suite passes 100% (4/4 tests green), lint passes with 0 warnings.                                                                                                                                                                                                                                                                                                  |

## Visual Tokens & Styling

- Realm Colors: Ops shell + Coral realm tokens from `@drts/ui-web/canvas-tokens` (`CANVAS_REALM_LIGHT.ops` / `CANVAS_REALM_DARK.ops` / `CANVAS_SURFACE_ACCENTS.ops`).

## Production Fallback Masking Removal & Config Mismatch Remediation (Reviewer Remediation)

- Removed `DEMO_FALLBACK_ORDERS` masking in `apps/ops-console-web/app/dispatch/page.tsx:loadListRuntime`.
- Runtime fetch failures now accurately present degraded/error state (`failed: true` with error envelope) rather than fabricating demo order items.
- Fixed Playwright E2E baseURL and webServer port configuration in `tests/e2e/ops-queue-semantics.spec.ts` and `playwright.ops-queue-semantics.config.ts`. Tests now use Playwright's `baseURL` parameter fixture, seamlessly handling both `playwright.ops-queue-semantics.config.ts` (port 3003) and default `playwright.config.ts` (port 3202).

## Test Commands Executed & Verified

```bash
pnpm --filter ops-console-web test
# Result: 6 test files passed (23 tests green)

pnpm --filter ops-console-web lint
# Result: ESLint passed cleanly with 0 warnings

npx playwright test -c playwright.ops-queue-semantics.config.ts
# Result: 4/4 E2E tests passed green
```
