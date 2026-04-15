# Phase 2 Planning — Starter Draft

**Workspace:** `docs/02-architecture/consensus/phase2-planning/`  
**Starter:** Codex  
**Supervisor:** Claude  
**Review order:** Qwen → Gemini → Copilot → Claude  
**Created:** 2026-04-15  
**Source:** Human-commissioned gap audit vs. `phase1_dual_repo_review_and_guidance.md`

---

## 0. 目的

Phase 1 Wave A–E 的後端 module、Driver App 多平台化、CI/CD pipeline 均已完成。
但與 `phase1_dual_repo_review_and_guidance.md` 所定義的「完整架構藍圖」相比，
仍有三個重大缺口尚未收尾。本次 planning round 的目標是：

> **讓各 agent 就這三個缺口形成開發任務共識，輸出可以直接進入 supervisor 執行的 task list。**

---

## 1. 現況快照（2026-04-15）

### 1.1 已完成

- Wave A：`platform_presence`、`platform_earnings` backend module + Driver App 多平台 UI
- Wave B：Platform Admin Web control plane（tenants/users/fleet/pricing/switchboard）
- Wave C：Driver App 全平台功能（Task Inbox、Presence Center、Earnings Dashboard、Forwarded route-aware UI）
- Wave D：`apps/tenant-portal-web/` 全部頁面（Booking/Passengers/Reports/API Keys/Billing/Audit/Notifications）
- Wave E：GitHub Actions CI、Docker build、GCP staging、Smoke tests、UAT scenarios

### 1.2 三個重大未完成缺口

#### 缺口 1 — `tenant-commute-hub` 仍 100% Supabase 直連（最嚴重）

`drts-fleet-platform` 的文件和 API 都做完了，但 `tenant-commute-hub`（Lovable repo）
完全沒有接上 core API。`src/integrations/supabase/` 仍是唯一資料來源。

影響：

- Authority 邊界宣告了但完全沒有被執行
- `tenant-commute-hub` 仍然是「第二個 tenant backend」
- 兩套資料真值同時存在

具體 pages 需要切換：

- `BookingList.tsx` / `NewBooking.tsx` → `/api/tenant/bookings`
- `PassengerManagement.tsx` / `AddressManagement.tsx` → `/api/tenant/passengers`、`/api/tenant/addresses`
- `ReportManagement.tsx` → `/api/tenant/reports`
- `ApiKeyManagement.tsx` → `/api/tenant/api-keys`
- `BillingManagement.tsx` → `/api/tenant/billing/invoices`
- `NotificationSettings.tsx` → `/api/tenant/notifications`
- `AdminPanel.tsx` → `/api/tenant/users`、`/api/tenant/roles`
- `AuditLog.tsx` → `/api/tenant/audit`

工作切分建議：

- **P2-A：contracts 補齊** — `packages/contracts` 加入 Tenant Portal 所需的全部型別（BookingRecord、PassengerRecord、InvoiceRecord、ApiKeyRecord、WebhookRecord、AuditLogRecord、NotificationRecord 等）
- **P2-B：`/api/tenant/*` 路由補齊** — `tenant-partner` module 補完所有缺口路由（`/api/tenant/home`、`/api/tenant/sla`、`/api/tenant/billing/profile` 等），驗收：`pnpm typecheck` pass
- **P2-C：`FRONTEND_CHANGE_SPEC` Iteration 1** — 透過 `.ai-loop/` 指示 Lovable 把每個 page 的 Supabase 直連換成 core API 呼叫，補 auth header、Idempotency-Key、error envelope 處理
- **P2-D：`tenant-commute-hub` Supabase backend authority 凍結** — 移除或空殼化 `supabase/functions/calculate-price/`（pricing truth 歸 core），停止在 tenant repo 新增 migration

#### 缺口 2 — Ops Console dispatch board 過薄

`apps/ops-console-web/app/dispatch/page.tsx` 只有 38 行（僅列表），
缺少所有真正的 dispatch 操作能力。

`phase1_dual_repo_review_and_guidance.md` §9.3 要求：

- 派遣任務編排（任務指派）
- 可用車/司機篩選與選擇
- 地圖 + ETA 顯示
- assignment flow（確認派遣）
- 衝突處理
- 例外處理

工作切分建議：

- **P2-E：Ops dispatch board — assignment UI** — 加入候選車/司機選擇面板、指派確認、dispatch status 更新
- **P2-F：Ops dispatch board — ETA / map view** — 基本地圖（或 list-based ETA）顯示任務位置與預計抵達
- **P2-G：Ops dispatch board — exception & queue** — 逾時、取消、重派流程 UI

#### 缺口 3 — E2E / 一致性驗證缺失

Wave E 做了 smoke tests 和 UAT scenarios，但沒有跨 repo 的一致性驗證：

- Booking 從 `tenant-commute-hub` 下單 → `drts-fleet-platform` 後端收到 → Ops Console 可見 → Driver App 可接 → 整條 happy path 沒有 e2e test
- billing / invoice / audit 一致性測試不存在

工作切分建議：

- **P2-H：Happy path e2e test** — 涵蓋 booking 建立 → dispatch → driver accept → complete → invoice 生成
- **P2-I：Audit / billing 一致性 test** — 驗證 audit trail append-only、invoice 金額與 booking 一致

---

## 2. 建議任務優先序

| 優先序 | Task ID | 說明                                            | 相依        |
| ------ | ------- | ----------------------------------------------- | ----------- |
| P0     | P2-A    | Contracts 補齊（BookingRecord 等）              | —           |
| P0     | P2-B    | `/api/tenant/*` 路由補齊                        | P2-A        |
| P0     | P2-C    | Lovable cutover spec（`.ai-loop/` Iteration 1） | P2-A, P2-B  |
| P1     | P2-D    | Supabase authority 凍結                         | P2-C 完成後 |
| P1     | P2-E    | Ops dispatch assignment UI                      | —           |
| P1     | P2-F    | Ops dispatch ETA/map view                       | P2-E        |
| P2     | P2-G    | Ops dispatch exception & queue                  | P2-E        |
| P2     | P2-H    | Happy path e2e test                             | P2-C, P2-E  |
| P2     | P2-I    | Audit/billing 一致性 test                       | P2-H        |

---

## 3. 各 agent 討論方向

### Codex（starter 提問）

1. `packages/contracts` 目前只有 `platform-presence.ts` 和 `platform-earnings.ts`。Tenant Portal 需要的型別有多少可以從現有 `tenant-partner.service.ts` 的回傳型別推導？還是需要重新定義？
2. P2-B 的 `/api/tenant/*` 缺口路由，是要在現有 `tenant-partner.module.ts` 裡補，還是應該拆出新 module？
3. P2-C 的 Lovable cutover — `.ai-loop/FRONTEND_CHANGE_SPEC.json` 的粒度應該是「一個 spec 涵蓋所有 pages」還是「每個 page 一個 iteration」？

### Qwen（預期關注點）

- API 路由的 request/response schema 是否與 `phase1_service_contracts_v1.md` 一致
- `tenant-partner` controller 是否有 pagination、error envelope、idempotency 的實作
- Supabase 凍結的方式：hard delete edge functions vs. redirect to core

### Gemini（預期關注點）

- CI pipeline 如何確保 P2-C 的 cutover 不破壞 `tenant-commute-hub` 現有功能
- Docker/staging pipeline 是否需要同時支援兩個 repo 的 deploy
- e2e test 的 test infrastructure — 需要 staging env 還是 local docker-compose

### Copilot（預期關注點）

- Ops dispatch board 的 UX — assignment flow 是 modal 還是 side panel
- `tenant-commute-hub` cutover 是否應該逐頁做（feature branch per page）還是一次性
- 是否有現成的 React component library 可以加速 map/ETA 顯示

---

## 4. 預期輸出（consensus packet 需包含）

1. 確認 P2-A 到 P2-I 的任務邊界（每個任務的 owner、artifacts、acceptance criteria）
2. 解答 §3 的三個 Codex 提問
3. 如有任何任務需要拆分或合併，說明原因
4. 確認 `.ai-loop/` Iteration 1 的 spec 粒度決定
5. 確認 P2-D（Supabase 凍結）的執行方式

---

## 5. 不在本次討論範圍內

- Wave 3 Platform Admin 的 Payments / ODD Policy / Regulatory（超出目前 Phase 1 定義）
- Real-time push notifications（Phase 2 roadmap）
- Driver location stream（Phase 2 roadmap）
- Multi-tenant isolation hardening（Phase 2 roadmap）
