# S1F-REL-FIN-PRE-001 — candidate lock and preflight evidence

- **Task ID:** `S1F-REL-FIN-PRE-001`
- **Task Title:** Lock and preflight one deployable Stage 1 candidate
- **Owner:** `Claude2` (reassigned from `Gemini` after a 2/2 terminal worker-timeout streak)
- **Reviewer:** `Codex`
- **Planning Ref:** [`docs/02-architecture/s1f-release-finalization-gap-20260821.md`](../02-architecture/s1f-release-finalization-gap-20260821.md)
- **System Design Ref:** [`docs/02-architecture/s1f-release-finalization-system-design-20260821.md`](../02-architecture/s1f-release-finalization-system-design-20260821.md)
- **Execution Ref:** [`docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md`](../03-runbooks/s1f-release-finalization-execution-tasks-20260821.md)
- **Machine-readable lock:** [`s1f-rel-fin-pre-001-candidate-lock.json`](s1f-rel-fin-pre-001-candidate-lock.json)
- **Date:** `2026-08-21`
- **Status:** `locked` — **this task does not deploy anything.**

---

## 1. Locked candidate

| Field | Value |
| --- | --- |
| Candidate SHA | `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` |
| Source | Merge commit of PR [#1451](https://github.com/ajoe734/drts-fleet-platform/pull/1451) (`S1F-REL-001`) into `dev` |
| PR head SHA | `4b4c61d9b4794d50d45fb1119788aa574f307f90` (confirmed via `gh api repos/.../pulls/1451`) |
| Merged at | `2026-08-17T05:24:06Z` by `ajoe734` |
| Reachable from `origin/dev` | Yes (`origin/dev` HEAD at lock time: `fb69a857bb8b6b7de75a2a988db460296bcfa508`) |
| Dirty-worktree risk | None — this is a GitHub-recorded merge commit on the protected `dev` branch, not derived from any local/agent working tree. Local worktree used for this preflight is clean (`git status --porcelain` empty). |

This is the exact SHA the GAP doc identifies: *"S1F-REL-001 merged through PR #1451 as `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` and its PR CI passed."* The task's own `next` field previously carried a different, now-superseded SHA (`4b4c61d9...` is the PR head; `527a3d40...` from the earlier evidence pack is neither the head nor the merge SHA — see §3).

### Why the merge SHA differs from the PR head

GitHub squash/rebase-merged PR #1451, producing `4012b10c` with a single parent (`f7c67778bab2c46d4c00f0ac7b891b9f75257685`, `dev`'s tip before the merge) rather than a two-parent merge commit. A tree diff between the PR head (`4b4c61d9`) and the merge commit (`4012b10c`) shows **zero difference** under `apps/`, `docs/`, `operations/`, `tests/`, or `.github/workflows/deploy-dev.yml` — the only 61 changed files are under `tools/development-orchestrator/`, which is unrelated dev-branch tooling that moved on while the PR was open. The merge commit is a faithful, content-equivalent landing of the reviewed PR for every Stage 1 product path.

---

## 2. Required CI

| CI target | SHA | Run | Result |
| --- | --- | --- | --- |
| PR branch CI | `4b4c61d9...` | [31997270480](https://github.com/ajoe734/drts-fleet-platform/actions/runs/31997270480) | 22 checks pass, 1 skipped (`orchestrator-tests`, path-filtered on the branch) |
| `dev` trunk CI (post-merge) | `4012b10c...` | [31997773400](https://github.com/ajoe734/drts-fleet-platform/actions/runs/31997773400) | **14/14 check-runs success**, incl. `ci-integ`, `e2e`, `cross-surface-e2e`, `i18n-guard`, `ui-route-e2e`, `lint`, `iam-negative-matrix`, `integration`, `orchestrator-tests`, `unit`, `typecheck`, `build`, `changes`, `candidate` |

Both verified directly via `gh api repos/ajoe734/drts-fleet-platform/commits/<sha>/check-runs` (not re-derived from the earlier evidence pack).

**Context, not required for this lock:** `publish/v2026.08.21.0` (tip `ca2b5a6d`, cut today at 10:40+08:00) already contains the candidate as an ancestor, and its own CI suite (`ci-integ`, `e2e`, `unit`, etc.) is all green. Its `Build & push images` job failed only on the external GCP billing gate (run `32444483620`, tracked separately under `S1F-REL-FIN-GCP-001`) — not a code or CI defect.

---

## 3. Reviewed Stage 1 dependency ancestry

`git merge-base --is-ancestor` is blocked outright by this environment's tool policy (every invocation, regardless of arguments, is refused). Ancestry was instead verified by testing SHA membership in `git rev-list <ref>`, which is an equivalent proof of ancestry.

- **Candidate is reachable from `origin/dev`:** confirmed.
- **Primary reviewed dependency (PR #1451 / `S1F-REL-001`):** the candidate *is* this PR's merge commit, so it trivially satisfies "reachable from the reviewed dependency" — and, as shown in §1, the merge commit is tree-equivalent to the reviewed PR head for every Stage 1 path.

### A discrepancy found in the pre-existing dependency ledger

`docs/04-uat/s1f-rel-001-release-candidate-evidence.md` §2 lists 15 upstream task SHAs as ancestors of a candidate SHA `527a3d403464806ea1d4f417c60ac3e4fa8f17d6`. Independently re-checking this table surfaced two separate problems:

1. **Head-SHA vs merge-SHA confusion.** `527a3d40...` itself is neither PR #1451's head (`4b4c61d9`) nor its merge commit (`4012b10c`) — it is a stale, superseded snapshot of the PR branch, unreachable from `origin/dev`. The same pattern repeats for the dependency rows: of the 15 listed SHAs, only `f9c720fa49df888ea4761f167d16c96b64a9481f` (`S1F-REL-001-PREDEPLOY`) is present in `origin/dev` history; the other 14 do not exist as objects on `origin` at all (`git fetch origin <sha>` → `not our ref`). Spot-checking PR #1331 (`S1F-DRV-001`) confirms the mechanism: the ledger recorded the PR's *head* SHA (`048a5d32...`, discarded by squash-merge), while GitHub's actual `merge_commit_sha` for that PR (`6a43f1a9afef7a41b38c24187727801c27fb2bdb`) **is** present in `origin/dev`.
2. **PR numbers that do not correspond to merged work.** Resolving the ledger's cited PR numbers through the GitHub API shows `#1330, #1332, #1333, #1334, #1336, #1357, #1370, #1386` — 8 of the 15 rows — as `state: CLOSED, merged: false` (and `#1330`/`#1332` are not even based on `dev`). These PR numbers do not describe merged Stage 1 work in this repository as the ledger claims.

**This lock does not rely on that 14-item historical ledger.** Full reconciliation of upstream task provenance is explicitly `S1F-REL-FIN-AUD-001`'s scope (owner `Codex2`), per `docs/02-architecture/s1f-release-finalization-system-design-20260821.md`'s "Evidence lane" — this preflight task only needed, and only claims, ancestry of the one directly reviewed dependency that produced the locked SHA (PR #1451).

---

## 4. Workflow syntax and manifests

| Artifact | Check | Result |
| --- | --- | --- |
| `.github/workflows/deploy-dev.yml` | `python3 yaml.safe_load` at the candidate SHA and at `origin/dev` HEAD | Valid at both; byte-identical between the two |
| `tests/e2e/fixtures/candidate-journey-manifest.json` | `json.load` at the candidate SHA | Valid; expected schema (`schemaVersion`, `taskId`, `candidateSha`, `responseHeader`, `activeSurfaces`, `retiredSurfaces`); byte-identical to `origin/dev` HEAD |
| `operations/verification/run-operational-browser-acceptance.sh` | `bash -n` at the candidate SHA | Valid syntax; byte-identical to `origin/dev` HEAD |
| `operations/deployment/deploy-cloud-run-service.sh` | `bash -n` at the candidate SHA | Valid syntax; byte-identical to `origin/dev` HEAD |

`deploy-dev.yml` also requires manual `workflow_dispatch` to use `publish/v*`, `release/v*`, or a full 40-hex commit SHA as `source_ref` — never a mutable branch. The locked candidate SHA is a valid `source_ref` under that rule.

## 5. Local hermetic gates

Ran from the current worktree (`origin/dev` tip `fb69a857b`, confirmed byte-identical to the candidate for every path touched):

```text
npx vitest run tests/unit/operational-browser-manifest.test.ts tests/unit/dev-active-surface-contract.test.ts
 Test Files  2 passed (2)
      Tests  6 passed (6)
```

The full 22-scenario hermetic E2E suite and 39-route deterministic suite were not re-executed locally — they are already independently green in GitHub Actions for this exact candidate SHA (trunk CI run `31997773400`) and for the downstream publish snapshot, so a local re-run would only duplicate already-captured CI evidence.

## 6. Deploy source_ref recommendation (informational — `S1F-REL-FIN-DEP-001` decides)

- **Recommended:** `source_ref=4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` — deploys exactly the reviewed Stage 1 candidate with no additional dev-branch drift.
- **Available alternative:** `publish/v2026.08.21.0` (`ca2b5a6d`) — the standard nightly-snapshot flow per `docs/ops/branch-strategy.md` v4 §5, already contains the candidate as an ancestor and already has green `ci-integ`. It also carries ~90 files of subsequent, non-Stage-1 work (Stage 1.5 IAM hardening, idempotency, owned-mobility) merged to `dev` between 2026-08-17 and 2026-08-21, which would be bundled into the same deploy and same operational-acceptance run.
- Either ref is blocked today by the same external gate: GCP billing on project `952590575714` (tracked under `S1F-REL-FIN-GCP-001`, not this task).

## 7. Conclusion

One immutable, GitHub-verified SHA — `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` — is locked as the deployable Stage 1 candidate. It is reachable from `origin/dev`, is content-equivalent to its one directly reviewed dependency (PR #1451 / `S1F-REL-001`), is green across both PR and post-merge trunk CI, has valid and unchanged deploy workflow syntax and manifests, passes the local hermetic gates exercised here, and does not originate from a dirty worktree. No deploy was triggered by this task. `S1F-REL-FIN-DEP-001` may proceed once `S1F-REL-FIN-GCP-001`'s external billing gate is open.
