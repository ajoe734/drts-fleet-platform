# SR-PARTNER-NOTIFY-QA-20260917 — preserved-history recovery

Audit: 2026-09-27, Codex2. Helper reviewer: Codex.

## Result and delivery boundary

QA-R8 is reproducible: the parent's published PR #2179 contains **18 invalid
commit messages in 72 linear commits**. Its net diff also contains **three
transport/security files outside the parent's six write scopes** (QA-R9).
The current local and remote Codex heads match; there is no local/remote
divergence to repair. An ordinary extra commit or merge of dev cannot repair
the invalid messages already in that PR's ancestry.

This helper documents and verifies a non-destructive successor path. An isolated
Git index successfully applies the **20 QA-scope files** to the audited dev tip,
preserving all 31 files changed by dev since the common base. No parent branch,
worktree, PR, or published commit was changed. The preview is a tree, **not a
commit, candidate, runtime result, or completed parent repair**.

The parent remains blocked on product repairs and all three required acceptance
items. Updating its machine-truth next step was attempted through the supplied
CLI but rejected by the worker's cross-task guard. **Supervisor must persist
the parent note and blocked helper disposition in section 5 before approval or
merge of this helper.** That acceptance item is still outstanding.

## 1. Fixed identities and branch/worktree diagnosis

| Reference                                                | Full SHA                                   | Evidence                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Audited `origin/dev`, helper starting HEAD               | `585087a2fd8114eaac0eb8a470dfca58e13dfbe4` | Fetch and local resolution agree; #2178 is the one newer dev commit                                                        |
| Common base of dev and parent                            | `931eabb0c55b44548d4e8e664c31359cd035b345` | `git merge-base`; also stale local `codex2/sr-partner-notify-qa-20260917`                                                  |
| Local and remote `codex/sr-partner-notify-qa-20260917`   | `3d50ba809825dfb4a5691f85519016af3575eccc` | [Draft PR #2179](https://github.com/ajoe734/drts-fleet-platform/pull/2179), same head, base dev                            |
| Local and remote `gemini/sr-partner-notify-qa-20260917`  | `91b1d4ac122b1373ac7beb05df902cb991b62232` | [Open PR #2175](https://github.com/ajoe734/drts-fleet-platform/pull/2175); ancestor of Codex head                          |
| Local and remote `gemini2/sr-partner-notify-qa-20260917` | `faee900f3c3b523bdb6cf37e612a4b1d29801caf` | [Open PR #2177](https://github.com/ajoe734/drts-fleet-platform/pull/2177); separate three-commit fork from the common base |

`git rev-list --left-right --count <dev>...<parent>` returns `1 72`.
The Codex branch reflog starts at `91b1d4ac...` on 2026-09-27 16:36:28 UTC;
it intentionally inherited the Gemini history, including 17 invalid messages.
The later `6f3a1e36...` adds the eighteenth. No force-push or rebase is inferred
from branch names or an ordinary push.

The separate Gemini2 fork changes six files, including a different E2E/unit
entry point; it does not include the later Codex unit1–unit7 work. It is not a
substitute for recovery of #2179 and must not be merged into the successor
merely because its messages pass policy. Preserve all three PRs and their refs
until the successor's contents and identity are independently verified.

At audit time `git worktree list --porcelain` has **no registered owner worktree
for any of those three parent branches**, nor the stale local Codex2 branch.
Their refs and commit objects still resolve. Supervisor should register a new
isolated successor owner worktree; do not switch/reset the canonical root or
repurpose this helper's assigned worktree. This helper starts clean at dev on
`codex2/sr-partner-notify-qa-20260917-unblock-history-repair`.

The parent's canonical task slice records owner Codex, reviewer Codex2,
`execution_branch=codex/sr-partner-notify-qa-20260917`, `status=blocked`, and
`waiting_for=Gemini`; no current candidate SHA/branch/PR is locked. Its latest
checkpoint is explicitly not a handoff. Product repair children still require
the agy owner / Codex reviewer coordination recorded by the parent.

## 2. Exact failures and minimal reproduction

The production checker is
[`tools/ci/git/check_commit_trailers.py`](../../../tools/ci/git/check_commit_trailers.py),
specifically `commits_in_range`, `SUBJECT_RE`, and `validate_message`.
It validates every non-merge commit in the base-to-head range. The current regex
accepts uppercase task IDs and the enumerated prefixes; `test(...)`, generic
`docs:`, and lowercase `fix(qa)` / `fix(partner)` fail. Required trailers are
`Task-ID`, `LLM-Agent`, and `Reviewer`.

```bash
python3 tools/ci/git/check_commit_trailers.py \
  --base 585087a2fd8114eaac0eb8a470dfca58e13dfbe4 \
  --head 3d50ba809825dfb4a5691f85519016af3575eccc
```

Actual result: **exit 1, 18 failures**. This matches completed
[CI run 36353958340](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36353958340),
[Commit trailers job 108717848740](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36353958340/job/108717848740).
The full failed log was downloaded and read. `subject` below means the exact
immutable commit's subject fails `SUBJECT_RE`; named trailers are missing.

| Invalid published commit                   | Offenses                                        |
| ------------------------------------------ | ----------------------------------------------- |
| `6f3a1e3659417fcafe1ed8566a13f3c0f87654bf` | subject (`test(SR-PARTNER-NOTIFY-QA-20260917)`) |
| `91b1d4ac122b1373ac7beb05df902cb991b62232` | subject; Reviewer                               |
| `678bd4904e289af880cb556f431dc8c77ec8032b` | subject; Reviewer                               |
| `8e9aceed935693b5f62324df96ff442537fb964d` | subject; Reviewer                               |
| `26e246a6114997d1af70c5a8f83c5d705ac3d7e5` | subject; Reviewer                               |
| `90ba0bb45381881dcb3e7f41a4961806da0ff6dd` | subject; Reviewer                               |
| `5dfd0c41d70fea4c33b6046dbfc821acdfc50a19` | subject; Reviewer                               |
| `d18b1c452a2d18c05e6acc74462f15b18970aeba` | subject; Reviewer                               |
| `5377a253b0020bd7617538374be7cc6123af2022` | subject; Reviewer                               |
| `62962c9eb4bc10652c9e8314cc145064fa3c56ff` | subject                                         |
| `5d51260870da20d32740c761f205b404e56b81ca` | subject                                         |
| `9f306bb821dd617c0b19cc33ef80530974dae596` | subject                                         |
| `a2e2be7fa4d7198a84ee91a235773db5c8abe689` | subject                                         |
| `570a74c1847040d797cc1a1db7aad3d009d6d4d5` | Task-ID, LLM-Agent, Reviewer                    |
| `5b46d02b6a397dc81d13fd1a736e31fe9548b21c` | Task-ID, LLM-Agent, Reviewer                    |
| `874163a6a43ee211a7977dff59c28656df1e0d56` | subject; Task-ID, LLM-Agent, Reviewer           |
| `8bbe1073058671538e4166fca8a0b2ed5370b8c2` | subject                                         |
| `bd5caf7f1f5fb67f35f617b9a59f1d582cc57f0a` | subject                                         |

The three out-of-scope paths are:

- `apps/api/src/modules/tenant-partner/partner-notification-https.ts`
- `tests/unit/system-remediation/sr-partner-notify-transport-20260918/https-client.test.ts`
- `tests/unit/system-remediation/sr-partner-notify-transport-20260918/https.test.ts`

Their history is attributable to `b950420f6599f88d89f545635a2a35a8281c3854`,
`62962c9eb4bc10652c9e8314cc145064fa3c56ff`, `5377a253b...`, `5dfd0c41d...`,
and `26e246a61...`. The first introduces the local-HTTP transport exception;
later changes affect the typed client and test environment. At the parent head,
`partnerNotificationHttpsFetch` bypasses public-HTTPS/address checks under
`NODE_ENV !== production && DRTS_ALLOW_LOCAL_WEBHOOKS === true`, selects
`require("node:http").request`, and uses `any` callback annotations. The security
tests pin the flag false / environment production. See the exact
[parent transport source](https://github.com/ajoe734/drts-fleet-platform/blob/3d50ba809825dfb4a5691f85519016af3575eccc/apps/api/src/modules/tenant-partner/partner-notification-https.ts).

[Product smoke job 108717904726](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36353958340/job/108717904726)
fails at that source's line 63:58 with `@typescript-eslint/no-require-imports`.
This is separate from commit formatting. The helper does not approve the
transport exception or remove its security regressions. The hosted QA workflow
depends on controlled local HTTP; simply excluding these three files is not a
claim that the resulting product/hosted tests will pass. R9 needs its authorized
product child or explicit scope coordination before integrated acceptance.

## 3. Verified non-destructive recovery path

Supervisor coordinates the following with the recorded parent owner. All old
refs and PRs remain evidence; no rebase, amend, reset, force push, trailer bypass,
or weakening of CI is needed.

1. Re-fetch and verify the three heads, PRs and canonical candidate state. If a
   newer locked candidate exists, stop and coordinate it rather than racing its
   review. Preserve the old refs. Optional new archive refs must be created
   without overwriting existing refs. Do not delete the three existing PR heads.
2. Route one unused successor branch, for example
   `codex/sr-partner-notify-qa-20260917-recovery-20260927`, and a clean isolated
   owner worktree from the then-current fetched dev. Record `execution_branch`
   via Supervisor's canonical gateway. This helper does not change routing.
3. Export the net patch from common base to the pinned parent head using exactly
   the six authorized scopes below. Apply it to the new owner checkout, inspect
   all conflicts if dev has since changed, and anchor it with valid task trailers.
   This copies the resulting QA work without importing the invalid ancestry.
   Never merge or cherry-pick the old 72-commit rail wholesale into the successor.

```bash
qa_old=3d50ba809825dfb4a5691f85519016af3575eccc
qa_common=931eabb0c55b44548d4e8e664c31359cd035b345
mkdir -p .local/qa-history-recovery
git diff --binary "$qa_common" "$qa_old" -- \
  .github/workflows/tenant-uat-acceptance.yml \
  tools/ci/test_tenant_uat_acceptance_workflow.py \
  tests/unit/system-remediation/sr-partner-notify-qa-20260917/ \
  tests/e2e/system-remediation/sr-partner-notify-qa-20260917/ \
  docs/02-architecture/partner-notification-20260917/04_sources.md \
  docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-QA-20260917.md \
  > .local/qa-history-recovery/qa-only.patch
# Execute these only in the new clean parent successor checkout:
git apply --check .local/qa-history-recovery/qa-only.patch
git apply --index .local/qa-history-recovery/qa-only.patch
git diff --cached --check
git diff --cached --name-only
```

4. Preserve the excluded product patch as reference evidence; route R9 to an
   authorized product owner for typed transport and positive/refusal security
   tests. Coordinate R5/R10/R11/R12 using the existing parent UAT findings. After
   product children are reviewed and merged, merge dev into the successor only
   if necessary, with normal commits/push. Do not replace current dev files with
   a whole-tree copy of the old parent.
5. Compare every recovered QA blob with the pinned source; account for any
   intentional conflict resolutions. Check the complete new base-to-head commit
   range, diff scope, and original finding regressions. Re-run appropriate local
   non-serving checks and existing hosted PG/browser/controlled-receiver gates
   on the new SHA. Preserve all 24 identities, tenant/webhook/restart gates and
   separate real-partner/native-device acceptance. Earlier SHA results cannot
   transfer to the successor.
6. Normal-push the new branch, open one successor PR to dev with links to #2175,
   #2177 and #2179, and record the actual parent candidate only when ready. Verify
   local HEAD = remote head = PR head. Supervisor can mark older PRs superseded
   after evidence is secured; this helper neither closes nor merges them.

### Executed preview, with no checkout/ref changes

Local evidence directory (relative to this assigned helper worktree):
`.local/sr-partner-notify-qa-history-repair-20260927/`.
`audit.py` executes the production checker and uses `GIT_INDEX_FILE` with
`git read-tree <audited-dev>`, `git apply --cached --check`, `git apply --cached`,
and `git write-tree`. It asserts path sets and exact Git blob identities, not
product behavior. It completed with **exit 0**:

- Old full-range production check: exit 1, exactly 18 failures in 72 commits.
- Scoped patch application: exit 0; 20 changed paths, all within the six scopes.
- Recovered 20 blobs: exactly equal to `3d50ba809...`.
- Excluded three blobs: exactly equal to audited dev, with their original changes
  retained separately in `deferred-product.patch` and the preserved old refs.
- All 31 files changed by dev's #2178: exactly equal to audited dev.
- Preview `git diff --check`: exit 0.
- Preview tree: `3bbc4172c8c37e4e47a7fc100bae95460a2ece6f` (not a candidate).
- Prospective canonical parent commit message: production `--single-commit`
  validation exit 0. No parent commit or successor PR was actually created.

`qa-only.patch` SHA-256:
`d1521b11306e89a8d07b004c01a00c7b2c7209105fcd773146cbdc6a71a9dde5`.
`deferred-product.patch` SHA-256:
`6d79c85dc6dc18a9b6f3b173c5d0514c120b7a5be7b41ddcd20b69d383d51cfb`.
The patch recipe above reproduces these bytes from immutable Git objects.
The index and JSON/log evidence are machine-local; this report is the durable
review artifact. Versions: Git 2.43.0, Python 3.12.3, Node 22.23.2, pnpm 10.33.0.

## 4. Existing product findings remain open

The original
[parent UAT unit1–unit7](https://github.com/ajoe734/drts-fleet-platform/blob/3d50ba809825dfb4a5691f85519016af3575eccc/docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-QA-20260917.md)
retains adjacent candidates, call paths, minimal reproductions and boundaries.
This report adds history-repair evidence and does not replace that ledger.

| Finding / required acceptance                                  | Existing evidence and remaining boundary                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| R5 / C205                                                      | Date DTO `{}` / React31, tenant picker authority and translation findings need product repair                |
| R9                                                             | Out-of-scope transport exception, typed HTTP client and security tests need coordinated owner/scopes         |
| R10 / C218                                                     | Production snapshot SQL42P08 needs product SQL and real PostgreSQL regression                                |
| R11                                                            | `createPlatformPartnerEntry` returns before durable persistence; bounded QA readback is not a product fix    |
| R12 / C222                                                     | Foreign history BFF fabricates HTTP200 success; retain legitimate own-history and foreign denial regressions |
| `integrated_controlled_receiver_negative_matrix_same_sha`      | NOT MET; full same-SHA matrix and product fixes remain                                                       |
| `navigation_and_admin_ui_hosted_real_runtime_evidence`         | NOT MET; C205/C222 remain failing                                                                            |
| `existing_webhook_tenant_gates_preserved_and_live_not_claimed` | NOT MET; strict gate incomplete, R9 outstanding; B/C remain SR-LIVE-PUSH-001                                 |

Parent checkpoint JSON and unit7 report record runtime
`84c5d9e3cf499863de0b2838892508b3972e8093`,
[run 36352402864](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36352402864),
21 passed / 3 failed / zero skipped or flaky partner cases, dedicated partner
unit skipped, strict gate failed. These are attributed parent evidence, not
re-executed results of this helper or the preview. The final checkpoint's
[integration run 36353958377](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36353958377)
is successful with main product jobs skipped; its green aggregate is not product
acceptance. No product, database, browser, receiver, deployment or live/device
test was started on this VM for this helper.

## 5. Canonical update required from Supervisor

The supplied release entry point is
`/home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh`.
`AI_NAME=Codex2 <cli> note SR-PARTNER-NOTIFY-QA-20260917 <next-step>` returned
**exit 1: `Dispatched worker cannot mutate a different task`**.
The guard in `TaskBoardCommandExecutor._guard_worker_command` permits this
worker's helper lifecycle only. No guard environment was removed, no different
identity was assumed, and no machine-truth files were directly edited.
Helper `start` and `progress` succeeded and record this outstanding action.

Supervisor must use the same release CLI's normal metadata/assignment gateway
to persist the following on the helper, and `note` on the parent for the same
concrete next step. Preserve existing task ownership/scopes unless separately
coordinating a repair child. Do not manually set `resolved_parent_at`; merge
lifecycle supplies it. The helper's default resolution would otherwise make a
blocked parent todo despite unresolved product defects.

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Gemini",
  "resolved_parent_next": "R8 recovery path verified in support/unblock/SR-PARTNER-NOTIFY-QA-20260917/SR-PARTNER-NOTIFY-QA-20260917-UNBLOCK-HISTORY-REPAIR.md. Preserve PR2175/2177/2179 and heads 91b1d4ac/faee900f/3d50ba809. Route a clean parent successor from fetched dev and import only the 20 QA-scope net-diff files; do not inherit the 18 invalid commits or three transport/security changes. Coordinate agy product children/scopes for R9 and R5/R10/R11/R12 before integrated validation, then normal-push one successor PR and verify local/remote/PR SHA before handoff. All three required_acceptance remain unmet; keep blocked pending routing/product fixes. No live/device claim."
}
```

This is a review-blocking operator action, not an instruction for the reviewer
to edit the parent candidate or impersonate Supervisor. Read back both task
slices after the update; helper completion alone does not establish parent
readiness. Resume parent work only with fresh resolution evidence.

## 6. Acceptance and publication ledger

| Acceptance / finding            | Source and verification                                                             | Old result → current result                                                                 | Outstanding boundary                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Identify contamination (R8/R9)  | Fixed-SHA logs/diffs, refs/PRs, production trailer checker and completed CI log     | 18 invalid messages reproduced; 20 authorized + 3 unauthorized paths identified             | No assertion of product repair                                            |
| Document non-destructive repair | Section 3 patch recipe; local `audit.py` / `preview.json` / `invalid-commits.json`  | Existing rail fails; clean-index import, blob/trunk preservation and whitespace checks pass | Actual successor and new same-SHA product verification remain parent work |
| Task-scoped commit/push/PR      | Only this report is authored on the dispatched helper branch                        | Publication receipt and helper PR record full candidate identity                            | No parent candidate manufactured                                          |
| Parent concrete next step       | Release CLI parent `note` attempt; helper `progress` receipt; section 5 disposition | Parent write rejected (exit 1); helper progress recorded (exit 0)                           | Supervisor must persist note/disposition before helper approval/merge     |
| Parent required acceptance      | Section 4 and original UAT ledger                                                   | All three NOT MET, retained                                                                 | PG/browser/live/device acceptance not executed by helper                  |

The helper uses ordinary commits and normal push. Its final local SHA, remote
head and PR head must match `CANDIDATE_SHA`, `CANDIDATE_BRANCH` and `PR_URL` in
the release CLI handoff receipt. Report checks are formatting, canonical links,
diff scope/whitespace and the full-range commit policy; they do not establish
parent functionality. Any hosted checks triggered by publication remain tied
to this helper's exact SHA.
