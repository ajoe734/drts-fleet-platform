# Hosted UV-EXEC-006 atomicity snapshot: deterministic row order repair

Task: `SR-CI-UV-EXEC-SNAPSHOT-ORDER-20261007` — Claude / reviewer Pi.
Source-only test repair. This task does not adjudicate FCM/UX parent
blockers, does not grant deployment/readyvars/mail/push/phone/payment
authority, and does not run DB/product/browser/Compose infrastructure on
the VM. It owns exactly the two write scopes below.

## Actual counterexample this repairs

FCM documentation helper PR #2410 candidate `23e6284a03216beb0a56734f4d76c941041e55de`
is independently approved, but hosted integration run
`37648852953` failed: 313 passed / 1 failed at
`apps/api/tests/integration/uv-exec-006.integration.test.ts:2236`, test
`redispatch is atomic across resource release: cancel`. The saved log
(`.local/full-system-completion-20261007/round4/fcm-helper-ci-failed.log`,
lines 2917-2988) prints a 9-row snapshot diff in which one identical
`dispatch.assigned` trace record is reordered relative to the other trace
rows; the record's identity, timestamp, and every field are unchanged
between the two reads.

## Root cause

The test's `readState` helper (now at
`apps/api/tests/integration/uv-exec-006.integration.test.ts:2167-2189`)
queried six real formal-schema tables —
`ops.phase1_owned_orders`, `ops.phase1_dispatch_jobs`,
`ops.phase1_driver_tasks`, `ops.phase1_dispatch_assignments`,
`ops.phase1_dispatch_attempts`, `ops.phase1_dispatch_trace_logs` — with
plain `UNION ALL` and no `ORDER BY`, then compared the two reads with an
exact `toEqual` at lines 2223/2236 (array-order-sensitive). PostgreSQL
does not guarantee row order for a query without `ORDER BY`; it is free
to return the same logical rows in a different physical order across two
executions (e.g. after HOT updates/plan changes), which this hosted run
hit for `phase1_dispatch_trace_logs`. That is a test-query defect, not
evidence of a real atomicity regression in the production repository.

## Fix (write scope only)

- `apps/api/tests/integration/uv-exec-006.integration.test.ts`: the
  `readState` helper inside the `"%s is atomic across resource release: %s"`
  cases now wraps the same six unchanged `UNION ALL` branches (identical
  tables, columns selected, and `WHERE order_id = $1` filters) in a
  subquery that also carries, per branch, a literal integer
  `source_order` discriminator (0-5, one per table, in the original branch
  sequence) and that table's own primary key as `sort_key`
  (`order_id`, `dispatch_job_id`, `task_id`, `assignment_id`,
  `attempt_id`, `trace_id` respectively — all `varchar(100) PRIMARY KEY`
  per `infra/migrations/V0011__phase1_runtime_snapshots.sql`). The outer
  query does `ORDER BY source_order, sort_key` and still projects only
  `record`, so the shape of the returned rows (`{ record: ... }[]`) is
  unchanged.
  - No row is discarded, deduplicated, or projected away: every table
    still contributes every one of its matching rows, with every JSON
    field of `record` intact.
  - No value is coerced or loosened: the sort keys are each table's real
    primary key column, not a derived or approximate value, so two rows
    with distinct identity can never collide into the same sort position.
  - Because the same primary key is used for both the `before` and
    `after` reads of the same order within a single test, and primary
    keys are immutable once a row is inserted, this ordering is stable
    regardless of PostgreSQL's physical storage order — it fixes exactly
    the hosted-run defect (reordering of an unchanged row) without
    weakening the existing `toEqual` assertions' ability to catch an
    actual added, missing, or mutated row (a changed/added/removed
    primary key or a changed `record` payload still changes the
    comparison result).
  - The existing assertions this helper feeds
    (`expect(await readState()).toEqual(before)` for the `rollback` and
    non-`cancel_after_commit` branches) are otherwise untouched: same
    barriers, same mocked hooks, same reservation/concurrency assertions.
- `docs/04-uat/ci-uv-exec-snapshot-order-20261007.md`: this evidence
  record.

## Why no production/schema change

The failure is isolated to the test's own comparison query. The
production repository and service entrypoints
(`apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`)
already order their own multi-table snapshot reads deterministically
(e.g. `ORDER BY updated_at DESC, created_at DESC` for the mutable tables,
`ORDER BY sequence DESC, created_at DESC` for
`ops.phase1_dispatch_attempts`); this task does not touch that file or
any migration. It only brings the test's ad hoc snapshot query up to the
same standard of determinism the production code already applies.

## Required proof (not satisfiable from this VM)

This VM runs only source-only/static checks; it has no PostgreSQL,
product server, or browser/Compose infrastructure. Authoritative proof
requires the normal candidate lifecycle:

- Push this branch, open/update the PR, and let the exact resulting SHA
  go through independent review (reviewer: Pi) and same-SHA hosted CI,
  including the real hosted-Postgres integration run that previously
  caught this defect (`uv-exec-006.integration.test.ts`, all
  `it.each` scenarios of `redispatch is atomic across resource release`
  and `timeout is atomic across resource release`).
- A green run on the exact candidate SHA, followed by true merge, is the
  acceptance evidence for `snapshot_exact_sha_review_hosted_pg_ci_and_merge`.
- The original failing run (`37648852953`) remains the historical record
  of the defect being repaired; it is not rerun blind, and helper PR
  #2410 is not claimed to have passed that run.

This task does not reopen or adjudicate the FCM parent (which stays
blocked/default-disabled with the privacy key empty) or the UX parent
(which stays blocked on its three live/manual keys); `SR-ACCEPT-001`
stays `todo`. No deployment, readyvars, mail/push/phone/payment, or
external-fixture authority is granted here.
