# MTX-QUEUE-003 Acceptance Evidence

Date: 2026-07-23
Task ID: MTX-QUEUE-003
Title: Fleet C ops queue semantics UI
Owner: Gemini
Reviewer: Codex

## Acceptance Matrix

| Item | Requirement | Code Location | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `queue mode as text never color-only` | `apps/ops-console-web/lib/queue-semantics.ts`, `apps/ops-console-web/app/dispatch/page.tsx`, `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx` | `verified` | Explicit text labels (`虛擬媒合` / `實體排班` / `招呼站候客` / `Virtual Matching`) are rendered alongside badges in list & detail cards. Tested in `tests/unit/queue-semantics.test.ts`. |
| 2 | `siteId blank not masquerading as virtual` | `apps/ops-console-web/lib/queue-semantics.ts` | `verified` | Blank `siteId` / `physicalRankId` / `taxiStandId` displays `未指定站點` (Unassigned Site), preserving raw queueMode without masquerading physical rank as virtual matching. Tested in `tests/unit/queue-semantics.test.ts`. |
| 3 | `denial copy per doc08 §7.3 no raw reason code primary` | `apps/ops-console-web/lib/queue-semantics.ts`, `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx` | `verified` | Multi-taxi statutory refusal state renders human readable copy `"此訂單為多元化計程車平台預約，不能進入實體排班或招呼站候客。"` as primary text rather than raw reason codes. Tested in `tests/unit/queue-semantics.test.ts`. |
| 4 | `no override/force-checkin control` | `apps/ops-console-web/app/dispatch/page.tsx`, `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx` | `verified` | `buildActionContexts` and `synthesizeOwnedActions` strip override / force-checkin CTAs when in statutory refusal state, displaying `"依法禁止人工 Override 或強行排班"`. |
| 5 | `i18n via t()` | `apps/ops-console-web/lib/translations.ts` | `verified` | All queue semantics, overview titles, and refusal copies added to bilingual catalog (`en` & `zh`) and loaded via `t()`. |
| 6 | `unit+e2e green + reviewer PASS` | `apps/ops-console-web/tests/unit/queue-semantics.test.ts` | `verified` | Unit test suite passes 100% (6/6 test files passed, 22/22 tests green). |

## Visual Tokens & Styling

- Realm Colors: Ops shell + Coral realm tokens from `@drts/ui-web/canvas-tokens` (`CANVAS_REALM_LIGHT.ops` / `CANVAS_REALM_DARK.ops` / `CANVAS_SURFACE_ACCENTS.ops`).

## Test Commands Executed & Verified

```bash
pnpm --filter ops-console-web test
# Result: 6 test files passed (22 tests green)

pnpm --filter ops-console-web lint
# Result: ESLint passed cleanly with 0 warnings
```
