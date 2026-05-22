# PH1GC-E2E-010 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `PH1GC-E2E-010` — E2E-010 governance-aware billing/reporting script  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex` / `Codex2`  
**Last Revised:** `2026-05-22T02:27Z (UTC)`  
**Status:** `review-ready support artifact` — parent `PH1GC-E2E-010` remains `pending`; this packet only freezes acceptance framing, dependency state, and reviewer checkpoints.

---

## 1) Scope Boundary

本 sidecar 只整理 `PH1GC-E2E-010` 的 acceptance checklist、dependency map、repo baseline、與 reviewer handoff 指引，不修改 canonical truth，也不替 parent 任務代做主線實作。

- In scope: support-only acceptance framing, dependency mapping, current repo gap snapshot, reviewer hotspot list, handoff text.
- Out of scope: 新增或修改 `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`、變更 `docs/**` canonical truth、更新 workflow matrix、或替 parent 任務寫 closeout。

---

## 2) Machine-Truth Snapshot

以下以 canonical machine truth 為準：`/home/edna/workspace/drts-fleet-platform/ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`。

### Parent `PH1GC-E2E-010`

- owner=`Codex`
- reviewer=`Codex2`
- status=`pending`
- depends_on=`["PH1GC-FIN-GOV-001"]`
- artifact target=`tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
- acceptance:
  1. `tests/e2e/E2E-010-governance-aware-billing-reporting.sh visible on origin/dev.`
  2. `Script encodes the full directive §B workflow (cost-center → quota → approval rule → booking → trip → invoice → governance assertions → audit).`
  3. `No silent pass on missing seed; missing seed exits non-zero with descriptive error.`
  4. `Script registered in tests/e2e/run-e2e.sh or equivalent harness.`
  5. `set -euo pipefail`; no `|| true` swallows; failures are hard failures.
  6. `Closeout report follows directive §7 format.`

### Sidecar `PH1GC-E2E-010-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Codex`
- status=`in_progress`
- helper kind=`acceptance_packet`
- mutates canonical=`false`
- artifact path=`support/sidecars/PH1GC-E2E-010/PH1GC-E2E-010-SIDECAR-ACCEPTANCE.md`

### Activity / Dashboard Baseline

- `2026-05-22T02:23:09Z` `Codex` assigned the sidecar to `Codex2`.
- `2026-05-22T02:23:24Z` orchestrator auto-created the sidecar for parent `PH1GC-E2E-010`.
- `2026-05-22T02:23:49Z` `Codex2` started the packet work.
- `current-work.md` mirrors the same parent/sidecar state, but only as human summary.

結論：目前沒有任何 machine-truth 依據可以把 parent 描述成 `in_progress`、`review`、或「已落地但待驗」。它仍是 `pending`，而 sidecar 的角色只是讓 reviewer 和 parent owner 在主線實作開始前就對 acceptance 與 dependency 有一致讀法。

---

## 3) Current Repo Baseline

### Present

- `tests/e2e/run-e2e.sh` exists and discovers all `E2E-*.sh` files under `tests/e2e/` automatically, so parent task does not need extra runner wiring if it lands as `E2E-010-*.sh`.
- `tests/e2e/README.md` currently documents only `E2E-001` through `E2E-004` as the scenario map, which is consistent with the repo still lacking the newer gap-closure scripts.
- `tests/e2e/E2E-005-tenant-governance.sh` exists and shows the house style for strict shell E2E scripts: `set -euo pipefail`, helper sourcing, explicit assertions, and audit evidence capture.
- `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` explicitly adds `E2E-010-governance-aware-billing-reporting.sh` as a required new script under directive §3.1 / §4.1.

### Missing / Pending

- `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` is currently absent from the repo.
- `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` marks that path as `MISSING`.
- Parent dependency `PH1GC-FIN-GOV-001` is still `pending`.
- The dependency artifacts named by `PH1GC-FIN-GOV-001` are also not present in this worktree snapshot:
  - `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
  - `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
- `PH1GC-MATRIX-002` is also still `pending`, and its acceptance explicitly depends on `PH1GC-E2E-010` landing so that the E2E matrix can add the E2E-010 row.

結論：reviewer 應把這份 packet 視為「主線尚未開始前的 acceptance/dependency freeze」，不是「parent 已完成的 closeout 文」。目前最重要的 repo truth 是缺檔，而不是 script 內容有瑕疵。

---

## 4) Parent Acceptance Expansion

以下只把 parent 在 `ai-status.json` 內的 acceptance 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Required script file must exist on `origin/dev`

- [ ] `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` must be added on the parent branch and visible on `origin/dev` before closeout.
- [ ] reviewer should treat local working-tree-only presence as insufficient.
- [ ] support packet must preserve that the current baseline is `missing`, not partially present.

### AC-2 — Script must encode the full directive §B / §H governance-aware finance chain

- [ ] script covers `cost-center -> quota -> approval rule -> booking -> trip -> invoice -> governance assertions -> audit`.
- [ ] reviewer should reject any version that only checks booking/invoice happy path without governance-sensitive assertions.
- [ ] `PH1GC-FIN-GOV-001` remains the spec/UAT dependency that defines the verification body to assert.

### AC-3 — Missing seed must hard fail

- [ ] missing seed exits non-zero.
- [ ] failure message is descriptive enough for reviewer/operator to identify the missing prerequisite.
- [ ] no warning-skip behavior may be inherited from looser scenarios such as the current E2E-006 posture described in status truth.

### AC-4 — Script must integrate with the suite harness

- [ ] `run-e2e.sh` must pick up the script via the `E2E-*.sh` naming convention, or the parent must provide an equivalent harness path if naming changes.
- [ ] reviewer should confirm `--dry-run` or scenario discovery shows `E2E-010` after the file lands.
- [ ] packet must not overclaim README or matrix updates as part of this parent unless those changes actually land in the parent or its declared downstreams.

### AC-5 — Failure semantics must be strict

- [ ] script uses `set -euo pipefail`.
- [ ] no `|| true` or similar failure swallowing hides verification failure.
- [ ] helper functions or subshells must preserve hard-fail behavior for governance assertions and audit checks.

### AC-6 — Parent closeout must follow directive §7 reporting format

- [ ] closeout should list owner, reviewer, commit/verification commands, and actual evidence summary in directive §7 form.
- [ ] this sidecar is not the closeout report; it only tells reviewer what the closeout must prove.

---

## 5) Dependency Map

### Formal Machine Dependency

| Dependency | Status | Why it matters |
| ---------- | ------ | -------------- |
| `PH1GC-FIN-GOV-001` | `pending` | parent `PH1GC-E2E-010` depends on the governance-aware billing/reporting spec + UAT and must assert all verification-body fields defined there |

### Informative Upstream Anchors

| Anchor | Why it matters |
| ------ | -------------- |
| `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` | immutable directive defining E2E-010 as a required new script and naming the required workflow chain |
| `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` | authoritative gap snapshot showing E2E-010 path as `MISSING` on `origin/dev` |
| `tests/e2e/E2E-005-tenant-governance.sh` | nearest in-repo style/reference for governance-oriented shell scenario structure |
| `tests/e2e/run-e2e.sh` | suite discovery and execution harness the parent script must fit into |

### Downstream Consumers

| Consumer | Status | Expected dependency |
| -------- | ------ | ------------------- |
| `PH1GC-MATRIX-002` | `pending` | needs `PH1GC-E2E-010` landed so `docs/04-uat/fbp-014a-e2e-matrix.md` can add the E2E-010 row and map it to `WF-FIN-GOV-001` |

### Dependency Interpretation Rules

- `PH1GC-FIN-GOV-001` is not optional context; it is the parent's declared machine dependency.
- `PH1GC-MATRIX-002` is downstream, not a blocker for authoring the script itself.
- reviewer should reject any parent closeout that claims governance-aware assertion completeness while `PH1GC-FIN-GOV-001` remains unresolved or uncited.

---

## 6) Evidence Inventory

| ID | Evidence | Expected anchor |
| -- | -------- | --------------- |
| E-1 | Parent / sidecar machine-truth snapshot | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl` |
| E-2 | Parent required file currently missing | `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` §2.3 |
| E-3 | Directive naming and required file list | `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` §3.1, §4.1 |
| E-4 | Parent dependency definition | `ai-status.json` task entry `PH1GC-FIN-GOV-001` |
| E-5 | Downstream matrix dependency | `ai-status.json` task entry `PH1GC-MATRIX-002` |
| E-6 | Harness autodiscovery behavior | `tests/e2e/run-e2e.sh` |
| E-7 | Governance-oriented scenario style baseline | `tests/e2e/E2E-005-tenant-governance.sh` |

---

## 7) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 parent `PH1GC-E2E-010` 仍為 `pending`，而不是暗示已進入實作或驗收後段。
2. dependency map 是否把 `PH1GC-FIN-GOV-001` 列為正式 blocker，而不是僅當作參考文件。
3. acceptance framing 是否清楚要求完整 governance-aware finance chain，而不是簡化成 invoice/audit smoke test。
4. packet 是否明確要求 missing seed hard fail，避免把 `E2E-006` 式 warning-skip 行為帶進 E2E-010。
5. packet 是否正確描述 harness reality：`run-e2e.sh` 會自動收集 `E2E-*.sh`，所以 naming 合規即等於被 runner 發現。
6. support artifact 是否完全沒有修改 canonical truth、主線腳本或 docs。

**建議核准用語：**

> `PH1GC-E2E-010 acceptance packet ready: it preserves the parent pending snapshot, keeps PH1GC-FIN-GOV-001 as the formal prerequisite, accurately records that E2E-010 is still missing on origin/dev, expands acceptance into the full governance-aware billing/reporting chain with hard-fail seed semantics, and frames PH1GC-MATRIX-002 as the downstream consumer without changing canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / dependency misread / acceptance-scope drift / support-scope violation]`

---

## 8) Handoff Command

Owner（`Codex2`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff PH1GC-E2E-010-SIDECAR-ACCEPTANCE Codex "PH1GC-E2E-010 acceptance packet ready at support/sidecars/PH1GC-E2E-010/PH1GC-E2E-010-SIDECAR-ACCEPTANCE.md. It preserves the parent pending snapshot, keeps PH1GC-FIN-GOV-001 as the formal prerequisite, records that tests/e2e/E2E-010-governance-aware-billing-reporting.sh is still missing on origin/dev, expands the full governance-aware billing/reporting acceptance chain, and identifies PH1GC-MATRIX-002 as the downstream consumer without changing canonical truth."
```

---

## 9) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex scripts/ai-status.sh approve PH1GC-E2E-010-SIDECAR-ACCEPTANCE "PH1GC-E2E-010 acceptance packet ready: it preserves the parent pending snapshot, keeps PH1GC-FIN-GOV-001 as the formal prerequisite, accurately records that E2E-010 is still missing on origin/dev, expands acceptance into the full governance-aware billing/reporting chain with hard-fail seed semantics, and frames PH1GC-MATRIX-002 as the downstream consumer without changing canonical truth."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex scripts/ai-status.sh reopen PH1GC-E2E-010-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency misread / acceptance-scope drift / support-scope violation]"
```

---

## 10) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Codex2`）在完成 task-scoped commit / push 條件後收尾為 `done`。在那之前，不應把本 sidecar 描述成正式完成。

---

## 11) Change Log

- 2026-05-22T02:27Z — 初版建立：依 canonical `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、gap-closure implementation spec、status-truth doc、`tests/e2e/run-e2e.sh`、與 `E2E-005-tenant-governance.sh`，整理 `PH1GC-E2E-010` 的 acceptance checklist、formal dependency on `PH1GC-FIN-GOV-001`、downstream `PH1GC-MATRIX-002` context、以及 reviewer handoff commands。
