# SD-DP-20260906-013 無人語音叫車執行授權與範圍

## Decision Record

- `decision_id`: `SD-DP-20260906-013`
- `title`: `Materialize the audited unattended voice booking design for supervisor-managed execution`
- `owner`: `Repository owner / UV-DISPATCH-001`
- `date`: `2026-09-06`
- `status`: `accepted-for-execution`
- `approval`: 使用者在兩輪 SA／SD 盤點後，明確要求「把這些都 materialize 成 execution tasks，讓 supervisor 跟 auto worker 來執行」，並要求盡量交給 agy 與 Claude。此指示授權任務化及工程執行，不等同外部服務已採購或正式營運已驗收。
- `affected_docs`:
  - `docs/02-architecture/phase1-unattended-voice-booking-sa-20260906.md`
  - `docs/02-architecture/phase1-unattended-voice-booking-sd-20260906.md`
- `scope`: owned 電話叫車的無人主流程、必要例外處理、兩輪盤點指出的共用領域改造與可執行驗收。
- `execution_ref`: `docs/03-runbooks/unattended-voice-booking-execution-tasks-20260906.md`

## 採納的工程基線

以 [SA v0.2](../02-architecture/phase1-unattended-voice-booking-sa-20260906.md)、[SD v0.2](../02-architecture/phase1-unattended-voice-booking-sd-20260906.md) 及[兩輪盤點](../02-architecture/phase1-unattended-voice-booking-two-pass-audit-20260906.md) 為執行來源；原設計審查提交為 `512cbec4849fc82e309fcb9364f25bf53b0a1606`。任務工具另驗證最終來源版本已在 `origin/dev`，worker 從已合併來源建立分支。

正常電話叫車由 AI 完成接聽、核對、回讀、取得乘客確認、建單、自動派遣及真實結果播報；客服只處理例外。舊 SA §8.4 的真人接單描述，在已開通的無人電話入口範圍內由此流程增補。司機自行接單仍屬正常派車，不算客服逐筆批准。

採獨立媒體 worker 與受限業務 API；訂單及派遣仍由既有領域持有真值。依 SD §7 改造實際 runtime 表、DB 交易、快照投影及所有競爭派遣入口，不能另建一套訂單或只靠新 voice API 避免重複派車。

語音本通派遣使用 SD §8 的可取回確認錄音 checkpoint，整通錄音稍後封存；保留原始錄音及不可變索引責任。這是對已開通無人流程的證據門檻擴充，不能以 ASR 文字或尚未播放的 TTS 取代錄音，也不能清除其他電話單的既有 recording gate。

第一版背景工作採 PostgreSQL job／lease 與既有領域交易／outbox；媒體即時控制不等待 DB。此範圍內不要求先新增全平台 message bus 或 Redis。這項局部工程選擇不移除其他功能既有的 cache／message bus。

## 任務化與派工

任務、依賴、驗收與來源存於版本庫 manifest，執行狀態由正式 `ai-status.json` 擁有；`current-work.md` 及 task briefs 由既有同步機制產生。不得把本文件或聊天當作 live task board。

使用者後續指定 Codex 盡量擔任 reviewer，因此本波 owner 全部初始分派 Gemini、Gemini2（agy）與 Claude、Claude2；reviewer 初始分派 Codex／Codex2，使用 GPT-6 Astra／ULTRA。`eligible_agents` 包含六條 lane，實作與審查角色偏好在 task brief 明示。現有 runtime 沒有 per-role allowlist，不宣稱已強制隔離角色；後續 UV helper／unblock 與 fallback 也應延續 agy／Claude 主實作、Codex 主審查的偏好。

使用者同時授權 Gemini／Gemini2、Claude／Claude2 各 3 slots，Codex／Codex2 各 2；全域 total／execution 上限維持 12。這是本次受控 runtime 設定調整，與任務定義分開保存驗證紀錄。

## 仍需證據的開通門檻

- 工程可以用可重現的協定 fixture、本機 PostgreSQL 及隔離 sandbox 推進；不得把模擬通過記成正式電話品質或生產並發已驗證。
- 初次開通依 SA／SD 的普通即時電話入口實作；多元電話商品、查單／取消／改單／預約／特殊需求按能力目錄和身份授權處理。未開通能力須正確分流，不以工程派工指示自動打開營運功能。
- TWM 與 CTI 正式帳號、方言／腔調品質、雙向錄音、供應商及資料條件、電話測試授權、值班 SLA、並發 N、最終費率及試辦開通仍須取得各自證據。任務可盤點並回報缺口；不臆造帳號、承諾或同意。
- 正式 PSTN 驗證與試辦任務保留 `required_acceptance`，先作外部門檻登錄。chair 建立解除阻礙子任務，不代表原門檻已滿足；恢復執行須有對應真實證據。
- 採購、正式乘客外呼、真實營運派車及正式開通，不因本次程式執行授權而自動發生。依現有受控開通流程與已取得的測試／營運授權執行。

## 完成判定

每個工程任務依既有 candidate lifecycle 經精確 SHA 審查、正常 push、PR／CI／merge；需要實機證據的任務另經 acceptance。branch pushed、merged、deployed、live accepted 分開記錄。全入口人工介入率必須包含未開通、故障、轉接失敗及未進 AI 的來電；不能只計支持範圍的容易成功樣本。
