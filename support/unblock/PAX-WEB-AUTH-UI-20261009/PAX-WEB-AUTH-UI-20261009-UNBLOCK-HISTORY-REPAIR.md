# PAX-WEB-AUTH-UI-20261009-UNBLOCK-HISTORY-REPAIR

2026-10-10. Owner: Codex2. Reviewer: Codex. Base: dev.

The current parent history is intact. Earlier scope contamination was repaired
by additive commits, and both published histories remain reachable. The parent
is blocked by **F7: missing canonical auth/account artboards**, not a divergent
branch. This documentation helper must preserve that blocked disposition.

## Audited identities and exact findings

Fetched dev: `5b11155d33fd4d6c345e01cb9730012d3b3d08d1`.
Parent/old-owner merge base with dev:
`e07c0b95110706f32ff78c85ad6a1e30ec4b1d5d`.

| Branch / delivery                                                                                      | Local = fetched remote = live remote = PR head | State                                                                                  |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| codex2/pax-web-auth-ui-20261009, [PR #2514](https://github.com/ajoe734/drts-fleet-platform/pull/2514)  | `c1f92a346b3993ea60e8f66f61b1e06049a87edc`     | Open draft; owner checkpoint, no locked candidate                                      |
| gemini2/pax-web-auth-ui-20261009, [PR #2509](https://github.com/ajoe734/drts-fleet-platform/pull/2509) | `cd783f924c47734fbf6d2e31b4d734e1c8b6536e`     | Open historical former-owner delivery; preserve, do not integrate as the repaired head |

The former head is an ancestor of the current head. There are five former-owner
commits and seven subsequent Codex2 anchors, all passing the formal trailer
check. There is no local/remote divergence, missing published commit or reason
to rebase, reset, amend or force push. Dev's two newer commits concern promotion
smoke migration and deployment; they do not change the visual sources.

| Finding                                                 | Exact introduction / repair evidence                                                                                                                                                                                                                                                                              | Current result                                                                                                                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 shared-source scope contamination                    | `6a61936f67b216347921bbe8b43fa9bb705fecf0` changes shared p5-ui and passenger-client client/types. `bb1f4ac00ea134f9418b82b82b21fe94d245e8ca` still changes p5-ui. `5bee61245f16e3ae94b312b7c25512898b60343c` restores p5-ui; `35dc3959cb53a8feee5f302832dbb9dcb2cec3ae` restores client/types and i18n baseline. | These shared files have zero difference between current parent head and fetched dev. Auth changes use scoped modules.                                                                                |
| H2 committed patch generators                           | bb1f4ac00 adds scratch/patch_account.js, patch_btn.js, patch_callback.js, patch_login.js, patch_route.js and patch_test.js; 5bee61245 deletes all six.                                                                                                                                                            | Absent from current parent tree and final diff; historical commits remain reachable.                                                                                                                 |
| H3 unrelated MAP-QA evidence overwrite                  | 5bee61245 changes the MAP-QA-002 FLEETS-CLOSEOUT-004 proof's generatedAt from 2026-08-14 to 2026-10-10 and branchSha from gemini2/iam-rel-001 to the auth branch, plus formatting. 35dc3959c restores that sidecar.                                                                                               | Exact proof at current parent head equals dev; no cross-task evidence change remains.                                                                                                                |
| H4 missing isolated parent checkout                     | Neither parent branch is registered by `git worktree list --porcelain`; both expected former worker directories are absent. Published refs and PRs remain intact.                                                                                                                                                 | Checkout absence is recoverable from the published current-owner head; it is not source loss. No other worktree or canonical checkout was changed here.                                              |
| H5 dependency checkout contamination                    | Original parent UAT records root node_modules and 21 app/package symlinks resolving into canonical/Gemini worktrees with mixed private Next/API-client types. It records worktree-only unlink plus frozen offline installation and successful rechecks.                                                           | Historical owner evidence only: the former checkout and local logs are gone. This helper does not claim a fresh dependency/typecheck reproduction. Isolate dependencies when restoring the checkout. |
| H6 history-helper routing does not prove history damage | Actual release `blocked_task_triage_kind` selects history_repair before planning_decision if any history marker occurs anywhere in next. Exact parent contains worktree and push in its successful delivery evidence. Replacing only next with the F7-only blocker produces planning_decision.                    | Formal read-only policy probe: exact record history_repair; counterfactual planning_decision. Classifier code was neither edited nor copied.                                                         |

The current parent diff contains exactly 22 paths, all admitted by its live
write_scopes, including the coordinated BFF and existing shell regression test.
No shared p5-ui/client/types, i18n baseline, scratch generator or MAP sidecar
remains in that diff. Inspect the final tree rather than deleting historical
commits that already preserve the repair trail.

## Remaining visual blocker and evidence continuity

The [original parent UAT at the audited head](https://github.com/ajoe734/drts-fleet-platform/blob/c1f92a346b3993ea60e8f66f61b1e06049a87edc/docs/04-uat/passenger-app-20261009/PAX-WEB-AUTH-UI-20261009.md)
retains both adjacent independent reviews, at 6a61936f67b216347921bbe8b43fa9bb705fecf0
and bb1f4ac00ea134f9418b82b82b21fe94d245e8ca, and the later per-finding repair
ledger. Its SHA256 is
`c30e6e5cff74ee3add39c463fc47191916a13b989480177e03f0d82ba9551250`.
The [existing screen-requirements note](https://github.com/ajoe734/drts-fleet-platform/blob/c1f92a346b3993ea60e8f66f61b1e06049a87edc/docs/05-ui/passenger-app-auth-screen-requirements-20261010.md)
has SHA256 `569e6ededbf807cdd1e22c5d8931a0e829285106b01e1ba8d815ebf2c4700932`.
Both were read from the exact Git object and saved as local snapshots; this
helper adds history evidence without replacing either original ledger.

Passenger.html mounts p5-01 through p5-12, p5-a03, p5-a04, e18, e18b, e19a,
e19b and e19b-off. Passenger realm tokens and those ride/fare/receipt artboards
do not provide login, OTP, OAuth callback, consent, profile, contact verification,
link/unlink, logout or delete-account screens. F7 remains open after two adjacent
reviews. The latest canvas-only instruction requires STOP; neither successful
functional checks nor a status change supplies visual authority.

Existing planning [PR #2516](https://github.com/ajoe734/drts-fleet-platform/pull/2516)
already routes that screen matrix to Supervisor. Reuse its coordination rather
than generating another design decision. Legal text/configuration, independent
same-SHA review, full candidate CI and hosted product acceptance remain pending.
Parent [CI 38032153402](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38032153402)
and draft integration 38032153401 are completed successful checkpoints as
confirmed by live PR checks; the parent ledger distinguishes synthetic merge
checkouts and skipped draft jobs. This helper did not rerun or reaccept those
product checks, and does not claim either named parent acceptance key passed.

## Non-destructive continuation

1. Preserve current-owner PR #2514/head c1f92a346 and former-owner PR #2509/head
   cd783f924. Do not merge the stale former-owner PR to bypass repaired scope.
2. Codex coordinates Supervisor to deliver committed canonical Passenger
   auth/account screen paths, real artboard IDs and source version, using the
   existing requirements and planning helper. Keep parent blocked until then.
3. On authorized parent resume, Supervisor restores its isolated checkout from
   the existing local branch after fetching and comparing local/remote/PR heads.
   If local branch is missing, recreate it from origin/codex2/pax-web-auth-ui-20261009,
   never from dev. A safe recovery command when no worktree is registered is:

   ```bash
   git worktree add /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-pax-web-auth-ui-20261009 codex2/pax-web-auth-ui-20261009
   ```

   This is a documented command, not executed by this helper. If refs diverge
   or the path is occupied, preserve both sides and report evidence instead of
   forcing checkout. Keep this helper in its assigned cwd.

4. Use dependencies installed inside that restored worktree. Inspect all root,
   app and package node_modules symlink targets before checks; avoid resolution
   into another task. Do not delete canonical dependencies or user data.
5. Codex2 matches auth/account UI to the delivered artboards, references their
   IDs in the original UAT, preserves F1–F6/F8/F9 regressions and revalidates.
   If dev synchronization is necessary before handoff, merge origin/dev and
   normally push; keep published history intact. New SHA requires new review/CI.
   Browser/PG/runtime acceptance uses authorized hosted infrastructure only.

## Required machine coordination before helper handoff

The release gateway rejected both bounded owner attempts, exit 1:

- `note` on the parent: **Dispatched worker cannot mutate a different task**.
- `assign` on this helper with TASK_METADATA_JSON preserving its owner/reviewer
  and setting the disposition below: **Dispatched workers must use their
  assigned task lifecycle commands**.

The guard is in the active release's `TaskBoardCommandExecutor._guard_worker_command`.
No dispatch variables were unset and no operator identity was impersonated.
Parent status was not changed. This is a machine coordination blocker, not a
request for the user to authorize history rewriting.

Supervisor must use the same active release gateway to write the parent next
step and the following helper metadata before this helper can be handed off:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Codex",
  "resolved_parent_next": "No divergent auth history remains. Preserve Codex2 head c1f92a346b3993ea60e8f66f61b1e06049a87edc and draft PR #2514, and former-owner PR #2509. F7 remains open: Codex coordinates Supervisor for committed canonical auth/account screen paths, artboard IDs and version per planning helper #2516. After source delivery and resume gate, restore the isolated Codex2 parent checkout from its published head, match UI to canvas, append original UAT evidence and revalidate both acceptance keys with new same-SHA review/CI. Legal content/configuration and hosted acceptance remain pending. History audit does not authorize visuals."
}
```

Without explicit disposition, `apply_unblock_parent_resolution` defaults to
todo when a helper completes. That would incorrectly resume the unresolved F7
parent. Keep this helper blocked awaiting Supervisor/Codex coordination; do not
submit an unsafe candidate merely because its documentation is ready. Once the
metadata and parent next are verified, handoff the unchanged pushed helper SHA
to Codex with its PR. Review/CI/merge remain separate lifecycle gates.

## Verification ledger (AI_COLLABORATION_GUIDE §0.7)

Machine evidence is under `.local/pax-auth-history-repair/` in this assigned
worktree. Python 3.12.3; Git object/PR probes; no product runtime is needed.

| Finding / acceptance             | Formal source / bounded change                                  | Commands and result                                                                                                                                                                                                  | Unverified / limit                                                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identify exact contamination     | H1–H6 above; original UAT and Git commit/tree/PR objects        | Read-only `python3 .local/pax-auth-history-repair/audit.py`, exit 0; audit.json and audit.log. Verifies both branches' four-way SHA equality, ancestry, 22 allowed paths, restored shared files and removed scripts. | First probe incorrectly expected p5-ui still dirty at former final head; assertion failed. Corrected after exact diff showed its earlier restoration at 5bee61245; rerun passed. Not a product test failure. |
| Non-destructive repair path      | Published additive repairs and continuation above               | `git merge-base --is-ancestor` former/current: exit 0. Exact restored MAP proof diff: exit 0. Parent trailer checker: 12 commits OK, exit 0.                                                                         | Worktree restoration and dependencies documented, not performed; parent remains blocked on F7.                                                                                                               |
| Triage reason                    | Actual release chair policy                                     | Exact parent history_repair; changing only next yields planning_decision, exit 0.                                                                                                                                    | Diagnostic probe only; no classifier behavior change.                                                                                                                                                        |
| Scoped commit/push/PR            | Only this helper artifact; task trailers and normal publication | Anchor/final SHA, ordinary push and PR identity recorded by release progress after comparison. Content/reference and full helper-range checks recorded below.                                                        | No parent commit or PR modification; helper review/CI/merge pending.                                                                                                                                         |
| Update parent concrete next step | Gateway attempts and explicit disposition above                 | Both state writes rejected, exit 1; parent-note.log / helper-metadata.log. Helper's own lifecycle message carries the exact coordination request.                                                                    | Supervisor must apply parent next and helper disposition before handoff; this acceptance remains blocked.                                                                                                    |

No VM product, preview, browser/E2E or DB server, Docker Compose, deployment,
external OAuth/SMS/PSP request or new hosted workflow dispatch was started.

## Publication and scoped checks

Anchor `3d90fc82dd0bd29d2df44d61f81edd33e383ee03` was committed and normally
pushed on the assigned branch. [Helper PR #2518](https://github.com/ajoe734/drts-fleet-platform/pull/2518)
targets dev and remains draft pending the explicit Supervisor disposition.
The final documentation head is recorded by the release lifecycle message after
local, live remote and PR head equality is checked; it is not a review candidate.

Checks completed at the anchor:

- `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`:
  exit 0, zero findings in all four categories; canonical.log.
- `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`:
  exit 0, one helper commit OK. The parent range independently passes all 12 commits.
- `node tools/ci/check-repo-classification.mjs`: exit 0, 6216 files classified.
- `git diff --check`: exit 0.
- Initial `pnpm exec prettier --check` on this document returned exit 1 for
  formatting. `prettier --write` and the corrected check both returned exit 0.
  No missing-dependency or product-test failure is being reported as a pass.

The final ledger update is checked again before its additive commit/push. Its
formatting/content/trailer/classification results and exact published identity
are recorded in the helper lifecycle message after results are read. Automatic
PR CI is separate from these local checks; only observed completed results may
be claimed. No helper handoff, review, merge or done is claimed while parent
coordination remains unwritten.
