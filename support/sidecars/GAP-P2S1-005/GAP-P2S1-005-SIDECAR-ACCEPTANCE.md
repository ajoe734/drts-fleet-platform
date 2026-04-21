# GAP-P2S1-005 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S1-005` — platform-earnings: add 3 demo seed records (matching billing settlement seed drivers)  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2` (also parent owner; decides whether to absorb this packet into parent closeout)  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Last Revised:** `2026-04-17T15:55Z (UTC)`  
**Status:** `review_approved` — shared L0 keeps sidecar `GAP-P2S1-005-SIDECAR-ACCEPTANCE` under owner=`Codex`, reviewer=`Codex2`, `status=review_approved`, `last_update=2026-04-17T15:53:36Z`; `current-work.md` handoff queue shows the pending finalize handoff from `Codex2` back to owner `Codex` created at `2026-04-17T15:53:36Z`, and latest checkpoints show `owned_finalize_dispatch` queued at `2026-04-17T15:53:40Z` plus a worker start for `Codex` at `2026-04-17T15:53:46Z`; parent `GAP-P2S1-005` is already `done` on commit `acfc062`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S1-005` 的 acceptance checklist、dependency map、shared-truth snapshot、repo/test evidence anchors 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務重做正式 closeout。

- In scope: support-only acceptance framing, dependency mapping, current-state baseline, repo/test evidence anchors, reviewer checklist, and handoff / closeout commands.
- Out of scope: `platform-earnings` runtime/contract/governance 變更、L1/L2 真相修改、billing-settlement seed semantics 重設計、driver-app 行為修補、或任何未經 `scripts/ai_status.py` 的 machine-truth 編修。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S1-005` 在 machine truth 中目前是 `done`，Owner=`Codex2`，Reviewer=`Codex`，`commit_hash=acfc062`，`commit_subject=feat(gap-p2s1-005): seed demo platform earnings fallback`。
- 共享 closeout 摘要已凍結的 parent 結論是：
  - `platform-earnings.service.ts` 已加入 3 筆 in-memory demo earnings seeds，對齊 billing-settlement demo drivers。
  - `demo-driver` 與 `driver-demo-001` 會 alias 到 `drv-demo-001`，避免目前 driver fallback 身分查不到資料。
  - reviewer acceptance 已通過，僅留下兩個非阻塞 follow-ups：`formatMoney` 跨檔案重複、以及 driver-app earnings page mount 時的 double fetch。
- `ai-activity-log.jsonl` 顯示 parent lifecycle 已完整閉環：
  - `2026-04-17T12:36:44Z`：`Codex` 記錄 progress，明確把 scope 定義為「讓 non-DB platform earnings fallback 不再回空 map」。
  - `2026-04-17T12:39:50Z`：`Codex -> Codex2` handoff，摘要明確指出 3 筆 seeds、兩個 demo aliases、`tests/unit/platform-earnings.test.ts`，以及驗證命令 `pnpm vitest run tests/unit/platform-earnings.test.ts` 與 `pnpm exec eslint apps/api/src/modules/platform-earnings/platform-earnings.service.ts tests/unit/platform-earnings.test.ts --max-warnings=0`；同時記錄 repo baseline 仍有與本 patch 無關的 billing-settlement test failure 與 broader `typecheck:root` failure。
  - `2026-04-17T12:44:06Z`：`Codex2` `review_approved`，明確標記所有 acceptance criteria 通過，僅保留非阻塞 follow-ups。
  - `2026-04-17T12:47:50Z`：`Codex2` 將 parent 正式 closeout 為 `done`。
- 本 sidecar `GAP-P2S1-005-SIDECAR-ACCEPTANCE` 在 shared L0 中目前是 `review_approved`，Owner=`Codex`、Reviewer=`Codex2`、artifact path=`support/sidecars/GAP-P2S1-005/GAP-P2S1-005-SIDECAR-ACCEPTANCE.md`；`acceptance[]` 仍只要求建立支援材料、不得修改 canonical truth、並 handoff 給 assigned reviewer。`current-work.md` 與 `ai-status.json` 目前都顯示最新 handoff 已不是 reviewer 待處理，而是 `2026-04-17T15:53:36Z` 由 `Codex2 -> Codex` 的 pending finalize handoff，並在 latest checkpoints 看到 `2026-04-17T15:53:40Z` `owned_finalize_dispatch` 與 `2026-04-17T15:53:46Z` owner worker start；因此這份文件目前是已核准、待 owner 正式 closeout 的 packet，而不是待 reviewer 回應的草稿。
- `ai-activity-log.jsonl` 的 sidecar lifecycle 已補齊最後一段 reviewer approval：
  - `2026-04-17T15:53:36Z`：`Codex2` `review_approved`，明確確認 packet 保留 parent done snapshot、3 筆 non-DB seeded platform-earnings records、`demo-driver` / `driver-demo-001` alias coverage、與 summary-total derivation 證據。
  - `2026-04-17T15:53:40Z` 與 `2026-04-17T15:53:46Z`：Orchestrator 對 owner `Codex` 發出並啟動 `owned_finalize_dispatch`，表示 reviewer 已完成回合，現況只差 owner 用 status script 做正式 `done` closeout。
- planning baseline 對 parent `005` 的 root cause 已明確收斂：
  - `backlog-proposal.md` 將 root cause 直接寫成 `platform-earnings.service.ts in-memory Map is empty`。
  - `consensus-packet.md` 把 parent `005` 固定為 Sprint 1 小型任務：`platform-earnings: 3 demo seed records`。
  - `starter-draft.md` 也把 `005` 放在 `GAP-P2S1-005~008` 一組 support-style fixes 中，說明它不是 DB schema 或 contract redesign，而是讓 demo runtime baseline 完整。
- `docs-site/index.html` 只是協作看板 shell，對本 task 不提供額外產品語意。

### Repo Baseline Anchors

- `apps/api/src/modules/platform-earnings/platform-earnings.service.ts:5-48` 定義 `DEFAULT_CURRENCY`、3 筆 `PLATFORM_EARNINGS_SEED`、以及 `demo-driver` / `driver-demo-001` -> `drv-demo-001` 的 alias map。
- `apps/api/src/modules/platform-earnings/platform-earnings.service.ts:67-86` 以 `buildSeedMemory()` 預先建立 in-memory fallback，不再從空 `Map` 開始。
- `apps/api/src/modules/platform-earnings/platform-earnings.service.ts:94-129` 讓 `byPlatform()` 在 non-DB mode 先做 alias resolve，再回傳 seeded breakdown 與「seeded from billing settlement demo drivers」說明。
- `apps/api/src/modules/platform-earnings/platform-earnings.service.ts:132-158` 的 `summary()` 從 `byPlatform()` 聚合 totals，表示 summary 與 per-platform breakdown 共用同一組 seed baseline，而不是第二套 hardcode。
- `apps/api/src/modules/platform-earnings/platform-earnings.controller.ts:14-18` 仍保留既有 controller fallback：沒有 driver identity 時使用 `demo-driver`；這正是 alias 對齊必要性的 runtime anchor。
- `apps/api/src/modules/platform-earnings/platform-earnings.controller.ts:20-41` 仍維持既有 read API surface（`summary` / `by-platform`）與 `READ_HEAVY_RATE_LIMIT`，表示 parent `005` 沒有擴大到 route contract 或 throttling policy 變更。
- `tests/unit/platform-earnings.test.ts:5-37` 驗證 `drv-demo-001` 與 `drv-demo-002` 的 seeded per-platform breakdown。
- `tests/unit/platform-earnings.test.ts:39-51` 驗證 seeded summary totals 是從同一份 fallback aggregation 推出。
- `tests/unit/platform-earnings.test.ts:53-64` 驗證 `demo-driver` 與 `driver-demo-001` 會回到 `drv-demo-001` 的 seeded baseline。

結論：parent `005` 的 shared truth 已不是「要不要加 demo data」，而是「non-DB platform earnings fallback 已有可用 demo baseline，alias 也與既有 driver fallback 對齊，parent review / closeout 已完成」。本 sidecar 只把這個結論整理成 reviewer 可直接引用的 packet。

---

## 3) Parent Acceptance Framing

`GAP-P2S1-005` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把共享 closeout摘要、planning 限制與 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Non-DB fallback must expose seeded platform earnings for the demo drivers

- [ ] `PlatformEarningsService` 的 in-memory fallback 不再從空 `Map` 啟動，而是預載 3 筆 seeds。
- [ ] seeded records 必須對齊 billing-settlement demo drivers，而不是任意加入新的 demo actor。
- [ ] 至少覆蓋兩個 driver baselines：`drv-demo-001` 有多平台 breakdown，`drv-demo-002` 有單平台 breakdown。

### AC-2 — Existing demo fallback identities must resolve onto the seeded baseline

- [ ] `demo-driver` 需映射到已存在的 `drv-demo-001` seed，避免目前 controller fallback 仍回空資料。
- [ ] `driver-demo-001` 也需映射到同一 baseline，避免 driver-app / Expo demo identity 與 API demo identity 分裂。
- [ ] packet 不得把 alias 行為包裝成新的 canonical identity policy；它是 parent `005` 對現有 demo runtime 的兼容性修補。

### AC-3 — Summary totals must derive from the same seeded aggregation

- [ ] `summary()` 使用 `byPlatform()` 的 items 聚合 totals，而不是維護另一份獨立 hardcoded totals。
- [ ] reviewer 應能從 tests 直接對照 `drv-demo-001` 的 gross / fee / subsidy / net totals。
- [ ] support packet 不得擴寫成 DB ledger、billing statement、或 settlement contract 已被重設計。

### AC-4 — Scope must stay within fallback seeding, not broader API or frontend remediation

- [ ] DB-enabled path 仍沿用 `repo.aggregateByDriver()`，parent `005` 不應被誤寫成 DB migration / read-model redesign。
- [ ] controller route surface、realm guard、rate-limit metadata 不在本 task acceptance 內，只能作為 alias 必要性的 runtime context。
- [ ] reviewer 記錄的 `formatMoney` duplication 與 driver-app mount double fetch 必須保留為非阻塞 follow-ups，不得被 sidecar 重新拉進 parent closeout scope。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`GAP-P2S1-005.depends_on=[]`。

| Dep    | Source | Status | Notes                           |
| ------ | ------ | ------ | ------------------------------- |
| D-UP-1 | none   | `n/a`  | parent task 沒有 formal blocker |

### Formal Downstream Dependencies

> machine truth 沒有任何 task 正式依賴 `GAP-P2S1-005`。

| Dep      | Source | Status | Notes                                                            |
| -------- | ------ | ------ | ---------------------------------------------------------------- |
| D-DOWN-1 | none   | `n/a`  | 這是 demo fallback completeness fix，沒有 formal downstream gate |

### Practical Review Dependencies

| Dep   | Type                              | Why It Matters                                                                                                                                                                                 |
| ----- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1 | Billing-settlement demo baselines | 3 筆 seed records 明確宣告 mirror billing-settlement March demo baselines；若 reviewer 不抓這個關聯，就無法判斷 seed values 是否落在正確 driver 上                                             |
| D-P-2 | Controller demo fallback identity | controller 無 identity 時仍回 `demo-driver`，所以 alias mapping 是 parent `005` 成立的必要 runtime context                                                                                     |
| D-P-3 | Parent handoff baseline note      | 原始 handoff 已註明 `billing-settlement.test.ts` 仍有與本 patch 無關的既有失敗，以及 broader `typecheck:root` 失敗；packet 必須保留這個邊界，避免 reviewer誤認為 parent closeout要求 repo 全綠 |
| D-P-4 | Non-blocking review follow-ups    | `formatMoney` duplication 與 double fetch on mount 是 review 已知事項，但不應回流成 acceptance blocker                                                                                         |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Planning anchors:
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/backlog-proposal.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md`
- Repo anchors:
  - `apps/api/src/modules/platform-earnings/platform-earnings.service.ts`
  - `apps/api/src/modules/platform-earnings/platform-earnings.controller.ts`
  - `tests/unit/platform-earnings.test.ts`

---

## 5) Evidence Inventory

| ID   | Evidence                                       | Expected Anchor                                                                      |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| E-1  | Parent / sidecar machine state                 | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                         |
| E-2  | Parent done snapshot on commit `acfc062`       | `ai-status.json` task entry for `GAP-P2S1-005`                                       |
| E-3  | Parent lifecycle chain                         | `ai-activity-log.jsonl` events at `12:36:44Z`, `12:39:50Z`, `12:44:06Z`, `12:47:50Z` |
| E-4  | Planning root cause: empty in-memory map       | `backlog-proposal.md:20-30`                                                          |
| E-5  | Planning scope: Sprint 1 `3 demo seed records` | `consensus-packet.md:40-49`                                                          |
| E-6  | Seed records + aliases                         | `platform-earnings.service.ts:5-48`                                                  |
| E-7  | Seeded memory initialization                   | `platform-earnings.service.ts:67-86`                                                 |
| E-8  | Non-DB fallback behavior + seeded notes        | `platform-earnings.service.ts:94-129`                                                |
| E-9  | Summary totals reuse same aggregation          | `platform-earnings.service.ts:132-158`                                               |
| E-10 | Controller fallback identity context           | `platform-earnings.controller.ts:14-18`, `:20-41`                                    |
| E-11 | Seeded breakdown regression test               | `tests/unit/platform-earnings.test.ts:5-37`                                          |
| E-12 | Summary totals regression test                 | `tests/unit/platform-earnings.test.ts:39-51`                                         |
| E-13 | Demo alias regression test                     | `tests/unit/platform-earnings.test.ts:53-64`                                         |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S1-005` 已是 `done`，而 sidecar 自身仍是 `review`，不能倒置。
2. acceptance framing 是否鎖定在「seed non-DB fallback + alias 對齊現有 demo driver identity」，而不是誤擴大成 DB ledger 或 API contract 變更。
3. packet 是否清楚保留 original handoff 的 baseline note：`billing-settlement.test.ts` / `typecheck:root` 的 broader failures 與本 patch 無關。
4. repo evidence 是否同時涵蓋 seed constants、seed memory init、alias resolve、summary aggregation、controller fallback context、與 unit tests，而不是只引用單一測試檔。
5. review notes 是否把 `formatMoney` duplication 與 double fetch on mount 保持為非阻塞 follow-ups，不重開 parent scope。
6. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S1-005 acceptance packet ready: it preserves the parent done snapshot on commit acfc062, correctly frames acceptance around the three seeded non-DB platform-earnings records plus demo-driver/driver-demo-001 alias coverage for the existing demo fallback identity, captures summary-total derivation from the same seeded aggregation, preserves the non-blocking follow-ups without overclaiming broader repo health, and stays within support-only sidecar boundaries.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / acceptance-scope drift / missing alias-or-summary evidence / support-scope violation]`

---

## 7) Handoff Command

Owner（`Codex`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff GAP-P2S1-005-SIDECAR-ACCEPTANCE Codex2 "GAP-P2S1-005 acceptance packet ready at support/sidecars/GAP-P2S1-005/GAP-P2S1-005-SIDECAR-ACCEPTANCE.md. It preserves the parent done snapshot on commit acfc062, freezes the three seeded non-DB platform-earnings records plus demo-driver and driver-demo-001 alias coverage for the existing demo fallback identity, captures summary totals derived from the same seeded aggregation, and keeps the non-blocking formatMoney/double-fetch follow-ups out of canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve GAP-P2S1-005-SIDECAR-ACCEPTANCE "GAP-P2S1-005 acceptance packet ready: it preserves the parent done snapshot on commit acfc062, correctly frames acceptance around the three seeded non-DB platform-earnings records plus demo-driver/driver-demo-001 alias coverage for the existing demo fallback identity, captures summary-total derivation from the same seeded aggregation, preserves the non-blocking follow-ups without overclaiming broader repo health, and stays within support-only sidecar boundaries."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen GAP-P2S1-005-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / acceptance-scope drift / missing alias-or-summary evidence / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done GAP-P2S1-005-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S1-005 at support/sidecars/GAP-P2S1-005/GAP-P2S1-005-SIDECAR-ACCEPTANCE.md. The packet preserves the parent done snapshot, seeded fallback acceptance baseline, demo alias evidence, and reviewer handoff path without changing canonical truth."
```

Parent absorption / 主線採納仍由 parent owner `Codex2` 視需要決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-04-17T15:55Z — 對齊 shared L0 最新 state：將 packet header 與 Section 2 從過時的 `review` / reviewer-pending 快照更新為 `review_approved` / owner-finalize 快照，補上 `2026-04-17T15:53:36Z` reviewer approval 與 `2026-04-17T15:53:40Z` / `2026-04-17T15:53:46Z` `owned_finalize_dispatch` 事件，避免 owner closeout 依據 stale workflow 描述。
- 2026-04-17T15:49Z — 對齊 shared L0 最新 state：更新 sidecar review snapshot 到 `last_update=2026-04-17T15:48:53Z`，補上最新 `2026-04-17T15:48:53Z` pending reviewer handoff 與 `2026-04-17T15:49:01Z` `review_ready_dispatch` checkpoint，避免 reviewer 看到 stale workflow 描述。
- 2026-04-17T15:46Z — 對齊 shared L0 最新 state：更新 sidecar review snapshot 到 `last_update=2026-04-17T15:44:54Z`，補上最新 `2026-04-17T15:44:54Z` pending reviewer handoff 與 `2026-04-17T15:45:01Z` `review_ready_dispatch` checkpoint，避免 reviewer 看到 stale workflow 描述。
- 2026-04-17T15:42Z — 對齊 shared L0 最新 state：更新 sidecar review snapshot 到 `last_update=2026-04-17T15:41:25Z`，補上最新 `2026-04-17T15:41:25Z` pending reviewer handoff 與 `2026-04-17T15:41:33Z` `review_ready_dispatch` checkpoint，避免 reviewer 看到 stale workflow 描述。
- 2026-04-17T15:38Z — 對齊 shared L0 最新 state：更新 sidecar review snapshot 到 `last_update=2026-04-17T15:38:01Z`，補上最新 `2026-04-17T15:37:44Z` pending reviewer handoff 與 `2026-04-17T15:37:52Z` `review_ready_dispatch` checkpoint，避免 reviewer 看到 stale workflow 描述。
- 2026-04-17T15:34Z — 對齊 shared L0 最新 state：更新 sidecar review snapshot 到 `last_update=2026-04-17T15:33:55Z`，補上最新 `pending` reviewer handoff 與 `2026-04-17T15:34:12Z` `review_ready_dispatch` checkpoint，並修正 reviewer hotspot 將 sidecar 現況誤寫成 `in_progress` 的描述。
- 2026-04-17T15:32Z — 對齊 shared L0 最新 state：更新 sidecar review snapshot 到 `last_update=2026-04-17T15:31:40Z`，補上最新 `pending` reviewer handoff 與 `2026-04-17T15:31:48Z` `review_ready_dispatch` checkpoint，避免 reviewer 看到 stale workflow 描述。
- 2026-04-17T15:30Z — 對齊 shared L0 最新 state：更新 sidecar review snapshot 到 `last_update=2026-04-17T15:29:30Z`，補上最新 `pending` reviewer handoff 與 `2026-04-17T15:29:38Z` `review_ready_dispatch` checkpoint，避免 reviewer 看到 stale workflow 描述。
- 2026-04-17T15:28Z — 對齊 shared L0 最新 state：更新 sidecar review snapshot 到 `last_update=2026-04-17T15:27:20Z`，補上最新 `pending` reviewer handoff 與 `2026-04-17T15:27:28Z` `review_ready_dispatch` checkpoint，避免 reviewer 看到 stale workflow 描述。
- 2026-04-17T15:26Z — 對齊 shared L0 最新 state：更新 sidecar review snapshot 到 `last_update=2026-04-17T15:25:11Z`，補上最新 `pending` reviewer handoff 與 `2026-04-17T15:25:19Z` `review_ready_dispatch` checkpoint，避免 reviewer 看到 stale workflow 描述。
- 2026-04-17T15:22Z — 對齊 shared L0 最新 state：更新 sidecar review snapshot 到 `last_update=2026-04-17T15:21:22Z`，補上最新 `pending` reviewer handoff 與 `2026-04-17T15:21:28Z` `review_ready_dispatch` checkpoint，避免 reviewer 看到 stale workflow 描述。
- 2026-04-17T15:19Z — 對齊 shared L0 最新 state：將 sidecar 狀態從過時的 `in_progress` 更新為 `review`，補上 `2026-04-17T15:18:08Z` pending reviewer handoff 與 `2026-04-17T15:18:14Z` `review_ready_dispatch` checkpoint，避免 reviewer 看到 stale workflow 描述。
- 2026-04-17T15:14Z — 初版建立：依 shared L0 truth、planning anchors、parent lifecycle、commit `acfc062` 與 platform-earnings repo/test 掃描，整理 `GAP-P2S1-005` 的 acceptance checklist、dependency map、alias / summary evidence、reviewer hotspots、與 handoff / closeout 指引。
