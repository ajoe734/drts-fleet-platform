# C073-OFFBOARDING-FINAL-EXIT-FLOW-20261015 — 正式退場閉環綁定 canonical 資格

Owner：Claude；Reviewer：Claude2。日期：2026-10-15/16 UTC。

## 1. 版本與追溯 (Version & Traceability)

- **工作分支 (Branch)**：`claude/c073-offboarding-final-exit-flow-20261015`
- **工作樹目錄 (Worktree)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-c073-offboarding-final-exit-flow-20261015`
- **基準 SHA / 候選 SHA (Base/Candidate SHA)**：`11ed91ba151b04519670d11316d5f30f1fdc0d74`（分支建立後尚未偏離，見 handoff 紀錄的 `CANDIDATE_SHA`）
- **task_spec_ref**：`.local/goal-continuation-20261015T2159-original-remaining-work-and-safe-execution-root/C073-OFFBOARDING-FINAL-EXIT-FLOW-20261015-R2.task-spec.json`
- **依賴 (Depends on)**：`SR-QA-SUPPLY-001`（原 C073 QA 驗證任務；本任務是對其 C073 覆蓋範圍的**修正**，見下方第 5 節的明確取代說明，`SR-QA-SUPPLY-001` 的其他能力 DONE 認定不受影響）

## 2. 發現的缺陷 (Finding: C073-FINAL-OFFBOARDING-NOT-BOUND-TO-CANONICAL-ELIGIBILITY)

`RegulatoryRegistryService.evaluateVehicleSupplyLifecycle()`（`apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`）原本只在 `offboarding.status` 為 `"debranding_required"`（debranding **待辦**中）時才把 `offboarding_pending_debranding` 加入 `blockedReasons`：

```ts
if (offboarding.status !== "none" && offboarding.status !== "completed") {
  blockedReasons.push("offboarding_pending_debranding");
}
```

一旦 `offboarding.status` 變成 `"completed"`（無論是 debranding 閉環完成，還是免 debranding 直接結案），這行條件就不再成立 — 退場阻擋**消失**。而本服務沒有任何路徑會把 `offboarding.status` 從非 `"none"` 重設回 `"none"`，所以「正式退場已 completed」理當是終局狀態，卻完全沒有被用來阻擋派車。只要該車輛的合約／保險／排他性仍然（或後來又）有效，`reconcileVehicleLifecycle()` 會把 `vehicle.dispatchableFlag` 重新算成 `true`，`getVehicleDispatchability()` / `getEligibleCandidates()` 都會讓一輛**已正式退場**的配對車輛重新出現在候選名單與指派流程中 — 這正是任務標題「禁止已配對退場車回候選」要堵的洞。

`apps/api/tests/unit/regulatory-registry.service.test.ts` 與 `tests/unit/system-remediation/sr-qa-supply-001/sr-qa-supply-001-registry-eligibility.test.ts` 原本就把這個錯誤行為當作「正確」斷言（例如標題「...debranding 閉環後恢復候選」、斷言 `blockedReasons` 不含 `offboarding_pending_debranding`），即 SR-QA-SUPPLY-001 對 C073 的「首次驗證通過」其實驗證的是這個 bug。本任務依 required_acceptance 第 3 條的要求，**明確**翻轉並註記這些斷言（見下方測試清單），而不是靜默刪除或弱化。

此外，`initiateVehicleOffboarding` / `completeVehicleDebranding` 的 canonical 寫入原本透過 fire-and-forget 的 `persistChanges()`（`void repo.persistChanges(changes).catch(reportPersistenceFailure)`），控制器在寫入真正落地前就回傳成功 envelope；儲存失敗只會被記錄（log-only catch），呼叫端拿不到任何失敗訊號。

## 3. 修復內容 (Fix)

- `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`
  - `evaluateVehicleSupplyLifecycle()`：條件改為 `if (offboarding.status !== "none")`，只要退場流程已經起始（不論 pending 或 completed）就持續阻擋派車；因為沒有「復原退場」的寫入路徑，`"completed"` 等同永久退場。其他 `blockedReasons`（contract/insurance/exclusivity/manual_hold）仍然是每次從目前合約/保單/排他性即時重新計算，保留原有的可逆復原語意（見第 4 節第 3 項測試）。
  - 新增 scoped 的 `persistFinalExitChangeOrThrow()`，只供 `initiateVehicleOffboarding` / `completeVehicleDebranding` 使用：`await` 真正的 `repository.persistChanges()`，失敗時仍呼叫既有的 `reportPersistenceFailure()`，但接著 `throw`，讓呼叫端收到真正的拒絕，而不是樂觀地回傳成功 envelope。未啟用 DB（noDB/測試模式）時 `repository.persistChanges()` 本身立即 resolve，行為不變。沒有動到通用的 `persistChanges()` fire-and-forget helper，其他呼叫者（driver/contract/policy 等）不受影響。
  - `initiateVehicleOffboarding` / `completeVehicleDebranding` 改為 `async`，回傳 `Promise<VehicleRegistryRecord>`。
- `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts`
  - `initiateVehicleOffboarding` / `completeVehicleDebranding` controller 方法改為 `async`，`await` service 呼叫後才包進 `toApiSuccessEnvelope`；envelope 結構與既有錯誤傳遞（`ApiRequestError` → Nest exception filter）不變。
- 未修改 `regulatory-registry.repository.ts`、`vehicle-eligibility.service.ts`、`owned-mobility.service.ts`、`packages/contracts`、`packages/api-client` — 這些都是既有「唯讀」依賴/消費者，下游行為完全是靠 service 內部修正自然傳導，不需要也沒有另外改動它們的程式碼（見第 4 節用它們做真實消費端回歸）。

## 4. 測試涵蓋與結果 (Test Coverage & Results)

### 4.1 `apps/api/tests/unit/regulatory-registry.service.test.ts`（在 `apps/api/` 下用 `vitest run tests/unit/regulatory-registry.service.test.ts`）

- 既有測試「tracks debranding work during vehicle offboarding」**重新命名並擴充**為「...and the completed final exit stays excluded from dispatch and candidates」：
  - 使用既有、已配對的 seed 車輛 `veh-demo-001`（配對 `drv-demo-001`，合約/保險/排他性皆健康），先確認 offboarding 前 `getVehicleDispatchability` 為 `true`。
  - `initiateVehicleOffboarding(debrandingRequired: true)` → pending 阻擋（既有行為，未變）。
  - `completeVehicleDebranding` 之後：**修正後**斷言 `blockedReasons` 包含 `offboarding_pending_debranding`、`dispatchableFlag` 為 `false`、`getVehicleDispatchability` 為 `false`、`getEligibleCandidates("standard_taxi")` 不含該車輛（fixed-after；修復前這四項全部相反）。
  - 註解明確說明此斷言方向與原始版本相反、理由（C073 final-exit 取代原 Source QA restoration 認定），不是靜默弱化。
- 新增「a canonical write failure during final exit rejects the caller and reports the failure」：mock `persistChanges` reject，斷言 `initiateVehicleOffboarding(...)` 的 Promise 被拒絕（`rejects.toThrow(persistError)`）且 `reportPersistenceFailure` 被以 `(persistError, "initiate_vehicle_offboarding")` 呼叫 — 驗證 throwing/awaited persistence 路徑。
- **結果**：28 passed（原 27 + 新增 1），0 failed。

### 4.2 `tests/unit/system-remediation/sr-qa-supply-001/sr-qa-supply-001-registry-eligibility.test.ts`

- 四個既有 C073 測試全部補上 `await`（service 方法現為 async）。
- 「completing debranding closes out...」**重新命名並翻轉**為「...but the vehicle stays permanently retired from dispatch and candidates」：fixed-after 斷言 `blockedReasons` 含阻擋原因、`dispatchableFlag` 為 `false`、`getVehicleDispatchability` 為 `false`；保留原有的證據保存斷言（`debrandingTicketId`、`debrandingCompletedAt`）不變。
- 「offboarding without debranding required...」**重新命名並翻轉**為「...but is still a final exit, so it remains excluded from dispatch」：涵蓋免 debranding 的第二個 final-exit 分支。
- 「completing debranding when nothing is pending is rejected...」改用 `await expect(...).rejects.toThrow()`（原本的 `expect(() => ...).toThrow()` 在方法變成 async 後不會再捕捉到 rejection）。
- 保留註解指出：此檔用的是 `provisionFromSubmission` 新建的**未配對**車輛，其在 `getEligibleCandidates` 中缺席不足以證明「已配對退場車」被擋下；真正用已配對 seed 車輛做的回歸在 §4.3。
- **結果**：9 tests in this file passed（本檔其餘 C072 測試不受影響）。

### 4.3 `tests/unit/c073-final-offboarding-eligibility-20261015/c073-final-offboarding-eligibility.test.ts`（新檔，`required_acceptance: c073-final-exit_paired-candidate-and-assignment-refusal` / `c073-final-exit_exact-candidate-validation`）

把**真實的** `RegulatoryRegistryService` 接上**真實的** `VehicleEligibilityService`（不像 `apps/api/tests/unit/vehicle-eligibility.service.test.ts` 把 `regulatoryRegistryService` 整個 mock 掉），對已配對 seed 車輛／司機驗證修復確實傳導到真正的派送指派 guard 入口點 `assertDispatchAssignmentEligible()` 與 `listEligibleSupply()`：

1. debranding-required 的 final exit：`veh-demo-001`/`drv-demo-001` 在退場前指派成功，`completeVehicleDebranding` 之後 `assertDispatchAssignmentEligible` 丟出 `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`，`listEligibleSupply("taxi_realtime")` 不再含該車輛。
2. 免 debranding 的 final exit：同一組配對，`initiateVehicleOffboarding(debrandingRequired: false)` 之後指派同樣被拒絕。
3. 暫時性 manual hold（`updateVehicleCompliance`）：`veh-demo-004`/`drv-demo-004` 被設為 `dispatchableFlag: false` 後再設回 `true`，offboarding.status 全程維持 `"none"`，指派成功 — 證明可逆的合規保留不會被本修復誤判為永久退場。

**結果**：3 passed（0 failed）。

### 4.4 `tests/unit/reporting-filing.test.ts`

- 兩處呼叫 `initiateVehicleOffboarding(...)` 加上 `await`（方法變成 async 後的語法調整，無行為變更）。月度車輛增減報表邏輯（`reporting-filing.service.ts`）是以 `offboarding.status === "completed"` 與 `effectiveAt`/`completedAt` 時間戳計算，不讀 `dispatch.eligible`，本次修復未影響其輸出。
- **結果**：原有測試全數維持通過（未新增/刪除斷言）。

### 4.5 彙總指令與結果

- `cd apps/api && pnpm vitest run tests/unit/regulatory-registry.service.test.ts` → 28 passed。
- `pnpm vitest run tests/unit/system-remediation/sr-qa-supply-001/sr-qa-supply-001-registry-eligibility.test.ts tests/unit/reporting-filing.test.ts tests/unit/c073-final-offboarding-eligibility-20261015/c073-final-offboarding-eligibility.test.ts`（repo root）→ 3 files, 45 passed。
- `cd apps/api && pnpm exec tsc -p tsconfig.json --noEmit`：371 pre-existing errors，**全部**與本任務改動檔案無關（`grep -i "offboarding|debranding|persistFinalExit|regulatory-registry.controller|c073-final-offboarding"` 零匹配）；最接近的是 `regulatory-registry.service.ts(24,3)` 既有的 `DriverDeclaredSurnameSnapshot` import 缺失（與本任務無關的既有 base drift，本任務未觸碰該 import 區塊，write_scopes 也未授權處理）。
- `pnpm exec tsc -p tsconfig.json --noEmit`（repo root，涵蓋 `tests/**`）：75 pre-existing errors，同樣對本任務四個測試檔案零匹配。
- `pnpm exec eslint apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts apps/api/tests/unit/regulatory-registry.service.test.ts tests/unit/system-remediation/sr-qa-supply-001/sr-qa-supply-001-registry-eligibility.test.ts tests/unit/reporting-filing.test.ts tests/unit/c073-final-offboarding-eligibility-20261015/c073-final-offboarding-eligibility.test.ts` → 無輸出（clean）。

### NOT COVERED（live/DB）

本沙箱沒有 Postgres（無 `DATABASE_URL`，無 docker compose），所有驗證都在 `regulatoryRegistryRepository` 未啟用（`isEnabled() === false`）的 in-memory 分支下執行；§4.1 的「canonical write failure」測試是用 mock `persistChanges` 模擬拒絕，不是打真正的資料庫。`repository.persistChanges()` 在 DB 啟用時的實際交易行為沿用既有 `regulatory-registry.repository.ts`（本任務未修改）。

## 5. 與 SR-QA-SUPPLY-001 既有文件的明確取代關係

`docs/04-uat/system-remediation-20260906/SR-QA-SUPPLY-001.md` 第 2 節把「啟動退場...恢復派車資格」與「免 debranding 的退場會直接完成，不留下阻擋標記」記錄為 C073「首次驗證通過」。那份記錄驗證的正是本任務修復的 bug。本文件**明確取代** SR-QA-SUPPLY-001.md 對 C073 最終退場排除候選行為的描述；SR-QA-SUPPLY-001 對 C072（委託合約/保險/排他性）與其他能力的 DONE 認定不受影響，且本任務未修改該檔案本身（不在 `write_scopes` 內）。

## 6. Acceptance 對照

| required_acceptance | 對應證據 |
| --- | --- |
| `c073-final-exit_canonical-ack-and-readback` | §3 `persistFinalExitChangeOrThrow`（throwing/awaited persistence）+ §4.1 canonical write failure 測試 + controller `await` |
| `c073-final-exit_paired-candidate-and-assignment-refusal` | §4.3 真實 `VehicleEligibilityService.assertDispatchAssignmentEligible` / `listEligibleSupply` 對已配對 `veh-demo-001`/`drv-demo-001` 的拒絕 |
| `c073-final-exit_temporary-recovery-and-existing-guards-preserved` | §4.3 第 3 項 manual hold 可逆測試 + §3 其他 blockedReasons 仍即時重算 |
| `c073-final-exit_exact-candidate-validation` | §4.1、§4.2、§4.3 對同一已配對車輛的 pending→complete 與無-debranding 兩個 final-exit 分支分別驗證 |
