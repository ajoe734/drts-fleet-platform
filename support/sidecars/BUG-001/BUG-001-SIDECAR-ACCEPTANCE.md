# BUG-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `BUG-001` — Fix cross-tenant booking data leak in owned-mobility API  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex2` / `Claude`  
**Last Revised:** `2026-04-17 (UTC)`  
**Status:** `IN REVIEW — reviewer-side refresh applied; support artifact only; parent BUG-001 remains in_progress`

---

## 1) Scope Boundary

本 sidecar 只整理支援性材料，不修改 canonical truth，也不代替 parent task 實作修補。

- In scope: acceptance checklist、dependency map、evidence anchors、reviewer handoff 指引。
- Out of scope: L1 canonical truth 變更、核心 contract 真相調整、runtime / registry / governance 主線實作。

---

## 2) Current State Baseline (Shared Truth + Review Anchors)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 reviewer anchor 掃描為準：

- 父任務 `BUG-001` 目前為 `in_progress`，Owner=`Codex2`，Reviewer=`Claude`，優先級 `critical`。
- 本 sidecar `BUG-001-SIDECAR-ACCEPTANCE` 目前為 auto-created helper，Owner=`Codex2`，Reviewer=`Codex`，狀態為 `review`。
- `ai-activity-log.jsonl` 顯示 owner 已於 `2026-04-17T00:49:00Z` handoff 給 reviewer `Codex`，並在 `2026-04-17T00:49:01Z` 以 `review_ready_dispatch` 喚醒 reviewer。
- `docs-site/index.html` 只定義 execution dashboard 的呈現骨架；task ownership / status routing 仍以 machine-truth 檔案為準。
- machine-truth parent acceptance 只有 4 條：
  - `listTenantBookings() 只回傳呼叫方 tenant 的 booking`
  - `getTenantBooking() 若 bookingId 不屬於呼叫方 tenant 則回傳 404`
  - `createTenantBooking() 將 tenantId 寫入 booking record`
  - `E2E-004 通過：TEN_ACME 無法讀取其他 tenant 的 booking`
- reviewer anchor 掃描仍指出原始漏洞閉環應集中在以下錨點；這些錨點是驗收定位依據，不宣告 parent worktree 自 handoff 之後沒有持續變動：
  - [`apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:116) 的 `createTenantBooking`、`listTenantBookings`、`getTenantBooking` 只接 `x-request-id`，尚未讀取 `x-tenant-id`。
  - [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:392) 建立 booking 時沒有從呼叫方 tenant 寫入 order；audit 反而固定記成 `OPS_TENANT_ID`。
  - [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:600) 的 `listTenantBookings()` 目前回傳全部 booking。
  - [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:616) 的 `getTenantBooking(bookingId)` 目前只靠 bookingId 查詢，沒有 tenant guard。
- 測試現況：
  - [`tests/unit/owned-mobility.test.ts`](/home/edna/workspace/drts-fleet-platform/tests/unit/owned-mobility.test.ts:322) 目前只驗一般 list/update/cancel，尚未鎖住 cross-tenant list/get regression。
  - [`tests/e2e/E2E-004-tenant-attribution.sh`](/home/edna/workspace/drts-fleet-platform/tests/e2e/E2E-004-tenant-attribution.sh:171) 已有 cross-tenant leak check，可作為最終 acceptance 錨點。

結論：本 packet 的用途不是宣告漏洞已修好，而是凍結 reviewer 應驗收的閉環與證據路徑。

---

## 3) Parent Acceptance Expansion

以下是對 `BUG-001.acceptance` 四條 machine truth 的 reviewer-facing 展開，不新增產品語意，只把必須驗的閉環寫清楚。

### AC-1 — Tenant header 進入 tenant booking read/write path

- [ ] `POST /tenant/bookings` 從 header 讀取 `x-tenant-id`，而不是信任 request body 或預設 tenant。
- [ ] `GET /tenant/bookings` 從 header 讀取 `x-tenant-id` 並傳入 service filter。
- [ ] `GET /tenant/bookings/:bookingId` 從 header 讀取 `x-tenant-id` 並傳入 service guard。
- [ ] 若缺少 tenant context，行為需與現有 auth / API posture 一致，不得 silently fallback 到跨租戶可見。

### AC-2 — Booking record 與 audit 以呼叫方 tenant 為準

- [ ] `createTenantBooking()` 建立出的 booking / order record 帶有呼叫方 tenantId。
- [ ] 建立 booking 的 audit record 不得再固定寫成 `OPS_TENANT_ID`。
- [ ] 後續由 booking 映射出的 tenant-facing read model 可回推出正確 tenant attribution。

### AC-3 — Tenant list / detail read model 完成隔離

- [ ] `listTenantBookings()` 只回傳 `order.tenantId === callerTenantId` 的 booking。
- [ ] `getTenantBooking()` 在 bookingId 存在但 tenant 不相符時回 `404` / `BOOKING_NOT_FOUND`，而不是暴露別人的資料。
- [ ] 既有同 tenant 行為不退化：自己的 booking 仍可 list / get。

### AC-4 — Regression coverage 關住 cross-tenant leak

- [ ] unit test 新增至少一組 cross-tenant list regression。
- [ ] unit test 新增至少一組 cross-tenant get regression。
- [ ] `E2E-004` 明確驗證 `TEN_ACME` 看不到新 tenant booking。
- [ ] reviewer handoff 要明示哪個測試是新增鎖點、哪個測試是 end-to-end guardrail。

---

## 4) Required Evidence Inventory

Reviewer 至少應看到以下證據：

| ID  | Evidence                                   | Expected Anchor                                                     |
| --- | ------------------------------------------ | ------------------------------------------------------------------- |
| E-1 | Controller header plumbing                 | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`  |
| E-2 | Service tenant scoping for create/list/get | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`     |
| E-3 | Unit regression for list/get isolation     | `tests/unit/owned-mobility.test.ts`                                 |
| E-4 | E2E cross-tenant safety                    | `tests/e2e/E2E-004-tenant-attribution.sh` or its execution evidence |
| E-5 | Parent status / reviewer chain             | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`        |

補充說明：

- `E2E-004` 已有 leak-check 段落，所以 parent 可以優先補實作與 unit regression，再用 E2E 作最後 smoke / evidence。
- 若 parent 另外新增 controller / service helper，不影響 sidecar；重點是 reviewer 能從最終 handoff 直接定位到上述 4 類證據。

---

## 5) Dependency Map

### Formal Parent Dependencies

- `BUG-001` 目前無 machine-enforced `depends_on`。
- 本 sidecar 也無 formal dependency；它是平行支援 packet。

### Practical Review Dependencies

| Dep | Type                   | Why It Matters                                                             |
| --- | ---------------------- | -------------------------------------------------------------------------- |
| D-1 | Shared truth           | `ai-status.json` / `current-work.md` 決定 owner、reviewer、acceptance 原文 |
| D-2 | API controller         | tenant header 是否真正被提取與傳遞                                         |
| D-3 | Owned-mobility service | tenantId 是否寫入 order，且 list/get 是否被 filter                         |
| D-4 | Unit tests             | 是否有 deterministic regression guard                                      |
| D-5 | `E2E-004`              | 是否保住 cross-tenant safety 的端到端證據                                  |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Runtime evidence anchors:
  - `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - `tests/unit/owned-mobility.test.ts`
  - `tests/e2e/E2E-004-tenant-attribution.sh`

---

## 6) Reviewer Hotspots

Reviewer（`Codex`）應優先檢查：

1. 是否真的用 header tenant，而不是硬編碼或從 body 帶入。
2. 是否同時修了 create、list、get 三條路徑，而不是只補 list。
3. `BOOKING_NOT_FOUND` 是否用於 cross-tenant detail access，避免 existence leak。
4. unit regression 是否覆蓋「A 看不到 B」與「A 仍看得到 A」兩面。
5. `E2E-004` 的 leak-check 是否仍成立，且 handoff 沒把它降成僅 informational。

---

## 7) Handoff Command

Owner（`Codex2`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff BUG-001-SIDECAR-ACCEPTANCE Codex "Acceptance packet ready at support/sidecars/BUG-001/BUG-001-SIDECAR-ACCEPTANCE.md: captures tenant-header scoping requirements, create/list/get isolation checklist, evidence anchors, and reviewer hotspots for BUG-001."
```

---

## 8) Reviewer Decision Commands

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve BUG-001-SIDECAR-ACCEPTANCE "Acceptance packet aligns with current BUG-001 machine truth and code scan; support-only artifact correctly captures tenant isolation closure criteria and evidence anchors."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen BUG-001-SIDECAR-ACCEPTANCE "Packet is stale or incomplete: refresh parent baseline, evidence anchors, or regression checklist before review."
```

---

## 9) Owner Closeout

如果 sidecar 之後進入 `review_approved`，由 owner（`Codex2`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex2 python3 scripts/ai_status.py done BUG-001-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for BUG-001 at support/sidecars/BUG-001/BUG-001-SIDECAR-ACCEPTANCE.md."
```

---

## 10) Change Log

- 2026-04-17 — 初版建立：根據共享 machine truth 與 repo 代碼掃描，整理 BUG-001 的 acceptance checklist、dependency map、evidence inventory 與 reviewer handoff。
- 2026-04-17 — reviewer-side refresh：對齊 parent `BUG-001` 已改派為 `Codex2`、sidecar 已進入 `review`、以及 `review_ready_dispatch` handoff routing，避免 packet 沿用改派前 owner baseline。
