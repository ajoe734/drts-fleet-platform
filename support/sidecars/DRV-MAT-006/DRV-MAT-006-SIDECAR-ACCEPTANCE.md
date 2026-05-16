# DRV-MAT-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DRV-MAT-006` — Driver shift and attendance materialization
**Sidecar Owner:** `Codex2`
**Sidecar Reviewer:** `Claude2`
**Parent Owner / Reviewer At Snapshot:** `Codex2` / `Codex`
**Parent Status At Snapshot:** `done` (last_update `2026-05-05T01:57:47Z` per `ai-status.json`, commit `28c17ed` "DRV-MAT-006: materialize driver shift and attendance")
**Generated:** `2026-05-05` (UTC) — refresh by `Codex2`

---

## 0) Refresh Note

This revision supersedes both the prior `Codex2`/`Gemini2` packet
(`2026-05-05T01:05`) and the earlier `Claude2` refresh that was scoped to a
parent `review` snapshot under `Codex`/`Codex2`. Two things changed since the
last packet was frozen:

1. The parent task transitioned `review -> review_approved -> done`. Parent
   owner / reviewer in `ai-status.json` are now `Codex2` / `Codex`. The
   parent's task-scoped commit `28c17ed` ("DRV-MAT-006: materialize driver
   shift and attendance") was pushed to
   `origin/codex/dev-deploy-backend-android`, and the parent finalized at
   `2026-05-05T01:57:47Z`.
2. `apps/driver-app/app/shift.tsx` is now part of the closeout commit, so the
   working tree is clean. The line-anchored references below have been
   re-pinned to the committed file (`28c17ed`); for example,
   `isDriverIdentityProvisioned()` is now read at `shift.tsx:72`, not `:78`.

Because the parent has already closed, this packet is now a **historical /
support evidence** record. It documents that the parent acceptance bullets
trace cleanly to the committed implementation and that no canonical truth was
edited inside this sidecar. It does **not** authorize re-opening the parent.

This sidecar task (`DRV-MAT-006-SIDECAR-ACCEPTANCE`) was auto-created by the
supervisor underutilization policy. This refresh is prepared under the
current owner / reviewer pair `Codex2` / `Claude2`; the earlier `Claude2`
refresh now survives only as historical context.

---

## 1) Scope Boundary

This sidecar curates support-only artifacts for `DRV-MAT-006`:

- In scope: refreshed acceptance framing pinned to commit `28c17ed`,
  dependency map, repo baseline, cross-lane API/integration observations,
  reviewer guidance, handoff wording.
- Out of scope: editing `apps/driver-app/app/shift.tsx`, changing the driver
  identity contract, rewriting any L1/L2 product truth, re-opening the
  parent, or making any commit-evidence claim on behalf of the parent.
  Parent owner `Codex2` already executed closeout.

---

## 2) Current State Baseline

Anchored on the committed snapshot at `28c17ed` and the canonical documents
listed in §4. Line refs target that commit; the working tree matches it.

### 2.1 Demo identity removal

- Repo-wide search for `driver-demo-001` under `apps/driver-app/` returns no
  hits. The hard-coded demo driver id has been retired from this surface.

### 2.2 Provisioned identity wiring

- `apps/driver-app/app/shift.tsx:5-9` imports `getDriverClient`, `getDriverId`,
  and `isDriverIdentityProvisioned` from `@/lib/api-client`. There is no
  `@/contexts/AuthContext` import; the prior packet's TypeScript-resolution
  blocker is gone.
- `shift.tsx:72` reads `isDriverIdentityProvisioned()` once at render time.
- `shift.tsx:88-110` short-circuits the loader when the identity is not
  provisioned (`setLoading(false); return;`) and only invokes
  `getDriverClient()` after the gate.
- `shift.tsx:135-149` returns an `EmptyState` redirecting to `/onboarding`
  when the identity is not provisioned. This satisfies the design plan's
  "guarded unprovisioned state" branch.

### 2.3 Validation

- `shift.tsx:21-39` defines an `ODOMETER_PATTERN` integer regex plus a
  `Number.isSafeInteger` check returning structured Traditional-Chinese
  validation copy.
- `shift.tsx:85-86` derives `odometerError` / `hasValidationError` and feeds
  both `FormField.error` (line 325, 368) and `ActionButton.disabled` (line
  382, 391). Submit handlers `handleClockIn` / `handleClockOut` re-check
  `odometerError` and short-circuit with an `Alert.alert` (`shift.tsx:152-155`,
  `183-186`).

### 2.4 Shared UI integration

- `shift.tsx` now consumes `AppScreen`, `PageHeader`, `FormField`,
  `ActionButton`, `BottomActionBar`, `EmptyState`, `ErrorBanner`,
  `IconButton`, `StatusChip`, and `Tokens` (`shift.tsx:10-19`). All of these
  are the `DRV-MAT-001` shared primitives.
- The active-shift posture uses `<StatusChip label="執勤中" variant="success" />`
  (`shift.tsx:296`) instead of the prior emoji indicator.
- Clock in / out controls render through `ActionButton` inside
  `BottomActionBar` (`shift.tsx:375-395`) — no `Text`-as-button remains.
- The form rows use `FormField` (`shift.tsx:318-333`, `347-369`) rather than
  page-local `TextInput` chrome.

### 2.5 Required states (per design plan §4.7)

| State              | Implementation Anchor                                          |
| ------------------ | -------------------------------------------------------------- |
| Loading            | `ActivityIndicator` in `AppScreen` at `shift.tsx:211-221`      |
| Feature disabled   | `EmptyState` with `calendar-outline` at `shift.tsx:223-237`    |
| Unprovisioned      | `EmptyState` with `lock-closed-outline` at `shift.tsx:135-149` |
| No active shift    | `StatusChip "待上線"` + clock-in form at `shift.tsx:335-371`   |
| Active shift       | `StatusChip "執勤中"` + clock-out form at `shift.tsx:292-334`  |
| Submitting         | `ActionButton.loading={submitting}` at `shift.tsx:381, 390`    |
| API error (load)   | `EmptyState` retry at `shift.tsx:239-268`                      |
| API error (submit) | `ErrorBanner` at `shift.tsx:290`                               |

### 2.6 Open observations (recorded for posterity, not blockers)

- `shift.tsx:106-109` swallows `isFeatureEnabled` errors and falls through to
  `loadShifts()`. This is permissive on purpose, but it means a flag-service
  outage masquerades as `enabled`. Parent owner accepted this fail-open
  posture during closeout; downstream verification (DRV-MAT-010) should not
  regress it without an explicit acceptance change.
- `shift.tsx:72` evaluates `isDriverIdentityProvisioned()` once on render.
  After in-app revocation, the screen would not retransition to the
  unprovisioned `EmptyState` until remount. That matches `getDriverId()`
  throw semantics (see §4.2 D-P-4) and was not flagged as a parent regression.
- The parent's task-scoped commit is `28c17ed`, pushed to
  `origin/codex/dev-deploy-backend-android` per `ai-status.json`. `git
status` for `apps/driver-app/app/shift.tsx` is clean at refresh time.

Conclusion: the committed `shift.tsx` snapshot satisfies all four formal
acceptance bullets and the design plan's required-states checklist. The two
behavioural choices above (fail-open feature flag, single read of identity
provisioning) were carried into the closed parent and are now part of the
landed contract.

---

## 3) Parent Acceptance Framing

This re-states the parent acceptance bullets against the committed
snapshot at `28c17ed`. All boxes that depend on the implementation are
checked because the parent is already `done`; the unchecked items are
purely sidecar reviewer responsibilities for this packet.

### AC-1 — No `driver-demo-001` remains in the touched surface

- [x] No hits under `apps/driver-app/` for `driver-demo-001`.
- [x] `shift.tsx` sources the driver id exclusively from `getDriverId()`
      (`shift.tsx:120, 161, 192`).
- [x] No transitive helper or fallback path reintroduces a hard-coded id
      (parent reviewer `Codex` confirmed at approval).

### AC-2 — Provisioned identity OR guarded unprovisioned state

- [x] Render-time guard: `shift.tsx:72`, render branch at `135-149`.
- [x] Loader guard: `shift.tsx:88-92`, `113`.
- [x] Submit handlers reach `getDriverClient()` only after the guard
      returned an `EmptyState` (the route never falls through to a submit
      while unprovisioned).
- [x] Re-evaluation on identity revocation was not required by parent
      acceptance; current single-render-read posture was accepted.

### AC-3 — Clock in/out use shared action buttons; stable active/offline layouts

- [x] `BottomActionBar` + `ActionButton` posture at `shift.tsx:375-395`.
- [x] Active and offline branches share the `AppScreen` + `PageHeader`
      header (`shift.tsx:272-284`) and only differ in the card body.
- [x] No `Text`-as-button or emoji status indicators remain.

### AC-4 — Odometer validation blocks invalid numeric input before submit

- [x] Integer-only regex and safe-integer ceiling at `shift.tsx:21-39`.
- [x] `FormField.error` surfaces validation copy live at `325` and `368`.
- [x] `ActionButton.disabled={hasValidationError}` at `382` and `391`.
- [x] Handlers re-check via `if (odometerError) Alert.alert(...)` before
      issuing the API call (`shift.tsx:152-155`, `183-186`).

### AC-5 (verification, from execution packet §192-211)

- [x] Parent commit body for `28c17ed` records the verification commands
      (`pnpm --filter @drts/driver-app typecheck`;
      `pnpm --filter @drts/driver-app test -- --run tests/unit/driver-identity-bootstrap.test.ts`).
- [x] Parent reviewer `Codex` approved closeout per `ai-status.json`
      (parent `last_update` `2026-05-05T01:57:47Z`, status `done`).
- [x] Parent commit + push evidence captured in `ai-status.json`
      (`commit_hash`: `28c17ed`, `commit_subject`:
      "DRV-MAT-006: materialize driver shift and attendance",
      push ref `origin/codex/dev-deploy-backend-android`).

---

## 4) Dependency Map

### 4.1 Formal Machine Dependency

| Dep           | Source                   | Status | Why It Matters                                                                                                                                                       |
| ------------- | ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-001` | `DRV-MAT-006.depends_on` | `done` | Provides `ActionButton`, `FormField`, `StatusChip`, `BottomActionBar`, `PageHeader`, `EmptyState`, `ErrorBanner`, `IconButton`, `AppScreen`, `Tokens`. All consumed. |

### 4.2 Practical Review Anchors

| ID    | Anchor                                                                                                                                         | Why It Matters                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D-P-1 | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:192-211`                                                              | Parent acceptance bullets and verification commands.                                                         |
| D-P-2 | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:267-288`                                                               | `/shift` target layout, required states, acceptance table.                                                   |
| D-P-3 | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:325, 372`                                                              | DRV-MAT-006 row in materialization plan and the "demo driver id" P0 risk.                                    |
| D-P-4 | `apps/driver-app/lib/api-client.ts:369, 470-478, 480-491`                                                                                      | `isDriverIdentityProvisioned`, `getDriverClient`, `getDriverId` throw semantics that `shift.tsx` relies on.  |
| D-P-5 | `apps/driver-app/lib/driver-identity-bootstrap.ts`                                                                                             | Existing app-level identity guard; verification target for AC-5.                                             |
| D-P-6 | `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts`                                                                                 | Existing identity-guard test the verification command exercises.                                             |
| D-P-7 | `apps/driver-app/components/ui/{ActionButton,FormField,StatusChip,BottomActionBar,PageHeader,EmptyState,ErrorBanner,IconButton,AppScreen}.tsx` | DRV-MAT-001 primitives reused on `/shift`.                                                                   |
| D-P-8 | `packages/contracts/src/index.ts:3648-3676`                                                                                                    | `ClockInCommand`, `ClockOutCommand`, `ShiftRecord` shape `shift.tsx` builds against (Claude2-lane interest). |
| D-P-9 | `packages/api-client/src/index.ts:1951-1985`                                                                                                   | `listShifts`, `clockIn`, `clockOut` adapter methods invoked by the screen.                                   |

### 4.3 Informative Consumer Map

| Consumer                   | Status    | Why It Matters                                                                                              |
| -------------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-010`              | `backlog` | Driver-app verification pack will inherit this task's evidence once it runs.                                |
| Parent owner `Codex2`      | `done`    | Already finalized parent slice with commit `28c17ed` and push to `origin/codex/dev-deploy-backend-android`. |
| Parent reviewer `Codex`    | `done`    | Already approved parent before closeout; parent now remains closed with no further action expected.         |
| Sidecar reviewer `Claude2` | `next`    | Receives the handoff for this sidecar; uses the packet to approve or reopen.                                |

---

## 5) Cross-Lane Notes (carrying forward the earlier Claude2 API/integration read)

These are observations from the API-integration lane that downstream
verification owners may want to confirm. They are **not** new acceptance
bars and do **not** reopen the parent.

1. **Contract alignment** — `shift.tsx` payloads at lines `163-168` and
   `194-198` send `driverId` plus optional `vehicleId` / `location` /
   `odometer`. That matches `ClockInCommand` / `ClockOutCommand`
   (`packages/contracts/src/index.ts:3648-3660`). Optional fields use the
   `value.trim() || undefined` pattern, which keeps zero-length strings out
   of the wire payload — preferred over emitting `""`.
2. **Adapter surface** — `getDriverClient().listShifts(driverId)` at
   `shift.tsx:119, 122` matches `packages/api-client/src/index.ts:1951`. No
   fallback or in-memory mock path is wired in this screen, which is correct
   for the productized slice.
3. **Identity throw fan-out** — `getDriverClient()` and `getDriverId()`
   throw if called while unprovisioned (`api-client.ts:472-477`,
   `488-491`). `shift.tsx` reaches them only inside `loadShifts` /
   `handleClockIn` / `handleClockOut`, all of which are mounted under the
   provisioned branch. The render-time `EmptyState` at `135-149` ensures
   the throw paths are unreachable on the happy unprovisioned flow. Worth
   recording so the verification pack does not request additional try /
   catch around helpers that would never throw in the live state machine.
4. **Replay / offline posture** — Unlike driver task completion (which
   uses `submitDriverTaskCompletion` / `replayPendingDriverTaskCompletion`
   for crash-safe replay), the shift screen does not persist pending clock
   in/out commands. That is consistent with parent acceptance, which
   scopes the slice to UX correctness rather than offline resilience.
   Flagging here so DRV-MAT-010 verification does not invent an offline-
   replay expectation that is not in the parent contract.
5. **Feature flag fail-open** — `isFeatureEnabled('driver-app.shift')`
   failures fall through to `loadShifts()` (`shift.tsx:106-109`). The
   design plan does not require fail-closed, so this is acceptable, but
   the verification owner should not regress this into a hard gate
   without an explicit acceptance change.

---

## 6) Evidence Inventory

| ID   | Evidence                                   | Location                                                                                                                                       |
| ---- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent task machine state                  | `ai-status.json` entry for `DRV-MAT-006` (status `done`, commit `28c17ed`, last_update `2026-05-05T01:57:47Z`)                                 |
| E-2  | Sidecar task machine state                 | `ai-status.json` entry for `DRV-MAT-006-SIDECAR-ACCEPTANCE`                                                                                    |
| E-3  | Parent execution instructions              | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:192-211`                                                              |
| E-4  | Product design acceptance posture          | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:267-288, 325, 372`                                                     |
| E-5  | Current `/shift` implementation snapshot   | `apps/driver-app/app/shift.tsx` at commit `28c17ed`                                                                                            |
| E-6  | Provisioned/unprovisioned identity helpers | `apps/driver-app/lib/api-client.ts:369, 470-478, 480-491`                                                                                      |
| E-7  | Existing identity bootstrap guard behavior | `apps/driver-app/lib/driver-identity-bootstrap.ts`                                                                                             |
| E-8  | Existing targeted identity tests           | `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts`                                                                                 |
| E-9  | Shared UI primitives landed by dependency  | `apps/driver-app/components/ui/{ActionButton,FormField,StatusChip,BottomActionBar,PageHeader,EmptyState,ErrorBanner,IconButton,AppScreen}.tsx` |
| E-10 | Shift contract surface                     | `packages/contracts/src/index.ts:3648-3676`                                                                                                    |
| E-11 | Shift adapter methods                      | `packages/api-client/src/index.ts:1951-1985`                                                                                                   |
| E-12 | Parent commit                              | `git show 28c17ed` (subject "DRV-MAT-006: materialize driver shift and attendance"; LLM-Agent: Codex2; Reviewer: Codex)                        |

---

## 7) Reviewer Hotspots (sidecar reviewer `Claude2`)

When reviewing this sidecar packet, prioritize:

1. The packet must reflect that parent `DRV-MAT-006` is already `done` under
   owner `Codex2` / reviewer `Codex` with commit `28c17ed` pushed at
   `2026-05-05T01:57:47Z`. It must not reopen, contradict, or redo that
   closeout — only describe it.
2. The packet must also reflect the refresh context correctly: this revision
   was prepared under owner / reviewer `Codex2` / `Claude2`, and the §9
   handoff should move the sidecar into `review` without changing any
   canonical truth.
3. The acceptance framing must trace to the canonical execution packet and
   design plan, not to this packet's own phrasing. Anchors D-P-1 and D-P-2
   are the higher-precedence sources.
4. The cross-lane integration notes must remain marked as observations against the
   committed surface, not new acceptance bars. If §5 reads as new
   requirements, reopen the sidecar.
5. The packet must not edit anything under `apps/driver-app/` or any L1/L2
   truth file. Only `support/sidecars/DRV-MAT-006/...` and the machine
   state via `scripts/ai_status.py` are in scope.
6. Line refs must align with the committed `shift.tsx` at `28c17ed`. Spot-
   check at least `isDriverIdentityProvisioned()` (line `72`),
   the unprovisioned `EmptyState` (`135-149`), `BottomActionBar` /
   `ActionButton` (`375-395`), and the `StatusChip "執勤中"` (`296`).
7. The sidecar may finalize without a code commit. Closeout uses
   `NO_COMMIT_REQUIRED=1` per the AI Collaboration Guide (sidecar
   acceptance packets are an explicit non-canonical case).

---

## 8) Sidecar Acceptance Checklist

### AC-S1 — `Create support artifacts only`

- [x] Only updates `support/sidecars/DRV-MAT-006/DRV-MAT-006-SIDECAR-ACCEPTANCE.md`.
- [x] Content is acceptance framing pinned to the committed parent slice,
      dependency map, baseline, and reviewer guidance — no new canonical
      truth.
- [x] No claim that this sidecar completed parent `/shift` implementation.

### AC-S2 — `Do not edit canonical truth`

- [x] No edits to `phase1_*.md`, `docs/02-architecture/...` design plan,
      `docs/03-runbooks/...` execution packet, or any code under
      `apps/`, `packages/`, `services/`, or `runtime/`.
- [x] Machine truth changes go through `scripts/ai-status.sh` /
      `scripts/ai_status.py` only.
- [x] All references in §2-§6 cite higher-precedence sources rather than
      restating product semantics.

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [x] The §9 handoff command is aligned to the current owner / reviewer pair
      (`Codex2` -> `Claude2`) and the current parent `done` snapshot.
- [ ] Reviewer `Claude2` may `approve` (sidecar passes) or `reopen` /
      `blocker` (with reason). Owner returns to revise if reopened.

---

## 9) Handoff Command

Owner (`Codex2`) -> Reviewer (`Claude2`)

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh handoff DRV-MAT-006-SIDECAR-ACCEPTANCE Claude2 \
  "Refreshed DRV-MAT-006 acceptance packet at support/sidecars/DRV-MAT-006/DRV-MAT-006-SIDECAR-ACCEPTANCE.md against current ai-status.json. Sidecar ownership/reviewer metadata now matches Codex2 -> Claude2; parent DRV-MAT-006 remains done under Codex2/Codex with commit 28c17ed pushed to origin/codex/dev-deploy-backend-android at 2026-05-05T01:57:47Z. Re-pinned shift.tsx anchors (isDriverIdentityProvisioned :72, unprovisioned EmptyState :135-149, StatusChip 執勤中 :296, BottomActionBar/ActionButton :375-395), corrected stale sidecar reviewer metadata, and kept the carried-forward integration notes explicitly observational rather than new acceptance. Support artifact only; no canonical truth was edited."
```

---

## 10) Notes For Downstream Consumers (`DRV-MAT-010` verification owner)

1. The parent slice is closed and committed. Treat the four formal
   acceptance bullets as landed contract; do not re-derive them in the
   verification pack.
2. The fail-open feature-flag posture (`shift.tsx:106-109`) is part of the
   accepted contract. Do not regress it into a hard gate during
   verification without an explicit acceptance change.
3. The render-time-only read of `isDriverIdentityProvisioned()`
   (`shift.tsx:72`) is consistent with the rest of the driver app and was
   accepted at parent closeout. Reactive re-evaluation on revocation is a
   future scope discussion, not a verification finding.
4. Parent acceptance does not require offline replay for shift commands;
   the verification pack (`DRV-MAT-010`) should not invent that
   requirement.
5. Verification commands recorded in the parent commit body are
   `pnpm --filter @drts/driver-app typecheck` and
   `pnpm --filter @drts/driver-app test -- --run tests/unit/driver-identity-bootstrap.test.ts`.
   Re-run them against the verification commit, not against this sidecar.
