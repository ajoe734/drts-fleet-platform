# UV-EXEC-013 planning blocker disposition

- Task: `UV-EXEC-013-UNBLOCK-PLANNING-DECISION`
- Owner / reviewer: Codex / Codex2
- Evidence snapshot: 2026-09-08 UTC
- Disposition: route an engineering CI blocker under existing UV-EXEC-013;
  no missing product decision established, no scope cut approved.

## Evidence and authority

The parent task slice reports owner Codex2, reviewer Codex, blocked on Product
smoke for candidate `e653a3bf9b568e958838c537c3abfa31e342f39d`,
[PR #1826](https://github.com/ajoe734/drts-fleet-platform/pull/1826).
Read-only GitHub inspection confirms that head and an open PR. The
[failed Product smoke job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34282197576/job/102249692046)
shows `cancellation preserves live state on stale_trip` failing in
`tests/integration/uv-exec-006.integration.test.ts:2688` with
`DRIVER_TASK_NOT_FOUND`. Earlier module initialization logs report
`Owned mobility persistence skipped during module init: Cannot read properties
of undefined (reading 'includes')`. The separate integration workflow's
`ci-integ`, unit and typecheck checks succeeded for this candidate; they do not
override failed Smoke acceptance.

The parent's suspected incomplete UV-EXEC-002/005 order fixtures
(`complianceFlags`) and shared database contamination remain hypotheses.
These logs establish the failure, not its root cause. This helper did not run
PostgreSQL tests or reproduce the race.

The accepted [execution decision](../../../docs/01-decisions/SD-DP-20260906-013-unattended-voice-execution.md)
(`採納的工程基線`, `仍需證據的開通門檻`) already authorizes fixture engineering.
The [SD](../../../docs/02-architecture/phase1-unattended-voice-booking-sd-20260906.md)
§4.3 defines ordinary realtime versus multi-taxi routing; §6.4 defines service
area review gates and requirements propagation. Nothing in the observed CI
failure establishes a conflict with those decisions.

## Retained contract and scope

- Resolve ambiguous places/entrances with provenance; do not guess coordinates.
  Preserve service-area and eligibility states; unresolved review/conditional
  requirements must prevent automatic submission/assignment (SD §6.4).
- Carry typed requirements through draft, order, candidate filtering,
  assignment revalidation and driver task. Unsupported capacity/capability
  requests route to exceptions, not ordinary vehicles (SD §6.4).
- Keep ordinary realtime and multi-taxi runtime/product/authorization distinct;
  an unopened reservation capability must not become a realtime order (SD §4.3).
- Retain all parent acceptance, including absolute-time handling and its four
  required evidence keys: `address_service_area_matrix`,
  `requirements_end_to_end_evidence`, `product_runtime_route_evidence`,
  `reviewed_candidate_sha`.

## Concrete follow-up on the existing parent

1. Codex2 resumes engineering investigation on the parent worktree. Reproduce
   the failed stale-trip case with an isolated migrated PostgreSQL database,
   then run the full Product smoke API test command to expose cross-suite
   effects. Compare fixture completeness, cleanup and repository initialization
   across UV-EXEC-002/005/006 before selecting a fix.
2. Repair the demonstrated fixture/isolation defect or domain loading defect;
   keep stale-trip cancellation assertions and dispatch safety checks intact.
   Coordinate overlapping shared-owned-mobility edits through Supervisor/Chair
   before concurrent writers act. If separate ownership is necessary, the chair
   must register that producer in machine truth; this document creates no task.
3. Run parent unit tests and API typecheck plus the PostgreSQL-backed full
   Product smoke suite. Record database setup, exact commands and results.
   Missing local DATABASE_URL is an environment prerequisite to arrange, not a
   reason to waive CI or invent a product decision.
4. Commit/push any repair and hand off the new exact parent SHA to Codex;
   rerun required CI and obtain same-SHA review and acceptance evidence.
   Keep the parent blocked until engineering resume prerequisites are available;
   this routing does not approve its existing candidate or clear failed CI.

If investigation actually exposes unresolved product semantics, cite the
conflicting source sections in `PHASE1_OPEN_QUESTIONS.md` and route that specific
choice to the decision owner. No speculative product question is opened here.

## Verification and delivery

Planning-only change: checked parent machine-truth slice, PR head/check results,
failed job logs and cited SD/decision sections. No product implementation or
runtime tests are claimed. Task-scoped commit, normal push, PR and candidate
handoff are recorded through the helper lifecycle; review/merge remain gates.
