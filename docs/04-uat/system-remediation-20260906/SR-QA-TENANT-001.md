# SR-QA-TENANT-001 — 租戶驗收進度證據

2026-09-08，owner Codex，reviewer Codex2。狀態：in_progress；尚未 handoff。

## 版本與來源

- fetch 後 base `origin/dev`: `3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e`。
- 本次新增 API 測試實跑 SHA：`10c65c40d`（anchor，已普通 push 至 `codex/sr-qa-tenant-001`）。尚無鎖定 candidate，不能當成 review / CI / merge 完成。
- 執行範圍：[task spec](../../03-runbooks/system-remediation-20260906/SR-QA-TENANT-001.md) 與 [execution rules](../../03-runbooks/system-remediation-execution-tasks-20260906.md)。
- [capabilities](source/capabilities.json)：C006、C008、C009、C025、C027、C028、C102、C109、C111；邀請與通知來源 N06/N07 見 [new gaps](source/new-gaps.json)。歷史 R02 登入問題見 [findings](source/findings.json)，本次不由歷史觀察推定仍然失效。
- `ai-status.sh show` 確認 HARNESS、TENANT-LOGIN、MAIL-001、MAIL-002 均為 done。HARNESS / MAIL-002 記錄明示舊 host 遺失部分 candidate / review / CI 證據，不補造。

## 已執行指令

工作目錄為指定 isolated worktree。以下不是 live 通過證明。

| 指令                                                                                                                                                                                                           | exit | 結果                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run tests/integ/tenant-governance-negative.test.ts tests/unit/system-remediation/sr-mail-001/ tests/unit/system-remediation/sr-mail-002/ tests/unit/system-remediation/sr-tenant-login-001/` | 0    | 7 files / 55 tests passed；既有負向及服務測試，包含替代 transport / 記憶體狀態，不能代替 DB 或信件收件驗收 |
| `pnpm --filter @drts/api typecheck`                                                                                                                                                                            | 0    | API 型別檢查通過                                                                                           |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001`                                                                                                                        | 1    | 1 failed / 4 shared harness passed；缺少 `DRTS_TENANT_UAT_API_URL`，未發 HTTP 寫入                         |
| `pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001/directory.spec.ts --max-warnings=0`                                                                                                            | 0    | task spec lint 通過                                                                                        |
| `git diff --check`                                                                                                                                                                                             | 0    | 無空白錯誤                                                                                                 |

Playwright 的 CLI regex 在含 task ID 的 worktree 絕對路徑亦會匹配 shared harness，所以四個 shared pass 不列為本 task 能力通過。報告位於 ignored `test-results/system-remediation-report.json`；失敗原因是環境缺失，不是已重現產品缺陷。實際資源 ID：無，因為前置檢查在任何寫入前失敗。

## 新增可重跑案例與環境

`tests/e2e/system-remediation/sr-qa-tenant-001/directory.spec.ts` 使用現有 `/api/tenant/passengers`、`/api/tenant/addresses` 契約。正常案例新建乘客、地址指向同一乘客，POST 後 GET 核對值，更新同一 ID 再確認唯一性。負向案例檢查跨租戶 owner 引用、跨租戶乘客覆寫、唯讀寫入與空白必填欄位，並回讀確認資料沒有被失敗請求改寫。

執行前配置以下環境變數；不將 token 寫入此文件或命令記錄：

- `DRTS_TENANT_UAT_API_URL`：測試 API 根 URL，含 `/api`。
- `DRTS_TENANT_UAT_TENANT_A`、`DRTS_TENANT_UAT_TENANT_B`：兩個不同、已配置的可拋棄測試租戶。
- `DRTS_TENANT_UAT_TOKEN_A`、`DRTS_TENANT_UAT_TOKEN_B`：各租戶合法可寫身份 bearer token。
- `DRTS_TENANT_UAT_TOKEN_READONLY`：A 租戶合法唯讀身份 token。

使用上表 Playwright 指令重跑。每次建立 UUID namespace；測試不自動刪除租戶，收集 evidence 後由測試環境 provisioner 銷毀這兩個可拋棄租戶。不要指向日常業務租戶。HTTP evidence 僅記 method、path、status 及資源 ID，不保存 token 或完整個資。API 回讀不能證明重啟後 DB 持久性。

## 待完成能力矩陣

以下皆未完成閉環驗收，不因既有單元測試通過而勾選完成。

| 能力                                | 下一步正常＋負向驗收                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| users / invites（C006/C008）        | 建人、改角色、真正收信啟用後回讀；唯讀拒絕、撤銷/過期/重放 token，確保身份與邀請同 ID |
| passengers / addresses（C027/C009） | 執行新增 API spec；再加預約引用與停用中資源使用政策，DB 重啟回讀                      |
| cost centres（C027）                | 新增更新、與使用者/訂單引用回讀；跨租戶引用、停用中心拒絕                             |
| quota / rules（C028）               | 寫入政策、訂單保留/取消返還、ledger 與 snapshot 一致；不足額度、跨月/時區、重複命令   |
| SLA（C028）                         | 寫入與回讀 cutoff/服務政策；非法時窗與角色拒絕，影響訂單行為                          |
| approvals（C025）                   | 提交→核准/駁回/人工升級；非簽核人與重複決策拒絕，訂單/額度/audit/收信關聯             |
| feature flags（C109）               | 分租戶啟停與回讀/快取失效；越權、其他租戶不可見                                       |
| tenant lifecycle（C102）            | 新增、停用、恢復與 audit 回讀；非法轉移、停用租戶操作拒絕                             |
| integration settings（C111）        | API key 輪替/撤銷/遮罩與使用回讀；失效 key 與超出 scope 拒絕                          |

尚缺可用 URL、合法測試身份與可拋棄租戶配置；沒有使用假 header 或 fixture 代替驗收。瀏覽器登入、真收件、DB 持久性與上述未新增案例仍待執行。沒有已確認的新產品缺陷，因此本次未建立修復子任務；發現後須透過 canonical task command 建立並追溯。

## 2026-09-08 15:52 UTC dispatch 續作

本輪 fetch / rebase exit 0，最新 base 為 `f372e4a6a0dd16204ccbd660f23013601357c224`。rebase 後 merge 原遠端 anchor ancestry（exit 0，無內容衝突），保留既有提交並允許普通 non-force push。新增測試 anchor / 本輪實跑 SHA：`89bec9f4eaba30ac9c9d3d541f75b8a5705b0bc9`；普通 push exit 0。尚未鎖定 candidate 或 handoff。

新增 `tests/e2e/system-remediation/sr-qa-tenant-001/cost-centers.spec.ts`，依目前 tenant-partner controller/service 的成本中心契約，驗證建立與更新後 detail/list 回讀、同 code 唯一性、停用原因與時間及 activeOnly 過濾；跨租戶讀取/停用 404、唯讀更新/停用 403、空白名稱 400 後再次回讀原資料。沿用前述六項環境變數，缺前置即失敗；finally evidence 即使前置失敗仍記錄 SHA 與空 calls/resources。成本中心使用者/訂單引用、配額影響、DB 重啟仍待驗收，不能把新增案例視為 C027 全部完成。

本輪實際指令結果：

| 指令 | exit | 結果 |
| --- | --- | --- |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001` | 1 | 2 task failed / 4 shared passed；兩個 task 均缺 `DRTS_TENANT_UAT_API_URL`，零 HTTP 寫入、零資源 ID |
| `pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001/ --max-warnings=0` | 0 | 兩個 task spec lint 通過 |
| `pnpm exec vitest run tests/integ/tenant-governance-negative.test.ts tests/unit/system-remediation/sr-mail-001/ tests/unit/system-remediation/sr-mail-002/ tests/unit/system-remediation/sr-tenant-login-001/` | 0 | 7 files / 55 tests passed；本輪重新執行，仍非 live/DB/mail 證據 |
| `git diff --check` | 0 | 無空白錯誤 |

API typecheck 是前輪結果，本輪未重跑。最新 dev 的 SR-READINESS-001 報告亦明列真實 HTTP、DB tenant provision、收信等尚未執行，未提供本 task 的可用身份。仍需 provisioner 提供可拋棄 A/B 租戶、API URL 與合法可寫/唯讀 bearer；其餘矩陣的案例仍待補齊。維持 in_progress，不交接不完整驗收。

## 2026-09-08 本次 dispatch：approval rules API 案例

最新 fetch / rebase base：`3fb9b06461dc2bf92043144974eedbbc9f69d0f3`，exit 0。rebase 後 merge 原遠端 anchor ancestry，無內容衝突，普通 push exit 0。實跑測試 anchor SHA：`d76e0f1300e8551eb7c2f7390514a5433d0b3f99`；尚無鎖定 candidate。

新增 `approval-rules.spec.ts`，追溯 C028 與目前 tenant-partner controller/service、contracts 的 approval rule 契約：建立 inactive 規則、PUT 同 ID 更新、GET detail/list 回讀唯一性；跨租戶讀取/停用 404、唯讀更新/停用 403、空白名稱 400 後回讀不變；停用後確認時間及 activeOnly 過濾。使用已列出的六項環境變數，不建立假身份。規則啟用→停用轉移、evaluation、訂單/簽核人關聯、reorder、quota/SLA 與 DB 重啟仍待測；此新增案例不代表 C028 通過。

| 實際指令 | exit | 結果 |
| --- | --- | --- |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001` | 1 | 3 task failed / 4 shared passed；三個 task 均缺 DRTS_TENANT_UAT_API_URL |
| `pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001/ --max-warnings=0` | 0 | 三個 spec lint 通過 |
| `git diff --check` | 0 | 無空白錯誤 |

本輪資源 ID：無；HTTP calls：0；live/DB/mail/瀏覽器驗收未完成。shared pass 不算本 task 通過，前輪 55 unit tests 與 API typecheck 本輪未重跑。需要 provisioner 提供 API URL、可拋棄 A/B 租戶與各租戶可寫及 A 唯讀合法 bearer。其餘矩陣仍需補案例並實跑；維持 in_progress，未 handoff。

## 2026-09-08 dispatch：缺前置時的目錄 evidence

本輪 base `origin/dev`：`c07d24e021aea847a988646427cdc534ccf4e496`。rebase 遇到舊證據 add/add 衝突，保留主線已包含較完整歷史的版本後 continue 成功；再 merge 原遠端 branch ancestry，exit 0，task 檔案與原遠端內容一致，未回退既有修復。

修正 `directory.spec.ts`：將全部環境檢查移入 try/finally，且在建立 client 前驗證完整身份設定。因此缺 URL 時也會附上 SHA、空 calls/resources；不再於 evidence 邊界外失敗。實跑 anchor：`73f21e9aae5298d17cea68e0509b679d122b75e1`，普通 push exit 0。尚無鎖定 candidate。

| 實際指令 | exit | 結果 |
| --- | --- | --- |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001` | 1 | 3 task failed，均缺 DRTS_TENANT_UAT_API_URL；4 shared passed 不列為租戶驗收 |
| `pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001/ --max-warnings=0` | 0 | 三個 spec lint 通過 |
| `git diff --check` | 0 | 無空白錯誤 |

讀取 `test-results/system-remediation-report.json` 中三個 `tenant-*-evidence` 附件，確認每個附件的 baseSha/testedSha 均為上述 SHA，HTTP calls 與 resources 均為 0；新增的目錄前置失敗 evidence 已實際產出。此為測試診斷修復，並非產品缺陷或 live 通過。環境中沒有 DRTS_TENANT_UAT 變數；readiness 文件仍未提供 provisioned 身份。其餘能力矩陣、live HTTP/DB/mail/瀏覽器驗收仍待完成，需 provisioner 提供前述六項設定；維持 in_progress，不 handoff。

## 2026-09-08 dispatch：SLA profile API 案例

本輪 fetch 後 base：`f2727a88e086d9b057324f0e6ce1de0aa11c3ce0`。rebase 的重複歷史 evidence 衝突核對後保留較完整版本，continue exit 0；merge 原遠端 ancestry exit 0，合併後 task 既有檔案與遠端內容一致。新增 SLA 測試 anchor／實跑 SHA：`5f25410a7f313ffca2d9b8650490b73058692d74`，普通 push exit 0；尚無鎖定 candidate。

新增 `tests/e2e/system-remediation/sr-qa-tenant-001/sla.spec.ts`，追溯 C028、`phase1_service_contracts_v1.md` §3.2、目前 contracts 的 `UpdateTenantSlaProfileCommand` 及 tenant-partner controller/service/auth policy。正常案例 POST 三項門檻後，以 receipt 的 tenant resource ID 對照 GET profile 與 view；再部分更新 wait 門檻，回讀確認 arrival/completion 保留。負向案例驗唯讀 POST profile/recalculate 403、空白重算理由 400，回讀設定與 lastRecalculationAt 不變；B 租戶設定前後相同。使用既有六項 provisioner 配置與可拋棄租戶，未使用 fixture 或假身份。

| 實際指令 | exit | 結果 |
| --- | --- | --- |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001` | 1 | 4 task failed，均缺 DRTS_TENANT_UAT_API_URL；4 shared passed 不列為本 task 通過 |
| `pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001/ --max-warnings=0` | 0 | 四個 spec lint 通過 |
| `git diff --check` | 0 | 無空白錯誤 |

讀取 `test-results/system-remediation-report.json` 四個 tenant evidence 附件，逐一確認 baseSha/testedSha 為上述版本，calls/resources 皆空；本輪零 HTTP 呼叫、無實際資源 ID。环境未配置任何 DRTS_TENANT_UAT 變數。SLA 非法門檻、訂單重算實際效果、audit/收信及 DB 重啟仍待驗，不能因 receipt 或 profile readback 案例已建立便宣稱能力完成。其他待完成矩陣維持；unit/API typecheck 本輪未重跑。仍需 provisioner 提供 API URL、可拋棄 A/B 租戶及 A/B 可寫和 A 唯讀 bearer；維持 in_progress，未 handoff。

## 2026-09-08 dispatch：重新確認環境阻礙

fetch 後 base：`5cff9b36082998a0295f2550039306dc1f84c3d2`。rebase 重複歷史提交的衝突經核對，保留已修正 directory preflight 與較完整歷史 evidence，continue 成功；merge 原遠端 ancestry exit 0。以 `git diff --exit-code origin/codex/sr-qa-tenant-001 -- tests/e2e/system-remediation/sr-qa-tenant-001 docs/04-uat/system-remediation-20260906/SR-QA-TENANT-001.md` 確認既有 task 內容一致（exit 0）。本輪實跑 SHA：`c67d8b1d12068171afe899c9816933111382bf26`，尚無鎖定 candidate。

| 實際指令 | exit | 結果 |
| --- | --- | --- |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001` | 1 | 4 task failed，皆缺 DRTS_TENANT_UAT_API_URL；4 shared passed 不算租戶驗收 |
| `pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001/ --max-warnings=0` | 0 | 四個 spec 通過 |
| `git diff --check` | 0 | 無空白錯誤 |

實際讀取 JSON report 的四個 tenant evidence 附件，baseSha/testedSha 均與上述相符，calls/resources 均空。環境變數名稱檢查未發現任何 DRTS_TENANT_UAT 設定；未輸出任何憑證。本輪零 HTTP 呼叫，無資源 ID，未驗 live、DB、mail 或瀏覽器，也未重跑 unit/typecheck。

重複 dispatch 未解除環境阻礙，請 supervisor/provisioner 配置既述六項設定（API URL、可拋棄 A/B 租戶、A/B 可寫 bearer、A 唯讀 bearer）後再執行。待完成能力矩陣及未補齊案例仍保留，不宣稱已完成實作或驗收；本輪將環境阻礙寫入 canonical blocker，不 handoff。

## 2026-09-08 dispatch：unblock merge 未解除 provisioning 阻礙

本輪 base `c171ea5126c1a7c19fa090429b2965bbac106768`；實跑 SHA `91d5880deddbc55a9c4cde1d20ebf15a8738b568`，尚無 handoff candidate。fetch / rebase / merge 原遠端 ancestry 均完成；rebase 重複歷史衝突保留原 branch 最新 task 內容。`git diff --exit-code bee34ad80 -- tests/e2e/system-remediation/sr-qa-tenant-001 docs/04-uat/system-remediation-20260906/SR-QA-TENANT-001.md` 在新增本段前 exit 0。

已讀 `support/unblock/SR-QA-TENANT-001/SR-QA-TENANT-001-UNBLOCK-MANUAL-UNBLOCK.md`：該 helper 明確要求 parent 保持 blocked / waiting_for Gemini，且說明 merge 的預設 todo 不能視為 provisioning 完成。本輪 worker 仍沒有任何 DRTS_TENANT_UAT 環境變數（僅檢查名稱，未輸出憑證）。

| 實際指令 | exit | 結果 |
| --- | --- | --- |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001` | 1 | 4 task failed，全部缺 DRTS_TENANT_UAT_API_URL；4 shared passed 不算租戶驗收 |
| `pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001/ --max-warnings=0` | 0 | 四個 spec lint 通過 |
| `git diff --check` | 0 | 無空白錯誤 |

逐一解碼 report 中四個 tenant evidence 附件，確認 baseSha/testedSha 為上述版本，calls/resources 均為空；無實際資源 ID。未執行 live HTTP、DB、mail 或瀏覽器验收；未重跑 unit/typecheck。既有未完成矩陣仍待補齊，不 handoff。請 Gemini/provisioner 注入六項既述設定並提供環境來源及有效期／更新方式，負責可拋棄租戶 teardown，再恢復派工。此為環境阻礙，未重現新產品缺陷。
