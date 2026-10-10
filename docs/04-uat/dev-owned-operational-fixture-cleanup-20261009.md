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
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 處理 R12-01 到 R12-04 缺陷。

### 候選版本 13 (Round 13): 9a7eb7e50b22
- 拒絕候選 SHA: `9a7eb7e50b2265666f1f6e2de6e5045e0e381e8a` / Generation: `79cf96353f264629894446f19b470ee3`
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現: R13-01 到 R13-03。

### 候選版本 14 (Round 14): 14957c9fe71d9f2bf3725609169486f223cdf2b6 / Generation: b052c26959c94bdf8e972b88c77aceaa (Verdict SHA256: a89c3a8eb33eb76a462cd07c2225c2025d64527bfe9126e93f959ceef619ad42)
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現: R14-01, R14-02 等。雖然發生 CI failure (Unit Tests 5 失敗)，但獨立審查報告指出存在 R14 邊界缺陷。

### 候選版本 15 (Round 15): c52ecc5d5dcebf09d8b6801097f29c830286b79a / Generation: 9bf3bbac1967480eb7acbb92c15676a3
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現: 
  - R15-01 (Unit 1): `cleanup-owned-operational-fixtures.py` 接受發明的8個相同run jobs，未綁定真正的9個 capture jobs。
  - R15-02 (Unit 2): 缺乏真正 established archive authority 下執行 16 mock reads / emits 8 unmarked receipts。未確保 canonical target public authority。
  - R15-03 (Unit 3): 實際 workflow (`dev-owned-operational-fixture-cleanup.yml`) 寫入 unverified offline inventory 缺乏 `run_bounds`。c52 執行 CLI 時 exit 2。
  - R15-04 (Unit 4): UAT 53/54 IDset 等 claims 遭到 Unit 1/2 反證。

### 候選版本 16 (Round 16): adc9a096c7443cc74aa184265fe1e631cb032423 / Generation: 484761be040b414d973144135adb9cd6
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現: 
  - R16-01 (延續 R15-01): HTML URL 只檢查 prefix，導致 foreign job IDs 被接受 (`identity_mismatched_html_job_id`)。
  - R16-02 (延續 R15-02): 缺乏 authority 標記時預設為 true；executor 呼叫 `describe` 在 inspector 校驗 canonical truth 之前發生；inspector 信任 caller 的 expectations 而非 canonical constants。
  - R16-03 (延續 R15-04): UAT 溯源與 regression evidence 不完整。未包含完整 R14 SHA/generation/independent verdict 及 immutable 審查記錄。

### 候選版本 17 (Round 17): e8f2d8141235057a5df30ddca748396fd04c44e3 / Generation: 78823357f7254e50a8f74488699fc655
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現:
  - R17-01: 延續 R16-02，authority 為 public True 仍通過，ALL-target validation 發生在 mutate 階段而非 preflight。5 項 regression assertions 在 adc9/e8f2 上均 fail。
  - R17-02: 延續 R16-03，UAT 記載錯誤的 R14 截斷 SHA/gen，缺少 loglinks，將 exact command 縮寫為 ellipsis。

### 候選版本 18 (Round 18): 88f16159642427be634b0a4b0606ba1ff4fd6a8f / Generation: 026c93237ee44be29f92c93421bd0861
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現:
  - R18-01: 延續 R17-01，公開 token / archive 憑證仍提供非支援的 live authority。
  - R18-02: 延續 R17-02，UAT 依舊宣稱不存在之 unit regressions 並缺乏修復 traceability。
  - R18-03: Official full-range trailers 檢查失敗 (commit subject 不合規)。

### 候選版本 19 (Round 19): 8986f2b5244d4129c0b558852ddc513d1e5d9ede / Generation: 173837aa8ec04250b761da4f8beb3130
- 獨立審查裁決: `REOPEN / not approved` (Codex)
- 審查發現:
  - R19-01: 延續 R18-01，raw planner 仍盲目賦予 authority；direct inspector 接受 default gcloud runner；pipeline guard 不阻止 DB fallback。
  - R19-02: 延續 R18-02，UAT 記錄的 unit regressions 數字不實（舊版應為 58 PASS / 1 ERROR），且 synthetic positive test 吞沒例外而非正確 assert。

### 本次修復狀態對應表 (Per-finding Evidence Mapping for R19):
| 發現編號 | 先前狀態 / 舊 SHA (8986) | 修復邊界 / 證據 | 限制與保留 |
| --- | --- | --- | --- |
| R19-01 | 8986 中 raw planner 盲目 promote `_VALID_PROOF`，且 pipeline 未正確阻擋 fallback 到 live route。 | `build_cleanup_plan` 不再核發 authority。由 `run_cleanup_pipeline` 在確認 preflights 後注入。所有直接執行者與巡檢強制檢驗 `simulation_mode=True`。 | 不自動升級 historical archive validation 為 live runtime authority。 |
| R19-02 | UAT 宣稱 4 FAIL / 1 PASS 不實（實際為 58 PASS / 1 ERROR）。`test_legitimate_synthetic_route` 吞沒錯誤。 | 更新 SAME UAT 帶入實際 old/new 版次狀態。補齊 `test_legitimate_synthetic_route` 的真實 assertions（包含 receipts `synthetic` 屬性檢查）。目前新 branch 59 tests 全部 PASS。 | 保留 prior-review-hashes，不縮寫。 |

### 歷史修復狀態對應表 (Per-finding Evidence Mapping for R18):
| 發現編號 | 先前狀態 / 舊 SHA (88f1) | 修復邊界 / 證據 | 限制與保留 |
| --- | --- | --- | --- |
| R18-01 | 88f1 中 public `_VALID_PROOF` 仍可進行 live route mock reads。 | 於 `execute_gcs_cleanup` 與 `run_cleanup_pipeline` 中，強制要求 `simulation_mode=True` 方可繼續。未開啟則 explicitunverified/blocked。已提交4項 formal regressions (`TestR18Regressions`)。 | 不自動升級 historical archive validation 為 live runtime authority。 |
| R18-02 | UAT 宣稱已修復但 5 項 unit regressions 未 commit，且 UAT 原本的 script exited 1。 | 更新 SAME UAT 帶入實際 old/new 版次狀態。補齊 real-production regression assertions 並確認 59 tests 全部 PASS。 | 保留 prior-review-hashes，不縮寫。 |
| R18-03 | 88f1 提交訊息不符 `<TASK-ID>: <summary>` 規範。 | 由 Gemini2 進行 governed history recovery，新 branch 將採用嚴格規範之 commit subject。 | 原 commit history 被取代為新 branch 並符合 official full-range trailers。 |

## 3. 本機驗證日誌與退出碼 (Local Verification Logs & Exit Codes)

執行指令 (舊 8986f2b5 上 58 PASS / 1 ERROR，新 branch 上全數 PASS):
```bash
python3 -B -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py -v
```
結果：59 tests run, 0 failures, 0 errors.

新增 `TestR18Regressions`：
- `test_live_route_blocks_even_with_valid_proof`
- `test_public_true_blocks`
- `test_missing_marker_blocks`
- `test_legitimate_synthetic_route`

## 4. 三道閘門現況 (Three Gates Status)

| Required acceptance | Exact candidate evidence | Remaining conditions |
| --- | --- | --- |
| `owned_operational_cleanup_actual_planner_boundary_regressions` | **NOT SATISFIED**: 本次加入 explicit live route blocking，並提交 R18-01 要求的 4 項 formal regressions。 | 待後續審查與真實環境驗證。 |
| `owned_operational_cleanup_exact_sha_review_ci_merge` | **NOT SATISFIED**: 舊 SHA 失敗於 trailers check。新 branch 與 PR 即將建立。 | 待新 SHA 完整 CI 通過並保護合併。 |
| `owned_operational_cleanup_genuine_hosted_exact_objects_records_preservation` | **NOT SATISFIED**: 無實際 mutation/apply 行為，所有寫入被安全停用。 | 待授權的隔離 Operator 執行合約開放後完成真實物件刪除。 |
