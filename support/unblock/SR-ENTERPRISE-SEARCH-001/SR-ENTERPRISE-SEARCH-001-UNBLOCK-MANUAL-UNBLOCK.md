# SR-ENTERPRISE-SEARCH-001-UNBLOCK-MANUAL-UNBLOCK

Audit: 2026-09-08. Owner: Codex. Reviewer: Gemini.
Inspected base: `5cff9b36082998a0295f2550039306dc1f84c3d2` (`origin/dev`).

## Diagnosis

The parent SR-ENTERPRISE-SEARCH-001 remains blocked despite `depends_on: []`.
The empty dependency list omits a required upstream capability; it does not prove
that the implementation can satisfy acceptance.

- The parent runbook, [execution scope](../../../docs/03-runbooks/system-remediation-20260906/SR-ENTERPRISE-SEARCH-001.md), requires backend filtering before closure when the API lacks it, and reserves shared-scope expansion to Supervisor.
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:459` accepts tenant/request headers for the list endpoint, with no filter or pagination query arguments.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2048` filters the in-memory orders by tenant and returns all matches with page 1 and total equal to array length. Date/passenger/status filtering and server pagination are absent here.
- `packages/api-client/src/index.ts:1192` exposes a zero-argument list method returning an array. The enterprise wrapper at `apps/enterprise-dispatch-web/lib/api-client.ts:59` forwards that call.
- The current release's `ai-status.sh show SR-BOOKING-VERIFY` returns exit 1, `Task not found`. Parent inspection returns blocked with no dependencies.
- [Q-SR-ENTERPRISE-SEARCH-001](../../../PHASE1_OPEN_QUESTIONS.md) already assigns producer registration, shared scope authorization, and contract routing to Supervisor/Chairman. No frontend-only waiver is approved.

## Previous helper CI and scoped correction

Previous candidate `dcb28066566cae50720dbb9850240f9486a6ec5d` is preserved in
[PR #1785](https://github.com/ajoe734/drts-fleet-platform/pull/1785).
Its [Canonical consistency job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34249961756/job/102141568114)
failed because the diagnosis cited a future parent UAT artifact as an existing
path. The current report links the existing parent runbook instead and describes
the future evidence without a nonexistent file citation. No application or
control-plane code change is needed to correct this helper failure.

This Codex candidate supersedes the old Gemini helper candidate for review;
the old candidate's review and CI do not validate this commit.

## Concrete next step and resume gate

Supervisor/Chairman must register or identify the backend filter producer
(the runbook calls it SR-BOOKING-VERIFY), authorize backend and shared client /
contract scopes, and add its actual task ID to the parent's dependencies through
the supported task-board commands. Contract review must settle combined date,
passenger and status semantics, pagination, and filtered totals. This helper does
not create an unauthorized producer or waive the parent acceptance.

After that producer is accepted and merged, Gemini should rebase the preserved
parent work at `2d469d644499d5f45a81cc7328dac5305a458d78` onto current dev,
consume the server query API, and verify combined/cleared filters, page changes,
and empty results. Recheck authenticated session identity against the delivered
backend. Record base/candidate SHA, real query/total evidence and resource IDs
in the parent UAT artifact specified by its runbook, distinguishing mock unit
coverage from live verification. Run the parent's typecheck and scoped Vitest
commands before committing, pushing, and handing off to Codex.

Parent state remains blocked until this gate is met; the next-step note is
updated via the canonical release status command. This helper delivers a
diagnosis and CI citation correction, not backend filter implementation.

## Verification

- `git fetch origin` and `git rebase origin/dev`: exit 0; assigned branch already current at the inspected base.
- Source inspection above confirms missing list query support on that base.
- `gh api repos/ajoe734/drts-fleet-platform/actions/jobs/102141568114/logs --allow-escape-sequences`: exit 0; identified the single missing-path finding.
- `git diff --check`: required on this report before handoff.
- `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`: required on the committed candidate before handoff.
- No live endpoint, UI, or application test was run for this documentation-only change; parent acceptance remains outstanding.

The exact candidate SHA, branch and new PR are recorded in the helper's machine
state at handoff. Independent review, same-candidate CI and merge remain pending.
