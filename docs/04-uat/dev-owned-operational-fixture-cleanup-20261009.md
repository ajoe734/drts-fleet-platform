# SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009 UAT Report

## 1. 任務背景與真實驗收現況 (Product Ground Truth)

- **持有者 (Owner):** Gemini2
- **獨立審查者 (Reviewer):** Codex
- **產品執行版本 (Product Source):** `4a166f3ed2a7000061acc737ee475ae3c47dca56`
- **授權部署紀錄 (Authorized Deploy):** GitHub Actions run `37906298090`
- **真實驗收報告 (Authentic Operational Browser Evidence):**
  - 16 項旅程全部通過（16 passed / 0 failed / 0 skipped / 0 flaky），契約驗證 14 項通過。
  - 共收集 58 筆正式驗證記錄。
  - 8 筆物理 327-byte PDF 鏈路：`intent (201) -> PUT (200) -> confirm (201) -> download (200)`，SHA-256 全數為 `4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784`，MIME 為 `application/pdf`。
- **維運防護邊界 (Operational Security Fences):**
  - GCS 與 DB 清理操作目前僅支援離線驗證 (`--offline`) 模式。真實託管環境讀取 (`Hosted Auth Lane`) 已明確停用。
  - 腳本與部署工作流不支援 apply (mutation)。任何 apply 模式的執行將受到強制阻止 (fail-closed)。

## 2. 候選版本拒絕歷史與 CI 狀態 (Rejected Candidates History & CI Status)

本任務遵循 AI Collaboration Guide §0.7 與二輪同類缺陷重做規則，完整保留歷次被拒絕之候選版本歷史：

### 候選版本 1: a6bcfe4ac
- 拒絕候選 SHA: `a6bcfe4acdb8412fe1997ff20927e854608562c7` / Generation: `f1bae1f4416c4ccfa42d2eed9b2770b0`
- 裁決: `REOPEN / not approved`。舊測試檔案未搬移至既有 CI 發現路徑內，且具備實體與安全邊界缺陷。

### 候選版本 2: 3f40da22d
- 拒絕候選 SHA: `3f40da22d58431a7b0d41c6738ae6e73cb9ee250` / Generation: `5cdab5d3641d4636a657b85f5564702a`
- 裁決: `REOPEN / not approved`。實體對映、預檢順序、事務控制與工作流防護缺陷（R2-01 至 R2-09）。

### 候選版本 3: 6d911a7c7
- 拒絕候選 SHA: `6d911a7c777122bc013cb5eed2a2826e8063a87f` / Generation: `f06677f18bb3413387239babe58e2674`
- 裁決: `REOPEN / not approved`。時間戳邊界、ZIP provenance 綁定與 offline 標記缺失。

### 候選版本 4: ce568eaab
- 拒絕候選 SHA: `ce568eaab5a78081bed8f953bf0e7e25999a5da9`
- 裁決: `REOPEN / not approved`。同日未來時間戳被接受；DB deny 無頂層回傳狀態；合成 hash 與 time 缺少 synthetic 標籤。

### 候選版本 5 (Round 8): 77d1b9f39
- 拒絕候選 SHA: `77d1b9f3955e775460d6eeaea3ac686eeebebf83` / Generation: `b37b0cbb76be4e079bcabc94940bccbb`
- 獨立審查裁決: `REOPEN / not approved` (Codex 於 2026-10-09T18:05:12Z)
- 審查發現: 
  - **R8-01:** `run.json` 的 `head_sha` 被錯誤地與 product SHA 比對（應為 definition SHA），且 jobs list 缺乏真正的驗證與授權審查。
  - **R8-02:** GCS 日期時間檢查有缺失，同日 out-of-run timestamp 被接受，且 `timeCreated` 採用純字串相等驗證，未容許 native request/server 延遲差，並誤判 foreign bucket 404 為 `not_found`。
  - **R8-03:** 匯出的 simulation 遺失 provenance (synthetic 標記)，且資料庫驗證以空條件 count(*) 回傳成功，抹除預計存在的 DB block 狀態。
  - **R8-04:** GitHub workflow 錯誤地宣傳 apply 模式，實際背後默默強制使用 `dry-run`。
  - **R8-05:** 舊版 UAT 包含大量錯誤描述、不正確的 PDF hash 參照 (`2fc9…` 應為 `4028…`)，並宣稱程式具備其不實作的刪除交易功能。

### 本次候選 (Round 9)
- 修復了 `load_and_validate_authoritative_artifact` 校驗邏輯，嚴格要求 `jobs.json` 中的 `run_id`、`completed_at`，以及 ZIP 證據中的 `intentStatus`、`confirmStatus` 等約束。
- 修復了時間邊界檢查，嚴格要求傳入目標具備 `run_bounds`。
- 所有 42 項測試全數通過。這是一個完全離線 (offline) 模式的規劃器，不會對 DB 或 GCS 進行任何真實刪除或連線操作。
- UAT 文件與 Workflow 文件皆已修正，刪除了關於真實 DB 刪除交易的不實描述。

## 3. 本機驗證日誌與退出碼 (Local Verification Logs & Exit Codes)

### 1. 測試檔案覆蓋率檢查
```bash
python3 -B tools/ci/check_test_coverage.py
# Exit code: 0
# Output: check_test_coverage: all 95 test files yield tests CI runs.
```

### 2. 單元測試套件執行
```bash
python3 -B -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py -v
# Exit code: 0
# Ran 42 tests in 0.025s ... OK
```

### 3. 本機測試目錄自動發現驗證
```bash
python3 -B -m unittest discover -s tests/unit/gcp-artifact-activation-20261004 -p 'test_*.py'
# Exit code: 0
# Ran 77 tests ... OK (skipped=3)
```

## 4. 三道閘門現況 (Three Gates Status)

1. `owned_operational_cleanup_actual_planner_boundary_regressions`:
   🟡 **PARTIAL / UNVERIFIED**: 42 項單元測試全數通過。外部回應均採用 mock，缺乏真實 ZIP/GCS/PG 證據。本模組僅提供 dry-run 及 offline 模式，無任何真實資源刪除。
2. `owned_operational_cleanup_exact_sha_review_ci_merge`:
   🟡 **PENDING**: 新修復的 candidate 將待獨立審查，並等待 CI 與合併狀態完成。
3. `owned_operational_cleanup_genuine_hosted_exact_objects_records_preservation`:
   🟡 **PENDING**: 真實 Hosted 環境已明確停用 apply。因此尚未有任何授權的 Hosted 環境執行與憑證。
