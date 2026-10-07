# PUSH-FIRST-PARTY-FCM-20261006 — 第一方 FCM HTTP v1 傳輸

## 實作內容

本 task 實作了第一方 FCM HTTP v1 傳輸機制，主要功能如下：

1. **資料表定義與資料結構**：
   - 透過 migration 建立 `FirstPartyPushDeliveryContext` 專用表格。
   - `FirstPartyPushDeliveryContext` 採用不可變設計（immutable snapshots），包含裝置清單、wire payload 以及投遞紀錄。
   - 裝置清單僅儲存 `tokenSha256`，維持系統對外部推播 token 的遮蔽性與安全性，原始 token 僅在實際送出前解析。

2. **FCM Push Provider**：
   - 實作 `FcmFirstPartyPushProvider`，對接 `https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`。
   - 使用 `GoogleMetadataTokens` 處理存取權杖（Access Token），不增加 service account 或 firebase-admin 依賴。
   - 依據文件與需求完整處理 FCM 回傳之錯誤碼：
     - `404 UNREGISTERED`、`400 INVALID_ARGUMENT`、`403 SENDER_ID_MISMATCH` → 判為 `invalid` 並標記裝置。
     - `401`、`THIRD_PARTY_AUTH_ERROR` → 判為 `credential_rejected` (configuration_blocked)。
     - `429`、`500`、`503` 等暫時性錯誤 → 解析 `Retry-After` 並標記為 `transient` 以進行重試。

3. **第一方 Notification Transport**：
   - 實作 `FirstPartyNotificationTransport` 接入推播派發的骨架。
   - 於第一次嘗試時取得並鎖定有效的 active devices，往後重試只針對 context 內已記錄且未標記為失效的裝置。
   - 訊息送出前攔截檢查路由是否仍有效（如訂單已取消等過時狀態則直接中斷）。
   - 若至少一個裝置成功收到 FCM 接收確認，則整體狀態視為 `delivered`，並使用 FCM 的 message name 作為 receipt。
   - 完全受到 `PASSENGER_PUSH_FIRST_PARTY_ENABLED` 旗標與專案 ID 變數防護，未開啟時快速回傳 `configuration_blocked`。

4. **相容性與隔離性**：
   - 新增機制不影響原有的 Partner Notification 通道。
   - 提供 mock / stub 測試覆蓋，確保在沒有外部網路的 CI 環境中正確執行 FCM HTTP 請求模擬。

## 驗證證據

- Unit Tests: 補足針對上述 FCM 錯誤碼、重試邏輯、多裝置發送場景的驗證，測試不涉及真實對外網路連線。
- Reviewer checks: 程式碼符合 UAT 文件要求與架構。
