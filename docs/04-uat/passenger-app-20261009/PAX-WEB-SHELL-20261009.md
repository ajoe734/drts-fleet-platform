# PAX-WEB-SHELL-20261009: 乘客網頁 App 骨架、BFF、套件與 CI 登記

## UAT Findings and Evidence

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| R1 [P1 build] css import | 依據：`app/layout.tsx` imports `@drts/ui-tokens/globals.css`。<br>修改位置：`app/layout.tsx` 改 import `./globals.css`，並新增該檔。 | 舊版 tsc 無法驗證 CSS side-effect；修正後匯入本地存在之 CSS，通過 build。 | `pnpm exec tsc -p apps/passenger-app-web/tsconfig.json --noEmit`, exit 0. | 無 |
| R2 [P1 token exposure/session] token redaction | 依據：`route.ts` 原版直接轉發 auth/refresh 且回應未 redaction。<br>修改位置：`route.ts` 允許 login/otp/oauth，設定 HttpOnly/Secure/Lax cookie 並剔除回應 token。 | 舊版回應包含 token，且 cookie 未設。修正後 token 以 cookie 儲存，且 payload 中 token 欄位為 undefined。 | `pnpm exec vitest run tests/unit/pax-web-shell-20261009`, exit 0。測試 `handles login and redacts tokens...` | 無 |
| R3 [P1 logout revocation] | 依據：`route.ts` 原 logout 未呼叫 upstream revocation。<br>修改位置：`auth/logout` 主動呼叫 targetUrl (帶 auth header) 後再刪除 cookie。 | 原版直接回傳 200 並清理 cookie，修正後會先透過 fetch 送出 revocation。 | `vitest`, exit 0。測試 `handles logout by revoking upstream then clearing cookies` | 無 |
| R4 [P1 refresh trusted auth] | 依據：原 `route.ts` refresh bypass `applyUpstreamAuth` 且無 metadata 驗證。<br>修改位置：`auth/refresh` 呼叫 `applyUpstreamAuth` 帶入 trusted auth (Metadata-Flavor: Google)。 | 舊版直接送出 bare fetch。修正後 refresh 發送 metadata token，且驗證失敗會清除 cookie。 | `vitest`, exit 0。測試 `handles refresh with stored cookie and metadata auth` | 無 |
| R5 [P1 UI contract/fixtures] hardcoded palette/data | 依據：`components/p5-ui.tsx` 原寫死色票及預設 sample props。<br>修改位置：改用 `@drts/ui-tokens` 之 `REALM_COLORS.tenant`。抽換 hardcode 資料並提供 props。 | 原 P5VehicleCard 預設顯示 Toyota 資訊。修正後支援真實 props 並提供空狀態 fallback。 | `pnpm exec eslint apps/passenger-app-web`, exit 0。元件型別靜態檢查通過。 | 無 |
| R6 [P2 passenger-client acceptance] portable build | 依據：`src/client.ts` 缺 session 介面；`tsconfig` 缺 portable build。<br>修改位置：新增 `login`/`logout`；`tsconfig.json` 設定 `declaration: true` 及 `lib: ["ES2022"]`。 | 修正後 client 具備完整簽章且 tsc 將阻擋 DOM API。 | `cd packages/passenger-client && pnpm run build`, exit 0。 | 無 |
| R7 [P2 evidence/test coverage] security headers & tests | 依據：單元測試案例少；`next.config.ts` 缺 security headers。<br>修改位置：`next.config.ts` 補齊 CSP/XCTO/XFO/HSTS。單元測試補齊多項情境。 | 測試覆蓋預期邏輯；修正後 HTML 與 API error 都會套用安全標頭。 | `pnpm exec vitest run tests/unit/pax-web-shell-20261009`, exit 0 (11 tests pass)。 | 無 |
| R8 [P2 scope/registration] check classification | 依據：`repo-classification.json` 未註冊 app；包含出 scope 檔案。<br>修改位置：revert 出 scope 檔案；`repo-classification.json` 補齊 `passenger-app-web`。 | 修正後不會發布越權變更，分類檢查通過。 | `node tools/ci/check-repo-classification.mjs`, exit 0。 | 無 |

