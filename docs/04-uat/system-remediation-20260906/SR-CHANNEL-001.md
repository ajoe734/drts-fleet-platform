# SR-CHANNEL-001 — 通路總覽匯出與對帳查詢

- Owner: `Gemini`
- Reviewer: `Codex2`
- Wave: `system-remediation-20260906`
- Gap ID: `R26`
- Capability IDs: `C087`
- Base SHA: `40ba315e4114369eaa7e12d35aae83a795c97b1d` (`origin/dev` at branch creation)
- Candidate SHA: recorded at `handoff` time via `git rev-parse HEAD`
- Branch: `gemini/sr-channel-001`

## 1. Audit source (2026-09-06) vs. reproduction at base SHA

### Audit findings

`docs/04-uat/system-remediation-20260906/source/findings.json` (R26, 角色: 通路財務):

> **不足**: 總覽匯出未接線，但對帳CSV可下載
> **重現步驟與實際結果**: 總覽匯出後5秒無任何request/download；對帳明細下載200且225分潤對上
> **影響**: 總覽報表入口不可用
> **建議修正及驗收**: 連到可用匯出或既有CSV，下載鈕標明內容及格式
> **證據**: partners/verified-actions.json
> **驗證界線**: 成功與失敗下載均有事件證據

`capabilities.json` C087:

> **角色**: 通路營運主管
> **能力／應完成工作**: 總覽匯出
> **狀態**: 故障
> **目前證據與限制**: 總覽匯出無反應；明細 CSV 可用
> **缺口／下一個驗收條件**: 總覽按鈕連真正報表並傳當前篩選
> **需求／證據**: R26

`findings.json` R27:

> **不足**: 環境標示與使用者文案混入工程資訊
> **建議修正及驗收**: 由部署設定產生環境標記；狀態繁中化、下一步明確，技術詳情放診斷區

### Reproduction at base SHA `40ba315`

Reading `apps/channel-partner-portal-web/app/dashboard/page.tsx` at base SHA revealed:

1. **總覽匯出未接線**:
   Line 119 rendered `<CanvasBtn theme={theme}>{t("common.export", locale)}</CanvasBtn>` as an inert `<button>` without an `href`, `download`, or click handler. Clicking the button produced no HTTP request and triggered no download.
2. **缺乏期別篩選與傳遞**:
   `ReferralDashboardPage` did not accept `searchParams` and hardcoded `summary.period` in a static `<span>`, preventing filtering and disabling report generation for selected periods.
3. **既有對帳明細 CSV 可用但文案混入工程欄位**:
   In `app/statements/[period]/page.tsx`, the download link correctly connected to `/control-plane-proxy/partner/referral/statements/${encodeURIComponent(period)}/artifact`, which generated the 2-trip, 1500 GMV, 225 share CSV. However, the button label read "下載 artifact", the statement detail card displayed raw `artifactId` and `SHA-256`, and `ReferralStatementsTable` printed internal `r.artifactId` underneath the statement ID.
4. **Shell 環境標示固定為 production**:
   `components/channel-portal-shell.tsx` hardcoded `env="production"`.

## 2. Fix (write_scopes only: `apps/channel-partner-portal-web/`)

All changes strictly adhere to the UI Design Contract (`packages/ui-tokens` realm styling + canvas theme):

1. **總覽匯出接線與期別篩選 (`apps/channel-partner-portal-web/app/dashboard/page.tsx`)**:
   - `ReferralDashboardPage` now accepts `props: { searchParams?: Promise<{ period?: string }> }`.
   - Reads `requestedPeriod = searchParams?.period?.trim()` and passes it to `loadReferralDashboard(requestedPeriod)`.
   - Header actions now include `DashboardPeriodFilter`, an interactive period dropdown styled with `@drts/ui-web` token theme and stamped with `data-drt-filter="period"`.
   - The export action is wired to:
     ```tsx
     <a
       href={`/control-plane-proxy/partner/referral/statements/${encodeURIComponent(currentPeriod)}/artifact`}
       download={`referral-statement-${currentPeriod}.csv`}
       data-drt-operation="channel-overview-export"
       data-drt-intent="channel-statement-download"
       style={{
         alignItems: "center",
         background: theme.accent,
         border: `1px solid ${theme.accent}`,
         borderRadius: 6,
         color: "#fff",
         display: "inline-flex",
         fontSize: 12,
         fontWeight: 600,
         height: 28,
         padding: "5px 10px",
         textDecoration: "none",
         gap: 6,
       }}
     >
       <CanvasIcon name="reports" size={13} />
       {t("common.export", locale)} (CSV)
     </a>
     ```
   - Clicking export triggers an immediate browser download for the statement CSV matching `currentPeriod`, with explicit content and format labeling (`匯出 (CSV)` / `Export (CSV)`).
2. **清理工程欄位與技術詳情診斷區 (`apps/channel-partner-portal-web/app/statements/[period]/page.tsx`, `components/referral-tables.tsx`)**:
   - In `ReferralStatementsTable`, removed the redundant `{r.artifactId}` rendering under `{r.id}`.
   - In `ReferralStatementDetailPage`, replaced the prominent engineering "成品 (Artifact)" card with a clean "存證與開立資訊 (Verification & Issuance)" card showing business fields (`table.issued` and `referral.statements.verificationStatus`).
   - Technical metadata (`statement.artifactId` and `statement.artifactHash` / `SHA-256`) is placed into a collapsible `<details>` diagnostic/audit section per R27 ("技術詳情放診斷區").
   - Added `download={`referral-statement-${period}.csv`}` to the statement detail download button.
3. **文案繁中化與去工程化 (`apps/channel-partner-portal-web/lib/translations.ts`)**:
   - `"referral.statements.downloadArtifact"`: updated from `"下載 artifact"` to `"下載對帳明細 (CSV)"` (zh) / `"Download statement (CSV)"` (en).
   - `"referral.statements.detailSubtitle"`: updated from `"對帳單行、期別總計與簽名 artifact"` to `"對帳單明細與期別總計"` (zh) / `"Statement lines and period totals"` (en).
   - `"referral.statements.artifact"`: updated from `"簽名 artifact"` to `"存證與開立資訊"` (zh) / `"Verification & Issuance"` (en).
   - Added `"referral.statements.technicalDetails"` ("技術與稽核詳情") and `"referral.statements.verified"` ("已完成數位簽章存證").
4. **資料層支援期別查詢與真實回退 (`apps/channel-partner-portal-web/lib/channel-portal-data.server.ts`)**:
   - `loadReferralDashboard(period?: string)` now appends `?periodMonth=${encodeURIComponent(period)}` when requesting the API.
   - In offline/fallback mode, matches the requested period against fixtures, or produces an honest zero-count/zero-amount summary (trips: 0, gmv: 0, share: 0) instead of returning fabricated numbers.
5. **動態環境標示 (`apps/channel-partner-portal-web/components/channel-portal-shell.tsx`)**:
   - Replaced hardcoded `env="production"` with `process.env.NEXT_PUBLIC_APP_ENV || (process.env.NODE_ENV === "production" ? "production" : "dev")`.
6. **建置與端點健全性 (`tsconfig.json`, `lib/api-client.server.ts`, `app/control-plane-proxy/[...path]/route.ts`)**:
   - Added workspace paths mapping for `@drts/*` in `tsconfig.json` to resolve typecheck without root monorepo build order dependencies.
   - Handled `nextHeaders()` gracefully with try/catch in `api-client.server.ts`.
   - Used relative import for `referral-bootstrap-identity` in `control-plane-proxy/[...path]/route.ts` to ensure compatibility with root test runner.

## 3. Regression tests (`tests/unit/system-remediation/sr-channel-001/`)

Two comprehensive test suites (9 test cases) were added:

### `channel-overview-export.test.ts` (4 tests)
- **`exports statement CSV matching dashboard filter, count (2 trips), and amount (1500 GMV, 225 share)`**:
  Validates that when the dashboard renders for `2026-06`, the overview export action targets `/control-plane-proxy/partner/referral/statements/2026-06/artifact`, carries `download="referral-statement-2026-06.csv"`, and the resulting CSV contains exactly 2 trips, GMV of 1,500, and 225 share amount, perfectly aligning with dashboard KPIs.
- **`propagates period query parameter to the live API endpoint`**:
  Verifies that passing `period="2026-05"` transmits `periodMonth=2026-05` to `/api/partner/referral/dashboard`, and dashboard metrics update accordingly.
- **`handles empty period data cleanly without returning fabricated numbers`**:
  Verifies that querying an unpopulated period yields trips=0, gmv=NT$ 0, share=NT$ 0.
- **`marks export action with content and format explicitly`**:
  Verifies bilingual strings for export action explicitly show "(CSV)".

### `channel-settlement-regression.test.ts` (5 tests)
- **`preserves authoritative 2-trip, 1500 GMV, 225 share case on backend services without regression`**:
  Directly exercises `BillingSettlementService` and `TenantPartnerService` for `referral-demo-community` (2026-06):
  - `order-referral-001`: fare 600 TWD, 15% share -> 90 TWD
  - `order-referral-002`: fare 900 TWD, 15% share -> 135 TWD
  - Totals: 2 trips, GMV 150,000 minor (1,500 TWD), Share 22,500 minor (225 TWD).
- **`control-plane proxy forwards statement artifact download request and streams CSV`**:
  Validates that proxying `GET /control-plane-proxy/partner/referral/statements/2026-06/artifact` sets `x-actor-type: partner_api_key`, `x-realm: partner`, `x-partner-entry-slug: referral-demo-community`, and streams `text/csv` with attachment header.
- **`handles service failure explicitly with HTTP 503 instead of silent hang`**:
  Simulates upstream outage (connection refused); proxy responds with HTTP 503 and `{ status: "down", error: ... }`.
- **`explicitly handles empty periods with zero totals and headers-only lines`**:
  Validates that periods with no trip records produce empty lines and zeroed totals without throwing errors.
- **`declutters engineering artifact labels in user-facing copy`**:
  Validates that `downloadArtifact`, `detailSubtitle`, and `artifact` strings no longer expose raw "artifact" jargon in either Chinese or English.

## 4. Verification boundaries & Live device statement

- **Verified**:
  - Full TypeScript typecheck: `pnpm --filter @drts/channel-partner-portal-web typecheck` (exit code 0).
  - Code hygiene: `git diff --check` (exit code 0).
  - Portal unit tests: `pnpm --filter @drts/channel-partner-portal-web test` (exit code 0).
  - Remediated unit & integration regression tests: `pnpm exec vitest run tests/unit/system-remediation/sr-channel-001/` (2 test files, 9 tests, exit code 0).
  - Portal linter: `pnpm --filter @drts/channel-partner-portal-web lint` (exit code 0).
- **Live / Real device boundary**:
  - Live production Cloud Run deployment and browser click probes on real mobile/desktop devices were not performed during this worker turn; all assertions are verified via hermetic unit/mock proxy execution.
  - No fixtures, fixed percentages, or fake signatures were substituted for real authoritative API and data models.

## 5. Verification commands & results

```bash
$ git diff --check
# Exit code: 0

$ pnpm --filter @drts/channel-partner-portal-web typecheck
# Exit code: 0
> @drts/channel-partner-portal-web@0.1.0 typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully

$ pnpm exec vitest run tests/unit/system-remediation/sr-channel-001/
# Exit code: 0
 Test Files  2 passed (2)
      Tests  9 passed (9)
   Duration  4.06s

$ pnpm --filter @drts/channel-partner-portal-web test
# Exit code: 0
 Test Files  1 passed (1)
      Tests  1 passed (1)

$ pnpm --filter @drts/channel-partner-portal-web lint
# Exit code: 0
```
