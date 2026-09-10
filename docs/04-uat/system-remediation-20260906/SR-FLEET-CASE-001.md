# SR-FLEET-CASE-001 — 設計缺口與執行證據

日期：2026-09-10。Owner：Codex2；Reviewer：Gemini。

## 基準與現況

- Dispatch 初始 HEAD：`396904179665a3b602d25931c4db6a2d006fb812`。
- `git fetch origin`（exit 0）後 base `origin/dev`：`e6415ede5aebc2fb280cf8f2871ee55e460a4b6e`。
- Branch：`codex2/sr-fleet-case-001`。Remote 同名 branch 不存在，`gh pr list --head codex2/sr-fleet-case-001 --state all --json number,state,headRefOid` 回傳 `[]`（exit 0）；本 task 尚無鎖定 candidate。
- `git merge --ff-only origin/dev`：exit 0，快轉至上述 base。
- Machine truth：SR-FLEET-DATA-001、SR-CONTRACT-001 均為 `done`；merge 分別為 `ea459919798953604f8e9fedebeaf4692f10e388`、`e6415ede5aebc2fb280cf8f2871ee55e460a4b6e`。對兩者執行 `git merge-base --is-ancestor <merge SHA> HEAD` 均 exit 0。
- 追溯：execution task spec、主 execution_ref、來源 findings R12 與 capabilities C067。歷史 audit 不作當前重現證據。
- 當前靜態重現：`loadCases()`（`apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts`）仍回傳 `{ rows: [], source: "fallback", connected: false }`；fleet controller 沒有 case endpoint。沒有將 fixture 資料當作真案件。
- 權威 timeline 已存在於 complaint / incident service 及 repository，Ops controller 提供同 case timeline GET；後續必須沿用該權威資料，不能另建只有 portal 可見的歷程。

## Screen requirements — 待 supervisor 補齊 canonical canvas

本次 dispatch 明定："If the canvas lacks a screen, write a screen-requirements note and STOP"。

已檢查 `Fleet Partner Portal.html`、`fleet-screens.jsx`、其餘 `fleet-*.jsx` 與 `packages/ui-tokens/src/realms.ts`。`fleet-screens.jsx` 的 `FLP_Cases`（341–371 行）只定義責任列表、SLA/status 欄位與 respond action，沒有 action 開啟後的畫面。既有 missing-scope requirements 文件只處理 error boundary，不能授權設計案件流程。

需由設計權威提供下列畫面及互動規格；此清單不指定自創版面：

1. 案件詳情：complaint / incident 識別、責任歸屬、Ops owner、API SLA 與可回覆狀態，以及返回列表方式。
2. 回覆表單：內容輸入、提交中、成功、失敗重試與重送去重的回饋；closed、其他車行、平台責任與權限不足狀態。
3. 附件：選取／上傳結果、授權回讀入口、無權限／不存在／讀取失敗；不可使用假簽章或假送達。
4. 同 case 歷程：回覆者、時間、內容及附件如何呈現，並保留 Ops owner；空歷程與讀取失敗狀態。
5. 列表整合：由 API 決定 action availability、回覆後狀態及 SLA 顯示；現有列表 tabs 的互動規格。

所有顏色與字體沿用 realm tokens 與 canonical canvas。需 supervisor 安排設計補齊；canvas 本身不在此 task write_scopes，owner 不擅自修改。

## 驗證界線與交付狀態

本次只做唯讀定位與需求文件，未修改產品程式。沒有執行 live API、建立案件／附件資源，也沒有 live resource ID。依 VM 限制未啟動產品、preview、瀏覽器測試 server 或 Docker。

未執行 API/portal typecheck、Vitest 或端到端驗收：本次未實作，不能宣稱回覆閉環、附件授權或去重已通過。`git diff --check` 的實際結果記於 commit 前驗證及 machine progress。

Candidate SHA：尚未 handoff，未建立 implementation candidate。此文件的 anchor commit SHA 由 git history 與 machine blocker 記錄；不以文件 anchor 冒充驗收候選。解除設計 blocker 後才接續實作與指定檢查。
