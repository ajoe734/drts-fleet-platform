# G-3 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `G-3` — `tenant-commute-hub`: CI/CD multi-repo checkout (修正 Lovable cloud build 失敗)  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex` / `(unset in machine truth)`  
**Last Revised:** `2026-04-17T23:15Z (UTC)`  
**Status:** `review_approved` — shared L0 currently keeps sidecar `G-3-SIDECAR-ACCEPTANCE` at `review_approved` under owner=`Codex`, reviewer=`Codex2`, `last_update=2026-04-17T23:14:31Z`, with `next=G-3 acceptance packet ready: it keeps machine truth aligned on the parent backlog blocker plus the current 2026-04-17T23:12:21Z Qwen -> Codex2 pending handoff row and the latest 2026-04-17T23:12:10Z-2026-04-17T23:12:30Z reviewer activity, correctly frames the task as tenant-repo build portability rather than G-1 cleanup or GAP-P2S3-008 settings work, captures the current sibling-path alias baseline, preserves the anti-duplication guardrail for contracts/api-client truth, and requires explicit portability evidence beyond local adjacency builds.`; `current-work.md` currently shows the pending `Codex2 -> Codex` owner-finalize handoff row created at `2026-04-17T23:14:31Z`, while the latest visible activity now extends through the `2026-04-17T23:14:33Z` prior worker-superseded event, the `2026-04-17T23:14:33Z` `owned_finalize_dispatch` wake-queued event, and the `2026-04-17T23:14:39Z` codex worker-start; the parent `G-3` remains `backlog` under owner=`Codex`, `priority=high`, `effort=S`, and no formal dependencies or assigned reviewer

---

## 1) Scope Boundary

本 sidecar 只整理 `G-3` 的 acceptance checklist、dependency map、shared-truth snapshot、repo evidence anchors 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務在 `tenant-commute-hub` 中實際修 workflow / Vite / path alias。

- In scope: support-only acceptance framing for the external `tenant-commute-hub` build portability fix, current repo baseline evidence, reviewer guardrails, and handoff / closeout commands.
- Out of scope: 修改 `drts-fleet-platform` 的 canonical contracts / service truth、重開 `FBP-006` authority cutover、把 `GAP-P2S3-008` driver-profile settings integration 吸進這個 task、或直接在此 sidecar 中實作 tenant repo workflow / stub / alias changes。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html`、`docs/02-architecture/consensus/gap-phase2-planning-20260417/*`、`docs/02-architecture/tenant-commute-hub-boundary.md`、`docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md`，以及目前 local `../tenant-commute-hub` checkout 掃描為準：

- 父任務 `G-3` 在 machine truth 中目前是 `backlog`，Owner=`Codex`，Reviewer unset，Summary 明確寫的是：
  - `GitHub Actions workflow 設定 multi-repo checkout，讓 vite alias @drts/api-client 在 CI 環境可用。Lovable cloud preview 目前完全失敗（blocking）。方案：src/lib/ 放精簡版 @drts/api-client stub + vite conditional alias`
- 本 sidecar `G-3-SIDECAR-ACCEPTANCE` 在 shared L0 中目前是 `status=review_approved`，Owner=`Codex`、Reviewer=`Codex2`、artifact path=`support/sidecars/G-3/G-3-SIDECAR-ACCEPTANCE.md`；task row 目前已更新到 `last_update=2026-04-17T23:14:31Z`，`next=G-3 acceptance packet ready: it keeps machine truth aligned on the parent backlog blocker plus the current 2026-04-17T23:12:21Z Qwen -> Codex2 pending handoff row and the latest 2026-04-17T23:12:10Z-2026-04-17T23:12:30Z reviewer activity, correctly frames the task as tenant-repo build portability rather than G-1 cleanup or GAP-P2S3-008 settings work, captures the current sibling-path alias baseline, preserves the anti-duplication guardrail for contracts/api-client truth, and requires explicit portability evidence beyond local adjacency builds.`，而 `current-work.md` 的 pending handoff row 目前顯示 `Codex2 -> Codex`、建立時間 `2026-04-17T23:14:31Z`。也就是說 packet 現在應反映 owner-finalize 快照，而不是先前 `2026-04-17T23:12:21Z` 的 reviewer-awaiting 快照。
- `ai-activity-log.jsonl` / `current-work.md` 顯示這個 reviewer lane 在 `2026-04-17T21:44:35Z` 被暫時改派成 `Codex2 -> Qwen`，並伴隨 stale-wake skip；其後在 `2026-04-17T21:44:41Z` 因 repeated Qwen 401 錯誤回退為 `Qwen -> Codex2`，接著又在 `2026-04-17T21:44:50Z` 重複出現 `Codex2 -> Qwen` claim 與 stale-wake skip，`2026-04-17T21:44:59Z` / `21:45:01Z` 有 Qwen wake 與 worker-start，但 reviewer run 最終在 `2026-04-17T21:45:16Z` 再次回退為 `Qwen -> Codex2`，並於 `2026-04-17T21:45:19Z` 重新 queue 給 `Codex2`、啟動 codex `review_ready_dispatch` worker-start。
- 在上述 reviewer bounce 之後，shared L0 先新增 `2026-04-17T21:47:24Z` 的 owner handoff、`2026-04-17T21:47:25Z` 的 prior `Codex2` worker superseded、與 `2026-04-17T21:47:27Z` 對 `Codex2` 的 wake + codex worker-start；其後在 `2026-04-17T21:51:13Z` 到 `22:13:10Z` 又重複出現 `Codex2 -> Qwen -> Codex2` reviewer bounce，包含 `2026-04-17T21:55:49Z` / `21:56:04Z` / `21:56:30Z` / `21:56:45Z` / `21:57:11Z` / `21:57:27Z` / `22:01:33Z` / `22:01:48Z` / `22:02:15Z` / `22:02:30Z` / `22:07:02Z` / `22:07:17Z` / `22:11:46Z` / `22:12:12Z` / `22:12:28Z` / `22:12:54Z` 的 repeated Qwen claim + stale-wake skip、`2026-04-17T21:56:09Z` / `21:56:50Z` / `21:57:37Z` / `22:01:53Z` / `22:02:35Z` / `22:07:22Z` / `22:11:51Z` / `22:12:32Z` 的 Qwen worker-start，以及 `2026-04-17T22:13:06Z` 的 fallback 回 `Codex2` 和 `2026-04-17T22:13:09Z` / `22:13:10Z` 的 renewed `Codex2` wake-start。
- `2026-04-17T22:18:01Z` 的 reviewer reopen 已在後續 owner 更新後先被機器真相覆寫回 `review`，而最新 reviewer lane 已於 `2026-04-17T23:14:31Z` 完成 review approval；該 approval 明確引用 `2026-04-17T23:12:21Z` 的 `Qwen -> Codex2` pending handoff row 與 `2026-04-17T23:12:10Z` 到 `23:12:30Z` 的 reassignment / worker-start evidence。依目前共享真相，`Codex2` 仍是指定 reviewer，但 task 已進入 owner-finalize state，而不是 reviewer-awaiting 或 owner 返工 state。
- accepted `gap-phase2` planning 已把 `G-3` 定位成 Sprint 2 的高優先 S 級 block-fix：
  - `consensus-packet.md` 明確把 `G-3` 列成 `tenant-commute-hub: CI/CD multi-repo checkout（Lovable cloud build 修正）`，並註記「Lovable cloud preview 完全失敗」是升級成阻斷任務的原因。
  - `review-round-3.md` 給出的短期解法是：讓 `tenant-commute-hub` 的 CI/CD 在能同時 checkout `drts-fleet-platform` 的環境執行；長期則改成 package distribution / submodule。
  - `review-round-4.md` 進一步提出最快 workaround：`src/lib/` 最小化 stub + `vite conditional alias`。
  - 但 `review-round-1.md` 同時留下關鍵 guardrail：build portability 不應靠 vendored `@drts/api-client` / `@drts/contracts` stub 變成第二份 contracts truth；它應先被建模成 package distribution / multi-repo checkout / build packaging 問題。
- `FBP-006` 與 boundary docs 已凍結 authority posture：
  - `FBP-006` 記錄 `tenant-commute-hub` 已切到 shared `@drts/api-client` / `@drts/contracts` 消費模式，且 local verification gate 在當時的相鄰 checkout 下已能 `npm run build`。
  - `tenant-commute-hub-boundary.md` 明確要求 repo B 是 pure UI consumer，不能產生第二份 domain / contract truth。
- 目前 local `../tenant-commute-hub` checkout 的實際 baseline 支撐「問題是 portability，不是功能 wiring 缺失」：
  - `vite.config.ts` 把 `@drts/api-client` 與 `@drts/contracts` alias 到 `../drts-fleet-platform/packages/*/src/index.ts`。
  - `tsconfig.app.json` 也用相同 sibling path 做 TypeScript `paths` mapping。
  - `src/lib/drtsApi.ts` 直接 `import { ApiClient } from "@drts/api-client"`；多個 page 直接 `import type {...} from "@drts/contracts"`，顯示 tenant repo 目前依賴 canonical packages 的 source-level adjacency。
  - `src/lib/` 目前只有 `drtsApi.ts`、`formatting.ts`、`utils.ts`，沒有任何本地 `@drts/api-client` / `@drts/contracts` stub。
  - `.github/workflows/` 目前只看到 `notify-core-on-feedback.yml`；沒有 build / preview / multi-repo checkout workflow baseline。
  - 在目前本機存在 sibling repo 的情況下，`cd ../tenant-commute-hub && npm run build` 仍然成功；這代表 local dev adjacency 目前可用，但不能證明雲端 preview / isolated CI 可用。

### Gap Summary

| 問題                                                                                                | 影響                                                                   | 根本原因                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tenant-commute-hub` build 依賴 `../drts-fleet-platform` sibling path                               | Lovable cloud preview / isolated CI 無法解析 alias，build 直接失敗     | tenant repo 假設 monorepo-style adjacency，但 repo B 是獨立 external repo                                    |
| machine truth summary 提到 `stub + conditional alias`，R1 guardrail 卻禁止 vendored duplicate truth | reviewer 可能不知道哪些 workaround 可接受                              | accepted planning 吸收了 workaround，但也保留了「不能建立第二份 canonical contracts/client truth」的設計約束 |
| tenant repo 現在沒有任何 build workflow baseline                                                    | parent owner 若只改 Vite/TS path，CI 仍沒有顯式 checkout / verify path | external repo 只有 feedback dispatch workflow，沒有建置路徑治理                                              |
| local build 仍成功                                                                                  | 容易被誤判成「沒有問題」                                               | 成功前提是本機剛好有 sibling `../drts-fleet-platform`，不是可攜式 build 證據                                 |
| `G-3` 與 `GAP-P2S3-008` 曾在 planning round 內共用 shorthand                                        | reviewer / owner 容易 scope drift                                      | review round 1 已指出 shorthand collision，需要明確切開 tenant portability vs driver-profile settings        |

### Repo Baseline Anchors

- Shared L0:
  - `ai-status.json` task rows for `G-3` and `G-3-SIDECAR-ACCEPTANCE`
  - `current-work.md` Active Slices / Delivery Layers / Latest Checkpoints
  - `ai-activity-log.jsonl` recent `G-3-SIDECAR-ACCEPTANCE` reassignment / wake entries
- Planning / governance anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md:16,48,93,115`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-1.md:149-164,198-227,266-303`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-3.md:121-149`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-4.md:65-77`
  - `docs/02-architecture/tenant-commute-hub-boundary.md`
  - `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md`
- External repo baseline:
  - `../tenant-commute-hub/vite.config.ts`
  - `../tenant-commute-hub/tsconfig.app.json`
  - `../tenant-commute-hub/src/lib/drtsApi.ts`
  - `../tenant-commute-hub/src/lib/`
  - `../tenant-commute-hub/.github/workflows/notify-core-on-feedback.yml`
  - `../tenant-commute-hub/package.json`

---

## 3) Parent Acceptance Framing

`G-3` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 accepted planning、shared truth 與 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Build portability must stop depending on implicit sibling-repo adjacency

- [ ] parent closeout 需明確消除 `tenant-commute-hub` 對 `../drts-fleet-platform/packages/*` 的隱性存在假設，至少要讓 CI / preview 有一條可重現的 canonical path。
- [ ] reviewer 不接受只在 owner 本機上 build 成功的 closeout；需要顯式證據證明「沒有本機 sibling repo 也能建置」或「workflow 會先 provision canonical packages」。
- [ ] 若 parent 採用 multi-repo checkout，應把 checkout / path wiring 視為 acceptance 主體，而不是只改 README 或口頭註解。

### AC-2 — Canonical contracts / client truth must remain single-source

- [ ] `tenant-commute-hub` 仍必須把 `drts-fleet-platform` 視為唯一 `@drts/api-client` / `@drts/contracts` authority，不能在 repo B 內形成第二份 canonical contracts 或 domain logic。
- [ ] reviewer 應優先接受 `review-round-3` 的 multi-repo checkout / package distribution 方向；若 parent 採用 task summary 或 `review-round-4` 提到的 `stub + conditional alias`，也必須驗證它只是 preview/build shim，而不是完整複製 canonical surface。
- [ ] 任何本地 fallback 都不得把 business enums、request/response shapes、或 domain command semantics 從 core repo 分叉出去。

### AC-3 — Fix must stay scoped to tenant-repo build packaging, not reopen authority or unrelated app tasks

- [ ] parent closeout 不應重開 `FBP-006` authority cutover，也不應要求修改 `drts-fleet-platform` 的 L1/L2 contract truth 來遷就 tenant repo build。
- [ ] reviewer 應確認 `G-3` 與 `G-1`（Supabase residual cleanup）仍分開，避免把 directory cleanup 或 Supabase deletion 重新混進 build portability task。
- [ ] reviewer 應確認 `G-3` 與 `GAP-P2S3-008`（driver-app settings → driver-profile API）仍分開，避免 shorthand collision 造成 acceptance 敘述跑偏。

### AC-4 — Verification must match the real deployment problem

- [ ] 至少保留一個本機相鄰 checkout build 證據，證明修正沒有破壞既有 local dev baseline。
- [ ] 另外至少補一個 portability-specific 證據：例如 GitHub Actions run、isolated checkout build、或等價的 preview/CI path 驗證。
- [ ] reviewer 不應接受只描述「理論上 StackBlitz 應該可用」而沒有任何具體 build-path evidence 的 closeout。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`G-3.depends_on=[]`。

| Dep    | Source      | Status | Notes                                                                                            |
| ------ | ----------- | ------ | ------------------------------------------------------------------------------------------------ |
| D-UP-1 | none formal | `n/a`  | `G-3` 在 `consensus-packet` 與 `ai-status.json` 都是無 formal dependency 的 Sprint 2 blocker fix |

### Practical Review Dependencies

| Dep   | Type                                   | Why It Matters                                                                                                          |
| ----- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| D-P-1 | accepted `gap-phase2` consensus packet | 凍結 `G-3` 的 machine-truth title、priority、effort、以及它是 Sprint 2 blocker 的地位                                   |
| D-P-2 | `review-round-3`                       | 提供 multi-repo checkout 作為首選短期解法，並把長期方向定義為 package distribution / submodule                          |
| D-P-3 | `review-round-4`                       | 解釋為何 `G-3` 從建議升級成阻斷性問題，並留下 `stub + conditional alias` workaround 來源                                |
| D-P-4 | `review-round-1`                       | reviewer guardrail：不能把 build portability 修成第二份 contracts/api-client truth，也不能再混淆 `G-3` shorthand        |
| D-P-5 | `tenant-commute-hub-boundary.md`       | repo B 是 pure UI consumer；任何 workaround 都不能讓 repo B 擁有新的 authority                                          |
| D-P-6 | `FBP-006` cutover record               | 證明 tenant repo 已依 shared client/contracts consumption 運作；`G-3` 是 portability follow-up，不是 authority rollback |
| D-P-7 | local `tenant-commute-hub` baseline    | `vite.config.ts` / `tsconfig.app.json` / imports / missing workflow 共同證明問題的實際位置                              |
| D-P-8 | local build evidence                   | 說明「現在本機可 build」不等於「雲端 preview 可 build」，協助 reviewer 避免假陽性 closeout                              |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
  - `docs-site/index.html`
- Planning / governance anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-1.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-3.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-4.md`
  - `docs/02-architecture/tenant-commute-hub-boundary.md`
  - `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md`
- External repo anchors:
  - `../tenant-commute-hub/package.json`
  - `../tenant-commute-hub/vite.config.ts`
  - `../tenant-commute-hub/tsconfig.app.json`
  - `../tenant-commute-hub/src/lib/drtsApi.ts`
  - `../tenant-commute-hub/src/pages/*`
  - `../tenant-commute-hub/.github/workflows/notify-core-on-feedback.yml`

---

## 5) Evidence Inventory

| ID   | Evidence                                                        | Expected Anchor                                                                                    |
| ---- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                                  | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                                       |
| E-2  | `G-3` is accepted as a Sprint 2 blocker task                    | `consensus-packet.md:16,48,93`                                                                     |
| E-3  | multi-repo checkout is the intended short-term fix              | `review-round-3.md:121-149`                                                                        |
| E-4  | blocking impact + stub workaround source                        | `review-round-4.md:65-77`                                                                          |
| E-5  | anti-duplication guardrail                                      | `review-round-1.md:149-164,198-227,266-303`                                                        |
| E-6  | Vite alias hard-codes sibling core repo paths                   | `../tenant-commute-hub/vite.config.ts`                                                             |
| E-7  | TS compile path also hard-codes sibling core repo paths         | `../tenant-commute-hub/tsconfig.app.json`                                                          |
| E-8  | Tenant runtime currently imports canonical client directly      | `../tenant-commute-hub/src/lib/drtsApi.ts`                                                         |
| E-9  | Tenant pages currently import canonical contract types directly | `../tenant-commute-hub/src/pages/*`                                                                |
| E-10 | No build / checkout workflow baseline exists yet                | `../tenant-commute-hub/.github/workflows/notify-core-on-feedback.yml` is the only visible workflow |
| E-11 | Local build still succeeds with sibling repo present            | `cd ../tenant-commute-hub && npm run build`                                                        |
| E-12 | Repo B must stay pure UI consumer                               | `tenant-commute-hub-boundary.md`, `FBP-006` cutover spec                                           |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `G-3` 仍是 `backlog`、無 formal deps、無 reviewer；sidecar 目前已是 owner=`Codex` / reviewer=`Codex2` 的 `review_approved` snapshot，`last_update=2026-04-17T23:14:31Z`，`next` 是 reviewer 的 acceptance summary，`current-work.md` 的 pending handoff row 是 `Codex2 -> Codex @ 2026-04-17T23:14:31Z`，而該 approval 所引用的 reviewer 鏈則延伸到 `2026-04-17T23:12:10Z` wake-queued、`2026-04-17T23:12:12Z` Qwen worker-start、`2026-04-17T23:12:27Z` fallback、以及 `2026-04-17T23:12:30Z` Codex2 wake-queued + worker-start。
2. acceptance framing 是否把 `G-3` 鎖定在 `tenant-commute-hub` 的 build portability / CI packaging 修正，而不是誤寫成 `G-1` cleanup 或 `GAP-P2S3-008` driver-profile settings integration。
3. packet 是否清楚呈現 accepted planning 裡的 tension：task summary / R4 提到 `stub + conditional alias`，但 R1 明確禁止把 tenant repo 變成第二份 contracts/client truth。
4. packet 是否把真正的 failure mode 定位成「repo adjacency 假設」，而不是錯誤宣稱 tenant repo 本身現在就 build 壞掉；local build success 只能算 baseline，不算 portability closeout。
5. packet 是否要求 portability-specific verification，而不是接受只有本機相鄰 checkout 的 build evidence。
6. support artifact 是否完全沒有修改 canonical truth、核心 contracts、或主線 runtime。

**建議核准用語：**

> `G-3 acceptance packet ready: it keeps machine truth aligned on the parent backlog blocker plus the current 2026-04-17T23:12:21Z Qwen -> Codex2 pending handoff row and the latest 2026-04-17T23:12:10Z-2026-04-17T23:12:30Z reviewer activity, captures the real tenant-repo baseline where vite/tsconfig hard-code ../drts-fleet-platform and local build only succeeds when that sibling repo is present, preserves the review-round guardrail against creating a second contracts/api-client truth, and frames acceptance around explicit CI/build portability evidence rather than local-only success.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / G-1 or GAP-P2S3-008 scope drift / under-specified stub guardrail / missing portability-specific verification requirement / support-scope violation]`

---

## 7) Handoff Command

Owner（`Codex`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff G-3-SIDECAR-ACCEPTANCE Codex2 "G-3 acceptance packet refreshed at support/sidecars/G-3/G-3-SIDECAR-ACCEPTANCE.md. It now matches shared L0 with parent G-3 still backlog under Codex, sidecar G-3-SIDECAR-ACCEPTANCE in review under reviewer Codex2 with the pending Qwen -> Codex2 handoff row created at 2026-04-17T23:12:21Z, captures the latest 2026-04-17T23:12:10Z-2026-04-17T23:12:30Z Codex2<->Qwen reassignment / worker-start loop ending in the 2026-04-17T23:12:27Z fallback to Codex2 plus the matching 2026-04-17T23:12:30Z wake queued and worker-start, preserves the tenant-repo sibling-path alias baseline and anti-duplication guardrail, and keeps acceptance anchored on portability-specific CI/build evidence rather than local-only success."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve G-3-SIDECAR-ACCEPTANCE "G-3 acceptance packet ready: it keeps machine truth aligned on the parent backlog blocker plus the current 2026-04-17T23:12:21Z Qwen -> Codex2 pending handoff row and the latest 2026-04-17T23:12:10Z-2026-04-17T23:12:30Z reviewer activity, correctly frames the task as tenant-repo build portability rather than G-1 cleanup or GAP-P2S3-008 settings work, captures the current sibling-path alias baseline, preserves the anti-duplication guardrail for contracts/api-client truth, and requires explicit portability evidence beyond local adjacency builds."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen G-3-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / G-1 or GAP-P2S3-008 scope drift / under-specified stub guardrail / missing portability-specific verification requirement / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done G-3-SIDECAR-ACCEPTANCE "Owner finalized the approved support-only acceptance packet for G-3 at support/sidecars/G-3/G-3-SIDECAR-ACCEPTANCE.md. The packet preserves the parent backlog blocker snapshot, the tenant-repo sibling-path alias/workflow baseline, the anti-duplication guardrail for canonical contracts/api-client truth, and the reviewer handoff path without changing canonical truth."
```

Parent absorption / 主線採納仍由 parent owner `Codex` 視需要決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-04-17T23:15Z — 對齊最新 shared L0：把 packet 從 `review` reviewer-awaiting 快照刷新成目前 `review_approved` / owner-finalize 快照，更新 sidecar `last_update=2026-04-17T23:14:31Z`、pending handoff row `Codex2 -> Codex @ 2026-04-17T23:14:31Z`，並補進 `2026-04-17T23:14:33Z` worker-superseded、`2026-04-17T23:14:33Z` owned_finalize_dispatch wake、與 `2026-04-17T23:14:39Z` codex worker-start 事件；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T23:16Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T23:12:21Z`，補進 `2026-04-17T23:12:10Z` 到 `23:12:30Z` 的 renewed Qwen wake / worker-start / 401 fallback / Codex2 wake-queued + worker-start 事件，並把頂部 status、reviewer hotspot、approve 文案與 handoff 文案更新到目前 `Qwen -> Codex2` reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T23:08Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T23:06:12Z`，補進 `2026-04-17T23:05:25Z` 到 `23:06:20Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / Qwen worker-start / 401 fallback / renewed `Codex2` wake-queued + worker-start 事件，並把頂部 status、reviewer hotspot、approve 文案與 handoff 文案更新到目前 `Qwen -> Codex2` reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T23:01Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T23:00:20Z`，補進 `2026-04-17T22:59:05Z` 到 `23:00:26Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / 401 fallback / renewed `Codex2` wake-queued + worker-start 事件，並把頂部 status、reviewer hotspot、approve 文案與 handoff 文案更新到目前 `Qwen -> Codex2` reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:55Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T22:54:14Z`，補進 `2026-04-17T22:53:41Z` 到 `22:54:23Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / Qwen wake / worker-start / 401 fallback / renewed `Codex2` wake-start 事件，並把頂部 status、reviewer hotspot、approve 文案與 handoff 文案更新到目前 `Qwen -> Codex2` reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:50Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T22:49:17Z`，補進 `2026-04-17T22:49:06Z` 到 `22:49:33Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / Qwen wake / worker-start / 401 fallback / renewed `Codex2` wake-start 事件，並把頂部 status、reviewer hotspot、approve 文案與 handoff 文案更新到目前 `Qwen -> Codex2` reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:45Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T22:43:50Z`，補進 `2026-04-17T22:43:09Z` 到 `22:44:05Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / worker-start / 401 fallback / renewed `Codex2` wake-start 事件，並把頂部 status、reviewer hotspot、approve 文案與 handoff 文案更新到目前 `Qwen -> Codex2` reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:39Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T22:38:38Z`，補進 `2026-04-17T22:37:45Z` 到 `22:38:53Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / worker-start / 401 fallback / renewed `Codex2` wake-start 事件，並把頂部 status、reviewer hotspot、approve 文案與 handoff 文案更新到目前 `Qwen -> Codex2` reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:34Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T22:33:24Z`，補進 `2026-04-17T22:32:49Z` 到 `22:33:33Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / worker-start / 401 fallback / renewed `Codex2` wake-start 事件，並把頂部 status、reviewer hotspot、approve 文案與 handoff 文案更新到目前 `Qwen -> Codex2` reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T16:21Z — 初版建立：依 shared L0 truth、accepted `gap-phase2` planning、`review-round-1/3/4` 的 scope/guardrail、`tenant-commute-hub` boundary/cutover docs、以及 local `../tenant-commute-hub` 的 alias/workflow/build baseline，整理 `G-3` 的 acceptance checklist、dependency map、reviewer hotspots、與 handoff / closeout 指引。
- 2026-04-17T20:17Z — 依最新 shared L0 再刷新：sidecar 狀態改為 `review`，補上 `last_update=2026-04-17T20:16:17Z` 與 `2026-04-17T20:15:18Z` 到 `20:16:25Z` 的 reviewer rebalance / Qwen 401 / worker-start / worker-superseded 事件，並同步刷新 handoff / approve 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:24Z — 再次對齊 shared L0：刷新 sidecar `last_update=2026-04-17T20:23:13Z`，補進 `2026-04-17T20:22:33Z` 到 `20:23:28Z` 的 reviewer rebalance / Qwen 401 / wake / worker-start 事件，並同步更新 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:31Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T20:29:20Z`，補進 `2026-04-17T20:28:48Z` 到 `20:29:29Z` 的 Qwen claim / 401 / reassignment / codex worker-start 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:36Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T21:34:19Z`，補進 `2026-04-17T21:33:30Z` 到 `21:34:28Z` 的 reviewer rebalance / stale-wake skip / Qwen worker-start / 401 fallback / codex worker-start 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:34Z — 再次對齊 shared L0：刷新 sidecar `last_update=2026-04-17T20:33:38Z`，補進 `2026-04-17T20:32:44Z` 到 `20:33:46Z` 的 repeated Qwen claim / 401 / reassignment / worker-start / worker-superseded 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:38Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T20:37:28Z`，補進 `2026-04-17T20:36:17Z` 到 `20:37:36Z` 的 repeated Qwen claim / stale-wake skip / 401 / reassignment / worker-start 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:43Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T20:42:18Z`，補進 `2026-04-17T20:41:38Z` 到 `20:42:33Z` 的 repeated Qwen claim / stale-wake skip / 401 / reassignment / worker-start 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:45Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T20:44:48Z`，補進 `2026-04-17T20:44:37Z` 到 `20:44:56Z` 的 `Codex2 -> Qwen -> Codex2` reassignment / wake / worker-start / worker-superseded 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:50Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T20:48:27Z`，補進 `2026-04-17T20:47:47Z` 到 `20:48:42Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / 401 / wake / worker-start 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:54Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T20:52:57Z`，補進 `2026-04-17T20:52:23Z` 到 `20:53:06Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / 401 / wake / worker-start / worker-superseded 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T20:58Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T20:57:36Z`，補進 `2026-04-17T20:56:40Z` 到 `20:57:45Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / 401 / wake / worker-start / worker-superseded 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:02Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T21:01:31Z`，補進 `2026-04-17T21:01:03Z` 到 `21:01:40Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / 401 / wake / worker-start / worker-superseded 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:06Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T21:04:33Z`，補進 `2026-04-17T21:04:22Z` 到 `21:04:41Z` 的 temporary `Codex2 -> Qwen -> Codex2` bounce、wake、worker-start、worker-superseded、以及 Qwen 401 回退後的 codex reviewer wake / worker-start 事件，並同步更新 status 摘要與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:09Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T21:08:17Z`，補進 `2026-04-17T21:07:31Z` 到 `21:08:26Z` 的 repeated `Codex2 -> Qwen -> Codex2` reassignment / stale-wake skip / Qwen worker-start / 401 fallback / Codex2 wake / codex worker-start 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:13Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T21:12:21Z`，補進 `2026-04-17T21:11:24Z` 到 `21:12:29Z` 的 repeated `Codex2 -> Qwen -> Codex2` reassignment / stale-wake skip / Qwen worker-start / 401 fallback / Codex2 wake / codex worker-start / Qwen worker-superseded 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:18Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T21:17:25Z`，補進 `2026-04-17T21:16:48Z` 到 `21:17:34Z` 的 repeated `Codex2 -> Qwen -> Codex2` reassignment / stale-wake skip / Qwen worker-start / 401 fallback / Codex2 wake / codex worker-start 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:24Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T21:23:04Z`，補進 `2026-04-17T21:22:21Z` 到 `21:23:13Z` 的 repeated `Codex2 -> Qwen -> Codex2` fallback / stale-wake skip / Qwen worker-start / 401 fallback / Codex2 wake / codex worker-start 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:28Z — 依最新 shared L0 再刷新：刷新 sidecar `last_update=2026-04-17T21:28:05Z`，補進 `2026-04-17T21:26:09Z` 到 `21:28:13Z` 的 repeated `Codex2 -> Qwen -> Codex2` reviewer claim / stale-wake skip / Qwen worker-start / 401 fallback / Codex2 wake / codex worker-start 事件，並同步更新 status 摘要與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:40Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T21:39:11Z`，補進 `2026-04-17T21:38:57Z` 到 `21:39:19Z` 的 temporary `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / Qwen worker-start / 401 fallback / Codex2 wake / codex worker-start / Qwen worker-superseded 事件，並同步更新 reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:47Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T21:45:11Z`，補進 `2026-04-17T21:44:35Z` 到 `21:45:19Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / Qwen worker-start / 401 fallback / Codex2 wake / codex worker-start 事件，並同步更新 status 摘要、reviewer hotspot 與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:49Z — 再次對齊 shared L0：補進 `2026-04-17T21:47:24Z` 到 `21:47:27Z` 的 owner handoff / prior worker-superseded / renewed `Codex2` wake-start 事件，並把 status 摘要、reviewer hotspot 與 handoff 文案更新到最新 reviewer-awaiting snapshot；之後以 `2026-04-17T21:49:18Z` 正式重送 handoff 給 `Codex2`，讓 machine truth 與 handoff queue 回到一致的 reviewer state。support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:28Z — 對齊最新 shared L0：刷新 sidecar `last_update=2026-04-17T22:27:55Z`，補進 `2026-04-17T22:26:02Z` 到 `22:28:09Z` 的 repeated `Codex2 -> Qwen -> Codex2` auto-reassign / stale-wake skip / worker-start 事件，並把頂部 status、reviewer hotspot、approve 文案與 handoff 文案更新到目前 `Qwen -> Codex2` reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:23Z — 對齊最新 shared L0：把 packet 從先前 `2026-04-17T22:18:01Z` reopen 後的 owner 返工快照刷新成目前 `status=review`、`last_update=2026-04-17T22:23:16Z` 的 reviewer-awaiting 快照，補進 `2026-04-17T22:22:20Z` 到 `22:23:24Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / worker-start / 401 fallback / superseded 事件，並同步更新 reviewer hotspot、approve 文案與 handoff 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:53Z — 再次對齊 shared L0：刷新 sidecar `last_update=2026-04-17T21:52:47Z`，補進 `2026-04-17T21:51:13Z` 到 `21:52:57Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / Qwen worker-start / 401 fallback / renewed `Codex2` wake-start 事件，並同步更新 status 摘要、reviewer hotspot、與 handoff / approve 文案到最新 reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T21:58Z — 再次對齊 shared L0：刷新 sidecar `last_update=2026-04-17T21:57:47Z`，補進 `2026-04-17T21:55:49Z` 到 `21:57:56Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / Qwen worker-start / 401 fallback / renewed `Codex2` wake-start 事件，並同步更新 status 摘要、reviewer hotspot、與 handoff 文案到最新 reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:03Z — 再次對齊 shared L0：刷新 sidecar `last_update=2026-04-17T22:02:56Z`，補進 `2026-04-17T22:01:33Z` 到 `22:03:12Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / Qwen worker-start / 401 fallback / renewed `Codex2` wake-start 事件，並同步更新 status 摘要、reviewer hotspot、與 handoff 文案到最新 reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:08Z — 再次對齊 shared L0：刷新 sidecar `last_update=2026-04-17T22:07:37Z`，補進 `2026-04-17T22:07:02Z` 到 `22:07:45Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / Qwen worker-start / 401 fallback / renewed `Codex2` wake-start / Qwen worker-superseded 事件，並同步更新 pending handoff row、reviewer hotspot、與 handoff / approve 文案到最新 reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:13Z — 再次對齊 shared L0：刷新 sidecar `last_update=2026-04-17T22:13:00Z`，補進 `2026-04-17T22:11:46Z` 到 `22:13:10Z` 的 repeated `Codex2 -> Qwen -> Codex2` claim / stale-wake skip / Qwen worker-start / 401 fallback / renewed `Codex2` wake-start 事件，並同步更新 pending handoff row、reviewer hotspot、與 handoff / approve 文案到最新 reviewer-awaiting snapshot；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
- 2026-04-17T22:18Z — 依 reviewer reopen 指示刷新 shared L0：把 sidecar 頂部狀態改成目前的 `in_progress` / `last_update=2026-04-17T22:18:01Z` owner-return snapshot，補進 reviewer 指定的 `2026-04-17T22:16:44Z` handoff comparison point、`2026-04-17T22:16:50Z` / `22:16:52Z` review activity、以及 `2026-04-17T22:18:01Z` reopen 後 `22:18:03Z` worker-superseded、`22:18:06Z` owner wake-start 事件，並同步更新 reviewer hotspot 與 handoff / approve 文案；support-only scope、tenant repo baseline 與 acceptance framing 無變更。
