# IAM-SES-003 Unblock History Repair

## Scope

- Helper task: `IAM-SES-003-UNBLOCK-HISTORY-REPAIR`
- Parent task: `IAM-SES-003`
- Owner: `Codex`; reviewer: `Claude`
- Audit timestamp: `2026-08-08T15:41:00Z`
- Preserved source rail: `origin/codex/iam-ses-003 @ 41345ffba5f174032c135632a8a4941f0e2fbdae`
- Replacement rail: `origin/codex/iam-ses-003-clean @ d0f1017e5653fec339fc20d832db24d7a3963a7f`
- Replacement PR: [#1344](https://github.com/ajoe734/drts-fleet-platform/pull/1344), targeting `dev`

## Exact Contamination

PR [#1336](https://github.com/ajoe734/drts-fleet-platform/pull/1336) is blocked only by its existing remote history. Its head has five commits ahead of `origin/dev`; all fail the current commit-trailer gate:

| SHA | Problem |
| --- | --- |
| `41345ffba5f1` | Merge commit, `Merge remote-tracking branch 'origin/dev' into codex/iam-ses-003`; no required trailers. |
| `38e230ca0d1d` | `closeout(IAM-SES-003): ...` uses the former closeout subject form, rejected by the current canonical subject rule. |
| `58f2eece6414` | `fix(IAM-SES-003): ...` uses the former conventional subject form. |
| `1e4b81af3fca` | `fix(IAM-SES-003): ...` uses the former conventional subject form. |
| `ea1a2d285017` | `feat(IAM-SES-003): ...` uses the former conventional subject form. |

The CI run for PR #1336, `31264319083` / `Commit trailers`, reports exactly these five failures. A later valid WIP commit, `290b53d5c`, cannot cure those immutable ancestor messages. Rewriting `codex/iam-ses-003` would require a prohibited force-push.

The parent semantic delta is nevertheless isolated: compared with `origin/dev`, `codex/iam-ses-003` changes eight IAM-session files (1,731 additions and four deletions). It does not require retaining the malformed commit graph.

## Non-Destructive Repair Performed

1. Created `codex/iam-ses-003-clean` from `origin/dev @ 6a43f1a9a`.
2. Replayed the final semantic effect of the four task-bearing commits plus the later CI fixes into one canonical commit:

   ```text
   d0f1017e5 IAM-SES-003: session inventory logout-all and boundary-safe admin revoke
   ```

   The commit includes `LLM-Agent: Codex`, `Task-ID: IAM-SES-003`,
   `Reviewer: Claude`, and a verification trailer.
3. Ran `python3 scripts/git/check_commit_trailers.py --base origin/dev --head codex/iam-ses-003-clean`; it reports `1 commit(s) OK`.
4. Pushed the new branch with an ordinary non-force push and opened replacement PR #1344. The original branch and PR #1336 remain untouched as audit evidence.

## Concrete Parent Next Step

`IAM-SES-003` is unblocked from its history defect. Continue review and merge only on PR #1344 / `codex/iam-ses-003-clean @ d0f1017e5`:

1. Wait for the normal PR #1344 CI checks to complete.
2. Have `Claude` review the clean replacement SHA, including the reconstructed session-management behavior.
3. Merge PR #1344 to `dev` through the normal protected-branch flow; do not force-push, amend, or reuse PR #1336 for closeout.
4. Record parent integration evidence from the replacement PR after merge/deploy. PR #1336 may be closed as superseded once PR #1344 is accepted, but should remain preserved rather than rewritten.

## Verification

- `git log origin/dev..origin/codex/iam-ses-003` and the failed CI log identified all five contaminated commits.
- `git diff --stat origin/dev..codex/iam-ses-003` isolated the eight-file semantic delta.
- `python3 scripts/git/check_commit_trailers.py --base origin/dev --head codex/iam-ses-003-clean` passed.
- `pnpm exec vitest run tests/integration/iam-ses-003-session-management.integration.test.ts tests/integration/iap-subject-adapter.integration.test.ts` passed: 2 files, 34 tests.
- `git push -u origin codex/iam-ses-003-clean` succeeded without force.
- Replacement PR #1344 is open against `dev`; its initial CI status is pending at the time of this audit.

## Helper Closeout Boundary

This helper's own branch records the diagnosis and the replacement-rail evidence only. Its integration status is `branch_pushed`; it does not claim that IAM-SES-003 has merged to `dev` or deployed.
