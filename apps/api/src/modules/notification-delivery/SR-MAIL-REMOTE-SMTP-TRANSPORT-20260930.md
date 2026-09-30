# SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930

Owner: Codex. Reviewer: Claude2. BOOT-01/STORAGE-01 owner repairs are complete;
see the latest repair evidence below. Candidate identity, independent review and
hosted CI remain governed by the task lifecycle; this artifact does not close the task.

## Configuration and behavior

`createMailTransportFromEnv` selects the new `RemoteSmtpMailTransport`, the
existing loopback-only Mailpit adapter, or no transport. The old
`createMailpitSmtpTransportFromEnv` export remains a compatibility entry point for
existing callers. Remote and Mailpit configuration together is rejected.

The remote adapter requires all five environment variables:

- `REMOTE_SMTP_HOST`: explicit DNS hostname (no URL or provider preset).
- `REMOTE_SMTP_PORT`: exactly `465` (implicit TLS) or `587` (required STARTTLS).
- `REMOTE_SMTP_USERNAME` and `REMOTE_SMTP_PASSWORD`: SMTP AUTH credentials.
- `REMOTE_SMTP_FROM_EMAIL`: provider-verified envelope and MIME sender.

If any remote setting is supplied, missing/empty required values fail factory
construction with a fixed `SMTP_CONFIGURATION_INVALID` error. With no remote
settings, existing Mailpit/disabled behavior is preserved. The adapter accepts no
TLS-verification override; it requires TLS 1.2 or newer and validates certificates
and hostnames. Nodemailer logging and content/file/URL access are disabled.
The [Nodemailer SMTP options](https://nodemailer.com/smtp) describe the transport
options; the pinned implementation is also exercised by the wire tests below.

`REMOTE_SMTP_RECIPIENT_ALLOWLIST` is comma-separated complete addresses or exact
domains, case-insensitive. `person@example.test,approved.test` allows that address
and mailboxes directly at `approved.test`; it does not allow subdomains, wildcards,
display names, plus-address variants of the complete address, or multiple
recipients in one address. Unless `DRTS_ENV` is exactly `production`, an absent or
blank list rejects every send with `SMTP_RECIPIENT_ALLOWLIST_REQUIRED`; an address
outside it fails with `SMTP_RECIPIENT_NOT_ALLOWLISTED`. These permanent errors are
stored in the real delivery attempt by `NotificationDeliveryService.dispatch`,
with no retry or fabricated successful receipt. Local Mailpit behavior is retained.

Only the final SMTP DATA acceptance creates a `ProviderAcknowledgement`.
The bounded response retains the provider's status and queue identifier while
redacting credentials (including AUTH base64 representations). A provider queue
ID is extracted only when present; the locally generated Message-ID is never
used as a substitute. Library exceptions and raw AUTH errors never escape the
adapter or become outbox records.

Dev mounts Secret Manager references `drts-dev-smtp-host`, `-port`, `-username`,
`-password`, `-from-email`, and `-recipient-allowlist`. All six must exist to
mount any; a partial set aborts deployment. No set preserves disabled behavior.
The sender secret also supplies existing callers' `NOTIFICATION_FROM_EMAIL`.
The workflow does not read credential values into the runner. Live repository
variables were checked on 2026-09-30: `drts-dev-devcc-20260825`, `us-central1`,
secret prefix `drts-dev`. No deployment or real mail send was performed.

## Initial checkpoint findings and acceptance evidence (historical)

Baseline: `64b47218d` (full SHA available in branch history). Initial published
adapter checkpoint: `4df072542`. The next checkpoint contains the tests and this
evidence. No candidate has been locked because BOOT-01/STORAGE-01 remain open.

| Finding / acceptance                                           | Source and change                                                                                                                                                                                                              | Baseline → current result                                                                                                                                                                           | Command / evidence                                                                                                                                                                                                                                                                       | Remaining limits                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote SMTP unavailable                                        | `smtp-mail.transport.ts:createMailTransportFromEnv`, `remote-smtp-mail.transport.ts:RemoteSmtpMailTransport`                                                                                                                   | Baseline factory returns null with complete remote config → real adapter authenticates and sends through both TLS modes                                                                             | Baseline actual source extracted under `.local/SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930/`; `pnpm --dir apps/api exec tsx` probe exit 0; `baseline.log`                                                                                                                                     | No live provider account/inbox supplied                                                                                                                                                                 |
| `tls_enforced_and_credentials_never_logged`                    | Remote constructor, `send`, `#redact`                                                                                                                                                                                          | New adapter tests pass: rejected/missing/disconnected STARTTLS, untrusted certificates on 465/587, wrong hostname, positive AUTH, hostile provider credential echoes on errors and acknowledgements | `tests/unit/notification-delivery/remote-smtp-mail.transport.test.ts`; checks console calls, surfaced errors, object inspection, persisted outbox                                                                                                                                        | Tests substitute random loopback destination and trust only the generated fixture CA; SMTP/AUTH/TLS verification use real Nodemailer/Node code                                                          |
| `non_production_recipient_allowlist_enforced`                  | Remote `send`; existing `NotificationDeliveryService.dispatch`                                                                                                                                                                 | Exact address/domain positive cases pass; outside/missing/malformed lists and injection cases reject; denied attempt has a nonretryable auditable reason                                            | Same unit suite; real `FileMailOutbox` and dispatch/readback                                                                                                                                                                                                                             | Real hosted PostgreSQL/recipient delivery not exercised                                                                                                                                                 |
| `provider_acknowledgement_captured`                            | Remote `send`; existing attempt acknowledgement persistence                                                                                                                                                                    | Final `250` and queue ID persisted; missing queue ID stays null; disconnect before acceptance rejects; credential echoes redacted                                                                   | Same unit suite, both TLS modes, real service/outbox                                                                                                                                                                                                                                     | SMTP acceptance does not prove delivery to a human inbox                                                                                                                                                |
| `all_or_nothing_transport_configuration` (adapter/workflow)    | Factory and `NotificationDeliveryModule.fromEnvironment`; deploy secret block                                                                                                                                                  | All missing legacy behavior retained; every missing required value/invalid port fails; actual workflow block tests all 64 secret subsets                                                            | `tests/unit/notification-delivery/deploy-dev-smtp.test.ts`; gcloud existence checks stubbed, no cloud operations                                                                                                                                                                         | **Full application startup gate remains blocked by BOOT-01**                                                                                                                                            |
| **BOOT-01 — unresolved**: partial remote config with no outbox | `audit-notification.module.ts:createAuditNotificationDeliveryService`; `tenant-partner.module.ts:createTenantInvitationNotificationDeliveryService`; `regulatory-registry.module.ts:createRegistryNotificationDeliveryService` | All three return null before calling the shared transport factory, so partial config does **not** fail startup                                                                                      | Actual factories called by `.local/SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930/bootstrap-probe.test.ts`; `pnpm exec vitest run --config .local/SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930/probe.config.ts --maxWorkers=1` exits 1; **3 assertions fail**, proving the gap (`bootstrap-probe.log`) | Need Supervisor scope expansion for these three module files; validate config before optional storage early returns                                                                                     |
| **STORAGE-01 — unresolved**: dev has no mail outbox selection  | Same factories; `.github/workflows/deploy-dev.yml`; existing `PostgresMailOutbox`                                                                                                                                              | Secret mounts alone still leave invitation/audit factories unavailable on Cloud Run                                                                                                                 | Static inspection: two factories only support `NOTIFICATION_OUTBOX_DIRECTORY`; registry needs explicit postgres flag; workflow currently sets neither                                                                                                                                    | Need same scope expansion to reuse existing `DatabaseService`/`PostgresMailOutbox` for these callers and opt in to postgres when enabling SMTP; do not use ephemeral Cloud Run files as durable storage |

Supervisor scope coordination was recorded with `ai-status.sh progress` on
2026-09-30. No additional module write was made outside the assigned scope.

## Checks at the initial checkpoint (historical)

- PASS (exit 0): affected regression, 11 files / 132 tests:
  `pnpm exec vitest run tests/unit/notification-delivery tests/unit/system-remediation/sr-notify-001 tests/unit/system-remediation/sr-mail-001 tests/unit/system-remediation/sr-mail-002 tests/unit/system-remediation/sr-credential-expiry-20260913/postgres-mail-outbox.test.ts --maxWorkers=2`.
  Local output: `.local/SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930/unit.log`.
- PASS (exit 0): API typecheck after building `@drts/contracts` and
  `@drts/control-plane-auth`. Initial attempts failed only because these local
  generated declarations were absent; they were built and the check rerun.
- PASS (exit 0): new test TypeScript check using the root tsconfig with include
  restricted to `tests/unit/notification-delivery/**/*.ts` (local `typecheck.json`).
- PASS (exit 0): scoped ESLint and Prettier; `git diff --check`.
- PASS: lockfile diff adds only nodemailer 10.0.12 and @types/nodemailer 8.0.2;
  existing dependency resolutions are unchanged.
- FAIL (exit 2): broader root TypeScript check, outside the changed scope: missing
  local declarations for api-client/ui-web/ui-tokens and existing possibly-undefined
  `style` errors in `sr-qa-ux-001/c120-accessibility-responsive-focus.test.ts:133-136`.
  This is not reported as a complete-repository typecheck pass.
- FAIL (exit 1), intentionally retained as unresolved defect evidence: BOOT-01
  actual-factory probe, 3 failed startup assertions.
- NOT RUN: hosted CI for a final candidate, independent same-SHA review, PostgreSQL
  integration, shared-dev deployment, real provider/inbox acceptance. No product
  dev server, standalone SMTP service, browser server or Docker was started.

Resume by expanding the three caller scopes, eliminating BOOT-01/STORAGE-01,
moving their probe into a passing permanent regression, and rerunning the affected
checks. Then commit/push, verify PR head equals full local SHA, and hand off to
Claude2. The owner must not call `done` or treat this checkpoint as delivery.

## 2026-09-30 owner repair after Supervisor scope expansion

Review/dispatch source: Supervisor's 2026-09-30T07:20:23Z instruction naming
BOOT-01 and STORAGE-01 and authorizing all three caller modules. Previous
checkpoint: `a473e760abaa6348948973bd8960b3478aa9f90b`; it was never a locked
candidate. Current verified implementation checkpoint:
`6ffdf32924b27d39dc4760ac625a635b743186f8`. The final evidence-only commit does
not alter the tested source or test code. The historical open findings above
are retained for traceability and superseded by the rows below.

All three actual Nest providers now delegate to
`notification-delivery.factory.ts:createNotificationDeliveryServiceFromEnv`.
It calls `createMailTransportFromEnv` before any optional-storage return.
Explicit `NOTIFICATION_OUTBOX_TYPE=postgres` requires an enabled injected
`DatabaseService`; it cannot fall back to a file outbox. With neither storage
nor SMTP configured, existing disabled behavior remains. Local file outbox
configuration remains supported.

The dev secret-selection step now emits `notification_outbox_type=postgres`
only when all six SMTP secret references exist. The API environment step
consumes that output and sets `NOTIFICATION_OUTBOX_TYPE=postgres`. The API's
existing `DATABASE_URL` mount and shared `DatabaseService` pool are reused.
No extra connection pool, table creation at startup, or migration was added.

Schema evidence: `infra/migrations/V0103__notification_mail_outbox.sql` creates
`ops.phase1_notification_mail_deliveries` (including the attempts JSONB that
stores acknowledgements) and `ops.phase1_notification_mail_outbox_lock`.
`Dockerfile.migrate` copies `infra/migrations/` and runs the existing
`operations/database/db-apply.sh`; `deploy-dev.yml` waits for that Cloud Run
migration job before deployment unless the operator explicitly skips migrations.
This confirms the formal schema/deploy route, not that a live database was queried
or migrated during this task. Live GitHub `DEV_GCP_*` variables were read again:
project `drts-dev-devcc-20260825`, region `us-central1`. No deployment occurred.

| Finding / required acceptance                      | Source and modification                                                                                                                                                                                  | Old checkpoint → repaired checkpoint                                                                                                                                                                                                                                                                                                                                             | Verification and evidence                                                                                                                                                                                                                                                                                                                                           | Remaining limits                                                                                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BOOT-01 / `all_or_nothing_transport_configuration` | Shared factory above; `createAuditNotificationDeliveryService`, `createTenantInvitationNotificationDeliveryService`, `createRegistryNotificationDeliveryService` and their actual Nest provider metadata | The initial permanent regression against `a473e760a` had 12 failing / 12 passing assertions, including all three missing-storage startup failures. After repair it passed 24/24; the expanded matrix passes 27/27 on `6ffdf3292`. Tests cover each lone setting, each missing/empty required field, absent/file/postgres storage, disabled behavior and actual injection wiring. | `bootstrap.test.ts`; `bootstrap-before.log` exit 1 (behavior failures, after removing an unnecessary root-only reflect-metadata import); `bootstrap-after.log` exit 0; expanded matrix in `unit-current.log` exit 0                                                                                                                                                 | No full running API bootstrap; actual exported provider factories are called without replacing their configuration logic.                                                                              |
| STORAGE-01                                         | Same factory and three callers; `deploy-dev.yml` secret-selection and API environment blocks                                                                                                             | Old audit/invitation factories ignored postgres and could select files; explicit postgres with a disabled DB fell back. New factories use the injected DB with and without a directory, and reject disabled DB. Old workflow had no outbox environment block; new blocks pass all 64 secret subsets and activate postgres only for the complete set.                             | `bootstrap.test.ts` mocks only `DatabaseService.connect` and verifies real `PostgresMailOutbox` reaches it; `deploy-dev-smtp.test.ts` executes both actual shell blocks and output transfer, stubbing only Secret Manager existence. `storage-before.log` exit 1 documents static missing-block assertion; `storage-after.log` exit 0 and `unit-current.log` exit 0 | No PostgreSQL integration claim: formal V0103 was read, but no local database/server was started. Existing postgres outbox unit tests simulate DB results. Live persistence remains hosted acceptance. |
| `non_production_recipient_allowlist_enforced`      | Unchanged `RemoteSmtpMailTransport.send` and real delivery service/outbox                                                                                                                                | 28 non-listening remote SMTP tests pass, including denial/missing allowlist, permanent auditable reason, injection rejection and factory validation                                                                                                                                                                                                                              | `remote-without-listener.log` exit 0; test-name filter below                                                                                                                                                                                                                                                                                                        | Positive sends remain in hosted wire tests; 15 listener-dependent cases are explicitly skipped locally.                                                                                                |
| `tls_enforced_and_credentials_never_logged`        | Unchanged TLS/AUTH construction, sanitized exceptions and redaction in remote transport                                                                                                                  | Prior checkpoint wire results retained above; no wire-result claim for this repair checkpoint                                                                                                                                                                                                                                                                                    | `remote-smtp-mail.transport.test.ts` is tracked for hosted CI, which must run against the final candidate                                                                                                                                                                                                                                                           | Local SMTP listeners prohibited by this dispatch. Same-SHA hosted TLS/AUTH/credential-echo tests pending at handoff.                                                                                   |
| `provider_acknowledgement_captured`                | Unchanged final DATA acceptance and receipt persistence; durable PostgreSQL wiring added                                                                                                                 | Prior checkpoint receipt tests retained above; V0103 attempts JSONB and actual repository path confirmed                                                                                                                                                                                                                                                                         | Existing remote wire/service suites plus `postgres-mail-outbox.test.ts` in scoped regression                                                                                                                                                                                                                                                                        | Hosted SMTP acceptance/real database/provider/inbox evidence remains pending; no receipt fabricated.                                                                                                   |

### Repair checkpoint verification

All commands completed and their results were read. Logs are under this assigned
worktree's `.local/SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930/`.

- PASS, exit 0, **9 files / 97 tests**, including 27 actual-factory regressions:
  `pnpm exec vitest run tests/unit/notification-delivery/bootstrap.test.ts tests/unit/notification-delivery/deploy-dev-smtp.test.ts tests/unit/system-remediation/sr-notify-001/notification-delivery.test.ts tests/unit/system-remediation/sr-mail-001 tests/unit/system-remediation/sr-mail-002 tests/unit/system-remediation/sr-credential-expiry-20260913/postgres-mail-outbox.test.ts --maxWorkers=2`
  (`unit-current.log`).
- PASS, exit 0, **28 tests; 15 intentionally skipped**:
  `pnpm exec vitest run tests/unit/notification-delivery/remote-smtp-mail.transport.test.ts --testNamePattern='records an auditable|denies all recipients|treats DRTS_ENV|rejects recipient injection|fails startup for malformed|fails module bootstrap|rejects unsupported|preserves disabled/local' --maxWorkers=1`
  (`remote-without-listener.log`). No selected test starts a listener.
- PASS, exit 0: `pnpm --filter @drts/api typecheck` (`api-typecheck.log`),
  after building existing contracts/control-plane-auth declarations. The first
  invocation failed with TS2307 for absent local control-plane-auth build output;
  it was not a product-code defect.
- PASS, exit 0: `pnpm exec tsc -p .local/SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930/typecheck.json`
  (`test-typecheck.log`; extends root tsconfig, includes the notification tests).
- PASS, exit 0: scoped ESLint across notification delivery, all three modified
  caller modules and notification tests (`lint.log`); Prettier for all modified
  source/tests/workflow (`format.log`); `git diff --check 64b47218d HEAD`.
- Dependency diff reviewed again: only nodemailer/@types/nodemailer additions;
  no existing dependency versions changed.
- FAIL, exit 2: `pnpm exec tsc -p tsconfig.json --noEmit`
  (`root-typecheck.log`). Reconfirmed the initial checkpoint's out-of-scope
  missing api-client/ui-tokens/ui-web build declarations (and resulting implicit
  types), plus existing possibly-undefined `style` errors in
  `sr-qa-ux-001/c120-accessibility-responsive-focus.test.ts:133-136`.
  No errors name task-owned files. This is not a complete-repository typecheck
  pass; those existing problems were left outside this task as instructed.
- NOT RUN locally: SMTP listener suites (remote 15 cases and legacy Mailpit
  suite), PostgreSQL integration, browser/dev servers, Docker, cloud deployment,
  actual provider send/inbox arrival. Same-candidate hosted CI and independent
  Claude2 review must still complete; owner must not call `done`.
