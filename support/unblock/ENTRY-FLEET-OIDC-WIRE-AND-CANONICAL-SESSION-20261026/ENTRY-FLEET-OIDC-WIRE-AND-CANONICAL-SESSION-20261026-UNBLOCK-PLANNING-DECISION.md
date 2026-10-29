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

## 3. 父任務的具體解除步驟

### 3.1 Supervisor（無 dispatch 環境變數）

使用既有 CLI 對 `ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026` 執行 `note`／`assign`／`resume-blocked`，落地：

- `resolved_parent_status=blocked`
- `resolved_parent_waiting_for=Codex`
- `resolved_parent_next`（沿用 sibling helper 準備的內容，或等效內容）：

> Source key remains accepted: exact 029380eac03e5d7cb121f30c1e4ad87cbfe8254b / PR3042 / merge 50387a6ad8d3f4f3186d590b02bde571d062c158.
> Remaining key same_release_legitimate_fleet_oidc_session_readback is UNMET. Deploy 40662565606 on 1a3fbf8bca9e607085eb0c2e670b46763331f1da
> deployed/health succeeded; operational and quote-expiry jobs failed. FULL 40681440811 success uses API-key bootstrap, not human OIDC.
> Original unique SR-LIVE-ENTRY-001 operator must pin the actually served Fleet+API same release, use legitimate IdP account/active Fleet entry
> via GET /api/auth/login?partner_id=<entry> -> real callback -> secure drts_session -> GET /api/auth/session, and save redacted canonical
> active partner_user identity/session readback with run/revision evidence. Keep original seven-owned-order custody HOLD and source history;
> do not deploy/rerun FULL or grant wider billing scopes for this helper. Supervisor must preserve parent blocked pending these
> resources/evidence; helper disposition resolved_parent_status=blocked, resolved_parent_waiting_for=Codex.

目的：避免 helper 完成後父任務被誤判回 `todo`，重派已被接受的 Source。

### 3.2 授權使用者（operator）

在目前實際部署的 shared dev 同版 release 上執行一次真實 Fleet OIDC 登入（流程見第 1 節），並保存 redacted 證據。
這是唯一能讓 `same_release_legitimate_fleet_oidc_session_readback` 轉為 MET 的動作，沒有任何 worker 可以代替完成。

## 4. PR #3132 CI 現況（僅記錄）

- head run `40806672242`：FAILURE，唯一失敗 job 為 `Dependency security`（job `123227181935`）：未列入例外的 moderate `@hono/node-server` 弱點（advisory ID `1243661`），exit 1；與該 PR 的 doc-only 變更無關。
- integration run `40806672383`：SUCCESS。

本 helper 不處理此依賴弱點例外，僅記錄現況。
