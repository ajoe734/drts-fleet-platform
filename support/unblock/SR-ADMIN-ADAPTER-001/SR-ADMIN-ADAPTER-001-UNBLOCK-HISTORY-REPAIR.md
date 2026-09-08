# SR-ADMIN-ADAPTER-001 history recovery

Audit: 2026-09-08. Owner: Codex. Reviewer: Codex2.
This helper documents and dry-runs recovery; it does not implement or accept the parent product task.

## Verified history

- Fetched integration base: `3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e`.
- Preserved parent local/remote branch: `codex/sr-admin-adapter-001`, head `47dd8e5c55fb54f1cb755a93125b19a3cd17e6da`; [parent PR #1640](https://github.com/ajoe734/drts-fleet-platform/pull/1640) remains open.
- Merge `cd5ef2a9682c8f3f9dcf09c52ea626a75a9e0c42` joins rebased `0132dd371f4d18d60f793dc0c12b168930597b07` with historical `813c794f8e96b7f7a364a23372fe20a81a6f170e`. `git diff --exit-code 0132dd371 cd5ef2a96` exits 0: duplicate ancestry, not evidence of additional product changes.
- The rebased rail is `966b03efd -> 3bf7ecc44 -> 5a8c0f73b -> 0132dd371`, based on `70355aba9`. The old rail includes `cc8073d5b`, `2d42d5c4f`, and merge `7583a7717` with `b93ab98f0`, ending at `813c794f8`.
- `git rev-list --left-right --count origin/dev...origin/codex/sr-admin-adapter-001` returns `19 11`; the previous report's `6 11` is stale.
- Parent diff is six files, 445 insertions and 70 deletions: registry page/helper, three regression/reproduction files, and parent UAT evidence. There are no backend implementation changes in this patch.
- `git worktree list` shows no parent worktree. This worker stays in its assigned isolated helper worktree. Local `codex2/sr-admin-adapter-001` is at `70355aba9`, not the candidate. Other helper refs remain preserved: Gemini `892e9d6f6`, Gemini2 `b5c3774e5`, Claude2 `c4c4a35f8`.
- Machine truth still records historical reconstruction head `813c794f8`; that is provenance, not a requirement to merge old ancestry again.

## Previous delivery and remaining gates

[Old helper PR #1751](https://github.com/ajoe734/drts-fleet-platform/pull/1751), head `892e9d6f60870e0a7b3c8118ce3bcc278bae6bd6`, is open and has not landed. Its [canonical consistency job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34230231231/job/102074220531) failed on five citations to files absent from its tree. This report supersedes that report for the reassigned helper; old refs and PRs are retained for audit. Historical implementation is available in the [fixed parent tree](https://github.com/ajoe734/drts-fleet-platform/tree/47dd8e5c55fb54f1cb755a93125b19a3cd17e6da).

Parent PR checks also report failed typecheck, i18n guards and smoke acceptance. History recovery alone cannot turn these into passing evidence. The local i18n guard explicitly excludes files named `translations.ts` (line 89) and reports `inline-bilingual-map` (line 261). A future local translations module under the existing registry directory is within the parent's current write scope; validate the resulting imports and guard rather than assuming success.

[Planning PR #1671](https://github.com/ajoe734/drts-fleet-platform/pull/1671), head `5ad2caa612ab122e7367f21354e23ad3d650922a`, remains open. It proposes migration/contract scope expansion and a cut of the three missing forms. The canonical command `show SR-ADMIN-ADAPTER-001-UNBLOCK-PLANNING-DECISION` currently returns `Task not found` (exit 1), and parent write scopes do not include the proposed migration/contract files. Therefore this report does not treat that proposal as granted authorization. Supervisor must reconcile planning registration and approved scope before those changes or acceptance cuts are applied.

## Non-destructive owner continuation

1. Preserve the published parent branch and #1640. Supervisor should assign an isolated parent workspace on a fresh `codex/sr-admin-adapter-001-clean` branch from freshly fetched `origin/dev`, or reuse it if it already exists. Do not reset, force-push, or switch the canonical root. No clean branch existed at this audit.
2. Transfer the net task patch, not either merge or both duplicate rails. These commands were dry-run against the audited base (the temporary patch is reproducible, not delivery evidence):

   ```bash
   git diff 70355aba9 47dd8e5c5 -- \
     apps/platform-admin-web/app/adapter-registry \
     tests/unit/system-remediation/sr-admin-adapter-001 \
     docs/04-uat/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md \
     > /tmp/sr-admin-adapter-001-recovery.patch
   git apply --check /tmp/sr-admin-adapter-001-recovery.patch
   # In the assigned clean parent worktree, after inspection:
   git apply /tmp/sr-admin-adapter-001-recovery.patch
   ```

3. Re-check the patch against the latest trunk; retain only still-needed task changes. Move bilingual notice copy into a local translations module and refresh UAT evidence. Historical test results must not be represented as clean-candidate results. Anchor task-owned changes immediately with parent Task-ID and reviewer trailers.
4. Parent owner can resume these in-scope changes now. Full registry authority, persistence and four expiry states still require product implementation and verification; resolve the planning/scope gap above before editing extra shared files. Do not declare parent acceptance from the notice patch alone.
5. Run `git diff --check`, `node tools/ci/i18n-guard.mjs`, both API/admin package typechecks and the parent Vitest directory specified in machine truth. Reproduce outstanding CI failures on the fresh candidate and record results. This helper did not run product tests because it changes only this report.
6. Commit with parent task trailers, perform a normal push of the clean branch, open a replacement PR to `dev` referencing #1640, then hand off using actual `CANDIDATE_SHA` and `CANDIDATE_BRANCH` via the canonical status command. Keep old PRs audit-only until the replacement is recorded; review, CI and acceptance must use the new SHA. Never merge historical ancestry solely to satisfy reconstruction provenance.

## Helper verification and delivery

- `git fetch origin && git rebase origin/dev`: exit 0, branch already current.
- Parent net patch `git apply --check`: exit 0 at the base above; no parent files changed.
- Empty merge-content check: exit 0. Branch graph and six-file diff inspected.
- GitHub PR heads/checks inspected using `gh pr view`; failed old helper job inspected using `gh run view --log-failed`.
- The reassigned helper delivers this single report on `codex/sr-admin-adapter-001-unblock-history-repair`; actual pushed SHA and PR are recorded in canonical handoff, avoiding a self-referential commit hash.
- Parent next-step update uses canonical `ai-status.sh note`; parent remains blocked for the unresolved product/planning gates. Helper review does not mean parent implementation, CI, merge or deployment is complete.
