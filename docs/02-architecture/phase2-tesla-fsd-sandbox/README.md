# Phase 2 Tesla FSD 監理沙盒 SA／SD 完整文件包


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. 文件目的

本文件包把 Phase 2 從概念層收斂成可供產品、系統設計、後端、前端、Mobile、DevOps、QA、法遵、營運與 Tesla 合作窗口共同執行的完整規格。文件不把 Tesla 尚未公開的介面假裝成既有 API；對 FSD session、接管／脫離與事故資料，採 **Tesla Regulatory Data Interface** 合作契約加 adapter 的架構，並將其列為測試車上線與載客沙盒的必要 gate。

## 2. 文件索引

| # | 文件 | 用途 |
|---|---|---|
| 01 | `01_phase2_system_analysis_sa.md` | 角色、服務範圍、商業流程、需求與完成標準 |
| 02 | `02_phase2_system_design_sd.md` | 系統架構、bounded context、資料流、狀態機、部署與整合 |
| 03 | `03_phase2_product_requirements_prd.md` | 產品模組、頁面、操作責任與驗收 |
| 04 | `04_tesla_regulatory_data_interface_spec.md` | 向 Tesla 提出的監理資料介面、事件與能力契約 |
| 05 | `05_sandbox_governance_local_jurisdiction_spec.md` | 台灣沙盒計畫、在地管轄、核准條件與停復運管理 |
| 06 | `06_safety_takeover_incident_evidence_spec.md` | 接管、事故、錄影、證據保全、責任調查資料包 |
| 07 | `07_roc_console_and_safety_operator_spec.md` | ROC Console 與安全員 App 的完整產品規格 |
| 08 | `08_phase2_api_contract_catalog.md` | API 與 TypeScript contract 清單 |
| 09 | `09_phase2_openapi_draft.yaml` | OpenAPI 草稿 |
| 10 | `10_phase2_data_model_ddl_draft.sql` | PostgreSQL／PostGIS DDL 草稿 |
| 11 | `11_phase2_business_flows_and_state_machines.md` | 端到端 business flows 與狀態機 |
| 12 | `12_phase2_security_nfr_deployment_retention.md` | 安全、NFR、GCP、資料保存與災難復原 |
| 13 | `13_phase2_test_uat_and_evidence_plan.md` | 測試、UAT、演練、證據與 release gates |
| 14 | `14_phase2_implementation_workbreakdown.md` | 可直接派工的完整 work breakdown |
| 15 | `15_phase2_decision_ledger.md` | 已裁決邊界、禁止事項與外部 gate |
| 16 | `16_sources_assumptions_and_traceability.md` | 來源、DRTS 取用／排除項目與需求追溯 |

## 3. 一句話架構

```text
Tesla Fleet API / Fleet Telemetry
+ Tesla Regulatory Data Interface（合作契約）
                ↓
Tesla Integration & Regulatory Event Gateway
                ↓
Sandbox Governance / Dispatch Gate / ROC / Safety Operator
                ↓
Evidence Vault / Accident Investigation / Regulatory Reporting
                ↓
Phase 1 Booking / Dispatch / Incident / Billing / Audit / Human Taxi Fallback
```

## 4. Phase 2 完成線

Phase 2 不是以「接上 Tesla API」或「完成 ROC 地圖」為完成。至少必須跑通：

1. 核准車輛與安全員開通；
2. Tesla Telemetry 與 Regulatory Event feed；
3. 沙盒派遣資格檢核；
4. 正常載客行程；
5. Tesla 原廠接管事件、安全員回報與 ROC 處置的三方關聯；
6. 碰撞／重大事件的自動證據凍結；
7. 事故時間線、錄影、telemetry、接管紀錄與監理調閱；
8. AV 不可履約時沿用原 booking 改派 Phase 1 人駕計程車；
9. 監理日報、接管報表、事故報告與停復運流程；
10. 外部資料缺漏時 fail-closed，停止新派單。
