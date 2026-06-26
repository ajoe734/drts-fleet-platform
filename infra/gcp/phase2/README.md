# GCP Phase 2 AV Sandbox — Repo-Local Infra Plan

This directory records the repo-local Phase 2 AV/Tesla sandbox infra plan. It
is configuration only. Nothing here is wired to live `gcloud`, Terraform, or
deployment workflows in this task.

## Files

- `av-sandbox-infra-config.json`
  - canonical storage bucket, Pub/Sub, CMEK, and Secret Manager naming plan
  - retention and object-hold posture for each evidence family
  - no live project mutation

## Storage Layout

The canonical bucket families for `P2-NFR-001` are:

- `raw-provider-events`
- `telemetry-archive`
- `video-normal`
- `video-incident-locked`
- `investigation-bundles`
- `regulatory-reports`

All six buckets require versioning. The incident/investigation/regulatory
families use stronger hold posture than routine telemetry/video.

## CMEK / Secret Wiring

The JSON file encodes the intended wiring shape:

- one Phase 2 key ring per environment
- one logical CMEK key per bucket family
- runtime secrets stored in Secret Manager and mounted only into the workers
  that need them

The task intentionally stops at documentation/config:

- no key-ring creation
- no bucket creation
- no topic creation
- no secret provisioning

## Pub/Sub Topics

The planned topics are:

- `provider-events-ingest`
- `telemetry-normalized`
- `video-ingest`
- `evidence-manifest-created`
- `regulatory-report-requested`
- `dr-restore-verify`

Each ingestion/reporting topic declares retention and dead-letter behavior in
the JSON config so downstream apply tooling can consume a stable contract later.
