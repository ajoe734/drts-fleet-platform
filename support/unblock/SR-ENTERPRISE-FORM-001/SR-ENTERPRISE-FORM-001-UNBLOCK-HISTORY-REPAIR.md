# SR-ENTERPRISE-FORM-001 history repair audit

Audit: 2026-09-08. Helper owner: Codex2. Reviewer: Codex.

## Finding: published divergence was already repaired

After a successful fetch, `origin/dev` and this helper's initial HEAD are
`c4c4a35f88907df6bf68e781059dde397c06ba03`. Both local and remote
`codex2/sr-enterprise-form-001` point to
`b97be8a00ff42bda340e40aa029e3b912b5203fd`.
The parent's local/remote left-right count is `0 0`; current dev is an ancestor
of the parent (exit 0). No present non-fast-forward divergence remains.

The parent reflog records cherry-picking the Claude2 implementation onto
`70355aba9`, rebasing onto `c4c4a35f8`, then merging the previously published
branch. This left duplicate patch identities in the graph:

| Published commit | Rebased commit | range-diff |
| --- | --- | --- |
| `301db089e` | `7c948902f` | `=` placard and reservation review gate |
| `cd42047e9` | `ed0da0225` | `=` i18n and evidence CI repair |
| `a02f14513` | `4a599f324` | `=` invalid calendar date rejection |

`git range-diff 70355aba9..a02f14513 c4c4a35f8..4a599f324` confirms all
three mappings. Reconciliation commit
`8dad406e9ebd16f50a8b36d51c630d2672f9b2a2` has parents
`4a599f324b8c481c9fc2bb76a97b18b87667879a` and
`a02f1451338869662e1bf85fb7ab0057076daca3`.
`git diff --exit-code 4a599f324 8dad406e9` exits 0: reconciliation preserves
the rebased tree exactly. Subsequent anchors `01ed8ba44` and `b97be8a00`
are already published. Duplicate ancestry is not duplicate application of
the patches and does not justify resetting or force-pushing this branch.

`git worktree list --porcelain` finds no active checkout of the parent branch.
The helper remains in its assigned isolated worktree on
`codex2/sr-enterprise-form-001-unblock-history-repair`, initially clean.
The canonical root is on local `dev` at `e81e94b00`; it was not switched or
used as task code. No dirty-tree contamination was observed in the helper;
this audit does not claim other workers' working trees are clean.

## Current blockers and scope contamination

Parent machine truth is `blocked`, owned by Codex2 with reviewer Codex.
Its latest note concerns authorization for the shared theme, rather than
history. Its candidate SHA has not been locked by a handoff.

The net parent diff against dev contains eight files. Seven match current
parent write scopes. The exception is
`apps/enterprise-dispatch-web/lib/translations.ts`: ten added lines defining
three validation messages in both locales. These originate in the inherited
CI repair `cd42047e9` / `ed0da0225`, not the reconciliation merge. The current
scope list does not authorize that file. Preserve the working translations;
supervisor must authorize the shared-file scope and dependency, or route a
separate prerequisite with equivalent messages before removing them from
the parent's diff. A green CI scope check is not proof of task authorization.

The requested theme file, `apps/enterprise-dispatch-web/lib/enterprise-theme.ts`,
is also outside parent write scopes; it has no change in this branch diff.
The parent reports raw blue palette violations there. This helper does not
independently validate the visual finding or broaden scope.

[PR #1722](https://github.com/ajoe734/drts-fleet-platform/pull/1722) is OPEN
against dev with head `b97be8a00ff42bda340e40aa029e3b912b5203fd`.
At inspection GitHub reports `BLOCKED`, Product smoke acceptance is running,
orchestrator-tests is skipped, and all other reported checks are successful.
This is not a merge-conflict diagnosis or completed product acceptance.
Other open task PRs (#1686, #1691, #1709, #1740) belong to older lane branches;
they are not this owner's delivery candidate and should not be merged as
parallel deliveries of the same task. Supervisor should reconcile their
routing after choosing the parent candidate; this helper does not close them.

## Concrete non-destructive continuation

No new product branch or cherry-pick is necessary at the audited refs.

1. Supervisor resolves the translations authorization and theme scope/shared
   design dependency, preserving the parent's remaining review-time expiry
   gate and 390px browser/keyboard/CTA requirements. Then resume the parent
   through the current CLI's `resume-blocked SR-ENTERPRISE-FORM-001 in_progress`
   with a concrete authorization note. Keep the parent blocked until that
   decision; this helper is complete only as a documented history path.
2. Dispatch Codex2 to a parent-only isolated worktree, reusing any existing
   checkout of `codex2/sr-enterprise-form-001`; if absent, use `git worktree add`
   with that existing branch and an unused worktree path. Do not switch the
   canonical root or the helper checkout to perform parent implementation.
3. Fetch and check local/remote equality, clean working tree, and ancestry
   again. At the audited refs the existing branch can continue with ordinary
   task commits and a normal push. Do not cherry-pick either duplicate series
   again. Do not reset, force-push, or stash design intent.
4. If dev has advanced before continuation, follow the rebase protocol on a
   fresh **unpublished replacement** branch rooted at the retained parent
   head, leaving the published branch intact. Supervisor must explicitly
   route that replacement in dispatch. Rebase the unpublished replacement
   onto fetched dev, resolve only authorized files, push normally, and open
   a replacement dev PR linking #1722. This avoids requiring a force push
   after rebasing the already-published parent. If the old remote moves too,
   inspect its new commits before selecting the recovery source.
5. Finish authorized product work and rerun `git diff --check`,
   `pnpm --filter @drts/enterprise-dispatch-web typecheck`, and
   `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/`.
   Record fresh base/candidate and browser/real-device limitations in the
   parent evidence. Commit with parent Task-ID and reviewer Codex, normally
   push, then hand off with actual `CANDIDATE_SHA`, `CANDIDATE_BRANCH` and
   `PR_URL` to Codex. Fresh same-SHA review, CI and merge remain required;
   previous CI or another lane's review cannot substitute.

Historical parent evidence is available at the
[retained parent UAT document](https://github.com/ajoe734/drts-fleet-platform/blob/b97be8a00ff42bda340e40aa029e3b912b5203fd/docs/04-uat/system-remediation-20260906/SR-ENTERPRISE-FORM-001.md).
Its test results are historical, not helper-executed product validation.

## Helper verification and delivery

- Fetch, ref/reflog inspection, range-diff, PR inspection: completed.
- Helper `git rebase origin/dev`: exit 0, already up to date.
- Parent local/remote count: `0 0`; dev ancestor check: exit 0.
- Reconciliation tree comparison: exit 0, no diff.
- Parent `git diff --check origin/dev...origin/codex2/sr-enterprise-form-001`:
  exit 0.
- Read-only `git merge-tree --write-tree origin/dev origin/codex2/sr-enterprise-form-001`:
  exit 0, tree `e2fd481c6727f5cad8ef80d5c5a09b1315a1bbee`, no conflicts.

Only this support artifact is changed by the helper. Task-scoped commit,
normal push, PR and locked helper candidate are recorded in handoff metadata.
No parent refs, product files or old PRs are modified. No product tests,
browser checks, live API operations or real-device acceptance were run here.
The parent receives a canonical progress note retaining its scope blocker
and identifying the concrete continuation above.
