# SR-PARTNER-NOTIFY-QA-20260917 — preserved-history recovery

Audit: 2026-09-27, Codex2. Helper reviewer: Codex.

Current routing refresh: 2026-09-28. **Section 7 is the current disposition**;
sections 1–6 preserve the dated audit and HR-R1 repair evidence.

## Result and delivery boundary

QA-R8 is reproducible: the parent's published PR #2179 contains **18 invalid
commit messages in 72 linear commits**. Its net diff also contains **three
transport/security files outside the parent's six write scopes** (QA-R9).
The current local and remote Codex heads match; there is no local/remote
divergence to repair. An ordinary extra commit or merge of dev cannot repair
the invalid messages already in that PR's ancestry.

This helper documents and verifies a non-destructive successor path. An isolated
Git index successfully applies the **20 QA-scope files** to the audited dev tip,
preserving all 31 files changed by dev since the common base. No parent branch,
worktree, PR, or published commit was changed. The preview is a tree, **not a
commit, candidate, runtime result, or completed parent repair**.

At the 2026-09-27 audit, the parent was blocked on product repairs and all three
required acceptance items. The original parent update was rejected by the cross-task guard.
**The operator updates are now persisted:** release-CLI readback at
`2026-09-27T23:00:54.120715Z` confirms all three helper disposition fields and
the identical concrete parent next step, while preserving `blocked`/`Gemini`.
Section 5 records the failed and corrected states. HR-R1 / helper acceptance 4
is now supported; this does not resolve any parent product acceptance.

The subsequent operator routing queues the parent as `todo`, owner Gemini /
reviewer Codex2, behind all 11 dependencies. Readback on 2026-09-28 confirms
the helper's `todo` / null disposition and exact parent-next equality. ENTRY
and this helper remain outstanding; all three parent acceptance gates remain
unmet. The clean successor name is assigned but has no local/remote ref or
registered worktree yet. Section 7 records that distinction and a fresh
20-file recovery preview against reviewed dev `c8deb87177d13339ca43dd2275346cd477ec7446`.

## 1. Fixed identities and branch/worktree diagnosis

| Reference                                                | Full SHA                                   | Evidence                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Audited `origin/dev`, helper starting HEAD               | `585087a2fd8114eaac0eb8a470dfca58e13dfbe4` | Fetch and local resolution agree; #2178 is the one newer dev commit                                                        |
| Common base of dev and parent                            | `931eabb0c55b44548d4e8e664c31359cd035b345` | `git merge-base`; also stale local `codex2/sr-partner-notify-qa-20260917`                                                  |
| Local and remote `codex/sr-partner-notify-qa-20260917`   | `3d50ba809825dfb4a5691f85519016af3575eccc` | [Draft PR #2179](https://github.com/ajoe734/drts-fleet-platform/pull/2179), same head, base dev                            |
| Local and remote `gemini/sr-partner-notify-qa-20260917`  | `91b1d4ac122b1373ac7beb05df902cb991b62232` | [Open PR #2175](https://github.com/ajoe734/drts-fleet-platform/pull/2175); ancestor of Codex head                          |
| Local and remote `gemini2/sr-partner-notify-qa-20260917` | `faee900f3c3b523bdb6cf37e612a4b1d29801caf` | [Open PR #2177](https://github.com/ajoe734/drts-fleet-platform/pull/2177); separate three-commit fork from the common base |

`git rev-list --left-right --count <dev>...<parent>` returns `1 72`.
The Codex branch reflog starts at `91b1d4ac...` on 2026-09-27 16:36:28 UTC;
it intentionally inherited the Gemini history, including 17 invalid messages.
The later `6f3a1e36...` adds the eighteenth. No force-push or rebase is inferred
from branch names or an ordinary push.

The separate Gemini2 fork changes six files, including a different E2E/unit
entry point; it does not include the later Codex unit1–unit7 work. It is not a
substitute for recovery of #2179 and must not be merged into the successor
merely because its messages pass policy. Preserve all three PRs and their refs
until the successor's contents and identity are independently verified.

At audit time `git worktree list --porcelain` has **no registered owner worktree
for any of those three parent branches**, nor the stale local Codex2 branch.
Their refs and commit objects still resolve. Supervisor should register a new
isolated successor owner worktree; do not switch/reset the canonical root or
repurpose this helper's assigned worktree. This helper starts clean at dev on
`codex2/sr-partner-notify-qa-20260917-unblock-history-repair`.

The parent's canonical task slice records owner Codex, reviewer Codex2,
`execution_branch=codex/sr-partner-notify-qa-20260917`, `status=blocked`, and
`waiting_for=Gemini`; no current candidate SHA/branch/PR is locked. Its latest
checkpoint is explicitly not a handoff. Product repair children still require
the agy owner / Codex reviewer coordination recorded by the parent.

## 2. Exact failures and minimal reproduction

The production checker is
[`tools/ci/git/check_commit_trailers.py`](../../../tools/ci/git/check_commit_trailers.py),
specifically `commits_in_range`, `SUBJECT_RE`, and `validate_message`.
It validates every non-merge commit in the base-to-head range. The current regex
accepts uppercase task IDs and the enumerated prefixes; `test(...)`, generic
`docs:`, and lowercase `fix(qa)` / `fix(partner)` fail. Required trailers are
`Task-ID`, `LLM-Agent`, and `Reviewer`.

```bash
python3 tools/ci/git/check_commit_trailers.py \
  --base 585087a2fd8114eaac0eb8a470dfca58e13dfbe4 \
  --head 3d50ba809825dfb4a5691f85519016af3575eccc
```

Actual result: **exit 1, 18 failures**. This matches completed
[CI run 36353958340](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36353958340),
[Commit trailers job 108717848740](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36353958340/job/108717848740).
The full failed log was downloaded and read. `subject` below means the exact
immutable commit's subject fails `SUBJECT_RE`; named trailers are missing.

| Invalid published commit                   | Offenses                                        |
| ------------------------------------------ | ----------------------------------------------- |
| `6f3a1e3659417fcafe1ed8566a13f3c0f87654bf` | subject (`test(SR-PARTNER-NOTIFY-QA-20260917)`) |
| `91b1d4ac122b1373ac7beb05df902cb991b62232` | subject; Reviewer                               |
| `678bd4904e289af880cb556f431dc8c77ec8032b` | subject; Reviewer                               |
| `8e9aceed935693b5f62324df96ff442537fb964d` | subject; Reviewer                               |
| `26e246a6114997d1af70c5a8f83c5d705ac3d7e5` | subject; Reviewer                               |
| `90ba0bb45381881dcb3e7f41a4961806da0ff6dd` | subject; Reviewer                               |
| `5dfd0c41d70fea4c33b6046dbfc821acdfc50a19` | subject; Reviewer                               |
| `d18b1c452a2d18c05e6acc74462f15b18970aeba` | subject; Reviewer                               |
| `5377a253b0020bd7617538374be7cc6123af2022` | subject; Reviewer                               |
| `62962c9eb4bc10652c9e8314cc145064fa3c56ff` | subject                                         |
| `5d51260870da20d32740c761f205b404e56b81ca` | subject                                         |
| `9f306bb821dd617c0b19cc33ef80530974dae596` | subject                                         |
| `a2e2be7fa4d7198a84ee91a235773db5c8abe689` | subject                                         |
| `570a74c1847040d797cc1a1db7aad3d009d6d4d5` | Task-ID, LLM-Agent, Reviewer                    |
| `5b46d02b6a397dc81d13fd1a736e31fe9548b21c` | Task-ID, LLM-Agent, Reviewer                    |
| `874163a6a43ee211a7977dff59c28656df1e0d56` | subject; Task-ID, LLM-Agent, Reviewer           |
| `8bbe1073058671538e4166fca8a0b2ed5370b8c2` | subject                                         |
| `bd5caf7f1f5fb67f35f617b9a59f1d582cc57f0a` | subject                                         |

The three out-of-scope paths are:

- `apps/api/src/modules/tenant-partner/partner-notification-https.ts`
- `tests/unit/system-remediation/sr-partner-notify-transport-20260918/https-client.test.ts`
- `tests/unit/system-remediation/sr-partner-notify-transport-20260918/https.test.ts`

Their history is attributable to `b950420f6599f88d89f545635a2a35a8281c3854`,
`62962c9eb4bc10652c9e8314cc145064fa3c56ff`, `5377a253b...`, `5dfd0c41d...`,
and `26e246a61...`. The first introduces the local-HTTP transport exception;
later changes affect the typed client and test environment. At the parent head,
`partnerNotificationHttpsFetch` bypasses public-HTTPS/address checks under
`NODE_ENV !== production && DRTS_ALLOW_LOCAL_WEBHOOKS === true`, selects
`require("node:http").request`, and uses `any` callback annotations. The security
tests pin the flag false / environment production. See the exact
[parent transport source](https://github.com/ajoe734/drts-fleet-platform/blob/3d50ba809825dfb4a5691f85519016af3575eccc/apps/api/src/modules/tenant-partner/partner-notification-https.ts).

[Product smoke job 108717904726](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36353958340/job/108717904726)
fails at that source's line 63:58 with `@typescript-eslint/no-require-imports`.
This is separate from commit formatting. The helper does not approve the
transport exception or remove its security regressions. The hosted QA workflow
depends on controlled local HTTP; simply excluding these three files is not a
claim that the resulting product/hosted tests will pass. R9 needs its authorized
product child or explicit scope coordination before integrated acceptance.

## 3. Verified non-destructive recovery path

Supervisor coordinates the following with the recorded parent owner. All old
refs and PRs remain evidence; no rebase, amend, reset, force push, trailer bypass,
or weakening of CI is needed.

1. Re-fetch and verify the three heads, PRs and canonical candidate state. If a
   newer locked candidate exists, stop and coordinate it rather than racing its
   review. Preserve the old refs. Optional new archive refs must be created
   without overwriting existing refs. Do not delete the three existing PR heads.
2. Route one unused successor branch (the current operator assignment is
   `gemini/sr-partner-notify-qa-20260927-successor`), and a clean isolated
   owner worktree from the then-current fetched dev. Record `execution_branch`
   via Supervisor's canonical gateway. This helper does not change routing.
3. Export the net patch from common base to the pinned parent head using exactly
   the six authorized scopes below. Apply it to the new owner checkout, inspect
   all conflicts if dev has since changed, and anchor it with valid task trailers.
   This copies the resulting QA work without importing the invalid ancestry.
   Never merge or cherry-pick the old 72-commit rail wholesale into the successor.

```bash
qa_old=3d50ba809825dfb4a5691f85519016af3575eccc
qa_common=931eabb0c55b44548d4e8e664c31359cd035b345
mkdir -p .local/qa-history-recovery
git diff --binary "$qa_common" "$qa_old" -- \
  .github/workflows/tenant-uat-acceptance.yml \
  tools/ci/test_tenant_uat_acceptance_workflow.py \
  tests/unit/system-remediation/sr-partner-notify-qa-20260917/ \
  tests/e2e/system-remediation/sr-partner-notify-qa-20260917/ \
  docs/02-architecture/partner-notification-20260917/04_sources.md \
  docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-QA-20260917.md \
  > .local/qa-history-recovery/qa-only.patch
# Execute these only in the new clean parent successor checkout:
git apply --check .local/qa-history-recovery/qa-only.patch
git apply --index .local/qa-history-recovery/qa-only.patch
git diff --cached --check
git diff --cached --name-only
```

4. Preserve the excluded product patch as reference evidence; route R9 to an
   authorized product owner for typed transport and positive/refusal security
   tests. Coordinate R5/R10/R11/R12 using the existing parent UAT findings. After
   product children are reviewed and merged, merge dev into the successor only
   if necessary, with normal commits/push. Do not replace current dev files with
   a whole-tree copy of the old parent.
5. Compare every recovered QA blob with the pinned source; account for any
   intentional conflict resolutions. Check the complete new base-to-head commit
   range, diff scope, and original finding regressions. Re-run appropriate local
   non-serving checks and existing hosted PG/browser/controlled-receiver gates
   on the new SHA. Preserve all 24 identities, tenant/webhook/restart gates and
   separate real-partner/native-device acceptance. Earlier SHA results cannot
   transfer to the successor.
6. Normal-push the new branch, open one successor PR to dev with links to #2175,
   #2177 and #2179, and record the actual parent candidate only when ready. Verify
   local HEAD = remote head = PR head. Supervisor can mark older PRs superseded
   after evidence is secured; this helper neither closes nor merges them.

### Executed preview, with no checkout/ref changes

Local evidence directory (relative to this assigned helper worktree):
`.local/sr-partner-notify-qa-history-repair-20260927/`.
`audit.py` executes the production checker and uses `GIT_INDEX_FILE` with
`git read-tree <audited-dev>`, `git apply --cached --check`, `git apply --cached`,
and `git write-tree`. It asserts path sets and exact Git blob identities, not
product behavior. It completed with **exit 0**:

- Old full-range production check: exit 1, exactly 18 failures in 72 commits.
- Scoped patch application: exit 0; 20 changed paths, all within the six scopes.
- Recovered 20 blobs: exactly equal to `3d50ba809...`.
- Excluded three blobs: exactly equal to audited dev, with their original changes
  retained separately in `deferred-product.patch` and the preserved old refs.
- All 31 files changed by dev's #2178: exactly equal to audited dev.
- Preview `git diff --check`: exit 0.
- Preview tree: `3bbc4172c8c37e4e47a7fc100bae95460a2ece6f` (not a candidate).
- Prospective canonical parent commit message: production `--single-commit`
  validation exit 0. No parent commit or successor PR was actually created.

`qa-only.patch` SHA-256:
`d1521b11306e89a8d07b004c01a00c7b2c7209105fcd773146cbdc6a71a9dde5`.
`deferred-product.patch` SHA-256:
`6d79c85dc6dc18a9b6f3b173c5d0514c120b7a5be7b41ddcd20b69d383d51cfb`.
The patch recipe above reproduces these bytes from immutable Git objects.
The index and JSON/log evidence are machine-local; this report is the durable
review artifact. Versions: Git 2.43.0, Python 3.12.3, Node 22.23.2, pnpm 10.33.0.

## 4. Product findings at the 2026-09-27 audit

This is the original audit snapshot. Section 7 records later child completion;
child completion does not supply the parent's integrated acceptance evidence.

The original
[parent UAT unit1–unit7](https://github.com/ajoe734/drts-fleet-platform/blob/3d50ba809825dfb4a5691f85519016af3575eccc/docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-QA-20260917.md)
retains adjacent candidates, call paths, minimal reproductions and boundaries.
This report adds history-repair evidence and does not replace that ledger.

| Finding / required acceptance                                  | Existing evidence and remaining boundary                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| R5 / C205                                                      | Date DTO `{}` / React31, tenant picker authority and translation findings need product repair                |
| R9                                                             | Out-of-scope transport exception, typed HTTP client and security tests need coordinated owner/scopes         |
| R10 / C218                                                     | Production snapshot SQL42P08 needs product SQL and real PostgreSQL regression                                |
| R11                                                            | `createPlatformPartnerEntry` returns before durable persistence; bounded QA readback is not a product fix    |
| R12 / C222                                                     | Foreign history BFF fabricates HTTP200 success; retain legitimate own-history and foreign denial regressions |
| `integrated_controlled_receiver_negative_matrix_same_sha`      | NOT MET; full same-SHA matrix and product fixes remain                                                       |
| `navigation_and_admin_ui_hosted_real_runtime_evidence`         | NOT MET; C205/C222 remain failing                                                                            |
| `existing_webhook_tenant_gates_preserved_and_live_not_claimed` | NOT MET; strict gate incomplete, R9 outstanding; B/C remain SR-LIVE-PUSH-001                                 |

Parent checkpoint JSON and unit7 report record runtime
`84c5d9e3cf499863de0b2838892508b3972e8093`,
[run 36352402864](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36352402864),
21 passed / 3 failed / zero skipped or flaky partner cases, dedicated partner
unit skipped, strict gate failed. These are attributed parent evidence, not
re-executed results of this helper or the preview. The final checkpoint's
[integration run 36353958377](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36353958377)
is successful with main product jobs skipped; its green aggregate is not product
acceptance. No product, database, browser, receiver, deployment or live/device
test was started on this VM for this helper.

## 5. Canonical operator update and verified readback

**Historical HR-R1 transaction, 2026-09-27:** the blocked/Gemini expectations
and operator commands below preserve the original repair evidence. They must
not be replayed to replace the later queued routing. Use section 7 for the
current release CLI and current read-only assertions.

The supplied release entry point is
`/home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh`.
`AI_NAME=Codex2 <cli> note SR-PARTNER-NOTIFY-QA-20260917 <next-step>` returned
**exit 1: `Dispatched worker cannot mutate a different task`**.
The guard in `TaskBoardCommandExecutor._guard_worker_command` permits this
worker's helper lifecycle only. No guard environment was removed, no different
identity was assumed, and no machine-truth files were directly edited.
Helper `start` and `progress` succeeded and record this outstanding action.

The required repair was for Supervisor to use the same release CLI's normal
metadata/assignment gateway to persist the following on the helper, and `note`
on the parent for the same concrete next step. Existing ownership/scopes must
be preserved unless separately coordinating a repair child. Do not manually
set `resolved_parent_at`; merge lifecycle supplies it. The helper's default
resolution would otherwise make a blocked parent todo despite unresolved
product defects.

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Gemini",
  "resolved_parent_next": "R8 recovery path verified in support/unblock/SR-PARTNER-NOTIFY-QA-20260917/SR-PARTNER-NOTIFY-QA-20260917-UNBLOCK-HISTORY-REPAIR.md. Preserve PR2175/2177/2179 and heads 91b1d4ac/faee900f/3d50ba809. Route a clean parent successor from fetched dev and import only the 20 QA-scope net-diff files; do not inherit the 18 invalid commits or three transport/security changes. Coordinate agy product children/scopes for R9 and R5/R10/R11/R12 before integrated validation, then normal-push one successor PR and verify local/remote/PR SHA before handoff. All three required_acceptance remain unmet; keep blocked pending routing/product fixes. No live/device claim."
}
```

This was a review-blocking operator action, not an instruction for the reviewer
to edit the parent candidate or impersonate Supervisor. Both task slices must
be read back after the update; helper completion alone does not establish
parent readiness. Resume parent work only with fresh resolution evidence.

### HR-R1 reopen: operator boundary and readback (2026-09-27)

Reviewer Codex reopened candidate
`6334a41acd6c2b1f9a71ee8e964c5db6b2b2b2e2`, generation
`a67b3315348e44e2a6938bc9a1b41e31`, at `2026-09-27T22:38:43Z`.
The owner's fresh release-CLI readback at `2026-09-27T22:41:15Z` confirms
**HR-R1 remains unresolved**: all three disposition fields above are absent;
the parent remains blocked, waiting for Gemini, with its unit7 next step and
`last_update=2026-09-27T22:07:37Z`. `resolved_parent_at` is also absent,
as required before actual resolution. Fetch, local HEAD, remote helper branch
and draft PR #2181 agree on the reviewed SHA. No new candidate is submitted.

Minimal read-only probe:
`python3 .local/hr-r1-20260927/readback.py .local/hr-r1-20260927/before.json`
completed **exit 1, expected**. It calls the supplied CLI's `show` for only these
two tasks, extracts the JSON payload above, and compares all three helper fields
plus parent status/waiting-for/next and absence of an early resolution timestamp.
All three helper comparisons and parent-next comparison fail; parent status,
waiting-for and timestamp checks pass. It writes only compact machine-local
receipts. The inspected report SHA-256 is
`3aa2b166395471c1abd3d67d02b7332e129c01d44ea4242448111f80c914b865`.
There was no corrected-state receipt at that checkpoint. The successful
continuation below supersedes that outstanding operator hold while preserving
this original failed reproduction.

The active release's actual call path localizes the repair boundary:

- `TaskBoardCommandExecutor.execute_with_result` invokes
  `_guard_worker_command` before its mutation handler. The guard at
  `tools/development-orchestrator/control_plane/usecases/task_board_commands.py:82`
  excludes `assign` from worker commands and rejects cross-task `note`.
- `task_metadata_from_env` in
  `tools/development-orchestrator/bin/ai_status.py:1018` reads
  `TASK_METADATA_JSON`; `command_assign` at line 1747 merges it into an existing
  task. Worker `progress`/`note` do not consume that metadata. Merely attaching
  the JSON to a progress command cannot fix this finding.
- `apply_unblock_parent_resolution` at line 1092 consumes the stored disposition;
  line 1111 defaults its absence to `todo`. `command_note` at line 1995 updates
  parent `next` without resuming it. Thus both the helper metadata and parent
  note are required. No production-code change or guard removal is in scope.

The inspected release files' SHA-256 hashes are respectively
`d2490cccd93cc91d18f0df2348f8671b65c38233c95cc8d3ffbd73ad9961faa4`
(task-board executor) and
`4a0fe6275b4350cd7085877519d43469a2b76b0a6a640d54b2b2840cd010ca27`
(`ai_status.py`). These are static call-path evidence, not simulated merge or
parent acceptance results.

Supervisor can run this bounded transaction sequence from its existing operator
context after checking that the owner/reviewer and unresolved finding still
match. **Do not run it in a dispatched worker or remove dispatch guards.**
This sequence has been documented, not executed by Codex2:

````bash
set -euo pipefail
repair_cli=/home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh
repair_helper=SR-PARTNER-NOTIFY-QA-20260917-UNBLOCK-HISTORY-REPAIR
repair_parent=SR-PARTNER-NOTIFY-QA-20260917
repair_artifact=support/unblock/$repair_parent/$repair_helper.md
repair_metadata=$(python3 -c '
import json, pathlib, re, sys
section = pathlib.Path(sys.argv[1]).read_text().split("## 5. ", 1)[1]
payload = json.loads(re.search(r"```json\n(.*?)\n```", section, re.S).group(1))
assert set(payload) == {"resolved_parent_status", "resolved_parent_waiting_for", "resolved_parent_next"}
print(json.dumps(payload))
' "$repair_artifact")
AI_NAME=Supervisor TASK_METADATA_JSON="$repair_metadata" \
  "$repair_cli" assign "$repair_helper" Codex2 Codex
repair_next=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["resolved_parent_next"])' "$repair_metadata")
AI_NAME=Supervisor "$repair_cli" note "$repair_parent" "$repair_next"
````

After **both exit 0**, read back both slices through the same CLI. Require exact
equality with the three JSON fields above, parent `next` equal to
`resolved_parent_next`, parent still `blocked`/`Gemini`, and no manually supplied
`resolved_parent_at`. A successful `assign` alone, helper progress receipt or
new report commit is insufficient. Codex2 then records the real timestamps and
readback receipts here and in section 6 before final verification and handoff.
The CLI's agent registry excludes Supervisor from `blocker`'s waiting-agent
argument; the owner therefore uses `progress` with this explicit operator
blocker rather than attributing the missing action to a different lane.

### HR-R1 corrected state observed by the owner (2026-09-27)

During this continuation, the initial live check still showed missing helper
fields and the parent's old unit7 text. The later release-CLI readback at
`2026-09-27T23:00:54.120715Z` completed **exit 0, all eight comparisons passed**.
The helper slice then had `last_update=2026-09-27T22:59:33Z`; the parent had
`last_update=2026-09-27T22:59:34Z`. These are observed state timestamps, not a
claim that the worker executed the operator commands.

| Live comparison                      | Corrected result                                  |
| ------------------------------------ | ------------------------------------------------- |
| Helper `resolved_parent_status`      | `blocked`, exact match to section 5 JSON          |
| Helper `resolved_parent_waiting_for` | `Gemini`, exact match                             |
| Helper `resolved_parent_next`        | Exact full-string match to section 5 JSON         |
| Parent `status`                      | `blocked`, preserved                              |
| Parent `waiting_for`                 | `Gemini`, preserved                               |
| Parent `next`                        | Exact full-string match to `resolved_parent_next` |
| Helper `resolved_parent_at`          | Absent; lifecycle has not resolved the helper     |
| Helper owner / reviewer              | `Codex2` / `Codex`, preserved                     |

Receipt: `.local/hr-r1-20260927-resume/readback.json`, SHA-256
`9d1c74a17326a66a495f43d16e5543ee9bb15324556082593832f8a077f1adc4`.
It records both filtered CLI slices, expected values, all eight comparisons,
the observed helper HEAD `e3aebbeff450c71d2ac73821d93a08c58f408d0a`, and
that report's SHA-256
`66b6595488234175671ce53cfb2f1550f3a7764d21a270fe5c252cecfe86961a`.
The bounded activity-log tail also records `Supervisor` `assign` at 22:59:33Z
for the helper and `Supervisor` `note` at 22:59:34Z for the parent; live task
slices, not those log entries alone, establish the persisted correction.
The table and exact JSON above retain the evidence if machine-local receipts
are unavailable in a later isolated worktree. Re-run the live comparison from
this helper worktree without depending on the earlier local probe file:

````bash
python3 - <<'PY'
import json
import os
from pathlib import Path
import re
import subprocess

cli = "/home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh"
parent_id = "SR-PARTNER-NOTIFY-QA-20260917"
helper_id = parent_id + "-UNBLOCK-HISTORY-REPAIR"
text = Path(f"support/unblock/{parent_id}/{helper_id}.md").read_text()
section = text.split("## 5. ", 1)[1]
expected = json.loads(re.search(r"```json\n(.*?)\n```", section, re.S).group(1))
assert set(expected) == {
    "resolved_parent_status", "resolved_parent_waiting_for", "resolved_parent_next"
}

def show(task_id):
    result = subprocess.run(
        [cli, "show", task_id], env={**os.environ, "AI_NAME": "Codex2"},
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)

helper, parent = show(helper_id), show(parent_id)
checks = {f"helper.{key}": helper.get(key) == value for key, value in expected.items()}
checks.update({
    "parent.status": parent.get("status") == expected["resolved_parent_status"],
    "parent.waiting_for": parent.get("waiting_for") == expected["resolved_parent_waiting_for"],
    "parent.next": parent.get("next") == expected["resolved_parent_next"],
    "no_early_resolved_parent_at": "resolved_parent_at" not in helper,
    "owner_reviewer_preserved": (helper.get("owner"), helper.get("reviewer")) == ("Codex2", "Codex"),
})
print(json.dumps(checks, indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
PY
````

This is a pre-merge state check through the production CLI; no merge handler
is simulated and no machine truth is directly edited. Parent R5/R9/R10/R11/R12,
successor routing and all three product acceptance gates remain unresolved.
The owner can now publish this receipt and submit a new immutable helper
candidate for Codex review; the rejected candidate is not reused.

## 6. Acceptance and publication ledger

The following ledger records the 2026-09-27 delivery. Section 7 supersedes its
parent disposition and candidate/CI status; prior results retain their own SHA.

| Acceptance / finding            | Source and verification                                                                    | Old result → current result                                                                 | Outstanding boundary                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Identify contamination (R8/R9)  | Fixed-SHA logs/diffs, refs/PRs, production trailer checker and completed CI log            | 18 invalid messages reproduced; 20 authorized + 3 unauthorized paths identified             | No assertion of product repair                                            |
| Document non-destructive repair | Section 3 patch recipe; local `audit.py` / `preview.json` / `invalid-commits.json`         | Existing rail fails; clean-index import, blob/trunk preservation and whitespace checks pass | Actual successor and new same-SHA product verification remain parent work |
| Task-scoped commit/push/PR      | Only this report is authored on the dispatched helper branch                               | Publication receipt and helper PR record full candidate identity                            | No parent candidate manufactured                                          |
| Parent concrete next step       | Section 5 exact metadata/parent-next comparison through the release CLI                    | Initial worker write rejected (exit 1) → actual operator updates read back (exit 0)         | Parent stays blocked; successor routing/product fixes still required      |
| HR-R1 / acceptance 4 reopen     | Reviewed `6334a41a`, checkpoint `e3aebbef`, active-release call path and corrected receipt | Missing fields / old parent next → all eight live comparisons pass at 23:00:54Z             | Finding addressed; Codex must review the new immutable candidate          |
| Parent required acceptance      | Section 4 and original UAT ledger                                                          | All three NOT MET, retained                                                                 | PG/browser/live/device acceptance not executed by helper                  |

The helper uses ordinary commits and normal push. Its final local SHA, remote
head and PR head must match `CANDIDATE_SHA`, `CANDIDATE_BRANCH` and `PR_URL` in
the release CLI handoff receipt. Report checks are formatting, canonical links,
diff scope/whitespace and the full-range commit policy; they do not establish
parent functionality. Any hosted checks triggered by publication remain tied
to this helper's exact SHA.

### Published evidence

- Anchor `bf63f0c9b3566fc10635a93c1ed5e64edd099cc2` was normally pushed to
  `codex2/sr-partner-notify-qa-20260917-unblock-history-repair`; remote head and
  [draft PR #2181](https://github.com/ajoe734/drts-fleet-platform/pull/2181) head
  were read back and matched. The PR targets dev and changes only this report.
- Anchor report checks completed: Prettier exit 0, canonical consistency exit 0
  (zero findings), full-range trailer check exit 0 (one commit), and
  `git diff --check origin/dev...HEAD` exit 0. The closeout commit adds this
  publication receipt; its full identity and final results are read back through
  the same checks and recorded in the task/PR receipt.
- At initial publication, the parent note and blocked disposition were pending
  Supervisor action. Publication alone did not satisfy acceptance 4; the actual
  operator updates and successful readback above now supply the missing evidence.
- HR-R1 owner continuation adds the precise gateway sequence and fresh failed
  readback to this same artifact. Its next ordinary commit/push is a recovery
  checkpoint only, not a handoff or a claim that the reviewer finding is fixed.
  The prior candidate's CI 36355003807 success and integration 36355003838
  success (main product jobs skipped) apply only to `6334a41a`; any checkpoint
  CI must be read separately. No parent source, branch, worktree or task state
  was changed by this continuation.
- Checkpoint `e3aebbeff450c71d2ac73821d93a08c58f408d0a` was normally pushed and
  matched local/remote/draft PR #2181. Its
  [CI 36356271696](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36356271696)
  completed success, including hosted lint/typecheck/migrations/root and API unit
  steps; [integration 36356271702](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36356271702)
  completed success with main product jobs skipped. Both were read to completion.
  They establish only checkpoint validation, not validation of the new receipt
  commit or parent acceptance. The final receipt commit's SHA, PR head, artifact
  hash and completed checks are recorded in the subsequent handoff/PR receipt.
- This continuation re-executed the documented live probe (eight comparisons,
  exit 0) and syntax-checked all four shell blocks (`bash -n`, exit 0). The
  production parent trailer checker again produced exactly 18 failures in 72
  commits (expected exit 1). A fresh isolated index reproduced the same preview
  tree and both patch hashes, recovered all 20 QA blobs, excluded the same three
  product files, preserved all 31 dev blobs and passed whitespace checks (exit 0).
  `git show-ref` before/after was identical. The scoped regression receipt is
  `.local/hr-r1-20260927-resume/recovery-regression.json`; no parent ref, source
  file or worktree was changed and no product runtime was started.

## 7. CI dependency follow-up and current routing (2026-09-28)

### Failure, reviewed dependency and non-rewriting refresh

The dispatch spec is
`/home/lupin/workspace/drts-fleet-platform/.local/qa-worker-recovery-20260927/SR-PARTNER-NOTIFY-QA-20260917-UNBLOCK-HISTORY-REPAIR-ci-followup.md`.
Candidate `6c49810be7e2552f69aed5908737d0726257556f`, generation
`7dd6b23608e741a4a05e20729cbfb806`, was approved by Codex at
`2026-09-27T23:24:59Z`. Its earlier draft integration success skipped product
jobs. Ready-for-review subsequently triggered
[integration 36358658467](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36358658467).
The failed job log was downloaded and read: at `2026-09-27T23:31:58.4483264Z`,
[cross-surface job 108731489708](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36358658467/job/108731489708)
reported `daily rebuild count expected 3, got 2` in E2E022. The hermetic
suite passed 001–021 and failed 022; `e2e` and `ci-integ` failed by propagation.
This report-only helper does not edit those source/test paths or bypass CI.

`SR-CI-E2E022-DATE-BOUNDARY-20260927` is now `done`. Canonical metadata and
[merged PR #2217](https://github.com/ajoe734/drts-fleet-platform/pull/2217)
agree on reviewed candidate `9406e44d7ee67bdbdac422bc1183d5ef526820b6` and
merge SHA `c8deb87177d13339ca43dd2275346cd477ec7446` at
`2026-09-28T04:53:35Z`. Both dependency acceptance keys have recorded evidence.
[Integration 36378654765](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36378654765)
is completed success at that candidate; all job/step conclusions were read,
including successful cross-surface E2E. Orchestrator tests were skipped.
These are dependency receipts, not CI approval for this helper's changed head.

After confirming the old helper CI completed, local = remote = PR #2181 head,
and dependency completion, the assigned owner worktree merged fetched dev
normally. Merge `f5589ce9789e8895ed2852cc1c80b0ac1d5a3b24` has parents
`6c49810be7e2552f69aed5908737d0726257556f` and
`c8deb87177d13339ca43dd2275346cd477ec7446`; no conflicts or authored product
edits. The diff against dev remains **only this report**. The previous candidate
and approval remain historical. The new head requires fresh Codex review and
complete same-SHA CI in existing [PR #2181](https://github.com/ajoe734/drts-fleet-platform/pull/2181).

### Actual canonical readback and successor boundary

At `2026-09-28T05:00:32.778981+00:00`, the supplied release CLI's `show`
readback passed **12 comparisons**, exit 0. Receipt
`.local/hr-ci-followup-20260928/readback.json` SHA-256:
`7ac61acd4da13514026462a4feb0a0b56ce6efdb30b8ac9dfb03de0e590107bd`.

| Current field / check           | Observed result                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Parent status; owner / reviewer | `todo`; `Gemini` / `Codex2`                                                      |
| Parent execution branch         | `gemini/sr-partner-notify-qa-20260927-successor`                                 |
| Helper disposition              | `resolved_parent_status=todo`; `resolved_parent_waiting_for=null` (explicit key) |
| Helper `resolved_parent_next`   | Exact full-string equality with parent `next`, quoted below                      |
| Helper `resolved_parent_at`     | Absent; not manually set                                                         |
| Helper owner / reviewer         | `Codex2` / `Codex`, preserved                                                    |
| Parent required acceptance      | Same three section 4 keys; no `acceptance_evidence`, all unmet                   |
| Parent candidate                | Absent; no successor handoff manufactured                                        |

The exact shared next step is:

> Operator routing complete: wait for all 11 dependencies (five product FIX children, E2E022 date-boundary CI repair, history repair and original four completed tasks), then use clean gemini/sr-partner-notify-qa-20260927-successor from current origin/dev. Follow task_spec_ref and preserved history repair recipe to import only20 QA net-diff files; preserve PR2175/2177/2179 and run full24-case hosted matrix. All required acceptance remains unmet; no live/device claim.

All 11 dependency IDs were compared as an exact set, not only counted:

| Dependency                                             | Readback status              |
| ------------------------------------------------------ | ---------------------------- |
| `SR-PARTNER-NOTIFY-NAV-20260917`                       | `done`                       |
| `SR-PARTNER-NOTIFY-UI-20260917`                        | `done`                       |
| `SR-PARTNER-NOTIFY-LEGACY-20260917`                    | `done`                       |
| `SR-PARTNER-NOTIFY-PG-20260919`                        | `done`                       |
| `SR-PARTNER-NOTIFY-FIX-ADMIN-20260927`                 | `done`                       |
| `SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927`             | `done`                       |
| `SR-PARTNER-NOTIFY-FIX-SNAPSHOT-20260927`              | `done`                       |
| `SR-PARTNER-NOTIFY-FIX-ENTRY-20260927`                 | `blocked`                    |
| `SR-PARTNER-NOTIFY-FIX-HISTORY-20260927`               | `done`                       |
| `SR-PARTNER-NOTIFY-QA-20260917-UNBLOCK-HISTORY-REPAIR` | `in_progress` (this refresh) |
| `SR-CI-E2E022-DATE-BOUNDARY-20260927`                  | `done`                       |

The parent's `todo` is dependency-gated, not permission to skip ENTRY, the
helper lifecycle or integrated acceptance. The four completed product children
do not close the parent's 24-case matrix. ENTRY's recorded blocker is its
published invalid commit ancestry, routed through its own recovery task.

`git for-each-ref`, live `git ls-remote --heads` and `git worktree list --porcelain`
confirm the assigned successor name is unused: **no existing successor branch
or worktree**. The clean successor is a verified creation/import path, not an
already-created artifact. After dependencies complete, the parent owner must
create its isolated checkout from then-current dev and repeat section 3's
scoped import/checks; never import old ancestry or reuse the canonical root.
The three preserved remote heads remain exactly `3d50ba809...`, `91b1d4ac...`
and `faee900f...` from section 1. This helper changed none of them or their PRs.

Current pre-merge read-only probe (the historical section 5 probe intentionally
has different expectations):

```bash
python3 - <<'PY'
import json, os, subprocess
cli = "/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-585087a2fd81/tools/development-orchestrator/bin/ai-status.sh"
parent_id = "SR-PARTNER-NOTIFY-QA-20260917"
helper_id = parent_id + "-UNBLOCK-HISTORY-REPAIR"
def show(task):
    return json.loads(subprocess.check_output(
        [cli, "show", task], env={**os.environ, "AI_NAME": "Codex2"}, text=True))
h, p = show(helper_id), show(parent_id)
expected = {
    "SR-PARTNER-NOTIFY-NAV-20260917", "SR-PARTNER-NOTIFY-UI-20260917",
    "SR-PARTNER-NOTIFY-LEGACY-20260917", "SR-PARTNER-NOTIFY-PG-20260919",
    *{"SR-PARTNER-NOTIFY-FIX-" + x + "-20260927" for x in
      ("ADMIN", "TRANSPORT", "SNAPSHOT", "ENTRY", "HISTORY")},
    helper_id, "SR-CI-E2E022-DATE-BOUNDARY-20260927",
}
assert p["status"] == h["resolved_parent_status"] == "todo"
assert h["resolved_parent_waiting_for"] is None
assert p["next"] == h["resolved_parent_next"] and p["next"]
assert "resolved_parent_at" not in h
assert (p["owner"], p["reviewer"]) == ("Gemini", "Codex2")
assert (h["owner"], h["reviewer"]) == ("Codex2", "Codex")
assert len(p["depends_on"]) == 11 and set(p["depends_on"]) == expected
assert p["execution_branch"] == "gemini/sr-partner-notify-qa-20260927-successor"
assert not p.get("candidate_sha") and not p.get("acceptance_evidence")
assert set(p["required_acceptance"]) == {
    "integrated_controlled_receiver_negative_matrix_same_sha",
    "navigation_and_admin_ui_hosted_real_runtime_evidence",
    "existing_webhook_tenant_gates_preserved_and_live_not_claimed",
}
assert show("SR-CI-E2E022-DATE-BOUNDARY-20260927")["status"] == "done"
print("Current parent routing and unmet acceptance: PASS")
PY
```

### Finding-level verification for this refresh

| Finding / acceptance                               | Source and change boundary                                                                                                                                     | Old result → refreshed result                                                                                                               | Command / evidence and limitation                                                                                                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2E022 CI blocker                                  | Production fixture `tests/e2e/E2E-022-operations-reporting.sh` and shared `tests/e2e/lib/operations-reporting-dates.sh`, inherited unchanged from reviewed dev | Old helper full CI failed daily count; dependency same-SHA hosted CI passed; offline regression at merge `f5589ce9...` exit 0               | `bash tests/unit/system-remediation/sr-ci-e2e022-date-boundary-20260927/test-date-logic.sh`; 8 boundary scenarios plus negative controls. HTTP is mocked; no server or PG started. Helper's new hosted CI is separate. |
| R8/R9 identification and non-destructive recovery  | Section 3 scoped patch and production trailer checker; only the report authored                                                                                | Old checker still exit 1, exactly 18 invalid / 72 commits; both historical and current-dev index previews pass                              | `python3 .local/hr-ci-followup-20260928/recovery.py` exit 0; recipe remains reproducible from section 3 immutable objects.                                                                                             |
| Preserve current dev during clean successor import | Independent index initialized from `c8deb87177d13339ca43dd2275346cd477ec7446`                                                                                  | 20 QA blobs equal old parent; excluded three equal current dev; all 59 dev-changed paths preserved; entire remaining tree equal current dev | Preview tree `b87183a46d94c2c9d4bba31992db1b95f7015210`; no ref, owner worktree or parent commit created.                                                                                                              |
| HR-R1 and acceptance 4 current routing             | Supplied-release CLI parent/helper/dependency slices and section 7 probe                                                                                       | Historical missing fields → historical blocked correction → operator queued `todo`, exact next equality and 11 dependencies verified        | Local `readback.py` exit 0, 12 comparisons; no cross-task mutation or manual resolution timestamp.                                                                                                                     |
| Canonical publication                              | Normal merge retains old helper head and reviewed dev; only this report differs from dev                                                                       | Old approval is historical; publish new report commit normally to existing PR #2181                                                         | Final full SHA / remote / PR equality, artifact hash and completed validation recorded in the release-CLI handoff and PR body after checks finish. Fresh Codex review required.                                        |
| Parent required acceptance                         | Original three keys and current metadata                                                                                                                       | All three remain unmet; no parent candidate or acceptance evidence                                                                          | Product integrated/PG/browser/receiver matrix remains parent work; no live partner, native-device or deployment claim.                                                                                                 |

Recovery receipt `.local/hr-ci-followup-20260928/recovery.json` SHA-256:
`4cde7979b8a5d57524e5b5b829d462e71ebd459fe0db92244e4b1a229993060a`.
The original preview tree, both patch SHA-256 values and all 31 original-dev
preservations also reproduced exactly. `git show-ref` before/after the index
probe was identical. The latest preview checks the complete Git tree against
current dev with only the 20 QA blobs replaced; this includes the reviewed
transport/date repairs. It is content evidence, not product acceptance.

Report checks use Prettier, canonical consistency, full-range trailers,
`git diff --check`, report-only diff scope, shell-block syntax and the current
live probe. Publication-triggered runs must finish and their job/step results
be read before handoff; failures in another unowned path require a concrete
canonical blocker. No VM product runtime, browser server or deployment is
needed or authorized for this helper.
