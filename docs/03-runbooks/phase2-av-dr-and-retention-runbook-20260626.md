# Phase 2 AV DR And Retention Runbook

**Status:** repo-local planning artifact only  
**Task:** `P2-NFR-001`  
**Scope:** storage layout, retention policy, CMEK/Secret wiring, and disaster
recovery procedure for the Phase 2 Tesla/AV sandbox evidence plane

## 1. Purpose

This runbook defines the non-live-operational baseline for Phase 2 AV storage
and evidence recovery. It does not claim a deployed GCP environment. Its role
is to make the intended bucket/topic/retention/restore contract explicit before
live apply work begins.

## 2. Canonical Storage Families

| Family | Bucket | Versioning | Retention | Hold posture | Retention lock | CMEK key |
| --- | --- | --- | --- | --- | --- | --- |
| Raw provider intake | `raw-provider-events` | on | 30 days | none | off | `provider-events` |
| Telemetry archive | `telemetry-archive` | on | 365 days | none | off | `telemetry-archive` |
| Routine video | `video-normal` | on | 30 days | none | off | `video-normal` |
| Incident video | `video-incident-locked` | on | 2555 days | default event-based hold | off | `video-incident-locked` |
| Investigation bundles | `investigation-bundles` | on | 2555 days | default event-based hold | off | `investigation-bundles` |
| Regulatory reports | `regulatory-reports` | on | 2555 days | none | on | `regulatory-reports` |

Rules:

- `video-normal` must never be used for incident-linked or regulator-bound
  evidence.
- `video-incident-locked`, `investigation-bundles`, and
  `regulatory-reports` are evidentiary families. Objects there are append-only
  from an operational point of view.
- retention lock is a bucket policy on `regulatory-reports`; it is not modeled
  as an object-hold mode.
- Versioning stays enabled on every bucket so restore drills can replay object
  generations, not only the latest object body.

## 3. Pub/Sub Topology

| Topic | Purpose | Retention | Ordering | Dead-letter |
| --- | --- | --- | --- | --- |
| `provider-events-ingest` | raw Tesla/provider event fan-out | 7 days | yes | yes |
| `telemetry-normalized` | validated telemetry for downstream consumers | 7 days | yes | yes |
| `video-ingest` | clip upload + checksum seal orchestration | 7 days | yes | yes |
| `evidence-manifest-created` | manifest verify + bundle assembly | 14 days | yes | yes |
| `regulatory-report-requested` | regulator export generation | 14 days | yes | yes |
| `dr-restore-verify` | restore drill orchestration | 14 days | no | optional |

Operational intent:

- the ingest path must use durable queue semantics, not in-memory buffering
- dead-letter topics are mandatory for provider, telemetry, video, manifest,
  and regulator flows
- dead-letter topic names in the canonical config are logical names without
  environment prefixes; deployment tooling may compose physical names later
- `dr-restore-verify` is reserved for rehearsals and post-incident replay

## 4. Secret Manager And KMS Wiring

### Secret Manager

Secret names are environment-scoped but logically stable:

- `tesla-fleet-api-client-id`
- `tesla-fleet-api-client-secret`
- `tesla-fleet-api-private-key`
- `av-webhook-shared-secret`
- `av-evidence-signing-secret`

Mounting rules:

- API runtime may resolve all five at runtime.
- Tesla sync workers may resolve only `tesla-fleet-api-client-id` and
  `tesla-fleet-api-client-secret`.
- Tesla command workers may resolve only `tesla-fleet-api-private-key`.
- Provider ingest workers may resolve only `av-webhook-shared-secret`.
- Evidence bundle workers may resolve only `av-evidence-signing-secret`.
- No frontend surface may read these secrets directly.

### KMS

- one key ring per environment, region `asia-east1`
- canonical key-ring name is `drts-phase2-av-<env>` even if deployment-time
  bucket prefixes are overridden
- one CMEK key per storage family
- 90-day rotation for raw/telemetry/routine-video keys
- 60-day rotation for incident/investigation/regulatory keys

Access rules:

- bucket service agents encrypt/decrypt only the bucket family they own
- DR operators use break-glass access only during an approved recovery window
- restore drills must prove that a manifest can be verified without widening
  routine runtime permissions

## 5. Policy-Driven Retention

Retention is driven by data family, not by application caller:

| Family | Policy outcome |
| --- | --- |
| Raw provider intake | automatic expiry after 30 days unless copied into evidence bundle lineage |
| Telemetry archive | retained 365 days for replay, quality audit, and safety review |
| Routine video | automatic expiry after 30 days |
| Incident video | preserved 2555 days and released only through explicit hold workflow |
| Investigation bundles | preserved 2555 days |
| Regulatory reports | preserved 2555 days under retention lock |

Policy constraints:

- application code may request a stricter hold but never shorten baseline
  retention
- any incident case referencing `video-normal` must copy the required clip into
  `video-incident-locked` before case closure
- release of event-based holds requires recorded case disposition and audit log

## 6. Telemetry Data-Quality Table

| Field | Required | Rule | Action on breach |
| --- | --- | --- | --- |
| `externalVehicleRef` | yes | must map to one active sandbox vehicle | reject sample after validation |
| `capturedAt` | yes | timestamp skew within 120s of ingest time | quarantine raw payload, mark feed degraded |
| `locationLat` | yes | range `-90..90` for motion events | fail normalization |
| `locationLng` | yes | range `-180..180` for motion events | fail normalization |
| `speedMps` | conditional | if present, `>= 0` and `< 90` | quarantine sample, no clamping |
| `batteryLevelPct` | conditional | if present, `0..100` | drop field, emit provider-quality warning |
| `autonomyState` | yes | must match enabled schema enum | reject normalization and block new AV dispatch for affected vehicle |
| `online` | yes | explicit boolean in normalized telemetry | send to dead-letter and mark degraded |
| `sourceSchemaVersion` | yes | must match enabled provider capability requirement | open schema drift incident |
| `sourceSignatureRef` | evidentiary flows | required for command/investigation/regulator evidence | block bundle sealing |

## 7. Disaster Recovery Procedure

### Trigger Conditions

Run this DR procedure when any of the following is true:

- one of the six Phase 2 storage buckets is unavailable or corrupted
- Pub/Sub backlog cannot drain in-region within the agreed RTO window
- evidence manifest verification fails for a regulator-bound case
- KMS key access regression prevents evidence decryption

### Recovery Goals

- restore raw intake and telemetry archive first
- preserve evidentiary chain-of-custody before resuming new dispatch
- keep ROC in degraded monitoring mode until manifest verification passes
- do not admit new AV dispatch while incident video or manifest integrity is
  unverified

### Procedure

1. Declare `AV_STORAGE_DEGRADED` incident and freeze new AV dispatch creation.
2. Put ROC into degraded mode:
   - telemetry is read-only
   - no remote mission board actions requiring fresh evidence
   - no new AV dispatch admits
3. Confirm the affected family:
   - raw intake
   - telemetry archive
   - routine video
   - incident video
   - investigation bundle
   - regulatory report
4. Restore the affected bucket in this order:
   - last known good object generation
   - prior replicated generation if available
   - offline investigation bundle copy
5. Drain `dr-restore-verify` with one restore job per family.
6. Re-run manifest verification:
   - object count matches manifest
   - every checksum matches
   - every evidentiary object still points to the expected CMEK key family
7. Rebuild queue position:
   - replay `provider-events-ingest`
   - replay `telemetry-normalized`
   - replay `video-ingest`
   - replay `evidence-manifest-created`
   - replay `regulatory-report-requested`
8. Validate that regulatory report packages and investigation bundles can be
   downloaded and verified without bypassing normal access controls.
9. Resume ROC active operations only after:
   - manifest verification passes
   - backlog drain is green
   - degraded telemetry alerts are closed
10. Resume new AV dispatch last.

## 8. Restore Test Checklist

- restore one sample object generation from every bucket family
- restore one manifest with at least three artifact entries
- prove checksum parity for each manifest item
- prove incident video remains under hold after restore
- prove regulatory report objects remain locked
- prove replayed telemetry does not create duplicate downstream manifests

## 9. Non-Claims

This runbook does not claim:

- live GCP resources already exist
- live multi-region replication is already configured
- live Tesla credentials are provisioned
- live AV dispatch can be resumed automatically

Those steps belong to a later apply/deploy wave with separate evidence.
