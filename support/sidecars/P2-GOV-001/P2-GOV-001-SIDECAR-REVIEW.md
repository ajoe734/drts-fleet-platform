# P2-GOV-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `P2-GOV-001` — Sandbox experiment / jurisdiction / approval-document governance + snapshot
**Current Sidecar Owner:** `Claude`
**Assigned Reviewer (this packet):** `Codex2`
**Parent Owner / Reviewer:** `Codex2` / `Claude2`
**Last Revised:** `2026-06-26T03:00Z (UTC)`
**Status:** `in_progress → review` (owner `Claude` building packet; handing off to reviewer `Codex2`. Support-only; parent owner `Codex2` and parent reviewer `Claude2` decide absorption / merge.)

---

## 1) Scope Boundary

本 sidecar 只整理 `P2-GOV-001` 的 **review packet、evidence summary 與 reviewer handoff**。**不改 canonical truth、不替 parent 直接實作或 closeout、不修改 L1/L2 真相或主線 runtime/registry/governance code。**

- In scope: 從 parent 實作 commit 重建可驗證的 evidence anchor（檔案 + 行號），把 anchor 映射到 parent 的 machine-truth `acceptance[]`，標出 reviewer（`Claude2`）做最終 parent review 時應重點驗證 / 容易踩雷的點，並把本 packet 交給 sidecar reviewer（`Codex2`）。
- Out of scope: 直接修改 `packages/contracts` / `apps/api/src/modules/sandbox-governance/` 主線 code、改 / 新增 governance migration、定義新的 av_sandbox DDL 真相、替 parent 做 approve / reopen 決定、或把 P2-WP0 / 其他 P2 wave 實作吃進來。
- 本 packet 是 **review aid**，不是 review verdict。最終 parent approve/reopen 由 parent reviewer `Claude2` 在 parent branch 上行使。

---

## 2) Current State Baseline (Shared Truth)

以 `scripts/ai-status.sh show` 的 single-task slice 與 repo 掃描為準（**未** 整檔讀 `ai-status.json`）。

### Parent `P2-GOV-001`

- machine truth：`status=review`，Owner=`Codex2`，Reviewer=`Claude2`，`depends_on=["P2-WP0"]`，`phase=phase2-tesla-fsd-sandbox-202606`，`artifacts=["apps/api/src/modules/sandbox-governance/"]`，`last_update=2026-06-26T01:26:23Z`。
- parent `next` 自報已實作 sandbox-governance contracts/controller/service + `V0038` governance migrations + unit/integration tests，並聲稱驗證過：
  - `pnpm --filter @drts/contracts build`
  - `pnpm --dir apps/api exec vitest run tests/unit/sandbox-governance.service.test.ts tests/integration/sandbox-governance.controller.test.ts`（pass）
  - full `tsc` 對 sandbox-governance 無錯，但 `apps/api` typecheck 仍因 **pre-existing repo baseline** 問題（task 範圍外）失敗。

### 實作位置（review 目標）

- parent 實作落在 **本地 branch `codex2/p2-gov-001`**，task-scoped commit：
  - `4e4b5516c feat(P2-GOV-001): implement sandbox governance api`（`LLM-Agent: codex2`、`Task-ID: P2-GOV-001`、`Reviewer: Claude2`）。
  - 該 commit 7 檔、`+2462 / -16`：controller / module / service / unit test / integration test / `V0038` migration / contracts。
- **重要：parent 實作尚未落到 `dev`，且 `codex2/p2-gov-001` 目前只在本地、未 push 到 `origin`。** 本 worktree（base `dev`）的 working tree 看不到這些檔案，這是預期狀態，不是缺陷。parent reviewer 必須在 `codex2/p2-gov-001`（或其後續 PR）上 review，不能在 `dev` 上找。

### Sidecar `P2-GOV-001-SIDECAR-REVIEW`

- machine truth：Owner=`Claude`，Reviewer=`Codex2`，`task_class=sidecar`，`mutates_canonical=false`，`helper_parent=P2-GOV-001`，`helper_kind=review_packet`，`auto_created_by=supervisor-underutilization`，`depends_on=["P2-WP0"]`。

### Dependency `P2-WP0`（foundation，已 merged）

- `status=done`，`integration_status=merged_to_dev`，`merge_commit=a00a3bbd7…`（已進 `origin/dev`）。是 parent 與本 sidecar 的 upstream foundation，**已滿足**。`V0037`（`av_sandbox` / `av_evidence` schema + capability-gate 表）與 contracts 的 dispatch/capability DTO 已在 `dev`；governance 表 / DTO 由 parent 的 `V0038` + contracts 增量提供。

---

## 3) Review Evidence Map（commit `4e4b5516c`，逐 anchor 重建）

下表 anchor 全部由 `git show 4e4b5516c:<path>` 重建並逐行核對，非轉述 parent 文字。`acceptance[]` 原文：「Experiments CRUD+publish/suspend/resume-authorizations endpoints live; approval doc hash stored; versions rollbackable & effective-dated; compliance snapshot reproducible; unit+integration green」。

### AC-1 — Experiment program CRUD + lifecycle endpoints  ✅ surface present

Controller `apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts`（`@Controller("sandbox-governance")` L33）：

| Route | 行 |
| --- | --- |
| `GET experiments` / `POST experiments` | L39 / L52 |
| `GET experiments/:experimentId` | L63 |
| `PATCH experiments/:experimentId` | L75 |
| `DELETE experiments/:experimentId` | L87 |
| `POST experiments/:experimentId/versions/:versionId/publish` | L98 |
| `POST experiments/:experimentId/suspend` | L115 |
| `POST experiments/:experimentId/resume-authorizations` | L130 |
| `POST experiments/:experimentId/rollback/:versionId` | L145 |

- 三個 acceptance 點名的 lifecycle endpoint（`publish` / `suspend` / `resume-authorizations`）皆存在（L98 / L115 / L130），CRUD 齊備。
- contracts 對應 command/record：`SandboxExperimentProgramRecord` L565、`Create…Command` L573、`Update…Command` L586、`Publish…VersionCommand` L598、`Suspend…AuthorizationsCommand` L611、`Resume…AuthorizationsCommand` L618（`packages/contracts/src/phase2-tesla-fsd-sandbox.ts`）。lifecycle status enum：`SandboxVersionLifecycleStatus` L530、`SandboxAuthorizationStatus` L538（**結構化 enum，非自由文字**）。

### AC-2 — Jurisdiction profile governance + notification matrix  ✅ surface present

Controller routes：`GET/POST jurisdictions` L162/L175、`GET :id` L186、`PATCH :id` L198、`DELETE :id` L213、`publish` L224、`rollback/:versionId` L241。

- contracts：`SandboxJurisdictionProfileRecord` L648、版本 record `…VersionRecord` L625、`Create…Command` L656、`Update…Command` L669。
- **Notification matrix 為結構化、data-driven**：`SandboxGovernanceNotificationMatrixEntry` L510、`…NotificationRecipient` L503，並由 channel/recipient/trigger enum 支撐：`…NOTIFICATION_CHANNELS` L473、`…RECIPIENT_KINDS` L482、`…NOTIFICATION_TRIGGERS` L491。matrix 進 experiment/jurisdiction record（如 `notificationMatrix` L550/L634）。→ 符合 summary「notification matrix 結構」「通報時限 policy-driven 不硬編」的方向（reviewer 仍應抽查 service 內無寫死時限 magic number，見 §4-R2）。

### AC-3 — Approval document: hash stored + supersedes + rollback + effective-dating  ✅ surface present

Controller：`GET/POST approval-documents` L258/L271、`GET :id` L282、`POST :id/versions` L294、`DELETE :id` L309、`publish` L320、`rollback/:versionId` L337。

- **Hash 真存**：service `apps/api/.../sandbox-governance.service.ts` 以 `node:crypto`（L1 `import { createHash, randomUUID }`）對 artifact buffer 算 `sha256`：`createHash("sha256").update(buffer).digest("hex")` L1266，存進 `artifactSha256`（L528 / L598）。對應 migration 欄位見下。
- **Supersedes 鏈**：migration `infra/migrations/V0038__phase2_sandbox_governance_versions.sql` 的 `av_sandbox.approval_document_versions` 有 `supersedes_version_id uuid NULL` L81、`rollback_from_version_id uuid NULL` L87、`UNIQUE (document_id, version_no)` L92。
- **Effective-dating**：每張 version 表都有 `effective_from timestamptz NOT NULL` / `effective_until timestamptz NULL`（experiment L24-25、jurisdiction L51-52、approval-doc L83-84），並有 `effective_from DESC` current-version index（L36/L63/L95）。service 以 `assertEffectiveRange(...)` + `normalizeTimestamp/normalizeNullableTimestamp` 在 create/update/publish/rollback 各路徑強制 effective window（L67/L129/L209/L262/L308/L367…）。
- contracts：`ApprovalDocumentVersionRecord` L692、`ApprovalDocumentRecord` L720、`Create…VersionCommand` L731、`SANDBOX_APPROVAL_DOCUMENT_TYPES` L681。

### AC-4 — SandboxComplianceSnapshot assembly + reproducibility  ✅ surface present

- service `generateComplianceSnapshot(...)` L711，組 `snapshotBase`（L748）後以 **stable hash** 封章：`snapshotHashSha256: this.computeStableHash(snapshotBase)` L767；`computeStableHash` 用 `createHash("sha256").update(this.stableStringify(value)).digest("hex")` L1271-1273，`stableStringify` 對 object key 排序（L1276-1286）→ **同輸入 → 同 hash，這是可重現性的關鍵**。
- migration `av_sandbox.compliance_snapshots`：`snapshot_hash_sha256 varchar(64) NOT NULL` L105、`experiment_version_id` L101、`policy_versions jsonb` L106、`as_of` index L113。
- contracts：`SandboxComplianceSnapshotRecord` L756、`GenerateSandboxComplianceSnapshotCommand` L771、`SandboxGovernancePolicyVersionRefs` L517。
- controller：`GET compliance-snapshots/:experimentId` L354。

### AC-5 — unit + integration green（自報 pass；本 packet 未重跑，見 §5）

- unit `apps/api/tests/unit/sandbox-governance.service.test.ts`：3 案例 —
  - L10 「stores approval artifact hashes, supersedes prior versions, and supports rollback」（直打 AC-3）
  - L81 「creates reproducible compliance snapshots for the same asOf timestamp」（直打 AC-4 可重現性）
  - L165 「suspends and resumes experiment authorizations by publishing derivative versions」（直打 AC-1 lifecycle）
- integration `apps/api/tests/integration/sandbox-governance.controller.test.ts`：L11 「serves CRUD, publish, suspend/resume, rollback, and snapshot flows」（涵蓋全 route 表）。
- → 測試命名與 acceptance 點對點對齊；reviewer 應實跑確認綠燈（§5 指令）。

---

## 4) Reviewer Focus / Risk Notes（給 parent reviewer `Claude2`）

下列不是 blocker 判定，是 reviewer 在 parent branch 做最終 review 時**最該抽查**、最容易誤判的點。

- **R1 — 在對的地方 review。** code 只在本地 `codex2/p2-gov-001 @ 4e4b5516c`，**未 push origin、未在 `dev`**。在 `dev` 上找 controller / `V0038` 會「看不到」並非缺陷。先確認 parent owner 已把 branch push 上來或開 PR，否則 review 無 diff 可看。
- **R2 — policy 時限不可硬編。** acceptance/ summary 要求通報時限、保存年限為 policy-driven。請抽查 `sandbox-governance.service.ts` 內 notification / retention 路徑沒有寫死 magic 小時/天數；matrix 結構（contracts L503-517）在，但 service 端是否真的「不硬編」需逐行確認。
- **R3 — 「rollbackable & effective-dated」要有語意，不只欄位存在。** migration 有 `rollback_from_version_id` / `supersedes_version_id` / effective window 欄位（§3 AC-3），但 reviewer 應確認 service 的 rollback path（experiment L255、approval/jurisdiction 對應 path）確實**新建 derivative version 並指回 target**（service 模式為 publish-derivative，見 unit L165 命名），而非就地覆寫歷史。
- **R4 — 快照可重現性的 hash 範圍。** `computeStableHash`（L1271）對 `snapshotBase`（L748）封章。reviewer 應確認 `snapshotBase` 蒐集了 summary 點名的各版本（experiment / jurisdiction / route / schedule / enrollment / capability / policy），且**不含**時間戳/隨機 UUID 等會破壞可重現性的欄位（`snapshotId` 用 `randomUUID()` L764，須在 hash base 之外——本 packet 觀察到 hash 取自 `snapshotBase` 而 `snapshotId` 是 spread 在 base 之外 L767-768，reviewer 請二次確認此邊界）。
- **R5 — typecheck 噪音切分。** parent 自報 `apps/api` 全量 `tsc` 因 pre-existing baseline 失敗。reviewer 請用 path-scoped 證據（只看 `sandbox-governance/**` 與 `phase2-tesla-fsd-sandbox.ts` 的 tsc 輸出）區分 task-introduced vs 既有 baseline，勿把 baseline 噪音算到本 task 頭上。
- **R6 — migration 是 skeleton 措辭。** `V0038` 檔頭註解寫 "reserve the persistence surface"。reviewer 確認 runtime 是否實際讀寫這些表，或 service 仍為 in-memory（unit/integration 是否打 DB）。若 persistence 為 in-memory 佔位，acceptance「versions rollbackable / snapshot reproducible」是否仍以記憶體模型滿足，需 parent reviewer 明確接受或要求落 DB。

---

## 5) Verification Reproduction（reviewer 可複跑）

本 packet **誠實聲明：未重跑 build / vitest**（sidecar 為 support-only，且 code 不在本 worktree 的 `dev` base；強行 checkout parent code 會超出 sidecar 邊界）。所有 §3 anchor 由 `git show 4e4b5516c:<path>` 靜態重建並逐行核對。parent reviewer 請在 `codex2/p2-gov-001` 上複跑：

```bash
git switch codex2/p2-gov-001     # 或 review 對應 PR 的 head
pnpm --filter @drts/contracts build
pnpm --dir apps/api exec vitest run \
  tests/unit/sandbox-governance.service.test.ts \
  tests/integration/sandbox-governance.controller.test.ts
# path-scoped typecheck 噪音切分（R5）
pnpm --dir apps/api exec tsc --noEmit 2>&1 | grep -E "sandbox-governance|phase2-tesla-fsd-sandbox" || echo "no task-scoped tsc errors"
```

---

## 6) Reviewer Handoff（給 sidecar reviewer `Codex2`）

- 本 packet 為 **review aid + evidence summary**，不替 parent 做 approve/reopen。
- 請核：（a）§3 anchor 是否真能由 `git show 4e4b5516c:<path>` 重建且行號對得上；（b）§4 risk note 是否公允、無臆造 blocker；（c）scope 是否守住 support-only、無 canonical 改動。
- 通過 → `approve P2-GOV-001-SIDECAR-REVIEW`，owner `Claude` 做 closeout（提供 `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH`，`INTEGRATION_STATUS=branch_pushed`，因 support artifact 不進 `dev` runtime）。
- 不通過 → `reopen` 或 `blocker`，指出需修正的 anchor / 措辭。

---

## 7) Provenance

- Evidence commit: `4e4b5516c089a667f174b3cf93758e492234c898`（branch `codex2/p2-gov-001`，local-only at packet time）。
- Anchors rebuilt via `git show <commit>:<path>`；無整檔讀 `ai-status.json`（用 single-task slice）。
- Support-only；未改 L1/L2 truth、未改 `packages/contracts` / `apps/api` 主線 code、未替 parent build/test/closeout。
