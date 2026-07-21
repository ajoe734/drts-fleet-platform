# P5-UI-ADMIN-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `P5-UI-ADMIN-001` — P-5 back-office disclosure/fare UI  
**Parent Owner:** `Codex`  
**Parent Reviewer:** `Claude`  
**Sidecar Owner:** `Gemini`  
**Sidecar Reviewer:** `Codex`  
**Generated:** `2026-07-21` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical truth, design canvas specs, runtime behavior, or any L1/L2 product surface. For live machine-truth status, read `ai-status.json -> P5-UI-ADMIN-001-SIDECAR-ACCEPTANCE.status` directly.

This packet is the forward-looking acceptance map and reviewer support document for parent task `P5-UI-ADMIN-001`. The parent task is currently in `review` in machine truth. This packet pins the acceptance criteria, upstream/downstream dependency maps, design canvas contracts (`platform-p5.jsx`), and reviewer evidence anchors so that parent review and integration validation can be performed systematically.

---

## 1. Scope Boundary

### In Scope

- Establish a structured, citation-anchored acceptance checklist for `P5-UI-ADMIN-001`.
- Map formal upstream dependencies (`P5-SUP-DRV-001`, `P5S3-FOUND-001`) and verify their completion status in machine truth.
- Record downstream dependencies and blast-radius impacts (`P5-UI-PASSENGER-001` passenger disclosure preview alignment).
- Translate design canvas specs (`docs/05-ui/drts-design-canvas/platform-p5.jsx`) into explicit visual and behavioral contracts.
- Provide reviewer handoff and verification command blocks for assigned reviewers.

### Out of Scope

- Editing canonical product truth (`phase1_prd_detailed_v1.md`, `phase1_service_contracts_v1.md`, source specs).
- Editing primary app runtime code (`apps/platform-admin-web/**`, `packages/ui-web/**`).
- Altering machine-truth fields of parent task `P5-UI-ADMIN-001`.
- Overriding design canvas specifications or token system definitions.

---

## 2. Machine Truth & Spec Anchors

### Sidecar Task — `ai-status.json -> P5-UI-ADMIN-001-SIDECAR-ACCEPTANCE`

- **Owner:** `Gemini`
- **Reviewer:** `Codex`
- **Task Class:** `sidecar`
- **Helper Parent:** `P5-UI-ADMIN-001`
- **Helper Kind:** `acceptance_packet`
- **Mutates Canonical:** `false`
- **Artifacts:** `support/sidecars/P5-UI-ADMIN-001/P5-UI-ADMIN-001-SIDECAR-ACCEPTANCE.md` (this file)
- **Acceptance:**
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### Parent Task — `ai-status.json -> P5-UI-ADMIN-001`

- **ID:** `P5-UI-ADMIN-001`
- **Title:** `P-5 back-office disclosure/fare UI`
- **Summary:** `platform-admin-web 補 P-5 後臺(揭露欄位檢視/更正佇列/公開車資版本)，對照 platform-p5.jsx，遮罩登記證號`
- **Phase:** `Phase1-P5-S3-UI`
- **Owner:** `Codex`
- **Reviewer:** `Claude`
- **Status:** `review`
- **Depends On:** `P5-SUP-DRV-001`
- **Artifacts:**
  - `apps/platform-admin-web/`
  - `packages/ui-web/`
  - `docs/05-ui/drts-design-canvas/platform-p5.jsx`
- **Acceptance Criteria:**
  - `disclosure review matches platform-p5.jsx masked registration only`
  - `correction queue with view/return/approve`
  - `public fare version draft/filed/active/retired+preview`
  - `reads reg.* tables RBAC gated`
  - `indigo realm tokens no 套皮`
  - `i18n via t()`
  - `reviewer PASS`

### Authoritative Reference Documents

- **Design Canvas Spec:** `docs/05-ui/drts-design-canvas/platform-p5.jsx`
  - `PA_P5Disclosure`: Disclosure review & masked registration credential UI
  - `PA_P5Queue`: Missing disclosure correction queue (view / return / approve)
  - `PA_P5Fare`: Public fare version management (draft / filed / active / retired + preview)
  - `PA_P5Records`: 2-year operational trip records retention (100% coverage reporting & export)
- **Canonical Design Canvas HTML:** `docs/05-ui/drts-design-canvas/Platform Admin.html`
- **Design System Tokens:** `@drts/ui-tokens` — Indigo realm (`indigo` theme tokens: primary `#4338CA`, surface `#EEF2FF`, accent `#6366F1`)
- **Product & Service Contracts:**
  - `phase1_prd_detailed_v1.md` (P-5 regulatory compliance & passenger disclosure requirements)
  - `phase1_service_contracts_v1.md` (Multi-taxi regulatory registry & disclosure profiles)
  - `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/source_specs/` (Canonical source specs)

---

## 3. Dependency Map

### Formal Upstream Dependencies

| Dep ID | Title | Owner | Reviewer | Status (truth) | What this slice provides to P5-UI-ADMIN-001 |
| --- | --- | --- | --- | --- | --- |
| `P5-SUP-DRV-001` | P-5 W1 disclosure data-authority service | Codex | Gemini | `done` (commit `cb6f46f61738`) | Provides backend service layer for supply submission disclosure capture (`doorCount`, `color`), `brand -> make` profile upsert in transaction, driver public credential projection with server-side masking (`北市計字第12***67號`), and `multi_taxi_direct` reservation-only guards. |
| `P5S3-FOUND-001` | P-5/S-3 database migration & foundational schema | Codex | Gemini | `done` | Provides DB tables (`vehicle_passenger_disclosure_profiles`, `driver_public_registration_credentials`, `fare_versions`, `regulatory_audit_logs`) and backend RPCs. |

### Non-formal / Spec-Relevant Upstream Context

| Task ID | Status | Significance to P5-UI-ADMIN-001 |
| --- | --- | --- |
| `BE-APR-001` | `done` | Establishes the baseline driver & vehicle approval workflows. P5 disclosure review builds on top of this audit baseline without bypassing regulatory checks. |
| `P5S3-CANVAS` | `done` | Merged canonical design canvas components (`platform-p5.jsx`, `p5-screens.jsx`). |

### Formal & Surface Downstream Dependents

| Task ID | Title | Status | Owner | Reviewer | Impact of P5-UI-ADMIN-001 |
| --- | --- | --- | --- | --- | --- |
| `P5-UI-PASSENGER-001` | P-5 passenger disclosure/fare preview UI | `review` | Codex | Claude | Displays the passenger-facing view of driver credentials (`北市計字第12***67號`) and vehicle attributes. Back-office approval state directly determines which drivers/vehicles pass regulatory dispatch validation (fail-closed if unapproved or expired). |

---

## 4. Acceptance Checklist

The following concrete checklist translates the parent task's acceptance criteria and design canvas (`platform-p5.jsx`) into verifiable checks for parent owner (`Codex`) and reviewer (`Claude`):

### Section A: Disclosure Review & Masked Registration (`[REQUIRED]`)

- [ ] **Vehicle Disclosure Fields:** Admin UI displays and allows editing/reviewing vehicle disclosure fields:
  - 廠牌 (Brand) & 車款 (Make / Model) — `brand` is mapped to `make` in backend transaction without inventing default fallbacks.
  - 出廠年份 (Manufacture Year, e.g. `2024`).
  - 車門數 (Door Count, 3–6, e.g. `4`).
  - 車身顏色 (Vehicle Color, required for Taipei plans, e.g. `珍珠白`).
- [ ] **Driver Registration Credential Masking:**
  - Driver registration certificate numbers are displayed with server-side masking ONLY (e.g. `北市計字第12***67號`).
  - Full registration number is stored on backend only and NEVER exposed to passenger APIs or frontend audit logs.
  - Certificate validity region (e.g. `臺北市`), expiration date (e.g. `2027/12/31`), and approval status (`verified_active`) are clearly displayed.
  - Driver registration status is verified via manual review + expiration check, and NEVER auto-populated from existing driver license flags.
- [ ] **Passenger Display Preview:** Includes live passenger-facing preview component matching `PA_P5Disclosure` (displaying vehicle make/model, year, door count, color, plate number `BKR-2208`, driver name, masked registration badge, rating).

### Section B: Disclosure Correction Queue (`[REQUIRED]`)

- [ ] **Correction Queue Surface:** Implements `PA_P5Queue` table matching `platform-p5.jsx`:
  - Columns: 車行 (Fleet), 車牌 / 駕駛 (Subject), 缺漏欄位 (Missing Fields), 目前狀態 (Status: `待補正` / `審核中` / `已退件` / `已核准`), 送審日期 (Submitted Date), 最後更新 (Updated Date), Actions.
- [ ] **Queue Action Flow:** Supports three explicit actions per item:
  - `查看` (View details).
  - `退件補正` (Return for correction — routes incomplete items back to fleet portal without fake default values).
  - `核准` (Approve — writes vehicle disclosure and canonical vehicle profiles in a single database transaction).
- [ ] **No Fake Defaults:** Incomplete or missing fields (`doorCount`, `color`) must NOT be filled with fake default values (e.g., auto-filling 4 doors or yellow color); missing fields trigger `待補正` queue entry.

### Section C: Public Fare Version Management (`[REQUIRED]`)

- [ ] **Fare Version State Machine:** Implements `PA_P5Fare` table with strict version lifecycle:
  - Version statuses: `草稿` (Draft), `已備查` (Filed), `已生效` (Active), `已停用` (Retired).
  - Attributes: Version ID (e.g. `F-2026-03`), Version Name (e.g. `現行計費表`), Effective Date (`from`), Regulatory Reference Number (`ref`, e.g. `北市交運字第1130042號`).
- [ ] **Version Activation Rules:**
  - Active version (`已生效`) is the ONLY version used for active order fare calculations.
  - Future filed versions (`已備查`, e.g. effective date in the future) CANNOT be activated ahead of time.
  - Schedule activation (`排程生效`) action is available for filed versions (`已備查`).
  - Version state changes (creation, activation, retirement) generate mandatory regulatory audit log records (`regulatory_audit_logs`).
- [ ] **Public Fare Preview Page (`/fares`):**
  - Displays public breakdown of active fare structure: Base fare (起程運價, e.g. 1.25km NT$85), distance increment (續程運價, e.g. per 200m NT$5), low-speed time increment (延滯計時, e.g. per 80s NT$5), and night surge (+20%, 23:00–06:00).

### Section D: Trip Operation Records Retention (`[REQUIRED]`)

- [ ] **Operational Records Table:** Implements `PA_P5Records` table matching `platform-p5.jsx`:
  - Columns: 訂單 (Order ID), 車牌 (Plate), 預約時間 (Reserved), 上車時間 (Pickup), 下車時間 (Dropoff), 車資 (Fare), 保存至 (Retain Until).
- [ ] **2-Year (730 Days) Retention Policy:**
  - Compliance coverage indicator explicitly shows 100% retention coverage (`覆蓋率 100%`).
  - Records include route trajectory summaries, payable/collected fare, toll fees, and applied fare version snapshot.
  - Export functionality (`匯出`) available for audit compliance.

### Section E: Access Control & RBAC (`[REQUIRED]`)

- [ ] **RBAC Protection:** All back-office disclosure and fare management endpoints are RBAC-gated.
- [ ] Read and write access to regulatory tables (`reg.*`, `regulatory_registry`, `fare_versions`) requires Platform Admin compliance privileges (`platform_admin` / `regulatory_reviewer`).

### Section F: Design System Tokens & i18n (`[REQUIRED]`)

- [ ] **Indigo Realm Tokens:** Visual styling strictly uses `@drts/ui-tokens` Indigo realm palette (`#4338CA`, `#EEF2FF`, `#6366F1`, etc.).
  - No hardcoded generic hex colors (e.g. raw `#0000ff` or un-themed tailwind defaults).
  - No 套皮 (reskinning with non-indigo canvas or default shadcn colors).
- [ ] **Translation Parity (`t()`):** All UI strings in back-office components use `t()` translation helpers with complete parity between English (`en`) and Traditional Chinese (`zh`) in `translations.ts`.

### Section G: Verification Command & Commit Evidence (`[REQUIRED]`)

- [ ] **Automated Typecheck & Lint:**
  - Run typecheck: `pnpm --filter @drts/platform-admin-web typecheck` (or repository root typecheck script).
  - Lint clean: `pnpm lint` returns zero errors.
- [ ] **Canonical Implementation Commit Trailers (for parent task `P5-UI-ADMIN-001`):**
  - Local git commit subject must include `P5-UI-ADMIN-001`.
  - Commit message must contain required trailers:
    ```
    LLM-Agent: Codex
    Task-ID: P5-UI-ADMIN-001
    Reviewer: Claude
    ```
  - Pushed to remote branch with `COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, and `PUSH_BRANCH` recorded in `ai-status.json`.
  - `INTEGRATION_STATUS` updated appropriately (`branch_pushed`, `pr_open`, `merged_to_dev`, etc.).

---

## 5. Reviewer Evidence Anchors

Reviewers (`Claude` for parent task, `Codex` for sidecar task) should audit the following code locations:

- **Back-Office Disclosure Component:** `apps/platform-admin-web/app/` or `packages/ui-web/src/` disclosure review components.
- **Correction Queue Component:** Queue table, filter pills, and action handlers (`view`, `return`, `approve`).
- **Fare Management Component:** Public fare version table, status badges, activation scheduler, and preview panel (`/fares`).
- **Design Canvas Matching:** Compare rendered components against `docs/05-ui/drts-design-canvas/platform-p5.jsx` (`PA_P5Disclosure`, `PA_P5Queue`, `PA_P5Fare`, `PA_P5Records`).
- **Token System Integrity:** Verify import of `@drts/ui-tokens` Indigo realm tokens in component styles.
- **i18n Parity:** Check `apps/platform-admin-web/lib/translations.ts` or corresponding translation dict for matching `en` and `zh` keys.

---

## 6. Sidecar Acceptance Checklist

Self-verification for this sidecar artifact:

- [x] Create support artifacts only (`support/sidecars/P5-UI-ADMIN-001/P5-UI-ADMIN-001-SIDECAR-ACCEPTANCE.md`).
- [x] Do not edit canonical product truth or primary app runtime code.
- [x] Align dependency map with current machine truth (`P5-SUP-DRV-001` status `done`, commit `cb6f46f61738`).
- [x] Translate design canvas (`platform-p5.jsx`) into explicit acceptance requirements.
- [ ] Hand off the packet to assigned reviewer (`Codex`) via `scripts/ai-status.sh handoff`.

---

## 7. Reviewer Handoff Commands

### Sidecar Approval Command (for `Codex`)

```bash
AI_NAME=Codex ./scripts/ai-status.sh approve P5-UI-ADMIN-001-SIDECAR-ACCEPTANCE \
  "Acceptance packet verified and aligned with current machine truth: parent P5-UI-ADMIN-001 is status=review with owner=Codex reviewer=Claude; upstream P5-SUP-DRV-001 is done (commit cb6f46f61738); platform-p5.jsx specs (PA_P5Disclosure, PA_P5Queue, PA_P5Fare, PA_P5Records) translated into concrete acceptance gates; Indigo realm tokens and i18n parity pinned."
```

### Sidecar Reopen Command (if revision is required)

```bash
AI_NAME=Codex ./scripts/ai-status.sh reopen P5-UI-ADMIN-001-SIDECAR-ACCEPTANCE \
  "Packet needs revision: [specify machine-truth drift, missing acceptance gate, or template deviation]."
```

---

## 8. Closeout Note

This sidecar artifact is support-only (`task_class=sidecar`, `mutates_canonical=false`). Per `AI_COLLABORATION_GUIDE.md` §5, sidecar closeout allows `NO_COMMIT_REQUIRED=1` at final `done` state.

Parent task `P5-UI-ADMIN-001` is a canonical implementation task; when finalizing `P5-UI-ADMIN-001`, the parent owner MUST provide `COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, `PUSH_BRANCH`, and `INTEGRATION_STATUS` in `ai-status.json`.
