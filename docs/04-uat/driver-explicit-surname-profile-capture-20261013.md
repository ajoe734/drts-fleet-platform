# DRIVER-EXPLICIT-SURNAME-PROFILE-CAPTURE-20261013

Owner: Codex. Reviewer: Codex2. Accepted base: `58fd35646ce9eccd76d4c21f9000b816c3f0b486` (actual-fare dependency is `done`). Frozen scope: `/home/lupin/workspace/drts-fleet-platform/.local/driver-explicit-surname-profile-capture-20261013-root/task-spec.json`.

## Gap and source boundary

Profile API could not capture an explicitly supplied surname. This additive producer accepts optional `driverSurname` in `DriverProfileRecord`, `CreateDriverProfileCommand` and `UpdateDriverProfileCommand`, through actual `DriverProfileService.createProfile`, `updateProfile` and `upsertAdminProfile`. It never derives a surname from `name` or seeds/defaults an identity.

Explicit values must be strings with nonempty text after trimming leading/trailing whitespace, matching existing profile `name` handling. Internal whitespace, compound and Latin surnames remain intact. The existing profile handling has no length cap; this unit introduces none. Null, empty/whitespace-only text, arrays, objects, numbers, booleans and an explicitly present undefined property are rejected with `400 INVALID_DRIVER_PROFILE`, field `driverSurname`, before any profile write, persistence or audit effect. JSON transport drops undefined properties; omitted input is the legacy preserve path. No clear/erase policy is introduced.

Omitted create, seed and historical JSON records retain actual property absence. Omitted PATCH or admin upsert preserves a captured surname. Existing primitive spread clones carry the field without changes to device operations or identity binding. Audit contains presence only when captured, never the raw surname.

Read-only verified paths: `DriverProfileController` passes the full typed body and current identity actor ID; `ApiClient.createDriverProfile`/`updateDriverProfile` use `body: command` and actual SDK `fetchEnvelope` JSON serialization; `DriverProfileRepository.upsert` serializes the full profile to `$3::jsonb`, and `loadAll` returns the parsed JSON record. Formal schema is `infra/migrations/V0018A__driver_profiles.sql`. No controller, SDK, repository, migration, registry or authorization edits are needed. `RegulatoryRegistryService.createDriver` supplies a legacy profile command without surname; the unchanged admin path must preserve any captured value. No new admin registration ingress is claimed.

## Reproduction and checks

Evidence directory: `/home/lupin/workspace/drts-fleet-platform/.local/driver-explicit-surname-profile-capture-20261013-root/evidence/`. Tests: `tests/unit/driver-explicit-surname-profile-capture-20261013/profile-capture.test.ts`.

| Finding / required acceptance                                           | Source and repair                                                                                                          | Old source → repaired result                                                                                                         | Commands, exit code, version, evidence                                                                                                                                                                                                                                                                                                            | Unverified boundary                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `driver_explicit_surname_truthful_profile_producer`                     | Three optional contract fields; service explicit validation/create/update/admin preservation                               | Base `58fd356…`: explicit create/update return undefined; legacy absence control passes. Repair: all 37 focused cases pass, no skips | `NODE_ENV=test pnpm exec vitest run tests/unit/driver-explicit-surname-profile-capture-20261013/profile-capture.test.ts -t 'captures explicit\|legacy absent' --reporter=json --outputFile=<evidence>/baseline-58fd-qualified.json`; exit 1; 5 actual assertion failures, 1 control pass, 31 deliberately unselected; Node 22.23.2 / pnpm 10.33.0 | Actual human surname, government/credential facts are not witnessed                                             |
| `driver_explicit_surname_actual_transport_json_persistence_regressions` | Actual SDK body serialization → typed controller → service → production repository JSON serialization/load → fresh service | Base SDK/controller path loses explicit input. Repair: all 37 focused cases pass, no skips                                           | Same baseline report; related root 145 + API 131 pass, no skips; commands/results below                                                                                                                                                                                                                                                           | Fetch and external DB query are controlled unit boundaries; no HTTP guards or real PG commit/restart acceptance |
| `driver_explicit_surname_same_candidate_review_ci_merge`                | Normal task branch and original Codex2 review                                                                              | Pending final candidate handoff                                                                                                      | Exact final SHA/PR published via handoff; review, hosted CI and protected merge remain lifecycle gates                                                                                                                                                                                                                                            | Owner does not self-approve or mark done                                                                        |

Initial `baseline-58fd.json` exited 1 before collecting any tests because root could not resolve API-only `reflect-metadata`. It is retained as a setup failure, not red product evidence. Only this worktree's ignored `node_modules` links were adjusted for the root tests; shared checkout dependencies are unchanged. The qualified baseline above executes actual source business assertions, without resetting the active worktree.

The tests simulate only fetch transport and external DB query, executing real SDK JSON/envelope logic, controller and service, and production repository serialization/load. They do not copy business processing or create an alternate SQL table. Waiting for controlled writes before fresh-service loading verifies JSON carry-through, not PostgreSQL SQL/schema behavior. The inherited `persist` launches `repository.upsert` asynchronously and reports rejection without rejecting the profile response. A focused regression documents that response-before-write boundary; synchronous durable ACK is not claimed and the lifecycle is unchanged.

## Repaired verification and retained failures

Anchor `fec31bb51320aca22162242a60ece7061caf937e` preserves the implementation and initial regressions. Its first full focused run (`focused-green.json`, despite that filename) **failed**: 10 pass / 27 fail / no skips because the negative test compared `listAuditLogs()` twice, and that production reader itself records access audits (`AuditNotificationService.listAuditLogs`). The tests now observe real `recordAuditLog` calls without replacing the implementation. All 37 pass in `focused-final.json`; no product audit behavior was modified. The final candidate is a normal later commit, not an amended anchor; its SHA, source hashes and PR are in the handoff/evidence record.

Related root regression: **145 passed**, including the 37 focused cases; API regression: **131 passed**. Total **276**, zero failures/skips, exits 0, `related-root.json` / `related-api.json`. These suites exercise existing driver identity/negative scope guards, device sessions, registry callers, SDK integration and sensitive-data controls alongside the new actual producer and JSON reload cases. Final candidate runs repeat those suites after commit; the exact SHA is retained in `candidate-evidence.json` in the evidence directory.

Static verification: contracts and control-plane-auth builds, API typecheck, scoped ESLint/Prettier, scoped test/source typecheck and `git diff --check` pass (exit 0). First API typecheck failed (exit 2, `api-typecheck.log`) on missing nodemailer links targeting a deleted unrelated worktree. Task-local dependency copies of the existing pinned nodemailer 10.0.12 / types 8.0.2 make the rerun pass (`api-typecheck-final.log`), without shared checkout or manifest edits. `pnpm typecheck:root` **fails** (exit 2, `root-typecheck.log`) on other workspace dependency resolution and existing tenant auth/SDK/test type errors; no diagnostic targets this task's profile service/contracts/test file. It is not counted as a full-workspace pass. `.local/profile-capture-typecheck.json` extends root compiler options with only this task test as entry point and incremental disabled; actual transitive controller/service/repository/SDK sources are typechecked, exit 0 (`scoped-typecheck.log`). Complete hosted CI remains required for the final candidate.

Reproduce repository-only checks (JSON reports add `--reporter=json --outputFile=<evidence>/<name>.json`):

```bash
# Qualified old-source red: executed before service/contracts edits, on 58fd356…
NODE_ENV=test pnpm exec vitest run tests/unit/driver-explicit-surname-profile-capture-20261013/profile-capture.test.ts -t 'captures explicit|legacy absent'
# Full repaired focused suite
NODE_ENV=test pnpm exec vitest run tests/unit/driver-explicit-surname-profile-capture-20261013/profile-capture.test.ts
# Related root regression includes the focused cases; total 145, not 182
NODE_ENV=test pnpm exec vitest run \
  tests/unit/driver-explicit-surname-profile-capture-20261013/profile-capture.test.ts \
  tests/unit/driver-profile.test.ts tests/unit/driver-profile.repository.test.ts \
  tests/unit/driver-device-session.test.ts tests/unit/regulatory-registry.test.ts \
  tests/unit/client-integration.test.ts tests/unit/driver-app-settings-form.test.ts \
  tests/security/iam-driver-authz-enforcement.test.ts tests/security/iam-route-driver-negative.test.ts
NODE_ENV=test pnpm --filter @drts/api exec vitest run \
  tests/unit/driver-profile.service.test.ts tests/unit/regulatory-registry.service.test.ts \
  tests/unit/auth-bootstrap.test.ts
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
pnpm exec tsc -p .local/profile-capture-typecheck.json --noEmit
pnpm exec eslint packages/contracts/src/index.ts \
  apps/api/src/modules/driver-profile/driver-profile.service.ts \
  tests/unit/driver-explicit-surname-profile-capture-20261013/profile-capture.test.ts --max-warnings=0
pnpm exec prettier --check packages/contracts/src/index.ts \
  apps/api/src/modules/driver-profile/driver-profile.service.ts \
  tests/unit/driver-explicit-surname-profile-capture-20261013/profile-capture.test.ts \
  docs/04-uat/driver-explicit-surname-profile-capture-20261013.md
git diff --check
```

## Remaining gates

## R1 repair: TEST-ROOT-REFLECT-RESOLUTION

Codex2 rejected candidate `8e77dbec0884573f94fd6d35d077a48f57ddc43d`, generation `66d23825aadb44fe927065406f9aa5c8`, on 2026-10-13. The test's bare `import "reflect-metadata"` depended on an undeclared root dependency. The earlier ignored dependency links made the owner results non-repeatable through the standard frozen-install root CI paths (`.github/workflows/ci.yml` and `ci-integ.yml`). Those earlier reports remain historical evidence, not repaired-candidate verification.

The same old candidate was reproduced without a root `reflect-metadata` link: the focused command below exited 1, with zero cases collected and `Cannot find package 'reflect-metadata'` (`r1-old-resolution.json` / `.log`). The repair removes only that redundant import. The production API imports `@nestjs/common`, whose entrypoint initializes `reflect-metadata` using the API's declared dependency. All assertions and production source remain intact; no manifest, auth or persistence changes are needed. The focused rerun exits 0 with 37 passed / zero failed or skipped (`r1-focused.json` / `.log`), on Node 22.23.2, pnpm 10.33.0 and Vitest 4.1.4. The worktree root `node_modules` points to the shared installed dependencies; no root `reflect-metadata` or task-specific Nest links were added.

| Finding / acceptance                       | Source and repair                                                                   | Old source → repaired result                                                      | Commands and evidence                                                                                                  | Unverified boundary                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `TEST-ROOT-REFLECT-RESOLUTION` (Codex2 R1) | Remove redundant bare import at test entrypoint; use production Nest initialization | Old `8e77dbec…`: exit 1, zero collected → repair: exit 0, 37 passed, zero skipped | Same focused command above with JSON reports `r1-old-resolution.json` and `r1-focused.json`; same versions listed here | Related root/API reruns and final candidate publication pending at this anchor |

Related root 145 and API 131 reruns, scoped lint/format and the new immutable candidate identity will be recorded below after completion. Original root typecheck failure, controlled fetch/DB boundaries and inherited asynchronous persistence limitations remain as documented above. Same-candidate independent review, hosted CI, protected merge and acceptance remain pending.

Original Receipt downstream consumers, UI input, issuer/operator identity, lawful credentials, actual human surname, payment facts and legal/manual evidence remain open under original ownership. This producer does not supply any Receipt acceptance key, alter a completed trip/e04Snapshot/renderer, or resume the blocked parent. Real PG, HTTP auth journey, browser, native Android/iOS, provider, receipt and full-system acceptance are not executed locally. No product/dev/HTTP/PG/browser/Metro/Docker server or cloud workflow dispatch runs on this VM.
