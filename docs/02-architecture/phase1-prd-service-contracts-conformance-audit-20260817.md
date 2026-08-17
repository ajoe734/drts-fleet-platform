# Phase 1 PRD / Service Contracts Implementation Conformance Audit (2026-08-17)

**Status:** audited against current code; three implementation GAPs and one architecture decision open
**Baseline:** `origin/dev@f068135e0` (verification executed at `831048db4`; the two intervening commits touch only `tools/development-orchestrator/` and do not reach `apps/`, `packages/`, or `infra/`)
**Scope:** line-by-line conformance of `phase1_prd_detailed_v1.md` (1863 lines) and `phase1_service_contracts_v1.md` (1346 lines) against the implemented API, contracts package, and database schema
**Execution plan:** `docs/03-runbooks/phase1-contract-conformance-execution-tasks-20260817.md`
**Registration:** `tools/task-dispatch/dispatch-phase1-contract-conformance-20260817.py`

---

## 1. Executive conclusion

The Phase 1 product surface is substantially conformant. State machines, regulatory
master data, disclosure, filing output, and the safety invariants in PRD section 14.2
are implemented and enforced. This audit does not find a broad implementation
shortfall.

It finds four distinct problems, only one of which is a coding defect in the
ordinary sense:

1. **The idempotency contract (contracts section 2.4) is not implemented, and the
   client SDK creates a false impression that it is.** Nine create-type commands are
   required to accept `Idempotency-Key`. None of them read it. `packages/api-client`
   auto-injects the header on every POST, so the calling side looks protected while
   the server discards it. This is the only GAP in this audit that can write
   incorrect business data, including duplicate orders and duplicate reimbursement
   batches.

2. **The domain event contract (contracts section 5.2) has no implementation
   layer at all.** Approximately 40 topics are specified; there is no event bus, no
   outbox table, and 26 of the topics do not appear anywhere in the codebase. This
   is not neglected work. The contract was written for thirteen independently
   deployed services; Order, Dispatch, and Driver Task were subsequently implemented
   as one module in one process, where direct calls are the correct mechanism. The
   document and the architecture disagree, and that disagreement needs a decision
   rather than incremental code.

3. **The audit-log immutability invariant is enforced by convention, not by the
   database.** PRD sections 13.3 and 14.2.7 require that audit records cannot be
   edited or deleted. `admin.audit_logs` has no `REVOKE`, no constraint, and no
   trigger. The only thing preventing mutation is that the repository class exposes
   no update or delete method.

4. **Two state models specified in the PRD do not exist in the implementation**
   (forwarded order lifecycle is 8 of 13 states; driver status has no enum at all).
   Whether these are defects or over-specification is a product question that has
   not been asked.

Everything else that differs is naming drift with equivalent behaviour, or scope
that was deferred by an existing recorded decision.

---

## 2. Audit method and evidence

Verification was performed against the working tree, not against task-board claims
or prior evidence packs. Each finding below cites the file and line that produced it.

| Evidence                        | Result                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Git baseline                    | `831048db4`, confirmed unchanged for `apps/`, `packages/`, `infra/` at `f068135e0`                                      |
| PRD sections read               | 1-18 in full (1863 lines)                                                                                               |
| Service contracts sections read | 1-10 in full (1346 lines)                                                                                               |
| Controllers discovered          | 56 `*.controller.ts` under `apps/api/src`                                                                               |
| HTTP route handlers             | 674 decorator occurrences                                                                                               |
| Event topic probe               | each of the ~40 topics in contracts section 5.2 grepped individually across `apps/api/src` and `packages/contracts/src` |
| State enum probe                | `infra/migrations/V0002__enum_types.sql` plus contract unions in `packages/contracts/src/index.ts`                      |
| Idempotency probe               | `Idempotency-Key` header readers enumerated across all controllers                                                      |
| Safety invariant probe          | PRD 14.2 items 1-7 traced to enforcement sites                                                                          |

**Not covered by this audit.** Contracts section 2.2 (UTC storage and RFC3339
formatting across every field), PRD section 13.1 (availability) and 13.5 (retention
durations) require runtime or configuration verification. PRD sections 9.5 and 9.6
were verified to module and endpoint level, not field-by-field against DDL.

---

## 3. What already conforms

These were checked and found correct. They are recorded so that a future audit does
not re-open them without cause.

### 3.1 State machines

| Spec                                  | Implementation                                 | Result                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD 11.1 owned order, 17 states       | `ops.order_status_t` (`V0002:216`)             | **17/17 verbatim**, including `preassigned`, `no_show`, `redispatch_required`, `exception_hold`                                                                                                                                                                                                                                    |
| PRD 11.3 dispatch execution, 9 states | `ops.dispatch_job_status_t` (`V0002:234`)      | complete; `OFFERED / RESERVED / QUEUED` split into three discrete values                                                                                                                                                                                                                                                           |
| PRD 11.5 complaint case, 9 states     | `crm.case_status_t` (`V0002:325`), 8 values    | conformant. The ninth, `SLA_BREACH`, is implemented as a flag (`markComplaintSlaBreach`), which is what **contracts section 3.10 requires** ("SLA breach only adds a marker, it does not overwrite the main state"). The PRD listing it as a state contradicts the contracts document; the implementation follows the correct one. |
| PRD 11.6 vehicle onboarding, 9 states | `reg.review_status_t` + `reg.vehicle_status_t` | covered as two axes; union contains all nine plus `rejected` and `maintenance`                                                                                                                                                                                                                                                     |

### 3.2 PRD 14.2 — errors that must not occur

| #   | Invariant                                                    | Enforcement site                                                                                                                                                                            |                Result                 |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------------------------------: |
| 1   | forwarded order written as owned assignment                  | `ForwardedOrderStatus` and `DriverTaskStatus` are disjoint type unions                                                                                                                      |                 PASS                  |
| 2   | phone order without recording cannot be traced               | callcenter recording index plus `recording_missing` marker                                                                                                                                  |                 PASS                  |
| 3   | vehicle with lapsed contract or insurance still dispatchable | `owned-mobility.service.ts:6871` raises `VEHICLE_NOT_DISPATCHABLE`                                                                                                                          |                 PASS                  |
| 4   | suspended driver still able to go online                     | `jwt-auth.service.ts:968` calls `assertDriverAuthEligible` on **every** token verification, raising `DRIVER_AUTH_SUSPENDED` / `DRIVER_CERT_INVALID` (`regulatory-registry.service.ts:1971`) | PASS — see 4.4 for the ownership note |
| 5   | complaint and incident share one lifecycle                   | separate modules, separate state machines                                                                                                                                                   |                 PASS                  |
| 6   | historical pricing version overwritten in place              | `billing-settlement.service.ts:1603` — "Published driver fee plan versions are immutable."                                                                                                  |                 PASS                  |
| 7   | audit log can be modified or deleted                         | application-level only                                                                                                                                                                      |          **See GAP-CONF-03**          |

### 3.3 Contracts and product surfaces

- **Contracts 5.1 event envelope**: `DomainEventEnvelope` (`packages/contracts/src/index.ts:757`) matches all ten specified fields verbatim.
- **Contracts 2.1 canonical IDs**: 17 of 18 present as contract types. `call_point_id` exists in the database (`V0003:60`) and is referenced by `tenant-partner.controller.ts`, but has no type in `packages/contracts`.
- **PRD 9.9 public disclosure**: `public-info` create/publish/delete and `placards` create/publish implemented in `platform-admin.controller.ts:47-125`.
- **PRD 9.10.2 filing package**: `filing-packages/generate`, list, and detail implemented; manifest carries `manifestHash`, `checksum`, and `immutable: true`.
- **Contracts 9 Phase 2 reserved contracts**: `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` exists and is additive, satisfying "extension event and extension field only".

---

## 4. Open GAPs

### GAP-CONF-01 — idempotency contract not implemented, and falsely signalled by the client

**Severity:** P0
**Spec:** contracts section 2.4; error contract `DUPLICATE_IDEMPOTENCY_KEY` in section 4.1

**Current behaviour.** The specification names nine create-type commands that must
support `Idempotency-Key`. Enumerating every controller that reads the header finds
exactly three, and none of them is on the list:

| Endpoint reading `Idempotency-Key`                                | On the specified list? |
| ----------------------------------------------------------------- | :--------------------: |
| `certificate-support.controller.ts:85` — certificate regeneration |           no           |
| `fare-anomaly.controller.ts:64` — fare quote recovery             |           no           |
| `billing-settlement.controller.ts:76` — payment recovery          |           no           |

The nine specified commands — create passenger order, create tenant booking, create
call-center order, create complaint case, create report job, generate filing package,
driver payout request, webhook test delivery, and dispatch assign/redispatch — resolve
to controllers in `owned-mobility`, `callcenter`, `complaint`, `reporting-filing`,
`billing-settlement`, and `tenant-partner`. None of those controllers declares the
header. Partial coverage exists only in the referral booking path, which reads a body
field `idempotencyKey` (`owned-mobility.service.ts:10132`).

**Why this is worse than a plain omission.** `packages/api-client/src/index.ts:661-666`
injects the header into every POST:

```ts
if (method.toUpperCase() === "POST" && !hasHeader(headers, "idempotency-key")) {
  headers["Idempotency-Key"] = createRequestToken();
}
```

Three consequences follow. The server discards it, so the protection does not exist.
The failure is silent — no error, no log, no metric distinguishes "header honoured"
from "header ignored", so review of the calling side cannot detect the problem.
And `createRequestToken()` returns `crypto.randomUUID()` on every call
(`packages/api-client/src/index.ts:505`), which means the key **changes on each
retry**. Even a correct server implementation would be defeated by this client,
because two attempts at the same user intent carry two different keys.

**Impact.** Duplicate passenger orders and tenant bookings dispatched as separate
trips and charged separately; duplicate driver payout and reimbursement batches, which
move money and have no automated recovery; duplicate dispatch assignment; duplicate
`case_no` for one complaint with independent SLA timers; duplicate filing packages
whose manifest hashes disagree.

**Minimum closure.** Four enforcement layers on each of the nine commands, plus the
client. The database `UNIQUE` constraint is not optional: a service-layer
"look up, then insert" check fails under exactly the concurrency that retries
produce, because two parallel attempts both observe an absent key before either
writes. The repository already contains a correct four-layer reference implementation
(see section 6).

---

### GAP-CONF-02 — domain event contract has no implementation layer

**Severity:** P0 for decision; implementation severity depends on the decision
**Spec:** contracts section 5.2 (~40 topics) and section 6 (five compensation designs)

**Current behaviour.** There is no event bus, no outbox table, and no publish/subscribe
mechanism. `DomainEventEnvelope` is inherited by exactly two types, both of which are
WebSocket stream payloads rather than domain events:
`DriverTaskStreamEventEnvelope` and `OpsDispatchStreamEventEnvelope`.

Grepping each specified topic individually, **26 do not appear anywhere in the
codebase**:

`order.classified`, `order.redispatch_requested`, `dispatch.requested`,
`dispatch.eta.calculated`, `dispatch.redispatched`, `driver.task.accepted`,
`driver.task.rejected`, `driver.departed`, `proof.submitted`,
`call.recording.ready`, `call.linked_to_order`, `call.linked_to_case`,
`complaint.case.created`, `complaint.case.assigned`, `complaint.case.sla_breached`,
`complaint.case.closed`, `receipt.issued`, `tenant.invoice.generated`,
`driver.statement.generated`, `driver.reimbursement.approved`, `vehicle.activated`,
`insurance.expiring`, `certificate.expiring`, `vehicle.exclusivity.approved`,
`report.job.completed`, `filing.package.generated`

What exists instead are three mechanisms that are not the section 5.2 contract:

| Mechanism          | Topics                                                                                                            | Audience            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------- |
| Tenant webhook     | `booking.created`, `booking.updated`, `dispatch.assigned`, `invoice.issued` (`tenant-partner.service.ts:526-530`) | tenant systems      |
| Dispatch trace log | `dispatch.assigned` used as a trace label (`owned-mobility.service.ts:7138`)                                      | audit and regulator |
| Audit log          | per-module action names                                                                                           | audit               |

Note that the webhook catalogue publishes `invoice.issued`, which the specification
does not contain, and omits `tenant.invoice.generated`, which it does.

**Why this is a decision and not a defect.** The value of domain events is decoupling:
the publisher does not know who listens. Contracts section 7.1 assigns
`owned order / booking`, `dispatch_job / attempt / assignment`, and driver task state
to three separate write authorities. In the implementation all three live inside
`owned-mobility.service.ts` — **10,884 lines** in a single process, with no separate
dispatch module. Between collaborators in one process, a direct typed call inside one
database transaction is simpler, safer, and more traceable than publishing an event
and consuming it. Section 5.2 describes the correct contract for an architecture that
was not built.

Section 6's five compensation designs (order created but dispatch request failed,
call ended without recording index, assignment not received by the driver app,
resolved complaint with failed reimbursement posting, forwarder sync failure) are all
expressed in terms of events and compensation queues, and therefore inherit this GAP.

**Minimum closure.** A recorded decision between:

- **(a) Ratify the monolith.** Annotate section 5.2 as a target contract that is not
  implemented in Phase 1, document the three mechanisms above as the actual Phase 1
  contract, align the `invoice.issued` naming, and rewrite section 6 in terms of
  synchronous calls and retries. Cost: one document revision.
- **(b) Introduce a transactional outbox.** Event rows written inside the business
  transaction, delivered by a background worker, with consumer-side idempotency,
  ordering, retry, dead-letter handling, and monitoring. Cost: a full wave.

**Explicitly rejected: partial implementation.** Adding a subset of topics produces a
system in which no consumer can assume completeness, which removes the reason to have
events at all, and — worse — misleads the next engineer into treating an incomplete
feed as a reconciliation source. Either the event contract is complete or it is
explicitly absent.

---

### GAP-CONF-03 — audit-log immutability is convention, not enforcement

**Severity:** P1
**Spec:** PRD 13.3 ("audit cannot be edited or deleted"); PRD 14.2.7 lists mutable audit as a product error that must not occur; contracts section 3.13 ("audit log append-only")

**Current behaviour.** `admin.audit_logs` (`V0009:75`) carries no `REVOKE`, no
immutability constraint, and no trigger. The `BEFORE UPDATE` triggers in
`V0010__views_triggers_and_guardrails.sql` are `updated_at` touch triggers on other
tables, not immutability guards. The invariant holds solely because
`audit-log.repository.ts` exposes only `append()`, `loadRecent()`, and
`loadEvidenceGovernanceTrail()`, with no update or delete method.

**Why convention is insufficient here specifically.** The threat model for an audit
log is an authorised insider concealing their own actions after the fact. The people
capable of adding a second write path, running direct SQL, mutating rows from a
migration script, or connecting to the database as an operator are precisely the
population that model addresses. A guarantee implemented as a code convention does
not constrain those with the ability to change code.

**Environment note that changes the fix.** `operations/database/db-common.sh:9`
defaults the connection role to `postgres`. Table owners and superusers are not
bound by `REVOKE`, so a `REVOKE`-only fix may be inert. The production role behind
`DATABASE_URL` must be confirmed before choosing. A `BEFORE UPDATE OR DELETE` trigger
raising an exception binds the owner as well and is therefore the reliable primary
control.

**Minimum closure.** A trigger as the primary control, `REVOKE` as defence in depth
once the production role is confirmed, and an explicit privileged archival path so
that any lawful retention deletion is a deliberate, recorded, privileged operation
rather than something any code path can perform incidentally.

---

### GAP-CONF-04 — forwarded order lifecycle is missing five states

**Severity:** P2, pending product confirmation
**Spec:** PRD 11.2, thirteen states

`FORWARDED_ORDER_STATUSES` (`packages/contracts/src/index.ts:5797-5806`) contains
eight: `received`, `broadcasted`, `accept_pending`, `confirmed_by_platform`,
`completed_synced`, `lost_race`, `cancelled_by_platform`, `sync_failed`.

Absent: **`MAPPED`, `ELIGIBLE`, `NATIVE_IN_PROGRESS`, `REJECTED`, `EXPIRED`**.
`SYNC_ERROR` is renamed `sync_failed`.

**Impact.** Steps 2 and 3 of the PRD 10.3 forwarder flow (mapping, eligibility
filtering) have no observable state. The absence of `NATIVE_IN_PROGRESS` means the
mirror cannot distinguish "the external platform is executing" from "the external
platform has completed", which is in tension with contracts section 3.7, where the
external platform state is authoritative and must be reconciled.

---

### GAP-CONF-05 — driver status model does not exist

**Severity:** P2, pending product confirmation
**Spec:** PRD 11.4, eleven states

There is no corresponding enum. `PlatformPresenceStatus` is
`"online" | "offline"`. `AVAILABLE_STANDARD`, `AVAILABLE_BUSINESS`, and
`AVAILABLE_HYBRID` do not occur anywhere in `apps/` or `packages/`.

The substitute is `getDriverAvailability(driverId, serviceBucket)`
(`regulatory-registry.service.ts:1963`), which computes eligibility per service
bucket on demand. This covers the authorisation question ("may this driver take this
bucket") but not the product model:

- the driver has no selectable dispatch mode; PRD 9.4.7 online/offline is binary
- `RESERVED`, `PAUSED`, and `INCIDENT_HOLD` have no durable state, so the
  lock-vehicle / lock-driver semantics of PRD 9.3.2 reservation pre-assignment have
  no representation

---

### GAP-CONF-06 — minimum lead-time rule is weaker than specified

**Severity:** P2
**Spec:** PRD 9.1.1 product rule ("minimum advance booking time must be satisfied"); contracts section 4.1 error `TOO_SOON_TO_BOOK`

The implemented check is `SCHEDULED_PICKUP_MUST_BE_FUTURE`, which validates only that
the pickup time is in the future. A booking one minute ahead passes. This is a genuine
weakening of a product rule, not naming drift, and is grouped with the naming register
below only because the remedy touches the same files.

---

### GAP-CONF-07 — service boundary: three write authorities in one module

**Severity:** P2, informational; subsumed by the GAP-CONF-02 decision
**Spec:** contracts section 3.5, 3.6, 3.8 and the section 7.1 write-authority matrix

Contracts section 7.1 assigns `owned order / booking` to the Order Service,
`dispatch_job / attempt / assignment` to the Dispatch Service, and driver task state
to the Driver Task Service, with the rule that "services write only through APIs and
events". All three are implemented inside `owned-mobility` (service file 10,884
lines, 46 controller routes); no separate dispatch module exists. Driver Task is
additionally spread across `driver-settings`, `shift-attendance`, `driver-profile`,
and `driver-sos`.

Service-to-module mapping for the thirteen specified services:

| Contract service          | Implementation                                            | Conformant |
| ------------------------- | --------------------------------------------------------- | :--------: |
| 3.1 Identity              | `identity` + `auth` + `common/auth`                       |    yes     |
| 3.2 Tenant & Partner      | `tenant-partner`                                          |    yes     |
| 3.3 Regulatory Registry   | `regulatory-registry`                                     |    yes     |
| 3.4 Product & Rule        | `product-rule` + `service-product`                        |    yes     |
| 3.5 Order                 | `owned-mobility`                                          |   merged   |
| 3.6 Dispatch              | `owned-mobility` (no separate module)                     |   merged   |
| 3.7 Forwarder             | `forwarder`                                               |    yes     |
| 3.8 Driver Task           | `owned-mobility` + 4 driver modules                       |   split    |
| 3.9 Callcenter            | `callcenter`                                              |    yes     |
| 3.10 Complaint            | `complaint`                                               |    yes     |
| 3.11 Billing & Settlement | `billing-settlement`                                      |    yes     |
| 3.12 Reporting & Filing   | `reporting-filing` + `reporting` + `regulatory-reporting` |    yes     |
| 3.13 Audit & Notification | `audit-notification`                                      |    yes     |

This GAP should not be closed by refactoring. It is recorded so that the
GAP-CONF-02 decision is made with the actual architecture in view.

---

### GAP-CONF-08 — clock-in does not validate vehicle availability

**Severity:** P3
**Spec:** PRD 9.4.7 product rule ("must not go online when the vehicle is unavailable")

`shift-attendance.service.ts:43` checks only for an existing active shift, then writes
`command.vehicleId` into the shift record without verifying that the vehicle is
dispatchable. Risk is bounded because assignment independently enforces
`VEHICLE_NOT_DISPATCHABLE` (section 3.2 item 3), so this is a missing defence layer
rather than a live hole.

Related ownership note: contracts section 3.8 states that the Driver Task Service
must reject clock-in for a suspended driver. That invariant holds, but it is enforced
at the JWT verification layer rather than by the named service. Single-point
enforcement of a safety invariant is worth recording even when the invariant is
currently satisfied.

---

## 5. Naming drift register

Behaviour is equivalent; only identifiers differ. Recorded so the specification can be
aligned in one pass rather than debated per endpoint.

| Contracts 4.1                            | Implementation                                                         | Note                                  |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| `ADDRESS_UNRESOLVED`                     | `ADDRESS_UNRESOLVABLE`                                                 | equivalent                            |
| `AREA_NOT_SERVICEABLE`                   | `SERVICE_AREA_NOT_SERVICEABLE`, plus `PICKUP_*` / `DROPOFF_*` variants | equivalent, finer                     |
| `AUTH_FORBIDDEN`                         | `AUTH_SCOPE_DENIED` / `AUTH_REALM_DENIED`                              | equivalent, finer                     |
| `DUPLICATE_IDEMPOTENCY_KEY`              | `IDEMPOTENCY_KEY_REUSED`                                               | equivalent                            |
| `TOO_SOON_TO_BOOK`                       | `TOO_SOON_TO_BOOK` (configurable lead time)                            | resolved under `CONF-CODE-001` (GAP-CONF-06) |
| contracts 5.2 `tenant.invoice.generated` | webhook `invoice.issued`                                               | resolve with the GAP-CONF-02 decision |
| contracts 2.1 `call_point_id`            | database column only, no contract type                                 | `packages/contracts` not synchronised |

---

## 6. Reference implementation already in the repository

GAP-CONF-01 does not require a new pattern. Four correct examples exist:

| Layer                                                | Reference                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Migration, composite uniqueness                      | `V0063__multi_taxi_payment_recovery_commands.sql:22` — `UNIQUE (payment_id, action, idempotency_key)` |
| Migration, partial unique index on an existing table | `V0062__multi_taxi_electronic_certificate_writer.sql:36-37`                                           |
| Repository, unique violation to domain error         | `certificate-support.repository.ts:285-302` raising `IDEMPOTENCY_KEY_REUSED`                          |
| Service, key presence and length validation          | `billing-settlement.service.ts:662-676`                                                               |
| Controller, header binding                           | `billing-settlement.controller.ts:76`                                                                 |

Note that `V0063` scopes uniqueness to `(payment_id, action, idempotency_key)` rather
than the key alone. That is correct: idempotency scope should be bounded to one object
and one operation, so that keys colliding across tenants cannot interfere. Order
creation should therefore be scoped `(tenant_id, idempotency_key)`.

**One semantic question must be settled before schema work.** The specified error code
`DUPLICATE_IDEMPOTENCY_KEY` implies returning an error, whereas conventional
idempotency semantics return the original successful response. Returning `409` on a
routine retry forces every caller to write compensating logic. The recommendation is:
same key with the same payload replays the stored response; same key with a different
payload returns `409`. Storing the response is required for the first branch, which is
what the `action_receipt jsonb` column in `V0063` already does.

---

## 7. Deferred by existing decision — not GAPs

These are recorded to prevent them from being rediscovered as defects.

| Spec                                          | Status                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD 9.1.1 Passenger App / Web, 8 requirements | Deferred under `MSC-P1-001`. This is the reason **PRD 14.1 acceptance item 1** ("passengers can book from Web / App / phone") cannot be fully met: phone works, first-party Web/App does not exist. Referral Embed is a partner-scoped entry and is not a general passenger entry. |
| PRD 9.1.3 Call Point / Concierge Portal       | Retired, HTTP 404. `core.call_points` table exists; no contract type; no UI.                                                                                                                                                                                                       |
| Contracts 8.1 CTI / SIP provider              | Module present; provider externally gated (`EXT-004`)                                                                                                                                                                                                                              |
| Contracts 8.3 Payment / Invoice provider      | Externally gated (`EXT-001`)                                                                                                                                                                                                                                                       |
| Contracts 8.4 External forwarder platforms    | Adapter framework present; real Grab adapter externally gated (`EXT-002`)                                                                                                                                                                                                          |

**Status reconciliation (reconciled under CONF-DOC-001 / Gate C10, and CONF-CODE-001 / Gate C9):**

- **Q-006 and Q-008 reconciled**: `PHASE1_OPEN_QUESTIONS.md` Open Items previously listed Q-006 (passenger surface) and Q-008 (concierge workflow). Both have been moved to **Resolved Items** citing `MSC-P1-001` (`support/sidecars/MSC-P1-001/MSC-P1-001-SURFACE-DECISION-PACKET.md` and `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`).
- **Contracts section 10 decision routing**: The five contract-review questions in `phase1_service_contracts_v1.md` §10 (mapped to Q-001 through Q-005 in `PHASE1_OPEN_QUESTIONS.md`) now have explicit named owners, decision routes, and interim defaults:
  1. `call_session` to `order` cardinality (Q-001) → Owner: `Codex`, Decision Route: Callcenter & Order Service contract review / RFC.
  2. `flight_ref` retention for airport transfer (Q-002) → Owner: `Codex2`, Decision Route: Partner channel & airport transfer contract review.
  3. driver payout request-only vs wallet debit (Q-003) → Owner: `Codex`, Decision Route: Billing & Settlement architecture decision / RFC.
  4. forwarded order local `trip completed` projection (Q-004) → Owner: `Codex2`, Decision Route: Forwarder lifecycle & state machine RFC (aligned with `CONF-STATE-001` / GAP-CONF-04).
  5. report artifact storage-level object lock (Q-005) → Owner: `Gemini`, Decision Route: Regulatory storage architecture & compliance RFC.
- **`call_point_id` contract-type gap**: Recorded in `PHASE1_OPEN_QUESTIONS.md` under Contract & Schema Synchronisation Backlog, owned by `CONF-CODE-001` / `packages/contracts` sync backlog.
- **GAP-CONF-06, GAP-CONF-08 & Section 4.1 Error Register resolved (Gate C9 / CONF-CODE-001)**:
  1. **Minimum lead time (GAP-CONF-06)**: Configurable minimum lead time (default 15 minutes, configurable via `SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES` / `setMinLeadTimeMinutes`) enforced in `OwnedMobilityService.createMultiTaxiRide` with error code `TOO_SOON_TO_BOOK`.
  2. **Clock-in vehicle check (GAP-CONF-08)**: `ShiftAttendanceService.clockIn` now verifies vehicle dispatchability via `RegulatoryRegistryService.getVehicleDispatchability(vehicleId)`, rejecting undispatchable vehicles with `VEHICLE_NOT_DISPATCHABLE` while keeping the assignment-time check unweakened.
  3. **Section 4.1 Naming Register**: Updated `phase1_service_contracts_v1.md` §4.1 to document implemented error codes (`ADDRESS_UNRESOLVABLE`, `SERVICE_AREA_NOT_SERVICEABLE`, `TOO_SOON_TO_BOOK`, `AUTH_SCOPE_DENIED` / `AUTH_REALM_DENIED`, `IDEMPOTENCY_KEY_REUSED`) mapped from specified names.


---

## 8. Completion gates

| Gate    | Requirement                                                                                                                                                                             | Owning task             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **C1**  | `admin.audit_logs` rejects `UPDATE` and `DELETE` at the database level, proven by a negative test that attempts both                                                                    | `CONF-AUDIT-001`        |
| **C2**  | Idempotency semantics (replay versus conflict) are decided and recorded before any schema change                                                                                        | `CONF-IDEM-001`         |
| **C3**  | All nine specified commands reject a missing key, replay the stored response for a repeated key with an identical payload, and return `409` for a repeated key with a differing payload | `CONF-IDEM-002/003/004` |
| **C4**  | Concurrent duplicate submission of one key creates exactly one record, proven under parallel execution rather than sequential calls                                                     | `CONF-VERIFY-001`       |
| **C5**  | The client SDK binds one key per user intent across retries, and no longer injects a fresh key per POST                                                                                 | `CONF-IDEM-005`         |
| **C6**  | A regression guard fails when a new create-type command is added without idempotency                                                                                                    | `CONF-VERIFY-001`       |
| **C7**  | The event-contract decision is recorded, and contracts section 5.2 plus section 6 are consistent with the chosen option                                                                 | `CONF-EVENT-001`        |
| **C8**  | GAP-CONF-04 and GAP-CONF-05 are resolved as either a specification amendment or an implementation task, with the product rationale recorded                                             | `CONF-STATE-001`        |
| **C9**  | Minimum lead time is enforced, and the naming register in section 5 is applied to the specification                                                                                     | `CONF-CODE-001`         |
| **C10** | Q-006 and Q-008 are moved out of Open Items; contracts section 10's five questions have owners                                                                                          | `CONF-DOC-001`          |

---

## 9. Traceability

| GAP                                | Severity | Nature                         | Task                         |
| ---------------------------------- | :------: | ------------------------------ | ---------------------------- |
| GAP-CONF-01 idempotency            |    P0    | writes incorrect data          | `CONF-IDEM-001` .. `005`     |
| GAP-CONF-02 domain events          |    P0    | architecture decision          | `CONF-EVENT-001`             |
| GAP-CONF-03 audit immutability     |    P1    | unenforced invariant           | `CONF-AUDIT-001`             |
| GAP-CONF-04 forwarded states       |    P2    | model gap, needs product input | `CONF-STATE-001`             |
| GAP-CONF-05 driver states          |    P2    | model gap, needs product input | `CONF-STATE-001`             |
| GAP-CONF-06 lead time              |    P2    | weakened product rule          | `CONF-CODE-001`              |
| GAP-CONF-07 service boundary       |    P2    | informational                  | folded into `CONF-EVENT-001` |
| GAP-CONF-08 clock-in vehicle check |    P3    | missing defence layer          | `CONF-CODE-001`              |
