# SR-PARTNER-NOTIFY-UI-20260917 history repair

Audit date: 2026-09-25 UTC. Helper owner/reviewer: Codex2 / Claude.
Parent owner/reviewer at audit: Gemini / Codex2.

**Disposition: a non-destructive recovery path is verified and documented;
parent routing is still blocked.** Two published documentation commits fail
the required trailer gate. The latest parent also has a separate, confirmed
PostgreSQL fixture failure. This helper changes only this report, does not
repair or approve product code, and does not satisfy parent acceptance.

## Exact history and worktree finding

The audit used the canonical status CLI, `git fetch origin`, local refs,
`git worktree list --porcelain`, immutable source blobs, live PR metadata and
completed CI logs. The full status file and generated task briefs were not read.

| Identity | Observed value |
| --- | --- |
| Helper branch and initial base | `codex2/sr-partner-notify-ui-20260917-unblock-history-repair`, `374536be540e959190394d5e478693cea7687e5f` |
| Helper workspace | `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-sr-partner-notify-ui-20260917-unblock-history-repair` |
| Fetched `origin/dev` at audit | `374536be540e959190394d5e478693cea7687e5f` |
| Parent execution branch and candidate branch | `gemini/sr-partner-notify-ui-20260924-canvas` |
| Parent local ref, remote ref, candidate, PR head | All `b755846383e2562f0190bf47930da6ff022ec67a` |
| Current parent PR | [#2162](https://github.com/ajoe734/drts-fleet-platform/pull/2162), OPEN, unmerged; CI failure |
| Parent registered worktree | None in the worktree inventory at audit; the local branch survives. No dirty/missing parent directory was reset, deleted or reconstructed. |
| Base relationship | `git rev-list --left-right --count origin/dev...b755846383e2562f0190bf47930da6ff022ec67a` = `0 11` |

There is **no observed local/remote divergence** on the current execution
branch. Its first commit, `b213ecf36ab7c87f020c27c3fc866cb661252bb2`, directly
parents the audited dev base. The contaminating ancestors are:

| Published commit | Exact defect and scope |
| --- | --- |
| `8681f5edf3be959473ca68a29258a1fc8e9f7621` | Subject `SR-PARTNER-NOTIFY-UI-20260917: Append complete Codex2 receipt and repair matrix`; missing `Task-ID`, `LLM-Agent`, `Reviewer`. Only original parent UAT changed: 50 additions / 36 deletions. |
| `766da54cb70500daa75470523e2bfe6855800d09` | Subject `SR-PARTNER-NOTIFY-UI-20260917: Append round 6 review and repair matrix`; same three missing trailers. Only original parent UAT changed: 99 additions. |

The production checker
[`commits_in_range` / `validate_message`](../../../tools/ci/git/check_commit_trailers.py)
validates every non-merge commit in `base..head`. A valid tip, an extra
documentation commit, a revert, or merging dev cannot change these existing
messages. Squash-merging the failing PR would still require passing its
pre-merge checks; it is not a gate repair. No bypass is proposed.

The local checker reproduced exactly those two failures (exit 1), matching
the completed same-head [Commit trailers job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36183273057/job/108230811982).
Neither bad SHA is an ancestor of the audited base; both are ancestors of the
parent candidate.

## Preserve the correct source, not an older successor

[PR #2160](https://github.com/ajoe734/drts-fleet-platform/pull/2160) remains OPEN
on `gemini/sr-partner-notify-ui-20260925-canvas`, SHA
`832d95e2e0652da535039e4dfaf2971c519dfff9`. Its later-looking branch date does
not make it the current source: it is an earlier single-commit successor,
independently rejected at 2026-09-25T15:09:35Z. Its trailers passed, but later
UI/fixture repairs on #2162 must not be lost by switching back to it. Its
base is `97dbdd326387959f3666480efbe7596a08b60cbe`; a raw two-tip diff also
contains intervening trunk changes and is not a portable task patch.

Older OPEN [PR #2113](https://github.com/ajoe734/drts-fleet-platform/pull/2113)
remains at `596a0523cfcd5f55803e712813ca918b0f502b0f`. Existing historical
local/remote refs, PRs and source receipts were left intact. Supervisor should
identify the successor in routing and supersede obsolete PRs only after the
replacement is published and traced. This helper closes no parent PR.

The audited base-to-current-parent diff has exactly 16 paths, all in current
parent `write_scopes`; there is no current out-of-scope file contamination:

```text
.github/workflows/ci-integ.yml
.github/workflows/ci.yml
apps/api/src/modules/multi-taxi/multi-taxi.controller.ts
apps/api/src/modules/multi-taxi/multi-taxi.repository.ts
apps/api/src/modules/multi-taxi/multi-taxi.service.ts
apps/platform-admin-web/app/partners/[entrySlug]/page.tsx
apps/platform-admin-web/components/partner-notification-panel.tsx
apps/platform-admin-web/lib/translations.ts
docs/02-architecture/partner-notification-20260917/03_ui_design_delta.md
docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-UI-20260917.md
packages/api-client/src/index.ts
packages/contracts/src/partner-passenger-notification.ts
tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.postgres.test.ts
tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.test.ts
tools/ci/verify_partner_notification_postgres_gate.py
vitest.config.ts
```

## Rehearsed non-destructive repair

Temporary-index rehearsal, with no branch, active index or worktree mutation:

1. Generate a binary/full-index diff from the immutable audited base to the
   immutable current source; verify every path against parent write scopes.
2. `git read-tree` the base into a new temporary `GIT_INDEX_FILE`.
3. Run `git apply --cached --check`, then `git apply --cached` on that index.
4. `git write-tree` and compare to the source tree. Check refs and worktree
   status are unchanged. Validate the proposed owner commit message with the
   real `check_commit_trailers.py --single-commit` entry point.

All steps passed (exit 0). The resulting tree equals the entire source tree,
`04c2c15a6453e496f8ca282d83e0b6ea2d33d6a9`. The patch SHA-256 is
`e8d5cd1f8823a6970b846636f5e34c50b5482c8fb56b0e178307d92ecf12e2cd`.
Thus the documented replay preserves the parent content and can omit the
invalid ancestors. This is a rehearsal, **not a new product candidate or a
claim that the preserved product content passes acceptance**.

Supervisor must first route the original owner Gemini to a dedicated successor
branch/worktree, for example `gemini/sr-partner-notify-ui-20260925-history-repair`.
Recheck existing local/remote refs and worktree ownership before creation; reuse
an existing approved successor rather than overwrite it. The owner then:

```bash
# In the Supervisor-assigned parent successor workspace, never canonical root.
# Create/reuse the branch via normal worktree routing from this pinned dev base.
RECOVERY_BASE=374536be540e959190394d5e478693cea7687e5f
RECOVERY_SOURCE=b755846383e2562f0190bf47930da6ff022ec67a
git fetch origin
git status --short
# Stop for unexpected dirty files or source/PR movement; preserve both refs.
# These replay commands assume HEAD is RECOVERY_BASE and a clean successor.
test "$(git rev-parse HEAD)" = "$RECOVERY_BASE"
mkdir -p .local/partner-notify-history-recovery
git diff --binary --full-index "$RECOVERY_BASE" "$RECOVERY_SOURCE" > .local/partner-notify-history-recovery/parent.patch
# Recheck the 16-path allowlist above before applying the full patch.
git apply --check .local/partner-notify-history-recovery/parent.patch
git apply --index .local/partner-notify-history-recovery/parent.patch
git diff --cached --check
git commit -m 'SR-PARTNER-NOTIFY-UI-20260917: preserve notification changes on clean history' \
  -m "Recovery-Source: $RECOVERY_SOURCE" -m "Recovery-Base: $RECOVERY_BASE" \
  -m 'LLM-Agent: Gemini' -m 'Task-ID: SR-PARTNER-NOTIFY-UI-20260917' -m 'Reviewer: Codex2'
python3 tools/ci/git/check_commit_trailers.py --base "$RECOVERY_BASE" --head HEAD
git diff --exit-code "$RECOVERY_SOURCE" HEAD
```

This is a new commit on a new branch, not amend/rebase/reset of published work.
Do not merge the old parent branch or cherry-pick the bad commit messages into
the successor. Preserve provenance through the source/base trailers and this
report. Push the checkpoint normally. If actual later dev synchronization is
necessary before handoff, merge dev and reverify; never overwrite moved trunk
files with a whole older snapshot. The rehearsal proves the pinned base only.

After the original owner repairs outstanding findings, run the appropriate
checks, publish the new PR and verify full local/remote/PR identity. Only then
handoff the successor SHA to Codex2. Old review/CI results do not transfer.

## Product failures and repeated-review boundary stay open

The latest complete independent review was read from the parent task receipt:
2026-09-25T19:46:35Z, reviewed
`400b43e4efa42becfd44b22bfe7b9ef7bdf88d56`, generation
`c1436b41121140c7968fd7ba2cef2c7f`. It identifies repeated defects across
`766da54cb70500daa75470523e2bfe6855800d09` and `400b43e...`, plus unchanged
resubmission. Follow [collaboration guide §0.7](../../../AI_COLLABORATION_GUIDE.md#07-交付品質與退修規範): original owner retains complete authentic receipts in
the original UAT and repairs bounded units; this helper does not re-review UI.

Between `400b43e...` and current `b755846...`, only four files changed: workflow
migration ordering, two removed retry-denial lines, PG fixture data and 18 UAT
lines. Those edits are distinct from the earlier rejected SHA and must not be
called unchanged, but also do not establish that every finding is resolved.

| Finding | Current evidence and original-owner next unit |
| --- | --- |
| R8b history | Exactly reproduced above; successor path verified, execution/routing pending. |
| R-CI / R2 fixtures | Migration now precedes root tests. Current [Product smoke job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36183273057/job/108230914032) fails at `notification-ui.postgres.test.ts:95`: `column "record" of relation "phase1_partner_notification_bindings" does not exist`. Source lines 96/100 insert it. [Formal V0104](../../../infra/migrations/V0104__sr_partner_notification_binding_and_routing.sql) has `validated_at` and `validated_endpoint_fingerprint`, no `record`. Fix fixtures against actual production schema/readers and readiness first, then non-skipped same-SHA hosted fence/receipt/isolation tests. Current root result: 1 failed / 379 passed / 8 skipped files; 4052 passed / 42 skipped cases; exit 1. |
| R0a / R1d lifecycle | Preserve review's A(version 3) → missing B creation and pending A → B traces; unmount/authority-generation reset and follow-up resume mutation boundaries. No new dynamic pass asserted. |
| R1f configuration recovery | Current diff removes permanent `configuration_blocked` denial when current binding is ready. Original owner/reviewer must verify actual allowed/rejected interactions and outbox preservation on successor. |
| R1b navigation | Verify cross-app webhook management route plus authorized entry-tenant context in the hosted build. |
| R6 evidence | Preserve complete SHA/generation-specific reviewer receipts; retract unsupported PG/component PASS claims. Three API-client fetch mocks do not establish UI component behavior. |

Transport and approved canvas dependencies are both `done`: transport merge
`1750224ac70dd819184a579f19773f3662fa513e`; canvas candidate
`e033a7fd1572ff65c552879b686dab3fd3e49349`, merge
`6020086ef81789ee3af0ffc70748df98ab008d5d`. This history report introduces no
UI, palette or design change. Original parent product scope and all three
acceptance keys remain unchanged:

- `entry_notification_admin_uses_real_binding_and_delivery_data`: pending
  actual component/data/authority and navigation evidence.
- `manual_retry_preserves_single_outbox_owner_and_fence`: pending valid
  production-schema PG, lease/fence/receipt/isolation evidence.
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`: pending
  full component/lifecycle validation; preserve endpoint/device distinction.

No local product, PG, browser, E2E or development service was started. No deploy
was prepared or performed. Parent runtime checks belong in authorized hosted
workflows; green unrelated integration steps are not notification PG evidence.

## Machine-truth write and required Supervisor action

Only the dispatch-specified canonical CLI was used, with `AI_NAME=Codex2`.
Helper `start` succeeded. A parent `note` with the concrete next step below was
attempted and rejected (exit 1): **`Dispatched worker cannot mutate a different
task`**. No dispatch guard was removed, no role impersonated and no status JSON
edited directly. The required parent update is therefore still outstanding.

Supervisor must use its authorized CLI context to persist this helper's
disposition **before handoff/merge**, preserving Codex2 / Claude:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Claude",
  "resolved_parent_next": "Supervisor routes original owner Gemini to a clean successor from audited dev 374536be540e959190394d5e478693cea7687e5f, replaying the 16-file diff from b755846383e2562f0190bf47930da6ff022ec67a with valid trailers and preserving all published refs. Then Gemini repairs the confirmed nonexistent binding record-column fixture and outstanding lifecycle/fence/evidence findings in the original UAT, runs same-SHA hosted verification and publishes a new candidate to Codex2. Preserve all three parent acceptance keys. See support/unblock/SR-PARTNER-NOTIFY-UI-20260917/SR-PARTNER-NOTIFY-UI-20260917-UNBLOCK-HISTORY-REPAIR.md."
}
```

Use that same `resolved_parent_next` text for a parent `note`; coordinate
`execution_branch` / worktree routing and §0.7 repair boundary before resuming
the parent. Do not fabricate `resolved_parent_at`; lifecycle writes it. Until
these writes succeed, keep this helper PR draft and record a helper blocker
for Claude. As [candidate lifecycle](../../../tools/development-orchestrator/skills/candidate-lifecycle.md)
explains, absent disposition a merged unblock helper can default the parent to
`todo`; publication alone must not trigger premature resumption.

## Helper acceptance and verification evidence

Local evidence lives under the helper workspace's ignored
`.local/sr-partner-notify-ui-history-repair-20260925/`: task/PR snapshots,
`latest-review.txt`, original UAT snapshot, hosted trailer/smoke logs,
`rehearse.py`, `rehearsal.json`, full-index patch and proposed owner message.
The immutable identities, commands, conclusions and hosted links above are
durable evidence; local logs are not themselves canonical delivery.

| Acceptance / finding | Source and change | Old → new result | Command / version / evidence | Pending or limitation |
| --- | --- | --- | --- | --- |
| Identify exact contamination | Branch inventory, both UAT commits, real trailer checker; report above | Suspected divergence → matching refs, two exact invalid ancestors | `git fetch origin`, `git rev-list`, `python3 tools/ci/git/check_commit_trailers.py --base 374536be540e959190394d5e478693cea7687e5f --head b755846383e2562f0190bf47930da6ff022ec67a`: expected FAIL, exit 1 | Does not clear product defects. |
| Non-destructive repair path | 16-path allowlist and temporary-index replay | Current range FAIL → exact tree reconstruction and proposed message PASS | `python3 .local/sr-partner-notify-ui-history-repair-20260925/rehearse.py`: PASS, exit 0; Git 2.43.0 / Python 3.12.3 | No actual parent successor or product acceptance created. |
| Task-scoped commit / push / PR | This report only, helper branch | Publication recorded below | Scoped content/trailer checks and normal push | Review/CI/merge remain separate. |
| Update parent next step | Exact note and disposition above | Attempted parent write → dispatch guard rejection, exit 1 | Canonical `ai-status.sh note SR-PARTNER-NOTIFY-UI-20260917 ...` | **BLOCKED**: Supervisor parent note, helper metadata and routing required. |

### Publication and scoped verification

Anchor `3a00a2034991731a1aba11c6e6f993ab88d12228` was committed with the
helper Task-ID/LLM-Agent/Reviewer trailers and pushed normally (exit 0).
[Draft PR #2165](https://github.com/ajoe734/drts-fleet-platform/pull/2165)
targets `dev` and changes only this report. PR creation completed (exit 0).

Completed checks on the anchor:

| Check | Result |
| --- | --- |
| `git diff --check origin/dev...HEAD` | PASS, exit 0. |
| `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` | PASS, exit 0, one helper commit. |
| `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD` | PASS, exit 0, zero findings in all four categories. |
| Markdown local-target check | PASS, exit 0; four linked local files exist after URL decoding and removing fragments. |
| Temporary-index replay | PASS, exit 0; exact source tree, zero out-of-scope paths, refs/worktree unchanged. |

This publication receipt is a subsequent helper commit. Final full local SHA,
remote branch and PR head identity, repeated scoped checks and current hosted
check states are recorded in the helper's canonical progress/blocker receipt.
No self-referential commit hash is embedded in this file. All explicitly run
local checks finished and their results were read; automatic hosted checks
are reported separately and never inferred from an older SHA.

Helper `progress` successfully recorded the exact parent-write rejection and
requested Supervisor disposition. Final status remains blocked pending that
write; draft publication is not candidate handoff. Once Supervisor persists
the disposition and parent next step, recheck the same report, final checks,
local/remote/PR identity, then set `CANDIDATE_SHA=$(git rev-parse HEAD)` and
`CANDIDATE_BRANCH=$(git branch --show-current)` and use canonical `handoff`
to Claude with `PR_URL=https://github.com/ajoe734/drts-fleet-platform/pull/2165`.
Do not call `done`. Product tests are not applicable to this report; parent
product/PG/browser/live gates remain unverified or failed as detailed above.
