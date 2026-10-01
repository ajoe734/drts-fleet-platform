# SEC-INTERNAL-KEY-WIF-MIGRATION-20260930 Manual Unblock

## Scope

- Task: `SEC-INTERNAL-KEY-WIF-MIGRATION-20260930-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `SEC-INTERNAL-KEY-WIF-MIGRATION-20260930`
- Owner: `Gemini`
- Reviewer: `Claude2`
- Audit date: `2026-10-01`

## Diagnosis

`SEC-INTERNAL-KEY-WIF-MIGRATION-20260930` is not blocked by a missing repo-local code change.
It remains blocked because the parent acceptance requires ops to create a GCP secret and run a deployment outside the sandbox.

1. The parent task candidate (PR #2244) successfully wired the GitHub Actions deployment workflow (`deploy-dev.yml`) to pass `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` if the secret exists, and added a conditional `DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED` flag (defaulting to false).
2. Code review by `Claude2` confirmed the code changes were safe and functionally complete within the sandbox limit. 
3. The remaining requirement `excp_002_removed_and_deploy_dev_green` dictates that ops must:
   - Create GCP secret `drts-dev-devcc-20260825-workload-identity-google-service-principals` with real per-caller service-account entries.
   - Run a fresh `deploy-dev.yml` to confirm `AUTH_LEGACY_INTERNAL_KEY_USED` stops appearing.
   - Set `vars.DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED=true` and verify the deploy-dev operational acceptance still passes.
4. None of these ops steps can be executed by the code-only worker inside this sandbox without generating fake data or mutating the shared dev environment directly. The task is therefore blocked on a manual operations step.

## Next Steps

1. A human operator needs to perform the ops steps outlined above in the shared dev environment.
2. Only after these ops tasks are completed, the parent task can proceed to the final step of removing `INTERNAL_KEY_EXCP_002` and the dual-send headers.
