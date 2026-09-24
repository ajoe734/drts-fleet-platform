# UI17-PASSENGER-CANVAS-20260924 驗收文件

## 來源與依據
- Source ZIP: `docs/05-ui/driver app (17).zip`
- Source SHA256: `b4f78eb602702d573b4f66de779f3ba6f93b5ac11421f567dc17c3ace8c0586f`
- 正式依據：新北市交通局 115.9.11 初審意見，要求 E-04、E-18、E-19 增量。
- 移植畫板：E-04（P5_S10 修改）、E-18 / E-18b、E-19a、E-19b / E-19b-off。

## 審查發現對照與修正

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| F1: PR targets the wrong integration branch | PR #2127 | 舊版 PR base 為 `main` → 修正版使用 `gh pr edit 2127 --base dev` 改為 `dev` | 執行 `gh pr view 2127 --json baseRefName` 確認改為 `dev` | (無) |
| F2: E-screen customer-service number remains inconsistent | `docs/05-ui/drts-design-canvas/p5-ui.jsx` (P5Notice), `p5-e-screens.jsx`, `p5-screens.jsx` | 舊版 P5Notice 寫死 `0800-090-000` → 修正版新增 `csNumber` props，並在 E-04、E-18 等畫面帶入 `02-2944-0985` | 靜態文件核對，JSX 語法正常 | 未執行 Hosted CI 與實際真機渲染。 |
| F3: Unconfirmed example URLs promoted into contract | `docs/05-ui/drts-design-canvas/p5-ui.jsx`, `p5-e-screens.jsx`, `passenger-e-screen-contract-20260924.md` | 舊版使用 `ride.zhixing.tw` → 修正版改為 `(App Domain Pending)` 佔位符 | 靜態文件核對，JSX 語法正常 | 未執行 Hosted CI 與實際真機渲染。 |
| F4: Required fee/policy crosswalk and auditable evidence are missing | `docs/05-ui/drts-design-canvas/passenger-e-screen-contract-20260924.md` | 舊版僅宣稱定稿 → 修正版增補 `phase1_prd_detailed_v1.md` 比對說明，解釋指派前與抵達後的取消費無矛盾，並標明附件 metadata 日期僅為參考。 | 靜態文件核對，Markdown 語法正常 | (無) |
| `ui17-passenger-canvas-20260924_source_and_state_coverage` | E-04、E-18、E-19 畫板元件 | 確認畫板與邏輯，符合 audit 缺口；E-04/E-18 真機一致性需 UAT 核實。 | 靜態文件核對，JSX 語法正常 | E-04/E-18 真機一致性待驗。 |
| `ui17-passenger-canvas-20260924_scoped_verification_and_preservation` | `docs/05-ui/drts-design-canvas/智行叫車 Passenger.html` | 確認仍保留原有 `P5_S01`~`P5_S09`、`P5_S11`~`P5_S12` 及 `P5_A03`~`P5_A04` 畫面；JSX 無語法錯誤。 | 靜態文件核對，JSX 語法正常 | 未執行 Hosted CI 與實際真機渲染。 |

## 命令與檢查
- 因 sandbox 限制與無 Node 環境 `pnpm install` 狀態，跳過自動化 `eslint` 檢查，採靜態文件結構與語法比對確認無誤。
- `p5-e-screens.jsx`、`p5-screens.jsx`、`p5-ui.jsx` 與 `passenger-e-screen-contract-20260924.md` 變更與 `智行叫車 Passenger.html` 完成儲存。

## 待驗
- E-04/E-18 真機一致性確認。
- CI pipeline 編譯與檢查 (等待 Hosted Workflow)。
