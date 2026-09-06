# SR-MAIL-001 — 邀請傳輸修復進度與驗證

日期：2026-09-06。Owner：Codex2。Reviewer：Codex。

**目前為待擴 scope 的 WIP，不是完成／部署／驗收結案。** 已普通 push 保留範圍內實作；未呼叫 handoff／done，沒有鎖定 candidate。

Draft PR：[1679](https://github.com/ajoe734/drts-fleet-platform/pull/1679)。公開供 supervisor 檢視範圍內 WIP；不是 handoff。

## 版本與追溯

- 初始及最後 fetch 的 `origin/dev` base：`2093cf7e38526a7a7c027600be92004f7275efd3`。
- 本文件記錄的實作／測試 SHA：`3fc11249c5b4576b1c5df66b27e3ad109c79f2f4`，branch `codex2/sr-mail-001`。後續 evidence-only commit 的完整 HEAD 另寫入 machine-truth blocker；此 SHA 是可重現的 WIP，**不是 locked candidate**。
- Candidate SHA：未建立（scope blocker）；review／candidate CI／merge 尚無證據。
- SR-NOTIFY-001 merge `3014f9a4942f73f89c0a6f8458dc8b042c1034d0`、SR-REFERRAL-001 merge `503f36015adc084e75ee33e5a866525b5c7d72c6` 均由 `git merge-base --is-ancestor <sha> HEAD` 確認，exit 0。兩 task machine status 都是 done。
- 來源：`source/new-gaps.json` N06、`source/capabilities.json` C006、`docs/03-runbooks/system-remediation-20260906/SR-MAIL-001.md` 及主 execution rules。歷史 audit `08b7a32…` 未作本次程式基準。

## 基準重現

在目前 worktree 暫時以 `git show 2093cf7e38526a7a7c027600be92004f7275efd3:<path>` 還原兩個 invitation service 檔，執行初版的：

```bash
pnpm exec vitest run tests/unit/system-remediation/sr-mail-001/
```

exit **1**：1 test failed，`expected 'delivered' to be 'delivery_failed'`。測試建立 `sr-mail-unavailable` 邀請而未配置 transport。基準 logger 僅輸出 `Queued tenant invitation ...`，卻將 canonical invitation 寫成 delivered。重現脚本以 `finally` 還原工作內容，未使用 stash。

## 已實作

- Nest factory 建立 invitation adapter，重用 SR-NOTIFY 的 `NotificationDeliveryService`、`FileMailOutbox` 及既有 loopback Mailpit transport。
- 邀請專屬 spool：`<NOTIFICATION_OUTBOX_DIRECTORY>/tenant-invitations`。沿用私人目錄、0600 spool、flock、fsync、retry lease 與 provider receipt；無記憶體成功 fallback。
- 穩定 key `tenant-invitation:<invitationId>`，重寄採新 invitation ID；同邀請的重複 send 沿用 receipt。
- 每次 transport send（包括重啟 retry）以 token hash 查 canonical invitation，檢查 tenant、收件人、invitation ID、已用／撤銷／過期；失效時記不可重試失敗，不再寄信。
- module 初始化立即 drain，之後每秒 drain，避免同實例 drain 重疊；destroy 清除 timer。
- 原始 token 僅在私人 spool／SMTP body 的 HTTPS URL fragment 中；API result、diagnostic receipt、一般 log 不含 token。未把 token 放入 URL query。
- 不再因 send 返回而寫 delivered。缺少 spool／sender／acceptance URL 時 invitation 記 delivery_failed；已配置時保留 pending_delivery，精確 queued/sent/failed 與 retry 記於 outbox。
- 不在網路 I/O 後 upsert 舊 invitation 快照，避免完成寄送時覆蓋並行的 revokedAt／acceptedAt。
- 重寄改查 `findPendingInvitationByMembershipId`，避免時間戳相同時挑到舊的撤銷紀錄。

`listDeliveries()` 只保留最多 100 筆安全診斷觀察，**不是耐久 authority 或完整查詢 API**。send 不會將 delivery content 回傳。

## 必須由 supervisor 協調的剩餘範圍

1. **Acceptance 網頁缺失。** 目前只有既有 `POST tenant/invitations/accept`；tenant-console 沒有讀取 fragment 並呼叫該 API 的頁面。本次 write_scopes 不含 frontend 或 controller。須 supervisor 擴 scope／加相依或建立頁面 producer，確認部署後的真 URL，才可配置 `TENANT_INVITATION_ACCEPT_URL`。本次測試 `https://acceptance.example.test/invitation` 只用於解析 fragment，沒有宣稱該網址可開啟或完成 UI 流程。
2. **Public delivery contract 缺 sent。** `packages/contracts/src/index.ts` 的 enum 只有 pending_delivery／delivered／legacy_backfill／delivery_failed。本次不能修改 shared contract。應由 SR-CONTRACT owner 協調新增 provider accepted 狀態／durable receipt 查詢契約，並用不覆蓋 lifecycle 欄位的原子更新或讀取投影接線。目前失敗後成功重試的真值在 durable outbox；public invitation 保持 pending_delivery，不能完整表達傳輸進度。
3. 缺設定時沒有 durable message 可恢復；管理者補設定後須 resend 產生新 token。歷史假 delivered 紀錄沒有回填，不能推定舊資料有真送達證據。

上述第 1、2 項已用目前 Supervisor release 的 `ai-status.sh progress` 提出，不自行擴寫 shared files。WIP 不宜直接合併為完整租戶邀請能力。

## 實際命令結果

| 命令                                                                                                                                                          | Exit | 結果                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- |
| `git diff --check`                                                                                                                                            | 0    | 無 whitespace error                                                                 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-mail-001/`                                                                                             | 0    | 最終必要指令：1 file，8 tests passed（571279559b5506d8f730be546913321d73d1e07d）    |
| `pnpm exec vitest run tests/unit/system-remediation/sr-mail-001/ tests/unit/tenant-invitation-lifecycle.test.ts`                                              | 0    | 2 files，10 tests passed                                                            |
| `pnpm exec vitest run tests/unit/system-remediation/sr-mail-001/ tests/unit/tenant-invitation-lifecycle.test.ts tests/unit/system-remediation/sr-notify-001/` | 0    | 5 files，52 tests passed；含 shared outbox 子程序 durability 與 SMTP protocol tests |
| `pnpm --filter @drts/api typecheck`                                                                                                                           | 0    | 通過，先建好 workspace dependency                                                   |
| `pnpm --filter @drts/control-plane-auth build`                                                                                                                | 0    | 生成本地 ignored build artifacts                                                    |
| `pnpm --filter @drts/contracts build`                                                                                                                         | 0    | 生成本地 ignored build artifacts                                                    |
| `CI=true pnpm install --frozen-lockfile --ignore-scripts --offline`                                                                                           | 0    | 此 worktree 獨立依賴；未改 package/lockfile                                         |

初始環境失敗也保留：第一次 Vitest exit 1（共享 node_modules 連結缺 vitest）；第一次 `pnpm install --frozen-lockfile` exit 1（non-TTY purge 被拒絕）；未強制清理 canonical dependencies，而是只 unlink 本 worktree 的 21 個 dependency symlinks 後獨立 offline install。第一次 typecheck exit 2（缺 `@drts/control-plane-auth` dist），build 後通過。第一次 Mailpit script exit 1（缺 `@drts/contracts/dist/index.js`），build 後通過。

### 回歸涵蓋

- 未配置 transport 不假 delivered。
- Provider accepted 只為 sent；secret 不在 API／invitation／receipt。
- 正確收件 proof 單次使用；連續重寄舊 token 失效；撤銷／過期拒絕。
- Provider 失敗後由重新建立的 service 讀磁碟恢復；同 invitation 重送去重。
- 重啟前已撤銷／過期／使用的邀請，retry 不送出且留下終止原因。
- 慢速 provider 完成後不撤銷已發生的 revocation。

單元測試的 injected provider／IdentityRepository fallback 是邊界測試，不冒充外部 provider 或 PostgreSQL integration。

## 真實受控 Mailpit receiver

最終模板版本執行：

```bash
NOTIFICATION_OUTBOX_DIRECTORY=/tmp/sr-mail-001-receiver-20260906-v2 \
MAILPIT_SMTP_PORT=1025 \
SR_MAIL_MAILPIT_HTTP=http://127.0.0.1:8025 \
TENANT_INVITATION_FROM_EMAIL=sender@sr-mail.invalid \
TENANT_INVITATION_ACCEPT_URL=https://acceptance.example.test/invitation \
pnpm --filter @drts/api exec tsx --tsconfig tsconfig.seed.json \
  ../../tests/unit/system-remediation/sr-mail-001/verify-mailpit.ts
```

Exit **0**。實際連線既有 `drts-mailpit` 的 loopback SMTP，並以 Mailpit HTTP API 讀回信件，比對收件人、完整 body、Message-ID、provider queue ID。程式只輸出安全資源 ID，不輸出 token 或完整郵件內容。

- Tenant：`sr-mail-001-8badb56c-7142-4614-ab98-1fdab6d22a6e`
- User：`tenant_user_2c83f506-9e24-4f37-8ee9-e9a2fa8ab65d`

| 用途             | Invitation ID                                   | Delivery ID                          | Receiver message ID    |
| ---------------- | ----------------------------------------------- | ------------------------------------ | ---------------------- |
| 首封，被重寄取代 | invitation_748eea50-f155-46d0-802b-3dd6d777a2f5 | 636c1a47-ecaf-4715-8527-b9e335875307 | 6yTX97sTss2C4Yk1VufvLL |
| 重寄，啟用一次   | invitation_f23365ed-ef45-4607-82c4-7e30e9899f02 | 9b7e221f-b069-46fe-a8ea-0c161182572d | 3sL7L3bGVRjxcbjffQL0Og |
| 撤銷             | invitation_1d632391-0623-40c4-9d15-21013a153ce2 | 3331518a-30dd-48e7-abfe-94a74240e0f9 | 6ClQiRb0QcMpl3w51nWFPR |
| 過期             | invitation_362ad595-a9b0-4ac5-9520-9312e779f11a | 7bf1cf07-afa6-4b09-a708-2e05555a92b8 | 46jpeHWKoSI9Fn5xjVlqwq |

各 Message-ID 為 `<Delivery ID@notification.drts.invalid>`。對應 attempt IDs：`85434b6d-d38a-443b-a779-7d57f820b8a1`、`0937556e-296c-4847-8e7a-27477a85b008`、`f00b8ceb-98ca-40e4-a5ea-39dbcd8fa54c`、`b3061d25-6d10-4f4f-81f2-943b085eeb24`。四筆 outbox 均為 sent，未寫 delivered。

從真實收到的信中擷取 proof，使用既有 TenantPartnerService + IdentityRepository 驗證一次性／旧／撤銷／過期；此腳本使用 identity fallback，未走 HTTP controller 或 PostgreSQL。重建 adapter 後重複原請求返回相同 delivery ID，沒有新 dispatch attempt。

## 未做及不可宣稱

- 未測正式外寄 provider、真實外部收件匣、瀏覽器啟用、完整 HTTP／PostgreSQL 身份流程。
- 本次 adapter restart 是重新建立物件＋讀 durable spool；shared core 的子程序 restart 測試另在 52 tests 中通過，不能等同整個 API／資料庫的 crash recovery 驗收。
- SMTP ACK 是 provider acceptance；沒有外部 delivery webhook／收件匣證據時，不可將 sent 稱為 delivered。Mailpit HTTP 讀回只證明本次受控 receiver 收到。
- 未完成同 candidate 的獨立 review、CI、merge、部署；待 scope 補齊後重新驗證、commit＋普通 push，再 handoff 鎖 candidate。
