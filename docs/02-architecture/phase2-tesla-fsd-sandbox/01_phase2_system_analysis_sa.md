# Phase 2 系統分析文件（SA）


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. 系統問題定義

Phase 1 已建立計程車訂單、商務預約、派遣、人駕 Driver App、第三方平台導單、事故、帳務、報表與稽核底座。Phase 2 要解決的問題不是 FSD 如何駕駛，而是：**如何將 Tesla 原廠 FSD 車輛納入台灣在地監理沙盒，使每一趟試驗可被核准、監看、停派、接管回報、事故保全、調閱與追責。**

核心監理問題：

- 車輛、路線、時段、安全員與服務對象是否符合核准計畫？
- Tesla 原廠是否提供 FSD session、接管／脫離及重大事件資料？
- 原廠資料是否可與本地 booking、trip、安全員、ROC 與事故紀錄關聯？
- 發生事故時能否凍結錄影與時序資料，並證明資料未被竄改？
- 在地主管機關、警消、保險與營運單位是否能依 SLA 被通報？
- AV 無法履約時能否保留原交易脈絡，轉派 Phase 1 人駕車？

## 2. 系統目標

### 2.1 主要目標

1. 建立 Tesla 車輛、Fleet API、Fleet Telemetry 與 Regulatory Data Interface 的正式 integration boundary。
2. 建立版本化沙盒實驗計畫與在地管轄 profile。
3. 建立派車前及行程中的沙盒 eligibility gate。
4. 建立 ROC 即時營運監控，但不提供遠端駕駛。
5. 建立安全員值勤、出車檢查、接管回報及行程交接。
6. 建立 Tesla 原廠接管事件、安全員回報與 ROC 處置的 correlation model。
7. 建立獨立車載證據錄影、事件凍結、chain of custody 與事故調查包。
8. 建立監理日報、接管報表、異常報表、事故報告與停復運管理。
9. 重用 Phase 1 booking、dispatch、incident、billing、audit 與人駕備援。

### 2.2 非目標

- 不自行開發 FSD 感知、定位、路徑規劃或車輛控制。
- 不以路側 RSU、SPaT、C-V2X、路側盲點偵測或自建沿線 CCTV 為運行前提。
- 不要求方向盤角度、煞車深度、LiDAR／Radar 健康或 Tesla perception objects。
- 不建立 ROC 遠端駕駛站。
- 不從一般 telemetry 推算原廠接管事件；原廠事件由 Tesla Regulatory Data Interface 提供。
- 不重建 Phase 1 的訂單、帳務與事故 authority。

## 3. 服務對象與角色

| 角色 | 主要責任 |
|---|---|
| Sandbox Program Manager | 建立實驗計畫、核准條件、清冊、報表要求、停復運 gate |
| Platform Admin | Tesla 整合、車輛綁定、資格、政策、密鑰與版本治理 |
| ROC Operator | 監看、告警確認、停派、要求安全員處置、事故與備援協調 |
| ROC Supervisor | 重大事件指揮、停運／復運建議、監理通報審核 |
| Safety Operator | 出車檢查、FSD 使用確認、實體接管、事故／異常回報 |
| Ops Dispatcher | booking 派遣、AV 失敗後的人駕 fallback、乘客 ETA 更新 |
| Compliance Officer | 證據保全、監理報告、legal hold、調閱與通報 |
| Accident Investigator | 時間線、影像、原廠事件、安全員／ROC 紀錄整合 |
| Tesla Integration Operator | OAuth、virtual key、telemetry、schema、event gap 與 provider health |
| Local Authority Viewer | 受控查詢實驗、行程、事件、報表與證據包 |
| Passenger / Tenant / Partner | 僅接收服務狀態，不決定是否使用 FSD 或派哪台 AV |

## 4. 權威矩陣

| 資料／決策 | Authority |
|---|---|
| FSD 感知、規劃、控制 | Tesla |
| FSD session、engage/disengage、接管原廠事件 | Tesla Regulatory Data Interface |
| Tesla 車況與 Fleet Telemetry | Tesla；本地保存 canonical projection |
| 沙盒核准條件 | 核准文件／主管機關；本平台版本化執行 |
| booking、order、dispatch、billing | Phase 1 core |
| 安全員實際操作與說明 | Safety Operator report |
| ROC 處置 | ROC action record |
| 事故責任判定 | 警察、保險、鑑定、主管機關或司法程序；系統不裁決 |
| 證據 manifest、調閱紀錄 | 本平台 Evidence Authority |
| 監理報告 | 本平台產出，經合規人員簽核後提交 |

## 5. 核心服務範圍

### 5.1 Tesla Integration Service

- Tesla application／account authorization
- VIN 與 Phase 1 vehicle 綁定
- virtual key pairing 狀態
- token、scope、region、rate limit、schema version
- Fleet Telemetry configure／health／gap detection
- 核准的一般 vehicle commands 及 receipt

### 5.2 Tesla Regulatory Data Service

- capability negotiation
- FSD session feed
- autonomy transition／takeover event feed
- session summary
- historical backfill
- incident evidence reference
- signature verification、sequence gap、schema evolution

### 5.3 Sandbox Governance Service

- experiment program
- jurisdiction profile
- approved area／route／time／vehicle／operator
- insurance、permit、reporting policy
- daily and trip-level operating limits
- suspend／resume authorization

### 5.4 Sandbox Dispatch Gate

- 將 Phase 1 booking 評估為 AV eligible、manual release 或 ineligible
- 保存 evaluation snapshot
- 不改寫 Tesla FSD 行為
- 失敗時轉 Phase 1 人駕 fallback

### 5.5 Safety Operator Service

- 資格與排班
- 車輛 assignment
- pre-trip checklist
- takeover report
- incident／evidence upload
- handover and end-of-shift

### 5.6 ROC Operations Service

- 地圖與核准範圍 overlay
- trip／vehicle／operator／telemetry freshness
- takeover／incident／provider gap queue
- stop-new-dispatch、operational hold、fallback coordination

### 5.7 Evidence & Investigation Service

- 車載錄影來源管理
- event-triggered evidence freeze
- raw payload vault
- manifest、hash、signature、legal hold
- accident timeline and investigation bundle
- controlled export and chain of custody

### 5.8 Regulatory Reporting Service

- daily operations report
- vehicle／operator／trip report
- FSD session／takeover report
- telemetry completeness report
- incident and notification report
- suspension／resume dossier

## 6. 主要 Business Flows

### 6.1 車輛上線

```text
建立實驗計畫
→ 綁定 Tesla 帳號與 VIN
→ virtual key / Fleet Telemetry
→ Tesla regulatory capability negotiation
→ 核准車輛與安全員
→ readiness test
→ sandbox-ready
```

### 6.2 正常沙盒載客

```text
Phase 1 booking
→ sandbox eligibility
→ ROC/manual release（需要時）
→ Tesla vehicle assignment
→ destination push
→ safety operator pre-trip
→ trip monitoring
→ Tesla session summary
→ completion
→ billing/audit/reporting
```

### 6.3 接管

```text
Tesla regulatory takeover event
+ Safety Operator takeover report
+ ROC response record
→ correlation
→ discrepancy check
→ incident/evidence policy
→ FSD resumed / human completed / vehicle stopped
```

### 6.4 事故

```text
collision/SOS/major takeover
→ trip & vehicle operational hold
→ evidence freeze
→ ROC emergency response
→ local authority notification
→ passenger recovery / human taxi fallback
→ investigation bundle
→ report & resume authorization
```

### 6.5 Provider／data failure

```text
sequence gap / telemetry stale / regulatory feed down
→ alert
→ historical backfill
→ no-new-AV-dispatch when threshold exceeded
→ open data-integrity incident
→ restore only after completeness gate
```

## 7. Functional Requirements

### P0 必備

- Tesla OAuth／vehicle binding／Fleet Telemetry
- Tesla Regulatory Data Interface adapter + mock + capability profile
- experiment／jurisdiction／approved route／vehicle／operator registry
- sandbox dispatch evaluation
- safety operator mode
- ROC monitor／alert／hold／fallback
- takeover three-source correlation
- independent vehicle evidence recording integration
- evidence freeze／manifest／legal hold／controlled export
- incident case／notification／investigation bundle
- regulatory reporting
- Phase 1 fallback integration

### P1 強化

- trip replay and synchronized video/telemetry viewer
- advanced data quality scoring
- automated report packaging
- provider schema migration assistant
- analytics and KPI
- pilot tenant／partner entitlement

## 8. Completion Criteria

Phase 2 pilot readiness 必須同時滿足：

- Tesla 公開介面可用且每台車 capability profile 完成；
- Tesla regulatory contract 已簽定並完成 sandbox integration；
- 原廠 FSD session／takeover event 可送達、驗簽、回補；
- 至少一個核准區域／時段／車輛／安全員計畫可執行；
- 正常、接管、資料中斷、碰撞與 fallback E2E 均通過；
- 事故影片與資料可凍結、查驗 hash、受控匯出；
- ROC 與安全員操作均有 immutable audit；
- 監理報告可由原始 evidence 追溯；
- 系統未引入路側依賴或第三方 FSD 控制。
