# WF-COM-001 Live Provider Classification Packet

**Date**: 2026-05-19 (date stamped to align with directive; reconciled commit 2026-05-22)
**Workflow family**: `WF-COM-001`
**Authority**: directive §G `COM-001` — `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
**Blueprint**: `docs/02-architecture/cti-recording-filing-blueprint-20260519.md`
**Historical probe packet**: `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md`

This sidecar is the canonical provider-classification packet for `WF-COM-001`.
It does not replace the older `COM-LIVE-001` probe; it classifies the maximum
truthful claim for the current provider evidence posture.

---

## 1. Current classification

| Field | Current value | Why |
| ----- | ------------- | --- |
| Provider name | `sandbox_webhook_adapter` | Current non-production provider harness is the repo-local adapter in `apps/api/src/modules/callcenter/sandbox-webhook.adapter.ts`; fixture identifiers use the `cti-sandbox-*` namespace. |
| Provider classification | `sandbox_provider` | `WF-COM-001` currently tops out at `PASS (sandbox evidence)` on `origin/dev`; no reachable live provider packet exists. |
| Gate read | `PASS (sandbox evidence)` | The matrix row and `E2E-003` prove the controlled callback/export/filing chain. |
| Live-provider non-claim | still required | `COM-LIVE-001` records that the 2026-05-19 live probe did not reach CTI callback or filing verification. |

`live_provider` is not currently allowed as a claim in this packet.

---

## 2. Nine directive §G evidence items

| # | Required evidence item | Current canonical anchor | Current classification | What is still needed for `live_provider` |
| - | ---------------------- | ------------------------ | ---------------------- | ---------------------------------------- |
| 1 | provider name / sandbox or live classification | this README; blueprint §1 | `static evidence` | Replace `sandbox_webhook_adapter` with the named live/staging CTI vendor or tenant. |
| 2 | call session creation proof | `tests/e2e/E2E-003-phone-recording-filing.sh` leg 1 | `sandbox evidence` | Provider-backed session creation or provider-originated call-start sample. |
| 3 | recording pending proof | `E2E-003` legs 1-2; `CallcenterService` pending flags | `sandbox evidence` | Before-callback state evidence from the live/staging provider path. |
| 4 | recording-ready callback proof | `E2E-003` leg 3; `POST /callcenter/sessions/:callId/recording-callback`; sandbox adapter | `sandbox evidence` | Real provider callback sample with redacted payload, idempotency, and before/after state. |
| 5 | recording index export | `E2E-003` leg 4; `dispatch_recording_index` | `sandbox evidence` | Export artifact sourced from the live/staging provider path. |
| 6 | filing package artifact | `E2E-003` leg 5; `GET /filing-packages/:packageId` | `sandbox evidence` | Provider-backed filing package with immutable manifest and `manifestHash`. |
| 7 | retention rule proof | `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md` | `static evidence` | Policy version attached to a live/staging recording or filing artifact. |
| 8 | legal hold proof | evidence-retention policy §§4-5 | `static evidence` | Hold/release evidence against provider-backed recording or filing material. |
| 9 | permissioned signed download proof | `E2E-003` legs 5 and 7; `download-signing.util.ts` | `sandbox evidence` | Signed download issuance plus audit rows from the live/staging provider path. |

---

## 3. Classification decision

The current sidecar decision is:

```text
WF-COM-001 = PASS (sandbox evidence)
Provider classification = sandbox_provider
```

The current sidecar explicitly does **not** say:

```text
WF-COM-001 = PASS (live staging evidence)
Provider classification = live_provider
```

That promotion is blocked until the nine evidence items above are refreshed from
a reachable live/staging provider path and the `COM-LIVE-001` partial probe
ceases to be the latest live-facing packet.

---

## 4. Required non-claim wording

Any closeout, release note, or dashboard row that cites this sidecar must keep
the following non-claim explicit:

- live CTI callback delivery is not proven
- live provider media retrieval is not proven
- live filing scheduler activation is not proven
- retention and legal-hold execution are not live-proven
- sandbox proof is the maximum current claim

---

## 5. Relationship to other packets

- `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`
  remains the blocker packet for missing live callback / filing / retention
  activation evidence.
- `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md`
  remains the dated partial probe packet from 2026-05-19.
- This directory is the canonical classification path referenced by
  `docs/03-runbooks/phase1-release-truth-sync-20260519.md`.
