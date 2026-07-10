# E2E-FIX-D-001 History Repair Note

Last updated: 2026-07-10
Task: `E2E-FIX-D-001-UNBLOCK-HISTORY-REPAIR`
Parent task: `E2E-FIX-D-001`
Owner: `Codex`
Reviewer: `Codex2`

## Summary

`E2E-FIX-D-001` is not blocked by a missing branch, missing push, or damaged task
diff.

The parent's blocker text became contaminated by treating the pre-merge
integration commit `7c8bc560b8a6926f9669e4344eed98ebea059109` as if that exact
SHA already needed to be reachable from `origin/dev`.

That is the wrong integration proof for this task:

- owner closeout branch: `origin/codex2/e2e-fix-d-001`
- owner closeout commit: `85bfee55158412601e15019cc776487ce05aa7fd`
- integration branch: `origin/codex2/e2e-fix-d-001-integrate`
- integration commit: `7c8bc560b8a6926f9669e4344eed98ebea059109`
- integration PR: `#1079`
  `https://github.com/ajoe734/drts-fleet-platform/pull/1079`

`7c8bc560b` is a one-commit reconciliation of the approved task diff onto a
newer `dev` base (`ac28fe9f7c3c1356c39f137ae6ece244f51d1dd8`), created after a
protected `dev` branch rejected direct push. The branch history is therefore
normal for a PR-based integration flow; no force-push or shared-history repair
is required.

## What Is Already True

- `85bfee551` is pushed on `origin/codex2/e2e-fix-d-001`.
- `7c8bc560b` is pushed on `origin/codex2/e2e-fix-d-001-integrate`.
- `git range-diff` shows `7c8bc560b` is the reconciled form of the same
  accepted task diff, not a divergent implementation.
- The task-owned files in the reviewed closeout commit and the integration
  branch commit are byte-identical:
  - `infra/migrations/V0050__fleet_supply_partner_ids_as_text.sql`
  - `scripts/db-apply.sh`
  - `tests/unit/db-apply.test.ts`
- The only extra worktrees found were detached review snapshots under `/tmp`;
  they do not own refs and are not the cause of the parent block.

## Diagnosis

This is a machine-truth history description problem, not a Git repair problem.

1. The owner branch was reviewed and approved at `85bfee551`.
2. Protected `dev` rejected direct push, so Codex2 correctly opened PR `#1079`
   from `codex2/e2e-fix-d-001-integrate`.
3. The parent was then blocked with text that requires
   `7c8bc560b...` to be reachable from `origin/dev`.
4. That requirement is stale because `7c8bc560b` is the pre-merge integration
   branch head, not the post-merge canonical `dev` evidence.
5. If PR `#1079` merges by squash or rebase, the exact SHA `7c8bc560b` may
   never appear on `origin/dev`; the canonical proof will be the merge result
   (`MERGED_REF=origin/dev` and/or `MERGE_COMMIT=<merged sha>`).

## Current Remote State

As checked on 2026-07-10:

- PR `#1079` is `OPEN`
- `mergeable=MERGEABLE`
- `mergeStateStatus=BLOCKED`
- failing checks:
  - `unit`
  - `Smoke acceptance`
  - `e2e`
  - `ci-integ`

The two fast, concrete failure signals are:

- `unit` and `Smoke acceptance` both fail in
  `tests/unit/db-apply.test.ts` because CI reports
  `service "postgres" is not running`
- `e2e` fails in the wider hermetic suite, including `E2E-022`, so the current
  integration PR is blocked by CI, not by missing history reachability

## Non-Destructive Repair Path

1. Keep both pushed branches exactly as they are. Do not force-push shared
   history.
2. Treat PR `#1079` as the canonical integration vehicle for
   `E2E-FIX-D-001`.
3. Stop using `7c8bc560b` reachability on `origin/dev` as the pre-merge gate.
4. Resume the parent on the real next step: fix or otherwise resolve the
   failing checks on PR `#1079`, then merge that PR to `dev`.
5. Only after merge should the parent finalize with
   `INTEGRATION_STATUS=merged_to_dev` plus `MERGED_REF=origin/dev` or
   `MERGE_COMMIT=<merged sha>`.

## Concrete Next Step For `E2E-FIX-D-001`

Resume the parent out of the stale history blocker and continue from the
existing integration PR:

1. Reuse `origin/codex2/e2e-fix-d-001-integrate @ 7c8bc560b`.
2. Inspect PR `#1079` failing checks, starting with the CI Postgres dependency
   failure in `tests/unit/db-apply.test.ts`.
3. Re-run CI after the check failures are resolved.
4. Merge PR `#1079` to `dev`.
5. Finalize the parent with merged-to-dev evidence from the actual merge
   result, not from the pre-merge branch head.

## Owner Closeout Addendum

- Reviewer approval for this helper task landed at `2026-07-10T17:22:30Z` on
  PR `#1080` / commit `5817ef76d` after re-checking remote refs, range-diff,
  PR state, failing jobs, and `git diff --check`.
- The parent unblock result must stay in machine truth as a concrete next step:
  reuse PR `#1079` at
  `origin/codex2/e2e-fix-d-001-integrate @ 7c8bc560b`, resolve the failing
  checks (`unit`, `Smoke acceptance`, `e2e`, `ci-integ`), merge to `dev`, then
  finalize `E2E-FIX-D-001` with `INTEGRATION_STATUS=merged_to_dev` plus
  `MERGED_REF=origin/dev` or `MERGE_COMMIT=<merged sha>`.
- This helper task only closes out the branch-level unblock note and evidence
  on `origin/codex/e2e-fix-d-001-unblock-history-repair`; it does not claim
  that PR `#1079` or PR `#1080` has merged, and it does not claim dev deploy.

## Non-Claim

This note does not claim that `E2E-FIX-D-001` is already merged to `dev`, does
not claim that PR `#1079` is green, and does not mark the parent `done`.
