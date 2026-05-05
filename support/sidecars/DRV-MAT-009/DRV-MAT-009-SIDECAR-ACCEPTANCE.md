# DRV-MAT-009 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DRV-MAT-009` — Driver settings materialization
**Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Codex`
**Parent Owner / Reviewer (current snapshot):** `Codex` / `Codex2`
**Generated:** `2026-05-05` (UTC) · **Snapshot timestamp:** `2026-05-05T02:34Z`
**Snapshot Status:** Parent `DRV-MAT-009` is `in_progress` in `ai-status.json` (`last_update: 2026-05-05T02:30:29Z`). Parent's working tree contains uncommitted edits to `apps/driver-app/app/settings.tsx` and `apps/driver-app/components/platform-binding.tsx`, plus a new `apps/driver-app/lib/settings-form.ts` helper module and a sibling vitest file `tests/unit/driver-app-settings-form.test.ts`. No parent closeout commit yet; `commit_hash` / `push_*` fields are not present on the parent task. This sidecar is a support-only acceptance frame. It does not finalize the parent task and does not pre-sign any closeout evidence.

> **Provenance.** Repo HEAD at packet generation is `7fc93c3 DRV-MAT-004 unify trip workflow command center` on branch `codex/dev-deploy-backend-android`. The parent task references `evidence_refs[".orchestrator/evidence/claude2-20260505T020927Z-51e8b24e.json"]` from a Claude2 inspection round; this sidecar treats that evidence as upstream context, not as a substitute for parent reviewer approval.

---

## 1) Scope Boundary

This sidecar curates support-only artifacts for `DRV-MAT-009`:

- In scope: acceptance framing pinned to the in-flight working tree, dependency map, repo baseline, reviewer hotspot guidance, handoff wording, and downstream consumer notes.
- Out of scope: editing `apps/driver-app/app/settings.tsx`, `apps/driver-app/components/platform-binding.tsx`, `apps/driver-app/lib/settings-form.ts`, the new test under `tests/unit/`, the canonical contracts in `packages/contracts`, the API client in `packages/api-client`, the L1/L2 product truth, the design plan, or the execution packet. The sidecar does not commit, push, or claim parent verification on behalf of the parent owner.

---

## 2) Current State Baseline

Anchored on `git status` + working tree at `7fc93c3` and the canonical documents listed in §4.

### 2.1 Parent task machine state

- `ai-status.json` entry for `DRV-MAT-009`: `status=in_progress`, `owner=Codex`, `reviewer=Codex2`, `phase="Driver App Productization"`, `last_update=2026-05-05T02:30:29Z`, `next="Inspecting existing settings/platform binding changes, validating dirty/save/validation states, and preparing acceptance evidence."`
- `depends_on=["DRV-MAT-001","DRV-MAT-007"]`. Both dependencies are `done` in `ai-status.json` (DRV-MAT-001 commit `8662350`, DRV-MAT-007 commit `b7e14a4`).
- `acceptance` from machine truth (4 bullets): `sectioned form exists`, `save states clear`, `platform binding localized`, `typecheck passes`.
- `artifacts`: `apps/driver-app/app/settings.tsx`, `apps/driver-app/components/platform-binding.tsx`. The parent has not declared `apps/driver-app/lib/settings-form.ts` or `tests/unit/driver-app-settings-form.test.ts` as artifacts; both are present as untracked files in the working tree and look like parent-owner work in progress.

### 2.2 Working tree snapshot

`git status --short` at packet time:

```
 M apps/driver-app/app/settings.tsx
 M apps/driver-app/components/platform-binding.tsx
 M apps/driver-app/components/platform-status-card.tsx
?? apps/driver-app/lib/settings-form.ts
?? tests/unit/driver-app-settings-form.test.ts
```

`git diff --stat` for the parent's two declared artifacts plus the touched status card:

```
 apps/driver-app/app/settings.tsx                |  789 ++++++++++++---------
 apps/driver-app/components/platform-binding.tsx |  203 +++---
 apps/driver-app/components/platform-status-card.tsx |  10 +-
 3 files changed, 575 insertions(+), 427 deletions(-)
```

Observation: `apps/driver-app/components/platform-status-card.tsx` is touched but is the canonical `DRV-MAT-007` artifact, not declared on `DRV-MAT-009.artifacts`. Reviewer should confirm whether the small diff is benign localization/markup or whether it should be moved out of this slice or recorded explicitly under DRV-MAT-009 scope.

### 2.3 Sectioned settings form (`apps/driver-app/app/settings.tsx`)

- `settings.tsx:11-46` imports `DriverProfileRecord`, `DriverSettings` from `@drts/contracts`, `PlatformBinding` from `@/components/platform-binding`, the shared UI primitives (`AppScreen`, `PageHeader`, `ActionButton`, `BottomActionBar`, `EmptyState`, `ErrorBanner`, `FormField`, `StatusChip`, `Tokens`), the driver runtime helpers (`getDriverClient`, `getDriverId`, `isDriverIdentityProvisioned`), and the new local form helper module from `@/lib/settings-form`.
- Five `FormSection` blocks render at `settings.tsx:395-516`: `個人資料`, `緊急聯絡人`, `偏好設定`, `開關設定`, `平台帳號綁定`. The platform section consumes `<PlatformBinding showSectionTitle={false} />` so the outer `FormSection` title is the only sectional header.
- The page reuses `FormField` for text inputs (lines 399-484), the local `SwitchRow` (`settings.tsx:113-135`) wraps `react-native` `Switch` for the boolean toggles (`settings.tsx:491-508`), and the bottom save action is rendered through `BottomActionBar` + `ActionButton` (`settings.tsx:529-546`).
- Unprovisioned guard at `settings.tsx:139-140` reads `isDriverIdentityProvisioned()` once per render. The unprovisioned branch returns an `EmptyState` with the lock icon and an `actionTitle` routing to `/onboarding` (`settings.tsx:344-358`). Loading branch at `settings.tsx:360-369` shows `ActivityIndicator` + 載入文案. These match the design plan's required states list.

### 2.4 Save / dirty / validation state

- `settings-form.ts` defines `SettingsFormValues`, `ProfileFormValues`, `SaveState = "idle" | "dirty" | "saving" | "saved" | "error"`, plus `deriveSaveState({saving, dirty, hasValidation, lastResult})`.
- `settings.tsx:226-249` derives `settingsErrors`, `profileErrors`, `settingsDirty`, `profileDirty`, `dirty`, `hasValidation`, then calls `deriveSaveState` and feeds the result into `describeSaveStatus` (`settings.tsx:70-83`) which maps each state to a `StatusChip` label / variant pair (`儲存中…/info`, `尚有未儲存變更/warning`, `已儲存/success`, `儲存失敗/danger`, default `尚未變更/default`).
- `PageHeader.rightElement` (`settings.tsx:380-385`) renders the chip in the header.
- Validation-bar / save-error feedback uses `ErrorBanner` (`settings.tsx:389-393`) for three cases: load partial failure, validation failure, save partial/full failure.
- `handleSave` (`settings.tsx:271-342`) issues `client.updateDriverSettings(driverId, buildSettingsCommand(...))` and `client.updateDriverProfile(buildProfileCommand(...))` only for sections that are `dirty`, then collects results via `Promise.allSettled` to surface `儲存成功 / 部分儲存成功 / 儲存失敗` alerts and update `initialSettings` / `initialProfile` baselines for the sections that succeeded.
- Save button copy adapts to context (`settings.tsx:530-545`): `正在儲存…`, `請先修正欄位`, `儲存設定`, `目前無變更`. `disabled` reflects `!dirty || hasValidation || saving`.

### 2.5 Localization audit on touched surface

- Sweep of user-visible strings across the three modified files plus the new helper:
  - `settings.tsx`: section titles / descriptions, alert copy, save button, status chip labels, validation message, load-error format are all Traditional Chinese (e.g. `個人資料`, `平台帳號綁定`, `儲存設定`, `已使用可用資料。無法載入 …`). Only English fragments left are: `placeholder` examples (`+886-900-000-000`, `driver@example.com`, `zh-TW`), `accessibilityLabel` / prop keys, identifier strings, and code that lives outside runtime copy.
  - `platform-binding.tsx`: now imports `PLATFORM_CODE_REGISTRY` to resolve display names; alerts and labels use the display name instead of the raw code (e.g. `重新驗證 ${platformName}` at `:187`, `解除 ${platformName} 綁定` at `:198`, `要解除「${platformName}」的帳號綁定嗎？` at `:148`). The `SUPPORTED_PLATFORM_HINT` at `:57-59` formats `displayName（code）` pairs joined by `、`. `loadError` banner copy is `平台綁定資料同步失敗：${message}` (`:86`).
  - `settings-form.ts`: all error messages are Traditional Chinese (e.g. `請選擇介面語言。`, `接單範圍只能輸入整數公里數。`, `司機個人資料需要填寫姓名。`, `新增緊急聯絡人時，請填寫聯絡人姓名。`).
- No emoji usage detected in the touched user-visible runtime copy. Save chip uses `StatusChip` variants rather than emoji indicators.

### 2.6 Partial-load and partial-save resilience

- Load fan-out at `settings.tsx:174-217` uses `Promise.allSettled` and tolerates either branch failing: it sets `settingsLoaded` / `profileLoaded` independently and renders an `ErrorBanner` listing only the sections that failed via `formatSectionList` (`settings.tsx:55-63`).
- Form fields read from `settingsLoaded` / `profileLoaded` to gate `editable` (e.g. `settings.tsx:405-484`). Switches use the same loaded gate to drive `disabled` (`settings.tsx:498-507`).
- Save fan-out applies the same `Promise.allSettled` pattern. The function maps results back to the originating section by index (`settings.tsx:301-309`) and only updates the `initial*` baseline for the section whose write succeeded — preserving the previous dirty state for the section that failed.
- Edge: `settings.tsx:301-303` derives `isSettingsTask = settingsDirty && index === 0` to label the failure. This is correct only because `tasks` is appended in a fixed order (settings before profile). If a future change reorders or interleaves tasks, the section labels would silently misattribute. Reviewer should record this as a known shape constraint, not a gap.

### 2.7 Platform binding integration

- `settings.tsx:511-516` mounts `<PlatformBinding showSectionTitle={false} />` inside its own `FormSection title="平台帳號綁定"`. The new `showSectionTitle` prop on `PlatformBinding` (`platform-binding.tsx:25-27, 68-70, 215-220`) suppresses the legacy in-component header so the surface does not render two `平台帳號綁定` titles back-to-back.
- The shared `PlatformStatusCard` (canonical `DRV-MAT-007` artifact) is reused; `PlatformBinding` does not introduce a second card style.
- The unbind / reauth flows use display names plus the `PlatformStatusCard` icon-only actions (`platform-binding.tsx:182-204`), preserving the AC-2 `no emoji action` posture inherited from `DRV-MAT-007`.
- A `loadError` `ErrorBanner` (`platform-binding.tsx:73, 86, 225`) replaces the previous "alert-only" failure path so the embedded settings surface surfaces sync failures without an interrupting modal on initial load.

### 2.8 New helper module + unit tests (untracked)

- `apps/driver-app/lib/settings-form.ts` exposes pure helpers: `settingsValuesFromRecord`, `profileValuesFromRecord`, `settingsValuesEqual`, `profileValuesEqual`, `validateSettingsValues`, `validateProfileValues`, `hasEmergencyInput`, `hasErrors`, `buildSettingsCommand`, `buildProfileCommand`, `deriveSaveState`. Each maps cleanly into `@drts/contracts` types (`DriverSettings`, `DriverProfileRecord`, `UpdateDriverSettingsCommand`, `UpdateDriverProfileCommand`).
- `tests/unit/driver-app-settings-form.test.ts` is a vitest suite (~20 cases) covering record→form mapping, equality (trim-insensitive), validation (language required, integer-only radius, range gate, email format, emergency contact requires name + phone when partially filled), command builders (radius `null`, blank-optional null-out, full emergency contact echo, blank-relationship null), and `deriveSaveState` for each state.
- These two files are untracked. Reviewer should treat them as **parent-owner work in progress**. The sidecar does not bless them as parent acceptance evidence and does not run `pnpm test` on the parent's behalf.

### 2.9 Out-of-scope working-tree drift

- `apps/driver-app/components/platform-status-card.tsx` shows a 10-line modification not declared in `DRV-MAT-009.artifacts`. The card was finalized under `DRV-MAT-007` (`b7e14a4`). Reviewer should confirm whether the diff is a benign downstream consumer fix (e.g. accommodating `<PlatformBinding showSectionTitle={false} />` layout) or whether it crosses into DRV-MAT-007 territory and needs explicit recording.

Conclusion (canonical wording only):

- AC-1 `sectioned form exists`: implementation evidence visible in the working tree per §2.3, subject to parent reviewer confirmation of the [ ] rows in §3.
- AC-2 `save states clear`: implementation evidence visible per §2.4, subject to parent reviewer confirmation of the [ ] rows in §3.
- AC-3 `platform binding localized`: implementation evidence visible per §2.5 and §2.7, subject to parent reviewer confirmation of the [ ] rows in §3.
- AC-4 `typecheck passes`: **unverified**. The parent owner has not yet recorded `pnpm --filter @drts/driver-app typecheck` evidence in `DRV-MAT-009.next` or `review_notes_zh`, and the sidecar does not run typecheck on the parent's behalf. This row is gated entirely on parent owner evidence (§3 AC-4, §5 hotspot #1).
- The partial-load/save resilience documented in §2.6 is supporting context for AC-1/AC-2/AC-3 review, not a substitute acceptance bullet.

Drift status (current machine truth): the out-of-scope `platform-status-card.tsx` drift is already recorded in this sidecar's machine truth — both in the §8 handoff `next` message and in this packet (§2.2, §2.9, §3 reviewer hotspot #3, §9 note #4). It is **not yet** reflected in parent machine truth: `DRV-MAT-009.artifacts` does not list the file and `DRV-MAT-009.next` does not classify the diff. The packet flags this for the parent owner / parent reviewer rather than absorbing it.

---

## 3) Parent Acceptance Framing

This restates the parent acceptance bullets against the in-flight working tree. The sidecar checklist marks observation rows; reviewer responsibilities remain unchecked.

### AC-1 — `sectioned form exists`

- [x] `settings.tsx:91-103` defines a reusable `FormSection` wrapper rendered five times for `個人資料`, `緊急聯絡人`, `偏好設定`, `開關設定`, `平台帳號綁定` (`settings.tsx:395-516`), matching the design plan target layout (`docs/02-architecture/driver-app-productization-design-plan-20260504.md:290-301`).
- [x] All form rows reuse `FormField` (`settings.tsx:399-484`) instead of inline `TextInput` chrome; switches use the `SwitchRow` wrapper at `settings.tsx:113-135`.
- [ ] Reviewer should confirm the visual order of sections matches the design plan target layout exactly (`Profile → Emergency contact → Preferences → Platform accounts`); current implementation places `開關設定` between `偏好設定` and `平台帳號綁定`. This is consistent with the implicit "preferences" bucket but is one section deeper than the design plan's wording. Reviewer may treat this as acceptable refinement or flag as a deviation.
- [ ] Reviewer should not accept inline section headers reintroduced inside `<PlatformBinding />` once the `showSectionTitle={false}` prop is in place — the wrapper `FormSection` is the only owner of the `平台帳號綁定` heading.

### AC-2 — `save states clear`

- [x] `deriveSaveState` (`settings-form.ts:212-229`) produces the canonical 5-state machine. `describeSaveStatus` (`settings.tsx:70-83`) maps each state to a `StatusChip` label + variant, and `PageHeader.rightElement` (`settings.tsx:380-385`) renders the chip.
- [x] Save button copy and `disabled` posture cover the four functional cases: `正在儲存…` while in flight, `請先修正欄位` while validation fails, `儲存設定` when dirty + valid, `目前無變更` when pristine (`settings.tsx:530-545`).
- [x] `ErrorBanner` surfaces validation message (`settings.tsx:390-392`) and save error (`settings.tsx:393`) without blocking the page.
- [ ] Reviewer should run the four explicit transitions manually (idle → dirty → saving → saved; idle → dirty → saving → error → dirty after edit) on the device or simulator to confirm the chip and button copy update synchronously with `lastResult` clearing on edit (`settings.tsx:251-269`).
- [ ] Reviewer should not interpret AC-2 as requiring per-section save buttons; the design plan asks for `dirty/saving/saved/error` on the save action, which is satisfied by the global save action and the per-section error labeling produced by `formatSectionList`.

### AC-3 — `platform binding localized`

- [x] `PlatformBinding` now resolves `displayName` via `PLATFORM_CODE_REGISTRY` (`platform-binding.tsx:49-55`) and uses the display name in alerts (`:138, :148, :160`), action labels (`:187, :198`), and the supported-hint helper text (`:57-59, :265`). Raw codes still appear inside the `displayName（code）` parenthetical so operators can still dictate codes.
- [x] All user-visible runtime copy in the touched surface is Traditional Chinese (alerts, banners, button titles, helper text, validation messages); previous English-only fallbacks like `要解除「grab」的帳號綁定嗎？` are gone.
- [x] `<PlatformBinding showSectionTitle={false} />` keeps the embedded header out of the settings layout so reviewers see one canonical `平台帳號綁定` heading from the outer `FormSection`.
- [ ] Reviewer should confirm `PLATFORM_CODE_REGISTRY[code].displayName` returns Traditional Chinese names for all entries in `PLATFORM_CODES`; if any entry resolves to English, the action labels would silently fall back to English without a runtime warning. (This is a contract-side concern, not a settings-side fix.)
- [ ] Reviewer should not accept reintroducing raw `platformCode` strings into runtime copy as a closeout shortcut; the test of localization is the alert / label level, not the form field labels.

### AC-4 — `typecheck passes`

- [ ] Parent owner has not yet recorded `pnpm --filter @drts/driver-app typecheck` evidence in `DRV-MAT-009.next` or `review_notes_zh`. The execution packet (`docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:277-281`) lists this as the sole verification command for `DRV-MAT-009`.
- [ ] The new `apps/driver-app/lib/settings-form.ts` import path used in `settings.tsx:30-46` (`@/lib/settings-form`) must resolve under the driver-app `tsconfig` `paths` map; if it does not, typecheck will fail immediately. Reviewer should treat this as the highest-risk regression vector for AC-4.
- [ ] The new `tests/unit/driver-app-settings-form.test.ts` imports from `../../apps/driver-app/lib/settings-form`. Reviewer should confirm the test file lives in a vitest config root that compiles `apps/driver-app/lib`, otherwise it will not contribute to verification even though it exists. (The driver app currently uses a vitest harness with the helper test colocated under `apps/driver-app/tests/`. A repo-root `tests/unit/` location is a deviation worth confirming before declaring AC-4.)
- [ ] Sidecar does not run typecheck on the parent's behalf and does not record AC-4 as satisfied; this row is gated on parent owner evidence.

---

## 4) Dependency Map

### 4.1 Formal Machine Dependencies

| Dep           | Source                   | Status | Why It Matters                                                                                                                                                                                                                |
| ------------- | ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-001` | `DRV-MAT-009.depends_on` | `done` | Provides `AppScreen`, `PageHeader`, `ActionButton`, `BottomActionBar`, `EmptyState`, `ErrorBanner`, `FormField`, `StatusChip`, `Tokens`. Settings reuses every one of these — losing the foundation would break all sections. |
| `DRV-MAT-007` | `DRV-MAT-009.depends_on` | `done` | Locked the canonical `PlatformStatusCard` and the localized `PlatformBinding` posture. Settings consumes `<PlatformBinding showSectionTitle={false} />` and inherits the icon-button + display-name conventions.              |

### 4.2 Practical Review Anchors

| ID     | Anchor                                                                            | Why It Matters                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1  | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:260-281` | Parent acceptance bullets, write scope, and verification command (`pnpm --filter @drts/driver-app typecheck`).                                                          |
| D-P-2  | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:290-311`  | Target layout, required states, acceptance table for `/settings`.                                                                                                       |
| D-P-3  | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:328`      | Wave-3 row: `DRV-MAT-009` priority `P1`, dependencies `DRV-MAT-001`, `DRV-MAT-007`, write scope.                                                                        |
| D-P-4  | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:20, 22`   | Pre-productization gap inventory for `/settings` and `PlatformBinding` (English copy, weak validation).                                                                 |
| D-P-5  | `apps/driver-app/app/settings.tsx`                                                | Working-tree implementation under review (sectioned form, dirty/save chip, partial load/save).                                                                          |
| D-P-6  | `apps/driver-app/components/platform-binding.tsx`                                 | Localized display-name flow + `showSectionTitle` integration with the settings page.                                                                                    |
| D-P-7  | `apps/driver-app/lib/settings-form.ts`                                            | Untracked helper module factoring out the form state machine.                                                                                                           |
| D-P-8  | `tests/unit/driver-app-settings-form.test.ts`                                     | Untracked vitest suite for the helper module; AC-4 verification surface.                                                                                                |
| D-P-9  | `apps/driver-app/lib/api-client.ts:369, 470-491`                                  | `isDriverIdentityProvisioned`, `getDriverClient`, `getDriverId` — same throw semantics relied on by `/shift`.                                                           |
| D-P-10 | `packages/contracts/src/index.ts:3693-3751`                                       | `DriverSettings`, `UpdateDriverSettingsCommand`, `DriverProfileRecord`, `UpdateDriverProfileCommand`, `DriverProfileEmergencyContact`.                                  |
| D-P-11 | `packages/api-client/src/index.ts:1977-2003`                                      | `getDriverSettings`, `updateDriverSettings`, `getDriverProfile`, `updateDriverProfile`. Note `updateDriverSettings(driverId, command: any)` is currently typed loosely. |
| D-P-12 | `packages/contracts` `PLATFORM_CODE_REGISTRY` / `PLATFORM_CODES`                  | Display-name lookup table that powers AC-3 localization in `PlatformBinding`.                                                                                           |
| D-P-13 | `apps/driver-app/components/platform-status-card.tsx`                             | Out-of-scope drift (10-line diff) reviewer must classify before parent closeout.                                                                                        |

### 4.3 Informative Consumer Map

| Consumer                         | Status        | Why It Matters                                                                                                                                                                                          |
| -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-007`                    | `done`        | Settings page is the canonical second consumer of `<PlatformBinding />`. Anything that regresses the `showSectionTitle` integration or the icon-button posture also regresses DRV-MAT-007 expectations. |
| `DRV-MAT-010`                    | `backlog`     | Driver-app verification pack will inherit AC-1..AC-4 evidence after parent closes. The verification pack should not invent additional acceptance for `/settings` beyond the four bullets.               |
| `DRV-MAT-007-SIDECAR-ACCEPTANCE` | `review`      | Already records that settings reuses `<PlatformBinding />` — DRV-MAT-009 must keep that integration intact and not re-inline a settings-local platform form.                                            |
| Parent owner `Codex`             | `in_progress` | Owns `apps/driver-app/app/settings.tsx`, `apps/driver-app/components/platform-binding.tsx`, the new helper module, and the new vitest. Will produce parent commit + `pnpm typecheck` evidence.          |
| Parent reviewer `Codex2`         | `next`        | Will receive the parent handoff and gate AC-4 on `pnpm --filter @drts/driver-app typecheck` plus the four formal bullets.                                                                               |

---

## 5) Reviewer Hotspots (sidecar reviewer `Codex`)

When reviewing this sidecar packet, prioritize:

1. The packet must reflect that parent `DRV-MAT-009` is `in_progress` under owner `Codex` / reviewer `Codex2` at `2026-05-05T02:30:29Z`, with no parent commit yet. Do not let the packet pre-sign `commit_hash` / `push_*` fields or claim AC-4 typecheck has been run.
2. The acceptance framing must trace to higher-precedence sources (D-P-1, D-P-2) and not invent acceptance language. The four canonical bullets are `sectioned form exists`, `save states clear`, `platform binding localized`, `typecheck passes`.
3. The `apps/driver-app/components/platform-status-card.tsx` drift is currently outside `DRV-MAT-009.artifacts`. The packet must flag this rather than silently fold it into AC-1 / AC-3. Ask the parent owner to either (a) declare the file under DRV-MAT-009 scope before commit, or (b) revert the diff so DRV-MAT-007's closed surface stays untouched.
4. The packet must keep the new `apps/driver-app/lib/settings-form.ts` and `tests/unit/driver-app-settings-form.test.ts` framed as **parent-owner work in progress**, not as sidecar-blessed evidence. The sidecar does not run vitest on the parent's behalf.
5. The packet must not edit anything under `apps/`, `packages/`, `services/`, `runtime/`, the design plan, or the execution packet. Only `support/sidecars/DRV-MAT-009/...` and machine state via `scripts/ai_status.py` are in scope.
6. Verify the localization audit references the `PLATFORM_CODE_REGISTRY` lookup rather than re-asserting display names directly — the canonical name source is the registry, not this packet.
7. Confirm the order-dependent failure attribution caveat in §2.6 (the `index === 0` check assumes settings precedes profile in `tasks`) is recorded as an observation, not a blocker. If the parent owner restructures `tasks`, the attribution must be revisited.
8. The sidecar may finalize without a code commit. Closeout uses `NO_COMMIT_REQUIRED=1` per the AI Collaboration Guide §5 (sidecar acceptance packets are an explicit non-canonical case).

---

## 6) Evidence Inventory

| ID   | Evidence                                     | Location                                                                                                                                             |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent task machine state                    | `ai-status.json` entry for `DRV-MAT-009`                                                                                                             |
| E-2  | Sidecar task machine state                   | `ai-status.json` entry for `DRV-MAT-009-SIDECAR-ACCEPTANCE`                                                                                          |
| E-3  | Parent execution instructions                | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:260-281`                                                                    |
| E-4  | Product design acceptance posture            | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:290-311, 328`                                                                |
| E-5  | Pre-productization gap inventory             | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:20, 22`                                                                      |
| E-6  | Settings page implementation                 | `apps/driver-app/app/settings.tsx`                                                                                                                   |
| E-7  | Platform binding integration                 | `apps/driver-app/components/platform-binding.tsx`                                                                                                    |
| E-8  | Untracked form helper                        | `apps/driver-app/lib/settings-form.ts`                                                                                                               |
| E-9  | Untracked vitest suite                       | `tests/unit/driver-app-settings-form.test.ts`                                                                                                        |
| E-10 | Driver runtime helpers                       | `apps/driver-app/lib/api-client.ts:369, 470-491`                                                                                                     |
| E-11 | Driver settings & profile contracts          | `packages/contracts/src/index.ts:3693-3751`                                                                                                          |
| E-12 | Adapter methods for settings & profile       | `packages/api-client/src/index.ts:1977-2003`                                                                                                         |
| E-13 | Shared UI primitives consumed by `/settings` | `apps/driver-app/components/ui/{AppScreen,PageHeader,ActionButton,BottomActionBar,EmptyState,ErrorBanner,FormField,StatusChip,tokens}.tsx`           |
| E-14 | Platform code registry                       | `packages/contracts` exports referenced via `@drts/contracts` (`PLATFORM_CODES`, `PLATFORM_CODE_REGISTRY`, `PlatformCode`, `PlatformPresenceRecord`) |
| E-15 | Out-of-scope drift                           | `apps/driver-app/components/platform-status-card.tsx` (10-line diff against `b7e14a4`)                                                               |
| E-16 | Upstream Claude2 inspection evidence         | `.orchestrator/evidence/claude2-20260505T020927Z-51e8b24e.json` (referenced by parent `evidence_refs`)                                               |

---

## 7) Sidecar Acceptance Checklist

### AC-S1 — `Create support artifacts only`

- [x] Only writes `support/sidecars/DRV-MAT-009/DRV-MAT-009-SIDECAR-ACCEPTANCE.md`.
- [x] Content is acceptance framing, dependency map, baseline, reviewer guidance, and downstream consumer notes — no new canonical truth.
- [x] No claim that this sidecar implements `/settings`, runs `pnpm typecheck`, or completes parent closeout.

### AC-S2 — `Do not edit canonical truth`

- [x] No edits to `phase1_*.md`, `docs/02-architecture/...` design plan, `docs/03-runbooks/...` execution packet, `apps/driver-app/...`, `packages/...`, `services/...`, `runtime/...`, or any test file.
- [x] Machine truth changes go through `scripts/ai-status.sh` / `scripts/ai_status.py` only.
- [x] All references in §2-§6 cite higher-precedence sources rather than restating product semantics.

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [x] §8 handoff command targets reviewer `Codex` per `DRV-MAT-009-SIDECAR-ACCEPTANCE.reviewer`.
- [ ] Reviewer `Codex` may `approve` (sidecar passes) or `reopen` / `blocker` (with reason). Owner returns to revise if reopened.

---

## 8) Handoff Command

Owner (`Claude`) -> Reviewer (`Codex`)

```bash
AI_NAME=Claude scripts/ai-status.sh handoff DRV-MAT-009-SIDECAR-ACCEPTANCE Codex \
  "Drafted support-only DRV-MAT-009 acceptance packet at support/sidecars/DRV-MAT-009/DRV-MAT-009-SIDECAR-ACCEPTANCE.md against the in-flight working tree (parent in_progress under Codex/Codex2, last_update 2026-05-05T02:30:29Z; no parent commit yet). Sections cover acceptance framing pinned to the four canonical bullets (sectioned form exists, save states clear, platform binding localized, typecheck passes), a dependency map citing DRV-MAT-001 and DRV-MAT-007 as done, current settings.tsx + platform-binding.tsx + new settings-form.ts + tests/unit/driver-app-settings-form.test.ts baseline, partial-load/save behaviour, localization audit using PLATFORM_CODE_REGISTRY display names with showSectionTitle=false, and reviewer hotspots. Flagged out-of-scope drift on apps/driver-app/components/platform-status-card.tsx (10-line diff against DRV-MAT-007 closeout b7e14a4) and the order-dependent failure attribution in handleSave for parent reviewer follow-up. Did not edit canonical truth and did not run pnpm typecheck on the parent's behalf."
```

---

## 9) Notes For Parent Owner (`Codex`) — Pre-`done` Reference

These are follow-up references for the parent owner before parent closeout. They are **not** new acceptance bars; they are observations the sidecar lane recorded while building the packet.

1. The execution packet's sole verification command for `DRV-MAT-009` is `pnpm --filter @drts/driver-app typecheck` (`docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:277-281`). The parent commit body should record the command and result so AC-4 evidence is captured at machine truth time, mirroring the DRV-MAT-006 / DRV-MAT-007 pattern.
2. Two new files in the working tree (`apps/driver-app/lib/settings-form.ts`, `tests/unit/driver-app-settings-form.test.ts`) are not currently listed under `DRV-MAT-009.artifacts`. Consider whether to (a) add them to the parent's artifact list before commit so machine truth captures the full closeout surface, or (b) at minimum reference them in the commit body.
3. The repo-root `tests/unit/...` path is unusual for the driver-app workspace (existing driver-app tests live under `apps/driver-app/tests/`). Confirm vitest discovery picks up the file, otherwise it will not contribute to AC-4 verification even though it exists.
4. `apps/driver-app/components/platform-status-card.tsx` shows a 10-line diff but is not in `DRV-MAT-009.artifacts` (it is `DRV-MAT-007`'s canonical artifact, closed at `b7e14a4`). Either (a) declare the file under DRV-MAT-009 scope and explain the rationale in the commit body, or (b) revert the diff before closeout. The sidecar does not pre-sign either path.
5. `packages/api-client/src/index.ts:1981` types `updateDriverSettings(driverId, command: any)` loosely; settings.tsx feeds it `buildSettingsCommand(values): UpdateDriverSettingsCommand`. The mismatch does not block AC-4 because the call site is correctly typed, but tightening the adapter signature is a follow-up worth recording in a separate task — not in this slice.
6. `handleSave` (`settings.tsx:271-342`) attributes failures by index assuming the order `settings-then-profile` in `tasks`. If you ever introduce a third dirty section or restructure the queue, refactor the attribution to thread the section label through the promise rather than relying on `index === 0`. Sidecar records this as an observation only.
7. `DriverSettings` (`packages/contracts/src/index.ts:3693-3701`) includes `preferredAreas: string[]`, but neither `settings.tsx` nor the helper module surfaces it in the form yet. The design plan does not require it for `DRV-MAT-009`, so this is intentional scope; a future settings task can add it without re-baselining acceptance.
8. The `<PlatformBinding showSectionTitle={false} />` integration is the entire reason for the new prop. Keep it intact at closeout — `DRV-MAT-007-SIDECAR-ACCEPTANCE` already records that settings reuses `<PlatformBinding />` rather than inlining a settings-local platform form.

---

## 10) Notes For Downstream Consumer (`DRV-MAT-010` verification owner)

1. Treat the four formal acceptance bullets (`sectioned form exists`, `save states clear`, `platform binding localized`, `typecheck passes`) as the landed contract for `/settings` after the parent closes. Do not invent additional `DRV-MAT-009` acceptance in the verification pack.
2. The fail-tolerant partial-load/partial-save posture (`Promise.allSettled` on both branches) is part of the accepted contract per the design plan's required-states list. Do not regress it into a hard fan-out failure during verification without an explicit acceptance change.
3. The render-time-only read of `isDriverIdentityProvisioned()` (`settings.tsx:139`) follows the same pattern accepted on `/shift` and `/platform-presence`. Reactive re-evaluation on revocation is a future scope discussion, not a verification finding.
4. `<PlatformBinding showSectionTitle={false} />` is the canonical integration shape; the verification pack should not re-derive a settings-local platform form.
5. The verification command on the parent slice is `pnpm --filter @drts/driver-app typecheck`; re-run it against the verification commit, not against this sidecar packet.
