# 無人語音叫車：Supervisor Execution Packet

- 日期／任務族：2026-09-06／`UV-EXEC-*`；任務化交付：`UV-DISPATCH-001`。
- 授權：[使用者要求任務化及執行的範圍](../01-decisions/SD-DP-20260906-013-unattended-voice-execution.md)。
- 需求：[SA v0.2](../02-architecture/phase1-unattended-voice-booking-sa-20260906.md)；技術：[SD v0.2](../02-architecture/phase1-unattended-voice-booking-sd-20260906.md)；修正依據：[兩輪盤點](../02-architecture/phase1-unattended-voice-booking-two-pass-audit-20260906.md)。
- 定義真值：[版本化 task manifest](../../tools/task-dispatch/manifests/unattended-voice-booking-20260906.json)。每項有 owner／reviewer、依賴、範圍、驗收、測試命令、FR／AC 對照、外部門檻與證據要求。
- 執行真值：正式 `ai-status.json`；`current-work.md`、dashboard 與 task briefs 由既有同步產生。本文件不保存容易過期的逐項 live status。

## 1. 執行目標與完成界線

正常即時電話叫車由 AI 完成，真人只處理例外。工程必須連通電話音訊、ASR／TTS、對話、地址與需求驗證、乘客確認證據、唯一建單、自動選車與司機接單、真實結果播報。現有 matching 或僅建單成功不能當成自動派車完成。

任務分為可在版本庫／隔離測試環境完成的工程、可立即進行的唯讀外部準備查核，以及需要正式電話與營運授權的驗收 gate。無帳號不阻擋 fixture 工程；fixture 成功不能作為真實電話的證據。SA 的 32 項 FR、48 項 AC 都必須有實作與驗收追溯；conditional 能力先驗證關閉時安全分流，未開通的寫入能力不能偷算已完成。

## 2. 派工與依賴規則

本波初始 owner 全部分派 Gemini／Gemini2（agy）及 Claude／Claude2，初始 reviewer 全部分派 Codex／Codex2。`eligible_agents` 包含這六條 lane，讓執行與審查都能派出；現有控制面沒有 per-role allowlist，因此這是實際初始指派與後續重派偏好，不是假稱已強制隔離角色。容量由 supervisor 的有效配置控制。

使用者在本次任務中指定 agy 兩 lane 各 3 slots、Claude 兩 lane 各 3、Codex 兩 lane 各 2；六 lane 名額合計 16，全機 execution／total 上限保持 12。Claude 兩 lane 共用帳號額度。Codex reviewer 指定 GPT-6 Astra／ULTRA，需核對 adapter 的 `--model` 與各 lane 的有效推理設定。模型以固定完整 Codex CLI 0.153.0 bundle 執行，各帳號繼承有效 `model_reasoning_effort=ultra`，兩帳號的新版 model catalog 均列出 Astra／ULTRA。詳見[模型設定與驗證](../04-uat/unattended-voice-execution-activation-20260906/codex-model-change-20260906.json)。設定變更及程序啟動證據見[本次容量紀錄](../04-uat/unattended-voice-execution-activation-20260906/capacity-change-20260906.json)。新 UV helper／unblock 子任務也沿用 agy／Claude 主實作、Codex 主審查的偏好；quota、依賴及主機資源會影響實際派工。

工具使用現有受鎖定的 task-board transaction 一次登錄完整 DAG，再放行可執行任務。不能先寫零散 backlog，因舊 dispatcher 對不存在的 dependency 可能按已歸檔處理。再次執行不能重設既有進度、candidate SHA、審查或完成證據。

所有改動先從最新合併基線建立獨立 worktree。owned-mobility 的交易、legacy writer、共用資源保留與需求映射按 manifest 排序；其他任務在不同模組並行。共用索引／控制器採最小補丁，先確認上一依賴已整合。migration 使用實際 head 配置新序號，不猜測固定版本號。

## 3. 任務定義與追溯

完整任務列於 manifest；其 `test_commands` 指向任務需新增或修改的驗證交付物，不宣稱那些檔案今天已存在。`fr_ids`／`ac_ids` 是覆蓋義務，驗證通過與可取回 evidence 必須另記錄。

<!-- TASK_TABLE_START -->

| Task          | 工作                                               | Owner   | Reviewer | 前置                                                                 | 初始安排       |
| ------------- | -------------------------------------------------- | ------- | -------- | -------------------------------------------------------------------- | -------------- |
| `UV-EXEC-001` | 建立無人語音契約、錯誤碼與能力目錄                 | Gemini  | Codex    | 無                                                                   | 依賴就緒可執行 |
| `UV-EXEC-002` | 遷移真正 runtime 表與語音持久化 schema             | Claude  | Codex2   | 001                                                                  | 依賴就緒可執行 |
| `UV-EXEC-003` | 落實 line scope、服務身份與 session capability     | Claude2 | Codex    | 001、002                                                             | 依賴就緒可執行 |
| `UV-EXEC-004` | 改造 Owned Mobility 交易與快照一致性               | Claude  | Codex2   | 002                                                                  | 依賴就緒可執行 |
| `UV-EXEC-005` | 封住 Callcenter、multi-taxi 與 callback 舊入口競態 | Claude2 | Codex    | 003、004                                                             | 依賴就緒可執行 |
| `UV-EXEC-006` | 所有派遣入口共用司機與車輛保留                     | Claude  | Codex2   | 004、005                                                             | 依賴就緒可執行 |
| `UV-EXEC-007` | Session 狀態機、有序事件與持久化控制權             | Claude2 | Codex    | 001、002、003                                                        | 依賴就緒可執行 |
| `UV-EXEC-008` | 建立 CTI adapter 與獨立媒體 worker 骨架            | Gemini  | Codex2   | 001、003                                                             | 依賴就緒可執行 |
| `UV-EXEC-009` | 本地停播、音訊時序與媒體控制權 fence               | Gemini2 | Codex    | 007、008                                                             | 依賴就緒可執行 |
| `UV-EXEC-010` | 雙向錄音 recorder 與不可變 checkpoint              | Gemini  | Codex2   | 002、005、008、009                                                   | 依賴就緒可執行 |
| `UV-EXEC-011` | TWM 語音 adapter 與國台客語言路由                  | Gemini2 | Codex    | 001、008、009                                                        | 依賴就緒可執行 |
| `UV-EXEC-012` | 受約束對話引擎、欄位修復及工具閘道                 | Claude2 | Codex2   | 003、007、011                                                        | 依賴就緒可執行 |
| `UV-EXEC-013` | 地址、商品、時區與乘車需求跨域落實                 | Claude  | Codex    | 001、004、006、012                                                   | 依賴就緒可執行 |
| `UV-EXEC-014` | 回讀、明確確認與 speech/DTMF 提交 gate             | Claude2 | Codex2   | 007、009、010、012、013                                              | 依賴就緒可執行 |
| `UV-EXEC-015` | 原子建單、命令 receipt 與掛斷後恢復                | Claude  | Codex    | 004、005、007、014                                                   | 依賴就緒可執行 |
| `UV-EXEC-016` | 自動選車、offer、司機接拒與安全逾時                | Claude2 | Codex2   | 006、013、015                                                        | 依賴就緒可執行 |
| `UV-EXEC-017` | 真人轉接 coordinator 與排隊控制權移交              | Claude  | Codex    | 007、009、012、015                                                   | 依賴就緒可執行 |
| `UV-EXEC-018` | 聯絡角色、經同意回撥與終態競態                     | Claude2 | Codex2   | 002、007、015、017                                                   | 依賴就緒可執行 |
| `UV-EXEC-019` | 客服例外工作台、追查與回撥操作                     | Gemini2 | Codex    | 003、015、017、018                                                   | 依賴就緒可執行 |
| `UV-EXEC-020` | 查單、重複來電及條件能力安全分流                   | Claude  | Codex2   | 003、012、013、015、017                                              | 依賴就緒可執行 |
| `UV-EXEC-021` | 資料保存、存取稽核、版本與緊急停用                 | Gemini  | Codex    | 003、010、015、017、018                                              | 依賴就緒可執行 |
| `UV-EXEC-022` | 全來電指標、完整成本 ledger 與告警                 | Gemini2 | Codex2   | 015、016、018、019、021                                              | 依賴就緒可執行 |
| `UV-EXEC-023` | 獨立媒體部署、持續背景工作及回退                   | Gemini  | Codex    | 008、009、015、016、018                                              | 依賴就緒可執行 |
| `UV-EXEC-024` | 真實 PostgreSQL 兩實例競態與故障驗收               | Gemini2 | Codex2   | 003、004、005、006、007、014、015、016、017、018、023                | 依賴就緒可執行 |
| `UV-EXEC-025` | 情境追溯、互動電話與比較評測 harness               | Gemini  | Codex    | 012、013、014、015、016、017、018、019、020、021、022、023           | 依賴就緒可執行 |
| `UV-EXEC-026` | 一個原生語音候選的公平對照 adapter                 | Gemini2 | Codex2   | 001、007、009、012、014、025                                         | 依賴就緒可執行 |
| `UV-EXEC-027` | 唯讀盤點供應商與營運準備證據                       | Gemini2 | Codex    | 無                                                                   | 依賴就緒可執行 |
| `UV-EXEC-028` | 真實 PSTN、逐語言、轉接與容量驗證                  | Gemini2 | Codex2   | 010、011、016、017、018、019、020、021、022、023、024、025、026、027 | 外部驗收 gate  |
| `UV-EXEC-029` | UAT、小量營運開通與回退驗證                        | Claude  | Codex    | 024、025、027、028                                                   | 外部驗收 gate  |

<!-- TASK_TABLE_END -->

## 4. Worker 必須遵守的驗收規則

- 先讀任務的 SA／SD 段落及兩輪 finding；新增工程不得倒退成正常逐單人工批准。
- 執行 task-specific 測試及實際變更需要的 typecheck／lint／migration／安全檢查；沒有選到測試不是通過，禁止使用 `--passWithNoTests` 冒充驗收。
- 真實 PostgreSQL suite 必須驗證兩實例競態、共同 transaction、crash／response loss、舊 timeout、新舊 API revision 及 voice／non-voice 資源競爭；mock repository 測試另外標示。
- 音訊證據區分 generated、sent、played、recorded；無法證明的 offset／取消／轉接結果記 unknown。DTMF 使用可信事件與回讀 binding，不虛構錄音中的 tone。
- 自動派遣結果使用真實 assignment／driver acceptance；未知結果先查 receipt，不盲目重試或報成功。
- 外部 gate 的 required_acceptance 必須有真實來源與同版本證據。chair 建 helper、解除 blocked 或程式 merge，均不能代替提供帳號、測試授權、PSTN 或營運驗收。
- 依既有 candidate lifecycle 提交、正常 push、同 SHA 審查、PR／CI／merge及必要 acceptance。正式開通前保持受控開關關閉；branch／merge／部署／電話驗收結果分開。

## 5. 登錄與核對流程

先將本 packet、manifest、工具及設計來源合併到 `dev`。工具只從已合併且內容相符的版本登錄，避免 task brief 指向 worker 基線讀不到的草稿。

```bash
python3 tools/task-dispatch/dispatch-unattended-voice-booking-20260906.py --dry-run
python3 tools/task-dispatch/dispatch-unattended-voice-booking-20260906.py --apply --source-ref origin/dev
python3 tools/task-dispatch/dispatch-unattended-voice-booking-20260906.py --verify
```

正式命令從本次合併來源執行，使用 git common root 或明確的 `AI_STATUS_ROOT`／`ORCH_STATUS_ROOT` 找到正在使用的 task board；不另建隔離假 board。工具本身不重啟 supervisor、不改全域 worker 數或其他任務。

登錄後必須查回任務總數、依賴、lane allowlist、來源 SHA 與外部 gate；再查 supervisor heartbeat、provider health、實際 worker/task 對應。若 runtime 產生 helper，核對其 owner/reviewer 與偏好；如需修正，使用正式精確 reassign，不改其他任務或全域 fallback。

## 6. 工具驗證

任務登錄器的 13 項隔離測試已通過，涵蓋單次交易、完整 DAG 後放行、失敗不發布、重跑保留證據、已歸檔任務不得重建、初始角色與合法 fallback。測試已接入現有 CI 的 orchestrator discovery：

```bash
python3 -m unittest discover -s tools/development-orchestrator -p 'test_unattended_voice_materializer.py'
```

實際 manifest dry-run 已驗證 29 tasks、32 FR、48 AC、27 個依賴就緒後可執行及 2 個初始外部 gate。這是登錄工具與規格驗證，不是無人叫車功能已完成。

## 7. 外部條件與後續開通

`UV-EXEC-027` 可先唯讀盤點正式帳號／音訊協定／配額與營運資料；資料不足時保留具體 blocker，不能買帳號、猜 SLA 或把文件介紹當 account 能力。`UV-EXEC-028` 的 live PSTN 與 `UV-EXEC-029` 的試辦／正式開通需取得各自 gate evidence 才恢復。

正式測試所需的授權、測試電話與資料、司機／車輛隔離方式、逐語言門檻、並發 N、值班及回撥 SLA 都由 gate 收斂。每個無法滿足的外部條件有 owner、等待內容及恢復證據，不把整批工程退回模糊的「等真人確認」。
