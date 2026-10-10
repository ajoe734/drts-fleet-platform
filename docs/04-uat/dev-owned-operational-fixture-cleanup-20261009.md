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
  - GCS 與 DB 清理操作支援兩種模式：
    - 非離線模式：會呼叫 `gcloud describe` 與 `gcloud cat` 進行真實資源讀取驗證。但真實託管環境讀取 (`Hosted Auth Lane`) 目前已被明確停用。
    - 離線合成模擬 (`--offline`)：不發起任何網路或 Socket 連線，完全依賴本地/庫存合成資料進行規劃。
  - 腳本與部署工作流不支援 apply (mutation)。任何 apply 模式的執行將受到強制阻止 (fail-closed)。
  - 真實捕捉之 GitHub 憑證 (Genuine captured archive proof)：以真實、未竄改之 9-job 列表與 5850 bytes ZIP（hash `2fc9...`）進行測試時，已成功通過並載入 8 筆儲存記錄，無驗證失敗。

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

### 補充遺失之中間歷史 (Missing Historical Rejects)
- `18917e0bc8539c66a34551872e5b031df9d60bdd` / Generation: `8d867c050b1eb10a26d25f778a46b8be` - 拒絕: `REOPEN / not approved` (Round 5)。
- `da975e42def96eab006adb69b13153e90a329a00` / Generation: `c0f9da8d13dd91986561fcceab2d3be4` - 拒絕: `REOPEN / not approved` (Round 6)。
- `8de8d93a87fe91459face0f14f849a24353c704e` / Generation: `7f0430db734267e7136015d862f928e4` - 拒絕: `REOPEN / not approved` (Round 7)。

### 候選版本 8 (Round 8): 77d1b9f39
- 拒絕候選 SHA: `77d1b9f3955e775460d6eeaea3ac686eeebebf83` / Generation: `b37b0cbb76be4e079bcabc94940bccbb`
- 獨立審查裁決: `REOPEN / not approved` (Codex 於 2026-10-09T18:05:12Z)
- 審查發現包含 `head_sha` 錯誤、GCS 日期驗證缺陷、DB count 抹除 block 狀態與錯誤 UAT。

### 候選版本 9 (Round 9): f68c92cdd & 3cf4ef7a
- 獨立審查裁決 (對 `f68c`): `REOPEN / not approved` 
- 審查發現: 
  - **R9-01:** DB 明確拒絕引發未預期 exception。
  - **R9-02:** report/full upload-chain fields (intent201, confirm201, readbackSize, recordedAt) 缺少驗證。
  - **R9-03:** 遺失時間戳邊界檢查。
  - **R9-04:** 缺乏 flagless digest-only 的模擬支援。
  - **R9-05:** UAT 內容未反映真實。
  - **R9-06:** 舊 commit 格式錯誤 (替換歷史已修正)。

### 候選版本 10 (Round 10): 0ed9a16dd (本回修復前)
- 拒絕候選 SHA: `0ed9a16dd5d938ded9e81005bb441f1201d75b72` / Generation: `5e41091af60446d3a0ed15b178cd596f`
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現與本回修復對應：
  - **R10-01:** 離線 workflow inventory 缺乏 `run_bounds` 造成崩潰。**修復:** 若使用未經驗證之離線 inventory，直接標記為 `unverified_planning_only`。
  - **R10-02:** 檔案 metadata 之 `run_id` 雖有檢查但 `head_sha` 與 terminal 狀態不足。**修復:** 加入嚴格 `ajoe734/drts-fleet-platform` 庫綁定與 `status == completed`。
  - **R10-03:** `timeCreated`、`updated`、`stored-at` 等未對其 `run_bounds` 嚴格把關。**修復:** 實施精確的時間戳上下界比較。
  - **R10-04:** DB 的 `SELECT count(*)` 正向回傳掩蓋了無授權合約的事實，且 `db_runner` 逾時會逃脫。**修復:** 攔截 `Exception` 並將 DB generic preflight 強制降級為 `blocked`，不允許 `dry_run_complete`。
  - **R10-05:** 現有 UAT 對真實網路行為與 genuine ZIP 描述不實，遺失歷史。**修復:** (即本文件更新)。

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
