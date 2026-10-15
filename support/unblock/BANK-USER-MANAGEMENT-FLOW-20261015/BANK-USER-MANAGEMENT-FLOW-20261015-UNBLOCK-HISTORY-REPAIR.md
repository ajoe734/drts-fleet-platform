# BANK-USER-MANAGEMENT-FLOW-20261015 — preserved-history recovery

Helper: `BANK-USER-MANAGEMENT-FLOW-20261015-UNBLOCK-HISTORY-REPAIR`  
Owner / reviewer: Codex / Codex2  
Audit date: 2026-10-15 UTC

## Result and authority

The integration blocker is three invalid **published ancestor subjects**, not
uncommitted work or a local/remote split. A valid follow-up head cannot repair
the whole-range Commit trailers gate. Preserve the original branch and PR
#2646, and replay only the parent-owned diff as new valid commits on the
Supervisor-authorized successor. This helper documents and checks that path;
the original parent owner performs the product replay and validation.

The parent was already `todo` when inspected: Supervisor R7 had resolved its
branch-disposition request at `2026-10-15T11:01:18Z`. Both dependencies are
`done`: statement/contract candidate `bbd829c564b7c781d6fb91bf0cbff7362753a25f`
merged as `a64749b436f2d9ca96c69c80f918e663fa6e8755`; the authority decision
is a noncanonical report with `not_applicable` candidate/merge identity.

Authoritative R7 recovery specification:
`/home/lupin/workspace/drts-fleet-platform/.local/pi-dev-completion-20261015T0921/BANK-USER-MANAGEMENT-FLOW-20261015-R7-preserved-history.json`,
SHA256 `6813e332167383ceeb396497c9a64c23896ebfbe8683746e7ab2a9c222d7d9ac`.
This report follows that existing authorization; it does not expand source scope.

## Exact refs, worktree and contamination

| Evidence                                 | Observed identity / result                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserved local and remote parent branch | `codex/bank-user-management-flow-20261015` and `origin/codex/bank-user-management-flow-20261015` both at `55f2c913906dbf9c597798e2c279a67769661fc5` |
| Preserved PR                             | [#2646](https://github.com/ajoe734/drts-fleet-platform/pull/2646), OPEN, base `dev`, head `55f2c913906dbf9c597798e2c279a67769661fc5`                |
| Fresh fetched integration base           | `origin/dev` at `afbcbba5de66f7ce0099ae9e3d92790d45f69028`                                                                                          |
| Proper original task merge base          | `a64749b436f2d9ca96c69c80f918e663fa6e8755`                                                                                                          |
| Branch distance                          | `git rev-list --left-right --count origin/dev...55f2c913906dbf9c597798e2c279a67769661fc5` → `6 12`                                                  |
| Successor branch already provisioned     | `codex/bank-user-management-flow-20261015-r2` at `afbcbba5de66f7ce0099ae9e3d92790d45f69028`, clean, no successor PR at audit                        |
| Successor worktree                       | `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-user-management-flow-20261015`                                      |
| Helper worktree                          | Dispatch-assigned `.../auto/codex-bank-user-management-flow-20261015-unblock-history-repair`; helper branch remains isolated                        |

The three rejected subjects are:

| Full published SHA                         | Subject                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `d166e4fdff78b6f53987a56172b52d65cf9aaa20` | `fix(bank-users): connect managed entry and account logout lifecycle`     |
| `17b59e741fec7b5c68420b7b38b4a638bdcfb783` | `feat(bank-users): complete canonical staff commands and scoped readback` |
| `b37b478796e41738698e88df678e5cec087c0107` | `fix(bank-users): cancel pending managed login on explicit sign-out`      |

All three have the required trailers. Their lowercase scope fails
`tools/ci/git/check_commit_trailers.py:SUBJECT_RE`, which requires the uppercase
Task-ID subject pattern. `.github/workflows/ci.yml`, job `commit-trailers`,
checks **every nonmerge commit** in `origin/dev..HEAD`. The final valid
`55f2c9139` subject therefore still leaves exactly these three errors.
The local reflog and 12-commit parent range show ordinary checkpoint/fix
commits; this audit found no duplicate rebase rails requiring reconciliation.

Independent Codex2 review reopened `b37b478796e41738698e88df678e5cec087c0107`
(generation `3679b7bd890346b29e81b984189e711f`) for C1 subject failures and C2
inline locale copy. The original UAT at checkpoint `55f2c9139` retains B1/B2/B3,
C1/C2 and their evidence. C2 was subsequently repaired in `c1b8744e4`; at the
final old head both hosted i18n jobs passed, while
[Commit trailers still failed](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38722751941/job/116381260146).
Other old-head jobs were pending at snapshot time; no aggregate green claim.
Historical unit/typecheck results are evidence for their own SHAs, not a
replacement-candidate approval.

## Reproducible diagnosis and bounded replay check

Run in the helper worktree (all commands are socket-free):

```sh
git fetch origin
git merge-base origin/dev 55f2c913906dbf9c597798e2c279a67769661fc5
python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head 55f2c913906dbf9c597798e2c279a67769661fc5
git diff --name-only a64749b436f2d9ca96c69c80f918e663fa6e8755 55f2c913906dbf9c597798e2c279a67769661fc5
```

The actual checker exited **1**, naming precisely the three subjects above.
The diff contains 21 files, all within the parent's 15 current write scopes
(directory scopes cover multiple files). No extra translation-catalog scope
is required: the old fix uses owned `app/users/translations.ts`.
The lockfile diff adds only the three-line `@drts/tenant-auth` workspace entry
under the Bank importer. Do not replace the whole lockfile.

The old task patch was generated from the proper merge base, not by comparing
two complete unrelated trees. `git apply --check` against the fresh
`afbcbba5de66f7ce0099ae9e3d92790d45f69028` checkout exited **0** without applying
or changing product files. This proves context applicability at that base,
not behavioral correctness or applicability after a later trunk change.

Machine-specific evidence is under this helper worktree's
`.local/bank-history-repair/`:

- `parent-snapshot.json`: bounded parent slice, including full latest review.
- `old-trailer-check.log`: expected failure, SHA256 `167673b620e5ccd2c1cc4237e0ca5150991ecb657b69c1763c26a05514f53dc7`.
- `original-task.patch`: SHA256 `14d2e314295813019aa50e27582bc43b2adcbad754288c1cba4d39d031a851c4`.
- `scope-and-apply-audit.json`: 15 scopes, 21 files, zero outside scope, apply check exit 0.
- `patch-check.log`: explicit apply-check exit code; `pr2646.json`: live PR/check snapshot.

## Concrete original-owner next step

1. Continue the existing successor worktree above, using R7's supported
   task-local `execution_branch`. Recheck its status and any active candidate
   before editing. Do not switch the canonical root, recreate/reset the
   existing branch, or move the helper onto the product branch.
2. Fetch and inspect current `dev`, successor refs and PRs. Reconstruct the
   original task diff from `a64749b4...55f2c9139`, restricted to the current 15
   scopes in `ai-status.sh show BANK-USER-MANAGEMENT-FLOW-20261015`. Preserve
   accepted statement/read-model fixes and concurrent trunk changes. If the
   base is still `afbcbba5...`, the checked patch applies; otherwise repeat
   applicability and hunk review. Never restore the old full tree/lockfile,
   merge the invalid ancestors, or cherry-pick them with unchanged subjects.
3. Retain the original UAT findings and before/fixed evidence. Requalify
   task-owned source/test blob identity and rerun the parent Source suite,
   Bank app suite, impacted TypeScript/lint/format and `pnpm i18n:guard`.
   Preserve R3–R6 auth, lock importer, entry/logout and legacy-test bounds.
   Repository checks are allowed here; product/preview/browser/E2E/Compose
   servers remain prohibited on this VM.
4. Create substantive new commits with subjects such as
   `BANK-USER-MANAGEMENT-FLOW-20261015: replay verified staff management`, plus
   `LLM-Agent: codex`, original `Task-ID`, and `Reviewer: Codex2` trailers.
   Run `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
   over the **whole actual range** before ordinary push. A passing HEAD-only
   check, empty metadata follow-up, bypass, amend, rebase or force-push cannot
   substitute for this recovery.
5. Publish the replacement PR to `dev`, cross-link #2646 and preserve all old
   refs/evidence. Only after the replacement exists, supersede the old PR
   without deleting its branch. Handoff the actual full new SHA/branch/PR to
   original reviewer Codex2; new generation, same-SHA CI and protected merge
   are required. All four original machine acceptance keys remain outstanding.

## Finding / acceptance evidence mapping

| Finding / acceptance              | Source and change boundary                                                                       | Old → current result                                                        | Command / evidence and exit                                                             | Unverified / next gate                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Identify exact contamination / C1 | Actual workflow `commit-trailers`; checker `SUBJECT_RE`; three published ancestor subjects above | Old final checkpoint still fails exactly 3 commits                          | Whole-range checker above, exit 1; local log and hosted failed job linked above         | Successor source range must pass after owner replay                            |
| Non-destructive repair path       | Accepted R7; existing successor; no product or old ref mutation by helper                        | Original 21-file diff inside 15 scopes; fresh-base patch check passes       | Scope audit and `git apply --check`, exit 0 at `afbcbba5...`                            | Product behavior and hunk preservation must be revalidated on actual successor |
| Task-scoped commit/push/PR        | This helper changes only this artifact                                                           | Helper delivery follows ordinary commit/push/PR                             | Exact helper candidate/branch/PR recorded by lifecycle handoff; delivery evidence below | Independent Codex2 review and hosted helper CI/merge                           |
| Parent concrete next step         | R7 remains the parent authority; helper note references this artifact                            | Parent already resumed to `todo`; owner can proceed on existing r2 worktree | Release CLI `note`, preserving parent status; helper disposition metadata               | No source acceptance, merge or automatic resolution of later parent blockers   |

This is a documentation-only helper. Product unit/runtime/provider/PG/browser
tests were not launched or credited here; the parent owns those applicable
checks. No VM service or deployment was started. To avoid a later helper merge
silently resuming a newly blocked parent, helper disposition remains `blocked`
for outstanding original-owner implementation/validation; it does not revoke
the Supervisor's already-issued `todo` or R7 authorization.
