# SR-PARTNER-NOTIFY-FIX-ENTRY-20260927 history repair

Audit: 2026-09-28 UTC. Helper owner/reviewer: Codex / Codex2.
Parent owner/reviewer: Gemini / Codex. This helper changes only this report.

**Disposition:** the history defect is reproduced and a non-destructive repair
is rehearsed. Parent routing/scope and its canonical next-step update still
require Supervisor action. Do not auto-resume the old branch or treat this
report as parent product approval. No published parent refs were changed.

## Exact contamination and routing evidence

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

Parent machine truth has **no `execution_branch`**. The current release's
`control_plane/runtime/supervisor_runtime.py::_execution_branch` (lines 885–913)
uses the lane/task default in that case. For Gemini this selects the original
`gemini/sr-partner-notify-fix-entry-20260927`, not the clean successor. Thus
creating another clean PR without recording routing leaves a path back to
the invalid ancestry. This is a verified current routing condition, not an
assertion about an unobserved historical dispatch.

At audit, `git worktree list --porcelain` contains no parent owner worktree
for the original, `-fix`, `-v2`, or `-v3` branches. The assigned helper cwd was
retained throughout. Shared `node_modules` still contains dangling links into
the removed `gemini-sr-partner-notify-fix-entry-20260927-2/node_modules`, including
Vitest, TypeScript, and lint-staged. This is separate dependency provisioning
work; no shared links, installs, or product runtime were changed here.

## Verified non-destructive recovery

Prefer reusing the existing clean successor and PR #2207 after Supervisor
records `execution_branch=gemini/sr-partner-notify-fix-entry-20260927-fix`.
There is no active locked parent candidate: its status is `blocked`, its
candidate SHA is cleared, and the latest review reopened `58393f7b`.
Recheck that condition and remote heads before execution.

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
this rehearsal and no parent file was edited. Machine-specific evidence is
under this helper cwd's `.local/entry-history-repair/`:

- `rehearse.py` and `rehearsal.json` (Python 3, exit 0).
- `successor-three-files.patch`, SHA-256 `3df08eee4157a3f373a55cf2144d260563e2e3668303539af7917ebc7485b798`.
- `parent-nine-files.patch`, SHA-256 `59ef582e9d7dd09b8ad1c5388031b975d754ba5245fd5dcad9f2641751884837`.
- `parent-status.json`, read-only single-task snapshot including review receipts.

### Owner execution after Supervisor routing/scope correction

These commands are a documented next step, **not executed product mutations**.
Supervisor must reuse/create an isolated owner worktree for the recorded
successor, preserving the existing branch at `e66144dc`. Do not switch the
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

Latest complete review: canonical parent `worker_outcomes`, Codex receipt
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

## Canonical parent update and remaining operator action

The release CLI successfully recorded this helper's `start` and `progress`.
An explicit `AI_NAME=Codex <release-cli> note SR-PARTNER-NOTIFY-FIX-ENTRY-20260927
<concrete recovery next step>` returned exit 1:
`Dispatched worker cannot mutate a different task`.
The current release's `control_plane/usecases/task_board_commands.py` lines
82–91 enforces this boundary. No guard variable was removed and no role was
impersonated. The helper's own `progress` records the following operator request:

1. Persist parent `execution_branch=gemini/sr-partner-notify-fix-entry-20260927-fix`
   and the concrete `next` below, using the active release CLI.
2. Check writer conflicts and add the real lifecycle test path to parent
   `write_scopes`; it is currently absent. Preserve the existing scope and all
   three `required_acceptance` keys.
3. Provision the isolated owner's dependencies without dangling/shared link
   mutation. Preserve all existing source files, refs, and worktrees.
4. Before this helper can merge, persist helper `resolved_parent_status=blocked`,
   `resolved_parent_waiting_for=Claude`, and `resolved_parent_next` below while
   operator steps remain pending. A report merge must not implicitly route the
   parent back onto its contaminated default branch. After resolving these
   steps, Supervisor can explicitly resume the original owner with new evidence.

Concrete parent next step:

> Supervisor routes Gemini to the existing clean successor
> `gemini/sr-partner-notify-fix-entry-20260927-fix` / PR #2207, reconciles the
> lifecycle test scope and worker dependencies. Gemini normally merges current
> dev, carries the three-file delta from `58393f7b` without its ancestry,
> repairs the repeated ENTRY-R5 regression/evidence unit in the original UAT,
> preserves ENTRY-R7/R8, then validates the whole base-to-head trailer range
> and affected product checks before a fresh immutable handoff to Codex.

## Helper verification and delivery ledger

| Helper acceptance / check              | Result and evidence                                                                                                                        | Remaining limit                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Identify exact contamination           | PASS: Git parents/messages, matching local/remote/PR heads, actual trailer checker exits 1 / 0, current routing code and missing metadata. | No claim about who performed historical branch switches.                                  |
| Document safe repair                   | PASS: two independent temporary-index constructions give identical tree; allowlist prevents unrelated trunk reversions.                    | Documented parent mutations await original owner.                                         |
| Task-scoped canonical delivery         | Report-only commit / normal push / PR to be recorded below.                                                                                | Candidate not yet handed off.                                                             |
| Update parent concrete next step       | PENDING: parent note rejected exit 1; own `progress` contains exact operator request.                                                      | Supervisor canonical parent write required; prose alone does not satisfy this acceptance. |
| Product unit/type/PG/browser execution | NOT RUN in this documentation helper. Existing hosted results are historical references.                                                   | No claim that unrepaired ENTRY-R5 is verified.                                            |

### Published checkpoint and completed checks

Anchor `666ef3075957b46a386de35dbe192aaf7f2d9fcc` was normally pushed to the
helper branch and matched the remote and draft
[PR #2212](https://github.com/ajoe734/drts-fleet-platform/pull/2212) head.
The follow-up report commit records these results and corrects two historical
file references; its exact final SHA is recorded in the helper's canonical
blocker and PR head, not invented inside its own commit.

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

The report remains an owner checkpoint until the parent update and helper
disposition are present in machine truth. Do not call `done`; once those
operator writes are verified, publish any final report update and hand off the
matching helper SHA/remote/PR to Codex2 through the candidate lifecycle.
