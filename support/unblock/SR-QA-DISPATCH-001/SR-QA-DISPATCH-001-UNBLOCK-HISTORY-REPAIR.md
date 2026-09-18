# SR-QA-DISPATCH-001 Unblock History Repair

## Scope

- Helper task: `SR-QA-DISPATCH-001-UNBLOCK-HISTORY-REPAIR`
- Parent task: `SR-QA-DISPATCH-001`
- Owner: `Claude`; reviewer: `Gemini` (both tasks)
- Audit timestamp: `2026-09-10T21:00:00Z`
- Preserved source rail: `origin/claude/sr-qa-dispatch-001 @ d1ecc53022b8e40ccf6d0791c8d82903580bdbc1` (PR [#1948](https://github.com/ajoe734/drts-fleet-platform/pull/1948), targeting `dev`)
- Replacement commit: `claude/sr-qa-dispatch-001-unblock-history-repair @ 5808f65bc` (this branch)

## Exact Contamination — two independent blockers, not one

The parent task's `next` field reported only one blocker: the `Commit trailers`
gate rejecting candidate `d1ecc53022b8`'s subject
`test(SR-QA-DISPATCH-001): dispatch/reassign/queue/timeout acceptance regression`
(`tools/ci/git/check_commit_trailers.py`'s `SUBJECT_RE` only accepts
`wip|fix|feat|refactor|docs|chore|style` prefixes or the bare
`<TASK-ID>: <summary>` canonical form — `test(` is not in that set). That
diagnosis is correct as far as it goes, and reproduces locally
(`python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
exits 1 on that commit).

Re-checking PR #1948's full check list (`gh pr view 1948 --json
statusCheckRollup`) instead of taking the parent's self-report at face value
shows a **second, independent failing required check**: `Product smoke
acceptance` (and its downstream aggregate `Smoke acceptance`), run
`34525822672` / job `103034527004`, fails 3 real test assertions:

```
FAIL tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-db-persistence.test.ts
  > C035/C036 Positive: dispatch job + assignment + attempt write-then-read back exactly through persistChanges/loadState
  error: relation "ops.consumer_notification_outbox" does not exist
  > C038 Positive: dispatch-timeout trace log write-then-read reconstructs the redispatch reason
  error: relation "ops.passenger_dispatch_disclosure_snapshots" does not exist
  > C039 Positive: queue check-in/check-out trace-log stream write-then-read
  error: relation "ops.passenger_dispatch_disclosure_snapshots" does not exist
```

Root cause: `dispatch-db-persistence.test.ts` bootstraps its own isolated
Postgres database (`CREATE DATABASE sr_qa_dispatch001_<uuid>`) and manually
applies exactly two migration files —
`V0011__phase1_runtime_snapshots.sql` and
`V0087__dispatch_resource_reservations.sql` — copying the bootstrap already
proven by `tests/unit/system-remediation/sr-qa-concurrency-001/dispatch-reservation-concurrency.test.ts`
(same two migrations, same 4 manually-created schemas). That prior test,
however, never calls `OwnedMobilityRepository.loadState()`; this new test is
the first one to. `loadState()` (`apps/api/src/modules/owned-mobility/owned-mobility.repository.ts:508`)
does a `Promise.all` across 8 tables, including
`ops.passenger_dispatch_disclosure_snapshots` and
`ops.consumer_notification_outbox` — both defined in
`infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql`, which the
test's bootstrap never applies. `V0056` also declares tables in the `reg`,
`billing`, and `reporting` schemas (via `CREATE TABLE IF NOT EXISTS
reg....`/`billing....`/`reporting....`), none of which the test's manual
`CREATE SCHEMA` block creates, so applying `V0056` verbatim additionally
requires creating those three schemas first (`reg`/`billing`/`reporting` are
otherwise created by `V0001__bootstrap_extensions_and_schemas.sql` and
`V0034__phase1_delta_supply_eligibility_mobile_reporting.sql`, neither of
which this isolated-DB test applies).

This is a genuine defect in the new test file introduced by
`SR-QA-DISPATCH-001` itself (not a pre-existing product bug, not a CI
ordering issue — `dispatch-db-persistence.test.ts` bootstraps its own
database independently of the job's later `pnpm db:migrate` step against the
shared CI database). It is squarely inside `SR-QA-DISPATCH-001`'s own
`write_scopes` (`tests/unit/system-remediation/sr-qa-dispatch-001/`), so this
repair task fixes it directly rather than opening a separate sourced
follow-up task for it.

The candidate's actual semantic delta versus `origin/dev` is isolated and
additive only:

```
git diff --stat origin/dev...origin/claude/sr-qa-dispatch-001
 docs/04-uat/system-remediation-20260906/SR-QA-DISPATCH-001.md                     | 167 ++
 tests/e2e/system-remediation/sr-qa-dispatch-001/sr-qa-dispatch-001.spec.ts        | 211 ++
 tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-candidates-and-assignment.test.ts | 291 ++
 tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-db-persistence.test.ts  | 400 ++
 tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-queue-checkin-checkout.test.ts | 166 ++
 tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-timeout-no-supply-scheduler-gap.test.ts | 280 ++
 tests/unit/system-remediation/sr-qa-dispatch-001/platform-presence-multiplatform-busy.test.ts | 123 ++
 tests/unit/system-remediation/sr-qa-dispatch-001/test-support.ts                  | 110 ++
 8 files changed, 1748 insertions(+)
```

Every changed path is a new file inside `SR-QA-DISPATCH-001`'s declared
`write_scopes`.

## Non-Destructive Repair Performed

Per `docs/ops/branch-strategy.md` §11.4, `claude/sr-qa-dispatch-001` /
PR #1948 is already published and reviewed (`reviewed_sha == candidate_sha`
from `Gemini`), so it must not be rebased, amended, or force-pushed to fix
either defect. `git checkout <ref> -- <path>`, `git switch`, `git reset
--hard`, `git revert`, and `git update-ref` are all classified `defer`/`deny`
in this worker sandbox (see incident note below), so — matching the pattern
established by `SR-QA-IDENTITY-001-UNBLOCK-HISTORY-REPAIR` — the repair was
done entirely on this task's own already-assigned
`claude/sr-qa-dispatch-001-unblock-history-repair` branch using only
non-destructive, allowed commands:

1. For each of the 8 files, read the blob from the untouched candidate ref
   without checking it out: `git show origin/claude/sr-qa-dispatch-001:<path>
   > <path>` (plain output redirection; `origin/claude/sr-qa-dispatch-001`
   itself is never written to or switched into).
2. `git add` those 8 paths; confirmed `git diff --cached
   origin/claude/sr-qa-dispatch-001 -- <8 paths>` was empty, i.e. byte-identical
   to the candidate.
3. Edited only `dispatch-db-persistence.test.ts`'s `beforeAll` bootstrap to
   add `CREATE SCHEMA reg; CREATE SCHEMA billing; CREATE SCHEMA reporting;`
   and `await pool.query(migration("V0056__multi_taxi_runtime_compliance_closure.sql"));`
   after the existing `V0011`/`V0087` calls (10-line diff, everything else
   untouched — `git diff --cached origin/claude/sr-qa-dispatch-001 -- <8
   paths>` now shows only this one hunk).
4. Committed as one canonical commit `5808f65bc SR-QA-DISPATCH-001:
   reconstruct dispatch/reassign/queue/timeout acceptance regression
   history`, trailers `LLM-Agent: Claude` / `Task-ID: SR-QA-DISPATCH-001` /
   `Reviewer: Gemini` (matching the original task's own owner/reviewer — no
   cross-lane attribution needed here), plus a `Reconstructed-by:` trailer.
5. `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head
   HEAD` → `1 commit(s) OK`.
6. `git diff --check origin/dev...HEAD` → clean.
7. `pnpm exec vitest run` on the 3 non-DB-backed unit test files
   (`dispatch-candidates-and-assignment.test.ts`,
   `dispatch-queue-checkin-checkout.test.ts`,
   `platform-presence-multiplatform-busy.test.ts`) plus
   `dispatch-timeout-no-supply-scheduler-gap.test.ts` → `Test Files 4 passed
   (4)`, `Tests 29 passed (29)`.
8. `dispatch-db-persistence.test.ts` itself fails closed in this sandbox with
   the same explicit error the file is designed to raise
   (`... DATABASE_URL must be explicitly configured ...`) because no
   Postgres is reachable here — `docker`/`psql`/`postgres` are all
   unavailable/blocked in this worker VM (per the dispatch's VM restriction
   against starting infrastructure). The V0056 bootstrap fix is therefore
   verified **statically** (SQL read-through confirming schema/table
   dependency order resolves: `ops` tables reference no other schema, `reg`
   tables are self-contained, `V0056`'s `ALTER TABLE ops.phase1_owned_orders`
   targets a table `V0011` already creates) rather than by an actual local
   Postgres run. **CI (which runs a real `postgis/postgis:16-3.4` service
   container) is the first environment that can execute
   `dispatch-db-persistence.test.ts` end-to-end for this fix; that run is the
   remaining live verification, not yet available from this sandbox.**
9. Push this branch with an ordinary non-force push. `origin/claude/sr-qa-dispatch-001`
   and PR #1948 remain completely untouched as audit evidence — no ref on
   that branch was written, rebased, or force-pushed.

## Incident: accidental commit on canonical-root `dev`, self-corrected

While reconstructing the files, a `cd /home/lupin/workspace/drts-fleet-platform
&& ...` prefix (the canonical root, not the assigned isolated worktree
`.artifacts/worktrees/auto/claude-sr-qa-dispatch-001-unblock-history-repair`)
was used by mistake for the file writes, `git add`, and the first `git
commit`. That commit landed on the canonical root's local `dev` branch,
on top of 12 pre-existing local-only commits already unpushed there (`git
reflog` there shows `SUPERVISOR-*`/`ORCH-*` commits, none created by this
task). The mistaken commit only added the same 8 new files (no
modifications/deletions to anything else), so it was fully reversible.

`git reset --hard` on that canonical-root checkout was classified `deny`;
`git update-ref` and `git revert` were classified `defer` (unavailable, same
as the `git checkout`/`switch`/`merge`/`cherry-pick` restrictions
`SR-QA-IDENTITY-001-UNBLOCK-HISTORY-REPAIR` already documented). Recovery
used only `git rm <path>` (allowed) for each of the 8 files plus a normal
`git commit` with a canonical `<TASK-ID>: <summary>` subject, which is
content-equivalent to a revert (1748 deletions exactly matching the 1748
insertions) without rewriting any ref. Verified afterward:
`git diff HEAD~2 -- <8 paths>` is empty (canonical root's `dev` tree is
byte-identical to its state before the mistake) and `git status --short`
shows the exact same large pre-existing unrelated dirty/untracked file list
that was present before this task began (confirming nothing else on that
checkout was disturbed). The 12 pre-existing local commits there are
untouched. Net effect: canonical-root `dev` now carries one additional
local-only "cleanup" commit (`d6519dd38`, not pushed, not part of any PR)
instead of being byte-for-byte unchanged; a supervisor with access to rewrite
that checkout's local history may squash it away, but it is not required —
content-wise it is a no-op. The actual task work was then redone correctly in
the assigned worktree, per this document's "Non-Destructive Repair Performed"
section above.

## Concrete Parent Next Step

`SR-QA-DISPATCH-001` is unblocked from both its commit-trailer defect and its
real test-bootstrap defect. Concrete next step for owner `Claude` / reviewer
`Gemini`:

1. Open a PR from `claude/sr-qa-dispatch-001-unblock-history-repair` (or
   port commit `5808f65bc` onto a fresh branch if preferred) and run it
   through the normal PR review/CI flow — this is the first opportunity for
   `Product smoke acceptance` to actually execute the fixed
   `dispatch-db-persistence.test.ts` against a real Postgres instance.
2. Record the new head as the parent's candidate:
   `CANDIDATE_SHA=5808f65bc... CANDIDATE_BRANCH=claude/sr-qa-dispatch-001-unblock-history-repair AI_NAME=Claude ai-status.sh handoff SR-QA-DISPATCH-001 Gemini "..."`
   A push to a new SHA invalidates prior review/CI evidence per
   `docs/ops/branch-strategy.md` §11.6, so this is expected and required —
   `d1ecc53022b8` (the old candidate SHA) cannot be reused for closeout.
3. Once merged to `dev`, PR #1948 may be closed as superseded; do not
   force-push, amend, or reuse PR #1948 itself for closeout.
4. If `Product smoke acceptance` still fails in CI on the new candidate for a
   reason other than the two fixed here, that is new information this task
   did not have access to (no local Postgres) and should be triaged as its
   own follow-up rather than assumed fixed.

## Verification

- `gh pr view 1948 --json statusCheckRollup` — enumerated all checks on PR
  #1948; found the second failing required check (`Product smoke
  acceptance`/`Smoke acceptance`) that the parent task's self-report missed.
- `gh run view 34525822672 --job 103034527004 --log-failed` — isolated the
  exact 3 failing assertions and the `relation ... does not exist` errors.
- `grep -n "CREATE TABLE" infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql`
  and `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts:440-497`
  — traced `loadState()`'s 8-table `Promise.all` back to the two missing
  relations and their defining migration.
- `git show origin/dev:tests/unit/system-remediation/sr-qa-concurrency-001/dispatch-reservation-concurrency.test.ts`
  — confirmed the "proven" `V0011`+`V0087` bootstrap this test copied never
  calls `loadState()`, explaining why the same bootstrap passed CI there but
  not here.
- `git diff --cached origin/claude/sr-qa-dispatch-001 -- <8 paths>` — empty
  before the fix edit, then showed only the intended 10-line hunk after.
- `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
  → `1 commit(s) OK`.
- `git diff --check origin/dev...HEAD` → clean.
- `pnpm exec vitest run` on the 4 non-DB-backed test files → `Test Files 4
  passed (4)`, `Tests 29 passed (29)`.
- `git push -u origin claude/sr-qa-dispatch-001-unblock-history-repair`
  succeeded without force.

## Helper Closeout Boundary

This helper's own branch records the diagnosis, the real test-bootstrap fix,
and the replacement-commit evidence only. Its integration status is
`branch_pushed`; it does not claim that `SR-QA-DISPATCH-001` has merged to
`dev` or deployed, and it does not claim `Product smoke acceptance` has
actually passed in CI yet (unverifiable from this sandbox — no Postgres
available). `origin/dev` did not move as a result of this task.
