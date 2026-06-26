# Phase 2 設計決策台帳


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


| ID | Decision | Status |
|---|---|---|
| P2-D-001 | Phase 2 is Tesla FSD sandbox operations/compliance, not FSD development | accepted |
| P2-D-002 | No roadside RSU/SPaT/V2X dependency | accepted |
| P2-D-003 | No steering angle/brake-depth/perception-object requirement | accepted |
| P2-D-004 | Tesla is authority for FSD session and takeover/disengagement technical events | accepted |
| P2-D-005 | Tesla Regulatory Data Interface is a required cooperation contract, not assumed public API | accepted |
| P2-D-006 | Safety operator and ROC records remain independent from Tesla events | accepted |
| P2-D-007 | ROC is operations control, not remote driving | accepted |
| P2-D-008 | Independent onboard evidence recording is required when incident video must be guaranteed | accepted |
| P2-D-009 | External existing CCTV may be imported after incident but is not platform infrastructure | accepted |
| P2-D-010 | Phase 1 order/dispatch/billing/incident/audit remain canonical | accepted |
| P2-D-011 | AV failure uses same booking/order and human taxi fallback | accepted |
| P2-D-012 | No required Tesla capability => no passenger sandbox dispatch | accepted |
| P2-D-013 | Evidence chain does not decide legal liability | accepted |
| P2-D-014 | Reporting/retention deadlines are policy-driven from actual approval | accepted |
| P2-D-015 | `apps/roc-console-web` is a separate landing zone | accepted |

## Open External Contracts, Not Open System Design

以下不是交給工程自行討論，而是外部 contract gate：

- Tesla exact endpoint names and auth for regulatory feed
- Tesla reason code dictionary
- Tesla incident video/data availability
- final regulator reporting deadlines
- approved route/time/vehicle/operator values
- evidence recorder vendor protocol

System design already resolves them through adapter, capability profile and policy-driven configuration.
