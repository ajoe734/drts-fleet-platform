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
