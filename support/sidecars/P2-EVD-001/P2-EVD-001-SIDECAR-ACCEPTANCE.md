# P2-EVD-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `P2-EVD-001` — Onboard evidence recorder adapter + registry + health + segment index
**Current Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Codex2`
**Parent Owner:** `Codex2` (per machine truth; parent `status=review`, `reviewer=Codex`, `depends_on: P2-WP0`)
**Last Revised:** `2026-06-26T01:03Z (UTC)`
**Status:** `in_progress` (sidecar reopened by reviewer for task-state realignment; Claude is revising, then re-handoff to `Codex2`)

---

## 1) Scope Boundary

本 sidecar 只整理 `P2-EVD-001` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing、dependency mapping、repo-scan evidence anchors、vehicle-evidence module baseline（scaffold 現況）、recorder adapter/registry/health/segment-index/bookmark/upload-retry/mock-recorder 的 acceptance criteria、unhealthy⇒no-new-dispatch 訊號契約、reviewer checklist。
- **Out of scope:** 修改 `apps/api/src/modules/vehicle-evidence/**` 主線 runtime、修改 `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` 或 `packages/contracts/src/index.ts`（L1 contract 真相）、新增/修改 `infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql` 或任何 DB migration、修改 `sandbox-dispatch-gate` 模組、或以任何方式變更 L1 canonical truth 與 governance 實作。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`（透過 `scripts/ai-status.sh show`）、`current-work.md` 與目前 repo 掃描為準：

- 父任務 `P2-EVD-001` 在 machine truth 中目前是 `review`（已從 `in_progress` 前進），Owner=`Codex2`，Reviewer=`Codex`，正式依賴為 `P2-WP0`，`last_update=2026-06-26T01:00:51Z`。Codex2 回報已實作 recorder registry/controller、mock recorder adapter、8 維度 health snapshot、no-new-dispatch 訊號與 sandbox dispatch gate 整合、segment index、bookmark、upload retry、shared fixtures 及 unit/integration 測試，commit `b545a10ed` 推送至 `origin/codex2/p2-evd-001`，目前由 reviewer `Codex` 審查中（typecheck 仍卡在 pre-existing repo baseline 問題，非本 task）。
- 本 sidecar `P2-EVD-001-SIDECAR-ACCEPTANCE` 在 machine truth 中目前是 `in_progress`（由 reviewer `Codex2` reopen 以對齊 task-state narrative），Owner=`Claude`，Reviewer=`Codex2`，`task_class=sidecar`，`mutates_canonical=false`，`helper_kind=acceptance_packet`，`auto_created_by=supervisor-underutilization`。
- 依賴 `P2-WP0` 在 machine truth 中是 `done`，`integration_status=merged_to_dev`，commit `a00a3bbd7`（`P2-WP0: Phase2 Tesla/FSD/sandbox contracts + AV dispatch DD foundation`），`push_branch=dev`。**因此 P2-EVD-001 的唯一 formal upstream gate 已滿足**：contract DTO、av_evidence DDL skeleton 與 vehicle-evidence module scaffold 皆已落於 base（本 sidecar worktree HEAD = `a00a3bbd7`，即 base `dev`）。
- **基線視角說明**：下節 Repo Baseline Anchors 反映本 sidecar worktree 的 base `dev`（HEAD `a00a3bbd7`）——即 P2-EVD-001 **實作前**的起點。P2-EVD-001 主線實作目前位於 parent branch `codex2/p2-evd-001`（commit `b545a10ed`，尚未 merge 回 dev），因此 base `dev` 上仍是 interface-only adapter 與 scaffold-only service。本 acceptance checklist（§3）即為審 parent 那份 branch 實作時的對照框架；reviewer 對「是否已實作」的判定應以 parent branch / parent task review 為準，而非 base dev 掃描。

### Repo Baseline Anchors（base `dev`, worktree HEAD `a00a3bbd7` — P2-EVD-001 實作前起點）

- [`apps/api/src/modules/vehicle-evidence/vehicle-evidence.ports.ts`](../../../apps/api/src/modules/vehicle-evidence/vehicle-evidence.ports.ts) — `EvidenceRecorderAdapter` interface（`:16-19`）僅有 `captureWindow(request): Promise<EvidenceManifestItem[]>` 與 `verifyChecksum(artifactId): Promise<boolean>`；**interface-only**，無 health/registry/segment-index 方法；`EvidenceCaptureRequest`（`:9-14`）只含 `vehicleId/windowStart/windowEnd/caseId?`。
- [`apps/api/src/modules/vehicle-evidence/vehicle-evidence.service.ts`](../../../apps/api/src/modules/vehicle-evidence/vehicle-evidence.service.ts) — scaffold-only：`recorderAdapter: EvidenceRecorderAdapter | null = null`（`:18`），**無** registry、health 評估、segment index、bookmark、upload retry、或 av_evidence persistence 邏輯。
- [`apps/api/src/modules/vehicle-evidence/vehicle-evidence.module.ts`](../../../apps/api/src/modules/vehicle-evidence/vehicle-evidence.module.ts) — 已於 `apps/api/src/app.module.ts`（import `:60`、registration `:107`）註冊 `VehicleEvidenceModule`。
- [`packages/contracts/src/phase2-tesla-fsd-sandbox.ts`](../../../packages/contracts/src/phase2-tesla-fsd-sandbox.ts) — 已有 `EVIDENCE_ARTIFACT_TYPES`（`:329`）、`EvidenceArtifactType`（`:337`）、`EvidenceCustodyState`（`:338-348`：captured/uploaded/verified/sealed/released/purged）、`EvidenceManifestItem`（`:352`）、`EvidenceManifest`（`:373`）、`Phase2SourceMetadata`（`onboard_recorder` source system `:26`）。
- **尚不存在的 contract 型別**（grep 確認）：`RecorderHealth*`、`RecorderRegistration*`、`SegmentIndex*`、`EvidenceBookmark*`、`UploadQueue*`、device-id/clock-sync/storage/camera/firmware health 維度型別——皆**不存在**於 contracts，屬 P2-EVD-001 主線新增範圍。
- [`infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql`](../../../infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql) — 已建 `av_evidence.evidence_manifests`（`:214`）、`av_evidence.evidence_manifest_items`（`:228`）、`av_evidence.accident_cases`（`:258`）、`av_evidence.regulatory_report_filings`（`:285`）。**尚不存在** recorder 註冊表、recorder health snapshot 表、segment index 表、event bookmark 表——若 P2-EVD-001 需持久化這些，屬其主線新增（須以新 migration，不得改 V0037）。

### Gap Summary

| 問題 | 影響 | 根本原因 |
| --- | --- | --- |
| Recorder adapter 僅 interface（`captureWindow`/`verifyChecksum`），無 registry | 無法登記/查詢車載 recorder vendor adapter | P2-EVD-001 尚未實作 registry |
| 無 recorder health endpoint（8 維度：device-id/clock-sync/storage/camera/last-segment/encryption/upload-queue/firmware） | gate 收不到 recorder 健康狀態，無法判斷 required-recorder-unhealthy | health 評估邏輯缺失 |
| 無 unhealthy⇒no-new-dispatch 訊號契約 | required recorder unhealthy 時 dispatch gate 無法阻擋新派工 | 跨模組訊號未定義 |
| 無 segment index / event bookmark 查詢 | 事故調查/證據檢索無法定位影片片段或書籤 | service 層查詢缺失 |
| 無 upload retry 機制 | 上傳佇列失敗無法重試，影響 chain-of-custody 完整性 | retry 邏輯缺失 |
| 無 mock recorder | 單元/整合測試無可驅動的測試替身 | 測試 fixture 缺失 |

---

## 3) Parent Acceptance Framing

`P2-EVD-001` 在 machine truth 中的 `acceptance[]` 為單行：

> "Recorder registry + health endpoints live; unhealthy state emits no-new-dispatch signal consumed by gate; segment index + bookmark queryable; mock recorder drives tests; unit+integration green"

以下 checklist 依該 acceptance 行與 parent `summary_zh`（spec 06 §3 / WBS P2-EVD-001：recorder vendor adapter interface + registry；health 8 維度；segment index；event bookmark；upload retry；mock recorder；required recorder unhealthy⇒no-new-dispatch 訊號給 gate；不依賴路側、不參與 FSD 控制）展開為 reviewer-facing checklist，不新增產品語意。

### AC-0 — 依賴 gate：P2-WP0 已落地（已滿足）

- [x] `P2-WP0` 為 `done` / `merged_to_dev`（commit `a00a3bbd7`），contract DTO、`av_evidence` DDL skeleton、vehicle-evidence module scaffold 已於 base 可用。
- [ ] P2-EVD-001 實作以既有 `EvidenceManifestItem` / `EvidenceCustodyState` / `Phase2SourceMetadata` 契約為基礎，不重新定義已存在型別。

### AC-1 — Recorder vendor adapter interface + registry

- [ ] 沿用/擴充 `EvidenceRecorderAdapter`（`vehicle-evidence.ports.ts:16-19`）的 vendor adapter port，新增 registry 以可由 `vehicleId`（或 recorder id）登記/解析具體 adapter。
- [ ] Registry 支援多 vendor adapter 註冊，並提供查詢「某車輛對應哪個 recorder adapter」的能力。
- [ ] Interface 變更（若有）與既有 `captureWindow` / `verifyChecksum` 簽章相容，不破壞既有 scaffold import。
- [ ] mock recorder 可被註冊進 registry 作為測試實作（見 AC-6）。

### AC-2 — Recorder health endpoint（8 維度）

- [ ] 提供 recorder health endpoint/服務，回報 parent summary 指定的 8 個維度：`device-id`、`clock-sync`、`storage`、`camera`、`last-segment`、`encryption`、`upload-queue`、`firmware`。
- [ ] 每個維度有明確 healthy/unhealthy（或等價 enum）判定，並彙整為單一 recorder 健康結論。
- [ ] health 回應以既有 controller 慣例包裝（`toApiSuccessEnvelope` 或對齊 phase2 module 既有回應格式）；新增 health DTO 應 export 自 contracts 並沿用 `Phase2SourceMetadata` provenance 模式。
- [ ] health 查詢為唯讀，不改動 `av_evidence` manifest 資料。

### AC-3 — Unhealthy ⇒ no-new-dispatch 訊號（gate 消費）

- [ ] 當 **required** recorder 為 unhealthy 時，emit 一個 no-new-dispatch 訊號，供 `sandbox-dispatch-gate` 消費；非 required recorder unhealthy 不應阻擋派工。
- [ ] 訊號契約（型別/事件/查詢介面）明確定義 required-recorder-unhealthy 語意，gate 端可消費而不需反向 import vehicle-evidence 內部實作。
- [ ] 訊號為「阻擋新派工」語意，不中斷進行中的行程（與 parent「不參與 FSD 控制、不依賴路側」一致）。
- [ ] 本 sidecar 不修改 `sandbox-dispatch-gate` 模組；gate 端消費由 parent owner 或下游 task 銜接。

### AC-4 — Segment index + event bookmark 可查詢

- [ ] 提供 segment index 查詢，可依 `vehicleId` + 時間窗（對齊 `EvidenceCaptureRequest.windowStart/windowEnd`）定位影片片段。
- [ ] 提供 event bookmark 建立/查詢，可在 segment 上標記事件時間點（供事故調查 / accident-investigation 模組後續銜接）。
- [ ] 查詢回應沿用既有 `EvidenceManifestItem` / `EvidenceManifest` 契約或在其上延伸，不另立平行平行真相。
- [ ] 若需持久化 segment index / bookmark，使用新 migration（不得修改 V0037），schema 命名/ownership 對齊 Phase1 慣例與 `av_evidence` schema。

### AC-5 — Upload retry

- [ ] upload-queue 失敗的證據上傳具備 retry 機制（bounded retry / backoff，避免無限重試）。
- [ ] retry 狀態反映在 recorder health 的 `upload-queue` 維度（AC-2），unhealthy 時可觸發 AC-3 訊號。
- [ ] retry 不破壞 chain-of-custody：重試上傳沿用相同 `checksumSha256`，不重新計算或竄改 artifact 完整性戳記。

### AC-6 — Mock recorder 驅動測試

- [ ] 提供 mock `EvidenceRecorderAdapter` 實作，可註冊進 registry（AC-1），用於單元/整合測試。
- [ ] mock recorder 可模擬 healthy / 各維度 unhealthy 狀態，以驗證 AC-2 health 判定與 AC-3 no-new-dispatch 訊號。
- [ ] mock recorder 置於測試/ fixtures 範圍（對齊 parent artifact `packages/shared-test-fixtures/`），不洩漏進 production wiring 預設值。

### AC-7 — 測試與型別安全

- [ ] 新增/變更的 contract 型別於 `packages/contracts` 正確 export，`pnpm --filter @drts/contracts build`（或 typecheck）通過。
- [ ] `pnpm --filter @drts/api typecheck` 通過，無新增 TypeScript 錯誤；不以 `as any` 繞過 recorder health / segment query 型別。
- [ ] unit + integration 測試綠燈（對齊 parent acceptance「unit+integration green」）；mock recorder 驅動 health / unhealthy-signal / segment / bookmark / retry 路徑。

### AC-8 — Scope 邊界（不越線）

- [ ] 不參與 FSD 控制、不依賴路側基礎設施（與 parent summary 一致）。
- [ ] 不修改 `sandbox-dispatch-gate`、`accident-investigation`、`regulatory-reporting` 等其他模組主線（僅定義可被消費的訊號/查詢契約）。
- [ ] 不修改 V0037 migration；新表以新 migration 落地。
- [ ] 不重新定義 P2-WP0 已建立的 `EvidenceManifestItem` / `EvidenceCustodyState` / `Phase2SourceMetadata` 契約。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`P2-EVD-001.depends_on` = `P2-WP0`。

| Dep | Source | Status | Notes |
| --- | --- | --- | --- |
| D-UP-1 | `P2-WP0` | `done` / `merged_to_dev` (`a00a3bbd7`) | **已滿足**：contract DTO（`EvidenceManifestItem` 等）、`av_evidence` DDL skeleton（V0037）、vehicle-evidence module scaffold 皆已落地，P2-EVD-001 可直接在其上實作 |

### Practical Context Dependencies

| Dep | Type | Why It Matters |
| --- | --- | --- |
| D-P-1 | Contract baseline (`phase2-tesla-fsd-sandbox.ts:329-380`) | `EvidenceManifestItem` / `EvidenceCustodyState` / `EVIDENCE_ARTIFACT_TYPES` 提供 manifest 與 custody 契約，P2-EVD-001 應沿用 |
| D-P-2 | Adapter port baseline (`vehicle-evidence.ports.ts:16-19`) | `EvidenceRecorderAdapter` interface 為 registry/health 的起點 |
| D-P-3 | Migration baseline (`V0037:214-309`) | `av_evidence.evidence_manifests` / `evidence_manifest_items` 提供持久化基礎；新表須以新 migration 對齊此 schema |
| D-P-4 | Module wiring (`app.module.ts:60,107`) | `VehicleEvidenceModule` 已註冊，實作不需重新接線 app module |

### Forward (Downstream) Dependencies

| Dep | Why It Matters |
| --- | --- |
| D-FWD-1 | `sandbox-dispatch-gate` — 消費本 task 的 required-recorder-unhealthy ⇒ no-new-dispatch 訊號（AC-3）；gate 端銜接屬下游 |
| D-FWD-2 | `accident-investigation` — 消費本 task 的 segment index / event bookmark（AC-4）以重建事故證據 |
| D-FWD-3 | `regulatory-reporting` — 引用 evidence manifest / custody 狀態做法規申報（既有 `av_evidence.regulatory_report_filings` 已 reference manifest）|

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`（透過 `scripts/ai-status.sh show P2-EVD-001` / `... P2-EVD-001-SIDECAR-ACCEPTANCE` / `... P2-WP0`）
  - `current-work.md`（人類摘要，非 machine truth）
- Contract / migration / module anchors（worktree HEAD `a00a3bbd7`）:
  - `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`（EVIDENCE_ARTIFACT_TYPES/EvidenceCustodyState/EvidenceManifestItem/EvidenceManifest/Phase2SourceMetadata）
  - `apps/api/src/modules/vehicle-evidence/vehicle-evidence.ports.ts`（EvidenceRecorderAdapter interface-only）
  - `apps/api/src/modules/vehicle-evidence/vehicle-evidence.service.ts`（scaffold，recorderAdapter null）
  - `apps/api/src/modules/vehicle-evidence/vehicle-evidence.module.ts` + `apps/api/src/app.module.ts:60,107`
  - `infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql:214-309`（av_evidence tables；無 recorder/health/segment/bookmark 表）

---

## 5) Evidence Inventory

| ID | Evidence | Expected Anchor |
| --- | --- | --- |
| E-1 | Parent / dependency / sidecar machine state | `scripts/ai-status.sh show P2-EVD-001` / `P2-WP0` / `P2-EVD-001-SIDECAR-ACCEPTANCE` |
| E-2 | P2-WP0 done + merged_to_dev (`a00a3bbd7`) | `P2-WP0.integration_status=merged_to_dev`, `commit_hash` |
| E-3 | EvidenceManifestItem / custody contracts exist | `phase2-tesla-fsd-sandbox.ts:329-372` |
| E-4 | EvidenceRecorderAdapter interface-only (no registry/health) | `vehicle-evidence.ports.ts:16-19` |
| E-5 | Service scaffold, no registry/health/segment/retry logic | `vehicle-evidence.service.ts:18` |
| E-6 | No RecorderHealth/SegmentIndex/Bookmark/UploadQueue contracts | grep on `phase2-tesla-fsd-sandbox.ts` — absent |
| E-7 | av_evidence manifests/items tables exist; no recorder/health/segment table | `V0037:214-309` |
| E-8 | VehicleEvidenceModule registered | `app.module.ts:60,107` |
| E-9 | onboard_recorder source system present | `phase2-tesla-fsd-sandbox.ts:26` |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `P2-EVD-001` 是 `review`（impl 在 parent branch `codex2/p2-evd-001` commit `b545a10ed`，reviewer=`Codex` 審查中），owner=`Codex2`，depends_on=`P2-WP0`（已 `done`/`merged_to_dev`）；sidecar 是 `in_progress`（reopen 後重新對齊），owner=`Claude`，reviewer=`Codex2`。§2 已說明 baseline anchors 取自 base `dev`（實作前起點），parent 實作另在 branch。
2. AC-0/AC-1 是否正確以 P2-WP0 既有契約與 `EvidenceRecorderAdapter` interface 為起點，不重新定義已存在型別。
3. AC-2 是否完整涵蓋 8 個 health 維度（device-id/clock-sync/storage/camera/last-segment/encryption/upload-queue/firmware）。
4. AC-3 是否正確界定 **required** recorder unhealthy ⇒ no-new-dispatch 訊號語意（阻擋新派工、不中斷進行中行程、不參與 FSD 控制），且 sidecar 不修改 gate 模組。
5. AC-4/AC-5 是否合理：segment index/bookmark 沿用 manifest 契約、新表用新 migration（不改 V0037）、upload retry 不破壞 checksum chain-of-custody。
6. AC-6 mock recorder 是否限定在測試/fixtures 範圍（`packages/shared-test-fixtures/`），不污染 production wiring。
7. support artifact 是否完全沒有修改 canonical truth、contracts、migration 或主線 runtime。

**建議核准用語：**

> `P2-EVD-001 acceptance packet ready: preserves machine truth (parent in review owner Codex2 reviewer Codex with impl on codex2/p2-evd-001 b545a10ed, dep P2-WP0 done/merged_to_dev), grounds baseline in real base-dev anchors (EvidenceRecorderAdapter interface-only, av_evidence V0037 manifests, no recorder/health/segment contracts on base yet — parent impl lives on its branch), AC checklist covers registry + 8-dimension health + required-recorder-unhealthy no-new-dispatch signal + segment index/bookmark + bounded upload retry + mock recorder + unit/integration green, correctly forbids gate-module edits, V0037 mutation, and contract redefinition, and stays within support-only sidecar boundaries.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / scope drift / missing health dimension / wrong required-vs-nonrequired signal semantics / segment/bookmark contract drift / retry chain-of-custody gap / mock recorder leaking into production wiring / overclaimed coverage].`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff P2-EVD-001-SIDECAR-ACCEPTANCE Codex2 "P2-EVD-001 acceptance packet revised at support/sidecars/P2-EVD-001/P2-EVD-001-SIDECAR-ACCEPTANCE.md. Task-state narrative realigned to current machine truth (parent now in review, owner Codex2 reviewer Codex, impl on codex2/p2-evd-001 b545a10ed; sidecar reopened to in_progress; dep P2-WP0 done/merged_to_dev a00a3bbd7), with an explicit perspective note that baseline anchors reflect base dev (EvidenceRecorderAdapter interface-only, vehicle-evidence service scaffold, av_evidence V0037 manifests/items, no recorder/health/segment/bookmark contracts on base) while parent impl lives on its branch, and lays out an AC checklist for recorder registry, 8-dimension health, required-recorder-unhealthy no-new-dispatch signal consumed by sandbox-dispatch-gate, segment index + event bookmark, bounded upload retry preserving checksum chain-of-custody, mock recorder, and unit/integration green — while forbidding gate-module edits, V0037 mutation, and contract redefinition. Support-only, canonical truth untouched."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve P2-EVD-001-SIDECAR-ACCEPTANCE "P2-EVD-001 acceptance packet ready: machine truth preserved (parent in review with impl on codex2/p2-evd-001 b545a10ed, dep P2-WP0 merged_to_dev), baseline anchored to real base-dev repo state with explicit parent-branch perspective note, AC checklist covers registry + 8-dimension health + required-recorder-unhealthy no-new-dispatch signal + segment index/bookmark + bounded upload retry + mock recorder + unit/integration green, correctly forbids gate edits / V0037 mutation / contract redefinition, support-only sidecar boundaries respected."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen P2-EVD-001-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / scope drift / missing health dimension / wrong required-vs-nonrequired signal semantics / segment/bookmark contract drift / retry chain-of-custody gap / mock recorder leaking into production wiring / overclaimed coverage]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude INTEGRATION_STATUS=not_applicable python3 scripts/ai_status.py done P2-EVD-001-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for P2-EVD-001 at support/sidecars/P2-EVD-001/P2-EVD-001-SIDECAR-ACCEPTANCE.md. The packet preserves machine truth, anchors the recorder registry/health/segment/bookmark/retry/mock acceptance checklist in real repo state (EvidenceRecorderAdapter interface, av_evidence V0037), maps the P2-WP0 upstream gate (already satisfied) and downstream gate/accident-investigation/regulatory-reporting consumers, and adds reviewer handoff path without changing canonical truth."
```

> 注意：此 sidecar 已對 `support/sidecars/P2-EVD-001/` 新增 support artifact，故 closeout 仍需 task-scoped commit + non-force push（提供 `COMMIT_HASH`/`COMMIT_SUBJECT`/`PUSH_REMOTE`/`PUSH_BRANCH`），`INTEGRATION_STATUS=not_applicable`（support-only，無 dev deploy 語意）。

---

## 10) Change Log

- 2026-06-26T01:03Z — 修訂（reviewer reopen 後）：對齊 task-state narrative 與當前 machine truth——parent `P2-EVD-001` 已從 `in_progress` 前進到 `review`（owner `Codex2`、reviewer `Codex`、impl 在 parent branch `codex2/p2-evd-001` commit `b545a10ed`），本 sidecar 由 reviewer reopen 回 `in_progress`。新增「基線視角說明」明確區分：Repo Baseline Anchors 取自本 sidecar worktree 的 base `dev`（HEAD `a00a3bbd7`，P2-EVD-001 實作前起點），parent 主線實作另在其 branch 尚未 merge 回 dev；同步更新 header、§2、§6 hotspot #1、§6/§7/§8 建議用語中所有過時的 task-state 字句。Repo/contract/migration baseline anchors（EvidenceRecorderAdapter interface-only、av_evidence V0037、module 註冊等）對 base dev 仍正確，未更動。
- 2026-06-26T00:57Z — 初版建立：依 machine truth（`scripts/ai-status.sh show` for P2-EVD-001 / P2-WP0 / sidecar）與 worktree HEAD `a00a3bbd7` repo 掃描（`phase2-tesla-fsd-sandbox.ts` evidence 契約、`vehicle-evidence.ports.ts` interface-only adapter、`vehicle-evidence.service.ts` scaffold、`V0037` av_evidence tables、`app.module.ts` 註冊），整理 `P2-EVD-001` 的 acceptance checklist（registry / 8-dimension health / required-recorder-unhealthy no-new-dispatch / segment index + bookmark / upload retry / mock recorder / unit+integration green）、P2-WP0 dependency gate（已滿足）、downstream gate/accident-investigation/regulatory-reporting 消費關係，以及 reviewer handoff 指引。
</content>
</invoke>
