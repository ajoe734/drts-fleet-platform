# TENANT-BOOKING-LIFECYCLE-CANONICAL-FLOW-20261015

Source implementation checkpoint, Codex2 author / Codex independent reviewer. This is not a handoff, acceptance, CI, deployment or full-goal completion claim.

Original full specification SHA256: `f0fb718a29f9e527ec021d1c13a7c8c7d2502c012fdb92cbbc85abe1514843a3`. All twelve original clauses and five keys remain. Original fifteen scopes plus normally coordinated `tenant-partner.repository.ts` canonical approval getter form the sixteen scopes. Base is accepted `c6e4bc7b771907a577fad9e1135d8f3287e0a80a`. Frozen ENTRY-TENANT identity/OIDC and PAX-RECEIPT contact/token/receipt candidate/HOLD/WIP are protected; no unrelated hunks or roles are released.

## Original repair mapping

| Original finding / key | Production repair | Actual before → current local result | Remaining evidence |
| --- | --- | --- | --- |
| C024 terminal / key1 | Existing update rejects cancelled/completed before mutation and preserves cutoff/live-state behavior | Mounted Controller before returned success for terminal future-cutoff; current rejects | Final affected suites and exact-candidate review/CI |
| C016 reschedule / key1 | Existing lead-time predicate only for changed start before mutation | Actual accepted module before invalid/past/too-soon cases failed; current passes and preserves valid future/noDB update | Final regression/CI |
| C024 ACK and concurrency / keys1–2 | Clone locked current order, command-specific transaction, order/trace/audit after COMMIT; current row read-through never publishes attempted state | Original notes SQL-deferred/rejected and stale snapshots fail; current normal cancel→stale replica and two-field edits pass via actual repositories | Hosted official-schema concurrency case prepared, not executed on VM |
| C025 decision/order / key3 | Canonical discovery then order→request locks, same transaction for request/decision/order; request/decision/cache/notification after ACK | Actual original request failure poisons cache, order failure falsely succeeds and stale pending cache is authoritative; current mounted SQL-boundary failures/retry and pending-COMMIT pass | Final hosted PG / affected fixtures / CI |
| C025 rejection quota / key3 | Existing original release preparation in shared transaction, committed projection only; preserve original tenant/cost-center/period/consumed/idempotency rules | Original actual reject leaves outstanding reserve; current releases tenant/cost-center count and amount, retry does not duplicate | Hosted official-schema release/rollback prepared, pending |
| C024 update quota / keys2–3 | Consume existing `buildQuotaLifecycleEntrySpecs` update semantics: same period/center only amount delta, moves release+reserve, consumed unchanged | Original actual repeated re-evaluation reserves a second booking; current same-period/noDB/durable, moved period, failure rollback and consumed retention cases pass | Further original regressions and hosted formal-schema case pending |
| C027 address / key4 | Selected address Link uses existing `addressId` contract | Real server-page Link→new-booking page model→actual typed builder before loses ID; current 3 cases pass | Client browser interaction unclaimed; original direct/manual/passenger/active/missing reference behaviors retained |
| All original positives / key4 | Preserve accepted Tenant R2 CRUD/ACK and noDB, create, normal cancel, mode/role/escalation and master semantics | Initial old cutoff and approval suites pass (part of overlapping local selections) | Full original affected matrix still running at checkpoint |
| Review/CI/merge / key5 | Normal immutable candidate lifecycle | Not yet handed off | Own typecheck/lint, complete affected suites, normal push, exact review, same-candidate CI/protected merge |

## Reproducible socket-free checks

New tests are under `tests/unit/tenant-booking-lifecycle-canonical-flow-20261015/`. They invoke actual mounted controllers, actual service orchestration and production repositories. Only the external SQL transport is simulated in local durability/interleaving tests; it models JSON row storage, SQL ACK/failure, transaction rollback and locks, not a copied business algorithm. The saved-address test invokes real server pages and the real typed command builder; the client form is not mounted, so browser click/login/HTTP behavior is unclaimed.

`lifecycle.postgres.hosted.test.ts` uses the official migrated schema and actual repositories, and is guarded by the existing hosted-only convention `GITHUB_ACTIONS=true` plus `DATABASE_URL`. It must not open a PG connection on this VM. Local skips are recorded separately and are not PG success.

Run selected socket-free tests with `node node_modules/vitest/vitest.mjs run tests/unit/tenant-booking-lifecycle-canonical-flow-20261015 --maxWorkers=1 --no-file-parallelism` and DATABASE_URL absent on this VM. Do not invoke product/dev/browser/HTTP/PG/Docker servers here.

Machine-specific full raw commands/exits, literal accepted-before modules/loader and evidence remain in `.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/tenant-booking-lifecycle-functional-evidence/`. Before modules are loaded byte-for-byte from the accepted Git object at unchanged module IDs, keeping actual production relative imports. No reset or source replacement was used for before proof.

Initial fixture-only issues are retained without product credit: wrong repository constructor position; a COMMIT-only deferred gate that did not intercept the original nontransactional write; an empty-assignment SQL COUNT response omission; and formal aggregate-version fixture metadata. Corrected SQL-boundary runs are identified separately. Initial API typecheck used shared Root workspace links with stale contract resolution; own dependency-wrapper links/builds then removed those unrelated resolution errors and exposed only own exact-optional/type errors, which are being corrected. No dependency install or full node_modules copy occurred.

At this checkpoint, current command suites: 23 pass (SQL transport, no real PG). Address producer/consumer: 3 pass. Earlier overlapping cutoff/approval selection: 28 pass. These are overlapping selections, not additive totals. All result counts require final immutable delivery evidence; no local result grants live/provider/full16 credit.
