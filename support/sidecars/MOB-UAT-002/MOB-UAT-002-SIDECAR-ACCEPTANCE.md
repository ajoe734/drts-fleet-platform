# MOB-UAT-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `MOB-UAT-002` — iOS physical-device UAT  
**Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Claude`  
**Parent Owner / Reviewer:** `Claude` / `Claude2`  
**Generated:** `2026-06-20` (UTC)  
**Snapshot Status:** Parent `MOB-UAT-002` is `blocked` in machine truth (`last_update: 2026-06-20T16:27:16Z`) because the real acceptance target is an iPhone/TestFlight/human-run evidence pack. This sidecar is support-only and does not change that posture.

> **Provenance.** The operator-fillable iOS scaffold already exists upstream as commit
> `553492bc5` on branch `origin/claude/mob-uat-002`
> (`docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md`).
> That commit is **not** an ancestor of this sidecar branch, so this packet cites it
> as upstream context rather than editing or re-homing it. The two formal
> dependencies from the task brief, `MOB-APP-003` (`643257bcd`) and `MOB-APP-004`
> (`7f7e97d0e`), **are** ancestors of the current `HEAD` and are mapped below to
> concrete code/test anchors.

---

## 1. Scope Boundary

本 sidecar 只整理 `MOB-UAT-002` 的 acceptance checklist、dependency map、repo
evidence anchors、與 reviewer handoff wording。

- In scope: a reviewer-facing support packet under `support/sidecars/MOB-UAT-002/`,
  the parent-task acceptance framing, and the dependency/evidence map for the iOS
  UAT slice.
- Out of scope: editing `docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md`,
  changing `apps/driver-app/*`, changing `docs/02-architecture/*` canonical truth,
  claiming a real-device PASS, or clearing the parent task's `external_blocked`
  condition.

---

## 2. Current State Baseline

### 2.1 Machine-truth snapshot

- Parent `MOB-UAT-002` is currently `blocked`, owner `Claude`, reviewer `Claude2`.
- Parent acceptance remains:
  `iOS evidence pack produced on a real device (human/TestFlight); not auto-completable`.
- Parent `next` already records the key fact pattern: upstream scaffold commit
  `553492bc5` exists, but the remaining acceptance is a physical-device/human step.
- This helper task `MOB-UAT-002-SIDECAR-ACCEPTANCE` is `in_progress`, owner `Codex`,
  reviewer `Claude`, and is explicitly marked `mutates_canonical=false`.

### 2.2 Dependency lookup note

The task brief names `MOB-APP-003` and `MOB-APP-004` as formal dependencies.
However, `scripts/ai-status.sh show MOB-APP-003` and `... MOB-APP-004` currently
return `Task not found` in this board snapshot. This packet therefore records those
dependencies from:

- landed commit ancestry in the current repo state
- source-file anchors in `apps/driver-app/`
- unit-test anchors that pin the expected behavior

This is intentional and avoids inventing machine-truth status that is not present
in the current status board slice.

### 2.3 Canonical / accepted anchors

- SD §11.4 `UAT-MOB-IOS-001` defines the iOS acceptance shape:
  Android-parity flow plus `Low Power Mode`, `iOS background indicator`,
  `OS termination`, `user force quit limitation`, and `reopen recovery`.
- `553492bc5:docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md`
  is the accepted upstream scaffold for the human/TestFlight operator.
- [`docs/04-uat/mob-uat-001-android-physical-device-evidence-pack-20260620.md`](../../../docs/04-uat/mob-uat-001-android-physical-device-evidence-pack-20260620.md)
  is the direct base-parity precedent for the non-iOS-specific scenario family.
- [`apps/driver-app/app.json`](../../../apps/driver-app/app.json) fixes the iOS
  distribution/runtime baseline used by the scaffold:
  `bundleIdentifier`, `buildNumber`, `UIBackgroundModes:["location"]`, and
  `isIosBackgroundLocationEnabled: true`.

---

## 3. Acceptance Checklist

### 3.1 Sidecar task acceptance

| Sidecar acceptance | Current packet state | Notes |
| --- | --- | --- |
| `Create support artifacts only` | `PASS` | This sidecar adds only `support/sidecars/MOB-UAT-002/MOB-UAT-002-SIDECAR-ACCEPTANCE.md`. |
| `Do not edit canonical truth` | `PASS` | No `docs/02-architecture/*`, `docs/05-ui/*`, runtime, or registry files are changed by this helper. |
| `Hand off the packet to the assigned reviewer` | `READY` | Owner handoff is the final workflow step after artifact validation and branch update. |

### 3.2 Parent acceptance framing

| Parent acceptance | Current baseline | What still must happen |
| --- | --- | --- |
| `iOS evidence pack produced on a real device (human/TestFlight); not auto-completable` | Upstream scaffold exists at `553492bc5`, but there is no honest real-device PASS in this sidecar branch. | A human or TestFlight operator must run the scaffold on a physical iPhone, attach captures, and record sign-off. |

### 3.3 Scenario-family checklist for reviewer sanity

This sidecar should be read as a packaging/checklist artifact, not a replacement for
the upstream iOS scaffold.

| Scenario family | Repo-backed expectation | Human evidence still required |
| --- | --- | --- |
| Permissions / pre-online gate | `MOB-APP-003` gate logic + shift-screen surfacing | Screenshots/video of `When In Use` vs `Always` and the blocking/clear states on iPhone |
| Online available / background tracking | `driver-location-heartbeat.ts` cadence + `app.json` iOS background entitlement | Screen recording + Ops/API confirmation that heartbeats continue while backgrounded |
| App killed / OS termination / reopen recovery | `MOB-APP-004` marker persistence + honest gap reporting | Real-device kill/reopen/termination evidence showing resumed session and surfaced gap |
| Network switch / 5-minute offline | durable queue + ordered replay path | Real-device connectivity toggles and replay evidence |
| iOS-specific deltas | Low Power Mode, background indicator, force-quit limitation | iPhone-only captures; cannot be honestly simulated from this worker |

---

## 4. Dependency Map

### 4.1 Formal upstream dependencies from the task brief

| Dep | Evidence anchor | Current state in this repo snapshot | Why it matters to `MOB-UAT-002` |
| --- | --- | --- | --- |
| `MOB-APP-003` | commit `643257bcd`; [`apps/driver-app/lib/driver-online-gate.ts`](../../../apps/driver-app/lib/driver-online-gate.ts); [`apps/driver-app/app/shift.tsx`](../../../apps/driver-app/app/shift.tsx); [`apps/driver-app/tests/unit/shift-screen-gate.test.ts`](../../../apps/driver-app/tests/unit/shift-screen-gate.test.ts) | Landed and reachable from current `HEAD`; machine-truth lookup for the task id is absent in this board slice | Defines the four pre-online checks and the user-facing reason/action copy that the iOS operator must verify when foreground/background permission or device/identity state blocks `online_available` |
| `MOB-APP-004` | commit `7f7e97d0e`; [`apps/driver-app/lib/driver-tracking-recovery.ts`](../../../apps/driver-app/lib/driver-tracking-recovery.ts); [`apps/driver-app/lib/driver-identity-bootstrap.ts`](../../../apps/driver-app/lib/driver-identity-bootstrap.ts); [`apps/driver-app/tests/unit/driver-tracking-recovery.test.ts`](../../../apps/driver-app/tests/unit/driver-tracking-recovery.test.ts) | Landed and reachable from current `HEAD`; machine-truth lookup for the task id is absent in this board slice | Defines restart recovery, honest gap detection, reopened-session behavior, and the no-fabrication rule that the iOS operator must confirm on force-quit / OS-termination scenarios |

### 4.2 Practical review anchors

These are not the formal `depends_on` list for the sidecar task, but they are part
of the reviewer's evidence chain.

| Anchor | Role in the acceptance packet |
| --- | --- |
| `553492bc5:docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md` | Upstream operator-fillable iOS scaffold; the sidecar packages and summarizes it without moving or editing it |
| [`docs/04-uat/mob-uat-001-android-physical-device-evidence-pack-20260620.md`](../../../docs/04-uat/mob-uat-001-android-physical-device-evidence-pack-20260620.md) | Base-parity precedent for install / permissions / online available / background / kill-reopen / offline / full lifecycle |
| [`apps/driver-app/app.json`](../../../apps/driver-app/app.json) | iOS bundle id, build number, background entitlement, and location-permission prompt copy |
| commit `3380b2644` (`MOB-APP-001`) referenced by the upstream scaffold | Heartbeat cadence baseline for `online_available`, background continuity, and Low Power Mode expectations |
| commit `f12630b4d` (`MOB-APP-002`) referenced by the upstream scaffold | Durable offline queue / ordered replay baseline for network switch and 5-minute offline scenarios |
| SD §11.4 `UAT-MOB-IOS-001` | Higher-precedence scenario contract that prevents the sidecar from inventing or dropping iOS-specific checks |

### 4.3 Parent-task relationship

| Item | State | Why it matters |
| --- | --- | --- |
| Parent `MOB-UAT-002` | `blocked` | This sidecar must preserve the `external_blocked` posture rather than pretending the packet clears the real-device gate |
| Upstream scaffold commit `553492bc5` | branch-only upstream context | The reviewer should treat the sidecar as an index/handoff packet for that scaffold, not as a substitute scaffold |
| This helper task | support-only | The closeout target is a reviewer-approved packet, not a runtime or canonical-truth change |

---

## 5. Reviewer Focus

When `Claude` reviews this sidecar, prioritize the following:

1. The packet must remain support-only. No claim of iOS PASS, no mutation of
   canonical truth, and no change to the parent task's blocked posture.
2. The dependency map must keep `MOB-APP-003` and `MOB-APP-004` as the formal
   upstream dependencies from the task brief, while accurately noting that their
   current machine-truth task slices are absent from this board snapshot.
3. The packet must not drop any `UAT-MOB-IOS-001` scenario family:
   base parity plus `Low Power Mode`, `background indicator`, `OS termination`,
   `force quit limitation`, and `reopen recovery`.
4. The packet should steer the next reviewer/operator to the upstream scaffold
   commit `553492bc5` instead of reauthoring the scaffold in another location.
5. The artifact path must stay limited to `support/sidecars/MOB-UAT-002/`.

Suggested approval wording:

> `MOB-UAT-002 acceptance packet ready: it preserves the parent's external-blocked
> real-device posture, maps the formal dependencies MOB-APP-003 and MOB-APP-004 to
> landed code/test anchors, and packages the iOS scaffold + scenario checklist for
> reviewer/operator handoff without mutating canonical truth.`

Suggested reopen wording:

> `packet needs revision: [specify dropped scenario / dependency-map mismatch /
> blocked-posture drift / scope violation]`

---

## 6. Handoff Commands

### Owner -> reviewer

```bash
AI_NAME=Codex scripts/ai-status.sh handoff MOB-UAT-002-SIDECAR-ACCEPTANCE Claude "MOB-UAT-002 acceptance packet is ready at support/sidecars/MOB-UAT-002/MOB-UAT-002-SIDECAR-ACCEPTANCE.md. It preserves the parent task's external-blocked real-device posture, maps MOB-APP-003 and MOB-APP-004 to landed code/test anchors, and packages the upstream iOS scaffold plus reviewer checklist without editing canonical truth."
```

### Reviewer -> approve

```bash
AI_NAME=Claude scripts/ai-status.sh approve MOB-UAT-002-SIDECAR-ACCEPTANCE "MOB-UAT-002 acceptance packet ready: parent remains external-blocked pending real-device iPhone/TestFlight evidence, while the support packet cleanly maps MOB-APP-003 and MOB-APP-004 to the iOS scaffold and reviewer checklist without mutating canonical truth."
```

### Owner closeout after review approval

Use the branch commit/push evidence for this sidecar artifact and finalize with
`INTEGRATION_STATUS=not_applicable`, because this is a support-only helper task
rather than a runtime publish to `dev`.

---

## 7. Notes For The Parent Owner

- The parent task is still blocked for the right reason: the missing step is a
  real iPhone/TestFlight run, not more repo drafting.
- The upstream scaffold commit `553492bc5` already defines the operator capture
  checklist. This sidecar should reduce reviewer lookup cost, not fork the scaffold.
- If the parent owner re-opens repo work later, the correct follow-up is to attach
  real-device evidence to the existing scaffold family, not to claim a synthetic PASS
  from static repo evidence alone.
