# Callcenter Multi-Order Execution Tasks (2026-08-19)

**Status:** ready for supervisor registration
**Baseline:** `origin/dev`
**Decision:** `PHASE1_OPEN_QUESTIONS.md` Q-001, answered 2026-08-19 — one call may create more than
one order, and the console needs a journey for it
**Registration:** `tools/task-dispatch/dispatch-callcenter-multi-order-20260819.py`

## 1. What is actually broken

The relationship between a call and its orders is modelled with opposite cardinalities in two
places, and a UI block hides the disagreement:

| Layer                                          | Today                                | Permits              |
| :--------------------------------------------- | :----------------------------------- | :------------------- |
| `ops.orders.call_id` (`V0006:29`)              | nullable, no unique constraint       | many orders per call |
| `crm.phase1_call_sessions.record` jsonb        | `linkedOrderId`, singular            | one                  |
| `packages/contracts/src/index.ts:4439,4463`    | `linkedOrderId: string \| null`      | one                  |
| `apps/ops-console-web/app/callcenter/page.tsx` | `linked_order_exists` disable reason | one                  |

The console block has **no server-side counterpart**. A second order created through the API today
succeeds and writes `call_id`, while the session acknowledges only the one it already holds. The
inconsistency is silent, and the disabled button is the only thing that has been preventing anyone
from finding it.

**There is no typed column to migrate.** The runtime session lives in a `record jsonb` column
(`V0011:69`), so the shape change is a contract and service change with a data-shape backfill, not a
DDL change. `crm.call_sessions.linked_order_id` from `V0007` is a real 1:1 FK but no application
code reads or writes it — see section 4.

## 2. Dispatch rules

1. The supervisor, not the planning agent, creates worker branches and starts auto workers.
2. Every worker starts from current `origin/dev` and records the exact base SHA.
3. Owner and reviewer are different lanes.
4. **No task may edit an L1 product-truth file** (`CANONICAL_DOCUMENT_MAP.md` section 2). Neither
   task here needs to; if one appears to, stop and report rather than editing.
5. **`CC-MULTI-001` must merge before `CC-MULTI-002` starts.** A cardinality change is more
   dangerous half-applied than unapplied: a console that offers a second order against a service
   that still overwrites the first produces silent data loss. This ordering is the point of the
   packet, not a convenience.

## 3. Tasks

### CC-MULTI-001 — Make one call hold many orders, end to end below the UI

**Priority:** P1
**Owner hint:** Codex
**Reviewer hint:** Claude2
**Dependencies:** none
**Workstream:** callcenter-cardinality

**Execution prompt**

Change the session-to-order relationship from one to many across the contract, the service, and the
persisted `record` jsonb, in one change. Do not split these: a contract that says many while a
service keeps one is the defect this task exists to remove.

Replace the singular `linkedOrderId` with a collection in
`packages/contracts/src/index.ts` (both occurrences, `:4439` and `:4463`). Keep reads tolerant of
the old shape — persisted rows in `crm.phase1_call_sessions` carry `linkedOrderId` as a scalar
today, and they must deserialise into a single-element collection rather than failing or silently
dropping the link. State plainly in the code whether old rows are rewritten on next write or left
to be read through the tolerant path; either is acceptable, guessing is not.

Make `createCallCenterOrder` append rather than replace. Contracts section 4.5 defines this as a
Callcenter to Order Service orchestration and the route lives on `owned-mobility`; the link must be
recorded once per order, and creating a second order must not disturb the first.

Contracts section 3.9 says every call has at most one _active session_. That is not a limit on
orders per call and must not be reintroduced as one.

**Owned artifacts**

- `packages/contracts/src/index.ts` — the two `linkedOrderId` declarations
- `apps/api/src/modules/callcenter/` — service model, repository serialisation
- `apps/api/src/modules/owned-mobility/` — the call-center order creation path only
- `tests/unit/`, `tests/integration/` — focused tests

**Acceptance**

- One call session can hold two or more order references, returned in creation order.
- A session persisted with the old scalar `linkedOrderId` reads back as a one-element collection; a test pins this against a literal old-shape row, not a round-trip of the new writer.
- Creating a second order for a call leaves the first link intact, proven by readback rather than by return value.
- The existing single-order flow is unchanged for callers that create exactly one.
- No `linked_order_exists`-style rejection is added on the server: the server did not enforce it before and must not start.
- Focused callcenter and owned-mobility tests pass; the contracts package typechecks.

---

### CC-MULTI-002 — Give the console the journey

**Priority:** P1
**Owner hint:** Gemini2
**Reviewer hint:** Codex2
**Dependencies:** `CC-MULTI-001`
**Workstream:** callcenter-console

**Execution prompt**

Remove the `linked_order_exists` disable reason in
`apps/ops-console-web/app/callcenter/page.tsx:553` and the guard that produces it, and render the
call's orders as a list rather than a single `session.linkedOrderId`. An agent on a live call must
be able to create a further order for that call without closing or re-opening the session.

The single-order path is the common case and must not get slower or longer to operate. Adding a
second order should be a deliberate action, not a step everyone walks through.

Each listed order keeps the cross-app dispatch intent link that the current single order has
(`page.tsx:848-853`).

**Owned artifacts**

- `apps/ops-console-web/app/callcenter/`
- `apps/ops-console-web/tests/`
- i18n message catalogues for the strings this adds or retires

**Acceptance**

- An agent can create a second order on an open call session and both appear, in creation order.
- Creating one order still takes the same number of actions it does today.
- Every listed order offers the dispatch intent link.
- The retired `linked_order_exists` string is removed from every locale catalogue, not just the default one.
- A browser test covers create-one and create-two on the same session, asserting server state by readback rather than by what the page renders.
- Existing callcenter console tests pass.

## 4. Found while scoping this, deliberately not in scope

`crm.call_sessions` (`V0007:3`) is a typed table with a real `linked_order_id` 1:1 foreign key, an
index on it (`V0010:737`), and a view joining it (`V0010:839`). No application code reads or writes
it. The same is true of its siblings in that migration: `crm.call_recordings`,
`crm.complaint_cases`, and `crm.callback_tasks` have zero application references. The runtime uses
`crm.phase1_*` jsonb snapshot tables instead.

So the canonical Phase 1 CRM schema exists, is indexed, is joined by a view, and is bypassed.

That is a larger question than this packet — whether the snapshot tables are an intentional stage or
unreviewed drift, and which of the two is meant to be the record. Resolving it here would mean
answering it by implication. Recorded in the `PHASE1_OPEN_QUESTIONS.md` synchronisation backlog
instead.

Neither task below touches `crm.call_sessions`. A worker that finds itself needing to should stop
and report.

## 5. Stop and escalation conditions

Workers stop and report when:

- the old-shape tolerant read cannot be made to work without a data migration, which changes the shape of this packet;
- a caller outside the owned artifacts depends on `linkedOrderId` being scalar;
- `CC-MULTI-002` finds the console needs a server change, which means `CC-MULTI-001` was incomplete and the fix belongs there;
- either task appears to require editing an L1 file or `crm.call_sessions`.
