# UV-EXEC-006 history repair evidence

Inspected 2026-09-08 UTC. Owner: Codex. Reviewer: Codex2.

## Finding

The blocked parent is a published-history replay problem, not an uncommitted
working-tree diff in this dispatch. The assigned helper worktree was clean on
`codex/uv-exec-006-unblock-history-repair`; it was rebased successfully onto
fetched `origin/dev` = `2a093872d05a7d0344adf9bb58f9e5c4c99861d1`.
No parent worktree or Codex2 parent review worktree appeared in
`git worktree list --porcelain` at inspection. Do not reuse the canonical root
or assume an old reviewer checkout is still provisioned.

The preserved remote parent `origin/codex/uv-exec-006` and open
[PR #1721](https://github.com/ajoe734/drts-fleet-platform/pull/1721) both point to
`257784d1528707b5880685bbefe13db4efebb7c8`. Its merge base with inspected dev is
`003d58bff9df31f844a3cb83187a803151536c6c`.

Exact duplicate-history evidence:

- `58e7fc267`, `1c8b5bd50`, and `26c786c9c` each introduce the shared reservation
  implementation. `git show <sha> --pretty=format: | git patch-id --stable`
  yields the identical patch ID `2dc7a0da683cc5c94554b6cb839c6ec012a308f3` for all three.
- Merge `c0b4cb6ae9e07b8200dbff367350f3d8fcf8943c` joins rebased head
  `e6313bba02b90ef1c72cbbbc90b10bceae8430d8` to old published ancestry
  `6b6d90932ea7c1b1b1bacfe9482932587629b515`.
- Merge `07670ef72a905a40202c4764d7e8a6d33b2a8833` repeats this pattern, joining
  `b28a50a67a7c2d599419a2bf2366656117e56b12` and
  `d5072a804be329b66465573a08d3072762de2f37`.
- The parent machine-state note reports rebase onto `d44bd2814` stopped at
  `1c8b5bd50` with five duplicate-history conflicts and was aborted. That failed
  rebase was not rerun in a shared worktree here; the duplicate patches and
  ancestry above were independently verified.
- Previously reported reviewer head `dc0662558cf5069f878f3785c2072b965bde25c6`
  is an earlier conflict-handling implementation commit, not the preserved
  `257784d15` candidate. Its review cannot approve the latter SHA.

## Verified non-destructive path

Keep the old branch and PR intact. Supervisor should provision a **new** parent
recovery branch/worktree from current `origin/dev`, route UV-EXEC-006 to it, and
apply the net patch from the old candidate's merge base. This avoids replaying
both copies of history and avoids a force push. Do not reset/rebase the already
published parent branch and then attempt to overwrite its remote.

Dry-run performed using a temporary index outside the worktree:

```bash
old=257784d1528707b5880685bbefe13db4efebb7c8
base=2a093872d05a7d0344adf9bb58f9e5c4c99861d1
fork=$(git merge-base "$base" "$old")
scratch=$(mktemp -d /tmp/uv006-history-repair.XXXXXX)
git diff --binary "$fork" "$old" > "$scratch/parent.patch"
GIT_INDEX_FILE="$scratch/index" git read-tree "$base"
GIT_INDEX_FILE="$scratch/index" git apply --cached --3way "$scratch/parent.patch"
GIT_INDEX_FILE="$scratch/index" git write-tree
git merge-tree --write-tree "$base" "$old"
```

Both independent constructions returned tree
`7b4496097b83cf86335eda3d95330512f13734ac`; apply and merge-tree exited zero.
The resulting delta is 14 parent-owned files: four API service/controller/
repository files, six API integration/unit test files, the writer-inventory
runbook, V0090/V0091 migrations, and contracts/index.ts. No control-plane,
status, or unrelated task files are included. This verifies mechanical content
preservation, not product correctness.

Concrete next execution steps for the parent owner/supervisor:

1. Fetch dev again. Preserve old candidate above. Provision a clean isolated
   recovery worktree on a new unused branch, for example
   `codex/uv-exec-006-history-recovered`. Update dispatch routing to this branch;
   do not switch the canonical root or another worker's worktree.
2. Recompute merge base and binary net patch against the preserved old candidate.
   On the clean recovery branch, `git apply --index --3way <patch>` and compare
   `git write-tree` with `git merge-tree --write-tree origin/dev <old-candidate>`.
   Stop on conflicts or unexpected paths; never overwrite current dev files
   using a whole-tree restore from the old candidate.
3. Immediately commit the staged task-owned delta with a UV-EXEC-006 anchor
   subject and `LLM-Agent: Codex`, `Task-ID: UV-EXEC-006`, `Reviewer: Codex2`
   trailers; normal push to the new branch. Open a replacement PR against dev
   referencing #1721. Leave #1721 preserved until the replacement is tracked.
4. Run API typecheck, the affected unit suites, and PostgreSQL integration using
   the [parent candidate integration suite](https://github.com/ajoe734/drts-fleet-platform/blob/257784d1528707b5880685bbefe13db4efebb7c8/apps/api/tests/integration/uv-exec-006.integration.test.ts)
   after applying the recovery patch. This suite exists in the parent candidate,
   not this helper branch; the parent's root-level test path is stale.
   Supply a valid DATABASE_URL.
   Inspect and resolve current failing CI before claiming readiness.
5. Commit/push any fixes, then use canonical ai-status.sh with the **new** HEAD
   as CANDIDATE_SHA and recovery branch as CANDIDATE_BRANCH to handoff UV-EXEC-006
   to Codex2. Provision a separate detached reviewer worktree at that exact SHA.
   Review/CI/merge/acceptance evidence must be newly bound to that SHA.

This helper intentionally delivers the verified repair procedure, not a second
product candidate. The parent branch, source files, and candidate were not
modified. No force push, stash, shared reset, PR closure, or merge was performed.

## Remaining parent gates

At inspection #1721 had failed `unit`, `integration`, `Product smoke acceptance`,
`Smoke acceptance`, and `ci-integ` checks; GitHub mergeability was UNKNOWN.
See [integration run](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34254156593)
and [CI run](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34254156596).
Failures are recorded, not diagnosed by this history-only helper. Prior parent
179/179 unit and 58/58 PostgreSQL notes do not replace new-candidate checks.
The four parent acceptance keys remain required: writer inventory, mixed-entry
PostgreSQL races, old-revision fence, and reviewed candidate SHA.

Helper delivery evidence is its task-scoped commit, normal remote push, PR, and
candidate lifecycle record. Parent progress links this artifact and helper PR;
parent remains blocked pending routed recovery execution and its own gates.
