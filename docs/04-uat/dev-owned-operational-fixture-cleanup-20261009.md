# SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009 UAT Report

## 1. 任務背景與真實驗收現況 (Product Ground Truth)

- **持有者 (Owner):** Gemini2
- **獨立審查者 (Reviewer):** Codex
- **產品執行版本 (Product Source):** `4a166f3ed2a7000061acc737ee475ae3c47dca56`
  - 整合審查完成之 referral embed 水合修正（PR #2462）、所有候選與合併 CI 全綠。
  - 產品原始碼完全凍結，本任務為獨立之維運清理工具，不修改任何產品原始碼，亦不進行重新部署。
- **授權部署紀錄 (Authorized Deploy):** GitHub Actions run `37906298090`
  - 部署工作流定義：`publish/v2026.10.08.0`（SHA: `9a1b6466a8b15d7d328e9ceba33ba5dc92f7fa9c`）
  - 全部 9 項實際部署工作終端為 `SUCCESS`。
- **真實驗收報告 (Authentic Operational Browser Evidence):**
  - 16 項旅程全部通過（16 passed / 0 failed / 0 skipped / 0 flaky），契約驗證 14 項通過。
  - 共收集 58 筆正式驗證記錄。
  - 8 筆物理 327-byte PDF 鏈路：`intent (201) -> PUT (200) -> confirm (201) -> download (200)`，SHA-256 全數為 `4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784`，MIME 為 `application/pdf`。
  - 首次冷啟動 PUT 經歷 20 次嘗試（19 次 `DOCUMENT_SCANNER_UNAVAILABLE` typed pending 後 clean）。
  - Referral 實際建立／取消／讀回相同 UUID 成功（取消狀態 `cancelled`）。
- **唯讀雲端中繼資料驗證 (Postdeployment Readonly Metadata):**
  - Run `37909267631`，27 reads / 0 mutations / 0 product HTTP。
  - 證明 API revision 為 `drts-dev-api-00065-smj`，image digest 為 `2d60ccea943e124ce6b55bfe0b91cfdff5ac8ff7a2c60dc162451c43899649cb`。
  - 9 個 IAM bindings、provider 參照與 scanner 規格均與先前預設完全相符。

## 2. 候選版本拒絕歷史與 CI 狀態 (Rejected Candidates History & CI Status)

本任務遵循 AI Collaboration Guide §0.7 與二輪同類缺陷重做規則，完整保留兩輪被拒絕之候選版本歷史：

### 候選版本 1: a6bcfe4ac
- **拒絕候選 SHA:** `a6bcfe4acdb8412fe1997ff20927e854608562c7`
- **候選 Generation:** `f1bae1f4416c4ccfa42d2eed9b2770b0`
- **獨立審查裁決:** Codex 於 2026-10-09T14:41:16Z 裁決 `REOPEN / not approved`（審查結論檔案 SHA-256: `a23bb9d83954eca3666b0105708834b93e12e3305e4d748a8912491e4b21d1a8`）。
- **強制性 CI 狀態:**
  - CI Run `37912160451`：Change scope 與 Smoke acceptance 失敗；
  - CI Integration Run `37912160579`：changes, e2e, ci-integ 失敗；
  - 根本原因：舊測試檔案未搬移至既有 CI 發現路徑內，且具備實體與安全邊界缺陷。

### 候選版本 2: 3f40da22d
- **拒絕候選 SHA:** `3f40da22d58431a7b0d41c6738ae6e73cb9ee250`
- **候選 Generation:** `5cdab5d3641d4636a657b85f5564702a`
- **獨立審查裁決:** Codex 於 2026-10-09T15:27:43Z 執行規範 Reopen（`codex-20261009T151724Z-cf01b2db`），裁決 `REOPEN / not approved`。
- **審查發現:** 獨立探針（boundary-probe, physical-key-probe, workflow-guard-probe）推翻先前全數修復之宣稱，確認 9 項實體對映、預檢順序、事務控制與工作流防護缺陷（R2-01 至 R2-09）。
- **強制性 CI 狀態:**
  - CI Run `37950233502`：Canonical consistency 檢查失敗（退出碼 1），原因為 UAT 文件以反引號引用已被移除之舊測試檔案路徑。
  - CI Integration Run `37950233399`：終端 SUCCESS。

### 候選版本 3: 6d911a7c7
- **拒絕候選 SHA:** `6d911a7c777122bc013cb5eed2a2826e8063a87f`
- **候選 Generation:** `f06677f18bb3413387239babe58e2674`
- **獨立審查裁決:** Codex 裁決 `REOPEN / not approved`。
- **審查發現:** 確認 R2-02 至 R2-06 等邊界缺陷仍存在（例如接受造假 hash、未驗證 ZIP 檔案 digest、ADC-file-not-found 誤判為 404 等）。此外，UAT 文件中提出之 all9-ready 與 connectivity 等防護宣稱並不正確，且遺漏 Hosted immutable tool review/full-CI/merge、Operator no-overlap 及 runtime/private/scanner 等重要安全防線。
- **強制性 CI 狀態:** 本機測試通過，但真實安全防護邊界與宣稱仍有缺失。

### 維運執行狀態 (Operational Execution Status)
- `cleanup_not_performed: true`。所有雲端 GCS 測試夾具與 Cloud SQL 資料庫紀錄均完整保留，未執行任何實際刪除或未授權異動。所有 live keys 保持 BLOCKED / PENDING 狀態。

## 3. 具體修復範圍與 9 項 Round 2 Findings 清單 (Dispositions of All Findings)

任務精確範圍限定為四個最終原始碼檔案（外加舊測試之歷史移除記錄）：
1. `.github/workflows/dev-owned-operational-fixture-cleanup.yml`
2. `operations/verification/cleanup-owned-operational-fixtures.py`
3. `tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py`
4. `docs/04-uat/dev-owned-operational-fixture-cleanup-20261009.md`
5. 歷史移除路徑：[operations/verification/test_cleanup_owned_operational_fixtures.py](https://github.com/ajoe734/drts-fleet-platform/blob/a6bcfe4acdb8412fe1997ff20927e854608562c7/operations/verification/test_cleanup_owned_operational_fixtures.py)（已於候選 a6bcfe4a 移除，以完整 GitHub blob 網址保留歷史記錄，符合規範檢查器規則）。

### Round 2 審查缺陷處置表 (R2-01 至 R2-09)

| Finding | 缺陷描述與觸發情境 | 處置方式與原始碼變更 | 驗證命令與結果 |
| --- | --- | --- | --- |
| **R2-01** (GCS Physical Key Mapping) | 生產環境 `GcsDocumentArtifactStoreAdapter.key` 將邏輯 key 編碼為 `document-artifacts/fleet-upload-content/<encodeURIComponent(logicalKey)>`（帶有 `%2F`）。候選 3f40 清理計畫使用原始 logical key，導致 GCS 物件名稱不符。 | 實作 `logical_to_physical_gcs_key` 嚴格遵循生產 Adapter 規範；保留清單中的原始 `logical_key` 供審計追溯，GCS 操作一律使用實體物理鍵。 | `node physical-key-probe.cjs`<br>單元測試 `test_physical_key_mapping` 通過。 |
| **R2-02** (Mandatory Metadata & Live Hash) | 缺少 live hash/body/metageneration 時仍授權刪除；未強制數值型 metageneration（預設值為 1）；未檢查 2026 時間戳與物件所有權。 | 強制要求數值型 `generation` 與 `metageneration`（缺少即拒絕，不得預設為 1）；驗證 327 bytes、`application/pdf` MIME；強制透過 `sha256`、`body_bytes` 或 `read_body` 驗證內容雜湊；強制校驗 2026 年時間戳。 | 單元測試 `test_gcs_metadata_bad_hash_rejected`、`test_gcs_target_missing_metageneration_rejected`、`test_gcs_target_stale_timestamp_rejected` 通過。 |
| **R2-03** (Preflight Separation Before Mutation) | Apply 模式在完成所有預檢前即發起異動（先執行 DB DELETE 再預檢 GCS，或刪除第一個 GCS 物件後才檢查第二個），且失敗時丟失 receipts。 | 分離規劃／預檢與異動階段：所有 8 個 GCS 目標必須全部完成預檢；若 DB 阻礙存在或缺乏 runner，立即中斷於任何 GCS 異動之前；持久化結構化錯誤收據，非零退出。 | 單元測試 `test_all_preflights_before_mutation_halts_db_on_gcs_failure`、`test_apply_mode_pipeline_halts_before_gcs_mutation_when_db_blocked` 通過。 |
| **R2-04** (DB Transaction & Referential Integrity) | DB 執行無 `BEGIN`/`COMMIT`/`ROLLBACK` 事務邊界；接受缺少審計計數；未防止外鍵完整性破壞；dry-run 忽略查詢錯誤。 | 加入顯式事務控制命令；要求 `supply_review_events` 必須有確切整數計數且為 0（缺少或大於 0 均阻擋）；保留外鍵完整性約束（受審計保護之 submission 拒絕刪除）；dry-run 錯誤標記狀態為 `blocked`。不聲稱模擬 PG 回滾。 | 單元測試 `test_execute_db_cleanup_transaction_controls`、`test_execute_db_cleanup_rejects_missing_audit_count`、`test_db_dry_run_inspection_error_blocks` 通過。 |
| **R2-05** (Authoritative Artifact Binding) | `artifacts.json`、digest 與完整 stats 曾被視為非必要；欠缺欄位時使用常數合成；接受缺少 `run_id`。 | 強制要求 `run_id`、強制驗證 `artifacts.json`、強制匹配 `EXPECTED_ARTIFACT_DIGEST`（`0968ca2d9ae17bb698d281ef51dbf1a21e4ea5f43db48f4350bc78bb51dcf87f`）；強制檢查 report stats（16 passed / 0 unexpected / 0 skipped / 0 flaky）；嚴格解析真實 58 筆證據，移除合成常數 fallback。 | 單元測試 `test_authentic_provenance_passes`、`test_wrong_artifact_digest_raises`、`test_wrong_run_id_raises` 通過。 |
| **R2-06** (Strict GCS Error Classification) | 包含 403 / 憑證不存在之錯誤被誤判為 404；無先前收據之 404 仍被信任為已刪除。 | 子程序回傳 403、權限、網路錯誤嚴格分類為 `permission_or_network` 錯誤（絕非 `not_found`）；僅嚴格比對真實驗證之 404；先前的刪除收據必須綁定 bucket、實體 key、數值型 generation/metageneration 與 `verified_absent: true`。 | 單元測試 `test_default_gcs_runner_classifies_403_as_error`、`test_preexisting_absence_without_receipt_raises`、`test_gcs_target_prior_receipt_validation` 通過。 |
| **R2-07** (Bash Quoted Env Variables) | 工作流中直接將 `${{ inputs.* }}` 內插至 Bash 腳本區塊中，造成命令替換漏洞（如 `$(id)` 可被執行）。 | 所有工作流 dispatch 參數一律透過 step `env:` 變數傳遞為純量字串（`INPUT_*`），徹底消除 Bash 命令列內插；即使包含命令替換語法亦純視為文字資料。 | 語法驗證通過；workflow-guard-probe 驗證無命令替換執行。 |
| **R2-08** (Fixed WIF Identity, Minimum Perm, Concurrency) | WIF 檢查僅驗證非空，接受任意第三方 provider；工作流缺乏並發控制與 `actions: read` 權限。 | 固定綁定授權 DEV WIF 提供者（`projects/24645990627/...`）與佈署者 SA（`github-actions-deployer@drts-dev-devcc-20260825.iam.gserviceaccount.com`）；加入 `concurrency: group: dev-owned-operational-fixture-cleanup, cancel-in-progress: false`；加入 `actions: read` 權限。 | 工作流 YAML 結構驗證通過，WIF 邊界與權限最小化落實。 |
| **R2-09** (Canonical Consistency & Test Accounting) | UAT 文件以反引號引用已刪除之舊測試檔案導致 CI 規範檢查失敗；測試計數引用舊陳舊數據（94）。 | 移除舊測試路徑之反引號，改以 GitHub blob 完整 URL 參照；更正測試計數為 `check_test_coverage.py` 發現之 95 個測試檔案、38 項單元測試；明確記錄測試目錄中的 3 個跳過為測試套件跳過（非 passes，非業務 16 skips）。 | `python3 -B tools/ci/git/check_canonical_consistency.py --ci --base 4a166f3e --head HEAD`<br>Exit code: 0<br>`0 finding(s)` |

*(註：上述 R2-02 至 R2-06 等宣稱曾於候選 3 (6d911a7) 中提出，但未能如實落實於程式碼。本次候選已透過嚴格之 `read_body` 實體讀取、強制 `SELECT ... FOR UPDATE` 鎖定及 `POSTFLIGHT_CHECK` 等機制，將此些宣稱化為真實之程式碼約束。)*

## 4. 資料庫通道與保留合約精確分析 (DB Lane & Preservation)

1. **現行部署架構分析 (Current Deployment Architecture):**
   - 經檢視 `Dockerfile.migrate`、`operations/database/db-apply.sh`、`infra/gcp/staging/migrate-job.yaml` 與 `.github/workflows/deploy-dev.yml`：
   - 專案已具有 Cloud Run migration job `drts-dev-migrate`，具有 Cloud SQL instance 綁定與 `DATABASE_URL` secret 掛載。
   - 然而，該映像檔係專為資料庫遷移設計，固定執行 `bash operations/database/db-apply.sh`，僅包含 `infra/migrations/` 下之 `V*.sql` 檔案，並不包含此清理工具，亦不接受任意 SQL 參數輸入。
   - 倉庫治理規範嚴格禁止任意覆寫正式遷移 job 之 entrypoint 或 command，亦禁止宣告未經審核之維運 Cloud Run job。
   - GitHub Actions deployer SA（`DEV_WIF_SERVICE_ACCOUNT`）在架構上落實 runtime identity split，無 VPC 內部私有連線能力，亦不持有 `DATABASE_URL`。
2. **資料庫 Schema 審計保護 (V0034 規範):**
   - 依據 `infra/migrations/V0034__phase1_delta_supply_eligibility_mobile_reporting.sql`：
     - `fleet.supply_review_events` 具有外鍵參照 `fleet.supply_submissions(submission_id)`，且**無** `ON DELETE CASCADE`。
     - 審計事件（review events）為不可竄改之法定業務紀錄，依任務合約嚴格禁止刪除。
     - 於驗收測試中，submission `deeed4cd-ede0-4daf-a70f-4d0e900987b9` 曾經 platform_admin 核准 (`approved`)，已寫入審計紀錄。
     - 在不可刪除審計紀錄之前提下，直接刪除父表 submission 將違反外鍵完整性約束。
   - 因此，受保護之審計關聯使該 submission 不得刪除；清理工具將其視為保護項目並阻擋 apply，而非破壞審計語意。
3. **保留合約 (Preservation Contract):**
   - 業務取消紀錄（Referral `6d571eec-f271-46b8-b01f-b176994fe71e`、Enterprise `booking-2e367210-fc7b-4bf0-9512-8ff7626b5165`）永久保留。
   - 種子夥伴 `fleet-demo-001` 及相關預載實體永久保留。
   - 歷史失敗夾具（8d、03a）永久保留。
   - 上傳意圖（`fleet-upload-intent`）與掃描記錄（`fleet-scan-record`）由獨立 lifecycle 治理，排除於本次清理計畫之外。

4. **維運防護邊界 (Operational Security Fences):**
   - **Hosted immutable tool review / full-CI / merge:** 本次清理工具必須經過不可變更的獨立審查、全套 CI 測試，並成功合併入主分支，方具備信任基礎。
   - **Operator no-overlap:** 工具執行期間必須確保無其他維運或自動化排程同時對相同資源進行操作，避免競態與破壞。
   - **Runtime / private / scanner fences:** GCS 與 DB 之清理應嚴格遵守 VPC private connectivity 與身分授權邊界，絕不可未經 IAM/WIF 核准直接穿越。

## 5. 本機驗證日誌與退出碼 (Local Verification Logs & Exit Codes)

### 1. 測試檔案覆蓋率檢查 (`tools/ci/check_test_coverage.py`)
```bash
python3 -B tools/ci/check_test_coverage.py
# Exit code: 0
# Output: check_test_coverage: all 95 test files yield tests CI runs.
```

### 2. 單元測試套件執行 (`test_owned_operational_fixture_cleanup.py`)
```bash
python3 -B -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py -v
# Exit code: 0
# Ran 38 tests in 0.046s ... OK
```

### 3. 本機測試目錄自動發現驗證
```bash
python3 -B -m unittest discover -s tests/unit/gcp-artifact-activation-20261004 -p 'test_*.py'
# Exit code: 0
# Ran 73 tests ... OK (skipped=3)
# Note: 3 skips are test-suite level directory skips in unrelated suites, NOT passes and NOT operational 16 skips.
```

### 4. 規範一致性檢查 (`tools/ci/git/check_canonical_consistency.py`)
```bash
python3 -B tools/ci/git/check_canonical_consistency.py --ci --base 4a166f3ed2a7000061acc737ee475ae3c47dca56 --head HEAD
# Exit code: 0
# [consistency] l1-edit-authority: 0 finding(s)
# [consistency] cited-paths: 0 finding(s)
# [consistency] cited-decisions: 0 finding(s)
# [consistency] task-claims: 0 finding(s)
```

### 5. 實際權威產物離線 dry-run 演練
```bash
python3 -B operations/verification/cleanup-owned-operational-fixtures.py \
  --artifact-dir .local/fleet-storage-diagnosis-20261008/referral-reviewed-composition-dev-deployment-20261009/artifacts/operational-browser-evidence-4a166f3ed2a7000061acc737ee475ae3c47dca56 \
  --mode dry-run \
  --offline
# Exit code: 0
# Status: dry_run_complete, 8 GCS planned physical targets, DB concrete blocker recorded.
```

### 6. 實際權威產物 apply 模式防護中斷演練
```bash
python3 -B operations/verification/cleanup-owned-operational-fixtures.py \
  --artifact-dir .local/fleet-storage-diagnosis-20261008/referral-reviewed-composition-dev-deployment-20261009/artifacts/operational-browser-evidence-4a166f3ed2a7000061acc737ee475ae3c47dca56 \
  --mode apply
# Exit code: 1
# Status: error, mode: apply, error: Unsafe exported apply is unconditionally disabled per security review.
```

## 6. 三道閘門現況 (Three Gates Status)

1. `owned_operational_cleanup_actual_planner_boundary_regressions`:
   🟢 **READY (本機已通過)**：38 項單元測試全數通過，`check_test_coverage.py` 驗證通過（95/95 測試檔），一致性檢查通過（0 findings），完整涵蓋 9 項審查 finding 之回歸測試。
2. `owned_operational_cleanup_exact_sha_review_ci_merge`:
   🟡 **PENDING (待獨立審查、CI 與合併)**：由獨立審查者 Codex 針對本次 repair 產生之全新候選 SHA 進行審查，待 GitHub Actions 強制性 CI 全數綠燈後，依保護分支規則合併至 `dev`。
3. `owned_operational_cleanup_genuine_hosted_exact_objects_records_preservation`:
   🟡 **PENDING (待託管維運執行)**：代碼合併後，由 Operator 於受控環境在非部署視窗手動派發。在未具有安全非異動 DB 連線合約前，apply 模式將持續落實 fail-closed 阻擋，避免 GCS 物件被孤立刪除。
