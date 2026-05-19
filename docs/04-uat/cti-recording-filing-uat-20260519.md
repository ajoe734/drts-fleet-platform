# CTI Recording Filing UAT

Last updated: 2026-05-19
Task ref: `COM-UAT-001`
Workflow family: `WF-COM-001`
Owner: `Codex`
Reviewer: `Claude`

This packet formalizes the CTI / recording / filing UAT surface for
`WF-COM-001`. It consolidates the baseline UAT rows (`OC-021` to `OC-024`,
`NP-COM-001`, `NP-COM-002`), the repo-local automation in
`tests/e2e/E2E-003-phone-recording-filing.sh`, and the live-provider boundary
captured in `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md`.

The canonical workflow-family gate remains the row in
`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`, which currently
reads `PASS (sandbox evidence)` for `WF-COM-001`. This document does not
upgrade that gate to live or staging proof. `COM-LIVE-001` and
`support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` still bound the
live-provider activation slice, filing scheduler activation, and retention /
download sign-off as explicit blockers before any stronger claim is allowed.

## Scope

This UAT packet is bounded to:

- phone-origin booking linkage from the callcenter surface,
- recording callback behavior and `recording_pending` clearance,
- recording index export and filing-package generation behavior,
- permissioned access and audit expectations for sensitive artifacts,
- the shared driver-proof prerequisites that affect filing completeness.

It is not allowed to:

- claim live CTI/provider callback delivery without `EXT-004-BLK-001` through
  `EXT-004-BLK-004`,
- claim staging filing/export activation without `EXT-004-BLK-005` and
  `EXT-004-BLK-006`,
- claim production retention / legal-hold readiness without
  `EXT-004-BLK-007`,
- restate `WF-COM-001` as `PASS (live staging evidence)` from repo-local
  automation alone.

## Source Stack

| Layer | Anchor | Why it matters |
| --- | --- | --- |
| Product truth | `phase1_prd_detailed_v1.md` §`9.1.4`, §`9.10.2` | Requires phone bookings to retain `call_id` / `recording_id`, and filing packages to emit audited manifests. |
| Service contracts | `phase1_service_contracts_v1.md` §`3.9`, §`4.7` | Names the callcenter source-of-truth objects, `call.recording.ready` event, and filing-package output contract. |
| Acceptance scenarios | `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` `SC-003`, `SC-004`, `SC-033`, `SC-034`, `SC-040`, `SC-050`, `SC-051` | Defines the expected phone-linkage, callback, filing, export, permission, and missing-recording outcomes. |
| Baseline UAT inventory | `docs/04-uat/phase1-uat-scenarios.md`, `docs/04-uat/phase1-uat-checklist.md` | Supplies the named `OC-*`, `DA-*`, `NP-COM-*`, and `E2E-003` rows already mapped to `WF-COM-001`. |
| Repo-local automation | `tests/e2e/E2E-003-phone-recording-filing.sh`, `docs/04-uat/fbp-014a-e2e-matrix.md` §`4.3` | Proves the sandbox chain from call session through recording export, filing package, and audited artifact issuance. |
| Live boundary | `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md`, `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` | Freezes the external-gated/live activation gaps that still block stronger release statements. |

## Scenario Matrix

| Scenario slice | UAT / acceptance rows | Primary evidence anchor | Current read | Notes |
| --- | --- | --- | --- | --- |
| Phone booking keeps call linkage | `OC-021`, `SC-003` | `tests/e2e/E2E-003-phone-recording-filing.sh` legs 1-2 | `PASS (sandbox evidence)` | `order_source="phone"`, `call_id`, and `agent_id` are captured before dispatch. |
| Recording callback clears pending state | `OC-022`, `SC-004` | `tests/e2e/E2E-003-phone-recording-filing.sh` leg 3; `apps/api/src/modules/callcenter/callcenter.controller.ts` `POST /callcenter/sessions/:callId/recording-callback` | `PASS (sandbox evidence)` for repo-local flow; live callback still `EXTERNAL-GATED` | Sandbox automation proves state change; live webhook contract/security evidence still depends on `EXT-004-BLK-001` to `EXT-004-BLK-004`. |
| Filing package generation emits manifest | `OC-023`, `SC-033` | `tests/e2e/E2E-003-phone-recording-filing.sh` leg 5; `phase1_service_contracts_v1.md` §`4.7` | `PASS (sandbox evidence)` for repo-local generation; staging scheduler still `DEFERRED` | The repo contract proves package creation, manifest checksum, and artifact handles; staging schedule/run ownership remains a separate gate. |
| Recording index export includes call references | `OC-024`, `SC-034` | `tests/e2e/E2E-003-phone-recording-filing.sh` leg 4 | `PASS (sandbox evidence)` for repo-local export; staged export activation still `DEFERRED` | The export must keep `call_id`, masked `recording_id`, and explicit missing-recording state. |
| Missing recordings stay explicit in filing | `NP-COM-001`, `SC-050` | `docs/04-uat/phase1-uat-scenarios.md` §`9.4`; `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` | `DEFERRED` | The behavior is specified, but staging filing evidence is still blocked by `EXT-004-BLK-005` and `EXT-004-BLK-006`. |
| Non-compliance download is denied and audited | `NP-COM-002`, `SC-040`, `SC-051` | `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` `SC-040`, `SC-051`; `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md` | `STATIC EVIDENCE` | Permission model and audit rule are named; live role-backed denial evidence remains a future companion check. |

## Shared Driver-Proof Prerequisites

`WF-COM-001` inherits `DA-007` to `DA-009` from the baseline checklist because
filing completeness depends on trip proof, signoff, and expense evidence rather
than on CTI state alone.

| Shared prerequisite | Baseline row | Why it belongs in this packet | Current read |
| --- | --- | --- | --- |
| Completion photo minimum | `DA-007` | Filing and complaint packets cannot claim complete proof if required trip photos are missing. | `STATIC EVIDENCE` |
| Enterprise dispatch signoff | `DA-008` | Enterprise phone bookings still require signoff-ready completion evidence before compliance closeout. | `SIGN-OFF` |
| Airport transfer expense proof | `DA-009` | Expense artifacts remain part of the same downstream evidence package when the phone flow lands in regulated reporting. | `STATIC EVIDENCE` |

This document does not replace the dedicated driver UAT packet. It only records
why these proof rows remain part of the `WF-COM-001` review surface.

## E2E-003 Chain

`E2E-003` is the authoritative automation anchor for the sandbox version of the
phone-booking-to-compliance flow.

1. `POST /callcenter/sessions` opens a call session and captures `callId`.
2. `POST /call-center/orders` creates the phone-origin order, keeps the same
   `callId`, and leaves the order in `recording_pending`.
3. `POST /callcenter/sessions/:callId/recording-callback` binds
   `recordingId`, clears `recording_pending`, and preserves audit continuity.
4. `POST /reports/jobs` exports `dispatch_recording_index`, including the
   phone-origin row with masked recording references.
5. `POST /filing-packages/generate` returns a filing package with manifest and
   signed-download artifacts.
6. `GET /api/audit/evidence-policies/*` and `GET /api/audit` confirm retention
   metadata and audited issuance behavior.

The matching walkthrough in `docs/04-uat/fbp-014a-e2e-matrix.md` §`4.3` is the
human-readable summary of the same automation chain.

## Live-Provider Boundary

`COM-LIVE-001` records a `2026-05-19` partial live probe only:

- `gcloud auth print-identity-token` required interactive reauthentication,
- the older staging `run.app` host returned `404`,
- `api-staging.drts.internal` was unresolved from the probing machine,
- no CTI callback sample, recording export artifact, filing manifest, or
  signed-download audit evidence was collected.

Those findings do not erase the repo-local sandbox proof recorded in the
workflow matrix. They only block any stronger live/staging claim.

| Live slice | Current state | Blocking anchor |
| --- | --- | --- |
| CTI provider / approved stub environment | not proven in reachable environment | `EXT-004-BLK-001` |
| Callback schema, idempotency, webhook security | not proven with provider payload/signature | `EXT-004-BLK-002`, `EXT-004-BLK-003` |
| Staging callback run | no before/after evidence packet captured | `EXT-004-BLK-004` |
| Filing scheduler activation | no staged filing run or manifest hash captured | `EXT-004-BLK-005` |
| Recording index export activation | no staged export artifact captured | `EXT-004-BLK-006` |
| Retention / signed-download sign-off | no live access-governance evidence packet captured | `EXT-004-BLK-007` |
| Full live or staging E2E packet | absent | `EXT-004-BLK-008` |

## Review Interpretation

Interpret the current UAT posture as follows:

- `WF-COM-001` keeps its existing release-matrix read:
  `PASS (sandbox evidence)`.
- `COM-LIVE-001` is a narrower evidence packet for live-provider activation and
  remains partial only.
- `OC-022`, `OC-023`, `OC-024`, and `E2E-003` must still stay explicit when a
  reviewer discusses live/staging readiness, because their stronger claim is
  blocked by `EXT-004`.

Good wording:

- "`WF-COM-001` is sandbox-proven through `E2E-003`, while live CTI/provider
  activation remains blocked by `EXT-004-BLK-*`."
- "Phone booking linkage, callback state change, recording export, and filing
  manifest behavior are reviewable without overstating live provider closure."

Not allowed:

- "`WF-COM-001` is live-proven."
- "CTI callback is activated in staging."
- "Recording retention and signed-download governance are fully closed."
