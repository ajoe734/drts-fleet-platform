# SR-NOTIFY-001 — 共用郵件 transport 與耐久 receipt

- Owner: Codex; independent reviewer: Codex2.
- Branch: `codex/sr-notify-001`.
- Initial base: `afefd55d3d23dd361d2dd81fd5f80eedb6671002` (`git fetch origin` 後 HEAD = origin/dev).
- Candidate: 尚未 handoff；完成後以 machine truth `candidate_sha` 為準。

## 目前基準重現與來源

`TenantInvitationDeliveryService.send` 和 `AuditNotificationEmailAdapter.send` 都只向 process-local array 寫入 `sentAt` 並 log；沒有網路傳輸。`tenant-partner.service.ts` 隨後寫入 `delivered`。現有 base 尚未修復 N06/N07。

追溯：`source/new-gaps.json` N06/N07；`source/capabilities.json` C006（邀請）、C026（簽核）、C061（證照提醒）、C079（帳單）。本次交付共用核心，不宣稱上述業務 adapters 已接入。

Provider/config 盤點：`.env.example` 的 `MAILPIT_SMTP_PORT=1025` 與 `docker-compose.dev.yml` 的 `axllent/mailpit:v1.26.3` 是既有受控 receiver；未找到 SMTP client、外寄 provider 或其 credential。沿用 Mailpit；不選購第三方服務、不假設未設定的 provider 可用。

資料模型盤點：現有 webhook、consumer order、SOS、driver completion outbox 都有各自外鍵與業務語意，不能挪作郵件資料表。本 scope 沒有 migration；PostgreSQL 新表須由 supervisor/SR-CONTRACT 擴 scope 與分配 migration 後接入。

## 核心設計與交付界線

- `NotificationDeliveryService` 提供 enqueue/get/dispatch/drain；一個 tenant + idempotency key 對應一個 recipient 與不可變 payload。重複 enqueue 回原 receipt，變更內容則拒絕。
- `queued` 只表示已耐久排隊；`sent` 必須有實際 provider acknowledgement；`failed` 有持久化 attempt、retryability、下一次時間及次數上限。沒有 provider 時 availability 為 unavailable，dispatch 記錄 failed，沒有 sentAt。
- `FileMailOutbox` 要求明確的絕對目錄，使用原子 rename、file/directory fsync 與 Linux `flock`。程序死亡會釋放鎖；每個 attempt 在網路呼叫前落盤。沒有記憶體 fallback；壞檔與不可寫 storage 拒絕操作。
- 適用同一主機的耐久 POSIX volume，所有 writer 都必須透過 repository；不宣称 ephemeral container filesystem、NFS 或多主機 durability。目錄與內容含收件資訊、邀請連結等敏感資料，僅供內部存取，不當 HTTP response 或 info log；新建目錄 0700、狀態檔 0600。
- `MailTransport` 可注入；本機 Mailpit transport 只接受 loopback address 和明確 port，SMTP 最終 DATA 250 才是 provider acceptance。SMTP acceptance 並不代表正式 inbox delivered。
- 租約逾時可恢復，上一筆 attempt 記 uncertain；stable Message-ID 隨 retry 保留。SMTP 在 provider 接受後、receipt commit 前 crash 可能重複收信，屬 at-least-once；Message-ID 不是 provider 去重保證，不宣稱 exactly-once。
- restart 後呼叫 drain 恢復 due work；排程與既有 adapter/root module 接線由後續任務負責。本核心不啟動隱藏 timer。

## 驗證

實作中；尚未將測試或 live acceptance 記成成功。

尚未執行：正式 provider credentials、外部收件匣、正式邀請啟用鏈、簽核/證照/帳單業務接線、部署排程、跨主機 persistence。分別保留 SR-MAIL 等整合任務及 SR-LIVE-MAIL-001 外部 gate。
