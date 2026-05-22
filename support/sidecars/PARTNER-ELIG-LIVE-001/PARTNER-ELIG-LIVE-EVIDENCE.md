# PARTNER-ELIG-LIVE-001 — Live Issuer Credential Hold-State Evidence

- **Task:** `PARTNER-ELIG-LIVE-001`
- **Owner:** `Codex`
- **Reviewer:** `Claude2`
- **Collected:** `2026-05-19 (UTC)`
- **Refreshed:** `2026-05-22 (UTC)`
- **Status:** `hold evidence refreshed — live issuer proof remains external-gated`

---

## 1. Executive Summary

This packet records the current hold state for real issuer/bank sandbox
credentials and live eligibility proof in Phase 1 v3.

Current result on `2026-05-22`:

- `PRT-SPEC-001` is `done`, so the repo/static partner-eligibility
  architecture/spec dependency is satisfied.
- Canonical machine truth now records
  `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK` as `done`, and its `2026-05-22`
  closeout leaves only the `EXT-001-BLK-001` through `EXT-001-BLK-006` external
  gate family open.
- Canonical `ai-status.json` keeps the parent resume sequence concrete:
  preserve this sidecar as the evidence anchor, wait for `EXT-001-BLK-001`
  through `EXT-001-BLK-006`, attach redacted issuer inputs here, then rerun the
  live issuer proof.
- No issuer/bank sandbox package is attached in this repo session:
  - no approved issuer API contract authority artifact
  - no sandbox credential or allowlist package
  - no issuer-approved eligible/ineligible/timeout fixture matrix
  - no timeout/retry confirmation from the issuer
  - no manual-review release sign-off from sponsor/issuer stakeholders
  - no sensitive-data handling and retention approval for live use

Conclusion:

- This packet is the durable hold-state evidence anchor for
  `PARTNER-ELIG-LIVE-001`.
- It cannot claim live issuer activation, live sandbox proof, or
  benefit-release approval until the `EXT-001-BLK-*` inputs arrive from the
  external issuer / bank partnership track.

---

## 2. Canonical Inputs Reviewed

### 2.1 Planning / dispatch truth

`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
places `PARTNER-ELIG-LIVE-001` in the `HELD (external)` group and states that
real issuer/bank sandbox credentials are required before execution can resume.

### 2.2 Static spec baseline

`docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
is the closed `PRT-SPEC-001` artifact.

That spec makes the current boundary explicit:

- canonical workflow family is `WF-PARTNER-001`
- repo/static propagation evidence is formalized
- `manual_review` is not issuer approval
- live issuer activation remains external-gated on `EXT-001`

### 2.3 External-gate truth

`support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` remains the binding gate
packet for real issuer/bank activation.

It still lists these open external blockers:

- `EXT-001-BLK-001` issuer / bank API contract authority
- `EXT-001-BLK-002` sandbox credentials and network allowlist
- `EXT-001-BLK-003` allowed test card / reference fixture matrix
- `EXT-001-BLK-004` timeout and retry behavior confirmation
- `EXT-001-BLK-005` manual-review fallback business sign-off
- `EXT-001-BLK-006` sensitive-data handling and retention approval

### 2.4 Latest machine-truth unblock resolution

The authoritative `2026-05-22` unblock closeout is the canonical
`ai-status.json` record for `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`
(closeout commit `130e3f7f`), not a branch-local helper document on this task
branch.

That closeout resolved the intermediate dependency question:

- before `PRT-SPEC-001` closed, the parent task was not dependency-ready
- after `PRT-SPEC-001` closed, the only remaining blocker is the `EXT-001`
  external-input family above
- the parent next step is now explicit: keep this evidence packet current, wait
  for `EXT-001-BLK-001` through `EXT-001-BLK-006`, attach redacted issuer
  inputs here, then rerun the live issuer proof

This refresh does not change that diagnosis. It makes the owner artifact itself
match the current machine-truth resume sequence.

---

## 3. Missing Input Snapshot

| Blocker ID | Missing input | Why live proof cannot proceed |
| --- | --- | --- |
| `EXT-001-BLK-001` | Issuer / bank API contract authority | No approved endpoint/schema/SLA packet exists to prove the DRTS contract matches the real issuer. |
| `EXT-001-BLK-002` | Sandbox credentials and network allowlist | No credential bundle or access path exists for a real sandbox probe from this task. |
| `EXT-001-BLK-003` | Allowed test card / reference fixture matrix | No issuer-approved eligible, ineligible, timeout, or rate-limit fixtures are attached. |
| `EXT-001-BLK-004` | Timeout and retry behavior confirmation | Repo defaults exist, but no issuer confirmation proves those settings are accepted for live/sandbox use. |
| `EXT-001-BLK-005` | Manual-review fallback business sign-off | No sponsor/issuer approval exists to govern when offline evidence may release a held booking. |
| `EXT-001-BLK-006` | Sensitive-data handling and retention approval | No live approval packet exists for masking, hashing, audit visibility, and retention rules. |

---

## 4. Release-Gate Read

Allowed current claim:

- "`PARTNER-ELIG-LIVE-001` remains `HOLD` / external-gated pending
  `EXT-001-BLK-001` through `EXT-001-BLK-006`."
- "`PRT-SPEC-001` closed the repo/static spec boundary, not the live issuer
  activation boundary."
- "When external issuer inputs arrive, extend
  `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md` and
  rerun the live issuer proof."

Not allowed:

- "Live issuer activation is verified."
- "Issuer sandbox credentials are present and validated."
- "Manual review equals issuer approval."
- "Issuer-approved test cards passed."
- "`WF-PARTNER-001` live issuer gate is closed."

---

## 5. Resume Conditions

This task can move out of `HOLD` only after the following inputs exist:

1. Approved issuer/bank API contract package
2. Sandbox credentials plus any allowlist / mTLS / network requirements
3. Issuer-approved eligible/ineligible/timeout fixture matrix
4. Issuer-approved timeout and retry guidance
5. Sponsor/issuer sign-off for manual-review release rules
6. Sensitive-data handling and retention approval for the live path

Once those inputs arrive, the next execution step is:

1. Attach the redacted credential/fixture/sign-off evidence under
   `support/sidecars/PARTNER-ELIG-LIVE-001/`.
2. Run the real issuer/sandbox verification flow against the approved fixtures.
3. Update this packet with the dated probe result, redacted evidence pointers,
   and the final gate read.
4. Hand the refreshed evidence packet to the assigned reviewer so canonical
   machine truth can move out of the hold-state documentation phase.

Until then, the correct machine-truth state is blocked on external resources,
not repo implementation.

---

## 6. Verification Notes

Verification in this task was source review only:

- reviewed canonical machine truth for `PARTNER-ELIG-LIVE-001`,
  `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`, and `PRT-SPEC-001`
- reviewed canonical `ai-activity-log.jsonl` entries for the `2026-05-22`
  parent-resume / unblock closeout sequence
- reviewed the v3 planning runbook
- reviewed `PRT-SPEC-001` spec boundary language
- reviewed `EXT-001` blocker definitions
- verified that this task branch still carries the sidecar path named in the
  canonical resume sequence

No live issuer probe was executed in this task because the required external
issuer/bank credential package and approved fixtures are still absent.
