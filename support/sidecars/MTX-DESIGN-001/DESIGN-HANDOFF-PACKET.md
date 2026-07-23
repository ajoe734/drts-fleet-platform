# MTX-DESIGN-001 Design Handoff Packet
**Operating Authorization Console**

**Task ID:** `MTX-DESIGN-001`  
**Owner:** Product Design / Platform Admin Design  
**Blocks:** `MTX-AUTH-UI-001`  
**Requirement Source:** `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md` §6  
**Canvas Component:** `docs/05-ui/drts-design-canvas/mtx-operations-screens.jsx` (`PA_MTX_AuthRegistry`, `PA_MTX_AuthDetail`, `PA_MTX_AuthDraftEditor`, `PA_MTX_AuthLifecycleConfirm`, `PA_MTX_AuthVehicles`, `PA_MTX_AuthConflictState`)

---

## 1. Screen Inventory

| Screen ID | Screen Name | Canvas Component | Purpose |
| --------- | ----------- | ---------------- | ------- |
| `MTX-AUTH-UI-01` | Authorization Registry | `PA_MTX_AuthRegistry` | Search, filter, compare status/effective window |
| `MTX-AUTH-UI-02` | Authorization Detail | `PA_MTX_AuthDetail` | Read canonical authorization, status, and lifecycle |
| `MTX-AUTH-UI-03` | Draft Editor | `PA_MTX_AuthDraftEditor` | Create or edit a draft authorization |
| `MTX-AUTH-UI-04` | Lifecycle Confirmation | `PA_MTX_AuthLifecycleConfirm` | Confirm activate or suspend with consequence warning |
| `MTX-AUTH-UI-05` | Authorized Vehicles | `PA_MTX_AuthVehicles` | Maintain vehicle membership and history |
| `MTX-AUTH-UI-06` | Conflict / Permission State | `PA_MTX_AuthConflictState` | Handle stale version (409) and permission denied (403) |

---

## 2. Complete State Matrix

| State Name | Visual Presentation | Behavior & Constraints |
| ---------- | ------------------- | ---------------------- |
| **Happy / Active** | Success green badge (`approved`), clear effective dates, active fare link | Normal read/write based on RBAC capabilities |
| **Draft** | Neutral gray badge (`draft`), edit button active, activation permitted | Unsubmitted state; does not unblock driver dispatch |
| **Suspended** | Warning yellow badge (`suspended`), suspend reason displayed | Temporarily halts multi-taxi eligibility for associated vehicles |
| **Expired / Revoked** | Danger red badge (`expired` / `revoked`), read-only lock icon | Historical record; immutable; no activate/edit actions |
| **Loading** | CanvasSkeleton table and form placeholders | All action buttons disabled; no flash of mock data |
| **Empty** | `無符合條件之營運許可` text banner | Clear search filter reset trigger |
| **Forbidden (403)** | Red banner (`lock` icon), disabled mutation controls | Identified capability: `multi_taxi_authorization:activate` missing |
| **Stale / Conflict (409)** | Warning banner (`alert` icon) + Reload button | Concurrent edit detected; prevents silent overwrite |

---

## 3. Frozen ZH-TW Copy Dictionary

- `draft`: 草稿
- `approved`: 已核准
- `suspended`: 已暫停
- `expired`: 已失效
- `revoked`: 已撤銷
- `authorizationId`: 許可 ID
- `authorityCode`: 許可代碼
- `operatorId`: 業者
- `businessPlanVersion`: 營業計畫版本
- `activeFareVersionId`: 生效費率版本
- `effectiveFrom`: 生效時間
- `effectiveUntil`: 失效時間

---

## 4. Accessibility (a11y) Annotations

- Table rows use `aria-rowindex` and proper header associations (`th scope="col"`).
- Status badges use `role="status"` with text labels alongside color indicators (never color-only).
- Confirmation modals wrap content in `role="dialog"` with `aria-modal="true"` and focus lock.
- Form inputs have explicit `<label font-weight="700">` and `aria-required="true"`.
- Contrast ratio matches WCAG AA (>= 4.5:1 for body text, >= 3:1 for large headers).

---

## 5. Step-by-Step Prototype Interaction Flow

1. Operator opens `/multi-taxi-authorizations` (`MTX-AUTH-UI-01`).
2. Clicks `新增許可草稿` → Navigates to Draft Editor (`MTX-AUTH-UI-03`).
3. Fills `authorityCode`, `operatorId`, `businessPlanVersion`, select `serviceAreaCodes` and `activeFareVersionId`.
4. Clicks `儲存草稿` → Draft created; redirects to Detail (`MTX-AUTH-UI-02`) with `draft` status.
5. Authorized activator clicks `確認啟用` → Modal (`MTX-AUTH-UI-04`) pops up showing consequence warning and affected vehicles count.
6. Confirms activation → Status changes to `approved` (green dot) and writes audit log.

---

## 6. Developer & API Handoff Map

- **Realm Theme:** Platform Realm (`@drts/ui-tokens` platform realm tokens: light fg `#4F46E5` / bg `#EEF2FF`, dark fg `#A5B4FC` / bg `#1E1B4B`).
- **Required Capabilities:**
  - `multi_taxi_authorization:read` (View registry & detail)
  - `multi_taxi_authorization:write` (Create/edit draft & vehicle membership)
  - `multi_taxi_authorization:activate` (Activate / suspend)
- **API Seams:**
  - `GET /api/v1/multi-taxi-authorizations`
  - `POST /api/v1/multi-taxi-authorizations`
  - `GET /api/v1/multi-taxi-authorizations/{id}`
  - `POST /api/v1/multi-taxi-authorizations/{id}/activate`
  - `POST /api/v1/multi-taxi-authorizations/{id}/suspend`
---

## 7. §19 Per-Frame Annotations Evidence Matrix

| Frame Name | Screen ID | Viewport | User Capability | Data State | Source Status | Component Variants | Focus Order | API & Field Mapping | Empty / Error / Conflict Behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MTX-AUTH-UI-01_Registry_1440x900` | `MTX-AUTH-UI-01` | Desktop (1440x900) | `multi_taxi_authorization:read` | `Happy / Active` | `live-contract` | `AdminShell`, `PageHeader`, `AuthorizationRegistryTable`, `StatusFilterPills` | 1. Sidebar Nav -> 2. Search -> 3. Status Filter -> 4. Table Header -> 5. Table Rows -> 6. Create Draft FAB | `GET /api/v1/multi-taxi-authorizations` -> `authorizationId`, `operatorId`, `authorityCode`, `status`, `effectiveFrom`, `effectiveUntil` | Empty: `無符合條件之營運許可` banner. Error: 500 alert. Conflict: 409 refresh banner. |
| `MTX-AUTH-UI-01_Registry_Narrow_390x844` | `MTX-AUTH-UI-01_Narrow` | Narrow Mobile (390x844) | `multi_taxi_authorization:read` | `Happy Mobile` | `live-contract` | `MobileShell`, `PageHeader_Compact`, `AuthorizationCardList` | 1. Mobile Menu -> 2. Search Input -> 3. Accordion Filter -> 4. Card List -> 5. FAB | `GET /api/v1/multi-taxi-authorizations` -> mobile card fields (`authorityCode`, `operatorId`, `status`) | Single-column cards with touch-friendly 44px tap targets. Full 200% zoom support. |
| `MTX-AUTH-UI-02_Detail_Approved_1440x900` | `MTX-AUTH-UI-02` | Desktop (1440x900) | `multi_taxi_authorization:read`, `:activate` | `Approved Detail` | `live-contract` | `AdminShell`, `DataList`, `VehicleMembershipSummary`, `ActionBar` | 1. Back Link -> 2. Detail Grid -> 3. Fare Link -> 4. Vehicles Summary -> 5. Suspend Button | `GET /api/v1/multi-taxi-authorizations/{id}` -> full detail fields | 404: `找不到此營運許可` fallback. Suspended: yellow warning. Expired/Revoked: read-only lock. |
| `MTX-AUTH-UI-03_Draft_Editor_1280x800` | `MTX-AUTH-UI-03` | Laptop (1280x800) | `multi_taxi_authorization:write` | `Draft Form Edit` | `live-contract` | `AdminShell`, `FormGrid`, `EffectiveDatePicker`, `FareVersionSelect` | 1. Authority Code -> 2. Operator -> 3. Business Plan -> 4. Service Areas -> 5. Fare Select -> 6. Date Pickers -> 7. Save Draft -> 8. Cancel | `POST/PUT /api/v1/multi-taxi-authorizations` -> `operatorId`, `authorityCode`, `serviceAreaCodes`, `activeFareVersionId` | Missing fields trigger inline errors & validation summary. Unsaved changes prompt dialog. |
| `MTX-AUTH-UI-04_Lifecycle_Confirm_1440x900` | `MTX-AUTH-UI-04` | Desktop (1440x900) | `multi_taxi_authorization:activate` | `Lifecycle Modal` | `live-contract` | `AdminShell`, `ConfirmationModal`, `ConsequenceSummary` | 1. Modal Container (Focus trapped) -> 2. Warning Copy -> 3. Vehicle Count -> 4. Cancel -> 5. Confirm | `POST /api/v1/multi-taxi-authorizations/{id}/activate|suspend` | Consequence warning explicitly details dispatch impact. 409 conflict if status changed while open. |
| `MTX-AUTH-UI-05_Vehicles_1440x900` | `MTX-AUTH-UI-05` | Desktop (1440x900) | `multi_taxi_authorization:write` | `Vehicle Membership` | `live-contract` | `AdminShell`, `AuthorizedVehicleTable`, `AddVehicleDrawer` | 1. Vehicle Search -> 2. Add Vehicle Button -> 3. Membership Table Rows -> 4. Status Badge -> 5. Remove Action | `GET/POST /api/v1/multi-taxi-authorizations/{id}/vehicles` -> `authorizationVehicleId`, `vehicleId`, `status` | Empty: `目前尚無授權車輛名單`. Duplicate vehicle add triggers `MULTI_TAXI_VEHICLE_ALREADY_MEMBER`. |
| `MTX-AUTH-UI-06_Conflict_403_1440x900` | `MTX-AUTH-UI-06` | Desktop (1440x900) | `multi_taxi_authorization:read` | `Permission / Conflict` | `live-contract` | `AdminShell`, `ForbiddenBanner`, `PermissionBoundary` | 1. Error Banner -> 2. Missing Capability Description -> 3. Reload Action -> 4. Nav Link | HTTP 403 Forbidden / HTTP 409 Stale Version | 403 displays missing capability (`:activate`) in human terms. 409 offers reload without silent overwrite. |
