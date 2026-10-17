# PAX-DESIGN-V2-20261015：AU-04 來源補稿路由

2026-10-15 建立；2026-10-17 續辦。現行 helper owner／reviewer：Codex／Pi
（Chairman 於本輪執行中更新 reviewer）；母任務仍由 Codex 實作、Codex2 審查。本文件只交付規劃與來源
補稿要求。下方 2026-10-15 的 Codex2／Codex、舊 release、PENDING 與 draft
描述保留為歷史，現況以文末「2026-10-17 續辦」及 current-release CLI 回讀為準。

## 決定與待辦

沿用原驗收，採取**原互動 Claude Design 來源補稿 → 原 owner 原樣匯入**的路徑。
AU-04 必須補齊空白、傳送中、傳送太頻繁三個實際 Email 畫框；保留現有
已填寫／格式錯誤與其餘 27 張畫板。規格已經要求這些狀態，補稿不需要新增產品
選擇。本 helper 沒有批准 scope cut，也沒有把 AU-02 的參考文字當成 AU-04 畫框。

Supervisor／Claude 應協調原互動設計來源的操作者交付新版本。原 owner 不得自行
修改唯讀來源、generator 或 immutable 匯入檔，也不應原封不動重送退修候選。
只有使用者另行明確變更狀態驗收邊界時，才可記錄新決定、來源與原要求的差異；
目前未找到這種決定。缺少的是設計交付，不是新的 OTP API 或費率決策。

母任務保持 `blocked`、`waiting_for: Claude`，以下兩項不減少也不授予驗收：

- `pax-design-v2_artboards_imported`
- `pax-design-v2_policy_text_aligned`

正式問題入口：[Q-PAX-DESIGN-V2-20261015](../../../PHASE1_OPEN_QUESTIONS.md#q-pax-design-v2-20261015--au-04-source-supplement)。
這是既有母任務的 follow-up，不另外建立未登記的實作任務。

## 原依據與 SRC-AU04 定位

已讀完整 task spec、共用規則、設計規格、原來源 generator／HTML、最新原 UAT
與 machine-truth 的完整首輪退修。母任務規格位於 canonical root 的
`.local/passenger-app-20261009/PAX-DESIGN-V2-20261015.md`，明訂原樣匯入、每個
ID 狀態符合設計規格，且禁止重畫匯入檔。`common.md` 記錄第一方乘客 App 決定；
[已接受的決策](../../../docs/01-decisions/SD-DP-20261009-001-first-party-passenger-app.md)
與 [SA／SD](../../../docs/02-architecture/passenger-app-20261009/01_system_sa_sd.md)
提供登入／BFF 邊界，不豁免畫板狀態。

- 首輪獨立退修：2026-10-15T11:31:19Z，reviewer Codex2，候選
  `8e20b183098674e75fe4ad2924f3b92dc88718c3`，generation
  `80009a7775814e5a8e92e680e0b85534`。本次不是第二輪退修。
- 最新 owner 證據 anchor：`2ebdcae50aa7c64f6a21ce0f2ef2a6f72aadd53e`，
  [PR #2657](https://github.com/ajoe734/drts-fleet-platform/pull/2657)；只是定位證據，
  不是修正版候選。沿用其
  [原 UAT 的 SRC-AU04](https://github.com/ajoe734/drts-fleet-platform/blob/2ebdcae50aa7c64f6a21ce0f2ef2a6f72aadd53e/docs/04-uat/passenger-app-20261009/PAX-DESIGN-V2-20261015.md#src-au04-首輪退修回應2026-10-15owner-codex)，
  不改寫母任務分支，也不覆蓋其既有驗證紀錄。
- 本 helper 基線：`abffadbbcba5fe236f4ae7b49ee59003910fd9b5`（當時 dev）。
  母任務的設計目錄／UAT 尚在未合併分支，上面的引用固定在其完整 SHA。
- 原來源根目錄：canonical root 下
  `.local/passenger-app-20261009/claude-design-20261015/`。
  `design-spec-20261010.md:82,84` 的 AU-04「同 AU-02」明訂空白、格式錯誤、
  傳送中、傳送太頻繁（稍後再試）。規格 SHA256：
  `dcd81a8b71b589f8cfc071fd9d697996019fb9f90f8226b7cac656c67cca64a2`。
- 實際來源鏈：`generator/au04.py` 的 `board(...)` 只傳入兩框 →
  `project/AU-04.dc.html:25` →
  [原樣匯入的 AU-04](https://github.com/ajoe734/drts-fleet-platform/blob/2ebdcae50aa7c64f6a21ce0f2ef2a6f72aadd53e/docs/05-ui/passenger-app-design-20261015/AU-04.dc.html#L25) →
  [README 的 AU-04 列及缺口說明](https://github.com/ajoe734/drts-fleet-platform/blob/2ebdcae50aa7c64f6a21ce0f2ef2a6f72aadd53e/docs/05-ui/passenger-app-design-20261015/README.md)。
  畫板頂部「沿用 AU-02 的樣式」沒有交付三個缺少的狀態。
- 來源、退修 SHA、owner anchor 的 AU-04 SHA256 相同：
  `c30a99cafab3ced8f5844337f3de4d8f50e4d0944abf0404748d4cc6a2647b38`。
  原 `canvas.json` SHA256：
  `593618160b2f0ecf6c1e12234e30068d27c4c44c0a31d49e0cec8bdb71a2aa58`。

正式 API 也已有對應能力：[RequestOtpCommand／Response](../../../packages/contracts/src/passenger-app.ts)
的 `provider: "email"`、`purpose: "login"`、`target`，經
[PassengerClient.requestOtp](../../../packages/passenger-client/src/client.ts) →
[PassengerOtpController.request](../../../apps/api/src/modules/passenger-app/otp/passenger-otp.controller.ts) →
[PassengerOtpService.request](../../../apps/api/src/modules/passenger-app/otp/passenger-otp.service.ts)。
service 已有 `429 too_many_requests`、60 秒冷卻及通用成功訊息；本 helper 僅讀碼，
未執行或修改 API，也不宣稱實際 UI／傳送已通過。

## 給原設計來源的補稿要求

| 項目               | 應交付內容                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AU-04 空白         | 實際 Email 輸入框與「傳送驗證碼」操作，呈現空白時的可操作狀態；沿用 AU-02 的正式樣式與既有 Email 元素。                                                               |
| AU-04 傳送中       | 獨立狀態畫框與「｜傳送中」標籤，呈現按鈕處理中／防重複送出的狀態。                                                                                                    |
| AU-04 傳送太頻繁   | 獨立畫框與對應標籤，顯示稍後再試，保留 Email 輸入，不洩漏帳號是否存在，不顯示技術錯誤碼。                                                                             |
| 既有正向與錯誤狀態 | 保留已填寫、格式錯誤、Email 鍵盤／欄位與 AU-03 銜接，不能用手機框或單純標籤替代 Email 畫面。                                                                          |
| 匯出與追溯         | 交付版本／日期、來源操作者、變更清單及新舊 SHA256；保留舊版本。必交 `AU-04.dc.html`；尺寸／索引變動時一併交付一致的 `canvas.json`，說明其餘 27 張是否仍逐位元組相同。 |

來源操作者應在原 Claude Design 環境核對補稿，附可檢視的交付版本。
worker 的靜態標籤／hash 檢查只證明檔案與狀態清單，不能替代實際畫框審查。
本 VM 不啟動任何 preview、browser、產品服務或 Docker。

## 母任務可恢復的下一步

1. Supervisor／Claude 先取得上述原來源補稿，記錄來源版本與處置；保持 Codex／Codex2
   分工與原 write scopes。既有範圍已允許原樣重新匯入；本 helper 不授權本地重畫。
2. 原 owner Codex 在原 worktree／PR #2657 分支保存既有 published history，將新來源
   原樣匯入；README 列真實標籤，原 UAT 的 SRC-AU04 續記新舊來源與逐檔 hash。
3. 重跑全部 29 檔 bytes／SHA256、28 HTML 標籤配對與 README 對照、規格要求的
   AU-04 四狀態及既有兩狀態回歸、50 舊 ID 映射、指定 policy grep；JSX 有變更時
   重跑 Babel。保留 policy 驗收、PM-04 重扣與 Geo BFF 已揭露的範圍限制。
4. 正常 commit／non-force push，核對 local／remote／PR head 完整 SHA 一致，
   對新 SHA 交 Codex2 獨立 review 與同 SHA CI；舊候選綠燈不沿用。原 acceptance
   keys 由原 lifecycle 處理，本 planning helper 不代為通過。

若補稿尚未交付，母任務繼續 blocked。若使用者明確改驗收邊界，先將決定與依據
寫入原規格／canonical planning、machine truth 與原 UAT，再安排 owner 下一步；
這不是目前已獲批准的替代驗收。

## Machine-truth 寫入與合併前置條件

只使用本次指定的 current-release CLI：

```text
/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-02057752bf15/tools/development-orchestrator/bin/ai-status.sh
```

以實際身份 `AI_NAME=Codex2` 執行 helper `start`／`progress`：exit 0。
嘗試 `note PAX-DESIGN-V2-20261015 <上述下一步>`：exit 1，
`Dispatched worker cannot mutate a different task`；嘗試以 `TASK_METADATA_JSON`
和 `assign <helper> Codex2 Codex` 寫入 disposition：exit 1，
`Dispatched workers must use their assigned task lifecycle commands`。
未移除 dispatch fence、冒用 Supervisor 或直接修改 state 檔。

Supervisor 必須透過其授權 CLI context 執行並回讀：

| 目標                                            | 必須保留／寫入                                                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本 helper，保留 Codex2／Codex                   | `resolved_parent_status: blocked`、`resolved_parent_waiting_for: Claude`、`resolved_parent_next`: 本節下方的完整下一步。`resolved_parent_at` 由 merge lifecycle 寫入，不能預填。 |
| 母任務，保留 Codex／Codex2 與兩 acceptance keys | `next` 改為相同下一步；保持 `status: blocked`、`waiting_for: Claude`，不因規劃 PR 恢復實作。                                                                                     |

**要落盤的下一步：** Supervisor／Claude 協調原互動 Claude Design 來源補交 AU-04
空白／傳送中／傳送太頻繁三個實際 Email 畫框，保留已填寫／格式錯誤與其餘 27 張；
交付版本及 AU-04、必要 canvas.json 的新舊 hash。無驗收 scope cut。收到可用版本
後原 owner Codex 於原 PR #2657 分支原樣匯入、續記原 UAT SRC-AU04／README，
重跑 29 檔 bytes/hash、28 HTML／狀態對照、50 舊 ID 與 policy grep，普通 push
新 SHA 交 Codex2。母任務保持 blocked／waiting_for Claude，保留兩 acceptance keys。

此 disposition 必須在 helper handoff／merge 前完成。
[Candidate lifecycle](../../../tools/development-orchestrator/skills/candidate-lifecycle.md)
要求 planning helper 保留後續阻塞；release `apply_unblock_parent_resolution`
缺省會使用 `todo`，因此不能在 metadata 缺失時交接，讓文件合併誤解封母任務。
本 worker 已把兩項所需寫入及 guard 結果記入 helper progress，等待 Supervisor gateway。

## Finding／驗收證據

本輪使用 Python 3.12.3 從實際規格 AU-02 列擷取必要狀態、確認 AU-04 的「同 AU-02」，
以 `git show <完整 SHA>:<path>` 讀取兩版匯入，逐檔和唯讀來源比較；未 reset 任何工作樹。
腳本及原始輸出位於 canonical root 的
`.local/pax-design-v2-unblock-planning-20261015/probe-source.py`、`probe-source.log`。
命令：`python3 /home/lupin/workspace/drts-fleet-platform/.local/pax-design-v2-unblock-planning-20261015/probe-source.py`。
兩版各 29 檔 bytes 一致；各版實際皆為 `['已填寫', '格式錯誤']`，缺少
`['空白', '傳送中', '傳送太頻繁']`。**exit 1 是成功定位既有缺陷，不是驗收通過。**

| Finding／驗收項                                     | 原始依據與本次修改                                          | 舊版 → 本輪結果／命令與證據                                                          | 未驗項或限制                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| SRC-AU04／母任務 `pax-design-v2_artboards_imported` | 原 spec、generator、兩 SHA 的 AU-04、原 UAT；本文件補稿要求 | 上述 probe 在退修 SHA 與 owner anchor 均重現缺三狀態，exit 1；29 檔 bytes 比較均通過 | Finding 仍 OPEN，沒有修正版來源或完整畫框驗收。其餘 HTML／README／舊 ID 前輪結果保留在原 UAT，本 helper 未重跑。 |
| 母任務 `pax-design-v2_policy_text_aligned`          | 原 UAT 的政策修正與已結束的舊 SHA CI                        | 本輪不改母任務任何檔案；未重跑政策／Babel／產品測試，也不繼承舊 CI                   | 新母任務 SHA 仍需新檢查／獨立 review。                                                                           |
| Resolve or route missing decision                   | 本文件、Q-PAX-DESIGN-V2-20261015                            | 模糊 planning blocker → 具體原來源補稿、協調人、原 owner 操作與恢復條件              | 原來源交付仍待協調，沒有新增產品決策。                                                                           |
| Record decision／scope cut／explicit follow-up      | 本文件「決定與待辦」及補稿表                                | 保留既有要求，明列 follow-up；無 scope cut                                           | 使用者變更驗收僅列合法備選，目前沒有批准。                                                                       |
| Task-scoped commit／push／PR evidence               | 僅本 artifact 與 open-question entry                        | 出版與已完成檢查在下節續記，最後完整 head 以 CLI／PR 回讀固定                        | Draft/checkpoint 不等於 candidate review、merge 或 parent acceptance。                                           |
| Update parent with concrete next step               | 上述兩個 release CLI 寫入嘗試、helper progress              | 兩次 exit 1；本 worker 只成功落盤 helper 的協調要求                                  | **PENDING**：Supervisor 寫入 parent next 與 helper disposition 並回讀前，這項 acceptance 未滿足。                |

本次為文件路由變更，採內容、引用、格式與既有 repo gates；未新增鏡像單元測試。
不執行 runtime、PG、browser、OAuth、簡訊、金流或部署；沒有宣稱這些驗收通過。

## 發布與完成的文件檢查

- Anchor `7cdfc20fb64ecce04bd16d38cacdf44bbac76ce0` 已普通 push 至
  `codex2/pax-design-v2-20261015-unblock-planning-decision`，exit 0。
  [Draft PR #2668](https://github.com/ajoe734/drts-fleet-platform/pull/2668)
  建立及 readback exit 0，base `dev`，建立時 PR head 等於該 anchor。
  本節證據另以 append-only commit、普通 push 保存；最終 local／remote／PR
  完整 head 以本 helper 的 CLI progress／blocker 記錄，不假裝已鎖 candidate。
- 在該 anchor 對固定 base `abffadbbcba5fe236f4ae7b49ee59003910fd9b5`
  執行 `python3 tools/ci/git/check_canonical_consistency.py --ci --base
abffadbbcba5fe236f4ae7b49ee59003910fd9b5 --head HEAD`：exit 0，四類零 findings。
- `python3 tools/ci/git/check_commit_trailers.py --base
abffadbbcba5fe236f4ae7b49ee59003910fd9b5 --head HEAD`：exit 0，anchor 一個 commit
  通過。`git diff --check abffadbbcba5fe236f4ae7b49ee59003910fd9b5...HEAD`：exit 0。
  證據 commit 後對完整範圍重跑；實際結果由 CLI closeout 記錄。
- `pnpm exec prettier --check
support/unblock/PAX-DESIGN-V2-20261015/PAX-DESIGN-V2-20261015-UNBLOCK-PLANNING-DECISION.md`：
  exit 0。`node tools/ci/check-repo-classification.mjs`：exit 0，6671 files。
  Node v22.23.2、pnpm 10.33.0；只對本 artifact 做格式化，既有 open-question 內容保留。
- `python3 /home/lupin/workspace/drts-fleet-platform/.local/pax-design-v2-unblock-planning-20261015/check-document-links.py`：
  exit 0。只改兩個 task-owned 文件；移除新增 Q entry 後，既有問題內容逐位元組相同；
  9 個本地引用及 3 個 immutable parent-revision 路徑全部存在。腳本／輸出均在同一
  `.local` 證據目錄，檢查實際路徑，未新增產品鏡像測試。
- Source probe SHA256：`af6971f4c5b6075246d45bf81e998394e6f13f7b6114385a5e757f83b8ca28ed`；
  輸出 SHA256：`c24d33d9387fd8f76facea4da7091b41bc34792985403593a36717a076251c12`。
  exit 1 的缺陷重現與 exit 0 的文件 gates 分開記錄。
- Anchor 前 `python3 tools/ci/git/check_staged_generated_files.py --staged`：exit 0；
  commit 使用 `HUSKY=0`，避免 lint-staged 自動重排既有 open-question 全文，
  generated-file guard 與本次文件／格式／trailer gates 手動執行。
- 所有本輪手動啟動的檢查皆已結束並讀取結果。產品測試／PG／browser／部署不適用此
  兩文件路由變更，沒有執行；hosted CI／獨立 review／merge 尚未授予本 helper 通過。
- PR 建立後的 release-CLI readback：helper 三個 `resolved_parent_*` 處置欄位仍為
  null；parent-next 寫入 acceptance 仍未滿足。需要 Supervisor 按上節執行與回讀，
  才能將本 helper 以最終完整 SHA handoff 指定 reviewer Codex。來源補稿和母任務驗收
  仍分開追蹤。未取得寫入前保留 draft PR，既不 handoff 也不呼叫 done。

## 2026-10-17 續辦：保留決策、確認處置與重新交審

本次為 helper 重派後的文件更新，不是母任務第二輪產品退修。沿用上面的
SRC-AU04 定位、補稿表與恢復步驟。沒有新產品決策、scope cut 或可用來源補稿；
保留原兩個 acceptance keys、原母任務 Codex／Codex2 分工及全部修正邊界。

### 現行 machine truth 與父任務下一步

使用本次指定 release：

```text
/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-4da15372d696/tools/development-orchestrator/bin/ai-status.sh
```

以 `AI_NAME=Codex` 執行本 helper `start`：exit 0。透過 `show` 單 task 回讀並
核對：parent `status: blocked`、`waiting_for: Claude`，helper
`resolved_parent_status: blocked`、`resolved_parent_waiting_for: Claude` 已存在；
parent `next` 與 helper `resolved_parent_next` 逐字相同，UTF-8 SHA256 為
`e74ea4eb0b804177ea66e8c0400d362a9f3386727996520c59106fcb16cca502`。
`resolved_parent_at` 未預填，parent 未取得 acceptance credit。

因此前輪「Supervisor 尚需寫入 parent next／helper disposition」的 PENDING
已由現行機器紀錄補足，不再是等待項。本輪未越過 worker fence 改父任務，也不
重設已正確的處置。**父任務下一步仍是 Supervisor／Claude 取得原操作者三框
補稿，然後由原 Codex 在 PR #2657 原樣匯入並交原 Codex2 審查。** 未取得補稿
前不得自動恢復父任務；helper 文件合併也不表示畫板或產品驗收完成。

### 最新證據與舊 CI 的結束狀態

已核對本次三份 `read_dependencies`：2026-10-16 的 Design terminal adoption、
Root context plan 均保留三框來源缺口及 blocked 處置；E04 reviewer 授權 packet
屬另一任務的待決權限，沒有授權本 helper 操作 E04 或縮減設計要求。

本輪重跑既有 `probe-source.py`：兩個原母任務 SHA 各 29 檔仍與唯讀來源 bytes
相同，AU-04 與 canvas hash 仍為上列原值。實際狀態仍只有已填寫／格式錯誤，
缺空白／傳送中／傳送太頻繁；exit 1 是既有缺陷重現，SRC-AU04 **仍 OPEN**。
已讀 generator `board(...)`、設計規格與原 UAT，並核對正式
`RequestOtpCommand` → `PassengerClient.requestOtp` →
`PassengerOtpController.request` → `PassengerOtpService.request`；本輪不改契約。

已讀 [舊 CI run 38811283734](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38811283734)：
attempt 2、head `e47dbd7faff42d37eed7d0a21a43701fcf1c8f90`、completed/cancelled；
unit cancelled，ci-integ failure，其餘 13 jobs success、2 skipped。unit annotation
明訂 `The job has exceeded the maximum execution time of 20m0s`。它已結束，
不能再記為等待中；逾時不等於產品斷言失敗，也不給此輪候選 CI 信用。本輪不重試
舊 run 或改 workflow／timeout／驗收。

### Finding／驗收與本輪證據

機器相關證據在 canonical root 的
`.local/pax-design-v2-unblock-planning-20261015/owner-resume-20261017/`。
完整新 candidate SHA、PR URL 與 local／remote／PR head 一致性由本輪 CLI handoff
固定；舊 PR #2668／e47 的 commits 完整保留在新分支歷史中，不 rebase／force push。
指定新分支為 `codex/pax-design-v2-20261015-unblock-planning-decision`，起點
`3186ed27eb176acadd7c25d7013d6a55a12ff783`；正常 merge anchor
`9c780fc91` 已 commit／普通 push，exit 0。本輪 review 由現行指定 Pi 執行，
不沿用舊 owner/reviewer 配對或 e47 的批准。

執行中 Chairman 在 `2026-10-17T00:39:32Z` 將 helper reviewer 從 Claude
改派 Pi，owner Codex 與 worker guard 保留；父任務仍由 Codex／Codex2 負責。
第一輪 final checks 的角色斷言偵測此改派而 exit 1，其餘 gates exit 0；完整失敗
結果保留 `checks-before-reviewer-update.log`。已依最新 machine truth 同步文件
及角色斷言，不修改舊 commits 或冒用 reviewer；重新檢查後才向 Pi handoff。

| Finding／驗收項                                | 原依據與修改位置                                              | 舊版 → 本輪結果／命令、退出碼、證據                                                                      | 未驗項與限制                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Resolve or route missing decision              | 原 spec、generator、原 UAT；本文件及 Q-PAX-DESIGN-V2-20261015 | 保留原來源補稿路徑，重讀來源與最新指定紀錄，無新決策                                                     | 原操作者尚未補稿，實際畫框審查待交付                                             |
| Record decision／scope cut／explicit follow-up | 本文件補稿表、恢復步驟與本節                                  | 明列原來源三框交付、版本/hash、原 owner 原樣匯入；無 scope cut                                           | 不授予父任務驗收信用                                                             |
| Update parent with concrete next step          | 已落盤 parent.next 及 helper disposition                      | `python3 <本證據目錄>/check-routing.py` exit 0；`routing.log`、兩份 show JSON，逐字相同且 SHA256 如上    | 父任務維持 blocked/Claude；不預填 resolved_parent_at                             |
| SRC-AU04／pax-design-v2_artboards_imported     | 退修 8e20b183、owner anchor 2ebdcae5、原來源                  | `python3 <上層證據目錄>/probe-source.py` exit 1；`source-probe.log`：兩版各 29 檔 bytes 一致，仍缺三狀態 | Finding OPEN，沒有修正版通過結果                                                 |
| pax-design-v2_policy_text_aligned              | 原 UAT 的政策與 PM-04／Geo 限制                               | 本輪只改兩個規劃文件，不改父任務；未重跑政策/Babel                                                       | 父任務新 SHA 仍需原回歸與獨立 review                                             |
| Task-scoped commit／push／PR                   | 已發布 e47、merge anchor 9c780fc91、本輪同路徑續記            | 正常 merge/commit/push 保留歷史；最終 SHA/PR 由 CLI handoff 回讀                                         | 新 candidate review、hosted CI、merge 由原 lifecycle/bus 收錄，pending 不算 pass |

本輪是兩份規劃文件變更，採引用、差異、格式、trailer 與 canonical consistency
檢查，完整命令／結果在本證據目錄及 CLI 交接摘要續記。不新增鏡像單元測試。
未啟動 VM runtime／browser／Docker，未執行 PG、外部 provider 或部署。

本輪已結束的文件檢查如下（Python 3.12.3、Node v22.23.2、pnpm 10.33.0）：

```bash
pnpm exec prettier --check support/unblock/PAX-DESIGN-V2-20261015/PAX-DESIGN-V2-20261015-UNBLOCK-PLANNING-DECISION.md
python3 /home/lupin/workspace/drts-fleet-platform/.local/pax-design-v2-unblock-planning-20261015/owner-resume-20261017/check-document-links.py
python3 tools/ci/git/check_canonical_consistency.py --ci --base 3186ed27eb176acadd7c25d7013d6a55a12ff783 --head HEAD
python3 tools/ci/git/check_commit_trailers.py --base 3186ed27eb176acadd7c25d7013d6a55a12ff783 --head HEAD
git diff --check 3186ed27eb176acadd7c25d7013d6a55a12ff783
node tools/ci/check-repo-classification.mjs
python3 tools/ci/git/check_staged_generated_files.py --staged
```

格式、引用、consistency、trailer、diff、classification 在 merge anchor 與本輪
工作檔核對均 exit 0：只含兩個 task-owned 路徑；去除 Q entry 後其餘問題 bytes
不變，9 個本地引用／3 個固定 SHA 路徑存在，四類 consistency 零 findings，
分類 6850 檔。anchor 前 generated-file guard 也 exit 0。正式提交後對新 HEAD
重跑相同 gates 並讀完，結果固定於 `checks-final.log`；若有失敗不 handoff。
commit 使用 `HUSKY=0` 避免自動重排共用 open-question 全文，手動執行原 guard
及上述適用 gates；不以此省略驗證。最終 head／PR 的精確 identity 不預填於本文件。
