# ORCH-CI-RECOVERY-INDEPENDENT-REVIEW-PHASE-20261016

Owner: Codex. Independent reviewer: Claude2. Source implementation evidence;
review, mandatory same-candidate hosted CI, protected merge and the two named
acceptance keys remain separate lifecycle requirements. No product C073, whole
product/Final, runtime installation or loaded-role acceptance is claimed here.

## Authority and immutable source

- Assigned isolated branch: `codex/orch-ci-recovery-independent-review-phase-20261016`.
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

| Finding / acceptance | Production source and checks | Original-before → fixed-after | Evidence / remaining boundary |
| --- | --- | --- | --- |
| CI-only `queued` skips review | Actual `command_reconcile_candidate` + `resolve_dispatch_target`, complete sealed C073 | `integrating`, no reviewed SHA, no dispatch → `review`, Claude2 `review_ready_dispatch`, no reviewed SHA | `before.json` / `after.json`; synthetic observation only |
| CI-only `running` skips review | Same handler and full original task, separate subtest | Same original failure → reachable original reviewer | Same artifacts; not live CI success |
| CI-only `success` skips review | Same handler and full original task, separate subtest | Same original failure → reachable original reviewer | Same artifacts; no product acceptance |
| `ci-recovery_unapproved-frozen-candidate-keeps-legal-independent-review-or-owner-continuation` | `candidate_review_handoff_is_current`, `command_handoff`, `command_start`, `clear_candidate_evidence`, reconcile; 19 new regression methods | Legacy/current handoffs recover review; missing/foreign/stale receipts, snapshot drift, explicit repair, reopen, changed source, closed/conflict keep owner/re-handoff | Handler + actual command transaction and dispatch policy exercised; independent Claude2 decision and named-key recording pending |
| `ci-recovery_full-original-negative-reviewed-regressions-and-exact-candidate-validation` | Existing native/control-plane/GitHub suites, all original tests/assertions retained | Reviewed same-SHA queued/running/success remain integrating; current review phase, failures, closed/conflict, done, blocked, pending/stale CI merge rejection, and review→merge→acceptance→done controls pass | Exact hosted CI, independent review, protected merge, finite key evidence pending normal lifecycle |

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

## Reproduction and verification

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

| Command / evidence | Exit / result |
| --- | --- |
| Above original-source replay, `before-regression.log` | 0 for expected-before wrapper; underlying regression has exactly three `integrating != review` failures |
| Full frozen original native/policy probes, `before.json`, `after.json` | 0 each; before: all three integrating/no route; after: all three review/Claude2 |
| `PYTHONPATH=tools/development-orchestrator python3 -m unittest test_ai_status -v`, `native-final.log` | 0; 57 tests pass (38 original + 19 new) |
| `PYTHONPATH=tools/development-orchestrator python3 -m unittest control_plane.tests.test_dispatch_policy control_plane.tests.test_task_board_commands test_github_bus -v`, `policy-gateway-github.log` | 0; 84 unchanged policy/gateway/GitHub tests pass |
| `PYTHONPATH=tools/development-orchestrator python3 -m unittest discover -s tools/development-orchestrator -p 'test_*.py'`, `full-orchestrator-final.log` | 0; 1,085 tests pass in 35.104s; process completion and final `OK` read before handoff |
| `python3 -m py_compile tools/development-orchestrator/bin/ai_status.py tools/development-orchestrator/test_ai_status.py` | 0 |
| `git diff --check` | 0 |

No VM product/dev/preview/browser/E2E/PG/Docker server, worker restart, installer,
cloud/IAM/deploy operation was run. Real canonical C073 recovery and later
accepted-release installation/loaded-role proof belong to the existing runtime
maintainer lifecycle and are not inferred from this Source candidate.
