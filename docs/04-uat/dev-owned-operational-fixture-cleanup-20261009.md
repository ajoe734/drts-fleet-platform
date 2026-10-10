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

### 候選版本 20, 21, 22, 23, 24, 25, 26 (Rounds 20-26)
- Round 20 SHA: `1f78ef37fb064f85e119ce6afec72fed24e38616` (Gen: `77814c61167b4ca18e6907434e83ca58`)
- Round 21 SHA: `533d90855593dc6b13f42f715f17f5fc328ab4c2` (Gen: `4bf56dcd2beb4f37a2db3366cd9839cf`)
- Round 22 SHA: `5d3c6126af2662935c8396a03aa85585bc782cb3` (Gen: `d74bbb26eb684facb1be3caddfb8b860`) - Verdict SHA256: `b05a55f6bdc21eff40a30d31c962cd7ff45f466f612b160f6a2f61199c750ac7`
- Round 23 SHA: `d39b0dee6c77e2ab717586e7a97ebfb14dbb87c0` (Gen: `1b68a4872caf4144bae709f1db942e9b`) - Verdict SHA256: `add562dbc7694b78b67c52076c06d0b2e5e2269be9afc9dc8f304604e529b7ae`
- Round 24 SHA: `ba884ddc2e87395b9d7b9a002754acfb49ae64f6` (Gen: `3565c6102dd04c339b05650020e78e2a`) - Verdict SHA256: `0d3a91261e4425e915da3fed69aa985baef18a01707e30946cf2a512f3485c3d` located at `/home/lupin/workspace/drts-fleet-platform/.local/fleet-storage-diagnosis-20261008/review-owned-cleanup-a6bcfe4acdb8-20261009T144116Z/round-24-ba884ddc2e87/review-verdict.md` (completed command/exit/log manifest in `check-results.json` in that directory).
- Round 25 SHA: `9ffb015ed6aa47ec8e18aea84e3013de8d9a7fa7` (Gen: `90505c23a3d94e958779bedc2ceabf4a`) - Verdict SHA256: `22b40c8a44117cfded174807e4e653b0b6e2b9fe2b864933ad87ca73ca78e3c8` located at `/home/lupin/workspace/drts-fleet-platform/.local/fleet-storage-diagnosis-20261008/review-owned-cleanup-a6bcfe4acdb8-20261009T144116Z/round-25-9ffb015ed6aa/review-verdict.md` (completed command/exit/log manifest in `check-results.json` in that directory).
- Round 26 SHA: `fde3e74b9d585e69ea704d4ddb2b4c1187070d9b` (Gen: `f4ba8b3396674ce69ed22d5984677d40`)
- 獨立審查裁決: `REOPEN / not approved` (Codex) for all rounds.
- 審查證據清單：`/home/lupin/workspace/drts-fleet-platform/.local/fleet-storage-diagnosis-20261008/complete-cleanup-and-system-acceptance-20261010/authentic-R14-through-R25-review-identities-and-completed-evidence-index.json` 且本文件新增 R24, R25 與 R26 的資訊。
- 審查發現 (R23-01): v4 PR 來源錯誤 (e07base)，導致發布完整範圍測試失敗，需基於乾淨歷史。
- 審查發現 (R23-02 / R24-02 / R25-01): 舊版 default transport fixture 會觸發 ERROR 而非 FAIL。
- 審查發現 (R24-01 / R22-01): `d39` 已修復 `genuine-loader/327PDF` 的 3PASS/0ERROR，但 R24 regression 再度破壞 inline guard 導致 `2FAIL/1PASS`。此回歸現已修正。
- 審查發現 (R24-03 / R25-02 / R26-01): UAT 缺乏正確的 R24/R25/R26 SHA 與 generation 連結、每個觸發點的指令/退出碼/日誌；舊版與新版的 assertion failure 與 errors 需要明確對照。

### 本次修復對應 (R26)
本分支 (v3) 修正了 UAT 證據中的測試紀錄版本對應，正確引用 R26 的探測命令與日誌，並修正了不正確的測試紀錄計數 (59 PASS / 4 FAIL / 0 ERROR 而非先前 UAT 所述的 3 FAIL)。目前生產與所有有意義的測試 fixture `fde3e74b9d58` 確認已完全修復 (63 PASS / 0 ERROR)。

- 執行 R26 paired 測試驗證指令 (R26 probe)，必須在鎖定的 `fde3e74b9d58` cwd 下執行：
  ```bash
  cd /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/review/codex-sr-dev-exact-owned-operational-fixture-cleanup-20261009-fde3e74b9d58
  python3 -B /home/lupin/workspace/drts-fleet-platform/.local/fleet-storage-diagnosis-20261008/review-owned-cleanup-a6bcfe4acdb8-20261009T144116Z/round-26-fde3e74b9d58/paired-candidate-tests.py
  ```
  - 環境: Python 3.12.3
  - 預期歷史腳本退出碼: `1` (BEFORE any test)
- 本次不再提供假想的 self SHA 或執行新源碼來驗證舊版本，而是直接參照不可變的 R26 review 證據目錄 `/home/lupin/workspace/drts-fleet-platform/.local/fleet-storage-diagnosis-20261008/review-owned-cleanup-a6bcfe4acdb8-20261009T144116Z/round-26-fde3e74b9d58/` 下的：
  - `paired-candidate-tests-summary.json`
  - `paired-candidate-tests.log`
  - `533d90855593-candidate-tests.log`
  - `check-results.json`
  - `source-hashes.json`
  - `remaining-boundary-summary.json`
  - `inline-body-summary.json`
- 舊源代碼 (533d) 實際歷史測試結果: 59 PASS / 4 FAIL / 0 ERROR。

### 本次修復狀態對應表 (Per-finding Evidence Mapping for R26):
| 發現編號 | 先前狀態 / 舊結果 | 修復邊界 / 證據 (新結果) | 未驗項與具體限制 |
| --- | --- | --- | --- |
| R25-01 | 測試 fixture 在模擬 default transport 時使用 `"ls" in cmd` 匹配，導致 533d 發生 `fixture ERROR` 而無法驗證預期的 `assertion FAIL`。 | 修正 `mock_subprocess_run` 使其精確匹配 `objects describe` 與 `cat` 命令格式，正確提供 JSON 與 bytes 響應。<br/>證據: 533d 如今會觸發真正的 assertion FAIL (OLD assertion FAIL -> NEW PASS, 0 fixture ERROR)。 | 僅限測試 fixture 邊界，保留所有修復好的生產代碼。無真實網路呼叫。 |
| R26-01 | UAT 紀錄引用了舊版 R25 的腳本與日誌，未正確記錄 533d 的 `4 FAIL` 與實際觸發退出碼 `1`。缺少 R25/R26 完整 SHA 連結。 | 更新 UAT 文件，加入 R25 完整憑證，精確使用 R26 鎖定 cwd 執行 repro command，正確記錄 533d `59 PASS / 4 FAIL / 0 ERROR` 與預期腳本退出碼 `1`。<br/>證據: 依照 R26 `check-results.json` 等日誌檔案更新。 | 需保留完整的歷史與不滿組的 CI 狀態。無 source 或 test code 變更，僅更新文檔。 |

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
