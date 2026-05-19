# Forwarder Adapter Proof Spec

狀態：formal architecture spec  
日期：2026-05-19  
任務：`FWD-SPEC-001`  
適用範圍：`WF-FWD-001`、`FWD-VERIF-001`、`FWD-LIVE-001`

## 1. 文件目的

本文件把目前 repo 內對 forwarder adapter 的三種證據來源收斂成一份正式規格：

- `docs/02-architecture/forwarder-sandbox-provider.md`
- `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md`
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`

本文件回答的不是「forwarder 功能有沒有大致存在」，而是：

- 現在 repo 真正能證明的 adapter 能力是什麼
- 哪些只是 sandbox / mock-path proof
- 哪些 live claims 仍然被外部資源阻擋
- 什麼條件下 `WF-FWD-001` 才能從 `EXTERNAL-GATED` 往前推進

## 2. 現行 machine truth

### 2.1 Workflow gate truth

- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` 將 `WF-FWD-001` 定義為「forwarded-order mirror and external-platform boundary」。
- 目前 gate read 仍是 `EXTERNAL-GATED`。
- 現階段可聲稱的是 repo 已具備 route-locking、mirror order、accept relay、status sync、manual fallback、reconciliation surface。
- 現階段不可聲稱的是 live partner sandbox pass、real webhook signature proof、live callback lifecycle proof、或 production-ready adapter readiness。

### 2.2 Adapter truth

- `packages/contracts/src/platform-codes.ts` 仍將 Grab Taiwan 標成 `forwarder_stub`。
- `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts` 明確宣告：
  - `mode: "stub"`
  - `productionStatus: "stub"`
  - `supportsInboundWebhook: true`
  - `supportsOutboundActions: true`
- `verifyWebhook()`、`accept()`、`reject()`、`complete()`、`fetchEarnings()` 目前都是 stub 行為，不構成真實平台證據。

### 2.3 Service truth

- `apps/api/src/modules/forwarder/forwarder.service.ts` 已實作 mirror-order lifecycle。
- forwarded order 以 `orderDomain=forwarded`、`dispatchSemantics=forwarder_broadcast` 運作。
- finance context 目前固定是：
  - `fareAuthority=external_platform`
  - `settlementAuthority=external_platform`
  - `driverPayoutAuthority=external_platform`
  - `localLedgerMode=shadow_only`
- 這表示 DRTS 對 forwarded 訂單的商業與結算權威仍是鏡像與對帳輔助，不是最終財務真相來源。

## 3. Proof model

本規格將 forwarder adapter proof 分成三層，三者不能混稱。

### 3.1 Layer A: sandbox harness proof

`forwarder_sandbox` 是非生產 provider harness，用於在沒有真實 partner credentials 的情況下跑完整本地 mirror lifecycle。

它能證明：

- inbound order ingest contract 可被重用
- local broadcast / candidate selection 與 adapter 分層正確
- accept relay / status sync / reconciliation API surface 存在
- `completed` 會映射為 `completed_synced`
- `fetchEarnings()` seam 已存在，可供後續 settlement integration 使用

它不能證明：

- 真實 webhook 驗章
- 真實 partner callback 順序與延遲
- 真實 rate limit / auth / credential lifecycle
- 真實 settlement payload 與 finance closure

### 3.2 Layer B: mock-path verification proof

`FWD-VERIF-001` 的結論是：repo 在目前 `HEAD` 上可以重現 module-scoped mock verification，但仍不足以做 live closeout。

目前可被視為成立的 proof：

- contracts build 可通過
- forwarder service/controller 測試可通過，覆蓋 webhook ingest、signature rejection path、idempotent replay、accept relay、sync failure、native status sync、terminal closeout、reconciliation completion
- `verifyIncomingWebhook()` 已定義 adapter health 更新與 webhook failure downgrade 行為
- `relayDriverAccept()`、`syncNativeStatus()`、`completeReconciliation()` 已把 external authority 與 local reconciliation boundary 分離

目前仍未成立的 proof：

- repo-root forwarder harness 尚有 fixture drift
- runtime orchestration 尚未把 adapter `complete()` / `fetchEarnings()` 納入真實流程
- mock adapter seam 不等於 live platform adapter proof

### 3.3 Layer C: live external-platform proof

`FWD-LIVE-001` 的結論是：截至 `2026-05-19`，live proof 只能記錄為 partial evidence snapshot，不能升格為 pass。

目前已確認的外部邊界：

- `gcloud auth print-identity-token` 在非互動環境下需要重新驗證
- 舊 staging `run.app` host 對 `/`、`/health`、`/api/health` 回 `404`
- 文件中的 `api-staging.drts.internal` 從此機器解析為 `NXDOMAIN`
- 沒有可用的 forwarder sandbox credentials、signed webhook sample、或 live forwarded task seed

因此 `WF-FWD-001` 仍必須維持 `EXTERNAL-GATED`。

## 4. Architecture contract

### 4.1 Forwarded order authority

forwarder adapter proof 必須建立在以下權威模型上：

1. DRTS 對 `mirror order`、`driver task view`、`audit trail`、`manual fallback`、`reconciliation queue` 負責。
2. external platform 對 accept 最終確認、native status、fare、settlement、driver payout 負責。
3. DRTS 不得把 forwarded flow 誤寫成 owned dispatch assignment。
4. native callback 一旦與本地假設衝突，以外部平台狀態為最終 authority。

### 4.2 Adapter capability boundary

forwarder adapter 在正式 proof 中至少要拆成五個能力面：

- inbound proof：可驗證地接收外部訂單或 callback
- action proof：accept / reject / complete 呼叫與回覆語義正確
- webhook proof：signature、timestamp window、replay denial、duplicate handling 明確
- sync proof：confirmed / lost_race / cancelled / completed 的 status mapping 正確
- finance proof：settlement / earnings mirror 只做 shadow projection，且與真正商務權威分離

目前 repo 只對前四者提供 partial repo-level surface，對第五者僅有 interface seam，尚無 runtime proof。

### 4.3 Health and reconciliation contract

proof spec 要求 adapter health 與 reconciliation 一起被閱讀，而不是分開看：

- webhook 驗證失敗：adapter health 應降級，且不得把 callback 當成有效真相
- accept relay 失敗：必須產生 `sync_failed`、queued reconciliation job、與 manual fallback signal
- native status 成功回流：才可解除 queued reconciliation 與 manual fallback
- terminal state closeout：只能在 `confirmed_by_platform`、`completed_synced`、`lost_race`、`cancelled_by_platform` 之後關閉 driver task mirror

這一層是 repo 已有的重要 proof surface，也是未來 live adapter 接入時不可退化的合約。

## 5. Non-claim rules

以下說法在本規格下都不成立：

- 「forwarder adapter passed」如果實際上只有 sandbox harness 或 mock-path tests
- 「E2E-002 passed」如果只是 graceful skip，或根本沒有 live forwarded task seed
- 「Grab Taiwan adapter ready」如果 `mode` / `productionStatus` 仍是 `stub`
- 「webhook verification complete」如果 repo 只有 stub `verifyWebhook()`，沒有真實簽章規格與 replay proof
- 「settlement mirrored」如果 runtime 仍未調用 `complete()` 或 `fetchEarnings()`

所有 closeout wording 都必須明確標出 proof layer。

## 6. Promotion requirements

`WF-FWD-001` 要從目前的 `EXTERNAL-GATED` 往前提升，至少要補齊下列條件：

1. `EXT-002-BLK-001`：正式 partner API contract authority，含 endpoint、payload、idempotency、callback schema。
2. `EXT-002-BLK-002`：sandbox credentials、network reachability、secret ownership、endpoint allowlist。
3. `EXT-002-BLK-003`：webhook signature algorithm、timestamp window、replay protection、negative samples。
4. `EXT-002-BLK-004`：至少一筆 live forwarded task seed 或真實 inbound order。
5. `EXT-002-BLK-005`：accept / reject / cancel / complete / status-sync callback lifecycle evidence。
6. `EXT-002-BLK-006`：duplicate、stale、lost-race、simultaneous accept/cancel evidence。
7. `EXT-002-BLK-007`：live no-owned-assignment proof，證明 forwarded task 不產生 owned `dispatch_assignment` 真相。
8. runtime finance follow-up：若要宣稱 settlement/earnings mirror，需補 runtime orchestration 與 shadow-ledger evidence；否則只能維持「finance seam exists, not wired end-to-end」。

## 7. Recommended implementation posture

在外部資源尚未到位前，forwarder adapter 的正確演進方向是：

- 保留 stub adapter 的可見性，不假裝 production-ready
- 用 `forwarder_sandbox` 持續穩定本地 lifecycle proof
- 以 module-scoped tests 維持 mirror / webhook / reconciliation contract 不回退
- 把 live proof 明確記錄在 sidecar evidence pack，不把環境不可達誤包裝成功能 pass
- 直到 external blockers 消除前，所有 release matrix、UAT、closeout 文件都必須沿用 `EXTERNAL-GATED` 語言

## 8. Phase 1 v3 artifact role

本文件是 `FWD-SPEC-001` 的正式 architecture artifact，作用如下：

- 作為 `WF-FWD-001` 的 proof-boundary 說明文件
- 補足 `forwarder-sandbox-provider.md` 只描述 harness、不描述 gate 的缺口
- 收斂 `FWD-VERIF-001` 的 mock verification 結論
- 收斂 `FWD-LIVE-001` 的 live evidence boundary 與 dated blocker snapshot

這不是 live partner integration closeout，也不是 production-readiness memo。

## 9. References

- `docs/02-architecture/forwarder-sandbox-provider.md`
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md` §4.4
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`
- `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md`
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
- `apps/api/src/modules/forwarder/forwarder-adapter.interface.ts`
- `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts`
- `apps/api/src/modules/forwarder/forwarder.service.ts`
- `packages/contracts/src/platform-codes.ts`
