# SR-QA-TENANT-001 — tenant daily work, quotas and integration acceptance

## Candidate and recovery

The published initial candidate is `5b5ee7cf6e9f0ffb2f775923053839aa54af37ad`
(PR #1962), based on `75136fe3e7c9d143e6a0dbd012e8ec8856ae8127`.
This continuation preserves that history on an isolated branch,
`codex/sr-qa-tenant-ci-repair-20260911`. Its final immutable candidate is
recorded in the handoff; no self-referential SHA is claimed here.

The initial CI run `34560675511`, job `103142600974`, failed because
`tools/ci/test_tenant_uat_acceptance_workflow.py` was outside every invocation
in `ci.yml` and `ci-integ.yml`. Supervisor authorized the single tenant
validator invocation added to `ci-integ.yml`. Downstream skipped CI jobs are
not passing checks. The initial branch's 24 unit tests and 5 HTTP specs also
did not establish the complete required live capability matrix.

This document supersedes the earlier claims that mail delivery and durable
readback were outside the task's time/scope. Both required acceptance keys and
all original capability coverage remain required. There is no acceptance cut.
Historical unit sources (`3cc1a3911`) and HTTP-spec sources (`0f06b8745`) remain
preserved through the initial candidate.

## Implemented acceptance matrix

| Capability | HTTP/negative cases | Independent persistence evidence |
| --- | --- | --- |
| Users and invitations | Existing create/role/cross-tenant spec plus actual SMTP receipt, resend invalidates old token, successful one-time accept, duplicate accept denied, revoke denied, readonly create denied | Same user ID in `admin.phase1_tenant_user_roles`; accepted active user read again after API restart |
| Passengers and addresses | Existing create/update/invalid/cross-tenant cases; additional real passenger-to-address link | Same IDs and owner link in both PostgreSQL tables and post-restart HTTP |
| Cost centers and quotas | Cost-center lifecycle; policy creation, readonly denial, successful booking ledger, zero quota blocks booking without ledger writes | Cost-center/policy/ledger records matched by tenant and resource ID; restart readback |
| Rules and approvals | Existing rule evaluate/reorder/disable; pending approval, forbidden reviewer/cross-tenant access, approve and duplicate denial, linked booking approved | Approval-rule/request/ledger and actual persisted order records retain booking/order links; restart readback |
| SLA | Existing positive/invalid/readonly/header-forgery cases; isolated threshold update | Same tenant's SQL profile and post-restart HTTP thresholds |
| Tenant lifecycle and integration settings | Authorized create/settings/onboarding/suspend/activate; duplicate/missing/invalid quota/tenant-role denial | Exact tenant record, configured integration package and quotas in PostgreSQL and post-restart HTTP |
| Feature flags | Tenant override mutation through platform authority; tenant actor denied; other tenant/global unchanged; unknown key disabled | Exact tenant/key PostgreSQL row and post-restart HTTP |

The suite contains 10 HTTP tests in 8 spec files. New probes use real
`APIRequestContext` requests and read-only SQL on the runner's migrated
PostgreSQL. No authoritative service, repository, identity or HTTP response is
mocked in these acceptance cases. Existing unit tests remain supplementary
regressions.

`acceptance-context.ts` captures the final expected state for each same-ID
resource after checking both HTTP and PostgreSQL. `restart-readback.ts` runs
in another process after the original API process has terminated and a new
API process has started over the unchanged database. It requires coverage of
12 explicit persistence tables and verifies every captured HTTP/DB state.
Intermediate states of a repeatedly updated resource are checked before the
final restart expectation replaces them.

## GitHub-hosted runner and boundaries

`tenant-uat-acceptance.yml` installs/builds the immutable candidate once,
creates real tenant records/users and durable JWT sessions through the
compiled AppModule, then starts the API. This order lets the HTTP process
load the seeded state from PostgreSQL. It runs the full HTTP and unit matrix,
restarts the API without resetting the database, verifies all captured IDs,
and fails if any capability file, test result or restart evidence is absent.

The runner provides a dedicated Mailpit SMTP receiver (release `v1.29.2`),
wired through the existing production `MailpitSmtpTransport` and durable mail
outbox. Invitation tests fetch the actual received message, consume its token
only in memory and retain the receiver message ID. This proves controlled
SMTP delivery when executed; it makes no claim about delivery to a public
email provider. Bearer/invitation tokens and raw email bodies are not written
to acceptance artifacts.

Evidence includes candidate/workflow SHA, resource IDs, redacted HTTP calls,
SQL-matched expectations, unit/HTTP reports, restart report, process PID
transition and run status. GitHub disposes the isolated PostgreSQL/Mailpit
services after the job; the workflow always stops its API process and uploads
available evidence. No product, browser, SMTP or database server runs on the
worker VM.

## Local verification and remaining evidence

- `python3 -m unittest tools/ci/test_tenant_uat_acceptance_workflow.py -v`:
  32 tests passed, including execution of the embedded gate/status Python with
  missing-mail, missing-governance, missing/failed-restart and skipped fixtures.
- `python3 tools/ci/check_test_coverage.py`: all 69 tracked Python test files
  yield tests CI runs; the original CI discovery defect is fixed locally.
- Task-scoped ESLint, YAML parse and `git diff --check` passed.
- Playwright `--list` only: 10 tests in 8 files discovered; no server or browser
  started. Listing is not execution evidence.
- Focused strict TypeScript for the six new/updated QA implementation files: exit 0.
- Unchanged tenant unit regression: 2 files / 24 tests passed, exit 0, after linking
  the isolated worktree to the existing installed package dependencies. Initial
  missing-dependency collection failures were environmental and were resolved;
  they are not product regression results.

The expanded live HTTP/PostgreSQL/SMTP/restart runner has not been executed
on this VM. Its actual GitHub run and artifacts, independent review,
candidate CI/merge and both required acceptance keys are still necessary:
`tenant_daily_work_quota_and_integrations_write_readback` and
`tenant_role_and_cross_tenant_negative_evidence`. Code and local checks alone
do not mark either acceptance complete. Any product failure reproduced by the
runner must become an explicitly scoped producer before QA acceptance closes.

The first expanded remote run `34566322674` for candidate
`fb6eaf046c024f214357db7b9278a75e226d96fe` completed migrations and the API
build but did not reach HTTP execution: `pnpm exec tsx` was unavailable in the
root package after frozen installation. `tsx` is declared by `apps/api`, so
both seed and restart verification now invoke that workspace's installed
binary while retaining repository-root working directory. Its artifact says
`not_run`; this infrastructure failure is not a product acceptance result.

The second run `34566678302` at `81e8599b72d5ec7fa4372936d23c1783f8b7b092`
seeded real tenant records and JWT sessions successfully, then the unchanged
API startup guard rejected the runner's missing explicit `AUTH_MODE`.
The workflow now declares `NODE_ENV=test` and `AUTH_MODE=test`, which the
production configuration validator accepts; it continues using actual signed
JWTs and durable session validation. No authentication guard was bypassed.
A normal merge of dev `25ecae6295898d80883f03a9f5a1276fab03ab24` preserves
existing OPS validator registration and the tenant validator together.

Seed output now forwards GitHub masking commands only to the job console;
those commands are excluded from the appended execution-log artifact. A
synthetic-token regression verifies that masking remains active, the token
is not archived and prior migration/build evidence is preserved.

The post-merge full local `pnpm run typecheck` was attempted and exited 2
because this isolated worktree's shared installed dependencies do not resolve
existing `@drts/api-client`, `@drts/ui-tokens`, `pg` and `pdfjs-dist` imports
outside this task. Focused tenant strict TypeScript passed. Full typecheck on
the exact merged candidate still requires the clean frozen-install CI result;
this local environment failure is not reported as a successful full check.
