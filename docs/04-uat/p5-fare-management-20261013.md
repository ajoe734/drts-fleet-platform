# P5 公開費率管理驗收

本項完成既有 `/platform-admin/p5/fares` 左側版本列表、右側預覽卡片與
建立／排程操作的正式接線。沿用平台版型及既有 `foundation:read`／
`foundation:write`，不新增角色或權限機制。

## 正式功能

列表及預覽讀取正式費率管理 API，顯示伺服器判定的生效狀態、全部計價
參數、來源、備查資料及生效區間。空資料、讀取失敗及載入中各自顯示；
讀取失敗不會回填舊示例，也不能繼續正式寫入。重新整理可重試讀取。

建立版本會複製所選版本的完整費率及具名附加費，要求新的 ID、名稱與
明確來源等草稿欄位；沒有可複製的正式版本時，金額及規則保持空白。
編輯僅適用伺服器允許的草稿。金額是整數新臺幣，不是分；夜間為每趟
固定金額。所有生效時間輸入與預覽明示台灣時間（UTC+08:00）。

實際備查操作記錄操作者提供的文號及證據識別；不代表已向主管機關
提交或驗證。已備查版本可排程未來時間，或由資料庫時鐘立即生效。
未來已發布版本保持「已備查」並顯示排程提示，直到實際生效。
現行及未來已發布區間須由替代版本接續；未發布草稿或已結束的歷史
版本，僅在伺服器允許時可填理由停用。

未完成的相同操作重試沿用同一識別，內容變更使用新識別。編輯保存
帶上開始編輯時的 revision；衝突保留輸入，重新整理不會把舊編輯基準
改成新 revision。操作者可比較最新資料後取消並重新開啟編輯。
保存成功但列表重讀失敗時，畫面明示「已儲存／讀取失敗」，保留已提交
回傳的版本並提供重試讀取，不會誤報保存失敗或自動再送變更。

## 操作驗收

以下正式寫入情境使用共享驗收環境的測試資料及操作帳號；VM 不啟動
產品、預覽、瀏覽器、資料庫或 Docker。後端真實交易測試交由 hosted CI。

| 情境           | 操作                                           | 預期                                                                |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| 列表與權限     | 以既有 foundation read 帳號進入費率頁          | 顯示正式版本；無 write scope 時正式變更控制不可提交                 |
| 真空資料       | 使用沒有版本的測試列表，按建立版本             | 空資料提示；沒有示例價格，自行輸入完整參數                          |
| 讀取失敗       | 模擬 API 讀取不可用，再按重試                  | 明確失敗、正式變更停用；恢復後顯示實際列表                          |
| 複製建立       | 選擇含多筆不同名稱附加費的版本，建立新草稿     | 所有參數和名稱完整保留；新 ID、名稱明確輸入，沒有複製備查核准       |
| 編輯衝突       | 開啟草稿後另一操作者更新，再保存               | 顯示衝突並保留輸入，不覆蓋最新版本；刷新不偷換編輯 revision         |
| 操作重試       | 第一次操作回應失敗，原內容重試，再修改內容重試 | 原內容用同一 key；修改內容用新 key；提交中不可重複點擊              |
| 保存後重讀失敗 | 保存已提交，隨後列表請求失敗                   | 同時明示已儲存和讀取失敗，顯示回傳版本；重試只讀取                  |
| 備查資料       | 草稿輸入實際備查文號與證據識別後保存           | 讀回文號、證據、記錄者及時間，未宣稱連線主管機關                    |
| 未來生效       | 對已備查版本輸入台灣時間後排程                 | API 收到一次換算的 ISO 時間；版本未提前啟用，現行費率仍在原區間生效 |
| 立即生效       | 對已備查版本按立即生效                         | API 使用 null，由資料庫時鐘決定生效點                               |
| 停用           | 在伺服器允許的草稿／歷史版本輸入理由           | 實際保存並讀回；現行或未來版本顯示替代接續說明                      |
| 切換競態       | 正式資料仍載入時進入示範，再返回正式資料       | 舊請求不能蓋掉示範或最新正式讀取；正式保存期間不能切換模式          |
| 雙語           | 中英文切換並開啟草稿表單                       | 欄位、狀態、操作、錯誤與示範文字完整翻譯，沒有裸露 translation key  |

## 外部備查示範及跳過

按「進入獨立示範」後，橫幅明示資料與時鐘均為示範，所有變更只在此
元件記憶體中。示範起始值依 2026-10-10 決定：85 元／1250 公尺、
5 元／200 公尺、5 元／60 秒、夜間每趟固定 20 元。

1. 建立示範草稿，填入新 ID、名稱、摘要及未來台灣時間。
2. 按「示範／重試外部備查」查看不可用訊息；可再次重試。
3. 按「示範中跳過外部備查」繼續。沒有填造文號、證據或正式核准。
4. 排程未來生效，確認尚未啟用；按推進示範時間，確認新版本啟用、
   原版本到期，再對原版本示範停用。
5. 重設示範清除所有示範變更；返回正式資料重新讀取正式 API。

以上示範流程不得呼叫任何正式 create/update/file/schedule/retire API。
外部備查連線、真實文號與證據仍由實際外部流程提供；示範不冒充完成。

## 自動驗證與界線

- `tests/unit/p5-fare-management-20261013/frontend.test.tsx`：實際 React
  元件及父頁，涵蓋讀取、scope 接線、全部操作、重試、衝突、提交後
  讀取失敗、模式競態、中英文及完整示範的零正式寫入。
- `sdk.test.ts`：七個 SDK 方法、完整 fee keys、proxy pathTransform、
  ISO/null 時間、revision、Idempotency-Key、伺服器回傳及錯誤傳遞。
- `model.test.ts`：完整複製、TWD、台灣時間轉換、輸入驗證及獨立示範
  時鐘與生命週期。既有 P5 disclosure／queue 斷言保留。
- `backend-*.test.ts`：後端服務與持久層交易邊界；
  `apps/api/tests/integration/p5-fare-management.integration.test.ts` 定義
  真 PostgreSQL 多連線、排程區間及 rollback 驗證，僅在 hosted CI 執行。

本文件記錄功能與可重現驗收流程；不宣稱 hosted DB、真實外部備查、
全系統瀏覽器 UAT 或正式上線已完成。

## 2026-10-13 Codex2 REOPEN：正式傳輸格式回歸

被退回的候選為 `42310415e1b7b47077fa4d174662ddf493c930f4`，review generation
為 `fd7dee7b5163451ebdb1e52693b340ad`。下列兩項均保留，不以既有的
camelCase mock 測試或先前 105 項通過結果取代正式傳輸驗證。

| Finding         | 舊候選的實際結果                                                                                                                                                                             | 修正與新驗證                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTO-WIRE-001` | 全域成功序列化器把 DTO 轉成 snake_case，七個新 SDK 方法卻直接回傳。UI 讀不到 `availableActions` 等欄位；`airportFee` 與 `airport_fee` 更在序列化時碰撞，資料已丟失，單純反轉大小寫無法還原。 | 費率專用 wire DTO 用 `additionalFeeEntries` 的 `{key, amount}` 陣列承載不透明名稱，再由 SDK 正規化 DTO 並重建完整費用 map。全域序列化器維持原狀。依序驗證七方法及實際畫面的讀取、複製、建立、讀回、編輯。 |
| `AUTO-WIRE-002` | 正式 `SnakeCaseExceptionFilter` 輸出 `trace_id`，SDK 只認 `traceId`，導致 409／503 退化成通用 HTTP error，丟失 code、trace、details 及 retryable。                                           | F1 通過後才修正 SDK error envelope 解析；接受正式 snake_case trace，保留既有 camelCase 相容性及原始 details。以實際 `ApiRequestError`／filter 經 SDK 到 UI 驗證衝突提示、保留輸入及同一操作重試。         |

在未修改 423 production 檔案時，新增傳輸測試的基準結果為 **10 failed／
1 passed**：F1 八個操作（七方法，排程含未來及立即）全部失敗；F2 實際
409／503 失敗；既有 camelCase error 相容測試通過。此結果屬實際失敗
證據；測試只替代 HTTP 和持久層，使用正式 controller、service、
`deepToSnakeCase` 與 exception filter，沒有啟動 API 或資料庫。

新測試的附加費同時包含 `airportFee`、`airport_fee`、`Airport_Fee`、
`night-fee`、`__proto__`，要求名稱與金額全部保留。實際元件測試使用
正式 `ApiClient` 消費序列化回應，再透過表單複製、保存及編輯；錯誤
測試使用 filter 的 mock response host，不自行編造 camelCase 錯誤。

機器證據保存在工作機 `.local/p5-fare-management-20261013/`：
`reopen-423-wire-baseline.json`／`.log` 保留原 SHA、原 production 檔案雜湊、
零 production diff 及失敗輸出；後續修正結果另記，不覆寫此基準。
新修正版的 immutable SHA 及最終結果由原 owner 完成正常 commit／review
後綁定，不能沿用被退回的候選當作通過。

本次修正的 repository-only 驗證結果：

| 檢查點                        | 結果                                                                                            | 證據                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| F1 修正後、F2 parser 尚未修改 | 9 passed；其餘 19 個測試由 `-t AUTO-WIRE-001` 刻意排除                                          | `reopen-f1-after.json`／`.log`      |
| F2 修正前（F1 已通過）        | 3 failed／2 passed；實際 UI 衝突提示與 SDK 的 409／503 metadata 仍失敗                          | `reopen-f2-before.json`／`.log`     |
| F2 修正後                     | 5 passed；其餘 23 個測試由 `-t AUTO-WIRE-002` 刻意排除                                          | `reopen-f2-after.json`／`.log`      |
| 最終相依測試                  | 16 files、143 tests 全通過，無 skip                                                             | `reopen-affected-tests.log`         |
| 原 owner 前端檢查             | app types、SDK types、實際 TSX test types、lint、格式、i18n、classification 及 diff checks 通過 | `reopen-frontend-verification.json` |

以上結果針對 423 基礎上的修正工作樹；不是新的 immutable candidate review。
修正後 SDK source SHA256 為
`141302507db56f81a1c7c10fb85057cd17834674139bd240bb7220037fe8da92`。
最終 receipt 同時記錄 source／test hashes，供 root 在正常提交後綁定新的
immutable SHA；舊 423 的 hosted 結果不自動沿用。

原 reviewer 的 51 項通過與前端測試無法解析 `react`／
`@testing-library/react` 的啟動失敗一併保留：當時前端 suite 並未執行，
不是產品行為通過或失敗的證據。原 owner 的安裝依賴環境可執行實際
元件測試；修正版仍須新的 reviewer 結果。

舊 423 候選的 hosted PostgreSQL 17 項結果已由 root 記錄為通過，
但候選已被退回，不能作為修正版驗收或發布依據。修正版 matching CI、
hosted PG、重新 review、合併與正式上線仍須分別完成；VM 不執行這些
產品或資料庫 runtime。

### CI-ALLOCATION-CONSUMERS

舊 423 的 CI 另外暴露兩個既有 migration allocation 消費測試漏列新增
`public_fare_management_allocations`：磁碟已有 V0118，但測試只計算到
最高已保留 V0117，因此兩項「磁碟 migration 不得超過保留範圍」斷言失敗。
原 owner 的基準重現為兩個檔案共 **56 passed／2 failed**，保存在
`allocation-consumer-baseline.json`。

root 已透過 supported Supervisor 流程把以下兩個既有測試納入原 task
scope，在既有各處 `allAllocations` 列舉補上
`public_fare_management_allocations` 群組：

- `tests/unit/system-remediation/sr-partner-notify-con-20260917/sr-partner-notify-con-20260917.test.ts`
- `tests/unit/system-remediation/sr-recovery-contracts-20260911/sr-recovery-contracts-20260911.test.ts`

所有原有 invariants／assertions、migration、ledger 及保留範圍規則均未
放寬或更動；這是讓既有檢查讀到原已配置的費率管理群組。root 唯一修改
並驗證這兩個檔案：最終 **58／58 passed、零 skip、exit 0**，證據為
`allocation-consumer-final.json`。中途第一次補列僅完成部分位置，曾有
57 passed／1 failed，保留在 `allocation-consumer-first-followup.json`，
未覆寫原始失敗歷史。最終 partner 測試的一處、recovery 測試的三處
既有群組列舉均已補齊。

這 58 項與前述 143 項沒有重疊，修正版合計 **201 項 scoped tests 通過**。
新候選仍須通過自己的 hosted CI，不能沿用舊 423 的結果發布。
