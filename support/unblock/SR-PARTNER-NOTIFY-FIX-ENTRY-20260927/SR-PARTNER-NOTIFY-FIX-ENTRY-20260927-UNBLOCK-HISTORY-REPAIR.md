# SR-PARTNER-NOTIFY-FIX-ENTRY-20260927 history repair

Audit: 2026-09-28 UTC; operator follow-up verified at 02:31:31Z.
Helper owner/reviewer: Codex / Codex2.
Parent owner/reviewer: Gemini / Codex. This helper changes only this report.

**Disposition:** the history defect is reproduced and a non-destructive repair
is rehearsed. Supervisor has completed the routing, scope, dependency and
canonical next-step actions. The parent is now `in_progress` with Gemini on
the existing clean successor / PR #2207. This helper's recorded disposition
is `resolved_parent_status=todo`, `resolved_parent_waiting_for=null`; the former
blocked/Claude request is historical and superseded. The parent may advance
independently. This report is ready for fresh Codex2 review on existing PR
#2212; it does not approve the parent's product findings. No parent refs or
product files were changed by this helper.

## Exact contamination and original routing evidence

The following identity table records the initial audit before the authorized
02:28Z operator action. Pinned commits remain reproducible; live owner refs
may advance and must not be reset to this snapshot.

| Identity                                                                                    | Verified value                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Helper branch                                                                               | `codex/sr-partner-notify-fix-entry-20260927-unblock-history-repair`                                                                                                                                                                            |
| Helper initial HEAD                                                                         | `28d5a1b2d072ade55c74fb0e462f00711596fa25`                                                                                                                                                                                                     |
| Audited fetched `origin/dev`                                                                | `dce571db03d67b6623586501cfb75312ec298826`                                                                                                                                                                                                     |
| Original parent base                                                                        | `585087a2fd8114eaac0eb8a470dfca58e13dfbe4`                                                                                                                                                                                                     |
| Latest rejected parent candidate / generation                                               | `58393f7b8cd1d23c357ac63d586e65595c0a955a` / `f48b10cf30ed4bf0a771343feedca4c6`                                                                                                                                                                |
| Old branch / OPEN [PR #2186](https://github.com/ajoe734/drts-fleet-platform/pull/2186)      | `gemini/sr-partner-notify-fix-entry-20260927`, local = origin = PR head `58393f7b8cd1d23c357ac63d586e65595c0a955a`                                                                                                                             |
| Clean successor / OPEN [PR #2207](https://github.com/ajoe734/drts-fleet-platform/pull/2207) | `gemini/sr-partner-notify-fix-entry-20260927-fix`, local = origin = PR head `e66144dcbb34bc25ba3838de4c52ad24c8bb746a`                                                                                                                         |
| Other preserved OPEN parent PRs                                                             | [#2199](https://github.com/ajoe734/drts-fleet-platform/pull/2199): `-v2` at `6f54cba7cf67c573236ebb704a56231f40c86a0d`; [#2204](https://github.com/ajoe734/drts-fleet-platform/pull/2204): `-v3` at `280b02a556d317256da543a2472a1c1cb3977f2b` |

The latest candidate returned to the seven-commit original lineage. The
clean successor has one task commit on base `28d5a1b2d072ade55c74fb0e462f00711596fa25`.
Its source service/controller changes match the latest rejected candidate
exactly. The two histories are distinct: `git rev-list --left-right --count
e66144dc...58393f7b` returns `3 7`. This is not a local-versus-remote divergence:
both local branches still equal their published heads.

The actual range checker, `tools/ci/git/check_commit_trailers.py`, reports:

| Ancestor of `58393f7b`                     | Exact defect                                                                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `5d9d177003c4c0533aee9576f221be90fadef294` | Subject `fix(tenant-partner): serialize entry mutations and fix credential global snapshot` fails the task-ID subject pattern. All three trailers are present; the parent blocker incorrectly generalized this as missing trailers. |
| `691181ed0fdbc516ea3575c44a367bb2ac3378c5` | Subject `test: implement bounded concurrency/durability tests for tenant partner entry` is invalid; `Task-ID`, `LLM-Agent`, and `Reviewer` are all absent.                                                                          |

Adding another compliant tip commit or merging `dev` into the old branch does
not remove these ancestors from the range. Rewriting them or bypassing the
checker is unnecessary. Fresh local checker execution against fetched `dev`
fails with these two commits (exit 1); checking `e66144dc` passes (one commit,
exit 0). Completed hosted results agree: old
[trailer job FAILURE](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36367477834/job/108756666103),
clean successor
[trailer job SUCCESS](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36366022289/job/108752501183).

At the initial audit, parent machine truth had **no `execution_branch`**. The current release's
`control_plane/runtime/supervisor_runtime.py::_execution_branch` (lines 885–913)
uses the lane/task default in that case. For Gemini this selects the original
`gemini/sr-partner-notify-fix-entry-20260927`, not the clean successor. Thus
creating another clean PR without recording routing left a path back to
the invalid ancestry. The missing metadata was verified then; it is corrected
by the operator receipt below. This does not assert an unobserved historical
dispatch.

At the initial audit, `git worktree list --porcelain` contained no parent owner worktree
for the original, `-fix`, `-v2`, or `-v3` branches. The assigned helper cwd was
retained throughout. Shared `node_modules` then contained dangling links into
the removed `gemini-sr-partner-notify-fix-entry-20260927-2/node_modules`, including
Vitest, TypeScript, and lint-staged. This is separate dependency provisioning
work; no shared links, installs, or product runtime were changed by this helper.
At follow-up, an owner worktree exists at the canonical root's
`.artifacts/worktrees/auto/gemini-sr-partner-notify-fix-entry-20260927` on the
recorded `-fix` branch. Vitest, TypeScript and Prettier version commands now
resolve successfully (versions below). This confirms tool resolution, not
parent test results.

## Verified non-destructive recovery

Supervisor has recorded
`execution_branch=gemini/sr-partner-notify-fix-entry-20260927-fix`, reusing the
existing clean successor and PR #2207. At the original rehearsal, the parent
was `blocked` with no locked candidate after review reopened `58393f7b`.
The follow-up snapshot is `in_progress` without a locked candidate. The
original owner must recheck live status and remote heads before recovery;
the commands below preserve the audited input identities, not a requirement
to move an advancing branch back.

The only latest parent changes to carry from `e66144dc` to `58393f7b` are:

1. `apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts`
2. [docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-FIX-ENTRY-20260927.md at the source candidate](https://github.com/ajoe734/drts-fleet-platform/blob/58393f7b8cd1d23c357ac63d586e65595c0a955a/docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-FIX-ENTRY-20260927.md)
3. [tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts at the source candidate](https://github.com/ajoe734/drts-fleet-platform/blob/58393f7b8cd1d23c357ac63d586e65595c0a955a/tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts)

The two linked files exist only on the parent candidate, not this helper's
base. The pinned source links distinguish that identity from a local-path claim.

**Do not apply the unrestricted `e66144dc..58393f7b` tree diff.** It also
reverts unrelated owned-mobility/notification-transport changes and deletes
snapshot/transport tests and UAT artifacts already present on the newer base.
The explicit three-path allowlist below avoids those regressions. The full
parent diff from its original base contains nine files; that is a separate,
valid fallback when replayed on a fresh `dev` branch with no old ancestors.

Two independent temporary-index constructions were compared:

| Construction                                                              | Result                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `git merge-tree --write-tree e66144dc dce571db`                           | Clean merge tree `8eca591a7b0b70871886232f0f3ea2792a0fa81b`     |
| Merge tree plus the allowlisted three-file delta                          | Tree `250622285adbfbd3ce9a17e70cd7ff78c9457736`                 |
| Fetched `dev` plus the nine-file original-base-to-latest parent patch     | Identical tree `250622285adbfbd3ce9a17e70cd7ff78c9457736`       |
| Compare recovered tree with latest source on all nine task paths          | Identical, exit 0                                               |
| Compare recovered tree with fetched `dev` outside those nine paths        | Identical; changed-path set equals the nine original task paths |
| Temporary-index `git apply --cached --check`, apply, and whitespace check | All exit 0 for both constructions                               |
| Current HEAD, working tree, real index SHA-256 before/after               | Unchanged                                                       |

This proves content preservation and applicability, not passing parent tests.
Git trees are not candidate commits. No branch or worktree was created for
this rehearsal and no parent file was edited. The original run recorded
machine-specific evidence under `.local/entry-history-repair/`:

- `rehearse.py` and `rehearsal.json` (Python 3, exit 0).
- `successor-three-files.patch`, SHA-256 `3df08eee4157a3f373a55cf2144d260563e2e3668303539af7917ebc7485b798`.
- `parent-nine-files.patch`, SHA-256 `59ef582e9d7dd09b8ad1c5388031b975d754ba5245fd5dcad9f2641751884837`.
- `parent-status.json`, read-only single-task snapshot including review receipts.

The resumed cwd no longer contains that original evidence directory. A fresh
Python 3.12.3 run of `.local/entry-history-repair-resume/verify.py` at 02:31:31Z
reconstructed both patches and temporary-index trees from the pinned Git
objects, with identical hashes and trees above, exit 0. It also checked the
operator receipt and parent/helper task snapshots. Fresh evidence in that
directory is `verification.json`, both patch files, `old-trailers.log`,
`clean-trailers.log`, `operator-actions.json`, `parent-status.json` and
`helper-status.json`. HEAD, real index and working tree were unchanged.

### Original owner recovery recipe (pinned inputs)

These commands are a documented next step, **not executed product mutations**.
Supervisor has provided an isolated owner worktree for the recorded successor.
The initial recipe assumed its head was still `e66144dc`. Do not switch the
canonical root. If any ref has advanced, preserve it and reassess the delta;
do not reset it to the pinned inputs.

```bash
set -euo pipefail
git fetch origin
ENTRY_BRANCH=gemini/sr-partner-notify-fix-entry-20260927-fix
ENTRY_CLEAN=e66144dcbb34bc25ba3838de4c52ad24c8bb746a
ENTRY_SOURCE=58393f7b8cd1d23c357ac63d586e65595c0a955a
ENTRY_DEV=dce571db03d67b6623586501cfb75312ec298826
test "$(git branch --show-current)" = "$ENTRY_BRANCH"
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$ENTRY_CLEAN"
test "$(git rev-parse "origin/$ENTRY_BRANCH")" = "$ENTRY_CLEAN"
test "$(git rev-parse origin/dev)" = "$ENTRY_DEV"
mkdir -p .local/entry-history-recovery
git merge --no-ff "$ENTRY_DEV" \
  -m 'fix(SR-PARTNER-NOTIFY-FIX-ENTRY-20260927): merge audited dev into clean successor' \
  -m 'Task-ID: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927' \
  -m 'LLM-Agent: Gemini' -m 'Reviewer: Codex'
git diff --binary --full-index "$ENTRY_CLEAN" "$ENTRY_SOURCE" -- \
  apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts \
  docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-FIX-ENTRY-20260927.md \
  tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts \
  > .local/entry-history-recovery/carry.patch
git apply --check .local/entry-history-recovery/carry.patch
git apply --index .local/entry-history-recovery/carry.patch
git diff --cached --check
git commit \
  -m 'wip(SR-PARTNER-NOTIFY-FIX-ENTRY-20260927): preserve latest tests and evidence on clean successor' \
  -m "Recovery-Source: $ENTRY_SOURCE" \
  -m 'Task-ID: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927' \
  -m 'LLM-Agent: Gemini' -m 'Reviewer: Codex'
python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD
git push origin "$ENTRY_BRANCH"
```

This ordinary push is a descendant of `e66144dc`. Do not merge/cherry-pick the
old original lineage, amend/rebase/reset published refs, force-push, or close
other PRs as part of this helper. The original owner must still repair the
bounded findings below before publishing a new review candidate. When ready,
verify local SHA = remote head = PR #2207 head and use the release CLI's
`CANDIDATE_SHA` / `CANDIDATE_BRANCH` / `PR_URL` handoff to Codex. Review and
hosted CI must be fresh for that SHA.

## Retained parent findings and acceptance

Latest complete review of the pinned rejected source: canonical parent
`worker_outcomes`, Codex receipt
`codex-20260928T015100Z-d5abee16`, 2026-09-28T01:56:14Z. Adjacent review is
`e66144dcbb34bc25ba3838de4c52ad24c8bb746a` at 01:30:30Z. Both require the
bounded ENTRY-R5 regression/evidence repair, so Guide §0.7's two-round rule
applies. The original Gemini owner continues; this helper does not rewrite
the parent's UAT or substitute its report for the required complete receipts.

| Finding / acceptance                             | Source and precise next repair                                                                                                                                                                                                                                                                                                                 | Verification / limit                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENTRY-R6 invalid ancestry                        | Two commits identified above; route to existing clean successor, preserve latest three-file delta.                                                                                                                                                                                                                                             | Old full range fails, clean range passes, content-preserving replay passes. Actual parent recovery commit remains owner work.                                                                                                                                                                                          |
| ENTRY-R5 cross-entry issue/revoke                | Latest task test lines 281–305 checks top-level `entry.entrySlug`; real `PersistTenantPartnerChanges` at repository lines 151–158 and issuance at service lines 5330–5337 carry nested `partnerIngressCredentials`. Select the actual credential and prove persistence reached/pending before revoking B.                                      | Fresh static confirmation; the current deferred promise is never selected. No fresh dynamic product execution by this helper.                                                                                                                                                                                          |
| ENTRY-R5 independent issue/issue                 | Test 5 awaits B's issuance before starting A. Add two held production writes and both completion orders; authenticate both returned keys.                                                                                                                                                                                                      | Adjacent/current review evidence retained; title alone is not concurrency coverage.                                                                                                                                                                                                                                    |
| ENTRY-R5 update/status/revoke and failure        | Test 3 lines 138–175 uses sequential revoke then activate. Restore held update-before-revoke, reverse order with queued reactivation, rejected revoke preserving prior entry/key and releasing queued issuance. Test 4 has successful same-entry orderings but no rejected-revoke case. Test 2 must assert pending first write before release. | Repair mocks only persistence latency/failure; keep real service/controller, mutex, publication, and authentication. No environment is needed beyond working unit-test dependencies.                                                                                                                                   |
| ENTRY-R5 UAT provenance                          | Original UAT still calls R6 fixed, identifies an uncommitted tested tree, omits adjacent review and overstates Tests 3–5. Carry both complete receipts into the same UAT and distinguish current runs from inherited receipts.                                                                                                                 | Fresh read of UAT at `58393f7b`; correct while repairing original task.                                                                                                                                                                                                                                                |
| ENTRY-R7 / R8 retained repairs                   | Preserve lifecycle awaits at lines 682/692 and typed task fixture/legal credential purpose fields in the three-file carry-forward.                                                                                                                                                                                                             | Recovery tree equals latest source on these files. This is content evidence, not a fresh product-test pass.                                                                                                                                                                                                            |
| `entry_response_waits_durable_write`             | Keep awaited controller/service create and held/rejected response coverage.                                                                                                                                                                                                                                                                    | Prior review retains implementation; parent must rerun affected checks on fresh candidate.                                                                                                                                                                                                                             |
| `persistence_failure_propagated_without_phantom` | Keep persistence-before-publication and real failure assertions, add missing interleavings above.                                                                                                                                                                                                                                              | No lowering of the existing parent acceptance requirement.                                                                                                                                                                                                                                                             |
| `immediate_binding_after_create_hosted_pg`       | Formal migrations and production repositories, immediate valid binding after create.                                                                                                                                                                                                                                                           | Historical successful [integration job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36367477824/job/108756748288), event head `58393f7b`, tested merge `b0a9c53df8ff56eb761dc33537bc6197eac6b7d0`; retain provenance and rerun for new candidate. No VM PG/browser/server, merge, or deployment claim. |

## Canonical parent update: authorized operator action completed

The initial release-CLI attempt
`AI_NAME=Codex <release-cli> note SR-PARTNER-NOTIFY-FIX-ENTRY-20260927
<concrete recovery next step>` returned exit 1:
`Dispatched worker cannot mutate a different task`.
The current release's `control_plane/usecases/task_board_commands.py` lines
82–91 enforces this boundary. No guard variable was removed and no role was
impersonated. At 02:19:19Z this helper recorded a blocked/Claude request while
operator steps were pending. That historical disposition no longer applies.

The dispatch resume specification and the original report were read at their
provided absolute paths under
`/home/lupin/workspace/drts-fleet-platform/.local/worker-resume-20260928/`.
The original report SHA-256 is
`197b147935da5207acf995a381438d04098565ad98e0d6bdafc6b957d775baff`, matching
the report on helper commit `5fecc3fe394dbac4d11f94fdcd6c356a95b33f4b`.
The operator receipt is that directory's `operator-actions.json`, SHA-256
`9d1dbd41f2500ec9081489fd2a8f932cb0192348bcea5a488d3deea7dcd2375e`.
All five relevant actions returned exit 0 with empty stderr:

| UTC action time | Authorized release-CLI action     | Verified effect                                                                                                              |
| --------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 02:28:44.565510 | `assign` parent Gemini / Codex    | Recorded clean successor execution branch and existing scopes plus the lifecycle integration test path.                      |
| 02:28:45.889688 | `assign` helper Codex / Codex2    | Recorded `resolved_parent_status=todo`, null waiting-for, the concrete parent next step and correct helper execution branch. |
| 02:28:47.076326 | `resume-blocked` parent to `todo` | Wrote the same concrete next step as helper `resolved_parent_next`.                                                          |
| 02:28:48.222269 | `assign` helper Codex / Codex2    | Recorded this dispatch's resume specification.                                                                               |
| 02:28:49.250095 | `resume-blocked` helper to `todo` | Authorized this report refresh and independent Codex2 handoff on existing PR #2212.                                          |

The exact next step shared by the parent resume command and helper metadata is:

> Supervisor routed Gemini to existing clean successor gemini/sr-partner-notify-fix-entry-20260927-fix / PR2207. Added int-iam-prt-001-partner-credential-lifecycle.test.ts to owned scope with no active writer conflict; repaired broken dependency links. Merge current dev normally, carry ONLY the three owned files from e66144dc to58393f7b, and finish repeated ENTRY-R5 held-write/interleaving/authentication regressions and original UAT provenance, preserving R7/R8 and all three acceptance keys. Fresh whole-range trailers, Codex review and same-SHA hosted CI required; prior refs/PRs preserved.

Read-only single-task snapshots through release `orchestrator-585087a2fd81`
confirm all assigned routing/scope values, Gemini / Codex ownership and the
three acceptance keys listed above. Parent `last_update=2026-09-28T02:29:28Z`
now records `in_progress`, null waiting-for and
`next=Resuming work, reading context and setting up branch`. This later owner
progress legitimately supersedes the mutable `next`; the immutable operator
receipt and helper `resolved_parent_next` still prove the requested update.
Do not require stale equality of parent status/next with the 02:28Z snapshot.

The helper was started through the same release CLI and is `in_progress`.
Its `resolved_parent_at` remains absent: this helper has not merged and must
not manufacture an early resolution timestamp. Parent product work and its
acceptance remain with Gemini. This refresh does not mutate the parent task,
reset its lifecycle, or require the parent to wait for this report's merge.

## Helper verification and delivery ledger

| Helper acceptance / check              | Result and evidence                                                                                                                                                        | Remaining limit                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Identify exact contamination           | PASS: pinned old range still fails on the two identified commits (exit 1); clean range passes (exit 0). Initial routing defect and completed correction are distinguished. | No claim about who performed historical branch switches.              |
| Document safe repair                   | PASS: fresh temporary-index constructions give identical tree and patch hashes; allowlist prevents unrelated trunk reversions.                                             | Product recovery and ENTRY-R5 regressions remain original-owner work. |
| Task-scoped canonical delivery         | Existing PR #2212 and published commits retained; this report-only follow-up uses normal push and exact-head handoff evidence.                                             | Fresh candidate review, CI and merge remain lifecycle gates.          |
| Update parent concrete next step       | PASS: authorized parent resume receipt (exit 0), matching helper disposition and live routing/scope/acceptance assertions (exit 0).                                        | Later parent progress is independent; helper merge must not erase it. |
| Product unit/type/PG/browser execution | NOT RUN in this documentation helper. Existing hosted results are historical references.                                                                                   | No claim that unrepaired ENTRY-R5 is verified.                        |

### Published checkpoint and completed checks

Anchor `666ef3075957b46a386de35dbe192aaf7f2d9fcc` was normally pushed to the
helper branch and matched the remote and draft
[PR #2212](https://github.com/ajoe734/drts-fleet-platform/pull/2212) head.
The follow-up `5fecc3fe394dbac4d11f94fdcd6c356a95b33f4b` records these results
and corrects two historical file references. Both published commits remain
ancestors of the resumed report candidate.

| Command / execution identity                                                                                                                             | Completed result                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Python 3.12.3: `python3 .local/entry-history-repair/rehearse.py`                                                                                         | Exit 0; both recovery trees match; actual HEAD/index/worktree unchanged.                                                               |
| `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` on anchor                                                                  | Exit 0; one task commit OK.                                                                                                            |
| `git diff --check origin/dev...HEAD` and task-only changed-path inspection on anchor                                                                     | Exit 0; only this report changed.                                                                                                      |
| Node 22.23.2 / Prettier 3.8.2: report `--check`, invoked directly from the existing shared `.pnpm/prettier@3.8.2/node_modules/prettier/bin/prettier.cjs` | Exit 0; no install or shared symlink repair.                                                                                           |
| Anchor hosted [Canonical consistency](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36369179760/job/108761630120)                          | FAILURE, exit 1: two parent-only paths cited as local files. Completed job log read; corrected above to immutable source-commit links. |

The canonical consistency command is
`python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`.
It is rerun locally on the corrected report with formatter, whitespace and
full-range trailers before final publication. The anchor's failed result is
retained; hosted checks on a subsequent head are separate evidence. No helper
CI failure is attributed to unrelated debt, and no full-CI pass is claimed.

The corrected prior head `5fecc3fe` subsequently passed hosted
[Canonical consistency](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36369322122/job/108762131152)
and [Smoke acceptance](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36369322122/job/108764034130).
These are historical results, not CI evidence for this report follow-up.

### Resumed candidate checks and publication

Fresh verification uses Node 22.23.2, pnpm 10.33.0, Python 3.12.3 and Prettier
3.8.2. `pnpm exec vitest --version` (4.1.4) and `pnpm exec tsc --version`
(5.9.3) both exit 0; no dependency install or link mutation was performed.
The metadata assertions, old-fail/clean-pass trailer reproduction and both
recovery-tree constructions in `verify.py` completed with exit 0 at 02:31:31Z.
These Git/document checks do not execute or approve parent product behavior.

| Resumed report check                                                                            | Completed result / execution identity                                                                                      |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec prettier --check` on this report                                                     | Exit 0, Prettier 3.8.2; revised report based on `5fecc3fe`.                                                                |
| `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`        | Exit 0, all four checks report zero findings; reads the revised report's working-tree content.                             |
| `git diff --check origin/dev` and report-only changed-path inspection                           | Exit 0; only this helper's original report is changed.                                                                     |
| `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` before new commit | Exit 0, both existing published helper commits valid. Final range is checked again after commit and recorded with handoff. |

The parent update and helper disposition are now verified in machine truth.
Publish only this report on the existing helper branch and PR #2212, then
record full local SHA = remote SHA = PR head with `CANDIDATE_SHA`,
`CANDIDATE_BRANCH` and `PR_URL` in the release-CLI handoff to Codex2. The handoff
supplies the final SHA/generation without embedding a commit's own hash in
itself. Preserve the candidate afterward for independent review and same-SHA
hosted CI; do not call `done` or claim parent acceptance, merge or deployment.
