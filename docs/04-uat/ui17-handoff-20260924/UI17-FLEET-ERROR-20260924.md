# UI17-FLEET-ERROR-20260924 UAT

- **Source ZIP hash**: 9989de8f342e2d78e85796599131bea139a238e750821d1f292e004bb4cd9005 (driver app 18.zip)
- **正式依據**: `fleet-portal-missing-scope-screen-requirements-20260808.md`
- **移植畫板**:
  - `B1 · 缺少車隊身分` (`err-scope`)
  - `B2 · 一般頁面例外` (`err-page`)

## Audit Finding 對照

| Finding／驗收項          | 原始碼依據與修改位置                                                   | 舊版重現 → 修正版結果                                                             | 命令、退出碼、執行版本與證據位置                                    | 未驗項與具體限制                                                |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| R1 Session logout        | `apps/fleet-partner-portal-web/app/error.tsx:26-32` 與 `middleware.ts` | 缺少 CSRF 送出會 403 → 加入 x-csrf-token 後正常清除。                             | `pnpm run test:unit tests/unit/ui17-fleet-error-20260924/` (exit 0) | Browser/Live runtime 需依賴 hosted CI                           |
| R2 測試與 Typecheck 錯誤 | `tests/unit/ui17-fleet-error-20260924/error-boundary.test.ts`          | 舊版根目錄 typecheck 失敗、缺互動測試 → 移除靜態引入，並加入實際 React 點擊與重試狀態的互動測試單元 | `pnpm run typecheck:root` (exit 0), `pnpm run test:unit` (exit 0)   | 未使用 `@testing-library/react` mount，因專案未安裝。使用 custom dispatcher 執行互動測試。 |
| R3 語系與字體            | `apps/fleet-partner-portal-web/app/error.tsx`, `lib/translations.ts`   | 使用 `t()` 取代 hardcode，並修正字體為 `theme.monoFamily`                         | Reviewer probe 已確認                                               | N/A                                                             |
| B 車隊錯誤畫面設計變更   | ZIP B 無變更                                                           | 沿用舊版已移植完成設計，無須重新覆蓋。                                            | N/A                                                                 | N/A                                                             |

## 檢查命令與退出碼

- `pnpm run typecheck:root`: Exit 0 (TS6142 已修復)
- `node node_modules/eslint/bin/eslint.js tests/unit/ui17-fleet-error-20260924/error-boundary.test.ts apps/fleet-partner-portal-web/app/error.tsx apps/fleet-partner-portal-web/lib/translations.ts --max-warnings=0`: Exit 0
- `pnpm run test:unit tests/unit/ui17-fleet-error-20260924/`: Exit 0 (4 測試通過，包含 CSRF 與 React 點擊互動)

## 剩餘驗收

- `ui17-fleet-error-20260924_source_and_state_coverage`: 待核實 (依賴 PR reviewer 核准與 hosted browser checks)
- `ui17-fleet-error-20260924_scoped_verification_and_preservation`: 待核實 (已補齊 R2 互動測試與型別檢查，需等 CI 綠燈與 Reviewer 核對)
