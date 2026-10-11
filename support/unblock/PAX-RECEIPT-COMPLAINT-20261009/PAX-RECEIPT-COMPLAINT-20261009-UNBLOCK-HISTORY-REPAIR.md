# PAX-RECEIPT-COMPLAINT-20261009 — history and worktree recovery

Owner: Codex2. Reviewer: Codex. Evidence collected: 2026-10-11 UTC.

## Finding and disposition

The published parent history is intact. No local/remote divergence, foreign
task commit, stale PR head, or complete-candidate declaration was found in the
audited range. The parent remains blocked by documented source and scope gaps,
not a history rewrite that needs to be repaired.

The original isolated parent worktree was absent at inspection. It has been
restored from the existing parent branch at its exact published checkpoint and
locked for original-owner continuation. This restores committed source only;
it does not recover ignored dependency installations or the original local
test logs, and it does not satisfy product acceptance.

**Keep the parent `blocked`, waiting for Codex/Supervisor scope coordination.**
The helper must not automatically resume the parent when its report merges.
The active release's worker guard rejects parent updates and helper metadata
assignment from this dispatch. Supervisor must record the disposition below
through the release CLI before helper completion. This prerequisite remains
open; it is not silently replaced by a textual completion claim.

## Exact identities and evidence

| Object                             | Observed identity                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Parent branch                      | `codex2/pax-receipt-complaint-20261009`                                                                                                                |
| Local parent head                  | `cec585cc397eacbdf78a7d022771e1383e08e56c`                                                                                                             |
| Published parent head              | `cec585cc397eacbdf78a7d022771e1383e08e56c`                                                                                                             |
| Parent PR                          | [#2556](https://github.com/ajoe734/drts-fleet-platform/pull/2556), OPEN, draft, head `cec585cc397eacbdf78a7d022771e1383e08e56c`, base `dev`, MERGEABLE |
| Parent source base / merge base    | `62a73710e87c0163c7e82a5956612be558e554bf`, delivered Booking PR #2553                                                                                 |
| Fetched `origin/dev` / helper base | `2f6ec0ccbb7f102a99052fc7a08995056ebb1ea4`, delivered web-auth PR #2554                                                                                |
| Parent lifecycle at inspection     | `blocked`, waiting for `Codex`; no `candidate_sha`, candidate generation, review, merge or acceptance evidence                                         |
| Helper branch                      | `codex2/pax-receipt-complaint-20261009-unblock-history-repair`                                                                                         |
| Assigned helper cwd                | `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-pax-receipt-complaint-20261009-unblock-history-repair`                     |
| Restored parent cwd                | `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-pax-receipt-complaint-20261009`                                            |

`git rev-list --left-right --count <local-parent>...<remote-parent>` returned
`0 0`. Against fetched `origin/dev`, the parent returned `1 6`: one already
merged web-auth trunk commit and six additive receipt-task commits. Trunk
advancement is not evidence of task contamination or a reason to rewrite the
published receipt branch. The common ancestor is the delivered Booking base.

The six commits, in publication order, are:

1. `ae81074f47e69247fc2e3b3c494edfcbcee48c78` — durable passenger complaint intake.
2. `4942c7b8c415596b267c322872d503f112bf5899` — intake regression and source gaps.
3. `abf5e684cf4464fa0f36d0dcf534d53a651f060a` — certificate downloads and E-04 validation.
4. `c73130060764682c84e1ec5d4d5d0f44583cf355` — download regressions and source boundaries.
5. `410ca2889de126f449d4b436d08b1350994d610d` — rating transaction and Ops reads.
6. `cec585cc397eacbdf78a7d022771e1383e08e56c` — rating regressions and remaining boundaries.

All six subjects start with the parent Task-ID and all six bodies contain the
exact `LLM-Agent: Codex2`, parent `Task-ID`, and `Reviewer: Codex` lines. The
existing commit checker passed all six. Their 30 changed paths fit the parent's
registered path scopes; this is a path-level audit, not a new approval of every
semantic hunk or an expansion of the supplement's method-level limits.

The original finding/evidence record remains the committed
[`docs/04-uat/passenger-app-20261009/PAX-RECEIPT-COMPLAINT-20261009.md`](../../../docs/04-uat/passenger-app-20261009/PAX-RECEIPT-COMPLAINT-20261009.md)
on the parent branch at `cec585cc`. It is not present on this helper's trunk base.
Its prior failed and passed checks remain historical evidence; this helper has
not rerun or upgraded them into acceptance.

The task activity record identifies the parent's 09:53:50 blocker and the
10:02:59 helper-creation reason, “reconcile draft/handoff/done against normally
pushed branch and authorized receipt HTML/PDF guards.” The audited facts
already agree: published checkpoint and draft PR, with no candidate/handoff or
done claim. No evidence identifies why the original worktree was removed;
absence alone does not establish data loss, rebase, or a cleanup actor.

## Non-destructive repair performed

Before repair, both `ls -ld <parent-cwd>` and the worktree registry confirmed
the parent cwd was missing, while the local branch, remote branch and PR head
still pointed to `cec585cc`. The helper working tree was clean on its assigned
branch. From that unchanged helper cwd, this command completed with exit 0:

```bash
git worktree add --lock \
  --reason 'Preserve PAX receipt original published checkpoint cec585 for owner continuation; history helper does not resolve product blockers' \
  /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-pax-receipt-complaint-20261009 \
  codex2/pax-receipt-complaint-20261009
```

Post-repair `git -C <parent-cwd> rev-parse HEAD` returned the full `cec585cc`
SHA, `git -C <parent-cwd> status --short` was empty, and `git worktree list
--porcelain` showed the correct branch and preservation lock. The parent's
local and published refs were unchanged. The helper stayed on its assigned
branch; the canonical root checkout was not switched.

No reset, rebase, amend, stash, force push, parent source edit, branch deletion,
or product runtime/deployment was performed. Supervisor should retain the
parent worktree lock until original source continuation is safely anchored.
The new worktree needs its own dependency/hook preparation by the resumed
owner before repository checks; the recovery does not claim those are ready.

## Remaining parent findings and concrete continuation

The parent's latest complete UAT finding matrix at `cec585cc` remains the
authority for original implementation and acceptance. Static inspection of
the actual source confirms these open boundaries:

| Finding / trigger                                 | Actual source at `cec585cc`                                                                                                                                                                                                                                | Concrete next repair boundary                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-AUDIT-ACTOR / root typecheck TS2322             | `platform-admin-regulator-cases.service.ts`, `listRegulatorCaseAccessLogs`, line 127 maps `AuditLogRecord.actorType`; `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`, `SandboxRegulatorCaseAccessLogRecord`, line 2373 omits `first_party_passenger` | Supervisor registers the precise DTO/mapper and affected-consumer test scope on the original parent; owner implements the lawful representation with original actor provenance and no type cast or system impersonation.                                                              |
| F-BOOKING-FIXTURE / four affected tests           | `tests/unit/pax-booking-history-20261009/booking-access.test.ts`: identity fixtures and the rating delegation test still target the prior contract                                                                                                         | Register only the actual identity/rating-dependency fixture seam; retain Booking ownership negatives and R2/R9 behavior; owner repairs the fixture against the real production path.                                                                                                  |
| F-CURRENT-RECEIPT / regenerated receipt selection | `MultiTaxiRepository.findElectronicReceipt`, lines 1934–1948, selects by `order_id` with `LIMIT 1` and no current/version selection                                                                                                                        | Register the precise method-level read scope; owner aligns current-version selection with the canonical certificate repository and validates legacy/platform paths and regeneration. The existing grant for `persistPassengerRating` does not authorize this method.                  |
| F-E04 / missing lawful captured fields            | `OwnedMobilityService.buildMultiTaxiCertificateEvent`, lines 7512–7573, returns aggregate fare/toll and no fleet issuer, driver surname, four actual fare components or payment capture                                                                    | Supervisor resolves the actual upstream command/UI/completion/payment capture boundary and registers its callers/tests. Owner preserves the existing fail-closed receipt and source probe failure until real facts exist; do not substitute quotes, zero values or sample identities. |

The exact parent-head hosted run
[38129504495](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38129504495)
is **completed / FAILURE**. Its Product smoke Typecheck step contains the
actual TS2322 above and exits 2; migration, root unit and API unit steps are
SKIPPED. The failed logs were read during this audit. The separate draft
ci-integ run [38129504578](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38129504578)
does not replace the failed product gate.

After the precise boundaries are registered, Supervisor can resume the
original Codex2 owner in the restored parent worktree at published `cec585cc`.
Keep PR #2556 and the six published checkpoints. If actual composition with
new `dev` is necessary before any candidate is locked, fetch and inspect the
latest refs/PR/CI, then merge `origin/dev` in the original parent worktree,
validate and push normally. Do not rebase, reset or force-push the parent.

The owner then completes the original findings, runs scoped and affected
regression checks, reads their results, normally pushes, and hands the exact
full SHA/branch/PR to Codex. Hosted PG/HTTP/browser/provider/legal-issuer
witnesses, independent review, matching CI and protected merge remain required
where applicable. Original required keys remain:

- `pax-receipt_e04_fields_and_passenger_download`
- `pax-complaint_intake_and_low_rating`

No VM product servers, browser/E2E runners, Docker Compose or new deployment
are authorized by this recovery.

## Canonical parent update prerequisite

Both attempted release-CLI writes were rejected with exit 1 and made no
canonical mutation:

- `note PAX-RECEIPT-COMPLAINT-20261009 ...` → `Dispatched worker cannot mutate a different task`.
- `TASK_METADATA_JSON=... assign <helper> Codex2 Codex` → `Dispatched workers must use their assigned task lifecycle commands`.

Authority source:
`orchestrator-0fb44e9576d3/.../control_plane/usecases/task_board_commands.py`,
`TaskBoardCommandExecutor._guard_worker_command`. The worker did not unset its
dispatch identity, impersonate Supervisor, edit status JSON, or use a different
CLI to bypass that boundary. The successful helper `progress` records the
repair and this unresolved transaction prerequisite in machine truth.

Supervisor must use the dispatch-specified release CLI from its authorized
operator context to update the parent next step and register helper metadata,
preserving the existing owner/reviewer and every original acceptance key:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Codex",
  "resolved_parent_next": "History audit confirms local=remote=PR2556 cec585cc397eacbdf78a7d022771e1383e08e56c and restored original isolated worktree. Parent remains blocked for exact audit DTO/mapper, Booking fixture, current-receipt method scopes and lawful actual E04 producer capture. Register same-task boundaries, then resume original Codex2 from published cec585; rerun required checks, same-SHA independent CI/review/merge and both original acceptance keys."
}
```

Use `TASK_METADATA_JSON` with the existing `assign` gateway for the helper;
use `note` for the parent's next step without resuming it. Do not invent
`resolved_parent_at`: the merge-resolution transaction owns that timestamp.
The helper's completion must preserve the blocked disposition. A later real
scope/product resolution requires fresh Supervisor resume evidence; this
history report alone is not a resumable resolution.

## Acceptance / verification record

| Finding / helper acceptance                         | Source / repair                                                          | Old → repaired result                                                                  | Command, exit code, version / evidence                                                                                                                                     | Remaining limit                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Identify exact branch/worktree/commit contamination | Local/remote refs, PR #2556, parent activity slice and six commit bodies | No history contamination found; original parent cwd absent → committed source restored | Fetch / ls-remote / PR inspection PASS 0; parent local-v-remote `0 0`; six commit trailers PASS 0; audited head `cec585cc`                                                 | Absence cause and original ignored logs are not established or recovered.                                        |
| Non-destructive recovery                            | Existing parent branch and locked parent cwd                             | Missing worktree → clean restored `cec585cc` worktree, refs unchanged                  | `git worktree add --lock` PASS 0; post-repair status/HEAD/registry PASS 0                                                                                                  | Fresh dependencies and hook runtime remain owner setup, not product acceptance.                                  |
| Task-scoped canonical delivery                      | This helper report only, on its assigned `dev`-based branch              | New durable report with original findings retained                                     | Commit, ordinary push and draft PR identity are recorded by release status / PR head; whitespace, formatting, classification and commit-hook results accompany publication | Draft stays held while Supervisor's metadata/parent update prerequisite is open. No parent candidate is created. |
| Update parent with concrete next step               | The explicit parent continuation and disposition above                   | Write attempted → dispatch guard DENIED 1; helper progress PASS 0                      | Active release `_guard_worker_command`; supervisor-required fields recorded here and in helper machine next                                                                | **OPEN**: authorized Supervisor parent note and helper metadata assignment. Do not claim this acceptance passed. |
| Existing parent product regression / E04 acceptance | Original UAT and actual producer/mapper/query at `cec585cc`              | Existing failures remain failures; unchanged source                                    | Parent hosted CI FAILURE, completed/read; typecheck exit 2, downstream tests SKIPPED. This helper uses content/ref checks, not new product tests.                          | Original source repair and both acceptance keys remain pending.                                                  |

Machine-specific audit receipts for this dispatch are under
`/home/lupin/workspace/drts-fleet-platform/.local/pax-receipt-history-repair-20261011/`.
The report and release-status publication message are the durable evidence;
ignored machine receipts are supplementary and are not commit evidence.
