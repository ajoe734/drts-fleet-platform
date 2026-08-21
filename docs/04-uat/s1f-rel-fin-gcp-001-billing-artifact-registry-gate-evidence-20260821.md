# S1F-REL-FIN-GCP-001 — GCP billing / Artifact Registry gate evidence (2026-08-21)

Task: `S1F-REL-FIN-GCP-001`. Owner: `Claude2`. Reviewer: `Gemini2`.

Planning ref: `docs/02-architecture/s1f-release-finalization-gap-20260821.md` (GAP `F3`).
System design ref: `docs/02-architecture/s1f-release-finalization-system-design-20260821.md` (`GCP-GATE` lane).
Execution ref: `docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md`.

This is a read-only verification record. It does not deploy, does not change
GCP project configuration, and does not dispatch a new `Deploy — Dev` run.

## 1. Configured Dev project, region, and registry

Source: `gh variable list` against `ajoe734/drts-fleet-platform`, cross-checked
against the `Prepare dev deploy` job's resolved step output in the most recent
`Deploy — Dev` run (job `96661406002` in run `32444483620`).

| Field | Value | Source |
| --- | --- | --- |
| Dev GCP project ID | `drts-dev-ray-tw-20260730` | repo var `DEV_GCP_PROJECT_ID`; confirmed as resolved `project_id` output |
| Dev GCP project number | `952590575714` | GCP OAuth-token-denied error returned for this exact project during `Build & push images`, tied to the `drts-dev-ray-tw-20260730`-scoped `auth`/`setup-gcloud` steps that preceded it in the same job |
| Dev region | `us-central1` | repo var `DEV_GCP_REGION` / `DEV_ARTIFACT_REGION`; confirmed as resolved `region` output |
| Artifact Registry project | `drts-dev-ray-tw-20260730` | repo var `DEV_ARTIFACT_PROJECT_ID`; confirmed as resolved `artifact_project_id` |
| Artifact Registry repository | `drts` | repo var `DEV_ARTIFACT_REPOSITORY` |
| Resolved registry host/path | `us-central1-docker.pkg.dev/drts-dev-ray-tw-20260730/drts` | resolved `registry` output; also appears verbatim in the failed push log line (`failed to push us-central1-docker.pkg.dev/drts-dev-ray-tw-20260730/drts/api:...`) |
| Legacy GCP project (must not be used) | `autotaxi-492811` | repo var `GCP_PROJECT_ID`, surfaced in the workflow only as `LEGACY_GCP_PROJECT_ID` |

No project number lookup via `gcloud projects describe` was available in this
worker session — `gcloud auth list` shows only stale, non-interactive
credentials for this sandbox (`Reauthentication failed. cannot prompt during
non-interactive execution.`) with no live token refresh path. The project
number was instead confirmed from GCP's own error response inside the actual
Workload-Identity-authenticated `Deploy — Dev` job, which is stronger evidence
than a local `gcloud` call because it reflects the real deploy-time identity
and project binding rather than an operator's ambient `gcloud` session.

## 2. Legacy-fallback check

`grep -n "LEGACY" .github/workflows/deploy-dev.yml` shows `LEGACY_GCP_PROJECT_ID`,
`LEGACY_GCP_REGION`, `LEGACY_GCP_CLOUDSQL_INSTANCE`, and
`LEGACY_GCP_RUNTIME_SERVICE_ACCOUNT` are declared once at the `env:` block and
never read anywhere else in the file. `project_id`, `region`, and
`artifact_project_id` are resolved exclusively from `DEV_GCP_PROJECT_ID`,
`DEV_GCP_REGION`, and `DEV_ARTIFACT_PROJECT_ID` (with `DEV_ARTIFACT_PROJECT_ID`
falling back only to the already-resolved Dev `project_id`, never to the
legacy project). No legacy-project fallback exists in the current workflow,
and this verification does not introduce one.

## 3. Billing / Artifact Registry readiness — verified CLOSED

Evidence: `gh run list --workflow=deploy-dev.yml` (most recent run first) and
`gh run view --job <id> --log` against the `Build & push images` job of each
run, read-only via the `gh` CLI (no `workflow_dispatch` triggered by this
task).

Latest `Deploy — Dev` run: `32444483620`
(`https://github.com/ajoe734/drts-fleet-platform/actions/runs/32444483620`),
`workflow_dispatch` on `publish/v2026.08.21.0`, created `2026-08-21T03:45:02Z`,
conclusion `failure`.

- `Prepare dev deploy` (job `96661406002`): succeeded, resolved the config in
  §1 above.
- `Build & push images` (job `96661427636`,
  `https://github.com/ajoe734/drts-fleet-platform/actions/runs/32444483620/job/96661427636`):
  failed at `Build & push — api` with:

  ```text
  ERROR: failed to build: failed to solve: failed to fetch oauth token: denied:
  This API method requires billing to be enabled. Please enable billing on
  project #952590575714 by visiting
  https://console.developers.google.com/billing/enable?project=952590575714
  then retry. If you enabled billing for this project recently, wait a few
  minutes for the action to propagate to our systems and retry.
  ```

- Every downstream job (`DB migration`, `Deploy services`, `Dev health check`,
  `Fail-closed retired service cleanup`, `Candidate SHA operational
  acceptance`) is `skipped`, consistent with the system design's gate ordering
  (image publication must succeed before migration/deploy/acceptance can run).
- `Enforce Partner Booking paused state` succeeded independently; it does not
  depend on Artifact Registry push.

### Persistence check (not a new deploy attempt)

The same billing-denied error, naming the same project number `952590575714`
and the same registry path, appears in every nightly `Deploy — Dev` run for
the preceding five days, confirming this is a standing external state and not
a transient blip:

| Run | Created (UTC) | Source ref | Result |
| --- | --- | --- | --- |
| `32444483620` | 2026-08-21T03:45:02Z | `publish/v2026.08.21.0` | billing-denied |
| `32329127021` | 2026-08-20T03:41:21Z | `publish/v2026.08.20.0` | billing-denied |
| `32213010214` | 2026-08-19T03:40:59Z | `publish/v2026.08.19.0` | billing-denied |
| `32096235996` | 2026-08-18T03:38:58Z | `publish/v2026.08.18.0` | billing-denied |
| `31992102746` | 2026-08-17T03:44:10Z | `publish/v2026.08.17.0` | billing-denied |

No `Deploy — Dev` run was dispatched by this task to re-check the gate. Per
the system design's failure behaviour ("Billing unavailable: keep `GCP-GATE`
non-complete with the current failing run URL and provider error. Do not
repeatedly dispatch deploy runs."), the existing run history above is used
as-is.

## 4. Gate verdict

**`GCP-GATE` = CLOSED / non-complete.**

- Configured Dev project, project number, region, and registry: recorded (§1).
- Billing / Artifact Registry readiness: verified, and found **not ready**.
  Project `drts-dev-ray-tw-20260730` (number `952590575714`) cannot currently
  authorize Artifact Registry push operations because Cloud Billing is not
  enabled on that project.
- No legacy project fallback was introduced or used (§2).
- Exact external remediation: a project owner with Billing Account
  Administrator (or equivalent) access must enable Cloud Billing for project
  `952590575714` at
  `https://console.developers.google.com/billing/enable?project=952590575714`,
  then allow a few minutes for propagation before the next `Deploy — Dev`
  attempt.

This task remains **non-complete** because the external gate is closed. Per
`docs/02-architecture/s1f-release-finalization-gap-20260821.md`, billing
unavailability "must remain explicit and must not be converted into a passing
acceptance record." `S1F-REL-FIN-DEP-001` must not be dispatched while this
gate is closed, and this task must not be reopened to trigger another deploy
attempt — only re-verified read-only once billing is reported enabled.
