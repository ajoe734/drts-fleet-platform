# DRV-UI-RD-008 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `DRV-UI-RD-008` - Reskin Settings  
**Parent Owner:** `Codex2`  
**Parent Reviewer:** `Codex`  
**Sidecar Owner:** `Codex2`  
**Sidecar Reviewer:** `Codex`  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify
canonical truth, parent machine truth, or runtime behavior.

This packet is the reviewer-facing acceptance companion for the Wave 4
driver-app settings reskin centered on `apps/driver-app/app/settings.tsx`.
Live lifecycle truth for both the parent task and this sidecar remains
authoritative only in `ai-status.json`; this document intentionally does
not freeze `status`, `next`, `last_update`, or eventual closeout fields.

At packet refresh time, `ai-status.json` still records the parent
`DRV-UI-RD-008` as `backlog`. This packet is therefore forward-looking:
it defines what the parent diff must preserve or satisfy once the parent
owner moves the slice through implementation and review.

---

## 1. Scope Boundary

In scope:

- translate the parent task row, Wave 4 shared acceptance bar, and
  Settings-specific design/product anchors into a concrete reviewer
  checklist for `apps/driver-app/app/settings.tsx`
- pin the formal upstream dependency recorded in machine truth
  (`DRV-UI-RD-001`) and the already-shipped settings behaviors the
  reskin must not regress
- capture the `PlatformBinding` relationship because the parent surface
  already embeds it and the redesign explicitly requires visual
  alignment with platform presence
- record review commands, manual verification expectations, and owner
  closeout evidence notes for this support slice

Out of scope:

- editing L1/L2 truth, `ai-status.json`, `current-work.md`, or the
  parent task row
- editing `apps/driver-app/app/settings.tsx`,
  `apps/driver-app/components/platform-binding.tsx`,
  `apps/driver-app/lib/settings-form.ts`, or any other parent-write-scope
  runtime file
- pre-approving the future parent diff or dictating exact styling beyond
  the cited product/design acceptance anchors
- changing settings/profile semantics already anchored in shipped code:
  partial load handling, partial save handling, dirty/save states,
  unprovisioned fallback, and platform-binding access from settings
- inventing new backend/API dependencies not already represented in
  machine truth or the current shipped settings surface

---

## 2. Machine Truth Anchors

### 2.1 Sidecar row - `ai-status.json -> DRV-UI-RD-008-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Codex`
- task_class=`sidecar`
- helper_parent=`DRV-UI-RD-008`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- depends_on=`DRV-UI-RD-001`
- artifacts=
  `support/sidecars/DRV-UI-RD-008/DRV-UI-RD-008-SIDECAR-ACCEPTANCE.md`
- acceptance=
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### 2.2 Parent row - `ai-status.json -> DRV-UI-RD-008`

- title=`Reskin Settings`
- phase=`Wave 4`
- owner=`Codex2`
- reviewer=`Codex`
- depends_on=`DRV-UI-RD-001`
- artifacts=`apps/driver-app/`
- acceptance=
  - `pnpm --filter @drts/driver-app typecheck / lint / test`
  - `Expo dev build on Android emulator + manual screenshot vs canvas`
  - `Backend / location heartbeat / provisioning flow 不可動`
- summary_zh=`app/settings.tsx 對齊 ScreenSettings。`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`

### 2.3 Hard upstream dependency - `DRV-UI-RD-001`

At packet refresh time:

- status=`done`
- commit_hash=`5db92c8312953f584c0ddb51b366ea177b78b978`
- commit_subject=
  `feat(DRV-UI-RD-001): wire ui-tokens into driver-app RN primitives`

Reviewer implication:

- the parent reskin must stay on the driver-app token/primitives path
  established by `DRV-UI-RD-001`
- driver-app remains forbidden from importing `@drts/ui-web`; only
  `@drts/ui-tokens` and the RN-side primitives layer are allowed for
  the redesign

### 2.4 Downstream consumer

| Task ID         | Relationship                  | Why it matters                                                                                                                                                 |
| --------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-009` | Wave 4 driver closeout packet | The eventual Wave 4 closeout will need the parent review evidence for `DRV-UI-RD-008`, including reviewer, approval time, commit hash, and verification notes. |

---

## 3. Authoritative Product and Design Anchors

### 3.1 Wave 4 planning ref

`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md:499` records:

- `DRV-UI-RD-008` = Reskin Settings (`app/settings.tsx`)
- shared Wave 4 acceptance=
  - `pnpm --filter @drts/driver-app typecheck`
  - `pnpm --filter @drts/driver-app test`
  - `pnpm --filter @drts/driver-app lint`
  - Expo dev build on Android emulator + manual screenshot vs design canvas
- shared guardrails=
  - no backend behavior changes
  - no location heartbeat changes
  - no provisioning-flow changes
  - no `@drts/ui-web` import path in the driver app

### 3.2 Higher-precedence product truth

`docs/01-product/driver-app-multi-platform-product-spec-20260507.md`
section `5.x /settings` requires:

- route=`/settings`
- profile fields:
  - name
  - phone
  - email
- emergency contact fields:
  - name
  - phone
  - relationship
- preferences:
  - language
  - max accept radius
  - notifications
  - auto accept
- platform account binding:
  - list bound platform accounts
  - auth status
  - re-auth requirement
  - bind/unbind where allowed
  - account identifier shown safely
- save states:
  - unchanged
  - dirty
  - saving
  - saved
  - error
- partial load/save error handling
- multi-platform clarity:
  - driver can tell which platform accounts are connected
  - driver can tell whether each account can receive work
  - driver can re-auth from settings or platform presence
  - auto-accept language must clarify global vs per-platform scope

### 3.3 Supporting design refs

`docs/02-architecture/driver-app-productization-design-plan-20260504.md`
section `4.8 /settings` requires:

- target layout:
  - header
  - profile section
  - emergency contact section
  - preferences section
  - platform accounts section
  - sticky save action when dirty
- required states:
  - unprovisioned
  - loading
  - partial load failure
  - dirty form
  - saving
  - partial save failure
  - validation error
- acceptance:
  - form broken into clear sections with shared `FormField`
  - save action reflects dirty/saving/saved/error
  - no English runtime copy inside `PlatformBinding`

`docs/03-runbooks/driver-app-design-rebuild-execution-packet-20260507.md`
section `Settings` proposes `ScreenSettings` parity with:

- profile card for driver identity
- platform binding section showing:
  - DRTS bound
  - SmartRides X bound + expiry
  - Metro Hail reauth
- preference rows for language, max accept radius, auto accept,
  notifications
- other rows for emergency contact, device info, and logout
- preserved settings form logic
- platform bindings in the same visual language as platform presence

Precedence note:

- the product spec and design plan are higher-precedence than the
  runbook packet
- therefore the non-negotiable acceptance bar is preserved settings
  behavior plus clear sectioned reskin toward `ScreenSettings`
- the parent may add runbook-only niceties such as device info/logout
  presentation only if they do not regress the higher-precedence form,
  save-state, and platform-binding semantics above

### 3.4 Current runtime baseline in `apps/driver-app/app/settings.tsx`

At packet refresh time, the existing implementation already does all of
the following:

- routes unprovisioned drivers to an empty-state fallback with a path
  back to `/onboarding`
- loads driver settings and driver profile in parallel
- preserves partial-load behavior by continuing with available data and
  surfacing a combined `ErrorBanner`
- separates profile, emergency contact, preferences, switch settings,
  and platform binding into distinct sections
- tracks save states through a status chip:
  - unchanged
  - dirty
  - saving
  - saved
  - error
- preserves validation errors before save
- saves settings and profile independently, including partial-save
  success/error handling
- embeds `PlatformBinding` directly inside the settings surface
- exposes a contextual link to `/earnings`

Reviewer implication:

- `DRV-UI-RD-008` is a visual reskin task, not a semantics-reset task
- any parent diff that weakens partial load/save handling, removes
  save-state clarity, drops profile/emergency/preference/platform
  sections, or regresses the unprovisioned fallback is a regression

---

## 4. Dependency Map

### A. Formal upstream dependency

| Dep ID          | Status | What it contributes                                                                                                          |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-001` | `done` | Provides the RN-side token/primitives layer and the accepted driver-app redesign foundation required by every Wave 4 reskin. |

Transitive context already folded into that foundation:

- `TOK-UI-001` provides `@drts/ui-tokens`

### B. Runtime coupling that review must account for

| Surface                               | Why it matters for settings review                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `components/platform-binding.tsx`     | Product truth requires platform account binding, auth state, and re-auth visibility from settings.                                  |
| `lib/settings-form.ts`                | Current dirty/validation/save-state behavior is derived here and must not be silently weakened by a cosmetic reskin.                |
| `/platform-presence` styling language | Product/design refs require settings-side platform binding to visually align with platform presence rather than invent a new style. |
| `/earnings` link-out                  | The shipped footer path to earnings exists today; if changed, reviewer should confirm the alternative still matches app navigation. |

### C. Downstream review/closeout consumers

| Consumer        | Relationship                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-009` | Depends on `DRV-UI-RD-008` reaching review-approved/done with usable evidence for the Wave 4 closeout packet. |

---

## 5. Acceptance Checklist

The list below is what the parent reviewer (`Codex`) should apply when
`DRV-UI-RD-008` reaches `review`.

### 5.1 Standard Wave 4 verification

- [ ] `pnpm --filter @drts/driver-app typecheck` passes at the parent review commit.
- [ ] `pnpm --filter @drts/driver-app test` passes at the parent review commit.
- [ ] `pnpm --filter @drts/driver-app lint` passes at the parent review commit.
- [ ] Android Expo dev build/manual screenshot comparison is either run or explicitly recorded as environment-blocked; it must not be silently skipped.

### 5.2 Settings parity gates

- [ ] `apps/driver-app/app/settings.tsx` is visually reskinned toward `ScreenSettings` rather than left as the old utilitarian form.
- [ ] The screen keeps clearly separated sections for profile, emergency contact, preferences, and platform accounts.
- [ ] The screen keeps a visible save affordance and state communication when dirty/saving/saved/error.
- [ ] The platform-binding section uses the same visual language as platform presence instead of an inconsistent embedded mini-surface.
- [ ] If the parent claims close parity to the canvas, it also covers the extra `ScreenSettings` cues called out in the runbook packet such as platform account status richness and secondary utility rows.

### 5.3 No-regression behavior gates

- [ ] Unprovisioned state still blocks settings editing and routes the driver toward `/onboarding`.
- [ ] Loading state still exists and remains understandable.
- [ ] Partial load failures still preserve any available data and surface an explicit error message.
- [ ] Validation failures still prevent save and keep field-level guidance.
- [ ] Partial save success/failure handling remains behaviorally equivalent; the reskin must not collapse it into a generic failure toast.
- [ ] The profile and settings updates still save independently rather than forcing an all-or-nothing backend change.

### 5.4 Multi-platform clarity gates

- [ ] Settings still expose platform binding/account status from inside `/settings`.
- [ ] Driver-facing copy makes it clear whether auto-accept is global or per-platform.
- [ ] No English runtime copy is introduced into the touched settings/platform binding surface except unavoidable platform names/codes.
- [ ] Re-auth/account readiness remains legible from settings or is clearly delegated without removing the user’s visibility into account status.

### 5.5 Guardrails

- [ ] No import from `@drts/ui-web` is introduced into the mobile app.
- [ ] No backend behavior, location-heartbeat logic, or provisioning flow is changed.
- [ ] The reskin does not remove or weaken the settings/profile API integration already shipped in the baseline.
- [ ] If the parent changes tests around settings or platform binding, the updated coverage still proves the preserved dirty/save/partial-error semantics rather than deleting those assertions.

---

## 6. Reviewer Handoff Notes

Recommended parent-review command set:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app lint
pnpm --filter @drts/driver-app test
```

Manual gate outside the repo sandbox:

- Expo dev build on Android emulator + screenshot comparison against the
  Settings design canvas

Sidecar review focus for `Codex`:

- confirm this packet stays within sidecar scope
- confirm the machine-truth anchors above match `ai-status.json`
- confirm the acceptance checklist is aligned to the real parent surface
  (`apps/driver-app/app/settings.tsx`) and its shipped baseline
- confirm the packet reflects the current `Codex2 -> Codex` ownership
  rather than the earlier `Gemini/Gemini2` assignment history

---

## 7. Closeout Gate For This Sidecar

This sidecar is support-only, but the dispatch-specific supervisor
instruction for this wake-up is stricter than a generic docs-only close:
the owner should not mark this task `done` unless it has its own
task-scoped commit and ordinary non-force push evidence
(`COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, `PUSH_BRANCH`).

This packet refresh therefore supports two separate lifecycle steps:

- immediate owner handoff to reviewer `Codex` for sidecar approval
- later owner closeout only after a task-scoped commit/push is available
