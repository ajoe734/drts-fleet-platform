# IAM-REL-001 Acceptance Packet and Dependency Map

Task: `IAM-REL-001-SIDECAR-ACCEPTANCE`

Parent task: `IAM-REL-001`

Owner: `Codex2`

Assigned reviewer: `Gemini`
Packet status: `READY_FOR_REVIEW` — support-only assessment; it is **not** a release approval.

## Scope and decision rule

This packet maps the three declared dependencies of `IAM-REL-001` to release
evidence and lists the remaining evidence that the release owner must collect.
It creates no canonical product, runtime, contract, or governance truth and
does not replace the parent task's release record.

The governing release checklist is the six gates in
`docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md` §7.
Per that source, a gate cannot be waived because documentation, UI, or
happy-path tests are complete; a blocked external proof must remain explicitly
blocked with an owner and exact evidence request.

## Dependency map

| Dependency | Machine-truth integration state | What it contributes | Release-owner use | Limit / follow-up |
| --- | --- | --- | --- | --- |
| `IAM-DOC-001` | `done`; merged to `dev`; PR #1392; CI `success`; merge commit `28634c24dc0bab21ad9daffd7d4b0ad440705e27` | Canonical contracts, architecture, migration, runbook, and UAT wording reconciled to implemented/live-proven labels. | Confirm the release candidate, deployment evidence, and release notes do not contradict the canonical layers. | This dependency is documentation alignment, not evidence of a deployed candidate. |
| `IAM-UAT-002` | `done`; merged to `dev`; PR #1391; CI `success`; merge commit `cd7c0d2cfc08510c0289209aa5163222a98a230d` | Eight production-like IAM journeys, gate inventory, sanitized evidence, and human-sign-off placeholders. | Re-run or bind the relevant journeys to the exact candidate SHA in real cloud staging; retain URLs, timestamps, and result logs. | Existing evidence is from `local_hermetic_staging_harness`; Gates 0–4 are `PENDING_CLOUD_STAGING`, Gate 5 records only prior `branch_pushed` integration, and Security/SRE/Ops/Tenant human decisions remain pending. |
| `IAM-IR-001` | `done`; merged to `dev`; PR #1387; CI `success`; merge commit `8f2e17c355ac107f4e31be33473d97c8eef37ea0` | ATO and credential-compromise drill evidence, evidence-preservation manifest, and runbook references. | Bind incident and rollback drill evidence to the release candidate; verify revocation, audit continuity, data consistency, and restore time in staging. | Recorded run uses `tabletop_harness`; it supports the release case but does not by itself prove a candidate deployment or production release. |

### Evidence sources

- `docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md` §§2, 5–7
- `support/sidecars/IAM-UAT-002/artifacts/gate_status_inventory.json`
- `support/sidecars/IAM-IR-001/IAM-IR-001-DRILL-EVIDENCE.md` §§1–3
- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md` §§19.5, 20, 22–23
- `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md` §§7–8

## Gate-by-gate acceptance checklist

Mark a gate `PASS` only with candidate-bound, reviewable evidence.  `Hermetic
Verified`, a completed dependency, or a green unrelated CI run is supporting
evidence, not a release pass.

| Gate | Required proof | Supporting evidence available now | Candidate-bound acceptance evidence still required | Initial disposition |
| --- | --- | --- | --- | --- |
| 0 — Containment | Production bootstrap/email-only closure, complete route classification, fail-closed startup configuration. | UAT gate inventory cites auth-negative, route-inventory, and startup-config suites. | Exact candidate SHA, deployed environment, command/run URL, route-inventory result, and fail-closed configuration check. | `BLOCKED_PENDING_CLOUD_STAGING` |
| 1 — Identity/session integrity | Trusted IdP/IAP proof, durable revocation, refresh-reuse detection, and key rotation. | UAT evidence reports hermetic session results; IR packet records ATO revocation drill evidence. | Staging IdP/IAP trace tied to candidate; revoke/reuse and key-rotation result; deployment timestamp and logs. | `BLOCKED_PENDING_CLOUD_STAGING` |
| 2 — Least privilege | Account lifecycle, policy parity, MFA, approval, last-admin, and SoD enforcement. | UAT evidence cites RBAC governance and MFA checks. | Candidate-bound staging results covering a privileged denial and a successful approved path, including audit correlation. | `BLOCKED_PENDING_CLOUD_STAGING` |
| 3 — Credential/device security | Driver, partner, and service credential lifecycle plus secure-client handling. | UAT evidence cites partner lifecycle and driver-device journey coverage. | Candidate-bound staging execution for issue/use/rotate/revoke/expiry and device revoke/rebind, with sanitized traces. | `BLOCKED_PENDING_CLOUD_STAGING` |
| 4 — Security operations | Append-only events, dashboards, alerts, break-glass, and incident drills. | UAT evidence cites observability; IR drills record sub-60-second tabletop outcomes and checksummed preservation artifacts. | Candidate-bound staging drill for ATO and credential compromise, alert/on-call evidence, append-only audit continuity, rollback results, and residual-risk decision. | `BLOCKED_PENDING_CLOUD_STAGING` |
| 5 — Acceptance/release | Negative matrix, real staging evidence, named sign-off, reviewed integration, and rollback proof. | `IAM-UAT-001` is merged to `dev`; `IAM-UAT-002` supplies hermetic journey evidence. | Reviewed candidate SHA; required CI/security results; migration expand/backfill/verify/cutover evidence; rollback drill; deployed/published SHA parity; named Security, SRE, Ops, and Tenant representative decisions. | `BLOCKED_PENDING_CANDIDATE_AND_SIGNOFFS` |

## Candidate handoff checklist for the parent release owner

- [ ] Record the reviewed candidate SHA, branch/PR, commit-to-deploy mapping, and CI/security run URLs.
- [ ] Run the required migration sequence: expand, controlled dual-read/dual-write where applicable, backfill, verify, cutover, and contract; retain counts, timing, and failure/rollback criteria.
- [ ] Demonstrate the rollback constraints from the architecture plan §23.2: no return to email-only authentication, bootstrap claim trust, unknown-route allow, or plaintext refresh tokens.
- [ ] Execute the eight staging journeys in architecture plan §19.5 against the deployed candidate and preserve sanitized, candidate-addressable evidence.
- [ ] Execute and record ATO, credential-compromise, key-rotation, and rollback drills, including data consistency, active-session behavior, audit continuity, restore time, owner, command, and residual risk.
- [ ] Obtain named Security, SRE, Operations, and Tenant representative decisions.  An AI-lane attribution or `pending human operator` is not a human release sign-off.
- [ ] Confirm every Gate 0–5 outcome is `PASS` with direct evidence; otherwise retain `BLOCKED` and an exact owner/evidence request.
- [ ] Confirm deployed and published SHAs equal the reviewed candidate before declaring release acceptance.

## Reviewer handoff

Reviewer `Gemini` should verify that this packet:

1. preserves the dependency state and limitations above without upgrading any
   hermetic/tabletop result to live-staging or release approval;
2. covers every required proof in execution-runbook §7 and final-release
   evidence in §8; and
3. gives the parent owner an actionable candidate-bound evidence list.

Review is limited to this support artifact.  Any release decision, canonical
truth edit, deployment, or external sign-off remains owned by `IAM-REL-001`.
