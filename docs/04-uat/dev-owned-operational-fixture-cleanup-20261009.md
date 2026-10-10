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

## 2. 候選版本拒絕歷史與 CI 狀態 (Rejected Candidates History & CI Status)

本任務遵循 AI Collaboration Guide §0.7 與二輪同類缺陷重做規則，完整保留歷次被拒絕之候選版本歷史：

### 候選版本 1 至 8 (Rounds 1-8)
歷史拒絕包含: `a6bcfe4ac` (R1), `3f40da22d` (R2), `6d911a7c7` (R3), `18917e0bc` (R4), `da975e42d` (R5), `8de8d93a8` (R6), `ce568eaab` (R7), `77d1b9f39` (R8)。
各自因不同缺陷遭拒，包括邊界問題、憑證綁定與安全缺陷。

### 候選版本 9 (Round 9)
- 獨立審查裁決: `REOPEN / not approved`
- 實際 source `f68c92cdd` 遭到拒絕；應明確區分 rejected stale machine transaction 與未經審查即被替換的 `3cf4ef7a`。此非成功之 canonical reopen。
- 拒絕原因: R9-01 至 R9-06，包含遺漏時間戳邊界、網路操作行為與未驗證的完整憑證。

### 候選版本 10 (Round 10): 0ed9a16dd
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現: R10-01 (已修正); R10-02/R10-03 (未完全修正); R10-04 (已修正); R10-05 (UAT 描述不實)。

### 候選版本 11 (Round 11): 0aa6b4234
- 獨立審查裁決: `REOPEN / not approved` (Codex)

### 候選版本 12 (Round 12): 9dcaa35a97
- 拒絕候選 SHA: `9dcaa35a97171111a4098c8cad1fbc10679e8a98` / Generation: `7e610a6179b049ed9495180995342d36`
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 本次修復狀態對應表 (Per-finding Evidence Mapping):
  | 發現編號 | 先前狀態 / 命令結果 | 修復邊界 / 證據 | 限制與保留 |
  | --- | --- | --- | --- |
  | R12-01 | 新的寫死 bounds (`08:00`-`10:05`) 拒絕了真實且未修改的 archive。測試中的 loader positives 透過 patch digest 與發明的新 constants 來驗證，並非真實證明。 | 修改程式碼中的 global constants 為真實的 job bounds (`09:01:12` - `09:04:01`)，使真實未修改的 ZIP 能夠成功通過載入檢驗。 | 不竄改真實在線證明；未經授權的伴隨 dates 會被標記或阻擋。 |
  | R12-02 | 9-job 列表中的 8 個 "other jobs" 僅驗證長度與狀態，導致同 cardinality 且造假的 jobs 亦被視作驗證成功。 | 針對 jobs.json 中的每一筆 entry，強制執行 `id` 唯一性、`run_id`、`head_sha`，以及 `html_url`/`url` 的前綴格式綁定，不依賴空泛長度或狀態。 | 保留原有真實 ZIP 正向測試與嚴格竄改拒絕；並非所有 job 身分問題都由空泛描述涵蓋。 |
  | R12-03 | 匯出的 direct inspector 或 pipeline 仍依賴 caller 提供的 bounds，若 caller 仿造公開的 constants，仍可製造 false validity。 | 放棄信任 target 的 caller `run_bounds`。在 `inspect_and_validate_gcs_target` 強制套用與驗證真實捕獲之 `EXPECTED_RUN_BOUNDS_START/END`。 | 所有 caller 仿造日期的 object 檢查都會因真實邊界失敗；不依賴外部 boolean。 |
  | R12-04 | UAT 描述錯誤，包含宣稱真實 9-job ZIP 通過測試、不實的修復聲明、錯誤的歷史關聯與測試數字。 | 重寫 UAT，如實反映 R12-01 至 R12-03 未修復時的行為，更正歷史 round mapping，並更正測試數字為 84 (81 PASS / 3 SKIP)。 | UAT 不作為單純的鏡像測試，而是真實反映機器環境行為。 |

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
# Ran 84 tests in 3.634s
# OK (skipped=3)
```

## 4. 三道閘門現況 (Three Gates Status)

| Required acceptance | Exact candidate evidence | Remaining conditions |
| --- | --- | --- |
| `owned_operational_cleanup_actual_planner_boundary_regressions` | **NOT SATISFIED**: 已補齊真實 loader 之負面迴歸測試（重複 job、缺漏 job、外部 URL、竄改 bounds、無時區時間）。Mock DB/GCS 傳輸未建立線上權限。本次修復 R12-01/02/03 補足了 production-path 的正向與負向證據。 | 待後續審查與 mock 環境以外的安全上線合約。 |
| `owned_operational_cleanup_exact_sha_review_ci_merge` | **NOT SATISFIED**: Local = OPEN PR, 等待外部 CI 發現與檢查，狀態為 pending/in_progress。 | 待新 SHA 完整 CI 通過並保護合併。 |
| `owned_operational_cleanup_genuine_hosted_exact_objects_records_preservation` | **NOT SATISFIED**: 無實際 mutation/apply 行為，所有寫入被安全停用。 | 待授權的隔離 Operator 執行合約開放後完成真實物件刪除。 |
