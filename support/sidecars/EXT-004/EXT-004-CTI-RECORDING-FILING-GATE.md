# EXT-004 — Live CTI / Recording / Filing Activation Gate

**Task:** `EXT-004`  
**Owner:** Gemini2  
**Reviewer:** Codex  
**Status:** reviewer-corrected gate packet  
**Created:** 2026-05-01

## Purpose

This packet turns phone-order CTI, recording callback, recording export, and regulatory filing from
implicit "later" work into an auditable activation gate. The repo has call-session and
reporting-filing surfaces, retention policy, and UAT rows. It does not yet have a live CTI
environment, approved CTI stub, activated filing scheduler, or staging evidence proving the
end-to-end phone-booking-to-compliance flow.

## Current Repo Baseline

| Evidence family             | Current anchor                                                                 | Gate read      |
| --------------------------- | ------------------------------------------------------------------------------ | -------------- |
| CTI session authority       | `apps/api/src/modules/callcenter`                                              | repo/static    |
| Recording callback endpoint | `POST /api/callcenter/sessions/:callId/recording-callback`                     | repo/static    |
| Recording evidence policy   | `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`         | repo/static    |
| Filing package generation   | `POST /api/filing-packages/generate`; `apps/api/src/modules/reporting-filing`  | repo/static    |
| Recording index export      | `dispatch_recording_index` job in `apps/api/src/modules/reporting-filing`      | repo/static    |
| Workflow gate               | `WF-COM-001` in `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` | `HOLD`         |
| UAT scenarios               | `OC-022`, `OC-023`, `OC-024`, `E2E-003`                                        | external/defer |

Repo/static means the implementation seam is present and reviewable. It does not prove live CTI
screen-pop, provider callback delivery, recording media access, scheduler activation, or regulator
package completeness.

## Gate Statuses

| Scenario  | Current status   | Required activation evidence                                                                   |
| --------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `OC-022`  | `EXTERNAL-GATED` | Real CTI or approved CTI stub callback proves `recording_pending` becomes `recording_bound`.   |
| `OC-023`  | `DEFERRED`       | Staging filing job run creates a completed filing package with manifest and audit event.       |
| `OC-024`  | `DEFERRED`       | Recording index export includes `call_id`, `recording_id`, and explicit missing flags.         |
| `E2E-003` | `DEFERRED`       | Phone booking, callback, trip proof, recording export, and filing package are proven together. |

## External Blocker Records

| Blocker ID        | Missing input                                    | Required evidence                                                                                      | Owner to confirm                | Release effect                               |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------- |
| `EXT-004-BLK-001` | CTI provider or approved stub environment        | Provider/stub URL, tenant, call-id format, agent-id mapping, screen-pop behavior, and callback SLA.    | CTI provider / ops telephony PM | `OC-022` cannot move past `EXTERNAL-GATED`.  |
| `EXT-004-BLK-002` | Recording callback contract                      | Approved payload schema, required fields, idempotency key, retry behavior, timestamp, and error cases. | CTI provider technical owner    | Recording callback remains repo-static.      |
| `EXT-004-BLK-003` | CTI webhook security controls                    | Signature header, canonical payload, replay window, IP allowlist if any, and secret storage path.      | Security + CTI provider         | Callback endpoint cannot be exposed as live. |
| `EXT-004-BLK-004` | Staging callback run evidence                    | Before/after call session showing pending-to-bound transition, audit event, and redacted callback log. | QA + ops dispatch               | `OC-022` has no live/staging pass.           |
| `EXT-004-BLK-005` | Filing scheduler activation                      | Schedule owner, job profile, period, run log, package id, manifest hash, and retry/failure policy.     | Compliance operations           | `OC-023` remains `DEFERRED`.                 |
| `EXT-004-BLK-006` | Recording index export activation                | Export artifact with phone-origin rows, `call_id`, masked `recording_id`, missing-recording flags.     | Reporting / compliance owner    | `OC-024` remains `DEFERRED`.                 |
| `EXT-004-BLK-007` | Sensitive evidence retention and access sign-off | Call recording and filing-package retention, legal hold, signed download, and audit-download approval. | Security / compliance / legal   | No production evidence-retention claim.      |
| `EXT-004-BLK-008` | End-to-end live or staging run                   | `E2E-003` packet tying phone order, callback, driver proof, export, filing package, and audit refs.    | QA lead + ops + compliance      | Phone-to-compliance flow cannot be closed.   |

## Required CTI Callback Evidence

The CTI provider or approved stub must produce a redacted sample with these fields:

| Field                                         | Required proof                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `call_id`                                     | Matches the DRTS call session path parameter and is stable across retries.   |
| `recording_id`                                | Provider/stub recording identifier; raw value is masked in logs and exports. |
| `recording_url` or storage reference          | Points to controlled media storage or an approved retrieval token.           |
| `recording_started_at` / `recording_ended_at` | Allows duration and retention interpretation.                                |
| `agent_id`                                    | Maps to the ops identity or telephony extension that handled the call.       |
| `tenant_id` or business context               | Allows cross-tenant review without leaking another tenant's evidence.        |
| `idempotency_key`                             | Duplicate callbacks do not create duplicate recording evidence.              |
| `signature` and timestamp                     | Proves payload authenticity and replay-window enforcement.                   |

Minimum staging evidence:

1. Create or seed a phone booking with `recording_id = null`.
2. Confirm `recording_pending` is visible before callback.
3. Deliver the callback to `POST /api/callcenter/sessions/:callId/recording-callback`.
4. Confirm `recording_pending` is cleared and `recording_bound` is present.
5. Attach the audit action for `attach_recording_callback`.

## Required Filing And Export Evidence

| Evidence type            | Required fields                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Filing package run       | `packageId`, `packageType`, period, status, `manifestHash`, item count, run timestamp, and audit event.              |
| Filing artifact access   | Redacted signed-download metadata, TTL, policy version, requester identity, and download audit event.                |
| Recording index export   | Period, export artifact id, `call_id`, masked `recording_id`, missing-recording boolean, manifest hash, audit event. |
| Missing recording path   | At least one staged row or unit proof showing `recording_missing` / missing flag is preserved in filing/export.      |
| Retention interpretation | Evidence family is one of `call_recording`, `report_artifact`, or `filing_package` with policy version attached.     |

## No-Overclaim Rules

Allowed:

- "The repo has callcenter and reporting-filing surfaces for CTI callback, recording index export,
  and filing package generation."
- "`WF-COM-001` remains `HOLD` until `EXT-004-BLK-*` evidence exists."
- "`E2E-003` is deferred because it depends on live/staging CTI callback and filing/export
  activation."

Not allowed:

- "Phone booking to compliance export is complete" without `E2E-003` live/staging evidence.
- "Recording callback passed" when only the static endpoint exists.
- "Regulatory filing is activated" without a scheduler run, manifest hash, artifact access, and
  audit evidence.
- "Call recording retention is production-proven" without media storage, retention, access, and
  legal-hold sign-off.

## Acceptance Mapping

| Acceptance item                                           | Evidence                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| CTI metadata and recording callback expectations named    | CTI callback evidence fields and `EXT-004-BLK-001` to `EXT-004-BLK-004`. |
| recording export and filing package requirements named    | Filing/export evidence table and `EXT-004-BLK-005` to `EXT-004-BLK-006`. |
| OC-022 OC-023 OC-024 E2E-003 gate statuses current        | Gate status table above and UAT checklist tracker updates.               |
| missing CTI filing environment becomes blocker record     | `EXT-004-BLK-001` to `EXT-004-BLK-008`.                                  |
| legal retention expectations connected to activation gate | `EXT-004-BLK-007` and retention-policy runbook anchor.                   |
