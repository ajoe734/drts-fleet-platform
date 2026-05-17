# Branch Strategy — Three-Layer Integration with Dual Tracks

**Status:** Draft for cutover  
**Owner:** Release engineering  
**Adopted:** _pending cutover (see §10)_  
**Supersedes:** Ad-hoc `merge/W*` wave branches (kept frozen for history)

---

## 1. Goals

1. **No direct `feat → main` merges.** Every change crosses at least one integration gate.
2. **Backend and frontend can ship at independent cadence** without blocking each other on
   `merge/W*` wave bottlenecks.
3. **Promotion between layers is a single orchestrator-arbitrated decision** that combines
   CI signal, task status, and reviewer sign-off — not "whoever can press the merge button first."
4. **Branch sprawl is bounded.** Short-lived branches auto-delete after merge; long-lived
   branches are a small, known set.
5. **Multi-agent workers (Codex / Claude / Gemini) land in the right track automatically**
   based on task ID, not by whoever happens to push first.

---

## 2. The model

```
                ┌────────── BACKEND TRACK ──────────┐         ┌────────── FRONTEND TRACK ──────────┐
                │                                   │         │                                     │
   feat/be-*    │                                   │         │                                     │   feat/ui-*
   codex/be-*   │     merge/backend-dev-into-main   │         │    merge/frontend-dev-into-main     │   claude/ui-*
   claude/be-*  ├──►       (Gate 1: integrate)      │         │       (Gate 1: integrate)           ◄───┤   gemini/ui-*
   gemini/be-*  │                  │                │         │                  │                  │
                │                  ▼                │         │                  ▼                  │
                │       backend-dev-publish         │         │       frontend-dev-publish          │
                │           (Gate 2: stage)         │         │           (Gate 2: stage)           │
                │                  │                │         │                  │                  │
                └──────────────────┴───────┬────────┴─────────┴──────────────────┘                  │
                                           ▼
                                  release/<YYYY-MM-DD>
                                      (Gate 3: release)
                                           │
                                           ▼
                                          main
```

Three gates × two tracks × one release alignment branch. Hotfixes have their own bypass lane (see §7).

---

## 3. Branch types and naming

| Branch family                  | Purpose                        | Lifetime     | Naming                                                         |
| ------------------------------ | ------------------------------ | ------------ | -------------------------------------------------------------- |
| `feat/*`                       | Human-authored feature         | Short        | `feat/<scope>-<short-desc>` (e.g. `feat/be-cc-billing-export`) |
| `fix/*`                        | Human-authored bug fix         | Short        | `fix/<scope>-<short-desc>`                                     |
| `codex/*`                      | Codex agent worker output      | Short        | `codex/<task-id-kebab>` (e.g. `codex/be-cc-001-billing`)       |
| `claude/*` / `claude2/*`       | Claude agent worker output     | Short        | `claude/<task-id-kebab>`                                       |
| `gemini/*` / `gemini2/*`       | Gemini agent worker output     | Short        | `gemini/<task-id-kebab>`                                       |
| `merge/backend-dev-into-main`  | Backend integration trunk      | Permanent    | exactly this name                                              |
| `merge/frontend-dev-into-main` | Frontend integration trunk     | Permanent    | exactly this name                                              |
| `backend-dev-publish`          | Backend staging-deploy source  | Permanent    | exactly this name                                              |
| `frontend-dev-publish`         | Frontend staging-deploy source | Permanent    | exactly this name                                              |
| `release/*`                    | Cross-track release candidate  | Short (1-3d) | `release/<YYYY-MM-DD>` or `release/v<semver>`                  |
| `hotfix/*`                     | Emergency direct-to-main fix   | Shortest     | `hotfix/<incident-id>`                                         |

> The four `merge/*` and `*-publish` branches are the only ones with branch protection.
> Everything else is disposable.

---

## 4. Task → track routing

Workers are assigned a base branch automatically by `.orchestrator/branch_routing.py`
using the task-ID prefix:

| Track    | Task ID prefixes                                                                                       | Base branch                                                              |
| -------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Backend  | `BE-*`, `API-*`, `SC-*`, `OBS-*`, `BE-INTEG-*`, `BE-APR-*`, `BE-CC-*`, `EVD-*`, `FWD-*`, `TCH-*`       | `merge/backend-dev-into-main`                                            |
| Frontend | `UI-*`, `*-UI-*` (e.g. `OPS-UI-*`, `TEN-UI-*`, `DRV-*`, `PA-*`, `PB-*`, `ADM-UI-*`, `XS-UI-*`, `DS-*`) | `merge/frontend-dev-into-main`                                           |
| Docs     | `DOC-*`, `DOCS-*`                                                                                      | follows primary file change                                              |
| Cross    | anything matching both, or no rule                                                                     | `merge/backend-dev-into-main` + reviewer must approve cross-track impact |

The full mapping table lives in `.orchestrator/branch_routing.py` and is config-driven via
`branch_strategy.track_rules` in `.orchestrator/config.json`.

---

## 5. Promotion gates

The orchestrator (`supervisor.py`) holds promotion authority. Each gate combines CI signal,
task status in `ai-status.json`, and human approval where required.

| Gate                           | Trigger                                   | Required CI                                  | Approver                                 | Mechanism                                        |
| ------------------------------ | ----------------------------------------- | -------------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| `feat → merge/*-dev-into-main` | PR open + ready_for_review                | `ci-feat` (lint, typecheck, unit)            | 1 CODEOWNER                              | GitHub PR; supervisor sets `gate_layer=merge`    |
| `merge/* → *-publish`          | Daily `promote-nightly.yml` + manual      | `ci-integ` (full test + integration + build) | 1 reviewer (auto-tagged release manager) | Auto-PR opened by workflow                       |
| `*-publish → release/*`        | Release manager invokes `bin/cut-release` | `ci-publish` (deploy smoke)                  | release manager                          | Manual; release branch cut from both publishes   |
| `release/* → main`             | Manual merge                              | `ci-publish` + release smoke + sign-off      | **2 approvers** (release + on-call)      | GitHub PR with required reviews                  |
| `hotfix/* → main`              | Emergency                                 | minimal `ci-feat`                            | on-call                                  | Manual; **must back-port to both `merge/*-dev`** |

### 5.1 How "Orchestrator arbitration" works

When a worker reports done:

1. Worker pushes branch and opens PR against the routed `merge/*-dev-into-main`.
2. Supervisor watches `gh pr checks <pr>` via the existing GitHub bus.
3. When all required checks are green AND task status in `ai-status.json` is `review_approved`,
   supervisor auto-merges with squash (no human button needed for Gate 1).
4. Once daily (or on demand), `promote-nightly.yml` opens a PR
   `merge/<track>-dev-into-main → <track>-publish` containing all merged work since last promotion.
5. After publish CI is green and staging smoke passes, the release manager cuts a `release/*`
   branch off the aligned heads of both `*-publish` branches.

### 5.2 What rolls back

| Failure point         | Rollback                                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| `merge/*-dev` CI red  | Revert the offending squash on `merge/*-dev`; supervisor reopens task as `retry`. |
| `*-publish` CI red    | Auto-revert the nightly promotion PR; supervisor pauses promotion for that track. |
| `release/*` smoke red | Discard the release branch; cut a new one excluding the offending commit.         |
| `main` post-merge red | `git revert` on main + hotfix branch.                                             |

---

## 6. CI and branch protection

| Branch                         | Required reviews | Required status checks         | Force-push       | Deletion          |
| ------------------------------ | ---------------- | ------------------------------ | ---------------- | ----------------- |
| `main`                         | 2                | `ci-publish` + `release-smoke` | no               | no                |
| `backend-dev-publish`          | 1                | `ci-integ` + `ci-publish`      | no               | no                |
| `frontend-dev-publish`         | 1                | `ci-integ` + `ci-publish`      | no               | no                |
| `merge/backend-dev-into-main`  | 1 (CODEOWNERS)   | `ci-feat`                      | no (rebase only) | no                |
| `merge/frontend-dev-into-main` | 1 (CODEOWNERS)   | `ci-feat`                      | no (rebase only) | no                |
| `release/*`                    | 2                | `ci-publish`                   | no               | yes (after merge) |

Applied by `scripts/branch-strategy/apply-branch-protection.sh` (see §10).

---

## 7. Hotfix path

When production is broken and waiting through the three layers is unacceptable:

```
hotfix/<incident-id> ──► main  (PR with on-call approval, minimal CI)
                  │
                  └─► cherry-pick into both merge/*-dev-into-main  (mandatory, within 24h)
```

A weekly check (`promote-nightly.yml` weekly job) verifies main is no more than one commit
ahead of either `*-publish`. If it is, that's a missed hotfix back-port and the workflow opens
an issue.

---

## 8. Branch hygiene

- **Short-lived branches** (`feat/*`, `fix/*`, `codex/*`, `claude*/*`, `gemini*/*`):
  auto-deleted 7 days after merge by GitHub's "automatically delete head branches" setting.
- **Stale branches**: a weekly `scripts/branch-strategy/triage-branches.sh` run posts an
  issue listing branches with no commit in 30 days that are not merged to main.
- **`*-closeout` branches**: legacy convention. Closeouts going forward live in commit
  messages and `.artifacts/`. New `*-closeout` branches should not be created; existing
  ones are frozen for history and listed for deletion by triage.

---

## 9. Wave concept transition

The `merge/W1a..W3f` wave branches are **frozen** and remain in the repo for historical
audit. They are not part of the new flow. Wave grouping is replaced by:

- **PR milestones** with `wave:W*` labels for progress tracking
- **Release notes generation** that groups commits by wave label
- **No new `merge/W*` branches** are created

Any in-flight work on a frozen wave branch is migrated by `scripts/branch-strategy/triage-branches.sh`
which produces a per-branch recommendation: `rebase-onto-track`, `cherry-pick-then-delete`,
or `abandon`.

---

## 10. Migration plan

| Day | Action                                                                      | Owner    | Reversible?           |
| --- | --------------------------------------------------------------------------- | -------- | --------------------- |
| 0   | Review and approve this document                                            | You      | n/a                   |
| 1   | Run `bootstrap-branches.sh --apply` to create the 4 long-lived branches     | You      | Yes (delete branches) |
| 1   | Land workflow files via PR to `main`                                        | Me       | Yes (revert PR)       |
| 2   | Run `apply-branch-protection.sh --apply`                                    | You      | Yes (clear rules)     |
| 3   | Land `branch_routing.py` + CODEOWNERS via PR                                | Me       | Yes (revert PR)       |
| 3   | Wire `branch_routing.route_task()` into supervisor at worker-dispatch path  | Me + you | Yes (revert PR)       |
| 4-5 | Run `triage-branches.sh` against all 138 branches; produce migration report | Me       | Read-only             |
| 6   | Execute per-branch migrations (rebase / cherry-pick / abandon) by track     | You + me | Per-branch            |
| 7   | First `promote-nightly` dry run on each track                               | Auto     | Read-only             |
| 8   | First end-to-end release through all three layers                           | You + me | Per-step              |
| 14  | Steady state; retro                                                         | You      | n/a                   |

---

## 11. Open questions

- Do we want a separate `*-publish` per frontend app (driver / ops / partner) or one combined?  
  Current design: one combined `frontend-dev-publish`. Revisit after one release cycle.
- Should `hotfix → main` require back-port to both tracks even if the fix is single-track?  
  Current design: yes, to keep `main` reachable from both publishes. Cost is one cherry-pick.
- Where do `infra/*` changes (CI, deploy scripts, GitHub config) belong?  
  Current design: backend track. Tagged `infra` label for filtering.

---

## 12. References

- Implementation files:
  - `.github/workflows/ci-integ.yml` — CI for `merge/*-dev-into-main`
  - `.github/workflows/ci-publish.yml` — CI for `*-publish`
  - `.github/workflows/promote-nightly.yml` — daily auto-PR opener
  - `.github/workflows/release.yml` — release tagging + deploy gate
  - `.github/CODEOWNERS` — owner rules per path
  - `.orchestrator/branch_routing.py` — task → track mapping
  - `scripts/branch-strategy/bootstrap-branches.sh` — create long-lived branches
  - `scripts/branch-strategy/apply-branch-protection.sh` — set protection rules
  - `scripts/branch-strategy/triage-branches.sh` — inventory & migration recommendations
- Integration guide for the orchestrator: [orchestrator-integration-guide.md](./orchestrator-integration-guide.md)

---

## 13. Version numbering

Use `v<YYYY>.<WW>.<P>`:

- `YYYY` — calendar year (UTC).
- `WW` — ISO week number, zero-padded (`01`–`53`).
- `P` — patch counter inside that week; `0` for the scheduled cut, `1`, `2`, … for hotfixes landing in the same week.

Examples:

- `v2026.21.0` — Wave-21 publish cut.
- `v2026.21.1` — first hotfix in the same week.
- `v2026.22.0` — next week's cut.

`release/v<YYYY>.<WW>.<P>` branches are short-lived. Each cut also gets an annotated tag of the same name; the `prod/v<YYYY>.<WW>.<P>` tag is added once `release/* → main` lands.

The older `release/<YYYY-MM-DD>` format used during the cutover is frozen for history; new releases follow the week-based format.

---

## 14. Self-audit matrix — which executor reads which rule?

| Rule                                                                | Defined in                                                                         | Supervisor reads                                                                                                                                                   | Worker autoworker reads                                                                                  | Chair-review reads                          | Auto-enforced                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| Task-ID → track / base branch                                       | `.orchestrator/branch_routing.py`, §4 above                                        | yes — `route_task()` runs at worker dispatch and stamps `state.workers[run_id].routing` (track / base_branch / publish_branch / gate_layer / routing_matched_rule) | yes — readable from the same state record by tools (and via the wakeup brief surface)                    | yes — chair packets inspect `state.json`    | yes (every non-planning dispatch)                                              |
| Branch naming `<lane>/<task-id-kebab>`                              | §3 above                                                                           | n/a                                                                                                                                                                | partial — workers read it from skill/brief docs; the convention is not yet machine-enforced at push time | yes                                         | no (convention)                                                                |
| Commit subject `<TASK-ID>: <summary>` ≤80                           | §3 above + commit gate                                                             | n/a                                                                                                                                                                | yes (skill)                                                                                              | yes                                         | partial — workers run the husky `commit-msg` hook if installed; CI also checks |
| Trailer `LLM-Agent` / `Task-ID` / `Reviewer`                        | Commit Gate (AI_COLLABORATION_GUIDE.md), task-closeout-finalization skill          | yes — `ai-status.sh done` validates COMMIT_HASH / SUBJECT / PUSH_REMOTE / PUSH_BRANCH env at closeout                                                              | yes                                                                                                      | yes                                         | yes (closeout env + optional commit-msg hook)                                  |
| Staging discipline (one worker, one scope)                          | task-closeout-finalization skill                                                   | n/a                                                                                                                                                                | yes (skill)                                                                                              | yes                                         | partial — `.git/index.lock` retry guidance is in the skill                     |
| Push policy (no force / mirror / all / tags / delete)               | supervisor permission broker, §5 above                                             | yes — supervisor's auto-approval refuses these flags                                                                                                               | yes                                                                                                      | yes — chair must never routine-approve them | partial (supervisor + branch protection on permanent branches)                 |
| Branch protection on `main` / `*-publish` / `merge/*-dev-into-main` | GitHub branch protection                                                           | n/a                                                                                                                                                                | n/a — push fails if violated                                                                             | n/a — same                                  | yes (GitHub)                                                                   |
| Done gate: commit + push metadata                                   | AI_COLLABORATION_GUIDE.md §Commit Gate, SUPERVISOR_OPERATING_MODEL.md §Commit Gate | yes (env validation in `ai-status.sh done`)                                                                                                                        | yes                                                                                                      | yes                                         | yes (`ai-status.sh done`)                                                      |
| Promotion gates (Gate 1 / 2 / 3a / 3b)                              | §5 above, `.github/workflows/promote-nightly.yml`, `.github/workflows/release.yml` | partial — Gate 1 auto-merge is described but currently still manual (slated for follow-up)                                                                         | n/a                                                                                                      | yes (chair release-engineering decisions)   | partial (GitHub + nightly)                                                     |
| Hotfix path                                                         | §7 above, chair skill release-engineering                                          | n/a                                                                                                                                                                | n/a                                                                                                      | yes (chair skill)                           | no (manual)                                                                    |
| Version format `v<YYYY>.<WW>.<P>`                                   | §13 above, chair skill release-engineering                                         | n/a                                                                                                                                                                | n/a                                                                                                      | yes (chair skill)                           | no (manual, `bin/cut-release`)                                                 |

Open follow-up items (not blockers for this matrix):

1. Worker-side **PR opener** that turns the routed `base_branch` from `state.workers[run_id].routing` into a `gh pr create` against the right trunk, so workers do not have to know the routing table themselves.
2. **Gate-1 auto-merge** wiring inside the supervisor (`gh pr merge --squash --auto` for tasks in `review_approved`). Currently described in §5.1 but not yet implemented.
3. **Local commit-msg / pre-commit hooks** that machine-enforce the subject pattern and the runtime-mirror blocklist before the commit even reaches the network. Documented as a separate workstream so that closeout discipline does not depend on every worker having the same shell environment.
