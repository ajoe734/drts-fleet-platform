# GAP-P2S2-008 Acceptance Packet & Capability Audit

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S2-008` — platform-admin: inspect switchboard/page.tsx for hidden gaps  
**Current Sidecar Owner:** `Claude`  
**Assigned Reviewer:** `Codex`  
**Parent Owner:** `Codex` (re-validated on `2026-04-18`; parent audit remains active in machine truth)  
**Last Revised:** `2026-04-18T05:52Z (UTC)`  
**Status:** `done` (support-only packet finalized; parent task now uses this audit as closeout evidence)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S2-008` 的 acceptance checklist、capability audit 結果、gap inventory 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing, repo-scan capability audit evidence anchors, switchboard/page.tsx baseline coverage map, identified hidden gaps (prioritized), dependency map, reviewer checklist.
- **Out of scope:** 修改 `switchboard/page.tsx`、`platform-admin.controller.ts`、`.service.ts`、`.repository.ts` 主線 runtime，修改 `packages/contracts/src/index.ts`（L1 真相），新增任何實作或 DB migration，或以任何方式修改非 platform-admin switchboard 模組。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S2-008` 已於 `2026-04-18T05:40:19Z` 由 `Codex` 正式啟動；本 packet 在 parent closeout 前再次對照目前 repo，確認 capability audit 結論仍成立。
- 本 sidecar `GAP-P2S2-008-SIDECAR-ACCEPTANCE` 在 machine truth 中已完成 support-only closeout；它保留作為 parent task 的審計證據來源，不再承擔待回應 reviewer 狀態。
- Consensus 明確描述此任務目的：**capability audit**（非實作），確認 UI 是否覆蓋 public info versioning / placard lifecycle 的必要操作、是否缺少 smoke path、是否有 hidden gap 或資料一致性問題（`starter-draft.md:215-223`）。
- `review-round-1.md:29` 已確認此任務改寫成 capability audit，不應將 switchboard 當作空殼 stub 處理。

### 2026-04-18 Re-validation

- 重新核對 `apps/platform-admin-web/app/switchboard/page.tsx`、`apps/platform-admin-web/lib/admin-client.ts`、`apps/api/src/modules/platform-admin/platform-admin.controller.ts`、`apps/api/src/modules/platform-admin/platform-admin.service.ts`、`packages/api-client/src/index.ts`、`packages/contracts/src/index.ts` 後，原 packet 的 **5 項已覆蓋能力** 與 **10 項 gap inventory** 均仍與當前 repo 一致。
- 本次 re-validation 未發現會推翻 packet 結論的新實作或新的 backend endpoint；因此 `GAP-SB-001` 至 `GAP-SB-010` 的優先級與 follow-up routing 維持不變。
- parent `GAP-P2S2-008` 的完成標準仍是「完成 capability audit 並正式回報 gap」，不是在本 task 內實作 gap 修正。

### Repo Baseline Anchors — Covered Capabilities

以下為 `switchboard/page.tsx` 目前**已實作**的能力（via `usePlatformAdminClient`）：

| 操作                               | UI 入口                           | API call                                                      | Controller route                                          |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| List public info versions          | 頁面載入自動                      | `client.listPublicInfo()`                                     | `GET /api/platform-admin/public-info`                     |
| Create public info version (draft) | "New Public Info Version" form    | `client.createPublicInfoVersion(command)`                     | `POST /api/platform-admin/public-info`                    |
| Publish public info version        | 列表中 "Publish" 按鈕（draft 行） | `client.publishPublicInfoVersion(versionId, { publishedBy })` | `POST /api/platform-admin/public-info/:versionId/publish` |
| List placard versions              | 頁面載入自動（Placards tab）      | `client.listPlacards()`                                       | `GET /api/platform-admin/placards`                        |
| Generate placard version           | "Generate Placard Version" form   | `client.generatePlacardVersion(command)`                      | `POST /api/platform-admin/placards`                       |

**Summary stat view** (4 cards): Published public info count, Draft public info count, Placard versions count, Placards tied to live info count.

**Status badge rendering:** `draft`, `published`, `retired` 三種狀態均有 badge（`publicInfoStatusBadge` function L54-62）。

**Placard download link:** 若 `placard.artifactDownloadUrl` 存在則顯示 "Download signed artifact" 連結（L649-658）。

---

## 3) Gap Inventory (Hidden Gaps Found)

以下 gap 根據完整 repo 掃描（`switchboard/page.tsx`、`platform-admin.controller.ts`、`platform-admin.service.ts`、`packages/contracts/src/index.ts`、`packages/api-client/src/index.ts`）整理，依優先順序排列。

### 優先等級定義

- **P0 – 合規缺口**：影響 audit trail 完整性或法規遵從
- **P1 – 功能缺口**：lifecycle 操作路徑缺失，造成使用者無法完成工作
- **P2 – UX/驗證缺口**：操作雖可完成但有可預防的錯誤路徑
- **P3 – 品質/一致性問題**：非阻斷性但需改善

---

#### GAP-SB-001 — `publishedBy` 硬編碼為 bootstrap actor（P0）

**檔案：** `apps/platform-admin-web/app/switchboard/page.tsx:168`  
**問題：** `handlePublish()` 呼叫 `client.publishPublicInfoVersion(versionId, { publishedBy: "platform-admin-web-bootstrap" })`，`publishedBy` 為常數字串，不代表實際操作者身份。  
**影響：** 所有 publish 操作的 audit log `publishedBy` 欄位均為 `"platform-admin-web-bootstrap"`，無法追溯真實操作人員，違反合規要求中的操作者問責性（accountability）。  
**根本原因：** 頁面目前使用 bootstrap header trust（`ACTOR_ID = "platform-admin-web-bootstrap"` 在 `admin-client.ts:13`），無真實 auth session。此為已知 Phase 1 bootstrap 限制，但 `publishedBy` 欄位具法規意義，不應在生產前使用硬編碼佔位值。  
**相關任務：** `GAP-P2S3-001`（Cloud IAP / OIDC JWT 生產替換 bootstrap header trust）— 此 gap 的根本修正依賴 GAP-P2S3-001，但可在 UI 層先標示或禁用。

---

#### GAP-SB-002 — 無 "Retire" 操作（P1）

**檔案：** `apps/platform-admin-web/app/switchboard/page.tsx:585-598`（Actions 欄）  
**問題：** 已 published 的 public info version 的 Actions 欄只顯示 "Immutable history"（L597），沒有任何動作按鈕。若需要手動 retire 當前 published version（例如發現合規錯誤），唯一路徑是建立並發布新版本（舊版本會自動 retire），但新版本需先填寫所有欄位，操作成本高。  
**影響：** 無法在不建立新版本的情況下退役已發布的合規版本；緊急撤銷路徑缺失。  
**API 缺口：** `packages/api-client/src/index.ts` 沒有 `retirePublicInfoVersion()` 方法；`platform-admin.controller.ts` 沒有對應 endpoint。  
**注意：** 服務端 `publishPublicInfoVersion` 確實有自動 retire 邏輯（`platform-admin.service.ts:313-323`），但沒有獨立的手動 retire endpoint。

---

#### GAP-SB-003 — 無法刪除或廢棄 draft public info versions（P1）

**檔案：** `apps/platform-admin-web/app/switchboard/page.tsx:586-598`  
**問題：** draft 版本的 Actions 欄只有 "Publish" 按鈕，沒有 "Delete draft" 或 "Discard" 操作。錯誤建立的 draft 版本無法清除，draft list 會持續累積。  
**影響：** draft 列表在操作過程中只增不減，使「Draft public info」計數卡片失去實際意義，且 placard generation 的 source version 選單（L460-465）會包含所有 draft，造成混淆。  
**API 缺口：** `packages/api-client/src/index.ts` 沒有 `deletePublicInfoVersion()` 方法；`platform-admin.controller.ts` 沒有對應 `DELETE` endpoint。

---

#### GAP-SB-004 — Publish 時無法覆寫 `effectiveFrom` / `effectiveTo`（P1）

**檔案：** `apps/platform-admin-web/app/switchboard/page.tsx:163-176`  
**問題：** `handlePublish()` 只傳 `{ publishedBy: "platform-admin-web-bootstrap" }` 給 `publishPublicInfoVersion`，但 `PublishPublicInfoVersionCommand` 合約（`packages/contracts/src/index.ts:955-959`）允許在 publish 時覆寫 `effectiveFrom` 和 `effectiveTo`。  
**影響：** 若 draft 建立時填入的 `effectiveFrom` 需在 publish 時調整（例如因行政延誤改期），操作者無法透過 UI 修正，必須建立新 draft，操作成本高。  
**相關合約：** `PublishPublicInfoVersionCommand.effectiveFrom?: string | null; effectiveTo?: string | null`（contracts:955-959）。服務端會接受並套用（`platform-admin.service.ts:329-331`），UI 沒有呈現此能力。

---

#### GAP-SB-005 — Placard 無獨立 "Publish" 操作（P1）

**檔案：** `apps/platform-admin-web/app/switchboard/page.tsx:605-685`（Placards tab）  
**問題：** Placard 的 `publishedAt` 由服務端在 generate 時決定（若 source public info 已 published 則自動設定 `publishedAt`，否則為 null），UI 沒有任何方式在事後 publish 一張 draft placard（當 source 後來被 publish 時）。  
**影響：** 若先建立 placard（source 為 draft），待 source publish 後，placard 仍顯示為 draft（badge 為 `admin-badge--warning`），無法升級狀態，需要刪除重建。  
**API 缺口：** `packages/api-client/src/index.ts` 沒有 `publishPlacardVersion()` 方法；controller 沒有對應 `POST /api/platform-admin/placards/:placardVersionId/publish` endpoint。

---

#### GAP-SB-006 — Placard form 不阻擋對 retired source 的選擇（P2）

**檔案：** `apps/platform-admin-web/app/switchboard/page.tsx:448-465`  
**問題：** Placard generation form 的 source version 下拉選單列出**所有** public info versions（含 `retired` 狀態），只顯示 `title (status)` 文字。只有在選取後才透過 `selectedPublicInfoVersion.status` 判斷顯示提示文字（L511-515），但提示僅說明 draft 的後果，對 retired source 沒有明確警告，也沒有阻止提交。  
**影響：** 可以從已退役的合規版本產生新 placard，這在合規語意上通常是不被允許的操作。  
**修正建議：** 在選單中對 retired 版本加視覺警告或直接禁止選取 retired source。

---

#### GAP-SB-007 — `versionCode` 無前端唯一性預檢（P2）

**檔案：** `apps/platform-admin-web/app/switchboard/page.tsx:519-529`  
**問題：** Generate placard 表單提交後，若 `versionCode` 重複，服務端會回傳 `PLACARD_VERSION_CODE_CONFLICT` 409 錯誤，錯誤訊息顯示在頁面頂端的 error banner（L217-224）。但使用者無法在提交前得知衝突，且看到 error 後需要重新找到 versionCode 欄位，UX 不佳。  
**影響：** 可預防的 round-trip 錯誤；對高頻操作用戶造成干擾。

---

#### GAP-SB-008 — 日期欄位為自由文字，無格式驗證（P2）

**檔案：** `apps/platform-admin-web/app/switchboard/page.tsx:357-383`（effectiveFrom/effectiveTo 欄位）  
**問題：** `effectiveFrom` 和 `effectiveTo` 均為 `<input type="text">`，placeholder 為 ISO timestamp 範例，但沒有 `type="datetime-local"` 或任何 client-side 格式驗證。  
**影響：** 使用者輸入無效日期字串（如 `"2026/07/01"` 或 `"下週"`) 後，服務端的 `normalizeNullableText` 只做 trim/null 處理，不驗證日期格式，導致 record 接受非 ISO 字串；UI 的 `formatDateTime()` 仍會嘗試以 `new Date(iso)` 呈現，最終可能出現無法正規化的日期顯示。

---

#### GAP-SB-009 — Error banner 在 form 關閉後不自動清除（P3）

**檔案：** `apps/platform-admin-web/app/switchboard/page.tsx:73`、`286-300`  
**問題：** `error` state 在每次 API 呼叫開始時清除（`setError(null)`），但若使用者在看到錯誤後按 "Cancel" 關閉 form，error banner 仍持續顯示直到下一次 API 呼叫。  
**影響：** UX 混淆，使用者可能誤以為 error 尚未解決。

---

#### GAP-SB-010 — 無分頁機制（P3，近期低風險）

**檔案：** `apps/platform-admin-web/app/switchboard/page.tsx:87-91`；`platform-admin.controller.ts:22-30`、`59-66`  
**問題：** `listPublicInfoVersions()` 和 `listPlacardVersions()` 回傳整個 in-memory 陣列，API 介面不支援分頁（無 `limit`/`offset` 或 cursor）。  
**影響：** 目前為 in-memory store，記錄量有限，近期不構成效能問題；但 API surface 若未來遷移至 DB 而無分頁，潛在效能缺口。列入記錄，不視為當前阻斷。

---

### Gap Priority Summary

| ID         | 優先 | 說明                                         | 是否阻斷 GAP-P2S2-008 parent         |
| ---------- | ---- | -------------------------------------------- | ------------------------------------ |
| GAP-SB-001 | P0   | `publishedBy` 硬編碼，audit trail 不完整     | 不阻斷（依賴 GAP-P2S3-001 根本修正） |
| GAP-SB-002 | P1   | 無手動 retire published version              | 不阻斷（需新 endpoint）              |
| GAP-SB-003 | P1   | 無刪除 draft version                         | 不阻斷（需新 endpoint）              |
| GAP-SB-004 | P1   | publish 時無法覆寫 effectiveFrom/effectiveTo | 不阻斷（UI gap，API 已支援）         |
| GAP-SB-005 | P1   | placard 無獨立 publish 操作                  | 不阻斷（需新 endpoint）              |
| GAP-SB-006 | P2   | retired source 無明確阻擋                    | 不阻斷                               |
| GAP-SB-007 | P2   | versionCode 無前端唯一性預檢                 | 不阻斷                               |
| GAP-SB-008 | P2   | 日期欄位無格式驗證                           | 不阻斷                               |
| GAP-SB-009 | P3   | error banner 在 form 關閉後不清除            | 不阻斷                               |
| GAP-SB-010 | P3   | 無分頁（近期低風險）                         | 不阻斷                               |

**Parent task 判斷：** GAP-P2S2-008 是 XS capability audit（回報 gap，非實作），以上 10 個 gap 完整記錄即完成任務目標。所有 gap 的修正屬於 follow-up tickets，不在本 task 範圍。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`GAP-P2S2-008.depends_on` = `-`（無正式上游依賴）。

| Dep      | Source | Status | Notes                                  |
| -------- | ------ | ------ | -------------------------------------- |
| _(none)_ | -      | -      | 無正式上游依賴；此 task 可完全平行執行 |

### Practical Context Dependencies

| Dep   | Type                                                                         | Why It Matters                                                                                                                           |
| ----- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1 | Planning consensus (`gap-phase2-planning-20260417/starter-draft.md:215-223`) | 定義本任務為 capability audit（非實作），確認頁面已有 list/create/publish public info + generate placard 功能，要求審核是否有 hidden gap |
| D-P-2 | `gap-phase2-planning-20260417/consensus-packet.md:46`                        | 確認 Codex ownership、XS sizing、無上游依賴                                                                                              |
| D-P-3 | `gap-phase2-planning-20260417/review-round-1.md:29`                          | 確認任務重新定性為 capability audit，不是空殼 stub 判斷                                                                                  |
| D-P-4 | `apps/platform-admin-web/app/switchboard/page.tsx`                           | 審計目標，完整讀取 (730 行) 後取得所有現況能力                                                                                           |
| D-P-5 | `apps/api/src/modules/platform-admin/platform-admin.controller.ts`           | 後端 endpoint 對照，確認 UI 呼叫與 controller route 的對應關係                                                                           |
| D-P-6 | `apps/api/src/modules/platform-admin/platform-admin.service.ts`              | 服務層邏輯（auto-retire on publish、placard publishedAt derivation 等），gap 根因分析用                                                  |
| D-P-7 | `packages/contracts/src/index.ts:920-982`                                    | PublicInfoVersionRecord/PlacardVersionRecord/命令型別，gap 分析的合約依據                                                                |
| D-P-8 | `packages/api-client/src/index.ts:898-936`                                   | 客戶端方法列表，確認哪些操作已有 client method、哪些缺失                                                                                 |

### Gap-to-Task Forward Dependencies（建議 follow-up tickets）

| Gap        | 建議後續任務                                                                                            | 原因                  |
| ---------- | ------------------------------------------------------------------------------------------------------- | --------------------- |
| GAP-SB-001 | `GAP-P2S3-001`（Cloud IAP/OIDC）完成後，UI publishedBy 從 auth session 取得                             | 根本修正依賴真實 auth |
| GAP-SB-002 | 新增 `POST /api/platform-admin/public-info/:versionId/retire` endpoint + UI "Retire" 按鈕               | 需服務端新 endpoint   |
| GAP-SB-003 | 新增 `DELETE /api/platform-admin/public-info/:versionId` (draft only) endpoint + UI "Delete draft" 按鈕 | 需服務端新 endpoint   |
| GAP-SB-004 | Publish 表單加 effectiveFrom/effectiveTo 覆寫欄位（UI only，API 已支援）                                | 純 UI change          |
| GAP-SB-005 | 新增 `POST /api/platform-admin/placards/:placardVersionId/publish` endpoint + UI "Publish placard" 按鈕 | 需服務端新 endpoint   |
| GAP-SB-006 | Placard source 選單 retired 項目禁用或加警告（UI only）                                                 | 純 UI change          |
| GAP-SB-007 | Generate form 加 versionCode 衝突預檢（UI only，可用既有 placard list 做 local check）                  | 純 UI change          |
| GAP-SB-008 | effectiveFrom/effectiveTo 改用 `type="datetime-local"` + ISO 轉換                                       | 純 UI change          |
| GAP-SB-009 | form 的 "Cancel" handler 加 `setError(null)`                                                            | 純 UI change（1 LOC） |
| GAP-SB-010 | DB 遷移前置任務再評估；API 介面先加 limit/offset 參數（optional, default unlimited）                    | 架構前置              |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md` (`:215-223`, E-1)
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md` (GAP-P2S2-008 row)
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-1.md` (`:29`, capability audit re-framing)
- Repo anchors:
  - `apps/platform-admin-web/app/switchboard/page.tsx` (audit target, 730 lines, complete read)
  - `apps/platform-admin-web/lib/admin-client.ts` (usePlatformAdminClient hook, ACTOR_ID hardcode)
  - `apps/api/src/modules/platform-admin/platform-admin.controller.ts` (backend routes)
  - `apps/api/src/modules/platform-admin/platform-admin.service.ts` (service logic, auto-retire, placard publish derivation)
  - `packages/contracts/src/index.ts:920-982` (PublicInfoVersionRecord, PlacardVersionRecord, commands)
  - `packages/api-client/src/index.ts:898-936` (client method coverage)

---

## 5) Evidence Inventory

| ID   | Evidence                                                                                                    | Expected Anchor                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent task is XS capability audit work with no upstream dep; packet re-validated after parent moved active | `ai-status.json`, `current-work.md` GAP-P2S2-008 row                                                                  |
| E-2  | Capability audit framing (not stub check)                                                                   | `starter-draft.md:215-223` (E-1 section), `review-round-1.md:29`                                                      |
| E-3  | 5 covered operations (list/create/publish public-info, list/generate placard)                               | `switchboard/page.tsx:83-200`, `platform-admin.controller.ts:22-78`                                                   |
| E-4  | GAP-SB-001: `publishedBy` hardcoded                                                                         | `switchboard/page.tsx:168`, `admin-client.ts:13`                                                                      |
| E-5  | GAP-SB-002: no retire endpoint in controller or client                                                      | `platform-admin.controller.ts` — only create/publish/list; `packages/api-client/src/index.ts:898-936`                 |
| E-6  | GAP-SB-003: no delete draft endpoint                                                                        | same — no DELETE route in controller                                                                                  |
| E-7  | GAP-SB-004: PublishPublicInfoVersionCommand supports effectiveFrom/effectiveTo override, UI doesn't pass it | `contracts:955-959`; `switchboard/page.tsx:167-170`; `service.ts:329-331`                                             |
| E-8  | GAP-SB-005: placard publishedAt derived at generation, no publish-placard endpoint                          | `platform-admin.service.ts:412-415`; no POST /placards/:id/publish in controller                                      |
| E-9  | GAP-SB-006: retired source not blocked in placard form                                                      | `switchboard/page.tsx:459-465` (all statuses listed), `switchboard/page.tsx:511-515` (draft-only warning hint)        |
| E-10 | GAP-SB-007: no client-side versionCode uniqueness check                                                     | `switchboard/page.tsx:519-529` (submit guard only checks publicInfoVersionId is non-empty)                            |
| E-11 | GAP-SB-008: date fields are plain text inputs                                                               | `switchboard/page.tsx:357-383` (`<input>` no `type="datetime-local"`, no validation)                                  |
| E-12 | GAP-SB-009: error banner not cleared on form cancel                                                         | `switchboard/page.tsx:286-300` (cancel toggle only calls setShowPublicInfoForm, no setError(null))                    |
| E-13 | GAP-SB-010: no pagination on list endpoints                                                                 | `platform-admin.controller.ts:22-30`, `59-66` (no query params); `api-client:900-903`, `927-929` (no pagination args) |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S2-008` 是 `backlog`（XS audit 任務，未實作），owner=`Codex`，無上游依賴；sidecar 目前是 `review`，owner=`Claude`，reviewer=`Codex`，且 `Claude -> Codex` handoff 已記錄於共享 machine truth。
2. Gap inventory 是否完整且有 repo 證據錨點：10 個 gap（GAP-SB-001 至 GAP-SB-010）每個都有 file:line 引用，不是憑空推測。
3. GAP-SB-001（publishedBy 硬編碼）是否正確標注為 P0 合規缺口，且正確連結 GAP-P2S3-001 根本修正路徑。
4. GAP-SB-002 至 GAP-SB-005 是否正確識別為 lifecycle 操作缺口（需新 endpoint），區別於 GAP-SB-006 至 GAP-SB-009（純 UI 修正）。
5. 此 sidecar 是否完全沒有修改任何 canonical truth 或主線 runtime。
6. 是否正確區分「audit 任務完成條件」（列出所有 gap）與「gap 修正任務」（屬於後續 follow-up tickets，不在本 task 範圍）。

**建議核准用語：**

> `GAP-P2S2-008 acceptance packet ready: machine truth shows parent backlog (XS capability audit, no upstream dep), switchboard/page.tsx covers 5 operations (list/create/publish public-info, list/generate placard), 10 gaps correctly identified with repo evidence anchors (GAP-SB-001 P0 publishedBy hardcode audit trail gap linked to GAP-P2S3-001, GAP-SB-002 to SB-005 P1 lifecycle endpoint gaps, GAP-SB-006 to SB-009 P2/P3 UI-only fixes, GAP-SB-010 P3 pagination note), correct follow-up task routing, sidecar stays within support-only boundaries without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / incomplete gap coverage / missing repo evidence anchors / incorrect priority classification / scope drift into canonical truth modification / follow-up routing incorrect]`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff GAP-P2S2-008-SIDECAR-ACCEPTANCE Codex "GAP-P2S2-008 capability audit acceptance packet ready at support/sidecars/GAP-P2S2-008/GAP-P2S2-008-SIDECAR-ACCEPTANCE.md. Full repo scan of switchboard/page.tsx (730 lines), platform-admin.controller.ts, platform-admin.service.ts, contracts, and api-client confirms 5 covered operations and 10 hidden gaps (GAP-SB-001 P0 publishedBy hardcode/audit-trail, GAP-SB-002 no retire-published endpoint, GAP-SB-003 no delete-draft endpoint, GAP-SB-004 publish-time effectiveFrom/effectiveTo override missing in UI, GAP-SB-005 no independent placard publish action, GAP-SB-006 retired source not blocked in placard form, GAP-SB-007 no versionCode client-side uniqueness check, GAP-SB-008 date fields lack validation, GAP-SB-009 error banner not cleared on cancel, GAP-SB-010 no pagination). All gaps have file:line evidence anchors. No canonical truth modified."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S2-008-SIDECAR-ACCEPTANCE "GAP-P2S2-008 acceptance packet ready: machine truth shows parent backlog (XS capability audit, no upstream dep), switchboard/page.tsx covers 5 operations (list/create/publish public-info, list/generate placard), 10 gaps correctly identified with repo evidence anchors (GAP-SB-001 P0 publishedBy hardcode audit trail gap linked to GAP-P2S3-001, GAP-SB-002 to SB-005 P1 lifecycle endpoint gaps, GAP-SB-006 to SB-009 P2/P3 UI-only fixes, GAP-SB-010 P3 pagination note), correct follow-up task routing, sidecar stays within support-only boundaries without mutating canonical truth."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S2-008-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / incomplete gap coverage / missing repo evidence anchors / incorrect priority classification / scope drift into canonical truth modification / follow-up routing incorrect]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done GAP-P2S2-008-SIDECAR-ACCEPTANCE "Owner finalized approved support-only capability audit acceptance packet for GAP-P2S2-008 at support/sidecars/GAP-P2S2-008/GAP-P2S2-008-SIDECAR-ACCEPTANCE.md. Packet covers: 5 confirmed switchboard operations, 10 gap items (GAP-SB-001 to GAP-SB-010) each with file:line evidence anchors and priority classification, follow-up task routing map, dependency map, and reviewer handoff path. No canonical truth modified."
```

---

## 10) Change Log

- 2026-04-17T17:41Z — 初版建立：依共享 machine truth、consensus docs（`gap-phase2-planning-20260417/starter-draft.md:215-223` E-1 segment、`consensus-packet.md` GAP-P2S2-008 row、`review-round-1.md:29`）與完整 repo 掃描（`switchboard/page.tsx` 730 行完整讀取，`platform-admin.controller.ts`、`platform-admin.service.ts`、`packages/contracts/src/index.ts:920-982`、`packages/api-client/src/index.ts:898-936`），整理 `GAP-P2S2-008` 的 capability audit 結果（5 已覆蓋操作 + 10 個 hidden gap GAP-SB-001 至 GAP-SB-010，含 P0 合規缺口、P1 lifecycle 缺口、P2/P3 UX 問題）、dependency map、follow-up task routing、以及 reviewer handoff 指引。
- 2026-04-17T17:43Z — reviewer metadata correction：將 sidecar current-state 由 `in_progress` 修正為 shared machine truth 的 `review`（含 `Claude -> Codex` 於 `2026-04-17T17:41:18Z` handoff），並將 `switchboard/page.tsx` 行數引用由 731 更正為實際 730 行；audit 結論與 gap inventory 不變。
- 2026-04-17T17:44Z — reviewer wording correction：收斂 GAP-SB-008 的影響敘述，只保留目前 repo 證據可支持的事實（服務端接受非 ISO 字串、UI 可能出現無法正規化的日期顯示），不再額外假設資料庫落地型態或 `formatDateTime()` fallback 行為。
- 2026-04-18T05:52Z — parent closeout re-validation：`Codex` 重新核對 switchboard page、admin client、controller、service、contracts、api-client 與目前 machine truth；確認 packet 內 5 項已覆蓋能力與 10 項 gap inventory 仍然成立，無新 endpoint 或 UI 修正會改變優先級分類。此 packet 維持作為 `GAP-P2S2-008` 的正式 closeout evidence。
