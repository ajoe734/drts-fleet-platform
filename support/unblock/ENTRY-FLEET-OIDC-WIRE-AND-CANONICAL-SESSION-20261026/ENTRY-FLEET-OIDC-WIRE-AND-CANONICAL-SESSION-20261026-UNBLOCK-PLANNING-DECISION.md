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

## 2. 轉送（routing）：sibling helper 已完成，父任務已正確解除

同一父任務的 sibling helper `ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-MANUAL-UNBLOCK`
（owner Codex，reviewer Claude，PR #3132）獨立得出相同結論，診斷見同目錄
`ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-MANUAL-UNBLOCK.md`。該 helper 現已完成：

| 項目                      | 值                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| 舊候選（PR #3132 第一輪） | `65060c661a7467181318bfe5d292441377bf45b8`（generation `177931122a47443a972cd5d6f3cfa088`）              |
| 最終候選                  | `d090d5efb7266b1a3a81963dd95cf7c94635119b`（generation `f6ada550d9bb4a21ae41f4d4492f484e`，同 PR #3132） |
| approve                   | reviewer Claude，`2026-10-29T13:58:04Z`，對 `d090d5efb7266b1a3a81963dd95cf7c94635119b`                   |
| merge SHA                 | `fd762b66565e92b8501238aafb36e35b72a46095`                                                               |
| sibling helper `status`   | `done`                                                                                                   |
| `resolved_parent_at`      | `2026-10-29T14:02:22Z`                                                                                   |

父任務 `ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026` 讀回為 `status=blocked`、`waiting_for=Pi`，
`last_update=2026-10-29T14:02:22Z`——與 sibling helper 的 `resolved_parent_at` 是完全相同的時間戳，`next` 也與 sibling helper 的
`resolved_parent_next` 逐字一致（見 §3.1）。這證明 sibling helper 走到 `done` 時，`transition_after_merge` →
`apply_unblock_parent_resolution` 已成功把 sibling helper 自己身上的 `resolved_parent_*` 三個欄位套用到父任務；
父任務的解除交易**已經完成**，套用值為 `waiting_for=Pi`。

**過時說明（保留歷史）**：先前版本（SHA `04ffaf442b41bcf1e0b16c05f4b29f4822250633` 及更早）本節寫「兩個 helper 卡在同一個 dispatch fence、
尚未落地，建議 Supervisor 合併處理一次」。dispatch fence 本身的描述仍正確——`tools/development-orchestrator/control_plane/usecases/task_board_commands.py`
的 `_guard_worker_command`（約第 82-94 行）在 `ORCH_DISPATCH_ROLE` 為 `owner`/`reviewer` 且設有 `ORCH_RUN_ID` 時，
要求 CLI 第一個參數（task id）等於 `ORCH_DISPATCH_TASK_ID`，否則 `SystemExit("Dispatched worker cannot mutate a different task")`，
因此 helper worker 仍無法直接寫父任務——但「尚未落地」的結論已經過時：sibling 那一半已透過 Supervisor 在 sibling 自己身上寫欄位、
再由 sibling 的 `done` 轉換落地成功。剩下的只有本 helper 自己走到 `done`（見 §3.2）。

## 3. 父任務解除的落地狀態與剩餘步驟

### 3.0 落地方式與欄位值修正

`note`／`resume-blocked` 不能用來寫父任務的 `resolved_parent_*`（`note` 只寫 `next`/`last_update`；`resume-blocked` 的 `status`
限制在 `{backlog, todo, in_progress, acceptance}`，不接受 `blocked`）。真正套用的路徑是 helper 自己身上的欄位，經
`unblock_parent_resolution_fields`（`bin/ai_status.py:1156-1194`）＋`apply_unblock_parent_resolution`（`:1201-1224`），
在 helper 透過 `transition_after_merge`（`:717-739`）走到 `done`／`acceptance` 時寫回父任務（`resolved_parent_status` 缺省為 `todo`）。
先前版本 SHA `81ac05d34d2dcda7305f2cf092b80d77148a3bf6` 曾指示直接對父任務執行 `note`／`assign`／`resume-blocked`，交易對象錯誤，已於前一版修正。

Supervisor（非 dispatch context，不帶 `ORCH_DISPATCH_ROLE`/`ORCH_RUN_ID`）已經以 `assign` ＋ `TASK_METADATA_JSON`，
在**本 helper 自己身上**（`owner=Claude2`、`reviewer=Codex` 原樣帶入）寫入：

- `resolved_parent_status = "blocked"`
- `resolved_parent_waiting_for = "Pi"`
- `resolved_parent_next = <§3.1 的 next 文本>`

sibling helper 自己身上也已用同一方式寫入同一組值，並已透過其 `done` 轉換套用到父任務（§2）。

**欄位值修正（保留歷史）**：先前版本 SHA `81ac05d34d2dcda7305f2cf092b80d77148a3bf6` 與 `04ffaf442b41bcf1e0b16c05f4b29f4822250633`
的 §3.1 曾指示兩個 `assign` 都寫 `resolved_parent_waiting_for="Codex"`，next 文本草稿結尾也寫 `resolved_parent_waiting_for=Codex`。
這是舊假設；sibling helper 真實完成時使用、並已成功套用到父任務的真實值是 `"Pi"`（父任務 owner）。舊草稿的 `assign` 指令與 next 文本
不再適用，本節之後**不再要求任何人改寫這三個欄位**，也不要求本 helper 或 sibling helper 在 dispatch 環境下直接寫父任務
（那條路徑本來就被 §2 的 fence 擋住）。

### 3.1 CLI readback 證據（三者逐字一致）

以下為 Supervisor 在本輪 dispatch 之前以 `ai-status.sh show` 讀回的值：

1. `ai-status.sh show ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-PLANNING-DECISION`（本 helper）：

   ```
   status                      = "in_progress"   (owner Claude2, reviewer Codex，尚未送出審查)
   resolved_parent_status      = "blocked"
   resolved_parent_waiting_for = "Pi"
   resolved_parent_next        = <下方 next 文本>
   ```

2. `ai-status.sh show ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-MANUAL-UNBLOCK`（sibling helper）：

   ```
   status                      = "done"
   candidate                   = d090d5efb7266b1a3a81963dd95cf7c94635119b (generation f6ada550d9bb4a21ae41f4d4492f484e, PR #3132)
   approved                    = Claude @ 2026-10-29T13:58:04Z
   merge                       = fd762b66565e92b8501238aafb36e35b72a46095
   resolved_parent_status      = "blocked"
   resolved_parent_waiting_for = "Pi"
   resolved_parent_next        = <下方 next 文本>
   resolved_parent_at          = "2026-10-29T14:02:22Z"
   ```

3. `ai-status.sh show ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026`（父任務）：

   ```
   status      = "blocked"
   waiting_for = "Pi"
   last_update = "2026-10-29T14:02:22Z"   (= sibling resolved_parent_at)
   next        = <下方 next 文本>
   ```

next 文本（父任務目前 `next`；sibling helper 與本 helper 的 `resolved_parent_next` 逐字相同）：

> Source1/2 accepted exact029/gen051e9: actualRoot87PASS/Fleettsc/lint/diff0 and truecanonicalkeyf15red→029green; ownregular40271136478 SUCCESS17/3 + ownintegration40271136486 SUCCESS22/9; protectedPR3042→50387a6ad8d3f4f3186d590b02bde571d062c158 all5 Source modes/types/blobs exact/outside0. Proof Root-Fleet029-own-two-CI-success-protected503-and-Source-key-only-20261026.json SHA1c3cf1b2a458c30ee51195a34711edb431c7c1fdf050f2d63053489b34411403. No authorcode work remains; do not redo acceptedSource. Secondkey only originaluniqueoperator same-release legitimateFleetOIDC callback→securecookie→canonicalselfreadback pending. Newmergeddev503 combinedCI mustitselfgreen before oneoriginalNightly/autoCloudRun batch; olddev768CI not substitute. ExistingfullFleetdata billing policy separateparentroleinventory, no blindgrant/newgate/realOAuth orPG claim. Parent4keys/Final108-2/alloriginalscope/R12ten-threeformats/GUXfull/productionHOLD preserved.

### 3.2 Pre-merge/approval hold：已解除

先前版本要求「兩個 helper 的欄位都經 CLI readback 確認落地前，任何 reviewer 不可 approve」，以免 helper 用缺省
`resolved_parent_status=todo` 完成轉換、誤將父任務解除為 `todo`。§3.1 的 readback 已確認本 helper、sibling helper、父任務三者的值一致，
此 hold 已解除：

- sibling helper 已正常 approve／merge 並 `done`，hold 對其已無適用對象。
- 本 helper 的 reviewer（Codex）現在可以對本 helper 目前（或本次更新後的新）候選正常 `approve`，不需要等待任何額外的 Supervisor 動作。
- 提醒：本 helper 走到 `done` 時，`transition_after_merge` 會再把同一組欄位（`blocked`／`Pi`／同一 next 文本）套用到父任務一次；
  因值已與父任務現狀一致，此套用是冪等的，預期不會改變父任務現狀，也不會誤導回 `todo`。reviewer 可在 approve 前再執行一次
  `ai-status.sh show ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026`，確認父任務仍為 `status=blocked`、`waiting_for=Pi`、
  `next` 未被其他並行動作改掉；若已被改動，記 `blocker` 並說明差異，不要 approve。

### 3.3 授權使用者（operator）— 不變

在目前實際部署的 shared dev 同版 release 上執行一次真實 Fleet OIDC 登入（流程見第 1 節），並保存 redacted 證據。
這是唯一能讓 `same_release_legitimate_fleet_oidc_session_readback` 轉為 MET 的動作，沒有任何 worker 可以代替完成。
目前父任務 `waiting_for=Pi`，Pi 是父任務的 owner；下一步協調授權使用者執行真人 OIDC 登入，由父任務 owner（Pi）線路接手，
不是本 helper 或 sibling helper 的範圍。

## 4. PR #3132 CI 現況（僅記錄）

- head run `40806672242`：FAILURE，唯一失敗 job 為 `Dependency security`（job `123227181935`）：未列入例外的 moderate `@hono/node-server` 弱點（advisory ID `1243661`），exit 1；與該 PR 的 doc-only 變更無關。
- integration run `40806672383`：SUCCESS。

本 helper 不處理此依賴弱點例外，僅記錄現況。
