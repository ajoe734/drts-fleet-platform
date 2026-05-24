# WF-FWD-001-LIVE-SANDBOX — Forwarder Live Sandbox Hold-State Evidence

**Task:** `WF-FWD-001-LIVE-SANDBOX`  
**Owner:** `Codex`  
**Reviewer:** `Codex2`  
**Collected:** `2026-05-24 (UTC)`  
**Status:** `blocked / HOLD confirmed`

---

## 1. Executive Summary

This packet records the current hold state for the Phase 1 v3 forwarder live
sandbox proof task.

Current result on `2026-05-24`:

- `WF-FWD-001-LIVE-SANDBOX` remains `HOLD`.
- No real partner sandbox credentials, webhook-signing package, or seeded live
  forwarded-task flow is available in this repo session.
- The remaining blocker is external, not repo-local:
  - `FWD-SPEC-001` is already `done` at `f249aec` on `origin/codex2/fwd-spec-001`
  - `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-MANUAL-UNBLOCK` is already `done` at
    `2ada71ea` on
    `origin/codex2/wf-fwd-001-live-sandbox-unblock-manual-unblock`
  - `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION` is already `done` at
    `c215f93` on
    `origin/codex2/wf-fwd-001-live-sandbox-unblock-planning-decision`
- The unresolved gate is still the external sandbox package tracked by
  `EXT-002-BLK-001` through `EXT-002-BLK-007`.

Conclusion:

- This task can only refresh the held-state evidence.
- It cannot claim live sandbox proof until the partner package arrives.

---

## 2. Canonical Inputs Reviewed

### 2.1 Planning / dispatch truth

`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
keeps `WF-FWD-001-LIVE-SANDBOX` in the `HELD` external-resource group with the
explicit note that real partner platform sandbox credentials are required.

### 2.2 Dependency truth

`FWD-SPEC-001` is `done` in canonical machine truth.

Its formal proof-boundary artifact is
`docs/02-architecture/forwarder-adapter-proof-spec-20260519.md` on
`origin/codex2/fwd-spec-001@f249aec`.

This task does not duplicate that dependency artifact into the current branch;
it only records the held live-sandbox posture that remains after the dependency
is complete.

### 2.3 External-gate truth

`support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` remains the
binding gate packet for:

- `EXT-002-BLK-001` approved partner API contract authority
- `EXT-002-BLK-002` sandbox credentials and network reachability
- `EXT-002-BLK-003` webhook-signing and replay-protection details
- `EXT-002-BLK-004` live forwarded-task seed or inbound order
- `EXT-002-BLK-005` callback lifecycle evidence
- `EXT-002-BLK-006` duplicate / stale / lost-race evidence
- `EXT-002-BLK-007` no-owned-assignment live proof

### 2.4 Latest prior live-evidence snapshot

`support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` is still the
latest task-scoped live probe packet for the same workflow family.

That packet already concluded:

- the shipped adapter remains stub-only
- no reachable live sandbox path was available from the evidence session
- `WF-FWD-001` must stay `EXTERNAL-GATED`

This task found no newer partner-issued evidence that supersedes those
conclusions.

### 2.5 Helper-task truth

Both unblock helpers are already complete in canonical machine truth:

- manual unblock closed the repo-side diagnosis and confirmed the remaining
  blocker is external sandbox sourcing
- planning unblock closed the remaining repo-internal contract-routing question
  and left the parent purely external-gated

The concrete parent resume path is unchanged: wait for the partner sandbox
package, then re-run the live forwarder evidence flow in staging.

---

## 3. What Is Still Missing

| Missing item | Why it matters | Current state on 2026-05-24 |
| --- | --- | --- |
| Approved partner API contract | Needed to prove endpoint, payload, idempotency, and callback authority | Missing |
| Sandbox credentials and reachable endpoint | Needed to authenticate and reach the partner sandbox | Missing |
| Webhook signing package | Needed to verify signature, timestamp window, and replay rules | Missing |
| Live forwarded-task seed or inbound order | Needed to exercise the route-locked external task path | Missing |
| Callback lifecycle logs | Needed to prove accept / reject / cancel / complete / status sync | Missing |
| Lost-race and duplicate evidence | Needed to prove stale and out-of-order callback handling | Missing |
| No-owned-assignment proof | Needed to prove forwarded tasks never create owned dispatch truth | Missing |

---

## 4. Release-Gate Read

Allowed current claim:

- "`WF-FWD-001-LIVE-SANDBOX` remains `HOLD` pending the external partner
  sandbox package tracked by `EXT-002-BLK-001` through `EXT-002-BLK-007`."

Not allowed:

- "Forwarder live sandbox passed."
- "Grab Taiwan adapter is production-ready."
- "The forwarder external gate is closed."
- "A fresh live probe was completed in this task."

---

## 5. Resume Conditions

This task can move out of `HOLD` only after the partner sandbox package exists
with the inputs named in `EXT-002-BLK-001` through `EXT-002-BLK-007`.

When those inputs arrive:

1. configure the sandbox credentials and webhook secret in the target staging environment
2. re-run the forwarder live evidence flow using `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
3. replace this held-state snapshot with dated partner-path execution evidence

Until then, the correct machine-truth posture is `blocked / HOLD`.

---

## 6. Verification Notes

Verification in this task was source review only:

- reviewed canonical machine truth for `FWD-SPEC-001` and the two unblock helpers
- reviewed the v3 planning runbook held-task list
- reviewed `EXT-002` blocker packet
- reviewed the prior `FWD-LIVE-001` evidence pack

No live sandbox probe or executable verification was run in this task because
the required external partner inputs are still absent.
