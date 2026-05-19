# Phase 1 設計藍圖補齊規格書

**文件用途**：交付給系統設計 / 產品設計 / 架構設計團隊，用來一次性補齊 Phase 1 設計藍圖，使開發團隊可以依此明確設計輸出完成助餘開發與驗證。
**文件性質**：System Design Directive，非討論草案。
**基準分支**：`ajoe734/drts-fleet-platform@origin/dev`
**日期**：2026-05-19
**輸出者**：系統設計審查委員會

> **歸檔註記 (Claude, 2026-05-19)**: 此文件由系統設計團隊在 Phase 1 v2 wave 完成後 (PR #161 + #162 已合入 dev) 提出。Phase 1 v3 wave 規劃與差異分析請見 [`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`](../03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md)，conflicts/open-questions 請見 [`docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md`](phase1-v3-conflicts-and-open-questions-20260519.md)。

---

## 0. 設計團隊必須回答的總裁決

Phase 1 目前不能再用「UI 任務完成」、「backend contract 完成」、「build / typecheck 通過」作為完成標準。Phase 1 的完成標準必須改為：

> **每一條核心 business flow 都有正式 workflow family、UAT scenario、E2E / evidence path、release gate status、rollback / non-claim statement、audit / reporting proof。**

因此，本文件要求設計團隊一次性補齊以下設計藍圖，使開發團隊能直接接手執行：

1. `WF-TGV-001` — Tenant Governance Flow
2. `WF-DRV-MP-001` — Driver Multi-Platform Workbench Flow
3. `WF-FWD-001` — Forwarder / Third-party Platform Flow
4. `WF-PBK-001` — Partner Booking Pilot Cutover Flow
5. `WF-PARTNER-001` — Partner Eligibility / Airport Transfer Flow
6. `WF-COM-001` — CTI / Recording / Filing Flow
7. `WF-FIN-GOV-001` — Governance-aware Billing / Reporting / Settlement Flow
8. `WF-ADM-001` — Platform Admin Control Plane Flow
9. `WF-PROD-001` — Production Deploy / Rollback Rail
10. `WF-REL-001` — Dev / Publish / Main / Production release-truth synchronization

以下不是交給開發團隊自行討論的開放問題，而是設計團隊必須輸出的規格、gate、證據鏈與執行準則。

---

## 1. 目前 `origin/dev` 開發進度摘要

### 1.1 已完成或已大幅完成

依 `origin/dev` 最新狀態，Phase 1 已完成或接近完成下列內容：

| 區塊                      | 目前狀態                                                                                            | 設計判斷                    |
| ------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------- |
| Canonical backend / BFF   | `drts-fleet-platform` 維持 canonical backend / BFF / contracts / API authority                      | 藍圖與實作一致              |
| Tenant Governance backend | `BE-CC-001`、`BE-RULE-001`、`BE-QUOTA-001`、`BE-APR-001` 已在 dev closeout 中標示落地               | 大幅符合藍圖                |
| Tenant Console UI         | `TEN-UI-RD-001` 至 `TEN-UI-RD-018` 已 closeout，含 New Booking / Cost Center / Rules                | UI 面符合藍圖               |
| Platform Admin UI         | `ADM-UI-RD-001` 至 `ADM-UI-RD-009` 已 closeout                                                      | UI 面符合藍圖               |
| Driver App UI             | workspace / inbox / trip / platform presence / earnings / shift / SOS / settings 已 reskin closeout | UI 面符合藍圖               |
| Partner Booking Web       | `apps/partner-booking-web` 已建立 white-label repo-local surface                                    | repo-local surface 符合藍圖 |
| Branch strategy           | nightly publish + hourly promote + prod tag 策略已定義                                              | release governance 方向正確 |

### 1.2 仍不能宣稱完成的部分

| 區塊                     | 目前缺口                                                                                     | 為何不能宣稱完成                         |
| ------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Tenant Governance        | backend/UI done，但未正式納入 workflow gate matrix                                           | 不能用 task done 取代 business-flow done |
| Driver Multi-Platform    | UI reskin done，但真機、發證、真實/沙箱平台任務 proof 未完整                                 | 商業核心仍需 live / sandbox evidence     |
| Forwarder                | 仍需確認是否從 `EXTERNAL-GATED` 推進到 sandbox / live evidence                               | 第三方平台對接不能只靠 fixture           |
| Partner Booking          | repo-local app done，但 live owner 仍可能是現有 partner mode / tenant-commute-hub            | 尚未 cutover production traffic          |
| CTI / Recording / Filing | 需要明確 evidence 等級與 live activation proof                                               | 合規證據鏈尚未完整 release gate closure  |
| Billing / Reporting      | 已有治理 contract，但需證明 cost-center / quota / approval 進入報表與對帳                    | 企業派車對帳不能只看 booking flow        |
| Production Rail          | branch strategy 定義 prod rail skeleton，但 `PROD_*` / WIF / Cloud Run deploy graph 尚待補齊 | staging green 不等於 production-ready    |

---

## 2. 設計藍圖補齊原則

### 2.1 不得再使用的完成說法

設計團隊與開發文件不得再使用以下說法作為 Phase 1 完成判準：

- 「UI looks done」
- 「backend contract done」
- 「unit test passed」
- 「storybook parity done」
- 「build / typecheck passed」
- 「sidecar 已產出，所以 flow 已完成」
- 「repo-local done，所以 production-ready」

### 2.2 必須使用的完成說法

所有 closeout 必須改成下列格式：

```text
Workflow family: WF-XXX-001
Business flow: <flow name>
Current gate read: PASS / HOLD / EXTERNAL-GATED / PRODUCTION-GATED
Verification path: <E2E / smoke / sidecar / manual evidence>
Evidence level: repo-local / static / sandbox / live staging / pilot / production
Non-claim: <哪些還不能宣稱完成>
Next action: <下一個明確任務>
```

### 2.3 Evidence classification

設計團隊必須統一使用以下 evidence 等級：

| Evidence                | 定義                                                     |
| ----------------------- | -------------------------------------------------------- |
| `repo-local`            | 本地或 repo 內 fixture / unit / integration 可驗證       |
| `static evidence`       | sidecar / log / artifact 可檢視，但非 fresh live run     |
| `sandbox evidence`      | 有外部 sandbox / 測試帳號 / 測試 callback                |
| `live staging evidence` | staging 環境實際走過                                     |
| `pilot evidence`        | 有指定 pilot tenant / partner / driver 實際試營運驗證    |
| `production evidence`   | production deploy / rollback / monitoring / audit 已實證 |

---

## 3. 必補設計藍圖與工作流規格

---

# 3.1 `WF-TGV-001` Tenant Governance Flow

## 3.1.1 支援目的

支援大型企業合約派車的治理能力：成本中心、審批規則、額度 / 稅金、approval workflow、報表勾稽與 audit。

## 3.1.2 目前 dev 狀態

Tenant Governance backend contract wave 已在 dev 上大幅完成，包含：

- `TenantCostCenterRecord`
- `TenantApprovalRuleRecord`
- `TenantApprovalEvaluationResult`
- `TenantBookingApprovalRequestRecord`
- `TenantQuotaPolicyRecord`
- `TenantQuotaLedgerEntry`
- `TenantBookingQuotaImpactPreview`

Tenant Console 也已完成 TN_NewBooking、TN_CostCenter、TN_Rules 等 UI closeout。

## 3.1.3 設計缺口

目前缺的是正式 business-flow gate，而非單純 contract 或 UI。

## 3.1.4 設計團隊必須輸出

### 文件

```text
docs/03-runbooks/tenant-governance-workflow-release-gate-20260519.md
docs/04-uat/tenant-governance-uat-scenarios-20260519.md
```

### E2E

```text
tests/e2e/E2E-005-tenant-governance.sh
```

### 工作流

```text
create tenant
→ create cost center
→ assign owner
→ set quota policy
→ create approval rule
→ create booking with costCenterCode
→ quota preview
→ approval evaluation
→ approval request generated
→ approve / reject / escalate
→ booking released or blocked
→ dispatch
→ trip completion
→ billing/reporting cost-center attribution
→ audit trail verification
```

## 3.1.5 驗收標準

- `WF-TGV-001` 被加入 `phase1-workflow-acceptance-release-gates.md`
- `E2E-005-tenant-governance.sh` 可執行
- 至少達到 `PASS (repo-local)`
- 若 staging 可用，必須達到 `PASS (live staging evidence)`
- billing / reporting export 必須看到 cost center code / name / owner / approval state / quota impact
- audit log 必須看到 cost center、quota、rule、approval request、approve / reject / escalation

---

# 3.2 `WF-DRV-MP-001` Driver Multi-Platform Workbench Flow

## 3.2.1 支援目的

支援司機用同一個 Driver App 接不同叫車平台的訂單，並管理平台級上線 / 下線、平台任務、route intent、status sync、平台級收益。

## 3.2.2 目前 dev 狀態

Driver App UI 已完成 workspace、inbox、trip 7 states、platform presence、earnings、shift、SOS、settings 等 reskin closeout。

## 3.2.3 設計缺口

Driver App closeout 仍主要是 UI / static verification，缺少真機、發證、外部平台任務、platform earnings 的 end-to-end proof。

## 3.2.4 設計團隊必須輸出

### 文件

```text
docs/04-uat/driver-multi-platform-workbench-uat-20260519.md
docs/03-runbooks/driver-app-mobile-distribution-gate-20260519.md
```

### E2E

```text
tests/e2e/E2E-006-driver-multi-platform.sh
```

### 工作流

```text
driver device registration
→ driver login
→ platform binding
→ platform A online
→ platform B offline
→ receive forwarded task from platform A
→ display sourcePlatform / externalOrderId / routeLocked / waypoints
→ accept task
→ accept relay to platform A
→ arrive / start / complete status sync
→ platform earnings generated
→ driver earnings screen shows platform A gross / fee / net
```

## 3.2.5 真機驗證最低要求

- Android 真機 1 台
- iPhone 真機 1 台
- 弱網路測試
- push / notification 測試
- location permission 測試
- camera / proof upload 測試
- platform re-auth / token expiry 測試

## 3.2.6 驗收標準

- `WF-DRV-MP-001` 加入 release gate matrix
- E2E / UAT evidence 可追 driverId、platformCode、externalOrderId、taskId、earningsId
- Android / iOS installation evidence 完成
- 不得用 UI reskin closeout 誤稱為 live driver business-flow closeout

---

# 3.3 `WF-FWD-001` Forwarder / Third-party Platform Flow

## 3.3.1 支援目的

支援第三方叫車平台對接，保持外部平台 native authority，我方僅做 mirror / relay / sync / earnings aggregation。

## 3.3.2 設計缺口

既有 gate 仍需確認是否從 `EXTERNAL-GATED` 推進到 sandbox / live evidence。即使已有 sidecar，也必須分類 evidence 等級。

## 3.3.3 設計團隊必須輸出

### 文件

```text
docs/02-architecture/forwarder-adapter-proof-spec-20260519.md
docs/04-uat/forwarder-platform-uat-scenarios-20260519.md
support/sidecars/FWD-LIVE-001/README.md
```

### E2E

```text
tests/e2e/E2E-002-forwarded-order.sh
```

若現有 E2E-002 已存在，需補完整 external proof cases。

### 工作流

```text
external platform sends inbound order
→ core creates forwarded task mirror
→ driver sees source platform + route locked
→ driver accepts
→ accept relay sent to external platform
→ external platform confirms / rejects / lost-race
→ status sync updates task
→ completion callback
→ platform settlement sample imported
→ platform earnings record generated
→ no owned dispatch assignment is created
```

## 3.3.4 驗收標準

- 至少一家 platform sandbox / external partner 被指定
- inbound sample、callback sample、settlement sample 都入 evidence packet
- lost race / cancel / complete 都測過
- no-owned-assignment guard 有測試
- `WF-FWD-001` gate 從 `EXTERNAL-GATED` 更新為 `PASS (sandbox evidence)` 或 `PASS (live staging evidence)`

---

# 3.4 `WF-PBK-001` Partner Booking Pilot Cutover Flow

## 3.4.1 支援目的

把 repo-local `apps/partner-booking-web` 從白牌 UI surface 推進到指定 partner entry 的 pilot cutover。

## 3.4.2 目前 dev 狀態

`apps/partner-booking-web` 已建立 CTBC reference funnel、七個 partner booking screens、authority-safe negative paths，但 cutover decision 明確指出固定地尚未有 live traffic，現有 partner mode 仍是 live owner。

## 3.4.3 設計團隊必須輸出

### 文件

```text
docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md
docs/04-uat/partner-booking-pilot-uat-20260519.md
```

### E2E

```text
tests/e2e/E2E-007-partner-booking-pilot.sh
```

### 每個 partner entry 必填欄位

```text
entrySlug
partnerCode
programId
current live owner
target surface
cutoverOwner
rollbackOwner
rollback route
support hotline
brand metadata
eligibility mode
billing/reporting owner
monitoring dashboard
rollback retention window
```

## 3.4.4 工作流

```text
partner entry active
→ landing
→ eligibility verification
→ eligible / ineligible / manual_review negative paths
→ booking create
→ confirmation
→ trip tracking
→ receipt / statement
→ partner report
→ rollback path verified
```

## 3.4.5 驗收標準

- 不允許用 `[tenantSlug]` demo route 當 production cutover contract
- live migration granularity 必須是 `entrySlug` 或 host-owned partner entry
- 至少一個 partner entry 完成 pilot evidence
- `tenant-commute-hub` live owner → `apps/partner-booking-web` 的切換有 rollback evidence

---

# 3.5 `WF-PARTNER-001` Partner Eligibility / Airport Transfer Flow

## 3.5.1 支援目的

支援信用卡 / 銀行 / 合作方機場接送驗證。

## 3.5.2 設計團隊必須輸出

### 文件

```text
docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md
docs/04-uat/partner-eligibility-airport-transfer-uat-20260519.md
```

### E2E

```text
tests/e2e/E2E-008-partner-eligibility-airport-transfer.sh
```

## 3.5.3 工作流

```text
partner entry login
→ eligibility verify by card last4 / reference token
→ issuer / partner sandbox response
→ eligible booking
→ airport pickup / dropoff fields
→ flight number validation
→ terminal / luggage rules
→ booking created with eligibilityVerificationId
→ manual review if timeout / ambiguous
→ completion
→ partner billing report
→ audit eligibility decision
```

## 3.5.4 驗收標準

- issuer / bank / partner sandbox credentials 有明確 simulation evidence 等級
- raw sensitive token 不能 DB，只留 hash / masked reference
- eligibilityVerificationId 透過 booking / billing / report
- manual review queue 可見
- ineligible / timeout / retry exhausted 都有 negative path

---

# 3.6 `WF-COM-001` CTI / Recording / Filing Flow

## 3.6.1 支援目的

支援電話建單、話務錄音、錄音索引、申訴與 filing package，補足派遣的金融法規證據鏈。

## 3.6.2 設計團隊必須輸出

### 文件

```text
docs/02-architecture/cti-recording-filing-blueprint-20260519.md
docs/04-uat/cti-recording-filing-uat-20260519.md
support/sidecars/COM-LIVE-001/README.md
```

### E2E

```text
tests/e2e/E2E-003-phone-recording-filing.sh
```

## 3.6.3 工作流

```text
incoming CTI call
→ call session created
→ operator creates phone booking
→ booking stores call_id and agent_id
→ recording pending flag
→ recording-ready callback
→ recording_id attached
→ recording pending cleared
→ complaint / incident optional linkage
→ recording index export
→ filing package generated
→ sensitive download permission check
→ legal hold / retention metadata
```

## 3.6.4 驗收標準

- CTI provider / sandbox / simulation 等級清楚標示
- recording callback security 有設計
- recording_id masking 有設計
- filing package manifest hash 有 evidence
- unauthorized recording download 回 403 並 audit
- `WF-COM-001` 不再停留在 HOLD，至少達到 `PASS (static evidence)`，目標 `PASS (live staging evidence)`

---

# 3.7 `WF-FIN-GOV-001` Governance-aware Billing / Reporting / Settlement Flow

## 3.7.1 支援目的

確保企業派車的成本中心、quota、approval、partner program、platform earnings 都進入 billing / reporting / settlement。

## 3.7.2 設計團隊必須輸出

### 文件

```text
docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
docs/04-uat/governance-aware-billing-reporting-uat-20260519.md
```

### E2E

```text
tests/e2e/E2E-009-governance-billing-reporting.sh
```

## 3.7.3 工作流

```text
booking with costCenterCode
→ quota reservation
→ approval evaluation snapshot
→ booking completed
→ invoice generated
→ report exported
→ costCenterCode / costCenterName / owner / approvalState included
→ partner program / eligibility reference included if partner booking
→ driver platform earnings included if forwarded / platform task
→ sensitive download audited
```

## 3.7.4 驗收標準

- tenant invoice / report 包含 cost center governance 欄位
- platform earnings 可按 platformCode 彙整
- partner report 可按 programId / benefitReference / issuerAuthorizationRef 彙整
- legacy_unmapped cost center 有明確標示
- download / export 有 audit

---

# 3.8 `WF-ADM-001` Platform Admin Control Plane Flow

## 3.8.1 支援目的

驗證 Platform Admin 不只是 UI closeout，而是真的能控制 tenant、partner、rollout、pricing、adapter、audit。

## 3.8.2 設計團隊必須輸出

### 文件

```text
docs/04-uat/platform-admin-control-plane-uat-20260519.md
```

### E2E

```text
tests/e2e/E2E-010-platform-admin-control-plane.sh
```

## 3.8.3 工作流

```text
create tenant
→ enable modules
→ configure tenant quota
→ create partner entry
→ issue partner credential
→ configure adapter / switchboard
→ publish pricing / split version
→ set rollout stage sandbox / pilot / production
→ set rollback hold
→ audit trail review
```

## 3.8.4 驗收標準

- 每一個 platform admin mutation 都有 audit
- 低權限角色不可操作 high-risk controls
- partner credential plaintext only shown once
- pricing publish 有版本與 rollback
- rollout promotion gate 不可被 UI bypass

---

# 3.9 `WF-PROD-001` Production Deploy / Rollback Rail

## 3.9.1 支援目的

補齊正式上線能力，不能只停在 dev / staging。

## 3.9.2 設計團隊必須輸出

### 文件

```text
docs/03-runbooks/production-deploy-rail-spec-20260519.md
docs/03-runbooks/production-rollback-drill-20260519.md
```

### Workflow

```text
.github/workflows/deploy-prod.yml
```

## 3.9.3 必須設定

```text
PROD_GCP_PROJECT_ID
PROD_GCP_REGION
PROD_GCP_CLOUDSQL_INSTANCE
PROD_GCP_RUNTIME_SERVICE_ACCOUNT
PROD_ARTIFACT_REGISTRY
PROD_SECRET_PREFIX
PROD_WIF_PROVIDER
PROD_WIF_SERVICE_ACCOUNT
```

## 3.9.4 工作流

```text
select prod/vYYYY.MM.DD.N tag
→ validate tag exists
→ build / pull artifact
→ deploy API / admin / ops / tenant / partner surfaces
→ run post-deploy smoke
→ record deployment evidence
→ rollback by previous prod/v tag
→ record rollback evidence
```

## 3.9.5 驗收標準

- production deploy workflow 不再是 skeleton
- production environment 有 required reviewer gate
- 可完成一次 dry run 或 controlled production dry run
- rollback drill 有 evidence

---

# 3.10 `WF-REL-001` Release Truth Synchronization

## 3.10.1 支援目的

確保 dev、publish、main、prod tag、docs、ai-status、workflow gate matrix 不漂移。

## 3.10.2 設計團隊必須輸出

### 文件

```text
docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md
docs/03-runbooks/release-truth-sync-runbook-20260519.md
```

## 3.10.3 驗收標準

- `current-work.md`、closeout docs、release gate matrix 不矛盾
- dev branch status 與 publish snapshot status 可追
- 任何 closeout 必須同時更新 workflow gate status
- 所有 `done` 都要指到 evidence artifact

---

## 4. 開發團隊可直接接收的任務分發表

以下任務由設計團隊文件完成後，直接交由開發團隊執行。

| Task ID          | 任務                                       | Owner role          | Reviewer role  | 優先級 |
| ---------------- | ------------------------------------------ | ------------------- | -------------- | ------ |
| `DEV-SYNC-001`   | 產生 `origin/dev` 最新藍圖對齊 audit       | Tech Lead           | System Design  | P0     |
| `WF-TGV-001`     | Tenant Governance release gate + E2E       | Backend + QA        | System Design  | P0     |
| `WF-DRV-MP-001`  | Driver multi-platform E2E + 真機驗證       | Mobile + Backend    | QA Lead        | P0     |
| `WF-FWD-001`     | Forwarder sandbox / external proof         | Backend Integration | System Design  | P0     |
| `WF-PBK-001`     | Partner booking pilot cutover              | Frontend + Backend  | Product Owner  | P0     |
| `WF-PARTNER-001` | Partner eligibility / airport transfer E2E | Backend + Ops       | Product Owner  | P1     |
| `WF-COM-001`     | CTI / recording / filing proof             | Backend + Ops       | Compliance     | P1     |
| `WF-FIN-GOV-001` | Governance-aware billing / reporting       | Backend + Finance   | Finance Owner  | P1     |
| `WF-ADM-001`     | Platform admin control-plane E2E           | Frontend + Backend  | Platform Owner | P1     |
| `WF-PROD-001`    | Production deploy / rollback rail          | DevOps              | Tech Lead      | P0     |
| `WF-REL-001`     | Release truth sync                         | Release Eng         | System Design  | P0     |

---

## 5. Phase 1 完整完成標準

Phase 1 只有在以下條件全部成立時，才可宣稱完整完成：

1. `WF-TGV-001` 至少 `PASS (live staging evidence)`
2. `WF-DRV-MP-001` 至少 `PASS (sandbox/live staging evidence)`，且 Android / iOS 真機 evidence 完成
3. `WF-FWD-001` 不再是 `EXTERNAL-GATED`，至少有 sandbox platform proof
4. `WF-PBK-001` 至少一個 partner entry 完成 pilot cutover proof
5. `WF-PARTNER-001` 完成 eligibility → booking → billing/reporting proof
6. `WF-COM-001` 不再是 HOLD，至少有 CTI / recording / filing static or sandbox evidence
7. `WF-FIN-GOV-001` 完成 cost-center / approval / quota / partner / platform earnings 報表驗證
8. `WF-ADM-001` 完成 platform admin control-plane E2E
9. `WF-PROD-001` 完成 production deploy dry run / rollback drill
10. `WF-REL-001` 完成 release truth synchronization

---

## 6. 設計團隊交付文件清單

設計團隊必須在本輪補齊下列文件。這些文件不是討論草案，而是後續開發任務的正式依據。

```text
docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md

docs/03-runbooks/tenant-governance-workflow-release-gate-20260519.md
docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md
docs/03-runbooks/production-deploy-rail-spec-20260519.md
docs/03-runbooks/production-rollback-drill-20260519.md
docs/03-runbooks/release-truth-sync-runbook-20260519.md

docs/02-architecture/forwarder-adapter-proof-spec-20260519.md
docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md
docs/02-architecture/cti-recording-filing-blueprint-20260519.md
docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md

docs/04-uat/tenant-governance-uat-scenarios-20260519.md
docs/04-uat/driver-multi-platform-workbench-uat-20260519.md
docs/04-uat/partner-booking-pilot-uat-20260519.md
docs/04-uat/partner-eligibility-airport-transfer-uat-20260519.md
docs/04-uat/cti-recording-filing-uat-20260519.md
docs/04-uat/governance-aware-billing-reporting-uat-20260519.md
docs/04-uat/platform-admin-control-plane-uat-20260519.md
```

---

## 7. Non-claim rules

設計團隊必須明確要求所有開發 closeout 遵守以下 non-claim rules：

1. `apps/partner-booking-web` repo-local done 不等於 production cutover done。
2. Driver App reskin done 不等於真機 / 發證 / 多平台實證完成。
3. Forwarder fixture / sidecar done 不等於 external platform live proof 完成。
4. CTI / filing sidecar done 不等於法規 evidence chain 完成，除非有 recording callback / filing artifact / retention proof。
5. Tenant Governance backend done 不等於企業派車治理 flow done，除非 `WF-TGV-001` 通過。
6. Staging deploy done 不等於 production-ready。
7. Build / typecheck / unit test passed 不等於 Phase 1 complete。

---

## 8. 最終裁決

`origin/dev` 的開發現況已大幅接近 Phase 1 完整藍圖，但缺口已經從「功能缺口」轉為「workflow-family release gate、外部整合 proof、production rail、cutover evidence」缺口。

因此，本輪設計團隊的工作不是再討論系統要做什麼，而是必須一次性補齊上述 10 條 workflow-family 的設計藍圖、UAT、E2E、release gate 與 evidence classification。

完成本文件第 6 節所有設計文件後，開發團隊即可依第 4 節任務分發表直接執行補齊。
