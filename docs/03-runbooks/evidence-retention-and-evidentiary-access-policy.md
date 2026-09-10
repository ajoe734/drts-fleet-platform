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
| `call_recording`           | `callcenter`         | 30 days       | day 30          | 700 days          | `platform_admin` and `ops_user` only; every read is audited                                                                                |
| `report_artifact`          | `reporting-filing`   | 30 days       | day 30          | 365 days          | `platform_admin` / `ops_user`, plus tenant-scoped `tenant_admin`; signed download issuance is audited                                      |
| `filing_package`           | `reporting-filing`   | 90 days       | day 90          | 640 days          | `platform_admin` / `ops_user`; package download issuance is audited                                                                        |
| `audit_log`                | `audit-notification` | 180 days      | day 180         | 550 days          | `platform_admin` / `ops_user`, plus tenant-scoped `tenant_admin`; audit evidence reads are audited                                         |
| `webhook_delivery`         | `tenant-partner`     | 30 days       | day 30          | 365 days          | `platform_admin` / `ops_user`, plus tenant-scoped `tenant_admin`; delivery-history reads are audited                                       |
| `eligibility_verification` | `tenant-partner`     | 90 days       | day 90          | 730 days          | `platform_admin` / `ops_user`, tenant-scoped `tenant_admin`, and matching `partner_api_key`; reads are audited                             |
| `proof_bundle`             | `owned-mobility`     | 90 days       | day 90          | 730 days          | `platform_admin` / `ops_user`, plus tenant-scoped `tenant_admin`; retrieval policy is defined here without reopening proof-capture runtime |
| `voice_booking_evidence`   | `voice-booking`      | 90 days       | day 90          | 640 days          | `platform_admin` / `ops_user` only; secondary views mask confirmation/receipt IDs and hashes; 730 days total                               |
| `voice_transcript`         | `voice-booking`      | 30 days       | day 30          | 150 days          | `platform_admin` / `ops_user` only; 180 days statutory ceiling; cards/passwords masked; 15-min signed download audited                     |
| `voice_recording_audio`    | `voice-booking`      | 30 days       | day 30          | 150 days          | `platform_admin` / `ops_user` only; 180 days provider ceiling; signed URL 15-min TTL with mandatory access audit                           |
| `voice_live_buffer`        | `voice-booking`      | 1 day         | none (hot_only) | 0 days            | `system` only; transient in-memory / session buffer; cleared after disconnect recovery window; never logged                                 |
| `voice_telemetry`          | `voice-booking`      | 180 days      | day 180         | 550 days          | `platform_admin` / `ops_user`; 730 days total; de-identified aggregation without phone, address, or transcripts                             |

Interpretation rules:

- `hot retention` is the minimum period evidence stays in primary operational
  storage.
- `archive cutover` is the point where the evidence family should be moved out
  of hot storage during future archival automation.
- `archive retention` is the minimum preservation window after cutover.
- Total preservation for a family is `hot retention` plus `archive retention`.
- **Undefined retention prohibition**: As mandated by SD §9.2 and UV-EXEC-021,
  no evidence family or record may have undefined or indefinite retention.
  Defaulting to permanent retention without an approved policy is strictly prohibited.

### Statutory basis (established 2026-08-20, expanded for Unattended Voice 2026-09-06)

Retention was previously carried by a `2555 days` "long-retention default" with no
cited source. The figures below are now sourced, and two of them went **down**:

| Family                   |    Total | Basis                                                                                                                                                                                                                                                     |
| :----------------------- | -------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proof_bundle`           | 820 days | 汽車運輸業管理規則 §91(4): operational data — vehicle number, booking and pickup/dropoff times, route, mileage, fares, tolls — must be kept **at least two years**. 820 leaves 90 days of margin over the floor.                                          |
| `filing_package`         | 730 days | Same §91(4) floor. **No accounting-law floor applies**: filing packages are not 會計憑證 or 會計帳簿, and a separate accounting system owns those (decided 2026-08-20), so 商業會計法 §38's five- and ten-year periods are out of scope.                  |
| `audit_log`              | 730 days | Same basis as `filing_package`.                                                                                                                                                                                                                           |
| `call_recording`         | 730 days | **This family is the index**, not the audio. Contracts §3.9 places the recording binary with the CTI provider or object store. Held to the order retention period so that PRD §14.2 item 2 — "a phone order whose source cannot be traced" — stays false. |
| `voice_booking_evidence` | 730 days | Confirmation receipts, immutable draft snapshots, and recording checkpoints bound to autonomous phone orders. Anchored to §91(4) two-year floor for trip order source evidence.                                                                            |
| `voice_transcript`       | 180 days | SD §9.2 and 個資法 ceiling: detailed turn dialogues and handoff transcripts are capped at 180 days (with brand-specific reductions permitted). Third-party AI model training on passenger dialogues is strictly forbidden.                               |
| `voice_recording_audio`  | 180 days | SD §9.2 / contracts §3.9: audio media binary retention is bounded by the 180-day CTI provider contract. Short-lived signed download tokens (15-min TTL) are required with per-access auditing.                                                             |
| `voice_live_buffer`      |    1 day | Ephemeral streaming audio frames and interim ASR subtitles are cleared immediately upon session termination and disconnect recovery window timeout; never persisted to long-term logs.                                                                   |
| `voice_telemetry`        | 730 days | Aggregated call performance and cost ledger entries retained for financial reporting and regulatory cost reconciliation. Telemetry labels must omit passenger contact details and transcripts.                                                           |

Two constraints pull in opposite directions and both are load-bearing:

- §91(4) is a **floor**. Below two years the operator is non-compliant.
- 個資法 and its 施行細則 make retention a **ceiling**: personal data may be kept
  only for the period law or contract requires. Filing packages, recordings, and
  transcripts carry passenger and driver data, so an unsourced seven-year default was
  exposure, not safety. That is why two families were shortened rather than
  extended.

### Why no L1 revision was needed

`docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
is an L1 file and states the old `audit_log` baseline of 180 hot and 2555 archive.
It also delegates: 「若法務調整，以 evidence retention policy 的新版為準」. This
document is that policy, so the delegation resolves the conflict without an L1
edit or a decision packet. A reader who reaches the L1 baseline first is sent
here by the same sentence.

### Audio recordings: 180 days, and not held here

The audio itself is retained **180 days** (decided 2026-08-20). That is a term of
the CTI provider contract, not a setting in this repository — DRTS holds the
index and the provider holds the binary. §91(4) does not list recordings among
the operational data it governs, so no statutory floor conflicts with 180 days.

The index outliving the audio is deliberate. After day 180 a phone order still
resolves to a `call_id` and a `recording_id`; the audio behind it is gone. Callers
that need the distinction should read `recording_missing` (contracts §3.9), which
already exists for the case where an index arrives without audio.

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

Added by `UV-EXEC-021` (Unattended Voice Booking Data Governance):

- **Disclosure & Refusal Alternative Policy**: Callers who refuse AI disclosure or call recording are safely routed to approved alternative workflows (human transfer on unrecorded desk, or SMS self-booking link). Refusal is recorded with policy version (`uv-policy-20260906-v1`) without creating automated recording bookings.
- **Sensitive Ingress Redaction**: Spoken payment cards (13-19 digits), CVV security codes, passwords, PINs, and OTP verification codes are intercepted and masked at ingress (`[REDACTED_PAYMENT_CARD]`, `[REDACTED_SECRET]`, etc.). Spoken turns containing sensitive secrets trigger policy warnings redirecting away from telephone credential transmission. General application logs and QA datasets are strictly sanitized.
- **Immutable Route Profiles**: Published voice route profiles `(profile_id, version)` are strictly append-only and cannot be overwritten. Sessions pin their route profile version at admission to prevent in-flight behavioral drift.
- **Unverified Provider Gate**: Telephony and AI providers whose data protection terms, data residency, or third-party training opt-outs are unverified are blocked from receiving live passenger data.
- **Admission Kill Switch & In-Flight Protection**: Global, brand, line, or language kill switches immediately suspend new call admissions (`outcome: overflow`), recording admissions in `voice.call_admission` for provider billing reconciliation and routing to backup IVR/human queues. In-flight sessions, pending command receipts, and existing confirmed orders are strictly preserved and reconciled to completion.

## 7. Verification

Code verification anchors:

- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/api exec tsc --noEmit`
- `pnpm exec vitest run tests/unit/uv-exec-021.test.ts`
- `pnpm --filter @drts/api exec vitest run tests/unit/evidence-governance.test.ts tests/unit/callcenter.service.test.ts tests/unit/reporting-filing.service.test.ts tests/unit/tenant-partner.service.test.ts`

Review expectations:

- check the policy matrix against the accepted blueprint and SA gap documents
- confirm tenant/partner scope checks reject cross-scope evidence reads
- confirm each read/download audit entry carries the family and policy version
- confirm voice evidence families enforce retention bounds ("未定義保存期限不能默認永久")
- confirm spoken payment cards and passwords are fully redacted from general logs
- confirm admission kill switches reject new admissions while preserving in-flight commands and orders
