# SR-PROOF-001 manual unblock diagnosis

Owner: Codex2. Reviewer: Codex. Checked: 2026-09-08.
Base: `e97653b7ffb962a6c4d688e8706711d860fa3604` (`origin/dev`).

## Result

The parent remains legitimately blocked on supervisor scope/dependency routing.
Dependency-ready does not mean implementation-ready. This helper documents the
remaining blocker; it does not authorize shared writes or claim payment acceptance.

Current task slices show parent owner Codex2/reviewer Codex, status blocked, with
only SR-ARTIFACT-001 and SR-INVOICE-001 dependencies. Both are done and their merge
SHAs `3e1904b1318a3252d3f7b5673173608fd6d12f71` and
`a4876ac529abfb634c2b96f237116202abf3d87d` are ancestors of this base.
Their historical review/CI gaps remain explicitly recorded in machine truth.

The parent still excludes billing repository/module, proof storage/scanner leaf
files, migrations and shared contracts from write_scopes. The execution runbook
rules 4 and 7 require supervisor scope/dependency coordination and dedicated
migration allocation. SR-CONTRACT-001 remains todo, now owned by Codex with
Codex2 reviewing; its schema-allocation.json artifact is absent at this base.
Adding that dependency alone is insufficient: supervisor must explicitly route
proof allocation into its scope or record an authorized alternative.

Source inspection of billing-settlement.service.ts, markReimbursementPaid
(lines 2580–2678 at this base), confirms only a nonempty proof ID is required;
there is no existence, batch ownership or scan lookup in that path. It changes
memory to paid before calling persistChanges without awaiting it. These are
current source observations, not a newly executed behavioral reproduction.

## Concrete next action

Supervisor should update the parent through the released task-board commands:

1. Route proof contracts and migration allocation to SR-CONTRACT-001, adding
   the dependency, or record an explicit approved allocation alternative.
2. Approve exact billing-settlement.repository.ts/module.ts and proof
   storage/scanner/readback leaf paths, including transaction/CAS receipt work;
   coordinate overlapping writers through dependencies before dispatch.
3. Route upload/scan/reject/readback states for platform-screens-3.jsx
   PA_Reimbursements/PA_ReimbursementDetail to an authorized design scope.
4. Select a recovery branch for current owner Codex2. Preserve published parent
   history; PR #1699 is an open draft at
   `acd6b7bb4d32329986a04cd6050624bc1fc39f34`, not an accepted candidate.
   Recover only parent tests/evidence on current dev, resolve existing conflicts,
   implement the authorized flow, run parent checks, then push and hand off
   the exact SHA to current reviewer Codex.

The earlier planning and history-repair artifacts in this directory remain
useful rationale. Their older lane assignments are superseded by the task
slices above. Keep the parent blocked until these routing actions are recorded;
repeated dependency-ready owner dispatch cannot expand its authorized scope.

## Verification and limits

- `git fetch origin && git rebase origin/dev`: exit 0, up to date.
- `git merge-base --is-ancestor <merge SHA> origin/dev`: exit 0 for each
  dependency SHA listed above.
- Released `ai-status.sh show` for this helper, parent, both dependencies and
  SR-CONTRACT-001: exit 0; no full status-file read.
- `gh pr view 1699 --json url,headRefOid,state,isDraft`: exit 0, OPEN draft,
  head as above; https://github.com/ajoe734/drts-fleet-platform/pull/1699.
- `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/`: exit 1,
  no test files found (also emitted unresolved vitest/config warning). The
  parent test directory is absent on this dev base. Earlier 1-pass/2-fail
  results are historical branch evidence and were not reproduced here.
- This change is one support Markdown artifact. No product changes, live
  upload/scanner/payment operations or product typecheck acceptance claimed.

Delivery commit, ordinary push, PR and exact candidate SHA are recorded in the
helper handoff. The parent blocker/next step is updated through ai-status.sh.
