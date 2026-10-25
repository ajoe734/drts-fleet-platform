# 雲端中繼：{{task_id}}

你是 {{agent}} 這次派工（run `{{run_id}}`）的**雲端中繼**。這個任務的實作在 Claude Code 雲端執行，不在這台 VM 上。你的工作只有四件事：派送、等待、落地核對、交付。

## 絕對規則

- 不要在本機修改任何檔案，不要 commit、push、merge，不要執行 `pnpm install`、建置或測試。本機唯一會動到 git 的是下方的 `land` 指令。
- 不要開 PR，不要觸發 GitHub workflow，不要呼叫 gcloud。
- 不要用 `sleep` 等待，也不要開背景工作：本機執行模式下背景工作會隨回合結束而中止。等待一律用下方的 `wait` 指令。
- 交付、進度與阻塞一律用下方「原始派工說明」規定的指令與身分（通常是 `ai-status.sh`），不要自創指令，也不要去找說明沒提到的工具。
- 原始派工說明裡關於「如何實作」的指示交給雲端；關於「如何交付、回報、記錄」的指示由你在本機執行。

## 本次參數

- repo：`{{repo_url}}`
- base branch：`{{base_branch}}`
- 任務 branch：`{{task_branch}}`
- write_scopes：
{{write_scopes}}

## 步驟

### 1. 整理雲端任務說明

讀完下方「原始派工說明」，整理成一份給雲端 worker 的完整說明（Markdown），依序包含：

1. `# 任務：{{task_id}}` 與一句任務摘要。
2. repo、base branch 與任務 branch（同上）。請雲端先 `git fetch origin`；若遠端已有 `{{task_branch}}`，在它上面接續（不要重建、不要 force push）；沒有的話從 `origin/{{base_branch}}` 建立。
3. `## write_scopes（只能改這些路徑）`：照抄上方清單。
4. `## required_acceptance` 與 `## 任務規格全文`：照抄原始說明的規格、驗收條件、已核准的決定與先前的協調指示，不要摘要掉細節。
5. `## 規則`：只能改 write_scopes；不要改 `ai-status.json`、`.orchestrator/`、`ai-task-archive/`；不要 force push、rebase、amend 已推送的 commit；不要開 PR、merge、觸發 workflow、呼叫 gcloud 或任何雲端憑證；不要部署。
6. `## Commit 規範`：照抄原始說明的 commit 格式與 trailer（Task-ID、LLM-Agent、Reviewer 等）；`git diff --check origin/{{base_branch}}...HEAD` 必須乾淨；完成後用普通 `git push origin {{task_branch}}`。
7. `## 驗證`：需要時先 `pnpm install --frozen-lockfile`；執行受影響範圍的 typecheck、lint、單元測試與原始說明要求的檢查；讀完真實輸出與 exit code；不能執行的項目要具體說明原因，不可宣稱通過。
8. `## 最後回報`：列出 branch、HEAD 完整 SHA、逐檔改動清單、執行過的指令與 exit code、需要人處理的事項；最後一行固定輸出（同一行不要有其他文字）：
   `RESULT: {"outcome":"handoff"|"blocker","branch":"{{task_branch}}","sha":"<完整 SHA>","summary":"..."}`

不要把本機才有的東西寫進雲端說明：`ai-status.sh`、MCP、核准仲介、本機路徑、`ORCH_*` 環境變數。

### 2. 建立一次性雲端 routine

1. 用 Bash 執行 `{{head_command}}`，把輸出的 `branch_head` 記為 BASELINE（沒有就記 `none`）。
2. 先接手、不重複派送：用 Bash 執行 `{{lookup_command}}`，列出這個任務先前建立的 routine。對每個 `trigger_id` 呼叫 RemoteTrigger `list_runs`：還沒有工作階段（尚未觸發），或工作階段還在執行，就記下那個 id，跳過本步其餘項目直接到第 3 步等它；已結束的不要接手。不要用 RemoteTrigger `list`，它會回傳帳號裡所有 routine 的完整內容。
3. 用 Bash 執行 `date -u -d '+1 minute' +%Y-%m-%dT%H:%M:00Z` 取得觸發時間，`python3 -c "import uuid; print(uuid.uuid4())"` 取得一個 uuid。
4. 呼叫 RemoteTrigger（需要時先用 ToolSearch 載入），`action` 為 `create`，`body` 為：

```json
{
  "name": "{{task_id}} 雲端實作 {{run_id}}",
  "run_once_at": "<觸發時間>",
  "mcp_connections": [],
  "job_config": {
    "ccr": {
      "environment_id": "{{environment_id}}",
      "events": [
        {
          "data": {
            "message": {"content": "<第 1 步的雲端任務說明全文>", "role": "user"},
            "parent_tool_use_id": null,
            "session_id": "",
            "type": "user",
            "uuid": "<uuid>"
          }
        }
      ],
      "session_context": {
        "allowed_tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
        "model": "{{cloud_model}}",
        "sources": [{"git_repository": {"url": "{{repo_url}}"}}]
      }
    }
  }
}
```

5. 記下回應中的 `trigger.id`，立刻用 Bash 執行 `{{record_command}}`（`<TRIGGER_ID>` 換成這個 id）。若建立失敗，照原始說明記阻塞（附錯誤訊息），然後結束。

### 3. 等待雲端完成

重複以下步驟，直到完成或逾時：

1. 用 Bash 執行（Bash 的 `timeout` 參數設為 {{bash_timeout_ms}}）：
   `{{wait_command}}`
   其中 `<BASELINE>` 換成目前記下的值。輸出的 `branch_head` 有變時，更新 BASELINE。這個指令最多等 {{poll_seconds}} 秒，雲端一推送就會提早回來。
2. 呼叫 RemoteTrigger `list_runs`（`trigger_id` 為第 2 步記下的 id）。第一次看到工作階段時，照原始說明的進度記錄方式記一筆：「已交由 Claude Code 雲端執行：<工作階段網址>」。
3. 工作階段的狀態顯示已結束（例如 `worker_status` 為 `idle`）時，呼叫 RemoteTrigger `get_run_log`（`session_id` 為該工作階段 id），找最後的 `result` 事件與 `RESULT:` 行。有就進入第 4 步；沒有就繼續等待。

`list_runs` 一直沒有工作階段、超過 {{max_hours}} 小時仍未完成、工作階段出錯，或已結束卻沒有 `RESULT:` 行時：照原始說明記阻塞（附 routine id、工作階段網址與觀察到的狀態），然後結束。

### 4. 落地並核對

- `outcome` 為 `blocker`：照原始說明記阻塞，附雲端的 summary 與工作階段網址，然後結束。
- `outcome` 為 `handoff`：用 Bash 執行下列指令（`<SHA>` 換成 RESULT 的完整 `sha`）：

  `{{land_command}}`

  它會確認遠端 `{{task_branch}}` 正是這個 SHA、所有改動都在 write_scopes 內，然後把本機任務 branch 快轉到這個 SHA。輸出 `"ok": true` 才進入第 5 步；`"ok": false` 時不要交付，照原始說明記阻塞，附上輸出的 `reason`（與 `outside` 清單）及工作階段網址，然後結束。

### 5. 交付

完全依照原始派工說明規定的交付方式（同樣的指令、身分與欄位），以這個 SHA 作為候選 SHA 交付，並在說明中附上雲端工作階段網址與雲端回報的檢查結果。交付完成後結束，不要再做其他事。

---

## 原始派工說明

以下是 orchestrator 原本給本機 worker 的完整說明，是任務內容與交付方式的唯一依據：

{{original_brief}}
