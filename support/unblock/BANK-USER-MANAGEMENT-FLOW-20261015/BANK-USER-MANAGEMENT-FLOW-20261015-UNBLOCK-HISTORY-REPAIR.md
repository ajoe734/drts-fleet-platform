# BANK-USER-MANAGEMENT-FLOW-20261015 — preserved-history recovery

Helper: `BANK-USER-MANAGEMENT-FLOW-20261015-UNBLOCK-HISTORY-REPAIR`

Owner / reviewer: Codex / Codex2

Audit date: 2026-10-15 UTC

## Current disposition — parent completed; helper report review remains

The original parent is now **`done`**, with its four required Source acceptance
records. This supersedes this report's earlier replay instructions and R1's
request for a blocked-parent disposition. Resume only this existing report's
Codex / Codex2 lifecycle; do not replay or reopen the completed product task.

Fresh bounded `ai-status.sh show` evidence saved for this resumption records:

- Parent candidate / reviewed SHA:
  `41d7c498e0ef1a47e66eb3ddacf8106abb6131af`, generation
  `8a12a943074b4cb5bae05d525b54bcb8`, matching CI `success`.
- Replacement [PR #2660](https://github.com/ajoe734/drts-fleet-platform/pull/2660)
  merged as `2c36cad43376f848bd2a7edc06e27369c060c819`;
  `merge_reachability: verified` in the parent record.
- Required records: `bank-users_verified-principal-and-command-binding`,
  `bank-users_management-mutations-and-readback`,
  `bank-users_identity-role-denial-regressions`, and
  `bank-users_exact-candidate-validation`. Each records that same candidate,
  generation, review and merge identity. These are existing parent records,
  not new product acceptance supplied by this helper.

The Supervisor's historical context append to the parent was independently
qualified with 115 passing checks. The current parent NEXT is its later normal
acceptance summary; its read dependencies retain the safe-action evidence path.
The historical append is evidenced by the locked before/after qualification,
not by claiming that text still occupies the latest NEXT. The helper resumption explicitly
supersedes the old demand to write `resolved_parent_status: blocked` and replay
instructions. Those historical disposition writes were **not performed**, and
are no longer requested. No `resolved_parent_*` metadata or fabricated resolution
timestamp is needed for this report revision. The parent's full NEXT, R7,
candidate/generation and all acceptance evidence must remain intact.

The active release's `ai_status.py:apply_unblock_parent_resolution` returns
before any parent write when the parent is not `blocked` (lines 1116–1118).
This is a current-state guard, not a permanent promise that helper completion
can never affect a later blocked parent. **At actual helper completion,
Supervisor must freshly check the parent within the normal completion
transaction. If a new blocker exists, preserve it and route fresh Supervisor
coordination instead of allowing the default `todo` resolution.** This report
does not implement that coordination or claim it already happened.

Preserved baseline: helper candidate
`e40dc6a6849235f7caa1cabcc3e8cd5832965998`, PR #2658, original report SHA256
`04d9f07447c57db8dbcc4b40e9c1881737bb733fbdc8bf37c0b4fc984d27406c`.
That committed report and the original Codex/Codex2 work remain historical
evidence. The sections below retain the original diagnosis and recovery plan;
their past observations are not current instructions to redo product work.

## Historical diagnosis and authority

The integration blocker was three invalid **published ancestor subjects**, not
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

The original report recorded the following machine-specific attachments under
`.local/bank-history-repair/`. They were not present at this resumption and are
not claimed newly recovered or revalidated; retain their recorded identities
alongside the immutable original report:

- `parent-snapshot.json`: bounded parent slice, including full latest review.
- `old-trailer-check.log`: expected failure, SHA256 `167673b620e5ccd2c1cc4237e0ca5150991ecb657b69c1763c26a05514f53dc7`.
- `original-task.patch`: SHA256 `14d2e314295813019aa50e27582bc43b2adcbad754288c1cba4d39d031a851c4`.
- `scope-and-apply-audit.json`: 15 scopes, 21 files, zero outside scope, apply check exit 0.
- `patch-check.log`: explicit apply-check exit code; `pr2646.json`: live PR/check snapshot.

## Historical original-owner recovery plan — completed by the parent

The following was the original actionable R7 recovery path. Parent completion
above supersedes its pending-work wording, including step 5's four outstanding
keys; retain it for provenance only.

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

| Finding / acceptance              | Source and change boundary                                                                       | Old → current result                                                              | Command / evidence and exit                                                             | Unverified / next gate                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Identify exact contamination / C1 | Actual workflow `commit-trailers`; checker `SUBJECT_RE`; three published ancestor subjects above | Old final checkpoint still fails exactly 3 commits                                | Whole-range checker above, exit 1; local log and hosted failed job linked above         | Successor source range must pass after owner replay                            |
| Non-destructive repair path       | Accepted R7; existing successor; no product or old ref mutation by helper                        | Original 21-file diff inside 15 scopes; fresh-base patch check passes             | Scope audit and `git apply --check`, exit 0 at `afbcbba5...`                            | Product behavior and hunk preservation must be revalidated on actual successor |
| Task-scoped commit/push/PR        | This helper changes only this artifact                                                           | Helper delivery follows ordinary commit/push/PR                                   | Exact helper candidate/branch/PR recorded by lifecycle handoff; delivery evidence below | Independent Codex2 review and hosted helper CI/merge                           |
| Parent concrete next step / R1    | R7 recovery above; current Supervisor resumption and active resolver lines 1116–1118             | Parent now `done`; all four keys recorded; obsolete blocked disposition withdrawn | Fresh bounded parent slice; independently qualified Supervisor parent context append    | Helper review/CI/protected merge and fresh atomic parent check at completion   |

This is a documentation-only helper. Product unit/runtime/provider/PG/browser
tests were not launched or credited here; the parent owns those applicable
checks. No VM service or deployment was started. The current completion guard
above replaces the obsolete blocked-disposition proposal below; this helper
does not revoke or reopen any parent progress or acceptance.

## Helper delivery evidence

- Task-scoped anchor `eb485f141` was committed and normally pushed on
  `codex/bank-user-management-flow-20261015-unblock-history-repair`.
- Helper PR: [#2658](https://github.com/ajoe734/drts-fleet-platform/pull/2658),
  base `dev`. The final handoff pins the subsequent closeout SHA to this PR
  after checking local, remote and PR-head equality.
- The attempted release CLI `assign` transaction for helper disposition exited
  1: `Dispatched workers must use their assigned task lifecycle commands`.
  No metadata or parent note was written. The same guard explicitly forbids
  mutating a different task, so no parent-note attempt or fence bypass followed.
- Final content checks use `pnpm exec prettier --check` on this file,
  `git diff --check`, and the actual whole-range commit checker. No new
  product tests are appropriate for this one-file report. Hosted helper CI
  and independent review remain lifecycle gates after handoff.

## R1 reconciliation and current report delivery boundary

Codex2 reopened original candidate `e40dc6a6849235f7caa1cabcc3e8cd5832965998`,
generation `84db201e8cfb46ab98d62d6715bf518b`, at `2026-10-15T11:08:59Z`.
R1 (P1) identified absent parent-update evidence and the resolver's unsafe
default `todo` when a parent is blocked at helper completion. The original
proposal was a Supervisor parent note plus helper `blocked` disposition with
scoped r2 replay instructions. Worker `assign` was rejected, and cross-task
mutation was forbidden; no bypass or retry was performed.

The Supervisor later rejected that disposition as an unsafe durable future
instruction, appended historical report context without changing parent
progress, and resumed this helper after the parent actually completed. Thus
R1's original two writes are not retroactively claimed fulfilled: the parent
context obligation has newer canonical evidence, while the obsolete replay
disposition is explicitly superseded. The underlying later-blocker concern is
retained by the fresh atomic completion guard above, not declared eliminated
by today's `done` snapshot.

| Finding / acceptance                              | Evidence and substantive report change                                                                                                           | Verification / remaining limit                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| R1 absent parent context                          | Original R1 retained here; Supervisor historical parent NEXT append independently qualified; current parent retains the evidence read dependency | Locked before/after qualification proves historical append; current NEXT is later acceptance summary; no worker parent write              |
| R1 obsolete blocked/replay disposition            | Current disposition and historical recovery heading replace the old imperative                                                                   | Content review against latest Supervisor resumption and active resolver; no stale metadata written                                        |
| Identify contamination and non-destructive repair | Original three rejected subjects, proper-base patch audit, R7, old refs and PR #2646 retained above                                              | Re-run old whole-range checker as an expected failure; original local attachments are historical references, not newly recovered evidence |
| Task-scoped delivery                              | Substantive one-file revision on existing helper branch and PR #2658                                                                             | New pushed full SHA, report hash and handoff generation recorded through normal lifecycle; old candidate CI is not new-candidate CI       |
| Preserve future parent blockers                   | Active resolver returns for nonblocked parent; actual completion must recheck under normal transaction                                           | Supervisor completion coordination remains required if parent changes; no permanent no-parent-write guarantee claimed                     |

Resumption evidence is in this worktree's
`.local/bank-history-repair/resumption/`, including before/after bounded task
slices and completed check logs. Supervisor evidence (absolute paths):

- `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1114-internal-functional-root/Bank-existing-history-helper-Supervisor-only-safe-next-action.json`
- `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1114-internal-functional-root/independent-normal-existing-Bank-parent-helper-safe-context-qualification.json`
- `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1114-internal-functional-root/user-question-selected-original-tasks-actual-readonly.json`

Applicable local checks are report formatting, diff whitespace, original-report
and R7 hash continuity, canonical context/acceptance identity readback, and the
whole actual helper commit range. Product runtime/PG/browser checks are not
applicable to this report-only revision. New-candidate independent Codex2 review,
hosted CI and protected merge remain required. This revision is neither helper
approval nor merge nor DONE and grants no new product or live acceptance.
