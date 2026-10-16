# SERVICE-PRODUCT-CANONICAL-CONCURRENCY-AND-READBACK-20261016

Owner: Codex; independent reviewer: Claude2. Updated 2026-10-16 UTC.

## Identity, accepted credit and current disposition

- Assigned isolated branch: `codex/service-product-canonical-concurrency-and-readback-20261016`.
- Audited and fetched accepted `origin/dev` base: `b726c5cd08c932502d768e5766bbdf4753e4a1f4`.
- Source/test checkpoint: `4230752aabc300e944d502b88ab21514bbce2ad6`. Earlier anchors: `4b743e3676202086019e3321f4e271c3dc066c32`, `9d4170095445d805f9869b7ae6f6cef839e6afaf`, `5e5ee70424652d59f04ef2d05003ba8282e410e2`. These are checkpoints, **not a locked review candidate**.
- Actual author and committer on all own commits: `Codex <codex@openai.com>`, using process-only `git -c user.name=Codex -c user.email=codex@openai.com -c user.useConfigOnly=true`. Both `git var GIT_AUTHOR_IDENT` and `git var GIT_COMMITTER_IDENT` were checked; no shared/worktree Git identity configuration changed.
- Accepted ACK candidate `3a99b69c95694cf0943977b4a6f473111c51149f`, merge `48980f0efa0a6572e21b93ada16a123a2a77399b`, PR #2663 and its original four DONE keys retain their narrow credit. This task does not reopen them.
- Accepted Demo candidate `85584555e07df241ad4dc94bbf7914bbc85b44c2`, merge `cd9cae5d3e5daf221258dd186563db5154f5e308`, retains the accepted prepare/findRuntimeContext/get/current-policy contracts and existing Source/CI/review credit. Its separate delivery acceptance is unchanged.
- **Outstanding scope coordination:** the unchanged Demo product SQL fixture recognizes `INSERT INTO ops.phase1_service_products` but ignores the new real `UPDATE` statement. Its established-master test therefore observes the old `active=false` fixture row. Request recorded through owner `progress` at 2026-10-16T04:15:14Z: extend only `tests/unit/pax-review-shared-order-demo-20261015/service-product-preparation.test.ts::productPeers` to execute the actual UPDATE parameters, preserving all 16 cases and every assertion. No edit to that out-of-scope file has been made. No additional production caller edit is needed.
- Candidate SHA/PR head, independent same-SHA review, full mandatory hosted CI, protected merge and the five own acceptance keys remain pending. No owner `done`, approval or merge is claimed.

## Actual source paths and repair boundary

`ServiceProductController.createServiceProduct/updateServiceProduct` await the service and build the original action receipt only after the service succeeds. Enabled service writes now use `ServiceProductRepository.createCanonical/updateCanonical` and `DatabaseService.connect()`:

1. `BEGIN ISOLATION LEVEL READ COMMITTED` and `LOCK TABLE ops.phase1_service_products IN SHARE ROW EXCLUSIVE MODE`.
2. Read current rows after obtaining the lock, reject ambiguous duplicate IDs/types, and perform identity/type validation or apply the supplied partial fields to the current record.
3. Create uses plain INSERT, never `ON CONFLICT ... UPDATE`. Generated IDs derive from the maximum actual canonical numeric SVP ID using integer arithmetic and retain zero padding. Explicit valid IDs remain unchanged.
4. Update uses UPDATE against the original canonical ID. Missing ID returns the existing `NOT_FOUND` contract. The service applies the original normalization, allowed license, timing, proof, meter/fixed-fare and billing semantics to the locked record.
5. Await COMMIT before cache publication, audit and controller receipt. On any error, preserve the original rejection and attempt rollback; destroy a connection whose rollback failed. A lost COMMIT reply triggers a fresh authoritative lookup of the resolved original ID after destroying the uncertain connection. A matching durable row is not invented into an ACK or retried automatically. Subsequent get/list/prepare observes canonical state.

V0027 has a primary ID key and no type unique constraint. The table lock serializes this small catalog without a migration and also conflicts with ordinary INSERT/UPDATE writers. Native commands cannot leave a second type row after a 409. Existing arbitrary SQL writers can still create historical ambiguous data; reads surface the conflict and never choose a winner or delete rows. No migration, common database helper, schema or real data was changed.

Admin list and runtime-policy list now await `readServiceProducts/readRuntimeProfilePolicies`, which read current repository state, retain envelopes and database ordering, and return detached values. `getServiceProduct` reads the actual ID and checks for ambiguous type peers in enabled mode. Enabled initialization errors reject instead of reporting a successful empty registry. `findRuntimeContext` reads all matching products rather than silently selecting `LIMIT 1`.

The synchronous `listServiceProducts` remains an explicitly documented snapshot for the existing Demo `prepare -> list().find()` consumer. Runtime getters likewise preserve the accepted synchronous contract after awaited `prepareRuntimeProfileServiceProduct`. Disabled/noDB mode still mutates and returns synchronously. Current enabled admin responses never use that snapshot as canonical authority.

## Finding and acceptance evidence

| Finding / acceptance key | Actual source basis / change | Accepted before → fixed checkpoint | Commands / evidence | Outstanding limit |
| --- | --- | --- | --- | --- |
| F2a, same-instance concurrent same type | Repository `createCanonical/mutateCanonical`; service create publishes only after transaction | Before: one receipt and one 409 but **two persisted rows**; restarted controller exposes two. After: one receipt, one 409, one SQL INSERT, one canonical row, one success audit and one row on restart. | Saved accepted-source probe; `canonical.test.ts` same/cross-instance matrix; ACK duplicate test now checks actual rows and restart. | Actual PG lock qualification awaits hosted CI. |
| F2b, different-instance same type; same-ID/different-type | Same locked canonical ID and type checks | Before: both same-type creates complete and leave two rows. After: both same/cross-instance explicit ID and type races return one lawful success and one conflict, without overwrite or orphan. | `canonical.test.ts`; hosted own same-type and same-ID cases. | Hosted own cases are locally skipped, not PG passes. |
| F2c, stale generated ID | Repository allocates numeric ID from locked canonical rows | Before: two instances acknowledge `SVP-000001`; only the second type remains. After: both same/cross-instance creates retain distinct `SVP-000001` / `SVP-000002`; explicit `SVP-000099` causes next ID `SVP-000100`; restart retains every row. | `canonical.test.ts`; hosted own generated-ID case. | No new idempotency or cleanup policy. |
| F3, stale name-only update | Service update apply callback reads the locked current product | Before: name-only B restores A's committed active flag and old licenses. After: stable ID, deactivation, licenses, timing, meter, fixed fare, billing and proof all survive; reverse/interleaved independent updates also survive. | `canonical.test.ts`; native runtime consumers and hosted own partial-update case. | No changes to billing/eligibility policy itself. |
| F4, warm empty admin cache | Controller list → service authoritative readers → repository | Before: warmed peer lists empty, restart lists one. After: warm peer lists/gets current canonical rows and upserted runtime policy, with original request-ID envelope and detached arrays; authoritative failure rejects. | `canonical.test.ts`; own runtime and hosted cases. | The documented synchronous snapshot is retained for accepted prepared Demo callers. |
| `service-product_canonical-identity-and-type-atomic-create` | All create findings above | Controlled SQL cases pass; before cases reproduced on actual saved accepted classes. | Own unit matrix + eight-case hosted file. | Required real PG CI/review/merge evidence pending. |
| `service-product_canonical-partial-update-and-concurrent-preservation` | Locked partial update; transaction/ACK/error handling | Pending COMMIT has no state/audit/receipt; both lost-COMMIT outcomes reject, read the original resolved ID, and preserve durable disable against a stale rename; ordinary retries retain original conflict behavior. | Own unit cases + adapted six original ACK cases. | PostgreSQL before/after COMMIT fault cases await hosted execution. |
| `service-product_authoritative-admin-runtime-readback-and-restart` | Current catalog plus runtime-profile policy halves | Actual native passenger → multi-taxi → Owned intake succeeds after canonical create on a warm peer, then rejects after disable plus stale rename on warm peer and fresh reconstruction. Missing/inactive/future/expired policy and read failures reject. Actual vehicle-eligibility service interprets license/meter/fixed-fare denials and current proof/timing. Billing mode is read unchanged from the same canonical product ID. | `runtime-consumers.test.ts`, unchanged original API/booking regressions. | This is controlled SQL/native function evidence, not HTTP/auth/PG/full booking/live financial acceptance. One unchanged Demo transport fixture still needs the exact scope extension above. |
| `service-product_all-real-before-fixed-after-and-original-regressions` | All five original saved cases; original product/governance/ACK tests retained | Five accepted-before defects reproduced; final scoped root regression **82 pass / 8 hosted skip**, original API regression **132 pass**; no cases removed or discovery reduced. | Commands and limits below. | Original Demo preparation regression **15 pass / 1 fixture failure**. PG and full mandatory hosted regression remain unverified. |
| `service-product_exact-candidate-independent-review-CI-merge` | Isolated assigned branch, process-only Codex identities, append-only anchors | Current code and tests committed; normal push, no rebase/amend/force-push or history replacement. | Git checkpoint identity above. | No candidate handoff until scope/fixture repair and required local checks finish; independent Claude2 review/full same-SHA CI/protected merge/all five own keys still required. |

## Reproducible commands and results

Machine-specific evidence directory (relative to this assigned worktree): `.local/service-product-canonical-20261016/`. Node `v22.23.2`, pnpm `10.33.0`.

### Before: actual saved accepted classes

Read the full dispatch task clauses/keys and exact holder handoff under canonical root `.local/goal-continuation-20261016T034542Z-original-C107-canonical-multi-instance-audit-root/`, including its original probe. `before-probe.cjs` changes only the BASE input and output paths so the immutable saved source and existing evidence are not overwritten. The original probe's EEXIST output protection initially rejected an already-existing output; rerunning with an own output path completed all five business assertions.

```bash
node .local/service-product-canonical-20261016/before-probe.cjs \
  > .local/service-product-canonical-20261016/before-summary.json
```

Exit **0**: F2a/F2b/F2c/F3/F4 each reproduced. This means all five defects were observed, not that they passed product acceptance. The probe loads the actual saved accepted controller/service/repository and actual Nest error/receipt code; the audit sink and SQL transport are controlled. Original SQL/params and canonical row effects are captured. No PG execution is represented by this result.

- `before-probe.cjs` SHA256 `6fbb5ebef67941b854885c232fd0e780bb2e32178a93dd183f22be3218c4a2a5`.
- `before-report.json` SHA256 `e6f6cc11bfc426a26e085c7043bf2144e3eb0955589b00446405a212bd9f5b98`.
- Original supplied probe SHA256 `0db8a6f9eac2285eb280c7f509ef5b52f7897b835a8fdad94de5a5b2183555ae` and supplied report SHA256 `ac9e1ff0f80ef0db8321f4cf55e7415d533aa6054ececc58c23effcc4ec512c6` remain unchanged.

### Fixed checkpoint: unit and original regressions

```bash
pnpm exec vitest run \
  tests/unit/service-product-canonical-concurrency-readback-20261016 \
  tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts \
  tests/unit/service-product.test.ts \
  tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts \
  tests/unit/system-remediation/sr-qa-booking-001/c016-c024-tenant-booking-cutoff-and-lead-time.test.ts \
  tests/unit/system-remediation/sr-qa-booking-001-fix-tenant-lead-time/tenant-booking-lead-time.test.ts \
  tests/unit/vehicle-eligibility.test.ts \
  tests/unit/pax-review-shared-order-demo-20261015/reservation-capability.test.ts \
  tests/integ/service-product-canonical-concurrency-readback-20261016.test.ts
pnpm --filter @drts/api exec vitest run \
  tests/unit/service-product.service.test.ts \
  tests/unit/owned-mobility.service.test.ts \
  tests/unit/vehicle-eligibility.service.test.ts
```

First command on checkpoint `4230752aabc300e944d502b88ab21514bbce2ad6`: exit **0**, 9 files / **82 passed**, 1 file / **8 hosted PG cases skipped**. `regression-final.log` SHA256 `613a77dcc8a978fdd3f0eeacdf2d904133edc02300838bfa86f6f4fa2237c739`. Own canonical/runtime namespace contributes **19 passed** (`unit-final.log`). The original 8 service-product, 5 governance, 6 ACK cases remain, including strengthened canonical row/restart assertions for the old cache-only duplicate case.

Second command on preceding source checkpoint `5e5ee70424652d59f04ef2d05003ba8282e410e2`: exit **0**, 3 files / **132 passed**, no skips. `api-regression.log` SHA256 `cea40562b6bc18b49e0e07bdda80cb28014b7a9f34d4c7c1829343c5f8f14fbc`. Subsequent source change only simplified healthy-client release after rollback handling; the final root regression retested ACK/rejection paths. NoDB mutation/validation remained synchronous throughout.

The unchanged `tests/unit/pax-review-shared-order-demo-20261015/service-product-preparation.test.ts` was run with the four product suites in `unit-second.log`: exit **1**, **43 passed / 1 failed**, including Demo **15 passed / 1 failed**. Its single failure is the ignored actual UPDATE in the controlled SQL fixture, at established master assertion line 246. The file and all its assertions remain unchanged pending scope coordination. This failure is not reported as a pass.

### Static verification

- `pnpm --filter @drts/contracts build` then `pnpm --filter @drts/control-plane-auth build`: both exit **0**. The first API typecheck used stale existing package declaration output and exited 2; after these authorized repository builds, `pnpm --filter @drts/api typecheck` exited **0** (`api-typecheck-built.log`). No source edits were made to those packages.
- `pnpm exec tsc -p .local/service-product-canonical-20261016/tsconfig.scoped.json --noEmit`: exit **0** (`scoped-typecheck.log`). The local config extends root tsconfig and includes the product module, all changed product tests, own canonical/runtime namespace and own hosted file, retaining exact optional-property checks.
- `pnpm typecheck:root`: exit **2**, 75 diagnostics outside the task paths in `root-typecheck-final.log` (missing workspace `@drts/tenant-auth` exports, distinct root/worktree ApiClient private types and existing auth test imports among them). No task-file diagnostics remain. This is a failed full-root check, not a full typecheck pass; clean-install hosted checks remain required.
- `pnpm exec eslint apps/api/src/modules/service-product/service-product.{service,repository,controller}.ts tests/unit/service-product-canonical-concurrency-readback-20261016 tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts tests/integ/service-product-canonical-concurrency-readback-20261016.test.ts --max-warnings=0`: exit **0**, `lint-final.log`.
- `git diff --check`: exit **0**. Formatting check of all changed files is recorded with the documentation checkpoint.

## Hosted PG path and remaining lifecycle

The new `tests/integ/service-product-canonical-concurrency-readback-20261016.test.ts` is discovered by the existing `.github/workflows/ci-integ.yml` unit shards. It runs only when CI and DATABASE_URL are present, provisions a private throwaway database, applies the full official `operations/database/db-apply.sh` migration ledger and uses the real repository against independent PG pools. No new workflow, migration, global PG requirement or typed-PASS gate was introduced.

Its eight cases cover same-instance and cross-instance same-type races, same-ID/different-type plus numeric ID allocation/restart, stale partial updates, current runtime product and policy halves, actual PostgreSQL lock waits, both actual PG pre-/post-COMMIT injected response-loss outcomes, and preserved ambiguous legacy rows. The SQL response-loss injection wraps the real client's COMMIT boundary; allocation/validation/update business logic remains production code. The unit transport uses an explicit statement allowlist and actual parameters, rejects unexpected SQL, and implements no product-type uniqueness or allocation rule.

After the exact fixture scope is coordinated: adapt only that transport boundary, rerun all original Demo cases and required checks, commit/plain-push the final head, create/ready the normal PR and hand off the full `CANDIDATE_SHA` / `CANDIDATE_BRANCH` / PR reference to Claude2 through the release status CLI. Full same-SHA hosted CI must qualify all eight PG cases with zero skips before their acceptance is credited. The normal GitHub bus/reviewer lifecycle owns review/CI/merge and all five nonempty own v1 keys.

No PostgreSQL, HTTP, product/dev/preview/browser/E2E server or Docker infrastructure was started on this VM. No deploy, cloud/IAM, SDK/auth/provider/Owned/multi-taxi product source, worker/provider controls, global persistence helper or actual data changes were made. Whole original 134/44/PAX23/later scopes, all HOLD/F2/cleanup/Final predicates and same-release live C107 acceptance remain outside this finite Source checkpoint.
