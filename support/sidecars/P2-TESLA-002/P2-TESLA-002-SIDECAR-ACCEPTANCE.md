# P2-TESLA-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `P2-TESLA-002` — Tesla Regulatory provider adapter + mock + capability profile + reason-code store
**Current Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Codex`
**Parent Owner / Reviewer:** `Codex` / `Codex2`
**Phase:** `phase2-tesla-fsd-sandbox-202606`
**Last Revised:** `2026-06-26T01:42Z (UTC)`
**Status:** `in_progress` (owner `Claude` building the support packet; parent `P2-TESLA-002` is `in_progress` on owner `Codex`, formally `depends_on=["P2-WP0"]`, which is `done` / `merged_to_dev` at `a00a3bbd7`)

---

## 1) Scope Boundary

本 sidecar 只整理 `P2-TESLA-002` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing, dependency mapping, repo-scan evidence anchors (foundation present vs gaps absent), reviewer checklist, handoff guidance.
- **Out of scope:** `apps/api/src/modules/tesla-regulatory-events/**` 主線實作、Tesla adapter/mock/capability-profile/reason-code 真相、L1/L2 product truth、`packages/contracts/**` 契約新增、`infra/migrations/**` schema 修改、或改寫 machine truth（`ai-status.json` / `current-work.md` / `ai-activity-log.jsonl`）。

> Helper rule: 此 packet 是 sidecar support slice，不是 canonical 實作。最終是否吸收進主線由 parent owner (`Codex`) 決定。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`（透過 `scripts/ai-status.sh show`）、task brief、與目前 repo 掃描為準：

### Machine-truth state

- 父任務 `P2-TESLA-002` 在 machine truth 中為 `status=in_progress`，Owner=`Codex`，Reviewer=`Codex2`，`depends_on=["P2-WP0"]`，`last_update=2026-06-26T01:38:38Z`，`next` 顯示 owner 正在 "auditing branch state, commit trailer issue, and pnpm lock drift before remediation"。
- 依賴 `P2-WP0` 為 `status=done`、`integration_status=merged_to_dev`、`commit_hash=a00a3bbd7…`、`push_branch=dev`；因此 Phase 2 contracts + DDL + 10 module scaffolds 的基礎已可從 `origin/dev` reachable。**P2-TESLA-002 的正式上游依賴已解除**，剩下的是主線實作本身。
- 本 sidecar `P2-TESLA-002-SIDECAR-ACCEPTANCE` 為 `task_class=sidecar`、`helper_parent=P2-TESLA-002`、`helper_kind=acceptance_packet`、`mutates_canonical=false`，Owner=`Claude`、Reviewer=`Codex`。

### Repo Baseline Anchors（foundation present from P2-WP0）

- Phase 2 契約已落在 [`packages/contracts/src/phase2-tesla-fsd-sandbox.ts`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/phase2-tesla-fsd-sandbox.ts:1) 並由 barrel [`packages/contracts/src/index.ts:5524`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:5524) `export * from "./phase2-tesla-fsd-sandbox"`。其中已存在：
  - `ProviderCapabilityRequirement` / `ProviderCapabilityDescriptor` / `Phase2ProviderCapability`（contract 第 56–88 行）。
  - `TeslaRegulatoryEvent` + `TeslaRegulatoryEventType` + `TeslaDisengagementCause`，事件 DTO 帶 `providerReasonCode`（第 188–242 行）。
  - `CommandReceipt` / `TeslaRemoteCommandType`、`SandboxDispatchDecision`（含 `hardReasonCodes` / `softReasonCodes`）、`EvidenceManifestItem`、`Phase2ErrorCode`。
- Module scaffold 已 register：[`apps/api/src/app.module.ts:53-109`](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:53) 匯入並註冊 `TeslaRegulatoryEventsModule` 等 10 個 Phase 2 模組。
- `tesla-regulatory-events` 模組目前是 **scaffold-only**：
  - [`tesla-regulatory-events.ports.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tesla-regulatory-events/tesla-regulatory-events.ports.ts:1) 只定義 `TeslaRegulatoryEventProvider.fetchEvents(query)` 介面。
  - [`tesla-regulatory-events.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tesla-regulatory-events/tesla-regulatory-events.service.ts:1) 標明 "Scaffold-only"，`eventProvider` 固定為 `null`，並註明 concrete provider 與對 `av_sandbox.tesla_regulatory_events (V0037)` 的 persistence 留待 downstream waves。
- DDL 已落在 [`infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql`](/home/edna/workspace/drts-fleet-platform/infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql:25)：建立 `av_sandbox` / `av_evidence` schemas、`av_sandbox.provider_capability_requirements`、`av_sandbox.command_receipts`、`av_sandbox.sandbox_dispatch_decisions`、`av_sandbox.tesla_regulatory_events`（含 `provider_reason_code` 欄與索引）等。
- `packages/shared-test-fixtures/` 套件已存在（scaffold：`src/` + `package.json` + `tsconfig.json`），尚無 Tesla regulatory signed-sample fixtures。

### Repo Gap Anchors（parent 仍須交付，目前 repo 掃描為 ABSENT）

> 以 `grep -rln` 於 `packages/` + `apps/` 掃描，下列符號目前**不存在**：

- `TeslaRegulatoryCapabilityProfile` 型別 — **ABSENT**（contracts 只有 `ProviderCapabilityRequirement/Descriptor`，沒有 per-vehicle capability profile DTO）。
- `TeslaRegulatorySandboxAdapter`（契約占位 adapter，不假設真 endpoint）— **ABSENT**。
- `TeslaRegulatoryMockAdapter` — **ABSENT**。
- FSD `FsdSession` / `AutonomyTransition` / session-summary / incident-evidence-reference DTO — **ABSENT**（contract 目前只有 event-level `TeslaRegulatoryEvent`，沒有 session / transition / summary aggregate）。
- reason-code dictionary 型別與儲存（versioned，保留原始 provider code，不自行重分類為責任）— **ABSENT**。
- `GET /api/tesla/vehicles/{vin}/capabilities` controller/route — **ABSENT**（`tesla-regulatory-events` 與 `tesla-integration` 模組目前都沒有 controller）。
- capability-profile 持久化 store（V0037 有 `provider_capability_requirements`，但沒有 per-vehicle `tesla_regulatory_capability_profiles` 表）— **ABSENT**。
- required-capability-missing → 阻擋 passenger service 的 gating 連線 — **未接線**。
- shared-test-fixtures 內的 Tesla signed sample events — **ABSENT**。

結論：`P2-TESLA-002` 不是把既有 scaffold 改個 URL；它要在 P2-WP0 既有的 contract/DDL/scaffold 基礎上，新增 capability-profile、mock/sandbox adapter、FSD session/transition/summary/incident DTO、versioned reason-code dictionary 與 capabilities query route，並接上 required-capability gating。foundation 已 merged_to_dev，gaps 仍待主線實作。

---

## 3) Parent Acceptance Framing

`P2-TESLA-002` 的 machine-truth `acceptance[]` 只有一條總結句：

> "Capability profile stored & queryable via GET /api/tesla/vehicles/{vin}/capabilities; mock adapter emits signed sample events; reason-code dictionary versioned; required-capability-missing gates passenger service; unit+integration green"

以下 checklist 只把該句與 `summary_zh`（SD §3.2 / spec 04）展開成 reviewer-facing 條目，**不新增產品語意**。

### AC-1 — Capability profile stored & queryable

- [ ] 新增 `TeslaRegulatoryCapabilityProfile` DTO（per-vehicle / per-VIN capability profile），由 `getCapabilities` 結果填充並持久化。
- [ ] capability profile 可透過 `GET /api/tesla/vehicles/{vin}/capabilities` 查詢；route 在 `tesla-regulatory-events`（或 parent 約定的 Tesla 模組）暴露並於 `app.module.ts` 連線。
- [ ] 持久化 store 與 `av_sandbox` schema 命名 / ownership 對齊 Phase 1 慣例（不可只放記憶體）。

### AC-2 — Sandbox adapter is a contract placeholder, not a real endpoint assumption

- [ ] `TeslaRegulatorySandboxAdapter` 是契約占位實作，**不可**假設或硬接 Tesla 真實 Fleet API endpoint。
- [ ] adapter 介面對齊既有 `TeslaRegulatoryEventProvider` port（`apps/api/src/modules/tesla-regulatory-events/tesla-regulatory-events.ports.ts`），不繞過 port 抽象。
- [ ] sandbox adapter 不被描述成「已連 production Tesla 資料源」。

### AC-3 — Mock adapter emits signed sample events but is never external evidence

- [ ] `TeslaRegulatoryMockAdapter` 能產生 signed sample regulatory events（餵 accident investigation / regulatory reporting 的 regulatory-grade 形狀）。
- [ ] sample events 落在 `packages/shared-test-fixtures/`，與既有 fixtures 慣例一致。
- [ ] packet / handoff / 程式註解都明示：**mock adapter 不能當外部實證**（not external evidence），只供 unit/integration 驗證。

### AC-4 — FSD session / autonomy transition / session summary / incident evidence reference DTOs stored

- [ ] 新增 FSD session、autonomy transition、session summary、incident evidence reference 的 DTO 與儲存。
- [ ] 這些 DTO 與既有 event-level `TeslaRegulatoryEvent` 的關係清楚（aggregate vs single event），不重複定義同一語意。
- [ ] 儲存對齊 `av_sandbox` / `av_evidence` schema 與 Phase 1 ownership 慣例。

### AC-5 — Reason-code dictionary versioned, original codes preserved

- [ ] reason-code dictionary 儲存為 **versioned**（可追溯版本），不是散落的字串常數。
- [ ] dictionary **保留原始 provider reason code**，不自行把 provider code 重分類為「責任 / liability」歸屬。
- [ ] 與既有 `providerReasonCode`（`TeslaRegulatoryEvent`）、`failureReasonCode`（`CommandReceipt`）、`hard/softReasonCodes`（`SandboxDispatchDecision`）的語意邊界清楚。

### AC-6 — Required-capability-missing gates passenger service

- [ ] 當 vehicle capability profile 缺少必要 capability 時，passenger service dispatch 被 gate（拒絕 / 阻擋）。
- [ ] gating 使用既有 `ProviderCapabilityRequirement` / `SandboxDispatchDecision` 語意，產出 hard reason code，而不是另立平行機制。
- [ ] gate 行為有對應 unit/integration 覆蓋。

### AC-7 — Tests green; foundation untouched

- [ ] `pnpm --filter @drts/contracts build` 與 `pnpm --filter @drts/api typecheck` 仍通過（新 DTO 不破壞 barrel）。
- [ ] capability / mock-adapter / gating 的 unit + integration 測試 green。
- [ ] 不回退或改寫 P2-WP0 已 merged 的 contract/DDL/scaffold 基礎（只新增，不破壞）。

---

## 4) Dependency Map

### Formal Upstream Dependency

> 以 machine truth 為準，`P2-TESLA-002.depends_on=["P2-WP0"]`。

| Dep    | Source   | Status                          | Notes                                                                                                  |
| ------ | -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| D-UP-1 | `P2-WP0` | `done` / `merged_to_dev`        | Phase 2 contracts + V0037 DDL + 10 module scaffolds landed at `a00a3bbd7`, reachable from `origin/dev`. 上游已解除，不再是 blocker。 |

### Practical Implementation Dependencies (within P2-WP0 surface)

| Dep   | Surface                                              | Why It Matters                                                                                  |
| ----- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| D-P-1 | `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`| 既有 `TeslaRegulatoryEvent` / `ProviderCapabilityRequirement` / `SandboxDispatchDecision` 是新 DTO 的對齊基準 |
| D-P-2 | `apps/api/src/modules/tesla-regulatory-events/*`     | scaffold (module/ports/service) 是 adapter + capability route 的落點                            |
| D-P-3 | `infra/migrations/V0037__*.sql`                      | `av_sandbox` / `av_evidence` schema + `provider_capability_requirements` + `tesla_regulatory_events` 是 persistence 對齊點 |
| D-P-4 | `apps/api/src/app.module.ts:53-109`                  | 10 模組註冊點；新 controller/route 必須在此連線                                                 |
| D-P-5 | `packages/shared-test-fixtures/`                     | signed sample events fixture 落點                                                               |

### Downstream Consumers (informational)

| Consumer                          | Why It Cares                                                                 |
| --------------------------------- | --------------------------------------------------------------------------- |
| `sandbox-dispatch-gate` 模組      | 消費 capability gating / `SandboxDispatchDecision` 阻擋 passenger service     |
| `accident-investigation` 模組     | 消費 regulatory events / incident evidence reference                         |
| `regulatory-reporting` 模組       | 消費 versioned reason-code dictionary + regulatory events                     |

### Truth Sources

- L0 Collaboration: `ai-status.json`（經 `scripts/ai-status.sh show`）、`current-work.md`（人類摘要）、`ai-activity-log.jsonl`
- Contract / spec anchors: `phase1_service_contracts_v1.md` SD §3.2、Phase 2 spec 04（PRD §16 AV/ODD/Tesla/ROC 家族）
- Repo anchors: 見 §2 / §5

---

## 5) Evidence Inventory

| ID  | Evidence                                                    | Expected Anchor                                                                                           | Scan Result |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| E-1 | Parent / sidecar machine state                              | `ai-status.json` via `scripts/ai-status.sh show P2-TESLA-002`                                             | present     |
| E-2 | P2-WP0 dependency merged to dev                             | `P2-WP0.integration_status=merged_to_dev`, `commit_hash=a00a3bbd7`                                        | present     |
| E-3 | Phase 2 Tesla contracts exist                               | `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`, barrel `index.ts:5524`                              | present     |
| E-4 | Tesla regulatory events module scaffold                     | `apps/api/src/modules/tesla-regulatory-events/{module,ports,service}.ts`                                  | scaffold    |
| E-5 | 10 Phase 2 modules registered                               | `apps/api/src/app.module.ts:53-109`                                                                       | present     |
| E-6 | av_sandbox / av_evidence DDL + capability + reason-code col | `infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql:25-123`                                  | present     |
| E-7 | Capability profile DTO + route                              | `TeslaRegulatoryCapabilityProfile`, `GET /api/tesla/vehicles/{vin}/capabilities`                         | **ABSENT**  |
| E-8 | Sandbox + mock adapters                                     | `TeslaRegulatorySandboxAdapter`, `TeslaRegulatoryMockAdapter`                                             | **ABSENT**  |
| E-9 | FSD session / autonomy transition / summary / incident DTO  | `FsdSession`, `AutonomyTransition`, session-summary, incident-evidence-reference                         | **ABSENT**  |
| E-10| Versioned reason-code dictionary store                      | reason-code dictionary type + `av_sandbox` table (versioned, codes preserved)                            | **ABSENT**  |
| E-11| Signed sample events fixtures                               | `packages/shared-test-fixtures/` Tesla regulatory samples                                                 | **ABSENT**  |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer（`Codex`）審查本 packet 時應優先確認：

1. packet 是否忠實保留 machine truth：`P2-TESLA-002` 為 `in_progress` on `Codex`、`depends_on=["P2-WP0"]`，且 P2-WP0 已 `merged_to_dev`（上游解除）。
2. foundation-present vs gaps-absent 的分類是否正確：contracts/V0037/scaffold 已存在；capability profile / adapters / FSD DTO / reason-code dictionary / capabilities route 仍 ABSENT。
3. acceptance checklist (AC-1..AC-7) 是否只展開既有 `acceptance[]` 與 `summary_zh`，沒有偷渡新產品語意。
4. 是否正確標明兩條防誤導語意：**mock adapter 不是外部實證**、**reason-code dictionary 保留原碼不重分類為責任**、**sandbox adapter 是契約占位不假設真 endpoint**。
5. support artifact 是否完全沒有修改 canonical truth / contracts / migrations / 主線 runtime。

**建議核准用語：**

> `P2-TESLA-002 acceptance packet ready: machine truth keeps the parent in_progress on Codex with the P2-WP0 dependency already merged_to_dev at a00a3bbd7, the packet correctly separates the present P2-WP0 foundation (phase2-tesla-fsd-sandbox contracts, V0037 av_sandbox/av_evidence DDL, 10 registered module scaffolds) from the still-absent parent deliverables (TeslaRegulatoryCapabilityProfile + capabilities route, sandbox/mock adapters, FSD session/transition/summary/incident DTOs, versioned reason-code dictionary, signed-sample fixtures), the AC-1..AC-7 checklist only expands the recorded acceptance line, and the support material stays within sidecar scope without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / dependency drift / foundation-vs-gap misclassification / invented acceptance semantics / scope violation]`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Claude scripts/ai-status.sh handoff P2-TESLA-002-SIDECAR-ACCEPTANCE Codex "P2-TESLA-002 acceptance packet ready at support/sidecars/P2-TESLA-002/P2-TESLA-002-SIDECAR-ACCEPTANCE.md. It keeps the parent in_progress on Codex with P2-WP0 already merged_to_dev at a00a3bbd7, separates the present P2-WP0 foundation (phase2-tesla-fsd-sandbox contracts, V0037 av_sandbox/av_evidence DDL, 10 registered module scaffolds) from the still-absent parent deliverables (capability profile + capabilities route, sandbox/mock adapters, FSD session/transition/summary/incident DTOs, versioned reason-code dictionary, signed-sample fixtures), expands the recorded acceptance line into AC-1..AC-7, and stays support-only without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex scripts/ai-status.sh approve P2-TESLA-002-SIDECAR-ACCEPTANCE "P2-TESLA-002 acceptance packet ready: machine truth keeps the parent in_progress on Codex with the P2-WP0 dependency already merged_to_dev at a00a3bbd7, the packet correctly separates the present P2-WP0 foundation from the still-absent parent deliverables (capability profile + capabilities route, sandbox/mock adapters, FSD DTOs, versioned reason-code dictionary, signed-sample fixtures), the AC-1..AC-7 checklist only expands the recorded acceptance line, and the support material stays within sidecar scope without mutating canonical truth."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex scripts/ai-status.sh reopen P2-TESLA-002-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency drift / foundation-vs-gap misclassification / invented acceptance semantics / scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾。本 packet 為 support-only artifact，需 task-scoped commit + 普通 non-force push，整合層級 `not_applicable`：

```bash
COMMIT_HASH=<sha> COMMIT_SUBJECT="P2-TESLA-002-SIDECAR-ACCEPTANCE: acceptance packet & dependency map" \
PUSH_REMOTE=origin PUSH_BRANCH=claude/p2-tesla-002-sidecar-acceptance INTEGRATION_STATUS=not_applicable \
AI_NAME=Claude scripts/ai-status.sh done P2-TESLA-002-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for P2-TESLA-002 at support/sidecars/P2-TESLA-002/P2-TESLA-002-SIDECAR-ACCEPTANCE.md. It preserves the P2-WP0 (merged_to_dev) dependency, the foundation-vs-gap repo baseline, and the AC-1..AC-7 reviewer checklist without changing canonical truth."
```

> `INTEGRATION_STATUS=not_applicable`：sidecar 是 support artifact，不對應 dev test 環境 deploy；不得宣稱已 publish 到 dev。

---

## 10) Change Log

- 2026-06-26 — 初版建立：依共享 machine truth（`scripts/ai-status.sh show P2-TESLA-002` / `P2-WP0`）、task brief、Phase 2 contracts (`phase2-tesla-fsd-sandbox.ts`)、`infra/migrations/V0037`、`tesla-regulatory-events` scaffold 與 repo gap 掃描，整理 `P2-TESLA-002` 的 acceptance checklist (AC-1..AC-7)、dependency map（上游 `P2-WP0` 已 merged_to_dev）、foundation-vs-gap evidence inventory、reviewer hotspots 與 handoff 指引。不修改 canonical truth。
