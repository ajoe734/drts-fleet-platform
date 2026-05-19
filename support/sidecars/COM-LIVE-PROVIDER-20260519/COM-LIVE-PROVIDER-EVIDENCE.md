# WF-COM-001-LIVE-PROVIDER — CTI Live Provider Hold-State Evidence

**Task:** `WF-COM-001-LIVE-PROVIDER`  
**Owner:** `Codex`  
**Reviewer:** `Claude`  
**Collected:** `2026-05-19 (UTC)`  
**Status:** `blocked / HOLD confirmed`

---

## 1. Executive Summary

This packet records the current hold state for real CTI provider activation in
Phase 1 v3.

Current result on `2026-05-19`:

- `WF-COM-001-LIVE-PROVIDER` remains `HOLD`.
- No live CTI provider environment or activated webhook path is available in
  this repo session.
- The blocker is external, not repo-local:
  - provider or approved stub environment is still missing
  - callback contract and webhook security proof are still missing
  - no fresh callback sample, filing run, or recording export artifact exists
- `COM-BLUEPRINT-001` is already `done` at closeout commit `9373084`; it
  consolidates the design and prior evidence, but it does not itself activate
  the provider.

Conclusion:

- This task can record the current blocked posture and point to the existing
  gate evidence.
- It cannot advance to live verification without CTI provider activation and
  webhook-environment readiness outside repo-only control.

---

## 2. Canonical Inputs Reviewed

### 2.1 Planning / dispatch truth

`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
places `WF-COM-001-LIVE-PROVIDER` in the `HELD (external)` group with the
explicit note: CTI provider activation and webhook environment are required
before execution can resume.

### 2.2 External-gate truth

`support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` remains the
binding gate packet for CTI callback, recording export, filing activation, and
the end-to-end phone-booking-to-compliance evidence chain.

The packet still lists these open external blockers:

- `EXT-004-BLK-001` provider or approved stub environment
- `EXT-004-BLK-002` callback contract approval
- `EXT-004-BLK-003` webhook security controls
- `EXT-004-BLK-004` staging callback run evidence
- `EXT-004-BLK-005` filing scheduler activation
- `EXT-004-BLK-006` recording export activation
- `EXT-004-BLK-007` retention / access sign-off
- `EXT-004-BLK-008` end-to-end live or staging run

### 2.3 Latest prior live-evidence snapshot

`support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md` is the latest
task-scoped evidence pack touching the same CTI / recording / filing rail.

That packet already concluded:

- `WF-COM-001` must stay `HOLD`
- no live callback or filing endpoint was reached
- no callback sample, recording export manifest, filing manifest, or signed
  download evidence was collected

This task found no newer artifact that supersedes those conclusions.

### 2.4 Dependency status

`COM-BLUEPRINT-001` is currently `done` in `ai-status.json`, with closeout
commit `9373084` on `origin/codex2/com-blueprint-001`.

Its scope is blueprint consolidation for CTI / recording / filing. That
completed dependency documents the seam, but it does not satisfy the live
provider activation prerequisite required by `WF-COM-001-LIVE-PROVIDER`.

### 2.5 Latest unblock resolution

`WF-COM-001-LIVE-PROVIDER-UNBLOCK-PLANNING-DECISION` is already `done` in
canonical machine truth, with commit `981a417` on
`origin/codex/wf-com-001-live-provider-unblock-planning-decision`.

That helper closed the remaining repo-side planning question: approved CTI
stub or sandbox proof may preserve the base `WF-COM-001` evidence posture, but
it does not clear this live-provider follow-on. The remaining gate is external
activation and evidence only under `EXT-004-BLK-001` through
`EXT-004-BLK-008`.

---

## 3. What Is Still Missing

| Missing item | Why it matters | Current state on 2026-05-19 |
| --- | --- | --- |
| Provider or approved stub environment | Needed to send a real callback into the DRTS endpoint | Missing |
| Callback payload contract | Needed to validate required fields, idempotency, and retry semantics | Missing |
| Webhook security details | Needed before exposing a live callback path | Missing |
| Reachable callback evidence | Needed to prove pending-to-bound recording transition | Missing |
| Filing scheduler run | Needed to prove filing-package activation | Missing |
| Recording export artifact | Needed to prove `call_id` / masked `recording_id` output | Missing |
| Retention and access sign-off | Needed for production-grade evidence handling claims | Missing |
| End-to-end proof packet | Needed to tie phone booking, callback, export, and filing together | Missing |

---

## 4. Release-Gate Read

Allowed current claim:

- "`WF-COM-001-LIVE-PROVIDER` remains `HOLD` pending CTI provider activation
  and webhook-environment readiness."

Not allowed:

- "CTI provider activation is live-verified."
- "Recording callback is production-ready."
- "Filing activation is proven."
- "Phone booking to compliance export passed end-to-end."

---

## 5. Resume Conditions

This task can move out of `HOLD` only after the following inputs exist:

1. Reachable CTI provider or approved stub endpoint
2. Approved callback schema and retry/idempotency contract
3. Approved webhook security controls
4. Redacted callback sample proving pending-to-bound recording transition
5. Filing scheduler run evidence and manifest hash
6. Recording export artifact with required fields
7. Signed evidence-retention / access control confirmation
8. End-to-end packet that ties the above artifacts together

Until then, the correct machine-truth state is `blocked`.

---

## 6. Verification Notes

Verification in this task was source review only:

- reviewed the v3 planning runbook
- reviewed `EXT-004` blocker packet
- reviewed the prior `COM-LIVE-001` evidence pack
- reviewed current `ai-status.json` dependency state

No live provider probe, webhook delivery, filing run, or export job was
executed in this task because the required external environment is still absent.
