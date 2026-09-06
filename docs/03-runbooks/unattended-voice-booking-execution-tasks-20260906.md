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

本波任務以 `eligible_agents=[Gemini,Gemini2,Claude,Claude2]` 進入控制面，owner／reviewer 跨 agy 與 Claude 配對。Gemini／Gemini2 是現有 agy lane，並非更改 provider 的名稱。容量由 supervisor 的有效配置控制，不由本 packet 另定副本。

2026-09-06 核對時 agy 兩 lane 各 2 slots、Claude 兩 lane 各 1 slot；Claude 兩 lane 共用帳號額度。依賴完成、健康狀態及主機資源仍影響實際同時工作數。已分配的正常主流程應由這四 lane 處理；新 UV helper／unblock 子任務也沿用偏好與 allowlist。

工具使用現有受鎖定的 task-board transaction 一次登錄完整 DAG，再放行可執行任務。不能先寫零散 backlog，因舊 dispatcher 對不存在的 dependency 可能按已歸檔處理。再次執行不能重設既有進度、candidate SHA、審查或完成證據。

所有改動先從最新合併基線建立獨立 worktree。owned-mobility 的交易、legacy writer、共用資源保留與需求映射按 manifest 排序；其他任務在不同模組並行。共用索引／控制器採最小補丁，先確認上一依賴已整合。migration 使用實際 head 配置新序號，不猜測固定版本號。

## 3. 任務定義與追溯

完整任務列於 manifest；其 `test_commands` 指向任務需新增或修改的驗證交付物，不宣稱那些檔案今天已存在。`fr_ids`／`ac_ids` 是覆蓋義務，驗證通過與可取回 evidence 必須另記錄。

<!-- TASK_TABLE_START -->

任務摘要由版本化 manifest 在本次交付時產生。

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

## 6. 外部條件與後续開通

`UV-EXEC-027` 可先唯讀盤點正式帳號／音訊協定／配額與營運資料；資料不足時保留具體 blocker，不能買帳號、猜 SLA 或把文件介紹當 account 能力。`UV-EXEC-028` 的 live PSTN 與 `UV-EXEC-029` 的試辦／正式開通需取得各自 gate evidence 才恢復。

正式測試所需的授權、測試電話與資料、司機／車輛隔離方式、逐語言門檻、並發 N、值班及回撥 SLA 都由 gate 收斂。每個無法滿足的外部條件有 owner、等待內容及恢復證據，不把整批工程退回模糊的「等真人確認」。
