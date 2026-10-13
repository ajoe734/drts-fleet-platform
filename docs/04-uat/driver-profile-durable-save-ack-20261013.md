# DRIVER-PROFILE-DURABLE-SAVE-ACK-20261013

Owner Codex; reviewer Codex2. Scope is C060 Profile saved acknowledgement, not
the already accepted explicit surname field or active settings UI. Source
baseline is accepted merge `4671ccda0bee867942bf278b240d896d287e488c` (surname
candidate `96f6099ebd24f557689c7baf84bb0391cbd93b98`, PR #2615). Parent full-scope
tasks remain blocked. Task specification is the dispatch's
`.local/driver-profile-durable-save-ack-20261013-root/task-spec.json`.

## Original findings and before-fix proof

- Profile `createProfile`, `updateProfile`, `upsertAdminProfile` publish memory
  and audit before `persist` fire-and-forget upsert. Missing/disabled repository
  silently returns. Controller immediately wraps the result as success.
- Registry `createDriver` consumes `upsertAdminProfile` synchronously and then
  publishes its master record; registry controller immediately wraps success.
- Device link/refresh/revoke also upsert whole profile snapshots. Pending saves
  need bounded per-driver write coordination to preserve these current fields.
- The old surname test `discloses asynchronous persist: response precedes write;
failure is reported` explicitly asserts historical false ACK. Owner reported
  the precise contradiction via `progress` at 2026-10-13 14:33 UTC for Supervisor
  narrow adaptation. The follow-up records the exact adaptation within the
  explicitly reserved test hunk; no expanded scope or additional user facts.
  Historical candidate/history remains immutable.

`pnpm exec vitest run tests/unit/driver-profile-durable-save-ack-20261013/baseline.test.ts`
on baseline `4671ccda` at 14:34 UTC: exit 1, **6 business assertion failures + 1
positive control pass**, zero skips. Create/update/admin each returned fulfilled
while external storage was pending or rejected. Production caller/service and
repository execute unchanged; only the external `DatabaseService.query` boundary
is controlled. Success control exercises repository JSONB serialization and
`loadAll` into a fresh service. No fake SQL schema, HTTP server, PG server or
business-function replacement. Machine evidence:
`.local/driver-profile-durable-save-ack-20261013/evidence/baseline-4671.log` in
the assigned task worktree. An initial misplaced test file yielded no collected
files (exit 1); recorded separately as `baseline-setup-no-files.log`, **not**
counted as defect reproduction.

## Implementation and scope

`createProfile`, `updateProfile`, and `upsertAdminProfile` now enqueue by driver,
build from the latest committed state, require an enabled repository, and await
production `upsert`. A missing/disabled repository rejects with HTTP 503
`DRIVER_PROFILE_STORAGE_UNAVAILABLE`. Query rejection is reported with the
existing context and rethrown. Memory and successful-save audit publish only
following successful storage. Validation/identity errors, explicit surname
rules, omitted legacy property absence, contact/bank handling and response
clones retain their existing predicates.

Both Profile controller writes await the saved record before building the
unchanged envelope. Registry `createDriver` awaits the existing admin-profile
producer before publishing its master or audit, and its controller awaits the
service before wrapping success. A local pending-create reservation preserves
existing 409 duplicate-create behavior across the new await and releases on
failure; it changes no registry persistence policy.

Device link/refresh/revoke still publish locally synchronously and retain
inherited best-effort persistence. Their whole-record database writes now share
the per-driver queue: only their captured device fields are applied over the
latest committed profile fields at execution. A profile save completing during
a device change preserves the current device state locally; subsequent queued
device writes carry the acknowledged profile fields. This prevents the observed
local snapshot races without changing device/auth callers, retry/timeout policy,
or introducing a registry/profile transaction. Ordering is process-local, not
cross-instance locking or distributed atomicity.

Exactly four existing test files receive await/rejection syntax and necessary
enabled external-query fixtures using the actual repository. Every existing
business value/predicate and all 37 surname cases remain, except the one reported
historical false-ACK assertion necessarily becomes awaited rejection with
unchanged explicit-surname input, error and report context. Its old behavior and
source candidate remain documented above. No cases are skipped/deleted.

## Acceptance evidence

Canonical machine evidence directory:
`/home/lupin/workspace/drts-fleet-platform/.local/driver-profile-durable-save-ack-20261013-root/evidence/`.
The final `candidate-evidence.json` records the complete candidate SHA, command
results, source/report hashes, remote/PR identity and versions; candidate SHA is
external to this document to avoid a self-referencing commit. Original raw logs
also remain in the task worktree evidence directory stated above.

| Finding / required acceptance                                    | Source and change                                                                                                    | Before → after                                                                                                                                                          | Command / version / evidence                                                                                                                                  | Remaining limits                                                                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `driver_profile_saved_ack_waits_real_storage`                    | Profile service three producers, `saveProfile`, Profile controller create/update                                     | Immutable 4671: 6 failures + 1 positive control → same reproducer 7 passes; focused 26 passes                                                                           | Baseline log above; final `candidate-focused.json` / `.log` and candidate manifest; Node 22.23.2, pnpm 10.33.0, Vitest 4.1.4                                  | Actual repository with controlled external query; genuine PG commit/restart not established                          |
| `driver_profile_durable_failure_and_existing_caller_regressions` | Registry service/controller awaits, duplicate reservation, service device coordination, four exact old test adapters | Rejection/pending/no DB, prior committed surname/legacy/contact retention, retry, queue isolation, duplicate creates and device interleavings pass; surname 37 retained | Focused 26; related root 171 (includes focused and surname), API 131; zero failures/skips, exit 0; final `candidate-root.json`, `candidate-api.json` and logs | Device local publication and registry own best-effort storage remain inherited; no full regression/transaction claim |
| `driver_profile_durable_ack_same_candidate_review_ci_merge`      | Normal branch commits/push; exact candidate handoff to original Codex2                                               | Independent review / matching hosted CI / protected merge pending at owner handoff                                                                                      | Final candidate manifest supplies SHA, remote/PR head and hashes. Existing lifecycle records review/CI/merge/generation after handoff                         | Owner does not self-approve, merge, record external acceptance or call done                                          |

Commands (all repository-only, no server):

```bash
pnpm exec vitest run tests/unit/driver-profile-durable-save-ack-20261013
pnpm exec vitest run \
  tests/unit/driver-profile-durable-save-ack-20261013 \
  tests/unit/driver-explicit-surname-profile-capture-20261013/profile-capture.test.ts \
  tests/unit/driver-profile.test.ts tests/unit/driver-profile.repository.test.ts \
  tests/unit/driver-device-session.test.ts tests/unit/regulatory-registry.test.ts \
  tests/unit/client-integration.test.ts tests/unit/driver-app-settings-form.test.ts \
  tests/security/iam-driver-authz-enforcement.test.ts tests/security/iam-route-driver-negative.test.ts
pnpm --filter @drts/api exec vitest run \
  tests/unit/driver-profile.service.test.ts tests/unit/regulatory-registry.service.test.ts \
  tests/unit/auth-bootstrap.test.ts
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
pnpm exec tsc -p .local/profile-ack-typecheck.json --noEmit
# Scoped ESLint and Prettier use the 12 task paths in candidate-evidence.json.
git diff 4671ccda0bee867942bf278b240d896d287e488c HEAD --check
```

Final candidate test commands add `--reporter=json --outputFile=<evidence>/<name>.json`;
exact commands and exit codes are recorded in the manifest. Focused cases are
included in related-root total, not counted twice.

API typecheck initially failed on missing nodemailer due to shared install links
targeting a deleted unrelated worktree (`api-typecheck.log`, exit 2). Only this
task's ignored `apps/api/node_modules` was changed from a shared-directory symlink
to a local symlink farm with SHA512-verified copies of the already pinned cache
packages nodemailer 10.0.12 / @types 8.0.2; shared dependencies and manifests were
untouched (`dependency-repair.json`). API typecheck rerun passed.

Initial scoped test/source typecheck (`scoped-typecheck.log`, exit 2) found a
new fixture generic inference issue, fixed using `Awaited<T>`, and an unchanged
pre-existing cast in `apps/api/tests/unit/regulatory-registry.service.test.ts`
(the cast of private `drivers` to a public record shape, originally present on
4671). That unrelated cast was not edited. Final scoped config includes the new
leaf, existing surname/root Profile/API Profile tests and their transitive
production sources, and passes (`candidate-scoped-typecheck.log`); registry
**runtime** tests still all pass. No claim that the inherited registry test cast
or full root/workspace typecheck is fixed. Initial ESLint found an unused new
test import; removal makes scoped ESLint pass. Initial adapter run had one
incorrect nested await in a rejection assertion plus the historical false-ACK
case: both narrowly adapted; final reports supersede it, raw failures retained.

## Remaining external gates

Formal profile schema remains `infra/migrations/V0018A__driver_profiles.sql`;
production repository serialization/load are exercised, but the query fixture
is not a PostgreSQL database. True hosted PG commit/readback/restart, actual HTTP
guards/driver role, Android AND iOS/native/manual, identity/legal/Receipt and
full-system acceptance are not proved by this source unit. GET seed/fallback
semantics and module initialization remain inherited. The original blocked
parent tasks/roles/acceptance keys are unchanged. No VM product environment,
browser/PG/HTTP/Docker server, deployment or direct workflow dispatch.

## R1 rework after independent review of 48358fd3 (2026-10-13)

Historical evidence above remains the first candidate's owner record. Codex2
reopened `48358fd3a0c9168ec7535cdba09992c486edf4c7` at
`2026-10-13T14:58:50Z`, generation `ab54e27b8c864133a7d771bcc140ea53`, for
**R1 [P2]: admin aliases bypass canonical per-row serialization and lose
acknowledged fields**. The actual path also includes
`RegulatoryRegistryController.createDriver -> RegulatoryRegistryService.createDriver -> upsertAdminProfile`.
Admin input `driver-demo-001` queued under that literal ID while
`resolveBaseProfile` wrote `drv-demo-001`; canonical profile/device writers used
the latter queue. Two pending queries could target the same record, and a
phone-only patch or device write reverted a successfully acknowledged admin
name/surname. The reviewer found the canonical-ID control passed.

The repair only resolves the admin's queue key through the existing
`resolveDriverId` before enqueueing. Current record lookup, input validation,
returned canonical identity, and the inherited admin audit resource/action
policy keep their original implementation. Aliases and bootstrap prefixes now
share the same queue as canonical profile and device writes. No new identity,
device persistence, or registry-wide transaction policy is introduced.

The new `alias-serialization.test.ts` calls actual production services,
repository and registry controller. External query commit/rejection alone is
controlled, using the existing dedicated fixture. Twenty cases cover both demo
aliases, a trimmed bootstrap prefix, canonical-ID controls, admin success and
rejection followed by a canonical phone patch/device write, registry alias
callers, and identity rejection. It checks queue timing, committed surname own
property, memory, repository reload, audit identity and recovery after failure.

Before source modification, these cases against exact HEAD `48358fd3` exited 1:
**14 business assertion failures, 6 controls passed, zero skips**. The initial
after run was 19/20: one new test incorrectly compared decorated registry
`profileUpdatedAt` after the separate successful phone PATCH. Its no-master-
publication assertion moved before that patch commits. The **final unchanged
20 cases** were then rerun with the complete immutable `48358fd3` service source
loaded from a git object at its real module path: again **14 failures + 6
controls**, exit 1. Production controller/registry/repository source matches the
reviewed SHA; no business function is mocked or active worktree reset. Final
source passes all **20/20** within the affected-root report.

Supervisor's V2 spec at
`/home/lupin/workspace/drts-fleet-platform/.local/driver-profile-durable-save-ack-20261013-root/task-spec-v2.json`
(SHA256 `664ffbfffc32cc232791958f69368f4bff192d2ed0961438d2a06e5c954103f8`)
also reserves the exact Settings fixture adapter. The accepted Settings merge
`ed7afc8d5825befbbc9c3c5c48cef7c8de0cce27` was merged normally into this task
branch in `84bc7761b`; inherited Settings product files/helper/cases are unchanged
from that merge. The actual unadapted `legacy-control` probe exited 1 with
`DRIVER_PROFILE_STORAGE_UNAVAILABLE`, confirming the missing enabled repository
and asynchronous seed obstruction. The CJS fixture now constructs the actual
repository with a controlled enabled external query, awaits its original seed
before mounting, and awaits PATCH inside its existing catch before JSON response.
All **16 original Settings caller scenarios** and **7 helper cases** pass;
their assertions/values and accepted source history are preserved. This is a
test adapter, not a production Settings change or real PG evidence.

Rework evidence is append-only under the existing artifact directory:
`/home/lupin/workspace/drts-fleet-platform/.local/driver-profile-durable-save-ack-20261013-root/evidence/r1/`.
`candidate-evidence.json` supplies the final full SHA, PR head, source/report
hashes, exact commands, execution SHA and results. Previous candidate manifests
and raw logs remain immutable. The source checks ran on anchored `675f0b0c0`;
the final closeout adds this report only, with identical tested source hashes.

| Finding / required acceptance                                                              | Source and change                                                                                  | Before → after                                                                                     | Commands / results / evidence                                                                                                                                                        | Remaining limits                                                                                              |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| R1 / `driver_profile_durable_failure_and_existing_caller_regressions`                      | `DriverProfileService.upsertAdminProfile` resolved queue key; dedicated alias cases                | Reviewed 48358: 14 failures + 6 controls → final 20/20                                             | `before-48358-final-cases.json` / `.log`, `before-driver.service.ts`, loader config; `affected-root.json`; Vitest 4.1.4, Node 22.23.2, pnpm 10.33.0; before exit 1, after exit 0     | Process-local queue; no distributed writer/PG/restart claim                                                   |
| S1/S2 V2 caller adapter / `driver_profile_durable_failure_and_existing_caller_regressions` | Settings CJS actual repository, seed await, PATCH await/catch                                      | Unadapted `legacy-control` exits 1 storage unavailable → original 16 callers + 7 helper cases pass | `settings-before-adapter.log`, `affected-root.json`; affected root **214**, API **131**, all pass, zero skips, exit 0; all **37** prior surname cases retained                       | Native/router/store/fetch and external query are controlled; no actual HTTP/native acceptance                 |
| `driver_profile_saved_ack_waits_real_storage`                                              | Existing saved producers/controller awaits/storage guard and device/caller coordination retained   | Original 4671 failure proof retained; original dedicated 26 plus new R1 20 all pass                | Dedicated **46** cases included in affected-root 214; pending/success/rejection/missing-disabled/query serialization/load checks are production logic with external query controlled | Actual repository boundary proof only; original genuine hosted PG/role/mobile/manual gates remain outstanding |
| `driver_profile_durable_ack_same_candidate_review_ci_merge`                                | Normal immutable commits, merge of accepted dev, non-force pushes, exact final candidate to Codex2 | Old candidate reopened; new independent review / hosted same-head CI / protected merge pending     | Final `r1/candidate-evidence.json`, PR #2617 and canonical lifecycle generation; predecessor CI is not credited                                                                      | No owner approve/merge/done or parent acceptance inference                                                    |

Rework commands:

```bash
# Final cases against the archived, unmodified reviewed production service:
pnpm exec vitest run --config .local/r1-before.config.ts \
  tests/unit/driver-profile-durable-save-ack-20261013/alias-serialization.test.ts
# Original affected-root command above, additionally includes all accepted Settings cases:
# tests/unit/driver-explicit-surname-profile-settings-20261013
# Original affected API command above remains unchanged.
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
pnpm exec tsc -p .local/profile-ack-typecheck.json --noEmit
# Scoped ESLint/Prettier and diff check use the manifest's exact paths/commands.
```

ESLint, scoped source/test typecheck and API typecheck pass, exit 0. API typecheck
first exited 2 because fresh worker setup again linked nodemailer to a deleted
unrelated worktree. Repair changed only this task's ignored API dependency
symlink into a local symlink farm, reconstructed the pinned packages from
SHA512-verified pnpm cache files, and linked its own built contract/auth packages;
shared dependencies/manifests were untouched (`dependency-repair.json`). The
inherited registry-test private/public cast remains outside the scoped typecheck;
its 27 runtime tests pass. Full workspace checks and original external gates
remain unverified. Every local check launched in this round finished and its
result was read before handoff; hosted checks for the final candidate are pending.
