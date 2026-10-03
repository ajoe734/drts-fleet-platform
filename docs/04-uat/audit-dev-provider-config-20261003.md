# Dev artifact provider configuration closure

Task: `AUDIT-DEV-PROVIDER-CONFIG-20261003` — Pi / independent reviewer Codex.

## Finding and repair boundary

At baseline `c00a4439a`, `deploy-dev.yml` replaces API environment variables and secret mounts with explicit complete sets. Neither set included the merged proof S3/clamd settings or the document-artifact S3 settings being implemented by `AUDIT-ARTIFACT-DURABILITY-20261002`. A manual Cloud Run setting therefore could not survive this deploy, and merging a provider adapter did not wire its deployment.

`operations/deployment/resolve-dev-artifact-providers.py` now resolves an explicit allowlist from repository/environment variables (`toJSON(vars)`), validates the complete configuration, checks only required Secret Manager **metadata**, and emits suffixes consumed by the existing API env/secret steps. It never reads a secret version, creates cloud resources, grants IAM, deploys, or probes a provider. No client/web credentials or public exposure defaults change. Existing WIF, SMTP, candidate-binding, active inventory, migration and smoke gates remain intact.

Fully absent configuration emits `unprovisioned` for both storage providers and the scanner. Partial or unknown configuration, in-memory/synthetic providers, malformed endpoints, ordinary-variable credentials, incomplete/inaccessible managed secrets and delimiter/output injection fail before any suffix is published. Missing provider configuration is NOT a live acceptance pass.

## Operator configuration contract

For each prefix `REMITTANCE_PROOF` and `DOCUMENT_ARTIFACT`:

| GitHub variable | Meaning |
| --- | --- |
| `DEV_<PREFIX>_STORAGE_PROVIDER` | `s3` or `unprovisioned` (default). |
| `DEV_<PREFIX>_S3_BUCKET` | Required private bucket when s3 is selected. |
| `DEV_<PREFIX>_S3_REGION` | Required S3 region, not inferred from the GCP deployment region. |
| `DEV_<PREFIX>_S3_ENDPOINT` | Optional HTTPS endpoint; no userinfo, query, fragment or output delimiters. |
| `DEV_<PREFIX>_S3_FORCE_PATH_STYLE` | Optional exact `true`/`false`, default false. |
| `DEV_<PREFIX>_S3_AUTH_MODE` | `secret` (default), or explicit `default-chain` only with an independently provisioned/verified AWS SDK credential chain. This is a deploy resolver option, not a new API env var. |
| `DEV_<PREFIX>_S3_SESSION_TOKEN_ENABLED` | Optional exact true/false; default false. Requires secret auth mode. |

Secret mode requires pre-existing managed secrets named `<DEV_SECRET_PREFIX>-<lowercase-prefix>-s3-access-key-id` and `...-s3-secret-access-key`. Convert underscores in the prefix to hyphens. With the normal `drts-dev` prefix, examples are `drts-dev-remittance-proof-s3-access-key-id` and `drts-dev-document-artifact-s3-secret-access-key`. Enabling session tokens additionally requires `...-s3-session-token`. Each is mounted at the matching API variable `<PREFIX>_S3_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` or `_SESSION_TOKEN`, version `latest`. Credential VALUES must not go into GitHub variables or this document.

Cloud Run's Google service account is **not automatically an AWS SDK credential chain**. The resolver defaults to secret references for that reason. `default-chain` requires operator evidence; it does not claim a GCS XML endpoint implements the adapter's conditional-write semantics. This helper neither chooses/provisions a backend nor certifies its durability, versioning, retention or permissions.

Scanner variables:

- `DEV_REMITTANCE_PROOF_SCANNER_PROVIDER`: `clamd` or default `unprovisioned`.
- `DEV_REMITTANCE_PROOF_CLAMD_HOST`: required for clamd; proof S3 storage must also be configured.
- `DEV_REMITTANCE_PROOF_CLAMD_PORT`: integer 1–65535, default 3310.
- `DEV_REMITTANCE_PROOF_CLAMD_TIMEOUT_MS`: integer 100–60000, default 15000.
- `DEV_REMITTANCE_PROOF_CLAMD_TLS`: exact true/false, default true. False requires an explicitly approved private-network setup; native clamd has no authentication. This helper does not provision a tunnel, certificates or antivirus engine.

The document variable names were inspected in the artifact owner's implementation worktree and coordinated through the canonical task note. That task's independently reviewed merge remains a separate deployment prerequisite; this configuration helper alone cannot supply a missing application implementation.

## Offline verification

`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tools/ci/test_dev_artifact_providers.py -v`: **16 tests pass**, with parameterized negative matrices covering both namespaces, missing/partial settings, provider/credential denial, HTTPS endpoints, shell/output injection, clamd ranges, managed-secret metadata failures, no partial outputs and actual workflow wiring. Tests inject the external metadata boundary and never invoke real cloud commands, product services, listening sockets or databases.

Both normal CI workflows explicitly execute the regression module. `python3 tools/ci/check_test_coverage.py`: all **82** tracked Python test files yield tests wired into CI. `node tools/ci/check-repo-classification.mjs`: **5845** repository files classified before adding this document. `git diff --check` passes. Independent review and hosted CI must bind the final candidate SHA recorded in the handoff; these owner results are not approval or deployment.

## Read-only environment evidence and remaining gates

On 2026-10-03, live GitHub variables were re-read: `DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825`, `DEV_GCP_REGION=us-central1`, Cloud SQL `drts-dev-devcc-20260825:us-central1:drts-dev-db`, runtime identity `drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com`. The suspended historical `nodal-alloy-503700-s3` target is not used. The full canonical deploy workflow and both mandatory runbooks were read, then changes against current origin/dev were read before editing the isolated worktree.

No `DEV_REMITTANCE_PROOF_*` or `DEV_DOCUMENT_ARTIFACT_*` variables were present in that read-only query. Machine-specific evidence: `.local/project-fixes-20261002/provider-variable-presence-20261003.json`. This proves configuration is absent from that variable scope; it does not prove secrets/buckets are absent or supply their values. No cloud credentials or resources were invented to make the gate green.

Remaining: artifact and voice application implementations/reviews, explicit backend/scanner selection and provisioning, real DB/object-store/clamd/browser/provider acceptance, and the authorized shared Cloud Run deploy of a full immutable accepted bundle SHA. Existing live gates remain open. No workflow dispatch, environment deployment, VM hosting, secret access or paid provider call was performed by this task.
