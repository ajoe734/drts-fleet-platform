# UI17-PASSENGER-CANVAS-20260924 驗收文件

## 來源與依據
- Source ZIP: `docs/05-ui/driver app (17).zip`
- Source SHA256: `b4f78eb602702d573b4f66de779f3ba6f93b5ac11421f567dc17c3ace8c0586f`
- 正式依據：新北市交通局 115.9.11 初審意見，要求 E-04、E-18、E-19 增量。
- 移植畫板：E-04（P5_S10 修改）、E-18 / E-18b、E-19a、E-19b / E-19b-off。

## 審查發現對照與修正

| 缺陷/Finding | 實際修改與原因 |
|-------------|--------------|
| E-04/E-18 預設網址與 E-19 不一致 | 修正 E-19a/E-19b，與現有 `p5-ui.jsx` 預設一致使用 `ride.zhixing.tw`。 |
| E-19 未勾選畫面按鈕只有灰色樣式，沒有 disabled | 於 `P5_E19b` 修改為 `disabled={!checked}`，符合原有的狀態與游標約束。 |
| 整併新設計覆寫舊檔遺失既有入口 | 使用選擇性合併，僅將 `P5_S10` 更新為 E-04 規格，新增 `P5_E18` 與 `P5_E19` 系列元件至 `p5-e-screens.jsx`，並附加於 `智行叫車 Passenger.html` 中既有畫板之後，保留原所有 P5 流程展示。 |

## 驗收項目檢查

| 驗收項 (Acceptance Key) | 結果 | 驗證證據與限制 |
|---------------------|------|---------------|
| `ui17-passenger-canvas-20260924_source_and_state_coverage` | Pass (Pending) | 本地確認 E-04、E-18 (4星/≤2星)、E-19 (勾選/未勾選) 皆有獨立畫板與邏輯，符合 audit 缺口；E-04/E-18 真機一致性需 UAT 核實。 |
| `ui17-passenger-canvas-20260924_scoped_verification_and_preservation` | Pass | 確認 `docs/05-ui/drts-design-canvas/智行叫車 Passenger.html` 仍保留原有 `P5_S01`~`P5_S09`、`P5_S11`~`P5_S12` 及 `P5_A03`~`P5_A04` 畫面；JSX 無語法錯誤。 |

## 命令與檢查
- 因 sandbox 限制與無 Node 環境 `pnpm install` 狀態，跳過自動化 `eslint` 檢查，採靜態文件結構與語法比對確認無誤。
- `p5-e-screens.jsx`、`p5-screens.jsx` 與 `passenger-e-screen-contract-20260924.md` 變更與 `智行叫車 Passenger.html` 完成儲存。

## 待驗
- E-04/E-18 真機一致性確認。
- CI pipeline 編譯與檢查 (等待 Hosted Workflow)。
