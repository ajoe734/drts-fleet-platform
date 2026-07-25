# Sidecar Review Packet: S3-FIX-DRIVER-SOS-VOCAB-001

## 1. Overview & Handoff Summary

- **Task ID**: `S3-FIX-DRIVER-SOS-VOCAB-001`
- **Sidecar Task ID**: `S3-FIX-DRIVER-SOS-VOCAB-001-SIDECAR-REVIEW`
- **Helper Kind**: `review_packet`
- **Owner**: `Gemini`
- **Assigned Reviewer**: `Claude2`
- **Canonical Parent**: `S3-FIX-DRIVER-SOS-VOCAB-001`
- **Target Branch**: `gemini/s3-fix-driver-sos-vocab-001-sidecar-review`
- **Implementation Commit**: `806ea61ce` (`S3-FIX-DRIVER-SOS-VOCAB-001: gate driver SOS order-context card on runtime profile`)

---

## 2. Background & Defect Description

In `S3-VERIFY-001`, verification identified that the **Driver SOS Screen (`apps/driver-app/app/sos.tsx`)** rendered forbidden multi-platform vocabulary in the 「當前訂單情境」 (Current Order Context) card without any runtime-profile gating. Specifically:
1. Rendered terms forbidden by `source_specs/02_ui_visual_design_team_brief_20260720.md` §1.3 (`forwarded order`, `mirror order`, `native status`).
2. Allowed `multi_taxi_direct` drivers (whose `forbiddenCapabilities` contract includes `forwarded_order_ui`) to see cross-platform vocabulary and identifiers.
3. `pickSosTaskContext` actively preferred cross-platform tasks as the safety context even when `orderDomains: ["owned"]` was required.

---

## 3. Design Decision & Architecture Alignment

The task required an S-3 design decision: **realm-conditional card vs relabel**.

### Selected Option: Realm-Conditional Card
- **Canvas Alignment**: `docs/05-ui/drts-design-canvas/driver-sos.jsx` (`SosCtx`) specifies only owned-domain fields (行程編號 / 車牌 / 駕駛 / 目前位置 / 原始觸發時間) and explicitly notes 「禁止多平台/外部詞彙。」
- **Spec Constraint**: `source_specs/02_ui_visual_design_team_brief_20260720.md` §1.3 L80 mandates that elements must be **absent from the component tree** (not hidden via CSS or runtime display toggles).
- **Non-Cosmetic Rule**: A simple cosmetic relabelling would still expose cross-platform data (`MIRROR-9001`, `EXT-77421`) to `multi_taxi_direct` drivers, violating the acceptance criterion *"a cosmetic rename alone is not accepted as closure"*.

---

## 4. Implementation Details

1. **Runtime Profile Capability Gate (`apps/driver-app/lib/driver-runtime-profile.ts`)**:
   - Imports `MULTI_TAXI_FORBIDDEN_CAPABILITIES` directly from `@drts/contracts`.
   - Resolves synchronously so emergency offline SOS calls are never delayed by network resolution.
   - Fails closed to `multi_taxi_direct` if the runtime profile env (`EXPO_PUBLIC_DRTS_RUNTIME_PROFILE`) is missing or invalid.

2. **Gated SOS Context Component (`apps/driver-app/app/sos.tsx`)**:
   - `SosTaskContext` groups cross-platform fields into an optional `crossPlatform` object.
   - When `forwarded_order_ui` is forbidden, `crossPlatform` is `null`, omitting those components entirely from the JSX tree.
   - `pickSosTaskContext` filters task selection to `owned` domain tasks under restricted profiles.
   - Removed all §1.3 term literals from `sos.tsx`.

3. **Unit Tests (`apps/driver-app/tests/unit/sos-screen-runtime-profile-gate.test.ts`)**:
   - Renders actual screen components against `UnifiedDriverTaskView` test fixtures.
   - Asserts absence of cross-platform nodes in the component tree.
   - Includes mutation coverage (forcing gate off fails 5 of 6 tests).

4. **Vocabulary Scanner (`support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs`)**:
   - Audits 56 S-3, P-5, and driver/passenger UI files for §1.3 forbidden terms.

---

## 5. Verification Matrix & Acceptance Status

| Acceptance Criterion | Verification Method / Command | Result | Status |
| --- | --- | --- | --- |
| **S-3 Design Decision Recorded** | Inspect `support/sidecars/S3-FIX-DRIVER-SOS-VOCAB-001/DESIGN-DECISION.md` | Decision documented: realm-conditional card | PASS |
| **`sos.tsx` Runtime Profile Gate** | Unit test `sos-screen-runtime-profile-gate.test.ts` & AST check | Gated via `driver-runtime-profile.ts` | PASS |
| **Scan Forbidden Vocabulary Exits 0** | `node support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs` | **0 BLOCKING** findings (exits 0) | PASS |
| **No Cosmetic-Only Rename** | Verified structural JSX tree omission under restricted profile | Rows omitted from component tree | PASS |

---

## 6. Reviewer Checklist for `Claude2`

- [ ] Confirm `support/sidecars/S3-FIX-DRIVER-SOS-VOCAB-001/DESIGN-DECISION.md` rationale.
- [ ] Review `apps/driver-app/lib/driver-runtime-profile.ts` for fail-closed behavior.
- [ ] Review `apps/driver-app/app/sos.tsx` component tree conditional rendering.
- [ ] Execute `node support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs` to confirm zero blocking violations.
- [ ] Issue approval via `scripts/ai-status.sh approve S3-FIX-DRIVER-SOS-VOCAB-001-SIDECAR-REVIEW` upon completion.
