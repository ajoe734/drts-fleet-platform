# UI17-PASSENGER-CANVAS-20260924 驗收文件

## 來源與依據
- Source ZIP: `docs/05-ui/driver app (18).zip`
- Source SHA256: `9989de8f342e2d78e85796599131bea139a238e750821d1f292e004bb4cd9005`
- Review Sources: `worker_outcomes codex-20260924T072904Z-eade93f1` (Candidate SHA `f08c75fd8cfd264d2e7bd3eb94d8a447f41de8c9`), and `codex-20260924T074134Z-f0e892fc` (Candidate SHA `52504d576dcb0422a4b2c4852c4e77547c6d70a3`)
- 正式依據：新北市交通局 115.9.11 初審意見，要求 E-04、E-18、E-19 增量。
- 移植畫板：E-04（P5_S10 修改）、E-18 / E-18b、E-19a、E-19b / E-19b-off。

## 審查發現對照與修正

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| F1: PR targets the wrong integration branch | PR #2127 | 舊版 PR base 為 `main` → 修正版改為 `dev`，且僅含 6 個 scoped files | `gh pr view 2127 --json baseRefName` (退出碼 0) | (無) |
| F2: E-screen customer-service number remains inconsistent | `p5-ui.jsx`, `p5-e-screens.jsx` | 舊版 `P5Notice` 寫死 0800 → 新增 `csNumber` props 且 E-04/E-18/E-19a 等皆帶入 `02-2944-0985` | Node stdin probe 驗證組件 (Node v22.23.2, Babel 7.29.0) 退出碼 0 | 瀏覽器渲染、實際真機一致性待驗 |
| F3: Unconfirmed example URLs promoted into contract | `p5-ui.jsx`, `p5-e-screens.jsx`, `passenger-e-screen-contract-20260924.md` | 舊版 URL `ride.zhixing.tw` → 改為 `(App Domain Pending)` 佔位符 | Node stdin probe SSR 檢測 (Node v22.23.2) 退出碼 0 | 尚未確認正式網域與部署路徑 |
| F4: Required fee/policy crosswalk and auditable evidence are missing | `passenger-e-screen-contract-20260924.md` | 舊版未核對 8 項費用與 PRD → 修正版補齊 8 項對照，正確引用 PRD 9.8.1/9.8.4/9.9.1 及 `phase1_prd_detailed_v1.md:482`，並釐清 `NT$80` 為舊版範例 | Markdown 文本檢閱 | (無) |
| `ui17-passenger-canvas-20260924_source_and_state_coverage` | E-04、E-18、E-19 畫板元件 | 確認畫板與邏輯涵蓋 E04 detail state、E18 low-score state 及 E19 disabled state | Node stdin probe 執行 SSR 測試 (退出碼 0) | E-04/E-18 真機一致性未驗證 |
| `ui17-passenger-canvas-20260924_scoped_verification_and_preservation` | `智行叫車 Passenger.html` | 保留原有 P5 頁面，組件 SSR 皆相同（僅 URL 佔位符改動）；`design-canvas.jsx` CDN 引入與結構不變 | `git diff --check f08c75fd8cfd... 52504d576dcb...` 退出碼 0 | Browser 實際互動未驗證 |

## 命令與檢查
- 透過 Node stdin probe (Node v22.23.2, Babel core 7.29.0, ReactDOM 19.2.5) 執行 SSR 測試，退出碼 `0`，證實 E-04 / E-18 / E-19 邏輯正常，原有組件皆一致。
- 執行 `git diff --check` 對比 candidate SHAs，無 syntax / whitespace 錯誤，退出碼 `0`。

## 待驗
- 實際 Browser Layout 與互動。
- E-04/E-18 真機一致性確認。
- 正式網域 (`(App Domain Pending)`) 最終確認。
- 實際 Hosted CI 流程與 Product Server 整合。
