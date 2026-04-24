# EMC-I1-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `EMC-I1-001` — forwarded-order live-evidence expansion  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Claude`  
**Parent Owner / Reviewer:** `Claude` / `Codex`  
**Last Revised:** `2026-04-22T07:01Z (UTC)`  
**Status:** `review_approved` — reviewer accepted the support artifact; owner closeout to `done` pending formal machine-state finalization

---

## 1) Scope Boundary

本 sidecar 只整理 `EMC-I1-001` 的 acceptance checklist、dependency map、evidence anchors 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent task 主線實作或 reviewer judgment。

- In scope: support-only acceptance framing, parent/dependency shared-truth snapshot, evidence inventory, env-gate reading, reviewer hotspots.
- Out of scope: 修改 L1 canonical truth、核心 contract / runtime / registry / governance 實作、重寫 `E2E-002` 主體邏輯、或替 parent 直接做 review 結論。

---

## 2) Current State Baseline (Shared Truth + Support Artifacts)

以 `ai-status.json`、`ai-activity-log.jsonl`、`.orchestrator/task-briefs/EMC-I1-001.md`、`support/sidecars/EMC-I1-001/EMC-I1-001-LIVE-EVIDENCE-PACK.md`、`support/sidecars/MSC-I1-001/MSC-I1-001-INTEGRATION-HARDENING.md`、以及 `tests/e2e/E2E-002-forwarded-order.sh` 為準：

- 父任務 `EMC-I1-001` 目前為 `review`，Owner=`Claude`，Reviewer=`Codex`，正式依賴為 `EMC-H2-001` 與 `EMC-W1-001`。
- parent `next` 已明示：`Phase 1-3 tiered E2E-002 expansion complete; commit d81127bd3fdab259cff057cdea1e1eac7a4296f5; sidecar evidence pack with env-gate declaration and triage guide ready for review`。
- 本 sidecar `EMC-I1-001-SIDECAR-ACCEPTANCE` 在 machine truth 中是 support-only helper，Owner=`Codex2`，Reviewer=`Claude`，formal artifact 目標為本檔案。
- `EMC-I1-001-LIVE-EVIDENCE-PACK.md` 已把 parent 成果整理成 reviewer-facing packet：三階段 `E2E-002` 拆分、env-gate 宣告、triage guide、以及 acceptance verdict。
- `MSC-I1-001-INTEGRATION-HARDENING.md` 仍保留整體 closeout 定位：`E2E-002` forwarded-order 在較早 closeout 仍屬 `ENV-GATED`，因此本 task 的價值是把「repo 可控部分」往前推，而不是宣稱整條 forwarded adapter live path 已完全無 gate。
- `tests/e2e/E2E-002-forwarded-order.sh` 現況與 evidence pack 一致：腳本已是三階段結構，且註解明確寫出 Phase 1 always runnable、Phase 2 registry-dependent、Phase 3 external-adapter-dependent。

### Shared-Truth Reading

這個 sidecar 不需要重新定義 parent acceptance，只需要把 reviewer / parent owner 應該確認的閉環整理成可直接消費的 packet：

- machine truth 的 acceptance bar 仍只有三條：
  1. `forwarded-order evidence 流程可重複執行`
  2. `env gate 與 triage guide 被明文化`
  3. `repo 可控驗證自動化擴充完成`
- 因此 reviewer 不應把本 task誤讀成：
  - 已完成 live external adapter round-trip production proof
  - 已消除所有 forwarded-order env gate
  - 已取代 `MSC-I1-001` 對 residual integration risk 的保留敘述

---

## 3) Parent Acceptance Expansion

以下展開直接對應 `ai-status.json -> EMC-I1-001.acceptance`，不新增產品語意，只把 reviewer 應驗的 closure 寫清楚。

### AC-1 — Forwarded-order evidence flow is repeatable

- [ ] `E2E-002` 不再只是單一路徑、一次性或純 env-gated 腳本；至少有一段可在 repo 可控條件下穩定重跑。
- [ ] Phase 1 使用 forwarder API 直接 seed test external order，並能完成 ingest -> list -> adapter health 的基本閉環。
- [ ] Phase 2 若有 seed registry 條件，可完成 broadcast -> relay accept -> sync-status -> final status 驗證。
- [ ] Phase 3 保留 driver surface 驗證，但缺 live adapter / injected forwarded task 時可 graceful skip，而不是模糊失敗。

### AC-2 — Env gate and triage guide are explicit

- [ ] 腳本 header 清楚標示三階段 gate 條件與 skip verdict。
- [ ] sidecar evidence pack 清楚區分 Phase 1 / Phase 2 / Phase 3 的依賴與阻塞來源。
- [ ] triage guide 能把常見失敗歸因到 API reachability、module wiring、registry seed eligibility、或 external adapter / driver-task surface，而不是把所有 skip 混成 forwarder bug。
- [ ] `ENV-GATED` 解讀與既有 `MSC-I1-001` / `FBP-014` 系列 closeout 敘述不衝突。

### AC-3 — Repo-controllable verification automation expansion is complete

- [ ] 新增 repo 可控的 ingest fixture 與 Phase 1 腳本步驟，且不依賴 live external platform payload。
- [ ] 腳本證據有保存 mirror order / external order / adapter health 等可審查資訊。
- [ ] parent handoff 說明與 live evidence pack 對齊，不把新增範圍誤寫成 full live proof。
- [ ] reviewer 能從腳本與 packet 直接看出「哪些步驟必須 pass、哪些步驟允許 skip、為什麼」。

---

## 4) Dependency Map

### Formal Machine Dependencies

| Dep          | Status | Why It Matters To `EMC-I1-001`                                                                |
| ------------ | ------ | --------------------------------------------------------------------------------------------- |
| `EMC-H2-001` | `done` | driver-task event distribution 已 externalize；Phase 3 driver-task surface 不再只靠單機記憶體 |
| `EMC-W1-001` | `done` | ops/earnings parity 已完成；Post-Closeout W1 依賴已結束，不再阻塞 I1 evidence expansion       |

### Practical Review Dependencies

| Dep   | Type                                                              | Why It Matters                                                         |
| ----- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| D-P-1 | `tests/e2e/E2E-002-forwarded-order.sh`                            | parent 的核心 delivery；review 必須直接檢查三階段結構與 skip semantics |
| D-P-2 | `tests/e2e/fixtures/e2e-forwarder-ingest.json`                    | Phase 1 repo-controllable ingest 的固定 fixture 來源                   |
| D-P-3 | `support/sidecars/EMC-I1-001/EMC-I1-001-LIVE-EVIDENCE-PACK.md`    | parent owner 已提供的 reviewer-facing evidence packet                  |
| D-P-4 | `support/sidecars/MSC-I1-001/MSC-I1-001-INTEGRATION-HARDENING.md` | 保留整體 integration posture，避免對 `E2E-002` 過度宣稱                |
| D-P-5 | `.orchestrator/task-briefs/EMC-I1-001.md`                         | parent machine-truth summary 與 current review handoff 文案來源        |

### Dependency Interpretation

- `EMC-H2-001` 與 `EMC-W1-001` 已是 `done`，所以 parent `EMC-I1-001` 的剩餘風險不是 formal blocker，而是 reviewer 是否接受此次 evidence expansion 的範圍與表述。
- 本 sidecar 的功能不是驗證 dependency implementation 本身，而是幫 reviewer 快速確認 parent 現在是不是正確站在「supportable live-evidence expansion」的位置，而不是 scope drift。

### Truth Sources

- L0 collaboration:
  - `AI_COLLABORATION_GUIDE.md`
  - `ai-status.json`
  - `ai-activity-log.jsonl`
- Parent / evidence anchors:
  - `.orchestrator/task-briefs/EMC-I1-001.md`
  - `tests/e2e/E2E-002-forwarded-order.sh`
  - `tests/e2e/fixtures/e2e-forwarder-ingest.json`
  - `support/sidecars/EMC-I1-001/EMC-I1-001-LIVE-EVIDENCE-PACK.md`
  - `support/sidecars/MSC-I1-001/MSC-I1-001-INTEGRATION-HARDENING.md`

---

## 5) Evidence Inventory

| ID  | Evidence                              | Expected Anchor                                                   |
| --- | ------------------------------------- | ----------------------------------------------------------------- |
| E-1 | Parent / sidecar machine state        | `ai-status.json`, `.orchestrator/task-briefs/EMC-I1-001.md`       |
| E-2 | Three-phase `E2E-002` structure       | `tests/e2e/E2E-002-forwarded-order.sh`                            |
| E-3 | Repo-controllable ingest seed         | `tests/e2e/fixtures/e2e-forwarder-ingest.json`                    |
| E-4 | Env-gate declaration and triage guide | `support/sidecars/EMC-I1-001/EMC-I1-001-LIVE-EVIDENCE-PACK.md`    |
| E-5 | Broader integration-risk baseline     | `support/sidecars/MSC-I1-001/MSC-I1-001-INTEGRATION-HARDENING.md` |
| E-6 | Dependency completion state           | `ai-status.json` rows for `EMC-H2-001` and `EMC-W1-001`           |

補充說明：

- 如果 reviewer 只看 commit / handoff 而不看 `EMC-I1-001-LIVE-EVIDENCE-PACK.md`，很容易把這個 task 誤讀成單純腳本重構；本 packet 的目的就是避免這個資訊落差。
- 如果 reviewer 只看 `MSC-I1-001` 舊 closeout，也可能低估本 task 已將 Phase 1 與一部分 Phase 2 自動化推進；因此兩個 packet 必須一起讀。

---

## 6) Reviewer Hotspots (`Claude`)

Reviewer 應優先確認：

1. parent `EMC-I1-001` 目前的 claim 是否仍然精準停在「live-evidence expansion」，而不是宣稱所有 forwarded-order external dependencies 已被消除。
2. `E2E-002` 的 Phase 1 是否真的 always runnable，沒有偷偷依賴 seed registry 或 live adapter。
3. Phase 2 的 skip 語意是否正確歸因為 registry eligibility gate，而不是將 forwarder lifecycle bug 誤判為 expected skip。
4. Phase 3 的 skip 語意是否與先前整合 closeout 一致，且仍保留 driver surface routeLocked / sourcePlatform 的驗證意圖。
5. `EMC-I1-001-LIVE-EVIDENCE-PACK.md` 與 `MSC-I1-001-INTEGRATION-HARDENING.md` 是否共同構成一致敘述：本 task 有明顯進展，但沒有改寫更高層 residual risk truth。

**建議核准用語：**

> `Acceptance packet aligns with current EMC-I1-001 machine truth: it keeps the task scoped to repeatable forwarded-order live-evidence expansion, points review to the three-phase E2E-002 structure plus the live evidence pack, preserves the formal dependencies on EMC-H2-001 and EMC-W1-001 as already done, and explicitly prevents over-claiming beyond the broader MSC-I1-001 integration-hardening posture.`

**建議退回用語：**

> `Packet needs revision: [specify stale machine-truth snapshot / missing dependency anchor / over-claimed live-proof scope / unclear Phase 1 vs Phase 2 vs Phase 3 gate semantics / support-scope violation]`

---

## 7) Handoff Command

Owner（`Codex2`）完成 packet 後，交給 reviewer（`Claude`）：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff EMC-I1-001-SIDECAR-ACCEPTANCE Claude "Acceptance packet ready at support/sidecars/EMC-I1-001/EMC-I1-001-SIDECAR-ACCEPTANCE.md: captures EMC-I1-001 acceptance expansion, formal deps on EMC-H2-001 and EMC-W1-001, three-phase E2E-002 review anchors, and the guardrail against over-claiming beyond the existing live-evidence and MSC-I1-001 integration-hardening posture."
```

---

## 8) Reviewer Actions

Reviewer（`Claude`）核准：

```bash
AI_NAME=Claude python3 scripts/ai_status.py approve EMC-I1-001-SIDECAR-ACCEPTANCE "Acceptance packet aligns with current EMC-I1-001 machine truth: it keeps the task scoped to repeatable forwarded-order live-evidence expansion, points review to the three-phase E2E-002 structure plus the live evidence pack, preserves the formal dependencies on EMC-H2-001 and EMC-W1-001 as already done, and explicitly prevents over-claiming beyond the broader MSC-I1-001 integration-hardening posture."
```

Reviewer（`Claude`）退回：

```bash
AI_NAME=Claude python3 scripts/ai_status.py reopen EMC-I1-001-SIDECAR-ACCEPTANCE "Packet needs revision: [specify stale machine-truth snapshot / missing dependency anchor / over-claimed live-proof scope / unclear phase-gate semantics / support-scope violation]"
```

---

## 9) Owner Closeout

如果 sidecar 之後進入 `review_approved`，由 owner（`Codex2`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex2 python3 scripts/ai_status.py done EMC-I1-001-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for EMC-I1-001 at support/sidecars/EMC-I1-001/EMC-I1-001-SIDECAR-ACCEPTANCE.md."
```

---

## 10) Change Log

- `2026-04-22` — 初版建立：依 machine truth、parent review brief、`E2E-002` 三階段腳本、`EMC-I1-001` live evidence pack 與 `MSC-I1-001` integration-hardening closeout，整理 acceptance checklist、dependency map、evidence inventory 與 reviewer handoff。
- `2026-04-22` — 對齊 dispatch 時 machine truth：標記本 packet 已 `review_approved`，等待 sidecar owner 依流程正式收尾為 `done`。
