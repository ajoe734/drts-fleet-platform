# UI17-FLEET-ERROR-20260924-UNBLOCK-HISTORY-REPAIR — evidence

Helper task for parent `UI17-FLEET-ERROR-20260924` (owner Gemini, reviewer Codex).
Scope: branch/worktree/commit contamination only. Product correctness (R1-R3) is
the parent task's own review lineage and is not re-verified here beyond what is
needed to confirm the repaired branch carries it forward unchanged.

## Contamination identified

Two related but distinct issues were found; only the first is "history/branch
contamination" in the strict sense, the second is a pre-existing, separate,
still-open blocker that this task does not attempt to fix.

### 1. Commit-history contamination on the published PR #2128 branch (in scope, repaired)

`origin/gemini/ui17-fleet-error-20260924` (PR #2128 head, `64e81a3b5`) carries an
early ancestor commit `1c91e5c7377d` with subject
`feat(fleet-portal): integrate fleet errors canvas and logic`, which does not
match the required `<TASK-ID>: <summary>` format
(`docs/ops/branch-strategy.md` §5). `tools/ci/git/check_commit_trailers.py`
validates every non-merge commit in `dev..candidate`, not just the tip, so every
later fixup commit on this branch still fails the gate ("R4"), independently
confirmed in three separate reviewer rounds (worker_outcomes
`codex-20260924T072901Z-2aa33f71`, `codex-20260924T081102Z-382af9e7`,
`codex-20260924T082451Z-a178ee6b`) and reproduced again here:

```
$ python3 tools/ci/git/check_commit_trailers.py --base c2d94aaa4 --head origin/gemini/ui17-fleet-error-20260924
::error::check_commit_trailers: 1 commit(s) failed trailer validation.
  commit 1c91e5c7377d:
    - subject must be `<TASK-ID>: <summary>`, got: 'feat(fleet-portal): integrate fleet errors canvas and logic'
exit=1
```

Because this branch is already published and under active multi-round review
(PR #2128), `docs/ops/branch-strategy.md` §11.4 forbids rebasing, amending, or
force-pushing it to fix the ancestor commit.

### 2. Orphaned local branch holding the actual fix (worktree contamination, repaired)

A second local-only branch `gemini/ui17-fleet-error-20260924-v2` (tip
`1ffca47d7`, authored by `Gemini2`, not the task owner `Gemini`) already existed
in the shared canonical `.git` object store (visible from any worktree since
local branches are shared across worktrees on this machine), but had **never
been pushed to `origin`**. It is a single fresh commit rebased onto current
`dev` (`c8c0d8552`) with a compliant subject
`UI17-FLEET-ERROR-20260924: integrate fleet errors canvas and logic`, carrying
forward the same R1/R3 product fixes plus an improved R2 test file — but because
it only existed locally, it was invisible to CI, the reviewer, and the parent
task's candidate lifecycle. The parent task's own blocker note
("The branch history is fixed in gemini/ui17-fleet-error-20260924-v2 ...") refers
to this unpushed local state, which nobody besides the machine that created it
could act on.

Verified before repairing:

```
$ python3 tools/ci/git/check_commit_trailers.py --base c8c0d8552 --head gemini/ui17-fleet-error-20260924-v2
check_commit_trailers: 1 commit(s) OK.
exit=0
```

```
$ git diff gemini/ui17-fleet-error-20260924-v2 origin/gemini/ui17-fleet-error-20260924 -- \
  docs/05-ui/drts-design-canvas/fleet-errors.jsx \
  "docs/05-ui/drts-design-canvas/Fleet Partner Portal.html" \
  docs/05-ui/drts-design-canvas/fleet-portal-missing-scope-screen-requirements-20260808.md \
  apps/fleet-partner-portal-web/app/error.tsx \
  apps/fleet-partner-portal-web/lib/translations.ts \
  tests/unit/ui17-fleet-error-20260924/ \
  docs/04-uat/ui17-handoff-20260924/UI17-FLEET-ERROR-20260924.md
```
→ only the test file differs: `v2` keeps the CSRF/middleware logic tests
identical to the last-reviewed candidate, and *adds* two component-render tests
(`FleetPortalError` mounted via `React.createElement` + `renderToStaticMarkup`,
not JSX, so it does not need root `tsconfig.json` `jsx` support). `error.tsx`,
`translations.ts`, and the design-canvas artifacts are otherwise identical to
the last-reviewed candidate `b186e602f`/`64e81a3b5`.

## Repair applied (non-destructive, no force-push)

1. `git push origin gemini/ui17-fleet-error-20260924-v2:refs/heads/gemini/ui17-fleet-error-20260924-v2`
   — pushed the existing local branch to `origin` **under a new branch name**;
   `origin/gemini/ui17-fleet-error-20260924` and PR #2128 were not touched, no
   rebase/amend/force-push performed. Both refs are now preserved per
   branch-strategy.md §11.4.
2. Opened `https://github.com/ajoe734/drts-fleet-platform/pull/2137` from the
   new branch against `dev`, cross-referencing #2128 and documenting exactly
   what is fixed (R4 history) versus what remains open (see below).
3. Left a cross-link comment on #2128 pointing reviewers/owner at #2137, without
   closing or otherwise mutating #2128.

## Still open — not fixed by this repair, needs Supervisor scope decision

The R2 finding ("committed test suite does not exercise the real component")
has **two** components. History repair only addresses the process/discovery
half; the dependency-resolution half is a pre-existing, orthogonal blocker that
this history-repair task does not have write scope to fix:

- Root `package.json` does not declare `react`/`react-dom` as dependencies, and
  root `node_modules` accordingly has neither installed (confirmed:
  `grep -n '"react"' package.json` → no match; `ls node_modules/react` → not
  found).
- The new test file lives under root `tests/unit/...`, executed by the root
  `vitest.config.ts`/`tsconfig.json` context. Node/pnpm module resolution walks
  up from the importing file's directory; it never reaches
  `apps/fleet-partner-portal-web/node_modules`, where `react`/`react-dom` are
  actually declared and would be installed. Confirmed directly:
  ```
  $ node -e "require.resolve('react', { paths: [require('path').resolve('tests/unit')] })"
  react resolution FAILED: MODULE_NOT_FOUND
  $ node -e "require.resolve('react', { paths: [require('path').resolve('apps/fleet-partner-portal-web')] })"
  react resolution from app dir FAILED: MODULE_NOT_FOUND
  ```
  (second check run before any workspace install; the structural point — no
  hoist pattern in `.npmrc`, so pnpm's per-package isolation would still keep
  `react` out of anything outside `apps/fleet-partner-portal-web`'s own
  `node_modules` after a full install — does not depend on install state.)
- `gemini/ui17-fleet-error-20260924-v2:docs/04-uat/ui17-handoff-20260924/UI17-FLEET-ERROR-20260924.md`
  (that path does not exist on this branch; it is only present on the `v2`
  branch referenced) self-reports
  `pnpm run typecheck: Exit 0` / `pnpm run test:unit ...: Exit 0` for this
  content. That claim is **not independently verified** here and is
  inconsistent with the static `package.json`/`node_modules` evidence above; per
  `AI_COLLABORATION_GUIDE.md` §0.7 a worker's self-reported terminal success is
  not completion evidence. PR #2137's description flags this explicitly so the
  parent task's reviewer (Codex) re-verifies against hosted CI rather than
  trusting the in-branch claim.
- Per the parent task's own last blocker note, resolving this requires
  Supervisor-coordinated scope expansion of the root `package.json` (adding
  `react`/`react-dom`, or an equivalent resolution strategy) — outside this
  helper task's write scope and outside `UI17-FLEET-ERROR-20260924`'s current
  `write_scopes`.

## Concrete next step for the parent task

1. Supervisor/owner: use `gemini/ui17-fleet-error-20260924-v2` (PR #2137) as the
   next candidate for `UI17-FLEET-ERROR-20260924` instead of continuing to patch
   `gemini/ui17-fleet-error-20260924` (PR #2128) — the latter's history can no
   longer pass the commit-trailer gate without a forbidden rewrite.
2. Supervisor coordinates a scope expansion for `UI17-FLEET-ERROR-20260924` (or a
   follow-up task) to allow a minimal root `package.json` change adding
   `react`/`react-dom` (matching the versions already pinned in
   `apps/fleet-partner-portal-web/package.json`) so the real-component test can
   resolve in CI.
3. Once scope is granted, owner re-runs `pnpm run typecheck` / `pnpm run
   test:unit tests/unit/ui17-fleet-error-20260924/` against PR #2137's branch for
   real, updates the UAT artifact with verified (not self-reported) results, and
   proceeds through the normal candidate lifecycle (handoff → review → CI →
   merge).
4. #2128 can then be closed by its owner/Supervisor as superseded by #2137, once
   #2137 is confirmed to carry everything #2128's last-reviewed candidate had
   (verified above) plus the R4 fix.
