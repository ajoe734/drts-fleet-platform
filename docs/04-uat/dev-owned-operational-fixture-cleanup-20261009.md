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

(R1 至 R13 歷史已紀錄於 previous findings，包含遺漏時間戳邊界、網路操作行為與未驗證的完整憑證等)。

### 候選版本 14, 15, 16, 17, 18, 19 (Rounds 14-19)
- Round 14 SHA: `14957c9fe71d9f2bf3725609169486f223cdf2b6` (Gen: `b052c26959c94bdf8e972b88c77aceaa`) - 審查裁決: REOPEN / not approved (Verdict SHA256: a89c3a8eb33eb76a462cd07c2225c2025d64527bfe9126e93f959ceef619ad42)
- Round 15 SHA: `c52ecc5d5dcebf09d8b6801097f29c830286b79a` (Gen: `9bf3bbac1967480eb7acbb92c15676a3`) - 審查裁決: REOPEN / not approved
- Round 16 SHA: `adc9a096c7443cc74aa184265fe1e631cb032423` (Gen: `484761be040b414d973144135adb9cd6`) - 審查裁決: REOPEN / not approved
- Round 17 SHA: `e8f2d8141235057a5df30ddca748396fd04c44e3` (Gen: `78823357f7254e50a8f74488699fc655`) - 審查裁決: REOPEN / not approved
- Round 18 SHA: `88f16159642427be634b0a4b0606ba1ff4fd6a8f` (Gen: `026c93237ee44be29f92c93421bd0861`) - 審查裁決: REOPEN / not approved
- Round 19 SHA: `8986f2b5244d4129c0b558852ddc513d1e5d9ede` (Gen: `173837aa8ec04250b761da4f8beb3130`) - 審查裁決: REOPEN / not approved

### 候選版本 20, 21, 22, 23, 24 (Rounds 20-24)
- Round 20 SHA: `1f78ef37fb064f85e119ce6afec72fed24e38616` (Gen: `77814c61167b4ca18e6907434e83ca58`)
- Round 21 SHA: `533d90855593dc6b13f42f715f17f5fc328ab4c2` (Gen: `4bf56dcd2beb4f37a2db3366cd9839cf`)
- Round 22 SHA: `5d3c6126af2662935c8396a03aa85585bc782cb3` (Gen: `d74bbb26eb684facb1be3caddfb8b860`) - Verdict SHA256: `b05a55f6bdc21eff40a30d31c962cd7ff45f466f612b160f6a2f61199c750ac7`
- Round 23 SHA: `d39b0dee6c77e2ab717586e7a97ebfb14dbb87c0` (Gen: `1b68a4872caf4144bae709f1db942e9b`) - Verdict SHA256: `add562dbc7694b78b67c52076c06d0b2e5e2269be9afc9dc8f304604e529b7ae`
- Round 24 SHA: `ba884ddc2e87395b9d7b9a002754acfb49ae64f6` (Gen: `3565c6102dd04c339b05650020e78e2a`) - Verdict SHA256: `0d3a91261e4425e915da3fed69aa985baef18a01707e30946cf2a512f3485c3d` located at `/home/lupin/workspace/drts-fleet-platform/.local/fleet-storage-diagnosis-20261008/review-owned-cleanup-a6bcfe4acdb8-20261009T144116Z/round-24-ba884ddc2e87/review-verdict.md` (completed command/exit/log manifest in `check-results.json` in that directory).
- 獨立審查裁決: `REOPEN / not approved` (Codex) for all rounds.
- 審查證據清單：`/home/lupin/workspace/drts-fleet-platform/.local/fleet-storage-diagnosis-20261008/complete-cleanup-and-system-acceptance-20261010/authentic-R14-through-R23-review-identities-and-evidence-index.json` 且本文件新增 R24 的資訊。
- 審查發現 (R23-01): v4 PR 來源錯誤 (e07base)，導致發布完整範圍測試失敗，需基於乾淨歷史。
- 審查發現 (R23-02 / R24-02 / R25-01): 舊版 default transport fixture 會觸發 ERROR 而非 FAIL。
- 審查發現 (R24-01 / R22-01): `d39` 已修復 `genuine-loader/327PDF` 的 3PASS/0ERROR，但 R24 regression 再度破壞 inline guard 導致 `2FAIL/1PASS`。此回歸現已修正。
- 審查發現 (R24-03 / R25-02): UAT 缺乏正確的 R24 SHA 與 generation 連結、每個觸發點的指令/退出碼/日誌；舊版與新版的 assertion failure 與 errors 需要明確對照。

### 本次修復對應 (R25)
本分支 (v3) 在 R24 基礎上，針對測試 fixture 與 UAT 證據完整度進行修復。

- 執行 paired 測試驗證指令: `python3 -B /home/lupin/workspace/drts-fleet-platform/.local/fleet-storage-diagnosis-20261008/review-owned-cleanup-a6bcfe4acdb8-20261009T144116Z/round-25-9ffb015ed6aa/paired-candidate-tests.py`
- 舊源代碼 (533d) 測試結果: 59 PASS / 3 FAIL / 0 ERROR (在 fixture 修正後，舊源碼正確產生 FAIL 而非 fixture ERROR)
  - 舊版本 durable log: `533d90855593-candidate-tests.log`
- 舊源代碼 (5d3) 測試結果: 62 PASS / 1 FAIL / 0 ERROR
  - 舊版本 durable log: `5d3c6126af26-candidate-tests.log`
- 舊源代碼 (d39) 測試結果: 63 PASS / 0 FAIL / 0 ERROR
- 舊源代碼 (ba884) 測試結果: 62 PASS / 1 FAIL / 0 ERROR
- 目前修復後之版本測試結果: 63 PASS / 0 FAIL / 0 ERROR，退出碼: 0
  - 目前修復後 durable log: `paired-candidate-tests.log` 與 `check-results.json` 於 R25 審查目錄中。

### 本次修復狀態對應表 (Per-finding Evidence Mapping for R25):
| 發現編號 | 先前狀態 / 舊結果 | 修復邊界 / 證據 (新結果) | 未驗項與具體限制 |
| --- | --- | --- | --- |
| R25-01 | 測試 fixture 在模擬 default transport 時使用 `"ls" in cmd` 匹配，導致 533d 發生 `fixture ERROR` 而無法驗證預期的 `assertion FAIL`。 | 修正 `mock_subprocess_run` 使其精確匹配 `objects describe` 與 `cat` 命令格式，正確提供 JSON 與 bytes 響應。<br/>證據: 533d 如今會觸發真正的 assertion FAIL (OLD assertion FAIL -> NEW PASS, 0 fixture ERROR)。 | 僅限測試 fixture 邊界，保留所有修復好的生產代碼。無真實網路呼叫。 |
| R25-02 | UAT 紀錄缺少對相鄰 R24 版本之完整 SHA/Gen/Verdict 映射，也只列出單一 current pass 片段，未分清 OLD assertion FAIL 和 fixture ERROR。 | 更新 UAT 文件加入 R24 完整憑證，新增各源碼版本 paired-candidate-tests 測試結果，並區分 FAIL 與 ERROR。<br/>證據: 本 UAT 文件的修復歷史與測試日誌映射。 | 需保留完整的歷史與不滿組的 CI 狀態。 |

## 3. 本機驗證日誌與退出碼 (Local Verification Logs & Exit Codes)

執行測試目錄指令:
```bash
python3 -B -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py -v
```
結果 (Exit Code 0)：63 tests run, 0 failures, 0 errors.

新增/修正之 `TestR21Regressions` (包含實際執行的斷言)：
- `test_direct_inspector_loader_token_cannot_authorize_live_read`
- `test_simulation_without_runner_blocks_default_cloud_transport`
- `test_simulation_receipts_always_synthetic`
- `test_inline_body_assertions`
修正 `TestR18Regressions`：
- `test_live_route_blocks_even_with_valid_proof` 補上 DB runner 呼叫次數為零之斷言。

## 4. 三道閘門現況 (Three Gates Status)

| Required acceptance | Exact candidate evidence | Remaining conditions |
| --- | --- | --- |
| `owned_operational_cleanup_actual_planner_boundary_regressions` | **NOT SATISFIED**: 本次已修復 inline common containment、實作完整真實 fixture 測試與 `TestR21Regressions`，並恢復真實追蹤歷史。 | 待後續審查與真實環境驗證。 |
| `owned_operational_cleanup_exact_sha_review_ci_merge` | **NOT SATISFIED**: 舊 SHA 因審查失敗 REOPEN。新 branch/commit 已建立。 | 待新 SHA 完整 CI 通過並保護合併。 |
| `owned_operational_cleanup_genuine_hosted_exact_objects_records_preservation` | **NOT SATISFIED**: 無實際 mutation/apply 行為，所有寫入被安全停用。 | 待授權的隔離 Operator 執行合約開放後完成真實物件刪除。 |
