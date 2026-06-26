# P2-NFR-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `P2-NFR-001` — Phase2 infra/security config + retention + DR runbook (repo-local, no live apply)
**Current Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Codex2`
**Parent Owner / Reviewer:** `Claude2` / `Codex2`
**Last Revised:** `2026-06-26T02:31Z (UTC)`
**Status:** `in_progress` — shared L0 keeps sidecar `P2-NFR-001-SIDECAR-ACCEPTANCE` at owner=`Claude`, reviewer=`Codex2`, `last_update=2026-06-26T02:30:56Z` (owner refreshing this packet before handoff), while the parent `P2-NFR-001` is at `status=review_approved` under **owner=`Claude2`** (chairman reassigned owner `Codex`→`Claude2` at `2026-06-26T02:28:52Z` because the `Codex` owner lane hit a 2/2 terminal failure loop on this task; `Claude2` is healthy and keeps owner/reviewer separation from reviewer `Codex2`), reviewer=`Codex2`, `last_update=2026-06-26T02:28:52Z` — reviewer `Codex2` approved the closeout, so the parent now sits in owner-closeout under its new owner `Claude2`. The parent's integration vehicle is a branch-pushed closeout commit `4050a40f` on `origin/codex/p2-nfr-001-closeout` (it dropped the PR-merge route: PR #884 CLOSED, PR #885 still technically OPEN/`UNSTABLE` but no longer the stated vehicle). **`done` was refused by the enabled integration gate** because closeout HEAD `4050a40f` is not yet reachable from `origin/dev`; per the parent's `next`, finalize must wait for `INTEGRATION_STATUS=merged_to_dev` (or `dev_deployed` once deploy evidence exists). The earlier `branch_pushed` target is no longer accepted by the gate.

---

## 1) Scope Boundary

本 sidecar 只整理 `P2-NFR-001` 的 acceptance checklist、dependency map、shared-truth snapshot、repo/test evidence anchors 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作或推進其 integration。

- In scope: support-only acceptance framing, dependency mapping, landed-artifact inventory, integration-state snapshot, reviewer checklist, and handoff / closeout commands.
- Out of scope: 編修 `apps/api/src/config/phase2-av-infra-config.ts`、DR runbook、`infra/gcp/phase2/*` JSON/README 本身；推進/重開 PR #885/#884 或 push/改 closeout branch `codex/p2-nfr-001-closeout`；記錄 parent 的 review approval（屬 reviewer `Codex2` 對 parent 的決策）；任何真實 GCP apply/deploy；L1/L2 真相編修；以及 parent owner `Claude2`（chairman 已自 `Codex` reassign）的主線 closeout 決策。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`（透過 `scripts/ai-status.sh show`）、parent `next` 欄位、closeout branch `codex/p2-nfr-001-closeout`、PR #885/#884 狀態與目前 repo 掃描為準：

- 父任務 `P2-NFR-001` 在 machine truth 中已自 `in_progress`→`review` 再進到 `status=review_approved`，**Owner 已自 `Codex` 改為 `Claude2`**（chairman 於 `2026-06-26T02:28:52Z` reassign owner `Codex`→`Claude2`，因 `Codex` owner lane 在此 task 上 2/2 terminal failure loop；`Claude2` 健康且與 reviewer `Codex2` 保持 owner/reviewer 分離），Reviewer=`Codex2`，`depends_on=["P2-WP0"]`，`last_update=2026-06-26T02:28:52Z`。reviewer `Codex2` 已 approve closeout，parent 現處 owner-closeout 階段（現由新 owner `Claude2` 收尾）。parent `next` 記錄：closeout commit `4050a40f885cdf968203c9d53c981cf9ab250a65`（subject `P2-NFR-001: finalize phase2 AV infra config and DR runbook`）已 non-force push 於 `origin/codex/p2-nfr-001-closeout`，local HEAD 與 remote 一致、worktree clean；owner 已成功重跑 `CI=true pnpm install --frozen-lockfile`、`pnpm --filter @drts/api exec vitest run tests/unit/phase2-av-infra-config.test.ts`、`pnpm --filter @drts/api typecheck`。**惟 owner `done` 被啟用中的 integration gate 拒絕**：closeout HEAD `4050a40f` 尚未 reachable from `origin/dev`，gate 不接受 `branch_pushed`；parent `next` 明示 finalize 必須等 merge 後以 `INTEGRATION_STATUS=merged_to_dev`（或 deploy 有證據時 `dev_deployed`）才能標 `done`。
- 本 sidecar `P2-NFR-001-SIDECAR-ACCEPTANCE` 是 `status=in_progress`，Owner=`Claude`、Reviewer=`Codex2`、`task_class=sidecar`、`helper_parent=P2-NFR-001`、`helper_kind=acceptance_packet`、`mutates_canonical=false`、`last_update=2026-06-26T02:24:30Z`、artifact path=`support/sidecars/P2-NFR-001/P2-NFR-001-SIDECAR-ACCEPTANCE.md`（owner 正在依 supervisor `next` refresh 本 packet，refresh 完即 handoff 給 `Codex2`）。
- 依賴 `P2-WP0` 已 `done`（PR #875，Phase2 contracts + DD foundation 已落 dev），因此 parent 的正式 upstream gate 已滿足。
- **整合載具**：parent 走 **branch-pushed closeout**（已棄 PR-merge-to-`dev` 路線）。目前正式 closeout head 是 commit `4050a40f885cdf968203c9d53c981cf9ab250a65`（branch `origin/codex/p2-nfr-001-closeout`），其內容與舊 linear-v2 commit `85524fbb64f92de45d99de2ebcbb833399f59641`（= 更舊的 `015eba49af2f8eba42f956e97a1027eb9333bf0b`）**完全相同**（`git diff 85524fbb..origin/codex/p2-nfr-001-closeout` 為空，已重新驗證）。原 reviewer-approved commit `d6e009ace731acb6cc451223dfb710cf59bce464` 仍 orphaned。closeout commit `4050a40f` **尚未 reachable from `origin/dev`**（`git merge-base --is-ancestor` 重新確認 NOT reachable）。**因此 parent 雖已 `review_approved`，啟用中的 integration gate 拒絕 `branch_pushed` 收尾，finalize 目標已自 `branch_pushed` 改為 `INTEGRATION_STATUS=merged_to_dev`（或 `dev_deployed`，需 deploy 證據）。**
- **PR lineage（已非 parent 的 stated 整合載具）**：PR **#882**（`codex2/p2-nfr-001`）`CLOSED`；PR **#884**（`codex2/p2-nfr-001-dev-linear`）已於 `2026-06-26T01:59:18Z` `CLOSED`（未 merge）；PR **#885**（`codex2/p2-nfr-001-dev-linear-v2` → `dev`）目前仍 `state=OPEN`、`mergeable=MERGEABLE`、`mergeStateStatus=UNSTABLE`（`e2e`+`ci-integ` FAILURE、其餘 12 check 綠），但 parent `next` 已不再以 PR #885 merge 為整合路徑，改採 branch-pushed closeout（`4050a40f`）。reviewer 應以 closeout branch + `merged_to_dev` finalize 目標為準（gate 已拒 `branch_pushed`），不應把 parent 完成度誤讀成「需 PR #885 merge」。
- parent 已重跑並由 owner 記錄成功的驗證（最新 closeout 階段，非本 sidecar 重跑）：
  - `CI=true pnpm install --frozen-lockfile`
  - `pnpm --filter @drts/api exec vitest run tests/unit/phase2-av-infra-config.test.ts`
  - `pnpm --filter @drts/api typecheck`
  - 在本 sidecar isolated worktree 重跑被 `node_modules/vitest/vitest.mjs` 缺檔擋住；本 sidecar 不宣稱已重跑，只引用 owner closeout-time evidence。

### Landed Artifact Inventory（closeout head `4050a40f` = content-identical to `85524fbb`/`015eba49a`，6 files / +882）

> 以 `git diff --stat origin/dev...origin/codex/p2-nfr-001-closeout` 為準（內容與舊 `85524fbb`/`015eba49a` 相同；只是整合載具從 PR #884/#885 改為 branch-pushed closeout commit `4050a40f`）。

- `apps/api/src/config/phase2-av-infra-config.ts` — +326，infra config 真相：6 storage bucket、6 pub/sub topic、KMS keyring/keys、Secret Manager accessors、telemetry data-quality field rules，外加 `resolvePhase2AvInfraConfig(env)` env-driven resolver。
- `apps/api/src/config/index.ts` — +1，barrel export `export * from "./phase2-av-infra-config";`（新建 `config/` index）。
- `apps/api/tests/unit/phase2-av-infra-config.test.ts` — +144，vitest 5 cases（見 §5）。
- `docs/03-runbooks/phase2-av-dr-and-retention-runbook-20260626.md` — +206，DR + retention runbook（9 sections，含 Non-Claims）。
- `infra/gcp/phase2/av-sandbox-infra-config.json` — +147，repo-local infra contract（`configVersion`/`scope`/`phase`/`gcp{projectVariable,regionVariable,storageBuckets,pubsubTopics,kms,secretManager}`）。
- `infra/gcp/phase2/README.md` — +58，repo-local infra plan（Files / Storage Layout / CMEK + Secret Wiring / Pub/Sub Topics）。

### Repo Baseline Anchors（all on `origin/codex/p2-nfr-001-closeout @ 4050a40f`，line numbers unchanged vs `85524fbb`/`015eba49a`）

- `apps/api/src/config/phase2-av-infra-config.ts:1-7` — `Phase2AvBucketName` union 凍結 spec 12 的 6 個 bucket：`raw-provider-events` / `telemetry-archive` / `video-normal` / `video-incident-locked` / `investigation-bundles` / `regulatory-reports`。
- `apps/api/src/config/phase2-av-infra-config.ts:9-15` — `Phase2AvTopicName` union 定義 6 topic（含 `dr-restore-verify` DR drain topic）。
- `apps/api/src/config/phase2-av-infra-config.ts:21-29` — `Phase2AvBucketConfig` 強制 `versioning: true` literal，並帶 `retentionDays` / `objectHoldMode` / `retentionLock` / `cmekKey`。
- `apps/api/src/config/phase2-av-infra-config.ts:97` — `configVersion: "2026-06-26"`（與 test 斷言一致）。
- `apps/api/src/config/phase2-av-infra-config.ts:107-153` — 各 bucket 的 hold/lock 分級：incident/regulatory 家族用 `default-event-based-hold` 或 `retentionLock: true`，routine 家族為 `none`/`false`。
- `apps/api/src/config/phase2-av-infra-config.ts:55,268-322` — telemetry field rules 每條都有 `breachAction`（reject/quarantine/dead-letter/hold-new-AV-dispatch/schema-drift incident）。
- `apps/api/src/config/index.ts:*` — 新 barrel 只 re-export infra config，不動其他既有 config surface。
- `apps/api/tests/unit/phase2-av-infra-config.test.ts:7-138` — `describe("resolvePhase2AvInfraConfig")` 5 個 `it(...)`（見 §5）。
- `docs/03-runbooks/phase2-av-dr-and-retention-runbook-20260626.md:132-206` — DR procedure：freeze new AV dispatch → ROC degraded mode → per-family restore → manifest verify → queue replay → resume AV dispatch last；§9 Non-Claims 明確聲明未 apply 真實 GCP。
- `infra/gcp/phase2/av-sandbox-infra-config.json:*` — repo-local infra JSON，test case #4 用它交叉驗 bucket retention 與 dead-letter topic 對齊。

### Gap / Watch Summary

| 觀察 | 影響 | 根本原因 |
| --- | --- | --- |
| 啟用中的 integration gate **拒絕 `branch_pushed`** 收尾：closeout `4050a40f`（on `codex/p2-nfr-001-closeout`）**未** reachable from `dev` | parent finalize 目標已自 `branch_pushed` 改為 `INTEGRATION_STATUS=merged_to_dev`（或 `dev_deployed`）；不能標 `merged_to_dev`/`dev_deployed` 直到 commit merge 進 dev；acceptance 要分「branch review-approved/pushed」與「merged-to-dev」兩層 | gate `enabled:true` 只收 `merged_to_dev`/`dev_deployed`/`not_applicable`；commit 已 non-force push 但尚未 merge 進 dev，owner `done` 被拒、等外部 integrator merge |
| parent 已自 `in_progress`→`review` 進到 `review_approved`，reviewer `Codex2` 已 approve closeout | parent 已通過 reviewer 驗收，現處 owner-closeout（被 gate 擋在 `done` 前）；本 sidecar 須對齊 `review_approved`，不再描述 parent 為 `review`/`in_progress` | owner 完成 closeout commit + 重跑驗證後 re-handoff，reviewer approve 通過 |
| PR #885 仍 `OPEN`/`UNSTABLE`（`e2e`+`ci-integ` FAILURE），但已非 stated 整合載具 | 避免把 parent 完成度誤讀成「需 PR #885 merge」；PR #885 留作 lineage | parent 改走 branch-pushed closeout；PR #885 未被主動關閉但不再驅動整合 |
| isolated worktree 缺 `node_modules/vitest` | 無法在此 sidecar 重跑 unit/typecheck | 工作樹未安裝 deps；只能引用 owner closeout-time evidence |
| integration commit lineage 變動（orphaned `d6e009ace` → `015eba49a`/PR #884 closed → `85524fbb`/PR #885 open → `4050a40f`/closeout branch，四者內容相同） | reviewer 須確認驗收對象是目前 closeout head `4050a40f` | 連續另推分支以符合 protected-branch linear-history 並換整合策略；前述 commit 皆 superseded/orphaned |
| 全部為 repo-local config/docs，無真實 GCP | acceptance 不得宣稱 live infra 已存在 | spec 12 本就是 repo-local，no live apply（runbook §9 Non-Claims 已自證） |

---

## 3) Parent Acceptance Framing

`P2-NFR-001` 的 machine-truth `acceptance[]` 只有一條：

> "Bucket+topic+retention config landed as code/config; DR runbook complete; no live GCP mutation; config validated by lint/test where applicable"

以下 checklist 把該條與 `summary_zh`（spec 12）展開成 reviewer-facing 條目，不新增產品語意。

### AC-1 — Storage bucket layout landed as code/config with versioning + retention + hold + CMEK

- [ ] `Phase2AvBucketName` union 包含 spec 12 全部 6 個 bucket，順序與 test 斷言一致（`phase2-av-infra-config.ts:1-7`、test:12-19）。
- [ ] 每個 bucket 帶 `versioning: true`、`retentionDays`、`objectHoldMode`、`retentionLock`、`cmekKey`（`phase2-av-infra-config.ts:21-29`）。
- [ ] incident/regulatory 家族（`video-incident-locked` / `investigation-bundles` / `regulatory-reports`）的 hold/lock 比 routine 家族嚴格（`phase2-av-infra-config.ts:107-153`、test:30-56）。

### AC-2 — Pub/Sub topic definitions + KMS/Secret wiring landed

- [ ] `Phase2AvTopicName` 定義 6 topic，含 DR 用 `dr-restore-verify`（`phase2-av-infra-config.ts:9-15`）。
- [ ] topic config 帶 `ordering` / `retentionDays` / optional `deadLetterTopic`；dead-letter 與 infra JSON 對齊（test #4，`av-sandbox-infra-config.json`）。
- [ ] KMS keyring/location/keys 與 Secret Manager accessors 落在 config + runbook §4（`phase2-av-infra-config.ts:58-83`、runbook:58-95）。

### AC-3 — Policy-driven retention + telemetry data-quality table landed

- [ ] retention 為 policy-driven（runbook §5），不是散落 magic number。
- [ ] telemetry field rules 涵蓋 identity / freshness / location / schema-drift，每條有 `qualityRule` + `breachAction`（`phase2-av-infra-config.ts:51-55,268-322`、test #5、runbook §6）。

### AC-4 — DR runbook complete（multi-zone / durable queue / restore test / manifest verify / ROC degraded / no-new-AV-dispatch）

- [ ] runbook 含 trigger、recovery goals、ordered procedure、restore-test checklist（runbook §7-§8）。
- [ ] procedure 明確：freeze new AV dispatch → ROC degraded（telemetry read-only、no new AV admit）→ per-family restore → manifest verify（count/checksum/CMEK）→ queue replay → **resume new AV dispatch last**（runbook:151-186）。
- [ ] restore-test checklist 證 incident video 維持 hold、regulatory objects 維持 locked、replay 不產生重複 manifest（runbook:188-195）。

### AC-5 — No live GCP mutation；validated by lint/test where applicable

- [ ] runbook §9 Non-Claims 明確不宣稱 live GCP/多區複製/Tesla 憑證/自動 resume 已存在（runbook:197-206）。
- [ ] 變更僅 config TS + repo-local JSON/README + runbook，無 IaC apply / deploy step。
- [ ] config 有 vitest 覆蓋（`phase2-av-infra-config.test.ts` 5 cases）；reviewer 接受 owner closeout-time `CI=true pnpm install --frozen-lockfile` + `vitest run` + `typecheck`（parent `next` 記錄成功）為驗證證據（本 sidecar isolated worktree 因缺 deps 無法重跑）。注意 PR #885 上殘留的 `e2e`/`ci-integ` `FAILURE` 屬已被取代的 PR-merge gate，parent 已改走 branch-pushed closeout，不屬本 config 單元覆蓋範圍。

### AC-6 — Integration state honestly separated from branch acceptance

- [ ] reviewer 確認 acceptance 對象 commit：目前 closeout head `4050a40f`（`origin/codex/p2-nfr-001-closeout`，subject `P2-NFR-001: finalize phase2 AV infra config and DR runbook`）；其內容等同舊 `85524fbb`（PR #885 head）/`015eba49a`（PR #884，已 closed）；原 review-approved `d6e009ace` 已 orphaned。
- [ ] parent **未** merged to `dev`：closeout commit `4050a40f` 已 non-force push 但 **NOT reachable from `origin/dev`**。啟用中的 integration gate 因此**拒絕 `branch_pushed`** 收尾，parent finalize 目標已改為 `INTEGRATION_STATUS=merged_to_dev`（或 `dev_deployed`，需 deploy 證據）；在 commit merge 進 dev 前不得宣稱 `merged_to_dev`/`dev_deployed`，也不得用 `branch_pushed` 標 parent `done`。PR #884 `CLOSED`、PR #885 仍 `OPEN`/`UNSTABLE` 但已非 stated 整合載具。
- [ ] 本 sidecar 不推進/不重開 PR #884/#885、不 push/改 closeout branch、不診斷或修 parent CI 失敗、不改 parent code、不替 parent 標狀態（含不替 parent 記錄 review approval）。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`P2-NFR-001.depends_on=["P2-WP0"]`。

| Dep | Source | Status | Notes |
| --- | --- | --- | --- |
| D-UP-1 | `P2-WP0` | `done` | Phase2 contracts + DD foundation（PR #875 已落 dev）；parent 唯一正式 upstream gate，已滿足 |

### Practical Review / Integration Dependencies

| Dep | Type | Why It Matters |
| --- | --- | --- |
| D-P-1 | closeout branch `codex/p2-nfr-001-closeout @ 4050a40f` | parent stated 整合載具（branch-pushed closeout）；non-force pushed 但 NOT reachable from `dev`；reviewer `Codex2` 已 approve（parent `review_approved`），但啟用中的 integration gate 拒絕 `branch_pushed`，parent finalize 目標改為 `INTEGRATION_STATUS=merged_to_dev`，待外部 integrator merge 進 dev |
| D-P-2 | superseded PR #885 (`codex2/p2-nfr-001-dev-linear-v2` → `dev`) | 仍 `OPEN`/`MERGEABLE`/`UNSTABLE`（`e2e`+`ci-integ` FAILURE），但已非 stated 整合載具；head `85524fbb` 內容等同 closeout `4050a40f` |
| D-P-3 | superseded PR #884/#882 | 皆 `CLOSED`（未 merge）；留作 lineage；orphaned `d6e009ace` 為原 review-approved lineage |
| D-P-4 | repo-local infra JSON `av-sandbox-infra-config.json` | test #4 用它交叉驗 bucket retention / dead-letter，是 config 真相的 fixture，不是 live infra |
| D-P-5 | isolated-worktree dep gap (`vitest` missing) | 說明為何此 sidecar 不重跑測試，只引用 owner closeout-time evidence |

### Truth Sources

- L0 Collaboration: `ai-status.json`（via `scripts/ai-status.sh show`）, `current-work.md`, `ai-activity-log.jsonl`
- L1 Product Truth: spec 12 storage/retention/DR 要求（反映於 parent `summary_zh`）
- Repo anchors（`origin/codex/p2-nfr-001-closeout @ 4050a40f`，內容等同 `85524fbb`/`015eba49a`）:
  - `apps/api/src/config/phase2-av-infra-config.ts`
  - `apps/api/src/config/index.ts`
  - `apps/api/tests/unit/phase2-av-infra-config.test.ts`
  - `docs/03-runbooks/phase2-av-dr-and-retention-runbook-20260626.md`
  - `infra/gcp/phase2/av-sandbox-infra-config.json`
  - `infra/gcp/phase2/README.md`
- Integration evidence: closeout branch `git log origin/codex/p2-nfr-001-closeout`（commit `4050a40f`，NOT reachable from `dev`）；superseded PRs `gh pr view 885` (OPEN/UNSTABLE)、`gh pr view 884` (CLOSED)、`gh pr view 882` (CLOSED)

---

## 5) Evidence Inventory

| ID | Evidence | Expected Anchor |
| --- | --- | --- |
| E-1 | Parent / sidecar machine state | `ai-status.json` rows for `P2-NFR-001`, `P2-NFR-001-SIDECAR-ACCEPTANCE` |
| E-2 | Upstream dep satisfied | `P2-WP0` row `done` (PR #875 已落 dev) |
| E-3 | 6 storage buckets landed | `phase2-av-infra-config.ts:1-7,107-153`; test:12-19 |
| E-4 | Versioning/retention/hold/CMEK per bucket | `phase2-av-infra-config.ts:21-29`; test:30-56 |
| E-5 | 6 pub/sub topics + dead-letter | `phase2-av-infra-config.ts:9-15`; test #4 |
| E-6 | KMS + Secret Manager wiring | `phase2-av-infra-config.ts:58-83`; runbook §4 |
| E-7 | Policy-driven retention | runbook §5 |
| E-8 | Telemetry data-quality table + breach actions | `phase2-av-infra-config.ts:51-55,268-322`; test #5; runbook §6 |
| E-9 | DR procedure (ROC degraded / no-new-AV-dispatch / manifest verify) | runbook §7 (`:151-186`) |
| E-10 | Restore-test checklist | runbook §8 (`:188-195`) |
| E-11 | No-live-GCP Non-Claims | runbook §9 (`:197-206`) |
| E-12 | Repo-local infra JSON/README | `infra/gcp/phase2/av-sandbox-infra-config.json`, `infra/gcp/phase2/README.md` |
| E-13 | Vitest coverage (owner closeout-time) | `phase2-av-infra-config.test.ts` (5 cases); parent `next` records successful `CI=true pnpm install --frozen-lockfile` + `vitest run` + `typecheck` |
| E-14 | Integration state | parent now `review_approved` (Codex2 approved); closeout head `4050a40f` (`origin/codex/p2-nfr-001-closeout`, = `85524fbb`/`015eba49a`), NOT reachable from `dev`; integration gate refused `branch_pushed`, finalize target now `INTEGRATION_STATUS=merged_to_dev` (or `dev_deployed`); superseded PR #885 `OPEN`/`UNSTABLE` (`e2e`+`ci-integ` FAILURE), PR #884/#882 `CLOSED`; orphaned `d6e009ace` |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `P2-NFR-001` 現為 `review_approved`（reviewer `Codex2` 已 approve closeout）、**owner=`Claude2`**（chairman 已自 `Codex` reassign 至 `Claude2`，因 `Codex` lane 2/2 terminal loop）、reviewer=`Codex2`、dep=`P2-WP0`（已 `done`）；sidecar 是 owner=`Claude` / reviewer=`Codex2` 的 `in_progress`。
2. landed inventory 是否對齊真實 diff（6 files / +882，closeout head `4050a40f` = 舊 `85524fbb`/`015eba49a`），且 anchor 行號可追溯到 spec 12 的 bucket/topic/retention/DR/telemetry 要求。
3. acceptance framing 是否誠實分層：closeout head（`4050a40f`，`codex/p2-nfr-001-closeout`）已 review-approved 但 commit NOT reachable from `dev`，啟用中的 integration gate **拒絕 `branch_pushed`**，parent finalize 目標已改為 `INTEGRATION_STATUS=merged_to_dev`（或 `dev_deployed`），未 `merged_to_dev`/`dev_deployed`；正確標示 parent 已棄 PR-merge 路線（PR #885 仍 OPEN/UNSTABLE 但非 stated 載具、PR #884/#882 closed），不把 branch review-approved 誤讀成 dev 已 publish。
4. packet 是否保留 no-live-GCP 限制（runbook §9 Non-Claims），不宣稱 live infra/多區複製/Tesla 憑證已存在。
5. packet 是否誠實標示 isolated-worktree 因缺 `vitest` deps 無法重跑，只引用 owner closeout-time evidence，未偽稱已重跑。
6. support artifact 是否完全沒有修改 canonical truth、parent code、推進/重開 PR #885/#884、push/改 closeout branch、或替 parent 記錄 review approval。

**建議核准用語：**

> `P2-NFR-001 acceptance packet ready: machine truth has the parent in review_approved under Claude2/Codex2 (reviewer approved the closeout) with P2-WP0 satisfied, the packet inventories the real 6-file/+882 landed diff on the current closeout head 4050a40f (= old 85524fbb/015eba49a) (buckets/topics/retention/CMEK/DR runbook/telemetry table) against spec 12, honestly separates the review-approved branch-pushed closeout (NOT reachable from dev) from merged-to-dev completion and records that the enabled integration gate refused branch_pushed so the finalize target moved to INTEGRATION_STATUS=merged_to_dev (or dev_deployed), flags that the parent dropped the PR-merge route (PR #885 still OPEN/UNSTABLE but no longer the vehicle, PR #884/#882 closed), preserves the runbook's no-live-GCP Non-Claims, cites owner closeout-time vitest/typecheck instead of claiming a sidecar rerun, and stays within support-only sidecar boundaries.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / landed-inventory drift / integration-vs-branch overclaim / no-live-GCP overclaim / verification overclaim / support-scope violation]`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Claude scripts/ai-status.sh handoff P2-NFR-001-SIDECAR-ACCEPTANCE Codex2 "P2-NFR-001 acceptance packet refreshed to current machine truth at support/sidecars/P2-NFR-001/P2-NFR-001-SIDECAR-ACCEPTANCE.md. Parent now review_approved under Claude2/Codex2 (chairman reassigned owner Codex->Claude2 after the Codex lane hit a 2/2 terminal failure loop; reviewer Codex2 already approved the closeout), dep P2-WP0 done. Integration vehicle is a branch-pushed closeout: commit 4050a40f on origin/codex/p2-nfr-001-closeout (NOT reachable from dev, re-verified), content-identical to old 85524fbb/015eba49a. Inventories the real 6-file/+882 landed diff (6 buckets + 6 topics + CMEK/Secret wiring + policy-driven retention + DR runbook + telemetry data-quality table) against spec 12. Integration honestly separated: the enabled integration gate REFUSED branch_pushed because closeout HEAD is not reachable from dev, so parent finalize target moved to INTEGRATION_STATUS=merged_to_dev (or dev_deployed); commit not merged_to_dev; the PR-merge route is dropped (PR #885 still OPEN/UNSTABLE with e2e+ci-integ FAILURE but no longer the vehicle, PR #884/#882 CLOSED). Preserves the runbook no-live-GCP Non-Claims, cites owner closeout-time install/vitest/typecheck instead of claiming a sidecar rerun, and stays within support-only sidecar boundaries."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve P2-NFR-001-SIDECAR-ACCEPTANCE "P2-NFR-001 acceptance packet ready: parent is review_approved under Claude2/Codex2 (reviewer approved the closeout) with P2-WP0 satisfied, the packet inventories the real landed diff on the closeout head 4050a40f (= old 85524fbb/015eba49a) against spec 12, honestly separates the review-approved branch-pushed closeout (NOT reachable from dev) from merged-to-dev completion, records that the enabled integration gate refused branch_pushed so the finalize target moved to merged_to_dev (or dev_deployed), notes the dropped PR-merge route (PR #885 OPEN/UNSTABLE but no longer the vehicle, PR #884/#882 closed), preserves the no-live-GCP Non-Claims, cites owner closeout-time install/vitest/typecheck instead of claiming a sidecar rerun, and stays within support-only sidecar boundaries."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen P2-NFR-001-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / landed-inventory drift / integration-vs-branch overclaim / no-live-GCP overclaim / verification overclaim / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Claude`）收尾。本 sidecar 為 support-only artifact，但已產生 task-scoped commit（packet 檔案）並 push，因此提供 commit/push evidence；integration 層級為 `not_applicable`（support packet，不改 dev runtime）。

```bash
AI_NAME=Claude \
  COMMIT_HASH=<sha> \
  COMMIT_SUBJECT="P2-NFR-001-SIDECAR-ACCEPTANCE: acceptance packet + dependency map" \
  PUSH_REMOTE=origin \
  PUSH_BRANCH=claude/p2-nfr-001-sidecar-acceptance \
  INTEGRATION_STATUS=not_applicable \
  scripts/ai-status.sh done P2-NFR-001-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for P2-NFR-001 at support/sidecars/P2-NFR-001/P2-NFR-001-SIDECAR-ACCEPTANCE.md. The packet preserves machine truth (parent review_approved under Claude2/Codex2, dep P2-WP0 satisfied), inventories the real landed diff on closeout head 4050a40f (= old 85524fbb/015eba49a), separates the review-approved branch-pushed closeout (NOT reachable from dev) from merged-to-dev completion, records that the enabled integration gate refused branch_pushed so the parent finalize target moved to merged_to_dev (or dev_deployed), notes the dropped PR-merge route (PR #885 OPEN/UNSTABLE, PR #884/#882 closed), and changes no canonical truth."
```

> 若改走 `NO_COMMIT_REQUIRED=1` 純 support 收尾路徑，需確認該 sidecar lane 接受 no-commit；否則以上 commit/push evidence path 為準。
> Parent finalize 仍由 parent owner `Claude2`（chairman 已自 `Codex` reassign）、reviewer `Codex2` 與外部 integrator 決定，不由此 sidecar 自動推進：reviewer `Codex2` 已 approve，但啟用中的 integration gate 拒絕 `branch_pushed`，owner `Claude2` 須等 closeout commit `4050a40f` merge 進 `dev`、再以 `INTEGRATION_STATUS=merged_to_dev`（或 `dev_deployed`）標 parent `done`。

---

## 10) Change Log

- 2026-06-26T01:58Z — 初版建立：依 shared L0 truth（parent `P2-NFR-001` in_progress / Codex2 / Codex、dep `P2-WP0` done）、PR #884 integration 狀態、與 `origin/codex2/p2-nfr-001-dev-linear @ 015eba49a` 的真實 6-file/+882 diff 掃描，整理 acceptance checklist（AC-1..AC-6）、dependency map、evidence inventory、reviewer handoff / closeout 指引；明確分層 branch review-approval（`d6e009ace`）與 blocked integration（PR #884），保留 runbook no-live-GCP Non-Claims，並標示 isolated-worktree vitest dep gap。
- 2026-06-26T02:10Z — 依 supervisor `next` 重整為當前 machine truth：parent owner/reviewer 自 `Codex2`/`Codex` 對調為 `Codex`/`Codex2`（仍 in_progress、owner closeout、rebasing）；PR #884 已 `CLOSED`（未 merge，被取代），活躍 integration PR 改為 #885（`codex2/p2-nfr-001-dev-linear-v2 @ 85524fbb`，內容等同 `015eba49a`），狀態 `OPEN`/`MERGEABLE`/`UNSTABLE`（`e2e`+`ci-integ` FAILURE、其餘 12 check 綠）；原 review-approved `d6e009ace` 已 orphaned。同步更新 header、§2 baseline、landed inventory anchor、Gap/Watch 表、AC-5/AC-6、§4 dependency map、§5 E-13/E-14、§6 hotspots、§7 handoff、§8 approve、§9 closeout 文字。內容仍 support-only，未改 canonical truth。
- 2026-06-26T02:20Z — 依 supervisor `next` 第二次重整為當前 machine truth：parent `P2-NFR-001` 已自 `in_progress` 進到 `status=review`（owner=`Codex`、reviewer=`Codex2`、`last_update=2026-06-26T02:14:10Z`）；整合載具自 PR-merge-to-dev **改為 branch-pushed closeout**：新 closeout commit `4050a40f885cdf968203c9d53c981cf9ab250a65`（subject `P2-NFR-001: finalize phase2 AV infra config and DR runbook`）已 non-force push 於 `origin/codex/p2-nfr-001-closeout`，`git merge-base --is-ancestor` 確認 NOT reachable from `dev`，內容與舊 `85524fbb`/`015eba49a` 完全相同（empty diff），6-file/+882；parent finalize 目標為 `INTEGRATION_STATUS=branch_pushed`，owner 已重跑 `CI=true pnpm install --frozen-lockfile`+`vitest run`+`typecheck`，等待 reviewer `Codex2` approve。PR #885 仍 `OPEN`/`UNSTABLE` 但已非 stated 載具，PR #884/#882 `CLOSED`。同步更新 header、§1 scope、§2 baseline + landed inventory + repo anchors + Gap/Watch 表、AC-5/AC-6、§4 dependency map + truth sources、§5 E-2/E-13/E-14、§6 hotspots + 建議用語、§7 handoff、§8 approve、§9 closeout 文字。內容仍 support-only，未改 canonical truth。
- 2026-06-26T02:31Z — 依 supervisor `next` 第四次重整為當前 machine truth（owner reassign drift 修正）：parent `P2-NFR-001` **owner 已自 `Codex` reassign 為 `Claude2`**（chairman 於 `2026-06-26T02:28:52Z` 重指派，因 `Codex` owner lane 在此 task 上 2/2 terminal failure loop；`Claude2` 健康且與 reviewer `Codex2` 維持 owner/reviewer 分離），parent 仍 `status=review_approved`、reviewer=`Codex2`、`last_update=2026-06-26T02:28:52Z`。整合事實已重新驗證且不變：closeout commit `4050a40f`（`origin/codex/p2-nfr-001-closeout`）仍 **NOT reachable from `origin/dev`**（`git merge-base --is-ancestor` 重新確認）、`git diff 85524fbb..closeout` 仍為空、landed diff 仍 6-file/+882；PR #885 仍 `OPEN`/`MERGEABLE`/`UNSTABLE`、PR #884 `CLOSED`；finalize 目標維持 `INTEGRATION_STATUS=merged_to_dev`（或 `dev_deployed`）。同步把 header、§1 scope、§2 baseline、§6 hotspot 1、§7 handoff、§9 closeout 註記中的 parent owner 自 `Codex` 改為 `Claude2`，並把所有「under Codex/Codex2」更新為「under Claude2/Codex2」。內容仍 support-only，未改 canonical truth。
- 2026-06-26T02:24Z — 依 supervisor `next` 第三次重整為當前 machine truth（兩處 drift 修正）：(1) parent `P2-NFR-001` 已自 `review` 進到 `status=review_approved`（owner=`Codex`、reviewer=`Codex2`、`last_update=2026-06-26T02:21:05Z`，reviewer `Codex2` 已 approve closeout，parent 現處 owner-closeout）；(2) **finalize 目標自 `branch_pushed` 改為 `merged_to_dev`**：owner `done` 被啟用中的 integration gate 拒絕，因 closeout HEAD `4050a40f` 尚未 reachable from `origin/dev`（已重新以 `git merge-base --is-ancestor` 確認 NOT reachable，且 `git diff 85524fbb..closeout` 仍為空、6-file/+882 不變），gate 只收 `merged_to_dev`/`dev_deployed`/`not_applicable`，parent `next` 明示 finalize 需等 merge 後標 `INTEGRATION_STATUS=merged_to_dev`（或 `dev_deployed`）。同步更新 header status、§2 baseline、Gap/Watch 前兩列、AC-6、§4 D-P-1、§5 E-14、§6 hotspots 1/3 + 建議核准用語、§7 handoff、§8 approve、§9 closeout 文字與註記。內容仍 support-only，未改 canonical truth。
