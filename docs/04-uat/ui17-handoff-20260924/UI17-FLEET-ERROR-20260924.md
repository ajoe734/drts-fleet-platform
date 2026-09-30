# UI17-FLEET-ERROR-20260924 UAT

- **Source ZIP hash**: 9989de8f342e2d78e85796599131bea139a238e750821d1f292e004bb4cd9005 (driver app 18.zip)
- **正式依據**: `fleet-portal-missing-scope-screen-requirements-20260808.md`
- **移植畫板**:
  - `B1 · 缺少車隊身分` (`err-scope`)
  - `B2 · 一般頁面例外` (`err-page`)
- **Review References**:
  - SHA: 162d57dc5ad4427bf4837048c3fc7d5904357ba3
  - Generation: e5f660d20b4e41dda5e93d0477c0c28f
  - PR: https://github.com/ajoe734/drts-fleet-platform/pull/2137
  - Adjacent SHA: 5396f36aa65b734bf9c0c0f5c71f60cf59c42a8d
- **Environment**: Node 22.23.2, TypeScript 5.9.3, Vitest 4.1.4, React/React DOM 19.2.5, jsdom 30.1.1, @testing-library/react 16.3.3, @testing-library/dom 10.4.2

## Audit Finding 對照

| Finding／驗收項         | 狀態      | 原始碼依據與修改位置                                                   | 修正與驗證證據                                                                                                                                                                                                                                                  | 未驗項與具體限制                                                      |
| ----------------------- | --------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| R1 Session logout       | **FIXED** | `apps/fleet-partner-portal-web/app/error.tsx:26-32` 與 `middleware.ts` | 缺少 CSRF 送出會 403 → 加入 x-csrf-token 後正常清除。Git blob comparisons confirm error.tsx, middleware.ts unchanged from cfb483ebbed2b369bc625f73398ae4e3c54568d5.                                                                                             | 真實瀏覽器 session CSRF 測試待整合至 R2 真實環境迴歸測試中。          |
| R2 TS6142 與 Collection | **FIXED** | `tests/unit/ui17-fleet-error-20260924/error-boundary.test.ts`          | 解決前次審查獨立執行回報的 exit 2 錯誤。                                                                                                                                                                                                                        | N/A                                                                   |
| R2 真元件迴歸與互動     | **FIXED** | `tests/unit/ui17-fleet-error-20260924/error-boundary.test.ts`          | 已新增 `@testing-library/react` 及 jsdom 進行真實 DOM 掛載、真 hooks 及 Context 測試（14 tests passed，涵蓋 HttpOnly、重複點擊、403、重試及完整 cookie 清除，與 6 種組合 matrix 測試）。已加入完整 retry 成功與 cookie 清除斷言，舊版敏感度測試失敗、新版通過。 | 未跑 hosted browser 明列未驗。真實瀏覽器 E2E regression 仍保留 OPEN。 |
| R3 語系與字體           | **FIXED** | `apps/fleet-partner-portal-web/app/error.tsx`, `lib/translations.ts`   | 使用 `t()` 取代 hardcode，並修正字體。Git blob comparisons confirm translations.ts, i18n.tsx, theme, Canvas unchanged from cfb483ebbed2b369bc625f73398ae4e3c54568d5.                                                                                            | N/A                                                                   |
| R4 Commit trailers      | **FIXED** | `tools/ci/git/check_commit_trailers.py`                                | `python3 tools/ci/git/check_commit_trailers.py --base c8c0d8552d7c64e9dd365f7f4ebdca4b1c08b5a0 --head 162d57dc5ad4427bf4837048c3fc7d5904357ba3` exits 0, 6 commits OK.                                                                                          | N/A                                                                   |
| B 車隊錯誤畫面設計變更  | **FIXED** | `docs/05-ui/drts-design-canvas/`                                       | ZIP B 無變更，ZIP18/ZIP20 hashes verified. 沿用舊版已移植完成設計，全數 42 個 DCArtboard blocks 保留，err-scope/err-page ID 正確配置。                                                                                                                          | N/A                                                                   |

## 檢查命令與退出碼

- **Typecheck**: `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --incremental false` Exit 0. `node node_modules/typescript/bin/tsc -p apps/fleet-partner-portal-web/tsconfig.json --noEmit --incremental false` Exit 0.
- **Lint**: `node node_modules/eslint/bin/eslint.js tests/unit/ui17-fleet-error-20260924/error-boundary.test.ts apps/fleet-partner-portal-web/app/error.tsx apps/fleet-partner-portal-web/lib/translations.ts --max-warnings=0` Exit 0
- **Unit Test (JSDOM)**: `pnpm run test:unit tests/unit/ui17-fleet-error-20260924/` Exit 0 (14 tests passed). _Note: Test logic uses real React DOM and context via JSDOM and @testing-library/react. Old sensitivity test resulted in exit 1, current passes with exit 0._
- **Commit Trailers**: Exit 0 (6 commits OK).

## 剩餘驗收與 Acceptance Mapping

- `ui17-fleet-error-20260924_source_and_state_coverage`:
  - **Evidence**: Source/state integration and original boards preserved; R1/R3 implementation retained verbatim from adjacent reopened candidates. Verified via SHA256 matches of ZIP18/ZIP20 and Git blob comparisons.
  - **Pending**: Hosted browser checks not yet asserted.
- `ui17-fleet-error-20260924_scoped_verification_and_preservation`:
  - **Evidence**: Design preservation confirmed. Scoped lint and root/app typecheck pass. Commit gates are green. Real React component mounting test expanded to include successful retry flow and full cookie clearing regression checks (14 tests pass).
  - **Pending**: 無 E2E 測試目錄寫入權限，未跑 hosted browser 明列未驗。真實瀏覽器 E2E regression 仍保留 OPEN。
