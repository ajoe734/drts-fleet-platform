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
  narrow adaptation; historical candidate/history remains immutable.

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

## Acceptance evidence (implementation in progress)

| Finding / required acceptance                                    | Source and change                                                                       | Before → after                              | Command / version / evidence                                         | Remaining limits                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `driver_profile_saved_ack_waits_real_storage`                    | Three service producers and Profile controller                                          | 6 failures + 1 control on 4671; fix pending | Baseline command/log above; Node 22.23.2, pnpm 10.33.0, Vitest 4.1.4 | Controlled query only; genuine hosted PG/restart/manual not established        |
| `driver_profile_durable_failure_and_existing_caller_regressions` | Registry service/controller, device snapshot coordination, four exact old test adapters | Pending                                     | Pending                                                              | Registry own durability/transaction policy inherited; no full regression claim |
| `driver_profile_durable_ack_same_candidate_review_ci_merge`      | Same immutable candidate via normal lifecycle                                           | Pending                                     | Candidate/review/CI/merge pending                                    | Original Codex2 independent review and protected normal merge required         |

Real hosted PG commit/restart, HTTP guards, actual driver role, Android AND iOS,
native/manual, identity/legal/Receipt and full-system acceptance are not proved
by this source unit. No VM product environment or direct workflow dispatch.
