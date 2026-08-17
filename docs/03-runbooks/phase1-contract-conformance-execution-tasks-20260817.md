# Phase 1 Contract Conformance Execution Tasks (2026-08-17)

**Status:** ready for supervisor registration and dispatch
**Baseline:** `origin/dev@f068135e0`
**GAP:** `docs/02-architecture/phase1-prd-service-contracts-conformance-audit-20260817.md`
**Registration:** `tools/task-dispatch/dispatch-phase1-contract-conformance-20260817.py`

## 1. Dispatch rules

1. The supervisor, not the planning agent, creates worker branches and starts auto
   workers.
2. Every worker starts from current `origin/dev`, reads the GAP, and records the exact
   base SHA.
3. Owner and reviewer are different lanes. Owner hints may be health-reassigned by the
   supervisor without changing task scope.
4. Workers edit only listed artifacts. Shared-file expansion requires a supervisor note
   before editing.
5. Each implementation task produces a normal PR and candidate SHA. Task status becomes
   done only after independent review, same-SHA CI, merge, and the listed acceptance
   evidence.
6. **`CONF-IDEM-001` must merge before any of `CONF-IDEM-002/003/004` starts.** It
   settles replay-versus-conflict semantics and the shared helper; three workers
   inventing three different answers is the specific failure this ordering prevents.
7. **`CONF-EVENT-001` produces a decision document and no production code.** A worker
   that finds itself adding event topics has misread the task and must stop.
8. No task may claim conformance from a sequential test where the specification
   requires a concurrency guarantee. See `CONF-VERIFY-001`.

## 2. Dependency graph

```text
Wave A: four independent roots

CONF-AUDIT-001   (GAP-CONF-03, smallest, first)
CONF-IDEM-001    (GAP-CONF-01 foundation) --+
CONF-EVENT-001   (GAP-CONF-02 decision)     |
CONF-DOC-001     (status reconciliation)    |
                                            |
Wave B: parallel, all depend on CONF-IDEM-001
                                            |
        +-----------------------------------+
        |
        +--> CONF-IDEM-002  (owned-mobility, 3 commands)  --+
        +--> CONF-IDEM-003  (finance/reporting, 3 commands)-+
        +--> CONF-IDEM-004  (callcenter/complaint/tenant, 3)+
                                                            |
Wave C                                                      |
        CONF-IDEM-005 (client SDK) <------------------------+
        CONF-CODE-001 (independent, may run any time)
        CONF-STATE-001 (independent, planning)
                                                            |
Wave D                                                      |
        CONF-VERIFY-001 <-- CONF-IDEM-005
```

Maximum useful concurrency is four in Wave A and three in Wave B. `CONF-CODE-001` and
`CONF-STATE-001` have no dependencies and may be scheduled whenever a lane is free.

## 3. Wave A

### CONF-AUDIT-001 — Enforce audit-log immutability in the database

**Priority:** P1
**Owner hint:** Codex
**Reviewer hint:** Claude
**Dependencies:** none
**Workstream:** audit-integrity
**Gate:** C1

**Execution prompt**

Close GAP-CONF-03. Add a `BEFORE UPDATE OR DELETE` trigger on `admin.audit_logs` that
raises an exception, making the append-only claim in PRD 13.3 and 14.2.7 enforced by
the database rather than by repository convention.

Determine the production database role behind `DATABASE_URL` before deciding whether
`REVOKE UPDATE, DELETE` adds anything. `operations/database/db-common.sh:9` defaults
the local role to `postgres`; table owners and superusers are not bound by `REVOKE`, so
a `REVOKE`-only change may be inert. The trigger is the primary control precisely
because it binds the owner too. Add `REVOKE` as defence in depth only if the production
role is confirmed to be a non-owner.

Provide an explicit privileged archival path so that any lawful retention deletion is a
deliberate, recorded operation. Do not leave the system in a state where the only way to
delete an aged record is to remove the protection permanently.

Do not change the audit repository or any calling code. The invariant already holds at
the application layer; this task moves it into the database.

**Owned artifacts**

- `infra/migrations/` one new forward migration
- `operations/database/` archival path documentation if a script is required
- `tests/security/` or `tests/integration/` negative test
- `docs/02-architecture/phase1-prd-service-contracts-conformance-audit-20260817.md` GAP status only

**Acceptance**

- A direct `UPDATE` on `admin.audit_logs` raises an exception and changes no row.
- A direct `DELETE` on `admin.audit_logs` raises an exception and changes no row.
- Both are proven by an automated negative test, not by a manual transcript.
- `INSERT` and all existing read paths are unaffected; the audit suite stays green.
- The migration is idempotent and safe to rerun, consistent with existing `infra/migrations` style.
- The production connection role is stated in the PR, with the `REVOKE` decision justified by it.
- The retention/archival path is documented and does not require permanently disabling the protection.

---

### CONF-IDEM-001 — Settle idempotency semantics and land the shared foundation

**Priority:** P0
**Owner hint:** Codex2
**Reviewer hint:** Gemini
**Dependencies:** none
**Workstream:** idempotency-foundation
**Gate:** C2

**Execution prompt**

Close the design half of GAP-CONF-01. Decide and record the wire semantics, then land
the shared mechanism that `CONF-IDEM-002/003/004` will apply. Implement no endpoint
from the list of nine in this task.

The semantic question is binding on all three downstream tasks: contracts section 4.1
names `DUPLICATE_IDEMPOTENCY_KEY`, which implies an error response, whereas
conventional idempotency returns the original successful response. The audit recommends
replaying the stored response when the key and payload match and returning `409` only
when the key is reused with a different payload. Adopt or reject that recommendation
explicitly; do not leave it to the implementing tasks.

Derive the shared helper from the four existing correct implementations rather than
inventing a pattern: `V0063__multi_taxi_payment_recovery_commands.sql:22`,
`V0062__multi_taxi_electronic_certificate_writer.sql:36-37`,
`certificate-support.repository.ts:285-302`, and
`billing-settlement.service.ts:662-676`.

The database `UNIQUE` constraint is mandatory in the pattern. A service-layer
look-up-then-insert check fails under exactly the concurrency that retries produce.
Any helper that makes the constraint optional is incorrect.

Scope uniqueness to an object and an operation, following `V0063`'s
`(payment_id, action, idempotency_key)` rather than a bare key, so that keys colliding
across tenants cannot interfere.

**Owned artifacts**

- `docs/02-architecture/` idempotency semantics decision, appended to the audit or as a short SD note
- shared idempotency helper under `apps/api/src/common/`
- migration template or shared DDL fragment under `infra/migrations/`
- `packages/contracts/src/` error code additions if the decision requires them
- focused unit tests for the helper

**Acceptance**

- Replay-versus-conflict semantics are decided and recorded with reasoning, and the decision names the response code for each of the three cases.
- The helper covers all three cases: unseen key executes; seen key with matching payload replays the stored response; seen key with differing payload returns conflict.
- Response storage is part of the pattern, since replay requires it.
- The pattern mandates a database `UNIQUE` constraint and documents why a service-layer check alone is insufficient.
- Uniqueness scoping guidance is explicit, including the recommended `(tenant_id, idempotency_key)` scope for order creation.
- Payload comparison is defined precisely enough that three independent workers implement it identically.
- Helper unit tests pass, including a concurrent-insert case.

---

### CONF-EVENT-001 — Decide the domain event contract, implement nothing

**Priority:** P0
**Owner hint:** Claude
**Reviewer hint:** Codex2
**Dependencies:** none
**Workstream:** event-architecture
**Task class:** planning
**Gate:** C7

**Execution prompt**

Close GAP-CONF-02 by producing a decision, not code. Contracts section 5.2 specifies
roughly 40 topics; 26 do not exist anywhere in the codebase, there is no event bus and
no outbox, and `DomainEventEnvelope` is used only by two WebSocket stream types.

Establish first why this is not a coding defect: section 5.2 was written for thirteen
independently deployed services, while Order, Dispatch, and Driver Task are implemented
inside one 10,884-line module in one process, where a direct typed call inside one
transaction is the better mechanism. Then choose between:

**(a) Ratify the monolith.** Annotate section 5.2 as an unimplemented target contract.
Promote the three mechanisms that actually exist into the contract as the Phase 1
truth: the tenant webhook catalogue (`booking.created`, `booking.updated`,
`dispatch.assigned`, `invoice.issued`), the dispatch trace log, and the audit log.
Align the `invoice.issued` versus `tenant.invoice.generated` naming. Rewrite section 6's
five compensation designs in terms of synchronous calls and retries.

**(b) Introduce a transactional outbox.** Specify the outbox table, the delivery worker,
consumer-side idempotency, ordering guarantees, retry and dead-letter handling, and
monitoring. Size it honestly as a wave and produce the follow-up execution packet
rather than starting implementation here.

Record GAP-CONF-07 as input: the section 7.1 write-authority matrix assigns three
separate authorities to what is one module. Whichever option is chosen, section 7.1 must
end up consistent with it.

Do not implement a subset of topics under any circumstance. A partial feed means no
consumer can assume completeness, which removes the reason to have events, and misleads
the next engineer into treating an incomplete feed as a reconciliation source.

**Owned artifacts**

- `docs/01-decisions/` new accepted decision packet
- `phase1_service_contracts_v1.md` sections 5.2, 6, and 7.1 under controlled sync
- `docs/03-runbooks/` follow-up execution packet if option (b) is chosen
- `CANONICAL_DOCUMENT_MAP.md` if a new decision packet is added

**Acceptance**

- The decision states option (a) or (b) with reasoning, and names who accepted it.
- Contracts sections 5.2, 6, and 7.1 are internally consistent with the chosen option; no section still describes an architecture that was rejected.
- The three existing mechanisms are documented with their real topic names.
- The `invoice.issued` naming discrepancy is resolved in one direction.
- If (b): a sized follow-up packet exists and no production code was written in this task.
- If (a): section 5.2 is unambiguously marked as not implemented in Phase 1, so no future reader treats it as a live contract.
- No new event topic was added to the codebase by this task.

---

### CONF-DOC-001 — Reconcile decided scope that documents still call open

**Priority:** P2
**Owner hint:** Gemini2
**Reviewer hint:** Claude
**Dependencies:** none
**Workstream:** doc-truth
**Gate:** C10

**Execution prompt**

`PHASE1_OPEN_QUESTIONS.md` lists Q-006 (passenger surface topology) and Q-008
(concierge workflow placement) under Open Items, although both were decided by
`MSC-P1-001`. Move them to the resolved section citing that decision.

Contracts section 10 lists five contract-review questions with no recorded resolution
anywhere: `call_session` to `order` cardinality, `flight_ref` retention for airport
transfer, whether driver payout is request-only, whether forwarded orders need a local
`trip completed` projection, and whether report artifacts require permanent object lock.
Give each an owner and a decision route. Do not decide them in this task; several have
contract consequences that belong with the owning service.

Add the `call_point_id` contract-type gap from the audit's naming register to whichever
backlog owns `packages/contracts` synchronisation.

Documentation only. No code, no schema.

**Owned artifacts**

- `PHASE1_OPEN_QUESTIONS.md`
- `phase1_service_contracts_v1.md` section 10 only
- `docs/02-architecture/phase1-prd-service-contracts-conformance-audit-20260817.md` section 7 status

**Acceptance**

- Q-006 and Q-008 appear under resolved items citing `MSC-P1-001`, and no longer under Open Items.
- Each of the five section 10 questions has a named owner and a decision route.
- No question is silently closed without a decision reference.
- The `call_point_id` gap is recorded in an owning backlog.
- No code or schema changed.

## 4. Wave B — idempotency implementation

All three depend on `CONF-IDEM-001` and apply its decided semantics and helper without
modification. Their file ownership is disjoint and they may run fully in parallel. Any
worker that believes the helper is wrong stops and reports to the supervisor rather than
diverging locally.

Each task follows the same four layers: controller header binding, service validation,
repository unique-violation translation, and a database `UNIQUE` constraint.

### CONF-IDEM-002 — Idempotency for order, booking, and dispatch commands

**Priority:** P0
**Owner hint:** Gemini
**Reviewer hint:** Codex
**Dependencies:** `CONF-IDEM-001`
**Workstream:** idempotency-orders
**Gate:** C3

**Execution prompt**

Apply the `CONF-IDEM-001` pattern to three of the nine specified commands, all in
`owned-mobility`: create passenger order, create tenant booking, and dispatch
assign/redispatch.

These carry the highest duplicate cost in the audit: a duplicate order dispatches a
second vehicle and charges a second time.

Reconcile the existing partial support in the referral booking path, which reads a body
field `idempotencyKey` at `owned-mobility.service.ts:10132`, with the header contract.
Do not leave two competing mechanisms; either the body field becomes an accepted alias
with documented precedence, or it is migrated.

Scope uniqueness per `CONF-IDEM-001` guidance, `(tenant_id, idempotency_key)` for order
creation.

**Owned artifacts**

- `apps/api/src/modules/owned-mobility/`
- `infra/migrations/` one forward migration
- `tests/integration/` or `tests/unit/` focused idempotency tests

**Acceptance**

- All three commands reject a missing key with the decided error code.
- A repeated key with an identical payload replays the stored response and creates no second record.
- A repeated key with a differing payload returns conflict.
- Uniqueness is enforced by a database constraint, not only by a service-layer lookup.
- The referral body-field path and the header contract are reconciled with documented precedence.
- Existing owned-mobility tests stay green.

---

### CONF-IDEM-003 — Idempotency for finance and reporting commands

**Priority:** P0
**Owner hint:** Codex
**Reviewer hint:** Gemini2
**Dependencies:** `CONF-IDEM-001`
**Workstream:** idempotency-finance
**Gate:** C3

**Execution prompt**

Apply the `CONF-IDEM-001` pattern to three of the nine specified commands: driver payout
request and reimbursement batch approval in `billing-settlement`, and create report job
plus generate filing package in `reporting-filing`.

Duplicate execution here moves money with no automated recovery, and produces duplicate
filing packages whose manifest hashes disagree. Filing packages are declared immutable
once complete, so a duplicate is not correctable after the fact.

`billing-settlement` already contains the reference service-layer validation at
`billing-settlement.service.ts:662-676`. Reuse the shared helper rather than copying
that code a second time.

**Owned artifacts**

- `apps/api/src/modules/billing-settlement/`
- `apps/api/src/modules/reporting-filing/`
- `infra/migrations/` one forward migration
- focused tests under `tests/`

**Acceptance**

- All listed commands reject a missing key with the decided error code.
- A repeated key with an identical payload replays the stored response and creates no second batch, job, or package.
- A repeated key with a differing payload returns conflict.
- Uniqueness is enforced by a database constraint.
- Filing package manifest and checksum immutability is preserved and proven unaffected.
- The existing payment recovery idempotency path continues to pass and is not duplicated by the new helper.

---

### CONF-IDEM-004 — Idempotency for callcenter, complaint, and webhook commands

**Priority:** P0
**Owner hint:** Claude2
**Reviewer hint:** Codex2
**Dependencies:** `CONF-IDEM-001`
**Workstream:** idempotency-crm
**Gate:** C3

**Execution prompt**

Apply the `CONF-IDEM-001` pattern to the remaining three of the nine specified commands:
create call-center order in `callcenter`, create complaint case in `complaint`, and
webhook test delivery in `tenant-partner`.

Contracts section 3.10 states that `case_no` is unique and immutable; a duplicate case
for one complaint creates two independent SLA timers, which is the failure this closes.

Create call-center order is an orchestration across Callcenter and Order Service per
contracts section 4.5. Ensure the key covers the whole orchestration, so a retry cannot
create a second order while reusing the first call session link.

**Owned artifacts**

- `apps/api/src/modules/callcenter/`
- `apps/api/src/modules/complaint/`
- `apps/api/src/modules/tenant-partner/` webhook test delivery path only
- `infra/migrations/` one forward migration
- focused tests under `tests/`

**Acceptance**

- All three commands reject a missing key with the decided error code.
- A repeated key with an identical payload replays the stored response and creates no second order, case, or delivery.
- A repeated key with a differing payload returns conflict.
- Call-center order creation is idempotent across the full orchestration, not only at the Order Service boundary.
- One complaint retry yields exactly one `case_no` and one SLA timer.
- Uniqueness is enforced by a database constraint.

## 5. Wave C

### CONF-IDEM-005 — Bind client idempotency keys to user intent

**Priority:** P0
**Owner hint:** Gemini2
**Reviewer hint:** Claude2
**Dependencies:** `CONF-IDEM-002`, `CONF-IDEM-003`, `CONF-IDEM-004`
**Workstream:** idempotency-client
**Gate:** C5

**Execution prompt**

Close the client half of GAP-CONF-01. `packages/api-client/src/index.ts:661-666`
injects `Idempotency-Key` into every POST using `createRequestToken()`, which returns a
fresh `crypto.randomUUID()` on each call. The key therefore changes on every retry,
which defeats server-side idempotency completely even after Wave B lands.

Replace per-call generation with per-intent binding: a key is created when the user
initiates an action, travels with every retry of that action, and is discarded only
after a terminal outcome. Blanket auto-injection must be removed, because a key that
differs per attempt is worse than no key: it presents the appearance of protection while
providing none.

Audit the web surfaces that submit the nine commands and bind keys at the point of
intent. Where a surface cannot yet do so, make the absence explicit rather than
generating a throwaway key.

**Owned artifacts**

- `packages/api-client/src/`
- calling surfaces in `apps/*-web/` that submit the nine commands
- focused tests for key stability across retries

**Acceptance**

- One user intent retried N times sends one identical key on all N attempts, proven by test.
- Blanket per-POST key generation is removed from `api-client`.
- No surface generates a fresh key per attempt for any of the nine commands.
- Surfaces that cannot yet bind a key omit the header explicitly rather than sending a throwaway value.
- A duplicate submission from the browser against a Wave B endpoint creates exactly one record.
- Existing client tests, typecheck, and builds pass.

---

### CONF-CODE-001 — Minimum lead time, naming alignment, and the clock-in vehicle check

**Priority:** P2
**Owner hint:** Codex2
**Reviewer hint:** Gemini
**Dependencies:** none
**Workstream:** contract-conformance
**Gate:** C9

**Execution prompt**

Close GAP-CONF-06 and GAP-CONF-08, and apply the audit's naming register.

GAP-CONF-06 is a real weakening, not naming drift: PRD 9.1.1 requires a minimum advance
booking time, and the implementation only checks that the pickup is in the future
(`SCHEDULED_PICKUP_MUST_BE_FUTURE`), so a booking one minute ahead passes. Implement a
configurable minimum lead time with the specified `TOO_SOON_TO_BOOK` semantics. Confirm
the threshold value with product before hardcoding one.

GAP-CONF-08: `shift-attendance.service.ts:43` writes `command.vehicleId` into the shift
without checking dispatchability, contrary to PRD 9.4.7. Add the check. Risk is bounded
because assignment enforces `VEHICLE_NOT_DISPATCHABLE` independently, so this is a
defence layer, not a live hole; do not let that reduce the quality of the check.

For the remaining four naming rows in the audit's section 5, align the specification to
the implementation rather than renaming working error codes, since the implemented names
are equal or finer-grained. Record the mapping in `phase1_service_contracts_v1.md`.

**Owned artifacts**

- `apps/api/src/modules/owned-mobility/` lead-time validation only
- `apps/api/src/modules/shift-attendance/`
- `phase1_service_contracts_v1.md` section 4.1 error table
- focused tests

**Acceptance**

- A booking inside the minimum lead time is rejected with the agreed code and the threshold is configurable.
- The threshold value is confirmed with product and recorded in the PR.
- Clock-in rejects an undispatchable vehicle without weakening the existing assignment-time check.
- Contracts section 4.1 lists the implemented error codes with the specified names mapped to them.
- No working error code was renamed purely to match older wording.
- Existing owned-mobility and shift-attendance tests stay green.

---

### CONF-STATE-001 — Resolve the two absent state models as spec or implementation

**Priority:** P2
**Owner hint:** Claude
**Reviewer hint:** Gemini2
**Dependencies:** none
**Workstream:** state-model
**Task class:** planning
**Gate:** C8

**Execution prompt**

GAP-CONF-04 and GAP-CONF-05 are model gaps whose correct resolution is a product
question that has not been asked. Ask it, then record the answer. Do not implement
before the answer exists.

GAP-CONF-04: PRD 11.2 specifies thirteen forwarded order states;
`FORWARDED_ORDER_STATUSES` has eight. `MAPPED`, `ELIGIBLE`, `NATIVE_IN_PROGRESS`,
`REJECTED`, and `EXPIRED` are absent. The operative question is whether forwarder
reconciliation needs to distinguish "external platform executing" from "external
platform completed", since contracts section 3.7 makes the external state
authoritative.

GAP-CONF-05: PRD 11.4 specifies eleven driver states; no enum exists and presence is
binary online/offline. `AVAILABLE_STANDARD`, `AVAILABLE_BUSINESS`, and
`AVAILABLE_HYBRID` do not occur anywhere. The operative questions are whether a driver
should be able to select which dispatch bucket they accept, and whether PRD 9.3.2
reservation pre-assignment needs durable `RESERVED`, `PAUSED`, and `INCIDENT_HOLD`
states rather than on-demand evaluation via `getDriverAvailability`.

If the answer is that the current model suffices, amend the PRD and say why, so the
next audit does not reopen it. If the answer is that it does not, produce a sized
execution packet.

**Owned artifacts**

- `docs/01-decisions/` or `docs/02-architecture/` decision record
- `phase1_prd_detailed_v1.md` sections 11.2 and 11.4 under controlled sync
- `docs/03-runbooks/` follow-up packet only if implementation is chosen

**Acceptance**

- Both gaps are resolved as either specification amendment or sized implementation, with recorded product rationale.
- If amended, the PRD states why the current model is sufficient in terms a future auditor can check.
- If implementation is chosen, a sized packet exists and no production code was written here.
- Contracts section 3.7 forwarder reconciliation stays consistent with the outcome.
- No state value was added to the codebase by this task.

## 6. Wave D

### CONF-VERIFY-001 — Prove idempotency under concurrency and guard against regression

**Priority:** P0
**Owner hint:** Codex
**Reviewer hint:** Claude
**Dependencies:** `CONF-IDEM-005`
**Workstream:** idempotency-acceptance
**Gates:** C4, C6

**Execution prompt**

Prove that GAP-CONF-01 is closed, and make it stay closed.

Sequential proof is insufficient. The failure mode idempotency exists to prevent is two
parallel attempts at one intent, which is exactly what a double-click and a timeout
resend produce. Every one of the nine commands must be tested with genuinely concurrent
submissions of the same key, asserting exactly one record. A test that calls the
endpoint twice in sequence does not satisfy this task.

Add a regression guard that fails when a new create-type command is added without
idempotency. Model it on the recursive discovery approach in
`tests/security/iam-route-inventory.test.ts`, which finds controllers rather than
relying on a hand-maintained list; a hardcoded list of nine will not protect the tenth
command.

If any endpoint fails, return the defect to the owning Wave B task rather than adjusting
the test to pass.

**Owned artifacts**

- `tests/integration/` or `tests/security/` concurrency suite
- `tests/security/` regression guard
- `docs/04-uat/` evidence pack

**Acceptance**

- Each of the nine commands is proven idempotent under genuinely parallel submission, creating exactly one record.
- The concurrency test fails if the database `UNIQUE` constraint is removed, demonstrating it tests the real guarantee.
- The regression guard discovers create-type commands rather than reading a fixed list.
- Adding a temporary unprotected create command makes the guard fail with file, controller, and method detail.
- Client-side key stability from `CONF-IDEM-005` is covered end to end for at least one browser surface.
- Evidence is candidate-SHA-bound and states plainly whether it is hermetic or cloud-proven.

## 7. Supervisor integration order

`CONF-AUDIT-001` is the smallest and most certain task in the wave and should merge
first; it converts a stated invariant into an enforced one in roughly one migration.

`CONF-IDEM-001` gates Wave B and should be dispatched at the same time as
`CONF-AUDIT-001`, since three workers wait on it.

`CONF-EVENT-001` and `CONF-DOC-001` are independent and may run alongside the whole
wave.

After `CONF-IDEM-001` merges, dispatch `CONF-IDEM-002/003/004` together; their file
ownership is disjoint. After all three merge, dispatch `CONF-IDEM-005`, then
`CONF-VERIFY-001`.

`CONF-CODE-001` and `CONF-STATE-001` fill idle lanes at any point.

## 8. Stop and escalation conditions

Workers stop and report to the supervisor when:

- the `CONF-IDEM-001` semantics appear wrong or unimplementable for a specific command, rather than diverging locally;
- a shared file outside owned artifacts is unavoidable;
- the production database role for `CONF-AUDIT-001` cannot be determined from available configuration;
- a required product answer for `CONF-CODE-001` lead time or `CONF-STATE-001` is unavailable;
- current `origin/dev` changed the same controller, migration, or contract files after task start;
- a concurrency test in `CONF-VERIFY-001` exposes a duplicate-write path broader than the nine listed commands.
