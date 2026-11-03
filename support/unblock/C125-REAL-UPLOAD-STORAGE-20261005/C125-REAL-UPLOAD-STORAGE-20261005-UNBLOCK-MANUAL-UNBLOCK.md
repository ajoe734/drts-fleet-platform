# C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-MANUAL-UNBLOCK

- Helper task: `C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-MANUAL-UNBLOCK` (`task_class=unblock`, `helper_kind=manual_unblock`)
- Parent task: `C125-REAL-UPLOAD-STORAGE-20261005`
- Owner: `Claude` (cloud session) / Reviewer: `Claude2`
- Base: `origin/dev` = `0e7243c5cb13aad82941d1567ef1813c185c586e` (PR #3052)
- Write scope: this file only. No product code, `ai-status.json`, `.orchestrator/`, or archive file is changed.
- Diagnosis date: 2026-10-26

## 1. Conclusion

The parent should **stay `status=blocked`, `waiting_for=Pi`**. It should not move to `todo` and should not be reassigned.

This round found **no new product or contract blocker**. It did find **newer hosted evidence** that the earlier helpers (HISTORY-REPAIR, PLANNING-DECISION) and the parent `next` (last update `2026-10-25T15:18:53Z`) do not record:

1. Immutable releases that contain both dependencies and `C125-OWNED-ADMIN-RECOVERY-TEARDOWN-20261025` (#3004 `61231322b`) now exist (`release/v2026.10.26.1` – `release/v2026.10.26.3`). The blocker is therefore no longer "wait for any immutable release". It is now "a release containing #3052 must pass hosted acceptance".
2. The latest hosted `deploy-dev.yml` run on `publish/v2026.10.26.3` (run `40310500957`, head `9a0a4a692d38`) failed the job `Candidate SHA operational acceptance`. Of 16 tests, 12 passed and 4 failed. All 4 failures are the C125 Fleet journeys `fleet-submit-read-withdraw-resubmit` and `admin-review-approve-readback` (contract and route variants). Each one failed at the same setup call: `POST /control-plane-proxy/fleet-partner/supply-submissions/drivers` returned **HTTP 403** (`expect(...).toBeLessThan(400)`, `tests/e2e/operational-document-upload.ts:3475`).
3. `C125-EXISTING-FLEET-WRITE-CREDENTIAL-SCOPES-20261026` (PR #3052, merge `0e7243c5cb13aad82941d1567ef1813c185c586e`, authored by Pi with Codex review, committed `2026-10-26T12:25:53Z`) changes only `tests/e2e/operational-document-upload.ts` and `tests/unit/operational-document-upload.test.ts`. The first owned Fleet key now requests explicit `billing:read`, `partner:read` and `partner:write` scopes. Before this change it requested only `billing:read`, which matches the 403 on the supply-write setup. #3052 merged **after** `release/v2026.10.26.3` was cut (`2026-10-26T10:50:18Z`), and no release tag contains it yet.

The concrete next step for the parent:

- Wait for the next `nightly-publish.yml` immutable `publish/v*` / `release/v*` cut from `origin/dev` at or after `0e7243c5c` (#3052).
- Its push-triggered `deploy-dev.yml` must pass `Candidate SHA operational acceptance` on `drts-dev-devcc-20260825` / `us-central1`, including `fleet-submit-read-withdraw-resubmit` and `admin-review-approve-readback`.
- That run must cover the 3 remaining runtime keys: real storage, scan plus readback, and cross-role denial.
- If the Fleet setup still returns 403 on such a release, Pi owns the next harness or credential root cause. The parent stays `blocked/Pi`.

## 2. What was checked (commands and actual results)

All checks were read-only. No workflow was triggered, re-run, or simulated, and no `gcloud` command or cloud credential was used. The `gh` CLI is not available in this cloud session, so the GitHub MCP read tools were used instead.

| #   | Check                                                               | Command / tool                                                                                                       | Result                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `origin/dev` tip                                                    | `git fetch origin`; `git rev-parse origin/dev`                                                                       | `0e7243c5cb13aad82941d1567ef1813c185c586e` (same as the given base), exit 0                                                                                                                                                                                                                                                          |
| 2   | PR #2988 (PLANNING-DECISION) merged                                 | MCP `pull_request_read get 2988` (equivalent of `gh pr view 2988`)                                                   | `merged=true`, `merged_at=2026-10-25T04:53:00Z`, head `c1f449ce7bff08427e2de8b881fd6a6a1169183f`; merge `e70c1d4a0f8e` is an ancestor of `origin/dev`                                                                                                                                                                                |
| 3   | Related PR history                                                  | MCP `search_pull_requests "repo:ajoe734/drts-fleet-platform C125-REAL-UPLOAD-STORAGE-20261005"` (20 results)         | Parent ReviewBus PR #2929 is merged (`2026-10-21T17:01:16Z`, head `a2e263fe7775`). Helper PRs #2925 and #2988 are merged. Stale open PRs from 2026-10-05/06 remain: #2328, #2377, #2380. They predate the HISTORY-REPAIR resolution and are not the current blocker (see §4).                                                        |
| 4   | Recent C125 commits on dev                                          | `git log origin/dev --since=2026-10-24 \| grep -i c125`                                                              | `e7a16fdeb` (#2969), `e70c1d4a0` (#2988), `61231322b` (#3004), `0e7243c5c` (#3052). **#3052 is newer than the parent `next`.**                                                                                                                                                                                                       |
| 5   | Dependency `SR-GCS-MULTIPART-MEDIA-TYPE-20261008` merged            | MCP `pull_request_read get 2448`; `git merge-base --is-ancestor b2dfb0ef812ad11fa431b5b174f173ffd2a8143b origin/dev` | PR #2448 is merged (`2026-10-08T14:18:55Z`). The ancestor check exits 0 after unshallowing (see §5).                                                                                                                                                                                                                                 |
| 6   | Dependency `SR-OPERATIONAL-DOCUMENT-UPLOAD-HARNESS-20261008` merged | MCP `pull_request_read get 2839`; `git merge-base --is-ancestor ae8d42cba48500e3a93a3b790781641d06665645 origin/dev` | PR #2839 is merged (`2026-10-19T13:55:22Z`). The ancestor check exits 0.                                                                                                                                                                                                                                                             |
| 7   | Dependencies in the repo archive file                               | Python scan of `ai-task-archive.json` (`{_meta, tasks}`, 26 entries)                                                 | **Neither dependency ID appears** in the checked-in `ai-task-archive.json`, and `ai-task-archive.jsonl` is not in the repo. The pruned-archive claim cannot be verified from repo contents, because the orchestrator archive lives on the supervisor VM. The PR merges (rows 5–6) are the evidence used instead.                     |
| 8   | Workflows exist and their purpose                                   | `ls .github/workflows/`; read headers of `nightly-publish.yml` and `deploy-dev.yml`                                  | `nightly-publish.yml` (cron `0 3 * * *` plus dispatch) cuts an immutable `publish/v<date>` branch and a `release/v<date>` tag from dev after a green `ci-integ`. That push triggers `deploy-dev.yml`, whose `operational-candidate-acceptance` job is the hosted gate. This matches the blocker description.                         |
| 9   | Which releases contain what                                         | `git for-each-ref refs/tags/release/v2026.10*`; `git merge-base --is-ancestor <sha> <tag>`                           | `release/v2026.10.26.1/.2/.3` contain `b2dfb0ef8`, `ae8d42cba` and `61231322b`, but **none contain `0e7243c5c` (#3052)**.                                                                                                                                                                                                            |
| 10  | Recent hosted Deploy-Dev outcomes                                   | MCP `actions_list list_workflow_runs deploy-dev.yml` (8 latest)                                                      | Runs 609–613 (`publish/v2026.10.25.1` – `v2026.10.26.3`) all ended `failure`. Run 608 (`publish/v2026.10.25.0`) ended `success`.                                                                                                                                                                                                     |
| 11  | Failing jobs in run 613 (`40310500957`, `publish/v2026.10.26.3`)    | MCP `actions_list list_workflow_jobs`                                                                                | Build, migrate, deploy and health jobs succeeded. Two jobs failed: `Candidate SHA operational acceptance` (step `Execute candidate-bound operational journeys`) and `Candidate SHA quote-expiry acceptance`. The quote-expiry job is outside C125.                                                                                   |
| 12  | Operational acceptance log (job `121539506746`)                     | MCP `get_job_logs` (tail 3300 lines), filtered with grep                                                             | 14/14 candidate checks pass. Browser acceptance: **12 passed, 4 failed**. All 4 failures are `fleet-submit-read-withdraw-resubmit` and `admin-review-approve-readback` setup `POST /control-plane-proxy/fleet-partner/supply-submissions/drivers`, `Expected: < 400 Received: 403`. Owned-resource cleanup statuses report `passed`. |
| 13  | What #3052 changes                                                  | `git show 0e7243c5c --stat`; diff grep                                                                               | Two test-harness files only. The first owned Fleet key now requests `["billing:read","partner:read","partner:write"]` instead of `billing:read` alone, and supplied sessions with insufficient scope are rejected.                                                                                                                   |

The parent's own `ai-status.sh show` record (`status=blocked`, `waiting_for=Pi`, owner `Gemini2`, reviewer `Claude2`, `last_update=2026-10-25T15:18:53Z`) was **not** re-read from the cloud session. The orchestrator CLI and its state live on the supervisor VM. That record is taken from the task brief.

## 3. Judgement

- The dependencies are done and merged (rows 5–6). They are no longer listed in active state for the archival reason given by the earlier helpers. That archival could not be confirmed from repo contents (row 7).
- There is no branch or history contamination and no missing product or contract decision. The earlier helpers already concluded this, and nothing in rows 3–4 contradicts it.
- The remaining blocker is still hosted runtime acceptance, which is Pi's (or Operator's) work and not a code change in this helper's scope. It is now narrowed to a concrete, evidenced failure (403 on Fleet supply-write setup) and a fix already on dev (#3052) that has not been released yet.
- `waiting_for=Pi` remains correct. Pi authored #3052 and owns hosted acceptance follow-up.

## 4. Items outside this helper's scope (for Supervisor attention)

- Open PRs #2328, #2377 and #2380 (2026-10-05/06) still show `open` for this parent's lineage. They appear superseded by #2929 and the HISTORY-REPAIR merges. Closing them is a Supervisor or owner decision. This helper did not close or comment on them.
- `Candidate SHA quote-expiry acceptance` also failed in run 613. It is not a C125 journey and is not investigated here.
- Runs 609–612 were not inspected job by job. Only run 613 was. Whether the earlier failures had the same 403 cause is unverified.

## 5. Checks that could not run, or ran with caveats

- The `gh` CLI is unavailable in this cloud session, so the GitHub MCP read-only tools were used instead (same data).
- The first `merge-base --is-ancestor` checks for `b2dfb0ef8` and `ae8d42cba` returned "not ancestor" because the clone was shallow (50 commits). After `git fetch --unshallow origin dev` both checks exit 0. Only the unshallowed result is reported as evidence.
- `ai-status.sh` was not run, because the orchestrator CLI is not available in this session.
- No vitest or eslint run, because this change contains no code.
- `pnpm install --frozen-lockfile` failed with exit 1 (`ERR_PNPM_UNSUPPORTED_ENGINE`): `jsdom@30.1.1` requires Node `^22.22.2`, and this session has `v22.22.0`. As a result, `pnpm exec prettier` could not run. The lockfile-pinned `prettier@3.8.2` was installed into an isolated scratch directory instead and run against this file with the repo `.prettierrc.json`. `--check` exits 0 (after one `--write` that only re-aligned table padding).

## 6. Supervisor command block (run before merging this helper PR)

Without these metadata fields, `transition_after_merge` would reset the parent to `status="todo"`, clear `waiting_for`, and replace `next` with a short default (see HISTORY-REPAIR / PLANNING-DECISION §3.2). Run the following on the supervisor VM as `AI_NAME=Supervisor`. **This helper did not execute it.**

```bash
CLI="/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/<current-orchestrator-release>/tools/development-orchestrator/bin/ai-status.sh"
PARENT_NEXT="$(python3 -c 'import json,subprocess,sys; s=json.loads(subprocess.check_output(["'"$CLI"'","show","C125-REAL-UPLOAD-STORAGE-20261005"],text=True))["next"]; add="\n\n2026-10-26 C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-MANUAL-UNBLOCK: deps #2448(b2dfb0ef8)/#2839(ae8d42cba) merged on dev; hosted deploy-dev run 40310500957 on release/v2026.10.26.3 failed only C125 fleet-submit/admin-review setup POST /control-plane-proxy/fleet-partner/supply-submissions/drivers HTTP 403; fix C125-EXISTING-FLEET-WRITE-CREDENTIAL-SCOPES-20261026 (#3052, 0e7243c5c) merged after that cut and is in no release yet. Keep blocked/waiting_for=Pi until a nightly-publish release >= 0e7243c5c passes deploy-dev operational-candidate-acceptance for the 3 runtime keys."; out=s+add; assert len(out)<=4000, len(out); print(out)')"
TASK_METADATA_JSON="$(python3 -c 'import json,sys; print(json.dumps({"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Pi","resolved_parent_next":sys.argv[1]},ensure_ascii=False))' "$PARENT_NEXT")" \
  AI_NAME=Supervisor "$CLI" assign C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-MANUAL-UNBLOCK Claude Claude2 \
  "Persist blocked/Pi parent resolution metadata on C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-MANUAL-UNBLOCK before merge"
AI_NAME=Supervisor "$CLI" note C125-REAL-UPLOAD-STORAGE-20261005 "$PARENT_NEXT"
```

If the `assert` fails because the existing parent `next` plus the addendum exceeds 4000 characters, shorten the earlier history in `PARENT_NEXT` by hand. Keep `blocked`/`Pi` either way.

## 7. Helper acceptance mapping

| Helper acceptance                                                          | Where satisfied                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Diagnose why the dependency-ready parent remains blocked                   | §1, §2 rows 9–13, §3                                                        |
| Make only the task-scoped change needed to unblock or document the blocker | Only this file is changed                                                   |
| Produce task-scoped commit/push/PR evidence for any canonical change       | Commit on `claude/c125-real-upload-storage-20261005-unblock-manual-unblock` |
| Update the parent task with the concrete unblocked next step               | §1 next step; §6 Supervisor `assign` metadata plus `note`                   |
