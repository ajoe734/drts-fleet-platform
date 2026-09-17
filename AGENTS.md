# Deployment scope and VM restriction

User instruction (2026-09-07): Do not deploy or run this project's development environment on this VM, to avoid another suspension. The subsequent request to deploy dev refers to the project's documented shared dev environment; it does not revoke this VM restriction.

- Do not start project development servers, local preview servers, browser test servers, or Docker Compose development infrastructure on this VM.
- Do not add services, scheduled jobs, or restart policies that start the development environment on this VM.
- Read `.github/workflows/deploy-dev.yml`, `docs/ops/branch-strategy.md`, and `docs/03-runbooks/smarttransport-tw-custom-domains.md` before preparing dev deployment. The deployment workflow is the executable source of truth; older local-development documents do not override the user's VM restriction.
- Shared dev uses GCP Cloud Run. On 2026-09-08, the user explicitly requested a replacement for the suspended project. Live GitHub `DEV_GCP_*` variables now target `drts-dev-devcc-20260825`, region `us-central1`; `nodal-alloy-503700-s3` is the suspended historical target. Verify live variables before deploying; do not infer the target from older documentation.
- Use the authorized deploy workflow with an immutable publish/release reference or full commit SHA. Do not substitute a VM deployment when cloud authentication or billing is unavailable.
- Preserve existing database volumes, source files, and user data. Record machine-specific evidence under `.local/`.
- Only an explicit user instruction specifically permitting development hosting on this VM can change the VM restriction.
- User instruction (2026-09-08): the supervisor and auto workers DO run on this VM — this is the development machine, and the orchestrator is repository tooling, not the product runtime. This permits the supervisor process, its workers, their git worktrees, and repository-level checks (typecheck, lint, unit tests). It does not lift the restriction above: workers still must not start product dev servers, browser/E2E test servers, or Docker Compose infrastructure here. A task that needs a running environment is recorded blocked with its concrete blocker instead.
- The 2026-09-07 suspension was a content/ToS matter (real financial-institution identifiers plus public exposure defaults, see `GCP-TOS-REMEDIATION-20260907`), not VM compute load.
