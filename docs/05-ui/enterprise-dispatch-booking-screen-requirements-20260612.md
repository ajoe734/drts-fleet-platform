# Enterprise Dispatch Booking Frontend — Screen Requirements

**Date:** 2026-06-12
**Feature:** 企業用戶叫車前台（`enterprise_dispatch`）
**Recipient team:** 視覺設計團隊（含 UX）
**Status:** Functional hand-off + design response adopted.
**Author lane:** Codex
**Authority for behaviour/data/API:** [Tenant Console product spec](../01-product/platform-admin-ops-tenant-console-product-spec-20260508.md) · [tenant-commute-hub boundary](../02-architecture/tenant-commute-hub-boundary.md) · [Tenant Console hand-off packet](./tenant-console-design-handoff-packet-20260525.md) · `tests/e2e/E2E-012-tenant-business-operations.sh`
**Design response:** [Enterprise Dispatch.html](./drts-design-canvas/Enterprise%20Dispatch.html) · `docs/05-ui/drts-design-canvas/ent-*.jsx`
**Topology/freeze decision:** [SD-DP-20260612-007](../01-decisions/SD-DP-20260612-007-enterprise-dispatch-frontend-and-lovable-freeze.md)

> Same shape as the other UI hand-off packets: §2 personas, §3 context, §4 sitemap, §5 per-screen functional briefs, §6 API mapping, §7 adopted visual decisions.

---

## 1. Why this packet exists

企業用戶叫車前台，和信用卡機場接送前台是**不同產品**：

- `enterprise_dispatch` = 企業員工 / 行政 / 部門預約用車
- `credit_card_airport_transfer` = 卡友禮遇型機場接送

兩者雖然都走 `business_dispatch` 後端 rails，但前台 IA、身份來源、欄位優先級、成本歸屬、審批與額度語意都不同，不能把卡友前台直接改色後重用。

目前 workspace 內的 `tenant-commute-hub` 已有可運行的企業預約 consumer，包含：

- booking create / list / detail
- passenger / address / cost center / approval / reports 等租戶能力
- partner mode 與 tenant mode 的混合殼

但它的現況較接近「租戶入口 + 管理台 + partner mode 混合版」，**不適合作為新的前台體驗直接延用**。設計上應採取：

1. **UI / IA 重做**
2. `tenant-commute-hub` 僅作為**行為參考**與欄位 / API / edge case 參考
3. 後端 authority、資料契約、命令語意全部沿用 canonical `/api/tenant/*`

`tenant-commute-hub` / Lovable project is now **frozen as historical reference only** by `SD-DP-20260612-007`. Do not continue Enterprise Dispatch frontend or management-system development there.

### 1.1 Recommendation

**建議：不要再以 Lovable 當主交付面繼續演化，改為「fresh frontend rebuild」。**

理由：

1. `tenant-commute-hub` 把企業前台、租戶後台、partner mode 放在同一組 shell 與路由結構中，前後台邊界不夠乾淨。
2. 企業前台接下來需要同時支援 **企業內部 Web 版** 與 **企業內部 App 內嵌版**；現有 Lovable 版本沒有把 embed hand-off / host identity / compact chrome 視為第一級設計對象。
3. 新版應與 repo 內 canonical UI token、i18n、API contract、後續 deploy topology 對齊；Lovable 版本較適合作為原型與流程參考，不適合作為長期可維護主線。
4. 現有前台真正可保留的是**流程語意與欄位**，不是目前的資訊架構與視覺殼。

### 1.2 What to reuse from the current Lovable app

可以保留的不是 UI，而是以下行為語意：

- booking create 欄位集與 command payload 形狀
- passenger / address 預填與 directory lookup
- cost center / quota preview / approval preview
- accepted+pending command 狀態
- booking list / detail 的 read-side projection
- tenant bootstrap session 與 role / scope 邊界

### 1.3 Design response adopted on 2026-06-12

設計團隊回饋已落在 `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`，並採納以下方向：

- 視覺定位：tenant-branded employee self-service，不是 issuer / card-benefit white-label。
- Web shell：企業內部網站版使用簡化 top nav，僅保留首頁、我的預約、行程、說明。
- Embed shell：企業 App 內嵌版使用 compact host chrome，顯示 app hand-off 狀態，不顯示後台導覽。
- 預約流程：首頁 → 建立預約 → 確認權責 → 已受理 / 待審批，並保留 accepted+pending 語意。
- 權責呈現：`passenger` 與 `bookedBy` 不同時必須高辨識呈現，避免現場聯絡與費用責任混淆。
- Review page：以「費用歸屬與審批」作為決策核心，`costCenter`、額度影響、approval posture 優先於一般行程摘要。
- Active trip：採 transport-style progress rail，並將 ETA 明確標示為估計值。
- Gate states：統一 support-safe 模板，必須包含原因、下一步、企業客服，不用後台錯誤頁語氣。

注意：設計稿裡出現的「機場接送」是 **企業派車中的條件情境 / subtype**，費用、額度、審批與身份仍走 `enterprise_dispatch`。它不是 `credit_card_airport_transfer`，也不是 `partner-booking-web` 的信用卡卡友機場接送產品。

---

## 2. Personas

| Code | Persona | Surface | Goal |
|---|---|---|---|
| `employee_requester` | 一般員工 | Web, Embed | 為自己預約用車、查詢狀態、看結果 |
| `delegate_booker` | 行政 / 秘書 / 代訂人員 | Web, Embed | 為他人建立企業派車，填成本中心與現場聯絡資訊 |
| `approver_viewer` | 審批關係人 | Web, Embed (read-first) | 查看是否待審、是否已核准/拒絕 |
| `employee_tracker` | 乘車者 / 下單者 | Web, Embed | 看 booking / trip 狀態、司機指派、結果頁 |

> `tc_admin` / `tc_finance` / `tc_integration_mgr` 這些屬於後台 `tenant-console-web`，**不在本前台設計 packet 內**。

---

## 3. Operating context

### 3.1 Product boundary

- 本 packet 只涵蓋 **企業用戶叫車前台**
- **不涵蓋** 租戶後台治理（users / rules / api keys / webhooks / reports / billing）
- **不涵蓋** 卡友機場接送
- **不涵蓋** passenger first-party 公開乘客面

### 3.2 The two surfaces

| Surface | Audience | Identity source | Notes |
|---|---|---|---|
| S1 企業內部網站版 | 員工 / 行政 / 代訂人員 | enterprise SSO / tenant bootstrap session | full-size desktop / responsive web |
| S2 企業內部 App 內嵌版 | 企業 App 內部使用者 | host app signed session / tenant-scoped hand-off token | compact chrome, no standalone marketing shell |

### 3.3 Shared behavioural rules

- 所有 booking authority 都走 `/api/tenant/*`
- create / update / cancel 都是 **command pattern**
- UI 必須接受 `accepted+pending`，不能假設每次送出都同步完成
- 成本中心、額度、approval、status、availableActions 都以 backend response 為準
- 前台可以顯示 booking 狀態，但**不能做 dispatch 決策**
- zh-TW primary / en secondary

### 3.4 Enterprise-specific semantics

和卡友機場接送不同，企業前台的優先語意是：

- `bookedBy` 與 `passenger` 可能是不同人
- `costCenter` 是主欄位，不是附屬欄位
- approval / quota / policy preview 是關鍵決策點
- airport fields 可能存在，但只屬於某些 booking subtype 或情境，不是整個 IA 的中心
- 品牌是企業 / 租戶 identity，不是 issuer / card-benefit white-label

### 3.5 Embed rules

內嵌版應重用同一套 booking flow，但要有額外的 host identity states：

- signed-in hand-off
- token expired / re-auth required
- unsupported host / wrong realm
- consent / scope confirmation if required
- fallback to internal website

內嵌版**不應**顯示完整租戶後台導覽，也不應要求使用者手動輸入管理型憑證。

---

## 4. Sitemap

### 4.1 New design needed — the whole enterprise booking frontend

| Screen | Route (proposed) | Note |
|---|---|---|
| Entry / workspace home | `/` | self-service booking landing, not admin dashboard |
| New booking form | `/bookings/new` | self / delegate booking |
| Review before submit | `/bookings/review` | summary + policy / quota / approval preview |
| Submission accepted / pending | `/bookings/submitted` | command accepted, waiting confirmation |
| Booking result / detail | `/bookings/[bookingId]` | status, timeline, next actions |
| Booking history / list | `/bookings` | personal or tenant-scoped filtered list |
| Active trip / latest status | `/trip` | fastest way back to current ride |
| Receipt / outcome | `/receipts/[bookingId]` | if receipt is available for this channel |
| Help / support | `/help` | support, policy, FAQ |

### 4.2 Named negative / gate states

| Screen | Route (proposed) | Why it exists |
|---|---|---|
| Auth required | `/auth-required` | web session missing |
| Suspended / no access | `/suspended` | user or tenant not eligible to proceed |
| Approval pending | `/approval-pending` | booking created but awaiting approval |
| Approval rejected | `/approval-rejected` | explicit rejection outcome |
| Quota exhausted / policy blocked | `/quota-blocked` | cannot create booking now |
| No supply | `/no-supply` | request accepted but no fulfilment available |
| Degraded / service unavailable | `/degraded` | downstream degraded |

### 4.3 Embed-only identity states

| Screen | Route / state | Note |
|---|---|---|
| Signed-in hand-off | embed state `handoff_ok` | host app session accepted, go to booking |
| Re-auth required | embed state `reauth_required` | host token expired or stale |
| Unsupported host | embed state `unsupported_host` | embed opened outside allowed host / app |
| Consent / scope confirm | embed state `consent_required` | extra tenant scope consent if needed |
| Fallback to internal site | embed state `fallback_to_web` | no valid embed identity, continue in web |

---

## 5. Per-screen functional briefs

### 5.1 Entry / Workspace Home — route `/`

- **Purpose:** enterprise self-service landing, not a management console.
- **Persona:** `employee_requester`, `delegate_booker`.
- **Must show:**
  - tenant / enterprise identity
  - primary CTA: create booking
  - recent / upcoming booking summary
  - if present, current active trip summary
  - compact policy reminders: quota remaining, approval posture, support contact
- **States:**
  - first-use empty state
  - upcoming booking present
  - active trip in progress
  - degraded banner
- **Actions:**
  - create booking
  - open latest booking
  - open history
- **Constraints:** no admin navigation, no governance modules, no raw system jargon.

### 5.2 Booking Form — route `/bookings/new`

- **Purpose:** create a new enterprise dispatch booking.
- **Persona:** `employee_requester`, `delegate_booker`.
- **Must show fields:**
  - self vs book-for-someone-else mode
  - passenger picker / passenger search
  - pickup / dropoff
  - reservation window
  - cost center
  - booked by / onsite contact
  - vehicle preference if enabled
  - airport context when relevant: direction, flight no., terminal, luggage
  - notes
- **Must show helper reads:**
  - passenger / address shortcuts
  - cost center validity
  - quota preview
  - approval preview
- **States:**
  - empty
  - prefilled from directory
  - validation error
  - blocked by policy / quota
  - saving
- **Actions:**
  - continue to review
  - cancel
- **Constraints:** enterprise language first: passenger / cost center / approver / onsite handoff. Airport info is conditional, not the visual center.

### 5.3 Review Before Submit — route `/bookings/review`

- **Purpose:** final confirmation before command submit.
- **Persona:** `employee_requester`, `delegate_booker`.
- **Must show:**
  - booking summary
  - passenger + bookedBy separation if applicable
  - pickup / dropoff / window
  - cost center
  - quota impact preview
  - approval requirement summary
  - policy notes / cancellation window note
- **States:**
  - ready to submit
  - approval required
  - quota changed since form open
  - stale reference data
- **Actions:**
  - submit booking
  - go back and edit
- **Constraints:** this page should make cost ownership and approver consequences explicit.

### 5.4 Submitted / Accepted+Pending — route `/bookings/submitted`

- **Purpose:** cover the command-accepted but not-yet-fully-materialized state.
- **Persona:** all frontstage users.
- **Must show:**
  - request received
  - current processing posture:
    - confirming booking
    - waiting approval
    - retrying external dependency
  - lightweight next-step message
- **States:**
  - accepted and awaiting confirmation
  - accepted and waiting approval
  - accepted but degraded
- **Actions:**
  - refresh
  - view booking detail if id already issued
  - return to home
- **Constraints:** do not falsely present this as fully complete.

### 5.5 Booking Detail / Status — route `/bookings/[bookingId]`

- **Purpose:** single source of truth for one enterprise booking from the requester perspective.
- **Persona:** `employee_tracker`, `delegate_booker`, `approver_viewer`.
- **Must show:**
  - booking id / order id
  - current status
  - timeline
  - passenger / bookedBy / cost center
  - pickup / dropoff / reservation window
  - airport info when applicable
  - approval state
  - assigned driver / vehicle / ETA if available
  - cancellation / editability state from backend
- **States:**
  - editable
  - read-only
  - approval pending
  - completed
  - cancelled
  - no supply
- **Actions:**
  - cancel if available
  - edit if available
  - open receipt if available
- **Constraints:** use backend `availableActions`; never derive authority from status text alone.

### 5.6 Booking History / List — route `/bookings`

- **Purpose:** allow users to find past and upcoming enterprise bookings.
- **Persona:** `employee_requester`, `delegate_booker`.
- **Must show columns / cards:**
  - booking id
  - passenger
  - pickup / dropoff
  - reservation window
  - status
  - cost center
  - who booked
- **Filters:**
  - my bookings
  - booked by me
  - passenger
  - status
  - date range
- **States:**
  - no bookings yet
  - filtered empty
  - degraded / partial read
- **Actions:**
  - open detail
  - create new booking
- **Constraints:** this is a frontstage history view, not a dispatch board.

### 5.7 Active Trip — route `/trip`

- **Purpose:** fastest path to current ride status.
- **Persona:** `employee_tracker`.
- **Must show:**
  - current booking / trip identity
  - driver assigned or not
  - ETA framed as estimate
  - pickup / dropoff
  - support-safe next steps
- **States:**
  - no active trip
  - assigned
  - en route
  - arrived pickup
  - in progress
  - read-only external-control case
- **Actions:**
  - open booking detail
  - contact support
- **Constraints:** no invented mutation if this channel does not own it.

### 5.8 Receipt / Outcome — route `/receipts/[bookingId]`

- **Purpose:** expose post-trip artifact / outcome if the channel owns it.
- **Persona:** `employee_tracker`, `delegate_booker`.
- **Must show:**
  - trip outcome
  - completed / cancelled reason
  - receipt availability or explicit unsupported state
  - enterprise reimbursement / proof note if applicable
- **States:**
  - receipt ready
  - receipt unavailable for this channel
  - cancelled
  - proof pending
- **Actions:**
  - download / open artifact
  - return to history
- **Constraints:** do not invent receipt ownership if backend says this channel is read-only.

### 5.9 Help / Support — route `/help`

- **Purpose:** stable support and policy page for enterprise users.
- **Persona:** all.
- **Must show:**
  - support contact
  - booking policy summary
  - cancellation window explanation
  - approval / quota FAQ
  - degraded fallback guidance
- **Actions:**
  - call / message support
  - back to booking

### 5.10 Negative / Gate States — named routes

- **Purpose:** make every user-blocking state explicit.
- **Must include at least:**
  - auth required
  - suspended / no access
  - approval pending
  - approval rejected
  - quota blocked
  - no supply
  - degraded
- **Constraints:** no silent failures, no toast-only hard stops.

### 5.11 Embed Identity States — compact app-webview variants

- **Purpose:** enterprise internal app hand-off, like bank-app embed but enterprise-scoped.
- **Persona:** `employee_requester`, `delegate_booker`.
- **Must show states:**
  - signed-in hand-off success
  - token expired / re-auth required
  - unsupported host / wrong app
  - consent / scope confirmation
  - fallback to internal website
- **Constraints:**
  - no standalone login form as the default happy path
  - no admin nav
  - compact host chrome
  - same booking flow content, only shell density changes

---

## 6. API mapping

| Screen | Endpoint(s) |
|---|---|
| Booking form / review | `GET /api/tenant/passengers`, `GET /api/tenant/addresses`, `GET /api/tenant/cost-centers`, `GET /api/tenant/quota-summary`, `POST /api/tenant/bookings/policy-preview` or quota-preview equivalent |
| Submit booking | `POST /api/tenant/bookings/commands/create` |
| Booking history | `GET /api/tenant/bookings`, `GET /api/tenant/orders` |
| Booking detail | `GET /api/tenant/bookings/:bookingId`, `GET /api/tenant/orders/:orderId` |
| Edit / cancel | `POST /api/tenant/bookings/:bookingId/commands/update`, `POST /api/tenant/bookings/:bookingId/commands/cancel` |
| Active trip / receipt | tenant order / receipt read endpoints as available by channel |
| Embed bootstrap | host-resolved tenant session / signed hand-off token, then same tenant endpoints |

---

## 7. Visual decisions from design response

Source: [Enterprise Dispatch.html](./drts-design-canvas/Enterprise%20Dispatch.html)

- VQ-1: Web 與 App 內嵌版共用同一套流程語意；差異在 shell、spacing、header、footer CTA 與 hand-off 狀態。
- VQ-2: `bookedBy` 與 `passenger` 不同人時，以 avatar row、role pill、warn-tone helper text 呈現，文案明確寫出「乘客非下單人」。
- VQ-3: Review page 以「費用歸屬與審批」置頂，先顯示成本中心有效性、預估車資、額度影響與審批需求，再顯示乘客 / 行程。
- VQ-4: Active trip 採 transport-style progress rail，階段為已派車、前往上車、抵達上車、行程中、完成。
- VQ-5: 負向狀態頁採統一 support-safe 模板，包含 icon、posture pill、原因說明、key/value rows、primary/secondary next actions、企業客服。

Design tokens and shell:

- Default theme: light, tenant-branded blue accent `#2457D6`; canvas also exposes dark mode, compact density, and alternate accent swatches.
- Web frame: desktop canvas 1280 x 880; content max width 1180; frontstage top nav only.
- Embed frame: phone canvas 392 x 812; compact enterprise app chrome; host token / session details shown as status rows.
- Typography: Inter + Noto Sans TC, JetBrains Mono for ids / route / raw code labels.

Design artboards included:

- S1 website main flow: home, new booking, review, submitted.
- S1 website management / results: detail, history, trip, receipt, help.
- Gate states: auth required, suspended, approval pending, approval rejected, quota blocked, no supply, degraded.
- S2 embedded app identity states: handoff ok, reauth required, unsupported host, consent required, fallback to web.

---

## 8. Out of scope for this packet

- tenant admin 後台治理模組
- users / api keys / webhooks / reports / billing admin 頁
- partner booking / credit-card airport transfer
- platform admin / ops console / driver app
- 後端 authority、費率、dispatch、audit 寫入規則
