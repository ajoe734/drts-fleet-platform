# P5-UI-PASSENGER-001 — BFF and Frontend Handoff Packet

- Sidecar Task: `P5-UI-PASSENGER-001-SIDECAR-BFF-HANDOFF`
- Parent Task: `P5-UI-PASSENGER-001` (P-5 passenger ride surface / 智行叫車)
- Parent Owner: `Codex`
- Parent Reviewer: `Gemini`
- Sidecar Owner: `Gemini`
- Sidecar Reviewer: `Codex`
- Date: 2026-07-21
- Class: support / sidecar — does not mutate canonical truth

---

## 1. Executive Summary & Purpose

This handoff packet prepares the complete BFF query gap inventory, passenger journey map, UI component topology, and contract guardrails for **`P5-UI-PASSENGER-001`** (`apps/passenger-web`).

The goal of this packet is to allow the parent owner (`Codex`) to build `apps/passenger-web` without re-deriving domain contracts, route boundaries, SSE event mappings, or `@drts/ui-tokens` styling rules.

### Core Objectives for `P5-UI-PASSENGER-001`
1. Scaffold `apps/passenger-web` (Next.js / App Router) supporting `/ride/[token]` and `/fares` / `/ride/[token]/fares`.
2. Implement all 14 passenger surfaces defined in `docs/05-ui/drts-design-canvas/p5-screens.jsx` (`P5-01` through `P5-12` plus `P5-A03` and `P5-A04`).
3. Wire API client and SSE stream hooks (`/api/passenger-rides/{token}/disclosure`, `/api/passenger-rides/{token}/events`) with fixture fallback support (`[FIXTURE]` markers).
4. Strictly adhere to statutory disclosure rules, forbidden vocabulary constraints, and realm color tokens (`@drts/ui-tokens`).

---

## 2. Canonical Anchors

- **Contract Truth**: [`packages/contracts/src/phase1-p5-s3-multi-taxi.ts`](file:///home/edna/workspace/drts-fleet-platform/packages/contracts/src/phase1-p5-s3-multi-taxi.ts)
  - `PassengerDispatchDisclosureSnapshot` (§6)
  - `RouteFareDisclosureSnapshot` (§7)
  - `VehiclePassengerDisclosureProfile` (§3.1)
  - `DriverPublicRegistrationCredential` (§3.2)
  - `DriverRatingSummary` (§4.2) & `PassengerTripRatingRecord` (§4.1)
  - `PassengerRideAccessToken` & `PassengerRideSseEvent` (§8)
- **UI Design Canvas**:
  - [`docs/05-ui/drts-design-canvas/p5-screens.jsx`](file:///home/edna/workspace/drts-fleet-platform/docs/05-ui/drts-design-canvas/p5-screens.jsx) (Screen definitions for P5-01..12 + A03/A04)
  - [`docs/05-ui/drts-design-canvas/p5-ui.jsx`](file:///home/edna/workspace/drts-fleet-platform/docs/05-ui/drts-design-canvas/p5-ui.jsx) (UI Kit components, icons, and layout parameters)
- **Design Tokens**:
  - [`packages/ui-tokens/src/realms.ts`](file:///home/edna/workspace/drts-fleet-platform/packages/ui-tokens/src/realms.ts) (`REALM_COLORS` for driver/tenant/ops badges)
  - [`packages/ui-tokens/src/brands.ts`](file:///home/edna/workspace/drts-fleet-platform/packages/ui-tokens/src/brands.ts) (Brand color ramps)
- **Architecture Specification**:
  - [`docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/00_source_specs_index.md`](file:///home/edna/workspace/drts-fleet-platform/docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/00_source_specs_index.md)
  - `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/03_gap_closure_implementation_plan.md`

---

## 3. Authority & Regulatory Guardrails

These non-negotiable guardrails are derived from Phase 1 P-5/S-3 system specifications and must be strictly maintained in `apps/passenger-web`:

1. **Runtime Profile & Capability Boundaries**:
   - Operating profile: `multi_taxi_direct` (`displayName`: "智行叫車", `reservationOnly`: true).
   - Only `taxi_reservation` service product is allowed.
2. **Forbidden Vocabulary & Visual Badges**:
   - **NEVER** render or accept terms: `FSD`, `自駕`, `無人駕駛`, `安全員`, `接管`, `ROC`, `sandbox`, `Tesla`, `forwarded`, `mirror`, or external platform badges/names.
   - Any raw platform error code or un-masked internal state rendered on user screens is a severity defect.
3. **Fail-Closed on Unverified/Incomplete Disclosure**:
   - Screen `P5-S11` ("派車資訊尚未完整"): Triggered when vehicle or driver credentials fail hard gates (`P5_VEHICLE_MAKE_MISSING`, `P5_DRIVER_REGISTRATION_UNVERIFIED`, `P5_DRIVER_REGISTRATION_EXPIRED`, etc.).
   - The UI must display polite, user-friendly retry/contact options without disclosing raw error strings.
4. **No Fake Ratings Policy**:
   - Drivers with 0 ratings MUST display `displayState: "new_driver"` with badge `"新進駕駛"` and text `"尚無乘車評價"`.
   - **DO NOT** default unrated drivers to `5.0` or fake star counts.
   - Uninitialized/failed rating lookups MUST render `displayState: "unavailable"`.
5. **Statutory Vehicle & Driver Disclosures**:
   - License plate (`plateNo`) is the primary identification field ("上車前請核對車牌").
   - Driver credential must render masked display (e.g. `北市計字第12***67號`), expiration date (`有效至 YYYY/MM/DD`), and status badge (`執登有效`).
   - Vehicle details must display: Make, model, model year, door count (3..6), and color.
6. **Statutory Contact & Emergency Footers**:
   - Hotlines `0800-090-000` (Customer Service) and `1999` (Regulatory Complaint) must be legible on every screen footer.

---

## 4. BFF Query & Endpoint Inventory

The passenger frontend interacts with the API through token-scoped endpoints. Access token scopes: `ride:read`, `ride:cancel`, `ride:rate`, `ride:contact`, `receipt:read`.

### API & Event Endpoint Mapping

| Surface / Action | Method | Path | Request / Payload | Response / Output |
| :--- | :--- | :--- | :--- | :--- |
| **Get Disclosure Snapshot** | `GET` | `/api/passenger-rides/{token}/disclosure` | Header: Bearer Token | `PassengerDispatchDisclosureSnapshot` |
| **Stream Real-time Events** | `GET` | `/api/passenger-rides/{token}/events` | Header: Accept: text/event-stream | Event Stream (`PassengerRideSseEvent`) |
| **Cancel Ride** | `POST` | `/api/passenger-rides/{token}/cancel` | `{ reason?: string }` | `{ cancelled: boolean, cancelFeeMinor: number }` |
| **Submit Rating** | `POST` | `/api/passenger-rides/{token}/ratings` | `{ score: 1..5, tags: string[], comment?: string }` | `PassengerTripRatingRecord` |
| **Get Ride Receipt** | `GET` | `/api/passenger-rides/{token}/receipt` | Header: Bearer Token | `ElectronicRideCertificate` |
| **Contact Driver Session** | `POST` | `/api/passenger-rides/{token}/driver-contact-session` | Empty body | `{ status: "ready" \| "not_provisioned", virtualPhone?: string, fallbackPhone: "0800-090-000" }` |
| **Get Public Fare Version** | `GET` | `/api/public/fares` | Query: `?status=active` | `MultiTaxiPublicFareVersion` |

### SSE Event Stream Types (`PassengerRideSseEvent`)

- `assignment_disclosure_ready`: Dispatches full assignment disclosure snapshot.
- `assignment_replaced`: Notifies passenger of driver/vehicle redispatch (P5-S04 -> P5-S05).
- `driver_location_updated`: Updates map coordinates (`lat`, `lng`) and freshness (`locationFreshness: "fresh" \| "stale"`).
- `eta_changed`: Updates remaining duration (`minutes`) and target arrival time.
- `driver_arrived`: Triggers P5-S06 ("司機已抵達上車點").
- `trip_started`: Triggers P5-S07 ("行程進行中").
- `trip_completed`: Triggers P5-S08 ("行程已完成" & rating form).
- `trip_cancelled`: Triggers cancellation confirmation state.
- `receipt_ready`: Enables receipt view / download action.

---

## 5. BFF Gaps & Mitigation Strategies

1. **Fixture vs. Live Mocking Strategy**:
   - *Gap*: The backend modules under `apps/api/src/modules/` are being implemented in parallel waves.
   - *Mitigation*: Scaffold `apps/passenger-web/lib/fixtures/` containing predefined JSON mock responses matching all 14 screens. Add a header/URL flag (`?fixture=true`) or environment setting (`NEXT_PUBLIC_USE_FIXTURES=true`) so frontend developer testing can run cleanly offline, while seamlessly switching to `/api/passenger-rides/{token}/*` when live backend routes are present.
2. **SSE Connection Loss & Polling Fallback**:
   - *Gap*: SSE streams can drop or encounter network degradation during active rides.
   - *Mitigation*: Implement automatic reconnection with exponential backoff. If SSE remains disconnected for > 15s, set `locationFreshness: "stale"` and display banner `"司機位置更新稍有延遲"`.
3. **Contact Driver Fallback**:
   - *Gap*: Virtual phone numbers for masked driver calls might be `not_provisioned`.
   - *Mitigation*: When `/driver-contact-session` returns `status: "not_provisioned"`, automatically render Screen `P5-S12` providing direct button to Customer Service `0800-090-000`.

---

## 6. Screen-by-Screen Operator & Passenger Journey Map

Below is the complete 14-screen mapping corresponding to `docs/05-ui/drts-design-canvas/p5-screens.jsx`:

```
 [ P5-01: Awaiting Assignment ] ────► [ P5-02 / P5-03: Driver En Route ] ────► [ P5-06: Driver Arrived ]
               │                                      │                                  │
               ▼                                      ▼                                  ▼
      [ P5-04: Redispatching ]              [ P5-12: Contact Unavail ]             [ P5-07: In Trip ]
               │                                      │                                  │
               ▼                                      ▼                                  ▼
      [ P5-05: Redispatched ]               [ P5-11: Disclosure Unavail ]         [ P5-08: Rating Form ]
                                                      │                                  │
                                                      ▼                                  ▼
                                            [ P5-A04: Quote Anomaly ]              [ P5-09: Thank You ]
                                                                                         │
                                                                                         ▼
                                                                               [ P5-10: Receipt / PDF ]
```

| Screen Code | Screen Name | Route Path | Key Visual Components | Trigger & State Conditions |
| :--- | :--- | :--- | :--- | :--- |
| **P5-01** | Awaiting Assignment | `/ride/[token]` | `P5Header`, `P5Map(state=missing)`, `SpinnerCard`, `P5RouteFare`, `CancelBtn` | Ride booked, waiting for driver assignment. Free cancellation note shown. |
| **P5-02** | Driver En Route (Rated) | `/ride/[token]` | `P5Header`, `P5Map(state=fresh)`, `P5Eta`, `P5VehicleCard(rating=rated)`, `P5Actions` | Driver assigned with existing rating history. ETA banner active. |
| **P5-03** | Driver En Route (New) | `/ride/[token]` | `P5Header`, `P5Map(state=fresh)`, `P5Eta`, `P5VehicleCard(rating=new)`, `P5Actions` | Driver has 0 prior trips. Displays `"新進駕駛"` badge without fake score. |
| **P5-04** | Redispatch In Progress | `/ride/[token]` | `P5Header`, `P5Map(state=missing)`, `P5VehicleCard(dimmed, tag="已取消指派")` | Original driver unassigned; searching for new driver. Cancellation is free. |
| **P5-05** | Redispatch Completed | `/ride/[token]` | `P5Header`, `OkBanner("已為您改派新的車輛")`, `P5Map`, `P5VehicleCard(plateChanged=true)` | New vehicle/driver assigned. Yellow alert tag: `"⚠ 車牌已更新，請重新核對"`. |
| **P5-06** | Driver Arrived | `/ride/[token]` | `P5Header`, `P5Map`, `P5Eta(tone=ok, "司機已抵達上車點")`, `P5Seatbelt`, `P5Actions` | Driver at pickup location. Shows 3-minute grace period warning. |
| **P5-07** | Trip In Progress | `/ride/[token]` | `P5Header("行程進行中")`, `P5Map`, `P5Eta("約 XX 抵達目的地")`, `P5Seatbelt`, `P5VehicleCard` | Passenger on board. Route and distance remaining displayed. |
| **P5-08** | Trip Completed & Rating | `/ride/[token]` | `P5Header("行程已完成")`, `RatingCard(P5Stars)`, `TagPicker`, `SubmitRatingBtn` | Trip ended. Interactive 1-5 star selection and feedback tags. |
| **P5-09** | Rating Submitted | `/ride/[token]` | `P5Header`, `CheckIconHero`, `ViewReceiptBtn`, `BackHomeBtn` | Rating submitted. Action buttons to view receipt or return. |
| **P5-10** | Electronic Receipt | `/ride/[token]/receipt` | `P5Header("電子乘車證明")`, `ReceiptDetailsTable`, `DownloadPdfBtn`, `ShareBtn` | Statutory fare breakdown, distance, mileage, tax ID, legal complaint hotlines. |
| **P5-11** | Disclosure Unavailable | `/ride/[token]` | `P5Header("正在安排車輛")`, `WarnHero("派車資訊尚未完整")`, `RefreshBtn`, `ContactSupportBtn` | Fail-closed state when disclosure criteria fail verification. |
| **P5-12** | Contact Not Provisioned | `/ride/[token]` | `P5Header`, `P5Map`, `P5VehicleCard`, `ContactSupportCard("目前無法直接聯絡司機")` | Virtual phone session unavailable. Fallback to Customer Service `0800-090-000`. |
| **P5-A04** | Fare Quote Anomaly | `/ride/[token]` | `P5Header("正在確認預約")`, `P5RouteFare(mode=anomaly)`, `RefreshQuoteBtn`, `SupportBtn` | Anomaly code (`quote_provider_unavailable`, etc.). Order pending confirmation. |
| **P5-A03** | Public Fare Version | `/fares` / `/ride/[token]/fares` | `P5Header("計費說明")`, `FareRateCard`, `FareRuleCard`, `StatutoryNotice` | Effective fare table (起程/續程/延滯/夜間加成) + authority filing reference. |

---

## 7. Design System & Token Integration

`apps/passenger-web` MUST consume styling tokens from `@drts/ui-tokens` and match `p5-ui.jsx` layouts dynamically. **Do NOT hardcode raw hex values in CSS or components.**

### Token Resolution Strategy
The passenger application supports dynamic white-labeling across different partner brands/tenants. The UI must resolve the active brand theme from `@drts/ui-tokens` using the brand/tenant identifier from the dispatch token or hostname context (e.g. via `getPartnerBrandTemplateBySlug(slug)` or `BRAND_TEMPLATES[code]`).

### UI Design Token Mapping Table

Below is the required mapping from the design canvas elements to `@drts/ui-tokens` semantic variables:

| Design Canvas Property | Mapping to `@drts/ui-tokens` | Example (CTBC Brand, Light Mode) |
| :--- | :--- | :--- |
| **Shell Background** (`P5.bg`) | `brandTheme.theme.pageBackground` | `#F4F7FC` |
| **Card Surface** (`P5.surface`) | `brandTheme.theme.panel` | `#FFFFFF` |
| **Primary Text/Ink** (`P5.ink`) | `brandTheme.tokens[mode].ink` or `theme.pageForeground` | `#14202C` |
| **Muted Text** (`P5.mut`) | `brandTheme.tokens[mode].text.muted` or `theme.pageMuted` | `#5C6778` |
| **Divider Line** (`P5.line`) | `brandTheme.theme.panelBorder` | `rgba(20, 32, 44, 0.12)` |
| **Soft Line** (`P5.lineSoft`) | Derived soft border or `brandTheme.theme.panelBorder` | `rgba(20, 32, 44, 0.12)` |
| **Primary Brand Accent** (`P5.brand`) | `brandTheme.primary` | `#13478F` |
| **Dark Brand Accent** (`P5.brandDark`) | `brandTheme.primaryDark` | `#0B2D5C` |
| **Brand Soft Bg** (`P5.brandBg`) | `brandTheme.surface.bg` or `theme.accentSoft` | `#EBF2FB` |

### Status Colors (Global Light Mode)
Status indicators (e.g. validation alerts, eta, seatbelt notice) must map to the global status tones defined in `packages/ui-tokens/src/colors.ts`:

| Semantic State | Tone Type | `@drts/ui-tokens` Mapping | Color Value |
| :--- | :--- | :--- | :--- |
| **Ok / Success** | FG | `STATUS_TONES.success.light.fg` | `#0F7B5A` |
| | BG | `STATUS_TONES.success.light.bg` | `#E5F4ED` |
| | Border | `STATUS_TONES.success.light.border` | `#A7D7C2` |
| **Warning / Alert** | FG | `STATUS_TONES.warning.light.fg` | `#A8590B` |
| | BG | `STATUS_TONES.warning.light.bg` | `#FCEED6` |
| | Border | `STATUS_TONES.warning.light.border` | `#F0CC95` |
| **Danger / Error** | FG | `STATUS_TONES.danger.light.fg` | `#B42318` |
| | BG | `STATUS_TONES.danger.light.bg` | `#FEE4E2` |
| | Border | `STATUS_TONES.danger.light.border` | `#F8B3AC` |

### Actor Realm Color Badges
Actor-specific chips or verification status badges (e.g. driver status, regulatory chips) must consume the global `REALM_COLORS` defined in `packages/ui-tokens/src/realms.ts`:

- **Driver Badge** (`"執登有效"`): Uses `REALM_COLORS.driver.light`
  - FG: `REALM_COLORS.driver.light.fg` (`#A8590B`)
  - BG: `REALM_COLORS.driver.light.bg` (`#FCEED6`)
  - Border: `REALM_COLORS.driver.light.border` (`#F0CC95`)
- **System / Platform Badge**: Uses `REALM_COLORS.system.light` or `REALM_COLORS.platform.light` respectively.

### Layout Specs & Responsive Container
- Mobile-first web shell viewport: `390px` width (max-width `440px` centered on desktop screens).
- Outer phone container border radius: `38px` with top bar (status time `14:29`, URL `ride.zhixing.tw/r/••••K2`, signal `5G`).
- Typography Font: `"Inter", "Noto Sans TC", system-ui, sans-serif`
- Monospace Data Font: `"JetBrains Mono", ui-monospace, monospace`

---

## 8. Carry-Forward Checklist for Parent Owner (`Codex`)

When implementing task `P5-UI-PASSENGER-001`, complete the following steps:

1. **Scaffold `apps/passenger-web`**:
   - Create package directory `apps/passenger-web/` with `package.json`, `tsconfig.json`, `next.config.js`.
   - Add routes:
     - `app/ride/[token]/page.tsx`
     - `app/ride/[token]/receipt/page.tsx`
     - `app/fares/page.tsx`
     - `app/ride/[token]/fares/page.tsx`
2. **Implement UI Component Library**:
   - Port components from `docs/05-ui/drts-design-canvas/p5-ui.jsx` into `apps/passenger-web/components/` or `packages/ui-web/src/passenger/`.
   - Components: `P5Phone`, `P5Header`, `P5Card`, `P5Map`, `P5Eta`, `P5VehicleCard`, `P5RouteFare`, `P5Btn`, `P5Actions`, `P5Seatbelt`, `P5Notice`, `P5Stars`.
3. **Fixture Data Setup**:
   - Create `apps/passenger-web/lib/fixtures/p5-screens-fixtures.ts` exporting mock states for screens P5-01 through P5-12, P5-A03, and P5-A04.
4. **API & SSE Client Integration**:
   - Create `apps/passenger-web/lib/passenger-api-client.ts` to call `/api/passenger-rides/{token}/*` and subscribe to EventSource SSE streams.
5. **Verification**:
   - Run `pnpm --filter @drts/passenger-web typecheck` (or `pnpm build`).
   - Validate accessibility (aria-labels on ratings and action buttons) and visual fidelity against `p5-screens.jsx`.

---

## 9. Verification & Acceptance

- [x] Handoff packet created at `support/sidecars/P5-UI-PASSENGER-001/P5-UI-PASSENGER-001-SIDECAR-BFF-HANDOFF.md`
- [x] No canonical truth files modified by this sidecar slice
- [x] Comprehensive BFF query gap inventory & SSE events enumerated
- [x] Complete 14-screen operator journey mapped with design canvas anchors
- [x] Statutory disclosure rules and forbidden vocabulary documented
- [x] Packet handed off to reviewer `Codex` via `scripts/ai-status.sh handoff`
