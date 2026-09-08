# SR-READINESS-001 交付與驗證

Owner: Codex；獨立 reviewer: Codex2。

本交付是唯讀準備報告，交付 [readiness.json](readiness.json)、[current-state.md](current-state.md) 及 task-scoped 可重跑驗證。44 issue 逐項定位目前 source blob / 任務 / 重現需求；134 能力逐項保留來源角色與資料需求。9 個 SR-LIVE gate 與 UV 語音外部條件仍 missing。

Base / tested product SHA：`c4c4a35f88907df6bf68e781059dde397c06ba03`。
實際執行回歸時的 worker HEAD：`b7ad97e12`（base 加既有 readiness anchor，業務碼與 base 相同）。
歷史 9/6 audit SHA：`08b7a32f6fdaa00d8d1894f91569a7d72860cec2`，不作為目前程式真值。
最終 candidate SHA 由 commit 後 `CANDIDATE_SHA=$(git rev-parse HEAD)` handoff 綁定，請使用 canonical `ai-status.sh show SR-READINESS-001` 的 candidate 讀回；JSON 的 candidate_sha null 刻意避免嵌入自指或過期 hash。

實際命令與結果（2026-09-08 UTC）：

```bash
git fetch origin
# exit 0
git rebase origin/dev
# exit 0; base c4c4a35f88907df6bf68e781059dde397c06ba03
pnpm exec vitest run tests/unit/system-remediation/sr-admin-verify-001/ tests/unit/system-remediation/sr-artifact-001/ tests/unit/system-remediation/sr-bank-001/ tests/unit/system-remediation/sr-bank-003/ tests/unit/system-remediation/sr-channel-001/ tests/unit/system-remediation/sr-iam-001/ tests/unit/system-remediation/sr-invoice-001/ tests/unit/system-remediation/sr-mail-001/ tests/unit/system-remediation/sr-mail-002/ tests/unit/system-remediation/sr-ops-map-001/ tests/unit/system-remediation/sr-referral-001/ tests/unit/system-remediation/sr-tenant-login-001/ tests/unit/system-remediation/sr-uat-harness-001/ --reporter=json --outputFile=/tmp/sr-readiness-regressions.json
# exit 0; 212 passed, 0 failed, 0 skipped
python3 tests/unit/system-remediation/sr-readiness-001/collect.py --report /tmp/sr-readiness-regressions.json --base c4c4a35f88907df6bf68e781059dde397c06ba03
# exit 0; 44 issue / 134 capability inventory written; 212 local tests; all live gates missing
python3 -m unittest discover -s tests/unit/system-remediation/sr-readiness-001 -p 'test_*.py' -v
# exit 0; 3 tests passed
```

readiness.json 保存 Vitest 的所有 suite/assertion 名稱、結果與原始報告 SHA-256 `c4ffc05e851c971d48c56be3a85f20f601b0e16b1051e04417ba237023214d8c`；/tmp 路徑僅為重跑輸出，持久證據在已提交 JSON。重跑須先對目標 SHA 執行所列 Vitest 命令，再 collect；不可把舊報告冒充新 SHA。collector 拒絕基準之外的業務碼差異。

新增驗證檢查來源集合、44/134 覆蓋、所有 issue 的 base blob、merge ancestry、逐 gate 缺項與角色資料需求；另驗證 failed/pending/empty suite 不能變成 pass。它只驗盤點完整性，不替代產品 integration/live 驗收。相關產品回歸沿用現有 Vitest suites，沒有改業務碼、fixture、共用設定或 lockfile。

未執行：正式網址 HTTP/IAP 登入、provider console/API、DB tenant provision、寄信、push、付款、真簽章/儲存讀回、地圖計费請求、CTI/PSTN、Android/iOS 真機、備份還原及容量測試。資源 ID 缺少均用空陣列或 null 明列，不代表組織無此資源。缺少的 owner 與讀回方式在 current-state.md / readiness.json。

既有遠端 anchor 在 rebase 後造成普通 push non-fast-forward；已 merge 原遠端 anchor ancestry，兩個 add/add 衝突保留本次新版 readiness 與 collector，再普通 push 成功（`d76bf2056..1ee7af715`），未 force push。

owner 先 commit、普通 push，再 handoff Codex2；本文件不宣告 done / 已部署 / live acceptance。

最後格式與差異檢查：

```bash
pnpm exec prettier --write docs/04-uat/system-remediation-20260906/readiness.json docs/04-uat/system-remediation-20260906/current-state.md docs/04-uat/system-remediation-20260906/SR-READINESS-001.md
# exit 0
 git diff --check
# exit 0
```
