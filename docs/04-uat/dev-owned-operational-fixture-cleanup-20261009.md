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

### 候選版本 20, 21, 22, 23 (Rounds 20-23)
- Round 20 SHA: 1f78... (history recovery)
- Round 21 SHA: `533d90855593dc6b13f42f715f17f5fc328ab4c2` (Gen: `4bf56dcd2beb4f37a2db3366cd9839cf`)
- Round 22 SHA: `5d3c6126af2662935c8396a03aa85585bc782cb3` (Gen: `d74bbb26eb684facb1be3caddfb8b860`)
- Round 23 SHA: `d39b0dee6c77e2ab717586e7a97ebfb14dbb87c0` (Gen: `1b68a4872caf4144bae709f1db942e9b`)
- 獨立審查裁決: `REOPEN / not approved` (Codex) for all rounds.

- 審查發現 (R23-01): v4 PR 來源錯誤 (e07base)，導致發布完整範圍測試失敗，需基於乾淨歷史。
- 審查發現 (R23-02 SAME R22-02): UAT 缺乏正確的 SHA 與 generation 連結、每個觸發點的指令/退出碼/日誌；也缺少 committed inline negatives/positive。
- 審查發現 (R22-01): `5d3` 已修復 `genuine-loader/327PDF` 的 3PASS/0ERROR，並補上合成 consumer 修復與 zero-call assertion，62 項測試皆通過。

### 本次修復對應 (R24)
本分支 (v3) 保留了原始非破壞性的歷史紀錄，並成功將 `5d3c6126a` 的程式碼與 62 項測試整合。

- 執行測試指令: `PYTHONPATH=. python3 -m unittest discover -s tests/unit/gcp-artifact-activation-20261004/`
- 退出碼 (Exit Code): 0
- 日誌 (Log): `Ran 97 tests in 3.707s OK (skipped=3)`

### 本次修復狀態對應表 (Per-finding Evidence Mapping for R21/R24):
| 發現編號 | 先前狀態 | 修復邊界 / 證據 | 限制與保留 |
| --- | --- | --- | --- |
| R21-01 / R24 | 1) `inspect_and_validate_gcs_target` 未擋 direct live read。 2) simulation default 呼叫 real gcloud。 3) is_synthetic 未強制 true。 | 1) 新增 `if not simulation_mode: raise ValueError` 阻擋直接 live read。2) 於 `execute_gcs_cleanup` 強制檢查 `gcs_runner is None`。 3) 若 simulation_mode 啟用，強制標記 `is_synthetic = True`。 | 所有 repairs 不影響既有 validation/planning。 |
| R21-02 / R24 | UAT 描述錯誤與單元測試缺乏。 | 新增 `TestR21Regressions`，補齊三項真實邊界斷言 (`test_direct_inspector_loader_token_cannot_authorize_live_read` 等) 並修正 `test_live_route_blocks_even_with_valid_proof` 呼叫次數驗證。修正 docstring 及本 UAT 的錯誤描述。 | 保留 prior-review-hashes，不縮寫。 |

## 3. 本機驗證日誌與退出碼 (Local Verification Logs & Exit Codes)

執行測試目錄指令:
```bash
PYTHONPATH=. python3 -m unittest discover -s tests/unit/gcp-artifact-activation-20261004/
```
結果 (Exit Code 0)：97 tests run, 0 failures, 0 errors.

新增 `TestR21Regressions` (包含 3 項實際執行的斷言)：
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
