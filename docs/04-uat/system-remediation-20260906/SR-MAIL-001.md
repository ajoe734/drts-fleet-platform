# SR-MAIL-001 — 租戶邀請信真正交付並修正 delivered 語義

- Owner: `Codex`；independent reviewer: `Claude`。
- Branch: `codex/sr-mail-001`。
- Base（`git fetch origin` 後 `origin/dev` HEAD，round 2 rebase 後）: `70355aba97c23dd1cd592b71f1d3dfe6315d91ff`（round 1 原始 base：`650e233bb1c35269852c291ef892d25967380c12`）。
- 依賴：`SR-NOTIFY-001`（`NotificationDeliveryService` 共用耐久郵件核心，已 merge）、`SR-REFERRAL-001`（皆已 done）。

## 基準重現（修復前語義）

修復前的 `TenantInvitationDeliveryService.send` 只把 `{ ...delivery, sentAt: new Date().toISOString() }` push 進 process-local array 並 log，沒有任何網路傳輸；呼叫端 `tenant-partner.service.ts` 只要 `send()` 沒有 throw 就把 invitation 標成 `delivered`（`try { await send(...); deliveryStatus: "delivered" } catch { deliveryStatus: "delivery_failed" }`）。這代表：(1) 從未真正送出過任何一封信；(2) provider 不存在或未設定時，因為 promise 直接 resolve，一樣會標成 `delivered`；(3) 沒有任何 idempotency，重寄／重試會建立新的假 delivery 記錄。追溯：`source/new-gaps.json` N06；`source/capabilities.json` C006。

## 修復設計

- `TenantInvitationDeliveryService` 改為注入（`@Optional`）SR-NOTIFY-001 的 `NotificationDeliveryService`；`send()` 一律回傳 `{ status: "sent" | "failed" | "unavailable", sentAt, providerMessageId, errorCode, retryable, ... }`，**从不 throw**，也从不在没有 provider acknowledgement 时回报 `sent`。
- Idempotency key 固定為 `tenant-invitation:${invitationId}`，与 `tenantId` 一并交给 `NotificationDeliveryService.enqueue`；同一 invitation 的重寄／进程重启重试会拿回同一笔 durable receipt 而不会重新調用 transport（见下方测试 2/3）。
- `tenant-partner.service.ts` 的 `issueTenantInvitation` 移除了「送出不 throw 就等于 delivered」的旧逻辑，改成 `deliveryStatus: delivery.status === "sent" ? "delivered" : "delivery_failed"`；`resendTenantInvitation` 沿用既有的「撤销未接受的旧 invitation」逻辑（不是本次新增，這裡只是重新验证行为未被破坏）。
- 原始 one-time token（`rawToken`）只在 `buildInvitationEmailBody()` 组出的邮件正文里出现一次，交给 transport payload；不写入任何 log、也不出现在 `TenantInvitationDeliveryRecord` / HTTP response 里（见测试 "keeps ... rawToken ... out of the returned delivery record" 与 "not.toHaveProperty(rawToken)"）。异常日志只记录经白名单过滤的 error code。
- 缺少 provider 设定（`NOTIFICATION_OUTBOX_DIRECTORY` 未设置）时，`tenant-partner.module.ts` 让 `NotificationDeliveryService` provider 解析成 `null`，`TenantInvitationDeliveryService` 明確回报 `unavailable`，不阻断模块 bootstrap、也不假装 delivered。
- Provider 失败（无效收件地址、transport 抛出、outbox 存储异常）一律回报 `status: "failed", sentAt: null`，並保留 `retryable`；invitation 仍可被 `resendTenantInvitation` 重新送出。

沿用权威 API／数据模型：没有新增 fixture、固定百分比、假签章或假送达；`NotificationDeliveryService` 是 SR-NOTIFY-001 已验收的共用核心，本任务只新增 tenant-invitation 这一个 caller。

## 验证

### Round 1 — 2026-09-06 UTC（base `650e233bb`，历史记录，保留供追溯）

於本 worktree（`.artifacts/worktrees/auto/claude-sr-mail-001`，base `650e233bb`）执行：

| 指令 | Exit | 实际结果 |
| --- | --- | --- |
| `git diff --check` | 0 | 无 whitespace errors |
| `corepack pnpm --filter @drts/api typecheck`（`pnpm --filter @drts/api typecheck` 的等价调用；本 session 的 shell 没有裸 `pnpm` binary，仅有 corepack shim） | 2 | 13 个错误，全部位于 `UV-EXEC-00x` 语音功能线既有档案（`voice-capability.guard.ts` 等 6 个档案），与本任务改动的 3 个档案无关 |
| `npx vitest run tests/unit/system-remediation/sr-mail-001/`（`pnpm exec vitest run ...` 的等价调用；理由同上） | 1 | `tenant-invitation-delivery.service.test.ts`：1 file / **10 tests all passed**；`tenant-invitation-delivery-status.test.ts`：0 tests，因 `packages/contracts/src/unattended-voice.ts` import `zod` 但 workspace 未声明该 dependency（phantom dependency），整个 test file 在 load 阶段失败，**未经执行验证** |

以上两个缺口（typecheck 的 13 个语音功能线错误、`packages/contracts` 缺 `zod` 声明）均已确认与 SR-MAIL-001 改动的 3 个档案无关，且不在本任务 write_scopes 内，round 1 当时未修复、只如实记录。

### Round 2 — 2026-09-08 UTC（rebase 复验，base 更新为 `70355aba9`）

依 task brief 指示，从 `origin/dev` 重新 fetch 并 `git rebase origin/dev`（无冲突，`Successfully rebased and updated refs/heads/claude/sr-mail-001`）。Base SHA 由 `650e233bb1c35269852c291ef892d25967380c12` 前进到 `70355aba97c23dd1cd592b71f1d3dfe6315d91ff`（`origin/dev` 当前 HEAD）。这段区间内 `tenant-partner.service.ts` 被 `GCP-TOS-REMEDIATION-20260907`（#1710，移除真实金融机构名称）大幅改动（174 行），rebase 自动合并、无冲突，重新执行 diff 确认本任务实际改动仍只有预期的 3 个档案、40 行（`tenant-partner.service.ts`）：

於本 worktree执行（PATH 上此时已有裸 `pnpm` binary，不需 corepack shim）：

| 指令 | Exit | 实际结果 |
| --- | --- | --- |
| `git diff --check` | 0 | 无 whitespace errors |
| `pnpm --filter @drts/api typecheck` | **0** | 全绿——round 1 记录的 13 个语音功能线错误已由其他任务在 `origin/dev` 上修复（`packages/contracts` 现已导出所需类型），与本任务改动无关，这里只是确认交棒时 typecheck 是干净的 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-mail-001/` | **0** | **2 files passed / 13 tests passed**——round 1 无法加载的 `tenant-invitation-delivery-status.test.ts` 这次**完整执行且全数通过**，因为 `packages/contracts/package.json` 现已声明 `zod` 依赖，phantom-dependency 缺口已由其他任务修复 |
| `pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts tests/unit/tenant-partner.controller.test.ts`（write_scopes 外，仅作回归证据，未修改这两个档案） | 0 | 77 tests passed——确认 `GCP-TOS-REMEDIATION-20260907` 对 `tenant-partner.service.ts` 的大改动与本任务改动共存后，既有 tenant-partner 行为未被破坏 |

`tenant-invitation-delivery-status.test.ts`（本次首次执行验证，10→13 顆全部含在上表 13 tests 内）覆盖：`createTenantUser` 真正送达后才标 `delivered`、旧（已使用）token 拒绝重放、已接受的 invitation 拒绝 resend、provider 不可用时标 `delivery_failed`、恢复 provider 配置后以同一耐久 outbox 重建 adapter 再 resend 会真正送达、resend 会撤销前一笔未接受的 invitation、过期 token 即使曾经真实送达也被拒绝——round 1 文档中「未经执行验证，等其他任务修复 zod 缺口后需重新执行」的待办，本 round 已完成。

`tenant-invitation-delivery.service.test.ts`（10 tests，round 1／round 2 均通过）覆盖：真正送达并回报 `sent`＋`providerMessageId`＋token 只出现在 transport payload、进程重启后的幂等重试不重新调用 transport、幂等 key 按 tenant 隔离、provider 未设定时回报 `unavailable`／默认建构子回报 `unavailable`、provider 永久拒绝回报 `failed` 且停止重试、无效收件地址回报有界 error code 且不调用 transport、任意例外内容（含 raw token）不会外泄进 delivery record、`listDeliveries()` 回传的是拷贝且最新在前。

### Codex handoff verification — 2026-09-08 UTC（base `70355aba9`）

在指定 worktree、`codex/sr-mail-001` 上重新执行：`git diff --check`（exit 0）、`pnpm --filter @drts/api typecheck`（exit 0）、`pnpm exec vitest run tests/unit/system-remediation/sr-mail-001/`（exit 0；2 files / 13 tests passed）、以及 `pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts tests/unit/tenant-partner.controller.test.ts`（exit 0；2 files / 77 tests passed）。本轮还新增断言：储存／transport 任意异常即使包含 raw token，返回 record 和 warning log 都不会包含该 token；provider 从 unavailable 恢复后，重建 delivery adapter 并重寄会得到受控 receiver acknowledgement，且旧 invitation 被撤销。

## 未做的 live／真机部分

- 没有像 `SR-NOTIFY-001.md` 那样另外起一个真实 Mailpit container 做 SMTP/HTTP 层的收件证据——本任务范围是 tenant-invitation adapter 是否正确、诚实地使用 SR-NOTIFY-001 已验收的共用核心，SMTP transport 本身的真实收发证据由 `SR-NOTIFY-001` 承担，这里不重做。
- 本 session 的 sandbox 对 `docker ps` / `docker run` 一律回报 permission-defer（`orchestrator_approval_broker` MCP 本 session 连线失败，CONNECTION_CLOSED），因此即使想做也无法在本 session 内新增即席 Mailpit container 验证。
- 没有正式对外 SMTP provider、没有真实收件匣、没有部署排程接线；这些不在本任务 acceptance 范围内。

## Candidate handoff

实作＋测试＋本文件 commit 后普通 push；owner 不写 done：

```bash
CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=$(git branch --show-current) \
AI_NAME=Codex /home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh \
  handoff SR-MAIL-001 Claude "见本文件与 candidate diff"
```

精确 candidate SHA、branch、reviewer 与 state 以 `ai-status.sh show SR-MAIL-001` 读回。独立 review、同 candidate CI／merge 及 required_acceptance 完备后才可结案；round 1 记录的两个既有缺口（typecheck 语音功能线错误、`packages/contracts` 缺 `zod`）已在 round 2 base 上确认修复，reviewer 应重点确认：(1) rebase 后 diff 仍只有预期 3 个档案、无额外改动混入；(2) `tenant-invitation-delivery-status.test.ts` 的 13 test 全绿是本次首次真正执行的结果，覆盖 acceptance 中「舊／撤銷／過期token拒絕」與「provider失败/重启/重复send可恢復且不假delivered」两项。
