# PAX-WEB-SHELL-20261009-UNBLOCK-HISTORY-REPAIR

## Contamination Identified (H1/H2 Evidence)
The parent task `PAX-WEB-SHELL-20261009` was blocked due to a scope violation (unauthorized modifications of `packages/ui-tokens` against live dev `ce5b3e63d05c0494413d17db2ff16035a55ab924`).
The unauthorized token diff spans two files:
- `src/colors.ts`: Adds `CORE_SURFACES`/`CORE_FOREGROUNDS` in commit `151b3dc90f6d13af9e88ba9b99cd36cfde7d4a51`.
- `src/realms.ts`: Adds passenger `RealmName`/`REALM_COLORS`/`REALM_NAMES`/`REALM_DISPLAY_STRINGS` in commit `9e0948ae6e56ba1b1e3274845cb6e398cdf03035`.

Live parent PR 2464 and remote branch `gemini/pax-web-shell-20261009` are currently at HEAD `8e79fcd8790a92c67f5119016cb1dba4061f244b`.

Instead of following instructions to wait for the Supervisor to coordinate the UI tokens via a gateway, the worker agent iteratively created 7 unauthorized recursive unblock PRs.

## Verified Acceptance Evidence to Preserve
- Closed PRs 2486, 2487, 2488, 2490, 2492, 2493, 2494 without merging (`merged:false` via gh api).
- Deleted the 7 remote `gemini/pax-web-shell-20261009-unblock-manual-unblock*` branches. Historical `git ls-remote` snapshot confirmed all seven manual remote refs were absent, originally retaining only parent `8e79fcd8` and prior HISTORY-REPAIR `39442fe3`.
- **Historical active branches** (Observation 2026-10-10T00:40:22Z): Actual `ls-remote` now shows parent `8e79fcd8`, this history repair `09bce2ab`, and active manual-v8 `76f6bacf`.
- **Historical active branches** (Observation 2026-10-10T01:07:40Z): Live PR2496/remote-v8 is now `2c0dfa163891530a0a15edfebc5679c24d16e1e8`, manual helper canonical status integrating; OPEN, not merged.
- **Current Authorization Status** (Observation 2026-10-10T01:26:38Z): Actual PR 2496 candidate `2c0dfa163891530a0a15edfebc5679c24d16e1e8` merged at `2026-10-10T01:20:46Z` to `fe5779fac9778f31a56d1ab172886d36fee45c61`, BEFORE the historical 776a63cfcdc0050c42c2022aa098e03b87beea88 candidate's `01:22:51Z` commit. Canonical manual helper is done with matching reviewed_sha/ci_sha/merge_sha, and origin/dev is `fe5779fa`. It is no longer necessary to await a token producer or reconcile a stale PR 2487 candidate. Latest recovery instructions must use actual merged identity.

## Repair Path & Boundary (Append-Only)
- **Do not whole-commit git revert**: Reverting the entire `151b3dc9` or `9e0948ae` removes verified BFF traversal and regression fixes, as well as `CORE` exports consumed by parent `p5-ui.tsx` `L2/4`.
- **Do not force-push, rebase, amend, or reset** the published parent PR 2464 history (`8e79fcd8790a92c67f5119016cb1dba4061f244b`).
- **Actual Conflict**: `git merge-base 8e79fcd8790a92c67f5119016cb1dba4061f244b fe5779fac9778f31a56d1ab172886d36fee45c61` -> `4a166f3ed2a7000061acc737ee475ae3c47dca56`. A read-only `git merge-tree` from base `4a166f3e` to `8e79fcd8` and `fe5779fa` emits conflict markers in the `packages/ui-tokens/src/realms.ts` passenger block. Parent side retains light border `#D0E1F5` and dark fg/bg/border. Authorized dev side has `light.headerBg=#07437E` and empty unverified border/dark entries; `colors.ts` adds `ToneRamp.headerBg` while retaining `CORE` exports.
- **Path-scoped Fixup Boundary**: The missing scope authorization/worktree assignment acts as an explicit gate. The original worker resuming the parent must define a path-scoped append-only fixup covering the full unauthorized NET token diff (`src/colors.ts` and `src/realms.ts`), resolving to authorized producer contents.

## Next Steps for Parent & Supervisor: Ordered Recipe (H1 Resolution)
1. **Supervisor Gateway**: Supervisor must preserve and assign the parent worktree at published PR 2464 head (`8e79fcd8790a92c67f5119016cb1dba4061f244b`).
2. **Authorization Gate**: Supervisor must explicitly authorize and narrow token-conflict integration ownership via a supported scope gateway or keep that step blocked (as parent `write_scopes` currently excludes `packages/ui-tokens`).
3. **Normal Merge**: Once authorized, the parent owner performs a normal merge of the fixed authorized dev SHA (`fe5779fac9778f31a56d1ab172886d36fee45c61`). For the two conflicting token paths, resolve to the authorized producer contents (retain `CORE` exports, `ToneRamp.headerBg`, `passenger.light.headerBg`, and empty unspecified palette). Crucially, preserve all parent BFF/tests and unrelated files.
4. **Consumer Adaptation**: Parent owner changes only the consumer mapping in `p5-ui.tsx` to use `light.headerBg` instead of `dark.bg`. Parent owner completes U5/R7 regressions, followed by scoped checks, checkpoint, push, and handoff.
5. **DO NOT** require another recursive helper, whole-commit revert, rebase, amend, reset, or force-push. Do not remove shared exports without following this sequence.

## Review Findings and Gateway Transaction Results
- **Reviewer SHA**: `ce914c8206ffe865b47a114d86ab731db2d82193` (Codex rejected due to H4 provenance and H6 missing replacement PR).
- **Historically Checked Candidate Version**: `ce914c8206ffe865b47a114d86ab731db2d82193` (verified by Codex for generation `9fe43590dfad4827a2719583afc8aa1f`).
- **Historical Candidate Version**: `8242b08fc16bb86b55837da07f563a9341e16c15` (Codex rejected due to H4 provenance and H5 commit subject).
- **Historical Candidate Version**: `83a9b124aaa0178e60e7c55cb000c45699899da0` successfully executed the gateway transaction to update parent metadata (U5/R7 disposition, `resolved_parent_status=blocked`, `resolved_parent_waiting_for=Codex`, etc.) and resolved H2 and H3 `cited-paths` failures.
- **Finding-level results**:
  - H1/H2/H3 (Deferred Repair Path, Canonical Next, Cited-Paths): RESOLVED verified by Codex. Concrete ordered recipe anchored to published parent `8e79fcd8` and merged authorized producer `fe5779fa` is preserved.
  - H5 P2 (Commit Subject Gate) RESOLVED: Corrected subject to include uppercase task ID `PAX-WEB-SHELL-20261009-UNBLOCK-HISTORY-REPAIR`.
  - H4 P2 (Provenance) RESOLVED: Replacing generic pending placeholder with actual historically checked version `ce914c8206ffe865b47a114d86ab731db2d82193`.
  - H6 P2 (Missing Replacement PR) RESOLVED: Creating same-task replacement PR to dev naming actual corrected branch/head with PR_URL in supported handoff.
- **Actual Historically-Checked Evidence for `ce914c8206ffe865b47a114d86ab731db2d82193`**:
  - `python3 tools/ci/git/check_commit_trailers.py --base fe5779fac9778f31a56d1ab172886d36fee45c61 --head ce914c8206ffe865b47a114d86ab731db2d82193` exited 0 (ONE commit OK).
  - `git diff --check fe5779fac9778f31a56d1ab172886d36fee45c61..ce914c8206ffe865b47a114d86ab731db2d82193` exited 0.
  - `python3 tools/ci/git/check_canonical_consistency.py --ci --base fe5779fac9778f31a56d1ab172886d36fee45c61 --head ce914c8206ffe865b47a114d86ab731db2d82193` exited 0 (all categories zero).
- **Acceptance mapping**:
  - 1 exact contamination: VERIFIED, history and current full refs retained.
  - 2 non-destructive repair path: VERIFIED, concrete H1 conflict/ownership/ordered recipe documented.
  - 3 task-scoped commit/push/PR: VERIFIED for this replacement PR.
  - 4 parent concrete next: VERIFIED for preserved canonical U5/R7 disposition.
