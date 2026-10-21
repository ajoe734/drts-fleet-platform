# Unblock Path for PAX-BOOKING-HISTORY-20261009

## 1. Contamination identified

The parent task's historical candidate branch is `gemini/pax-booking-history-20261009`
(PR [#2506](https://github.com/ajoe734/drts-fleet-platform/pull/2506),
base `dev`). At the time this unblock task was dispatched, the canonical
shared local ref `refs/heads/gemini/pax-booking-history-20261009` was one
commit ahead of the then-observed remote tip. This was unpublished local
progress, not divergent ancestry:

- `origin/gemini/pax-booking-history-20261009` (PR #2506 head at dispatch
  time): `159c1783edce144523bffefa3c6b9407b6c5866f`
- shared local named ref: `be3f5983a33c42e5eabd16b7710778b6fe9139b5`

`git log --oneline be3f5983a33c42e5eabd16b7710778b6fe9139b5 -2` showed the
local commit's sole parent was exactly `159c1783e` (origin's tip), i.e. a
pure one-commit fast-forward, not a rewrite/divergence:

```
be3f5983a wip(PAX-BOOKING-HISTORY-20261009): anchor uat doc update for R8 and R2 blocked status
159c1783e PAX-BOOKING-HISTORY-20261009: fix test deadlock in uv-exec-006 token_failure
```

`git show --stat be3f5983a` confirmed the commit only touched
docs/04-uat/passenger-app-20261009/PAX-BOOKING-HISTORY-20261009.md (the
task's own UAT/evidence doc, present on `gemini/pax-booking-history-20261009`
but not on this doc-only unblock branch), updating it to record that R8 was fixed and
R2 was blocked pending a `write_scopes` grant — matching the owner's
`progress`/`system-block` machine-truth entries at `2026-10-10T08:27:59Z`
and `2026-10-10T08:32:32Z`. The exact parent document is available in this
[immutable parent blob](https://github.com/ajoe734/drts-fleet-platform/blob/be3f5983a33c42e5eabd16b7710778b6fe9139b5/docs/04-uat/passenger-app-20261009/PAX-BOOKING-HISTORY-20261009.md).

This is an anchor commit (per `docs/ops/branch-strategy.md` §11 /
`tools/development-orchestrator/skills/worker-anchor-commit.md`) that the
owner (Gemini, git author `Gemini2`) made. The earlier report attributed
its unpublished state to supervisor worktree cleanup, but supplied no
historical worktree path, cleanup event/timestamp, checked-out root ref or
ref-deletion evidence. That cleanup cause and the historical root attachment
are **unverified**. Worktrees share named refs; a missing worktree does not
establish that its commits or refs were deleted. At the observed pre-repair
remote tip, the anchor was not yet published, so:

- PR #2506 did not show the updated UAT evidence (reviewer Codex2's most
  recent `reopen` at `07:26:07Z` could not see it).
- The named local Gemini ref retained the anchor independently of another
  branch's HEAD. Resetting a checked-out `dev` branch would not delete that
  Gemini ref. Losing that ref's retention would require moving/deleting
  the retaining ref; even then object loss would also depend on other refs,
  reflogs and eventual garbage collection. Guaranteed loss of the only
  record was not demonstrated. Read-only checks on 2026-10-10 confirmed
  canonical root HEAD attached to `refs/heads/dev` and the named Gemini
  ref still at `be3f5983a`; these current facts do not prove historical attachment.

No corruption of PR #2506's already-reviewed commits (`4bc4dc2b2`..`abeb4445d`..`159c1783e`)
was found; the branch itself is linear and matches its own PR head history.
The verified delivery gap was that one unpublished local anchor. Its
historical worktree/cleanup cause remains unverified; it did not explain
the parent's independent implementation or CI blockers.

## 2. Non-destructive repair applied

Because the local commit's parent was exactly `origin`'s current tip, this
was a clean fast-forward — no rebase, no amend, no force-push needed, and
nothing in `docs/ops/branch-strategy.md` §11 blocks a plain fast-forward
push of an owner's own already-made commit:

```
git push origin be3f5983a33c42e5eabd16b7710778b6fe9139b5:refs/heads/gemini/pax-booking-history-20261009
```

Result: `159c1783e..be3f5983a  be3f5983a33c42e5eabd16b7710778b6fe9139b5 -> gemini/pax-booking-history-20261009`
(plain update, not forced).

The historical post-push check `gh pr view 2506 --json headRefOid` returned
`be3f5983a33c42e5eabd16b7710778b6fe9139b5`, matching the canonical-root ref
exactly. GitHub `mergeStateStatus=BLOCKED` was separately observed; its
complete branch-protection cause was not diagnosed by that check. It
cannot be attributed to the orchestrator's `write_scopes` gate. The exact
parent anchor also had a failed hosted integration job (see §3); helper
CI success cannot establish parent CI success. By the 2026-10-10 13:19 UTC
read-only check, PR #2506 had advanced normally to
`6f3eae5fd718d1468bd51200f4d02d1cfbabd1c9`, retaining the anchor as an
ancestor. Do not repeat the historical parent push.

No source files were changed by this repair; the pushed commit is
documentation-only (the owner's own UAT evidence update).

## 3. Historical parent machine blocker and independent GitHub CI gate

`PAX-BOOKING-HISTORY-20261009` was `status: blocked` at the historical dispatch
independent of the history contamination above. Per the owner's own
`system-block` entry (`2026-10-10T08:32:32Z`) and the task's `next` field:

> Need Supervisor to add
> `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` to
> `write_scopes` to fix R2 as requested by reviewer.

Reviewer Codex2's locked-candidate review on `abeb4445d` (`07:26:07Z`)
confirmed R2's remaining defect (dispatch released before order/history/token
persistence is durably confirmed; failed compensation can leave a
dispatchable, unowned order) requires a fix inside
`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`, which the
task's then-current `write_scopes` did not include
([[project-reassignment-must-check-eligible-agents-list]] — the analogous
write-scope/eligibility gate class of blocker). This is a governance/scope
gate in machine truth. GitHub CI and branch protection are independent
authorities; neither candidate CI workflow accepts `write_scopes` as an
input. Only Supervisor can expand the live task's scope.

Same-SHA parent CI evidence, re-read on 2026-10-10:
[integration run 38039420638, job 114176700246](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38039420638/job/114176700246)
reports `head_sha=be3f5983a33c42e5eabd16b7710778b6fe9139b5`,
`conclusion=failure`, `completed_at=2026-10-10T08:56:20Z`.
The logs identify UV-EXEC-006 cancellation drains delayed workflow
persistence: `token_failure`; the assertion expected
`loadOrderCancellationForUpdate` not to be called but observed one call
(integration test line 2546; integration exited 1). This is observed
parent CI failure, not a helper failure or proof of every GitHub BLOCKED
condition. No parent product acceptance or later parent CI pass is claimed.

## 4. Concrete current parent next step (2026-10-10 13:19 UTC)

Official CLI parent slice now records `in_progress`, owner **Codex2**,
reviewer **Codex**. Supervisor already granted the owned-mobility/contracts
scopes. The parent's recorded progress includes normally pushed R2 anchor
`6f3eae5fd718d1468bd51200f4d02d1cfbabd1c9` on PR #2506. Preserve that live
parent and its implementation; do not replay the old Gemini scope request.

1. **Codex2** continues the recorded atomic-transaction regressions,
   booking repository TS2322/probe lint fixes, public settings API and
   permissions across all entry points.
2. **Supervisor** coordinates the still-recorded integration-test scope
   for UV-EXEC-006 readSpy timing while preserving durable cancellation
   assertions, and cleanup of the inherited seven next-env.d.ts changes
   and fleets-closeout-004-ops-visibility-proof.json unrelated diff.
3. **Codex** reviews the parent's next separately locked candidate;
   parent CI/product acceptance remains its own delivery gate.

This unblock task made no change to `write_scopes`, `eligible_agents`, or
any product/test source file — it preserved the unpublished anchor and
repairs this report. Helper metadata preserves a later blocked parent,
and the production merge path leaves an in-progress parent unchanged (§6).

## 5. Repair of Codex2 reopen findings (REVIEWED_SHA `e413848411b54f31a3754cd38159ce916e7c99a1`, candidate_generation `4ca3eca996ab45ac8464902d90fdc700`)

### HR2 (first-round path gate fixed; causal wording remained unresolved)

The backtick-fenced repo-path citation at the old §1 (the parent task's UAT
evidence doc under docs/04-uat/passenger-app-20261009/) only exists on
`gemini/pax-booking-history-20261009`, never on this doc-only branch, so
`check_canonical_consistency.py`'s cited-paths rule correctly flagged it as
an unresolvable in-repo reference. Reworded to prose that
states the cross-branch location instead of citing it as a local path; no
factual claim changed. Re-ran the exact candidate-scoped gate against the
fix commit (not just the originally-failing SHA):

```
python3 tools/ci/git/check_canonical_consistency.py --ci --base e41384841^ --head f45474550
```

Exit 0, all four rules 0 findings (`l1-edit-authority`, `cited-paths`,
`cited-decisions`, `task-claims`). `f45474550` is already pushed to
`origin/claude/pax-booking-history-20261009-unblock-history-repair` and is
PR #2521's current head (`gh pr view 2521 --json headRefOid` ==
`f45474550a975f2cae7e7d871cfb4bc4cdfda0cf`, confirmed at write time).
The previous §5 also asserted that the CI/scope and cleanup/reset wording
needed no repair. That assertion was incorrect: formatting a hypothetical
reset command did not qualify the historical causal claim. A green path
checker only established resolvable citations, not factual accuracy. The
second review reopened HR2 A (CI/scope conflation) and HR2 B (unsupported
cleanup/ref loss), repaired in §1–§4 and itemized in §6 below.

### HR1 (historical worker command blocked; Supervisor metadata repair now verified)

The following preserves the prior session's finding, attempted command
and rejected result. Its Gemini/Claude routing and requested Supervisor
command are historical evidence, **not current execution instructions**.
Supervisor has since stored the three required fields, with current
Codex2 ownership and granted scope recognized; §6 verifies that repair.

The reviewer is correct that this task had no `resolved_parent_status`,
`resolved_parent_next`, or `resolved_parent_waiting_for` in canonical
metadata, and that `apply_unblock_parent_resolution`
(`bin/ai_status.py:1097-1179`, called from `transition_after_merge:663-689`)
defaults `resume_status` to `todo` at line 1116 when those fields are
absent — which would incorrectly flip the still-blocked parent to `todo`
and resolve its open blocker on this helper's next same-SHA merge, even
though the `write_scopes` gate for `owned-mobility.service.ts` has not been
granted.

Per `candidate-lifecycle.md:33-38`, the correct repair is to persist
`resolved_parent_status: blocked`, `resolved_parent_next`, and
`resolved_parent_waiting_for` onto *this* helper task's own metadata before
handing off a new candidate, so `apply_unblock_parent_resolution` reads
those stored fields instead of defaulting. The only production code path
that writes those three fields onto a task is `command_assign`
(`bin/ai_status.py:1752-1821`) via `TASK_METADATA_JSON`→`task_metadata_from_env()`
(`bin/ai_status.py:1023-1047`, merged into the task at line 1801); no other
mutation command (`progress`, `note`, `handoff`, `blocker`, `system-block`,
`reopen`, `approve`, `record-acceptance`, `start`) touches these fields.

This owner session is a dispatched worker (`ORCH_DISPATCH_ROLE=owner`,
`ORCH_RUN_ID` set). `control_plane/usecases/task_board_commands.py:81-88`
(`_guard_worker_command`) restricts dispatched owner/reviewer sessions to
exactly `{start, progress, note, handoff, approve, reopen, blocker,
system-block, record-acceptance}` — `assign` is not in that set. Attempted
exactly the command the fix requires, reproducing the structural block
first-hand rather than assuming it:

```
AI_NAME=Claude TASK_METADATA_JSON='{"resolved_parent_status":"blocked", ...}' \
  bash .../ai-status.sh assign PAX-BOOKING-HISTORY-20261009-UNBLOCK-HISTORY-REPAIR Claude Codex2
```

Result: `Exit code 1` / `Dispatched workers must use their assigned task
lifecycle commands` — the command did not run and changed no state (the
transaction guard in `execute_with_result` raises before the handler is
invoked, and `task_board_transaction` only commits after the handler
returns). No canonical field was read incorrectly or written.

This matches HR1's own fix boundary exactly ("original owner coordinate
with Supervisor using the authorized release CLI") — it is not optional
phrasing, it is the only code path that exists. **Supervisor must run, on
the canonical root with the current release CLI, before this helper's next
candidate is merged:**

```
AI_NAME=Supervisor TASK_METADATA_JSON='{"resolved_parent_status":"blocked","resolved_parent_next":"Parent PAX-BOOKING-HISTORY-20261009 remains blocked: owner Gemini cannot implement reviewer R2 (owned-mobility.service.ts dispatch/compensation fix) because that file is outside this task machine write_scopes. Supervisor must grant write_scopes for apps/api/src/modules/owned-mobility/owned-mobility.service.ts before Gemini can push the R2 fix for Codex2 to re-review. This unblock helper only repaired branch/commit history and the canonical-consistency doc citation; it never touched owned-mobility.service.ts and grants no scope.","resolved_parent_waiting_for":"Codex2"}' \
  bash /home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3/tools/development-orchestrator/bin/ai-status.sh assign PAX-BOOKING-HISTORY-20261009-UNBLOCK-HISTORY-REPAIR Claude Codex2
```

`resolved_parent_waiting_for` is set to `Codex2` (the parent's own
reviewer lane) rather than `Supervisor`, because `ensure_agent` only
accepts a `KNOWN_AGENTS` lane (`bin/ai_status.py:48-...`) and
`apply_unblock_parent_resolution` calls `ensure_agent(parent_waiting_for)`
on whatever is supplied — `Supervisor`/`human` are not members of
`KNOWN_AGENTS` and would raise. The real actor who must act (Supervisor,
to grant `write_scopes`) is named in `resolved_parent_next`'s message body
instead, consistent with how this task's own parent blocker is already
routed.

This was a real blocker on this helper task (recorded via `ai-status.sh
blocker`, waiting_for `Codex2`, same reasoning as above): this owner cannot
hand off a mergeable candidate that is safe under
`apply_unblock_parent_resolution`'s current default until Supervisor runs
the command above. Handing off then, without that metadata, would reproduce
exactly the defect HR1 identified on the next merge.

## 6. Second-round repair and delivery evidence (Codex, 2026-10-10)

### Adjacent reviews, reproduction and bounded repair

Codex2's first REOPEN reviewed
`e413848411b54f31a3754cd38159ce916e7c99a1`, generation
`4ca3eca996ab45ac8464902d90fdc700`, on PR #2521. HR1 identified unsafe
default parent routing; HR2 identified the missing parent citation and
incorrect CI/scope and cleanup/ref-loss claims. The intermediate
`f45474550a975f2cae7e7d871cfb4bc4cdfda0cf` fixed only the citation gate.

Codex2's second REOPEN reviewed
`9fd6319db9e7278141099453e6583adeefda66c8`, generation
`b2558ac5e8304723a2fe40a61aa590ee`, on the same PR. Its artifact SHA256
was `3672730c9e04f3cd91c89d415b8be3dc696174640043c953772164c82eceedc8`.
HR1 metadata was verified repaired by Supervisor. HR2 A/B remained
unresolved for the **second consecutive review of the same trigger and
failure**, affecting acceptance 1 and 3. The owner takeover handoff
acknowledged that the HR2 wording had not been repaired. A green helper
path gate did not supersede that disclosure.

Precise static localization in both adjacent candidates: §1 (old lines
34–46) claimed supervisor cleanup and guaranteed loss after a root reset;
§2/§3 (old lines 68–70 and 92–94) treated GitHub BLOCKED as a scope gate
and ruled out CI; §5 (old lines 142–146) declared the wording resolved.
Reading both immutable artifact blobs reproduces all four assertions and
the missing immutable parent link. Expected behavior is to distinguish
GitHub and machine authorities, and either substantiate historical ref
loss or explicitly qualify it. Actual behavior retained unsupported
causality. The production citation checker uses
`CITED_PATH_RE` / `check_cited_paths` in
`tools/ci/git/check_canonical_consistency.py`; it checks backtick paths
against its current checkout, not the truth of prose claims. Running it
with an old `--head` from a repaired checkout cannot reproduce the old
content defect. The first candidate's detached checkout reproduced the
original one-finding failure (exit 1), without resetting an active tree.

Repair boundary confirmed by this owner dispatch: edit **only this
existing artifact**, first the CI/scope explanation, then cleanup/ref-loss
qualification and the immutable parent citation. §5 now itemizes the
partial historical result and preserves the old HR1 rejected command;
§4 records the current parent next step. No orchestrator/product changes,
scope grants, parent push or parent status mutation were made this round.
The unavailable retired owner .local evidence file is not delivery evidence;
the required results are recorded here and independently rerun below.

### Finding and acceptance table (Guide §0.7)

Commands below use Python 3.12.3, Git 2.43.0, gh 2.100.0 and release
`orchestrator-0fb44e9576d3`. PASS, historical FAIL and pending delivery are
separate. This table describes the repaired artifact; its final containing
commit is supplied as the full `CANDIDATE_SHA` at handoff (a document cannot
embed its own commit hash). Adjacent full SHAs above remain immutable.

| Finding / acceptance | Source and repair location | Old reproduction → repaired result | Command, exit and evidence | Unverified / limitation |
| --- | --- | --- | --- | --- |
| HR1 / acceptance 4: helper merge must not erase a parent blocker | Release ai_status.py `transition_after_merge:663–684` → `apply_unblock_parent_resolution:1097–1180`; helper CLI metadata; §4/§5 | Missing fields: parent todo, original blocker resolved, 1 pending owner handoff → stored blocked fields: parent blocked, original blocker open, 0 pending owner handoffs; actual in_progress parent dict unchanged | Official CLI slices and production in-memory probe below, exit 0; stored status blocked, waiting_for Codex2, next recognizes granted scope/current owner | append_log alone intercepted; fixture merge, not a real merge or product acceptance. No canonical file directly read/written |
| HR2 original citation / acceptance 3 | §1 immutable parent blob; `check_cited_paths` | e4138484 detached checkout: exit 1, one missing UAT path → repaired checkout full helper gate: exit 0, four rules zero findings | Consistency commands below; GitHub contents API returns blob `76049beaa52af522b44dd16113cbbc3dd62721d7`, matching local `git rev-parse` of parent blob | Original failed hosted helper job was [114176846055](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38039535351/job/114176846055); old helper CI is not current candidate CI |
| HR2 A / acceptance 3: CI versus machine blocker | §2/§3 and former §5 resolved assertion | Both e4138484 and 9fd6319d retained incorrect CI/scope causal claim → removed; historical scope and exact parent CI failure separately reported | Static adjacent-blob content probe exit 0; `gh api repos/ajoe734/drts-fleet-platform/actions/jobs/114176700246` exit 0 plus logs read, exact parent head_sha/conclusion/time in §3 | Complete GitHub BLOCKED cause was not diagnosed; later parent CI and product acceptance remain separate |
| HR2 B / acceptance 1: worktree/ref loss claims | §1 and former §5 resolved assertion | Both old candidates asserted cleanup/guaranteed loss without evidence → historical cleanup/root attachment explicitly unverified; named-ref retention and conditional object loss stated accurately | Static adjacent-blob probe exit 0; root `symbolic-ref HEAD` is refs/heads/dev; `rev-parse refs/heads/gemini/pax-booking-history-20261009` is be3f5983a33c42e5eabd16b7710778b6fe9139b5 | Current refs do not prove historical cleanup, attachment or deletion. No cleanup log/path/timestamp recovered; acceptance uses corrected qualification |
| Acceptance 1: exact anchor/parent/path | §1; immutable parent evidence | Sole parent 159c1783edce144523bffefa3c6b9407b6c5866f; only parent UAT document changed; linear unpublished anchor, not corrupt ancestry | `git rev-list --parents -n 1 be3f5983a33c42e5eabd16b7710778b6fe9139b5` and `git show --stat`, exit 0 | Historical worktree cleanup cause remains unverified, not required to invent |
| Acceptance 2: non-destructive preservation | §2; original published history | Historical normal fast-forward to be3f5983a retained; anchor is ancestor of later parent PR head 6f3eae5fd718d1468bd51200f4d02d1cfbabd1c9 | `git merge-base --is-ancestor` with those full SHAs, exit 0; read-only PR #2506 head confirmed | No repeated parent push, amend, rebase, reset or force-push |
| Acceptance 3: helper delivery | §6 history recovery below; final handoff full SHA/branch/PR | Original helper history preserved by merge; ordinary checkpoint push succeeded; assigned Codex branch and existing PR #2521 source receive the same final SHA, verified before handoff | Full helper consistency/trailer gates below; new candidate gets fresh review/CI, previous candidate results retained separately | Same-SHA review, hosted CI and merge for the new candidate are pending; no done claim |
| Acceptance 4: live parent next step | §4; official parent CLI slice last_update 2026-10-10T13:16:17Z | Parent now in_progress, owner Codex2/reviewer Codex; retains R2 progress, integration scope/cleanup/settings work; helper disposition safe if parent later blocked | CLI show and production actual-parent preservation probe, exit 0; no write to parent status/next | Parent implementation, integration-test repair and product acceptance remain unresolved in parent task |

### Reproducible adjacent-candidate content check

This is the minimal static localization supplied by the second review,
rerun after the bounded repair. It establishes report-content differences,
not product acceptance or historical cleanup events.

```bash
python3 - <<'PY'
import subprocess
from pathlib import Path
p = 'support/unblock/PAX-BOOKING-HISTORY-20261009/PAX-BOOKING-HISTORY-20261009-UNBLOCK-HISTORY-REPAIR.md'
claims = (
    'the branch is not blocked by history/CI, ' + 'it is blocked on a task',
    'worktree was reaped by routine ' + 'supervisor worktree cleanup',
    'away from being silently ' + 'destroyed',
    "root's local " + 'branch ref',
)
link = 'https://github.com/ajoe734/drts-fleet-platform/blob/be3f5983a33c42e5eabd16b7710778b6fe9139b5/docs/04-uat/passenger-app-20261009/PAX-BOOKING-HISTORY-20261009.md'
for sha in ('e413848411b54f31a3754cd38159ce916e7c99a1', '9fd6319db9e7278141099453e6583adeefda66c8'):
    text = subprocess.check_output(['git', 'show', sha + ':' + p], text=True)
    assert all(c in text for c in claims) and link not in text
    print(sha, 'REPRODUCED: four claims and missing immutable link')
text = Path(p).read_text()
assert all(c not in text for c in claims) and link in text
assert 'conclusion=failure' in text and '**unverified**' in text
print('repaired content PASS')
PY
```

Recorded exit 0: both old SHA defects reproduced; repaired content passes.

### Reproducible production routing regression

Read only official CLI task slices into local evidence files (never read
the entire canonical status file), then run this probe from the worker
checkout. The case with fields removed reproduces HR1; the two current
metadata cases verify production behavior. No routing function is mocked.

```bash
release=/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3
mkdir -p .local/history-repair-20261010
AI_NAME=Codex "$release/tools/development-orchestrator/bin/ai-status.sh" show PAX-BOOKING-HISTORY-20261009-UNBLOCK-HISTORY-REPAIR > .local/history-repair-20261010/helper.json
AI_NAME=Codex "$release/tools/development-orchestrator/bin/ai-status.sh" show PAX-BOOKING-HISTORY-20261009 > .local/history-repair-20261010/parent.json
PYTHONDONTWRITEBYTECODE=1 python3 - <<'PY'
import copy, importlib.util, json, os
from pathlib import Path
for key in ('PARENT_STATUS', 'PARENT_NEXT', 'PARENT_WAITING_FOR'):
    assert not os.environ.get(key), f'{key} would override stored metadata'
release = Path('/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3')
spec = importlib.util.spec_from_file_location('history_release_status', release / 'tools/development-orchestrator/bin/ai_status.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.append_log = lambda entry: None  # Only external log write intercepted.
helper = json.loads(Path('.local/history-repair-20261010/helper.json').read_text())
parent = json.loads(Path('.local/history-repair-20261010/parent.json').read_text())
assert helper['resolved_parent_status'] == 'blocked'
assert helper['resolved_parent_waiting_for'] == 'Codex2'
assert 'Codex2' in helper['resolved_parent_next']
assert parent['status'] in ('in_progress', 'blocked')
timestamp = '2026-10-10T13:20:00Z'
for case in ('missing_metadata', 'stored_blocked', 'actual_parent'):
    h, p = copy.deepcopy(helper), copy.deepcopy(parent)
    if case != 'actual_parent':
        p.update(status='blocked', waiting_for='Codex2')
    if case == 'missing_metadata':
        for key in ('resolved_parent_status', 'resolved_parent_next', 'resolved_parent_waiting_for'):
            h.pop(key, None)
    before = copy.deepcopy(p)
    original = {'task_id': p['id'], 'status': 'open', 'message': 'unresolved fixture blocker'}
    state = {'tasks': [h, p], 'blockers': [original], 'handoffs': []}
    module.transition_after_merge(state, h, message='in-memory helper merge fixture', timestamp=timestamp)
    pending = [x for x in state['handoffs'] if x['task_id'] == p['id'] and x['status'] == 'pending']
    assert h['status'] == 'done'
    if case == 'missing_metadata':
        assert p['status'] == 'todo' and original['status'] == 'resolved' and len(pending) == 1
    elif before['status'] == 'blocked':
        assert p['status'] == 'blocked' and original['status'] == 'open' and not pending
        assert p['next'] == helper['resolved_parent_next'] and h['resolved_parent_at'] == timestamp
    else:
        assert p == before and original['status'] == 'open' and not pending
    print(case, p['status'], original['status'], len(pending))
PY
```

Recorded output, exit 0: missing_metadata → todo/resolved/1;
stored_blocked → blocked/open/0; actual_parent → in_progress/open/0.
This records routing evidence only; helper merge and parent acceptance
are not simulated delivery claims.

### Helper history recovery and check boundaries

The assigned worker branch was initially
`codex/pax-booking-history-20261009-unblock-history-repair` at
`db8c36e13f6b3754a75ce4e843d55deb2e4386c5`, lacking this artifact. The
existing published helper branch remained
`claude/pax-booking-history-20261009-unblock-history-repair` at
`9fd6319db9e7278141099453e6583adeefda66c8`, PR #2521. The two sides shared
`5b11155d33fd4d6c345e01cb9730012d3b3d08d1`. Their SHA/difference evidence
was recorded through official progress before recovery. An ordinary merge
`a35a2dc998d4cb63ea6a13de530f42cd8c2a7eed` preserves both parents and all
three published helper commits. Factual corrections were checkpointed and
normally pushed as `acdd92586b9af78cfedfac0e9dfb29638ff364a7` on the assigned
Codex branch. No ref was reset or rewritten. Rather than open a competing
PR, the final descendant is also normally pushed to the existing legacy
Claude PR source ref. PR #2521 is retained, bound by PR_URL and the exact
head SHA at handoff. The local/assigned Codex branch and both published
refs have the same candidate SHA; the bus observes the PR's actual source
branch. No prior candidate was amended or removed.
The only diff from the assigned dev baseline is this artifact.

Required gates (rerun on final HEAD after this evidence commit):

```bash
PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/git/check_canonical_consistency.py --ci --base 5b11155d33fd4d6c345e01cb9730012d3b3d08d1 --head HEAD
PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/git/check_commit_trailers.py --base 5b11155d33fd4d6c345e01cb9730012d3b3d08d1 --head HEAD
git diff --check db8c36e13f6b3754a75ce4e843d55deb2e4386c5 HEAD
```

At the factual checkpoint: all four consistency rules zero findings,
trailer gate 7 commits OK, and task-only whitespace gate exit 0. Full
old-base `git diff --check 5b11155d33fd4d6c345e01cb9730012d3b3d08d1 HEAD`
exited **2**, for inherited whitespace in
`.github/workflows/dev-owned-operational-fixture-cleanup.yml`,
`operations/verification/cleanup-owned-operational-fixtures.py` and
`tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py`.
Byte comparisons via git show confirmed all three blobs unchanged from
the assigned `db8c36e13` baseline. The full diff is not called green;
repairing those unrelated merged files is outside this artifact-only scope.
Local detail is in .local/history-repair-20261010/full-old-base-whitespace.log.

Read-only GitHub contents API validated the immutable parent link (exit
0), blob `76049beaa52af522b44dd16113cbbc3dd62721d7`. Prior helper runs
[38042599080](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38042599080)
and [38042599086](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38042599086)
were re-read as completed/success with exact
`head_sha=9fd6319db9e7278141099453e6583adeefda66c8` (exit 0); prior
review recorded readonly-dev-metadata/orchestrator-tests SKIPPED and other
checks completed/success. Those old helper results are **not** parent
anchor CI evidence or the new helper's CI. No hosted workflow was
dispatched, no product/PG/browser/Docker service was run on this VM.
Product/DB/browser acceptance is not applicable to this documentation
helper; the parent's required product acceptance remains unresolved.
