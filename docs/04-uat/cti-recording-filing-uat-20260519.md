# CTI / Recording / Filing UAT — 2026-05-19

**Task:** `COM-UAT-001`  
**Owner:** `Codex2`  
**Reviewer:** `Claude`  
**Date:** `2026-05-19`  
**Artifact status:** `provisional`  
**Overall read:** `sandbox evidence is real; live/staging filing activation remains blocked`

## 1. Executive Summary

This report records the current UAT posture for the Phase 1 call-center flow
covering:

- phone booking creation with `call_id` linkage
- `recording_pending` to recording-bound callback resolution
- dispatch recording index export
- regulatory filing package generation
- permissioned recording / filing artifact access

As of `2026-05-19`, the correct gate read is:

- `WF-COM-001` is `PASS (sandbox evidence)` in
  `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`.
- `tests/e2e/E2E-003-phone-recording-filing.sh` proves the repo-local sandbox
  chain end-to-end.
- `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md` confirms that
  live/staging CTI callback, filing scheduler, recording export activation, and
  signed-download evidence are still incomplete, even though the canonical
  workflow gate already moved to `PASS (sandbox evidence)`.
- `EXT-004-BLK-001` through `EXT-004-BLK-008` remain the binding blockers for
  any stronger live/staging claim.

This means the implementation and sandbox automation are reviewable and useful
for UAT planning, but this document must not be read as proof that live CTI
provider delivery, month-end filing activation, or production evidence-retention
execution have passed.

## 2. Canonical Evidence Baseline

| Source | What it proves | Current limit |
| --- | --- | --- |
| `docs/04-uat/phase1-uat-scenarios.md` (`OC-021` to `OC-025`) | The intended manual UAT steps and expected operator-visible behavior | Scenario definitions only; not execution evidence |
| `docs/04-uat/fbp-014a-e2e-matrix.md` §4.3 | The formal end-to-end chain and API hop sequence for `E2E-003` | Describes sandbox automation, not live provider closure |
| `tests/e2e/E2E-003-phone-recording-filing.sh` | Repo-local sandbox proof for phone order -> callback -> export -> filing -> audit path | No live CTI media or staging scheduler proof |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` (`WF-COM-001`) | Canonical gate wording for the COM family | Upper bound is `PASS (sandbox evidence)` |
| `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` | Binding external-gate checklist for callback, filing, export, retention, and E2E live evidence | Blockers remain open |
| `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md` | Fresh `2026-05-19` live probe posture | Probe failed before callback / filing verification; use it for external activation posture, not to override the canonical `WF-COM-001` matrix row |

Precedence note:

- Treat `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` as the
  canonical gate read for `WF-COM-001`.
- Treat `COM-LIVE-001` as a dated live-probe sidecar showing why the stronger
  live/staging claim remains blocked by `EXT-004-BLK-*`.

## 3. Scenario Readout

Status legend used here:

- `PASS (sandbox evidence)`: repo-local sandbox automation or static proof is present
- `DEFERRED`: scenario exists, but activation evidence is explicitly still missing
- `HOLD`: stronger staging/live claim is blocked by `EXT-004`

| UAT ID | Scenario | Current read | Evidence anchor | Notes |
| --- | --- | --- | --- | --- |
| `OC-021` | Create phone booking with call linkage | `PASS (sandbox evidence)` | `E2E-003`; `fbp-014a-e2e-matrix.md` §4.3; `phase1-uat-scenarios.md` §3.8 | Sandbox path proves `order_source="phone"`, `call_id`, and linkage flow. |
| `OC-022` | Recording pending state resolved by callback | `PASS (sandbox evidence)` + `HOLD` for live/staging | `E2E-003`; `WF-COM-001`; `EXT-004-BLK-001` to `EXT-004-BLK-004`; `COM-LIVE-001` §4 | Repo-local callback transition is proven; real CTI/provider callback delivery is not. |
| `OC-023` | Monthly regulatory filing package generated | `PASS (sandbox evidence)` + `DEFERRED` for staging activation | `E2E-003`; `WF-COM-001`; `EXT-004-BLK-005`; `COM-LIVE-001` §4 | Sandbox filing package generation exists; job-profile/run-log evidence is still absent. |
| `OC-024` | Recording index export includes call references | `PASS (sandbox evidence)` + `DEFERRED` for staging activation | `E2E-003`; `WF-COM-001`; `EXT-004-BLK-006`; `COM-LIVE-001` §4 | Sandbox export proves row shape and masking path; no staging export artifact was captured. |
| `OC-025` | Sensitive artifact download is permissioned and audited | `PASS (sandbox evidence)` + `HOLD` for live retention/access sign-off | `E2E-003`; `EXT-004-BLK-007`; `COM-LIVE-001` §4 | Repo-local signed-download and audit path is reviewable; legal/security live sign-off is still open. |
| `E2E-003` | Phone booking to compliance export | `PASS (sandbox evidence)` + `HOLD` for external closure | `tests/e2e/E2E-003-phone-recording-filing.sh`; `fbp-014a-e2e-matrix.md` §4.3; `EXT-004-BLK-008` | The sandbox chain is complete, but the live/staging end-to-end packet is still missing. |

## 4. What The Sandbox Path Actually Proves

Per `docs/04-uat/fbp-014a-e2e-matrix.md` §4.3, the current automation proves
this repo-local chain:

1. `POST /api/callcenter/sessions` creates the call session.
2. `POST /api/call-center/orders` creates a phone-origin order that starts in
   `recording_pending`.
3. `POST /api/callcenter/sessions/:callId/recording-callback` binds the
   recording and clears the pending state.
4. `POST /api/reports/jobs` produces the `dispatch_recording_index` export with
   masked call / recording references.
5. `POST /api/filing-packages/generate` creates the immutable filing package.
6. `GET /api/audit/evidence-policies/*` plus `GET /api/audit` prove retention
   metadata and audited signed-download issuance.

That is enough to justify the current canonical wording:

- the phone-order / callback / export / filing implementation is real
- `WF-COM-001` can read `PASS (sandbox evidence)`
- live CTI/provider scope must still be called out separately

## 5. What Is Still Blocked

`support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md` documents a fresh
probe on `2026-05-19` that did not reach any callback or filing endpoint. That
sidecar is evidence that the live/staging upgrade is still blocked, not a
replacement for the current canonical `WF-COM-001 = PASS (sandbox evidence)`
matrix row. The reported boundary failures were:

- `gcloud auth print-identity-token` required interactive reauthentication
- the older `run.app` host returned `404`
- `api-staging.drts.internal` did not resolve from this machine

Because of that, these blockers remain open and binding:

| Blocker | Effect on UAT read |
| --- | --- |
| `EXT-004-BLK-001` to `EXT-004-BLK-003` | No approved live CTI environment, callback contract, or webhook security proof |
| `EXT-004-BLK-004` | `OC-022` has no live/staging callback pass |
| `EXT-004-BLK-005` | `OC-023` remains `DEFERRED` outside sandbox evidence |
| `EXT-004-BLK-006` | `OC-024` remains `DEFERRED` outside sandbox evidence |
| `EXT-004-BLK-007` | No production-grade retention/access sign-off can be claimed |
| `EXT-004-BLK-008` | No live/staging end-to-end packet closes the full phone-to-compliance chain |

## 6. UAT Conclusion

The honest `2026-05-19` conclusion is:

- The COM path is no longer a blank design stub. It has executable
  repo-local/sandbox evidence through `E2E-003`.
- The correct canonical family read is `WF-COM-001 = PASS (sandbox evidence)`,
  not `HOLD`, and not `PASS (live staging evidence)`.
- Manual or live UAT closeout for callback delivery, filing activation,
  recording export activation, and sensitive retention/access still depends on
  `EXT-004`.

Allowed wording:

- "Phone booking, recording callback, export, and filing are sandbox-proven."
- "Live CTI/provider activation remains blocked by `EXT-004-BLK-*`."

Not allowed:

- "CTI live verification passed."
- "Month-end filing is staging-proven."
- "Recording export activation is closed."
- "Compliance artifact retention/access is fully signed off."
