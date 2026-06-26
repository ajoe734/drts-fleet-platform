# P2-NFR-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `P2-NFR-001` — Phase2 infra/security config + retention + DR runbook (repo-local, no live apply)
**Current Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Codex2`
**Parent Owner / Reviewer:** `Codex` / `Codex2`
**Last Revised:** `2026-06-26T02:10Z (UTC)`
**Status:** `in_progress` — shared L0 keeps sidecar `P2-NFR-001-SIDECAR-ACCEPTANCE` at owner=`Claude`, reviewer=`Codex2`, `last_update=2026-06-26T02:09:51Z`, while the parent `P2-NFR-001` is `in_progress` under owner=`Codex`, reviewer=`Codex2`, mid owner-closeout and still blocked at integration (PR #884 now CLOSED/superseded; active PR #885 → `dev` open but merge-blocked at `UNSTABLE`).

---

## 1) Scope Boundary

本 sidecar 只整理 `P2-NFR-001` 的 acceptance checklist、dependency map、shared-truth snapshot、repo/test evidence anchors 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作或推進其 integration。

- In scope: support-only acceptance framing, dependency mapping, landed-artifact inventory, integration-state snapshot, reviewer checklist, and handoff / closeout commands.
- Out of scope: 編修 `apps/api/src/config/phase2-av-infra-config.ts`、DR runbook、`infra/gcp/phase2/*` JSON/README 本身；推進 PR #885/#884 merge；任何真實 GCP apply/deploy；L1/L2 真相編修；以及 parent owner `Codex` 的主線 closeout 決策。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`（透過 `scripts/ai-status.sh show`）、parent `next` 欄位、PR #885/#884 狀態與目前 repo 掃描為準：

- 父任務 `P2-NFR-001` 在 machine truth 中目前是 `status=in_progress`，Owner=`Codex`，Reviewer=`Codex2`（owner/reviewer 已自 packet 初版的 `Codex2`/`Codex` 對調），`depends_on=["P2-WP0"]`，`last_update=2026-06-26T02:07:47Z`，parent `next` 記為 owner closeout（branch behind `origin/dev`，rebase 後做最終驗證與 closeout commit）。
- 本 sidecar `P2-NFR-001-SIDECAR-ACCEPTANCE` 是 `status=in_progress`，Owner=`Claude`、Reviewer=`Codex2`、`task_class=sidecar`、`helper_parent=P2-NFR-001`、`helper_kind=acceptance_packet`、`mutates_canonical=false`、artifact path=`support/sidecars/P2-NFR-001/P2-NFR-001-SIDECAR-ACCEPTANCE.md`。
- 依賴 `P2-WP0` 已 `done` 並 `merged_to_dev`（PR #875，Phase2 contracts + DD foundation 已落 dev），因此 parent 的正式 upstream gate 已滿足。
- parent 的實作**不在** `dev` 上：目前活躍 integration head 是 linear-v2 commit `85524fbb64f92de45d99de2ebcbb833399f59641`（branch `origin/codex2/p2-nfr-001-dev-linear-v2`，subject `P2-NFR-001: finalize phase2 av infra and DR runbook`），其內容與舊 linear commit `015eba49af2f8eba42f956e97a1027eb9333bf0b`（branch `origin/codex2/p2-nfr-001-dev-linear`）**完全相同**（`git diff 015eba49a..85524fbb` 為空）。原 reviewer-approved commit `d6e009ace731acb6cc451223dfb710cf59bce464` 已不被任何 remote branch reachable（orphaned，被後續 integration vehicle 取代）。三者皆尚未 reachable from `origin/dev`。
- **PR 替換**：舊 PR **#884**（`codex2/p2-nfr-001-dev-linear` → `dev`）已於 `2026-06-26T01:59:18Z` `CLOSED`（未 merge，`mergeCommit=null`），被取代。目前活躍 integration PR 是 **#885**（`codex2/p2-nfr-001-dev-linear-v2` → `dev`，同 title）：`state=OPEN`、`mergeable=MERGEABLE`、`mergeStateStatus=UNSTABLE`。UNSTABLE 來自兩個失敗 check：`e2e=FAILURE`、`ci-integ=FAILURE`；其餘 12 個 check（lint / Commit trailers / typecheck / BFF-only imports / unit / Runtime mirror guard / integration / i18n(-)guard / build / Smoke acceptance / orchestrator-tests）皆 `SUCCESS`。因此 parent 在 PR #885 真正 merge（且失敗 check 解掉）前不能合法標 `done`/`merged_to_dev`。
- parent 接受過的驗證（review 階段記錄、非本 sidecar 重跑）：
  - `pnpm --filter @drts/api exec vitest run tests/unit/phase2-av-infra-config.test.ts`
  - `pnpm --filter @drts/api typecheck`
  - 在 isolated worktree 重跑被 `node_modules/vitest/vitest.mjs` 缺檔擋住；本 sidecar 不宣稱已重跑，只引用 review-time evidence。

### Landed Artifact Inventory（active integration head `85524fbb` = content-identical to `015eba49a`，6 files / +882）

> 以 `git diff --stat origin/dev..origin/codex2/p2-nfr-001-dev-linear-v2` 為準（內容與舊 `origin/codex2/p2-nfr-001-dev-linear @ 015eba49a` 相同；只是 integration vehicle 從 PR #884 換成 PR #885）。

- `apps/api/src/config/phase2-av-infra-config.ts` — +326，infra config 真相：6 storage bucket、6 pub/sub topic、KMS keyring/keys、Secret Manager accessors、telemetry data-quality field rules，外加 `resolvePhase2AvInfraConfig(env)` env-driven resolver。
- `apps/api/src/config/index.ts` — +1，barrel export `export * from "./phase2-av-infra-config";`（新建 `config/` index）。
- `apps/api/tests/unit/phase2-av-infra-config.test.ts` — +144，vitest 5 cases（見 §5）。
- `docs/03-runbooks/phase2-av-dr-and-retention-runbook-20260626.md` — +206，DR + retention runbook（9 sections，含 Non-Claims）。
- `infra/gcp/phase2/av-sandbox-infra-config.json` — +147，repo-local infra contract（`configVersion`/`scope`/`phase`/`gcp{projectVariable,regionVariable,storageBuckets,pubsubTopics,kms,secretManager}`）。
- `infra/gcp/phase2/README.md` — +58，repo-local infra plan（Files / Storage Layout / CMEK + Secret Wiring / Pub/Sub Topics）。

### Repo Baseline Anchors（all on `origin/codex2/p2-nfr-001-dev-linear-v2 @ 85524fbb`，line numbers unchanged vs `015eba49a`）

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
| parent 實作不在 `dev`（PR #884 `CLOSED`/superseded，活躍 PR #885 `UNSTABLE`） | parent 不能合法標 `done`/`merged_to_dev`；acceptance 要分「branch review-approved」與「integration closed」兩層 | branch protection 要求 PR + required checks；PR #885 仍有 `e2e` + `ci-integ` 兩個失敗 check |
| PR #885 `e2e=FAILURE`、`ci-integ=FAILURE` | merge gate 卡在 `UNSTABLE`；其餘 12 check 綠 | 兩個失敗 check 需 parent owner 解；本 sidecar 不診斷/不修 parent CI |
| isolated worktree 缺 `node_modules/vitest` | 無法在此 sidecar 重跑 unit/typecheck | 工作樹未安裝 deps；只能引用 review-time + PR #885 CI evidence |
| integration commit lineage 變動（orphaned `d6e009ace` review-approved → `015eba49a`/PR #884 closed → `85524fbb`/PR #885 active，三者內容相同） | reviewer 須確認驗收對象是目前活躍 head `85524fbb` | 為符合 protected-branch linear-history + 換 PR vehicle 連續另推分支；`d6e009ace` 已 orphaned |
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
- [ ] config 有 vitest 覆蓋（`phase2-av-infra-config.test.ts` 5 cases）；reviewer 接受 review-time `vitest run` + `typecheck`，以及 PR #885 CI 上 `unit`/`typecheck`/`lint`/`build`/`integration` 等綠 check 為驗證證據（isolated worktree 因缺 deps 無法重跑）。注意 PR #885 的 `e2e` 與 `ci-integ` 為 `FAILURE`，屬 parent integration gate，非本 config 單元覆蓋範圍。

### AC-6 — Integration state honestly separated from branch acceptance

- [ ] reviewer 確認 acceptance 對象 commit：目前活躍 integration head `85524fbb`（`codex2/p2-nfr-001-dev-linear-v2`，PR #885 head）；其內容等同舊 linear `015eba49a`（PR #884，已 closed）；原 review-approved `d6e009ace` 已 orphaned。
- [ ] parent **未** merged to `dev`：PR #884 已 `CLOSED`（未 merge，被取代）；活躍 PR #885 `OPEN` / `MERGEABLE` / `mergeStateStatus=UNSTABLE`（`e2e` + `ci-integ` FAILURE）。parent closeout 不得宣稱 `merged_to_dev` 或 `dev_deployed`，直到 PR #885 失敗 check 解掉並真正 merge。
- [ ] 本 sidecar 不推進/不重開 PR #884/#885、不診斷或修 parent CI 失敗、不改 parent code、不替 parent 標狀態。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`P2-NFR-001.depends_on=["P2-WP0"]`。

| Dep | Source | Status | Notes |
| --- | --- | --- | --- |
| D-UP-1 | `P2-WP0` | `done` / `merged_to_dev` | Phase2 contracts + DD foundation（PR #875 已落 dev）；parent 唯一正式 upstream gate，已滿足 |

### Practical Review / Integration Dependencies

| Dep | Type | Why It Matters |
| --- | --- | --- |
| D-P-1 | PR #885 (`codex2/p2-nfr-001-dev-linear-v2` → `dev`) | 目前活躍 parent integration gate；`UNSTABLE`（`e2e` + `ci-integ` FAILURE）直到失敗 check 解掉 + branch-protection 通過 + merge |
| D-P-2 | superseded PR #884 (`codex2/p2-nfr-001-dev-linear`) | 已 `CLOSED`（未 merge）；被 PR #885 取代，留作 lineage 記錄 |
| D-P-3 | active integration commit `85524fbb` | PR #885 head；內容等同舊 `015eba49a`；orphaned `d6e009ace` 為原 review-approved lineage |
| D-P-4 | repo-local infra JSON `av-sandbox-infra-config.json` | test #4 用它交叉驗 bucket retention / dead-letter，是 config 真相的 fixture，不是 live infra |
| D-P-5 | isolated-worktree dep gap (`vitest` missing) | 說明為何此 sidecar 不重跑測試，只引用 review-time + PR #885 CI evidence |

### Truth Sources

- L0 Collaboration: `ai-status.json`（via `scripts/ai-status.sh show`）, `current-work.md`, `ai-activity-log.jsonl`
- L1 Product Truth: spec 12 storage/retention/DR 要求（反映於 parent `summary_zh`）
- Repo anchors（`origin/codex2/p2-nfr-001-dev-linear-v2 @ 85524fbb`，內容等同 `015eba49a`）:
  - `apps/api/src/config/phase2-av-infra-config.ts`
  - `apps/api/src/config/index.ts`
  - `apps/api/tests/unit/phase2-av-infra-config.test.ts`
  - `docs/03-runbooks/phase2-av-dr-and-retention-runbook-20260626.md`
  - `infra/gcp/phase2/av-sandbox-infra-config.json`
  - `infra/gcp/phase2/README.md`
- Integration evidence: active PR #885 (`gh pr view 885`)；superseded PR #884 (`gh pr view 884`, CLOSED)

---

## 5) Evidence Inventory

| ID | Evidence | Expected Anchor |
| --- | --- | --- |
| E-1 | Parent / sidecar machine state | `ai-status.json` rows for `P2-NFR-001`, `P2-NFR-001-SIDECAR-ACCEPTANCE` |
| E-2 | Upstream dep satisfied | `P2-WP0` row `done` / `merged_to_dev` (PR #875) |
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
| E-13 | Vitest coverage (review-time + CI) | `phase2-av-infra-config.test.ts` (5 cases); parent `next` records `vitest run` + `typecheck`; PR #885 `unit`/`typecheck` checks SUCCESS |
| E-14 | Integration state | PR #884 `CLOSED`/superseded; active PR #885 `OPEN` / `MERGEABLE` / `UNSTABLE` (`e2e`+`ci-integ` FAILURE, 12 checks SUCCESS); active head `85524fbb` (= `015eba49a`); orphaned `d6e009ace` |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `P2-NFR-001` 仍是 `in_progress`、owner=`Codex`、reviewer=`Codex2`（已自初版 Codex2/Codex 對調）、dep=`P2-WP0`（已 `done`）；sidecar 是 owner=`Claude` / reviewer=`Codex2` 的 `in_progress`。
2. landed inventory 是否對齊真實 diff（6 files / +882，active head `85524fbb` = 舊 `015eba49a`），且 anchor 行號可追溯到 spec 12 的 bucket/topic/retention/DR/telemetry 要求。
3. acceptance framing 是否誠實分層：active integration head（`85524fbb`，PR #885）vs integration 完成（PR #885 `UNSTABLE`、`e2e`+`ci-integ` FAILURE，未 `merged_to_dev`；PR #884 已 closed/superseded），不把 branch 完成誤讀成 dev 已 publish。
4. packet 是否保留 no-live-GCP 限制（runbook §9 Non-Claims），不宣稱 live infra/多區複製/Tesla 憑證已存在。
5. packet 是否誠實標示 isolated-worktree 因缺 `vitest` deps 無法重跑，只引用 review-time evidence，未偽稱已重跑。
6. support artifact 是否完全沒有修改 canonical truth、parent code、或推進/重開 PR #885/#884。

**建議核准用語：**

> `P2-NFR-001 acceptance packet ready: machine truth keeps the parent in_progress under Codex/Codex2 with P2-WP0 satisfied, the packet inventories the real 6-file/+882 landed diff on the active integration head 85524fbb (= old 015eba49a) (buckets/topics/retention/CMEK/DR runbook/telemetry table) against spec 12, honestly separates the active branch head from blocked integration (PR #884 closed/superseded, active PR #885 UNSTABLE with e2e+ci-integ FAILURE, not merged_to_dev), preserves the runbook's no-live-GCP Non-Claims, flags the isolated-worktree vitest gap instead of claiming a rerun, and stays within support-only sidecar boundaries.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / landed-inventory drift / integration-vs-branch overclaim / no-live-GCP overclaim / verification overclaim / support-scope violation]`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Claude scripts/ai-status.sh handoff P2-NFR-001-SIDECAR-ACCEPTANCE Codex2 "P2-NFR-001 acceptance packet refreshed to current machine truth at support/sidecars/P2-NFR-001/P2-NFR-001-SIDECAR-ACCEPTANCE.md. Parent now in_progress under Codex/Codex2 (owner/reviewer swapped), dep P2-WP0 done/merged_to_dev. Inventories the real 6-file/+882 landed diff on the active integration head 85524fbb (codex2/p2-nfr-001-dev-linear-v2, content-identical to old 015eba49a) (6 buckets + 6 topics + CMEK/Secret wiring + policy-driven retention + DR runbook + telemetry data-quality table) against spec 12. Integration honestly separated: PR #884 CLOSED/superseded, active PR #885 open/mergeable/UNSTABLE with e2e+ci-integ FAILURE (12 other checks green), not merged_to_dev. Preserves the runbook no-live-GCP Non-Claims, flags the isolated-worktree vitest dep gap instead of claiming a rerun, and stays within support-only sidecar boundaries."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve P2-NFR-001-SIDECAR-ACCEPTANCE "P2-NFR-001 acceptance packet ready: parent stays in_progress under Codex/Codex2 with P2-WP0 satisfied, the packet inventories the real landed diff on the active integration head 85524fbb (= old 015eba49a) against spec 12, honestly separates the active head from blocked integration (PR #884 closed/superseded, active PR #885 UNSTABLE with e2e+ci-integ FAILURE), preserves the no-live-GCP Non-Claims, flags the vitest dep gap instead of claiming a rerun, and stays within support-only sidecar boundaries."
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
  scripts/ai-status.sh done P2-NFR-001-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for P2-NFR-001 at support/sidecars/P2-NFR-001/P2-NFR-001-SIDECAR-ACCEPTANCE.md. The packet preserves machine truth (parent in_progress under Codex/Codex2, dep P2-WP0 satisfied), inventories the real landed diff on active integration head 85524fbb (= old 015eba49a), separates the active head from blocked integration (PR #884 closed/superseded, active PR #885 UNSTABLE not merged_to_dev), and changes no canonical truth."
```

> 若改走 `NO_COMMIT_REQUIRED=1` 純 support 收尾路徑，需確認該 sidecar lane 接受 no-commit；否則以上 commit/push evidence path 為準。
> Parent absorption / 主線整合（PR #885 merge → `dev`，需先解 `e2e`+`ci-integ` 失敗 check）仍由 parent owner `Codex` 與外部 integrator 決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-06-26T01:58Z — 初版建立：依 shared L0 truth（parent `P2-NFR-001` in_progress / Codex2 / Codex、dep `P2-WP0` done）、PR #884 integration 狀態、與 `origin/codex2/p2-nfr-001-dev-linear @ 015eba49a` 的真實 6-file/+882 diff 掃描，整理 acceptance checklist（AC-1..AC-6）、dependency map、evidence inventory、reviewer handoff / closeout 指引；明確分層 branch review-approval（`d6e009ace`）與 blocked integration（PR #884），保留 runbook no-live-GCP Non-Claims，並標示 isolated-worktree vitest dep gap。
- 2026-06-26T02:10Z — 依 supervisor `next` 重整為當前 machine truth：parent owner/reviewer 自 `Codex2`/`Codex` 對調為 `Codex`/`Codex2`（仍 in_progress、owner closeout、rebasing）；PR #884 已 `CLOSED`（未 merge，被取代），活躍 integration PR 改為 #885（`codex2/p2-nfr-001-dev-linear-v2 @ 85524fbb`，內容等同 `015eba49a`），狀態 `OPEN`/`MERGEABLE`/`UNSTABLE`（`e2e`+`ci-integ` FAILURE、其餘 12 check 綠）；原 review-approved `d6e009ace` 已 orphaned。同步更新 header、§2 baseline、landed inventory anchor、Gap/Watch 表、AC-5/AC-6、§4 dependency map、§5 E-13/E-14、§6 hotspots、§7 handoff、§8 approve、§9 closeout 文字。內容仍 support-only，未改 canonical truth。
