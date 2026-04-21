# GAP-P2S1-004-API Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S1-004-API` — api: driver-profile module (blocked on GAP-P2S1-004-CONTRACTS)  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Qwen` / `(unassigned)`  
**Last Revised:** `2026-04-17 (UTC)`  
**Status:** `REVIEW_APPROVED — owner finalize in progress`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S1-004-API` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- In scope: support-only acceptance framing, dependency mapping, code-scan evidence anchors, reviewer checklist.
- Out of scope: `@drts/contracts` 主線變更、`driver-profile` runtime 實作、`driver-app` settings integration、或改寫 machine truth。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S1-004-API` 目前在 machine truth 中為 `blocked`，Owner=`Qwen`，formal blocker 只有 `GAP-P2S1-004-CONTRACTS`。
- 本 sidecar `GAP-P2S1-004-API-SIDECAR-ACCEPTANCE` 目前為 `review`，Owner=`Codex2`，Reviewer=`Codex`，artifact path 為 `support/sidecars/GAP-P2S1-004-API/GAP-P2S1-004-API-SIDECAR-ACCEPTANCE.md`。
- `ai-activity-log.jsonl` 顯示這份 packet 的流轉為：
  - 2026-04-17T11:01:12Z：Codex 起手定義 packet 目標，先整理 contracts-first dependency、baseline 與 reviewer handoff。
  - 2026-04-17T11:06:03Z：Codex2 完成 support artifact 並 handoff 給當時 reviewer `Qwen`。
  - 2026-04-17T11:06:21Z / 11:06:32Z：reviewer 因 Qwen terminal token failure 自動改派回 `Codex`，因此目前等待 Codex reviewer response。
- 這份 packet 的核心目標仍是整理：
  - contracts-first dependency
  - current driver-settings / regulatory-registry baseline
  - acceptance checklist
  - reviewer handoff for `Codex`
- 共識文件已把 `GAP-P2S1-004` 拆成 contracts-first sequencing：
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/consensus-packet.md`：`GAP-P2S1-004-CONTRACTS` 在前，`GAP-P2S1-004-API` blocked on it。
  - `review-round-2.md`：建議採 **standalone `driver-profile` module**，並明確切開 profile vs regulatory ownership。
  - `review-round-4.md`：再次強調若沒有 contracts-first sequencing，會讓 API 與 downstream settings integration 並行時各自實作出不相容版本。

### Repo Baseline Anchors

- `apps/api/src/modules/driver-profile/` 目前不存在。
- [`packages/contracts/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:1638) 尚未出現 `DriverProfileRecord`、`CreateDriverProfileCommand`、`UpdateDriverProfileCommand`。
- [`apps/api/src/app.module.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:17) 目前有 `DriverSettingsModule` 與 `RegulatoryRegistryModule`，但沒有 `DriverProfileModule`。
- [`apps/driver-app/app/settings.tsx`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/settings.tsx:24) 目前仍呼叫 `getDriverSettings("driver-demo-001")` / `updateDriverSettings("driver-demo-001", ...)`，且綁定 demo driver。
- [`packages/api-client/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/api-client/src/index.ts:1150) 只有 `getDriverSettings` / `updateDriverSettings`，沒有任何 `driver-profile` client method。
- [`apps/api/src/modules/driver-settings/driver-settings.controller.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/driver-settings/driver-settings.controller.ts:8) 與 [`driver-settings.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/driver-settings/driver-settings.service.ts:23) 目前只處理 language / notifications / autoAccept / maxAcceptRadius / preferredAreas 這類偏好設定。
- [`apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:49) 的 `DriverRegistryRecord` seed 目前只含 `driverId`、`name`、`supportedServiceBuckets`、`workState`、`licensesValid`，對應 review-round-2 所說的 read-only registry baseline。
- [`apps/api/src/common/auth/auth.policy.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/common/auth/auth.policy.ts:232) 目前只對 `regulatory-registry` 明確定義 platform/ops realm 存取規則；尚無 `driver-profile` route policy 錨點。

結論：目前 repo 只有「driver settings 偏好設定」與「regulatory registry 合規/運營 driver 主資料」兩條舊路徑，還沒有共識文件要求的 standalone `driver-profile` module，也沒有它所需的新 contracts 型別。

---

## 3) Parent Acceptance Framing

`GAP-P2S1-004-API` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；因此本 packet 只把共享真相已存在的 scope 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Contracts-first prerequisite remains authoritative

- [ ] `GAP-P2S1-004-API` 的 formal blocker 仍維持 `GAP-P2S1-004-CONTRACTS`，不得繞過。
- [ ] API implementation 使用正式 contracts 型別，不以 inline `any` / 本地 interface 取代 `DriverProfileRecord`、`CreateDriverProfileCommand`、`UpdateDriverProfileCommand`。
- [ ] reviewer handoff 必須明示 contracts commit / branch baseline，避免 `Qwen` 依舊的 driver-settings shape 自行猜測 payload。

### AC-2 — Standalone `driver-profile` module actually exists

- [ ] `apps/api/src/modules/driver-profile/` 建立完成，且不只是把既有 `driver-settings` 重新命名。
- [ ] `AppModule` 匯入新 module，route surface 可被明確定位。
- [ ] 至少要有 driver self-service 讀/寫 profile 的 API surface，供後續 `settings.tsx` 接入；不是把需求退回 `regulatory-registry`。

### AC-3 — Ownership boundary matches consensus docs

- [ ] `driver-profile` 僅承接 review-round-2 指定的 profile ownership：name、contact、photo、emergency contact、bank account 這類 driver self-service 欄位。
- [ ] `regulatory-registry` 仍保留 compliance / workState / service buckets 的 authority，不被 side-step 成可寫 profile API。
- [ ] 兩者只透過 `driverId` 關聯，不在 acceptance claim 中把 registry 與 profile 混成單一 source-of-truth。

### AC-4 — Downstream readiness is explicit, but not over-claimed

- [ ] parent `GAP-P2S1-004-API` 完成後，才解鎖 `GAP-P2S3-008` 的 `settings.tsx -> driver-profile API` integration。
- [ ] 目前既有 `driver-settings` endpoints / api-client methods 只能被描述為 baseline 或 temporary surface，不能被拿來宣稱 `GAP-P2S1-004-API` 已完成。
- [ ] reviewer handoff 要明確指出哪些是 parent API slice 的完成證據，哪些仍屬 downstream wiring。

---

## 4) Dependency Map

### Formal Upstream Dependency

> 以 machine truth 為準，`GAP-P2S1-004-API.depends_on=["GAP-P2S1-004-CONTRACTS"]`。

| Dep    | Source                   | Status    | Notes                                                                                      |
| ------ | ------------------------ | --------- | ------------------------------------------------------------------------------------------ |
| D-UP-1 | `GAP-P2S1-004-CONTRACTS` | `backlog` | 新增 `DriverProfileRecord` 與 create/update commands，是 parent API slice 唯一正式 blocker |

### Formal Downstream Dependency

| Dep      | Source         | Status    | Notes                                                                              |
| -------- | -------------- | --------- | ---------------------------------------------------------------------------------- |
| D-DOWN-1 | `GAP-P2S3-008` | `blocked` | `driver-app: settings.tsx → driver-profile API` 明確 blocked on `GAP-P2S1-004-API` |

### Practical Review Dependencies

| Dep   | Type                                 | Why It Matters                                                                |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------- |
| D-P-1 | Planning consensus                   | 定義這是 standalone `driver-profile` module，而不是擴充 `regulatory-registry` |
| D-P-2 | Current driver-settings baseline     | 幫 reviewer 分辨哪些現況屬既有偏好設定，不是本 task 的完成態                  |
| D-P-3 | Current regulatory registry baseline | 幫 reviewer 鎖定 registry authority 邊界，避免 profile/compliance 混寫        |
| D-P-4 | Auth surface                         | 新 route 上線時需要可審查的 realm/scope posture，而不是沿用未定義預設         |

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

| ID  | Evidence                                | Expected Anchor                                                                                                  |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| E-1 | Parent / sidecar machine state          | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                                                     |
| E-2 | Contracts gap baseline                  | `packages/contracts/src/index.ts` has no driver-profile types yet                                                |
| E-3 | Missing module baseline                 | `apps/api/src/modules/driver-profile/` absent; `apps/api/src/app.module.ts` has no `DriverProfileModule`         |
| E-4 | Existing temporary driver settings path | `apps/driver-app/app/settings.tsx`, `packages/api-client/src/index.ts`, `apps/api/src/modules/driver-settings/*` |
| E-5 | Registry authority boundary             | `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`, `regulatory-registry.controller.ts`   |
| E-6 | Auth posture anchor                     | `apps/api/src/common/auth/auth.policy.ts`                                                                        |
| E-7 | Sequencing rationale                    | `review-round-2.md`, `review-round-4.md`, `consensus-packet.md`, `starter-draft.md`                              |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. sidecar 是否忠實保留 machine truth：正式 blocker 只有 `GAP-P2S1-004-CONTRACTS`，沒有擅自加入其他 formal deps。
2. acceptance framing 是否真的指向 standalone `driver-profile` module，而不是把現有 `driver-settings` / `regulatory-registry` 誤當完成證據。
3. ownership boundary 是否維持清楚：profile writable fields vs regulatory compliance/workState。
4. downstream `GAP-P2S3-008` 是否只被描述為後續 wiring，不被提前算進 parent API closeout。
5. support artifact 是否沒有修改任何 canonical truth 或主線 runtime 實作。

**建議核准用語：**

> `GAP-P2S1-004-API acceptance packet ready: contracts-first dependency remains explicit, current driver-settings/regulatory-registry baselines are correctly separated from the new standalone driver-profile scope, and the packet gives a reviewer-usable checklist for the blocked API slice without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / dependency drift / baseline misclassification / scope violation]`

---

## 7) Handoff Command

Owner（`Codex2`）完成 packet 後，交給目前 reviewer（`Codex`）：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff GAP-P2S1-004-API-SIDECAR-ACCEPTANCE Codex "GAP-P2S1-004-API acceptance packet ready in support/sidecars/GAP-P2S1-004-API/GAP-P2S1-004-API-SIDECAR-ACCEPTANCE.md. It freezes the contracts-first blocker on GAP-P2S1-004-CONTRACTS, separates the current driver-settings and regulatory-registry baselines from the new standalone driver-profile scope, and gives a reviewer-usable checklist for parent API handoff without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S1-004-API-SIDECAR-ACCEPTANCE "GAP-P2S1-004-API acceptance packet ready: contracts-first dependency stays aligned with machine truth, existing driver-settings/regulatory-registry surfaces are correctly framed as baseline-only, and the standalone driver-profile acceptance boundary is clearly packaged as support-only material."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S1-004-API-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency drift / baseline misclassification / scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 已進入 `review_approved`；由 owner（`Codex2`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex2 python3 scripts/ai_status.py done GAP-P2S1-004-API-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S1-004-API at support/sidecars/GAP-P2S1-004-API/GAP-P2S1-004-API-SIDECAR-ACCEPTANCE.md."
```

---

## 10) Change Log

- 2026-04-17 — 初版建立：依共享 machine truth、consensus docs 與 repo 掃描，整理 `GAP-P2S1-004-API` 的 acceptance checklist、dependency map、driver-settings / regulatory-registry baseline、以及 reviewer handoff 指引。
