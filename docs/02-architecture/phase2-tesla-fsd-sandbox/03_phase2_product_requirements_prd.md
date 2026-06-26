# Phase 2 產品需求文件（PRD）


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. 產品願景

讓 Tesla FSD 車輛在台灣監理沙盒中具備「可核准、可監控、可停派、可接管回報、可保全證據、可調查、可通報、可改派人駕」的營運能力，而不侵入 Tesla FSD 技術控制責任。

## 2. 產品模組

### 2.1 Platform Admin - Sandbox Governance

頁面：

- Experiments
- Jurisdiction Profiles
- Approval Documents
- Operating Areas / Routes / Schedules
- Vehicle Enrollments
- Safety Operator Qualifications
- Tesla Integrations
- Regulatory Capabilities
- Evidence & Retention Policies
- Reporting Policies
- Suspension / Resume

主要操作：

- 建立／版本化實驗計畫
- 上傳核准函與附件
- 設定核准區域、路線、時段、上下客點
- 綁定 Tesla 車輛、安全員與保險
- 檢查 Tesla regulatory capability
- 發布、暫停、結束實驗

### 2.2 ROC Console

頁面：

- Live Board
- Vehicle Detail
- Active Trips
- Takeover Queue
- Alerts
- Incidents
- Provider Health
- Evidence Freeze
- Regulatory Notifications
- Shift Handover

關鍵 UI：

- 核准區域 overlay，不顯示或依賴路側設備
- telemetry freshness 與 regulatory event freshness 分開
- 原廠事件、安全員回報、ROC 處置分欄顯示
- 一鍵停派、operational hold、人駕 fallback
- 不提供 remote driving controls

### 2.3 Safety Operator Mode

頁面：

- Provisioning / Qualification
- Shift Start
- Vehicle Assignment
- Pre-trip Checklist
- Active Trip
- Takeover Report
- Incident / Evidence Upload
- Trip Closeout
- Shift Handover

必須支援離線暫存與恢復同步，接管回報不得因網路短暫中斷遺失。

### 2.4 Compliance & Investigation

頁面：

- Experiment Compliance Dashboard
- Trip Compliance Detail
- Takeover Review
- Accident Case
- Synchronized Timeline
- Evidence Manifest
- Controlled Export
- Regulatory Report Jobs
- Legal Hold

## 3. 主要使用案例

### UC-01 建立沙盒計畫

Actor：Sandbox Program Manager  
結果：有版本、有核准附件、有本地管轄、有報告與保存 policy 的 `SandboxExperimentProgram`。

### UC-02 Tesla 車輛上線

Actor：Tesla Integration Operator  
結果：VIN 綁定、virtual key、telemetry、regulatory capability、recorder health 均通過。

### UC-03 派遣 Tesla 沙盒車

Actor：Ops / System  
結果：每次 assignment 保存 eligibility snapshot；不合格時回傳明確 reason 並可 fallback。

### UC-04 安全員回報接管

Actor：Safety Operator  
結果：本地報告與 Tesla 原廠事件關聯，不覆蓋原廠資料。

### UC-05 ROC 處理重大事件

Actor：ROC Operator  
結果：告警被 acknowledge，車輛停派、事件建立、證據凍結、通報與 fallback 被追蹤。

### UC-06 事故調閱

Actor：Compliance / Investigator  
結果：可查看同步時間線、影像、telemetry、接管、命令、booking 與 audit；匯出有 chain of custody。

## 4. 產品硬規則

1. `Tesla provider event` 不可被安全員或 ROC report 覆蓋。
2. UI 不可自行推論 FSD engaged／disengaged；只顯示 provider data 或明確來源。
3. 無所需 Tesla regulatory capability 的車輛不得載客。
4. evidence recorder 不健康時不得開始新沙盒行程。
5. 監理範圍檢核失敗時 fail closed。
6. ROC 不提供遠端駕駛。
7. 事故責任由外部法定程序判斷；平台只提供資料。
8. 所有 sensitive download 皆需 reason、RBAC、短效 URL 與 audit。
9. 所有 policy 與核准條件均 effective-dated、versioned、rollbackable。
10. AV fallback 不得斷開原 booking、SLA、billing 與 audit chain。

## 5. 產品狀態提示

任何 Tesla／沙盒狀態都必須標示 evidence source：

```text
tesla_provided
safety_operator_reported
roc_reported
system_derived
external_authority_provided
unknown
not_exposed_by_provider
```

## 6. Phase 2 KPI

- Tesla vehicle readiness rate
- sandbox dispatch eligibility rate
- provider event completeness
- telemetry freshness compliance
- takeover correlation completeness
- safety operator report timeliness
- ROC acknowledgment time
- evidence freeze success rate
- fallback success rate
- regulatory report completeness
- unresolved discrepancy count
- incident notification SLA compliance
