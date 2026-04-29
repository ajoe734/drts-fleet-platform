# Phase 1 Sensitive Data Governance Matrix

Status: accepted implementation baseline for `OPX-ID-003`

## Scope

This matrix defines the Phase 1 enforcement baseline for sensitive-data
classification, masking, download control, and secret handling across
`tenant-partner`, `driver-profile`, `reporting-filing`, and shared API
utilities.

`OPX-CM-005` remains the follow-on slice for full archival, legal-hold, and
evidentiary-retention materialization. This document fixes the live masking and
secret-governance rules that already apply at runtime.

## Enforcement Anchors

- Masking decisions are owned by the backend API layer, not by frontend-only UI logic.
- Plaintext secrets may be shown only on first issuance where explicitly intended.
- Controlled download URLs are signed, time-limited, and audited on issuance.
- Audit trails store masked summaries for PII-bearing updates instead of raw values.
- Event and webhook histories keep version and status metadata, but do not expose raw secrets.

## Classification Matrix

| Data family                                   | Examples                                                                                    | API view policy                                                                                                                                  | Export / download policy                                                                                                 | Audit / log policy                                                                                                           | Storage / runtime policy                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Tenant and driver PII                         | passenger full name, mobile, email, address text, emergency contact, driver contact details | Owning CRUD workflow may read/write the canonical value; masked summaries are used for secondary audit surfaces                                  | Reporting and artifact surfaces must not emit raw contact values unless a dedicated business flow explicitly requires it | Audit stores masked names, phones, emails, address text, and account-holder names; info logs must not print raw contact data | Canonical records stay in source-of-truth tables; cross-service events should use reference IDs instead of raw PII       |
| Partner references                            | `benefitReference`, `issuerAuthorizationRef`, `referenceToken`                              | Operational services may retain raw canonical values internally when required for booking or settlement joins                                    | Reporting surfaces expose only masked previews in the form `prefix...suffix`                                             | Audit stores status / reason outcomes instead of raw partner references                                                      | Reference tokens are persisted only as hashes where supported                                                            |
| Tenant API keys                               | issued tenant API key plaintext, key prefix, masked suffix                                  | Plaintext key is returned only from issue / rotate responses; all fetch/list views remain masked                                                 | No export surface may include plaintext key material                                                                     | Audit records key IDs, names, scopes, and masked views only                                                                  | Persist only hashed key material plus non-secret metadata                                                                |
| Partner ingress API keys                      | partner bootstrap ingress secrets                                                           | Never returned by API responses                                                                                                                  | Not exportable                                                                                                           | Rejected / accepted auth attempts may record key IDs, never the key value                                                    | Runtime config comes from environment / secret manager inputs and is compared by hash only                               |
| Webhook secrets and delivery signatures       | webhook secret, signature header, delivery payload body                                     | Webhook endpoint views expose secret preview and version metadata only; delivery views expose signature preview and secret version metadata only | Not applicable beyond delivery inspection; raw payload bodies stay internal                                              | Audit records retry, status, and rotation metadata, never raw secret or raw body                                             | Secret rotation is versioned; signing uses server-side secret storage only                                               |
| Recording identifiers and sensitive artifacts | `callId`, `recordingId`, report downloads, filing package downloads                         | Report-detail views expose masked call / recording identifiers plus signed download metadata                                                     | Signed artifact URLs are time-limited to 15 minutes and must be re-issued through an authorized API call                 | Every signed artifact issuance records an audit entry with artifact type, subject, and expiry                                | Production signing secret must come from environment configuration; no production hardcoded download secret is permitted |

## Environment and Secret Inputs

- `CONTROLLED_DOWNLOAD_SIGNING_SECRET`
  Required outside test runs before any report, filing, or other controlled
  download artifact can be issued.
- `CONTROLLED_DOWNLOAD_HOST`
  Optional override for the signed artifact host. Defaults to the local
  `downloads.drts.local` bootstrap host.
- `CONTROLLED_DOWNLOAD_KEY_ID`
  Optional key identifier for download-signing rotation metadata.
- `CONTROLLED_DOWNLOAD_TTL_MINUTES`
  Optional override. The Phase 1 default is 15 minutes.
- `PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT`
  Environment-backed partner ingress key for the Alpha airport program.
- `PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT`
  Environment-backed partner ingress key for the Beta airport program.

## Implementation Notes

- `tenant-partner` now hashes partner ingress credentials before comparison and
  no longer keeps plaintext bootstrap partner keys in code.
- `driver-profile` and `tenant-partner` audit records now emit masked summaries
  for PII-bearing fields.
- `reporting-filing` masks recording and partner-reference identifiers in report
  detail payloads and audits every artifact-download issuance.
- Shared controlled-download utilities now default to a 15-minute TTL and
  require a configured signing secret outside test mode.
