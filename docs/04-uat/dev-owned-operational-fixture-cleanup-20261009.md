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
  - 真實捕捉之 GitHub 憑證 (Genuine captured archive proof)：以真實、未竄改之 9-job 列表與 5850 bytes ZIP（hash `2fc9...`）進行測試時，已成功載入實際儲存紀錄，並取得成功狀態。該檔案證明了生產函式的行為，但並未提供連線至 DB/GCS 的活體鑑別，真實網路操作被阻擋以維護安全。

## 2. 候選版本拒絕歷史與 CI 狀態 (Rejected Candidates History & CI Status)

本任務遵循 AI Collaboration Guide §0.7 與二輪同類缺陷重做規則，完整保留歷次被拒絕之候選版本歷史：

### 候選版本 1 至 8 (Rounds 1-8)
歷史拒絕包含: `a6bcfe4ac` (R1), `3f40da22d` (R2), `6d911a7c7` (R3), `ce568eaab` (R4), `18917e0bc` (R5), `da975e42d` (R6), `8de8d93a8` (R7), `77d1b9f39` (R8)。
各自因不同缺陷遭拒，包括邊界問題、憑證綁定與安全缺陷。

### 候選版本 9 (Round 9)
- 獨立審查裁決: `REOPEN / not approved`
- Stale machine transaction 與後續實際 source `f68c92cdd` 遭拒絕，之後提交之 `3cf4ef7a` 並未通過審核即遭替換歷史。
- 拒絕原因: R9-01 至 R9-06，包含遺漏時間戳邊界、網路操作行為與未驗證的完整憑證。

### 候選版本 10 (Round 10): 0ed9a16dd
- 拒絕候選 SHA: `0ed9a16dd5d938ded9e81005bb441f1201d75b72` / Generation: `5e41091af60446d3a0ed15b178cd596f`
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現: R10-01 (已修正); R10-02/R10-03 (未完全修正，權威性鑑定尚可被竄改偽造); R10-04 (已修正); R10-05 (UAT 描述不實，未能完整列出缺陷與歷史)。

### 候選版本 11 (Round 11): 0aa6b4234 (本回修復前)
- 拒絕候選 SHA: `0aa6b4234793268faa21b178ca6df6f8a26bd22b` / Generation: `b20bf24a7ea74f47a8efed0db8599eff`
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現與本回修復對應：
  - **R11-01:** Job 權威驗證可被竄造，如接受重複、缺漏的 jobs 或外部 URL。**修復:** 綁定唯一 Acceptance Job (`113747921500`) 及完整 URL 驗證，並要求存在且皆成功的 9 個 required jobs。
  - **R11-02:** 導出的 planner / pipeline 未驗證偽造的時區天真 (naive) 或跨域的時間戳 (2020-2030)。**修復:** 在 `validate_provenance` 中綁定真實區間界限 (`EXPECTED_RUN_BOUNDS_START/END`)，強制 caller 提供精確相符之 `run_bounds`，並要求所有 `parse_time` 強制提供時區。
  - **R11-03:** UAT 文件對模組的「零網路呼叫」等描述不實且缺少真實 ZIP 支援聲明。**修復:** 修正為：非離線模式 `main(--artifact-dir)` 仍會代理執行 `gcloud` 而非零網路操作，並如實記載 R9 歷史。

## 3. 本機驗證日誌與退出碼 (Local Verification Logs & Exit Codes)

### 1. 測試檔案覆蓋率檢查
```bash
python3 -B tools/ci/check_test_coverage.py
# Exit code: 0
```

### 2. 單元測試套件執行
```bash
python3 -B -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py -v
# Exit code: 0
# Ran 49 tests ... OK
```

### 3. 本機測試目錄自動發現驗證
```bash
python3 -B -m unittest discover -s tests/unit/gcp-artifact-activation-20261004 -p 'test_*.py'
# Exit code: 0
# Ran 77 tests ... OK (skipped=3)
```

## 4. 三道閘門現況 (Three Gates Status)

| Required acceptance | Exact candidate evidence | Remaining conditions |
| --- | --- | --- |
| `owned_operational_cleanup_actual_planner_boundary_regressions` | **NOT SATISFIED**: 已補齊真實 loader 之負面迴歸測試（重複 job、缺漏 job、外部 URL、竄改 bounds、無時區時間），真實 ZIP 載入成功，測試計數 `77 run/3 SKIP, 49 PASS`。Mock DB/GCS 傳輸未建立線上權限。 | R11-01/02 及 R11-03 之證據已補齊，待後續審查與 mock 環境以外的安全上線合約。 |
| `owned_operational_cleanup_exact_sha_review_ci_merge` | **NOT SATISFIED**: Local = OPEN PR, 等待外部 CI 發現與檢查，狀態為 pending/in_progress。 | 待新 SHA 完整 CI 通過並保護合併。 |
| `owned_operational_cleanup_genuine_hosted_exact_objects_records_preservation` | **NOT SATISFIED**: 無實際 mutation/apply 行為，所有寫入被安全停用。 | 待授權的隔離 Operator 執行合約開放後完成真實物件刪除。 |
