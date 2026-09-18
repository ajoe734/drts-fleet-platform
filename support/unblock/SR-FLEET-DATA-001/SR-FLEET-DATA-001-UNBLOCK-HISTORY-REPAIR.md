# SR-FLEET-DATA-001 history audit and safe continuation

Audit: 2026-09-08. Owner: Codex. Reviewer: Codex2.

## Finding

The historical non-fast-forward blocker is already repaired. Do not reset or
force-push the parent, and do not treat this helper as scope authorization.
The remaining parent blocker is the scope/ordering/detail decision documented
in [the planning helper](SR-FLEET-DATA-001-UNBLOCK-PLANNING-DECISION.md).

After successful fetch, the inspected refs are:

| Ref | SHA |
| --- | --- |
| origin/dev and helper base | f372e4a6a0dd16204ccbd660f23013601357c224 |
| local codex/sr-fleet-data-001 | a56012f0126d0aa6ecb41500adf6294b6a4a1e9a |
| origin/codex/sr-fleet-data-001 | a56012f0126d0aa6ecb41500adf6294b6a4a1e9a |
| previously published parent | 196df659a7a3247da5a10930a162bd6b2d7dc178 |

`git rev-list --left-right --count codex/sr-fleet-data-001...origin/codex/sr-fleet-data-001`
returns `0 0`. Both origin/dev and the previously published parent are ancestors
of a56012f01 (`git merge-base --is-ancestor`, each exit 0).
[PR #1716](https://github.com/ajoe734/drts-fleet-platform/pull/1716) is OPEN against
dev at that same full SHA. At inspection, several checks were queued; passing
canonical consistency and individual checks are not complete CI acceptance.

The worktree inventory has no parent checkout. The assigned helper checkout is
clean on its expected branch. Canonical root is on dev at e81e94b00; it was not
switched or edited. No current parent working-tree contamination is observed.

## Exact historical divergence

The parent reflog records recovery from origin/gemini/sr-fleet-data-001 at
fd9ec34ee9b075dd8e05451f1f22f7f34abe1d68, then rebases onto 70355aba9,
3b60a3757 and f372e4a6a. Rebase changed published commit identities. Ancestry
merges retained the old published patches, causing duplicate patches to be
encountered during the next rebase.

`git range-diff 70355aba9..98bf5563a 3b60a3757..a0927d2e8` confirms four exact
patch/message equivalents:

| Original published | Rebased equivalent |
| --- | --- |
| bfb0a30f9 | daf532fb6 |
| 3ee84f73a | ae208e240 |
| 2ebacdb5c | 562fe7626 |
| 98bf5563a | a0927d2e8 |

`git range-diff 3b60a3757..196df659a f372e4a6a..5e45fadd5` confirms the six
unique patches remain equivalent at 4dadaab03, 3494a829d, 9280e4940, 2a894f660,
97fdb61ec and 5e45fadd5; the four original duplicates are absent from the
rebased sequence. Merge 9a426f64e retained published 98bf5563a; merge 5ed459db9
retained published 196df659a. Each merge has an empty diff against its first
parent, verified directly. These are retained ancestry, not new application
changes. New CSV/query fixes and tests follow at c858642cd and a56012f01.

All commits in origin/dev..parent have the parent Task-ID in their subject.
The final diff has eight files, all within the seven declared parent scopes
(trips and tests are directory scopes). No foreign-task file patch was found.
This evidence supports repaired published-history divergence, not a need to
discard the parent's implementation.

The [parent report pinned to a56012f01](https://github.com/ajoe734/drts-fleet-platform/blob/a56012f0126d0aa6ecb41500adf6294b6a4a1e9a/docs/04-uat/system-remediation-20260906/SR-FLEET-DATA-001.md)
records the earlier rejected push, duplicate-patch rebase recovery, subsequent
successful normal pushes and 19 tests/typecheck. Those product checks are
inherited evidence and were not rerun by this documentation-only helper.

## Concrete non-destructive next step

1. Supervisor/Chairman records the four requested shared page/table/copy scopes,
   acyclic writer ordering and required detail surface/resource visibility from
   the planning helper. Keep CASE after DATA; do not introduce a dependency
   cycle. Parent remains blocked on that decision, not on history repair.
2. Once authorized, dispatch the parent owner into an isolated parent worktree.
   Recheck `git worktree list --porcelain`; reuse any newly assigned parent
   worktree, otherwise add one for existing `codex/sr-fleet-data-001`. Preserve
   a56012f01 and PR #1716. Do not reset to the reconstructed Gemini head.
3. Fetch and check ancestry before updating. At the audited base, no rebase is
   needed. If dev has advanced, prefer an ordinary merge of origin/dev into
   this already-published parent followed by a normal push, preserving remote
   ancestry. This is the non-destructive exception to the routine rebase rule:
   rebasing this published duplicate history recreates the observed failure.
   Resolve only authorized scope; stop and record conflicts outside that scope.
   If linear history is required, supervisor should route a new unpublished
   replacement branch from current dev and replay only unique task patches;
   retain the old branch/PR and obtain fresh validation on the replacement.
4. Implement the remaining authorized work and verify parent tests, typecheck,
   CSV/filter/navigation/detail behavior and resource scope. Record fresh
   base/candidate SHA and actual results. Browser/live/physical-device checks
   remain unperformed; no success is inferred from mocked tests.
5. Commit with parent trailers, normal push, then exact-SHA handoff to Codex2
   with CANDIDATE_SHA, CANDIDATE_BRANCH and PR_URL. Parent review, complete CI,
   merge and acceptance must use that candidate; no owner `done` transition.

## Helper verification and delivery

Fetch and helper rebase exit 0 (already up to date); ref equality, ancestor
checks, worktree/reflog inspection, both range-diffs, empty merge-tree diffs,
scoped parent file diff and live GitHub PR-head inspection completed. No parent
ref, application file or PR was mutated. Only this helper artifact is delivered.

Helper diff, canonical-consistency and trailer checks are run before handoff.
Its task-scoped commit, ordinary push and dev-targeted PR are recorded in
machine truth at exact-SHA handoff. The parent receives a progress note
preserving its blocked state and replacing stale history-repair routing with
the concrete scope/ordering decision above. Helper review/CI/merge remain
candidate lifecycle gates; this report does not claim parent completion.
