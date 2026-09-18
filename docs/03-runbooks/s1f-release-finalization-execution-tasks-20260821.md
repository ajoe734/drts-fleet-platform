# Stage 1 release finalization execution tasks (2026-08-21)

Planning source:
`docs/02-architecture/s1f-release-finalization-gap-20260821.md`

System design:
`docs/02-architecture/s1f-release-finalization-system-design-20260821.md`

## Current scheduling decision (2026-08-22)

The immediate target is code and required CI completion. `AUD-001` and
`PRE-001` provide the required evidence for that target. `GCP-001`, `DEP-001`,
`UAT-001`, and `CLOSE-001` remain historical and future-live-release records,
but no deployment retry or runtime acceptance should be dispatched while the
live GCP milestone is deferred. Deferral is not acceptance: their live evidence
fields remain unset until those tasks are explicitly resumed.

## Parallel wave A

### S1F-REL-FIN-AUD-001 - Reconcile release status and SHA evidence

Owner: Codex2. Reviewer: Gemini2.

Read active orchestrator machine truth, PR #1451, Git ancestry, release evidence,
and relevant GitHub Actions runs. Produce a discrepancy ledger that names each
candidate, CI, merge, and alleged deploy SHA. Do not mark deployment accepted.

Acceptance:

- Every SHA and workflow URL is classified by lifecycle role.
- PR CI is not labelled as Dev deployment or operational acceptance.
- The ledger identifies which existing completion claims are unsupported.
- No product or deployment configuration is changed.

### S1F-REL-FIN-PRE-001 - Lock and preflight one deployable candidate

Owner: Gemini. Reviewer: Codex.

Select one immutable SHA for final Dev deployment. Verify dependency ancestry,
required CI, workflow syntax, manifests, and local hermetic release gates. Write
a machine-readable candidate lock for downstream tasks.

Acceptance:

- Exactly one full SHA is locked and reachable from reviewed Stage 1 changes.
- Required CI is successful for that SHA or an explicitly traceable merge SHA.
- Deploy workflow syntax and operational manifests validate.
- The lock does not use an unreviewed dirty worktree.

### S1F-REL-FIN-GCP-001 - Verify the external GCP billing gate

Owner: Claude2. Reviewer: Gemini2.

Use read-only project and workflow evidence to determine whether project number
`952590575714` can authorize Artifact Registry operations. If unavailable,
record the current provider error and do not trigger another deploy. Complete
only after the gate is demonstrably open.

Acceptance:

- The configured Dev project, project number, region, and registry are recorded.
- Billing or Artifact Registry readiness is verified without changing projects.
- A closed gate remains non-complete with an exact external remediation note.
- No legacy GCP project fallback is introduced.

## Wave B

### S1F-REL-FIN-DEP-001 - Deploy the locked candidate to Dev

Owner: Gemini2. Reviewer: Claude.

Depends on `S1F-REL-FIN-PRE-001` and `S1F-REL-FIN-GCP-001`.

Run the normal `Deploy - Dev` workflow exactly once for the locked candidate.
Capture image tag, migration result, deployed revisions and URLs. Do not bypass
failed jobs or weaken IAM/runtime configuration.

Acceptance:

- Build and push, migration, service deployment, and health checks succeed.
- The workflow URL and all required job URLs are recorded.
- Deployed revisions identify the locked SHA.
- Paused Partner Booking enforcement succeeds.

## Wave C

### S1F-REL-FIN-UAT-001 - Run same-SHA operational acceptance

Owner: Codex. Reviewer: Gemini.

Depends on `S1F-REL-FIN-DEP-001`.

Run the existing operational browser and HTTP acceptance against the URLs from
the successful deploy. Verify required Stage 1 journeys, candidate headers, and
paused or retired route behaviour.

Acceptance:

- The operational acceptance job succeeds against deployed Dev URLs.
- Every active API/BFF surface reports the deployed candidate SHA.
- Required Stage 1 browser journeys pass with backend readback.
- Partner Booking, Concierge, and Passenger retired surfaces return 404.

## Wave D

### S1F-REL-FIN-CLOSE-001 - Publish truthful final evidence

Owner: Claude. Reviewer: Codex2.

Depends on `S1F-REL-FIN-AUD-001` and `S1F-REL-FIN-UAT-001`.

Replace stale or unsupported completion claims with one final evidence pack.
Reconcile the candidate, CI, merge, deployment, and acceptance SHAs and map the
real results to Stage 1 gates G1-G8.

Acceptance:

- The evidence pack contains no pending fields or PR-CI-as-deploy substitution.
- All lifecycle SHAs are identical or their transition is explicitly proven.
- G1-G8 claims cite actual tests and deployment jobs.
- The follow-up closes only after required deployment and acceptance evidence is present.

## Supervisor rules

- Dispatch all three Wave A roots in parallel.
- Do not dispatch `DEP-001` while `GCP-001` is non-complete.
- Do not auto-retry a billing-denied deploy.
- Treat GitHub Actions and GCP responses as external evidence, not code defects.
- Keep the original `S1F-REL-001` history; this follow-up is the authoritative
  correction and finalization chain.
