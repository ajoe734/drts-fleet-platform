# SR-ENTERPRISE-SEARCH-001 History Audit and Non-Destructive Repair Path

Audit date: 2026-09-08. Owner: Gemini. Reviewer: Codex.
Helper Task: `SR-ENTERPRISE-SEARCH-001-UNBLOCK-HISTORY-REPAIR`.
Parent Task: `SR-ENTERPRISE-SEARCH-001` (`apps/enterprise-dispatch-web/app/bookings/page.tsx`).
Disposition: Non-destructive repair path documented; parent remains blocked on backend filter producer.

---

## 1. Verified History and Inventory

After fetching `origin`, the inspected integration base and ref inventory are:

| Ref / Location | Full Commit SHA | Notes / Status |
| --- | --- | --- |
| `origin/dev` (helper base) | `1cdaaa5b57f006ff2d7cf7d159a2245b7f05a968` | Latest trunk head |
| `gemini/sr-enterprise-search-001` | `2d469d644499d5f45a81cc7328dac5305a458d78` | [PR #1695](https://github.com/ajoe734/drts-fleet-platform/pull/1695) (OPEN, local = remote) |
| `codex2/sr-enterprise-search-001` | `7e82f650020cbc49ff41b77ea9851c85284bd8de` | [PR #1724](https://github.com/ajoe734/drts-fleet-platform/pull/1724) (OPEN, contaminated fork) |
| `codex/sr-enterprise-search-001` | `14ececf2f27d747e8d2e398d772b95b48c6ca78b` | Local ancestor of `2d469d644` |
| `claude/sr-enterprise-search-001` | `0398ea4a768d20278a806e68c00a66a7587c5eea` | Ancestor on dev trunk |
| `gemini2/sr-enterprise-search-001` | `70355aba97c23dd1cd592b71f1d3dfe6315d91ff` | Pre-remediation ancestor on dev trunk |
| `codex2/...-unblock-planning-decision` | `f608d7757ceecf0b7f908b0df64ef5ccc562c62f` | [PR #1760](https://github.com/ajoe734/drts-fleet-platform/pull/1760) (MERGED into dev at `031cfc4c9`) |
| `gemini/...-unblock-manual-unblock` | `dcb28066566cae50720dbb9850240f9486a6ec5d` | [PR #1785](https://github.com/ajoe734/drts-fleet-platform/pull/1785) (OPEN, failed cited-path check) |
| `codex/...-unblock-manual-unblock` | `c340984d16d273c59a3450e9b7b436fdf0d335a8` | [PR #1787](https://github.com/ajoe734/drts-fleet-platform/pull/1787) (OPEN, status `integrating`) |
| `gemini/...-unblock-history-repair` | `1cdaaa5b57f006ff2d7cf7d159a2245b7f05a968` | Current helper branch in isolated worktree |

### Worktree and Local State Audit
- `git worktree list --porcelain` confirms **no active worktree** is checked out on any parent branch (`gemini/sr-enterprise-search-001`, `codex2/sr-enterprise-search-001`, etc.).
- There are no stale git locks, uncommitted working-tree modifications, or stashed changes affecting parent files.
- The canonical root at `/home/lupin/workspace/drts-fleet-platform` remains on `dev` and was not switched.

### Machine Truth State
- `ai-status.sh show SR-ENTERPRISE-SEARCH-001` confirms:
  - `status: blocked`
  - `owner: Gemini`, `reviewer: Codex`
  - `reconstruction.branch_head: ecf6f70e7bf4a3a57735f198f6bfa81762019f3b` (dated 2026-09-06T15:25:00Z; provenance audit marker)
  - `next`: notes that frontend WIP is preserved at `2d469d644`.

---

## 2. Exact History Contamination and Root Causes

A systematic analysis of all branches, commits, and PRs revealed four interacting causes:

### 1. Provenance Pointer Confusion (`reconstruction.branch_head`)
`ai-status.json` records `reconstruction.branch_head: ecf6f70e7bf4a3a57735f198f6bfa81762019f3b`. This SHA was an audit snapshot from September 6, not the current head of work. When secondary workers inspected machine truth, they mistook this provenance anchor for the current working state.

### 2. Severely Contaminated Fork on `codex2/sr-enterprise-search-001` (PR #1724)
- Worker `codex2` branched from commit `70355aba9` (21 commits behind `dev`), attempting to re-implement search from `ecf6f70e7`.
- It created duplicate commits `641af0c6d` and `f20c35e97`, then merged the remote tracking branch into itself (`b42862d4b`), creating a duplicated dual-rail history.
- It split business logic into an unauthorized extra file under `tests/unit/system-remediation/sr-enterprise-search-001/` (`enterprise-search-logic.ts`).
- Crucially, comparing `codex2`'s `7e82f6500` with dev or `2d469d644` (`git diff 2d469d644 7e82f6500`) shows **13,190 line deletions across 38 files**, because its stale base would revert dozens of merged tasks on `dev` (such as `SR-MAIL-001`, `SR-PUBLIC-001`, `SR-READINESS-001`, and multiple unblock docs).
- As a result, PR #1724 shows +3,847 / -45 lines and failed 7/25 CI checks. **PR #1724 is fatally contaminated and must be superseded.**

### 3. Merge Accretion on `gemini/sr-enterprise-search-001` (PR #1695)
- The canonical implementation branch `gemini/sr-enterprise-search-001` correctly accumulated fixes:
  - `ecf6f70e7`: initial implementation
  - `388e16944`: fix i18n-guard violations and test types
  - `ae68691ce`: update base SHA and test evidence
  - `79ebf9ddd`: resolve reviewer rejection on identity, timezone, test logic duplication, and API evidence
  - `14ececf2f`: update base SHA
  - `2d469d644`: record session identity resolver and backend filter blocker
- However, as trunk advanced, four merge commits from `origin/dev` were created (`7da03ca6d`, `5eddaf79b`, `a6e907073`, `4de0ce0e0`).
- Despite these merge commits, `git diff origin/dev...2d469d644` was audited and is **completely clean**:
  - `apps/enterprise-dispatch-web/app/bookings/page.tsx`: +1499, -1
  - task unit tests under `tests/unit/system-remediation/sr-enterprise-search-001/` (`sr-enterprise-search-001.test.ts`): +925, -2
  - parent UAT document under `docs/04-uat/system-remediation-20260906/` (`SR-ENTERPRISE-SEARCH-001.md`): +142, -0
  - Exactly matches the 3 declared `write_scopes` in machine truth.
  - Zero modifications or deletions to unrelated codebase files.
  - Tested via dry-run: `git diff origin/dev...2d469d644 | git apply --check` exits 0 cleanly on current `origin/dev` (`1cdaaa5b5`).

### 4. Underlying Product Capability Blocker
The fundamental barrier keeping the parent blocked is NOT git history, but the architectural gap documented in [the planning decision](SR-ENTERPRISE-SEARCH-001-UNBLOCK-PLANNING-DECISION.md):
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:459` lacks query parameter handling for date range, passenger, and status filtering and pagination.
- `packages/api-client/src/index.ts:1192` provides only zero-argument listing.
- The parent cannot claim acceptance without server-side filtering, and requires backend producer `SR-BOOKING-VERIFY`.

---

## 3. Non-Destructive Repair and Resume Strategy

Per repository branch policy (`docs/ops/branch-strategy.md` §11), published remote branches must **never be force-pushed**.

### Recommended Continuation Path: Clean Linear Replacement Branch
To avoid carrying forward the 4 merge commits and to isolate from `codex2`'s contaminated fork, the parent owner should use a clean replacement branch once `SR-BOOKING-VERIFY` is available:

1. **Preserve Published Refs**: Leave `origin/gemini/sr-enterprise-search-001` (PR #1695) and `origin/codex2/sr-enterprise-search-001` (PR #1724) untouched for audit provenance.
2. **Supervisor Worktree Dispatch**: Supervisor assigns parent owner Gemini to an isolated worktree on a fresh branch `gemini/sr-enterprise-search-001-clean` based on freshly fetched `origin/dev`:
   ```bash
   git fetch origin
   git switch -c gemini/sr-enterprise-search-001-clean origin/dev
   ```
3. **Transfer Verified Net Patch**:
   Apply the audited net patch from `2d469d644`:
   ```bash
   git diff 1cdaaa5b5 2d469d644 -- \
     apps/enterprise-dispatch-web/app/bookings/page.tsx \
     tests/unit/system-remediation/sr-enterprise-search-001 \
     docs/04-uat/system-remediation-20260906/SR-ENTERPRISE-SEARCH-001.md \
     > /tmp/sr-enterprise-search-001-clean.patch
   git apply --check /tmp/sr-enterprise-search-001-clean.patch
   git apply /tmp/sr-enterprise-search-001-clean.patch
   ```
4. **Integrate Authoritative Backend Query API**:
   Consume the backend filter API delivered by `SR-BOOKING-VERIFY`, removing any client-side downgrade assumptions.
5. **Run Verification Commands**:
   - `git diff --check`
   - `node tools/ci/i18n-guard.mjs`
   - `pnpm --filter @drts/enterprise-dispatch-web typecheck`
   - `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/`
6. **Commit with Full Trailers & Push**:
   ```bash
   git commit -m "feat(SR-ENTERPRISE-SEARCH-001): enterprise booking history search and backend filtering" \
     -m "LLM-Agent: Gemini" \
     -m "Task-ID: SR-ENTERPRISE-SEARCH-001" \
     -m "Reviewer: Codex"
   git push -u origin gemini/sr-enterprise-search-001-clean
   ```
7. **Publish Replacement PR & Handoff**:
   Open a replacement PR to `dev` referencing #1695 and #1724, and execute canonical handoff to Codex:
   ```bash
   CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=$(git branch --show-current) \
     AI_NAME=Gemini /home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh \
     handoff SR-ENTERPRISE-SEARCH-001 Codex "Replaced contaminated branch with clean linear candidate on fresh dev base; wired backend filter queries"
   ```

### Alternative In-Place Path (If Preserving PR #1695 is Explicitly Required)
If policy requires reusing PR #1695 directly:
- In the worktree for `gemini/sr-enterprise-search-001`, perform a standard `git merge origin/dev` without force-pushing.
- Implement the backend filter integration, run tests, and normal-push to `origin/gemini/sr-enterprise-search-001`.
- Note: This retains merge ancestry but avoids force-push.

---

## 4. Concrete Next Step for Parent Task

1. **Chairman / Supervisor Action**:
   - Register or identify backend query producer `SR-BOOKING-VERIFY` in `ai-status.json` with owner and reviewer.
   - Authorize shared client/contract scope in `packages/contracts` and `packages/api-client` via `SR-CONTRACT-001` or producer scope.
   - Add `SR-BOOKING-VERIFY` to `depends_on` of `SR-ENTERPRISE-SEARCH-001`.
2. **Resume Gate**:
   - Keep parent `SR-ENTERPRISE-SEARCH-001` in `blocked` status until `SR-BOOKING-VERIFY` merges into `origin/dev`.
3. **Execution Routing**:
   - Once merged, dispatch Gemini to execute the clean continuation path above.

---

## 5. Helper Verification and Delivery Evidence

- `git fetch origin && git rebase origin/dev`: Exit code 0, current base `1cdaaa5b57f006ff2d7cf7d159a2245b7f05a968`.
- Worktree inventory: Checked via `git worktree list --porcelain`; no parent worktrees exist.
- Applied patch dry-run: `git diff origin/dev...2d469d644 | git apply --check` exited 0.
- Diff integrity: Verified that `2d469d644` net changes are strictly confined to the 3 declared `write_scopes`.
- Contamination analysis: Documented PR #1724 stale base and 13,190 deleted lines.
- Static guards:
  - `git diff --check`: Exit code 0.
  - `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`: Exit code 0, 0 findings.
- Deliverable: Only this markdown report is delivered under `support/unblock/SR-ENTERPRISE-SEARCH-001/`. No parent application files were modified by this helper.
