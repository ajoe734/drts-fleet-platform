# SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930

Owner: Codex. Reviewer: Claude2. Status: implementation checkpoint; **not a review candidate**.

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

## Findings and acceptance evidence

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

## Checks at this checkpoint

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
