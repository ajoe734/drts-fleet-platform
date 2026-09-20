# NAV history recovery disposition

- Helper: `SR-PARTNER-NOTIFY-NAV-20260917-UNBLOCK-HISTORY-REPAIR`
- Parent: `SR-PARTNER-NOTIFY-NAV-20260917`; owner Gemini2, reviewer Codex2.
- Audit: 2026-09-20, 12:25–12:31 UTC; helper owner Codex2, reviewer Gemini.
- Worker: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-sr-partner-notify-nav-20260917-unblock-history-repair`.
- Branch: `codex2/sr-partner-notify-nav-20260917-unblock-history-repair`.

## Disposition

The recovery route exists and does not require rewriting any published commit.
Reuse Gemini2's existing local branch, reconcile its incomplete/out-of-scope
patch, then append compliant commits and push normally. Do not publish the stale
SHA from the parent's blocker message as a finished candidate.

This helper delivers the audited repair path, not a product fix or acceptance.
The parent still needs owner implementation/verification and Supervisor routing.
Its three named acceptance gates remain outstanding. ROUTE and TRANSPORT are
already `done`, with merge SHAs `c86f74d8826ddd3f64a4dc749a429b052ae5be17` and
`1750224ac70dd819184a579f19773f3662fa513e`, respectively.

**Before approving/merging this helper:** Supervisor must record the parent
disposition in section 5 and update the parent next step. The assigned worker's
attempt was rejected by the active release's dispatch guard; this acceptance
item is pending, not claimed complete. Keep the helper PR draft until that
coordination is recorded. No parent candidate was approved, pushed, or changed
by this audit.

## 1. Exact refs, worktrees, and candidate mismatch

| Identity                                         | Full SHA at audit                          | Publication / significance                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin/dev`, initial helper HEAD                | `f698b81a4ad2062a38a7d4f3b6584fb597517224` | Fetched base; helper began clean and task-scoped.                                                                                           |
| `gemini/sr-partner-notify-nav-20260917`          | `226be2143e0a7d1e44387da1525a509527b1cbc7` | Local, remote and [PR #2080](https://github.com/ajoe734/drts-fleet-platform/pull/2080) match; retain as historical implementation evidence. |
| `gemini/sr-partner-notify-nav-20260917-recovery` | `20f097df5379d57519546b146579fccc283af417` | Local, remote and [PR #2088](https://github.com/ajoe734/drts-fleet-platform/pull/2088) match; older recovery, not Gemini2's fixes.          |
| Rejected candidate / parent blocker SHA          | `435609df2daf53e2febf5c80b52d473de6046884` | Local commit directly on `f698b81a`; GitHub commit lookup returns HTTP 422.                                                                 |
| Current `gemini2/sr-partner-notify-nav-20260917` | `8435ecef7dcbfd2f6044ce4e67150fd50a78bc48` | One follow-up commit after `435609df`; no remote branch, PR or Actions run; GitHub commit lookup returns HTTP 422.                          |
| `codex/sr-partner-notify-nav-20260917`           | `1750224ac70dd819184a579f19773f3662fa513e` | Historical reviewer checkout, not the product candidate.                                                                                    |
| `codex2/sr-partner-notify-nav-20260917`          | `318b44b6d54513c894b03235514c8386b9b0504e` | Historical reviewer checkout, not the product candidate.                                                                                    |

`git worktree list --porcelain` contains only the helper among NAV worktrees.
The former `.artifacts/worktrees/auto/gemini2-sr-partner-notify-nav-20260917`
directory no longer exists. Its branch and both recovery commits survive.
Do not create its replacement from dev and lose the local continuation.

The parent's latest machine state is `blocked`, with no active `candidate_sha`
and retained generation `fce22e6db79445cea5972e56dd7d5aa5`. The 11:50:59Z reviewer
receipt rejected `435609df` because local/remote/PR identity did not match. The
12:12:21Z blocker still names that older SHA although the branch is at `8435ecef`.

These histories are alternatives, not a fast-forward chain: legacy versus
Gemini2 has left/right commit counts `16 / 9`; old recovery versus Gemini2 has
`1 / 4`. Do not merge the legacy branch into Gemini2 just to preserve its patch:
that would import the invalid commits again.

## 2. Confirmed contamination and remaining reconciliation

### Published history gate

Running the current `tools/ci/git/check_commit_trailers.py` against
`origin/dev..226be214` reproduces exit 1:

- `bac9881c82662befbc9595ff8946f3614a274974`: missing all three trailers.
- `6a0d7ab492984ceda89907344532a6a30b13a982`: missing all three trailers.
- `d8e7ff8269e07d04a3a94fe5464c1ad07094bc1c`: unsupported `test(...)` subject.

[The same legacy SHA's trailer job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/35500305365/job/106050794877)
is completed/failure. Adding a compliant commit to that ancestry cannot repair
this gate. The old recovery (`20f097df`, one commit) and Gemini2 (`8435ecef`, two
commits) both pass the current trailer checker, exit 0. PR #2088's
[product smoke job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/35496663499/job/106040834415)
failed; its green trailer check is not product acceptance or evidence for
Gemini2's unpublished SHA.

### Unrelated proof copied into both implementation histories

Of the 23 paths in `f698b81a..8435ecef`, exactly one is outside the parent's
current `write_scopes`:

`support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json`

Legacy commit `d2facd065aabcedbf96c0bcb7962ca83d451ba57` first changed that file
on the legacy task history. Recovery commit `435609df` copied the same blob,
`bdf5890c1dbff97e5f3a0d594bfd81e971c0493b`. It replaces the MAP evidence's
timestamp/branch with a NAV run (`gemini/sr-partner-notify-nav-20260917@7477629c8c44`)
and reformats arrays. This is unrelated generated-evidence contamination, not
NAV acceptance. Remove its net delta in the owner worktree with a new commit;
do not regenerate or overwrite canonical MAP evidence.

### Lost coverage and inconsistent constructor fixtures

Comparing fixed SHAs `226be214..8435ecef` establishes:

- The 91-line, five-case
  `tests/unit/system-remediation/sr-partner-notify-nav-20260917/notification-navigation-route.test.ts`
  is absent from the recovery tree. Recover its intent and adapt it to the final
  production contract, including GET and alternate POST exchange, rather than
  dropping BFF coverage or copying stale assertions blindly.
- `TenantPartnerController` at `8435ecef` injects billing, owned mobility, JWT,
  idempotency at indices 1–4. The controller assertions in
  `tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/appmodule-tenant-binding.test.ts`
  still expect JWT, idempotency, billing, owned mobility at those indices.
  Both explicit injection and `design:paramtypes` assertions are stale. A
  pinned-source probe confirms the four explicit mismatches. Owner must reconcile
  all callers/assertions and run the relevant repository/hosted checks.
- The legacy credential-lifecycle fixture has four padding arguments absent in
  recovery. This deletion alone is **not** a demonstrated defect: the recovery
  constructor restored the original first five parameters and its later slots
  are optional. Do not mechanically replay every legacy diff.
- `git diff --check f698b81a..8435ecef` exits 2 on whitespace in the NAV PG
  fixture at lines 56, 58, 70. These are not PG execution results.

Reflog also retains abandoned `0954ef106a33bda2644a60294dab9e3af77265ec`, an
eight-file import rewrite subsequently reset off the local branch. It is not
the owner head or a candidate; its eight other-task test paths are outside NAV
scope. Do not cherry-pick it as a generic typecheck repair. No history was
reset, amended, rebased, pruned, or force-pushed in this audit.

## 3. Authentication and checkout contamination

Both commands completed with exit 0 and proposed a new remote branch without
writing it:

```bash
git push --dry-run origin \
  refs/heads/gemini2/sr-partner-notify-nav-20260917:refs/heads/gemini2/sr-partner-notify-nav-20260917
git -c credential.helper= -c 'credential.helper=!/usr/bin/gh auth git-credential' \
  push --dry-run origin \
  refs/heads/gemini2/sr-partner-notify-nav-20260917:refs/heads/gemini2/sr-partner-notify-nav-20260917
```

The configured HTTPS credential helper uses `/usr/bin/gh auth git-credential`.
Credentials work in this Codex2 worker context. This does not establish that
the agy sandbox can access the same helper; retain its sandbox and use the
existing authorized credential/command path. Do not copy tokens, change the
shared remote to SSH, or bypass candidate verification. The eventual owner
candidate still requires an actual normal push and remote/PR readback.

The helper's `node_modules` and app package dependency directories are symlinks
to the canonical root. Here,
`readlink -f apps/platform-admin-web/node_modules/@drts/api-client` resolves to
`.artifacts/worktrees/auto/gemini-sr-partner-notify-ui-20260917/packages/api-client`.
Thus a repository check can resolve a package from another task while relative
imports resolve from its own checkout. This is concrete cross-worktree
dependency contamination in the supplied environment. The removed owner
worktree cannot be re-inspected, so this audit does not claim to reproduce its
reported TypeScript error. Arrange dependencies that resolve inside the owner
checkout, or use the existing hosted checks at the exact new SHA; do not modify
other tasks' imports or shared `node_modules` to mask it.

## 4. Non-destructive owner continuation

1. Supervisor restores an isolated Gemini2 owner worktree using the existing
   `gemini2/sr-partner-notify-nav-20260917` branch at `8435ecef`. Recheck worktree
   occupancy, remote refs, parent assignment/candidate state and dirty files
   first. If a worktree has since appeared, reuse it. Keep the helper in its own
   assigned worktree and do not switch/reset the canonical root.
2. Preserve both published branches/PRs and the Gemini2 branch. In the owner
   worktree, remove only the accidental MAP proof delta using the audited base
   blob, then append a normal task commit. The precise file operation is:

   ```bash
   git restore --source=f698b81a4ad2062a38a7d4f3b6584fb597517224 --worktree -- \
     support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json
   ```

   Inspect the diff before staging; if later owner work changed that path, stop
   and reconcile those edits. This restores one worktree file, not branch
   history. The helper did not execute it against the owner branch.

3. Reconcile the lost BFF coverage, actual constructor/DI assertions and all
   latest reviewer findings against the new implementation. Read the canonical
   task spec and latest machine reviewer receipt; the saved historical findings
   reference `49b04f0`, while machine history contains later `226be214` and
   publication-only `435609df` reviews. Do not label all seven product findings
   fixed on the strength of this history audit.
4. Run suitable non-serving checks with correct package resolution. Use existing
   hosted workflows for production PG/browser/runtime verification; no product
   server or DB may be started on this VM. Update the parent UAT with tested SHA,
   exit codes, per-finding evidence and all three named acceptance gates. The
   current UAT's five controller mocks and unlinked PG assertion do not establish
   those gates. Anchor each coherent owner repair per branch strategy §11.
5. Check the complete net diff against the task scopes and the original source
   changes. Run the trailer checker over the full dev-to-head range and
   `git diff --check`. Preserve new dev commits through a normal merge only if
   synchronization is actually needed; do not rebase this previously handed-off
   branch. Do not merge either old task branch into it.
6. Normal-push the resulting owner head and create a single successor PR to
   `dev`, explicitly linking #2080, #2088 and the old/new SHAs. Keep old refs and
   PR evidence until the successor's contents and identity are confirmed;
   Supervisor then marks the older PRs superseded through the existing lifecycle.
   Do not handoff `435609df` or `8435ecef` unchanged as a completed repair.
7. Verify local HEAD = remote head = successor PR head, then Gemini2 hands off
   that full SHA/branch/PR to Codex2. Prior reviews/CI do not transfer. Live and
   native-device acceptance remains explicitly pending.

## 5. Parent machine-truth update still required

Only the supplied release CLI was used:

`/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-626c2c488/tools/development-orchestrator/bin/ai-status.sh`

The attempt `AI_NAME=Codex2 <release-cli> note SR-PARTNER-NOTIFY-NAV-20260917 ...`
returned exit 1, `Dispatched worker cannot mutate a different task`. Its guard
allows only the dispatched helper task. No environment guard was removed, no
Supervisor/owner identity was impersonated, and no machine-truth file was edited
directly. Helper `progress` successfully records the finding and operator action.

Supervisor must use the normal task metadata gateway to persist these fields on
the helper **before merge**, and use `note` on the parent for the same next step:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Gemini2",
  "resolved_parent_next": "Reuse gemini2/sr-partner-notify-nav-20260917 at 8435ecef7dcbfd2f6044ce4e67150fd50a78bc48 in its owner worktree. Remove MAP-QA proof contamination, reconcile BFF coverage and constructor assertions, validate with isolated dependencies and hosted gates, then normal-push and register one matching successor PR/candidate. Preserve #2080/#2088 and their refs. See support/unblock/SR-PARTNER-NOTIFY-NAV-20260917/SR-PARTNER-NOTIFY-NAV-20260917-UNBLOCK-HISTORY-REPAIR.md."
}
```

Do not manually set `resolved_parent_at`; merge lifecycle supplies it. The
release defaults an unblock helper's parent to `todo` if disposition is absent,
so this metadata is material. Once routing/credentials for the owner are ready,
Supervisor can explicitly resume implementation with new evidence. A helper
merge alone does not prove the product ready for review or acceptance.

## 6. Verification and acceptance ledger

All audit commands and probes below finished; none is a background test pass.

| Finding / acceptance                          | Evidence and command                                                                                                                                                                         | Result / limitation                                                                                                                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identify exact history/worktree contamination | `git fetch origin`; `git for-each-ref`; `git worktree list --porcelain`; `git ls-remote --heads origin '*sr-partner-notify-nav*'`; fixed-SHA logs/diffs/reflog                               | Exit 0; refs and missing owner worktree recorded above.                                                                                                                                                                                |
| Invalid published ancestry                    | `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head <legacy / recovery / Gemini2 branch>`                                                                                | Legacy exit 1 with three exact bad commits; old recovery exit 0 (one commit); Gemini2 exit 0 (two).                                                                                                                                    |
| Recovery scope and DI drift                   | Read-only Python subprocess probe of fixed `8435ecef` sources and parent CLI slice; compare changed paths to `write_scopes`, controller injection order to `controllerSelfParams` assertions | Exit 0: 23 paths, one out-of-scope proof, four controller DI mismatches. Initial probe exit 1 mistakenly included service assertions; corrected selector restricted to controller assertions and rerun. No runtime acceptance claimed. |
| Recovery whitespace                           | `git diff --check origin/dev...8435ecef7dcbfd2f6044ce4e67150fd50a78bc48`                                                                                                                     | Exit 2, three PG fixture whitespace lines; owner work remains.                                                                                                                                                                         |
| Publication mismatch                          | `gh pr list --head gemini2/sr-partner-notify-nav-20260917 --state all`; `gh run list --commit 8435ecef...`; `gh api .../commits/<435609df or 8435ecef>`                                      | Lists exit 0/empty; both commit lookups exit 1/HTTP 422. Old PR head/checks readbacks completed.                                                                                                                                       |
| Safe repair/push path                         | Section 4; both exact dry-run push commands in section 3                                                                                                                                     | Exit 0; no parent ref written. Helper's actual publication is recorded in its PR and machine candidate identity.                                                                                                                       |
| Parent concrete next step                     | Release CLI parent `note`, followed by helper `progress`                                                                                                                                     | Parent note exit 1 (dispatch guard); helper progress exit 0. Supervisor update and disposition remain required before helper approval/merge.                                                                                           |
| Parent product acceptance                     | All three parent `required_acceptance`; latest owner/reviewer/UAT evidence                                                                                                                   | Not executed or accepted by this helper. PG, browser, live/native-device results are not fabricated or inherited.                                                                                                                      |

The helper changes only this report. Its final full SHA, normal push and PR head
must match the `CANDIDATE_SHA`, `CANDIDATE_BRANCH`, and `PR_URL` supplied to the
release CLI handoff to Gemini. Exact delivery evidence belongs in that receipt
and PR, avoiding a self-referential commit hash in the committed document.

## 7. Helper publication

- Published anchor: `821f23836f74672b33ba851e374ba32cda5396f9`; ordinary
  `git push -u origin codex2/sr-partner-notify-nav-20260917-unblock-history-repair`
  completed with exit 0, and `git ls-remote` returned that exact SHA.
- Review artifact: [draft PR #2093](https://github.com/ajoe734/drts-fleet-platform/pull/2093)
  targets `dev`; only this report is changed. The final candidate follows the
  anchor with a normal commit/push; no existing history is rewritten.
- Local report verification: `pnpm exec prettier --check <this-report>` and
  `git diff --check origin/dev...HEAD`; commit verification:
  `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`.
  The anchor checks passed; final checks and exact remote/PR identity must be
  read back before handoff and recorded in the machine receipt.
- The existing CI classifier treats `support/` as product scope, even for this
  documentation-only report. Hosted checks are reported under this helper's
  actual SHA; neither a helper pass nor a shared-baseline failure establishes
  the parent product's acceptance.
