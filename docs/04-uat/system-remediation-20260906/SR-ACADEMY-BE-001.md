# SR-ACADEMY-BE-001 — implementation checkpoint

Owner: Codex2. Reviewer: Gemini. Date: 2026-09-10 UTC.

## State and provenance

Partial implementation; blocked on the approved persistence identity model. This
is not a handoff, completed backend, deployed API, or acceptance result.

- Branch: `codex2/sr-academy-be-001`.
- Dispatch HEAD: `396904179665a3b602d25931c4db6a2d006fb812`.
- Fresh fetched base: `e6415ede5aebc2fb280cf8f2871ee55e460a4b6e`.
- Branch had no remote head, PR, or candidate; fast-forwarded to that base.
- Initial implementation anchor: `289d51039b2a4dea9e43c1e2708a2aeee68d266f`.
- Candidate SHA: **none**. Final checkpoint SHA is the commit containing this
  document, obtainable with `git log -1 --format=%H -- docs/04-uat/system-remediation-20260906/SR-ACADEMY-BE-001.md`.
- `SR-CONTRACT-001`, `UV-EXEC-006`, `UV-EXEC-023` are canonical `done`.
  Their merge SHAs are respectively the base above,
  `e97653b7ffb962a6c4d688e8706711d860fa3604`, and
  `9a183b7e392acabf1237aa6d8d4c14c8d753589f`; ancestry checks passed.

Sources: execution task spec; feature-contracts §3; schema-allocation entry
`SR-ACADEMY-BE-001` (`V0095__sr_driver_academy.sql`); gap N02; capabilities C059
and C071; PRD §9.4.9 and §9.6.2; service contracts Regulatory Registry ownership;
execution decision table §3 training eligibility. Historical audit observations
were checked against the fresh base: the academy module was absent.

## Concrete blocker requiring supervisor resolution

The newly approved feature-contracts §3.3/§3.7 require inserting passed attempts
into `reg.driver_training_records` and updating
`reg.driver_reg_profiles.training_status`. The allocation also references
`reg.drivers`. These tables use UUID driver IDs and foreign keys
(`infra/migrations/V0004__regulatory_registry.sql:83-118`).

Current production write code creates IDs as `drv_${randomUUID()}`
(`regulatory-registry.service.ts:891,2121`) and persists drivers to
`reg.phase1_registry_drivers` (`regulatory-registry.repository.ts:371`). That
table has a `varchar(100)` key (V0012). Prefix removal would invent an identity
mapping and would still not create the normalized driver parent row.

This is a previously documented incompatibility, not speculation:
`infra/migrations/V0055__p5_disclosure_ids_as_varchar.sql:4-17` describes the same
UUID foreign-key trap and its actual onboarding failure. V0055 fixes disclosure
IDs only, not either training table. No current API insert into `reg.drivers` or
`reg.driver_reg_profiles` was found by the searches below.

Supervisor must route a correction to the shared design/schema contract owner:
approve the runtime text-ID training model and its regulatory projection (or
provide an existing authoritative identity bridge), update the allocation and
necessary task dependencies. Recommended: follow the established V0055 text-ID
convention, with explicit ownership of migration changes to the existing shared
training/profile tables. This worker has not changed shared contracts, registry
code, IAM, root wiring, or existing migrations. `SR-WIRE-001` retains ownership
of the runtime eligibility integration; the current evaluator does not itself
read `driver_reg_profiles.training_status`.

Do not implement a UUID cast/hash, synthetic normalized driver row, fixture
roster, or a no-op regulatory update to bypass this mismatch.

## Implemented checkpoint

`academy-domain.ts` consumes the approved public contracts and provides pure
functions for exact version grading, complete/unique/valid answer validation,
public question projection without answer keys, current-version completion,
expiry/retake history, and unique-driver multi-course completion percentages.
Failed retakes preserve an unexpired prior pass; a new pass renews expiry;
revision requires a pass on the current version. Grades remain null until an
attempt exists. Dashboard calculations require an authorized authoritative
roster supplied by the future repository; these functions do not authenticate
or load any records themselves.

No controller, repository, migration, Nest module, course publishing operation,
fleet authorization, regulatory write, expiry worker, or read-model wiring is
claimed implemented. The pending backend must persist grading and immutable
course/attempt snapshots atomically and provide the contracted drill-down APIs.

## Executed checks

| Command | Exit | Result |
| --- | --- | --- |
| `git fetch origin` | 0 | Refreshed base above |
| `git ls-remote --heads origin codex2/sr-academy-be-001` | 0 | No prior remote head |
| `gh pr list --head codex2/sr-academy-be-001 --state all --json number,state,headRefOid` | 0 | Empty before work |
| `git merge --ff-only origin/dev` | 0 | Advanced to base above |
| `git merge-base --is-ancestor e97653b7ffb962a6c4d688e8706711d860fa3604 e6415ede5aebc2fb280cf8f2871ee55e460a4b6e` | 0 | UV-EXEC-006 merged |
| `git merge-base --is-ancestor 9a183b7e392acabf1237aa6d8d4c14c8d753589f e6415ede5aebc2fb280cf8f2871ee55e460a4b6e` | 0 | UV-EXEC-023 merged |
| `pnpm --filter @drts/api typecheck` (first) | 2 | Stale local contracts build lacked academy and existing voice exports |
| `pnpm --filter @drts/contracts build` | 0 | Refreshed ignored build output, no contract source edit |
| `pnpm --filter @drts/api typecheck` (after contracts build) | 0 | Passed |
| `pnpm exec vitest run tests/unit/system-remediation/sr-academy-be-001/` | 0 | 1 file, 19 tests passed; repeated after formatting |
| `pnpm exec prettier --write apps/api/src/modules/driver-academy/academy-domain.ts tests/unit/system-remediation/sr-academy-be-001/academy-domain.test.ts` | 0 | Formatted owned files |
| `git diff --check` | 0 | Passed |
| `git push -u origin codex2/sr-academy-be-001` | 0 | Initial anchor pushed normally |

Reproduction searches: `rg -n 'INSERT INTO reg.drivers\|INSERT INTO reg.driver_reg_profiles' apps/api/src -g '*.ts'`
(no matches), `rg -n 'driverId.*random' apps/api/src/modules/regulatory-registry`
(both creation paths), and inspection of V0004, V0012 and V0055. These are static
source findings, not a live database assertion.

Test resource IDs `safety`, `service`, `driver-1`, `driver-2`, `attempt-1`,
`attempt-2`, `fleet-1` are synthetic unit-test inputs only. No live resource IDs
were created. No PostgreSQL migration/transaction/concurrency test, HTTP/IAM
test, browser, true-device, deployed qualification or live academy acceptance
was run. The VM restriction prohibits starting product/test servers or Docker
Compose. No CI/merge/deploy success is claimed for this checkpoint.
