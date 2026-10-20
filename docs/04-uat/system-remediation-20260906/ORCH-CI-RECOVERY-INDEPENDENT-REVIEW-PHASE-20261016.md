# ORCH-CI-RECOVERY-INDEPENDENT-REVIEW-PHASE-20261016

Owner: Codex. Independent reviewer: Claude2. Source implementation evidence;
review, mandatory same-candidate hosted CI, protected merge and the two named
acceptance keys remain separate lifecycle requirements. No product C073, whole
product/Final, runtime installation or loaded-role acceptance is claimed here.

## Authority and immutable source

- Current R2 isolated branch:
  `codex/orch-ci-recovery-independent-review-phase-20261016-recovery-r2`.
- R2 dispatch verified clean HEAD and freshly fetched accepted `origin/dev` at
  `a1dcfded7c5af92e13b5d24c5d955f112557b7f4`. Applied only the saved three-path
  patch, SHA256 `7f61c70ca19c37b4aa280d0371da9d9c8977fb7f07734783d20b609d7870babe`.
  Source and tests remain byte-identical to that patch; this UAT records the
  new execution and evidence separately below.
- R2 authority: canonical `.local/goal-continuation-20261016T083825Z-original-native-CI-safe-new-branch-continuation-root/Original-native-CI-preserve-published-history-fresh-owner-branch-and-candidate-transition-authority.json`,
  SHA256 `29c74ce84779841f132ff918b76629e27273320d59ed43eafd08c32ad3423200`.
  The original branch, candidate `711d7a33c881c23aa1bf618a86b04138bc97a596`,
  generation `0a5f0cd1e92c4e718fa3eb548a1984d8`, PR #2739 and failed commit-title
  CI remain preserved. A separate new commit/ordinary push/PR/handoff creates
  the successor candidate; no published history is rewritten or borrowed.
- Historical first branch: `codex/orch-ci-recovery-independent-review-phase-20261016`.
- Fresh fetched `origin/dev` and initial HEAD both resolved to
  `a1dcfded7c5af92e13b5d24c5d955f112557b7f4` before edits.
- First recoverability anchor: `db26d9157` (ordinary push; not a review candidate).
  The exact final candidate is the full SHA recorded by the normal owner handoff
  and the PR head; this document belongs to that commit.
- Original native blob: `e76576514d00fa39c55974d1743a8f87a8310d9a`;
  original source SHA256:
  `d8838e02e21ea05c6b6447441d8488d9ec93ca6e3c7b85a8866460f7b64c8566`.
- Final native source SHA256:
  `e5355374e1ccdfac6d5fbc7ebfd19604c728189e9f120d4c22cb10639c812ec9`.
- Final test source SHA256:
  `3b20e2e69b07e0d836b9583e990306eb342b2238ee5419248037b54fb5e1fd32`.
- Read full task spec and sealed reproductions in canonical-root `.local/goal-continuation-20261016T075609Z-original-C073-actual-latest-workflow-retry-root/`.
  Reproduction authority file:
  `actual-production-native-reconcile-CI-only-unapproved-candidate-skips-review-isolated-reproduction.json`,
  verified SHA256 `6d3dc0f114c637c44f38fcbe20d3f6e45ec6a0b19e8d115ba24f1c448aa8806b`.
- `test_ai_status.py::FROZEN_C073_TASK` embeds the complete original task from
  that sealed authority, including original acceptance, scopes, source/candidate
  identity and both worker receipts. Tests do not depend on an ignored local file.
  Frozen candidate: `f86d772bf7e4c4fcc1c1cf7ea813ad29c1be22e1`, generation
  `15e8a4dee19c4edba69678858407e8b4`, original owner Claude/reviewer Claude2.

## Findings and finite behavior

The actual `command_reconcile_candidate` previously kept an unapproved task in
review only if its status was already `review`. The original CI failure had
returned C073 to `in_progress` while retaining its frozen owner handoff receipt.
A subsequent queued/running/success observation fell through to `integrating`.
The actual `ReadyDispatchPolicy` correctly has no worker route for integrating,
so independent review became unreachable.

`candidate_review_handoff_is_current` now checks provenance before restoring
review from a recovered CI observation. New owner handoffs retain owner,
reviewer, SHA, branch and generation in `candidate_review_handoff`; legacy
candidates can use their existing transactional advanced owner-handoff receipt
with matching owner/SHA/generation. A positive CI observation never writes an
approval or fabricates another handoff. Ordinary dispatch reaches the current
original reviewer from `review` without changing dispatch policy.

An explicit owner `start` invalidates recovery eligibility, and closed/conflict
observations require a new owner handoff. Explicit reopen, owner repair through
progress from integrating, and changed-head invalidation use the existing
candidate-clearing path, which also removes the snapshot. An invalid snapshot
never falls back to legacy receipts. An empty observation cannot recover the
old failed CI case. Mismatched frozen branch observations are rejected before
observation fields are written. A blocked task is not resumed by positive CI or
merge evidence. Missing, stale or foreign handoff provenance retains owner
continuation; matched reviewed same-SHA candidates retain legal integration.

| Finding / acceptance                                                                           | Production source and checks                                                                                                                | Original-before → fixed-after                                                                                                                                                                                 | Evidence / remaining boundary                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| CI-only `queued` skips review                                                                  | Actual `command_reconcile_candidate` + `resolve_dispatch_target`, complete sealed C073                                                      | `integrating`, no reviewed SHA, no dispatch → `review`, Claude2 `review_ready_dispatch`, no reviewed SHA                                                                                                      | `before.json` / `after.json`; synthetic observation only                                                                         |
| CI-only `running` skips review                                                                 | Same handler and full original task, separate subtest                                                                                       | Same original failure → reachable original reviewer                                                                                                                                                           | Same artifacts; not live CI success                                                                                              |
| CI-only `success` skips review                                                                 | Same handler and full original task, separate subtest                                                                                       | Same original failure → reachable original reviewer                                                                                                                                                           | Same artifacts; no product acceptance                                                                                            |
| `ci-recovery_unapproved-frozen-candidate-keeps-legal-independent-review-or-owner-continuation` | `candidate_review_handoff_is_current`, `command_handoff`, `command_start`, `clear_candidate_evidence`, reconcile; 19 new regression methods | Legacy/current handoffs recover review; missing/foreign/stale receipts, snapshot drift, explicit repair, reopen, changed source, closed/conflict keep owner/re-handoff                                        | Handler + actual command transaction and dispatch policy exercised; independent Claude2 decision and named-key recording pending |
| `ci-recovery_full-original-negative-reviewed-regressions-and-exact-candidate-validation`       | Existing native/control-plane/GitHub suites, all original tests/assertions retained                                                         | Reviewed same-SHA queued/running/success remain integrating; current review phase, failures, closed/conflict, done, blocked, pending/stale CI merge rejection, and review→merge→acceptance→done controls pass | Exact hosted CI, independent review, protected merge, finite key evidence pending normal lifecycle                               |

The full transaction regression calls `TaskBoardCommandExecutor` with the actual
handoff/reconcile/approve handlers and original worker command guards. It rejects
stale reviewer SHA and generation before mutation and rejects owner approval.
Only the original reviewer at the current frozen candidate can approve. Separate
controls show a merged but unapproved candidate cannot reach acceptance/done,
required acceptance is not automatically granted, and exact approved candidates
still require same-SHA successful CI before merge evidence is consumed.

No workflow, `github_bus.py`, dispatch/provider/approval policy, configuration or
product source changed. Original workflow supersession and bound-PR tests run
unchanged. Per the sealed retry authority, newer-created regular run
`38827374483` is the C073 retry handle; older-created run `38827364922` attempt 3
success does not replace it. This task performs no CI retry or live provider
operation and does not claim that either synthetic probe passed product CI.

## Original implementation reproduction and verification (historical)

All commands run in the assigned task worktree. Machine-specific output is under
`.local/ci-recovery-independent-review/` there. `before.json` and `after.json`
contain the full original task and actual handler outputs for all three cases.
Artifact SHA256: `before.json` =
`f56f6acfa4cabaee9c0c9ba1a42a71e5b16457b325dd23a8c8cba6454b512dcd`;
`after.json` = `27f95811a2824d5c029ab64f9c1e8b3ff267a1e45e4e9699019a048e0c12402c`.
Only environment observations and the append-log I/O boundary are controlled;
the handler and dispatch logic run unchanged. The transaction control uses a
temporary lock path and in-memory board; no edited code is run against the real
canonical board. Git commit existence is mocked only in explicit handoff/approval
unit controls, not in the three sealed CI counterexamples.

The new regression was also run against the actual original source using this
replay (expected: three assertion failures, no fixture/import errors):

```bash
PYTHONPATH=tools/development-orchestrator python3 - <<'PY'
import subprocess, types, unittest
from pathlib import Path
import test_ai_status
source = subprocess.check_output([
    'git', 'show', 'a1dcfded7c5af92e13b5d24c5d955f112557b7f4:tools/development-orchestrator/bin/ai_status.py'
], text=True)
old = types.ModuleType('original_ai_status')
old.__file__ = str(Path('tools/development-orchestrator/bin/ai_status.py').resolve())
exec(compile(source, old.__file__, 'exec'), old.__dict__)
test_ai_status.ai_status = old
case = test_ai_status.CiRecoveryIndependentReviewTest(
    'test_full_sealed_c073_each_ci_only_recovery_restores_original_reviewer')
result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([case]))
assert len(result.failures) == 3 and not result.errors
PY
```

| Command / evidence                                                                                                                                                                                    | Exit / result                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Above original-source replay, `before-regression.log`                                                                                                                                                 | 0 for expected-before wrapper; underlying regression has exactly three `integrating != review` failures |
| Full frozen original native/policy probes, `before.json`, `after.json`                                                                                                                                | 0 each; before: all three integrating/no route; after: all three review/Claude2                         |
| `PYTHONPATH=tools/development-orchestrator python3 -m unittest test_ai_status -v`, `native-final.log`                                                                                                 | 0; 57 tests pass (38 original + 19 new)                                                                 |
| `PYTHONPATH=tools/development-orchestrator python3 -m unittest control_plane.tests.test_dispatch_policy control_plane.tests.test_task_board_commands test_github_bus -v`, `policy-gateway-github.log` | 0; 84 unchanged policy/gateway/GitHub tests pass                                                        |
| `PYTHONPATH=tools/development-orchestrator python3 -m unittest discover -s tools/development-orchestrator -p 'test_*.py'`, `full-orchestrator-final.log`                                              | 0; 1,085 tests pass in 35.104s; process completion and final `OK` read before handoff                   |
| `python3 -m py_compile tools/development-orchestrator/bin/ai_status.py tools/development-orchestrator/test_ai_status.py`                                                                              | 0                                                                                                       |
| `git diff --check`                                                                                                                                                                                    | 0                                                                                                       |

No VM product/dev/preview/browser/E2E/PG/Docker server, worker restart, installer,
cloud/IAM/deploy operation was run. Real canonical C073 recovery and later
accepted-release installation/loaded-role proof belong to the existing runtime
maintainer lifecycle and are not inferred from this Source candidate.

## R2 execution verification

Evidence for this dispatch is recorded under canonical-root
`.local/ci-recovery-independent-review/r2-20261016T084654Z/`.
Implementation checkpoint `de4b44041f4fbd91dad2aebc0260a996403da128` was
normally committed/pushed using the original checker-passing subject and trailers.
The final handoff locks the successor PR head after this evidence update.

| Finding / acceptance                                                                                    | R2 command, actual result and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Remaining boundary                                                                             |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| All three CI-only counterexamples; first required key                                                   | `PYTHONPATH=tools/development-orchestrator python3 /home/lupin/workspace/drts-fleet-platform/.local/ci-recovery-independent-review/r2-20261016T084654Z/reproduce.py`: exit 0. Complete embedded fixture equals each sealed original task. Actual original base handler: queued/running/success each integrating/no dispatch; fixed handler: each review/Claude2, no approval. Retained regression against original code fails exactly three times on `integrating != review`, no errors. Full inputs/outputs in `before.json`, `after.json`, `before-regression.log`. | Synthetic CI controls only; no real C073 CI/acceptance credit.                                 |
| Existing legal reviewed paths, invalidation/repair/failure/merge/acceptance guards; second required key | `PYTHONPATH=tools/development-orchestrator python3 -m unittest test_ai_status -v`: exit 0, 57 tests (38 original + 19 new), `native.log`. All original test-class ASTs/assertions compare unchanged to the actual base.                                                                                                                                                                                                                                                                                                                                               | New exact candidate still needs independent reviewer decision and external lifecycle evidence. |
| Original dispatch, command gateway, workflow supersession and bound-PR guards                           | `PYTHONPATH=tools/development-orchestrator python3 -m unittest control_plane.tests.test_dispatch_policy control_plane.tests.test_task_board_commands test_github_bus -v`: exit 0, 84 tests, `policy-gateway-github.log`.                                                                                                                                                                                                                                                                                                                                              | No dispatch/provider/approval policy or GitHub adapter changes.                                |
| Complete native/control-plane affected regression                                                       | `PYTHONPATH=tools/development-orchestrator python3 -m unittest discover -s tools/development-orchestrator -p 'test_*.py'`: exit 0, 1,085 tests in 35.564s, final `OK` read; `full-orchestrator.log`.                                                                                                                                                                                                                                                                                                                                                                  | Repository checks only; no VM product/runtime/server or installation proof.                    |
| Syntax and patch consistency                                                                            | `python3 -m py_compile tools/development-orchestrator/bin/ai_status.py tools/development-orchestrator/test_ai_status.py` and `git diff --check origin/dev...HEAD`: exit 0. Source/test hashes remain the exact saved patch hashes above.                                                                                                                                                                                                                                                                                                                              | UAT evidence update only after full test completion.                                           |
| Legal published successor, preserving old candidate/history and other authors                           | Actual commit-message checker passed both original proposed message and R2 commit range; `commit-trailers.log`. `source-and-preservation.json` records old remote head unchanged and canonical Root staged source diff SHA256 `8a8753d4aa765119e363e7156e39b3147ed03b83d76f6a374b667541ca47ba00` unchanged.                                                                                                                                                                                                                                                           | Old PR #2739 remains OPEN at old SHA. No rewrite, bypass or reuse of its integration green.    |

R2 artifact SHA256: `before.json` =
`2348223e64ff4b1617ac482bf5d243c3090025cd26dabd5b61dba47c1afe8296`;
`after.json` = `585b976c8bce291a219659b7f7391b25db542bf8bdadfc23ca59353c29e6a708`.
`reproduce.py` is a rerunnable machine-local evidence script; tests remain
self-contained in the tracked test file. Both probes use the actual original
base source blob and the actual fixed source, with only environment inputs and
append-log I/O controlled. No edited native code touched the canonical board.

Hosted CI, independent Claude2 review of the new SHA/generation, protected merge
and both original finite acceptance keys remain pending normal lifecycle.
The historical results above do not substitute for these new-candidate gates.

## 2026-10-19 original full-six continuation on current accepted dev

The earlier sections are historical Source evidence. The original public
`de4b44041f4fbd91dad2aebc0260a996403da128` and
`cdde4ca010ccea87917155edbd51d10e771cb167` commits, their literal Gemini2 Git
author/committer and `LLM-Agent: codex` trailers, old branches, generations and
PR2739/PR2740 remain intact. PR2740's own two workflows passed; it is held by
one actual merge conflict, not a newly claimed CI failure.

Original owner Codex continues the same finite task in a new locked isolated
branch `codex/orch-ci-recovery-independent-review-phase-20261016-root-20261019`
from freshly verified accepted dev
`17c724d671820e902eee5dc4cb17105ea858926f`. The original exact three-path patch
was normally applied with Git three-way application. The only conflicting
production hunk retains the original frozen-branch check followed by the
accepted completion prevalidation, both before candidate metadata writes. The
accepted prevalidation block is byte-identical. There is no change to
`github_bus.py`, dispatch/provider/approval policy, workflow, installed runtime,
role permissions, product code or global product/release criteria.

The normal Supervisor metadata/eligibility and reviewer-only reassign preserve
owner Codex and route independent review to the available Codex2. Original
Claude2 workspace remains unavailable under USER「稍後補足」; no funding,
provider, account, pause or restart control was invoked. R3 preserves all six
functional obligations, both original keys, the three exact scopes and empty
dependency set. Only the reviewer name in clause six and its matching key
description changes; the original six literal clauses are retained in its
annex. The Source spec is under
`.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/Root-ORCH-original-six-criteria-source-continuation-20261019/ORCH-CI-RECOVERY-R3-full-original-six-two-keys-available-reviewer.task-spec.json`
(SHA256 `1b79d4346578411b58674264229ebaa4fe65f630d1b9ce42bcf06e8f6e2a5e88`).
All command receipts and raw logs are in that same evidence directory. This is
tooling Source support, not another product capability completion.

### Full original obligations and actual checks

1. The unchanged full sealed historical C073 task and original three CI-only
   inputs were replayed through the actual production reconcile handler and
   actual ReadyDispatchPolicy. On actual current accepted `17c`, queued,
   running and success each still enter integrating with no reviewed SHA and
   no legal reviewer route. The retained selected test fails exactly three
   subtest assertions, with no import or runtime error. The merged implementation
   returns all three to review and the original task's own Claude2 route. That
   is a historical controlled fixture, not a request to start a real provider.
2. The original snapshot/legacy owner handoff, explicit owner continuation,
   stale-generation, blocked and failure/closed/conflict recovery behavior is
   preserved. Recovery does not manufacture an owner handoff or approval.
3. All original source/reviewer/SHA/branch/generation and required-acceptance
   boundaries remain. No live canonical board, owner permission, pause, queue,
   approval or acceptance outcome is modified by the controlled test inputs.
4. The current accepted completion prevalidation and original branch validation
   both execute before metadata updates. Full regressions retain legitimate
   reviewed integration/merge/acceptance and rejected/stale paths. The merge
   resolution does not weaken either side's existing checks.
5. Original latest-created regular workflow provenance, BOUND-PR and run
   supersession behavior remains unchanged. Historical old-candidate green
   runs are evidence only for their own SHA. New exact candidate CI is required.
6. The complete current original native/control-plane unittest discovery
   returned direct exit 0: **1118 tests, OK**, no failures/errors/skips. Python
   syntax checks returned 0. All 40 accepted-base and all 65 published-candidate
   test/helper methods have identical ASTs in the merged test file; no old
   assertion was removed, changed or skipped. The test file is also byte-exact
   to published `cdde`. Separate before/after results overlap this full run and
   must not be added to its count. Normal hooks, new immutable candidate,
   independent Codex2 review, required own CI, protected merge and both original
   keys remain the normal lifecycle requirements recorded by the delivery
   packet; this author section does not claim them completed.

The primary full-run receipt is
`full-original-native-control-plane-all-manifest-prereqs-complete.command.json`,
with raw log SHA256
`867803a26f672d8e53898e396d195861fe039f1aa490a5576dd4b97ca2fdd0d6`.
The production and test input hashes remained unchanged throughout that run.
The earlier sparse-checkout preparation attempts remain as direct failures:
missing existing dispatch imports first, then static source manifests and
runbooks produced setup errors and derivative expected-message assertions.
Only unchanged tracked files from the same accepted Git commit were
materialized, and all 77 declared manifest references were enumerated and
byte-compared before the successful full run. No test/assertion or product
Source was changed to make those preparations pass.

The two original Source keys map to the actual three recovered original
reviewer routes plus the complete legal/negative/native/transaction regression
proof and final exact-candidate lifecycle. The handoff binds their evidence to
the new SHA/generation rather than the old `cdde` approval/CI history.
Original Source credit remains separate from sole-maintainer installation and
loaded-role proof. No VM product server, preview, browser/E2E, PostgreSQL,
Docker, cloud deployment, IAM, real provider operation or worker restart was
performed. Neither whole-system acceptance nor production readiness is inferred.
