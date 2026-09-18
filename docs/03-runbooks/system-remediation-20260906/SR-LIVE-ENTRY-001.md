# SR-LIVE-ENTRY-001 — 公開入口和正式角色登入驗收

| 欄位                                         | 內容                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 初始狀態                                     | blocked                                                                                              |
| 優先級                                       | P1                                                                                                   |
| Owner / Reviewer（可由 supervisor 合法調派） | Codex / Codex2                                                                                       |
| 前置任務                                     | SR-READINESS-001, SR-PUBLIC-001, SR-TENANT-LOGIN-001, SR-IAM-001, SR-UAT-HARNESS-001, SR-RELEASE-001 |
| 問題來源                                     | 134能力盤點的驗收缺口                                                                                |
| 能力來源                                     | C001, C003                                                                                           |
| 工作類型                                     | verification                                                                                         |

## Execution prompt

先讀 execution_ref 中本 task 及追溯來源；從目前 origin/dev 記 base SHA並重現。9/6 audit SHA 是歷史觀察而非當前程式真值；已由其他任務修復時提交目前 SHA 的回歸證據，不重做或回退。只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫。沿用權威 API／資料模型，不以 fixture、固定百分比、假簽章或假送達代替完成。 按最小repair執行已授權dev域名/服務設定，正式SSO/MFA以合法身份重走，不擴scope或手工注入身份。 此任務先建立可重跑驗收並如實驗證；若發現產品缺陷，以 canonical task command 建立具來源的修復子任務，不在本驗收範圍偷偷改業務碼或只寫待辦就稱閉環通過。

先讀 [主執行規則](../system-remediation-execution-tasks-20260906.md)。不得直接修改 `ai-status.json`；使用當前 supervisor release 的 task-board commands。

## 可寫入範圍

- `tests/unit/system-remediation/sr-live-entry-001/`
- 待建立：docs/04-uat/system-remediation-20260906/SR-LIVE-ENTRY-001.md
- `tests/e2e/system-remediation/sr-live-entry-001/`

清單內尚不存在的 module／leaf 檔是新增目標；實際 repo 路徑變動由 supervisor 更新 reviewed scope。Migration 使用 SR-CONTRACT 分配的專屬檔名。沒有列出的共用檔不得順手修改。

## 驗收條件

- 每項required_acceptance都是真實可取回證據並綁候選SHA，mock/readiness文件不等於live。
- 取得明確測試資源/授權才執行依賴操作；缺項留blocked/acceptance並指責任人，不反覆啟worker假驗收。
- 證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功。
- 先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案。

## 檢查指令

```bash
git diff --check
pnpm exec playwright test -c playwright.system-remediation.config.ts sr-live-entry-001
```

- 新增上述task目錄的 .spec.ts；live測試必須缺證據即nonzero，不可skip後pass。
- 先選出受影響 package 的現有 test/typecheck 指令；新增 meaningful regression 與必要 integration，不跑無關全庫測試。
- 完整命令與exit code寫入 task evidence；不能只記「tests pass」。

## 整合与結案

測試依 task ID 獨立檔案；不得平行修改中央 test config、lockfile、shared exports、全域 routes。

此任務在獨立worktree執行。根節點不需要等整波；相依task必須是canonical done並含正確merge證據。若issue當前已修，保留回歸與來源證據，不重造功能。

## 外部 gate（預設 blocked）

缺真實可取回的 authorized_environment_change, public_dns_tls_readback, legitimate_role_accounts, live_candidate_sha；先完成已授權唯讀準備，未取得前不執行依賴的外部操作。

- `authorized_environment_change`：須填真實可取回的證據，不可填準備報告或任意非空字串。
- `public_dns_tls_readback`：須填真實可取回的證據，不可填準備報告或任意非空字串。
- `legitimate_role_accounts`：須填真實可取回的證據，不可填準備報告或任意非空字串。
- `live_candidate_sha`：須填真實可取回的證據，不可填準備報告或任意非空字串。

只有 supervisor 確認前提已有真證據後才可 resume；不得自行用 timeout 當授權。

## 追溯來源

- [原30問題](../../04-uat/system-remediation-20260906/source/findings.json)
- [新增14工作卡](../../04-uat/system-remediation-20260906/source/new-gaps.json)
- [134能力](../../04-uat/system-remediation-20260906/source/capabilities.json)
