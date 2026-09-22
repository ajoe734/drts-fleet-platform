# Dispatch contract recovery

Task: ORCH-DISPATCH-CONTRACT-20260919

## Failure chain

A single eligible-agent list constrained implementation and review. A Gemini-only
list prevented Codex review; widening it let helpers claim implementation.
Stable role contracts now apply to selection, fallback, chair reassignment,
canonical mutations and final worker launch.

CI could reopen a candidate between owner handoff and process exit. Comparing only
current task status then counted a successful handoff as a lane failure. The
canonical transaction now stores bounded per-run outcome receipts. Activity logs
are not completion proof because they can survive a rolled-back transaction.
Runtime consumes a committed receipt after process exit, using its existing
result-consumption path. It never marks the task done from a worker report.

Dispatched reviewer mutations are fenced by candidate SHA and handoff generation,
including report-only candidates whose repeated SHA is `not_applicable`.
Manual lane holds remain operator actions; the chair may not promote task
failures into indefinite manual lane bans. Existing auth/quota handling remains.

## Contract

- `eligible_agents: {"owner": ["Gemini", "Gemini2"], "reviewer": ["Codex", "Codex2"]}`
  separates implementation and review. Legacy lists retain their semantics.
  Invalid maps fail closed; role-map assignments must match their allowed lanes.
- Workers receive run, task, role, agent, candidate and generation context.
  Canonical lifecycle commands enforce that context and record `worker_outcomes`
  within the existing transaction. Rollback also removes the receipt.
- agy requests the existing worker-result schema. Native results and Codex result
  files share validation/consumption. Native SUCCESS alone proves no task change.
- Briefs retain complete current feedback, specification, write scopes, acceptance
  and candidate identity. Report-only work is not told to create source commits.
  Workers must wait for their own checks before declaring results.
- Read-only board commands read atomic JSON snapshots without creating a writer
  lock. Mutations retain the existing transaction lock.

No scheduler, broker, recovery daemon or independent status writer is added.

## Host verification and activation

The agy AppArmor user-namespace profile is machine configuration, separate from
repository changes. Preserve terminal sandboxing and the global host restriction.
A 2026-09-20 live probe confirmed worktree writes first receive a read-only error
and subsequently succeed through agy's existing permission retry. `--new-project`
does not fix this restriction and is not adopted. Inspect actual tool outputs,
not only the final agent summary.

Merge the tested candidate, activate the merged tool release against the existing
canonical status root, and replace the existing supervisor once. Preserve product
WIP and external acceptance gates. Migrate affected tasks to stable role maps,
remove stage-specific eligibility instructions, and resume only resolved lanes.
Verify real agy dispatch and Codex review before declaring dispatch recovered.

## Verification

`test_dispatch_contract.py` covers role separation, invalid policy, committed
handoff followed by CI reopening, rollback, idempotence, stale review generations,
reassignment fencing, writable-lock-free reads, schema validation, full briefs,
and rejection of unproven completion and chair manual lane bans. Existing tool
and control-plane suites remain required.

Transaction and materializer fixtures use `DispatchEnvironmentIsolation` to
remove inherited `ORCH_RUN_ID` and `ORCH_DISPATCH_*` for each test, restoring the
environment through unittest cleanup. The executor, system-remediation and
unattended-voice fixtures otherwise inherit the invoking worker's restrictions.
Production fencing is unchanged; an explicit owner/reviewer regression verifies
that a temporary status path still rejects non-lifecycle mutation commands.

On 2026-09-20, both dispatch environments passed 939 orchestrator tests and
47 control-plane tests each. Reproduce from the repository root:

```bash
set -e
for role in owner reviewer; do
  if [ "$role" = owner ]; then agent=Codex; else agent=Codex2; fi
  for suite in tools/development-orchestrator tools/development-orchestrator/control_plane/tests; do
    env PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=tools/development-orchestrator \
      ORCH_RUN_ID="$role-isolation-probe" ORCH_DISPATCH_ROLE="$role" \
      ORCH_DISPATCH_TASK_ID=ORCH-DISPATCH-CONTRACT-20260919 ORCH_DISPATCH_AGENT="$agent" \
      ORCH_DISPATCH_CANDIDATE_SHA=96e030d70e66a47056f8bf1269f2cc46ae21b39f \
      ORCH_DISPATCH_CANDIDATE_GENERATION=isolation-probe-generation \
      python3 -m unittest discover -s "$suite" -p 'test_*.py' -q
  done
done
```
