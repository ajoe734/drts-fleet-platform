# GAP-P2S3-002 Acceptance Packet & Capability Audit

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S3-002` — ops-console: critical incident / SOS priority queue view  
**Current Sidecar Owner:** `Claude`  
**Assigned Reviewer:** `Codex`  
**Parent Owner:** `Codex2` (per machine truth, `status=backlog`, `depends_on: -`)  
**Last Revised:** `2026-04-17T18:21Z (UTC)`  
**Status:** `review` (Claude has prepared the packet; latest pending reviewer response belongs to `Codex` after the `2026-04-17T18:19:29Z` `Claude -> Codex` handoff)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S3-002` 的 acceptance checklist、capability audit 結果、gap inventory 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing, repo-scan capability audit evidence anchors, `incidents/page.tsx` current coverage map, identified gaps between current state and consensus requirement, dependency map, reviewer checklist.
- **Out of scope:** 修改 `apps/ops-console-web/app/incidents/page.tsx`、任何後端 controller/service/repository 主線 runtime，修改 `packages/contracts/src/index.ts`（L1 真相），新增任何實作或 DB migration，或修改任何非 ops-console incidents 模組。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S3-002` 在 machine truth 中目前是 `backlog`，Owner=`Codex2`，無正式上游依賴（`depends_on: -`），sizing=`S`（~60 LOC 前端）。
- 本 sidecar `GAP-P2S3-002-SIDECAR-ACCEPTANCE` 在 machine truth 中是 `review`，Owner=`Claude`，Reviewer=`Codex`；handoff queue 最新 pending 項目為 `2026-04-17T18:19:29Z` 的 `Claude -> Codex` reviewer handoff（review packet ready）。
- Consensus 要求（`starter-draft.md:226-234` E-2 segment）：在 incidents 頁面頂端加「Critical / SOS」區塊，自動篩選 severity=critical；consensus packet row 補充：「critical first 排序 + badge」。
- 正式上游依賴 `GAP-P2S1-001`（SOS 畫面）已完成 ✅（`starter-draft.md:234`）。
- `incidents/page.tsx` 實際行數：約 480 LOC（`"use client"` → 最後 `</style>` 結尾）。

### Repo Baseline Anchors — Already Covered Capabilities

以下為 `incidents/page.tsx` 目前**已實作**的能力：

| 操作                                   | UI 入口                                                                   | 備註                                     |
| -------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| List all incidents                     | 頁面載入自動呼叫 `client.listIncidents()`                                 | 回傳全部 IncidentRecord[]                |
| Severity filter (manual)               | toolbar 的 severity select，含 "critical" 選項                            | 使用者手動選，不自動預設                 |
| Status filter                          | toolbar 的 status select                                                  |                                          |
| Category filter                        | toolbar 的 category select                                                |                                          |
| Full-text search                       | search input（含 severity、title、description 等）                        | `useDeferredValue`                       |
| Critical row highlight                 | `row-critical` CSS class（`background: #fef2f2`）→ 已有 critical 視覺識別 | `severity === "critical"` 的 `<tr>` 套用 |
| Summary card: Critical count           | `criticalCount` 計算 + "Critical severity" summary card                   | 數字正確，但無跳轉或深度連結             |
| Create incident (含 severity=critical) | "Report incident" form，severity select 含 "critical"                     | 可建立 critical 等級事件                 |
| Update incident status                 | edit form，可改 status/assignedTo/resolutionNote                          |                                          |
| Resolve action                         | 行內 "Resolve" 按鈕（快速 status → resolved）                             |                                          |
| Incident timeline                      | "Timeline" 按鈕載入 `getIncidentTimeline()`                               |                                          |

**Summary:** incidents 頁面已有完整的 CRUD + filter + timeline 基礎，也有 critical 計數 summary card 和 `row-critical` 樣式。

**缺失（對比 consensus 需求）：** 見下節 Gap Inventory。

---

## 3) Gap Inventory

以下 gap 根據 consensus 需求（`starter-draft.md:226-234` E-2 + `consensus-packet.md:56` row）與完整 `incidents/page.tsx` 掃描整理，依優先順序排列。

### 優先等級定義

- **P0 – 功能缺口**：consensus 明確要求、父任務完成條件必須具備
- **P1 – UX 完整性**：consensus 要求的視覺/UX 強化，構成完整 SOS 視圖體驗
- **P2 – 品質/一致性**：非 P0/P1 但值得記錄

---

#### GAP-INC-001 — 無頂端「Critical / SOS」優先區塊（P0）

**檔案：** `apps/ops-console-web/app/incidents/page.tsx`（summary-grid 之後，toolbar 之前）  
**問題：** 頁面目前沒有在頂端顯示專屬 Critical / SOS 優先佇列區塊。`criticalCount` summary card 只顯示數字，不展開列表；toolbar severity filter 需要使用者手動選擇，不自動套用 severity=critical。  
**需求來源：** `starter-draft.md:230` 明確要求「Incident 清單頂端加『Critical / SOS』區塊，自動篩選 severity=critical」。  
**影響：** ops 人員開啟 incidents 頁面時，無法第一眼看到需要緊急回應的 critical incidents；SOS 優先處理路徑缺失。  
**實作估算：** ~30-40 LOC（條件渲染一個 `<section className="sos-queue">` 區塊，過濾 `severity === "critical"` 且 `status !== "resolved" && status !== "closed"` 的 records，顯示精簡表格）。

---

#### GAP-INC-002 — 主清單無「critical first」排序（P0）

**檔案：** `apps/ops-console-web/app/incidents/page.tsx` — `filteredRecords` 計算（約 L70-90）  
**問題：** `filteredRecords` 目前只做 filter，不做排序。Critical incidents 散落在主清單中，順序依 server 回傳順序（無保證 critical 在前）。  
**需求來源：** `consensus-packet.md:56` row 明確標注「critical first 排序」。  
**影響：** 使用者需要捲動或搜尋才能找到 critical 事件，無法快速定位需優先處理的案件。  
**實作估算：** ~5-10 LOC（在 `filteredRecords` 計算後加 `.sort()` — `critical` 排到最前，次要依 `occurredAt` 或 `createdAt` 倒序）。

---

#### GAP-INC-003 — Severity 欄位無視覺 badge（P1）

**檔案：** `apps/ops-console-web/app/incidents/page.tsx` — 表格 severity 欄（約 L290）  
**問題：** 表格 severity 欄只顯示純文字（`{record.severity}`），沒有 badge 樣式區分等級。目前已有 `row-critical` 整行紅底，但缺少明確的 severity badge（如 `critical` 顯示為紅色 badge，`high` 橙色，以此類推），導致嚴重等級不夠直觀。  
**需求來源：** `consensus-packet.md:56` row 明確標注「badge」。  
**影響：** 掃視清單時，嚴重等級識別依賴背景色而非明確標籤，低對比模式下或螢幕截圖中識別度低；ops 訓練新人時也難以明確指向 severity badge。  
**實作估算：** ~15-20 LOC（加 `severityBadge()` 函數 + 對應 CSS class；`critical` → 紅色 badge，`high` → 橙色，`medium` → 黃色，`low` → 灰色）。

---

#### GAP-INC-004 — Critical summary card 無快速跳轉至 SOS 優先區塊（P2）

**檔案：** `apps/ops-console-web/app/incidents/page.tsx` — summary-grid 的「Critical severity」card  
**問題：** summary card 顯示 `criticalCount` 數字，但點擊後無任何動作（不跳轉至 SOS 優先區塊，也不自動套用 severity filter）。對於操作導向場景，點擊 critical count 直接跳至 SOS 區塊是預期行為。  
**影響：** 若 GAP-INC-001 完成（增加頂端 SOS 區塊），summary card 仍無法作為快捷入口；屬於 UX 細節，不阻斷核心任務完成。  
**實作估算：** ~5 LOC（把 summary card 改成 `<button onClick={() => scrollToSOSSection()}>` 或加 `#sos-queue` anchor link）。

---

#### GAP-INC-005 — SOS 優先區塊無空態（empty state）設計（P2）

**問題：** 若新增了頂端 Critical / SOS 區塊（GAP-INC-001 修正後），當 critical incidents 為零時，需有明確 empty state（如「No critical incidents — all clear」），否則區塊顯示空表格容易讓操作人員誤以為頁面載入失敗。  
**影響：** 非阻斷性，但對 daily ops 運作重要（「all clear」確認），屬於 GAP-INC-001 實作的配套細節。  
**實作估算：** ~5 LOC（條件渲染 `<p>No critical incidents</p>`）。

---

### Gap Priority Summary

| ID          | 優先 | 說明                             | 是否阻斷 GAP-P2S3-002 parent                    |
| ----------- | ---- | -------------------------------- | ----------------------------------------------- |
| GAP-INC-001 | P0   | 無頂端 Critical/SOS 優先佇列區塊 | **是**（core 需求）                             |
| GAP-INC-002 | P0   | 主清單無 critical-first 排序     | **是**（consensus 明確要求）                    |
| GAP-INC-003 | P1   | severity 欄位無 badge            | 是（consensus 明確要求「badge」）               |
| GAP-INC-004 | P2   | critical summary card 無快速跳轉 | 不阻斷（UX 細節）                               |
| GAP-INC-005 | P2   | SOS 優先區塊無 empty state       | 不阻斷（配套細節，建議與 GAP-INC-001 一起完成） |

**Parent task 判斷：** GAP-P2S3-002 parent 目前是 `backlog`。實作清單：**GAP-INC-001 + GAP-INC-002 + GAP-INC-003** 是完成此任務的必要條件（P0+P1，~50-70 LOC）。GAP-INC-004/005 建議同批次完成以維持完整 UX，但不構成 formal blocking。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`GAP-P2S3-002.depends_on` = `-`（無正式上游依賴）。

| Dep      | Source | Status | Notes                                  |
| -------- | ------ | ------ | -------------------------------------- |
| _(none)_ | -      | -      | 無正式上游依賴；此 task 可完全平行執行 |

### Practical Context Dependencies

| Dep   | Type                                          | Why It Matters                                                                         |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1 | `GAP-P2S1-001`（SOS 畫面）                    | **完成 ✅**                                                                            | starter-draft.md:234 確認 GAP-P2S1-001 已完成，incidents 後端資料結構（IncidentRecord.severity, IncidentSeverity 含 "critical"）已落地 |
| D-P-2 | Planning consensus E-2 segment                | `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md:226-234` | 定義需求：頂端 Critical/SOS 區塊 + 自動 severity=critical 過濾                                                                         |
| D-P-3 | `consensus-packet.md:56`                      | `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`      | 確認 Codex2 ownership、S sizing、「critical first 排序 + badge」完整需求                                                               |
| D-P-4 | `apps/ops-console-web/app/incidents/page.tsx` | 主實作目標（~480 LOC，完整讀取）                                                       | 目前 coverage：CRUD、filter、timeline、row-critical 樣式、criticalCount card；缺：頂端 SOS 區塊、critical-first sort、badge            |
| D-P-5 | `packages/contracts/src/index.ts:1656-1710`   | L1 canonical truth（IncidentRecord、IncidentSeverity、INCIDENT_SEVERITIES）            | severity: `"low"`, `"medium"`, `"high"`, `"critical"`；contracts 已完整，無需修改                                                      |
| D-P-6 | `packages/api-client/src/index.ts:1077-1100`  | API client incidents methods                                                           | `listIncidents()`, `createIncident()`, `updateIncident()`, `getIncidentTimeline()` 全部可用；無需修改                                  |

### Gap-to-Task Forward Dependencies（建議 follow-up / 同批次完成）

| Gap         | 建議處置                                                                    | 原因                                 |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------ |
| GAP-INC-001 | 實作頂端 `<section id="sos-queue">` 區塊（純 UI，在 incidents/page.tsx 內） | Core consensus 需求，~30-40 LOC      |
| GAP-INC-002 | `filteredRecords` 後加 sort（純 UI）                                        | Core consensus 需求，~5-10 LOC       |
| GAP-INC-003 | 加 `severityBadge()` helper + badge CSS（純 UI）                            | Consensus 明確要求 badge，~15-20 LOC |
| GAP-INC-004 | summary card 加 anchor/click handler（純 UI，可選）                         | UX 細節，建議同批次                  |
| GAP-INC-005 | SOS 區塊加 empty state（純 UI，建議與 GAP-INC-001 同步）                    | ~5 LOC，配套細節                     |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md:226-234` (E-2 segment)
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md:56` (GAP-P2S3-002 row: critical first + badge)
- Repo anchors:
  - `apps/ops-console-web/app/incidents/page.tsx` (audit target, ~480 LOC, complete read)
  - `packages/contracts/src/index.ts:1656-1710` (IncidentRecord, IncidentSeverity, INCIDENT_SEVERITIES, INCIDENT_STATUSES)
  - `packages/api-client/src/index.ts:1077-1100` (listIncidents, createIncident, updateIncident, getIncidentTimeline)

---

## 5) Evidence Inventory

| ID   | Evidence                                                                          | Expected Anchor                                                                                  |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| E-1  | Parent task is `backlog`, S size, no upstream dep                                 | `ai-status.json`, `current-work.md` GAP-P2S3-002 row                                             |
| E-2  | Consensus E-2 requirement: top Critical/SOS block + auto filter severity=critical | `starter-draft.md:226-234`                                                                       |
| E-3  | Consensus packet: critical-first sort + badge                                     | `consensus-packet.md:56`                                                                         |
| E-4  | GAP-P2S1-001 already complete (SOS screen + IncidentRecord.severity in contracts) | `starter-draft.md:234`, `contracts:1656-1662` (INCIDENT_SEVERITIES includes "critical")          |
| E-5  | GAP-INC-001: no top SOS queue block                                               | `incidents/page.tsx` — no `<section>` or auto-filtered critical view above main table            |
| E-6  | GAP-INC-002: filteredRecords has no sort step                                     | `incidents/page.tsx:70-90` — filter only, no `.sort()` call                                      |
| E-7  | GAP-INC-003: severity column renders plain text, no badge                         | `incidents/page.tsx:~L290` — `<td>{record.severity}</td>` without badge styling function         |
| E-8  | row-critical already exists (red row highlight for critical)                      | `incidents/page.tsx:~L275` — `record.severity === "critical" ? "row-critical" : ""`              |
| E-9  | criticalCount summary card exists but is display-only                             | `incidents/page.tsx:~L115-130` — `criticalCount` compute + summary card without click handler    |
| E-10 | No `retireIncident` / escalate / SOS-specific action in API client                | `api-client:1077-1100` — listIncidents, createIncident, updateIncident, getIncidentTimeline only |
| E-11 | IncidentSeverity enum: "low" / "medium" / "high" / "critical"                     | `contracts:1656-1662`                                                                            |
| E-12 | IncidentStatus enum: "open" / "investigating" / "resolved" / "closed"             | `contracts:1648-1655` (inferred via INCIDENT_STATUSES)                                           |

---

## 6) Implementation Sketch (for Parent Task Owner)

> 本節為 **non-binding reference**，提供給 `Codex2` 實作 `GAP-P2S3-002` 時的方向參考，不代替正式實作，也不修改任何 canonical truth。

```tsx
// In incidents/page.tsx — after summary-grid section, before toolbar

const criticalOpenRecords = records.filter(
  (r) =>
    r.severity === "critical" &&
    r.status !== "resolved" &&
    r.status !== "closed",
);

// Critical-first sort for main list
const sortedFilteredRecords = [...filteredRecords].sort((a, b) => {
  if (a.severity === "critical" && b.severity !== "critical") return -1;
  if (a.severity !== "critical" && b.severity === "critical") return 1;
  return 0;
});

// Badge helper
function severityBadge(severity: IncidentSeverity) {
  const cls =
    {
      critical: "badge-critical",
      high: "badge-high",
      medium: "badge-medium",
      low: "badge-low",
    }[severity] ?? "badge-low";
  return <span className={`severity-badge ${cls}`}>{severity}</span>;
}

// SOS Priority Queue section (top, before toolbar)
<section id="sos-queue" className="sos-queue-section">
  <h3>Critical / SOS Queue</h3>
  {criticalOpenRecords.length === 0 ? (
    <p className="all-clear">No critical incidents — all clear</p>
  ) : (
    <table className="table sos-table">
      {/* simplified columns: Incident, Status, Links, Quick Resolve */}
    </table>
  )}
</section>;
```

**Total estimated LOC delta:** ~55-70 LOC（within S sizing）。

---

## 7) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S3-002` 是 `backlog`（S 前端任務），owner=`Codex2`，無上游依賴；sidecar 目前是 `review`（owner=`Claude`、reviewer=`Codex`，最新 reviewer 路由是 `2026-04-17T18:19:29Z` 的 `Claude -> Codex` handoff）。
2. Gap inventory 是否正確反映 consensus 需求：GAP-INC-001（頂端 SOS 區塊）和 GAP-INC-002（critical-first sort）是否確實缺失，並有 file 證據支持。
3. GAP-INC-003（badge）是否正確連結 `consensus-packet.md:56` 的「badge」明確要求。
4. 依賴 `GAP-P2S1-001` 是否正確標注為已完成，且 contracts 的 `IncidentSeverity` 已含 "critical"。
5. 此 sidecar 是否完全沒有修改任何 canonical truth 或主線 runtime。
6. Implementation sketch 是否只是參考性的，不構成對 parent 任務實作的強制約束。

**建議核准用語：**

> `GAP-P2S3-002 acceptance packet ready: machine truth shows parent backlog (S ~60 LOC frontend, no upstream dep), GAP-P2S1-001 confirmed complete, IncidentSeverity "critical" in contracts. incidents/page.tsx audit: existing coverage includes CRUD/filter/timeline/row-critical/criticalCount card; 3 P0-P1 gaps confirmed missing against consensus E-2+packet requirements: GAP-INC-001 (no top SOS queue section), GAP-INC-002 (no critical-first sort), GAP-INC-003 (no severity badge). All gaps have file evidence anchors. No canonical truth modified.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / incorrect gap identification / missing evidence anchors / scope drift into canonical truth / dependency status incorrectly assessed]`

---

## 8) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff GAP-P2S3-002-SIDECAR-ACCEPTANCE Codex "GAP-P2S3-002 critical/SOS priority queue acceptance packet ready at support/sidecars/GAP-P2S3-002/GAP-P2S3-002-SIDECAR-ACCEPTANCE.md. Full repo scan of incidents/page.tsx (~480 LOC), contracts (IncidentSeverity), api-client confirms: GAP-P2S1-001 complete, contracts have 'critical' severity, existing page covers CRUD/filter/timeline/row-critical/criticalCount. 3 P0-P1 gaps missing against consensus E-2 + packet requirements: GAP-INC-001 (no top SOS queue section, P0), GAP-INC-002 (no critical-first sort, P0), GAP-INC-003 (no severity badge, P1). 2 P2 UX gaps also noted (GAP-INC-004 summary card no quicklink, GAP-INC-005 no empty state). All gaps have file evidence anchors. No canonical truth modified."
```

---

## 9) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S3-002-SIDECAR-ACCEPTANCE "GAP-P2S3-002 acceptance packet ready: machine truth shows parent backlog (S ~60 LOC frontend, no upstream dep), GAP-P2S1-001 confirmed complete, IncidentSeverity 'critical' in contracts. incidents/page.tsx audit: existing coverage includes CRUD/filter/timeline/row-critical/criticalCount card; 3 P0-P1 gaps confirmed missing against consensus E-2+packet requirements: GAP-INC-001 (no top SOS queue section), GAP-INC-002 (no critical-first sort), GAP-INC-003 (no severity badge). All gaps have file evidence anchors. No canonical truth modified."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S3-002-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / incorrect gap identification / missing evidence anchors / scope drift into canonical truth / dependency status incorrectly assessed]"
```

---

## 10) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done GAP-P2S3-002-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S3-002 at support/sidecars/GAP-P2S3-002/GAP-P2S3-002-SIDECAR-ACCEPTANCE.md. Packet covers: incidents/page.tsx baseline audit (existing 10 covered capabilities), 5 gap items (GAP-INC-001 to GAP-INC-005) with file evidence anchors and priority classification, dependency map confirming GAP-P2S1-001 complete and contracts ready, implementation sketch (~55-70 LOC for P0+P1 gaps), and reviewer handoff path. No canonical truth modified."
```

---

## 11) Change Log

- 2026-04-17T18:15Z — 初版建立：依共享 machine truth、consensus docs（`gap-phase2-planning-20260417/starter-draft.md:226-234` E-2 segment、`consensus-packet.md:56` GAP-P2S3-002 row）與完整 repo 掃描（`incidents/page.tsx` ~480 行完整讀取，`packages/contracts/src/index.ts:1656-1710`，`packages/api-client/src/index.ts:1077-1100`），整理 GAP-P2S3-002 的 acceptance checklist（已覆蓋 10 個能力 + 5 個 gap GAP-INC-001 至 GAP-INC-005，含 P0 核心需求缺口、P1 badge 缺口、P2 UX 缺口），dependency map 確認 GAP-P2S1-001 已完成，以及 reviewer handoff 指引。
- 2026-04-17T18:21Z — reviewer metadata refresh：header、current-state baseline、reviewer hotspot 與 change log 對齊 shared L0 最新 machine truth；sidecar 目前為 `review`，owner=`Claude`、reviewer=`Codex`，最新 pending handoff 為 `2026-04-17T18:19:29Z` 的 `Claude -> Codex` reviewer-ready dispatch。Gap inventory、dependency map 與 repo evidence anchors 不變。
- 2026-04-17T18:22Z — Codex 審查通過（checkpoint `2026-04-17T18:21:56Z`）：確認 parent `GAP-P2S3-002` 仍為 `backlog`、owner=`Codex2`、無正式上游依賴；sidecar 為 `review`、owner=`Claude`、reviewer=`Codex`，最新 pending handoff 為 `Claude -> Codex` reviewer-ready dispatch；repo audit 結論成立（既有 CRUD/filter/timeline/row-critical/criticalCount card），3 個 P0-P1 缺口均有證據錨點（GAP-INC-001、GAP-INC-002、GAP-INC-003），support packet 未修改 canonical truth。Codex 回傳 owner（Claude）執行 `owned_finalize_dispatch` closeout。
- 2026-04-17T18:23Z — Owner（Claude）`owned_finalize_dispatch` closeout：acceptance packet 審查已通過，sidecar 標記為 `done`。Packet 範圍：incidents/page.tsx baseline audit（10 項已覆蓋能力）、5 個 gap（GAP-INC-001–GAP-INC-005）含 file evidence anchors 與優先分級、dependency map（GAP-P2S1-001 完成、contracts 已含 IncidentSeverity "critical"）、implementation sketch（~55-70 LOC for P0+P1）、reviewer handoff path。未修改任何 canonical truth。
