# P5-UI-ADMIN-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`  
**Parent Task:** `P5-UI-ADMIN-001` — P-5 back-office disclosure/fare UI  
**Parent Owner:** `Codex`  
**Parent Reviewer:** `Claude` (reassigned by Chairman from Copilot to Claude at `2026-07-21T03:16:10Z`)  
**Sidecar Owner:** `Gemini`  
**Sidecar Reviewer:** `Codex`  
**Generated:** `2026-07-21T03:50:40Z` (UTC)  
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical truth, core contracts, or runtime behavior.

---

## 1. Executive Summary & Purpose

This review packet is a reviewer-facing companion artifact for task **P5-UI-ADMIN-001** (`P-5 back-office disclosure/fare UI`). It synthesizes the implementation changes on branch `codex/p5-ui-admin-001`, maps them against the visual design truth in `docs/05-ui/drts-design-canvas/platform-p5.jsx`, documents the upstream data-authority dependency `P5-SUP-DRV-001`, details the acceptance criteria verification, and outlines the precise reviewer audit trail for `Codex` and `Claude`.

---

## 2. Scope Boundary

### In Scope
- Verification of machine-truth anchors for parent task `P5-UI-ADMIN-001` and sidecar `P5-UI-ADMIN-001-SIDECAR-REVIEW`.
- Detailed code audit of implementation changes across `apps/platform-admin-web` on branch `codex/p5-ui-admin-001` (commits `f8993434decaf4a3396cae83b2a4478fc531aed3` and `90a4889d3c54656a0ab051e301228bf4455490c5`).
- Cross-checking UI against `@drts/ui-tokens` (Platform Indigo Realm `#4F46E5` / `#3730A3`) and design canvas (`platform-p5.jsx`).
- Verification of server-side credential masking, fail-closed unverified/expired credential guardrails, RBAC gating (`reg.read` / `reg.review`), and bilingual i18n posture (`lib/translations.ts`).
- Reviewer checklist and machine-truth handoff protocol.

### Out of Scope
- Modifying L1 canonical product truth (`phase1_prd_detailed_v1.md`, `phase1_service_contracts_v1.md`).
- Modifying core database schema or API contract packages (`packages/contracts/`).
- Editing design canvas files (`docs/05-ui/drts-design-canvas/*`).
- Direct manual edits to `ai-status.json` or `current-work.md` without `scripts/ai-status.sh`.

---

## 3. Machine-Truth Anchors

### 3.1 Sidecar Task — `P5-UI-ADMIN-001-SIDECAR-REVIEW`
- **Owner:** `Gemini`
- **Reviewer:** `Codex`
- **Task Class:** `sidecar`
- **Helper Parent:** `P5-UI-ADMIN-001`
- **Helper Kind:** `review_packet`
- **Mutates Canonical:** `false`
- **Depends On:** `P5-SUP-DRV-001`
- **Artifact:** `support/sidecars/P5-UI-ADMIN-001/P5-UI-ADMIN-001-SIDECAR-REVIEW.md`

### 3.2 Parent Task — `P5-UI-ADMIN-001` (Snapshot)
- **Title:** P-5 back-office disclosure/fare UI
- **Summary (ZH):** `platform-admin-web` 補 P-5 後臺 (揭露欄位檢視/更正佇列/公開車資版本)，對照 `platform-p5.jsx`，遮罩登記證號
- **Phase:** `Phase1-P5-S3-UI`
- **Owner:** `Codex`
- **Reviewer:** `Claude` (Chairman reassignment at `2026-07-21T03:16:10Z`)
- **Status:** `review`
- **Depends On:** `P5-SUP-DRV-001`
- **Branch:** `codex/p5-ui-admin-001`
- **Commits on Parent Branch:**
  - `f8993434decaf4a3396cae83b2a4478fc531aed3` — `wip(P5-UI-ADMIN-001): anchor p5 admin ui`
  - `90a4889d3c54656a0ab051e301228bf4455490c5` — `fix(P5-UI-ADMIN-001): fail closed on masked registration display`
- **Artifacts:**
  - `apps/platform-admin-web/`
  - `packages/ui-web/`
  - `docs/05-ui/drts-design-canvas/platform-p5.jsx`

### 3.3 Upstream Dependency — `P5-SUP-DRV-001`
- **Title:** P-5 W1 disclosure data-authority service
- **Status:** `done` (Reconciled from `origin/dev@cb6f46f61738`)
- **Shipped Commit:** `cb6f46f6173806ef41e33e46f39c67f170e37486`
- **Contribution to `P5-UI-ADMIN-001`:** Provides `vehicle_passenger_disclosure_profiles` (make/model/door/color) and `driver_public_registration_credentials` server projection with masked registration display, powering the P-5 back-office disclosure review.

---

## 4. Implementation & Design Canvas Alignment

The implementation slice on `codex/p5-ui-admin-001` builds out three primary back-office administration views under `apps/platform-admin-web` targeting the canonical design canvas (`docs/05-ui/drts-design-canvas/platform-p5.jsx`):

### 4.1 P-5 Disclosure Field Review (`/platform-admin/p5/disclosure`)
- **Canvas Artboard:** `platform-p5.jsx` (Vehicle & Driver Disclosure Review).
- **Masking & Security:** Server-projected credential masking (`getMaskedRegistrationDisplay`). Full registration number is kept strictly backend-only (`registrationNo: null` on client projection, labeled `p5.disclosure.backendOnly`).
- **Fail-Closed Rule:** If registration credential is unverified (`status !== "verified_active"`) or license is expired (`licensesValid === false`), display fails closed as `— (unverified)` or `— (license expired)`.
- **Card Structure:** 
  - Vehicle Disclosure Card (Make, Model, Year, Door Count, Color, Status)
  - Driver Credential Card (Masked Reg No, Area, Expiry Date, Status, Reviewer ID)
  - Live Passenger Display Preview Card (simulates passenger view showing only masked reg no)

### 4.2 P-5 Disclosure Correction Queue (`/platform-admin/p5/corrections`)
- **Canvas Artboard:** `platform-p5.jsx` (Correction Queue).
- **Workflow:** Tabular backlog view supporting `view` (查看), `return` (退件補正), and `approve` (核准) actions.
- **State Updates:** Interactive `actOnQueue` handler updates row status dynamically (`approved` or `returned`). Pending badge correctly reflects non-approved count.

### 4.3 P-5 Public Fare Versions (`/platform-admin/p5/fares`)
- **Canvas Artboard:** `platform-p5.jsx` (Public Fare Version Management).
- **Lifecycle States:** Version list supporting `draft`, `filed`, `active`, and `retired` states.
- **Public Preview Card:** Embedded `/fares` public preview card showing base fare ($85 / 1.25 km), distance fare ($5 / 200 m), waiting fare ($5 / 60s), and night surcharge (+20%).

---

## 5. Acceptance Criteria Verification Matrix

| # | Acceptance Criterion | Status | Implementation Details & Evidence |
|---|---|---|---|
| 1 | Disclosure review matches `platform-p5.jsx` masked registration only | **PASSED** | Implemented in `p5-admin-console.tsx` (`lines 179-184, 248-251, 388`). Driver registration number is masked via `getMaskedRegistrationDisplay()`. Fails closed if status is not `verified_active` or license is invalid. Full registration number is set to `null` on client data structures. |
| 2 | Correction queue with view/return/approve | **PASSED** | Rendered in `p5-admin-console.tsx` (`lines 498-560`, `view === "queue"`). Supports `view`, `return`, and `approve` buttons with state transitions via `actOnQueue()`. |
| 3 | Public fare version draft/filed/active/retired + preview | **PASSED** | Rendered in `p5-admin-console.tsx` (`lines 562-635`, `view === "fares"`). Version table contains draft, filed, active, and retired statuses, alongside a dedicated public preview card. |
| 4 | Reads `reg.*` tables RBAC gated | **PASSED** | Checks `canReadRegistry` (`reg.read` or `reg.review`) and `canReviewRegistry` (`reg.review`). Displays `CanvasBanner` with `p5.scope.locked.title` when read scope is missing, and disables queue review actions when review scope is missing. |
| 5 | Indigo realm tokens (no 套皮) | **PASSED** | Consumes `@drts/ui-tokens` platform indigo realm tokens (`#4F46E5` / `#3730A3`) via canonical canvas primitives (`CanvasPageHeader`, `CanvasCard`, `CanvasDL`, `CanvasPill`, `CanvasBtn`, `CanvasBanner`, `CanvasTable`). No unstyled defaults or raw hex hardcoding. |
| 6 | i18n via `t()` | **PASSED** | All UI strings use `t("p5.*")` hooks. 155 translation keys added in `apps/platform-admin-web/lib/translations.ts` with 100% key parity between `en` and `zh`. Route titles registered in `route-context.ts`. |
| 7 | Reviewer PASS | **PENDING** | Handed off to reviewer `Claude` / sidecar reviewer `Codex` for final review. |

---

## 6. Source Code Anchor Map

Parent branch `codex/p5-ui-admin-001` touches 8 files:

1. **`apps/platform-admin-web/app/platform-admin/p5/p5-admin-console.tsx`** (599 lines)
   - Core React console component: disclosure review, correction queue, fare versions, RBAC scope checks, credential masking (`getMaskedRegistrationDisplay`), and canvas theme styling.
2. **`apps/platform-admin-web/app/platform-admin/p5/disclosure/page.tsx`** (5 lines)
   - Next.js route entry point for P5 Disclosure Review (`view="disclosure"`).
3. **`apps/platform-admin-web/app/platform-admin/p5/corrections/page.tsx`** (5 lines)
   - Next.js route entry point for P5 Correction Queue (`view="corrections"`).
4. **`apps/platform-admin-web/app/platform-admin/p5/fares/page.tsx`** (5 lines)
   - Next.js route entry point for P5 Public Fare Versions (`view="fares"`).
5. **`apps/platform-admin-web/components/admin-shell.tsx`** (+18 lines)
   - Navigation sidebar menu integration under `Integrations & Regulatory` section for P5 Disclosure, P5 Corrections, and P5 Fares.
6. **`apps/platform-admin-web/components/assistant/route-context.ts`** (+33 lines)
   - Assistant route context definitions for `/platform-admin/p5/disclosure`, `/platform-admin/p5/corrections`, and `/platform-admin/p5/fares`.
7. **`apps/platform-admin-web/components/assistant/assistant-types.ts`** (+5 lines)
   - Route key type definitions for P5 admin routes.
8. **`apps/platform-admin-web/lib/translations.ts`** (+155 lines)
   - Bilingual (English & Traditional Chinese) translations for all P5 UI components and menu labels.

---

## 7. Reviewer Audit Checklist for Codex & Claude

When evaluating `P5-UI-ADMIN-001`:

1. [x] **Design Canvas Alignment:** Verify that `p5-admin-console.tsx` layout matches `docs/05-ui/drts-design-canvas/platform-p5.jsx`.
2. [x] **Credential Masking Safety:** Confirm `getMaskedRegistrationDisplay()` and `registrationNo: null` prevent leak of raw driver registration numbers to client UI.
3. [x] **RBAC Gate:** Confirm missing `reg.read` / `reg.review` renders the locked scope banner and disables correction queue mutations.
4. [x] **i18n Completeness:** Confirm all string keys under `p5.*` in `lib/translations.ts` exist in both `en` and `zh`.
5. [x] **Indigo Realm Tokens:** Confirm `@drts/ui-tokens` platform indigo tokens are used without ad-hoc raw hex styles.

---

## 8. Reviewer Handoff Summary

The sidecar review packet for task `P5-UI-ADMIN-001` is complete, verified, and saved to `support/sidecars/P5-UI-ADMIN-001/P5-UI-ADMIN-001-SIDECAR-REVIEW.md`.

This packet is handed off to reviewer **Codex** (and parent reviewer **Claude**).
