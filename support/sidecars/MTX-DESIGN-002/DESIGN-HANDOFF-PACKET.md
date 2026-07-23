# MTX-DESIGN-002 Design Handoff Packet
**Queue Semantics Operations**

**Task ID:** `MTX-DESIGN-002`  
**Owner:** Product Design / Ops Console Design  
**Blocks:** `MTX-QUEUE-003`  
**Requirement Source:** `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md` §7  
**Canvas Component:** `docs/05-ui/drts-design-canvas/mtx-operations-screens.jsx` (`OPS_MTX_QueueOverview`, `OPS_MTX_QueueEntryDetail`, `OPS_MTX_LegalDenialState`)

---

## 1. Screen Inventory

| Screen ID | Screen Name | Canvas Component | Purpose |
| --------- | ----------- | ---------------- | ------- |
| `MTX-QUEUE-UI-01` | Queue Overview | `OPS_MTX_QueueOverview` | Overview of active driver queues with explicit `queueMode` labels |
| `MTX-QUEUE-UI-02` | Queue Entry Detail | `OPS_MTX_QueueEntryDetail` | Detail of driver profile, site, authorization, and eligibility decision |
| `MTX-QUEUE-UI-03` | Non-Bypassable Legal Denial | `OPS_MTX_LegalDenialState` | Non-bypassable legal denial presentation for physical rank and taxi stand |

---

## 2. Complete State Matrix

| State Name | Visual Presentation | Behavior & Constraints |
| ---------- | ------------------- | ---------------------- |
| **Virtual Matching (Eligible)** | Blue badge (`virtual_matching` / 虛擬媒合), Green dot (`eligible` / 符合派車資格) | Multi-taxi driver is legally eligible for on-demand/scheduled platform dispatch |
| **Physical Rank (Legal Denial)** | Red badge (`physical_rank` / 實體排班), Red warning banner (`denied_legal` / 法定拒絕進入) | Non-bypassable denial. **NO** manual override or force check-in control exists! |
| **Taxi Stand (Legal Denial)** | Red badge (`taxi_stand` / 計程車招呼站), Red warning banner (`denied_legal` / 法定拒絕進入) | Non-bypassable denial per Highway Act & Multi-Taxi Regulations |
| **Loading** | OpsSkeleton table rows | Disables action triggers |
| **Empty** | `目前無佇列資料` neutral message | Clear filter reset control |

---

## 3. Frozen Chinese Legal Denial Copy

1. **Physical Rank Denial:**
   > `此車輛屬多元化計程車服務，不得進入實體排班候客。`
2. **Taxi Stand Denial:**
   > `此車輛屬多元化計程車服務，不得於計程車招呼站排班候客。`
3. **Operational Guidance:**
   > `營運主控台無權限覆蓋 (Override) 此項法定限制。請引導駕駛離開實體排班區，並切換至平台虛擬媒合系統候客。`

---

## 4. Accessibility (a11y) Annotations

- Queue modes feature distinct text labels alongside status badge colors (never color-only).
- Non-bypassable legal denial banners use `role="alert"` and `aria-live="assertive"`.
- Table filters are fully keyboard accessible using Standard Tab / Shift+Tab and Space/Enter.

---

## 5. Prototype Interaction Flow

1. Dispatch operator views `/dispatch/queue` (`MTX-QUEUE-UI-01`).
2. Filters by `queueMode: physical_rank`.
3. System highlights entry `DRV-8802 (AKQ-5566)` in red state with status `denied_legal`.
4. Operator clicks `檢視細節` → Opens Legal Denial View (`MTX-QUEUE-UI-03`).
5. Denial view renders mandatory non-bypassable legal copy with no force override button.
6. Operator clicks `引導返回虛擬媒合` to send notification to driver app to leave physical rank.

---

## 6. Developer & API Handoff Map

- **Realm Theme:** Ops Realm (`@drts/ui-tokens` ops realm tokens: light fg `#DC2626` / bg `#FEF2F2`, dark fg `#FCA5A5` / bg `#3F1212`).
- **Required Capabilities:** Ops dispatch read capabilities.
- **API Seams:**
  - `GET /api/v1/dispatch/queue`
  - `GET /api/v1/dispatch/queue/{entryId}`
---

## 7. §19 Per-Frame Annotations Evidence Matrix

| Frame Name | Screen ID | Viewport | User Capability | Data State | Source Status | Component Variants | Focus Order | API & Field Mapping | Empty / Error / Conflict Behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MTX-QUEUE-UI-01_Overview_1440x900` | `MTX-QUEUE-UI-01` | Desktop (1440x900) | `ops_dispatch:read` | `Virtual Matching Overview` | `live-contract` | `OpsShell`, `QueueModeChip`, `VirtualMatchingTable` | 1. Ops Nav -> 2. Queue Mode Filter -> 3. Service Area Filter -> 4. Search -> 5. Table Rows -> 6. Detail View | `GET /api/v1/dispatch/queue` -> `driverId`, `vehicleId`, `runtimeProfileCode`, `queueMode`, `eligibilityDecision` | Empty: `目前無佇列資料`. Displays explicit text badges for queueMode alongside color tokens. |
| `MTX-QUEUE-UI-01_Overview_Narrow_390x844` | `MTX-QUEUE-UI-01_Narrow` | Narrow Mobile (390x844) | `ops_dispatch:read` | `Virtual Matching Mobile` | `live-contract` | `MobileShell`, `QueueCardList_Compact`, `QueueModeChip` | 1. Filter Drawer -> 2. Compact Search -> 3. Queue Mobile Cards -> 4. Expand Card Detail | `GET /api/v1/dispatch/queue` -> mobile compact queue card projection | Responsive single-column cards. Retains visibility of non-bypassable denial status on mobile viewports. |
| `MTX-QUEUE-UI-02_Detail_1440x900` | `MTX-QUEUE-UI-02` | Desktop (1440x900) | `ops_dispatch:read` | `Queue Entry Detail` | `live-contract` | `OpsShell`, `QueueEntryDetailCard`, `QueueModeChip` | 1. Back Link -> 2. Driver & Vehicle Summary -> 3. Runtime Profile (`multi_taxi_direct`) -> 4. Auth Ref -> 5. Eligibility Decision | `GET /api/v1/dispatch/queue/{entryId}` -> full entry metadata and check-in history | Stale entry displays timestamp warning and refresh option. |
| `MTX-QUEUE-UI-03_TaxiStandDenied_1440x900` | `MTX-QUEUE-UI-03` | Desktop (1440x900) | `ops_dispatch:read` | `Non-Bypassable Legal Denial` | `live-contract` | `OpsShell`, `LegalDenialBanner`, `SafeNextStepAction` | 1. Red Alert Banner (`aria-live="assertive"`) -> 2. Denial Copy -> 3. Driver & Vehicle Info -> 4. Safe Next Step Button (`引導返回虛擬媒合`) | `GET /api/v1/dispatch/queue/{entryId}` -> `eligibilityDecision: DENIED_LEGAL_PHYSICAL_RANK|TAXI_STAND` | NON-BYPASSABLE! Ops Console provides NO manual override or force check-in control. |
