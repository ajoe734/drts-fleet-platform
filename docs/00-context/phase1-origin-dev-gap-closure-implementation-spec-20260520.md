# Phase 1 `origin/dev` 落差一次性補齊實作規格書

**文件版本**：v1.0
**日期**：2026-05-20
**適用 repo**：`ajoe734/drts-fleet-platform`
**適用分支**：`origin/dev` / `dev`
**文件對象**：系統設計、開發團隊、QA、DevOps、Mobile、外部整合負責人
**文件性質**：Implementation Directive（非討論稿）

---

> **歸檔備註（2026-05-22）**
>
> 本檔是上游交付的不可變指令稿，逐字保留原文。對照當前 `origin/dev` 真實狀態與後續實作分派路徑，請參閱：
>
> - `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`（status truth）
> - `.orchestrator/task-briefs/PH1GC-*.md`（拆分後的可派工 briefs）

---

## 0. 結論與執行原則

`origin/dev` 目前已完成 Phase 1 大部分 repo-local 功能、UI redesign、Tenant Governance backend contracts、Tenant Console、Platform Admin、Driver App、Partner Booking repo-local surface，以及 production rail dry-run contract 基礎。但仍未達到 **Phase 1 business-flow complete**。

本文件將指明從 Phase 1 落差至能可執行任務一次性收斂。開發團隊不得回到這些事項提案、不重段再討論。全部直接寫成 **Phase 1 Final Gap Closure Work Package**。

### 0.1 不允使用的完成標準

以下都不能作為 Phase 1 完成標準：

- UI closeout done
- backend contract done
- sidecar produced
- typecheck / build passed
- unit test passed
- storybook parity done
- repo-local done
- dry-run contract evidence only

### 0.2 必須使用的完成標準

每段 business flow 必須具備：

1. workflow-family row
2. UAT scenario 或 runbook
3. executable E2E / smoke / evidence packet
4. gate read
5. evidence classification
6. audit / reporting proof
7. rollback / non-claim statement
8. owner / reviewer / PR / commit / verification command

### 0.3 單一工作包原則

本文件列出的所有任務必須一次性納入工作包。可以平行開 PR，也可以依依賴順序 merge，但不得把任何項目排除在 Phase 1 補齊範圍之外。

---

## 1. 目前 `origin/dev` 實體的整體覆蓋

### 1.1 已完成或大致完成

| 區塊                    | 目前狀態                                                                                     | 判斷                        |
| ----------------------- | -------------------------------------------------------------------------------------------- | --------------------------- |
| Canonical Backend / BFF | `drts-fleet-platform` 持續作為 backend / BFF / contracts authority                           | 符合藍圖                    |
| Tenant Governance       | Cost center、approval rules、quota、approval workflow 已在 dev closeout 中標示完成           | 大致符合藍圖                |
| Tenant Console UI       | `TEN-UI-RD-001` 到 `TEN-UI-RD-018` 已 closeout                                               | UI 符合藍圖                 |
| Platform Admin UI       | `ADM-UI-RD-001` 到 `ADM-UI-RD-009` 已 closeout                                               | UI 符合藍圖                 |
| Driver App UI           | Workspace / inbox / trip / platform presence / earnings / shift / SOS / settings 已 closeout | UI 符合藍圖                 |
| Partner Booking Web     | `apps/partner-booking-web` 已建立 white-label surface                                        | repo-local 符合藍圖         |
| Branch strategy         | nightly publish + hourly promote + prod tag model 已定義                                     | release governance 方向正確 |

### 1.2 尚未完整閉鏈

| 缺口                                    | 現況                                                  | 必須補齊                                     |
| --------------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| Release matrix 未完整收容 v3 resolution | 仍留舊者 ID / 缺 row / 缺 workflow gate               | 更新成最 workflow-family rows                |
| E2E-010 / E2E-011 缺                    | Governance finance / admin control-plane E2E 尚未落地 | 新增兩支 E2E shell scripts                   |
| Driver Multi-Platform proof 不硬        | `E2E-006` 可因 seed 缺失 warning skip                 | 改為 deterministic seed 或 sandbox hard gate |
| Forwarder external proof                | `WF-FWD-001` 仍為 external-gated                      | 至少 sandbox evidence                        |
| Partner eligibility live proof          | 仍是 static evidence / issuer external-gated          | 至少 issuer sandbox evidence                 |
| Partner Booking cutover                 | repo-local done，但 live owner 尚未切換               | partner-entry pilot cutover proof            |
| CTI / filing                            | sandbox evidence，live provider gate 尚未閉鎖         | provider/scheduler/retention proof           |
| Production rail                         | dry-run contract evidence，非 live prod execution     | production dry-run + rollback drill          |
| 設計文件補齊                            | v3 resolution 已補決，但部分實檔未落地                | 5 份實貢 doc + 12 份 thin stub               |

---

## 2. 一次性目標狀態

完成後，Phase 1 的 workflow-family matrix 必須至少含有以下 rows，且全部明確 gate read：

| Workflow family                                         | Target gate read                                       | 操作要求                                                             |
| ------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| `WF-RLS-001` Runtime / deploy / release foundation      | `PASS (live staging evidence)`                         | 保持現有 staging evidence                                            |
| `WF-PROD-001` Production deploy / rollback rail         | `PASS (production dry-run evidence)`                   | prod vars/secrets/WIF/Cloud Run dry run + rollback drill             |
| `WF-TEN-001` Tenant bootstrap / boundary                | `PASS (live staging evidence)`                         | 保持現有 scope isolation proof                                       |
| `WF-ORD-001` Tenant booking intake / owned order        | `PASS (live staging evidence)`                         | 保持現有 booking proof                                               |
| `WF-TGV-001` Tenant Governance                          | `PASS (live staging evidence)`                         | E2E-005 + staging run + billing/report/audit                         |
| `WF-DSP-001` Core dispatch                              | `PASS (live staging evidence)`                         | 保持現有 dispatch proof，補 governance gate note                     |
| `WF-DRV-001` Driver owned task lifecycle                | `PASS (static evidence)` or better                     | 不降低現有 proof                                                     |
| `WF-DRV-MP-001` Driver multi-platform workbench         | `PASS (sandbox + device evidence)`                     | E2E-006 hard gate + Android/iOS install proof                        |
| `WF-FWD-001` Forwarder / third-party platform           | `PASS (sandbox evidence)` minimum                      | inbound / accept / lost race / cancel / complete / settlement sample |
| `WF-PARTNER-001` Partner eligibility / airport transfer | `PASS (sandbox evidence)` minimum                      | issuer sandbox / reference token / airport transfer / reporting      |
| `WF-PBK-001` Partner booking pilot cutover              | `PASS (pilot evidence)`                                | at least one partner entry cutover + rollback proof                  |
| `WF-COM-001` CTI / recording / filing                   | `PASS (sandbox evidence)` plus live-provider non-claim | CTI callback / recording / filing artifact / retention proof         |
| `WF-FIN-001` Baseline finance                           | `PASS (static evidence)` or better                     | 不破壞既有 baseline finance row                                      |
| `WF-FIN-GOV-001` Governance-aware finance               | `PASS (live staging evidence)`                         | E2E-010                                                              |
| `WF-ADM-001` Platform Admin control-plane               | `PASS (repo-local or live staging evidence)`           | E2E-011                                                              |
| `WF-REL-001` Release-truth synchronization              | `PASS (repo-local audit evidence)`                     | release truth sync audit                                             |

---

## 3. 編號與命名裁決

此節不可再討論，直接執行。

### 3.1 E2E 編號

保留 `dev` 已有編號，不重命名 shipped E2E：

```text
E2E-007  Partner Airport Transfer          保留
E2E-008  Partner Booking Cutover           保留
E2E-009  Production Rail Dry-Run           保留
```

新增：

```text
E2E-010-governance-aware-billing-reporting.sh
E2E-011-platform-admin-control-plane.sh
```

### 3.2 Workflow family ID

```text
WF-PRT-001 → WF-PARTNER-001
```

不得保留 alias row。舊 reference 須更新為新 ID。

### 3.3 Finance workflow family

保留兩個 row：

```text
WF-FIN-001      Baseline Billing / Invoice / Report Export
WF-FIN-GOV-001  Governance-aware Billing / Reporting / Settlement
```

`WF-FIN-GOV-001` depends on：

```text
WF-TGV-001
WF-FIN-001
```

---

## 4. 必改檔案總表

### 4.1 Release / UAT / E2E

```text
docs/03-runbooks/phase1-workflow-acceptance-release-gates.md
docs/04-uat/fbp-014a-e2e-matrix.md
tests/e2e/E2E-010-governance-aware-billing-reporting.sh
tests/e2e/E2E-011-platform-admin-control-plane.sh
tests/e2e/E2E-006-driver-multi-platform.sh
```

### 4.2 五份實貢設計文件

```text
docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md
docs/03-runbooks/phase1-release-truth-sync-20260519.md
docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md
docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
docs/04-uat/platform-admin-control-plane-uat-20260519.md
```

### 4.3 十二份 thin stubs

每份 thin stub 必須存在，且只指向 canonical artifact，不重寫自身。

```text
docs/00-context/stubs/tenant-governance-backend-source-of-truth.md
docs/00-context/stubs/tenant-governance-execution-source-of-truth.md
docs/00-context/stubs/tenant-console-ui-source-of-truth.md
docs/00-context/stubs/platform-admin-ui-source-of-truth.md
docs/00-context/stubs/driver-app-ui-source-of-truth.md
docs/00-context/stubs/partner-booking-topology-source-of-truth.md
docs/00-context/stubs/partner-booking-repo-local-ui-source-of-truth.md
docs/00-context/stubs/branch-strategy-source-of-truth.md
docs/00-context/stubs/workflow-acceptance-matrix-source-of-truth.md
docs/00-context/stubs/tenant-contracts-source-of-truth.md
docs/00-context/stubs/ui-design-canvas-source-of-truth.md
docs/00-context/stubs/driver-app-design-canvas-source-of-truth.md
```

### 4.4 External evidence packets

```text
support/sidecars/FWD-LIVE-001/
support/sidecars/PARTNER-ELIG-LIVE-001/
support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/
support/sidecars/WF-COM-001-LIVE-PROVIDER/
support/sidecars/WF-PROD-001-LIVE-EXEC/
support/sidecars/PBK-PILOT-001/
```

---

## 5. Master Worklist：一次性補齊任務

以下任務全部是 Phase 1 Final Gap Closure 的 P0/P1。除明確外部資源 gating 外，不得另行延後。

---

# A. Release Truth / 設計文件補齊

## `BPL-001` — Origin Dev Blueprint Alignment Audit

**Owner role**：System Design / Architecture
**Reviewer role**：Tech Lead + QA Lead
**Output**：

```text
docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md
```

**內容要求**：

- 逐項列出 `origin/dev` 實體現狀
- 對照 Phase 1 藍圖
- 標示：
  - repo-local done
  - UI done
  - backend contract done
  - live staging evidence
  - sandbox evidence
  - external-gated
  - production-gated
  - Phase 2 deferred
- 消除 2026-05-14、2026-05-18、2026-05-20 文件的時序漂移

**驗收**：

- 文件存在
- 引用 latest `current-work.md`
- 每段 workflow family 都有現況
- 沒有「待討論」字樣

---

## `BPL-002` — Release Truth Sync Runbook

**Output**：

```text
docs/03-runbooks/phase1-release-truth-sync-20260519.md
```

**內容要求**：

- E2E 編號最終裁決
- Workflow ID 最終裁決
- matrix row mapping
- sidecar reference mapping
- publish/v*、release/v*、prod/v\* source-of-truth rule
- non-claim wording
- rollback / redploy truth

**驗收**：

- 文件與 branch strategy 不衝突
- 明確指定 `dev` / `publish` / `main` / `prod/v*` 的真值角色
- 能被 release manager 直接使用

---

## `BPL-003` — 12 Thin Stub Files

**Output**：12 份 stub 檔。

**統一格式**：

```md
# <Stub Title>

Status: directive-required thin stub
Canonical artifact: <path>

This file does not redefine product semantics. It points reviewers to the current source of truth.

## Do not restate

Do not copy or reinterpret the canonical artifact here.

## Current source of truth

- <path>
```

**驗收**：

- 12 份皆存在
- 每份只指向 canonical artifact
- 不複寫大段既有文件內容

---

# B. Workflow Matrix / E2E 補齊

## `MATRIX-001` — Release Gate Matrix Full Reconciliation

**Output**：

```text
docs/03-runbooks/phase1-workflow-acceptance-release-gates.md
```

**必動變更**：

1. `WF-PRT-001` 改成 `WF-PARTNER-001`
2. 新增或確認 `WF-TGV-001`
3. 新增 `WF-DRV-MP-001`
4. 新增 `WF-FIN-GOV-001`
5. 新增 `WF-ADM-001`
6. 新增 `WF-REL-001`
7. `WF-PROD-001` gate read 更新為 dry-run / live-exec 兩面描述
8. `WF-FWD-001` 保持 external-gated，直到 sandbox evidence 能落地後才 uplift

**驗收**：

- Matrix 內不存在 `WF-PRT-001`
- Matrix 完整有 16 條 workflow family
- 每條 row 有 named verification path
- 每條 row 有 non-claim

---

## `MATRIX-002` — E2E Matrix Reconciliation

**Output**：

```text
docs/04-uat/fbp-014a-e2e-matrix.md
```

**必動變更**：

- 保留 E2E-007 / 008 / 009
- 新增 E2E-010 / 011
- 把 E2E-006 的 warning-skip 條件寫入 risk，不可當 hard proof
- 把 E2E-010 對映 `WF-FIN-GOV-001`
- 把 E2E-011 對映 `WF-ADM-001`

---

## `E2E-010` — Governance-aware Billing / Reporting

**File**：

```text
tests/e2e/E2E-010-governance-aware-billing-reporting.sh
```

**Workflow**：

```text
create cost center
→ create quota policy
→ create approval rule
→ create booking with costCenterCode
→ approve booking
→ complete trip
→ generate invoice / report
→ verify costCenterCode
→ verify costCenterName / owner
→ verify approval evaluation snapshot reference
→ verify quota usage reference
→ verify partner eligibility reference when applicable
→ verify audit trail
```

**Acceptance**：

- 無 seed 時不得 silent pass
- 所有 evidence 寫入 E2E chain
- error code / audit check 必須存在
- failure must be hard failure

---

## `E2E-011` — Platform Admin Control Plane

**File**：

```text
tests/e2e/E2E-011-platform-admin-control-plane.sh
```

**Workflow**：

```text
platform admin login
→ create tenant
→ enable modules
→ configure quotas
→ create partner entry
→ issue partner credential
→ configure adapter / switchboard
→ publish pricing
→ toggle feature flag
→ promote rollout stage
→ set rollback hold
→ verify audit trail
```

**Acceptance**：

- 全部 mutation 都要 audit
- RBAC negative path 至少 2 個
- pricing publish 必須有 version
- rollback hold 必須阻止 production promote

---

# C. Driver Multi-Platform Workbench

## `DRV-MP-001` — Harden E2E-006 Seed and Gate

**File**：

```text
tests/e2e/E2E-006-driver-multi-platform.sh
```

**目前問題**：缺 mixed owned + forwarded seed 時可 warning 後 exit 0。這不能作為 Phase 1 release proof。

**必改**：

- 增加 deterministic seed mode：
  - one owned task
  - one forwarded task
  - same driver inbox
  - sourcePlatform metadata
  - routeLocked true for forwarded
  - platform earnings fixture
- 若 `E2E_ALLOW_MISSING_FORWARDER_SEED=true` 才可 warning skip，預設必須 hard fail。

**Acceptance**：

- 預設環境沒有 mixed task 時 fail
- seed env 存在時可完整鏈鏈
- 驗證 no owned dispatch assignment for forwarded task
- 驗證 by-platform earnings

---

## `DRV-MP-002` — Mobile Device Evidence Packet

**Output**：

```text
support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/
```

**必須包含**：

- Android install proof
- iOS install proof
- Expo/EAS build profile
- Android signing evidence
- Apple team / TestFlight evidence
- push notification proof
- location permission proof
- weak network proof
- platform online/offline proof
- forwarded task display proof
- earnings display proof

**Gate read**：

```text
WF-DRV-MP-001 = PASS (sandbox + device evidence)
```

---

# D. Forwarder / Third-party Platform

## `FWD-001` — Forwarder Sandbox Proof

**Output**：

```text
support/sidecars/FWD-LIVE-001/
```

**必須包含**：

- platform name / sandbox source
- credential source / masked reference
- inbound order sample
- accept relay sample
- lost-race callback
- cancel callback
- complete callback
- settlement sample
- no-owned-assignment proof
- replay / idempotency proof
- webhook signature proof

**Acceptance**：

- `WF-FWD-001` 可從 `EXTERNAL-GATED` uplift 到 `PASS (sandbox evidence)`
- 不得使用 purely local fixture 偽裝 sandbox proof
- 若只有 internal mock，gate read 必須維持 `PASS (repo-local)`，不可宣稱 sandbox

---

# E. Partner Eligibility / Airport Transfer

## `PARTNER-001` — Rename and Spec Completion

**Files**：

```text
docs/03-runbooks/phase1-workflow-acceptance-release-gates.md
docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md
```

**必動**：

- `WF-PRT-001 → WF-PARTNER-001`
- 定義 entrySlug / partner entry identity
- 定義 issuer / bank sandbox requirement
- 定義 cardLast4 / referenceToken masking
- 定義 manual review
- 定義 booking / billing / reporting linkage
- 定義 negative paths

---

## `PARTNER-002` — Issuer Sandbox Evidence

**Output**：

```text
support/sidecars/PARTNER-ELIG-LIVE-001/
```

**必須包含**：

- issuer sandbox credential reference
- allowed test cards / reference tokens
- eligible / ineligible / manual_review proof
- timeout / retry proof
- booking linkage
- billing / reporting proof
- audit proof

**Gate read**：

```text
WF-PARTNER-001 = PASS (sandbox evidence)
```

---

# F. Partner Booking Pilot Cutover

## `PBK-001` — Partner Booking Pilot Cutover Proof

**Output**：

```text
support/sidecars/PBK-PILOT-001/
docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md
```

**必須包含**：

- target partner entrySlug
- current live owner
- target surface
- cutoverOwner
- rollbackOwner
- rollback route / host
- support hotline
- branding metadata
- eligibility mode
- pilot time window
- negative paths
- rollback retention at least 14 calendar days

**Workflow**：

```text
open partner entry
→ eligibility
→ authenticated booking
→ confirmation
→ trips / tracking
→ receipt / partner record
→ negative paths
→ rollback proof
```

**Gate read**：

```text
WF-PBK-001 = PASS (pilot evidence)
```

---

# G. CTI / Recording / Filing

## `COM-001` — Live Provider Evidence Classification

**Output**：

```text
docs/02-architecture/cti-recording-filing-blueprint-20260519.md
support/sidecars/WF-COM-001-LIVE-PROVIDER/
```

**必須包含**：

- provider name / sandbox or live classification
- call session creation proof
- recording pending proof
- recording-ready callback proof
- recording index export
- filing package artifact
- retention rule proof
- legal hold proof
- permissioned signed download proof

**Gate read**：

若 sandbox provider：

```text
WF-COM-001 = PASS (sandbox evidence)
```

若 live provider：

```text
WF-COM-001 = PASS (live staging evidence)
```

---

# H. Governance-aware Billing / Reporting

## `FIN-GOV-001` — Spec and E2E

**Files**：

```text
docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
docs/04-uat/governance-aware-billing-reporting-uat-20260519.md
tests/e2e/E2E-010-governance-aware-billing-reporting.sh
```

**必須驗證本體**：

- costCenterCode
- costCenterName
- ownerUserId / ownerName
- legacy_unmapped flag
- approvalEvaluationId
- approvalRequestId
- approvalState
- quotaPeriodKey
- quotaUsageDelta
- partnerProgramCode
- eligibilityVerificationId
- platformEarningsRef when forwarded
- auditId / reportArtifactId

---

# I. Platform Admin Control Plane

## `ADM-001` — Platform Admin Control Plane E2E

**Files**：

```text
docs/04-uat/platform-admin-control-plane-uat-20260519.md
tests/e2e/E2E-011-platform-admin-control-plane.sh
```

**必須涵蓋**：

- tenant create
- module enablement
- tenant quotas
- partner entry setup
- partner credential issue / revoke
- adapter health
- pricing publish
- feature flag toggle
- rollout stage
- rollback hold
- audit verification

**Gate read**：

```text
WF-ADM-001 = PASS (repo-local evidence)
```

若可在 staging 跑：

```text
WF-ADM-001 = PASS (live staging evidence)
```

---

# J. Production Deploy / Rollback Rail

## `PROD-001` — Production Live Execution Readiness

**Files**：

```text
.github/workflows/deploy-prod.yml
docs/03-runbooks/production-deploy-rail-spec-20260519.md
docs/03-runbooks/production-rollback-drill-20260519.md
support/sidecars/WF-PROD-001-LIVE-EXEC/
```

**必須補齊**：

- `PROD_GCP_PROJECT_ID`
- `PROD_GCP_REGION`
- `PROD_GCP_CLOUDSQL_INSTANCE`
- `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
- `PROD_WIF_PROVIDER`
- `PROD_WIF_SERVICE_ACCOUNT`
- Artifact Registry path
- Cloud Run services
- Cloud SQL migration step
- Secret Manager mapping
- GitHub Environment `production` required reviewer rule
- post-deploy smoke
- rollback by prior `prod/v*` tag

**Gate read**：

```text
WF-PROD-001 = PASS (production dry-run evidence)
```

不得宣稱 production launched，除非真的完成 production deploy + rollback drill。

---

## 6. QA / 驗收總表

| Task group | 必須通過                                             |
| ---------- | ---------------------------------------------------- |
| Matrix     | all workflow rows exist; no stale `WF-PRT-001`       |
| E2E        | E2E-005 / 006 / 010 / 011 pass under controlled seed |
| Driver     | Android + iOS device evidence packet                 |
| Forwarder  | sandbox inbound + callback + settlement proof        |
| Partner    | issuer sandbox eligibility proof                     |
| PBK        | partner entry pilot cutover + rollback proof         |
| CTI        | recording callback + filing artifact proof           |
| Finance    | governance-aware report/export proof                 |
| Admin      | platform control-plane audit proof                   |
| Prod       | production dry-run + rollback drill proof            |
| Docs       | 5 full docs + 12 stubs exist                         |

---

## 7. Closeout 回報格式

每個任務 closeout 必須提交以下格式：

```text
Task ID:
Owner:
Reviewer:
Branch:
PR:
Commit:
Files changed:
Verification commands:
Evidence artifact:
Workflow family affected:
Gate read before:
Gate read after:
Remaining non-claim:
External dependencies, if any:
```

缺任何本位不得通過任務。

---

## 8. 最終完成條件

Phase 1 最終補齊完成條件：

1. release matrix 已含所有 workflow family
2. no stale `WF-PRT-001`
3. `WF-FIN-GOV-001` 獨立存在
4. E2E-010 / E2E-011 存在並可執行
5. E2E-006 不再預設 warning skip
6. 5 份實貢 doc + 12 thin stubs 存在
7. forwarder 至少 sandbox evidence
8. partner eligibility 至少 sandbox evidence
9. driver mobile 至少 Android + iOS device evidence
10. partner booking 至少一個 partner entry pilot cutover evidence
11. CTI / recording / filing 至少 sandbox evidence 且 live provider non-claim 清楚
12. production rail 至少 production dry-run + rollback drill evidence
13. all closeout reports 使用標準格式
14. no workflow family remains unplanned

---

## 9. 開發團隊不得再生的事

- 不得只更新文件而不補 E2E / evidence。
- 不得用 UI closeout 取代 business-flow closeout。
- 不得用 sidecar produced 取代 live / sandbox evidence。
- 不得把 external credential 缺失寫成「完成」。
- 不得重命名 E2E-007 / 008 / 009。
- 不得保留 `WF-PRT-001` alias。
- 不得把 `WF-FIN-001` 改名成 `WF-FIN-GOV-001`。
- 不得把 Partner Booking repo-local done 說明成 production cutover done。
- 不得把 production dry-run 說明成 production launch。

---

## 10. 開發團隊最終交付清單

```text
[ ] docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md
[ ] docs/03-runbooks/phase1-release-truth-sync-20260519.md
[ ] docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md
[ ] docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
[ ] docs/04-uat/platform-admin-control-plane-uat-20260519.md
[ ] 12 thin stubs under docs/00-context/stubs/
[ ] docs/03-runbooks/phase1-workflow-acceptance-release-gates.md updated
[ ] docs/04-uat/fbp-014a-e2e-matrix.md updated
[ ] tests/e2e/E2E-010-governance-aware-billing-reporting.sh
[ ] tests/e2e/E2E-011-platform-admin-control-plane.sh
[ ] tests/e2e/E2E-006-driver-multi-platform.sh hardened
[ ] support/sidecars/FWD-LIVE-001/
[ ] support/sidecars/PARTNER-ELIG-LIVE-001/
[ ] support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/
[ ] support/sidecars/WF-COM-001-LIVE-PROVIDER/
[ ] support/sidecars/WF-PROD-001-LIVE-EXEC/
[ ] support/sidecars/PBK-PILOT-001/
[ ] .github/workflows/deploy-prod.yml production graph complete
[ ] final phase1-business-flow-complete-closeout.md
```

完成以後，才能宣稱：

```text
Phase 1 business-flow complete for pilot readiness.
```

仍不得宣稱：

```text
Full production launched
```

除非已完成 production deploy、rollback drill、monitoring、human approval gate 與實際 production closeout。
