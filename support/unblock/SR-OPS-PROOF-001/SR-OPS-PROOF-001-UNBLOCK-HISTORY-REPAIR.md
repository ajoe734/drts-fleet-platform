# SR-OPS-PROOF-001-UNBLOCK-HISTORY-REPAIR

Owner: Codex. Reviewer: Codex2. Inspection: 2026-09-08 UTC.

## Finding

This helper documents a non-destructive replacement-history route. It does not
resume the parent's resource-gated acceptance or modify its published branch.

- Fetched base: `d4f54ef94e059a981bf2be1f7b944e815870e117` (`origin/dev`).
- Parent local and remote branch `codex/sr-ops-proof-001` both point to
  `819f5c9f3027a978d6ec01eab60f05d265ad6d82`.
- Existing parent PR: https://github.com/ajoe734/drts-fleet-platform/pull/1718
  (open, base dev, head matches that SHA).
- Merge base: `1cdaaa5b5e5301de2da0a692c78c4cc29b0c10a9`.
  `git rev-list --left-right --count origin/dev...origin/codex/sr-ops-proof-001`
  returns `19 53`: 53 parent-only commits, including six ancestry merges.
- Repeated rebase/remerge ancestry is visible at `be4749060`, `096c912f1`,
  `5044c955f`, `431022d7a`, `69433ee5f`, and `f631527de`.
  For example, the last merge joins rebased `b7e146d40` with published
  `133bfccd6`. This preserves multiple versions of historical patches.
- The parent UAT document's 18:27 dispatch records an aborted rebase at
  `e2aef3803`: add/add conflicts in the UAT document, shell harness and shell
  tests. That is historical evidence; this helper did not repeat that rebase.
- Actual blocking CI evidence:
  https://github.com/ajoe734/drts-fleet-platform/actions/runs/34263239775/job/102186149825
  rejects six subjects with unsupported `test(SR-OPS-PROOF-001):` prefix:
  `a643a7996330`, `66bdca2bdfa1`, `ca0a0adf0211`, `930702c4c705`,
  `76c4047087a2`, `0a8932ebd5a9`. The local current validator reproduces all six.
  Merge commits themselves are excluded by the validator. Adding trailers to a
  new commit or merging dev cannot repair these existing invalid subjects.

No unrelated file contamination was found in the current net diff: all 11
changed files are under the parent's three write scopes. A path-excluded log
also returns no parent-only commits touching other paths. This is duplicated
ancestry and invalid historical subjects, not evidence of foreign product edits.
`git worktree list --porcelain` shows no registered parent worktree; this helper
is in its assigned clean isolated worktree on the expected helper branch.
Canonical root remains on dev and was not switched or edited.

## Non-destructive repair route for supervisor and parent owner

1. Preserve parent branch/head and PR #1718 as historical evidence. Do not force
   push, reset a shared branch, repeatedly rebase/remerge that ancestry, or
   relax the commit validator. No parent candidate is currently locked.
2. Supervisor assigns a fresh isolated parent workspace and replacement branch,
   proposed `codex/sr-ops-proof-001-history-recovered`, based on freshly fetched
   `origin/dev`. Record this branch override in parent dispatch so automation
   does not send the owner back to the historical branch. Reuse it if already
   present; inspect its worktree/head before making changes.
3. Recheck the parent remote head against the pinned SHA above; if it advanced,
   inspect and preserve the additional work before selecting a new source.
   Inspect current dev's three target paths for concurrent additions. At this
   inspection all three are absent on dev, so a path-scoped snapshot import is
   lossless. If that changes, reconcile explicitly rather than overwrite.
4. In that assigned replacement workspace, import only these paths from the
   pinned parent SHA using `git restore --source=<pinned-sha> --staged --worktree --`
   followed by these three literal path arguments:

   - `tools/system-remediation/ops-proof/`
   - `tests/unit/system-remediation/sr-ops-proof-001/`
   - `docs/04-uat/system-remediation-20260906/SR-OPS-PROOF-001.md`

   Verify the three paths against the pinned source with `git diff --cached
   <pinned-sha> -- <three-paths>` (must be empty), and check the staged file list
   contains only these paths. Preserve existing inventory receipts as historical
   observations; their embedded candidate fields are not new candidate evidence.
5. Immediately anchor the imported design intent with subject
   `wip(SR-OPS-PROOF-001): anchor recovered scoped snapshot` and trailers
   `LLM-Agent: codex`, `Task-ID: SR-OPS-PROOF-001`, `Reviewer: Codex2`.
   This new commit copies the final tree without inheriting invalid commits.
   Ordinary push to the new branch preserves all old shared history.
6. Run `pnpm exec vitest run tests/unit/system-remediation/sr-ops-proof-001`,
   `pnpm exec eslint tests/unit/system-remediation/sr-ops-proof-001`,
   `bash -n tools/system-remediation/ops-proof/ops-proof.sh`, `git diff --check`,
   and `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`.
   Record actual new base/anchor SHA and outcomes in the parent's UAT evidence,
   commit and ordinary push. Prior 35-test results do not substitute for this run.
7. Create a replacement PR against dev referencing #1718 and this artifact.
   Register the new branch/PR through canonical lifecycle; retire the old PR
   only after the replacement is confirmed. Do not merge the old branch into
   the replacement. Parent handoff requires its remaining preparation gates;
   lock the actual final pushed SHA for Codex2 only when those are met.

This route requires supervisor dispatch coordination, not permission to rewrite
history. It is documented rather than executed here because this helper owns
only the repair artifact and must remain in its assigned workspace/branch.

## Verification and remaining gate

Actual helper checks:

| Command / observation | Result |
| --- | --- |
| `git fetch origin` | exit 0 |
| parent refs, worktree list, scoped diff/log | observations above; 11 files, 1534 insertions |
| `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head origin/codex/sr-ops-proof-001` | exit 1; same six invalid subjects as CI |
| `git merge-tree --write-tree origin/codex/sr-ops-proof-001 origin/dev` | exit 0; tree `61d8599d4b8e07c2db0a1145a2a6b4221bb18156`; no ref/worktree mutation; merge alone still retains invalid subjects |
| `git ls-tree -r origin/dev` restricted to parent scopes | exit 0, no entries; snapshot import has no current dev path collisions |

No application code changed or live operations ran in this helper. Parent CI
also reports typecheck, unit and smoke failures; this history diagnosis does
not claim to resolve or attribute those failures. Replacement CI must run anew.

Parent next step: supervisor can now dispatch the scoped snapshot recovery above
without forcing shared history. Keep the parent blocked for the independent
Q-SR-OPS-PROOF-001 boundary/resource receipt gate in merged planning PR #1808:
authorized snapshot and independent manifest, isolated DB/API identifiers,
authenticated workload and applicable cloud authorization coordinated with
Gemini. Neither helper merge grants these inputs nor proves restore/load success.

Helper commit, normal push, PR and exact candidate SHA are recorded through the
current-release ai-status.sh handoff. Review/CI/merge remain candidate lifecycle
work; this document is not parent completion evidence.
