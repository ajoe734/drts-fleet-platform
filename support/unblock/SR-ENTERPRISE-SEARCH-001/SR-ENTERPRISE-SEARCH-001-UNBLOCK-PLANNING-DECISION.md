# SR-ENTERPRISE-SEARCH-001 — planning decision routing

Date: 2026-09-08. Helper owner: Codex2. Reviewer: Codex.
Disposition: explicit follow-up routed; parent implementation remains blocked.
Question: `Q-SR-ENTERPRISE-SEARCH-001` in `PHASE1_OPEN_QUESTIONS.md`.

## Evidence and precedence

Inspected fetched `origin/dev` at `6f4ac8c74ae3618b6109efd010014365a85d36d8`;
task branch rebased successfully (already up to date).

- `phase1_prd_detailed_v1.md` §9.1.2 requires booking and fulfillment-status
  queries. It does not settle the detailed filter wire contract.
- `docs/03-runbooks/system-remediation-20260906/SR-ENTERPRISE-SEARCH-001.md`
  execution prompt explicitly requires backend filter capability and prohibits
  filtering only the current page as if it were the complete dataset.
- `docs/02-architecture/search-and-empty-state-contract-20260524.md` §§1, 5–7
  permits scoped/page-local search and distinguishes filtered-empty states;
  it does not waive the more specific parent acceptance.
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:459`
  accepts tenant/request headers only, without filter/page query parameters.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2048`
  filters bookings by tenant and returns all matching in-memory orders with
  page 1, pageSize/totalItems equal to item count. This is source inspection,
  not proof of authoritative production data or live pagination.
- `packages/api-client/src/index.ts:1192` returns `BookingRecord[]` without
  query arguments; `apps/enterprise-dispatch-web/lib/api-client.ts:59` exposes
  the same array-only interface. Parent scope does not include that wrapper.
- Current release `ai-status.sh show SR-BOOKING-VERIFY` and
  `show SR-BOOKING-VERIFY-001` both exit 1, `Task not found`.
  `show SR-CONTRACT-001` exits 0: owner Gemini, reviewer Codex2, status todo;
  its existing acceptance concerns other feature contracts, not this search.
  Its ownership of shared exports is not implicit authorization to add scope.

## Recorded routing decision

Preserve the parent acceptance and blocked state. Do not reinterpret an absent
producer as completed, add invented API parameters, or approve a frontend-only
scope cut. This helper routes missing planning work; it grants no runtime scope
and does not itself establish a new product contract.

1. **Supervisor/Chairman:** identify an existing equivalent producer or register
   `SR-BOOKING-VERIFY` with an implementation owner and independent reviewer via
   the current task-board commands. Reconcile the dangling reference in the
   parent task spec/manifest and record the actual producer ID in `depends_on`.
   Keep the follow-up on this existing blocked parent until registration exists.
2. **Supervisor with SR-CONTRACT-001 owner Gemini:** authorize the booking query
   contract/client/OpenAPI slice through the shared writer, or create a serialized
   successor. Review overlap with existing owned-mobility writers and
   `UV-EXEC-019`; record a cycle-free dependency path before any shared edits.
   Producer scope needs the owned-mobility controller/service, their actual data
   source, and task-specific tests. Parent needs explicit authorization for
   `apps/enterprise-dispatch-web/lib/api-client.ts` if consuming the new envelope.
3. **Producer owner with contract reviewer Codex:** record exact date field,
   timezone and boundary inclusivity; passenger ID versus text matching;
   supported status values; combined-filter semantics; stable ordering/tie-break;
   page indexing, limits and invalid-input errors; filtered total and empty-page
   envelope. These are review questions, not defaults invented by this helper.
   Escalate to the human product owner only where canonical evidence cannot
   settle business semantics or if a reduced acceptance is requested.
4. **Producer acceptance:** prove tenant isolation, filtering before pagination,
   correct filtered totals across multiple pages, boundary/invalid inputs and
   empty results against the real implementation. Confirm the authoritative data
   source; a copied filter function or fixtures alone cannot establish live truth.
5. **Parent owner Codex2:** after the registered producer has canonical acceptance
   and merge evidence and scopes/dependencies are updated, fetch/rebase dev,
   consume its reviewed query/envelope, then verify combined filters, clear/reset,
   page changes and filtered-empty rendering. Record actual queries, totals and
   resource IDs with base/candidate SHAs; mark unavailable live/device checks as
   unexecuted. Commit/push and handoff to Codex only after these gates.

## Verification and delivery boundaries

This is a planning-only change. Source reads and single-task status queries above
were executed; no app test, live API query, deployment or device acceptance was
run or claimed. `git diff --check` must pass before candidate handoff.
The exact pushed candidate SHA and PR are recorded in helper machine truth;
parent machine truth points to this record and preserves the outstanding gate.
