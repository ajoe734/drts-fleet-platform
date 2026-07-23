# P5-DESIGN-001 Design Handoff Packet
**Rating Governance**

**Task ID:** `P5-DESIGN-001`  
**Owner:** Product Design / Platform Admin Design  
**Blocks:** `P5-RATE-003`  
**Requirement Source:** `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md` §8  
**Canvas Component:** `docs/05-ui/drts-design-canvas/mtx-operations-screens.jsx` (`PA_P5_RatingQueue`, `PA_P5_RatingDetail`, `PA_P5_DriverRatingAuthority`)

---

## 1. Screen Inventory

| Screen ID | Screen Name | Canvas Component | Purpose |
| --------- | ----------- | ---------------- | ------- |
| `P5-RATE-UI-01` | Rating Review Queue | `PA_P5_RatingQueue` | Filter active, under-review, and invalidated ratings |
| `P5-RATE-UI-02` | Moderation Detail | `PA_P5_RatingDetail` | Review trip-linked rating and perform moderation invalidation |
| `P5-RATE-UI-03` | Driver Rating Authority | `PA_P5_DriverRatingAuthority` | Server-owned aggregate rating presentation (`rated`, `new_driver`, `unavailable`) |

---

## 2. Complete State Matrix

| State Name | Visual Presentation | Behavior & Constraints |
| ---------- | ------------------- | ---------------------- |
| **Active Rating** | Green badge (`active` / 有效) | Included in driver aggregate calculation |
| **Under Review** | Yellow badge (`under_review` / 審查中) | Temporarily flagged for moderation review |
| **Invalidated** | Red badge (`invalidated` / 已作廢) | Excluded from aggregate calculation with required audit reason |
| **Driver State: Rated** | `★ 4.9` + rating count | Server-calculated average for drivers with >= 5 ratings |
| **Driver State: New Driver** | `新加入駕駛` text pill | Rendered when rating count < 5; **NEVER** render fake `5.0` or `0.0` |
| **Driver State: Unavailable** | `評價資料目前無法使用` text pill | Server fallback when rating system is unavailable; **NEVER** render dummy defaults |

---

## 3. Frozen Chinese Copy & Terms

- `active`: 有效
- `under_review`: 審查中
- `invalidated`: 已作廢
- `rated`: 星級評等已採計
- `new_driver`: 新加入駕駛
- `unavailable`: 評價資料目前無法使用

---

## 4. Accessibility (a11y) Annotations

- Star scores use `aria-label="評分 5 星中的 1 星"`.
- Driver rating authority states use semantic text pills with contrast >= 4.5:1.
- Invalidation confirmation dialog uses `aria-describedby` pointing to moderation rules warning.

---

## 5. Prototype Interaction Flow

1. Rating moderator opens `/p5-ratings` (`P5-RATE-UI-01`).
2. Filters by `status: under_review` and `score: 1 星`.
3. Selects rating `RAT-80185` → Opens Moderation Detail (`P5-RATE-UI-02`).
4. Selects invalidation reason `不當言詞 / 無關行程之惡意評價` and enters audit note.
5. Clicks `作廢此評價` → Server invalidates rating, excludes score from driver average, and updates driver authority display (`P5-RATE-UI-03`).

---

## 6. Developer & API Handoff Map

- **Realm Theme:** Platform Realm (`@drts/ui-tokens` platform realm tokens).
- **Required Capabilities:** `rating:moderate`
- **API Seams:**
  - `GET /api/v1/p5-ratings`
  - `GET /api/v1/p5-ratings/{ratingId}`
  - `POST /api/v1/p5-ratings/{ratingId}/invalidate`
