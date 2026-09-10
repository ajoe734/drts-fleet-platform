# SR-NOTIFY-001 — 共用郵件 transport 與耐久 receipt

- Owner: Codex; independent reviewer: Codex2.
- Branch: `codex/sr-notify-001`.
- Initial base: `afefd55d3d23dd361d2dd81fd5f80eedb6671002` (`git fetch origin` 後 HEAD = origin/dev).
- 實作驗證 SHA: `5b037d00d455eef7c2bbb5152ca7102068af7206`；最後 evidence commit 僅更新本文件。最終 candidate SHA 由下列 handoff 寫入 task machine truth（文件不能包含自身 commit hash）。

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
- 遲到但有效的 acknowledgement 仍保存到原 attempt；不得因租約已被取代而丟失。已有 acceptance 的 delivery 也不會被後來的 retry failure 降回 failed。

後續 adapter 可直接 import `NotificationDeliveryModule.register({ outbox, transport })`，由 Nest 注入 `NotificationDeliveryService`。`fromEnvironment(env)` 使用明確的 `NOTIFICATION_OUTBOX_DIRECTORY` 與既有 `MAILPIT_SMTP_PORT`；缺 storage 會拒絕啟動，缺 SMTP 設定時 provider unavailable。正式 provider 可實作 `MailTransport` 注入。呼叫端須先做 tenant authorization，並為每個業務事件／recipient 選擇穩定的 idempotency key；resend 若內容改變須使用新的業務 key。預設 lease 60s、SMTP deadline 5s；自訂 transport deadline 應小於 lease。

## 驗證

2026-09-06 UTC，於上述實作 SHA 的 isolated worktree 執行：

| 指令                                                                                                                                                                         | Exit | 實際結果                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------- |
| `git diff --check`                                                                                                                                                           | 0    | 無 whitespace errors                        |
| `pnpm --filter @drts/api typecheck`                                                                                                                                          | 0    | 無 TypeScript errors                        |
| `pnpm exec vitest run tests/unit/system-remediation/sr-notify-001/`                                                                                                          | 0    | 3 files / 42 tests passed；06:23:39，15.16s |
| `pnpm exec eslint apps/api/src/modules/notification-delivery tests/unit/system-remediation/sr-notify-001 --max-warnings=0`                                                   | 0    | 無 errors/warnings                          |
| `pnpm exec prettier --check apps/api/src/modules/notification-delivery tests/unit/system-remediation/sr-notify-001 docs/04-uat/system-remediation-20260906/SR-NOTIFY-001.md` | 0    | All matched files use Prettier code style   |

42 tests 包含：17 個實際 TCP receiver 測試、23 個 service/durable-store 回歸、2 個獨立 Node process 測試。四個程序 concurrent enqueue 只產生一筆 durable key；worker 在 started attempt 落盤後被 SIGKILL，重新建立 service 後將舊 attempt 記 uncertain 並恢復。其餘故障注入涵蓋無 provider、4xx/5xx、斷線、總 deadline、MIME/注入、多行/分片回覆、重试上限、跨租戶隔離、corrupt storage、送出前/接受後 fsync failure、遲到 ack 與輸入變更。注入 provider 的單元測試不充作真實收件證據。

環境／初期檢查紀錄：base typecheck exit 0；中途 typecheck 曾因 shared workspace 的 `@drts/control-plane-auth` declaration 不存在而 exit 2，執行 `pnpm --filter @drts/control-plane-auth build` exit 0 後恢復。一次 scoped ESLint exit 1（控制字元 regex 與測試未用參數）已修復。一次 Prettier exit 254（shared node_modules/.bin 短暫沒有 prettier），重試後 exit 0；沒有更改 manifest、lockfile 或共用 source。

## 真實 Mailpit receiver 證據

Compose 宣告 v1.26.3，但本機已載入並運行的是 `axllent/mailpit:v1.30.6`（image `sha256:7f33095f80e901f6ad08028f06ca284aa58fe84942be5496008d041d3b9f4d4d`）。驗證使用同一已存在 image 的 task 專屬 container，不讀共用 mailbox、不聯絡外部人員。

```bash
docker run --detach --rm --name sr-notify-001-mailpit \
  --publish 127.0.0.1::1025 --publish 127.0.0.1::8025 axllent/mailpit:v1.30.6
docker port sr-notify-001-mailpit
# 1025/tcp -> 127.0.0.1:32768; 8025/tcp -> 127.0.0.1:32769

NOTIFICATION_OUTBOX_DIRECTORY=/tmp/sr-notify-001-mailpit-outbox \
MAILPIT_SMTP_PORT=32768 SR_NOTIFY_MAILPIT_HTTP=http://127.0.0.1:32769 \
pnpm --filter @drts/api exec tsx ../../tests/unit/system-remediation/sr-notify-001/verify-mailpit.ts
```

以上指令 exit 0。Container ID: `5ae5cd98035bb17ebc93c3fc45cac0336d66320d0283a5db930a2a1ddaad369c`。

最後一次驗證（06:23:48 UTC）實際 receipt：

```json
{
  "deliveryId": "1e23904d-6730-4a3d-a926-b06bbaa7473b",
  "messageId": "<1e23904d-6730-4a3d-a926-b06bbaa7473b@notification.drts.invalid>",
  "idempotencyKey": "712d0d9d-5250-4dda-af41-cccb47146e1e",
  "attemptId": "57fb5d5b-a13f-4395-9710-813aef79f728",
  "status": "sent",
  "acknowledgement": {
    "provider": "mailpit-smtp",
    "response": "250 2.0.0 Ok: queued as 2zIKyOwP2boJb8L3yo8Otq",
    "providerMessageId": "2zIKyOwP2boJb8L3yo8Otq",
    "acceptedAt": "2026-09-06T06:23:48.126Z"
  },
  "receiverMessageId": "2zIKyOwP2boJb8L3yo8Otq",
  "matchedRecipientSubjectAndBody": true,
  "durableReceiptAfterRestart": true,
  "deduplicatedAfterRestart": true,
  "receiverTotalMessages": 2
}
```

HTTP `/api/v1/message/2zIKyOwP2boJb8L3yo8Otq` 回 200，message bytes 解碼後 recipient、中文 subject/body 及 stable Message-ID 全部一致。最後一次驗證前已有一筆先前受控驗證訊息 `7Xs9tRh539jKbngGSgL3QE`，所以 mailbox total 為 2；script 斷言重複 enqueue/dispatch 前後 count 不變，並回讀相同 durable receipt。測試用 `/tmp` spool 只證明本機 durable I/O/restart；部署時須設定持久 volume。

## Candidate handoff

先 anchor `c20a5f27c` 與 `24d7ee02d`，均已普通 push；實作及 evidence 完整 commit 後再普通 push，使用：

```bash
CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=$(git branch --show-current) \
AI_NAME=Codex /home/lupin/drts-fleet-platform/.artifacts/releases/orchestrator-99f7e0e56/tools/development-orchestrator/bin/ai-status.sh \
  handoff SR-NOTIFY-001 Codex2 "durable mail core verified; see task evidence"
```

精確 candidate SHA、branch、reviewer 與 state 以同一 release 的 `ai-status.sh show SR-NOTIFY-001` 讀回。owner 不寫 done；獨立 review、同 candidate CI 及 merge 尚待 lifecycle 完成。

尚未執行：正式 provider credentials、外部收件匣、正式邀請啟用鏈、簽核/證照/帳單業務接線、部署排程、跨主機 persistence。分別保留 SR-MAIL 等整合任務及 SR-LIVE-MAIL-001 外部 gate。
