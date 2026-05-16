# DRV-MP-009 SIDECAR ACCEPTANCE

Status: review
Owner: Claude
Reviewer: Codex2
Last Update: 2026-05-08

> Snapshot note: this packet mirrors the machine-truth lifecycle at the time of handoff (`review`, awaiting Codex2). Authoritative state lives in `ai-status.json` for `DRV-MP-009-SIDECAR-ACCEPTANCE`; treat this header as a derived summary only.

## 目的

為 DRV-MP-009（Settings Platform Binding）準備非侵入式的 acceptance 支援包。本檔案僅整理驗收清單、依賴關係圖與證據指標，**不修改任何 canonical truth**（不動 L1 產品真相、core contracts、runtime/registry/governance 主線實作或 spec 文件）。Parent owner（Codex2）負責 canonical 實作；本 sidecar 為平行支援。

Parent task: `DRV-MP-009` — Settings Platform Binding（讓 settings 揭露 platform account binding 與 per-platform availability，與 presence health center 一致）。
Parent dependency: `DRV-MP-006` — Platform Presence Health Center。

## Canonical 來源 (read-only references)

本 acceptance 包以下列來源為依據，僅引用，不修改：

- 產品規格：`docs/01-product/driver-app-multi-platform-product-spec-20260507.md`（DRV-MP-006、DRV-MP-009 條目）
- 執行包：`docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md` §`DRV-MP-009` (lines 316–335)
- 寫入範圍（canonical）：
  - `apps/driver-app/app/settings.tsx`
  - `apps/driver-app/components/platform-binding.tsx`
- 共享於 DRV-MP-006 的 UI 元件（read reference）：
  - `apps/driver-app/components/platform-status-card.tsx`
  - `apps/driver-app/app/platform-presence.tsx`
- 後端 presence 來源（read reference）：
  - `apps/api/src/modules/platform-presence/platform-presence.service.ts`

## Acceptance Checklist (deliverables)

- [x] Acceptance checklist（本檔）
- [x] Dependency map scoped to DRV-MP-009（可驗證、限制範圍）
- [x] Support packet metadata 與 evidence 路徑
- [x] Handoff via `scripts/ai-status.sh` 給 reviewer（已透過 `AI_NAME=Claude scripts/ai-status.sh handoff DRV-MP-009-SIDECAR-ACCEPTANCE Codex2 ...` 推進到 `review`）

### Verification steps（owner — Codex2 主線、本 sidecar 由 Claude 提供 packet）

1. 確認 canonical 寫入檔僅限於 `apps/driver-app/app/settings.tsx` 與 `apps/driver-app/components/platform-binding.tsx`。
2. 比對 settings 頁面顯示的 bound / unbound / re-auth / token / eligibility 狀態是否與 `platform-presence` 健康中心一致。
3. 平台綁定 runtime copy 為繁體中文（包含 API 來源 notes，否則顯示時應映射為繁中字串）。
4. 區分 global auto-accept 與 per-platform auto-accept 的影響並對使用者明示。
5. 保留 dirty / save / partial-error 行為（送出時 dirty state、partial 失敗時錯誤回饋）。
6. 執行驗證指令：`pnpm --filter @drts/driver-app typecheck`（spec 中明列）。
7. 若觸及 API copy（`apps/api/src/modules/platform-presence/platform-presence.service.ts`），補做：`pnpm --filter @drts/api exec vitest run tests/unit/platform-presence.service.test.ts`。

### Verification checklist（reviewer — Codex2）

- 確認 settings 與 platform presence health center 在 bound/unbound/re-auth/token/eligibility 顯示語意一致。
- 確認 platform-binding 顯示的 notes 為繁體中文（不出現英文 fallback）；若 notes 來自 API，後端 source 應已對齊繁中。
- 確認 dirty/save/partial-error path 仍可運作；無 type error。
- 確認本 sidecar 未動到 canonical truth（`docs/01-product/*`、`docs/03-runbooks/*`、`packages/contracts/*`、L1/L2 spec 系列、`ai-status.json` 任務定義以外的部分）。
- 通過時執行：`AI_NAME=Codex2 scripts/ai-status.sh approve DRV-MP-009-SIDECAR-ACCEPTANCE "Reviewed: acceptance packet complete"`

## DRV-MP-009 Dependency Map（可驗證、限制範圍）

### Hard prerequisites

| 來源                                                                   | 內容                                                                                                                               | 為什麼 DRV-MP-009 需要                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `DRV-MP-006` Platform Presence Health Center                           | 產出 `platform-status-card.tsx` 與 `platform-binding.tsx` 的健康中心欄位（bound / reauth / token / eligibility chips、sync notes） | settings 必須沿用同一份組件與顯示語意，否則兩處會分歧 |
| `API-MP-001` Unified Driver Task View Model（DRV-MP-006 透過此鏈傳遞） | platform presence 後端的統一 view model                                                                                            | 提供 settings 顯示需要的 platform 狀態 payload        |
| `DRV-MP-001` Driver identity bootstrap                                 | 提供 driver 身份與 platform 綁定列表的初始化                                                                                       | settings 進入時需以正確 driver 為基準載入綁定         |

### Soft / co-evolving dependencies

| 來源                                                                  | 性質                                   | 註解                                                                                                                                                |
| --------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/platform-presence/platform-presence.service.ts` | 後端 source of truth（presence notes） | 若 notes 來自 API，需要與前端繁中要求一致；歷史 review 中曾發生 API 留英文而前端誤顯示英文 fallback 的問題（DRV-MP-009 review round on 2026-05-08） |
| `apps/driver-app/components/platform-status-card.tsx`                 | UI 共用元件                            | settings 應沿用同一張 card 元件以避免顯示分歧                                                                                                       |
| `packages/contracts/src/index.ts`                                     | platform 狀態 contract                 | 不在本 task 寫入範圍；若需擴張枚舉，應走另案而非塞入此 task                                                                                         |

### Out of scope (do NOT bundle into DRV-MP-009)

- 重構 platform-presence 服務的後端 contract。
- 更動 SOS / incident 行為（屬於 `DRV-MP-010`）。
- 修改 trip authority 邊界（屬於 `DRV-MP-005`）。
- 觸及 earnings 顯示（屬於 `DRV-MP-007`）。
- 變更 governance / orchestrator runtime（不屬此 lane）。

## Acceptance 對照（spec 條列 → 驗證指標）

| Spec 條列                                                       | 驗證點                                                 | 證據                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 「Bound/unbound/re-auth/token/eligibility states are visible.」 | settings 頁有與 health center 同步的 chips             | 視覺檢查 settings 顯示 + platform presence card 比對                            |
| 「Platform binding runtime copy is Traditional Chinese.」       | UI 與 API notes 皆為繁中                               | 1) settings 文案；2) `platform-presence.service.ts` 對應字串；3) 對應 unit test |
| 「Global vs per-platform auto-accept implications are clear.」  | UI 文案明確分離 global 與 per-platform                 | settings 內 auto-accept 區塊 copy                                               |
| 「Dirty/save/partial-error behavior remains.」                  | 編輯後 dirty 旗標、save 流程、部分失敗錯誤訊息仍可運作 | 互動測試或在 Codex2 handoff 中描述 manual smoke                                 |
| Verification 指令通過                                           | `pnpm --filter @drts/driver-app typecheck` PASS        | Codex2 提交記錄與最近一次 handoff message 已標示 PASS                           |

## Support Packet（檔案與註解）

本 sidecar 提供的檔案：

- `support/sidecars/DRV-MP-009/DRV-MP-009-SIDECAR-ACCEPTANCE.md`（本檔）

不提供（屬 canonical owner 範圍）：

- 任何對 `apps/driver-app/app/settings.tsx`、`apps/driver-app/components/platform-binding.tsx` 的程式碼修改。
- 對 `docs/01-product/*`、`docs/03-runbooks/*` 的修改。
- 對 `ai-status.json` 中 DRV-MP-009 主任務 metadata 的修改（只在本 sidecar task 自身的生命週期內透過 `ai-status.sh` 變更）。

## Handoff / Evidence

- Artifact path: `support/sidecars/DRV-MP-009/DRV-MP-009-SIDECAR-ACCEPTANCE.md`
- Owner action log:
  1. `AI_NAME=Claude scripts/ai-status.sh start DRV-MP-009-SIDECAR-ACCEPTANCE "Preparing DRV-MP-009 acceptance packet: dependency map and support artifacts"`
  2. 撰寫本支援檔案，列出 DRV-MP-009 specific dependency map、acceptance 對照與驗證指標。
  3. `AI_NAME=Claude scripts/ai-status.sh handoff DRV-MP-009-SIDECAR-ACCEPTANCE Codex2 "Acceptance packet ready: dependency map + spec→verification matrix; canonical truth untouched."`
  4. Review failure 後（reviewer 指出 packet header / handoff checklist / reviewer 指令 AI_NAME 與 machine truth 不一致），refresh packet：header 改為 `Status: review` 並加 snapshot note；handoff checklist tick 起；reviewer approve/reopen 指令統一改為 `AI_NAME=Codex2`。
  5. `AI_NAME=Claude scripts/ai-status.sh progress DRV-MP-009-SIDECAR-ACCEPTANCE "<refresh 摘要>"`，再 `AI_NAME=Claude scripts/ai-status.sh handoff DRV-MP-009-SIDECAR-ACCEPTANCE Codex2 "<handoff 摘要>"`。

### Reviewer approval（Codex2）

通過：

```
AI_NAME=Codex2 scripts/ai-status.sh approve DRV-MP-009-SIDECAR-ACCEPTANCE "Reviewed: acceptance packet complete"
```

不通過：以 `AI_NAME=Codex2 scripts/ai-status.sh reopen DRV-MP-009-SIDECAR-ACCEPTANCE "<原因>"` 退回，並指出需補強處（例如某項 dependency 不正確、某 acceptance 條目沒對應到證據）。

---

Support artifact prepared by Claude（governance lane）。No canonical files modified.
