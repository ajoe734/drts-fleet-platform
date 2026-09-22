# 夥伴 App 乘車通知接入規格

版本：1.0　日期：2026-09-17
適用：由 DRTS referral-embed 進行乘車服務的合作 App。
本檔為本次新增的接入合約，不表示夥伴已實作。工程內部細節另見 01_system_sa_sd.md。

## 1. 要交付的功能

夥伴提供一個可接收 HTTPS POST 的通知端點。其流程必須是：驗章 → 驗證 entry/recipient → durable inbox 去重入列 → 回 DRTS 接受回執 → 夥伴使用既有原生推播 → 點擊通知後重新核身並打開該趟行程。

DRTS 不取得原生 device token／APNs／FCM 憑證。夥伴不要將入站 DRTS 的 API key 當作出站 webhook HMAC secret；兩方向的密鑰分離，開發與正式環境也分離。

## 2. 事件

- passenger.assignment_disclosure_ready.v1
- passenger.assignment_replaced.v1
- passenger.eta_changed.v1
- passenger.driver_arrived.v1
- passenger.receipt_ready.v1

端點測試另用 passenger.notification.test.v1，不能推送到真住戶。未知 major version 拒絕，不把不同格式猜成 v1。已知 major 的可選欄位可忽略，未知 event 不自動訂閱。

## 3. 請求 headers 與驗章

```text
Content-Type: application/json
x-drts-event-type: passenger.driver_arrived.v1
x-drts-tenant-id: <該端點的 tenant>
x-drts-webhook-delivery-id: <固定 delivery id>
x-drts-webhook-signature: v=<secretVersion>;t=<ISO8601>;sig=<hex>
```

使用既有 DRTS webhook 的 HMAC：

```text
HMAC-SHA256(secret, UTF8(timestamp + ".") || raw_HTTP_body_bytes)
```

先保存原始 body bytes 驗章，再 JSON parse；不可 parse 後重排 JSON 或自行 camelCase 化再驗。wire keys 為 snake_case。比對簽章使用 constant-time。允許簽章時間差 300 秒；時鐘應同步。secret rotation 依已約定版本與 overlap，過期／撤銷版本拒絕。重試簽章時間可以更新，通知 ID、delivery ID 與 body 不變。

## 4. Body 範例

見 examples/notification.json。根 envelope 沿用 event、delivery_id、occurred_at、tenant_id、data。

recipient.partner_user_ref 是本 entry 由夥伴原 handoff 提供的不透明使用者參照；請以 entry + partner_user_ref 查找住戶，不是只以電話或顯示姓名匹配。

navigation.ride_ref 只是定位這趟行程的 opaque reference，不是登入 token；取到此 reference 不能繞過住戶核身。

推播文案採通用句，例如「司機已抵達，請開啟 App 查看上車資訊」。預設不在鎖定畫面揭露車牌、住址、乘客／司機姓名、執登、付款等資料。完整乘車資訊在已授權 WebView 顯示。

## 5. 接收與回執

接受順序：

```text
verify signature and scope
→ DB transaction: insert unique notification id + payload hash + pending native delivery
→ commit
→ HTTP 202 + accepted receipt
```

成功回應範例見 examples/accepted.json。必要欄位：schema_version、notification_id、delivery_id、partner_entry_slug、receipt_id、status。200/201/202 均可，但內容必須相符；204 不是本合約的成功。

重送：同 notification_id + entry、相同 payload 時，回原 receipt_id、status=duplicate；不得另產原生通知。相同 ID 但 payload hash 不同回 409 並告警。dedupe key 至少保留 30 日，長於本版本最長 7 日的通知有效期。dedupe 與原生投遞入列必須同交易，不能只去重請求而漏掉真正推播。

receipt 代表貴系統接受交接，不表示手機收到。不得先回 202 再嘗試持久化。未取得 durable storage 時應回 503。

## 6. 失敗回應

| 回應 | 意義 |
|---|---|
| 401/403 | 憑證／簽章／entry 未被授權 |
| 404/410 | 端點或接入已移除 |
| 422 | 收件參照不存在／已撤銷，或資料不符 |
| 429 | 限流，DRTS 按核准 policy 延後 |
| 500/502/503/504 | 暫時失敗 |
| 409 | 同 ID 不同 payload，不能當去重成功 |

DRTS 每次預設 10 秒 deadline，包含本通知 ack body；body 上限 4 KiB。使用 durable queue 後立即回應，不等 APNs/FCM 或住戶開啟。超過有效期的通知不再原生彈出。

## 7. 次序與時效

notification_id 去重。event_sequence 為每趟由 DRTS 分配的遞增序號，assignment_version 表示改派代次；後者不能代替事件序號。

相同類別／同改派代次的 ETA 更新只顯示最新版本；舊派車／舊到場不得覆蓋新版行程狀態。receipt_ready 是獨立的完成後訊息，不因另一類晚到事件而被誤刪。實際需要呈現車牌或行程狀態時讀 DRTS 最新權限內的資料。

expires_at 預設：派車／改派 10 分鐘，ETA 2 分鐘，到場 5 分鐘，收據 7 日。原生平台 ttl 不可超出剩餘有效期。

## 8. 點擊通知

1. App 仍登入同一住戶：確認 entry 與登入 subject。
2. 若已登出或切換住戶：先要求原 App 完成登入，不可沿用舊 WebView cookie。
3. 夥伴 backend 呼叫受保護的 notification-navigation/resolve，帶原 entry、ride_ref 與驗證後的 partner_user_ref。
4. 取得短期 single-use handoff，走既有交換流程。
5. 開啟該住戶該 entry 的行程；DRTS 以正式 order 資料決定當前狀態。

不能把 URL query 裡的住戶 ID 當身分證明。URL／通知不得放 DRTS bearer token、cookie 或長效 handoff。點擊失敗不新建訂單。

## 9. 試行驗收

先測 sandbox 帳戶與端點，再測實際夥伴測試 App。

必測：前景、背景、鎖屏、冷啟動、關閉通知、網路暫斷、session 過期、切換帳戶、兩 entry、改派舊通知、receipt 點擊。雙平台產品要測 iOS 與 Android。

交付：通知 ID、夥伴 receipt ID、原生推播受理紀錄（如可取）、App 版本、OS、測試時間、裝置收到／點開錄影，以及跳轉正確行程的證據。遮罩個資、不得分享密鑰。

沒有裝置資料時只可標「夥伴端點已接受」。首版不要求每一筆回傳裝置送達／開啟 callback；需要此功能時另行版本化，不以 200/202 推論已讀。
