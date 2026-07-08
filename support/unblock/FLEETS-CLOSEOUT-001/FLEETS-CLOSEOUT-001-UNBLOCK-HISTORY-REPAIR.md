# FLEETS-CLOSEOUT-001 — Unblock: branch / commit history repair

- Task: `FLEETS-CLOSEOUT-001-UNBLOCK-HISTORY-REPAIR`
- Owner: `Claude` (reassigned from `Codex` after a 2/2 terminal loop on the Codex lane)
- Reviewer: `Codex2`
- Parent (blocked): `FLEETS-CLOSEOUT-001` — "Callcenter persisted spatial proof"
- Parent PR: **#1072** (`codex/fleets-closeout-001` → `dev`), OPEN + MERGEABLE, `mergeStateStatus=BLOCKED`
- Constraint: **no `git push --force` on shared history** (closeout protocol / `docs/ops/branch-strategy.md`).

## 1. Exact contamination that keeps the parent blocked

PR #1072 has resolved its content merge conflicts, but the required CI check
**`Commit trailers`** (`.github/workflows/ci.yml` job `commit-trailers` →
`scripts/git/check_commit_trailers.py`) fails.

The gate accepts **only** these subject forms (`SUBJECT_RE`):

```
^(?:wip\()?[A-Z][A-Z0-9-]*[A-Z0-9]\)?: \S
```

i.e. `‹TASK-ID›: ‹summary›` (canonical closeout) or `wip(‹TASK-ID›): ‹summary›`
(anchor). Any other prefix — including `merge(...)` and `closeout(...)` — is
rejected.

The parent's own `next` field blamed only the merge commit. That diagnosis is
**incomplete**. Running the real CI validator over the full PR range
(`origin/dev..70451a7a6`) shows **all four** commits fail:

```
$ python3 scripts/git/check_commit_trailers.py --base origin/dev --head 70451a7a6
::error::check_commit_trailers: 4 commit(s) failed trailer validation.
  70451a7a6670  subject: 'merge(FLEETS-CLOSEOUT-001): reconcile closeout board with origin/dev'
  20c258b3375e  subject: 'closeout(FLEETS-CLOSEOUT-001): align closeout reviewer metadata'
  06b98adc01f7  subject: 'closeout(FLEETS-CLOSEOUT-001): finalize approved persisted spatial proof'
  10eb450c08a6  subject: 'closeout(FLEETS-CLOSEOUT-001): add persisted spatial proof evidence'
```

Structure of the branch tip `70451a7a6`:

- It is a **merge commit** with two parents:
  - parent¹ `20c258b33` — the closeout work (`closeout(...)` subject, non-compliant)
  - parent² `a167bf6bc` — **exactly `origin/dev` tip** (merged in to reconcile)
- Its tree `21db5a7383f534e1089ac3ba7e56a215792472e6` is the **reviewer-approved,
  fully-reconciled** result.

**Why an in-place fix is impossible:** every commit subject on the branch is
non-compliant, and the branch is shared history that the closeout protocol
forbids force-pushing. You cannot reword `merge(...)`/`closeout(...)` subjects in
place without a history rewrite + force push. Therefore the branch
`codex/fleets-closeout-001` and PR #1072 are terminally blocked and must be
**succeeded**, not repaired in place.

## 2. Non-destructive repair path (VERIFIED) — clean-successor reparent

Create a **single new commit** that carries the byte-identical reviewed tree
(`21db5a738`), parented directly on `origin/dev`, with a compliant subject +
required trailers. This drops the whole non-compliant chain (3× `closeout(...)`
+ 1× `merge(...)`) out of the PR range in one move, because the successor's
range against dev is just the one compliant commit.

```bash
git fetch origin
# byte-identical reviewed tree, single parent = origin/dev tip, compliant subject
SUCC=$(git commit-tree 70451a7a6^{tree} -p origin/dev \
  -m "FLEETS-CLOSEOUT-001: finalize persisted spatial proof closeout (reconciled onto dev)" \
  -m "LLM-Agent: Codex" \
  -m "Task-ID: FLEETS-CLOSEOUT-001" \
  -m "Reviewer: Codex2")
git branch codex/fleets-closeout-001-reparent "$SUCC"
git push origin codex/fleets-closeout-001-reparent
gh pr create --base dev --head codex/fleets-closeout-001-reparent \
  --title "FLEETS-CLOSEOUT-001: finalize persisted spatial proof closeout (clean successor to #1072)" \
  --body "Clean-successor reparent of #1072. Byte-identical reviewed tree 21db5a738 onto origin/dev; Commit-trailers gate now passes. Closes/supersedes #1072."
# then close PR #1072.
```

### Verification evidence (run in this task's worktree, 2026-07-08)

| Check | Result |
|---|---|
| Successor commit built | `254bf06693a58581fd4521153c4d822671f8e793` (deterministic tree; SHA varies by committer/date) |
| Successor tree == reviewed tree | `21db5a738…` == `21db5a738…` ✅ |
| `git diff 70451a7a6 <succ>` | **empty** (no content change) ✅ |
| `check_commit_trailers.py --base origin/dev --head <succ>` | `1 commit(s) OK` ✅ |

Because the tree is byte-identical to the reviewer-approved tip, the content
merged into `dev` is exactly what was reviewed — the reparent is a
history-cleanup only, not a content change. No shared history is force-pushed;
`codex/fleets-closeout-001` and PR #1072 are left intact and simply superseded.

### History-preserving alternative (not recommended)

Cherry-picking the 3 `closeout(...)` commits onto `origin/dev` with reworded
`FLEETS-CLOSEOUT-001:` subjects would preserve granular history, but the branch
tip `70451a7a6` is a **reconciliation merge** — replaying the pre-merge commits
risks re-hitting the conflicts it resolved and producing a tree that diverges
from the reviewer-approved `21db5a738`. The collapse above is preferred because
it guarantees byte-identity with the approved tree.

## 3. Ownership / role boundary

The clean-successor reparent is a **canonical change to the parent
(FLEETS-CLOSEOUT-001) branch lineage** and merging it to `dev` is an
integration-gate action. Per prior chair triage this reparent is **authorized**
but is an **integrator / decision-gated** step, not an owner-lane dispatch. This
unblock task's job is to identify the contamination and hand the integrator a
verified, copy-paste-ready, non-destructive path — done above.

## 4. Concrete unblocked next step for the parent

1. Integrator runs the §2 recipe: push `codex/fleets-closeout-001-reparent`,
   open a new PR to `dev`, confirm the `Commit trailers` check is green.
2. Merge the successor PR to `dev`; close/supersede PR #1072.
3. FLEETS-CLOSEOUT-001 can then finalize `done` with
   `INTEGRATION_STATUS=merged_to_dev` and the successor `COMMIT_HASH` /
   `PUSH_BRANCH` as evidence.
