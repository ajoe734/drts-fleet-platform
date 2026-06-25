# 台灣監理沙盒治理與在地管轄規格


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. 原則

真正執行 authority 是主管機關核准的實驗計畫、核准函、附帶條件與其版本。本系統不把 DRTS 專案中的數字或設備要求硬編成通用法律；通報時限、保存年限、允許路線與人員條件全部 policy-driven。

## 2. 核心資料物件

### 2.1 SandboxExperimentProgram

- experimentId
- programName
- applicantOrganization
- operatingEntity
- regulatorAuthority
- localAuthority
- approvalStatus
- effectiveFrom / effectiveUntil
- approvalDocumentVersionId
- passengerServiceAllowed
- safetyOperatorRequired
- rocRequired
- maximumVehicles
- maximumTripsPerDay
- maximumDistanceKmPerDay
- reportingPolicyId
- evidenceRetentionPolicyId
- suspensionResumePolicyId

### 2.2 JurisdictionProfile

- central competent authority
- local government authority
- road authority
- police jurisdiction
- fire / EMS contacts
- hospitals
- insurer
- towing / vehicle recovery
- local operations manager
- ROC supervisor
- cybersecurity contact
- notification matrix and SLA

### 2.3 ApprovalDocumentVersion

- documentId / version
- approval number
- issuedAt
- effective period
- file artifact
- hash
- supersedes
- conditions summary
- extracted executable policies
- reviewer signoff

## 3. 核准範圍

### 3.1 Operating Area / Route

- geometry
- allowed pickup / dropoff zones
- excluded zones
- effective period
- applicable vehicles
- applicable service products
- route version
- source approval document

僅用於監管與派遣資格，不提供 Tesla FSD 駕駛地圖或高精地圖。

### 3.2 Schedule

- days of week
- start / end time
- exception dates
- holiday policy
- temporary suspension
- maximum concurrent vehicles

### 3.3 Vehicle Enrollment

- Phase 1 vehicleId
- VIN
- Tesla binding
- permit / insurance
- approved firmware / hardware constraints
- evidence recorder requirement
- capability requirements
- status: pending / approved / suspended / retired

### 3.4 Safety Operator Qualification

- person identity
- driving license and required training
- experiment authorization
- medical / shift requirements where applicable
- effective period
- suspension

## 4. Policy Evaluation

派遣前及行程中保存 `SandboxComplianceSnapshot`：

```text
experiment version
jurisdiction version
route version
schedule version
vehicle enrollment version
operator qualification version
Tesla capability version
reporting policy version
evidence policy version
```

## 5. 在地通報矩陣

事件級別：

```text
informational
operational_degradation
safety_event
major_safety_event
injury_or_fatality
cybersecurity_event
```

每級設定：

- 通報對象
- 通報時限
- 通報方式
- 必填欄位
- initial / follow-up / final report
- who can approve submission
- acknowledgement requirement

DRTS 文件中 1 小時通報、10 日事故報告與事故後停運可作設計參考，但最終值必須由實際核准 policy 配置。

## 6. 停運與復運

### Suspension triggers

- major incident
- required provider data unavailable
- evidence recorder failure
- vehicle / operator qualification invalid
- route/time violation
- regulator request
- repeated telemetry completeness failure
- cybersecurity incident

### Resume gate

- incident initial report completed
- evidence freeze verified
- root cause / corrective action documented
- vehicle re-qualified
- Tesla capability re-verified
- regulator release document attached where required
- ROC and safety operator briefed

復運狀態：

```text
suspended
corrective_action_in_progress
authority_review
resume_authorized
resumed
closed
```

## 7. 管轄調閱 Portal

可選提供受控 regulator viewer：

- experiment overview
- approved route/time/vehicle/operator
- active trips
- incident and takeover summary
- regulatory reports
- evidence bundle request

不得暴露乘客不必要個資或 Tesla 商業機密；使用 scoped access 與 masking。
