# GAP-VERIFY-UNBLOCK-HISTORY-REPAIR — Sidecar Acceptance Packet

- Task: `GAP-VERIFY-UNBLOCK-HISTORY-REPAIR-SIDECAR-ACCEPTANCE`
- Helper kind: `acceptance_packet` (sidecar, support material only)
- Parent task: `GAP-VERIFY-UNBLOCK-HISTORY-REPAIR`
- Grandparent task: `GAP-VERIFY`
- Sidecar owner: `Claude`
- Sidecar reviewer: `Codex`
- Packet prepared: `2026-06-04`

> Scope guard: this packet is **support material only**. It does not edit
> canonical truth, contracts, runtime, registry, or governance. It restates and
> independently re-verifies the parent unblock owner's claims so the parent
> reviewer (`Codex2`) and the chair can accept or reopen the parent unblock task
> from a single page. The parent repair itself lives at
> `support/unblock/GAP-VERIFY/GAP-VERIFY-UNBLOCK-HISTORY-REPAIR.md` on branch
> `codex/gap-verify-unblock-history-repair` (commit `2de2eb39`).

---

## 1. Parent acceptance criteria → evidence map

The parent unblock task `GAP-VERIFY-UNBLOCK-HISTORY-REPAIR` carries four
acceptance criteria. Each is mapped below to independently re-verifiable
evidence captured from this worktree on `2026-06-04`.

| # | Parent acceptance criterion | Status | Evidence |
|---|-----------------------------|--------|----------|
| 1 | Identify the exact branch/worktree/commit contamination that keeps the parent blocked | ✅ Met | Repair doc §"Exact Contamination"; re-verified in §3 below — helper branches were spawned from stale `origin/dev @ 48ac41ed`, two commits behind the canonical replay tip `origin/codex/gap-verify @ a6de0eae`. |
| 2 | Repair or document a non-destructive repair path without force-pushing shared history | ✅ Met | Repair doc §"Non-Destructive Repair Path" (5 steps, no force-push, no rename, no rewrite). Re-verified: canonical tip `a6de0eae` untouched and still the only ref containing the audit refresh (§3.4). |
| 3 | Produce task-scoped commit/push/PR evidence for any canonical change | ✅ Met | Repair artifact committed at `2de2eb39` with `Task-ID`/`Reviewer`/`LLM-Agent` trailers; branch **now pushed** to `origin/codex/gap-verify-unblock-history-repair @ 2de2eb39` (§3.2). No canonical-truth mutation; only an additive support doc. |
| 4 | Update the parent task with the concrete unblocked next step | ✅ Met | Parent `GAP-VERIFY` remains `blocked` with a runtime-scoped next step (resume the live dev audit from the canonical parent branch); repair doc §"Concrete Parent Next Step" names the exact replay tip and the four residual runtime items. See §4. |

---

## 2. Dependency map

The parent unblock task declares four dependencies. All four are `done`.
The dependency fixes have landed on `origin/dev` (or are branch-pushed), which is
what makes the parent's "resume and re-audit" next step actionable rather than
blocked-on-prerequisites.

| Dependency | Status | Owner / Reviewer | Integration evidence |
|------------|--------|------------------|----------------------|
| `GAP-OPS-LIST-RSC` | `done` | Codex / Claude | Reconciled from `origin/dev @ 721b615f` (PR #509 — client-table extraction fixes `/drivers` `/vehicles` `/contracts` 500). |
| `GAP-PA-FLEET-SHELL` | `done` | Claude / Codex | Commit `5ccc54cd` pushed to `origin/claude/gap-pa-fleet-shell`; `/fleet` inner `<CanvasShell>` removed (殼中殼). INTEGRATION_STATUS=branch_pushed. Also reflected on dev via PR #508 (`1256f6d9`). |
| `GAP-PA-PRICING-TABS` | `done` | Codex2 / Claude | Reconciled from `origin/dev @ 48ac41ed` (PR #510 — `/pricing` tabs made URL-driven). |
| `GAP-E2E-SUITE` | `done` | Claude / Codex2 | Commit `1a9571ea` pushed to `origin/claude/gap-e2e-suite`; deterministic 39-route suite + CI wiring. INTEGRATION_STATUS=branch_pushed (not yet merged to dev — regression-hardening follow-up, **not** a blocker for the manual audit). |

**Dependency readiness verdict:** all four `done`. Three (`OPS-LIST-RSC`,
`PA-FLEET-SHELL` via #508, `PA-PRICING-TABS`) are already integrated into
`origin/dev @ 48ac41ed`; `GAP-E2E-SUITE` is branch-pushed regression hardening
that the parent explicitly classifies as non-blocking. No open dependency gate
remains against the unblock task.

---

## 3. Independent re-verification of the repair claims

All commands below were run from the sidecar worktree against fetched remotes on
`2026-06-04`. Results confirm the parent repair doc, with one **state update**
(the repair branch has since been pushed — see §3.2).

### 3.1 Canonical replay tip and divergence

```
$ git rev-list --left-right --count origin/dev...origin/codex/gap-verify
0   2
$ git diff --name-only origin/dev..origin/codex/gap-verify
docs/05-ui/dev-runtime-functional-gap-report-20260603.md
$ git branch -r --contains a6de0eae
  origin/codex/gap-verify
```

→ `origin/codex/gap-verify @ a6de0eae` is **2 commits ahead** of
`origin/dev @ 48ac41ed`, and those two commits touch only the audit report
(`dev-runtime-functional-gap-report-20260603.md`). `a6de0eae` is reachable from
exactly one remote ref. This is the single canonical replay surface for
`GAP-VERIFY`.

### 3.2 Helper-branch remotes (STATE UPDATE vs. repair doc)

```
$ git ls-remote --heads origin <gap-verify family>
e4e83090  refs/heads/claude/gap-verify-sidecar-acceptance
a6de0eae  refs/heads/codex/gap-verify
2de2eb39  refs/heads/codex/gap-verify-unblock-history-repair
e1cb2f3e  refs/heads/codex/gap-verify-unblock-planning-decision
```

→ The repair doc was written when the helper branches had **no** task-scoped
remote. Since then the repair branch was pushed to
`origin/codex/gap-verify-unblock-history-repair @ 2de2eb39`, and
`codex/gap-verify-unblock-planning-decision @ e1cb2f3e` was also pushed. This
**satisfies repair-path step 5** ("push this repair artifact on its own helper
branch so the control plane has durable git evidence"). Durable git evidence now
exists; the canonical replay surface remains `origin/codex/gap-verify`.

### 3.3 Helper-branch staleness (the contamination)

```
$ git branch -vv | grep gap-verify
... codex/gap-verify-sidecar-acceptance          48ac41ed [origin/dev]
... codex/gap-verify-unblock-history-repair       2de2eb39 [origin/codex/gap-verify-unblock-history-repair]
... codex/gap-verify-unblock-planning-decision     e1cb2f3e [origin/codex/gap-verify-unblock-planning-decision]
... codex/gap-verify                               a6de0eae [origin/codex/gap-verify]
```

→ The unblock/sidecar helper worktrees were all branched from
`origin/dev @ 48ac41ed`, i.e. **two commits behind** the canonical parent tip
`a6de0eae`. That is the exact contamination: a later resume could mistake a
helper branch (which looks like a plain `origin/dev` alias) for the replay
surface and silently drop the two audit-refresh commits. The repair narrows the
replay surface to `origin/codex/gap-verify @ a6de0eae` unambiguously.

### 3.4 Non-destructiveness

- No force-push, branch rename, or history rewrite is required or performed.
- `a6de0eae` is unchanged and remains the sole carrier of the audit refresh.
- Stale helper branches are retained as audit evidence, not deleted.

---

## 4. Parent next-step alignment

`GAP-VERIFY` (grandparent) is `blocked`, and the unblock work intentionally keeps
it `blocked` while converting the blocker from a *history/branch ambiguity* into
a *narrow runtime/audit* blocker. The concrete unblocked next step is:

> Resume only from `origin/codex/gap-verify @ a6de0eae`. Re-run the live dev
> browser audit, refresh
> `docs/05-ui/dev-runtime-functional-gap-report-20260603.md`, and route any
> residual failures (ops `/revenue` 500, ops `/vehicles/veh-demo-001` 500,
> platform-admin `/pricing` tab sync, ops `/attendance` tab routing) as concrete
> implementation/integration bugs. Do **not** resume from any
> `…-unblock-…` / `…-sidecar-…` helper branch.

**Note for the audit re-run:** three of the four cited residual failures already
have landed fixes on `origin/dev` — `/revenue` (PR #506 `44ae425b`), the
`/vehicles` & list-route 500s (PR #509 `721b615f`), and `/pricing` tab sync
(PR #510 `48ac41ed`). The canonical replay tip `a6de0eae` is built on
`48ac41ed`, so the re-audit should be expected to clear those three and isolate
whatever genuinely remains. This is an observation for the audit owner, not a
claim that the parent is resolved.

---

## 5. Reviewer checklist (for `Codex2` on the parent, and `Codex` on this sidecar)

Parent unblock task acceptance:

- [ ] §1 criterion 1: contamination identified — confirm helper branches sit at `48ac41ed`, parent tip at `a6de0eae` (`git branch -vv | grep gap-verify`).
- [ ] §1 criterion 2: repair path is non-destructive — confirm no force-push/rename; `a6de0eae` untouched (`git branch -r --contains a6de0eae`).
- [ ] §1 criterion 3: commit/push evidence — confirm `2de2eb39` carries trailers and is pushed (`git ls-remote --heads origin refs/heads/codex/gap-verify-unblock-history-repair`).
- [ ] §1 criterion 4: parent next step is concrete and runtime-scoped — confirm `GAP-VERIFY` stays `blocked` with the §4 next step.

This sidecar acceptance:

- [ ] Support-material-only: this packet adds one file under `support/sidecars/…` and edits no canonical truth (`git show --stat <closeout commit>`).
- [ ] Dependency map (§2) matches machine truth: all four deps `done`.
- [ ] Re-verification (§3) reproduces on a fresh `git fetch origin`.

---

## 6. Verification performed for this packet

- `AI_NAME=Claude scripts/ai-status.sh show GAP-VERIFY-UNBLOCK-HISTORY-REPAIR-SIDECAR-ACCEPTANCE`
- `AI_NAME=Claude scripts/ai-status.sh show GAP-VERIFY-UNBLOCK-HISTORY-REPAIR`
- `AI_NAME=Claude scripts/ai-status.sh show GAP-VERIFY`
- `AI_NAME=Claude scripts/ai-status.sh show <each of the 4 dependencies>`
- `git show codex/gap-verify-unblock-history-repair:support/unblock/GAP-VERIFY/GAP-VERIFY-UNBLOCK-HISTORY-REPAIR.md`
- `git rev-list --left-right --count origin/dev...origin/codex/gap-verify`
- `git diff --name-only origin/dev..origin/codex/gap-verify`
- `git branch -r --contains a6de0eae`
- `git ls-remote --heads origin <gap-verify branch family>`
- `git branch -vv | grep gap-verify`
- `git worktree list --porcelain | grep -i gap-verify`

## 7. Handoff

- Sidecar deliverable: this acceptance packet (additive support artifact).
- Reviewer of record (sidecar): `Codex`.
- Parent owner (`Codex`) decides whether to absorb this into the mainline unblock
  closeout. The parent reviewer of record remains `Codex2`.
- INTEGRATION_STATUS for this sidecar: `branch_pushed` once the closeout commit
  is pushed to `origin/claude/gap-verify-unblock-history-repair-sidecar-acceptance`.
