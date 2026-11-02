# DEV-DEPLOY-REVIEW-SUPPLY-ELIGIBILITY-20261101

修 deploy-dev 兩個驗收 job 共同的 review supply prepare 400。

- Owner: claude2（雲端 session）／Reviewer: Claude
- Branch: `claude2/dev-deploy-review-supply-eligibility-20261101`（base `origin/dev` @ `a2696824610f`）
- Required acceptance: `dev-deploy_review_supply_prepare_eligible`

## 依據

- 現象（task spec）：自 run 40251649137（head `d3d6ce6222`）起，`POST /api/ops/review-demo/prepare` 回 `400 VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`，`details` 無 `reason`（e2e 診斷顯示 `reason=missing-domain-reason`）。
- 程式：`apps/api/src/modules/passenger-app/review-demo/review-supply.service.ts` `prepare()`、`apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service.ts` `assertDispatchAssignmentEligible()`、`apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts` `getVehicleDispatchability()`／`evaluateVehicleSupplyLifecycle()`。

## 根因

擋下 synthetic review supply 的是 **BUREAU-R02 一車一派遣**（commit `521dbbab`，BUREAU-R02-EXCLUSIVE-OPERATOR-CHECK-20261024，#2983），不是續期（`aa1b38d9`）也不是到期提醒（`e140b9dd`）——後兩者沒有改動派遣資格判斷（`getVehicleDispatchability`、`evaluateVehicleSupplyLifecycle`、`dispatch.blockedReasons`）。

1. `521dbbab` 在 `RegulatoryRegistryService.evaluateVehicleSupplyLifecycle()` 新增：`exclusivity.lifecycleStatus === "active"` 且沒有 `exclusiveOperatorId` 時加入 `exclusivity_operator_unbound`，使 `supplyLifecycle.dispatch.eligible = false`。Migration `V0131__exclusivity_operator_binding.sql` 對既有列保留 `exclusive_operator_id = NULL`（未綁定，等待補綁）。
2. 同一 commit 雖然在 `prepare()` 新建車輛時加了 `exclusiveOperatorId: operatorId`，但那段只在**車輛不存在**時執行。shared dev 的 `pax-review-vehicle-a/b` 在 R02 之前就已經建立，它們持久化的 exclusivity record 沒有 `exclusiveOperatorId`，之後每次 prepare 都跳過重寫。
3. 結果：`VehicleEligibilityService.assertDispatchAssignmentEligible()` 呼叫 `getVehicleDispatchability(vehicleId, "standard_taxi")` 得到 `false`，丟出不帶 `reason` 的 `400 VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`（`details = { vehicleId, serviceProduct }`），與 shared dev 觀察到的完全一致。

單元測試以真正的 `RegulatoryRegistryService` + `VehicleEligibilityService` 重現（只替換持久層），並斷言車輛的 `supplyLifecycle.dispatch.blockedReasons` 正是 `["exclusivity_operator_unbound"]`。

## 修正

### 1. synthetic supply 補齊 operator 綁定（`review-supply.service.ts`）

`prepare()` 對每個 `REVIEW_SUPPLY` 車輛：如果車輛已經存在，且它持久化的 exclusivity record（`repository.loadState()` 的 `state.exclusivities`）沒有 `exclusiveOperatorId`，就呼叫 `RegulatoryRegistryRepository.persistChanges({ exclusivities: [{ ...existing, exclusiveOperatorId: "review-synthetic-operator", updatedAt: now }] })`。之後既有的 `registry.prepareDispatchSupply("standard_taxi")` 會從 DB 重新載入這些車輛的 exclusivity，生命週期就會恢復為可派遣。

- 正式派車資格檢查沒有放寬也沒有跳過：`assertDispatchAssignmentEligible` 仍照常執行，未綁定的 exclusivity 仍然會被擋（有測試保護）。
- 只動兩台 synthetic 車輛的 exclusivity；`veh-demo-001` 等其他業者的資料不寫（有測試斷言）。
- 已經綁定任何 operator 的 declaration 不會被改綁（有測試斷言）。
- 冪等：第二次 prepare 不會再寫 exclusivity、authorization 或 authorized vehicle（有測試斷言）。訂單、指派與進行中的指令都不碰。
- `review-synthetic-operator` 和 synthetic contract 的 `partnerId`、新建車輛的 `exclusiveOperatorId`、fleet partner 的 `multiTaxiOperatorIds` 是同一個 operator。

### 2. 400 帶公開 reason（`vehicle-eligibility.service.ts`）

`assertDispatchAssignmentEligible()` 中 registry dispatchability 拒絕的分支，現在 `details` 帶 `reason`，只會是既有公開分類之一：

- `inactive`：車輛自身的供給生命週期不可派遣（契約、保險、exclusivity、退場、人工暫停等任一阻擋）。
- `unsupported_product`：車輛生命週期可派遣，但不支援此產品的 service bucket。

判斷方式是新的私有方法 `classifyDispatchabilityRefusal()`，它不帶 bucket 再查一次 `getVehicleDispatchability(vehicleId)`。內部的 `blockedReasons`（例如 `exclusivity_operator_unbound`）不會出現在回應中。以後這類 400 不會再被 e2e 診斷分類為 `missing-domain-reason`。

## 驗證（雲端 session，repository 層級）

| 指令（cwd）                                                                                                                                                             | exit                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`（repo root）                                                                                                                           | 0                                                                                                                                                                            |
| `pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build`（typecheck 前置）                                                                 | 0                                                                                                                                                                            |
| 修正前（`git stash` 兩個 src 檔）：`npx vitest run tests/unit/review-supply-prepare-eligibility.test.ts`（apps/api）                                                    | 1 — 6/6 failed（紅；prepare 拋出 `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`，details `{ vehicleId: "pax-review-vehicle-a", serviceProduct: "taxi_reservation" }` 無 reason） |
| 修正後：同上                                                                                                                                                            | 0 — 6/6 passed（綠）                                                                                                                                                         |
| `npx vitest run tests/unit`（apps/api，含既有 vehicle-eligibility、runtime-eligibility-evaluator、owned-mobility、passenger-trial-trip 等）                             | 0 — 136 files passed／3 skipped；1524 tests passed／11 skipped                                                                                                               |
| `npx vitest run tests/integration/int-elig-001-dispatch-candidate-eligibility.test.ts tests/integration/int-elig-002-assignment-recheck.test.ts`（apps/api，in-memory） | 0 — 2/2 passed                                                                                                                                                               |
| `npx tsc -p tsconfig.json --noEmit`（apps/api，= `pnpm typecheck`）                                                                                                     | 0                                                                                                                                                                            |
| `pnpm lint`（apps/api，`eslint src --max-warnings=0`）                                                                                                                  | 0                                                                                                                                                                            |
| `npx eslint tests/unit/review-supply-prepare-eligibility.test.ts --max-warnings=0`                                                                                      | 0                                                                                                                                                                            |
| `npx prettier --check`（三個變更檔）                                                                                                                                    | 0                                                                                                                                                                            |

新測試 `apps/api/tests/unit/review-supply-prepare-eligibility.test.ts`：

1. 已存在的 synthetic exclusivity 綁定到 synthetic operator，並通過正常派車資格檢查；只寫 synthetic 車輛。
2. 第二次 prepare 不會再寫 exclusivity 或 authorization（冪等）。
3. 已經綁定其他 operator 的 declaration 不會被改綁。
4. 正常資格檢查保留：未綁定的 exclusivity 仍回 400，`details.reason = "inactive"`，根因是 `exclusivity_operator_unbound`。
5. 生命週期阻擋時，reason 分類為 `inactive`。
6. 不支援的 service bucket 時，reason 分類為 `unsupported_product`。

依 VM／雲端限制，本 session 沒有啟動 server、DB、瀏覽器或 Docker。

## deploy-dev 驗收證據（本機端補記，2026-11-02）

PR #3176 已合併（squash）為 `origin/dev` HEAD `ebe5172c3ec9a20f2935025fd7dac0375965d67a`（`git merge-base --is-ancestor` 已驗證此 commit 是以下三次 run 的 head SHA 的祖先，修正確實包含在每次部署中）。

| run（databaseId / event / 時間）                                                                                            | head SHA   | Candidate SHA operational acceptance                                                                      | Candidate SHA quote-expiry acceptance                                                                     | 備註 |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---- |
| [41420751837](https://github.com/ajoe734/drts-fleet-platform/actions/runs/41420751837)（workflow_dispatch, 2026-11-02 09:27Z） | `89f0c6d4` | failure — 卡在 `A Ops assign then reassign while Passenger offline`（`data-ops-task-id` locator 30s timeout） | success                                                                                                       | prepare／訂車步驟皆 passed；失敗點是 Ops console 派遣 UI 的 e2e flake，與本 task 的 `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT` 無關 |
| [41428807349](https://github.com/ajoe734/drts-fleet-platform/actions/runs/41428807349)（push, 2026-11-02 10:26Z）              | `89f0c6d4` | failure — 卡在 `A Ops create dispatch` 收尾斷言（`data-drt-operation=ops-dispatch-create` toHaveCount(0) 收到 1，30s timeout 殘留 DOM） | success                                                                                                       | 建立 dispatch 本身已 passed，才在收尾斷言失敗；仍是 Ops console UI 的殘留元素 flake |
| [41432666557](https://github.com/ajoe734/drts-fleet-platform/actions/runs/41432666557)（workflow_dispatch, 2026-11-02 10:55Z） | `a8fcc02dc8` | [success](https://github.com/ajoe734/drts-fleet-platform/actions/runs/41432666557/job/125242781323)         | [success](https://github.com/ajoe734/drts-fleet-platform/actions/runs/41432666557/job/125242781084)         | 兩個驗收 job 全部通過；`Deploy outcome` job 亦 success |

- 三次 run 的 `Ops prepare real persisted rehearsal supply`、`A Passenger book` 步驟皆 passed，代表本 task 修正的 review-demo prepare 資格判斷在實際部署環境穩定生效，三次皆未再出現 `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`。
- 前兩次 run 的 operational job failure 是 Ops console 派遣 UI 的 e2e 時序/殘留元素 flake（兩次失敗點不同，皆與本 task write_scopes `review-demo/`、`vehicle-eligibility/` 無關），第三次 run 兩個 job 皆通過，確認該 flake 並非本修正造成且非持續性阻擋。
- 同一 candidate SHA（`6022d6b5db2095a9977540e2bd7358d9efa494af`）CI 於 PR #3176 通過（[run 41365541413](https://github.com/ajoe734/drts-fleet-platform/actions/runs/41365541413)），並由獨立 reviewer `Claude` 審查通過後合併。
