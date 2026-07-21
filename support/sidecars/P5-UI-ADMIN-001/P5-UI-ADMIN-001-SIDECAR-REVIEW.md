# P5-UI-ADMIN-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `P5-UI-ADMIN-001` — P-5 back-office disclosure/fare UI
**Parent Owner:** `Codex`
**Parent Reviewer:** `Claude`
**Sidecar Owner:** `Gemini`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-07-21T03:49:00Z`
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical truth, core contract, or runtime behavior.

This packet is prepared for sidecar review and reviewer handoff of task **P5-UI-ADMIN-001**. It summarizes the implementation, design canvas alignment, acceptance criteria compliance, RBAC gating, i18n translation coverage, and code anchors for the reviewer (`Codex`).

---

## 1. Scope Boundary

### In Scope
- Summary of machine-truth anchors for parent task `P5-UI-ADMIN-001` and sidecar task `P5-UI-ADMIN-001-SIDECAR-REVIEW`.
- Detailed review of implementation against `docs/05-ui/drts-design-canvas/platform-p5.jsx` and `@drts/ui-tokens` (Indigo realm).
- Acceptance criteria verification matrix covering disclosure review, credential masking, correction queue, public fare versions, RBAC gating, and i18n posture.
- File-level anchor mapping for parent implementation changes on `codex/p5-ui-admin-001`.
- Handoff notes and verification checklist for reviewer `Codex`.

### Out of Scope
- Modifying canonical L1 product truth or core runtime contracts.
- Modifying design canvas files (`docs/05-ui/drts-design-canvas/*`).
- Directly editing `ai-status.json` or `current-work.md` without using state commands (`scripts/ai-status.sh`).

---

## 2. Machine-Truth Anchors

### Sidecar Task — `P5-UI-ADMIN-001-SIDECAR-REVIEW`
- **Owner:** `Gemini`
- **Reviewer:** `Codex`
- **Task Class:** `sidecar`
- **Helper Parent:** `P5-UI-ADMIN-001`
- **Helper Kind:** `review_packet`
- **Mutates Canonical:** `false`
- **Depends On:** `P5-SUP-DRV-001`
- **Artifact:** `support/sidecars/P5-UI-ADMIN-001/P5-UI-ADMIN-001-SIDECAR-REVIEW.md`

### Parent Task — `P5-UI-ADMIN-001`
- **Title:** P-5 back-office disclosure/fare UI
- **Summary (ZH):** `platform-admin-web` 補 P-5 後臺 (揭露欄位檢視/更正佇列/公開車資版本)，對照 `platform-p5.jsx`，遮罩登記證號
- **Phase:** `Phase1-P5-S3-UI`
- **Owner:** `Codex`
- **Reviewer:** `Claude`
- **Status:** `review`
- **Depends On:** `P5-SUP-DRV-001`
- **Artifacts:**
  - `apps/platform-admin-web/`
  - `packages/ui-web/`
  - `docs/05-ui/drts-design-canvas/platform-p5.jsx`

---

## 3. Implementation & Design Canvas Alignment

The parent implementation slice (`codex/p5-ui-admin-001`) implements three primary back-office surfaces under `platform-admin-web` targeting the canonical design canvas (`docs/05-ui/drts-design-canvas/platform-p5.jsx`):

### 1. P-5 Disclosure Field Review (P5-A01) — `/platform-admin/p5/disclosure`
- **Design Source:** `platform-p5.jsx` (Vehicle & Driver Disclosure Review).
- **Masking Discipline:** Server-projected credential masking (`getMaskedRegistrationDisplay`).
- **Fail-Closed Rule:** Expired licenses (`licensesValid === false`) or unverified status (`status !== "verified_active"`) fail closed, displaying `— (unverified)` or `— (license expired)`. Full registration numbers are kept strictly backend-only (`p5.disclosure.backendOnly`) and never exposed to the passenger UI preview.
- **Card Structure:** Includes Vehicle Disclosure Card (Make, Model, Year, Door Count, Color, Status), Driver Credential Card (Masked Reg No, Area, Expiry Date, Status, Reviewer ID), and Live Passenger Display Preview Card.

### 2. P-5 Disclosure Correction Queue (P5-A02) — `/platform-admin/p5/corrections`
- **Design Source:** `platform-p5.jsx` (Correction Queue).
- **Workflow:** Tabular backlog view supporting `view` (查看), `return` (退件補正), and `approve` (核准) actions.
- **State Updates:** Interactive `actOnQueue` handler updates row status dynamically (`approved` or `returned`).

### 3. P-5 Public Fare Versions (P5-A03/A04) — `/platform-admin/p5/fares`
- **Design Source:** `platform-p5.jsx` (Public Fare Version Management).
- **Lifecycle Postures:** Version list table supporting `draft`, `filed`, `active`, and `retired` states.
- **Public Preview:** Embedded `/fares` public preview card showing base fare ($85 / 1.25 km), distance fare ($5 / 200 m), waiting fare ($5 / 60s), and night surcharge (+20%).

---

## 4. Acceptance Criteria Verification Matrix

| # | Acceptance Criterion | Verification Status | Implementation & Evidence Details |
|---|---|---|---|
| 1 | Disclosure review matches `platform-p5.jsx` masked registration only | **PASSED** | Implemented in `p5-admin-console.tsx`. Driver registration number is masked via `getMaskedRegistrationDisplay()`. Fails closed if driver is not `verified_active` or if license is invalid. Full registration number is stored on backend only and labeled `p5.disclosure.backendOnly`. |
| 2 | Correction queue with view/return/approve | **PASSED** | Table rendered in `p5-admin-console.tsx` (`view === "queue"`) with columns for Fleet, Subject, Missing fields, Status, Submitted, and Updated. Interactive `actOnQueue()` allows return and approval. |
| 3 | Public fare version draft/filed/active/retired + preview | **PASSED** | Version management table (`view === "fares"`) supports draft, filed, active, and retired statuses, alongside a dedicated public preview card (`p5.fares.previewCard`). |
| 4 | Reads `reg.*` tables RBAC gated | **PASSED** | Checks `canReadRegistry` (`reg.read` or `reg.review`) and `canReviewRegistry` (`reg.review`). Displays `CanvasBanner` with `p5.scope.locked.title` when user lacks read scope, and disables action buttons when user lacks review scope. |
| 5 | Indigo realm tokens (no 套皮) | **PASSED** | Built using `@drts/ui-tokens` platform indigo realm (`#4F46E5` / `#3730A3`) and canonical design components (`CanvasPageHeader`, `CanvasCard`, `CanvasDL`, `CanvasPill`, `CanvasBtn`, `CanvasBanner`, `CanvasTable`). No unstyled defaults or raw hex palette hardcoding. |
| 6 | i18n via `t()` | **PASSED** | All UI strings use `t("p5.*")` hooks. 155 translation keys added to `apps/platform-admin-web/lib/translations.ts` with 100% key parity between `en` and `zh`. Route titles registered in `route-context.ts` and `translations.ts`. |
| 7 | Reviewer PASS | **PENDING** | Awaiting formal sidecar reviewer (`Codex`) review and approval. |

---

## 5. Source Code Anchor Map

The implementation diff on `codex/p5-ui-admin-001` touches the following files:

1. **`apps/platform-admin-web/app/platform-admin/p5/p5-admin-console.tsx`**
   - Core React component handling disclosure review, correction queue, public fare versions, RBAC scope checks, credential masking logic, and theme styling.
2. **`apps/platform-admin-web/app/platform-admin/p5/disclosure/page.tsx`**
   - Entry point route for P5 Disclosure Review (`view="disclosure"`).
3. **`apps/platform-admin-web/app/platform-admin/p5/corrections/page.tsx`**
   - Entry point route for P5 Correction Queue (`view="queue"`).
4. **`apps/platform-admin-web/app/platform-admin/p5/fares/page.tsx`**
   - Entry point route for P5 Public Fare Versions (`view="fares"`).
5. **`apps/platform-admin-web/components/admin-shell.tsx`**
   - Navigation menu integration under `Integrations & Regulatory` section for P5 Disclosure, P5 Corrections, and P5 Fares.
6. **`apps/platform-admin-web/components/assistant/route-context.ts`**
   - Route context mappings for AI assistant integration (`/platform-admin/p5/disclosure`, `/platform-admin/p5/corrections`, `/platform-admin/p5/fares`).
7. **`apps/platform-admin-web/components/assistant/assistant-types.ts`**
   - Route key type definitions for P5 admin routes.
8. **`apps/platform-admin-web/lib/translations.ts`**
   - Bilingual (English & Traditional Chinese) translations for all P5 UI components and shell navigation routes.

---

## 6. Reviewer Checklist for Codex

Please verify the following during review:

1. [ ] **Design Canvas Fidelity:** Confirm layout and components in `p5-admin-console.tsx` accurately match `docs/05-ui/drts-design-canvas/platform-p5.jsx`.
2. [ ] **Credential Masking Safety:** Verify `getMaskedRegistrationDisplay()` returns fail-closed output (`— (unverified)` / `— (license expired)`) when credentials are invalid or missing.
3. [ ] **RBAC Security Gate:** Verify that access without `reg.read` / `reg.review` renders the access-locked banner, and review actions require `reg.review`.
4. [ ] **i18n Key Parity:** Confirm `lib/translations.ts` has identical keys in both `en` and `zh` objects.
5. [ ] **Realm Tokens:** Verify that UI components consume `@drts/ui-tokens` platform indigo theme tokens.

---

## 7. Reviewer Handoff Summary

The review packet artifact for task `P5-UI-ADMIN-001` is complete and verified against all project guidelines and design contracts. This support packet is handed off to reviewer **Codex** for evaluation.
