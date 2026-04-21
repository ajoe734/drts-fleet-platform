# GAP-P2S1-010 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S1-010` — tenant-partner: per-tenant store refactor — remove `DEMO_TENANT_ID` hardcode  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Last Revised:** `2026-04-17T14:33Z (UTC)`  
**Status:** `finalize_ready` — shared L0 now shows sidecar `GAP-P2S1-010-SIDECAR-ACCEPTANCE` as `review_approved` under owner=`Codex2`, reviewer=`Codex`, `last_update=2026-04-17T14:32:19Z`; parent `GAP-P2S1-010` remains `done`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S1-010` 的 acceptance checklist、dependency map、closeout 基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務重做正式實作 closeout。

- In scope: support-only acceptance framing, dependency mapping, shared-truth snapshot, repo-scan evidence anchors, reviewer checklist, and sidecar handoff commands.
- Out of scope: `tenant-partner` runtime/contract/governance 變更、L1/L2 真相修改、parent 任務 machine-truth 改寫、或任何非支援性 artifact。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S1-010` 在 machine truth 中目前是 `done`，Owner=`Codex2`，Reviewer=`Codex`，`commit_hash=2dfc7ae`，`commit_subject=feat(gap-p2s1-010): scope tenant-partner state by tenant`。
- 父任務共享 closeout 摘要已凍結三個結論：
  - tenant-partner controller / service / repository 已改成 tenant-scoped notification、SLA、passengers、addresses、users、api-keys、webhooks 與 audit 路徑。
  - tenant routes 現在強制要求 `x-tenant-id`。
  - review 期間補上 passenger/address upsert 的 cross-tenant ID collision guard，避免誤更新其他 tenant 的既有資料。
- `ai-activity-log.jsonl` 顯示 parent lifecycle 已完整閉環：
  - `2026-04-17T13:11:40Z` `Codex2 -> Codex` review handoff，摘要已明確主張 tenant-partner state tenant-scoped end-to-end，並附上驗證 bundle。
  - `2026-04-17T13:16:35Z` `Codex` review_approved，額外確認 passenger/address cross-tenant collision guard 與回歸測試。
  - `2026-04-17T13:18:23Z` `Codex2` done，canonical closeout 記錄 commit `2dfc7ae`。
- 本 sidecar `GAP-P2S1-010-SIDECAR-ACCEPTANCE` 在 shared L0 中目前是 `review_approved`，Owner=`Codex2`、Reviewer=`Codex`、`last_update=2026-04-17T14:32:19Z`；pending handoff 已從 reviewer approval 轉為 owner finalize closeout。artifact path 為 `support/sidecars/GAP-P2S1-010/GAP-P2S1-010-SIDECAR-ACCEPTANCE.md`，acceptance 只要求建立支援材料、不得修改 canonical truth、並 hand off 給 assigned reviewer。
- planning baseline 對 parent `010` 的 root cause 已收斂：
  - `consensus-packet.md` 把它列為 Sprint 1 主線任務之一，明確標記為 `tenant-partner: per-tenant store refactor (remove DEMO_TENANT_ID)`。
  - `review-round-4.md` 把它和 `009/011` 拆分，理由是 tenant-partner refactor 是「1 service, larger」，若與其他 multi-tenant cleanup 合併會形成難以審查的大 PR。
- `docs-site/index.html` 只是協作看板 shell，對本 task 沒有額外產品語意。

### Repo Baseline Anchors

- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:39-457` 以 `requireTenantId()` 強制 tenant-partner route surface 透過 `x-tenant-id` 進入 service；passengers、addresses、users、api-keys、webhooks、SLA 等 tenant routes 都走這個 gate。
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:218-243` 已把 notification preferences、SLA profiles、passengers、addresses、user roles、api keys 改成以 tenant-aware collection / map 持有，不再只靠單一 demo tenant authority。
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:260-332` 的 `onModuleInit()` 會從 repository 載入 tenant-scoped persisted state，或在空資料庫時 bootstrap 目前的 tenant-aware baseline。
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:409-632` 的 passenger / address list + upsert 路徑都以傳入 tenantId 過濾，且在 `424-438`、`532-545` 對其他 tenant 已持有的 passengerId / addressId 直接回 `PASSENGER_NOT_FOUND` / `ADDRESS_NOT_FOUND`，阻止 cross-tenant overwrite。
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:632-1579` 的 users、api-keys、webhook endpoints / deliveries、SLA profile、tenant audit 讀寫都以 tenantId 過濾或記錄。
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:104-238` 與 `238-489` 的 load/persist 已覆蓋 notification preferences、SLA profiles、webhook endpoints / deliveries、passengers、addresses、user roles、api keys 等多租戶資料面。
- `tests/unit/tenant-partner-foundation.test.ts:384-461` 驗證 tenant-partner state 依 tenant 隔離。
- `tests/unit/tenant-partner-foundation.test.ts:463-519` 驗證 passenger/address cross-tenant ID collision guard。
- `tests/unit/tenant-partner-foundation.test.ts:569-760` 驗證 repository rehydrate 與 persistChanges path 仍維持 tenant-scoped state。
- `apps/api/tests/unit/webhook-dispatch.service.test.ts` 仍是 parent closeout 驗證 bundle的一部分，但其角色是確認 webhook dispatch path 與 tenant-partner integration 相關行為，不應被誤解為本 task 的唯一證據。

結論：parent `010` 的 shared truth 已不是「要不要做 tenant scope」，而是「tenant-partner tenant scope 與 cross-tenant guard 已完成、已審查、已正式 closeout」。本 sidecar 只把這個結論與證據整理成 reviewer 可直接引用的 packet。

---

## 3) Parent Acceptance Framing

`GAP-P2S1-010` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把共享 closeout摘要、review notes 與 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Tenant-partner route surface must require explicit tenant authority

- [ ] tenant-facing controller endpoints 以 `x-tenant-id` 作為必填 authority，而不是從 route surface 默默回退到 demo tenant。
- [ ] reviewer 能從 controller surface 看出 passenger / address / user / api-key / webhook / SLA 路徑都經過 `requireTenantId()`。
- [ ] packet 不得把檔案中仍保留的 `DEMO_TENANT_ID` seed 常數誤寫成 parent acceptance 失敗；本 task 的 acceptance 是移除 runtime authority 對 demo tenant 的依賴。

### AC-2 — Tenant-partner state must be tenant-scoped end-to-end

- [ ] notification preferences 與 SLA profiles 以 tenant key 存取，而不是單一 global tenant bucket。
- [ ] passengers、addresses、users、api keys、webhook endpoints / deliveries、tenant audit 都以 tenantId 過濾或記錄。
- [ ] repository load / persist 仍維持相同的 tenant-scoped state 邊界，不會在 persistence-enabled 路徑退回 single-tenant behavior。

### AC-3 — Cross-tenant record collisions must be rejected for mutable IDs

- [ ] passenger upsert 在指定 `passengerId` 時，若該 ID 屬於其他 tenant，必須拒絕而不是覆寫。
- [ ] address upsert 在指定 `addressId` 時，若該 ID 屬於其他 tenant，必須拒絕而不是覆寫。
- [ ] reviewer 應把這組 guard 視為 parent `010` review 補強的一部分，而不是額外範圍外工作。

### AC-4 — Verification bundle must prove tenant isolation without overclaiming adjacent slices

- [ ] shared truth 記錄的 parent 驗證 bundle是 `pnpm --filter @drts/api test -- --run tests/unit/tenant-partner-foundation.test.ts apps/api/tests/unit/webhook-dispatch.service.test.ts` 與 `pnpm --filter @drts/api typecheck`。
- [ ] `tenant-partner-foundation.test.ts` 應被視為此 task 的主要 acceptance 證據，因其直接覆蓋 tenant isolation、cross-tenant guard、與 repository rehydrate/persist。
- [ ] support packet 不得把 `010` 誤寫成已完成 downstream `011` 的 multi-tenant assertion rollout；`011` 仍是獨立測試更新任務。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`GAP-P2S1-010.depends_on=[]`。

| Dep    | Source | Status | Notes                           |
| ------ | ------ | ------ | ------------------------------- |
| D-UP-1 | none   | `n/a`  | parent task 沒有 formal blocker |

### Formal Downstream Dependencies

| Dep      | Source         | Status    | Notes                                                                                                                              |
| -------- | -------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| D-DOWN-1 | `GAP-P2S1-011` | `blocked` | `GAP-P2S1-011` 正式 blocked on `GAP-P2S1-009` + `GAP-P2S1-010`；雖然 parent `010` 已 done，但 packet 應保留這個 downstream context |

### Practical Review Dependencies

| Dep   | Type                     | Why It Matters                                                                                                                              |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1 | Parent review history    | `13:11:40Z` handoff、`13:16:35Z` review_approved、`13:18:23Z` done，構成完整 acceptance evidence chain                                      |
| D-P-2 | Planning split rationale | `review-round-4.md` 明確把 `009/010/011` 分拆，避免 sidecar 把 `010` 誤擴大成整包 multi-tenant refactor                                     |
| D-P-3 | Parent closeout summary  | `ai-status.json` review notes 已將 cross-tenant passenger/address guard 納入正式審查結論                                                    |
| D-P-4 | Downstream test task     | `011` 仍要補 multi-tenant assertion coverage，因此 `010` packet 要清楚界定自己提供的是 runtime acceptance baseline，不是 test-plan closeout |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Planning anchors:
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/review-round-4.md`
- Repo anchors:
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`
  - `tests/unit/tenant-partner-foundation.test.ts`
  - `apps/api/tests/unit/webhook-dispatch.service.test.ts`

---

## 5) Evidence Inventory

| ID   | Evidence                                       | Expected Anchor                                                                    |
| ---- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                 | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                       |
| E-2  | Parent done snapshot and review notes          | `ai-status.json` task entry for `GAP-P2S1-010`                                     |
| E-3  | Review-to-done lifecycle                       | `ai-activity-log.jsonl` events at `2026-04-17T13:11:40Z`, `13:16:35Z`, `13:18:23Z` |
| E-4  | Planning scope and split rationale             | `consensus-packet.md`, `review-round-4.md`                                         |
| E-5  | Header tenant enforcement                      | `tenant-partner.controller.ts:39-457`                                              |
| E-6  | Tenant-scoped in-memory state surfaces         | `tenant-partner.service.ts:218-243`, `:409-632`, `:632-1579`                       |
| E-7  | Repository-backed tenant persistence           | `tenant-partner.service.ts:260-332`, `tenant-partner.repository.ts:104-489`        |
| E-8  | Cross-tenant passenger/address collision guard | `tenant-partner.service.ts:424-438`, `:532-545`                                    |
| E-9  | Tenant isolation regression test               | `tenant-partner-foundation.test.ts:384-461`                                        |
| E-10 | Cross-tenant guard regression test             | `tenant-partner-foundation.test.ts:463-519`                                        |
| E-11 | Persisted-state rehydrate regression test      | `tenant-partner-foundation.test.ts:569-760`                                        |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S1-010` 已是 `done`，不是 `review_approved` 或 `in_progress`。
2. acceptance framing 是否明確鎖定「tenant-partner runtime authority 已 tenant-scoped」，而不是誤要求移除所有 demo seed 常數。
3. packet 是否把 passenger/address cross-tenant ID collision guard 視為 parent review 補強重點，而非遺漏這段 reviewer 結論。
4. repo evidence 是否同時涵蓋 controller gate、service state、repository persistence、與 tests，而不是只引用單一測試檔。
5. downstream context 是否寫清楚：`GAP-P2S1-011` 仍會依賴 `010` 的 tenant-scoped runtime baseline，但不代表 `010` 已替 `011` 完成所有 multi-tenant assertions。
6. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S1-010 acceptance packet ready: it preserves the parent done snapshot on commit 2dfc7ae, correctly frames acceptance around x-tenant-id enforcement plus tenant-scoped notification/SLA/passenger/address/user/api-key/webhook/audit state, captures the passenger/address cross-tenant collision guards added during review, preserves the downstream 011 dependency context without overclaiming test coverage, and stays within support-only sidecar boundaries.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / acceptance-scope drift / missing cross-tenant guard evidence / support-scope violation]`

---

## 7) Handoff Command

Owner（`Codex2`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff GAP-P2S1-010-SIDECAR-ACCEPTANCE Codex "GAP-P2S1-010 acceptance packet ready at support/sidecars/GAP-P2S1-010/GAP-P2S1-010-SIDECAR-ACCEPTANCE.md. It preserves the parent done snapshot on commit 2dfc7ae, freezes the x-tenant-id route enforcement plus tenant-scoped notification/SLA/passenger/address/user/api-key/webhook/audit baseline, captures the passenger/address cross-tenant collision guards added during review, and keeps the downstream GAP-P2S1-011 dependency context without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S1-010-SIDECAR-ACCEPTANCE "GAP-P2S1-010 acceptance packet ready: it preserves the parent done snapshot on commit 2dfc7ae, correctly frames acceptance around x-tenant-id enforcement plus tenant-scoped notification/SLA/passenger/address/user/api-key/webhook/audit state, captures the passenger/address cross-tenant collision guards added during review, preserves the downstream 011 dependency context without overclaiming test coverage, and stays within support-only sidecar boundaries."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S1-010-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / acceptance-scope drift / missing cross-tenant guard evidence / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Codex2`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex2 python3 scripts/ai_status.py done GAP-P2S1-010-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S1-010 at support/sidecars/GAP-P2S1-010/GAP-P2S1-010-SIDECAR-ACCEPTANCE.md. The packet preserves the parent done snapshot, tenant-scoped tenant-partner acceptance baseline, cross-tenant guard evidence, and reviewer handoff path without changing canonical truth."
```

Parent absorption / 主線採納仍由 parent owner `Codex2` 視需要決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-04-17T14:33Z — finalize pass 對齊 shared L0 最新狀態：將 sidecar snapshot 更新為 `review_approved`（owner=`Codex2`, reviewer=`Codex`, `last_update=2026-04-17T14:32:19Z`），明確標記目前待 owner 正式 closeout 為 `done`，其餘 acceptance framing、evidence anchors 與 support-only scope 維持不變。
- 2026-04-17T14:32Z — reviewer 對齊 shared L0 最新狀態：將 sidecar 狀態更新為 `review` snapshot（owner=`Codex2`, reviewer=`Codex`, `last_update=2026-04-17T14:29:01Z`），補記 pending `Qwen -> Codex` reviewer auto-reassignment，並把 webhook dispatch test evidence path 修正為 repo 實際位置 `apps/api/tests/unit/webhook-dispatch.service.test.ts`。
- 2026-04-17T14:31Z — 初版建立：依共享 L0 truth、planning split rationale、parent closeout snapshot 與 tenant-partner repo 掃描，整理 `GAP-P2S1-010` 的 acceptance checklist、dependency map、tenant-scoped runtime evidence、cross-tenant passenger/address guard、以及 reviewer handoff / closeout 指引。
