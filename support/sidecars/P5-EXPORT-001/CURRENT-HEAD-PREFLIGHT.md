# P5-EXPORT-001 Current-Head Preflight

## Authority

- Task: `P5-EXPORT-001`
- Fleet: F
- Authoritative head: `8f0a8cf3bfcfb11a6afece2ccf28bf592d56941f`
- Authoritative PR: `#1131`
- Working branch: `codex/p5-export-001-backend`
- Worktree: `/tmp/drts-p5-export-001`
- Initial worktree status: clean

## Landed baseline

PR `#1130` landed as
`2711c366f2e103ae9556d5afaf4558dfd9b0bb4c` and already provides:

- canonical multi-taxi operational-record queries;
- record masking for CSV rows;
- `multi_taxi_records:read` and `multi_taxi_records:export` route scopes;
- the Platform Admin records page and its legacy synchronous CSV response.

The existing reporting authority is `ReportingFilingService`, backed by
`admin.phase1_report_jobs`. It already owns:

- persisted report-job state;
- asynchronous job execution;
- report artifact hashing;
- controlled-download signing;
- report-artifact evidence policy and access audit.

## Confirmed gap

The landed multi-taxi CSV route does not yet provide:

- a scoped server-side preview and count;
- a required export purpose;
- persisted `pending` / `running` / `completed` / `failed` states;
- idempotent export-job creation;
- a dedicated status response that does not expose a download before
  authorization;
- a freshly issued, short-lived controlled-download URL with actor audit.

## Implementation decision

Extend the existing reporting authority with a dedicated
`multi_taxi_trip_records` report-job path. Do not create a second export
repository, table, worker, artifact signer, or audit subsystem.

The dedicated API will:

1. preview the canonical #1130 export scope and record count;
2. create a persisted report job with purpose, actor, and idempotency metadata;
3. expose job status without artifact rows or download credentials;
4. issue a fresh controlled-download URL only after completion and a new
   authorization check.

## Collision boundary

Allowed write surfaces:

- `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`
- generic reporting contracts only where the shared job status/type must
  recognize this job;
- `apps/api/src/modules/reporting-filing/**`
- `apps/api/src/modules/multi-taxi/multi-taxi.controller.ts`
- `apps/api/src/modules/multi-taxi/multi-taxi.module.ts`
- the backend route-auth policy for the dedicated export-job prefix;
- targeted API tests;
- this sidecar.

Explicitly excluded:

- Platform Admin shell, navigation, routes, pages, and translations;
- all other UI;
- canonical canvas and specification documents;
- legal-hold create/release commands;
- deployment or publication.

Legal-hold create/release remains `command-pending`.
