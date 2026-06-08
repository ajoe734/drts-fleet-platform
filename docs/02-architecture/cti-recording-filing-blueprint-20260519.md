# CTI Recording Filing Blueprint

**Date**: 2026-05-19 (date stamped to align with directive; reconciled commit 2026-05-22)
**Authority**: directive §G `COM-001` — `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
**Workflow family**: `WF-COM-001`
**Pairs with**: `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` (gate read), `tests/e2e/E2E-003-phone-recording-filing.sh` (named proof chain), `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` (external blocker packet)
**Canonical provider-classification sidecar**: `support/sidecars/WF-COM-001-LIVE-PROVIDER/`
**Historical live-probe packet**: `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md` (dated partial probe, not the canonical classification path)

This blueprint defines the Phase 1 CTI / recording / filing evidence model: what counts as sandbox-provider evidence, what must exist before a live-provider claim is allowed, and which repo/runtime surfaces are authoritative for `WF-COM-001`.

---

## 1. Provider classification model

### 1.1 Allowed classifications

`WF-COM-001` uses exactly two provider classifications:

- `sandbox_provider`
- `live_provider`

`sandbox_provider` means the flow is proven only through an approved sandbox or controlled non-production harness. It may justify `WF-COM-001 = PASS (sandbox evidence)`, but it does not justify any "CTI live" claim.

`live_provider` means a reachable staging or live CTI environment has produced the callback, recording, filing, retention, legal-hold, and permissioned-download evidence listed in §4 from a real provider-owned path. Only then may the workflow family uplift to `WF-COM-001 = PASS (live staging evidence)`.

### 1.2 Current canonical classification on `origin/dev`

The current canonical classification is `sandbox_provider`.

Why:

- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` already caps `WF-COM-001` at `PASS (sandbox evidence)`.
- `tests/e2e/E2E-003-phone-recording-filing.sh` proves the phone-order -> callback -> export -> filing -> signed-download audit chain in a controlled environment.
- `apps/api/src/modules/callcenter/sandbox-webhook.adapter.ts` and `sandbox.fixtures.ts` define a named sandbox webhook normalization surface.
- `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md` records that a fresh probe on 2026-05-19 did not reach a live CTI callback or filing endpoint.

Therefore the maximum truthful claim on `origin/dev` is:

```text
WF-COM-001 = PASS (sandbox evidence)
```

The current truthful non-claim is:

```text
Live CTI/provider activation is not proven; retention, legal-hold, and signed-download live execution remain explicit gates.
```

### 1.3 Provider naming rule

The provider evidence packet must always name the provider instance being classified.

- Current sandbox-classified instance: `sandbox_webhook_adapter` (the repo-local harness implemented by `apps/api/src/modules/callcenter/sandbox-webhook.adapter.ts`; fixture identifiers use the `cti-sandbox-*` namespace).
- Future live-classified instance: the concrete CTI vendor or approved staging tenant. A live packet may not leave the provider unnamed.

---

## 2. Canonical runtime surfaces

### 2.1 Call-session and callback authority

`apps/api/src/modules/callcenter/` is the canonical runtime owner for:

- `POST /callcenter/sessions`
- `GET /callcenter/sessions`
- `GET /callcenter/sessions/:callId`
- `POST /callcenter/sessions/:callId/recording-callback`
- `POST /callcenter/webhooks/sandbox`

Key state transitions are owned by `CallcenterService`:

- session opens with `recordingState = pending`
- pending callback adds `recording_pending` / `recording_pending_callback`
- ready callback binds `recordingId` and flips flags to `recording_bound`
- failed callback flips flags to `recording_missing`

### 2.2 Reporting / filing authority

`apps/api/src/modules/reporting-filing/` is the canonical runtime owner for:

- `POST /reports/jobs`
- `GET /reports/:jobId`
- `POST /filing-packages/generate`
- `GET /filing-packages/:packageId`

`dispatch_recording_index` is the required report job type for `WF-COM-001`. It must preserve:

- masked `callId`
- masked `recordingId`
- `missingRecording`
- artifact manifest hash
- download metadata and audit linkage

Filing packages must preserve:

- immutable manifest
- `manifestHash`
- entry count
- signed zip/pdf download metadata
- evidence-governance family = `filing_package`

### 2.3 Retention / legal-hold / evidence-access authority

`docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md` is the canonical policy for:

- `call_recording` retention and archive cutover
- `report_artifact` retention and signed-download auditing
- `filing_package` retention and signed-download auditing
- legal-hold reasons and release rules
- deletion exceptions for complaint / regulator / settlement references

This policy is binding for `WF-COM-001`, but policy text alone is not a live-provider proof.

---

## 3. Workflow chain for `WF-COM-001`

The required workflow remains:

```text
incoming CTI call
→ call session created
→ operator creates phone booking
→ booking stores call_id and agent_id
→ recording pending flag
→ recording-ready callback
→ recording_id attached
→ recording pending cleared
→ complaint / incident optional linkage
→ recording index export
→ filing package generated
→ sensitive download permission check
→ legal hold / retention metadata
```

Current named verification anchors on `origin/dev`:

- `tests/e2e/E2E-003-phone-recording-filing.sh`
- `docs/04-uat/phase1-uat-scenarios.md` (`OC-021` to `OC-025`, `NP-COM-001`, `NP-COM-002`)
- `docs/04-uat/phase1-uat-checklist.md`
- `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`

---

## 4. Nine required evidence items

The directive §G `COM-001` evidence body is fixed at nine items.

| # | Required evidence item | Canonical anchor on `origin/dev` | Current evidence level | Live-provider uplift requirement |
| - | ---------------------- | -------------------------------- | ---------------------- | -------------------------------- |
| 1 | provider name / sandbox or live classification | `support/sidecars/WF-COM-001-LIVE-PROVIDER/README.md`; this blueprint §1 | `static evidence` | Name the concrete CTI vendor / staging tenant and classify it as `live_provider`. |
| 2 | call session creation proof | `tests/e2e/E2E-003-phone-recording-filing.sh` leg 1; `apps/api/src/modules/callcenter/callcenter.controller.ts` | `sandbox evidence` | Re-run from a reachable provider-owned call session or provider callback flow. |
| 3 | recording pending proof | `E2E-003` legs 1-2; `CallcenterService` pending-state flags | `sandbox evidence` | Show pending state from the live/staging provider path before callback resolution. |
| 4 | recording-ready callback proof | `E2E-003` leg 3; `POST /callcenter/sessions/:callId/recording-callback`; `SandboxWebhookAdapter` | `sandbox evidence` | Provide a redacted real provider callback sample plus before/after state evidence. |
| 5 | recording index export | `E2E-003` leg 4; `dispatch_recording_index` in `reporting-filing.service.ts` | `sandbox evidence` | Export a provider-backed row showing masked `callId`, masked `recordingId`, and `missingRecording=false`. |
| 6 | filing package artifact | `E2E-003` leg 5; `POST /filing-packages/generate` | `sandbox evidence` | Capture a provider-backed filing package run with immutable manifest and `manifestHash`. |
| 7 | retention rule proof | `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md` §§2-3; `E2E-003` leg 6 | `static evidence` | Pair the policy with a live/staging artifact whose evidence family and retention policy version are auditable. |
| 8 | legal hold proof | `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md` §§4-5 | `static evidence` | Capture a real hold/release record or equivalent staging proof against call-recording / filing evidence. |
| 9 | permissioned signed download proof | `E2E-003` legs 5 and 7; `apps/api/src/modules/reporting-filing/download-signing.util.ts` | `sandbox evidence` | Issue a signed provider-backed artifact download and capture the corresponding audit rows. |

Items 7 and 8 are intentionally separated from 9. Retention and legal-hold policy can exist before live execution; they still require live/staging evidence before a `live_provider` claim is allowed.

---

## 5. Gate-read and non-claim rules

### 5.1 Current gate read

The current gate read remains:

```text
WF-COM-001 = PASS (sandbox evidence)
```

This gate read is justified only because the sandbox-classified chain is named and reviewable through the matrix, `E2E-003`, and the repo/runtime anchors above.

### 5.2 What must remain explicit today

The following statements must remain true until a live packet exists at `support/sidecars/WF-COM-001-LIVE-PROVIDER/`:

- live CTI callback delivery is not proven
- live provider media access is not proven
- staging filing scheduler activation is not proven
- legal-hold execution against provider-backed evidence is not proven
- retention/access sign-off is policy-defined but not live-proven

### 5.3 Promotion rule to `live_provider`

`WF-COM-001` may be promoted to:

```text
WF-COM-001 = PASS (live staging evidence)
```

only when all of the following are true:

1. `support/sidecars/WF-COM-001-LIVE-PROVIDER/README.md` is updated from `sandbox_provider` to `live_provider`.
2. The same packet carries all nine evidence items from a reachable staging/live provider path.
3. The historical partial probe packet under `COM-LIVE-001/` is either superseded by fresh evidence or retained only as an earlier failed probe snapshot.
4. `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` is updated by the matrix owner to match the new classification.

---

## 6. Allowed and forbidden wording

Allowed:

- "`WF-COM-001` is `PASS (sandbox evidence)`."
- "The CTI provider classification is currently `sandbox_provider`."
- "Live CTI/provider activation remains an explicit non-claim."

Forbidden:

- "CTI live is done."
- "Recording callback is live-verified."
- "Filing activation is proven in staging" without a provider-backed packet.
- "Retention and legal hold are live-proven" when only the policy runbook exists.

---

## 7. Scope boundary

This blueprint does not:

- replace `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` as the blocker packet
- replace `COM-LIVE-001` as the historical partial live-probe record
- create a new runtime claim beyond the current matrix gate read
- declare production CTI, regulator filing, or retention execution complete

Its job is narrower: make the provider classification explicit, keep the sandbox-vs-live boundary truthful, and give `WF-COM-001` one canonical place to reason about the nine directive-§G evidence items.
