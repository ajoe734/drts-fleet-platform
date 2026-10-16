# OPS-COMPLAINT-REAL-RECEIPTS-20261016

客服案件操作完成後，原畫面用前端時間字串組出 `audit-...` 編號，連結也未讀取 Cloud Run 執行時提供的 Platform Admin 網址。因此「操作成功」無法直接查回同一次操作的真實後端稽核紀錄。本次補上這條功能接線。

## 行為

- 案件寫入仍回傳原本的 `data`，另外在 `meta.actionReceipt` 帶回同一次操作實際產生的 audit ID、request ID 及案件資源。原有 SDK 方法與同步 service 呼叫保持相容。
- 建立案件沿用現有冪等儲存的 receipt 欄位，重播回傳原操作的 receipt。已完成的關閉、解決及 SLA 標記不重複寫入案件事件；較早且不再保有原稽核紀錄的請求會產生明確的「已完成確認」紀錄。
- 一般案件匯出檢視讀取不產生額外事件；使用者明確按下「匯出案件視圖」時，回傳實際的匯出準備 receipt。
- 客服提示使用後端 receipt，跨應用連結讀取既有 runtime config 的 Platform Admin 網址。稽核頁依 audit ID 查詢實際資料庫，支援另一個 API 實例讀取；使用既有的存取規則。
- 不增加操作成功的等待條件。原有 audit writer、案件持久化與業務流程沿用；若舊版 API 完成操作卻未提供 receipt，SDK 明確回報「操作已完成但未回傳回執」，避免提示使用者再次提交。

## 驗證範圍

單元測試驗證實際 service/controller/SDK 與前端 presenter、並行操作的 receipt 對應、冪等重播、查詢及 runtime 網址。GitHub hosted PostgreSQL 測試另外驗證正式 migration 後的資料表、跨實例重播與冷啟動查詢。

既有 48 階段三方同單瀏覽器流程保留 0 retry 及原本時限。A 情境仍使用乘客建立的原訂單及遺失物案件，透過一般客服表單完成備註、指派、解決及關閉；新增逐次真實 receipt 查回、明確匯出後點擊原畫面連結，並檢查另一個 API 實例所服務的 Platform Admin 稽核頁。Shared dev 檢查沿用現有 Platform Admin 網址與已簽發的服務存取 token。

本機僅執行型別、lint、unit 及靜態檢查；資料庫、應用伺服器與瀏覽器驗收僅於既有 GitHub hosted／Cloud Run 流程執行。候選來源測試不代表已部署共享環境。

人員實際聯繫、失物交還、真實 SMS／GNSS／支付業者及道路行駛仍未獲得本次驗收。外部步驟依既有審查模式明確標示模擬；內部訂單、任務、付款紀錄、評分、案件與本次回執使用真正後端流程。
