# Evidence Retention And Evidentiary Access Policy

Status: active for Phase 1 operational blueprint  
Policy version: `phase1-2026-04-29`  
Primary runtime catalog: `GET /audit/evidence-policies`

## 1. Purpose

This runbook materializes the Phase 1 retention, archival, legal-hold, and
evidentiary-access defaults for evidence-bearing records owned inside
`drts-fleet-platform`.

This policy closes `OPX-CM-005` by doing two things together:

- publishing one family-by-family retention matrix
- requiring audited access on the repo-local evidence read paths

Out of scope:

- rebuilding binary-media storage for CTI recordings
- reopening proof-capture business rules from `OPX-CM-001`
- shipping a background archival scheduler beyond the documented retention
  cutover points

## 2. Evidence Family Matrix

| Evidence family            | Authority            | Hot retention | Archive cutover | Archive retention | Access posture                                                                                                                             |
| -------------------------- | -------------------- | ------------- | --------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `call_recording`           | `callcenter`         | 30 days       | day 30          | 365 days          | `platform_admin` and `ops_user` only; every read is audited                                                                                |
| `report_artifact`          | `reporting-filing`   | 30 days       | day 30          | 365 days          | `platform_admin` / `ops_user`, plus tenant-scoped `tenant_admin`; signed download issuance is audited                                      |
| `filing_package`           | `reporting-filing`   | 90 days       | day 90          | 2555 days         | `platform_admin` / `ops_user`; package download issuance is audited                                                                        |
| `audit_log`                | `audit-notification` | 180 days      | day 180         | 2555 days         | `platform_admin` / `ops_user`, plus tenant-scoped `tenant_admin`; audit evidence reads are audited                                         |
| `webhook_delivery`         | `tenant-partner`     | 30 days       | day 30          | 365 days          | `platform_admin` / `ops_user`, plus tenant-scoped `tenant_admin`; delivery-history reads are audited                                       |
| `eligibility_verification` | `tenant-partner`     | 90 days       | day 90          | 730 days          | `platform_admin` / `ops_user`, tenant-scoped `tenant_admin`, and matching `partner_api_key`; reads are audited                             |
| `proof_bundle`             | `owned-mobility`     | 90 days       | day 90          | 730 days          | `platform_admin` / `ops_user`, plus tenant-scoped `tenant_admin`; retrieval policy is defined here without reopening proof-capture runtime |

Interpretation rules:

- `hot retention` is the minimum period evidence stays in primary operational
  storage.
- `archive cutover` is the point where the evidence family should be moved out
  of hot storage during future archival automation.
- `archive retention` is the minimum preservation window after cutover.
- `2555 days` is the Phase 1 long-retention default for filing and audit
  families that are likely to back external reviews or regulator requests.

## 3. Access Enforcement

Repo-local access gates now apply to these read surfaces:

- `GET /audit`
- `GET /audit/evidence-policies`
- `GET /audit/evidence-policies/:family`
- `GET /reports/jobs`
- `GET /reports/:jobId`
- `GET /tenant/reports/jobs`
- `GET /tenant/reports/:jobId`
- `GET /filing-packages`
- `GET /filing-packages/:packageId`
- `GET /callcenter/sessions`
- `GET /callcenter/sessions/:callId`
- `GET /partner/eligibility/:eligibilityVerificationId`
- `GET /tenant/webhooks/deliveries`
- `GET /tenant/webhooks/:webhookId/deliveries`
- `GET /tenant/audit`

Enforcement notes:

- tenant evidence routes must match `x-tenant-id`; cross-tenant evidence access
  is rejected
- partner eligibility evidence can only be read by the exact partner identity
  or internal admin/ops users
- call recordings stay internal-only because current call-session authority is
  not tenant-scoped
- every allowed read or download emits an audit entry that includes the evidence
  family, access action, and retention-policy version

Live activation note:

- `call_recording` and `filing_package` retention rules are repo-static until
  `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` blocker
  evidence is attached. `EXT-004-BLK-001` to `EXT-004-BLK-008` define the CTI
  callback, recording export, filing-package activation, signed-download,
  audit, and retention sign-off evidence required before these families can be
  described as live-proven.

## 4. Legal Hold Workflow

Legal hold is supported for all evidence families in this matrix.

1. `platform_admin` or `ops_user` places the hold with a case number, evidence
   family, subject reference, and reason code.
2. Any future deletion or archive-compaction worker must skip held evidence
   until release is recorded.
3. Only `platform_admin` can release a hold.

Required hold reasons:

- complaint escalation
- regulatory inquiry
- settlement dispute
- internal investigation

## 5. Deletion Exceptions

Deletion and archive-compaction must be suppressed when any of these are true:

- the evidence is under legal hold
- a filing package, complaint, settlement dispute, or regulator packet still
  references the same evidence subject or manifest
- the evidence is the most recent audit trail for a still-active webhook
  disablement or eligibility dispute

Family-specific notes:

- call recordings are preserved while the linked complaint, call dispute, or
  regulator request remains open
- report artifacts stay recoverable from archive while a downstream filing or
  dispute references the same manifest hash
- audit logs are never hard-deleted while linked incident or regulator
  references remain unresolved
- proof bundles inherit the same hold/deletion rules even though proof capture
  runtime stays owned by other slices

## 6. Sensitive-Data Baseline

This runbook builds on `OPX-ID-003`; it does not replace it.

Still governed by `OPX-ID-003`:

- masking of recording IDs, partner references, and hashed eligibility tokens
- signed-download generation and TTL
- plaintext secret exposure rules

Added by `OPX-CM-005`:

- retention windows by evidence family
- archive cutover defaults
- legal-hold and deletion-exception rules
- audited evidence-read enforcement for repo-local surfaces

## 7. Verification

Code verification anchors:

- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/api exec tsc --noEmit`
- `pnpm --filter @drts/api exec vitest run tests/unit/evidence-governance.test.ts tests/unit/callcenter.service.test.ts tests/unit/reporting-filing.service.test.ts tests/unit/tenant-partner.service.test.ts`

Review expectations:

- check the policy matrix against the accepted blueprint and SA gap documents
- confirm tenant/partner scope checks reject cross-scope evidence reads
- confirm each read/download audit entry carries the family and policy version
