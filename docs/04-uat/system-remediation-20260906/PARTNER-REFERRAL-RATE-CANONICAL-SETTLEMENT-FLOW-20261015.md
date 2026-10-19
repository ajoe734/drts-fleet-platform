# PARTNER-REFERRAL-RATE-CANONICAL-SETTLEMENT-FLOW-20261015

原 C103 full4 Source 修復；owner Codex2，獨立 reviewer Codex。原 Gemini/Gemini2 設計、QA 與前置已採認成果保持原作者信用；本次實作由 Codex2 完成。

Base: `79daefbf5097e0622320762d2f02fd094969e3aa`。Branch: `codex2/partner-referral-rate-canonical-settlement-flow-20261015-root-20261019`。最終完整 candidate SHA、generation、PR 與逐檔 manifest 由同次正常 immutable handoff 的 `partner-referral-original-source-evidence/delivery.json` 封存；本檔隨該 candidate 受版本控制。

Spec R5 SHA-256: `ff5f271e5988f3179f10aaab7b19aecca3b57d75437296088b6b65d6c415f347`。原四條、四 keys、十二 scopes 保留；R5 僅追加既有 artifact unit caller 的 await 適配，合計十三 scopes。

## 原完整條件

1. Close confirmed C103-F1 at the actual authorized platform referral-rates POST and list/readback: write the configured referral rule/effective-period history through the real canonical repository/schema, await enabled persistence ACK before new visible state/success audit, and restore it on normal initialization/fresh repository read. Use the original entry/independent-rate storage authority; never fix by copying seed arrays or pushing UI state into another process cache. Pending/rejected write must preserve prior authoritative/visible rates, normal retry and unrelated entry data. Deliberate noDB/demo behavior stays explicitly scoped and is not enabled-DB evidence.

2. Connect actual Billing resolveReferralRevenueShareRule/listReferralStatements/getReferralStatement and downstream partner dashboard/usage/revenue/statement readers to the SAME canonical configured rule by canonical entry identity and original applicable completion-time/effective-period semantics. Actual post-change new-period readback and calculations must match platform readback for existing percent and per_trip representations, zero/override/default/source_order/tenant boundaries; no new percent/rounding/currency/effective-date financial policy. Preserve original constants drts_pays_partner/partner_referral, quote/handoff/order attribution immutable snapshots, PD bytes/hash, already-issued statements and accepted pricing version/archive/Finance credits. Never recalculate settled/issued history merely to make rates agree. Retain the full original post-change handoff/quote/attribution/reconciliation clause and honestly distinguish this Source repair from broader/live evidence.

3. Meaningful production-path original-before/fixed-after socket-free regressions exercise actual authorized rates command/controller, enabled repository deferred/rejected/ACK state, public readback, actual Billing resolver/statement/portal caller, fresh module/repository restore and recovery. Prove configured20 percent versus former15 on the original legal controlled attribution example without any prior statement issuance; include existing per_trip/zero and effective-period boundaries at their existing units/policy, wrong realm/scope/tenant/entry/unknown/inactive/revoked denials, and all already-issued statement/snapshot invariants. Preserve original handoff/host/replay/identity/consent and tenant guards; no new role elevation, no provider or global cross-instance/Final gate. Do not amend active pricing/C080/C074/C089/Demo business logic; integrate their completed changes after true deps.

4. After genuine predecessor DONE and Root normal assignment, original proposed Gemini owner implements in isolated Source lane; independent Gemini2 reviewer evaluates same exact candidate, meaningful before/fixedafter regressions and impacted unit/typecheck/lint, mandatory exact-candidate CI and protected merge. Record four nonempty own Source keys and actual full base/candidate/evidence/UAT. This draft/audit ran no tests and approves no Source. No VM product/dev/preview/browser/E2E/PG/Docker servers, cloud/IAM/Operator. Source DONE is this canonical rate/consumer correction, not full live C103/full134/Final or wholeGoal.

## 實際修正

Platform rate POST 現在在既有 canonical partner entry JSONB 的 referralRevenueShareRules 歷史中寫入版本。真 Repository 用同一交易連線鎖定 entry，只 patch 費率欄位，等 COMMIT ACK 後才回應及記成功 audit；失敗保留舊值並可正常重試。一般 entry 更新保留資料庫現有費率歷史，避免舊 entry 快照覆蓋新設定。

Billing resolver、單期／期間清單、dashboard／usage／revenue／statement／CSV 共用該 entry 的已提交費率。依原 completedAt 有效期間（含原 inclusive until）、percent 或 per_trip minor units 與原整數 rounding 計算。零費率仍保留合法 trip。完成事件及原 completed tenant-trip SQL 讀回依 entry／partner／tenant 歸屬銜接；新週期歷史保留先前版本。enabled DB 不以私人 demo 陣列作設定 authority；明示 noDB 模式仍沿用原 seed。

原 drts_pays_partner／partner_referral、已發行 driver statement／PDF、quote／PD／order attribution、handoff／identity／consent／host／replay、tenant/source_order 與其他 financial producer members 保持。Fleet createEntry／optional reference／constructor DI hunks未修改。

## Before → fixed

| 原缺口                         | 原始實際結果                  | 固定後                                                     |
| ------------------------------ | ----------------------------- | ---------------------------------------------------------- |
| Controller 設定20，Billing仍15 | expected20/actual15           | 真 resolver20；June未發行例子 GMV150000/share30000         |
| enabled write未等ACK           | completed=true，expectedfalse | deferred COMMIT期間舊值15、無成功audit；ACK後20／單次audit |
| fresh restore遺失              | expected20/actual15           | 新 Repository/service onModuleInit及讀回20                 |

原 before: 3 collected / 3 failed，before-three.json/log。最初診斷 shell 在印報告後回0，內層 Vitest exit未單獨保存；不將該 wrapper0稱為測試通過。after-three 為 direct0 / 3pass。最終 exact-seven-after 為 direct0 / 7files / 110pass / 0fail / 0skip，其中25個本次真 producer/consumer cases，85個原有回歸。

新增案例包括拒絕COMMIT後舊狀態／audit／重試、實際BootstrapAuthGuard既有scope正反面、unknown/inactive/revoked/bank/foreign partner、effective history/per_trip123 minor/zero、fresh module、真 SQL trip＋completed event、真 portal client mapper＋Controller drained CSV、post-change實際JWT handoff、原已發行PDF bytes/hash與record、stale entry治理write保留費率。

## 驗證與證據

- `api-source-types`: 全 API Source tsc 0；僅把 workspace舊dist型別路徑投影到本WT同版 tracked source，原編譯旗標未放寬。
- `affected-root-types`: 原 root project 中五份受影響 root-unit檔及真正 imports tsc 0。兩份 API/unit不是原 root project include；擴入時發現舊 fixture diagnostics，原始log保留，沒有擴改其他case。
- `affected-lint`: 十二份實作／測試 TS檔 ESLint direct0，max-warnings=0。
- `scoped-ast-proof`: 五個production檔無非授權 changed class member；六份原fixture共314個expect matcher/assertion保留，只正規化必要await/rejected-promise適配。
- 逐檔hash／完整命令結果與raw在 `partner-referral-original-source-evidence/validated-checks-summary.json`、最終delivery／manifest；原 before及所有準備錯誤保留。

## 準備診斷與限制

完整own cases首次因 Nest root import無法收集，0 executed；改成API既有相依路徑。其後兩處fixture準備錯誤（公共方法名稱及completed-event司機未指派）、一處SQL map未識別原SQL前置空白均保留；修正外部fixture後正常110pass，不當產品新增缺陷。原default API tsc讀到環境較舊dist而失敗，raw保留；未build或改動任何dist／root config／type flags。

一次證據用Vitest設定誤用mergeConfig，include被串接，超出原七檔。發現後立即對自己的PID2741287送SIGINT，terminal130、無finalreport、零驗收信用；沒有kill其他worker。已保留wrong config/raw/process與當下socket snapshot，不推論過去有無listener。正確設定明確override include，先以list --filesOnly核恰七檔，再執行本次110pass。

所有有效功能驗證均為socketfree。SQL傳輸、object store與HTTP fetch邊界明示SIM，內部真Controller／Service／Repository SQL／transaction／JWT／portal client mapper／CSV／PDF producer未mock。真PG、browser/E2E、live provider與shared-dev deployment未於VM執行；mandatory ownCI待正常PR觸發後由Root獨立採認。這份Source不代表live C103、full134、Final或整體goal完成。

## 原四keys對映

| Key                                                                    | 實際對映                                                                                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| partner-referral-rate_canonical-write-ACK-and-fresh-readback           | before/ACK/reject/retry/fresh restore；同entry JSONB＋真SQL Repository                                                 |
| partner-referral-rate_actual-Billing-consumer-consistency              | configured20→resolver/statement30000及portal/CSV、liveSQL/event consumer                                               |
| partner-referral-rate_original-snapshots-policy-and-denial-regressions | 原85case、314assertions/production AST；effective/per_trip/zero/entry denials/handoff/issued PDF                       |
| partner-referral-rate_exact-candidate-validation                       | 新immutable SHA/normal managedhooks/trailers/plainpush/fullhandoff；mandatoryCI與protectedmerge/fourkeys由Root獨立處理 |

作者未自批、未record acceptance keys、未DONE、未部署。
