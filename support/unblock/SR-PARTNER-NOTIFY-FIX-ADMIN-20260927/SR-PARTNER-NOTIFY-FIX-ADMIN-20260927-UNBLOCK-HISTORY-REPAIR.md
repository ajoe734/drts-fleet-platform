# SR-PARTNER-NOTIFY-FIX-ADMIN-20260927 history recovery

Audit: 2026-09-27 UTC. Helper owner: Codex. Reviewer: Codex2.
Parent owner/reviewer remain Gemini/Codex. This helper documents and verifies
the non-destructive recovery path; Gemini owns the remaining product repairs.

## Exact failure and preserved history

After `git fetch origin`, the integration base and clean successor both resolve
to `585087a2fd8114eaac0eb8a470dfca58e13dfbe4`. The original local branch
`gemini/sr-partner-notify-fix-admin-20260927`, its origin tracking ref, and
[PR #2184](https://github.com/ajoe734/drts-fleet-platform/pull/2184) all resolve
to `db7925251a8ac1ca68f64f1162710ea06ce8a92b`. Local/remote symmetric commit
counts are `0 0`; the PR is open. There is no observed local/remote divergence.

The original range contains these three commits in order:

| Commit                                     | Result from the production trailer checker                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `aab0fab6ce0e7ce7a878e5aae5355271e3d909e2` | Valid task subject and all three trailers                                                                          |
| `277ffe12a274c1a17d33f8849f80f4953ab297c7` | Invalid subject `fix(control-plane): restore x-tenant-id in JWT mode and add regression tests`; missing `Reviewer` |
| `db7925251a8ac1ca68f64f1162710ea06ce8a92b` | Invalid subject `docs: update SR-PARTNER-NOTIFY-FIX-ADMIN-20260927 test evidence`; missing `Reviewer`              |

`tools/ci/git/check_commit_trailers.py::commits_in_range` scans every non-merge
commit in the range and `validate_message` validates each subject and required
trailers. The local full-range command exits **1**, reporting exactly the last
two commits. The same failures appear in the completed
[Commit trailers job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36358916516/job/108732044830).
Appending a valid commit, reverting content, or merging trunk cannot remove
those ancestors from this PR's validation range.

At this audit, `git worktree list --porcelain` maps the parent's existing
`gemini-sr-partner-notify-fix-admin-20260927` worker directory under
`.artifacts/worktrees/auto/` to
`gemini/sr-partner-notify-fix-admin-20260927-successor`. Its status is clean at
the base above; no successor remote ref or PR was found. The original branch
remains preserved at the old candidate. The helper stayed in its separately
assigned `codex/sr-partner-notify-fix-admin-20260927-unblock-history-repair`
worktree throughout; no parent files, refs, or worktrees were changed.

## Recovery proof

The Supervisor's final recovery instruction in the parent's `task_spec_ref`
already authorizes the successor and preserves the seven-file net patch under
the canonical root's
`.local/qa-worker-recovery-20260927/successor-preserved-admin/owned-net-diff.patch`.
That file is byte-for-byte equal to:

```bash
git diff --binary 585087a2fd8114eaac0eb8a470dfca58e13dfbe4 \
  db7925251a8ac1ca68f64f1162710ea06ce8a92b
```

Patch SHA-256:
`f1cba2611e9a358b97b61395f69f3d1e5a88b56672749a24d8fcb9ee0212cf10`.
Its entire scope is:

- `apps/api/src/modules/multi-taxi/multi-taxi.repository.ts`
- [apps/api/tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts (old candidate)](https://github.com/ajoe734/drts-fleet-platform/blob/db7925251a8ac1ca68f64f1162710ea06ce8a92b/apps/api/tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts)
- `apps/platform-admin-web/app/control-plane-proxy/[...path]/route.ts`
- `apps/platform-admin-web/lib/translations.ts`
- `packages/control-plane-auth/src/index.ts`
- [tests/unit/system-remediation/sr-partner-notify-fix-admin-20260927/tenant-auth.test.ts (old candidate)](https://github.com/ajoe734/drts-fleet-platform/blob/db7925251a8ac1ca68f64f1162710ea06ce8a92b/tests/unit/system-remediation/sr-partner-notify-fix-admin-20260927/tenant-auth.test.ts)
- [docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-FIX-ADMIN-20260927.md (old candidate)](https://github.com/ajoe734/drts-fleet-platform/blob/db7925251a8ac1ca68f64f1162710ea06ce8a92b/docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-FIX-ADMIN-20260927.md)

The three linked files exist in the pinned old candidate and have not landed
on the helper's base; the links deliberately identify that source version.
All seven paths are in the parent's recorded write scopes; the diff is 208
insertions and 5 deletions. `git apply --check` against the clean base exits 0.
An isolated `GIT_INDEX_FILE` under the helper's `.local/admin-history-repair/`
was loaded with `git read-tree` at the base, then checked and populated with
`git apply --cached`. `git write-tree` produced
`23f1a9c635d4b02d27275765a22c4fae066aa9f2`, exactly equal to the old candidate's
tree. This proves complete content recovery without importing invalid ancestry.
It does not establish product correctness. Apply reports 13 whitespace lines;
`git diff --check BASE OLD` exits **2**. Owner must clean these in the successor.

The proof can be repeated without touching a worktree index (use a new local
index path each run):

```bash
BASE=585087a2fd8114eaac0eb8a470dfca58e13dfbe4
OLD=db7925251a8ac1ca68f64f1162710ea06ce8a92b
mkdir -p .local/admin-history-repair
git diff --binary "$BASE" "$OLD" > .local/admin-history-repair/replay.patch
# A subshell keeps the alternate index isolated from subsequent git commands.
(
  export GIT_INDEX_FILE="$PWD/.local/admin-history-repair/replay.index"
  test ! -e "$GIT_INDEX_FILE" || exit 1
  git read-tree "$BASE" &&
    git apply --cached --check .local/admin-history-repair/replay.patch &&
    git apply --cached .local/admin-history-repair/replay.patch &&
    test "$(git write-tree)" = "$(git rev-parse "$OLD^{tree}")"
)
python3 tools/ci/git/check_commit_trailers.py --base "$BASE" --head "$OLD"
# Expected exit 1, exactly the two invalid commits above.
git diff --check "$BASE" "$OLD"
# Expected exit 2; whitespace remains in the recovered source.
```

Raw local results are in the helper worktree's
`.local/admin-history-repair/recovery-proof.json`, `old-trailers.log`, and
`old-whitespace.log`. Published SHAs, the patch hash, commands, and completed
hosted job links make the substantive evidence reproducible without those
machine-local files.

## Original owner continuation and unresolved findings

1. Reuse the Supervisor-assigned successor worktree. Fetch and inspect current
   successor local/remote refs, worktree status, PR and candidate before applying
   anything: another owner dispatch may already have advanced it. Do not switch
   the canonical root or reapply the patch over owner work. Keep original refs
   and PR #2184 intact. If still clean at the audited base, apply only the saved
   task patch after `git apply --check`. If trunk or successor advanced, reconcile
   only the still-needed net changes. Do not merge/cherry-pick the old history,
   reset, amend, rebase, force-push, or stash design intent.
2. Anchor the recovered task-owned changes immediately using the exact message
   contract in `task_spec_ref`, with subject
   `fix(SR-PARTNER-NOTIFY-FIX-ADMIN-20260927): recover scoped implementation`
   and trailers `Task-ID: SR-PARTNER-NOTIFY-FIX-ADMIN-20260927`,
   `LLM-Agent: Gemini`, `Reviewer: Codex`. Validate the full new range and push
   normally. An anchor is not a candidate. Keep every later commit compliant.
3. Complete **R2**, repeated in adjacent independent reviews of `aab0fab6...`
   and `db792525...` (canonical `worker_outcomes`, 23:25:21Z and 23:36:50Z).
   The second review precisely locates the missing regression boundary:
   - Dates: production `MultiTaxiRepository.listPartnerNotificationDeliveries`
     -> controller success/list envelope -> `deepToSnakeCase` -> real API client
     -> actual panel date render callback. Old raw Date becomes an object and
     fails rendering; five ISO dates and nullable fields must pass. Existing
     repository-only tests do not exercise that chain. Mock DB/fetch boundaries,
     not the serializer or render logic; retain rerunnable old/new evidence.
   - Authority: real Next GET / `applyUpstreamAuth` ->
     `issueControlPlaneRequestAuth` -> real JWT/IAP guard/identity adapter ->
     `TenantPartnerController.listWebhookEndpoints`, which consumes the
     `x-tenant-id` selector. Preserve valid bootstrap/JWT/strict-IAP positives,
     wrong tenant/entry, unauthorized/forged headers, missing/malformed IAP,
     unchanged requests without selection, and mutation/step-up governance.
     Helper-only header/token assertions do not prove the consumer contract.
   - Localization: exercise real `translations.t` for both locales. The existing
     component test mocks `t` as an identity function and is insufficient.
   - Append the adjacent SHAs, original findings, commands, results, mock
     boundaries and PG/browser limitations to the original parent UAT artifact
     listed above. Its old claims of serializer/render coverage are inaccurate.
     Preserve the previously verified DTO, localization and R1 selector fixes;
     this helper does not rerun or upgrade those historical results.
4. Fix the parent's additional concrete CI failure:
   [typecheck job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36358916572/job/108732352803)
   exits 2 with `tenant-auth.test.ts(33,19): TS2532 Object is possibly undefined`.
   Clean the inherited whitespace and run appropriate typecheck and scoped
   regression commands to completion before claiming pass.
5. The completed
   [cross-surface job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36358916572/job/108732352868)
   has E2E022 daily rebuild `expected 3, got 2` (21 other scenarios pass).
   `task_spec_ref` routes this shared failure to
   `SR-CI-E2E022-DATE-BOUNDARY-20260927`; preserve its evidence and do not change
   unowned E2E paths or rerun to hide the date boundary. Old product smoke,
   Smoke acceptance and ci-integ also report failure; recovery does not clear
   them. Fresh candidate CI is required. Incorporate a needed reviewed trunk
   repair by normal merge before locking a new candidate.
6. Require `git diff --check origin/dev HEAD` and
   `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
   to pass over the **entire** successor range. Publish a new numeric PR to
   `dev` referencing #2184; `/pull/new/...` is not a PR. Verify full local SHA =
   remote head = new PR head, then hand off with that `CANDIDATE_SHA`,
   `CANDIDATE_BRANCH`, and `PR_URL`. Await fresh independent review/CI and the
   three parent acceptance keys. Hosted C205 remains parent QA work.

## Acceptance and delivery evidence

| Finding / acceptance                                | Source / repair boundary                                                                              | Old result -> recovery result                                                                          | Verification / evidence                                                                                                                                        | Remaining limitation                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Identify exact contamination (R3)                   | Production `commits_in_range` / `validate_message`; three-commit PR range                             | Two invalid published messages reproduced; no branch divergence                                        | Full-range checker exit 1; hosted Commit trailers failure; `rev-list --left-right --count` = `0 0`                                                             | Old PR remains invalid and must not be merged                                                               |
| Non-destructive repair path                         | Seven scoped files; Operator-authorized clean successor                                               | Original tree -> identical isolated-index tree `23f1a9c...`                                            | Saved patch byte equality; apply check exit 0; tree equality exit 0                                                                                            | Owner must import/reconcile and finish R2; whitespace exit 2 remains                                        |
| Canonical helper change has commit/push/PR evidence | This single report on the assigned helper branch                                                      | Documentation-only candidate                                                                           | Full helper SHA / branch / numeric PR are recorded together in canonical handoff; helper full-range trailer and whitespace checks required before it           | Review, CI and merge remain candidate lifecycle gates                                                       |
| Parent concrete next step                           | Live parent `execution_branch`, `task_spec_ref` final recovery section, canonical `next`              | Operator already changed parent to `todo` at 23:44:46Z with successor recovery and new-PR instructions | Helper attempted canonical parent `note`; exit 1: `Dispatched worker cannot mutate a different task`. Own `progress` exit 0 records findings and relay request | Supervisor must relay the additional R2/TS2532/evidence note; this worker does not bypass dispatch identity |
| Preserve outstanding product acceptance             | `delivery_dates_renderable`, `tenant_picker_server_authority_preserved`, `accepted_unknown_localized` | Prior review evidence retained, not represented as new execution                                       | R2 boundaries and hosted failures above                                                                                                                        | No product tests, PG, browser, deployment or acceptance run by this documentation helper                    |

The parent note rejected by the dispatch guard was not written. Its existing
Operator-authored recovery instructions remain valid. Supervisor should use the
authorized current-release `ai-status.sh note SR-PARTNER-NOTIFY-FIX-ADMIN-20260927`
to link this report and relay: **reuse the configured successor; recover the
seven-file net patch, finish R2 and TS2532, clean whitespace, validate the full
new range, normal push, new numeric PR, fresh candidate**. Keep the parent's
current lifecycle and original owner; do not reset an active candidate or claim
product acceptance from this helper. The relay request is also in the helper's
canonical progress/handoff so it is visible to Supervisor.

A subsequent live parent readback shows `in_progress`, still owned by Gemini
on the configured successor, with `next: Applying patch and implementing missing
tests.` The original owner has resumed implementation. This observation does
not imply the additional helper note was delivered or that R2 is fixed.

Helper verification: the initial report commit `91fd8f9c5081c128da95f8b3dd7760a082939dfe`
passed full-range trailer, whitespace and Prettier checks, but canonical
consistency exited 1 because it interpreted the three old-only source files as
local citations. This follow-up pins those citations to their actual published
candidate. Each linked blob was checked with `git cat-file -e OLD:path`; the
final report is rechecked with full-range trailers, `git diff --check`, Prettier
and canonical consistency before handoff. The initial commit remains preserved.

All checks started by this helper are completed before handoff. No project
server, browser test server, Docker infrastructure or deployment was started.
