# SR-ENV-COPY-001 history repair path

Audit: 2026-09-08 UTC. Owner: Codex. Reviewer: Codex2.
This helper delivers a documented non-destructive recovery path, not the parent implementation.

## Observed refs and contamination

After successful `git fetch origin`:

| Ref | SHA |
| --- | --- |
| origin/dev and helper base | c4c4a35f88907df6bf68e781059dde397c06ba03 |
| local and origin/codex/sr-env-copy-001 | 3a1024973d86fe0bee5e1d5879bcdeca7edf14d3 |
| parent/dev merge base | 6f4ac8c74ae3618b6109efd010014365a85d36d8 |

`git rev-list --left-right --count codex/sr-env-copy-001...origin/codex/sr-env-copy-001`
returns `0 0`. There is no current unpublished divergence or rejected push to repair.
`git worktree list --porcelain` finds no parent checkout. The assigned helper
worktree is clean on its expected branch; canonical root stays on dev (observed
e81e94b00eee0907069a9482a47514bfde62dccb). Other lane refs are not recovery inputs.

The parent history contains 16 commits beyond current dev, including two merges
that retained published ancestry after rebases:

| Merge | Parents |
| --- | --- |
| 5f1c5d02d20d46569f0ca1815fd8508a7239d4e2 | 8a113e3574f5f5e3da020f7f6df1968a891917b7, a480557fde8a27e2313a4e809b4a23e5336e04fe |
| 70cdf38291b0c6f8e4d5e8ad9921549eb58fe33a | e7eebbf2419495dff2ebc4f9aea2f4efbc6d7afa, 48448964e7320ea9dcfdd4605bc9830260f9ad42 |

`git show <sha> --pretty=format: | git patch-id --stable` confirms identical
patches across these replayed groups (abbreviated SHAs resolve locally):

- Initial implementation: 9ee6f587, 13bce75a, 85b3c718.
- Evidence: a480557f, 3ab4c476, 67741860.
- Production correction: 8a113e35, 5e9b3cf4.
- Verification evidence: 30c93d90, 35d4c258.
- Enterprise copy: 48448964, e7eebbf2.

The parent evidence at 3a102497 records repeated add/add rebase conflicts,
abort/retry/skip, then merges of published ancestry to permit ordinary pushes.
Replaying this graph again risks repeating those conflicts; it is not necessary
to rewrite or delete shared history.

The current three-dot diff has 11 files: five translation catalogs (enterprise,
fleet, ops, platform-admin, tenant), three environment-badge source files, the
parent UAT document, the scoped regression file, and
`packages/ui-web/tests/unit/environment-badge.test.ts`. The last file is outside
the parent write scopes. It was introduced by 9ee6f587 and replayed in the
equivalent implementation commits. Its NODE_ENV-only assertion expects
production despite its test title; the corrected resolver returns unknown.
This is the concrete file-scope contamination, separate from duplicate history.

[Existing PR #1738](https://github.com/ajoe734/drts-fleet-platform/pull/1738)
is OPEN against dev at parent head 3a102497. GitHub returned baseRefOid
9f5c81bd53b4930321f7c659a9b27b4bc2fe89c5 and 28 files, whereas the freshly fetched
local comparison has 11. Treat these as distinct snapshots, not proof that all
28 files are foreign parent changes. Returned checks are SUCCESS except skipped
orchestrator-tests, including Commit trailers, Smoke acceptance and ci-integ.
Those checks do not resolve the explicitly reported scope/runtime acceptance gaps.

## Non-destructive recovery and concrete next step

Supervisor should route the parent to a replacement branch/worktree, overriding
the old expected branch in its dispatch. Proposed name:
`codex/sr-env-copy-001-recovered-20260908`. Local exact-ref lookup returned exit 128
(absent); `git ls-remote --heads origin` for that name returned exit 0, no rows.
Recheck before creation; never overwrite an occupied ref.

The owner should execute the following after supervisor routing (not executed
by this helper):

1. Fetch current dev and record its SHA. Create the replacement worktree from
   origin/dev without switching canonical root. Preserve old branch and PR #1738.
2. Generate a binary patch from the pinned parent merge base to the pinned
   parent head, explicitly selecting ONLY the ten authorized files above:
   `git diff --binary 6f4ac8c74ae3618b6109efd010014365a85d36d8 3a1024973d86fe0bee5e1d5879bcdeca7edf14d3 -- <explicit authorized paths>`.
   Save it outside tracked paths, then run `git apply --check` and
   `git apply --index` in the replacement worktree. Do not restore entire old
   files over newer dev, replay every historical commit, or import the legacy
   out-of-scope test. Preserve that test on the old ref for traceability; request
   scope authorization if it must be ported/corrected. If dev now contains it,
   omission from the patch does not authorize deleting it.
3. Inspect conflicts/diff against fresh dev and anchor the scoped recovery
   immediately with Task-ID SR-ENV-COPY-001, LLM-Agent Codex, Reviewer Codex2.
   Any new unrelated scope conflict goes back to supervisor. Push the new branch
   normally. Never force-push or reset the old refs.
4. Resume authorized translation cleanup. Supervisor must separately assign
   runtime wiring scopes/dependencies for ops layout, admin/tenant/fleet shells,
   bank navigation/shell and deployment-value plumbing. Parent acceptance is
   still blocked until runtime-authoritative badges are actually integrated.
5. Rerun `git diff --check`, the scoped Vitest regression, all six app typechecks
   listed in the parent task, and commit-trailer validation. Run the legacy badge
   test if present; record its actual result. Replace historical UAT claims with
   current base/implementation SHA and commands. No old checks transfer.
6. Create a replacement PR targeting dev and link #1738. Once implementation and
   acceptance prerequisites are ready, ordinary push and handoff with
   `CANDIDATE_SHA=$(git rev-parse HEAD)`,
   `CANDIDATE_BRANCH=$(git branch --show-current)`, `PR_URL=<new PR>`,
   `AI_NAME=Codex` and the canonical ai-status.sh `handoff SR-ENV-COPY-001 Codex2`.
   Supervisor may use `resume-blocked` when routing/scope prerequisites are ready.
   Independent same-SHA review, CI and merge remain required; do not call done.

## Validation and helper delivery

Fetch, ref/graph inspection, patch identities, scope comparison and GitHub PR
inspection succeeded. Helper `git rebase origin/dev` exited 0 (already current).
Read-only `git merge-tree --write-tree origin/dev origin/codex/sr-env-copy-001`
exited 0, producing tree 2530dbb9c9ba9e62c9f3ba37acffa143bac5531a without conflicts.
This establishes full-tree merge feasibility at the observed base, not successful
execution of the selective recovery patch on a future dev.

Only this artifact changes. Its commit/push/PR evidence is recorded by helper
handoff and PR metadata. The parent receives the recovery next step through the
canonical status CLI and remains blocked on scope/runtime work. Product tests,
browser/live/device checks, replacement implementation, merge and deployment
were not performed by this documentation helper.
