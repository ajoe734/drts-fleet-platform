# Driver Mobile Real-Device Test Report — 2026-05-19

**Task:** `DRV-DEVICE-001`  
**Owner:** `Codex2`  
**Reviewer:** `Codex`  
**Date:** `2026-05-19`  
**Depends on:** `TST-E2E-006-DRV-MP`  
**Artifact status:** `provisional`  
**Overall read:** `human-in-the-loop evidence still required`

## 1. Executive Summary

This report records the current evidence state for Android and iPhone real-device
verification of the Phase 1 driver app covering login, device binding, platform
presence, task notify, accept, route intent, proof, earnings, and weak-network
recovery.

As of `2026-05-19`, this repo session did **not** have fresh Android or iPhone
install logs, screenshots, screen recordings, or operator notes proving those
flows were executed on physical devices. The repo **does** contain strong
repo-local and static evidence that the underlying flows are implemented and
covered by unit/E2E/runbook artifacts, but mobile install/distribution remains
externally gated by `EXT-003`, especially `EXT-003-BLK-007` (install evidence).

The correct interpretation is therefore:

- `login / binding / presence / accept / route intent / proof / earnings / weak network`
  all have meaningful repo-backed evidence.
- `Android real-device pass` and `iPhone real-device pass` cannot yet be claimed.
- `task notify` should be split into in-app notification state versus native push.
  The current repo shows in-app counters/preferences, but does not show
  `expo-notifications` or a mobile push-token integration. Native push delivery
  should remain `NOT VERIFIED`.

## 2. Evidence Baseline

| Area | Current read | Repo / task anchors | Notes |
| --- | --- | --- | --- |
| App install and first launch | `BLOCKED` | `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md` | External gate requires Expo access, Apple/Android signing, tester group, and install evidence. |
| Login and device registration | `STATIC EVIDENCE` | `docs/03-runbooks/driver-app-native-dev-runbook.md`, `P1PX-DRV-001` (`83a3e4c`), `ORX-ID-001` (`cfac905`) | Production posture is backend-issued device-bound auth, not demo fallback. |
| Device refresh / revoke / rebind | `STATIC EVIDENCE` | `ORX-ID-001` (`cfac905`), `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts` | Revoked or suspended sessions are expected to return to onboarding. |
| Platform presence / online-offline | `STATIC EVIDENCE` | `WC-002` (`a2b81cf`), `DRV-MAT-007` (`b7e14a4`) | Per-platform toggle, token expiry, re-auth, and zh-TW status UX are already productized. |
| Platform account bind / unbind | `STATIC EVIDENCE` | `WC-003` (`c66b9a0`), `DRV-MAT-009` (`c13cbf4`) | Binding surface exists in shared component flow. |
| Task inbox / accept / route intent | `STATIC EVIDENCE` | `DRV-MAT-003` (`a479ab6`), `DRV-MAT-004` (`7fc93c3`), `TST-E2E-006-DRV-MP` (`b2c47fa`) | Owned and forwarded task flows are covered in repo artifacts. |
| Task notify | `PARTIAL STATIC EVIDENCE` | `apps/driver-app/app/index.tsx`, `apps/driver-app/app/onboarding.tsx`, `apps/driver-app/app/settings.tsx` | In-app counts/preferences exist. Native push delivery is not evidenced in this repo session. |
| Proof / completion requirements | `STATIC EVIDENCE` | `apps/driver-app/tests/unit/completion-proof.test.ts`, `apps/driver-app/tests/unit/use-pending-completion-replay.test.ts`, `docs/04-uat/phase1-uat-scenarios.md` DA-007~DA-009 | Negative paths are contract-backed. |
| Earnings by platform | `STATIC EVIDENCE` | `DRV-MAT-008` (`e4edb86`), `TST-E2E-006-DRV-MP` (`b2c47fa`) | Platform-broken-down earnings are present in UI and E2E scope. |
| Weak-network completion replay | `STATIC EVIDENCE` | `docs/03-runbooks/driver-app-native-dev-runbook.md`, `apps/driver-app/tests/unit/pending-completion-replay.test.ts`, `apps/driver-app/tests/unit/use-pending-completion-replay.test.ts` | Replay/idempotency path is covered repo-locally; no fresh real-device network-conditioning evidence is attached. |

## 3. Scenario Matrix

Status legend used here:

- `PASS`: real-device evidence attached in this report
- `FAIL`: real-device execution happened and failed
- `BLOCKED`: environment or credentials prevent execution
- `NOT RUN`: no credible evidence that the scenario was executed on that device family
- `STATIC EVIDENCE`: repo/unit/E2E/runbook evidence exists, but not a live device pass

| ID | Flow | Android | iPhone | Evidence anchor | Gap to close |
| --- | --- | --- | --- | --- | --- |
| `RD-01` | Install build and cold launch | `BLOCKED` | `BLOCKED` | `EXT-003-BLK-001` to `EXT-003-BLK-007` | Need build URL/hash, install log, and first-launch capture on both device families. |
| `RD-02` | Login / register device with code | `NOT RUN` + `STATIC EVIDENCE` | `NOT RUN` + `STATIC EVIDENCE` | Native runbook production identity handoff; `P1PX-DRV-001`; `ORX-ID-001` | Need video or screenshot proof of registration form, successful bind, and persisted session. |
| `RD-03` | Relaunch refreshes existing binding | `NOT RUN` + `STATIC EVIDENCE` | `NOT RUN` + `STATIC EVIDENCE` | `ORX-ID-001`; `driver-identity-bootstrap.test.ts` | Need app relaunch proof showing refresh succeeds without re-registration. |
| `RD-04` | Revoked / suspended binding returns to onboarding | `NOT RUN` + `STATIC EVIDENCE` | `NOT RUN` + `STATIC EVIDENCE` | `ORX-ID-001` handoff + tests | Need admin revoke or suspend action plus device-side redirect evidence. |
| `RD-05` | Platform presence online/offline toggle | `NOT RUN` + `STATIC EVIDENCE` | `NOT RUN` + `STATIC EVIDENCE` | `WC-002`; `DRV-MAT-007` | Need screen recording or screenshots before/after toggle and API success evidence. |
| `RD-06` | Token expiry warning and re-auth | `NOT RUN` + `STATIC EVIDENCE` | `NOT RUN` + `STATIC EVIDENCE` | `WC-002`; `WC-003` | Need near-expiry fixture and successful re-auth proof on device. |
| `RD-07` | Bind / unbind platform account | `NOT RUN` + `STATIC EVIDENCE` | `NOT RUN` + `STATIC EVIDENCE` | `WC-003`; `DRV-MAT-009` | Need device capture of bind success and unbind removal. |
| `RD-08` | Task-assigned notify | `NOT VERIFIED` | `NOT VERIFIED` | `docs/04-uat/phase1-uat-scenarios.md` DA-002; in-app notification counters in `/onboarding` and `/` | Need explicit decision whether this task accepts in-app polling/badge only, or requires native push. Current repo has no push-SDK evidence. |
| `RD-09` | Accept owned task | `NOT RUN` + `STATIC EVIDENCE` | `NOT RUN` + `STATIC EVIDENCE` | `TST-E2E-006-DRV-MP`; `DRV-MAT-003`; `DRV-MAT-004` | Need live task assignment and accept proof on device. |
| `RD-10` | Forwarded task route intent / route lock | `BLOCKED` + `STATIC EVIDENCE` | `BLOCKED` + `STATIC EVIDENCE` | `TST-E2E-006-DRV-MP`; `docs/04-uat/fbp-014a-e2e-matrix.md` E2E-002 | Needs seeded forwarded task or live adapter data; current read remains external-gated. |
| `RD-11` | Proof negative paths: min photos / signoff / expense proof | `NOT RUN` + `STATIC EVIDENCE` | `NOT RUN` + `STATIC EVIDENCE` | `completion-proof.test.ts`; UAT DA-007~DA-009 | Need device-side attempt captures and backend response proof. |
| `RD-12` | Earnings by platform | `NOT RUN` + `STATIC EVIDENCE` | `NOT RUN` + `STATIC EVIDENCE` | `DRV-MAT-008`; `TST-E2E-006-DRV-MP` | Need live screenshot showing gross / fee / subsidy / net by platform. |
| `RD-13` | Weak-network completion replay and no duplicate completion | `NOT RUN` + `STATIC EVIDENCE` | `NOT RUN` + `STATIC EVIDENCE` | Native runbook checklist items 10-11; pending-replay tests | Need network-conditioning run plus request-id / backend trace proof showing single completion result. |

## 4. Specific Findings

### 4.1 Login / device binding

- The current driver app posture is app-auth-first with direct API access, not
  Cloud IAP.
- Device registration, persisted session refresh, revoke, suspend-aware
  invalidation, and rebind semantics are already documented and tested.
- No fresh physical-device capture is attached in this task for either Android
  or iPhone.

### 4.2 Platform presence

- Repo evidence supports:
  - per-platform online/offline toggle
  - token expiry countdown
  - re-auth entrypoint
  - eligibility display
  - shared zh-TW platform status card
- This remains `STATIC EVIDENCE` until a real device shows the full loop with
  state transition and post-refresh UI.

### 4.3 Task notify

- The UAT scenario pack expects a `task_assigned` notification before accept.
- The current driver app clearly exposes notification counts and notification
  preference toggles.
- This worktree does **not** show `expo-notifications`, push-token registration,
  or native push permission handling in `apps/driver-app/package.json` or the
  current app sources.
- Therefore the honest read is:
  - in-app reminder / badge posture exists
  - native push delivery is not proven and should not be claimed in this report

### 4.4 Route intent / forwarded tasks

- Route-locked and `sourcePlatform` behavior is already part of
  `TST-E2E-006-DRV-MP` and the E2E-002 matrix.
- That flow is still externally gated when the environment lacks seeded
  forwarded tasks or live adapter data.

### 4.5 Proof and weak network

- Completion proof guardrails are already wired for:
  - `MIN_PHOTO_COUNT_NOT_MET`
  - `PROOF_REQUIRED`
  - `EXPENSE_PROOF_REQUIRED`
- Pending completion replay exists specifically to survive transient failure and
  reuse the same request id.
- The runbook also requires revoked/expired identity to interrupt replay and
  route the driver back to onboarding.
- All of that is strong repo evidence, but there is no fresh Android/iPhone
  network-conditioning capture in this task.

## 5. Repo-Local Verification Run

The following commands were executed in this repo session to support this
report. These are **not** substitutes for physical-device UAT, but they confirm
the local implementation and scripted evidence remain coherent.

| Command | Expected role | Result |
| --- | --- | --- |
| `pnpm --filter @drts/driver-app typecheck` | Driver app compile/type safety baseline | `BLOCKED IN THIS WORKTREE` — `tsc: not found`; `pnpm` reports local `package.json` exists but `node_modules` are missing. |
| `pnpm --filter @drts/driver-app test -- --runInBand` | Driver app unit suite over identity, proof, trip, replay, and UI primitives | `BLOCKED IN THIS WORKTREE` — `vitest: not found`; same missing-`node_modules` condition. |
| `pnpm --filter @drts/api exec vitest run tests/unit/auth-bootstrap.test.ts tests/unit/driver-profile.service.test.ts` | Backend device-binding / auth refresh support evidence | `BLOCKED IN THIS WORKTREE` — `Command "vitest" not found`; same missing-`node_modules` condition. |
| `bash -n tests/e2e/E2E-001-enterprise-dispatch.sh tests/e2e/E2E-002-forwarded-order.sh tests/e2e/E2E-004-tenant-attribution.sh tests/e2e/run-e2e.sh` | E2E script syntax sanity | `PASS` |
| `./tests/e2e/run-e2e.sh --dry-run` | Cross-surface E2E scaffold continuity check | `PASS` — dry-run listed `E2E-001`, `E2E-002`, and `E2E-004`. |

## 6. Blocking Items

The main blockers preventing a `PASS` read for Android and iPhone real-device
verification are:

1. `EXT-003-BLK-007` install evidence is still missing.
2. Expo / Apple / Android signing and tester-group evidence are not attached in
   this repo session.
3. Forwarded-task real-device validation still depends on seeded or live
   adapter data.
4. Native push-notification proof is absent; current repo evidence only supports
   in-app notification state.
5. No fresh human-executed screenshots, recordings, or operator notes are filed
   under `docs/04-uat/` or `support/sidecars/` for this task.
6. Repo-local `pnpm` verification that depends on `tsc` / `vitest` is blocked in
   this isolated worktree because `node_modules` are not present.

## 7. Required Human Follow-Up To Convert This Report To PASS

To upgrade this report from `provisional` to a true real-device pass, attach:

1. Android install artifact + install log + first-launch screenshot.
2. iPhone install artifact/TestFlight-or-dev-client proof + first-launch
   screenshot.
3. Registration/binding evidence on both device families.
4. Platform presence toggle and re-auth capture on at least one bound platform.
5. One owned task accept flow and one forwarded-task route-locked flow.
6. One completion negative-path proof sample and one successful completion
   replay-under-weak-network sample with request-id continuity.
7. One earnings-by-platform capture after task completion.
8. An explicit note whether `task notify` is satisfied by in-app refresh/badge
   only or whether native push is a release requirement.
