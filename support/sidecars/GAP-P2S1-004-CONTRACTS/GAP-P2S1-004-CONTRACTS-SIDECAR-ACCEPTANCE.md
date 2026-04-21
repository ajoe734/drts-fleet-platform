# GAP-P2S1-004-CONTRACTS Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S1-004-CONTRACTS` — contracts: `DriverProfileRecord` + `CreateDriverProfileCommand` + `UpdateDriverProfileCommand`  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex` / `(unassigned)`  
**Last Revised:** `2026-04-17T12:16Z (UTC)`  
**Status:** `review_approved`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S1-004-CONTRACTS` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- In scope: support-only acceptance framing, contracts gap baseline, downstream dependency mapping, reviewer checklist.
- Out of scope: `@drts/contracts` 主線變更、`apps/api/src/modules/driver-profile/` runtime 實作、`apps/driver-app/app/settings.tsx` wiring、或直接改寫 machine truth。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S1-004-CONTRACTS` 在 machine truth 中仍是 `backlog`，Owner=`Codex`，沒有 formal `depends_on` blocker。
- 下游 `GAP-P2S1-004-API` 在 machine truth 中仍是 `blocked`，唯一 formal blocker 就是 `GAP-P2S1-004-CONTRACTS`。
- 再下游 `GAP-P2S3-008` 仍 blocked on `GAP-P2S1-004-API`，因此這份 contracts packet 只負責整理第一段 unblocking prerequisite，不把 API 或 app wiring 提前算進完成態。
- 本 sidecar `GAP-P2S1-004-CONTRACTS-SIDECAR-ACCEPTANCE` 目前在 shared L0 中為 `review_approved`，Owner=`Codex2`、Reviewer=`Codex`、artifact path=`support/sidecars/GAP-P2S1-004-CONTRACTS/GAP-P2S1-004-CONTRACTS-SIDECAR-ACCEPTANCE.md`、`last_update=2026-04-17T12:16:01Z`。
- `ai-activity-log.jsonl` 顯示近期流轉已完成 reviewer approval，現況只差 owner formal closeout：
  - `2026-04-17T12:04:41Z`：Qwen worker 曾被啟動處理此 sidecar。
  - `2026-04-17T12:04:54Z`：因 Qwen token failure，review/owner routing 被 auto-reassigned。
  - `2026-04-17T12:07:29Z`：Orchestrator 記錄 availability-first reassignment，owner 從 `Codex` 轉成 `Codex2`，reviewer 轉為 `Codex`。
  - `2026-04-17T12:09:19Z`：先前 worker 被 superseded，優先處理較高優先 review/finalize 工作。
  - `2026-04-17T12:12:51Z`：`Codex2` 已正式 handoff 給 reviewer `Codex`。
  - `2026-04-17T12:16:01Z`：shared L0 已記錄本 sidecar 進入 `review_approved`。
  - `2026-04-17T12:16:06Z` 與 `2026-04-17T12:16:26Z`：Orchestrator 對 `Codex2` 發出 `owned_finalize_dispatch`，表示目前是 owner closeout 階段。
- planning anchors 已把這個 slice 定義成 contracts-first prerequisite：
  - `consensus-packet.md` 把 `GAP-P2S1-004` 拆成 `GAP-P2S1-004-CONTRACTS` 與 `GAP-P2S1-004-API`，而後者正式 blocked on 前者。
  - `review-round-2.md` 明示 driver profile 需要新的 contracts 型別，並建議 profile 與 regulatory ownership 分離。
  - `review-round-4.md` 再次強調若沒有 contracts-first sequencing，Codex 與 Qwen 可能平行做出不相容版本。
  - `starter-draft.md` 把根因寫成 `apps/api/src/modules/driver-profile/` 不存在，並拆成 profile module 與 driver-app wiring 兩段。
- `docs-site/index.html` 只是 supervisor dashboard shell，對本 task 沒有額外產品語意。

### Repo Baseline Anchors

- [`packages/contracts/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:1642) 目前 driver-domain 區塊只有 incident / maintenance / shift-attendance / driver-settings contracts；尚未出現 `DriverProfileRecord`、`CreateDriverProfileCommand`、`UpdateDriverProfileCommand`。
- `apps/api/src/modules/driver-profile/` 目錄目前不存在，表示下游 API module 尚未開始，contracts slice 仍是 formal unblocking prerequisite。
- [`apps/api/src/app.module.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:17) 目前匯入 `DriverSettingsModule` 與 [`apps/api/src/app.module.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:29) 的 `RegulatoryRegistryModule`，沒有 `DriverProfileModule`。
- [`apps/api/src/modules/driver-settings/driver-settings.controller.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/driver-settings/driver-settings.controller.ts:20) / [`driver-settings.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/driver-settings/driver-settings.service.ts:37) 目前只提供偏好設定欄位：`language`、`notificationsEnabled`、`autoAcceptEnabled`、`maxAcceptRadius`、`preferredAreas`。
- [`apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:59) 的 `DriverRegistryRecord` seed 目前只含 `driverId`、`name`、`supportedServiceBuckets`、`workState`、`licensesValid`，符合 read-only registry baseline。
- [`packages/api-client/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/api-client/src/index.ts:1150) 目前只有 `getDriverSettings` / `updateDriverSettings`，尚無 `driver-profile` client method。
- [`apps/driver-app/app/settings.tsx`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/settings.tsx:28) 與 [`apps/driver-app/app/settings.tsx`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/settings.tsx:49) 仍直接讀寫 `driver-demo-001` 的 `driver-settings` API，這是 downstream legacy baseline，不是 `GAP-P2S1-004-CONTRACTS` 的完成證據。
- [`apps/api/src/common/auth/auth.policy.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/common/auth/auth.policy.ts:235) 目前只有 `regulatory-registry` 的路由策略錨點；尚無任何 `driver-profile` route policy。

結論：repo 目前還沒有任何正式的 `driver-profile` contracts 或 module surface。這個 parent slice 的任務就是先在 `@drts/contracts` 中建立可供 API 與 app 後續共用的 profile 型別與 create/update command boundary。

---

## 3) Parent Acceptance Framing

`GAP-P2S1-004-CONTRACTS` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 shared truth、planning 錨點與 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Contracts-first prerequisite remains explicit

- [ ] `GAP-P2S1-004-CONTRACTS` 被描述為 `GAP-P2S1-004-API` 的唯一 formal blocker，不與其他非正式依賴混淆。
- [ ] closeout / reviewer wording 不得把下游 API module 或 `settings.tsx` wiring 說成已屬本 task 完成範圍。
- [ ] reviewer 能從 packet 看出這一 slice 的目標是建立 shared contracts boundary，供後續 API 與 app 同步使用。

### AC-2 — New driver-profile contracts actually exist in `@drts/contracts`

- [ ] `packages/contracts/src/index.ts` 新增 `DriverProfileRecord`。
- [ ] `packages/contracts/src/index.ts` 新增 `CreateDriverProfileCommand` 與 `UpdateDriverProfileCommand`，而不是在 API module 內自定本地 interface。
- [ ] 新型別需可表達 review-round-2 所要求的 profile ownership，而不是沿用 `DriverSettings` 或 `DriverRegistryRecord` 當替代品。

### AC-3 — Ownership boundary matches planning consensus

- [ ] `DriverProfileRecord` 與 commands 應承接 profile/self-service 欄位，例如 review-round-2 指名的 name、contact、photo、emergency contact、bank account。
- [ ] `regulatory-registry` 仍保有 compliance / workState / service buckets authority，不應被塞進 profile contracts。
- [ ] `driver-settings` 的偏好設定欄位仍與 profile contracts 分開，不在 packet 中被誤寫成等同 profile domain。

### AC-4 — Downstream readiness is enabled but not over-claimed

- [ ] `GAP-P2S1-004-API` 可在 contracts 合併後安全引用正式型別，不必自行猜測 payload shape。
- [ ] `GAP-P2S3-008` 仍被描述為後續 app wiring，直到 API slice 完成前都不是本 task 的完成證據。
- [ ] reviewer handoff 要點名目前 repo 裡哪些 surface 是 legacy baseline，哪些才會在 contracts task 完成後變成可用依賴。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`GAP-P2S1-004-CONTRACTS.depends_on=[]`。

| Dep    | Source | Status | Notes                                      |
| ------ | ------ | ------ | ------------------------------------------ |
| D-UP-1 | none   | `n/a`  | parent contracts slice 沒有 formal blocker |

### Formal Downstream Dependencies

| Dep      | Source             | Status    | Notes                                                       |
| -------- | ------------------ | --------- | ----------------------------------------------------------- |
| D-DOWN-1 | `GAP-P2S1-004-API` | `blocked` | API driver-profile module 的唯一 formal blocker             |
| D-DOWN-2 | `GAP-P2S3-008`     | `blocked` | driver-app settings wiring 仍 blocked on `GAP-P2S1-004-API` |

### Practical Review Dependencies

| Dep   | Type                                  | Why It Matters                                                                               |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| D-P-1 | Planning consensus                    | 鎖定 contracts-first sequencing 與 profile-vs-registry boundary                              |
| D-P-2 | Existing driver-settings baseline     | 幫 reviewer 分辨既有偏好設定並非 profile contracts 完成證據                                  |
| D-P-3 | Existing regulatory-registry baseline | 幫 reviewer 鎖定 compliance/workState 不該被混入 profile contracts                           |
| D-P-4 | Downstream API/app consumers          | 說明 contracts shape 會被 API module 與 `settings.tsx` wiring 使用，但兩者都不是本 task 本身 |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/review-round-2.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/review-round-4.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/starter-draft.md`
- Repo anchors:
  - `packages/contracts/src/index.ts`
  - `apps/api/src/app.module.ts`
  - `apps/api/src/modules/driver-settings/*`
  - `apps/api/src/modules/regulatory-registry/*`
  - `packages/api-client/src/index.ts`
  - `apps/driver-app/app/settings.tsx`
  - `apps/api/src/common/auth/auth.policy.ts`

---

## 5) Evidence Inventory

| ID   | Evidence                                         | Expected Anchor                                                                                                   |
| ---- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                   | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                                                      |
| E-2  | Root-cause split into module + app wiring        | `starter-draft.md:214-224`                                                                                        |
| E-3  | Contracts-first dependency chain                 | `consensus-packet.md:47-48,88,107-109`                                                                            |
| E-4  | Profile ownership recommendation                 | `review-round-2.md:75-110`                                                                                        |
| E-5  | Sequencing risk if contracts are skipped         | `review-round-4.md:97-105`                                                                                        |
| E-6  | Contracts gap baseline                           | `packages/contracts/src/index.ts:1642+` has no driver-profile types yet                                           |
| E-7  | Missing API module baseline                      | `apps/api/src/modules/driver-profile/` absent; `apps/api/src/app.module.ts` has no `DriverProfileModule`          |
| E-8  | Driver-settings legacy baseline                  | `driver-settings.controller.ts`, `driver-settings.service.ts`, `settings.tsx`, `packages/api-client/src/index.ts` |
| E-9  | Registry authority baseline                      | `regulatory-registry.service.ts:59-80`                                                                            |
| E-10 | Auth surface still missing driver-profile policy | `auth.policy.ts:235-248`                                                                                          |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：`GAP-P2S1-004-CONTRACTS` 本身沒有 formal blocker，而 `GAP-P2S1-004-API` 的唯一 formal blocker 就是它。
2. acceptance framing 是否真的聚焦在 `@drts/contracts` 新增 `DriverProfileRecord` 與 create/update commands，而不是偷渡 API/module scope。
3. profile / driver-settings / regulatory-registry 三條邊界是否清楚分開，沒有把不同 domain record 混成單一 source-of-truth。
4. downstream `GAP-P2S1-004-API` 與 `GAP-P2S3-008` 是否只被描述成 consumers / follow-up，而不是本 task 的完成證據。
5. support artifact 是否完全沒有修改 canonical truth 或主線 runtime 實作。

**建議核准用語：**

> `GAP-P2S1-004-CONTRACTS acceptance packet ready: machine truth still keeps the contracts slice as the sole formal blocker for GAP-P2S1-004-API, the packet correctly frames the repo baseline as missing driver-profile types and module surfaces, preserves the profile-vs-settings-vs-registry ownership boundary from planning, and packages a reviewer-usable contracts-first checklist without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / contracts scope drift / ownership-boundary misclassification / downstream overclaim]`

---

## 7) Handoff Command

Owner（`Codex2`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff GAP-P2S1-004-CONTRACTS-SIDECAR-ACCEPTANCE Codex "GAP-P2S1-004-CONTRACTS acceptance packet ready at support/sidecars/GAP-P2S1-004-CONTRACTS/GAP-P2S1-004-CONTRACTS-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on the contracts slice as the sole formal blocker for GAP-P2S1-004-API, captures the current missing driver-profile contracts/module baseline, preserves the profile-vs-settings-vs-registry ownership boundary from planning, and gives a reviewer-usable contracts-first checklist without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S1-004-CONTRACTS-SIDECAR-ACCEPTANCE "GAP-P2S1-004-CONTRACTS acceptance packet ready: machine truth still keeps this contracts slice as the sole formal blocker for GAP-P2S1-004-API, the repo baseline is correctly framed as missing driver-profile types and module surfaces, the profile-vs-settings-vs-registry boundary stays aligned with planning, and the packet remains support-only."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S1-004-CONTRACTS-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / contracts scope drift / ownership-boundary misclassification / downstream overclaim]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Codex2`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex2 python3 scripts/ai_status.py done GAP-P2S1-004-CONTRACTS-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S1-004-CONTRACTS at support/sidecars/GAP-P2S1-004-CONTRACTS/GAP-P2S1-004-CONTRACTS-SIDECAR-ACCEPTANCE.md. The packet preserves the contracts-first dependency chain, the current missing driver-profile contracts baseline, and the reviewer handoff path without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17T12:16Z — owner finalize sync: packet header與 Section 2 更新到 shared L0 的 `review_approved` 快照，補入 reviewer handoff 與 owner finalize dispatch 現況。
- 2026-04-17T12:14Z — reviewer sync: packet header aligned with machine truth after owner handoff moved the sidecar into `review`.
- 2026-04-17T12:17Z — 初版建立：依共享 machine truth、planning consensus 與 repo 掃描，整理 `GAP-P2S1-004-CONTRACTS` 的 acceptance checklist、dependency map、contracts gap baseline、以及 reviewer handoff 指引。
