# GAP-P2S1-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S1-002` — driver-app: incident.tsx — use category=safety severity=critical for SOS path  
**Current Sidecar Owner:** `Claude`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Qwen` / `(unassigned)`  
**Last Revised:** `2026-04-17T11:47Z (UTC)`  
**Status:** `review` (handoff completed; reviewer auto-reassigned from `Qwen` to `Codex`)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S1-002` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing, dependency mapping, code-scan evidence anchors, reviewer checklist.
- **Out of scope:** `apps/driver-app/app/incident.tsx` runtime 修改（或決定其是否需要修改）、contracts 主線變更、parent task 的最終 acceptance 認定，或改寫 machine truth。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S1-002` 在 machine truth 中為 **`backlog`**，Owner=`Qwen`，無正式 upstream dependency。
- 本 sidecar `GAP-P2S1-002-SIDECAR-ACCEPTANCE` 在 machine truth 中為 **`review`**，Owner=`Claude`，Reviewer=`Codex`，`last_update=2026-04-17T11:42:33Z`。
- review handoff trail 已在 L0 truth 記錄：`Claude -> Qwen` handoff 建立於 `2026-04-17T11:42:21Z` 並於 `2026-04-17T11:42:33Z` resolved；其後因 Qwen token error，review 自動改派為 pending `Qwen -> Codex` handoff（建立於 `2026-04-17T11:42:33Z`）。

### 重要發現：實作已存在於 repo

Repo 掃描揭示 `apps/driver-app/app/incident.tsx` **已具備** parent task 所描述的語意：

```typescript
// apps/driver-app/app/incident.tsx:38-45
await client.createIncident({
  title: "Driver SOS emergency",
  description: details.trim() || "SOS alert triggered from the driver app.",
  category: "safety", // ← task 要求的 category
  severity: "critical", // ← task 要求的 severity
  reportedBy: "driver",
});
```

Git history：

- `2600629` — `feat(driver-app): add safety-critical SOS flow` — 首次建立含 safety/critical 的 SOS 路徑
- `9224a46` — `fix(gap-p2s1-001): prevent duplicate SOS submission` — 後續修正不影響 category/severity 值

### Contracts Baseline

`packages/contracts/src/index.ts` 已定義：

```typescript
export const INCIDENT_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export const INCIDENT_CATEGORIES = [
  "safety",
  "vehicle_damage",
  "passenger_injury",
  "driver_injury",
  "property_damage",
  "weather",
  "traffic",
  "operational",
  "other",
] as const;
```

- `"safety"` 是有效的 `IncidentCategory`
- `"critical"` 是有效的 `IncidentSeverity`
- `CreateIncidentCommand` 介面已包含這兩個型別欄位

### API Client Baseline

`packages/api-client/src/index.ts:1078` 已有 `createIncident(command: CreateIncidentCommand)`，且 `incident.tsx` 透過 `getDriverClient()` 呼叫。

### Unit Test Baseline

`tests/unit/incident.test.ts` 已有一個針對 SOS path 的專屬 test case：

```typescript
it("accepts safety-critical SOS incidents from the driver app path", () => {
  const incident = service.createIncident({
    title: "Driver SOS emergency",
    description: "SOS alert triggered from the driver app.",
    category: "safety",
    severity: "critical",
    reportedBy: "driver",
  });
  expect(incident.category).toBe("safety");
  expect(incident.severity).toBe("critical");
  expect(incident.status).toBe("open");
});
```

---

## 3) Parent Acceptance Framing

`GAP-P2S1-002` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 以任務描述（`use category=safety severity=critical for SOS path`）為唯一語意來源，不新增產品語意。

### AC-1 — incident.tsx 的 SOS 路徑使用正確 category 與 severity

- [x] `category: "safety"` — 已確認存在於 `incident.tsx:42`（commit `2600629`）
- [x] `severity: "critical"` — 已確認存在於 `incident.tsx:43`（commit `2600629`）
- [x] 這兩個值符合 `@drts/contracts` 的型別定義（`IncidentCategory`、`IncidentSeverity`）

### AC-2 — contracts 型別覆蓋

- [x] `IncidentCategory` 包含 `"safety"`（`packages/contracts/src/index.ts:1664-1674`）
- [x] `IncidentSeverity` 包含 `"critical"`（`packages/contracts/src/index.ts:1656-1661`）
- [x] API client `createIncident` 使用 `CreateIncidentCommand` 型別（`packages/api-client/src/index.ts:1078`）

### AC-3 — unit test 覆蓋

- [x] `tests/unit/incident.test.ts` 已有 `"accepts safety-critical SOS incidents from the driver app path"` test case，明確驗證 SOS path 的 category 與 severity 值

### AC-4 — UI/UX 一致性

- [x] `incident.tsx:90-91` 在 UI 中顯示 notice："This screen always creates an incident with category safety and severity critical."
- [x] SOS button label 與成功訊息（"SOS sent"、"Operations has received your critical safety alert."）與 safety/critical 語意一致

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準：`GAP-P2S1-002.depends_on=[]`（無正式 upstream dependency）

無正式 blocker。

### Formal Downstream Dependencies

以目前 machine truth 掃描，沒有任何 task 正式宣告 `depends_on: ["GAP-P2S1-002"]`。

> **Sidecar 注意：** parent task 語意已在 repo 中存在，downstream 消費者若依賴 `GAP-P2S1-002` 完成狀態，可由 parent owner 在 canonical close-out 時澄清。

### Practical Review Dependencies

| Dep   | Type               | Why It Matters                                                                        |
| ----- | ------------------ | ------------------------------------------------------------------------------------- |
| D-P-1 | Repo evidence      | commit `2600629` 首次建立 safety/critical SOS 路徑，提供 implementation origin anchor |
| D-P-2 | Contracts baseline | `INCIDENT_CATEGORIES` / `INCIDENT_SEVERITIES` 確保靜態型別不會拒絕這兩個值            |
| D-P-3 | Unit test coverage | 確認實作有對應測試，不依賴目測                                                        |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Repo anchors:
  - `apps/driver-app/app/incident.tsx`
  - `packages/contracts/src/index.ts` (L1664–1688)
  - `packages/api-client/src/index.ts` (L1078–1080)
  - `tests/unit/incident.test.ts`

---

## 5) Evidence Inventory

| ID  | Evidence                                             | Anchor                                                                  |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| E-1 | Parent/sidecar machine state                         | `ai-status.json`, `current-work.md`                                     |
| E-2 | incident.tsx SOS path — category/severity values     | `apps/driver-app/app/incident.tsx:42-43`                                |
| E-3 | Git origin of SOS safety-critical implementation     | commit `2600629` ("feat(driver-app): add safety-critical SOS flow")     |
| E-4 | Contracts — IncidentCategory includes "safety"       | `packages/contracts/src/index.ts:1664-1675`                             |
| E-5 | Contracts — IncidentSeverity includes "critical"     | `packages/contracts/src/index.ts:1656-1662`                             |
| E-6 | API client — createIncident uses typed command       | `packages/api-client/src/index.ts:1078-1080`                            |
| E-7 | Unit test — SOS path covered                         | `tests/unit/incident.test.ts` ("accepts safety-critical SOS incidents") |
| E-8 | UI notice — consistent with safety/critical semantic | `apps/driver-app/app/incident.tsx:88-93`                                |

---

## 6) Key Finding for Parent Owner (Qwen)

**本 sidecar 在 repo 掃描中發現：`GAP-P2S1-002` 所要求的 `category=safety, severity=critical` 已在 `incident.tsx` 中存在（commit `2600629`），並有對應 unit test（`tests/unit/incident.test.ts`）與 UI notice。**

Parent owner（`Qwen`）在接手 `GAP-P2S1-002` 實作時，應首先核實：

1. repo 中現有實作是否滿足任務 acceptance criteria，或仍存在不符合之處（例如舊路徑、feature-flag 遮蔽、其他未覆蓋分支）
2. 若實作已完整，可考慮直接走 `review → done` 流程，無需額外修改
3. 若需要補充或修正，以本 packet 的 evidence anchors 作為參考基線

> **本 sidecar 不代表替 parent task 發出「已完成」判定**；final acceptance 決定權在 parent owner `Qwen` 與對應 reviewer。

---

## 7) Reviewer Hotspots

Reviewer 應優先確認：

1. sidecar 是否忠實保留 machine truth（parent task 仍在 `backlog`，sidecar 不擅自升級其狀態）
2. evidence anchors 是否確實指向 repo 中的正確位置（category/severity 值、unit test、contracts）
3. "key finding" 段落是否清楚告知 parent owner，而非讓 sidecar 越權宣告 parent task 完成
4. support artifact 是否沒有修改任何 canonical truth 或主線 runtime 實作

**建議核准用語：**

> `GAP-P2S1-002 acceptance packet ready: implementation evidence anchors (incident.tsx commit 2600629, unit test, contracts types) are correctly assembled; parent task status is not changed; key finding communicated to parent owner without overriding their acceptance authority.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / evidence anchor error / scope violation]`

---

## 8) Handoff Command

此 packet 已完成一次 owner handoff，且目前的指派 reviewer 是 `Codex`。若 owner（`Claude`）後續修訂後需要重新送審，應交給目前 assigned reviewer：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff GAP-P2S1-002-SIDECAR-ACCEPTANCE Codex "$(cat <<'EOF'
GAP-P2S1-002 acceptance packet ready at support/sidecars/GAP-P2S1-002/GAP-P2S1-002-SIDECAR-ACCEPTANCE.md. Key finding: incident.tsx already implements category=safety and severity=critical for the SOS path (commit 2600629), with unit test coverage and contracts type alignment. Parent task status not changed — final acceptance decision deferred to parent owner Qwen.
EOF
)"
```

---

## 9) Reviewer Actions

Reviewer 核准：

```bash
AI_NAME=<reviewer> python3 scripts/ai_status.py approve GAP-P2S1-002-SIDECAR-ACCEPTANCE "GAP-P2S1-002 acceptance packet approved: evidence anchors verified, parent task state unchanged, key finding communicated to parent owner without scope violation."
```

Reviewer 退回：

```bash
AI_NAME=<reviewer> python3 scripts/ai_status.py reopen GAP-P2S1-002-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / evidence anchor error / scope violation]"
```

---

## 10) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done GAP-P2S1-002-SIDECAR-ACCEPTANCE "Owner finalized: GAP-P2S1-002 acceptance packet at support/sidecars/GAP-P2S1-002/GAP-P2S1-002-SIDECAR-ACCEPTANCE.md. Implementation evidence assembled (incident.tsx commit 2600629, unit test, contracts); key finding communicated to parent owner; no canonical truth modified."
```

---

## 11) Change Log

- 2026-04-17 — 初版建立：依共享 machine truth 與 repo 掃描，整理 `GAP-P2S1-002` 的 acceptance checklist、dependency map、incident.tsx / contracts / unit test evidence anchors、以及 key finding（實作已存在於 commit `2600629`）。
- 2026-04-17 — reviewer refresh：同步 header / Section 2 的 machine-truth snapshot 至目前 `review` 狀態，補記 `Claude -> Qwen -> Codex` 的 handoff trail，並修正 `handoff` 指令缺少 reviewer 參數的問題。
