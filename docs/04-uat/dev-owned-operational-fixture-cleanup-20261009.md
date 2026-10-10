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
    - 非離線真實 artifact 載入會被安全攔截，不執行任何真實的 cloud transport，所有 mutations 均被安全阻擋 (fail-closed)。
    - 離線合成模擬 (`--offline`)：不發起任何網路或 Socket 連線，完全依賴本地/庫存合成資料進行規劃。
  - 腳本與部署工作流不支援 apply (mutation)。任何 apply 模式的執行將受到強制阻止。

## 2. 候選版本拒絕歷史與 CI 狀態 (Rejected Candidates History & CI Status)

本任務遵循 AI Collaboration Guide §0.7 與二輪同類缺陷重做規則，完整保留歷次被拒絕之候選版本歷史：

(R1 至 R19 歷史已紀錄於 previous findings，包含遺漏時間戳邊界、網路操作行為與未驗證的完整憑證等)。

### 候選版本 20 & 21 (Rounds 20-21)
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現 (R21-01 / SAME R20-01): 
  1. Unsupported direct inspector live read: `inspect_and_validate_gcs_target` 在非模擬模式下不應讀取 live body。
  2. Simulation selects real default cloud transport: 若無明確提供 `gcs_runner`，simulation_mode 不應預設啟動 `default_gcs_runner`。
  3. Simulation receipts 依賴 callback marking: 真正的 bytes 返回會遺失 synthetic 標籤，導致真實 PDF bytes 在 simulation_mode 仍視為非合成。
- 審查發現 (R21-02 / SAME R20-02): 
  - UAT 對於 executors/inspectors 的 simulation_mode 強制性描述有誤。
  - Pipeline 注入 authority 於 "preflight 之後" 描述錯誤。
  - CLI non-offline 會呼叫 gcloud 屬實不實。
  - Test regressions 的數字屬舊版本紀錄，且吞沒錯誤。
  - 未補齊缺失的 R21-01 consumer regressions。

### 本次修復狀態對應表 (Per-finding Evidence Mapping for R21):
| 發現編號 | 先前狀態 | 修復邊界 / 證據 | 限制與保留 |
| --- | --- | --- | --- |
| R21-01 | 1) `inspect_and_validate_gcs_target` 未擋 direct live read。 2) simulation default 呼叫 real gcloud。 3) is_synthetic 未強制 true。 | 1) 新增 `if not simulation_mode: raise ValueError` 阻擋直接 live read。2) 於 `execute_gcs_cleanup` 強制檢查 `gcs_runner is None`。 3) 若 simulation_mode 啟用，強制標記 `is_synthetic = True`。 | 所有 repairs 不影響既有 validation/planning。 |
| R21-02 | UAT 描述錯誤與單元測試缺乏。 | 新增 `TestR21Regressions`，補齊三項真實邊界斷言 (`test_direct_inspector_loader_token_cannot_authorize_live_read` 等) 並修正 `test_live_route_blocks_even_with_valid_proof` 呼叫次數驗證。修正 docstring 及本 UAT 的錯誤描述。 | 保留 prior-review-hashes，不縮寫。 |

## 3. 本機驗證日誌與退出碼 (Local Verification Logs & Exit Codes)

執行指令:
```bash
python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py -v
```
結果：62 tests run, 0 failures, 0 errors.

新增 `TestR21Regressions`：
- `test_direct_inspector_loader_token_cannot_authorize_live_read`
- `test_simulation_without_runner_blocks_default_cloud_transport`
- `test_simulation_receipts_always_synthetic`
修正 `TestR18Regressions`：
- `test_live_route_blocks_even_with_valid_proof` 補上 DB runner 呼叫次數為零之斷言。

## 4. 三道閘門現況 (Three Gates Status)

| Required acceptance | Exact candidate evidence | Remaining conditions |
| --- | --- | --- |
| `owned_operational_cleanup_actual_planner_boundary_regressions` | **NOT SATISFIED**: 本次已實作包含 direct inspector 阻擋、simulation_mode 要求明確 runner 及合成結果標記，並附上 `TestR21Regressions`。 | 待後續審查與真實環境驗證。 |
| `owned_operational_cleanup_exact_sha_review_ci_merge` | **NOT SATISFIED**: 舊 SHA 因審查失敗 REOPEN。新 branch/commit 已建立。 | 待新 SHA 完整 CI 通過並保護合併。 |
| `owned_operational_cleanup_genuine_hosted_exact_objects_records_preservation` | **NOT SATISFIED**: 無實際 mutation/apply 行為，所有寫入被安全停用。 | 待授權的隔離 Operator 執行合約開放後完成真實物件刪除。 |
