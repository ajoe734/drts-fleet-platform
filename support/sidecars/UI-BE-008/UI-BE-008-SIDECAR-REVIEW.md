# UI-BE-008 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `UI-BE-008` — DriverOpsInstruction module (ops issues,
driver receives)
**Parent Owner:** `Codex`
**Parent Reviewer:** `Codex2` (current reviewer of record after the
`2026-05-25T17:21:43Z` and `2026-05-25T18:31:18Z` availability-first
reassignments; the first review pass on 2026-05-25 was executed by
`Claude2` while `Codex` rotated through the owner seat — see §2 lifecycle
log)
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-26` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behaviour, or the parent task's implementation
files.

This packet is a reviewer-facing companion to the parent task
`UI-BE-008`, which adds the backend `DriverOpsInstruction` module
(ops-side create + driver-side list/acknowledge, durable persistence,
`expiresAt` handling) to `apps/api`. The parent task is the canonical
implementation slice; this packet pins the machine-truth handoff record,
the file-by-file evidence map, the two review-failure rounds against the
final rework cycle, and the acceptance checklist that the parent
reviewer (`Codex2`) has already applied against the parent owner's
shipped commit.

At packet generation time the parent task is **`done`** —
`Codex2` re-approved the slice at `2026-05-26T12:44:43Z` on
implementation commit `b3681f5f`, after which the parent owner (`Codex`)
recorded `done` at `2026-05-26T12:48:09Z` against pushed closeout commit
`f6f8aa8c` on branch `codex/ui-be-008`. This packet does not re-litigate
that closeout; it captures the evidence at that boundary so the sidecar
reviewer can audit the audit chain without re-deriving it from the
activity log.

Transient parent lifecycle truth (`status`, `next`, `last_update`,
`commit_hash`, `push_*` fields) remains authoritative only in
`ai-status.json`. This packet snapshots the most recent values for
reviewer convenience but does not replace machine truth.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar as a concrete reviewer checklist
  against the parent's shipped commit `b3681f5f` (implementation) and
  `f6f8aa8c` (finalize closeout) on branch `codex/ui-be-008`
- pin the machine-truth dependency on `UI-BE-003`
- enumerate the verifiable anchors the parent's implementation cites
  (file paths, contract surfaces, migration, sibling sidecar)
- record the parent task's file-level shape so a reviewer can audit the
  module without re-deriving it from `git show --stat`
- record the parent owner's and parent reviewer's verifications across
  the two final-cycle review-failure rounds and the eventual
  `review_approved` + `done` transitions on 2026-05-26
- record the parent reviewer's verbatim approval rationale so the
  sidecar reviewer can confirm the audit chain stays anchored to
  shipped-tree files

Out of scope:

- editing L1/L2 product truth, the parent task entry in
  `ai-status.json`, or the parent's shipped implementation files
  (`apps/api/src/modules/driver-instruction/*`,
  `apps/api/tests/unit/driver-instruction.service.test.ts`,
  `tests/unit/driver-instruction.repository.test.ts`,
  `infra/migrations/V0025__driver_ops_instructions.sql`,
  `apps/api/src/modules/audit-notification/audit-notification.service.ts`,
  `apps/api/src/app.module.ts`)
- editing the contract surfaces under `packages/contracts/src/`; the
  parent explicitly reuses pre-existing
  `CreateDriverOpsInstructionCommand`,
  `AcknowledgeDriverOpsInstructionResult`, and `DriverOpsInstruction`
  shapes without contract expansion
- mutating or "absorbing" the parent task; absorption is the parent
  owner's decision after parent review approval, not the sidecar's
- performing or re-running the parent's `done` closeout — already
  recorded by `Codex` at `2026-05-26T12:48:09Z` against
  `COMMIT_HASH=f6f8aa8c7481ac15d40c3b075387188f2b07786c` /
  `COMMIT_SUBJECT=UI-BE-008: finalize closeout` /
  `PUSH_REMOTE=origin` / `PUSH_BRANCH=codex/ui-be-008`
- duplicating the earlier `UI-BE-008-SIDECAR-ACCEPTANCE` packet at
  `support/sidecars/UI-BE-008/UI-BE-008-SIDECAR-ACCEPTANCE.md` (commit
  `0135a212`, owner `Gemini2`, reviewer `Claude2`); this packet is a
  separate review-evidence companion, not a replacement

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json → UI-BE-008-SIDECAR-REVIEW`

- owner=`Claude`
- reviewer=`Codex`
- depends_on=`UI-BE-003`
- task_class=`sidecar`
- helper_parent=`UI-BE-008`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/UI-BE-008/UI-BE-008-SIDECAR-REVIEW.md`
- live lifecycle fields (`status`, `next`, `last_update`) deferred to
  `ai-status.json`

### Parent — `ai-status.json → UI-BE-008` (snapshot)

- status=`done` (at `2026-05-26T12:48:09Z`)
- owner=`Codex`
- reviewer=`Codex2` (post-`2026-05-25T18:31:18Z` reassignment from
  `Claude2`)
- phase=`phase1-ui-implementation-wave-202605`
- depends_on=`UI-BE-003`
- acceptance:
  - `Storage + ops-side create + driver-side read; expiresAt handling;
vitest`
- shipped closeout commit (recorded as `commit_hash` /
  `push_commit`)=`f6f8aa8c7481ac15d40c3b075387188f2b07786c`
- commit subject=`UI-BE-008: finalize closeout`
- approved implementation commit referenced in
  `next`=`b3681f5ff84779e058cf9c921fad81ab06eaf1f0`
- push target=`origin/codex/ui-be-008` (recorded as `push_ref`)
- commit_agent=`Codex`
- commit_reviewer=`Codex2`
- commit_recorded_at=`2026-05-26T12:48:09Z`
- push_recorded_at=`2026-05-26T12:48:09Z`
- verification trailer on the closeout commit:
  `pnpm exec vitest run tests/unit/driver-instruction.repository.test.ts;
pnpm --filter @drts/api exec vitest run
tests/unit/driver-instruction.service.test.ts;
pnpm --filter @drts/api typecheck`

### Sibling sidecar — `ai-status.json → UI-BE-008-SIDECAR-ACCEPTANCE`

- file=`support/sidecars/UI-BE-008/UI-BE-008-SIDECAR-ACCEPTANCE.md`
- shipped commit=`0135a212378490860a8c2f40ebb4baf64a6590dc`
  (`feat(UI-BE-008-SIDECAR-ACCEPTANCE): finalize sidecar acceptance
packet`)
- owner=`Gemini2`
- reviewer=`Claude2` (post-`2026-05-25T16:46:52Z` reassignment from
  `Gemini` due to quota-degraded lane)
- branch=`gemini2/ui-be-008-sidecar-acceptance`
- status snapshot: `done` (per `Gemini2`'s `done` event at
  `2026-05-25T17:11:36Z`)
- relationship to this packet: complementary — that packet shipped a
  short acceptance checklist + dependency mermaid; this packet adds the
  evidence map / lifecycle audit / reviewer-focus expansion

### Parent lifecycle log — `ai-activity-log.jsonl`

The parent went through three distinct dispatch cycles before the final
`done`. All timestamps are UTC and copied verbatim from
`ai-activity-log.jsonl`.

| Event                  | Timestamp UTC          | Agent        | Outcome                                                                                                                                                                                                                                            |
| ---------------------- | ---------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chair_reassign` (own) | `2026-05-25T16:47:24Z` | Orchestrator | Owner moved from `Gemini` → `Gemini2` because Gemini's lane was on a paused quota-degraded lane; reviewer remains `Codex2`.                                                                                                                        |
| `start` #1             | `2026-05-25T16:56:47Z` | `Gemini2`    | Set up DriverOpsInstruction module and exploring API structure.                                                                                                                                                                                    |
| `handoff` #1           | `2026-05-25T17:16:49Z` | `Gemini2`    | First handoff to `Codex2`; controller + endpoints implemented; tests need project-level dependency resolution.                                                                                                                                     |
| `reopen` #1            | `2026-05-25T17:20:34Z` | `Codex2`     | Failure: module does not compile (missing imports); vitest acceptance is not wired (Jest APIs under a Vitest repo, outside configured globs); storage/API shape diverges from canonical contract (missing taskId/issuedBy/issuedAt; trusts path driverId). |
| `proactive_rebal` #1   | `2026-05-25T17:21:43Z` | Orchestrator | Owner reassigned `Gemini2` → `Codex`; reviewer remains `Codex2`.                                                                                                                                                                                   |
| `progress`             | `2026-05-25T17:22:41Z` | `Codex`      | Resuming implementation against AI collaboration guide and current driver-instruction module state.                                                                                                                                                |
| `proactive_rebal` #2   | `2026-05-25T17:32:10Z` | Orchestrator | Owner reassigned `Codex` → `Codex2`; reviewer reassigned `Codex2` → `Codex`.                                                                                                                                                                       |
| `progress`             | `2026-05-25T17:39:37Z` | `Codex2`     | Scaffolded contracts, ops create, driver list/ack, notification linkage, auth policy, tests; verification blocked (no `node_modules` in worktree).                                                                                                 |
| `progress`             | `2026-05-25T17:43:29Z` | `Codex2`     | Added V0025 migration + repository regression test; verification still blocked on missing toolchain.                                                                                                                                               |
| `chair_reassign`       | `2026-05-25T17:51:10Z` | Orchestrator | Owner reassigned `Codex2` → `Claude2` after Codex2 hit `failure_streak 2/2` terminal (root cause environmental: missing pnpm toolchain in codex2 worker workspace).                                                                                |
| `start` #2             | `2026-05-25T17:55:33Z` | `Claude2`    | Resuming Codex2's anchored module work (anchored on `codex2/ui-be-008` at `53d7abe7`, `e75ea61e`); cherry-picking onto `claude2/ui-be-008` and running vitest.                                                                                     |
| `handoff` #2           | `2026-05-25T18:13:22Z` | `Claude2`    | Module complete with migration V0025, repository (jsonb persist), service, ops + driver controllers, contracts. Vitest: service (4 passed), repository (2 passed). `@drts/api` full suite 385/385 passed. Typecheck clean. Branch `claude2/ui-be-008` pushed; head `c43e799e`. |
| `reopen` #2            | `2026-05-25T18:22:17Z` | `Codex`      | Reviewer found ack idempotency bug: once acknowledged, retrying ack after `expiresAt` returned `DRIVER_OPS_INSTRUCTION_EXPIRED`. Reviewer fixed it on `codex/ui-be-008` in `d4d3a84d`. Asked owner to adopt and re-handoff.                          |
| `handoff` #3           | `2026-05-25T18:24:54Z` | `Claude2`    | Adopted reviewer fix (cherry-picked `d4d3a84d` → `claude2/ui-be-008 5df61cce`). Verified: service vitest (5 passed), `@drts/api` typecheck clean. Pushed.                                                                                            |
| `reopen` #3            | `2026-05-25T18:30:36Z` | `Codex`      | Review blocked: createInstruction can throw 500 on malformed body values because `requireText()` / `normalizeExpiry()` call `trim()` on non-strings, and `driver-instruction.repository.test.ts` sits outside `@drts/api` test globs.                |
| `proactive_rebal` #3   | `2026-05-25T18:31:18Z` | Orchestrator | Owner reassigned `Claude2` → `Codex`; reviewer reassigned `Codex` → `Claude2`.                                                                                                                                                                     |
| `handoff` #4           | `2026-05-25T18:36:38Z` | `Codex`      | Implemented storage, ops create, driver read/ack, expiresAt handling; verified via `apps/api` service vitest, repository vitest, `@drts/api` typecheck.                                                                                            |
| `review_approved` #1   | `2026-05-25T18:40:55Z` | `Claude2`    | First approval: storage + ops create + driver read/ack + expiresAt handling verified via service vitest, repository vitest, `@drts/api` typecheck.                                                                                                  |
| `done` (interim)       | `2026-05-25T18:44:05Z` | `Codex`      | Interim closeout pushed; verification rerun green. Captured as initial closeout commit `357e1351` ("UI-BE-008: close out driver instruction module", reviewer `Claude2`).                                                                            |
| `start` #3             | `2026-05-26T12:26:06Z` | `Codex`      | New cycle: re-implementing storage, ops create, driver read/ack, expiresAt handling against the post-2026-05-25 reviewer reassignment from `Claude2` back to `Codex2`.                                                                              |
| `handoff` #5           | `2026-05-26T12:28:14Z` | `Codex`      | Handoff to `Codex2`: module already lands on commit `357e13515da59e7a30177f6bb18664884ea8b77e`. Verified migration, ops create, driver list/ack, expiresAt, vitest.                                                                                 |
| `reopen` #4            | `2026-05-26T12:30:59Z` | `Codex2`     | Failure: create/ack persistence is fire-and-forget so durability is not guaranteed; `requireText` trims `undefined` so missing fields turn into 500s instead of 400 `INVALID_DRIVER_OPS_INSTRUCTION`. Vitest/typecheck not re-runnable in worktree.   |
| `start` #4             | `2026-05-26T12:31:45Z` | `Codex`      | Rework: durability + body validation hardening.                                                                                                                                                                                                    |
| `handoff` #6           | `2026-05-26T12:41:00Z` | `Codex`      | Handoff on `b3681f5f`: create/ack now `await` repository persistence and fail with `503 DRIVER_OPS_INSTRUCTION_STORAGE_UNAVAILABLE`; required field validation rejects missing/non-string body values with `400 INVALID_DRIVER_OPS_INSTRUCTION`; create failure rolls back the staged notification. |
| `review_approved` #2   | `2026-05-26T12:44:43Z` | `Codex2`     | Final approval on `b3681f5f`: durable create/ack persistence gates visibility and returns `503 DRIVER_OPS_INSTRUCTION_STORAGE_UNAVAILABLE` on repository write failure; missing/non-string required fields reject with `400 INVALID_DRIVER_OPS_INSTRUCTION`; failed create rolls back staged driver notification; acknowledge stays idempotent after later expiry. Reviewer verification on detached worktree `/tmp/ui-be-008-review-2ay7G9` after `pnpm install --frozen-lockfile`. |
| `done` (final)         | `2026-05-26T12:48:09Z` | `Codex`      | Final closeout pushed: `commit_hash=f6f8aa8c`, `push_branch=codex/ui-be-008`, verification rerun green.                                                                                                                                              |

Verification trailers attached by the parent owner on commit `f6f8aa8c`
(final closeout):

- `LLM-Agent: Codex`
- `Task-ID: UI-BE-008`
- `Reviewer: Codex2`
- `Verification: pnpm exec vitest run tests/unit/driver-instruction.repository.test.ts; pnpm --filter @drts/api exec vitest run tests/unit/driver-instruction.service.test.ts; pnpm --filter @drts/api typecheck`

### Upstream dependency — `ai-status.json → UI-BE-003`

- declared `depends_on` of the parent
- contribution to `UI-BE-008`: foundational `apps/api` modules
  (auth realm policy, `ApiRequestError` envelope, `AuditNotificationModule`,
  `DatabaseModule`, identity context) on which the driver instruction
  service builds — the parent reuses
  `RequireRealms("platform", "ops")` /
  `RequireRealms("driver")`, `toApiSuccessEnvelope`, `ApiRequestError`,
  `AuditNotificationService.recordNotification` /
  `markNotificationsRead` / `recordAuditLog`, and the
  `DatabaseService.query` accessor without extending any of them
- live status of `UI-BE-003` is in `ai-status.json`; this packet does
  not snapshot it because the parent only depends on it through these
  stable surfaces and no diff under those modules was attributable to
  `UI-BE-008`

### Authoritative supporting documents

- `packages/contracts/src/ui-runtime.ts:305-325` — Q-DRV04
  `DriverOpsInstruction` contract: `instructionId / taskId / message /
issuedBy / issuedAt / expiresAt?`, with a docstring tying the surface
  to "ops-issued instruction surfaced to the driver, primarily for
  manual-fallback scenarios when a forwarded order needs human
  coordination."
- `packages/contracts/src/index.ts:808-813` —
  `CreateDriverOpsInstructionCommand { driverId, taskId, message,
expiresAt? }`.
- `packages/contracts/src/index.ts:815-819` —
  `AcknowledgeDriverOpsInstructionResult { instructionId, taskId,
acknowledgedAt }`.
- `infra/migrations/V0025__driver_ops_instructions.sql` — the durable
  storage table `ops.phase1_driver_ops_instructions` with
  `instruction_id / driver_id / task_id / issued_at / expires_at /
acknowledged_at / updated_at / record (jsonb)` plus four indexes
  (driver_id, task_id, updated_at DESC, expires_at WHERE NOT NULL).

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

The parent task formally depends only on `UI-BE-003`.

| Dep ID      | Relationship                                | What it contributes to `UI-BE-008`                                                                                                                                                                                                          |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UI-BE-003` | Foundational `apps/api` storage + endpoints | `RequireRealms`/`CurrentIdentity` auth realm policy, `ApiRequestError` envelope, `AuditNotificationModule` + `AuditNotificationService` (notification + audit log helpers), `DatabaseModule` + `DatabaseService.query`, identity-context wiring. |

The parent does not declare any other hard `depends_on` in machine
truth. There is no contract-side dependency entry because the parent
explicitly reuses the existing
`CreateDriverOpsInstructionCommand` / `AcknowledgeDriverOpsInstructionResult` /
`DriverOpsInstruction` types and adds no new contract surface.

### B. Downstream consumer map

`UI-BE-008` is a single backend module slice. Its downstream consumers
are not other `ai-status.json` tasks at packet time, but the driver
runtime contract (Q-DRV04) and the forwarded-order manual-fallback
scenarios documented in the contract surface.

| Consumer                                                | Relationship      | Why `UI-BE-008` matters                                                                                                                                                                                            |
| ------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Driver app `/trip` manual-fallback banner               | runtime consumer  | The driver-side `GET /driver/ops-instructions` + `POST /driver/ops-instructions/:instructionId/acknowledge` are how the driver app realises the Q-DRV04 banner described in `ui-runtime.ts:305-318`.                |
| Ops console driver-instruction issue surface            | runtime consumer  | The ops-side `POST /ops/driver-instructions` is the endpoint the ops console will call when an operator wants to inject a manual-fallback instruction onto a specific driver+task pair.                              |
| `UI-BE-008-SIDECAR-ACCEPTANCE` packet                   | sibling sidecar   | The acceptance packet at `support/sidecars/UI-BE-008/UI-BE-008-SIDECAR-ACCEPTANCE.md` records the same parent's acceptance checklist; this review packet adds the evidence map / lifecycle audit / reviewer focus.    |
| `AuditNotificationService.removeNotification`           | new helper        | Added in commit `b3681f5f` so create-failure rollback can purge a staged driver-task notification; downstream callers in other modules can reuse this helper but `UI-BE-008` is the only current caller.            |

Dispatch interpretation:

- No `ai-status.json` task currently records a hard machine-truth
  `depends_on` edge **to** `UI-BE-008` at packet time. The consumers
  above are runtime / sibling consumers, not formal dependencies, and
  should not be promoted to hard dependencies in machine truth without
  an explicit decision.

---

## 4. Implementation Evidence Map

The parent's closeout commit `f6f8aa8c` finalises the surface that
implementation commit `b3681f5f` already shipped; the diff of `b3681f5f`
touches four files (audit notification helper + driver-instruction
controller + service + service test), while the broader surface
(migration, repository, repository test, app-module wiring) was
already on `codex/ui-be-008` from `357e1351`. This section records what
each shipped file contributes and where the reviewer can find the
load-bearing lines as of `f6f8aa8c`.

### 4.1 `apps/api/src/modules/driver-instruction/driver-instruction.module.ts` (new — 18 lines)

- `@Module({ imports: [DatabaseModule, AuditNotificationModule],
controllers: [OpsDriverInstructionController,
DriverInstructionController], providers: [DriverInstructionRepository,
DriverInstructionService], exports: [DriverInstructionService] })`.
- Imports `DatabaseModule` so the optional `DriverInstructionRepository`
  can pick up `DatabaseService` when the API runs against a real
  Postgres; imports `AuditNotificationModule` so the service can
  enrich create/ack with audit logs and notification linkage.
- Registered in `apps/api/src/app.module.ts` (`DriverInstructionModule`
  import + module-list entry) so the controllers mount under the API.

### 4.2 `apps/api/src/modules/driver-instruction/driver-instruction.controller.ts` (new — 71 lines)

- Two NestJS controllers in one file:
  - `@Controller("ops/driver-instructions")` →
    `OpsDriverInstructionController` with a single
    `@Post()` `createInstruction(...)` route guarded by
    `@RequireRealms("platform", "ops")`. Uses
    `@CurrentIdentity()` to forward the actor into the service and
    `@Headers("x-request-id")` for envelope correlation.
  - `@Controller("driver/ops-instructions")` →
    `DriverInstructionController` with two routes guarded by
    `@RequireRealms("driver")`:
    - `@Get()` `listInstructions(...)` calls
      `service.listInstructionsForDriver(identity, taskId)` and
      returns `{ items }` inside the success envelope.
    - `@Post(":instructionId/acknowledge")`
      `acknowledgeInstruction(...)` calls
      `service.acknowledgeInstruction(instructionId, identity,
requestId)`.
- Both controllers wrap their service call result with
  `toApiSuccessEnvelope(..., requestId)` so every response carries the
  standard `apps/api/src/common/api-envelope.ts` shape — there is no
  module-local envelope semantics.
- The driver-side controller deliberately resolves the driver identity
  from `@CurrentIdentity()` (post-reopen #1 fix) — it does not trust a
  path-supplied `driverId`.

### 4.3 `apps/api/src/modules/driver-instruction/driver-instruction.service.ts` (new — 357 lines)

- Holds the in-memory cache `private readonly instructions = new
Map<string, PersistedDriverInstructionRecord>()` and an
  `@Optional() private readonly repository?:
DriverInstructionRepository`. `onModuleInit()` hydrates the cache from
  `repository.loadAll()` when persistence is enabled and falls back to
  an empty map (with a logged persistence failure) when the database
  is unreachable.
- `createInstruction(command, identity, requestId)`:
  - `requireOpsIdentity(identity)` rejects non-ops/non-platform actors
    with `403 OPS_IDENTITY_REQUIRED`.
  - `requireText("driverId" | "taskId" | "message", value)` is the
    **post-reopen-#4 fix** for body validation: it now rejects
    non-string values with `400 INVALID_DRIVER_OPS_INSTRUCTION` rather
    than throwing a 500 from `trim()`-on-`undefined`.
  - `normalizeExpiry(command.expiresAt, issuedAt)` returns `null` for
    missing/blank input, rejects non-string with
    `400 INVALID_DRIVER_OPS_INSTRUCTION_EXPIRY`, and rejects parse
    failures or non-future expiries with the same code.
  - Calls `auditNotificationService.recordNotification(...)` to stage
    the driver-task notification with the message body, then
    **awaits** `persist(instruction, "create_instruction")` (the
    post-reopen-#4 durability gate); on persistence failure the
    notification is purged via
    `auditNotificationService.removeNotification(notificationId)` so
    the staged side effect does not leak. Only after the await
    resolves does the instruction get inserted into the in-memory
    `instructions` map.
  - Returns the public-shape `DriverOpsInstruction` (no `driverId`,
    no internal acknowledgement state), and emits an audit log
    `issue_driver_ops_instruction` carrying `driverId / taskId /
expiresAt / notificationId`.
- `listInstructionsForDriver(identity, taskId?)`:
  - `requireDriverIdentity(identity)` rejects non-driver actors with
    `403 DRIVER_IDENTITY_REQUIRED`.
  - Filters the cache by `driverId === actor.actorId`, unacknowledged
    state, and not-expired (`!isExpired(instruction, now)`),
    optionally narrowing by `taskId`.
  - Sorts descending by `issuedAt` and maps to the public shape.
- `acknowledgeInstruction(instructionId, identity, requestId)`:
  - `requireDriverIdentity(...)` again; `requireText("instructionId",
...)` trims and validates.
  - Returns `404 DRIVER_OPS_INSTRUCTION_NOT_FOUND` for missing
    instructions or instructions whose `driverId !==
actor.actorId`.
  - **Post-reopen-#2 idempotency:** if `existing.acknowledgedAt !==
null`, the method returns the stored `acknowledgedAt` immediately
    without consulting `isExpired`, so repeated acks after later
    expiry stay idempotent rather than flipping into
    `DRIVER_OPS_INSTRUCTION_EXPIRED`.
  - Only on the first ack does the method check `isExpired(...)` and
    raise `410 DRIVER_OPS_INSTRUCTION_EXPIRED` if needed.
  - Awaits `persist(updated, "acknowledge_instruction")` before
    updating the in-memory cache, then marks the linked notification
    read via
    `auditNotificationService.markNotificationsRead({ notificationIds:
[updated.notificationId] }, requestId)`.
  - Returns `AcknowledgeDriverOpsInstructionResult` (instructionId,
    taskId, acknowledgedAt).
- `persist(instruction, context)`:
  - No-op when `repository` is undefined (in-memory mode).
  - On `repository.upsert(...)` failure, reports the failure via
    `repository.reportPersistenceFailure(error, context)` and throws
    `ApiRequestError(503,
"DRIVER_OPS_INSTRUCTION_STORAGE_UNAVAILABLE", ..., undefined, true)`.
    The fifth argument `true` flags this as a transient failure so the
    envelope layer can mark it retriable.

### 4.4 `apps/api/src/modules/driver-instruction/driver-instruction.repository.ts` (new — 91 lines)

- `@Injectable()` with `@Optional() private readonly databaseService?:
DatabaseService`. `isEnabled()` mirrors
  `databaseService?.isEnabled()`.
- `loadAll()` issues `SELECT record FROM
ops.phase1_driver_ops_instructions ORDER BY issued_at DESC` and parses
  each row's JSONB payload back into `PersistedDriverInstructionRecord`.
- `upsert(record)` runs the eight-column `INSERT … ON CONFLICT
(instruction_id) DO UPDATE` against
  `ops.phase1_driver_ops_instructions`, binding `instructionId,
driverId, taskId, issuedAt, expiresAt, acknowledgedAt, updatedAt,
JSON.stringify(record)` in that order. The migration in
  `infra/migrations/V0025__driver_ops_instructions.sql` declares
  `record jsonb NOT NULL` and the SQL casts the bind to `$8::jsonb`.
- `reportPersistenceFailure(error, context)` logs at `warn` level under
  the `DriverInstructionRepository` logger and is the single sink for
  persistence-failure observability.

### 4.5 `apps/api/src/modules/audit-notification/audit-notification.service.ts` (modified — +6 lines)

- Adds `removeNotification(notificationId: string)` which re-assigns
  `this.notifications = this.notifications.filter(...)` to drop the
  matching record. This is the helper the service uses to roll back a
  staged driver-task notification when `createInstruction` fails its
  persistence await — the **post-reopen-#4 rollback contract**.
- No other field/method on `AuditNotificationService` is changed by
  this task; the verification trailer's pnpm scopes do not exercise
  this method except through the driver-instruction service tests.

### 4.6 `infra/migrations/V0025__driver_ops_instructions.sql` (new — 28 lines)

- Creates `ops.phase1_driver_ops_instructions` with seven columns
  plus the `record jsonb NOT NULL` payload, primary-keyed on
  `instruction_id varchar(100)`.
- Creates four indexes:
  - `idx_driver_ops_instructions_driver` on `driver_id` (powers the
    driver inbox filter).
  - `idx_driver_ops_instructions_task` on `task_id` (powers the
    optional `taskId` narrowing in `listInstructionsForDriver`).
  - `idx_driver_ops_instructions_updated_at` on `updated_at DESC` (so
    operational sweeps can scan recent records cheaply).
  - `idx_driver_ops_instructions_expires_at` on `expires_at WHERE
expires_at IS NOT NULL` (partial index for expiry sweeps).

### 4.7 `apps/api/tests/unit/driver-instruction.service.test.ts` (new — 396 lines)

- Constructs a real `DriverInstructionService` over a real
  `AuditNotificationService` (with `auditNotificationService.removeNotification`
  exercised via the rollback path). The repository argument is
  intentionally `Optional`, so unit-level tests exercise the in-memory
  path and inject a mock repository when they need to assert
  persistence semantics.
- Nine `it(...)` cases (verbatim from the file):
  1. "lists only active unacknowledged instructions for the current
     driver"
  2. "hides expired instructions and marks linked notifications read on
     acknowledge"
  3. "rejects invalid or expired expiry timestamps"
  4. "rejects missing required fields with INVALID_DRIVER_OPS_INSTRUCTION"
  5. "waits for durable create persistence before exposing the
     instruction"
  6. "returns storage unavailable and leaves no in-memory residue when
     create persistence fails"
  7. "rejects acknowledging an expired instruction"
  8. "waits for durable acknowledge persistence before marking the
     instruction read"
  9. "keeps acknowledge idempotent after the instruction later expires"
- Cases #4, #5, #6, #8 are direct guard-rails for the
  `reopen` #4 findings (durability + 400 validation + rollback). Case
  #9 is the guard-rail for `reopen` #2 (post-expiry idempotent ack).

### 4.8 `tests/unit/driver-instruction.repository.test.ts` (new — 69 lines)

- Two `it(...)` cases against a fully mocked `DatabaseService`-shaped
  object (`{ isEnabled, query }`):
  1. "loads persisted instructions from
     `ops.phase1_driver_ops_instructions`" — asserts the SELECT SQL
     string contains `FROM ops.phase1_driver_ops_instructions` and
     returns the typed record.
  2. "upserts persisted instructions into
     `ops.phase1_driver_ops_instructions`" — asserts the INSERT SQL
     string contains `INSERT INTO ops.phase1_driver_ops_instructions`
     and that the bind-order is exactly
     `[instructionId, driverId, taskId, issuedAt, expiresAt,
acknowledgedAt, updatedAt, JSON.stringify(record)]`.
- The file sits under the root `tests/unit/` tree (not
  `apps/api/tests/unit/`) so that the root-level vitest config
  (`vitest.config.ts`, which globs `tests/unit/**/*.test.ts`) picks it
  up. The verification trailer accordingly invokes both `pnpm exec
vitest run tests/unit/driver-instruction.repository.test.ts` (root) and
  `pnpm --filter @drts/api exec vitest run
tests/unit/driver-instruction.service.test.ts` (app-scoped), which
  is the routing the parent reviewer locked in after reopen #3 (the
  earlier "outside @drts/api globs" finding has since been resolved by
  scoping the repository test at the root and keeping the service test
  inside the `@drts/api` package's `tests/unit/` tree).

### 4.9 `apps/api/src/app.module.ts` (modified)

- `import { DriverInstructionModule } from
"./modules/driver-instruction/driver-instruction.module";` is added,
  and `DriverInstructionModule` is appended to the `imports` list of
  the root `@Module({ imports: [...] })`. This is the one-line app
  registration that mounts the two controllers under their
  `ops/driver-instructions` and `driver/ops-instructions` paths.

### 4.10 Contract-boundary evidence

- consuming contract surfaces (all pre-existing; no
  `packages/contracts/src/` diff attributable to this task):
  - `packages/contracts/src/ui-runtime.ts:318-325` —
    `DriverOpsInstruction` (`instructionId / taskId / message /
issuedBy / issuedAt / expiresAt?`); the service's
    `toPublicInstruction(...)` projection returns exactly this shape.
  - `packages/contracts/src/index.ts:808-813` —
    `CreateDriverOpsInstructionCommand` (`driverId / taskId / message
/ expiresAt?`); the ops-create controller's
    `@Body() command: CreateDriverOpsInstructionCommand` matches this
    shape verbatim.
  - `packages/contracts/src/index.ts:815-819` —
    `AcknowledgeDriverOpsInstructionResult` (`instructionId / taskId /
acknowledgedAt`); the driver-ack route returns exactly this shape.
- there are no `git diff` lines under `packages/contracts/src/` or
  `packages/api-client/src/` attributable to this task — consistent
  with the parent's "no contract expansion" stance and verified by
  `git show --stat b3681f5f` (touches only audit + driver-instruction
  files) and the earlier closeout commit `357e1351` (touches only the
  driver-instruction + audit + migration + app-module surface, with no
  contracts-package changes).

### 4.11 Review-failure history (verbatim from `ai-activity-log.jsonl`)

For audit trail, the four `reopen` events that gate the
`review_approved` events on this parent. Each finding is anchored to
the working-tree fix that ultimately landed on commit `f6f8aa8c`
(via `b3681f5f` for the final cycle and via prior cherry-picks for the
earlier ones).

1. **Reopen #1 (`2026-05-25T17:20:34Z`, by `Codex2`):** "module does
   not compile because driver-instruction.module.ts imports missing
   `../common/common.module`; vitest acceptance is not wired because
   `driver-instruction.service.spec.ts` uses Jest APIs under a Vitest
   repo and sits outside configured test globs; storage/API shape
   diverges from canonical `DriverOpsInstruction` contract by missing
   `taskId / issuedBy / issuedAt` and by trusting path `driverId`
   instead of current identity on driver endpoints."
   - working-tree fix anchors:
     - `driver-instruction.module.ts:1-18` — imports only
       `DatabaseModule` + `AuditNotificationModule`; no
       `common.module` import.
     - `driver-instruction.service.test.ts` is now a Vitest file
       under `apps/api/tests/unit/`, inside `@drts/api` globs.
     - `driver-instruction.service.ts` projects via
       `toPublicInstruction(...)` returning
       `instructionId / taskId / message / issuedBy / issuedAt /
expiresAt`, matching `ui-runtime.ts:318-325` exactly.
     - `driver-instruction.controller.ts` driver routes
       (`@Controller("driver/ops-instructions")`) take only
       `@CurrentIdentity()` and an optional `taskId` query — no
       path-supplied driver identity is trusted.
2. **Reopen #2 (`2026-05-25T18:22:17Z`, by `Codex`):** "ack idempotency
   bug: once an instruction is acknowledged, retrying the same ack
   after `expiresAt` returned `DRIVER_OPS_INSTRUCTION_EXPIRED`."
   - working-tree fix anchor:
     - `driver-instruction.service.ts` (`acknowledgeInstruction`) —
       the early-return `if (existing.acknowledgedAt !== null) { return
{ instructionId, taskId, acknowledgedAt } }` runs **before** the
       `isExpired(...)` guard, so a second ack after later expiry
       reflects the already-stored timestamp instead of flipping into
       a 410.
     - Guard test: `service.test.ts` case "keeps acknowledge
       idempotent after the instruction later expires".
3. **Reopen #3 (`2026-05-25T18:30:36Z`, by `Codex`):** "`createInstruction`
   can throw 500 on malformed body values because `requireText()` /
   `normalizeExpiry()` call `trim()` on non-strings, and
   `driver-instruction.repository.test.ts` sits outside `@drts/api`
   test globs so package-level vitest does not run that storage
   coverage."
   - working-tree fix anchors:
     - `driver-instruction.service.ts` (`requireText`) — type-guards
       `typeof value !== "string"` first and raises
       `400 INVALID_DRIVER_OPS_INSTRUCTION` before ever calling
       `trim()`.
     - `driver-instruction.service.ts` (`normalizeExpiry`) — the
       same type guard precedes any `trim()` or `Date.parse(...)`.
     - The repository test is placed at the root
       `tests/unit/driver-instruction.repository.test.ts` (root vitest
       config globs `tests/unit/**/*.test.ts`), and the closeout
       verification trailer runs it via `pnpm exec vitest run
tests/unit/driver-instruction.repository.test.ts` so that storage
       coverage is part of the closeout checks even though it lives
       outside the `@drts/api` package's own `tests/unit/` tree.
4. **Reopen #4 (`2026-05-26T12:30:59Z`, by `Codex2`):** "create/ack
   persistence is fire-and-forget so storage durability is not
   guaranteed; `requireText` trims `undefined` and turns missing body
   fields into 500s instead of 400
   `INVALID_DRIVER_OPS_INSTRUCTION`."
   - working-tree fix anchors:
     - durability: `driver-instruction.service.ts` (`createInstruction`
       and `acknowledgeInstruction`) now `await persist(...)` before
       updating the in-memory `instructions` map. The shipped behaviour
       is "no visibility until persistence succeeds."
     - storage error envelope: `driver-instruction.service.ts`
       (`persist`) throws `ApiRequestError(503,
"DRIVER_OPS_INSTRUCTION_STORAGE_UNAVAILABLE", …, undefined, true)`
       so the failure is surfaced as a transient 503 rather than a
       silent in-memory write.
     - rollback: `createInstruction` wraps the await in a `try {
… } catch { auditNotificationService.removeNotification(notificationId);
throw error; }` so a failed persist removes the staged driver-task
       notification before the error reaches the envelope layer.
     - body validation: `requireText` checks `typeof value !==
"string"` and raises `400 INVALID_DRIVER_OPS_INSTRUCTION` for missing
       fields (closes the same finding as reopen #3 but now with a test
       case that asserts the exact code).
     - guard tests in `service.test.ts`: "rejects missing required
       fields with INVALID_DRIVER_OPS_INSTRUCTION", "waits for durable
       create persistence before exposing the instruction", "returns
       storage unavailable and leaves no in-memory residue when create
       persistence fails", "waits for durable acknowledge persistence
       before marking the instruction read".

### 4.12 Contract anchor

- `packages/contracts/src/ui-runtime.ts:305-325` —
  `Q-DRV04 — DriverOpsInstruction`, with the explicit docstring
  "Ops-issued instruction surfaced to the driver, primarily for
  manual-fallback scenarios when a forwarded order needs human
  coordination (Q-DRV04). The driver app shows this as an in-app
  banner + optional push, NOT as a static label … Consumed by:
  driver-app `/trip` (forwarded mode, manual fallback state)." This is
  the contract anchor the module is realising; reviewers can confirm
  the runtime route shape matches the contract without re-deriving the
  surface.

---

## 5. Acceptance Checklist

This checklist restates the parent acceptance bar as auditable line
items that the parent reviewer (`Codex2`) already applied. All bars
were satisfied at the second `review_approved` event
(`2026-05-26T12:44:43Z` on commit `b3681f5f`) and re-confirmed at the
final `done` event (`2026-05-26T12:48:09Z` on commit `f6f8aa8c`); items
below are pre-marked accordingly.

Legend: `[REQUIRED]` = explicit parent acceptance bar. `[DERIVED]` =
sidecar support gate for this packet. `[x]` = passed on the parent
reviewer's final pass.

### A. Storage gate `[REQUIRED]`

Parent acceptance line: `Storage + ops-side create + driver-side read;
expiresAt handling; vitest`

- [x] Durable storage table is provisioned via
      `infra/migrations/V0025__driver_ops_instructions.sql`
      (`ops.phase1_driver_ops_instructions` with primary key
      `instruction_id`, four supporting indexes, and a `record jsonb
NOT NULL` payload column).
- [x] `DriverInstructionRepository.loadAll()` /
      `DriverInstructionRepository.upsert(record)` provide the read/
      write surface used by `DriverInstructionService` and are
      validated by `tests/unit/driver-instruction.repository.test.ts`
      (root-level vitest case for both SQL surface and bind order).
- [x] `DriverInstructionService` `await`s `persist(...)` for both
      `createInstruction` and `acknowledgeInstruction` (post-reopen-#4
      durability fix); failures surface as `503
DRIVER_OPS_INSTRUCTION_STORAGE_UNAVAILABLE` and leave no in-memory
      residue. Service vitest cases: "waits for durable create
      persistence before exposing the instruction", "returns storage
      unavailable and leaves no in-memory residue when create
      persistence fails", "waits for durable acknowledge persistence
      before marking the instruction read".

### B. Ops-side create gate `[REQUIRED]`

- [x] `@Controller("ops/driver-instructions")` exposes a single
      `@Post()` route with `@RequireRealms("platform", "ops")`; the
      service rejects non-ops/non-platform actors with
      `403 OPS_IDENTITY_REQUIRED`.
- [x] `CreateDriverOpsInstructionCommand` body validation rejects
      missing/non-string `driverId / taskId / message` with
      `400 INVALID_DRIVER_OPS_INSTRUCTION` (post-reopen-#4 +
      post-reopen-#3 fix); rejects non-string or non-future
      `expiresAt` with `400
INVALID_DRIVER_OPS_INSTRUCTION_EXPIRY`. Service vitest case: "rejects
      missing required fields with INVALID_DRIVER_OPS_INSTRUCTION".
- [x] On success the service stages an audit notification via
      `auditNotificationService.recordNotification(...)`, persists the
      instruction, and emits an
      `issue_driver_ops_instruction` audit log carrying `driverId /
taskId / expiresAt / notificationId`. On persistence failure the
      staged notification is rolled back via
      `auditNotificationService.removeNotification(notificationId)`
      (post-reopen-#4 rollback contract).

### C. Driver-side read + ack gate `[REQUIRED]`

- [x] `@Controller("driver/ops-instructions")` exposes
      `@Get()` (list) and
      `@Post(":instructionId/acknowledge")` (ack), both guarded by
      `@RequireRealms("driver")`. The driver identity is read from
      `@CurrentIdentity()` and never trusted from the path
      (post-reopen-#1 fix).
- [x] `listInstructionsForDriver(identity, taskId?)` filters by
      `driverId === actor.actorId`, `acknowledgedAt === null`,
      `!isExpired(...)`, and the optional `taskId` query; sorts
      descending by `issuedAt` and projects to the public
      `DriverOpsInstruction` shape only.
- [x] `acknowledgeInstruction(...)` returns the existing
      `acknowledgedAt` immediately when the instruction is already
      acknowledged, so post-expiry retries stay idempotent
      (post-reopen-#2 fix). Service vitest case: "keeps acknowledge
      idempotent after the instruction later expires".
- [x] Acknowledging a never-acknowledged instruction past `expiresAt`
      raises `410 DRIVER_OPS_INSTRUCTION_EXPIRED`. Service vitest
      case: "rejects acknowledging an expired instruction".
- [x] Successful ack persists first, then marks the linked
      notification read via
      `auditNotificationService.markNotificationsRead({ notificationIds:
[updated.notificationId] }, requestId)` and emits an
      `acknowledge_driver_ops_instruction` audit log. Service vitest
      case: "hides expired instructions and marks linked notifications
      read on acknowledge".

### D. `expiresAt` handling gate `[REQUIRED]`

- [x] `normalizeExpiry(...)` rejects non-string with
      `400 INVALID_DRIVER_OPS_INSTRUCTION_EXPIRY`; treats blank/null
      as "no expiry" → `null`; rejects unparseable or
      non-future strings; otherwise normalises via `new
Date(parsed).toISOString()`. Service vitest case: "rejects invalid or
      expired expiry timestamps".
- [x] `isExpired(...)` only returns `true` when `expiresAt !== null
&& Date.parse(expiresAt)` is finite and ≤ `now`, so absent expiries
      never cause spurious expiry behaviour.
- [x] Expiry sweeps benefit from the partial index
      `idx_driver_ops_instructions_expires_at WHERE expires_at IS NOT
NULL` declared in V0025.

### E. Vitest gate `[REQUIRED]`

Closeout verification trailer (commit `f6f8aa8c`):

- [x] `pnpm exec vitest run
tests/unit/driver-instruction.repository.test.ts` — root-level vitest
      run for the two repository cases (loadAll + upsert) against the
      mocked `DatabaseService`.
- [x] `pnpm --filter @drts/api exec vitest run
tests/unit/driver-instruction.service.test.ts` — app-scoped vitest run
      for the nine service cases enumerated in §4.7.
- [x] `pnpm --filter @drts/api typecheck` — full tsc `--noEmit` against
      `@drts/contracts` build product. The reviewer re-ran the same
      three commands on a detached worktree
      (`/tmp/ui-be-008-review-2ay7G9`) after a fresh `pnpm install
--frozen-lockfile`; the result is captured verbatim in the parent
      reviewer's `2026-05-26T12:44:43Z` `review_approved` message.

### F. Sidecar handoff readiness `[DERIVED]`

- [x] This packet matches the current machine-truth owner/reviewer
      assignment for both the sidecar (owner=`Claude`,
      reviewer=`Codex`) and the parent task (owner=`Codex`,
      reviewer=`Codex2`).
- [x] This packet does not snapshot live parent `status` / `next` /
      `last_update` values as a replacement for `ai-status.json`; it
      records the most recent values as of generation only.
- [x] This packet records the parent's four-round reopen chain with
      explicit shipped-tree fix anchors so the audit story stays
      traceable without re-running `git log` from scratch.
- [x] This packet does not edit canonical truth — the parent's shipped
      files, the contract surfaces, the migration, the sibling
      acceptance sidecar, and `ai-status.json` remain untouched by this
      sidecar.
- [x] This packet does not record `done` evidence for the parent task;
      `Codex` already finalised that closeout at
      `2026-05-26T12:48:09Z` with
      `COMMIT_HASH=f6f8aa8c7481ac15d40c3b075387188f2b07786c` /
      `COMMIT_SUBJECT=UI-BE-008: finalize closeout` /
      `PUSH_REMOTE=origin` / `PUSH_BRANCH=codex/ui-be-008`.

---

## 6. Reviewer Focus

For `Codex` reviewing this sidecar:

- confirm the machine-truth anchor section (§2) matches the current
  `ai-status.json` fields for both `UI-BE-008-SIDECAR-REVIEW` and
  `UI-BE-008`, including the parent's `done` state at
  `2026-05-26T12:48:09Z` and the reviewer reassignment chain (`Codex2
→ Codex → Codex2 → Claude2 → Codex2`).
- confirm the upstream dependency table (§3.A) correctly identifies
  `UI-BE-003` as the only declared `depends_on` and that the surfaces
  consumed from it (auth realm policy, `ApiRequestError`,
  `AuditNotificationModule`, `DatabaseModule`, `@CurrentIdentity`) are
  the actual surfaces reused, not new ones.
- confirm the implementation evidence map (§4) faithfully describes
  the shipped files (`driver-instruction.module.ts`,
  `driver-instruction.controller.ts`, `driver-instruction.service.ts`,
  `driver-instruction.repository.ts`, `audit-notification.service.ts`
  `+removeNotification`, `V0025__driver_ops_instructions.sql`,
  `tests/unit/driver-instruction.repository.test.ts`,
  `apps/api/tests/unit/driver-instruction.service.test.ts`,
  `apps/api/src/app.module.ts`) without smuggling in changes the parent
  did not make.
- confirm §4.11 reproduces the four reopen events without paraphrasing
  them away from the reviewer's wording, and that each finding is
  anchored to a concrete file/line on commits `b3681f5f` and
  `f6f8aa8c`.
- confirm the acceptance checklist (§5) is a faithful expansion of the
  parent acceptance bar across the storage / ops create / driver read
  + ack / `expiresAt` / vitest gates, with the verification trailer
  on `f6f8aa8c` matching the three pnpm invocations the parent
  reviewer re-ran.
- confirm the packet remains support-only and does not modify the
  parent's implementation files, the contract surfaces, the migration,
  the sibling acceptance sidecar, or `ai-status.json`.

For `Codex2` (the parent reviewer) — this packet is **not** the
canonical review of the parent task. Codex2's review already ran on
commit `b3681f5f` at `2026-05-26T12:44:43Z` and approved. This packet
is a stable companion document that captures the evidence map and
four-round rework history at handoff time.

For `Codex` (the parent owner) — this packet is **not** the `done`
closeout. Codex already recorded `done` at
`2026-05-26T12:48:09Z` against `ai-status.json → UI-BE-008` with
`COMMIT_HASH=f6f8aa8c7481ac15d40c3b075387188f2b07786c`,
`COMMIT_SUBJECT=UI-BE-008: finalize closeout`, `PUSH_REMOTE=origin`,
`PUSH_BRANCH=codex/ui-be-008`.

---

## 7. Handoff Summary

This sidecar packet is scoped as stable reviewer support material for
the `phase1-ui-implementation-wave-202605` `DriverOpsInstruction`
backend slice. The parent task `UI-BE-008` itself remains canonical;
this packet is a reviewer companion that:

- pins the shipped backend files and the contract surfaces they consume
  without contract expansion.
- pins the durable storage surface
  (`ops.phase1_driver_ops_instructions` via migration V0025) and the
  repository SQL bind order that the storage tests assert verbatim.
- records the parent owner's verifications and the explicit
  "no contract expansion" guarantee at the `b3681f5f` and `f6f8aa8c`
  commit boundaries.
- records the parent reviewer's four-round failure chain with verbatim
  reopen wording and shipped-tree fix anchors, including the
  durability + rollback + 400 validation triad that drove the final
  review pass.
- restates the four-line parent acceptance bar (storage + ops create +
  driver read/ack + `expiresAt` + vitest) as an auditable checklist
  pinned to the closeout verification trailer.
- maps the parent's structural anchors (contract `Q-DRV04
DriverOpsInstruction`, command + result shapes in
  `packages/contracts/src/index.ts`, the `app.module.ts`
  registration, the sibling acceptance sidecar).
- defers all transient parent lifecycle truth (`status`, `next`,
  `last_update`, `commit_hash` / `push_*` confirmations) to
  `ai-status.json`.

The packet is consistent with the current post-closeout machine truth:
the parent is in `done`, the closeout commit `f6f8aa8c` is pushed to
`origin/codex/ui-be-008`, and the parent owner has already recorded
`done` with the metadata above. After sidecar review approval this
packet is intended to remain in `support/sidecars/UI-BE-008/` as a
stable reference alongside `UI-BE-008-SIDECAR-ACCEPTANCE.md`; it is not
absorbed into any other artifact and does not change canonical truth.
Since the parent does not plan to mutate the contract, the migration,
or any non-touched file, this packet's evidence map will continue to
read against the same set of files going forward and does not need
follow-up edits.
