# FBP-013B Review Packet & Evidence Summary

**Sidecar Task:** `FBP-013B-SIDECAR-REVIEW`  
**Parent Task:** `FBP-013B`  
**Helper Kind:** `review_packet`  
**Current Owner:** Codex  
**Assigned Reviewer:** Claude  
**Parent Reviewer At Snapshot:** Qwen  
**Last Revised:** 2026-04-16 (UTC)  
**Status:** IN PROGRESS - readying the support-only reviewer packet

---

## 1. Purpose

This sidecar is a support-only reviewer packet for the still-open parent task `FBP-013B`
(`smoke evidence pack`).

Its job is to preserve the current machine-truth trail, summarize the live under-review smoke
surface, and give the sidecar reviewer a compact evidence map before the parent smoke pack is
formally approved.

This document does **not** modify canonical truth, runtime behavior, contracts, registry state,
or governance state.

Companion artifact:

- `support/sidecars/FBP-013B/FBP-013B-SIDECAR-ACCEPTANCE.md`

---

## 2. Shared-Truth Baseline

The shared coordination files establish the following baseline as of `2026-04-16T03:51:27Z`:

- `ai-status.json` records parent task `FBP-013B` as `review`, Owner=`Codex`,
  Reviewer=`Qwen`, `depends_on=["FBP-008","FBP-009","FBP-011","FBP-012"]`.
- The exact parent acceptance bullets remain:
  - `smoke suite 的 critical-path coverage 與執行方式有可審查 evidence`
  - `環境前置條件、fixtures 與 failure triage guide 被整理成操作文件`
  - `staging-ready smoke evidence 可獨立 handoff 給最終 closeout`
- `current-work.md` mirrors the current parent reviewer as `Qwen`, and records the latest parent
  machine note as reviewer churn caused by repeated Claude capacity/429 retries.
- `ai-activity-log.jsonl` preserves the current reviewer-churn trail:
  - `2026-04-16T03:50:33Z`: parent review auto-reassigned `Claude -> Qwen`
  - `2026-04-16T03:51:01Z`: temporary availability-first claim flipped `Qwen -> Claude`
  - `2026-04-16T03:51:14Z`: parent review auto-reassigned back `Claude -> Qwen`
  - `2026-04-16T03:51:21Z`: another temporary availability-first claim flipped `Qwen -> Claude`
  - `2026-04-16T03:51:30Z`: parent review again auto-reassigned `Claude -> Qwen`
- The practical shared-truth result is simple:
  - parent smoke-pack reviewer currently converges to `Qwen`
  - this sidecar helper remains owned by `Codex` and reviewed by `Claude`
  - Claude reviews the **packet**
  - Qwen reviews the **parent smoke evidence surface**
- `ai-status.json` records this sidecar `FBP-013B-SIDECAR-REVIEW` as `in_progress`,
  Owner=`Codex`, Reviewer=`Claude`.
- `ai-status.json` also records the companion sidecar
  `FBP-013B-SIDECAR-ACCEPTANCE` as active and pending separate reviewer attention.

Important reviewer notes:

- This packet is **not** a post-closeout summary for a finalized parent task. `FBP-013B` is still
  under active parent review.
- The correct review scope is the current live working-tree surface for the smoke pack, not only
  the previously committed snapshot.
- The acceptance companion already covers dependency framing and acceptance interpretation. This
  packet focuses on reviewer evidence, current delta shape, and handoff clarity.

---

## 3. Review Scope and Delta Shape

### 3.1 Committed Baseline vs Current Live Review Surface

There is no machine-recorded closeout commit yet for `FBP-013B`. Review therefore needs to
distinguish three layers clearly:

| Layer                                  | Anchor                                                                           | Status                    |
| -------------------------------------- | -------------------------------------------------------------------------------- | ------------------------- |
| Smoke harness baseline                 | WE-004 commit `9a233d1`                                                          | finalized baseline        |
| First smoke-pack reconciliation commit | `4dd3b0a` (`fix(FBP-013B): reconcile smoke evidence pack to repo runtime truth`) | committed baseline        |
| Current live under-review delta        | working tree across 5 files listed below                                         | still under parent review |

`git diff --stat` across the parent review surface currently reports:

- 5 files changed
- 103 insertions
- 89 deletions

### 3.2 Current Parent Review Surface

The live parent review surface consists of exactly these files:

- `support/sidecars/FBP-013B/FBP-013B-SMOKE-EVIDENCE-PACK.md`
- `tests/smoke/README.md`
- `tests/smoke/lib/helpers.sh`
- `tests/smoke/01-health.sh`
- `scripts/run-smoke-tests.sh`

This is the surface the parent reviewer should inspect; it is also the surface summarized by this
packet.

### 3.3 Delta Themes

The current live delta is concentrated in four corrections:

1. Full-suite bootstrap actor defaults changed from `platform_admin` to `system`.
2. Smoke health wording now aligns to `GET /api/health`.
3. The smoke pack now states explicitly that `platform_admin` is insufficient for dispatch and
   driver routes under current auth policy.
4. The deploy-workflow narrative is corrected to say that `deploy-staging.yml` does **not**
   currently run smoke automatically, so live staging smoke output remains `FBP-013A` scope.

---

## 4. Evidence Summary

### 4.1 Parent Acceptance Readiness

Using only current machine truth plus the live smoke review surface:

| Parent AC                                                         | Current posture       | Evidence anchor                                                                                               |
| ----------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `critical-path coverage 與執行方式有可審查 evidence`              | `UNDER_PARENT_REVIEW` | smoke pack §2 and §4; runner help text; `tests/smoke/README.md`; `tests/smoke/01-health.sh`                   |
| `環境前置條件、fixtures 與 failure triage guide 被整理成操作文件` | `UNDER_PARENT_REVIEW` | smoke pack §3 and §5; `tests/smoke/lib/helpers.sh`; `tests/smoke/README.md`; S0002 IDs recorded in smoke docs |
| `staging-ready smoke evidence 可獨立 handoff 給最終 closeout`     | `UNDER_PARENT_REVIEW` | smoke pack §7-§9; explicit `FBP-013A` live-artifact boundary; companion acceptance packet                     |

### 4.2 File-by-File Evidence Map

| File                                                        | Reviewer value                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `support/sidecars/FBP-013B/FBP-013B-SMOKE-EVIDENCE-PACK.md` | primary narrative artifact; now aligns actor defaults, `/api/health`, `/api/admin/flags` scope decision, and deploy-workflow boundary |
| `tests/smoke/README.md`                                     | operator quickstart updated to the same bootstrap-header model and `system` defaults                                                  |
| `tests/smoke/lib/helpers.sh`                                | canonical bootstrap-header implementation and default actor / seed IDs                                                                |
| `tests/smoke/01-health.sh`                                  | health-path wording corrected to `GET /api/health` in comments and PASS output                                                        |
| `scripts/run-smoke-tests.sh`                                | CLI help / banner / defaults now match the same auth model as the docs and helpers                                                    |

### 4.3 Key Evidence Claims

The current parent smoke pack makes the following review-relevant claims, all of which are now
anchored to concrete files rather than prose-only assertions:

- The suite is a bootstrap-header smoke harness with no `/api/auth/login` dependency.
- `system` is the only truthful full-suite default actor under current route auth policy.
- S0002 seed IDs are the documented smoke defaults for tenant, driver, and vehicle.
- `/api/admin/flags` is implemented but intentionally excluded from the smoke gate.
- Live staging smoke logs are not yet emitted by `deploy-staging.yml`; they remain a companion
  artifact expected from `FBP-013A`.

### 4.4 Downstream Consumer Guardrail

Downstream consumers such as `FBP-013D` should read the smoke evidence chain as:

1. static smoke evidence packet and current live smoke-harness truth from `FBP-013B`
2. live staging deploy / migration / smoke artifact from `FBP-013A`
3. UAT / sign-off evidence from `FBP-013C`

This packet exists to keep those boundaries explicit while parent review is still open.

---

## 5. Reviewer Focus

### 5.1 Claude's Focus for This Sidecar

Claude should review this helper packet against five questions:

1. Does the packet stay support-only and avoid rewriting canonical truth or mainline runtime?
2. Does it correctly preserve the current machine truth that the **parent reviewer** is `Qwen`,
   while the **sidecar reviewer** is `Claude`?
3. Does it clearly distinguish `9a233d1` baseline, `4dd3b0a` committed reconciliation, and the
   current 5-file live review surface?
4. Do the evidence anchors match the actual delta themes: `system` actor, `/api/health`,
   deploy-workflow boundary, and `/api/admin/flags` scope decision?
5. Is the companion relationship with
   `support/sidecars/FBP-013B/FBP-013B-SIDECAR-ACCEPTANCE.md` clear enough for downstream
   consumers such as `FBP-013` / `FBP-013D`?

Suggested approval wording:

> `審查通過：FBP-013B sidecar review packet 已正確彙整目前 shared-truth reviewer churn、4dd3b0a baseline 與 5-file live smoke review surface、system bootstrap actor / /api/health / deploy-workflow boundary 等 reviewer 熱點；support artifact only，未改 canonical truth。回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 做 done closeout。`

Suggested reopen wording:

> `packet needs revision: [specify machine-truth drift / reviewer-role confusion / evidence-anchor mismatch / scope violation]`

### 5.2 Qwen's Focus for the Parent Task

The current parent reviewer `Qwen` should inspect the live smoke evidence surface against four
hotspots:

1. whether the suite default is consistently `system` across smoke pack, README, helpers, and
   runner
2. whether health-check wording is consistently `GET /api/health`
3. whether the pack correctly states that `platform_admin` is insufficient for full-suite
   dispatch/driver coverage
4. whether the pack correctly states that live staging smoke output remains `FBP-013A` scope

---

## 6. Handoff / Review / Closeout Commands

Owner handoff to Claude:

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff FBP-013B-SIDECAR-REVIEW Claude "FBP-013B review packet ready in support/sidecars/FBP-013B/FBP-013B-SIDECAR-REVIEW.md. It captures the current machine-truth split between parent reviewer Qwen and sidecar reviewer Claude, the 4dd3b0a baseline plus 5-file live smoke review surface, and the key reviewer hotspots around the system bootstrap actor, /api/health wording, /api/admin/flags scope decision, and deploy-workflow boundary without changing canonical truth."
```

Reviewer approval:

```bash
AI_NAME=Claude \
REVIEW_FILE=support/sidecars/FBP-013B/FBP-013B-SIDECAR-REVIEW.md \
REVIEW_NOTES_ZH='審查通過：FBP-013B sidecar review packet 已正確彙整目前 shared-truth reviewer churn、4dd3b0a baseline 與 5-file live smoke review surface、system bootstrap actor / /api/health / deploy-workflow boundary 等 reviewer 熱點；support artifact only，未改 canonical truth。|回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 做 done closeout。' \
python3 scripts/ai_status.py approve FBP-013B-SIDECAR-REVIEW \
  "Review approved. The packet preserves the current FBP-013B machine truth, the live 5-file smoke review surface, the reviewer-role split between Qwen and Claude, and the support-only downstream handoff guidance without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Claude python3 scripts/ai_status.py reopen FBP-013B-SIDECAR-REVIEW \
  "packet needs revision: [specify machine-truth drift / reviewer-role confusion / evidence-anchor mismatch / scope violation]"
```

Owner closeout after approval:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done FBP-013B-SIDECAR-REVIEW \
  "Done: FBP-013B review packet recorded the current machine-truth reviewer split, the 4dd3b0a baseline plus live smoke review surface, and the support-only reviewer guidance without changing canonical truth."
```

---

## 7. Change Log

- 2026-04-16 — Codex created this review packet after `FBP-013B-SIDECAR-REVIEW` was availability-
  first reassigned from Claude to Codex and moved to `in_progress`.
- 2026-04-16 — Packet anchored the current review scope to the `4dd3b0a` committed baseline and
  the 5-file live working-tree delta, rather than pretending the parent task was already finalized.
- 2026-04-16 — Packet explicitly recorded the machine-truth reviewer split: parent reviewer `Qwen`,
  sidecar reviewer `Claude`.
