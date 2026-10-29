# R12 report route: unblock diagnosis and acceptance handoff

Task: `BUREAU-R12-EXISTING-REPORT-ROUTE-DISPATCH-20261026-UNBLOCK-MANUAL-UNBLOCK`

Owner: Codex; reviewer: Claude2. Inspected 2026-10-29 UTC. Documentation-only change.

The dependency-ready parent is blocked on its second acceptance key, not on
route implementation. Its October 28 `next` still waits for a producer repair
and another preview/download run. Newer original hosted execution already
provides a normal completed main-order preview and three actual downloads.
The next action is to qualify this retained evidence through the existing
acceptance lifecycle. Another route patch, deployment or FULL run is not needed
to obtain that evidence.

**Pre-merge hold:** Supervisor must update the parent's `next` and persist this
helper's `resolved_parent_status: blocked`, `resolved_parent_next`, and
`resolved_parent_waiting_for: Codex` through the active status CLI before this
helper merges. This dispatched worker attempted both writes; the gateway denied
them. Do not merge until those fields are present. Helper completion otherwise
defaults to `todo`, which would lose the distinction between merged Source and
pending acceptance. Review of this document can proceed while that write waits.

## Preserved parent and original finding

| Item                          | Verified value                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Parent                        | `BUREAU-R12-EXISTING-REPORT-ROUTE-DISPATCH-20261026`                                                                   |
| Live owner / reviewer / phase | Codex / Claude / blocked                                                                                               |
| Frozen candidate              | `f00ad7ee752b9e461a6b231796834b8a4136414e`                                                                             |
| Generation                    | `4615cb77349344d99556c9788aff2e07`                                                                                     |
| Historical source review      | Pi, matching candidate SHA; frozen handoff names Pi                                                                    |
| Same-SHA CI                   | success, `ci_sha` equals candidate                                                                                     |
| Integration                   | [PR #3048](https://github.com/ajoe734/drts-fleet-platform/pull/3048), merge `680bd56300aa32616cb5dcb1887dbbad0236aaaf` |
| Recorded key                  | `reviewed_existing_report_route_dispatch`                                                                              |
| Outstanding key               | `same_release_existing_daily_preview_and_three_downloads_after_dispatch_fix`                                           |
| Dependencies / scopes         | No dependencies; only `apps/api/src/app.module.ts` and `tests/unit/report-route-dispatch-20261026.test.ts`             |
| Acceptance review request     | `4bffa862655241238f758df2b0cb166e`, declined by Pi on October 26                                                       |

The latest full rejection/disposition is the parent's declined request. It found
no route-source repair necessary. Original run `40333599238` failed the compound
dispatch/assignment field assertion before its downloads. Which field failed
remains unknown; the independently reproduced producer ETA-zero loss is not
proof of that old live cause. Preserve that finding and the existing Source
credit. The later successful run supersedes the need to repeat the old failure,
without rewriting its history.

The original finding-level artifact remains unchanged:
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/Codex-R12-report-route-f00ad-original-source-verification-and-Pi-handoff-20261026.json`.
Its acceptance audit and scope-coordination sections remain the original repair
boundary. This helper does not edit the producer or the hosted consumer.
The original artifact SHA256 remains
`f7ea6d0995755de23d0054c359992dfd1c81f149dda66d18e6a0a7e5c8a1ec31`.

Live reviewer Claude differs from historical reviewer Pi. Both identities are
reported explicitly; this helper does not reassign either task or substitute
Claude2's helper review for parent acceptance authority.

## New retained runtime evidence

[Original FULL run 40681440811](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40681440811)
and its [owned job 122792863098](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40681440811/job/122792863098)
are completed/success, independently read back from GitHub during this task.
The test definition is `ad13694ccfc868aaa59b967200ac443029b9787a`; the product
runtime is `1a3fbf8bca9e607085eb0c2e670b46763331f1da`. Those are separate
identities under the existing workflow contract, not a release mismatch.

Official artifact `12813715678` has 43 CRC-clean members, 2,202,085 bytes and
GitHub digest/local ZIP SHA256
`d21fb4145e497013485827babb3e9b6428ba3851d18ba73fd24bfcce0900c040`.
The retained ZIP is at
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/Owned40681440811-original-Mad13-runtime1a3-artifact-12813715678.zip`.
Its `journey-evidence.json` SHA256 is
`1e76538a1cadc8f41f235ea7c3ba6019b84bcef4363efa8a3668ddf8c12b80af`.

Offline assertions against that original ZIP confirm:

- Normal `full-journey`, completed, no recovery, acknowledged booking and
  `cleanupErrors: []`.
- The completed main-order report has an own-row-verified preview HTTP 200.
  The same report order ID correlates its three accepted jobs (HTTP 201) and
  three verified downloads (HTTP 200). This is the final normal main report,
  beyond the earlier C1 cancelled-order evidence.
- CSV/XLSX/PDF have 10,923 / 10,842 / 91,052 bytes respectively, with retained
  hashes, manifest hashes, matching content signatures, own-order presence and
  completed immutable jobs. Each summary binds the same runtime SHA.
- Five-service runtime snapshots are byte-identical before and after and all
  five SHA fields match the product runtime above.
- Both original route-scope files are byte-identical between candidate `f00ad`
  and runtime `1a3`; merge `680bd` is an ancestor of both definition and runtime.

Raw main report files were intentionally withheld because unverified sibling
rows were present. The accepted consumer validates actual downloaded bytes and
records safe content facts; it forbids retaining such raw files. This offline
audit correlates those hosted facts and does not claim to reparse absent bytes.
No private report rows or raw payloads are added to this commit.

## Actual consumer and remaining lifecycle boundary

Read at immutable definition `ad13694`, not inferred from a summary:

- `tests/e2e/owned-referral-business-journey/daily-report-downloads.ts`,
  `validateReportRows` (line 660; checks at 787–839), still requires parseable
  `firstDispatchAt` and `firstAssignedAt`, plus finite nonnegative
  `etaSecondsAtAssignment` for the normal main row. The successful own-row
  result therefore retains the original dispatch-field boundary.
- `runOwnedDailyReportDownloads` clicks the actual job-row download button at
  line 2537, checks detail/artifact HTTP 200 and runtime, and invokes
  `validateDailyReportArtifactDownload` at line 2583. That function (line 1009)
  validates production job rows, preview correspondence and CSV/XLSX/PDF
  contents. Its raw-retention restriction remains at lines 1123–1132.
- `tools/development-orchestrator/bin/ai_status.py`,
  `unblock_parent_resolution_fields` and `apply_unblock_parent_resolution`,
  explain the mandatory blocked disposition before helper merge.
  `validate_merged_acceptance_resume` requires exact current identity,
  dependency and blocker snapshots, no unfinished helper, and no conflicting
  acceptance request. Only Supervisor may use `command_resume_blocked`.
  `command_record_acceptance` requires the parent already be in acceptance.

Do not import the separate download-coverage task's older reopened request or
planning-helper blockers into this route task. This route's request is declined.
Its current manual helper itself must finish before the merged-acceptance resume
can be admitted. No parent lifecycle transition or acceptance credit was made
by this worker.

The independent earlier runtime qualification is
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/Root-independent-original-R12-H27-core-runtime-key-FULL406814-main-three-downloads-fulfilled-and-existing-native-route-history-boundary-20261029.json`
(SHA256 `d0f843dc5cd550ca658940969e3f5637ffc73783cdc57d5ecd451490e9d660ae`).
It originally qualifies a different task/key. This helper independently checks
the official archive, original route-file inclusion and strict dispatch-field
validator for this route key; it does not copy the other task's acceptance credit.

## Executable next step for Supervisor

Machine-specific evidence and prepared inputs use the absolute directory
`/home/lupin/workspace/drts-fleet-platform/.local/unblock-r12-route-dispatch-20261029/`.

1. In the authorized Supervisor context, use the dispatch-specified active CLI
   below to `note` the parent with `parent-next.txt`. Use `assign` for this
   helper, retaining Codex/Claude2, with `TASK_METADATA_JSON` loaded from
   `helper-disposition.json`. Read back the parent's identity and Source key,
   and all three helper disposition fields. These are pending writes, not
   actions this document claims to have completed.
2. After exact-SHA helper review, CI and merge finish, read fresh parent,
   dependency and open-blocker snapshots. Use the existing
   `merged_runtime_acceptance_ready` Supervisor resume transaction to restore
   acceptance on the same parent candidate/generation. Respect the guard's
   exact-one-open-blocker and completed-helper requirements; if it refuses,
   report that precise reason rather than bypassing it. Do not use `start`,
   a fresh parent `handoff`, or source reopening.
3. Original authorized parent roles qualify this run against
   `same_release_existing_daily_preview_and_three_downloads_after_dispatch_fix`
   and record it through `record-acceptance` if accepted. Preserve Source credit,
   the declined request and original scopes. Any outstanding wider TEN01–10,
   template, Attachment 5 or other task requirements keep their own scope;
   they do not become additional gates on this specific route key.

Active CLI:
`/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-8295d1f33455/tools/development-orchestrator/bin/ai-status.sh`.
The prepared parent `next` is 1,533 characters, within the 4,000-character limit.
Do not remove dispatch environment fences or impersonate Supervisor to apply it.

## Finding and acceptance evidence

All short evidence paths below are relative to the absolute local directory
above. Machine-specific evidence is not staged as canonical product content.
The retained artifact audit SHA256 is
`9447d2fca2a1f01c445180bc52faacd5c9c6786be5170abb99beb9bb01cee308`.
Scoped Prettier, repository classification (7,552 files), `git diff --check`,
and the document/identity/reference assertions all completed with exit 0.

| Finding / acceptance                                | Source basis and change                                                     | Command / result / evidence                                                                                                                                                                                                                   | Remaining limit                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Diagnose dependency-ready blocked parent            | Current parent CLI slice; frozen request, scopes and keys; this document    | Active `show`, `gh pr view 3048`: exit 0; `parent-before.json`; original route already merged, runtime key unrecorded                                                                                                                         | Parent still blocked pending authorized lifecycle action                                    |
| Document only necessary unblock                     | Original artifact plus immutable `validateReportRows` and download consumer | Offline `python3 -` ZIP/hash/event/runtime/source assertions: exit 0; `retained-artifact-check.json`; immutable helper copy and source pins retained locally                                                                                  | Main raw files intentionally absent; original old failed field remains unknown              |
| New runtime evidence / prior Source regression      | Official run, job and artifact; route merge ancestry and both scoped blobs  | `gh run view 40681440811`, `gh api repos/ajoe734/drts-fleet-platform/actions/artifacts/12813715678`, `git show`, `git merge-base --is-ancestor`: exit 0; `hosted-run.json`, `official-artifact-metadata.json`, `retained-artifact-check.json` | Evidence qualification only; no new unit, browser, deployment or runtime execution          |
| Update parent next and preserve blocked disposition | Prepared `parent-next.txt`, `helper-disposition.json`                       | Parent `note`: exit 1, `Dispatched worker cannot mutate a different task`; helper metadata `assign`: exit 1, `Dispatched workers must use their assigned task lifecycle commands`; `guard-results.json`                                       | Supervisor must apply both before helper merge; current acceptance item not fully satisfied |
| Task-scoped commit / push / PR                      | Only this specified support artifact                                        | Scoped format, classification, diff and trailer checks; final full candidate/branch/PR recorded in CLI handoff                                                                                                                                | Helper review/CI/merge remain lifecycle work; no direct `done`                              |

This documentation change requires content, reference and formatting checks.
Product unit tests and hosted reruns are not needed to repeat already accepted
route code. No product server, browser runner, Docker infrastructure or
deployment was started on this VM.
