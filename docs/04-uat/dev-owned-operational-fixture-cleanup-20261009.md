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

## 2. 候選版本 a6bcfe4ac 拒絕歷史與 CI 狀態

- **拒絕候選 SHA:** `a6bcfe4acdb8412fe1997ff20927e854608562c7`
- **候選 Generation:** `f1bae1f4416c4ccfa42d2eed9b2770b0`
- **獨立審查裁決:** Codex 於 2026-10-09T14:41Z 裁決 `REOPEN / not approved`（審查結論檔案 SHA-256: `a23bb9d83954eca3666b0105708834b93e12e3305e4d748a8912491e4b21d1a8`）。
- **強制性 CI 狀態:**
  - CI Run `37912160451`：Change scope 與 Smoke acceptance 失敗；
  - CI Integration Run `37912160579`：changes, e2e, ci-integ 失敗；
  - 根本原因：舊測試檔案 `operations/verification/test_cleanup_owned_operational_fixtures.py` 不在既有 CI 發現路徑內，導致 `tools/ci/check_test_coverage.py` 判定為未執行測試。
  - 此外，審查確認 10 項真實執行、安全與來源防護缺失。
- **維運執行狀態:**
  - `cleanup_not_performed: true`。所有雲端測試夾具與資料庫紀錄均完整保留，未進行任何未授權異動。

## 3. 具體修復範圍與 10 項 Findings 清單

Supervisor 核准精確測試重置（四個最終原始碼檔案，五個過渡寫入路徑用於移除舊測試）：
1. `.github/workflows/dev-owned-operational-fixture-cleanup.yml`
2. `operations/verification/cleanup-owned-operational-fixtures.py`
3. `tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py`（新增於既有 CI 根目錄）
4. `docs/04-uat/dev-owned-operational-fixture-cleanup-20261009.md`
5. `operations/verification/test_cleanup_owned_operational_fixtures.py`（過渡路徑，已透過 `git rm` 移除）

### AI Collaboration Guide §0.7 Finding 修正對照表

| Finding | 缺陷描述與觸發情境 | 修正方式與原始碼變更 | 驗證命令與結果 |
| --- | --- | --- | --- |
| **Finding 1** (Workflow checkout & inventory) | `dev-owned-operational-fixture-cleanup.yml` 檢出產品來源 `inputs.source_ref` (4a16)，但該 commit 中並無清理工具與 `.local` inventory，導致工作流派發直接報錯。 | 區分工具定義檢出（預設檢出本 PR commit）與產品來源 guard；透過 `gh run download` 下載正式產物 11606165993，不依賴本機 `.local`。 | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/dev-owned-operational-fixture-cleanup.yml'))"`<br>Exit code: 0 |
| **Finding 2** (CI discovery root) | 測試放在 `operations/verification/`，不在任何 CI 發現路徑中，導致 `check_test_coverage.py` 退出碼 1。 | 將測試搬移至 `tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py`，並移除舊檔案。 | `python3 tools/ci/check_test_coverage.py`<br>Exit code: 0<br>`all 94 test files yield tests CI runs.` |
| **Finding 3** (GCS error classification) | `default_gcs_runner` 將所有非零退出碼（包含 403、網路逾時）視為 `not_found`，導致錯誤被誤判為已成功清理。 | 嚴格比對 stderr 中的 404 / NotFound 訊號；其餘一律標記為 `error` 並 fail-closed；無先前 receipt 的 404 亦視為異常而非清理成功。 | `python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py -k TestGcsErrorClassificationAndValidation`<br>Exit code: 0 |
| **Finding 4** (Live GCS object identity) | GCS 刪除前僅檢查 size，忽略 live generation 數字形狀、metageneration、MIME (`application/pdf`) 與 SHA-256 雜湊。 | 實作 `inspect_and_validate_gcs_target`，於刪除前強制驗證 numeric generation、metageneration、MIME、327 bytes 及 SHA-256 雜湊。 | 單元測試 `test_gcs_metadata_bad_content_type_rejected`、`test_gcs_metadata_bad_hash_rejected` 通過。 |
| **Finding 5** (Preflight before mutation) | apply 模式先刪除 GCS 物件，隨後才回傳 DB blocked，破壞原子性並使管線退出碼為 0。 | 所有 GCS 與 DB 預檢均置於任何異動前；apply 模式下若 DB 阻礙存在，立即停止任何 GCS 異動，且 `main()` 退出碼為非零 (1)。 | `python3 operations/verification/cleanup-owned-operational-fixtures.py --artifact-dir ... --mode apply`<br>Exit code: 1<br>`gcs_cleanup.status: skipped_due_to_db_blocker` |
| **Finding 6** (DB guards & review events) | DB 忽略 dry-run 仍執行刪除；接受 `rows_affected: 0`；且刪除受外鍵與審計保護之 `fleet.supply_review_events`。 | dry-run 模式絕不執行 DELETE；永久保留 `fleet.supply_review_events`，若有審計事件關聯則阻止刪除父表 submission；拒絕 0 筆異動。 | 單元測試 `test_dry_run_never_executes_delete`、`test_apply_mode_stops_if_supply_review_events_exist`、`test_apply_mode_rejects_zero_rows_affected` 通過。 |
| **Finding 7** (Authoritative artifact binding) | 腳本仰賴 caller 傳入之本機 inventory，測試以 synthetic fallback 偽造資料。 | 實作 `load_and_validate_authoritative_artifact`，直接解析 GitHub `artifacts.json`、`report.json`（驗證 16 passed）與 `operational-browser-evidence.json`；移除合成 fallback。 | 單元測試 `test_load_and_validate_authoritative_artifact` 通過。 |
| **Finding 8** (CLI argument enforcement) | CLI 參數 `--source-sha` 與 `--run-id` 解析後未於程式邏輯中強制檢查。 | 於 `main()` 與 `validate_provenance` 中強制驗證 CLI 參數必須精確等於期望常數，否則退出碼 1。 | 單元測試 `test_cli_rejects_mismatched_source_sha`、`test_cli_rejects_mismatched_run_id` 通過。 |
| **Finding 9** (DEV WIF pre-auth guards) | 工作流環境變數使用 fallback literals 及 generic fallback `secrets.WIF_*`。 | 移除所有 generic fallback；在 WIF 登入前加入 pre-auth guard，強制檢查 DEV 專屬 secrets 與指定專案 `drts-dev-devcc-20260825`、區域 `us-central1`。 | 工作流 YAML 語法驗證通過，符合 DEV-only 限制。 |
| **Finding 10** (DB lane blocker evidence) | 候選版本宣稱 hosted 環境完全缺乏 Cloud SQL / 機密存取，與部署原始碼不符。 | 依據 `Dockerfile.migrate`、`db-apply.sh`、`deploy-dev.yml` 正確診斷：Cloud Run migration job 具連線與機密，但 ENTRYPOINT 固定為遷移指令，無法執行任意腳本且禁止修改預設 job；GitHub Actions SA 具有身分分離無法直接存取；且 schema 外鍵與審計紀錄保護 reviewed submission。 | 精確記錄具體阻礙於原始碼常數 `DB_CONCRETE_BLOCKER` 與文件。 |

## 4. 資料庫通道與保留合約精確分析 (DB Lane & Preservation)

1. **現行部署架構分析:**
   - 經靜態檢視 `Dockerfile.migrate`、`operations/database/db-apply.sh`、`infra/gcp/staging/migrate-job.yaml` 與 `.github/workflows/deploy-dev.yml`：
   - 專案已具有 Cloud Run migration job `drts-migrate`，具有 Cloud SQL instance 綁定與 `DATABASE_URL` secret 掛載。
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

## 5. 本機驗證日誌與退出碼

### 1. 測試檔案覆蓋率檢查 (`tools/ci/check_test_coverage.py`)
```bash
python3 tools/ci/check_test_coverage.py
# Exit code: 0
# Output: check_test_coverage: all 94 test files yield tests CI runs.
```

### 2. 重置後之完整單元測試套件
```bash
python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py -v
# Exit code: 0
# Ran 33 tests in 0.018s ... OK
```

### 3. 本機測試目錄自動發現驗證
```bash
python3 -m unittest discover -s tests/unit/gcp-artifact-activation-20261004 -p 'test_*.py'
# Exit code: 0
# Ran 68 tests ... OK (skipped=3)
```

### 4. 實際權威產物離線 dry-run 演練
```bash
python3 operations/verification/cleanup-owned-operational-fixtures.py \
  --artifact-dir .local/fleet-storage-diagnosis-20261008/referral-reviewed-composition-dev-deployment-20261009/artifacts/operational-browser-evidence-4a166f3ed2a7000061acc737ee475ae3c47dca56 \
  --mode dry-run \
  --offline
# Exit code: 0
# Status: dry_run_complete, 8 GCS planned receipts, DB concrete blocker recorded.
```

### 5. 實際權威產物 apply 模式防護中斷演練
```bash
python3 operations/verification/cleanup-owned-operational-fixtures.py \
  --artifact-dir .local/fleet-storage-diagnosis-20261008/referral-reviewed-composition-dev-deployment-20261009/artifacts/operational-browser-evidence-4a166f3ed2a7000061acc737ee475ae3c47dca56 \
  --mode apply
# Exit code: 1
# Status: blocked, gcs_cleanup.status: skipped_due_to_db_blocker, 0 mutations executed.
```

## 6. 三道閘門現況 (Three Gates Status)

1. `owned_operational_cleanup_actual_planner_boundary_regressions`:
   🟢 **READY (本機已通過)**：33 項單元測試全數通過，`check_test_coverage.py` 驗證通過（94/94 測試檔），完整涵蓋 10 項審查 finding 之回歸測試。
2. `owned_operational_cleanup_exact_sha_review_ci_merge`:
   🟡 **PENDING (待獨立審查、CI 與合併)**：由獨立審查者 Codex 針對本次 repair 產生之全新候選 SHA 進行審查，待 GitHub Actions 強制性 CI 全數綠燈後，依保護分支規則合併至 `dev`。
3. `owned_operational_cleanup_genuine_hosted_exact_objects_records_preservation`:
   🟡 **PENDING (待託管維運執行)**：代碼合併後，由 Operator 於受控環境在非部署視窗手動派發。在未具有安全非異動 DB 連線合約前，apply 模式將持續落實 fail-closed 阻擋，避免 GCS 物件被孤立刪除。
