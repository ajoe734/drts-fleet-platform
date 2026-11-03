# R12 existing owned report download: unblock diagnosis

Task: `BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025-UNBLOCK-MANUAL-UNBLOCK`

Owner: Codex; reviewer: Claude2. Inspected 2026-10-28 UTC. Documentation-only delivery.

The parent remains legitimately blocked on runtime acceptance. Its completed qs
dependency removes a Source prerequisite; it does not establish the outstanding
`same_release_actual_daily_preview_and_three_downloads` acceptance key. There is
now a newer failed hosted run than the one named in the parent's current `next`.
The existing bounded-reader child owns the required code repair. This helper
documents that dependency and the subsequent original hosted verification step.

**Pre-merge hold:** Supervisor must update the parent's `next` and persist this
helper's `resolved_parent_status: blocked`, `resolved_parent_next`, and
`resolved_parent_waiting_for: Codex` through the active status CLI before this
helper merges. These writes are denied to this dispatched worker. Without the
disposition, helper completion defaults to resuming the parent as `todo`; that
would misrepresent the remaining runtime blocker. Do not merge this document
until the disposition is present in machine truth. Review can proceed meanwhile.

## Preserved parent identity

| Item                             | Verified value                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Parent owner / reviewer / status | Pi / Claude2 / blocked                                                                                                     |
| Parent candidate                 | `27b7fb31d3777c5e986d54990b2f5a69f497635e`                                                                                 |
| Generation                       | `730b74df53d34e13ad995906f35295c2`                                                                                         |
| Same-SHA review and CI           | Claude2 approved; `ci_sha` matches candidate; CI success                                                                   |
| Parent integration               | [PR #3074](https://github.com/ajoe734/drts-fleet-platform/pull/3074), merged as `da7c5d8c9a405107ccac6a6320aa090479107e31` |
| Source acceptance                | `reviewed_existing_owned_flow_daily_report_coverage` already recorded                                                      |
| qs dependency                    | `DEPENDENCY-QS-1243452-REMEDIATION-20261027` done; merged as `a086b02f94073b304c1ab9a075bce8c486b95657`                    |

No parent restart, reopen, new candidate, role reassignment, Source credit removal,
or acceptance reduction is needed. Preserve the four original write scopes,
both acceptance keys, TEN01–10 and the existing full denominator. The original
finding-by-finding artifact remains unchanged:
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/Pi-BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025-c9c05c7b-verification.md`.

## New hosted evidence and precise limit

[Run 40605219501](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40605219501)
is completed/failure, created 2026-10-27T23:53:55Z. Its original
[owned job 122542926849](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40605219501/job/122542926849)
failed during `Execute one owned synthetic same-order business lifecycle`.
Definition and runtime were both `51628b2b078d07ec759e0804448f7815bbc812ee`.

Official artifact `12780603343` is
`owned-referral-business-51628b2b078d07ec759e0804448f7815bbc812ee-40605219501`.
The retained original ZIP is 1,928,878 bytes, SHA256
`19d6ec8d13fe3c4b984a15106baed3ba9fc5a9a6d654bb8b2764a7d25de89fa8`.
Its `journey-evidence.json` SHA256 is
`8651c2ac9c813278ed3abbe8ead242767a10e7b0eabe358cf90d142322c71fc6`.

Independent readback of that ZIP confirms the first C1 cancelled-order preview
was observed with HTTP 200; all three jobs were accepted with HTTP 201; downloaded
CSV/XLSX/PDF byte/hash checks were observed with HTTP 200 at 1,289 / 7,647 / 67,403
bytes respectively. Each format also has an explicit raw-retention-skipped event.
No `daily-reports/` files are in the ZIP, `dailyReportDownloads` is null, and the
last failure is `bounded-response-exceeded`. Runtime before/after files are byte
equal; `cleanupErrors` is empty. These are partial results, not completion of the
parent's completed-trip report/custody acceptance. Raw retention remains withheld
for unverified sibling rows. No new live service request was made by this helper.

The exact source at that immutable definition places `readCanonicalOrders()`
immediately after the three downloads in `runOwnedDailyReportDownloads`, before
TEN02's source-before evidence. Its real `owned-business.spec.ts` callbacks invoke
`opsControl("/orders")`; `NativeTransport.call` then enforces the generic 1 MiB
response cap and cancels/releases its reader on failure. The controller's
`listOrders` calls `listOrdersForRead()` with no IDs/paging; the production
repository reads committed orders without a LIMIT. This source sequence locates
the failing operation; the actual live response body and exact size were not
retained, so they are not claimed as captured evidence.

## Existing repair and executable next step

`BUREAU-R12-EXISTING-CANONICAL-ORDERS-BOUNDED-READ-20261028` already owns the two
protocol implementation/test leaves. At inspection it is integrating:
`c49442c9c0d9612f95ecfeeccb86897fdc40e728`, generation
`0a4a416fef2344ba89064dab509d02e3`, Claude2 approved,
[PR #3099](https://github.com/ajoe734/drts-fleet-platform/pull/3099) open, CI running,
no merge SHA. Its inspected source retains the general 1 MiB limit and adds a
fixed 8 MiB bound only for the exact authorized canonical orders read. This helper
does not edit, re-review, or borrow that candidate's pending CI as a pass.

1. Supervisor reads the child's latest exact-SHA review, own CI, protected merge
   and required acceptance evidence. Keep its existing owner and serial resource;
   no competing protocol/helper writer is needed.
2. After that repair is accepted, the sole original hosted operator uses the
   existing FULL workflow with a new immutable definition containing the fix and
   verified runtime S. Definition/runtime separation follows the existing
   workflow contract; a test-only repair does not require another deployment.
   Inspect actual completed-trip preview, three downloaded formats, provenance,
   custody, complete-source positive/empty controls and owned cleanup. Do not
   replay the old journal, truncate source orders, or relax privacy retention.
3. Only after actionable new runtime evidence, Supervisor uses the original
   `resume-blocked` to in_progress then `reconcile-candidate` with the original
   parent H/generation/review/CI/merge to restore acceptance routing to Pi/Claude2.
   Verify the Source key and candidate identity stayed intact before recording
   any runtime key. Do not call parent `start` or fresh `handoff`.

## Acceptance / finding evidence

All local paths below use prefix
`/home/lupin/workspace/drts-fleet-platform/.local/unblock-r12-owned-report-download-20261028/`.

| Finding / acceptance                                | Actual basis and change                                                                                   | Verification / result                                                                                                                                                                                 | Outstanding limit                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Diagnose dependency-ready blocked parent            | Active CLI `show` of parent, qs and reader child; PR #3074 identity readback; this document               | CLI/GitHub queries exit 0; `parent-before.json`, `reader-before.json`; qs is done, Source key present, runtime key absent                                                                             | No live acceptance credited                                                           |
| Document only necessary remaining blocker           | Original artifact ZIP and immutable helper/protocol/controller/service/repository source; no product edit | Python ZIP/hash assertions exit 0; `retained-artifact-check.json`; partial preview/three downloads then bounded failure                                                                               | Live body/size absent; full original report/custody incomplete                        |
| Parent Source key and previous fixes                | Original frozen artifact and exact H/gen/review/CI/M above                                                | Read-only identity check; previous clock/row diagnostics evidence retained                                                                                                                            | No rerun of old Source tests needed for this documentation change                     |
| Parent runtime key                                  | Original FULL run/job/artifact and actual call sequence                                                   | Run/job failure; raw retention skipped; summary null; VM browser/runtime checks not run                                                                                                               | Child acceptance/merge then original hosted FULL verification pending                 |
| Task-scoped commit / push / PR                      | Only this specified support artifact                                                                      | Local content, formatting, classification, diff and trailer checks; exact final candidate supplied in CLI handoff and PR                                                                              | Helper CI/review/merge remains lifecycle work                                         |
| Update parent next and preserve blocked disposition | Prepared 1,334-character `parent-next.txt` and `helper-disposition.json`                                  | Parent `note` exit 1: `Dispatched worker cannot mutate a different task`; helper metadata `assign` exit 1: `Dispatched workers must use their assigned task lifecycle commands`; `guard-results.json` | Supervisor must apply both via active CLI before helper merge; no worker fence bypass |

The active CLI is
`/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-22b51a04f524/tools/development-orchestrator/bin/ai-status.sh`.
In its authorized context, Supervisor can use `note <parent-id>` with
`parent-next.txt`, and `assign <helper-id> Codex Claude2` with
`TASK_METADATA_JSON` loaded from `helper-disposition.json`. Read back the parent
identity/keys and all three helper disposition fields afterward. Do not mark
either task done directly. The helper's own progress/handoff carries this same
pending action until Supervisor applies it.

Detailed existing runtime interpretation is retained in
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/Root-original406052-owned516-C1-three-download-events-TEN02-complete-source-size-failure-and-original-owner-next-20261028.json`.
The original ZIP remains at the same directory as
`Owned40605219501-original-M516-artifact-12780603343.zip`; no private order payload,
secret, or raw report file is added to this commit.
