# PH1GC-FWD-001 Unblock History Repair

## Scope

- Task: `PH1GC-FWD-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-FWD-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-05-23`

## Diagnosis

The parent is still externally blocked, but the unblock trail needed a second
history repair because the existing audit note itself became stale after the
parent branch advanced.

1. The canonical parent progress no longer stops at
   `03f683dd7314e687bf52289e7af6fc2f83f5c7cd`. The pushed parent branch now sits
   at `origin/codex/ph1gc-fwd-001 @ 56c1db745c83b53b09d48002afd5eec305c7d780`
   with four task commits on top of merge-base
   `a7f88919fd15385ff32d5f70f05c74d5b36d7122`:
   - `03f683dd` `wip(PH1GC-FWD-001): refresh forwarder partial evidence`
   - `cbcd1315` `wip(PH1GC-FWD-001): anchor IAP ingress evidence`
   - `0172bebd` `PH1GC-FWD-001: classify forwarder proof as repo-local`
   - `56c1db74` `PH1GC-FWD-001: finalize owner closeout`
2. The helper worktree for this task was still created from
   `origin/dev @ a7f88919` on `2026-05-22 10:46:08 +0000`. That helper branch
   contains only audit-note commits `57ff50c1` and `dad0c7d3`; it never carried
   the parent proof-set changes.
3. The older history-repair note on this helper branch still declared
   `03f683dd` as the canonical replay anchor and still described the helper
   branch as having no remote ref. Both claims were true only on `2026-05-22`
   and became stale once:
   - the parent branch advanced to `56c1db74`
   - the helper branch itself was pushed as
     `origin/codex/ph1gc-fwd-001-unblock-history-repair @ dad0c7d3`
4. The earlier unblock helpers still live on their own audit branches and PRs:
   - `origin/codex2/ph1gc-fwd-001-unblock-manual-unblock @ c847d5a4` / draft
     PR `#245`
   - `origin/codex/ph1gc-fwd-001-unblock-planning-decision @ 1b2af014` / draft
     PR `#249`
   Neither helper was merged into `dev`, so a clean helper worktree still would
   not contain those artifacts unless the refs were inspected directly.
5. The parent branch still has no PR. Without a refreshed history-repair note,
   future resume attempts could treat the helper branch or the stale
   `03f683dd` anchor as canonical even though the real replay surface is now
   `origin/codex/ph1gc-fwd-001 @ 56c1db74`.

## Evidence

### Branch and commit state

- `origin/dev @ 0150cbe4e56505854d375211e25d2ab82e948fc0`
- merge-base of `origin/dev` and `origin/codex/ph1gc-fwd-001` is still
  `a7f88919fd15385ff32d5f70f05c74d5b36d7122`
- `origin/dev...origin/codex/ph1gc-fwd-001 = 11 left / 4 right`
- `git log --oneline origin/dev..origin/codex/ph1gc-fwd-001` shows the four
  parent-only commits listed above
- `git diff --name-only origin/dev..origin/codex/ph1gc-fwd-001` shows the
  parent branch is now broader than the original two-file sidecar refresh and
  includes the repo-local proof-set, closeout, and status-truth updates
- `git diff --check origin/dev..origin/codex/ph1gc-fwd-001` passes with no
  whitespace errors
- `git branch -r --contains 56c1db745c83b53b09d48002afd5eec305c7d780` shows
  only `origin/codex/ph1gc-fwd-001`
- `gh pr list --head codex/ph1gc-fwd-001 --state all` returns no PR

### Helper-branch ambiguity

- `git reflog show refs/heads/codex/ph1gc-fwd-001-unblock-history-repair`
  records branch creation from `origin/dev` at
  `2026-05-22 10:46:08 +0000`
- Before this refresh, `origin/codex/ph1gc-fwd-001-unblock-history-repair @
  dad0c7d3e5b6e99ef1a5e929b1f4ff13e82636dd` carried only:
  - `57ff50c1` `docs(PH1GC-FWD-001-UNBLOCK-HISTORY-REPAIR): document canonical replay path`
  - `dad0c7d3` `docs(PH1GC-FWD-001-UNBLOCK-HISTORY-REPAIR): finalize owner closeout evidence`
- `gh pr view 252` shows draft PR `#252`
  (`PH1GC-FWD-001-UNBLOCK-HISTORY-REPAIR: document canonical replay path`)
  from `codex/ph1gc-fwd-001-unblock-history-repair` to `dev`
- The helper branch is therefore an audit surface only. It is not a replay
  surface for the parent proof-set work.

### Machine-truth context

- Canonical `AI_STATUS_ROOT` parent `PH1GC-FWD-001` is still `blocked`
- Parent `next` was refreshed on `2026-05-23` and already points to
  `origin/codex/ph1gc-fwd-001 @ 56c1db745c83b53b09d48002afd5eec305c7d780`
  as the repo-local proof-set branch
- This helper task was auto-created by chairman blocked-task triage on
  `2026-05-23` because the older history-repair artifact still anchored
  `03f683dd` and predated the latest external-gated revalidation note

## Exact Contamination

The contamination is not a broken code diff. It is a stale canonicality record.

1. Real parent progress moved forward on the shared branch
   `origin/codex/ph1gc-fwd-001` from `03f683dd` to `56c1db74`.
2. The helper branch name and note continued to describe the older
   `03f683dd` snapshot as if it were still the current replay anchor.
3. Because the helper branch was born from `origin/dev` and never carried the
   parent-only commits, resuming from it would silently drop the later
   proof-set and closeout work now present only on `origin/codex/ph1gc-fwd-001`.
4. The earlier unblock helpers remained isolated on their own refs, which made
   the stale history-repair note look more complete than it actually was.

Without this refresh, "resume PH1GC-FWD-001 later" remained underspecified at
the branch/worktree level even though the external blocker itself was already
known.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any shared history. Repair by declaring
the current replay surface and keeping every helper branch as an audit ref.

1. Treat `origin/codex/ph1gc-fwd-001 @ 56c1db745c83b53b09d48002afd5eec305c7d780`
   as the canonical parent branch until the external forwarder package arrives.
2. Treat `56c1db74` as the current repo-local proof-set anchor. It subsumes the
   earlier `03f683dd` sidecar refresh and the later repo-local proof
   classification / closeout commits.
3. Keep the helper branches as evidence-only refs:
   - `origin/codex/ph1gc-fwd-001-unblock-history-repair @ dad0c7d3` / PR `#252`
   - `origin/codex2/ph1gc-fwd-001-unblock-manual-unblock @ c847d5a4` / PR `#245`
   - `origin/codex/ph1gc-fwd-001-unblock-planning-decision @ 1b2af014` / PR `#249`
4. Do not replay future sandbox work from
   `codex/ph1gc-fwd-001-unblock-history-repair`, because that helper branch was
   created from `origin/dev` and never became the carrier of the parent proof
   stack.
5. When the external package is ready, resume from
   `origin/codex/ph1gc-fwd-001 @ 56c1db74` and extend the existing
   `support/sidecars/FWD-LIVE-001/` packet there.

## Concrete Parent Next Step

`PH1GC-FWD-001` should remain `blocked`, and the branch-aware next step should
stay explicit:

> 2026-05-23 revalidation confirms `PH1GC-FWD-001` remains externally blocked.
> The repo-local proof-set branch is
> `origin/codex/ph1gc-fwd-001 @ 56c1db745c83b53b09d48002afd5eec305c7d780`, but
> fresh real-sandbox evidence still cannot be collected because gcloud
> non-interactive reauthentication fails, `scripts/print-staging-iap-token.sh`
> exits `1`, `https://drts-api-kdhu6wzufa-uc.a.run.app/{,/health,/api/health}`
> still returns `404`, and
> `https://api.staging.drts-fleet.cctech-support.com/{,/api/health}` still
> redirects `302` behind IAP. Wait for approved forwarder API contract
> authority, non-interactive credential path, signed webhook / replay-proof
> samples, a seeded forwarded-task flow, callback lifecycle samples,
> settlement proof, and no-owned-assignment evidence from a real external
> endpoint. When those inputs arrive, resume from
> `origin/codex/ph1gc-fwd-001 @ 56c1db74`, not from any helper branch.

## Why This Is Safe

- No branch history is rewritten
- No force-push is required
- The canonical parent branch stays where the real proof-set commits already
  live
- Every helper branch and draft PR remains reachable as audit evidence
- The repair clarifies the replay target instead of moving commits between refs

## Owner Closeout Evidence

- Canonical repair branch:
  `origin/codex/ph1gc-fwd-001-unblock-history-repair`
- Existing pushed helper-branch audit commits remain:
  - `57ff50c14d9781e74d36cbc9beb3542dc236b55c`
  - `dad0c7d3e5b6e99ef1a5e929b1f4ff13e82636dd`
- Draft PR carrying the repair record remains `#252`
- Parent machine truth is already branch-aware and points to
  `origin/codex/ph1gc-fwd-001 @ 56c1db745c83b53b09d48002afd5eec305c7d780`
- This refresh adds one more task-scoped closeout commit on the same helper
  branch; record that head SHA and push evidence in task metadata without
  rewriting any existing ref

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical machine truth at
  `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Inspected canonical activity log at
  `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Compared relevant refs and worktrees:
  - `git branch -vv`
  - `git worktree list --porcelain`
  - `git reflog show refs/heads/codex/ph1gc-fwd-001-unblock-history-repair`
  - `git ls-remote --heads origin 'refs/heads/codex/ph1gc-fwd-001' 'refs/heads/codex/ph1gc-fwd-001-unblock-history-repair' 'refs/heads/codex/ph1gc-fwd-001-unblock-planning-decision' 'refs/heads/codex2/ph1gc-fwd-001-unblock-manual-unblock'`
- Verified parent branch composition:
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-fwd-001`
  - `git merge-base origin/dev origin/codex/ph1gc-fwd-001`
  - `git log --oneline origin/dev..origin/codex/ph1gc-fwd-001`
  - `git diff --name-only origin/dev..origin/codex/ph1gc-fwd-001`
  - `git diff --check origin/dev..origin/codex/ph1gc-fwd-001`
  - `git branch -r --contains 56c1db745c83b53b09d48002afd5eec305c7d780`
- Verified PR visibility:
  - `gh pr list --head codex/ph1gc-fwd-001 --state all`
  - `gh pr list --state all --search 'PH1GC-FWD-001'`
  - `gh pr view 252 --json number,title,headRefName,baseRefName,state,isDraft,url,commits`
