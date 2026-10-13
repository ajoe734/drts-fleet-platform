# 車行對帳確認與爭議

任務：`FLEET-STATEMENT-DECISIONS-20261013`。Owner：Codex；Reviewer：Codex2。

## 問題與既有規格

基準 `f9b1dd990762659e8b421d061cb26bcad42d7f27` 的車行對帳確認／爭議
只寫入瀏覽器 localStorage 並下載文字。其他裝置與後端無法讀回決定，
爭議也不會建立客服案件。確認反而要求備註，爭議卻可留白，與既定契約不符。

實作依據為 PR #1991 的
`support/unblock/SR-FLEET-SETTLE-001/SR-FLEET-SETTLE-001-UNBLOCK-PLANNING-DECISION.md`
「Decision」所定義的確認／爭議資料與端點，以及既有 Fleet 對帳畫面。
該文件另列的取消冲正金額計算不在本任務；本次保持既有金額及撥款行為。

## 行為

- 確認可附備註；爭議必須提供理由。成功後由 API 回傳並重新查詢正式紀錄。
- 已付款的對帳單不接受新決定；相同決定與內容重試回傳原結果，不新增案件。
  不同內容或相反決定不覆寫既有紀錄。
- 決定與當時對帳內容獨立保存；查詢月份所觸發的對帳重建不會刪除已保存決定。
- 爭議、客服案件與第一筆案件歷程使用同一資料庫交易。案件沿用既有財務
  客訴處理方式，並記錄實際車行與對帳單來源，能從原有案件頁讀取。
- 畫面沿用現有控制項，顯示送出中、實際結果與可重試的失敗訊息。
  舊 localStorage 值不再代表後端成功。CSV 繼續下載原有正式資料。

## Migration

`V0101` 已由其他功能使用，因此在原配號表追加
`V0117__fleet_statement_decisions.sql`，保存於
`billing.phase1_fleet_statement_decisions`。對帳單重建會刪除再寫入來源列，
故決定資料不依附於該列的刪除生命週期；保存原始快照與案件關聯。

## 驗證紀錄

本 VM 僅執行純單元、元件、型別與靜態檢查。實際 PostgreSQL 交易測試由
既有 GitHub CI integration 工作套用正式 migrations 後執行，沒有新增 CI gate。

| 驗收項                                  | 原始碼／案例                                                                           | 本機結果                                                                 | hosted 證據／限制                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 確認、爭議、重試、真實回讀及舊案件行為  | `tests/unit/fleet-statement-decisions-20261013/`、既有 Fleet 與 Complaint suites       | root 後端相關 50、API unit 36、前端／SDK 相關 39、Fleet app 21：全部通過 | 具體命令與 exit 0 在 `.local/fleet-statement-decisions-20261013/`；沒有真實供應商操作             |
| 重建後保存、多實例、paid 狀態及交易回滾 | 正式 V0117、`apps/api/tests/integration/fleet-statement-decisions.integration.test.ts` | TypeScript／lint 通過；15 個案例未在 VM 執行                             | 由同候選 PR 的既有 integration 工作實際套用 migrations 並執行，結果以該 SHA 的 GitHub checks 為準 |
| 配號與共用契約相容                      | 既有 recovery-contracts／partner-notify-contracts suites                               | 58 通過                                                                  | 原配號值保留，新增 V0117，不取代實際 DB 測試                                                      |
| 靜態檢查                                | API／Fleet／SDK／root TypeScript、scoped ESLint、i18n、classification、diff check      | 全部通過                                                                 | hosted build／CI 與獨立審查另由既有 candidate lifecycle 記錄                                      |

相關回歸共 204 項本機通過。原失敗與修正證據也保留於同一 `.local` 目錄：

- 既有 repository 測試假定第二個 SQL 必為 DELETE；新增交易讀取／鎖定後，
  改為驗證 BEGIN、正確車行的 DELETE、INSERT、COMMIT 次序及參數。
- 既有 service mock 補齊正式 repository 新讀取介面；Complaint controller
  因需等待 DB 回讀改為 async，舊測試改為 await 與 rejects，保留案件結果斷言。
- Fleet 供給文件測試用今日時間判斷固定 2026 年 8 月到期資料，原本為
  20 通過／1 失敗。只在該測試固定 Date 為 8 月 1 日，驗證精確到期文件 ID，
  修正後 21 通過；未更動供給產品邏輯。
- 新增讀回測試確認已決定的金額快照不被 clone 的再計算改動，並確認最新
  paid 狀態不被舊快照或月份重建覆蓋。

候選 SHA、獨立審查、hosted PostgreSQL 與完整 CI 結果以本任務的正式
candidate lifecycle／同 SHA PR checks 為準。本機通過不表示真實供應商、
正式環境或全系統驗收完成。
