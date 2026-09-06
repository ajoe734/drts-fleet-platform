# SR-MAIL-001 — 租戶邀請信真正交付並修正 delivered 語義

- Owner: `Claude`；independent reviewer: `Claude2`。
- Branch: `claude/sr-mail-001`。
- Base（`git fetch origin` 後 `origin/dev` HEAD）: `650e233bb1c35269852c291ef892d25967380c12`。
- 依賴：`SR-NOTIFY-001`（`NotificationDeliveryService` 共用耐久郵件核心，已 merge）、`SR-REFERRAL-001`（皆已 done）。

## 基準重現（修復前語義）

修復前的 `TenantInvitationDeliveryService.send` 只把 `{ ...delivery, sentAt: new Date().toISOString() }` push 進 process-local array 並 log，沒有任何網路傳輸；呼叫端 `tenant-partner.service.ts` 只要 `send()` 沒有 throw 就把 invitation 標成 `delivered`（`try { await send(...); deliveryStatus: "delivered" } catch { deliveryStatus: "delivery_failed" }`）。這代表：(1) 從未真正送出過任何一封信；(2) provider 不存在或未設定時，因為 promise 直接 resolve，一樣會標成 `delivered`；(3) 沒有任何 idempotency，重寄／重試會建立新的假 delivery 記錄。追溯：`source/new-gaps.json` N06；`source/capabilities.json` C006。

## 修復設計

- `TenantInvitationDeliveryService` 改為注入（`@Optional`）SR-NOTIFY-001 的 `NotificationDeliveryService`；`send()` 一律回傳 `{ status: "sent" | "failed" | "unavailable", sentAt, providerMessageId, errorCode, retryable, ... }`，**从不 throw**，也从不在没有 provider acknowledgement 时回报 `sent`。
- Idempotency key 固定為 `tenant-invitation:${invitationId}`，与 `tenantId` 一并交给 `NotificationDeliveryService.enqueue`；同一 invitation 的重寄／进程重启重试会拿回同一笔 durable receipt 而不会重新調用 transport（见下方测试 2/3）。
- `tenant-partner.service.ts` 的 `issueTenantInvitation` 移除了「送出不 throw 就等于 delivered」的旧逻辑，改成 `deliveryStatus: delivery.status === "sent" ? "delivered" : "delivery_failed"`；`resendTenantInvitation` 沿用既有的「撤销未接受的旧 invitation」逻辑（不是本次新增，這裡只是重新验证行为未被破坏）。
- 原始 one-time token（`rawToken`）只在 `buildInvitationEmailBody()` 组出的邮件正文里出现一次，交给 transport payload；不写入任何 log、也不出现在 `TenantInvitationDeliveryRecord` / HTTP response 里（见测试 "keeps ... rawToken ... out of the returned delivery record" 与 "not.toHaveProperty(rawToken)"）。
- 缺少 provider 设定（`NOTIFICATION_OUTBOX_DIRECTORY` 未设置）时，`tenant-partner.module.ts` 让 `NotificationDeliveryService` provider 解析成 `null`，`TenantInvitationDeliveryService` 明確回报 `unavailable`，不阻断模块 bootstrap、也不假装 delivered。
- Provider 失败（无效收件地址、transport 抛出、outbox 存储异常）一律回报 `status: "failed", sentAt: null`，並保留 `retryable`；invitation 仍可被 `resendTenantInvitation` 重新送出。

沿用权威 API／数据模型：没有新增 fixture、固定百分比、假签章或假送达；`NotificationDeliveryService` 是 SR-NOTIFY-001 已验收的共用核心，本任务只新增 tenant-invitation 这一个 caller。

## 验证

2026-09-06 UTC，於本 worktree（`.artifacts/worktrees/auto/claude-sr-mail-001`，base `650e233bb`）执行：

| 指令 | Exit | 实际结果 |
| --- | --- | --- |
| `git diff --check` | 0 | 无 whitespace errors |
| `corepack pnpm --filter @drts/api typecheck`（`pnpm --filter @drts/api typecheck` 的等价调用；本 session 的 shell 没有裸 `pnpm` binary，仅有 corepack shim） | 2 | 见下方「typecheck 结果分析」 |
| `npx vitest run tests/unit/system-remediation/sr-mail-001/`（`pnpm exec vitest run ...` 的等价调用；理由同上） | 1（因下方 zod 问题的其中一个 test file 整个 suite load 失败） | `tenant-invitation-delivery.service.test.ts`：1 file / **10 tests all passed**；`tenant-invitation-delivery-status.test.ts`：0 tests，load 阶段失败（见下方分析） |

### typecheck 结果分析（pre-existing，非本任务引入）

`tsc -p tsconfig.json --noEmit` 报 13 个错误，全部位于本任务 write_scopes 之外、且本次 diff 完全未触碰的档案：

```
src/common/auth/voice-capability.guard.ts
src/common/auth/voice-capability.service.ts
src/modules/callcenter/voice-cti.adapter.ts
src/modules/owned-mobility/owned-mobility.repository.ts
src/modules/owned-mobility/owned-mobility.service.ts
src/modules/voice-booking/voice-booking-authorization.service.ts
```

错误都是 `@drts/contracts` 缺少 `VoiceAgentBookingActor` / `VoiceCapabilityTokenClaims` 等 export，以及 `OwnedOrderRecord` 缺 `aggregateVersion` / `voiceIntentId` 栏位——都是无人语音（UV-EXEC-00x）功能线的既有缺口。`git log --oneline -- <上述档案>` 显示它们最后由 `UV-EXEC-001`／`UV-EXEC-003`／`UV-EXEC-004` 触碰，与 SR-MAIL-001 无关；本次 3 个被改动的档案（`tenant-invitation-delivery.service.ts`、`tenant-partner.module.ts`、`tenant-partner.service.ts`）不在错误列表中的任何一笔。也就是说 `apps/api` 的 typecheck 在 `origin/dev` 当前 HEAD 上本来就是红的，与本任务改动无关；这里如实记录 exit code 与完整错误列表，不假装它是绿的。

### vitest 第二个 test file 无法加载（pre-existing，非本任务引入）

`tests/unit/system-remediation/sr-mail-001/tenant-invitation-delivery-status.test.ts` 透过 `TenantPartnerService` 间接 import `@drts/contracts` 的 runtime 值，加载时炸在：

```
Error: Cannot find package 'zod' imported from packages/contracts/src/unattended-voice.ts
```

`packages/contracts/src/unattended-voice.ts`（同样是 `UV-EXEC-001` 加入）直接 `import { z } from "zod"`，但 `pnpm-lock.yaml` 里 `packages/contracts: {}` 完全没有声明任何 dependency，`apps/api`／根 `package.json` 也都没有声明 `zod`；这是整个 workspace 的 phantom-dependency 缺口，不是本 worktree node_modules 没装齐。用完全不相关、修复前就存在的 `tests/unit/tenant-partner-foundation.test.ts` 重现同一个错误可以证实：这与 SR-MAIL-001 的改动无关，是既有、跨任务共用的缺陷，修复需要改 `packages/contracts/package.json`（不在本任务 write_scopes 内，未经 supervisor 扩 scope 不能碰）。

第一个 test file（`tenant-invitation-delivery.service.test.ts`）不透过 `TenantPartnerService`／`@drts/contracts`，因此不受影响，10 个测试全部执行并通过，覆盖：真正送达并回报 `sent`＋`providerMessageId`＋token 只出现在 transport payload、进程重启后的幂等重试不重新调用 transport、幂等 key 按 tenant 隔离、provider 未设定时回报 `unavailable`／默认建构子回报 `unavailable`、provider 永久拒绝回报 `failed` 且停止重试、无效收件地址回报有界 error code 且不调用 transport、任意例外内容（含 raw token）不会外泄进 delivery record、`listDeliveries()` 回传的是拷贝且最新在前。

`tenant-invitation-delivery-status.test.ts`（写好但本 session 无法执行）额外覆盖：`createTenantUser` 真正送达后才标 `delivered`、旧（已使用）token 拒绝重放、已接受的 invitation 拒绝 resend、provider 不可用时标 `delivery_failed` 且后续 resend 能真正送达、resend 会撤销前一笔未接受的 invitation、过期 token 即使曾经真实送达也被拒绝。这些行为已经透过静态比对 `NotificationDeliveryService.enqueue/dispatch`（`apps/api/src/modules/notification-delivery/notification-delivery.service.ts`）与 `TenantPartnerService.acceptTenantInvitation/resendTenantInvitation/issueTenantInvitation` 的实际实作确认逻辑一致，但**未经执行验证**；等 `packages/contracts` 的 zod 缺口由其他任务修复後，需要重新执行本档案作为回归证据。

## 未做的 live／真机部分

- 没有像 `SR-NOTIFY-001.md` 那样另外起一个真实 Mailpit container 做 SMTP/HTTP 层的收件证据——本任务范围是 tenant-invitation adapter 是否正确、诚实地使用 SR-NOTIFY-001 已验收的共用核心，SMTP transport 本身的真实收发证据由 `SR-NOTIFY-001` 承担，这里不重做。
- 本 session 的 sandbox 对 `docker ps` / `docker run` 一律回报 permission-defer（`orchestrator_approval_broker` MCP 本 session 连线失败，CONNECTION_CLOSED），因此即使想做也无法在本 session 内新增即席 Mailpit container 验证。
- 没有正式对外 SMTP provider、没有真实收件匣、没有部署排程接线；这些不在本任务 acceptance 范围内。

## Candidate handoff

实作＋测试＋本文件 commit 后普通 push；owner 不写 done：

```bash
CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=$(git branch --show-current) \
AI_NAME=Claude /home/lupin/drts-fleet-platform/.artifacts/releases/orchestrator-99f7e0e56/tools/development-orchestrator/bin/ai-status.sh \
  handoff SR-MAIL-001 Claude2 "见本文件与 candidate diff"
```

精确 candidate SHA、branch、reviewer 与 state 以同一 release 的 `ai-status.sh show SR-MAIL-001` 读回。独立 review、同 candidate CI／merge 及 required_acceptance 完备后才可结案；reviewer 应重点确认：(1) `apps/api` typecheck 的 13 个既有错误确实与本次改动的 3 个档案无关；(2) 第二个 test file 因 `packages/contracts` 缺 `zod` 声明而无法执行，是否已有其他任务在处理该缺口。
