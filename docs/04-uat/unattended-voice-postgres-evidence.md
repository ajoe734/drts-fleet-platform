# UV-EXEC-024 PostgreSQL Two-Instance Race & Fault Acceptance Evidence

- Task ID: `UV-EXEC-024`
- Title: 真實 PostgreSQL 兩實例競態與故障驗收 (Real PostgreSQL Two-Instance Race & Fault Acceptance)
- Owner: `Claude2` (reassigned from `Gemini` after PR #1870 / candidate `3fb58123f` failed CI; see §1.4)
- Reviewer: `Codex2`
- Planning Ref: [`docs/02-architecture/phase1-unattended-voice-booking-sa-20260906.md`](file:///home/lupin/workspace/drts-fleet-platform/docs/02-architecture/phase1-unattended-voice-booking-sa-20260906.md)
- System Design Ref: [`docs/02-architecture/phase1-unattended-voice-booking-sd-20260906.md`](file:///home/lupin/workspace/drts-fleet-platform/docs/02-architecture/phase1-unattended-voice-booking-sd-20260906.md)
- Two-Pass Audit Ref: [`docs/02-architecture/phase1-unattended-voice-booking-two-pass-audit-20260906.md`](file:///home/lupin/workspace/drts-fleet-platform/docs/02-architecture/phase1-unattended-voice-booking-two-pass-audit-20260906.md)
- Decision Ref: [`docs/01-decisions/SD-DP-20260906-013-unattended-voice-execution.md`](file:///home/lupin/workspace/drts-fleet-platform/docs/01-decisions/SD-DP-20260906-013-unattended-voice-execution.md)
- Execution Ref: [`docs/03-runbooks/unattended-voice-booking-execution-tasks-20260906.md`](file:///home/lupin/workspace/drts-fleet-platform/docs/03-runbooks/unattended-voice-booking-execution-tasks-20260906.md)
- Candidate Revision Ref: Fifth-round real-Postgres CI-failure remediation of `19bfb7876fa6` (PR #1885, itself §1.5's fourth-round Codex2 P1 remediation round); this round: §1.5 file state + Claude2's §1.6 `proofRequirements` fixture fix, committed on `claude2/uv-exec-024`

---

## 1. Executive Summary & Review Remediation

This document records the acceptance verification and execution evidence for **UV-EXEC-024**. Per the unattended voice system design and two-round audit findings (R1-T01 through R1-T08, R2-T01 through R2-T05, R2-S01, R2-S02, R2-V01 through R2-V03), this suite executes directly against an isolated, freshly migrated real PostgreSQL database using two distinct application instance proxies (Instance A and Instance B) sharing the database.

### 1.1 Remediation of Codex2 Review Findings (from Candidate `160768f3b`)

| Finding | Review Rejection Finding | Remediation Applied |
| :--- | :--- | :--- |
| **Finding 1** | Default localhost fallback permitted unconfigured test passes; generic `DATABASE_URL` fallback obscured isolation. | Strictly requires `UV_BOOKING_TEST_DATABASE_URL`. Prohibits fallback to `DATABASE_URL` or localhost defaults. Fails closed with exit code 1 when unconfigured. |
| **Finding 2** | Case 2.5 injected fault before `COMMIT` inside `withTransaction`, testing rollback instead of post-order-commit response loss. | Injects connection crash specifically on the actual order transaction `COMMIT` by tracking order write queries (`hasOrderWrite`). Pre-retry asserts orders=1, receipts=1, proofs=1, audits=1 in DB before Instance B retries idempotently. |
| **Finding 4** | Case 3.2 only checked fence helper; Case 3.3 only checked sequential driver SQL collision. | Case 3.2 executes real `CallcenterService.linkOrderToExistingSession`, testing `VOICE_ACTION_PENDING`, `VOICE_ORDER_ALREADY_LINKED`, and legacy SQL update locks. Case 3.3 tests concurrent voice vs enterprise dispatch reservation race on driver AND vehicle with deferred trigger rejection for old revision writers. |

These four findings were corrected in candidate `24af9f667` and independently confirmed by Codex2 ("Findings 1/2 from prior review are corrected"). Finding 3 (Cases 4.1/4.2/4.3) was **not** fully corrected by `24af9f667` and was rejected a second time; see §1.2.

### 1.2 Second-Round Remediation (Codex2 rejection of candidate `24af9f667`)

Codex2's second review found that Cases 4.1–4.3 still did not exercise real production services against Postgres:

> (1) Case 4.1 ... still inject hardcoded `getActiveDispatchAssignmentForOrder` mocks into timeout executor; seeded PostgreSQL rows are never read by the action ... (2) Case 4.2 ... never invokes `VoiceCallbackService` (import only): test-written sequential UPDATE predicates and INSERT attempts supply the very terminal guard being asserted ... (3) Case 4.3 ... awaits `initiateHandoff` fully before `cmdA.accept`, never overlaps confirm/handoff or tests confirm-first; `VoiceHandoffService` has no `auditService` injected, while `handleLateAiToolResult` returns `audited=true` even when no audit sink exists.

This round (owner: Claude2) makes the following changes:

**Case 4.1 (dispatch offer timeout, UV-AC-047).** `OwnedAutonomousDispatchExecutorService.handleOfferTimeout` resolves its guards against `OwnedMobilityService`'s in-memory cache, which is only ever populated from real Postgres via `OwnedMobilityRepository.loadState()` inside `onModuleInit()` — the previous test bypassed this entirely with a hand-fed mock answer. The rewritten test seeds real `ops.phase1_dispatch_assignments` / `ops.dispatch_resource_reservations` rows (with a `record` JSON blob matching what a real writer persists, not a partial stub), then builds a real `OwnedMobilityService` + `OwnedMobilityRepository` harness per instance (mirroring the constructor wiring already proven in `apps/api/tests/integration/stage1-uat-pg-gate.integration.test.ts`), calls `onModuleInit()` to hydrate each instance's cache from the committed DB state, and only then calls the real `getAutonomousDispatchExecutor().handleOfferTimeout(...)`. Both scenarios (already-accepted offer; offer replaced by a new assignment) are now decided by a fresh, real DB read instead of a scripted answer. This required adding `ops.passenger_dispatch_disclosure_snapshots` / `ops.consumer_notification_outbox` to this suite's `beforeAll` schema, since `loadState()` reads them too.

**Case 4.2 (callback cancel/complete race, UV-AC-046).** `VoiceCallbackService` was found to be a **pure in-memory `Map`** with no read/write path to `voice.callback_task` / `voice.callback_attempt` at all — a genuine production gap, not just a test-realism gap: no production code durably persists callback terminal-state CAS to those tables, despite the schema and the service's own SD §12.5 docstring describing exactly that CAS. Fixing this test honestly required a scoped production change: `VoiceCallbackService` gained two new methods, `completeCallbackDurable` / `cancelCallbackDurable`, which perform the terminal-state CAS as a real `UPDATE ... WHERE version = $n AND status NOT IN (...)` against `voice.callback_task` when a DB-enabled `databaseService` is supplied, re-verifying the authoritative row on a lost race instead of trusting a stale read. The pre-existing `completeCallback` / `cancelCallback` (synchronous, in-memory) are **unchanged** — converting them to `async` was attempted and reverted after it broke `tests/unit/uv-exec-018.test.ts`'s synchronous `expect(() => {...}).toThrowError(...)` assertions; the new methods are additive, not a replacement, and no existing caller constructs `VoiceCallbackService` with a `databaseService` today. The test now drives both races (complete-wins, cancel-wins, and a genuine `Promise.allSettled` concurrent barrier) through two real `VoiceCallbackService` instances sharing the suite's Postgres pool, instead of test-written `UPDATE ... WHERE status NOT IN (...)` predicates supplying their own guard. Attempt rows (`voice.callback_attempt`) remain seeded via direct SQL as call-closure/outcall evidence, since `recordAttempt`'s in-memory retry/SLA bookkeeping has no equivalent columns in that table and was out of scope for this fix.

**Case 4.3 (handoff vs confirm race, UV-AC-021).** Two independent bugs: (a) `VoiceHandoffService.handleLateAiToolResult` called `AuditNotificationService.recordAuditLog` — the synchronous, in-memory-only method — and unconditionally returned `audited: true` even when no `auditService` was injected at all. Fixed to `await recordAuditLogAsync` (which durably persists via `AuditLogRepository` when DB-enabled) and to only report `audited: true` once that write has actually resolved; `tests/unit/uv-exec-017.test.ts`'s mock audit service was extended with a `recordAuditLogAsync` mock to match (all 12 of its tests still pass). (b) The test awaited `initiateHandoff` to completion before starting `cmdA.accept`, so it never tested genuine concurrency or a confirm-first ordering. The rewritten test fires both via `Promise.allSettled` with no ordering imposed, and asserts on whichever of the two individually-valid outcomes actually occurred (`acceptNew`'s `FOR UPDATE` lock and `initiateHandoff`'s CAS `UPDATE` both re-validate against the row's committed state, so either winner is a legitimate outcome, not a bug) — the handoff-first branch retains the original "AI's accept rejected, zero orders/receipts" assertion; the confirm-first branch retries the handoff against the now-current session version, matching what a real coordinator client does on a 409. Either way, the late AI tool result at the original stale epoch is asserted against a **real row in `admin.audit_logs`** (`SELECT ... WHERE audit_id = $1`), not just the in-process return value. This required adding a minimal `core.tenants` stub table and the `admin.audit_logs` table (sliced from `V0009__admin_reporting_audit_and_integrations.sql`) to this suite's `beforeAll` schema.

### 1.3 What Was and Was Not Verified For This Round

This VM has **no local PostgreSQL and no Docker** (guardrail: no product/DB infrastructure on this host), so the changes in §1.2 could not be executed against a real database in this environment. What was verified here:

- `pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit`: **0 errors** (covers `voice-handoff.service.ts`, `voice-callback.service.ts`, `callcenter.service.ts`).
- `pnpm --dir apps/api exec eslint src/modules/voice-booking/voice-handoff.service.ts src/modules/voice-booking/voice-callback.service.ts src/modules/callcenter/callcenter.service.ts --max-warnings=0`: **0 errors**.
- `pnpm exec eslint tests/integration/unattended-voice-postgres.integration.test.ts tests/unit/uv-exec-017.test.ts --max-warnings=0`: **0 errors** (also fixed 3 pre-existing `no-empty` violations in `createInstance()`'s fault-injection proxy, unrelated to this round's logic, that would otherwise fail `pnpm run lint:root` on this file regardless of who touched it next).
- `pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts ...`: the file loads and all 16 cases collect correctly, and the suite **fails explicitly** with the required `UV_BOOKING_TEST_DATABASE_URL` error (acceptance requirement 1) since no DB is configured on this host — this confirms there are no import/reference errors in the rewritten Cases 4.1–4.3, but **does not** confirm the new assertions pass against real Postgres.
- `pnpm exec vitest run tests/unit/uv-exec-017.test.ts tests/unit/uv-exec-018.test.ts tests/unit/uv-exec-019.test.ts tests/unit/callcenter.test.ts apps/api/tests/unit/callcenter.service.test.ts`: **41/41 passed**, confirming the `voice-handoff.service.ts` and `voice-callback.service.ts` production changes did not regress existing in-memory (non-DB) callers.
- `pnpm run typecheck:root`: pre-existing, environment-specific gap unrelated to this change (this worktree's root `node_modules` cannot resolve `pg` / `@nestjs/event-emitter` types outside `apps/api`'s own tree — the same gap already affects `uv-exec-015`/`uv-exec-023`/`uv-exec-010-checkpoint` integration tests that predate this change; `apps/api`'s own tsconfig, which does resolve these packages, is clean).

**The §3.2 "16/16 passed" log below is from the prior round (candidate `24af9f667`, before this round's Case 4.1–4.3 rewrite) and does not cover this round's changes.** The real-Postgres run of the rewritten suite must happen in CI before this candidate is treated as passing; do not read §3.2 as evidence for the current diff.

### 1.4 Third-Round CI Failure Remediation (candidate `3fb58123f` / PR #1870, owner: Claude2)

`3fb58123f` (this file's §1.2/§1.3 round) was pushed as PR #1870 and reached CI. Two of the CI-only checks (real clean `pnpm install`, not this VM's environment-degraded one) failed, contradicting §1.3's assumption that the root `typecheck:root` gap was entirely environment noise:

| CI Job | Failure | Root Cause | Fix |
| :--- | :--- | :--- | :--- |
| `typecheck` / `Product smoke acceptance` | `tests/integration/unattended-voice-postgres.integration.test.ts(39,77): error TS2307: Cannot find module '@nestjs/event-emitter'` | The test's `typeof import("@nestjs/event-emitter")` type query resolves relative to the *test file's own location* (`tests/integration/`), which cannot reach `apps/api/node_modules` where that package is actually installed (pnpm nested layout) — unlike the runtime `require()` on the same line, which was correctly scoped via `createRequire(apps/api/package.json)`. This is a real bug in the candidate, not environment noise: §1.3 wrongly attributed it to the same class of gap as the unrelated pre-existing `pg`-resolution gap. | Replaced the `typeof import("@nestjs/event-emitter")` type annotation with `ConstructorParameters<typeof OwnedMobilityTaskEventsService>[0]`, borrowing the `EventEmitter2` type through an already-imported `apps/api` service constructor (whose own module resolution correctly reaches `apps/api/node_modules`) instead of importing the package's types directly from a test-tree location that can't see it. |
| `typecheck` / `Product smoke acceptance` | `tests/integration/unattended-voice-postgres.integration.test.ts(1153,11): error TS2322: Type 'string \| null' is not assignable to type 'string'` | Case 3.3's `orderA` comes from `VoiceCommandRunnerService.execute()`, whose return type is a union that includes the receipt shape (`orderId: string \| null`). The test passed `orderA.orderId` directly into `reserveDispatchResources`'s `orderId: string` field without narrowing. | Added `const orderAId = orderA.orderId; if (!orderAId) throw new Error(...)` immediately after the order is created, and used the narrowed local `orderAId` at both use sites (SQL param and `reserveDispatchResources` argument). |
| `Commit trailers` | `commit 24af9f667bd3: missing required trailer: Task-ID / LLM-Agent / Reviewer` | One historical commit on `gemini/uv-exec-024` predates the branch's trailer discipline. | Not fixed by amending that commit (would violate the no-rewrite-published-history rule in `docs/ops/branch-strategy.md` §11). Instead, this round's file state was ported onto a fresh commit on `claude2/uv-exec-024` (based on `dev`, not `gemini/uv-exec-024`'s history) via `git checkout origin/gemini/uv-exec-024 -- <files>`, so the new PR's commit history is exactly one commit with correct trailers and does not carry the offending commit forward. |

Verification performed this round (same VM constraints as §1.3 — no local Postgres/Docker):

- `pnpm exec tsc -p tsconfig.json --noEmit` (repo root, the exact command CI's `typecheck` / `Product smoke acceptance` jobs run): the two errors above are gone. Remaining output is limited to `Cannot find module 'pg'` and downstream `implicitly has an 'any' type` cascades, which are confirmed pre-existing/environment-only by reproducing the identical `pg` resolution failure against sibling integration files this round did not touch (`uv-exec-015.integration.test.ts`, `uv-exec-010-checkpoint.integration.test.ts`, `uv-exec-023.integration.test.ts`) and by a minimal repro (`declare const x: any; x.rows.every((r) => ...)` triggers the same `TS7006` once the receiver's type is unresolvable) — this worktree's root `node_modules` genuinely lacks a hoisted `pg` install (`ls node_modules/pg` → not found at canonical root), which CI's fresh install does not exhibit.
- `pnpm exec eslint tests/integration/unattended-voice-postgres.integration.test.ts apps/api/src/modules/voice-booking/voice-callback.service.ts apps/api/src/modules/voice-booking/voice-handoff.service.ts apps/api/src/modules/voice-booking/voice-session.repository.ts tests/unit/uv-exec-017.test.ts`: **0 errors/warnings**.
- `pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts --no-file-parallelism --maxConcurrency=1` (no `UV_BOOKING_TEST_DATABASE_URL` set, matching this VM's no-DB constraint): suite **fails explicitly** with the required "must be explicitly configured" error (16 tests skipped under the failed suite, 0 falsely reported as passed) — confirms the two fixes above did not introduce new import/collection-time errors.
- Real-Postgres re-verification of Cases 4.1–4.4 (the actual acceptance-relevant assertions) still has not happened in this VM and remains gated on CI, same as §1.3.

### 1.5 Fourth-Round Remediation (Codex2 rejection of locked SHA `3fd8371404ec2fd594a5b1af295eef9988f196f9` / PR #1885, owner: Claude2)

Codex2 rejected this candidate with four P1 findings. This round (owner: Claude2) addresses them as follows.

**[P1 F1] CI wiring — the suite could never run against a real DB in CI, and would hard-fail unrelated PRs.** `vitest.config.ts`'s root `include` (`tests/integration/**/*.test.ts`) picks this file up for the generic `pnpm run test:unit` used by both `ci.yml`'s "Unit tests" step and `ci-integ.yml`'s `unit` job — neither sets `UV_BOOKING_TEST_DATABASE_URL`, so this suite's intentionally hard `throw` in `beforeAll` (Acceptance 1 / UV-AC-023 forbids `describe.skipIf`-style silent skipping) would fail those jobs on every unrelated PR, and the dedicated isolated-DB step in `ci-integ.yml`'s `integration` job only ever ran `uv-exec-015.integration.test.ts`, never this file. Fix: `package.json`'s `test:unit` script now runs `vitest run --exclude tests/integration/unattended-voice-postgres.integration.test.ts` (the CLI `--exclude` flag *adds* to, rather than replaces, Vitest's default exclude list — verified empirically below), and `ci-integ.yml`'s `integration` job gained a new dedicated step, "Run UV-EXEC-024 real PostgreSQL two-instance race & fault matrix", modeled exactly on the existing `uv-exec-015` step: sets `UV_BOOKING_TEST_DATABASE_URL`, invokes `pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts --no-file-parallelism --maxConcurrency=1 --reporter=json`, and gates on `total >= 18 && passed === total && pending === 0 && success`, uploading the JSON results as a build artifact. This does not weaken fail-closed behavior: the suite still throws (not skips) when unconfigured; it is simply no longer *invoked* unconfigured by unrelated jobs.

**[P1 F2] Fixture hydration crash silently emptied every dispatch harness's cache for the whole file.** `OwnedMobilityRepository.loadState()` loads *every* row in `ops.phase1_owned_orders` (this suite's whole file shares one database), and `OwnedMobilityService.cloneOrder()` unconditionally spreads `[...order.approvalRequestIds]` / `[...order.complianceFlags]` for each one. Case 3.3's `orderB` (`record: {orderId}`) and Case 4.1's own order (`record: {orderId, status}`) both omitted these two fields, so `onModuleInit()`'s hydration threw for the *entire* table, was swallowed by `reportPersistenceFailure`'s catch, and left every `OwnedMobilityService` harness's cache empty for the rest of the suite — which is why Case 4.1 was observed returning `superseded_by_newer_assignment` instead of `offer_already_accepted` (an artifact of an empty cache, not a real result). Fix: both raw `INSERT`s now include `approvalRequestIds: [], complianceFlags: []` in their `record` jsonb, matching what every real writer (`voice-order-preparation.ts`'s `prepareVoiceOrder`) already puts there.

**[P1 F3] `completeCallbackDurable`/`cancelCallbackDurable` had no production caller, and task creation stayed in-memory.** Traced this precisely rather than guessing: `CallcenterService`'s `createCallbackTask`/`completeCallbackTask` never call `VoiceCallbackService` at all, and its `claimCallbackTask`/`recordCallbackAttempt`/`cancelCallbackTask` call the in-memory `claimCallback`/`recordAttempt`/`cancelCallback` inside a swallowed `try/catch` — but since nothing ever calls the in-memory `createCallback` either, those calls always 404 and are silently discarded; this is pre-existing, unrelated to this task. No code anywhere (grepped the full `apps/api/src` tree) inserts into `voice.callback_task`, and no code sets `voice.session.dialog_state = 'closed'` — the "call.ended" handling this schema implies has never been built. `CallcenterService`'s own call-session model (`CallSession`) also carries no `voiceSessionId`, and `voice.callback_task.voice_session_id`/`consent_snapshot_hash`/`contact_phone_encrypted` are all `NOT NULL` — wiring `CallcenterService` straight into the durable table would require either fabricating consent evidence it doesn't capture (violates SD §12.5 "沒有同意不能補造") or inventing an unreviewed `callId → voice.session` bridge. This is a genuine pre-existing product/architecture gap wider than this task's artifacts, not a narrow wiring omission — **not fixed by this round**, and flagged here rather than silently left as before. What *was* added, safely and additively: `createCallbackDurable` (real `INSERT INTO voice.callback_task`, enforcing consent/contact-evidence the same way `createCallback` does, with `uq_voice_callback_task_active_session`'s unique-violation handled as an idempotent replay), completing the create+complete+cancel durable API trio so a future caller has the full lifecycle available once the upstream consent-capture/call-linkage gap is designed. Recommend a follow-up task (scoped under whichever task owns the AI-voice callback-scheduling flow, likely adjacent to UV-EXEC-018) to build the actual production caller; UV-EXEC-024's own artifacts (this test file + this evidence doc) do not include `callcenter.service.ts`.

**[P1 F4] Case 4.1 never actually interleaved a stale cache with a real concurrent write, and this exposed a real bug once it did.** Both harnesses in the original Case 4.1 call `onModuleInit()` *after* the competing write already committed, so `getActiveDispatchAssignmentForOrder`'s cache read was always fresh — the scenario the audit asked for (an already-running instance holding stale `assigned` state while another instance accepts/replaces) was never exercised. Constructing it surfaced a genuine production bug: `OwnedAutonomousDispatchExecutorService.handleOfferTimeout` discarded the return value of `ownedMobilityService.handleDispatchTimeout(...)` and unconditionally proceeded to mark the (possibly stale-cached) order `redispatch_required` and start a new offer round. `handleDispatchTimeout` → `applyDispatchTimeout` *does* re-verify under a real transactional row lock (`closeSupersededDispatchAssignment`, explicitly commented as "the authoritative fence against a timeout racing an accept") and correctly returns `escalationAction: "superseded"` when the row already moved — but the caller ignored it, so a stale-cache instance would have redispatched an order another instance had already resolved. Fixed `handleOfferTimeout` to check `escalationAction === "superseded"` and return the same safe `superseded_or_no_op` result used by its own earlier cache-based checks, instead of falling through. Added two new cases, `Case 4.1b` (concurrent accept) and `Case 4.1c` (concurrent replace), each: seeds an offer as still-`assigned`/`held`, hydrates a harness's cache from that state, *then* commits the real competing write, then calls `handleOfferTimeout` on the now-stale harness and asserts `outcome: "superseded_or_no_op", reason: "offer_already_closed"` plus that the real winning state (DB rows) was left untouched. Suite total is now 18 cases (was 16); `ci-integ.yml`'s new gate and `docs/ops` test-command references below reflect this.

Verification performed this round (this VM has no local PostgreSQL/Docker per the guardrail, same constraint as prior rounds):

- `pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build && pnpm --filter @drts/api run typecheck`: **0 errors** (covers `owned-autonomous-dispatch-executor.service.ts` and `voice-callback.service.ts`; without the two builds first, this command shows a large pile of unrelated `@drts/contracts` missing-export errors purely from stale `dist/` output, confirmed by the fact they disappear entirely once the two packages are rebuilt).
- `pnpm exec tsc -p tsconfig.json --noEmit` (repo root): no new errors introduced by this round's test-file changes; the pre-existing `Cannot find module 'pg'` (root `tests/` can't reach `apps/api`'s nested `pg` install) and several other pre-existing, unrelated errors (`pdfjs-dist`, `ApiClient` duplicate-declaration in `packages/api-client`) are reproduced identically against already-merged files (`uv-exec-015.integration.test.ts`, `sr-report-001/*`, `fleet-partner-list-envelope.test.ts`) untouched by this round — confirmed pre-existing on `dev`, out of this task's four findings, not fixed here.
- `pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts --reporter=default` (no `UV_BOOKING_TEST_DATABASE_URL` set): correctly discovers all **18** cases and fails explicitly at `beforeAll` with the required configuration error (0 falsely reported as passed) — confirms the new Case 4.1b/4.1c and the `createCallbackDurable` addition introduced no collection-time errors.
- `pnpm exec vitest run --exclude tests/integration/unattended-voice-postgres.integration.test.ts -- tests/integration/unattended-voice-postgres.integration.test.ts` (simulating the fixed `test:unit` script): confirmed this file is **excluded** from the general run (does not appear anywhere in that run's failures/output) — the unrelated failures in that same run (`pdfjs-dist` resolution, one `db-apply.test.ts` case needing a locally-running `postgres` service) are pre-existing and unrelated to this file.
- Real-Postgres re-verification of the full 18-case matrix (the actual acceptance-relevant assertions, including the new Case 4.1b/4.1c and the `handleOfferTimeout` fix) still has not happened in this VM and remains gated on the new CI step in `ci-integ.yml`.

### 1.6 Fifth-Round CI Failure Remediation (real-Postgres run of candidate `19bfb7876fa6` / PR #1885, owner: Claude2)

§1.5's new CI step (F1) ran the 18-case suite against a real, freshly migrated PostgreSQL instance for the first time and failed 3 of 18 (CI run `34467160080`, job `integration` / `102838423476`):

```text
 ❯ Case 4.1: Late timeout race (UV-AC-047) is safe no-op on already accepted offer or replaced assignment
   AssertionError: expected 'superseded_by_newer_assignment' to be 'offer_already_accepted'
 ❯ Case 4.1b: Late timeout on a genuinely stale hydrated cache is still safe when a concurrent accept lands (UV-AC-047)
   AssertionError: expected 'superseded_by_newer_assignment' to be 'offer_already_closed'
 ❯ Case 4.1c: Late timeout on a genuinely stale hydrated cache is still safe when a concurrent replace lands (UV-AC-047)
   AssertionError: expected 'superseded_by_newer_assignment' to be 'offer_already_closed'
```

with this WARN immediately preceding each failure:

```text
[OwnedMobilityRepository] Owned mobility persistence skipped during module init: Cannot destructure property 'minPhotoCount' of 'order.proofRequirements' as it is undefined.
```

**Root cause: §1.5's P1 F2 fix was incomplete.** `OwnedMobilityService.cloneOrder()` calls `listComplianceGatesForOrder(order)` *before* it ever reaches its own `proofRequirements: { ...order.proofRequirements }` defaulting spread, and that call chain's `buildProofGate` unconditionally destructures `const { minPhotoCount, signoffRequired, expenseProofRequired } = order.proofRequirements` — a third required field alongside the `approvalRequestIds`/`complianceFlags` that §1.5 already fixed. Every raw `INSERT INTO ops.phase1_owned_orders` in this file (Case 3.3's `orderB`, and Case 4.1/4.1b/4.1c's own seeded order) still omitted `proofRequirements`, so `onModuleInit()`'s `loadState()` hydration threw for the whole shared table on the very next harness construction, was swallowed by `reportPersistenceFailure`'s catch, and left `OwnedMobilityService.dispatchAssignments`/`orders` empty — reproducing exactly the same failure mode §1.5 diagnosed for the other two fields (`currentAssignment` resolves to `null`, so `handleOfferTimeout`'s step 1 unconditionally returns `superseded_by_newer_assignment` regardless of the seeded DB state).

Fix: added `proofRequirements: { minPhotoCount: 0, signoffRequired: false, expenseProofRequired: false }` (the same shape `OwnedMobilityService`'s own order-creation path defaults to) to all four raw-SQL order seeds in this file — Case 3.3's `orderB`, and Case 4.1/4.1b/4.1c's own orders — and updated the two explanatory comments to name all three now-required fields instead of two.

Verification performed this round (same VM constraint as prior rounds — no local Postgres/Docker):

- `pnpm turbo run typecheck --filter=@drts/api`: **0 errors** (builds `@drts/contracts`/`@drts/control-plane-auth` first, then typechecks `@drts/api`; this is the correct dependency-ordered invocation — a bare `pnpm exec tsc --noEmit -p apps/api/tsconfig.json` without the prior builds shows spurious `@drts/contracts` missing-export errors from stale `dist/` output, same caveat as §1.5's verification note).
- `pnpm exec tsc -p tsconfig.json --noEmit` (repo root): no new errors from this round's diff (all four edits are additive JSON-literal properties inside existing `JSON.stringify({...})` calls); remaining output is the same pre-existing `Cannot find module 'pg'` / `ApiClient` duplicate-declaration noise reproduced identically on files this round did not touch, consistent with §1.5's finding that this gap is environment-specific to this worktree's root `node_modules`, not a real regression.
- Real-Postgres re-run of the 18-case matrix confirming these 3 cases now pass has not happened in this VM (no local Postgres/Docker, per guardrail) and remains gated on CI re-running the `integration` job against this round's commit.

---

## 2. Acceptance Matrix & Requirement Mapping

| Required Acceptance ID | Verification Target | Test Case / Suite | PostgreSQL Invariant / Schema Mechanism | Status |
| :--- | :--- | :--- | :--- | :--- |
| `isolated_postgres_environment` | Fail-closed connectivity & hermetic isolation | Suite 1: Cases 1.1 & 1.2 | Per-run database creation (`uv_exec_024_*`), connection verification, zero production data access | **PASSED** |
| `two_instance_crash_matrix_evidence` | Two instances, crashes before/after writes, response loss, runner race | Suite 2: Cases 2.1 – 2.7 | `uq_voice_command_receipt_action_key`, transactional rollback, idempotent replay, `raise_append_only` triggers | **PASSED** |
| `mixed_dispatch_entry_evidence` | Stale revision invalidation, legacy entry fence, shared capacity mutual exclusion | Suite 3: Cases 3.1 – 3.3 | `voice.draft_revision`, `voice_order_fence`, `uq_dispatch_resource_reservations_active` (SQLSTATE 23505) | **PASSED** |
| `callback_control_race_evidence` | Late timeout, callback race, handoff fence, control gap | Suite 4: Cases 4.1, 4.1b, 4.1c, 4.2 – 4.4 (18 total cases in the file) | `handleOfferTimeout` versioning (now checking `handleDispatchTimeout`'s `escalationAction` — see §1.5), `CALLBACK_TERMINAL_RACE_CONFLICT`, `lease_epoch` CAS, `last_applied_control_sequence` | **PENDING CI RE-VERIFICATION** (§1.5 added Cases 4.1b/4.1c and fixed a real `handleOfferTimeout` bug; the first real-Postgres CI run then caught an incomplete fixture fix — missing `proofRequirements` — fixed in §1.6; F3's production-caller wiring remains a documented open gap, see §1.5) |
| `reviewed_candidate_sha` | Independent review by assigned reviewer `Codex2` | Candidate handoff | SHA locked via `ai-status.sh handoff` for reviewer approval | **READY** |

### Detailed Functional Requirements (FR) & Acceptance Criteria (AC) Addressed

- **UV-FR-002, UV-FR-007, UV-FR-009, UV-FR-010, UV-FR-011, UV-FR-012, UV-FR-013, UV-FR-017, UV-FR-019, UV-FR-020, UV-FR-021, UV-FR-022, UV-FR-023, UV-FR-024, UV-FR-025, UV-FR-026, UV-FR-027, UV-FR-032**
- **UV-AC-009**: Idempotent acceptance and execution producing exactly 1 receipt and 1 order.
- **UV-AC-010**: Crash recovery before and after commit without ghost or orphan records.
- **UV-AC-021**: Handoff vs confirm race fencing late AI actor with lease epoch increment.
- **UV-AC-023**: Fail-closed PostgreSQL availability and clean database isolation.
- **UV-AC-037**: Proof and audit log append-only immutability.
- **UV-AC-043**: Resource scope and credential verification.
- **UV-AC-045**: Sequence contiguity and `controlCutoff` validation.
- **UV-AC-046**: Callback terminal state race conflict mitigation.
- **UV-AC-047**: Late autonomous dispatch offer timeout no-op protection.
- **UV-AC-048**: Multi-channel driver/vehicle dispatch reservation mutual exclusion.

---

## 3. Verification Commands & Execution Logs

### 3.1 Fail-Closed Verification (Unconfigured & Generic DATABASE_URL Rejection)

#### Test 1: Unconfigured Environment (Fails Closed)

```bash
env -u UV_BOOKING_TEST_DATABASE_URL -u DATABASE_URL pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts --no-file-parallelism --maxConcurrency=1
```

```text
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-uv-exec-024

 ❯ tests/integration/unattended-voice-postgres.integration.test.ts (16 tests | 16 skipped) 10ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/integration/unattended-voice-postgres.integration.test.ts > UV-EXEC-024 Real PostgreSQL Two-Instance Race & Fault Matrix
Error: UV-EXEC-024 Acceptance Requirement: UV_BOOKING_TEST_DATABASE_URL must be explicitly configured with an isolated test database. Falling back to default or generic DATABASE_URL is prohibited. Test suite fails explicitly when DB is unconfigured.
 ❯ tests/integration/unattended-voice-postgres.integration.test.ts:51:13


 Test Files  1 failed (1)
      Tests  16 skipped (16)
   Start at  23:41:25
   Duration  3.20s (transform 2.19s, setup 0ms, import 3.01s, tests 10ms, environment 0ms)
```

#### Test 2: Generic DATABASE_URL Rejection (Fails Closed)

```bash
env -u UV_BOOKING_TEST_DATABASE_URL DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts --no-file-parallelism --maxConcurrency=1
```

```text
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-uv-exec-024

 ❯ tests/integration/unattended-voice-postgres.integration.test.ts (16 tests | 16 skipped) 11ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/integration/unattended-voice-postgres.integration.test.ts > UV-EXEC-024 Real PostgreSQL Two-Instance Race & Fault Matrix
Error: UV-EXEC-024 Acceptance Requirement: UV_BOOKING_TEST_DATABASE_URL must be explicitly configured with an isolated test database. Falling back to default or generic DATABASE_URL is prohibited. Test suite fails explicitly when DB is unconfigured.
 ❯ tests/integration/unattended-voice-postgres.integration.test.ts:51:13


 Test Files  1 failed (1)
      Tests  16 skipped (16)
   Start at  23:41:31
   Duration  3.36s (transform 2.28s, setup 0ms, import 3.13s, tests 11ms, environment 0ms)
```

---

### 3.2 Full Two-Instance Fault Suite Execution (16/16 Passed)

```bash
UV_BOOKING_TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts --no-file-parallelism --maxConcurrency=1
```

```text
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-uv-exec-024

[Nest] 128975  - 09/09/2026, 11:47:50 PM    WARN [VoiceBookingRepository] Voice-booking transaction rollback failed: Connection terminated unexpectedly

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  23:47:45
   Duration  5.12s (transform 2.14s, setup 0ms, import 2.93s, tests 2.01s, environment 0ms)
```

All 16 tests executed directly against PostgreSQL:
1. `Suite 1: fails explicitly when database connection is invalid or unconfigured, without skipping` - **PASSED**
2. `Suite 1: uses an isolated test database with zero production passenger data` - **PASSED**
3. `Suite 2 Case 2.1: Concurrent acceptance race between Instance A and Instance B yields exactly 1 receipt and proof` - **PASSED**
4. `Suite 2 Case 2.2: Crash before accept write in Instance A rolls back, Instance B re-accepts cleanly` - **PASSED**
5. `Suite 2 Case 2.3: Response loss after accept write in Instance A, retry on Instance B discovers existing receipt` - **PASSED**
6. `Suite 2 Case 2.4: Crash before order commit in runner (Instance A), Instance B recovers and commits exactly 1 order` - **PASSED**
7. `Suite 2 Case 2.5: Response loss after order commit in Instance A, retry on Instance B discovers succeeded receipt and creates no second order` - **PASSED**
8. `Suite 2 Case 2.6: Concurrent runner execution produces exactly 1 order with zero duplicate side effects` - **PASSED**
9. `Suite 2 Case 2.7: Immutability triggers on booking_command_proof and booking_audit_intent reject mutation` - **PASSED**
10. `Suite 3 Case 3.1: Old revision invalidation rejects stale confirmation and permits only current revision` - **PASSED**
11. `Suite 3 Case 3.2: Mixed entry fence prevents call-center / legacy double booking on active voice call` - **PASSED**
12. `Suite 3 Case 3.3: Shared driver and vehicle capacity contention between voice and enterprise dispatch enforces mutual exclusion` - **PASSED**
13. `Suite 4 Case 4.1: Late timeout race (UV-AC-047) is safe no-op on already accepted offer or replaced assignment` - PASSED against the pre-fix mock-based version above; **rewritten this round to use a real hydrated `OwnedMobilityService`, not yet re-run against Postgres (see §1.2/§1.3)**
14. `Suite 4 Case 4.2: Callback cancel vs complete race (UV-AC-046) enforces terminal immutability and outcall fencing` - PASSED against the pre-fix in-memory-Map version above; **rewritten this round to use real `VoiceCallbackService.completeCallbackDurable`/`cancelCallbackDurable`, not yet re-run against Postgres (see §1.2/§1.3)**
15. `Suite 4 Case 4.3: Handoff vs confirm race (UV-AC-021) fences AI actor and discards late AI writes into audit log` - PASSED against the pre-fix sequential version above; **rewritten this round for genuine concurrency and real `admin.audit_logs` persistence, not yet re-run against Postgres (see §1.2/§1.3)**
16. `Suite 4 Case 4.4: Control gap / out-of-order sequence check (UV-AC-045) enforces contiguous control stream` - **PASSED** (unchanged this round)

---

### 3.3 Supporting Regressions & Quality Verification

- **Unit test suites**: `pnpm exec vitest run tests/unit/uv-exec-014.test.ts tests/unit/uv-exec-015.test.ts`
  ```text
   Test Files  2 passed (2)
        Tests  81 passed (81)
     Duration  3.47s
  ```
- **Typecheck**: `pnpm exec tsc --noEmit -p apps/api/tsconfig.json` exited with code 0.
- **Prettier**: `pnpm exec prettier --check tests/integration/unattended-voice-postgres.integration.test.ts` passed cleanly.
- **Git diff check**: `git diff --check` passed cleanly with 0 whitespace issues.

---

## 4. Candidate Handoff Declaration

- Worktree (this round): `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-uv-exec-024`, branch `claude2/uv-exec-024` (based on `dev`).
- Branch: `claude2/uv-exec-024`
- Owner this round: `Claude2` (fifth round; remediates 3 real-Postgres CI test failures on candidate `19bfb7876fa6` / PR #1885 — see §1.6. §1.5's own four Codex2 P1 fixes remain otherwise unchanged this round).
- Delivery Files:
  - `tests/integration/unattended-voice-postgres.integration.test.ts` (§1.6: added the missing `proofRequirements` field to all four raw-SQL order seeds)
  - `docs/04-uat/unattended-voice-postgres-evidence.md`
  - `.github/workflows/ci-integ.yml` (F1, §1.5: dedicated isolated-DB CI step + evidence upload)
  - `package.json` (F1, §1.5: `test:unit` excludes this file from the generic, unconfigured run)
  - `apps/api/src/modules/owned-mobility/owned-autonomous-dispatch-executor.service.ts` (F4, §1.5: production fix — `handleOfferTimeout` now honors `handleDispatchTimeout`'s DB-authoritative `escalationAction: "superseded"` instead of discarding it)
  - `apps/api/src/modules/voice-booking/voice-callback.service.ts` (F3, §1.5: additive `createCallbackDurable`; production-caller wiring remains an open, documented gap)
- Independent Reviewer: `Codex2`
- Open item for reviewer judgment: F3's production-caller wiring is intentionally not done this round — §1.5 documents why (pre-existing consent-capture and `voice.session` linkage gap wider than this task's artifacts) and recommends a follow-up task rather than an unreviewed architectural bridge.
