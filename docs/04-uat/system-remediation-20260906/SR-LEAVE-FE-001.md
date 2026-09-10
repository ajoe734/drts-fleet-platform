# SR-LEAVE-FE-001 — 畫面需求與阻塞證據

## 2026-09-10 狀態

Owner: Codex2；Reviewer: Gemini。尚未實作，沒有可 handoff 的產品 candidate。

- Dispatch 起始 HEAD：`396904179665a3b602d25931c4db6a2d006fb812`。
- 本次 fetch 的 origin/dev / 實作基準：`e6415ede5aebc2fb280cf8f2871ee55e460a4b6e`。
- 在指定 isolated worktree、`codex2/sr-leave-fe-001` 分支執行 `git merge --ff-only origin/dev`，exit 0。
- SR-CONTRACT-001 已 done，candidate `0d0848fd8c48c7897e4f00d6965febadf5d69337`，PR #1872，merge SHA 即上述 base；dispatch 的未完成相依描述已過時。
- 追溯：execution task SR-LEAVE-FE-001、source/new-gaps.json N01、source/capabilities.json C052、feature-contracts.md §2。

## 阻塞：權威畫布未提供請假畫面

本次 dispatch 明定："If the canvas lacks a screen, write a screen-requirements note and STOP — never substitute your own design."

已檢查 `docs/05-ui/drts-design-canvas/Driver App.html`、`Ops Console.html` 與兩端 screens JSX。`driver-screens-3.jsx` 的 `DRV_Shift` 是上下班／里程畫面；`ops-screens-3.jsx` 的 `OC_Attendance` 是班次甘特與出勤列表。現有審批畫面不是請假申請與主管請假審核的視覺契約。未找到請假專用畫面或狀態版型。

`feature-contracts.md` §2 與已合併 typed client 定義行為及 API，不能取代 dispatch 指定的視覺真值。已讀 `packages/ui-tokens/src/realms.ts`，後續需使用 driver / ops realm tokens；本次未自創色彩或 UI。

## 請 supervisor 協調設計來源補齊

請在權威 canvas 補上畫面並提供可追溯 screen ID / commit；canvas 不在本 task write_scopes，需由 supervisor 指派有 scope 的設計任務及必要相依。

1. 司機：自身假單列表與分頁、假別／起迄時間／原因申請表、待審撤回與結果回饋。設計需明定日期／時間輸入、時區呈現、錯誤位置及確認互動。
2. 主管：轄下司機假單列表、篩選與分頁、假單詳情、核准／駁回、審核備註、受影響班次 ID 的呈現。依既有 tenant boundary 分開主管與司機操作。
3. 狀態：pending / approved / rejected / withdrawn；載入、空態、錯誤、重試、送出中、權限不足與狀態衝突。終態不得保留待審操作。
4. 日期：endTime > startTime，startTime 不得早於 now 減 15 分鐘；重疊假單等伺服器錯誤需可呈現。對齊已核定契約，不另訂業務規則。
5. 行動版：iOS / Android 鍵盤展開、焦點順序、錯誤後焦點、安全區、底部操作可見範例；共享導航仍由 SR-WIRE-001 實作。

後續接線使用 `createDriverLeave`、`listDriverLeaves` / `listDriverLeavesEnvelope`、`withdrawDriverLeave`、`reviewDriverLeave`，不得以 fixture 宣稱整合完成。

## 已執行檢查與限制

- `git fetch origin`：exit 0。
- `git ls-remote --heads origin codex2/sr-leave-fe-001`：exit 0，開始時無已發布 task branch。
- `gh pr list --head codex2/sr-leave-fe-001 --state all --json number,state,headRefOid,url`：exit 0，`[]`，開始時無 PR / candidate。
- `rg -n -i '請假|driver.?leave|leave.?request' docs/05-ui/drts-design-canvas`：exit 1，無相符項。
- `git ls-tree -r --name-only origin/dev -- apps/driver-app/components/leave apps/driver-app/app/leave.tsx apps/ops-console-web/app/leave`：exit 0，無檔案；目前 base 尚無目標請假 UI。
- `git diff --check`：提交前執行並記錄於 machine progress。
- 未執行兩端 typecheck 與 task Vitest：依畫布缺漏 STOP，本次僅需求筆記，未建立 UI / 測試。沒有宣稱測試通過。
- 未執行 live API、瀏覽器、iOS / Android 真機驗收；VM 禁止啟動產品／preview server。沒有實際 leaveId、requestId、shiftId；未捏造資源 ID。
- 本筆記 anchor SHA 由 git 與 machine blocker 記錄；不是產品 candidate，未進行 handoff、review、CI 或 merge 完成宣告。
