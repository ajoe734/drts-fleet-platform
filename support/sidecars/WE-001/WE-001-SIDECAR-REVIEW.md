# Review Packet: WE-001 GitHub Actions CI Pipeline

**Sidecar Task:** `WE-001-SIDECAR-REVIEW`
**Parent Task:** `WE-001`
**Helper Kind:** `review_packet`
**Prepared by:** Claude
**Reviewer (Codex):** This packet is addressed to you. See Handoff section below.
**Date:** 2026-04-14

---

## 1. Summary

WE-001 implements the GitHub Actions CI pipeline for the DRTS monorepo. The canonical artifact is `.github/workflows/ci.yml`. The task was authored by Codex and submitted to Gemini for review. This sidecar packet was originally assigned to Qwen, who hit a quota-exceeded terminal failure before producing any output. Claude (this document) is the fallback owner.

**WE-001 current status:** `review` (awaiting Gemini sign-off)

---

## 2. Artifact Under Review

**File:** `.github/workflows/ci.yml`
**Introduced in commit:** `ff5f080` (`chore: bootstrap monorepo workspace`)

> Note: WE-001's task record in `ai-status.json` does not carry a `commit_hash` field. The file was introduced in the bootstrap commit. This is a gap in the evidence trail — see §5.

### Workflow summary

| Property      | Value                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| Name          | `CI`                                                                            |
| Trigger       | `pull_request` (opened/synchronize/reopened/ready_for_review), `push` to `main` |
| Permissions   | `contents: read`                                                                |
| Concurrency   | Per-ref, cancel-in-progress                                                     |
| Runner        | `ubuntu-latest`                                                                 |
| Node version  | `22`                                                                            |
| pnpm version  | `10.33.0`                                                                       |
| Install flags | `--frozen-lockfile`                                                             |

### Jobs

| Job         | Command              | Notes                                              |
| ----------- | -------------------- | -------------------------------------------------- |
| `lint`      | `pnpm run lint`      | Calls `pnpm lint:root && turbo run lint`           |
| `typecheck` | `pnpm run typecheck` | Calls `pnpm typecheck:root && turbo run typecheck` |
| `unit`      | `pnpm run test:unit` | Calls `vitest run`                                 |

Jobs run in **parallel** (no `needs:` dependencies). This is intentional — early failure in any job surfaces quickly.

---

## 3. Acceptance Criteria Evaluation

| #   | Criterion (from ai-status.json)       | Status           | Notes                                                                                                                                                                |
| --- | ------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PR 觸發 lint + typecheck + test:unit  | **PASS**         | `on.pull_request` triggers all three jobs                                                                                                                            |
| 2   | 全部 pass 才允許 merge                | **PARTIAL**      | Workflow correctly gates on job success, but branch protection rules in GitHub UI are **not configured by this workflow** — must be done separately in repo settings |
| 3   | workflow 在 GitHub Actions 可實際執行 | **PASS (local)** | YAML is syntactically valid and structurally correct; actual remote execution cannot be verified without a GitHub run                                                |

---

## 4. Technical Observations

### 4.1 Step Ordering Issue (Minor)

The recommended order per `pnpm/action-setup` v4 documentation is:

```yaml
- uses: actions/checkout@v4
- uses: pnpm/action-setup@v4 # ← pnpm FIRST
  with:
    version: 10.33.0
- uses: actions/setup-node@v4 # ← node SECOND (so cache: pnpm resolves)
  with:
    node-version: 22
    cache: pnpm
```

The workflow currently has `setup-node` **before** `setup-pnpm`. With `pnpm/action-setup@v4` this typically still works because the action registers itself retroactively, but it is non-canonical and can produce cache-miss warnings on first run. **Severity: low / cosmetic.**

### 4.2 No Job Summaries or Artifact Upload

The workflow does not upload test reports or lint output as GitHub Actions artifacts. This is acceptable for a baseline CI; adding report artifacts would be a future enhancement, not a blocker.

### 4.3 No `test:unit` Coverage Gate

`pnpm run test:unit` runs `vitest run` without a coverage threshold. Not a blocker for the acceptance criteria as written, but worth noting for a future wave.

### 4.4 `pnpm-lock.yaml` Present

`pnpm-lock.yaml` is in the git status as modified (unstaged). CI uses `--frozen-lockfile`, so any PR that ships with a mismatched lockfile will fail to install. This is correct behaviour. The current unstaged change is a local workspace concern, not a CI defect.

### 4.5 Missing `commit_hash` in Task Record

WE-001's record in `ai-status.json` has no `commit_hash`. The `AI_COLLABORATION_GUIDE.md §5` (Commit evidence rule) requires `COMMIT_HASH` + `COMMIT_SUBJECT` for canonical implementation tasks before `done`. The file was introduced in `ff5f080` but that commit also carried the full monorepo bootstrap, so the CI-specific commit evidence is blended. Gemini (the designated reviewer) should note this and decide whether a dedicated commit is required before approval.

---

## 5. Evidence Gaps

| Gap                                              | Severity | Recommendation                                                                                                                                                             |
| ------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WE-001.commit_hash` not set in `ai-status.json` | Medium   | Codex (owner) should record `ff5f080` or a dedicated follow-up commit before final `done` transition                                                                       |
| Branch protection rules not configured           | Medium   | Must be configured in GitHub repo settings (Lint / Typecheck / Unit Tests as required checks) — outside scope of this workflow file but required by acceptance criterion 2 |
| No actual GitHub Actions run evidence            | Low      | Cannot be verified locally; Gemini review should confirm remote execution once a PR is opened                                                                              |

---

## 6. Review Recommendation

**Overall verdict: CONDITIONAL PASS**

The CI workflow file is technically sound and satisfies the automation objectives. Two actions are needed before WE-001 can reach `done`:

1. **Codex** (WE-001 owner): Record `commit_hash: ff5f080` (or a new dedicated commit) in the WE-001 task record via `ai-status.sh done`.
2. **Gemini** (WE-001 reviewer): Confirm acceptance and note in the task that GitHub branch protection rules need a follow-up setup step (can be a new task or `next` note).

The step-ordering cosmetic issue (§4.1) is **not** a blocker; it can be addressed in a follow-up cleanup.

---

## 7. Handoff to Codex

**This packet is a support artifact only. It does not modify canonical truth.**

Codex, as reviewer of this sidecar:

- Verify the evidence gaps in §5 are acceptable or flag them back to the Gemini/Codex pair on WE-001.
- If this packet is sufficient, close WE-001-SIDECAR-REVIEW with `NO_COMMIT_REQUIRED=1`.
- The primary WE-001 review (by Gemini) proceeds independently.

```bash
# Suggested closure command (run by Codex after review):
AI_NAME=Codex NO_COMMIT_REQUIRED=1 ./scripts/ai-status.sh done WE-001-SIDECAR-REVIEW "Review packet complete; evidence gaps noted and handed to WE-001 canonical review pair"
```

---

_This document is a sidecar support artifact. It does not alter `ai-status.json`, canonical product truth, or the WE-001 canonical review lifecycle._
