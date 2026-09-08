# SR-OPS-SHELL-001 — 本次恢復與阻塞證據

## 2026-09-08 16:07 UTC history-repair 重派核對

- Fresh base `origin/dev`：`c07d24e021aea847a988646427cdc534ccf4e496`；恢復前 task tip：`ffc7f4231`；受測程式 SHA：`44b40126bad2d3edba469bfa5ee586c5462a8bdd`。尚無 handoff candidate；本次 evidence anchor 不代表驗收完成。
- `git fetch origin` exit 0；`git rebase origin/dev` 及中途 continue 因重複歷史的本文件 add/add、content conflict 返回 exit 1；逐次保留較新已重播證據，最後 `GIT_EDITOR=true git rebase --continue` exit 0。只有本 evidence 文件衝突，沒有產品衝突。
- `git merge --no-edit origin/codex2/sr-ops-shell-001` exit 0；`git merge-base --is-ancestor ffc7f4231 HEAD` exit 0，保留已發布歷史以供普通 push。
- `pnpm exec vitest run tests/unit/system-remediation/sr-ops-shell-001/` exit 0：1 file、13 tests passed，354ms。
- `pnpm --filter @drts/ops-console-web typecheck` exit 0：`next typegen && tsc --noEmit` 成功。
- `git diff --check` exit 0；`git diff origin/dev HEAD -- apps/ops-console-web/app/dispatch/page.tsx apps/platform-admin-web/app/audit/page.tsx` exit 0、無差異。

最新 base 仍有 dispatch 第1230行 `/platform-admin` fallback、第4520行無 context 的 `/audit` CTA，以及 audit receiver 第164行無參數 `listAuditLogs()`。本次是原始碼核對，沒有宣稱 live popup 重現。已重讀 execution_ref、R18/R19、C048、task spec 與兩份 unblock record。history repair 明文保留產品阻塞；task spec 要求 supervisor 先授權 sender scope、重疊 writer 相依及 receiver resource-context 契約。目前 machine slice 的 write_scopes 與 depends_on 均未補入這些前置，因此不能交接為完整實作。

本次未改 UI，保留既有修補。未執行瀏覽器 1440/390px CTA、focus/reload、audit popup、payments context 或真機/live 驗收；沒有 live 資源 ID、沒有建立業務資源。單元測試 AUD-* 是測試輸入。請 supervisor 處理既有 `Q-SR-OPS-SHELL-001` planning 前置；不要再以僅修復歷史為由清除產品 blocker。

## 2026-09-08 16:03 UTC 再派工重驗

- Fresh `origin/dev` base：`3fb9b06461dc2bf92043144974eedbbc9f69d0f3`；恢復前本地／遠端 task tip：`d1034dd0d57225b1fe3ccebcc7f9de18b1b754d2`。
- 受測程式 SHA：`03f05b0a490c2bd180f8f34164991001e2a6e9bf`。本次僅追加證據；尚無 handoff candidate，因完整 acceptance 仍受下述 scope／契約阻塞。
- `git fetch origin` exit 0；`git rebase origin/dev` 初次及三次 continue exit 1，均為歷史重播的本證據文件 add/add 或 content conflict。保留已重播的較新證據，最後 `GIT_EDITOR=true git rebase --continue` exit 0；產品檔案沒有衝突。
- `git merge --no-edit origin/codex2/sr-ops-shell-001` exit 0；`git merge-base --is-ancestor d1034dd0d57225b1fe3ccebcc7f9de18b1b754d2 HEAD` exit 0，保留已發布歷史供普通 non-force push。
- `pnpm exec vitest run tests/unit/system-remediation/sr-ops-shell-001/` exit 0：1 file、13 tests passed，304ms。
- `pnpm --filter @drts/ops-console-web typecheck` exit 0：`next typegen && tsc --noEmit`，route types 產生成功。
- `git diff --check` exit 0。`git diff origin/dev HEAD -- apps/ops-console-web/app/dispatch/page.tsx apps/platform-admin-web/app/audit/page.tsx` exit 0、無差異；下列唯讀證據也適用本次 fresh base。

重新讀取 execution_ref、task spec、R18/R19、C048、planning decision 及 history repair。history repair 明文說明「Product scope/receiver-contract blockers remain」，僅修復歷史來源。最新 `ai-status.sh show SR-OPS-SHELL-001` 仍僅允許 assistant、ops-shell、task tests 與本文件，depends_on 仍為空；沒有 sender／receiver 擴 scope 授權。

目前 dispatch 第1230行仍以 `/platform-admin` 為 fallback，第4520行 CTA 仍只傳 `/audit`；platform-admin audit 第164行仍呼叫無參數 `client.listAuditLogs()`，沒有 searchParams 消費。這是原始碼核對，未冒充 live popup 404 重現。需要 supervisor 執行既有 planning record 的 sender／必要 receiver scope、重疊 writer 相依與 resource identity／URL→query 契約決策；單純再以 history-repair 已完成重派工，無法解除此產品阻塞。

既有 assistant 修補保留；本次未改 UI。未執行 live／真機／瀏覽器 1440/390px CTA hit testing、開關／焦點／reload、audit 新分頁或 payments context，沒有 live 資源 ID，也未建立業務資源。AUD-* 僅為下文列出的單元測試輸入。未宣稱 candidate review、CI、merge、deploy 或完整驗收成功。

## 2026-09-08 dispatch 重驗（PR #1775 後）

- Fresh base `origin/dev`：`3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e`；原 task tip：`e2ec3c1922824123f310aeb1023e805662a0c1e0`。
- 本次受測程式 SHA：`b87e1b2fa9aa06771b066bdb5b3c6a69859d9373`。尚無 handoff candidate；本節後續 commit 僅更新證據。
- `git fetch origin` exit 0。`git rebase origin/dev` 初次 exit 1：重播舊 implementation commit 的證據文件 add/add conflict；僅保留已重播的較新證據，`GIT_EDITOR=true git rebase --continue` exit 0。產品檔案無衝突。
- `git merge --no-edit origin/codex2/sr-ops-shell-001` exit 0，保留已發布 tip；`git merge-base --is-ancestor e2ec3c1922824123f310aeb1023e805662a0c1e0 HEAD` exit 0。可普通 non-force push。
- `pnpm exec vitest run tests/unit/system-remediation/sr-ops-shell-001/` exit 0：1 file、13 tests passed，517ms。
- `pnpm --filter @drts/ops-console-web typecheck` exit 0：`next typegen && tsc --noEmit`，route types 產生成功且 TypeScript 無錯誤。
- `git diff --check` exit 0。

### 仍需 supervisor 處理的產品前置

已讀 execution_ref、本 task spec、R18/R19、C048 及 merged history-repair 記錄。PR #1775 解決的是歷史追溯，該記錄明文保留產品 scope／receiver-contract blocker；不是 audit 功能修復或擴 scope 授權。

於上述 base 與受測 SHA 重新唯讀確認：dispatch `buildPlatformAdminHref` 第1226行的 fallback 仍是 `/platform-admin`；第4520行新分頁 CTA 仍只傳 `/audit`，沒有 resource context。platform-admin audit 第164行仍呼叫 `client.listAuditLogs()`，頁面沒有讀取 searchParams。這是目前原始碼證據，不是假稱實際瀏覽器已重現 404。

本次 `ai-status.sh show SR-OPS-SHELL-001` 的 write_scopes 仍只有 assistant、ops-shell、task tests 與本文件，depends_on 為空。請 supervisor 依 `support/unblock/SR-OPS-SHELL-001/SR-OPS-SHELL-001-UNBLOCK-PLANNING-DECISION.md` 核准 sender／必要 receiver 或 resolver scope、登錄重疊 writer 相依，並確認 audit resource ID 與 URL→query 契約。先前記錄的 complaints／incidents sender 問題亦需納入 scope 決策。未自行改動範圍外程式。

未執行 live／真機／瀏覽器 CTA hit testing、popup、焦點與 reload；沒有 live 資源 ID。下文 AUD-* 僅為單元測試資料。保留既有 UI 修補，本次未新增 UI 設計；未宣稱 R18/R19 完整驗收、CI、review、merge 或 deploy 成功。

## 前次恢復紀錄（歷史）

- Owner：Codex2；Reviewer：Codex。
- 本次 base：`c4c4a35f88907df6bf68e781059dde397c06ba03`（2026-09-08 `git fetch origin` 後的 origin/dev）。
- 已檢查程式 SHA：`6a13a1006e2d0f737b8258ec1c62403208ff0b57`。後續 evidence commit 僅更新本文件；尚未鎖定 candidate，未 handoff。
- 追溯：execution tasks 主規則、本 task spec、findings.json R18/R19、capabilities.json C048。
- 保留既有 assistant 修補，rebase 至上述 dev；再普通 merge 原遠端 task tip `415e783b3f50a7e4aada2d9c4b186f02e554256e`，保留 ancestry 以便 non-force push。merge 無內容衝突。

## 目前程式證據

以 `git show origin/dev:apps/ops-console-web/components/ops-assistant/assistant-widget.tsx` 檢查，base 第109行仍為 `closed: false`，第807行 audit fallback 仍為裸 `/audit?auditId=…`。不是以 9/6 audit SHA 推論目前狀態。

既有分支修補將首次助理預設關閉、抽出 viewport clamp 與儲存狀態函式、切換時返回鍵盤焦點，audit fallback 沿用 `ops-cross-app-links.ts`。未重新設計畫面；本次只更新證據，已讀 ops-screens-1.jsx 與 ui-tokens realm 定義。

但 R18 原始重現路徑尚未修好，不能送交完整驗收：

- `apps/ops-console-web/app/dispatch/page.tsx:1226` 的 `buildPlatformAdminHref` 仍以 `/platform-admin` 為預設；第4520行 audit pill 仍使用它，且沒有 resource context。
- `apps/ops-console-web/app/complaints/page.tsx:653` 仍提供裸 `/audit?auditId=…`。assistant 的 explicitHref 分支原樣傳遞，因此這類 receipt 仍可導至 ops 同源。
- `apps/ops-console-web/app/incidents/[incidentId]/page.tsx:663` 的 `buildCrossAppHref` 在缺少 base 環境變數時仍返回裸 route。
- 唯讀檢查 `lib/ops-cross-app-links.ts`：採用 NEXT_PUBLIC_PLATFORM_ADMIN_URL / DRTS_PLATFORM_ADMIN_URL 與 `/_apps/platform-admin` fallback；與上述各頁解析方式不一致。尚未驗證 live runtime 的 origin 設定與 proxy。

以上三頁與共用 resolver 都不在 write_scopes。請 supervisor 擴 scope 並加入重疊 writer 的必要相依，或建立明確相依的修復 task，才能完成原始 R18/C048。本 worker 未越界修改，也不以 widget fallback 測試替代原始缺陷驗收。

## 本次實際驗證

在 assigned worktree 執行：

| 指令 | 結果 |
| --- | --- |
| `git fetch origin` | exit 0 |
| `git rebase origin/dev` | exit 0，2 commits 重播成功 |
| `git merge --no-edit origin/codex2/sr-ops-shell-001` | exit 0，ort merge 成功 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-ops-shell-001/` | exit 0；1 file、13 tests passed；391ms |
| `pnpm --filter @drts/ops-console-web typecheck` | exit 0；next typegen 成功，tsc 無錯誤 |
| `git diff --check` | exit 0 |

測試涵蓋 1440×1000 / 390×844 幾何、default closed、localStorage round-trip、audit fallback 及 origin override。測試 ID `AUD-1`、`AUD-42`、`AUD-7`、`AUD-9`、`AUD/with space` 都是單元測試輸入，沒有 live 資源 ID，沒有建立或修改任何業務資源。

## 未完成驗收

- 未執行 live audit popup、payments context、真實資源追查與真機操作。
- 未執行瀏覽器 CTA hit testing、鍵盤焦點與 reload 操作；純函式測試不能證明 launcher 本身沒有遮住 CTA，也不能證明 explicit open 後的版面可操作。
- 未取得 candidate CI、review、merge 或 deploy 證據。
- 狀態應為 blocked，待 supervisor 解決 scope/dependency 後續做。不能將本文件或既有修補解讀為 task done。
