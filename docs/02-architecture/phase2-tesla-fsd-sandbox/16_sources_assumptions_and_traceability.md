# 來源、假設與需求追溯


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. Repo Sources

- `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md`
  - confirms AV / ODD / Tesla / ROC was future-gated and lacked landing zones.
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`
  - requires Phase 2 to overlay Phase 1 owned-mobility, dispatch, incident and reporting hooks.
- `TARGET_ARCHITECTURE.md`
  - preserves `av_pilot` as a future extension, Phase 1 authority boundaries remain.
- `packages/contracts/src/index.ts`
  - current repo already preserves `av_pilot` in service bucket catalog.

## 2. Tesla Official Sources

### Fleet Telemetry

Official documentation states Fleet Telemetry streams vehicle data directly to a server, requires firmware and virtual key prerequisites, supports configurable fields, 500 ms collector buckets, buffering/reconnect, connectivity events and self-driving statistic fields on supported hardware.

Reference: Tesla Developer - Fleet Telemetry overview.

### Vehicle Commands

Official documentation lists signed vehicle commands such as navigation destination/waypoints, charging, lock/unlock, climate and other non-driving vehicle controls. This document does not treat the public API as remote steering/braking/FSD control.

Reference: Tesla Developer - Vehicle Commands.

## 3. DRTS Reference PDF

File: `智慧自駕公路實證DRTS_服務建議書3.0_完整版.pdf`

### Adopted as operational/safety reference

- PDF p.69: accident handling, police/EMS, dispatch, passenger transfer, image provision, tow and authority reporting.
- PDF p.109: operation center physical resilience and event video retention concept.
- PDF p.113-114: centralized monitoring, backup and recovery concepts.
- PDF p.136: staged testing, daily checks, injury notification, suspension, accident report and resume concept.

### Explicitly not adopted

- PDF p.106: roadside CCTV deployment as operational dependency.
- PDF p.114: steering wheel angle and camera/LiDAR/radar health as required platform fields.
- PDF p.115: V2X / RSU / traffic signal integration.
- PDF p.118: GNSS/IMU/ECU/LiDAR/Radar raw data architecture.

Reason: Tesla FSD is a Tesla-provided vision-based system; our Phase 2 platform handles local governance and evidence rather than vehicle perception/control or roadside cooperative driving.

## 4. Taiwan Legal / Regulatory Assumptions

The final submission must be reviewed against the then-current versions of:

- 無人載具科技創新實驗條例
- 無人載具科技創新實驗管理辦法
- 道路交通、汽車運輸、事故處理與保險相關規定
- 個人資料保護法
- 資通安全與主管機關通報規範 where applicable
- actual sandbox approval letter and attached conditions

This package deliberately does not hardcode article numbers or universal deadlines. Approval documents and regulator policy records are the executable source of truth.

## 5. Key Assumptions

1. Tesla agrees to provide a regulatory event interface or equivalent data export for the approved pilot.
2. Tesla public Fleet Telemetry is used only for fields actually supported by each vehicle capability profile.
3. Independent onboard video evidence is available if the approval requires guaranteed accident video retrieval.
4. No roadside infrastructure is required.
5. A human safety operator is present when required by the approved experiment.
6. ROC actions are operational, not remote driving.
7. Phase 1 production authority remains available for human taxi fallback.

## 6. Traceability Matrix

| Requirement | SA | SD | Contract | Test |
|---|---|---|---|---|
| Tesla takeover authority | §4, §5.2 | §3.2, §7 | Tesla transition event | E2E-P2-004 |
| Local sandbox eligibility | §5.3-5.4 | §5-6 | dispatch evaluation | E2E-P2-002 |
| No roadside dependency | Non-goals | Route/area design | n/a | architecture review |
| Evidence freeze | §5.7 | §8 | evidence freeze API | E2E-P2-006 |
| Accident investigation | §6.4 | §8 | accident bundle API | E2E-P2-007 |
| Human fallback | §6.5 | §10 | fallback command | E2E-P2-008 |
| Provider gap fail-closed | §6.5 | §4.2 / §12 | gap/health contracts | E2E-P2-005 |
| Regulatory reporting | §5.8 | §10 / reporting | report jobs | E2E-P2-010 |
