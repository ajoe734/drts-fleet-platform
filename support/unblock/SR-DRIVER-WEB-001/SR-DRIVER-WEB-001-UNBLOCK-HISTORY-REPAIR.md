# SR-DRIVER-WEB-001 history repair audit

Inspected 2026-09-08. Owner Codex2; reviewer Codex. Documentation-only helper;
no UI, shared configuration, parent ref, or historical PR was modified.

## Findings

- Fetched `origin/dev`: `f372e4a6a0dd16204ccbd660f23013601357c224`.
  Assigned helper worktree is `.artifacts/worktrees/auto/codex2-sr-driver-web-001-unblock-history-repair`,
  branch `codex2/sr-driver-web-001-unblock-history-repair`; initially clean.
  `git rebase origin/dev` exited 0, already up to date.
- Parent local and remote `codex2/sr-driver-web-001` both resolve to
  `f2a85c11ff95255ee033f399dbd7af998a0e4404`. No parent worktree is currently
  registered. The parent has no PR on this branch and no locked candidate.
  Its merge base with fetched dev is `3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e`.
- Historical reconstruction points at `786a0026f7ef48528e81ecf6fd1d6fd0230194b0`,
  which is on `origin/gemini2/sr-driver-web-001`, not the current Codex2 rail.
  Historical PR [#1660](https://github.com/ajoe734/drts-fleet-platform/pull/1660)
  remains OPEN at that SHA. Its three-file diff includes a different 593-line
  web component and `driver-trip-map-web-split.test.ts`. Do not treat that PR's
  candidate, reviewer trailers, or old CI as evidence for the current owner rail.
- Current parent history has duplicate rebased anchors preserved by merge commits:
  `8e5ceae86ac1ab8454503d568be668380b512160` joins `df5156939` and `b148247c7`;
  `b4e426fdcb1a545c90a4abb612df6bfb12867e8e` joins `1754c0dcc` and `c10b64010`.
  The parent's report records an add/add conflict in `platform-map.test.ts`
  during rebase, followed by restoration of published contents and ancestry merges.
  This is duplicate history, not evidence of unrelated product-file contamination.
- Verified `git diff c10b64010 b4e426fdc -- apps/driver-app tests/unit/system-remediation/sr-driver-web-001 docs/04-uat/system-remediation-20260906/SR-DRIVER-WEB-001.md`
  exits 0 with no output. Current parent triple-dot diff contains exactly four
  permitted paths: the web map entry, parent UAT report, platform-map test and
  Metro worktree harness. Native `driver-trip-map.tsx` equals fetched dev (exit 0).

## Non-destructive continuation

No history rewrite is required to recover current work. Preserve both published
rails and #1660 as historical evidence; do not merge that stale candidate into
the current parent or transplant its acceptance claims. Supervisor/reviewer
should reconcile #1660 as superseded when selecting the current delivery PR.

On parent redispatch, reuse its registered worktree if one now exists; otherwise
attach the existing local `codex2/sr-driver-web-001` branch to an isolated
supervisor-assigned worktree. Verify cleanliness and local/remote heads first.
Never switch canonical root or reset/delete the published branch.

Fetch and follow the mandated `git rebase origin/dev` protocol. Because the rail
is already published, a changed rebase SHA alone is not normally pushable.
Before pushing, preserve the fetched published head by a normal merge into the
rebased parent, as the previous two continuations did; inspect any duplicate
anchor conflicts against `f2a85c11f` and validate the complete scoped tree.
If conflict intent cannot be established, abort the operation and record a blocker.
Check `git merge-base --is-ancestor origin/codex2/sr-driver-web-001 HEAD` exits 0,
then use only normal push. If remote advances again, fetch and reconcile; never
force-push. Do not perform another rebase/merge solely to tidy history.

## Actual remaining parent gate

The latest canonical parent slice is blocked on scope, not loss of commits:
`apps/driver-app/metro.config.js` is not authorized, dependencies are empty,
and prior web export failed resolving SQLite `wa-sqlite.wasm`. Planning helper
PR #1768 did not grant scope. Supervisor must authorize that narrow configuration
scope with the necessary dependency/runbook reconciliation, or register a bundler
producer and parent dependency through machine truth. Keep the parent blocked
until this is recorded; merging this history helper is not authorization.

Then preserve the current map split, reproduce and fix the actual bundler error,
run the parent test/typecheck/export plan and browser-check `/`, `/onboarding`,
`/sos`. Record fresh base/candidate evidence, normal push, a current-rail PR and
handoff to Codex. Historical native export is not device acceptance.

## Verification and delivery

This helper ran fetch, worktree/ref/ancestry inspection, scoped tree comparisons,
and GitHub PR lookup successfully. `git diff --check` is the documentation gate.
Application tests, exports, browser/live/device checks were not rerun here;
the parent UAT report is historical evidence, not new successful acceptance.
The helper's exact commit, normal push, PR and locked candidate are recorded in
its machine-truth handoff. Parent remains blocked pending scope authorization.
