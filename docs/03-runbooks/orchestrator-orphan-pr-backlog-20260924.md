# Runbook — Orphan PR backlog cleanup (2026-09-24)

**Status:** actioned · **Owner:** Claude · **Reviewer:** Codex · **Task:** `ORCH-ORPHAN-PR-LAND-20260924`

## Why this exists

Five open PRs had no task on `ai-status.json` claiming ownership, so no agent
was ever dispatched to move them forward. The oldest had been stalled since
2026-09-09. This runbook records the disposition of each, with retrievable
evidence, so the backlog can be closed out without a vague "cleaned up" claim.

## Disposition summary

| PR    | Original Task-ID                | Disposition | Evidence |
| ----- | -------------------------------- | ------------ | -------- |
| #1860 | `SUPERVISOR-PROVIDER-PAUSE-SAFETY` | **Merged as-is** (squash) | `e22d512f8166d31ffd857997c255932ba1be48ed` on `dev` |
| #2017 | `PLANNING-PHASE1-CODEX`          | **Merged as-is** (squash) | `aba796ccd897c3e44bd00c1e565ef5e5e8da41f0` on `dev` |
| #2056 | `PLANNING-PHASE1-20260913`       | **Closed — already superseded** | content byte-identical to file landed by #2017's merge |
| #2055 | `INFRA-DEV-GCP-PROVISION-20260908` | **Closed — re-landed with corrected trailers** | re-committed under `ORCH-ORPHAN-PR-LAND-20260924`, see candidate SHA below |
| #2059 | `SUPERVISOR-WORKER-PROMPT`       | **Closed — re-landed with corrected trailers** | re-committed under `ORCH-ORPHAN-PR-LAND-20260924`, see candidate SHA below |

## Per-PR detail

### #1860 — provider-pause shared-quota safety

- State before: `MERGEABLE` / `CLEAN`, all required checks `SUCCESS` (candidate,
  Change scope, changes, Commit trailers, Spec source archive, Canonical
  consistency, BFF-only imports, Verify Internal Key Exceptions, No real
  financial-institution identifiers, Runtime mirror guard, orchestrator-tests,
  Smoke acceptance, e2e, ci-integ). Read the `candidate`/`ci-integ` job logs
  (run `34313528581`, job `102345235155`): `All checks required for scope
  'tool-only' passed.`
- Commit already carried correct trailers (`Task-ID: SUPERVISOR-PROVIDER-PAUSE-SAFETY`,
  `LLM-Agent: codex`, `Reviewer: Codex2`). No rebuild needed.
- Action: `gh pr merge 1860 --squash`, preserving the original subject/body and
  trailers. No force push; PR head `613a8d6f8ca8e88bb58ffe7e312e21261509d403`
  was untouched, GitHub performed the squash.
- Result: merged into `dev` at `e22d512f8166d31ffd857997c255932ba1be48ed`
  (2026-09-24T07:20:50Z).

### #2017 — Phase 1 review-round-1 planning entries

- State before: `MERGEABLE` / `CLEAN` but marked draft; all required checks
  `SUCCESS`. Marking it ready for review (`gh pr ready 2017`) re-triggered CI
  per `pull_request: types: [ready_for_review]`; the fresh run (`35969148753`)
  was watched to completion (`gh pr checks --watch`) and every required check
  passed, including `Smoke acceptance` and `ci-integ` (`All checks required
  for scope 'non-product' passed.`).
- All 9 commits carried correct trailers (`Task-ID: PLANNING-PHASE1-CODEX`,
  `LLM-Agent: Codex`, `Reviewer: Claude`/`Gemini` across rounds). No rebuild
  needed.
- Action: `gh pr merge 2017 --squash`.
- Result: merged into `dev` at `aba796ccd897c3e44bd00c1e565ef5e5e8da41f0`
  (2026-09-24T07:22:17Z). This merge happened to include
  `docs/02-architecture/consensus/phase1/product-remediation-sa-sd-20260913.md`
  (see #2056 below).

### #2056 — product-remediation SA/SD discussion record

- The PR's only file, `docs/02-architecture/consensus/phase1/product-remediation-sa-sd-20260913.md`,
  turned out to be **byte-identical** (50953 bytes, verified by direct
  comparison against the file now present on `dev` after the #2017 merge) to
  the copy `#2017` already carried and just merged.
- Disposition: **close, no action needed** — the content is already on `dev`
  via `aba796ccd897c3e44bd00c1e565ef5e5e8da41f0`. Rebuilding trailers for this
  PR would create a duplicate file conflict for no benefit.
- Original branch `claude/docs-phase1-planning-20260913` is left untouched
  (not force-pushed, not deleted by this task).

### #2055 — dev GCP project provisioning script

- File: `infra/gcp/dev/provision-dev-project.sh` (additive only; does not
  exist on `dev`). `mergeStateStatus: BLOCKED` solely because the commit
  (`cdad43e4d0dd87757e6d14566ab48570b8c2e146`) is missing the `Task-ID:`,
  `LLM-Agent:`, `Reviewer:` trailers (only carried `Co-Authored-By:`).
  `Commit trailers` check: `FAILURE`; every other required check: `SUCCESS`.
- Fix: rebuilt as a **new** commit on this task's branch
  (`claude/orch-orphan-pr-land-20260924`), not by amending or force-pushing
  `claude/infra-dev-gcp-provision-20260908` (left untouched, still open at its
  original SHA until this task's candidate merges).
- Content verification: file pulled via `git show
  origin/claude/infra-dev-gcp-provision-20260908:infra/gcp/dev/provision-dev-project.sh`;
  SHA-1 of the working copy (`ed84e2da294e659f404664f0023513d39a22495e`)
  matches the blob recorded by `git ls-tree` on the source branch, including
  the executable bit (`100755`).
- New commit trailers: `Task-ID: ORCH-ORPHAN-PR-LAND-20260924`,
  `LLM-Agent: claude`, `Reviewer: Codex`.

### #2059 — supervisor worker-prompt VM runtime restriction

- Files: `tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py`,
  `tools/development-orchestrator/test_supervisor.py`. `mergeStateStatus:
  DIRTY` / `mergeable: CONFLICTING` in addition to `Commit trailers: FAILURE`
  (both original commits carry no trailers — cherry-picked from
  `6b099ecebf67...` / `ee378fd88a4b...` with only a "(cherry picked from
  commit ...)" body).
- Investigated the conflict: `attach_workspace_metadata()` was restructured by
  `SR-ORCH-REVIEW-WORKTREE-ISOLATION-20260923` (#2114) to add reviewer-workspace
  notice branches ahead of the branches #2059 touches. The git 3-way merge
  fails on line-context drift, **not** semantic conflict — grepped current
  `dev` for `VM restriction` / `playwright` / `docker compose`: no matches, so
  the change is not superseded and is still worth keeping.
- Fix: manually re-applied the same two-line-of-intent change (add
  `vm_restriction_notice` and append it to the owner/task-branch notice and
  the coordination notice) against the current function, plus the matching
  test assertions in `test_supervisor.py`, as a **new** commit on this task's
  branch. `claude/orch-worker-prompt-lineage-20260908` is left untouched.
- Verification: `python3 -m unittest test_supervisor -q` — 165 tests, `OK`,
  including `ExecutionWorkspaceTests.test_creates_isolated_worktree_for_coordination_worker`
  which asserts the new notice text.
- New commit trailers: `Task-ID: ORCH-ORPHAN-PR-LAND-20260924`,
  `LLM-Agent: claude`, `Reviewer: Codex`.

## Candidate evidence for the re-landed content (#2055, #2059)

- `CANDIDATE_BRANCH`: `claude/orch-orphan-pr-land-20260924`
- `CANDIDATE_SHA`: recorded at handoff time via `ai-status.sh handoff`
  (see `ai-status.json` / `ai-activity-log.jsonl` for the exact value; not
  duplicated here to avoid a stale copy diverging from machine truth).
- Local verification before handoff: `python3 -m unittest test_supervisor -q`
  passed (165/165) on the merged worktree state (`dev` fast-forwarded to
  `aba796ccd897c3e44bd00c1e565ef5e5e8da41f0` plus the two re-landed commits).
- Hosted CI: pending at handoff time; the reviewer and the GitHub bus record
  the same-SHA result once it completes. Not force-pushed; not merged by the
  owner.

## What was explicitly not done

- No original published branch (`codex/provider-pause-safe-clear-20260909-v4`,
  `codex/planning-phase1-codex`, `claude/docs-phase1-planning-20260913`,
  `claude/infra-dev-gcp-provision-20260908`, `claude/orch-worker-prompt-lineage-20260908`)
  was force-pushed, rebased, or amended.
- #2055 and #2059's original PRs are closed with a comment pointing at this
  runbook and the replacement candidate rather than merged directly, since
  their commits could not pass `Commit trailers` without a history rewrite of
  an already-published branch.
- Approval/merge of the re-landed content is not self-certified: it goes
  through the same `handoff` → `approve` → CI → merge → acceptance sequence
  as any other task, with `Codex` as independent reviewer.
