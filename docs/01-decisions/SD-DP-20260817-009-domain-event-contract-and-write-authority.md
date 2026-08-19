# SD-DP-20260817-009 Domain Event Contract Ratified As Unimplemented; Write Authority Matrix Aligned To Actual Modules

## Decision Record

- `decision_id`: `SD-DP-20260817-009`
- `title`: `Phase 1 keeps synchronous in-process calls instead of an event bus; contracts section 5.2 is annotated as an unimplemented target contract, and section 7.1's write-authority matrix is rewritten to the actual code module boundaries`
- `owner`: `Claude / CONF-EVENT-001`
- `date`: `2026-08-17`
- `status`: `accepted`
- `approval`:
  - accepted by the repository owner on 2026-08-19, in answer to
    `docs/01-decisions/l1-amendment-acceptance-request-20260817.md`. This satisfies the
    human/system-design precondition `SD-DP-20260422-003` sets for a packet to supersede L1 wording
- `accepted_scope_note`:
  - Phase 1 commits to no event bus. Contracts section 5.2 is a target contract for a future
    service split, not a description of Phase 1 runtime behaviour
  - the reversal trigger stands: physically separating Order, Dispatch, or Driver Task into
    independently deployed services is what reopens the transactional-outbox option, sized as its
    own wave. A partial implementation of the topic list remains rejected
- `affected_docs`:
  - `phase1_service_contracts_v1.md` sections `5.2`, `6`, `7.1`
- `superseding_decision`:
  - contracts section 5.2's ~40 domain event topics are not Phase 1's live contract; they describe
    the correct design for an architecture — thirteen independently deployed services — that was
    not built
  - Phase 1's actual asynchronous/notification contract is three narrower mechanisms: the tenant
    webhook catalogue, the dispatch trace log, and the audit log, all documented in section 5.2 with
    their real topic names
  - contracts section 7.1's three-way write-authority split (Order Service / Dispatch Service /
    Driver Task Service) is replaced with the actual module ownership: the `owned-mobility` module
    is the write authority for owned order/booking, `dispatch_job`/`attempt`/`assignment`, and the
    core driver-task state machine; driver task is additionally split across `driver-settings`,
    `shift-attendance`, `driver-profile`, and `driver-sos` for their respective concerns
  - the `invoice.issued` / `tenant.invoice.generated` naming conflict is resolved to
    `invoice.issued`, matching the implemented webhook; the target-contract list is updated to the
    same name so a future outbox implementation would not need to invent a second name
- `scope`:
  - `phase1_service_contracts_v1.md` sections `5.2`, `6`, `7.1`
  - `GAP-CONF-02` and `GAP-CONF-07` in
    `docs/02-architecture/phase1-prd-service-contracts-conformance-audit-20260817.md`
- `out_of_scope`:
  - adding, renaming, or implementing any event topic in code
  - refactoring `owned-mobility.service.ts` into separate modules or processes
  - the idempotency replay/conflict semantics (owned by `CONF-IDEM-001`)
  - `GAP-CONF-04` / `GAP-CONF-05` state-model gaps (owned by `CONF-STATE-001`)
  - the per-service `發布事件` lists inside contracts sections 3.5, 3.6, 3.8, etc.; those describe
    the same unimplemented target and are covered by the status note added to 5.2, but are not
    individually rewritten by this decision
- `implementation_implications`:
  - no production code changes; this is a documentation and contract-truth change only
  - if a future wave physically splits Order, Dispatch, or Driver Task into separately deployed
    services, that split is the trigger to revisit this decision and design the transactional
    outbox described as Option 2 below — not before, and not partially
  - any Phase 1 integration that currently expects one of the 26 unimplemented topics must be
    re-pointed to one of the three documented mechanisms, or escalated as a new product requirement
    through `PHASE1_OPEN_QUESTIONS.md`
- `completion_bar`:
  - `phase1_service_contracts_v1.md` section 5.2 states plainly, at the top, that the topic list is
    a target contract not implemented in Phase 1
  - section 5.2 documents the three real mechanisms with their real topic names and audiences
  - the `invoice.issued` / `tenant.invoice.generated` naming conflict is resolved in one direction
    across the document
  - section 6 is rewritten so no compensation design implies an event consumer or a message queue
    that does not exist
  - section 7.1's write-authority matrix names the actual owning module for every entity, with the
    contract's original service name kept as an annotation where it differs

## Problem

`docs/02-architecture/phase1-prd-service-contracts-conformance-audit-20260817.md` (`GAP-CONF-02`,
`GAP-CONF-07`) found that contracts section 5.2 specifies roughly 40 domain event topics and no
implementation layer exists for them: no event bus, no outbox table, no publish/subscribe
mechanism. `DomainEventEnvelope` (section 5.1) is inherited by exactly two types, both WebSocket
stream payloads (`DriverTaskStreamEventEnvelope`, `OpsDispatchStreamEventEnvelope`), not domain
events. Grepping each of the ~40 topics individually finds 26 with zero occurrences anywhere in
`apps/` or `packages/`.

What exists instead are three narrower mechanisms that are not the section 5.2 contract:

| Mechanism          | Real topic names                                                            | Audience            | Implementation                      |
| ------------------ | --------------------------------------------------------------------------- | ------------------- | ----------------------------------- |
| Tenant webhook     | `booking.created`, `booking.updated`, `dispatch.assigned`, `invoice.issued` | tenant systems      | `tenant-partner.service.ts:526-530` |
| Dispatch trace log | `dispatch.assigned` (a trace label, not a published topic)                  | audit and regulator | `owned-mobility.service.ts:7138`    |
| Audit log          | per-module action names                                                     | audit               | `audit-notification` module         |

Section 7.1's write-authority matrix assigns `owned order / booking` to an Order Service,
`dispatch_job / attempt / assignment` to a Dispatch Service, and driver task state to a Driver Task
Service, with the rule that "services write only through APIs and events." All three live inside
`owned-mobility.service.ts` — one file, 10,884 lines, 46 controller routes, one process. No separate
dispatch module exists. Driver Task is additionally spread across `driver-settings`,
`shift-attendance`, `driver-profile`, and `driver-sos`.

The two findings are one decision. The reason section 5.2 has no implementation is that its
publisher and its would-be subscribers are the same collaborators inside one process — exactly the
collaborators section 7.1 wrongly models as three separately deployed services. A decision that
rewrites 5.2 without rewriting 7.1 would leave the contract internally inconsistent: it would still
describe three services that write only through APIs and events, while declaring that no event
mechanism exists between them.

Section 6's five compensation designs (order created but dispatch failed, call ended without
recording index, assignment not received by the driver app, resolved complaint with failed
reimbursement posting, forwarder sync failure) are written in terms of events and compensation
queues, and therefore inherit the same gap.

## Options considered

1. **Ratify the monolith.** Annotate section 5.2 as a target contract not implemented in Phase 1,
   promote the three actual mechanisms into the contract as Phase 1 truth, align the
   `invoice.issued` naming, rewrite section 6 in terms of synchronous calls and retries, and rewrite
   section 7.1 to the actual module boundaries. **(chosen)**
2. **Introduce a transactional outbox.** Specify the outbox table, delivery worker,
   consumer-side idempotency, ordering guarantees, retry and dead-letter handling, and monitoring
   for all ~40 topics, and size the follow-up execution packet.
3. **Implement a subset of the ~40 topics**, covering only the currently-needed ones.
   **Explicitly rejected** — the audit and the execution task both name this the wrong outcome
   before any decision is made: a partial feed means no consumer can assume completeness, which
   removes the reason to have events at all, and misleads the next engineer into treating an
   incomplete feed as a reconciliation source.

## Rationale for option 1

- **Cost asymmetry with no offsetting need.** Option 1 is a document revision. Option 2 is a full
  wave: an outbox table, a delivery worker, consumer-side idempotency, ordering, retry, dead-letter
  handling, and monitoring, for topics that currently have zero consumers. 26 of the ~40 specified
  topics do not exist anywhere in the codebase today, and nothing in the current product surface is
  blocked on their absence — the audit found no functional gap traceable to the missing event bus,
  only a documentation/architecture mismatch.
- **The value an event bus buys — decoupling of publisher from subscriber — does not apply between
  collaborators sharing one process and one transaction.** Order, Dispatch, and Driver Task are not
  three deployables that need to evolve and scale independently today; they are three write
  authorities inside one module. A direct typed call inside one database transaction is simpler,
  safer (no dual-write problem between the business write and the event write), and more traceable
  (a stack trace beats a correlation ID) than publishing and consuming an event between two pieces
  of the same process.
- **Consistent with the direction two pre-consensus inputs recommended, though never ratified.**
  `docs/02-architecture/consensus/phase1/starter-draft.md:35` proposes keeping "a modular monolith in
  `apps/api` for Phase 1 execution, but align modules, migrations, and tasks to service-contract
  ownership boundaries", and `codex-readout.md:42` reaches the same conclusion from the migration
  plan. Both are Provisional Design Inputs under `CANONICAL_DOCUMENT_MAP.md` section 3 -- inputs to
  consensus, not consensus itself. The accepted consensus packet takes **no position on deployment
  topology**. Accepting this decision therefore establishes that position for the first time; it does
  not apply an existing one. That is a reason for a human to accept it deliberately, not a reason
  against it, but it must not be presented as routine.
- **The failure mode an event bus would prevent here is already owned by a parallel decision.**
  Duplicate writes from retries are the concern `GAP-CONF-01` addresses through idempotency keys and
  a database `UNIQUE` constraint (`CONF-IDEM-001`), not through event deduplication. An outbox does
  not replace that work; it would be a second, larger mechanism solving a problem the idempotency
  wave already solves for the write side.
- **Reversible, and the reversal trigger is explicit.** This decision does not foreclose Option 2.
  It states the trigger precisely: if a future wave physically separates Order, Dispatch, or Driver
  Task into independently deployed services, that separation is what makes an event bus earn its
  cost, and is the point to design the outbox — sized honestly as its own wave, per the execution
  task's instruction, not retrofitted piecemeal onto the monolith beforehand.
- **Option 3 is foreclosed by the audit's own reasoning, independent of which of the other two is
  chosen.** A subset of topics is worse than either extreme: it costs implementation effort while
  producing a feed no consumer can trust as complete.

## What changes in `phase1_service_contracts_v1.md`

- **Section 5.2** gains a status note at the top marking the ~40-topic list as a target contract,
  not implemented in Phase 1, citing this decision and `GAP-CONF-02`. The list itself is kept
  verbatim except for the Billing Domain entry, renamed from `tenant.invoice.generated` to
  `invoice.issued` to match the implemented name (see naming resolution below). A new subsection,
  "Phase 1 Implemented Mechanisms," documents the three real mechanisms from the Problem section
  above as the actual, live Phase 1 contract.
- **Section 6** is rewritten so each of the five compensation designs describes a synchronous call,
  a database status column, or a scheduled reconciliation job — never a published event or a
  consumed queue message, since neither exists.
- **Section 7.1** 's write-authority matrix is rewritten to name the actual owning module for every
  entity (`owned-mobility`, `forwarder`, `callcenter`, `complaint`, `billing-settlement`,
  `reporting-filing` module group, `audit-notification`, `tenant-partner`, `regulatory-registry`),
  annotated with the original contract service name where it differs, per the `GAP-CONF-07` mapping
  in the audit's section 4. The "關鍵原則" subsection gains one line clarifying that the
  API/event-only write rule applies at module/process boundaries, not to collaborators sharing one
  process.

## Naming resolution: `invoice.issued` vs. `tenant.invoice.generated`

`invoice.issued` is adopted as the canonical Phase 1 name in both the implemented-mechanisms table
and the section 5.2 target list. Rationale: the implemented tenant webhook is the only place this
notification exists today, and it already emits `invoice.issued`; making the target contract match
the shipped name means a future outbox implementation of Option 2 would not need to introduce a
second, competing name for the same business fact, and no client integration needs to change.

## GAP-CONF-07 disposition

`GAP-CONF-07` (three write authorities in one module) is not a defect to be closed by refactoring —
the audit records this explicitly, and this decision agrees. It is closed as informational input to
this decision: section 7.1 now states the real module boundaries so that the next reader of the
contract sees the architecture that exists, and so that a future decision to physically split
Order/Dispatch/Driver Task has an accurate starting map rather than a fictional one.

## Correction to the consensus citation

The revision merged in #1477 attributed to the accepted consensus packet, under "Accepted
Conclusions", both "SQL migrations are the schema authority" and "a modular monolith in
`apps/api`... aligned to service-contract ownership boundaries".

Only the first is there. The second is `docs/02-architecture/consensus/phase1/starter-draft.md:35`,
which `CANONICAL_DOCUMENT_MAP.md` section 3 classifies as a Provisional Design Input -- "inputs to
consensus, not consensus itself". Welding the two into one quotation under one source gave a
pre-consensus draft the standing of an accepted conclusion.

It mattered because that rationale carried weight: it claimed this decision merely applied an
existing architectural agreement. The consensus packet takes no position on deployment topology, so
no such agreement exists and this packet is setting the position. The rationale has been rewritten
to say so.

## Standing rule

Contracts section 5.2 is a target contract for a future service split, not a description of Phase 1
runtime behaviour. Any Phase 1 code or design that needs an asynchronous notification must use one
of the three mechanisms in section 5.2's "Phase 1 Implemented Mechanisms," or bring a new mechanism
back through this decision record rather than adding a topic to the target list and assuming it is
live.

If a future wave splits Order, Dispatch, or Driver Task into separately deployed services, that
wave must design the full transactional outbox (Option 2 above) as its own sized unit of work —
outbox table, delivery worker, consumer idempotency, ordering, retry, dead-letter handling, and
monitoring — before any of the 26 currently-absent topics is implemented. A partial implementation
of the topic list remains rejected regardless of which future wave revisits this decision.
