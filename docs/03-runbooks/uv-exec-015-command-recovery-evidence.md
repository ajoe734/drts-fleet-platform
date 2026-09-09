# UV-EXEC-015 command recovery evidence

Owner: Codex2 (supervisor dispatch fallback); reviewer: Gemini.
Design: unattended voice SD §7.1–7.5. Implementation is anchored on
`codex2/uv-exec-015`; this document is not candidate acceptance evidence.

## Implementation boundary

- `VoiceBookingCommandService.accept` authorizes the receipt read first and
  replays the immutable confirmation/draft/snapshot identity before checking
  a live worker or ticket. New acceptance seals proof and an
  `execute_booking_command` work item in one transaction.
- `VoiceCommandRunnerService.execute` uses the sealed command authority after
  hangup or worker handover. It verifies external recording evidence before
  acquiring transaction locks. Session, intent, confirmation and receipt locks
  precede order writes. Lock/statement deadlines bound waiting.
- One transaction inserts the order, patches the current call record, consumes
  confirmation, binds the intent, succeeds the receipt, appends audit intent,
  and creates `request_dispatch`, `notify_booking_result` and
  `publish_booking_audit` work items. Their `payload_ref` is the command UUID;
  their dedupe key is `commandId:workType`. They become visible after commit.
- The downstream work consumers must use that dedupe key and load the durable
  receipt/audit record. This task does not claim driver delivery or passenger
  notification. Dispatch matching starts through SD §7.6 `request_dispatch`.
- `runOnce` leases an execution item for 30 seconds, recovers expired leases,
  and retains the original receipt on transient failures. It is exported for
  the API durable worker loop; no product server or loop was started on this VM.
- Deployment must provide `VOICE_COMMAND_ACCESS` (read/accept authorization and
  command-scoped executor evidence credentials), plus the existing evidence
  reader/access providers. No bearer token is stored in the sealed proof. The
  service fails closed when these providers are absent; model arguments cannot
  supply authority. The API transport/worker composition must wire these ports.

## Local verification

Executed after building `@drts/contracts` and `@drts/control-plane-auth`:

- `pnpm --filter @drts/api typecheck`: passed.
- Targeted ESLint on new implementation and tests: passed.
- Unit regressions: `uv-exec-015`, `uv-exec-014`, `uv-exec-007` passed (the final
  recorded test count is in the task progress note).
- PostgreSQL suite at `tests/integration/uv-exec-015.integration.test.ts` is
  opt-in, consistent with the checkpoint journal suite. Without
  `UV_BOOKING_TEST_DATABASE_URL`, its 14 PostgreSQL cases are **skipped** and
  cannot count as `postgres_atomic_booking_evidence`,
  `receipt_recovery_crash_matrix` or `hangup_command_evidence`.

The initial availability assertion failed because no test URL was configured;
the suite now uses the repository's opt-in pattern so ordinary unit CI does not
require a database administrator connection. This does not waive the task's
PostgreSQL acceptance gate. Neither `DATABASE_URL` nor a dedicated booking test
URL was present in the assigned worker environment.

## Required next verification

On an authorized PostgreSQL test host, configure
`UV_BOOKING_TEST_DATABASE_URL` with a test administrator connection that has
`CREATEDB`, then run:

```bash
pnpm exec vitest run tests/integration/uv-exec-015.integration.test.ts --no-file-parallelism --maxConcurrency=1
pnpm --filter @drts/api typecheck
```

The suite creates and drops only its own random `uv_booking_*` database. It
loads the real runtime snapshot tables, runtime columns and V0086/V0088/V0089/
V0092 migrations. Authentication/evidence provider edges are injected test
ports; command writes use the real PostgreSQL repositories. The cases cover
concurrent duplicates, replay after expiry/hangup, acceptance rollback, lost
accept acknowledgement, five order transaction crash points, lost order
COMMIT acknowledgement, expiry/correction rejection, pending input, lease
recovery and lock deadline. No Docker, development server or browser server is
needed or permitted in the assigned VM.

Keep the task out of candidate handoff until these tests have actually run and
any resulting failures are fixed. Commit and push the resulting candidate,
then hand off its exact SHA to Gemini through `ai-status.sh`; do not use `done`.


## GitHub-hosted PostgreSQL verification

Supervisor authorized the exact `.github/workflows/ci-integ.yml` integration
job extension on 2026-09-09. The job's existing ephemeral PostGIS service
supplies the CREATEDB test connection; no shared or production database and no
VM-hosted development infrastructure is used. The matrix runs before the
unrelated full migration/integration suites, creates and drops its own random
database, and uploads its JSON results under the workflow commit SHA.

The step requires at least the current 14 cases, all passed, none pending or
skipped. A normal unit run that skips this opt-in suite cannot satisfy that
step. The workflow addition is preparation until a completed run supplies
actual results; record its run URL, exact tested SHA and test output before
candidate handoff. This does not replace independent review or the remaining
same-candidate integration checks.


### First hosted result and fixture repair

Run https://github.com/ajoe734/drts-fleet-platform/actions/runs/34301680410
executed SHA 392dc5a84fe47a4dab4082da5e9bbd7ed7b32d67 against real
PostgreSQL: 14 cases ran, 1 passed, 13 failed, none skipped. The concurrent
receipt/order case passed. The remaining cases all failed during fixture
setup at uq_voice_resource_scope_active because every fixture reused the same
brand with an active scope. The fixture now gives each scenario its own brand;
the production unique constraint is preserved. CI root typecheck also found
missing rawText and entranceId in the resolved-address fixture; local root
typechecking then exposed missing geocodeConfidence and resolvedAt. The fixture
now supplies all fields required by VoiceResolvedLocation/ResolvedAddressPayload.
Local root typechecking also reports unrelated duplicate ApiClient declarations
through shared-worktree dependency symlinks; the hosted checkout remains the
authority for the complete root typecheck.

The affected local unit regression command covering UV-EXEC-015/014/007 passed
all 103 cases after this fixture repair. A new hosted matrix run is still
required; the first run is failure evidence, not acceptance.
