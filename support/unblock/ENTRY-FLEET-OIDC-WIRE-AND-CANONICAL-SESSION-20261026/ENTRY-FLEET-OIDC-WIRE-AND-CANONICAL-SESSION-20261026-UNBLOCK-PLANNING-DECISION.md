# Planning Decision: ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026

- Helper: `ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-PLANNING-DECISION` (`helper_kind: planning_decision`)
- Parent: `ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026`（owner Pi，reviewer Claude，status `blocked`）
- 定位：本文件是給父任務與 Supervisor 的 canonical planning artifact（規劃決策記錄），不是程式變更；不會、也不需要重新執行父任務任何驗收測試。

## 1. 決策：不存在缺失的產品/契約決策

父任務 blocked 的原因不是產品語意或契約未定義，因此不屬於 `PHASE1_OPEN_QUESTIONS.md` 的 discussion_planning open question。兩項 `required_acceptance` 狀態：

| Key                                                        | 狀態      | 依據                                                                                                                                         |
| ---------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `reviewed_existing_fleet_oidc_wire_and_canonical_issuance` | **MET**   | candidate `029380eac03e5d7cb121f30c1e4ad87cbfe8254b`，PR #3042，CI success，Codex reviewed，merge `50387a6ad8d3f4f3186d590b02bde571d062c158` |
| `same_release_legitimate_fleet_oidc_session_readback`      | **UNMET** | 需要授權真人 operator 在已部署同版 release 上執行真實 OIDC 登入並讀回 canonical session                                                      |

第二項的定義在原始 task spec 已明確：在實際部署的同一 Fleet+API release 上，
`GET /api/auth/login?partner_id=<entry>` → 真實 IdP callback → 安全 cookie `drts_session` → `GET /api/auth/session`，
並保存 redacted 的 canonical active `partner_user` 身分/session 讀回與 run/revision 證據。
缺口是一個外部/人工動作，不是程式或產品定義缺口。

以下皆**不能**頂替此項驗收：

- Deploy `40662565606`（commit `1a3fbf8bca9e607085eb0c2e670b46763331f1da`）：deploy/health 成功，但 operational 與 quote-expiry jobs 失敗；且未包含真人 OIDC 登入。
- FULL `40681440811`：成功，但以 API-key bootstrap 完成，不是真人 OIDC 登入。

依 `AGENTS.md` VM restriction，任何 worker 都不得在本 VM 啟動瀏覽器、真實 OAuth 流程或產品 dev server 來模擬此動作。

## 2. 轉送（routing）：與重複 sibling helper 合併處理

同一父任務已有 sibling helper `ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-MANUAL-UNBLOCK`
（owner Codex，reviewer Claude，PR #3132，SHA `65060c661a7467181318bfe5d292441377bf45b8`，status `blocked`）獨立得出相同結論，
診斷見同目錄 `ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-MANUAL-UNBLOCK.md`。

兩個 helper 卡在同一個 dispatch fence：`tools/development-orchestrator/control_plane/usecases/task_board_commands.py`
的 `_guard_worker_command`（約第 82-94 行）。當 `ORCH_DISPATCH_ROLE` 為 `owner`/`reviewer` 且設有 `ORCH_RUN_ID` 時，
CLI 第一個參數（task id）必須等於 `ORCH_DISPATCH_TASK_ID`，否則 `SystemExit("Dispatched worker cannot mutate a different task")`。
因此任何 helper worker（包括本 helper）都無法直接把 `resolved_parent_status`／`resolved_parent_waiting_for`／`resolved_parent_next`
寫入父任務；只有 Supervisor（不帶上述 dispatch 環境變數執行 CLI）能落地。

建議：Supervisor 對兩個 helper 的父任務落地動作**合併處理一次**，不要再分別重跑診斷。

## 3. 父任務的具體解除步驟（交易對象已修正，見本輪 reviewer reopen）

### 3.0 修正說明（為何原 3.1 的 note／assign／resume-blocked 寫入父任務是錯的）

先前版本（SHA `81ac05d34d2dcda7305f2cf092b80d77148a3bf6`）指示 Supervisor 直接對父任務執行
`note`／`assign`／`resume-blocked`，把 `resolved_parent_status=blocked` 等三個欄位寫在**父任務**上。這是錯的交易對象：

- `note <task-id> <message>`（active release `bin/ai_status.py:2211-2223`）只寫 `next`/`last_update`，不寫任何 metadata 欄位。
- `resume-blocked <task-id> <status> <message>`（`bin/ai_status.py:1991-2000`）把 `status` 限制在
  `{backlog, todo, in_progress, acceptance}`，**不接受 `blocked`**；對一個已經是 `blocked` 的父任務呼叫，程式會直接 `SystemExit`。
- 真正讀取並套用 `resolved_parent_status`／`resolved_parent_waiting_for`／`resolved_parent_next` 到父任務的程式碼，
  是 `unblock_parent_resolution_fields`（`bin/ai_status.py:1156-1194`）＋`apply_unblock_parent_resolution`（`:1201-1224`）；
  它們是從**本 helper task 自己的欄位**讀值（`resolved_parent_status` 缺省為 `todo`），然後在本 helper 透過
  `transition_after_merge`（`:717-739`）走到 `done`／`acceptance` 的那一刻，才把值寫回父任務。
- `transition_after_merge` 由 `approve`（候選不需要 CI 時）、`record-acceptance`、
  `resume-blocked ... acceptance`（merged-acceptance 路徑）或自動 `reconcile-candidate`（偵測到 merge）觸發，
  不是任何人對父任務下指令直接觸發的。
- 因此唯一可行的落地方式：在本 helper（以及 sibling helper）走到那個轉換點**之前**，先把
  `resolved_parent_status`／`resolved_parent_waiting_for`／`resolved_parent_next` 三個欄位，
  透過 `assign` 指令＋`TASK_METADATA_JSON` 環境變數，寫在**各自 helper task 自己身上**
  （`command_assign`，`bin/ai_status.py:1832-`；`owner`/`reviewer` 參數必填且須維持原值不變，
  `TASK_METADATA_JSON` 的 JSON 物件會以 `task.update(metadata)` 合併進 task record，可寫任意欄位）。

### 3.1 Supervisor（無 dispatch 環境變數，必須在本輪 approve／merge 之前完成）

對**本 helper**（`ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-PLANNING-DECISION`，
現有 `owner=Claude2`、`reviewer=Codex`，呼叫時必須原樣帶入，不可更動）：

```
TASK_METADATA_JSON='{"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Codex","resolved_parent_next":"<見下方 next 文本>"}' \
ai-status.sh assign ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-PLANNING-DECISION Claude2 Codex
```

對**sibling helper**（`ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-MANUAL-UNBLOCK`，
現有 `owner=Codex`、`reviewer=Claude`，呼叫時必須原樣帶入）執行同一組欄位
（`resolved_parent_waiting_for` 同樣填 `Codex`——因為下一步協調追蹤需要 Codex 收斂，不是父任務自己的 `reviewer` 欄位）：

```
TASK_METADATA_JSON='{"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Codex","resolved_parent_next":"<同一段文本>"}' \
ai-status.sh assign ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-MANUAL-UNBLOCK Codex Claude
```

`<next 文本>`（兩個 `assign` 指令的 `resolved_parent_next` 欄位都填這一段，內容相同）：

> Source key remains accepted: exact 029380eac03e5d7cb121f30c1e4ad87cbfe8254b / PR3042 / merge 50387a6ad8d3f4f3186d590b02bde571d062c158.
> Remaining key same_release_legitimate_fleet_oidc_session_readback is UNMET. Deploy 40662565606 on 1a3fbf8bca9e607085eb0c2e670b46763331f1da
> deployed/health succeeded; operational and quote-expiry jobs failed. FULL 40681440811 success uses API-key bootstrap, not human OIDC.
> Original unique SR-LIVE-ENTRY-001 operator must pin the actually served Fleet+API same release, use legitimate IdP account/active Fleet entry
> via GET /api/auth/login?partner_id=<entry> -> real callback -> secure drts_session -> GET /api/auth/session, and save redacted canonical
> active partner_user identity/session readback with run/revision evidence. Keep original seven-owned-order custody HOLD and source history;
> do not deploy/rerun FULL or grant wider billing scopes for this helper. Supervisor must preserve parent blocked pending these
> resources/evidence; helper disposition resolved_parent_status=blocked, resolved_parent_waiting_for=Codex.

完成上面兩個 `assign` 之後，Supervisor 用 `ai-status.sh note` 對**父任務**
（`ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026`）記錄當前診斷——這只會更新父任務的 `next`/`last_update`，
不影響上面兩個 helper 剛寫好的欄位，目的只是讓父任務在兩個 helper 真正 `done` 之前也有一份可讀的現況說明。

### 3.2 Pre-merge/approval hold（兩個 helper 都適用）

在上面兩個 `assign` 指令對應的欄位**都**經過 §3.3 的 CLI readback 確認落地之前：

- 本 helper 的 reviewer（Codex）不可 `approve` 現有或任何後續候選。
- sibling helper 的 reviewer（Claude）不可 `approve` 現有候選；PR #3132 保持非 draft，但不合併。
- 任何一方提前 approve／merge，該 helper 就會用缺省 `resolved_parent_status=todo` 完成轉換，
  誤將父任務解除為 `todo` 並重派已接受的 Source；一旦發生，不能用本章節的 `assign` 回頭補救
  （`apply_unblock_parent_resolution` 已經把父任務的 `status`/`next`/`waiting_for` 寫定），
  只能另開新的 unblock helper 處理。

### 3.3 CLI readback（Supervisor 必做，記錄在本輪 evidence）

1. `ai-status.sh show ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-PLANNING-DECISION`：
   確認 `resolved_parent_status`/`resolved_parent_waiting_for`/`resolved_parent_next` 三個欄位已出現且值正確。
2. 對 sibling helper（`...-UNBLOCK-MANUAL-UNBLOCK`）做同一讀回。
3. 兩個 helper 之後各自正常走到 `done`（由各自 reviewer 正常 `approve`／merge 觸發），
   再 `ai-status.sh show ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026`，
   確認父任務 `status=blocked`、`waiting_for=Codex`、`next` 已更新為上面的文本，而不是被重設為 `todo`。
4. 任一步驟做不到（例如仍被 dispatch fence 擋、或協調未在 approve/merge 前完成），
   記 `blocker`，`waiting_for` 指向 Codex，說明具體卡點；不要交出可合併候選、不要宣稱父任務已解除。

### 3.4 授權使用者（operator）— 不變

在目前實際部署的 shared dev 同版 release 上執行一次真實 Fleet OIDC 登入（流程見第 1 節），並保存 redacted 證據。
這是唯一能讓 `same_release_legitimate_fleet_oidc_session_readback` 轉為 MET 的動作，沒有任何 worker 可以代替完成。

## 4. PR #3132 CI 現況（僅記錄）

- head run `40806672242`：FAILURE，唯一失敗 job 為 `Dependency security`（job `123227181935`）：未列入例外的 moderate `@hono/node-server` 弱點（advisory ID `1243661`），exit 1；與該 PR 的 doc-only 變更無關。
- integration run `40806672383`：SUCCESS。

本 helper 不處理此依賴弱點例外，僅記錄現況。
