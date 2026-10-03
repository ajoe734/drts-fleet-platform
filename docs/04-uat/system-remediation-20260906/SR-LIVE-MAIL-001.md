# SR-LIVE-MAIL-001 — 邀請與簽核真郵件驗收

- 現任 Owner / Reviewer：**Codex / Claude2**（2026-10-02T02:08:52Z reassignment）。
- 現況：第二次 hosted run 的 bootstrap 已成功，但 runner 殘留 Gmail-only gate 失敗。本輪移除最後一處網域限制並共用 TS alias validator，補 bootstrap→runner→Python observer 串接回歸及 deploy-dev 重疊拒絕檢查；**152 TS＋25 Python tests 通過**。真郵件回執／內容仍待 Supervisor 合併、部署並避開 deploy-dev 後重跑。
- **§0.5 是最新修正與檢查結果**；§0–§0.4 保留先前全部 finding、候選與限制，§1–§6 保留前任歷史觀察。本輪沒有寄真郵件、讀 secret payload、部署、呼叫 `done` 或 `record-acceptance`。

## 0.5 F13 續修／F15：完整網域 gate 與部署重疊（2026-10-03）

依 Supervisor `2026-10-03T13:45Z` integration note 續作。F13 是前輪漏修的同一非 Gmail sender 觸發情境，沒有改名消除歷史；前輪獨立 review 是 approve，這是第二次 hosted failure，不冒稱兩輪獨立 reviewer reopen。沿用 C006／N06、C026／N07 的正式邀請與簽核流程；C079 依原授權不涵蓋。

### 原候選、定位與版本

- 原候選 `c6019428aff9ecdf5684edfe1840d6c438d1be61`／[PR #2299](https://github.com/ajoe734/drts-fleet-platform/pull/2299) 已合併且同 SHA CI 結束。本輪 fetch 的 base 是 `origin/dev=4b9531acaa5f45c077fea65bb71c35182f35f117`；以普通 merge `eea9fd1340417f72f924eba266752dfc14c540ed` 同步，無衝突、無 rebase/reset/force push。merge 後 task 原始碼与該 base 相同，後續 authored diff 僅在授權 scope；`ci-integ.yml` 沒有本輪修改。
- [hosted run 37126280484](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37126280484)，attempt **1**，checkout／deployed candidate `98352db89e6ac7b2d734f03d74b3bee234158274`，workflow source `bc85c54cf080a5906721912e4c009f4bf5c11239`。已實際下載 artifact **11274747911**（`live-mail-acceptance-98352db89e6ac7b2d734f03d74b3bee234158274-37126280484-1`）。install／preflight／resources／sessions／teardown success，runner failure；`evidence-mail.json.errors[0]` 明確指出 dedicated Gmail sender invite alias gate。沒有郵件送達證據。
- 同 artifact provider metadata：revision **drts-dev-api-00046-8ll**，candidate `98352db8…`、alias freshness true。只能證明當次配置與版本，不是 receipt／IMAP arrival，也不是新候選 acceptance。
- 精確呼叫路徑：workflow `session-bootstrap.ts` → `bootstrapMailSession`／`deriveAliasRecipient` export → runner `validateMailRunnerInputs`（原 line 77 的 `+invite@gmail.com` regex）→ `runMailAcceptance` → `observeInvitationMailbox`／`observeMailbox` → Python `main`／`derive_alias_recipient`／`observe`／`inspect_message`。前輪測試分別驗 bootstrap／observer，沒有讓其 exports 經過 runner gate，因此漏修。
- 全 harness 與 workflow 搜尋 `gmail|domain|alias|fixture|demo|example`：收件網域限制只餘上述 runner regex；`imap.gmail.com:993`、`[Gmail]/All Mail` 是使用者指定 Gmail／Workspace provider 的 TLS endpoint／folder，保留。`live-profiles.ts: observeApproval` 的 `+invite@` → `+approve@` 轉換與同租戶 approver 比對沒有 Gmail domain 假設。

### 逐項修復與驗證

| Finding／驗收項 | 正式依據與修改位置 | 舊版重現 → 修正版結果 | 命令、版本與證據 | 未驗與限制／責任 |
| --- | --- | --- | --- | --- |
| F13 續：bootstrap 接受 Workspace，runner 隨後拒絕 | runner `validateMailRunnerInputs` 改用 bootstrap 的 `deriveAliasRecipient`，要求最後 tag 為 `+invite`；兩流程仍只准 invite／approve | 同串接測試舊程式 **2 failed／1 passed**：兩種 Workspace 地址卡在 runner，Gmail 控制組通過；修後 **3 passed**，兩 aliases 均進真 Python main 與 MIME parser | 重現 anchor `9018858fa3ff8f9cd0133ab5bafe54df38188311`；修正 anchor `399b9157fb187e2530616d705b9023b90571642b`；`pipeline-before.log`／`pipeline-after.log` | HTTP／IAM／secrets／IMAP 邊界 mock；没有對 unit 地址發信，不能當 live receipt |
| F13 邊界：放寬 domain 不得允許 placeholder／額外 tag | TS `deriveAliasRecipient` 與 Python `derive_alias_recipient` 一致拒絕 fixture/demo/example domain words、`.invalid/.test/.localhost`；沿用 DNS label、local-part、長度／注入拒絕 | Workspace 大小寫 domain、子網域、apostrophe／既有 plus local-part 正向；runner wrong tag／無 tag／placeholder／malformed 拒絕，TS＋Python 均測兩流程 reserved domain | `mail-acceptance-runner.test.ts`、`session-bootstrap.test.ts`、`test_mailbox_observer.py`；全套 **152 TS＋25 Python pass** | SMTP allowlist 仍是正式送信權威；domain 支援不增加收件授權。unit 正向地址改為非 reserved synthetic domain，只用 mock |
| F14 與 F01–F12 回歸 | 原 stage／safe error class、identity／tenant／proof／SHA、receipt、allowlist failure、lifecycle／expiry／retry gates | 既有回歸全部通過；串接測試仍要求 partial profile 回 failed，沒有將缺少的 live profiles 設 true | 同下表完整 scoped suite；production proof policy／API serializer 仍直接引用 | 原未驗項全部保留，不把單元成功當成 acceptance |
| F15：與 deploy-dev 同 actor 登入使既有 session 失效 | Supervisor note：mail token `13:29:12` 覆蓋 deploy token `13:28:46`，後者 `13:30:47/58` 回 401。產品責任另由 `SR-AUTH-SESSION-SUPERSEDE-20261003` 追蹤；本任務只改 workflow／guard | 新 `deployment-guard.py` 查所有 active／scheduled 狀態及所有 pages；cloud auth 前與 mint session 前各查一次，缺權限／壞回應 fail closed；gate-evidence 要求兩步成功 | **6 guard tests pass**；真 GitHub read-only probe 對 [deploy run 37126736140](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37126736140)（source `4b9531ac…`，in_progress）實際 exit **1（預期拒絕）**；未 mint session | 是 point-in-time guard，**不是跨 workflow 原子鎖**；Supervisor/operator 必須等部署整個 run 結束，再 dispatch mail，直到 mail teardown 完成不得啟動新的 deploy-dev。沒有越 scope 改 deploy-dev／產品 session |
| `authorized_test_mailbox` | 既有 user option A 的 dedicated sender +invite／+approve，bootstrap 從授權 secret 衍生 | 授權沿用；修正 domain gate，不改 recipient allowlist | 上述第二次 run bootstrap success，單元 alias／注入拒絕回歸 | 新候選真 IMAP UID／內容 hash 仍待 Supervisor hosted run；沒有重問授權 |
| `configured_mail_provider` | artifact 11274747911 的 evidence-provider.json | 舊 live source 的 resources success；本輪未讀 secrets | source／revision 如上 | 新候選部署後需重新取回 provider metadata；未 record-acceptance |
| `provider_message_receipts` | 第二次 run 在 runner input validation 失敗，無 provider receipt | **仍無真 receipt／inbox arrival**；mock 不計 | evidence-mail.json 與 run-status.json | 仍需兩流程 mail、真24h expiry、operator approval request 與真 queued retryable delivery；Supervisor/operator＋Codex |
| `live_candidate_sha` | 舊 run health／checkout 為 `98352db8…` | 只證明舊 deployed SHA；本輪最終候選依 canonical handoff／新 PR head | base、重現／修正 anchors 已普通 push；最終 candidate 另由 handoff 鎖定 | 同候選 review／CI／merge 後 Supervisor 部署、正常 promotion/dispatch；本輪不部署、不 done |

### 已結束的檢查

本機 log 根目錄為 `.local/sr-live-mail-001/domain-gates-20261003/`。完整檢查版本 **f4122c233df5e8f4b1c6b83fd9dda568bc15463e**，後續只有 test formatting 與本 evidence 更新；不把 checkpoint 當正式候選。最終 SHA、PR 與 hosted CI 結論由本輪 canonical handoff 記錄。第一次 prettier check exit 1（新增的 TS test formatting），已修正並以相同命令重跑 exit 0。

| 命令 | Exit／結果 | 證據 |
| --- | --- | --- |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/mailbox-pipeline.test.ts`（原 gate／修後） | **1 → 0**；2 failed＋1 passed → 3 passed | pipeline-before.log／pipeline-after.log；Gmail 控制組也呼叫真正 Python observer |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/` | **0**；7 files／**152 tests passed**，Vitest 4.1.4 | vitest.log |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/unit/system-remediation/sr-live-mail-001 -p 'test_*.py' -v` | **0**；**25 tests passed** | python.log |
| `pnpm exec tsc --noEmit -p tests/e2e/system-remediation/sr-live-mail-001/tsconfig.live.json` | **0** | typecheck.log |
| `pnpm exec eslint --max-warnings=0 tests/e2e/system-remediation/sr-live-mail-001/ tests/unit/system-remediation/sr-live-mail-001/` | **0** | lint.log |
| `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/check_test_coverage.py` | **0**；83 tracked test files 可被 CI 收集 | terminal；新增 guard tests 沿用現有 CI discover step，无 ci-integ.yml 改動 |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tools/ci/test_check_test_coverage.py tools/ci/test_workflow_timeouts.py -v` | **0**；11 tests passed | terminal |
| `pnpm exec prettier --check .github/workflows/live-mail-acceptance.yml 'tests/e2e/system-remediation/sr-live-mail-001/*.ts' 'tests/unit/system-remediation/sr-live-mail-001/*.ts'`；`git diff --check` | **0** | prettier.log／terminal |
| `GITHUB_REPOSITORY=ajoe734/drts-fleet-platform PYTHONDONTWRITEBYTECODE=1 python3 tests/e2e/system-remediation/sr-live-mail-001/deployment-guard.py` | **1（預期拒絕）**；真 active deployment，不是 API／credentials failure | deployment-guard-live.log；run37126736140 如上 |
| Playwright／SMTP／IMAP live／Cloud Run 部署 | **未執行** | VM 限制與 Supervisor redeploy/redispatch 分工；本輪只執行 unit 子程序與唯讀 GitHub probe |

四項 required_acceptance 尚未完備，§0.1 的 approval／真24h expiry／automatic retry 條件全部保留。Operator 必須從已包含 guard 的 workflow ref dispatch，使用部署的 immutable candidate SHA；舊 main workflow 不會執行新增 step。按原正常 promotion 路徑發布後，先確認 deploy-dev 全 run 已結束，再執行 mail acceptance；保留至 session teardown 結束的部署空窗。

## 0.4 F13／F14：首次 hosted bootstrap 退修（2026-10-03）

依 Supervisor `2026-10-03T10:55Z` 完整 integration note 續修，沿用原 owner／reviewer。本次是新的 hosted failure 定位，不冒稱兩輪 reviewer 已退回相同缺陷。

### 版本與可取回的失敗證據

- 前候選 `9f9873199fc31e00b78166baa8b1d023d3e7d3ad` 的 [PR #2275](https://github.com/ajoe734/drts-fleet-platform/pull/2275) 已於 `2026-10-02T16:42:07Z` merge；merge SHA `6f6869c18464be1e535c06f498e6c6fa6b9cfb32`。沒有改寫舊 candidate／published history。
- 本輪 fetch 的 base／失敗 run 的 deployed source 均為 `d94d528f4a0257808922f85aaffbd6766a23b141`。工作分支以 merge `145c628963abd73f19948f84e4ea19e52b3478e3` 同步；唯一衝突 `ci-integ.yml` 保留 **origin/dev 原文**（含原 mail discover step 與別任務 ops-drill step）。merge 後 `git diff origin/dev --stat` 為空；無 task-authored workflow 或產品改動。
- [hosted run 37117683815](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37117683815) 的 workflow source 是 `bc85c54cf080a5906721912e4c009f4bf5c11239`，checkout／candidate 是上述 `d94d528f`，run attempt **1**，結論 **failure**。重新取回 artifact **11271733603**：`live-mail-acceptance-d94d528f4a0257808922f85aaffbd6766a23b141-37117683815-1`。只有 `run-status.json` 與 `evidence-provider.json`；**沒有 evidence-mail.json／真送達回執**。
- `run-status.json`：install／preflight／resources／teardown success，sessions failure，runner skipped。provider metadata 記錄 `drts-dev-devcc-20260825/us-central1`、revision `drts-dev-api-00045-t99`（created `2026-10-03T09:04:39.760410Z`）、alias freshness true、allowlist resolved version **2**；這不是郵件送達。
- API request 序列來源為上述 Supervisor note：health 200 → token 201 → session 200 → proof 201 → logout 201。runner log 只有 `Mail session bootstrap failed; credential details omitted.`。未讀真 mailbox secret；無法從舊 log 判斷 proof validation、secret read、alias derivation 或環境檔寫入哪個步驟失敗。

### Finding／修正邊界與驗證

| Finding／驗收項 | 正式依據與修改位置 | 舊版重現 → 本輪結果 | 命令／證據 | 未驗與責任 |
| --- | --- | --- | --- | --- |
| F13：Workspace sender 被拒絕 | `session-bootstrap.ts: deriveAliasRecipient`；`mailbox_observer.py: main` 原本各自限制 `@gmail.com` | base 原程式的同案例 TS **2 failed**、Python 入口 **1 error** → 修後 **2 passed／1 passed**。兩處均接受有效 DNS mailbox domain，仍只准 invite／approve，拒絕多地址、標頭／環境注入、壞 domain／長度 | 下表 before／after；重現 anchor `e8423e3fb`、修正 anchor `97bb7717c` 已普通 push | 單元測試修復真實可重現的 runner 缺陷；**未證實是舊 hosted run 唯一原因**，由 Supervisor redispatch 確認 |
| F14：bootstrap 隱藏拋錯階段 | `bootstrapMailSession` 是 CLI 同一執行入口；`mintTenantAdminSession.onStage`；`MailBootstrapError` | 原 CLI 只報泛用失敗 → 依 input／preflight／assertion／token／session／proof／secret read／alias／export 輸出固定 stage 與白名單 error class。單元注入含私密資料的 message/name/stderr/JSON，回報不含原值、stack 或 cause；CLI 授權拒絕實際 exit **1** 並帶 stage/class | `session-bootstrap.test.ts`；`cli-denial.log` | 新 live 失敗才會有精確 stage；不藉 error.message 輸出憑證／信箱 |
| proofData／wire shape 調查 | `StepUpProofService.createProof`、`resolveStepUpActionPolicy`、`IdentityController.createStepUpProof`、`AuthController.getAuthSession`、`SnakeCaseInterceptor.deepToSnakeCase` | 正式 create policy 產生 proof → 正式 envelope／serializer → 真 runner 接受 snake_case；wrong action、required=false、含 whitespace reference、wrong actor/tenant/role 均拒絕。未重造 proof 常數來驗這條路徑 | 真 service／policy 只在 unit 記憶體使用，HTTP／IAM／Secret Manager／檔案 IO 是 mock 邊界；59 bootstrap tests | 沒有證據支持該 endpoint 在本次 live 回 camelCase；未放寬正式 shape。camel-only 回應會明確停在 step-up-validation |
| session cleanup／既有 F01–F12 | 仍在 token 取得後立即輸出 cleanup handle；失敗後由 workflow teardown 使用；既有 profiles／gates 不改 | 後續 session/proof／mailbox 失敗時仍保留 token handle；本輪全套 **127 TS＋18 Python pass**，coverage **82 files** | 下表 scoped checks；既有正式 SMTP allowlist／IAM／tenant／SHA gate 保留 | 不把 unit pass 或舊 live teardown success 當成新 candidate live success |
| `authorized_test_mailbox` | 既有 user option A、專用 sender 的 +invite／+approve aliases | 沿用授權，未擴大收件對象；只改合法 domain 支援 | TS／Python 正向與注入／unsupported tag 拒絕測試 | Supervisor hosted 真 IMAP UID／內容 hash 仍待收集 |
| `configured_mail_provider` | 首次 run 的 evidence-provider.json | 已取回上述 source／revision／secret-version metadata，resources success | artifact 11271733603 | 新候選部署後仍要重新收集，未 record-acceptance |
| `provider_message_receipts` | 首次 run 的 runner skipped／無 evidence-mail.json | **零真 receipt**，不把 skipped 寫成 pass | run-status.json | Supervisor/operator 仍需真 approval request、真 24h expiry 與 queued retryable delivery，詳 §0.1 |
| `live_candidate_sha` | 原 run checkout／health SHA 是 d94d528f | 只證明舊 deployed source，未執行本次修正的 live run | 原 run、provider artifact；新候選由 handoff／PR head 鎖定 | Supervisor review／CI／merge／deploy 後 redispatch；owner 不 done |

### 已結束的本機檢查

機器輸出在本 worktree `.local/sr-live-mail-001/repair-20261003/`；下表與 hosted artifact ID 是 durable 查核入口。檢查程式版本為 `97bb7717c` 加測試 fixture 的 `authMode: jwt_bearer` 型別修正（原填 jwt，首次 tsc exit **2**，已修並重跑）；後續只更新本文件。最終完整 candidate SHA 由本輪 canonical handoff 與 PR head 記錄，不用 anchor SHA 冒充。

| 命令 | Exit／結果 | Log |
| --- | --- | --- |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/session-bootstrap.test.ts -t Workspace`（base 原程式／修後同案例） | **1 → 0**；2 failed → 2 passed，14 filtered skips 不算通過 | alias-before.log／alias-after.log |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/unit/system-remediation/sr-live-mail-001 -p test_mailbox_observer.py -k workspace -v`（base／修後） | **1 → 0**；main 的 Invalid dedicated mailbox → 真 MIME parser 成功；IMAP／secret／health 邊界 mock | imap-before.log／imap-after.log |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/` | **0**；6 files／127 tests passed，Vitest 4.1.4 | vitest.log |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/unit/system-remediation/sr-live-mail-001 -p 'test_*.py' -v` | **0**；18 tests passed | python.log |
| `pnpm exec tsc --noEmit -p tests/e2e/system-remediation/sr-live-mail-001/tsconfig.live.json` | **0** | typecheck.log |
| `pnpm exec eslint --max-warnings=0 tests/e2e/system-remediation/sr-live-mail-001/ tests/unit/system-remediation/sr-live-mail-001/` | **0** | lint.log |
| `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/check_test_coverage.py` | **0**；82 tracked test files covered | coverage.log |
| `pnpm exec prettier --check tests/e2e/system-remediation/sr-live-mail-001/session-bootstrap.ts tests/unit/system-remediation/sr-live-mail-001/session-bootstrap.test.ts`；`git diff --check`；`python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` | **0** | prettier.log／terminal |
| `DRTS_LIVE_MAIL_TEST_AUTHORIZED=false ./apps/api/node_modules/.bin/tsx --tsconfig tests/e2e/system-remediation/sr-live-mail-001/tsconfig.live.json tests/e2e/system-remediation/sr-live-mail-001/session-bootstrap.ts --preflight` | **1（預期拒絕）**；stage=input-validation; error_class=MailSessionInputError；未進 network | cli-denial.log |

本輪未啟任何 VM product／browser／preview server、Docker／PG 或 Playwright，未改真 SMTP／IAM／allowlist、未寄信。C079 仍依 Supervisor 排除；§0.1 approval／expiry／retry 的未驗限制全部保留。下一步是同候選獨立 review／CI、Supervisor 合併部署後重跑，若仍失敗以新 stage 定位，不把本次 unit 結果寫成 live acceptance。

## 0.3 F12：接入正式 PR CI（2026-10-02）

- 依完整 Claude2 `2026-10-02T13:16:39Z` reopen（候選 `a03b4b34e8da1a430b3d3167ea816955352af96b`，失敗 runs 見 §0.2）續修；Supervisor `16:05Z` integration note 明確授權 **僅在 ci-integ.yml changes job 的 coverage checker 前新增所提 unittest discover step**，且已核對沒有其它 open task 寫同檔。無須再等待 scope。
- 本輪 fetch 的 base `origin/dev` 為 `15ebab491e15bc5219d487168e33050c526e63b6`；開始時 local／remote／PR #2275 head 同為 `27d3d1a3e87c9c5a3f8400fcad34eb97fc783f23`，舊 CI 已 completed/failure、沒有鎖定 candidate。`git diff origin/dev -- .github/workflows/ci-integ.yml` 為空，故不為 trunk 前進另做 merge／rebase。
- 唯一 workflow 修改是 `.github/workflows/ci-integ.yml: jobs.changes.steps` 的 `Verify live mail Python unit tests`，執行既有 `test_hosted_gate.py`／`test_mailbox_observer.py`。沿用正式 `covered_targets`／`collected_files`；没有改 checker、測試、豁免、failure handling 或其它 workflow step。修改 anchor `7dee04dfe1116bd85fc58c9536d9d67e24a09063` 已普通 push；下列程式檢查均在此 SHA，後續只更新本 evidence 文件。
- 最終 candidate 是本節文件提交後的 branch HEAD，完整 SHA 由 canonical handoff 與 PR #2275 head 鎖定；不把 anchor 當 candidate。文件寫入時新 hosted CI 尚未結束，**本節不宣稱 CI pass**；本輪必要 checks 結果須讀完，最終 run／job 與結論寫入 canonical handoff/progress，可從 PR 同 SHA 取回。

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、版本與證據 | 未驗與具體限制 |
| --- | --- | --- | --- | --- |
| F12 Python tests 未進 CI discovery | `check_test_coverage.py: WORKFLOWS, covered_targets, collected_files`；`ci-integ.yml: jobs.changes` | `27d3d1a3e` 正式 gate exit **1**，精確報兩個 Python 檔未覆蓋；`7dee04dfe` 正式 gate exit **0**，全部 **79** tracked test files 可收集 | Python **3.12.3**；下表 coverage 命令及 `.local/sr-live-mail-001/f12-20261002/coverage-{before,after}.log` | 這是正式全庫 discovery gate；不等於全部測試或 live 通過。需同 candidate hosted CI |
| F01–F11 先前修正回歸 | §0／§0.1 的正式 API／runner／receipt／observer 呼叫路徑維持 | 本輪 **82 TS + 15 Python** tests pass，既有正向／拒絕情境保留 | 下表完整 scoped regression 指令／log | 外部 HTTP、IMAP、IAM 邊界仍為 mock；§0.1 所列 live 限制全部保留 |
| `authorized_test_mailbox` | §0.1、Supervisor 授權 dedicated sender 的 +invite／+approve aliases | 本輪未連 IMAP，沒有新 live arrival | 未執行 `record-acceptance`；資源授權入口沿用 §0.1 | Supervisor promotion 後 dispatch；operator 須提供真 approval 資源 |
| `configured_mail_provider` | §0.1 provider metadata runner | 本輪未讀 secrets／cloud metadata；無新 candidate provider 證據 | 既有部署設定不能替代同 SHA `evidence-provider.json` | 待 Supervisor shared-dev hosted 執行 |
| `provider_message_receipts` | 正式 delivery readback／approval audit／retry observer | 真 SMTP 回執與 inbox 仍未收集；unit pass 不計入 | §0.1 `evidence-mail.json`／IMAP UID／內容 hash 證據入口 | operator 提供 approval request、真 24h expiry 樣本、尚 queued retryable delivery；未授權改共用 SMTP 製造故障 |
| `live_candidate_sha` | §0.1 workflow checkout／health SHA gate | 本輪是 CI wiring 修正，未 merge／部署／live | 最終 code candidate 由 handoff 鎖定；live SHA 待正常 promotion／部署後記錄 | 不把 anchor、候選或 merge SHA 當已部署 SHA；四項 acceptance 均未完成 |

所有本機 checks 均已結束並讀取；各命令的 stdout/stderr 留在 `.local/sr-live-mail-001/f12-20261002/`，未啟 VM 產品 server、browser、Docker、PG 或真郵件連線。

| 命令（`7dee04dfe`，baseline 另註） | Exit／實際結果 | Log |
| --- | --- | --- |
| `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/check_test_coverage.py`（baseline `27d3d1a3e`） | **1**，兩個檔案未在 CI path；不是 setup failure | `coverage-before.log` |
| `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/check_test_coverage.py` | **0**，79 files covered | `coverage-after.log` |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/unit/system-remediation/sr-live-mail-001 -p 'test_*.py' -v` | **0**，15 tests passed | `python-tests.log` |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tools/ci/test_check_test_coverage.py tools/ci/test_workflow_timeouts.py -v` | **0**，11 tests passed | `workflow-tests.log` |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/` | **0**，6 files／82 tests passed，Vitest 4.1.4 | `vitest.log` |
| `pnpm exec tsc --noEmit -p tests/e2e/system-remediation/sr-live-mail-001/tsconfig.live.json` | **0** | `scoped-static.log` |
| `pnpm exec eslint --max-warnings=0 tests/e2e/system-remediation/sr-live-mail-001/ tests/unit/system-remediation/sr-live-mail-001/` | **0** | `scoped-static.log` |
| `pnpm exec prettier --check .github/workflows/ci-integ.yml .github/workflows/live-mail-acceptance.yml 'tests/e2e/system-remediation/sr-live-mail-001/*.ts' 'tests/unit/system-remediation/sr-live-mail-001/*.ts'` | **0** | `scoped-static.log` |
| `git diff --check` | **0** | `scoped-static.log` |
| Playwright／SMTP／IMAP／PG／Cloud Run live | **未執行**；依 VM 限制及 Supervisor 先 promotion 指示 | 無 live pass 聲明 |

## 0.2 CI 退回定位與 scope 待辦（2026-10-02）

- 本輪 `git fetch origin` 後 base `origin/dev` 仍為 `210c0beaed9f19bd12442f247265c8f3307a9c93`；local／remote／[PR #2275](https://github.com/ajoe734/drts-fleet-platform/pull/2275) head 均為 `a03b4b34e8da1a430b3d3167ea816955352af96b`。未因 trunk 移動而 merge/rebase，沒有重寫 published history。
- dispatch 開始時 canonical task 是 `in_progress`、`ci_status=failure`。續查時已讀到 **13:16:39Z 的 canonical `Reopen` 完整退修**（`ai-status.sh show SR-LIVE-MAIL-001` 的 `next`），確認同一缺口並要求先接入 CI、必要時請 Supervisor 擴 scope；候選與 CI 欄位已由 reopen 清空。GitHub reviews 陣列仍空，不代表沒有 canonical reviewer 退修。這是 **F12 CI wiring 缺口的首次退修**，不是兩次相鄰候選的同 finding 退修；§0／§0.1 的 F01–F11 與未驗事項全部保留。
- [CI run 37011504250](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37011504250/job/110852087854) 的 `Change scope` 與 [integration run 37011504184](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37011504184/job/110852120326) 的 `changes` 均執行 `python3 tools/ci/check_test_coverage.py` 後 exit **1**：`test_hosted_gate.py`、`test_mailbox_observer.py` 都不在 discovery roots。後續 lint／typecheck／unit 等 job 是 **skipped**；Smoke／E2E aggregate 因上游 gate 失敗而紅燈，不能解讀為產品測試已跑完失敗或通過。

### F12 最小重現、修正邊界與驗證

正式呼叫路徑：`ci.yml: jobs.scope`／`ci-integ.yml: jobs.changes` → `tools/ci/check_test_coverage.py: main` → `covered_targets`／`tracked_test_files`／`collected_files`。`WORKFLOWS` 僅包含 `ci.yml`、`ci-integ.yml`；單加已授權的 `live-mail-acceptance.yml` 手動 workflow 步驟無法讓 PR CI 收集這兩個測試。

最小修正是於 **`.github/workflows/ci-integ.yml` 的 `changes` job、coverage checker 前**新增一個 step：

```yaml
- name: Verify live mail Python unit tests
  run: python3 -m unittest discover -s tests/unit/system-remediation/sr-live-mail-001 -p 'test_*.py' -v
```

這會讓 CI 實際執行既有 15 tests，失敗即 nonzero，並讓 coverage checker 發現其真實執行路徑。無須修改 checker、移動／改名 tests、加豁免或降低 acceptance。**目前尚未套用到 task workflow**：machine write scopes 不含 `ci-integ.yml`；已用 owner `progress` 請 **Supervisor** 核對共用檔案衝突、擴 scope 並加入必要 dependencies，之後由原 owner Codex 套用。

| Finding／驗收項 | 正式依據與修改位置 | 舊版 → 提議修正結果 | 命令、退出碼與證據 | 未驗與限制 |
| --- | --- | --- | --- | --- |
| F12 Python tests 未進 CI discovery | 正式 checker 的 `WORKFLOWS`／`covered_targets`；提議 `ci-integ.yml: jobs.changes` | `a03b4b34` 正式 worktree gate exit **1**，與兩個 hosted runs 同錯；隔離最小副本套提議 patch 後 gate exit **0**，收集兩個檔案，既有 15 tests pass | `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/check_test_coverage.py` → **1**；`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/unit/system-remediation/sr-live-mail-001 -p 'test_*.py' -v` → **0**, 15 tests；`.local/sr-live-mail-001/ci-discovery-20261002/probe.py` → **0** | 隔離副本只有受影響 tests、正式 Python modules、checker 與兩份 workflow，證明修正方向；**不是全庫 gate／新 candidate CI pass**。scope 到位後須在正式 worktree 重跑 checker、15 tests、workflow 適用檢查，再普通 push／handoff |
| `authorized_test_mailbox` | §0.1 授權與 IMAP observer | 本輪未連 IMAP；無新 live 證據 | 沿用 §0.1 可取回入口，未呼叫 `record-acceptance` | Supervisor promotion 後 dispatch；operator 提供 approval 資源 |
| `configured_mail_provider` | §0.1 provider metadata runner | 本輪未讀 cloud secrets 或 metadata；無新 live 證據 | 既有設定證據不等於當前 candidate 寄達 | 同 live SHA 的 `evidence-provider.json` 待驗 |
| `provider_message_receipts` | 正式 delivery readback／approval audit／retry | 本輪零真回執；15 unit tests 只模擬外部邊界 | 不以 unit pass 充當 inbox／SMTP pass | approval request、真 24h expiry、queued retryable delivery 與 hosted 執行仍待 Supervisor/operator |
| `live_candidate_sha` | §0.1 checkout／API SHA gate | `a03b4b34` CI failure，未 merge／部署／live | 本節兩個 same-SHA CI run 可取回 | 新修正須重新 review／CI，之後走原 promotion／shared-dev 路徑 |

最小 probe 只在 `.local/sr-live-mail-001/ci-discovery-20261002/` 的暫存 git 副本套 patch；沒有修改 scope 外 workflow。保留 `proposed-ci-integ.patch`、`minimal-before.log`、`minimal-after.log`、`minimal-python-tests.log` 與兩個 `run-*-failed.log`，沒有 reset 活躍樹。副本直接匯入原 production Python modules，沒有複製驗收業務邏輯。此 session 沒有啟動任何 VM 產品／browser／Docker 服務。

本節只形成 **證據 checkpoint**，不是修正版 review candidate；先 commit／普通 push 保存定位，scope 未核准前不把同一未修 CI 缺口重新 handoff。

## 0.1 續作交審：hosted workflow 與真郵件 profiles（2026-10-02）

### 版本、授權與範圍

- 本次 fetch 的 `origin/dev`：`210c0beaed9f19bd12442f247265c8f3307a9c93`。開始時 task branch／remote 都是 `a19d1a5eead3feec28a8d3d12b93d9ed691e3b49`，PR 查詢為空，未鎖 candidate。
- 為納入最新 WIF／scheduler 路徑，以普通 merge 產生 `1446409c388f8ff14274e14863e73c2a6ffc3f8f`，沒有 rebase/reset/amend/force push。程式／測試驗證 snapshot：`ce3ed8149d039e250f5909337ce62a6c9466d276`，與前述 anchors 均已普通 push。
- 最終 candidate 為本文件 closeout commit 後的 branch HEAD，由 canonical `handoff.CANDIDATE_SHA` 與 PR head 鎖定；**anchor、review candidate、merge SHA 與 live source SHA 分開記錄**，不自填文件自己的 commit hash。
- `gh variable list --json name,value`（只選 `DEV_GCP_*`、`DRTS_LIVE_MAIL_*`）exit 0：project `drts-dev-devcc-20260825`、region `us-central1`、tenant `...0201`、actor `...0901`、viewer role、authorization `true` 與既有 API allowlist 均存在。沒有讀本機 secret payload 或列印 recipient allowlist。
- Supervisor integration_notes 12:50Z 指定先 review／merge／nightly publish→main promotion，之後才 dispatch。歷史 workflow HTTP 404 已有正常發布路徑，不反覆重試。
- 只寫四個 machine scopes，沒有改業務碼、shared contracts、lockfile 或 deploy workflow。VM 只跑 repository checks，**未執行 Playwright、產品 server、Docker、SMTP send 或 IMAP 連線**。

### Finding 與驗證對照（保留 §0 F01–F07）

| Finding／驗收項                             | 正式依據／修改位置                                                                                    | 舊版 → 新版／證據                                                                                                                                                                                                                      | 未驗與責任                                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01–F04 wire、identity、receipt、SHA        | `SnakeCaseInterceptor`、`toApiSuccessEnvelope`；既有 bootstrap／runner／preflight                     | §0 原四項重現保留，本輪完整 82 TS tests 包含前 50 回歸通過                                                                                                                                                                             | 真 session／同 SHA HTTP 尚待 hosted                                                                                                                                                                                           |
| F05 partial 誤稱 complete                   | `runMailAcceptance`、`gate-evidence.py`、`live-mail.spec.ts`                                          | 缺 approval／expiry／retry 任一項仍 failed/nonzero；missing/stale artifact、skipped step、teardown failure 均不能 pass；TS orchestration／Python gate checks pass                                                                      | 第一次 hosted run 的 partial artifact 不能當 task acceptance                                                                                                                                                                  |
| F06 真信件與 token 消耗                     | `buildInvitationEmailBody`、`acceptTenantInvitation`；Python observer／live-profiles                  | READONLY All Mail、exact Message-ID、BODY.PEEK；核 alias／sender／subject／business text；token 只在 Python 記憶體，直送固定 accept API，不追蹤 email link。15 Python tests 與 TS lifecycle 正反向 pass                                | 真 Gmail UID／內容未取得；RFC Message-ID 不是 provider queue ID                                                                                                                                                               |
| F07 assertion 同秒碰撞                      | 正式 `GoogleWorkloadIdentityAdapter` replay gate；fresh-assertion／bootstrap                          | Supervisor 已登錄 `CI-DEPLOY-DEV-WIF-ASSERTION-COLLISION-20261002`。本 source 每次 IAM mint 的 iat 嚴格增加、1.1s 間隔；同 iat bounded fail；明確 replay 409 才限三次新 assertion exchange，其他錯誤不 retry；hosted-runner tests pass | 其他 deploy workflow 的歷史 409 未被本任務宣稱已修；未削弱產品 replay protection                                                                                                                                              |
| F08 固定 alias 再次 create 衝突／誤改他人   | `createTenantUser`、`resendTenantInvitation`、`updateTenantUserRole`；`prepareTaskInvitation`         | 先讀 directory，只重用相同 tenant／alias／本 task displayName／viewer；invited 走 resend，active viewer 用正確 step-up 回 invited；wrong owner／admin／tenant 均拒絕；記實際 resend HTTP status                                        | 只修改本 task 測試 viewer，不刪 membership／資料；live 待驗                                                                                                                                                                   |
| F09 本輪 expiry probe 曾讀 receipt 私有欄位 | `toMailDeliveryReceiptView` 不公開 idempotencyKey；`verifyExpiredInvitation`                          | 舊 `80b4085ed0f53835a6850a692296dd1281c8a579` 的函式＋同回歸案例：1 failed／12 filtered skips，定位 private idempotency_key assertion；修後同案例 1 pass／12 filtered skips，全套 82 pass                                              | 到期靠真 expiry／queued_at 與 denial 後 pending-only revoke 回傳同 delivery，排除先前 revoked／accepted；真 24h 未經過                                                                                                        |
| F10 C026 三類郵件與 actor 限制              | `recordApprovalDecision` exact resolvedApproverUserIds；approval audit delivery ID；`observeApproval` | 真 decided request→唯一 active +approve user→new_request／approaching_timeout／decision audit→receipt→IMAP；missing reminder／wrong alias fail；subject 與正式 template 交叉核對。Unit pass                                            | **Supervisor/operator 需供真 approval_request_id**；目前 WIF 只 ...0901/...0902，不能冒用動態受邀 +approve membership 決策。自動建 rule／booking／decision 因身份資源缺口未實作，本 profile 唯讀                              |
| F11 background retry                        | 正式 MailDeliveryReceiptView／既有 scheduler；retry-profile                                           | 先觀測 queued＋retryable failed，再 GET 等 due-time 後新 sent attempt／provider ID／IMAP；取得同 project/job/region/time-window Scheduler AttemptFinished，拒絕 stale/start-only/401/wrong-job。8 unit cases pass                      | **Supervisor/operator 需供尚 queued 的真 retryable invitation delivery，或安排受控故障資源**；未獲授權改共用 SMTP 製造失敗；allowlist permanent rejection 不能冒充 retry。Scheduler log 是同時段佐證，非逐 delivery causality |
| provider／session 收尾                      | 正式 AuthController.logout；provider-metadata／session-teardown／workflow                             | 雲端 auth 前核 grant／health SHA；metadata 核單 revision 100% traffic、postgres、六 secret refs、allowlist v2／:latest freshness。token 取得即保留 cleanup handle，後續 bootstrap 失敗也撤銷；相關 unit pass                           | 真 WIF／metadata／Gmail／teardown 尚待 hosted；job 硬終止仍需 operator 查 session                                                                                                                                             |

WIF 使用 auth@v2 的 **auth_token（原 federated token）**呼叫 IAM generateIdToken，沿用其官方呼叫身份，避免要求 SA 自身額外 impersonation grant。參考 [auth outputs](https://github.com/google-github-actions/auth#outputs)、[v2 source](https://github.com/google-github-actions/auth/blob/v2/src/main.ts)。GCP 仍簽章，API 照常驗 issuer/audience/registry/replay；decode iat 只判 uniqueness。跨 workflow 首顆碰撞由 API 拒絕後再 mint。credentials 不寫 artifact。

### 已結束並讀取的 checks

以下新版命令執行於 `ce3ed8149`（最終後續只有 evidence 文件）。HTTP／IMAP／IAM 邊界在 unit mock，不算 SMTP／PG／live pass。

| 命令                                                                                                                                                                                                    | Exit／結果                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/`                                                                                                                                  | **0**；6 files／**82 tests passed**，Vitest 4.1.4                             |
| `pnpm exec tsc --noEmit -p tests/e2e/system-remediation/sr-live-mail-001/tsconfig.live.json`                                                                                                            | **0**，包含 hosted spec／profiles                                             |
| `pnpm exec eslint --max-warnings=0 tests/e2e/system-remediation/sr-live-mail-001/ tests/unit/system-remediation/sr-live-mail-001/`                                                                      | **0**                                                                         |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/unit/system-remediation/sr-live-mail-001 -p 'test_*.py' -v`                                                                            | **0**；**15 tests passed**                                                    |
| `pnpm exec prettier --check .github/workflows/live-mail-acceptance.yml 'tests/e2e/system-remediation/sr-live-mail-001/*.ts' 'tests/unit/system-remediation/sr-live-mail-001/*.ts'`                      | **0**                                                                         |
| Python `yaml.safe_load` workflow、hosted runner／step 結構核對                                                                                                                                          | **0**；ubuntu-latest／15 steps。VM 無 actionlint，未稱 actionlint pass        |
| `git diff --check`                                                                                                                                                                                      | **0**                                                                         |
| `pnpm exec vitest run --root .local/sr-live-mail-001/baseline-80b4085ed --config vitest.config.ts tests/unit/system-remediation/sr-live-mail-001/live-profiles.test.ts -t 'uses the real receipt view'` | **1**；舊函式的 private-field behavioral failure，1 failed／12 filtered skips |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/live-profiles.test.ts -t 'uses the real receipt view'`                                                                             | **0**；修後 1 pass／12 filtered skips；其餘已於全套 82 執行                   |
| Playwright／SMTP／IMAP／PG／Cloud Run live                                                                                                                                                              | **未執行**；VM 限制＋Supervisor 指定先 promotion                              |

F09 重現把舊函式放隔離 `.local/sr-live-mail-001/baseline-80b4085ed/`，沿用同案例與目前相依，沒有 reset 活躍樹；輸出 `expiry-before.log`／`expiry-after.log`。最初 config 路徑與 tsconfig.base 缺件兩次 setup 失敗不算重現；補齊後才取得上述行為失敗。

### Promotion 後操作與 acceptance 缺項

Supervisor 在 review／same-candidate CI／merge／正常 publish→main promotion 後，選**包含本 runner 且已部署的完整 source SHA**執行：

```bash
gh workflow run live-mail-acceptance.yml --ref dev -f candidate_sha=<deployed-full-source-sha>
```

Workflow checkout 精確 live source；`WORKFLOW_SHA` 保留既有 runner 的 checkout SHA 語義，`DISPATCH_WORKFLOW_SHA` 記真正 workflow source，`BASE_SHA=git merge-base HEAD origin/dev`。API 每次回應、IMAP 存取前均核 deployed SHA。首次 run 缺完整 profiles 時必須紅燈，但仍上傳 partial observations。

首次產生 `invitation_expiry_checkpoint`（user/delivery/invitation/expires_at/SHA）；等真 24h 到期後加 `expiry_user_id`、`expiry_delivery_id`。**期間不要重送同 alias**，否則 checkpoint 被撤銷。新 run 先檢查 expiry，再做新 lifecycle。若部署版本改變，保留 checkpoint 的原 SHA 與新觀測 SHA，交 reviewer 判斷是否須重建同版本 checkpoint，不把歷史建立版本冒充當前候選。

加 `approval_request_id` 觀測真 product flow 已決策且三類信俱全的 request，唯一 active approver 須是 +approve。本 runner 不自建 rule／booking／decision；Supervisor/operator 先提供 linked approver 身份與真 request，不能把此限制描述為完整自動 C026 已完成。加 `retry_delivery_id` 時必須尚為 queued retryable invitation；runner 先只讀 retry，再 expiry，再新 invitation，不 POST drain／jobs run／修改 SMTP。缺少任何 input 的 profile 為 incomplete，**不 skip 後 pass**。

artifact：`live-mail-acceptance-<live-sha>-<run_id>-<run_attempt>`，保留 30 天，含 `evidence-mail.json`、`evidence-provider.json`、`run-status.json`；失敗也上傳，不含 raw mail body／secret／session／invitation token／allowlist。測試 viewer 回 invited 並留下 expiry 樣本；既有資料不刪。此 run 的 tenant session 一律 teardown，硬終止例外不能假稱已清理。

| required_acceptance       | 本輪可取回入口                                                                | 尚缺的 live 證據／責任                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| authorized_test_mailbox   | 原 user option A、Supervisor notes、repo vars；只衍生 +invite/+approve        | 授權沿用不重問；待真 IMAP UIDVALIDITY/UID/content hash／candidate。Supervisor dispatch，operator 供 approval 資源                             |
| configured_mail_provider  | 新 metadata runner；既有真部署配置來源仍保留 §0／歷史 §2                      | 待 live SHA 的 evidence-provider.json，沒有用 unit stub 代 cloud metadata                                                                     |
| provider_message_receipts | 正式 delivery readback／approval audit／retry前後 attempt                     | **本輪零真回執**；待 hosted send、IMAP、approval request、real expiry 與真 retryable failure。Supervisor/operator 協調資源，Codex 維護 runner |
| live_candidate_sha        | exact checkout、health／API headers、IMAP preflight、run/attempt/workflow SHA | review／CI／merge／promotion／部署後才有同 live source 的 evidence；由 Supervisor 依 lifecycle 收錄，owner 不 done                            |

C079 發票信仍不涵蓋（Supervisor 明確排除，產品無 mail path）。本輪沒有獨立 review 結論、CI 或 live pass；新觀測能力不關閉 §0 尚未實測的 findings。

## 0. Codex 接手：契約修復與真信箱觀測準備（2026-10-02）

### 版本與資源

| 用途                                             | 證據                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fresh `origin/dev` / assigned worktree 初始 HEAD | `edd8159f6e8bd11d7eaa2363adacec50cd87fffb`；`git fetch origin` / `git rev-parse HEAD origin/dev` exit 0                                                                                                                                               |
| 前任發布成果                                     | `origin/claude/sr-live-mail-001=f23a3068b9592f4853671c462903f641a14b4c60`，無 PR；未改寫或刪除此 ref                                                                                                                                                  |
| 接手分支                                         | `codex/sr-live-mail-001`；恢復 scope 內 5 檔的 anchor `fd91984d2`、契約修復 anchor `44086bd2d`、IMAP anchor `460bc1a036dca92eed94703b385d62241fe3524d` 均已普通 push                                                                                  |
| review candidate                                 | **尚未 handoff / 未鎖定**；anchors 不是 candidate，後續 checkpoint 以此分支 HEAD 為準                                                                                                                                                                 |
| 當前 API 版本                                    | `2026-10-02T02:25:08Z` 唯讀 `GET https://drts-dev-api-r6ykdme3wa-uc.a.run.app/health` → HTTP 200，`x-drts-candidate-sha=a5bc50654e43e7e4d9fcbf75b8a4f93ad5521760`；不是本分支 HEAD                                                                    |
| live GitHub variables                            | `DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825`、region `us-central1`；六個 `DRTS_LIVE_MAIL_*` vars 仍存在，授權 true、tenant `...0201`、actor `...0901`、role `tenant_viewer`、allowlisted API origin 如上；`gh variable list --json name,value` exit 0 |
| workflow 是否可取回                              | `gh api repos/ajoe734/drts-fleet-platform/actions/workflows/live-mail-acceptance.yml` → **exit 1 / HTTP 404**；本 branch／`origin/dev` 尚無該 workflow                                                                                                |
| 更新後的部署 run                                 | [36953681080](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36953681080) 已結束 **failure**；API 健康版本已更新，不能把這個 run 稱為驗收成功                                                                                            |

只讀查詢與 unit/typecheck/lint 在 VM 執行；沒有啟動產品 server、Playwright、preview、Docker 或自行部署。機器原始輸出位於本 worktree `.local/sr-live-mail-001/`，不把該忽略目錄當作 durable live acceptance；本文件保留可重跑命令和具體觀察。

### Finding 與修正邊界（§0.7）

| Finding／驗收項                              | 正式原始碼／修改位置                                                                                                                                                     | 舊版重現 → 修正後                                                                                                                                                   | 命令、退出碼、證據                                                                                                                                                                               | 未驗與責任                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01：真 session/proof 回應讀不到             | `SnakeCaseInterceptor.deepToSnakeCase`、`AuthController.getAuthSession`、`StepUpProofService.createProof`；修 `session-bootstrap.ts`                                     | 前任 camelCase mock 綠燈遮住真 snake_case；用正式 serializer 後失敗 → 修後通過；同步核對 actor、tenant、role、proof action 與每個 SHA header                        | `wire-contract.test.ts`；baseline `fd91984d2` 加兩個 adapter export test seam：4/4 failing，exit 1；修後 4/4 passing（包含下兩項與 F04）                                                         | 真 WIF session/proof 未在本 mail workflow 執行                                                                                                                                                |
| F02：create user 沒讀到 invitation           | `TenantPartnerService.createTenantUser` 回 `{ userId, invitation }`，HTTP 是 `data.invitation.delivery_id`；修 `realIssueInvitation`                                     | 舊版讀 `data.deliveryId` 得 null → 真 envelope 回歸通過                                                                                                             | 同一 `wire-contract.test.ts`，正式 `toApiSuccessEnvelope` + `deepToSnakeCase`；只 mock HTTP 邊界                                                                                                 | 沒有以 fixture mail 當 live                                                                                                                                                                   |
| F03：遺失 provider receipt                   | `getMailDeliveryReceipt`／`toMailDeliveryReceiptView` 的 snake_case wire、`MailDeliveryReceiptView`；修 `realPollDeliveryReceipt`                                        | 舊版 `providerMessageId` 得 null → 讀到 `acknowledgement.provider_message_id`；核對 tenant、delivery、candidate                                                     | 同上；另測 cross-tenant / wrong delivery / SHA drift / HTTP 503。保留實際 GET status/timing 及 receipt，不再自行填 GET 200                                                                       | 尚無真 provider queue ID                                                                                                                                                                      |
| F04：SHA 不符仍送信                          | `runMailAcceptance`、新增 `preflight.ts`                                                                                                                                 | baseline wrong-SHA 呼叫 issueInvitation **2 次** → 修後 **0 次**；在憑證／mutation 前查授權、project、tenant、actor、HTTPS target 與 health SHA                     | `wire-contract.test.ts`；input 拒絕前 suspended project／他租戶／外部 target；negative 收件人只允許固定 reserved domain                                                                          | hosted workflow 必須在 auth 前用相同前置檢查，scope 尚待校正                                                                                                                                  |
| F05：只驗 SMTP 就讓整項 passed               | `runMailAcceptance`／main evidence writer                                                                                                                                | 前任 two transport probes 返回 passed，即使內文／approval 未驗；現改成 **failed + Acceptance incomplete**，未驗項列入 evidence                                      | `mail-acceptance-runner.test.ts` 正向回執與 allowlist rejection 成功時仍拒絕總驗收；exception 也落 failed evidence                                                                               | 不是降低 acceptance；完整 profile 未實作，不能交審成已完成                                                                                                                                    |
| F06：沒有 IMAP 內文路徑                      | `NotificationDeliveryService.enqueue` 的 RFC Message-ID + `RemoteSmtpMailTransport.send`；新增 `mailbox_observer.py` / `mailbox-observer.ts`，由 invitation profile 呼叫 | 已用 stdlib `imaplib`/TLS/MIME，不需改 lockfile；5 個本機 parser/IMAP adapter tests 通過                                                                            | `python3 -m unittest discover ...` exit 0；只 READONLY `[Gmail]/All Mail`、精確 Message-ID UID SEARCH、`BODY.PEEK[]`，核对 sender/alias/subject/business text，保存 UIDVALIDITY/UID/content hash | 真 Gmail 連線未執行；RFC Message-ID **不是** provider queue ID；IMAP 邊界 mock 不代表 inbox arrival                                                                                           |
| F07：另一次 deploy 的第二個 session 重放失敗 | `.github/workflows/deploy-dev.yml` 的兩個 auth steps／`AuthController.issueToken` 的單次 assertion 語義；**未改產品或 workflow**                                         | live log：Tenant Admin 成功後，Tenant Ops HTTP **409 WORKLOAD_ASSERTION_REPLAYED**；尚未證明兩個 auth action 取到相同 token 的根因，不能移除 auth/token replay gate | run 36953681080，step `Issue deployment-machine Tenant acceptance session`，`2026-10-02T02:23:36.860Z`，trace `b487c0d5-1db2-47c9-b8ae-abd8c98b078a`                                             | 已用 parent `progress` 提交具來源修復子任務登記請求；worker guard 禁止 assign／跨 task mutation，由 Supervisor 登記或連結既有 task。此問題**未證明**會擋只 mint 一個 session 的本 mail runner |

F01–F04 是接手後對前任 checkpoint 的首次具體重現，不是兩輪獨立 reviewer 退修；沒有偽造 reviewer 結論。測試實際呼叫 runner 的 HTTP adapter 與正式 serializer，mock 範圍僅 HTTP／IMAP 邊界，沒有真 SMTP／PG／Cloud Run 驗收。

### 實際 checks

| 命令                                                                                                                               | Exit / 結果                                                                                                 | 版本／輸出                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/wire-contract.test.ts`（修前）                                | **1**；4 tests failed，確定是 contract/SHA 邏輯錯誤，非缺套件                                               | `fd91984d2` + exports-only test seam；`.local/sr-live-mail-001/wire-before.log`                                 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/ tests/e2e/system-remediation/shared/`（修後）                | **0**；3 files / **50 tests passed**。shared 的 `.spec.ts` 不屬 Vitest include，沒有宣稱執行該 browser spec | `460bc1a03` + 本輪 wire regression additions；`.local/sr-live-mail-001/unit-final.log`                          |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/unit/system-remediation/sr-live-mail-001 -p 'test_*.py' -v`       | **0**；**5 tests passed**                                                                                   | 同本輪 mailbox observer；positive MIME content、wrong alias/content、readonly exact lookup、duplicate rejection |
| `pnpm exec tsc --noEmit -p tests/e2e/system-remediation/sr-live-mail-001/tsconfig.live.json`                                       | **0**；scoped runner / tests typecheck                                                                      | `.local/sr-live-mail-001/typecheck.log`                                                                         |
| `pnpm exec eslint --max-warnings=0 tests/e2e/system-remediation/sr-live-mail-001/ tests/unit/system-remediation/sr-live-mail-001/` | **0**                                                                                                       | `.local/sr-live-mail-001/lint.log`                                                                              |
| `git diff --check`                                                                                                                 | **0**                                                                                                       | task-scoped diff                                                                                                |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-live-mail-001`                                            | **未執行**                                                                                                  | dispatch 明確禁止此 VM 執行此命令；不改寫成通過                                                                 |
| 真 SMTP／IMAP／approval／expiry／scheduler retry                                                                                   | **未執行**                                                                                                  | hosted workflow 發布／scope 尚缺，非本機 mocks 的結果                                                           |

### Required acceptance 逐項 gate

| Key                         | 可取回依據                                                                                                                                              | 目前缺項／責任                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `authorized_test_mailbox`   | Supervisor integration notes 中 user option A、sender 的 `+invite/+approve` aliases、allowlist v2／repo authorization vars；runner 僅衍生這兩個 aliases | 授權已存在，**不重問使用者**；待 hosted runner 真收信內容證據（Codex），operator／Supervisor 維持資源與 scope                            |
| `configured_mail_provider`  | 前任 §2.1 的六個 Secret Manager 名称／部署掛載和 Supervisor 記錄；本輪未讀 secret payload                                                               | 不能把舊配置當新 candidate 的 provider 送達；待 hosted 同 SHA run 認證／回執／掛載證據                                                   |
| `provider_message_receipts` | 正式 read-only `GET tenant/mail-deliveries/:deliveryId` adapter 已修，provider receipt 可保存                                                           | **尚無真回執**；待兩流程與失敗／retry 實測；Codex 續作                                                                                   |
| `live_candidate_sha`        | 本輪 health HTTP 200 回 `a5bc50654e43e7e4d9fcbf75b8a4f93ad5521760`                                                                                      | 不是本分支 review candidate，且 deployment acceptance failure；待鎖定、合併／授權部署後同 SHA live evidence；Supervisor／release + Codex |

### 接續條件與未完實作（不可改稱 done）

1. **Supervisor** 將 `.github/workflows/live-mail-acceptance.yml` 真正加入 machine `write_scopes` 並檢查衝突／相依。integration_notes 聲明已批准，但 02:27Z 單 task slice 仍只有三個原 scope。本輪未寫 workflow，也未修改 canonical status JSON。
2. scope 修正後由 **Codex** 接手 `origin/claude/sr-live-mail-001` 的 workflow，補 auth 前 preflight、正確的 `BASE_SHA`、用 `google-github-actions/auth` 的 `token_format=id_token` / API audience 發行一次性 `DRTS_LIVE_MAIL_GOOGLE_ID_TOKEN`、artifact／session teardown；不用舊版無 impersonation 的 `gcloud auth print-identity-token` 假定可用。**Supervisor／release** 協調 workflow 正常發布與可 dispatch 入口；目前 API 404，不在 VM 用替代服務跑。
3. **Codex** 續補完整 invitation lifecycle 與 C026 approval profile：實際 `POST tenant/approval-rules` → `POST tenant/bookings` → tenant approval decision APIs → audit `new_values_summary.email.recipients[].delivery_id` → 真 receipt／IMAP。保留受控 rule、user、booking IDs 與 cleanup，僅選 authorized `+approve` recipient；不得向其餘使用者發信。現有 invitation create 對已存在 alias 會明確失敗，尚未做 safe rerun/resend；不刪既有 user／資料假裝重新驗收。
4. 真 expiry 必須留下一個未使用 invitation，等待正式 **24 小時** 到期再讀原信件 token 走 accept；不能更改資料時間或把單元時鐘當 live。Automatic retry 必須觀測實際 scheduler 觸發／attempt 增加；`a5bc5065` 已部署只證明版本，不等於 retry 通過。
5. **C079 發票信不在本任務範圍**（產品沒有該 mail path），按 Supervisor 原指示保留缺口。本輪不改產品碼、共用 contracts、workflow 或 package lockfile；不為 F07 直接降低重放保護。

以下為前任歷史記錄，保留追溯；當前判定以上面的 §0 為準。

---

## 1. 來源、版本與候選邊界

依據 [task spec](../../03-runbooks/system-remediation-20260906/SR-LIVE-MAIL-001.md)、
[execution rules](../../03-runbooks/system-remediation-execution-tasks-20260906.md)、
[C006/C026/C079](source/capabilities.json) 與 [AI Collaboration Guide §0.7](../../../AI_COLLABORATION_GUIDE.md)。
2026-09-06 的 mock 觀察只作追溯，不作本次程式現況；本輪 base 取自目前 `origin/dev`。

| 版本                                                          | 完整 SHA / 說明                                                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 本輪 fresh `origin/dev` base／已部署 `drts-dev-api` candidate | `ddd0d786afeeefc9da65a3a75815e734f4c3cbc3`（確認見 §2）                                                              |
| 本輪分支 `claude/sr-live-mail-001` HEAD                       | 由本文件所在的 candidate commit、PR head 及 canonical `handoff.CANDIDATE_SHA` 鎖定；不把文件 commit 宣稱為已部署版本 |

依賴鏈 `SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930`（#2234）、`SR-MAIL-RETRY-SCHEDULE-20261001`（#2261）、
`SR-MAIL-DELIVERY-READBACK-20261001`（#2260）、`SR-MAIL-SCHEDULER-PROVISION-20261001`（#2263）均已 merge 進
`origin/dev`，且 `ddd0d786a` 正是 `SR-MAIL-SCHEDULER-PROVISION-20261001` 的 merge commit。

## 2. 重新取回的資源與部署證據

2026-10-02 00:55–01:05 UTC 以本機真實 `gcloud`/`gh` 存取重新查詢 GCP Secret Manager、Cloud Run、
Cloud Scheduler 中繼資料與 GitHub Actions run 記錄；沒有讀取任何 secret payload 值、沒有部署、沒有建立
Cloud Run 修訂版本。`orchestrator_approval_broker` MCP 本 session 持續 `CONNECT_TIMEOUT`（見下方「機器狀態」段），
`gcloud secrets versions access`（讀 secret 值）與 `gcloud logging read`（讀 Cloud Logging）兩類指令在本 session
被 broker 擋下（`classified as defer`），因此以下只使用 `describe`/`list`（中繼資料，不含值）與已部署服務的
環境變數引用名稱。

### 2.1 `configured_mail_provider` — 有真實證據

GCP project `drts-dev-devcc-20260825`，region `us-central1`：

```
$ gcloud secrets list --project drts-dev-devcc-20260825 --filter="name:drts-dev-smtp" --format="value(name)"
drts-dev-smtp-from-email
drts-dev-smtp-host
drts-dev-smtp-password
drts-dev-smtp-port
drts-dev-smtp-recipient-allowlist
drts-dev-smtp-username
```

六個 secret 的 `createTime`（只讀中繼資料，未讀值）：

| Secret                              | createTime (UTC)              |
| ----------------------------------- | ----------------------------- |
| `drts-dev-smtp-host`                | `2026-10-01T13:20:19.467414Z` |
| `drts-dev-smtp-port`                | `2026-10-01T13:20:24.996042Z` |
| `drts-dev-smtp-username`            | `2026-10-01T13:20:30.474922Z` |
| `drts-dev-smtp-password`            | `2026-10-01T13:20:36.021498Z` |
| `drts-dev-smtp-from-email`          | `2026-10-01T13:20:41.355884Z` |
| `drts-dev-smtp-recipient-allowlist` | `2026-10-01T13:20:46.982049Z` |

`gcloud run services describe drts-dev-api --project drts-dev-devcc-20260825 --region us-central1
--format="json(spec.template.spec.containers[0].env)"` 證實目前已部署的修訂版本
（`drts-dev-api-00037-qx9`）實際掛載全部六個 secret 作為 `REMOTE_SMTP_HOST/PORT/USERNAME/PASSWORD/
FROM_EMAIL/RECIPIENT_ALLOWLIST`，並設定 `NOTIFICATION_FROM_EMAIL`（同指向 `drts-dev-smtp-from-email`）
與 `NOTIFICATION_OUTBOX_TYPE=postgres`（確認 `.github/workflows/deploy-dev.yml` 的 `smtp_secret_count -eq 6`
分支已實際觸發，而非只是程式碼存在）。部署環境同時回報 `DRTS_CANDIDATE_SHA=ddd0d786afeeefc9da65a3a75815e734f4c3cbc3`。

這證明：(a) Remote SMTP 設定確實已以全部六個必要 secret 的形式配置在 dev 的真實 Cloud Run 服務上；
(b) 耐久 PostgreSQL outbox（而非 Cloud Run 本地磁碟）確實被選用。**未驗**：secret 的實際值（主機、帳密、
寄件地址、allowlist 內容）本 session 無法讀取，因此無法獨立核對它們是否為一組可用、未過期的真實憑證——
只能證明「已配置」，不能證明「配置值正確可用」。

### 2.2 `live_candidate_sha` — 有真實證據

`gh run list --repo ajoe734/drts-fleet-platform --limit 20` 顯示最近一次 `Deploy — Dev`（`workflow_dispatch`）
於 `2026-10-02T00:31:47Z` 完成，結論 `success`，耗時 19m33s；`gcloud run services describe drts-dev-api`
回讀到的 `DRTS_CANDIDATE_SHA` 與該時間窗吻合，值為 `ddd0d786afeeefc9da65a3a75815e734f4c3cbc3`——
與本文件 §1 記錄的、`origin/dev` 目前 HEAD（`SR-MAIL-SCHEDULER-PROVISION-20261001` 的 merge commit）完全一致。
即目前部署在 dev 的 candidate 正是郵件四個相依任務（remote SMTP、retry schedule、delivery readback、
scheduler provision）全部落地後的最新 `origin/dev` commit，不是歷史快照。

### 2.3 Cloud Scheduler 佈建 — 已建立，但真實觸發持續失敗（新發現的 live 缺陷）

```
$ gcloud scheduler jobs list --project drts-dev-devcc-20260825 --location us-central1 \
    --format="table(name,schedule,state,httpTarget.uri)"
ID                                       SCHEDULE     STATE    URI
drts-dev-approval-timeout-reminders-run  */5 * * * *  ENABLED  https://drts-dev-api-r6ykdme3wa-uc.a.run.app/api/internal/scheduled-tasks/approval-timeout-reminders/run
drts-dev-mail-outbox-drain               * * * * *    ENABLED  https://drts-dev-api-r6ykdme3wa-uc.a.run.app/api/internal/scheduled-tasks/mail-outbox/drain
```

兩個 job 確實存在、`ENABLED`，`httpTarget.oidcToken.serviceAccountEmail` 為
`drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com`，`audience` 為部署服務的實際 URL——
佈建本身（`SR-MAIL-SCHEDULER-PROVISION-20261001` 宣稱的「讓郵件重試與簽核逾時提醒實際被 Cloud Scheduler 觸發」）
確實發生。但連續三次重新查詢 `drts-dev-mail-outbox-drain` 的最近一次真實觸發結果：

| 查詢時間 (UTC) | `lastAttemptTime`             | `status.code` |
| -------------- | ----------------------------- | ------------- |
| 00:59:45       | `2026-10-02T00:58:00.219179Z` | `2`           |
| 00:59:46       | `2026-10-02T00:59:00.883562Z` | `2`           |
| 01:02:xx       | `2026-10-02T01:02:00.745906Z` | `2`           |

`drts-dev-approval-timeout-reminders-run` 於 00:59 查詢時同樣回報 `lastAttemptTime=2026-10-02T00:55:05Z`、
`status.code: 2`。`google.rpc.Code` 的 `2` 是 `UNKNOWN`（非 `0`／`OK`）；Cloud Scheduler 的 `Job.status` 欄位
只在**最近一次嘗試未成功**時才會被序列化輸出，因此三次間隔一分鐘的連續查詢都回報非 `0` 的 `status.code`，
代表這不是單一偶發的 token 時序問題，而是每分鐘都在失敗的持續狀態。

本 session 的 `gcloud logging read`（不論 filter 內容）一律被 broker 擋下為 `classified as defer`，
`gcloud auth print-identity-token --impersonate-service-account=drts-dev-scheduler@...` 也因
`john.lin@dev.cctech-support.com` 沒有 `roles/iam.serviceAccountTokenCreator` 而 `PERMISSION_DENIED`，
因此本 session 無法直接讀到 HTTP 回應本文或結構化錯誤訊息來百分之百坐實根因。但靜態讀碼可提供高度吻合、
可驗證的根因鏈，供 Supervisor 指派修復子任務時參考，不是臆測：

1. `drts-dev-mail-outbox-drain` 與 `approval-timeout-reminders-run` 兩個 controller 方法
   （`apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:239,281`）要求
   `identity.realm === "system"`；`auth.policy.ts:931-959` 把它們的 `allowedRealms` 鎖定為僅 `["system"]`。
2. Cloud Scheduler 原生 OIDC 一律以標準 `Authorization: Bearer <google-id-token>` 呈現，命中
   `bootstrap-auth.guard.ts:360-411` 的 JWT fast-path；因為這不是本服務自己簽發的 JWT，`payload` 一定是
   `null`，於是落入 `tryGoogleWorkloadIdentityFallback`（`bootstrap-auth.guard.ts:664-702`），轉呼叫
   `GoogleWorkloadIdentityAdapter.verifyServicePrincipal`（`google-workload-identity.adapter.ts:185-`）。
3. `verifyServicePrincipal` 要求呼叫端的 Google service account（此處即
   `drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com`）必須先被登記在
   `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` 指向的 registry（`drts-dev-workload-identity-google-service-principals`
   secret）裡，且登記項目的 `routeScopes` 必須涵蓋被呼叫的路由（`matchesScope`）。`gcloud secrets versions list
drts-dev-workload-identity-google-service-principals` 顯示該 secret 只有 **version 1，`createTime
2026-10-02T00:30:49Z`**——比兩個 scheduler job 的 `userUpdateTime`（`drts-dev-mail-outbox-drain` 為
   `2026-10-02T00:31:21Z`，由同一次 deploy run 寫入）早約 30 秒，是同一次 deploy pipeline 產物，但**沒有任何
   證據顯示這次登記內容包含 `drts-dev-scheduler@...` 本身**——該 registry 原始設計意圖（見
   `SEC-INTERNAL-KEY-WIF-MIGRATION-20260930`／`SEC-INTERNAL-KEY-WIF-PROXY-REPLAY-20261001`）是替換
   `INTERNAL_KEY_EXCP_002` 的既有代理呼叫者，而非 Cloud Scheduler 本身的觸發身分。
4. 即使該 principal 確實被登記，`verifyServicePrincipal` 預設 `enforceReplayProtection: true`
   （`tryGoogleWorkloadIdentityFallback` 呼叫時未覆寫此選項，對照同檔案第 196 行註解：只有
   `InternalKeyMiddleware` 的一般代理呼叫路徑才明確傳入 `false`，理由是「Cloud Run metadata server 對同一
   驗證窗口內的重複呼叫會重複使用同一份 assertion」）。Google 為 Cloud Scheduler 簽發的 OIDC token 在其
   有效期（約 1 小時）內，同一來源重複觸發极有可能重複使用同一份已簽發 token；若是如此，同一 token 的
   第二次（含以後）觸發會命中一次性使用帳本而回報 `WORKLOAD_ASSERTION_REPLAYED`（409）——與「每分鐘持續
   失敗、不是只失敗一次」的實測現象相符。

這兩個可能性（principal 未登記 → 403 `WORKLOAD_PRINCIPAL_NOT_REGISTERED`／`WORKLOAD_ROUTE_SCOPE_DENIED`；
或 token 重用 → 409 `WORKLOAD_ASSERTION_REPLAYED`）都會讓 `tryGoogleWorkloadIdentityFallback` 回傳 `null`，
使 guard 以原本的 `JWT_INVALID`（401）拒絕，Cloud Scheduler 側只看到非 2xx，記錄為 `status.code: 2`。
**這代表 `SR-MAIL-RETRY-SCHEDULE-20261001` 與 `SR-MAIL-SCHEDULER-PROVISION-20261001` 宣稱的「讓郵件重試
與簽核逾時提醒實際被 Cloud Scheduler 觸發」目前在 dev 上並未穩定達成：排程本身存在、指向正確端點，但真實
觸發仍會失敗。**

**2026-10-02T01:05Z Supervisor 確認（讀自 `ai-status.sh show SR-LIVE-MAIL-001` 的 `integration_notes`，
非本輪自行臆測）**：此缺陷已有獨立 task ID `SR-MAIL-SCHEDULER-TOKEN-REUSE-20261002`，Supervisor 原話
「about half the scheduler drain triggers return 401」。「約一半」而非「全部」失敗，與 principal 完全未登記
（會導致每次都 403／401、不會有約一半成功）的解釋不符，而與上面第 4 點的 token 重用／重放假說高度吻合——
Google 為同一來源簽發的 OIDC token 在有效期內可能被重複使用，第一次消耗掉一次性使用帳本後，同一 token 的
後續觸發即被 `WORKLOAD_ASSERTION_REPLAYED` 拒絕並映射為 401，直到 Google 簽發新 token 後才又能成功一次，
形成「約一半成功、一半失敗」的間歇模式。Supervisor 同時指示：「Build and run the harness now, but collect
the automatic-retry evidence only after that fix is deployed; record it as pending until then instead of
claiming it」——即本任務仍可／應該建置並執行 harness，但排程觸發的自動重試證據要等 `SR-MAIL-SCHEDULER-
TOKEN-REUSE-20261002` 修好後才能宣稱通過；本 runner 的同步送信（`POST tenant/users` 當下即呼叫
`NotificationDeliveryService.dispatch`，見 `SR-MAIL-DELIVERY-READBACK-20261001` 的「enqueue 成功、dispatch
失敗」分析）不依賴排程，不受此缺陷阻擋。

本任務的 write_scopes 不含 `bootstrap-auth.guard.ts`／`google-workload-identity.adapter.ts`／WIF registry
內容，依「只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope」的指示，這裡不嘗試修復，只如實記錄並
在 §4 標註 task ID，交由 `SR-MAIL-SCHEDULER-TOKEN-REUSE-20261002` 的 owner 修復。

### 2.4 `provider_message_receipts` 的讀回基礎設施 — 已部署；需要實際跑一次 hosted run 才有真實收據

`GET tenant/mail-deliveries/:deliveryId`（`SR-MAIL-DELIVERY-READBACK-20261001`，#2260 已 merge 進
`ddd0d786a` 所在的 `origin/dev`）已部署且可讀回 `MailDeliveryReceiptView`（`status`/`attempts[].outcome`/
`attempts[].errorCode`/`attempts[].acknowledgement.providerMessageId`，見
`packages/contracts/src/index.ts:2707-2726`）。`TenantInvitationDeliveryService.deliver()`
（`tenant-invitation-delivery.service.ts`）在 `POST tenant/users` 當下即同步呼叫 `enqueue()`／`dispatch()`，
不是只靠 §2.3 的排程 drain 才會送出——這點已由 `SR-MAIL-DELIVERY-READBACK-20261001` 的「enqueue 成功、
dispatch 失敗」測試案例證實（見該任務 round 2 記錄）。因此即使 §2.3 的排程缺陷尚未修復，本輪新增的
runner（§3）走的是這條同步路徑，理論上不受阻擋；但本 session 本身沒有網路權限可以直接呼叫已部署的
`https://drts-dev-api-r6ykdme3wa-uc.a.run.app`（VM 限制、且沒有 WIF 模擬權限，見 §5），所以**尚未在本輪
實際執行過一次真實送信＋readback**，`provider_message_receipts` 仍待一次 hosted workflow run 的真實輸出
才能坐實為「通過」。

### 2.5 `authorized_test_mailbox` — 信箱與別名資源已由 operator 建立；本輪尚未實跑驗證

`gh variable list`／`gh secret list` 在本 repo 層級找不到 `DRTS_LIVE_MAIL_*`（仍需 Supervisor／operator
建立對應 GitHub repo variables，見 §3 的 workflow 需求清單），但**實際的信箱資源本身已經存在**——這不是本
session 自己查到的，是讀 `ai-status.sh show SR-LIVE-MAIL-001` 回傳的 `integration_notes` 欄位（Supervisor
2026-10-01／2026-10-02 兩次更新，只讀，machine truth）得知：

- `drts-dev-smtp-recipient-allowlist` secret 的 **version 2**（`2026-10-02T00:30:39Z`，由 user 執行別名腳本
  建立，Supervisor 本身未讀值）在 version 1（sender 信箱本身）之外，新增了 sender 信箱的 `+invite` 與
  `+approve` 別名（Gmail plus-addressing）——即 `<sender>+invite@...` 與 `<sender>+approve@...` 現在都在
  allowlist 內，且兩者收到的信都進同一個真實信箱（sender 信箱本身），用來分流邀請流程與簽核流程的測試信件。
- 這組別名位址由 `drts-dev-smtp-username` secret 衍生（同一帳號），讀取內容需要 IMAP 連到
  `imap.gmail.com:993`，用同一組 `drts-dev-smtp-username`／`drts-dev-smtp-password`，只能在 hosted runner
  內透過 WIF 認證後以 `gcloud secrets versions access` 取得並立即 masked，不可在此 session 讀取或印出。
  Supervisor 的筆記明確要求：只能讀 `[Gmail]/All Mail`（因為寄給自己的信可能只有 Sent／Inbox 其中一個
  label）、絕不可對 allowlist 內其他位址（屬於 user）發信、絕不印出 allowlist／信箱密碼／session token／
  invitation token。
- `deploy-dev run 36946449389`（`ddd0d786a`，revision `drts-dev-api-00037-qx9`，00:44:52Z 啟動）掛載的就是
  這個 version 2 allowlist，與 §2.2 記錄的 live candidate 一致——換言之，**當前部署的 candidate 已經在用
  含有這兩個別名的 allowlist**，不是舊版。

**本輪已完成、未完成的部分**：

- 已完成：§3 新增的 `session-bootstrap.ts` 落實了 Supervisor 筆記裡描述的真實 session 取得流程（WIF 鑄造
  Google ID token → `POST auth/token` 的 CI tenant-actor 授權 → `POST identity/step-up-proofs` 取得
  `tenant:users:create` 的 step-up reference），`mail-acceptance-runner.ts` 則用這組真實 session 呼叫
  `POST tenant/users` 送信給授權別名、輪詢 readback，並新增一組「寄給 allowlist 外位址」的負向案例驗證
  `SMTP_RECIPIENT_NOT_ALLOWLISTED` 確實被記錄（不實際發信，因為 transport 在送網路前就擋下）。修正一版：
  授權收件地址不再是手動填入的 repo variable，改由 `session-bootstrap.ts` 在 hosted runner 內以 WIF 認證後
  讀取真實 `drts-dev-smtp-username` secret（立即 masked）、用新函式 `deriveAliasRecipient` 衍生
  `<username>+invite@...` 別名並寫入 `GITHUB_ENV`——完全比照 Supervisor 筆記「the hosted runner derives the
  alias addresses from drts-dev-smtp-username」的原話，而不是另外存一份明文地址當 repo variable。負向案例的
  收件地址固定為 RFC 2606 保留網域（`reserved.invalid`），不需要任何授權，也不需要 repo variable。
- **未完成**：實際讀信箱內容（IMAP `[Gmail]/All Mail` 搜尋＋確認真實送達內容，Supervisor 筆記裡「兩種流程
  收到真內容」的那一半）本輪**沒有實作**——理由不是資源不存在（§2.5 已證明存在），而是這段程式只能在 hosted
  runner 內用真實 IMAP 連線驗證，且新增 IMAP 用戶端在目前 write_scopes（不含 `package.json`／
  `pnpm-lock.yaml`）下只能靠 Node/Python 內建模組手刻協定，而手刻、從未在本 session 實際連過真實 Gmail
  IMAP 伺服器驗證過的網路協定程式碼風險偏高；建議下一輪由 Supervisor 決定是走「擴 scope 加入 vetted IMAP
  套件（如 `imapflow`）」或「這一輪先用 provider 回執／readback API 作為 `authorized_test_mailbox` 的
  configured 證據，實際信箱內容讀取另開 follow-up」。本輪同樣沒有實作 approval 流程（C026，見 §4 的端點
  追溯）與 C079（發票信，產品本身無寄信路徑，記錄為不在範圍內，比照 integration_notes 原話）。
- 本輪已將六個所需 repo variables 實際建立並以 `gh variable list` 核對（`DRTS_LIVE_MAIL_TEST_AUTHORIZED=true`、
  `DRTS_LIVE_MAIL_ALLOWED_TARGETS`／`DRTS_LIVE_MAIL_API_ORIGIN=https://drts-dev-api-r6ykdme3wa-uc.a.run.app`、
  `DRTS_LIVE_MAIL_TEST_TENANT_ID=10000000-0000-0000-0000-000000000201`、
  `DRTS_LIVE_MAIL_TENANT_ACTOR_ID=10000000-0000-0000-0000-000000000901`、
  `DRTS_LIVE_MAIL_INVITATION_ROLE_CODE=tenant_viewer`，對照 `TENANT_ROLE_CATALOG` 選最低權限的 assignable
  角色）；`DEV_GCP_PROJECT_ID` 已預先存在，不需新建。
- 嘗試以 `gh workflow run live-mail-acceptance.yml --ref claude/sr-live-mail-001` 實際 dispatch 一次，
  回應 `HTTP 404: workflow live-mail-acceptance.yml not found on the default branch`——這是 **GitHub
  Actions 平台本身的限制**，不是本任務資源或授權缺口：`workflow_dispatch` 可觸發的 workflow 必須先存在於
  repo 的 default branch（本 repo 是 `main`）才能被 API／CLI dispatch，即使指定 `--ref` 到其他分支也一樣；
  這與本文件 §2 其餘「尚未取得授權」的缺口性質不同，是**平台固有順序限制**：本 workflow 檔案要等這個
  candidate 完成正常的 review／CI／merge 流程、進到 `main`（經 `dev` → hourly promote）後，才能真正被
  dispatch 一次並產生 `authorized_test_mailbox`／`provider_message_receipts` 的真實 pass/fail 證據。
  在那之前，即使 repo variables 都已就緒，也無法實際執行；不冒充已驗證。

## 3. 本輪新增的驗收骨架（不含功能行為變更）

比照 `SR-LIVE-ENTRY-MAP-RUNNER-001`（`tests/e2e/system-remediation/sr-live-entry-001/entry-acceptance-runner.ts`、
`tests/e2e/system-remediation/sr-live-map-001/session-bootstrap.ts`、
`.github/workflows/live-entry-map-acceptance.yml`）的既有模式新增：

- `tests/e2e/system-remediation/sr-live-mail-001/session-bootstrap.ts`：`validateMailSessionInputs` +
  `mintTenantAdminSession`（純函式，依賴注入 `fetch`／`readGoogleIdToken`／`mask`，自身不碰網路）+ `main()`
  （真實實作，用 `gcloud auth print-identity-token --impersonate-service-account` 等效的 WIF 身分鑄造
  Google ID token，僅在直接執行時運行）。流程：鑄造的 Google ID token 帶 `x-drts-google-id-token` 呼叫
  `POST auth/token`（CI tenant-actor 授權，`google-workload-identity.adapter.ts:508-531`
  `isCiTenantActorGateEnabled`／`resolveCiTenantActorGrant`，走的是與 §2.3 排程缺陷**不同**的 registry
  授權路徑：`auth.controller.ts:436-510`，不經過 `tryGoogleWorkloadIdentityFallback`）→ 以 `auth/session`
  核對身分確實是請求的 `tenant_admin` actor → `POST identity/step-up-proofs` 取得 `tenant:users:create`
  的 `stepUpReference`（dev 環境 `tenant_admin` 的 `amr: ["tenant_bootstrap_fixture"]` 落在
  `trusted-mfa.policy.ts` 的 `NON_STRICT_TRUSTED_AMR`，`hasTrustedMfa` 可過；已用程式碼引用核對，非執行驗證）。
  任一步失敗即 fail-closed，錯誤訊息不外洩憑證內容。
- `tests/e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner.ts`：`validateMailRunnerInputs` +
  `runMailAcceptance`（純函式，依賴注入 `issueInvitation`／`pollDeliveryReceipt`）+ `main()`（真實 `fetch`
  實作）。兩段流程：(1) 正向——`POST tenant/users`（帶 session-bootstrap 鑄造的 bearer token 與
  `x-drts-step-up-reference`，對授權別名 `DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT` 簽發邀請，觸發真實
  `NotificationDeliveryService` enqueue/dispatch）→ 核對部署的 `x-drts-candidate-sha` → 輪詢
  `GET tenant/mail-deliveries/:deliveryId` 直到 `status !== "queued"`，要求 `status === "sent"` 且
  `providerMessageId` 非空；(2) 負向——對 `DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT`（刻意選在 allowlist
  外的保留網域位址，不會真的發出網路送信）重複同一流程，要求 readback 的 `status === "failed"` 且
  `errorCode === "SMTP_RECIPIENT_NOT_ALLOWLISTED"`，證明 allowlist 閘門確實攔截而非被繞過。缺項、逾時、
  `skip`、SHA 不符、負向案例被誤判為成功，一律 fail-closed，不會靜默通過。
- `tests/unit/system-remediation/sr-live-mail-001/session-bootstrap.test.ts`：9 個測試，涵蓋必要環境變數
  缺失、Google ID token 缺失/格式錯誤、部署 SHA 不符、session 驗證回傳錯誤 actor／realm、無法取得 step-up
  proof（缺信任 MFA）、非 2xx 回應不洩漏細節。
- `tests/unit/system-remediation/sr-live-mail-001/mail-acceptance-runner.test.ts`：23 個測試，涵蓋：
  必要環境變數缺失/格式錯誤、`DRTS_LIVE_MAIL_TEST_AUTHORIZED` 必須精確等於 `"true"`、fixture/demo/example
  收件地址拒絕、非法負向收件地址拒絕、SHA 不符拒絕、非 2xx 拒絕、`deliveryId` 缺失拒絕（且不再呼叫
  readback）、逾時未達 `sent` 拒絕、`failed` 狀態拒絕、`sent` 但缺 `providerMessageId` 拒絕、負向案例被
  誤判為送達拒絕、負向案例失敗原因非 allowlist 閘門拒絕、evidence 不外洩 bearer token。
- `.github/workflows/live-mail-acceptance.yml`：`workflow_dispatch`，驗證 `candidate_sha` 為完整 40 碼、
  checkout 後核對 `git rev-parse HEAD` 與請求一致、安裝依賴、`google-github-actions/auth`（既有
  `DEV_WIF_PROVIDER`／`DEV_WIF_SERVICE_ACCOUNT`，與 `deploy-dev.yml` 同一組 WIF）、執行
  `session-bootstrap.ts`（寫 session token／step-up reference 進 `GITHUB_ENV`）、執行
  `mail-acceptance-runner.ts`、依 `run-status.json` gate（缺檔/非 `passed` 一律失敗，`skip` 不能當
  `passed`）、上傳 execution log／evidence／run-status 為 artifact。目前讀取的 `DRTS_LIVE_MAIL_*` repo
  variables 均未在本 repo 建立（§2.5），因此這個 workflow 目前手動 dispatch 會在 runner 的輸入驗證階段
  立即 fail-closed，不會冒充通過；一旦 Supervisor／operator 建立這些 variables，即可重新 dispatch 取得
  真實通過／失敗證據。

明確不在本輪範圍（已具體追溯端點，供下一輪接手，不是模糊的「之後再做」）：

- IMAP 讀信內容驗證（`authorized_test_mailbox` 的「真內容」半邊）：見 §2.5，需要 Supervisor 決定 IMAP
  套件 scope 擴充與否。
- 簽核（approval）流程：`POST tenant/approval-rules`（建立 active rule）→
  `POST tenant/bookings`（`idempotency-key` header，觸發 `new_request` 通知給 active approvers）→
  `POST ops/approval-requests/:id/approve`／`reject`（觸發決議通知）→
  `GET audit` 的 `approval_notification.*` 列出 `recipients[].deliveryId`（`audit-notification.service.ts`，
  已存在、未變更）。
- C079（發票信）：產品本身目前沒有寄信路徑，依 integration_notes 原話記錄為不在本任務範圍。

### 已執行的指令與結果（本 worktree，2026-10-02）

| 指令                                                                                                                                                                                                                                         | Exit          | 結果                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/`                                                                                                                                                                       | 0             | 2 files / **32 tests passed**（`mail-acceptance-runner.test.ts` 23、`session-bootstrap.test.ts` 9）                                                                            |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-map-001/ tests/unit/system-remediation/sr-live-entry-001/ tests/unit/system-remediation/sr-live-mail-001/ tests/e2e/system-remediation/shared/`（既有 live-acceptance 骨架回歸） | 0             | 9 files / **116 tests passed**，確認新檔未影響既有 entry/map runner 與 shared recorder                                                                                         |
| `pnpm exec tsc --noEmit --project tsconfig.json --skipLibCheck`                                                                                                                                                                              | 1             | 27 個既有錯誤，**全部位於本任務未觸碰的檔案**（`@drts/ui-tokens`/`@drts/api-client` 本機建置產物缺失、`sr-qa-ux-001` 既有 `style` possibly-undefined）；新增的四個檔案均無錯誤 |
| `pnpm exec eslint --max-warnings=0 tests/e2e/system-remediation/sr-live-mail-001/ tests/unit/system-remediation/sr-live-mail-001/`                                                                                                           | 0             | 無警告                                                                                                                                                                         |
| `pnpm exec prettier --check` → `--write`（四個新檔＋workflow yml）                                                                                                                                                                           | 0（write 後） | 已套用專案格式                                                                                                                                                                 |
| `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/live-mail-acceptance.yml'))"`                                                                                                                                               | 0             | YAML 可解析                                                                                                                                                                    |
| `git diff --check`                                                                                                                                                                                                                           | 0             | 無 whitespace 錯誤                                                                                                                                                             |

`pnpm exec playwright test -c playwright.system-remediation.config.ts sr-live-mail-001` **未執行**：
本 session 的 VM 限制明確禁止該命令與任何 browser/E2E server/Docker；本任務的真實送達驗證不需要瀏覽器，
故 `.github/workflows/live-mail-acceptance.yml` 本身也未安排 Playwright 步驟。

## 4. Finding / required_acceptance 對照（§0.7）

| Finding／驗收項                                                                     | 原始碼依據與修改位置                                                                                                                                                                                        | 本輪結果                                                                                                                    | 命令、退出碼與證據                                                                                    | 未驗項與責任歸屬                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configured_mail_provider`                                                          | `deploy-dev.yml` 的 `api_secrets` SMTP 區塊；`drts-dev-api` 已部署修訂版本的環境變數                                                                                                                        | **有真實證據**：六個 secret 均存在且掛載，`NOTIFICATION_OUTBOX_TYPE=postgres`                                               | §2.1 的 `gcloud secrets list/describe`、`gcloud run services describe` 均 exit 0                      | 未核對 secret 值本身（本 session 無讀值權限）；未證明這組憑證可成功完成一次真實 SMTP AUTH                                                                                                                                   |
| `live_candidate_sha`                                                                | `deploy-dev.yml`；`gh run list`；部署環境 `DRTS_CANDIDATE_SHA`                                                                                                                                              | **有真實證據**：`ddd0d786a`，與 `origin/dev` HEAD 一致                                                                      | §2.2，`gh run list`/`gcloud run services describe` 均 exit 0                                          | 本文件 candidate（分支 commit）尚未部署；不得沿用 `ddd0d786a` 的 CI/merge 證據當作本文件 candidate 的 CI/merge                                                                                                              |
| `authorized_test_mailbox`                                                           | `drts-dev-smtp-recipient-allowlist` secret version 2（`+invite`／`+approve` 別名）；`deploy-dev run 36946449389` 掛載此版本                                                                                 | **信箱／別名資源已由 operator 建立且已部署；repo variables 本輪已建立**，**但 GitHub 平台限制擋下實際 dispatch**（見 §2.5） | §2.5；§3 的 runner／session-bootstrap 本機 unit test 37/37 通過；`gh variable list` 核對 6 項均已建立 | 需本 candidate merge 進 `main` 後才能真正 dispatch `.github/workflows/live-mail-acceptance.yml`；IMAP 真內容讀取本輪未實作（§2.5 說明與建議）                                                                               |
| `provider_message_receipts`                                                         | `TenantPartnerService.getMailDeliveryReceipt`；`GET tenant/mail-deliveries/:deliveryId`                                                                                                                     | **基礎設施已部署，readback 路徑不依賴 §2.3 排程缺陷**，但本輪尚未實際執行過一次真實送信＋readback（平台限制，見上）         | §2.4；readback 端點程式碼與型別存在於已部署 `ddd0d786a`                                               | 需本 candidate merge 進 `main` 後才能 dispatch `.github/workflows/live-mail-acceptance.yml`，才有真實 `sent`+`providerMessageId` 可讀回                                                                                     |
| `SR-MAIL-SCHEDULER-TOKEN-REUSE-20261002`（Supervisor 已登記的現行缺陷，非本輪發起） | `bootstrap-auth.guard.ts:664-702` `tryGoogleWorkloadIdentityFallback`；`google-workload-identity.adapter.ts:185-` `verifyServicePrincipal`；`drts-dev-workload-identity-google-service-principals` registry | **未執行 live 修復**，本輪補上程式碼層級根因鏈（§2.3）佐證 Supervisor「about half ... return 401」的觀察，與重放假說吻合    | §2.3：三次間隔查詢均 `status.code: 2`（非 `0`），`gcloud scheduler jobs describe` 均 exit 0           | 根因候選為重放保護誤判（Supervisor「about half」的描述與此一致）；需 Supervisor 擴 scope 到 `bootstrap-auth.guard.ts`／adapter／registry 才能修復；本任務 write_scopes 不含這些檔案；**不阻擋**本任務 runner 的同步送信路徑 |

## 5. 機器狀態與本 session 限制

`orchestrator_approval_broker` MCP 本 session 全程 `CONNECT_TIMEOUT`（[[project-orchestrator-hooks-intercept-interactive-sessions]]
模式延續）。影響範圍：`gcloud secrets versions access`（讀 secret 值）、`gcloud logging read`（任何 filter）
均被 broker 擋下為 `classified as defer`；`ai-status.sh` 的非 `show` 子指令同樣預期會被擋（本輪未逐一重試，
依該筆 memory 的既有指引：被擋下的寫入不會自行恢復，直接在最終文字回覆中如實回報，不反覆重試相同呼叫）。
`gcloud secrets describe/list`、`gcloud run services describe`、`gcloud scheduler jobs list/describe`、
`gh run list`、`gh variable list`、`gh secret list`、`git`、`pnpm exec vitest/eslint/prettier/tsc`、`Read`/
`Write`/`Edit` 全程正常，本文件的所有證據均來自這些正常管道。

本 session 沒有 `roles/iam.serviceAccountTokenCreator` 可以模擬 `drts-dev-scheduler@...` 身分，因此無法自行
發一個真實 OIDC token 去重現 §2.3 的確切 HTTP 回應碼／錯誤訊息；§2.3 的根因鏈是對照現行程式碼與可取回的
中繼資料得出的高度吻合推論，不是臆測，但在 Supervisor 指派修復前仍應視為「候選根因」而非「已confirmed的
唯一根因」。

## 6. 交接狀態

owner 不寫 `done` 或 `record-acceptance`。四個 required_acceptance 中兩項（`configured_mail_provider`、
`live_candidate_sha`）已有可取回的真實證據；`authorized_test_mailbox` 的信箱／別名資源已由 operator 建立
且已部署，repo variables 本輪也已建立；`provider_message_receipts` 的讀回基礎設施也已部署且不依賴 §2.3
的排程缺陷——但這兩項都還差最後一步：本 candidate 要先 merge 進 `main`，`.github/workflows/live-mail-acceptance.yml`
才能被實際 dispatch 一次，取得真實 pass/fail 輸出（見 §2.5 的 GitHub 平台限制說明）。本輪新增的 harness
（session 真實 mint、正／負向送信、readback、37 個 unit tests）已可直接使用，不需要再等下一輪重新設計。
本輪也補上了 `SR-MAIL-SCHEDULER-TOKEN-REUSE-20261002`（Supervisor 已登記的現行缺陷）的程式碼層級根因鏈，
供該任務的 owner 參考；此缺陷不阻擋本任務的同步送信路徑。

實作＋測試＋本文件 commit 後普通 push；candidate handoff 見下方 `CANDIDATE_SHA`／`CANDIDATE_BRANCH`，
交給 reviewer Claude2。獨立 review、同 candidate CI／merge 及完整 required_acceptance（含 merge 進 `main`
後實際 dispatch `.github/workflows/live-mail-acceptance.yml` 取得的 `provider_message_receipts` 真實通過
證據）到位後才可結案；IMAP 真內容讀取與 approval 流程留待下一輪（§3 已列出具體端點與建議）。
