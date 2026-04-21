# G-1 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `G-1` — `tenant-commute-hub`: 刪除 `supabase/functions/` 資料夾 (6 個 legacy edge functions)  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex` / `(unset in machine truth)`  
**Last Revised:** `2026-04-17T20:31Z (UTC)`  
**Status:** `review_approved` — shared L0 now keeps sidecar `G-1-SIDECAR-ACCEPTANCE` at `review_approved` under owner=`Codex`, reviewer=`Codex2`, `last_update=2026-04-17T20:29:18Z`, with `next=G-1 acceptance packet ready: it keeps machine truth aligned on parent backlog, correctly frames the task as deleting the residual supabase/functions scaffold instead of reopening FBP-006 cutover, captures the current empty-directory baseline and adjacent migrations observation without scope drift, preserves the low-regression repo evidence including no Supabase dependency or runtime imports, treats the remaining Login.tsx Supabase mention as non-runtime copy only, and keeps G-3 portability work out of scope.`; `current-work.md` / `ai-activity-log.jsonl` also show the pending `Codex2 -> Codex` finalize handoff, the superseded review worker at `2026-04-17T20:29:20Z`, and the `owned_finalize_dispatch` wake-up plus worker-start at `2026-04-17T20:29:29Z`, while the parent `G-1` remains `backlog` under owner=`Codex` with no formal dependencies or assigned reviewer

---

## 1) Scope Boundary

本 sidecar 只整理 `G-1` 的 acceptance checklist、dependency map、shared-truth snapshot、repo evidence anchors 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務在 `tenant-commute-hub` 中實際刪除目錄。

- In scope: support-only acceptance framing, residual edge-function directory baseline, reviewer checklist, and handoff / closeout commands.
- Out of scope: `tenant-commute-hub` 主線 runtime 或 build 設定修改、L1/L2 真相調整、`drts-fleet-platform` authority contract 改寫、或把 `G-3` 的 CI/CD portability 風險混入這個 cleanup slice。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html`、`docs/02-architecture/consensus/gap-phase2-planning-20260417/*`、`docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md`，以及目前 local checkout 掃描為準：

- 父任務 `G-1` 在 machine truth 中目前是 `backlog`，Owner=`Codex`，Reviewer unset，Summary 明確寫的是：
  - `刪除 tenant-commute-hub/supabase/functions/ 下 6 個 legacy edge functions (calculate-price, generate-report 等)，改用 drts-fleet-platform API`
- 本 sidecar `G-1-SIDECAR-ACCEPTANCE` 在 shared L0 中目前是 `status=review_approved`，Owner=`Codex`、Reviewer=`Codex2`、artifact path=`support/sidecars/G-1/G-1-SIDECAR-ACCEPTANCE.md`，`last_update=2026-04-17T20:29:18Z`。
- `ai-activity-log.jsonl` / `current-work.md` 顯示 reviewer lane 最後一次有效循環是 `2026-04-17T20:25:24Z` 到 `20:25:45Z` 的 `Codex2 -> Qwen -> Codex2` 重新指派：Qwen 再次 401 後，`2026-04-17T20:25:43Z` 改派回 `Codex2`、同秒排入並啟動 `Codex2` 的 `review_ready_dispatch` worker，而舊的 Qwen worker 於 `2026-04-17T20:25:45Z` 被標記 `worker_superseded`。之後 `Codex2` 於 `2026-04-17T20:29:18Z` 正式記錄 `review_approved`，看板同時保留一筆 `Codex2 -> Codex` 的 pending handoff，並在 `2026-04-17T20:29:29Z` 將此 sidecar 送入 `owned_finalize_dispatch`。
- accepted `gap-phase2` planning 已把 `G-1` 定位成獨立、低風險、可平行的 XS cleanup：
  - `starter-draft.md` 明寫 `supabase/functions/` 下有 6 個 edge function，`src` 已無引用、`package.json` 也無 Supabase 依賴，因此「直接刪除，無 regression 風險」。
  - 同一段 planning 也明確說明：刪除 edge functions 與 `vite.config.ts` 指向 `../drts-fleet-platform` 的 build portability 問題是兩件事，後者屬於 `G-3`，不能和 `G-1` 混為同一件事。
  - `consensus-packet.md` 將 `G-1` 列為 Sprint 2 可完全平行的 XS 任務，無 formal dependency。
- 既有 canonical execution artifact `FBP-006` 已把 repo B authority cutover 描述為 done：
  - `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md` §4 / §6 記錄「repo B `supabase/functions/*` and `supabase/migrations/*` deleted」。
  - `ai-status.json` 也把 `FBP-006` 標為 `done`，commit `ddfc087`，並宣稱移除了 Supabase、edge functions 與本地 backend authority。
- 但目前 local external checkout `../tenant-commute-hub` 仍保留空殼目錄：
  - `../tenant-commute-hub/supabase/functions/`
  - 六個空的 child directories：`calculate-price`、`generate-report`、`seed-demo-data`、`seed-test-user`、`send-notification`、`webhook-trigger`
  - `../tenant-commute-hub/supabase/migrations/` 空目錄也仍存在
  - `find ../tenant-commute-hub/supabase/functions -maxdepth 2 -type f` 目前沒有任何檔案輸出，表示殘留的是空資料夾，不是仍在執行的 edge function code
- 目前 repo baseline 也支撐「這是殘留清理，不是功能性 cutover」：
  - `../tenant-commute-hub/package.json` 沒有 `supabase` / `@supabase/*` 依賴
  - `rg -n '@supabase|from .supabase|from "supabase|createClient|supabaseClient|supabase-js' ../tenant-commute-hub/src ../tenant-commute-hub/package.json ../tenant-commute-hub/package-lock.json` 無結果，表示沒有 runtime/import 層的 Supabase client 依賴
  - `../tenant-commute-hub/src/pages/Login.tsx:119` 仍保留一段 UI 文案提到「不再使用 Supabase auth」；這屬於說明文字，不是對 edge functions 或 Supabase SDK 的存活依賴
  - `../tenant-commute-hub/vite.config.ts` 仍有本機相對路徑 alias，但那是 `G-3` 所描述的獨立 portability / CI 問題，不是 `G-1` acceptance gate

### Gap Summary

| 問題                                                                                   | 影響                                                | 根本原因                                                                              |
| -------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Shared truth 把 `G-1` 列為 backlog cleanup，但 `FBP-006` 已宣稱 edge functions deleted | parent owner 容易重複實作或錯誤 closeout            | `FBP-006` 的 deletion record 對齊的是「內容刪除」，目前 local checkout 則仍留空目錄   |
| `../tenant-commute-hub/supabase/functions/` 仍存在六個空子目錄                         | repo B authority boundary 看起來沒有完全收乾淨      | cutover 後遺留空殼 scaffolding，尚未做最後目錄層 cleanup                              |
| `supabase/migrations/` 空目錄也還在                                                    | reviewer 可能把鄰接 cleanup 誤當成 `G-1` 的必要條件 | parent title 只點名 `functions/`，但 `FBP-006` 文件曾把 `migrations/*` 一起視為已刪除 |
| `vite.config.ts` 仍靠本機相對路徑 alias                                                | 容易被誤包進 `G-1`                                  | 這是 `G-3` 的 build portability 問題，不是 edge-function residual cleanup             |

### Repo Baseline Anchors

- Shared L0:
  - `ai-status.json` task rows for `G-1` and `G-1-SIDECAR-ACCEPTANCE`
  - `current-work.md` Active Slices / Delivery Layers / Handoff Queue
  - `ai-activity-log.jsonl` entries at `2026-04-17T15:45:14Z`, `2026-04-17T15:45:28Z`, `2026-04-17T15:47:19Z`, `2026-04-17T20:25:15Z`, `2026-04-17T20:25:24Z`, `2026-04-17T20:25:27Z`, `2026-04-17T20:25:28Z`, `2026-04-17T20:25:43Z`, `2026-04-17T20:25:45Z`, `2026-04-17T20:29:18Z`, `2026-04-17T20:29:20Z`, `2026-04-17T20:29:29Z`
- Planning / authority anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md:20,287-300,392`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md:47,93`
  - `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md:14-18,83-96`
- External repo baseline:
  - `../tenant-commute-hub/package.json`
  - `../tenant-commute-hub/vite.config.ts`
  - `../tenant-commute-hub/supabase/functions/`
  - `../tenant-commute-hub/supabase/migrations/`

---

## 3) Parent Acceptance Framing

`G-1` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 accepted planning、shared truth 與 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — `supabase/functions/` residual scaffold must be removed, not merely ignored

- [ ] `../tenant-commute-hub/supabase/functions/` 整個資料夾在 parent closeout 時已不存在，而不是只刪掉部分子目錄。
- [ ] 六個 legacy child directories 不再留在 repo：`calculate-price`、`generate-report`、`seed-demo-data`、`seed-test-user`、`send-notification`、`webhook-trigger`。
- [ ] reviewer 不接受「裡面沒檔案所以算完成」這種 closeout；`G-1` 標題明確是刪除 `supabase/functions/` 資料夾本身。

### AC-2 — cleanup must remain a no-regression residual delete, not a second cutover rewrite

- [ ] parent evidence 應顯示 `tenant-commute-hub` 在刪除前就已沒有 `src` 層 Supabase 依賴或 runtime 引用，支持 `starter-draft.md` 的「直接刪除、無 regression 風險」判斷。
- [ ] reviewer 不應要求 `G-1` 重新證明整個 tenant BFF cutover；那是 `FBP-006` 已完成的主線工作，`G-1` 只處理殘留 scaffolding。
- [ ] 若 parent owner 順手刪除空的 `supabase/migrations/` 目錄，這與 `FBP-006` 既有 authority-deletion 記錄一致；但 sidecar 不把它升格成 `G-1` 的新增 formal gate，避免 scope drift。

### AC-3 — cleanup must stay separate from `G-3` portability work

- [ ] reviewer 應確認 parent closeout 沒有把 `vite.config.ts` alias、multi-repo checkout、或 Lovable cloud build 修正混進 `G-1` 的 acceptance 宣稱。
- [ ] `G-1` 可以完成，但 `G-3` 仍保持獨立 backlog / follow-up；兩者不互相阻塞，也不互相吸收。
- [ ] support packet 與 parent closeout 不得把 build portability 問題誤寫成 edge-function delete 的回歸風險。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`G-1.depends_on=[]`。

| Dep    | Source      | Status | Notes                                                                   |
| ------ | ----------- | ------ | ----------------------------------------------------------------------- |
| D-UP-1 | none formal | `n/a`  | `G-1` 在 `consensus-packet` 與 `ai-status.json` 都是無依賴的 XS cleanup |

### Practical Review Dependencies

| Dep   | Type                              | Why It Matters                                                                                         |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| D-P-1 | `gap-phase2` starter draft        | 凍結 `G-1` 的任務定義：6 個 edge functions 已無引用，可直接刪除                                        |
| D-P-2 | `gap-phase2` consensus packet     | 證明 `G-1` 是 Sprint 2 可完全平行的 XS backlog，不應被擴張成多日切換工程                               |
| D-P-3 | `FBP-006` cutover spec + task row | 說明 repo B authority cutover 已完成，`G-1` 是 residual cleanup，不是重新打開 canonical cutover        |
| D-P-4 | local external checkout baseline  | 顯示目前還有空的 `supabase/functions/` / `supabase/migrations/` 目錄，這正是 reviewer 要核對的實際殘留 |
| D-P-5 | `package.json` + `rg` scan        | 證明目前沒有 Supabase dependency / `src` 引用，支持 no-regression delete framing                       |
| D-P-6 | `vite.config.ts` portability note | 強制 reviewer 把 `G-1` 與 `G-3` 分離，避免 scope drift                                                 |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
  - `docs-site/index.html`
- Planning / authority anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md`
- External repo anchors:
  - `../tenant-commute-hub/package.json`
  - `../tenant-commute-hub/vite.config.ts`
  - `../tenant-commute-hub/supabase/functions/`
  - `../tenant-commute-hub/supabase/migrations/`

---

## 5) Evidence Inventory

| ID   | Evidence                                                                                                          | Expected Anchor                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------- | -------------- | ------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                                                                                    | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                            |
| E-2  | `G-1` is planned as a direct low-risk delete                                                                      | `starter-draft.md:287-300`                                                              |
| E-3  | `G-1` is XS, parallel, no dependency                                                                              | `consensus-packet.md:47,93`                                                             |
| E-4  | Prior authority cutover already claimed edge-function deletion                                                    | `fbp-006-tenant-commute-hub-cutover-spec.md:83-96` + `ai-status.json` row for `FBP-006` |
| E-5  | No Supabase dependency in repo B package manifest                                                                 | `../tenant-commute-hub/package.json`                                                    |
| E-6  | No runtime/import-level Supabase dependency remains; one Login page explanatory copy still mentions Supabase auth | `rg -n '@supabase                                                                       | from .supabase | from "supabase | createClient | supabaseClient | supabase-js' ../tenant-commute-hub/src ../tenant-commute-hub/package.json ../tenant-commute-hub/package-lock.json`returns no hits;`../tenant-commute-hub/src/pages/Login.tsx:119` |
| E-7  | Current residual empty child directories                                                                          | `find ../tenant-commute-hub/supabase/functions -mindepth 1 -maxdepth 1 -type d`         |
| E-8  | Current `supabase/functions/` contains no files                                                                   | `find ../tenant-commute-hub/supabase/functions -maxdepth 2 -type f` returns no hits     |
| E-9  | Adjacent empty `supabase/migrations/` directory still exists                                                      | `../tenant-commute-hub/supabase/migrations/`                                            |
| E-10 | Build portability stays a separate issue                                                                          | `starter-draft.md:20`; `../tenant-commute-hub/vite.config.ts:16-27`                     |

---

## 6) Review Outcome (`Codex2`)

`Codex2` 已核准；以下是此次 review 實際鎖定的重點：

1. packet 是否忠實保留 machine truth：parent `G-1` 仍是 `backlog`，無 formal dependency，無 reviewer；sidecar 是 owner=`Codex` / reviewer=`Codex2` 的 `review_approved` snapshot，`last_update=2026-04-17T20:29:18Z`，且 shared L0 已保留 `Codex2 -> Codex` 的 finalize handoff 與 `owned_finalize_dispatch`。
2. acceptance framing 是否把 `G-1` 鎖定在「殘留空目錄 cleanup」，而不是錯把它寫成需要重做 `FBP-006` authority cutover。
3. packet 是否清楚處理 `FBP-006` deletion record 與目前 local checkout 仍留空資料夾之間的差異，讓 parent owner 後續 closeout 可據此對齊。
4. packet 是否把 `supabase/migrations/` 空目錄列為 adjacent observation，而不是擅自擴大 `G-1` title 的 formal scope。
5. packet 是否明確把 `vite.config.ts` portability / CI 風險留給 `G-3`，沒有混進 `G-1` acceptance。
6. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**實際核准用語（shared L0 已記錄）：**

> `G-1 acceptance packet ready: it keeps machine truth aligned on parent backlog and sidecar review ownership, frames the task as deleting the residual supabase/functions scaffold rather than redoing FBP-006 cutover, captures the current six empty child directories plus the empty migrations directory as the actual local baseline, preserves the no-Supabase-dependency and no-runtime-import evidence for low regression risk while correctly treating the remaining Login copy as non-runtime text, reflects the latest Qwen 401 rebalance loop through the 2026-04-17T20:25:45Z superseded-worker event, and keeps G-3 build portability explicitly out of scope.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / FBP-006-vs-local-baseline confusion / migrations scope drift / G-3 portability scope confusion / support-scope violation]`

---

## 7) Historical Handoff Command

這是 owner（`Codex`）在 reviewer approval 前使用的 handoff 範本；shared L0 已記錄對應 handoff：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff G-1-SIDECAR-ACCEPTANCE Codex2 "G-1 acceptance packet refreshed at support/sidecars/G-1/G-1-SIDECAR-ACCEPTANCE.md. It now matches shared L0 with parent G-1 still backlog, sidecar G-1-SIDECAR-ACCEPTANCE in review under reviewer Codex2 with last_update=2026-04-17T20:25:37Z, captures the latest Codex2 -> Qwen -> Codex2 reassignment loop through the 2026-04-17T20:25:45Z superseded-worker event after the 2026-04-17T20:25:43Z codex review_ready_dispatch worker start, preserves the six empty supabase/functions child directories plus the adjacent empty migrations directory as the local baseline, keeps the no-Supabase-dependency and no-runtime-import evidence for low regression risk while treating the remaining Login.tsx Supabase copy as non-runtime text, and keeps G-3 build portability explicitly out of scope."
```

---

## 8) Historical Reviewer Actions

以下為 reviewer（`Codex2`）核准 / 退回時的命令範本；approval 已於 shared L0 記錄：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve G-1-SIDECAR-ACCEPTANCE "G-1 acceptance packet ready: it keeps machine truth aligned on parent backlog, correctly frames the task as deleting the residual supabase/functions scaffold instead of reopening FBP-006 cutover, captures the current empty-directory baseline and adjacent migrations observation without scope drift, preserves the low-regression repo evidence including no Supabase dependency or runtime imports, treats the remaining Login.tsx Supabase mention as non-runtime copy only, and keeps G-3 portability work out of scope."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen G-1-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / FBP-006-vs-local-baseline confusion / migrations scope drift / G-3 portability scope confusion / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done G-1-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for G-1 at support/sidecars/G-1/G-1-SIDECAR-ACCEPTANCE.md. The packet preserves the parent backlog snapshot, the residual supabase/functions empty-directory baseline in tenant-commute-hub, the low-regression delete framing, the adjacent migrations observation, the no-runtime-import evidence, and the reviewer handoff path without changing canonical truth."
```

Parent absorption / 主線採納仍由 parent owner `Codex` 視需要決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-04-17T15:48Z — 初版建立：依 shared L0 truth、`gap-phase2` planning、`FBP-006` cutover record、以及 local `../tenant-commute-hub` 掃描，整理 `G-1` 的 acceptance checklist、residual empty-directory baseline、`FBP-006` 對齊方式、`G-3` scope guard、與 reviewer handoff / closeout 指引。
- 2026-04-17T20:04Z — 對齊 shared L0：sidecar 狀態改為 `review`，補上 `last_update=2026-04-17T20:04:22Z` 與多次 reviewer 改派 / Qwen 401 後回到 `Codex2` 的交接歷史；同時重驗 `../tenant-commute-hub` 仍保留六個空 `supabase/functions/*` 子目錄、空的 `supabase/migrations/`，且 repo 仍無 Supabase 依賴或 `src` 引用。
- 2026-04-17T20:09Z — 再次刷新 shared L0：更新 sidecar `last_update=2026-04-17T20:08:27Z`，補進 `2026-04-17T20:07:40Z` 到 `20:08:36Z` 的 reviewer rebalance / Qwen 401 / worker-start 事件，內容維持 support-only，repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:15Z — 依最新 shared L0 再刷新：更新 sidecar `last_update=2026-04-17T20:14:01Z`，補進 `2026-04-17T20:12:33Z` 到 `20:14:10Z` 的 reviewer rebalance / Qwen 401 / worker-start 事件，並同步刷新 owner handoff 文案；support-only scope、repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:19Z — 再次對齊 shared L0：更新 sidecar `last_update=2026-04-17T20:18:27Z`，補進 `2026-04-17T20:17:19Z` 到 `20:18:35Z` 的 reviewer rebalance / Qwen 401 / worker-start 事件，並修正 reviewer 建議核准用語中的狀態描述為 `review`；support-only scope、repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:22Z — 依最新 shared L0 再刷新：更新 sidecar `last_update=2026-04-17T20:20:52Z`，補進 `2026-04-17T20:20:41Z` 到 `20:21:01Z` 的最新 reviewer reassignment / wake-up / worker-start 事件，並修正 repo evidence 說法為「無 Supabase dependency / 無 runtime-import 依賴」而非「無 src reference」；`Login.tsx` 仍有一段非 runtime 的 Supabase 說明文案，support-only scope、repo baseline 與 acceptance framing 其餘不變。
- 2026-04-17T20:26Z — 再次對齊 shared L0：更新 sidecar `last_update=2026-04-17T20:25:37Z`，補進 `2026-04-17T20:25:15Z` 到 `20:25:45Z` 的最新 reviewer reassignment / wake-up / worker-start / worker-superseded 事件，並同步刷新 handoff 與 reviewer 建議核准用語；support-only scope、repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:31Z — finalization refresh：shared L0 已前進到 `review_approved`，因此將 sidecar 狀態改寫為 `review_approved`、`last_update=2026-04-17T20:29:18Z`，補進 `2026-04-17T20:29:18Z` reviewer approval、`2026-04-17T20:29:20Z` superseded review worker、以及 `2026-04-17T20:29:29Z` 的 `owned_finalize_dispatch` wake-up / worker-start 與 pending `Codex2 -> Codex` finalize handoff；repo baseline 與 support-only acceptance framing 無變更。
