# C073-OFFBOARDING-FINAL-EXIT-FLOW-20261015 — 正式退場閉環綁定 canonical 資格

原 f86 作者：Claude／原 reviewer：Claude2（2026-10-15/16）。
本輪原任務續作：Owner Codex2／獨立 Reviewer Codex（2026-10-19 正常角色交接）。

§1–6 是原 f86 的歷史交付紀錄，保留作者與既有信用；本輪實際修正、結果與未驗邊界以 §7 為準，歷史 CI／本機錯誤不冒充新候選結果。

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

| required_acceptance                                                | 對應證據                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `c073-final-exit_canonical-ack-and-readback`                       | §3 `persistFinalExitChangeOrThrow`（throwing/awaited persistence）+ §4.1 canonical write failure 測試 + controller `await`                  |
| `c073-final-exit_paired-candidate-and-assignment-refusal`          | §4.3 真實 `VehicleEligibilityService.assertDispatchAssignmentEligible` / `listEligibleSupply` 對已配對 `veh-demo-001`/`drv-demo-001` 的拒絕 |
| `c073-final-exit_temporary-recovery-and-existing-guards-preserved` | §4.3 第 3 項 manual hold 可逆測試 + §3 其他 blockedReasons 仍即時重算                                                                       |
| `c073-final-exit_exact-candidate-validation`                       | §4.1、§4.2、§4.3 對同一已配對車輛的 pending→complete 與無-debranding 兩個 final-exit 分支分別驗證                                           |

## 7. 2026-10-19 原完整四條續作：canonical ACK 後發布

### 7.1 原候選、退修與基底

- 原 frozen candidate `f86d772bf7e4c4fcc1c1cf7ea813ad29c1be22e1`／gen `15e8a4dee19c4edba69678858407e8b4`／PR2713 保留，未 reset、amend、rebase、force 或改原作者歷史。
- 原 regular38827374483 attempt3／integration38827374690 attempt4 的成功是 f86 歷史信用；不作本輪 candidate CI 信用。
- Root 正常 full4 review request changes：`Root-C073f86-original-full4-fourkey-independent-request-changes.json` SHA256 `8f67689b8e80ac5fbcc8cc43f0665bfcfc7b24a1add61c839f2a06d700d07fac`；Root actual 兩反例 receipt SHA256 `2182641b2b84d02d30033beb5c8410d97f96c4bca2fe66f176e2a13c0768e684`。
- Fresh remote accepted dev `729375e76b49827d5a752282b93371fe6aa3fd20` + 原 f86 普通 merge `6ff9e35ffa4e3759905024fb77127c1e957eb059`。本輪 execution branch `codex2/c073-offboarding-final-exit-flow-20261015-root-20261019`，七 scopes／四 clauses／四 keys／原唯一依賴保持。
- 支持／執行證據 E：`.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/c073-original-functional-evidence/`。完整候選 SHA／PR／generation 由正常 handoff 與 E/delivery-result.json 鎖定；本輪不自行記 key 或宣告 DONE。

### 7.2 實際 production 修正

兩個真 controller 仍 await 原 service／envelope／error。Service 在獨立 vehicle clone 上計算 offboarding、dispatch 與 trace，關閉 staged event；先 await 原 repository 寫入，成功後才把這一命令的 offboarding delta 發布到 current vehicle，再依目前 contract／insurance／exclusivity／manual hold 重算資格、發布事件。失敗只丟棄 staged clone，GET／candidate／實際 assignment guard 不會先看到完成，原 pending task 仍可重試。

同車兩個 C073 命令依序處理（拒絕不毒化下一次），其他車可以獨立完成。發布只合入自己的 offboarding delta，保留等待期間 peer compliance/manual hold 欄位與較新的 updatedAt；不拿舊整列 snapshot 蓋回 current map。未改 generic repository SQL／其他 fire-and-forget writers／auth／finance／contract policy，也沒有新增 global lock、TTL、temporary producer、reason 分類或再入場命令。

原 API rejection test 保留 error/reporting assertions，另加失敗後 offboarding=none 的 canonical cache assertion，撤回舊「RAM 已改也足夠」註解。原 private-driver fixture 的單一 cast 加 unknown 中介以符合 TypeScript private 結構檢查；完整 emitted JS byte-identical，未改 drivers 物件、visibility、typeflags 或任何斷言。

### 7.3 真 before → fixed 與 checks

新增 owned `c073-canonical-publication.test.ts` 使用實際 RegistryController、RegistryService、RegistryRepository、VehicleEligibilityService；只控制外部 database query transport 的 hold/reject/retained rows，讀回使用實際 repository.loadState，不複製 SQL/business decision。

- 相同新五案例套在普通 merge 的未修 Source：**3 failed／2 passed，direct exit1**，真失敗為兩個 pending GET/完成舊值錯位及同車 completion 早於 ACK；`actual-before-publication-regression{.log,-receipt.json}`。先前 loader/事件假設錯誤不當作產品反例；本輪首次新測試的 evaluatedAt 差異亦保留為 test-fixture 初稿失敗，不混入這組真 before。
- 修正版完整受影響五檔：**78 passed／0 failed／0 skipped，direct exit0**（API registry28、原 Supply QA9、原 reporting33、paired final-exit3、新 canonical5），`final-affected-unit-complete{.log,-receipt.json}`。不將窄8、前輪45等重複加總。
- 新案例完整涵蓋 initiation pending/reject 後原健康配對 GET/候選/assignment/event 不變、transport 恢復後真 retry 成功；completion pending/reject 後 task/ticket 不變且可 retry，成功後保存 evidence 並拒絕 duplicate；同車順序／不同車獨立；peer current manual hold 不被舊 snapshot 覆蓋。
- 完整 API `tsc -p apps/api/tsconfig.json --noEmit` **direct0**；保留原 root type flags 的受影響五測試 config `affected.tsconfig.json` **direct0**；原 API private-driver cast TS2352 的初次 direct2／baseline 同 bytes 與 type-only emitted-JS 等價證據保留，並未稱產品 bug。全 repo root TSC 不由此推論。
- 受影響 Service／Controller／原 API test／三組 root tests 的 ESLint `--max-warnings=0` **direct0**。本輪只編譯 own contracts/control-plane-auth type outputs（各 direct0），無 install／全量複製 node_modules／產品 build。
- 原 f86 四檔 **250 個 assertion call AST 全保留**（89+11+50+100），新增 API rejection readback assertion1；`original-assertion-AST-preservation.json`。未刪、skip、改 timeout 或弱化原 business/negative assertions。

### 7.4 真正非退場恢復與原 authority

PRD「終止委託後下架，建立 debranding 任務」與 operational remediation 的 `contract terminated => offboarding + debranding task` 指向正式退場；它們沒有說任何已完成 debranding evidence 都等同 final exit。既有 contracts `VehicleSupplyLifecycleRecord.offboarding` 分別保存 `status` 與 `debrandingStatus`，允許 nonretired `status=none` 與已完成 work-order evidence 共存；不是新增 intent/入口。

新案例以 canonical fixture 的合法 nonretired 記錄（status none、debranding completed、ticket/completedAt）經實際 repository.loadState／service.onModuleInit hydration 讀入，原保險已過期因此真拒絕派車；經原 createInsurancePolicy→activateInsurancePolicy 恢復合法保障後，真 getVehicleDispatchability／getEligibleCandidates／VehicleEligibilityService assignment 恢復，原 completed ticket evidence 保留。這不是只有 manual-hold toggle，也不把 final status completed 重新放行；原 paired final initiate 兩分支與 contract_terminated／manual hold／insurance／exclusivity／driver/product guards、monthly removal assertions 全保留。Fixture 證明模型中既有非退場記錄的讀取／恢復相容性，不宣稱新增或實際執行了一條不存在的 temporary debranding command。

### 7.5 原四 keys／未驗邊界

| 原 key                                           | 本輪 Source／實際證據                                                                            | 未授予信用                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| canonical-ack-and-readback                       | 實際 controller pending/reject→readback/event不變→retry；原 repository seam                      | 未執行 PG／unknown COMMIT／跨所有 generic writer 原子性              |
| paired-candidate-and-assignment-refusal          | 原真健康配對三案例＋新 ACK 前後真 eligibility consumers                                          | 不借未配對車缺席、舊 CI 或 hosted/public角色                         |
| temporary-recovery-and-existing-guards-preserved | canonical nonretired completed evidence hydration→真保險恢復，原 guards／report／noDB assertions | 未新造 temporary producer／re-entry policy；不是外部實際工單資格證明 |
| exact-candidate-validation                       | 本輪 true exits／before/fixed／250 AST／own immutable handoff                                    | 新 own CI、獨立 reviewer／protected merge／keys 由正常流程另採認     |

全部是 socket-free repository checks；沒有 VM HTTP/WS/server、browser、PG、Docker、cloud/provider 操作。`onModuleInit` 在 NODE_ENV=test 不啟 reconciliation loop；可控 transport 不提供 unrelated connect/expiry 操作，其原 startup catch-up warning 保留，不算全 expiry/PG 通過。既有 generic whole-record SQL／fire-and-forget 以及外部/hosted/manual/full C073/whole-goal 邊界不變，不以新全域原子性要求充作本任務 gate。
